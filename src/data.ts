/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetInfo, Candle, FairValueGap, LiquidityEvent, TimeframeVal, GexExpirySlice } from './types';

export const ASSET_LIST: AssetInfo[] = [
  {
    key: 'SPX',
    ticker: 'SPX',
    name: 'S&P 500 Index',
    type: 'INDEXES',
    defaultPrice: 5460.00,
    decimals: 2,
    spread: 0.50,
    volatility: 0.55,
    unit: 'USD',
    forecastScale: 0.12,
    stabilityMax: 0.040,
  },
  {
    key: 'QQQ',
    ticker: 'QQQ',
    name: 'Invesco QQQ Trust',
    type: 'ETFS',
    defaultPrice: 480.00,
    decimals: 2,
    spread: 0.02,
    volatility: 0.8,
    unit: 'USD',
    forecastScale: 0.14,
    stabilityMax: 0.045,
  },
  {
    key: 'NDX',
    ticker: 'NDX',
    name: 'Nasdaq 100 Index',
    type: 'INDEXES',
    defaultPrice: 19800.00,
    decimals: 2,
    spread: 1.50,
    volatility: 0.75,
    unit: 'USD',
    forecastScale: 0.18,
    stabilityMax: 0.050,
  },
  {
    key: 'DJX', 
    ticker: 'DJX', 
    name: 'Dow Jones Index', 
    type: 'INDEXES', 
    defaultPrice: 395.0, 
    decimals: 2, 
    spread: 0.1, 
    volatility: 0.5, 
    unit: 'USD', 
    forecastScale: 0.1, 
    stabilityMax: 0.04, 
    optionsStyle: 'weekly' 
  },
  {
    key: 'SOX', 
    ticker: 'SOX', 
    name: 'PHLX Semiconductor Sector', 
    type: 'INDEXES', 
    defaultPrice: 5500.0, 
    decimals: 2, 
    spread: 0.5, 
    volatility: 0.8, 
    unit: 'USD', 
    forecastScale: 0.15, 
    stabilityMax: 0.06, 
    optionsStyle: 'weekly' 
  },
  {
    key: 'XSP', 
    ticker: 'XSP', 
    name: 'Mini-SPX Index', 
    type: 'INDEXES', 
    defaultPrice: 546.0, 
    decimals: 2, 
    spread: 0.05, 
    volatility: 0.5, 
    unit: 'USD', 
    forecastScale: 0.1, 
    stabilityMax: 0.04, 
    optionsStyle: 'weekly' 
  },
  {
    key: 'SPY',
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF',
    type: 'ETFS',
    defaultPrice: 545.30,
    decimals: 2,
    spread: 0.02,
    volatility: 0.6,
    unit: 'USD',
    forecastScale: 0.10,
    stabilityMax: 0.035,
  },
  {
    key: 'RUT',
    ticker: 'RUT',
    name: 'Russell 2000 Index',
    type: 'INDEXES',
    defaultPrice: 2025.00,
    decimals: 2,
    spread: 0.20,
    volatility: 0.70,
    unit: 'USD',
    forecastScale: 0.11,
    stabilityMax: 0.040,
    optionsStyle: 'daily',
  },
  {
    key: 'VIX', ticker: 'VIX', name: 'CBOE Volatility Index', type: 'INDEXES',
    defaultPrice: 13.50, decimals: 2, spread: 0.05, volatility: 2.50, unit: 'USD',
    forecastScale: 0.25, stabilityMax: 0.100, optionsStyle: 'weekly',
  },
  {
    key: 'IWM', ticker: 'IWM', name: 'iShares Russell 2000 ETF', type: 'ETFS',
    defaultPrice: 205.50, decimals: 2, spread: 0.02, volatility: 0.72, unit: 'USD',
    forecastScale: 0.12, stabilityMax: 0.045, optionsStyle: 'daily',
  },
  {
    key: 'DIA', ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average', type: 'ETFS',
    defaultPrice: 390.00, decimals: 2, spread: 0.03, volatility: 0.50, unit: 'USD',
    forecastScale: 0.09, stabilityMax: 0.035, optionsStyle: 'weekly',
  },
  {
    key: 'TLT', ticker: 'TLT', name: '20+ Year Treasury Bond ETF', type: 'ETFS',
    defaultPrice: 93.00, decimals: 2, spread: 0.02, volatility: 0.55, unit: 'USD',
    forecastScale: 0.10, stabilityMax: 0.040, optionsStyle: 'weekly',
  },
  {
    key: 'GLD', ticker: 'GLD', name: 'SPDR Gold Trust', type: 'ETFS',
    defaultPrice: 215.00, decimals: 2, spread: 0.02, volatility: 0.45, unit: 'USD',
    forecastScale: 0.08, stabilityMax: 0.035, optionsStyle: 'weekly',
  },
  {
    key: 'SLV', ticker: 'SLV', name: 'iShares Silver Trust', type: 'ETFS',
    defaultPrice: 26.50, decimals: 2, spread: 0.01, volatility: 0.65, unit: 'USD',
    forecastScale: 0.12, stabilityMax: 0.045, optionsStyle: 'weekly',
  },
  {
    key: 'TSLA', ticker: 'TSLA', name: 'Tesla, Inc.', type: 'STOCKS',
    defaultPrice: 185.00, decimals: 2, spread: 0.03, volatility: 1.55, unit: 'USD',
    forecastScale: 0.20, stabilityMax: 0.085, optionsStyle: 'weekly',
  },
  {
    key: 'NVDA', ticker: 'NVDA', name: 'NVIDIA Corporation', type: 'STOCKS',
    defaultPrice: 130.50, decimals: 2, spread: 0.02, volatility: 1.45, unit: 'USD',
    forecastScale: 0.18, stabilityMax: 0.075, optionsStyle: 'weekly',
  },
  {
    key: 'AAPL', ticker: 'AAPL', name: 'Apple Inc.', type: 'STOCKS',
    defaultPrice: 210.00, decimals: 2, spread: 0.02, volatility: 1.05, unit: 'USD',
    forecastScale: 0.14, stabilityMax: 0.055, optionsStyle: 'weekly',
  },
  {
    key: 'AMD', ticker: 'AMD', name: 'Advanced Micro Devices', type: 'STOCKS',
    defaultPrice: 160.00, decimals: 2, spread: 0.02, volatility: 1.50, unit: 'USD',
    forecastScale: 0.19, stabilityMax: 0.080, optionsStyle: 'weekly',
  },
  {
    key: 'AMZN', ticker: 'AMZN', name: 'Amazon.com, Inc.', type: 'STOCKS',
    defaultPrice: 185.00, decimals: 2, spread: 0.02, volatility: 1.20, unit: 'USD',
    forecastScale: 0.15, stabilityMax: 0.060, optionsStyle: 'weekly',
  },
  {
    key: 'META', ticker: 'META', name: 'Meta Platforms, Inc.', type: 'STOCKS',
    defaultPrice: 505.00, decimals: 2, spread: 0.04, volatility: 1.30, unit: 'USD',
    forecastScale: 0.16, stabilityMax: 0.065, optionsStyle: 'weekly',
  },
  {
    key: 'MSFT', ticker: 'MSFT', name: 'Microsoft Corporation', type: 'STOCKS',
    defaultPrice: 448.00, decimals: 2, spread: 0.03, volatility: 1.00, unit: 'USD',
    forecastScale: 0.13, stabilityMax: 0.050, optionsStyle: 'weekly',
  },
  {
    key: 'GOOGL', ticker: 'GOOGL', name: 'Alphabet Inc.', type: 'STOCKS',
    defaultPrice: 175.00, decimals: 2, spread: 0.02, volatility: 1.10, unit: 'USD',
    forecastScale: 0.14, stabilityMax: 0.055, optionsStyle: 'weekly',
  },
  {
    key: 'NFLX', ticker: 'NFLX', name: 'Netflix, Inc.', type: 'STOCKS',
    defaultPrice: 680.00, decimals: 2, spread: 0.06, volatility: 1.25, unit: 'USD',
    forecastScale: 0.16, stabilityMax: 0.065, optionsStyle: 'weekly',
  },
  {
    key: 'AVGO', ticker: 'AVGO', name: 'Broadcom Inc.', type: 'STOCKS',
    defaultPrice: 1605.00, decimals: 2, spread: 0.03, volatility: 1.30, unit: 'USD',
    forecastScale: 0.16, stabilityMax: 0.065, optionsStyle: 'weekly',
  },
  {
    key: 'PLTR', ticker: 'PLTR', name: 'Palantir Technologies', type: 'STOCKS',
    defaultPrice: 24.00, decimals: 2, spread: 0.02, volatility: 1.85, unit: 'USD',
    forecastScale: 0.22, stabilityMax: 0.095, optionsStyle: 'weekly',
  },
  {
    key: 'MSTR', ticker: 'MSTR', name: 'MicroStrategy Inc.', type: 'STOCKS',
    defaultPrice: 1515.00, decimals: 2, spread: 0.05, volatility: 2.10, unit: 'USD',
    forecastScale: 0.24, stabilityMax: 0.110, optionsStyle: 'weekly',
  },
  {
    key: 'COIN', ticker: 'COIN', name: 'Coinbase Global, Inc.', type: 'STOCKS',
    defaultPrice: 220.00, decimals: 2, spread: 0.04, volatility: 1.95, unit: 'USD',
    forecastScale: 0.23, stabilityMax: 0.100, optionsStyle: 'weekly',
  },
  {
    key: 'SMCI', ticker: 'SMCI', name: 'Super Micro Computer', type: 'STOCKS',
    defaultPrice: 855.00, decimals: 2, spread: 0.02, volatility: 2.00, unit: 'USD',
    forecastScale: 0.24, stabilityMax: 0.105, optionsStyle: 'weekly',
  },
  {
    key: 'GME', ticker: 'GME', name: 'GameStop Corp.', type: 'STOCKS',
    defaultPrice: 28.00, decimals: 2, spread: 0.02, volatility: 2.50, unit: 'USD',
    forecastScale: 0.35, stabilityMax: 0.150, optionsStyle: 'weekly',
  },
  {
    key: 'AMC', ticker: 'AMC', name: 'AMC Entertainment Holdings', type: 'STOCKS',
    defaultPrice: 5.00, decimals: 2, spread: 0.01, volatility: 2.20, unit: 'USD',
    forecastScale: 0.30, stabilityMax: 0.120, optionsStyle: 'weekly',
  },
  {
    key: 'BAC', ticker: 'BAC', name: 'Bank of America Corp', type: 'STOCKS',
    defaultPrice: 40.00, decimals: 2, spread: 0.01, volatility: 0.85, unit: 'USD',
    forecastScale: 0.12, stabilityMax: 0.040, optionsStyle: 'weekly',
  },
  {
    key: 'JPM', ticker: 'JPM', name: 'JPMorgan Chase & Co.', type: 'STOCKS',
    defaultPrice: 198.00, decimals: 2, spread: 0.02, volatility: 0.80, unit: 'USD',
    forecastScale: 0.11, stabilityMax: 0.035, optionsStyle: 'weekly',
  },
  {
    key: 'V', ticker: 'V', name: 'Visa Inc.', type: 'STOCKS',
    defaultPrice: 275.00, decimals: 2, spread: 0.02, volatility: 0.75, unit: 'USD',
    forecastScale: 0.10, stabilityMax: 0.035, optionsStyle: 'weekly',
  },
  {
    key: 'BA', ticker: 'BA', name: 'Boeing Co.', type: 'STOCKS',
    defaultPrice: 180.00, decimals: 2, spread: 0.02, volatility: 1.10, unit: 'USD',
    forecastScale: 0.15, stabilityMax: 0.055, optionsStyle: 'weekly',
  },
  {
    key: 'DIS', ticker: 'DIS', name: 'Walt Disney Co.', type: 'STOCKS',
    defaultPrice: 105.00, decimals: 2, spread: 0.02, volatility: 1.05, unit: 'USD',
    forecastScale: 0.14, stabilityMax: 0.050, optionsStyle: 'weekly',
  },
  {
    key: 'WMT', ticker: 'WMT', name: 'Walmart Inc.', type: 'STOCKS',
    defaultPrice: 65.00, decimals: 2, spread: 0.01, volatility: 0.70, unit: 'USD',
    forecastScale: 0.10, stabilityMax: 0.035, optionsStyle: 'weekly',
  },
  {
    key: 'XOM', ticker: 'XOM', name: 'Exxon Mobil Corp.', type: 'STOCKS',
    defaultPrice: 115.00, decimals: 2, spread: 0.02, volatility: 0.85, unit: 'USD',
    forecastScale: 0.12, stabilityMax: 0.040, optionsStyle: 'weekly',
  },
  {
    key: 'CRWD', ticker: 'CRWD', name: 'CrowdStrike Holdings', type: 'STOCKS',
    defaultPrice: 380.00, decimals: 2, spread: 0.04, volatility: 1.50, unit: 'USD',
    forecastScale: 0.18, stabilityMax: 0.080, optionsStyle: 'weekly',
  },
  {
    key: 'PANW', ticker: 'PANW', name: 'Palo Alto Networks', type: 'STOCKS',
    defaultPrice: 320.00, decimals: 2, spread: 0.03, volatility: 1.40, unit: 'USD',
    forecastScale: 0.17, stabilityMax: 0.075, optionsStyle: 'weekly',
  },
  {
    key: 'SNOW', ticker: 'SNOW', name: 'Snowflake Inc.', type: 'STOCKS',
    defaultPrice: 140.00, decimals: 2, spread: 0.03, volatility: 1.60, unit: 'USD',
    forecastScale: 0.19, stabilityMax: 0.085, optionsStyle: 'weekly',
  },
  {
    key: 'RIVN', ticker: 'RIVN', name: 'Rivian Automotive', type: 'STOCKS',
    defaultPrice: 12.00, decimals: 2, spread: 0.01, volatility: 2.10, unit: 'USD',
    forecastScale: 0.25, stabilityMax: 0.110, optionsStyle: 'weekly',
  },
  {
    key: 'HOOD', ticker: 'HOOD', name: 'Robinhood Markets', type: 'STOCKS',
    defaultPrice: 22.00, decimals: 2, spread: 0.01, volatility: 1.70, unit: 'USD',
    forecastScale: 0.18, stabilityMax: 0.085, optionsStyle: 'weekly',
  },
  {
    key: 'INTC', ticker: 'INTC', name: 'Intel Corporation', type: 'STOCKS',
    defaultPrice: 32.00, decimals: 2, spread: 0.01, volatility: 1.10, unit: 'USD',
    forecastScale: 0.15, stabilityMax: 0.055, optionsStyle: 'weekly',
  },
  {
    key: 'MU', ticker: 'MU', name: 'Micron Technology', type: 'STOCKS',
    defaultPrice: 135.00, decimals: 2, spread: 0.03, volatility: 1.50, unit: 'USD',
    forecastScale: 0.18, stabilityMax: 0.080, optionsStyle: 'weekly',
  },
  {
    key: 'QCOM', ticker: 'QCOM', name: 'QUALCOMM Inc.', type: 'STOCKS',
    defaultPrice: 210.00, decimals: 2, spread: 0.03, volatility: 1.35, unit: 'USD',
    forecastScale: 0.16, stabilityMax: 0.070, optionsStyle: 'weekly',
  },
  {
    key: 'ARM', ticker: 'ARM', name: 'Arm Holdings', type: 'STOCKS',
    defaultPrice: 160.00, decimals: 2, spread: 0.03, volatility: 1.65, unit: 'USD',
    forecastScale: 0.20, stabilityMax: 0.085, optionsStyle: 'weekly',
  },
  {
    key: 'UBER', ticker: 'UBER', name: 'Uber Technologies', type: 'STOCKS',
    defaultPrice: 70.00, decimals: 2, spread: 0.02, volatility: 1.25, unit: 'USD',
    forecastScale: 0.15, stabilityMax: 0.060, optionsStyle: 'weekly',
  },
  {
    key: 'PYPL', ticker: 'PYPL', name: 'PayPal Holdings', type: 'STOCKS',
    defaultPrice: 62.00, decimals: 2, spread: 0.02, volatility: 1.20, unit: 'USD',
    forecastScale: 0.15, stabilityMax: 0.060, optionsStyle: 'weekly',
  },
  {
    key: 'SQ', ticker: 'SQ', name: 'Block, Inc.', type: 'STOCKS',
    defaultPrice: 65.00, decimals: 2, spread: 0.02, volatility: 1.60, unit: 'USD',
    forecastScale: 0.19, stabilityMax: 0.080, optionsStyle: 'weekly',
  },
  {
    key: 'SHOP', ticker: 'SHOP', name: 'Shopify Inc.', type: 'STOCKS',
    defaultPrice: 68.00, decimals: 2, spread: 0.02, volatility: 1.55, unit: 'USD',
    forecastScale: 0.18, stabilityMax: 0.075, optionsStyle: 'weekly',
  },
  {
    key: 'CRM', ticker: 'CRM', name: 'Salesforce, Inc.', type: 'STOCKS',
    defaultPrice: 240.00, decimals: 2, spread: 0.03, volatility: 1.15, unit: 'USD',
    forecastScale: 0.14, stabilityMax: 0.055, optionsStyle: 'weekly',
  },
  {
    key: 'NOW', ticker: 'NOW', name: 'ServiceNow, Inc.', type: 'STOCKS',
    defaultPrice: 780.00, decimals: 2, spread: 0.08, volatility: 1.25, unit: 'USD',
    forecastScale: 0.15, stabilityMax: 0.065, optionsStyle: 'weekly',
  },
  {
    key: 'LLY', ticker: 'LLY', name: 'Eli Lilly and Company', type: 'STOCKS',
    defaultPrice: 885.00, decimals: 2, spread: 0.08, volatility: 1.10, unit: 'USD',
    forecastScale: 0.14, stabilityMax: 0.055, optionsStyle: 'weekly',
  },
  {
    key: 'NVO', ticker: 'NVO', name: 'Novo Nordisk', type: 'STOCKS',
    defaultPrice: 140.00, decimals: 2, spread: 0.02, volatility: 1.05, unit: 'USD',
    forecastScale: 0.13, stabilityMax: 0.050, optionsStyle: 'weekly',
  },
  {
    key: 'TSM', ticker: 'TSM', name: 'Taiwan Semiconductor', type: 'STOCKS',
    defaultPrice: 175.00, decimals: 2, spread: 0.02, volatility: 1.20, unit: 'USD',
    forecastScale: 0.15, stabilityMax: 0.065, optionsStyle: 'weekly',
  },
  {
    key: 'ASML', ticker: 'ASML', name: 'ASML Holding N.V.', type: 'STOCKS',
    defaultPrice: 950.00, decimals: 2, spread: 0.15, volatility: 1.35, unit: 'USD',
    forecastScale: 0.17, stabilityMax: 0.075, optionsStyle: 'weekly',
  },
  {
    key: 'UNH', ticker: 'UNH', name: 'UnitedHealth Group', type: 'STOCKS',
    defaultPrice: 500.00, decimals: 2, spread: 0.05, volatility: 0.85, unit: 'USD',
    forecastScale: 0.11, stabilityMax: 0.040, optionsStyle: 'weekly',
  },
  {
    key: 'XLF', ticker: 'XLF', name: 'Financial Select Sector SPDR', type: 'ETFS',
    defaultPrice: 40.00, decimals: 2, spread: 0.01, volatility: 0.65, unit: 'USD',
    forecastScale: 0.10, stabilityMax: 0.035, optionsStyle: 'weekly',
  },
  {
    key: 'XLK', ticker: 'XLK', name: 'Technology Select Sector SPDR', type: 'ETFS',
    defaultPrice: 220.00, decimals: 2, spread: 0.02, volatility: 0.95, unit: 'USD',
    forecastScale: 0.13, stabilityMax: 0.050, optionsStyle: 'weekly',
  },
  {
    key: 'XLE', ticker: 'XLE', name: 'Energy Select Sector SPDR', type: 'ETFS',
    defaultPrice: 90.00, decimals: 2, spread: 0.02, volatility: 0.85, unit: 'USD',
    forecastScale: 0.12, stabilityMax: 0.045, optionsStyle: 'weekly',
  },
  {
    key: 'JNJ', ticker: 'JNJ', name: 'Johnson & Johnson', type: 'STOCKS',
    defaultPrice: 150.00, decimals: 2, spread: 0.02, volatility: 0.65, unit: 'USD',
    forecastScale: 0.10, stabilityMax: 0.035, optionsStyle: 'weekly',
  },
  {
    key: 'MCD', ticker: 'MCD', name: 'McDonald\'s Corp.', type: 'STOCKS',
    defaultPrice: 260.00, decimals: 2, spread: 0.03, volatility: 0.70, unit: 'USD',
    forecastScale: 0.10, stabilityMax: 0.040, optionsStyle: 'weekly',
  },
  {
    key: 'HD', ticker: 'HD', name: 'Home Depot, Inc.', type: 'STOCKS',
    defaultPrice: 340.00, decimals: 2, spread: 0.04, volatility: 0.85, unit: 'USD',
    forecastScale: 0.11, stabilityMax: 0.040, optionsStyle: 'weekly',
  },
  {
    key: 'COST', ticker: 'COST', name: 'Costco Wholesale', type: 'STOCKS',
    defaultPrice: 850.00, decimals: 2, spread: 0.10, volatility: 0.90, unit: 'USD',
    forecastScale: 0.12, stabilityMax: 0.045, optionsStyle: 'weekly',
  },
  {
    key: 'WFC', ticker: 'WFC', name: 'Wells Fargo & Co.', type: 'STOCKS',
    defaultPrice: 60.00, decimals: 2, spread: 0.01, volatility: 0.85, unit: 'USD',
    forecastScale: 0.12, stabilityMax: 0.040, optionsStyle: 'weekly',
  },
  {
    key: 'BRK.B', ticker: 'BRK.B', name: 'Berkshire Hathaway Inc.', type: 'STOCKS',
    defaultPrice: 410.00, decimals: 2, spread: 0.04, volatility: 0.65, unit: 'USD',
    forecastScale: 0.09, stabilityMax: 0.035, optionsStyle: 'weekly',
  }
];

