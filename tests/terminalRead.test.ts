/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sanity + invariant tests for the Live Terminal synthesis engine.
 */
import assert from 'assert';
import { computeTerminalRead, computeGexOutlook } from '../src/lib/terminalRead';

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
  assert(r.pinStrength >= 0 && r.pinStrength <= 100, 'pinStrength bounded 0..100');
}
// Pin strength only fires in a long-gamma PIN, and a tightly concentrated profile pins harder.
assert(bear.pinStrength === 0, 'TREND (short gamma) → pinStrength 0');
const tightPin = computeTerminalRead({ spot: 100, netGex: 1e9, gammaFlip: 99, magnet: 100, callWall: 103, putWall: 97, strikes: [{ strike: 100, callGex: 9e8, putGex: -1e8, netGex: 8e8, callOi: 0, putOi: 0, callVolume: 0, putVolume: 0 }, { strike: 101, callGex: 1e7, putGex: 0, netGex: 1e7, callOi: 0, putOi: 0, callVolume: 0, putVolume: 0 }] as any }, []);
assert(tightPin.pinStrength > 50, 'concentrated gamma at spot → strong pin, got ' + tightPin.pinStrength);

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

// ── GEX OUTLOOK — descriptive regime/path classifier ─────────────────────────
console.log('--- RUNNING GEX-OUTLOOK TEST SUITE ---');

const mkStrike = (o: object) => ({ strike: 0, callGex: 0, putGex: 0, netGex: 0, callOi: 0, putOi: 0, callVolume: 0, putVolume: 0, ...o });
// Universal invariants every outlook must satisfy.
const validRegimes = ['PINNING', 'GAMMA SQUEEZE', 'SHORT SQUEEZE', 'TREND UP', 'TREND DOWN', 'RANGE', 'NEUTRAL'];
const checkOutlook = (o: ReturnType<typeof computeGexOutlook>, msg: string) => {
  assert(validRegimes.includes(o.regime), `${msg}: regime valid, got ${o.regime}`);
  assert(['up', 'down', 'sideways'].includes(o.bias), `${msg}: bias valid, got ${o.bias}`);
  assert(o.confidence >= 0 && o.confidence <= 100, `${msg}: confidence in [0,100], got ${o.confidence}`);
  assert(typeof o.headline === 'string' && o.headline.length > 0, `${msg}: has headline`);
  assert(typeof o.detail === 'string' && o.detail.length > 0, `${msg}: has detail`);
  assert(o.target === undefined || typeof o.target === 'number', `${msg}: target is number|undefined`);
};

// PINNING — long gamma, spot glued to a concentrated magnet/dominant strike.
const pinOut = computeGexOutlook({
  spot: 6800, netGex: 1.5e9, gammaFlip: 6770, magnet: 6800, callWall: 6850, putWall: 6750,
  totalCallOi: 50000, totalPutOi: 50000,
  strikes: [mkStrike({ strike: 6800, netGex: 9e8 }), mkStrike({ strike: 6810, netGex: 5e7 }), mkStrike({ strike: 6790, netGex: 5e7 })] as any,
}, [6799, 6801, 6800, 6800, 6800]);
checkOutlook(pinOut, 'PINNING');
assert(pinOut.regime === 'PINNING', 'glued to concentrated magnet → PINNING, got ' + pinOut.regime);
assert(pinOut.bias === 'sideways', 'pin bias sideways');
assert(pinOut.target === 6800, 'pin target = magnet, got ' + pinOut.target);

// GAMMA SQUEEZE — long gamma above flip, pressing up into a near call wall, call-heavy, rising.
const gsOut = computeGexOutlook({
  spot: 6845, netGex: 1.2e9, gammaFlip: 6800, magnet: 6820, callWall: 6850, putWall: 6750,
  totalCallOi: 75000, totalPutOi: 25000,
  strikes: [mkStrike({ strike: 6850, netGex: 6e8 }), mkStrike({ strike: 6820, netGex: 4e8 })] as any,
}, [6815, 6828, 6838, 6843, 6845]);
checkOutlook(gsOut, 'GAMMA SQUEEZE');
assert(gsOut.regime === 'GAMMA SQUEEZE', 'pressing call wall in pos gamma → GAMMA SQUEEZE, got ' + gsOut.regime);
assert(gsOut.bias === 'up', 'gamma squeeze bias up');
assert(gsOut.target === 6850, 'gamma squeeze target = call wall, got ' + gsOut.target);

