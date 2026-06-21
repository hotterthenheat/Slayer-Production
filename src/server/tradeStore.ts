/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-user tracked-trade persistence.
 *
 * WHY THIS EXISTS
 * ---------------
 * The legacy `db.v8Trades` archive is a single global array shared by every user
 * and lost on restart. The "add a contract to my Trade History" feature needs
 * (a) per-user isolation, (b) a hard cap of 10 OPEN contracts per user, and
 * (c) durable storage we can query for back-testing. This module provides that.
 *
 * STORAGE CHOICE
 * --------------
 * Backed by Node 22's built-in `node:sqlite` (no native compile, no extra
 * dependency). Everything goes through the small async `TradeStore` interface so
 * production can swap in a `PgTradeStore` (same methods, backed by the existing
 * Drizzle/pg pool) by flipping one factory line — the SQL below is intentionally
 * ANSI-standard so the queries port to Postgres almost verbatim.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// node:sqlite is still flagged experimental and prints one ExperimentalWarning at
// import. Silence just that line so it doesn't spam the server logs on boot.
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
});

export type TradeCategory = 'top_opportunity' | 'discounted' | 'quickscalp' | 'manual';
export type TradeStatus = 'OPEN' | 'CLOSED';
export type TradeOutcome = 'WIN' | 'LOSS' | 'SCRATCH';
export type ExitReason = 'TARGET' | 'STOP' | 'TIME' | 'MODEL_EDGE' | 'MANUAL';

/** One tracked contract. Numeric premiums are in the option's own quote units (points). */
export interface TradeRow {
  id: string;
  userEmail: string;
  underlying: string;
  contract: string; // display label e.g. "SPX 7650C"
  strike: number;
  isCall: boolean;
  direction: 'BULLISH' | 'BEARISH';
  category: TradeCategory;

  entryPrice: number; // option premium at entry
  entryUnderlying: number; // spot at entry
  iv: number; // decimal (0.15 = 15%)
  dteDays: number; // days to expiry at entry
  delta: number;
  gamma: number;
  theta: number;
  vega: number;

  // Math-computed exit plan (server-authoritative; set on add).
  target1: number; // primary take-profit premium
  target2: number; // stretch premium (display only)
  stopLoss: number; // protective premium
  timeStopMin: number; // simulated minutes until the time-stop closes the trade
  modelExitPop: number; // P(ITM) floor; below this the thesis is broken → exit

  // Position scaling: sell half at T1, run the rest to T2 (or stop/time/model).
  // qtyOpen: 1 (full) → 0.5 (after T1 scale) → 0 (closed).
  qtyOpen: number;
  scaledOut: boolean; // true once the T1 half has been taken off
  scalePrice: number | null; // premium at the T1 scale-out
  scalePnl: number | null; // realized P&L locked from the half sold at T1 (points)

  status: TradeStatus;

  // Live tracking (updated each engine tick while OPEN).
  currentPrice: number;
  elapsedMin: number; // simulated minutes since entry
  maxGain: number; // running max % gain
  maxDrawdown: number; // running max % drawdown

  // Close-out (null until CLOSED).
  exitPrice: number | null;
  exitReason: ExitReason | null;
  pnl: number | null; // realized premium P&L (points)
  pnlPct: number | null;
  outcome: TradeOutcome | null;

  openedAt: number; // epoch ms
  closedAt: number | null; // epoch ms
  updatedAt: number; // epoch ms
}

/** Live-tracking patch written each tick for an OPEN trade. */
export interface LivePatch {
  currentPrice: number;
  elapsedMin: number;
  maxGain: number;
  maxDrawdown: number;
}

/** Scale-out patch (T1 half taken off; the runner stays OPEN with a breakeven stop). */
export interface ScalePatch {
  scalePrice: number;
  scalePnl: number;
  qtyOpen: number; // remaining fraction (0.5)
  stopLoss: number; // raised to breakeven on the runner
}

/** Close-out patch. */
export interface ClosePatch {
  exitPrice: number;
  exitReason: ExitReason;
  pnl: number;
  pnlPct: number;
  outcome: TradeOutcome;
  closedAt: number;
}

/**
 * Storage contract. Async on purpose so a future Postgres implementation drops in
 * without touching any caller (SQLite resolves immediately; pg awaits the pool).
 */
