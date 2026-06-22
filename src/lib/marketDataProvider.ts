/**
 * Pinpoint & Skyseye Institutional-Grade Market Data Layer
 * Handles real-time Polygon.io Options and Spot Snapshot bindings
 */

import { ASSET_LIST } from '../data.js';
import { AssetInfo } from '../types.js';
import { calculateAnalyticGreeks } from './v11Math';

const CACHE_TTL_MS = 6000; // 6-second caching to prevent rate-limit exhaustion during active SSE ticks

interface CachedData<T> {
  data: T;
  timestamp: number;
}

// Memory caches
const snapshotCache: Record<string, CachedData<any>> = {};
const optionChainCache: Record<string, CachedData<any>> = {};

/**
 * Normalizes underlying indices/ETFs tickers for the Polygon API.
 * Polygon Index symbols require the 'I:' prefix (e.g. 'I:SPX', 'I:NDX').
 */
export function getPolygonTicker(ticker: string): string {
  if (ticker === 'SPX' || ticker === 'NDX') {
    return `I:${ticker}`;
  }
  return ticker;
}

/**
 * Checks if Polygon is configured via environment variables
 */
export function isPolygonConfigured(): boolean {
  return !!process.env.POLYGON_API_KEY;
}

/**
 * Polygon supports header auth, so the key is passed as a Bearer token rather
 * than a `?apiKey=` query param. This keeps the secret out of request URLs —
 * and therefore out of upstream access logs, proxy logs, and error-tracking
 * breadcrumbs, the most common API-key leak vector.
 */
