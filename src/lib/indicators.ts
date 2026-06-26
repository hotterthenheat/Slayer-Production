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

// ─────────────────────────────────────────────────────────────────────────────
// Extended set (trend / momentum / volatility / volume / statistical)
// ─────────────────────────────────────────────────────────────────────────────

/** Apply a number[]→Num[] op to an array carrying a leading-null warm-up, re-aligned 1:1. */
function aligned(arr: Num[], fn: (vals: number[]) => Num[]): Num[] {
  const first = arr.findIndex(v => v != null);
  const out: Num[] = new Array(arr.length).fill(null);
  if (first < 0) return out;
  const res = fn(arr.slice(first).map(v => v as number));
  for (let i = 0; i < res.length; i++) out[first + i] = res[i];
  return out;
}

/** Hull Moving Average — fast and smooth, engineered to cut lag. */
export function hma(values: number[], period = 16): Num[] {
  const half = Math.max(1, Math.round(period / 2)), sq = Math.max(1, Math.round(Math.sqrt(period)));
  const wHalf = wma(values, half), wFull = wma(values, period);
  const raw: Num[] = values.map((_, i) => (wHalf[i] != null && wFull[i] != null) ? 2 * (wHalf[i] as number) - (wFull[i] as number) : null);
  return aligned(raw, v => wma(v, sq));
}

/** Volume-Weighted Moving Average (rolling Σpv / Σv). */
export function vwma(values: number[], volume: number[], period = 20): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let sumPV = 0, sumV = 0;
  for (let i = 0; i < values.length; i++) {
    sumPV += values[i] * volume[i]; sumV += volume[i];
    if (i >= period) { sumPV -= values[i - period] * volume[i - period]; sumV -= volume[i - period]; }
    if (i >= period - 1) out[i] = sumV === 0 ? null : sumPV / sumV;
  }
  return out;
}

/** McGinley Dynamic — a lag-minimising MA that self-adjusts to market speed. */
export function mcginleyDynamic(values: number[], period = 14): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  const seed = sma(values, period);
  let md: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (md == null) { if (seed[i] != null) { md = seed[i] as number; out[i] = md; } continue; }
    const c = values[i], denom = 0.6 * period * Math.pow(c / md, 4);
    md = md + (c - md) / (denom === 0 ? 1 : denom);
    out[i] = md;
  }
  return out;
}

/** Aroon Up/Down/Oscillator — how recently the period extreme printed. */
export function aroon(high: number[], low: number[], period = 25): { up: Num[]; down: Num[]; oscillator: Num[] } {
  const up: Num[] = new Array(high.length).fill(null), down: Num[] = new Array(high.length).fill(null), oscillator: Num[] = new Array(high.length).fill(null);
  for (let i = period; i < high.length; i++) {
    let hi = -Infinity, lo = Infinity, hIdx = i, lIdx = i;
    for (let j = i - period; j <= i; j++) { if (high[j] >= hi) { hi = high[j]; hIdx = j; } if (low[j] <= lo) { lo = low[j]; lIdx = j; } }
    const u = (100 * (period - (i - hIdx))) / period, d = (100 * (period - (i - lIdx))) / period;
    up[i] = u; down[i] = d; oscillator[i] = u - d;
  }
  return { up, down, oscillator };
}

/** Stochastic RSI — the Stochastic transform applied to RSI (0..100). */
export function stochRsi(close: number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): { k: Num[]; d: Num[] } {
  const r = rsi(close, rsiPeriod);
  const raw: Num[] = new Array(close.length).fill(null);
  for (let i = rsiPeriod + stochPeriod - 1; i < close.length; i++) {
    let mn = Infinity, mx = -Infinity, ok = true;
    for (let j = i - stochPeriod + 1; j <= i; j++) { const v = r[j]; if (v == null) { ok = false; break; } mn = Math.min(mn, v); mx = Math.max(mx, v); }
    if (ok) raw[i] = mx === mn ? 0 : ((r[i] as number) - mn) / (mx - mn) * 100;
  }
  const k = aligned(raw, v => sma(v, kSmooth));
  return { k, d: aligned(k, v => sma(v, dSmooth)) };
}

