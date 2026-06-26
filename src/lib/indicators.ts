/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Technical indicator library — pure, dependency-free, and unit-tested for correctness
 * (tests/indicators.test.ts). Every function returns an array aligned 1:1 with the input
 * (null through the warm-up window) so values map directly onto candle bars.
 *
 * Conventions:
 *  - close/high/low/open/volume are number[] in chronological order (oldest first).
 *  - Wilder-smoothed indicators (RSI, ATR, ADX, +DI/-DI) use Wilder's RMA, NOT a plain SMA
 *    — the single most common source of "my RSI doesn't match TradingView" bugs.
 *  - Multi-line indicators return objects of aligned arrays.
 */

export type Num = number | null;

// ─────────────────────────────────────────────────────────────────────────────
// Moving averages
// ─────────────────────────────────────────────────────────────────────────────

export function sma(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential MA, seeded with the SMA of the first `period` values (standard). */
export function ema(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RMA (smoothing factor 1/period) — the basis of RSI/ATR/ADX. */
export function rma(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Linearly-weighted MA (most recent bar weighted highest). */
export function wma(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += values[i - j] * (period - j);
    out[i] = s / denom;
  }
  return out;
}

/** Session/cumulative VWAP over the supplied bars. */
export function vwap(high: number[], low: number[], close: number[], volume: number[]): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < close.length; i++) {
    const tp = (high[i] + low[i] + close[i]) / 3;
    cumPV += tp * volume[i]; cumV += volume[i];
    out[i] = cumV === 0 ? close[i] : cumPV / cumV;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Oscillators / momentum
// ─────────────────────────────────────────────────────────────────────────────

/** Wilder's RSI. First value at index `period` (after `period` price changes). */
export function rsi(close: number[], period = 14): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  if (close.length <= period) return out;
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < close.length; i++) {
    const ch = close[i] - close[i - 1];
    gains.push(Math.max(ch, 0));
    losses.push(Math.max(-ch, 0));
  }
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** MACD line, signal line, and histogram. */
export function macd(close: number[], fast = 12, slow = 26, signalPeriod = 9): { macd: Num[]; signal: Num[]; histogram: Num[] } {
  const emaFast = ema(close, fast);
  const emaSlow = ema(close, slow);
  const macdLine: Num[] = close.map((_, i) => (emaFast[i] != null && emaSlow[i] != null) ? (emaFast[i]! - emaSlow[i]!) : null);
  const signal: Num[] = new Array(close.length).fill(null);
  const first = macdLine.findIndex(v => v != null);
  if (first >= 0) {
    const seq = macdLine.slice(first).map(v => v as number);
    const sig = ema(seq, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[first + i] = sig[i];
  }
  const histogram: Num[] = close.map((_, i) => (macdLine[i] != null && signal[i] != null) ? (macdLine[i]! - signal[i]!) : null);
  return { macd: macdLine, signal, histogram };
}

/** Rate of change (%). */
export function roc(close: number[], period = 12): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = period; i < close.length; i++) {
    out[i] = close[i - period] === 0 ? null : ((close[i] - close[i - period]) / close[i - period]) * 100;
  }
  return out;
}

/** Momentum (absolute change over `period`). */
export function momentum(close: number[], period = 10): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = period; i < close.length; i++) out[i] = close[i] - close[i - period];
  return out;
}

/** Stochastic oscillator %K and %D. */
export function stochastic(high: number[], low: number[], close: number[], kPeriod = 14, dPeriod = 3): { k: Num[]; d: Num[] } {
  const k: Num[] = new Array(close.length).fill(null);
  for (let i = kPeriod - 1; i < close.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) { hh = Math.max(hh, high[j]); ll = Math.min(ll, low[j]); }
    k[i] = hh === ll ? 50 : ((close[i] - ll) / (hh - ll)) * 100;
  }
  const d: Num[] = new Array(close.length).fill(null);
  for (let i = kPeriod - 1 + dPeriod - 1; i < close.length; i++) {
    let s = 0, ok = true;
    for (let j = i - dPeriod + 1; j <= i; j++) { if (k[j] == null) { ok = false; break; } s += k[j] as number; }
    if (ok) d[i] = s / dPeriod;
  }
  return { k, d };
}

