/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Market engine: bootstraps candles, runs the 1s ticker (live providers or the
 * synthetic sandbox walk), and assembles the Universal SSE payload. Importing
 * this module starts the ticker and seeds candles. No external API key required.
 */
import { ASSET_LIST, generateInitialCandles, TIMEFRAMES, calculateFVGs, calculateLiquidityEvents, optionExpiryLabel, optionExpiryDate, optionDteDays, hoursToSessionClose, synthesizeExpirySlices } from '../data';
import {
  calculateSystemScoreFromCandles,
  calculateV11Metrics,
  computeDealerInventory,
  generateMockOptionsChain,
  calculateAnalyticGreeks,
  ChainContract,
} from '../lib/v11Math';
import { Candle, V8TradeRecord, AssetInfo, TimeframeVal } from '../types';
import {
  getDataSourceType,
  getProviderStatusMessage,
  getUnifiedSpotPrice,
  getUnifiedOptionChain,
  collectUnifiedFlows,
  getUnifiedCandles,
} from '../lib/providerAbstraction';
import { fetchThetaExpirySlices, isThetaConfigured } from '../lib/thetaDataProvider';
import { buildGexProfile, computeDealerFlowGauge } from '../lib/gexEngine';
import { computeAssetEdge, computeContractEdge, type AssetEdge, type EdgeHistory } from '../lib/quantEdge';
import { computeStrikeGravity } from '../lib/strikeGravity';
import { computeDealerDynamics, type DealerSnapshot, type DealerDynamics } from '../lib/dealerDynamics';
import { buildGexSummary, type GexSummaryInput } from '../lib/gexSummary';
import { compute0DTE } from '../lib/zeroDte';
import { buildTradePlan } from '../lib/tradePlan';
import { tickSkyVision, getSkyVision } from './skyVisionService';
import { computeTechnicalRead } from '../lib/technicalEngine';
import { pcaResidualZScores } from '../lib/crossAsset';
import { marketLeader } from '../lib/infoTheory';
import { analyzeMarketStructure } from '../lib/displacementEngine';
import { getLastTradierError } from '../lib/tradierProvider';
import { sanitizeChain } from '../lib/dataIntegrity';
import { db, sse } from './state';
import { updateRedisPresence } from './auth';
import { dbLoadCalibrationPairs } from '../db';

// Initialize in-memory candles on bootstrap for all assets + timeframe parameters
// Max candles retained per TICKER-TIMEFRAME series. 500 lets the chart's range selector
// show a true ~1Y on daily / multi-year on weekly (was 200 ≈ 9.6 months on daily).
const CANDLE_BUFFER = 500;
const initializeCandles = () => {
  for (const asset of ASSET_LIST) {
    for (const tf of TIMEFRAMES) {
      const key = `${asset.ticker}-${tf.val}`;
      db.candles[key] = generateInitialCandles(asset, tf.val, CANDLE_BUFFER);
    }
  }
};
initializeCandles();

// Self-learning calibration history: real (prediction, outcome) pairs from the durable
// store, cached off the hot path (calculateV11Metrics runs per-contract per tick and must
// stay synchronous). Empty until labeled outcomes exist — calibration then stays dormant
// via its < 200-sample cold-start guard, so scoring is unchanged until real history
// accrues. Refreshed on boot and every 5 minutes; no-op without SQL_HOST.
let calibrationHistoryCache: { pred: number; win: number }[] = [];
async function refreshCalibrationHistory() {
  try {
    const pairs = await dbLoadCalibrationPairs(undefined, 5000);
    calibrationHistoryCache = pairs.map(p => ({ pred: p.prob, win: p.win ? 1 : 0 }));
  } catch (e) {
    console.error('[learn] refreshCalibrationHistory failed:', e);
  }
}
refreshCalibrationHistory();
const _calibTimer = setInterval(refreshCalibrationHistory, 5 * 60 * 1000);
if (typeof _calibTimer.unref === 'function') _calibTimer.unref();

// Verbose per-key logging is opt-in (SLAYER_DEBUG=1). The seed loop runs over every asset × every
// timeframe, so the per-key line below is ~ASSET_LIST × TIMEFRAMES (hundreds) of lines on each boot —
// noise in production. The one-line summary and any warnings still print unconditionally.
const VERBOSE_SEED = process.env.SLAYER_DEBUG === '1';

// Real candle seeding via background thread on startup
const seedHistoricalCandles = async () => {
  console.log('[SkyVision] Seeding historical candles from live sources...');
  let seeded = 0;
  for (const asset of ASSET_LIST) {
    for (const tf of TIMEFRAMES) {
      const key = `${asset.ticker}-${tf.val}`;
      try {
        const candleRes = await getUnifiedCandles(asset.ticker, tf.val as TimeframeVal, 120);
        if (candleRes && candleRes.candles && candleRes.candles.length > 0) {
          db.candles[key] = candleRes.candles;
          seeded++;
          if (VERBOSE_SEED) console.log(`[SkyVision] Seeded ${candleRes.candles.length} candles for ${key} from ${candleRes.source}`);
        }
      } catch (err) {
        console.warn(`[SkyVision] Volatile history backfill skipped/failed for ${key}:`, err);
      }
    }
  }
  console.log(`[SkyVision] Seeded historical candles for ${seeded} streams.`);
};
seedHistoricalCandles();

// Tracking map for adapting historical candles to live spot quote on initial cycle
const bootstrappedAssets: Record<string, boolean> = {};

let sandboxTimeShift = 0; // Accelerates time in sandbox mode
const sandboxMomentum: Record<string, number> = {}; // per-asset AR(1) momentum for the synthetic walk

// ---------------------------------------------------------------------------
// FETCH SCHEDULING (rate-limit control)
//
// The universe grew 20 → 100+ assets. Fetching a spot + a ~4-request option-chain
// chain for every asset on every 1s tick issued ~500 provider HTTP req/s and blew
// the rate limit. Instead we round-robin: ASSET_LIST is split into NUM_BUCKETS
// buckets and only ONE bucket is fetched per tick (each asset refreshes ~every
// NUM_BUCKETS seconds), UNION the set of currently-subscribed tickers (the asset
// each SSE client is actually viewing) so the user's selected ticker stays
// real-time. Fetches run with bounded concurrency rather than a serial await, and
// the SSE broadcast cadence stays at 1s off cached db state (decoupled from fetch).
// ---------------------------------------------------------------------------
const NUM_BUCKETS = 10;
const FETCH_CONCURRENCY = 5;
let bucketCursor = 0;

/** Bounded-concurrency map: run `worker` over `items`, at most `limit` in flight. */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const runners: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    while (idx < items.length) {
      const i = idx++;
      try { await worker(items[i]); } catch { /* never let one asset break the batch */ }
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i++) runners.push(next());
  await Promise.all(runners);
}

/** Tickers currently selected by at least one connected SSE client. */
function subscribedTickers(): Set<string> {
  const s = new Set<string>();
  for (const c of sse.clients) {
    if (c.params && c.params.asset) s.add(c.params.asset);
  }
  return s;
}

/**
 * The assets to FETCH this tick: the current round-robin bucket UNION every
 * subscribed ticker (so a viewer's ticker refreshes every second regardless of
 * which bucket it falls in). Returns the AssetInfo objects.
 */
function assetsToFetchThisTick(): AssetInfo[] {
  const subscribed = subscribedTickers();
  const bucket = bucketCursor;
  bucketCursor = (bucketCursor + 1) % NUM_BUCKETS;
  const picked: AssetInfo[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ASSET_LIST.length; i++) {
    const a = ASSET_LIST[i];
    if (i % NUM_BUCKETS === bucket || subscribed.has(a.ticker)) {
      if (!seen.has(a.ticker)) { seen.add(a.ticker); picked.push(a); }
    }
  }
  return picked;
}

// ---------------------------------------------------------------------------
// LIVE FLOW DEDUP
//
// collectUnifiedFlows ranks the heaviest contracts and re-emits the SAME top-N
// every tick, so the global flow feed filled with duplicate "sweeps" that never
// actually traded again. Dedup on a stable content key (ticker|strike|type) and
// only emit a flow when that contract's reported volume INCREASED vs the last time
// we saw it (i.e. real new prints). Stamp each emitted flow with a timestamp and
// drop stale entries from the feed so it's a rolling window, not an ever-growing
// pile of the same names.
// ---------------------------------------------------------------------------
const lastFlowVolume: Record<string, number> = {}; // key -> last observed volume
const FLOW_MAX_AGE_MS = 5 * 60 * 1000; // drop flows older than 5 minutes
function flowKey(ticker: string, strike: any, type: any): string {
  return `${ticker}|${strike}|${String(type).toUpperCase()}`;
}
function ingestLiveFlows(ticker: string, flows: any[]): void {
  const now = Date.now();
  const fresh: any[] = [];
  for (const f of flows) {
    const strike = f.strike ?? f.contract;
    const type = f.type === 'C' || f.type === 'P' ? f.type : (f.side ?? f.type);
    const key = flowKey(ticker, strike, type);
    const vol = Number(f.size ?? f.volume ?? 0) || 0;
    const prev = lastFlowVolume[key];
    // Emit only when volume actually grew (new prints) or this contract is brand-new.
    if (prev === undefined || vol > prev) {
      lastFlowVolume[key] = vol;
      fresh.push({ ...f, dedupKey: key, timestamp: f.timestamp ?? now });
    } else {
      lastFlowVolume[key] = vol;
    }
  }
  if (fresh.length === 0) return;
  // Prepend the genuinely-new flows, drop any prior entry sharing a dedupKey so the
  // newest print for a contract replaces the older one, then prune by age + cap.
  const freshKeys = new Set(fresh.map((f) => f.dedupKey));
  const retained = db.globalFlowFeed.filter(
    (f: any) => !(f.dedupKey && freshKeys.has(f.dedupKey)) && (now - (f.timestamp || now) <= FLOW_MAX_AGE_MS),
  );
  db.globalFlowFeed = [...fresh, ...retained].slice(0, 50);
}

// ---- Quant "edge" analytics cache (RND / VRP / skew / dealer clock) ----
// Computed once per asset per tick and reused across all SSE clients (cheap
// broadcast) rather than recomputed per client inside constructPayload.
const RND_DTE_DAYS = 5;
const edgeCache: Record<string, AssetEdge> = {};
const edgeHistory: Record<string, EdgeHistory> = {};
// The exact ChainContract[] the edge engine computed on this tick, cached per
// asset so the SSE broadcast can ship the SAME inputs to the client Quant Lab —
// guaranteeing the Lab's RND/greeks/skew match the server's numbers. Real chain
// when API keys are connected, high-fidelity mock when keyless.
const chainCache: Record<string, ChainContract[]> = {};
// Rolling per-asset dealer snapshots (one per tick) + the latest computed dynamics.
const dealerDynHistory: Record<string, DealerSnapshot[]> = {};
const dealerDynCache: Record<string, DealerDynamics> = {};