/** True Strength Index — double-smoothed momentum (−100..100) + signal line. */
export function tsi(close: number[], longP = 25, shortP = 13, signalP = 13): { tsi: Num[]; signal: Num[] } {
  const pc: Num[] = new Array(close.length).fill(null), apc: Num[] = new Array(close.length).fill(null);
  for (let i = 1; i < close.length; i++) { const ch = close[i] - close[i - 1]; pc[i] = ch; apc[i] = Math.abs(ch); }
  const ds = (a: Num[]) => aligned(aligned(a, v => ema(v, longP)), v => ema(v, shortP));
  const dpc = ds(pc), dapc = ds(apc);
  const out: Num[] = close.map((_, i) => (dpc[i] != null && dapc[i] != null && (dapc[i] as number) !== 0) ? 100 * (dpc[i] as number) / (dapc[i] as number) : null);
  return { tsi: out, signal: aligned(out, v => ema(v, signalP)) };
}

/** Ultimate Oscillator — weighted blend of 7/14/28-bar buying pressure (0..100). */
export function ultimateOscillator(high: number[], low: number[], close: number[], p1 = 7, p2 = 14, p3 = 28): Num[] {
  const len = close.length, bp: number[] = new Array(len).fill(0), tr: number[] = new Array(len).fill(0);
  for (let i = 0; i < len; i++) { const prevC = i > 0 ? close[i - 1] : close[i]; bp[i] = close[i] - Math.min(low[i], prevC); tr[i] = Math.max(high[i], prevC) - Math.min(low[i], prevC); }
  const roll = (arr: number[], p: number, i: number) => { let s = 0; for (let j = i - p + 1; j <= i; j++) s += arr[j]; return s; };
  const out: Num[] = new Array(len).fill(null);
  for (let i = p3; i < len; i++) {
    const t1 = roll(tr, p1, i), t2 = roll(tr, p2, i), t3 = roll(tr, p3, i);
    if (t1 === 0 || t2 === 0 || t3 === 0) continue;
    out[i] = (100 * (4 * (roll(bp, p1, i) / t1) + 2 * (roll(bp, p2, i) / t2) + (roll(bp, p3, i) / t3))) / 7;
  }
  return out;
}

/** Awesome Oscillator — SMA5 − SMA34 of the median price. */
export function awesomeOscillator(high: number[], low: number[], fast = 5, slow = 34): Num[] {
  const med = high.map((_, i) => (high[i] + low[i]) / 2), f = sma(med, fast), s = sma(med, slow);
  return med.map((_, i) => (f[i] != null && s[i] != null) ? (f[i] as number) - (s[i] as number) : null);
}

/** Annualised historical volatility (%) — rolling stdev of log returns. */
export function historicalVolatility(close: number[], period = 20, annualization = 252): Num[] {
  const r: Num[] = new Array(close.length).fill(null);
  for (let i = 1; i < close.length; i++) r[i] = close[i - 1] > 0 ? Math.log(close[i] / close[i - 1]) : null;
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = period; i < close.length; i++) {
    let mean = 0, ok = true;
    for (let j = i - period + 1; j <= i; j++) { if (r[j] == null) { ok = false; break; } mean += r[j] as number; }
    if (!ok) continue; mean /= period;
    let v = 0; for (let j = i - period + 1; j <= i; j++) v += ((r[j] as number) - mean) ** 2;
    out[i] = Math.sqrt(v / period) * Math.sqrt(annualization) * 100;
  }
  return out;
}

/** Chaikin Volatility — ROC of an EMA of the high-low range. */
export function chaikinVolatility(high: number[], low: number[], period = 10): Num[] {
  const e = ema(high.map((_, i) => high[i] - low[i]), period);
  const out: Num[] = new Array(high.length).fill(null);
  for (let i = period; i < high.length; i++) if (e[i] != null && e[i - period] != null && (e[i - period] as number) !== 0) out[i] = ((e[i] as number) - (e[i - period] as number)) / (e[i - period] as number) * 100;
  return out;
}

