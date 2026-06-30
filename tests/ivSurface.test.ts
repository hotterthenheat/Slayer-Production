/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IV surface MODEL — validates that the front row reproduces the REAL smile
 * exactly (nothing modelled touches it), the Heston forward-variance term factor
 * behaves correctly (mean-reverts toward θ), and every modelled IV stays finite
 * and positive.
 */
import assert from 'node:assert';
import { buildIvSurfaceModel } from '../src/lib/ivSurface';
import type { ChainContract } from '../src/lib/v11Math';

console.log('--- RUNNING IV-SURFACE TEST SUITE ---');

const spot = 100;
const mk = (strike: number, type: 'call' | 'put', iv: number): ChainContract => ({
  strike, type, openInterest: 1000, iv, bid: 1, ask: 1.1,
  delta: type === 'call' ? 0.5 : -0.5, gamma: 0.02, vega: 2, theta: -0.1, vanna: 0, charm: 0,
});
// A smile: wings richer than ATM (0.25), within ±10% window.
const chain: ChainContract[] = [
  mk(92, 'put', 0.34), mk(96, 'put', 0.29), mk(100, 'call', 0.25), mk(100, 'put', 0.25),
  mk(104, 'call', 0.27), mk(108, 'call', 0.31),
];

console.log('Testing front row reproduces the REAL smile exactly...');
{
  const s = buildIvSurfaceModel(chain, spot, 7, { theta: 0.18 * 0.18, kappa: 3 })!;
  assert.ok(s, 'surface built');
  assert.strictEqual(s.dtes[0], 7, 'front dte is first');
  assert.ok(Math.abs(s.factor[0] - 1) < 1e-9, 'front term factor is exactly 1');
  assert.ok(Math.abs(s.atmTerm[0] - s.atmFront) < 1e-9, 'front ATM term == real ATM');
  for (let i = 0; i < s.strikes.length; i++) {
    assert.ok(Math.abs(s.iv[0][i] - s.frontIv[i]) < 1e-9, `front row strike ${s.strikes[i]} unchanged`);
  }
  console.log(`✔ front row exact; ATM ${(s.atmFront * 100).toFixed(1)}%, n=${s.strikes.length}`);
}

console.log('Testing high front vol mean-reverts DOWN toward θ with horizon...');
{
  // v0 = 0.25^2 = 0.0625 > θ = 0.18^2 = 0.0324 ⇒ term factor should fall below 1.
  const s = buildIvSurfaceModel(chain, spot, 7, { theta: 0.18 * 0.18, kappa: 3 })!;
  for (let i = 1; i < s.dtes.length; i++) {
    assert.ok(s.factor[i] < 1, `factor at ${s.dtes[i]}d (${s.factor[i].toFixed(3)}) < 1 (reverting down)`);
    assert.ok(s.factor[i] <= s.factor[i - 1] + 1e-9, 'factor monotonically non-increasing with horizon');
    assert.ok(s.atmTerm[i] < s.atmFront, 'ATM IV declines toward long-run');
  }
  console.log(`✔ term reverts down: ${s.dtes.map((d, i) => `${d}d=${(s.atmTerm[i] * 100).toFixed(0)}%`).join(' ')}`);
}

console.log('Testing low front vol mean-reverts UP toward θ...');
{
  // Front ATM forced low via a high θ ⇒ factor should rise above 1.
  const s = buildIvSurfaceModel(chain, spot, 7, { theta: 0.40 * 0.40, kappa: 3 })!;
  for (let i = 1; i < s.dtes.length; i++) {
    assert.ok(s.factor[i] > 1, `factor at ${s.dtes[i]}d (${s.factor[i].toFixed(3)}) > 1 (reverting up)`);
  }
  console.log(`✔ term reverts up toward θ=40%: back ATM ${(s.atmTerm[s.atmTerm.length - 1] * 100).toFixed(0)}%`);
}

console.log('Testing every modelled IV is finite and positive, skew shape preserved...');
{
  const s = buildIvSurfaceModel(chain, spot, 7, {})!;
  for (let r = 0; r < s.iv.length; r++) {
    for (let c = 0; c < s.strikes.length; c++) {
      assert.ok(isFinite(s.iv[r][c]) && s.iv[r][c] > 0, `iv[${r}][${c}] finite & positive`);
    }
    // sticky-moneyness: every row is the front smile times one scalar ⇒ ratios preserved.
    const ratio0 = s.iv[r][0] / s.frontIv[0];
    const ratioN = s.iv[r][s.strikes.length - 1] / s.frontIv[s.strikes.length - 1];
    assert.ok(Math.abs(ratio0 - ratioN) < 1e-9, 'skew shape held constant across the row');
  }
  console.log('✔ all IVs valid; skew shape preserved per row');
}

console.log('🎉 ALL IV-SURFACE TESTS PASSED! 🎉');
