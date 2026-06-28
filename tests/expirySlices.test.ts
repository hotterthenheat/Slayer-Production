/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for synthesizeExpirySlices — the multi-expiry gamma-matrix synthesis used when the live
 * multi-expiry fetch is off. Verifies the 4 expiry offsets, that gamma/volume decay further-dated,
 * that the front slice preserves the full chain, that call/put walls land on the dominant ± strikes,
 * and that output is deterministic for a given `now`.
 */
import assert from 'assert';
import { synthesizeExpirySlices } from '../src/data';

console.log('--- RUNNING EXPIRY-SLICES TEST SUITE ---');

const strikes = [
  { strike: 5950, netGex: -3e8, callGex: 1e8, putGex: -4e8, vol: 1000 },
  { strike: 6000, netGex: 5e8, callGex: 6e8, putGex: -1e8, vol: 2000 },
  { strike: 6050, netGex: 4e8, callGex: 5e8, putGex: -1e8, vol: 1500 },
];
const asset = { optionsStyle: 'monthly' } as any; // only optionsStyle is read; monthly ⇒ front dte 0
const now = new Date('2026-06-15T15:00:00Z');

const slices = synthesizeExpirySlices(strikes, asset, now);

// 1) Four slices at the expected day offsets.
assert.strictEqual(slices.length, 4, 'produces 4 expiry slices');
assert.deepStrictEqual(slices.map(s => s.dte), [0, 7, 14, 28], 'dte offsets front · +1w · +2w · ~1mo');

// 2) Front slice preserves the full chain gamma; later slices decay monotonically.
const frontNet = strikes.reduce((a, s) => a + s.netGex, 0); // 6e8
assert.ok(Math.abs(slices[0].netGex - frontNet) < 1, 'front slice = undecayed gamma');
assert.ok(Math.abs(slices[1].netGex) < Math.abs(slices[0].netGex), 'gamma decays at +1w');
assert.ok(Math.abs(slices[2].netGex) < Math.abs(slices[1].netGex), 'gamma decays at +2w');
assert.ok(Math.abs(slices[3].netGex) < Math.abs(slices[2].netGex), 'gamma decays at ~1mo');

// 3) Volume thins further-dated (per-strike).
assert.ok(slices[1].strikes[1].vol! < slices[0].strikes[1].vol!, 'volume thins out at +1w');
assert.ok(slices[3].strikes[1].vol! < slices[1].strikes[1].vol!, 'volume thins further at ~1mo');

// 4) Walls land on the dominant ± gamma strikes.
assert.strictEqual(slices[0].callWall, 6000, 'call wall = strongest +gamma strike');
assert.strictEqual(slices[0].putWall, 5950, 'put wall = strongest -gamma strike');

// 5) Per-strike call/put gamma carried through and scaled (front = unscaled).
assert.strictEqual(slices[0].strikes[1].callGex, 6e8, 'front call gamma unscaled');
assert.ok(slices[1].strikes[1].callGex! < slices[0].strikes[1].callGex!, 'call gamma decays out');

// 6) Deterministic for a fixed `now`; empty input ⇒ empty output.
assert.deepStrictEqual(synthesizeExpirySlices(strikes, asset, now), slices, 'deterministic for fixed now');
assert.deepStrictEqual(synthesizeExpirySlices([], asset, now), [], 'empty strikes ⇒ []');

console.log('🎉 ALL EXPIRY-SLICES TESTS PASSED! 🎉');
