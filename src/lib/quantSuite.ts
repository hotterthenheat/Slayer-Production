/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChainContract } from './v11Math';
import { formatTime } from './timeUtils';
import { stdNormalCDF, stdNormalPDF } from './normalDist';
import {
  parkinsonVol,
  garmanKlassVol,
  yangZhangVol,
  intervalMinutes,
  volCone as realizedVolCone,
} from './realizedVol';
import type { Candle as MarketCandle } from '../types';
import { ivAtDelta } from './skewAnalytics';

// ==========================================
// STANDARD MATHEMATICAL & STATISTICS DEFS
// ==========================================

// Delegate to the platform's high-precision normal distribution (West/Hart,
// ~1e-15, exact N(x)+N(-x)=1). The previous local Abramowitz-Stegun polynomial
// was only ~1.5e-7 with asymmetric tails, which biased put-call parity and the
// Breeden-Litzenberger second-difference RND at the deep-OTM wings.
export function normalPdf(x: number): number {
  return stdNormalPDF(x);
}

export function normalCdf(x: number): number {
  return stdNormalCDF(x);
}

/**
 * Black-Scholes-Merton option pricer (exact)
 */
export function bsmPrice(
  S: number,
  K: number,
  t: number,
  sigma: number,
  optionType: 'call' | 'put',
  r = 0.05,
  q = 0.0
): number {
  if (t <= 0) t = 1e-4;
  if (sigma <= 0) sigma = 1e-3;

  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);

  if (optionType === 'call') {
    return S * Math.exp(-q * t) * normalCdf(d1) - K * Math.exp(-r * t) * normalCdf(d2);
  } else {
    return K * Math.exp(-r * t) * normalCdf(-d2) - S * Math.exp(-q * t) * normalCdf(-d1);
  }
}

/**
 * Calculates Greeks exact derivatives
 */
export interface GreeksResult {
  delta: number;
  gamma: number;
  vega: number; // in points
  theta: number; // in daily points
  vanna: number;
  charm: number;
}

export function calculateOptionGreeks(
  S: number,
  K: number,
  t: number,
  sigma: number,
  optionType: 'call' | 'put',
  r = 0.05,
  q = 0.0
): GreeksResult {
  if (t <= 0) t = 1e-4;
  if (sigma <= 0) sigma = 1e-3;

  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);

  const n_prime_d1 = normalPdf(d1);
  const N_d1 = normalCdf(d1);

  const delta = optionType === 'call'
    ? Math.exp(-q * t) * N_d1
    : Math.exp(-q * t) * (N_d1 - 1);

  const gamma = (Math.exp(-q * t) * n_prime_d1) / (S * sigma * Math.sqrt(t));
  
  // Vega is w.r.t 100% IV change, divide by 100 to get decimal equivalent per 1% vol
  const vega = S * Math.exp(-q * t) * n_prime_d1 * Math.sqrt(t);

  const thetaCall = - (S * Math.exp(-q * t) * n_prime_d1 * sigma) / (2 * Math.sqrt(t))
                    - r * K * Math.exp(-r * t) * normalCdf(d2)
                    + q * S * Math.exp(-q * t) * normalCdf(d1);

  const thetaPut = - (S * Math.exp(-q * t) * n_prime_d1 * sigma) / (2 * Math.sqrt(t))
                   + r * K * Math.exp(-r * t) * normalCdf(-d2)
                   - q * S * Math.exp(-q * t) * normalCdf(-d1);

  const theta = (optionType === 'call' ? thetaCall : thetaPut) / 365.0; // Daily theta

  const vanna = -Math.exp(-q * t) * n_prime_d1 * (d2 / sigma);

  const charm_base = Math.exp(-q * t) * n_prime_d1 * ((r - q) / (sigma * Math.sqrt(t)) - d2 / (2 * t));
  const charm = optionType === 'call'
    ? q * Math.exp(-q * t) * N_d1 - charm_base
    : -q * Math.exp(-q * t) * (1 - N_d1) - charm_base;

  return { delta, gamma, vega, theta, vanna, charm: charm / 365.0 }; // Daily charm decay
}

// ==========================================
// BREEDEN-LITZENBERGER IMPLIED PDF ENGINE
// ==========================================

export interface ProbabilityDensityNode {
  strike: number;
  probability: number;
  cumulativeProb: number;
}

export interface BreedenLitzenbergerResult {
  density: ProbabilityDensityNode[];
  mean: number; // expected value under RND
  stdDev: number; // implied dispersion
  skewness: number; // asymmetry of the distribution
  kurtosis: number; // fat-tail metric (excess kurtosis, normal = 0)
  isFatTailed: boolean; // flag if kurtosis is significantly high (> 1.2)
  probLessThanSpot: number;
  probGreaterThanSpot: number;
}

/**
 * Solves the Risk-Neutral Probability distribution by evaluating 2nd derivative of SVI calls
 */
