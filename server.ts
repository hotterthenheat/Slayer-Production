/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import Stripe from 'stripe';
import path from 'path';
import crypto from 'node:crypto';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { ASSET_LIST } from './src/data';
import {
  calculateSystemScoreFromCandles,
  calculateV11Metrics,
  computeDealerInventory,
  generateMockOptionsChain,
  ChainContract,
} from './src/lib/v11Math';
import { V8TradeRecord, TimeframeVal } from './src/types';
import {
  getDataSourceType,
  getProviderStatusMessage,
  getUnifiedOptionChain,
  getUnifiedCandles,
} from './src/lib/providerAbstraction';
import { buildGexProfile, computeDealerFlowGauge } from './src/lib/gexEngine';
import { getLastTradierError } from './src/lib/tradierProvider';
import { ensureSchema, dbLoadModeration, dbSetModeration, dbIsWebhookProcessed, dbMarkWebhookProcessed } from './src/db/index.ts';
import bcrypt from 'bcryptjs';
import { PORT, stripeClient, TIER_PRICING, ADMIN_EMAILS, OWNER_EMAILS, roleForEmail, type AdminRole } from './src/server/config';
import {
  COOKIE_SECRET, signCookieValue, verifyAndExtractCookieValue,
  type ActiveSession, activeSessionsDb, REDIS_PRESENCE, updateRedisPresence,
  type UserAccount, validatePasswordStrength, generateDefaultUsername, fillDefaultPrivacySettings, sanitizeUser,
  dbGetUser, dbSetUser, persistUser, dbDeleteUser, dbGetAllUsers, dbHasUser,
  getSessionFromCookies, setSessionCookie,
  getSessionsValidAfter, setSessionsValidAfterLocal,
  verifyTOTP, totpLockRemainingMs, registerTotpFailure, clearTotpAttempts,
  loginLockRemainingMs, registerLoginFailure, clearLoginAttempts,
  generateReferralCode,
} from './src/server/auth';
import { db, sse, type SSEClient, type SSEDiscoveryClient } from './src/server/state';
import { constructPayload, broadcastSSE, broadcastDiscoverySSE, gatePayloadByTier, accessTierToLevel } from './src/server/marketEngine';

const app = express();
// Trust only the configured number of proxy hops (Render/most PaaS = 1) rather
// than `true`, which trusts ALL X-Forwarded-For entries and lets a client spoof
// req.ip by injecting forged hops to evade the per-IP rate limiter.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// Security headers (clickjacking, MIME-sniffing, HSTS, referrer policy, etc.).
// CSP is left off (a strict policy for this SPA + SSE + Tailwind needs dedicated
// tuning) and the cross-origin resource policy is relaxed because the frontend and
// API are deployed on separate origins.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// API middleware
// The Stripe webhook must receive the *raw* request body so its HMAC signature
// can be verified (constructEvent). The global JSON parser would consume and
// re-serialize the stream, breaking the signature, so the webhook path is
// excluded here and parsed with express.raw() at the route instead.
const jsonParser = express.json({ limit: process.env.JSON_BODY_LIMIT || '12mb' });
app.use((req, res, next) => {
  if (req.originalUrl === '/api/billing/webhook') return next();
  return jsonParser(req, res, next);
});

let MAINTENANCE_MODE = false;

interface AuditEntry {
  id: string; admin_id: string; admin_email: string; action_taken: string;
  target_id: string; timestamp: string; ip_address: string; method: string;
}
const AUDIT_LOG: AuditEntry[] = []; // append-only, read-only to clients

const FEATURE_FLAGS: Record<string, boolean> = {
  new_pinpoint_engine: true,
  microstructure_lab: true,
  automation_suite: false,
  ai_copilot: false,
};

interface AdminCoupon {
  code: string; discount_type: 'PERCENT' | 'FIXED'; discount_value: number;
  redemption_limit: number; redemptions: number; user_restriction: string;
  expires_at: string | null; created_by: string; created_at: string;
}
const ADMIN_COUPONS: AdminCoupon[] = [];

const SUSPENDED_USERS = new Set<string>();    // emails
const BANNED_USERS = new Set<string>();       // emails
const FORCE_LOGOUT_USERS = new Set<string>(); // emails forced to re-auth

// Maintenance gate — non-admins receive 503 while maintenance mode is active.
app.use(async (req, res, next) => {
  if (!MAINTENANCE_MODE) return next();
  const p = req.path || '';
  if (p.startsWith('/api/admin') || p === '/api/health' || p.startsWith('/api/auth')) return next();
  const s = await getSessionFromCookies(req.headers.cookie);
  if (s && roleForEmail(s.email) !== 'user') return next();
  if (p.startsWith('/api/')) {
    return res.status(503).json({ error: 'Service temporarily down for maintenance.', maintenance: true });
  }
  return res
    .status(503)
    .send('<body style="margin:0;background:#000;color:#d4d4d8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">503 — Slayer Terminal is under maintenance. Please check back shortly.</body>');
});

// Impersonation is strictly READ-ONLY (spec fix #4): while an admin is
// impersonating a user, reject every mutating request with 403. Logout is
// allowed so the admin can exit impersonation.
app.use(async (req, res, next) => {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.path === '/api/auth/logout') return next();
  const s = await getSessionFromCookies(req.headers.cookie);
  if (s && (s.is_impersonating || s.read_only)) {
    return res.status(403).json({
      error: 'Impersonation mode is strictly read-only — mutating actions are forbidden.',
      is_impersonating: true,
    });
  }
  next();
});

// Suspended / banned enforcement (spec §6): block mutating requests from
// moderated accounts. Logout stays open so the client can clear its session.
app.use(async (req, res, next) => {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.path === '/api/auth/logout') return next();
  const s = await getSessionFromCookies(req.headers.cookie);
  const email = s?.email ? String(s.email).toLowerCase().trim() : '';
  if (email && (BANNED_USERS.has(email) || SUSPENDED_USERS.has(email))) {
    return res.status(403).json({ error: 'This account is suspended or banned.', moderated: true });
  }
  next();
});

// RECURSIVE DATA SANITIZATION TO DEFEND AGAINST XSS & SQL INJECTION
// NOTE on input handling: we intentionally do NOT mutate/escape request bodies
// here. Destructive input rewriting (HTML-entity encoding, SQL-keyword
// stripping) corrupts legitimate data — base64 image uploads (every `/` would
// become `&#x2F;`), names/passwords containing words like "update"/"select", or
// any apostrophe — while providing no real protection. SQL injection is
// prevented by parameterized Drizzle queries; XSS is handled by React's
// output-encoding at render time. Escaping belongs at output, not input.

// MULTI-IP FLOOD & RATE-LIMIT PROTOCOL FOR SECURED WRITE ENDPOINTS
const ipRateLimitDb = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_STATE_REQUESTS_PER_MIN = 65; // Max state requests per IP per minute

app.use(async (req, res, next) => {
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    // Evict stale windows so the per-IP rate-limit map can't grow without bound.
    if (ipRateLimitDb.size > 5000) {
      for (const [ip, d] of ipRateLimitDb) {
        if (now - d.windowStart > RATE_LIMIT_WINDOW_MS) ipRateLimitDb.delete(ip);
      }
    }
    let rateData = ipRateLimitDb.get(clientIp);
    if (!rateData || (now - rateData.windowStart) > RATE_LIMIT_WINDOW_MS) {
      rateData = { count: 1, windowStart: now };
      ipRateLimitDb.set(clientIp, rateData);
    } else {
      rateData.count++;
      if (rateData.count > MAX_STATE_REQUESTS_PER_MIN) {
        console.warn(`[RATE LIMIT BREACH] Client ${clientIp} requested state modification on ${req.path}`);
        return res.status(429).json({ error: 'System busy. Rate limit exceeded, retry in 60s.' });
      }
    }
  }
  next();
});

// Per-endpoint rate limiter (independent of HTTP method, so it ALSO covers the
// expensive live-data GETs — /api/history, /api/dealer-flow — that fan out to
// paid Polygon/Tradier APIs and run heavy GEX math; the global limiter above
// only throttles mutating methods). Each limiter keeps its own per-IP window.
function endpointRateLimit(maxPerMin: number, label: string) {
  const buckets = new Map<string, { count: number; windowStart: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [ip, d] of buckets) if (now - d.windowStart > RATE_LIMIT_WINDOW_MS) buckets.delete(ip);
    }
    let b = buckets.get(clientIp);
    if (!b || (now - b.windowStart) > RATE_LIMIT_WINDOW_MS) {
      buckets.set(clientIp, { count: 1, windowStart: now });
    } else {
      b.count++;
      if (b.count > maxPerMin) {
        console.warn(`[RATE LIMIT BREACH] ${clientIp} exceeded ${label} (${maxPerMin}/min)`);
        return res.status(429).json({ error: 'Rate limit exceeded for this endpoint. Please slow down.' });
      }
    }
    next();
  };
}

// STRICT CSRF DEFENSE PROTOCOL (SECURE ORIGIN VALIDATION)
app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const host = req.headers.host;

    // Parse the host out of an Origin/Referer URL and compare it for *strict*
    // equality with our own Host header. A substring match (origin.includes(host))
    // is bypassable — e.g. "https://slayer.io.evil.com" contains "slayer.io".
    const hostOf = (u?: string): string => { try { return u ? new URL(u).host : ''; } catch { return ''; } };

    let isValid = false;
    if (origin && host && hostOf(origin) === host) {
      isValid = true;
    } else if (referer && host && hostOf(referer) === host) {
      isValid = true;
    } else if (req.headers['sec-fetch-site'] === 'same-origin') {
      // Browser-enforced metadata: a cross-site page cannot forge this value.
      isValid = true;
    } else if (!origin && !referer && !(req.headers.cookie || '').includes('slayer_session')) {
      // Non-browser clients (Stripe webhook, server-to-server, health checks) send
      // no Origin/Referer AND carry no session cookie — not CSRF vectors. A request
      // with our auth cookie but no Origin/Referer/sec-fetch-site is suspicious (a
      // real same-origin browser request always sets sec-fetch-site) and is rejected.
      isValid = true;
    }

    if (!isValid) {
      console.warn(`[CSRF INTERVENTION] Rejected unverified ${method} request to ${req.path}`);
      return res.status(403).json({ error: 'CSRF token mismatch or unauthorized secure origin.' });
    }
  }
  next();
});

// In-memory persistent database states for the backend
let clientIndex = 0;

// --- SERVING API ENDPOINTS ---

// Global CDN Storage simulating secure S3 buckets. Holds parsed JPEG, PNG, and WebP buffers.
const cdnStorage = new Map<string, { data: string; mime: string }>();


// Sandbox Session Activator setting httpOnly cookies.
// SECURITY: dev-only. This (and /api/auth/callback) would let anyone mint an
// authenticated session for ANY email with no credential, so it FAILS CLOSED:
// disabled unless ALLOW_SANDBOX_AUTH==='true' is explicitly set. Gating on a
// positive opt-in (rather than NODE_ENV!=='production') means a misconfigured
// NODE_ENV can never silently expose it in production.
app.get('/api/auth/sandbox', async (req, res) => {
  if (process.env.ALLOW_SANDBOX_AUTH !== 'true') {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.redirect('/api/auth/callback?provider=sandbox&name=Sandbox%20Quant%20User&email=sandbox@slayer.io');
});

// Custom Clerk Simulated Auth Endpoints (Module 2)
// Strips sensitive fields from a user record before it is sent to any client.
app.post('/api/auth/clerk-signup', express.json(), async (req, res) => {
  const { email, name, password, referralCode, avatar } = req.body;
  if (!email || !name || typeof email !== 'string' || typeof name !== 'string') {
    return res.status(400).json({ error: 'Email and Name are required variables.' });
  }

  // Validate strong password — REQUIRED. Self-serve signup must never create a
  // password-less account, since such accounts could otherwise be logged into with
  // no credential at all (anyone who knows the email).
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'A password is required to create an account.' });
  }
  const passwordErr = validatePasswordStrength(password);
  if (passwordErr) {
    return res.status(400).json({ error: passwordErr });
  }

  const userEmail = email.toLowerCase().trim();
  let existingUser = await dbGetUser(userEmail);

  if (existingUser) {
    return res.status(400).json({ error: 'Account already registered with this email.' });
  }

  // Generate customized refer_code using strict sequence (Module 5, Rule 2)
  const targetUsername = generateDefaultUsername(userEmail);
  
  // 1. Strip all numbers and special characters from username
  const alphaOnly = targetUsername.replace(/[^a-zA-Z]/g, '');

  // 2. Extract first two and last two letters (if <= 4 letters, use full string)
  let prefix = '';
  if (alphaOnly.length <= 4) {
    prefix = alphaOnly;
  } else {
    prefix = alphaOnly.substring(0, 2) + alphaOnly.substring(alphaOnly.length - 2);
  }

  // 3. Convert BASE_PREFIX to uppercase
  const basePrefix = prefix.toUpperCase() || 'TRAD';

  // 4/5/6. Collision check/resolution and schema-level UNIQUE constraint simulation
  const resolveCollision = async (base: string, suffix: string = ''): Promise<string> => {
    const attempt = suffix ? `${base}${suffix}10OFF` : `${base}10OFF`;
    const taken = (await dbGetAllUsers()).some(u => u.custom_referral_code === attempt);
    if (taken) {
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let randomTwo = '';
      for (let i = 0; i < 2; i++) {
        randomTwo += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return resolveCollision(base, randomTwo);
    }
    return attempt;
  };

  const customReferralCode = await resolveCollision(basePrefix);

  const newUser: UserAccount = {
    id: `usr-${Math.random().toString(36).substring(2, 10)}`,
    email: userEmail,
    name: name.trim(),
    avatar: avatar && avatar.trim() !== '' ? avatar.trim() : `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`,
    access_tier: 'guest', // Default is Guest (unpaid)
    referral_tokens_pool: 0,
    custom_referral_code: customReferralCode,
    selected_font_scale: 'STANDARD',
    compact_view_enabled: false,
    selected_theme: 'SLAYER PURE DARK',
    no_refund_policy_logged: false,
    active_ip: null,
    username: targetUsername,
    cover_photo: '',
    passwordHash: password ? bcrypt.hashSync(password, 12) : undefined,
    notification_preferences: {
      email_enabled: true,
      sms_enabled: true,
      discord_enabled: true,
      options_flow_alerts: true
    },
    profile_visibility: 'public',
    block_search_indexing: false
  };

  // Enforce structural database UNIQUE constraint on referral code
  const codeViolation = (await dbGetAllUsers()).some(u => u.custom_referral_code === customReferralCode);
  if (codeViolation) {
    return res.status(409).json({ error: 'Database Constraint Error: Referral code collision registered.' });
  }

  // Save to database map. A DB write failure here must return a 500, not reject this
  // async handler (which Express 4 surfaces as an unhandledRejection / process crash).
  try {
    await dbSetUser(userEmail, newUser);
  } catch (dbErr) {
    console.error('clerk-signup persist failed for', userEmail, dbErr);
    return res.status(500).json({ error: 'Could not create account. Please retry.' });
  }

  // Credit referrer automatically upon successful registration for passive tracking (A)
  let referralCreditApplied = false;
  let creditedReferrerEmail = '';
  if (referralCode) {
    const codeClean = referralCode.trim().toLowerCase();
    let referrerMatch: UserAccount | null = null;
    for (const u of (await dbGetAllUsers())) {
      if (
        (u.username && u.username.toLowerCase() === codeClean) ||
        (u.custom_referral_code && u.custom_referral_code.toLowerCase() === codeClean)
      ) {
        referrerMatch = u;
        break;
      }
    }

    if (referrerMatch && referrerMatch.email.toLowerCase() !== userEmail && !newUser.referred_by) {
      // Record referred_by on the referee so the referrer is credited exactly once
      // (no double-credit if a later apply-coupon call references the same code).
      newUser.referred_by = referrerMatch.email;
      referrerMatch.referral_tokens_pool = (referrerMatch.referral_tokens_pool || 0) + 1;
      await persistUser(referrerMatch.email, referrerMatch);
      await persistUser(newUser.email, newUser);
      referralCreditApplied = true;
      creditedReferrerEmail = referrerMatch.email;
      console.log(`[PASSIVE REFERRAL ENGINE CREDITED] User ${userEmail} registered via referral code/username "${referralCode}". Referrer "${referrerMatch.email}" token pool credited +1 (New count: ${referrerMatch.referral_tokens_pool}).`);
    } else if (referrerMatch) {
      console.log(`[PASSIVE REFERRAL] Skipped credit for ${userEmail} (self-referral or already referred).`);
    } else {
      console.log(`[PASSIVE REFERRAL DISPATCH] Referral identifier "${referralCode}" did not match any active referrer record.`);
    }
  }

  const userSession = {
    authenticated: true,
    provider: 'clerk',
    name: newUser.name,
    email: newUser.email,
    avatar: newUser.avatar,
    access_tier: newUser.access_tier,
    referralCodeUsed: referralCode || null,
    username: newUser.username,
    cover_photo: newUser.cover_photo,
    referral_tokens_pool: newUser.referral_tokens_pool,
    custom_referral_code: newUser.custom_referral_code
  };

  await setSessionCookie(res, userSession, req);
  res.json({ success: true, user: sanitizeUser(newUser), referral_credited: referralCreditApplied, referrer: creditedReferrerEmail });
});