/**
 * Front-weekly days-to-expiry — calendar days until the upcoming Friday (0 on
 * Friday itself). Single-stock options have no daily expirations, so their
 * nearest contract is this front weekly.
 */
export function frontWeeklyDteDays(now: Date = new Date()): number {
  return (5 - now.getDay() + 7) % 7; // getDay: 0=Sun..6=Sat; Friday = 5
}

/**
 * Hours remaining until the 16:00 ET cash-equity close. Outside regular trading
 * hours returns a full session (6.5h), so overnight pricing assumes the next
 * session ahead. ET-timezone aware (handles DST via Intl).
 */
export function hoursToSessionClose(now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    let h = get('hour'); if (h === 24) h = 0;
    const nowSec = h * 3600 + get('minute') * 60 + get('second');
    const openSec = 9.5 * 3600, closeSec = 16 * 3600;
    if (nowSec >= closeSec || nowSec < openSec) return 6.5; // outside RTH → a full session ahead
    return Math.max(0, (closeSec - nowSec) / 3600);
  } catch {
    return 6.5;
  }
}

// Floor for time-to-expiry, ~52 min in calendar-day terms. Matches the Black-Scholes
// T floor (max(0.0001 yr) in v11Math) so greeks and expected-move stay finite at the
// bell instead of exploding as T → 0.
const MIN_TTE_DAYS = 0.0365;

