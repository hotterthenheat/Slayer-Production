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
import { hurstExponent, ornsteinUhlenbeck, classifyRegime, volCompression, volExpansion, forwardVolMatrix, ema } from '../src/lib/regimeEngine';
import { computeVPIN, computeKylesLambda } from '../src/lib/microstructure';
import { pcaResidualZScores } from '../src/lib/crossAsset';
import { hawkesIntensity, netDeltaAggression } from '../src/lib/pointProcess';
import { transferEntropy, marketLeader, fisherDivergence } from '../src/lib/infoTheory';
import { computeStrikeGravity } from '../src/lib/strikeGravity';
import { computeDealerDynamics, type DealerSnapshot } from '../src/lib/dealerDynamics';
import { probExpireITM, probabilityOfTouch, expectedMoveBands, compute0DTE, hoursToYearFraction } from '../src/lib/zeroDte';
import { buildTradePlan } from '../src/lib/tradePlan';
import { computeTechnicalRead, type TechnicalRead } from '../src/lib/technicalEngine';
import { GexStrikeDetail } from '../src/types';

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

// Strong trending vs oscillating series for regime tests.
function trendCandles(n = 160, base = 100): Candle[] {
  const out: Candle[] = []; let p = base; const start = Date.now() - n * 300000;
  for (let i = 0; i < n; i++) { const o = p; const c = p * (1 + 0.004 + (Math.random() - 0.5) * 0.001); out.push({ timestamp: start + i * 300000, open: o, high: Math.max(o, c) * 1.001, low: Math.min(o, c) * 0.999, close: c, volume: 100000 + (i % 5) * 8000 }); p = c; }
  return out;
}
function meanRevCandles(n = 160, base = 100): Candle[] {
  const out: Candle[] = []; const start = Date.now() - n * 300000;
  for (let i = 0; i < n; i++) { const c = base * (1 + Math.sin(i * 0.8) * 0.01); const o = base * (1 + Math.sin((i - 1) * 0.8) * 0.01); out.push({ timestamp: start + i * 300000, open: o, high: Math.max(o, c) * 1.001, low: Math.min(o, c) * 0.999, close: c, volume: 80000 + (i % 3) * 12000 }); }
  return out;
}

function testRegime() {
  console.log('Testing statistical regime engine (Hurst / OU / HMM / vol regimes)...');
  const trend = trendCandles();
  const revert = meanRevCandles();
  const hT = hurstExponent(trend.map((c) => c.close));
  const hR = hurstExponent(revert.map((c) => c.close));
  assert.ok(hT > 0 && hT < 1 && hR > 0 && hR < 1, 'Hurst in (0,1)');
  assert.ok(hT > hR, `trending Hurst (${hT.toFixed(2)}) > mean-reverting (${hR.toFixed(2)})`);

  const ou = ornsteinUhlenbeck(revert.map((c) => c.close));
  assert.ok(ou.meanReverting, 'oscillating series is mean-reverting');
  assert.ok(ou.halfLifeBars > 0 && isFinite(ou.halfLifeBars), 'finite positive half-life');
  assert.strictEqual(ema([1, 1, 1, 1], 3)[3], 1, 'EMA of constant is constant');

  const reg = classifyRegime(trend);
  const sum = reg.posteriors.TREND_EXPANSION + reg.posteriors.MEAN_REVERSION + reg.posteriors.TAIL_RISK;
  assert.ok(Math.abs(sum - 1) < 1e-6, 'regime posteriors sum to 1');
  assert.ok(['TREND_EXPANSION', 'MEAN_REVERSION', 'TAIL_RISK'].includes(reg.state), 'regime state labelled');
  assert.ok(reg.transitionProb >= 0 && reg.transitionProb <= 100, 'transition prob in [0,100]');

  for (const vr of [volCompression(revert), volExpansion(trend), forwardVolMatrix(trend)]) {
    assert.ok(typeof vr.active === 'boolean', 'vol regime active flag is boolean');
    assert.ok(vr.score >= 0 && vr.score <= 1, 'vol regime score in [0,1]');
  }
  console.log(`✔ Regime engine passed (H_trend=${hT.toFixed(2)}, halfLife=${ou.halfLifeBars}, state=${reg.state}@${reg.transitionProb}%).`);
}

