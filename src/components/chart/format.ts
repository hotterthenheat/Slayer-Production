// Pure chart helpers — formatters, colour math, theme reader, geometry, range presets.
// Extracted from SlayerChart; no React, no canvas state.
import { Candle, TimeframeVal } from '../../types';

export const newId = () => 'd' + Math.random().toString(36).slice(2, 9);
// Fractional bar index for a timestamp (interpolates inside the data, extrapolates at the bar
// cadence beyond either end) — the inverse, timeOfIdx, lets a screen click resolve to a time.
export function idxOfTime(cs: Candle[], t: number): number {
  const n = cs.length; if (!n) return 0;
  const t0 = cs[0].timestamp, tf = n > 1 ? (cs[n - 1].timestamp - t0) / (n - 1) || 6e4 : 6e4;
  if (t <= t0) return (t - t0) / tf;
  if (t >= cs[n - 1].timestamp) return (n - 1) + (t - cs[n - 1].timestamp) / tf;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cs[m].timestamp <= t) lo = m; else hi = m; }
  return lo + (t - cs[lo].timestamp) / ((cs[hi].timestamp - cs[lo].timestamp) || 1);
}
export function timeOfIdx(cs: Candle[], idx: number): number {
  const n = cs.length; if (!n) return 0;
  const t0 = cs[0].timestamp, tf = n > 1 ? (cs[n - 1].timestamp - t0) / (n - 1) || 6e4 : 6e4;
  if (idx <= 0) return t0 + idx * tf;
  if (idx >= n - 1) return cs[n - 1].timestamp + (idx - (n - 1)) * tf;
  const i = Math.floor(idx); return cs[i].timestamp + (idx - i) * ((cs[i + 1].timestamp - cs[i].timestamp) || tf);
}
// Distance from point P to segment AB — for click-to-select hit testing.
export function distToSeg(px2: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let tt = len2 ? ((px2 - ax) * dx + (py - ay) * dy) / len2 : 0; tt = Math.max(0, Math.min(1, tt));
  const cx = ax + tt * dx, cy = ay + tt * dy; return Math.hypot(px2 - cx, py - cy);
}
// Multiply a #hex toward black (f<1) / white-ish (f>1) for crisp candle borders.
export function shade(hex: string, f: number): string {
  const h = (hex || '').replace('#', ''); if (h.length < 6) return hex;
  const v = parseInt(h.slice(0, 6), 16); if (Number.isNaN(v)) return hex;
  const cl = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return `rgb(${cl(((v >> 16) & 255) * f)}, ${cl(((v >> 8) & 255) * f)}, ${cl((v & 255) * f)})`;
}

// ── Date-range presets — each maps to a backend timeframe + a sensible visible-bar count.
//    Switching the timeframe auto-switches the server's 200-bar buffer for that resolution. ──
export type RangeKey = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
export const RANGE_PRESETS: { k: RangeKey; tf: TimeframeVal; bars: number }[] = [
  { k: '1D', tf: '5m', bars: 78 }, { k: '5D', tf: '15m', bars: 130 }, { k: '1M', tf: '1h', bars: 140 },
  { k: '3M', tf: '1D', bars: 63 }, { k: '6M', tf: '1D', bars: 128 }, { k: '1Y', tf: '1D', bars: 252 }, { k: 'ALL', tf: '1W', bars: 500 },
];
// GEX level-heatmap palette — call-dominant strikes in gold, put-dominant in violet. A
// deliberately distinct, candle-independent pair (our own take on a liquidity heatmap).
export const HEAT_POS = '#e0a93b', HEAT_NEG = '#9b6dff';
// Compact dealer-gamma value: +2.8B / -1.74B / +940M / -310K.
export const fmtGex = (v: number) => { const a = Math.abs(v), s = v >= 0 ? '+' : '-'; if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B'; if (a >= 1e6) return s + (a / 1e6).toFixed(0) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(0) + 'K'; return s + Math.round(a); };
// Linear blend of two #rrggbb hex colors (t in 0..1) — drives the loaded-strike intensity scale.
export const mixHex = (a: string, b: string, t: number) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), k = Math.max(0, Math.min(1, t)); const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * k), g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * k), bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * k); return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1); };
// Pick a high-contrast ink (near-black vs near-white) for text drawn ON a colored chip, by the chip's
// perceived luminance — so on-chip labels stay readable whatever the chip color is, in every theme
// (e.g. a light theme whose accent is near-black, where a fixed dark ink would vanish).
export const contrastInk = (hex: string) => {
  const h = (hex || '').trim().replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  if (Number.isNaN(v)) return '#06090d';
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; // Rec.601 perceived luminance
  return lum > 0.58 ? '#06090d' : '#F3F3F5';
};

// Interval (timeframe) options offered directly on the chart toolbar.
export const CHART_TFS: TimeframeVal[] = ['1m', '2m', '3m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];

// Convert a #hex (3/6-digit) to rgba() at the given alpha — lets us tint the live theme tokens.
export const hexA = (hex: string, a: number) => {
  const h = (hex || '').trim().replace('#', '');
  if (h.length < 3) return `rgba(255,255,255,${a})`;
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  if (Number.isNaN(v)) return `rgba(148,148,148,${a})`; // non-hex token (e.g. hsl/var) → neutral fallback
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};
// Classic green/up · red/down candle defaults (normal trading colors), overridable per-user.
export const DEFAULT_COLORS: { up: string; down: string; line: string } = { up: '#22c55e', down: '#ef4444', line: '#5b9cff' };
// Read the live Slayer theme tokens so the canvas matches whatever theme is active.
export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (name: string, fb: string) => { const v = cs.getPropertyValue(name).trim(); return v || fb; };
  return {
    up: g('--success', '#4ADE80'), down: g('--danger', '#F87171'), accent: g('--accent-color', '#FAFAFA'),
    info: g('--info', '#60A5FA'), warning: g('--warning', '#FBBF24'),
    text: g('--text-primary', '#E5E5E5'), dim: g('--text-tertiary', '#A3A3A3'), bgBase: g('--bg-base', '#0A0A0A'),
    surf: g('--surface-3', '#262626'),
  };
}

export const EMPTY: Candle[] = [];
export const niceStep = (raw: number) => {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw)), f = raw / Math.pow(10, exp);
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * Math.pow(10, exp);
};
export const fmtTime = (ts: number) => { const d = new Date(ts); const h = d.getHours(), m = d.getMinutes(); return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`; };
export const sameDay = (a: number, b: number) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
export const px = (v: number) => Math.round(v) + 0.5;
export const fmtOsc = (v: number) => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(2);