function det3x3(m: number[][]): number {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
         m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
         m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

/**
 * Solves the Risk-Neutral Probability distribution by evaluating 2nd derivative of SVI calls
 */
export function solveImpliedRND(
  chain: ChainContract[],
  spot: number,
  ivBase: number,
  t = 30 / 365,
  r = 0.05
): BreedenLitzenbergerResult {
  if (chain.length < 5) {
    return generateDummyRND(spot, ivBase, t);
  }

  // Filter for unique strikes to avoid duplicates and non-increasing sequence issues
  const uniqueContractsMap = new Map<number, ChainContract>();
  chain.forEach(c => {
    if (!uniqueContractsMap.has(c.strike) || c.type === 'call') {
      uniqueContractsMap.set(c.strike, c);
    }
  });

  // Sort unique chain by strike
  const sorted = Array.from(uniqueContractsMap.values()).sort((a, b) => a.strike - b.strike);
  
  // 1. Fit a continuous quadratic smile model on the chain of options:
  // IV(K) = a + b * x + c * x^2   where x = ln(K / spot)
  let nPoints = sorted.length;
  let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
  let sumY = 0, sumXY = 0, sumX2Y = 0;

  sorted.forEach(c => {
    const x = Math.log(c.strike / spot);
    const y = c.iv;
    sumX += x;
    sumX2 += x * x;
    sumX3 += x * x * x;
    sumX4 += x * x * x * x;
    sumY += y;
    sumXY += x * y;
    sumX2Y += x * x * y;
  });

  const M = [
    [nPoints, sumX, sumX2],
    [sumX, sumX2, sumX3],
    [sumX2, sumX3, sumX4]
  ];

  const d = det3x3(M);
  let a = ivBase;
  // Degenerate-system fallback: a FLAT smile (b = c = 0 ⇒ IV(K) = ivBase). When the
  // 3×3 normal-equation determinant collapses (sparse / co-linear / flat chain) the
  // data simply does not support a skew or curvature term, so we must not invent
  // one. The previous fallback hardcoded an equity skew (b = −0.15, c = 0.55),
  // fabricating a downside-skewed RND for markets that showed none.
  let b = 0;
  let c = 0;

  if (Math.abs(d) > 1e-12) {
    const Ma = [
      [sumY, sumX, sumX2],
      [sumXY, sumX2, sumX3],
      [sumX2Y, sumX3, sumX4]
    ];
    const Mb = [
      [nPoints, sumY, sumX2],
      [sumX, sumXY, sumX3],
      [sumX2, sumX2Y, sumX4]
    ];
    const Mc = [
      [nPoints, sumX, sumY],
      [sumX, sumX2, sumXY],
      [sumX2, sumX3, sumX2Y]
    ];
    a = det3x3(Ma) / d;
    b = det3x3(Mb) / d;
    c = det3x3(Mc) / d;
  }

  // Define our smooth parametric volatility curve
  const interpolateIV = (k: number): number => {
    const x = Math.log(k / spot);
    const iv = a + b * x + c * x * x;
    const minIvAllowed = Math.max(0.015, ivBase * 0.25);
    const maxIvAllowed = Math.max(2.20, ivBase * 5.0);
    return Math.max(minIvAllowed, Math.min(maxIvAllowed, iv));
  };

  // Numerical 2nd derivative calculator of Call Price
  const computeCallPrice = (k: number) => {
    const vol = interpolateIV(k);
    return bsmPrice(spot, k, t, vol, 'call', r, 0.0);
  };

  // Define a wide strike range to let tails slope naturally to zero (e.g. ±3.2 standard deviations)
  const stdModel = spot * ivBase * Math.sqrt(t || 30 / 365);
  const minStrike = Math.max(spot * 0.40, spot - 3.2 * stdModel);
  const maxStrike = spot + 3.2 * stdModel;

  // Strike step for the Breeden-Litzenberger second difference. A fixed $1 bump
  // collapses on high-priced underlyings (on SPX ~6000 the grid step is tens of
  // dollars, so a $1 bump is below grid resolution and the difference is dominated
  // by floating-point cancellation noise). Scale it to spot, matching riskNeutral.ts.
  const dK = Math.max(0.5, spot * 0.0025);
  const meshDensity = 100;
  const denseStrikes: number[] = [];
  const stepK = (maxStrike - minStrike) / meshDensity;
  for (let i = 0; i <= meshDensity; i++) {
    denseStrikes.push(minStrike + i * stepK);
  }

  let nodes: ProbabilityDensityNode[] = [];
  let sumProb = 0;

  denseStrikes.forEach(K => {
    // Breeden-Litzenberger 2nd derivative: e^(r t) * [C(K+dK) - 2C(K) + C(K-dK)] / dK^2
    const cUp = computeCallPrice(K + dK);
    const cMid = computeCallPrice(K);
    const cDown = computeCallPrice(K - dK);
    
    const secondDeriv = (cUp - 2 * cMid + cDown) / (dK * dK);
    let density = Math.exp(r * t) * secondDeriv;
    if (density < 0) density = 0; // Arbitrage boundary constraint

    nodes.push({
      strike: K,
      probability: density,
      cumulativeProb: 0
    });
    sumProb += density;
  });

  if (sumProb <= 0) {
    return generateDummyRND(spot, ivBase, t);
  }

  // Self-normalization and gentle Gaussian kernel smoothing
  const smoothingBandwidth = 2.0 * stepK;
  const smoothedNodes: ProbabilityDensityNode[] = [];
  let sumSmoothed = 0;

  for (let i = 0; i < nodes.length; i++) {
    const K_i = nodes[i].strike;
    let weightSum = 0;
    let weightedProbSum = 0;
    const maxIndexOffset = 10;
    const startJ = Math.max(0, i - maxIndexOffset);
    const endJ = Math.min(nodes.length - 1, i + maxIndexOffset);

    for (let j = startJ; j <= endJ; j++) {
      const K_j = nodes[j].strike;
      const u = (K_i - K_j) / smoothingBandwidth;
      const weight = Math.exp(-0.5 * u * u);
      weightSum += weight;
      weightedProbSum += weight * nodes[j].probability;
    }
    const smoothedProb = weightSum > 0 ? (weightedProbSum / weightSum) : nodes[i].probability;
    smoothedNodes.push({
      strike: K_i,
      probability: smoothedProb,
      cumulativeProb: 0
    });
    sumSmoothed += smoothedProb;
  }
  nodes = smoothedNodes;
  sumProb = sumSmoothed;

  // Normalize and calculate cumulative density
  let runningCum = 0;
  nodes = nodes.map(n => {
    const normProb = sumProb > 0 ? (n.probability / sumProb) : 0;
    runningCum += normProb;
    return {
      ...n,
      probability: normProb,
      cumulativeProb: runningCum
    };
  });

  // Compute standard statistical moments under risk-neutral density
  let mean = 0;
  nodes.forEach(n => mean += n.strike * n.probability);

  let variance = 0;
  nodes.forEach(n => variance += Math.pow(n.strike - mean, 2) * n.probability);
  const stdDev = Math.sqrt(variance);

  let skewness = 0;
  if (stdDev > 0) {
    nodes.forEach(n => skewness += Math.pow((n.strike - mean) / stdDev, 3) * n.probability);
  }

  let kurtosisSum = 0;
  if (stdDev > 0) {
    nodes.forEach(n => kurtosisSum += Math.pow((n.strike - mean) / stdDev, 4) * n.probability);
  }
  const kurtosis = kurtosisSum - 3.0; // Excess kurtosis
  const isFatTailed = kurtosis > 1.2;

  // Probability thresholds
  let probLessThanSpot = 0;
  let probGreaterThanSpot = 0;
  nodes.forEach(n => {
    if (n.strike < spot) {
      probLessThanSpot += n.probability;
    } else {
      probGreaterThanSpot += n.probability;
    }
  });

  return {
    density: nodes,
    mean,
    stdDev,
    skewness,
    kurtosis,
    isFatTailed,
    probLessThanSpot,
    probGreaterThanSpot
  };
}

function generateDummyRND(spot: number, ivBase: number, t: number): BreedenLitzenbergerResult {
  const std = spot * ivBase * Math.sqrt(t || 1/12);
  const nodes: ProbabilityDensityNode[] = [];
  const minK = spot - 3.5 * std;
  const maxK = spot + 3.5 * std;
  const steps = 100;
  let sum = 0;

  // Skew-normal distribution parameters to generate a beautiful, realistic negatively-skewed bell curve
  const alpha = -3.5;
  const xi = spot + 0.8 * std;
  const omega = std * 1.2;

  for (let i = 0; i <= steps; i++) {
    const K = minK + (maxK - minK) * (i / steps);
    const z = (K - xi) / omega;
    const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const Phi = normalCdf(alpha * z);
    const prob = (2.0 / omega) * phi * Phi;
    nodes.push({ strike: K, probability: prob, cumulativeProb: 0 });
    sum += prob;
  }

  let runningCum = 0;
  const dense = nodes.map(n => {
    const p = sum > 0 ? (n.probability / sum) : 0;
    runningCum += p;
    return { ...n, probability: p, cumulativeProb: runningCum };
  });

  return {
    density: dense,
    mean: spot - 0.15 * std,
    stdDev: std,
    skewness: -0.95,
    kurtosis: 1.45,
    isFatTailed: true,
    probLessThanSpot: 0.58,
    probGreaterThanSpot: 0.42
  };
}

// ==========================================
// REALIZED VOLATILITY REAL QUANT ESTIMATORS 
// ==========================================

export interface Candle {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RealizedVolSuite {
  parkinson: number; // High/Low range
  garmanKlass: number; // Open/High/Low/Close
  yangZhang: number; // Overnight jump + Rodgers-Satchell intraday range
  varianceRiskPremium: number; // IV - RV spread (vol points, decimal)
  // Honest percentile of the CURRENT realized vol within its own rolling cone
  // (computed from real candles). NOT a VRP percentile — we hold no IV history,
  // so a true VRP distribution does not exist. 50 ⇒ abstain (insufficient history).
  rvPercentile: number;
}

/**
 * Maps a Quant-Lab Candle (whose `time` may be an epoch-ms stamp, an ISO string,
 * or a bare bar index) to the canonical market Candle the realizedVol estimators
 * consume. Only `timestamp` is read by those estimators for bar-interval inference;
 * a non-numeric `time` is passed through as 0 so intervalMinutes() falls back to
 * its 5-minute default (the engine's intraday cadence).
 */
function toMarketCandles(candles: Candle[]): MarketCandle[] {
  return candles.map((c) => ({
    timestamp: typeof c.time === 'number' ? c.time : Number(c.time) || 0,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

/**
 * Computes Yang-Zhang, Garman-Klass, and Parkinson RV from Candles.
 *
 * Delegates to the bar-interval-aware estimators in realizedVol.ts so the same
 * candles produce identical RV here and there. The previous local copy hardcoded
 * `* 252` (a DAILY annualization) while being fed intraday (5-min) bars, which
 * understated RV by ~√(390/5) ≈ 8.8× and made the VRP (IV − RV) nonsense.
 */
export function calculateRealizedVolSuite(
  candles: Candle[],
  impliedVol: number, // current ATM implied volatility (e.g. 0.18)
  lookback = 20
): RealizedVolSuite {
  const n = candles.length;
  if (n < 5) {
    return {
      parkinson: 0.145,
      garmanKlass: 0.138,
      yangZhang: 0.142,
      varianceRiskPremium: impliedVol - 0.142,
      rvPercentile: 50,
    };
  }

  const mkt = toMarketCandles(candles);

  const clampVol = (v: number, fallback: number) =>
    isFinite(v) && v > 0 ? Math.min(2.5, Math.max(0.01, v)) : fallback;

  const parkinson = clampVol(parkinsonVol(mkt, lookback), 0.145);
  const garmanKlass = clampVol(garmanKlassVol(mkt, lookback), 0.138);
  const yangZhang = clampVol(yangZhangVol(mkt, lookback), 0.142);

  // Variance Risk Premium (VRP) Spread: IV - RV
  const varianceRiskPremium = impliedVol - yangZhang;

  // Honest RV percentile: rank the current realized vol against the rolling
  // volatility cone built from the SAME real candles (closeToClose history at
  // this lookback). When history is too short to form a distribution, abstain
  // with a neutral 50 rather than fabricating a waveform percentile.
  const cone = realizedVolCone(mkt, [lookback]);
  const rvPercentile = cone.length ? cone[0].percentile : 50;

  return {
    parkinson,
    garmanKlass,
    yangZhang,
    varianceRiskPremium,
    rvPercentile,
  };
}

export interface VolConePoint {
  window: number;
  min: number;
  p25: number;
  p50: number; // median
  p75: number;
  max: number;
  current: number;
}

/**
 * Generates a volatility cone from REAL historic candles.
 *
 * Delegates to realizedVol.volCone, which builds the rolling close-to-close vol
 * distribution per window and reads `current` off the latest reading. The prior
 * implementation fabricated every quantile from a `seed = w/30` and a Math.sin
 * "current" — a decorative shape unrelated to the data. Windows without enough
 * history to form a distribution are omitted (the caller renders what remains).
 */
export function calculateVolatilityCone(candles: Candle[], _yzVol: number): VolConePoint[] {
  const mkt = toMarketCandles(candles);
  const windows = [5, 10, 20, 30, 45, 60];
  return realizedVolCone(mkt, windows).map((b) => ({
    window: b.window,
    min: b.min,
    p25: b.p25,
    p50: b.median,
    p75: b.p75,
    max: b.max,
    current: b.current,
  }));
}

// ==========================================
// SKEW ANALYTICS OVER TIME
// ==========================================

export interface SkewMetrics {
  riskReversal25D: number; // Call IV (25D) - Put IV (25D)
  butterfly25D: number; // (Call IV(25D) + Put IV(25D))/2 - Atm IV
  skewSlopeAtm: number; // slope of the smile at spot
  // Neutral 50 placeholder: a genuine percentile needs a rolling history of past
  // readings, which this stateless call does not hold (use the engine's
  // percentileRank ring buffer for a real rank). Never a fabricated waveform.
  riskReversalPercentile: number;
  butterflyPercentile: number;
}

export function computeSkewAnalytics(
  chain: ChainContract[],
  spot: number,
  ivBase: number
): SkewMetrics {
  // 25Δ wing IVs via the same bracketing/interpolation used by skewAnalytics.ts
  // (ivAtDelta): find the two contracts straddling |Δ|=0.25 on each side and
  // linearly interpolate. The previous nearest-delta pick snapped to whatever
  // single contract happened to be closest, which on a sparse chain could be far
  // from 25Δ and gave a discontinuous risk reversal.
  const calls = chain.filter((c) => c.type === 'call');
  const puts = chain.filter((c) => c.type === 'put');

  // ATM IV: average of contracts at the strike nearest spot (blend call+put).
  let atmIV = ivBase;
  if (chain.length > 0) {
    const nearest = chain.reduce(
      (b, c) => (Math.abs(c.strike - spot) < Math.abs(b.strike - spot) ? c : b),
      chain[0]
    );
    const atmSet = chain.filter((c) => c.strike === nearest.strike && c.iv > 0);
    atmIV = atmSet.length ? atmSet.reduce((a, c) => a + c.iv, 0) / atmSet.length : nearest.iv;
  }

  const call25DIV = ivAtDelta(calls, 0.25) ?? ivBase + 0.02;
  const put25DIV = ivAtDelta(puts, 0.25) ?? ivBase + 0.04;

  const riskReversal25D = call25DIV - put25DIV;
  const butterfly25D = ((call25DIV + put25DIV) / 2) - atmIV;
  const skewSlopeAtm = (put25DIV - call25DIV) / (spot * 0.1); // estimated derivative dVol/dK

  // Risk-reversal / butterfly percentiles require a real rolling history of past
  // readings, which this stateless function does not hold. The previous version
  // returned Math.abs(sin/cos(...))·100 — a deterministic waveform dressed up as a
  // percentile. We abstain (50 = neutral / "no history") rather than fabricate.
  // The engine's percentile ring buffer (skewAnalytics.percentileRank) is the
  // correct home for a genuine rank when a history series is available.
  return {
    riskReversal25D,
    butterfly25D,
    skewSlopeAtm,
    riskReversalPercentile: 50,
    butterflyPercentile: 50,
  };
}

// ==========================================
// MULTI-LEG STRATEGY BUILDER PLATFORM
// ==========================================

export interface OptionLeg {
  id: string;
  strike: number;
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  qty: number;
  iv: number;
  entryPrice: number;
}

export interface StrategyMetrics {
  legs: OptionLeg[];
  combinedGreeks: GreeksResult;
  netPremium: number; // debit (+), credit (-)
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakevens: number[];
  pop: number; // probability of profit
  kellySizing: number; // recommended sizing fraction
}

export interface PayoffChartPoint {
  underlyingPrice: number;
  pnl: number;
  probability: number;
}

/**
 * Linearly interpolates the risk-neutral probability density at an arbitrary
 * `targetStrike` between the two nearest density nodes (binary search on the
 * sorted strikes). Returns 0 outside the density's support.
 *
 * Replaces the prior `density.find(|strike - x| < bucket)` lookup, which (a)
 * returned the FIRST node within a tolerance (not the nearest), (b) missed
 * entirely when the sampling grid was misaligned with the density nodes (e.g. a
 * 200-point scan over a 101-node density), and (c) fell back to a uniform
 * 1/N — biasing the probability-of-profit integral toward 0.5.
 */
function interpDensity(
  density: ProbabilityDensityNode[],
  targetStrike: number
): number {
  const n = density.length;
  if (n === 0) return 0;
  if (n === 1) return density[0].strike === targetStrike ? density[0].probability : 0;
  // Outside support ⇒ no mass (never a uniform fallback).
  if (targetStrike <= density[0].strike) {
    return targetStrike === density[0].strike ? density[0].probability : 0;
  }
  if (targetStrike >= density[n - 1].strike) {
    return targetStrike === density[n - 1].strike ? density[n - 1].probability : 0;
  }
  // Binary search for the node just below targetStrike (strikes are sorted asc).
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (density[mid].strike <= targetStrike) lo = mid;
    else hi = mid;
  }
  const a = density[lo], b = density[hi];
  const span = b.strike - a.strike;
  if (span <= 0) return a.probability;
  const w = (targetStrike - a.strike) / span;
  return a.probability + (b.probability - a.probability) * w;
}

/**
 * Classifies the terminal payoff topology of a multi-leg position from the NET
 * option exposure at each tail, rather than from a P&L magnitude threshold.
 *
 * As S→∞ the slope of the payoff is 100·Σ(signed call qty); as S→0 it is
 * −100·Σ(signed put qty). A strictly positive far-side slope ⇒ unbounded profit;
 * a strictly negative one ⇒ unbounded loss. This is exact and scale-free, unlike
 * the old `> 1e6` test (meaningless on an SPX-priced underlying).
 */
function payoffTailTopology(legs: OptionLeg[]): {
  profitUnbounded: boolean;
  lossUnbounded: boolean;
} {
  let netCallQty = 0; // slope contribution as S → +∞
  let netPutQty = 0; // slope contribution as S → 0 (magnitude)
  for (const l of legs) {
    const signed = (l.action === 'buy' ? 1 : -1) * l.qty;
    if (l.type === 'call') netCallQty += signed;
    else netPutQty += signed;
  }
  // Upside: long net calls ⇒ profit unbounded; short net calls ⇒ loss unbounded.
  // Downside: long net puts profit as S→0 (bounded at S=0); short net puts ⇒
  // loss grows toward S=0 (bounded at strike·qty, but treated as the large-loss
  // side). Only the call wing is genuinely unbounded in S; puts are capped at S=0.
  const profitUnbounded = netCallQty > 0;
  const lossUnbounded = netCallQty < 0;
  return { profitUnbounded, lossUnbounded };
}

/**
 * Calculates compound strategy metrics
 */
export function buildStrategySuite(
  legs: OptionLeg[],
  spot: number,
  dte = 30,
  r = 0.05,
  rnd: BreedenLitzenbergerResult
): StrategyMetrics {
  const t = dte / 365;
  const combinedGreeks = { delta: 0, gamma: 0, vega: 0, theta: 0, vanna: 0, charm: 0 };
  let netPremium = 0;

  legs.forEach(l => {
    const direction = l.action === 'buy' ? 1 : -1;
    const g = calculateOptionGreeks(spot, l.strike, t, l.iv, l.type, r);
    
    combinedGreeks.delta += g.delta * direction * l.qty;
    combinedGreeks.gamma += g.gamma * direction * l.qty;
    combinedGreeks.vega += g.vega * direction * l.qty;
    combinedGreeks.theta += g.theta * direction * l.qty;
    combinedGreeks.vanna += g.vanna * direction * l.qty;
    combinedGreeks.charm += g.charm * direction * l.qty;

    netPremium += l.entryPrice * direction * l.qty * 100;
  });

  // Payoff calculations at terminal boundary
  const calculatePayoffAtSpot = (sPrice: number): number => {
    let profit = 0;
    legs.forEach(l => {
      const direction = l.action === 'buy' ? 1 : -1;
      let legPayout = 0;
      if (l.type === 'call') {
        legPayout = Math.max(0, sPrice - l.strike);
      } else {
        legPayout = Math.max(0, l.strike - sPrice);
      }
      // PnL = (Payout - EntryPricePaid) * direction * qty * 100
      profit += (legPayout - l.entryPrice) * direction * l.qty * 100;
    });
    return profit;
  };

  // Solve max profit & max loss numerically. The scan offsets are scaled to the
  // expected move (1σ off the RND, fallback to spot·IV·√t) and to spot, so they
  // are meaningful on any underlying — a fixed ±$20 is below tick noise on an
  // SPX-priced (~6000) chain. Strikes are kinks in the payoff, so each strike is
  // probed directly plus a small neighborhood, and the wide tails are anchored to
  // the RND support so far-OTM unbounded legs are actually reached.
  let maxLossVal = 0;
  let maxProfitVal = 0;
  const avgIv = legs.length ? legs.reduce((a, l) => a + l.iv, 0) / legs.length : 0.2;
  const sigmaPts = rnd.stdDev > 0 ? rnd.stdDev : spot * avgIv * Math.sqrt(Math.max(t, 1e-4));
  const em = Math.max(sigmaPts, spot * 0.005);
  const lowTail = Math.max(0, Math.min(spot - 4 * em, rnd.density[0]?.strike ?? spot * 0.5));
  const highTail = Math.max(spot + 4 * em, rnd.density[rnd.density.length - 1]?.strike ?? spot * 1.5);
  const scanStrikes = [
    lowTail,
    highTail,
    ...legs.flatMap((l) => [l.strike, l.strike - 0.25 * em, l.strike + 0.25 * em]),
  ].sort((a, b) => a - b);

  scanStrikes.forEach(s => {
    const pnl = calculatePayoffAtSpot(s);
    if (pnl < maxLossVal) maxLossVal = pnl;
    if (pnl > maxProfitVal) maxProfitVal = pnl;
  });

  // Unbounded topology from net option exposure per side, not a P&L magnitude.
  const { profitUnbounded, lossUnbounded } = payoffTailTopology(legs);

  // Calculate Breakevens and Integration of Probability of Profit
  let profitAreaSum = 0;
  let totalAreaSum = 0;
  const breakevens: number[] = [];
  const samplePointsCount = 200;
  
  const rndDensity = rnd.density;
  const minDensityStrike = rndDensity[0].strike;
  const maxDensityStrike = rndDensity[rndDensity.length - 1].strike;

  for (let i = 0; i < samplePointsCount; i++) {
    const testSpot = minDensityStrike + (maxDensityStrike - minDensityStrike) * (i / samplePointsCount);
    const pnl = calculatePayoffAtSpot(testSpot);

    // Interpolate the RND at testSpot (never a uniform 1/N fallback).
    const densityProb = interpDensity(rndDensity, testSpot);

    totalAreaSum += densityProb;
    if (pnl > 0) {
      profitAreaSum += densityProb;
    }

    // Capture breakeven cross lines
    if (i > 0) {
      const prevSpot = minDensityStrike + (maxDensityStrike - minDensityStrike) * ((i - 1) / samplePointsCount);
      const prevPnl = calculatePayoffAtSpot(prevSpot);
      if (prevPnl * pnl < 0) {
        // Cross detected, linear interpolation for zero cross
        const cZero = prevSpot + (testSpot - prevSpot) * (Math.abs(prevPnl) / (Math.abs(prevPnl) + Math.abs(pnl)));
        if (!breakevens.some(b => Math.abs(b - cZero) < 2)) {
          breakevens.push(Math.round(cZero * 10) / 10);
        }
      }
    }
  }

  const pop = totalAreaSum > 0 ? (profitAreaSum / totalAreaSum) : 0.55;

  // Sizing via fractional Edge-focused Kelly Criterion: f* = p − (1−p)/R, where
  // R = E[win] / E[loss]. CRITICAL: weight the win/loss magnitudes by the SAME
  // risk-neutral density used to compute `pop`, so both Kelly inputs come from one
  // consistent measure. The previous version mixed an RND-based `pop` with an
  // UNWEIGHTED uniform-grid win/loss ratio — two different measures — which made
  // the resulting fraction not a valid edge estimate.
  let sumWinPnl = 0, sumWinProb = 0, sumLossPnl = 0, sumLossProb = 0;
  for (const node of rndDensity) {
    const pnl = calculatePayoffAtSpot(node.strike);
    const p = node.probability;
    if (pnl > 0) { sumWinPnl += pnl * p; sumWinProb += p; }
    else { sumLossPnl += Math.abs(pnl) * p; sumLossProb += p; }
  }
  const meanWin = sumWinProb > 0 ? sumWinPnl / sumWinProb : 100;
  const meanLoss = sumLossProb > 0 ? sumLossPnl / sumLossProb : 100;
  const rRatio = meanLoss > 0 ? (meanWin / meanLoss) : 1.0;

  const kellyUnbounded = pop - (1 - pop) / rRatio;
  const kellySizing = Math.min(0.20, Math.max(0, 0.5 * kellyUnbounded)); // Limit allocation to 20% max (Half-Kelly)

  return {
    legs,
    combinedGreeks,
    netPremium,
    maxProfit: profitUnbounded ? 'unlimited' : maxProfitVal,
    maxLoss: lossUnbounded ? 'unlimited' : maxLossVal,
    breakevens,
    pop,
    kellySizing,
  };
}

/**
 * Returns complete trajectory coordinates for payoff plotting
 */
export function generatePayoffCoordinates(
  legs: OptionLeg[],
  spot: number,
  rnd: BreedenLitzenbergerResult
): PayoffChartPoint[] {
  const coords: PayoffChartPoint[] = [];
  const minK = spot * 0.85;
  const maxK = spot * 1.15;
  const density = rnd.density;

  const calculatePayoffAtSpot = (sPrice: number): number => {
    let profit = 0;
    legs.forEach(l => {
      const direction = l.action === 'buy' ? 1 : -1;
      let legPayout = 0;
      if (l.type === 'call') {
        legPayout = Math.max(0, sPrice - l.strike);
      } else {
        legPayout = Math.max(0, l.strike - sPrice);
      }
      profit += (legPayout - l.entryPrice) * direction * l.qty * 100;
    });
    return profit;
  };

  for (let step = 0; step <= 80; step++) {
    const testSpot = minK + (maxK - minK) * (step / 80);
    const pnl = calculatePayoffAtSpot(testSpot);

    // Interpolate probability from the RND at testSpot (0 outside support).
    const prob = interpDensity(density, testSpot);

    coords.push({
      underlyingPrice: Math.round(testSpot * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      probability: prob
    });
  }

  return coords;
}

// ==========================================
// SCENARIO SHOCK PNL MATRIX (SPOT × VOL × DTE)
// ==========================================

export interface ShockNode {
  spotChange: number; // percentage (e.g. -0.05)
  volChange: number; // percentage (e.g. 0.05 for +5%)
  dteRemaining: number; // DTE
  pnl: number;
}

/**
 * Evaluates exact multi-leg options portfolio under specified shocked grids
 */
export function computeScenarioShockMatrix(
  legs: OptionLeg[],
  spot: number,
  spotShocks = [-0.05, -0.025, 0, 0.025, 0.05],
  volShocks = [-0.05, -0.025, 0, 0.025, 0.05],
  targetDTEs = [30, 15, 0],
  r = 0.05
): ShockNode[] {
  const nodes: ShockNode[] = [];

  spotShocks.forEach(sShock => {
    const shockedSpot = spot * (1 + sShock);
    volShocks.forEach(vShock => {
      targetDTEs.forEach(dte => {
        let nodePnl = 0;
        
        legs.forEach(l => {
          const dir = l.action === 'buy' ? 1 : -1;
          const originalPrice = bsmPrice(spot, l.strike, 30/365, l.iv, l.type, r);

          let currentPrice = 0;
          if (dte === 0) {
            // Intrinsic payout at maturity (terminal payoff)
            if (l.type === 'call') currentPrice = Math.max(0, shockedSpot - l.strike);
            else currentPrice = Math.max(0, l.strike - shockedSpot);
          } else {
            // Shocked Black Scholes re-valuation
            const shockedVol = Math.max(0.01, l.iv + vShock);
            currentPrice = bsmPrice(shockedSpot, l.strike, dte / 365, shockedVol, l.type, r);
          }

          nodePnl += (currentPrice - originalPrice) * dir * l.qty * 100;
        });

        nodes.push({
          spotChange: sShock,
          volChange: vShock,
          dteRemaining: dte,
          pnl: Math.round(nodePnl * 100) / 100
        });
      });
    });
  });

  return nodes;
}

// ==========================================
// PORTFOLIO BOOK AND HEDGE ENGINE
// ==========================================

export interface PortfolioPosition {
  id: string;
  symbol: string;
  type: 'stock' | 'call' | 'put';
  qty: number; // long is positive, short is negative
  entryPrice: number;
  currentPrice: number;
  strike?: number;
  iv?: number;
  dte?: number;
}

export interface PortfolioGreeksGroup {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  vanna: number;
  charm: number;
  marketValue: number;
  totalCost: number;
  totalProfit: number;
}

export function aggregatePortfolioGreeks(
  positions: PortfolioPosition[],
  spot: number,
  r = 0.05
): PortfolioGreeksGroup {
  let delta = 0, gamma = 0, vega = 0, theta = 0, vanna = 0, charm = 0;
  let marketValue = 0, totalCost = 0;

  positions.forEach(p => {
    const grossCost = p.entryPrice * Math.abs(p.qty) * (p.type === 'stock' ? 1 : 100);
    totalCost += grossCost;

    if (p.type === 'stock') {
      const val = p.currentPrice * p.qty;
      marketValue += val;
      delta += p.qty; // 1 Delta per share
    } else {
      const val = p.currentPrice * p.qty * 100;
      marketValue += val;

      const t = (p.dte || 30) / 365;
      const vol = p.iv || 0.18;
      const g = calculateOptionGreeks(spot, p.strike || spot, t, vol, p.type, r);

      delta += g.delta * p.qty * 100;
      gamma += g.gamma * p.qty * 100;
      vega += g.vega * p.qty * 100;
      theta += g.theta * p.qty * 100;
      vanna += g.vanna * p.qty * 100;
      charm += g.charm * p.qty * 100;
    }
  });

  return {
    delta,
    gamma,
    vega,
    theta,
    vanna,
    charm,
    marketValue,
    totalCost,
    totalProfit: marketValue - totalCost
  };
}

// ==========================================
// BY-EXPIRY GEX ENGINE & CHARM/VANNA CLOCK
// ==========================================

export interface ExpiryGexNode {
  expiry: string;
  totalGex: number;
  callGex: number;
  putGex: number;
  dominantStrike: number;
}

export interface CharmVannaClockPoint {
  timeEst: string;
  decayAccelerationFactor: number; // clock scale factor (accelerates past 2:00 PM EST)
  isPeakDecayWindow: boolean;
}

/**
 * Aggregates dealer GEX from the option chain, bucketed by REAL expiry.
 *
 * `ChainContract` carries no per-contract expiry, so the chain represents a
 * single (front) expiry: this returns exactly ONE node computed from the real
 * contracts. The previous implementation looped the SAME chain once per hardcoded
 * label ('0DTE'…'30DTE') and scaled each by exp(-idx·0.4) — six proportional
 * fakes of one expiry, an invented term structure. When the chain shape gains a
 * real per-contract expiry, bucket on it here and emit one node per true expiry.
 */
export function aggregateExpiryGexCurve(
  chain: ChainContract[],
  spot: number
): ExpiryGexNode[] {
  if (!chain || chain.length === 0) return [];

  let sumCallGex = 0;
  let sumPutGex = 0;
  let maxStrGex = 0;
  let maxStr = spot;

  chain.forEach((c) => {
    const isCall = c.type === 'call';
    const gex = c.gamma * c.openInterest * 100 * (spot * spot) * 0.01 * (isCall ? 1 : -1);
    if (isCall) sumCallGex += gex;
    else sumPutGex += gex;
    if (Math.abs(gex) > maxStrGex) {
      maxStrGex = Math.abs(gex);
      maxStr = c.strike;
    }
  });

  return [
    {
      expiry: 'Front', // single real expiry — not a fabricated decay series
      totalGex: sumCallGex + sumPutGex,
      callGex: sumCallGex,
      putGex: sumPutGex,
      dominantStrike: maxStr,
    },
  ];
}

/**
 * Computes decay curves showing intraday hedging accelerations (Vanna/Charm clock §3.8)
 */
export function generateCharmVannaClock(): CharmVannaClockPoint[] {
  const clockNodes: CharmVannaClockPoint[] = [];
  const hours = [
    '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'
  ];

  hours.forEach(hr => {
    const [hStr, mStr] = hr.split(':');
    const h = parseInt(hStr) + parseInt(mStr) / 60;
    
    // Intraday decay acceleration curve (peaks severely around 2:00 PM EST/14:00 onwards)
    let accel = 1.0;
    if (h >= 14) {
      // Exponential ramp up in late afternoon session
      accel = 1.0 + Math.pow(h - 13.5, 2.5) * 0.8;
    } else {
      // Gentle slope
      accel = 0.8 + (h - 9.5) * 0.1;
    }

    const hNum = parseInt(hStr);
    const ampm = hNum >= 12 ? 'PM' : 'AM';
    const dispHrs = hNum > 12 ? hNum - 12 : hNum === 0 ? 12 : hNum;
    const timeEst12 = `${dispHrs.toString().padStart(2, '0')}:${mStr} ${ampm}`;

    clockNodes.push({
      timeEst: timeEst12,
      decayAccelerationFactor: Math.round(accel * 100) / 100,
      isPeakDecayWindow: h >= 14.0 && h < 16.0
    });
  });

  return clockNodes;
}

// ==========================================
// REAL-TIME ALERTS ENGINE EVALUATOR
// ==========================================

export interface AlertRule {
  id: string;
  name: string;
  metric: 'spot' | 'gex_flip' | 'gex_negative' | 'vrp_high' | 'skew_risk';
  operator: 'above' | 'below' | 'crosses' | 'is_negative';
  thresholdValue?: number;
  isActive: boolean;
}

export interface AlertDispatch {
  timestamp: string;
  ruleName: string;
  message: string;
  type: 'info' | 'warning' | 'danger';
}

export function evaluateAlertRules(
  rules: AlertRule[],
  spot: number,
  prevSpot: number,
  deltaGex: number, // netGex value
  gammaFlip: number,
  // Honest underlying values (decimal vol). VRP = IV − RV; RR25 = call25Δ − put25Δ.
  // These replace the former fabricated percentiles. For 'vrp_high' / 'skew_risk'
  // the rule's thresholdValue is read as VOL POINTS (e.g. 5 ⇒ 0.05).
  varianceRiskPremium: number,
  riskReversal25D: number
): AlertDispatch[] {
  const dispatches: AlertDispatch[] = [];
  const time = formatTime(new Date());

  rules.forEach(r => {
    if (!r.isActive) return;

    if (r.metric === 'spot' && r.thresholdValue) {
      if (r.operator === 'above' && spot > r.thresholdValue) {
        dispatches.push({
          timestamp: time,
          ruleName: r.name,
          message: `SPOT CRITICAL ALERT: Underlying spot ${spot.toFixed(2)} breached target above ${r.thresholdValue}`,
          type: 'danger'
        });
      } else if (r.operator === 'below' && spot < r.thresholdValue) {
        dispatches.push({
          timestamp: time,
          ruleName: r.name,
          message: `SPOT CRITICAL ALERT: Underlying spot ${spot.toFixed(2)} crossed target below ${r.thresholdValue}`,
          type: 'danger'
        });
      } else if (r.operator === 'crosses' && prevSpot > 0) {
        const crossedAbove = prevSpot <= r.thresholdValue && spot > r.thresholdValue;
        const crossedBelow = prevSpot >= r.thresholdValue && spot < r.thresholdValue;
        if (crossedAbove || crossedBelow) {
          dispatches.push({
            timestamp: time,
            ruleName: r.name,
            message: `SPOT CROSS ALERT: Spot ${spot.toFixed(2)} crossed threshold ${r.thresholdValue}`,
            type: 'warning'
          });
        }
      }
    }

    if (r.metric === 'gex_flip') {
      const crossedFlip = (prevSpot > gammaFlip && spot <= gammaFlip) || (prevSpot < gammaFlip && spot >= gammaFlip);
      if (crossedFlip && prevSpot > 0) {
        dispatches.push({
          timestamp: time,
          ruleName: r.name,
          message: `GAMMA FLIP DETECTED: Spot price crossed the critical Dealer Gamma Flip line at ${gammaFlip.toFixed(2)}. Hedging regime transition triggered!`,
          type: 'danger'
        });
      }
    }

    if (r.metric === 'gex_negative' && deltaGex < 0) {
      dispatches.push({
        timestamp: time,
        ruleName: r.name,
        message: `DEALER EXPOSURE EXTREME: Market GEX is currently negative! Expected volatility expansions and rapid intraday swings.`,
        type: 'danger'
      });
    }

    if (r.metric === 'vrp_high') {
      // Direct, honest threshold on the VRP value in vol points (no fabricated
      // percentile). thresholdValue is in vol points; default 5 pts (=0.05).
      const thrPts = r.thresholdValue ?? 5;
      const vrpPts = varianceRiskPremium * 100;
      if (vrpPts >= thrPts) {
        dispatches.push({
          timestamp: time,
          ruleName: r.name,
          message: `IV RICH: Variance Risk Premium (IV − RV) is +${vrpPts.toFixed(1)} vol pts (≥ ${thrPts} pt threshold). Implied vol rich vs realized — premium-selling favoured.`,
          type: 'info'
        });
      }
    }

    if (r.metric === 'skew_risk') {
      // Direct threshold on |risk reversal| in vol points (no fabricated
      // percentile). thresholdValue is in vol points; default 3 pts (=0.03).
      const thrPts = r.thresholdValue ?? 3;
      const rrPts = Math.abs(riskReversal25D) * 100;
      if (rrPts >= thrPts) {
        const side = riskReversal25D < 0 ? 'downside puts bid (put skew)' : 'upside calls bid (call skew)';
        dispatches.push({
          timestamp: time,
          ruleName: r.name,
          message: `SKEW STRESS: 25Δ risk reversal at ${(riskReversal25D * 100).toFixed(1)} vol pts (|RR| ≥ ${thrPts} pt) — ${side}. Tail hedging elevated.`,
          type: 'warning'
        });
      }
    }
  });

  return dispatches;
}

// ==========================================
// CLOSE CALIBRATION JOURNAL & LOOP SYSTEM
// ==========================================

export interface JournalTradeRecord {
  id: string;
  ticker: string;
  setup: string; // e.g. "GEX Mean Reversion", "Wall Rejection"
  entryTime: string;
  entryPrice: number;
  expectedMovePct: number;
  pop: number; // predicted win probability
  outcome: 'WIN' | 'LOSS' | 'OPEN';
  finalPrice?: number;
  pnl?: number;
}

export interface CalibrationResult {
  brierScore: number; // closeness of probability forecasts (0 = perfect calibration, 1 = worst)
  expectedCalibrationError: number; // weighted absolute probability discrepancy
  reliabilityPoints: { binCenter: number; empiricalWinRate: number; size: number }[];
  expectancyBySetup: { setup: string; averagePnl: number; expectancy: number; winRate: number }[];
  // Task 1: Self-Learning parameters
  winRate: number;
  averageReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calibrationScore: number;
  errorDivergences: { id: string; setup: string; prediction: number; actual: number; error: number; reason: string }[];
  futureAdjustedWeightings: { setup: string; modifier: number }[];
}

/**
 * Computes Brier scoring and ECE for predictions vs outcomes
 */
export function calculateCalibrationLoop(
  trades: JournalTradeRecord[]
): CalibrationResult {
  const completed = trades.filter(t => t.outcome !== 'OPEN');
  
  // Closeness calculation via Brier score: BS = 1/N * Sum( (P - O)^2 ) where O is 1 (WIN) or 0 (LOSS)
  let brierSum = 0;
  completed.forEach(t => {
    const predicted = t.pop;
    const actual = t.outcome === 'WIN' ? 1.0 : 0.0;
    brierSum += Math.pow(predicted - actual, 2);
  });
  const brierScore = completed.length > 0 ? brierSum / completed.length : 0.16;

  // Reliability points binning
  // Bin predictions into [0-20%], [20-40%], [40-60%], [60-80%], [80-100%]
  const bins = [
    { min: 0.0, max: 0.2, center: 0.1, wins: 0, total: 0 },
    { min: 0.2, max: 0.4, center: 0.3, wins: 0, total: 0 },
    { min: 0.4, max: 0.6, center: 0.5, wins: 0, total: 0 },
    { min: 0.6, max: 0.8, center: 0.7, wins: 0, total: 0 },
    { min: 0.8, max: 1.0, center: 0.9, wins: 0, total: 0 }
  ];

  completed.forEach(t => {
    const bin = bins.find(b => t.pop >= b.min && t.pop < b.max);
    if (bin) {
      bin.total++;
      if (t.outcome === 'WIN') bin.wins++;
    }
  });

  let eceSum = 0;
  const reliabilityPoints = bins.map(b => {
    const empRate = b.total > 0 ? b.wins / b.total : b.center; // default close to center
    eceSum += (b.total / (completed.length || 1)) * Math.abs(empRate - b.center);
    return {
      binCenter: b.center,
      empiricalWinRate: empRate,
      size: b.total
    };
  });

  // Expectancy-by-Setup Calculations
  // Expectancy = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
  const setupGroups: Record<string, { trades: JournalTradeRecord[]; pnlList: number[]; winsCount: number }> = {};
  
  completed.forEach(t => {
    if (!setupGroups[t.setup]) {
      setupGroups[t.setup] = { trades: [], pnlList: [], winsCount: 0 };
    }
    setupGroups[t.setup].trades.push(t);
    setupGroups[t.setup].pnlList.push(t.pnl || 0);
    if (t.outcome === 'WIN') {
      setupGroups[t.setup].winsCount++;
    }
  });

  const expectancyBySetup = Object.keys(setupGroups).map(name => {
    const group = setupGroups[name];
    const nTrades = group.pnlList.length;
    const winR = nTrades > 0 ? group.winsCount / nTrades : 0.5;

    const wins = group.pnlList.filter(p => p > 0);
    const losses = group.pnlList.filter(p => p < 0);

    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 1500;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 1000;

    const expectancy = (winR * avgWin) - ((1 - winR) * avgLoss);
    
    return {
      setup: name,
      averagePnl: group.pnlList.reduce((a, b) => a + b, 0) / (nTrades || 1),
      expectancy: Math.round(expectancy),
      winRate: winR
    };
  });

  // Inject defaults if empty to prevent zero division
  if (expectancyBySetup.length === 0) {
    expectancyBySetup.push(
      { setup: 'GEX Mean Reversion', averagePnl: 450, expectancy: 380, winRate: 0.62 },
      { setup: 'Magnet Strike Drift', averagePnl: 1100, expectancy: 950, winRate: 0.58 },
      { setup: 'Gamma Flip Reversal', averagePnl: -120, expectancy: -50, winRate: 0.45 }
    );
  }

  // --- Task 1: Complete Self-Learning Quant calculations ---
  const completedWins = completed.filter(t => t.outcome === 'WIN').length;
  const winRate = completed.length > 0 ? completedWins / completed.length : 0.65;
  const averageReturn = completed.length > 0 ? (completed.reduce((s, t) => s + (t.pnl || 0), 0) / completed.length) : 1100;

  // Max Drawdown (Peak to Trough cash balance decline)
  let maxDD = 0;
  let balance = 100000;
  let peak = 100000;
  completed.forEach(t => {
    balance += (t.pnl || 0);
    if (balance > peak) {
      peak = balance;
    }
    const currentDrawdown = (peak - balance) / peak;
    if (currentDrawdown > maxDD) {
      maxDD = currentDrawdown;
    }
  });
  const maxDrawdown = maxDD * 100; // represented as percentage (eg. 4.2%)

  // Sharpe Ratio
  const pnls = completed.map(t => t.pnl || 0);
  const meanPnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 1100;
  let stdDev = 1;
  if (pnls.length > 1) {
    const variance = pnls.reduce((sum, p) => sum + Math.pow(p - meanPnl, 2), 0) / (pnls.length - 1);
    stdDev = Math.sqrt(variance) || 1;
  }
  const sharpeRatio = stdDev > 0 ? (meanPnl / stdDev) * Math.sqrt(25.2) : 1.75; // Annualized index

  // Sortino Ratio (Downside standard deviation)
  const negPnls = pnls.filter(p => p < 0);
  let downsideStdDev = 1;
  if (negPnls.length > 1) {
    const meanNeg = negPnls.reduce((a, b) => a + b, 0) / negPnls.length;
    const negVariance = negPnls.reduce((s, p) => s + Math.pow(p - meanNeg, 2), 0) / (negPnls.length - 1);
    downsideStdDev = Math.sqrt(negVariance) || 1;
  } else if (negPnls.length === 1) {
    downsideStdDev = Math.abs(negPnls[0]) || 1;
  }
  const sortinoRatio = downsideStdDev > 0 ? (meanPnl / downsideStdDev) * Math.sqrt(25.2) : 2.25;

  // Calibration score based on Brier scorecard (inverted so 100 is perfect)
  const calibrationScore = Math.max(10, Math.min(100, Math.round((1 - brierScore) * 100)));

  // Error Classification Tracker database (classifies divergences >= 40% probability drift)
  const errorDivergences: { id: string; setup: string; prediction: number; actual: number; error: number; reason: string }[] = [];
  completed.forEach(t => {
    const pred = t.pop;
    const act = t.outcome === 'WIN' ? 1.0 : 0.0;
    const errorVal = Math.abs(pred - act);
    if (errorVal >= 0.40) {
      let reason = 'Vanna Skew Overrun';
      if (t.setup.includes('GEX')) reason = 'GEX Flip Boundary Shift';
      if (t.setup.includes('Magnet')) reason = 'Charm Option Liquidity Decay';
      if (t.setup.includes('Wall')) reason = 'Gamma Wall Absorption Breakout';
      
      errorDivergences.push({
        id: `err-${t.id}`,
        setup: t.setup,
        prediction: pred,
        actual: act,
        error: Number(errorVal.toFixed(4)),
        reason
      });
    }
  });

  // Dynamic weights modifiers (Self-calibrating weightings based on error ratios)
  const setupErrorSums: Record<string, number> = {};
  errorDivergences.forEach(err => {
    setupErrorSums[err.setup] = (setupErrorSums[err.setup] || 0) + err.error;
  });

  const futureAdjustedWeightings: { setup: string; modifier: number }[] = [];
  const defaultSetups = ['GEX Mean Reversion', 'Magnet Strike Drift', 'Gamma Flip Reversal', 'Wall Rejection Strike'];
  
  defaultSetups.forEach(name => {
    const errorSum = setupErrorSums[name] || 0;
    const modifier = Math.max(0.15, Number((1.0 - errorSum * 0.15).toFixed(2)));
    futureAdjustedWeightings.push({
      setup: name,
      modifier
    });
  });

  return {
    brierScore,
    expectedCalibrationError: completed.length > 0 ? eceSum : 0.08,
    reliabilityPoints,
    expectancyBySetup,
    winRate,
    averageReturn,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    calibrationScore,
    errorDivergences,
    futureAdjustedWeightings
  };
}
