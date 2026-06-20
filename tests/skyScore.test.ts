/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * V5 + V5.1 SkyScore acceptance tests (spec Part 10 + V5.1 build notes).
 * Plain assert + tsx style. Run: npx tsx tests/skyScore.test.ts
 */

import assert from 'assert';
import { normSignedTanh, normCrossSection, percentile } from '../src/lib/normalize';
import {
  rankContracts, RankerContract, EmaTargets, DEFAULT_V5_CONFIG,
  reachMultiplier, mispricingMultiplier,
} from '../src/lib/skyScore';
import { SnapshotStore } from '../src/lib/snapshotStore';
import {
  dealerStressIndex, dealerConvexity, computeDealerSignals,
  modulateDecision, DEFAULT_DEALER_COUPLING, DealerSignals,
} from '../src/lib/dealerSignals';
import { calculateAnalyticGreeks, computeDealerInventory } from '../src/lib/v11Math';

let passed = 0;
const ok = (cond: boolean, msg: string) => { assert.ok(cond, msg); passed++; console.log('  ✓', msg); };

const EMAS: EmaTargets = { ema5: 105, ema9: 108, ema20: 112, ema50: 120, ema200: 90 };

function mk(p: Partial<RankerContract>): RankerContract {
  return {
    symbol: 'SPX', expiration: '2026-06-20', strike: 100, type: 'C',
    oi: 1000, volume: 500, bid: 2.0, ask: 2.05, iv: 0.20,
    delta: 0.5, gamma: 0.02, vega: 0.1, theta: -0.5,
    ...p,
  };
}

console.log('--- V5 / V5.1 SKYSCORE ACCEPTANCE SUITE ---');

// ---- Test A: normalizers + degenerate sets ----
console.log('A. Normalizers / degenerate sets');
ok(normSignedTanh(0, 5000) === 50, 'normSignedTanh(0, s) === 50');
ok(normCrossSection(5, [5]) === 50, 'normCrossSection(x, [x]) === 50');
ok(normSignedTanh(0, 0) === 50, 'normSignedTanh(d, 0) === 50 (no NaN)');
ok(percentile([], 50) === 0 && isFinite(percentile([7], 90)), 'percentile guards empty/single');
{
  const single = rankContracts({
    direction: 'bullish', spot: 100, dteDays: 5, dataSource: 'SIMULATED', emaTargets: EMAS,
    chain: [mk({ strike: 100 }), mk({ strike: 105, type: 'P', delta: -0.5 })],
  });
  const elig = single.filter((c) => c.eligible);
  ok(elig.length === 1 && elig[0].dealerInfluenceScore === 50, 'single-candidate cross-section score === 50');
  ok(single.every((c) => [c.skyScore, c.positioningScore, c.dealerInfluenceScore, c.accelerationScore, c.emaPathScore, c.liquidityScore].every(isFinite)), 'no NaN/Infinity in any score');
}

// ---- Test B: eligibility gate ----
console.log('B. Eligibility gate');
{
  const base = { direction: 'bullish' as const, spot: 100, dteDays: 5, dataSource: 'SIMULATED' as const, emaTargets: EMAS };
  const r = (p: Partial<RankerContract>) => rankContracts({ ...base, chain: [mk(p)] })[0];
  ok(r({ oi: 100 }).rejectReasons.some((x) => x.includes('OI')), 'rejects OI < 250');
  ok(r({ volume: 50 }).rejectReasons.some((x) => x.includes('volume')), 'rejects volume < 100');
  ok(r({ bid: 2.0, ask: 2.6 }).rejectReasons.some((x) => x.includes('spread')), 'rejects spread > 12%');
  ok(r({ delta: 0.10 }).rejectReasons.some((x) => x.includes('delta')), 'rejects |delta| < 0.30');
  ok(r({}).eligible === true, 'clean contract passes');
}

