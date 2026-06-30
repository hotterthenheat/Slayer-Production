/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monte Carlo engine validation — against the closed-form GBM terminal moments
 * and qualitative cross-model checks (jumps fatten tails; Heston stays a
 * risk-neutral martingale).
 */
import assert from 'node:assert';
import { simulateMonteCarlo } from '../src/lib/monteCarlo';

console.log('--- RUNNING MONTE-CARLO TEST SUITE ---');

const S = 100, r = 0.05, sigma = 0.2, T = 0.25;
const analyticMean = S * Math.exp(r * T);
const analyticStd = S * Math.exp(r * T) * Math.sqrt(Math.exp(sigma * sigma * T) - 1);
const analyticMedian = S * Math.exp((r - 0.5 * sigma * sigma) * T);

console.log('Testing GBM terminal moments vs closed form...');
{
  const res = simulateMonteCarlo({ spot: S, r, sigma, tYears: T, steps: 50, nPaths: 40000, model: 'gbm', seed: 12345 });
  const meanErr = Math.abs(res.terminalMean - analyticMean) / analyticMean;
  const stdErr = Math.abs(res.terminalStd - analyticStd) / analyticStd;
  const medErr = Math.abs(res.percentiles.p50 - analyticMedian) / analyticMedian;
  console.log(`  mean ${res.terminalMean.toFixed(3)} vs ${analyticMean.toFixed(3)} (${(meanErr * 100).toFixed(2)}%)`);
  console.log(`  std  ${res.terminalStd.toFixed(3)} vs ${analyticStd.toFixed(3)} (${(stdErr * 100).toFixed(2)}%)`);
  console.log(`  med  ${res.percentiles.p50.toFixed(3)} vs ${analyticMedian.toFixed(3)} (${(medErr * 100).toFixed(2)}%)`);
  assert.ok(meanErr < 0.01, `GBM mean within 1% of S·e^{rT} (got ${(meanErr * 100).toFixed(2)}%)`);
  assert.ok(stdErr < 0.04, `GBM std within 4% of analytic (got ${(stdErr * 100).toFixed(2)}%)`);
  assert.ok(medErr < 0.02, `GBM median within 2% of S·e^{(r−σ²/2)T} (got ${(medErr * 100).toFixed(2)}%)`);
  // analyticGbmMean is exact closed form, independent of path count
  assert.ok(Math.abs(res.analyticGbmMean - analyticMean) < 1e-9, 'analyticGbmMean == S·e^{rT}');
  console.log('✔ GBM terminal mean/std/median match the closed form');
}

console.log('Testing percentile monotonicity + tail metrics...');
{
  const res = simulateMonteCarlo({ spot: S, r, sigma, tYears: T, steps: 50, nPaths: 20000, model: 'gbm', seed: 7 });
  const p = res.percentiles;
  assert.ok(p.p05 < p.p25 && p.p25 < p.p50 && p.p50 < p.p75 && p.p75 < p.p95, 'percentiles strictly increasing');
  assert.ok(res.es95 >= res.var95 - 1e-9, 'ES95 ≥ VaR95 (expected shortfall is deeper than the quantile)');
  assert.ok(res.es99 >= res.var99 - 1e-9, 'ES99 ≥ VaR99');
  assert.ok(res.probUp > 0 && res.probUp < 1, 'probUp in (0,1)');
  const totalInHist = res.histogram.counts.reduce((a, b) => a + b, 0);
  assert.ok(totalInHist > 0.9 * res.nPaths, 'histogram captures the bulk (>90%) of paths');
  console.log('✔ percentiles monotone, ES≥VaR, histogram sane');
}

console.log('Testing jump-diffusion fattens the tails vs GBM...');
{
  const base = { spot: S, r, sigma, tYears: T, steps: 50, nPaths: 30000, seed: 999 } as const;
  const gbm = simulateMonteCarlo({ ...base, model: 'gbm' });
  const jmp = simulateMonteCarlo({ ...base, model: 'jump', jump: { lambda: 3, muJ: -0.04, sigJ: 0.12 } });
  // Compensated jumps keep the mean risk-neutral; variance strictly increases.
  assert.ok(jmp.terminalStd > gbm.terminalStd * 1.02, `jump std (${jmp.terminalStd.toFixed(2)}) > GBM std (${gbm.terminalStd.toFixed(2)})`);
  const meanErr = Math.abs(jmp.terminalMean - analyticMean) / analyticMean;
  assert.ok(meanErr < 0.02, `compensated jump mean stays risk-neutral within 2% (got ${(meanErr * 100).toFixed(2)}%)`);
  console.log(`✔ jump std ${jmp.terminalStd.toFixed(2)} > GBM ${gbm.terminalStd.toFixed(2)}, mean stays risk-neutral`);
}

console.log('Testing Heston runs finite + roughly risk-neutral...');
{
  const res = simulateMonteCarlo({ spot: S, r, sigma, tYears: T, steps: 80, nPaths: 20000, model: 'heston', seed: 42, heston: { kappa: 2.0, theta: 0.04, xi: 0.4, rho: -0.6, v0: 0.04 } });
  assert.ok(isFinite(res.terminalMean) && isFinite(res.terminalStd), 'Heston produces finite moments');
  const meanErr = Math.abs(res.terminalMean - analyticMean) / analyticMean;
  assert.ok(meanErr < 0.03, `Heston mean ≈ risk-neutral within 3% (got ${(meanErr * 100).toFixed(2)}%)`);
  assert.ok(res.terminalStd > 0, 'Heston dispersion positive');
  console.log('✔ Heston finite + risk-neutral mean');
}

console.log('Testing determinism (same seed ⇒ identical run)...');
{
  const a = simulateMonteCarlo({ spot: S, r, sigma, tYears: T, steps: 30, nPaths: 5000, model: 'gbm', seed: 314 });
  const b = simulateMonteCarlo({ spot: S, r, sigma, tYears: T, steps: 30, nPaths: 5000, model: 'gbm', seed: 314 });
  assert.strictEqual(a.terminalMean, b.terminalMean, 'same seed ⇒ identical mean');
  assert.strictEqual(a.terminalStd, b.terminalStd, 'same seed ⇒ identical std');
  console.log('✔ deterministic under fixed seed');
}

console.log('🎉 ALL MONTE-CARLO TESTS PASSED! 🎉');
