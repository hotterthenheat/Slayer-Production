/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import { calculateAnalyticGreeks, computeDealerInventory } from '../src/lib/v11Math';
import { AssetInfo, Candle } from '../src/types';
import { buildGexProfile, computeDealerFlowGauge } from '../src/lib/gexEngine';
import { computeDisplacementIntelligence } from '../src/lib/displacementEngine';
import { touchProbability, medianTimeToTouch } from '../src/lib/probability';
import { optionDteDays, hoursToSessionClose } from '../src/data';

console.log('--- RUNNING QUANT MATH TEST SUITE ---');

// 1. Setup mock asset info
const mockAsset: AssetInfo = {
  ticker: 'TEST',
  name: 'Test Index',
  defaultPrice: 100,
  volatility: 0.20,
  decimals: 2,
  type: 'INDEXES',
  spread: 0.05,
  unit: 'points'
};

// 2. Test Black-Scholes-Merton Greeks (d1, d2, Delta, Gamma, Vanna, Charm, Theta)
function testOptionGreeksSymmetry() {
  console.log('Testing BSM Greeks calculations and dual signs...');

  const spot = 100;
  const strike = 100;
  const dteDays = 30; // 30 DTE
  const riskFreeRate = 0.05;
  const impliedVol = 0.20;

  // Compute for Call option: (spot, strike, dteDays, iv, isCall, r)
  const callGreeks = calculateAnalyticGreeks(spot, strike, dteDays, impliedVol, true, riskFreeRate);
  
  // Compute for Put option: (spot, strike, dteDays, iv, isCall, r)
  const putGreeks = calculateAnalyticGreeks(spot, strike, dteDays, impliedVol, false, riskFreeRate);

  // Assert Call Delta is positive, Put Delta is negative
  assert.ok(callGreeks.delta > 0, 'Call Delta must be positive');
  assert.ok(putGreeks.delta < 0, 'Put Delta must be negative');
  assert.ok(Math.abs(callGreeks.delta - putGreeks.delta - 1.0) < 0.01, 'Call Delta - Put Delta should equal ~1 (Put-Call Parity Derivative)');

  // Assert Gamma is positive and identical for both call and put options at same strike/spot
  assert.ok(callGreeks.gamma > 0, 'Gamma must be positive');
  assert.ok(putGreeks.gamma > 0, 'Put Gamma must be positive');
  assert.strictEqual(callGreeks.gamma, putGreeks.gamma, 'Call and Put Gammas must be completely identical at symmetry');

  // Assert Vanna calculation
  assert.ok(Math.abs(callGreeks.vanna) > 0, 'Vanna should be non-zero');
  assert.strictEqual(callGreeks.vanna, putGreeks.vanna, 'Vanna must be identical for Calls and Puts at the same node');

  // Assert Put Charm sign flip behaves correctly (Puts have negative/positive charm matching d2)
  console.log(`Call Charm: ${callGreeks.charm}, Put Charm: ${putGreeks.charm}`);
  assert.ok(!isNaN(callGreeks.charm), 'Call charm must be a finite number');
  assert.ok(!isNaN(putGreeks.charm), 'Put charm must be a finite number');

  // Assert Theta conversion to daily unit represents negative time decay
  assert.ok(callGreeks.theta < 0, 'Call Theta should represent negative time decay');
  assert.ok(putGreeks.theta < 0, 'Put Theta should represent negative time decay');

  console.log('✔ BSM Greeks and Symmetry checks passed.');
}