/** Ease of Movement — price displacement per unit volume, SMA-smoothed. */
export function easeOfMovement(high: number[], low: number[], volume: number[], period = 14, scale = 1e8): Num[] {
  const emv: Num[] = new Array(high.length).fill(null);
  for (let i = 1; i < high.length; i++) {
    const dist = (high[i] + low[i]) / 2 - (high[i - 1] + low[i - 1]) / 2, range = high[i] - low[i];
    const boxRatio = range === 0 ? 0 : (volume[i] / scale) / range;
    emv[i] = boxRatio === 0 ? 0 : dist / boxRatio;
  }
  return aligned(emv, v => sma(v, period));
}

/** Negative Volume Index — price action on lower-volume bars (smart-money proxy). */
export function nvi(close: number[], volume: number[], start = 1000): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  if (!close.length) return out;
  let v = start; out[0] = v;
  for (let i = 1; i < close.length; i++) { if (volume[i] < volume[i - 1] && close[i - 1] !== 0) v += v * (close[i] - close[i - 1]) / close[i - 1]; out[i] = v; }
  return out;
}

/** Positive Volume Index — price action on higher-volume bars (crowd proxy). */
export function pvi(close: number[], volume: number[], start = 1000): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  if (!close.length) return out;
  let v = start; out[0] = v;
  for (let i = 1; i < close.length; i++) { if (volume[i] > volume[i - 1] && close[i - 1] !== 0) v += v * (close[i] - close[i - 1]) / close[i - 1]; out[i] = v; }
  return out;
}

/** Volume Rate of Change (%). */
export function vroc(volume: number[], period = 14): Num[] {
  const out: Num[] = new Array(volume.length).fill(null);
  for (let i = period; i < volume.length; i++) out[i] = volume[i - period] === 0 ? null : (volume[i] - volume[i - period]) / volume[i - period] * 100;
  return out;
}

/** Rolling least-squares linear regression — endpoint value + slope over `period`. */
export function linearRegression(values: number[], period = 20): { value: Num[]; slope: Num[] } {
  const value: Num[] = new Array(values.length).fill(null), slope: Num[] = new Array(values.length).fill(null);
  const xMean = (period - 1) / 2;
  let sxx = 0; for (let j = 0; j < period; j++) sxx += (j - xMean) ** 2;
  for (let i = period - 1; i < values.length; i++) {
    let yMean = 0; for (let j = 0; j < period; j++) yMean += values[i - period + 1 + j]; yMean /= period;
    let sxy = 0; for (let j = 0; j < period; j++) sxy += (j - xMean) * (values[i - period + 1 + j] - yMean);
    const m = sxx === 0 ? 0 : sxy / sxx;
    slope[i] = m; value[i] = yMean + m * ((period - 1) - xMean);
  }
  return { value, slope };
}

/** Standard Error Bands around the linear-regression line. */
export function standardErrorBands(values: number[], period = 20, mult = 2): { upper: Num[]; middle: Num[]; lower: Num[] } {
  const { value, slope } = linearRegression(values, period);
  const upper: Num[] = new Array(values.length).fill(null), lower: Num[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    if (value[i] == null || slope[i] == null) continue;
    const m = slope[i] as number, b = (value[i] as number) - m * (period - 1);
    let se = 0; for (let j = 0; j < period; j++) { const yhat = b + m * j; se += (values[i - period + 1 + j] - yhat) ** 2; }
    se = Math.sqrt(se / Math.max(1, period - 2));
    upper[i] = (value[i] as number) + mult * se; lower[i] = (value[i] as number) - mult * se;
  }
  return { upper, middle: value, lower };
}

