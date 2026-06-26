/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Correctness tests for src/lib/indicators.ts. Hand-computed reference values for the
 * verifiable indicators + invariants (alignment, finiteness, bounded ranges) for all of
 * them. "Lock the math" before anything renders it.
 */
import assert from 'assert';
import * as I from '../src/lib/indicators';

console.log('--- RUNNING INDICATOR TEST SUITE ---');
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

function testKnownValues() {
  console.log('Testing hand-computed reference values...');
  assert.deepStrictEqual(I.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4], 'sma');

  const e = I.ema([1, 2, 3, 4, 5, 6], 3); // seed=2@idx2, k=0.5 → 2,3,4,5
  assert(e[2] === 2 && e[3] === 3 && e[4] === 4 && e[5] === 5, 'ema ' + JSON.stringify(e));

  assert(approx(I.wma([1, 2, 3], 3)[2] as number, 14 / 6), 'wma');

  // Wilder RSI hand case: closes [10,11,10,11], period 2 → [_,_,50,75]
  assert.deepStrictEqual(I.rsi([10, 11, 10, 11], 2), [null, null, 50, 75], 'rsi hand case');

  const inc = Array.from({ length: 16 }, (_, i) => i + 1);
  assert(I.rsi(inc, 14).slice(-1)[0] === 100, 'rsi all-up = 100');
  assert(I.rsi(inc.slice().reverse(), 14).slice(-1)[0] === 0, 'rsi all-down = 0');

  assert.deepStrictEqual(I.obv([10, 11, 10, 12], [100, 200, 300, 400]), [0, 200, -100, 300], 'obv');

  const r = I.roc([10, 11, 12], 1);
  assert(r[0] === null && approx(r[1] as number, 10) && approx(r[2] as number, 100 / 11), 'roc');

  assert.deepStrictEqual(I.momentum([10, 11, 13], 1), [null, 1, 2], 'momentum');
}

function testConstructedOHLC() {
  console.log('Testing constructed OHLC cases (Williams %R, Stochastic, Bollinger, ATR)...');
  const high = [20, 20, 20], low = [10, 10, 10], close = [12, 18, 15];
  // %R at i2: (20-15)/(20-10)*-100 = -50 ; %K: (15-10)/(20-10)*100 = 50
  assert(approx(I.williamsR(high, low, close, 3)[2] as number, -50), 'williamsR');
  assert(approx(I.stochastic(high, low, close, 3, 1).k[2] as number, 50), 'stochastic %K');

  const flat = [5, 5, 5, 5, 5]; // σ=0 → bands collapse to the mean
  const bb = I.bollingerBands(flat, 3, 2);
  assert(bb.upper[4] === 5 && bb.middle[4] === 5 && bb.lower[4] === 5, 'bollinger flat');

  // ATR period 2 over TR=[2,3,2,3] → [_,2.5,2.25,2.625]
  const a = I.atr([10, 12, 11, 13], [8, 9, 9, 10], [9, 11, 10, 12], 2);
  assert(a[0] === null && approx(a[1] as number, 2.5) && approx(a[2] as number, 2.25) && approx(a[3] as number, 2.625), 'atr ' + JSON.stringify(a));
}

function testMACD() {
  console.log('Testing MACD identity (macd = ema12 - ema26)...');
  const close = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.1);
  const m = I.macd(close);
  const ef = I.ema(close, 12), es = I.ema(close, 26);
  const i = close.length - 1;
  assert(approx(m.macd[i] as number, (ef[i] as number) - (es[i] as number)), 'macd identity');
  assert(approx(m.histogram[i] as number, (m.macd[i] as number) - (m.signal[i] as number)), 'macd histogram');
}

