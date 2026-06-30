/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * V5 / V5.1 — SkyScore contract ranker.
 *
 * Runs AFTER the directional engine emits a BUY. It does not touch direction;
 * it ranks the contracts available on that BUY by expected opportunity and
 * returns a ranked list (not a signal). Every output remains an under-the-hood
 * modifier of the single 0–100 SkyScore — V5.1 changes the math, never the UI.
 *
 * V5.1 changes (vs V5): §1.1 NBRS → Positioning Density; §1.2 EMA reachability
 * multiplier (corrected: EM/distance); §1.3 IV-mispricing penalty; §1.4 Strike
 * Dominance liquidity; §2 OI-velocity → volume-share Migration.
 *
 * Every 0–100 score routes through src/lib/normalize.ts (no Math.random, no
 * hardcoded scores). Cross-sectional scores are relative to the candidate set C.
 */

import { computeBlackScholesPrice } from './v11Math';
import { expectedMovePct as emPct } from './skyQuantCore';
import { SnapshotStore } from './snapshotStore';
import {
  clamp, normLogSaturate, normSignedTanh, normCrossSection, unit,
} from './normalize';

const EPS = 1e-9;

// ============================================================
// CONFIG (V5 Part 11 + V5.1). Defaults only; tune from the forward log (§9.5).
// ============================================================
export interface V5Config {
  // Eligibility gate
  minOI: number; minVolume: number; maxSpread: number; deltaMin: number; deltaMax: number;
  // Positioning (V5.1 §1.1 / §2)
  DENSITY_WINDOW: number; DENSITY_BASE: number; MIG_SCALE: number; OIV_SCALE: number; NBRS_CAP: number;
  // Dealer influence (Part 3)
  ACCEL_SIGN: 1 | -1; dealerWallMagWeight: number; dealerAlignWeight: number;
  exposureWeights: { gex: number; dex: number; vex: number };
  // Acceleration (Part 4)
  VE_SCALE: number; GVEL_SCALE: number; VVEL_SCALE: number; LOOKBACK_BARS: number;
  // EMA path (Part 5 + V5.1 §1.2/§1.3)
  SPOT_VOL_BETA: number; SIGMA_FLOOR: number; EMA_RET_SCALE: number; IV_PEN_K: number; IV_PEN_FLOOR: number;
  // Final blend (Part 7)
  weights: { positioning: number; dealer: number; acceleration: number; emaPath: number; liquidity: number };
  // Convexity (Part 8)
  convexityWeights: { gammaVel: number; vannaVel: number; speed: number };
  isExplosiveSky: number; isExplosiveConvexity: number;
}

export const DEFAULT_V5_CONFIG: V5Config = {
  minOI: 250, minVolume: 100, maxSpread: 0.12, deltaMin: 0.30, deltaMax: 0.60,
  DENSITY_WINDOW: 3, DENSITY_BASE: 0.5, MIG_SCALE: 0.02, OIV_SCALE: 5000, NBRS_CAP: 12,
  ACCEL_SIGN: 1, // CALIBRATION REQUIRED — confirm vs SPX dealer-flow convention before live (§3.4)
  dealerWallMagWeight: 0.60, dealerAlignWeight: 0.40,
  exposureWeights: { gex: 0.50, dex: 0.30, vex: 0.20 },
  VE_SCALE: 1.5, GVEL_SCALE: 5e8, VVEL_SCALE: 5e7, LOOKBACK_BARS: 5,
  SPOT_VOL_BETA: -0.012, SIGMA_FLOOR: 0.03, EMA_RET_SCALE: 0.5, IV_PEN_K: 1.0, IV_PEN_FLOOR: 0.5,
  weights: { positioning: 0.25, dealer: 0.25, acceleration: 0.20, emaPath: 0.20, liquidity: 0.10 }, // CALIBRATION REQUIRED
  convexityWeights: { gammaVel: 0.45, vannaVel: 0.35, speed: 0.20 },
  isExplosiveSky: 85, isExplosiveConvexity: 80,
};

// ============================================================
// TYPES
// ============================================================
export interface RankerContract {
  symbol: string;
  expiration: string;
  strike: number;
  type: 'C' | 'P';
  oi: number;
  volume: number;
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  vanna?: number;
  charm?: number;
  speed?: number;
  rvol?: number;
  gexStrike?: number; dexStrike?: number; vexStrike?: number;
  fairIv?: number;            // fitted IV from the vol surface (V5.1 §1.3); falls back to chain ATM IV
}

