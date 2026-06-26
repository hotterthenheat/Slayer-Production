/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sanity + invariant tests for the Live Terminal synthesis engine.
 */
import assert from 'assert';
import { computeTerminalRead } from '../src/lib/terminalRead';

console.log('--- RUNNING TERMINAL-READ TEST SUITE ---');

// Clean bullish setup: above flip, magnet above, supported near put wall, call-heavy, rising.
const bull = computeTerminalRead(
  { spot: 6790, netGex: 1.4e9, gammaFlip: 6770, magnet: 6800, callWall: 6850, putWall: 6720, totalCallOi: 60000, totalPutOi: 40000, expectedMovePct: 0.0085 },
  [6770, 6775, 6782, 6788, 6790],
);
assert(bull.bias === 'LONG', 'bullish setup → LONG, got ' + bull.bias);
assert(bull.score > 0, 'bullish score positive');
assert(bull.confidence >= 0 && bull.confidence <= 100, 'confidence in range');
assert(bull.regime === 'PIN', 'positive net gamma → PIN');
assert(bull.signals.length >= 4, 'produces signals');
assert(typeof bull.play === 'string' && bull.play.length > 0, 'has a play');
assert(bull.events.length > 0, 'has narrative events');

// Clean bearish setup: below flip, put-heavy, falling, negative gamma → TREND.
const bear = computeTerminalRead(
  { spot: 6740, netGex: -8e8, gammaFlip: 6770, magnet: 6760, callWall: 6850, putWall: 6720, totalCallOi: 38000, totalPutOi: 62000, expectedMovePct: 0.009 },
  [6770, 6762, 6752, 6745, 6740],
);
assert(bear.bias === 'SHORT', 'bearish setup → SHORT, got ' + bear.bias);
assert(bear.score < 0, 'bearish score negative');
assert(bear.regime === 'TREND', 'negative net gamma → TREND');
assert(bear.stop === 6770, 'trend stop is the γ-flip');

// Balanced/empty profile shouldn't throw and should not over-commit.
const flat = computeTerminalRead({ spot: 6800, netGex: 0 }, []);
assert(['LONG', 'SHORT', 'NEUTRAL'].includes(flat.bias), 'bias always valid');
assert(flat.confidence >= 0 && flat.confidence <= 100, 'confidence bounded on empty');

// Confidence is bounded and labelled for every case.
for (const r of [bull, bear, flat]) {
  assert(['High', 'Moderate', 'Low', 'Mixed'].includes(r.confidenceLabel), 'confidence label valid');
  assert(r.score >= -100 && r.score <= 100, 'score bounded');
}

console.log('🎉 ALL TERMINAL-READ TESTS PASSED! 🎉');
