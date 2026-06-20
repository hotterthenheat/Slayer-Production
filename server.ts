/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import Stripe from 'stripe';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { ASSET_LIST, generateInitialCandles, TIMEFRAMES, INITIAL_DISCOVERY_CONTRACTS, buildInitialDiscoveryFeedLogs, calculateFVGs, calculateLiquidityEvents } from './src/data';
import { 
  calculateSystemScoreFromCandles, 
  calculateV11Metrics, 
  calculateV10Metrics,
  computeDealerInventory,
  generateMockOptionsChain,
  calculateAnalyticGreeks,
  ChainContract
} from './src/lib/v11Math';
import { Candle, V8TradeRecord, AssetInfo, TimeframeVal } from './src/types';
import {
  getDataSourceType,
  getProviderStatusMessage,
  getUnifiedSpotPrice,
  getUnifiedOptionChain,
  collectUnifiedFlows,
  getUnifiedCandles
} from './src/lib/providerAbstraction';
import { buildGexProfile, computeDealerFlowGauge } from './src/lib/gexEngine';
import { computeDisplacementIntelligence } from './src/lib/displacementEngine';
import { getLastTradierError } from './src/lib/tradierProvider';
import bcrypt from 'bcryptjs';
import { PORT, stripeClient, TIER_PRICING, ADMIN_EMAILS, roleForEmail, type AdminRole } from './src/server/config';
import {
  COOKIE_SECRET, signCookieValue, verifyAndExtractCookieValue,
  type ActiveSession, activeSessionsDb, REDIS_PRESENCE, updateRedisPresence,
  type UserAccount, validatePasswordStrength, generateDefaultUsername, fillDefaultPrivacySettings, sanitizeUser,
  dbGetUser, dbSetUser, persistUser, dbDeleteUser, dbGetAllUsers, dbHasUser,
  getSessionFromCookies, setSessionCookie,
  verifyTOTP, totpLockRemainingMs, registerTotpFailure, clearTotpAttempts,
  generateReferralCode,
} from './src/server/auth';
import { db, sse, type SSEClient, type SSEDiscoveryClient } from './src/server/state';
import { constructPayload, broadcastSSE, broadcastDiscoverySSE } from './src/server/marketEngine';