export interface TradeStore {
  init(): Promise<void>;
  add(trade: TradeRow): Promise<void>;
  getById(id: string): Promise<TradeRow | undefined>;
  countOpenByUser(email: string): Promise<number>;
  listByUser(email: string): Promise<TradeRow[]>;
  listAllOpen(): Promise<TradeRow[]>;
  applyLive(id: string, patch: LivePatch): Promise<void>;
  scaleOut(id: string, patch: ScalePatch): Promise<void>;
  close(id: string, patch: ClosePatch): Promise<void>;
}

const COLUMNS = `
  id, user_email, underlying, contract, strike, is_call, direction, category,
  entry_price, entry_underlying, iv, dte_days, delta, gamma, theta, vega,
  target1, target2, stop_loss, time_stop_min, model_exit_pop,
  qty_open, scaled_out, scale_price, scale_pnl, status,
  current_price, elapsed_min, max_gain, max_drawdown,
  exit_price, exit_reason, pnl, pnl_pct, outcome,
  opened_at, closed_at, updated_at`;

function rowToTrade(r: any): TradeRow {
  return {
    id: r.id,
    userEmail: r.user_email,
    underlying: r.underlying,
    contract: r.contract,
    strike: r.strike,
    isCall: !!r.is_call,
    direction: r.direction,
    category: r.category,
    entryPrice: r.entry_price,
    entryUnderlying: r.entry_underlying,
    iv: r.iv,
    dteDays: r.dte_days,
    delta: r.delta,
    gamma: r.gamma,
    theta: r.theta,
    vega: r.vega,
    target1: r.target1,
    target2: r.target2,
    stopLoss: r.stop_loss,
    timeStopMin: r.time_stop_min,
    modelExitPop: r.model_exit_pop,
    qtyOpen: r.qty_open,
    scaledOut: !!r.scaled_out,
    scalePrice: r.scale_price,
    scalePnl: r.scale_pnl,
    status: r.status,
    currentPrice: r.current_price,
    elapsedMin: r.elapsed_min,
    maxGain: r.max_gain,
    maxDrawdown: r.max_drawdown,
    exitPrice: r.exit_price,
    exitReason: r.exit_reason,
    pnl: r.pnl,
    pnlPct: r.pnl_pct,
    outcome: r.outcome,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    updatedAt: r.updated_at,
  };
}