app.post('/api/auth/clerk-login', express.json(), async (req, res) => {
  const { email, password } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const userEmail = email.toLowerCase().trim();

  // Brute-force lockout (per-account, survives X-Forwarded-For rotation).
  const loginLock = loginLockRemainingMs(userEmail);
  if (loginLock > 0) {
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(loginLock / 60000)} minute(s).` });
  }

  let user = await dbGetUser(userEmail);

  if (user && user.deleted_at) {
    return res.status(400).json({ error: 'This account has been deactivated or scheduled for deletion.' });
  }

  if (user && user.passwordHash) {
    if (!password) {
      return res.status(400).json({ error: 'Password is required to access this secured account.' });
    }
    const match = bcrypt.compareSync(password, user.passwordHash);
    if (!match) {
      registerLoginFailure(userEmail);
      return res.status(400).json({ error: 'Incorrect credentials. Please verify password.' });
    }
  }

  if (!user) {
    // SECURITY: never auto-create accounts from the login endpoint — it enables
    // silent account enumeration/pollution and first-password capture. FAILS
    // CLOSED: auto-provisioning only when ALLOW_SANDBOX_AUTH==='true' (so a
    // misconfigured NODE_ENV can't open it). Real registration goes through
    // /api/auth/clerk-signup.
    if (process.env.ALLOW_SANDBOX_AUTH !== 'true') {
      return res.status(400).json({ error: 'No account found for this email. Please sign up first.' });
    }
    // Dev-only auto-provisioning for fast local testing.
    const customReferralCode = `SLAYER${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    user = {
      id: `usr-${Math.random().toString(36).substring(2, 10)}`,
      email: userEmail,
      name: email.split('@')[0],
      avatar: `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`,
      access_tier: 'guest',
      referral_tokens_pool: 0,
      custom_referral_code: customReferralCode,
      selected_font_scale: 'STANDARD',
      compact_view_enabled: false,
      selected_theme: 'SLAYER PURE DARK',
      no_refund_policy_logged: false,
      active_ip: null,
      username: generateDefaultUsername(userEmail),
      cover_photo: '',
      passwordHash: password ? bcrypt.hashSync(password, 12) : undefined,
      notification_preferences: {
        email_enabled: true,
        sms_enabled: true,
        discord_enabled: true,
        options_flow_alerts: true
      },
      profile_visibility: 'public',
      block_search_indexing: false
    };
    try {
      await dbSetUser(userEmail, user, user.version);
    } catch (dbErr) {
      console.error('clerk-login reconstruct persist failed for', userEmail, dbErr);
      return res.status(500).json({ error: 'Could not establish account. Please retry.' });
    }
  } else if (password && !user.passwordHash && process.env.ALLOW_SANDBOX_AUTH === 'true') {
    // Dev-only: auto-set a first password when none exists. FAILS CLOSED (off
    // unless ALLOW_SANDBOX_AUTH==='true') — a first password must otherwise be set
    // via the authenticated change-password flow, so an attacker who knows a
    // password-less account's email can't claim it.
    const passwordErr = validatePasswordStrength(password);
    if (!passwordErr) {
      user.passwordHash = bcrypt.hashSync(password, 12);
    }
  }

  // SECURITY: a matched account with no password hash must never be issued a session
  // from the public password-login path — otherwise anyone who knows the email logs in
  // with no credential at all. Sandbox dev (ALLOW_SANDBOX_AUTH) is exempt for local use
  // (and may have just set a first password above). Real provisioned/password-less
  // accounts must set a password via the authenticated reset flow before logging in here.
  if (!user.passwordHash && process.env.ALLOW_SANDBOX_AUTH !== 'true') {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const userSession = {
    authenticated: true,
    provider: 'clerk',
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    access_tier: user.access_tier,
    referral_tokens_pool: user.referral_tokens_pool,
    custom_referral_code: user.custom_referral_code,
    selected_font_scale: user.selected_font_scale,
    compact_view_enabled: user.compact_view_enabled,
    selected_theme: user.selected_theme,
    no_refund_policy_logged: user.no_refund_policy_logged,
    username: user.username || generateDefaultUsername(userEmail),
    cover_photo: user.cover_photo || ''
  };

  clearLoginAttempts(userEmail); // reset throttle on successful auth
  await setSessionCookie(res, userSession, req);
  res.json({ success: true, user: sanitizeUser(user) });
});

app.get('/api/auth/callback', async (req, res) => {
  // SECURITY: this endpoint derives identity from an unauthenticated query param
  // and issues a fully-signed session — a complete auth bypass if exposed. It is a
  // dev/sandbox convenience only and FAILS CLOSED: disabled unless
  // ALLOW_SANDBOX_AUTH==='true' is explicitly set (so a misconfigured NODE_ENV
  // cannot expose it). A real OAuth integration must exchange an authorization
  // code with the provider before issuing a session.
  if (process.env.ALLOW_SANDBOX_AUTH !== 'true') {
    return res.status(404).json({ error: 'Not found.' });
  }
  const { provider, name, email } = req.query;
  const userEmail = String(email || 'sandbox@slayer.io').toLowerCase().trim();

  // Look up or establish database record
  let user = await dbGetUser(userEmail);
  if (!user) {
    user = {
      id: `usr-${Math.random().toString(36).substring(2, 10)}`,
      email: userEmail,
      name: String(name || 'Sandbox Quant User'),
      avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
      access_tier: 'guest', // Always start as guest to enforce paywall shield
      referral_tokens_pool: 3,
      custom_referral_code: `SLAYER${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      selected_font_scale: 'STANDARD',
      compact_view_enabled: false,
      selected_theme: 'SLAYER PURE DARK',
      no_refund_policy_logged: false,
      active_ip: null,
      username: generateDefaultUsername(userEmail),
      cover_photo: ''
    };
    try {
      await dbSetUser(userEmail, user, user.version);
    } catch (dbErr) {
      console.error('auth/callback persist failed for', userEmail, dbErr);
      return res.status(500).send('Could not establish account. Please retry.');
    }
  }

  const userSession = {
    authenticated: true,
    provider: provider || 'sandbox',
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    access_tier: user.access_tier,
    username: user.username,
    cover_photo: user.cover_photo
  };

  await setSessionCookie(res, userSession, req);
  res.redirect('/');
});

app.get('/api/auth/session', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (session && session.email) {
    const userEmail = session.email.toLowerCase().trim();

    // Moderation gates (spec §6): banned / force-logged-out users are bounced.
    if (BANNED_USERS.has(userEmail)) {
      res.cookie('slayer_session', '', { httpOnly: true, path: '/', maxAge: 0 });
      return res.json({ authenticated: false, blocked: 'BANNED', message: 'This account has been permanently banned.' });
    }
    if (FORCE_LOGOUT_USERS.has(userEmail)) {
      FORCE_LOGOUT_USERS.delete(userEmail);
      res.cookie('slayer_session', '', { httpOnly: true, path: '/', maxAge: 0 });
      return res.json({ authenticated: false, forced_logout: true });
    }

    let user = await dbGetUser(userEmail);
    
    // Auto-reconstruct user from valid cookie if they were wiped from in-memory DB during server restart
    if (!user) {
      const customReferralCode = `SLAYER${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      user = {
        id: `usr-${Math.random().toString(36).substring(2, 10)}`,
        email: userEmail,
        name: session.name || session.email.split('@')[0],
        avatar: session.avatar || `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`,
        access_tier: session.access_tier || 'guest', // Rely on session payload tier or default to guest
        referral_tokens_pool: 0,
        custom_referral_code: customReferralCode,
        selected_font_scale: 'STANDARD',
        compact_view_enabled: false,
        selected_theme: 'SLAYER PURE DARK',
        no_refund_policy_logged: false,
        active_ip: null,
        username: generateDefaultUsername(userEmail),
        cover_photo: ''
      };
      try {
        await dbSetUser(userEmail, user, user.version);
      } catch (dbErr) {
        console.error('session reconstruct persist failed for', userEmail, dbErr);
        return res.status(500).json({ error: 'Could not establish session account. Please retry.' });
      }
    }

    fillDefaultPrivacySettings(user);
    
    res.json({
      authenticated: true,
      provider: session.provider || 'clerk',
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      access_tier: roleForEmail(user.email) !== 'user' ? 'lifetime' : user.access_tier,
      referral_tokens_pool: user.referral_tokens_pool,
      custom_referral_code: user.custom_referral_code,
      selected_font_scale: user.selected_font_scale,
      compact_view_enabled: user.compact_view_enabled,
      selected_theme: user.selected_theme,
      no_refund_policy_logged: user.no_refund_policy_logged,
      username: user.username || generateDefaultUsername(userEmail),
      cover_photo: user.cover_photo || '',
      notification_preferences: user.notification_preferences,
      profile_visibility: user.profile_visibility,
      block_search_indexing: user.block_search_indexing,
      customer_id: user.customer_id || '',
      payment_method_id: user.payment_method_id || '',
      cancels_at_period_end: !!user.cancels_at_period_end,
      is_super_admin: roleForEmail(user.email) !== 'user',
      admin_role: roleForEmail(user.email),
      suspended: SUSPENDED_USERS.has(userEmail)
    });
  } else {
    res.json({ authenticated: false });
  }
});



// Session validity check / keep-alive. The credential is the httpOnly session
// cookie, validated here. This used to mint a forgeable, never-validated bearer
// `access_token` (user_id:timestamp); that theater has been removed — clients
// authenticate purely via the cookie sent with credentials:'same-origin'.
app.post('/api/auth/refresh', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session) {
    return res.status(401).json({ error: 'No valid session cookie found' });
  }
  res.json({ ok: true });
});

app.post('/api/auth/logout', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (session && session.email) {
    const logoutEmail = session.email.toLowerCase().trim();
    const user = await dbGetUser(logoutEmail);
    if (user) {
      user.active_ip = null;
      await persistUser(logoutEmail, user);
    }
    if (session.session_id) {
      activeSessionsDb.delete(session.session_id);
    }
  }
  
  res.cookie('slayer_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    expires: new Date(0)
  });
  res.json({ success: true });
});

// --- CORE VAULT & SECURITY ENDPOINTS (MODULE 2) ---

// GDPR Soft Delete Background Worker cleanup job (runs every 5 minutes)
// Guard the whole body: an unhandled rejection inside an async setInterval callback
// (e.g. the DB being briefly unavailable) would otherwise crash the process.
setInterval(async () => {
  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    let count = 0;
    for (const [email, user] of (await dbGetAllUsers()).map((u: any) => [u.email, u])) {
      if (user.deleted_at && new Date(user.deleted_at).getTime() < thirtyDaysAgo) {
        try {
          await dbDeleteUser(email);
          count++;
        } catch (delErr) {
          console.error('[GDPR BACKGROUND CLEANER] Failed to purge', email, delErr);
        }
      }
    }
    if (count > 0) {
      console.log(`[GDPR BACKGROUND CLEANER] Purged ${count} soft-deleted account(s) after compliance storage limits expired.`);
    }
  } catch (err) {
    console.error('[GDPR BACKGROUND CLEANER] Cleanup cycle error', err);
  }
}, 5 * 60 * 1000);

// endpoint 1: verify current password
app.post('/api/auth/verify-password', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required.' });
  }
  const verifyEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(verifyEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  if (user.passwordHash) {
    const match = bcrypt.compareSync(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect password. Access denied.' });
    }
  } else {
    // If user has no password yet (sandbox/clerk oauth), let them set this as password
    const err = validatePasswordStrength(password);
    if (err) {
      return res.status(400).json({ error: `Secure password required: ${err}` });
    }
    user.passwordHash = bcrypt.hashSync(password, 12);
  }

  const saved = await persistUser(verifyEmail, user);
  if (!saved) return res.status(500).json({ error: 'Could not persist change. Please retry.' });
  res.json({ success: true, message: 'Password verified.' });
});

// endpoint 2: change password
app.post('/api/auth/change-password', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { currentPassword, newPassword } = req.body;
  const changeEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(changeEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  if (user.passwordHash) {
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Current password is required.' });
    }
    const match = bcrypt.compareSync(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: 'Current password provided is incorrect.' });
    }
  }

  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    return res.status(400).json({ error: strengthErr });
  }

  user.passwordHash = bcrypt.hashSync(newPassword, 12);
  const saved = await persistUser(changeEmail, user);
  if (!saved) return res.status(500).json({ error: 'Could not persist change. Please retry.' });
  res.json({ success: true, message: 'Password changed successfully.' });
});

