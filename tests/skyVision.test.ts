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
  computeEmaLadder,
  buildTargetStack,
  projectTargetPremiums,
  detectSwings,
  emaStructureScore,
  computeMasterScore,
  assessPositionHealth,
  evaluateDynamicExits,
  type ContractSnapshot,
  type EmaLadder,
} from '../src/lib/skyVisionEngine';
import { emaLast } from '../src/lib/technicalEngine';

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

// 7. EMA soundness — hand-computed check + constant-series invariant.
console.log('Testing Layer 3 — EMA correctness...');
{
  // values [10,11,12,13,14], period 3, k=0.5: seed=SMA(10,11,12)=11; e3=13*.5+11*.5=12; e4=14*.5+12*.5=13.
  assert.strictEqual(Number(emaLast([10, 11, 12, 13, 14], 3).toFixed(6)), 13, 'hand-computed EMA(3) should be 13');
  const flat = new Array(250).fill(100);
  const ladder = computeEmaLadder(flat);
  assert.ok([ladder.ema15, ladder.ema20, ladder.ema50, ladder.ema200].every((v) => Math.abs(v - 100) < 1e-6), 'EMA of a constant series is the constant');
  assert.strictEqual(ladder.converged200, true, 'converged200 true with 250 bars');
  console.log(`✔ EMA: hand-check=13, constant-series ladder=100, converged200=${ladder.converged200}`);
}

// 8. Target stack — in-direction, nearest-first, correct ladder (calls).
console.log('Testing Layer 3 — target stack (calls)...');
{
  const spot = 620.25;
  const emas = { ema15: 621.1, ema20: 621.45, ema50: 622.9, ema200: 626.1, converged200: true };
  const stack = buildTargetStack({ spot, isCall: true, emas, walls: { gamma: 624.0, call: 627.0 }, emHigh: 623.7, emLow: 616.8 });
  assert.ok(stack.every((t) => t.underlying > spot), 'all call targets above spot');
  for (let i = 1; i < stack.length; i++) assert.ok(stack[i].underlying >= stack[i - 1].underlying, 'ascending order');
  assert.strictEqual(stack[0].kind, 'EMA15', 'T1 = EMA15 (nearest)');
  assert.strictEqual(stack[1].kind, 'EMA20', 'T2 = EMA20');
  assert.strictEqual(stack[2].kind, 'EMA50', 'T3 = EMA50');
  assert.ok(stack.some((t) => t.kind === 'CALL_WALL') && stack.some((t) => t.kind === 'EXPECTED_MOVE'), 'wall + EM present');
  console.log(`✔ call stack: ${stack.map((t) => `${t.label}=${t.underlying}`).join(' → ')}`);

  // Premium projection rises with target distance (calls gain as price climbs).
  const proj = projectTargetPremiums(stack, { spot, strike: 620, dteDays: 0.5, iv: 0.15, isCall: true });
  assert.ok(proj.every((p) => p.projectedPremium > 0), 'projected premiums positive');
  assert.ok(proj[0].projectedPremium < proj[2].projectedPremium, 'T1 premium < T3 premium for a call');
  assert.ok(proj[0].projectedGainPct > 0, 'nearest favorable target shows a gain');
  assert.ok(proj.every((p) => p.touchProb >= 0 && p.touchProb <= 1), 'P(hit) in [0,1]');
  assert.ok(proj[0].touchProb >= proj[proj.length - 1].touchProb, 'nearer target is at least as likely as the farthest');
  assert.deepStrictEqual(proj.map((p) => p.rank), proj.map((_, i) => i + 1), 'ranks sequential');
  console.log(`✔ projections: ${proj.slice(0, 4).map((p) => `T${p.rank} ${p.label}=${p.underlying}→$${p.projectedPremium} (${p.projectedGainPct > 0 ? '+' : ''}${p.projectedGainPct}%)`).join('  ')}`);
}

