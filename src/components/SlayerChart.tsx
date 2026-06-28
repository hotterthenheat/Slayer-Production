import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { Candle, GexProfileData, TimeframeVal } from '../types';
import { useContractStore } from '../lib/store';
import * as TI from '../lib/indicators';
import { SyncChannel, CHANNEL_CYCLE, CHANNEL_COLORS, subscribeChannel, publishChannel, broadcastCrosshair, broadcastPriceScale } from '../lib/chartSync';
import { fetchHistory } from '../lib/historyCache';
import { OVERLAY_DEFS, PANE_DEFS, type OHLCV, type Series, type PaneData } from './chart/indicators';
import { newId, idxOfTime, timeOfIdx, distToSeg, RANGE_PRESETS, CHART_TFS, readTheme, EMPTY, type RangeKey } from './chart/format';
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
  // v2 dealer-chart look is now the STANDARD: the gamma heatmap + net-γ lane render by default so the
  // chart reads like a real dealer-gamma terminal out of the box. A user's own saved toggles still win.
  const gexMapV2 = initialPrefs.gexMapV2 !== false;
  const [showGex, setShowGex] = useState<boolean>(gexMapV2 ? (initialPrefs.showGex ?? true) : false);
  const [showDisp, setShowDisp] = useState<boolean>(initialPrefs.showDisp ?? false);
  const [showHeat, setShowHeat] = useState<boolean>(gexMapV2 ? (initialPrefs.showHeat ?? true) : false); // gamma heatmap on by default — the signature dealer-gamma read
  // ORBS — focal gamma-concentration orbs in the right gutter (a clean alternative to the Γ-MAP diamonds). Opt-in.
  const [showOrbs, setShowOrbs] = useState<boolean>(gexMapV2 ? (initialPrefs.showOrbs ?? false) : false);
  // Dealer-map density — how many strikes the heatmap / orbs / exposure-lane render. Lower = cleaner.
  const [gexCount, setGexCount] = useState<number>(typeof initialPrefs.gexCount === 'number' ? initialPrefs.gexCount : 4);
  const [showLadder, setShowLadder] = useState<boolean>(initialPrefs.showLadder ?? true); // Loaded GEX Strikes (flagship)
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
    try { localStorage.setItem('slayerchart.prefs.v1' + keySuffix, JSON.stringify({ chartType, colors, ovOn, paneOn, showGex, showDisp, showHeat, showOrbs, gexCount, showLadder, showGrid, showVolume, showWatermark, candleBorders, gexMapV2: true, ...(panelId ? { ticker: panelTicker, timeframe: localTf, channel, expiry } : {}) })); } catch { /* storage unavailable */ }
  }, [chartType, colors, ovOn, paneOn, showGex, showDisp, showHeat, showOrbs, gexCount, showLadder, showGrid, showVolume, showWatermark, candleBorders, panelId, panelTicker, localTf, channel, expiry]);

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

  // Broadcast the chart's live visible price range every frame (main chart only) so the Dealer Gamma
  // Profile flows with it; the listener rAF-throttles and drops no-op frames.
  const onScale = (lo: number, hi: number) => { if (!panelId) broadcastPriceScale(lo, hi, profile.spot ?? null, 'main'); };

  drawRef.current = () => drawChart({
    canvasRef, containerRef, viewRef, priceViewRef, geomRef, dispRangeRef, scaleViewRef, themeRef,
    hoverRef, gexDeltaRef, draftRef, measureRef, drawingsRef, toolRef, selectedRef,
    candles, ha, atr, profile, colors, decimals, chartType, ovOn, overlaySeries, paneSeries,
    displacements, gexCount, showVolume, showGrid, showWatermark, candleBorders,
    showGex, showHeat, showOrbs, showDisp, showLadder, tickKey, tfKey, onScale,
  });

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


  const removeChip = (label: string, color: string, onClick: () => void) => (
    <button key={label} onClick={onClick} className="group flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--danger)]/50 transition-colors">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}<span className="text-[var(--text-tertiary)] group-hover:text-[var(--danger)]">×</span>
    </button>
  );
  const specChip = (active: boolean, label: string, onClick: () => void, tone = 'default', tip?: string) => (
    <button onClick={onClick} title={tip} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border transition-colors ${active ? (tone === 'warn' ? 'bg-[var(--warning)]/15 border-[var(--warning)]/40 text-[var(--warning)]' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]') : 'bg-transparent border-transparent text-[var(--text-tertiary)] opacity-50'}`}>{label}</button>
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

        <div className="ml-auto flex items-center gap-1">
          {/* Appearance settings — pick your own bar / line colors (persisted) */}
          <ChartSettings
            colors={colors} setColors={setColors} gexCount={gexCount} setGexCount={setGexCount}
            display={[['Grid', showGrid, setShowGrid], ['Volume', showVolume, setShowVolume], ['Watermark', showWatermark, setShowWatermark], ['Candle borders', candleBorders, setCandleBorders]]}
            dealer={[['Loaded strikes', showLadder, setShowLadder], ['Γ Heatmap', showHeat, setShowHeat], ['Orbs', showOrbs, setShowOrbs], ['γ Exposure lane', showGex, setShowGex], ['Displacement', showDisp, setShowDisp]]}
          />
          {specChip(showLadder, '≣ STRIKES', () => setShowLadder(v => !v), 'default', 'STRIKES — labels the strongest dealer-gamma strike on each side of price. Each tag reads: strike, then net γ ($/1% move), then ↑/↓ its change since the ~45s checkpoint. e.g. "6,790  +574M ↓85M" = +574M net gamma, down 85M since checkpoint.')}
          {specChip(showHeat, 'Γ-MAP', () => setShowHeat(v => !v), 'default', 'Γ-MAP — gamma-concentration heatmap shading behind price (where dealer gamma is densest)')}
          {specChip(showOrbs, '◉ ORBS', () => setShowOrbs(v => !v), 'default', 'ORBS — focal markers on the strikes holding the most gamma (call-wall / put-wall magnets)')}
          {specChip(showGex, 'γ-LANE', () => setShowGex(v => !v), 'default', 'γ-LANE — net-gamma profile in the right gutter (green = long-γ strikes, red = short-γ)')}
          {specChip(showDisp, '⚡ DISP', () => setShowDisp(v => !v), 'warn', 'DISP — displacement / expected-move band around spot (the implied daily range)')}
          <button onClick={resetView} title="Reset view — smoothly refit zoom, pan and price scale (or double-click the chart)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors">⟲ RESET</button>
          {priceView && <button onClick={() => setPriceView(null)} title="Reset price scale to auto-fit (or double-click the price axis)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⤢ AUTO Y</button>}
          {view.off !== 0 && <button onClick={() => tweenView({ bars: view.bars, off: 0 })} title="Jump back to the live edge (or double-click the chart)" className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⟳ LIVE</button>}
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-[300px]" style={{ position: 'relative', flex: 1, minHeight: 300 }}>
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" style={{ position: 'absolute', inset: 0 }} />
        {ctxMenu && <ChartContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} resetView={resetView} view={view} tweenView={tweenView} priceView={priceView} onAutoFit={() => setPriceView(null)} />}
      </div>
    </div>
  );
});
