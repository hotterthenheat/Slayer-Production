/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKY VISION — CORRECTED QUANT CORE (TypeScript port).
 *
 * Faithful port of the audited Sky Vision V2 quant spec. Two kinds of content live
 * here and they are NOT the same thing:
 *
 *   1. DERIVABLE MATH — BSM price/greeks (q carried consistently; correct charm),
 *      GEX/Vanna/Charm aggregation (×100 multiplier), barrier-touch probability
 *      (|ln(K/S)|, both directions), the HONEST option-target chain (invert BSM for
 *      the spot that yields the target premium, THEN touch-prob to it), target via
 *      exact repricing, NBRS, expected move, [0,100] normalizers. Provably right or
 *      wrong — checked by tests/skyQuantCore.test.ts.
 *
 *   2. FREE PARAMETERS — sub-score weights, tier thresholds, logistic steepness,
 *      gamma-ramp multiplier, decay levels. NO derivation; they are CHOICES.
 *      Quarantined in EngineConfig and flagged UNVALIDATED. Calibrate against your
 *      own labeled outcomes.
 *
 * The flow layer accepts PRE-CLASSIFIED inputs (net premium per window, sweep volume
 * by side). It does not fabricate trade-side labels — classification is upstream.
 */

export const CONTRACT_MULTIPLIER = 100; // shares per equity/index option contract

export type OptionType = 'call' | 'put';

// =============================================================================
// 0. NORMAL DISTRIBUTION (self-contained; N(x)+N(-x)=1 exactly → exact parity)
// =============================================================================
export function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp(-0.5 * x * x);
}

/**
 * Standard normal CDF — Graeme West's double-precision algorithm (~1e-15), which
 * also satisfies N(x)+N(-x)=1 exactly (the same tail value is used for ±x), so
 * put-call parity is exact and the closed-form greeks match finite differences.
 */
export function normCdf(x: number): number {
  const absx = Math.abs(x);
  if (absx > 37) return x > 0 ? 1 : 0;
  const exponential = Math.exp(-0.5 * absx * absx);
  let result: number;
  if (absx < 7.07106781186547) {
    let build = 3.52624965998911e-2 * absx + 0.700383064443688;
    build = build * absx + 6.37396220353165;
    build = build * absx + 33.912866078383;
    build = build * absx + 112.079291497871;
    build = build * absx + 221.213596169931;
    build = build * absx + 220.206867912376;
    result = exponential * build;
    build = 8.83883476483184e-2 * absx + 1.75566716318264;
    build = build * absx + 16.064177579207;
    build = build * absx + 86.7807322029461;
    build = build * absx + 296.564248779674;
    build = build * absx + 637.333633378831;
    build = build * absx + 793.826512519948;
    build = build * absx + 440.413735824752;
    result = result / build;
  } else {
    let build = absx + 0.65;
    build = absx + 4 / build;
    build = absx + 3 / build;
    build = absx + 2 / build;
    build = absx + 1 / build;
    result = exponential / build / 2.506628274631;
  }
  return x > 0 ? 1 - result : result;
}

// =============================================================================
// 1. BLACK-SCHOLES-MERTON  (q consistent; correct charm)
// =============================================================================
export function bsmPrice(S: number, K: number, tau: number, r: number, sigma: number, q = 0, otype: OptionType = 'call'): number {
  if (tau <= 0 || sigma <= 0) {
    return Math.max(0, otype === 'call' ? S - K : K - S); // intrinsic
  }
  const srt = sigma * Math.sqrt(tau);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * tau) / srt;
  const d2 = d1 - srt;
  if (otype === 'call') {
    return S * Math.exp(-q * tau) * normCdf(d1) - K * Math.exp(-r * tau) * normCdf(d2);
  }
  return K * Math.exp(-r * tau) * normCdf(-d2) - S * Math.exp(-q * tau) * normCdf(-d1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number; // per 1.00 vol (÷100 for per vol-point)
  theta: number; // per YEAR (÷365 for per-day)
  vanna: number;
  charm: number; // per YEAR (÷365 for per-day); call==put when q=0
  speed: number;
}

