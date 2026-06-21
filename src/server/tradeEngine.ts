/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trade engine for per-user tracked contracts.
 *
 *  - buildTrade(): turns an "add this contract" request into a fully-specified
 *    TradeRow, computing entry greeks and the EXIT PLAN from the quant library
 *    (Black-Scholes + expected move + risk-neutral P(ITM)). Server-authoritative:
 *    the client never supplies targets/stops.
 *  - startTradeEngine(): a self-contained tick that reprices every OPEN trade with
 *    the live (mock) spot, tracks running P&L, and AUTO-CLOSES on the earliest of
 *    target / stop / time-stop / model-edge-gone — recording the outcome (which
 *    frees a slot against the 10-open cap).
 *
 * All pricing uses the same deterministic math the rest of the terminal trusts, so
 * a contract's tracked P&L is consistent with what the analytics pages show.
 */
import { computeBlackScholesPrice, calculateAnalyticGreeks } from '../lib/v11Math';
import { probExpireITM } from '../lib/zeroDte';
import { db } from './state';
import {
  getTradeStore,
  type TradeRow,
  type TradeCategory,
  type TradeOutcome,
  type ExitReason,
} from './tradeStore';

const RISK_FREE = 0.05;

/** Default time-stop (simulated minutes) by category. QuickScalp resolves fastest. */
const TIME_STOP_MIN: Record<TradeCategory, number> = {
  quickscalp: 90,
  top_opportunity: 180,
  discounted: 240,
  manual: 180,
};

/** P(ITM) floor — below this the directional thesis is considered broken. */
const MODEL_EXIT_POP = 0.22;

/** Simulated minutes advanced per engine tick, and the wall-clock tick interval. */
const SIM_MINUTES_PER_TICK = 3;
const TICK_INTERVAL_MS = 1500;

