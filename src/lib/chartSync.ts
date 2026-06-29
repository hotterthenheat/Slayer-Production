/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lightweight pub/sub for the multi-chart workspace. Two independent buses:
 *
 *  1. SYNC CHANNELS — link panels into groups (A/B/C). When a panel on a channel changes its
 *     ticker/timeframe it PUBLISHES; same-channel panels update their OWN local state from the
 *     event. No global context, no parent re-render — only the subscribed panels react.
 *
 *  2. CROSSHAIR BRIDGE — a chart broadcasts the hovered price via a native window event so the
 *     detached Exposure Ladder can highlight the matching strike WITHOUT putting mouse
 *     coordinates in React state (which would wreck the 60fps render loop).
 */

export type SyncChannel = 'NONE' | 'A' | 'B' | 'C';
export const CHANNEL_CYCLE: SyncChannel[] = ['NONE', 'A', 'B', 'C'];
export const CHANNEL_COLORS: Record<SyncChannel, string> = {
  NONE: '#6b7280', // gray
  A: '#10b981',    // emerald
  B: '#06b6d4',    // cyan
  C: '#a855f7',    // purple
};

export interface SyncPayload { source: string; ticker?: string; timeframe?: string; }
type SyncCb = (p: SyncPayload) => void;

const buses = new Map<SyncChannel, Set<SyncCb>>();

/** Subscribe to a channel's events. Returns an unsubscribe fn. 'NONE' is a no-op. */
export function subscribeChannel(ch: SyncChannel, cb: SyncCb): () => void {
  if (ch === 'NONE') return () => {};
  let set = buses.get(ch);
  if (!set) { set = new Set(); buses.set(ch, set); }
  set.add(cb);
  // Drop the channel's Set once its last subscriber leaves so closed panels don't leave empty
  // buckets behind (bounded to A/B/C, but no reason to retain dead entries across panel churn).
  return () => { set!.delete(cb); if (set!.size === 0) buses.delete(ch); };
}

/** Publish to every subscriber on a channel. Subscribers ignore their own source. */
export function publishChannel(ch: SyncChannel, payload: SyncPayload): void {
  if (ch === 'NONE') return;
  const set = buses.get(ch);
  if (!set) return;
  for (const cb of set) cb(payload);
}

// ── Crosshair bridge ──────────────────────────────────────────────────────────
export const CROSSHAIR_EVENT = 'slayer:crosshair';
export interface CrosshairDetail { price: number | null; source: string }

/** Broadcast the hovered price (or null to clear). No React state — pure window event. */
export function broadcastCrosshair(price: number | null, source: string): void {
  try { window.dispatchEvent(new CustomEvent<CrosshairDetail>(CROSSHAIR_EVENT, { detail: { price, source } })); } catch { /* SSR-safe */ }
}
