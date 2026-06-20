import { Candle, FairValueGap, LiquidityEvent } from '../types';

// ---------- Wilder ATR (RMA) ----------
export function wilderATRSeries(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const atrs = new Array<number>(n).fill(0);
  if (n === 0) return atrs;
  let prevClose = candles[0].close;
  const trs: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const tr = i === 0 ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    trs.push(tr);
    prevClose = c.close;
  }
  if (n < period) { // running mean keeps ratios finite during warmup
    let run = 0;
    for (let i = 0; i < n; i++) { run += trs[i]; atrs[i] = run / (i + 1); }
    return atrs;
  }
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trs[i];
  atr /= period;
  atrs[period - 1] = atr;
  for (let i = period; i < n; i++) { atr = (atr * (period - 1) + trs[i]) / period; atrs[i] = atr; }
  for (let i = 0; i < period - 1; i++) atrs[i] = atrs[period - 1];
  return atrs;
}

export function percentileRank(series: number[], window: number): number {
  const n = series.length;
  if (n === 0) return 50;
  const slice = series.slice(Math.max(0, n - window));
  const last = slice[slice.length - 1];
  if (slice.length <= 1) return 50;
  let below = 0;
  for (const v of slice) if (v < last) below++;
  return (below / (slice.length - 1)) * 100;
}

// ---------- Fractal pivots (confirmed at i+width only) ----------
export interface Pivot { index: number; price: number; type: 'high' | 'low'; }

export function fractalPivots(candles: Candle[], width = 2): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = []; const lows: Pivot[] = [];
  const n = candles.length;
  if (n < width * 2 + 1) return { highs, lows };
  for (let i = width; i < n - width; i++) {
    let isHigh = true, isLow = true;
    for (let j = -width; j <= width; j++) {
      if (j === 0) continue;
      if (candles[i + j].high >= candles[i].high) isHigh = false;
      if (candles[i + j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ index: i, price: candles[i].high, type: 'high' });
    if (isLow) lows.push({ index: i, price: candles[i].low, type: 'low' });
  }
  return { highs, lows };
}

// ---------- Displacement zones (states by PRICE INTERACTION) ----------
export type ZoneState = 'ACTIVE' | 'MITIGATED' | 'INVALIDATED';
export interface DisplacementZone {
  id: string; type: 'bullish' | 'bearish';
  top: number; bottom: number; equilibrium: number;
  createdAtIdx: number; timestamp: number;
  atrMultiple: number; bodyDominance: number; score: number;
  state: ZoneState; mitigatedAtIdx?: number; invalidatedAtIdx?: number;
}

export function detectDisplacementZones(
  candles: Candle[],
  opts: { atrMultiple?: number; bodyDominance?: number; maxZones?: number } = {}
): { zones: DisplacementZone[]; flags: boolean[] } {
  const { atrMultiple = 1.4, bodyDominance = 0.55, maxZones = 12 } = opts;
  const n = candles.length;
  const flags = new Array<boolean>(n).fill(false);
  const zones: DisplacementZone[] = [];
  if (n < 3) return { zones, flags };
  const atrs = wilderATRSeries(candles);

  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const atr = atrs[i] || 1e-9;
    const body = Math.abs(c.close - c.open);
    const range = Math.max(c.high - c.low, 1e-9);
    const dominance = body / range;
    const force = body / atr;
    if (force >= atrMultiple && dominance >= bodyDominance) {
      flags[i] = true;
      const type = c.close >= c.open ? 'bullish' as const : 'bearish' as const;
      const top = Math.max(c.open, c.close);
      const bottom = Math.min(c.open, c.close);
      const rvol = c.relativeVolume ?? 1;
      const score = Math.round(Math.min(force / 3, 1) * 60 + dominance * 25 + Math.min(rvol / 3, 1) * 15);
      zones.push({
        id: `dz-${type}-${i}-${c.timestamp}`, type, top, bottom,
        equilibrium: (top + bottom) / 2, createdAtIdx: i, timestamp: c.timestamp,
        atrMultiple: Number(force.toFixed(2)), bodyDominance: Number(dominance.toFixed(2)),
        score, state: 'ACTIVE',
      });
    }
  }
  // Resolve states by walking forward — NOT by recency.
  for (const z of zones) {
    for (let j = z.createdAtIdx + 1; j < n; j++) {
      const c = candles[j];
      const touched = c.low <= z.top && c.high >= z.bottom;
      if (touched && z.state === 'ACTIVE') { z.state = 'MITIGATED'; z.mitigatedAtIdx = j; }
      if (z.type === 'bullish' && c.close < z.bottom) { z.state = 'INVALIDATED'; z.invalidatedAtIdx = j; break; }
      if (z.type === 'bearish' && c.close > z.top) { z.state = 'INVALIDATED'; z.invalidatedAtIdx = j; break; }
    }
  }
  return { zones: zones.slice(-maxZones), flags };
}