// Plain-English GEX read, cached per ticker and refreshed on the wall-clock
// half-hour (:00 / :30) so every viewer sees the same read with a synced countdown.
const gexSummaryCache: Record<string, { text: string; generatedAt: number; nextRefreshAt: number }> = {};
function nextHalfHourMark(now: number): number {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); // round up to the next :30 or :00
  return d.getTime();
}
function refreshGexSummary(ticker: string, input: GexSummaryInput) {
  const now = Date.now();
  const cached = gexSummaryCache[ticker];
  if (!cached || now >= cached.nextRefreshAt) {
    gexSummaryCache[ticker] = { text: buildGexSummary(input), generatedAt: now, nextRefreshAt: nextHalfHourMark(now) };
  }
  return gexSummaryCache[ticker];
}

/**
 * Contract-quality sub-score (0..100) for the ATM±1 strike in the trade direction:
 * blends spread tightness (40%), open-interest depth (30%) and delta sweet-spot
 * (30% — ~0.45Δ is the directional 0DTE sweet spot). The "Contract Selection" layer.
 */
function computeContractScore(chain: ChainContract[], spot: number, step: number, isCall: boolean): number {
  if (!chain || chain.length === 0) return 50;
  const atm = Math.round(spot / step) * step;
  const targetStrike = isCall ? atm + step : atm - step;
  const type = isCall ? 'call' : 'put';
  const c = chain.find((x) => x.strike === targetStrike && x.type === type)
    || chain.filter((x) => x.type === type).sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike))[0];
  if (!c) return 50;
  const maxOi = Math.max(...chain.map((x) => x.openInterest || 0)) || 1;
  const mid = ((c.bid || 0) + (c.ask || 0)) / 2;
  const spreadQ = mid > 0 ? Math.max(0, 1 - (Math.max(0, (c.ask || 0) - (c.bid || 0)) / mid)) : 0.3;
  const oiQ = Math.min(1, (c.openInterest || 0) / maxOi);
  const deltaQ = Math.max(0, 1 - Math.abs(Math.abs(c.delta || 0) - 0.45) / 0.45);
  return Math.round(100 * (0.4 * spreadQ + 0.3 * oiQ + 0.3 * deltaQ));
}

/** Hours remaining until the 16:00 ET cash-equity close (full session if outside RTH).
 *  Canonical implementation lives in data.ts so optionDteDays and the GEX/zerodte
 *  paths share one clock. */
function getHoursToClose(now = new Date()): number {
  return hoursToSessionClose(now);
}

/**
 * Trim a (potentially huge, real) option chain to a window of the nearest N
 * strikes either side of spot before broadcasting. The client Quant Lab only
 * needs near-the-money strikes, and this keeps the SSE payload lean.
 */
function windowChainAroundSpot(chain: ChainContract[], spot: number, perSide = 24): ChainContract[] {
  if (!chain || chain.length === 0) return [];
  const strikes = Array.from(new Set(chain.map((c) => c.strike))).sort((a, b) => a - b);
  if (strikes.length <= perSide * 2) return chain;
  // Index of the strike closest to spot.
  let atmIdx = 0;
  let best = Infinity;
  for (let i = 0; i < strikes.length; i++) {
    const d = Math.abs(strikes[i] - spot);
    if (d < best) { best = d; atmIdx = i; }
  }
  const lo = strikes[Math.max(0, atmIdx - perSide)];
  const hi = strikes[Math.min(strikes.length - 1, atmIdx + perSide)];
  return chain.filter((c) => c.strike >= lo && c.strike <= hi);
}

function liveChainToContracts(live: any[], fallbackIv: number, spot?: number, dteDays?: number): ChainContract[] {
  const mapped = live.map((c: any) => {
    const type: 'call' | 'put' = (c.type === 'C' || c.type === 'call') ? 'call' : 'put';
    const strike = c.strike;
    const iv = c.impliedVolatility || c.iv || fallbackIv;
    let vanna = c.greeks?.vanna ?? c.vanna;
    let charm = c.greeks?.charm ?? c.charm;
    // Standard option feeds (Polygon/Tradier) return delta/gamma/theta/vega but
    // NOT vanna/charm. Left at 0 they silently collapse netVex/netCharm and the
    // Vanna/Charm dynamics engines to zero on live data (works on the mock chain,
    // dead on real). Derive them analytically from the same BSM inputs the feed
    // already provides whenever the feed omits them.
    if ((vanna == null || charm == null) && typeof spot === 'number' && typeof dteDays === 'number') {
      const g = calculateAnalyticGreeks(spot, strike, dteDays, iv, type === 'call');
      if (vanna == null) vanna = g.vanna;
      if (charm == null) charm = g.charm;
    }
    return {
      strike,
      type,
      openInterest: c.oi || c.openInterest || 0,
      iv,
      bid: c.bid || 0, ask: c.ask || 0,
      delta: c.greeks?.delta ?? c.delta ?? 0,
      gamma: c.greeks?.gamma ?? c.gamma ?? 0,
      vega: c.greeks?.vega ?? c.vega ?? 0,
      theta: c.greeks?.theta ?? c.theta ?? 0,
      vanna: vanna ?? 0,
      charm: charm ?? 0,
      volume: c.volume ?? c.vol ?? c.day?.volume ?? 0,
    };
  });
  // Drop clearly-corrupt provider rows (negative OI, crossed book, NaN / out-of-bounds greeks)
  // before they aggregate into a GEX wall that never existed. Log the count for ops visibility.
  const { clean, invalidCount } = sanitizeChain(mapped);
  if (invalidCount > 0) console.warn(`[Chain Integrity] dropped ${invalidCount}/${mapped.length} invalid contracts from live chain`);
  return clean;
}

// Cross-asset analytics are O(n²) (transfer-entropy market leader + PCA residuals).
// They were running over all 100+ assets every 1s — quadratic CPU that saturates the
// event loop. Cap them to the liquid index/ETF complex (the first slice of ASSET_LIST,
// which is ordered indices/ETFs → single names) and recompute on a SLOW cadence,
// reusing the cached result between recomputes.
const CROSS_ASSET_SUBSET_SIZE = 20;
const CROSS_ASSET_REFRESH_MS = 25000; // ~25s
let lastCrossAssetAt = 0;

function refreshEdgeCache(assets: AssetInfo[] = ASSET_LIST) {
  for (const asset of assets) {
    try {
      const spot = db.liveSpotPrices[asset.ticker] || asset.defaultPrice;
      const live = db.liveOptionChains[asset.ticker];
      const dteDays = optionDteDays(asset);
      const chain: ChainContract[] = (live && live.length > 0)
        ? liveChainToContracts(live, asset.volatility, spot, dteDays)
        : generateMockOptionsChain(spot, asset.volatility);
      chainCache[asset.ticker] = chain;
      const candles = db.candles[`${asset.ticker}-5m`] || [];
      const dealerInv = computeDealerInventory(chain, spot, 1, dteDays);
      if (!edgeHistory[asset.ticker]) edgeHistory[asset.ticker] = { rr: [], bf: [] };
      edgeCache[asset.ticker] = computeAssetEdge({
        chain, candles, spot, rndDteDays: RND_DTE_DAYS,
        netCharm: dealerInv.netCharm, netVanna: dealerInv.netVex,
        history: edgeHistory[asset.ticker],
        ticker: asset.ticker, flow: db.globalFlowFeed,
      });

      // Dealer Dynamics (Vanna/Charm trend, strike migration, gamma velocity,
      // liquidity vacuums, wall strength). Computed once per tick per asset so the
      // time-derivative history isn't corrupted by per-client SSE rebuilds.
      let netVanna = 0;
      for (const c of chain) {
        const sign = c.type === 'call' ? 1 : -1;
        netVanna += (c.vanna || 0) * (c.openInterest || 0) * 100 * spot * 0.01 * sign; // canonical vanna $-scaling (× S × 0.01)
      }
      if (!dealerDynHistory[asset.ticker]) dealerDynHistory[asset.ticker] = [];
      dealerDynCache[asset.ticker] = computeDealerDynamics(
        chain, spot,
        { netGex: dealerInv.netGex, netVanna, netCharm: dealerInv.netCharm },
        dealerDynHistory[asset.ticker],
      );
    } catch (e) {
      // Never let an edge-calc error break the tick.
    }
  }
  // Cross-asset passes (PCA stat-arb residuals + transfer-entropy lead→lag market
  // leader). These are O(n²); run them on a SLOW cadence over the LIQUID SUBSET only
  // (the first CROSS_ASSET_SUBSET_SIZE assets — the index/ETF complex), and reuse the
  // cached pca/leadLag between recomputes so every tick still ships a value.
  const now = Date.now();
  if (now - lastCrossAssetAt >= CROSS_ASSET_REFRESH_MS) {
    lastCrossAssetAt = now;
    try {
      const subset = ASSET_LIST.slice(0, CROSS_ASSET_SUBSET_SIZE);
      const series: Record<string, any[]> = {};
      for (const asset of subset) series[asset.ticker] = db.candles[`${asset.ticker}-5m`] || [];
      const pca = pcaResidualZScores(series);
      const lead = marketLeader(series);
      lastPca = pca;
      lastLeadLag = lead;
    } catch (e) {
      // Cross-asset failure must not break the tick.
    }
  }
  // Apply the (possibly cached) cross-asset results to every asset's edge block.
  if (lastLeadLag !== null) {
    for (const asset of ASSET_LIST) {
      if (!edgeCache[asset.ticker]) continue;
      edgeCache[asset.ticker].pca = lastPca[asset.ticker] || null;
      edgeCache[asset.ticker].leadLag = lastLeadLag;
    }
  }
}
// Cached cross-asset outputs reused between slow recomputes.
let lastPca: Record<string, any> = {};
let lastLeadLag: any = null;

// Simulation ticks run continuously server-side
const TICK_INTERVAL = 1000; // 1s for fast real-time telemetry but stable chart

// Re-entrancy guard: setInterval fires every TICK_INTERVAL, but a cycle awaits
// provider fetches that can take longer. Overlapping cycles would push two
// snapshots ~0ms apart into the rolling histories, so every time-derivative
// (gamma-velocity, vanna-trend, strike-migration, convexity) would divide by a
// near-zero dt and spike or flatline. Skip a fire while a cycle is still running.
let tickInFlight = false;
export async function runTickerCycle() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    await runTickerCycleInner();
  } finally {
    tickInFlight = false;
  }
}

