/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKY VISION v2.0 — contract-intelligence engine (math core).
 *
 * Philosophy: don't chart the underlying and slap indicators on it. Chart the
 * *contract*, and answer one question — is THIS contract getting stronger or
 * weaker right now? Strength is derived from how a contract's own observable
 * metrics (premium / delta / gamma / volume / OI / IV) are CHANGING over time,
 * not from a single snapshot.
 *
 * This file is the deterministic, pure math foundation:
 *   • Layer 1 — ContractSnapshot: one timestamped reading of a contract.
 *   • Layer 2 — scoreContract(): the Contract Strength Score (0..100) + trend.
 *   • Rotation Scanner — rankContractStrengths(): the strongest contract on the chain.
 *
 * Layers 3–7 (EMA targets, swing detection, position health, dynamic exits,
 * master score) build on these primitives and land in follow-up passes.
 */
import { computeBlackScholesPrice, calculateAnalyticGreeks } from './v11Math';
import { emaLast } from './technicalEngine';
import { barrierTouchProb } from './skyQuantCore';

/** Layer 1: one timestamped reading of a single option contract. */
export interface ContractSnapshot {
  t: number; // tick index or epoch ms (monotonic)
  premium: number; // option mid price (points)
  volume: number; // contracts traded in the period
  oi: number; // open interest
  delta: number; // signed greek (calls +, puts -)
  gamma: number;
  theta: number; // daily
  vega: number;
  iv: number; // decimal (0.15 = 15%)
}

export type StrengthTrend = 'RISING' | 'FALLING' | 'FLAT';

/** Per-factor contribution, each signed in [-1, 1] (positive = strengthening). */
export interface StrengthFactors {
  premium: number;
  delta: number;
  gamma: number;
  volume: number;
  oi: number;
  iv: number;
}

/** Layer 2 output: how strong this contract is, and whether that's rising. */
export interface ContractStrength {
  score: number; // 0..100 — strength of THIS contract right now
  trend: StrengthTrend; // is the strength increasing, fading, or flat?
  confidence: number; // 0..100 — factor agreement × data sufficiency
  label: string; // human verdict, e.g. "Strong Buy"
  factors: StrengthFactors;
  samples: number; // how many snapshots informed the score
}

const EPS = 1e-9;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Net relative change across the window (first → last). Robust to scale; a flat
 * or single-point series returns 0. We use net change (not per-step slope) so a
 * steady grind and a late spike both register, which matches how traders read
 * "delta is increasing" / "premium is expanding".
 */
function netRel(series: number[]): number {
  if (series.length < 2) return 0;
  const a = series[0];
  const b = series[series.length - 1];
  return (b - a) / (Math.abs(a) + EPS);
}

// Factor weights — premium / delta / volume lead (most informative of real
// contract strength), with gamma, OI and IV as supporting confirmation. Sum = 1.
const WEIGHTS: StrengthFactors = {
  premium: 0.25,
  delta: 0.2,
  volume: 0.2,
  gamma: 0.15,
  oi: 0.1,
  iv: 0.1,
};

// How many recent snapshots inform a score (rate-of-change window).
const WINDOW = 12;

function labelFor(score: number): string {
  if (score >= 85) return 'Strong Buy';
  if (score >= 70) return 'Buy';
  if (score >= 58) return 'Accumulate';
  if (score > 42) return 'Neutral';
  if (score >= 30) return 'Weak';
  return 'Avoid';
}

/**
 * Layer 2: score a contract's strength from its recent history.
 *
 * "Strengthening" is direction-aware: for a CALL, rising delta strengthens it;
 * for a PUT, delta becoming MORE NEGATIVE strengthens it. A contract's own
 * premium expanding always strengthens it (that's the position gaining value),
 * as do rising volume, OI, gamma and IV.
 */