export interface EmaTargets { ema5: number; ema9: number; ema20: number; ema50: number; ema200: number; }

export interface RankInput {
  direction: 'bullish' | 'bearish';
  spot: number;
  dteDays: number;
  chain: RankerContract[];
  emaTargets: EmaTargets;
  dataSource: 'LIVE' | 'SIMULATED';
  totalChainVolume?: number;  // FULL chain (calls+puts) volume for Strike Dominance / Migration (§1.4/§2)
  expectedMovePct?: number;   // from computeDealerMetrics; fallback atmIV·√(dte/365) (§1.2)
  config?: Partial<V5Config>;
  store?: SnapshotStore;
}

export interface RankedCandidate {
  symbol: string; strike: number; type: 'C' | 'P';
  eligible: boolean; rejectReasons: string[];
  positioningScore: number; dealerInfluenceScore: number; accelerationScore: number;
  emaPathScore: number; liquidityScore: number;
  skyScore: number;
  convexityScore: number; convexityStatus: 'Rising Fast' | 'Rising' | 'Flat' | 'Falling';
  isExplosive: boolean;
  positioningDensity: number; volumeMigration: number; volumeExpansion: number; gammaVelocity: number; distanceFromSpotPct: number;
  emaReturns: { ema5: number; ema9: number; ema20: number; ema50: number; ema200: number };
  flags: string[];
  data_source: 'LIVE' | 'SIMULATED';
}

const EMA_KEYS: (keyof EmaTargets)[] = ['ema5', 'ema9', 'ema20', 'ema50', 'ema200'];

// ============================================================
// Helpers
// ============================================================
function mid(c: RankerContract): number { return (c.bid + c.ask) / 2; }

/** Per-strike signed dealer exposure when the adapter didn't supply it.
 *  Canonical GEX convention (shared with gexEngine / v11Math / skyQuantCore): call-positive,
 *  put-negative — so the fallback matches the adapter-supplied gexStrike/vexStrike it's compared
 *  against (e.g. the velocity deltas below). VEX is $-scaled (× spot × 0.01) to match those units. */
function exposures(c: RankerContract, spot: number) {
  const sign = c.type === 'C' ? 1 : -1;
  const gex = c.gexStrike ?? sign * (c.gamma || 0) * c.oi * 100 * spot * spot * 0.01;
  const dex = c.dexStrike ?? sign * (c.delta || 0) * c.oi * 100 * spot;
  const vex = c.vexStrike ?? sign * (c.vega || 0) * c.oi * 100 * spot * 0.01;
  return { gex, dex, vex };
}

function evaluateEligibility(c: RankerContract, targetType: 'C' | 'P', cfg: V5Config): string[] {
  const reasons: string[] = [];
  const m = mid(c);
  if (c.type !== targetType) reasons.push(`type ${c.type} != ${targetType}`);
  if (c.bid <= 0) reasons.push('bid <= 0');
  if (m <= 0) reasons.push('mid <= 0');
  if (c.oi < cfg.minOI) reasons.push(`OI ${c.oi} < ${cfg.minOI}`);
  if (c.volume < cfg.minVolume) reasons.push(`volume ${c.volume} < ${cfg.minVolume}`);
  const spread = m > 0 ? (c.ask - c.bid) / m : 1;
  if (spread > cfg.maxSpread) reasons.push(`spread ${(spread * 100).toFixed(1)}% > ${(cfg.maxSpread * 100).toFixed(0)}%`);
  const absDelta = Math.abs(c.delta);
  if (absDelta < cfg.deltaMin || absDelta > cfg.deltaMax) reasons.push(`|delta| ${absDelta.toFixed(2)} outside [${cfg.deltaMin},${cfg.deltaMax}]`);
  return reasons;
}

function nextUnhitEma(spot: number, direction: 'bullish' | 'bearish', emaTargets: EmaTargets): number | null {
  const vals = EMA_KEYS.map((k) => emaTargets[k]).filter((v) => isFinite(v) && v > 0);
  if (direction === 'bullish') {
    const ahead = vals.filter((v) => v > spot).sort((a, b) => a - b);
    return ahead.length ? ahead[0] : null;
  }
  const ahead = vals.filter((v) => v < spot).sort((a, b) => b - a);
  return ahead.length ? ahead[0] : null;
}

