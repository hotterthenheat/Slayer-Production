/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER DYNAMICS ENGINE
 * ----------------------
 * Most platforms show a static snapshot of dealer positioning. Institutions track
 * how that positioning is *moving*. This engine adds the time-derivative and
 * structural layers on top of GEX/loaded-strikes:
 *
 *   • Vanna Engine        — net vanna + trend. When IV falls dealers buy futures;
 *                           when IV rises they sell. Flags hedge-flow direction.
 *   • Charm Engine        — time-decay hedging flow (per-day), bullish/bearish.
 *   • Strike Migration    — is the gamma center-of-mass drifting up (bullish) or
 *                           down (bearish)?
 *   • Gamma Velocity/Accel— are dealers rapidly ADDING or REMOVING hedges?
 *   • Liquidity Vacuums   — strike bands with little OI/GEX/volume that price rips
 *                           through fast (explosive-move targets).
 *   • Wall Strength 0-100 — not all walls are equal; blends gamma, OI and volume.
 *
 * The derivative pieces need history; the caller passes a rolling snapshot array
 * (one per tick) and gets back the dynamics plus the snapshot to append. All
 * inputs are real (chain greeks/OI/volume + dealer inventory) — never fabricated.
 */
import { ChainContract } from './v11Math';

export interface DealerSnapshot {
  t: number;        // timestamp (ms)
  netGex: number;
  netVanna: number;
  netCharm: number; // per-day
  gexCoM: number;   // gamma-weighted center-of-mass strike
}

export interface VannaEngine {
  net: number;
  velocity: number; // change vs prior snapshot
  trend: 'RISING' | 'FALLING' | 'FLAT';
  hedgeFlow: 'SUPPORTIVE' | 'PRESSURING' | 'NEUTRAL';
  note: string;
}

export interface CharmEngine {
  netPerDay: number;
  intensity: number; // 0..1 relative to recent history
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  note: string;
}

export interface MigrationEngine {
  comCurrent: number;
  comPrevious: number;
  shift: number;     // comCurrent - comPrevious (price units)
  score: number;     // -1..1 normalized by spot
  direction: 'BULLISH' | 'BEARISH' | 'STABLE';
}

export interface GammaDynamics {
  velocity: number;       // Δ netGex vs prior snapshot
  acceleration: number;   // Δ velocity
  state: 'ADDING_HEDGES' | 'REMOVING_HEDGES' | 'STABLE';
}

export interface VacuumZone {
  lo: number;
  hi: number;
  widthPct: number;  // (hi-lo)/spot
  score: number;     // 0..1 — emptier & wider ⇒ higher
  side: 'above' | 'below';
}

export interface LiquidityVacuums {
  zones: VacuumZone[];        // strongest-first
  nearestAbove: VacuumZone | null;
  nearestBelow: VacuumZone | null;
}

export interface WallStrengthScore {
  strike: number;
  score: number; // 0..100
}

export interface WallStrength {
  support: WallStrengthScore | null;
  resistance: WallStrengthScore | null;
}

export interface DealerDynamics {
  vanna: VannaEngine;
  charm: CharmEngine;
  migration: MigrationEngine;
  gamma: GammaDynamics;
  vacuums: LiquidityVacuums;
  walls: WallStrength;
}

const fin = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const HISTORY_CAP = 180;

interface PerStrike { strike: number; gexMag: number; oi: number; volume: number; }

/** Aggregate the chain into per-strike gamma-magnitude / OI / volume. */
function aggregateStrikes(chain: ChainContract[], spot: number): PerStrike[] {
  const map = new Map<number, PerStrike>();
  for (const c of chain) {
    const strike = fin(c.strike);
    if (strike <= 0) continue;
    // $ gamma exposure magnitude (constants cancel in all the relative uses here).
    const gexMag = Math.abs(fin(c.gamma) * fin(c.openInterest) * 100 * spot * spot * 0.01);
    const row = map.get(strike) || { strike, gexMag: 0, oi: 0, volume: 0 };
    row.gexMag += gexMag;
    row.oi += fin(c.openInterest);
    row.volume += fin(c.volume);
    map.set(strike, row);
  }
  return Array.from(map.values()).sort((a, b) => a.strike - b.strike);
}

