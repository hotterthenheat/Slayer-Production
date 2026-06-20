import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
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
    console.log('[db] schema ready (users table verified).');
  } catch (e) {
    console.error('[db] ensureSchema failed (DB-backed features may not work):', e);
  }
}