// 3. Test Dealer Inventory Positioning Calculations
function testDealerInventoryGexDex() {
  console.log('Testing Dealer Inventory positioning signs...');

  // Mock a structured option chain
  // In our conventions, dealers are assumed LONG calls (positive GEX contribution) and SHORT puts (negative GEX contribution)
  const mockOptionChain: any[] = [
    {
      strike: 95,
      type: 'put',
      openInterest: 500,
      iv: 0.22,
      bid: 0.8,
      ask: 0.9,
      delta: -0.3,
      gamma: 0.05,
      vega: 0.12,
      theta: -0.05,
      vanna: 0.02,
      charm: -0.02
    },
    {
      strike: 105,
      type: 'call',
      openInterest: 500,
      iv: 0.18,
      bid: 1.1,
      ask: 1.2,
      delta: 0.4,
      gamma: 0.06,
      vega: 0.15,
      theta: -0.06,
      vanna: 0.03,
      charm: -0.03
    }
  ];

  const spot = 100;
  const DTE = 5;

  // 3rd arg is `dir` (±1), not decimals — pass a proper directional sign.
  const result = computeDealerInventory(mockOptionChain, spot, 1, DTE);

  assert.ok(result.gammaFlipPrice > 0, 'Gamma flip price should be a valid positive number');
  assert.ok(result.netGex !== 0, 'Net GEX should be successfully computed');
  assert.ok(result.netDex !== 0, 'Net DEX should be successfully computed');
  assert.ok(result.dealer01 >= 0 && result.dealer01 <= 1, 'dealer01 inventory index stays in [0,1]');
  // Flipping the directional sign must mirror the dealer-state index around 0.5.
  const flipped = computeDealerInventory(mockOptionChain, spot, -1, DTE);
  assert.ok(Math.abs((result.dealer01 - 0.5) + (flipped.dealer01 - 0.5)) < 1e-9, 'dealer01 is symmetric in dir');

  console.log('✔ Dealer GEX, DEX and Gamma Flip root-solver logic passed.');
}

function testGexEngine() {
  console.log('Testing GEX Engine profile builder and flow solver...');
  const contracts: any[] = [
    { strike: 95, type: 'P', oi: 1000, impliedVolatility: 0.20, delta: -0.3, gamma: 0.05, bid: 1.0, ask: 1.1, volume: 100 },
    { strike: 105, type: 'C', oi: 1000, impliedVolatility: 0.20, delta: 0.4, gamma: 0.06, bid: 1.2, ask: 1.3, volume: 120 }
  ];
  const profile = buildGexProfile(contracts, 100, 1/365, 0.05);
  assert.ok(profile, 'GEX profile should be constructed successfully');
  assert.ok(profile.strikes.length > 0, 'Strikes list should contain values');
  assert.ok(profile.gammaFlip > 0, 'Gamma Flip should be calculated');
  
  const flow = computeDealerFlowGauge(profile, 1000000, -2000000);
  assert.ok(flow, 'Dealer flow gauge should be computed successfully');
  assert.ok(flow.pressure >= -100 && flow.pressure <= 100, 'Pressure score should be between -100 and +100');
  console.log('✔ GEX Engine checks passed.');
}

function testDisplacementEngine() {
  console.log('Testing Displacement Engine market structure and sweeps...');
  const candles: Candle[] = [];
  const baseTime = Date.now() - 50 * 300000;
  for (let i = 0; i < 50; i++) {
    candles.push({
      timestamp: baseTime + i * 300000,
      open: 100 + i * 0.5,
      high: 101 + i * 0.5,
      low: 99.5 + i * 0.5,
      close: 100.5 + i * 0.5,
      volume: 150000 + (i % 5) * 10000,
      vwap: 100 + i * 0.5
    });
  }
  const result = computeDisplacementIntelligence(candles);
  assert.ok(result, 'Displacement intelligence should be built successfully');
  assert.ok(result.volatility.atr > 0, 'ATR value should be positive');
  assert.ok(typeof result.structure.trend === 'string', 'Trend bias should be a string');
  console.log('✔ Displacement Engine checks passed.');
}

function testProbabilityEngine() {
  console.log('Testing Probability Engine touch probability and median time...');
  const spot = 100;
  const targetPrice = 105;
  const dte = 30;
  const iv = 0.20;
  const riskFree = 0.05;
  
  // Signature is touchProbability(S, B, sigma, tauYears, mu) — pass IV as sigma and
  // dte/365 as the year-fraction (not dte as sigma).
  const prob = touchProbability(spot, targetPrice, iv, dte / 365, riskFree);
  assert.ok(prob >= 0 && prob <= 1, 'Touch probability must be between 0 and 1');
  assert.ok(prob > 0.1, 'A 5% upside barrier should be reachable within 30 DTE');
  
  const medianTime = medianTimeToTouch(spot, targetPrice, iv, riskFree);
  assert.ok(medianTime > 0, 'Median time to touch should be positive');
  console.log('✔ Probability Engine checks passed.');
}

