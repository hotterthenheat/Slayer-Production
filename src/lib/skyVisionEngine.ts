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