/**
 * Time-to-expiry in FRACTIONAL calendar days for the nearest contract — the value
 * pricing, greeks, GEX and expected-move all annualize as T = dteDays / 365.
 *
 * Daily/index names ("0DTE", e.g. SPX/NDX) expire at today's 16:00 close; weekly
 * single-stock names expire at the front-Friday close. The horizon now decays through
 * the session via the intraday clock: an SPX 0DTE is ~0.27d at the open and floors
 * near the bell. Previously this returned a flat 1 calendar day all day, which —
 * because premium/vega ∝ √T and gamma/theta ∝ 1/√T — overstated premiums/vega and
 * understated gamma/theta/charm by up to ~25× into the close, and made the headline
 * expected move disagree with the 0DTE session band.
 */
export function optionDteDays(asset: AssetInfo, now: Date = new Date()): number {
  const wholeDays = asset.optionsStyle === 'weekly' ? frontWeeklyDteDays(now) : 0;
  const tte = wholeDays + hoursToSessionClose(now) / 24;
  return Math.max(MIN_TTE_DAYS, tte);
}

/** Human label for a ticker's nearest expiry: '0DTE' for daily names, '{n}DTE' for the front weekly. */
export function optionExpiryLabel(asset: AssetInfo): string {
  if (asset.optionsStyle === 'weekly') {
    const d = frontWeeklyDteDays();
    return d <= 0 ? '0DTE' : `${d}DTE`;
  }
  return '0DTE';
}