// SHORT SQUEEZE — short gamma, put-heavy, reversing up off the window low (forced covering).
const ssOut = computeGexOutlook({
  spot: 6760, netGex: -9e8, gammaFlip: 6800, magnet: 6770, callWall: 6850, putWall: 6720,
  totalCallOi: 30000, totalPutOi: 70000,
}, [6745, 6730, 6735, 6750, 6760]);
checkOutlook(ssOut, 'SHORT SQUEEZE');
assert(ssOut.regime === 'SHORT SQUEEZE', 'short gamma + put-heavy reversal up → SHORT SQUEEZE, got ' + ssOut.regime);
assert(ssOut.bias === 'up', 'short squeeze bias up');
assert(ssOut.target === 6800 || ssOut.target === 6850, 'short squeeze target = flip or call wall, got ' + ssOut.target);

// TREND DOWN — short gamma below the flip, falling (dealers amplify selling).
const tdOut = computeGexOutlook({
  spot: 6740, netGex: -8e8, gammaFlip: 6800, magnet: 6760, callWall: 6850, putWall: 6700,
  totalCallOi: 35000, totalPutOi: 65000,
}, [6790, 6775, 6760, 6748, 6740]);
checkOutlook(tdOut, 'TREND DOWN');
assert(tdOut.regime === 'TREND DOWN', 'short gamma below flip falling → TREND DOWN, got ' + tdOut.regime);
assert(tdOut.bias === 'down', 'trend down bias down');
assert(tdOut.target === 6700, 'trend down target = put wall, got ' + tdOut.target);

// RANGE — long gamma, mid-cage between walls, not pinned and no momentum.
const rngOut = computeGexOutlook({
  spot: 6800, netGex: 6e8, gammaFlip: 6770, magnet: 6790, callWall: 6850, putWall: 6750,
  totalCallOi: 50000, totalPutOi: 50000,
  strikes: [mkStrike({ strike: 6760, netGex: 3e8 }), mkStrike({ strike: 6840, netGex: 3e8 }), mkStrike({ strike: 6800, netGex: 1e8 })] as any,
}, [6800, 6800, 6800, 6800]);
checkOutlook(rngOut, 'RANGE');
assert(rngOut.regime === 'RANGE', 'long gamma mid-cage, not pinned → RANGE, got ' + rngOut.regime);
assert(rngOut.bias === 'sideways', 'range bias sideways');
assert(rngOut.target == null || (rngOut.target > 6750 && rngOut.target < 6850), 'range target inside cage or undefined, got ' + rngOut.target);

// NEUTRAL — empty / insufficient data must not throw and must stay low-confidence.
const neuOut = computeGexOutlook({}, []);
checkOutlook(neuOut, 'NEUTRAL');
assert(neuOut.regime === 'NEUTRAL', 'empty profile → NEUTRAL, got ' + neuOut.regime);
assert(neuOut.target === undefined, 'NEUTRAL has no target');
assert(neuOut.confidence <= 30, 'NEUTRAL low confidence, got ' + neuOut.confidence);

// Robustness: a grab-bag of degenerate inputs must never throw or produce NaN.
for (const p of [{}, { spot: 6800 }, { netGex: 1e9 }, { spot: 6800, netGex: -1e9 }, { spot: 6800, netGex: 0, strikes: [] as any }] as any[]) {
  const o = computeGexOutlook(p, []);
  checkOutlook(o, 'robustness');
  assert(!Number.isNaN(o.confidence), 'confidence never NaN');
  assert(o.target === undefined || !Number.isNaN(o.target), 'target never NaN');
}

console.log('🎉 ALL GEX-OUTLOOK TESTS PASSED! 🎉');

console.log('🎉 ALL TERMINAL-READ TESTS PASSED! 🎉');
