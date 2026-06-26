/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the dealer-read edge scorer — the moat math. We construct reads with KNOWN forward
 * paths and assert the verdict/score, then roll a mixed set into a track record and assert the
 * credit-weighted hit-rate, per-regime split, and calibration. Pure + deterministic, so exact.
 */
import assert from 'assert';
import { scoreRead, summarize, ReadSnapshot, ScoredRead } from '../src/lib/edgeTracker';

console.log('--- RUNNING EDGE-TRACKER TEST SUITE ---');

let _id = 0;
const snap = (over: Partial<ReadSnapshot>): ReadSnapshot => ({
  id: `r${_id++}`, ts: 1, ticker: 'SPX', spot: 100, regime: 'TREND UP', bias: 'up',
  target: undefined, confidence: 60, provenance: 'live', ...over,
});
const scored = (over: Partial<ReadSnapshot>, path: number[]): ScoredRead => {
  const s = snap(over); const r = scoreRead(s, path); assert(r, 'scoreRead produced a resolution'); return { ...s, resolution: r! };
};

// ── Directional: UP that reaches its target → clean hit ──
{
  const r = scoreRead(snap({ bias: 'up', target: 101 }), [100.2, 100.6, 101.2])!;
  assert.strictEqual(r.verdict, 'hit', 'up read that reaches target is a hit');
  assert(r.reachedTarget, 'target flagged reached');
  assert(r.score > 0.5, 'strong positive score');
}

// ── Directional: UP that reverses down → miss, negative score ──
{
  const r = scoreRead(snap({ bias: 'up', target: 101 }), [99.8, 99.5, 99.0])!;
  assert.strictEqual(r.verdict, 'miss', 'up read that falls is a miss');
  assert(r.score < 0, 'negative score on a miss');
}

// ── Directional: barely moves → flat (no edge shown, not a miss) ──
{
  const r = scoreRead(snap({ bias: 'up', target: undefined }), [100.02, 100.05, 100.03])!;
  assert.strictEqual(r.verdict, 'flat', 'a non-move is flat, not a miss');
}

// ── Directional: favorable move but bigger adverse, target not reached → partial ──
{
  const r = scoreRead(snap({ bias: 'up', target: 102 }), [99.5, 100.4])!;
  assert.strictEqual(r.verdict, 'partial', 'favorable-but-whippy, target unreached → partial');
  assert(!r.reachedTarget, 'far target not reached');
}

// ── Directional DOWN symmetry: falls to target → hit ──
{
  const r = scoreRead(snap({ bias: 'down', target: 99 }), [99.8, 99.3, 98.8])!;
  assert.strictEqual(r.verdict, 'hit', 'down read that reaches a lower target is a hit');
  assert(r.reachedTarget, 'down target reached');
}

// ── Sideways: tight range around the pin → hit, high score ──
{
  const r = scoreRead(snap({ bias: 'sideways', regime: 'PINNING', target: 100 }), [100.05, 99.95, 100.1, 100.0])!;
  assert.strictEqual(r.verdict, 'hit', 'a tight pin is a hit');
  assert(r.score > 0, 'positive pin score');
}

// ── Sideways: trends away (wide range) → miss ──
{
  const r = scoreRead(snap({ bias: 'sideways', regime: 'PINNING', target: 100 }), [100.3, 100.8, 101.2])!;
  assert.strictEqual(r.verdict, 'miss', 'a pin that trends away is a miss');
  assert(r.score < 0, 'negative score when the pin breaks');
}

// ── Guard: no forward data → null ──
assert.strictEqual(scoreRead(snap({}), []), null, 'empty forward path yields null');
assert.strictEqual(scoreRead(snap({ spot: 0 }), [100, 101]), null, 'zero spot yields null');

// ── Track record: mixed set, credit-weighted hit-rate (hit=1, partial=0.5, miss/flat=0) ──
{
  const set: ScoredRead[] = [
    scored({ bias: 'up', target: 101, regime: 'TREND UP', confidence: 85 }, [100.4, 101.3]),   // hit
    scored({ bias: 'sideways', target: 100, regime: 'PINNING', confidence: 70 }, [100.05, 99.97, 100.02]), // hit
    scored({ bias: 'up', target: 103, regime: 'TREND UP', confidence: 55 }, [99.5, 100.4]),     // partial
    scored({ bias: 'up', target: 101, regime: 'TREND UP', confidence: 50 }, [99.6, 99.2]),      // miss
  ];
  const t = summarize(set);
  assert.strictEqual(t.n, 4, 'four resolved reads');
  assert.strictEqual(t.cleanHits, 2, 'two clean hits');
  assert.strictEqual(t.misses, 1, 'one miss');
  // credit = (1 + 1 + 0.5 + 0) / 4 = 0.625
  assert(Math.abs(t.hitRate - 62.5) < 1e-6, `hitRate is credit-weighted 62.5 (got ${t.hitRate})`);
  const tup = t.byRegime.find(b => b.regime === 'TREND UP')!;
  assert.strictEqual(tup.n, 3, 'three TREND UP reads grouped');
  assert(t.calibration.length >= 2, 'multiple confidence buckets populated');
  assert(t.calibrationError >= 0 && t.calibrationError <= 100, 'calibration error in range');
}

// ── Provenance is never conflated: summarize only sees what the caller passes ──
{
  const mixed: ScoredRead[] = [
    scored({ provenance: 'live', bias: 'up', target: 101 }, [100.4, 101.2]),
    scored({ provenance: 'model', bias: 'up', target: 101 }, [99.5, 99.0]),
    scored({ provenance: 'model', bias: 'up', target: 101 }, [99.4, 99.1]),
  ];
  assert.strictEqual(summarize(mixed.filter(r => r.provenance === 'live')).n, 1, 'live bucket isolated');
  assert.strictEqual(summarize(mixed.filter(r => r.provenance === 'model')).n, 2, 'model bucket isolated');
}

// ── Empty input is safe ──
assert.strictEqual(summarize([]).n, 0, 'empty summarize is zeroed, not a throw');

console.log('🎉 ALL EDGE-TRACKER TESTS PASSED! 🎉');
