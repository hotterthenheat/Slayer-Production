/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKY'S VISION TRADE PLAN — composite engine.
 *
 * Direction and conviction are a weighted blend of four layers (the original
 * Sky's Vision edge — dealer flow ENHANCES it, never replaces it):
 *
 *   40% Technical   — EMA alignment, multi-TF RSI, TTM squeeze, VWAP, structure
 *   30% Dealer      — GEX / gamma-flip / call & put walls / loaded strikes
 *   20% Contract    — greeks, option liquidity, OI, spread quality
 *   10% Learning    — calibrated historical win-rate
 *
 * Targets are NOT arbitrary — each is a real level with a reason:
 *   TP1 nearest EMA projection · TP2 liquidity level · TP3 loaded strike · TP4 GEX wall
 */
import type { TechnicalRead } from './technicalEngine';

export interface PlanTarget {
  price: number;
  reason: 'EMA Projection' | 'Liquidity Sweep' | 'Loaded Strike' | 'GEX Wall';
  distancePct: number;
}

export interface EngineScores {
  technical: number;  // 0..100
  dealer: number;
  contract: number;
  learning: number;
  composite: number;  // 0.4·tech + 0.3·dealer + 0.2·contract + 0.1·learning
}

export interface TradePlan {
  ticker: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;        // 0..100 (= composite)
  contract: string;          // e.g. "7650C"
  targetStrike: number;
  isCall: boolean;
  entryZone: [number, number];
  stop: number;
  tp1: number;
  tp2: number;
  targets: PlanTarget[];     // labeled, ordered, deduped
  expectedHoldMin: number;
  dealerFlow: string;        // "Positive Gamma" | "Negative Gamma"
  flowConfirmation: boolean; // dealer flow agrees with the technical read
  trendRegime: string;
  winRate: number;
  directionalScore: number;  // -1..1
  engineScores: EngineScores;
  technical: {
    emaAlignment: string;
    rsi: { m1: number; m5: number; m15: number; allRising: boolean };
    squeeze: { squeezeOn: boolean; firing: boolean; momentum: number };
    vwapPosition: string;
  };
  rationale: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export function regimeLabel(state?: string): string {
  switch ((state || '').toUpperCase()) {
    case 'TREND_EXPANSION': return 'Expansion';
    case 'TAIL_RISK': return 'Volatility Expansion';
    case 'MEAN_REVERSION': return 'Mean Reversion';
    case 'BALANCED': return 'Balanced';
    default: return state ? state.replace(/_/g, ' ') : 'Balanced';
  }
}

/** Nearest EMA value strictly ahead of spot in the trade direction. */
function nextEmaProjection(spot: number, dir: number, t: TechnicalRead['emaTargets']): number | null {
  const vals = [t.ema8, t.ema21, t.ema50, t.ema200].filter((v) => isFinite(v) && v > 0);
  const ahead = vals.filter((v) => (dir > 0 ? v > spot : v < spot));
  if (!ahead.length) return null;
  return dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
}

/** Build the labeled, ordered, de-duplicated target ladder. */
function buildTargets(params: {
  spot: number; dir: number; step: number; emaProj: number | null;
  liquidity: number | null; loadedStrike: number | null; wall: number | null;
}): PlanTarget[] {
  const { spot, dir, step, emaProj, liquidity, loadedStrike, wall } = params;
  const raw: { price: number | null; reason: PlanTarget['reason'] }[] = [
    { price: emaProj, reason: 'EMA Projection' },
    { price: liquidity, reason: 'Liquidity Sweep' },
    { price: loadedStrike, reason: 'Loaded Strike' },
    { price: wall, reason: 'GEX Wall' },
  ];
  const ahead = raw
    .filter((r): r is { price: number; reason: PlanTarget['reason'] } =>
      r.price != null && isFinite(r.price) && (dir > 0 ? r.price > spot : r.price < spot))
    .sort((a, b) => (dir > 0 ? a.price - b.price : b.price - a.price));

  const dedupeGap = Math.max(step * 0.3, spot * 0.0008);
  const out: PlanTarget[] = [];
  for (const r of ahead) {
    if (out.some((o) => Math.abs(o.price - r.price) < dedupeGap)) continue;
    out.push({ price: Number(r.price.toFixed(2)), reason: r.reason, distancePct: (r.price - spot) / spot });
  }
  return out;
}

export function buildTradePlan(params: {
  ticker: string;
  spot: number;
  step: number;
  emPts: number;
  hoursToClose: number;
  regimeState: string;
  technical: TechnicalRead;
  dealer: { netGex: number; gammaFlip: number; callWall: number; putWall: number };
  contractScore: number;     // 0..100 (greeks / liquidity / OI / spread quality)
  winRate: number;           // 0..100
  loadedStrike: number | null;
  liquidityHigh: number | null;
  liquidityLow: number | null;
}): TradePlan {
  const { ticker, spot, step, emPts, hoursToClose, regimeState, technical, dealer, contractScore, winRate, loadedStrike, liquidityHigh, liquidityLow } = params;
  const em = emPts > 0 ? emPts : Math.max(spot * 0.0005, spot * 0.004);

  // --- Direction: technical leads (60%), dealer flip confirms (40%) --------
  const dealerDir = dealer.gammaFlip > 0 ? Math.tanh((spot - dealer.gammaFlip) / em) : 0;
  const directionalScore = clamp(0.6 * clamp(technical.direction, -1, 1) + 0.4 * dealerDir, -1, 1);
  const direction: TradePlan['direction'] =
    directionalScore > 0.15 ? 'BULLISH' : directionalScore < -0.15 ? 'BEARISH' : 'NEUTRAL';
  const isCall = direction !== 'BEARISH';
  const dir = direction === 'BEARISH' ? -1 : 1;

  // Dealer support score (0..100): does dealer positioning back THIS direction?
  // flip bias aligned with the trade + room to run toward the directional wall.
  const flipAlign = Math.sign(dealerDir) === Math.sign(directionalScore || dir) ? Math.abs(dealerDir) : -Math.abs(dealerDir);
  const roomToWall = dir > 0
    ? clamp((dealer.callWall - spot) / (em * 2), 0, 1)
    : clamp((spot - dealer.putWall) / (em * 2), 0, 1);
  const dealerScore = clamp(50 + 40 * flipAlign + 20 * (roomToWall - 0.5) * 2, 0, 100);

  // --- Composite confidence: 40% tech / 30% dealer / 20% contract / 10% learn
  const engineScores: EngineScores = {
    technical: Math.round(clamp(technical.score, 0, 100)),
    dealer: Math.round(clamp(dealerScore, 0, 100)),
    contract: Math.round(clamp(contractScore, 0, 100)),
    learning: Math.round(clamp(winRate, 0, 100)),
    composite: 0,
  };
  engineScores.composite = Math.round(
    0.40 * engineScores.technical + 0.30 * engineScores.dealer + 0.20 * engineScores.contract + 0.10 * engineScores.learning,
  );
  const confidence = clamp(engineScores.composite, 5, 97);

  // --- Labeled target ladder ----------------------------------------------
  const emaProj = nextEmaProjection(spot, dir, technical.emaTargets);
  const wall = dir > 0 ? dealer.callWall : dealer.putWall;
  const liquidity = dir > 0 ? liquidityHigh : liquidityLow;
  const targets = buildTargets({ spot, dir, step, emaProj, liquidity, loadedStrike, wall });

  // TP1/TP2 from the ladder (fall back to EM multiples if the ladder is thin).
  const emTp1 = spot + dir * 0.5 * em;
  const emTp2 = spot + dir * 1.0 * em;
  const tp1 = targets[0]?.price ?? Number(emTp1.toFixed(2));
  const tp2Fallback = dir > 0 ? Math.max(tp1 + 0.5 * em, emTp2) : Math.min(tp1 - 0.5 * em, emTp2);
  const tp2 = targets[1]?.price ?? Number(tp2Fallback.toFixed(2));
  const stop = Number((spot - dir * 0.5 * em).toFixed(2));

  const entryHalf = Math.max(step * 0.15, 0.1 * em);
  const entryZone: [number, number] = [Number((spot - entryHalf).toFixed(2)), Number((spot + entryHalf).toFixed(2))];

  const atmStrike = roundTo(spot, step);
  const targetStrike = isCall ? atmStrike + step : atmStrike - step;
  const decimals = step >= 50 ? 0 : 2;

  // --- Expected hold: diffusion time to TP1, modulated by regime speed -----
  const distToTp1 = Math.abs(tp1 - spot);
  const regimeSpeed = /EXPANSION|TAIL/.test((regimeState || '').toUpperCase()) ? 1.5 : /MEAN_REVERSION/.test((regimeState || '').toUpperCase()) ? 0.7 : 1.0;
  // Floor the distance-in-EM BEFORE squaring. When TP1 sits ~on spot (distToTp1≈0)
  // the squared term would vanish and collapse the hold to the 3-min floor; a
  // quarter-EM floor keeps a sane minimum diffusion time for near-the-money targets.
  const reachUnits = em > 0 ? Math.max(distToTp1 / em, 0.25) : 1;
  const reachFrac = reachUnits * reachUnits;
  const expectedHoldMin = Math.round(clamp(reachFrac * hoursToClose * 60 / regimeSpeed, 3, Math.max(5, hoursToClose * 60)));

  const dealerFlow = dealer.netGex >= 0 ? 'Positive Gamma' : 'Negative Gamma';
  // Flow confirmation: dealer flip bias agrees with the technical direction.
  const flowConfirmation = Math.sign(dealerDir) === Math.sign(technical.direction) && Math.abs(technical.direction) > 0.15;

  const rationale: string[] = [
    `Composite ${engineScores.composite} = 40% technical (${engineScores.technical}) · 30% dealer (${engineScores.dealer}) · 20% contract (${engineScores.contract}) · 10% learning (${engineScores.learning}).`,
    `Technical: EMA ${technical.emaAlignment.toLowerCase()}, RSI ${technical.rsi.m1}/${technical.rsi.m5}/${technical.rsi.m15} (1m/5m/15m)${technical.rsi.allRising ? ' rising' : ''}, ${technical.squeeze.firing ? 'squeeze FIRING' : technical.squeeze.squeezeOn ? 'in squeeze' : 'no squeeze'}, price ${technical.vwapPosition} VWAP.`,
    `${dealerFlow} — ${dealer.netGex >= 0 ? 'dealers dampen moves (fade extremes)' : 'dealers amplify moves (chase breakouts)'}; flip ${dealer.gammaFlip.toFixed(decimals)}.`,
  ];

  return {
    ticker, direction, confidence,
    contract: `${targetStrike.toFixed(decimals)}${isCall ? 'C' : 'P'}`,
    targetStrike, isCall, entryZone, stop, tp1, tp2, targets,
    expectedHoldMin, dealerFlow, flowConfirmation,
    trendRegime: regimeLabel(regimeState), winRate: Math.round(winRate),
    directionalScore: Number(directionalScore.toFixed(3)), engineScores,
    technical: {
      emaAlignment: technical.emaAlignment,
      rsi: { m1: technical.rsi.m1, m5: technical.rsi.m5, m15: technical.rsi.m15, allRising: technical.rsi.allRising },
      squeeze: { squeezeOn: technical.squeeze.squeezeOn, firing: technical.squeeze.firing, momentum: technical.squeeze.momentum },
      vwapPosition: technical.vwapPosition,
    },
    rationale,
  };
}
