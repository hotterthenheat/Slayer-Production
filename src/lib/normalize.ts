/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * V5 normalization framework (spec Part 1). Define once, use everywhere.
 * Every 0–100 score in the SkyScore ranker routes through one of these.
 * Guarantees: never divides by zero, never returns NaN, degenerate sets → 50.
 */

export function clamp(v: number, a: number, b: number): number {
  return Math.min(Math.max(v, a), b);
}

/** 1. Bounded positive, linear. For metrics with a natural [0, cap]. */
export function normSaturate(x: number, cap: number): number {
  if (!isFinite(x) || !(cap > 0)) return 0; // !(cap > 0) also rejects NaN (NaN <= 0 is false)
  return 100 * clamp(x / cap, 0, 1);
}

/** 2. Heavy-tailed positive (NBRS, volume ratios). Log preserves tail ordering. */
export function normLogSaturate(x: number, cap: number): number {
  const denom = Math.log(Math.max(cap, 1.0000001));
  if (denom <= 0) return 0;
  return 100 * clamp(Math.log(Math.max(x, 1)) / denom, 0, 1);
}

/** 3. Velocity / signed deltas. ZERO change maps to 50 (neutral), not 0. */
export function normSignedTanh(d: number, scale: number): number {
  if (!isFinite(d) || !scale) return 50;
  return 50 + 50 * Math.tanh(d / scale);
}

/** Linear-interpolated percentile of a numeric set (p in [0,100]). */
export function percentile(values: number[], p: number): number {
  if (!values || values.length === 0) return 0;
  const s = [...values].filter((v) => isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return 0;
  if (s.length === 1) return s[0];
  const idx = clamp((p / 100) * (s.length - 1), 0, s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * 4. Pure relative ranking across the candidate set. Clip to [P10, P90] so a
 * single outlier can't compress everyone. Degenerate set (hi==lo) → 50.
 */
export function normCrossSection(x: number, setValues: number[]): number {
  if (!setValues || setValues.length === 0) return 50;
  if (!isFinite(x)) return 50; // NaN/Inf metric → neutral 50, never NaN
  const lo = percentile(setValues, 10);
  const hi = percentile(setValues, 90);
  if (hi === lo) return 50;
  const xc = clamp(x, lo, hi);
  return 100 * (xc - lo) / (hi - lo);
}

/** Maps any 0–100 score to a 0–1 unit contribution (for convexity assembly). */
export function unit(score0to100: number): number {
  return clamp(score0to100 / 100, 0, 1);
}
