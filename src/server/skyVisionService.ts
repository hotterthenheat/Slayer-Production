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
 * Mock chain for now (deterministic + evolving); swap snapshotFromMarket inputs for
 * a real chain feed later without touching the engine.
 */
import { db } from './state';
import { ASSET_LIST } from '../data';
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

const FOCUS_TICKERS = ['SPX', 'NDX', 'QQQ', 'SPY'];
const DTE_DAYS = 1; // Sky Vision focuses on 0–1DTE intraday contracts
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
  return type === 'INDEXES' ? 0.13 : type === 'ETFS' ? 0.16 : 0.18;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Number(v.toFixed(2));

/** Trend of a metric across a contract's history, mapped to 0..100 (50 = flat). */
function trendScore(hist: ContractSnapshot[], pick: (s: ContractSnapshot) => number): number {
  if (hist.length < 2) return 50;
  const a = pick(hist[0]);
  const b = pick(hist[hist.length - 1]);
  const rel = (b - a) / (Math.abs(a) + 1e-9);
  return Math.round(clamp(50 + 50 * Math.tanh(3 * rel), 0, 100));
}

/** Advance the engine one tick for every focus ticker and cache the result. */
export function tickSkyVision(): void {
  tickIndex++;
  for (const asset of ASSET_LIST.filter((a) => FOCUS_TICKERS.includes(a.ticker))) {
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
  const emPts = spot * iv0 * Math.sqrt(DTE_DAYS / 365);

  // Build the focus chain: ATM..+3 calls, ATM..-3 puts.
  const specs: { strike: number; isCall: boolean }[] = [];
  for (let i = 0; i <= STRIKES_EACH_SIDE; i++) specs.push({ strike: atm + i * step, isCall: true });
  for (let i = 0; i <= STRIKES_EACH_SIDE; i++) specs.push({ strike: atm - i * step, isCall: false });

  const scored: ScoredContract[] = [];
  const meta = new Map<string, { snap: ContractSnapshot; volume: number; oi: number; iv: number }>();

  for (const { strike, isCall } of specs) {
    const key = `${ticker} ${strike}${isCall ? 'C' : 'P'}`;
    // Volatility skew: OTM puts richer, far OTM calls slightly cheaper.
    const moneyness = (strike - spot) / (spot || 1);
    const iv = clamp(iv0 + (isCall ? -0.15 : 0.25) * moneyness + 0.02 * Math.abs(moneyness), 0.05, 1.5);

    // Evolving mock volume/OI: in-direction, near-ATM contracts attract flow when
    // price moves their way; OI builds slowly. Gives the strength engine real signal.
    const nearness = Math.max(0, 1 - Math.abs(strike - spot) / (4 * step));
    const dirFlow = isCall ? Math.max(0, momentum) : Math.max(0, -momentum);
    const prevHist = histories.get(key) || [];
    const prevVol = prevHist.length ? prevHist[prevHist.length - 1].volume : 250 + nearness * 400;
    const prevOi = prevHist.length ? prevHist[prevHist.length - 1].oi : 1200 + nearness * 1500;
    const volume = Math.max(20, Math.round(prevVol * 0.6 + (250 + nearness * 600 + dirFlow * 220 * nearness) * 0.4 + (Math.random() - 0.5) * 40));
    const oi = Math.max(50, Math.round(prevOi + nearness * 30 + dirFlow * 25 * nearness + (Math.random() - 0.5) * 10));

    const snap = snapshotFromMarket({ t: tickIndex, spot, strike, dteDays: DTE_DAYS, iv, isCall, volume, oi, r: RISK_FREE });
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
  const targetStack = projectTargetPremiums(stack, { spot, strike: leadStrike, dteDays: DTE_DAYS, iv: leadIv, isCall: leadIsCall, entryPremium: lead?.premium });

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
