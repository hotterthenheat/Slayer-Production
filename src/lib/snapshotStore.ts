/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rolling per-strike snapshot store (spec Part 9.4 — NET-NEW infra).
 * Acceleration (Part 4) and OI velocity need prior per-strike values; the chain
 * is otherwise regenerated each render with no persistence. In-memory ring
 * buffer keyed by symbol|expiration|strike|type. v1 is process-memory only.
 */

export interface StrikeSnapshot {
  ts: number;
  gexStrike: number;
  vexStrike: number;
  gamma: number;
  vanna: number;
  oi: number;
  volume: number;
  volShare: number;   // strike volume / total chain volume (V5.1 §2 migration)
  mid: number;
}

const MAX_PER_KEY = 64;
// Cap the number of distinct symbol|expiration|strike|type series. Because the
// key embeds `expiration`, every new expiry that rolls in over a long-running
// process would otherwise add permanent keys (the per-key cap above does not
// bound the number of keys). Least-recently-written series are evicted.
const MAX_KEYS = 5000;

export class SnapshotStore {
  private buf = new Map<string, StrikeSnapshot[]>();

  static key(symbol: string, expiration: string, strike: number, type: 'C' | 'P'): string {
    return `${symbol}|${expiration}|${strike}|${type}`;
  }

  /** Append the current snapshot for a key (oldest dropped past MAX_PER_KEY). */
  record(key: string, snap: StrikeSnapshot): void {
    const existing = this.buf.get(key);
    if (existing) {
      // Re-insert to refresh LRU position (Map preserves insertion order).
      this.buf.delete(key);
      existing.push(snap);
      if (existing.length > MAX_PER_KEY) existing.shift();
      this.buf.set(key, existing);
      return;
    }
    this.buf.set(key, [snap]);
    if (this.buf.size > MAX_KEYS) {
      const overflow = this.buf.size - MAX_KEYS;
      const stale: string[] = [];
      for (const k of this.buf.keys()) {
        stale.push(k);
        if (stale.length >= overflow) break;
      }
      for (const k of stale) this.buf.delete(k);
    }
  }

  /**
   * The snapshot `lookbackBars` scans before the latest recorded one, or null
   * if there isn't enough history yet (caller must then return neutral 50 —
   * never fabricate a delta, per the anti-fake-math guard).
   */
  prior(key: string, lookbackBars: number): StrikeSnapshot | null {
    const arr = this.buf.get(key);
    if (!arr || arr.length < lookbackBars) return null;
    return arr[arr.length - lookbackBars] ?? null;
  }

  /** Recent mid prices (oldest→newest) for the liquidity quote-stability term. */
  recentMids(key: string, n = 8): number[] {
    const arr = this.buf.get(key);
    if (!arr) return [];
    return arr.slice(-n).map((s) => s.mid);
  }

  size(): number {
    return this.buf.size;
  }

  clear(): void {
    this.buf.clear();
  }
}

/** Shared process-global store for the live ranking path. */
export const globalSnapshotStore = new SnapshotStore();
