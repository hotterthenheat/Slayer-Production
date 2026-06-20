import { stdNormalCDF } from './v11Math';

/**
 * P(price touches barrier B within tau years) under GBM.
 * S = spot, sigma = annualized vol, mu = r − q − sigma²/2 (risk-neutral log-drift).
 * Reflection-with-drift: for b = ln(B/S) > 0 (upside barrier):
 *   P = 1 − N((b−μτ)/(σ√τ)) + e^(2μb/σ²)·N((−b−μτ)/(σ√τ))
 * Downside barrier: mirror with b→|b|, μ→−μ. Driftless reduces to 2·N(−b/(σ√τ)).
 */
export function touchProbability(S: number, B: number, sigma: number, tauYears: number, mu = 0): number {
  if (!(S > 0) || !(B > 0) || !(sigma > 0) || !(tauYears > 0)) return 0;
  let b = Math.log(B / S);
  if (Math.abs(b) < 1e-12) return 1;
  let drift = mu;
  if (b < 0) { b = -b; drift = -mu; } // mirror for downside barriers
  const sq = sigma * Math.sqrt(tauYears);
  // Reflection term: exp() can overflow to +Infinity while its CDF factor underflows
  // to 0, giving Infinity*0 = NaN. Compute the product, then treat any non-finite
  // result as 0 (the CDF factor → 0 case). In-range values are unchanged.
  const reflectFactor = stdNormalCDF((-b - drift * tauYears) / sq);
  const reflectProduct = Math.exp((2 * drift * b) / (sigma * sigma)) * reflectFactor;
  const reflectTerm = isFinite(reflectProduct) ? reflectProduct : 0;
  const p = 1 - stdNormalCDF((b - drift * tauYears) / sq) + reflectTerm;
  return Math.min(1, Math.max(0, p));
}

/** Median first-passage time (years). Mean diverges driftless — use the median. */
export function medianTimeToTouch(S: number, B: number, sigma: number, mu = 0, horizonYears = 1): number | null {
  if (!(S > 0) || !(B > 0) || !(sigma > 0)) return null; // guard log/÷ of non-positive
  const b = Math.abs(Math.log(B / S));
  if (b < 1e-12) return 0;
  if (Math.abs(mu) < 1e-9) {
    // Driftless median first-passage: P(touch≤t)=2·Φ(−b/(σ√t))=0.5 ⇒ b/(σ√t)=Φ⁻¹(0.75),
    // so t = b² / ((Φ⁻¹(0.75))²·σ²). Use the full-precision constant (was 0.4549).
    const PHI_INV_075_SQ = 0.45493642311957; // (Φ⁻¹(0.75))² = 0.6744897501960817²
    const t = (b * b) / (PHI_INV_075_SQ * sigma * sigma);
    return t <= horizonYears ? t : null;          // null ⇒ "unlikely within horizon", display —
  }
  // With drift: bisection on P(touch ≤ t) = 0.5
  let lo = 1e-8, hi = horizonYears;
  if (touchProbability(S, B, sigma, hi, mu) < 0.5) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (touchProbability(S, B, sigma, mid, mu) < 0.5) lo = mid; else hi = mid;
  }
  return hi;
}

/** ETA range = times at which P(touch)=0.25 / 0.75 (IQR), same bisection. */
export function etaRange(S: number, B: number, sigma: number, mu = 0, horizonYears = 1) {
  if (!(S > 0) || !(B > 0) || !(sigma > 0)) return { fast: null, median: null, slow: null }; // guard ÷ of non-positive
  const solve = (target: number): number | null => {
    let lo = 1e-8, hi = horizonYears;
    if (touchProbability(S, B, sigma, hi, mu) < target) return null;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (touchProbability(S, B, sigma, mid, mu) < target) lo = mid; else hi = mid;
    }
    return hi;
  };
  // As specified, solve(0.25) is fast (early) touch, solve(0.75) is slow (late) touch
  return { fast: solve(0.25), median: solve(0.5), slow: solve(0.75) };
}