function testMicrostructure() {
  console.log('Testing microstructure (VPIN / Kyle) + cross-asset PCA...');
  const c = trendCandles();
  const vpin = computeVPIN(c);
  assert.ok(vpin.vpin >= 0 && vpin.vpin <= 1, 'VPIN in [0,1]');
  assert.ok(typeof vpin.toxic === 'boolean', 'toxic flag boolean');
  const kyle = computeKylesLambda(c);
  assert.ok(isFinite(kyle.impactPct), 'Kyle impact finite');
  assert.ok(typeof kyle.slippageRisk === 'boolean', 'slippage flag boolean');

  const series = { SPX: trendCandles(120, 5000), QQQ: meanRevCandles(120, 450), NDX: trendCandles(120, 18000) };
  const pca = pcaResidualZScores(series);
  assert.ok(Object.keys(pca).length === 3, 'PCA returns all assets');
  for (const t of Object.keys(pca)) {
    assert.ok(isFinite(pca[t].z) && isFinite(pca[t].beta), `${t} PCA residual finite`);
    assert.ok(['RICH', 'CHEAP', 'FAIR'].includes(pca[t].direction), 'PCA direction labelled');
  }
  console.log(`✔ Microstructure + PCA passed (VPIN=${vpin.vpin}, Kyle impact=${kyle.impactPct}%, PCA assets=${Object.keys(pca).length}).`);
}

function testPointProcessAndInfo() {
  console.log('Testing Hawkes / Net-Delta / Transfer Entropy / Fisher...');
  // Hawkes: a burst of volume spikes near the end should raise cascade probability.
  const burst = trendCandles(100);
  for (let i = 90; i < 100; i++) burst[i].volume = 800000;
  const hk = hawkesIntensity(burst);
  assert.ok(hk.cascadeProbability >= 0 && hk.cascadeProbability <= 1, 'Hawkes cascade prob in [0,1]');
  assert.ok(hk.intensity > 0, 'Hawkes intensity positive');

  // Net Delta from a synthetic sweep tape.
  const flow = [
    { asset: 'SPX', type: 'SWEEP', contract: '2,000 SPX 7700C', side: 'C' },
    { asset: 'SPX', type: 'SWEEP', contract: '500 SPX 7500P', side: 'P' },
    { asset: 'SPX', type: 'BLOCK', contract: '9,000 SPX 7600C', side: 'C' }, // not a sweep → ignored
    { asset: 'QQQ', type: 'SWEEP', contract: '1,000 QQQ 450C', side: 'C' }, // other asset → ignored
  ];
  const nd = netDeltaAggression(flow, 'SPX');
  assert.strictEqual(nd.sweepCount, 2, 'only SPX sweeps counted');
  // 2000*0.45 - 500*0.45 = 675
  assert.ok(Math.abs(nd.netDelta - 675) < 1, `net delta delta-weighted (${nd.netDelta})`);
  assert.strictEqual(nd.direction, 'BULLISH', 'net call sweeps ⇒ bullish');

  // Transfer entropy: if Y is a lagged copy of X, TE(X→Y) should exceed TE(Y→X).
  const x = trendCandles(160).map((c) => c.close);
  const xr: number[] = []; for (let i = 1; i < x.length; i++) xr.push(Math.log(x[i] / x[i - 1]));
  const yr = [0, ...xr.slice(0, -1)]; // y is x lagged by 1
  const teXY = transferEntropy(xr, yr);
  const teYX = transferEntropy(yr, xr);
  assert.ok(teXY >= 0 && teYX >= 0, 'transfer entropy non-negative');
  assert.ok(teXY >= teYX, `lagged copy: TE(X→Y) ${teXY} >= TE(Y→X) ${teYX}`);

  const lead = marketLeader({ A: trendCandles(120, 100), B: meanRevCandles(120, 100), C: trendCandles(120, 200) });
  assert.ok(lead && typeof lead.leader === 'string' && lead.te >= 0, 'market leader resolved');

  // Fisher: a distribution shift (vol regime change) raises divergence.
  const shift = meanRevCandles(80, 100);
  for (let i = 40; i < 80; i++) shift[i].close = 100 * (1 + Math.sin(i * 0.8) * 0.05); // 5× larger swings
  const fd = fisherDivergence(shift, 20);
  assert.ok(fd.divergence >= 0 && isFinite(fd.divergence), 'Fisher divergence finite & non-negative');
  console.log(`✔ Point-process + info-theory passed (Hawkes=${hk.cascadeProbability}, netΔ=${nd.netDelta}, TE=${teXY}, leader=${lead?.leader}, Fisher=${fd.divergence}).`);
}