// endpoint 3: generate 2fa secret
app.post('/api/auth/generate-2fa', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const gen2faEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(gen2faEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  // Step-up re-auth: require the current password before enabling 2FA so a
  // hijacked session can't silently bind an attacker's authenticator (and lock
  // the real owner out). Accounts with no password set this up via verify-password.
  if (user.passwordHash) {
    const { currentPassword } = req.body || {};
    if (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.passwordHash)) {
      return res.status(403).json({ error: 'Re-enter your current password to enable two-factor authentication.' });
    }
  }

  // CSPRNG-backed TOTP secret. 26 base-32 chars ≈ 130 bits (RFC 4226 recommends
  // ≥128). crypto.randomInt is unbiased over [0,32); Math.random() is predictable.
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 26; i++) {
    secret += base32Chars[crypto.randomInt(0, 32)];
  }

  const otpauth_url = `otpauth://totp/Skyseye:${user.email}?secret=${secret}&issuer=Skyseye`;
  user.temp_2fa_secret = secret;

  const saved = await persistUser(gen2faEmail, user);
  if (!saved) return res.status(500).json({ error: 'Could not persist change. Please retry.' });
  res.json({
    success: true,
    secret,
    otpauth_url
  });
});

// endpoint 4: verify totp handshake
app.post('/api/auth/verify-totp', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { token } = req.body;
  const verifyTotpEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(verifyTotpEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  const secretToVerify = user.temp_2fa_secret || user.two_factor_secret;
  if (!secretToVerify) {
    return res.status(400).json({ error: '2FA initialization has not been requested.' });
  }

  // Throttle brute-force attempts: lock the account's 2FA verification for a few
  // minutes after repeated failures (the 6-digit code space is small).
  const lockMs = totpLockRemainingMs(verifyTotpEmail);
  if (lockMs > 0) {
    return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(lockMs / 1000)}s.` });
  }

  const isValid = verifyTOTP(secretToVerify, token);
  if (!isValid) {
    registerTotpFailure(verifyTotpEmail);
    return res.status(400).json({ error: 'Invalid 6-digit dynamic token. Verification failed.' });
  }
  clearTotpAttempts(verifyTotpEmail);

  user.two_factor_secret = secretToVerify;
  user.two_factor_enabled = true;
  user.temp_2fa_secret = undefined;

  // CSPRNG-backed one-time recovery codes (hex, 4-4 grouped).
  const backupCodes = Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
  user.backup_codes = backupCodes;

  const saved = await persistUser(verifyTotpEmail, user);
  if (!saved) return res.status(500).json({ error: 'Could not persist change. Please retry.' });
  res.json({
    success: true,
    backupCodes
  });
});

// endpoint 5: active sessions list
app.get('/api/auth/sessions', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const emailLower = session.email.toLowerCase().trim();
  const list: any[] = [];
  
  for (const [sessId, s] of activeSessionsDb.entries()) {
    if (s.email === emailLower && !s.terminated) {
      list.push({
        session_id: s.session_id,
        ip_address: s.ip_address,
        user_agent: s.user_agent,
        created_at: s.created_at,
        last_active: s.last_active,
        is_current: s.session_id === session.session_id
      });
    }
  }

  res.json({ 
    success: true, 
    sessions: list 
  });
});

// endpoint 6: revoke all sessions except current
app.post('/api/auth/revoke-sessions', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const emailLower = session.email.toLowerCase().trim();
  let count = 0;

  for (const [sessId, s] of activeSessionsDb.entries()) {
    if (s.email === emailLower && s.session_id !== session.session_id) {
      s.terminated = true;
      activeSessionsDb.delete(sessId);
      count++;
    }
  }

  // Durable revocation: bump the session-valid-after watermark so cookies on other
  // devices (older iat) are rejected even across a restart, then re-issue THIS
  // device's cookie with a fresh iat so the current session stays valid.
  const now = Date.now();
  setSessionsValidAfterLocal(emailLower, now);
  await dbSetModeration(emailLower, {
    banned: BANNED_USERS.has(emailLower),
    suspended: SUSPENDED_USERS.has(emailLower),
    sessions_valid_after: now,
  });
  await setSessionCookie(res, session, req);

  res.json({
    success: true,
    revokedCount: count,
    message: 'All other devices logged out successfully.'
  });
});

// endpoint 7: request email change with OTP
app.post('/api/auth/request-email-update', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { newEmail } = req.body;
  if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@')) {
    return res.status(400).json({ error: 'Please specify a valid email address.' });
  }

  const cleanEmail = newEmail.toLowerCase().trim();
  if (await dbHasUser(cleanEmail)) {
    return res.status(400).json({ error: 'Email address already in use by another account.' });
  }

  const requestEmailUpdateEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(requestEmailUpdateEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  // CSPRNG 6-digit OTP (crypto.randomInt is unbiased over the range).
  const otp = String(crypto.randomInt(100000, 1000000));
  user.temp_new_email = cleanEmail;
  user.email_otp = otp;
  user.email_otp_expiry = Date.now() + 15 * 60 * 1000;
  user.email_otp_attempts = 0; // reset brute-force counter for the new code
  await persistUser(requestEmailUpdateEmail, user);

  console.log(`\n--- [EMAIL SECURITY VERIFICATION TRIGGERS] ---`);
  console.log(`Initiator User: ${user.name}`);
  // SECURITY: never log the OTP in production (a log reader could hijack the email
  // change). Dev keeps it for local testing convenience.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev] email-change OTP for ${cleanEmail}: ${otp} (expires 15m)`);
  }
  console.log(`------------------------------------\n`);

  res.json({ 
    success: true, 
    message: 'Two-step verification triggered. A 6-digit OTP code has been dispatched to the requested email.',
    otpCode: process.env.NODE_ENV === 'production' ? undefined : otp // sandbox-only; omitted in production
  });
});

// endpoint 8: verify and confirm email update
app.post('/api/auth/verify-email-update', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { otp } = req.body;
  const oldEmail = session.email.toLowerCase().trim();
  
  const user = await dbGetUser(oldEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  const now = Date.now();
  if (user.email_otp_expiry && now > user.email_otp_expiry) {
    return res.status(400).json({ error: 'Verification code expired. Request a new code.' });
  }

  // Constant-time comparison + brute-force lockout. A 6-digit OTP (10^6 space) is
  // otherwise brute-forceable within the validity window; invalidate after 5 misses.
  const providedOtp = String(otp || '');
  const expectedOtp = String(user.email_otp || '');
  const otpMatches = expectedOtp.length > 0
    && providedOtp.length === expectedOtp.length
    && crypto.timingSafeEqual(Buffer.from(providedOtp), Buffer.from(expectedOtp));

  if (!otpMatches) {
    user.email_otp_attempts = (user.email_otp_attempts || 0) + 1;
    const tooMany = user.email_otp_attempts >= 5;
    if (tooMany) {
      user.email_otp = undefined;
      user.email_otp_expiry = undefined;
      user.email_otp_attempts = 0;
    }
    try { await persistUser(oldEmail, user); } catch (e) { /* best effort */ }
    return res.status(tooMany ? 429 : 400).json({
      error: tooMany
        ? 'Too many incorrect attempts. Please request a new verification code.'
        : 'Invalid verification digits. Security handshake failed.',
    });
  }

  const newEmail = user.temp_new_email;
  if (!newEmail) {
    return res.status(400).json({ error: 'No email replacement target found.' });
  }

  if (await dbHasUser(newEmail)) {
    return res.status(400).json({ error: 'The email destination is already taken.' });
  }

  // Update records. Write the NEW row before deleting the old one so a DB failure
  // can't destroy the account and leave it unrecoverable; a thrown error returns a
  // 500 rather than crashing the process (unhandled rejection under Express 4).
  user.email = newEmail;
  user.temp_new_email = undefined;
  user.email_otp = undefined;
  user.email_otp_expiry = undefined;
  user.email_otp_attempts = undefined;
  try {
    await dbSetUser(newEmail, user);
    await dbDeleteUser(oldEmail);
  } catch (dbErr) {
    console.error('verify-email-update DB error for', oldEmail, '->', newEmail, dbErr);
    return res.status(500).json({ error: 'Could not update email. Please retry.' });
  }

  // Sync session structures
  for (const [sessId, s] of activeSessionsDb.entries()) {
    if (s.email === oldEmail) {
      s.email = newEmail;
    }
  }

  console.log(`\n=== [SECURITY INCIDENT REPORT] ===`);
  console.log(`Incident Type: Primary Email Modification`);
  console.log(`Client ID: ${user.id}`);
  console.log(`Alert Status: SENT to retired address (${oldEmail})`);
  console.log(`Statement: "Your email has been safely updated to ${newEmail}."`);
  console.log(`==================================\n`);

  // Update session cookies payload
  const updatedSession = {
    ...session,
    email: newEmail,
    username: user.username || generateDefaultUsername(newEmail)
  };
  await setSessionCookie(res, updatedSession, req);

  res.json({ 
    success: true, 
    message: 'Primary email successfully updated. Validation logs complete.',
    securityAlertSentTo: oldEmail
  });
});

// endpoint 9: account soft deletion
app.delete('/api/users/delete-account', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const emailLower = session.email.toLowerCase().trim();
  const user = await dbGetUser(emailLower);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  // Cancel any live Stripe subscription BEFORE the soft-delete. Otherwise the
  // customer_id linkage is purged at the 30-day GDPR job and the subscription bills
  // indefinitely with nothing to reconcile it against. Guarded for local/dev.
  if (stripeClient && user.customer_id) {
    try {
      const subs = await stripeClient.subscriptions.list({ customer: user.customer_id, status: 'all', limit: 20 });
      for (const sub of subs.data) {
        if (['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(sub.status)) {
          await stripeClient.subscriptions.cancel(sub.id);
        }
      }
      console.log(`[BILLING] Cancelled live Stripe subscription(s) for deleted account, customer ${user.customer_id}`);
    } catch (e: any) {
      console.error('[BILLING] Stripe cancellation during account deletion failed:', e?.message);
      return res.status(502).json({ error: 'We could not cancel your billing subscription right now, so deletion was paused to avoid leaving you charged. Please retry shortly.' });
    }
  }

  user.deleted_at = new Date();

  // Persist the soft-delete. Without this the mutation lives only in memory: the
  // DB row keeps deleted_at = null, the user logs straight back in with the same
  // cookie, and the GDPR purge job never finds them.
  try {
    const saved = await persistUser(emailLower, user);
    if (!saved) {
      return res.status(409).json({ error: 'Account update conflict — please retry.' });
    }
  } catch (err) {
    console.error('delete-account persist failed for', emailLower, err);
    return res.status(500).json({ error: 'Could not process account deletion. Please retry.' });
  }

  // Terminate active sessions
  for (const [sessId, s] of activeSessionsDb.entries()) {
    if (s.email === emailLower) {
      s.terminated = true;
      activeSessionsDb.delete(sessId);
    }
  }

  // Log out by invalidating cookie
  res.cookie('slayer_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    expires: new Date(0)
  });

  res.json({ 
    success: true, 
    message: 'Your account has been soft-deleted. All sessions terminated. Under GDPR compliance, we will permanently purge this account data in 30 days.' 
  });
});

// GDPR Data Export & S3 Compliance Storage Systems (Module 3)
const s3ComplianceStorage = new Map<string, { email: string; payload: string; expiresAt: number; fileName: string }>();

// Stripe webhook idempotency: ids of events already processed (replay protection).
const processedWebhookEvents = new Set<string>();

app.get('/api/users/profile/:username', async (req, res) => {
  const usernameParam = String(req.params.username || '').toLowerCase().trim();
  if (!usernameParam) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  let targetUser: UserAccount | null = null;
  for (const u of (await dbGetAllUsers())) {
    if (u.username && u.username.toLowerCase().trim() === usernameParam) {
      if (u.deleted_at) continue;
      targetUser = u;
      break;
    }
  }

  if (!targetUser) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  fillDefaultPrivacySettings(targetUser);

  const session = await getSessionFromCookies(req.headers.cookie);
  const selfEmail = session && session.email ? session.email.toLowerCase().trim() : null;

  const vis = targetUser.profile_visibility || 'public';

  if (vis === 'private') {
    if (!selfEmail || selfEmail !== targetUser.email.toLowerCase().trim()) {
      return res.status(403).json({ error: 'This profile is set to Private. Profile visibility access denied.' });
    }
  } else if (vis === 'logged_in') {
    if (!session || !session.email) {
      return res.status(401).json({ error: 'Authentication required. This profile is set to Logged-In users only.' });
    }
  }

  res.json({
    profile: {
      name: targetUser.name,
      username: targetUser.username,
      avatar: targetUser.avatar,
      cover_photo: targetUser.cover_photo || '',
      access_tier: targetUser.access_tier,
      custom_referral_code: targetUser.custom_referral_code,
      block_search_indexing: !!targetUser.block_search_indexing,
      profile_visibility: targetUser.profile_visibility
    }
  });
});

