/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Risk-neutral probability density (Breeden–Litzenberger). The market-implied
 * distribution of the underlying at expiry is the discounted second derivative
 * of the call price w.r.t. strike:  f(K) = e^{rT} · ∂²C/∂K².
 *
 * We reconstruct a smooth call-price curve from the chain's IV smile (BSM repriced
 * on a fine strike grid), differentiate it numerically, and normalise — giving
 * "the chain is pricing an X% chance price is above K by expiry", percentiles, an
 * implied expected move, and a fat-tail score vs. a lognormal benchmark.
 * Fully keyless: works on the synthetic chain.
 */
import { stdNormalCDF } from './normalDist';
import { ChainContract } from './v11Math';

/** Raw BSM call price (no liquidity floor — needed for clean second differences). */
function bsCall(S: number, K: number, T: number, sigma: number, r = 0.05, q = 0): number {
  if (!(S > 0) || !(K > 0)) return 0;
  if (!(T > 0) || !(sigma > 0)) return Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T));
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return S * Math.exp(-q * T) * stdNormalCDF(d1) - K * Math.exp(-r * T) * stdNormalCDF(d2);
}

/** Build an IV(strike) interpolator from the chain's smile (uses call IVs, blends puts). */
function buildIvSmile(chain: ChainContract[]): (k: number) => number {
  const byStrike = new Map<number, { sum: number; n: number }>();
  for (const c of chain) {
    if (!(c.iv > 0)) continue;
    const e = byStrike.get(c.strike) || { sum: 0, n: 0 };
    e.sum += c.iv; e.n += 1;
    byStrike.set(c.strike, e);
  }
  const pts = [...byStrike.entries()].map(([strike, e]) => ({ strike, iv: e.sum / e.n })).sort((a, b) => a.strike - b.strike);
  if (!pts.length) return () => 0.2;
  return (k: number) => {
    if (k <= pts[0].strike) return pts[0].iv;
    if (k >= pts[pts.length - 1].strike) return pts[pts.length - 1].iv;
    for (let i = 1; i < pts.length; i++) {
      if (k <= pts[i].strike) {
        const a = pts[i - 1], b = pts[i];
        const t = (k - a.strike) / (b.strike - a.strike);
        return a.iv + (b.iv - a.iv) * t;
      }
    }
    return pts[pts.length - 1].iv;
  };
}

export interface RiskNeutralResult {
  dteDays: number;
  forward: number;
  atmIv: number;
  /** P(S_T > spot). */
  pAboveSpot: number;
  /** Probabilities at reference levels (spot ±1/2/3%). */
  levels: { label: string; price: number; pAbove: number }[];
  percentiles: { p5: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number };
  /** Implied 1-sigma move at this expiry, as a % of spot, from the RND. */
  expectedMovePct: number;
  /** RND density of |return| in the tails vs. a same-vol lognormal (>1 ⇒ fatter tails). */
  fatTailRatio: number;
  skewBias: 'DOWNSIDE SKEW' | 'UPSIDE SKEW' | 'SYMMETRIC';
  /** Down-sampled density for charting: terminal price k and density f. */
  density: { k: number; f: number }[];
}

/**
 * Compute the risk-neutral density and its summary statistics from an option chain.
 */