function polygonFetch(url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${process.env.POLYGON_API_KEY || ''}` } });
}

/**
 * Fetches real-time spot prices for indexes/ETFs using the Polygon Snapshot API.
 * Gracefully falls back to ETF-ratio scaling or simulation values.
 */
export async function fetchLiveSpotPrice(ticker: string, defaultFallbackPrice: number): Promise<{ price: number; source: 'POLYGON_LIVE' | 'SANDBOX_SYNTHETIC' }> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return { price: defaultFallbackPrice, source: 'SANDBOX_SYNTHETIC' };
  }

  const polyTicker = getPolygonTicker(ticker);
  const cacheKey = `spot-${polyTicker}`;
  const now = Date.now();

  if (snapshotCache[cacheKey] && (now - snapshotCache[cacheKey].timestamp < CACHE_TTL_MS)) {
    return { price: snapshotCache[cacheKey].data, source: 'POLYGON_LIVE' };
  }

  try {
    let price = defaultFallbackPrice;
    
    if (ticker === 'SPX' || ticker === 'NDX') {
      try {
        // Query correct V3 indices snapshot endpoint
        const url = `https://api.polygon.io/v3/snapshot/indices?tickers=${polyTicker}`;
        const response = await polygonFetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const json = await response.json();
        if (json?.results && json.results.length > 0 && json.results[0].value) {
          price = json.results[0].value;
        } else {
          throw new Error('Indices result empty');
        }
      } catch (err: any) {
        // Safe Backup Proxy Scaling: Fall back to fetching correlated ETFs (SPY/QQQ)
        const proxyTicker = ticker === 'SPX' ? 'SPY' : 'QQQ';
        const proxyAsset = ASSET_LIST.find(a => a.ticker === proxyTicker);
        if (proxyAsset) {
          const proxyRes = await fetchLiveSpotPrice(proxyTicker, proxyAsset.defaultPrice);
          if (proxyRes.source === 'POLYGON_LIVE') {
            const ratio = proxyRes.price / proxyAsset.defaultPrice;
            price = Number((defaultFallbackPrice * ratio).toFixed(2));
            snapshotCache[cacheKey] = { data: price, timestamp: now };
            return { price, source: 'POLYGON_LIVE' };
          }
        }
        throw err;
      }
    } else {
      // Correct V2 stocks snapshot endpoint for ETFs & Equities
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${polyTicker}`;
      const response = await polygonFetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      price = json?.ticker?.lastTrade?.p || json?.ticker?.min?.c || json?.ticker?.day?.c || json?.ticker?.prevDay?.c || defaultFallbackPrice;
    }

    snapshotCache[cacheKey] = { data: price, timestamp: now };
    return { price, source: 'POLYGON_LIVE' };
  } catch (error: any) {
    console.info(`[Polygon.io Spot Safe Fallback] ${ticker} spot fallback to simulation. Access key limits: ${error.message || error}`);
    return { price: defaultFallbackPrice, source: 'SANDBOX_SYNTHETIC' };
  }
}

export interface LiveOptionContract {
  contract: string;
  strike: number;
  type: 'C' | 'P';
  oi: number;
  volume: number;
  impliedVolatility: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  bid: number;
  ask: number;
  lastPrice: number;
}

/**
 * Fetches the options chain dynamically from Polygon's Options Snapshot endpoint.
 * Cleaned up the 'limit' query parameter to prevent HTTP 400 (Bad Request).
 */
export async function fetchLiveOptionChain(asset: AssetInfo, spotPrice: number): Promise<{
  contracts: LiveOptionContract[];
  source: 'POLYGON_LIVE' | 'SANDBOX_SYNTHETIC';
  message?: string;
}> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return { contracts: [], source: 'SANDBOX_SYNTHETIC' };
  }

  const underlying = asset.ticker;
  const cacheKey = `chain-${underlying}`;
  const now = Date.now();

  if (optionChainCache[cacheKey] && (now - optionChainCache[cacheKey].timestamp < CACHE_TTL_MS)) {
    return { contracts: optionChainCache[cacheKey].data, source: 'POLYGON_LIVE' };
  }

  try {
    const queryUnderlying = (underlying === 'SPX') ? 'SPY' : (underlying === 'NDX' ? 'QQQ' : underlying);
    // Removed unsupported limit=400 parameter causing HTTP 400 errors
    const url = `https://api.polygon.io/v3/snapshot/options/${queryUnderlying}`;

    const response = await polygonFetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const resJson = await response.json();
    if (!resJson.results || !Array.isArray(resJson.results)) {
      throw new Error(`No active results formatted by Polygon snapshot`);
    }

    // Limit contract processing array size to prevent thread blocking
    const activeResults = resJson.results.slice(0, 400);

    // When proxying an index off its ETF (SPX→SPY, NDX→QQQ) the ETF strikes must be
    // rescaled to the index by the LIVE spot ratio (indexSpot / proxySpot), mirroring
    // tradierProvider's scaleEtfChainToIndex. A hardcoded multiplier (the old ×10 for
    // SPX, and none for NDX) drifts from the true ratio and is flat-out wrong for NDX.
    let strikeRatio = 1;
    if (queryUnderlying !== underlying && (underlying === 'SPX' || underlying === 'NDX')) {
      const proxyAsset = ASSET_LIST.find(a => a.ticker === queryUnderlying);
      const proxyDefault = proxyAsset?.defaultPrice || 0;
      let proxySpot = 0;
      try {
        const proxyRes = await fetchLiveSpotPrice(queryUnderlying, proxyDefault || 1);
        proxySpot = proxyRes.price;
      } catch {
        proxySpot = proxyDefault;
      }
      // Guard divide-by-zero: prefer live index/proxy spot, else default/default, else 1.
      if (spotPrice > 0 && proxySpot > 0) {
        strikeRatio = spotPrice / proxySpot;
      } else if ((asset.defaultPrice || 0) > 0 && proxyDefault > 0) {
        strikeRatio = asset.defaultPrice / proxyDefault;
      } else {
        strikeRatio = 1;
      }
    }

    const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

    const contracts: LiveOptionContract[] = activeResults.map((item: any) => {
      const details = item.details || {};
      const greeks = item.greeks || {};
      const day = item.day || {};

      const parsedStrike = details.strike_price || 0;
      const type = details.contract_type === 'call' ? 'C' : 'P';
      const parsedOi = item.open_interest || 0;
      const parsedVol = day.volume || 0;
      const ivRaw = num(item.implied_volatility);
      const impliedVolatility = ivRaw && ivRaw > 0 ? ivRaw : 0.15;
      // Scale the strike before deriving analytic greeks so the BSM moneyness
      // matches the (index-scaled) strike the contract is reported at.
      const scaledStrike = strikeRatio !== 1 ? Number((parsedStrike * strikeRatio).toFixed(2)) : parsedStrike;

      // Mirror Tradier/ThetaData: when Polygon omits a greek, derive it analytically
      // from the same BSM inputs instead of defaulting to a constant (which silently
      // collapses GEX/DEX/VEX and dealer math to a flat fabricated value on live data).
      let delta = num(greeks.delta);
      let gamma = num(greeks.gamma);
      let theta = num(greeks.theta);
      let vega = num(greeks.vega);
      if (delta == null || gamma == null || theta == null || vega == null) {
        const expDate = details.expiration_date ? new Date(`${details.expiration_date}T20:00:00Z`).getTime() : 0;
        const dteDays = expDate > 0 ? Math.max(1 / 365, (expDate - now) / 86400000) : 1 / 365;
        try {
          const ag = calculateAnalyticGreeks(spotPrice, scaledStrike || parsedStrike || spotPrice, dteDays, impliedVolatility, type === 'C');
          delta = delta ?? ag.delta;
          gamma = gamma ?? ag.gamma;
          theta = theta ?? ag.theta;
          vega = vega ?? ag.vega;
        } catch {
          delta = delta ?? (type === 'C' ? 0.5 : -0.5);
          gamma = gamma ?? 0.05;
          theta = theta ?? -1.2;
          vega = vega ?? 0.15;
        }
      }

      return {
        contract: typeof item.ticker === 'string' ? item.ticker.replace('O:', '') : '',
        strike: scaledStrike, // Scale ETF→index strikes by live spot ratio
        type,
        oi: parsedOi,
        volume: parsedVol,
        impliedVolatility,
        greeks: {
          delta: delta!,
          gamma: gamma!,
          theta: theta!,
          vega: vega!
        },
        bid: item.last_quote?.bid || 0,
        ask: item.last_quote?.ask || 0,
        lastPrice: day.last_price || item.last_quote?.ask || 0
      };
    });

    const filtered = contracts.filter(c => c.strike > 0);
    optionChainCache[cacheKey] = { data: filtered, timestamp: now };
    
    return {
      contracts: filtered,
      source: 'POLYGON_LIVE',
      message: `Indexed ${filtered.length} live contracts for ${underlying}`
    };

  } catch (error: any) {
    console.info(`[Polygon.io Options Chain Safe Fallback] Using simulated options chain. Access key limits: ${error.message || error}`);
    return { contracts: [], source: 'SANDBOX_SYNTHETIC' };
  }
}