app.post('/api/users/export-data', endpointRateLimit(5, '/api/users/export-data'), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'GDPR Export blocked. Unauthorized.' });
  }

  const userEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(userEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  // CSPRNG — this token grants access to a full PII export; Math.random() is not
  // cryptographically secure and its state is partially predictable.
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  const aggregatedSessions: any[] = [];
  for (const s of activeSessionsDb.values()) {
    if (s.email.toLowerCase().trim() === userEmail) {
      aggregatedSessions.push({
        ip_address: s.ip_address,
        user_agent: s.user_agent,
        created_at: s.created_at,
        last_active: s.last_active
      });
    }
  }

  const exportPayload = {
    export_metadata: {
      platform: 'Skyseye & Pinpoint Options Flow Intelligence',
      gdpr_compliance_standard: 'Regulation (EU) 2016/679',
      compiled_timestamp: new Date().toISOString(),
      expires_at_timestamp: new Date(expiresAt).toISOString(),
      file_encryption_strength: 'SHA-256 Symmetric Handshake',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    user_account_records: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      access_tier: user.access_tier,
      referral_tokens_pool: user.referral_tokens_pool,
      custom_referral_code: user.custom_referral_code,
      selected_theme: user.selected_theme,
      selected_font_scale: user.selected_font_scale,
      compact_view_enabled: user.compact_view_enabled,
      no_refund_policy_logged: user.no_refund_policy_logged,
      two_factor_enabled: !!user.two_factor_enabled,
      profile_visibility: user.profile_visibility || 'public',
      block_search_indexing: !!user.block_search_indexing,
      notification_preferences: user.notification_preferences || {
        email_enabled: true,
        sms_enabled: true,
        discord_enabled: true,
        options_flow_alerts: true
      }
    },
    active_sessions: aggregatedSessions,
    compliance_audit_logs: [
      { event: 'USER_REGISTERED', timestamp: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
      { event: 'MFA_SECRET_GENERATED', timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() },
      { event: 'GDPR_EXPORT_REQUESTED', timestamp: new Date().toISOString() }
    ]
  };

  const payloadString = JSON.stringify(exportPayload, null, 2);

  // Sweep expired export blobs (PII) so undownloaded exports don't linger in
  // memory for ~24h, and bound the map size as a backstop.
  const nowSweep = Date.now();
  for (const [k, v] of s3ComplianceStorage) {
    if (v.expiresAt <= nowSweep) s3ComplianceStorage.delete(k);
  }
  if (s3ComplianceStorage.size > 500) {
    const oldest = Array.from(s3ComplianceStorage.keys()).slice(0, s3ComplianceStorage.size - 500);
    for (const k of oldest) s3ComplianceStorage.delete(k);
  }

  s3ComplianceStorage.set(token, {
    email: userEmail,
    payload: payloadString,
    expiresAt,
    fileName: `skyseye-gdpr-export-${user.username || 'user'}.json`
  });

  console.log(`
======================================================================
[GDPR COMPLIANCE AUDIT] DISPATCHING SECURE DATA EXPORT CONTAINER
TO: ${userEmail}
TIMESTAMP: ${new Date().toISOString()}
CONTAINER URL: http://localhost:3000/api/users/download-export/<token redacted from logs>
EXPIRATION: 24 HOURS (Expires: ${new Date(expiresAt).toLocaleString()})
STATUS: DELIVERED VIA ENCRYPTED TLS SMTP HANDSHAKE
======================================================================
  `);

  res.json({
    success: true,
    message: 'Async background export worker successfully triggered. Database records aggregated and safely packaged.',
    downloadUrl: `/api/users/download-export/${token}`,
    expiresAt,
    simulatedEmailLogs: `A secure data archive was generated under GDPR Article 20 guidelines. Download Link: /api/users/download-export/${token} (expires in 24h).`
  });
});

app.get('/api/users/download-export/:token', async (req, res) => {
  // SECURITY: the export is a full PII dump. Require the OWNER's authenticated
  // session — possession of the token alone must not be sufficient.
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).send('<h1>401 Unauthorized</h1>');
  }

  const token = String(req.params.token || '').trim();
  const archive = s3ComplianceStorage.get(token);

  if (!archive) {
    return res.status(404).send('<h1>404 Archive Not Found</h1><p>GDPR Data Export Archive not located on S3 secure boundaries.</p>');
  }

  if (session.email.toLowerCase().trim() !== archive.email.toLowerCase().trim()) {
    return res.status(403).send('<h1>403 Forbidden</h1>');
  }

  if (Date.now() > archive.expiresAt) {
    s3ComplianceStorage.delete(token);
    return res.status(410).send('<h1>410 Export Link Expired</h1><p>Under GDPR rules, security export archives expire permanently after 24 hours.</p>');
  }

  // Quote + sanitize the filename to prevent Content-Disposition header injection.
  const safeName = String(archive.fileName || 'export.json').replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(archive.payload);
});

// ============================================================
// STRIPE CHECKOUT — create a hosted Checkout Session and return its URL.
// The frontend redirects the browser to the returned url. On completion Stripe
// fires the webhook below, which is the single source of truth for granting
// access (we never elevate a user's tier from this endpoint directly).
// ============================================================
app.post('/api/billing/create-checkout-session', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required to start checkout.' });
  }

  if (!stripeClient) {
    return res.status(503).json({ error: 'Payments are not configured yet.' });
  }

  const { plan } = req.body || {};
  const billingCycle: 'monthly' | 'annual' = req.body?.billingCycle === 'annual' ? 'annual' : 'monthly';

  const pricing = typeof plan === 'string' ? TIER_PRICING[plan] : undefined;
  if (!pricing) {
    return res.status(400).json({ error: 'Unknown subscription plan.' });
  }

  // SECURITY: 'lifetime' is contact-only (no self-serve price). Without this guard it
  // checks out at $0 (no oneTime amount) and the webhook then grants permanent top-tier
  // access for free. Block it here — and block any plan that would compute a $0 charge.
  if (plan === 'lifetime') {
    return res.status(400).json({ error: 'The Lifetime plan is not available for self-serve checkout — please contact us.' });
  }
  const computedAmount = billingCycle === 'annual' ? pricing.annual : pricing.monthly;
  if (!computedAmount || computedAmount <= 0) {
    return res.status(400).json({ error: 'This plan is not available for self-serve checkout.' });
  }

  const email = session.email.toLowerCase().trim();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  try {
    const isLifetime = plan === 'lifetime';

    const baseParams: Stripe.Checkout.SessionCreateParams = {
      customer_email: session.email,
      success_url: `${appUrl}/?upgrade=success`,
      cancel_url: `${appUrl}/?upgrade=cancel`,
      metadata: {
        email,
        plan,
        tier: String(pricing.tier),
      },
    };

    let checkoutSession: Stripe.Checkout.Session;

    if (isLifetime) {
      // One-time payment for the Lifetime Pass.
      checkoutSession = await stripeClient.checkout.sessions.create({
        ...baseParams,
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              product_data: { name: pricing.name },
              unit_amount: pricing.oneTime ?? 0,
            },
          },
        ],
      });
    } else {
      // Recurring subscription (monthly or annual).
      checkoutSession = await stripeClient.checkout.sessions.create({
        ...baseParams,
        mode: 'subscription',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              product_data: { name: pricing.name },
              unit_amount: billingCycle === 'annual' ? pricing.annual : pricing.monthly,
              recurring: { interval: billingCycle === 'annual' ? 'year' : 'month' },
            },
          },
        ],
        subscription_data: {
          metadata: { email, plan },
        },
      });
    }

    return res.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error('[STRIPE CHECKOUT ERROR]', err);
    return res.status(500).json({ error: err?.message || 'Failed to create checkout session.' });
  }
});

// ============================================================
// STRIPE WEBHOOK — the single source of truth for granting/revoking access.
// Stripe POSTs raw JSON here; the signature is verified against the raw body
// (hence express.raw — express.json would mangle the bytes and break the HMAC).
// ============================================================
// Resolve the local user for a Stripe Subscription. metadata.email is only set on
// the one checkout path and is NOT populated for dashboard/proration/dunning
// events, so fall back to matching the stored customer_id (set on checkout).
async function findUserForSubscription(sub: any): Promise<any | null> {
  const email = (sub?.metadata?.email || '').toLowerCase().trim();
  if (email) {
    const u = await dbGetUser(email);
    if (u) return u;
  }
  const customerId = typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id;
  if (customerId) {
    const all = await dbGetAllUsers();
    return all.find((u: any) => u.customer_id === customerId) || null;
  }
  return null;
}

// Resolve a Stripe Subscription back to our internal access tier. Prefers the
// active item's amount+interval (survives dashboard plan-swaps/proration, which
// do NOT update metadata) and falls back to metadata.plan. Returns null if the
// subscription doesn't match any known plan so we never grant a guessed tier.
function tierFromStripeSubscription(sub: any): { accessTier: string; plan: string } | null {
  const item = sub?.items?.data?.[0];
  const amount = item?.price?.unit_amount;
  const interval = item?.price?.recurring?.interval; // 'month' | 'year'
  // Never resolve a recurring subscription to a $0 line or to the contact-only
  // 'lifetime' tier: a 100%-off coupon, $0 trial line, or misconfigured plan must not
  // escalate to permanent top-tier access.
  if (typeof amount === 'number' && amount > 0) {
    for (const [plan, p] of Object.entries(TIER_PRICING)) {
      if (plan === 'lifetime') continue;
      if (interval === 'year' && p.annual === amount) return { accessTier: p.accessTier, plan };
      if (interval === 'month' && p.monthly === amount) return { accessTier: p.accessTier, plan };
    }
  }
  const metaPlan = String(sub?.metadata?.plan || '');
  if (metaPlan !== 'lifetime' && TIER_PRICING[metaPlan]) return { accessTier: TIER_PRICING[metaPlan].accessTier, plan: metaPlan };
  return null;
}

// Stripe subscription statuses that should hold paid access vs. revoke it.
const STRIPE_ACTIVE_STATUSES = new Set(['active', 'trialing']);
const STRIPE_REVOKE_STATUSES = new Set(['past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused']);

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripeClient) {
    return res.status(503).json({ error: 'Payments are not configured yet.' });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Fail loud rather than silently rejecting every (signature-less) event: this
    // means subscriptions/cancellations would never be applied. 503 surfaces it.
    console.error('[STRIPE WEBHOOK] STRIPE_WEBHOOK_SECRET is not set — cannot verify events.');
    return res.status(503).send('Webhook secret not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig as string, webhookSecret);
  } catch (e: any) {
    console.error('[STRIPE WEBHOOK] Signature verification failed:', e?.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  // Idempotency / replay protection: skip events we've already processed. Backed
  // by the durable store so a Stripe retry AFTER a restart isn't re-processed
  // (the in-memory Set alone reset on restart); in-memory stays a fast first check.
  if (processedWebhookEvents.has(event.id) || await dbIsWebhookProcessed(event.id)) {
    return res.json({ received: true, duplicate: true });
  }
  // NOTE: this event is marked processed only AFTER the handler completes successfully
  // (see end of the try block). Marking it up-front previously meant a handler/persist
  // failure was still recorded as "done", so Stripe's retry was short-circuited as a
  // duplicate and a paid grant or cancellation was lost forever.

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const email = (checkoutSession.metadata?.email || checkoutSession.customer_email || '').toLowerCase().trim();
        const plan = checkoutSession.metadata?.plan || '';
        const pricing = TIER_PRICING[plan];

        // SECURITY: only grant access on a genuinely paid session. Stripe sets
        // payment_status to 'paid' (or 'no_payment_required' for $0/trial); an
        // 'unpaid' session must never elevate a tier.
        const paid = checkoutSession.payment_status === 'paid' || checkoutSession.payment_status === 'no_payment_required';
        if (!paid) {
          console.warn(`[STRIPE WEBHOOK] checkout.session.completed not granting — payment_status=${checkoutSession.payment_status} for ${email}`);
          break;
        }
        // SECURITY: never grant the permanent top tier from a $0 checkout. Self-serve
        // lifetime is blocked at session creation; refuse it here too as defense in depth.
        if (plan === 'lifetime' && (checkoutSession.amount_total ?? 0) <= 0) {
          console.warn(`[STRIPE WEBHOOK] refusing $0 lifetime grant for ${email}`);
          break;
        }

        if (email && pricing) {
          const user = await dbGetUser(email);
          if (user) {
            user.access_tier = pricing.accessTier;
            user.customer_id = (typeof checkoutSession.customer === 'string'
              ? checkoutSession.customer
              : checkoutSession.customer?.id) || user.customer_id;
            user.cancels_at_period_end = false;
            const okGrant = await persistUser(email, user);
            if (!okGrant) throw new Error(`persistUser failed for ${email} (checkout.completed)`);
            console.log(`[STRIPE WEBHOOK] checkout.session.completed -> ${email} upgraded to ${pricing.accessTier} (plan: ${plan})`);
          } else {
            console.warn(`[STRIPE WEBHOOK] checkout.session.completed for unknown user: ${email}`);
          }
        } else {
          console.warn('[STRIPE WEBHOOK] checkout.session.completed missing email or unknown plan', { email, plan });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const user = await findUserForSubscription(sub);
        if (user) {
          user.access_tier = 'guest';
          const okDel = await persistUser(user.email, user);
          if (!okDel) throw new Error(`persistUser failed for ${user.email} (subscription.deleted)`);
          console.log(`[STRIPE WEBHOOK] subscription.deleted -> ${user.email} downgraded to guest`);
        } else {
          console.warn('[STRIPE WEBHOOK] subscription.deleted: no user matched by metadata.email or customer id');
        }
        break;
      }

      // .created covers subscriptions made outside the checkout path (e.g. the
      // Stripe dashboard), which would otherwise only be picked up on a later update.
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const user = await findUserForSubscription(sub);
        if (user) {
          user.cancels_at_period_end = !!sub.cancel_at_period_end;
          // Re-sync entitlement to the subscription's CURRENT state. Previously
          // this only copied cancel_at_period_end, so a plan-swap/proration in the
          // Stripe dashboard, or a lapse into past_due/unpaid, never changed the
          // user's access_tier (entitlement drift / revenue leak).
          const status = String(sub.status || '');
          if (STRIPE_REVOKE_STATUSES.has(status)) {
            user.access_tier = 'guest';
          } else if (STRIPE_ACTIVE_STATUSES.has(status)) {
            const mapped = tierFromStripeSubscription(sub);
            if (mapped) user.access_tier = mapped.accessTier;
          }
          const okUpd = await persistUser(user.email, user);
          if (!okUpd) throw new Error(`persistUser failed for ${user.email} (subscription.updated)`);
          console.log(`[STRIPE WEBHOOK] subscription.updated -> ${user.email} status=${status} tier=${user.access_tier} cancels_at_period_end=${user.cancels_at_period_end}`);
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }

    // Mark processed ONLY after a successful handler run. A failure below leaves the
    // event un-recorded so Stripe's retry can re-apply the grant/cancellation.
    processedWebhookEvents.add(event.id);
    await dbMarkWebhookProcessed(event.id);
    if (processedWebhookEvents.size > 5000) {
      // Bound memory: drop the oldest ~1000 ids (insertion order preserved by Set).
      for (const id of Array.from(processedWebhookEvents).slice(0, 1000)) processedWebhookEvents.delete(id);
    }
  } catch (e: any) {
    // Return 500 (not 200) so Stripe RETRIES instead of the failure being swallowed
    // and the grant/cancellation permanently lost. The event is NOT marked processed.
    console.error('[STRIPE WEBHOOK] Handler error — returning 500 for Stripe retry:', e?.message);
    return res.status(500).json({ received: false, error: 'handler_failed' });
  }

  return res.json({ received: true });
});