export function computeRiskNeutralDensity(
  chain: ChainContract[],
  spot: number,
  dteDays: number,
  r = 0.05,
): RiskNeutralResult | null {
  if (!chain || chain.length === 0 || !(spot > 0)) return null;
  const T = Math.max(dteDays, 0.25) / 365;
  const ivAt = buildIvSmile(chain);
  const atmIv = ivAt(spot) || 0.2;

  // Fine strike grid spanning a wide range around spot (covers the realistic tails).
  const lo = spot * 0.55;
  const hi = spot * 1.6;
  const N = 220;
  const dK = (hi - lo) / N;
  const strikes: number[] = [];
  const calls: number[] = [];
  for (let i = 0; i <= N; i++) {
    const K = lo + i * dK;
    strikes.push(K);
    calls.push(bsCall(spot, K, T, Math.max(0.01, ivAt(K)), r));
  }

  // f(K) = e^{rT} · C''(K) via central second difference; clamp numerical negatives.
  const disc = Math.exp(r * T);
  const density: number[] = new Array(strikes.length).fill(0);
  for (let i = 1; i < strikes.length - 1; i++) {
    const c2 = (calls[i + 1] - 2 * calls[i] + calls[i - 1]) / (dK * dK);
    density[i] = Math.max(0, disc * c2);
  }
  // Normalise to a proper PDF over the grid.
  let mass = 0;
  for (let i = 0; i < density.length; i++) mass += density[i] * dK;
  if (!(mass > 0)) return null;
  for (let i = 0; i < density.length; i++) density[i] /= mass;

  // CDF helper: P(S_T <= x).
  const cdf = (x: number): number => {
    let acc = 0;
    for (let i = 0; i < strikes.length; i++) {
      if (strikes[i] > x) break;
      acc += density[i] * dK;
    }
    return Math.min(1, Math.max(0, acc));
  };
  const pAbove = (x: number) => 1 - cdf(x);

  // Inverse CDF for percentiles.
  const quantile = (q: number): number => {
    let acc = 0;
    for (let i = 0; i < strikes.length; i++) {
      acc += density[i] * dK;
      if (acc >= q) return strikes[i];
    }
    return strikes[strikes.length - 1];
  };

  // Mean / std of the RND.
  let mean = 0;
  for (let i = 0; i < strikes.length; i++) mean += strikes[i] * density[i] * dK;
  let variance = 0;
  for (let i = 0; i < strikes.length; i++) variance += (strikes[i] - mean) * (strikes[i] - mean) * density[i] * dK;
  const std = Math.sqrt(Math.max(0, variance));
  const expectedMovePct = spot > 0 ? std / spot : 0;

  // Fat-tail: RND mass beyond ±2σ vs. a lognormal with the same ATM IV.
  const twoSigUp = spot * (1 + 2 * expectedMovePct);
  const twoSigDn = spot * (1 - 2 * expectedMovePct);
  const rndTail = pAbove(twoSigUp) + cdf(twoSigDn);
  // Lognormal benchmark: P(|Z| > 2) ≈ 0.0455 (symmetric, before drift) — use as the reference.
  const lnTail = 0.0455;
  const fatTailRatio = lnTail > 0 ? rndTail / lnTail : 1;

  const p50 = quantile(0.5);
  let skewBias: RiskNeutralResult['skewBias'] = 'SYMMETRIC';
  if (mean < p50 * 0.997) skewBias = 'DOWNSIDE SKEW';
  else if (mean > p50 * 1.003) skewBias = 'UPSIDE SKEW';

  const levels = [0.01, 0.02, 0.03].flatMap((m) => [
    { label: `+${(m * 100).toFixed(0)}%`, price: spot * (1 + m), pAbove: pAbove(spot * (1 + m)) },
    { label: `-${(m * 100).toFixed(0)}%`, price: spot * (1 - m), pAbove: pAbove(spot * (1 - m)) },
  ]);

  // Down-sample density for charting (keep it light for the SSE payload).
  const target = 56;
  const step = Math.max(1, Math.floor(strikes.length / target));
  const downsampled: { k: number; f: number }[] = [];
  for (let i = 0; i < strikes.length; i += step) downsampled.push({ k: Number(strikes[i].toFixed(2)), f: density[i] });

  return {
    dteDays,
    forward: Number((spot * Math.exp(r * T)).toFixed(2)),
    atmIv,
    pAboveSpot: pAbove(spot),
    levels,
    percentiles: {
      p5: quantile(0.05), p10: quantile(0.1), p25: quantile(0.25), p50,
      p75: quantile(0.75), p90: quantile(0.9), p95: quantile(0.95),
    },
    expectedMovePct,
    fatTailRatio,
    skewBias,
    density: downsampled,
  };
}

/** P(a <= S_T <= b) from a computed density (helper for UI range queries). */
export function probInRange(result: RiskNeutralResult, a: number, b: number): number {
  if (!result?.density?.length) return 0;
  const d = result.density;
  const dk = d.length > 1 ? d[1].k - d[0].k : 1;
  let acc = 0;
  for (const p of d) if (p.k >= a && p.k <= b) acc += p.f * dk;
  return Math.min(1, Math.max(0, acc));
}
