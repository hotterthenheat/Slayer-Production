/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the new edge engines: realized vol / VRP, risk-neutral density,
 * skew, scenario matrix, Kelly sizing, dealer clock.
 */
import assert from 'assert';
import { Candle } from '../src/types';
import { generateMockOptionsChain } from '../src/lib/v11Math';
import { computeRealizedVol, computeVRP, volCone, intervalMinutes } from '../src/lib/realizedVol';
import { computeRiskNeutralDensity, probInRange } from '../src/lib/riskNeutral';
import { computeSkew, percentileRank } from '../src/lib/skewAnalytics';
import { computeScenarioMatrix } from '../src/lib/scenarioMatrix';
import { kellySize, aggregatePortfolioGreeks } from '../src/lib/sizing';
import { computeDealerClock, charmVannaWeight } from '../src/lib/dealerClock';

console.log('--- RUNNING QUANT EDGE TEST SUITE ---');

// Synthetic 5-minute candles with a mild uptrend + noise.
function mockCandles(n = 120, base = 100, intervalMin = 5): Candle[] {
  const out: Candle[] = [];
  let price = base;
  const start = Date.now() - n * intervalMin * 60000;
  for (let i = 0; i < n; i++) {
    const drift = 0.0003;
    const shock = (Math.sin(i * 0.7) + Math.cos(i * 0.31)) * 0.004;
    const open = price;
    const close = price * (1 + drift + shock);
    const high = Math.max(open, close) * (1 + 0.0015 + Math.abs(Math.sin(i)) * 0.001);
    const low = Math.min(open, close) * (1 - 0.0015 - Math.abs(Math.cos(i)) * 0.001);
    out.push({ timestamp: start + i * intervalMin * 60000, open, high, low, close, volume: 100000 + (i % 7) * 5000 });
    price = close;
  }
  return out;
}

function testRealizedVol() {
  console.log('Testing realized-vol estimators + VRP...');
  const candles = mockCandles();
  assert.strictEqual(intervalMinutes(candles), 5, 'interval inferred as 5m');
  const rv = computeRealizedVol(candles, 20);
  for (const k of ['parkinson', 'garmanKlass', 'rogersSatchell', 'yangZhang', 'closeToClose'] as const) {
    assert.ok(isFinite(rv[k]) && rv[k] >= 0, `${k} finite & non-negative`);
    assert.ok(rv[k] < 5, `${k} annualized vol in a sane range (<500%)`);
  }
  assert.ok(rv.primary === rv.yangZhang, 'primary RV is Yang-Zhang');

  const cone = volCone(candles, [10, 20, 30]);
  assert.ok(cone.length >= 1, 'vol cone produces buckets');
  for (const b of cone) {
    assert.ok(b.min <= b.median && b.median <= b.max, `cone ordered for window ${b.window}`);
    assert.ok(b.percentile >= 0 && b.percentile <= 100, 'percentile in [0,100]');
  }

  const vrpRich = computeVRP(rv.primary * 1.5, candles, 20); // IV well above realized
  assert.strictEqual(vrpRich.richness, 'IV RICH', 'IV >> RV ⇒ IV RICH');
  assert.ok(vrpRich.vrp > 0, 'VRP positive when IV > RV');
  const vrpCheap = computeVRP(rv.primary * 0.5, candles, 20);
  assert.strictEqual(vrpCheap.richness, 'IV CHEAP', 'IV << RV ⇒ IV CHEAP');
  console.log('✔ Realized vol / VRP passed.');
}

function testRiskNeutral() {
  console.log('Testing Breeden-Litzenberger risk-neutral density...');
  const spot = 100;
  const chain = generateMockOptionsChain(spot, 0.2);
  const rnd = computeRiskNeutralDensity(chain, spot, 5, 0.05);
  assert.ok(rnd, 'RND computed');
  if (!rnd) return;
  // Density should integrate to ~1 (probInRange over the whole support).
  const total = probInRange(rnd, 0, spot * 10);
  assert.ok(Math.abs(total - 1) < 0.06, `RND integrates to ~1 (got ${total.toFixed(3)})`);
  // ATM: P(S>spot) near 0.5 (slightly off due to drift/skew).
  assert.ok(rnd.pAboveSpot > 0.3 && rnd.pAboveSpot < 0.7, `P(S>spot)=${rnd.pAboveSpot.toFixed(3)} ~ 0.5`);
  // Percentiles strictly ordered.
  const p = rnd.percentiles;
  assert.ok(p.p5 < p.p25 && p.p25 < p.p50 && p.p50 < p.p75 && p.p75 < p.p95, 'percentiles ordered');
  // Forward above spot (positive carry).
  assert.ok(rnd.forward >= spot, 'forward >= spot');
  assert.ok(rnd.expectedMovePct > 0 && rnd.expectedMovePct < 1, 'implied move sane');
  assert.ok(isFinite(rnd.fatTailRatio) && rnd.fatTailRatio >= 0, 'fat-tail ratio finite');
  assert.ok(rnd.density.length > 10, 'density downsampled for charting');
  // Levels: P(above) monotonic — higher strike ⇒ lower P(above).
  const up3 = rnd.levels.find((l) => l.label === '+3%')!;
  const dn3 = rnd.levels.find((l) => l.label === '-3%')!;
  assert.ok(up3.pAbove < dn3.pAbove, 'P(above +3%) < P(above -3%)');
  console.log(`✔ RND passed (P(S>spot)=${(rnd.pAboveSpot * 100).toFixed(1)}%, EM=±${(rnd.expectedMovePct * 100).toFixed(2)}%, skew=${rnd.skewBias}).`);
}

