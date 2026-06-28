/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the watchlist store: add/remove toggling is immutable, persistence round-trips
 * through localStorage, and malformed/legacy storage degrades to an empty list (never throws).
 */
import assert from 'assert';

// Mock localStorage before importing the module under test.
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

const { loadWatchlist, saveWatchlist, toggleWatch } = await import('../src/lib/watchlist');

console.log('--- RUNNING WATCHLIST TEST SUITE ---');

// 1) Empty by default.
assert.deepStrictEqual(loadWatchlist(), [], 'empty when nothing saved');

// 2) toggleWatch adds when absent, removes when present — immutably.
const a = toggleWatch([], 'SPY');
assert.deepStrictEqual(a, ['SPY'], 'adds a new ticker');
const b = toggleWatch(a, 'QQQ');
assert.deepStrictEqual(b, ['SPY', 'QQQ'], 'appends a second');
assert.deepStrictEqual(a, ['SPY'], 'previous array is not mutated');
const c = toggleWatch(b, 'SPY');
assert.deepStrictEqual(c, ['QQQ'], 'removes an existing ticker');

// 3) Persistence round-trips.
saveWatchlist(b);
assert.deepStrictEqual(loadWatchlist(), ['SPY', 'QQQ'], 'save → load round-trip');

// 4) Malformed / legacy storage is safe.
store['slayer.watchlist.v1'] = '{not json';
assert.deepStrictEqual(loadWatchlist(), [], 'malformed JSON degrades to empty');
store['slayer.watchlist.v1'] = '[1, 2, "X"]';
assert.deepStrictEqual(loadWatchlist(), ['X'], 'non-string entries are filtered out');

console.log('🎉 ALL WATCHLIST TESTS PASSED! 🎉');
