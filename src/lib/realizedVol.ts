/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Realized-volatility suite + Variance Risk Premium (VRP), computed from the OHLC
 * candles the engine already streams. All estimators return ANNUALIZED vol
 * (decimal, e.g. 0.18 = 18%). Annualization uses the bar interval inferred from
 * the candle timestamps against a 252-day × 390-min trading year.
 */
import { Candle } from '../types';

const ln = Math.log;

/** Median bar interval in minutes (robust to gaps).
 *
 * Falls back to a 5-minute default when the `timestamp` field is NOT a real
 * epoch-ms clock (e.g. sequential bar indices 0,1,2…). Without this guard, an
 * index series yields a median diff of 1/60000 min, which blows the
 * annualization factor up by ~1e5×. We treat the inferred interval as valid
 * only when it lands in a plausible intraday-to-daily band [0.5 min, 1 day].
 */
export function intervalMinutes(candles: Candle[]): number {
  if (!candles || candles.length < 2) return 5;
  const diffs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const d = (candles[i].timestamp - candles[i - 1].timestamp) / 60000;
    if (d > 0 && isFinite(d)) diffs.push(d);
  }
  if (!diffs.length) return 5;
  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)] || 5;
  // Reject implausible intervals (non-timestamp inputs) → default 5-min bars.
  if (median < 0.5 || median > 1440) return 5;
  return median;
}

/** Trading periods per year for a given bar interval. */
export function periodsPerYear(intervalMin: number): number {
  return (252 * 390) / Math.max(intervalMin, 1e-6);
}

function annFactor(candles: Candle[]): number {
  return Math.sqrt(periodsPerYear(intervalMinutes(candles)));
}

function tail(candles: Candle[], period: number): Candle[] {
  const p = Math.max(2, Math.min(period, candles.length));
  return candles.slice(candles.length - p);
}

/** Close-to-close (classic) realized vol, annualized. */
export function closeToCloseVol(candles: Candle[], period = 20): number {
  if (!candles || candles.length < 3) return 0;
  const c = tail(candles, period + 1);
  const rets: number[] = [];
  for (let i = 1; i < c.length; i++) {
    if (c[i].close > 0 && c[i - 1].close > 0) rets.push(ln(c[i].close / c[i - 1].close));
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (rets.length - 1);
  return Math.sqrt(Math.max(0, variance)) * annFactor(candles);
}

/** Parkinson high-low estimator (annualized). */
export function parkinsonVol(candles: Candle[], period = 20): number {
  if (!candles || candles.length < 2) return 0;
  const c = tail(candles, period);
  let sum = 0, n = 0;
  for (const k of c) {
    if (k.high > 0 && k.low > 0) { const hl = ln(k.high / k.low); sum += hl * hl; n++; }
  }
  if (!n) return 0;
  const perBarVar = sum / (4 * Math.LN2 * n);
  return Math.sqrt(Math.max(0, perBarVar)) * annFactor(candles);
}

/** Garman-Klass estimator (annualized). */
export function garmanKlassVol(candles: Candle[], period = 20): number {
  if (!candles || candles.length < 2) return 0;
  const c = tail(candles, period);
  let sum = 0, n = 0;
  for (const k of c) {
    if (k.high > 0 && k.low > 0 && k.open > 0 && k.close > 0) {
      const hl = ln(k.high / k.low);
      const co = ln(k.close / k.open);
      sum += 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co;
      n++;
    }
  }
  if (!n) return 0;
  return Math.sqrt(Math.max(0, sum / n)) * annFactor(candles);
}

/** Rogers-Satchell estimator — drift-independent (annualized). */
export function rogersSatchellVol(candles: Candle[], period = 20): number {
  if (!candles || candles.length < 2) return 0;
  const c = tail(candles, period);
  let sum = 0, n = 0;
  for (const k of c) {
    if (k.high > 0 && k.low > 0 && k.open > 0 && k.close > 0) {
      sum += ln(k.high / k.close) * ln(k.high / k.open) + ln(k.low / k.close) * ln(k.low / k.open);
      n++;
    }
  }
  if (!n) return 0;
  return Math.sqrt(Math.max(0, sum / n)) * annFactor(candles);
}

/** Yang-Zhang estimator — minimum-variance, handles overnight gaps + drift (annualized). */
export function yangZhangVol(candles: Candle[], period = 20): number {
  if (!candles || candles.length < 4) return closeToCloseVol(candles, period);
  const c = tail(candles, period + 1); // need a prior close
  const n = c.length - 1;
  if (n < 2) return 0;
  const overnight: number[] = []; // ln(O_i / C_{i-1})
  const openClose: number[] = []; // ln(C_i / O_i)
  let rs = 0;
  for (let i = 1; i < c.length; i++) {
    const k = c[i], prev = c[i - 1];
    if (!(k.open > 0 && k.close > 0 && prev.close > 0 && k.high > 0 && k.low > 0)) continue;
    overnight.push(ln(k.open / prev.close));
    openClose.push(ln(k.close / k.open));
    rs += ln(k.high / k.close) * ln(k.high / k.open) + ln(k.low / k.close) * ln(k.low / k.open);
  }
  const m = overnight.length;
  if (m < 2) return 0;
  const varOf = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, x) => a + (x - mean) * (x - mean), 0) / (arr.length - 1);
  };
  const sigmaO2 = varOf(overnight);
  const sigmaC2 = varOf(openClose);
  const sigmaRS2 = rs / m;
  const k = 0.34 / (1.34 + (m + 1) / (m - 1));
  const yz2 = sigmaO2 + k * sigmaC2 + (1 - k) * sigmaRS2;
  return Math.sqrt(Math.max(0, yz2)) * annFactor(candles);
}