export function scoreContract(history: ContractSnapshot[], isCall: boolean): ContractStrength {
  const n = history.length;
  if (n < 2) {
    return {
      score: 50,
      trend: 'FLAT',
      confidence: Math.round(clamp(n * 12, 0, 24)),
      label: 'Insufficient data',
      factors: { premium: 0, delta: 0, gamma: 0, volume: 0, oi: 0, iv: 0 },
      samples: n,
    };
  }

  const w = history.slice(-WINDOW);
  // Direction-aware delta series: strengthening = toward the contract's bias.
  const deltaDir = w.map((s) => (isCall ? s.delta : -s.delta));

  const factors: StrengthFactors = {
    premium: Math.tanh(3.5 * netRel(w.map((s) => s.premium))),
    delta: Math.tanh(3.5 * netRel(deltaDir)),
    gamma: Math.tanh(3.0 * netRel(w.map((s) => s.gamma))),
    volume: Math.tanh(2.0 * netRel(w.map((s) => s.volume))),
    oi: Math.tanh(3.0 * netRel(w.map((s) => s.oi))),
    iv: Math.tanh(4.0 * netRel(w.map((s) => s.iv))),
  };

  // Weighted signal in [-1, 1].
  const signal =
    WEIGHTS.premium * factors.premium +
    WEIGHTS.delta * factors.delta +
    WEIGHTS.gamma * factors.gamma +
    WEIGHTS.volume * factors.volume +
    WEIGHTS.oi * factors.oi +
    WEIGHTS.iv * factors.iv;

  const score = clamp(50 + 50 * signal, 0, 100);
  const trend: StrengthTrend = signal > 0.08 ? 'RISING' : signal < -0.08 ? 'FALLING' : 'FLAT';

  // Confidence: how many factors agree with the net signal, scaled by how much
  // history we have. A strong, unanimous, well-sampled signal reads ~90+.
  const vals = Object.values(factors);
  const agree = signal === 0 ? 0 : vals.filter((v) => Math.sign(v) === Math.sign(signal) && Math.abs(v) > 0.05).length / vals.length;
  const dataSuff = clamp((w.length - 1) / (WINDOW - 1), 0, 1);
  const confidence = Math.round(clamp(30 + 50 * agree * (0.5 + 0.5 * Math.min(1, Math.abs(signal) * 2.5)) * dataSuff + 15 * dataSuff, 0, 99));

  return { score: Number(score.toFixed(1)), trend, confidence, label: labelFor(score), factors, samples: w.length };
}

/** A contract keyed for the rotation scanner. */
export interface ScoredContract {
  key: string; // e.g. "SPY 622C"
  strike: number;
  isCall: boolean;
  strength: ContractStrength;
}

export interface RankedContract extends ScoredContract {
  rank: number; // 1 = strongest
  strongest: boolean;
}

/**
 * Rotation Scanner: rank contracts by strength so Sky Vision can say
 * "the strongest contract on the chain is the 622C" instead of just "buy calls".
 * Ties break toward higher confidence, then nearer-the-money (lower strike gap is
 * resolved by the caller's ordering since we don't know spot here).
 */
export function rankContractStrengths(items: ScoredContract[]): RankedContract[] {
  const sorted = [...items].sort(
    (a, b) => b.strength.score - a.strength.score || b.strength.confidence - a.strength.confidence
  );
  return sorted.map((it, i) => ({ ...it, rank: i + 1, strongest: i === 0 }));
}

// ============================================================================
// LAYER 3 — EMA TARGET STACK (15 / 20 / 50 / 200) + dealer walls + expected move,
// with Black-Scholes option-premium projection layered at each level.
// ============================================================================

export interface EmaLadder {
  ema15: number;
  ema20: number;
  ema50: number;
  ema200: number;
  /** EMA200 needs ~200 bars to fully converge; below that it's an approximation. */
  converged200: boolean;
}

/** Compute the 15/20/50/200 EMA ladder from a close series (reuses the shared EMA). */
export function computeEmaLadder(closes: number[]): EmaLadder {
  return {
    ema15: Number(emaLast(closes, 15).toFixed(4)),
    ema20: Number(emaLast(closes, 20).toFixed(4)),
    ema50: Number(emaLast(closes, 50).toFixed(4)),
    ema200: Number(emaLast(closes, 200).toFixed(4)),
    converged200: closes.length >= 200,
  };
}

export type TargetKind =
  | 'EMA15' | 'EMA20' | 'EMA50' | 'EMA200'
  | 'GAMMA_WALL' | 'CALL_WALL' | 'PUT_WALL'
  | 'EXPECTED_MOVE';

