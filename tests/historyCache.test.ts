/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the coalescing history-backfill cache. The whole point is that N panels on the
 * same (ticker,timeframe,count) share ONE network request, and a re-request inside the TTL is a
 * cache hit — so we assert on the mocked fetch call count, not just the returned data.
 */
import assert from 'assert';

console.log('--- RUNNING HISTORY-CACHE TEST SUITE ---');

const CANDLES = [{ timestamp: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];

let calls = 0;
let mode: 'ok' | 'fail' = 'ok';
// Mock global fetch before importing the module under test (module captures global fetch lazily).
(globalThis as unknown as { fetch: unknown }).fetch = async (_url: string) => {
  calls++;
  if (mode === 'fail') throw new Error('network down');
  return { ok: true, json: async () => ({ candles: CANDLES }) } as unknown;
};

const { fetchHistory } = await import('../src/lib/historyCache');

// 1) Six concurrent identical requests collapse into ONE fetch.
calls = 0;
const six = await Promise.all(Array.from({ length: 6 }, () => fetchHistory('SPX', '5m', 300)));
assert.strictEqual(calls, 1, 'six concurrent identical requests share one fetch');
assert(six.every(r => r === six[0]), 'all six resolve to the same candle array');
assert.strictEqual(six[0]?.length, 1, 'candles returned intact');

// 2) A follow-up request inside the TTL is a cache hit — still one fetch total.
const again = await fetchHistory('SPX', '5m', 300);
assert.strictEqual(calls, 1, 'request within TTL hits cache, no new fetch');
assert.deepStrictEqual(again, CANDLES, 'cache hit returns the cached candles');

// 3) A different key triggers its own fetch.
await fetchHistory('QQQ', '5m', 300);
assert.strictEqual(calls, 2, 'distinct (ticker) key fetches separately');
await fetchHistory('SPX', '15m', 300);
assert.strictEqual(calls, 3, 'distinct (timeframe) key fetches separately');

// 4) Errors resolve to null and are NOT cached (next call retries).
mode = 'fail';
const failed = await fetchHistory('IWM', '1m', 300);
assert.strictEqual(failed, null, 'fetch failure resolves to null, not a throw');
const before = calls;
const retry = await fetchHistory('IWM', '1m', 300);
assert.strictEqual(retry, null, 'still null on retry');
assert.strictEqual(calls, before + 1, 'failed result is not cached — it retries');

console.log('🎉 ALL HISTORY-CACHE TESTS PASSED! 🎉');