export interface RealizedVolResult {
  parkinson: number;
  garmanKlass: number;
  rogersSatchell: number;
  yangZhang: number;
  closeToClose: number;
  primary: number; // yangZhang — the headline RV
  intervalMinutes: number;
  lookback: number;
}

export function computeRealizedVol(candles: Candle[], lookback = 20): RealizedVolResult {
  return {
    parkinson: parkinsonVol(candles, lookback),
    garmanKlass: garmanKlassVol(candles, lookback),
    rogersSatchell: rogersSatchellVol(candles, lookback),
    yangZhang: yangZhangVol(candles, lookback),
    closeToClose: closeToCloseVol(candles, lookback),
    primary: yangZhangVol(candles, lookback),
    intervalMinutes: intervalMinutes(candles),
    lookback,
  };
}

export interface VolConeBucket {
  window: number;
  current: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  percentile: number; // where `current` sits within its own rolling history (0-100)
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(sorted.length - 1, Math.max(0, q * (sorted.length - 1)));
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Volatility cone: for each lookback window, the rolling distribution of realized
 * vol across history, plus where the latest reading sits inside it (percentile).
 */
export function volCone(candles: Candle[], windows: number[] = [10, 20, 30, 60]): VolConeBucket[] {
  const out: VolConeBucket[] = [];
  for (const w of windows) {
    if (!candles || candles.length < w + 3) continue;
    const series: number[] = [];
    // rolling close-to-close vol of width w across the available history
    for (let end = w + 1; end <= candles.length; end++) {
      const slice = candles.slice(end - (w + 1), end);
      series.push(closeToCloseVol(slice, w));
    }
    const valid = series.filter((v) => v > 0);
    if (valid.length < 2) continue;
    const current = series[series.length - 1];
    const sorted = [...valid].sort((a, b) => a - b);
    const below = sorted.filter((v) => v <= current).length;
    out.push({
      window: w,
      current,
      min: sorted[0],
      p25: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      max: sorted[sorted.length - 1],
      percentile: Math.round((below / sorted.length) * 100),
    });
  }
  return out;
}

export interface VRPResult {
  iv: number; // annualized implied vol (decimal)
  rv: number; // annualized realized (Yang-Zhang)
  vrp: number; // iv - rv (vol points, decimal)
  ratio: number; // iv / rv
  richness: 'IV RICH' | 'NEUTRAL' | 'IV CHEAP' | 'N/A';
  rvPercentile: number; // where current RV sits in its own cone (0-100)
}

/**
 * Variance Risk Premium: implied minus realized. IV > RV ("IV rich") favours
 * premium-selling; IV < RV ("IV cheap") favours owning gamma.
 */
export function computeVRP(iv: number, candles: Candle[], lookback = 20): VRPResult {
  const rv = yangZhangVol(candles, lookback);
  const cone = volCone(candles, [lookback]);
  const rvPercentile = cone.length ? cone[0].percentile : 50;
  // Insufficient/flat history -> yangZhangVol returns 0. Reporting vrp=iv, ratio=0,
  // richness=NEUTRAL would mislabel a maximally IV-rich, no-data condition as neutral
  // on exactly the thin-history symbols where a 'no signal' read matters most.
  if (!(rv > 0)) {
    return { iv, rv: 0, vrp: 0, ratio: 0, richness: 'N/A', rvPercentile };
  }
  const vrp = iv - rv;
  const ratio = iv / rv;
  let richness: VRPResult['richness'] = 'NEUTRAL';
  if (ratio >= 1.15) richness = 'IV RICH';
  else if (ratio <= 0.9) richness = 'IV CHEAP';
  return { iv, rv, vrp, ratio, richness, rvPercentile };
}
