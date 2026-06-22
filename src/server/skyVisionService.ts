/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKY VISION v2.0 — server service.
 *
 * Runs the contract-intelligence engine (src/lib/skyVisionEngine) once per tick
 * over a per-ticker option chain, maintaining a short rolling history per contract
 * so the rate-of-change strength signals have data. Produces, per focus ticker:
 *   • a scored contract table (rotation scanner) — calls and puts
 *   • the strongest call + strongest put
 *   • the EMA target ladder with BSM-projected premiums for the leading contract
 *   • short/long-term swing read
 *   • the Layer-7 master score (direction, best contract, target, health, confidence)
 *
 * Chain sourcing (honesty-first): when the server has a real per-ticker chain in
 * `db.liveOptionChains[ticker]` (raw provider shape: { strike, type:'C'|'P', oi,
 * volume, impliedVolatility, greeks:{delta,gamma,theta,vega}, bid, ask, lastPrice }),
 * the engine runs over the REAL strikes / OI / volume / IV / greeks and the result is
 * flagged `source: 'LIVE'`. Only when no real chain is present does it fall back to a
 * deterministic MODEL chain (no Math.random — synthetic OI/volume are derived from
 * strike distance) and the result is flagged `source: 'MODEL'`, so the UI can stop
 * claiming a live chain when it isn't one.
 */
import { db } from './state';
import { ASSET_LIST, optionDteDays } from '../data';
import type { AssetInfo } from '../types';
import {
  snapshotFromMarket,
  scoreContract,
  rankContractStrengths,
  computeEmaLadder,
  buildTargetStack,
  projectTargetPremiums,
  detectSwings,
  emaStructureScore,
  computeMasterScore,
  type ContractSnapshot,
  type ProjectedTarget,
  type EmaLadder,
  type SwingRead,
  type ScoredContract,
} from '../lib/skyVisionEngine';

// Sky Vision is computed for every launch ticker (indices, ETFs, and single names).
const HISTORY_CAP = 30;
const STRIKES_EACH_SIDE = 3; // ATM + 3 calls up / 3 puts down
const RISK_FREE = 0.05;

interface SkyVisionContractOut {
  key: string;
  strike: number;
  isCall: boolean;
  premium: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  volume: number;
  oi: number;
  strength: number;
  trend: string;
  confidence: number;
  label: string;
  rank: number;
  strongest: boolean;
}

export interface SkyVisionTicker {
  ticker: string;
  spot: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  emaLadder: EmaLadder;
  walls: { gamma: number; call: number; put: number };
  bestCall: SkyVisionContractOut | null;
  bestPut: SkyVisionContractOut | null;
  contracts: SkyVisionContractOut[];
  targetStack: ProjectedTarget[];
  leadContract: string;
  swing: SwingRead;
  master: ReturnType<typeof computeMasterScore>;
  /** 'LIVE' = built from db.liveOptionChains; 'MODEL' = deterministic fallback. */
  source: 'LIVE' | 'MODEL';
  /** Convenience boolean mirror of `source === 'LIVE'`. */
  isLive: boolean;
  updatedAt: number;
}

// Per-contract rolling history + last-seen tick (for pruning) + evolving mock state.
const histories = new Map<string, ContractSnapshot[]>();
const lastSeen = new Map<string, number>();
const prevSpot = new Map<string, number>();
let tickIndex = 0;
const cache: Record<string, SkyVisionTicker> = {};

function stepFor(price: number): number {
  if (price >= 5000) return 25;
  if (price >= 1000) return 10;
  if (price >= 100) return 1;
  return 0.5;
}

