/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared standard-normal distribution functions — the single source of truth
 * for every Greek, option price, first-passage probability, and tail metric in
 * the platform.
 *
 * The CDF uses the Hart (1968) rational approximation as popularized by Graeme
 * West, "Better Approximations to Cumulative Normal Functions" (Wilmott, 2009).
 * It is accurate to ~1e-15 (full double precision) across the entire real line,
 * including the deep tails — a meaningful upgrade over the Abramowitz & Stegun
 * 7.1.26 form (~1.5e-7, and relatively worse in the tails) it replaces.
 */

const SQRT_2PI = 2.5066282746310002; // √(2π)
const INV_SQRT_2PI = 0.3989422804014327; // 1/√(2π)

/** Standard-normal probability density φ(x). Exact. */
export function stdNormalPDF(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/**
 * Standard-normal cumulative distribution Φ(x), double-precision (Hart/West).
 * Max absolute error ~1e-15 over the full range; returns exactly 0/1 beyond ±37σ.
 */
export function stdNormalCDF(x: number): number {
  const a = Math.abs(x);
  let cumnorm: number;

  if (a > 37) {
    cumnorm = 0;
  } else {
    const e = Math.exp(-0.5 * a * a);
    if (a < 7.07106781186547) {
      // Rational polynomial (numerator / denominator) — accurate body region.
      let n = 3.52624965998911e-2 * a + 0.700383064443688;
      n = n * a + 6.37396220353165;
      n = n * a + 33.912866078383;
      n = n * a + 112.079291497871;
      n = n * a + 221.213596169931;
      n = n * a + 220.206867912376;
      let d = 8.83883476483184e-2 * a + 1.75566716318264;
      d = d * a + 16.064177579207;
      d = d * a + 86.7807322029461;
      d = d * a + 296.564248779674;
      d = d * a + 637.333633378831;
      d = d * a + 793.826512519948;
      d = d * a + 440.413735824752;
      cumnorm = (e * n) / d;
    } else {
      // Continued fraction — accurate tail region.
      let f = a + 0.65;
      f = a + 4 / f;
      f = a + 3 / f;
      f = a + 2 / f;
      f = a + 1 / f;
      cumnorm = e / f / SQRT_2PI;
    }
  }

  return x > 0 ? 1 - cumnorm : cumnorm;
}

/** Error function, derived from the high-accuracy CDF: erf(x) = 2·Φ(x√2) − 1. */
export function erf(x: number): number {
  return 2 * stdNormalCDF(x * Math.SQRT2) - 1;
}