export interface TargetLevel {
  kind: TargetKind;
  label: string;
  tier: 1 | 2 | 3 | 4 | 5; // 1 scalp · 2 trend · 3 major · 4 dealer · 5 options
  underlying: number; // the price level
  distancePct: number; // (level - spot) / spot, signed
}

/**
 * Build the in-direction target ladder: only levels the trade can actually run to
 * (calls → above spot; puts → below), ordered nearest-first and de-duplicated.
 */
export function buildTargetStack(params: {
  spot: number;
  isCall: boolean;
  emas: EmaLadder;
  walls?: { gamma?: number; call?: number; put?: number };
  emHigh?: number;
  emLow?: number;
}): TargetLevel[] {
  const { spot, isCall, emas, walls = {}, emHigh, emLow } = params;
  const dir = isCall ? 1 : -1;

  const candidates: { kind: TargetKind; label: string; tier: TargetLevel['tier']; price?: number }[] = [
    { kind: 'EMA15', label: 'EMA 15', tier: 1, price: emas.ema15 },
    { kind: 'EMA20', label: 'EMA 20', tier: 1, price: emas.ema20 },
    { kind: 'EMA50', label: 'EMA 50', tier: 2, price: emas.ema50 },
    { kind: 'EMA200', label: 'EMA 200', tier: 3, price: emas.ema200 },
    { kind: 'GAMMA_WALL', label: 'Gamma Wall', tier: 4, price: walls.gamma },
    isCall
      ? { kind: 'CALL_WALL', label: 'Call Wall', tier: 4, price: walls.call }
      : { kind: 'PUT_WALL', label: 'Put Wall', tier: 4, price: walls.put },
    { kind: 'EXPECTED_MOVE', label: isCall ? 'Expected Move High' : 'Expected Move Low', tier: 5, price: isCall ? emHigh : emLow },
  ];

  const ahead = candidates
    .filter(
      (c): c is { kind: TargetKind; label: string; tier: TargetLevel['tier']; price: number } =>
        c.price != null && isFinite(c.price) && c.price > 0 && (dir > 0 ? c.price > spot : c.price < spot)
    )
    .sort((a, b) => (dir > 0 ? a.price - b.price : b.price - a.price));

  // Only collapse levels that are essentially the same price (e.g. a wall sitting
  // on an EMA); keep genuinely distinct scalp levels like EMA 15 vs EMA 20.
  const dedupeGap = Math.max(spot * 0.0002, 0.01);
  const out: TargetLevel[] = [];
  for (const c of ahead) {
    if (out.some((o) => Math.abs(o.underlying - c.price) < dedupeGap)) continue;
    out.push({ kind: c.kind, label: c.label, tier: c.tier, underlying: Number(c.price.toFixed(2)), distancePct: Number(((c.price - spot) / spot).toFixed(5)) });
  }
  return out;
}

export interface ProjectedTarget extends TargetLevel {
  rank: number; // T1, T2, ...
  projectedPremium: number; // BSM option value when price reaches this level
  projectedGainPct: number; // vs entry premium
  touchProb: number; // 0..1 — honest barrier-touch probability of reaching this level before expiry
}

/**
 * Project the option premium at each target level (the "layered on top" piece).
 *
 * Time-decay model: under GBM, distance travelled scales with sqrt(time), so the
 * expected time to reach a level scales with distance². We therefore decay the
 * remaining DTE by (distance / 1σ-expected-move)², capped so a far target still
 * keeps some extrinsic value (you'd exit before true expiry). Premium is then the
 * Black-Scholes value at the level's underlying with that reduced DTE. This makes
 * near targets keep more time value and far/slow targets reflect real theta drag.
 */
