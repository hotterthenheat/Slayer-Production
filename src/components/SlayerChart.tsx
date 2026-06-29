import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { Candle, GexProfileData, TimeframeVal } from '../types';
import { useContractStore } from '../lib/store';
import * as TI from '../lib/indicators';
import { SyncChannel, CHANNEL_CYCLE, CHANNEL_COLORS, subscribeChannel, publishChannel, broadcastCrosshair } from '../lib/chartSync';
import { fetchHistory } from '../lib/historyCache';
import { OVERLAY_DEFS, PANE_DEFS, type OHLCV, type Series, type PaneData } from './chart/indicators';
import { newId, idxOfTime, timeOfIdx, distToSeg, CHART_TFS, readTheme, EMPTY, hexA, contrastInk, sameDay } from './chart/format';
import { CHART_TYPES, DRAW_COLOR, DRAW_TOOLS, type ChartType, type DrawTool, type Anchor, type Drawing } from './chart/drawing';
import { ChartContextMenu } from './chart/overlays';
import { IndicatorMenu } from './chart/IndicatorMenu';
import { ChartSettings } from './chart/ChartSettings';
import { drawChart } from './chart/draw';

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
  live?: boolean;                 // feed is actually streaming (market open + real provider) → animate the last-price pulse
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
export const SlayerChart = memo(function SlayerChartImpl({ profile, decimals, candles: propCandles, panelId, initialTimeframe, title, initialChannel, live = false }: SlayerChartProps) {
  // Panels do NOT subscribe to the global candle slice — returning a constant when panelId is
  // set means a global SSE tick (or another panel's keystroke) never re-renders this instance.
  const storeChart = useContractStore(s => (panelId ? undefined : s.activeContract?.chartData));
  // localStorage key suffix — panels namespace their prefs/drawings; the main chart (no panelId)
  // keeps the exact original keys so existing saved setups are untouched.
  const keySuffix = panelId ? '.' + panelId : '';
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Layered-canvas Phase 1: a transparent overlay canvas stacked over the candle layer. The live
  // last-price pulse (and, next, the crosshair) paint here so the heavy candle layer is never
  // repainted just to animate a 20fps ring — only this lightweight surface clears + redraws.
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Chart prefs persist across reloads (localStorage). A first-time user still gets the clean
  // default — only the GEX profile on, every indicator + displacement opt-in, TradingView-style.
  const initialPrefs = useMemo(() => { try { return JSON.parse(localStorage.getItem('slayerchart.prefs.v1' + keySuffix) || '{}'); } catch { return {}; } }, [keySuffix]);
  const [ovOn, setOvOn] = useState<Record<string, boolean>>(initialPrefs.ovOn || {});
  const [paneOn, setPaneOn] = useState<Record<string, boolean>>(initialPrefs.paneOn || {});
  // CLEAN DEFAULT (v2): the first-load chart is now JUST the candles — no volume, no dealer overlays,
  // no indicators — so a new user (or anyone not yet migrated) starts from a clean price chart and opts
  // into exactly what they want, TradingView-style. `cleanDefaultV2` is a ONE-TIME migration flag: until
  // it is stamped we force every data overlay OFF (ignoring any pre-v2 saved "on"); once stamped, the
  // user's own toggles win on every load after — so we change the default without ever overwriting a
  // real, post-v2 choice. `def()` encodes exactly that: OFF until migrated, then the saved value.
  const cleanV2 = initialPrefs.cleanDefaultV2 === true;
  const def = (saved: boolean | undefined) => (cleanV2 ? (saved ?? false) : false);
  const [showGex, setShowGex] = useState<boolean>(def(initialPrefs.showGex));               // net-γ exposure lane (right gutter)
  const [showDisp, setShowDisp] = useState<boolean>(def(initialPrefs.showDisp));            // displacement / expected-move band
  const [showHeat, setShowHeat] = useState<boolean>(def(initialPrefs.showHeat));            // Γ-MAP gamma-concentration heatmap
  const [showOrbs, setShowOrbs] = useState<boolean>(def(initialPrefs.showOrbs));            // focal gamma-concentration orbs
  const [showVolProfile, setShowVolProfile] = useState<boolean>(def(initialPrefs.showVolProfile)); // VPVR volume-by-price + POC
  const [showPrevClose, setShowPrevClose] = useState<boolean>(def(initialPrefs.showPrevClose));    // prior-day close reference line
  const [showVwap, setShowVwap] = useState<boolean>(def(initialPrefs.showVwap));            // session VWAP + σ bands
  const [showMigration, setShowMigration] = useState<boolean>(def(initialPrefs.showMigration));    // gamma center-of-mass drift comet
  const [showExposure, setShowExposure] = useState<boolean>(def(initialPrefs.showExposure));       // aggregate dealer Δ (DEX) + Vanna HUD
  const [showMaxPain, setShowMaxPain] = useState<boolean>(def(initialPrefs.showMaxPain));   // max-pain expiry pin level
  // NEW dealer overlays (opt-in, default off like everything else):
  const [showCharm, setShowCharm] = useState<boolean>(def(initialPrefs.showCharm));         // Charm Surface — Δ-decay pressure by price (right-gutter heat column)
  const [showNetPrem, setShowNetPrem] = useState<boolean>(def(initialPrefs.showNetPrem));   // Net Premium Flow — call−put $ premium traded, diverging bars by strike
  // Dealer-map density — how many strikes the heatmap / orbs / exposure-lane render. Lower = cleaner.
  const [gexCount, setGexCount] = useState<number>(typeof initialPrefs.gexCount === 'number' ? initialPrefs.gexCount : 4);
  const [showLadder, setShowLadder] = useState<boolean>(def(initialPrefs.showLadder)); // Loaded GEX Strikes (flagship) — opt-in like the rest
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null); // right-click "View" menu (reset to live, etc.)
  const [chartType, setChartType] = useState<ChartType>(initialPrefs.chartType || 'candles');
  const [colors, setColors] = useState<{ up?: string; down?: string; line?: string; wick?: string; bg?: string; grid?: string }>(initialPrefs.colors || {});
  const [showGrid, setShowGrid] = useState<boolean>(initialPrefs.showGrid ?? true);
  const [showVolume, setShowVolume] = useState<boolean>(def(initialPrefs.showVolume)); // OFF by default — "just the graph"
  const [showWatermark, setShowWatermark] = useState<boolean>(initialPrefs.showWatermark ?? true);
  const [candleBorders, setCandleBorders] = useState<boolean>(initialPrefs.candleBorders ?? true);
  const setSelectedTimeframe = useContractStore(s => s.setSelectedTimeframe);
  const [typeOpen, setTypeOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [tickerEditing, setTickerEditing] = useState(false);
  const [tickerDraft, setTickerDraft] = useState('');
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
    pendingBarsRef.current = null; autoFitPrice();
  }, [tfKey, tickKey]);
  // Load this ticker's saved drawings (and reset transient drawing state) on symbol change.
  useEffect(() => {
    try { const raw = localStorage.getItem('slayerchart.draw.' + (panelId ? panelId + '.' : '') + (tickKey || '_')); setDrawings(raw ? JSON.parse(raw) : []); } catch { setDrawings([]); }
    setSelectedId(null); draftRef.current = null; measureRef.current = null; measureDragRef.current = false;
  }, [tickKey]);
  // Debounced persist — dragging a drawing fires setDrawings every frame; coalesce those into one
  // localStorage write ~300ms after the last change so a drag doesn't serialize the set per mouse-move.
  useEffect(() => {
    const id = setTimeout(() => { try { localStorage.setItem('slayerchart.draw.' + (panelId ? panelId + '.' : '') + (tickKey || '_'), JSON.stringify(drawings)); } catch { /* storage unavailable */ } }, 300);
    return () => clearTimeout(id);
  }, [drawings, tickKey, panelId]);

  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  // Per-strike GEX baseline (snapshot from ~45s ago) so each loaded strike can show its ΔGEX (↑/↓ since checkpoint).
  const gexDeltaRef = useRef<{ base: Map<number, number>; ts: number; tick: string }>({ base: new Map(), ts: 0, tick: '' });
  // A plot drag now free-pans BOTH axes (TradingView 2D pan): x/off drive time; y + the price-view
  // baseline (offset0/factor0) + a px→price scale frozen at grab (pricePerPx) drive price. `locked`
  // flips true on the first effective move, when the price scale is pinned to manual.
  const dragRef = useRef<{ x: number; y: number; off: number; offset0: number; factor0: number; pricePerPx: number; span0: number; locked: boolean; lastX?: number; lastT?: number; vx?: number } | null>(null);
  const panPxRef = useRef(0);   // sub-bar pixel offset during an active drag → smooth (sub-pixel) panning; snaps to 0 on release
  const inertiaRef = useRef(0); // rAF id for the momentum glide after a flick-release
  const zoomAnimRef = useRef(0); // rAF id for eased wheel-zoom
  const zoomTgtRef = useRef<{ target: number; gi: number; ax: number } | null>(null); // zoom target + the candle/x to keep pinned
  const priceDragRef = useRef<{ y: number; factor: number; offset: number } | null>(null);
  const draftRef = useRef<Anchor | null>(null);          // first point of a 2-point drawing
  const measureRef = useRef<{ a: Anchor; b: Anchor } | null>(null);
  const measureDragRef = useRef(false);
  const editRef = useRef<{ id: string; handle: 'a' | 'b' | 'price' | 'move'; downT: number; downPrice: number; orig: Drawing } | null>(null); // dragging a placed drawing
  const pinchRef = useRef<{ d0: number; bars0: number; gi: number; ax: number } | null>(null); // 2-finger pinch-zoom anchor
  const touchRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);    // tap-vs-pan discriminator
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
  // Pin the vertical price scale to its current displayed range (AUTO → MANUAL), exactly like
  // TradingView locks the scale the instant you start to pan. Idempotent — a no-op if already manual.
  // factor:1/offset:0 reproduces the on-screen range because draw.ts freezes the base range while a
  // manual priceView is active and applies factor/offset on top of it.
  const lockPriceScale = () => { if (priceViewRef.current) return priceViewRef.current; const pv = { factor: 1, offset: 0 }; priceViewRef.current = pv; setPriceView(pv); return pv; };
  // Return the price axis to auto-fit: clear the manual scale AND drop the held range so the next
  // frame re-fits to the visible candles immediately (reset / double-click / AUTO Y).
  const autoFitPrice = () => { dispRangeRef.current = null; setPriceView(null); };
  const resetView = () => { tweenView({ bars: 110, off: 0 }); autoFitPrice(); };
  useEffect(() => () => { if (tweenRef.current) cancelAnimationFrame(tweenRef.current); if (inertiaRef.current) cancelAnimationFrame(inertiaRef.current); if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current); }, []);
  // While a 2D pan is locked, the move handler OWNS priceViewRef (it updates the range imperatively and
  // commits to React state only on release — avoids a re-render per pointer frame). So don't let an
  // unrelated re-render mid-drag (e.g. a live candle tick) clobber the in-flight range back to stale state.
  const priceViewRef = useRef(priceView); if (!dragRef.current?.locked) priceViewRef.current = priceView;
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
    try { localStorage.setItem('slayerchart.prefs.v1' + keySuffix, JSON.stringify({ chartType, colors, ovOn, paneOn, showGex, showDisp, showHeat, showOrbs, showVolProfile, showPrevClose, showVwap, showMigration, showExposure, showMaxPain, showCharm, showNetPrem, gexCount, showLadder, showGrid, showVolume, showWatermark, candleBorders, gexMapV2: true, cleanDefaultV2: true, ...(panelId ? { ticker: panelTicker, timeframe: localTf, channel, expiry } : {}) })); } catch { /* storage unavailable */ }
  }, [chartType, colors, ovOn, paneOn, showGex, showDisp, showHeat, showOrbs, showVolProfile, showPrevClose, showVwap, showMigration, showExposure, showMaxPain, showCharm, showNetPrem, gexCount, showLadder, showGrid, showVolume, showWatermark, candleBorders, panelId, panelTicker, localTf, channel, expiry]);

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

  // Session VWAP + σ bands — volume-weighted average price re-anchored each session, with ±1σ/±2σ
  // envelopes from the volume-weighted variance of typical price. Institutional fair value; recomputed
  // only when candles change. Arrays are global-indexed (length n); a session with zero volume falls
  // back to close so the line never breaks.
  const vwapData = useMemo(() => {
    const n = candles.length;
    const line: (number | null)[] = new Array(n).fill(null);
    const u1: (number | null)[] = new Array(n).fill(null), d1: (number | null)[] = new Array(n).fill(null);
    const u2: (number | null)[] = new Array(n).fill(null), d2: (number | null)[] = new Array(n).fill(null);
    let cumPV = 0, cumV = 0, cumPV2 = 0;
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      if (i === 0 || !sameDay(candles[i - 1].timestamp, c.timestamp)) { cumPV = 0; cumV = 0; cumPV2 = 0; }  // re-anchor each session
      const tp = (c.high + c.low + c.close) / 3, v = c.volume || 0;
      cumPV += tp * v; cumV += v; cumPV2 += tp * tp * v;
      const vw = cumV > 0 ? cumPV / cumV : c.close;
      const sd = cumV > 0 ? Math.sqrt(Math.max(0, cumPV2 / cumV - vw * vw)) : 0;
      line[i] = vw; u1[i] = vw + sd; d1[i] = vw - sd; u2[i] = vw + 2 * sd; d2[i] = vw - 2 * sd;
    }
    return { line, u1, d1, u2, d2 };
  }, [candles]);

  // Gamma center-of-mass + migration trail — the |netGex|-weighted mean strike (where dealer gamma is
  // concentrated). A ring buffer of its recent values feeds the drift "comet" on the chart, so you can SEE
  // the CoM migrating up (supportive) or down. Resets on ticker change; dedup'd by value so a no-op
  // re-render never pads it (StrictMode-safe — a repeat invocation finds the same last value and skips).
  const comHistRef = useRef<number[]>([]);
  const gammaCoM = useMemo(() => {
    let sw = 0, swx = 0;
    for (const s of profile.strikes || []) { const w = Math.abs(s.netGex || 0); sw += w; swx += w * s.strike; }
    const com = sw > 0 ? swx / sw : null;
    if (com != null) { const buf = comHistRef.current; if (buf.length === 0 || Math.abs(buf[buf.length - 1] - com) > 1e-6) { buf.push(com); if (buf.length > 28) buf.shift(); } }
    return com;
  }, [profile]);
  useEffect(() => { comHistRef.current = []; }, [tickKey]);

  const livePhaseRef = useRef(0);   // 0..1 looping pulse phase, advanced by the live rAF loop below
  const liveRafRef = useRef(0);
  // Last-price geometry the candle layer hands off on every base repaint; the overlay layer reads it
  // to paint the dot + (when live) the expanding ring, so the dot tracks the fresh last-price y on
  // every pan/zoom/data frame. null = last price is scrolled off-screen → overlay paints nothing.
  const liveOverlayRef = useRef<{ plotR: number; lastY: number; up: boolean; upCol: string; downCol: string } | null>(null);

  // The candle layer (heavy: candles, heatmap, levels, axes). Pulled out of drawRef so the live
  // pulse loop can repaint the OVERLAY alone without re-running any of this.
  const baseDraw = () => drawChart({
    canvasRef, containerRef, viewRef, priceViewRef, geomRef, dispRangeRef, scaleViewRef, themeRef,
    hoverRef, gexDeltaRef, draftRef, measureRef, drawingsRef, toolRef, selectedRef,
    candles, ha, atr, profile, colors, decimals, chartType, ovOn, overlaySeries, paneSeries,
    displacements, gexCount, showVolume, showGrid, showWatermark, candleBorders,
    showGex, showHeat, showOrbs, showVolProfile, showPrevClose, showVwap, vwap: vwapData, showMigration, gammaCoM, comHist: comHistRef.current, showExposure, showMaxPain, showDisp, showLadder, showCharm, showNetPrem, tickKey, tfKey, live, livePhaseRef, liveOverlayRef, panPx: panPxRef.current,
  });

  // Overlay repaint — clears the transparent top canvas and paints the last-price dot, plus an
  // expanding/fading ring while the feed is genuinely live. Cheap enough to run every animation frame.
  const drawOverlayRef = useRef<() => void>(() => {});
  drawOverlayRef.current = () => {
    const cv = overlayRef.current, container = containerRef.current; if (!cv || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth, H = container.clientHeight; if (W <= 0 || H <= 0) return;
    // Match the candle layer's backing store; only reallocate when the surface actually changes.
    const nw = Math.floor(W * dpr), nh = Math.floor(H * dpr);
    if (cv.width !== nw || cv.height !== nh) { cv.width = nw; cv.height = nh; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const g = liveOverlayRef.current;   // last-price geometry (null when it's scrolled off-screen)
    if (g) {
      const col = g.up ? g.upCol : g.downCol;
      // Expanding pulse ring — live only; phase 0..1 grows the radius and fades the alpha to 0.
      if (live) {
        const ph = livePhaseRef.current, r = 3 + ph * 13, a = 0.5 * (1 - ph);
        ctx.beginPath(); ctx.arc(g.plotR, g.lastY, r, 0, Math.PI * 2);
        ctx.strokeStyle = hexA(col, a); ctx.lineWidth = 1.5; ctx.stroke();
      }
      // Static last-price dot — always painted, so a closed/stale market still shows the marker.
      ctx.beginPath(); ctx.arc(g.plotR, g.lastY, 3.2, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.arc(g.plotR, g.lastY, 3.2, 0, Math.PI * 2); ctx.strokeStyle = hexA(contrastInk(col), 0.85); ctx.lineWidth = 1; ctx.stroke();
    }
    // Crosshair + axis bubbles + OHLC + dealer-context + loaded-strike tooltip — rendered here on the
    // overlay (Layered-canvas 1b) so cursor movement repaints ONLY this surface, never the candle layer.
    const hov = hoverRef.current, rh = geomRef.current && (geomRef.current as any).renderHover;
    if (hov && rh) rh(ctx, hov);
  };

  // Full repaint = candle layer then overlay, so the dot re-glues to the latest last-price y on every
  // data/pan/zoom/hover frame routed through drawRef. The live loop below bypasses baseDraw entirely.
  drawRef.current = () => { baseDraw(); drawOverlayRef.current(); };

  // Live last-price pulse — a self-perpetuating rAF that advances the pulse phase and repaints ONLY
  // the overlay layer, ONLY while the feed is genuinely live (market open + real provider). Throttled
  // to ~20fps to bound cost, and fully torn down when `live` flips false (market close / model data →
  // static dot, no loop). The candle layer is never touched by this loop.
  useEffect(() => {
    if (!live) { livePhaseRef.current = 0; drawOverlayRef.current(); return; }
    let t0 = 0, lastPaint = 0, raf = 0;
    const loop = (now: number) => {
      if (!t0) t0 = now;
      livePhaseRef.current = ((now - t0) / 1600) % 1;
      if (now - lastPaint >= 50) { lastPaint = now; drawOverlayRef.current(); }   // ~20fps overlay-only
      raf = requestAnimationFrame(loop);
      liveRafRef.current = raf;
    };
    raf = requestAnimationFrame(loop); liveRafRef.current = raf;
    return () => { if (liveRafRef.current) cancelAnimationFrame(liveRafRef.current); liveRafRef.current = 0; };
  }, [live]);

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

    // Eased wheel-zoom: ease `bars` toward the target over a few frames while pinning the candle under
    // the cursor (anchor gi/ax), so zoom feels smooth and TradingView-anchored instead of snapping.
    const zoomStep = () => {
      const z = zoomTgtRef.current, g = geomRef.current;
      if (!z || !g) { zoomAnimRef.current = 0; zoomTgtRef.current = null; return; }
      const n = candlesRef.current.length || 300, cur = viewRef.current.bars;
      let bars = cur + (z.target - cur) * 0.35;
      if (Math.abs(bars - z.target) < 0.75) bars = z.target;
      bars = Math.max(20, Math.min(n, Math.round(bars)));
      const newBarW = (g.plotR - g.plotL) / bars, newStart = z.gi - (z.ax - g.plotL) / newBarW;
      const off = Math.max(-Math.round(bars * 0.5), Math.min(Math.max(0, n - 10), Math.round(n - bars - newStart)));
      setView({ bars, off });
      if (bars !== z.target) zoomAnimRef.current = requestAnimationFrame(zoomStep);
      else { zoomAnimRef.current = 0; zoomTgtRef.current = null; }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (tweenRef.current) { cancelAnimationFrame(tweenRef.current); tweenRef.current = 0; }
      if (inertiaRef.current) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = 0; panPxRef.current = 0; }   // zoom cancels any pan glide
      // Scrolling over the price axis scales the VERTICAL (price) scale — the eased range makes the
      // candles + side level tags glide bigger/smaller together. Inside the plot, scroll zooms time.
      const gw = geomRef.current, rw = canvas.getBoundingClientRect(), mxw = e.clientX - rw.left;
      if (gw && mxw >= gw.plotR) {
        const f = e.deltaY > 0 ? 1.1 : 0.9;
        setPriceView(prev => { const cur = prev ?? { factor: 1, offset: 0 }; return { factor: Math.max(0.2, Math.min(6, cur.factor * f)), offset: cur.offset }; });
        return;
      }
      const n = candlesRef.current.length || 300, factor = e.deltaY > 0 ? 1.12 : 0.89;
      const g = geomRef.current, r = canvas.getBoundingClientRect(), mx = e.clientX - r.left;
      const base = zoomTgtRef.current ? zoomTgtRef.current.target : viewRef.current.bars;
      const target = Math.max(20, Math.min(n, Math.round(base * factor)));
      if (target === base) return;
      const inPlot = !!(g && mx >= g.plotL && mx <= g.plotR);
      if (!zoomTgtRef.current) {   // capture the pin once per burst (the candle under the cursor, else the live edge)
        const ax = inPlot && g ? mx : (g ? g.plotR : 0);
        const gi = g ? (inPlot ? g.start + (mx - g.plotL) / g.barW : g.end - 1) : viewRef.current.bars;
        zoomTgtRef.current = { target, gi, ax };
      } else zoomTgtRef.current.target = target;
      if (!zoomAnimRef.current) zoomAnimRef.current = requestAnimationFrame(zoomStep);
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
        else if (d.kind === 'rect') { const x1 = xOfT(d.a.t), y1 = yOfP(d.a.price), x2 = xOfT(d.b.t), y2 = yOfP(d.b.price); const L = Math.min(x1, x2), R = Math.max(x1, x2), T = Math.min(y1, y2), B = Math.max(y1, y2); dist = Math.min(distToSeg(mx, my, L, T, R, T), distToSeg(mx, my, L, B, R, B), distToSeg(mx, my, L, T, L, B), distToSeg(mx, my, R, T, R, B)); }
        else { const x1 = xOfT(d.a.t), y1 = yOfP(d.a.price); let x2 = xOfT(d.b.t), y2 = yOfP(d.b.price); if (d.kind === 'ray') { const dx = x2 - x1; if (Math.abs(dx) > 0.01) { const m = (y2 - y1) / dx, ex = dx >= 0 ? g.plotR : g.plotL; y2 = y1 + m * (ex - x1); x2 = ex; } } dist = distToSeg(mx, my, x1, y1, x2, y2); }
        if (dist < bestD) { bestD = dist; best = d.id; }
      }
      return best;
    };
    // Which part of a placed drawing is under the cursor — an endpoint handle (a/b), the hline's price,
    // else 'move' (translate the whole thing). Endpoint grab radius is generous for easy editing.
    const grabHandle = (mx: number, my: number, g: Geom, d: Drawing): 'a' | 'b' | 'price' | 'move' => {
      if (d.kind === 'hline') return 'price';
      const yOfP = (p: number) => g.priceTop + g.priceAreaH - ((p - g.lo) / (g.hi - g.lo)) * g.priceAreaH;
      const xOfT = (t: number) => g.plotL + (idxOfTime(candlesRef.current, t) - g.start) * g.barW + g.barW / 2;
      if (Math.hypot(mx - xOfT(d.a.t), my - yOfP(d.a.price)) <= 9) return 'a';
      if (Math.hypot(mx - xOfT(d.b.t), my - yOfP(d.b.price)) <= 9) return 'b';
      return 'move';
    };
    // Momentum glide after a flick-release — shared by mouse-up and touch-end. Keeps panning with
    // decaying friction until it slows or hits an edge, then settles to the bar grid. Same off/panPx
    // mechanism as the drag, so it can never desync the framing.
    const startMomentum = (vx: number, g: Geom) => {
      if (inertiaRef.current) cancelAnimationFrame(inertiaRef.current);
      const barW = g.barW, minOff = -Math.round(viewRef.current.bars * 0.5), maxOff = Math.max(0, candlesRef.current.length - 10);
      let offF = viewRef.current.off + panPxRef.current / barW, v = vx, last = performance.now();
      const glide = (now: number) => {
        const dt = Math.min(48, now - last); last = now;
        offF += (v * dt) / barW; v *= Math.pow(0.94, dt / 16);   // ~6%/frame friction, frame-rate normalized
        let edge = false; if (offF <= minOff) { offF = minOff; edge = true; } if (offF >= maxOff) { offF = maxOff; edge = true; }
        const offInt = Math.floor(offF); panPxRef.current = (offF - offInt) * barW;
        if (offInt !== viewRef.current.off) setView(v2 => ({ ...v2, off: offInt })); else drawRef.current();
        if (!edge && Math.abs(v) > 0.02) inertiaRef.current = requestAnimationFrame(glide);
        else { inertiaRef.current = 0; if (panPxRef.current !== 0) { panPxRef.current = 0; drawRef.current(); } }
      };
      inertiaRef.current = requestAnimationFrame(glide);
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left button only — right-click opens the view context menu
      setCtxMenu(null);
      if (inertiaRef.current) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = 0; if (panPxRef.current !== 0) { panPxRef.current = 0; drawRef.current(); } }   // a new grab stops the glide
      if (zoomAnimRef.current) { cancelAnimationFrame(zoomAnimRef.current); zoomAnimRef.current = 0; zoomTgtRef.current = null; }   // and any in-flight zoom ease
      if (tweenRef.current) { cancelAnimationFrame(tweenRef.current); tweenRef.current = 0; }
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, g = geomRef.current, tl = toolRef.current;
      if (!g) return;
      if (tl === 'cursor') {
        if (mx >= g.plotR) { const cur = priceViewRef.current; priceDragRef.current = { y: e.clientY, factor: cur?.factor ?? 1, offset: cur?.offset ?? 0 }; canvas.style.cursor = 'ns-resize'; return; }
        const hit = hitTest(mx, my, g);
        if (hit) {
          setSelectedId(hit);
          const d = drawingsRef.current.find(x => x.id === hit);
          if (d) { editRef.current = { id: hit, handle: grabHandle(mx, my, g, d), downT: tAtX(mx, g), downPrice: priceAtY(my, g), orig: d }; canvas.style.cursor = 'grabbing'; }
          schedule(); return;
        }
        if (selectedRef.current) setSelectedId(null);
        // Arm a 2D pan. The price-scale lock is deferred to the first effective move (so a click isn't
        // turned into a manual scale); offset0/factor0 carry the current price-view so a second drag
        // continues smoothly, and pricePerPx is frozen here so vertical finger-tracking stays 1:1.
        dragRef.current = { x: e.clientX, y: e.clientY, off: viewRef.current.off, offset0: priceViewRef.current?.offset ?? 0, factor0: priceViewRef.current?.factor ?? 1, pricePerPx: (g.hi - g.lo) / g.priceAreaH, span0: g.hi - g.lo, locked: false };
        canvas.style.cursor = 'grabbing'; return;
      }
      if (mx >= g.plotR) return; // drawing tools act only inside the plot
      const t = tAtX(mx, g), price = priceAtY(my, g);
      if (tl === 'hline') { setDrawings(a => [...a, { id: newId(), kind: 'hline', price, color: DRAW_COLOR }]); setTool('cursor'); return; }
      if (tl === 'measure') { measureRef.current = { a: { t, price }, b: { t, price } }; measureDragRef.current = true; schedule(); return; }
      if (tl === 'trend' || tl === 'ray' || tl === 'rect') {
        if (!draftRef.current) { draftRef.current = { t, price }; schedule(); }
        else { const a = draftRef.current!; setDrawings(arr => [...arr, { id: newId(), kind: tl, a, b: { t, price }, color: DRAW_COLOR }]); draftRef.current = null; setTool('cursor'); }
      }
    };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect(); hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      const g = geomRef.current;
      if (measureDragRef.current && g && measureRef.current) { measureRef.current.b = { t: tAtX(hoverRef.current.x, g), price: priceAtY(hoverRef.current.y, g) }; schedule(); return; }
      // Editing a placed drawing — drag an endpoint handle, the hline's price, or translate the whole mark.
      const ed = editRef.current;
      if (ed && g) {
        const curT = tAtX(hoverRef.current.x, g), curPrice = priceAtY(hoverRef.current.y, g);
        const dt = curT - ed.downT, dp = curPrice - ed.downPrice, o = ed.orig;
        setDrawings(arr => arr.map(d => {
          if (d.id !== ed.id) return d;
          if (o.kind === 'hline') return { ...o, price: curPrice };
          if (ed.handle === 'a') return { ...o, a: { t: curT, price: curPrice } };
          if (ed.handle === 'b') return { ...o, b: { t: curT, price: curPrice } };
          return { ...o, a: { t: o.a.t + dt, price: o.a.price + dp }, b: { t: o.b.t + dt, price: o.b.price + dp } };
        }));
        schedule();
        return;
      }
      const pd = priceDragRef.current;
      if (pd) { const dy = e.clientY - pd.y; const factor = Math.max(0.2, Math.min(6, pd.factor * Math.exp(dy / 240))); setPriceView({ factor, offset: pd.offset }); return; }
      const drag = dragRef.current;
      if (drag && g) {
        // ── Vertical (price) pan — the missing half of a TradingView free 2D drag. A VERTICAL move (only)
        // LOCKS the price scale to manual so the candles never rescale; a pure horizontal drag stays in
        // auto-fit (the dead-band holds it steady, so it slides without rescaling and still auto-recovers
        // if you scroll to a far price). Once locked, dy translates the range 1:1 (the price grabbed at
        // mousedown stays under the cursor), factor held. The range is driven through priceViewRef directly
        // and committed to React state only on release (onUp) — no re-render per pointer frame.
        const dyTot = e.clientY - drag.y;
        if (!drag.locked && Math.abs(dyTot) > 3) { lockPriceScale(); drag.locked = true; }
        if (drag.locked) { const lim = drag.span0 * 2.5; const offset = Math.max(-lim, Math.min(lim, drag.offset0 + dyTot * drag.pricePerPx)); priceViewRef.current = { factor: drag.factor0, offset }; }   // clamp keeps candles from being panned entirely off-screen
        const n = candlesRef.current.length, barW = g.barW;
        const minOff = -Math.round(viewRef.current.bars * 0.5), maxOff = Math.max(0, n - 10);
        // Continuous (fractional) bar offset → smooth sub-pixel pan. The integer part drives the data
        // window (off); the remainder becomes panPx, which slides the candle layer between bars.
        const offFloat = Math.max(minOff, Math.min(maxOff, drag.off + (e.clientX - drag.x) / barW));
        const offInt = Math.floor(offFloat);   // floor → the data window only re-slices on a full-bar crossing; the
        panPxRef.current = (offFloat - offInt) * barW;   // remainder (0..barW) slides the layer smoothly between bars
        // Track release velocity (px/ms) for the momentum glide.
        const tnow = performance.now();
        if (drag.lastT != null && tnow > drag.lastT) drag.vx = (e.clientX - (drag.lastX ?? e.clientX)) / (tnow - drag.lastT);
        drag.lastX = e.clientX; drag.lastT = tnow;
        if (offInt !== viewRef.current.off) setView(v => ({ ...v, off: offInt }));   // whole-bar crossing → re-window (re-render repaints with the fresh panPx)
        else drawRef.current();                                                       // sub-bar move → repaint base+overlay now
        return;
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
      drawOverlayRef.current();   // pure hover → repaint ONLY the overlay (crosshair), never the candle layer
    };
    const onUp = () => {
      const drag = dragRef.current, g = geomRef.current;
      if (editRef.current) { editRef.current = null; canvas.style.cursor = 'crosshair'; return; }   // finished editing a drawing — no pan momentum
      dragRef.current = null; priceDragRef.current = null; measureDragRef.current = false; canvas.style.cursor = 'crosshair';
      if (drag?.locked) setPriceView(priceViewRef.current);   // commit the panned range to React state once (drag drove it through the ref); now the guarded render can resync without clobbering it
      if (drag && g && drag.vx && Math.abs(drag.vx) > 0.08) startMomentum(drag.vx, g);
      else if (panPxRef.current !== 0) { panPxRef.current = 0; drawRef.current(); }
    };
    const onLeave = () => { hoverRef.current = null; broadcastCrosshair(null, panelId ?? 'main'); drawOverlayRef.current(); };
    // Double-click (cursor mode): price gutter → auto-fit; elsewhere → snap back to the live edge.
    const onDbl = (e: MouseEvent) => { if (toolRef.current !== 'cursor') return; const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, g = geomRef.current; if (g && mx >= g.plotR) autoFitPrice(); else { tweenView({ bars: 110, off: 0 }); autoFitPrice(); } };
    // Right-click anywhere on the chart → a small "View" menu (reset to the live view, jump to live, auto-fit Y).
    const onCtx = (e: MouseEvent) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); setCtxMenu({ x: Math.max(6, Math.min(e.clientX - r.left, r.width - 192)), y: Math.max(6, Math.min(e.clientY - r.top, r.height - 128)) }); };
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null; if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      if (e.key === 'Delete' && selectedRef.current) { const id = selectedRef.current; setDrawings(a => a.filter(d => d.id !== id)); setSelectedId(null); }
      else if (e.key === 'Escape') { draftRef.current = null; measureRef.current = null; measureDragRef.current = false; if (toolRef.current !== 'cursor') setTool('cursor'); if (selectedRef.current) setSelectedId(null); schedule(); }
    };
    // ── Touch (mobile / tablet): 1-finger pan + flick-inertia, 2-finger pinch-zoom, tap = crosshair ──
    // Reuses the exact off/panPx pan mechanism and the eased-zoom anchor math so touch feels identical to
    // mouse. `touch-action: none` on the canvas (set in JSX) stops the browser hijacking the gesture.
    const tXY = (t: Touch) => { const r = canvas.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const tDist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const onTouchStart = (e: TouchEvent) => {
      setCtxMenu(null);
      if (inertiaRef.current) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = 0; }
      if (zoomAnimRef.current) { cancelAnimationFrame(zoomAnimRef.current); zoomAnimRef.current = 0; zoomTgtRef.current = null; }
      if (tweenRef.current) { cancelAnimationFrame(tweenRef.current); tweenRef.current = 0; }
      const g = geomRef.current; if (!g) return;
      if (e.touches.length >= 2) {
        dragRef.current = null;   // a second finger ends panning and begins a pinch
        const a = e.touches[0], b = e.touches[1], mid = (tXY(a).x + tXY(b).x) / 2;
        const inPlot = mid >= g.plotL && mid <= g.plotR;
        pinchRef.current = { d0: tDist(a, b), bars0: viewRef.current.bars, gi: inPlot ? g.start + (mid - g.plotL) / g.barW : g.end - 1, ax: inPlot ? mid : g.plotR };
        return;
      }
      const p = tXY(e.touches[0]);
      touchRef.current = { x: p.x, y: p.y, t: performance.now(), moved: false };
      hoverRef.current = null; broadcastCrosshair(null, panelId ?? 'main');   // clear any prior tap-crosshair so it can't look stale mid-pan
      panPxRef.current = 0;
      dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, off: viewRef.current.off, offset0: priceViewRef.current?.offset ?? 0, factor0: priceViewRef.current?.factor ?? 1, pricePerPx: (g.hi - g.lo) / g.priceAreaH, span0: g.hi - g.lo, locked: false };
    };
    const onTouchMove = (e: TouchEvent) => {
      const g = geomRef.current; if (!g) return;
      e.preventDefault();   // keep the page from scrolling/zooming while the chart is being driven
      const n = candlesRef.current.length || 300;
      if (e.touches.length >= 2 && pinchRef.current) {
        const pz = pinchRef.current, d = tDist(e.touches[0], e.touches[1]);
        if (pz.d0 > 0 && d > 0) {
          const bars = Math.max(20, Math.min(n, Math.round(pz.bars0 * (pz.d0 / d))));   // fingers apart → fewer bars → zoom in
          const newBarW = (g.plotR - g.plotL) / bars, newStart = pz.gi - (pz.ax - g.plotL) / newBarW;
          const off = Math.max(-Math.round(bars * 0.5), Math.min(Math.max(0, n - 10), Math.round(n - bars - newStart)));
          setView({ bars, off });
        }
        return;
      }
      const drag = dragRef.current;
      if (drag) {
        const cx = e.touches[0].clientX, cy = e.touches[0].clientY, p = tXY(e.touches[0]), tr = touchRef.current;
        if (tr && (Math.abs(p.x - tr.x) > 6 || Math.abs(p.y - tr.y) > 6)) tr.moved = true;
        // 2D pan on touch — mirror the mouse. Only a real vertical move (past the tap/pan threshold) locks
        // the price scale; thereafter dy translates the range 1:1, driven through the ref and committed to
        // state on release. A jittery tap (< the pan threshold) never locks the scale.
        const dyTot = cy - drag.y;
        if (!drag.locked && tr?.moved && Math.abs(dyTot) > 3) { lockPriceScale(); drag.locked = true; }
        if (drag.locked) { const lim = drag.span0 * 2.5; const offset = Math.max(-lim, Math.min(lim, drag.offset0 + dyTot * drag.pricePerPx)); priceViewRef.current = { factor: drag.factor0, offset }; }
        const barW = g.barW, minOff = -Math.round(viewRef.current.bars * 0.5), maxOff = Math.max(0, n - 10);
        const offFloat = Math.max(minOff, Math.min(maxOff, drag.off + (cx - drag.x) / barW));
        const offInt = Math.floor(offFloat);
        panPxRef.current = (offFloat - offInt) * barW;
        const tnow = performance.now();
        if (drag.lastT != null && tnow > drag.lastT) drag.vx = (cx - (drag.lastX ?? cx)) / (tnow - drag.lastT);
        drag.lastX = cx; drag.lastT = tnow;
        if (offInt !== viewRef.current.off) setView(v => ({ ...v, off: offInt })); else drawRef.current();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const g = geomRef.current, drag = dragRef.current, tr = touchRef.current;
      if (e.touches.length === 0) {
        if (drag?.locked) setPriceView(priceViewRef.current);   // commit the panned range to state once on release (mirrors onUp)
        // Tap (negligible move) → drop the crosshair at the tap point so values can be read on touch.
        if (tr && !tr.moved && g) {
          hoverRef.current = { x: tr.x, y: tr.y };
          if (tr.x >= g.plotL && tr.x <= g.plotR && tr.y >= g.priceTop && tr.y <= g.priceTop + g.priceAreaH) broadcastCrosshair(priceAtY(tr.y, g), panelId ?? 'main');
          drawOverlayRef.current();
        } else if (drag && g && tr?.moved && drag.vx && Math.abs(drag.vx) > 0.08) startMomentum(drag.vx, g);
        else if (panPxRef.current !== 0) { panPxRef.current = 0; drawRef.current(); }
        dragRef.current = null; pinchRef.current = null; touchRef.current = null;
      } else if (e.touches.length === 1) {
        // Lifted from two fingers to one → resume panning from the remaining finger.
        pinchRef.current = null;
        const p = tXY(e.touches[0]);
        dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, off: viewRef.current.off, offset0: priceViewRef.current?.offset ?? 0, factor0: priceViewRef.current?.factor ?? 1, pricePerPx: g ? (g.hi - g.lo) / g.priceAreaH : 0, span0: g ? g.hi - g.lo : 0, locked: false };
        touchRef.current = { x: p.x, y: p.y, t: performance.now(), moved: true };
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('contextmenu', onCtx);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('keydown', onKey);
    return () => { ro.disconnect(); mo.disconnect(); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); canvas.removeEventListener('mouseleave', onLeave); canvas.removeEventListener('dblclick', onDbl); canvas.removeEventListener('contextmenu', onCtx); canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchmove', onTouchMove); canvas.removeEventListener('touchend', onTouchEnd); canvas.removeEventListener('touchcancel', onTouchEnd); window.removeEventListener('keydown', onKey); };
  }, []);

  // Data/view-driven repaints are rAF-coalesced and do NOT re-read the theme (the MutationObserver
  // above keeps themeRef fresh) — getComputedStyle on every pan/zoom/tick frame was the jank source.
  const redrawRafRef = useRef(0);
  useEffect(() => {
    if (redrawRafRef.current) return;
    redrawRafRef.current = requestAnimationFrame(() => { redrawRafRef.current = 0; drawRef.current(); });
  }, [candles, overlaySeries, paneSeries, displacements, showGex, showDisp, showHeat, showOrbs, showVolProfile, showPrevClose, showVwap, vwapData, showMigration, gammaCoM, showExposure, showMaxPain, showCharm, showNetPrem, gexCount, showLadder, chartType, colors, ha, view, priceView, drawings, tool, selectedId, showGrid, showVolume, showWatermark, candleBorders, profile, decimals, tfKey, tickKey]);
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


  const removeChip = (label: string, color: string, onClick: () => void) => (
    <button key={label} onClick={onClick} className="group flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--danger)]/50 transition-colors">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}<span className="text-[var(--text-tertiary)] group-hover:text-[var(--danger)]">×</span>
    </button>
  );
  const specChip = (active: boolean, label: string, onClick: () => void, tone = 'default', tip?: string) => (
    <button onClick={onClick} title={tip} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border transition-colors ${active ? (tone === 'warn' ? 'bg-[var(--warning)]/15 border-[var(--warning)]/40 text-[var(--warning)]' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]') : 'bg-transparent border-transparent text-[var(--text-tertiary)] opacity-50'}`}>{label}</button>
  );
  const pickTool = (k: DrawTool) => { setTool(t => (t === k ? 'cursor' : k)); draftRef.current = null; measureRef.current = null; measureDragRef.current = false; };

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
                className="w-16 px-1.5 py-1 rounded text-[11px] font-mono font-black uppercase tracking-wider bg-[var(--surface-2)] border border-[var(--accent-color)] text-[var(--text-primary)] outline-none" />
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
        {/* Indicator menu */}
        <IndicatorMenu ovOn={ovOn} setOvOn={setOvOn} paneOn={paneOn} setPaneOn={setPaneOn} />

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

        <div className="flex flex-wrap items-center gap-1 md:ml-auto">
          {/* Appearance settings — pick your own bar / line colors (persisted) */}
          <ChartSettings
            colors={colors} setColors={setColors} gexCount={gexCount} setGexCount={setGexCount}
            display={[['Grid', showGrid, setShowGrid], ['Volume', showVolume, setShowVolume], ['Watermark', showWatermark, setShowWatermark], ['Candle borders', candleBorders, setCandleBorders]]}
            dealer={[['Loaded strikes', showLadder, setShowLadder], ['Γ Heatmap', showHeat, setShowHeat], ['Charm surface', showCharm, setShowCharm], ['Net premium flow', showNetPrem, setShowNetPrem], ['Orbs', showOrbs, setShowOrbs], ['γ Exposure lane', showGex, setShowGex], ['Volume profile', showVolProfile, setShowVolProfile], ['Prior-day close', showPrevClose, setShowPrevClose], ['Session VWAP', showVwap, setShowVwap], ['γ Migration', showMigration, setShowMigration], ['Δ/Vanna HUD', showExposure, setShowExposure], ['Max Pain', showMaxPain, setShowMaxPain], ['Displacement', showDisp, setShowDisp]]}
          />
          {specChip(showLadder, '≣ STRIKES', () => setShowLadder(v => !v), 'default', 'STRIKES — labels the strongest dealer-gamma strike on each side of price. Each tag reads: strike, then net γ ($/1% move), then ↑/↓ its change since the ~45s checkpoint. e.g. "6,790  +574M ↓85M" = +574M net gamma, down 85M since checkpoint.')}
          {specChip(showHeat, 'Γ-MAP', () => setShowHeat(v => !v), 'default', 'Γ-MAP — gamma-concentration heatmap shading behind price (where dealer gamma is densest)')}
          {specChip(showCharm, '⧗ CHARM', () => setShowCharm(v => !v), 'default', 'CHARM SURFACE — a smooth right-gutter heat column of dealer charm (Δ-decay) by price. Charm is how much delta the dealer book sheds with the passage of time; cyan = decay adds passive BUY support at that level, amber = decay adds SELL pressure. Strongest near the money and into expiry.')}
          {specChip(showNetPrem, '$ FLOW', () => setShowNetPrem(v => !v), 'default', 'NET PREMIUM FLOW — the $ option premium that actually traded at each strike today (mid × volume), as diverging bars: green right = net CALL premium bought (bullish $), red left = net PUT premium (bearish $). Shows where real money is paying up, distinct from open-interest positioning.')}
          {specChip(showOrbs, '◉ ORBS', () => setShowOrbs(v => !v), 'default', 'ORBS — focal markers on the strikes holding the most gamma (call-wall / put-wall magnets)')}
          {specChip(showGex, 'γ-LANE', () => setShowGex(v => !v), 'default', 'γ-LANE — net-gamma profile in the right gutter (green = long-γ strikes, red = short-γ)')}
          {specChip(showDisp, '⚡ DISP', () => setShowDisp(v => !v), 'warn', 'DISP — displacement / expected-move band around spot (the implied daily range)')}
          {specChip(showVolProfile, '▤ VP', () => setShowVolProfile(v => !v), 'default', 'VOLUME PROFILE — volume-by-price histogram on the left edge; the POC line marks the highest-volume price (where the most trade happened).')}
          {specChip(showPrevClose, 'PDC', () => setShowPrevClose(v => !v), 'default', 'PDC — prior-day close reference line (yesterday’s settlement; a classic intraday reaction level).')}
          {specChip(showVwap, 'VWAP', () => setShowVwap(v => !v), 'default', 'SESSION VWAP — volume-weighted average price, re-anchored each session, with ±1σ/±2σ bands. Institutional fair value; intraday price tends to mean-revert toward it, and a decisive break of the outer band is a momentum tell.')}
          {specChip(showMigration, 'γ DRIFT', () => setShowMigration(v => !v), 'default', 'GAMMA MIGRATION — the gamma center-of-mass (|netGex|-weighted mean strike) drifting over recent updates, shown as a comet. Rising = dealer gamma concentrating higher (supportive); falling = the reverse.')}
          {specChip(showExposure, 'Δ/VANNA', () => setShowExposure(v => !v), 'default', 'DEALER EXPOSURE HUD — aggregate net dealer Δ (DEX) and Vanna across the whole chain, with a tilt gauge (net ÷ gross). Net-long Δ = dealers add to moves; net Vanna shows how their hedging shifts as IV changes.')}
          {specChip(showMaxPain, 'MAX PAIN', () => setShowMaxPain(v => !v), 'default', 'MAX PAIN — the settlement strike that minimizes total ITM payout to option holders (OI-weighted). A classic expiry magnet, distinct from the gamma magnet; the two often disagree.')}
          <button onClick={resetView} title="Reset view — smoothly refit zoom, pan and price scale (or double-click the chart)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors">⟲ RESET</button>
          {priceView && <button onClick={autoFitPrice} title="Reset price scale to auto-fit (or double-click the price axis)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⤢ AUTO Y</button>}
          {view.off !== 0 && <button onClick={() => tweenView({ bars: view.bars, off: 0 })} title="Jump back to the live edge (or double-click the chart)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⟳ LIVE</button>}
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-[300px]" style={{ position: 'relative', flex: 1, minHeight: 300 }}>
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
        {/* Layered-canvas overlay (Phase 1): live last-price pulse paints here; pointer events pass through to the canvas below. */}
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        {ctxMenu && <ChartContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} resetView={resetView} view={view} tweenView={tweenView} priceView={priceView} onAutoFit={autoFitPrice} />}
      </div>
    </div>
  );
});
