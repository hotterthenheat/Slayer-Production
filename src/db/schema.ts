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

// Self-learning loop — every model prediction is logged here and later labeled with its
// realized outcome once the horizon elapses, so calibration (isotonic / Brier / ECE) and
// the nearest-neighbour history train on REAL results instead of an empty array / PRNG.
// Durable so accumulated outcomes survive restarts and can reach the calibration
// activation threshold (the prior in-memory state reset every deploy).
export const predictions = pgTable('predictions', {
  id: serial('id').primaryKey(),
  predictionId: text('prediction_id').notNull().unique(),
  ticker: text('ticker').notNull(),
  kind: text('kind').notNull(),                              // 'skyscore' | 'trade' | 'discovery' | ...
  predictedProb: integer('predicted_prob').notNull(),       // 0-100 win probability the model emitted
  features: text('features'),                               // JSON feature vector (for KNN lookup)
  horizonMs: bigint('horizon_ms', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  labeledAt: bigint('labeled_at', { mode: 'number' }),      // null until the outcome is known
  outcomeWin: boolean('outcome_win'),                       // null until labeled
  realizedReturn: text('realized_return'),                  // text to avoid float drift
});
