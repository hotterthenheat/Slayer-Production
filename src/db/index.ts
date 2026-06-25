import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

/**
 * TLS for the DB connection, driven by SQL_SSL so it can be enabled in
 * production (where PII + password hashes + Stripe identifiers otherwise travel
 * in cleartext) without breaking a local/no-TLS Postgres:
 *   SQL_SSL=require   -> encrypt AND verify the server certificate (strongest)
 *   SQL_SSL=no-verify -> encrypt but skip cert verification (managed/self-signed)
 *   SQL_SSL=disable / unset -> no TLS (default; local dev)
 */
export function pgSslOption(): false | { rejectUnauthorized: boolean } {
  const mode = (process.env.SQL_SSL || '').toLowerCase();
  if (mode === 'require' || mode === 'verify') return { rejectUnauthorized: true };
  if (mode === 'no-verify' || mode === 'prefer') return { rejectUnauthorized: false };
  return false;
}

export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
    ssl: pgSslOption(),
  });
};

const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const db = drizzle(pool, { schema });

/**
 * Idempotently create the schema on a fresh database so a one-click deploy works
 * with no manual migration step. Safe to run on every boot. If SQL_HOST is unset
 * (e.g. local dev without a DB) it no-ops; if the DB is unreachable it logs and
 * continues rather than crashing the process.
 */