function testStrikeGravity() {
  console.log('Testing Strike Gravity Engine (ranking / zones / walls)...');
  const spot = 6205;
  // A clustered dealer wall 6200-6220 (support side, below/at spot) plus a lone
  // resistance strike up at 6300, and some far low-gravity strikes.
  const strikes: GexStrikeDetail[] = [
    { strike: 6100, callGex: 0, putGex: 0, netGex: 1.0e8, callOi: 4000, putOi: 6000, callVolume: 800, putVolume: 900 },
    { strike: 6200, callGex: 0, putGex: 0, netGex: 8.0e8, callOi: 30000, putOi: 22000, callVolume: 9000, putVolume: 8000 },
    { strike: 6210, callGex: 0, putGex: 0, netGex: 7.5e8, callOi: 28000, putOi: 20000, callVolume: 8500, putVolume: 7000 },
    { strike: 6220, callGex: 0, putGex: 0, netGex: 7.0e8, callOi: 26000, putOi: 18000, callVolume: 8000, putVolume: 6500 },
    { strike: 6300, callGex: 0, putGex: 0, netGex: -4.0e8, callOi: 12000, putOi: 9000, callVolume: 3000, putVolume: 2500 },
    { strike: 6500, callGex: 0, putGex: 0, netGex: 5.0e7, callOi: 2000, putOi: 1500, callVolume: 200, putVolume: 150 },
  ];
  const g = computeStrikeGravity(strikes, spot, 10);

  // Composite scores must be a valid [0,1] blend and the weights must renormalize to 1.
  for (const s of g.ranked) {
    assert.ok(s.gravityScore >= 0 && s.gravityScore <= 1, `gravity in [0,1] for ${s.strike}`);
    assert.ok(isFinite(s.gexWeight) && isFinite(s.proximityWeight), 'weights finite');
  }
  const wSum = g.weightsUsed.gex + g.weightsUsed.oi + g.weightsUsed.volume + g.weightsUsed.proximity;
  assert.ok(Math.abs(wSum - 1) < 1e-9, 'effective weights renormalize to 1');

  // Ranked must be sorted by gravity descending.
  for (let i = 1; i < g.ranked.length; i++) {
    assert.ok(g.ranked[i - 1].gravityScore >= g.ranked[i].gravityScore, 'ranked sorted desc');
  }

  // The 6200-6220 cluster (huge GEX/OI/volume + near spot) must be the primary magnet.
  assert.ok(g.primary && g.primary.strike >= 6200 && g.primary.strike <= 6220, `primary in dealer wall, got ${g.primary?.strike}`);

  // 6200-6220 must collapse into ONE support/straddle zone (not three separate levels).
  const wallZone = g.zones.find((z) => z.lo <= 6200 && z.hi >= 6220);
  assert.ok(!!wallZone, 'adjacent 6200/6210/6220 strikes cluster into one zone');
  assert.ok(wallZone!.strikes.length === 3, 'zone holds all three wall strikes');

  // Neighbors resolve on the correct side of spot.
  assert.ok(!g.upperNeighbor || g.upperNeighbor.strike > spot, 'upper neighbor above spot');
  assert.ok(!g.lowerNeighbor || g.lowerNeighbor.strike < spot, 'lower neighbor below spot');
  assert.ok(g.clusterScore >= 0 && g.clusterScore <= 1, 'cluster score in [0,1]');

  // Empty input must not throw.
  const e = computeStrikeGravity([], spot, 10);
  assert.ok(e.ranked.length === 0 && e.primary === null, 'empty chain handled gracefully');

  console.log(`✔ Strike Gravity passed (primary=${g.primary?.strike}, zone=${wallZone!.lo}-${wallZone!.hi}, cluster=${g.clusterScore.toFixed(2)}, wSum=${wSum.toFixed(2)}).`);
}

