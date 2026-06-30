/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IMPLIED VOLATILITY SURFACE — MODEL (anchored on the real front smile)
 * --------------------------------------------------------------------
 * The feed ships per-contract IV for the FRONT expiry only — never a full
 * per-(strike, expiry) grid — so a surface over DTE cannot be measured; it can
 * only be MODELLED, and this module does so transparently rather than inventing
 * a decorative sheet:
 *
 *   1. The FRONT row is the REAL front-expiry smile (per-strike call/put-blended
 *      IV straight from the chain). termFactor(frontDte) ≡ 1, so that row is
 *      reproduced exactly — nothing modelled touches it.
 *   2. Longer horizons scale the whole smile by an ATM term factor from a Heston
 *      forward-variance term structure (mean-reverting integrated variance):
 *         g(T) = θ + (v0 − θ)·(1 − e^(−κT)) / (κT)
 *         ivFactor(T) = sqrt( g(T) / g(Tfront) )
 *         iv(K, T) = ivFront(K) · ivFactor(T)
 *      i.e. a sticky-MONEYNESS skew shape (held constant in K) with only the ATM
 *      LEVEL moving along a named, documented term model. v0 = real front ATM
 *      variance; θ (long-run var) and κ (reversion speed) are stated assumptions.
 *
 * Every number is therefore traceable: the front row to live contracts, every
 * deeper row to ivFront(K) × an explicit term factor. The panel labels it MODEL.
 */
import type { ChainContract } from './v11Math';

export interface IvSurfaceParams {
  theta?: number;   // long-run variance (annualized); default (0.18)^2
  kappa?: number;   // mean-reversion speed (per year); default 3
  horizonsDays?: number[]; // DTE axis to model out to (front is prepended)
  windowPct?: number;      // strike window around spot
}

export interface IvSurfaceModel {
  strikes: number[];
  dtes: number[];          // ascending; dtes[0] is the real front expiry
  iv: number[][];          // [dteIdx][strikeIdx] annualized IV fraction
  frontIv: number[];       // the real front smile (== iv[0])
  atmFront: number;        // real front ATM IV
  atmTerm: number[];       // modelled ATM IV per dte (atmTerm[0] == atmFront)
  factor: number[];        // ivFactor(T) per dte (factor[0] == 1)
  theta: number; kappa: number;
}

/** Mean-reverting integrated-variance term g(T) = θ + (v0−θ)(1−e^{−κT})/(κT). */
function gTerm(v0: number, theta: number, kappa: number, T: number): number {
  if (T <= 0) return v0;
  const x = kappa * T;
  const decay = x < 1e-6 ? 1 : (1 - Math.exp(-x)) / x; // → 1 as T→0
  return theta + (v0 - theta) * decay;
}

/**
 * Build the MODEL IV surface from the real front chain. Returns null when the
 * front smile is too sparse to anchor.
 */
export function buildIvSurfaceModel(
  chain: ChainContract[],
  spot: number,
  frontDteDays: number,
  params: IvSurfaceParams = {},
): IvSurfaceModel | null {
  if (!Array.isArray(chain) || chain.length < 4 || !(spot > 0)) return null;
  const theta = params.theta ?? 0.18 * 0.18;
  const kappa = params.kappa ?? 3;
  const windowPct = params.windowPct ?? 0.1;

  // --- real front smile: blend call+put IV per strike within the window ---
  const lo = spot * (1 - windowPct), hi = spot * (1 + windowPct);
  const byStrike = new Map<number, number[]>();
  for (const c of chain) {
    if (c.strike >= lo && c.strike <= hi && isFinite(c.iv) && c.iv > 0) {
      const arr = byStrike.get(c.strike) || [];
      arr.push(c.iv); byStrike.set(c.strike, arr);
    }
  }
  const strikes = Array.from(byStrike.keys()).sort((a, b) => a - b);
  if (strikes.length < 4) return null;
  const frontIv = strikes.map((k) => {
    const ivs = byStrike.get(k)!;
    return ivs.reduce((a, b) => a + b, 0) / ivs.length;
  });

  // real front ATM IV (nearest strike to spot)
  let atmIdx = 0, best = Infinity;
  strikes.forEach((k, i) => { const d = Math.abs(k - spot); if (d < best) { best = d; atmIdx = i; } });
  const atmFront = frontIv[atmIdx];
  const v0 = atmFront * atmFront;

  const Tfront = Math.max(frontDteDays, 0.5) / 365;
  const gFront = gTerm(v0, theta, kappa, Tfront) || v0 || 1;

  // --- DTE axis: front expiry + modelled horizons strictly beyond it ---
  const horizons = (params.horizonsDays ?? [7, 14, 30, 60, 90, 120]).filter((d) => d > frontDteDays + 0.5);
  const dtes = [Math.round(frontDteDays), ...horizons].sort((a, b) => a - b);

  const factor: number[] = [];
  const atmTerm: number[] = [];
  const iv: number[][] = [];
  for (const d of dtes) {
    const T = Math.max(d, 0.5) / 365;
    const f = Math.sqrt(Math.max(1e-8, gTerm(v0, theta, kappa, T) / gFront));
    factor.push(f);
    atmTerm.push(atmFront * f);
    iv.push(frontIv.map((iv0) => iv0 * f));
  }

  return { strikes, dtes, iv, frontIv, atmFront, atmTerm, factor, theta, kappa };
}