export function projectTargetPremiums(
  stack: TargetLevel[],
  params: { spot: number; strike: number; dteDays: number; iv: number; isCall: boolean; entryPremium?: number; r?: number }
): ProjectedTarget[] {
  const { spot, strike, iv, isCall, r = 0.05 } = params;
  const dte = Math.max(0.02, params.dteDays);
  const entry = Math.max(0.01, params.entryPremium ?? computeBlackScholesPrice(spot, strike, dte, iv, isCall, r));
  const em = spot * iv * Math.sqrt(dte / 365); // 1σ over the horizon

  const tauYears = dte / 365;
  return stack.map((lvl, i) => {
    const distEm = em > 0 ? Math.abs(lvl.underlying - spot) / em : 0;
    const elapsedFrac = clamp(distEm * distEm, 0, 0.85); // keep ≥15% time value
    const remDte = Math.max(0.0007, dte * (1 - elapsedFrac));
    const prem = Math.max(0.01, computeBlackScholesPrice(lvl.underlying, strike, remDte, iv, isCall, r));
    // Honest P(reach this level before expiry): the projected premium IS the value
    // at lvl.underlying, so the probability of hitting it equals the barrier-touch
    // probability of the underlying reaching that level (driftless, intraday-honest).
    const touchProb = barrierTouchProb(spot, lvl.underlying, iv, tauYears, r, 0, false);
    return {
      ...lvl,
      rank: i + 1,
      projectedPremium: Number(prem.toFixed(2)),
      projectedGainPct: Number((((prem - entry) / entry) * 100).toFixed(1)),
      touchProb: Number(touchProb.toFixed(3)),
    };
  });
}

/**
 * Layer 1 helper: synthesize a contract snapshot from market inputs using the
 * shared quant math (BSM price + analytic greeks). Lets the server build a
 * per-contract time series from a (mock or real) chain deterministically.
 */
export function snapshotFromMarket(params: {
  t: number;
  spot: number;
  strike: number;
  dteDays: number;
  iv: number;
  isCall: boolean;
  volume: number;
  oi: number;
  r?: number;
}): ContractSnapshot {
  const { t, spot, strike, dteDays, iv, isCall, volume, oi, r = 0.05 } = params;
  const premium = computeBlackScholesPrice(spot, strike, dteDays, iv, isCall, r);
  const g = calculateAnalyticGreeks(spot, strike, dteDays, iv, isCall, r);
  return {
    t,
    premium: Number(premium.toFixed(2)),
    volume,
    oi,
    delta: Number(g.delta.toFixed(4)),
    gamma: Number(g.gamma.toFixed(6)),
    theta: Number(g.theta.toFixed(2)),
    vega: Number(g.vega.toFixed(2)),
    iv,
  };
}

// ============================================================================
// LAYER 4 — SWING DETECTION (short-term scalp vs long-term trend)
// ============================================================================

export type SwingDirection = 'BULLISH' | 'BEARISH' | 'NONE';

export interface SwingLeg {
  detected: boolean;
  direction: SwingDirection;
  strength: number; // 0..100
  expectedDuration: string;
  reasons: string[];
}

export interface SwingRead {
  shortTerm: SwingLeg;
  longTerm: SwingLeg;
}

/**
 * Detect a short-term scalp swing (EMA15 vs EMA20 + delta acceleration + volume +
 * premium expansion) and a long-term trend swing (EMA50 vs EMA200 + IV support +
 * dealer alignment + OI build) for the contract's own direction.
 */
