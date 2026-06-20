/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the client-side institutional options toolkit (src/lib/quantSuite.ts)
 * that powers the Quant Lab: Black-Scholes pricing, greeks, Breeden-Litzenberger
 * RND, realized-vol suite, skew analytics, multi-leg payoff and portfolio greeks.
 *
 * These guard the math the UI computes on the (real or mock) option chain so a
 * regression in any estimator fails the build instead of shipping silently.
 */
import assert from 'assert';
import { generateMockOptionsChain, ChainContract } from '../src/lib/v11Math';
import {
  bsmPrice,
  calculateOptionGreeks,
  solveImpliedRND,
  calculateRealizedVolSuite,
  computeSkewAnalytics,
  buildStrategySuite,
  generatePayoffCoordinates,
  aggregatePortfolioGreeks,
  normalCdf,
  type Candle,
  type OptionLeg,
  type PortfolioPosition,
} from '../src/lib/quantSuite';

console.log('--- RUNNING QUANT SUITE (CLIENT) TEST SUITE ---');

const approx = (a: number, b: number, tol: number, msg: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const finite = (x: number, msg: string) => assert.ok(Number.isFinite(x), `${msg} must be finite, got ${x}`);

const SPOT = 5000;
const IV = 0.18;
const T = 30 / 365;

// ---------------------------------------------------------------------------
// 1. Black-Scholes price: put-call parity + monotonicity + intrinsic bounds.
// ---------------------------------------------------------------------------
console.log('Testing Black-Scholes pricing (put-call parity)...');
{
  const r = 0.05;
  const K = 5000;
  const call = bsmPrice(SPOT, K, T, IV, 'call');
  const put = bsmPrice(SPOT, K, T, IV, 'put');
  finite(call, 'call price');
  finite(put, 'put price');
  assert.ok(call > 0 && put > 0, 'ATM call/put must be positive');

  // Put-call parity: C - P = S - K*e^{-rT}. quantSuite's bsmPrice uses r=0.05.
  const parity = SPOT - K * Math.exp(-r * T);
  approx(call - put, parity, 1.0, 'put-call parity (C - P = S - Ke^-rT)');

  // Deep ITM call ~ intrinsic; deep OTM call ~ 0.
  const deepItm = bsmPrice(SPOT, 3000, T, IV, 'call');
  assert.ok(deepItm >= SPOT - 3000 - 1, 'deep ITM call >= intrinsic');
  const deepOtm = bsmPrice(SPOT, 8000, T, IV, 'call');
  assert.ok(deepOtm < 5, 'deep OTM call ~ 0');

  // Monotonic in strike: call price decreases as strike rises.
  assert.ok(
    bsmPrice(SPOT, 4800, T, IV, 'call') > bsmPrice(SPOT, 5200, T, IV, 'call'),
    'call price must decrease with strike',
  );
  console.log('✔ Black-Scholes pricing passed (parity, intrinsic bounds, monotonicity).');
}

// ---------------------------------------------------------------------------
// 2. Greeks: signs, ranges and ATM delta ~ 0.5.
// ---------------------------------------------------------------------------
console.log('Testing option greeks (signs / ranges)...');
{
  const c = calculateOptionGreeks(SPOT, SPOT, T, IV, 'call');
  const p = calculateOptionGreeks(SPOT, SPOT, T, IV, 'put');
  for (const g of [c, p]) {
    finite(g.delta, 'delta'); finite(g.gamma, 'gamma'); finite(g.vega, 'vega'); finite(g.theta, 'theta');
  }
  assert.ok(c.delta > 0 && c.delta < 1, 'call delta in (0,1)');
  assert.ok(p.delta < 0 && p.delta > -1, 'put delta in (-1,0)');
  approx(c.delta, 0.5, 0.12, 'ATM call delta ~ 0.5');
  approx(c.delta - p.delta, 1.0, 0.05, 'call delta - put delta ~ 1 (parity)');
  assert.ok(c.gamma > 0, 'gamma positive');
  approx(c.gamma, p.gamma, 1e-6, 'call/put gamma equal');
  assert.ok(c.vega > 0, 'vega positive');
  assert.ok(c.theta < 0, 'long ATM call theta negative (decay)');
  console.log(`✔ Greeks passed (callΔ=${c.delta.toFixed(3)}, putΔ=${p.delta.toFixed(3)}, γ=${c.gamma.toFixed(5)}).`);
}

// ---------------------------------------------------------------------------
// 3. Breeden-Litzenberger RND on the real mock chain: valid distribution.
// ---------------------------------------------------------------------------
console.log('Testing Breeden-Litzenberger RND (valid distribution)...');
{
  const chain = generateMockOptionsChain(SPOT, IV) as ChainContract[];
  assert.ok(chain.length >= 10, 'mock chain should have contracts');
  const rnd = solveImpliedRND(chain, SPOT, IV, T, 0.05);
  assert.ok(rnd.density.length > 0, 'RND must produce density nodes');

  // Probabilities are non-negative and sum to ~1.
  let sum = 0;
  let prevCum = -1e-9;
  for (const node of rnd.density) {
    finite(node.probability, 'node probability');
    assert.ok(node.probability >= -1e-9, 'probability non-negative');
    assert.ok(node.cumulativeProb >= prevCum - 1e-6, 'cumulative prob monotonic non-decreasing');
    prevCum = node.cumulativeProb;
    sum += node.probability;
  }
  approx(sum, 1.0, 0.05, 'RND probabilities sum to ~1');

  // Mean should sit in a sane band around spot; tail flags / moments finite.
  finite(rnd.mean, 'rnd mean'); finite(rnd.stdDev, 'rnd stdDev');
  finite(rnd.skewness, 'rnd skewness'); finite(rnd.kurtosis, 'rnd kurtosis');
  assert.ok(rnd.stdDev > 0, 'rnd stdDev positive');
  assert.ok(rnd.mean > SPOT * 0.7 && rnd.mean < SPOT * 1.3, 'rnd mean within ±30% of spot');
  approx(rnd.probLessThanSpot + rnd.probGreaterThanSpot, 1.0, 0.05, 'P(<spot)+P(>spot) ~ 1');
  console.log(`✔ RND passed (Σp=${sum.toFixed(3)}, mean=${rnd.mean.toFixed(0)}, σ=${rnd.stdDev.toFixed(0)}, skew=${rnd.skewness.toFixed(2)}).`);
}

// ---------------------------------------------------------------------------
// 4. Realized vol suite: positive estimators, finite VRP.
// ---------------------------------------------------------------------------
console.log('Testing realized vol suite...');
{
  const candles: Candle[] = [];
  let px = SPOT;
  for (let i = 0; i < 40; i++) {
    const open = px;
    const close = px * (1 + Math.sin(i * 0.6) * 0.01 + 0.0005);
    const high = Math.max(open, close) * (1 + 0.004);
    const low = Math.min(open, close) * (1 - 0.004);
    candles.push({ time: i, open, high, low, close, volume: 100000 });
    px = close;
  }
  const rv = calculateRealizedVolSuite(candles, IV);
  finite(rv.parkinson, 'parkinson'); finite(rv.garmanKlass, 'garmanKlass'); finite(rv.yangZhang, 'yangZhang');
  assert.ok(rv.parkinson > 0 && rv.garmanKlass > 0 && rv.yangZhang > 0, 'realized vol estimators positive');
  assert.ok(rv.yangZhang < 3, 'realized vol in a sane range (<300%)');
  finite(rv.varianceRiskPremium, 'VRP');
  approx(rv.varianceRiskPremium, IV - rv.yangZhang, 1e-6, 'VRP = IV - RV');
  console.log(`✔ Realized vol passed (YZ=${(rv.yangZhang * 100).toFixed(1)}%, VRP=${(rv.varianceRiskPremium * 100).toFixed(1)}%).`);
}

// ---------------------------------------------------------------------------
// 5. Skew analytics: finite RR/BF.
// ---------------------------------------------------------------------------
console.log('Testing skew analytics...');
{
  const chain = generateMockOptionsChain(SPOT, IV) as ChainContract[];
  const skew = computeSkewAnalytics(chain, SPOT, IV);
  finite(skew.riskReversal25D, 'RR25'); finite(skew.butterfly25D, 'BF25'); finite(skew.skewSlopeAtm, 'skew slope');
  console.log(`✔ Skew passed (RR25=${(skew.riskReversal25D * 100).toFixed(2)}%, BF25=${(skew.butterfly25D * 100).toFixed(2)}%).`);
}

// ---------------------------------------------------------------------------
// 6. Multi-leg payoff: a long call's P&L rises with the underlying.
// ---------------------------------------------------------------------------
console.log('Testing multi-leg payoff geometry...');
{
  const rndForLegs = solveImpliedRND(generateMockOptionsChain(SPOT, IV) as ChainContract[], SPOT, IV, T, 0.05);
  const legs: OptionLeg[] = [
    { id: 'l1', type: 'call', strike: 5000, action: 'buy', qty: 1, iv: IV, entryPrice: 60 },
  ];
  const suite = buildStrategySuite(legs, SPOT, 30, 0.05, rndForLegs);
  finite(suite.netPremium, 'strategy net premium');
  finite(suite.pop, 'probability of profit');
  const coords = generatePayoffCoordinates(legs, SPOT, rndForLegs);
  assert.ok(coords.length > 2, 'payoff curve must have points');
  for (const pt of coords) { finite(pt.underlyingPrice, 'payoff underlyingPrice'); finite(pt.pnl, 'payoff pnl'); }
  // Payoff must be monotonic increasing for a long call across the sampled range.
  assert.ok(
    coords[coords.length - 1].pnl > coords[0].pnl,
    'long call payoff rises with underlying',
  );
  // Deepest-OTM sample should equal -premium*qty*100 (max loss on a long call).
  approx(coords[0].pnl, -60 * 1 * 100, 1, 'long call max loss = -premium*qty*100');
  console.log(`✔ Payoff passed (${coords.length} pts, netPremium=${suite.netPremium.toFixed(0)}, monotonic up).`);
}

// ---------------------------------------------------------------------------
// 7. Portfolio greeks aggregation: long options carry positive net gamma.
// ---------------------------------------------------------------------------
console.log('Testing portfolio greeks aggregation...');
{
  const positions: PortfolioPosition[] = [
    { id: 'p1', symbol: 'SPX', type: 'call', strike: 5000, qty: 2, entryPrice: 60, currentPrice: 65, iv: IV, dte: 30 },
    { id: 'p2', symbol: 'SPX', type: 'put', strike: 4900, qty: 1, entryPrice: 35, currentPrice: 30, iv: IV, dte: 30 },
  ];
  const agg = aggregatePortfolioGreeks(positions, SPOT);
  finite(agg.delta, 'agg delta'); finite(agg.gamma, 'agg gamma'); finite(agg.vega, 'agg vega'); finite(agg.theta, 'agg theta');
  assert.ok(agg.gamma > 0, 'net gamma positive for long options');
  finite(agg.marketValue, 'market value');
  console.log(`✔ Portfolio greeks passed (netΔ=${agg.delta.toFixed(1)}, netΓ=${agg.gamma.toFixed(4)}).`);
}

// ---------------------------------------------------------------------------
// 8. normalCdf sanity.
// ---------------------------------------------------------------------------
console.log('Testing normalCdf...');
{
  approx(normalCdf(0), 0.5, 1e-3, 'Φ(0)=0.5');
  approx(normalCdf(1.96), 0.975, 5e-3, 'Φ(1.96)≈0.975');
  approx(normalCdf(-1.96), 0.025, 5e-3, 'Φ(-1.96)≈0.025');
  assert.ok(normalCdf(8) <= 1 && normalCdf(-8) >= 0, 'Φ bounded in [0,1]');
  console.log('✔ normalCdf passed.');
}

console.log('\n=============================================');
console.log('🎉 ALL QUANT SUITE (CLIENT) TESTS PASSED! 🎉');
console.log('=============================================\n');
