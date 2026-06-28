/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration test for the full dealer-read pipeline: a synthetic option chain → buildGexProfile
 * (gexEngine) → computeTerminalRead + computeGexOutlook (terminalRead). Unit tests cover each engine
 * in isolation; this asserts they compose coherently end-to-end — every output finite & bounded, the
 * regime consistent with the net-gamma sign, and bias/score directionally consistent.
 */
import assert from 'assert';
import { buildGexProfile } from '../src/lib/gexEngine';
import { computeTerminalRead, computeGexOutlook } from '../src/lib/terminalRead';
import type { GexProfileData } from '../src/types';

console.log('--- RUNNING READ-PIPELINE INTEGRATION TEST SUITE ---');

const spot = 6000, step = 25;
const recent = [5980, 5990, 6000, 6005, 6010, 6012]; // gentle uptrend

// Build a realistic LiveOptionContract-shaped chain: gamma peaks ATM, call OI skews above spot and
// put OI below, so the profile forms distinct call/put walls on each side.
const chain: any[] = [];
for (let k = spot - 250; k <= spot + 250; k += step) {
  const dist = Math.abs(k - spot) / spot;
  const gamma = Math.max(1e-4, 0.02 * Math.exp(-Math.pow((k - spot) / (spot * 0.02), 2)));
  const callOi = Math.round(2000 * Math.exp(-Math.pow((k - (spot + 60)) / 120, 2)) + 100);
  const putOi = Math.round(2000 * Math.exp(-Math.pow((k - (spot - 60)) / 120, 2)) + 100);
  chain.push({ strike: k, type: 'C', oi: callOi, volume: Math.round(callOi * 0.6), greeks: { gamma }, impliedVolatility: 0.18 + dist });
  chain.push({ strike: k, type: 'P', oi: putOi, volume: Math.round(putOi * 0.6), greeks: { gamma }, impliedVolatility: 0.18 + dist });
}

// 1) Profile builds and every headline field is finite.
const prof = buildGexProfile(chain, spot, 5 / 365);
assert.ok(prof, 'profile built from a non-empty chain');
const p = prof!;
for (const [name, v] of Object.entries({ netGex: p.netGex, callWall: p.callWall, putWall: p.putWall, gammaFlip: p.gammaFlip, magnet: p.magnet, em: p.expectedMovePct })) {
  assert.ok(Number.isFinite(v), `profile.${name} is finite (${v})`);
}
const lo = spot - 250, hi = spot + 250;
assert.ok(p.callWall >= lo && p.callWall <= hi && p.putWall >= lo && p.putWall <= hi, 'walls within the strike range');
assert.ok(p.strikes.length > 5, 'per-strike rows populated');
for (const s of p.strikes) for (const v of [s.callGex, s.putGex, s.netGex, s.callOi, s.putOi]) assert.ok(Number.isFinite(v), 'every per-strike value is finite');

// 2) Terminal read composes coherently.
const profile = p as unknown as GexProfileData;
const read = computeTerminalRead(profile, recent);
assert.ok(['LONG', 'SHORT', 'NEUTRAL'].includes(read.bias), 'valid bias');
assert.ok(read.score >= -100 && read.score <= 100, 'score in [-100,100]');
assert.ok(read.confidence >= 0 && read.confidence <= 100, 'confidence in [0,100]');
assert.ok(read.positionStrength >= 0 && read.positionStrength <= 100, 'positionStrength in [0,100]');
assert.strictEqual(read.regime, p.netGex >= 0 ? 'PIN' : 'TREND', 'regime consistent with net-gamma sign');
if (read.bias === 'LONG') assert.ok(read.score > 0, 'LONG ⇒ positive score');
if (read.bias === 'SHORT') assert.ok(read.score < 0, 'SHORT ⇒ negative score');
assert.ok(read.signals.length > 0 && read.signals.every(s => Number.isFinite(s.weight)), 'signals present & finite');

// 3) GEX outlook composes coherently.
const outlook = computeGexOutlook(profile, recent);
assert.ok(outlook.confidence >= 0 && outlook.confidence <= 100, 'outlook confidence in [0,100]');
assert.ok(['up', 'down', 'sideways'].includes(outlook.bias), 'valid outlook bias');
assert.ok(typeof outlook.headline === 'string' && outlook.headline.length > 0, 'outlook has a headline');

// 4) Empty/degenerate profile must not throw and stays bounded.
const empty = computeTerminalRead({ spot: 0, netGex: 0, strikes: [] }, []);
assert.ok(Number.isFinite(empty.positionStrength) && empty.bias === 'NEUTRAL', 'empty profile ⇒ safe NEUTRAL read');

console.log('🎉 ALL READ-PIPELINE INTEGRATION TESTS PASSED! 🎉');