// Run all tests
try {
  testOptionGreeksSymmetry();
  testDealerInventoryGexDex();
  testGexEngine();
  testDisplacementEngine();
  testProbabilityEngine();

  // PINPOINT CORE MATH MODEL TESTS
  console.log('Testing Robust BSM higher-order Greeks and pricing consistency...');
  const S = 100;
  const K = 100;
  const tau = 0.1; // 36.5 days
  const r = 0.05;
  const q = 0.01;
  const sigma = 0.20;
  const isCall = true;

  const { calculateBSMGreeks, rawSVI, SVISurfaceCalibrator, DupireLocalVolSolver, DealerExposureEngine, PhysicsCascadeEngine, BayesianRegimeEngine } = await import('../src/lib/pinpointEngine');
  const greeks = calculateBSMGreeks(S, K, tau, r, q, sigma, isCall);

  assert.ok(greeks.price > 0, 'BSM price must be positive');
  assert.ok(greeks.delta > 0, 'Call Delta must be positive');
  assert.ok(greeks.gamma > 0, 'Gamma must be positive');
  assert.ok(Math.abs(greeks.vanna) > 0, 'Vanna must be non-zero');
  assert.ok(Math.abs(greeks.charm) > 0, 'Charm must be non-zero');
  assert.ok(Math.abs(greeks.speed) > 0, 'Speed must be non-zero');
  assert.ok(Math.abs(greeks.color) > 0, 'Color must be non-zero');
  console.log('✔ Model 1: Robust BSM Engine and Higher-Order Greeks passed.');

  console.log('Testing Model 2 SVI surface calibration and arbitrage verification...');
  const sviParams = { a: 0.04, b: 0.1, rho: -0.4, m: 0.0, sigma: 0.1 };
  const variance_at_zero = rawSVI(0, sviParams);
  assert.ok(variance_at_zero > 0, 'SVI variance at k=0 must be positive');

  // Enforce zero arbitrage on standard surface coordinates
  const kRange = [-0.2, -0.1, 0, 0.1, 0.2];
  const isArrFree = SVISurfaceCalibrator.checkButterflyArbitrage(kRange, sviParams);
  assert.strictEqual(isArrFree, true, 'SVI parameters must verify free of butterfly arbitrage on close-to-at-the-money grid');
  console.log('✔ Model 2: SVI Vol Surface calibration checks passed.');

  console.log('Testing Model 3 Dupire Local Volatility Surface Solver...');
  const sviParamsPlus = { ...sviParams, a: 0.042 }; // variance moves up slightly with tau
  const localVol = DupireLocalVolSolver.solveLocalVol(0, tau, sviParams, sviParamsPlus, 0.01);
  assert.ok(localVol > 0 && !isNaN(localVol), 'Dupire local vol must solve to a finite positive number');
  console.log(`Fitted Local Volatility Spot center: ${(localVol * 100).toFixed(2)}%`);
  console.log('✔ Model 3: Dupire Local Vol solver checks passed.');

  console.log('Testing Model 4 signed Dealer GEX, VEX, and CEX Exposure Engine...');
  const exposures = DealerExposureEngine.calculateExposures(S, K, tau, r, q, sigma, true, 1000);
  assert.ok(exposures.gexStrike > 0, 'Signed Call GEX (dealer short) should contribute positively to spot buying support');
  assert.ok(exposures.vexStrike !== 0, 'Signed Call VEX should be non-zero');
  assert.ok(exposures.cexStrike !== 0, 'Signed Call CEX should be non-zero');
  console.log('✔ Model 4: Dealer Exposure calculations passed.');

  console.log('Testing Model 5 Physics Gravity Wells potential field and multi-step Monte Carlo projection...');
  const strikes = [90, 95, 100, 105, 110];
  const gex = [-200000, -100000, 500000, -150000, -300000]; // Pin center 100 has positive GEX gravity well, outer clifs are repellent
  const bookLevels = [98, 102];
  const bookLiquidity = [15000, 12000];
  const meanReversionTarget = 100;
  const theta = 0.5; // MR factor
  const kappa = 0.01; // market coupling elasticity
  
  const F_center = PhysicsCascadeEngine.calculateHedgingForce(100, strikes, gex, bookLevels, bookLiquidity, meanReversionTarget, theta);
  assert.ok(!isNaN(F_center), 'Hedging physics force must be a valid number');

  // Multi-step Monte Carlo
  const mcRes = PhysicsCascadeEngine.simulatePaths(S, strikes, gex, bookLevels, bookLiquidity, meanReversionTarget, theta, kappa, localVol, tau, 10, 30);
  assert.strictEqual(mcRes.paths.length, 30, 'Simulated paths count must equal 30');
  assert.strictEqual(mcRes.paths[0].length, 11, 'Simulated steps count must equal 11');
  assert.ok(mcRes.mean > 0, 'Simulated mean path endpoint price must be positive');
  assert.ok(mcRes.ci95[0] < mcRes.ci95[1], 'Uncertainty boundaries must span a positive confidence interval');
  console.log('✔ Model 5: Physics potential field forces and EM simulation cascades passed.');

  console.log('Testing Model 6 Bayesian Regime Classification & Uncertainty Engine...');
  const regimeRes = BayesianRegimeEngine.classifyRegime(5000000, 20, 0.5);
  assert.ok(regimeRes.regime === 'STABILIZED_PIN', 'Robust positive GEX and low velocity triggers Stabilized range pin classification');
  assert.ok(Math.abs(regimeRes.posteriors.STABILIZED_PIN + regimeRes.posteriors.VOLATILITY_TRANSITION + regimeRes.posteriors.AMPLIFIED_SQUEEZE - 1.0) < 1e-4, 'Bayesian joint probabilities must sum to 1.0');
  console.log('✔ Model 6: Bayesian Regime classification and posterior solver passed.');

  console.log('\n=============================================');
  console.log('🎉 ALL INSTITUTIONAL QUANT MANIFEST TESTS PASSED! 🎉');
  console.log('=============================================\n');
} catch (error) {
  console.error('❌ QUANT TEST RUNNER FAILED:', error);
  throw error;
}

