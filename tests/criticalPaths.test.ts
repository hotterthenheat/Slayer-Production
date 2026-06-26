/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Critical-path regression tests for the security + self-learning fixes that gate
 * launch. These functions had NO test coverage and silently breaking any of them
 * would re-open a real hole:
 *   - calibrateIsotonicLoss  → the self-learning loop (must stay dormant cold, learn warm)
 *   - signCookieValue / verifyAndExtractCookieValue → session + 2FA pre-auth-token integrity
 *   - verifyTOTP             → login 2FA
 */
import assert from 'assert';
import crypto from 'crypto';
import { calibrateIsotonicLoss } from '../src/lib/v11Math';
import { signCookieValue, verifyAndExtractCookieValue, verifyTOTP } from '../src/server/auth';

console.log('--- RUNNING CRITICAL-PATH TEST SUITE ---');

// 1. Self-learning calibration: dormant below the 200-sample cold-start threshold,
//    active (pulls toward the observed win-rate) at/above it. Guards the A1 wiring so a
//    future change can't silently make the model "learn" from too little data, or stop
//    learning entirely.
function testCalibrationColdStartAndActivation() {
  console.log('Testing isotonic calibration cold-start + activation...');
  const few = Array.from({ length: 50 }, () => ({ pred: 0.7, win: 1 }));
  assert.strictEqual(calibrateIsotonicLoss(0.7, few), 0.7, 'cold-start (<200) must return pHat unchanged');

  const many = Array.from({ length: 300 }, (_, i) => ({ pred: 0.7, win: i < 90 ? 1 : 0 })); // 30% real win-rate
  const active = calibrateIsotonicLoss(0.7, many);
  assert.ok(active < 0.6, `active calibration must pull 0.70 toward observed 0.30 (got ${active})`);
  assert.ok(active >= 0 && active <= 1, 'calibrated probability must stay in [0,1]');
  console.log(`  ✔ cold-start unchanged (0.7); active pulled to ${active.toFixed(3)}`);
}

// 2. Signed-cookie / pre-auth-token integrity. Underpins both the httpOnly session cookie
//    and the 2FA pre-auth token — if a tampered value ever verified, an attacker could
//    forge either.
function testSignedValueRoundTripAndTamper() {
  console.log('Testing signed-value HMAC round-trip + tamper rejection...');
  const payload = JSON.stringify({ email: 'u@example.com', exp: 9999999999999, stage: 'pre2fa' });
  const signed = signCookieValue(payload);
  assert.strictEqual(verifyAndExtractCookieValue(signed), payload, 'valid signed value must round-trip');

  const last = signed[signed.length - 1];
  const tampered = signed.slice(0, -1) + (last === '0' ? '1' : '0'); // flip one signature char
  assert.strictEqual(verifyAndExtractCookieValue(tampered), null, 'tampered signature must be rejected');
  assert.strictEqual(verifyAndExtractCookieValue('garbage.notsigned'), null, 'malformed value must be rejected');
  console.log('  ✔ round-trip ok; tampered + malformed rejected');
}

// 3. TOTP verification (login 2FA). Generate a code with the same RFC-6238 routine the
//    server verifies against, then confirm accept (current window) + reject
//    (out-of-window / malformed).
function generateTOTP(secretBase32: string, driftWindows = 0): string {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secretBase32) {
    const val = base32chars.indexOf(ch.toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.substring(i, i + 8), 2));
  const secretBuffer = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30) + driftWindows;
  const buffer = Buffer.alloc(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) { buffer[i] = temp & 0xff; temp = Math.floor(temp / 256); }
  const digest = crypto.createHmac('sha1', secretBuffer).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = ((digest[offset] & 0x7f) << 24 | (digest[offset + 1] & 0xff) << 16 | (digest[offset + 2] & 0xff) << 8 | (digest[offset + 3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}

function testTotpAcceptAndReject() {
  console.log('Testing TOTP accept (current window) + reject (out-of-window / malformed)...');
  const secret = 'JBSWY3DPEHPK3PXP'; // valid base32 test secret
  assert.strictEqual(verifyTOTP(secret, generateTOTP(secret)), true, 'current-window code must verify');
  assert.strictEqual(verifyTOTP(secret, generateTOTP(secret, 1000)), false, 'far-out-of-window code must fail');
  assert.strictEqual(verifyTOTP(secret, 'abcdef'), false, 'non-numeric must fail');
  assert.strictEqual(verifyTOTP(secret, '12345'), false, 'wrong-length must fail');
  console.log('  ✔ valid code accepted; out-of-window + malformed rejected');
}

testCalibrationColdStartAndActivation();
testSignedValueRoundTripAndTamper();
testTotpAcceptAndReject();

console.log('🎉 ALL CRITICAL-PATH TESTS PASSED! 🎉');
