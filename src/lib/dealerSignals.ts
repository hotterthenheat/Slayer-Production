/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * V5.1 Phase 3 — Dealer-Engine macro/timing metrics.
 *
 * These are NOT contract-ranker factors and are NOT displayed. They feed the
 * directional BUY-signal generation and position sizing, upstream of the ranker.
 * Pure functions; the caller wires them into the decision gate + sizing.
 *
 * Load-bearing corrections from the brief:
 *  - §3.2 proximity (not distance): 1 - dist/EM.
 *  - §3.3 geometric mean (not raw product) so one small factor doesn't collapse it.
 *  - §3.4 per-component normalization (not a raw sum of different-order Greeks).
 *  - Abstain when the dealer engine returned fabricated wall/flip fallbacks.
 */

import { clamp, normSaturate } from './normalize';

const EPS = 1e-9;

export interface DealerSignalConfig {
  TRAP_CAP: number;   // per-asset (measure); placeholder
  GEX_REF: number;    // per-asset (measure); placeholder
}
export const DEFAULT_DEALER_SIGNAL_CONFIG: DealerSignalConfig = { TRAP_CAP: 0.5, GEX_REF: 5e9 };

export interface Abstainable { value: number; confident: boolean; }

/** §3.1 — Dealer Trap Score (0–100). Tight, dense walls = caged/mean-reverting.
 *  Abstains (neutral 50, low-confidence) if the walls were fabricated fallbacks. */
export function dealerTrapScore(input: {
  gexAtCallWall: number; gexAtPutWall: number; grossGex: number;
  callWall: number; putWall: number; spot: number; wallsConfident: boolean;
}, cfg: DealerSignalConfig = DEFAULT_DEALER_SIGNAL_CONFIG): Abstainable {
  if (!input.wallsConfident) return { value: 50, confident: false };
  const wallMag = (Math.abs(input.gexAtCallWall) + Math.abs(input.gexAtPutWall)) / 2;
  const wallMagShare = wallMag / Math.max(input.grossGex, 1);
  const wallDistPct = Math.abs(input.callWall - input.putWall) / Math.max(input.spot, EPS);
  const value = normSaturate(wallMagShare / Math.max(wallDistPct, EPS), cfg.TRAP_CAP);
  return { value, confident: true };
}

/** §3.2 — Gamma Flip Proximity (0–1). 1 at the flip, 0 beyond one expected move.
 *  Abstains (0, low-confidence) if the flip was a fabricated fallback. */
export function gammaFlipProximity(input: {
  spot: number; gammaFlipPrice: number; expectedMovePct: number; gammaFlipConfident: boolean;
}): Abstainable {
  if (!input.gammaFlipConfident) return { value: 0, confident: false };
  const flipDistPct = Math.abs(input.spot - input.gammaFlipPrice) / Math.max(input.spot, EPS);
  const value = clamp(1 - flipDistPct / Math.max(input.expectedMovePct, EPS), 0, 1);
  return { value, confident: true };
}

/** §3.3 — Dealer Stress Index (0–100). Geometric mean of gamma magnitude,
 *  vol expansion, and flip proximity — degrades gracefully (no product collapse). */
export function dealerStressIndex(input: {
  grossGex: number; volExpansionNorm: number; gammaFlipProximity: number;
}, cfg: DealerSignalConfig = DEFAULT_DEALER_SIGNAL_CONFIG): number {
  const g = clamp(input.grossGex / Math.max(cfg.GEX_REF, EPS), 0, 1);
  const v = clamp(input.volExpansionNorm, 0, 1);
  const p = clamp(input.gammaFlipProximity, 0, 1);
  return 100 * Math.cbrt(g * v * p);
}

/** §3.4 — Dealer Convexity (0–100). Each Greek → exposure → normalized to a
 *  common scale (per-component, scale-invariant) BEFORE combining. Speed is the
 *  3rd spot derivative; averaging (not summing) prevents it double-driving gamma. */
export function dealerConvexity(
  chain: { gamma: number; speed?: number; vanna?: number; charm?: number; oi: number }[],
  spot: number,
): number {
  if (!chain || chain.length === 0) return 0;
  const gexEx = chain.map((c) => Math.abs((c.gamma || 0) * c.oi * 100 * spot * spot * 0.01));
  const spdEx = chain.map((c) => Math.abs((c.speed || 0) * c.oi * 100 * spot * spot * spot * 0.0001));
  const vexEx = chain.map((c) => Math.abs((c.vanna || 0) * c.oi * 100));
  const chmEx = chain.map((c) => Math.abs((c.charm || 0) * c.oi * 100));
  // Scale-invariant per-component normalization (x / max) → [0,1]. Swapping the
  // magnitude scale of any one component leaves its normalized shape unchanged.
  const norm = (arr: number[]) => { const mx = Math.max(...arr, EPS); return arr.map((x) => x / mx); };
  const gN = norm(gexEx); const sN = norm(spdEx); const vN = norm(vexEx); const cN = norm(chmEx);
  let sum = 0;
  for (let i = 0; i < chain.length; i++) sum += (gN[i] + sN[i] + vN[i] + cN[i]) / 4;
  return 100 * (sum / chain.length);
}

export interface DealerSignals {
  dealerTrapScore: number; dealerTrapConfident: boolean;
  gammaFlipProximity: number; gammaFlipProximityConfident: boolean;
  dealerStressIndex: number;
  dealerConvexity: number;
}

/**
 * Aggregator that routes a dealer-metrics result (from computeDealerInventory)
 * into the four Phase-3 signals. NOT displayed and NOT consumed by the ranker;
 * the caller wires these into the BUY decision gate + position sizing.
 * `volExpansionNorm` is the existing ATR/IV-expansion microstructure score [0,1].
 */