export interface BuildTradeInput {
  userEmail: string;
  underlying: string;
  strike: number;
  isCall: boolean;
  spot: number; // current underlying price
  iv: number; // decimal, e.g. 0.15
  dteDays: number; // days to expiry
  category: TradeCategory;
  entryPrice?: number; // optional override; otherwise priced from BSM
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function r2(v: number): number {
  return Number(v.toFixed(2));
}

/**
 * Build a fully-specified, ready-to-persist TradeRow with a math-derived exit plan.
 * Targets/stop are priced by repricing the option at a +/- expected-move spot with
 * partial time decay, so they reflect real option convexity rather than flat % rules.
 */
export function buildTrade(input: BuildTradeInput): TradeRow {
  const { userEmail, underlying, strike, isCall, category } = input;
  const spot = input.spot;
  const iv = clamp(input.iv, 0.01, 5);
  const dteDays = Math.max(0.02, input.dteDays); // floor ~30 min so 0DTE still prices

  const entryPrice = r2(
    Math.max(0.05, input.entryPrice ?? computeBlackScholesPrice(spot, strike, dteDays, iv, isCall, RISK_FREE))
  );

  const g = calculateAnalyticGreeks(spot, strike, dteDays, iv, isCall, RISK_FREE);

  // 1-sigma expected move (points) over the life of the trade.
  const em = spot * iv * Math.sqrt(dteDays / 365);

  // Reprice the option at favorable / adverse spots with partial time elapsed.
  const favSpot1 = isCall ? spot + 1.0 * em : spot - 1.0 * em;
  const favSpot2 = isCall ? spot + 1.8 * em : spot - 1.8 * em;
  const advSpot = isCall ? spot - 0.8 * em : spot + 0.8 * em;

  const target1 = r2(Math.max(entryPrice * 1.25, computeBlackScholesPrice(favSpot1, strike, dteDays * 0.6, iv, isCall, RISK_FREE)));
  const target2 = r2(Math.max(target1 * 1.3, computeBlackScholesPrice(favSpot2, strike, dteDays * 0.4, iv, isCall, RISK_FREE)));
  const stopRaw = computeBlackScholesPrice(Math.max(advSpot, 0.01), strike, dteDays * 0.75, iv, isCall, RISK_FREE);
  const stopLoss = r2(clamp(Math.min(entryPrice * 0.55, stopRaw), 0.05, entryPrice * 0.95));

  const now = Date.now();
  return {
    id: `tt-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userEmail,
    underlying,
    contract: `${underlying} ${strike}${isCall ? 'C' : 'P'}`,
    strike,
    isCall,
    direction: isCall ? 'BULLISH' : 'BEARISH',
    category,
    entryPrice,
    entryUnderlying: spot,
    iv,
    dteDays,
    delta: r2(g.delta),
    gamma: Number(g.gamma.toFixed(5)),
    theta: r2(g.theta),
    vega: r2(g.vega),
    target1,
    target2,
    stopLoss,
    timeStopMin: TIME_STOP_MIN[category] ?? 180,
    modelExitPop: MODEL_EXIT_POP,
    status: 'OPEN',
    currentPrice: entryPrice,
    elapsedMin: 0,
    maxGain: 0,
    maxDrawdown: 0,
    exitPrice: null,
    exitReason: null,
    pnl: null,
    pnlPct: null,
    outcome: null,
    openedAt: now,
    closedAt: null,
    updatedAt: now,
  };
}

/** Reprice one OPEN trade against the live spot and decide whether it exits. */
function evaluate(t: TradeRow): { price: number; exit: ExitReason | null } {
  const elapsed = t.elapsedMin + SIM_MINUTES_PER_TICK;
  const remainingFrac = clamp(1 - elapsed / Math.max(1, t.timeStopMin), 0, 1);
  const remainingDte = Math.max(0.0007, t.dteDays * remainingFrac); // ~1 min floor

  const spot = db.liveSpotPrices[t.underlying] || t.entryUnderlying;
  const price = Math.max(0.01, r2(computeBlackScholesPrice(spot, t.strike, remainingDte, t.iv, t.isCall, RISK_FREE)));

  // Earliest-trigger policy: protect capital first, then take profit, then time, then thesis.
  if (price <= t.stopLoss) return { price, exit: 'STOP' };
  if (price >= t.target1) return { price, exit: 'TARGET' };
  if (elapsed >= t.timeStopMin) return { price, exit: 'TIME' };
  const pop = probExpireITM(spot, t.strike, remainingDte / 365, t.iv, t.isCall, RISK_FREE);
  if (pop < t.modelExitPop) return { price, exit: 'MODEL_EDGE' };
  return { price, exit: null };
}

function outcomeFor(pnlPct: number): TradeOutcome {
  if (pnlPct > 1) return 'WIN';
  if (pnlPct < -1) return 'LOSS';
  return 'SCRATCH';
}

/** One pass over all OPEN trades: reprice, track, and auto-close where triggered. */
export async function tickOpenTrades(): Promise<void> {
  const store = getTradeStore();
  let open: TradeRow[];
  try {
    open = await store.listAllOpen();
  } catch {
    return;
  }
  const now = Date.now();
  for (const t of open) {
    const { price, exit } = evaluate(t);
    const elapsed = t.elapsedMin + SIM_MINUTES_PER_TICK;
    const pnlPct = ((price - t.entryPrice) / t.entryPrice) * 100;
    const maxGain = Number(Math.max(t.maxGain, pnlPct).toFixed(1));
    const maxDrawdown = Number(Math.max(t.maxDrawdown, -pnlPct).toFixed(1));

    try {
      if (exit) {
        await store.close(t.id, {
          exitPrice: price,
          exitReason: exit,
          pnl: r2(price - t.entryPrice),
          pnlPct: Number(pnlPct.toFixed(1)),
          outcome: outcomeFor(pnlPct),
          closedAt: now,
        });
      } else {
        await store.applyLive(t.id, { currentPrice: price, elapsedMin: elapsed, maxGain, maxDrawdown });
      }
    } catch {
      /* one bad row shouldn't stop the rest of the pass */
    }
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

/** Start the background exit-tracking loop. Idempotent. */
export function startTradeEngine(): void {
  if (_timer) return;
  _timer = setInterval(() => {
    tickOpenTrades().catch((e) => console.error('[tradeEngine] tick failed:', e));
  }, TICK_INTERVAL_MS);
  if (typeof _timer.unref === 'function') _timer.unref();
  console.log('[tradeEngine] exit-tracking loop started.');
}