const ZERO_GREEKS: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, vanna: 0, charm: 0, speed: 0 };

export function bsmGreeks(S: number, K: number, tau: number, r: number, sigma: number, q = 0, otype: OptionType = 'call'): Greeks {
  if (tau <= 0 || sigma <= 0 || S <= 0 || K <= 0) return { ...ZERO_GREEKS };

  const srt = sigma * Math.sqrt(tau);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * tau) / srt;
  const d2 = d1 - srt;
  const pdf = normPdf(d1);
  const dq = Math.exp(-q * tau);
  const dr = Math.exp(-r * tau);

  const gamma = (dq * pdf) / (S * srt);
  const vega = S * dq * pdf * Math.sqrt(tau);
  const vanna = (-dq * pdf * d2) / sigma;
  const speed = -(gamma / S) * (d1 / srt + 1);

  // charm φ-term is identical for call & put; only the q·N(±d1) term differs.
  const charmCommon = (dq * pdf * (2 * (r - q) * tau - d2 * srt)) / (2 * tau * srt);

  let delta: number;
  let theta: number;
  let charm: number;
  if (otype === 'call') {
    delta = dq * normCdf(d1);
    theta = -(S * dq * pdf * sigma) / (2 * Math.sqrt(tau)) - r * K * dr * normCdf(d2) + q * S * dq * normCdf(d1);
    charm = q * dq * normCdf(d1) - charmCommon;
  } else {
    delta = -dq * normCdf(-d1);
    theta = -(S * dq * pdf * sigma) / (2 * Math.sqrt(tau)) + r * K * dr * normCdf(-d2) - q * S * dq * normCdf(-d1);
    charm = -q * dq * normCdf(-d1) - charmCommon;
  }

  return { delta, gamma, vega, theta, vanna, charm, speed };
}

// =============================================================================
// 2. DEALER AGGREGATION  (×100 multiplier; net call-positive / put-negative)
// =============================================================================
export function netGexStrike(oiC: number, gammaC: number, oiP: number, gammaP: number, S: number): number {
  return (oiC * gammaC - oiP * gammaP) * CONTRACT_MULTIPLIER * S * S * 0.01;
}
export function netVannaStrike(oiC: number, vannaC: number, oiP: number, vannaP: number, S: number): number {
  return (oiC * vannaC - oiP * vannaP) * CONTRACT_MULTIPLIER * S * 0.01;
}
export function netCharmStrike(oiC: number, charmC: number, oiP: number, charmP: number, timeDecayFactor = 1): number {
  return (oiC * charmC - oiP * charmP) * CONTRACT_MULTIPLIER * timeDecayFactor;
}

/** Spot where cumulative Net GEX crosses zero (linear interp on first sign change). */
export function gammaFlipSpot(strikes: number[], netGexByStrike: number[]): number | null {
  const order = strikes.map((s, i) => i).sort((a, b) => strikes[a] - strikes[b]);
  const sk = order.map((i) => strikes[i]);
  const g = order.map((i) => netGexByStrike[i]);
  let cum = 0;
  const cums = g.map((v) => (cum += v));
  for (let i = 0; i < cums.length - 1; i++) {
    if (cums[i] === 0) return sk[i];
    if (cums[i] * cums[i + 1] < 0) {
      const x0 = sk[i], x1 = sk[i + 1], y0 = cums[i], y1 = cums[i + 1];
      return x0 - (y0 * (x1 - x0)) / (y1 - y0);
    }
  }
  return null;
}

// =============================================================================
// 3. PROBABILITY  (barrier touch; honest option-target chain)
// =============================================================================
/**
 * P(underlying touches K at any time before tau). Both directions; driftless by
 * default (honest for intraday/0DTE). use_drift applies risk-neutral GBM drift.
 */