// 9. Target stack — puts run downward.
console.log('Testing Layer 3 — target stack (puts)...');
{
  const spot = 620.25;
  const emas = { ema15: 619.6, ema20: 619.1, ema50: 617.9, ema200: 613.4, converged200: true };
  const stack = buildTargetStack({ spot, isCall: false, emas, walls: { gamma: 616.0, put: 612.0 }, emHigh: 623.7, emLow: 616.8 });
  assert.ok(stack.every((t) => t.underlying < spot), 'all put targets below spot');
  for (let i = 1; i < stack.length; i++) assert.ok(stack[i].underlying <= stack[i - 1].underlying, 'descending (nearest-below first)');
  assert.strictEqual(stack[0].kind, 'EMA15', 'T1 = EMA15 (nearest below)');
  const proj = projectTargetPremiums(stack, { spot, strike: 620, dteDays: 0.5, iv: 0.15, isCall: false });
  assert.ok(proj[0].projectedPremium < proj[2].projectedPremium, 'put premium grows as price falls toward T3');
  console.log(`✔ put stack: ${stack.map((t) => `${t.label}=${t.underlying}`).join(' → ')}`);
}

// 10. EMA structure score — clean bull stack = 100; same stack scored as a put = 0.
console.log('Testing Layer 3 — EMA structure score...');
{
  const emas: EmaLadder = { ema15: 621.5, ema20: 621.0, ema50: 620.0, ema200: 615.0, converged200: true };
  assert.strictEqual(emaStructureScore(622, emas, true), 100, 'clean bull stack scores 100 for a call');
  assert.strictEqual(emaStructureScore(622, emas, false), 0, 'a bull stack is 0 for a put');
  console.log('✔ EMA structure: bull stack call=100, put=0');
}

// 11. Swing detection — strengthening call fires both short- and long-term swings.
console.log('Testing Layer 4 — swing detection...');
{
  const emas: EmaLadder = { ema15: 621.5, ema20: 621.0, ema50: 620.0, ema200: 615.0, converged200: true };
  const hist = ramp({ premium: [1.0, 3.0], delta: [0.45, 0.62], gamma: [0.018, 0.030], volume: [120, 900], oi: [1000, 1600], iv: [0.14, 0.20] });
  const sw = detectSwings({ isCall: true, emas, history: hist, dealerAligned: true });
  assert.ok(sw.shortTerm.detected && sw.shortTerm.direction === 'BULLISH', 'short-term bullish swing detected');
  assert.ok(sw.longTerm.detected && sw.longTerm.direction === 'BULLISH', 'long-term bullish swing detected');
  console.log(`✔ swing: ST ${sw.shortTerm.strength} ${sw.shortTerm.expectedDuration} [${sw.shortTerm.reasons.join(', ')}] | LT ${sw.longTerm.strength} ${sw.longTerm.expectedDuration}`);

  // No EMA alignment → no swing.
  const flatEmas: EmaLadder = { ema15: 619.0, ema20: 620.0, ema50: 621.0, ema200: 622.0, converged200: true };
  const sw2 = detectSwings({ isCall: true, emas: flatEmas, history: hist });
  assert.ok(!sw2.shortTerm.detected, 'no short-term swing without EMA15>EMA20');
  console.log(`✔ no-swing case: ST detected=${sw2.shortTerm.detected}`);
}

// 12. Master score — exact weighted blend + health + confidence behavior.
console.log('Testing Layer 7 — master score...');
{
  const all80 = computeMasterScore({ contractStrength: 80, flowStrength: 80, dealerPositioning: 80, emaStructure: 80, volumeProfile: 80, ivStructure: 80, swingEngine: 80, direction: 'BULLISH' });
  assert.strictEqual(all80.score, 80, 'uniform 80s blend to 80');
  assert.strictEqual(all80.tradeHealth, 'Strong', 'score 80 = Strong');
  assert.ok(all80.confidence >= 95, 'zero dispersion → high confidence');

  // 0.25*90 + 0.20*30 + 0.15*50 + 0.15*50 + 0.10*50 + 0.10*50 + 0.05*50 = 56
  const mixed = computeMasterScore({ contractStrength: 90, flowStrength: 30, dealerPositioning: 50, emaStructure: 50, volumeProfile: 50, ivStructure: 50, swingEngine: 50, direction: 'BULLISH' });
  assert.strictEqual(mixed.score, 56, `weighted blend should be 56, got ${mixed.score}`);
  assert.ok(mixed.confidence < all80.confidence, 'dispersed components → lower confidence');
  console.log(`✔ master: uniform80 → ${all80.score} ${all80.tradeHealth} conf=${all80.confidence}; mixed → ${mixed.score} ${mixed.tradeHealth} conf=${mixed.confidence}`);
}

