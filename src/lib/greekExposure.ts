/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER GREEK EXPOSURE PROFILES
 * ------------------------------
 * Per-strike net dealer exposure for the canonical hedging Greeks, computed
 * straight from the REAL front-expiry option chain (per-contract Greek × open
 * interest), using the SAME dollar-scaling conventions as the platform's
 * dealer-inventory engine (src/lib/v11Math.ts computeDealerInventory) so the
 * numbers reconcile rather than diverge:
 *
 *   GEX   (gamma) : Γ     · OI · 100 · S² · 0.01 · sgn   →  $ / 1% spot move
 *   DEX   (delta) : Δ     · OI · 100 · S        · sgn    →  $ delta inventory
 *   VEX   (vanna) : ∂Δ/∂σ · OI · 100 · S  · 0.01 · sgn   →  $ Δ / 1% vol move
 *   Charm (decay) : ∂Δ/∂t · OI · 100 · (S/365)  · sgn    →  $ Δ drift / day
 *   VegX  (vega)  : ∂V/∂σ · OI · 100        · 0.01 · sgn →  $ / 1% vol move
 *
 * Sign convention sgn = +1 call / −1 put (the platform's net-call−put dealer
 * convention). Nothing is synthesized: every value traces to a real contract
 * Greek and its open interest. The cumulative-zero "flip" is the strike where
 * the running cumulative exposure changes sign (e.g. the zero-gamma level).
 */
import type { ChainContract } from './v11Math';

export type GreekKey = 'gamma' | 'delta' | 'vanna' | 'charm' | 'vega';

export interface GreekMeta {
  key: GreekKey;
  label: string;   // panel label
  short: string;   // selector chip
  symbol: string;  // math symbol
  unit: string;    // exposure units
  formula: string; // dollar-scaling formula
  note: string;    // how to read it
}

export const GREEK_META: Record<GreekKey, GreekMeta> = {
  gamma: { key: 'gamma', label: 'Gamma Exposure (GEX)', short: 'Γ', symbol: 'Γ', unit: '$ / 1% spot', formula: 'Γ·OI·100·S²·0.01·sgn', note: '+ dealers long γ ⇒ fade/pin · − short γ ⇒ chase/amplify' },
  delta: { key: 'delta', label: 'Delta Exposure (DEX)', short: 'Δ', symbol: 'Δ', unit: '$ delta', formula: 'Δ·OI·100·S·sgn', note: 'directional inventory dealers carry and must hedge' },
  vanna: { key: 'vanna', label: 'Vanna Exposure (VEX)', short: 'Vanna', symbol: '∂Δ/∂σ', unit: '$ Δ / 1% vol', formula: 'Vanna·OI·100·S·0.01·sgn', note: 'how dealer delta shifts as IV moves — the vol↔spot link' },
  charm: { key: 'charm', label: 'Charm Exposure (decay)', short: 'Charm', symbol: '∂Δ/∂t', unit: '$ Δ / day', formula: 'Charm·OI·100·(S/365)·sgn', note: 'delta drift from time decay → into-expiry hedging / pinning' },
  vega: { key: 'vega', label: 'Vega Exposure (VegX)', short: 'Vega', symbol: '∂V/∂σ', unit: '$ / 1% vol', formula: 'Vega·OI·100·0.01·sgn', note: 'dealer vol exposure — where a vol shock hits hardest' },
};

export const GREEK_ORDER: GreekKey[] = ['gamma', 'delta', 'vanna', 'charm', 'vega'];

/** Dollar-scaling factor (excludes OI·100·sign, applied per contract). */
function scaleFor(key: GreekKey, spot: number): number {
  switch (key) {
    case 'gamma': return spot * spot * 0.01;
    case 'delta': return spot;
    case 'vanna': return spot * 0.01;
    case 'charm': return spot / 365;
    case 'vega': return 0.01;
  }
}

const FIELD: Record<GreekKey, keyof ChainContract> = {
  gamma: 'gamma', delta: 'delta', vanna: 'vanna', charm: 'charm', vega: 'vega',
};

export interface GreekExposureNode { strike: number; exposure: number; call: number; put: number }
export interface GreekExposureProfile {
  greek: GreekKey;
  nodes: GreekExposureNode[]; // aggregated per strike, ascending
  net: number;                // Σ exposure
  gross: number;              // Σ |exposure|
  maxAbs: number;             // peak |per-strike exposure| (≥1)
  flip: number | null;        // strike where cumulative exposure crosses zero
  topPositive: GreekExposureNode | null;
  topNegative: GreekExposureNode | null;
}

/**
 * Aggregate per-strike net dealer exposure for `greek` from the chain, within
 * ±windowPct of spot. Returns null when the chain is too sparse.
 */
export function computeGreekExposureProfile(
  chain: ChainContract[],
  spot: number,
  greek: GreekKey,
  windowPct = 0.12,
): GreekExposureProfile | null {
  if (!Array.isArray(chain) || chain.length < 3 || !(spot > 0)) return null;
  const scale = scaleFor(greek, spot);
  const field = FIELD[greek];
  const lo = spot * (1 - windowPct), hi = spot * (1 + windowPct);

  const byStrike = new Map<number, GreekExposureNode>();
  for (const c of chain) {
    if (!(c.strike >= lo && c.strike <= hi)) continue;
    const g = c[field] as number;
    const oi = c.openInterest || 0;
    if (!isFinite(g) || !isFinite(oi)) continue;
    const sign = c.type === 'call' ? 1 : -1;
    const e = g * oi * 100 * scale * sign;
    if (!isFinite(e)) continue;
    const node = byStrike.get(c.strike) || { strike: c.strike, exposure: 0, call: 0, put: 0 };
    node.exposure += e;
    if (c.type === 'call') node.call += e; else node.put += e;
    byStrike.set(c.strike, node);
  }

  const nodes = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  if (nodes.length < 3) return null;

  let net = 0, gross = 0, maxAbs = 0;
  let topPositive: GreekExposureNode | null = null;
  let topNegative: GreekExposureNode | null = null;
  const cum: number[] = [];
  let running = 0;
  for (const n of nodes) {
    net += n.exposure;
    gross += Math.abs(n.exposure);
    maxAbs = Math.max(maxAbs, Math.abs(n.exposure));
    if (n.exposure > 0 && (!topPositive || n.exposure > topPositive.exposure)) topPositive = n;
    if (n.exposure < 0 && (!topNegative || n.exposure < topNegative.exposure)) topNegative = n;
    running += n.exposure;
    cum.push(running);
  }

  // Cumulative-zero "flip": where the running cumulative exposure changes sign.
  let flip: number | null = null;
  for (let i = 1; i < nodes.length; i++) {
    const p = cum[i - 1], c = cum[i];
    if ((p <= 0 && c > 0) || (p >= 0 && c < 0)) {
      const t = c === p ? 0 : (0 - p) / (c - p);
      flip = nodes[i - 1].strike + t * (nodes[i].strike - nodes[i - 1].strike);
      break;
    }
  }

  return { greek, nodes, net, gross, maxAbs: maxAbs || 1, flip, topPositive, topNegative };
}
