/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dealer hedging simulator — validates the gamma-kernel landscape, the flip
 * crossing, the regime sign convention, and the cumulative-hedge anchoring.
 */
import assert from 'node:assert';
import { simulateDealerHedging } from '../src/lib/dealerHedging';

console.log('--- RUNNING DEALER-HEDGING TEST SUITE ---');

console.log('Testing single long-gamma strike peaks at its strike...');
{
  const res = simulateDealerHedging([{ strike: 100, netGex: 1e9 }, { strike: 100.01, netGex: 1e9 }], 100, 0.02, 0.06, 121)!;
  assert.ok(res, 'result produced');
  const atSpot = res.nodes.find((n) => Math.abs(n.price - 100) < 0.6)!;
  const away = res.nodes.find((n) => n.price > 105)!;
  assert.ok(atSpot.gammaDollar > away.gammaDollar, 'gamma is larger near the strike than far away');
  assert.ok(res.netGammaNow > 0 && res.regimeNow === 'stabilizing', 'positive net gamma ⇒ stabilizing');
  console.log(`✔ peak at strike; regime ${res.regimeNow}, Γ$now ${(res.netGammaNow / 1e9).toFixed(2)}B`);
}

console.log('Testing flip between a short-gamma floor and a long-gamma ceiling...');
{
  const res = simulateDealerHedging([{ strike: 95, netGex: -1e9 }, { strike: 105, netGex: 1e9 }], 100, 0.02, 0.08, 161)!;
  assert.ok(res.gammaFlip !== null, 'a flip crossing exists');
  assert.ok(res.gammaFlip! > 95 && res.gammaFlip! < 105, `flip (${res.gammaFlip?.toFixed(1)}) sits between the strikes`);
  const lowNode = res.nodes.find((n) => n.price < 97)!;
  const highNode = res.nodes.find((n) => n.price > 103)!;
  assert.ok(lowNode.gammaDollar < 0 && lowNode.regime === 'amplifying', 'below: short gamma / amplifying');
  assert.ok(highNode.gammaDollar > 0 && highNode.regime === 'stabilizing', 'above: long gamma / stabilizing');
  assert.ok(res.squeezePrice !== null && res.squeezePrice! < 100, 'squeeze zone below spot');
  console.log(`✔ flip ${res.gammaFlip?.toFixed(1)}, squeeze ${res.squeezePrice?.toFixed(1)} (score ${res.squeezeScore.toFixed(2)})`);
}

console.log('Testing cumulative hedge anchors at spot...');
{
  const res = simulateDealerHedging([{ strike: 100, netGex: 1e9 }, { strike: 110, netGex: 5e8 }], 100, 0.02)!;
  const atSpot = res.nodes.reduce((b, n) => (Math.abs(n.price - 100) < Math.abs(b.price - 100) ? n : b), res.nodes[0]);
  assert.ok(Math.abs(atSpot.cumHedge) < Math.abs(res.nodes[0].cumHedge) + 1, 'cumulative hedge ~0 at spot, grows outward');
  assert.ok(res.hedgePer1PctUp === res.netGammaNow && res.hedgePer1PctDown === -res.netGammaNow, 'hedge-per-1% sign convention');
  console.log('✔ cumulative hedge anchored at spot');
}

console.log('🎉 ALL DEALER-HEDGING TESTS PASSED! 🎉');
