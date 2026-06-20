/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared in-memory server state: the simulated/live market DB, the SSE client
 * registries, and the connection-pool record shapes. Imported by the market
 * engine and the route handlers.
 */
import { Candle, V8TradeRecord } from '../types';
import { INITIAL_DISCOVERY_CONTRACTS, buildInitialDiscoveryFeedLogs } from '../data';

export interface ServerDb {
  candles: Record<string, Candle[]>; // key like "SPX-5m" => Candle[]
  v8Trades: V8TradeRecord[];
  globalFlowFeed: any[];
  liveSpotPrices: Record<string, number>;
  liveOptionChains: Record<string, any[]>;
  dataSource: 'POLYGON_LIVE' | 'TRADIER_LIVE' | 'SANDBOX_SYNTHETIC';
  apiStatusMessage: string;
  discoveryContracts: any[];
  discoveryFeedLogs: any[];
  discoveryBrierScore: number;
  discoveryGlobalGex: number;
  discoveryScanRate: number;
  discoveryLastFlashingId: string | null;
  discoveryFlashDirection: 'up' | 'down';
}

export const db: ServerDb = {
  candles: {},
  globalFlowFeed: [],
  liveSpotPrices: {},
  liveOptionChains: {},
  dataSource: 'SANDBOX_SYNTHETIC',
  apiStatusMessage: 'Offline Sandbox Simulation Running',
  discoveryContracts: JSON.parse(JSON.stringify(INITIAL_DISCOVERY_CONTRACTS)),
  discoveryFeedLogs: buildInitialDiscoveryFeedLogs(),
  discoveryBrierScore: 0.042,
  discoveryGlobalGex: 485.4,
  discoveryScanRate: 14.8,
  discoveryLastFlashingId: null,
  discoveryFlashDirection: 'up',
  v8Trades: [
    {
      id: 'v8-trade-1',
      timestamp: '2026-06-08 10:25',
      underlying: 'SPX',
      contract: 'SPX 7650C',
      direction: 'BULLISH',
      entryPrice: 4.20,
      underlyingPrice: 7623.00,
      iv: 14.8,
      greeks: { delta: 0.58, gamma: 0.08, theta: -1.2, vega: 0.15 },
      vwapState: 'Above VWAP Alignment',
      rsiState: 'Oversold RSI Cascade Bullish Divergence Anchor',
      structureState: 'Break of Structure (BOS)',
      rvolState: 'High RVOL Support',
      gexState: 'High Put Wall Support',
      dealerPositioning: 'Dealer Short Gamma Hedging',
      expectedReturn: 88,
      expectedDrawdown: 18,
      probabilityPositive: 88,
      thesisStability: 91,
      recommendation: 'HOLD', // strictly mapped to 4 states
      target1: 5.60,
      target2: 7.20,
      target3: 9.50,
      stretchTarget: 14.00,
      stopLoss: 3.10,
      target1Hit: true,
      target2Hit: true,
      target3Hit: false,
      stretchTargetHit: false,
      target1HitTime: 11,
      target2HitTime: 24,
      target3HitTime: null,
      stretchTargetHitTime: null,
      maxGain: 71.4,
      maxDrawdown: 6.5,
      timeTaken: 34,
      whatTargetReachedFirst: 'Target 1',
      finalOutcome: 'Target 2 Winner',
      failureReasons: []
    },
    {
      id: 'v8-trade-2',
      timestamp: '2026-06-08 09:40',
      underlying: 'NDX',
      contract: 'NDX 18200P',
      direction: 'BEARISH',
      entryPrice: 85.00,
      underlyingPrice: 18250.00,
      iv: 18.2,
      greeks: { delta: -0.48, gamma: 0.05, theta: -1.8, vega: 0.22 },
      vwapState: 'Below VWAP Crossing',
      rsiState: 'RSI Bearish Momentum Expansion',
      structureState: 'Change of Character (CHoCH)',
      rvolState: 'High RVOL Support',
      gexState: 'Net Negative GEX Pressure',
      dealerPositioning: 'Dealer Short Gamma Hedging',
      expectedReturn: 75,
      expectedDrawdown: 25,
      probabilityPositive: 75,
      thesisStability: 82,
      recommendation: 'HOLD', // strictly mapped to 4 states
      target1: 110.00,
      target2: 145.00,
      target3: 180.00,
      stretchTarget: 250.00,
      stopLoss: 60.00,
      target1Hit: true,
      target2Hit: false,
      target3Hit: false,
      stretchTargetHit: false,
      target1HitTime: 18,
      target2HitTime: null,
      target3HitTime: null,
      stretchTargetHitTime: null,
      maxGain: 29.4,
      maxDrawdown: 14.2,
      timeTaken: 45,
      whatTargetReachedFirst: 'Target 1',
      finalOutcome: 'Target 1 Winner',
      failureReasons: []
    }
  ]
};

export interface SSEClient {
  id: number;
  res: any;
  params: {
    asset: string;
    timeframe: string;
    isCall: boolean;
    strike: number | null;
    positionOpen: boolean;
  };
  userEmail?: string;
  ip?: string;
}

export interface SSEDiscoveryClient {
  id: number;
  res: any;
  userEmail?: string;
}

// SSE client registries. A holder object (rather than reassigned `let`s) so
// route modules can replace the arrays via `sse.clients = sse.clients.filter(...)`.
export const sse = {
  clients: [] as SSEClient[],
  discoveryClients: [] as SSEDiscoveryClient[],
};
