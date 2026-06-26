/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * dataIntegrity — one source of truth for "what is sane market data", shared by the SERVER (option
 * chain ingest) and the CLIENT (SSE payload guard). A trading desk's trust dies the moment a
 * corrupt provider tick — negative open interest, a crossed book, a NaN greek, an inverted candle —
 * silently becomes a $2B GEX wall that never existed. These pure, environment-agnostic checks drop
 * or flag insane data BEFORE it reaches the math or the screen.
 *
 * Conservative by design: only CLEARLY corrupt data is rejected, so a momentary glitch drops one
 * frame (last-good state is kept) and self-heals on the next, rather than freezing a good feed.
 */

const num = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

export interface ChainLike {
  strike: number; type: 'call' | 'put';
  openInterest: number; iv: number; bid: number; ask: number;
  delta: number; gamma: number; vega: number; theta: number; vanna: number; charm: number; volume: number;
}

/** Is a single option-chain contract sane enough to feed the GEX/greeks math? */
export function isSaneContract(c: Partial<ChainLike> | null | undefined): boolean {
  if (!c) return false;
  if (!num(c.strike) || c.strike <= 0) return false;
  if (c.openInterest != null && (!num(c.openInterest) || c.openInterest < 0)) return false;
  if (c.volume != null && (!num(c.volume) || c.volume < 0)) return false;
  // Quotes: non-negative, and not crossed beyond a rounding tolerance (bid > ask = bad book).
  if (c.bid != null && c.ask != null && num(c.bid) && num(c.ask)) {
    if (c.bid < 0 || c.ask < 0) return false;
    if (c.ask > 0 && c.bid > c.ask * 1.0001) return false;
  }
  // IV: a non-negative fraction; >500% is a feed error, not a real vol.
  if (c.iv != null && (!num(c.iv) || c.iv < 0 || c.iv > 5)) return false;
  // Greeks must be finite when present; bound the ones with hard physical limits.
  for (const g of [c.delta, c.gamma, c.vega, c.theta, c.vanna, c.charm]) if (g != null && !num(g)) return false;
  if (c.delta != null && Math.abs(c.delta) > 1.5) return false;
  if (c.gamma != null && c.gamma < 0) return false;
  return true;
}

export interface ChainSanity<T> { clean: T[]; invalidCount: number; total: number }

/** Filter a chain to its sane contracts, reporting how many were dropped (for honest surfacing). */
export function sanitizeChain<T extends Partial<ChainLike>>(chain: T[]): ChainSanity<T> {
  if (!Array.isArray(chain)) return { clean: [], invalidCount: 0, total: 0 };
  const clean: T[] = [];
  let invalid = 0;
  for (const c of chain) { if (isSaneContract(c)) clean.push(c); else invalid++; }
  return { clean, invalidCount: invalid, total: chain.length };
}

/** OHLC sanity: finite, positive, non-inverted, with the close inside the bar. */
export function isSaneCandle(c: { open?: unknown; high?: unknown; low?: unknown; close?: unknown } | null | undefined): boolean {
  if (!c) return false;
  const { open, high, low, close } = c;
  return num(open) && num(high) && num(low) && num(close) &&
    low > 0 && high >= low && close <= high && close >= low;
}

export interface PayloadValidity { ok: boolean; reason?: string }

/**
 * Client-side gate: is an SSE frame's CONTENT (not just its identity) sane enough to accept into
 * state? Returns the reason on rejection so the caller can warn. Only present fields are checked,
 * so a sparse-but-valid payload still passes.
 */
export function validateSsePayload(p: any): PayloadValidity {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'not an object' };
  const spot = p.pinpoint_map?.spot_price ?? p.provenance?.inputs?.underlying_price ?? p.gex_profile?.spot;
  if (spot != null && !(num(spot) && spot > 0)) return { ok: false, reason: 'non-positive spot' };
  if (p.trade_health != null && (!num(p.trade_health) || p.trade_health < 0 || p.trade_health > 100)) return { ok: false, reason: 'trade_health out of range' };
  if (Array.isArray(p.candles) && p.candles.length) {
    // Only inspect the tail — the bars that actually drive the latest render.
    if (p.candles.slice(-5).some((c: any) => !isSaneCandle(c))) return { ok: false, reason: 'malformed candle' };
  }
  return { ok: true };
}