/** Skew-adjusted contract return from spot → target (V5 §5.2). */
function repricedReturn(c: RankerContract, spot: number, target: number, dteDays: number, cfg: V5Config): number {
  const isCall = c.type === 'C';
  const now = computeBlackScholesPrice(spot, c.strike, dteDays, c.iv, isCall);
  if (!(now > 0)) return 0;
  const movePct = 100 * (target - spot) / spot;
  const sigmaTarget = Math.max(cfg.SIGMA_FLOOR, c.iv + cfg.SPOT_VOL_BETA * movePct);
  const at = computeBlackScholesPrice(target, c.strike, dteDays, sigmaTarget, isCall);
  return (at - now) / now;
}

/** §1.2 reachability multiplier (CORRECTED: expected move ÷ distance, so targets
 *  beyond the daily expected range decay). 0.5·EM→1, EM→1, 2·EM→0.5, 4·EM→0.25. */
export function reachMultiplier(expectedMovePct: number, targetDistancePct: number): number {
  return Math.min(1, expectedMovePct / Math.max(targetDistancePct, EPS));
}

/** §1.3 IV-mispricing multiplier — penalizes ONLY contracts rich vs the smile. */
export function mispricingMultiplier(midIv: number, fairIv: number, K: number, floor: number): number {
  const premium = midIv / Math.max(fairIv, EPS) - 1;
  return clamp(1 - Math.max(0, premium) * K, floor, 1);
}