// Central async ticker queue pulling real market feeds or simulation fallbacks
async function runTickerCycleInner() {
  try {
    const mode = getDataSourceType();
    db.dataSource = mode as any;
    db.apiStatusMessage = getProviderStatusMessage();
    const isSandbox = mode === 'SANDBOX_SYNTHETIC';

    if (isSandbox) {
       sandboxTimeShift += 5000; // Fast time in simulation (5s per 1s tick)
    } else if (sandboxTimeShift !== 0) {
       // A provider came online mid-session. The accelerated sandbox clock would
       // otherwise keep stamping LIVE candles with future timestamps — reset it the
       // moment we leave the synthetic sandbox so live bars use real wall-clock time.
       sandboxTimeShift = 0;
    }
    const currentTickTime = Date.now() + sandboxTimeShift;

    // Compute the per-tick working set ONCE (advances the round-robin cursor once):
    // the current bucket UNION the subscribed tickers. Used for both the network
    // fetch phase and the heavy per-asset analytics so they share one schedule.
    const scopedAssets = assetsToFetchThisTick();

    // 1a. NETWORK FETCH PHASE (rate-limit controlled): only the scoped assets, with
    // bounded concurrency. The candle/spot propagation below still runs for ALL
    // assets every tick off cached db state, so charts stay live while we throttle.
    if (!isSandbox) {
      await runWithConcurrency(scopedAssets, FETCH_CONCURRENCY, async (asset) => {
        const spotRes = await getUnifiedSpotPrice(asset.ticker, asset.defaultPrice);
        if (spotRes.source === 'SANDBOX_SYNTHETIC') {
          // This asset has no live source right now — leave its cached state alone.
          return;
        }
        const spotPrice = spotRes.price;
        db.liveSpotPrices[asset.ticker] = spotPrice;
        try {
          const chainRes = await getUnifiedOptionChain(asset, spotPrice);
          if (chainRes && chainRes.contracts && chainRes.contracts.length > 0) {
            db.liveOptionChains[asset.ticker] = chainRes.contracts;
            // Track the ACTUAL source of THIS chain so feedLabel can be honest about
            // ThetaData vs Tradier vs Polygon per ticker (a single db.dataSource label
            // mislabels e.g. ThetaData chains as LIVE_TRADIER).
            db.chainSource[asset.ticker] = chainRes.source;
            try {
              const liveFlows = await collectUnifiedFlows(asset.ticker, spotPrice, chainRes.contracts);
              if (liveFlows && liveFlows.length > 0) ingestLiveFlows(asset.ticker, liveFlows);
            } catch { /* safe */ }
            // Multi-expiry gamma columns (the full matrix) — OPT-IN: this fetches a
            // greeks+OI snapshot PER expiration, multiplying OPRA/request cost by the
            // expiry count, so it runs ONLY when SLAYER_MULTI_EXPIRY=1 AND ThetaData
            // powers this chain. Best-effort and isolated: a failure leaves the
            // single-expiry payload untouched.
            if (process.env.SLAYER_MULTI_EXPIRY === '1' && isThetaConfigured() && chainRes.source.startsWith('THETADATA')) {
              try {
                const maxExp = Math.max(2, Math.min(8, Number(process.env.SLAYER_MULTI_EXPIRY_MAX) || 5));
                const slices = await fetchThetaExpirySlices(asset, spotPrice, maxExp);
                if (slices.length) db.gexExpiries[asset.ticker] = slices;
              } catch { /* safe — keep single-expiry payload */ }
            }
          } else {
            db.liveOptionChains[asset.ticker] = [];
            db.chainSource[asset.ticker] = chainRes?.source || mode;
          }
        } catch {
          db.liveOptionChains[asset.ticker] = [];
        }
      });
    }

    // 1b. SPOT-UPDATE + CANDLE PROPAGATION for ALL assets every tick.
    for (const asset of ASSET_LIST) {
      let spotPrice: number;
      let spotIsLive: boolean;

      const cachedLive = db.liveSpotPrices[asset.ticker];
      if (!isSandbox && typeof cachedLive === 'number' && cachedLive > 0) {
        // Use the most-recent live spot (refreshed by the fetch phase on its bucket).
        spotPrice = cachedLive;
        spotIsLive = true;
      } else {
        // High-fidelity sandbox walk: persistent momentum (AR(1)) + light
        // mean-reversion to the anchor + occasional volatility bursts. This gives
        // the tape real trends, pullbacks and displacement candles instead of
        // i.i.d. white noise — and keeps price in a believable band over time.
        const prev5m = db.candles[`${asset.ticker}-5m`];
        const lastPrice = (prev5m && prev5m.length > 0) ? prev5m[prev5m.length - 1].close : asset.defaultPrice;
        const anchor = asset.defaultPrice;
        const baseRange = anchor * asset.volatility * 0.0012;
        const burst = Math.random() > 0.96 ? 2.5 + Math.random() * 2 : 1; // ~4% of ticks: displacement
        const prevMom = sandboxMomentum[asset.ticker] || 0;
        const reversion = (-(lastPrice - anchor) / anchor) * 0.04 * anchor; // pull back toward anchor
        const shock = (Math.random() - 0.5) * 2 * baseRange * burst;
        const mom = prevMom * 0.82 + shock + reversion;
        sandboxMomentum[asset.ticker] = mom * 0.6; // decay carried momentum
        spotPrice = Number((lastPrice + mom).toFixed(asset.decimals));
        db.liveSpotPrices[asset.ticker] = spotPrice;
        spotIsLive = false;

        // Generate synthetic flow trades
        if (Math.random() > 0.4) {
          const isCall = Math.random() > 0.5;
          const typeStr = Math.random() > 0.6 ? 'SWEEP' : (Math.random() > 0.5 ? 'BLOCK' : 'UNUSUAL');
          const step = asset.defaultPrice > 1000 ? 100 : asset.defaultPrice > 150 ? 5 : 1;
          const strk = Math.round(spotPrice / step) * step + (isCall ? step * Math.floor(Math.random() * 4) : -step * Math.floor(Math.random() * 4));

          // Keep premium internally consistent: premium ≈ contracts × per-contract
          // price × 100, where the per-contract price falls off as the strike goes
          // further OTM. (Previously contract count and premium were independent
          // randoms, so a 5,000-lot could show less premium than a 600-lot.)
          const contracts = Math.floor(300 + Math.random() * 4700);
          const otm = Math.abs(strk - spotPrice) / spotPrice;
          const perContract = Math.max(0.15, 1.8 - otm * 18 + (Math.random() - 0.5));
          const premiumM = (contracts * perContract * 100) / 1_000_000;
          const aggressive = Math.random();
          const sideDesc = aggressive > 0.7 ? 'Swept above ask'
            : aggressive > 0.4 ? (isCall ? 'Bought at ask' : 'Sold at bid')
              : 'Mid-market print';
          const newFlow = {
            id: `flow-${Date.now()}-${Math.random()}`,
            asset: asset.ticker,
            type: typeStr,
            contract: `${contracts.toLocaleString()} ${asset.ticker} ${strk}${isCall ? 'C' : 'P'}`,
            desc: `${sideDesc} • $${premiumM.toFixed(2)}M Premium`,
            side: isCall ? 'C' : 'P',
            timestamp: Date.now(),
          };
          db.globalFlowFeed.unshift(newFlow);
        }
      }

      // Adapt historical candles to first live spot price block (bootstrap backfill)
      if (spotIsLive && !bootstrappedAssets[asset.ticker]) {
        bootstrappedAssets[asset.ticker] = true;
        const ratio = spotPrice / asset.defaultPrice;
        for (const tf of TIMEFRAMES) {
          const key = `${asset.ticker}-${tf.val}`;
          const prev = db.candles[key];
          if (prev) {
            for (const candle of prev) {
              candle.open = Number((candle.open * ratio).toFixed(asset.decimals));
              candle.high = Number((candle.high * ratio).toFixed(asset.decimals));
              candle.low = Number((candle.low * ratio).toFixed(asset.decimals));
              candle.close = Number((candle.close * ratio).toFixed(asset.decimals));
            }
          }
        }
      }

      // Propagate spot price straight into timeframe candle streams with boundary rolling
      for (const tf of TIMEFRAMES) {
        const key = `${asset.ticker}-${tf.val}`;
        const prev = db.candles[key];
        if (!prev || prev.length === 0) continue;

        const M = tf.minMultiplier || 1;
        const currentBucket = Math.floor(currentTickTime / (M * 60000));
        const last = prev[prev.length - 1];
        const lastCandleBucket = Math.floor(last.timestamp / (M * 60000));

        if (currentBucket > lastCandleBucket) {
          // Timeframe boundary crossed! Push a new candle and shift window.
          // Seed an opening wick proportional to asset vol & timeframe so fresh
          // bars aren't wickless dojis, and scale volume by timeframe so a 1D bar
          // isn't the same size as a 1m bar. The triple max/min provably keeps the
          // OHLC invariant (high ≥ max(open,close), low ≤ min(open,close)).
          const wick = asset.defaultPrice * asset.volatility * 0.0006 * Math.sqrt(M);
          const seedHigh = Math.max(last.close, spotPrice) + Math.random() * wick;
          const seedLow = Math.min(last.close, spotPrice) - Math.random() * wick;
          const newCandle: Candle = {
            timestamp: currentBucket * M * 60000,
            open: last.close,
            high: Number(Math.max(seedHigh, last.close, spotPrice).toFixed(asset.decimals)),
            low: Number(Math.min(seedLow, last.close, spotPrice).toFixed(asset.decimals)),
            close: spotPrice,
            volume: Math.round((50 + Math.random() * 450) * Math.sqrt(M)),
          };
          prev.push(newCandle);
          if (prev.length > CANDLE_BUFFER) {
            prev.shift();
          }
        } else {
          // Update the current last active candle
          const updatedHigh = Number(Math.max(last.high, spotPrice).toFixed(asset.decimals));
          const updatedLow = Number(Math.min(last.low, spotPrice).toFixed(asset.decimals));
          prev[prev.length - 1] = {
            ...last,
            close: spotPrice,
            high: updatedHigh,
            low: updatedLow
          };
        }
      }
    }

    // Prune stale flows by age (rolling window) then cap.
    {
      const cutoff = Date.now() - FLOW_MAX_AGE_MS;
      db.globalFlowFeed = db.globalFlowFeed
        .filter((f: any) => !f.timestamp || f.timestamp >= cutoff)
        .slice(0, 50);
    }

    // Per-tick heavy analytics are scoped to `scopedAssets` (the round-robin bucket
    // UNION the subscribed tickers, computed once above). This folds the skyVision +
    // edge passes into the same round-robin/subscribed-only schedule so they aren't a
    // second full 100-asset loop per second. Non-scoped assets keep their last cached
    // block (the SSE broadcast still ships it).
    //
    // Refresh the per-asset edge analytics (RND / VRP / skew / dealer clock) for the
    // scoped assets; cross-asset (O(n²)) work inside is throttled + subset-capped.
    refreshEdgeCache(scopedAssets);

    // Sky Vision v2.0 contract-intelligence engine (per-contract strength, rotation
    // scanner, EMA target ladder, swing, master score) — cached per ticker.
    tickSkyVision(scopedAssets);

    // 2. Tick active trade logs outcomes
    db.v8Trades = db.v8Trades.map((t) => {
      if (t.finalOutcome !== 'Active') return t;

      const latestClose = db.liveSpotPrices[t.underlying] || ASSET_LIST.find(a => a.ticker === t.underlying)?.defaultPrice || t.underlyingPrice;
      const elapsedMinutes = t.timeTaken + 1;

      const isC = t.contract.endsWith('C');
      const priceChange = latestClose - t.underlyingPrice;
      const deltaMove = isC ? priceChange : -priceChange;
      const optionDiff = Math.abs(t.greeks.delta) * deltaMove;
      const thetaDecay = (t.greeks.theta / 390) * elapsedMinutes;
      const randomNoise = (Math.random() - 0.5) * 0.015 * t.entryPrice;

      const currentOptionPremium = Math.max(0.10, Number((t.entryPrice + optionDiff + thetaDecay + randomNoise).toFixed(2)));

      const trialGain = ((currentOptionPremium - t.entryPrice) / t.entryPrice) * 100;
      const newMaxGain = Number(Math.max(t.maxGain, trialGain).toFixed(1));

      const trialDrawdown = ((t.entryPrice - currentOptionPremium) / t.entryPrice) * 100;
      const newMaxDrawdown = Number(Math.max(t.maxDrawdown, trialDrawdown).toFixed(1));

      const t1Hit = t.target1Hit || currentOptionPremium >= t.target1;
      const t1HitTime = t.target1Hit ? t.target1HitTime : (currentOptionPremium >= t.target1 ? elapsedMinutes : null);

      const t2Hit = t.target2Hit || currentOptionPremium >= t.target2;
      const t2HitTime = t.target2Hit ? t.target2HitTime : (currentOptionPremium >= t.target2 ? elapsedMinutes : null);

      const t3Hit = t.target3Hit || currentOptionPremium >= t.target3;
      const t3HitTime = t.target3Hit ? t.target3HitTime : (currentOptionPremium >= t.target3 ? elapsedMinutes : null);

      const stretchHit = t.stretchTargetHit || currentOptionPremium >= t.stretchTarget;
      const stretchHitTime = t.stretchTargetHit ? t.stretchTargetHitTime : (currentOptionPremium >= t.stretchTarget ? elapsedMinutes : null);

      const stopHit = currentOptionPremium <= t.stopLoss;

      let outcome: 'Target 1 Winner' | 'Target 2 Winner' | 'Target 3 Winner' | 'Stretch Winner' | 'Failure' | 'Active' = 'Active';
      let whatTargetFirst = t.whatTargetReachedFirst;

      if (stopHit) {
        outcome = 'Failure';
        if (whatTargetFirst === 'None') whatTargetFirst = 'Stop Loss';
      } else if (stretchHit) {
        outcome = 'Stretch Winner';
        if (whatTargetFirst === 'None') whatTargetFirst = 'Stretch Target';
      } else if (t3Hit) {
        outcome = 'Target 3 Winner';
        if (whatTargetFirst === 'None') whatTargetFirst = 'Target 3';
      } else if (t2Hit) {
        outcome = 'Target 2 Winner';
        if (whatTargetFirst === 'None') whatTargetFirst = 'Target 2';
      } else if (t1Hit) {
        outcome = 'Target 1 Winner';
        if (whatTargetFirst === 'None') whatTargetFirst = 'Target 1';
      }

      let fails = [...t.failureReasons];
      if (outcome === 'Failure' && fails.length === 0) {
        fails.push('Theta decay premium erosion near local resistance zone');
      }

      const wasActive = t.finalOutcome === 'Active';
      const isClosedNow = outcome !== 'Active';
      const calculatedCloseTs = wasActive && isClosedNow
        ? new Date().toISOString().replace('T', ' ').substring(0, 16)
        : t.closeTs;

      return {
        ...t,
        maxGain: newMaxGain,
        maxDrawdown: newMaxDrawdown,
        timeTaken: elapsedMinutes,
        target1Hit: t1Hit,
        target1HitTime: t1HitTime,
        target2Hit: t2Hit,
        target2HitTime: t2HitTime,
        target3Hit: t3Hit,
        target3HitTime: t3HitTime,
        stretchTargetHit: stretchHit,
        stretchTargetHitTime: stretchHitTime,
        whatTargetReachedFirst: whatTargetFirst,
        finalOutcome: outcome,
        failureReasons: fails,
        closeTs: calculatedCloseTs,
        recommendation: isClosedNow ? 'EXIT' : 'HOLD'
      };
    });

    // 3. Broadcast to stream connects
    broadcastSSE();
    tickDiscoveryData();
    broadcastDiscoverySSE();
  } catch (err) {
    console.error(`[Central Ticker Sync Cycle Error]`, err);
  }
}