export function detectSwings(params: {
  isCall: boolean;
  emas: EmaLadder;
  history: ContractSnapshot[];
  dealerAligned?: boolean; // dealer positioning backs the direction (optional override)
}): SwingRead {
  const { isCall, emas, history } = params;
  const dir = isCall ? 1 : -1;
  const w = history.slice(-WINDOW);
  const hasHist = w.length >= 3;

  const deltaDir = w.map((s) => (isCall ? s.delta : -s.delta));
  const half = Math.max(2, Math.floor(w.length / 2));
  // delta "accelerating" = the recent half's slope exceeds the earlier half's.
  const deltaAccel = hasHist && netRel(deltaDir.slice(-half)) > netRel(deltaDir.slice(0, half));
  const volumeUp = hasHist && netRel(w.map((s) => s.volume)) > 0.02;
  const premiumExpand = hasHist && netRel(w.map((s) => s.premium)) > 0.02;
  const oiBuild = hasHist && netRel(w.map((s) => s.oi)) > 0.01;
  const ivUp = hasHist && netRel(w.map((s) => s.iv)) > 0.005;

  // --- Short-term scalp ---
  const fastAligned = dir > 0 ? emas.ema15 > emas.ema20 : emas.ema15 < emas.ema20;
  const stConds = [fastAligned, deltaAccel, volumeUp, premiumExpand];
  const stCount = stConds.filter(Boolean).length;
  const stStrength = Math.round((100 * stCount) / stConds.length);
  const stDetected = fastAligned && stCount >= 3;
  const stReasons: string[] = [];
  if (fastAligned) stReasons.push(`EMA15 ${dir > 0 ? '>' : '<'} EMA20`);
  if (deltaAccel) stReasons.push('delta accelerating');
  if (volumeUp) stReasons.push('volume rising');
  if (premiumExpand) stReasons.push('premium expanding');
  const stDuration = !stDetected ? '—' : stStrength >= 90 ? '45-60 min' : stStrength >= 75 ? '30-45 min' : '5-15 min';

  // --- Long-term trend ---
  const slowAligned = dir > 0 ? emas.ema50 > emas.ema200 : emas.ema50 < emas.ema200;
  const dealerAligned = params.dealerAligned ?? oiBuild; // proxy when not supplied
  const ltConds = [slowAligned, ivUp, dealerAligned, oiBuild];
  const ltCount = ltConds.filter(Boolean).length;
  const ltStrength = Math.round((100 * ltCount) / ltConds.length);
  const ltDetected = slowAligned && ltCount >= 3;
  const ltReasons: string[] = [];
  if (slowAligned) ltReasons.push(`EMA50 ${dir > 0 ? '>' : '<'} EMA200`);
  if (ivUp) ltReasons.push('IV supportive');
  if (dealerAligned) ltReasons.push('dealer aligned');
  if (oiBuild) ltReasons.push('OI building');
  const ltDuration = !ltDetected ? '—' : ltStrength >= 90 ? '1-2 weeks' : ltStrength >= 75 ? '3-7 days' : '1-2 days';

  const sd: SwingDirection = dir > 0 ? 'BULLISH' : 'BEARISH';
  return {
    shortTerm: { detected: stDetected, direction: stDetected ? sd : 'NONE', strength: stStrength, expectedDuration: stDuration, reasons: stReasons },
    longTerm: { detected: ltDetected, direction: ltDetected ? sd : 'NONE', strength: ltStrength, expectedDuration: ltDuration, reasons: ltReasons },
  };
}

/**
 * EMA structure score (0..100): how cleanly the EMA stack is aligned in-direction
 * (bull: spot > EMA15 > EMA20 > EMA50 > EMA200). The EMA200 rung is only counted
 * when it has converged, so a short history doesn't unfairly penalize the score.
 */
export function emaStructureScore(spot: number, emas: EmaLadder, isCall: boolean): number {
  const up = isCall;
  const conds: boolean[] = [
    up ? spot > emas.ema15 : spot < emas.ema15,
    up ? emas.ema15 > emas.ema20 : emas.ema15 < emas.ema20,
    up ? emas.ema20 > emas.ema50 : emas.ema20 < emas.ema50,
  ];
  if (emas.converged200) conds.push(up ? emas.ema50 > emas.ema200 : emas.ema50 < emas.ema200);
  return Math.round((100 * conds.filter(Boolean).length) / conds.length);
}

// ============================================================================
// LAYER 7 — SKY VISION MASTER SCORE (weighted verdict)
// ============================================================================

export interface MasterScoreInput {
  contractStrength: number; // 0..100 (Layer 2)
  flowStrength: number; // 0..100 (order-flow / sweep pressure)
  dealerPositioning: number; // 0..100 (dealer alignment)
  emaStructure: number; // 0..100 (Layer 3 structure)
  volumeProfile: number; // 0..100
  ivStructure: number; // 0..100
  swingEngine: number; // 0..100 (Layer 4)
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bestContract?: string;
  swingType?: string;
  target?: string;
}

export interface MasterScore {
  score: number; // 0..100
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0..100 (component agreement)
  bestContract: string;
  swingType: string;
  target: string;
  tradeHealth: string;
  components: Record<string, number>;
}

