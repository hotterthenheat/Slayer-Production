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