/** Short calendar date of a ticker's nearest expiry (e.g. 'Jun 30') — today for 0DTE
 *  daily names, the upcoming Friday for front-weekly single stocks. Model-feed date;
 *  a live provider supplies the true listed expiry. */
export function optionExpiryDate(asset: AssetInfo, now: Date = new Date()): string {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(now);
  if (asset.optionsStyle === 'weekly') d.setDate(d.getDate() + frontWeeklyDteDays(now));
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}

/**
 * MODEL multi-expiry gamma slices — derive a small expiry ladder (front + the next few weeklies/
 * monthly) from a single front-expiry strike grid so the matrix can show a multi-expiry heatmap on the
 * model/sandbox feed (no provider). Near-term gamma is the most concentrated, so per-strike γ decays
 * with DTE. This is MODEL data (used only when the chain is NOT live); a real provider supplies true
 * per-expiry chains via the opt-in fetch. Kept deterministic (no Math.random).
 */
// Per-slice decay applied when SYNTHESIZING the multi-expiry matrix from the front chain (used only
// when the live multi-expiry fetch is off). The four slices are front · +1w · +2w · ~1mo: gamma
// concentrates near-term and volume/OI thins out further-dated, so each successive slice scales by
// these factors. Named so the model's assumptions are auditable, not buried as inline literals.
const GEX_EXPIRY_DECAY = [1, 0.64, 0.44, 0.31];      // net/call/put gamma per slice
const OI_VOL_EXPIRY_DECAY = [1, 0.55, 0.34, 0.22];   // volume/OI per slice

