/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sky Vision v2.0 — contract-strength engine tests (Layer 1/2 + rotation scanner).
 */
import assert from 'node:assert';
import {
  scoreContract,
  rankContractStrengths,
  snapshotFromMarket,
  type ContractSnapshot,
} from '../src/lib/skyVisionEngine';

/** Build a window of snapshots where each metric ramps linearly from→to. */
function ramp(opts: {
  n?: number;
  premium: [number, number];
  delta: [number, number];
  gamma: [number, number];
  volume: [number, number];
  oi: [number, number];
  iv: [number, number];
}): ContractSnapshot[] {
  const n = opts.n ?? 12;
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  const out: ContractSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    out.push({
      t: i,
      premium: lerp(opts.premium[0], opts.premium[1], f),
      delta: lerp(opts.delta[0], opts.delta[1], f),
      gamma: lerp(opts.gamma[0], opts.gamma[1], f),
      volume: lerp(opts.volume[0], opts.volume[1], f),
      oi: lerp(opts.oi[0], opts.oi[1], f),
      iv: lerp(opts.iv[0], opts.iv[1], f),
      theta: -1.2,
      vega: 0.15,
    });
  }
  return out;
}

console.log('--- RUNNING SKY VISION ENGINE TEST SUITE ---\n');

// 1. A strengthening CALL: premium/delta/gamma/volume/OI/IV all rising.
console.log('Testing Contract Strength — strengthening call...');
{
  const hist = ramp({ premium: [1.0, 3.2], delta: [0.45, 0.63], gamma: [0.018, 0.030], volume: [120, 950], oi: [1000, 1700], iv: [0.14, 0.20] });
  const s = scoreContract(hist, true);
  assert.ok(s.score >= 75, `strengthening call should score high, got ${s.score}`);
  assert.strictEqual(s.trend, 'RISING', `expected RISING, got ${s.trend}`);
  assert.ok(s.confidence >= 60, `expected solid confidence, got ${s.confidence}`);
  assert.ok(['Buy', 'Strong Buy', 'Accumulate'].includes(s.label), `unexpected label ${s.label}`);
  console.log(`✔ strengthening call: score=${s.score} ${s.trend} conf=${s.confidence} "${s.label}"`);
}

// 2. A weakening CALL: everything fading.
console.log('Testing Contract Strength — weakening call...');
{
  const hist = ramp({ premium: [3.2, 1.0], delta: [0.62, 0.41], gamma: [0.030, 0.018], volume: [950, 150], oi: [1700, 1500], iv: [0.21, 0.13] });
  const s = scoreContract(hist, true);
  assert.ok(s.score <= 30, `weakening call should score low, got ${s.score}`);
  assert.strictEqual(s.trend, 'FALLING', `expected FALLING, got ${s.trend}`);
  console.log(`✔ weakening call: score=${s.score} ${s.trend} conf=${s.confidence} "${s.label}"`);
}

// 3. A strengthening PUT: delta becoming MORE negative + premium/IV/volume rising.
console.log('Testing Contract Strength — strengthening put...');
{
  const hist = ramp({ premium: [1.1, 2.9], delta: [-0.40, -0.63], gamma: [0.018, 0.029], volume: [140, 880], oi: [900, 1500], iv: [0.15, 0.21] });
  const s = scoreContract(hist, false);
  assert.ok(s.score >= 75, `strengthening put should score high, got ${s.score}`);
  assert.strictEqual(s.trend, 'RISING', `expected RISING, got ${s.trend}`);
  console.log(`✔ strengthening put: score=${s.score} ${s.trend} conf=${s.confidence} "${s.label}"`);
}

// 4. Insufficient data → neutral, low confidence.
console.log('Testing Contract Strength — insufficient data...');
{
  const s = scoreContract([{ t: 0, premium: 1, volume: 10, oi: 100, delta: 0.5, gamma: 0.02, theta: -1, vega: 0.1, iv: 0.15 }], true);
  assert.strictEqual(s.score, 50, 'single snapshot should be neutral 50');
  assert.ok(s.confidence <= 30, 'single snapshot confidence should be low');
  console.log(`✔ insufficient data: score=${s.score} conf=${s.confidence} "${s.label}"`);
}

// 5. Rotation Scanner: strongest contract on the chain is identified.
console.log('Testing Contract Rotation Scanner...');
{
  const strong = scoreContract(ramp({ premium: [1.0, 3.4], delta: [0.45, 0.64], gamma: [0.018, 0.031], volume: [120, 1000], oi: [1000, 1800], iv: [0.14, 0.21] }), true);
  const mid = scoreContract(ramp({ premium: [1.5, 2.0], delta: [0.50, 0.54], gamma: [0.020, 0.022], volume: [300, 420], oi: [1200, 1260], iv: [0.16, 0.17] }), true);
  const weak = scoreContract(ramp({ premium: [2.8, 1.4], delta: [0.60, 0.44], gamma: [0.028, 0.019], volume: [800, 250], oi: [1500, 1400], iv: [0.20, 0.14] }), true);
  const ranked = rankContractStrengths([
    { key: 'SPY 621C', strike: 621, isCall: true, strength: mid },
    { key: 'SPY 622C', strike: 622, isCall: true, strength: strong },
    { key: 'SPY 623C', strike: 623, isCall: true, strength: weak },
  ]);
  assert.strictEqual(ranked[0].key, 'SPY 622C', `strongest should be 622C, got ${ranked[0].key}`);
  assert.ok(ranked[0].strongest, 'rank 1 should be flagged strongest');
  assert.strictEqual(ranked[2].key, 'SPY 623C', 'weakest should rank last');
  assert.deepStrictEqual(ranked.map((r) => r.rank), [1, 2, 3], 'ranks sequential');
  console.log(`✔ rotation scanner: strongest=${ranked[0].key} (${ranked[0].strength.score}) > ${ranked[1].key} (${ranked[1].strength.score}) > ${ranked[2].key} (${ranked[2].strength.score})`);
}

// 6. snapshotFromMarket sanity: ATM call delta ~0.5, positive premium.
console.log('Testing snapshotFromMarket (BSM bridge)...');
{
  const snap = snapshotFromMarket({ t: 0, spot: 620, strike: 620, dteDays: 0.5, iv: 0.15, isCall: true, volume: 500, oi: 2000 });
  assert.ok(snap.premium > 0, 'ATM premium should be positive');
  assert.ok(snap.delta > 0.4 && snap.delta < 0.65, `ATM call delta ~0.5, got ${snap.delta}`);
  assert.ok(snap.gamma > 0, 'gamma positive');
  console.log(`✔ snapshotFromMarket: premium=${snap.premium} delta=${snap.delta} gamma=${snap.gamma} iv=${snap.iv}`);
}

console.log('\n=============================================');
console.log('🎉 ALL SKY VISION ENGINE TESTS PASSED! 🎉');
console.log('=============================================');