/** Detrended Price Oscillator — price minus a displaced SMA, isolating cycles. */
export function dpo(close: number[], period = 20): Num[] {
  const m = sma(close, period), shift = Math.floor(period / 2) + 1;
  const out: Num[] = new Array(close.length).fill(null);
  for (let i = 0; i < close.length; i++) { const k = i - shift; if (k >= 0 && m[i] != null) out[i] = close[k] - (m[i] as number); }
  return out;
}

/** Fisher Transform — normalises price toward a Gaussian to sharpen turning points. */
export function fisherTransform(high: number[], low: number[], period = 9): { fisher: Num[]; trigger: Num[] } {
  const len = high.length, med = high.map((_, i) => (high[i] + low[i]) / 2);
  const fisher: Num[] = new Array(len).fill(null), trigger: Num[] = new Array(len).fill(null);
  let x = 0, f = 0;
  for (let i = period - 1; i < len; i++) {
    let mn = Infinity, mx = -Infinity;
    for (let j = i - period + 1; j <= i; j++) { mn = Math.min(mn, med[j]); mx = Math.max(mx, med[j]); }
    const range = (mx - mn) || 1e-10;
    x = Math.max(-0.999, Math.min(0.999, 0.66 * ((2 * (med[i] - mn) / range) - 1) + 0.67 * x));
    const prevF = f;
    f = 0.5 * Math.log((1 + x) / (1 - x)) + 0.5 * f;
    fisher[i] = f; trigger[i] = prevF;
  }
  return { fisher, trigger };
}

/** TTM Squeeze — Bollinger inside Keltner (squeeze on) + a linreg momentum histogram. */
export function ttmSqueeze(high: number[], low: number[], close: number[], period = 20, bbMult = 2, kcMult = 1.5): { squeezeOn: boolean[]; momentum: Num[] } {
  const bb = bollingerBands(close, period, bbMult), kc = keltnerChannels(high, low, close, period, kcMult);
  const squeezeOn: boolean[] = new Array(close.length).fill(false);
  for (let i = 0; i < close.length; i++) if (bb.upper[i] != null && kc.upper[i] != null) squeezeOn[i] = (bb.upper[i] as number) < (kc.upper[i] as number) && (bb.lower[i] as number) > (kc.lower[i] as number);
  const dc = donchianChannels(high, low, period), m = sma(close, period);
  const detr: Num[] = close.map((_, i) => (dc.middle[i] != null && m[i] != null) ? close[i] - ((dc.middle[i] as number) + (m[i] as number)) / 2 : null);
  return { squeezeOn, momentum: aligned(detr, v => linearRegression(v, period).value) };
}

/** Classic floor-trader pivot points from a prior period's H/L/C. */
export function pivotPoints(high: number, low: number, close: number): { p: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number } {
  const p = (high + low + close) / 3;
  return { p, r1: 2 * p - low, r2: p + (high - low), r3: high + 2 * (p - low), s1: 2 * p - high, s2: p - (high - low), s3: low - 2 * (high - p) };
}

/** Fibonacci retracement levels between a swing high and low (ratio → price). */
export function fibonacciRetracement(high: number, low: number): { ratio: number; price: number }[] {
  const range = high - low;
  return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(ratio => ({ ratio, price: high - range * ratio }));
}

/** Registry of every indicator above (name → fn) for UI menus and iteration. */
export const INDICATORS = {
  sma, ema, rma, wma, vwap, hma, vwma, mcginleyDynamic,
  rsi, macd, roc, momentum, stochastic, williamsR, cci, mfi, trix,
  stochRsi, tsi, ultimateOscillator, awesomeOscillator, dpo, fisherTransform,
  stdDev, bollingerBands, atr, keltnerChannels, donchianChannels,
  historicalVolatility, chaikinVolatility, standardErrorBands, ttmSqueeze,
  adx, parabolicSAR, superTrend, ichimoku, aroon, linearRegression,
  obv, cmf, accumDist, easeOfMovement, nvi, pvi, vroc,
  pivotPoints, fibonacciRetracement,
} as const;