function baseIv(type: string): number {
  // Single stocks carry materially higher IV than broad indices/ETFs.
  return type === 'INDEXES' ? 0.13 : type === 'ETFS' ? 0.16 : type === 'STOCKS' ? 0.45 : 0.18;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Number(v.toFixed(2));

/** A single normalized contract pulled from the real provider chain. */
interface NormalizedLiveContract {
  strike: number;
  isCall: boolean;
  oi: number;
  volume: number;
  iv: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

/**
 * Normalize the raw provider chain (shape: { strike, type:'C'|'P', oi, volume,
 * impliedVolatility, greeks:{delta,gamma,theta,vega} }) into a strike→contract
 * lookup. Mirrors marketEngine's `liveChainToContracts` field handling but kept
 * local to avoid an import cycle. Greeks are left null when the feed omits them so
 * the caller can fall back to analytic BSM greeks instead of fabricating zeros.
 */
function normalizeLiveChain(live: any[]): Map<string, NormalizedLiveContract> {
  const out = new Map<string, NormalizedLiveContract>();
  for (const c of live) {
    if (!c || typeof c.strike !== 'number') continue;
    const isCall = c.type === 'C' || c.type === 'call' || c.type === 'CALL';
    const g = c.greeks || {};
    const delta = g.delta ?? c.delta;
    const gamma = g.gamma ?? c.gamma;
    const theta = g.theta ?? c.theta;
    const vega = g.vega ?? c.vega;
    out.set(`${c.strike}|${isCall ? 'C' : 'P'}`, {
      strike: c.strike,
      isCall,
      oi: Number(c.oi ?? c.openInterest ?? 0) || 0,
      volume: Number(c.volume ?? c.vol ?? c.day?.volume ?? 0) || 0,
      iv: Number(c.impliedVolatility ?? c.iv) || 0,
      delta: typeof delta === 'number' ? delta : null,
      gamma: typeof gamma === 'number' ? gamma : null,
      theta: typeof theta === 'number' ? theta : null,
      vega: typeof vega === 'number' ? vega : null,
    });
  }
  return out;
}

/** ATM strike on the real chain: the listed strike closest to spot. */
function nearestRealStrike(strikes: number[], spot: number): number {
  let best = strikes[0];
  let bestDist = Infinity;
  for (const s of strikes) {
    const d = Math.abs(s - spot);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

/** Trend of a metric across a contract's history, mapped to 0..100 (50 = flat). */
function trendScore(hist: ContractSnapshot[], pick: (s: ContractSnapshot) => number): number {
  if (hist.length < 2) return 50;
  const a = pick(hist[0]);
  const b = pick(hist[hist.length - 1]);
  const rel = (b - a) / (Math.abs(a) + 1e-9);
  return Math.round(clamp(50 + 50 * Math.tanh(3 * rel), 0, 100));
}

/**
 * Advance the engine one tick for the SCOPED focus tickers (the market engine's
 * round-robin bucket UNION the subscribed tickers) and cache the result. Defaults to
 * the full ASSET_LIST for callers that don't pass a scope. Folding this into the
 * round-robin avoids a second full 100-asset loop every second; tickers not in scope
 * keep their last cached SkyVision block, which the SSE broadcast still ships.
 */
export function tickSkyVision(scope: AssetInfo[] = ASSET_LIST): void {
  tickIndex++;
  for (const asset of scope) {
    try {
      computeForAsset(asset);
    } catch (e) {
      // Never let one ticker break the tick.
      // eslint-disable-next-line no-console
      console.error('[skyVision] compute failed for', asset.ticker, e);
    }
  }
  pruneStale();
}

function computeForAsset(asset: (typeof ASSET_LIST)[number]): void {
  const ticker = asset.ticker;
  const spot = db.liveSpotPrices[ticker] || asset.defaultPrice;
  const ps = prevSpot.get(ticker) ?? spot;
  const momentum = spot - ps; // >0 favors calls, <0 favors puts
  prevSpot.set(ticker, spot);

  const closes = (db.candles[`${ticker}-5m`] || []).map((c: any) => c.close);
  const emas = computeEmaLadder(closes.length >= 2 ? closes : [spot, spot]);

  const step = stepFor(spot);
  const atm = Math.round(spot / step) * step;
  const iv0 = baseIv(asset.type);
  const dte = optionDteDays(asset); // 0–1DTE for daily names, front-weekly for single stocks
  const emPts = spot * iv0 * Math.sqrt(dte / 365);

  // Source the focus chain. Prefer the REAL provider chain in db.liveOptionChains;
  // only fall back to the deterministic model when no live chain is present.
  const liveRaw = db.liveOptionChains[ticker];
  const haveLive = Array.isArray(liveRaw) && liveRaw.length > 0;
  const liveMap = haveLive ? normalizeLiveChain(liveRaw) : null;
  const source: SkyVisionTicker['source'] = haveLive && liveMap && liveMap.size > 0 ? 'LIVE' : 'MODEL';

  // Build the focus chain: ATM..+3 calls, ATM..-3 puts. On the live path the ATM is
  // the listed strike closest to spot and the steps walk the real listed strikes.
  const specs: { strike: number; isCall: boolean }[] = [];
  if (source === 'LIVE' && liveMap) {
    const callStrikes = Array.from(liveMap.values()).filter((c) => c.isCall).map((c) => c.strike).sort((a, b) => a - b);
    const putStrikes = Array.from(liveMap.values()).filter((c) => !c.isCall).map((c) => c.strike).sort((a, b) => a - b);
    const allStrikes = Array.from(new Set([...callStrikes, ...putStrikes])).sort((a, b) => a - b);
    const atmReal = nearestRealStrike(allStrikes.length ? allStrikes : [atm], spot);
    const atmIdx = allStrikes.indexOf(atmReal);
    // Real-chain calls at/above ATM, real-chain puts at/below ATM (listed strikes only).
    for (let i = 0; i <= STRIKES_EACH_SIDE; i++) {
      const s = allStrikes[atmIdx + i];
      if (typeof s === 'number' && liveMap.has(`${s}|C`)) specs.push({ strike: s, isCall: true });
    }
    for (let i = 0; i <= STRIKES_EACH_SIDE; i++) {
      const s = allStrikes[atmIdx - i];
      if (typeof s === 'number' && liveMap.has(`${s}|P`)) specs.push({ strike: s, isCall: false });
    }
  }
  // Model fallback (also covers a live chain that yielded no usable near-ATM strikes).
  if (specs.length === 0) {
    for (let i = 0; i <= STRIKES_EACH_SIDE; i++) specs.push({ strike: atm + i * step, isCall: true });
    for (let i = 0; i <= STRIKES_EACH_SIDE; i++) specs.push({ strike: atm - i * step, isCall: false });
  }
  const effectiveSource: SkyVisionTicker['source'] = source === 'LIVE' && liveMap && specs.some((sp) => liveMap.has(`${sp.strike}|${sp.isCall ? 'C' : 'P'}`)) ? 'LIVE' : 'MODEL';

  const scored: ScoredContract[] = [];
  const meta = new Map<string, { snap: ContractSnapshot; volume: number; oi: number; iv: number }>();

  for (const { strike, isCall } of specs) {
    const key = `${ticker} ${strike}${isCall ? 'C' : 'P'}`;
    const real = liveMap?.get(`${strike}|${isCall ? 'C' : 'P'}`) || null;
    const prevHist = histories.get(key) || [];

    let iv: number;
    let volume: number;
    let oi: number;
    let snap: ContractSnapshot;

    if (effectiveSource === 'LIVE' && real) {
      // REAL strike: take IV / OI / volume straight from the feed. Use real greeks
      // when the feed supplies them; fall back to analytic BSM greeks only for any
      // greek the feed omits. No Math.random — every value has a real source.
      iv = real.iv > 0 ? clamp(real.iv, 0.01, 5) : iv0;
      volume = Math.max(0, Math.round(real.volume));
      oi = Math.max(0, Math.round(real.oi));
      const base = snapshotFromMarket({ t: tickIndex, spot, strike, dteDays: dte, iv, isCall, volume, oi, r: RISK_FREE });
      snap = {
        ...base,
        delta: real.delta ?? base.delta,
        gamma: real.gamma ?? base.gamma,
        theta: real.theta ?? base.theta,
        vega: real.vega ?? base.vega,
      };
    } else {
      // Deterministic MODEL fallback (no real source). Volatility skew: OTM puts
      // richer, far OTM calls slightly cheaper.
      const moneyness = (strike - spot) / (spot || 1);
      iv = clamp(iv0 + (isCall ? -0.15 : 0.25) * moneyness + 0.02 * Math.abs(moneyness), 0.05, 1.5);

      // Deterministic synthetic volume/OI derived from strike distance + directional
      // momentum (no Math.random, so the model output does not flicker every call).
      // In-direction, near-ATM contracts carry more flow; OI builds slowly with each
      // tick the contract stays in focus.
      const nearness = Math.max(0, 1 - Math.abs(strike - spot) / (4 * step));
      const dirFlow = isCall ? Math.max(0, momentum) : Math.max(0, -momentum);
      const prevVol = prevHist.length ? prevHist[prevHist.length - 1].volume : 250 + nearness * 400;
      const prevOi = prevHist.length ? prevHist[prevHist.length - 1].oi : 1200 + nearness * 1500;
      volume = Math.max(20, Math.round(prevVol * 0.6 + (250 + nearness * 600 + dirFlow * 220 * nearness) * 0.4));
      oi = Math.max(50, Math.round(prevOi + nearness * 30 + dirFlow * 25 * nearness));
      snap = snapshotFromMarket({ t: tickIndex, spot, strike, dteDays: dte, iv, isCall, volume, oi, r: RISK_FREE });
    }

    const hist = prevHist.concat(snap).slice(-HISTORY_CAP);
    histories.set(key, hist);
    lastSeen.set(key, tickIndex);
    meta.set(key, { snap, volume, oi, iv });

    scored.push({ key, strike, isCall, strength: scoreContract(hist, isCall) });
  }

  const ranked = rankContractStrengths(scored);
  const byKey = new Map(ranked.map((r) => [r.key, r]));

  const contracts: SkyVisionContractOut[] = ranked.map((r) => {
    const m = meta.get(r.key)!;
    return {
      key: r.key,
      strike: r.strike,
      isCall: r.isCall,
      premium: m.snap.premium,
      delta: m.snap.delta,
      gamma: m.snap.gamma,
      theta: m.snap.theta,
      vega: m.snap.vega,
      iv: round2(m.iv),
      volume: m.volume,
      oi: m.oi,
      strength: r.strength.score,
      trend: r.strength.trend,
      confidence: r.strength.confidence,
      label: r.strength.label,
      rank: r.rank,
      strongest: r.strongest,
    };
  });

  const bestCall = contracts.filter((c) => c.isCall).sort((a, b) => b.strength - a.strength)[0] || null;
  const bestPut = contracts.filter((c) => !c.isCall).sort((a, b) => b.strength - a.strength)[0] || null;

  // Direction: stronger side wins, with a neutral band.
  const callS = bestCall?.strength ?? 0;
  const putS = bestPut?.strength ?? 0;
  const direction: SkyVisionTicker['direction'] = callS - putS > 8 ? 'BULLISH' : putS - callS > 8 ? 'BEARISH' : 'NEUTRAL';
  const leadIsCall = direction !== 'BEARISH';
  const lead = leadIsCall ? bestCall : bestPut;

  // Walls from the focus chain (max-OI strike each side; gamma wall = directional wall).
  const callsAbove = contracts.filter((c) => c.isCall && c.strike >= spot);
  const putsBelow = contracts.filter((c) => !c.isCall && c.strike <= spot);
  const callWall = (callsAbove.sort((a, b) => b.oi - a.oi)[0]?.strike) ?? atm + step;
  const putWall = (putsBelow.sort((a, b) => b.oi - a.oi)[0]?.strike) ?? atm - step;
  const walls = { gamma: leadIsCall ? callWall : putWall, call: callWall, put: putWall };

  // Target stack + premium projection for the leading contract.
  const leadStrike = lead?.strike ?? atm;
  const leadIv = lead ? lead.iv : iv0;
  const stack = buildTargetStack({
    spot,
    isCall: leadIsCall,
    emas,
    walls: { gamma: walls.gamma, call: callWall, put: putWall },
    emHigh: spot + emPts,
    emLow: spot - emPts,
  });
  const targetStack = projectTargetPremiums(stack, { spot, strike: leadStrike, dteDays: dte, iv: leadIv, isCall: leadIsCall, entryPremium: lead?.premium });

  // Swing read for the leading contract.
  const leadKey = lead?.key ?? `${ticker} ${atm}${leadIsCall ? 'C' : 'P'}`;
  const leadHist = histories.get(leadKey) || [];
  const dealerAligned = leadIsCall ? spot < callWall : spot > putWall; // room to run to the wall
  const swing = detectSwings({ isCall: leadIsCall, emas, history: leadHist, dealerAligned });

  // Master-score sub-components.
  const flowStrength = lead ? trendScore(leadHist, (s) => s.volume) : 50;
  const volumeProfile = flowStrength;
  const ivStructure = lead ? trendScore(leadHist, (s) => s.iv) : 50;
  const emaStruct = emaStructureScore(spot, emas, leadIsCall);
  const dealerPositioning = Math.round(clamp(50 + (dealerAligned ? 20 : -10) + (emaStruct - 50) * 0.3, 0, 100));
  const swingEngine = Math.max(swing.shortTerm.strength, swing.longTerm.strength);

  const master = computeMasterScore({
    contractStrength: lead?.strength ?? 50,
    flowStrength,
    dealerPositioning,
    emaStructure: emaStruct,
    volumeProfile,
    ivStructure,
    swingEngine,
    direction,
    bestContract: leadKey,
    swingType: swing.shortTerm.detected ? `Short-term (${swing.shortTerm.expectedDuration})` : swing.longTerm.detected ? `Long-term (${swing.longTerm.expectedDuration})` : 'No active swing',
    target: targetStack[0] ? `${targetStack[0].label} ${targetStack[0].underlying}` : '—',
  });

  cache[ticker] = {
    ticker,
    spot: round2(spot),
    direction,
    emaLadder: emas,
    walls,
    bestCall,
    bestPut,
    contracts,
    targetStack,
    leadContract: leadKey,
    swing,
    master,
    source: effectiveSource,
    isLive: effectiveSource === 'LIVE',
    updatedAt: Date.now(),
  };
}

/** Drop contract histories whose strikes have drifted out of focus. */
function pruneStale(): void {
  for (const [key, t] of lastSeen) {
    if (tickIndex - t > 40) {
      histories.delete(key);
      lastSeen.delete(key);
    }
  }
}

export function getSkyVision(ticker: string): SkyVisionTicker | undefined {
  return cache[ticker];
}