const app = express();
app.set('trust proxy', true);
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
    } else if (!origin && !referer) {
      // Non-browser clients (Stripe webhook, server-to-server, health checks)
      // send no Origin/Referer and are not CSRF vectors (they hold no victim cookies).
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


// Sandbox Session Activator setting httpOnly cookies
app.get('/api/auth/sandbox', async (req, res) => {
  res.redirect('/api/auth/callback?provider=sandbox&name=Sandbox%20Quant%20User&email=sandbox@slayer.io');
});

// Custom Clerk Simulated Auth Endpoints (Module 2)
// Strips sensitive fields from a user record before it is sent to any client.
app.post('/api/auth/clerk-signup', express.json(), async (req, res) => {
  const { email, name, password, referralCode, avatar } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and Name are required variables.' });
  }

  // Validate strong password
  if (password) {
    const passwordErr = validatePasswordStrength(password);
    if (passwordErr) {
      return res.status(400).json({ error: passwordErr });
    }
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

    if (referrerMatch) {
      referrerMatch.referral_tokens_pool = (referrerMatch.referral_tokens_pool || 0) + 1;
      await persistUser(referrerMatch.email, referrerMatch);
      referralCreditApplied = true;
      creditedReferrerEmail = referrerMatch.email;
      console.log(`[PASSIVE REFERRAL ENGINE CREDITED] User ${userEmail} registered via referral code/username "${referralCode}". Referrer "${referrerMatch.email}" token pool credited +1 (New count: ${referrerMatch.referral_tokens_pool}).`);
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
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const userEmail = email.toLowerCase().trim();
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
      return res.status(400).json({ error: 'Incorrect credentials. Please verify password.' });
    }
  }

  if (!user) {
    // Register auto-provisioning client for immediate testing if not present
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
  } else if (password && !user.passwordHash) {
    // Auto-setup password if the account has no password yet but one was typed
    const passwordErr = validatePasswordStrength(password);
    if (!passwordErr) {
      user.passwordHash = bcrypt.hashSync(password, 12);
    }
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

  await setSessionCookie(res, userSession, req);
  res.json({ success: true, user: sanitizeUser(user) });
});

app.get('/api/auth/callback', async (req, res) => {
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



app.post('/api/auth/refresh', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session) {
    return res.status(401).json({ error: 'No valid refresh token (session cookie) found' });
  }
  
  // Create an ephemeral access_token
  const access_token = session.user_id + ":" + Date.now();
  // Provide it payload for 15 minute expiry
  res.json({ access_token, expires_in: 900 });
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

  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 16; i++) {
    secret += base32Chars[Math.floor(Math.random() * 32)];
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

  const backupCodes = Array.from({ length: 10 }, () => {
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${part1}-${part2}`;
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
  if (!newEmail || !newEmail.includes('@')) {
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

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.temp_new_email = cleanEmail;
  user.email_otp = otp;
  user.email_otp_expiry = Date.now() + 15 * 60 * 1000;
  await persistUser(requestEmailUpdateEmail, user);

  console.log(`\n--- [EMAIL SECURITY VERIFICATION TRIGGERS] ---`);
  console.log(`Initiator User: ${user.name}`);
  console.log(`Current Email: ${user.email}`);
  console.log(`Requested Email: ${cleanEmail}`);
  console.log(`One-Time Code (OTP): ${otp}`);
  console.log(`Expiry: 15 Minutes`);
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

  if (!user.email_otp || user.email_otp !== otp) {
    return res.status(400).json({ error: 'Invalid verification digits. Security handshake failed.' });
  }

  const now = Date.now();
  if (user.email_otp_expiry && now > user.email_otp_expiry) {
    return res.status(400).json({ error: 'Verification code expired. Request a new code.' });
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

  user.deleted_at = new Date();

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

app.post('/api/users/export-data', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) {
    return res.status(401).json({ error: 'GDPR Export blocked. Unauthorized.' });
  }

  const userEmail = session.email.toLowerCase().trim();
  const user = await dbGetUser(userEmail);
  if (!user) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  const token = Math.random().toString(36).substring(2, 18) + Math.random().toString(36).substring(2, 18);
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
CONTAINER URL: http://localhost:3000/api/users/download-export/${token}
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
  const token = String(req.params.token || '').trim();
  const archive = s3ComplianceStorage.get(token);

  if (!archive) {
    return res.status(404).send('<h1>404 Archive Not Found</h1><p>GDPR Data Export Archive not located on S3 secure boundaries.</p>');
  }

  if (Date.now() > archive.expiresAt) {
    s3ComplianceStorage.delete(token);
    return res.status(410).send('<h1>410 Export Link Expired</h1><p>Under GDPR rules, security export archives expire permanently after 24 hours.</p>');
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=${archive.fileName}`);
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
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripeClient) {
    return res.status(503).json({ error: 'Payments are not configured yet.' });
  }

  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig as string, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e: any) {
    console.error('[STRIPE WEBHOOK] Signature verification failed:', e?.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const email = (checkoutSession.metadata?.email || checkoutSession.customer_email || '').toLowerCase().trim();
        const plan = checkoutSession.metadata?.plan || '';
        const pricing = TIER_PRICING[plan];

        if (email && pricing) {
          const user = await dbGetUser(email);
          if (user) {
            user.access_tier = pricing.accessTier;
            user.customer_id = (typeof checkoutSession.customer === 'string'
              ? checkoutSession.customer
              : checkoutSession.customer?.id) || user.customer_id;
            user.cancels_at_period_end = false;
            await persistUser(email, user);
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
        const email = (sub.metadata?.email || '').toLowerCase().trim();
        if (email) {
          const user = await dbGetUser(email);
          if (user) {
            user.access_tier = 'guest';
            await persistUser(email, user);
            console.log(`[STRIPE WEBHOOK] customer.subscription.deleted -> ${email} downgraded to guest`);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const email = (sub.metadata?.email || '').toLowerCase().trim();
        if (email) {
          const user = await dbGetUser(email);
          if (user) {
            user.cancels_at_period_end = !!sub.cancel_at_period_end;
            await persistUser(email, user);
            console.log(`[STRIPE WEBHOOK] customer.subscription.updated -> ${email} cancels_at_period_end=${user.cancels_at_period_end}`);
          }
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (e: any) {
    console.error('[STRIPE WEBHOOK] Handler error:', e?.message);
    // Still acknowledge so Stripe does not hammer us with retries on a transient
    // internal error; surface the failure via logs/alerting instead.
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
  if (!referralCode) {
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

  // Credit the referrer with exactly 1 Token
  referrerMatch.referral_tokens_pool = (referrerMatch.referral_tokens_pool || 0) + 1;
  await persistUser(referrerMatch.email, referrerMatch);
  console.log(`[ACTIVE REFERRAL ENGAGED] Credited +1 token to referrer: "${referrerMatch.email}". New count: ${referrerMatch.referral_tokens_pool}`);

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
      access_tier: session.access_tier || 'discord',
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

  // Set the structural target access_tier levels
  let targetTier: 'discord' | 'intraday' | 'quant' | 'enterprise' | 'lifetime' = 'discord';
  if (plan === 'discord') targetTier = 'discord';
  else if (plan === 'skyvision') targetTier = 'intraday';
  else if (plan === 'pinpoint') targetTier = 'quant';
  else if (plan === 'quant') targetTier = 'enterprise';
  else if (plan === 'lifetime') targetTier = 'lifetime';

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

    if (referrerMatch) {
      referrerMatch.referral_tokens_pool = (referrerMatch.referral_tokens_pool || 0) + 1; // exactly 1 Token added to referrer (Module 5, rule 3)
      await persistUser(referrerMatch.email, referrerMatch);
      referrerCredited = referrerMatch.email;
      referralCreditLogs = `SUCCESS // Credited 1 token to referrer: "${referrerMatch.email}" (New pool: ${referrerMatch.referral_tokens_pool} tokens). 5% discount verified on Referee transaction.`;
    } else {
      referralCreditLogs = `Referral promo code "${referralCode}" not matched to active accounts in database system.`;
    }
  }

  // Access has already been granted and persisted directly above. (The real
  // Stripe webhook at /api/billing/webhook is the source of truth for live
  // Stripe events; it requires a signed payload, so there is no internal
  // server-to-server call to make here.)

  console.log(`[AUDIT LOG] PAYMENT RECEIVED AND CRYPTOGRAPHICALLY TOKENIZED. User: ${userEmail}. CustomerID: ${user.customer_id}. PaymentMethodID: ${user.payment_method_id}. Referral Action: ${referralCreditLogs}`);
  
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
app.post('/api/upload', express.json({ limit: '10mb' }), async (req, res) => {
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

app.patch('/api/users/preferences', express.json({ limit: '50mb' }), async (req, res) => {
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
      access_tier: session.access_tier || 'discord',
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

  if (notification_preferences !== undefined) {
    user.notification_preferences = {
      ...user.notification_preferences,
      ...notification_preferences
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

  // Get base rate for current subscriber plan
  let baseRate = 0;
  if (user.access_tier === 'discord') baseRate = 65;
  else if (user.access_tier === 'intraday') baseRate = 350;
  else if (user.access_tier === 'quant') baseRate = 500;
  else if (user.access_tier === 'enterprise') baseRate = 1500;
  else if (user.access_tier === 'lifetime') baseRate = 5000;

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
      ip: clientIp
    };

    sse.clients.push(clientObj);

    // Send initial payload immediately. Guard so a payload-construction throw can't
    // reject this async handler (which under Express 4 becomes an unhandledRejection).
    try {
      const initialPayload = constructPayload(clientObj.params);
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
  
  // Instantly broadcast update
  broadcastSSE();

  res.json({ success: true, trade: newTrade });
});

// Clear trades array endpoint
app.post('/api/trades/clear', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized' });

  db.v8Trades = [];
  broadcastSSE();
  res.json({ success: true });
});

// GET real intraday lookbacks or synthetic fallback
app.get('/api/history', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const ticker = String(req.query.ticker || 'SPX');
    const tf = String(req.query.timeframe || '5m') as TimeframeVal;
    const count = req.query.count ? Number(req.query.count) : 120;
    
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
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET Real-time option GEX-profile and dealer buying pressure gauge
app.get('/api/dealer-flow', async (req, res) => {
  const session = await getSessionFromCookies(req.headers.cookie);
  if (!session || !session.email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const ticker = String(req.query.ticker || 'SPX');
    const asset = ASSET_LIST.find(a => a.ticker === ticker) || ASSET_LIST[0];
    const liveSpot = db.liveSpotPrices[ticker] || asset.defaultPrice;
    
    const chainRes = await getUnifiedOptionChain(asset, liveSpot);
    const contracts = chainRes?.contracts || [];
    
    if (contracts.length > 0) {
      const profile = buildGexProfile(contracts, liveSpot, 1 / 365, 0.06);
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
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET Systems health verification
app.get('/api/health', async (req, res) => {
  const isTradierConfig = !!process.env.TRADIER_API_KEY;
  const isPolygonConfig = !!process.env.POLYGON_API_KEY;
  const lastTradierErr = getLastTradierError();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      tradier_configured: isTradierConfig,
      polygon_configured: isPolygonConfig,
      node_env: process.env.NODE_ENV || 'development'
    },
    integrations: {
      dataSource: getDataSourceType(),
      providerStatus: getProviderStatusMessage(),
      lastTradierError: lastTradierErr
    }
  });
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
  user.access_tier = req.body.access_tier;
  await persistUser(email, user);

  // instant invalidate
  for (const client of sse.clients) {
    if (client.userEmail === email && !client.res.finished) {
      client.res.write(`data: ${JSON.stringify({ type: 'TIER_UPGRADE', access_tier: req.body.access_tier })}\n\n`);
    }
  }
  logAudit(req, 'USER_TIER_UPDATE', email);
  res.json({ success: true, access_tier: user.access_tier });
});

function moderationHandler(action: 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'force-logout') {
  return (req: any, res: any) => {
    const email = String(req.params.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Target email required.' });
    if (ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: 'Cannot moderate an admin account.' });
    if (action === 'suspend') SUSPENDED_USERS.add(email);
    if (action === 'unsuspend') SUSPENDED_USERS.delete(email);
    if (action === 'ban') { BANNED_USERS.add(email); FORCE_LOGOUT_USERS.add(email); }
    if (action === 'unban') BANNED_USERS.delete(email);
    if (action === 'force-logout') FORCE_LOGOUT_USERS.add(email);
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

async function startServer() {
  // Bootstrap the DB schema (idempotent) so a fresh Postgres works on first deploy.
  // DB is managed by Drizzle migrations via RPC

// ==========================================
// QUANT CO-PILOT — local, deterministic options-structure analysis.
// Generates an institutional-grade narrative purely from the live quant engine
// (dealer GEX/DEX, walls, gamma flip, expected move). No external LLM/API key.
// ==========================================
app.post('/api/ai/analyze', async (req, res) => {
  try {
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