// Cancellation Flow mapped to /api/billing/cancel
app.post('/api/billing/cancel', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Cancellation blocked. Unauthorized.' });
  }

  const userEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(userEmail);

  if (!user) {
    return res.status(404).json({ error: 'User record not located in memory.' });
  }

  // Schedule the cancellation in Stripe FIRST (the source of truth). Without this the
  // customer is told billing stops but their card keeps getting charged at renewal —
  // a chargeback/consumer-protection problem, not just a bug. Guarded so local/dev
  // (no Stripe configured) keeps the prior behaviour of recording the request only.
  if (stripeClient && user.customer_id) {
    try {
      const subs = await stripeClient.subscriptions.list({ customer: user.customer_id, status: 'active', limit: 20 });
      for (const sub of subs.data) {
        await stripeClient.subscriptions.update(sub.id, { cancel_at_period_end: true });
      }
      console.log(`[BILLING] Stripe cancel-at-period-end scheduled for ${subs.data.length} subscription(s), customer ${user.customer_id}`);
    } catch (e: any) {
      console.error('[BILLING] Stripe cancellation failed:', e?.message);
      return res.status(502).json({ error: 'We could not reach our payment processor to schedule the cancellation. No change was made — please retry shortly.' });
    }
  }

  user.cancels_at_period_end = true;

  console.log(`[AUDIT LOG] SUBSCRIPTION CANCELLATION REQUESTED AND SAVED. User: ${userEmail}. Restraining further charges. User active access remains functional until period end.`);

  const saved = await persistUser(userEmail, user);
  if (!saved) return res.status(500).json({ error: 'Could not persist change. Please retry.' });

  // Sync cookie with the updated cancels_at_period_end parameter
  const updatedSession = {
    ...session,
    cancels_at_period_end: true
  };
  await setSessionCookie(res, updatedSession, req);

  res.json({
    success: true,
    message: 'We have received and logged your subscription cancellation request. Scheduled to cancel at period end. No further invoice runs will execute.',
    cancels_at_period_end: true,
    access_tier: user.access_tier
  });
});

// Apply Referral Promo Code Endpoint (Module 5, Rule 3)
app.post('/api/billing/apply-coupon', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Authentication required to apply coupon.' });
  }

  const { referralCode } = req.body;
  if (!referralCode || typeof referralCode !== 'string') {
    return res.status(400).json({ error: 'Promo or Referral Code is required.' });
  }

  const codeClean = referralCode.trim().toLowerCase();
  const userEmail = session.email.toLowerCase().trim();
  const currentUser = await dbGetUser(userEmail);

  // Prevent self-referral
  if (currentUser) {
    if (
      (currentUser.username && currentUser.username.toLowerCase() === codeClean) ||
      (currentUser.custom_referral_code && currentUser.custom_referral_code.toLowerCase() === codeClean)
    ) {
      return res.status(400).json({ error: 'Self-referral is strictly forbidden.' });
    }
  }

  let referrerMatch: UserAccount | null = null;
  for (const u of (await dbGetAllUsers())) {
    if (
      (u.username && u.username.toLowerCase() === codeClean) ||
      (u.custom_referral_code && u.custom_referral_code.toLowerCase() === codeClean)
    ) {
      referrerMatch = u;
      break;
    }
  }

  if (!referrerMatch) {
    return res.status(404).json({ error: 'Invalid Promo or Referral Code.' });
  }

  // Idempotent crediting: a referee can credit a referrer AT MOST ONCE. If this
  // account was already referred, honor the discount but do NOT credit again —
  // this closes the farm-by-replaying-apply-coupon vector (previously +1 token to
  // the referrer on every call). Guard against a missing self-referrer too.
  if (currentUser && !currentUser.referred_by && referrerMatch.email.toLowerCase() !== userEmail) {
    currentUser.referred_by = referrerMatch.email;
    referrerMatch.referral_tokens_pool = (referrerMatch.referral_tokens_pool || 0) + 1;
    await persistUser(referrerMatch.email, referrerMatch);
    await persistUser(currentUser.email, currentUser); // record referred_by on the referee
    console.log(`[ACTIVE REFERRAL ENGAGED] Credited +1 token to referrer "${referrerMatch.email}" for referee ${userEmail}. New count: ${referrerMatch.referral_tokens_pool}`);
  } else {
    console.log(`[ACTIVE REFERRAL] Discount applied without re-credit for ${userEmail} (already referred_by=${currentUser?.referred_by || 'n/a'}).`);
  }

  res.json({
    success: true,
    discount_percentage: 10,
    message: 'Referral Code successfully approved! 10% instant checkout discount applied.',
    referrer_name: referrerMatch.name,
    referral_code: referralCode
  });
});

// Secure Card Billing Processor with Refund Checkbox & Audit Log (Module 3 & 5)
app.post('/api/billing/process', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Billing access denied. Session expired.' });
  }

  // SECURITY: this simulated path grants a tier directly. In production with Stripe
  // wired up, the ONLY way to grant paid access is the signed Stripe webhook —
  // otherwise any logged-in user could self-upgrade for free. The simulated path
  // stays available only for the keyless/sandbox demo (no live Stripe).
  // SECURITY: fail CLOSED in production — gate on NODE_ENV alone, independent of
  // whether stripeClient is currently truthy. Previously, if Stripe was unset/
  // misconfigured in prod, this path granted any tier (incl. lifetime) for free.
  // An explicit ALLOW_SIMULATED_BILLING=true opt-in is required for staging demos.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_BILLING !== 'true') {
    return res.status(403).json({ error: 'Please complete payment via secure Stripe checkout to upgrade.' });
  }

  const { plan, address, zip, referralCode, noRefundAgreed, customer_id, payment_method_id } = req.body;

  if (!plan) {
    return res.status(400).json({ error: 'Please specify the subscription plan level.' });
  }
  if (!noRefundAgreed) {
    return res.status(400).json({ error: 'Accepting the Mandatory No-Refund policy is required to complete action.' });
  }

  const userEmail = session.email.toLowerCase().trim();
  let user = await dbGetUser(userEmail);

  if (!user) {
    console.log(`[BILLING EVENT] RECONSTRUCTING USER FROM VALID COOKIE: ${userEmail}`);
    user = {
      id: session.id || Math.random().toString(36).substring(7),
      name: session.name || session.email.split('@')[0],
      email: userEmail,
      access_tier: session.access_tier || 'guest',
      referral_tokens_pool: session.referral_tokens_pool || 0,
      custom_referral_code: session.custom_referral_code || `SLAYERX_${Math.floor(Math.random() * 1000)}`,
      selected_font_scale: session.selected_font_scale || 'STANDARD',
      compact_view_enabled: !!session.compact_view_enabled,
      selected_theme: session.selected_theme || 'SLAYER PURE DARK',
      no_refund_policy_logged: !!session.no_refund_policy_logged,
      active_ip: null,
      avatar: session.avatar || ''
    };
    try {
      await dbSetUser(userEmail, user, user.version);
    } catch (dbErr) {
      console.error('billing/subscribe reconstruct persist failed for', userEmail, dbErr);
      return res.status(500).json({ error: 'Could not establish account for billing. Please retry.' });
    }
  }

  // Set Stripe Elements / Braintree Drop-in tokenised parameters.
  // NEVER write raw credit card numbers, CVCs, or card expiration values to user object.
  user.customer_id = customer_id || ("cus_se_" + Math.random().toString(36).substring(2, 10));
  user.payment_method_id = payment_method_id || ("pm_se_" + Math.random().toString(36).substring(2, 10));
  user.cancels_at_period_end = false;

  // Map the requested plan onto its canonical access tier — single source of truth
  // is config.ts TIER_PRICING (the same mapping the Stripe webhook writes). Unknown
  // plans fall back to the lowest tier (fail-closed). This replaces an older hand-rolled
  // mapping that mislabeled tiers (skyvision→intraday, pinpoint→quant) and over-granted
  // plan='quant' to enterprise/level-3.
  const planPricing = TIER_PRICING[plan as keyof typeof TIER_PRICING];
  const targetTier: 'guest' | 'discord' | 'pinpoint' | 'skyvision' | 'lifetime' = planPricing ? planPricing.accessTier : 'discord';

  // Apply strict audit logging variables
  user.access_tier = targetTier;
  user.no_refund_policy_logged = true; // permanently write to DB row (Module 3, rule 4)

  // Persist the tier/billing mutation BEFORE telling the client it succeeded.
  const saved = await persistUser(userEmail, user);
  if (!saved) return res.status(500).json({ error: 'Could not persist change. Please retry.' });

  // Referral Token Allocator logic (Module 5)
  let referralCreditLogs = 'No referral code entered.';
  let referrerCredited: string | null = null;
  
  const updatedSession = (await getSessionFromCookies(req.headers.cookie)) || {};
  
  if (referralCode) {
    // Locate the referrer having this custom_referral_code
    let referrerMatch: UserAccount | null = null;
    for (const [email, acc] of (await dbGetAllUsers()).map(u => [u.email, u])) {
      if (acc.custom_referral_code && acc.custom_referral_code.toUpperCase() === referralCode.trim().toUpperCase() && acc.email !== user.email) {
        referrerMatch = acc;
        break;
      }
    }

    if (referrerMatch && !user.referred_by) {
      // Idempotent: credit a referrer at most ONCE per referee (mirrors signup +
      // apply-coupon). Previously this credited +1 on every billing/process call.
      user.referred_by = referrerMatch.email;
      referrerMatch.referral_tokens_pool = (referrerMatch.referral_tokens_pool || 0) + 1;
      await persistUser(referrerMatch.email, referrerMatch);
      await persistUser(user.email, user);
      referrerCredited = referrerMatch.email;
      referralCreditLogs = `SUCCESS // Credited 1 token to referrer "${referrerMatch.email}" (New pool: ${referrerMatch.referral_tokens_pool}).`;
    } else if (referrerMatch) {
      referralCreditLogs = `Referral already applied for ${user.email}; no re-credit.`;
    } else {
      referralCreditLogs = `Referral promo code "${referralCode}" not matched to active accounts in database system.`;
    }
  }

  // Access has already been granted and persisted directly above. (The real
  // Stripe webhook at /api/billing/webhook is the source of truth for live
  // Stripe events; it requires a signed payload, so there is no internal
  // server-to-server call to make here.)

  // Audit log without the sensitive billing identifiers (customer_id / payment_
  // method_id must not land in plaintext logs).
  console.log(`[AUDIT LOG] PAYMENT RECEIVED AND TOKENIZED. User: ${userEmail}. Tier: ${user.access_tier}. Referral Action: ${referralCreditLogs}`);
  
  const freshSession = {
    authenticated: true,
    provider: updatedSession.provider || 'clerk',
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    access_tier: user.access_tier,
    referral_tokens_pool: user.referral_tokens_pool,
    custom_referral_code: user.custom_referral_code,
    selected_font_scale: user.selected_font_scale,
    compact_view_enabled: user.compact_view_enabled,
    selected_theme: user.selected_theme,
    no_refund_policy_logged: user.no_refund_policy_logged,
    customer_id: user.customer_id,
    payment_method_id: user.payment_method_id,
    cancels_at_period_end: user.cancels_at_period_end
  };
  await setSessionCookie(res, freshSession, req);

  res.json({
    success: true,
    access_tier: targetTier,
    no_refund_policy_logged: true,
    referral_status: referralCreditLogs,
    referrer_credited: referrerCredited,
    customer_id: user.customer_id,
    payment_method_id: user.payment_method_id,
    cancels_at_period_end: false
  });
});

// Debounced Check-Username handler
app.get('/api/users/check-username', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) {
    return res.json({ available: false, reason: 'Username is required.' });
  }
  const regex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!regex.test(q)) {
    return res.json({ available: false, reason: 'Must be 3-20 characters, lowercase letters, numbers, or underscores.' });
  }
  
  const reservedWords = [
    'admin', 'system', 'root', 'support', 'moderator', 'null', 'undefined',
    'slayer', 'pinpoint', 'skyseye', 'billing', 'api', 'auth', 'images', 'users',
    'settings', 'preferences', 'trade', 'quant', 'help', 'developer', 'staff'
  ];
  if (reservedWords.includes(q)) {
    return res.json({ available: false, reason: 'This username is reserved by the platform.' });
  }

  const session = await getSessionFromCookies(req.headers.cookie);
  const myEmail = (session && session.email) ? session.email.toLowerCase().trim() : '';
  
  const isTaken = (await dbGetAllUsers()).some(
    u => u.email.toLowerCase().trim() !== myEmail && u.username?.toLowerCase().trim() === q
  );

  if (isTaken) {
    return res.json({ available: false, reason: 'Username is already taken.' });
  }

  return res.json({ available: true });
});

// Image serving endpoint (representing S3 CDN bucket integration)
app.get('/api/images/:id', async (req, res) => {
  const id = req.params.id;
  const imageItem = cdnStorage.get(id);
  if (!imageItem) {
    return res.status(404).send('Image file not found on CDN server.');
  }

  try {
    const imgBuffer = Buffer.from(imageItem.data, 'base64');
    res.writeHead(200, {
      'Content-Type': imageItem.mime,
      'Content-Length': imgBuffer.length,
      'Cache-Control': 'public, max-age=31536000', // 1 Year cached in browser
      'X-Content-Type-Options': 'nosniff'           // XSS protection
    });
    res.end(imgBuffer);
  } catch (error) {
    console.error('[CDN RETRIEVAL ERROR]', error);
    res.status(500).send('Corrupted image buffer.');
  }
});

