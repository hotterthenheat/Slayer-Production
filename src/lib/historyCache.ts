/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coalescing cache for the /api/history backfill.
 *
 * Live data already arrives on ONE shared SSE stream (no per-panel sockets), but the one-shot
 * history backfill is fired independently per panel. Snap six SPX·5m panels onto the grid and
 * you get six identical REST round-trips on the same tick. This collapses them: identical
 * (ticker,timeframe,count) requests share a single in-flight promise, and a short TTL cache
 * makes a freshly-added panel on an already-loaded symbol paint instantly (no spinner, no fetch).
 *
 * Coalesced fetches are intentionally NOT abortable per-caller — one panel unmounting must not
 * cancel a request its siblings are still awaiting. Callers drop late results with a local flag.
 */
import { Candle } from '../types';

interface Entry { at: number; candles: Candle[]; }

const TTL = 2500;     // ms — a backfill is a point-in-time snapshot; brief reuse absorbs add-bursts
const MAX = 24;       // hard cap so distinct symbol/timeframe combos can't grow the map unbounded
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Candle[] | null>>();

function prune(now: number) {
  for (const [k, v] of cache) if (now - v.at >= TTL) cache.delete(k);
  while (cache.size > MAX) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
}

/**
 * Fetch (or reuse) the history backfill for a symbol/timeframe. Returns the candle array, or
 * null on offline/preview/error so the caller can fall back to handed-down candles.
 */
export function fetchHistory(ticker: string, timeframe: string, count = 300): Promise<Candle[] | null> {
  const key = `${ticker}|${timeframe}|${count}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return Promise.resolve(hit.candles);

  let p = inflight.get(key);
  if (!p) {
    p = fetch(`/api/history?ticker=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}&count=${count}`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const c = d && Array.isArray(d.candles) && d.candles.length ? (d.candles as Candle[]) : null;
        if (c) { cache.set(key, { at: Date.now(), candles: c }); prune(Date.now()); }
        return c;
      })
      .catch(() => null)
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
  }
  return p;
}