export function barrierTouchProb(S: number, K: number, sigma: number, tau: number, r = 0, q = 0, useDrift = false): number {
  if (tau <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const x = Math.log(K / S);
  const srt = sigma * Math.sqrt(tau);
  const nu = useDrift ? r - q - 0.5 * sigma * sigma : 0;
  let p: number;
  if (x > 0) {
    p = normCdf((-x + nu * tau) / srt) + Math.exp((2 * nu * x) / (sigma * sigma)) * normCdf((-x - nu * tau) / srt);
  } else if (x < 0) {
    p = normCdf((x - nu * tau) / srt) + Math.exp((2 * nu * x) / (sigma * sigma)) * normCdf((x + nu * tau) / srt);
  } else {
    p = 1;
  }
  return Math.min(1, Math.max(0, p));
}

/**
 * Invert BSM for the spot S* that reprices the option to `targetPremium`, holding
 * sigma and tauEval fixed. Robust bisection (no external root-finder). Returns null
 * if the target is unreachable in the searched spot range.
 */
export function spotForTargetPremium(targetPremium: number, S: number, K: number, tauEval: number, r: number, sigma: number, q = 0, otype: OptionType = 'call'): number | null {
  if (targetPremium <= 0) return null;
  let lo = 1e-6;
  let hi = S * 5;
  const f = (s: number) => bsmPrice(s, K, tauEval, r, sigma, q, otype) - targetPremium;
  let flo = f(lo);
  let fhi = f(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-7) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return 0.5 * (lo + hi);
}

/**
 * Honest chain: P(option mark reaches entryPremium × targetMult).
 *   1) find spot S* yielding that premium at (sigma, tauEval)
 *   2) return touch prob of reaching S* before tauEntry
 * Returns { prob, spotStar }. Assumes sigma & tauEval fixed at the exit horizon.
 */
export function probOptionHitsTarget(
  entryPremium: number, targetMult: number, S: number, K: number, tauEntry: number, r: number, sigma: number,
  q = 0, otype: OptionType = 'call', tauEval?: number, useDrift = false
): { prob: number; spotStar: number | null } {
  const te = tauEval == null ? tauEntry : tauEval;
  const sStar = spotForTargetPremium(entryPremium * targetMult, S, K, te, r, sigma, q, otype);
  if (sStar == null) return { prob: 0, spotStar: null };
  return { prob: barrierTouchProb(S, sStar, sigma, tauEntry, r, q, useDrift), spotStar: sStar };
}

// =============================================================================
// 4. TARGET ENGINE  (exact repricing — no magic mapping)
// =============================================================================
/** Profit target % as an EXACT BSM reprice under a stated (dS, dSigma, dt) move. */
export function targetPctViaReprice(S: number, K: number, tau: number, r: number, sigma: number, entryPremium: number, q = 0, otype: OptionType = 'call', dS = 0, dSigma = 0, dt = 0): number {
  if (entryPremium <= 0) return 0;
  const next = bsmPrice(S + dS, K, Math.max(tau - dt, 0), r, sigma + dSigma, q, otype);
  return ((next - entryPremium) / entryPremium) * 100;
}

// =============================================================================
// 5. STRIKE-CHAIN  (NBRS guarded + target excluded; expected move; OI)
// =============================================================================
/** value_i / mean(neighbors), excluding the target itself. Guarded divide. */
export function nbrsRatio(values: number[], idx: number, n = 3): number {
  const lo = Math.max(0, idx - n);
  const hi = Math.min(values.length, idx + n + 1);
  let windowSum = 0;
  let count = 0;
  for (let i = lo; i < hi; i++) { windowSum += Math.abs(values[i]); count++; }
  const target = Math.abs(values[idx]);
  const neigh = windowSum - target;
  const cnt = count - 1;
  if (cnt <= 0 || neigh <= 0) return 1;
  return target / (neigh / cnt);
}

export function expectedMove(S: number, sigma: number, tau: number): number {
  return S * sigma * Math.sqrt(tau);
}
export function oiVelocity(oiT: number, oiPrev: number, dtMinutes: number): number {
  return dtMinutes ? (oiT - oiPrev) / dtMinutes : 0;
}
export function oiMigration(strikes: number[], oiT: number[], oiPrev: number[]): number {
  let s = 0;
  for (let i = 0; i < strikes.length; i++) s += (oiT[i] - oiPrev[i]) * strikes[i];
  return s;
}

// =============================================================================
// 6. NORMALIZERS  →  genuine [0,100]
// =============================================================================
export function logisticScore(z: number, k = 4): number {
  return 100 / (1 + Math.exp(-k * z));
}
export function ratioScore(x: number, k = 4): number {
  return logisticScore(x - 1, k); // x=1 → 50
}
export function minmaxScore(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 50;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100;
}
export function percentileScore(v: number, history: number[]): number {
  if (!history.length) return 50;
  const h = [...history].sort((a, b) => a - b);
  let count = 0;
  for (const x of h) if (x <= v) count++; // side="right"
  return (count / h.length) * 100;
}

// =============================================================================
// CONFIG  ::  FREE PARAMETERS — calibration required (none are derived).
// =============================================================================
export interface EngineConfig {
  wFlow: number; wDealer: number; wPositioning: number; wTechnical: number; wVol: number;
  kLogistic: number;
  gammaRampMult: number; gammaRampCap: number;
  lqPenaltyThreshold: number; lqPenaltyFrac: number;
  decaySoft: number; decayModerate: number; decayHard: number;
  pssFloor: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  wFlow: 0.25, wDealer: 0.25, wPositioning: 0.2, wTechnical: 0.15, wVol: 0.15, // UNVALIDATED
  kLogistic: 4.0, // UNVALIDATED
  gammaRampMult: 1.25, gammaRampCap: 100, // UNVALIDATED HEURISTIC
  lqPenaltyThreshold: 40, lqPenaltyFrac: 0.25, // UNVALIDATED
  decaySoft: 10, decayModerate: 20, decayHard: 30, // UNVALIDATED (% drawdown from peak PSS)
  pssFloor: 70, // UNVALIDATED
};

export function validateEngineConfig(cfg: EngineConfig): void {
  const s = cfg.wFlow + cfg.wDealer + cfg.wPositioning + cfg.wTechnical + cfg.wVol;
  if (Math.abs(s - 1) > 1e-9) throw new Error(`PSS weights must sum to 1.0, got ${s}`);
}

// =============================================================================
// 7. PSS SUB-SCORES  (each genuinely [0,100])
// =============================================================================
export function flowSubscore(netPrem5m: number, netPrem15m: number, netPrem30m: number, totalPrem30m: number, sweepVolAsk: number, sweepVolBid: number, openingAligned: boolean): number {
  let fp = totalPrem30m > 0 ? 50 + ((netPrem5m + netPrem15m + netPrem30m) / totalPrem30m) * 50 : 50;
  fp = Math.max(0, Math.min(100, fp));
  const denom = sweepVolAsk + sweepVolBid;
  const fa = denom > 0 ? (sweepVolAsk / denom) * 100 : 50;
  const of = openingAligned ? 100 : 0;
  return 0.4 * fp + 0.4 * fa + 0.2 * of;
}

export function dealerSubscore(compositeNow: number, compositeHistory: number[], cfg: EngineConfig, gammaRampActive = false): number {
  let base = percentileScore(compositeNow, compositeHistory);
  if (gammaRampActive) base = Math.min(cfg.gammaRampCap, base * cfg.gammaRampMult);
  return base;
}

export function technicalSubscore(ema9: number, ema21: number, ema50: number, spot: number, vwap: number, highestHigh20: number, direction: 'bull' | 'bear' = 'bull'): number {
  const checks = direction === 'bull'
    ? [ema9 > ema21 && ema21 > ema50, spot > vwap, spot > ema9, spot > highestHigh20]
    : [ema9 < ema21 && ema21 < ema50, spot < vwap, spot < ema9, spot < highestHigh20];
  return (checks.filter(Boolean).length / checks.length) * 100;
}

export function positioningSubscore(oiVel: number, oiMig: number, oiNbrs: number, density0to100: number, cfg: EngineConfig, oiVelScale = 500, oiMigScale = 1e6, nbrsCap = 20): number {
  const velS = logisticScore(oiVel / oiVelScale, cfg.kLogistic);
  const migS = logisticScore(oiMig / oiMigScale, cfg.kLogistic);
  const nbrsS = minmaxScore(oiNbrs, 0, nbrsCap);
  const densS = Math.max(0, Math.min(100, density0to100));
  return 0.3 * velS + 0.3 * migS + 0.2 * nbrsS + 0.2 * densS;
}

export function volSubscore(ivNow: number, iv20dAvg: number, atrNow: number, atr5ago: number, emEff: number, cfg: EngineConfig): number {
  const ivS = iv20dAvg > 0 ? ratioScore(ivNow / iv20dAvg, cfg.kLogistic) : 50;
  const atrS = atr5ago > 0 ? ratioScore(atrNow / atr5ago, cfg.kLogistic) : 50;
  const reachS = Math.max(0, Math.min(100, (1 - Math.max(0, Math.min(1, emEff))) * 100));
  return 0.4 * ivS + 0.3 * atrS + 0.3 * reachS;
}

/** True weighted average of [0,100] sub-scores → [0,100]. No fudge factor. */
export function computePss(flow: number, dealer: number, positioning: number, technical: number, vol: number, cfg: EngineConfig): number {
  validateEngineConfig(cfg);
  return cfg.wFlow * flow + cfg.wDealer * dealer + cfg.wPositioning * positioning + cfg.wTechnical * technical + cfg.wVol * vol;
}

// =============================================================================
// 8. TRADE MANAGEMENT  (decay meter; OI-vel sign fixed; hard invalidations)
// =============================================================================
export interface PositionState {
  entryPss: number;
  maxPss: number;
  netGex0: number;
  oiVel0: number;
  entryPremium: number;
}

export function confidenceDecayPct(pssMax: number, pssNow: number): number {
  return pssMax > 0 ? ((pssMax - pssNow) / pssMax) * 100 : 0;
}

export function hardInvalidations(
  pssNow: number, netGexNow: number, netGex0: number, oiVelNow: number, oiVel0: number,
  flow5mFlipped: boolean, priceBrokeStructure: boolean, cfg: EngineConfig
): string[] {
  const flags: string[] = [];
  if (netGexNow * Math.sign(netGex0) < 0) flags.push('DEALER_FLIP');
  // FIXED: compare magnitude against 0.50·|oiVel0|, not the signed value.
  if (oiVelNow < 0 && Math.abs(oiVelNow) >= 0.5 * Math.abs(oiVel0)) flags.push('OI_LIQUIDATION');
  if (flow5mFlipped) flags.push('FLOW_REVERSAL');
  if (priceBrokeStructure) flags.push('STRUCTURE_BREAK');
  if (pssNow < cfg.pssFloor) flags.push('PSS_FLOOR');
  return flags;
}

export interface TradeAction {
  action: 'HOLD' | 'TRIM_25' | 'TRIM_50' | 'HARD_EXIT_CLOSE_ALL';
  reasons: string[];
  decayPct: number;
}

export function evaluateTrade(
  state: PositionState, pssNow: number, netGexNow: number, oiVelNow: number,
  flow5mFlipped: boolean, priceBrokeStructure: boolean, cfg: EngineConfig
): TradeAction {
  state.maxPss = Math.max(state.maxPss, pssNow);
  const decay = confidenceDecayPct(state.maxPss, pssNow);
  const flags = hardInvalidations(pssNow, netGexNow, state.netGex0, oiVelNow, state.oiVel0, flow5mFlipped, priceBrokeStructure, cfg);
  if (flags.length) return { action: 'HARD_EXIT_CLOSE_ALL', reasons: flags, decayPct: decay };
  if (decay >= cfg.decayHard) return { action: 'HARD_EXIT_CLOSE_ALL', reasons: ['DECAY_HARD'], decayPct: decay };
  if (decay >= cfg.decayModerate) return { action: 'TRIM_50', reasons: ['DECAY_MODERATE'], decayPct: decay };
  if (decay >= cfg.decaySoft) return { action: 'TRIM_25', reasons: ['DECAY_SOFT'], decayPct: decay };
  return { action: 'HOLD', reasons: [], decayPct: decay };
}