/**
 * Polls block trade events and large sweeps from the live options tapes snapshot.
 */
export async function collectLiveFlows(ticker: string, currentSpot: number): Promise<any[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return [];

  try {
    const queryUnderlying = (ticker === 'SPX') ? 'SPY' : (ticker === 'NDX' ? 'QQQ' : ticker);
    // Removed unsupported limit=50 parameter causing HTTP 400 errors
    const url = `https://api.polygon.io/v3/snapshot/options/${queryUnderlying}`;
    const response = await polygonFetch(url);
    if (!response.ok) return [];

    const resJson = await response.json();
    if (!resJson.results || !Array.isArray(resJson.results)) return [];

    const flowBlocks: any[] = [];
    // Process top entries to detect heavy sweeps
    const activeResults = resJson.results.slice(0, 150);
    
    activeResults.forEach((item: any) => {
      const day = item.day || {};
      const vol = day.volume || 0;
      if (vol > 500) {
        const typeStr = vol > 5000 ? 'SWEEP' : (vol > 2000 ? 'BLOCK' : 'UNUSUAL');
        const details = item.details || {};
        const strike = details.strike_price || currentSpot;
        const type = details.contract_type === 'call' ? 'C' : 'P';
        const rawTicker = item.ticker.replace('O:', '');
        
        flowBlocks.push({
          id: `live-flow-${rawTicker}-${Date.now()}-${Math.random()}`,
          asset: ticker,
          type: typeStr,
          contract: `${vol.toLocaleString()} ${ticker} ${strike}${type}`,
          desc: `${type === 'C' ? 'Bought at Ask' : 'Sold at Bid'} • Vol ${vol.toLocaleString()} • IV ${((Number(item.implied_volatility) || 0) * 100).toFixed(1)}%`,
          side: type
        });
      }
    });

    return flowBlocks;
  } catch (e) {
    return [];
  }
}