// ---- V5.1 §1.1: Positioning Density (cluster beats equal-mass lone spike) ----
console.log('§1.1 Positioning Density — cluster > equal-mass lone spike');
{
  const strikes = [88, 92, 96, 100, 104, 108, 112];
  const lone = strikes.map((s) => mk({ strike: s, oi: s === 100 ? 6000 : 100, volume: 500 }));
  const cluster = strikes.map((s) => mk({ strike: s, oi: 943, volume: 500 })); // equal total mass ≈ 6601
  const base = { direction: 'bullish' as const, spot: 100, dteDays: 5, dataSource: 'SIMULATED' as const, emaTargets: EMAS };
  const loneDensity = rankContracts({ ...base, chain: lone }).find((c) => c.strike === 100)!.positioningDensity;
  const clusterDensity = rankContracts({ ...base, chain: cluster }).find((c) => c.strike === 100)!.positioningDensity;
  ok(clusterDensity > loneDensity * 1.5, `equal-mass cluster density >> lone spike (${clusterDensity} vs ${loneDensity})`);
}

// ---- V5.1 §1.2: reachability multiplier (corrected EM/distance) ----
console.log('§1.2 Reachability multiplier (EM ÷ distance)');
{
  const EM = 0.02;
  ok(reachMultiplier(EM, 0.5 * EM) === 1, 'target at 0.5·EM → 1.0');
  ok(reachMultiplier(EM, EM) === 1, 'target at 1·EM → 1.0');
  ok(Math.abs(reachMultiplier(EM, 2 * EM) - 0.5) < 1e-9, 'target at 2·EM → 0.5');
  ok(Math.abs(reachMultiplier(EM, 4 * EM) - 0.25) < 1e-9, 'target at 4·EM → 0.25 (far targets decay, not grow)');
}

// ---- V5.1 §1.3: IV-mispricing multiplier ----
console.log('§1.3 IV-mispricing multiplier');
{
  const K = DEFAULT_V5_CONFIG.IV_PEN_K, F = DEFAULT_V5_CONFIG.IV_PEN_FLOOR;
  ok(mispricingMultiplier(0.20, 0.20, K, F) === 1, 'mid_iv == FairIV → 1.0');
  ok(Math.abs(mispricingMultiplier(0.40, 0.20, K, F) - Math.max(1 - K, F)) < 1e-9, 'mid_iv = 2·FairIV → clamp(1-K, FLOOR, 1) = 0.5');
  ok(mispricingMultiplier(0.10, 0.20, K, F) === 1, 'cheap contract NOT rewarded (multiplier 1, not >1)');
}

// ---- V5.1 §1.4: dominance no-NaN when total chain volume is 0 ----
console.log('§1.4 Strike Dominance — no NaN at zero total volume');
{
  const res = rankContracts({ direction: 'bullish', spot: 100, dteDays: 5, dataSource: 'SIMULATED', emaTargets: EMAS, totalChainVolume: 0, chain: [mk({})] });
  ok(isFinite(res[0].liquidityScore), 'liquidityScore finite when totalChainVolume === 0');
}

// ---- V5.1 §2: migration uses SHARE (raising total chain volume lowers positioning) ----
console.log('§2 Volume-share migration (removes the close ramp)');
{
  const store = new SnapshotStore();
  const cfg = { LOOKBACK_BARS: 1 };
  const inp = (total: number) => ({ direction: 'bullish' as const, spot: 100, dteDays: 5, dataSource: 'LIVE' as const, emaTargets: EMAS, chain: [mk({ volume: 500 })], totalChainVolume: total, store, config: cfg });
  const scan1 = rankContracts(inp(10000))[0];   // records volShare = 0.05, migration neutral (no prior)
  const scan2 = rankContracts(inp(50000))[0];   // same raw volume, bigger chain → volShare 0.01 → migration < 0
  ok(scan1.positioningScore === 50, 'first scan: no prior → migration neutral (positioning 50)');
  ok(scan2.positioningScore < scan1.positioningScore, 'raising total chain volume (share falls) lowers positioning');
}

