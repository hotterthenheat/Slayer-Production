/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Statistical regime engine — the persistence/mean-reversion/regime tools that
 * power the Slayer "regime matrix" ACTIVE/INACTIVE flags. All computed keyless
 * from the OHLC candle series:
 *   • Hurst exponent (R/S analysis)            → trend persistence
 *   • Ornstein-Uhlenbeck half-life (AR(1))     → mean-reversion speed
 *   • Lightweight HMM-style regime classifier  → TREND / MEAN_REVERSION / TAIL_RISK
 *   • Volatility compression (EMA pinch + RSI flat)
 *   • Volatility expansion (ATR expansion + persistence)
 *   • Forward-volatility matrix (near vs far realized-vol term structure)
 */
import { Candle } from '../types';
import { calculateWilderRSI, calculateWilderATR } from './v11Math';
import { closeToCloseVol } from './realizedVol';

const ln = Math.log;
const closes = (c: Candle[]) => c.map((k) => k.close).filter((x) => x > 0 && isFinite(x));
const logReturns = (px: number[]) => { const r: number[] = []; for (let i = 1; i < px.length; i++) r.push(ln(px[i] / px[i - 1])); return r; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };

/** Exponential moving average series. */
export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

/** Hurst exponent via Rescaled-Range (R/S) analysis. H>0.5 trending, <0.5 mean-reverting. */
export function hurstExponent(series: number[]): number {
  const rets = logReturns(series);
  const N = rets.length;
  if (N < 32) return 0.5; // not enough data → random walk
  const windows: number[] = [];
  for (let n = 8; n <= Math.floor(N / 2); n = Math.floor(n * 1.6)) windows.push(n);
  const logN: number[] = [], logRS: number[] = [];
  for (const n of windows) {
    const chunks = Math.floor(N / n);
    if (chunks < 1) continue;
    let rsSum = 0, rsCount = 0;
    for (let c = 0; c < chunks; c++) {
      const seg = rets.slice(c * n, c * n + n);
      const m = mean(seg);
      let cum = 0, min = Infinity, max = -Infinity;
      for (const x of seg) { cum += x - m; if (cum < min) min = cum; if (cum > max) max = cum; }
      const R = max - min;
      const S = std(seg);
      if (S > 1e-12 && R > 0) { rsSum += R / S; rsCount++; }
    }
    if (rsCount > 0) { logN.push(ln(n)); logRS.push(ln(rsSum / rsCount)); }
  }
  if (logN.length < 2) return 0.5;
  // OLS slope of logRS vs logN.
  const mx = mean(logN), my = mean(logRS);
  let num = 0, den = 0;
  for (let i = 0; i < logN.length; i++) { num += (logN[i] - mx) * (logRS[i] - my); den += (logN[i] - mx) * (logN[i] - mx); }
  const H = den > 0 ? num / den : 0.5;
  return Math.max(0, Math.min(1, H));
}

export interface OUResult {
  theta: number; // mean-reversion speed (per bar)
  mu: number; // long-term mean (price)
  halfLifeBars: number; // ln(2)/theta, in bars
  halfLifeMinutes: number; // halfLifeBars × candle interval (minutes)
  meanReverting: boolean;
}

/**
 * Ornstein-Uhlenbeck calibration on a STATIONARIZED series.
 *
 * Regressing Δx_t on the RAW level x_{t-1} biases the AR(1) slope toward 0 for a
 * trending (non-stationary) price — so `meanReverting` skews false and the
 * half-life is unreliable. Instead we regress the change on the DEVIATION from a
 * rolling mean:  Δx_t = a + b·(x_{t-1} − m_{t-1}) + e, where m_t is a trailing
 * SMA. The de-meaned regressor strips the local drift, so b estimates the true
 * pull-to-equilibrium and θ = −ln(1+b) is the correct OU mean-reversion speed.
 *
 * Half-life is reported BOTH in bars (`halfLifeBars`) and in MINUTES
 * (`halfLifeMinutes` = bars × interval). `intervalMin` defaults to 5 (the
 * platform's default bar) so existing number[]-only callers keep working; pass
 * the real candle interval (see realizedVol.intervalMinutes) for an accurate
 * minutes figure.
 */