// ============================================================
// Main ranker
// ============================================================
export function rankContracts(input: RankInput): RankedCandidate[] {
  const cfg: V5Config = { ...DEFAULT_V5_CONFIG, ...(input.config || {}) };
  const { spot, direction, dteDays, emaTargets, dataSource, store } = input;
  const targetType: 'C' | 'P' = direction === 'bullish' ? 'C' : 'P';
  const dir = direction === 'bullish' ? 1 : -1;

  const evaluated = input.chain.map((c) => ({ c, reasons: evaluateEligibility(c, targetType, cfg) }));
  const C = evaluated.filter((e) => e.reasons.length === 0).map((e) => e.c);

  // OI by strike across ALL target-type contracts (neighbors may be ineligible).
  const targetContracts = input.chain.filter((c) => c.type === targetType);
  const oiByStrike = new Map<number, number>();
  for (const c of targetContracts) oiByStrike.set(c.strike, c.oi);
  const sortedStrikes = [...oiByStrike.keys()].sort((a, b) => a - b);
  const strikeIndex = new Map<number, number>();
  sortedStrikes.forEach((s, i) => strikeIndex.set(s, i));

  // §1.4 / §2: full-chain volume (caller-supplied, else sum of provided chain).
  const totalChainVolume = input.totalChainVolume ?? input.chain.reduce((s, c) => s + (c.volume || 0), 0);

  // §1.2 / §1.3: ATM IV fallback (iv of the target contract nearest spot).
  let atmIv = 0.15;
  if (targetContracts.length) {
    const atm = targetContracts.reduce((b, c) => (Math.abs(c.strike - spot) < Math.abs(b.strike - spot) ? c : b), targetContracts[0]);
    atmIv = atm.iv || 0.15;
  }
  const expectedMovePct = input.expectedMovePct ?? emPct(atmIv, dteDays / 365);

  // §1.1 Positioning Density (cluster mass × embeddedness) over a strike window.
  const densityRaw = (c: RankerContract): number => {
    const idx = strikeIndex.get(c.strike);
    if (idx === undefined) return c.oi;
    let clusterMass = 0; let peak = 0;
    for (let k = -cfg.DENSITY_WINDOW; k <= cfg.DENSITY_WINDOW; k++) {
      const s = sortedStrikes[idx + k];
      if (s === undefined) continue;            // chain edge → drop, don't treat as 0
      const oi = oiByStrike.get(s) || 0;
      clusterMass += oi;
      if (oi > peak) peak = oi;
    }
    const peakShare = peak / Math.max(clusterMass, 1);    // 1 = lone spike, low = spread cluster
    const embeddedness = 1 - peakShare;
    return clusterMass * (cfg.DENSITY_BASE + (1 - cfg.DENSITY_BASE) * embeddedness);
  };

  // ---- Cross-sectional sets over C ----
  const densitySet = C.map((c) => densityRaw(c));
  const dominanceSet = C.map((c) => c.volume / Math.max(totalChainVolume, 1));
  const wallMagSet = C.map((c) => Math.abs(exposures(c, spot).gex));
  const alignSet = C.map((c) => {
    const { gex, dex, vex } = exposures(c, spot);
    const signed = cfg.exposureWeights.gex * gex + cfg.exposureWeights.dex * dex + cfg.exposureWeights.vex * vex;
    return cfg.ACCEL_SIGN * dir * signed;
  });
  const targetAhead = nextUnhitEma(spot, direction, emaTargets);
  const speedSet = C.map((c) => (c.speed || 0) * Math.abs((targetAhead ?? spot) - spot));

  const out: RankedCandidate[] = evaluated.map(({ c, reasons }) => {
    const eligible = reasons.length === 0;
    const flags: string[] = [];
    const distanceFromSpotPct = spot > 0 ? 100 * (c.strike - spot) / spot : 0;

    if (!eligible) {
      return {
        symbol: c.symbol, strike: c.strike, type: c.type, eligible: false, rejectReasons: reasons,
        positioningScore: 0, dealerInfluenceScore: 0, accelerationScore: 0, emaPathScore: 0, liquidityScore: 0,
        skyScore: 0, convexityScore: 0, convexityStatus: 'Flat', isExplosive: false,
        positioningDensity: 0, volumeMigration: 0, volumeExpansion: c.rvol ?? 0, gammaVelocity: 0, distanceFromSpotPct,
        emaReturns: { ema5: 0, ema9: 0, ema20: 0, ema50: 0, ema200: 0 }, flags, data_source: dataSource,
      };
    }

    const key = SnapshotStore.key(c.symbol, c.expiration, c.strike, c.type);
    const prev = store ? store.prior(key, cfg.LOOKBACK_BARS) : null;

    // ---------- §1.1 + §2: Positioning (density + volume-share migration) ----------
    const dRaw = densityRaw(c);
    const densityScore = normCrossSection(dRaw, densitySet);
    const volShareNow = c.volume / Math.max(totalChainVolume, 1);
    let volumeMigration = 0;
    let migrationScore = 50;
    if (prev) {
      volumeMigration = volShareNow - prev.volShare;
      migrationScore = normSignedTanh(volumeMigration, cfg.MIG_SCALE);
    } else {
      flags.push('positioning:no-prior-snapshot');
    }
    const positioningScore = 0.60 * densityScore + 0.40 * migrationScore;

    // ---------- Part 3: Dealer influence ----------
    const { gex, dex, vex } = exposures(c, spot);
    const wallMagScore = normCrossSection(Math.abs(gex), wallMagSet);
    const signed = cfg.exposureWeights.gex * gex + cfg.exposureWeights.dex * dex + cfg.exposureWeights.vex * vex;
    const alignScore = normCrossSection(cfg.ACCEL_SIGN * dir * signed, alignSet);
    const dealerInfluenceScore = cfg.dealerWallMagWeight * wallMagScore + cfg.dealerAlignWeight * alignScore;

    // ---------- Part 4: Acceleration ----------
    const ve = c.rvol ?? 1;
    const veScore = normSignedTanh(ve - 1, cfg.VE_SCALE);
    let gammaVelocity = 0; let gammaVelScore = 50; let vexVelScore = 50;
    if (prev) {
      gammaVelocity = gex - prev.gexStrike;
      gammaVelScore = normSignedTanh(gammaVelocity, cfg.GVEL_SCALE);
      vexVelScore = normSignedTanh(vex - prev.vexStrike, cfg.VVEL_SCALE);
    } else {
      flags.push('acceleration:no-prior-snapshot');
    }
    const accelerationScore = 0.40 * veScore + 0.35 * gammaVelScore + 0.25 * vexVelScore;

    // ---------- Part 5 + §1.2 + §1.3: EMA path ----------
    let emaPathScore = 50;
    if (targetAhead === null) {
      flags.push('emapath:no_target_ahead');
    } else {
      const baseReturn = repricedReturn(c, spot, targetAhead, dteDays, cfg);
      const targetDistancePct = Math.abs(targetAhead - spot) / Math.max(spot, EPS);
      const reach = reachMultiplier(expectedMovePct, targetDistancePct);           // §1.2
      const fairIv = c.fairIv ?? atmIv;
      const misprice = mispricingMultiplier(c.iv, fairIv, cfg.IV_PEN_K, cfg.IV_PEN_FLOOR); // §1.3
      const finalReturn = baseReturn * reach * misprice;
      emaPathScore = normSignedTanh(finalReturn, cfg.EMA_RET_SCALE);
    }
    flags.push('emapath:T_target=T_now');
    const emaReturns = EMA_KEYS.reduce((acc, k) => {
      acc[k] = Number((100 * repricedReturn(c, spot, emaTargets[k], dteDays, cfg)).toFixed(2));
      return acc;
    }, {} as Record<keyof EmaTargets, number>) as RankedCandidate['emaReturns'];

    // ---------- §1.4: Liquidity (OI + Strike Dominance + spread; quote-stability dropped per brief) ----------
    const oiScore01 = clamp(Math.log10(Math.max(c.oi, 1)) / 4, 0, 1);
    const m = mid(c);
    const spreadPct = m > 0 ? (c.ask - c.bid) / m : 1;
    const spreadScore01 = clamp(1 - spreadPct / 0.10, 0, 1);
    const dominanceScore = normCrossSection(volShareNow, dominanceSet); // 0–100
    const liquidityScore = 100 * (0.40 * oiScore01 + 0.40 * unit(dominanceScore) + 0.20 * spreadScore01);

    // ---------- Part 7: SkyScore ----------
    const skyScore =
      cfg.weights.positioning * positioningScore +
      cfg.weights.dealer * dealerInfluenceScore +
      cfg.weights.acceleration * accelerationScore +
      cfg.weights.emaPath * emaPathScore +
      cfg.weights.liquidity * liquidityScore;

    // ---------- Part 8: V5.1 Convexity ----------
    const vannaVelScore = prev ? normSignedTanh(vex - prev.vexStrike, cfg.VVEL_SCALE) : 50;
    const speedLevelScore = normCrossSection((c.speed || 0) * Math.abs((targetAhead ?? spot) - spot), speedSet);
    const convexityScore = 100 * clamp(
      cfg.convexityWeights.gammaVel * unit(gammaVelScore) +
      cfg.convexityWeights.vannaVel * unit(vannaVelScore) +
      cfg.convexityWeights.speed * unit(speedLevelScore), 0, 1);
    const convexityStatus: RankedCandidate['convexityStatus'] =
      convexityScore >= 80 ? 'Rising Fast' : convexityScore >= 60 ? 'Rising' : convexityScore >= 40 ? 'Flat' : 'Falling';
    const isExplosive = skyScore >= cfg.isExplosiveSky && convexityScore >= cfg.isExplosiveConvexity;

    if (store) {
      store.record(key, {
        ts: Date.now(), gexStrike: gex, vexStrike: vex, gamma: c.gamma || 0, vanna: c.vanna || 0,
        oi: c.oi, volume: c.volume, volShare: volShareNow, mid: m,
      });
    }

    return {
      symbol: c.symbol, strike: c.strike, type: c.type, eligible: true, rejectReasons: [],
      positioningScore: round(positioningScore), dealerInfluenceScore: round(dealerInfluenceScore),
      accelerationScore: round(accelerationScore), emaPathScore: round(emaPathScore), liquidityScore: round(liquidityScore),
      skyScore: round(skyScore), convexityScore: round(convexityScore), convexityStatus, isExplosive,
      positioningDensity: Number(dRaw.toFixed(2)), volumeMigration: Number(volumeMigration.toFixed(6)),
      volumeExpansion: ve, gammaVelocity, distanceFromSpotPct: Number(distanceFromSpotPct.toFixed(2)),
      emaReturns, flags, data_source: dataSource,
    };
  });

  return out.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.skyScore - a.skyScore;
  });
}

function round(x: number): number { return Number(x.toFixed(2)); }