export function synthesizeExpirySlices(
  strikes: { strike: number; netGex: number; callGex?: number; putGex?: number; vol?: number }[],
  asset: AssetInfo,
  now: Date = new Date(),
): GexExpirySlice[] {
  if (!strikes.length) return [];
  const d0 = asset.optionsStyle === 'weekly' ? frontWeeklyDteDays(now) : 0;
  const offsets = [d0, d0 + 7, d0 + 14, d0 + 28];   // front · +1w · +2w · ~1mo
  const factors = GEX_EXPIRY_DECAY;
  const vfac = OI_VOL_EXPIRY_DECAY;
  const iso = (dte: number) => { const d = new Date(now); d.setDate(d.getDate() + dte); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  return offsets.map((dte, k) => {
    const f = factors[k], vf = vfac[k];
    const sl = strikes.map(s => ({ strike: s.strike, netGex: (s.netGex || 0) * f, callGex: (s.callGex || 0) * f, putGex: (s.putGex || 0) * f, vol: Math.round((s.vol || 0) * vf) }));
    let netGex = 0, callWall: number | undefined, putWall: number | undefined, mx = 0, mn = 0;
    for (const s of sl) { netGex += s.netGex; if (s.netGex > mx) { mx = s.netGex; callWall = s.strike; } if (s.netGex < mn) { mn = s.netGex; putWall = s.strike; } }
    return { expiration: iso(dte), dte, netGex, callWall, putWall, strikes: sl };
  });
}

export const TIMEFRAMES: { val: TimeframeVal; label: string; minMultiplier: number }[] = [
  { val: '1m', label: '1 Minute', minMultiplier: 1 },
  { val: '2m', label: '2 Minutes', minMultiplier: 2 },
  { val: '3m', label: '3 Minutes', minMultiplier: 3 },
  { val: '5m', label: '5 Minutes', minMultiplier: 5 },
  { val: '15m', label: '15 Minutes', minMultiplier: 15 },
  { val: '30m', label: '30 Minutes', minMultiplier: 30 },
  { val: '1h', label: '1 Hour', minMultiplier: 60 },
  { val: '4h', label: '4 Hours', minMultiplier: 240 },
  { val: '1D', label: 'Daily', minMultiplier: 1440 },
  { val: '1W', label: 'Weekly', minMultiplier: 10080 },
];

/**
 * Generates initial candlesticks and simulates institutional trading conditions
 */
export function generateInitialCandles(asset: AssetInfo, timeframe: TimeframeVal, count = 46): Candle[] {
  const candles: Candle[] = [];
  const basePrice = asset.defaultPrice;
  const vol = asset.volatility;
  
  // Set timeframe scale factors
  let tfScale = 1;
  let minMultiplier = 15;
  const tfObj = TIMEFRAMES.find(t => t.val === timeframe);
  if (tfObj) {
    tfScale = Math.sqrt(tfObj.minMultiplier) * 0.15 + 0.85;
    minMultiplier = tfObj.minMultiplier;
  }

  // Deterministic per-(asset, timeframe) seed so each ticker AND each timeframe is an
  // INDEPENDENT, reproducible series — not the same shape merely re-spaced in time (which
  // is what made switching 1m/5m/15m look fake). A seeded PRNG (mulberry32) replaces the
  // bare Math.random() below, so the sequence is stable across reloads and genuinely
  // differs per timeframe. (When a data provider is configured these synthetic bars are
  // overwritten with real per-timeframe OHLC.)
  const assetSeed = asset.ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const tfSeed = (((assetSeed * 2654435761) >>> 0) ^ (minMultiplier * 40503)) >>> 0;
  let _s = tfSeed || 1;
  const rnd = () => { _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // Displacement structure + drift vary per (asset, timeframe) so charts aren't clones.
  const dispBar1 = 8 + (tfSeed % 9);
  const dispBar2 = dispBar1 + 7 + ((tfSeed >> 4) % 6);
  const dispBar3 = dispBar2 + 6 + ((tfSeed >> 8) % 5);
  const dispBar2Bearish = ((tfSeed >> 2) & 1) === 0;
  const trendBias = (((tfSeed >> 5) % 3) - 1) * 0.03 * vol; // some TFs drift up, some down, some flat

  let currentPrice = basePrice * (1 - vol * 0.015); // Start slightly lower to build a trend pattern
  let accumulatedVolPrice = 0;
  let accumulatedVol = 0;
  
  const startTime = Date.now() - count * minMultiplier * 60000;

  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * minMultiplier * 60000;
    
    // Create random-walk price bars, but add institutional expansion pockets
    let isHeavyDisplacement = false;
    let displacementDir: 'bullish' | 'bearish' | null = null;
    let biasFactor = 0.05; // general bullish bias for neat look
    
    // Inject institutional displacement on per-asset bars. Derived deterministically
    // from the ticker so each chart's structure (FVGs, sweeps) differs but stays
    // reproducible — otherwise every asset is a structural clone (same bars 15/28/38).
    if (i === dispBar1 || i === dispBar2 || i === dispBar3) {
      isHeavyDisplacement = true;
      const isDown = i === dispBar2 ? dispBar2Bearish : (i === dispBar3 && !dispBar2Bearish);
      displacementDir = isDown ? 'bearish' : 'bullish';
      biasFactor = isDown ? -2.2 * vol : 2.5 * vol;
    } else if (i > dispBar1 && i < dispBar1 + 6) {
      // gentle pullbacks after the first displacement
      biasFactor = -0.3 * vol;
    } else if (i > dispBar2 && i < dispBar2 + 4) {
      // momentum continuation after the second displacement
      biasFactor = -0.6 * vol;
    } else {
      biasFactor = (rnd() - 0.46) * 0.5 * vol + trendBias;
    }

    const priceChange = basePrice * (biasFactor / 100) * tfScale;
    const open = currentPrice;
    const close = currentPrice + priceChange;
    
    let high = Math.max(open, close) + (rnd() * 0.08 * vol * basePrice) / 100;
    let low = Math.min(open, close) - (rnd() * 0.08 * vol * basePrice) / 100;
    
    // Stretch candle body for institutional displacement
    if (isHeavyDisplacement) {
      if (displacementDir === 'bullish') {
        high = close + (rnd() * 0.01 * basePrice) / 100;
        low = open - (rnd() * 0.005 * basePrice) / 100;
      } else {
        high = open + (rnd() * 0.005 * basePrice) / 100;
        low = close - (rnd() * 0.01 * basePrice) / 100;
      }
    }

    const absBody = Math.abs(close - open);
    const range = high - low;

    // Relative volume expands during institutional activity
    const baseVolume = 100000 * (asset.decimals === 5 ? 0.01 : 1);
    let volume = Math.floor(baseVolume * (0.5 + rnd() * 1.5));
    if (isHeavyDisplacement) {
      volume = Math.floor(baseVolume * (3.5 + rnd() * 2));
    } else if (Math.abs(priceChange) > (basePrice * vol * 0.003)) {
      volume = Math.floor(baseVolume * (1.8 + rnd() * 1.2));
    }

    currentPrice = close;

    // VWAP calculation
    const typicalPrice = (high + low + close) / 3;
    accumulatedVolPrice += typicalPrice * volume;
    accumulatedVol += volume;
    const vwap = accumulatedVolPrice / accumulatedVol;

    // Create Candle Structure
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      vwap,
      isDisplacement: isHeavyDisplacement,
      displacementType: displacementDir,
      relativeVolume: Number((volume / baseVolume).toFixed(2))
    });
  }

  // Calculate dynamic momentum and secondary filters on the set
  return candles;
}

/**
 * Calculates Fair Value Gaps on the current set of candles.
 */
export function calculateFVGs(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  
  // Need at least 3 candles to establish a gap (i-2, i-1, i)
  for (let i = 2; i < candles.length; i++) {
    const cPrevPrev = candles[i - 2];
    const cMiddle = candles[i - 1];
    const cCurr = candles[i];
    
    // Bullish FVG check
    // Low of current candle [i] is above High of previous-previous candle [i-2]
    if (cCurr.low > cPrevPrev.high) {
      // Body of middle candle must be substantially large to denote genuine institutional imbalance
      const cMiddleBody = Math.abs(cMiddle.close - cMiddle.open);
      const cMiddleTotal = cMiddle.high - cMiddle.low;
      
      if (cMiddleBody > 0.4 * cMiddleTotal || cMiddle.isDisplacement) {
        const top = cCurr.low;
        const bottom = cPrevPrev.high;
        const eq = bottom + (top - bottom) / 2;
        
        fvgs.push({
          id: `fvg-bull-${i}`,
          type: 'bullish',
          top,
          bottom,
          equilibrium: eq,
          state: 'ARMED',
          createdAtIdx: i
        });
      }
    }
    
    // Bearish FVG check
    // High of current candle [i] is below Low of previous-previous candle [i-2]
    if (cCurr.high < cPrevPrev.low) {
      const cMiddleBody = Math.abs(cMiddle.close - cMiddle.open);
      const cMiddleTotal = cMiddle.high - cMiddle.low;
      
      if (cMiddleBody > 0.4 * cMiddleTotal || cMiddle.isDisplacement) {
        const top = cPrevPrev.low;
        const bottom = cCurr.high;
        const eq = bottom + (top - bottom) / 2;
        
        fvgs.push({
          id: `fvg-bear-${i}`,
          type: 'bearish',
          top,
          bottom,
          equilibrium: eq,
          state: 'ARMED',
          createdAtIdx: i
        });
      }
    }
  }

  // Simulate states and updates on those FVGs as price continues to interact:
  // TESTED: when price moves back inside the gap
  // HELD: when price touches the gap (but doesn't cross the equilibrium or bottom of bullish gap / top of bearish gap) and bounces
  // INVALIDATED: when price closes fully below the bullish gap / above the bearish gap
  // COMPLETED: when price fills the entire gap
  fvgs.forEach(fvg => {
    let touched = false;
    let closedPastEq = false;
    let fullyBroken = false;
    
    // Look at candles after the creation index
    for (let j = fvg.createdAtIdx + 1; j < candles.length; j++) {
      const candle = candles[j];
      
      if (fvg.type === 'bullish') {
        // Did price enter the gap?
        if (candle.low <= fvg.top && candle.high >= fvg.bottom) {
          touched = true;
          fvg.testedAtIdx = j;
          
          if (candle.low < fvg.equilibrium) {
            closedPastEq = true;
          }
          
          // Close below bottom of bullish FVG is invalidation
          if (candle.close < fvg.bottom) {
            fullyBroken = true;
            fvg.invalidatedAtIdx = j;
            break;
          }
        }
      } else {
        // Bearish
        // Did price enter the gap?
        if (candle.high >= fvg.bottom && candle.low <= fvg.top) {
          touched = true;
          fvg.testedAtIdx = j;
          
          if (candle.high > fvg.equilibrium) {
            closedPastEq = true;
          }
          
          // Close above top of bearish FVG is invalidation
          if (candle.close > fvg.top) {
            fullyBroken = true;
            fvg.invalidatedAtIdx = j;
            break;
          }
        }
      }
    }

    if (fullyBroken) {
      fvg.state = 'INVALIDATED';
    } else if (touched) {
      if (closedPastEq) {
        fvg.state = 'TESTED';
      } else {
        fvg.state = 'HELD';
      }
    } else {
      fvg.state = 'ARMED';
    }
  });

  return fvgs;
}