function testDealerDynamics() {
  console.log('Testing Dealer Dynamics Engine (vanna/charm/migration/gamma/vacuums/walls)...');
  const history: DealerSnapshot[] = [];

  // Tick 1: positioning centered at 6000.
  const chain1 = generateMockOptionsChain(6000, 0.18);
  const inv1 = { netGex: 1.0e9, netVanna: 5.0e7, netCharm: -2.0e5 };
  computeDealerDynamics(chain1, 6000, inv1, history); // tick 1 seeds history
  assert.strictEqual(history.length, 1, 'first snapshot appended');

  // Tick 2: dealer positioning has migrated UP to 6100 (bullish), GEX grew, IV-vanna rose.
  const chain2 = generateMockOptionsChain(6100, 0.18);
  const inv2 = { netGex: 1.4e9, netVanna: 8.0e7, netCharm: -2.0e5 };
  const d2 = computeDealerDynamics(chain2, 6100, inv2, history);
  assert.strictEqual(history.length, 2, 'second snapshot appended');

  // Vanna
  assert.ok(isFinite(d2.vanna.net) && isFinite(d2.vanna.velocity), 'vanna finite');
  assert.ok(d2.vanna.velocity > 0 && d2.vanna.trend === 'RISING', 'vanna rose tick→tick');
  assert.ok(d2.vanna.hedgeFlow === 'SUPPORTIVE', 'positive net vanna ⇒ supportive hedge flow');

  // Charm
  assert.ok(isFinite(d2.charm.netPerDay) && d2.charm.intensity >= 0 && d2.charm.intensity <= 1, 'charm intensity in [0,1]');
  assert.ok(d2.charm.bias === 'BEARISH', 'negative charm ⇒ bearish decay flow');

  // Migration — center of mass moved up ⇒ bullish.
  assert.ok(d2.migration.comCurrent > d2.migration.comPrevious, 'CoM migrated up');
  assert.ok(d2.migration.direction === 'BULLISH', 'upward strike migration ⇒ bullish');
  assert.ok(d2.migration.score > 0 && d2.migration.score <= 1, 'migration score in (0,1]');

  // Gamma velocity/acceleration
  assert.ok(d2.gamma.velocity > 0 && d2.gamma.state === 'ADDING_HEDGES', 'rising netGex ⇒ adding hedges');
  assert.ok(isFinite(d2.gamma.acceleration), 'gamma acceleration finite');

  // Wall strength 0-100, on the correct sides of spot.
  if (d2.walls.support) {
    assert.ok(d2.walls.support.score >= 0 && d2.walls.support.score <= 100, 'support wall strength in [0,100]');
    assert.ok(d2.walls.support.strike < 6100, 'support wall below spot');
  }
  if (d2.walls.resistance) {
    assert.ok(d2.walls.resistance.score >= 0 && d2.walls.resistance.score <= 100, 'resistance wall strength in [0,100]');
    assert.ok(d2.walls.resistance.strike > 6100, 'resistance wall above spot');
  }

  // Liquidity vacuums — scores valid; lo<hi.
  for (const z of d2.vacuums.zones) {
    assert.ok(z.score >= 0 && z.score <= 1, 'vacuum score in [0,1]');
    assert.ok(z.hi > z.lo, 'vacuum zone has positive width');
  }

  // Empty chain must not throw.
  const e = computeDealerDynamics([], 6000, { netGex: 0, netVanna: 0, netCharm: 0 }, []);
  assert.ok(e.walls.support === null && e.vacuums.zones.length === 0, 'empty chain handled gracefully');

  console.log(`✔ Dealer Dynamics passed (vanna=${d2.vanna.trend}/${d2.vanna.hedgeFlow}, migration=${d2.migration.direction}, gamma=${d2.gamma.state}, supportWall=${d2.walls.support?.score}, vacuums=${d2.vacuums.zones.length}).`);
}