class SqliteTradeStore implements TradeStore {
  private db: DatabaseSync;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        underlying TEXT NOT NULL,
        contract TEXT NOT NULL,
        strike REAL NOT NULL,
        is_call INTEGER NOT NULL,
        direction TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'manual',
        entry_price REAL NOT NULL,
        entry_underlying REAL NOT NULL,
        iv REAL NOT NULL,
        dte_days REAL NOT NULL,
        delta REAL NOT NULL DEFAULT 0,
        gamma REAL NOT NULL DEFAULT 0,
        theta REAL NOT NULL DEFAULT 0,
        vega REAL NOT NULL DEFAULT 0,
        target1 REAL NOT NULL,
        target2 REAL NOT NULL,
        stop_loss REAL NOT NULL,
        time_stop_min REAL NOT NULL,
        model_exit_pop REAL NOT NULL,
        qty_open REAL NOT NULL DEFAULT 1,
        scaled_out INTEGER NOT NULL DEFAULT 0,
        scale_price REAL,
        scale_pnl REAL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        current_price REAL NOT NULL,
        elapsed_min REAL NOT NULL DEFAULT 0,
        max_gain REAL NOT NULL DEFAULT 0,
        max_drawdown REAL NOT NULL DEFAULT 0,
        exit_price REAL,
        exit_reason TEXT,
        pnl REAL,
        pnl_pct REAL,
        outcome TEXT,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        updated_at INTEGER NOT NULL
      );
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS trades_user_idx ON trades (user_email);');
    this.db.exec('CREATE INDEX IF NOT EXISTS trades_user_status_idx ON trades (user_email, status);');
    this.db.exec('CREATE INDEX IF NOT EXISTS trades_status_idx ON trades (status);');
  }

  async add(t: TradeRow): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO trades (${COLUMNS})
      VALUES (
        $id, $user_email, $underlying, $contract, $strike, $is_call, $direction, $category,
        $entry_price, $entry_underlying, $iv, $dte_days, $delta, $gamma, $theta, $vega,
        $target1, $target2, $stop_loss, $time_stop_min, $model_exit_pop,
        $qty_open, $scaled_out, $scale_price, $scale_pnl, $status,
        $current_price, $elapsed_min, $max_gain, $max_drawdown,
        $exit_price, $exit_reason, $pnl, $pnl_pct, $outcome,
        $opened_at, $closed_at, $updated_at)
    `);
    stmt.run({
      $id: t.id,
      $user_email: t.userEmail,
      $underlying: t.underlying,
      $contract: t.contract,
      $strike: t.strike,
      $is_call: t.isCall ? 1 : 0,
      $direction: t.direction,
      $category: t.category,
      $entry_price: t.entryPrice,
      $entry_underlying: t.entryUnderlying,
      $iv: t.iv,
      $dte_days: t.dteDays,
      $delta: t.delta,
      $gamma: t.gamma,
      $theta: t.theta,
      $vega: t.vega,
      $target1: t.target1,
      $target2: t.target2,
      $stop_loss: t.stopLoss,
      $time_stop_min: t.timeStopMin,
      $model_exit_pop: t.modelExitPop,
      $qty_open: t.qtyOpen,
      $scaled_out: t.scaledOut ? 1 : 0,
      $scale_price: t.scalePrice,
      $scale_pnl: t.scalePnl,
      $status: t.status,
      $current_price: t.currentPrice,
      $elapsed_min: t.elapsedMin,
      $max_gain: t.maxGain,
      $max_drawdown: t.maxDrawdown,
      $exit_price: t.exitPrice,
      $exit_reason: t.exitReason,
      $pnl: t.pnl,
      $pnl_pct: t.pnlPct,
      $outcome: t.outcome,
      $opened_at: t.openedAt,
      $closed_at: t.closedAt,
      $updated_at: t.updatedAt,
    });
  }

  async getById(id: string): Promise<TradeRow | undefined> {
    const r = this.db.prepare(`SELECT ${COLUMNS} FROM trades WHERE id = ?`).get(id);
    return r ? rowToTrade(r) : undefined;
  }

  async countOpenByUser(email: string): Promise<number> {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM trades WHERE user_email = ? AND status = 'OPEN'`)
      .get(email) as { n: number };
    return r?.n ?? 0;
  }

  async listByUser(email: string): Promise<TradeRow[]> {
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM trades WHERE user_email = ? ORDER BY opened_at DESC`)
      .all(email);
    return rows.map(rowToTrade);
  }

  async listAllOpen(): Promise<TradeRow[]> {
    const rows = this.db.prepare(`SELECT ${COLUMNS} FROM trades WHERE status = 'OPEN'`).all();
    return rows.map(rowToTrade);
  }

  async applyLive(id: string, p: LivePatch): Promise<void> {
    this.db
      .prepare(
        `UPDATE trades SET current_price = ?, elapsed_min = ?, max_gain = ?, max_drawdown = ?, updated_at = ? WHERE id = ?`
      )
      .run(p.currentPrice, p.elapsedMin, p.maxGain, p.maxDrawdown, Date.now(), id);
  }

  async scaleOut(id: string, p: ScalePatch): Promise<void> {
    this.db
      .prepare(
        `UPDATE trades
           SET scaled_out = 1, scale_price = ?, scale_pnl = ?, qty_open = ?, stop_loss = ?, updated_at = ?
         WHERE id = ? AND status = 'OPEN' AND scaled_out = 0`
      )
      .run(p.scalePrice, p.scalePnl, p.qtyOpen, p.stopLoss, Date.now(), id);
  }

  async close(id: string, p: ClosePatch): Promise<void> {
    this.db
      .prepare(
        `UPDATE trades
           SET status = 'CLOSED', current_price = ?, exit_price = ?, exit_reason = ?,
               pnl = ?, pnl_pct = ?, outcome = ?, closed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'OPEN'`
      )
      .run(p.exitPrice, p.exitPrice, p.exitReason, p.pnl, p.pnlPct, p.outcome, p.closedAt, Date.now(), id);
  }
}

/**
 * Factory. Today: always SQLite (production Postgres isn't wired for trades yet).
 * To move to Postgres, implement PgTradeStore against the same interface and
 * return it here when SQL_HOST is set.
 */
let _store: TradeStore | null = null;
export function getTradeStore(): TradeStore {
  if (_store) return _store;
  const filePath = process.env.SQLITE_PATH || './data/slayer.db';
  _store = new SqliteTradeStore(filePath);
  return _store;
}

/** Hard cap on simultaneously OPEN tracked contracts per user. */
export const MAX_OPEN_TRADES_PER_USER = 10;
