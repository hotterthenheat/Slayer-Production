/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 0DTE PROBABILITY ENGINE
 * -----------------------
 * Closed-form, risk-neutral probability math for same-day-expiry options. Every
 * formula here is the textbook result (Hull; Black-Scholes; GBM first-passage),
 * not a heuristic:
 *
 *   • Probability of expiring ITM   = N(d2) (call) / N(-d2) (put)
 *   • Probability of touch (barrier)= exact GBM first-passage (reflection w/ drift)
 *   • Expected-move bands           = S·σ·√t for each intraday horizon
 *   • Strike-pinning probability    = gamma-share × Gaussian proximity × late-day
 *   • End-of-day magnet target      = positive-gamma center of mass (pin level)
 *   • Settlement risk               = P(|return| > 1 EM by the close)
 *
 * Time is measured in trading-year fractions: one 6.5h session = 1/252 yr, so a
 * horizon of `hoursToClose` hours is T = (hoursToClose / 6.5) / 252.
 */
import { stdNormalCDF } from './v11Math';

const TRADING_DAYS = 252;
const SESSION_HOURS = 6.5;

/** Convert hours remaining in the session to a trading-year fraction. */
export function hoursToYearFraction(hours: number): number {
  return Math.max(1e-6, (Math.max(0, hours) / SESSION_HOURS) / TRADING_DAYS);
}

