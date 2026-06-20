import { AssetInfo, TimeframeVal, Candle } from '../types';
import { ASSET_LIST } from '../data';
import { isPolygonConfigured, fetchLiveSpotPrice, fetchLiveOptionChain, collectLiveFlows, LiveOptionContract } from './marketDataProvider';
import { isTradierConfigured, fetchTradierSpotPrice, fetchTradierOptionChain, collectTradierFlows, fetchTradierCandles } from './tradierProvider';

export function isTradierActive(): boolean {
  return isTradierConfigured();
}

export function isPolygonActive(): boolean {
  return isPolygonConfigured();
}

/**
 * Returns unified classification of active vendor streams
 */
export function getDataSourceType(): 'TRADIER_POLYGON_COMPLEMENTARY' | 'TRADIER_LIVE' | 'POLYGON_LIVE' | 'SANDBOX_SYNTHETIC' {
  const t = isTradierActive();
  const p = isPolygonActive();
  if (t && p) {
    return 'TRADIER_POLYGON_COMPLEMENTARY';
  }
  if (t) {
    return 'TRADIER_LIVE';
  }
  if (p) {
    return 'POLYGON_LIVE';
  }
  return 'SANDBOX_SYNTHETIC';
}

export function getProviderStatusMessage(): string {
  const type = getDataSourceType();
  if (type === 'TRADIER_POLYGON_COMPLEMENTARY') {
    return 'Complementary Vendors: Polygon (Index Spot) + Tradier (Premium Options)';
  }
  if (type === 'TRADIER_LIVE') {
    return 'Live Tradier API Active (OPRA real-time)';
  }
  if (type === 'POLYGON_LIVE') {
    return 'Live Polygon.io API Active';
  }
  return 'Offline Sandbox Simulation Running';
}

/**
 * Normalizes fetching spot price.
 * TRADIER FIRST as requested by the user.
 */
export async function getUnifiedSpotPrice(ticker: string, defaultPrice: number): Promise<{ price: number; source: string }> {
  if (isTradierActive()) {
    const price = await fetchTradierSpotPrice(ticker);
    if (price !== null) {
      return { price, source: 'TRADIER_LIVE' };
    }
  }

  if (isPolygonActive()) {
    const res = await fetchLiveSpotPrice(ticker, defaultPrice);
    if (res.source === 'POLYGON_LIVE') {
      return { price: res.price, source: 'POLYGON_LIVE' };
    }
  }

  return { price: defaultPrice, source: 'SANDBOX_SYNTHETIC' };
}

/**
 * NEW — real history; returns null rather than pretending:
 */
export async function getUnifiedCandles(ticker: string, tf: TimeframeVal, count = 120): Promise<{ candles: Candle[]; source: 'TRADIER_LIVE' } | null> {
  if (isTradierActive()) {
    const candles = await fetchTradierCandles(ticker, tf, count);
    if (candles && candles.length > 0) {
      return { candles, source: 'TRADIER_LIVE' as const };
    }
  }
  return null;
}

/**
 * Normalizes option chain compilation.
 */
export async function getUnifiedOptionChain(asset: AssetInfo, spotPrice: number): Promise<{ contracts: LiveOptionContract[]; source: string; message?: string }> {
  if (isTradierActive()) {
    const chainRes = await fetchTradierOptionChain(asset, spotPrice);
    if (chainRes && chainRes.contracts && chainRes.contracts.length > 0) {
      return {
        contracts: chainRes.contracts,
        source: 'TRADIER_LIVE',
        message: chainRes.message
      };
    }
  }

  if (isPolygonActive()) {
    const chainRes = await fetchLiveOptionChain(asset, spotPrice);
    if (chainRes && chainRes.contracts && chainRes.contracts.length > 0) {
      return {
        contracts: chainRes.contracts,
        source: 'POLYGON_LIVE',
        message: chainRes.message
      };
    }
  }

  return { contracts: [], source: 'SANDBOX_SYNTHETIC' };
}

/**
 * Normalizes flows collection
 */
export async function collectUnifiedFlows(ticker: string, spotPrice: number, contracts: LiveOptionContract[]): Promise<any[]> {
  const flows: any[] = [];

  if (isTradierActive() && contracts.length > 0) {
    const tFlows = await collectTradierFlows(ticker, spotPrice, contracts);
    if (tFlows && tFlows.length > 0) {
      flows.push(...tFlows);
    }
  }

  if (isPolygonActive() && (!isTradierActive() || flows.length === 0)) {
    const pFlows = await collectLiveFlows(ticker, spotPrice);
    if (pFlows && pFlows.length > 0) {
      flows.push(...pFlows);
    }
  }

  return flows;
}