export async function ensureSchema(): Promise<void> {
  if (!process.env.SQL_HOST) {
    console.warn('[db] SQL_HOST not set — skipping schema bootstrap (DB-backed features will be unavailable).');
    return;
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id serial PRIMARY KEY,
        uid text NOT NULL UNIQUE,
        email text NOT NULL,
        version integer NOT NULL DEFAULT 0,
        tokens integer NOT NULL DEFAULT 0,
        full_profile text,
        created_at timestamp DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);`);
    // Durable moderation state (bans/suspensions + a session-revocation watermark)
    // and webhook idempotency, so they survive process restarts/redeploys instead
    // of resetting (in-memory was the prior behavior).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS moderation (
        email text PRIMARY KEY,
        banned boolean NOT NULL DEFAULT false,
        suspended boolean NOT NULL DEFAULT false,
        sessions_valid_after bigint NOT NULL DEFAULT 0
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS processed_webhook_events (
        event_id text PRIMARY KEY,
        processed_at bigint NOT NULL DEFAULT 0
      );
    `);
    // Self-learning loop: durable prediction log (labeled with realized outcomes later).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS predictions (
        id serial PRIMARY KEY,
        prediction_id text NOT NULL UNIQUE,
        ticker text NOT NULL,
        kind text NOT NULL,
        predicted_prob integer NOT NULL,
        features text,
        horizon_ms bigint NOT NULL,
        created_at bigint NOT NULL,
        labeled_at bigint,
        outcome_win boolean,
        realized_return text
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS predictions_unlabeled_idx ON predictions (labeled_at, created_at);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS predictions_kind_idx ON predictions (kind, labeled_at);`);
    // Ensure email is UNIQUE so user upserts can conflict-on email (the business
    // key) instead of uid. Idempotent; isolated try-catch so a pre-existing dup
    // (from the old uid-based upsert) doesn't abort the rest of schema bootstrap.
    try {
      await db.execute(sql`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
          ) THEN
            ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
          END IF;
        END $$;
      `);
    } catch (ce) {
      console.error('[db] could not add users_email_unique (duplicate emails?):', ce);
    }
    console.log('[db] schema ready (users table verified).');
  } catch (e) {
    console.error('[db] ensureSchema failed (DB-backed features may not work):', e);
  }
}

// ===========================================================================
// Durable moderation + webhook-idempotency helpers. Each is a no-op (or safe
// empty result) when SQL_HOST is unset (no-DB dev mode) and never throws — the
// in-memory caches in the app layer remain the source of truth for hot reads.
// ===========================================================================
export interface ModerationRow { email: string; banned: boolean; suspended: boolean; sessions_valid_after: number; }

export async function dbLoadModeration(): Promise<ModerationRow[]> {
  if (!process.env.SQL_HOST) return [];
  try {
    const res: any = await db.execute(sql`SELECT email, banned, suspended, sessions_valid_after FROM moderation`);
    return (res.rows || []).map((r: any) => ({
      email: String(r.email || '').toLowerCase(),
      banned: !!r.banned,
      suspended: !!r.suspended,
      sessions_valid_after: Number(r.sessions_valid_after) || 0,
    }));
  } catch (e) {
    console.error('[db] dbLoadModeration failed:', e);
    return [];
  }
}

export async function dbSetModeration(email: string, s: { banned: boolean; suspended: boolean; sessions_valid_after: number }): Promise<void> {
  if (!process.env.SQL_HOST) return;
  try {
    const e = email.toLowerCase().trim();
    await db.execute(sql`
      INSERT INTO moderation (email, banned, suspended, sessions_valid_after)
      VALUES (${e}, ${s.banned}, ${s.suspended}, ${s.sessions_valid_after})
      ON CONFLICT (email) DO UPDATE SET
        banned = ${s.banned}, suspended = ${s.suspended}, sessions_valid_after = ${s.sessions_valid_after}
    `);
  } catch (e) {
    console.error('[db] dbSetModeration failed:', e);
  }
}

export async function dbIsWebhookProcessed(eventId: string): Promise<boolean> {
  if (!process.env.SQL_HOST) return false;
  try {
    const res: any = await db.execute(sql`SELECT 1 FROM processed_webhook_events WHERE event_id = ${eventId} LIMIT 1`);
    return (res.rows || []).length > 0;
  } catch (e) {
    console.error('[db] dbIsWebhookProcessed failed:', e);
    return false;
  }
}

export async function dbMarkWebhookProcessed(eventId: string): Promise<void> {
  if (!process.env.SQL_HOST) return;
  try {
    await db.execute(sql`INSERT INTO processed_webhook_events (event_id, processed_at) VALUES (${eventId}, ${Date.now()}) ON CONFLICT (event_id) DO NOTHING`);
    // Prune opportunistically (~2% of calls), not on every event, so the idempotency
    // hot path doesn't eat a full-table DELETE under burst traffic.
    if (Math.random() < 0.02) {
      await db.execute(sql`DELETE FROM processed_webhook_events WHERE processed_at < ${Date.now() - 30 * 24 * 3600 * 1000}`);
    }
  } catch (e) {
    console.error('[db] dbMarkWebhookProcessed failed:', e);
  }
}

// ===========================================================================
// Self-learning loop persistence. A prediction row is inserted when the model emits a
// score/trade; a labeling worker fills the outcome once the horizon elapses. Calibration
// (isotonic/Brier/ECE) and the nearest-neighbour history then train on these real pairs.
// All no-op (or empty) without SQL_HOST and never throw.
// ===========================================================================
export interface PredictionRow {
  predictionId: string; ticker: string; kind: string; predictedProb: number;
  features?: string | null; horizonMs: number; createdAt: number;
}
export interface CalibrationPair { prob: number; win: boolean; }

export async function dbInsertPrediction(p: PredictionRow): Promise<void> {
  if (!process.env.SQL_HOST) return;
  try {
    await db.execute(sql`
      INSERT INTO predictions (prediction_id, ticker, kind, predicted_prob, features, horizon_ms, created_at)
      VALUES (${p.predictionId}, ${p.ticker}, ${p.kind}, ${Math.round(p.predictedProb)}, ${p.features ?? null}, ${p.horizonMs}, ${p.createdAt})
      ON CONFLICT (prediction_id) DO NOTHING
    `);
  } catch (e) {
    console.error('[db] dbInsertPrediction failed:', e);
  }
}

// Predictions whose horizon has elapsed but are not yet labeled (the worker's queue).
export async function dbLoadDuePredictions(now: number, limit = 200): Promise<Array<PredictionRow & { id: number }>> {
  if (!process.env.SQL_HOST) return [];
  try {
    const res: any = await db.execute(sql`
      SELECT id, prediction_id, ticker, kind, predicted_prob, features, horizon_ms, created_at
      FROM predictions
      WHERE labeled_at IS NULL AND (created_at + horizon_ms) <= ${now}
      ORDER BY created_at ASC LIMIT ${limit}
    `);
    return (res.rows || []).map((r: any) => ({
      id: Number(r.id), predictionId: String(r.prediction_id), ticker: String(r.ticker),
      kind: String(r.kind), predictedProb: Number(r.predicted_prob), features: r.features ?? null,
      horizonMs: Number(r.horizon_ms), createdAt: Number(r.created_at),
    }));
  } catch (e) {
    console.error('[db] dbLoadDuePredictions failed:', e);
    return [];
  }
}

export async function dbLabelPrediction(predictionId: string, win: boolean, realizedReturn: number): Promise<void> {
  if (!process.env.SQL_HOST) return;
  try {
    await db.execute(sql`
      UPDATE predictions SET labeled_at = ${Date.now()}, outcome_win = ${win}, realized_return = ${String(realizedReturn)}
      WHERE prediction_id = ${predictionId} AND labeled_at IS NULL
    `);
  } catch (e) {
    console.error('[db] dbLabelPrediction failed:', e);
  }
}

// Labeled (prediction, outcome) pairs for calibration/Brier/ECE, optionally scoped to a kind.
export async function dbLoadCalibrationPairs(kind?: string, limit = 5000): Promise<CalibrationPair[]> {
  if (!process.env.SQL_HOST) return [];
  try {
    const res: any = kind
      ? await db.execute(sql`SELECT predicted_prob, outcome_win FROM predictions WHERE labeled_at IS NOT NULL AND kind = ${kind} ORDER BY labeled_at DESC LIMIT ${limit}`)
      : await db.execute(sql`SELECT predicted_prob, outcome_win FROM predictions WHERE labeled_at IS NOT NULL ORDER BY labeled_at DESC LIMIT ${limit}`);
    return (res.rows || []).map((r: any) => ({ prob: Number(r.predicted_prob) / 100, win: !!r.outcome_win }));
  } catch (e) {
    console.error('[db] dbLoadCalibrationPairs failed:', e);
    return [];
  }
}

export async function dbCountLabeledPredictions(kind?: string): Promise<number> {
  if (!process.env.SQL_HOST) return 0;
  try {
    const res: any = kind
      ? await db.execute(sql`SELECT COUNT(*)::int AS n FROM predictions WHERE labeled_at IS NOT NULL AND kind = ${kind}`)
      : await db.execute(sql`SELECT COUNT(*)::int AS n FROM predictions WHERE labeled_at IS NOT NULL`);
    return Number((res.rows || [])[0]?.n || 0);
  } catch (e) {
    console.error('[db] dbCountLabeledPredictions failed:', e);
    return 0;
  }
}
