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
import { AssetInfo, TimeframeVal, Candle } from '../types';
import { ASSET_LIST } from '../data';
import type { LiveOptionContract } from './marketDataProvider';
import { calculateAnalyticGreeks } from './v11Math';

const DEFAULT_BASE = 'http://127.0.0.1:25503/v3';
const INDEX_ROOTS = new Set(['SPX', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX']);

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

// ---------------------------------------------------------------------------
// Spot price
// ---------------------------------------------------------------------------
export async function fetchThetaSpotPrice(ticker: string): Promise<number | null> {
  const sym = thetaSymbol(ticker);
  const path = isIndexRoot(ticker) ? '/index/snapshot/quote' : '/stock/snapshot/quote';
  const rows = rowsOf(await thetaFetch(path, { symbol: sym }));
  if (!rows.length) return null;
  const r = rows[0];
  const bid = num(pick(r, 'bid'));
  const ask = num(pick(r, 'ask'));
  if (bid && ask && bid > 0 && ask > 0) return (bid + ask) / 2;
  const last = num(pick(r, 'last', 'price', 'close', 'value', 'mid', 'mark'));
  return last && last > 0 ? last : null;
}

// ---------------------------------------------------------------------------
// Front expiration (YYYYMMDD) — nearest listed expiry at/after today.
// ---------------------------------------------------------------------------
async function frontExpiration(asset: AssetInfo): Promise<number | null> {
  const sym = thetaSymbol(asset.ticker);
  const rows = rowsOf(await thetaFetch('/option/list/expirations', { symbol: sym }));
  const today = ymd(new Date());
  const exps = rows
    .map((r) => num(pick(r, 'expiration', 'date', 'exp')))
    .filter((e): e is number => e != null && e >= today)
    .sort((a, b) => a - b);
  return exps.length ? exps[0] : null;
}

// ---------------------------------------------------------------------------
// Option chain — merge bulk greeks + open interest + quotes for the front expiry.
// ---------------------------------------------------------------------------
export async function fetchThetaOptionChain(
  asset: AssetInfo,
  spotPrice: number,
): Promise<{ contracts: LiveOptionContract[]; source: string; message?: string }> {
  const sym = thetaSymbol(asset.ticker);
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

  return { contracts, source: 'THETADATA_LIVE', message: `ThetaData ${sym} ${exp}: ${contracts.length} contracts` };
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
    const ms = num(pick(r, 'ms_of_day', 'timestamp', 'time')) ?? 0;
    const dateInt = num(pick(r, 'date')) ?? 0;
    const y = Math.floor(dateInt / 10000), mo = Math.floor((dateInt % 10000) / 100), d = dateInt % 100;
    const timestamp = dateInt > 0 ? Date.UTC(y, mo - 1, d) + (ms || 0) : (num(pick(r, 'timestamp')) ?? Date.now());
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
