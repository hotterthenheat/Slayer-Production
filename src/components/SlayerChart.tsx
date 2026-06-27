import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { Candle, GexProfileData, TimeframeVal } from '../types';
import { useContractStore } from '../lib/store';
import * as TI from '../lib/indicators';
import { SyncChannel, CHANNEL_CYCLE, CHANNEL_COLORS, subscribeChannel, publishChannel, broadcastCrosshair } from '../lib/chartSync';
import { fetchHistory } from '../lib/historyCache';
import { OVERLAY_DEFS, PANE_DEFS, OVERLAY_GROUPS, PANE_GROUPS, type OHLCV, type Series, type PaneData } from './chart/indicators';
import { newId, idxOfTime, timeOfIdx, distToSeg, shade, RANGE_PRESETS, HEAT_POS, HEAT_NEG, fmtGex, mixHex, CHART_TFS, hexA, DEFAULT_COLORS, readTheme, EMPTY, niceStep, fmtTime, sameDay, px, fmtOsc, type RangeKey } from './chart/format';
import { CHART_TYPES, DRAW_COLOR, DRAW_TOOLS, type ChartType, type DrawTool, type Anchor, type Drawing } from './chart/drawing';
import { DealerMap, RegimeChip, ChartContextMenu } from './chart/overlays';

interface SlayerChartProps {
  profile: GexProfileData;
  decimals: number;
  candles?: Candle[]; // optional override; falls back to the live store stream
  // Multi-chart panel mode: when panelId is set the instance owns its OWN timeframe / ticker /
  // sync-channel / expiry and its OWN persisted prefs/drawings (keys suffixed by panelId),
  // fully decoupled from the global store. When absent, every code path stays byte-for-byte
  // identical to the single main chart.
  panelId?: string;
  initialTimeframe?: TimeframeVal;
  title?: string;                 // initial ticker for a panel
  initialChannel?: SyncChannel;   // initial sync channel for a panel
}


/**
 * SlayerChart — our own canvas engine (no library). Smart-scaled price pane with candles /
 * volume / a registry-driven overlay set, stacked oscillator sub-panes (also registry-driven),
 * a dedicated GEX gamma-profile lane, collision-free dealer-level pills, and displacement
 * bursts that gold-ring on a dealer level. ~40 of the 48 unit-tested indicators are exposed
 * through a grouped/searchable menu; everything is opt-in. Redraws are rAF-throttled.
 */