function testZeroDte() {
  console.log('Testing 0DTE Probability Engine (ITM / touch / EM bands / settlement)...');
  const spot = 6000, iv = 0.20, T = hoursToYearFraction(6.5); // a full session

  // P(expire ITM): ATM ≈ 0.5; deep ITM call ≈ 1; deep OTM ≈ 0; call+put at same K = 1.
  const atmCall = probExpireITM(spot, spot, T, iv, true);
  assert.ok(Math.abs(atmCall - 0.5) < 0.05, `ATM call P(ITM) ≈ 0.5, got ${atmCall.toFixed(3)}`);
  assert.ok(probExpireITM(spot, spot * 0.8, T, iv, true) > 0.99, 'deep ITM call ≈ 1');
  assert.ok(probExpireITM(spot, spot * 1.2, T, iv, true) < 0.01, 'deep OTM call ≈ 0');
  const K = 6050;
  const sumITM = probExpireITM(spot, K, T, iv, true) + probExpireITM(spot, K, T, iv, false);
  assert.ok(Math.abs(sumITM - 1) < 1e-9, `N(d2)+N(-d2) = 1 (got ${sumITM})`);

  // Probability of touch: barrier=spot ⇒ 1; touch ≥ finishing beyond the barrier.
  assert.ok(Math.abs(probabilityOfTouch(spot, spot, T, iv) - 1) < 1e-9, 'POT at spot = 1');
  const B = 6080;
  const pot = probabilityOfTouch(spot, B, T, iv);
  const pBeyond = probExpireITM(spot, B, T, iv, true);
  assert.ok(pot >= pBeyond - 1e-9, `POT(${B}) ≥ P(expire>${B}) [${pot.toFixed(3)} ≥ ${pBeyond.toFixed(3)}]`);
  assert.ok(pot >= 0 && pot <= 1, 'POT in [0,1]');
  // Closer barrier is easier to touch.
  assert.ok(probabilityOfTouch(spot, 6020, T, iv) > probabilityOfTouch(spot, 6120, T, iv), 'closer barrier easier to touch');

  // Expected-move bands: EOD ≥ 1H; movePct = iv·√T.
  const bands = expectedMoveBands(spot, iv, 6.5);
  const eod = bands.find((b) => b.horizon === 'EOD')!;
  const oneH = bands.find((b) => b.horizon === '1H')!;
  assert.ok(eod.movePts >= oneH.movePts, 'EOD EM ≥ 1H EM');
  assert.ok(Math.abs(eod.movePct - iv * Math.sqrt(hoursToYearFraction(6.5))) < 1e-9, 'EM% = iv·√T');
  assert.ok(eod.upper1 > spot && eod.lower1 < spot && eod.upper2 > eod.upper1, 'EM bands ordered');

  // Master bundle: settlement risk is gamma-regime-adjusted around the 2·N(−1)≈0.317
  // baseline — net-long gamma tightens the close (below baseline), net-short widens it
  // (above baseline). Both must stay finite and in [0,1].
  const z = compute0DTE({ spot, atmIv: iv, hoursToClose: 6.5, netGex: 1e9, magnet: 6000,
    strikes: [{ strike: 5950, netGex: 2e8 }, { strike: 6000, netGex: 9e8 }, { strike: 6050, netGex: 3e8 }] });
  assert.ok(z.settlementRiskPct >= 0 && z.settlementRiskPct < 0.3173, `long-gamma settlement risk below baseline, got ${z.settlementRiskPct.toFixed(4)}`);
  const zShort = compute0DTE({ spot, atmIv: iv, hoursToClose: 6.5, netGex: -1e9, magnet: 6000,
    strikes: [{ strike: 5950, netGex: -2e8 }, { strike: 6000, netGex: -9e8 }, { strike: 6050, netGex: -3e8 }] });
  assert.ok(zShort.settlementRiskPct > 0.3173 && zShort.settlementRiskPct <= 1, `short-gamma settlement risk above baseline, got ${zShort.settlementRiskPct.toFixed(4)}`);
  assert.ok(z.pin.pinProbability >= 0 && z.pin.pinProbability <= 1, 'pin prob in [0,1]');
  assert.ok(z.eodMagnet > 5950 && z.eodMagnet < 6050, 'EOD magnet (positive-GEX CoM) near 6000');
  console.log(`✔ 0DTE passed (ATM ITM=${(atmCall * 100).toFixed(0)}%, POT(6080)=${(pot * 100).toFixed(0)}%, EOD EM=±${eod.movePts.toFixed(0)}, pin=${(z.pin.pinProbability * 100).toFixed(0)}%).`);
}

