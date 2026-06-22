/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trader-facing skew analytics derived from the option chain's IV smile:
 * 25-delta risk reversal, 25-delta butterfly, ATM IV, and the at-the-money skew
 * slope (∂IV/∂ln K). These are the dials dealer-flow desks actually watch; pair
 * them with the rolling-percentile ring buffer in the engine for "steepening vs
 * flattening" context. Keyless.
 */
import { ChainContract } from './v11Math';

/** Interpolate the IV of one option side at a target |delta| (e.g. 0.25). */
export function ivAtDelta(side: ChainContract[], targetAbsDelta: number): number | null {
  const pts = side
    .filter((c) => isFinite(c.delta) && isFinite(c.iv) && c.iv > 0)
    .map((c) => ({ ad: Math.abs(c.delta), iv: c.iv }))
    .sort((a, b) => a.ad - b.ad);
  if (pts.length === 0) return null;
  if (pts.length === 1) return pts[0].iv;
  if (targetAbsDelta <= pts[0].ad) return pts[0].iv;
  if (targetAbsDelta >= pts[pts.length - 1].ad) return pts[pts.length - 1].iv;
  for (let i = 1; i < pts.length; i++) {
    if (targetAbsDelta <= pts[i].ad) {
      const a = pts[i - 1], b = pts[i];
      const t = (targetAbsDelta - a.ad) / (b.ad - a.ad || 1);
      return a.iv + (b.iv - a.iv) * t;
    }
  }
  return pts[pts.length - 1].iv;
}

export interface SkewResult {
  atmIv: number;
  callIv25: number;
  putIv25: number;
  /** Risk reversal (put 25Δ IV − call 25Δ IV). Positive ⇒ downside puts bid (equity-typical). */
  riskReversal25: number;
  /** Butterfly (avg wing IV − ATM IV). Positive ⇒ convex smile / wing demand. */
  butterfly25: number;
  /** ∂IV/∂ln(K) near the money. Negative ⇒ classic equity put skew. */
  skewSlope: number;
  bias: 'PUT SKEW' | 'CALL SKEW' | 'FLAT';
}

export function computeSkew(chain: ChainContract[], spot: number): SkewResult | null {
  if (!chain || chain.length === 0 || !(spot > 0)) return null;
  const calls = chain.filter((c) => c.type === 'call');
  const puts = chain.filter((c) => c.type === 'put');

  // ATM IV = IV at the strike nearest spot (blend call+put if both present).
  const nearest = chain.reduce((b, c) => (Math.abs(c.strike - spot) < Math.abs(b.strike - spot) ? c : b), chain[0]);
  const atmStrike = nearest.strike;
  const atmSet = chain.filter((c) => c.strike === atmStrike && c.iv > 0);
  const atmIv = atmSet.length ? atmSet.reduce((a, c) => a + c.iv, 0) / atmSet.length : nearest.iv;

  const callIv25 = ivAtDelta(calls, 0.25) ?? atmIv;
  const putIv25 = ivAtDelta(puts, 0.25) ?? atmIv;

  const riskReversal25 = putIv25 - callIv25;
  const butterfly25 = (callIv25 + putIv25) / 2 - atmIv;

  // Skew slope: ∂IV/∂ln(K) from the two strikes straddling ATM.
  const sorted = [...new Map(chain.map((c) => [c.strike, c])).values()]
    .map((c) => {
      const set = chain.filter((x) => x.strike === c.strike && x.iv > 0);
      const iv = set.length ? set.reduce((a, x) => a + x.iv, 0) / set.length : c.iv;
      return { strike: c.strike, iv };
    })
    .sort((a, b) => a.strike - b.strike);
  let skewSlope = 0;
  const idx = sorted.findIndex((p) => p.strike >= spot);
  if (idx > 0 && idx < sorted.length) {
    const a = sorted[idx - 1], b = sorted[idx];
    if (a.strike > 0 && b.strike > 0 && b.strike !== a.strike) {
      skewSlope = (b.iv - a.iv) / (Math.log(b.strike) - Math.log(a.strike));
    }
  }

  let bias: SkewResult['bias'] = 'FLAT';
  if (riskReversal25 > 0.005) bias = 'PUT SKEW';
  else if (riskReversal25 < -0.005) bias = 'CALL SKEW';

  return { atmIv, callIv25, putIv25, riskReversal25, butterfly25, skewSlope, bias };
}

/** Percentile rank (0-100) of `value` within a history array. */
export function percentileRank(history: number[], value: number): number {
  const v = history.filter((x) => isFinite(x));
  if (v.length < 2) return 50;
  const below = v.filter((x) => x <= value).length;
  return Math.round((below / v.length) * 100);
}