const MASTER_WEIGHTS = {
  contractStrength: 0.25,
  flowStrength: 0.2,
  dealerPositioning: 0.15,
  emaStructure: 0.15,
  volumeProfile: 0.1,
  ivStructure: 0.1,
  swingEngine: 0.05,
};

/** Blend the seven layer sub-scores into the single Sky Vision verdict. */
export function computeMasterScore(inp: MasterScoreInput): MasterScore {
  const c = (v: number) => clamp(v, 0, 100);
  const components: Record<string, number> = {
    contractStrength: c(inp.contractStrength),
    flowStrength: c(inp.flowStrength),
    dealerPositioning: c(inp.dealerPositioning),
    emaStructure: c(inp.emaStructure),
    volumeProfile: c(inp.volumeProfile),
    ivStructure: c(inp.ivStructure),
    swingEngine: c(inp.swingEngine),
  };
  const score = Math.round(
    MASTER_WEIGHTS.contractStrength * components.contractStrength +
      MASTER_WEIGHTS.flowStrength * components.flowStrength +
      MASTER_WEIGHTS.dealerPositioning * components.dealerPositioning +
      MASTER_WEIGHTS.emaStructure * components.emaStructure +
      MASTER_WEIGHTS.volumeProfile * components.volumeProfile +
      MASTER_WEIGHTS.ivStructure * components.ivStructure +
      MASTER_WEIGHTS.swingEngine * components.swingEngine
  );
  // Confidence from component agreement: a tight cluster (low dispersion) means
  // the layers concur, so we trust the verdict more.
  const vals = Object.values(components);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const confidence = Math.round(clamp(100 - sd * 1.2, 30, 99));
  const tradeHealth = score >= 80 ? 'Strong' : score >= 60 ? 'Healthy' : score >= 45 ? 'Mixed' : 'Weak';
  return {
    score,
    direction: inp.direction,
    confidence,
    bestContract: inp.bestContract ?? '—',
    swingType: inp.swingType ?? '—',
    target: inp.target ?? '—',
    tradeHealth,
    components,
  };
}

// ============================================================================
// LAYER 5 — POSITION HEALTH MONITOR (after entry: is the position improving?)
// ============================================================================

export type PositionHealth = 'Strong' | 'Healthy' | 'Weakening' | 'Critical';

export interface PositionHealthRead {
  health: PositionHealth;
  action: 'Hold' | 'Reduce' | 'Exit';
  strength: number; // 0..100 (contract strength of the live position)
  trend: StrengthTrend;
  signals: string[]; // plain-language strengthening / weakening notes
}

/**
 * Assess an OPEN position's health from its live snapshot history. Reuses the
 * Layer-2 strength score (the position is healthy when the contract keeps
 * strengthening) and turns it into a hold/reduce/exit verdict + readable signals.
 */
export function assessPositionHealth(history: ContractSnapshot[], isCall: boolean): PositionHealthRead {
  const s = scoreContract(history, isCall);

  let health: PositionHealth;
  let action: PositionHealthRead['action'];
  if (s.score >= 70 && s.trend !== 'FALLING') {
    health = 'Strong';
    action = 'Hold';
  } else if (s.score >= 55 && s.trend !== 'FALLING') {
    health = 'Healthy';
    action = 'Hold';
  } else if (s.score >= 40) {
    health = 'Weakening';
    action = 'Reduce';
  } else {
    health = 'Critical';
    action = 'Exit';
  }

  const f = s.factors;
  const signals: string[] = [];
  signals.push(f.premium > 0.1 ? 'premium expanding' : f.premium < -0.1 ? 'premium stalling' : 'premium flat');
  signals.push(f.delta > 0.1 ? 'delta strengthening' : f.delta < -0.1 ? 'delta weakening' : 'delta steady');
  if (f.volume > 0.1) signals.push('volume rising');
  else if (f.volume < -0.1) signals.push('volume fading');
  if (f.iv > 0.1) signals.push('IV expanding');
  else if (f.iv < -0.1) signals.push('IV collapsing');

  return { health, action, strength: s.score, trend: s.trend, signals };
}