export function ornsteinUhlenbeck(series: number[], intervalMin = 5, meanWindow = 20): OUResult {
  const px = series.filter((x) => x > 0 && isFinite(x));
  if (px.length < 20) return { theta: 0, mu: mean(px), halfLifeBars: Infinity, halfLifeMinutes: Infinity, meanReverting: false };
  // Trailing rolling mean m_{t} over the prior `meanWindow` levels (causal, no look-ahead).
  const w = Math.max(2, Math.min(meanWindow, px.length - 1));
  const rollMean = (idx: number) => { const lo = Math.max(0, idx - w + 1); let s = 0; for (let j = lo; j <= idx; j++) s += px[j]; return s / (idx - lo + 1); };
  // Stationarized regressor: deviation of x_{t-1} from its trailing mean.
  // Δx_t = a + b·(x_{t-1} − m_{t-1}) + e ; θ = −ln(1+b), reverting when b<0.
  const dev: number[] = [];
  const dx: number[] = [];
  for (let i = 1; i < px.length; i++) { dev.push(px[i - 1] - rollMean(i - 1)); dx.push(px[i] - px[i - 1]); }
  const mDev = mean(dev), mdx = mean(dx);
  let num = 0, den = 0;
  for (let i = 0; i < dev.length; i++) { num += (dev[i] - mDev) * (dx[i] - mdx); den += (dev[i] - mDev) * (dev[i] - mDev); }
  const b = den > 0 ? num / den : 0;
  const a = mdx - b * mDev;
  const onePlusB = 1 + b;
  const theta = onePlusB > 0 && onePlusB < 1 ? -ln(onePlusB) : (b < 0 ? -b : 0);
  // Equilibrium price: deviation regression centers on the rolling mean of the
  // latest bar, offset by the regression intercept (a + b·dev = 0 ⇒ dev = −a/b).
  const lastMean = rollMean(px.length - 1);
  const mu = b !== 0 ? lastMean - a / b : lastMean;
  const halfLifeBars = theta > 1e-9 ? ln(2) / theta : Infinity;
  const safeInterval = intervalMin > 0 && isFinite(intervalMin) ? intervalMin : 5;
  const halfLifeMinutes = isFinite(halfLifeBars) ? halfLifeBars * safeInterval : Infinity;
  return {
    theta: Number(theta.toFixed(5)),
    mu: Number(mu.toFixed(2)),
    halfLifeBars: isFinite(halfLifeBars) ? Number(halfLifeBars.toFixed(1)) : Infinity,
    halfLifeMinutes: isFinite(halfLifeMinutes) ? Number(halfLifeMinutes.toFixed(1)) : Infinity,
    meanReverting: b < -1e-4,
  };
}

export type RegimeState = 'TREND_EXPANSION' | 'MEAN_REVERSION' | 'TAIL_RISK';
export interface RegimeResult {
  state: RegimeState;
  posteriors: Record<RegimeState, number>;
  transitionProb: number; // confidence of the dominant state (0-100)
  hurst: number;
}

/**
 * Lightweight HMM-style regime classifier. A full Viterbi-decoded HMM needs a
 * transition matrix trained on years of data (requires a historical feed); this
 * is the keyless equivalent: a Gaussian-feature classifier over realized-vol
 * level, return kurtosis (tail), and the Hurst persistence, softmaxed into
 * posteriors over the three states.
 */
export function classifyRegime(candles: Candle[]): RegimeResult {
  const px = closes(candles);
  const rets = logReturns(px);
  const hurst = hurstExponent(px);
  if (rets.length < 10) {
    return { state: 'MEAN_REVERSION', posteriors: { TREND_EXPANSION: 0.33, MEAN_REVERSION: 0.34, TAIL_RISK: 0.33 }, transitionProb: 34, hurst };
  }
  const recent = rets.slice(-30);
  const vol = std(recent);
  const m = mean(recent);
  const kurt = vol > 0 ? mean(recent.map((r) => Math.pow((r - m) / vol, 4))) : 3;
  const volPctile = std(rets); // baseline
  const volRatio = volPctile > 0 ? vol / volPctile : 1;

  // Feature scores (unnormalised energies).
  const trendE = Math.max(0, (hurst - 0.5) * 6) + Math.max(0, (volRatio - 1) * 1.2);
  const revertE = Math.max(0, (0.5 - hurst) * 6) + Math.max(0, (1 - volRatio) * 1.5) + 0.4;
  const tailE = Math.max(0, (kurt - 4) * 0.5) + Math.max(0, (volRatio - 1.6) * 2);

  const exps = [trendE, revertE, tailE].map((e) => Math.exp(e));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const posteriors: Record<RegimeState, number> = {
    TREND_EXPANSION: exps[0] / sum,
    MEAN_REVERSION: exps[1] / sum,
    TAIL_RISK: exps[2] / sum,
  };
  let state: RegimeState = 'MEAN_REVERSION';
  let best = -1;
  (Object.keys(posteriors) as RegimeState[]).forEach((k) => { if (posteriors[k] > best) { best = posteriors[k]; state = k; } });
  return { state, posteriors, transitionProb: Math.round(best * 100), hurst };
}

