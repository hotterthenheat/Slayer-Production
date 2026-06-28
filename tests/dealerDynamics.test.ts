/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for this session's new dealer engines: OI velocity / gamma concentration / strike
 * density / NBRS anomalies (dealerDynamics) and the Position Strength synthesis (terminalRead).
 * Asserts bounded outputs, correct directional state, determinism on identical input, and graceful
 * handling of an empty chain — so the displayed metrics are reproducible and never NaN.
 */
import assert from 'assert';
import { computeDealerDynamics, type DealerSnapshot } from '../src/lib/dealerDynamics';
import { generateMockOptionsChain } from '../src/lib/v11Math';
import { computeTerminalRead } from '../src/lib/terminalRead';
import type { GexProfileData } from '../src/types';

console.log('--- RUNNING DEALER-DYNAMICS TEST SUITE ---');

const chain = generateMockOptionsChain(6000, 0.18);
const inv = { netGex: 1e9, netVanna: 5e7, netCharm: -2e5 };

// 1) First tick (no history): concentration/density bounded, NBRS present, OI velocity 0.
const d1 = computeDealerDynamics(chain, 6000, inv, []);
assert.ok(d1.concentration.hhi > 0 && d1.concentration.hhi <= 1, 'HHI in (0,1]');
assert.ok(d1.concentration.gammaTop3Pct > 0 && d1.concentration.gammaTop3Pct <= 100, 'gamma top-3 % in (0,100]');
assert.ok(d1.concentration.oiTop3Pct > 0 && d1.concentration.oiTop3Pct <= 100, 'OI top-3 % in (0,100]');
assert.ok(d1.concentration.densityPct > 0 && d1.concentration.densityPct <= 100 && d1.concentration.densityStrike > 0, 'density cluster valid');
assert.strictEqual(d1.oiFlow.velocity, 0, 'first-tick OI velocity is 0 (no prior snapshot)');
assert.strictEqual(d1.oiFlow.state, 'STABLE', 'first-tick OI flow is STABLE');
assert.ok(d1.oiFlow.totalOi > 0, 'totalOi > 0');
for (const k of ['gamma', 'oi', 'volume'] as const) {
  assert.ok(d1.nbrs[k] && d1.nbrs[k]!.ratio >= 1 && d1.nbrs[k]!.strike > 0, `${k}-NBRS present, ratio ≥ 1`);
}

// 2) Determinism: identical chain/spot/fresh-history → identical structural metrics.
const d1b = computeDealerDynamics(chain, 6000, inv, []);
assert.deepStrictEqual(d1b.concentration, d1.concentration, 'concentration is deterministic');
assert.deepStrictEqual(d1b.nbrs, d1.nbrs, 'NBRS anomalies are deterministic');

// 3) OI flow direction: a prior snapshot 1 min old with lower OI ⇒ BUILDING (positive velocity).
const prior: DealerSnapshot = { t: Date.now() - 60_000, netGex: 1e9, netVanna: 5e7, netCharm: -2e5, gexCoM: 6000, totalOi: d1.oiFlow.totalOi - 5000 };
const d2 = computeDealerDynamics(chain, 6000, inv, [prior]);
assert.ok(d2.oiFlow.velocity > 0, 'rising OI ⇒ positive velocity');
assert.strictEqual(d2.oiFlow.state, 'BUILDING', 'rising OI ⇒ BUILDING');
const prior2: DealerSnapshot = { ...prior, totalOi: d1.oiFlow.totalOi + 5000 };
const d3 = computeDealerDynamics(chain, 6000, inv, [prior2]);
assert.strictEqual(d3.oiFlow.state, 'UNWINDING', 'falling OI ⇒ UNWINDING');

// 4) Empty chain must not throw and must zero-out cleanly (no NaN, no fabricated anomalies).
const e = computeDealerDynamics([], 6000, { netGex: 0, netVanna: 0, netCharm: 0 }, []);
assert.ok(e.concentration.hhi === 0 && e.oiFlow.totalOi === 0, 'empty chain ⇒ zeroed concentration/OI');
assert.ok(e.nbrs.gamma === null && e.nbrs.oi === null && e.nbrs.volume === null, 'empty chain ⇒ no NBRS anomalies');

console.log('--- RUNNING POSITION-STRENGTH TEST SUITE ---');

// A clearly bullish profile (call-heavy above spot) should read LONG with a non-trivial strength.
const bull: GexProfileData = (() => {
  const strikes = [] as any[];
  for (let k = 5900; k <= 6100; k += 25) {
    const callGex = k >= 6000 ? Math.max(0, 4e8 - Math.abs(k - 6050) * 2e6) : 5e7;
    const putGex = k <= 6000 ? -(Math.max(0, 3e8 - Math.abs(k - 5950) * 2e6)) : -4e7;
    strikes.push({ strike: k, callGex, putGex, netGex: callGex + putGex, callOi: callGex / 1e5, putOi: Math.abs(putGex) / 1e5, callVolume: callGex / 2e5, putVolume: Math.abs(putGex) / 2e5 });
  }
  return { spot: 6020, netGex: 1.2e9, netDex: 5e8, callWall: 6050, putWall: 5950, gammaFlip: 5980, magnet: 6025, totalCallOi: 50000, totalPutOi: 30000, expectedMovePct: 0.012, strikes };
})();
const rBull = computeTerminalRead(bull, [5970, 5985, 6000, 6010, 6020, 6022]);
assert.strictEqual(rBull.bias, 'LONG', 'call-heavy book reads LONG');
assert.ok(rBull.positionStrength >= 0 && rBull.positionStrength <= 100, 'positionStrength in [0,100]');
assert.ok(rBull.positionStrength >= 40, 'a clean directional setup has non-trivial strength');

// A balanced/empty profile should be NEUTRAL with a halved (low) strength, never NaN.
const flat: GexProfileData = { spot: 6000, netGex: 0, strikes: [] };
const rFlat = computeTerminalRead(flat, []);
assert.ok(Number.isFinite(rFlat.positionStrength) && rFlat.positionStrength >= 0 && rFlat.positionStrength <= 100, 'flat positionStrength finite & bounded');
assert.ok(rFlat.positionStrength <= rBull.positionStrength, 'flat setup is not stronger than a clean directional one');

console.log('🎉 ALL DEALER-DYNAMICS + POSITION-STRENGTH TESTS PASSED! 🎉');
