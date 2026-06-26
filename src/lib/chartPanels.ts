/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Movable/resizable multi-chart layout model. Mirrors the snap-grid math used by
 * WorkspaceView so the chart-panel grid feels identical to the rest of the app.
 * Layout persists to localStorage (no backend needed); a server sync can layer on later.
 */
import { TimeframeVal } from '../types';

export interface ChartPanel {
  id: string;
  ticker: string;
  timeframe: TimeframeVal;
  x: number; y: number; w: number; h: number; // grid units
}

export const GRID_COLS = 12;
export const ROW_HEIGHT = 40;
export const GAP = 8;
export const MIN_W = 3;
export const MIN_H = 5;
export const MAX_PANELS = 6;

let _seq = 0;
export const newPanelId = () => `cp_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

const KEY = 'slayer.chartpanels.v1';

export function loadPanels(): ChartPanel[] {
  try { const raw = localStorage.getItem(KEY); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p as ChartPanel[]; } } catch { /* ignore */ }
  return [];
}

export function savePanels(panels: ChartPanel[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(panels)); } catch { /* storage unavailable */ }
}

/** A fresh panel placed below the current stack, half-width by default. */
export function makePanel(ticker: string, timeframe: TimeframeVal, y: number): ChartPanel {
  return { id: newPanelId(), ticker, timeframe, x: 0, y, w: 6, h: 8 };
}