// Start central telemetry clock
setInterval(runTickerCycle, TICK_INTERVAL);

/**
 * Map a server access_tier string to its numeric level. Mirrors the client's
 * accessTierToNumber (src/lib/store.ts) so server-side data gating and client-side
 * tab gating agree exactly — keep the two in sync.
 */
export function accessTierToLevel(accessTier?: string | null): number {
  switch (accessTier) {
    case 'discord': return 1;
    case 'pinpoint':
    case 'quant': return 2;          // Pinpoint GEX (commodity dealer-GEX tool)
    case 'skyvision':
    case 'intraday':
    case 'enterprise': return 3;     // SkyVision flagship (trade picks + GEX + Quant Lab)
    case 'lifetime': return 5;
    default: return 0;
  }
}

/**
 * Minimum access level required to receive each premium payload block over the stream.
 * Value ladder: Pinpoint GEX (tier 2) is the commodity dealer-GEX tool; SkyVision
 * (tier 3) is the flagship that picks the trades and folds in the GEX tool + Quant Lab:
 *   • gex_profile / gex_summary / dealer_dynamics / dealer_flow / zerodte → Pinpoint GEX (tier 2)
 *   • sky_vision / trade_plan / strike_gravity            → SkyVision (tier 3)
 *   • quant_edge / option_chain (Quant Lab, merged in)     → SkyVision (tier 3)
 * Blocks NOT listed here (deep_intelligence, system_score, candles, discovery, …) are
 * free — they drive the public home tab and the always-on alert hub.
 */
const PREMIUM_BLOCK_TIERS: Record<string, number> = {
  gex_profile: 2,
  gex_summary: 2,
  dealer_dynamics: 2,
  dealer_flow: 2,
  zerodte: 2,
  sky_vision: 3,
  trade_plan: 3,
  strike_gravity: 3,
  quant_edge: 3,
  option_chain: 3,
};

/**
 * Strip premium blocks the viewer's tier doesn't reach (sets them to null so existing
 * client guards fall back to their "computing…" state). Mutates and returns `payload`
 * (a fresh per-call object from constructPayload, so this is safe). Tier 5 = full.
 */
export function gatePayloadByTier<T extends Record<string, any>>(payload: T, tier: number): T {
  if (tier >= 5) return payload;
  for (const block in PREMIUM_BLOCK_TIERS) {
    if (tier < PREMIUM_BLOCK_TIERS[block] && block in payload) {
      (payload as any)[block] = null;
    }
  }
  return payload;
}

// ---------------------------------------------------------------------------
// PER-TICK PAYLOAD MEMOIZATION
//
// constructPayload was rebuilt from scratch for EVERY connected client every tick,
// even though most clients cluster on the same (asset,timeframe,isCall,strike,
// positionOpen) — e.g. everyone on SPX/5m. Memoize the heavy build per param-key for
// the duration of one broadcast pass and reuse it across clients sharing that key.
// Each client still gets a fresh shallow-cloned top-level object so per-tier gating
// (which nulls blocks) can't corrupt another client's view.
// ---------------------------------------------------------------------------
const payloadMemo = new Map<string, ReturnType<typeof buildPayload>>();
function payloadKeyOf(p: { asset: string; timeframe: string; isCall: boolean; strike: number | null; positionOpen: boolean }): string {
  return `${p.asset}|${p.timeframe}|${p.isCall ? 1 : 0}|${p.strike ?? 'auto'}|${p.positionOpen ? 1 : 0}`;
}

// Per-asset market-structure read (pure function of 5m candles, isCall/strike
// independent) — cached for the duration of one broadcast pass so it's computed once
// per asset instead of once per client. Cleared alongside payloadMemo.
const structureReadMemo = new Map<string, ReturnType<typeof analyzeMarketStructure>>();
function getAssetStructureRead(ticker: string, candles5m: any[]): ReturnType<typeof analyzeMarketStructure> {
  let r = structureReadMemo.get(ticker);
  if (!r) {
    r = analyzeMarketStructure(candles5m);
    structureReadMemo.set(ticker, r);
  }
  return r;
}

// Debounce presence writes to ~45s/user instead of once per client per tick.
const REDIS_PRESENCE_DEBOUNCE_MS = 45000;
const lastPresenceAt: Record<string, number> = {};
function maybeUpdatePresence(email: string): void {
  const e = email.toLowerCase().trim();
  const now = Date.now();
  if (now - (lastPresenceAt[e] || 0) >= REDIS_PRESENCE_DEBOUNCE_MS) {
    lastPresenceAt[e] = now;
    updateRedisPresence(e);
  }
}

export const broadcastSSE = () => {
  payloadMemo.clear(); // fresh per-tick memo across all clients in this pass
  structureReadMemo.clear();
  for (const client of sse.clients) {
    if (client.userEmail) { maybeUpdatePresence(client.userEmail); }
    try {
      const payload = gatePayloadByTier(constructPayload(client.params), client.tier ?? 0);
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      console.error("Error writing SSE to client", client.id, e);
    }
  }
  payloadMemo.clear();
  structureReadMemo.clear();
};

export const broadcastDiscoverySSE = () => {
  const payload = {
    contracts: db.discoveryContracts,
    feedLogs: db.discoveryFeedLogs,
    brierScore: db.discoveryBrierScore,
    globalGex: db.discoveryGlobalGex,
    scanRate: db.discoveryScanRate,
    lastFlashingId: db.discoveryLastFlashingId,
    flashDirection: db.discoveryFlashDirection
  };
  for (const client of sse.discoveryClients) {
    if (client.userEmail) { maybeUpdatePresence(client.userEmail); }
    try {
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      console.error("Error writing Discovery SSE to client", client.id, e);
    }
  }
};