// ---------- FVG with full state machine ----------
export function detectFairValueGaps(candles: Candle[], minBodyRatio = 0.4): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  const n = candles.length;
  for (let i = 2; i < n; i++) {
    const a = candles[i - 2], b = candles[i - 1], c = candles[i];
    const impulsive = Math.abs(b.close - b.open) / Math.max(b.high - b.low, 1e-9) >= minBodyRatio || !!b.isDisplacement;
    if (!impulsive) continue;
    if (c.low > a.high) {
      fvgs.push({ id: `fvg-bull-${i}-${c.timestamp}`, type: 'bullish', top: c.low, bottom: a.high,
        equilibrium: (c.low + a.high) / 2, state: 'ARMED', createdAtIdx: i });
    } else if (c.high < a.low) {
      fvgs.push({ id: `fvg-bear-${i}-${c.timestamp}`, type: 'bearish', top: a.low, bottom: c.high,
        equilibrium: (a.low + c.high) / 2, state: 'ARMED', createdAtIdx: i });
    }
  }
  for (const f of fvgs) {
    for (let j = f.createdAtIdx + 1; j < n; j++) {
      const c = candles[j];
      if (!(c.low <= f.top && c.high >= f.bottom)) continue;
      if (f.type === 'bullish') {
        if (f.testedAtIdx === undefined) f.testedAtIdx = j;
        if (c.close < f.bottom) { f.state = 'INVALIDATED'; f.invalidatedAtIdx = j; break; }
        if (c.low <= f.bottom) { f.state = 'COMPLETED'; f.completedAtIdx = j; break; }
        f.state = c.low < f.equilibrium ? 'TESTED' : 'HELD';
        if (f.state === 'HELD') f.heldAtIdx = j;
      } else {
        if (f.testedAtIdx === undefined) f.testedAtIdx = j;
        if (c.close > f.top) { f.state = 'INVALIDATED'; f.invalidatedAtIdx = j; break; }
        if (c.high >= f.top) { f.state = 'COMPLETED'; f.completedAtIdx = j; break; }
        f.state = c.high > f.equilibrium ? 'TESTED' : 'HELD';
        if (f.state === 'HELD') f.heldAtIdx = j;
      }
    }
  }
  return fvgs;
}

// ---------- Liquidity sweeps from real pivot topology ----------
export function detectLiquiditySweeps(candles: Candle[], pivotWidth = 2): LiquidityEvent[] {
  const events: LiquidityEvent[] = [];
  const n = candles.length;
  if (n < pivotWidth * 2 + 2) return events;
  const { highs, lows } = fractalPivots(candles, pivotWidth);
  const globalHigh = candles.reduce((m, c) => Math.max(m, c.high), -Infinity);
  const globalLow = candles.reduce((m, c) => Math.min(m, c.low), Infinity);

  for (let i = pivotWidth + 1; i < n; i++) {
    const c = candles[i];
    const lastHigh = [...highs].reverse().find(p => p.index + pivotWidth <= i);
    const lastLow = [...lows].reverse().find(p => p.index + pivotWidth <= i);
    if (lastHigh && c.high > lastHigh.price && c.close < lastHigh.price) {
      events.push({ id: `liq-h-${i}-${c.timestamp}`,
        label: Math.abs(lastHigh.price - globalHigh) < 1e-9 ? 'External Liquidity Grab' : 'Liquidity Sweep High',
        price: lastHigh.price, candleIdx: i, type: 'bearish' });
    }
    if (lastLow && c.low < lastLow.price && c.close > lastLow.price) {
      const spike = (lastLow.price - c.low) / Math.max(c.high - c.low, 1e-9);
      events.push({ id: `liq-l-${i}-${c.timestamp}`,
        label: Math.abs(lastLow.price - globalLow) < 1e-9 ? 'External Liquidity Grab'
             : spike > 0.5 ? 'Stop Run' : 'Liquidity Sweep Low',
        price: lastLow.price, candleIdx: i, type: 'bullish' });
    }
  }
  return events.filter((e, idx) => {
    if (idx === 0) return true;
    const prev = events[idx - 1];
    return !(prev.price === e.price && prev.type === e.type && e.candleIdx - prev.candleIdx <= 1);
  });
}

// ---------- BOS / CHoCH — stateful, confirmed pivots, each breaks once ----------
export interface StructureEvent {
  id: string; kind: 'BOS' | 'CHoCH'; direction: 'bullish' | 'bearish';
  price: number; candleIdx: number; timestamp: number;
}
export interface StructureRead {
  events: StructureEvent[]; trend: 'bullish' | 'bearish' | 'neutral';
  rangeHigh: number | null; rangeLow: number | null;
  equilibrium: number | null;
  pricePosition: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' | null;
}

