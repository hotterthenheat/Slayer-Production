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
  accessTier: 'discord' | 'pinpoint' | 'skyvision' | 'lifetime';
}> = {
  // Value ladder: Discord (entry) → Pinpoint GEX (commodity dealer-GEX tool) →
  // SkyVision (flagship — picks the trades and includes the GEX tool + Quant Lab).
  // Lifetime is contact-only (no self-serve price). Quant Lab is folded into SkyVision.
  discord:   { tier: 1, name: 'Discord',      monthly: 3900,  annual: 38400,  accessTier: 'discord' },
  pinpoint:  { tier: 2, name: 'Pinpoint GEX', monthly: 9900,  annual: 98400,  accessTier: 'pinpoint' },
  skyvision: { tier: 3, name: 'SkyVision',    monthly: 49900, annual: 498000, accessTier: 'skyvision' },
  lifetime:  { tier: 5, name: 'Lifetime',     monthly: 0,     annual: 0,      accessTier: 'lifetime' },
};

// Admins MUST be configured via ADMIN_EMAILS in production (fail closed); the
// demo defaults apply only outside production.
const splitEmails = (v?: string): string[] => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const ADMIN_EMAILS = splitEmails(process.env.ADMIN_EMAILS || (process.env.NODE_ENV === 'production' ? '' : 'admin@slayer.io,demo@slayer.io'));
// Granular role tiers (optional, comma-separated env lists). Previously every
// ADMIN_EMAILS entry collapsed to 'owner', making the 6-role type meaningless and
// over-granting privilege. Now owner ⊃ admin ⊃ moderator are distinct.
//
// SECURITY: the owner identity is driven entirely by OWNER_EMAILS so it can be
// rotated/revoked via env without a code change (no superuser baked into source).
// Set OWNER_EMAILS in every environment. The default below keeps the founding
// owner from being locked out if the env var is forgotten, but any explicit
// OWNER_EMAILS value fully overrides it.
export const OWNER_EMAILS = splitEmails(process.env.OWNER_EMAILS || 'zakali6122@gmail.com');
export const MODERATOR_EMAILS = splitEmails(process.env.MODERATOR_EMAILS);

export type AdminRole = 'owner' | 'admin' | 'moderator' | 'analyst' | 'premium_user' | 'user';

export function roleForEmail(email?: string | null): AdminRole {
  if (!email) return 'user';
  const mail = email.toLowerCase().trim();
  if (OWNER_EMAILS.includes(mail)) return 'owner';
  if (ADMIN_EMAILS.includes(mail)) return 'admin';
  if (MODERATOR_EMAILS.includes(mail)) return 'moderator';
  return 'user';
}
