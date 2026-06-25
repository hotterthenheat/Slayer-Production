/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Microstructure toxicity metrics computed keyless from the OHLCV candle stream:
 *   • VPIN  — volume-synchronized probability of informed trading (order-flow
 *             toxicity), using Bulk-Volume Classification over equal-volume buckets.
 *   • Kyle's λ — price impact per unit of signed order flow (true liquidity /
 *             slippage risk).
 * With a real tick/L2 feed these would consume trade prints directly; on the
 * synthetic feed they use the bar's close-in-range as the buy/sell proxy.
 */
import { Candle } from '../types';
import { stdNormalCDF } from './normalDist';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface VpinResult {
  vpin: number; // 0..1 order-flow toxicity
  informedProbability: number; // alias for display (0..1)
  toxic: boolean;
  buckets: number;
}

/** VPIN over equal-volume buckets using Bulk-Volume Classification. */
export function computeVPIN(candles: Candle[], nBuckets = 20): VpinResult {
  const recent = candles.slice(-Math.max(nBuckets * 3, 50));
  const vols = recent.map((c) => c.volume || 0);
  const totalVol = vols.reduce((a, b) => a + b, 0);
  if (totalVol <= 0 || recent.length < 6) return { vpin: 0, informedProbability: 0, toxic: false, buckets: 0 };
  const V = totalVol / nBuckets; // target bucket volume

  // Bulk-Volume Classification by STANDARDIZED, DE-MEANED bar-to-bar price change
  // (Easley–López de Prado–O'Hara). The old close-in-range proxy ignored move
  // MAGNITUDE and direction-vs-baseline, so every up-closing bar of even the calmest
  // steady grind scored ~100% buy volume and VPIN pinned at ~1 (max "toxicity") —
  // exactly backwards. De-meaning by the prevailing drift and standardizing by the
  // volatility of bar changes makes a steady trend read as BALANCED; only abnormally
  // large, one-sided moves (genuine informed flow) skew a bucket.
  const dP: number[] = [];
  for (let i = 1; i < recent.length; i++) dP.push((recent[i].close ?? 0) - (recent[i - 1].close ?? 0));
  const meanDP = dP.reduce((a, b) => a + b, 0) / (dP.length || 1);
  const varDP = dP.reduce((a, b) => a + (b - meanDP) ** 2, 0) / (dP.length || 1);
  const sigmaDP = Math.sqrt(varDP) || 1e-9;

  const imbalances: number[] = [];
  let bBuy = 0, bSell = 0, bVol = 0;
  for (let i = 1; i < recent.length; i++) {
    const c = recent[i];
    const buyFrac = clamp01(stdNormalCDF(((c.close ?? 0) - (recent[i - 1].close ?? 0) - meanDP) / sigmaDP));
    const v = c.volume || 0;
    bBuy += v * buyFrac;
    bSell += v * (1 - buyFrac);
    bVol += v;
    if (bVol >= V && bVol > 0) {
      imbalances.push(Math.abs(bBuy - bSell) / bVol);
      bBuy = 0; bSell = 0; bVol = 0;
    }
  }
  if (bVol > 0) imbalances.push(Math.abs(bBuy - bSell) / bVol);
  if (!imbalances.length) return { vpin: 0, informedProbability: 0, toxic: false, buckets: 0 };
  const vpin = clamp01(imbalances.reduce((a, b) => a + b, 0) / imbalances.length);
  return { vpin: Number(vpin.toFixed(3)), informedProbability: Number(vpin.toFixed(3)), toxic: vpin > 0.4, buckets: imbalances.length };
}

export interface KyleLambdaResult {
  lambda: number; // price impact per unit signed volume (raw)
  impactPct: number; // % price move per average-volume order
  slippageRisk: boolean;
}

/** Kyle's lambda: regress price change on signed order flow (volume × return sign). */
export function computeKylesLambda(candles: Candle[], lookback = 50): KyleLambdaResult {
  const c = candles.slice(-lookback);
  if (c.length < 10) return { lambda: 0, impactPct: 0, slippageRisk: false };
  const dP: number[] = [];
  const signedVol: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const d = c[i].close - c[i - 1].close;
    dP.push(d);
    // A flat bar (d===0) carries no directional information — contribute zero
    // signed volume rather than defaulting to +1 (a buy), which biased λ upward.
    signedVol.push((c[i].volume || 0) * (d > 0 ? 1 : d < 0 ? -1 : 0));
  }
  const mX = signedVol.reduce((a, b) => a + b, 0) / signedVol.length;
  const mY = dP.reduce((a, b) => a + b, 0) / dP.length;
  let num = 0, den = 0;
  for (let i = 0; i < signedVol.length; i++) { num += (signedVol[i] - mX) * (dP[i] - mY); den += (signedVol[i] - mX) * (signedVol[i] - mX); }
  const lambda = den > 1e-12 ? num / den : 0;
  const avgVol = c.reduce((a, k) => a + (k.volume || 0), 0) / c.length;
  const px = c[c.length - 1].close || 1;
  const impactPct = px > 0 ? (Math.abs(lambda) * avgVol) / px : 0;
  // High impact per unit flow ⇒ thin/illiquid book ⇒ slippage/flash-crash risk.
  // Keep λ at full precision in the value (the toExponential(2) round-trip threw
  // away precision that downstream consumers may need); round only for display.
  return { lambda, impactPct: Number((impactPct * 100).toFixed(3)), slippageRisk: impactPct * 100 > 0.5 };
}
