/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TECHNICAL ENGINE — the "entry" layer of Sky's Vision.
 * EMA alignment (8/21/50/200), multi-timeframe RSI cascade (1m/5m/15m), VWAP
 * position, TTM Squeeze (Bollinger-inside-Keltner + linear-regression momentum)
 * and market-structure trend, blended into a directional read (-1..1) and a
 * conviction score (0..100). This confirms the trade BEFORE dealer flow weighs in;
 * dealer positioning enhances it, it does not replace it.
 */
import { Candle } from '../types';

export interface TtmSqueeze {
  squeezeOn: boolean;       // Bollinger band inside Keltner channel (compression)
  firing: boolean;          // squeeze just released (first expansion bar)
  momentum: number;         // TTM momentum oscillator value (signed)
  momentumRising: boolean;  // histogram growing in its current direction
}

export interface MtfRsi {
  m1: number; m5: number; m15: number;
  allRising: boolean;
  cascadeDir: number;       // -1..1 (avg distance from 50, signed)
}

export interface TechnicalRead {
  direction: number;        // -1..1 composite technical direction
  score: number;            // 0..100 technical conviction
  emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  emaTargets: { ema8: number; ema21: number; ema50: number; ema200: number };
  rsi: MtfRsi;
  vwap: number;
  vwapPosition: 'ABOVE' | 'BELOW' | 'AT';
  squeeze: TtmSqueeze;
  structureTrend: 'bullish' | 'bearish' | 'neutral';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const last = <T>(a: T[]): T | undefined => (a.length ? a[a.length - 1] : undefined);

function emaSeries(values: number[], period: number): number[] {
  const n = values.length;
  if (!n) return [];
  const k = 2 / (period + 1);
  // With a full lookback, seed the EMA with the SMA of the first `period` prints at
  // index period−1 (the textbook seed) so the average is properly anchored instead of
  // dragging the very first raw print forward — which left long EMAs under-converged.
  if (n >= period && period > 1) {
    const out = new Array<number>(n);
    let s = 0; for (let i = 0; i < period; i++) s += values[i];
    const seed = s / period;
    for (let i = 0; i < period; i++) out[i] = seed;
    for (let i = period; i < n; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
    return out;
  }
  // Not enough data for a real seed — running EMA from the first print.
  const out = [values[0]];
  for (let i = 1; i < n; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}
export function emaLast(values: number[], period: number): number {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] : (values.length ? values[values.length - 1] : 0);
}
function sma(values: number[], period: number): number {
  if (values.length < period || period <= 0) return values.length ? values[values.length - 1] : 0;
  let s = 0; for (let i = values.length - period; i < values.length; i++) s += values[i];
  return s / period;
}
function stdev(values: number[], period: number): number {
  if (values.length < period || period <= 0) return 0;
  const slice = values.slice(-period);
  const m = slice.reduce((a, b) => a + b, 0) / period;
  return Math.sqrt(slice.reduce((a, b) => a + (b - m) * (b - m), 0) / period);
}
function atr(candles: Candle[], period: number): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return sma(trs, Math.min(period, trs.length));
}

/** Wilder RSI on a close series (last value). */
export function rsiLast(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * TTM Squeeze: Bollinger Bands (20, 2σ) inside Keltner Channels (20, 1.5·ATR) =
 * compression. Momentum = linear-regression value of the close vs the midline of
 * the Donchian/SMA average over 20 bars (the standard TTM momentum oscillator).
 */
export function ttmSqueeze(candles: Candle[], length = 20, bbMult = 2, kcMult = 1.5): TtmSqueeze {
  if (candles.length < length + 2) return { squeezeOn: false, firing: false, momentum: 0, momentumRising: false };
  const closes = candles.map((c) => c.close);
  const squeezeAt = (endIdx: number): boolean => {
    const win = closes.slice(endIdx - length + 1, endIdx + 1);
    const cs = candles.slice(endIdx - length + 1, endIdx + 1);
    const mid = win.reduce((a, b) => a + b, 0) / length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - mid) * (b - mid), 0) / length);
    const rng = atr(cs, length);
    return (mid + bbMult * sd) < (mid + kcMult * rng) && (mid - bbMult * sd) > (mid - kcMult * rng);
  };
  const n = candles.length - 1;
  const squeezeOn = squeezeAt(n);
  const wasOn = squeezeAt(n - 1);
  const firing = wasOn && !squeezeOn;

  // TTM momentum: linreg value at the last bar of source = close − ((HH+LL)/2 + SMA(close))/2.
  const momAt = (endIdx: number): number => {
    const cs = candles.slice(endIdx - length + 1, endIdx + 1);
    const hh = Math.max(...cs.map((c) => c.high));
    const ll = Math.min(...cs.map((c) => c.low));
    const smaC = cs.reduce((a, c) => a + c.close, 0) / length;
    const basis = (((hh + ll) / 2) + smaC) / 2;
    const src = cs.map((c) => c.close - basis);
    // Linear regression fitted value at the last point (x = 0..length-1).
    const xs = src.map((_, i) => i);
    const mx = (length - 1) / 2;
    const my = src.reduce((a, b) => a + b, 0) / length;
    let num = 0, den = 0;
    for (let i = 0; i < length; i++) { num += (xs[i] - mx) * (src[i] - my); den += (xs[i] - mx) ** 2; }
    const b = den ? num / den : 0;
    const a = my - b * mx;
    return a + b * (length - 1);
  };
  const momentum = momAt(n);
  const momentumPrev = momAt(n - 1);
  // Rising = momentum strengthening in its CURRENT direction. The old abs-vs-abs
  // test wrongly flagged a sharp sign-flip reversal (e.g. +5 -> -4) as "not rising"
  // even though a strong opposite impulse had just appeared.
  const momentumRising = momentum > 0 ? momentum > momentumPrev : momentum < momentumPrev;
  return { squeezeOn, firing, momentum: Number(momentum.toFixed(4)), momentumRising };
}

