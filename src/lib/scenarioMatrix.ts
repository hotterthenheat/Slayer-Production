/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic scenario / shock P&L matrix — the "risk slide" every options desk
 * uses: reprice a position across a grid of spot moves × IV shifts (at a chosen
 * time-decay horizon) with Black–Scholes. Complements the PhysicsCascade Monte
 * Carlo with an exact what-if grid. Keyless.
 */
import { computeBlackScholesPrice } from './v11Math';

export interface ScenarioInput {
  spot: number;
  strike: number;
  dteDays: number;
  iv: number; // decimal
  isCall: boolean;
  entryPrice: number; // per-contract premium paid
  quantity?: number; // contracts (default 1)
  r?: number;
  spotShiftsPct?: number[]; // e.g. [-0.05,-0.025,0,0.025,0.05]
  ivShiftsAbs?: number[]; // vol points, e.g. [-0.05,0,0.05]
  daysForward?: number; // time decay applied to the whole grid
}

export interface ScenarioMatrix {
  spotShiftsPct: number[];
  ivShiftsAbs: number[];
  daysForward: number;
  /** rows = ivShifts, cols = spotShifts; value = P&L % of entry. */
  pnlPct: number[][];
  /** rows = ivShifts, cols = spotShifts; value = absolute P&L ($, ×100×qty). */
  pnlAbs: number[][];
  best: { pnlPct: number; spotShiftPct: number; ivShiftAbs: number };
  worst: { pnlPct: number; spotShiftPct: number; ivShiftAbs: number };
}

const DEFAULT_SPOT = [-0.05, -0.03, -0.015, 0, 0.015, 0.03, 0.05];
const DEFAULT_IV = [-0.05, -0.02, 0, 0.02, 0.05];

export function computeScenarioMatrix(input: ScenarioInput): ScenarioMatrix {
  const {
    spot, strike, dteDays, iv, isCall, entryPrice,
    quantity = 1, r = 0.05,
    spotShiftsPct = DEFAULT_SPOT,
    ivShiftsAbs = DEFAULT_IV,
    daysForward = 1,
  } = input;

  const entry = Math.max(0.01, entryPrice);
  const newDte = Math.max(0.05, dteDays - daysForward);

  const pnlPct: number[][] = [];
  const pnlAbs: number[][] = [];
  // Track the extreme by the raw fraction; store the ×100 percentage in the result.
  let bestFrac = -Infinity, worstFrac = Infinity;
  let best = { pnlPct: 0, spotShiftPct: 0, ivShiftAbs: 0 };
  let worst = { pnlPct: 0, spotShiftPct: 0, ivShiftAbs: 0 };

  for (const dv of ivShiftsAbs) {
    const rowPct: number[] = [];
    const rowAbs: number[] = [];
    for (const ds of spotShiftsPct) {
      const newSpot = spot * (1 + ds);
      const newIv = Math.max(0.01, iv + dv);
      const price = computeBlackScholesPrice(newSpot, strike, newDte, newIv, isCall, r);
      const pct = (price - entry) / entry;
      const abs = (price - entry) * 100 * quantity;
      rowPct.push(Number((pct * 100).toFixed(1)));
      rowAbs.push(Number(abs.toFixed(0)));
      if (pct > bestFrac) { bestFrac = pct; best = { pnlPct: Number((pct * 100).toFixed(1)), spotShiftPct: ds, ivShiftAbs: dv }; }
      if (pct < worstFrac) { worstFrac = pct; worst = { pnlPct: Number((pct * 100).toFixed(1)), spotShiftPct: ds, ivShiftAbs: dv }; }
    }
    pnlPct.push(rowPct);
    pnlAbs.push(rowAbs);
  }

  return { spotShiftsPct, ivShiftsAbs, daysForward, pnlPct, pnlAbs, best, worst };
}
