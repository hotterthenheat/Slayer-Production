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

  const imbalances: number[] = [];
  let bBuy = 0, bSell = 0, bVol = 0;
  for (const c of recent) {
    const range = (c.high - c.low) || 1e-9;
    const buyFrac = clamp01((c.close - c.low) / range); // close-in-range proxy for buy pressure
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
    signedVol.push((c[i].volume || 0) * Math.sign(d || 1e-9));
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
  return { lambda: Number(lambda.toExponential(2) as any) || lambda, impactPct: Number((impactPct * 100).toFixed(3)), slippageRisk: impactPct * 100 > 0.5 };
}