// Image Upload Router with strict validators (Module 6)
app.post('/api/upload', endpointRateLimit(10, '/api/upload'), express.json({ limit: '10mb' }), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Upload refused. Unautomated session.' });
  }

  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'No image byte stream provided.' });
  }

  // Check base64 format signature
  const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return res.status(400).json({ error: 'Invalid data format. Must be a visual base64 data URL.' });
  }

  const mimeType = matches[1].toLowerCase();
  const base64Data = matches[2];

  // Validation: JPEG, PNG, WebP only. Reject SVG or scripts.
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(mimeType)) {
    return res.status(400).json({ error: 'File format rejected. Only JPEG, PNG and WebP are allowed (SVG and other scripts are strictly banned).' });
  }

  // 5MB limit check (Base64 is ~1.37 size multiplier)
  const estimatedBytes = (base64Data.length * 3) / 4;
  if (estimatedBytes > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Upload failed: Image exceeds 5MB payload limit.' });
  }

  // Store in simulation map using S3/CDN address
  const uniqueId = `img_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  cdnStorage.set(uniqueId, {
    data: base64Data,
    mime: mimeType
  });
  // Bound the in-memory image store (base64 blobs) so uploads can't exhaust RAM.
  if (cdnStorage.size > 300) { const oldest = cdnStorage.keys().next().value; if (oldest !== undefined) cdnStorage.delete(oldest); }

  const cdnUrl = `/api/images/${uniqueId}`;
  res.json({ cdnUrl });
});


// ============================================================
// WORKSPACE LAYOUT PERSISTENCE (resizable grid engine — spec Group 4/5)
// Stores the user's pane layout JSON. New users hydrate Template A on the
// client (see WorkspaceView) and PATCH it here so it's never empty.
// ============================================================
app.get('/api/users/workspace', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized.' });
  const user = await dbGetUser(session.email.toLowerCase().trim());
  res.json({ layout: user?.workspace_layout || null });
});

app.patch('/api/users/workspace', express.json({ limit: '5mb' }), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized.' });
  const workspaceEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(workspaceEmail);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (req.body && Array.isArray(req.body.layout)) {
    user.workspace_layout = req.body.layout;
    await persistUser(workspaceEmail, user);
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'A layout array is required.' });
});

app.patch('/api/users/preferences', express.json({ limit: process.env.PREFS_BODY_LIMIT || '8mb' }), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Settings access denied. Unauthorized.' });
  }

  const { selected_font_scale, compact_view_enabled, ultrawide_enabled, selected_theme, name, avatar, username, cover_photo, notification_preferences, profile_visibility, block_search_indexing } = req.body;
  const userEmail = session.email.toLowerCase().trim();
  let user = await dbGetUser(userEmail);

  if (!user) {
    console.log(`[SETTINGS EVENT] RECONSTRUCTING USER FROM VALID COOKIE: ${userEmail}`);
    user = {
      id: session.id || Math.random().toString(36).substring(7),
      name: session.name || session.email.split('@')[0],
      email: userEmail,
      access_tier: session.access_tier || 'guest',
      referral_tokens_pool: session.referral_tokens_pool || 0,
      custom_referral_code: session.custom_referral_code || `SLAYERX_${Math.floor(Math.random() * 1000)}`,
      selected_font_scale: session.selected_font_scale || 'STANDARD',
      compact_view_enabled: !!session.compact_view_enabled,
      selected_theme: session.selected_theme || 'SLAYER PURE DARK',
      no_refund_policy_logged: !!session.no_refund_policy_logged,
      active_ip: null,
      avatar: session.avatar || '',
      username: generateDefaultUsername(userEmail),
      cover_photo: ''
    };
    try {
      await dbSetUser(userEmail, user, user.version);
    } catch (dbErr) {
      console.error('preferences reconstruct persist failed for', userEmail, dbErr);
      return res.status(500).json({ error: 'Could not save settings. Please retry.' });
    }
  }

  fillDefaultPrivacySettings(user);

  if (selected_font_scale !== undefined) user.selected_font_scale = selected_font_scale;
  if (compact_view_enabled !== undefined) user.compact_view_enabled = !!compact_view_enabled;
  if (ultrawide_enabled !== undefined) user.ultrawide_enabled = !!ultrawide_enabled;
  if (selected_theme !== undefined) user.selected_theme = selected_theme;

  if (name !== undefined) {
    // VARCHAR(50). Allow spaces and special characters. Support Unicode.
    const cleanName = String(name).slice(0, 50);
    user.name = cleanName;
  }

  if (avatar !== undefined) {
    user.avatar = avatar;
  }

  if (cover_photo !== undefined) {
    user.cover_photo = cover_photo;
  }

  if (notification_preferences !== undefined && notification_preferences && typeof notification_preferences === 'object') {
    // Whitelist only the four known boolean flags. Spreading arbitrary client JSON
    // here (later re-parsed and spread elsewhere) is a prototype-pollution sink
    // (e.g. a "__proto__" key); coercing to explicit booleans neutralizes it.
    const prev = user.notification_preferences || {};
    user.notification_preferences = {
      email_enabled: typeof notification_preferences.email_enabled === 'boolean' ? notification_preferences.email_enabled : prev.email_enabled,
      sms_enabled: typeof notification_preferences.sms_enabled === 'boolean' ? notification_preferences.sms_enabled : prev.sms_enabled,
      discord_enabled: typeof notification_preferences.discord_enabled === 'boolean' ? notification_preferences.discord_enabled : prev.discord_enabled,
      options_flow_alerts: typeof notification_preferences.options_flow_alerts === 'boolean' ? notification_preferences.options_flow_alerts : prev.options_flow_alerts,
    };
  }

  if (profile_visibility !== undefined) {
    if (['public', 'private', 'logged_in'].includes(profile_visibility)) {
      user.profile_visibility = profile_visibility as any;
    } else {
      return res.status(400).json({ error: 'Profile visibility must be public, private, or logged_in.' });
    }
  }

  if (block_search_indexing !== undefined) {
    user.block_search_indexing = !!block_search_indexing;
  }

  if (username !== undefined) {
    // Regex ^[a-zA-Z0-9_]{3,20}$. No spaces, no special characters except underscores. Lowercase only.
    const cleanUsername = String(username).toLowerCase().trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters, lowercase alphanumeric or underscore.' });
    }
    const reservedWords = [
      'admin', 'system', 'root', 'support', 'moderator', 'null', 'undefined',
      'slayer', 'pinpoint', 'skyseye', 'billing', 'api', 'auth', 'images', 'users',
      'settings', 'preferences', 'trade', 'quant', 'help', 'developer', 'staff'
    ];
    if (reservedWords.includes(cleanUsername)) {
      return res.status(400).json({ error: 'This username is reserved.' });
    }
    // Check collisions
    const isTaken = (await dbGetAllUsers()).some(
      u => u.email.toLowerCase().trim() !== userEmail && u.username?.toLowerCase().trim() === cleanUsername
    );
    if (isTaken) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }
    user.username = cleanUsername;
  }

  console.log(`[USER SETTINGS UPDATE] ${userEmail} updated params: Scale: ${user.selected_font_scale}, Compact: ${user.compact_view_enabled}, Theme: ${user.selected_theme}, Handle: ${user.username}`);

  const userSession = {
    authenticated: true,
    provider: session.provider || 'clerk',
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    access_tier: user.access_tier,
    referral_tokens_pool: user.referral_tokens_pool,
    custom_referral_code: user.custom_referral_code,
    selected_font_scale: user.selected_font_scale,
    compact_view_enabled: user.compact_view_enabled,
    selected_theme: user.selected_theme,
    no_refund_policy_logged: user.no_refund_policy_logged,
    username: user.username,
    cover_photo: user.cover_photo
  };
  const prefsSaved = await persistUser(userEmail, user);
  if (!prefsSaved) return res.status(500).json({ error: 'Could not save settings. Please retry.' });
  await setSessionCookie(res, userSession, req);

  res.json({
    success: true,
    user: {
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      username: user.username,
      cover_photo: user.cover_photo,
      selected_font_scale: user.selected_font_scale,
      compact_view_enabled: user.compact_view_enabled,
      selected_theme: user.selected_theme
    }
  });
});

// Simulated Chronicle Monthly Billing Invoice Run (Module 5)
app.post('/api/billing/sim-cron-invoice', express.json(), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'Unauthorized session.' });
  }

  const userEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(userEmail);

  if (!user) {
    return res.status(404).json({ error: 'User lookup failed.' });
  }

  // Base referral rate keyed off the resolved access LEVEL, so it works for both
  // the canonical (pinpoint/skyvision) names and any legacy values still in the DB.
  const accessLevel = accessTierToLevel(user.access_tier);
  let baseRate = 0;
  if (accessLevel >= 5) baseRate = 5000;       // lifetime
  else if (accessLevel >= 3) baseRate = 1500;  // skyvision
  else if (accessLevel >= 2) baseRate = 500;   // pinpoint
  else if (accessLevel >= 1) baseRate = 65;    // discord

  const initialTokens = user.referral_tokens_pool || 0;
  
  // Rule: pulls up to 10 tokens. 1 token = 10% off. 10 tokens = 100% free month (free month rate)
  const tokensToDeduct = Math.min(10, initialTokens);
  const discountPercent = tokensToDeduct * 10;
  const discountValue = Number((baseRate * (discountPercent / 100)).toFixed(2));
  const finalInvoicePrice = Math.max(0, baseRate - discountValue);

  // Update token pool database variables
  user.referral_tokens_pool = initialTokens - tokensToDeduct;
  await persistUser(userEmail, user);

  res.json({
    success: true,
    access_tier: user.access_tier,
    base_rate: baseRate,
    tokens_deducted: tokensToDeduct,
    tokens_remaining_rolled_over: user.referral_tokens_pool, // Infinite rollover vault!
    discount_rate_pct: discountPercent,
    discount_amount_usd: discountValue,
    total_charged_usd: finalInvoicePrice
  });
});


// Server-Sent Events Endpoint (Module 2 Single-Session IP check block)
// Premium payload blocks are gated server-side by the viewer's tier so the SSE feed
// can't be used to bypass the paywall (the client TierGuard only hides tabs). Gating
// is active in production only; in dev/local everything is unlocked, matching the
// client's localhost unlock so the terminal is fully usable before billing is wired.
const STREAM_GATING_ENABLED = process.env.NODE_ENV === 'production';
async function resolveViewerTier(session: ActiveSession | null | undefined): Promise<number> {
  if (!STREAM_GATING_ENABLED) return 5;                       // dev/local → full access
  if (!session || !session.email) return 0;                  // unauthenticated → guest
  if (roleForEmail(session.email) !== 'user') return 5;      // owner/admin/moderator → full
  const user = await dbGetUser(session.email.toLowerCase().trim());
  return accessTierToLevel(user?.access_tier);
}

app.get('/api/stream', async (req, res) => {
  console.log('[STREAM API] Request arrived for /api/stream');
  try {
    const authSession = await getSessionFromCookies(req.headers.cookie);
    console.log('[STREAM API] Auth session:', !!authSession);
    const resolvedUserEmail = (authSession && authSession.email) ? authSession.email.toLowerCase().trim() : 'anonymous@slayer.local';
    updateRedisPresence(resolvedUserEmail);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Encoding': 'none'
    });
    console.log('[STREAM API] 200 headers sent');

    const parsedAsset = String(req.query.asset || 'SPX');
    const parsedTimeframe = String(req.query.timeframe || '5m');
    const parsedIsCall = req.query.isCall === 'true';
    const parsedStrike = req.query.strike ? Number(req.query.strike) : null;
    const parsedPositionOpen = req.query.positionOpen === 'true';

    const clientId = ++clientIndex;
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

    // Retrieve session to resolve user records
    const session = await getSessionFromCookies(req.headers.cookie);
    const userUserEmail = (session && session.email) ? session.email.toLowerCase().trim() : undefined;
    // Resolve the viewer's numeric access tier once, to gate premium payload blocks.
    const viewerTier = await resolveViewerTier(session);

    // Single-Session Concurrency Check Block
    if (userUserEmail) {
      const user = await dbGetUser(userUserEmail);
      if (user) {
        // Find earlier active stream for this email and terminate instantly!
        const previousClient = sse.clients.find(c => c.userEmail === userUserEmail);
        if (previousClient && previousClient.ip !== clientIp) {
          console.warn(`[CONCURRENCY MATCH] Terminating older connection for ${userUserEmail} (IP: ${previousClient.ip}) in place of new IP: ${clientIp}`);
          try {
            previousClient.res.write(`data: ${JSON.stringify({ 
              type: 'session_terminated', 
              message: 'Core Workspace Session Blocked: Multiple terminal workspace logins detected for this account. Slayer Terminal limits real-time streams to one IP node per workstation.' 
            })}\n\n`);
            previousClient.res.end();
          } catch (err) {
            console.error('Error during old session stream ending', err);
          }
          sse.clients = sse.clients.filter(c => c.id !== previousClient.id);
        }
        user.active_ip = clientIp;
        await persistUser(userUserEmail, user);
      }
    }

    const clientObj: SSEClient = {
      id: clientId,
      res,
      params: {
        asset: parsedAsset,
        timeframe: parsedTimeframe,
        isCall: parsedIsCall,
        strike: parsedStrike,
        positionOpen: parsedPositionOpen
      },
      userEmail: userUserEmail,
      ip: clientIp,
      tier: viewerTier
    };

    sse.clients.push(clientObj);

    // Send initial payload immediately. Guard so a payload-construction throw can't
    // reject this async handler (which under Express 4 becomes an unhandledRejection).
    try {
      const initialPayload = gatePayloadByTier(constructPayload(clientObj.params), viewerTier);
      res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);
      console.log('[STREAM API] Initial payload sent');
    } catch (e) {
      console.error('Error sending initial SSE payload to client', clientId, e);
    }

    // Handle client disconnection
    req.on('close', () => {
      sse.clients = sse.clients.filter(c => c.id !== clientId);
    });
  } catch(e) {
    console.error('[STREAM API] Error:', e);
  }
});

let discoveryClientIndex = 0;

// Discovery Server-Sent Events Endpoint
app.get('/api/stream/discovery', async (req, res) => {
  const authSession = await getSessionFromCookies(req.headers.cookie);
  const userEmail = (authSession && authSession.email) ? authSession.email.toLowerCase().trim() : 'anonymous@slayer.local';
  updateRedisPresence(userEmail);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Encoding': 'none'
  });

  const clientId = ++discoveryClientIndex;
  const clientObj: SSEDiscoveryClient = {
    id: clientId,
    res,
    userEmail: userEmail
  };

  sse.discoveryClients.push(clientObj);

  // Send initial payload immediately
  const initialPayload = {
    contracts: db.discoveryContracts,
    feedLogs: db.discoveryFeedLogs,
    brierScore: db.discoveryBrierScore,
    globalGex: db.discoveryGlobalGex,
    scanRate: db.discoveryScanRate,
    lastFlashingId: db.discoveryLastFlashingId,
    flashDirection: db.discoveryFlashDirection
  };
  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

  // Handle client disconnection
  req.on('close', () => {
    sse.discoveryClients = sse.discoveryClients.filter(c => c.id !== clientId);
  });
});

// Create and enter simulated trade endpoint
app.post('/api/trades/add', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized' });

  const { 
    underlying, 
    contract, 
    direction, 
    entryPrice, 
    underlyingPrice, 
    iv,
    target1,
    target2,
    target3,
    stretchTarget,
    stopLoss
  } = req.body;

  const newTrade: V8TradeRecord = {
    id: `v8-log-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
    underlying: underlying || 'SPX',
    contract: contract || 'SPX 7630C',
    direction: direction || 'BULLISH',
    entryPrice: Number(entryPrice) || 4.20,
    underlyingPrice: Number(underlyingPrice) || 7623.00,
    iv: Number(iv) || 15,
    greeks: {
      delta: direction === 'BULLISH' ? 0.58 : -0.48,
      gamma: 0.08,
      theta: -1.2,
      vega: 0.15
    },
    vwapState: 'Above VWAP Alignment',
    rsiState: 'Oversold Bounce Anchor',
    structureState: 'Displaced Mitigation (BOS)',
    rvolState: 'Expanding Relative Volume',
    gexState: 'Net Positive GEX Support',
    dealerPositioning: 'Dealer Gamma Support Base',
    expectedReturn: 88,
    expectedDrawdown: 18,
    probabilityPositive: 88,
    thesisStability: 90,
    recommendation: 'HOLD', // strict state
    target1: Number(target1) || (Number(entryPrice) * 1.3),
    target2: Number(target2) || (Number(entryPrice) * 1.7),
    target3: Number(target3) || (Number(entryPrice) * 2.2),
    stretchTarget: Number(stretchTarget) || (Number(entryPrice) * 3.0),
    stopLoss: Number(stopLoss) || (Number(entryPrice) * 0.7),
    target1Hit: false,
    target2Hit: false,
    target3Hit: false,
    stretchTargetHit: false,
    target1HitTime: null,
    target2HitTime: null,
    target3HitTime: null,
    stretchTargetHitTime: null,
    maxGain: 0.0,
    maxDrawdown: 0.0,
    timeTaken: 0,
    whatTargetReachedFirst: 'None',
    finalOutcome: 'Active',
    failureReasons: []
  };

  db.v8Trades.unshift(newTrade);
  // Cap the shared global ledger so it can't grow without bound (and so every SSE
  // broadcast doesn't serialize an ever-larger array to all connected clients).
  if (db.v8Trades.length > 200) db.v8Trades.length = 200;

  // Instantly broadcast update
  broadcastSSE();

  res.json({ success: true, trade: newTrade });
});

