/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared in-memory server state: the simulated/live market DB, the SSE client
 * registries, and the connection-pool record shapes. Imported by the market
 * engine and the route handlers.
 */
import { Candle, V8TradeRecord, GexExpirySlice } from '../types';
import { INITIAL_DISCOVERY_CONTRACTS, buildInitialDiscoveryFeedLogs } from '../data';

export interface ServerDb {
  candles: Record<string, Candle[]>; // key like "SPX-5m" => Candle[]
  v8Trades: V8TradeRecord[];
  globalFlowFeed: any[];
  liveSpotPrices: Record<string, number>;
  liveOptionChains: Record<string, any[]>;
  // Per-ticker multi-expiry gamma columns for the full matrix. Populated ONLY when
  // SLAYER_MULTI_EXPIRY is enabled (it adds OPRA cost — N× the chain fetch), so it is
  // empty by default and the matrix falls back to the single front-expiry heatmap.
  gexExpiries: Record<string, GexExpirySlice[]>;
  // Per-ticker source of the CURRENTLY-cached option chain (from
  // getUnifiedOptionChain().source). A single global dataSource can't be honest when
  // ThetaData powers one ticker's chain while Tradier/Polygon power another — this
  // lets feedLabel read the real provider per chain (e.g. THETADATA_LIVE).
  chainSource: Record<string, string>;
  dataSource:
    | 'THETADATA_LIVE'
    | 'TRADIER_POLYGON_COMPLEMENTARY'
    | 'POLYGON_LIVE'
    | 'TRADIER_LIVE'
    | 'SANDBOX_SYNTHETIC';
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
  gexExpiries: {},
  chainSource: {},
  dataSource: 'SANDBOX_SYNTHETIC',
  apiStatusMessage: 'Offline Sandbox Simulation Running',
  discoveryContracts: JSON.parse(JSON.stringify(INITIAL_DISCOVERY_CONTRACTS)),
  discoveryFeedLogs: buildInitialDiscoveryFeedLogs(),
  discoveryBrierScore: 0.042,
  discoveryGlobalGex: 485.4,
  discoveryScanRate: 14.8,
  discoveryLastFlashingId: null,
  discoveryFlashDirection: 'up',
  // Trade ledger starts empty. Records are appended only when the engine logs a
  // real executed trade (see POST /api/trades). We intentionally ship NO seeded
  // example trades here — a hardcoded archive would surface in the public
  // "Trade Record" / "Trust Ledger" as a fabricated track record (and a fake
  // 100% win rate). The live record begins at launch.
  v8Trades: []
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
  /** Numeric access level (0 guest … 5 lifetime) used to gate premium payload blocks. */
  tier?: number;
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