/**
 * Calculates liquidity sweeps
 */
export function calculateLiquidityEvents(candles: Candle[]): LiquidityEvent[] {
  const events: LiquidityEvent[] = [];
  
  for (let i = 2; i < candles.length; i++) {
    const prevCandles = candles.slice(Math.max(0, i - 12), i);
    const highs = prevCandles.map(c => c.high);
    const lows = prevCandles.map(c => c.low);
    const localMax = Math.max(...highs);
    const localMin = Math.min(...lows);

    const curr = candles[i];

    // Liquidity Sweep High: price took out the prior 12-bar high then closed back below it
    // (a genuine stop-hunt + rejection — detected from the candle, never a probabilistic guess).
    if (curr.high >= localMax && curr.close < localMax) {
      events.push({
        id: `liq-swp-h-${i}`,
        label: 'Liquidity Sweep High',
        price: curr.high,
        candleIdx: i,
        type: 'bearish'
      });
    }

    // Liquidity Sweep Low: price took out the prior 12-bar low then closed back above it.
    if (curr.low <= localMin && curr.close > localMin) {
      events.push({
        id: `liq-swp-l-${i}`,
        label: 'Liquidity Sweep Low',
        price: curr.low,
        candleIdx: i,
        type: 'bullish'
      });
    }
  }
  
  return events;
}

/**
 * Calculates EMA for a given length
 */
