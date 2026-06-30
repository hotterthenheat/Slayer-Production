/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MONTE CARLO PATH-SIMULATION ENGINE
 * ----------------------------------
 * Real risk-neutral path simulation for the underlying, under three processes:
 *
 *   • GBM      — geometric Brownian motion: dS = rS dt + σS dW
 *   • JUMP     — Merton jump-diffusion: GBM + compound-Poisson log-normal jumps
 *   • HESTON   — stochastic volatility: dv = κ(θ−v)dt + ξ√v dW₂, corr(dW₁,dW₂)=ρ
 *
 * Deterministic: a seeded PRNG (mulberry32) + Box–Muller normals, so a given
 * (inputs, seed) reproduces the same paths exactly — the animation is the model,
 * not disconnected noise. Memory-bounded: terminal values drive the statistics
 * while only a small set of full sample paths is retained for rendering.
 *
 * Correctness is checked in tests/monteCarlo.test.ts against the closed-form
 * GBM terminal moments: E[S_T] = S·e^{rT}, Var[S_T] = S²e^{2rT}(e^{σ²T}−1).
 */

export type MCModel = 'gbm' | 'jump' | 'heston';

export interface JumpParams { lambda: number; muJ: number; sigJ: number } // intensity /yr, mean & sd of log jump
export interface HestonParams { kappa: number; theta: number; xi: number; rho: number; v0: number }

export interface MCParams {
  spot: number;
  r: number;        // risk-neutral drift (annualized)
  sigma: number;    // annualized vol (GBM/JUMP diffusion component; √v0 used for HESTON display)
  tYears: number;   // horizon in years
  steps: number;    // time steps per path
  nPaths: number;   // total simulated paths (statistics)
  model: MCModel;
  seed: number;
  samplePaths?: number; // full paths retained for rendering (default 80)
  jump?: JumpParams;
  heston?: HestonParams;
}

export interface MCResult {
  model: MCModel;
  spot: number;
  tYears: number;
  nPaths: number;
  samplePaths: number[][];   // [pathIdx][stepIdx] price, length = min(samplePaths, nPaths)
  terminalMean: number;
  terminalStd: number;
  percentiles: { p05: number; p25: number; p50: number; p75: number; p95: number };
  var95: number; var99: number;   // Value-at-Risk on return (positive = loss fraction)
  es95: number; es99: number;     // Expected Shortfall (CVaR) on return
  probUp: number;                 // P(S_T > spot)
  expectedReturnPct: number;      // (mean/spot − 1)
  histogram: { edges: number[]; counts: number[] };
  analyticGbmMean: number;        // S·e^{rT} (validation reference; exact for GBM)
}

// --- Deterministic PRNG: mulberry32 + Box–Muller normals ---
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNormal(seed: number) {
  const u = mulberry32(seed);
  let spare: number | null = null;
  return function next(): number {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u1 = u(); if (u1 < 1e-12) u1 = 1e-12;
    const u2 = u();
    const mag = Math.sqrt(-2 * Math.log(u1));
    spare = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
  };
}

function poisson(lambdaDt: number, uni: () => number): number {
  // Knuth, fine for the small λ·dt encountered here.
  const L = Math.exp(-lambdaDt);
  let k = 0, p = 1;
  do { k++; p *= uni(); } while (p > L);
  return k - 1;
}

