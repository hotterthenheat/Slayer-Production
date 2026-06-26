/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * edgeLedger — persistence + lifecycle for the dealer-read track record. Records each outlook
 * snapshot, and once its forward window has fully printed, resolves it against the realized candle
 * path via edgeTracker.scoreRead and files the scored outcome. localStorage-backed (per-user v1;
 * a server table is the obvious upgrade), storage-safe, and bounded so it can't grow without limit.
 *
 * Provenance lives on each snapshot and is preserved end-to-end — the UI summarizes live and model
 * reads SEPARATELY so a synthetic-data track record can never be passed off as a live one.
 */
import { Candle } from '../types';
import { ReadSnapshot, ScoredRead, scoreRead, ScoreOpts } from './edgeTracker';

const KEY = 'slayer.edgeLedger.v1';
const MAX_SCORED = 500;
const MAX_PENDING = 200;

export interface LedgerState { pending: ReadSnapshot[]; scored: ScoredRead[]; }

function load(): LedgerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); if (p && Array.isArray(p.pending) && Array.isArray(p.scored)) return p; }
  } catch { /* storage unavailable / malformed */ }
  return { pending: [], scored: [] };
}

function save(s: LedgerState) {
  try { localStorage.setItem(KEY, JSON.stringify({ pending: s.pending.slice(-MAX_PENDING), scored: s.scored.slice(-MAX_SCORED) })); } catch { /* storage unavailable */ }
}

/** File a new pending read. Caller throttles cadence; this just dedupes exact-timestamp collisions. */
export function recordRead(snap: ReadSnapshot): void {
  const s = load();
  if (s.pending.some(p => p.ticker === snap.ticker && p.ts === snap.ts)) return;
  s.pending.push(snap);
  save(s);
}

/**
 * Resolve every pending read for `ticker` whose forward window (`horizonMs`) has fully printed,
 * scoring it against the realized closes in that window. Unresolvable reads far past their window
 * are dropped. No-op when nothing matured (avoids needless writes).
 */
export function resolveReads(ticker: string, candles: Candle[], horizonMs: number, opts?: ScoreOpts): void {
  if (!candles.length) return;
  const s = load();
  if (!s.pending.length) return;
  const latest = candles[candles.length - 1].timestamp;
  const stillPending: ReadSnapshot[] = [];
  let changed = false;
  for (const snap of s.pending) {
    if (snap.ticker !== ticker) { stillPending.push(snap); continue; }
    if (latest < snap.ts + horizonMs) { stillPending.push(snap); continue; } // window not complete yet
    const fwd = candles.filter(c => c.timestamp > snap.ts && c.timestamp <= snap.ts + horizonMs).map(c => c.close);
    const res = scoreRead(snap, fwd, opts);
    if (res) { s.scored.push({ ...snap, resolution: res }); changed = true; }
    else if (latest < snap.ts + horizonMs * 3) { stillPending.push(snap); } // give it a little longer to print
    else { changed = true; } // window long gone with no closes (ticker switched) → drop
  }
  if (changed || stillPending.length !== s.pending.length) { s.pending = stillPending; save(s); }
}

export function getLedger(): LedgerState { return load(); }
export function clearLedger(): void { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

/** Test/preview seam: replace the whole ledger (used to seed a populated track record in preview). */
export function _seedLedger(state: LedgerState): void { save(state); }
