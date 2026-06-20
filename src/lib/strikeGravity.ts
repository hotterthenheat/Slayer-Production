/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * STRIKE GRAVITY ENGINE
 * ---------------------
 * Options markets react around *concentrations* of dealer positioning, not a
 * single loaded strike. Rather than tracking only the highest-GEX strike, this
 * engine scores EVERY strike and builds a map of where dealer pressure clusters:
 *
 *   Gravity = GEXweight·0.4 + OIweight·0.2 + VolumeWeight·0.2 + ProximityWeight·0.2
 *
 * where each *weight* is the strike's value on that axis normalized to [0,1]
 * across the chain. From the ranked strikes it derives the primary magnet, the
 * nearest strong neighbor above/below spot, and contiguous "dealer zones"
 * (support / resistance walls) so a band like 6200–6220 is treated as one wall.
 *
 * All inputs are REAL per-strike data from the GEX profile (signed GEX, call/put
 * OI, call/put volume). When a dimension carries no signal (e.g. no per-strike
 * volume on a keyless mock chain) its weight is redistributed across the others
 * so the composite stays comparable — never fabricated.
 */
import { GexStrikeDetail } from '../types';

export interface GravityWeights {
  gex: number;
  oi: number;
  volume: number;
  proximity: number;
}

export const DEFAULT_GRAVITY_WEIGHTS: GravityWeights = { gex: 0.4, oi: 0.2, volume: 0.2, proximity: 0.2 };

export interface GravityStrike {
  strike: number;
  gravityScore: number;     // composite 0..1
  gexWeight: number;        // normalized 0..1
  oiWeight: number;
  volWeight: number;
  proximityWeight: number;
  netGex: number;           // signed $ notional
  absGex: number;
  oi: number;               // call + put OI
  volume: number;           // call + put volume
  distancePct: number;      // signed (strike - spot) / spot
  side: 'support' | 'resistance' | 'atm';
}

export interface GravityZone {
  lo: number;
  hi: number;
  strikes: number[];
  netGex: number;           // summed signed GEX across the zone
  gravity: number;          // summed gravity score across the zone
  side: 'support' | 'resistance' | 'straddle';
}

export interface StrikeGravityResult {
  spot: number;
  ranked: GravityStrike[];          // top N by gravity, descending
  primary: GravityStrike | null;    // single strongest magnet
  upperNeighbor: GravityStrike | null; // strongest strike above spot
  lowerNeighbor: GravityStrike | null; // strongest strike below spot
  resistanceWall: GravityZone | null;  // strongest zone fully above spot
  supportWall: GravityZone | null;     // strongest zone fully below spot
  zones: GravityZone[];             // all clustered zones, gravity-desc
  clusterScore: number;             // 0..1 — gravity concentration in the top zone
  weightsUsed: GravityWeights;      // effective (renormalized) weights
}

const finite = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/**
 * Score every strike and build the dealer-pressure map.
 * @param strikes per-strike GEX/OI/volume detail (from gex_profile.strikes)
 * @param spot    current underlying price
 * @param topN    how many ranked strikes to return (default 10)
 * @param weights override the axis weights (default 0.4/0.2/0.2/0.2)
 * @param proximityScale exponential decay scale for the proximity weight, as a
 *        fraction of spot (default 0.04 ⇒ a strike 4% from spot scores ~0.37).
 */
