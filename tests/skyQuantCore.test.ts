/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Invariant tests for the corrected Sky Vision quant core — the proof behind
 * "correct". Ported from the spec's __main__ checks: parity, greek equalities,
 * finite-difference agreement, GEX multiplier, touch-prob symmetry, the honest
 * option-target chain, exact-reprice targets, NBRS guards, [0,100] sub-scores,
 * and the OI-velocity invalidation sign fix.
 */
import assert from 'node:assert';
import {
  bsmPrice, bsmGreeks, netGexStrike, gammaFlipSpot, barrierTouchProb,
  spotForTargetPremium, probOptionHitsTarget, targetPctViaReprice, nbrsRatio,
  flowSubscore, dealerSubscore, positioningSubscore, technicalSubscore, volSubscore,
  computePss, hardInvalidations, DEFAULT_ENGINE_CONFIG,
} from '../src/lib/skyQuantCore';

const tol = 1e-7;
console.log('--- RUNNING SKY QUANT CORE TEST SUITE ---\n');

const S = 100, K = 100, tau = 30 / 365, r = 0.04, sigma = 0.25, q = 0;

console.log('Testing BSM price / put-call parity...');
{
  const C = bsmPrice(S, K, tau, r, sigma, q, 'call');
  const P = bsmPrice(S, K, tau, r, sigma, q, 'put');
  const parity = C - P - (S * Math.exp(-q * tau) - K * Math.exp(-r * tau));
  assert.ok(Math.abs(parity) < tol, `put-call parity should hold, residual ${parity}`);
  console.log(`✔ parity holds (C=${C.toFixed(4)} P=${P.toFixed(4)} residual=${parity.toExponential(2)})`);
}

console.log('Testing greek equalities (q=0)...');
{
  const gc = bsmGreeks(S, K, tau, r, sigma, 0, 'call');
  const gp = bsmGreeks(S, K, tau, r, sigma, 0, 'put');
  assert.ok(Math.abs(gc.gamma - gp.gamma) < tol, 'gamma_call==gamma_put');
  assert.ok(Math.abs(gc.vega - gp.vega) < tol, 'vega_call==vega_put');
  assert.ok(Math.abs(gc.vanna - gp.vanna) < tol, 'vanna_call==vanna_put');
  assert.ok(Math.abs(gc.speed - gp.speed) < tol, 'speed_call==speed_put');
  assert.ok(Math.abs(gc.charm - gp.charm) < tol, 'charm_call==charm_put (THE bug: q=0)');
  assert.ok(Math.abs(gp.delta - (gc.delta - Math.exp(-q * tau))) < tol, 'delta_put==delta_call-1');
  console.log(`✔ equalities hold (charm_c=${gc.charm.toExponential(3)} == charm_p)`);
}

console.log('Testing charm differs when q>0...');
{
  const gcd = bsmGreeks(S, K, tau, r, sigma, 0.03, 'call');
  const gpd = bsmGreeks(S, K, tau, r, sigma, 0.03, 'put');
  assert.ok(Math.abs(gcd.charm - gpd.charm) > 1e-4, 'charm_call != charm_put when q>0');
  console.log(`✔ charm splits with dividends (Δ=${(gcd.charm - gpd.charm).toExponential(2)})`);
}