export function computeDealerSignals(input: {
  spot: number; callWall: number; putWall: number; gammaFlipPrice: number;
  grossGex: number; expectedMovePct: number;
  gexAtCallWall: number; gexAtPutWall: number;
  wallsConfident: boolean; gammaFlipConfident: boolean;
  volExpansionNorm?: number;
  convexityChain: { gamma: number; speed?: number; vanna?: number; charm?: number; oi: number }[];
}, cfg: DealerSignalConfig = DEFAULT_DEALER_SIGNAL_CONFIG): DealerSignals {
  const trap = dealerTrapScore({
    gexAtCallWall: input.gexAtCallWall, gexAtPutWall: input.gexAtPutWall, grossGex: input.grossGex,
    callWall: input.callWall, putWall: input.putWall, spot: input.spot, wallsConfident: input.wallsConfident,
  }, cfg);
  const prox = gammaFlipProximity({
    spot: input.spot, gammaFlipPrice: input.gammaFlipPrice,
    expectedMovePct: input.expectedMovePct, gammaFlipConfident: input.gammaFlipConfident,
  });
  const stress = dealerStressIndex({
    grossGex: input.grossGex, volExpansionNorm: input.volExpansionNorm ?? 0.5, gammaFlipProximity: prox.value,
  }, cfg);
  const convexity = dealerConvexity(input.convexityChain, input.spot);
  return {
    dealerTrapScore: trap.value, dealerTrapConfident: trap.confident,
    gammaFlipProximity: prox.value, gammaFlipProximityConfident: prox.confident,
    dealerStressIndex: stress, dealerConvexity: convexity,
  };
}

// ==========================================
// V5.1 Phase 3 — Decision / position-size coupling (DEFAULT OFF)
// ==========================================
//
// This is the ONLY place the Phase-3 dealer signals touch live behavior, and it
// is gated behind `enabled` which defaults to false. With the default config the
// decision gate and position sizing are byte-identical to pre-Phase-3 behavior:
// modulateDecision returns the gate's decision unchanged and a size multiplier of
// 1. Flip `enabled` on (and tune the thresholds per asset) to let the dealer
// engine veto fresh BUYs into the worst microstructure and trim size as dealer
// stress rises. None of this is displayed — the interface still shows only the
// 0–100 score and the holding / failing / testing status labels.

export type GateDecision = 'BUY' | 'WAIT' | 'HOLD' | 'REDUCE' | 'EXIT';

export interface DealerCouplingConfig {
  enabled: boolean;
  trapHighThreshold: number;   // dealerTrapScore (0–100) above which the regime is "caged"
  flipNearThreshold: number;   // gammaFlipProximity (0–1) above which we're "at the flip"
  stressSizeK: number;         // fraction of full size cut at max dealer stress (0–1)
  sizeFloor: number;           // never trim below this fraction of base size
}

export const DEFAULT_DEALER_COUPLING: DealerCouplingConfig = {
  enabled: false,
  trapHighThreshold: 70,
  flipNearThreshold: 0.7,
  stressSizeK: 0.5,
  sizeFloor: 0.5,
};

export interface ModulatedDecision {
  decision: GateDecision;
  reason: string;
  sizeMultiplier: number; // clamped to [sizeFloor, 1]
  modulated: boolean;     // true iff the decision literal was changed by the dealer veto
}

/**
 * Pure decision/size modulation from the Phase-3 dealer signals.
 *
 *  - Conviction: a fresh BUY is downgraded to WAIT only when the dealer trap is
 *    HIGH and we are NEAR the gamma flip and BOTH signals are confident. That is
 *    the single microstructure regime — caged price action plus an unstable
 *    hedging sign right at the flip — where a brand-new directional entry is most
 *    likely to get chopped. Requiring both conditions AND confidence keeps it
 *    conservative: it never fires on noise or on fabricated wall/flip fallbacks.
 *  - Size: a bounded linear reduction in dealer stress, clamped to [sizeFloor, 1],
 *    so it can only ever trim (never amplify) and never collapse to zero. The
 *    stress index degrades to 0 when the flip is unconfident, so an unconfident
 *    dealer read produces no size cut.
 *
 * Only fresh BUYs are gated. Existing-position states (HOLD / REDUCE / EXIT) and
 * existing WAITs pass through untouched. Nothing here is rendered.
 */
export function modulateDecision(
  decResult: { decision: GateDecision; reason: string },
  signals: DealerSignals,
  cfg: DealerCouplingConfig = DEFAULT_DEALER_COUPLING,
): ModulatedDecision {
  if (!cfg.enabled) {
    return { decision: decResult.decision, reason: decResult.reason, sizeMultiplier: 1, modulated: false };
  }

  const sizeMultiplier = clamp(
    1 - cfg.stressSizeK * (clamp(signals.dealerStressIndex, 0, 100) / 100),
    cfg.sizeFloor,
    1,
  );

  const trapHigh = signals.dealerTrapConfident && signals.dealerTrapScore >= cfg.trapHighThreshold;
  const nearFlip = signals.gammaFlipProximityConfident && signals.gammaFlipProximity >= cfg.flipNearThreshold;

  if (decResult.decision === 'BUY' && trapHigh && nearFlip) {
    return {
      decision: 'WAIT',
      reason:
        `${decResult.reason} [Dealer veto: trap ${signals.dealerTrapScore.toFixed(0)} ≥ ${cfg.trapHighThreshold} ` +
        `and gamma-flip proximity ${signals.gammaFlipProximity.toFixed(2)} ≥ ${cfg.flipNearThreshold} — ` +
        `caged/unstable market, standing down fresh entry.]`,
      sizeMultiplier,
      modulated: true,
    };
  }

  return { decision: decResult.decision, reason: decResult.reason, sizeMultiplier, modulated: false };
}
