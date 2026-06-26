import { useEffect, useMemo, useRef, useState } from 'react';
import { Candle, GexProfileData } from '../types';
import { useContractStore } from '../lib/store';
import * as TI from '../lib/indicators';

interface SlayerChartProps {
  profile: GexProfileData;
  decimals: number;
  candles?: Candle[]; // optional override; falls back to the live store stream
}

type OHLCV = { o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
type Series = { vals: TI.Num[]; color: string; w?: number; dots?: boolean };
type PaneData = { lines: Series[]; hist?: { vals: TI.Num[] }; range?: [number, number]; guides?: { v: number; strong?: boolean }[]; readout: string };

// Price-pane overlays — each builds 1+ aligned series from the OHLCV bundle. Grouped for the menu.
const OVERLAY_DEFS: { key: string; label: string; group: string; build: (o: OHLCV) => Series[] }[] = [
  { key: 'ema20', label: 'EMA 20', group: 'Moving Averages', build: o => [{ vals: TI.ema(o.c, 20), color: '#3b9bff' }] },
  { key: 'ema50', label: 'EMA 50', group: 'Moving Averages', build: o => [{ vals: TI.ema(o.c, 50), color: '#b070ff' }] },
  { key: 'sma200', label: 'SMA 200', group: 'Moving Averages', build: o => [{ vals: TI.sma(o.c, 200), color: '#ff8a3d' }] },
  { key: 'wma20', label: 'WMA 20', group: 'Moving Averages', build: o => [{ vals: TI.wma(o.c, 20), color: '#22d3ee' }] },
  { key: 'hma', label: 'Hull MA 16', group: 'Moving Averages', build: o => [{ vals: TI.hma(o.c, 16), color: '#f472b6' }] },
  { key: 'vwma', label: 'VWMA 20', group: 'Moving Averages', build: o => [{ vals: TI.vwma(o.c, o.v, 20), color: '#34d399' }] },
  { key: 'mcg', label: 'McGinley Dyn', group: 'Moving Averages', build: o => [{ vals: TI.mcginleyDynamic(o.c, 14), color: '#facc15' }] },
  { key: 'vwap', label: 'VWAP', group: 'Moving Averages', build: o => [{ vals: TI.vwap(o.h, o.l, o.c, o.v), color: '#f5b300', w: 2 }] },
  { key: 'bb', label: 'Bollinger', group: 'Bands & Channels', build: o => { const b = TI.bollingerBands(o.c, 20, 2); return [{ vals: b.upper, color: 'rgba(99,160,255,0.55)' }, { vals: b.middle, color: 'rgba(99,160,255,0.3)' }, { vals: b.lower, color: 'rgba(99,160,255,0.55)' }]; } },
  { key: 'keltner', label: 'Keltner', group: 'Bands & Channels', build: o => { const k = TI.keltnerChannels(o.h, o.l, o.c, 20, 2); return [{ vals: k.upper, color: 'rgba(52,211,153,0.5)' }, { vals: k.lower, color: 'rgba(52,211,153,0.5)' }]; } },
  { key: 'donchian', label: 'Donchian', group: 'Bands & Channels', build: o => { const d = TI.donchianChannels(o.h, o.l, 20); return [{ vals: d.upper, color: 'rgba(192,132,252,0.5)' }, { vals: d.lower, color: 'rgba(192,132,252,0.5)' }]; } },
  { key: 'stderr', label: 'Std Error Bands', group: 'Bands & Channels', build: o => { const s = TI.standardErrorBands(o.c, 20, 2); return [{ vals: s.upper, color: 'rgba(244,114,182,0.5)' }, { vals: s.middle, color: 'rgba(244,114,182,0.3)' }, { vals: s.lower, color: 'rgba(244,114,182,0.5)' }]; } },
  { key: 'supertrend', label: 'SuperTrend', group: 'Trend Overlays', build: o => [{ vals: TI.superTrend(o.h, o.l, o.c, 10, 3).trend, color: '#10b981', w: 1.6 }] },
  { key: 'psar', label: 'Parabolic SAR', group: 'Trend Overlays', build: o => [{ vals: TI.parabolicSAR(o.h, o.l), color: '#e5e7eb', dots: true }] },
  { key: 'linreg', label: 'Linear Reg', group: 'Trend Overlays', build: o => [{ vals: TI.linearRegression(o.c, 20).value, color: '#fbbf24', w: 1.4 }] },
  { key: 'ichimoku', label: 'Ichimoku', group: 'Trend Overlays', build: o => { const ic = TI.ichimoku(o.h, o.l, o.c); return [{ vals: ic.tenkan, color: '#60a5fa' }, { vals: ic.kijun, color: '#f87171' }]; } },
];

// Oscillator sub-panes — each builds render-ready data (lines / histogram / guides / range).
const PANE_DEFS: { key: string; label: string; group: string; build: (o: OHLCV) => PaneData }[] = [
  { key: 'rsi', label: 'RSI 14', group: 'Momentum', build: o => ({ lines: [{ vals: TI.rsi(o.c, 14), color: '#e879f9' }], range: [0, 100], guides: [{ v: 30 }, { v: 50, strong: true }, { v: 70 }], readout: 'RSI 14' }) },
  { key: 'stochrsi', label: 'Stoch RSI', group: 'Momentum', build: o => { const s = TI.stochRsi(o.c); return { lines: [{ vals: s.k, color: '#38bdf8' }, { vals: s.d, color: '#ff8a3d' }], range: [0, 100], guides: [{ v: 20 }, { v: 80 }], readout: 'STOCH RSI' }; } },
  { key: 'stoch', label: 'Stochastic', group: 'Momentum', build: o => { const s = TI.stochastic(o.h, o.l, o.c, 14, 3); return { lines: [{ vals: s.k, color: '#38bdf8' }, { vals: s.d, color: '#ff8a3d' }], range: [0, 100], guides: [{ v: 20 }, { v: 80 }], readout: 'STOCH 14·3' }; } },
  { key: 'macd', label: 'MACD', group: 'Momentum', build: o => { const m = TI.macd(o.c); return { lines: [{ vals: m.macd, color: '#3b9bff' }, { vals: m.signal, color: '#f5b300' }], hist: { vals: m.histogram }, guides: [{ v: 0, strong: true }], readout: 'MACD 12·26·9' }; } },
  { key: 'tsi', label: 'TSI', group: 'Momentum', build: o => { const t = TI.tsi(o.c); return { lines: [{ vals: t.tsi, color: '#a78bfa' }, { vals: t.signal, color: '#f5b300' }], guides: [{ v: 0, strong: true }], readout: 'TSI 25·13' }; } },
  { key: 'cci', label: 'CCI 20', group: 'Momentum', build: o => ({ lines: [{ vals: TI.cci(o.h, o.l, o.c, 20), color: '#22d3ee' }], guides: [{ v: 100 }, { v: 0, strong: true }, { v: -100 }], readout: 'CCI 20' }) },
  { key: 'willr', label: 'Williams %R', group: 'Momentum', build: o => ({ lines: [{ vals: TI.williamsR(o.h, o.l, o.c, 14), color: '#f472b6' }], range: [-100, 0], guides: [{ v: -20 }, { v: -80 }], readout: 'WILLIAMS %R' }) },
  { key: 'roc', label: 'ROC 12', group: 'Momentum', build: o => ({ lines: [{ vals: TI.roc(o.c, 12), color: '#60a5fa' }], guides: [{ v: 0, strong: true }], readout: 'ROC 12' }) },
  { key: 'ultimate', label: 'Ultimate Osc', group: 'Momentum', build: o => ({ lines: [{ vals: TI.ultimateOscillator(o.h, o.l, o.c), color: '#c084fc' }], range: [0, 100], guides: [{ v: 30 }, { v: 70 }], readout: 'ULTIMATE' }) },
  { key: 'awesome', label: 'Awesome Osc', group: 'Momentum', build: o => ({ lines: [], hist: { vals: TI.awesomeOscillator(o.h, o.l) }, guides: [{ v: 0, strong: true }], readout: 'AWESOME' }) },
  { key: 'trix', label: 'TRIX 15', group: 'Momentum', build: o => ({ lines: [{ vals: TI.trix(o.c, 15), color: '#f59e0b' }], guides: [{ v: 0, strong: true }], readout: 'TRIX 15' }) },
  { key: 'dpo', label: 'DPO 20', group: 'Momentum', build: o => ({ lines: [{ vals: TI.dpo(o.c, 20), color: '#94a3b8' }], guides: [{ v: 0, strong: true }], readout: 'DPO 20' }) },
  { key: 'fisher', label: 'Fisher Transform', group: 'Momentum', build: o => { const f = TI.fisherTransform(o.h, o.l, 9); return { lines: [{ vals: f.fisher, color: '#22d3ee' }, { vals: f.trigger, color: '#f5b300' }], guides: [{ v: 0, strong: true }], readout: 'FISHER 9' }; } },
  { key: 'adx', label: 'ADX (+DI/-DI)', group: 'Trend Strength', build: o => { const a = TI.adx(o.h, o.l, o.c, 14); return { lines: [{ vals: a.adx, color: '#e5e7eb' }, { vals: a.plusDI, color: '#26d07c' }, { vals: a.minusDI, color: '#ff4d5e' }], range: [0, 100], guides: [{ v: 25 }], readout: 'ADX 14' }; } },
  { key: 'aroon', label: 'Aroon', group: 'Trend Strength', build: o => { const a = TI.aroon(o.h, o.l, 25); return { lines: [{ vals: a.up, color: '#26d07c' }, { vals: a.down, color: '#ff4d5e' }], range: [0, 100], guides: [{ v: 50, strong: true }], readout: 'AROON 25' }; } },
  { key: 'atr', label: 'ATR 14', group: 'Volatility', build: o => ({ lines: [{ vals: TI.atr(o.h, o.l, o.c, 14), color: '#fbbf24' }], readout: 'ATR 14' }) },
  { key: 'histvol', label: 'Hist Volatility', group: 'Volatility', build: o => ({ lines: [{ vals: TI.historicalVolatility(o.c, 20), color: '#f472b6' }], readout: 'HV 20' }) },
  { key: 'chaikinvol', label: 'Chaikin Vol', group: 'Volatility', build: o => ({ lines: [{ vals: TI.chaikinVolatility(o.h, o.l, 10), color: '#c084fc' }], guides: [{ v: 0, strong: true }], readout: 'CHAIKIN VOL' }) },
  { key: 'mfi', label: 'MFI 14', group: 'Volume', build: o => ({ lines: [{ vals: TI.mfi(o.h, o.l, o.c, o.v, 14), color: '#34d399' }], range: [0, 100], guides: [{ v: 20 }, { v: 80 }], readout: 'MFI 14' }) },
  { key: 'obv', label: 'OBV', group: 'Volume', build: o => ({ lines: [{ vals: TI.obv(o.c, o.v), color: '#60a5fa' }], readout: 'OBV' }) },
  { key: 'cmf', label: 'CMF 20', group: 'Volume', build: o => ({ lines: [{ vals: TI.cmf(o.h, o.l, o.c, o.v, 20), color: '#34d399' }], guides: [{ v: 0, strong: true }], readout: 'CMF 20' }) },
  { key: 'vroc', label: 'Volume ROC', group: 'Volume', build: o => ({ lines: [{ vals: TI.vroc(o.v, 14), color: '#22d3ee' }], guides: [{ v: 0, strong: true }], readout: 'VOL ROC 14' }) },
  { key: 'evm', label: 'Ease of Movement', group: 'Volume', build: o => ({ lines: [{ vals: TI.easeOfMovement(o.h, o.l, o.v, 14), color: '#a78bfa' }], guides: [{ v: 0, strong: true }], readout: 'EOM 14' }) },
];

const OVERLAY_GROUPS = ['Moving Averages', 'Bands & Channels', 'Trend Overlays'];
const PANE_GROUPS = ['Momentum', 'Trend Strength', 'Volatility', 'Volume'];

type ChartType = 'candles' | 'hollow' | 'heikin' | 'bars' | 'line' | 'area' | 'baseline';
const CHART_TYPES: { k: ChartType; l: string }[] = [
  { k: 'candles', l: 'Candles' }, { k: 'hollow', l: 'Hollow' }, { k: 'heikin', l: 'Heikin Ashi' }, { k: 'bars', l: 'Bars' }, { k: 'line', l: 'Line' }, { k: 'area', l: 'Area' }, { k: 'baseline', l: 'Baseline' },
];

// ── Drawing tools ──────────────────────────────────────────────────────────────
type DrawTool = 'cursor' | 'trend' | 'ray' | 'hline' | 'measure';
type Anchor = { t: number; price: number }; // timestamp + price, so a mark stays glued on pan/zoom
type Drawing =
  | { id: string; kind: 'hline'; price: number; color: string }
  | { id: string; kind: 'trend' | 'ray'; a: Anchor; b: Anchor; color: string };
const DRAW_COLOR = '#38bdf8';
const DRAW_TOOLS: { k: Exclude<DrawTool, 'cursor'>; g: string; l: string }[] = [
  { k: 'trend', g: '╱', l: 'Trend line' }, { k: 'ray', g: '➚', l: 'Ray' }, { k: 'hline', g: '─', l: 'Horizontal line' }, { k: 'measure', g: '⊡', l: 'Measure' },
];
const newId = () => 'd' + Math.random().toString(36).slice(2, 9);
// Fractional bar index for a timestamp (interpolates inside the data, extrapolates at the bar
// cadence beyond either end) — the inverse, timeOfIdx, lets a screen click resolve to a time.
function idxOfTime(cs: Candle[], t: number): number {
  const n = cs.length; if (!n) return 0;
  const t0 = cs[0].timestamp, tf = n > 1 ? (cs[n - 1].timestamp - t0) / (n - 1) || 6e4 : 6e4;
  if (t <= t0) return (t - t0) / tf;
  if (t >= cs[n - 1].timestamp) return (n - 1) + (t - cs[n - 1].timestamp) / tf;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cs[m].timestamp <= t) lo = m; else hi = m; }
  return lo + (t - cs[lo].timestamp) / ((cs[hi].timestamp - cs[lo].timestamp) || 1);
}
function timeOfIdx(cs: Candle[], idx: number): number {
  const n = cs.length; if (!n) return 0;
  const t0 = cs[0].timestamp, tf = n > 1 ? (cs[n - 1].timestamp - t0) / (n - 1) || 6e4 : 6e4;
  if (idx <= 0) return t0 + idx * tf;
  if (idx >= n - 1) return cs[n - 1].timestamp + (idx - (n - 1)) * tf;
  const i = Math.floor(idx); return cs[i].timestamp + (idx - i) * ((cs[i + 1].timestamp - cs[i].timestamp) || tf);
}
// Distance from point P to segment AB — for click-to-select hit testing.
function distToSeg(px2: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let tt = len2 ? ((px2 - ax) * dx + (py - ay) * dy) / len2 : 0; tt = Math.max(0, Math.min(1, tt));
  const cx = ax + tt * dx, cy = ay + tt * dy; return Math.hypot(px2 - cx, py - cy);
}

