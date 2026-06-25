import { relations } from 'drizzle-orm';
import { bigint, boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // legacy auth UID
  email: text('email').notNull().unique(), // business key — upserts conflict on this
  version: integer('version').default(0).notNull(), // OCC for token/billing updates
  tokens: integer('tokens').default(0).notNull(),
  fullProfile: text('full_profile'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Durable moderation state (bans/suspensions + a session-revocation watermark),
// created at runtime by ensureSchema(). Declared here so drizzle-kit push/generate
// does NOT treat it as drift and emit a DROP — that would wipe live ban/suspension
// state and the session watermark.
export const moderation = pgTable('moderation', {
  email: text('email').primaryKey(),
  banned: boolean('banned').default(false).notNull(),
  suspended: boolean('suspended').default(false).notNull(),
  sessionsValidAfter: bigint('sessions_valid_after', { mode: 'number' }).default(0).notNull(),
});

// Stripe webhook idempotency ledger. Declared for the same anti-drift reason — a DROP
// here would re-enable webhook replay (double-processing grants/cancellations).
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: bigint('processed_at', { mode: 'number' }).default(0).notNull(),
});