/**
 * Compute the full dealer-dynamics block.
 * @param chain     option chain (greeks/OI/volume) for the asset
 * @param spot      current underlying price
 * @param inventory current net dealer greeks { netGex, netVanna, netCharm(per-day) }
 * @param history   rolling DealerSnapshot[] (oldest→newest); a new snapshot is appended
 */
export function computeDealerDynamics(
  chain: ChainContract[],
  spot: number,
  inventory: { netGex: number; netVanna: number; netCharm: number },
  history: DealerSnapshot[],
): DealerDynamics {
  const per = aggregateStrikes(chain || [], spot);
  const netGex = fin(inventory.netGex);
  const netVanna = fin(inventory.netVanna);
  const netCharm = fin(inventory.netCharm);

  // Gamma center-of-mass (gamma-weighted average strike).
  const totGex = per.reduce((s, p) => s + p.gexMag, 0);
  const gexCoM = totGex > 0 ? per.reduce((s, p) => s + p.strike * p.gexMag, 0) / totGex : spot;

  const prev = history.length ? history[history.length - 1] : null;
  const prev2 = history.length > 1 ? history[history.length - 2] : null;

  // --- Vanna --------------------------------------------------------------
  const vannaVel = prev ? netVanna - prev.netVanna : 0;
  const vannaTrend: VannaEngine['trend'] = Math.abs(vannaVel) < Math.max(1e-9, Math.abs(netVanna) * 0.02)
    ? 'FLAT' : vannaVel > 0 ? 'RISING' : 'FALLING';
  // Positive net vanna ⇒ a vol DROP makes dealers buy (supportive); negative ⇒
  // a vol drop makes them sell (pressuring). (∂Δ_dealer/∂σ sign.)
  const hedgeFlow: VannaEngine['hedgeFlow'] = Math.abs(netVanna) < 1e-9 ? 'NEUTRAL' : netVanna > 0 ? 'SUPPORTIVE' : 'PRESSURING';
  const vanna: VannaEngine = {
    net: netVanna, velocity: vannaVel, trend: vannaTrend, hedgeFlow,
    note: hedgeFlow === 'SUPPORTIVE'
      ? 'Falling IV → dealer futures buying (supportive); rising IV → selling.'
      : hedgeFlow === 'PRESSURING'
        ? 'Falling IV → dealer futures selling (pressuring); rising IV → buying.'
        : 'Vanna near flat — minimal IV-driven hedge flow.',
  };

  // --- Charm --------------------------------------------------------------
  const recentCharm = history.slice(-20).map((h) => Math.abs(h.netCharm));
  const maxCharm = Math.max(Math.abs(netCharm), ...(recentCharm.length ? recentCharm : [0]));
  const charm: CharmEngine = {
    netPerDay: netCharm,
    intensity: maxCharm > 0 ? Math.min(1, Math.abs(netCharm) / maxCharm) : 0,
    bias: Math.abs(netCharm) < 1e-9 ? 'NEUTRAL' : netCharm > 0 ? 'BULLISH' : 'BEARISH',
    note: 'Time-decay hedging flow dealers must execute as expiry approaches (acute for 0DTE).',
  };

  // --- Strike migration ---------------------------------------------------
  const comPrev = prev ? prev.gexCoM : gexCoM;
  const shift = gexCoM - comPrev;
  const migScore = spot > 0 ? Math.max(-1, Math.min(1, shift / (spot * 0.01))) : 0; // ±1 == ±1% move of CoM
  const migration: MigrationEngine = {
    comCurrent: gexCoM, comPrevious: comPrev, shift, score: migScore,
    direction: Math.abs(migScore) < 0.05 ? 'STABLE' : migScore > 0 ? 'BULLISH' : 'BEARISH',
  };

  // --- Gamma velocity / acceleration --------------------------------------
  const gVel = prev ? netGex - prev.netGex : 0;
  const gPrevVel = prev && prev2 ? prev.netGex - prev2.netGex : 0;
  const gAcc = gVel - gPrevVel;
  const gThresh = Math.max(1e6, Math.abs(netGex) * 0.03);
  const gamma: GammaDynamics = {
    velocity: gVel, acceleration: gAcc,
    state: Math.abs(gVel) < gThresh ? 'STABLE' : gVel > 0 ? 'ADDING_HEDGES' : 'REMOVING_HEDGES',
  };

  // --- Liquidity vacuums --------------------------------------------------
  const vacuums = detectVacuums(per, spot);

  // --- Wall strength (0-100) ---------------------------------------------
  const walls = computeWallStrength(per, spot);

  // Append snapshot (caller persists `history`).
  history.push({ t: Date.now(), netGex, netVanna, netCharm, gexCoM });
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);

  return { vanna, charm, migration, gamma, vacuums, walls };
}

