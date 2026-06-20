/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { stdNormalCDF, stdNormalPDF } from './v11Math';

export interface SVIParams {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

export interface RndNode {
  strike: number;
  impliedDensity: number;      // Breeden-Litzenberger relative density
  historicalDensity: number;    // Historical lognormal density
  impliedVol: number;           // SVI implied volatility smile value
  cumulativeImplied: number;    // RND cumulative distribution
  cumulativeHistorical: number; // Historical cumulative distribution
}

export interface BreedenLitzenbergerAnalysis {
  nodes: RndNode[];
  impliedMean: number;
  impliedStdDev: number;
  historicalMean: number;
  historicalStdDev: number;
  gexConcentrationPeak: number;
  entropyDivergence: number; // Kullback-Leibler divergence between implied and historical
  isVolSkewSkewed: boolean;
}

// Gatheral SVI Implied Variance formulation: w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))
export function calculateRawSVI(k: number, params: SVIParams): number {
  const { a, b, rho, m, sigma } = params;
  const inner = (k - m) * (k - m) + sigma * sigma;
  return a + b * (rho * (k - m) + Math.sqrt(Math.max(1e-9, inner)));
}

// Convert SVI total variance to option implied volatility: Iv = sqrt(w(k) / T)
export function getSviImpliedVol(strike: number, spot: number, params: SVIParams, T: number): number {
  if (spot <= 0 || strike <= 0) return 0.20;
  const k = Math.log(strike / spot); // log-moneyness
  const totalVariance = calculateRawSVI(k, params);
  const iv = Math.sqrt(Math.max(1e-4, totalVariance / T));
  return Math.max(0.01, Math.min(2.5, iv)); // clamp to realistic options bounds
}

// Analytically compute Black-Scholes Call price
export function calculateBSCallPrice(
  spot: number,
  strike: number,
  T: number,
  iv: number,
  r = 0.05,
  q = 0.0
): number {
  if (spot <= 0 || strike <= 0 || T <= 0) return 0;
  const d1 = (Math.log(spot / strike) + (r - q + (iv * iv) / 2) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);

  const price = spot * Math.exp(-q * T) * stdNormalCDF(d1) - strike * Math.exp(-r * T) * stdNormalCDF(d2);
  return Math.max(0.0, price);
}

// Default realistic SVI parameters for standard indexes/assets to ensure no mock math
export const DEFAULT_SVI_PARAMETERS: Record<string, SVIParams> = {
  SPX: { a: 0.038, b: 0.065, rho: -0.68, m: 0.015, sigma: 0.12 },
  NDX: { a: 0.045, b: 0.075, rho: -0.62, m: 0.020, sigma: 0.14 },
  RUT: { a: 0.042, b: 0.070, rho: -0.55, m: 0.010, sigma: 0.15 },
  QQQ: { a: 0.046, b: 0.078, rho: -0.60, m: 0.022, sigma: 0.14 },
  SPY: { a: 0.039, b: 0.066, rho: -0.67, m: 0.016, sigma: 0.13 },
};

export const DEFAULT_HISTORICAL_VOLATILITY: Record<string, number> = {
  SPX: 0.132,
  NDX: 0.158,
  RUT: 0.175,
  QQQ: 0.155,
  SPY: 0.130,
};

/**
 * Executes high-precision Breeden-Litzenberger PDE differentiation
 * to solve the Implied PDF + compares with historical lognormal PDF
 */
export function computeRndProfile(
  spot: number,
  ticker: string,
  dteDays: number,
  r = 0.05,
  customVols?: number
): BreedenLitzenbergerAnalysis {
  const T = Math.max(0.005, dteDays / 365);
  const sviParams = DEFAULT_SVI_PARAMETERS[ticker] || DEFAULT_SVI_PARAMETERS.SPX;
  const histVol = customVols ?? (DEFAULT_HISTORICAL_VOLATILITY[ticker] || 0.15);

  // Set up dense grid centered around spot
  const rangePct = 0.30; // +/- 30% strike coverage
  const numSteps = 120;
  const minStrike = spot * (1.0 - rangePct);
  const maxStrike = spot * (1.0 + rangePct);
  const ds = (maxStrike - minStrike) / numSteps;

  const nodes: RndNode[] = [];
  // Finite-difference step for the Breeden-Litzenberger second derivative. A fixed
  // $0.50 bump is far smaller than the grid spacing (~0.5% of spot, e.g. ~$25 for
  // SPX), so on a high-priced underlying callUp−2·callMid+callDn collapses into
  // floating-point cancellation noise. Scale the step to spot for a well-resolved
  // density while keeping a sane floor for low-priced names.
  const dK = Math.max(0.5, spot * 0.0025);

  let sumImplied = 0;
  let sumHistoric = 0;

  // Step 1: Compute raw derivative probability densities
  for (let i = 0; i <= numSteps; i++) {
    const K = minStrike + i * ds;

    // A: Breeden-Litzenberger Implied Probability calculation
    // Implied IV from Gatheral SVI
    const ivK = getSviImpliedVol(K, spot, sviParams, T);
    const ivUp = getSviImpliedVol(K + dK, spot, sviParams, T);
    const ivDn = getSviImpliedVol(K - dK, spot, sviParams, T);

    const callMid = calculateBSCallPrice(spot, K, T, ivK, r);
    const callUp = calculateBSCallPrice(spot, K + dK, T, ivUp, r);
    const callDn = calculateBSCallPrice(spot, K - dK, T, ivDn, r);

    // Discrete 2nd derivative approximation:
    const secondDeriv = (callUp - 2 * callMid + callDn) / (dK * dK);
    let impliedDensity = Math.exp(r * T) * secondDeriv;
    if (isNaN(impliedDensity) || impliedDensity < 0) impliedDensity = 0;

    // B: Historical Lognormal Density calculation
    // f_historical(K) = 1 / (K * v * sqrt(2*pi*T)) * exp(- (ln(K/S) - (r - v^2/2)T)^2 / (2 * v^2 * T))
    const v = histVol;
    const stdDevT = v * Math.sqrt(T);
    const logMoneyness = Math.log(K / spot);
    const drift = (r - (v * v) / 2) * T;
    const exponent = -Math.pow(logMoneyness - drift, 2) / (2 * stdDevT * stdDevT);
    const denom = K * stdDevT * Math.sqrt(2 * Math.PI);
    let historicalDensity = denom > 0 ? Math.exp(exponent) / denom : 0;
    if (isNaN(historicalDensity) || historicalDensity < 0) historicalDensity = 0;

    nodes.push({
      strike: K,
      impliedDensity,
      historicalDensity,
      impliedVol: ivK,
      cumulativeImplied: 0,
      cumulativeHistorical: 0,
    });

    sumImplied += impliedDensity * ds;
    sumHistoric += historicalDensity * ds;
  }

  // Step 2: Normalize distributions so area under curves equals 1.0 (continuous probability standard)
  let runCumImplied = 0;
  let runCumHistoric = 0;

  const normalizedNodes = nodes.map(n => {
    const normImplied = sumImplied > 0 ? n.impliedDensity / sumImplied : 0;
    const normHistoric = sumHistoric > 0 ? n.historicalDensity / sumHistoric : 0;

    runCumImplied += normImplied * ds;
    runCumHistoric += normHistoric * ds;

    return {
      ...n,
      impliedDensity: normImplied,
      historicalDensity: normHistoric,
      cumulativeImplied: Math.min(1.0, runCumImplied),
      cumulativeHistorical: Math.min(1.0, runCumHistoric),
    };
  });

  // Step 3: Compute Expected Values (Means) and Implied Standard Deviations (Dispersions)
  let impliedMean = 0;
  normalizedNodes.forEach(n => impliedMean += n.strike * n.impliedDensity * ds);
  if (impliedMean <= 0) impliedMean = spot;

  let impliedVar = 0;
  normalizedNodes.forEach(n => {
    impliedVar += Math.pow(n.strike - impliedMean, 2) * n.impliedDensity * ds;
  });
  const impliedStdDev = Math.sqrt(Math.max(1e-2, impliedVar));

  let historicalMean = 0;
  normalizedNodes.forEach(n => historicalMean += n.strike * n.historicalDensity * ds);
  if (historicalMean <= 0) historicalMean = spot;

  let historicalVar = 0;
  normalizedNodes.forEach(n => {
    historicalVar += Math.pow(n.strike - historicalMean, 2) * n.historicalDensity * ds;
  });
  const historicalStdDev = Math.sqrt(Math.max(1e-2, historicalVar));

  // Step 4: Identify GEX Concentration Peak (where options market is placing dynamic dealer anchors)
  let maxImpliedDens = -1;
  let gexConcentrationPeak = spot;
  normalizedNodes.forEach(n => {
    if (n.impliedDensity > maxImpliedDens) {
      maxImpliedDens = n.impliedDensity;
      gexConcentrationPeak = n.strike;
    }
  });

  // Step 5: Kullback-Leibler Relative Entropy Divergence
  // KL = sum[ P(x) * log(P(x) / Q(x)) ]
  let entropyDivergence = 0;
  normalizedNodes.forEach(n => {
    const p = n.impliedDensity;
    const q = n.historicalDensity;
    if (p > 1e-7 && q > 1e-7) {
      entropyDivergence += p * Math.log(p / q) * ds;
    }
  });

  const isVolSkewSkewed = Math.abs(sviParams.rho) > 0.5;

  return {
    nodes: normalizedNodes,
    impliedMean,
    impliedStdDev,
    historicalMean,
    historicalStdDev,
    gexConcentrationPeak,
    entropyDivergence: Math.max(0, entropyDivergence),
    isVolSkewSkewed,
  };
}
