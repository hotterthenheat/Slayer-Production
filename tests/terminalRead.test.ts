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
  assert(typeof r.noTrade === 'boolean', 'noTrade flag present');
}

// The battle plan is always directionally coherent: target beyond spot in the bias
// direction, stop on the other side — or an explicit no-trade.
for (const [r, sp] of [[bull, 6790], [bear, 6740]] as [typeof bull, number][]) {
  if (!r.noTrade && r.bias !== 'NEUTRAL') {
    const d = r.bias === 'LONG' ? 1 : -1;
    if (r.target != null) assert(d * (r.target - sp) > 0, `${r.bias} target must lie in the bias direction (got ${r.target} vs spot ${sp})`);
    if (r.stop != null) assert(d * (sp - r.stop) > 0, `${r.bias} stop must lie opposite the bias (got ${r.stop} vs spot ${sp})`);
  }
}
assert(bull.target === 6800, 'PIN long target = magnet, got ' + bull.target);
assert(bear.target === 6720 && bear.stop === 6770, 'TREND short → put-wall target / flip stop');

// A LONG read whose only "target" sits below spot must degrade to no-trade, never paint a loss green.
const incoherent = computeTerminalRead({ spot: 6800, netGex: 5e8, gammaFlip: 6790, magnet: 6770, callWall: 6795, putWall: 6700, totalCallOi: 70000, totalPutOi: 30000 }, [6790, 6794, 6798, 6800]);
if (incoherent.bias === 'LONG') assert(incoherent.noTrade || (incoherent.target != null && incoherent.target > 6800), 'LONG never shows a target below spot');

// Honest Vanna: aggregated from per-strike vex, never synthesized.
const mk = (o: object) => ({ strike: 0, callGex: 0, putGex: 0, netGex: 0, callOi: 0, putOi: 0, callVolume: 0, putVolume: 0, ...o });
const vexRead = computeTerminalRead({ spot: 100, netGex: 1e8, strikes: [mk({ callVex: 3, putVex: -1 }), mk({ netVex: 5 })] as any }, []);
assert(vexRead.netVex === 7, 'netVex aggregates per-strike vex (2 + 5), got ' + vexRead.netVex);
assert(computeTerminalRead({ spot: 100, netGex: 1e8 }, []).netVex === undefined, 'no vex data → undefined (never invented)');

console.log('🎉 ALL TERMINAL-READ TESTS PASSED! 🎉');
