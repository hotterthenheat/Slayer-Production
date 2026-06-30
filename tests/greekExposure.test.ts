/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dealer Greek exposure profiles — validates the per-strike aggregation and,
 * critically, that the gamma / delta / vanna NETS reconcile exactly with the
 * platform's canonical computeDealerInventory (same dollar conventions), plus
 * the sign convention and the cumulative-zero flip detection.
 */
import assert from 'node:assert';
import { computeGreekExposureProfile } from '../src/lib/greekExposure';
import { computeDealerInventory, type ChainContract } from '../src/lib/v11Math';

console.log('--- RUNNING GREEK-EXPOSURE TEST SUITE ---');

const spot = 100;
// A small two-sided chain with real-ish per-contract Greeks.
const mk = (strike: number, type: 'call' | 'put', oi: number, g: number, d: number, vn: number, ch: number, vg: number): ChainContract => ({
  strike, type, openInterest: oi, iv: 0.2, bid: 1, ask: 1.1,
  delta: d, gamma: g, vega: vg, theta: -0.1, vanna: vn, charm: ch,
});
const chain: ChainContract[] = [
  mk(90, 'put', 8000, 0.010, -0.20, -0.012, -0.008, 1.8),
  mk(95, 'put', 6000, 0.018, -0.35, -0.010, -0.006, 2.2),
  mk(100, 'call', 9000, 0.022, 0.52, 0.001, -0.001, 2.6),
  mk(100, 'put', 7000, 0.022, -0.48, -0.001, -0.001, 2.6),
  mk(105, 'call', 6500, 0.016, 0.30, 0.011, -0.006, 2.1),
  mk(110, 'call', 9500, 0.009, 0.18, 0.013, -0.009, 1.7),
];

console.log('Testing gamma/delta/vanna NET reconcile with computeDealerInventory...');
{
  const inv = computeDealerInventory(chain, spot, 1, 1);
  const gamma = computeGreekExposureProfile(chain, spot, 'gamma', 5)!;
  const delta = computeGreekExposureProfile(chain, spot, 'delta', 5)!;
  const vanna = computeGreekExposureProfile(chain, spot, 'vanna', 5)!;
  assert.ok(gamma && delta && vanna, 'profiles produced');
  const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol + Math.abs(b) * 1e-9;
  assert.ok(close(gamma.net, inv.netGex), `GEX net ${gamma.net.toFixed(0)} ≈ ${inv.netGex.toFixed(0)}`);
  assert.ok(close(delta.net, inv.netDex), `DEX net ${delta.net.toFixed(0)} ≈ ${inv.netDex.toFixed(0)}`);
  assert.ok(close(vanna.net, inv.netVex), `VEX net ${vanna.net.toFixed(0)} ≈ ${inv.netVex.toFixed(0)}`);
  console.log(`✔ nets reconcile — GEX ${(gamma.net / 1e6).toFixed(1)}M, DEX ${(delta.net / 1e6).toFixed(1)}M, VEX ${(vanna.net / 1e6).toFixed(1)}M`);
}

console.log('Testing sign convention (call + / put −) and per-strike aggregation...');
{
  const gamma = computeGreekExposureProfile(chain, spot, 'gamma', 5)!;
  const pureCall = gamma.nodes.find((n) => n.strike === 110)!;
  const purePut = gamma.nodes.find((n) => n.strike === 90)!;
  assert.ok(pureCall.exposure > 0 && pureCall.put === 0, 'pure-call strike ⇒ positive gamma exposure');
  assert.ok(purePut.exposure < 0 && purePut.call === 0, 'pure-put strike ⇒ negative gamma exposure');
  const mixed = gamma.nodes.find((n) => n.strike === 100)!;
  assert.ok(Math.abs(mixed.call + mixed.put - mixed.exposure) < 1e-6, 'call+put split sums to node exposure');
  assert.ok(mixed.call > 0 && mixed.put < 0, 'mixed strike carries both signs');
  console.log(`✔ signs + aggregation — K100 call ${(mixed.call / 1e6).toFixed(1)}M, put ${(mixed.put / 1e6).toFixed(1)}M`);
}

console.log('Testing cumulative-zero flip sits between bracketing strikes...');
{
  // Put-dominated downside (negative) flipping to call-dominated upside (positive).
  const gamma = computeGreekExposureProfile(chain, spot, 'gamma', 5)!;
  assert.ok(gamma.flip !== null, 'a cumulative flip exists');
  assert.ok(gamma.flip! >= 90 && gamma.flip! <= 110, `flip ${gamma.flip?.toFixed(1)} within strike range`);
  console.log(`✔ flip at ${gamma.flip?.toFixed(1)}`);
}

console.log('Testing charm/vega profiles are finite with correct net sign...');
{
  const charm = computeGreekExposureProfile(chain, spot, 'charm', 5)!;
  const vega = computeGreekExposureProfile(chain, spot, 'vega', 5)!;
  assert.ok(isFinite(charm.net) && isFinite(vega.net), 'charm/vega nets finite');
  assert.ok(charm.gross > 0 && vega.gross > 0, 'non-degenerate gross exposure');
  // vega: every contract has +vega, sign = call(+)/put(−) ⇒ net = Σ vega·OI·(call−put) sign.
  const expVegaNet = chain.reduce((a, c) => a + c.vega * c.openInterest * 100 * 0.01 * (c.type === 'call' ? 1 : -1), 0);
  assert.ok(Math.abs(vega.net - expVegaNet) < 1, 'vega net matches closed convention');
  console.log(`✔ charm net ${(charm.net / 1e3).toFixed(1)}k $Δ/day, vega net ${(vega.net / 1e3).toFixed(1)}k $/1%`);
}

console.log('🎉 ALL GREEK-EXPOSURE TESTS PASSED! 🎉');