/** Low-liquidity bands (little OI/GEX/volume) between loaded strikes. */
function detectVacuums(per: PerStrike[], spot: number): LiquidityVacuums {
  const empty: LiquidityVacuums = { zones: [], nearestAbove: null, nearestBelow: null };
  if (per.length < 3 || !(spot > 0)) return empty;

  const maxGex = Math.max(...per.map((p) => p.gexMag)) || 1;
  const maxOi = Math.max(...per.map((p) => p.oi)) || 1;
  const maxVol = Math.max(...per.map((p) => p.volume)) || 1;
  // Per-strike liquidity (no proximity term — this is pure structure).
  const liq = per.map((p) => 0.4 * (p.gexMag / maxGex) + 0.3 * (p.oi / maxOi) + 0.3 * (p.volume / maxVol));
  const THRESH = 0.15; // bottom-end liquidity

  const zones: VacuumZone[] = [];
  let runStart = -1;
  let runSum = 0;
  let runCount = 0;
  const flush = (endIdx: number) => {
    if (runStart < 0 || runCount === 0) { runStart = -1; runSum = 0; runCount = 0; return; }
    const lo = per[runStart].strike;
    const hi = per[endIdx].strike;
    const widthPct = (hi - lo) / spot;
    const avgLiq = runSum / runCount;
    // Emptier (low avgLiq) and wider ⇒ stronger vacuum.
    const score = Math.max(0, Math.min(1, (1 - avgLiq / THRESH) * 0.6 + Math.min(1, widthPct / 0.03) * 0.4));
    if (hi > lo) zones.push({ lo, hi, widthPct, score, side: hi <= spot ? 'below' : lo >= spot ? 'above' : (Math.abs(hi - spot) < Math.abs(spot - lo) ? 'above' : 'below') });
    runStart = -1; runSum = 0; runCount = 0;
  };
  for (let i = 0; i < per.length; i++) {
    if (liq[i] < THRESH) {
      if (runStart < 0) runStart = i;
      runSum += liq[i]; runCount++;
    } else {
      // Close a run, anchoring the zone between the last loaded strike and this one.
      if (runStart >= 0) flush(i);
    }
  }
  if (runStart >= 0) flush(per.length - 1);

  zones.sort((a, b) => b.score - a.score);
  const nearestAbove = zones.filter((z) => z.lo >= spot || z.side === 'above').sort((a, b) => a.lo - b.lo)[0] || null;
  const nearestBelow = zones.filter((z) => z.hi <= spot || z.side === 'below').sort((a, b) => b.hi - a.hi)[0] || null;
  return { zones: zones.slice(0, 6), nearestAbove, nearestBelow };
}

/** 0-100 wall strength for the strongest loaded strike on each side of spot. */
function computeWallStrength(per: PerStrike[], spot: number): WallStrength {
  if (per.length === 0) return { support: null, resistance: null };
  const maxGex = Math.max(...per.map((p) => p.gexMag)) || 1;
  const maxOi = Math.max(...per.map((p) => p.oi)) || 1;
  const maxVol = Math.max(...per.map((p) => p.volume)) || 1;
  const strength = (p: PerStrike) => Math.round(100 * (0.5 * (p.gexMag / maxGex) + 0.25 * (p.oi / maxOi) + 0.25 * (p.volume / maxVol)));

  // Pick the highest-gamma strike on each side, then score its strength.
  const below = per.filter((p) => p.strike < spot).sort((a, b) => b.gexMag - a.gexMag)[0];
  const above = per.filter((p) => p.strike > spot).sort((a, b) => b.gexMag - a.gexMag)[0];
  return {
    support: below ? { strike: below.strike, score: strength(below) } : null,
    resistance: above ? { strike: above.strike, score: strength(above) } : null,
  };
}
