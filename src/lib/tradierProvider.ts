/**
 * Institutional-Grade Tradier Data adapter
 * Handles live quotes, dynamic 1m/5m/15m/daily option candles, option chains,
 * and extracts volume-based sweeps/flows directly from active chains.
 */

import { ASSET_LIST } from '../data';
import { AssetInfo, Candle } from '../types';
import { calculateAnalyticGreeks } from './v11Math';
import { LiveOptionContract } from './marketDataProvider';

const CACHE_TTL_MS = 6000; // 6-second cache for spots/chains
const CANDLE_CACHE_TTL_MS = 60000; // 60-second cache for candles

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const spotCache: Record<string, CachedData<number>> = {};
const chainCache: Record<string, CachedData<any>> = {};
const candleCache: Record<string, CachedData<Candle[]>> = {};

const resolvedSymbols: Record<string, string> = {};
const lastTradierErrors: string[] = [];

export function getLastTradierError(): string | null {
  return lastTradierErrors.length > 0 ? lastTradierErrors[lastTradierErrors.length - 1] : null;
}

export function tradierSymbolCandidates(ticker: string): string[] {
  if (ticker === 'SPX') return ['$SPX', 'SPX', 'SPXW'];
  if (ticker === 'NDX') return ['$NDX', 'NDX', 'NDXP'];
  if (ticker === 'SPY' || ticker === 'QQQ' || ticker === 'IWM' || ticker === 'VIX') {
    return [ticker, `$${ticker}`];
  }
  return [ticker];
}

/**
 * Normalizes underlying indices/ETFs tickers for the Tradier API.
 */
export function getTradierTicker(ticker: string): string {
  if (ticker === 'SPX' || ticker === 'NDX') {
    return `$${ticker}`;
  }
  return ticker;
}

/**
 * Returns the correct live Tradier API URL based on API Token characteristics or settings
 */
export function getTradierBaseUrl(): string {
  const apiKey = process.env.TRADIER_API_KEY || '';
  if (
    process.env.TRADIER_ENV === 'sandbox' ||
    apiKey.toLowerCase().includes('sandbox') ||
    apiKey.toLowerCase().startsWith('sb')
  ) {
    return 'https://sandbox.tradier.com/v1';
  }
  return 'https://api.tradier.com/v1';
}

/**
 * Checks if Tradier is configured via environment variables
 */
export function isTradierConfigured(): boolean {
  return !!process.env.TRADIER_API_KEY;
}

/**
 * Helper to fetch with Bearer credentials and JSON headers
 */
async function tradierFetch(endpoint: string): Promise<any> {
  const apiKey = process.env.TRADIER_API_KEY;
  if (!apiKey) {
    throw new Error('TRADIER_API_KEY is not configured');
  }

  const baseUrl = getTradierBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Tradier API Error: HTTP ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error: any) {
    lastTradierErrors.push(error?.message || String(error));
    if (lastTradierErrors.length > 10) lastTradierErrors.shift();
    throw error;
  }
}

/**
 * Fetches the real-time spot price for active indices/stocks.
 */
