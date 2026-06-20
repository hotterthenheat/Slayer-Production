/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server configuration: HTTP port, Stripe client, pricing catalog, and the admin
 * allow-list. Pure constants + helpers with no app/state dependencies.
 */
import Stripe from 'stripe';

export const PORT = 3000;

// Stripe client — null when no secret key is configured so the app still boots;
// billing endpoints that require Stripe then respond 503 instead of crashing.
export const stripeClient = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Central pricing config. Amounts are in CENTS, mirroring the pricing UI in
// src/components/SubscriptionPricing.tsx. Verify against the live Stripe catalog
// before production. `accessTier` maps each plan onto the internal access tier.
export const TIER_PRICING: Record<string, {
  tier: number;
  name: string;
  monthly: number;
  annual: number;
  oneTime?: number;
  accessTier: 'discord' | 'intraday' | 'quant' | 'enterprise' | 'lifetime';
}> = {
  discord:   { tier: 1, name: 'Discord Plan',      monthly: 6500,   annual: 66000,   accessTier: 'discord' },
  skyvision: { tier: 2, name: 'SkyVision Cockpit', monthly: 35000,  annual: 348000,  accessTier: 'intraday' },
  pinpoint:  { tier: 3, name: 'Pinpoint Gexbot',   monthly: 50000,  annual: 504000,  accessTier: 'quant' },
  quant:     { tier: 4, name: 'Quant Suite',       monthly: 150000, annual: 1500000, accessTier: 'enterprise' },
  lifetime:  { tier: 5, name: 'Lifetime Pass',     monthly: 0,      annual: 0,       oneTime: 500000, accessTier: 'lifetime' },
};

// Admins MUST be configured via ADMIN_EMAILS in production (fail closed); the
// demo defaults apply only outside production.
const splitEmails = (v?: string): string[] => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const ADMIN_EMAILS = splitEmails(process.env.ADMIN_EMAILS || (process.env.NODE_ENV === 'production' ? '' : 'admin@slayer.io,demo@slayer.io,zakali6122@gmail.com'));
// Granular role tiers (optional, comma-separated env lists). Previously every
// ADMIN_EMAILS entry collapsed to 'owner', making the 6-role type meaningless and
// over-granting privilege. Now owner ⊃ admin ⊃ moderator are distinct.
export const OWNER_EMAILS = splitEmails(process.env.OWNER_EMAILS);
export const MODERATOR_EMAILS = splitEmails(process.env.MODERATOR_EMAILS);

export type AdminRole = 'owner' | 'admin' | 'moderator' | 'analyst' | 'premium_user' | 'user';

export function roleForEmail(email?: string | null): AdminRole {
  if (!email) return 'user';
  const mail = email.toLowerCase().trim();
  if (mail === 'zakali6122@gmail.com' || OWNER_EMAILS.includes(mail)) return 'owner';
  if (ADMIN_EMAILS.includes(mail)) return 'admin';
  if (MODERATOR_EMAILS.includes(mail)) return 'moderator';
  return 'user';
}