export function simulateMonteCarlo(params: MCParams): MCResult {
  const { spot, r, sigma, tYears, model, seed } = params;
  const steps = Math.max(1, Math.min(1000, Math.floor(params.steps)));
  const nPaths = Math.max(1, Math.min(200000, Math.floor(params.nPaths)));
  const keep = Math.max(0, Math.min(params.samplePaths ?? 80, nPaths));
  const dt = tYears / steps;
  const sqrtDt = Math.sqrt(dt);

  const normal = makeNormal(seed >>> 0);
  const uni = mulberry32((seed ^ 0x9e3779b9) >>> 0); // independent stream for jump counts

  const jump = params.jump ?? { lambda: 0, muJ: 0, sigJ: 0 };
  // Martingale compensator so the jump component is risk-neutral (drift unchanged in expectation).
  const kappaJ = Math.exp(jump.muJ + 0.5 * jump.sigJ * jump.sigJ) - 1;
  const h = params.heston ?? { kappa: 1.5, theta: sigma * sigma, xi: 0.3, rho: -0.6, v0: sigma * sigma };

  const terminal = new Float64Array(nPaths);
  const samplePaths: number[][] = [];

  for (let p = 0; p < nPaths; p++) {
    let S = spot;
    let v = h.v0;
    const record = p < keep;
    const path: number[] = record ? new Array(steps + 1) : [];
    if (record) path[0] = S;

    for (let t = 0; t < steps; t++) {
      if (model === 'heston') {
        const z1 = normal();
        const z2raw = normal();
        const z2 = h.rho * z1 + Math.sqrt(1 - h.rho * h.rho) * z2raw; // correlate
        const vPos = Math.max(0, v);
        const sq = Math.sqrt(vPos);
        S = S * Math.exp((r - 0.5 * vPos) * dt + sq * sqrtDt * z1);
        // Full-truncation Euler for the variance process.
        v = vPos + h.kappa * (h.theta - vPos) * dt + h.xi * sq * sqrtDt * z2;
      } else {
        const z = normal();
        let drift = (r - 0.5 * sigma * sigma) * dt;
        let dJump = 0;
        if (model === 'jump' && jump.lambda > 0) {
          drift -= jump.lambda * kappaJ * dt; // compensator
          const nJ = poisson(jump.lambda * dt, uni);
          for (let j = 0; j < nJ; j++) dJump += jump.muJ + jump.sigJ * normal();
        }
        S = S * Math.exp(drift + sigma * sqrtDt * z + dJump);
      }
      if (record) path[t + 1] = S;
    }
    terminal[p] = S;
    if (record) samplePaths.push(path);
  }

  // --- Statistics off the terminal distribution ---
  let sum = 0;
  for (let i = 0; i < nPaths; i++) sum += terminal[i];
  const mean = sum / nPaths;
  let varAcc = 0, up = 0;
  for (let i = 0; i < nPaths; i++) { const d = terminal[i] - mean; varAcc += d * d; if (terminal[i] > spot) up++; }
  const std = Math.sqrt(varAcc / Math.max(1, nPaths - 1));

  const sorted = Float64Array.from(terminal).sort();
  const q = (pp: number) => sorted[Math.min(nPaths - 1, Math.max(0, Math.floor(pp * (nPaths - 1))))];
  const percentiles = { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) };

  // VaR / ES on the return distribution (loss = positive). Lower tail of terminal price.
  const retLoss = (price: number) => (spot - price) / spot; // >0 ⇒ loss
  const var95 = retLoss(q(0.05)), var99 = retLoss(q(0.01));
  const tailMean = (alpha: number) => {
    const n = Math.max(1, Math.floor(alpha * nPaths));
    let acc = 0; for (let i = 0; i < n; i++) acc += retLoss(sorted[i]);
    return acc / n;
  };
  const es95 = tailMean(0.05), es99 = tailMean(0.01);

  // Histogram over [p01, p99] for a clean render (clip extreme tails).
  const lo = q(0.01), hi = q(0.99), nb = 48;
  const edges: number[] = [], counts = new Array(nb).fill(0);
  const span = (hi - lo) || 1;
  for (let b = 0; b <= nb; b++) edges.push(lo + (span * b) / nb);
  for (let i = 0; i < nPaths; i++) {
    const x = terminal[i];
    if (x < lo || x > hi) continue;
    let b = Math.floor(((x - lo) / span) * nb);
    if (b >= nb) b = nb - 1; if (b < 0) b = 0;
    counts[b]++;
  }

  return {
    model, spot, tYears, nPaths, samplePaths,
    terminalMean: mean, terminalStd: std, percentiles,
    var95, var99, es95, es99,
    probUp: up / nPaths,
    expectedReturnPct: mean / spot - 1,
    histogram: { edges, counts },
    analyticGbmMean: spot * Math.exp(r * tYears),
  };
}