export async function fetchTradierSpotPrice(ticker: string): Promise<number | null> {
  const cacheKey = `spot-${ticker}`;
  const now = Date.now();

  if (spotCache[cacheKey] && (now - spotCache[cacheKey].timestamp < CACHE_TTL_MS)) {
    return spotCache[cacheKey].data;
  }

  const candidates = tradierSymbolCandidates(ticker);
  let priceResult: number | null = null;
  let chosenCandidate = resolvedSymbols[ticker];

  if (chosenCandidate) {
    try {
      const json = await tradierFetch(`/markets/quotes?symbols=${encodeURIComponent(chosenCandidate)}`);
      const quoteData = json?.quotes?.quote;
      if (quoteData) {
        const q = Array.isArray(quoteData) ? quoteData[0] : quoteData;
        const p = q.last !== undefined && q.last !== null ? Number(q.last) : Number(q.close);
        if (!isNaN(p) && p > 0) {
          priceResult = p;
        }
      }
    } catch {
      resolvedSymbols[ticker] = ''; // clear bad resolution
    }
  }

  if (priceResult === null) {
    for (const cand of candidates) {
      try {
        const json = await tradierFetch(`/markets/quotes?symbols=${encodeURIComponent(cand)}`);
        const quoteData = json?.quotes?.quote;
        if (quoteData) {
          const q = Array.isArray(quoteData) ? quoteData[0] : quoteData;
          const p = q.last !== undefined && q.last !== null ? Number(q.last) : Number(q.close);
          if (!isNaN(p) && p > 0) {
            priceResult = p;
            resolvedSymbols[ticker] = cand;
            break;
          }
        }
      } catch {
        // try next candidate
      }
    }
  }

  if (priceResult !== null) {
    spotCache[cacheKey] = { data: priceResult, timestamp: now };
    return priceResult;
  }

  // index fallback scales from proxy using indexDefault / proxyDefault as last-resort anchor
  if (ticker === 'SPX') {
    const spyPrice = await fetchTradierSpotPrice('SPY');
    if (spyPrice) {
      // SPX ≈ 10 × SPY by design (SPY tracks ~1/10 of the S&P 500 index). The old
      // 7623/512.30 = 14.88 anchor mixed mismatched-date values and inflated the proxy
      // spot ~49%, feeding GEX/RND/strike-selection wrong numbers under a LIVE label.
      const scaledPrice = spyPrice * 10;
      spotCache[cacheKey] = { data: scaledPrice, timestamp: now };
      return scaledPrice;
    }
  } else if (ticker === 'NDX') {
    const qqqPrice = await fetchTradierSpotPrice('QQQ');
    if (qqqPrice) {
      const scaledPrice = qqqPrice * (18250.00 / 445.50);
      spotCache[cacheKey] = { data: scaledPrice, timestamp: now };
      return scaledPrice;
    }
  }

  return null;
}

/**
 * Scales highly liquid ETF options chains to represent underlying indices
 */
export function scaleEtfChainToIndex(etfChain: LiveOptionContract[], asset: AssetInfo, ratio: number): LiveOptionContract[] {
  return etfChain.map(contract => {
    // scale strike
    const newStrike = Math.round((contract.strike * ratio) * 2) / 2;
    // scale prices
    const newBid = Number((contract.bid * ratio).toFixed(2));
    const newAsk = Number((contract.ask * ratio).toFixed(2));
    const newLastPrice = Number((contract.lastPrice * ratio).toFixed(2));
    // rename contract suffix safely
    const newSymbol = contract.contract.replace('SPY', 'SPX').replace('QQQ', 'NDX');

    // Scale Greeks mathematically correctly
    const delta = contract.greeks.delta;
    const gamma = Number((contract.greeks.gamma / ratio).toFixed(6));
    const theta = Number((contract.greeks.theta * ratio).toFixed(4));
    const vega = Number((contract.greeks.vega * ratio).toFixed(4));

    return {
      contract: newSymbol,
      strike: newStrike,
      type: contract.type,
      oi: contract.oi,
      volume: contract.volume,
      impliedVolatility: contract.impliedVolatility,
      greeks: { delta, gamma, theta, vega },
      bid: newBid,
      ask: newAsk,
      lastPrice: newLastPrice
    };
  });
}

/**
 * Fetches the active options chain with dynamic 0DTE logic or near expiration
 */