// Memoized: in the multi-chart grid, a drag re-renders the grid every pointer frame — memo keeps
// panels whose props are unchanged from re-rendering (only the dragged panel's wrapper moves).
export const SlayerChart = memo(function SlayerChartImpl({ profile, decimals, candles: propCandles, panelId, initialTimeframe, title, initialChannel }: SlayerChartProps) {
  // Panels do NOT subscribe to the global candle slice — returning a constant when panelId is
  // set means a global SSE tick (or another panel's keystroke) never re-renders this instance.
  const storeChart = useContractStore(s => (panelId ? undefined : s.activeContract?.chartData));
  // localStorage key suffix — panels namespace their prefs/drawings; the main chart (no panelId)
  // keeps the exact original keys so existing saved setups are untouched.
  const keySuffix = panelId ? '.' + panelId : '';
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Chart prefs persist across reloads (localStorage). A first-time user still gets the clean
  // default — only the GEX profile on, every indicator + displacement opt-in, TradingView-style.
  const initialPrefs = useMemo(() => { try { return JSON.parse(localStorage.getItem('slayerchart.prefs.v1' + keySuffix) || '{}'); } catch { return {}; } }, [keySuffix]);
  const [ovOn, setOvOn] = useState<Record<string, boolean>>(initialPrefs.ovOn || {});
  const [paneOn, setPaneOn] = useState<Record<string, boolean>>(initialPrefs.paneOn || {});
  // GEX defaults match the dealer-map reference: the Γ-MAP liquidity heatmap (gold/violet level
  // rows + strike diamonds) is the primary view; the green/red γ-profile lane is an opt-in extra.
  // gexMapV2 is a one-time migration — it flips existing users to this look ONCE, then their own
  // toggles win on every load after (so we change the default without overwriting a real choice).
  const gexMapV2 = initialPrefs.gexMapV2 === true;
  const [showGex, setShowGex] = useState<boolean>(gexMapV2 ? (initialPrefs.showGex ?? false) : false);
  const [showDisp, setShowDisp] = useState<boolean>(initialPrefs.showDisp ?? false);
  const [showHeat, setShowHeat] = useState<boolean>(gexMapV2 ? (initialPrefs.showHeat ?? false) : false); // ladder is the default dealer map now
  // ORBS — focal gamma-concentration orbs in the right gutter (a clean alternative to the Γ-MAP diamonds). Opt-in.
  const [showOrbs, setShowOrbs] = useState<boolean>(gexMapV2 ? (initialPrefs.showOrbs ?? false) : false);
  // Dealer-map density — how many strikes the heatmap / orbs / exposure-lane render. Lower = cleaner.
  const [gexCount, setGexCount] = useState<number>(typeof initialPrefs.gexCount === 'number' ? initialPrefs.gexCount : 16);
  const [showLadder, setShowLadder] = useState<boolean>(initialPrefs.showLadder ?? true); // Loaded GEX Strikes (flagship)
  const [showDealerBox, setShowDealerBox] = useState<boolean>(initialPrefs.showDealerBox ?? true); // Dealer Positioning panel
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null); // right-click "View" menu (reset to live, etc.)
  const [chartType, setChartType] = useState<ChartType>(initialPrefs.chartType || 'candles');
  const [colors, setColors] = useState<{ up?: string; down?: string; line?: string; wick?: string; bg?: string; grid?: string }>(initialPrefs.colors || {});
  const [showGrid, setShowGrid] = useState<boolean>(initialPrefs.showGrid ?? true);
  const [showVolume, setShowVolume] = useState<boolean>(initialPrefs.showVolume ?? true);
  const [showWatermark, setShowWatermark] = useState<boolean>(initialPrefs.showWatermark ?? true);
  const [candleBorders, setCandleBorders] = useState<boolean>(initialPrefs.candleBorders ?? true);
  const [range, setRange] = useState<RangeKey | null>(null);
  const setSelectedTimeframe = useContractStore(s => s.setSelectedTimeframe);
  const [typeOpen, setTypeOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tickerEditing, setTickerEditing] = useState(false);
  const [tickerDraft, setTickerDraft] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<{ bars: number; off: number }>({ bars: 110, off: 0 });
  // Vertical price scale: null = auto-fit (default). Manual = the user dragged the price axis;
  // `factor` scales the auto range (1 = auto, <1 zoom in, >1 zoom out), `offset` shifts it.
  const [priceView, setPriceView] = useState<{ factor: number; offset: number } | null>(null);
  // Drawing tools — marks the trader places on the chart (timestamp-anchored, persisted per ticker).
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<DrawTool>('cursor');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const storeTf = useContractStore(s => (panelId ? '5m' : s.selectedTimeframe));
  const storeTick = useContractStore(s => (panelId ? undefined : s.selectedAsset?.ticker));
  // Panel-owned state (seeded from persisted prefs → props): timeframe / ticker / sync-channel /
  // expiry. The main chart leaves these unused and follows the global store.
  const [localTf, setLocalTf] = useState<TimeframeVal>(initialPrefs.timeframe || initialTimeframe || '5m');
  const [panelTicker, setPanelTicker] = useState<string>(initialPrefs.ticker || title || 'SPX');
  const [channel, setChannel] = useState<SyncChannel>(initialPrefs.channel || initialChannel || 'NONE');
  const [expiry, setExpiry] = useState<'0DTE' | '1DTE+' | 'ALL'>(initialPrefs.expiry || '0DTE');
  const [fetched, setFetched] = useState<Candle[] | null>(null);
  const tfKey = panelId ? localTf : storeTf;
  const tickKey = panelId ? panelTicker : storeTick;
  // Per-panel candle data — backfill this panel's ticker/timeframe via the coalescing history
  // cache so N panels on the same symbol share ONE request (and a freshly-added panel on an
  // already-loaded symbol paints instantly). Falls back to the handed-down candles offline/preview.
  // The shared fetch isn't abortable per-caller, so we just drop a late result after unmount.
  useEffect(() => {
    if (!panelId) return;
    let cancelled = false;
    fetchHistory(panelTicker, localTf, 300).then(c => { if (!cancelled && c && c.length) setFetched(c); });
    return () => { cancelled = true; };
  }, [panelId, panelTicker, localTf]);
  const candles = panelId ? (fetched ?? propCandles ?? EMPTY) : (propCandles ?? storeChart ?? EMPTY);

  // ── Sync channels — same-channel panels mirror ticker/timeframe via the pub/sub bus. No parent
  //    re-render: a published event flips only the subscribing panels' own local state. ──
  const applyTf = (tf: TimeframeVal) => {
    if (panelId) { setLocalTf(tf); if (channel !== 'NONE') publishChannel(channel, { source: panelId, timeframe: tf }); }
    else setSelectedTimeframe(tf);
  };
  const commitTicker = (t: string) => {
    const tk = t.trim().toUpperCase(); if (!tk || !panelId) return;
    setPanelTicker(tk); if (channel !== 'NONE') publishChannel(channel, { source: panelId, ticker: tk });
  };
  const cycleChannel = () => { if (!panelId) return; setChannel(c => CHANNEL_CYCLE[(CHANNEL_CYCLE.indexOf(c) + 1) % CHANNEL_CYCLE.length]); };
  useEffect(() => {
    if (!panelId || channel === 'NONE') return;
    return subscribeChannel(channel, (p) => {
      if (p.source === panelId) return;
      if (p.ticker) setPanelTicker(p.ticker);
      if (p.timeframe) setLocalTf(p.timeframe as TimeframeVal);
    });
  }, [panelId, channel]);
  // A range button can request a specific bar count for the new timeframe; the reset consumes it.
  const pendingBarsRef = useRef<number | null>(null);
  useEffect(() => {
    const pending = pendingBarsRef.current;
    setView({ bars: pending ?? 110, off: 0 });
    if (pending == null) setRange(null); // an external timeframe/ticker change isn't a preset range
    pendingBarsRef.current = null; setPriceView(null);
  }, [tfKey, tickKey]);
  // Load this ticker's saved drawings (and reset transient drawing state) on symbol change.
  useEffect(() => {
    try { const raw = localStorage.getItem('slayerchart.draw.' + (panelId ? panelId + '.' : '') + (tickKey || '_')); setDrawings(raw ? JSON.parse(raw) : []); } catch { setDrawings([]); }
    setSelectedId(null); draftRef.current = null; measureRef.current = null; measureDragRef.current = false;
  }, [tickKey]);
  useEffect(() => { try { localStorage.setItem('slayerchart.draw.' + (panelId ? panelId + '.' : '') + (tickKey || '_'), JSON.stringify(drawings)); } catch { /* storage unavailable */ } }, [drawings, tickKey, panelId]);

  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  // Per-strike GEX baseline (snapshot from ~45s ago) so each loaded strike can show its ΔGEX (↑/↓ since checkpoint).
  const gexDeltaRef = useRef<{ base: Map<number, number>; ts: number; tick: string }>({ base: new Map(), ts: 0, tick: '' });
  const dragRef = useRef<{ x: number; off: number } | null>(null);
  const priceDragRef = useRef<{ y: number; factor: number; offset: number } | null>(null);
  const draftRef = useRef<Anchor | null>(null);          // first point of a 2-point drawing
  const measureRef = useRef<{ a: Anchor; b: Anchor } | null>(null);
  const measureDragRef = useRef(false);
  const viewRef = useRef(view); viewRef.current = view;
  // Smoothly tween the view (bars/off) toward a target instead of snapping — used by the discrete
  // jumps (reset, range presets, jump-to-live). Continuous gestures (wheel/drag) cancel it.
  const tweenRef = useRef(0);
  const tweenView = (target: { bars: number; off: number }) => {
    if (typeof requestAnimationFrame === 'undefined') { setView(target); return; }
    if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
    const startV = { ...viewRef.current }; let t0 = -1;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const stepFn = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = Math.min(1, (now - t0) / 240), k = ease(t);
      setView({ bars: Math.round(startV.bars + (target.bars - startV.bars) * k), off: Math.round(startV.off + (target.off - startV.off) * k) });
      if (t < 1) tweenRef.current = requestAnimationFrame(stepFn); else tweenRef.current = 0;
    };
    tweenRef.current = requestAnimationFrame(stepFn);
  };
  const resetView = () => { tweenView({ bars: 110, off: 0 }); setPriceView(null); };
  useEffect(() => () => { if (tweenRef.current) cancelAnimationFrame(tweenRef.current); }, []);
  const priceViewRef = useRef(priceView); priceViewRef.current = priceView;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const toolRef = useRef(tool); toolRef.current = tool;
  const drawingsRef = useRef(drawings); drawingsRef.current = drawings;
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const drawRef = useRef<() => void>(() => {});
  const geomRef = useRef<{ plotL: number; plotR: number; barW: number; start: number; end: number; n: number; priceTop: number; priceAreaH: number; lo: number; hi: number } | null>(null);
  const themeRef = useRef<ReturnType<typeof readTheme> | null>(null);
  // Smooth auto-scale: the displayed price range eases toward its target so the candles AND the
  // side level tags glide together when the user scales/zooms, instead of snapping each frame.
  const dispRangeRef = useRef<{ lo: number; hi: number } | null>(null);
  const scaleViewRef = useRef<{ bars: number; off: number } | null>(null);

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
    try { localStorage.setItem('slayerchart.prefs.v1' + keySuffix, JSON.stringify({ chartType, colors, ovOn, paneOn, showGex, showDisp, showHeat, showOrbs, gexCount, showLadder, showDealerBox, showGrid, showVolume, showWatermark, candleBorders, gexMapV2: true, ...(panelId ? { ticker: panelTicker, timeframe: localTf, channel, expiry } : {}) })); } catch { /* storage unavailable */ }
  }, [chartType, colors, ovOn, paneOn, showGex, showDisp, showHeat, showOrbs, gexCount, showLadder, showDealerBox, showGrid, showVolume, showWatermark, candleBorders, panelId, panelTicker, localTf, channel, expiry]);

  // Only enabled indicators are computed, and only when the selection or candles change
  // (NOT on pan/hover) — keeps interaction cheap.
  const overlaySeries = useMemo(() => { const out: Record<string, Series[]> = {}; for (const d of OVERLAY_DEFS) if (ovOn[d.key]) out[d.key] = d.build(ohlcv); return out; }, [ohlcv, ovOn]);
  const paneSeries = useMemo(() => { const out: { def: typeof PANE_DEFS[number]; data: PaneData }[] = []; for (const d of PANE_DEFS) if (paneOn[d.key]) out.push({ def: d, data: d.build(ohlcv) }); return out; }, [ohlcv, paneOn]);
  // Dealer Positioning summary for the corner dashboard — net γ, call/put dominance, largest strikes.
  const dealerStats = useMemo(() => {
    const ss = profile.strikes; if (!ss || !ss.length) return null;
    let pos = 0, neg = 0, dex = 0, vex = 0, hasDex = false, hasVex = false, lc: (typeof ss)[number] | null = null, lp: (typeof ss)[number] | null = null;
    for (const s of ss) { const g = s.netGex || 0; if (g > 0) { pos += g; if (!lc || g > (lc.netGex || 0)) lc = s; } else if (g < 0) { neg += -g; if (!lp || g < (lp.netGex || 0)) lp = s; } const d = s.netDex ?? ((s.callDex ?? 0) + (s.putDex ?? 0)); if (s.netDex != null || s.callDex != null || s.putDex != null) { dex += d; hasDex = true; } const v = s.netVex ?? ((s.callVex ?? 0) + (s.putVex ?? 0)); if (s.netVex != null || s.callVex != null || s.putVex != null) { vex += v; hasVex = true; } }
    const total = pos + neg;
    return { net: pos - neg, callPct: total ? Math.round((pos / total) * 100) : 50, long: pos >= neg, largestCall: lc?.strike, largestPut: lp?.strike, netDex: hasDex ? dex : null, netVex: hasVex ? vex : null };
  }, [profile]);

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
    // Optional custom background fill (default: transparent → the themed container shows through).
    if (colors.bg) { ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H); }
    ctx.font = '11px var(--font-mono, ui-monospace), monospace'; ctx.textBaseline = 'middle';

    // Theme-driven palette, cached — getComputedStyle is too costly to run per frame.
    const T = themeRef.current || (themeRef.current = readTheme());
    // User color overrides (persisted) win; otherwise classic green-up / red-down defaults.
    const upCol = colors.up || DEFAULT_COLORS.up, downCol = colors.down || DEFAULT_COLORS.down, lineCol = colors.line || DEFAULT_COLORS.line;
    const COL = {
      up: upCol, down: downCol, upVol: hexA(upCol, 0.3), downVol: hexA(downCol, 0.3),
      grid: colors.grid || 'rgba(255,255,255,0.028)', axis: T.dim, axisDim: hexA(T.dim, 0.7),
      callWall: upCol, putWall: downCol, flip: T.warning, magnet: T.accent, em: T.info,
    };

    // Thousands-separated price formatter for every axis / level / readout label.
    const nf = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    // Trimmed variant for the price axis — drops trailing ".00" so whole-number strikes read clean (7,390 not 7,390.00).
    const nfT = (v: number) => { const s = nf(v); return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; };

    if (candles.length === 0) { ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText('Awaiting candle stream…', W / 2, H / 2); return; }

    const axisW = 60, topPad = 6, xAxisH = 22;
    const laneOn = !!(showGex && profile.strikes && profile.strikes.length);
    const heatOn = !!(showHeat && profile.strikes && profile.strikes.length);
    const orbsOn = !!(showOrbs && profile.strikes && profile.strikes.length);
    // Reserve a right gutter only for the γ-lane (wide). The Γ-MAP landscape glow and the ORBS dots both
    // render on the chart itself, so they need no gutter.
    const gammaW = laneOn ? 46 : 0;
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
    // Forward "Dealer Walls" projection (Skylit-style): reserve a few FUTURE slots on the right so
    // the candles stop short of the axis and the dealer-wall lines extend into that whitespace —
    // showing where price is heading into the walls. Only when there are walls to project.
    const hasWalls = !!(profile.callWall || profile.putWall || profile.magnet);
    const projBars = hasWalls ? Math.max(6, Math.min(22, Math.round(bars * 0.13))) : 0;
    const barW = plotW / (bars + projBars);
    const nowX = plotL + bars * barW; // right edge of the candle zone; nowX..plotR is the projection
    const xOf = (gi: number) => plotL + (gi - start) * barW + barW / 2;
    const src = chartType === 'heikin' ? ha : candles;
    const vis = src.slice(start, end);

    let lo = Infinity, hi = -Infinity;
    for (const c of vis) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
    if (!isFinite(lo) || !isFinite(hi)) return;
    const cRange = (hi - lo) || (hi || 1) * 0.01;
    // Keep the candles dominant: only pull a dealer level into the auto-scale if it sits within
    // ~30% of the candle range beyond the price action. Farther levels (e.g. EM±, a distant wall)
    // stay off-screen and are surfaced by their ↑/↓ tags — otherwise they squash price into a thin
    // band of whitespace. (Manual price-scale drag/scroll still overrides this.)
    // Pull in only the STRUCTURAL dealer levels that sit near the price action (walls / flip / magnet /
    // EM) — never the live spot, which would chase every tick and make the scale shiver. The candles
    // already carry the latest price, so the frame stays anchored to real bars.
    const candLo = lo, candHi = hi;
    const capLo = lo - cRange * 0.30, capHi = hi + cRange * 0.30;
    const levelPrices: number[] = [profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet].filter((p): p is number => typeof p === 'number' && p > 0);
    if (profile.spot && profile.expectedMovePct) levelPrices.push(profile.spot * (1 + profile.expectedMovePct), profile.spot * (1 - profile.expectedMovePct));
    for (const p of levelPrices) { if (p >= capLo && p <= capHi) { lo = Math.min(lo, p); hi = Math.max(hi, p); } }
    const pad = ((hi - lo) || 1) * 0.07; lo -= pad; hi += pad;
    // Dead-band auto-scale: HOLD the displayed range steady while the candles still fit inside it with a
    // margin, so a live feed never visibly "breathes". Re-fit (snap, no per-frame easing) only when the
    // view is actively zoomed/panned, price nears an edge, the frame drifts too loose/tight, or the band
    // jumps (ticker/timeframe switch). No continuous animation → no jitter.
    const sv = scaleViewRef.current;
    const viewChanged = !sv || sv.bars !== bars || sv.off !== off;
    scaleViewRef.current = { bars, off };
    const disp = dispRangeRef.current;
    if (!disp) { dispRangeRef.current = { lo, hi }; }
    else {
      const dSpan = (disp.hi - disp.lo) || 1, tSpan = (hi - lo) || 1, margin = dSpan * 0.06;
      const bigJump = Math.abs((lo + hi) / 2 - (disp.lo + disp.hi) / 2) > Math.max(tSpan, dSpan) * 0.6;
      const fits = candLo >= disp.lo + margin && candHi <= disp.hi - margin;
      const looseOrTight = (candHi - candLo) < dSpan * 0.42 || tSpan > dSpan * 1.6 || tSpan < dSpan * 0.62;
      if (viewChanged || bigJump || !fits || looseOrTight) { disp.lo = lo; disp.hi = hi; }
      lo = disp.lo; hi = disp.hi;
    }
    // Manual vertical scale (drag the price axis): scale the held range about its center + shift — applied
    // AFTER the dead-band hold so a manual price-scale drag always responds immediately.
    const pv = priceViewRef.current;
    if (pv) { const center = (lo + hi) / 2, half = Math.max(1e-6, ((hi - lo) / 2) * pv.factor); lo = center - half + pv.offset; hi = center + half + pv.offset; }
    const volBandH = showVolume ? priceH * 0.13 : 0, priceAreaH = priceH - volBandH;
    const yP = (p: number) => priceTop + priceAreaH - ((p - lo) / (hi - lo)) * priceAreaH;
    const pOfY = (y: number) => lo + (1 - (y - priceTop) / priceAreaH) * (hi - lo);
    geomRef.current = { plotL, plotR, barW, start, end, n, priceTop, priceAreaH, lo, hi };

    // TradingView-style axis frame — a faint strip behind the right price axis and the bottom time
    // axis, with thin dividers, so the scales read as framed panels instead of floating on the chart.
    const axisX = gammaR;
    ctx.fillStyle = hexA(T.text, 0.022);
    ctx.fillRect(axisX, priceTop, W - axisX, priceBottom - priceTop);
    ctx.fillRect(plotL, priceBottom, W - plotL, H - priceBottom);
    ctx.strokeStyle = hexA(T.text, 0.09); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px(axisX), priceTop); ctx.lineTo(px(axisX), priceBottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(plotL, px(priceBottom)); ctx.lineTo(W, px(priceBottom)); ctx.stroke();

    // Slayer Terminal brand watermark — the ">slayer_terminal▌" logo lockup over the ticker · timeframe,
    // faint in the lower third behind the candles (the chart's own mark, à la a TradingView chart logo).
    // Authentic monospace brand font + glow caret block; theme-aware alpha so it also reads on light themes.
    if (showWatermark) {
      ctx.save();
      const wmX = plotL + plotW / 2, wmY = priceTop + priceAreaH * 0.7;
      const fs = Math.max(15, Math.min(40, plotW / 15));
      ctx.font = `800 ${fs}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const prompt = '>', word = 'slayer_terminal';
      const pW = ctx.measureText(prompt).width, wW = ctx.measureText(word).width;
      const promptGap = fs * 0.06, caretGap = fs * 0.16, caretW = fs * 0.46;
      const totalW = pW + promptGap + wW + caretGap + caretW;
      let x = wmX - totalW / 2;
      ctx.fillStyle = hexA(T.text, 0.055); ctx.fillText(prompt, x, wmY); x += pW + promptGap;   // ">" prompt
      ctx.fillStyle = hexA(T.text, 0.08); ctx.fillText(word, x, wmY); x += wW + caretGap;        // wordmark
      ctx.fillStyle = hexA(T.text, 0.12); ctx.fillRect(x, wmY - fs * 0.72, caretW, fs * 0.82);   // caret block
      if (tickKey) {
        ctx.textAlign = 'center';
        ctx.font = `600 ${fs * 0.5}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = hexA(T.text, 0.05);
        ctx.fillText(`${tickKey}${tfKey ? '  ·  ' + tfKey : ''}`, wmX, wmY + fs * 0.72);
      }
      ctx.restore(); ctx.font = '11px ui-monospace, monospace';
    }

    // Price-grid density scales with pane height — drag the price axis taller (or scale it)
    // and more price levels appear for finer read accuracy.
    // Denser, TradingView-style price grid: every 5th step is a round-number "major" line — a brighter
    // gridline + a bold, brighter label — so the eye anchors on round prices and the scale reads finer.
    const targetGrid = Math.max(6, Math.min(26, Math.round(priceAreaH / 30)));
    const step = niceStep((hi - lo) / targetGrid);
    const majorStep = step * 5;
    const gridYs: { y: number; label: string; major: boolean }[] = [];
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      const y = yP(g); if (y < priceTop + 4 || y > priceBottom - 2) continue;
      const major = Math.abs(g / majorStep - Math.round(g / majorStep)) < 1e-6;
      if (showGrid) { ctx.strokeStyle = major ? hexA(T.text, 0.045) : COL.grid; ctx.beginPath(); ctx.moveTo(plotL, px(y) - 0.5); ctx.lineTo(plotR, px(y) - 0.5); ctx.stroke(); }
      gridYs.push({ y, label: nfT(g), major });
    }

    // Γ-MAP — the "Gamma Landscape" liquidity heatmap: each strike paints a soft vertical glow band
    // behind the candles, brightness ∝ |net γ| and fading with distance from price, blended additively
    // so concentrated GEX zones light up (Bookmap-style). Calls glow green, puts red. (Γ-MAP toggle)
    if (heatOn) {
      const inRange = profile.strikes!.filter(s => { const y = yP(s.strike); return y >= priceTop - 24 && y <= priceBottom + 24 && Math.abs(s.netGex || 0) > 0; });
      if (inRange.length) {
        const maxG = Math.max(...inRange.map(s => Math.abs(s.netGex || 0)), 1e-9);
        const top = [...inRange].sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0)).slice(0, Math.max(gexCount, 26));
        const spot = profile.spot || (candles[n - 1] ? candles[n - 1].close : 0), vspan = (hi - lo) || 1;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const s of top) {
          const y = yP(s.strike), mag = Math.abs(s.netGex || 0) / maxG, pos = (s.netGex || 0) >= 0;
          const col = pos ? mixHex('#1f6f52', '#2fe6a0', mag) : mixHex('#7a3550', '#ff5470', mag);
          const distFade = Math.max(0.18, 1 - Math.abs(s.strike - spot) / (vspan * 0.7));
          const peak = (0.035 + Math.pow(mag, 1.2) * 0.4) * distFade, bandH = 6 + mag * 32;
          const grad = ctx.createLinearGradient(0, y - bandH, 0, y + bandH);
          grad.addColorStop(0, hexA(col, 0)); grad.addColorStop(0.5, hexA(col, peak)); grad.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = grad; ctx.fillRect(plotL, y - bandH, plotW, bandH * 2);
        }
        ctx.restore();
      }
    }

    // ORBS — focal gamma-concentration dots drawn ON the chart at the right edge, each sitting exactly on
    // its price level (cy = yP(strike)): radius ∝ |net γ|, gold (call-dominant) / violet (put-dominant),
    // walls largest + ringed, each with a soft radial glow. A clean, Skylit-style alternative to the
    // Γ-MAP diamonds (which it replaces when active).
    if (orbsOn) {
      const inR = profile.strikes!.filter(s => { const y = yP(s.strike); return y >= priceTop + 2 && y <= priceBottom - 2 && Math.abs(s.netGex || 0) > 0; });
      if (inR.length) {
        const maxG = Math.max(...inR.map(s => Math.abs(s.netGex || 0)), 1e-9);
        const top = [...inR].sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0)).slice(0, gexCount);
        const cx = plotR - 14; // on-chart, hugging the right edge so each dot lands on its accurate level
        for (const s of top) {
          const y = yP(s.strike), mag = Math.abs(s.netGex || 0) / maxG, pos = (s.netGex || 0) >= 0;
          const isWall = s.strike === profile.callWall || s.strike === profile.putWall;
          const col = pos ? HEAT_POS : HEAT_NEG, r = isWall ? 8 : 2.5 + mag * 5;
          const g = ctx.createRadialGradient(cx, y, 0, cx, y, r * 1.8);
          g.addColorStop(0, hexA(col, isWall ? 0.5 : 0.18 + mag * 0.3)); g.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = hexA(col, isWall ? 0.95 : 0.5 + mag * 0.4); ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2); ctx.fill();
          if (isWall) { ctx.strokeStyle = hexA(col, 0.95); ctx.lineWidth = 1.2; ctx.stroke(); }
        }
        ctx.lineWidth = 1;
      }
    }

    let lastDayTickX = -1e9;
    for (let i = 0; i < vis.length; i++) {
      const gi = start + i; const c = candles[gi]; if (!c) continue;
      const prev = candles[gi - 1];
      if (prev && !sameDay(prev.timestamp, c.timestamp)) { const x = xOf(gi); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(px(x - barW / 2), priceTop); ctx.lineTo(px(x - barW / 2), priceBottom); ctx.stroke(); lastDayTickX = x; }
    }

    // Gamma regime backdrop — the single most important GEX read. ABOVE the flip dealers are LONG γ
    // (hedge against the move → suppressive, price pins / mean-reverts); BELOW it they're SHORT γ
    // (hedge with the move → accelerant, trend / high-vol). A faint split tint that blooms from the
    // flip line makes the regime obvious before you read a single number.
    if (typeof profile.gammaFlip === 'number' && profile.gammaFlip > 0) {
      const fy = Math.max(priceTop, Math.min(priceBottom, yP(profile.gammaFlip)));
      if (fy > priceTop + 0.5) { const gp = ctx.createLinearGradient(0, priceTop, 0, fy); gp.addColorStop(0, hexA(COL.up, 0.014)); gp.addColorStop(1, hexA(COL.up, 0.065)); ctx.fillStyle = gp; ctx.fillRect(plotL, priceTop, plotW, fy - priceTop); }
      if (fy < priceBottom - 0.5) { const gn = ctx.createLinearGradient(0, fy, 0, priceBottom); gn.addColorStop(0, hexA(COL.down, 0.07)); gn.addColorStop(1, hexA(COL.down, 0.014)); ctx.fillStyle = gn; ctx.fillRect(plotL, fy, plotW, priceBottom - fy); }
      ctx.font = '700 8.5px ui-monospace, monospace'; ctx.textAlign = 'left';
      if (fy - priceTop > 18) { ctx.fillStyle = hexA(COL.up, 0.46); ctx.fillText('POSITIVE γ · PINNED', plotL + 8, fy - 8); }
      if (priceBottom - fy > 18) { ctx.fillStyle = hexA(COL.down, 0.46); ctx.fillText('NEGATIVE γ · UNSTABLE', plotL + 8, fy + 13); }
    }

    // Expected-move ±1σ channel — shade the band between EM+ and EM- (dealer-implied day range).
    if (profile.spot && profile.expectedMovePct) {
      const emHi = yP(profile.spot * (1 + profile.expectedMovePct)), emLo = yP(profile.spot * (1 - profile.expectedMovePct));
      const top = Math.max(priceTop, Math.min(emHi, emLo)), h = Math.min(priceBottom, Math.max(emHi, emLo)) - top;
      if (h > 0) { ctx.fillStyle = hexA(COL.em, 0.06); ctx.fillRect(plotL, top, plotW, h); }
    }

    // Volume strip — opacity scales with price velocity (|Δ| vs ATR) so impulse bars read louder.
    if (showVolume && volBandH > 0) {
      let maxVol = 0; for (const c of vis) maxVol = Math.max(maxVol, c.volume || 0);
      const volBase = priceBottom, volTop = priceBottom - volBandH;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(plotL, px(volTop - 1)); ctx.lineTo(plotR, px(volTop - 1)); ctx.stroke();
      // Gradient bars — brighter at the base, fading up — so the strip reads with depth, not flat blocks.
      const vgUp = ctx.createLinearGradient(0, volTop, 0, volBase); vgUp.addColorStop(0, hexA(COL.up, 0.28)); vgUp.addColorStop(1, hexA(COL.up, 0.95));
      const vgDn = ctx.createLinearGradient(0, volTop, 0, volBase); vgDn.addColorStop(0, hexA(COL.down, 0.28)); vgDn.addColorStop(1, hexA(COL.down, 0.95));
      for (let i = 0; i < vis.length; i++) {
        const gi = start + i, c = vis[i], vh = maxVol ? ((c.volume || 0) / maxVol) * (volBandH - 2) : 0;
        const a = atr[gi], vel = a && a > 0 ? Math.min(1, Math.abs(c.close - c.open) / (1.6 * a)) : 0.4;
        ctx.globalAlpha = 0.34 + vel * 0.5;
        ctx.fillStyle = c.close >= c.open ? vgUp : vgDn;
        ctx.fillRect(xOf(gi) - barW * 0.34, volBase - vh, barW * 0.68, vh);
      }
      ctx.globalAlpha = 1;
    }

    // γ-LANE — clean net-gamma EXPOSURE profile in the right gutter. Gold (call-dominant) / violet
    // (put-dominant) horizontal bars by strike, brightest at the zero baseline and fading outward, walls
    // tipped — one coherent profile (capped to the chosen strike density) instead of a jumble of bars.
    if (laneOn) {
      const x0 = plotR + 3;
      ctx.strokeStyle = hexA(T.text, 0.10); ctx.beginPath(); ctx.moveTo(px(x0), priceTop); ctx.lineTo(px(x0), priceBottom); ctx.stroke();
      const allIn = profile.strikes.filter(r => { const y = yP(r.strike); return y >= priceTop + 9 && y <= priceBottom; });
      const keep = new Set([...allIn].sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0)).slice(0, gexCount).map(r => r.strike));
      const inView = allIn.filter(r => keep.has(r.strike));
      const maxAbs = Math.max(...inView.map(r => Math.abs(r.netGex || 0)), 1e-9), laneW = gammaW - 6;
      let thick = 6;
      if (inView.length > 1) { const span = Math.abs(yP(inView[0].strike) - yP(inView[inView.length - 1].strike)); thick = Math.max(2.5, Math.min(10, (span / (inView.length - 1)) * 0.78)); }
      for (const r of inView) {
        const y = yP(r.strike), len = Math.max(1.5, (Math.abs(r.netGex || 0) / maxAbs) * laneW), pos = (r.netGex || 0) >= 0;
        const isWall = r.strike === profile.callWall || r.strike === profile.putWall, col = pos ? HEAT_POS : HEAT_NEG;
        const grad = ctx.createLinearGradient(x0, 0, x0 + len, 0);
        grad.addColorStop(0, hexA(col, isWall ? 0.95 : 0.55)); grad.addColorStop(1, hexA(col, isWall ? 0.55 : 0.14));
        ctx.fillStyle = grad; ctx.fillRect(x0, y - thick / 2, len, Math.max(1.5, thick));
        if (isWall) { ctx.fillStyle = hexA(col, 0.98); ctx.fillRect(x0 + len, y - thick / 2 - 1, 2, thick + 2); }
      }
      ctx.fillStyle = hexA(T.text, 0.38); ctx.textAlign = 'left'; ctx.font = '700 8px ui-monospace, monospace'; ctx.fillText('γ EXPOSURE', x0 + 1, priceTop + 7); ctx.font = '11px ui-monospace, monospace';
    }

    // price series — five chart types (TradingView-style)
    if (chartType === 'line' || chartType === 'area' || chartType === 'baseline' || chartType === 'step') {
      const stepped = chartType === 'step';
      const lastVisGi = start + vis.length - 1;
      const tracePath = () => { ctx.beginPath(); let st = false, prevY = 0; for (let i = 0; i < vis.length; i++) { const x = xOf(start + i), y = yP(vis[i].close); if (!st) { ctx.moveTo(x, y); st = true; } else { if (stepped) ctx.lineTo(x, prevY); ctx.lineTo(x, y); } prevY = y; } };
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
    } else if (chartType === 'columns') {
      // Close-price histogram from the price-area floor, colored by close-vs-previous-close.
      const baseY = priceBottom - volBandH;
      for (let i = 0; i < vis.length; i++) {
        const c = vis[i], x = xOf(start + i), prevC = i > 0 ? vis[i - 1].close : c.open, up = c.close >= prevC, y = yP(c.close), w = Math.max(1, barW * 0.72);
        ctx.fillStyle = hexA(up ? upCol : downCol, 0.85);
        ctx.fillRect(Math.round(x - w / 2), Math.min(y, baseY), Math.round(w), Math.max(1, Math.abs(baseY - y)));
      }
    } else {
      const wickW = Math.max(0.75, Math.min(1, barW * 0.1));      // razor-thin wick — barely there, lets the bodies lead
      const border = candleBorders && barW >= 3.4;                // crisp edge only when bars are wide enough
      for (let i = 0; i < vis.length; i++) {
        const c = vis[i], x = xOf(start + i), up = c.close >= c.open, col = up ? upCol : downCol, wickCol = colors.wick || col;
        // wick first (sits behind the body), centered + pixel-snapped
        ctx.strokeStyle = wickCol; ctx.lineWidth = wickW;
        ctx.beginPath(); ctx.moveTo(px(x), Math.round(yP(c.high))); ctx.lineTo(px(x), Math.round(yP(c.low))); ctx.stroke();
        // body — fuller (0.78 of the slot), pixel-snapped, optional darker crisp border for depth
        const yO = yP(c.open), yC = yP(c.close), bw = Math.max(1, barW * 0.62), w = Math.round(bw), bx = Math.round(x - bw / 2), by = Math.round(Math.min(yO, yC)), bh = Math.max(1, Math.round(Math.abs(yC - yO)));
        if (chartType === 'hollow' && up) { ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, Math.max(1, bh - 1)); }
        else { ctx.fillStyle = col; ctx.fillRect(bx, by, w, bh); if (border) { ctx.strokeStyle = shade(col, 0.72); ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, Math.max(1, bh - 1)); } }
      }
      ctx.lineWidth = 1;
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

    // Dealer levels — retail-friendly NAMED lines that flow with the chart. Each key level draws a
    // clean colored line at its true price plus a floating name tag at the right edge; when tags
    // crowd near spot they stack and draw a connector back to the line, so a label never floats free.
    const last = candles[n - 1].close, lastUp = candles[n - 1].close >= candles[n - 1].open, lastY = yP(last);
    const tagH = 15;
    const NAMES: Record<string, string> = { CW: 'Call Wall', PW: 'Put Wall', 'γF': 'Gamma Flip', MAG: 'Magnet', 'EM+': 'Exp Move ↑', 'EM-': 'Exp Move ↓' };
    const lvls: { price: number; color: string; label: string; gex?: number; value?: string }[] = [];
    const pushLvl = (price: any, color: string, label: string, gex?: number, value?: string) => { if (typeof price === 'number' && price > 0) lvls.push({ price, color, label, gex, value }); };
    const gexAt = (price: any): number => { const ss = profile.strikes; if (typeof price !== 'number' || !ss || !ss.length) return 0; let best = 0, bd = Infinity; for (const s of ss) { const d = Math.abs(s.strike - price); if (d < bd) { bd = d; best = s.netGex || 0; } } return bd <= price * 0.0015 ? best : 0; };
    pushLvl(profile.callWall, COL.callWall, 'CW', Math.abs(gexAt(profile.callWall))); pushLvl(profile.putWall, COL.putWall, 'PW', Math.abs(gexAt(profile.putWall)));
    pushLvl(profile.gammaFlip, COL.flip, 'γF'); pushLvl(profile.magnet, COL.magnet, 'MAG', Math.abs(gexAt(profile.magnet)));
    if (profile.spot && profile.expectedMovePct) { pushLvl(profile.spot * (1 + profile.expectedMovePct), COL.em, 'EM+'); pushLvl(profile.spot * (1 - profile.expectedMovePct), COL.em, 'EM-'); }
    // Loaded GEX Strikes — the actual top gamma strikes around price (with their $ values + size-weighted
    // lines), so the dealer positioning BEHIND the walls is visible, not just the walls themselves.
    if (showLadder && profile.strikes && profile.strikes.length) {
      const named = [profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet].filter((x): x is number => typeof x === 'number');
      const cand = profile.strikes.filter(s => s.strike >= lo && s.strike <= hi && Math.abs(s.netGex || 0) > 0 && !named.some(nm => Math.abs(nm - s.strike) < 1e-6))
        .sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0)).slice(0, gexCount);
      cand.forEach((s, i) => { const g = s.netGex || 0, rk = i < 3 ? `#${i + 1} ` : ''; pushLvl(s.strike, g >= 0 ? COL.up : COL.down, 'GEX', Math.abs(g), `${rk}${Math.round(s.strike)}  ${fmtGex(g)}`); });
    }
    const maxLvlGex = Math.max(...lvls.map(L => L.gex || 0), 1e-9);
    const maxLoadedGex = Math.max(...lvls.filter(L => L.value).map(L => L.gex || 0), 1e-9);
    // ΔGEX vs a rolling ~45s checkpoint — lets each loaded strike show how its net γ is building (↑) or bleeding (↓).
    const gd = gexDeltaRef.current, nowMs = Date.now();
    if (gd.ts === 0 || nowMs - gd.ts > 45000 || gd.tick !== (tickKey || '')) {
      gd.base = new Map((profile.strikes || []).map(s => [s.strike, s.netGex || 0])); gd.ts = nowMs; gd.tick = tickKey || '';
    }
    const gexDeltaAt = (price: number): number => { const ss = profile.strikes; if (!ss) return 0; let best = ss[0], bd = Infinity; for (const s of ss) { const d = Math.abs(s.strike - price); if (d < bd) { bd = d; best = s; } } if (bd > price * 0.0015) return 0; const b = gd.base.get(best.strike); return b == null ? 0 : (best.netGex || 0) - b; };
    // The loaded strike nearest the current price gets a static "active" emphasis (no pulse → no jitter).
    let activeStrike = NaN; { let bd = Infinity; for (const L of lvls) if (L.value && Math.abs(L.price - last) < bd) { bd = Math.abs(L.price - last); activeStrike = L.price; } }
    const placed = lvls.map(L => { const rawY = yP(L.price); const off2 = L.price < lo || L.price > hi; return { ...L, rawY, off: off2, dir: off2 ? (L.price > hi ? -1 : 1) : 0, y: Math.max(priceTop + tagH / 2, Math.min(priceBottom - tagH / 2, rawY)) }; }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) if (placed[i].y - placed[i - 1].y < tagH + 2) placed[i].y = placed[i - 1].y + tagH + 2;
    const rr = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
    // Skylit-style "orb" strength: a wall's share of total dealer gamma — how strong this level is.
    const totalAbsGex = (profile.strikes || []).reduce((a, s) => a + Math.abs(s.netGex || 0), 0);
    const gexPctAt = (price: number): number | null => {
      const ss = profile.strikes; if (!totalAbsGex || !ss || !ss.length) return null;
      let best = ss[0], bd = Infinity;
      for (const s of ss) { const d = Math.abs(s.strike - price); if (d < bd) { bd = d; best = s; } }
      if (bd > price * 0.0015) return null; // only when the level genuinely sits on a strike
      return Math.round((Math.abs(best.netGex || 0) / totalAbsGex) * 100);
    };
    // Forward-projection "now" divider + a faint future-zone wash, drawn once.
    if (projBars) {
      ctx.fillStyle = hexA(T.text, 0.018); ctx.fillRect(nowX, priceTop, plotR - nowX, priceBottom - priceTop);
      ctx.strokeStyle = hexA(T.text, 0.16); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(px(nowX), priceTop); ctx.lineTo(px(nowX), priceBottom); ctx.stroke(); ctx.setLineDash([]);
    }
    // Importance colour tiers (#14): weak→strong reads as a hue shift (gray→cyan→emerald→bright / gray→amber→red→hot), not just brightness.
    const tierCol = (isCall: boolean, t: number) => isCall
      ? (t < 0.4 ? mixHex('#5f8a73', '#37c19a', t / 0.4) : t < 0.72 ? mixHex('#37c19a', '#2fe6a0', (t - 0.4) / 0.32) : mixHex('#2fe6a0', '#74ffbb', (t - 0.72) / 0.28))
      : (t < 0.4 ? mixHex('#7a6f68', '#e89042', t / 0.4) : t < 0.72 ? mixHex('#e89042', '#ff5a72', (t - 0.4) / 0.32) : mixHex('#ff5a72', '#ff3556', (t - 0.72) / 0.28));
    let hoverTag: (typeof placed)[number] | null = null;
    const hovPt = hoverRef.current;
    for (const L of placed) {
      const name = NAMES[L.label] || L.label, isWall = L.label === 'CW' || L.label === 'PW';
      const lrel = L.value ? Math.min(1, (L.gex || 0) / maxLoadedGex) : 0;
      const isTop = !!(L.value && (L.gex || 0) === maxLoadedGex), major = !!(L.value && lrel > 0.5), minor = !!(L.value && lrel <= 0.22);
      // Color: named levels keep their hue; loaded strikes scale gray-green→bright emerald (calls) /
      // muted→bright red (puts); the single largest GEX strike is purple so THE level is unmistakable.
      const col = !L.value ? L.color : isTop ? '#b98cff' : tierCol(L.color === COL.up, lrel);
      // level line — named dashed; loaded strikes solid & size-weighted (minor ones thin, faint, dashed)
      if (!L.off && !(heatOn && isWall)) {
        const act = !!(L.value && L.price === activeStrike);
        if (act) { ctx.fillStyle = hexA(col, 0.07); ctx.fillRect(plotL, px(L.rawY) - 4, plotW, 8); }
        const p1 = !L.value && (L.label === 'CW' || L.label === 'PW' || L.label === 'γF'); // Priority-1 levels: walls + gamma flip read crisp; EM / magnet stay softer (P2).
        ctx.strokeStyle = col; ctx.globalAlpha = L.value ? (act ? 0.95 : 0.1 + Math.pow(lrel, 1.3) * 0.75) : (p1 ? 0.72 : 0.32); ctx.lineWidth = L.value ? (act ? 2.6 : 0.6 + lrel * 3) : (p1 ? 1.5 : 1); ctx.setLineDash(!L.value ? (p1 && L.label !== 'γF' ? [] : [5, 4]) : minor ? [2, 4] : []);
        ctx.beginPath(); ctx.moveTo(plotL, px(L.rawY) - 0.5); ctx.lineTo(plotR, px(L.rawY) - 0.5); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
      // Forward projection: brighten this wall's segment in the future zone + a soft glow toward the
      // axis, so the dealer walls visibly extend to where price is heading. (EM± stay plain.)
      if (!L.off && projBars && L.label !== 'EM+' && L.label !== 'EM-') {
        const gy = px(L.rawY) - 0.5, grad = ctx.createLinearGradient(nowX, 0, plotR, 0);
        grad.addColorStop(0, hexA(col, 0)); grad.addColorStop(1, hexA(col, 0.18));
        ctx.fillStyle = grad; ctx.fillRect(nowX, px(L.rawY) - 4, plotR - nowX, 8);
        ctx.strokeStyle = hexA(col, 0.92); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(nowX, gy); ctx.lineTo(plotR, gy); ctx.stroke(); ctx.lineWidth = 1;
      }
      // Name + (for walls/magnet) the gamma-concentration %, so you read strength at a glance.
      const pct = (isWall || L.label === 'MAG') ? gexPctAt(L.price) : null;
      const nameLbl = (L.off ? (L.dir < 0 ? '↑ ' : '↓ ') : '') + (L.value || name), pctLbl = pct != null ? `  ${pct}%` : '';
      // ΔGEX beside the value (#1): how this strike's net γ has moved since the ~45s checkpoint (↑ building / ↓ bleeding).
      let deltaLbl = '', deltaUp = true;
      if (L.value) { const dv = gexDeltaAt(L.price); if (Math.abs(dv) >= 1e6) { deltaUp = dv >= 0; deltaLbl = `  ${deltaUp ? '↑' : '↓'}${fmtGex(Math.abs(dv)).replace(/^\+/, '')}`; } }
      ctx.font = '700 10px ui-monospace, monospace'; // uniform tag text — importance reads from line weight/colour, not font size
      const nameW = ctx.measureText(nameLbl).width, pctW = pctLbl ? ctx.measureText(pctLbl).width : 0, deltaW = deltaLbl ? ctx.measureText(deltaLbl).width : 0;
      const tagW = nameW + pctW + deltaW + 17, tagR = plotR - 4, tagL = tagR - tagW, ty = L.off ? (L.dir < 0 ? priceTop + tagH / 2 + 2 : priceBottom - tagH / 2 - 2) : L.y;
      if (hovPt && hovPt.x >= tagL - 3 && hovPt.x <= tagR + 6 && Math.abs(hovPt.y - ty) <= tagH / 2 + 2) hoverTag = L;
      // connector from the line's right end back to the tag whenever the tag was nudged off its price
      if (!L.off && Math.abs(L.y - L.rawY) > 1) { ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(plotR - 3, px(L.rawY) - 0.5); ctx.lineTo(tagR - 2, px(ty) - 0.5); ctx.stroke(); }
      rr(tagL, ty - tagH / 2, tagW, tagH, 3);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1; ctx.fillStyle = isTop ? 'rgba(26,18,38,0.92)' : 'rgba(9,12,17,0.9)'; ctx.fill(); ctx.restore();
      ctx.strokeStyle = hexA(col, isTop ? 1 : 0.85); ctx.lineWidth = isTop ? 1.3 : 1; ctx.stroke(); ctx.lineWidth = 1;
      // Magnitude bar (#3): faint colour fill from the left, width ∝ this strike's share of peak GEX — bars read faster than numbers.
      if (L.value && lrel > 0) { rr(tagL + 1, ty - tagH / 2 + 1, (tagW - 2) * Math.max(0.05, lrel), tagH - 2, 2.5); ctx.fillStyle = hexA(col, 0.17); ctx.fill(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(tagL + 7, ty, 2.4, 0, Math.PI * 2); ctx.fill();
      // §9 hybrid: loaded-strike GEX values read in greek-purple (magnitude); the dot / line / bar stay green/red (the call-put sign).
      ctx.textAlign = 'left'; ctx.fillStyle = L.value ? (isTop ? '#c79cff' : mixHex('#6f6880', '#b98cff', Math.max(0.22, Math.min(1, lrel)))) : col; ctx.fillText(nameLbl, tagL + 12, ty);
      if (pctLbl) { ctx.fillStyle = hexA(T.text, 0.72); ctx.fillText(pctLbl, tagL + 12 + nameW, ty); }
      if (deltaLbl) { ctx.fillStyle = deltaUp ? COL.up : COL.down; ctx.fillText(deltaLbl, tagL + 12 + nameW + pctW, ty); }
      // named levels print their exact price on the axis at the SAME size as the gridline scale (uniform)
      if (!L.value) { ctx.textAlign = 'right'; ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = hexA(col, 0.95); ctx.fillText(nfT(L.price), W - 3, ty); }
    }
    ctx.font = '11px ui-monospace, monospace';

    ctx.textAlign = 'right';
    for (const g of gridYs) {
      if (Math.abs(g.y - lastY) < tagH) continue;
      if (placed.some(L => !L.value && Math.abs(L.y - g.y) < tagH)) continue; // named levels print their own price; loaded strikes keep the gridline scale
      ctx.font = '11px ui-monospace, monospace'; // uniform scale — every price the same size; emphasis via brightness only
      ctx.fillStyle = g.major ? hexA(T.text, 0.6) : COL.axisDim;
      ctx.fillText(g.label, W - 4, g.y);
    }
    ctx.font = '11px ui-monospace, monospace';

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
      const lc = lastUp ? COL.up : COL.down, priceW = axisW + gammaW - 1, priceX = plotR + 1;
      ctx.font = '700 11px ui-monospace, monospace'; ctx.textAlign = 'left';
      // ticker badge (darker) to the LEFT of the price badge, extending into the chart — TradingView style
      const tkr = (tickKey || '').toUpperCase(), tkrW = tkr ? ctx.measureText(tkr).width + 11 : 0;
      if (tkr) { ctx.fillStyle = shade(lc, 0.46); (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(priceX - tkrW, lastY - 8, tkrW, 16, 3), ctx.fill()) : ctx.fillRect(priceX - tkrW, lastY - 8, tkrW, 16); ctx.fillStyle = hexA('#ffffff', 0.92); ctx.fillText(tkr, priceX - tkrW + 6, lastY); }
      ctx.fillStyle = lc; (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(priceX, lastY - 8, priceW, 16, 3), ctx.fill()) : ctx.fillRect(priceX, lastY - 8, priceW, 16);
      ctx.fillStyle = '#06090d'; ctx.fillText(nf(last), priceX + 6, lastY); ctx.font = '11px ui-monospace, monospace';
    }

    // Magnet pull cue — a short tether on the left showing price being drawn toward the magnet (pin) level.
    if (typeof profile.magnet === 'number' && profile.magnet > 0 && lastY >= priceTop && lastY <= priceBottom) {
      const my = yP(profile.magnet);
      if (my >= priceTop + 6 && my <= priceBottom - 6 && Math.abs(my - lastY) > 16) {
        const tx = plotL + 24, dir = my > lastY ? 1 : -1;
        ctx.strokeStyle = hexA(COL.magnet, 0.4); ctx.setLineDash([1, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px(tx), lastY + dir * 5); ctx.lineTo(px(tx), my - dir * 6); ctx.stroke();
        ctx.setLineDash([]); ctx.lineWidth = 1;
        ctx.fillStyle = hexA(COL.magnet, 0.85); ctx.beginPath(); ctx.moveTo(tx, my - dir * 1); ctx.lineTo(tx - 3.4, my - dir * 7); ctx.lineTo(tx + 3.4, my - dir * 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = hexA(COL.magnet, 0.7); ctx.beginPath(); ctx.arc(tx, lastY + dir * 5, 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.font = '700 7.5px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = hexA(COL.magnet, 0.7); ctx.fillText('PULL', tx + 6, (lastY + my) / 2);
      }
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

    // Time axis (TradingView-style): denser ticks; the first tick of each new day shows a bold, brighter
    // DATE label, intraday ticks show the time — so day boundaries anchor the eye.
    const axisY = H - xAxisH; ctx.textAlign = 'center';
    const ticks = Math.max(2, Math.floor(plotW / 84));
    let prevTickDay = -1;
    for (let t = 0; t <= ticks; t++) {
      const gi = start + Math.round(((end - 1 - start) * t) / ticks); if (gi < start || gi >= end || !candles[gi]) continue;
      const c = candles[gi], d = new Date(c.timestamp), day = d.getDate(), isNewDay = prevTickDay !== -1 && day !== prevTickDay; prevTickDay = day;
      if (isNewDay) { ctx.fillStyle = hexA(T.text, 0.58); ctx.font = '700 10px ui-monospace, monospace'; ctx.fillText(`${d.getMonth() + 1}/${day}`, xOf(gi), axisY + 11); ctx.font = '11px ui-monospace, monospace'; }
      else { ctx.fillStyle = COL.axisDim; ctx.fillText(fmtTime(c.timestamp), xOf(gi), axisY + 11); }
    }

    const hv = hoverRef.current;
    if (hv && hv.x >= plotL && hv.x <= plotR) {
      const gi = Math.max(start, Math.min(Math.min(end - 1, n - 1), start + Math.round((hv.x - plotL - barW / 2) / barW)));
      const cx = xOf(gi);
      ctx.strokeStyle = hexA(T.text, 0.26); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px(cx), priceTop); ctx.lineTo(px(cx), H - xAxisH); ctx.stroke();
      if (hv.y > priceTop && hv.y < H - xAxisH) { ctx.beginPath(); ctx.moveTo(plotL, px(hv.y)); ctx.lineTo(plotR, px(hv.y)); ctx.stroke(); }
      ctx.setLineDash([]);
      // Theme-aware rounded axis bubbles. The price bubble is bordered up/down vs the last close,
      // so you instantly see whether the cursor sits above or below current price.
      const bubble = (bx: number, by: number, bw: number, bh: number, border: string, label: string, align: CanvasTextAlign, tx: number) => {
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(bx, by, bw, bh, 3) : ctx.rect(bx, by, bw, bh);
        ctx.fillStyle = T.surf; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = T.text; ctx.textAlign = align; ctx.fillText(label, tx, by + bh / 2);
      };
      if (hv.y >= priceTop && hv.y <= priceBottom - volBandH) {
        const pr = pOfY(hv.y);
        bubble(plotR + 1, hv.y - 9, axisW + gammaW - 2, 18, hexA(pr >= last ? COL.up : COL.down, 0.9), nf(pr), 'left', plotR + 6);
        // Dealer context at the cursor: net γ of the strike nearest this price — the terminal's signature read.
        // Hover anywhere and instantly see how heavily, and which side, dealers are positioned at that level.
        const ss = profile.strikes;
        if (ss && ss.length) {
          let ns = ss[0], nd = Infinity;
          for (const s of ss) { const d = Math.abs(s.strike - pr); if (d < nd) { nd = d; ns = s; } }
          const g = ns.netGex || 0;
          if (Math.abs(g) > 0 && nd <= pr * 0.012) {
            const gc = g >= 0 ? COL.up : COL.down;
            const tag = ns.strike === profile.callWall ? ' CW' : ns.strike === profile.putWall ? ' PW' : ns.strike === profile.gammaFlip ? ' ⚑' : ns.strike === profile.magnet ? ' MAG' : '';
            const lbl = `${Math.round(ns.strike)} · ${fmtGex(g)}γ${tag}`;
            ctx.font = '700 10px ui-monospace, monospace'; ctx.textAlign = 'right';
            const pw = ctx.measureText(lbl).width + 12, rEdge = plotR + axisW + gammaW - 1, py = hv.y + 11;
            ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(rEdge - pw, py, pw, 16, 3) : ctx.rect(rEdge - pw, py, pw, 16);
            ctx.fillStyle = T.surf; ctx.fill(); ctx.strokeStyle = hexA(gc, 0.85); ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = gc; ctx.fillText(lbl, rEdge - 6, py + 8);
          }
        }
      }
      const c = candles[gi]; const tlbl = fmtTime(c.timestamp), tbw = ctx.measureText(tlbl).width + 14;
      bubble(cx - tbw / 2, H - xAxisH + 1, tbw, xAxisH - 2, hexA(T.accent, 0.55), tlbl, 'center', cx);
      const up = c.close >= c.open, dC = c.close - c.open, dPct = c.open ? (dC / c.open) * 100 : 0;
      const txt = `O ${nf(c.open)}   H ${nf(c.high)}   L ${nf(c.low)}   C ${nf(c.close)}   ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%   V ${(c.volume || 0) >= 1e6 ? ((c.volume || 0) / 1e6).toFixed(2) + 'M' : (c.volume || 0).toLocaleString("en-US")}`;
      ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left'; const wTxt = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(8,10,14,0.82)'; ctx.fillRect(plotL + 2, priceTop + 2, wTxt, 16); ctx.fillStyle = up ? COL.up : COL.down; ctx.fillText(txt, plotL + 9, priceTop + 10);
      // Loaded-strike hover tooltip — full call/put γ + OI/vol breakdown for the dealer level under the cursor.
      if (hoverTag && profile.strikes && profile.strikes.length) {
        const tp = hoverTag.price; let sd = profile.strikes[0], bd = Infinity;
        for (const s of profile.strikes) { const d = Math.abs(s.strike - tp); if (d < bd) { bd = d; sd = s; } }
        const fK = (v: number) => { const a = Math.abs(v); return a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K' : Math.round(a) + ''; };
        const rows: [string, string, string][] = [
          ['Call γ', fmtGex(sd.callGex || 0), COL.up],
          ['Put γ', fmtGex(sd.putGex || 0), COL.down],
          ['Net γ', fmtGex(sd.netGex || 0), (sd.netGex || 0) >= 0 ? COL.up : COL.down],
        ];
        if ((sd.callOi || 0) || (sd.putOi || 0)) rows.push(['OI C/P', `${fK(sd.callOi || 0)} / ${fK(sd.putOi || 0)}`, hexA(T.text, 0.85)]);
        if ((sd.callVolume || 0) || (sd.putVolume || 0)) rows.push(['Vol C/P', `${fK(sd.callVolume || 0)} / ${fK(sd.putVolume || 0)}`, hexA(T.text, 0.85)]);
        // Dealer greeks for this strike + ΔGEX + a pin-strength rating (#5 / #16).
        const dxv = sd.netDex != null ? sd.netDex : ((sd.callDex || 0) + (sd.putDex || 0));
        const vxv = sd.netVex != null ? sd.netVex : ((sd.callVex || 0) + (sd.putVex || 0));
        if (dxv) rows.push(['Net Δ', fmtGex(dxv), dxv >= 0 ? COL.up : COL.down]);
        if (vxv) rows.push(['Vanna', fmtGex(vxv), vxv >= 0 ? COL.up : COL.down]);
        const dgv = gexDeltaAt(sd.strike);
        if (Math.abs(dgv) >= 1e6) rows.push(['Δγ · 45s', `${dgv >= 0 ? '↑' : '↓'}${fmtGex(Math.abs(dgv)).replace(/^\+/, '')}`, dgv >= 0 ? COL.up : COL.down]);
        const peakG = Math.max(...profile.strikes.map(s => Math.abs(s.netGex || 0)), 1e-9), stars = Math.max(1, Math.min(5, Math.round(Math.abs(sd.netGex || 0) / peakG * 5)));
        rows.push(['Pin', '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars), hexA(T.accent, 0.95)]);
        ctx.font = '600 10px ui-monospace, monospace';
        let keyW = 0, valW = 0; for (const [k, v] of rows) { keyW = Math.max(keyW, ctx.measureText(k).width); valW = Math.max(valW, ctx.measureText(v).width); }
        const lab = hoverTag.value ? '' : (NAMES[hoverTag.label] || hoverTag.label).toUpperCase();
        ctx.font = '800 11px ui-monospace, monospace'; const headW = ctx.measureText(nf(sd.strike)).width + (lab ? ctx.measureText(lab).width + 16 : 0);
        const padX = 9, gap = 16, rowH = 14, boxW = Math.max(keyW + gap + valW + padX * 2, headW + padX * 2, 126), boxH = 16 + rows.length * rowH + 7;
        const bx = Math.max(plotL + 6, Math.min(hv.x - 14 - boxW, plotR - boxW - 6));
        const by = Math.max(priceTop + 4, Math.min(priceBottom - boxH - 4, hv.y - boxH / 2));
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 13; ctx.shadowOffsetY = 3; rr(bx, by, boxW, boxH, 5); ctx.fillStyle = T.surf; ctx.fill(); ctx.restore();
        ctx.strokeStyle = hexA(hoverTag.color, 0.9); ctx.lineWidth = 1; ctx.stroke();
        ctx.textAlign = 'left'; ctx.font = '800 11px ui-monospace, monospace'; ctx.fillStyle = hoverTag.color; ctx.fillText(nf(sd.strike), bx + padX, by + 9);
        if (lab) { ctx.textAlign = 'right'; ctx.font = '700 8px ui-monospace, monospace'; ctx.fillStyle = hexA(T.text, 0.5); ctx.fillText(lab, bx + boxW - padX, by + 9); }
        ctx.strokeStyle = hexA(T.text, 0.12); ctx.beginPath(); ctx.moveTo(bx + 6, by + 16.5); ctx.lineTo(bx + boxW - 6, by + 16.5); ctx.stroke();
        ctx.font = '600 10px ui-monospace, monospace'; let ry = by + 16 + 7;
        for (const [k, v, c] of rows) { ctx.textAlign = 'left'; ctx.fillStyle = hexA(T.text, 0.5); ctx.fillText(k, bx + padX, ry); ctx.textAlign = 'right'; ctx.fillStyle = c; ctx.fillText(v, bx + boxW - padX, ry); ry += rowH; }
        ctx.textAlign = 'left';
      }
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
      if (tweenRef.current) { cancelAnimationFrame(tweenRef.current); tweenRef.current = 0; }
      // Scrolling over the price axis scales the VERTICAL (price) scale — the eased range makes the
      // candles + side level tags glide bigger/smaller together. Inside the plot, scroll zooms time.
      const gw = geomRef.current, rw = canvas.getBoundingClientRect(), mxw = e.clientX - rw.left;
      if (gw && mxw >= gw.plotR) {
        const f = e.deltaY > 0 ? 1.1 : 0.9;
        setPriceView(prev => { const cur = prev ?? { factor: 1, offset: 0 }; return { factor: Math.max(0.2, Math.min(6, cur.factor * f)), offset: cur.offset }; });
        return;
      }
      const n = candlesRef.current.length || 300, factor = e.deltaY > 0 ? 1.15 : 0.87;
      const cur = viewRef.current, next = Math.max(20, Math.min(n, Math.round(cur.bars * factor)));
      if (next === cur.bars) return;
      setRange(null); // manual zoom breaks the active range preset
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
      if (e.button !== 0) return; // left button only — right-click opens the view context menu
      setCtxMenu(null);
      if (tweenRef.current) { cancelAnimationFrame(tweenRef.current); tweenRef.current = 0; }
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
      // Crosshair bridge: broadcast the hovered price (no React state) so the detached Exposure
      // Ladder can highlight the matching strike in lockstep with the canvas crosshair.
      if (g && hoverRef.current.x >= g.plotL && hoverRef.current.x <= g.plotR && hoverRef.current.y >= g.priceTop && hoverRef.current.y <= g.priceTop + g.priceAreaH) {
        broadcastCrosshair(priceAtY(hoverRef.current.y, g), panelId ?? 'main');
      } else broadcastCrosshair(null, panelId ?? 'main');
      // Cursor hint: scale over the gutter, pointer over a selectable drawing, crosshair otherwise.
      if (!dragRef.current && !priceDragRef.current) {
        const tl = toolRef.current, hx = hoverRef.current.x, hy = hoverRef.current.y;
        if (tl !== 'cursor') canvas.style.cursor = 'crosshair';
        else if (g) canvas.style.cursor = hx >= g.plotR ? 'ns-resize' : (hitTest(hx, hy, g) ? 'pointer' : 'crosshair');
      }
      schedule();
    };
    const onUp = () => { dragRef.current = null; priceDragRef.current = null; measureDragRef.current = false; canvas.style.cursor = 'crosshair'; };
    const onLeave = () => { hoverRef.current = null; broadcastCrosshair(null, panelId ?? 'main'); schedule(); };
    // Double-click (cursor mode): price gutter → auto-fit; elsewhere → snap back to the live edge.
    const onDbl = (e: MouseEvent) => { if (toolRef.current !== 'cursor') return; const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, g = geomRef.current; if (g && mx >= g.plotR) setPriceView(null); else tweenView({ bars: 110, off: 0 }); };
    // Right-click anywhere on the chart → a small "View" menu (reset to the live view, jump to live, auto-fit Y).
    const onCtx = (e: MouseEvent) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); setCtxMenu({ x: Math.max(6, Math.min(e.clientX - r.left, r.width - 192)), y: Math.max(6, Math.min(e.clientY - r.top, r.height - 128)) }); };
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
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKey);
    return () => { ro.disconnect(); mo.disconnect(); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); canvas.removeEventListener('mouseleave', onLeave); canvas.removeEventListener('dblclick', onDbl); canvas.removeEventListener('contextmenu', onCtx); window.removeEventListener('keydown', onKey); };
  }, []);

  // Data/view-driven repaints are rAF-coalesced and do NOT re-read the theme (the MutationObserver
  // above keeps themeRef fresh) — getComputedStyle on every pan/zoom/tick frame was the jank source.
  const redrawRafRef = useRef(0);
  useEffect(() => {
    if (redrawRafRef.current) return;
    redrawRafRef.current = requestAnimationFrame(() => { redrawRafRef.current = 0; drawRef.current(); });
  }, [candles, overlaySeries, paneSeries, displacements, showGex, showDisp, showHeat, showOrbs, gexCount, showLadder, chartType, colors, ha, view, priceView, drawings, tool, selectedId, showGrid, showVolume, showWatermark, candleBorders, profile, decimals, tfKey, tickKey]);
  // Cancel any frame still queued when the panel unmounts (closing a grid panel mid-redraw):
  // an unmount-only cleanup, so it never disturbs the per-change coalescing above. Without it a
  // pending rAF fires on a torn-down panel and calls drawRef on detached refs → crash on churn.
  useEffect(() => () => { if (redrawRafRef.current) { cancelAnimationFrame(redrawRafRef.current); redrawRafRef.current = 0; } }, []);

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
  const pickRange = (r: RangeKey) => {
    const p = RANGE_PRESETS.find(x => x.k === r); if (!p) return;
    setRange(r);
    if (tfKey === p.tf) { tweenView({ bars: p.bars, off: 0 }); setPriceView(null); }
    else { pendingBarsRef.current = p.bars; applyTf(p.tf); } // tf change → reset effect applies the bars
  };

  return (
    <div className="w-full h-full flex flex-col outline-none" tabIndex={panelId ? 0 : undefined}
      onKeyDown={panelId ? (e) => {
        const tgt = e.target as HTMLElement;
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
        // Bonus: a focused panel + a letter keystroke jumps straight into the symbol input.
        if (!tickerEditing && /^[a-zA-Z]$/.test(e.key)) { setTickerDraft(e.key.toUpperCase()); setTickerEditing(true); }
      } : undefined}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Hidden toolbar — recedes to a faint state and reveals on hover/focus, so the chart leads and the
          retail tool-clutter disappears until you reach for it (institutional hotkey-first ethos). */}
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)] shrink-0 relative opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
        {/* ── Command palette (panel mode): symbol input · sync channel · expiry ── */}
        {panelId && (
          <>
            {tickerEditing ? (
              <input autoFocus value={tickerDraft} onChange={e => setTickerDraft(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') { commitTicker(tickerDraft); setTickerEditing(false); } else if (e.key === 'Escape') { setTickerEditing(false); } }}
                onBlur={() => setTickerEditing(false)} placeholder={panelTicker}
                className="w-16 px-1.5 py-1 rounded text-[11px] font-mono font-black uppercase tracking-wider bg-black/50 border border-[var(--accent-color)] text-[var(--text-primary)] outline-none" />
            ) : (
              <button onClick={() => { setTickerDraft(''); setTickerEditing(true); }} title="Click or type to change symbol — Enter submits, Esc cancels" className="px-2 py-1 rounded text-[11px] font-mono font-black uppercase tracking-wider border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">{panelTicker}</button>
            )}
            <button onClick={cycleChannel} title={`Sync channel: ${channel === 'NONE' ? 'off' : channel} (click to cycle)`} className="flex items-center justify-center w-6 h-6 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-colors shrink-0">
              <span className="w-2.5 h-2.5 rounded-full transition-all" style={{ background: CHANNEL_COLORS[channel], boxShadow: channel !== 'NONE' ? `0 0 6px ${CHANNEL_COLORS[channel]}` : 'none' }} />
            </button>
            <div className="flex items-center rounded-sm overflow-hidden border border-[var(--border)] shrink-0">
              {(['0DTE', '1DTE+', 'ALL'] as const).map(x => (
                <button key={x} onClick={() => setExpiry(x)} className={`px-1.5 py-1 text-[9px] font-mono font-black uppercase tracking-wide transition-colors ${expiry === x ? 'text-black' : 'text-[var(--text-tertiary)] opacity-50 hover:opacity-100'}`} style={expiry === x ? { background: 'var(--accent-color)' } : undefined}>{x}</button>
              ))}
            </div>
            <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
          </>
        )}
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
        {/* Interval (timeframe) — direct on the chart; a manual pick clears the active range */}
        <div className="relative">
          <button onClick={() => setTfOpen(o => !o)} className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">
            {tfKey || '5m'}<span className="text-[var(--text-tertiary)]">▾</span>
          </button>
          {tfOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setTfOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 w-24 bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl py-1 max-h-72 overflow-y-auto">
                {CHART_TFS.map(t => (
                  <button key={t} onClick={() => { applyTf(t); setTfOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono hover:bg-white/[0.05] transition-colors ${tfKey === t ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    <span className="w-3 text-center text-[var(--accent-color)]">{tfKey === t ? '✓' : ''}</span>{t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        {/* Date range — each maps to (timeframe + visible bars); 1Y/ALL use daily/weekly bars */}
        <div className="flex items-center p-0.5 rounded gap-0.5 bg-[var(--surface-2)] border border-[var(--border)]">
          {RANGE_PRESETS.map(p => (
            <button key={p.k} onClick={() => pickRange(p.k)} title={`${p.k} — ${p.tf} bars`} className={`px-1.5 py-0.5 text-[10px] font-mono font-black tracking-wide rounded transition-colors ${range === p.k ? 'text-black' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`} style={range === p.k ? { background: 'var(--accent-color)' } : undefined}>{p.k}</button>
          ))}
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
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search 80+ indicators…" className="w-full px-2 py-1.5 rounded bg-black/40 border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent-color)]/50" />
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
                <div className="absolute top-full right-0 mt-1 z-50 w-[232px] max-h-[78vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl p-3">
                  <div className="text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">Colors</div>
                  <div className="space-y-1.5">
                    {([['up', 'Up bars', DEFAULT_COLORS.up], ['down', 'Down bars', DEFAULT_COLORS.down], ['wick', 'Wick', DEFAULT_COLORS.up], ['line', 'Line / Area', DEFAULT_COLORS.line], ['bg', 'Background', '#0d0d0d'], ['grid', 'Grid', '#262626']] as const).map(([key, label, def]) => (
                      <label key={key} className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">{label}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono tabular-nums uppercase text-[var(--text-tertiary)]">{colors[key] || def}</span>
                          <input type="color" value={colors[key] || def} onChange={e => setColors(c => ({ ...c, [key]: e.target.value }))} className="w-7 h-6 rounded cursor-pointer bg-transparent border border-[var(--border)] p-0" />
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mt-3 mb-1.5">Display</div>
                  <div className="space-y-1.5">
                    {([['Grid', showGrid, setShowGrid], ['Volume', showVolume, setShowVolume], ['Watermark', showWatermark, setShowWatermark], ['Candle borders', candleBorders, setCandleBorders]] as const).map(([label, val, set]) => (
                      <button key={label} onClick={() => set(v => !v)} className="w-full flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">{label}</span>
                        <span className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${val ? '' : 'bg-[var(--surface-3)]'}`} style={val ? { background: 'var(--accent-color)' } : undefined}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${val ? 'left-3.5' : 'left-0.5'}`} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mt-3 mb-1.5">Dealer Map</div>
                  <div className="space-y-1.5">
                    {([['Loaded strikes', showLadder, setShowLadder], ['Positioning panel', showDealerBox, setShowDealerBox], ['Γ Heatmap', showHeat, setShowHeat], ['Orbs', showOrbs, setShowOrbs], ['γ Exposure lane', showGex, setShowGex], ['Displacement', showDisp, setShowDisp]] as const).map(([label, val, set]) => (
                      <button key={label} onClick={() => set(v => !v)} className="w-full flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">{label}</span>
                        <span className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${val ? '' : 'bg-[var(--surface-3)]'}`} style={val ? { background: 'var(--accent-color)' } : undefined}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${val ? 'left-3.5' : 'left-0.5'}`} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2.5">
                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">Strikes shown</span>
                    <div className="flex items-center gap-0.5">
                      {([['8', 8], ['16', 16], ['24', 24], ['Max', 40]] as const).map(([lbl, num]) => (
                        <button key={lbl} onClick={() => setGexCount(num)} className={`px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold transition-colors ${gexCount === num ? 'text-black' : 'text-[var(--text-tertiary)] border border-[var(--border)] hover:text-[var(--text-primary)]'}`} style={gexCount === num ? { background: 'var(--accent-color)' } : undefined}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setColors({})} className="w-full mt-3 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-widest border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">Reset colors</button>
                </div>
              </>
            )}
          </div>
          {specChip(showLadder, '≣ STRIKES', () => setShowLadder(v => !v))}
          {specChip(showHeat, 'Γ-MAP', () => setShowHeat(v => !v))}
          {specChip(showOrbs, '◉ ORBS', () => setShowOrbs(v => !v))}
          {specChip(showGex, 'γ-LANE', () => setShowGex(v => !v))}
          {specChip(showDisp, '⚡ DISP', () => setShowDisp(v => !v), 'warn')}
          <button onClick={resetView} title="Reset view — smoothly refit zoom, pan and price scale (or double-click the chart)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors">⟲ RESET</button>
          {priceView && <button onClick={() => setPriceView(null)} title="Reset price scale to auto-fit (or double-click the price axis)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⤢ AUTO Y</button>}
          {view.off !== 0 && <button onClick={() => tweenView({ bars: view.bars, off: 0 })} title="Jump back to the live edge (or double-click the chart)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⟳ LIVE</button>}
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-[300px]" style={{ position: 'relative', flex: 1, minHeight: 300 }}>
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" style={{ position: 'absolute', inset: 0 }} />
        {showDealerBox && dealerStats && <DealerMap stats={dealerStats} profile={profile} decimals={decimals} />}
        {showDealerBox && dealerStats && <RegimeChip long={dealerStats.long} />}
        {ctxMenu && <ChartContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} resetView={resetView} view={view} tweenView={tweenView} priceView={priceView} onAutoFit={() => setPriceView(null)} />}
      </div>
    </div>
  );
});