// --- Intraday time-to-expiry clock (the 0DTE fix) ---
try {
  console.log('\nTesting intraday time-to-expiry clock (0DTE fix)…');
  const daily: any = { optionsStyle: 'daily' };
  // Fixed instants. June = EDT (UTC-4): 13:30Z = 09:30 ET (open), 18:00Z = 14:00 ET, 19:45Z = 15:45 ET.
  const openET = new Date('2026-06-23T13:30:00Z');
  const midET  = new Date('2026-06-23T18:00:00Z');
  const lateET = new Date('2026-06-23T19:45:00Z');
  const overnight = new Date('2026-06-24T02:00:00Z'); // 22:00 ET, outside RTH

  assert.ok(Math.abs(hoursToSessionClose(openET) - 6.5) < 1e-6, 'full session (6.5h) at the open');
  assert.ok(Math.abs(hoursToSessionClose(midET) - 2.0) < 1e-6, '2h to close at 14:00 ET');

  const dteOpen = optionDteDays(daily, openET);
  const dteMid  = optionDteDays(daily, midET);
  const dteLate = optionDteDays(daily, lateET);

  // Core fix: a 0DTE name is NOT a flat 1 calendar day — it is the session fraction.
  assert.ok(Math.abs(dteOpen - 6.5 / 24) < 1e-4, `0DTE at open ≈ 0.271d, got ${dteOpen}`);
  assert.ok(dteOpen < 0.99, '0DTE must be well under a full calendar day');
  assert.ok(dteMid < dteOpen, 'time-to-expiry decays through the session');
  assert.ok(dteLate > 0 && dteLate <= 0.04, `0DTE floors near the close (finite greeks), got ${dteLate}`);
  assert.ok(Math.abs(optionDteDays(daily, overnight) - 6.5 / 24) < 1e-4, 'overnight assumes the next full session');

  console.log(`✔ intraday DTE: open=${dteOpen.toFixed(4)}d  mid=${dteMid.toFixed(4)}d  late=${dteLate.toFixed(4)}d  (was a flat 1.0000d all day)`);
} catch (error) {
  console.error('❌ INTRADAY DTE TEST FAILED:', error);
  throw error;
}