/** Williams %R (range -100..0). */
export function williamsR(high: number[], low: number[], close: number[], period = 14): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = period - 1; i < close.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, high[j]); ll = Math.min(ll, low[j]); }
    out[i] = hh === ll ? -50 : ((hh - close[i]) / (hh - ll)) * -100;
  }
  return out;
}

/** Commodity Channel Index. */
export function cci(high: number[], low: number[], close: number[], period = 20): Num[] {
  const tp = high.map((_, i) => (high[i] + low[i] + close[i]) / 3);
  const tpSma = sma(tp, period);
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = period - 1; i < close.length; i++) {
    const mean = tpSma[i] as number;
    let md = 0;
    for (let j = i - period + 1; j <= i; j++) md += Math.abs(tp[j] - mean);
    md /= period;
    out[i] = md === 0 ? 0 : (tp[i] - mean) / (0.015 * md);
  }
  return out;
}

/** Money Flow Index (volume-weighted RSI, range 0..100). */
export function mfi(high: number[], low: number[], close: number[], volume: number[], period = 14): Num[] {
  const tp = high.map((_, i) => (high[i] + low[i] + close[i]) / 3);
  const rawMF = tp.map((t, i) => t * volume[i]);
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = period; i < close.length; i++) {
    let pos = 0, neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += rawMF[j];
      else if (tp[j] < tp[j - 1]) neg += rawMF[j];
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/** TRIX — 1-bar % rate of change of a triple-smoothed EMA. */
export function trix(close: number[], period = 15): Num[] {
  const emaOf = (arr: Num[], p: number): Num[] => {
    const first = arr.findIndex(v => v != null);
    const out: Num[] = new Array(arr.length).fill(null);
    if (first < 0) return out;
    const e = ema(arr.slice(first).map(v => v as number), p);
    for (let i = 0; i < e.length; i++) out[first + i] = e[i];
    return out;
  };
  const e3 = emaOf(emaOf(ema(close, period), period), period);
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = 1; i < close.length; i++) {
    if (e3[i] != null && e3[i - 1] != null && (e3[i - 1] as number) !== 0) {
      out[i] = (((e3[i] as number) - (e3[i - 1] as number)) / (e3[i - 1] as number)) * 100;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volatility / channels
// ─────────────────────────────────────────────────────────────────────────────

/** Rolling population standard deviation. */
export function stdDev(values: number[], period: number): Num[] {
  const m = sma(values, period);
  const out: Num[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0; const mean = m[i] as number;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

/** Bollinger Bands (SMA basis ± mult·σ, population σ). */
export function bollingerBands(close: number[], period = 20, mult = 2): { upper: Num[]; middle: Num[]; lower: Num[] } {
  const middle = sma(close, period);
  const sd = stdDev(close, period);
  const upper: Num[] = close.map((_, i) => (middle[i] != null && sd[i] != null) ? middle[i]! + mult * sd[i]! : null);
  const lower: Num[] = close.map((_, i) => (middle[i] != null && sd[i] != null) ? middle[i]! - mult * sd[i]! : null);
  return { upper, middle, lower };
}

/** True Range (per bar). */
export function trueRange(high: number[], low: number[], close: number[]): number[] {
  const tr: number[] = new Array(high.length).fill(0);
  if (high.length) tr[0] = high[0] - low[0];
  for (let i = 1; i < high.length; i++) {
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  return tr;
}

/** Average True Range (Wilder). */
export function atr(high: number[], low: number[], close: number[], period = 14): Num[] {
  return rma(trueRange(high, low, close), period);
}

/** Keltner Channels (EMA basis ± mult·ATR). */
export function keltnerChannels(high: number[], low: number[], close: number[], period = 20, mult = 2): { upper: Num[]; middle: Num[]; lower: Num[] } {
  const middle = ema(close, period);
  const a = atr(high, low, close, period);
  const upper: Num[] = close.map((_, i) => (middle[i] != null && a[i] != null) ? middle[i]! + mult * a[i]! : null);
  const lower: Num[] = close.map((_, i) => (middle[i] != null && a[i] != null) ? middle[i]! - mult * a[i]! : null);
  return { upper, middle, lower };
}

/** Donchian Channels (highest high / lowest low over `period`). */
export function donchianChannels(high: number[], low: number[], period = 20): { upper: Num[]; middle: Num[]; lower: Num[] } {
  const upper: Num[] = new Array(high.length).fill(null);
  const lower: Num[] = new Array(high.length).fill(null);
  const middle: Num[] = new Array(high.length).fill(null);
  for (let i = period - 1; i < high.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, high[j]); ll = Math.min(ll, low[j]); }
    upper[i] = hh; lower[i] = ll; middle[i] = (hh + ll) / 2;
  }
  return { upper, middle, lower };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend / directional
// ─────────────────────────────────────────────────────────────────────────────

/** ADX with +DI / -DI (Wilder). */
export function adx(high: number[], low: number[], close: number[], period = 14): { adx: Num[]; plusDI: Num[]; minusDI: Num[] } {
  const len = high.length;
  const tr = new Array(len).fill(0), pDM = new Array(len).fill(0), mDM = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    pDM[i] = (up > down && up > 0) ? up : 0;
    mDM[i] = (down > up && down > 0) ? down : 0;
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  // Wilder running sums of TR/DM (starting over bars 1..period).
  const smooth = (arr: number[]): Num[] => {
    const out: Num[] = new Array(len).fill(null);
    if (len <= period) return out;
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i];
    out[period] = sum;
    for (let i = period + 1; i < len; i++) { sum = sum - sum / period + arr[i]; out[i] = sum; }
    return out;
  };
  const trS = smooth(tr), pS = smooth(pDM), mS = smooth(mDM);
  const plusDI: Num[] = new Array(len).fill(null);
  const minusDI: Num[] = new Array(len).fill(null);
  const dx: Num[] = new Array(len).fill(null);
  for (let i = period; i < len; i++) {
    const t = trS[i] as number;
    if (t == null || t === 0) continue;
    const pdi = 100 * (pS[i] as number) / t;
    const mdi = 100 * (mS[i] as number) / t;
    plusDI[i] = pdi; minusDI[i] = mdi;
    dx[i] = (pdi + mdi) === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi);
  }
  const adxOut: Num[] = new Array(len).fill(null);
  let count = 0, sumDx = 0, prev = 0, started = false;
  for (let i = period; i < len; i++) {
    if (dx[i] == null) continue;
    count++;
    if (count <= period) { sumDx += dx[i] as number; if (count === period) { prev = sumDx / period; adxOut[i] = prev; started = true; } }
    else if (started) { prev = (prev * (period - 1) + (dx[i] as number)) / period; adxOut[i] = prev; }
  }
  return { adx: adxOut, plusDI, minusDI };
}

/** Parabolic SAR (Wilder). */
export function parabolicSAR(high: number[], low: number[], step = 0.02, maxStep = 0.2): Num[] {
  const len = high.length;
  const out: Num[] = new Array(len).fill(null);
  if (len < 2) return out;
  let isLong = high[1] >= high[0];
  let af = step;
  let ep = isLong ? high[0] : low[0];
  let sar = isLong ? low[0] : high[0];
  out[0] = sar;
  for (let i = 1; i < len; i++) {
    sar = sar + af * (ep - sar);
    if (isLong) {
      sar = Math.min(sar, low[i - 1], i >= 2 ? low[i - 2] : low[i - 1]);
      if (low[i] < sar) { isLong = false; sar = ep; ep = low[i]; af = step; }
      else if (high[i] > ep) { ep = high[i]; af = Math.min(af + step, maxStep); }
    } else {
      sar = Math.max(sar, high[i - 1], i >= 2 ? high[i - 2] : high[i - 1]);
      if (high[i] > sar) { isLong = true; sar = ep; ep = high[i]; af = step; }
      else if (low[i] < ep) { ep = low[i]; af = Math.min(af + step, maxStep); }
    }
    out[i] = sar;
  }
  return out;
}

/** SuperTrend (ATR bands with trend flip). direction: 1 = up, -1 = down. */
export function superTrend(high: number[], low: number[], close: number[], period = 10, mult = 3): { trend: Num[]; direction: (1 | -1 | null)[] } {
  const len = high.length;
  const a = atr(high, low, close, period);
  const trend: Num[] = new Array(len).fill(null);
  const direction: (1 | -1 | null)[] = new Array(len).fill(null);
  let prevUpper = 0, prevLower = 0, prevST = 0, started = false;
  for (let i = 0; i < len; i++) {
    if (a[i] == null) continue;
    const hl2 = (high[i] + low[i]) / 2;
    let upper = hl2 + mult * (a[i] as number);
    let lower = hl2 - mult * (a[i] as number);
    if (started) {
      upper = (upper < prevUpper || close[i - 1] > prevUpper) ? upper : prevUpper;
      lower = (lower > prevLower || close[i - 1] < prevLower) ? lower : prevLower;
    }
    let dir: 1 | -1;
    if (!started) dir = close[i] <= upper ? -1 : 1;
    else if (prevST === prevUpper) dir = close[i] > upper ? 1 : -1;
    else dir = close[i] < lower ? -1 : 1;
    const st = dir === 1 ? lower : upper;
    trend[i] = st; direction[i] = dir;
    prevUpper = upper; prevLower = lower; prevST = st; started = true;
  }
  return { trend, direction };
}

/** Ichimoku Cloud lines (unshifted — apply the forward/back display shift when plotting). */
export function ichimoku(high: number[], low: number[], close: number[], conv = 9, base = 26, spanB = 52): { tenkan: Num[]; kijun: Num[]; senkouA: Num[]; senkouB: Num[]; chikou: Num[] } {
  const midline = (period: number): Num[] => {
    const out: Num[] = new Array(high.length).fill(null);
    for (let i = period - 1; i < high.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, high[j]); ll = Math.min(ll, low[j]); }
      out[i] = (hh + ll) / 2;
    }
    return out;
  };
  const tenkan = midline(conv);
  const kijun = midline(base);
  const senkouA: Num[] = high.map((_, i) => (tenkan[i] != null && kijun[i] != null) ? (tenkan[i]! + kijun[i]!) / 2 : null);
  const senkouB = midline(spanB);
  const chikou: Num[] = close.slice();
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume
// ─────────────────────────────────────────────────────────────────────────────

/** On-Balance Volume. */
export function obv(close: number[], volume: number[]): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  if (!close.length) return out;
  let v = 0; out[0] = 0;
  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) v += volume[i];
    else if (close[i] < close[i - 1]) v -= volume[i];
    out[i] = v;
  }
  return out;
}

