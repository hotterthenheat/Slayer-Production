import assert from 'node:assert';
import { buildGexSummary } from '../src/lib/gexSummary';

console.log('Testing GEX plain-English summary…');

// --- Long gamma, price above flip, all signals present ---
const longTxt = buildGexSummary({
  ticker: 'SPX', spot: 7623, decimals: 2, netGex: 1.24e9,
  callWall: 7700, putWall: 7500, gammaFlip: 7600, magnet: 7650, expiryLabel: '0DTE',
  dynamics: { vanna: { hedgeFlow: 'SUPPORTIVE' }, charm: { bias: 'BULLISH' }, migration: { direction: 'STABLE' } },
});
assert.match(longTxt, /net long gamma/);
assert.match(longTxt, /\+\$1\.24B/);
assert.match(longTxt, /above the 7,600 gamma flip/);
assert.match(longTxt, /7,700 call wall caps upside/);
assert.match(longTxt, /7,500 put wall anchors downside/);
assert.match(longTxt, /7,650 is the pin magnet into 0DTE/);
assert.match(longTxt, /[Vv]anna flow is supportive/);
assert.ok(!/migrating/.test(longTxt), 'STABLE migration must be omitted');

// --- Short gamma, price below flip, weekly expiry ---
const shortTxt = buildGexSummary({
  ticker: 'TSLA', spot: 330, decimals: 2, netGex: -1.2e8,
  callWall: 345, putWall: 320, gammaFlip: 340, magnet: 335, expiryLabel: '5DTE',
  dynamics: { charm: { bias: 'BEARISH' }, migration: { direction: 'BEARISH' } },
});
assert.match(shortTxt, /net short gamma/);
assert.match(shortTxt, /-\$120M/);
assert.match(shortTxt, /below the 340 gamma flip/);
assert.match(shortTxt, /into 5DTE/);
assert.match(shortTxt, /downward drift/);
assert.match(shortTxt, /migrating down/);

// --- Missing walls/flip are simply skipped (no '0' rows, no crash) ---
const sparse = buildGexSummary({
  ticker: 'QQQ', spot: 445, decimals: 2, netGex: 0,
  callWall: 0, putWall: 0, gammaFlip: 0, magnet: 0, expiryLabel: '0DTE',
});
assert.match(sparse, /net long gamma/); // 0 ⇒ long side (>= 0)
assert.ok(!/call wall|put wall|gamma flip|pin magnet/.test(sparse), 'zero fields omitted');

// --- Deterministic: identical input ⇒ identical output ---
assert.strictEqual(
  buildGexSummary({ ticker: 'NVDA', spot: 141, decimals: 2, netGex: 5e8, callWall: 145, putWall: 135, gammaFlip: 140, magnet: 142, expiryLabel: '5DTE' }),
  buildGexSummary({ ticker: 'NVDA', spot: 141, decimals: 2, netGex: 5e8, callWall: 145, putWall: 135, gammaFlip: 140, magnet: 142, expiryLabel: '5DTE' }),
);

console.log('✔ regime, flip pivot, walls, magnet, dealer flows, zero-field skips, determinism');
console.log('🎉 ALL GEX SUMMARY TESTS PASSED! 🎉');