// ============================================================================
// LAYER 6 — DYNAMIC EXIT ENGINE (five smart exit triggers)
// ============================================================================

export type DynamicExitKind = 'EMA_TARGET' | 'STRENGTH_COLLAPSE' | 'FLOW_REVERSAL' | 'GAMMA_WALL' | 'IV_CRUSH';

export interface DynamicExitSignal {
  kind: DynamicExitKind;
  action: 'SCALE' | 'TAKE_PROFIT' | 'EXIT';
  severity: number; // 0..1 (higher = more urgent)
  reason: string;
}

/**
 * Evaluate the five dynamic exit triggers for an OPEN position. Returns every
 * signal that fired (caller applies priority); pure and deterministic so it can
 * run each tick. Sweep/strength/IV inputs come from the live feed + Layer 2.
 */
export function evaluateDynamicExits(params: {
  isCall: boolean;
  history: ContractSnapshot[]; // position live history
  spot: number;
  emaTargetHit?: boolean; // price reached the next EMA target this tick
  gammaWall?: number; // the relevant dealer wall in the trade direction
  strengthSeries?: number[]; // recent contract-strength scores (for collapse)
  flow?: { callSweeps: number; putSweeps: number; prevCallSweeps: number; prevPutSweeps: number };
}): DynamicExitSignal[] {
  const { isCall, history, spot, emaTargetHit, gammaWall, strengthSeries, flow } = params;
  const out: DynamicExitSignal[] = [];
  const w = history.slice(-WINDOW);

  // 1. EMA target reached → scale 25% (take partial, let the rest run).
  if (emaTargetHit) {
    out.push({ kind: 'EMA_TARGET', action: 'SCALE', severity: 0.4, reason: 'Price reached the next EMA target — take 25%.' });
  }

  // 2. Strength collapse — strength rolled over from its peak (e.g. 91 → 70 → 54).
  if (strengthSeries && strengthSeries.length >= 3) {
    const peak = Math.max(...strengthSeries);
    const lastS = strengthSeries[strengthSeries.length - 1];
    if (peak - lastS >= 20 && lastS < 62) {
      out.push({ kind: 'STRENGTH_COLLAPSE', action: 'EXIT', severity: 0.9, reason: `Contract strength collapsing (${Math.round(peak)} → ${Math.round(lastS)}).` });
    }
  }

  // 3. Flow reversal — directional sweeps fade while the opposite side appears.
  if (flow) {
    const callsFading = flow.callSweeps < flow.prevCallSweeps;
    const putsRising = flow.putSweeps > flow.prevPutSweeps;
    const putsFading = flow.putSweeps < flow.prevPutSweeps;
    const callsRising = flow.callSweeps > flow.prevCallSweeps;
    if (isCall && callsFading && putsRising) {
      out.push({ kind: 'FLOW_REVERSAL', action: 'EXIT', severity: 0.85, reason: 'Call sweeps fading while put sweeps appear.' });
    } else if (!isCall && putsFading && callsRising) {
      out.push({ kind: 'FLOW_REVERSAL', action: 'EXIT', severity: 0.85, reason: 'Put sweeps fading while call sweeps appear.' });
    }
  }

  // 4. Gamma wall hit → take profit into the dealer wall.
  if (gammaWall != null && isFinite(gammaWall) && gammaWall > 0) {
    if ((isCall && spot >= gammaWall) || (!isCall && spot <= gammaWall)) {
      out.push({ kind: 'GAMMA_WALL', action: 'TAKE_PROFIT', severity: 0.6, reason: `Price reached the ${isCall ? 'call' : 'put'} gamma wall (${gammaWall}).` });
    }
  }

  // 5. IV crush — implied vol dropping while premium stalls (vega bleed).
  if (w.length >= 3) {
    const ivChg = netRel(w.map((s) => s.iv));
    const premChg = netRel(w.map((s) => s.premium));
    if (ivChg <= -0.04 && premChg <= 0.0) {
      out.push({ kind: 'IV_CRUSH', action: 'EXIT', severity: 0.7, reason: 'IV collapsing while premium stalls (vega bleed).' });
    }
  }

  return out.sort((a, b) => b.severity - a.severity);
}