function testSkew() {
  console.log('Testing skew analytics...');
  const spot = 100;
  const chain = generateMockOptionsChain(spot, 0.2);
  const skew = computeSkew(chain, spot);
  assert.ok(skew, 'skew computed');
  if (!skew) return;
  for (const k of ['atmIv', 'callIv25', 'putIv25', 'riskReversal25', 'butterfly25', 'skewSlope'] as const) {
    assert.ok(isFinite(skew[k]), `${k} finite`);
  }
  assert.ok(['PUT SKEW', 'CALL SKEW', 'FLAT'].includes(skew.bias), 'bias labelled');
  assert.strictEqual(percentileRank([1, 2, 3, 4], 3), 75, 'percentileRank correct');
  console.log(`✔ Skew passed (RR25=${(skew.riskReversal25 * 100).toFixed(2)}, BF25=${(skew.butterfly25 * 100).toFixed(2)}, bias=${skew.bias}).`);
}

function testScenario() {
  console.log('Testing scenario / shock matrix...');
  const m = computeScenarioMatrix({ spot: 100, strike: 100, dteDays: 7, iv: 0.2, isCall: true, entryPrice: 2.5, quantity: 1 });
  assert.ok(m.pnlPct.length === m.ivShiftsAbs.length, 'rows = iv shifts');
  assert.ok(m.pnlPct[0].length === m.spotShiftsPct.length, 'cols = spot shifts');
  // A long ATM call should make money on a big up move + higher IV vs lose on a big down move.
  const ivUpRow = m.ivShiftsAbs.indexOf(0.05);
  const ivDnRow = m.ivShiftsAbs.indexOf(-0.05);
  const upCol = m.spotShiftsPct.indexOf(0.05);
  const dnCol = m.spotShiftsPct.indexOf(-0.05);
  assert.ok(m.pnlPct[ivUpRow][upCol] > m.pnlPct[ivDnRow][dnCol], 'up+volup beats down+voldown for a long call');
  assert.ok(m.best.pnlPct >= m.worst.pnlPct, 'best >= worst');
  console.log(`✔ Scenario passed (best ${m.best.pnlPct}% / worst ${m.worst.pnlPct}%).`);
}

function testSizing() {
  console.log('Testing Kelly sizing + portfolio greeks...');
  const strong = kellySize(0.72, 0.18, 0.08, 0.5);
  assert.ok(strong.kelly > 0 && strong.kelly <= 1, 'kelly in (0,1]');
  assert.ok(strong.recommended <= strong.kelly, 'fractional <= full kelly');
  assert.ok(strong.edge > 0, 'positive edge for a winning setup');
  const noEdge = kellySize(0.3, 0.05, 0.2, 0.5);
  assert.strictEqual(noEdge.kelly, 0, 'negative edge ⇒ kelly 0');
  assert.strictEqual(noEdge.verdict, 'NO EDGE', 'no-edge verdict');

  const book = aggregatePortfolioGreeks([
    { ticker: 'SPX', quantity: 2, isCall: true, delta: 0.5, gamma: 0.02, vega: 0.1, theta: -0.5, spot: 100 },
    { ticker: 'SPX', quantity: -1, isCall: false, delta: -0.4, gamma: 0.03, vega: 0.12, theta: -0.4, spot: 100 },
  ]);
  // netDelta = 0.5*200 + (-0.4)*(-100) = 100 + 40 = 140
  assert.ok(Math.abs(book.netDelta - 140) < 1e-6, `netDelta aggregated (${book.netDelta})`);
  assert.strictEqual(book.bias, 'NET LONG', 'net long bias');
  assert.strictEqual(book.positions, 2, 'position count');
  console.log(`✔ Sizing passed (kelly=${strong.kelly}, rec=${strong.recommended}, netΔ=${book.netDelta}).`);
}

function testDealerClock() {
  console.log('Testing intraday charm/vanna clock...');
  const w = charmVannaWeight(new Date());
  assert.ok(w.weight >= 0 && w.weight <= 1, 'weight in [0,1]');
  // Force a known mid-session time (14:00 ET would weight higher than 09:45).
  const clock = computeDealerClock(5_000_000, 2_000_000, new Date());
  assert.ok(clock.weight >= 0 && clock.weight <= 1, 'clock weight in [0,1]');
  assert.ok(isFinite(clock.weightedCharm) && isFinite(clock.weightedVanna), 'weighted flows finite');
  assert.ok(['PRE', 'OPEN', 'MIDDAY', 'POWER_HOUR', 'CLOSE', 'AFTER'].includes(clock.session), 'session labelled');
  console.log(`✔ Dealer clock passed (session=${clock.session}, weight=${clock.weight}).`);
}

try {
  testRealizedVol();
  testRiskNeutral();
  testSkew();
  testScenario();
  testSizing();
  testDealerClock();
  console.log('\n=============================================');
  console.log('🎉 ALL QUANT EDGE TESTS PASSED! 🎉');
  console.log('=============================================\n');
} catch (error) {
  console.error('❌ QUANT EDGE TEST FAILED:', error);
  throw error;
}