function makeTech(direction: number, score = 75): TechnicalRead {
  return {
    direction, score,
    emaAlignment: direction > 0 ? 'BULLISH' : direction < 0 ? 'BEARISH' : 'MIXED',
    emaTargets: direction >= 0
      ? { ema8: 6010, ema21: 6030, ema50: 6055, ema200: 6090 }
      : { ema8: 5990, ema21: 5970, ema50: 5945, ema200: 5910 },
    rsi: { m1: direction > 0 ? 58 : 42, m5: direction > 0 ? 56 : 44, m15: direction > 0 ? 61 : 39, allRising: direction > 0, cascadeDir: direction },
    vwap: 6000, vwapPosition: direction > 0 ? 'ABOVE' : direction < 0 ? 'BELOW' : 'AT',
    squeeze: { squeezeOn: false, firing: direction !== 0, momentum: direction, momentumRising: true },
    structureTrend: direction > 0 ? 'bullish' : direction < 0 ? 'bearish' : 'neutral',
  };
}

function testTradePlan() {
  console.log('Testing Sky\'s Vision composite Trade Plan (40/30/20/10 + labeled targets)...');
  const base = {
    ticker: 'SPX', spot: 6000, step: 25, emPts: 48, hoursToClose: 4, regimeState: 'TREND_EXPANSION',
    dealer: { netGex: 1.2e9, gammaFlip: 5950, callWall: 6075, putWall: 5920 },
    contractScore: 80, winRate: 71, loadedStrike: 6050, liquidityHigh: 6040, liquidityLow: 5960,
  };

  // Bullish technical + above flip ⇒ BULLISH call plan with labeled, ordered targets.
  const bull = buildTradePlan({ ...base, technical: makeTech(0.6) });
  assert.ok(bull.direction === 'BULLISH' && bull.isCall, 'bullish technical ⇒ BULLISH calls');
  assert.ok(bull.confidence >= 5 && bull.confidence <= 97, 'confidence in [5,97]');
  // Composite weighting is exact: 0.4·tech + 0.3·dealer + 0.2·contract + 0.1·learn.
  const e = bull.engineScores;
  assert.strictEqual(e.composite, Math.round(0.4 * e.technical + 0.3 * e.dealer + 0.2 * e.contract + 0.1 * e.learning), 'composite = 40/30/20/10 blend');
  assert.strictEqual(bull.confidence, e.composite, 'confidence == composite');
  // Labeled targets: all reasons valid, strictly above spot, ascending for calls.
  assert.ok(bull.targets.length >= 2, 'multiple labeled targets');
  for (const t of bull.targets) {
    assert.ok(t.price > 6000, `call target ${t.reason} above spot`);
    assert.ok(['EMA Projection', 'Liquidity Sweep', 'Loaded Strike', 'GEX Wall'].includes(t.reason), 'valid target reason');
  }
  for (let i = 1; i < bull.targets.length; i++) assert.ok(bull.targets[i].price > bull.targets[i - 1].price, 'call targets ascending');
  assert.ok(bull.targets.some((t) => t.reason === 'GEX Wall' && Math.abs(t.price - 6075) < 1e-9), 'call wall present as a target');
  assert.ok(bull.targets.some((t) => t.reason === 'Loaded Strike'), 'loaded strike present as a target');
  assert.ok(/C$/.test(bull.contract) && bull.targetStrike % base.step === 0, 'call contract on a valid strike');

  // Bearish technical + below flip ⇒ BEARISH put plan, targets below spot descending.
  const bear = buildTradePlan({ ...base, spot: 5900, technical: makeTech(-0.6),
    dealer: { netGex: -8e8, gammaFlip: 5950, callWall: 6075, putWall: 5840 }, liquidityLow: 5860, loadedStrike: 5870 });
  assert.ok(bear.direction === 'BEARISH' && !bear.isCall, 'bearish technical ⇒ BEARISH puts');
  for (const t of bear.targets) assert.ok(t.price < 5900, `put target ${t.reason} below spot`);
  for (let i = 1; i < bear.targets.length; i++) assert.ok(bear.targets[i].price < bear.targets[i - 1].price, 'put targets descending');
  assert.ok(/P$/.test(bear.contract), 'put contract');
  assert.ok(bear.dealerFlow === 'Negative Gamma', 'short-gamma flagged');

  // Flat technical + at flip ⇒ NEUTRAL.
  const neutral = buildTradePlan({ ...base, technical: makeTech(0.0), dealer: { ...base.dealer, gammaFlip: 6000 } });
  assert.ok(neutral.direction === 'NEUTRAL', 'flat technical + at flip ⇒ NEUTRAL');

  console.log(`✔ Trade Plan passed (bull ${bull.contract} conf ${bull.confidence}% [T${e.technical}/D${e.dealer}/C${e.contract}/L${e.learning}] targets: ${bull.targets.map((t) => `${t.price}=${t.reason}`).join(', ')}).`);
}