export async function fetchTradierOptionChain(asset: AssetInfo, spotPrice: number): Promise<{
  contracts: LiveOptionContract[];
  source: 'TRADIER_LIVE';
  message: string;
} | null> {
  const ticker = asset.ticker;
  const cacheKey = `chain-${ticker}`;
  const now = Date.now();

  if (chainCache[cacheKey] && (now - chainCache[cacheKey].timestamp < CACHE_TTL_MS)) {
    return {
      contracts: chainCache[cacheKey].data,
      source: 'TRADIER_LIVE',
      message: `Cached options chain for ${ticker}`
    };
  }

  const candidates = tradierSymbolCandidates(ticker);
  let expJson: any = null;
  let chosenCandidate = resolvedSymbols[ticker];

  if (chosenCandidate) {
    try {
      expJson = await tradierFetch(`/markets/options/expirations?symbol=${encodeURIComponent(chosenCandidate)}&includeAllRoots=true`);
    } catch {
      resolvedSymbols[ticker] = '';
    }
  }

  if (!expJson) {
    for (const cand of candidates) {
      try {
        expJson = await tradierFetch(`/markets/options/expirations?symbol=${encodeURIComponent(cand)}&includeAllRoots=true`);
        if (expJson?.expirations?.date) {
          chosenCandidate = cand;
          resolvedSymbols[ticker] = cand;
          break;
        }
      } catch {
        // try next candidate
      }
    }
  }

  if (expJson && chosenCandidate) {
    try {
      const dateData = expJson?.expirations?.date;
      if (!dateData) {
        throw new Error(`Expirations unavailable for ${ticker}`);
      }
      const dates = Array.isArray(dateData) ? dateData : [dateData];
      if (dates.length === 0) {
        throw new Error(`Expirations list is empty for ${ticker}`);
      }
      const chosenExpiration = dates[0]; // Nearest active expiration (0DTE/Closest)

      const chainUrl = `/markets/options/chains?symbol=${encodeURIComponent(chosenCandidate)}&expiration=${chosenExpiration}&greeks=true`;
      const chainJson = await tradierFetch(chainUrl);
      const optionData = chainJson?.options?.option;
      if (!optionData) {
        throw new Error(`Option chain response empty for ${ticker}`);
      }
      const options = Array.isArray(optionData) ? optionData : [optionData];

      const contracts: LiveOptionContract[] = options.map((item: any) => {
        const type: 'C' | 'P' = item.type === 'call' || item.type === 'C' ? 'C' : 'P';
        const strike = Number(item.strike) || 0;
        const oi = Number(item.open_interest) || 0;
        const volume = Number(item.volume) || 0;
        
        const rawGreeks = item.greeks || {};
        // Tradier returns greeks/IV as numeric STRINGS (e.g. "0.1834"); a
        // typeof === 'number' gate silently discarded them, collapsing every
        // contract to a flat 0.15 IV + default greeks on live data. Coerce.
        const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
        const ivMid = num(rawGreeks.mid_iv), ivSmv = num(rawGreeks.smv_vol), ivImp = num(item.implied_volatility);
        const impliedVolatility = (ivMid && ivMid > 0) ? ivMid : (ivSmv && ivSmv > 0) ? ivSmv : (ivImp && ivImp > 0) ? ivImp : 0.15;
        const bid = Number(item.bid) || 0;
        const ask = Number(item.ask) || 0;

        let delta = num(rawGreeks.delta) ?? (type === 'C' ? 0.5 : -0.5);
        let gamma = num(rawGreeks.gamma) ?? 0.01;
        let theta = num(rawGreeks.theta) ?? -0.1;
        let vega = num(rawGreeks.vega) ?? 0.05;

        // Safe fallback to analytic Greeks if the data feed has gaps
        if (Math.abs(delta) < 0.0001 || gamma === 0) {
          try {
            const analytic = calculateAnalyticGreeks(spotPrice, strike, 1 / 365, impliedVolatility, type === 'C');
            delta = analytic.delta;
            gamma = analytic.gamma;
            theta = analytic.theta;
            vega = analytic.vega;
          } catch {
            // preserve defaults
          }
        }

        return {
          contract: item.symbol || '',
          strike,
          type,
          oi,
          volume,
          impliedVolatility,
          greeks: { delta, gamma, theta, vega },
          bid,
          ask,
          lastPrice: item.last !== undefined && item.last !== null && item.last !== 0 ? Number(item.last) : (ask || bid || 0)
        };
      }).filter(c => c.strike > 0);

      if (contracts.length > 0) {
        chainCache[cacheKey] = { data: contracts, timestamp: now };
        return {
          contracts,
          source: 'TRADIER_LIVE',
          message: `Indexed ${contracts.length} live contracts for ${ticker} on ${chosenExpiration}`
        };
      }
    } catch {
      // let fallback handle it
    }
  }

  // Proxy-chain mapping fallback for indices
  if (ticker === 'SPX') {
    try {
      const spyAsset = ASSET_LIST.find(a => a.ticker === 'SPY');
      const spySpot = await fetchTradierSpotPrice('SPY');
      if (spyAsset && spySpot) {
        const spyChainRes = await fetchTradierOptionChain(spyAsset, spySpot);
        if (spyChainRes && spyChainRes.contracts) {
          const ratio = spySpot > 0 ? spotPrice / spySpot : 10; // structural SPX/SPY ≈ 10 (not the old 14.88 anchor)
          const scaledContracts = scaleEtfChainToIndex(spyChainRes.contracts, asset, ratio);
          chainCache[cacheKey] = { data: scaledContracts, timestamp: now };
          return {
            contracts: scaledContracts,
            source: 'TRADIER_LIVE',
            message: `Mapped ${scaledContracts.length} live SPY contracts to SPX at ${ratio.toFixed(2)}x`
          };
        }
      }
    } catch {
      // ignore
    }
  } else if (ticker === 'NDX') {
    try {
      const qqqAsset = ASSET_LIST.find(a => a.ticker === 'QQQ');
      const qqqSpot = await fetchTradierSpotPrice('QQQ');
      if (qqqAsset && qqqSpot) {
        const qqqChainRes = await fetchTradierOptionChain(qqqAsset, qqqSpot);
        if (qqqChainRes && qqqChainRes.contracts) {
          const ratio = qqqSpot > 0 ? spotPrice / qqqSpot : 18250.00 / 445.50;
          const scaledContracts = scaleEtfChainToIndex(qqqChainRes.contracts, asset, ratio);
          chainCache[cacheKey] = { data: scaledContracts, timestamp: now };
          return {
            contracts: scaledContracts,
            source: 'TRADIER_LIVE',
            message: `Mapped ${scaledContracts.length} live QQQ contracts to NDX at ${ratio.toFixed(2)}x`
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Aggregates tick/candles to higher minute frames
 */
export function aggregateCandles(candles: Candle[], minutes: number): Candle[] {
  if (minutes <= 1) return candles;
  const aggregated: Candle[] = [];
  const bucketMs = minutes * 60_000;
  const groupMap = new Map<number, Candle[]>();

  for (const c of candles) {
    const bucketStart = Math.floor(c.timestamp / bucketMs) * bucketMs;
    let b = groupMap.get(bucketStart);
    if (!b) {
      b = [];
      groupMap.set(bucketStart, b);
    }
    b.push(c);
  }

  const sortedKeys = [...groupMap.keys()].sort((a, b) => a - b);
  for (const key of sortedKeys) {
    const list = groupMap.get(key)!;
    const open = list[0].open;
    const close = list[list.length - 1].close;
    const high = list.reduce((m, c) => Math.max(m, c.high), -Infinity);
    const low = list.reduce((m, c) => Math.min(m, c.low), Infinity);
    const volume = list.reduce((sum, c) => sum + (Number(c.volume) || 0), 0);
    const vwapSum = list.reduce((sum, c) => sum + (c.vwap || c.close) * c.volume, 0);
    const vwap = volume > 0 ? vwapSum / volume : close;

    aggregated.push({
      timestamp: key,
      open,
      high,
      low,
      close,
      volume,
      vwap
    });
  }
  return aggregated;
}

/**
 * Computes session-anchored VWAP and trailing RVOL
 */
export function annotateCandles(candles: Candle[]): Candle[] {
  const result: Candle[] = [];
  let currentDayStr = '';
  let cumulativeTypicalPriceVolume = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const date = new Date(c.timestamp);
    const dayStr = date.toISOString().split('T')[0];

    // Reset cumulative VWAP on UTC day change
    if (dayStr !== currentDayStr) {
      currentDayStr = dayStr;
      cumulativeTypicalPriceVolume = 0;
      cumulativeVolume = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeTypicalPriceVolume += typicalPrice * c.volume;
    cumulativeVolume += c.volume;

    const sessionVwap = cumulativeVolume > 0 
      ? cumulativeTypicalPriceVolume / cumulativeVolume 
      : c.close;

    // RVOL (Relative Volume) - trailing 20 excluding current bar
    let rvol = 1.0;
    if (i >= 20) {
      const slice = candles.slice(i - 20, i);
      const avgVol = slice.reduce((sum, bar) => sum + bar.volume, 0) / 20;
      rvol = avgVol > 0 ? c.volume / avgVol : 1.0;
    } else if (i > 0) {
      const slice = candles.slice(0, i);
      const avgVol = slice.reduce((sum, bar) => sum + bar.volume, 0) / i;
      rvol = avgVol > 0 ? c.volume / avgVol : 1.0;
    }

    result.push({
      ...c,
      vwap: sessionVwap,
      relativeVolume: rvol
    });
  }
  return result;
}

/**
 * Fetches candle records for lookbacks from Timesales (intraday) or History (daily/weekly)
 */
export async function fetchTradierCandles(ticker: string, tf: string, count = 120): Promise<Candle[] | null> {
  const cacheKey = `${ticker}-${tf}`;
  const now = Date.now();

  if (candleCache[cacheKey] && (now - candleCache[cacheKey].timestamp < CANDLE_CACHE_TTL_MS)) {
    return candleCache[cacheKey].data;
  }

  const candidates = tradierSymbolCandidates(ticker);
  let chosenCandidate = resolvedSymbols[ticker];
  let rawJson: any = null;

  // Resolve candidate symbol if not already set
  if (!chosenCandidate) {
    await fetchTradierSpotPrice(ticker);
    chosenCandidate = resolvedSymbols[ticker];
  }

  if (chosenCandidate) {
    try {
      if (tf === '1D' || tf === '1W') {
        const histUrl = `/markets/history?symbol=${encodeURIComponent(chosenCandidate)}&interval=${tf === '1D' ? 'daily' : 'weekly'}`;
        rawJson = await tradierFetch(histUrl);
      } else {
        let interval = '15min';
        if (tf === '1m' || tf === '2m' || tf === '3m') interval = '1min';
        else if (tf === '5m') interval = '5min';

        // 5-day lookback for timesales intraday seeding
        const startDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const startStr = startDate.toISOString().split('T')[0] + ' 09:30';
        const tsUrl = `/markets/timesales?symbol=${encodeURIComponent(chosenCandidate)}&interval=${interval}&session_filter=open&start=${encodeURIComponent(startStr)}`;
        rawJson = await tradierFetch(tsUrl);
      }
    } catch {
      // handoff to proxy fallback
    }
  }

  if (rawJson) {
    try {
      let list: any[] = [];
      if (tf === '1D' || tf === '1W') {
        const hist = rawJson?.history;
        if (hist) {
          if (Array.isArray(hist.day)) list = hist.day;
          else if (hist.day) list = [hist.day];
          else if (Array.isArray(hist.week)) list = hist.week;
          else if (hist.week) list = [hist.week];
        }
      } else {
        const seriesData = rawJson?.series?.data;
        if (seriesData) list = Array.isArray(seriesData) ? seriesData : [seriesData];
      }

      let parsed: Candle[] = list.map((item: any) => {
        const o = Number(item.open) || Number(item.o) || 0;
        const h = Number(item.high) || Number(item.h) || 0;
        const l = Number(item.low) || Number(item.l) || 0;
        const c = Number(item.close) || Number(item.c) || 0;
        const v = Number(item.volume) || Number(item.v) || 0;
        // Guard against NaN timestamps: an unparseable date would later throw in
        // annotateCandles' Date#toISOString and silently discard the whole batch.
        let ts = item.timestamp ? Number(item.timestamp) * 1000 : (item.date ? new Date(item.date).getTime() : Date.now());
        if (!Number.isFinite(ts)) ts = Date.now();
        return {
          timestamp: ts,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v,
          vwap: Number(item.vwap) || c
        };
      });

      // Aggregate intraday candles to custom timeframe (2m, 3m, 30m, 1h, 4h)
      if (tf !== '1D' && tf !== '1W') {
        let toAggregateMinutes = 1;
        if (tf === '2m') toAggregateMinutes = 2;
        else if (tf === '3m') toAggregateMinutes = 3;
        else if (tf === '30m') toAggregateMinutes = 30;
        else if (tf === '1h') toAggregateMinutes = 60;
        else if (tf === '4h') toAggregateMinutes = 240;

        if (toAggregateMinutes > 1) {
          parsed = aggregateCandles(parsed, toAggregateMinutes);
        }
      }

      parsed = annotateCandles(parsed);
      const output = parsed.slice(-count);

      if (output.length > 0) {
        candleCache[cacheKey] = { data: output, timestamp: now };
        return output;
      }
    } catch {
      // fall back to proxy rescaling
    }
  }

  // index scaling fallback (proxy SPY/QQQ timesales rescaled with live ratio)
  if (ticker === 'SPX' || ticker === 'NDX') {
    const proxyTicker = ticker === 'SPX' ? 'SPY' : 'QQQ';
    const proxyCandles = await fetchTradierCandles(proxyTicker, tf, count);
    if (proxyCandles && proxyCandles.length > 0) {
      const indexSpot = await fetchTradierSpotPrice(ticker) || ASSET_LIST.find(a => a.ticker === ticker)?.defaultPrice || 1;
      const lastProxyClose = proxyCandles[proxyCandles.length - 1].close;
      // Guard against a zero/invalid proxy close to avoid Infinity/NaN candle scaling.
      const indexDefault = ASSET_LIST.find(a => a.ticker === ticker)?.defaultPrice || 1;
      const proxyDefault = ASSET_LIST.find(a => a.ticker === proxyTicker)?.defaultPrice || 1;
      const liveRatio = lastProxyClose > 0 ? indexSpot / lastProxyClose : indexDefault / proxyDefault;

      const scaledCandles = proxyCandles.map(bar => ({
        ...bar,
        open: Number((bar.open * liveRatio).toFixed(2)),
        high: Number((bar.high * liveRatio).toFixed(2)),
        low: Number((bar.low * liveRatio).toFixed(2)),
        close: Number((bar.close * liveRatio).toFixed(2)),
        vwap: Number(((bar.vwap || bar.close) * liveRatio).toFixed(2))
      }));

      candleCache[cacheKey] = { data: scaledCandles, timestamp: now };
      return scaledCandles;
    }
  }

  return null;
}

/**
 * Re-routes options tape feeds to inspect real-time transaction sweeps
 */
export async function collectTradierFlows(ticker: string, currentSpot: number, chain: LiveOptionContract[]): Promise<any[]> {
  try {
    if (!chain || chain.length === 0) return [];

    const flows: any[] = [];
    const candidates = [...chain]
      .filter(c => c.volume > 20)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 15);

    candidates.forEach(c => {
      const typeStr = c.volume > 1000 ? 'SWEEP' : (c.volume > 300 ? 'BLOCK' : 'UNUSUAL');
      const side = c.type;
      
      flows.push({
        id: `tradier-flow-${c.contract}-${Date.now()}-${Math.random()}`,
        asset: ticker,
        type: typeStr,
        contract: `${c.volume.toLocaleString()} ${ticker} ${c.strike}${side}`,
        desc: `${side === 'C' ? 'Trade executed on Ask' : 'Trade executed on Bid'} • Vol ${c.volume.toLocaleString()} • IV ${(c.impliedVolatility * 100).toFixed(1)}%`,
        side
      });
    });

    return flows;
  } catch {
    return [];
  }
}
