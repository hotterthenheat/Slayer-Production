/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ThetaData v3 market-data provider.
 *
 * Talks to the ThetaData v3 REST API — either the local Theta Terminal v3
 * (default http://127.0.0.1:25503/v3) or a direct/cloud base URL. On the Pro
 * tiers this yields REAL bulk greeks + open interest + quotes per expiration,
 * plus stock/index quotes and historical OHLC, so a single provider powers
 * GEX/dealer-flow AND chart history (no ETF proxy, no second vendor).
 *
 * Activation: set THETADATA_API_KEY (or THETADATA_ENABLED=true). The key is sent
 * as a Bearer header — required for the direct/cloud API and harmless for a local
 * Terminal that already holds the key in its own config. Override the endpoint
 * with THETADATA_BASE_URL if your Terminal/cloud host differs.
 *
 * Robustness: responses are parsed by COLUMN NAME (ThetaData returns a
 * self-describing { header:{format:[...]}, response:[[...]] } payload, or a plain
 * array of objects) so field-order/shape differences across v3 builds don't break
 * the mapping; greeks the feed omits are computed analytically.
 */
import { AssetInfo, TimeframeVal, Candle, GexExpirySlice } from '../types';
import { ASSET_LIST } from '../data';
import type { LiveOptionContract } from './marketDataProvider';
import { calculateAnalyticGreeks } from './v11Math';

const DEFAULT_BASE = 'http://127.0.0.1:25503/v3';
const INDEX_ROOTS = new Set(['SPX', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX']);

// ---------------------------------------------------------------------------
// In-memory TTL caches (mirror Tradier/Polygon's 6s pattern). The universe grew
// to 100+ tickers fetched on a round-robin; without caching every SSE-driven tick
// would re-issue the full spot + greeks + OI + quote chain per asset and blow the
// provider's rate limit. Spot is short-lived, the chain is heavier so it lives
// longer, and the front expiration never changes intraday (memoized per UTC day).
// ---------------------------------------------------------------------------
const SPOT_TTL_MS = 3000;
const CHAIN_TTL_MS = 12000;

interface CachedData<T> {
  data: T;
  timestamp: number;
}
const spotCache: Record<string, CachedData<number>> = {};
const chainCache: Record<string, CachedData<{ contracts: LiveOptionContract[]; source: string; message?: string }>> = {};
// frontExpiration: the nearest listed expiry never changes during the trading day,
// so cache the resolved YYYYMMDD per ticker keyed by the current UTC day. This turns
// 1 list-expirations request per asset per tick into 1 per asset per day.
const frontExpCache: Record<string, { utcDay: number; exp: number | null }> = {};

export function isThetaConfigured(): boolean {
  return !!process.env.THETADATA_API_KEY || process.env.THETADATA_ENABLED === 'true';
}

function baseUrl(): string {
  return (process.env.THETADATA_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

let loggedShapeOnce = false;

async function thetaFetch(path: string, params: Record<string, string | number>): Promise<any | null> {
  const entries: Record<string, string> = { format: 'json' };
  for (const [k, v] of Object.entries(params)) entries[k] = String(v);
  const url = `${baseUrl()}${path}?${new URLSearchParams(entries).toString()}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.THETADATA_API_KEY;
  if (key) headers['Authorization'] = `Bearer ${key}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`[ThetaData] HTTP ${res.status} ${path}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.warn(`[ThetaData] request failed ${path}: ${e?.message}`);
    return null;
  }
}

/**
 * Normalize a v3 payload into lower-cased row objects, handling both the columnar
 * { header:{format:[...]}, response:[[...]] } form and a plain array of objects.
 */
function rowsOf(payload: any): Record<string, any>[] {
  if (!payload) return [];
  const resp = payload.response ?? payload.data ?? payload;
  if (!Array.isArray(resp) || resp.length === 0) return [];

  const fmt: any = payload?.header?.format || payload?.format;
  if (Array.isArray(fmt) && Array.isArray(resp[0])) {
    const cols = fmt.map((c: string) => String(c).toLowerCase());
    return resp.map((row: any[]) => {
      const o: Record<string, any> = {};
      cols.forEach((c, i) => { o[c] = row[i]; });
      return o;
    });
  }
  if (typeof resp[0] === 'object' && !Array.isArray(resp[0])) {
    return resp.map((o: any) => {
      const l: Record<string, any> = {};
      for (const k in o) l[k.toLowerCase()] = o[k];
      return l;
    });
  }
  return [];
}

const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const pick = (o: Record<string, any>, ...keys: string[]): any => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

function thetaSymbol(ticker: string): string { return ticker.toUpperCase(); }
function isIndexRoot(ticker: string): boolean { return INDEX_ROOTS.has(ticker.toUpperCase()); }

// Strikes come back ×1000 ($170 -> 170000). Decode defensively (some builds may
// already return dollars, so only divide when the magnitude is clearly encoded).
function decodeStrike(raw: number | null, spot: number): number | null {
  if (raw == null) return null;
  if (raw > Math.max(50000, spot * 50)) return raw / 1000;
  return raw;
}

function ymd(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// Milliseconds to ADD to an ET wall-clock instant to obtain the UTC instant.
// ET is UTC-4 (EDT) or UTC-5 (EST), so the offset is +4h or +5h. Derived from the
// IANA tz database via Intl so DST transitions are handled correctly for the bar's
// own date rather than today's. `utcMidnight` is the UTC ms of the bar's calendar
// midnight (a stable reference point inside the trading day).
function etOffsetMs(utcMidnight: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', hour12: false,
    }).formatToParts(new Date(utcMidnight + 12 * 3600000)); // sample at local noon-ish to dodge edges
    let etHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12);
    if (etHour === 24) etHour = 0;
    // The reference instant is 12:00 UTC; ET shows etHour. Offset = (12 - etHour)h.
    const offsetHours = 12 - etHour;
    // Clamp to the only valid US-eastern offsets.
    return (offsetHours === 5 ? 5 : 4) * 3600000;
  } catch {
    return 4 * 3600000;
  }
}

// ---------------------------------------------------------------------------
// Spot price
// ---------------------------------------------------------------------------
export async function fetchThetaSpotPrice(ticker: string): Promise<number | null> {
  const sym = thetaSymbol(ticker);
  const now = Date.now();
  const cached = spotCache[sym];
  if (cached && now - cached.timestamp < SPOT_TTL_MS) return cached.data;

  const path = isIndexRoot(ticker) ? '/index/snapshot/quote' : '/stock/snapshot/quote';
  const rows = rowsOf(await thetaFetch(path, { symbol: sym }));
  if (!rows.length) return null;
  const r = rows[0];
  const bid = num(pick(r, 'bid'));
  const ask = num(pick(r, 'ask'));
  let price: number | null = null;
  if (bid && ask && bid > 0 && ask > 0) price = (bid + ask) / 2;
  else {
    const last = num(pick(r, 'last', 'price', 'close', 'value', 'mid', 'mark'));
    price = last && last > 0 ? last : null;
  }
  if (price != null) spotCache[sym] = { data: price, timestamp: now };
  return price;
}

// ---------------------------------------------------------------------------
// Front expiration (YYYYMMDD) — nearest listed expiry at/after today.
// ---------------------------------------------------------------------------
async function frontExpiration(asset: AssetInfo): Promise<number | null> {
  const sym = thetaSymbol(asset.ticker);
  const today = ymd(new Date());
  // Memoize per ticker per UTC day — the nearest listed expiry can only change at a
  // day boundary, so re-listing expirations every tick is pure waste.
  const memo = frontExpCache[sym];
  if (memo && memo.utcDay === today && memo.exp != null) return memo.exp;

  const rows = rowsOf(await thetaFetch('/option/list/expirations', { symbol: sym }));
  const exps = rows
    .map((r) => num(pick(r, 'expiration', 'date', 'exp')))
    .filter((e): e is number => e != null && e >= today)
    .sort((a, b) => a - b);
  const exp = exps.length ? exps[0] : null;
  if (exp != null) frontExpCache[sym] = { utcDay: today, exp };
  return exp;
}

// ---------------------------------------------------------------------------
// Option chain — merge bulk greeks + open interest + quotes for the front expiry.
// ---------------------------------------------------------------------------
export async function fetchThetaOptionChain(
  asset: AssetInfo,
  spotPrice: number,
): Promise<{ contracts: LiveOptionContract[]; source: string; message?: string }> {
  const sym = thetaSymbol(asset.ticker);
  const now = Date.now();
  const cached = chainCache[sym];
  if (cached && now - cached.timestamp < CHAIN_TTL_MS) return cached.data;

  const exp = await frontExpiration(asset);
  if (!exp) return { contracts: [], source: 'THETADATA_LIVE', message: 'No listed expirations returned.' };

  const [gRows, oiRows, qRows] = await Promise.all([
    thetaFetch('/option/bulk_snapshot/greeks', { symbol: sym, expiration: exp }).then(rowsOf),
    thetaFetch('/option/bulk_snapshot/open_interest', { symbol: sym, expiration: exp }).then(rowsOf),
    thetaFetch('/option/bulk_snapshot/quote', { symbol: sym, expiration: exp }).then(rowsOf),
  ]);

  if (!loggedShapeOnce && gRows.length) {
    loggedShapeOnce = true;
    console.log(`[ThetaData] chain columns for ${sym} ${exp}: ${Object.keys(gRows[0]).join(', ')}`);
  }
  if (!gRows.length) return { contracts: [], source: 'THETADATA_LIVE', message: 'Empty greeks snapshot.' };

  const rightOf = (o: Record<string, any>): 'C' | 'P' =>
    String(pick(o, 'right', 'option_type', 'type') || '').toUpperCase().startsWith('C') ? 'C' : 'P';
  const keyOf = (o: Record<string, any>): string => `${pick(o, 'strike')}|${rightOf(o)}`;

  const oiMap = new Map(oiRows.map((o) => [keyOf(o), o]));
  const qMap = new Map(qRows.map((o) => [keyOf(o), o]));

  const dteDays = Math.max(0.0001, (() => {
    const y = Math.floor(exp / 10000), m = Math.floor((exp % 10000) / 100), d = exp % 100;
    return (Date.UTC(y, m - 1, d) - Date.now()) / 86400000;
  })());

  const contracts: LiveOptionContract[] = [];
  for (const g of gRows) {
    const rawStrike = num(pick(g, 'strike'));
    const strike = decodeStrike(rawStrike, spotPrice);
    if (strike == null || strike <= 0) continue;
    const type = rightOf(g);
    const k = `${rawStrike}|${type}`;
    const q = qMap.get(k) || {};
    const oiRow = oiMap.get(k) || {};

    const iv = num(pick(g, 'implied_vol', 'iv', 'implied_volatility', 'mid_iv')) ?? asset.volatility;
    let delta = num(pick(g, 'delta'));
    let gamma = num(pick(g, 'gamma'));
    let theta = num(pick(g, 'theta'));
    let vega = num(pick(g, 'vega'));
    // Analytic fallback for any greek the feed omits (keeps GEX/dealer math valid).
    if (delta == null || gamma == null || theta == null || vega == null) {
      const ag = calculateAnalyticGreeks(spotPrice, strike, dteDays, iv, type === 'C');
      delta = delta ?? ag.delta;
      gamma = gamma ?? ag.gamma;
      theta = theta ?? ag.theta;
      vega = vega ?? ag.vega;
    }

    const bid = num(pick(q, 'bid')) ?? 0;
    const ask = num(pick(q, 'ask')) ?? 0;
    const last = num(pick(q, 'last', 'price', 'close')) ?? (bid && ask ? (bid + ask) / 2 : 0);

    contracts.push({
      contract: `${sym}${exp}${type}${Math.round(strike * 1000)}`,
      strike,
      type,
      oi: num(pick(oiRow, 'open_interest', 'oi')) ?? 0,
      volume: num(pick(q, 'volume', 'vol')) ?? 0,
      impliedVolatility: iv > 0 ? iv : asset.volatility,
      greeks: { delta: delta!, gamma: gamma!, theta: theta!, vega: vega! },
      bid,
      ask,
      lastPrice: last,
    });
  }

  const result = { contracts, source: 'THETADATA_LIVE', message: `ThetaData ${sym} ${exp}: ${contracts.length} contracts` };
  if (contracts.length > 0) chainCache[sym] = { data: result, timestamp: now };
  return result;
}

// ---------------------------------------------------------------------------
// Multi-expiry gamma slices (the full Voltick-style matrix). OPT-IN by design:
// this issues a greeks + open-interest bulk snapshot PER expiration, so it
// multiplies the per-tick request / OPRA cost by the number of expiries fetched.
// The market engine only calls it when SLAYER_MULTI_EXPIRY is enabled. Quotes are
// deliberately skipped — the matrix needs only net γ (gamma·OI·100·spot²·0.01·sign),
// not bid/ask — so it is cheaper than N full chains. Best-effort: any shape or
// availability problem yields [] (or drops that one expiry) so an enabled-but-
// failing fetch can never corrupt the single-expiry payload.
//
// NOTE: this path is wired and type-checked but has NOT been exercised against a
// live multi-expiry ThetaData feed (the dev environment fetches front-expiry only).
// ---------------------------------------------------------------------------
const EXPIRY_SLICES_TTL_MS = 30000; // heavier than the chain (N×) — cache longer
const expirySlicesCache: Record<string, CachedData<GexExpirySlice[]>> = {};

export async function fetchThetaExpirySlices(
  asset: AssetInfo,
  spotPrice: number,
  maxExpiries = 5,
): Promise<GexExpirySlice[]> {
  const sym = thetaSymbol(asset.ticker);
  const now = Date.now();
  const cached = expirySlicesCache[sym];
  if (cached && now - cached.timestamp < EXPIRY_SLICES_TTL_MS) return cached.data;

  const today = ymd(new Date());
  const ty = Math.floor(today / 10000), tm = Math.floor((today % 10000) / 100), td = today % 100;
  const todayUTC = Date.UTC(ty, tm - 1, td);

  const expRows = rowsOf(await thetaFetch('/option/list/expirations', { symbol: sym }));
  const exps = expRows
    .map((r) => num(pick(r, 'expiration', 'date', 'exp')))
    .filter((e): e is number => e != null && e >= today)
    .sort((a, b) => a - b)
    .slice(0, Math.max(1, maxExpiries));
  if (!exps.length) return [];

  const rightOf = (o: Record<string, any>): 'C' | 'P' =>
    String(pick(o, 'right', 'option_type', 'type') || '').toUpperCase().startsWith('C') ? 'C' : 'P';
  const spot2 = spotPrice * spotPrice;

  const slices: GexExpirySlice[] = [];
  for (const exp of exps) {
    try {
      const [gRows, oiRows] = await Promise.all([
        thetaFetch('/option/bulk_snapshot/greeks', { symbol: sym, expiration: exp }).then(rowsOf),
        thetaFetch('/option/bulk_snapshot/open_interest', { symbol: sym, expiration: exp }).then(rowsOf),
      ]);
      if (!gRows.length) continue;

      const oiMap = new Map(oiRows.map((o) => [`${pick(o, 'strike')}|${rightOf(o)}`, o]));
      const byStrike = new Map<number, { netGex: number; callGex: number; putGex: number; vol: number }>();
      for (const g of gRows) {
        const rawStrike = num(pick(g, 'strike'));
        const strike = decodeStrike(rawStrike, spotPrice);
        if (strike == null || strike <= 0) continue;
        const type = rightOf(g);
        const oiRow = oiMap.get(`${rawStrike}|${type}`) || {};
        const gamma = num(pick(g, 'gamma')) ?? 0;
        const oi = num(pick(oiRow, 'open_interest', 'oi')) ?? 0;
        if (!gamma || !oi) continue;
        const gex = gamma * oi * 100 * spot2 * 0.01 * (type === 'C' ? 1 : -1);
        const a = byStrike.get(strike) || { netGex: 0, callGex: 0, putGex: 0, vol: 0 };
        a.netGex += gex; a.vol += oi;
        if (type === 'C') a.callGex += gex; else a.putGex += gex;
        byStrike.set(strike, a);
      }
      if (!byStrike.size) continue;

      const strikes = [...byStrike.entries()].map(([strike, a]) => ({ strike, netGex: a.netGex, callGex: a.callGex, putGex: a.putGex, vol: a.vol }));
      let netGex = 0, callWall: number | undefined, putWall: number | undefined, maxPos = 0, maxNeg = 0;
      for (const s of strikes) {
        netGex += s.netGex;
        if (s.netGex > maxPos) { maxPos = s.netGex; callWall = s.strike; }
        if (s.netGex < maxNeg) { maxNeg = s.netGex; putWall = s.strike; }
      }
      const y = Math.floor(exp / 10000), m = Math.floor((exp % 10000) / 100), d = exp % 100;
      const isoExp = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dte = Math.max(0, Math.round((Date.UTC(y, m - 1, d) - todayUTC) / 86400000));
      slices.push({ expiration: isoExp, dte, netGex, callWall, putWall, strikes });
    } catch { /* skip this expiry, keep the rest */ }
  }

  if (slices.length) expirySlicesCache[sym] = { data: slices, timestamp: now };
  return slices;
}

// ---------------------------------------------------------------------------
// Historical candles (closes the chart-history gap for ThetaData-only setups).
// Best-effort: returns null on any shape mismatch so the engine falls back to
// its deterministic candles rather than rendering garbage.
// ---------------------------------------------------------------------------
const TF_INTERVAL_MS: Record<string, number> = {
  '1m': 60000, '2m': 120000, '5m': 300000, '15m': 900000, '30m': 1800000,
  '1H': 3600000, '1h': 3600000, '4H': 14400000,
};

export async function fetchThetaCandles(ticker: string, tf: string, count = 120): Promise<Candle[] | null> {
  const sym = thetaSymbol(ticker);
  const daily = tf === '1D' || tf === '1d' || tf === '1W' || tf === '1w';
  const ivlMs = TF_INTERVAL_MS[tf] ?? 300000;
  const assetType = isIndexRoot(ticker) ? 'index' : 'stock';

  const end = new Date();
  const start = new Date(end.getTime() - (daily ? count * 86400000 : count * ivlMs * 1.5) - 5 * 86400000);
  const params: Record<string, string | number> = {
    symbol: sym,
    start_date: ymd(start),
    end_date: ymd(end),
    ...(daily ? {} : { interval: ivlMs }),
  };
  const path = daily ? `/${assetType}/history/eod` : `/${assetType}/history/ohlc`;
  const rows = rowsOf(await thetaFetch(path, params));
  if (!rows.length) return null;

  const candles: Candle[] = [];
  for (const r of rows) {
    const o = num(pick(r, 'open'));
    const h = num(pick(r, 'high'));
    const l = num(pick(r, 'low'));
    const c = num(pick(r, 'close'));
    if (o == null || h == null || l == null || c == null) continue;

    // Timestamp resolution — the key matters:
    //  • 'ms_of_day' is milliseconds since midnight in EXCHANGE-LOCAL (ET) time, so
    //    it must be added to the ET midnight of the bar's `date` (i.e. the UTC date
    //    base PLUS the ET→UTC offset for that day). Treating it as UTC ms-of-day
    //    shifted every intraday bar 4–5 hours.
    //  • 'timestamp' (and 'time') are a STANDALONE full epoch in ms — they must be
    //    used as-is, NEVER summed onto a date base.
    const dateInt = num(pick(r, 'date')) ?? 0;
    const msOfDay = num(pick(r, 'ms_of_day'));
    const epoch = num(pick(r, 'timestamp', 'time'));
    let timestamp: number;
    if (msOfDay != null && dateInt > 0) {
      const y = Math.floor(dateInt / 10000), mo = Math.floor((dateInt % 10000) / 100), d = dateInt % 100;
      const utcMidnight = Date.UTC(y, mo - 1, d);
      timestamp = utcMidnight + msOfDay + etOffsetMs(utcMidnight);
    } else if (epoch != null) {
      timestamp = epoch; // full epoch — use standalone, never summed
    } else if (dateInt > 0) {
      const y = Math.floor(dateInt / 10000), mo = Math.floor((dateInt % 10000) / 100), d = dateInt % 100;
      timestamp = Date.UTC(y, mo - 1, d);
    } else {
      timestamp = Date.now();
    }
    candles.push({ timestamp, open: o, high: h, low: l, close: c, volume: num(pick(r, 'volume', 'vol')) ?? 0 });
  }
  candles.sort((a, b) => a.timestamp - b.timestamp);
  return candles.length ? candles.slice(-count) : null;
}

// ---------------------------------------------------------------------------
// Flows — derive notable prints from the live chain (mirrors the Tradier path):
// rank by notional (oi-weighted) and surface the heaviest as sweep/block tape.
// ---------------------------------------------------------------------------
export async function collectThetaFlows(ticker: string, spotPrice: number, contracts: LiveOptionContract[]): Promise<any[]> {
  if (!contracts || contracts.length === 0) return [];
  const ranked = [...contracts]
    .map((c) => ({ c, notional: (c.volume || 0) * ((c.bid + c.ask) / 2 || c.lastPrice || 0) * 100 }))
    .filter((x) => x.notional > 0)
    .sort((a, b) => b.notional - a.notional)
    .slice(0, 12);
  const now = Date.now();
  return ranked.map(({ c }, i) => ({
    id: `theta-${ticker}-${c.strike}${c.type}-${now}-${i}`,
    ticker,
    contract: `${ticker} ${c.strike}${c.type}`,
    strike: c.strike,
    type: c.type,
    side: c.type === 'C' ? 'CALL' : 'PUT',
    sentiment: c.type === 'C' ? 'BULLISH' : 'BEARISH',
    size: c.volume || 0,
    premium: ((c.bid + c.ask) / 2 || c.lastPrice || 0),
    notional: Math.round((c.volume || 0) * ((c.bid + c.ask) / 2 || c.lastPrice || 0) * 100),
    flowType: i < 3 ? 'SWEEP' : 'BLOCK',
    timestamp: now,
    spot: spotPrice,
  }));
}