export function calculateEMA(candles: Candle[], length: number): number[] {
  const emas: number[] = [];
  if (candles.length === 0) return emas;
  
  const k = 2 / (length + 1);
  let ema = candles[0].close;
  emas.push(ema);
  
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

/**
 * SAMPLE / ILLUSTRATIVE discovery tiles.
 *
 * These are NOT a live options scan. They are static demo rows used to seed the
 * Trade Finder layout so it has something to render before/without a connected
 * options feed. The `health`, `expectedMove`, greeks, prices and narratives here
 * are illustrative placeholders, not real market readings — the UI labels this
 * section "SAMPLE DATA" and must not present these numbers as live. The server's
 * discovery SSE only jitters these same seeds; it does not read the live chain,
 * so any "live" framing on top of this would be fiction.
 *
 * Narratives are intentionally generic. Do NOT add fabricated specifics here
 * (named dollar whale prints, exact "$XX.XM notional", "perfectly positioned",
 * precise win/accuracy figures) — those read as real market events and they are
 * not sourced from anything.
 */
export const INITIAL_DISCOVERY_CONTRACTS = [
  // SHELF: CONVICTION
  {
    id: 'spx-7620-c',
    ticker: 'SPX',
    strike: 7620,
    isCall: true,
    health: 96,
    expectedMove: '+42.5%',
    action: 'ENTER' as const,
    narrative: 'Sample tile: illustrates a call sitting above dealer support. Not a live reading.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.54,
    gamma: 0.024,
    vega: 0.14,
    theta: -0.81,
    volume: 14205,
    price: 5.40,
    bid: 5.35,
    ask: 5.45,
    t1: 7.20,
    p1: 33
  },
  {
    id: 'spy-515-c',
    ticker: 'SPY',
    strike: 515,
    isCall: true,
    health: 93,
    expectedMove: '+36.2%',
    action: 'ENTER' as const,
    narrative: 'Unusually clean volume profile confirms call momentum.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.48,
    gamma: 0.038,
    vega: 0.12,
    theta: -0.45,
    volume: 38201,
    price: 3.20,
    bid: 3.18,
    ask: 3.22,
    t1: 4.35,
    p1: 36
  },
  {
    id: 'qqq-448-c',
    ticker: 'QQQ',
    strike: 448,
    isCall: true,
    health: 91,
    expectedMove: '+29.0%',
    action: 'ENTER' as const,
    narrative: 'Dealer block purchases confirm near-term floor.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.52,
    gamma: 0.041,
    vega: 0.15,
    theta: -0.55,
    volume: 22401,
    price: 4.20,
    bid: 4.15,
    ask: 4.25,
    t1: 5.40,
    p1: 29
  },
  {
    id: 'ndx-18350-c',
    ticker: 'NDX',
    strike: 18350,
    isCall: true,
    health: 90,
    expectedMove: '+31.4%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in derivative order flow on Nasdaq nodes.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.49,
    gamma: 0.015,
    vega: 0.18,
    theta: -1.25,
    volume: 5204,
    price: 15.50,
    bid: 15.30,
    ask: 15.70,
    t1: 20.30,
    p1: 31
  },
  {
    id: 'spx-7600-c',
    ticker: 'SPX',
    strike: 7600,
    isCall: true,
    health: 95,
    expectedMove: '+39.1%',
    action: 'ENTER' as const,
    narrative: 'Below spot magnet concentration attracts structural institutional buyer hedging.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.62,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.92,
    volume: 18940,
    price: 11.20,
    bid: 11.10,
    ask: 11.30,
    t1: 15.60,
    p1: 39
  },
  {
    id: 'spy-510-c',
    ticker: 'SPY',
    strike: 510,
    isCall: true,
    health: 92,
    expectedMove: '+34.8%',
    action: 'ENTER' as const,
    narrative: 'Sample tile: illustrates a localized volume sweep pattern. Not a live reading.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.58,
    gamma: 0.035,
    vega: 0.13,
    theta: -0.48,
    volume: 45100,
    price: 5.10,
    bid: 5.05,
    ask: 5.15,
    t1: 6.85,
    p1: 34
  },
  // SHELF: IMPROVED / VELOCITY
  {
    id: 'ndx-18300-c',
    ticker: 'NDX',
    strike: 18300,
    isCall: true,
    health: 89,
    expectedMove: '+55.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid jump in scoring index over the last 15 minutes. High expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.58,
    gamma: 0.018,
    vega: 0.19,
    theta: -1.15,
    volume: 6310,
    price: 14.20,
    bid: 14.05,
    ask: 14.35,
    t1: 22.01,
    p1: 55
  },
  {
    id: 'qqq-446-c',
    ticker: 'QQQ',
    strike: 446,
    isCall: true,
    health: 88,
    expectedMove: '+32.4%',
    action: 'ENTER' as const,
    narrative: 'Dealer short blocks have dissolved, freeing up massive room overhead.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.54,
    gamma: 0.043,
    vega: 0.16,
    theta: -0.58,
    volume: 29402,
    price: 3.80,
    bid: 3.75,
    ask: 3.85,
    t1: 5.05,
    p1: 32
  },
  {
    id: 'spy-514-c',
    ticker: 'SPY',
    strike: 514,
    isCall: true,
    health: 87,
    expectedMove: '+28.5%',
    action: 'ENTER' as const,
    narrative: 'Score rating surges as dealers transition from negative gamma to neutral gamma.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.51,
    gamma: 0.039,
    vega: 0.12,
    theta: -0.46,
    volume: 18920,
    price: 2.80,
    bid: 2.77,
    ask: 2.83,
    t1: 3.60,
    p1: 28
  },
  {
    id: 'spx-7660-c',
    ticker: 'SPX',
    strike: 7660,
    isCall: true,
    health: 86,
    expectedMove: '+45.0%',
    action: 'ENTER' as const,
    narrative: 'Breakout momentum identified. Standard dispersion limit predicts vol expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.42,
    gamma: 0.019,
    vega: 0.14,
    theta: -0.84,
    volume: 9811,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 6.95,
    p1: 45
  },
  {
    id: 'qqq-450-c',
    ticker: 'QQQ',
    strike: 450,
    isCall: true,
    health: 85,
    expectedMove: '+26.8%',
    action: 'ENTER' as const,
    narrative: 'Derivative speed indices ticking straight up; fast buy feedback loop active.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.46,
    gamma: 0.040,
    vega: 0.17,
    theta: -0.61,
    volume: 15400,
    price: 2.65,
    bid: 2.61,
    ask: 2.69,
    t1: 3.35,
    p1: 26
  },
  {
    id: 'spx-7640-c',
    ticker: 'SPX',
    strike: 7640,
    isCall: true,
    health: 88,
    expectedMove: '+30.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in order flow profile matches strong buy trend.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.52,
    gamma: 0.022,
    vega: 0.13,
    theta: -0.85,
    volume: 12401,
    price: 6.80,
    bid: 6.70,
    ask: 6.90,
    t1: 8.85,
    p1: 30
  },
  // SHELF: MISPRICED / ARBITRAGE
  {
    id: 'spy-442-p',
    ticker: 'SPY',
    strike: 442,
    isCall: false,
    health: 85,
    expectedMove: '+24.1%',
    action: 'HOLD' as const,
    narrative: 'Valuation curve points to an extreme temporary discount on deep puts.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.12,
    gamma: 0.008,
    vega: 0.06,
    theta: -0.15,
    volume: 5310,
    price: 0.45,
    bid: 0.43,
    ask: 0.47,
    t1: 0.55,
    p1: 22
  },
  {
    id: 'spx-7650-c',
    ticker: 'SPX',
    strike: 7650,
    isCall: true,
    health: 83,
    expectedMove: '+18.5%',
    action: 'HOLD' as const,
    narrative: 'Priced exceptionally cheap relative to general spot move; heavy IV discount.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: 0.45,
    gamma: 0.020,
    vega: 0.14,
    theta: -0.83,
    volume: 8105,
    price: 5.10,
    bid: 5.00,
    ask: 5.20,
    t1: 6.05,
    p1: 18
  },
  {
    id: 'spy-508-p',
    ticker: 'SPY',
    strike: 508,
    isCall: false,
    health: 81,
    expectedMove: '+20.5%',
    action: 'HOLD' as const,
    narrative: 'Sample tile: illustrates a put trading below an illustrative model value.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.38,
    gamma: 0.025,
    vega: 0.11,
    theta: -0.32,
    volume: 12502,
    price: 1.35,
    bid: 1.32,
    ask: 1.38,
    t1: 1.62,
    p1: 20
  },
  {
    id: 'spx-7590-p',
    ticker: 'SPX',
    strike: 7590,
    isCall: false,
    health: 84,
    expectedMove: '+27.0%',
    action: 'ENTER' as const,
    narrative: 'Implied volatility suppression created a perfect risk-to-reward underpricing node.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.41,
    gamma: 0.018,
    vega: 0.13,
    theta: -0.75,
    volume: 7500,
    price: 12.80,
    bid: 12.60,
    ask: 13.00,
    t1: 16.25,
    p1: 27
  },
  {
    id: 'qqq-442-p',
    ticker: 'QQQ',
    strike: 442,
    isCall: false,
    health: 80,
    expectedMove: '+19.2%',
    action: 'HOLD' as const,
    narrative: 'Underpriced hedge option with high delta sensitivity relative to current spot.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.39,
    gamma: 0.034,
    vega: 0.14,
    theta: -0.42,
    volume: 16210,
    price: 2.15,
    bid: 2.12,
    ask: 2.18,
    t1: 2.56,
    p1: 19
  },
  {
    id: 'ndx-18200-p',
    ticker: 'NDX',
    strike: 18200,
    isCall: false,
    health: 82,
    expectedMove: '+22.4%',
    action: 'HOLD' as const,
    narrative: 'Sample tile: illustrates a model/market gap on a deep put. Not a live reading.',
    tagText: 'ARBITRAGE',
    shelf: 'mispriced',
    delta: -0.44,
    gamma: 0.014,
    vega: 0.18,
    theta: -1.10,
    volume: 3840,
    price: 42.10,
    bid: 41.50,
    ask: 42.70,
    t1: 51.50,
    p1: 22
  },
  // SHELF: INVALIDATION / BOUNDARIES
  {
    id: 'spx-7610-p',
    ticker: 'SPX',
    strike: 7610,
    isCall: false,
    health: 48,
    expectedMove: '-15.4%',
    action: 'REDUCE' as const,
    narrative: 'Slipped past main dealer GEX hedge floor. Tail risk exponentially flashing high.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.42,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.85,
    volume: 15401,
    price: 18.50,
    bid: 18.30,
    ask: 18.70,
    t1: 15.65,
    p1: -15
  },
  {
    id: 'spy-440-p',
    ticker: 'SPY',
    strike: 440,
    isCall: false,
    health: 51,
    expectedMove: '-10.2%',
    action: 'SELL' as const,
    narrative: 'Liquidity sweep void detected below current level. Immediate defensive alert.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.10,
    gamma: 0.005,
    vega: 0.05,
    theta: -0.12,
    volume: 24500,
    price: 0.35,
    bid: 0.33,
    ask: 0.37,
    t1: 0.31,
    p1: -10
  },
  {
    id: 'spx-7580-p',
    ticker: 'SPX',
    strike: 7580,
    isCall: false,
    health: 41,
    expectedMove: '-24.0%',
    action: 'SELL' as const,
    narrative: 'Extreme threshold crossover boundary triggers automatic institutional liquidation.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.32,
    gamma: 0.016,
    vega: 0.12,
    theta: -0.80,
    volume: 11040,
    price: 8.50,
    bid: 8.35,
    ask: 8.65,
    t1: 6.45,
    p1: -24
  },
  {
    id: 'spy-502-p',
    ticker: 'SPY',
    strike: 502,
    isCall: false,
    health: 45,
    expectedMove: '-18.5%',
    action: 'SELL' as const,
    narrative: 'Brushed beneath primary dealer put wall support. Hedging dynamics turned negative.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.28,
    gamma: 0.022,
    vega: 0.09,
    theta: -0.28,
    volume: 19105,
    price: 2.10,
    bid: 2.05,
    ask: 2.15,
    t1: 1.71,
    p1: -18
  },
  {
    id: 'qqq-438-p',
    ticker: 'QQQ',
    strike: 438,
    isCall: false,
    health: 49,
    expectedMove: '-14.0%',
    action: 'REDUCE' as const,
    narrative: 'Unwinds beneath crucial volume-weighted index pivot. Support levels dissolve.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.31,
    gamma: 0.028,
    vega: 0.12,
    theta: -0.38,
    volume: 14210,
    price: 3.15,
    bid: 3.10,
    ask: 3.20,
    t1: 2.70,
    p1: -14
  },
  {
    id: 'ndx-18100-p',
    ticker: 'NDX',
    strike: 18100,
    isCall: false,
    health: 38,
    expectedMove: '-32.5%',
    action: 'SELL' as const,
    narrative: 'System score degraded as gamma flip point triggers extreme margin sell hedging.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.36,
    gamma: 0.010,
    vega: 0.16,
    theta: -1.02,
    volume: 2901,
    price: 28.50,
    bid: 28.00,
    ask: 29.00,
    t1: 19.20,
    p1: -32
  },
  // SHELF: WHALE SWEEPS
  {
    id: 'spx-7700-c',
    ticker: 'SPX',
    strike: 7700,
    isCall: true,
    health: 94,
    expectedMove: '+62.4%',
    action: 'ENTER' as const,
    narrative: 'Sample tile: illustrates an out-of-the-money call sweep pattern. Not a live print.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.35,
    gamma: 0.018,
    vega: 0.15,
    theta: -0.78,
    volume: 62400,
    price: 2.45,
    bid: 2.40,
    ask: 2.50,
    t1: 3.98,
    p1: 62
  },
  {
    id: 'ndx-18500-c',
    ticker: 'NDX',
    strike: 18500,
    isCall: true,
    health: 91,
    expectedMove: '+75.0%',
    action: 'ENTER' as const,
    narrative: 'Massive out-of-the-money block trade cluster. Aggressive bullish volatility positioning.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.30,
    gamma: 0.010,
    vega: 0.17,
    theta: -1.08,
    volume: 11400,
    price: 8.90,
    bid: 8.70,
    ask: 9.10,
    t1: 15.55,
    p1: 75
  },
  {
    id: 'spy-520-c',
    ticker: 'SPY',
    strike: 520,
    isCall: true,
    health: 89,
    expectedMove: '+44.1%',
    action: 'ENTER' as const,
    narrative: 'Sample tile: illustrates repeated at-ask call buying. Not a live print.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.34,
    gamma: 0.031,
    vega: 0.11,
    theta: -0.40,
    volume: 92400,
    price: 1.15,
    bid: 1.12,
    ask: 1.18,
    t1: 1.65,
    p1: 44
  },
  {
    id: 'qqq-455-c',
    ticker: 'QQQ',
    strike: 455,
    isCall: true,
    health: 88,
    expectedMove: '+38.5%',
    action: 'ENTER' as const,
    narrative: 'Multimillion institutional block sweep targeting the upper resistance channel wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.32,
    gamma: 0.033,
    vega: 0.13,
    theta: -0.52,
    volume: 51200,
    price: 1.45,
    bid: 1.41,
    ask: 1.49,
    t1: 2.01,
    p1: 38
  },
  {
    id: 'spx-7500-p',
    ticker: 'SPX',
    strike: 7500,
    isCall: false,
    health: 85,
    expectedMove: '+52.0%',
    action: 'HOLD' as const,
    narrative: 'Sample tile: illustrates a protective put hedge pattern. Not a live print.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.19,
    gamma: 0.010,
    vega: 0.09,
    theta: -0.55,
    volume: 48900,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 7.30,
    p1: 52
  },
  {
    id: 'ndx-17800-p',
    ticker: 'NDX',
    strike: 17800,
    isCall: false,
    health: 83,
    expectedMove: '+48.5%',
    action: 'HOLD' as const,
    narrative: 'Significant tail protection sweep blocks are locking up hedge positions at put wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.15,
    gamma: 0.008,
    vega: 0.12,
    theta: -0.78,
    volume: 8520,
    price: 12.40,
    bid: 12.10,
    ask: 12.70,
    t1: 18.40,
    p1: 48
  }
];

/**
 * Builds the SAMPLE options-flow tape used to seed the Trade Finder feed before a
 * real options feed is connected. These are illustrative rows, NOT real prints —
 * the UI labels the feed as sample data. Timestamps are stamped relative to *now*
 * only so the seeded rows sort correctly next to any later ticks (the old
 * hard-coded 01:34:25 times clashed with the current-UTC tick stamps); they do
 * not indicate that a real trade occurred at that moment.
 */
export function buildInitialDiscoveryFeedLogs() {
  const now = Date.now();
  const rows = [
    { ticker: 'SPX', strike: 7620, type: 'C', side: 'Sweep', size: 280, prem: 151200, tag: 'BULLISH', action: 'SWEPT @ ASK' },
    { ticker: 'QQQ', strike: 448, type: 'C', side: 'Block', size: 1200, prem: 504000, tag: 'BULLISH', action: 'AT ASK' },
    { ticker: 'NDX', strike: 18350, type: 'C', side: 'Block', size: 150, prem: 232500, tag: 'BULLISH', action: 'ABOVE ASK' },
    { ticker: 'SPY', strike: 508, type: 'P', side: 'Sweep', size: 2500, prem: 337500, tag: 'BEARISH', action: 'SWEPT @ ASK' },
    { ticker: 'SPX', strike: 7700, type: 'C', side: 'Block', size: 3000, prem: 735000, tag: 'BULLISH', action: 'OFF-EXCHANGE' },
    { ticker: 'NDX', strike: 17800, type: 'P', side: 'Sweep', size: 400, prem: 496000, tag: 'HEDGE', action: 'SWEPT @ ASK' },
    { ticker: 'SPY', strike: 515, type: 'C', side: 'Sweep', size: 1800, prem: 576000, tag: 'BULLISH', action: 'SWEPT @ ASK' },
    { ticker: 'QQQ', strike: 455, type: 'C', side: 'Sweep', size: 2400, prem: 348000, tag: 'BULLISH', action: 'ABOVE ASK' },
  ];
  return rows.map((r, i) => {
    const d = new Date(now - (i * 14000 + Math.floor(Math.random() * 9000))); // ~14s apart, jittered
    const ts = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
    return {
      timestamp: ts, ticker: r.ticker, strike: r.strike, type: r.type, side: r.side,
      size: `${r.size.toLocaleString()} cons`,
      premium: `$${r.prem >= 1000000 ? (r.prem / 1000000).toFixed(2) + 'M' : r.prem.toLocaleString()}`,
      tag: r.tag, action: r.action,
    };
  });
}

export const INITIAL_DISCOVERY_FEED_LOGS = buildInitialDiscoveryFeedLogs();

