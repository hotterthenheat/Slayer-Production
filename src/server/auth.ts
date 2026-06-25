/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authentication & user-persistence core for the Slayer Terminal backend:
 * signed session cookies, the active-session registry, Postgres-backed user
 * CRUD (Drizzle), TOTP 2FA verification (timing-safe + throttled), and the
 * small auth helper utilities. No external auth provider or API key required.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db as pgDb } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq, sql } from 'drizzle-orm';

const FALLBACK_FILE = path.join(process.cwd(), 'users-fallback.json');
const useFallbackDb = !process.env.SQL_HOST;

interface FallbackUser {
  id: number;
  uid: string;
  email: string;
  version: number;
  tokens: number;
  fullProfile: string;
}

function loadFallbackUsers(): FallbackUser[] {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      return JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading fallback users:', e);
  }
  return [];
}

function saveFallbackUsers(usersList: FallbackUser[]) {
  try {
    // Atomic write: serialize to a temp file then rename over the target. rename(2)
    // is atomic on POSIX, so a crash mid-write can never leave a truncated/corrupt
    // users file — readers always see either the old or the fully-written new file.
    const tmp = `${FALLBACK_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(usersList, null, 2), 'utf8');
    fs.renameSync(tmp, FALLBACK_FILE);
  } catch (e) {
    console.error('Error saving fallback users:', e);
  }
}

// ============================================================
// Signed session cookies (HMAC-SHA256, timing-safe verify)
// ============================================================
export const COOKIE_SECRET =
  process.env.COOKIE_SECRET ||
  (() => {
    console.warn(
      '[security] COOKIE_SECRET is not set — generating an ephemeral random secret. ' +
        'Sessions will be invalidated on restart. Set COOKIE_SECRET in production.',
    );
    return crypto.randomBytes(32).toString('hex');
  })();

export function signCookieValue(value: string): string {
  const base64Value = Buffer.from(value).toString('base64url');
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET).update(base64Value).digest('hex');
  return `${base64Value}.${hmac}`;
}

export function verifyAndExtractCookieValue(signedValue: string): string | null {
  const lastDotIndex = signedValue.lastIndexOf('.');
  if (lastDotIndex === -1) return null;
  const base64Value = signedValue.substring(0, lastDotIndex);
  const hmac = signedValue.substring(lastDotIndex + 1);
  const expectedHmac = crypto.createHmac('sha256', COOKIE_SECRET).update(base64Value).digest('hex');

  // Timing-safe equality to prevent timing attacks.
  const hmacBuf = Buffer.from(hmac);
  const expectedBuf = Buffer.from(expectedHmac);
  if (hmacBuf.length !== expectedBuf.length) return null;
  if (crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
    return Buffer.from(base64Value, 'base64url').toString('utf8');
  }
  return null;
}

// ============================================================
// Active sessions & presence
// ============================================================
export interface ActiveSession {
  session_id: string;
  user_id: string;
  email: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  last_active: Date;
  terminated: boolean;
}

export const activeSessionsDb = new Map<string, ActiveSession>();
export const REDIS_PRESENCE = new Map<string, NodeJS.Timeout>();

// Durable session-revocation watermark: email -> epoch ms. Any session cookie
// issued (iat) BEFORE this time is rejected. Set on revoke-sessions / force-logout
// / ban and persisted to the `moderation` table, so revocation survives restarts
// (the in-memory map is hydrated from the DB on boot). Sync read on the hot path.
export const sessionsValidAfter = new Map<string, number>();
export function getSessionsValidAfter(email: string): number {
  return sessionsValidAfter.get(email.toLowerCase().trim()) || 0;
}
export function setSessionsValidAfterLocal(email: string, ts: number): void {
  sessionsValidAfter.set(email.toLowerCase().trim(), ts);
}

export function updateRedisPresence(email: string) {
  const existing = REDIS_PRESENCE.get(email);
  if (existing) clearTimeout(existing);
  REDIS_PRESENCE.set(email, setTimeout(() => REDIS_PRESENCE.delete(email), 60000));
}

// ============================================================
// User record shape
// ============================================================
export interface UserAccount {
  id: string;
  email: string;
  name: string;
  avatar: string;
  // Canonical access tiers (config.ts TIER_PRICING) + retained legacy aliases so
  // values already persisted in the DB still typecheck. accessTierToLevel() normalizes both.
  access_tier: 'guest' | 'discord' | 'pinpoint' | 'skyvision' | 'lifetime' | 'intraday' | 'quant' | 'enterprise';
  referral_tokens_pool: number;
  custom_referral_code: string;
  // Email of the referrer this account was credited to — set exactly once so a
  // referrer can be credited at most one token per referee (prevents farming via
  // repeated apply-coupon calls).
  referred_by?: string | null;
  selected_font_scale: 'STANDARD' | 'ENHANCED';
  compact_view_enabled: boolean;
  ultrawide_enabled?: boolean;
  workspace_layout?: any;
  selected_theme: 'SLAYER PURE DARK' | 'DEALER FLOW SLATE' | 'VOLATILITY RADAR' | 'CARBON MONITOR MATTE';
  no_refund_policy_logged: boolean;
  active_ip: string | null;
  username?: string;
  cover_photo?: string;
  passwordHash?: string;
  two_factor_secret?: string;
  two_factor_enabled?: boolean;
  backup_codes?: string[];
  deleted_at?: Date | null;
  temp_2fa_secret?: string;
  temp_new_email?: string;
  email_otp?: string;
  email_otp_expiry?: number;
  email_otp_attempts?: number;
  notification_preferences?: {
    email_enabled: boolean;
    sms_enabled: boolean;
    discord_enabled: boolean;
    options_flow_alerts: boolean;
  };
  profile_visibility?: 'public' | 'private' | 'logged_in';
  block_search_indexing?: boolean;
  customer_id?: string;
  payment_method_id?: string;
  cancels_at_period_end?: boolean;
  version?: number;
}

// ============================================================
// Auth helper utilities
// ============================================================
export const validatePasswordStrength = (password: string): string | null => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must contain at least one special character.';
  }
  return null;
};

export const generateDefaultUsername = (email: string): string => {
  let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (base.length < 3) base = base + '_tr';
  if (base.length > 20) base = base.substring(0, 20);
  return base;
};

export function fillDefaultPrivacySettings(user: UserAccount) {
  if (!user.notification_preferences) {
    user.notification_preferences = {
      email_enabled: true,
      sms_enabled: true,
      discord_enabled: true,
      options_flow_alerts: true,
    };
  }
  if (!user.profile_visibility) {
    user.profile_visibility = 'public';
  }
  if (user.block_search_indexing === undefined) {
    user.block_search_indexing = false;
  }
}

/** Strips secret fields from a user record before it is sent to any client. */
export function sanitizeUser(user: any) {
  if (!user || typeof user !== 'object') return user;
  const { passwordHash, two_factor_secret, temp_2fa_secret, backup_codes, email_otp, temp_new_email, ...safe } = user;
  return safe;
}

// ============================================================
// Postgres-backed user CRUD (Drizzle with local JSON fallback)
// ============================================================
export const dbGetUser = async (email: string) => {
  const emailClean = email.toLowerCase().trim();
  if (useFallbackDb) {
    const fallbackUsersList = loadFallbackUsers();
    const found = fallbackUsersList.find(u => u.email === emailClean);
    if (found) {
      try {
        const u = JSON.parse(found.fullProfile || '{}');
        u.version = found.version;
        return u;
      } catch (e) {
        console.error('dbGetUser fallback parsing error:', e);
      }
    }
    return undefined;
  }
  try {
    const res = await pgDb.select().from(users).where(eq(users.email, emailClean));
    if (res.length > 0) {
      const u = JSON.parse(res[0].fullProfile || '{}');
      u.version = res[0].version; // inject DB version here
      return u;
    }
  } catch (e) {
    console.error('dbGetUser error:', e);
  }
  return undefined;
};

export const dbSetUser = async (email: string, userObj: any, expectedVersion?: number) => {
  const e = email.toLowerCase().trim();
  const tokens = userObj.referral_tokens_pool || 0;
  const fp = JSON.stringify(userObj);

  if (useFallbackDb) {
    const fallbackUsersList = loadFallbackUsers();
    const index = fallbackUsersList.findIndex(u => u.email === e);
    if (index >= 0) {
      const current = fallbackUsersList[index];
      if (typeof expectedVersion === 'number' && current.version !== expectedVersion) {
        throw new Error('OCC Conflict: Version mismatch');
      }
      current.fullProfile = fp;
      current.tokens = tokens;
      current.version = current.version + 1;
    } else {
      fallbackUsersList.push({
        id: Math.floor(Math.random() * 1000000) + 1,
        uid: userObj.id || e,
        email: e,
        tokens,
        fullProfile: fp,
        version: 1
      });
    }
    saveFallbackUsers(fallbackUsersList);
    return;
  }

  try {
    if (typeof expectedVersion === 'number') {
      const res = await pgDb.execute(sql`
        UPDATE users
        SET full_profile = ${fp}, tokens = ${tokens}, version = version + 1
        WHERE email = ${e} AND version = ${expectedVersion}
      `);
      if (res.rowCount === 0) throw new Error('OCC Conflict: Version mismatch');
    } else {
      await pgDb.insert(users).values({
        uid: userObj.id || e,
        email: e,
        tokens,
        fullProfile: fp,
        version: 1,
      }).onConflictDoUpdate({
        // Conflict on email (the business key lookups use). Conflicting on uid let
        // two records with the same email but different uid create duplicate rows
        // that dbGetUser-by-email would never reconcile.
        target: users.email,
        set: { fullProfile: fp, tokens, version: sql`users.version + 1` },
      });
    }
  } catch (err) {
    console.error('dbSetUser error:', err);
    throw err;
  }
};

// Persist mutations to an EXISTING user with a single optimistic-concurrency
// retry. Returns true on a committed write, false otherwise.
export async function persistUser(email: string, user: any): Promise<boolean> {
  try {
    await dbSetUser(email, user, user.version);
    if (typeof user.version === 'number') user.version += 1;
    return true;
  } catch (err) {
    // OCC conflict or transient failure: re-read the latest version and retry once.
    try {
      const fresh = await dbGetUser(email);
      if (fresh && typeof fresh.version === 'number') {
        await dbSetUser(email, user, fresh.version);
        user.version = fresh.version + 1;
        return true;
      }
    } catch (retryErr) {
      console.error('persistUser retry failed for', email, retryErr);
    }
    console.error('persistUser failed for', email, err);
    return false;
  }
}

export const dbDeleteUser = async (email: string) => {
  const e = email.toLowerCase().trim();
  if (useFallbackDb) {
    const fallbackUsersList = loadFallbackUsers();
    const filtered = fallbackUsersList.filter(u => u.email !== e);
    saveFallbackUsers(filtered);
    return;
  }
  await pgDb.delete(users).where(eq(users.email, e));
};

export const dbGetAllUsers = async () => {
  if (useFallbackDb) {
    const fallbackUsersList = loadFallbackUsers();
    return fallbackUsersList.map(r => {
      try {
        return JSON.parse(r.fullProfile || '{}');
      } catch {
        return {};
      }
    });
  }
  try {
    const res = await pgDb.select().from(users);
    const out: any[] = [];
    for (const r of res) {
      try {
        out.push(JSON.parse(r.fullProfile || '{}'));
      } catch (parseErr) {
        // Skip a single corrupt row rather than crashing every caller.
        console.error('dbGetAllUsers: skipping unparseable row', r.id, parseErr);
      }
    }
    return out;
  } catch (e) {
    console.error('dbGetAllUsers error:', e);
    return [];
  }
};

export const dbHasUser = async (email: string) => {
  const e = email.toLowerCase().trim();
  if (useFallbackDb) {
    const fallbackUsersList = loadFallbackUsers();
    return fallbackUsersList.some(u => u.email === e);
  }
  try {
    const res = await pgDb.select({ id: users.id }).from(users).where(eq(users.email, e));
    return res.length > 0;
  } catch (e) {
    console.error('dbHasUser error:', e);
    return false;
  }
};

// ============================================================
// Session read/write
// ============================================================
export const getSessionFromCookies = async (cookieHeader?: string) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/slayer_session=([^;]+)/);
  if (!match) return null;
  try {
    const rawVal = decodeURIComponent(match[1]);

    // Attempt decoding twice for a legacy double-encoded cookie.
    let decodedToVerify = rawVal;
    if (decodedToVerify.includes('%')) {
      try { decodedToVerify = decodeURIComponent(decodedToVerify); } catch (e) {}
    }

    const verifiedVal = verifyAndExtractCookieValue(decodedToVerify) || verifyAndExtractCookieValue(rawVal);
    if (!verifiedVal) {
      return null;
    }
    const parsed = JSON.parse(verifiedVal);
    if (parsed && parsed.email) {
      const emailLower = parsed.email.toLowerCase().trim();
      const dbUser = await dbGetUser(emailLower);

      // Hard lockout if soft-deleted.
      if (dbUser && dbUser.deleted_at) {
        return null;
      }

      // Durable session revocation: reject any cookie issued before the user's
      // sessions_valid_after watermark (set on revoke/force-logout/ban). A cookie
      // with no iat is treated as issued at 0, so it is also revoked when a
      // watermark exists. Users with no watermark (sva===0) are unaffected.
      const sva = sessionsValidAfter.get(emailLower) || 0;
      if (sva > 0 && (Number(parsed.iat) || 0) < sva) {
        return null;
      }

      if (!parsed.session_id) {
        // Legacy/transient cookie with no tracked session id. Assign an
        // ephemeral id for this request only — do NOT persist it (it is never
        // written back to the cookie, so storing each would grow the registry
        // without bound and flood the user's session list with phantoms).
        parsed.session_id = `sess-auto-${crypto.randomBytes(12).toString('hex')}`;
      } else {
        const dbSess = activeSessionsDb.get(parsed.session_id);
        if (dbSess) {
          if (dbSess.terminated) {
            return null; // Session is terminated/revoked.
          }
          dbSess.last_active = new Date();
        } else {
          activeSessionsDb.set(parsed.session_id, {
            session_id: parsed.session_id,
            user_id: dbUser ? dbUser.id : 'usr-sandbox',
            email: emailLower,
            ip_address: '127.0.0.1',
            user_agent: 'Session Restore',
            created_at: new Date(Date.now() - 3600 * 1000),
            last_active: new Date(),
            terminated: false,
          });
        }
      }
    }
    return parsed;
  } catch {
    return null;
  }
};

export async function setSessionCookie(res: any, userSession: any, req: any) {
  if (userSession && userSession.email) {
    const emailLower = userSession.email.toLowerCase().trim();
    const dbUser = await dbGetUser(emailLower);
    const userId = dbUser ? dbUser.id : `usr-${Math.random().toString(36).substring(2, 10)}`;

    if (!userSession.session_id) {
      // CSPRNG session id (the revocation key in activeSessionsDb). The cookie is
      // HMAC-signed regardless, but a strong id avoids collisions/guessing of the
      // session-list/revoke registry key.
      userSession.session_id = `sess-${crypto.randomBytes(16).toString('hex')}`;
    }
    userSession.user_id = userId;

    // Track in activeSessionsDb.
    const rawIp = req ? (req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
    const ip = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
    const ua = req ? (req.headers['user-agent'] || 'Mozilla/5.0') : 'Mozilla/5.0';

    activeSessionsDb.set(userSession.session_id, {
      session_id: userSession.session_id,
      user_id: userId,
      email: emailLower,
      ip_address: ip,
      user_agent: String(ua),
      created_at: new Date(),
      last_active: new Date(),
      terminated: false,
    });
  }
  // Stamp issued-at so the durable session-revocation watermark can invalidate
  // cookies minted before a revoke/force-logout/ban.
  userSession.iat = Date.now();
  const serializedSession = JSON.stringify(userSession);
  const signedSession = signCookieValue(serializedSession);

  res.cookie('slayer_session', signedSession, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 3600 * 24 * 7 * 1000, // 7 days
  });
}

// ============================================================
// TOTP 2FA — timing-safe verification + per-account throttling
// ============================================================
export function verifyTOTP(secretBase32: string, token: string): boolean {
  try {
    const tokenStr = String(token || '').trim();
    if (!/^\d{6}$/.test(tokenStr)) return false; // only ever compare a well-formed 6-digit code

    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (let i = 0; i < secretBase32.length; i++) {
      const val = base32chars.indexOf(secretBase32[i].toUpperCase());
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    const secretBuffer = Buffer.from(bytes);

    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30);
    const tokenBuf = Buffer.from(tokenStr);

    for (let drift = -1; drift <= 1; drift++) {
      const c = counter + drift;
      const buffer = Buffer.alloc(8);
      let temp = c;
      for (let i = 7; i >= 0; i--) {
        buffer[i] = temp & 0xff;
        temp = Math.floor(temp / 256);
      }

      const hmac = crypto.createHmac('sha1', secretBuffer);
      hmac.update(buffer);
      const digest = hmac.digest();
      const offset = digest[digest.length - 1] & 0xf;
      const code = (
        (digest[offset] & 0x7f) << 24 |
        (digest[offset + 1] & 0xff) << 16 |
        (digest[offset + 2] & 0xff) << 8 |
        (digest[offset + 3] & 0xff)
      ) % 1000000;

      const formatted = String(code).padStart(6, '0');
      const candidateBuf = Buffer.from(formatted);
      // Constant-time compare (equal length guaranteed: both are 6 ASCII digits).
      if (candidateBuf.length === tokenBuf.length && crypto.timingSafeEqual(candidateBuf, tokenBuf)) {
        return true;
      }
    }
  } catch (error) {
    console.error('Error verifying TOTP:', error);
  }
  return false;
}

const totpAttempts = new Map<string, { count: number; lockedUntil: number }>();
const TOTP_MAX_ATTEMPTS = 5;
const TOTP_LOCK_MS = 5 * 60 * 1000;

/** Remaining lockout in ms (0 when not locked). */
export function totpLockRemainingMs(email: string): number {
  const rec = totpAttempts.get(email.toLowerCase().trim());
  if (rec && rec.lockedUntil > Date.now()) return rec.lockedUntil - Date.now();
  return 0;
}

export function registerTotpFailure(email: string): void {
  const key = email.toLowerCase().trim();
  const rec = totpAttempts.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= TOTP_MAX_ATTEMPTS) {
    // Escalate the lock with repeated lockouts; do NOT reset count to 0 (that degraded
    // this to a fixed-rate limiter handing out a fresh attempt budget each window with
    // no backoff). A successful verify clears the counter via clearTotpAttempts.
    const overflow = rec.count - TOTP_MAX_ATTEMPTS;
    rec.lockedUntil = Date.now() + TOTP_LOCK_MS * Math.min(8, 1 + overflow);
  }
  totpAttempts.set(key, rec);
}

export function clearTotpAttempts(email: string): void {
  totpAttempts.delete(email.toLowerCase().trim());
}

// --- Per-account login throttling (brute-force defense) ---------------------
// In-memory so a wrong password doesn't write to the DB on every attempt. Mirrors
// the TOTP lockout: N misses → temporary lock. Keyed by email so it can't be
// bypassed by rotating X-Forwarded-For (which the per-IP limiter is vulnerable to).
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_LOCK_MS = 10 * 60 * 1000;

/** Remaining login lockout in ms (0 when not locked). */
export function loginLockRemainingMs(email: string): number {
  const rec = loginAttempts.get(email.toLowerCase().trim());
  if (rec && rec.lockedUntil > Date.now()) return rec.lockedUntil - Date.now();
  return 0;
}

export function registerLoginFailure(email: string): void {
  const key = email.toLowerCase().trim();
  const rec = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    // Escalate the lock with repeated lockouts; do NOT reset count to 0 (that gave a
    // fresh attempt budget each window with no backoff). A successful login clears it.
    const overflow = rec.count - LOGIN_MAX_ATTEMPTS;
    rec.lockedUntil = Date.now() + LOGIN_LOCK_MS * Math.min(8, 1 + overflow);
  }
  loginAttempts.set(key, rec);
}

export function clearLoginAttempts(email: string): void {
  loginAttempts.delete(email.toLowerCase().trim());
}

// ============================================================
// Referral codes (strict [PREFIX]10OFF format, collision-checked)
// ============================================================
export async function generateReferralCode(username: string): Promise<string> {
  const letters = String(username || '').replace(/[^a-zA-Z]/g, '');
  let base = letters.length <= 4 ? letters.toUpperCase() : (letters.slice(0, 2) + letters.slice(-2)).toUpperCase();
  if (!base) base = 'SLAYER';
  // Snapshot existing codes once for collision detection.
  const existingCodes = new Set(
    (await dbGetAllUsers()).map((u) => (u.custom_referral_code || '').toUpperCase()),
  );
  const exists = (code: string) => existingCodes.has(code.toUpperCase());
  let candidate = `${base}10OFF`;
  if (!exists(candidate)) return candidate;
  // Collision resolution: append a random 2-char alphanumeric until unique.
  const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 500; i++) {
    const suffix = ALNUM[Math.floor(Math.random() * 36)] + ALNUM[Math.floor(Math.random() * 36)];
    candidate = `${base}${suffix}10OFF`;
    if (!exists(candidate)) return candidate;
  }
  return `${base}${Date.now().toString(36).toUpperCase()}10OFF`;
}