function testInvariants() {
  console.log('Testing alignment / finiteness / range invariants on a 120-bar series...');
  const n = 120;
  const open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const c = 100 + Math.sin(i / 7) * 8 + i * 0.05 + (((i * 37) % 5) - 2) * 0.3;
    const o = p, hi = Math.max(o, c) + 1, lo = Math.min(o, c) - 1;
    p = c;
    open.push(o); high.push(hi); low.push(lo); close.push(c); volume.push(1000 + ((i * 53) % 400));
  }
  const ok = (v: I.Num[], name: string) => {
    assert(v.length === n, `${name} length ${v.length} != ${n}`);
    v.forEach(x => { if (x != null) assert(Number.isFinite(x), `${name} non-finite`); });
  };
  ok(I.sma(close, 20), 'sma'); ok(I.ema(close, 20), 'ema'); ok(I.wma(close, 20), 'wma');
  ok(I.vwap(high, low, close, volume), 'vwap'); ok(I.rsi(close), 'rsi'); ok(I.roc(close), 'roc');
  ok(I.momentum(close), 'momentum'); ok(I.cci(high, low, close), 'cci'); ok(I.williamsR(high, low, close), 'williamsR');
  ok(I.mfi(high, low, close, volume), 'mfi'); ok(I.trix(close), 'trix'); ok(I.atr(high, low, close), 'atr');
  ok(I.obv(close, volume), 'obv'); ok(I.cmf(high, low, close, volume), 'cmf'); ok(I.accumDist(high, low, close, volume), 'accumDist');
  ok(I.parabolicSAR(high, low), 'psar'); ok(I.stdDev(close, 20), 'stdDev');
  const m = I.macd(close); ok(m.macd, 'macd'); ok(m.signal, 'signal'); ok(m.histogram, 'hist');
  const bb = I.bollingerBands(close); ok(bb.upper, 'bbU'); ok(bb.middle, 'bbM'); ok(bb.lower, 'bbL');
  const st = I.stochastic(high, low, close); ok(st.k, 'stochK'); ok(st.d, 'stochD');
  const ad = I.adx(high, low, close); ok(ad.adx, 'adx'); ok(ad.plusDI, '+DI'); ok(ad.minusDI, '-DI');
  const kc = I.keltnerChannels(high, low, close); ok(kc.upper, 'kcU'); ok(kc.middle, 'kcM'); ok(kc.lower, 'kcL');
  const dc = I.donchianChannels(high, low); ok(dc.upper, 'dcU'); ok(dc.middle, 'dcM'); ok(dc.lower, 'dcL');
  const ich = I.ichimoku(high, low, close); ok(ich.tenkan, 'tenkan'); ok(ich.kijun, 'kijun'); ok(ich.senkouA, 'senkouA'); ok(ich.senkouB, 'senkouB');
  const stt = I.superTrend(high, low, close); ok(stt.trend, 'superTrend');

  // Bounded-range guarantees
  I.rsi(close).forEach(x => { if (x != null) assert(x >= 0 && x <= 100, 'rsi range'); });
  I.mfi(high, low, close, volume).forEach(x => { if (x != null) assert(x >= 0 && x <= 100, 'mfi range'); });
  I.williamsR(high, low, close).forEach(x => { if (x != null) assert(x >= -100 && x <= 0, 'wr range'); });
  st.k.forEach(x => { if (x != null) assert(x >= 0 && x <= 100, 'stoch range'); });
  ad.adx.forEach(x => { if (x != null) assert(x >= 0 && x <= 100, 'adx range'); });
  // Bollinger/Keltner/Donchian band ordering: lower <= middle <= upper
  for (let i = 0; i < n; i++) {
    if (bb.lower[i] != null) assert((bb.lower[i] as number) <= (bb.middle[i] as number) + 1e-9 && (bb.middle[i] as number) <= (bb.upper[i] as number) + 1e-9, 'bb ordering');
    if (dc.lower[i] != null) assert((dc.lower[i] as number) <= (dc.upper[i] as number) + 1e-9, 'donchian ordering');
  }
}