function sessionVwap(candles: Candle[]): number {
  let pv = 0, vol = 0;
  for (const c of candles) {
    const typ = (c.high + c.low + c.close) / 3;
    const v = c.volume || 0;
    pv += typ * v; vol += v;
  }
  const lastC = last(candles);
  return vol > 0 ? pv / vol : (lastC ? lastC.close : 0);
}

/**
 * Compute the full technical read. `systemScoreTotal` is the platform's existing
 * 0-100 technical quality score (RSI cascade / VWAP / structure / liquidity / HTF
 * agreement / momentum) — folded into the conviction so we build on it, not around.
 */
export function computeTechnicalRead(params: {
  candles1m: Candle[]; candles5m: Candle[]; candles15m: Candle[];
  spot: number; systemScoreTotal: number; structureTrend?: 'bullish' | 'bearish' | 'neutral';
}): TechnicalRead {
  const { candles1m, candles5m, candles15m, spot, systemScoreTotal, structureTrend = 'neutral' } = params;
  const base = candles5m.length >= 30 ? candles5m : (candles1m.length ? candles1m : candles5m);
  const closes = base.map((c) => c.close);

  // EMA alignment (8/21/50/200).
  const e8 = emaLast(closes, 8), e21 = emaLast(closes, 21), e50 = emaLast(closes, 50), e200 = emaLast(closes, 200);
  let bull = 0, bear = 0;
  // The 50/200 cross is only meaningful with a full 200-bar lookback; with fewer bars
  // EMA200 is under-converged, so drop that pair from the alignment rather than let a
  // noisy long EMA tilt the read (it's still reported in emaTargets for display).
  const pairs: [number, number][] = [[e8, e21], [e21, e50], [spot, e8]];
  if (closes.length >= 200) pairs.push([e50, e200]);
  for (const [a, b] of pairs) { if (a > b) bull++; else if (a < b) bear++; }
  const emaDir = (bull - bear) / pairs.length; // -1..1
  const emaAlignment: TechnicalRead['emaAlignment'] = emaDir > 0.4 ? 'BULLISH' : emaDir < -0.4 ? 'BEARISH' : 'MIXED';

  // Multi-timeframe RSI cascade.
  const r1 = rsiLast(candles1m.map((c) => c.close));
  const r5 = rsiLast(candles5m.map((c) => c.close));
  const r15 = rsiLast(candles15m.map((c) => c.close));
  const rPrev1 = rsiLast(candles1m.slice(0, -1).map((c) => c.close));
  const rPrev5 = rsiLast(candles5m.slice(0, -1).map((c) => c.close));
  const rPrev15 = rsiLast(candles15m.slice(0, -1).map((c) => c.close));
  const allRising = r1 > rPrev1 && r5 > rPrev5 && r15 > rPrev15;
  const allFalling = r1 < rPrev1 && r5 < rPrev5 && r15 < rPrev15;
  const cascadeDir = clamp(((r1 - 50) + (r5 - 50) + (r15 - 50)) / 150, -1, 1); // avg distance from 50
  const rsi: MtfRsi = { m1: Math.round(r1), m5: Math.round(r5), m15: Math.round(r15), allRising, cascadeDir };

  // VWAP position.
  const vwap = sessionVwap(base);
  const vwapPosition: TechnicalRead['vwapPosition'] = spot > vwap * 1.0005 ? 'ABOVE' : spot < vwap * 0.9995 ? 'BELOW' : 'AT';
  const vwapDir = vwapPosition === 'ABOVE' ? 1 : vwapPosition === 'BELOW' ? -1 : 0;

  // TTM squeeze.
  const squeeze = ttmSqueeze(base);
  const structDir = structureTrend === 'bullish' ? 1 : structureTrend === 'bearish' ? -1 : 0;

  // Composite technical direction (EMA + RSI cascade lead; structure + VWAP confirm).
  const direction = clamp(0.35 * emaDir + 0.35 * cascadeDir + 0.20 * structDir + 0.10 * vwapDir, -1, 1);

  // Conviction: existing system score (quality) blended with directional clarity,
  // with a kicker when the squeeze fires in the direction and RSI cascades agree.
  const cascadeAgree = (allRising && direction > 0) || (allFalling && direction < 0) ? 6 : 0;
  const squeezeKick = squeeze.firing && Math.sign(squeeze.momentum) === Math.sign(direction) ? 8 : 0;
  const score = Math.round(clamp(0.55 * systemScoreTotal + 40 * Math.abs(direction) + cascadeAgree + squeezeKick, 0, 100));

  return {
    direction: Number(direction.toFixed(3)), score, emaAlignment,
    emaTargets: { ema8: e8, ema21: e21, ema50: e50, ema200: e200 },
    rsi, vwap: Number(vwap.toFixed(2)), vwapPosition, squeeze, structureTrend,
  };
}