/** Chaikin Money Flow. */
export function cmf(high: number[], low: number[], close: number[], volume: number[], period = 20): Num[] {
  const mfv = high.map((_, i) => {
    const range = high[i] - low[i];
    const m = range === 0 ? 0 : ((close[i] - low[i]) - (high[i] - close[i])) / range;
    return m * volume[i];
  });
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = period - 1; i < close.length; i++) {
    let sM = 0, sV = 0;
    for (let j = i - period + 1; j <= i; j++) { sM += mfv[j]; sV += volume[j]; }
    out[i] = sV === 0 ? 0 : sM / sV;
  }
  return out;
}

/** Accumulation/Distribution line. */
export function accumDist(high: number[], low: number[], close: number[], volume: number[]): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  let ad = 0;
  for (let i = 0; i < close.length; i++) {
    const range = high[i] - low[i];
    const m = range === 0 ? 0 : ((close[i] - low[i]) - (high[i] - close[i])) / range;
    ad += m * volume[i];
    out[i] = ad;
  }
  return out;
}

/** Registry of every indicator above (name → fn) for UI menus and iteration. */
export const INDICATORS = {
  sma, ema, rma, wma, vwap,
  rsi, macd, roc, momentum, stochastic, williamsR, cci, mfi, trix,
  stdDev, bollingerBands, atr, keltnerChannels, donchianChannels,
  adx, parabolicSAR, superTrend, ichimoku,
  obv, cmf, accumDist,
} as const;