function testExtended() {
  console.log('Testing extended set (HMA/VWMA/Aroon/StochRSI/TSI/UO/AO/LinReg/Fisher/Pivots/Fib/…)...');

  // VWMA: equal volume collapses to SMA; weighted case is hand-computable
  assert.deepStrictEqual(I.vwma([1, 2, 3], [1, 1, 1], 3), [null, null, 2], 'vwma==sma when flat volume');
  assert(approx(I.vwma([1, 2, 3], [1, 2, 3], 3)[2] as number, 14 / 6), 'vwma weighted');

  // Volume ROC mirrors price ROC math
  const vr = I.vroc([10, 11, 12], 1);
  assert(vr[0] === null && approx(vr[1] as number, 10) && approx(vr[2] as number, 100 / 11), 'vroc');

  // Aroon on a strictly rising series: newest bar is the high → Up=100, Down=0
  const incH = Array.from({ length: 8 }, (_, i) => i + 1);
  const ar = I.aroon(incH, incH, 5);
  assert(ar.up[7] === 100 && ar.down[7] === 0 && ar.oscillator[7] === 100, 'aroon rising');

  // Linear regression of a perfect line y=2x+1 → slope 2, endpoint = last y
  const lr = I.linearRegression([1, 3, 5, 7, 9], 5);
  assert(approx(lr.slope[4] as number, 2) && approx(lr.value[4] as number, 9), 'linreg perfect line');
  // Standard error bands collapse onto the line when residuals are zero
  const seb = I.standardErrorBands([1, 3, 5, 7, 9], 5, 2);
  assert(approx(seb.upper[4] as number, 9) && approx(seb.lower[4] as number, 9), 'std-error bands zero residual');

  // Pivot points — classic hand case
  const pp = I.pivotPoints(110, 90, 100);
  assert(pp.p === 100 && pp.r1 === 110 && pp.s1 === 90 && pp.r2 === 120 && pp.s2 === 80 && pp.r3 === 130 && pp.s3 === 70, 'pivots');

  // Fibonacci retracement endpoints + midpoint
  const fib = I.fibonacciRetracement(100, 0);
  assert(fib[0].price === 100 && fib[6].price === 0 && approx(fib[3].price, 50) && approx(fib[1].price, 76.4), 'fib levels');

  // NVI/PVI only move on the matching volume direction
  const nv = I.nvi([100, 110, 121], [50, 40, 60]); // bar1 vol↓ → +10%; bar2 vol↑ → unchanged
  assert(approx(nv[0] as number, 1000) && approx(nv[1] as number, 1100) && approx(nv[2] as number, 1100), 'nvi');
  const pv = I.pvi([100, 110, 121], [50, 60, 40]); // bar1 vol↑ → +10%; bar2 vol↓ → unchanged
  assert(approx(pv[0] as number, 1000) && approx(pv[1] as number, 1100) && approx(pv[2] as number, 1100), 'pvi');

  // Historical volatility of a constant series is exactly 0
  I.historicalVolatility([100, 100, 100, 100, 100], 3).forEach(x => { if (x != null) assert(x === 0, 'hv flat=0'); });

  // Invariants / bounded ranges on a 120-bar OHLCV series
  const n = 120;
  const open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const c = 100 + Math.sin(i / 6) * 7 + i * 0.04 + (((i * 29) % 7) - 3) * 0.25;
    const o = p, hi = Math.max(o, c) + 1.2, lo = Math.min(o, c) - 1.2;
    p = c; open.push(o); high.push(hi); low.push(lo); close.push(c); volume.push(1000 + ((i * 71) % 500));
  }
  const fin = (v: I.Num[], name: string) => { assert(v.length === n, `${name} length`); v.forEach(x => { if (x != null) assert(Number.isFinite(x), `${name} non-finite`); }); };
  const bounded = (v: I.Num[], lo: number, hi: number, name: string) => v.forEach(x => { if (x != null) assert(x >= lo - 1e-9 && x <= hi + 1e-9, `${name} out of [${lo},${hi}]`); });

  fin(I.hma(close, 16), 'hma'); fin(I.vwma(close, volume, 20), 'vwma'); fin(I.mcginleyDynamic(close, 14), 'mcginley');
  const arr = I.aroon(high, low, 25); fin(arr.up, 'aroonUp'); bounded(arr.up, 0, 100, 'aroonUp'); bounded(arr.down, 0, 100, 'aroonDown'); bounded(arr.oscillator, -100, 100, 'aroonOsc');
  const sr = I.stochRsi(close); fin(sr.k, 'stochRsiK'); bounded(sr.k, 0, 100, 'stochRsiK'); bounded(sr.d, 0, 100, 'stochRsiD');
  const ts = I.tsi(close); fin(ts.tsi, 'tsi'); bounded(ts.tsi, -100, 100, 'tsi');
  bounded(I.ultimateOscillator(high, low, close), 0, 100, 'uo'); fin(I.ultimateOscillator(high, low, close), 'uo');
  fin(I.awesomeOscillator(high, low), 'ao'); fin(I.dpo(close, 20), 'dpo');
  I.historicalVolatility(close, 20).forEach(x => { if (x != null) assert(x >= 0, 'hv>=0'); });
  fin(I.chaikinVolatility(high, low, 10), 'chaikinVol'); fin(I.easeOfMovement(high, low, volume, 14), 'evm');
  fin(I.nvi(close, volume), 'nvi'); fin(I.pvi(close, volume), 'pvi'); fin(I.vroc(volume, 14), 'vroc');
  const ft = I.fisherTransform(high, low, 9); fin(ft.fisher, 'fisher'); fin(ft.trigger, 'fisherTrigger');
  const sebb = I.standardErrorBands(close, 20, 2);
  for (let i = 0; i < n; i++) if (sebb.lower[i] != null) assert((sebb.lower[i] as number) <= (sebb.upper[i] as number) + 1e-9, 'std-error band ordering');
  const sq = I.ttmSqueeze(high, low, close, 20); assert(sq.squeezeOn.length === n, 'ttm squeeze length'); fin(sq.momentum, 'ttm momentum');
  assert(I.hma(close, 16).filter(x => x != null).length > 0, 'hma produces values');
}

testKnownValues();
testConstructedOHLC();
testMACD();
testInvariants();
testExtended();
console.log('🎉 ALL INDICATOR TESTS PASSED! 🎉');