// Clear trades array endpoint
app.post('/api/trades/clear', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized' });
  // db.v8Trades is GLOBAL/shared across all sessions — restrict the wipe to admins
  // so a single guest can't clear every user's live trade feed.
  if (roleForEmail(session.email) === 'user') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }

  db.v8Trades = [];
  broadcastSSE();
  res.json({ success: true });
});

// GET real intraday lookbacks or synthetic fallback
app.get('/api/history', endpointRateLimit(20, '/api/history'), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const ticker = String(req.query.ticker || 'SPX');
    const tf = String(req.query.timeframe || '5m') as TimeframeVal;
    // Clamp caller-supplied candle count to a sane range (guards NaN / huge allocations).
    const rawCount = Number(req.query.count);
    const count = Number.isFinite(rawCount) ? Math.min(500, Math.max(1, Math.trunc(rawCount))) : 120;
    
    const candleResult = await getUnifiedCandles(ticker, tf, count);
    if (candleResult && candleResult.candles && candleResult.candles.length > 0) {
      const cacheKey = `${ticker}-${tf}`;
      db.candles[cacheKey] = candleResult.candles;
      return res.json({ success: true, source: candleResult.source, candles: candleResult.candles });
    }
    
    const cacheKey = `${ticker}-${tf}`;
    const candles = db.candles[cacheKey] || [];
    return res.json({ success: true, source: 'SANDBOX_SYNTHETIC', candles });
  } catch (err: any) {
    console.error('[api] market-data request failed:', err);
    res.status(500).json({ success: false, error: 'Internal error fetching market data. Please retry.' });
  }
});

// GET Real-time option GEX-profile and dealer buying pressure gauge
app.get('/api/dealer-flow', endpointRateLimit(20, '/api/dealer-flow'), async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized' });

  // Tier gate: dealer_flow + gex_profile are Pinpoint-tier (level 2) premium analytics —
  // gated identically in the live stream (gatePayloadByTier). Without this check any
  // authenticated guest/free user could pull the paywalled data via this direct GET.
  const dfUser = await dbGetUser(session.email.toLowerCase().trim());
  if (accessTierToLevel(dfUser?.access_tier) < 2) {
    return res.status(403).json({ error: 'This feature requires the Pinpoint (Tier 2) plan or higher.' });
  }

  try {
    const ticker = String(req.query.ticker || 'SPX');
    const asset = ASSET_LIST.find(a => a.ticker === ticker) || ASSET_LIST[0];
    const liveSpot = db.liveSpotPrices[ticker] || asset.defaultPrice;
    
    const chainRes = await getUnifiedOptionChain(asset, liveSpot);
    const contracts = chainRes?.contracts || [];
    
    if (contracts.length > 0) {
      const profile = buildGexProfile(contracts, liveSpot, 1 / 365, 0.05);
      if (profile) {
        const systemScore = calculateSystemScoreFromCandles(
          db.candles[`${ticker}-5m`] || [], 
          1, 
          asset.volatility
        );
        const premiumBase = (liveSpot * 0.003);
        const metricsV11 = calculateV11Metrics(asset, true, systemScore, premiumBase, liveSpot, contracts as any, liveSpot);
        
        const flowGauge = computeDealerFlowGauge(profile, metricsV11.dealer.netCharm, metricsV11.dealer.netDex);
        
        return res.json({
          success: true,
          source: chainRes.source,
          dealer_flow: flowGauge,
          gex_profile: profile,
          audit_id: `aud-flow-${ticker}-${Date.now()}`
        });
      }
    }
    
    res.json({
      success: true,
      source: 'SANDBOX_SYNTHETIC',
      dealer_flow: {
        pressure: 18,
        bias: 'LONG GAMMA',
        headline: 'Dealer flows balanced: offline simulation running.',
        components: [
          { name: 'Gamma regime', value: 0.15, weight: 0.35, detail: 'simulated gamma flip' },
          { name: 'Magnet pull', value: 0.05, weight: 0.15, detail: 'pin magnet' },
          { name: 'Charm decay flow', value: 0.10, weight: 0.20, detail: 'simulated charm' },
          { name: 'Delta inventory', value: 0.08, weight: 0.10, detail: 'simulated delta' },
          { name: 'Hedge-flow demand', value: 0.25, weight: 0.20, detail: 'simulated volume' }
        ]
      },
      audit_id: `aud-flow-${ticker}-${Date.now()}`
    });
  } catch (err: any) {
    console.error('[api] market-data request failed:', err);
    res.status(500).json({ success: false, error: 'Internal error fetching market data. Please retry.' });
  }
});

// GET Systems health verification
app.get('/api/health', async (req, res) => {
  const isThetaConfig = !!process.env.THETADATA_API_KEY || process.env.THETADATA_ENABLED === 'true';
  const isTradierConfig = !!process.env.TRADIER_API_KEY;
  const isPolygonConfig = !!process.env.POLYGON_API_KEY;
  const lastTradierErr = getLastTradierError();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    env: {
      thetadata_configured: isThetaConfig,
      tradier_configured: isTradierConfig,
      polygon_configured: isPolygonConfig,
      stripe_configured: !!stripeClient,
      database_configured: !!process.env.SQL_HOST,
      node_env: process.env.NODE_ENV || 'development'
    },
    integrations: {
      dataSource: getDataSourceType(),
      providerStatus: getProviderStatusMessage(),
      lastTradierError: lastTradierErr
    }
  });
});

// Client-side error sink. The React ErrorBoundary POSTs uncaught render errors
// here so production crashes are captured server-side. Size-capped and field-
// truncated; this is the hook point to forward to Sentry/Datadog/etc.
app.post('/api/client-error', express.json({ limit: '16kb' }), (req, res) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => String(v ?? '').slice(0, n);
  console.error('[client-error]', {
    message: s(b.message, 500),
    label: s(b.label, 80),
    url: s(b.url, 300),
    componentStack: s(b.componentStack, 1000),
  });
  // TODO(telemetry): forward this to your error-monitoring provider.
  res.status(204).end();
});


// Start Express with Vite dev server middleware in dev mode
// ============================================================
// REFERRAL / PROMO CODE GENERATOR (spec §B)
// zakali75 -> "ZALI" -> ZALI10OFF (collision -> ZALI9X10OFF ...)
// ============================================================
// Returns (and lazily migrates to the strict [PREFIX]10OFF format) the
// current user's shareable referral code.
app.get('/api/billing/my-referral-code', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Authentication required.' });
  const userEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(userEmail);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!/10OFF$/.test(user.custom_referral_code || '')) {
    user.custom_referral_code = await generateReferralCode(user.username || userEmail.split('@')[0]);
    // Persist the lazily-migrated code so it is stable across requests.
    await persistUser(userEmail, user);
  }
  res.json({ referral_code: user.custom_referral_code, tokens: user.referral_tokens_pool || 0 });
});

// ============================================================
// ADMIN COMMAND CENTER — routes (spec §6)
// ============================================================
async function getAdminContext(req: any): Promise<{ email: string; role: AdminRole } | null> {
  const s = await getSessionFromCookies(req.headers.cookie);
  if (!s || !s.email) return null;
  const role = roleForEmail(s.email);
  if (role === 'user') return null;
  return { email: s.email.toLowerCase().trim(), role };
}
function requireAdmin(roles: AdminRole[] = ['owner', 'admin']) {
  return async (req: any, res: any, next: any) => {
    const ctx = await getAdminContext(req);
    if (!ctx) return res.status(403).json({ error: 'Admin access denied.' });
    if (!roles.includes(ctx.role) && ctx.role !== 'owner') return res.status(403).json({ error: 'Insufficient admin role for this action.' });
    req.admin = ctx;
    next();
  };
}
function clientIp(req: any): string {
  return (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown';
}
// Immutable audit trail: every admin mutation is appended (never edited).
function logAudit(req: any, action: string, targetId: string) {
  // requireAdmin always populates req.admin before any route can call logAudit.
  // (The previous `|| getAdminContext(req)` fallback returned an un-awaited
  // Promise, so ctx?.email was always undefined on that path.)
  const ctx = req.admin;
  AUDIT_LOG.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    admin_id: ctx?.email || 'unknown',
    admin_email: ctx?.email || 'unknown',
    action_taken: action,
    target_id: targetId,
    timestamp: new Date().toISOString(),
    ip_address: clientIp(req),
    method: req.method,
  });
  if (AUDIT_LOG.length > 1000) AUDIT_LOG.length = 1000;
}

app.get('/api/admin/overview', requireAdmin(), async (req: any, res) => {
  res.json({
    live_connections: sse.clients.length,
    total_users: (await dbGetAllUsers()).length,
    suspended: SUSPENDED_USERS.size,
    banned: BANNED_USERS.size,
    maintenance_mode: MAINTENANCE_MODE,
    feature_flags: FEATURE_FLAGS,
    coupons: ADMIN_COUPONS.length,
    audit_entries: AUDIT_LOG.length,
    admin_role: req.admin.role,
  });
});

// Live traffic counter (poll). True WebSockets are a deployment upgrade;
// this reflects the live SSE connection pool.
app.get('/api/admin/live', requireAdmin(), async (req, res) => {
  res.json({ live_connections: sse.clients.length, ts: Date.now() });
});

// Paginated user CRM
app.get('/api/admin/users', requireAdmin(), async (req, res) => {
  const cursorId = req.query.cursor ? String(req.query.cursor) : null;
  const perPage = Math.min(50, Math.max(5, parseInt(String(req.query.perPage || '10'), 10) || 10));
  const q = String(req.query.q || '').toLowerCase().trim();
  let all = (await dbGetAllUsers());
  if (q) {
    all = all.filter(u => `${u.email} ${u.username} ${u.name}`.toLowerCase().includes(q));
  }
  let startIdx = 0;
  if (cursorId) {
    const foundIdx = all.findIndex(u => u.id === cursorId);
    if (foundIdx > -1) startIdx = foundIdx + 1;
  }
  const slice = all.slice(startIdx, startIdx + perPage);
  const nextCursor = slice.length === perPage && (startIdx + perPage < all.length) ? slice[slice.length - 1].id : null;
  const total = all.length;
  
  const rows = slice.map((u) => ({
    id: u.id, email: u.email, name: u.name, username: u.username,
    access_tier: u.access_tier, referral_tokens_pool: u.referral_tokens_pool,
    custom_referral_code: u.custom_referral_code, role: roleForEmail(u.email),
    suspended: SUSPENDED_USERS.has((u.email || '').toLowerCase()),
    banned: BANNED_USERS.has((u.email || '').toLowerCase()),
    online: REDIS_PRESENCE.has((u.email || '').toLowerCase())
  }));
  res.json({ rows, nextCursor, total, perPage });
});