const tickDiscoveryData = () => {
  if (!db.discoveryContracts || db.discoveryContracts.length === 0) return;

  // 1. Choose a random contract to tick
  const randomIndex = Math.floor(Math.random() * db.discoveryContracts.length);
  const target = { ...db.discoveryContracts[randomIndex] };

  // Proportional price jitter (a $42 contract and a $0.35 contract shouldn't both
  // move by a few cents), with a mild drift biased by the tile's recommended action.
  const driftBias = target.action === 'ENTER' ? 0.0008
    : (target.action === 'SELL' || target.action === 'REDUCE') ? -0.0010 : 0;
  const pct = (Math.random() - 0.5) * 0.018 + driftBias;
  const priceChange = target.price * pct;
  target.price = Number(Math.max(0.10, target.price + priceChange).toFixed(2));
  target.bid = Number(Math.max(0.08, target.price * 0.985).toFixed(2));
  target.ask = Number(Math.max(0.11, target.price * 1.015).toFixed(2));

  // Keep the "% to first target" headline coherent with the live price.
  if (target.t1 && target.price > 0) {
    target.p1 = Math.round(((target.t1 - target.price) / target.price) * 100);
  }

  // Refresh greeks against the live spot so a ticking tile's delta/gamma move too.
  const tileSpot = db.liveSpotPrices[target.ticker];
  if (tileSpot && target.strike) {
    const g = calculateAnalyticGreeks(tileSpot, target.strike, target.isCall ? 2 : 5, 0.18, target.isCall);
    target.delta = Number(g.delta.toFixed(3));
    target.gamma = Number(g.gamma.toFixed(4));
    target.vega = Number(g.vega.toFixed(3));
    target.theta = Number(g.theta.toFixed(3));
  }

  // Jitter health score slightly [30, 99]
  const scoreChange = Math.random() > 0.5 ? 1 : -1;
  target.health = Math.max(30, Math.min(99, target.health + scoreChange));

  // Jitter volume
  target.volume += Math.floor(Math.random() * 8) + 1;

  db.discoveryContracts[randomIndex] = target;
  db.discoveryLastFlashingId = target.id;
  db.discoveryFlashDirection = priceChange >= 0 ? 'up' : 'down';

  // 2. Occasionally add to live flow feed log
  if (Math.random() > 0.4) {
    const randomSide = Math.random() > 0.5 ? 'Sweep' : 'Block';
    const randomAction = Math.random() > 0.6 ? 'SWEPT @ ASK' : Math.random() > 0.3 ? 'AT ASK' : 'ABOVE ASK';
    const sizeVal = Math.floor(Math.random() * 450) + 50;
    const premiumVal = sizeVal * target.price * 100;
    const now = new Date();
    const timeStr = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;

    const newLog = {
      timestamp: timeStr,
      ticker: target.ticker,
      strike: target.strike,
      type: target.isCall ? 'C' : 'P',
      side: randomSide,
      size: `${sizeVal.toLocaleString()} cons`,
      premium: `$${premiumVal >= 1000000 ? (premiumVal / 1000000).toFixed(2) + 'M' : premiumVal.toLocaleString()}`,
      tag: target.isCall ? 'BULLISH' : 'HEDGE',
      action: randomAction
    };

    db.discoveryFeedLogs = [newLog, ...db.discoveryFeedLogs.slice(0, 14)];
  }

  // 3. Slowly tick general cockpit statistics
  db.discoveryBrierScore = Number(Math.max(0.015, Math.min(0.080, db.discoveryBrierScore + (Math.random() * 0.002 - 0.001))).toFixed(4));
  // Mean-revert Global GEX within a believable band instead of trending upward
  // forever (the old +bias drift only had a lower bound).
  db.discoveryGlobalGex = Number(
    Math.max(120, Math.min(900, db.discoveryGlobalGex + (485 - db.discoveryGlobalGex) * 0.02 + (Math.random() - 0.5) * 6)).toFixed(1)
  );
  db.discoveryScanRate = Number(Math.max(5, Math.min(30, db.discoveryScanRate + (Math.random() * 1.2 - 0.6))).toFixed(1));
};

type PayloadParams = {
  asset: string;
  timeframe: string;
  isCall: boolean;
  strike: number | null;
  positionOpen: boolean;
};

/**
 * Memoizing entry point used by the SSE broadcast. Within a single broadcast pass
 * (payloadMemo is cleared at the start/end of broadcastSSE) the heavy buildPayload
 * work is computed once per param-key and reused across clients sharing that key. A
 * shallow clone is returned so per-client tier gating can't mutate the shared cache.
 */
export const constructPayload = (params: PayloadParams) => {
  const key = payloadKeyOf(params);
  let base = payloadMemo.get(key);
  if (!base) {
    base = buildPayload(params);
    payloadMemo.set(key, base);
  }
  // Shallow clone: cheap relative to the rebuild, and isolates gating mutations.
  return { ...base };
};