// ---- Dealer ACCEL_SIGN wired (flip inverts ranking) ----
console.log('Dealer — ACCEL_SIGN flip inverts ranking');
{
  const dealerOnly = { weights: { positioning: 0, dealer: 1, acceleration: 0, emaPath: 0, liquidity: 0 } };
  const A = mk({ symbol: 'AAA', strike: 100, gexStrike: 2e9, dexStrike: 0, vexStrike: 0 });
  const B = mk({ symbol: 'BBB', strike: 200, gexStrike: -2e9, dexStrike: 0, vexStrike: 0 });
  const base = { direction: 'bullish' as const, spot: 150, dteDays: 5, dataSource: 'SIMULATED' as const, emaTargets: EMAS, chain: [A, B] };
  ok(rankContracts({ ...base, config: { ...dealerOnly, ACCEL_SIGN: 1 } })[0].strike === 100, 'ACCEL_SIGN=+1 → strike 100 #1');
  ok(rankContracts({ ...base, config: { ...dealerOnly, ACCEL_SIGN: -1 } })[0].strike === 200, 'ACCEL_SIGN=-1 → ranking inverts');
}

// ---- EMA Path skew adjustment active ----
console.log('EMA Path — skew adjustment active');
{
  const emas2: EmaTargets = { ema5: 106, ema9: 110, ema20: 115, ema50: 125, ema200: 90 };
  const low = mk({ symbol: 'LOW', strike: 106, delta: 0.33, iv: 0.30 });
  const near = mk({ symbol: 'NEAR', strike: 97, delta: 0.58, iv: 0.30 });
  const base = { direction: 'bullish' as const, spot: 100, dteDays: 14, dataSource: 'SIMULATED' as const, emaTargets: emas2, chain: [low, near] };
  const ret = (r: any[], s: string) => r.find((c) => c.symbol === s)!.emaReturns.ema5;
  const skew = rankContracts({ ...base, config: { SPOT_VOL_BETA: -0.012 } });
  const noSkew = rankContracts({ ...base, config: { SPOT_VOL_BETA: 0 } });
  ok((ret(noSkew, 'LOW') - ret(noSkew, 'NEAR')) > (ret(skew, 'LOW') - ret(skew, 'NEAR')), 'beta=0 widens low-delta gap (skew term active)');
}

// ---- V5.1 §3.3: Dealer Stress Index uses geometric mean (no product collapse) ----
console.log('§3.3 Dealer Stress Index — geometric mean');
{
  const stress = dealerStressIndex({ grossGex: 5e9, volExpansionNorm: 1, gammaFlipProximity: 0.001 }, { TRAP_CAP: 0.5, GEX_REF: 5e9 });
  ok(stress > 5 && stress < 25, `one tiny factor → small but non-zero (${stress.toFixed(1)}; raw product would be ~0.1)`);
}

// ---- V5.1 §3.4: Dealer Convexity per-component normalization + Speed greek ----
console.log('§3.4 Dealer Convexity — per-component normalization; Speed present');
{
  const g = calculateAnalyticGreeks(100, 110, 14, 0.25, true) as any;
  ok(isFinite(g.speed) && g.speed !== 0, 'Speed greek present and non-zero');
  const chain = [
    { gamma: 0.02, speed: -0.001, vanna: 0.05, charm: -0.01, oi: 1000 },
    { gamma: 0.015, speed: -0.0008, vanna: 0.04, charm: -0.008, oi: 1500 },
    { gamma: 0.03, speed: -0.002, vanna: 0.06, charm: -0.012, oi: 800 },
  ];
  const c1 = dealerConvexity(chain, 100);
  const scaled = chain.map((x) => ({ ...x, vanna: x.vanna * 1e6 })); // wildly different scale on one greek
  const c2 = dealerConvexity(scaled, 100);
  ok(Math.abs(c1 - c2) < 1, `swapping one Greek's scale barely moves the score (${c1.toFixed(2)} vs ${c2.toFixed(2)}) — proves normalization, not raw sum`);
}