export interface VolRegime { active: boolean; score: number; detail: string; }

/**
 * Volatility COMPRESSION: EMAs (8/21/50/200) pinch to a statistical extreme and
 * RSI flatlines near 50 — energy winding up before a directional move.
 */
export function volCompression(candles: Candle[]): VolRegime {
  const px = closes(candles);
  if (px.length < 60) return { active: false, score: 0, detail: 'insufficient history' };
  const e8 = ema(px, 8), e21 = ema(px, 21), e50 = ema(px, 50), e200 = ema(px, 200);
  const i = px.length - 1;
  const spread = std([e8[i], e21[i], e50[i], e200[i]]) / (px[i] || 1); // normalised EMA dispersion
  // Rolling baseline of the EMA spread to find a statistical extreme.
  const hist: number[] = [];
  for (let j = Math.max(50, px.length - 120); j <= i; j++) {
    const s = std([e8[j], e21[j], e50[j], e200[j]]) / (px[j] || 1);
    if (isFinite(s)) hist.push(s);
  }
  const sorted = [...hist].sort((a, b) => a - b);
  const rank = sorted.length ? sorted.filter((v) => v <= spread).length / sorted.length : 0.5;
  const rsiArr = calculateWilderRSI(candles);
  const rsi = rsiArr.length ? rsiArr[rsiArr.length - 1] : 50;
  const rsiFlat = Math.abs(rsi - 50) < 10;
  const active = rank <= 0.2 && rsiFlat;
  const score = (1 - rank) * (rsiFlat ? 1 : 0.5);
  return { active, score: Number(score.toFixed(2)), detail: `EMA pinch pctile ${(rank * 100).toFixed(0)} · RSI ${rsi.toFixed(0)}` };
}

/**
 * Volatility EXPANSION: ATR expanding vs its recent baseline AND trend
 * persistence (Hurst>0.5) — a violent directional break underway.
 */
export function volExpansion(candles: Candle[]): VolRegime {
  if (candles.length < 30) return { active: false, score: 0, detail: 'insufficient history' };
  const atr = calculateWilderATR(candles);
  if (atr.length < 20) return { active: false, score: 0, detail: 'insufficient ATR' };
  const cur = atr[atr.length - 1];
  const base = mean(atr.slice(-20, -1));
  const ratio = base > 0 ? cur / base : 1;
  const hurst = hurstExponent(closes(candles));
  const rvShort = closeToCloseVol(candles, 10);
  const rvLong = closeToCloseVol(candles, 40);
  const volRising = rvLong > 0 ? rvShort / rvLong : 1;
  const active = ratio > 1.25 && (hurst > 0.5 || volRising > 1.2);
  const score = Math.max(0, Math.min(1, (ratio - 1) * 1.5));
  return { active, score: Number(score.toFixed(2)), detail: `ATR ${ratio.toFixed(2)}× · H ${hurst.toFixed(2)}` };
}

/**
 * Realized-vol term-structure ratio: near-window realized vol (10) vs the longer
 * baseline (40). A ratio > 1 means short-horizon realized vol is RICHER than the
 * baseline (a backward-looking term-structure inversion). NOTE: this is a trailing
 * REALIZED-vol measure, not forward/implied vol — with a live chain it would instead
 * consume the IV term structure / Dupire local-vol surface. (Name kept for callers.)
 */
export function forwardVolMatrix(candles: Candle[]): VolRegime {
  if (candles.length < 50) return { active: false, score: 0, detail: 'insufficient history' };
  const rvNear = closeToCloseVol(candles, 10);
  const rvFar = closeToCloseVol(candles, 40);
  const rvRatio = rvFar > 0 ? rvNear / rvFar : 1;
  // "Active" when short-horizon realized vol is materially richer than the baseline.
  const active = rvRatio > 1.2;
  const score = Math.max(0, Math.min(1, (rvRatio - 1) * 2));
  return { active, score: Number(score.toFixed(2)), detail: `near/base RV ${rvRatio.toFixed(2)}× (RV ${(rvNear * 100).toFixed(0)}%)` };
}