console.log('Testing greeks vs finite-difference (call)...');
{
  const gc = bsmGreeks(S, K, tau, r, sigma, q, 'call');
  const h = 1e-4;
  const fdDelta = (bsmPrice(S + h, K, tau, r, sigma, q, 'call') - bsmPrice(S - h, K, tau, r, sigma, q, 'call')) / (2 * h);
  const fdGamma = (bsmPrice(S + h, K, tau, r, sigma, q, 'call') - 2 * bsmPrice(S, K, tau, r, sigma, q, 'call') + bsmPrice(S - h, K, tau, r, sigma, q, 'call')) / (h * h);
  const fdVega = (bsmPrice(S, K, tau, r, sigma + h, q, 'call') - bsmPrice(S, K, tau, r, sigma - h, q, 'call')) / (2 * h);
  const fdTheta = -(bsmPrice(S, K, tau + h, r, sigma, q, 'call') - bsmPrice(S, K, tau - h, r, sigma, q, 'call')) / (2 * h);
  assert.ok(Math.abs(gc.delta - fdDelta) < 1e-5, `delta~FD (${gc.delta} vs ${fdDelta})`);
  assert.ok(Math.abs(gc.gamma - fdGamma) < 1e-4, `gamma~FD`);
  assert.ok(Math.abs(gc.vega - fdVega) < 1e-4, `vega~FD`);
  assert.ok(Math.abs(gc.theta - fdTheta) < 1e-3, `theta~FD`);
  const dUp = bsmGreeks(S, K, tau + h, r, sigma, q, 'call').delta;
  const dDn = bsmGreeks(S, K, tau - h, r, sigma, q, 'call').delta;
  assert.ok(Math.abs(gc.charm - -(dUp - dDn) / (2 * h)) < 1e-3, `charm~FD`);
  const gUp = bsmGreeks(S + h, K, tau, r, sigma, q, 'call').gamma;
  const gDn = bsmGreeks(S - h, K, tau, r, sigma, q, 'call').gamma;
  assert.ok(Math.abs(gc.speed - (gUp - gDn) / (2 * h)) < 1e-4, `speed~FD`);
  console.log('✔ delta/gamma/vega/theta/charm/speed all match finite-difference');
  // Higher-order greeks vs central finite-difference of the lower greek.
  const relTol = (x: number) => 1e-2 * Math.max(1, Math.abs(x));
  const vegaSU = bsmGreeks(S, K, tau, r, sigma + h, q, 'call').vega, vegaSD = bsmGreeks(S, K, tau, r, sigma - h, q, 'call').vega;
  assert.ok(Math.abs(gc.vomma - (vegaSU - vegaSD) / (2 * h)) < relTol(gc.vomma), `vomma~FD (${gc.vomma})`);
  const gamSU = bsmGreeks(S, K, tau, r, sigma + h, q, 'call').gamma, gamSD = bsmGreeks(S, K, tau, r, sigma - h, q, 'call').gamma;
  assert.ok(Math.abs(gc.zomma - (gamSU - gamSD) / (2 * h)) < relTol(gc.zomma), `zomma~FD (${gc.zomma})`);
  const vegaTU = bsmGreeks(S, K, tau + h, r, sigma, q, 'call').vega, vegaTD = bsmGreeks(S, K, tau - h, r, sigma, q, 'call').vega;
  assert.ok(Math.abs(gc.veta - -(vegaTU - vegaTD) / (2 * h)) < relTol(gc.veta), `veta~FD (${gc.veta})`);
  const gamTU = bsmGreeks(S, K, tau + h, r, sigma, q, 'call').gamma, gamTD = bsmGreeks(S, K, tau - h, r, sigma, q, 'call').gamma;
  assert.ok(Math.abs(gc.color - -(gamTU - gamTD) / (2 * h)) < relTol(gc.color), `color~FD (${gc.color})`);
  const vomSU = bsmGreeks(S, K, tau, r, sigma + h, q, 'call').vomma, vomSD = bsmGreeks(S, K, tau, r, sigma - h, q, 'call').vomma;
  assert.ok(Math.abs(gc.ultima - (vomSU - vomSD) / (2 * h)) < relTol(gc.ultima), `ultima~FD (${gc.ultima})`);
  const gpHO = bsmGreeks(S, K, tau, r, sigma, q, 'put');
  for (const key of ['vomma', 'veta', 'color', 'zomma', 'ultima'] as const) {
    assert.ok(Math.abs((gc as any)[key] - (gpHO as any)[key]) < 1e-9, `${key} call==put`);
  }
  console.log('✔ vomma/veta/color/zomma/ultima all match finite-difference (call==put)');
}

console.log('Testing GEX ×100 multiplier present...');
{
  const gc = bsmGreeks(S, K, tau, r, sigma, q, 'call');
  const gp = bsmGreeks(S, K, tau, r, sigma, q, 'put');
  const gex = netGexStrike(1000, gc.gamma, 800, gp.gamma, S);
  const manual = (1000 * gc.gamma - 800 * gp.gamma) * 100 * S * S * 0.01;
  assert.ok(Math.abs(gex - manual) < tol && Math.abs(gex) > 0, 'GEX includes ×100');
  const flip = gammaFlipSpot([90, 100, 110], [-5, -2, 8]);
  assert.ok(flip !== null && flip > 100 && flip < 110, `gamma flip interpolated (${flip})`);
  console.log(`✔ GEX ×100 present; gamma flip ≈ ${flip?.toFixed(2)}`);
}