// 13. Position health — strengthening = Strong/Hold; weakening = Reduce/Exit.
console.log('Testing Layer 5 — position health...');
{
  const strong = assessPositionHealth(ramp({ premium: [1.0, 3.0], delta: [0.45, 0.62], gamma: [0.018, 0.030], volume: [120, 900], oi: [1000, 1600], iv: [0.14, 0.20] }), true);
  assert.ok(strong.health === 'Strong' && strong.action === 'Hold', `strengthening should be Strong/Hold, got ${strong.health}/${strong.action}`);
  const weak = assessPositionHealth(ramp({ premium: [3.0, 1.1], delta: [0.62, 0.42], gamma: [0.030, 0.018], volume: [900, 200], oi: [1600, 1500], iv: [0.21, 0.13] }), true);
  assert.ok(weak.action === 'Exit' || weak.action === 'Reduce', `weakening should Reduce/Exit, got ${weak.action}`);
  console.log(`✔ health: strong=${strong.health}/${strong.action} (${strong.strength}); weak=${weak.health}/${weak.action} (${weak.strength})`);
}

// 14. Dynamic exits — each of the five triggers fires on its condition.
console.log('Testing Layer 6 — dynamic exits...');
{
  const flat = ramp({ premium: [2, 2], delta: [0.5, 0.5], gamma: [0.02, 0.02], volume: [400, 400], oi: [1200, 1200], iv: [0.16, 0.16] });

  const emaSig = evaluateDynamicExits({ isCall: true, history: flat, spot: 620, emaTargetHit: true });
  assert.ok(emaSig.some((s) => s.kind === 'EMA_TARGET' && s.action === 'SCALE'), 'EMA target → SCALE');

  const collapse = evaluateDynamicExits({ isCall: true, history: flat, spot: 620, strengthSeries: [91, 70, 54] });
  assert.ok(collapse.some((s) => s.kind === 'STRENGTH_COLLAPSE' && s.action === 'EXIT'), 'strength 91→54 → EXIT');

  const rev = evaluateDynamicExits({ isCall: true, history: flat, spot: 620, flow: { callSweeps: 3, prevCallSweeps: 12, putSweeps: 14, prevPutSweeps: 4 } });
  assert.ok(rev.some((s) => s.kind === 'FLOW_REVERSAL'), 'call sweeps fade + put sweeps rise → reversal');

  const wall = evaluateDynamicExits({ isCall: true, history: flat, spot: 627.5, gammaWall: 627 });
  assert.ok(wall.some((s) => s.kind === 'GAMMA_WALL' && s.action === 'TAKE_PROFIT'), 'price at call wall → take profit');

  const crush = evaluateDynamicExits({ isCall: true, spot: 620, history: ramp({ premium: [2.2, 2.1], delta: [0.5, 0.5], gamma: [0.02, 0.02], volume: [400, 400], oi: [1200, 1200], iv: [0.22, 0.15] }) });
  assert.ok(crush.some((s) => s.kind === 'IV_CRUSH' && s.action === 'EXIT'), 'IV down + premium flat → IV crush exit');

  const none = evaluateDynamicExits({ isCall: true, history: flat, spot: 620 });
  assert.strictEqual(none.length, 0, 'healthy/quiet position fires no exit signals');
  console.log(`✔ dynamic exits: EMA/collapse/reversal/wall/crush all fired; quiet=none`);
}

console.log('\n=============================================');
console.log('🎉 ALL SKY VISION ENGINE TESTS PASSED! 🎉');
console.log('=============================================');