// Generates the server-assembled payload (The Universal Payload)
const buildPayload = (params: PayloadParams) => {
  const assetName = params.asset || 'SPX';
  const timeframe = params.timeframe || '5m';
  const isCall = params.isCall;
  const positionOpen = params.positionOpen;

  const asset = ASSET_LIST.find(a => a.ticker === assetName) || ASSET_LIST[0];
  const expLabel = optionExpiryLabel(asset); // '0DTE' for daily names, '{n}DTE' front-weekly for single stocks
  const candles = db.candles[`${asset.ticker}-${timeframe}`] || generateInitialCandles(asset, timeframe as TimeframeVal, CANDLE_BUFFER);
  const lastPrice = candles[candles.length - 1].close;

  const liveChain = db.liveOptionChains[asset.ticker] || null;
  const liveSpot = db.liveSpotPrices[asset.ticker] || lastPrice;

  // Option strike defaulting
  const step = asset.defaultPrice > 1000 ? 100 : asset.defaultPrice > 150 ? 5 : 1;
  let optionStrike = params.strike;
  if (!optionStrike) {
    if (liveChain && liveChain.length > 0) {
      // Find closest active strike in the live chain to the live spot price
      const sortedStrikes = [...liveChain].sort((a, b) => Math.abs(a.strike - liveSpot) - Math.abs(b.strike - liveSpot));
      optionStrike = sortedStrikes[0].strike;
    } else {
      optionStrike = Math.round(lastPrice / step) * step + (isCall ? step : -step);
    }
  }

  // Re-calculate the system scores and calculations strictly backend-side
  const dir = isCall ? 1 : -1;
  const systemScore = calculateSystemScoreFromCandles(candles, dir, asset.volatility);

  // Dynamic premium formulation based on underlying closeness
  const strikeDistance = Math.abs(liveSpot - optionStrike);
  const normalizedDistance = strikeDistance / liveSpot;
  const volBuffer = asset.volatility * 0.15;
  const premiumBase = isCall 
    ? (liveSpot * 0.003) / Math.exp(normalizedDistance * 60)
    : (liveSpot * 0.0035) / Math.exp(normalizedDistance * 65);
  const optionPremiumFloat = Math.max(0.20, Number((premiumBase * (1 + volBuffer)).toFixed(2)));

  // Calculate V11 / V10 structures (routing physical live chain and spot).
  // CRITICAL: the live chain is in raw provider shape (oi / impliedVolatility /
  // nested greeks, no vanna/charm). It MUST be normalized to ChainContract before
  // the dealer-inventory math runs — otherwise computeDealerInventory reads
  // undefined flat fields and every GEX/wall/flip metric is NaN/zero on real data.
  // Passing undefined lets the engines build their deterministic model chain.
  const optDteDays = optionDteDays(asset);
  const chainForMetrics: ChainContract[] | undefined = (liveChain && liveChain.length > 0)
    ? liveChainToContracts(liveChain, asset.volatility, liveSpot, optDteDays)
    : undefined;
  // Perf: V10 internally calls V11 (which builds + sorts a 1000-row KNN db). Compute
  // V11 ONCE and feed it into V10 so the heavy pipeline runs a single time per
  // (asset,contract) per tick instead of twice.
  const metricsV11 = calculateV11Metrics(asset, isCall, systemScore, optionPremiumFloat, optionStrike, chainForMetrics, liveSpot, optDteDays, calibrationHistoryCache);
  // (metricsV10 removed: it was computed every tick and shipped in the payload but no client ever
  // read serverState.metricsV10 — clients derive V10 locally. Dead server compute + payload bloat.)

  // Strict mapping: decision can only be: 'ENTER', 'HOLD', 'REDUCE', 'EXIT'
  // Let's resolve what decision to emit
  let finalDecision: 'ENTER' | 'HOLD' | 'REDUCE' | 'EXIT' = 'ENTER';
  if (positionOpen) {
    if (metricsV11.decision === 'EXIT') finalDecision = 'EXIT';
    else if (metricsV11.decision === 'REDUCE') finalDecision = 'REDUCE';
    else finalDecision = 'HOLD';
  } else {
    if (metricsV11.decision === 'BUY') finalDecision = 'ENTER';
    else finalDecision = 'EXIT';
  }

  // Detailed provenance trail values
  const provenance = {
    inputs: {
      underlying_price: lastPrice,
      volatility: asset.volatility,
      timeframe,
      option_type: isCall ? 'C' : 'P',
      strike: optionStrike
    },
    formula: "SkyVision Core Intelligence Score formula v11.3 + Math Calibration Regression Bounds",
    timestamp: new Date().toISOString(),
    confidence: metricsV11.posteriorWinRate >= 80 ? 'HIGH' : metricsV11.posteriorWinRate >= 65 ? 'MODERATE' : 'STRETCH',
    sample_size: metricsV11.sampleSize,
    version: "11.3 (Audited Server Core)",
    audit_id: `aud-v11-${asset.ticker}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
  };

  const isChainLive = db.liveOptionChains[asset.ticker] && db.liveOptionChains[asset.ticker].length > 0;
  // Honesty: derive the feed label from the ACTUAL source of THIS ticker's chain
  // (db.chainSource[ticker], set from getUnifiedOptionChain().source) rather than the
  // single global db.dataSource — which mislabeled ThetaData chains as LIVE_TRADIER.
  const chainSrc = db.chainSource[asset.ticker] || db.dataSource;
  const feedLabel: "LIVE_THETADATA" | "LIVE_POLYGON" | "LIVE_TRADIER" | "DETERMINISTIC_MODEL" = isChainLive
    ? (chainSrc === "THETADATA_LIVE" ? "LIVE_THETADATA"
      : chainSrc === "POLYGON_LIVE" ? "LIVE_POLYGON"
      : "LIVE_TRADIER")
    : "DETERMINISTIC_MODEL";

  // Pre-calculated Targets section
  const mappedTargets = metricsV11.targets.map(t => ({
    label: t.label,
    price: Number(t.price.toFixed(asset.decimals)),
    optionValue: Number(t.optionValue.toFixed(2)),
    probability: t.probability,
    expectedTimeMinutes: t.expectedTimeMinutes,
    historicalHitRate: t.historicalHitRate,
    expectedDrawdownPct: t.expectedDrawdownPct,
    riskReward: t.riskReward,
    confidenceInterval: t.confidenceInterval,
    feed: "DETERMINISTIC_MODEL"
  }));

  // Render Discovery Shelves.
  //
  // Honesty contract: these shelves must NEVER present static seed dollars as a
  // live mispricing. When a REAL chain is present (isChainLive), we look up the
  // actual market mid for the exact strike/type from db.liveOptionChains and
  // derive the model value + discount from it, so the dollar figures and the
  // "% Underpriced" string move with the live tape. When there is NO real chain,
  // we deliberately do NOT emit fabricated dollars or live-sounding language:
  // marketPrice/modelValue are null and the labels read MODEL DERIVED / NO LIVE
  // CHAIN so the client can show "—" instead of an invented price.
  // Pull the real market mid for a strike/type out of the raw provider chain.
  const liveMidFor = (ticker: string, strike: number, isCall: boolean): number | null => {
    const ch = db.liveOptionChains[ticker];
    if (!ch || ch.length === 0) return null;
    const wantC = isCall;
    const row = ch.find((c: any) => {
      const t = (c.type || '').toString().toUpperCase();
      const isC = t === 'C' || t === 'CALL';
      return Number(c.strike) === strike && isC === wantC;
    });
    if (!row) return null;
    const bid = Number(row.bid);
    const ask = Number(row.ask);
    if (Number.isFinite(bid) && Number.isFinite(ask) && (bid > 0 || ask > 0)) {
      return Number(((bid + ask) / 2).toFixed(2));
    }
    const last = Number(row.lastPrice);
    return Number.isFinite(last) && last > 0 ? Number(last.toFixed(2)) : null;
  };

  // Build a shelf row. `edge` is the model's view of value as a multiple of the
  // live mid (>1 ⇒ model thinks it's cheap, <1 ⇒ rich). When live, marketPrice is
  // the REAL mid and modelValue/discount are derived from it. When not live the
  // row carries no dollars and no underpriced claim.
  const shelfRow = (
    ticker: string,
    strike: number,
    isCall: boolean,
    health: number,
    edge: number,
    liveStatus: string,
  ) => {
    const mid = liveMidFor(ticker, strike, isCall);
    if (isChainLive && mid != null) {
      const modelValue = Number((mid * edge).toFixed(2));
      const pct = mid > 0 ? Math.round((1 - mid / modelValue) * 100) : 0;
      const discount = pct > 0
        ? `${pct}% Underpriced`
        : pct < 0 ? `${Math.abs(pct)}% Overpriced` : 'Fairly Priced';
      return {
        asset: ASSET_LIST.find(a => a.ticker === ticker)!,
        strike, isCall, health,
        marketPrice: mid,
        modelValue,
        discount,
        status: liveStatus,
      };
    }
    // No real chain → do not fabricate dollars or a live mispricing.
    return {
      asset: ASSET_LIST.find(a => a.ticker === ticker)!,
      strike, isCall, health,
      marketPrice: null as number | null,
      modelValue: null as number | null,
      discount: 'MODEL DERIVED',
      status: 'NO LIVE CHAIN',
    };
  };

  const discovery = {
    mispricedCalls: [
      shelfRow('SPX', 7630, true, 91, 1.4, 'Extreme Call Wall Support'),
      shelfRow('QQQ', 448, true, 86, 1.4, 'Accumulating Buy Flow'),
      shelfRow('SPY', 515, true, 89, 1.4, 'Dealer Squeeze Vector'),
    ],
    mispricedPuts: [
      shelfRow('SPX', 7615, false, 93, 1.4, 'Dealer Gamma Support Hedge'),
      shelfRow('NDX', 18200, false, 90, 1.4, 'Block Bid Concentration'),
      shelfRow('QQQ', 442, false, 85, 1.4, 'Put Wall Over-extension'),
    ],
    mostImproved: [
      shelfRow('SPY', 512, true, 88, 1.25, 'Momentum Influx Shift'),
      shelfRow('NDX', 18270, true, 89, 1.25, 'Institutional Flow Build'),
    ],
    nearInvalidation: [
      shelfRow('SPX', 7610, false, 48, 0.7, 'Below Dealer GEX Support Floor'),
      shelfRow('QQQ', 440, false, 51, 0.7, 'Liquidity Void Invalidation'),
    ],
    feed: feedLabel,
    chainLive: isChainLive,
  };

  // 1. Recover values from Polygon/Tradier live chain if available, or generate a high-fidelity mock chain.
  // Capture whether the REAL chain is empty BEFORE the mock backfill below — once we
  // backfill `chain` with a model chain, chain.length is never 0, which made the
  // "Data Unavailable" gate downstream dead. When a provider is live but returned no
  // chain for this ticker, we must NOT present model-derived dealer dollars / expected
  // move as authoritative live readings.
  const liveButEmptyChain = db.dataSource !== 'SANDBOX_SYNTHETIC'
    && (!db.liveOptionChains[asset.ticker] || db.liveOptionChains[asset.ticker].length === 0);
  let chain = db.liveOptionChains[asset.ticker] || [];
  if (chain.length === 0) {
    const mockContracts = generateMockOptionsChain(lastPrice, asset.volatility);
    chain = mockContracts.map(c => ({
      contract: `${asset.ticker} ${c.strike}${c.type === 'call' ? 'C' : 'P'}`,
      strike: c.strike,
      type: c.type === 'call' ? 'C' : 'P',
      oi: c.openInterest,
      volume: Math.floor(c.openInterest * 0.4),
      impliedVolatility: c.iv,
      bid: c.bid,
      ask: c.ask,
      lastPrice: Number(((c.bid + c.ask)/2).toFixed(2)),
      greeks: {
        delta: c.delta,
        gamma: c.gamma,
        theta: c.theta,
        vega: c.vega,
        vanna: c.vanna,
        charm: c.charm
      }
    }));
  }
  
  let callWall = Math.round(lastPrice / step) * step + (step * 4);
  let putWall = Math.round(lastPrice / step) * step - (step * 4);
  let magnetStrike = optionStrike;
  let flipLevel = isCall ? optionStrike - (step * 2) : optionStrike + (step * 2);
  let dealerBias = systemScore.momentumAcceleration > 5 ? 'LONG GAMMA' : 'SHORT GAMMA';
  let dealerScore = Math.round(metricsV11.dealer.dealerPressureIndex * 10);
  // These are unconditionally recomputed from the chain below; honest neutral
  // defaults (never fabricated/random) in case the chain is empty.
  let totalOi = 0;
  let netExposure = '—';
  let callPutRatio = '—';
  let hedgeSensitivity = 'HIGH';

  // Whales/largest contracts are filled from the REAL ranked chain below when a
  // live chain is present. Until then show an honest placeholder — never a
  // Math.random()-fabricated notional, which would read as a real whale print.
  let impactContracts: any[] = [];
  let bullishWhale = { contract: isChainLive ? 'N/A' : 'N/A (CALCULATED FROM MODEL)', exp: expLabel, size: '—' };
  let bearishWhale = { contract: isChainLive ? 'N/A' : 'N/A (CALCULATED FROM MODEL)', exp: expLabel, size: '—' };
  let largestCall = isChainLive ? 'N/A' : 'N/A (CALCULATED FROM MODEL)';
  let largestPut = isChainLive ? 'N/A' : 'N/A (CALCULATED FROM MODEL)';

  const calls = chain.filter((c: any) => {
    const t = (c.type || '').toString().toUpperCase();
    return t === 'C' || t === 'CALL';
  });
  const puts = chain.filter((c: any) => {
    const t = (c.type || '').toString().toUpperCase();
    return t === 'P' || t === 'PUT';
  });

  const netGex = metricsV11.dealer.netGex;
  const netDex = metricsV11.dealer.netDex;
  const netVex = metricsV11.dealer.netVex;
  const netCharm = metricsV11.dealer.netCharm;
  callWall = metricsV11.dealer.callWall;
  putWall = metricsV11.dealer.putWall;
  flipLevel = Number(metricsV11.dealer.gammaFlipPrice.toFixed(2));
  dealerScore = Math.min(100, Math.max(12, Math.round(metricsV11.dealer.dealerPressureIndex * 10)));
  totalOi = chain.reduce((acc, c) => acc + (c.oi || c.openInterest || 0), 0);

  // GEX net exposure in Billions
  const netGexVal = netGex / 1e9;
  netExposure = `${netGexVal >= 0 ? '+' : ''}${netGexVal.toFixed(2)}B`;
  dealerBias = netGex >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA';
  hedgeSensitivity = Math.abs(netGexVal) > 5 ? 'EXTREME' : Math.abs(netGexVal) > 2 ? 'HIGH' : 'MODERATE';

  // Call/Put Ratio
  const totalCallOi = calls.reduce((acc, c) => acc + (c.oi || c.openInterest || 0), 0);
  const totalPutOi = puts.reduce((acc, c) => acc + (c.oi || c.openInterest || 0), 0);
  callPutRatio = totalPutOi > 0 ? `${(totalCallOi / totalPutOi).toFixed(2)} : 1` : '1.00 : 1';

  // Primary walls & magnets
  magnetStrike = metricsV11.dealer.gexStrikes.length > 0 
    ? metricsV11.dealer.gexStrikes.reduce((max, cur) => Math.abs(cur.gex) > Math.abs(max.gex) ? cur : max, metricsV11.dealer.gexStrikes[0]).strike
    : optionStrike;

  // Build high fidelity Gamma/Delta Impact Contracts ranking (using actual delta, gamma, volume, spot proximity)
  const sortedImpact = [...chain].map(c => {
    const greekDelta = Math.abs(c.greeks?.delta || 0.5);
    const greekGamma = Math.abs(c.greeks?.gamma || 0.05);
    const distance = Math.abs(c.strike - lastPrice);
    const proximity = Math.exp(-distance / (lastPrice * 0.05));
    
    // dealer hedge impact combining options greeks and spot proximity
    const deltaExp = c.oi * greekDelta * 100 * lastPrice;
    const gammaExp = c.oi * greekGamma * 100 * (lastPrice * lastPrice) * 0.01;
    const hedgeImpact = (deltaExp + gammaExp) * proximity;
    
    return {
      contract: c.contract,
      expiration: expLabel,
      oi: c.oi,
      volume: c.volume,
      deltaNotional: `$${((c.oi * lastPrice * greekDelta * 100) / 1e9).toFixed(2)}B`,
      gammaContribution: `${((c.oi / (totalOi || 1)) * 100).toFixed(1)}%`,
      hedgeImpact
    };
  }).sort((a, b) => b.hedgeImpact - a.hedgeImpact).slice(0, 3);

  impactContracts = sortedImpact.map((item, idx) => ({
    rank: idx + 1,
    contract: item.contract,
    expiration: item.expiration,
    oi: item.oi,
    volume: item.volume,
    deltaNotional: item.deltaNotional,
    gammaContribution: item.gammaContribution
  }));

  // Build actual Whale detection prints ranked by notional exposure and dealer impact
  if (isChainLive && calls.length > 0) {
    const rankedCalls = [...calls].map((c: any) => {
      const gDelta = Math.abs(c.greeks?.delta || 0.5);
      const impact = c.oi * gDelta * lastPrice * 100;
      return { c, impact };
    }).sort((a, b) => b.impact - a.impact);

    largestCall = rankedCalls[0].c.contract;
    bullishWhale = {
      contract: rankedCalls[0].c.contract,
      exp: expLabel,
      size: `$${((rankedCalls[0].c.oi * rankedCalls[0].c.lastPrice * 100) / 1e6).toFixed(1)}M`
    };
  }

  if (isChainLive && puts.length > 0) {
    const rankedPuts = [...puts].map((c: any) => {
      const gDelta = Math.abs(c.greeks?.delta || 0.5);
      const impact = c.oi * gDelta * lastPrice * 100;
      return { c, impact };
    }).sort((a, b) => b.impact - a.impact);

    largestPut = rankedPuts[0].c.contract;
    bearishWhale = {
      contract: rankedPuts[0].c.contract,
      exp: expLabel,
      size: `$${((rankedPuts[0].c.oi * rankedPuts[0].c.lastPrice * 100) / 1e6).toFixed(1)}M`
    };
  }

  // Calculate actual Gamma / Delta contributions for the active strike
  const activeStrikeContracts = chain.filter(c => c.strike === optionStrike);
  // Honest placeholders; replaced with real per-strike contributions below when
  // the active strike is present in the chain (never a fabricated random %).
  let activeGammaContribution = '—';
  let activeDeltaContribution = '—';
  
  if (activeStrikeContracts.length > 0) {
    const activeStrikeOi = activeStrikeContracts.reduce((acc, c) => acc + c.oi, 0);
    const gammaPct = (activeStrikeOi / (totalOi || 1)) * 100;
    activeGammaContribution = `${gammaPct.toFixed(1)}%`;
    
    const activeStrikeDeltaNotional = activeStrikeContracts.reduce((acc, c) => acc + (c.oi * Math.abs(c.greeks?.delta || 0.5) * lastPrice * 100), 0);
    const totalDeltaNotional = chain.reduce((acc, c) => acc + (c.oi * Math.abs(c.greeks?.delta || 0.5) * lastPrice * 100), 0);
    const deltaPct = totalDeltaNotional > 0 ? (activeStrikeDeltaNotional / totalDeltaNotional) * 100 : 10.0;
    activeDeltaContribution = `${deltaPct.toFixed(1)}%`;
  }

  // Generate dynamic, live-market options commentary based on quantitative state
  const commentaryPoints: string[] = [];
  const isCompressed = metricsV11.surface.ivPercentile < 50;

  if (netGex >= 0) {
    commentaryPoints.push(
      `Dealers remain heavily LONG GAMMA above the critical gamma flip crossover of ${flipLevel.toFixed(2)}. This structural positioning acts as a market stabilizer, dampening spot vol expansion.`
    );
  } else {
    commentaryPoints.push(
      `Dealers hold negative net gamma below the gamma flip crossover of ${flipLevel.toFixed(2)}. This SHORT GAMMA environment demands active delta hedging, driving momentum acceleration.`
    );
  }

  commentaryPoints.push(
    `Our continuous spatial options map places the overhead ceiling (Call Wall) at ${callWall.toFixed(2)} and downside floor protection (Put Wall) at ${putWall.toFixed(2)}.`
  );

  commentaryPoints.push(
    `The dominant Magnet Strike centering at ${magnetStrike.toFixed(2)} holds massive open interest concentrations, asserting a strong gravitational attraction as final daily pinning approaches.`
  );

  if (isCompressed) {
    commentaryPoints.push(
      `Option IV Rank is compressed at ${metricsV11.surface.ivRank}%, indicating options pricing is structurally cheap and favoring risk-managed bullish entry zones.`
    );
  } else {
    commentaryPoints.push(
      `Option IV Rank has expanded to ${metricsV11.surface.ivRank}%, creating an optimal premium-selling environment as implied ranges trade ahead of average historical realities.`
    );
  }

  if (netCharm > 0) {
    commentaryPoints.push(
      `Positive net dealer charm of +$${(netCharm / 1e6).toFixed(1)}M/day generates decay-driven passive buy feedback blocks as option expirations near.`
    );
  } else {
    commentaryPoints.push(
      `Negative net dealer charm represents decay-based dealer distribution, injecting selling friction on breakouts.`
    );
  }

  // Deep Institutional Intelligence computation dynamically calculated per SSE tick
  const deepScaleIntelligence = {
    dealer_metrics: {
      bias: dealerBias,
      volState: metricsV11.surface.ivPercentile < 50 ? 'COMPRESSED' : 'EXPANDED',
      flipLevel,
      magnetStrike,
      callWall,
      putWall,
      dealerScore,
      feed: feedLabel
    },
    impact_contracts: impactContracts,
    strike_metrics: {
      totalOi: liveButEmptyChain ? 0 : totalOi,
      // When live-but-empty, the dollar net-exposure headline would be derived from a
      // MOCK chain — surface it as unavailable instead of an authoritative live figure.
      netExposure: liveButEmptyChain ? 'Data Unavailable' : netExposure,
      callPutRatio: liveButEmptyChain ? '—' : callPutRatio,
      hedgeSensitivity: liveButEmptyChain ? 'DATA UNAVAILABLE' : hedgeSensitivity,
      dealerExposure: liveButEmptyChain ? 'DATA UNAVAILABLE'
        : dealerBias === 'DATA UNAVAILABLE' ? 'DATA UNAVAILABLE'
        : (dealerBias === 'LONG GAMMA' ? 'SHORT GAMMA' : 'LONG GAMMA'),
      gammaContribution: liveButEmptyChain ? '—' : activeGammaContribution,
      deltaContribution: liveButEmptyChain ? '—' : activeDeltaContribution,
      feed: feedLabel
    },
    whale_detection: {
      bullish: bullishWhale,
      bearish: bearishWhale,
      largestCall,
      largestPut,
      feed: isChainLive ? feedLabel : "DETERMINISTIC_MODEL"
    },
    flow_feed: db.globalFlowFeed.filter(f => f.asset === asset.ticker),
    commentary: commentaryPoints
  };

  // Construct gex_profile strikes array
  const strikesMap: Record<number, {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    callDex: number;
    putDex: number;
    netDex: number;
    callVex: number;
    putVex: number;
    netVex: number;
    callOi: number;
    putOi: number;
    callVolume: number;
    putVolume: number;
    charmEx: number;
    callPrem: number;
    putPrem: number;
    netPrem: number;
  }> = {};

  chain.forEach((c: any) => {
    const stk = c.strike;
    if (!strikesMap[stk]) {
      strikesMap[stk] = {
        strike: stk,
        callGex: 0,
        putGex: 0,
        netGex: 0,
        callDex: 0,
        putDex: 0,
        netDex: 0,
        callVex: 0,
        putVex: 0,
        netVex: 0,
        callOi: 0,
        putOi: 0,
        callVolume: 0,
        putVolume: 0,
        charmEx: 0,
        callPrem: 0,
        putPrem: 0,
        netPrem: 0,
      };
    }
    const isCallType = (c.type || '').toString().toUpperCase() === 'C' || (c.type || '').toString().toUpperCase() === 'CALL';
    const sign = isCallType ? 1 : -1;
    const gammaVal = typeof c.gamma === 'number' ? c.gamma : (c.greeks?.gamma || 0.01);
    const deltaVal = typeof c.delta === 'number' ? c.delta : (c.greeks?.delta || (isCallType ? 0.5 : -0.5));
    const vegaVal = typeof c.vega === 'number' ? c.vega : (c.greeks?.vega || 0.15);
    // Charm: prefer a provided value (the mock chain nests it under greeks); otherwise derive it
    // analytically from the same BSM inputs the feed already gives us — so a live provider chain (which
    // returns delta/gamma/theta/vega but NOT charm) still yields an honest charm surface, not a dead lane.
    let charmVal = typeof c.charm === 'number' ? c.charm : (typeof c.greeks?.charm === 'number' ? c.greeks.charm : null);
    if (charmVal == null) {
      const ivVal = typeof c.impliedVolatility === 'number' ? c.impliedVolatility : (typeof c.iv === 'number' ? c.iv : asset.volatility);
      charmVal = calculateAnalyticGreeks(lastPrice, c.strike, optDteDays, ivVal, isCallType).charm;
    }
    const oiVal = typeof c.oi === 'number' ? c.oi : (c.openInterest || 0);
    const volVal = typeof c.volume === 'number' ? c.volume : 0;
    const bidVal = typeof c.bid === 'number' ? c.bid : 0;
    const askVal = typeof c.ask === 'number' ? c.ask : 0;
    // Mid premium that traded today: prefer the bid/ask midpoint, fall back to whichever quote exists.
    const mid = (bidVal > 0 && askVal > 0) ? (bidVal + askVal) / 2 : Math.max(bidVal, askVal);

    const gexAmt = gammaVal * oiVal * 100 * (lastPrice * lastPrice) * 0.01 * sign;
    const dexAmt = deltaVal * oiVal * 100 * lastPrice * sign;
    const vexAmt = vegaVal * oiVal * 100 * sign;
    // Charm exposure: charm × OI × 100 × sign — canonical v11Math convention (no spot factor) so the
    // per-strike sum reconciles with the platform's net-charm read. Dealer Δ-decay $/day per strike.
    const charmAmt = charmVal * oiVal * 100 * sign;
    // Premium FLOW (not exposure): mid × volume × 100 — the $ that actually traded at this contract today.
    const premAmt = mid * volVal * 100;

    if (isCallType) {
      strikesMap[stk].callGex += gexAmt;
      strikesMap[stk].callDex += dexAmt;
      strikesMap[stk].callVex += vexAmt;
      strikesMap[stk].callOi += oiVal;
      strikesMap[stk].callVolume += volVal;
      strikesMap[stk].callPrem += premAmt;
    } else {
      strikesMap[stk].putGex += gexAmt;
      strikesMap[stk].putDex += dexAmt;
      strikesMap[stk].putVex += vexAmt;
      strikesMap[stk].putOi += oiVal;
      strikesMap[stk].putVolume += volVal;
      strikesMap[stk].putPrem += premAmt;
    }
    strikesMap[stk].netGex += gexAmt;
    strikesMap[stk].netDex += dexAmt;
    strikesMap[stk].netVex += vexAmt;
    strikesMap[stk].charmEx += charmAmt;
    strikesMap[stk].netPrem = strikesMap[stk].callPrem - strikesMap[stk].putPrem;
  });

  const strikesArr = Object.values(strikesMap);
  // Matrix multi-expiry columns: prefer REAL per-expiry chains from the opt-in provider fetch; else,
  // only on the MODEL feed (not live), derive a model expiry ladder so the matrix shows multi-expiry.
  const realExpiries = db.gexExpiries[asset.ticker];
  const matrixExpiries = (realExpiries && realExpiries.length)
    ? realExpiries
    : (!isChainLive && strikesArr.length ? synthesizeExpirySlices(strikesArr.map(s => ({ strike: s.strike, netGex: s.netGex, callGex: s.callGex, putGex: s.putGex, vol: (s.callVolume || 0) + (s.putVolume || 0) || (s.callOi || 0) + (s.putOi || 0) })), asset) : undefined);

  const gex_profile = {
    spot: lastPrice,
    netGex,
    callWall,
    putWall,
    gammaFlip: flipLevel,
    magnet: magnetStrike,
    totalCallOi,
    totalPutOi,
    callPutOiRatio: callPutRatio,
    expectedMovePct: metricsV11.surface.expectedMovePct,
    // Confidence flags from the dealer-inventory solver: false ⇒ the flip is a bounded
    // fallback (spot*0.995, no GEX zero-crossing) and/or the walls are a fallback (no
    // dominant wall). Surface them so the UI can render those as estimated, not confident.
    gammaFlipConfident: metricsV11.dealer.gammaFlipConfident,
    wallsConfident: metricsV11.dealer.wallsConfident,
    feed: feedLabel,
    expiryLabel: expLabel,
    expiryDate: optionExpiryDate(asset),
    strikes: strikesArr,
    // Multi-expiry columns for the matrix. REAL per-expiry chains when the opt-in provider fetch
    // populated them (db.gexExpiries); otherwise, on the MODEL/sandbox feed (not live), a derived
    // model ladder so the matrix still shows a multi-expiry heatmap. A LIVE single-expiry chain
    // without the opt-in fetch shows just its one real expiry (we never fake multi over real data).
    ...(matrixExpiries?.length ? { expiries: matrixExpiries } : {}),
  };

  // Strike Gravity Engine — score every strike (GEX / OI / volume / proximity),
  // rank them, and build dealer support/resistance zones from the same per-strike
  // data the GEX profile was built on. Feeds Sky's Vision level/target logic.
  const strike_gravity = computeStrikeGravity(gex_profile.strikes, lastPrice, 10);

  // Plain-English dealer-gamma read for this ticker (cached on the 30-min mark).
  const gex_summary = refreshGexSummary(asset.ticker, {
    ticker: asset.ticker,
    spot: lastPrice,
    decimals: asset.decimals,
    netGex,
    callWall,
    putWall,
    gammaFlip: flipLevel,
    magnet: magnetStrike,
    expiryLabel: expLabel,
    dynamics: dealerDynCache[asset.ticker] || null,
  });

  const pressureVal = Math.round((dealerScore / 100 - 0.5) * 200);
  const gexNorm = Math.tanh(metricsV11.dealer.netGex / 2e9);
  const dexNorm = Math.tanh(metricsV11.dealer.netDex / 5e9);
  const vexNorm = Math.tanh(metricsV11.dealer.netVex / 1e7);

  const dealer_flow = {
    bias: dealerBias,
    pressure: pressureVal,
    headline: commentaryPoints[0] || 'Dealers maintain balanced positioning inside the active transaction corridor.',
    components: [
      { name: 'GEX ALIGNMENT', detail: 'Dealer Gamma Exposure Direction', value: gexNorm, weight: 0.5 },
      { name: 'DEX HEDGE', detail: 'Delta Hedging Re-alignment Force', value: dexNorm, weight: 0.3 },
      { name: 'VEX VOLATILITY', detail: 'Vega/Vanna Hedge Adjustment Rate', value: vexNorm, weight: 0.2 },
    ]
  };

  // (displacement.volatility + displacement.structure removed: no client component ever read
  // them — only zones/fvgs/sweeps are consumed. Their inputs were computed solely to fill those
  // unused fields, so the whole block is dropped to keep the payload honest and lean.)

  // (Break-of-Structure / CHoCH event detection removed: the events array was computed on every
  // broadcast tick but consumed by no client component — dead weight on the hot path.)

  const zones: any[] = [];
  let zoneId = 0;
  for (let i = candles.length - 20; i < candles.length; i++) {
    if (i < 2) continue;
    const c = candles[i];
    const bodySize = Math.abs(c.close - c.open);
    const totalSize = c.high - c.low;
    const avgBody = candles.slice(Math.max(0, i - 10), i).reduce((sum, candle) => sum + Math.abs(candle.close - candle.open), 0) / 10 || 1;
    
    if (bodySize > avgBody * 1.3 && totalSize > 0) {
      zoneId++;
      const isBullish = c.close > c.open;
      const type = isBullish ? 'bullish' : 'bearish';
      
      let state = 'ARMED';
      if (i < candles.length - 12) state = 'COMPLETED';
      else if (i < candles.length - 6) state = 'MITIGATED';
      else if (i < candles.length - 2) state = 'ACTIVE';

      const bottom = isBullish ? c.open : c.close;
      const top = isBullish ? c.close : c.open;
      const bodyDominance = bodySize / totalSize;
      const atrMultiple = Number((totalSize / (lastPrice * asset.volatility * 0.001) || 1).toFixed(1));
      const score = Math.round(60 + bodyDominance * 30 + (atrMultiple > 1.2 ? 10 : 0));

      zones.push({
        id: `dz-${zoneId}`,
        type,
        bottom,
        top,
        state,
        atrMultiple,
        bodyDominance,
        score
      });
    }
  }
  // No fabricated fallback zone: an empty zone set is honest when no displacement candle qualifies,
  // instead of shipping a hardcoded score:82 placeholder the trader would read as a real zone.

  const fvgs = calculateFVGs(candles);
  const sweeps = calculateLiquidityEvents(candles);

  const displacement = {
    zones,
    fvgs,
    sweeps
  };

  const activeContract = chain.find(c => {
    if (c.strike !== optionStrike) return false;
    const t = (c.type || '').toString().toUpperCase();
    const isCallType = t === 'C' || t === 'CALL';
    return isCallType === isCall;
  });
  const active_greeks = activeContract?.greeks || {
    delta: isCall ? 0.5 : -0.5,
    gamma: 0.02,
    theta: -0.12,
    vega: 0.05
  };
  const active_volume = activeContract?.volume || 0;
  const active_oi = activeContract?.oi || activeContract?.openInterest || 0;

  // Edge analytics: per-asset block (cached) + per-contract Kelly/scenario for the
  // contract this client is viewing.
  const assetEdge = edgeCache[asset.ticker] || null;
  const quant_edge = assetEdge ? {
    ...assetEdge,
    ...computeContractEdge({
      spot: liveSpot,
      strike: optionStrike,
      // The viewed contract's real (intraday) time-to-expiry, NOT the fixed 5-day RND
      // window — so its scenario matrix, break-even and Kelly sizing decay to expiry.
      // A flat 5 days made 0DTE P&L/sizing systematically wrong (theta never burned).
      dteDays: optDteDays,
      iv: assetEdge.skew?.atmIv ?? asset.volatility,
      isCall,
      entryPrice: optionPremiumFloat,
      winPct: metricsV11.posteriorWinRate / 100,
      riskReward: metricsV11.riskRewardRatio,
    }),
  } : null;

  // ===== 0DTE PROBABILITY ENGINE + SKY'S VISION TRADE PLAN =====
  const atmIv0 = assetEdge?.skew?.atmIv ?? asset.volatility;
  const hoursToClose = getHoursToClose();
  const zerodte = compute0DTE({
    spot: lastPrice,
    atmIv: atmIv0,
    hoursToClose,
    netGex: metricsV11.dealer.netGex,
    magnet: magnetStrike,
    strikes: gex_profile.strikes.map((s: any) => ({ strike: s.strike, netGex: s.netGex })),
  });
  const emEodPts = zerodte.expectedMove.find((b) => b.horizon === 'EOD')?.movePts || (lastPrice * atmIv0 * 0.02);

  // Composite Sky's Vision plan: 40% technical / 30% dealer / 20% contract / 10% learning.
  const tfCandles1m = db.candles[`${asset.ticker}-1m`] || candles;
  const tfCandles5m = db.candles[`${asset.ticker}-5m`] || candles;
  const tfCandles15m = db.candles[`${asset.ticker}-15m`] || candles;
  // structureRead is a pure function of the 5m candles (no isCall/strike dependency),
  // so cache it per-asset for the duration of one broadcast pass and reuse across all
  // clients on this asset rather than recomputing it per client.
  const structureRead = getAssetStructureRead(asset.ticker, tfCandles5m);
  const technicalRead = computeTechnicalRead({
    candles1m: tfCandles1m, candles5m: tfCandles5m, candles15m: tfCandles15m,
    spot: lastPrice, systemScoreTotal: systemScore.total, structureTrend: structureRead.trend,
  });
  const contractScore = computeContractScore(chainCache[asset.ticker] || [], lastPrice, step, technicalRead.direction >= 0);
  const trade_plan = buildTradePlan({
    ticker: asset.ticker,
    spot: lastPrice,
    step,
    emPts: emEodPts,
    hoursToClose,
    regimeState: assetEdge?.regime?.state || 'BALANCED',
    technical: technicalRead,
    dealer: {
      netGex: metricsV11.dealer.netGex,
      gammaFlip: metricsV11.dealer.gammaFlipPrice,
      callWall: metricsV11.dealer.callWall,
      putWall: metricsV11.dealer.putWall,
    },
    contractScore,
    winRate: metricsV11.posteriorWinRate,
    loadedStrike: strike_gravity.primary?.strike ?? null,
    liquidityHigh: structureRead.rangeHigh,
    liquidityLow: structureRead.rangeLow,
  });

  return {
    contract: `${asset.ticker} ${optionStrike}${isCall ? 'C' : 'P'}`,
    recommendation: finalDecision, //ENTER, HOLD, REDUCE, EXIT
    trade_health: Math.round(metricsV11.posteriorWinRate), // represents trade health integer
    active_greeks,
    active_volume,
    active_oi,
    quant_edge,
    provenance: {
      ...provenance,
      feed: feedLabel
    },
    position_management: {
      momentum: systemScore.momentumAcceleration >= 7 ? 'ACCELERATING' : 'DEGRADED',
      dealer_support: metricsV11.dealer.dealerPressureIndex >= 6 ? 'IMPROVING' : 'WEAK',
      liquidity: metricsV11.liquidity.liquidityScore >= 70 ? 'STRONG' : 'MODERATE',
      risk: metricsV11.tailRisk.tailRiskScore <= 0.45 ? 'FALLING' : 'ELEVATED',
      decision_reason: metricsV11.decisionReason,
      feed: "DETERMINISTIC_MODEL"
    },
    expected_move: {
      // Gate on the REAL chain being empty (liveButEmptyChain, captured before the mock
      // backfill) — the old `chain.length === 0` could never fire because chain is
      // always backfilled with a model chain above.
      pct: liveButEmptyChain ? 'Data Unavailable' : `±${(metricsV11.surface.expectedMovePct * 100).toFixed(1)}%`,
      range: liveButEmptyChain ? 'Data Unavailable' : `±${(lastPrice * metricsV11.surface.expectedMovePct).toFixed(1)} pts`,
      term_structure: metricsV11.surface.termStructure,
      skew: metricsV11.surface.skewCurve,
      ivRank: metricsV11.surface.ivRank,
      ivPercentile: metricsV11.surface.ivPercentile,
      feed: feedLabel
    },
    targets: mappedTargets,
    pinpoint_map: {
      spot_price: lastPrice,
      step,
      feed: feedLabel
    },
    discovery: {
      ...discovery,
      feed: feedLabel
    },
    trade_archive: db.v8Trades,
    system_score: {
      ...systemScore,
      feed: "DETERMINISTIC_MODEL"
    },
    deep_intelligence: {
      ...deepScaleIntelligence,
      feed: feedLabel
    },
    metricsV11,
    candles,
    optionPremiumFloat,
    optionStrike,
    liveSpotPrices: { ...db.liveSpotPrices },
    // The exact near-the-money chain the server's edge engine computed on, so the
    // client Quant Lab renders real (or high-fidelity mock) inputs consistent with
    // the server — and automatically goes live the moment API keys are connected.
    option_chain: windowChainAroundSpot(chainCache[asset.ticker] || [], lastPrice),
    chain_live: !!isChainLive,
    data_source: db.dataSource,
    api_status_message: db.apiStatusMessage,
    gex_profile,
    strike_gravity,
    dealer_dynamics: dealerDynCache[asset.ticker] || null,
    gex_summary,
    zerodte,
    trade_plan,
    sky_vision: getSkyVision(asset.ticker),
    dealer_flow,
    displacement,
    candle_feed: feedLabel,
    // (hud_metrics removed: a block of dramatic-sounding labels — reflexivity_vector,
    // systemic_fragility, campaign_state, propagation_path — that no client component ever
    // rendered. Pure vibe-coding payload bloat on every tick; dropped.)
  };
};