export function computeStrikeGravity(
  strikes: GexStrikeDetail[],
  spot: number,
  topN = 10,
  weights: GravityWeights = DEFAULT_GRAVITY_WEIGHTS,
  proximityScale = 0.04,
): StrikeGravityResult {
  const empty: StrikeGravityResult = {
    spot, ranked: [], primary: null, upperNeighbor: null, lowerNeighbor: null,
    resistanceWall: null, supportWall: null, zones: [], clusterScore: 0, weightsUsed: weights,
  };
  if (!Array.isArray(strikes) || strikes.length === 0 || !(spot > 0)) return empty;

  // Aggregate raw per-strike axes.
  const raw = strikes
    .map((s) => {
      const netGex = finite(s.netGex);
      const oi = finite(s.callOi) + finite(s.putOi);
      const volume = finite(s.callVolume) + finite(s.putVolume);
      return { strike: finite(s.strike), netGex, absGex: Math.abs(netGex), oi, volume };
    })
    .filter((s) => s.strike > 0);
  if (raw.length === 0) return empty;

  const maxAbsGex = Math.max(...raw.map((s) => s.absGex));
  const maxOi = Math.max(...raw.map((s) => s.oi));
  const maxVol = Math.max(...raw.map((s) => s.volume));

  // Redistribute the weight of any axis that has no signal (max ≈ 0) across the
  // axes that do, so the composite remains a true [0,1] blend and isn't silently
  // deflated. Proximity always has signal.
  const hasGex = maxAbsGex > 0, hasOi = maxOi > 0, hasVol = maxVol > 0;
  let wGex = hasGex ? weights.gex : 0;
  let wOi = hasOi ? weights.oi : 0;
  let wVol = hasVol ? weights.volume : 0;
  let wProx = weights.proximity;
  const wSum = wGex + wOi + wVol + wProx || 1;
  wGex /= wSum; wOi /= wSum; wVol /= wSum; wProx /= wSum;
  const weightsUsed: GravityWeights = { gex: wGex, oi: wOi, volume: wVol, proximity: wProx };

  const scored: GravityStrike[] = raw.map((s) => {
    const gexWeight = hasGex ? s.absGex / maxAbsGex : 0;
    const oiWeight = hasOi ? s.oi / maxOi : 0;
    const volWeight = hasVol ? s.volume / maxVol : 0;
    const distancePct = (s.strike - spot) / spot;
    const proximityWeight = Math.exp(-Math.abs(distancePct) / proximityScale);
    const gravityScore = wGex * gexWeight + wOi * oiWeight + wVol * volWeight + wProx * proximityWeight;
    const side: GravityStrike['side'] =
      Math.abs(distancePct) < 0.001 ? 'atm' : distancePct > 0 ? 'resistance' : 'support';
    return {
      strike: s.strike, gravityScore, gexWeight, oiWeight, volWeight, proximityWeight,
      netGex: s.netGex, absGex: s.absGex, oi: s.oi, volume: s.volume, distancePct, side,
    };
  });

  const byGravity = [...scored].sort((a, b) => b.gravityScore - a.gravityScore);
  const ranked = byGravity.slice(0, topN);
  const primary = byGravity[0] || null;
  const upperNeighbor = byGravity.find((s) => s.strike > spot) || null;
  const lowerNeighbor = byGravity.find((s) => s.strike < spot) || null;

  // --- Dealer zones: cluster the top strikes that sit close together --------
  // Estimate the strike step from the median gap between ALL sorted strikes, then
  // group ranked strikes whose neighbors are within ~2.5 steps into one zone.
  const allStrikesSorted = [...new Set(scored.map((s) => s.strike))].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < allStrikesSorted.length; i++) gaps.push(allStrikesSorted[i] - allStrikesSorted[i - 1]);
  // Estimate the base strike step from a LOW percentile of the gaps (not the
  // median): the increment is the smallest regular spacing, and a median is thrown
  // off by missing/illiquid strikes — which would over-merge distinct walls.
  const sortedGaps = gaps.slice().sort((a, b) => a - b);
  const step = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length * 0.25)] : spot * 0.005;
  const zoneGap = Math.max(step * 2.5, spot * 0.001);

  // Cluster a set of strikes into contiguous zones (gap ≤ zoneGap stays together).
  const buildZones = (items: GravityStrike[]): GravityZone[] => {
    const sorted = [...items].sort((a, b) => a.strike - b.strike);
    const out: GravityZone[] = [];
    let current: GravityStrike[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const lo = current[0].strike;
      const hi = current[current.length - 1].strike;
      const netGex = current.reduce((sum, s) => sum + s.netGex, 0);
      const gravity = current.reduce((sum, s) => sum + s.gravityScore, 0);
      const side: GravityZone['side'] = hi < spot ? 'support' : lo > spot ? 'resistance' : 'straddle';
      out.push({ lo, hi, strikes: current.map((s) => s.strike), netGex, gravity, side });
      current = [];
    };
    for (const s of sorted) {
      if (current.length && s.strike - current[current.length - 1].strike > zoneGap) flush();
      current.push(s);
    }
    flush();
    return out;
  };

  // The overall dealer-zone map (contiguous clusters, may straddle spot = pin zone).
  const zones = buildZones(ranked).sort((a, b) => b.gravity - a.gravity);

  // Support/resistance WALLS are directional: cluster the ranked strikes on each
  // side of spot SEPARATELY so a wall is always derivable even when the overall
  // pressure forms one zone straddling price.
  const supportWall = buildZones(ranked.filter((s) => s.strike < spot)).sort((a, b) => b.gravity - a.gravity)[0] || null;
  const resistanceWall = buildZones(ranked.filter((s) => s.strike > spot)).sort((a, b) => b.gravity - a.gravity)[0] || null;

  const totalGravity = ranked.reduce((sum, s) => sum + s.gravityScore, 0) || 1;
  const clusterScore = zones.length ? Math.min(1, zones[0].gravity / totalGravity) : 0;

  return { spot, ranked, primary, upperNeighbor, lowerNeighbor, resistanceWall, supportWall, zones, clusterScore, weightsUsed };
}