function testTechnicalEngine() {
  console.log('Testing Technical Engine (EMA alignment / multi-TF RSI / TTM squeeze)...');
  // Build a clean uptrend across timeframes so EMAs stack bullishly and RSI rises.
  const mk = (n: number, drift: number, base = 6000) => {
    const out: any[] = []; let px = base;
    for (let i = 0; i < n; i++) { const o = px; px = px * (1 + drift); out.push({ time: i, open: o, high: Math.max(o, px) * 1.001, low: Math.min(o, px) * 0.999, close: px, volume: 1000 }); }
    return out;
  };
  const up5 = mk(220, 0.0008), up1 = mk(220, 0.0006), up15 = mk(220, 0.001);
  const t = computeTechnicalRead({ candles1m: up1, candles5m: up5, candles15m: up15, spot: up5[up5.length - 1].close, systemScoreTotal: 70, structureTrend: 'bullish' });
  assert.ok(t.direction > 0.3, `uptrend ⇒ positive technical direction (${t.direction})`);
  assert.ok(t.emaAlignment === 'BULLISH', 'stacked EMAs ⇒ BULLISH alignment');
  assert.ok(t.emaTargets.ema8 > t.emaTargets.ema200, 'fast EMA above slow EMA in an uptrend');
  assert.ok(t.rsi.m5 > 50, 'RSI above 50 in an uptrend');
  assert.ok(t.score >= 0 && t.score <= 100, 'technical score in [0,100]');

  const down5 = mk(220, -0.0008), down1 = mk(220, -0.0006), down15 = mk(220, -0.001);
  const td = computeTechnicalRead({ candles1m: down1, candles5m: down5, candles15m: down15, spot: down5[down5.length - 1].close, systemScoreTotal: 70, structureTrend: 'bearish' });
  assert.ok(td.direction < -0.3 && td.emaAlignment === 'BEARISH', 'downtrend ⇒ BEARISH');
  console.log(`✔ Technical Engine passed (up dir=${t.direction} EMA=${t.emaAlignment} RSI5=${t.rsi.m5}; down dir=${td.direction}).`);
}

try {
  testRealizedVol();
  testRiskNeutral();
  testSkew();
  testScenario();
  testSizing();
  testDealerClock();
  testRegime();
  testMicrostructure();
  testPointProcessAndInfo();
  testStrikeGravity();
  testDealerDynamics();
  testZeroDte();
  testTechnicalEngine();
  testTradePlan();
  console.log('\n=============================================');
  console.log('🎉 ALL QUANT EDGE TESTS PASSED! 🎉');
  console.log('=============================================\n');
} catch (error) {
  console.error('❌ QUANT EDGE TEST FAILED:', error);
  throw error;
}