// Convert a #hex (3/6-digit) to rgba() at the given alpha — lets us tint the live theme tokens.
const hexA = (hex: string, a: number) => {
  const h = (hex || '').trim().replace('#', '');
  if (h.length < 3) return `rgba(255,255,255,${a})`;
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  if (Number.isNaN(v)) return `rgba(148,148,148,${a})`; // non-hex token (e.g. hsl/var) → neutral fallback
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};
// Classic green/up · red/down candle defaults (normal trading colors), overridable per-user.
const DEFAULT_COLORS: { up: string; down: string; line: string } = { up: '#22c55e', down: '#ef4444', line: '#5b9cff' };
// Read the live Slayer theme tokens so the canvas matches whatever theme is active.
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (name: string, fb: string) => { const v = cs.getPropertyValue(name).trim(); return v || fb; };
  return {
    up: g('--success', '#4ADE80'), down: g('--danger', '#F87171'), accent: g('--accent-color', '#FAFAFA'),
    info: g('--info', '#60A5FA'), warning: g('--warning', '#FBBF24'),
    text: g('--text-primary', '#E5E5E5'), dim: g('--text-tertiary', '#A3A3A3'), bgBase: g('--bg-base', '#0A0A0A'),
  };
}

const EMPTY: Candle[] = [];
const niceStep = (raw: number) => {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw)), f = raw / Math.pow(10, exp);
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * Math.pow(10, exp);
};
const fmtTime = (ts: number) => { const d = new Date(ts); const h = d.getHours(), m = d.getMinutes(); return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`; };
const sameDay = (a: number, b: number) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
const px = (v: number) => Math.round(v) + 0.5;
const fmtOsc = (v: number) => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(2);

/**
 * SlayerChart — our own canvas engine (no library). Smart-scaled price pane with candles /
 * volume / a registry-driven overlay set, stacked oscillator sub-panes (also registry-driven),
 * a dedicated GEX gamma-profile lane, collision-free dealer-level pills, and displacement
 * bursts that gold-ring on a dealer level. ~40 of the 48 unit-tested indicators are exposed
 * through a grouped/searchable menu; everything is opt-in. Redraws are rAF-throttled.
 */
export function SlayerChart({ profile, decimals, candles: propCandles }: SlayerChartProps) {
  const storeChart = useContractStore(s => s.activeContract?.chartData);
  const candles = propCandles ?? storeChart ?? EMPTY;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Chart prefs persist across reloads (localStorage). A first-time user still gets the clean
  // default — only the GEX profile on, every indicator + displacement opt-in, TradingView-style.
  const initialPrefs = useMemo(() => { try { return JSON.parse(localStorage.getItem('slayerchart.prefs.v1') || '{}'); } catch { return {}; } }, []);
  const [ovOn, setOvOn] = useState<Record<string, boolean>>(initialPrefs.ovOn || {});
  const [paneOn, setPaneOn] = useState<Record<string, boolean>>(initialPrefs.paneOn || {});
  const [showGex, setShowGex] = useState<boolean>(initialPrefs.showGex ?? true);
  const [showDisp, setShowDisp] = useState<boolean>(initialPrefs.showDisp ?? false);
  const [chartType, setChartType] = useState<ChartType>(initialPrefs.chartType || 'candles');
  const [colors, setColors] = useState<{ up?: string; down?: string; line?: string }>(initialPrefs.colors || {});
  const [typeOpen, setTypeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<{ bars: number; off: number }>({ bars: 110, off: 0 });
  // Vertical price scale: null = auto-fit (default). Manual = the user dragged the price axis;
  // `factor` scales the auto range (1 = auto, <1 zoom in, >1 zoom out), `offset` shifts it.
  const [priceView, setPriceView] = useState<{ factor: number; offset: number } | null>(null);
  // Drawing tools — marks the trader places on the chart (timestamp-anchored, persisted per ticker).
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<DrawTool>('cursor');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tfKey = useContractStore(s => s.selectedTimeframe);
  const tickKey = useContractStore(s => s.selectedAsset?.ticker);
  useEffect(() => { setView({ bars: 110, off: 0 }); setPriceView(null); }, [tfKey, tickKey]);
  // Load this ticker's saved drawings (and reset transient drawing state) on symbol change.
  useEffect(() => {
    try { const raw = localStorage.getItem('slayerchart.draw.' + (tickKey || '_')); setDrawings(raw ? JSON.parse(raw) : []); } catch { setDrawings([]); }
    setSelectedId(null); draftRef.current = null; measureRef.current = null; measureDragRef.current = false;
  }, [tickKey]);
  useEffect(() => { try { localStorage.setItem('slayerchart.draw.' + (tickKey || '_'), JSON.stringify(drawings)); } catch { /* storage unavailable */ } }, [drawings, tickKey]);

  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; off: number } | null>(null);
  const priceDragRef = useRef<{ y: number; factor: number; offset: number } | null>(null);
  const draftRef = useRef<Anchor | null>(null);          // first point of a 2-point drawing
  const measureRef = useRef<{ a: Anchor; b: Anchor } | null>(null);
  const measureDragRef = useRef(false);
  const viewRef = useRef(view); viewRef.current = view;
  const priceViewRef = useRef(priceView); priceViewRef.current = priceView;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const toolRef = useRef(tool); toolRef.current = tool;
  const drawingsRef = useRef(drawings); drawingsRef.current = drawings;
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const drawRef = useRef<() => void>(() => {});
  const geomRef = useRef<{ plotL: number; plotR: number; barW: number; start: number; end: number; n: number; priceTop: number; priceAreaH: number; lo: number; hi: number } | null>(null);
  const themeRef = useRef<ReturnType<typeof readTheme> | null>(null);

  const ohlcv = useMemo<OHLCV>(() => ({ o: candles.map(c => c.open), h: candles.map(c => c.high), l: candles.map(c => c.low), c: candles.map(c => c.close), v: candles.map(c => c.volume) }), [candles]);
  const atr = useMemo(() => TI.atr(ohlcv.h, ohlcv.l, ohlcv.c, 14), [ohlcv]);
  // Heikin Ashi candles (smoothed) — body/wick from HA values, volume/timestamp kept raw.
  const ha = useMemo<Candle[]>(() => {
    const out: Candle[] = [];
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const close = (c.open + c.high + c.low + c.close) / 4;
      const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
      out.push({ timestamp: c.timestamp, open, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), close, volume: c.volume });
    }
    return out;
  }, [candles]);

  // Persist chart prefs (type, colors, indicator selection, GEX/disp toggles) so a user's
  // setup survives a reload. Saving the initial (already-stored) values once is harmless.
  useEffect(() => {
    try { localStorage.setItem('slayerchart.prefs.v1', JSON.stringify({ chartType, colors, ovOn, paneOn, showGex, showDisp })); } catch { /* storage unavailable */ }
  }, [chartType, colors, ovOn, paneOn, showGex, showDisp]);

  // Only enabled indicators are computed, and only when the selection or candles change
  // (NOT on pan/hover) — keeps interaction cheap.
  const overlaySeries = useMemo(() => { const out: Record<string, Series[]> = {}; for (const d of OVERLAY_DEFS) if (ovOn[d.key]) out[d.key] = d.build(ohlcv); return out; }, [ohlcv, ovOn]);
  const paneSeries = useMemo(() => { const out: { def: typeof PANE_DEFS[number]; data: PaneData }[] = []; for (const d of PANE_DEFS) if (paneOn[d.key]) out.push({ def: d, data: d.build(ohlcv) }); return out; }, [ohlcv, paneOn]);

  const displacements = useMemo(() => {
    const levels = [profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet, profile.spot].filter(x => typeof x === 'number' && (x as number) > 0) as number[];
    const out: { i: number; dir: 1 | -1; onLevel: boolean }[] = [];
    for (let i = 1; i < candles.length; i++) {
      const a = atr[i]; if (a == null || a === 0) continue;
      const c = candles[i];
      if (Math.abs(c.close - c.open) > 1.5 * a) {
        const mid = (c.high + c.low) / 2, tol = Math.max(c.high - c.low, (profile.spot || c.close) * 0.0007);
        out.push({ i, dir: c.close >= c.open ? 1 : -1, onLevel: levels.some(L => Math.abs(mid - L) <= tol) });
      }
    }
    return out;
  }, [candles, atr, profile]);

  drawRef.current = () => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth, H = container.clientHeight;
    if (W <= 0 || H <= 0) return;
    // Only resize the backing store when it actually changes — reassigning width/height
    // reallocates the GPU surface and resets the context, which is ruinous on every
    // hover/pan frame at high DPR.
    const nw = Math.floor(W * dpr), nh = Math.floor(H * dpr);
    if (canvas.width !== nw || canvas.height !== nh) { canvas.width = nw; canvas.height = nh; canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.font = '11px var(--font-mono, ui-monospace), monospace'; ctx.textBaseline = 'middle';

    // Theme-driven palette, cached — getComputedStyle is too costly to run per frame.
    const T = themeRef.current || (themeRef.current = readTheme());
    // User color overrides (persisted) win; otherwise classic green-up / red-down defaults.
    const upCol = colors.up || DEFAULT_COLORS.up, downCol = colors.down || DEFAULT_COLORS.down, lineCol = colors.line || DEFAULT_COLORS.line;
    const COL = {
      up: upCol, down: downCol, upVol: hexA(upCol, 0.3), downVol: hexA(downCol, 0.3),
      grid: 'rgba(255,255,255,0.05)', axis: T.dim, axisDim: hexA(T.dim, 0.7),
      callWall: upCol, putWall: downCol, flip: T.warning, magnet: T.accent, em: T.info,
    };

    // Thousands-separated price formatter for every axis / level / readout label.
    const nf = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    if (candles.length === 0) { ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText('Awaiting candle stream…', W / 2, H / 2); return; }

    const axisW = 60, topPad = 6, xAxisH = 22;
    const gammaW = (showGex && profile.strikes && profile.strikes.length) ? 46 : 0;
    const plotL = 2, plotR = W - axisW - gammaW, plotW = plotR - plotL, gammaR = plotR + gammaW;
    const availH = H - topPad - xAxisH;
    const subH = paneSeries.length ? Math.min(86, (availH * 0.42) / paneSeries.length) : 0;
    const priceH = availH - subH * paneSeries.length;
    const priceTop = topPad, priceBottom = topPad + priceH;

    const n = candles.length;
    const bars = Math.max(20, Math.min(n, viewRef.current.bars));
    // Allow scrolling PAST the live edge into right-side whitespace (negative off) so the latest
    // bar can be pulled off the right gutter — the TradingView free-movement feel.
    const maxOff = Math.max(0, n - 10), minOff = -Math.round(bars * 0.5);
    const off = Math.max(minOff, Math.min(maxOff, viewRef.current.off));
    const end = n - off, start = Math.max(0, end - bars);
    const barW = plotW / bars;
    const xOf = (gi: number) => plotL + (gi - start) * barW + barW / 2;
    const src = chartType === 'heikin' ? ha : candles;
    const vis = src.slice(start, end);

    let lo = Infinity, hi = -Infinity;
    for (const c of vis) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
    if (!isFinite(lo) || !isFinite(hi)) return;
    const cRange = (hi - lo) || (hi || 1) * 0.01;
    const capLo = lo - cRange * 0.85, capHi = hi + cRange * 0.85;
    const levelPrices = [profile.spot, profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet];
    if (profile.spot && profile.expectedMovePct) levelPrices.push(profile.spot * (1 + profile.expectedMovePct), profile.spot * (1 - profile.expectedMovePct));
    for (const p of levelPrices) { if (typeof p === 'number' && p > 0 && p >= capLo && p <= capHi) { lo = Math.min(lo, p); hi = Math.max(hi, p); } }
    const pad = ((hi - lo) || 1) * 0.08; lo -= pad; hi += pad;
    // Manual vertical scale (drag the price axis): scale the auto range about its center + shift.
    const pv = priceViewRef.current;
    if (pv) { const center = (lo + hi) / 2, half = Math.max(1e-6, ((hi - lo) / 2) * pv.factor); lo = center - half + pv.offset; hi = center + half + pv.offset; }
    const volBandH = priceH * 0.13, priceAreaH = priceH - volBandH;
    const yP = (p: number) => priceTop + priceAreaH - ((p - lo) / (hi - lo)) * priceAreaH;
    const pOfY = (y: number) => lo + (1 - (y - priceTop) / priceAreaH) * (hi - lo);
    geomRef.current = { plotL, plotR, barW, start, end, n, priceTop, priceAreaH, lo, hi };

    // faint ticker · timeframe watermark (lower third, dim)
    if (tickKey) {
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.026)';
      ctx.font = '600 44px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`${tickKey}${tfKey ? '  ·  ' + tfKey : ''}`, plotL + plotW / 2, priceTop + priceAreaH * 0.74);
      ctx.restore(); ctx.font = '11px ui-monospace, monospace';
    }

    const step = niceStep((hi - lo) / 6);
    const gridYs: { y: number; label: string }[] = [];
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      const y = yP(g); if (y < priceTop + 4 || y > priceBottom - 2) continue;
      ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(plotL, px(y) - 0.5); ctx.lineTo(plotR, px(y) - 0.5); ctx.stroke();
      gridYs.push({ y, label: nf(g) });
    }

    let lastDayTickX = -1e9;
    for (let i = 0; i < vis.length; i++) {
      const gi = start + i; const c = candles[gi]; if (!c) continue;
      const prev = candles[gi - 1];
      if (prev && !sameDay(prev.timestamp, c.timestamp)) { const x = xOf(gi); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(px(x - barW / 2), priceTop); ctx.lineTo(px(x - barW / 2), priceBottom); ctx.stroke(); lastDayTickX = x; }
    }

    // Expected-move ±1σ channel — shade the band between EM+ and EM- (dealer-implied day range).
    if (profile.spot && profile.expectedMovePct) {
      const emHi = yP(profile.spot * (1 + profile.expectedMovePct)), emLo = yP(profile.spot * (1 - profile.expectedMovePct));
      const top = Math.max(priceTop, Math.min(emHi, emLo)), h = Math.min(priceBottom, Math.max(emHi, emLo)) - top;
      if (h > 0) { ctx.fillStyle = hexA(COL.em, 0.06); ctx.fillRect(plotL, top, plotW, h); }
    }

    // Volume strip — opacity scales with price velocity (|Δ| vs ATR) so impulse bars read louder.
    let maxVol = 0; for (const c of vis) maxVol = Math.max(maxVol, c.volume || 0);
    const volBase = priceBottom;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(plotL, px(priceBottom - volBandH - 1)); ctx.lineTo(plotR, px(priceBottom - volBandH - 1)); ctx.stroke();
    for (let i = 0; i < vis.length; i++) {
      const gi = start + i, c = vis[i], vh = maxVol ? ((c.volume || 0) / maxVol) * (volBandH - 2) : 0;
      const a = atr[gi], vel = a && a > 0 ? Math.min(1, Math.abs(c.close - c.open) / (1.6 * a)) : 0.4;
      const alpha = 0.2 + vel * 0.45;
      ctx.fillStyle = c.close >= c.open ? hexA(COL.up, alpha) : hexA(COL.down, alpha);
      ctx.fillRect(xOf(gi) - barW * 0.34, volBase - vh, barW * 0.68, vh);
    }

    // GEX gamma-profile lane
    if (gammaW && profile.strikes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.moveTo(px(plotR), priceTop); ctx.lineTo(px(plotR), priceBottom); ctx.stroke();
      const inView = profile.strikes.filter(r => { const y = yP(r.strike); return y >= priceTop && y <= priceBottom; });
      const maxAbs = Math.max(...inView.map(r => Math.abs(r.netGex || 0)), 1e-9);
      let thick = 6;
      if (inView.length > 1) { const span = Math.abs(yP(inView[0].strike) - yP(inView[inView.length - 1].strike)); thick = Math.max(2, Math.min(11, (span / (inView.length - 1)) * 0.82)); }
      for (const r of inView) {
        const y = yP(r.strike), len = Math.max(1, (Math.abs(r.netGex || 0) / maxAbs) * (gammaW - 5)), isWall = r.strike === profile.callWall || r.strike === profile.putWall;
        ctx.fillStyle = (r.netGex || 0) >= 0 ? hexA(COL.up, isWall ? 0.95 : 0.6) : hexA(COL.down, isWall ? 0.95 : 0.6);
        ctx.fillRect(plotR + 2, y - thick / 2, len, thick);
      }
      ctx.fillStyle = COL.axisDim; ctx.textAlign = 'left'; ctx.font = '8px ui-monospace, monospace'; ctx.fillText('γ', plotR + 3, priceTop + 7); ctx.font = '11px ui-monospace, monospace';
    }

    // price series — five chart types (TradingView-style)
    if (chartType === 'line' || chartType === 'area' || chartType === 'baseline') {
      const lastVisGi = start + vis.length - 1;
      const tracePath = () => { ctx.beginPath(); let st = false; for (let i = 0; i < vis.length; i++) { const x = xOf(start + i), y = yP(vis[i].close); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); } };
      if (chartType === 'area') {
        tracePath(); ctx.lineTo(xOf(lastVisGi), priceBottom - volBandH); ctx.lineTo(xOf(start), priceBottom - volBandH); ctx.closePath();
        const grad = ctx.createLinearGradient(0, priceTop, 0, priceBottom - volBandH);
        grad.addColorStop(0, hexA(lineCol, 0.22)); grad.addColorStop(1, hexA(lineCol, 0.012));
        ctx.fillStyle = grad; ctx.fill();
      } else if (chartType === 'baseline') {
        // Two-tone fill split at the first visible close — above = up color, below = down color.
        const baseY = Math.max(priceTop, Math.min(priceBottom - volBandH, yP(vis[0].close)));
        const fillBand = (y0: number, h: number, col: string) => { if (h <= 0) return; ctx.save(); ctx.beginPath(); ctx.rect(plotL, y0, plotW, h); ctx.clip(); tracePath(); ctx.lineTo(xOf(lastVisGi), baseY); ctx.lineTo(xOf(start), baseY); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); };
        fillBand(priceTop, baseY - priceTop, hexA(upCol, 0.18));
        fillBand(baseY, (priceBottom - volBandH) - baseY, hexA(downCol, 0.18));
        ctx.strokeStyle = hexA(T.dim, 0.45); ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(plotL, px(baseY)); ctx.lineTo(plotR, px(baseY)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = chartType === 'baseline' ? (vis[vis.length - 1].close >= vis[0].close ? upCol : downCol) : lineCol;
      ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; tracePath(); ctx.stroke(); ctx.lineWidth = 1;
    } else if (chartType === 'bars') {
      const tick = Math.max(2, barW * 0.32);
      for (let i = 0; i < vis.length; i++) {
        const c = vis[i], x = xOf(start + i); ctx.strokeStyle = c.close >= c.open ? COL.up : COL.down; ctx.lineWidth = Math.max(1, Math.min(2, barW * 0.16));
        ctx.beginPath(); ctx.moveTo(px(x), Math.round(yP(c.high))); ctx.lineTo(px(x), Math.round(yP(c.low))); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(x - tick), Math.round(yP(c.open)) + 0.5); ctx.lineTo(px(x), Math.round(yP(c.open)) + 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(x), Math.round(yP(c.close)) + 0.5); ctx.lineTo(px(x + tick), Math.round(yP(c.close)) + 0.5); ctx.stroke();
      }
      ctx.lineWidth = 1;
    } else {
      for (let i = 0; i < vis.length; i++) {
        const c = vis[i], x = xOf(start + i), up = c.close >= c.open, col = up ? COL.up : COL.down;
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(px(x), Math.round(yP(c.high))); ctx.lineTo(px(x), Math.round(yP(c.low))); ctx.stroke();
        const yO = yP(c.open), yC = yP(c.close), bw = Math.max(1, barW * 0.7), bx = Math.round(x - bw / 2), by = Math.round(Math.min(yO, yC)), bh = Math.max(1, Math.round(Math.abs(yC - yO)));
        if (chartType === 'hollow' && up) { ctx.lineWidth = 1.2; ctx.strokeRect(bx + 0.5, by + 0.5, Math.round(bw) - 1, Math.max(1, bh - 1)); ctx.lineWidth = 1; }
        else ctx.fillRect(bx, by, Math.round(bw), bh);
      }
    }

    // overlays (registry-driven)
    const drawSeries = (ser: Series) => {
      if (ser.dots) { ctx.fillStyle = ser.color; for (let i = 0; i < vis.length; i++) { const val = ser.vals[start + i]; if (val == null) continue; ctx.beginPath(); ctx.arc(xOf(start + i), yP(val), 1.3, 0, Math.PI * 2); ctx.fill(); } return; }
      ctx.strokeStyle = ser.color; ctx.lineWidth = ser.w || 1.5; ctx.lineJoin = 'round'; ctx.beginPath(); let st = false;
      for (let i = 0; i < vis.length; i++) { const val = ser.vals[start + i]; if (val == null) { st = false; continue; } const x = xOf(start + i), y = yP(val); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.lineWidth = 1;
    };
    for (const key of Object.keys(overlaySeries)) for (const ser of overlaySeries[key]) drawSeries(ser);

    // ── User drawings (trend / ray / hline) + draft preview + measure — timestamp-anchored ──
    const xOfT = (t: number) => xOf(idxOfTime(candles, t));
    for (const d of drawingsRef.current) {
      const sel = d.id === selectedRef.current;
      ctx.strokeStyle = d.color; ctx.lineWidth = sel ? 2.4 : 1.5; ctx.setLineDash([]);
      if (d.kind === 'hline') {
        const y = yP(d.price);
        ctx.beginPath(); ctx.moveTo(plotL, px(y) - 0.5); ctx.lineTo(plotR, px(y) - 0.5); ctx.stroke();
        ctx.fillStyle = d.color; const tw = axisW + gammaW - 1;
        (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(plotR + 1, y - 8, tw, 16, 3), ctx.fill()) : ctx.fillRect(plotR + 1, y - 8, tw, 16);
        ctx.fillStyle = '#06090d'; ctx.textAlign = 'left'; ctx.font = '700 10px ui-monospace, monospace'; ctx.fillText(nf(d.price), plotR + 6, y); ctx.font = '11px ui-monospace, monospace';
        if (sel) { ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(plotL + 7, y, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(plotR - 7, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
      } else {
        const x1 = xOfT(d.a.t), y1 = yP(d.a.price); let x2 = xOfT(d.b.t), y2 = yP(d.b.price);
        if (d.kind === 'ray') { const dx = x2 - x1; if (Math.abs(dx) > 0.01) { const m = (y2 - y1) / dx, ex = dx >= 0 ? plotR : plotL; y2 = y1 + m * (ex - x1); x2 = ex; } }
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (sel) { ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(xOfT(d.a.t), yP(d.a.price), 3.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(xOfT(d.b.t), yP(d.b.price), 3.4, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.lineWidth = 1;
    const draft = draftRef.current, hov = hoverRef.current;
    if (draft && hov && (toolRef.current === 'trend' || toolRef.current === 'ray')) {
      ctx.strokeStyle = hexA(T.accent, 0.85); ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(xOfT(draft.t), yP(draft.price)); ctx.lineTo(hov.x, hov.y); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    }
    const ms = measureRef.current;
    if (ms) {
      const x1 = xOfT(ms.a.t), y1 = yP(ms.a.price), x2 = xOfT(ms.b.t), y2 = yP(ms.b.price);
      const up = ms.b.price >= ms.a.price, mc = up ? COL.up : COL.down;
      ctx.fillStyle = hexA(mc, 0.12); ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeStyle = hexA(mc, 0.85); ctx.setLineDash([4, 3]); ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]);
      const dP = ms.b.price - ms.a.price, dPct = ms.a.price ? (dP / ms.a.price) * 100 : 0, nb = Math.abs(idxOfTime(candles, ms.b.t) - idxOfTime(candles, ms.a.t));
      const label = `${dP >= 0 ? '+' : ''}${nf(dP)}  ${dP >= 0 ? '+' : ''}${dPct.toFixed(2)}%  ${nb.toFixed(0)} bars`;
      ctx.font = '700 10px ui-monospace, monospace'; const lw = ctx.measureText(label).width + 12, lx = (x1 + x2) / 2, ly = Math.min(y1, y2) - 9;
      ctx.fillStyle = mc; (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(lx - lw / 2, ly - 9, lw, 16, 3), ctx.fill()) : ctx.fillRect(lx - lw / 2, ly - 9, lw, 16);
      ctx.fillStyle = '#06090d'; ctx.textAlign = 'center'; ctx.fillText(label, lx, ly); ctx.font = '11px ui-monospace, monospace';
    }

    // dealer levels: dashed line + collision-free gutter pills
    const last = candles[n - 1].close, lastUp = candles[n - 1].close >= candles[n - 1].open, lastY = yP(last);
    const pillH = 13, gx = gammaR;
    const lvls: { price: number; color: string; label: string }[] = [];
    const pushLvl = (price: any, color: string, label: string) => { if (typeof price === 'number' && price > 0) lvls.push({ price, color, label }); };
    pushLvl(profile.callWall, COL.callWall, 'CW'); pushLvl(profile.putWall, COL.putWall, 'PW');
    pushLvl(profile.gammaFlip, COL.flip, 'γF'); pushLvl(profile.magnet, COL.magnet, 'MAG');
    if (profile.spot && profile.expectedMovePct) { pushLvl(profile.spot * (1 + profile.expectedMovePct), COL.em, 'EM+'); pushLvl(profile.spot * (1 - profile.expectedMovePct), COL.em, 'EM-'); }
    const placed = lvls.map(L => { const rawY = yP(L.price); const off2 = L.price < lo || L.price > hi; return { ...L, rawY, off: off2, dir: off2 ? (L.price > hi ? -1 : 1) : 0, y: Math.max(priceTop + pillH / 2, Math.min(priceBottom - pillH / 2, rawY)) }; }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) if (placed[i].y - placed[i - 1].y < pillH + 1) placed[i].y = placed[i - 1].y + pillH + 1;
    for (const L of placed) {
      if (!L.off) { ctx.strokeStyle = L.color; ctx.globalAlpha = 0.55; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(plotL, px(L.rawY) - 0.5); ctx.lineTo(plotR, px(L.rawY) - 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      ctx.fillStyle = L.color; ctx.beginPath(); (ctx as any).roundRect?.(gx + 1, L.y - pillH / 2, axisW - 2, pillH, 3); if ((ctx as any).roundRect) ctx.fill(); else ctx.fillRect(gx + 1, L.y - pillH / 2, axisW - 2, pillH);
      ctx.fillStyle = '#06090d'; ctx.textAlign = 'left'; ctx.font = '700 9px ui-monospace, monospace';
      ctx.fillText(L.off ? `${L.dir < 0 ? '↑' : '↓'}${L.label}` : L.label, gx + 4, L.y);
      if (L.off) { ctx.textAlign = 'right'; ctx.fillText(nf(L.price), W - 3, L.y); }
      ctx.font = '11px ui-monospace, monospace';
    }

    ctx.textAlign = 'right';
    for (const g of gridYs) {
      if (Math.abs(g.y - lastY) < pillH) continue;
      if (placed.some(L => Math.abs(L.y - g.y) < pillH)) continue;
      ctx.fillStyle = COL.axisDim; ctx.fillText(g.label, W - 4, g.y);
    }

    if (showDisp) for (const d of displacements) {
      if (d.i < start || d.i >= end) continue; const c = candles[d.i], x = xOf(d.i);
      const y = d.dir > 0 ? yP(c.low) + 10 : yP(c.high) - 10, z = 4;
      ctx.fillStyle = d.onLevel ? COL.flip : (d.dir > 0 ? COL.up : COL.down);
      ctx.beginPath();
      if (d.dir > 0) { ctx.moveTo(x, y - z); ctx.lineTo(x - z, y + z); ctx.lineTo(x + z, y + z); } else { ctx.moveTo(x, y + z); ctx.lineTo(x - z, y - z); ctx.lineTo(x + z, y - z); }
      ctx.closePath(); ctx.fill();
      if (d.onLevel) { ctx.strokeStyle = COL.flip; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
    }

    if (lastY >= priceTop && lastY <= priceBottom) {
      ctx.strokeStyle = lastUp ? hexA(COL.up, 0.55) : hexA(COL.down, 0.55); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(plotL, px(lastY) - 0.5); ctx.lineTo(plotR, px(lastY) - 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = lastUp ? COL.up : COL.down; const tagW = axisW + gammaW - 1;
      (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(plotR + 1, lastY - 8, tagW, 16, 3), ctx.fill()) : ctx.fillRect(plotR + 1, lastY - 8, tagW, 16);
      ctx.fillStyle = '#06090d'; ctx.textAlign = 'left'; ctx.font = '700 11px ui-monospace, monospace'; ctx.fillText(nf(last), plotR + 6, lastY); ctx.font = '11px ui-monospace, monospace';
    }

    // ── Sub-panes (registry-driven) ──
    const drawPane = (entry: { def: typeof PANE_DEFS[number]; data: PaneData }, top: number, h: number) => {
      const { data } = entry, bot = top + h;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(plotL, px(top)); ctx.lineTo(plotR, px(top)); ctx.stroke();
      let plo: number, phi: number;
      if (data.range) { [plo, phi] = data.range; }
      else {
        plo = Infinity; phi = -Infinity;
        const consider = (v: TI.Num) => { if (v != null) { plo = Math.min(plo, v); phi = Math.max(phi, v); } };
        for (let i = start; i < end; i++) { for (const ln of data.lines) consider(ln.vals[i]); if (data.hist) consider(data.hist.vals[i]); }
        if (data.guides) for (const g of data.guides) { plo = Math.min(plo, g.v); phi = Math.max(phi, g.v); }
        if (!isFinite(plo) || !isFinite(phi)) { plo = -1; phi = 1; }
        const p2 = ((phi - plo) || 1) * 0.12; plo -= p2; phi += p2;
      }
      const yS = (v: number) => bot - ((v - plo) / ((phi - plo) || 1)) * h;
      if (data.guides) for (const g of data.guides) { const y = yS(g.v); ctx.strokeStyle = g.strong ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.09)'; ctx.setLineDash(g.strong ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(plotL, px(y)); ctx.lineTo(plotR, px(y)); ctx.stroke(); ctx.setLineDash([]); }
      if (data.hist) { const z = yS(0); for (let i = 0; i < vis.length; i++) { const v = data.hist.vals[start + i]; if (v == null) continue; const x = xOf(start + i), y = yS(v as number); ctx.fillStyle = (v as number) >= 0 ? hexA(COL.up, 0.55) : hexA(COL.down, 0.55); ctx.fillRect(x - barW * 0.3, Math.min(y, z), barW * 0.6, Math.max(1, Math.abs(y - z))); } }
      for (const ln of data.lines) {
        ctx.strokeStyle = ln.color; ctx.lineWidth = 1.3; ctx.beginPath(); let stt = false;
        for (let i = 0; i < vis.length; i++) { const val = ln.vals[start + i]; if (val == null) { stt = false; continue; } const x = xOf(start + i), y = yS(val); if (!stt) { ctx.moveTo(x, y); stt = true; } else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.lineWidth = 1;
      }
      const lastV = (data.lines[0]?.vals[n - 1] ?? data.hist?.vals[n - 1]);
      ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.font = '700 9px ui-monospace, monospace';
      ctx.fillText(`${data.readout}${lastV != null ? '  ' + fmtOsc(lastV as number) : ''}`, plotL + 4, top + 9);
      ctx.font = '11px ui-monospace, monospace';
    };
    paneSeries.forEach((entry, idx) => drawPane(entry, priceBottom + idx * subH, subH));

    const axisY = H - xAxisH; ctx.fillStyle = COL.axisDim; ctx.textAlign = 'center';
    const ticks = Math.max(2, Math.floor(plotW / 96));
    for (let t = 0; t <= ticks; t++) { const gi = start + Math.round(((end - 1 - start) * t) / ticks); if (gi < start || gi >= end || !candles[gi]) continue; const c = candles[gi]; const lbl = (lastDayTickX > 0 && Math.abs(xOf(gi) - lastDayTickX) < 40) ? `${new Date(c.timestamp).getMonth() + 1}/${new Date(c.timestamp).getDate()}` : fmtTime(c.timestamp); ctx.fillText(lbl, xOf(gi), axisY + 11); }

    const hv = hoverRef.current;
    if (hv && hv.x >= plotL && hv.x <= plotR) {
      const gi = Math.max(start, Math.min(Math.min(end - 1, n - 1), start + Math.round((hv.x - plotL - barW / 2) / barW)));
      const cx = xOf(gi);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px(cx), priceTop); ctx.lineTo(px(cx), H - xAxisH); ctx.stroke();
      if (hv.y > priceTop && hv.y < H - xAxisH) { ctx.beginPath(); ctx.moveTo(plotL, px(hv.y)); ctx.lineTo(plotR, px(hv.y)); ctx.stroke(); }
      ctx.setLineDash([]);
      if (hv.y >= priceTop && hv.y <= priceBottom - volBandH) {
        const pr = pOfY(hv.y);
        ctx.fillStyle = '#252b36'; (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(plotR + 1, hv.y - 8, axisW + gammaW - 1, 16, 3), ctx.fill()) : ctx.fillRect(plotR + 1, hv.y - 8, axisW + gammaW - 1, 16); ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'left'; ctx.fillText(nf(pr), plotR + 6, hv.y);
      }
      const c = candles[gi]; ctx.fillStyle = '#252b36'; ctx.textAlign = 'center'; const tw = 40; ctx.fillRect(cx - tw / 2, H - xAxisH, tw, xAxisH); ctx.fillStyle = '#e5e7eb'; ctx.fillText(fmtTime(c.timestamp), cx, H - xAxisH + 11);
      const up = c.close >= c.open, dC = c.close - c.open, dPct = c.open ? (dC / c.open) * 100 : 0;
      const txt = `O ${nf(c.open)}   H ${nf(c.high)}   L ${nf(c.low)}   C ${nf(c.close)}   ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%   V ${(c.volume || 0) >= 1e6 ? ((c.volume || 0) / 1e6).toFixed(2) + 'M' : (c.volume || 0).toLocaleString("en-US")}`;
      ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left'; const wTxt = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(8,10,14,0.82)'; ctx.fillRect(plotL + 2, priceTop + 2, wTxt, 16); ctx.fillStyle = up ? COL.up : COL.down; ctx.fillText(txt, plotL + 9, priceTop + 10);
    } else {
      ctx.textAlign = 'left'; ctx.font = '11px ui-monospace, monospace';
      const segs: { t: string; c: string }[] = [];
      const dC = n > 1 ? candles[n - 1].close - candles[n - 2].close : 0, dPct = n > 1 && candles[n - 2].close ? (dC / candles[n - 2].close) * 100 : 0;
      segs.push({ t: `${tickKey || ''}${tfKey ? ' · ' + tfKey : ''}`, c: T.text });
      segs.push({ t: `${nf(last)}  ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%`, c: lastUp ? COL.up : COL.down });
      for (const d of OVERLAY_DEFS) { if (!ovOn[d.key] || !overlaySeries[d.key]) continue; const v = overlaySeries[d.key][0]?.vals[n - 1]; if (v != null) segs.push({ t: `${d.label} ${nf(v as number)}`, c: overlaySeries[d.key][0].color }); }
      let lx = plotL + 8; const ly = priceTop + 11;
      for (const sg of segs) { ctx.fillStyle = sg.c; ctx.fillText(sg.t, lx, ly); lx += ctx.measureText(sg.t).width + 16; }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current; if (!canvas || !container) return;
    let rafPending = false;
    const schedule = () => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; drawRef.current(); }); };
    themeRef.current = readTheme();
    drawRef.current();
    const ro = new ResizeObserver(() => schedule()); ro.observe(container);
    // Re-read theme tokens only when the theme actually changes, then repaint.
    const mo = new MutationObserver(() => { themeRef.current = readTheme(); schedule(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const n = candlesRef.current.length || 300, factor = e.deltaY > 0 ? 1.15 : 0.87;
      const cur = viewRef.current, next = Math.max(20, Math.min(n, Math.round(cur.bars * factor)));
      if (next === cur.bars) return;
      const g = geomRef.current, r = canvas.getBoundingClientRect(), mx = e.clientX - r.left;
      if (g && mx >= g.plotL && mx <= g.plotR) {
        const giUnder = g.start + (mx - g.plotL) / g.barW, newBarW = (g.plotR - g.plotL) / next, newStart = giUnder - (mx - g.plotL) / newBarW;
        const newOff = Math.max(-Math.round(next * 0.5), Math.min(Math.max(0, n - 10), Math.round(n - next - newStart)));
        setView({ bars: next, off: newOff });
      } else setView(v => ({ ...v, bars: next }));
    };
    type Geom = NonNullable<typeof geomRef.current>;
    const tAtX = (mx: number, g: Geom) => timeOfIdx(candlesRef.current, g.start + (mx - g.plotL) / g.barW);
    const priceAtY = (my: number, g: Geom) => g.lo + (1 - (my - g.priceTop) / g.priceAreaH) * (g.hi - g.lo);
    const hitTest = (mx: number, my: number, g: Geom): string | null => {
      const yOfP = (p: number) => g.priceTop + g.priceAreaH - ((p - g.lo) / (g.hi - g.lo)) * g.priceAreaH;
      const xOfT = (t: number) => g.plotL + (idxOfTime(candlesRef.current, t) - g.start) * g.barW + g.barW / 2;
      let best: string | null = null, bestD = 7;
      for (const d of drawingsRef.current) {
        let dist: number;
        if (d.kind === 'hline') dist = (mx >= g.plotL && mx <= g.plotR) ? Math.abs(my - yOfP(d.price)) : 999;
        else { const x1 = xOfT(d.a.t), y1 = yOfP(d.a.price); let x2 = xOfT(d.b.t), y2 = yOfP(d.b.price); if (d.kind === 'ray') { const dx = x2 - x1; if (Math.abs(dx) > 0.01) { const m = (y2 - y1) / dx, ex = dx >= 0 ? g.plotR : g.plotL; y2 = y1 + m * (ex - x1); x2 = ex; } } dist = distToSeg(mx, my, x1, y1, x2, y2); }
        if (dist < bestD) { bestD = dist; best = d.id; }
      }
      return best;
    };
    const onDown = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, g = geomRef.current, tl = toolRef.current;
      if (!g) return;
      if (tl === 'cursor') {
        if (mx >= g.plotR) { const cur = priceViewRef.current; priceDragRef.current = { y: e.clientY, factor: cur?.factor ?? 1, offset: cur?.offset ?? 0 }; canvas.style.cursor = 'ns-resize'; return; }
        const hit = hitTest(mx, my, g);
        if (hit) { setSelectedId(hit); schedule(); return; }
        if (selectedRef.current) setSelectedId(null);
        dragRef.current = { x: e.clientX, off: viewRef.current.off }; canvas.style.cursor = 'grabbing'; return;
      }
      if (mx >= g.plotR) return; // drawing tools act only inside the plot
      const t = tAtX(mx, g), price = priceAtY(my, g);
      if (tl === 'hline') { setDrawings(a => [...a, { id: newId(), kind: 'hline', price, color: DRAW_COLOR }]); setTool('cursor'); return; }
      if (tl === 'measure') { measureRef.current = { a: { t, price }, b: { t, price } }; measureDragRef.current = true; schedule(); return; }
      if (tl === 'trend' || tl === 'ray') {
        if (!draftRef.current) { draftRef.current = { t, price }; schedule(); }
        else { const a = draftRef.current!; setDrawings(arr => [...arr, { id: newId(), kind: tl, a, b: { t, price }, color: DRAW_COLOR }]); draftRef.current = null; setTool('cursor'); }
      }
    };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect(); hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      const g = geomRef.current;
      if (measureDragRef.current && g && measureRef.current) { measureRef.current.b = { t: tAtX(hoverRef.current.x, g), price: priceAtY(hoverRef.current.y, g) }; schedule(); return; }
      const pd = priceDragRef.current;
      if (pd) { const dy = e.clientY - pd.y; const factor = Math.max(0.2, Math.min(6, pd.factor * Math.exp(dy / 240))); setPriceView({ factor, offset: pd.offset }); return; }
      const drag = dragRef.current;
      if (drag && g) {
        const n = candlesRef.current.length, barW = g.barW;
        const nextOff = Math.max(-Math.round(viewRef.current.bars * 0.5), Math.min(Math.max(0, n - 10), drag.off + Math.round((e.clientX - drag.x) / barW)));
        if (nextOff !== viewRef.current.off) { setView(v => ({ ...v, off: nextOff })); return; }
      }
      // Cursor hint: scale over the gutter, pointer over a selectable drawing, crosshair otherwise.
      if (!dragRef.current && !priceDragRef.current) {
        const tl = toolRef.current, hx = hoverRef.current.x, hy = hoverRef.current.y;
        if (tl !== 'cursor') canvas.style.cursor = 'crosshair';
        else if (g) canvas.style.cursor = hx >= g.plotR ? 'ns-resize' : (hitTest(hx, hy, g) ? 'pointer' : 'crosshair');
      }
      schedule();
    };
    const onUp = () => { dragRef.current = null; priceDragRef.current = null; measureDragRef.current = false; canvas.style.cursor = 'crosshair'; };
    const onLeave = () => { hoverRef.current = null; schedule(); };
    // Double-click (cursor mode): price gutter → auto-fit; elsewhere → snap back to the live edge.
    const onDbl = (e: MouseEvent) => { if (toolRef.current !== 'cursor') return; const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, g = geomRef.current; if (g && mx >= g.plotR) setPriceView(null); else setView({ bars: 110, off: 0 }); };
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null; if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      if (e.key === 'Delete' && selectedRef.current) { const id = selectedRef.current; setDrawings(a => a.filter(d => d.id !== id)); setSelectedId(null); }
      else if (e.key === 'Escape') { draftRef.current = null; measureRef.current = null; measureDragRef.current = false; if (toolRef.current !== 'cursor') setTool('cursor'); if (selectedRef.current) setSelectedId(null); schedule(); }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('dblclick', onDbl);
    window.addEventListener('keydown', onKey);
    return () => { ro.disconnect(); mo.disconnect(); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); canvas.removeEventListener('mouseleave', onLeave); canvas.removeEventListener('dblclick', onDbl); window.removeEventListener('keydown', onKey); };
  }, []);

  // Data/view-driven repaints are rAF-coalesced and do NOT re-read the theme (the MutationObserver
  // above keeps themeRef fresh) — getComputedStyle on every pan/zoom/tick frame was the jank source.
  const redrawRafRef = useRef(0);
  useEffect(() => {
    if (redrawRafRef.current) return;
    redrawRafRef.current = requestAnimationFrame(() => { redrawRafRef.current = 0; drawRef.current(); });
  }, [candles, overlaySeries, paneSeries, displacements, showGex, showDisp, chartType, colors, ha, view, priceView, drawings, tool, selectedId, profile, decimals, tfKey, tickKey]);

  // Keep a scrolled-back view anchored to the same bars when a new candle prints (a normal
  // 1–3 bar growth). A wholesale ticker/timeframe switch is handled by the reset effect above.
  const prevLenRef = useRef(candles.length);
  useEffect(() => {
    const prev = prevLenRef.current, now = candles.length; prevLenRef.current = now;
    const grew = now - prev;
    if (grew > 0 && grew <= 3 && viewRef.current.off > 0) setView(v => ({ ...v, off: v.off + grew }));
  }, [candles.length]);

  const activeCount = Object.values(ovOn).filter(Boolean).length + Object.values(paneOn).filter(Boolean).length;
  const q = query.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  const removeChip = (label: string, color: string, onClick: () => void) => (
    <button key={label} onClick={onClick} className="group flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--danger)]/50 transition-colors">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}<span className="text-[var(--text-tertiary)] group-hover:text-[var(--danger)]">×</span>
    </button>
  );
  const specChip = (active: boolean, label: string, onClick: () => void, tone = 'default') => (
    <button onClick={onClick} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border transition-colors ${active ? (tone === 'warn' ? 'bg-[var(--warning)]/15 border-[var(--warning)]/40 text-[var(--warning)]' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]') : 'bg-transparent border-transparent text-[var(--text-tertiary)] opacity-50'}`}>{label}</button>
  );
  const pickTool = (k: DrawTool) => { setTool(t => (t === k ? 'cursor' : k)); draftRef.current = null; measureRef.current = null; measureDragRef.current = false; };

  return (
    <div className="w-full h-full flex flex-col" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)] shrink-0 relative">
        {/* Chart type */}
        <div className="relative">
          <button onClick={() => setTypeOpen(o => !o)} className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">
            {CHART_TYPES.find(t => t.k === chartType)?.l}<span className="text-[var(--text-tertiary)]">▾</span>
          </button>
          {typeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setTypeOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 w-32 bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl py-1">
                {CHART_TYPES.map(t => (
                  <button key={t.k} onClick={() => { setChartType(t.k); setTypeOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono hover:bg-white/[0.05] transition-colors ${chartType === t.k ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    <span className="w-3 text-center text-[var(--accent-color)]">{chartType === t.k ? '✓' : ''}</span>{t.l}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        {/* Indicator menu */}
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)} className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-black uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">
            <span className="text-[var(--accent-color)]">ƒ</span> Indicators{activeCount > 0 && <span className="px-1 rounded-full bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[9px]">{activeCount}</span>}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setMenuOpen(false); setQuery(''); }} />
              <div className="absolute top-full left-0 mt-1 z-50 w-[290px] max-h-[440px] flex flex-col bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-[var(--border)] shrink-0">
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search 40+ indicators…" className="w-full px-2 py-1.5 rounded bg-black/40 border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent-color)]/50" />
                </div>
                <div className="overflow-y-auto py-1">
                  {OVERLAY_GROUPS.map(group => {
                    const items = OVERLAY_DEFS.filter(d => d.group === group && matches(d.label));
                    if (!items.length) return null;
                    return (
                      <div key={group}>
                        <div className="px-3 pt-2 pb-1 text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{group}</div>
                        {items.map(d => (
                          <button key={d.key} onClick={() => setOvOn(p => ({ ...p, [d.key]: !p[d.key] }))} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.05] transition-colors">
                            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${ovOn[d.key] ? 'bg-[var(--accent-color)] border-[var(--accent-color)]' : 'border-[var(--border-strong)]'}`}>{ovOn[d.key] && <span className="text-black text-[9px] font-black">✓</span>}</span>
                            <span className="text-[11px] font-mono text-[var(--text-secondary)]">{d.label}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  {PANE_GROUPS.map(group => {
                    const items = PANE_DEFS.filter(d => d.group === group && matches(d.label));
                    if (!items.length) return null;
                    return (
                      <div key={group}>
                        <div className="px-3 pt-2 pb-1 text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{group} <span className="text-[var(--text-tertiary)]/60">· pane</span></div>
                        {items.map(d => (
                          <button key={d.key} onClick={() => setPaneOn(p => ({ ...p, [d.key]: !p[d.key] }))} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.05] transition-colors">
                            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${paneOn[d.key] ? 'bg-[var(--accent-color)] border-[var(--accent-color)]' : 'border-[var(--border-strong)]'}`}>{paneOn[d.key] && <span className="text-black text-[9px] font-black">✓</span>}</span>
                            <span className="text-[11px] font-mono text-[var(--text-secondary)]">{d.label}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {activeCount > 0 && <button onClick={() => { setOvOn({}); setPaneOn({}); }} className="shrink-0 border-t border-[var(--border)] py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors">Clear all ({activeCount})</button>}
              </div>
            </>
          )}
        </div>

        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        {/* Drawing tools — trend / ray / horizontal line / measure (timestamp-anchored, persisted per ticker) */}
        <div className="flex items-center gap-1">
          {DRAW_TOOLS.map(d => (
            <button key={d.k} onClick={() => pickTool(d.k)} title={d.l} className={`flex items-center justify-center w-6 h-6 rounded-sm text-[12px] leading-none border transition-colors ${tool === d.k ? 'border-[var(--accent-color)] text-black' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'}`} style={tool === d.k ? { background: 'var(--accent-color)' } : undefined}>{d.g}</button>
          ))}
          {selectedId && <button onClick={() => { const id = selectedId; setDrawings(a => a.filter(x => x.id !== id)); setSelectedId(null); }} title="Delete selected (Del)" className="flex items-center justify-center w-6 h-6 rounded-sm text-[11px] border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors">✕</button>}
          {drawings.length > 0 && <button onClick={() => { setDrawings([]); setSelectedId(null); }} title="Clear all drawings" className="flex items-center justify-center w-6 h-6 rounded-sm text-[11px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 transition-colors">🗑</button>}
        </div>

        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        {/* Active indicator chips (click to remove) — reuse the memoized series color (don't
            recompute the indicator on every render just to read its chip color). */}
        {OVERLAY_DEFS.filter(d => ovOn[d.key]).map(d => removeChip(d.label, overlaySeries[d.key]?.[0]?.color || '#888', () => setOvOn(p => ({ ...p, [d.key]: false }))))}
        {PANE_DEFS.filter(d => paneOn[d.key]).map(d => removeChip(d.label, '#7d8694', () => setPaneOn(p => ({ ...p, [d.key]: false }))))}

        <div className="ml-auto flex items-center gap-1">
          {/* Appearance settings — pick your own bar / line colors (persisted) */}
          <div className="relative">
            <button onClick={() => setSettingsOpen(o => !o)} title="Chart appearance" className="flex items-center justify-center w-6 h-6 rounded-sm text-[12px] leading-none border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⚙</button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} />
                <div className="absolute top-full right-0 mt-1 z-50 w-[210px] bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl p-3">
                  <div className="text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">Bar / Line Colors</div>
                  <div className="space-y-2">
                    {([['up', 'Up bars'], ['down', 'Down bars'], ['line', 'Line / Area']] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">{label}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono tabular-nums uppercase text-[var(--text-tertiary)]">{colors[key] || DEFAULT_COLORS[key]}</span>
                          <input type="color" value={colors[key] || DEFAULT_COLORS[key]} onChange={e => setColors(c => ({ ...c, [key]: e.target.value }))} className="w-7 h-6 rounded cursor-pointer bg-transparent border border-[var(--border)] p-0" />
                        </span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => setColors({})} className="w-full mt-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-widest border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">Reset to default</button>
                </div>
              </>
            )}
          </div>
          {specChip(showGex, 'γ-MAP', () => setShowGex(v => !v))}
          {specChip(showDisp, '⚡ DISP', () => setShowDisp(v => !v), 'warn')}
          {priceView && <button onClick={() => setPriceView(null)} title="Reset price scale to auto-fit (or double-click the price axis)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⤢ AUTO Y</button>}
          {view.off !== 0 && <button onClick={() => setView(v => ({ ...v, off: 0 }))} title="Jump back to the live edge (or double-click the chart)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⟳ LIVE</button>}
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-[300px]" style={{ position: 'relative', flex: 1, minHeight: 300 }}>
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
