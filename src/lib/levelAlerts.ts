/**
 * Level alerts — fire when spot crosses a dealer level (call wall / put wall / gamma flip / magnet)
 * or a user-set custom price. Pure logic + localStorage persistence; the UI/hook layer plays the
 * sound + shows the toast. Dealer-level prices are resolved LIVE from the profile each tick (the wall
 * can move), so an armed dealer-level alert tracks the level wherever it goes; custom alerts are fixed.
 */

export type AlertKind = 'callWall' | 'putWall' | 'gammaFlip' | 'magnet' | 'custom';

export interface ArmedAlert {
  id: string;
  ticker: string;
  kind: AlertKind;
  price?: number;        // only for kind==='custom'
  label?: string;        // custom display label
}

export interface FiredAlert {
  id: string;            // armed alert id
  ticker: string;
  label: string;
  price: number;         // the level price that was crossed
  spot: number;          // spot at the cross
  dir: 'up' | 'down';    // crossed upward or downward through the level
  ts: number;
}

export interface LevelSource {
  callWall?: number;
  putWall?: number;
  gammaFlip?: number;
  magnet?: number;
}

export const ALERT_LABEL: Record<Exclude<AlertKind, 'custom'>, string> = {
  callWall: 'Call Wall', putWall: 'Put Wall', gammaFlip: 'Gamma Flip', magnet: 'Magnet',
};

const KEY = 'slayer.levelalerts.v1';
let _seq = 0;
export const newAlertId = () => `al_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

export function loadAlerts(): ArmedAlert[] {
  try { const raw = localStorage.getItem(KEY); if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) return a as ArmedAlert[]; } } catch { /* ignore */ }
  return [];
}
export function saveAlerts(alerts: ArmedAlert[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(alerts)); } catch { /* storage unavailable */ }
}

/** Resolve the live price of an armed alert (custom → its fixed price; dealer level → from profile). */
export function resolvePrice(a: ArmedAlert, src: LevelSource): number | null {
  if (a.kind === 'custom') return a.price != null && isFinite(a.price) ? a.price : null;
  const v = src[a.kind];
  return v != null && isFinite(v) ? v : null;
}

export function alertLabel(a: ArmedAlert): string {
  if (a.kind === 'custom') return a.label || `Price ${a.price ?? ''}`;
  return ALERT_LABEL[a.kind];
}

/**
 * Detect which armed alerts spot just crossed between prevSpot and curSpot. A "cross" is strict: the
 * level lies strictly between the two readings (inclusive on the new side) so a single tick fires once.
 */
export function detectCrosses(prevSpot: number, curSpot: number, alerts: ArmedAlert[], src: LevelSource, ts: number): FiredAlert[] {
  if (!isFinite(prevSpot) || !isFinite(curSpot) || prevSpot === curSpot) return [];
  const lo = Math.min(prevSpot, curSpot), hi = Math.max(prevSpot, curSpot);
  const dir: 'up' | 'down' = curSpot > prevSpot ? 'up' : 'down';
  const fired: FiredAlert[] = [];
  for (const a of alerts) {
    const price = resolvePrice(a, src);
    if (price == null) continue;
    // crossed if the level sits within (prev, cur] — i.e. strictly past prev, reached/passed by cur
    const crossed = dir === 'up' ? (price > prevSpot && price <= curSpot) : (price < prevSpot && price >= curSpot);
    if (crossed && price > lo - 1e-9 && price < hi + 1e-9) fired.push({ id: a.id, ticker: a.ticker, label: alertLabel(a), price, spot: curSpot, dir, ts });
  }
  return fired;
}
