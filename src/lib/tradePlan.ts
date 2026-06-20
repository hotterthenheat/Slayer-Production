/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKY'S VISION TRADE PLAN
 * -----------------------
 * Turns the raw signal stack (dealer GEX/flip/walls, regime, expected move,
 * calibrated win-rate, dealer-flow momentum) into an actionable, structured 0DTE
 * plan — Direction / Confidence / Target Strike / Entry Zone / Stop / TP1 / TP2 /
 * Expected Hold / Dealer Flow / Flow Confirmation / Regime / Win Rate — instead of
 * a bare "bullish = buy calls".
 *
 * Targets and stops are anchored to structure (gamma flip, call/put walls) and to
 * the remaining expected move (1σ to the close); the directional score is a
 * transparent weighted blend so every number is explainable.
 */

export interface TradePlan {
  ticker: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;        // 0..100
  contract: string;          // e.g. "7650C"
  targetStrike: number;
  isCall: boolean;
  entryZone: [number, number];
  stop: number;
  tp1: number;
  tp2: number;
  expectedHoldMin: number;
  dealerFlow: string;        // "Positive Gamma" | "Negative Gamma"
  flowConfirmation: boolean;
  trendRegime: string;
  winRate: number;           // 0..100 (calibrated posterior)
  directionalScore: number;  // -1..1 (transparency)
  rationale: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Map an internal regime code to a readable day-type/regime label. */
export function regimeLabel(state?: string): string {
  switch ((state || '').toUpperCase()) {
    case 'TREND_EXPANSION': return 'Expansion';
    case 'TAIL_RISK': return 'Volatility Expansion';
    case 'MEAN_REVERSION': return 'Mean Reversion';
    case 'BALANCED': return 'Balanced';
    default: return state ? state.replace(/_/g, ' ') : 'Balanced';
  }
}

export function buildTradePlan(params: {
  ticker: string;
  spot: number;
  step: number;            // strike spacing
  atmIv: number;
  netGex: number;
  gammaFlip: number;
  callWall: number;
  putWall: number;
  emPts: number;           // ±1σ expected move to the close, in points
  regimeState: string;
  winRate: number;         // 0..100
  momentumBias: number;    // -1..1 directional lean (regime / migration / hurst)
  hoursToClose: number;
}): TradePlan {
  const { ticker, spot, step, atmIv, netGex, gammaFlip, callWall, putWall, emPts, regimeState, winRate, momentumBias, hoursToClose } = params;
  const em = emPts > 0 ? emPts : Math.max(spot * 0.0005, spot * atmIv * 0.02);

  // --- Direction: blend momentum lean with position vs the gamma flip ------
  const flipBias = gammaFlip > 0 ? Math.tanh((spot - gammaFlip) / em) : 0;
  const directionalScore = clamp(0.6 * clamp(momentumBias, -1, 1) + 0.4 * flipBias, -1, 1);
  const direction: TradePlan['direction'] =
    directionalScore > 0.15 ? 'BULLISH' : directionalScore < -0.15 ? 'BEARISH' : 'NEUTRAL';
  const isCall = direction !== 'BEARISH';
  const dir = direction === 'BEARISH' ? -1 : 1; // NEUTRAL defaults to a long-bias plan

  // --- Structure-anchored targets & stop ----------------------------------
  // Walls cap the realistic target on each side; otherwise use EM multiples.
  let tp1: number, tp2: number, stop: number;
  if (dir > 0) {
    const wallCap = callWall > spot ? callWall : spot + 1.5 * em;
    tp1 = Math.min(wallCap, spot + 0.5 * em);
    tp2 = Math.min(wallCap, spot + 1.0 * em);
    if (tp2 <= tp1) tp2 = tp1 + 0.5 * em; // keep TP2 strictly beyond TP1
    stop = spot - 0.5 * em;
  } else {
    const wallCap = putWall < spot ? putWall : spot - 1.5 * em;
    tp1 = Math.max(wallCap, spot - 0.5 * em);
    tp2 = Math.max(wallCap, spot - 1.0 * em);
    if (tp2 >= tp1) tp2 = tp1 - 0.5 * em;
    stop = spot + 0.5 * em;
  }

  const entryHalf = Math.max(step * 0.15, 0.1 * em);
  const entryZone: [number, number] = [spot - entryHalf, spot + entryHalf];

  // Keep targets strictly OUTSIDE the entry zone and ordered, even when a wall
  // sits unusually close (a wall capping TP1 inside the entry would read as a
  // broken plan). The minimum useful step is one strike or ~15% of the EM.
  const minStep = Math.max(step, 0.15 * em);
  if (dir > 0) {
    tp1 = Math.max(tp1, entryZone[1] + minStep * 0.5);
    tp2 = Math.max(tp2, tp1 + minStep);
  } else {
    tp1 = Math.min(tp1, entryZone[0] - minStep * 0.5);
    tp2 = Math.min(tp2, tp1 - minStep);
  }

  // Target strike: one step OTM in the trade direction (typical 0DTE selection).
  const atmStrike = roundTo(spot, step);
  const targetStrike = isCall ? atmStrike + step : atmStrike - step;

  // --- Confidence: directional clarity + calibrated win-rate + regime ------
  const regimeClarityBonus = /EXPANSION|TREND/.test((regimeState || '').toUpperCase()) ? 8 : /TAIL/.test((regimeState || '').toUpperCase()) ? -6 : 0;
  const confidence = Math.round(clamp(
    40 + 45 * Math.abs(directionalScore) + 0.18 * (winRate - 50) + regimeClarityBonus,
    5, 97,
  ));

  // --- Expected hold: diffusion time to TP1, modulated by regime speed -----
  const distToTp1 = Math.abs(tp1 - spot);
  const regimeSpeed = /EXPANSION|TAIL/.test((regimeState || '').toUpperCase()) ? 1.5 : /MEAN_REVERSION/.test((regimeState || '').toUpperCase()) ? 0.7 : 1.0;
  // Random-walk reach time ≈ (d/σ)²·horizon; em is 1σ over the whole horizon.
  const reachFrac = em > 0 ? Math.pow(distToTp1 / em, 2) : 1;
  const expectedHoldMin = Math.round(clamp(reachFrac * hoursToClose * 60 / regimeSpeed, 3, Math.max(5, hoursToClose * 60)));

  // --- Dealer flow + confirmation -----------------------------------------
  const dealerFlow = netGex >= 0 ? 'Positive Gamma' : 'Negative Gamma';
  const flowConfirmation = Math.sign(momentumBias) === Math.sign(directionalScore) && Math.abs(momentumBias) > 0.2;

  const decimals = step >= 50 ? 0 : 2;
  const rationale: string[] = [
    `Directional score ${directionalScore.toFixed(2)} (momentum ${momentumBias.toFixed(2)}, flip bias ${flipBias.toFixed(2)}).`,
    `${dealerFlow} regime — ${netGex >= 0 ? 'dealers dampen moves (fade extremes)' : 'dealers amplify moves (chase breakouts)'}.`,
    `Targets anchored to ${dir > 0 ? `call wall ${callWall.toFixed(decimals)}` : `put wall ${putWall.toFixed(decimals)}`} and ±1σ EM (${em.toFixed(decimals)} pts).`,
  ];

  return {
    ticker, direction, confidence,
    contract: `${targetStrike.toFixed(decimals)}${isCall ? 'C' : 'P'}`,
    targetStrike, isCall,
    entryZone: [Number(entryZone[0].toFixed(decimals)), Number(entryZone[1].toFixed(decimals))],
    stop: Number(stop.toFixed(decimals)),
    tp1: Number(tp1.toFixed(decimals)),
    tp2: Number(tp2.toFixed(decimals)),
    expectedHoldMin,
    dealerFlow,
    flowConfirmation,
    trendRegime: regimeLabel(regimeState),
    winRate: Math.round(winRate),
    directionalScore: Number(directionalScore.toFixed(3)),
    rationale,
  };
}