// ---- Stability + breakdown reconciliation ----
console.log('E. Stability + breakdown reconciliation');
{
  const chain = [88, 92, 96, 100, 104, 108].map((s) => mk({ strike: s, oi: 1000 + s, volume: 300 + s }));
  const inp = { direction: 'bullish' as const, spot: 100, dteDays: 5, dataSource: 'SIMULATED' as const, emaTargets: EMAS, chain };
  const r1 = rankContracts(inp); const r2 = rankContracts(inp);
  ok(JSON.stringify(r1.map((c) => [c.strike, c.skyScore])) === JSON.stringify(r2.map((c) => [c.strike, c.skyScore])), 'identical inputs → identical ranking');
  const w = DEFAULT_V5_CONFIG.weights; const t = r1[0];
  const recon = w.positioning * t.positioningScore + w.dealer * t.dealerInfluenceScore + w.acceleration * t.accelerationScore + w.emaPath * t.emaPathScore + w.liquidity * t.liquidityScore;
  ok(Math.abs(recon - t.skyScore) < 0.6, `breakdown reconciles to SkyScore (${recon.toFixed(2)} ≈ ${t.skyScore})`);
}

// ---- V5.1 §3 prerequisite: fallback abstention + dealer-engine routing ----
console.log('§3 Dealer engine — fallback abstention + DEX/VEX exposure + routing');
{
  const mkC = (strike: number, type: 'call' | 'put', gamma = 0.02, oi = 1000) => ({
    strike, type, openInterest: oi, iv: 0.20, bid: 1, ask: 1.05,
    delta: type === 'call' ? 0.5 : -0.5, gamma, vega: 0.1, theta: -0.5, vanna: 0.03, charm: -0.01,
  });
  // All-calls chain → total GEX never crosses zero (no flip) and there is no put wall.
  const callsOnly = [90, 95, 100, 105, 110].map((s) => mkC(s, 'call'));
  const res: any = computeDealerInventory(callsOnly as any, 100, 1, 1);
  ok(res.dexStrikes.length === 5 && res.vexStrikes.length === 5, 'per-strike DEX/VEX exposed on dealer result');
  ok(res.grossGex > 0, 'grossGex exposed on dealer result');
  ok(res.gammaFlipConfident === false, '§3 prereq: no GEX zero-crossing → gammaFlipConfident=false (not fabricated)');
  ok(res.wallsConfident === false, '§3 prereq: no put wall → wallsConfident=false');

  const gexAt = (k: number) => res.gexStrikes.filter((s: any) => s.strike === k).reduce((a: number, s: any) => a + s.gex, 0);
  const sig = computeDealerSignals({
    spot: 100, callWall: res.callWall, putWall: res.putWall, gammaFlipPrice: res.gammaFlipPrice,
    grossGex: res.grossGex, expectedMovePct: res.expectedMovePct,
    gexAtCallWall: gexAt(res.callWall), gexAtPutWall: gexAt(res.putWall),
    wallsConfident: res.wallsConfident, gammaFlipConfident: res.gammaFlipConfident,
    convexityChain: callsOnly.map((c) => ({ gamma: c.gamma, vanna: c.vanna, charm: c.charm, oi: c.openInterest, speed: -0.001 })),
  });
  ok(sig.gammaFlipProximityConfident === false && sig.gammaFlipProximity === 0, 'flip-proximity ABSTAINS when not confident (no spot*0.995 value)');
  ok(sig.dealerTrapConfident === false && sig.dealerTrapScore === 50, 'trap ABSTAINS (neutral 50) when walls not confident');
  ok(isFinite(sig.dealerStressIndex) && isFinite(sig.dealerConvexity), 'stress + convexity finite even on the abstaining path');
}