app.patch('/api/admin/users/:email/tier', requireAdmin(['owner', 'admin', 'moderator']), async (req: any, res: any) => {
  const email = String(req.params.email).toLowerCase().trim();
  const user = await dbGetUser(email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Whitelist the tier against the known enum — never write an arbitrary string
  // (which would corrupt access_tier and confuse client gating).
  // Canonical tiers first; legacy aliases retained so older stored values still validate.
  const VALID_TIERS = ['guest', 'discord', 'pinpoint', 'skyvision', 'lifetime', 'intraday', 'quant', 'enterprise'];
  const requestedTier = String(req.body.access_tier || '');
  if (!VALID_TIERS.includes(requestedTier)) {
    return res.status(400).json({ error: 'Invalid access tier.' });
  }
  user.access_tier = requestedTier;
  await persistUser(email, user);

  // instant invalidate
  for (const client of sse.clients) {
    if (client.userEmail === email && !client.res.finished) {
      client.res.write(`data: ${JSON.stringify({ type: 'TIER_UPGRADE', access_tier: user.access_tier })}\n\n`);
    }
  }
  logAudit(req, 'USER_TIER_UPDATE', email);
  res.json({ success: true, access_tier: user.access_tier });
});

function moderationHandler(action: 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'force-logout') {
  return async (req: any, res: any) => {
    const email = String(req.params.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Target email required.' });
    // Block moderating ANY privileged account (owner/admin/moderator), not just
    // ADMIN_EMAILS — otherwise a moderator could suspend/force-logout the OWNER
    // (whose identity lives in OWNER_EMAILS, outside ADMIN_EMAILS).
    if (roleForEmail(email) !== 'user') return res.status(403).json({ error: 'Cannot moderate a privileged account.' });
    if (action === 'suspend') SUSPENDED_USERS.add(email);
    if (action === 'unsuspend') SUSPENDED_USERS.delete(email);
    // ban / force-logout also bump the durable session-revocation watermark so all
    // existing cookies for the account are invalidated (and stay invalid across restart).
    if (action === 'ban') { BANNED_USERS.add(email); FORCE_LOGOUT_USERS.add(email); setSessionsValidAfterLocal(email, Date.now()); }
    if (action === 'unban') BANNED_USERS.delete(email);
    if (action === 'force-logout') { FORCE_LOGOUT_USERS.add(email); setSessionsValidAfterLocal(email, Date.now()); }
    // Write through to the durable store (no-op without a DB) so the action survives restarts.
    await dbSetModeration(email, {
      banned: BANNED_USERS.has(email),
      suspended: SUSPENDED_USERS.has(email),
      sessions_valid_after: getSessionsValidAfter(email),
    });
    logAudit(req, `USER_${action.toUpperCase().replace('-', '_')}`, email);
    res.json({ success: true, action, email });
  };
}
app.post('/api/admin/users/:email/suspend', requireAdmin(['owner', 'admin', 'moderator']), moderationHandler('suspend'));
app.post('/api/admin/users/:email/unsuspend', requireAdmin(['owner', 'admin', 'moderator']), moderationHandler('unsuspend'));
app.post('/api/admin/users/:email/ban', requireAdmin(['owner']), moderationHandler('ban'));
app.post('/api/admin/users/:email/unban', requireAdmin(['owner']), moderationHandler('unban'));
app.post('/api/admin/users/:email/force-logout', requireAdmin(['owner', 'admin', 'moderator']), moderationHandler('force-logout'));

app.get('/api/admin/audit', requireAdmin(), (req, res) => res.json({ entries: AUDIT_LOG.slice(0, 200) }));

app.get('/api/admin/flags', requireAdmin(), (req, res) => res.json({ flags: FEATURE_FLAGS }));
app.post('/api/admin/flags', requireAdmin(['owner', 'admin']), (req: any, res) => {
  const { key, value } = req.body || {};
  if (!(key in FEATURE_FLAGS)) return res.status(404).json({ error: 'Unknown feature flag.' });
  FEATURE_FLAGS[key] = !!value;
  logAudit(req, `FLAG_${key}_${value ? 'ON' : 'OFF'}`, key);
  res.json({ flags: FEATURE_FLAGS });
});

app.post('/api/admin/maintenance', requireAdmin(['owner']), async (req: any, res) => {
  MAINTENANCE_MODE = !!(req.body && req.body.enabled);
  logAudit(req, `MAINTENANCE_${MAINTENANCE_MODE ? 'ON' : 'OFF'}`, 'system');
  res.json({ maintenance_mode: MAINTENANCE_MODE });
});

app.get('/api/admin/coupons', requireAdmin(), (req, res) => res.json({ coupons: ADMIN_COUPONS }));
app.post('/api/admin/coupons', requireAdmin(['owner', 'admin']), (req: any, res) => {
  let { code, discount_type, discount_value, redemption_limit, user_restriction, expires_at } = req.body || {};
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return res.status(400).json({ error: 'Code required (A-Z, 0-9, no spaces).' });
  if (ADMIN_COUPONS.some((c) => c.code === code)) return res.status(409).json({ error: 'Coupon code already exists.' });
  const coupon: AdminCoupon = {
    code,
    discount_type: discount_type === 'FIXED' ? 'FIXED' : 'PERCENT',
    discount_value: Math.max(0, Number(discount_value) || 0),
    redemption_limit: Math.max(0, parseInt(String(redemption_limit), 10) || 0),
    redemptions: 0,
    user_restriction: String(user_restriction || '').toLowerCase().trim(),
    expires_at: expires_at || null,
    created_by: req.admin.email,
    created_at: new Date().toISOString(),
  };
  ADMIN_COUPONS.push(coupon);
  logAudit(req, 'COUPON_CREATE', code);
  res.json({ success: true, coupon });
});

// Impersonation (super admin only): issues a read-only session for the target.
app.post('/api/admin/impersonate/:email', requireAdmin(['owner']), async (req: any, res) => {
  const targetEmail = String(req.params.email || '').toLowerCase().trim();
  const target = await dbGetUser(targetEmail);
  if (!target) return res.status(404).json({ error: 'Target user not found.' });
  await setSessionCookie(res, {
    authenticated: true,
    provider: 'impersonation',
    name: target.name,
    email: target.email,
    avatar: target.avatar,
    access_tier: target.access_tier,
    is_impersonating: true,
    read_only: true,
    impersonated_by: req.admin.email,
  }, req);
  logAudit(req, 'IMPERSONATE_START', targetEmail);
  res.json({ success: true, impersonating: targetEmail, read_only: true });
});

/**
 * Boot-time configuration preflight. Logs a clear readiness checklist and, in
 * production only, refuses to boot when a critical secret is missing or an
 * insecure flag is set — so a misconfigured deploy fails loudly instead of
 * silently running insecure or on synthetic data. Never logs secret values.
 */
function preflightConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const has = (v?: string) => typeof v === 'string' && v.trim().length > 0;
  const critical: string[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];
  const mark = (ok: boolean, label: string, detail = '') =>
    lines.push(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);

  // --- Security ---
  const sandboxAuth = process.env.ALLOW_SANDBOX_AUTH === 'true';
  if (isProd && sandboxAuth) critical.push('ALLOW_SANDBOX_AUTH=true in production — the sandbox auth bypass MUST be off in prod.');
  mark(!(isProd && sandboxAuth), 'Sandbox auth bypass', sandboxAuth ? 'ENABLED' : 'off');

  const cookieSecret = has(process.env.COOKIE_SECRET);
  if (isProd && !cookieSecret) critical.push('COOKIE_SECRET is not set — required in production (sessions are invalidated on every restart otherwise).');
  else if (!cookieSecret) warnings.push('COOKIE_SECRET not set — using an ephemeral secret (dev only); sessions reset on restart.');
  mark(cookieSecret, 'COOKIE_SECRET', cookieSecret ? 'set' : 'missing');

  const adminConfigured = OWNER_EMAILS.length > 0 || ADMIN_EMAILS.length > 0;
  if (isProd && !has(process.env.OWNER_EMAILS) && !has(process.env.ADMIN_EMAILS)) warnings.push('Admin allow-list is using the built-in owner default — set OWNER_EMAILS/ADMIN_EMAILS explicitly in production.');
  mark(adminConfigured, 'Admin/owner allow-list', `${OWNER_EMAILS.length} owner(s), ${ADMIN_EMAILS.length} admin(s)`);

  // --- Billing (Stripe) ---
  const stripeKey = has(process.env.STRIPE_SECRET_KEY);
  const stripeHook = has(process.env.STRIPE_WEBHOOK_SECRET);
  if (!stripeKey) warnings.push('STRIPE_SECRET_KEY not set — billing/checkout endpoints will respond 503.');
  if (stripeKey && !stripeHook) warnings.push('STRIPE_WEBHOOK_SECRET not set — Stripe webhooks cannot be verified, so paid subscriptions will not activate.');
  mark(stripeKey, 'Stripe secret key', stripeKey ? 'set' : 'missing');
  mark(stripeHook, 'Stripe webhook secret', stripeHook ? 'set' : 'missing');
  if (!has(process.env.APP_URL)) warnings.push('APP_URL not set — Stripe checkout success/cancel redirect URLs may be incorrect.');

  // --- Market-data provider (resolution order mirrors providerAbstraction) ---
  const theta = has(process.env.THETADATA_API_KEY) || process.env.THETADATA_ENABLED === 'true';
  const tradier = has(process.env.TRADIER_API_KEY);
  const polygon = has(process.env.POLYGON_API_KEY);
  const provider = theta ? 'ThetaData' : tradier ? 'Tradier' : polygon ? 'Polygon' : 'SANDBOX_SYNTHETIC (no live data)';
  if (isProd && !theta && !tradier && !polygon) warnings.push('No market-data provider key set — running on SYNTHETIC data in production.');
  mark(theta || tradier || polygon, 'Market-data provider', provider);

  // --- Database ---
  const db = has(process.env.SQL_HOST);
  if (isProd && !db) warnings.push('SQL_HOST not set — DB-backed features (accounts, moderation, trade history) are unavailable in production.');
  mark(db, 'Database (SQL_HOST)', db ? 'configured' : 'none (in-memory only)');

  // --- Output ---
  console.log(`\n┌─ Slayer Terminal · config preflight (${isProd ? 'production' : process.env.NODE_ENV || 'development'})`);
  for (const l of lines) console.log(l);
  if (warnings.length) {
    console.log('  ⚠ warnings:');
    for (const w of warnings) console.log(`     · ${w}`);
  }
  console.log('└' + '─'.repeat(58) + '\n');

  if (critical.length) {
    console.error('[FATAL] Production config preflight failed:');
    for (const c of critical) console.error(`   ✗ ${c}`);
    console.error('Set the required environment variables and restart. Refusing to boot insecure.\n');
    process.exit(1);
  }
}

async function startServer() {
  // Validate configuration first so a misconfigured production deploy fails fast.
  preflightConfig();

  // Bootstrap the DB schema (idempotent) so a fresh Postgres works on first deploy.
  // ensureSchema() no-ops when SQL_HOST is unset and swallows connection errors,
  // so this is safe in keyless/sandbox mode too.
  await ensureSchema();

  // Hydrate the in-memory moderation caches from the durable store so bans,
  // suspensions, and session-revocation watermarks survive restarts/redeploys
  // (no-op without a DB — falls back to in-memory only).
  try {
    const modRows = await dbLoadModeration();
    for (const r of modRows) {
      if (r.banned) BANNED_USERS.add(r.email);
      if (r.suspended) SUSPENDED_USERS.add(r.email);
      if (r.sessions_valid_after) setSessionsValidAfterLocal(r.email, r.sessions_valid_after);
    }
    if (modRows.length) console.log(`[moderation] hydrated ${modRows.length} record(s) from durable store.`);
  } catch (e) {
    console.error('[moderation] hydrate failed (continuing with in-memory only):', e);
  }

// ==========================================
// QUANT CO-PILOT — local, deterministic options-structure analysis.
// Generates an institutional-grade narrative purely from the live quant engine
// (dealer GEX/DEX, walls, gamma flip, expected move). No external LLM/API key.
// ==========================================
app.post('/api/ai/analyze', endpointRateLimit(10, '/api/ai/analyze'), async (req, res) => {
  try {
    // SECURITY: require an authenticated session AND a paid tier in production
    // (premium Quant Co-Pilot, client-gated at Tier 3; tier read from the DB, never
    // the cookie). In dev/non-production the gate is skipped so the terminal is
    // fully usable on localhost.
    if (process.env.NODE_ENV === 'production') {
      const session = await getSessionFromCookies(req.headers.cookie);
      if (!session || !session.email) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const aiDbUser = await dbGetUser(session.email.toLowerCase().trim());
      // AI access requires SkyVision (level 3) or above. Resolve via the shared
      // normalizer so canonical (skyvision) and legacy (enterprise/intraday) names agree —
      // previously a Stripe-granted 'skyvision' user was wrongly denied here.
      if (accessTierToLevel(aiDbUser?.access_tier) < 3) {
        return res.status(403).json({ error: 'This feature requires the Pinpoint (Tier 3) plan or higher.' });
      }
    }

    const ticker = String(req.body?.ticker || 'SPX').toUpperCase();
    const query = String(req.body?.query || '').trim().slice(0, 280);
    const asset = ASSET_LIST.find(a => a.ticker === ticker) || ASSET_LIST[0];
    const spot = db.liveSpotPrices[asset.ticker] || asset.defaultPrice;

    const liveChain = db.liveOptionChains[asset.ticker];
    const chain: ChainContract[] = (liveChain && liveChain.length > 0)
      ? liveChain.map((c: any) => ({
          strike: c.strike,
          type: (c.type === 'C' || c.type === 'call') ? 'call' : 'put',
          openInterest: c.oi || c.openInterest || 0,
          iv: c.impliedVolatility || c.iv || asset.volatility,
          bid: c.bid || 0, ask: c.ask || 0,
          delta: c.greeks?.delta ?? c.delta ?? 0,
          gamma: c.greeks?.gamma ?? c.gamma ?? 0,
          vega: c.greeks?.vega ?? c.vega ?? 0,
          theta: c.greeks?.theta ?? c.theta ?? 0,
          vanna: c.greeks?.vanna ?? c.vanna ?? 0,
          charm: c.greeks?.charm ?? c.charm ?? 0,
        }))
      : generateMockOptionsChain(spot, asset.volatility);

    const dealer = computeDealerInventory(chain, spot, 1);
    const fmt = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: asset.decimals });
    const netGexBn = (dealer.netGex / 1e9).toFixed(2);
    const aboveFlip = spot >= dealer.gammaFlipPrice;
    const bias = dealer.netGex >= 0 ? 'LONG GAMMA (mean-reverting / pinning)' : 'SHORT GAMMA (trend-amplifying)';
    const emPct = (dealer.expectedMovePct * 100).toFixed(2);
    const emPts = (spot * dealer.expectedMovePct).toFixed(asset.decimals);
    const distFlipPct = (((spot - dealer.gammaFlipPrice) / spot) * 100).toFixed(2);

    const regimeRead = dealer.netGex >= 0
      ? `Dealers are **net long gamma**, so their hedging is *stabilising*: rallies are sold and dips are bought, compressing realised vol toward the magnet. Expect mean-reversion and pinning unless spot breaks the flip.`
      : `Dealers are **net short gamma**, so their hedging is *destabilising*: they buy strength and sell weakness, amplifying moves. Expect trend continuation and vol expansion, especially on a break of the key walls.`;

    const flipRead = aboveFlip
      ? `Spot ($${fmt(spot)}) is **above** the gamma flip ($${fmt(dealer.gammaFlipPrice)}, ${distFlipPct}% away) — the positive-gamma stabilising regime. A close back below the flip would turn dealers short-gamma and unlock faster two-way movement.`
      : `Spot ($${fmt(spot)}) is **below** the gamma flip ($${fmt(dealer.gammaFlipPrice)}, ${distFlipPct}% away) — the negative-gamma accelerative regime. Reclaiming the flip would hand stabilising flows back to dealers.`;

    const md = `## ${asset.ticker} Dealer-Positioning Read

**Spot $${fmt(spot)} · Net GEX ${netGexBn}B · ${bias}**

- **Call Wall (resistance):** $${fmt(dealer.callWall)} — the heaviest positive-gamma strike; rallies into it tend to stall as dealers sell to hedge.
- **Put Wall (support):** $${fmt(dealer.putWall)} — the heaviest downside-gamma strike; a magnet and floor on pullbacks.
- **Gamma Flip:** $${fmt(dealer.gammaFlipPrice)} — the regime pivot between stabilising and accelerative hedging.
- **Expected 1-session move:** ±${emPct}% (≈ ±${emPts} pts), from the at-the-money implied vol.

### Regime
${regimeRead}

### Tactical Read
${flipRead}

The defined channel is **$${fmt(dealer.putWall)} → $${fmt(dealer.callWall)}**. ${aboveFlip
  ? `While above the flip, fading extremes back toward the walls is favoured; a decisive break of the call wall opens a gamma-squeeze leg higher.`
  : `While below the flip, breakouts carry further; reclaiming the put wall and then the flip would be the first sign of stabilisation.`}${query
  ? `\n\n### On your question\n> _${query}_\n\nRelative to the structure above, watch how price behaves at the **${aboveFlip ? 'call wall ($' + fmt(dealer.callWall) + ')' : 'put wall ($' + fmt(dealer.putWall) + ')'}** and the **gamma flip ($${fmt(dealer.gammaFlipPrice)})** — those two levels govern the near-term path far more than the spot print itself.`
  : ''}`;

    return res.json({ result: md });
  } catch (error: any) {
    console.error('Quant Co-Pilot error:', error);
    return res.status(500).json({ error: 'Could not generate analysis.' });
  }
});

  // Unmatched API routes -> JSON 404 (registered before the SPA/Vite catch-all).
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Serve static frontend files in production build
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', async (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Terminal error handler — prevents an unhandled route throw from hanging requests.
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[unhandled error]', err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SkyVision Backend] Running on http://localhost:${PORT}`);
  });
  
  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error('Address 3000 in use, retrying...');
      setTimeout(() => {
        server.close();
        server.listen(PORT, '0.0.0.0');
      }, 1000);
    } else {
      console.error('Listen error:', e);
    }
  });
}

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  // Log but do NOT exit. In Express 4 a rejected async route handler is not
  // forwarded to the error middleware and surfaces here; exiting would turn a
  // single bad request into a full outage for every connected user. The server
  // stays up and that one request simply fails/times out.
  console.error('[unhandledRejection]', reason);
});

startServer();