console.log('Testing touch probability (both directions, driftless symmetry)...');
{
  const up = barrierTouchProb(S, S * 1.05, sigma, tau);
  const dn = barrierTouchProb(S, S / 1.05, sigma, tau);
  assert.ok(up >= 0 && up <= 1, 'up-touch in [0,1]');
  assert.ok(dn >= 0 && dn <= 1, 'down-touch in [0,1]');
  assert.ok(Math.abs(up - dn) < tol, 'driftless touch symmetric (|ln| fix)');
  console.log(`✔ touch prob symmetric & bounded (up=${up.toFixed(4)} dn=${dn.toFixed(4)})`);
}

console.log('Testing honest option-target chain...');
{
  const prem = bsmPrice(S, K, tau, r, sigma, q, 'call');
  const sStar = spotForTargetPremium(prem * 1.8, S, K, tau, r, sigma, q, 'call');
  assert.ok(sStar !== null, 'inversion found a spot');
  const reprice = bsmPrice(sStar!, K, tau, r, sigma, q, 'call');
  assert.ok(Math.abs(reprice - prem * 1.8) < 1e-4, 'spot_for_target_premium inverts BSM');
  const { prob } = probOptionHitsTarget(prem, 1.8, S, K, tau, r, sigma, q, 'call');
  assert.ok(prob >= 0 && prob <= 1, 'prob_option_hits_target in [0,1]');
  console.log(`✔ chain round-trips (S*=${sStar!.toFixed(2)} → P(1.8×)=${(prob * 100).toFixed(1)}%)`);
}

console.log('Testing target via exact reprice...');
{
  const prem = bsmPrice(S, K, tau, r, sigma, q, 'call');
  const tpct = targetPctViaReprice(S, K, tau, r, sigma, prem, q, 'call', 2.0);
  const man = ((bsmPrice(S + 2, K, tau, r, sigma, q, 'call') - prem) / prem) * 100;
  assert.ok(Math.abs(tpct - man) < tol, 'target % == exact reprice');
  console.log(`✔ exact reprice (+$2 spot → ${tpct.toFixed(1)}% on the option)`);
}

console.log('Testing NBRS guards...');
{
  assert.ok(Math.abs(nbrsRatio([5, 5, 5, 5, 5, 5, 5], 3) - 1) < tol, 'uniform → 1.0');
  assert.ok(nbrsRatio([1, 1, 1, 50, 1, 1, 1], 3) > 5, 'spike → big ratio');
  assert.ok(Math.abs(nbrsRatio([0, 0, 0, 0, 0], 2) - 1) < tol, 'all-zero guarded → 1.0');
  console.log('✔ NBRS uniform/spike/all-zero behave');
}

console.log('Testing sub-scores in [0,100] & PSS bounded...');
{
  const cfg = DEFAULT_ENGINE_CONFIG;
  const hist = Array.from({ length: 500 }, () => (Math.random() - 0.5) * 2e6);
  const subs = [
    flowSubscore(2e6, 1e6, 5e5, 8e6, 4000, 1000, true),
    dealerSubscore(1.2e6, hist, cfg),
    positioningSubscore(300, 4e5, 6, 70, cfg),
    technicalSubscore(101, 100, 99, 100.5, 100.5, 101, 'bull'),
    volSubscore(0.3, 0.25, 1.3, 1.0, 0.6, cfg),
  ];
  assert.ok(subs.every((s) => s >= 0 && s <= 100), 'all sub-scores in [0,100]');
  const pss = computePss(subs[0], subs[1], subs[2], subs[3], subs[4], cfg);
  assert.ok(pss >= 0 && pss <= 100, 'PSS in [0,100] (no *1.4 fudge)');
  console.log(`✔ sub-scores bounded; sample PSS=${pss.toFixed(1)} subs=[${subs.map((s) => s.toFixed(0)).join(',')}]`);
}

console.log('Testing OI-velocity invalidation sign fix...');
{
  const cfg = DEFAULT_ENGINE_CONFIG;
  const small = hardInvalidations(78, 5e6, 5e6, -50, -200, false, false, cfg);
  const big = hardInvalidations(78, 5e6, 5e6, -150, -200, false, false, cfg);
  assert.ok(!small.includes('OI_LIQUIDATION'), 'small decline does NOT trip (old bug always tripped)');
  assert.ok(big.includes('OI_LIQUIDATION'), 'decline past 50% of |vel0| DOES trip');
  console.log('✔ OI-velocity invalidation compares magnitude vs 0.5·|vel0|');
}

console.log('\n=============================================');
console.log('🎉 ALL SKY QUANT CORE TESTS PASSED! 🎉');
console.log('=============================================');