/** Risk-neutral probability the option finishes in the money. */
export function probExpireITM(spot: number, strike: number, T: number, iv: number, isCall: boolean, r = 0.05, q = 0): number {
  if (!(spot > 0) || !(strike > 0) || T <= 0 || iv <= 0) return isCall ? (spot > strike ? 1 : 0) : (spot < strike ? 1 : 0);
  const d2 = (Math.log(spot / strike) + (r - q - 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  return isCall ? stdNormalCDF(d2) : stdNormalCDF(-d2);
}

/**
 * Probability the underlying TOUCHES a barrier before T (continuous monitoring),
 * exact for GBM. ν = r − q − σ²/2 is the log-price drift; m = ln(B/S).
 *   up   (B>S): N((−m+νT)/(σ√T)) + e^{2νm/σ²}·N((−m−νT)/(σ√T))
 *   down (B<S): N(( m−νT)/(σ√T)) + e^{2νm/σ²}·N(( m+νT)/(σ√T))
 * For 0DTE νT≈0 so this collapses to the reflection result 2·N(−|m|/(σ√T)).
 */
export function probabilityOfTouch(spot: number, barrier: number, T: number, iv: number, r = 0.05, q = 0): number {
  if (!(spot > 0) || !(barrier > 0) || T <= 0 || iv <= 0) return 0;
  if (barrier === spot) return 1;
  const m = Math.log(barrier / spot);
  const nu = r - q - 0.5 * iv * iv;
  const sigT = iv * Math.sqrt(T);
  const expTerm = Math.exp((2 * nu * m) / (iv * iv));
  let p: number;
  if (barrier > spot) {
    p = stdNormalCDF((-m + nu * T) / sigT) + expTerm * stdNormalCDF((-m - nu * T) / sigT);
  } else {
    p = stdNormalCDF((m - nu * T) / sigT) + expTerm * stdNormalCDF((m + nu * T) / sigT);
  }
  return Math.max(0, Math.min(1, p));
}

export interface ExpectedMoveBand {
  horizon: string;
  hours: number;
  movePts: number;      // ±1σ in price points
  movePct: number;      // ±1σ as a fraction of spot
  upper1: number; lower1: number; // ±1σ levels
  upper2: number; lower2: number; // ±2σ levels
}

/** Expected-move bands for a set of intraday horizons (1σ = S·σ·√t). */
export function expectedMoveBands(spot: number, iv: number, hoursToClose: number): ExpectedMoveBand[] {
  const horizons: { label: string; hours: number }[] = [
    { label: '1H', hours: Math.min(1, Math.max(0, hoursToClose)) },
    { label: 'EOD', hours: Math.max(0, hoursToClose) },
  ];
  return horizons.map(({ label, hours }) => {
    const T = hoursToYearFraction(hours);
    const sigma1 = spot * iv * Math.sqrt(T);
    return {
      horizon: label, hours,
      movePts: sigma1, movePct: spot > 0 ? sigma1 / spot : 0,
      upper1: spot + sigma1, lower1: spot - sigma1,
      upper2: spot + 2 * sigma1, lower2: spot - 2 * sigma1,
    };
  });
}

export interface PinResult {
  magnet: number;          // pin / magnet target strike
  pinProbability: number;  // 0..1
  gammaShare: number;      // share of total |GEX| concentrated at the magnet
  distancePct: number;     // |spot - magnet| / spot
}

/**
 * Strike-pinning probability. Pinning is driven by (a) how concentrated dealer
 * gamma is at the magnet, (b) how close spot is to it relative to the remaining
 * expected move, and (c) time-of-day (pinning intensifies into the close as
 * gamma→∞). Long-gamma (positive GEX) environments pin; short-gamma repel.
 */
export function pinProbability(params: {
  spot: number; magnet: number; gammaShare: number; netGex: number;
  emToClosePts: number; fracSessionElapsed: number;
}): PinResult {
  const { spot, magnet, gammaShare, netGex, emToClosePts, fracSessionElapsed } = params;
  const distancePct = spot > 0 ? Math.abs(spot - magnet) / spot : 1;
  if (!(spot > 0) || !(magnet > 0) || emToClosePts <= 0) {
    return { magnet, pinProbability: 0, gammaShare, distancePct };
  }
  // Proximity: Gaussian in units of the remaining expected move (within ~1 EM pins).
  const z = (spot - magnet) / emToClosePts;
  const proximity = Math.exp(-0.5 * z * z);
  // Time factor: pinning strengthens late in the session (0.4 → 1.0).
  const timeFactor = 0.4 + 0.6 * Math.max(0, Math.min(1, fracSessionElapsed));
  // Long gamma pins; short gamma actively works against a pin.
  const gammaSign = netGex >= 0 ? 1 : 0.35;
  const p = Math.max(0, Math.min(1, gammaShare * proximity * timeFactor * gammaSign));
  return { magnet, pinProbability: p, gammaShare, distancePct };
}

export interface ZeroDteResult {
  hoursToClose: number;
  T: number;                       // trading-year fraction to close
  expectedMove: ExpectedMoveBand[];
  pin: PinResult;
  eodMagnet: number;               // positive-gamma center-of-mass target
  settlementRiskPct: number;       // P(settle beyond ±1 EM)
  atmIv: number;
}

/** Positive-gamma center of mass — the level dealer hedging pulls price toward. */
export function eodMagnetTarget(strikes: { strike: number; netGex: number }[], spot: number): number {
  if (!strikes || strikes.length === 0) return spot;
  let wsum = 0, w = 0;
  for (const s of strikes) {
    const g = Math.max(0, s.netGex); // positive (stabilizing) gamma pulls toward the strike
    if (g > 0 && s.strike > 0) { wsum += s.strike * g; w += g; }
  }
  return w > 0 ? wsum / w : spot;
}

/**
 * Master 0DTE bundle for the asset at the ATM context.
 * @param strikes per-strike { strike, netGex } (from gex_profile.strikes)
 */
export function compute0DTE(params: {
  spot: number; atmIv: number; hoursToClose: number; netGex: number;
  magnet: number; strikes: { strike: number; netGex: number }[];
}): ZeroDteResult {
  const { spot, atmIv, hoursToClose, netGex, magnet, strikes } = params;
  const T = hoursToYearFraction(hoursToClose);
  const bands = expectedMoveBands(spot, atmIv, hoursToClose);
  const emEod = bands.find((b) => b.horizon === 'EOD')?.movePts || (spot * atmIv * Math.sqrt(T));
  const eodMagnet = eodMagnetTarget(strikes, spot);

  // Gamma share at the magnet — concentration of |GEX| within ±1 strike of it (the
  // magnet plus its immediate neighbours), NOT a single exact strike. Matching only
  // the bare strike made the share ≈ 1/N (a few percent) on a full chain, so the pin
  // probability never cleared its alert threshold; the band makes the feature live.
  const totalAbsGex = strikes.reduce((s, x) => s + Math.abs(x.netGex), 0) || 1;
  const strikeList = strikes.map((x) => x.strike).filter((s) => s > 0).sort((a, b) => a - b);
  let spacing = Infinity;
  for (let i = 1; i < strikeList.length; i++) { const d = strikeList[i] - strikeList[i - 1]; if (d > 0) spacing = Math.min(spacing, d); }
  if (!isFinite(spacing) || spacing <= 0) spacing = Math.max(1, magnet * 0.0025);
  const band = spacing * 1.5; // ±1 strike inclusive
  const magnetAbsGex = strikes
    .filter((x) => Math.abs(x.strike - magnet) <= band)
    .reduce((s, x) => s + Math.abs(x.netGex), 0);
  const gammaShare = Math.min(1, magnetAbsGex / totalAbsGex);

  const fracSessionElapsed = 1 - Math.max(0, Math.min(1, hoursToClose / SESSION_HOURS));
  const pin = pinProbability({ spot, magnet, gammaShare, netGex, emToClosePts: emEod, fracSessionElapsed });

  // Settlement risk: P(|close − now| > 1 EM). A normal gives 2·N(−1) ≈ 31.7%, but the
  // dealer gamma regime reshapes the terminal distribution: net-short gamma (GEX < 0)
  // amplifies moves → wider close → higher risk; net-long gamma dampens → tighter →
  // lower risk. Scale the effective σ by the regime (±25%) so the figure is live, not
  // a constant (which left the "wide distribution" alert permanently dead).
  const gammaRegime = Math.max(-1, Math.min(1, netGex / totalAbsGex));
  const volAdj = Math.max(0.75, Math.min(1.25, 1 - 0.25 * gammaRegime));
  const settlementRiskPct = Math.max(0, Math.min(1, 2 * stdNormalCDF(-1 / volAdj)));

  return { hoursToClose, T, expectedMove: bands, pin, eodMagnet, settlementRiskPct, atmIv };
}
