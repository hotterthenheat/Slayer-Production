/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the shared data-integrity guards — the server/client gate that stops corrupt market
 * data (negative OI, crossed books, NaN greeks, inverted candles, bad spots) from becoming
 * fabricated GEX walls or poisoned reads. Conservative: only clearly-bad data must be rejected.
 */
import assert from 'assert';
import { isSaneContract, sanitizeChain, isSaneCandle, validateSsePayload, ChainLike } from '../src/lib/dataIntegrity';

console.log('--- RUNNING DATA-INTEGRITY TEST SUITE ---');

const good: ChainLike = { strike: 6800, type: 'call', openInterest: 1200, iv: 0.18, bid: 4.2, ask: 4.4, delta: 0.45, gamma: 0.012, vega: 0.8, theta: -0.3, vanna: 0.02, charm: -0.01, volume: 900 };

// ── isSaneContract ──
assert(isSaneContract(good), 'a clean contract passes');
assert(!isSaneContract({ ...good, openInterest: -5 }), 'negative OI rejected');
assert(!isSaneContract({ ...good, bid: 5.0, ask: 4.0 }), 'crossed book (bid>ask) rejected');
assert(!isSaneContract({ ...good, gamma: NaN }), 'NaN greek rejected');
assert(!isSaneContract({ ...good, delta: 2.3 }), '|delta|>1.5 rejected');
assert(!isSaneContract({ ...good, gamma: -0.01 }), 'negative gamma rejected');
assert(!isSaneContract({ ...good, iv: 9 }), 'IV>500% rejected');
assert(!isSaneContract({ ...good, strike: 0 }), 'non-positive strike rejected');
assert(isSaneContract({ ...good, vanna: 0, charm: 0 }), 'zeroed vanna/charm still sane');
assert(isSaneContract({ ...good, bid: 0, ask: 0 }), 'a 0/0 (no quote) book is allowed, not crossed');

// ── sanitizeChain ──
{
  const chain = [good, { ...good, openInterest: -1 }, { ...good, strike: 6810 }, { ...good, ask: 1, bid: 9 }];
  const { clean, invalidCount, total } = sanitizeChain(chain);
  assert.strictEqual(total, 4, 'counts all rows');
  assert.strictEqual(invalidCount, 2, 'drops the two corrupt rows');
  assert.strictEqual(clean.length, 2, 'keeps the two clean rows');
  assert.deepStrictEqual(sanitizeChain([]), { clean: [], invalidCount: 0, total: 0 }, 'empty chain safe');
  assert.deepStrictEqual(sanitizeChain(null as any), { clean: [], invalidCount: 0, total: 0 }, 'non-array safe');
}

// ── isSaneCandle ──
assert(isSaneCandle({ open: 100, high: 101, low: 99, close: 100.5 }), 'a normal candle passes');
assert(!isSaneCandle({ open: 100, high: 98, low: 99, close: 100 }), 'inverted (high<low) rejected');
assert(!isSaneCandle({ open: 100, high: 101, low: -1, close: 100 }), 'non-positive low rejected');
assert(!isSaneCandle({ open: 100, high: 101, low: 99, close: 105 }), 'close above high rejected');
assert(!isSaneCandle({ open: 100, high: NaN, low: 99, close: 100 }), 'NaN field rejected');
assert(!isSaneCandle(null), 'null candle rejected');

// ── validateSsePayload ──
assert(validateSsePayload({ contract: 'SPX 6800C', trade_health: 72, pinpoint_map: { spot_price: 6789 }, candles: [{ open: 1, high: 2, low: 0.5, close: 1.5 }] }).ok, 'a sane payload is accepted');
assert(validateSsePayload({ contract: 'SPX 6800C' }).ok, 'a sparse-but-valid payload passes (only present fields checked)');
assert(!validateSsePayload({ pinpoint_map: { spot_price: 0 } }).ok, 'non-positive spot rejected');
assert(!validateSsePayload({ pinpoint_map: { spot_price: -5 } }).ok, 'negative spot rejected');
assert(!validateSsePayload({ trade_health: 140 }).ok, 'out-of-range trade_health rejected');
assert(!validateSsePayload({ candles: [{ open: 1, high: 2, low: 0.5, close: 1.5 }, { open: 1, high: 0.2, low: 9, close: 1 }] }).ok, 'a malformed candle in the tail rejects the frame');
assert(!validateSsePayload(null).ok, 'null payload rejected');
assert(validateSsePayload({ provenance: { inputs: { underlying_price: 420.5 } } }).ok, 'spot via provenance path passes');

console.log('🎉 ALL DATA-INTEGRITY TESTS PASSED! 🎉');