// ---- V5.1 §3.5 prerequisite: gated decision/size coupling (DEFAULT OFF) ----
console.log('§3.5 Dealer coupling — gated veto + stress sizing, off by default');
{
  const mkSig = (p: Partial<DealerSignals>): DealerSignals => ({
    dealerTrapScore: 0, dealerTrapConfident: true,
    gammaFlipProximity: 0, gammaFlipProximityConfident: true,
    dealerStressIndex: 0, dealerConvexity: 0,
    ...p,
  });
  const ON = { ...DEFAULT_DEALER_COUPLING, enabled: true };
  const trapAndFlip = mkSig({ dealerTrapScore: 85, gammaFlipProximity: 0.9, dealerStressIndex: 100 });

  // 1. Flag OFF (the shipped default) is a pure passthrough — no veto, no size cut.
  ok(DEFAULT_DEALER_COUPLING.enabled === false, 'coupling ships DISABLED (default behavior unchanged)');
  const off = modulateDecision({ decision: 'BUY', reason: 'base' }, trapAndFlip, DEFAULT_DEALER_COUPLING);
  ok(off.decision === 'BUY' && off.sizeMultiplier === 1 && off.modulated === false,
    'flag OFF → BUY passes through untouched, size 1, not modulated');

  // 2. Flag ON: BUY + high trap + near flip (both confident) → downgraded to WAIT.
  const veto = modulateDecision({ decision: 'BUY', reason: 'base' }, trapAndFlip, ON);
  ok(veto.decision === 'WAIT' && veto.modulated === true, 'ON: caged + near-flip vetoes a fresh BUY → WAIT');
  ok(veto.reason.includes('base') && veto.reason.includes('Dealer veto'), 'veto reason preserves the original gate reason and is auditable');

  // 3. Veto requires BOTH conditions AND confidence — abstention is respected.
  ok(modulateDecision({ decision: 'BUY', reason: 'b' }, mkSig({ dealerTrapScore: 85, gammaFlipProximity: 0.9, dealerTrapConfident: false }), ON).decision === 'BUY',
    'no veto when the trap signal is not confident (fabricated walls)');
  ok(modulateDecision({ decision: 'BUY', reason: 'b' }, mkSig({ dealerTrapScore: 85, gammaFlipProximity: 0.9, gammaFlipProximityConfident: false }), ON).decision === 'BUY',
    'no veto when the flip signal is not confident (fabricated flip)');
  ok(modulateDecision({ decision: 'BUY', reason: 'b' }, mkSig({ dealerTrapScore: 85, gammaFlipProximity: 0.2 }), ON).decision === 'BUY',
    'no veto when high trap but NOT near the flip');

  // 4. Only fresh BUYs are gated — existing-position states pass through.
  ok(modulateDecision({ decision: 'HOLD', reason: 'h' }, trapAndFlip, ON).decision === 'HOLD',
    'HOLD is never vetoed (only fresh BUY is gated)');

  // 5. Size reduces monotonically with dealer stress, clamped to [sizeFloor, 1].
  const sLow = modulateDecision({ decision: 'WAIT', reason: 'w' }, mkSig({ dealerStressIndex: 0 }), ON).sizeMultiplier;
  const sMid = modulateDecision({ decision: 'WAIT', reason: 'w' }, mkSig({ dealerStressIndex: 50 }), ON).sizeMultiplier;
  const sHigh = modulateDecision({ decision: 'WAIT', reason: 'w' }, mkSig({ dealerStressIndex: 100 }), ON).sizeMultiplier;
  ok(sLow === 1, 'zero stress → full size (multiplier 1)');
  ok(sMid < sLow && sHigh < sMid, 'higher dealer stress monotonically reduces size');
  ok(sHigh >= ON.sizeFloor - 1e-9, 'size never trims below the configured floor');

  // 6. Size multiplier can only ever trim (never amplifies above 1), even with an aggressive K.
  const aggressive = { ...ON, stressSizeK: 5 };
  const clamped = modulateDecision({ decision: 'BUY', reason: 'b' }, mkSig({ dealerStressIndex: 100 }), aggressive).sizeMultiplier;
  ok(clamped >= aggressive.sizeFloor - 1e-9 && clamped <= 1, 'size multiplier stays inside [floor, 1] under an aggressive K');
}

console.log(`\n--- V5.1 SUITE PASSED: ${passed} assertions ---`);