export function analyzeMarketStructure(candles: Candle[], pivotWidth = 2): StructureRead {
  const n = candles.length;
  const events: StructureEvent[] = [];
  const { highs, lows } = fractalPivots(candles, pivotWidth);
  let trend: StructureRead['trend'] = 'neutral';
  let hi = 0, lo = 0;
  let lastBrokenHigh: number | null = null, lastBrokenLow: number | null = null;

  for (let i = pivotWidth; i < n; i++) {
    const close = candles[i].close;
    while (hi < highs.length && highs[hi].index + pivotWidth <= i) hi++;
    while (lo < lows.length && lows[lo].index + pivotWidth <= i) lo++;
    const lastHigh = hi > 0 ? highs[hi - 1] : null;
    const lastLow = lo > 0 ? lows[lo - 1] : null;

    if (lastHigh && close > lastHigh.price && lastBrokenHigh !== lastHigh.price) {
      events.push({ id: `st-up-${i}`, kind: trend === 'bearish' ? 'CHoCH' : 'BOS',
        direction: 'bullish', price: lastHigh.price, candleIdx: i, timestamp: candles[i].timestamp });
      trend = 'bullish'; lastBrokenHigh = lastHigh.price;
    }
    if (lastLow && close < lastLow.price && lastBrokenLow !== lastLow.price) {
      events.push({ id: `st-dn-${i}`, kind: trend === 'bullish' ? 'CHoCH' : 'BOS',
        direction: 'bearish', price: lastLow.price, candleIdx: i, timestamp: candles[i].timestamp });
      trend = 'bearish'; lastBrokenLow = lastLow.price;
    }
  }

  const lastHighP = highs.length ? highs[highs.length - 1].price : null;
  const lastLowP = lows.length ? lows[lows.length - 1].price : null;
  let equilibrium: number | null = null;
  let pricePosition: StructureRead['pricePosition'] = null;
  if (lastHighP !== null && lastLowP !== null && n > 0) {
    equilibrium = (lastHighP + lastLowP) / 2;
    const close = candles[n - 1].close;
    const band = (lastHighP - lastLowP) * 0.1;
    pricePosition = Math.abs(close - equilibrium) <= band ? 'EQUILIBRIUM'
      : close > equilibrium ? 'PREMIUM' : 'DISCOUNT';
  }
  return { events: events.slice(-14), trend, rangeHigh: lastHighP, rangeLow: lastLowP, equilibrium, pricePosition };
}

// ---------- Volatility Engine (REAL percentiles) ----------
export type VolRegime = 'COMPRESSION' | 'NEUTRAL' | 'EXPANSION';
export interface VolatilityEngineRead {
  regime: VolRegime; atrPercentile: number; bandwidthPercentile: number;
  squeeze: boolean; energy: number; atr: number; atrSlope: number;
}

export function computeVolatilityEngine(candles: Candle[], lookback = 100): VolatilityEngineRead {
  const n = candles.length;
  if (n < 5) return { regime: 'NEUTRAL', atrPercentile: 50, bandwidthPercentile: 50,
    squeeze: false, energy: 50, atr: 0, atrSlope: 1 };
  const atrs = wilderATRSeries(candles);
  const atrPct = percentileRank(atrs, lookback);
  const atr = atrs[n - 1];
  const atrPrev = atrs[Math.max(0, n - 11)] || atr;
  const atrSlope = atrPrev > 0 ? atr / atrPrev : 1;

  const period = Math.min(20, n);
  const bw: number[] = [];
  for (let i = period - 1; i < n; i++) {
    const win = candles.slice(i - period + 1, i + 1).map(c => c.close);
    const mean = win.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    bw.push(mean > 0 ? (4 * sd) / mean : 0);
  }
  const bwPct = percentileRank(bw, lookback);
  const regime: VolRegime = atrPct >= 70 ? 'EXPANSION' : atrPct <= 30 ? 'COMPRESSION' : 'NEUTRAL';
  const rvol = Math.min((candles[n - 1].relativeVolume ?? 1) / 3, 1);
  const slopeNorm = Math.min(Math.max((atrSlope - 0.8) / 0.8, 0), 1);
  const energy = Math.round(0.45 * atrPct + 0.35 * slopeNorm * 100 + 0.20 * rvol * 100);

  return { regime, atrPercentile: Number(atrPct.toFixed(1)),
    bandwidthPercentile: Number(bwPct.toFixed(1)), squeeze: bwPct <= 15,
    energy: Math.min(100, Math.max(0, energy)),
    atr: Number(atr.toFixed(6)), atrSlope: Number(atrSlope.toFixed(3)) };
}

// ---------- One-call composite for /api/dealer-flow + SSE payload ----------
export function computeDisplacementIntelligence(candles: Candle[]) {
  const { zones, flags } = detectDisplacementZones(candles);
  return {
    zones,
    fvgs: detectFairValueGaps(candles).slice(-14),
    sweeps: detectLiquiditySweeps(candles).slice(-14),
    structure: analyzeMarketStructure(candles),
    volatility: computeVolatilityEngine(candles),
    displacementFlags: flags,
  };
}
