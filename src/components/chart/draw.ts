import * as TI from '../../lib/indicators';
import type { Candle, GexProfileData } from '../../types';
import { OVERLAY_DEFS, PANE_DEFS, type Series, type PaneData } from './indicators';
import type { ChartType, DrawTool, Anchor, Drawing } from './drawing';
import { shade, HEAT_POS, HEAT_NEG, fmtGex, mixHex, hexA, contrastInk, DEFAULT_COLORS, readTheme, niceStep, fmtTime, sameDay, px, fmtOsc, idxOfTime } from './format';

type Ref<T> = { current: T };
type Geom = { plotL: number; plotR: number; barW: number; start: number; end: number; n: number; priceTop: number; priceAreaH: number; lo: number; hi: number };

/**
 * The chart's entire canvas frame, lifted verbatim out of SlayerChart so the component file holds
 * only state + JSX + interaction wiring. Everything the frame reads arrives via `deps`: the live refs
 * (passed as ref objects so `.current` reads/writes stay in sync with the component) plus the current
 * render's state values. Module helpers (geometry, colour, formatters) are imported directly. One
 * cohesive pass — geometry → background/regime → dealer-map (Γ-MAP / orbs / γ-lane) → candles →
 * overlays/drawings → dealer levels → panes → time axis → crosshair/tooltips.
 */
export type DrawDeps = {
  canvasRef: Ref<HTMLCanvasElement | null>;
  containerRef: Ref<HTMLDivElement | null>;
  viewRef: Ref<{ bars: number; off: number }>;
  priceViewRef: Ref<{ factor: number; offset: number } | null>;
  geomRef: Ref<Geom | null>;
  dispRangeRef: Ref<{ lo: number; hi: number } | null>;
  scaleViewRef: Ref<{ bars: number; off: number } | null>;
  themeRef: Ref<ReturnType<typeof readTheme> | null>;
  hoverRef: Ref<{ x: number; y: number } | null>;
  gexDeltaRef: Ref<{ base: Map<number, number>; ts: number; tick: string }>;
  draftRef: Ref<Anchor | null>;
  measureRef: Ref<{ a: Anchor; b: Anchor } | null>;
  drawingsRef: Ref<Drawing[]>;
  toolRef: Ref<DrawTool>;
  selectedRef: Ref<string | null>;
  candles: Candle[];
  ha: Candle[];
  atr: ReturnType<typeof TI.atr>;
  profile: GexProfileData;
  colors: { up?: string; down?: string; line?: string; wick?: string; bg?: string; grid?: string };
  decimals: number;
  chartType: ChartType;
  ovOn: Record<string, boolean>;
  overlaySeries: Record<string, Series[]>;
  paneSeries: { def: typeof PANE_DEFS[number]; data: PaneData }[];
  displacements: { i: number; dir: 1 | -1; onLevel: boolean }[];
  gexCount: number;
  showVolume: boolean; showGrid: boolean; showWatermark: boolean; candleBorders: boolean;
  showGex: boolean; showHeat: boolean; showOrbs: boolean; showDisp: boolean; showLadder: boolean;
  showCharm: boolean;    // Charm Surface — per-strike charm (Δ-decay) as a smooth right-gutter heat column
  showNetPrem: boolean;  // Net Premium Flow — per-strike call−put $ premium traded, diverging gutter bars
  showVolProfile: boolean; showPrevClose: boolean; showVwap: boolean;
  vwap?: { line: (number | null)[]; u1: (number | null)[]; d1: (number | null)[]; u2: (number | null)[]; d2: (number | null)[] };  // session VWAP centerline + ±1σ/±2σ bands
  showMigration: boolean; gammaCoM?: number | null; comHist?: number[];  // gamma center-of-mass + its recent drift path (migration comet)
  showExposure: boolean;  // aggregate dealer Δ (DEX) + Vanna tilt HUD
  showMaxPain: boolean;  // max-pain expiry pin level (OI-weighted)
  live?: boolean; livePhaseRef?: { current: number };   // animate the last-price pulse only when truly live
  liveOverlayRef?: { current: { plotR: number; lastY: number; up: boolean; upCol: string; downCol: string } | null };  // last-price geometry handed to the overlay layer
  tickKey: string; tfKey: string;
  onScale?: (lo: number, hi: number) => void;   // report the live visible price range (drives the price-aligned gamma profile)
  panPx?: number;   // sub-bar pixel offset for smooth (sub-pixel) panning during an active drag; 0 otherwise
};

export function drawChart(deps: DrawDeps) {
  const {
    canvasRef, containerRef, viewRef, priceViewRef, geomRef, dispRangeRef, scaleViewRef, themeRef,
    hoverRef, gexDeltaRef, draftRef, measureRef, drawingsRef, toolRef, selectedRef,
    candles, ha, atr, profile, colors, decimals, chartType, ovOn, overlaySeries, paneSeries,
    displacements, gexCount, showVolume, showGrid, showWatermark, candleBorders,
    showGex, showHeat, showOrbs, showVolProfile, showPrevClose, showVwap, vwap, showMigration, gammaCoM, comHist, showExposure, showMaxPain, showDisp, showLadder, showCharm, showNetPrem, tickKey, tfKey, onScale, live, livePhaseRef, liveOverlayRef, panPx,
  } = deps;
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
    // Charm Surface + Net Premium Flow each get their own right-gutter lane, but only when the underlying
    // data is actually present (no empty lane reserving dead space on a chain that lacks charm/premium).
    const charmOn = !!(showCharm && profile.strikes && profile.strikes.some(s => Math.abs(s.charmEx || 0) > 0));
    const premOn = !!(showNetPrem && profile.strikes && profile.strikes.some(s => Math.abs(s.netPrem || 0) > 0 || (Math.abs(s.callPrem || 0) + Math.abs(s.putPrem || 0)) > 0));
    // Right-gutter lanes, each its own column (px), laid left→right from plotR in a fixed order:
    // γ-exposure · net-premium · charm. gammaW is the TOTAL gutter width (axis frame / hover math read it).
    const GAMMA_LANE_W = 46, PREM_LANE_W = 54, CHARM_LANE_W = 26;
    const gammaW = (laneOn ? GAMMA_LANE_W : 0) + (premOn ? PREM_LANE_W : 0) + (charmOn ? CHARM_LANE_W : 0);
    const plotL = 2, plotR = W - axisW - gammaW, plotW = plotR - plotL, gammaR = plotR + gammaW;
    const lanePremX = plotR + (laneOn ? GAMMA_LANE_W : 0);                              // net-premium lane x-origin
    const laneCharmX = plotR + (laneOn ? GAMMA_LANE_W : 0) + (premOn ? PREM_LANE_W : 0); // charm lane x-origin
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
    // Sub-pixel pan offset (added to every x): the candle layer slides smoothly while dragging between
    // bars; it's the remainder of the fractional bar offset and is 0 except during an active drag.
    const panX = panPx || 0;
    const nowX = plotL + bars * barW + panX; // right edge of the candle zone; nowX..plotR is the projection
    const xOf = (gi: number) => plotL + (gi - start) * barW + barW / 2 + panX;
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
    const pv = priceViewRef.current;
    const sv = scaleViewRef.current;
    // AUTO-fit (priceView null): a ZOOM (bars change) re-fits the range; a pure horizontal PAN (off-only)
    // does NOT — the dead-band holds the displayed range so the viewport slides instead of the candles
    // rescaling vertically (TradingView keeps the price scale steady while you scroll time).
    const viewChanged = !sv || sv.bars !== bars;
    scaleViewRef.current = { bars, off };
    const disp = dispRangeRef.current;
    if (!disp) { dispRangeRef.current = { lo, hi }; }
    else if (pv) { lo = disp.lo; hi = disp.hi; }   // MANUAL: the base range is FROZEN — no auto-fit at all, so a locked scale never moves the candles vertically (under pan, zoom, or new live bars); only an explicit price gesture (offset/factor below) changes Y. This is TradingView's locked-scale behavior 1:1.
    else {
      const dSpan = (disp.hi - disp.lo) || 1, tSpan = (hi - lo) || 1, margin = dSpan * 0.06;
      const bigJump = Math.abs((lo + hi) / 2 - (disp.lo + disp.hi) / 2) > Math.max(tSpan, dSpan) * 0.6;
      const fits = candLo >= disp.lo + margin && candHi <= disp.hi - margin;
      const looseOrTight = (candHi - candLo) < dSpan * 0.42 || tSpan > dSpan * 1.6 || tSpan < dSpan * 0.62;
      if (viewChanged || bigJump || !fits || looseOrTight) { disp.lo = lo; disp.hi = hi; }
      lo = disp.lo; hi = disp.hi;
    }
    // Manual vertical view (2D plot pan, or drag/scroll the price axis): scale the FROZEN base range
    // about its center (factor = squash/stretch) then translate it (offset, in price units = pan). The
    // candles' shape is preserved; the whole scene (overlays + axis labels read lo/hi via geom) moves as one.
    if (pv) { const center = (lo + hi) / 2, half = Math.max(1e-6, ((hi - lo) / 2) * pv.factor); lo = center - half + pv.offset; hi = center + half + pv.offset; }
    const volBandH = showVolume ? priceH * 0.13 : 0, priceAreaH = priceH - volBandH;
    const yP = (p: number) => priceTop + priceAreaH - ((p - lo) / (hi - lo)) * priceAreaH;
    const pOfY = (y: number) => lo + (1 - (y - priceTop) / priceAreaH) * (hi - lo);
    geomRef.current = { plotL, plotR, barW, start, end, n, priceTop, priceAreaH, lo, hi };
    onScale?.(lo, hi);   // publish the live visible price range so the gamma profile flows with the chart

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
    // Cornered, low-opacity brand mark (bottom-left of the price area) — a chart logo must never sit
    // over the candles it's there to display, so it's kept small and out of the price path.
    if (showWatermark) {
      ctx.save();
      const fs = Math.max(11, Math.min(18, plotW / 42));
      ctx.font = `800 ${fs}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const prompt = '>', word = 'slayer_terminal';
      const pW = ctx.measureText(prompt).width, wW = ctx.measureText(word).width;
      const promptGap = fs * 0.06, caretGap = fs * 0.16, caretW = fs * 0.46;
      let x = plotL + 8, wmY = px(priceBottom) - 8;
      ctx.fillStyle = hexA(T.text, 0.05); ctx.fillText(prompt, x, wmY); x += pW + promptGap;    // ">" prompt
      ctx.fillStyle = hexA(T.text, 0.07); ctx.fillText(word, x, wmY); x += wW + caretGap;        // wordmark
      ctx.fillStyle = hexA(T.text, 0.1); ctx.fillRect(x, wmY - fs * 0.72, caretW, fs * 0.82);    // caret block
      ctx.restore(); ctx.font = '11px ui-monospace, monospace';
    }

    // Price-grid density scales with pane height — drag the price axis taller (or scale it)
    // and more price levels appear for finer read accuracy.
    // Denser, TradingView-style price grid: every 5th step is a round-number "major" line — a brighter
    // gridline + a bold, brighter label — so the eye anchors on round prices and the scale reads finer.
    // ~64px between price labels (was ~30) — a clean, TradingView-grade axis instead of a label every
    // few points. niceStep then rounds the gap to a human interval (10 / 25 / 50 …).
    const targetGrid = Math.max(4, Math.min(11, Math.round(priceAreaH / 64)));
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
        const top = [...inRange].sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0)).slice(0, Math.max(gexCount, 14));
        const spot = profile.spot || (candles[n - 1] ? candles[n - 1].close : 0), vspan = (hi - lo) || 1;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const s of top) {
          const y = yP(s.strike), mag = Math.abs(s.netGex || 0) / maxG, pos = (s.netGex || 0) >= 0;
          const col = pos ? mixHex('#1f6f52', '#2fe6a0', mag) : mixHex('#7a3550', '#ff5470', mag);
          const distFade = Math.max(0.12, 1 - Math.abs(s.strike - spot) / (vspan * 0.55));
          // Sharper, sparser landscape — a near-zero floor so only real GEX blooms, steeper curve, capped peak; candles always lead.
          const peak = Math.min(0.5, (0.02 + Math.pow(mag, 1.45) * 0.5) * distFade), bandH = 4 + mag * 40;
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
      // The flip line is the CUMULATIVE zero-gamma crossing (Σγ, SqueezeMetrics convention) — not the
      // per-strike sign. Label the zones with Σγ so a negative individual strike inside the upper zone
      // is not read as a contradiction: the zone describes aggregate dealer positioning, not one strike.
      ctx.font = '700 8.5px ui-monospace, monospace'; ctx.textAlign = 'left';
      if (fy - priceTop > 18) { ctx.fillStyle = hexA(COL.up, 0.62); ctx.fillText('Σγ POSITIVE (CUMULATIVE) · DEALERS NET-LONG · PINNED', plotL + 8, fy - 8); }
      if (priceBottom - fy > 18) { ctx.fillStyle = hexA(COL.down, 0.62); ctx.fillText('Σγ NEGATIVE (CUMULATIVE) · DEALERS NET-SHORT · UNSTABLE', plotL + 8, fy + 13); }
    }

    // Expected-move ±1σ channel — shade the band between EM+ and EM- (dealer-implied day range) and
    // label it, so the space around price reads as "the implied range" rather than empty headroom.
    if (profile.spot && profile.expectedMovePct) {
      const emHi = yP(profile.spot * (1 + profile.expectedMovePct)), emLo = yP(profile.spot * (1 - profile.expectedMovePct));
      const top = Math.max(priceTop, Math.min(emHi, emLo)), h = Math.min(priceBottom, Math.max(emHi, emLo)) - top;
      if (h > 0) {
        const eg = ctx.createLinearGradient(0, top, 0, top + h);
        eg.addColorStop(0, hexA(COL.em, 0.11)); eg.addColorStop(0.5, hexA(COL.em, 0.035)); eg.addColorStop(1, hexA(COL.em, 0.11));
        ctx.fillStyle = eg; ctx.fillRect(plotL, top, plotW, h);
        // In-band caption — only when the band's top clears the top-left status line (otherwise the
        // "Exp Move" tag on the price axis labels it). Prevents "EXPECTED MOVE" colliding with "SPX · 5m".
        if (h > 26 && top > priceTop + 18) { ctx.font = '700 8px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = hexA(COL.em, 0.5); ctx.fillText(`EXPECTED MOVE · ±${(profile.expectedMovePct * 100).toFixed(2)}%`, plotL + 8, top + 9); ctx.font = '11px ui-monospace, monospace'; }
      }
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
        // Edge-snapped to the pixel grid (same rule as the candle bodies) so volume columns line up
        // directly under their candle and never blur or alternate width while scrolling.
        const x = xOf(gi), vL = Math.round(x - barW * 0.34), vR = Math.max(vL + 1, Math.round(x + barW * 0.34));
        ctx.fillRect(vL, Math.round(volBase - vh), vR - vL, Math.max(1, Math.round(vh)));
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
      const maxAbs = Math.max(...inView.map(r => Math.abs(r.netGex || 0)), 1e-9), laneW = GAMMA_LANE_W - 6;
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

    // NET PREMIUM FLOW — the $ option premium that actually TRADED at each strike today (mid × volume),
    // as diverging bars from a centre axis: green right = net CALL premium (bullish $), red left = net PUT
    // premium (bearish $). Distinct from OI-based gamma — this is where real money paid up this session.
    if (premOn) {
      const strikes = profile.strikes || [];
      const x0 = lanePremX, cx = x0 + PREM_LANE_W / 2, half = PREM_LANE_W / 2 - 3;
      ctx.strokeStyle = hexA(T.text, 0.12); ctx.beginPath(); ctx.moveTo(px(cx), priceTop + 9); ctx.lineTo(px(cx), priceBottom); ctx.stroke();
      const inView = strikes.filter(r => { const y = yP(r.strike); return y >= priceTop + 9 && y <= priceBottom && Math.abs(r.netPrem || 0) > 0; });
      const maxAbs = Math.max(...inView.map(r => Math.abs(r.netPrem || 0)), 1e-9);
      let thick = 5;
      if (inView.length > 1) { const ys = inView.map(r => yP(r.strike)); thick = Math.max(2, Math.min(9, ((Math.max(...ys) - Math.min(...ys)) / (inView.length - 1)) * 0.74)); }
      for (const r of inView) {
        const y = yP(r.strike), np = r.netPrem || 0, pos = np >= 0, len = Math.max(1, (Math.abs(np) / maxAbs) * half), col = pos ? COL.up : COL.down;
        const grad = ctx.createLinearGradient(cx, 0, cx + (pos ? len : -len), 0);
        grad.addColorStop(0, hexA(col, 0.9)); grad.addColorStop(1, hexA(col, 0.22));
        ctx.fillStyle = grad; ctx.fillRect(pos ? cx : cx - len, y - thick / 2, len, Math.max(1.5, thick));
      }
      ctx.fillStyle = hexA(T.text, 0.42); ctx.textAlign = 'center'; ctx.font = '700 7px ui-monospace, monospace'; ctx.fillText('$ FLOW', cx, priceTop + 6); ctx.textAlign = 'left'; ctx.font = '11px ui-monospace, monospace';
    }

    // CHARM SURFACE — per-strike charm (dealer Δ-decay) Gaussian-smoothed across price into a continuous
    // right-gutter heat column. Cyan = decay adds passive BUY support at that level, amber = decay adds SELL
    // pressure; brightest near the money / into expiry where charm is largest. (charmEx = charm×OI×100×sign.)
    if (charmOn) {
      const strikes = profile.strikes || [];
      const x0 = laneCharmX, laneW = CHARM_LANE_W - 2;
      const pts = strikes.map(s => ({ y: yP(s.strike), v: s.charmEx || 0 })).filter(p => Math.abs(p.v) > 0 && p.y >= priceTop - 30 && p.y <= priceBottom + 30);
      if (pts.length) {
        const ys = pts.map(p => p.y).sort((a, b) => a - b);
        let med = 14; if (ys.length > 1) { const g: number[] = []; for (let i = 1; i < ys.length; i++) g.push(ys[i] - ys[i - 1]); g.sort((a, b) => a - b); med = Math.max(8, g[g.length >> 1] || 14); }
        // Cyan/amber via the theme's info/warning tokens — the same supportive/pressuring polarity the
        // regime wash uses, so charm reads in the platform's vocabulary (and adapts to the active theme).
        const bw = med * 1.5, CHARM_POS = COL.em, CHARM_NEG = COL.flip, step = 2;
        const rows: { y: number; v: number }[] = []; let maxRow = 1e-9;
        for (let y = priceTop + 9; y <= priceBottom; y += step) { let v = 0; for (const p of pts) { const d = (y - p.y) / bw; v += p.v * Math.exp(-d * d); } rows.push({ y, v }); if (Math.abs(v) > maxRow) maxRow = Math.abs(v); }
        ctx.strokeStyle = hexA(T.text, 0.10); ctx.beginPath(); ctx.moveTo(px(x0), priceTop); ctx.lineTo(px(x0), priceBottom); ctx.stroke();
        for (const { y, v } of rows) { const mag = Math.abs(v) / maxRow; if (mag < 0.02) continue; ctx.fillStyle = hexA(v >= 0 ? CHARM_POS : CHARM_NEG, 0.08 + mag * 0.62); ctx.fillRect(x0 + 1, y - step / 2, laneW, step + 0.6); }
        ctx.fillStyle = hexA(T.text, 0.5); ctx.textAlign = 'center'; ctx.font = '700 6.5px ui-monospace, monospace'; ctx.fillText('CHARM', x0 + laneW / 2, priceTop + 5); ctx.textAlign = 'left'; ctx.font = '11px ui-monospace, monospace';
      }
    }

    // VOLUME PROFILE (VPVR) — volume-by-price histogram, LEFT-anchored inside the plot so it never
    // competes with the right price axis / Exposure Ladder. Opt-in. POC line = the highest-volume price.
    if (showVolProfile && vis.length) {
      const bins = Math.max(18, Math.min(80, Math.round((priceBottom - priceTop) / 7)));
      const range = (hi - lo) || 1;
      const vol = new Float64Array(bins), upVol = new Float64Array(bins);
      for (const c of vis) {
        const v = c.volume || 0; if (v <= 0) continue;
        const cl = Math.max(lo, Math.min(hi, c.low)), ch = Math.max(lo, Math.min(hi, c.high));
        const b0 = Math.max(0, Math.min(bins - 1, Math.floor(((cl - lo) / range) * bins)));
        const b1 = Math.max(0, Math.min(bins - 1, Math.floor(((ch - lo) / range) * bins)));
        const per = v / (b1 - b0 + 1), up = c.close >= c.open;
        for (let b = b0; b <= b1; b++) { vol[b] += per; if (up) upVol[b] += per; }
      }
      let maxV = 0, pocBin = 0; for (let b = 0; b < bins; b++) if (vol[b] > maxV) { maxV = vol[b]; pocBin = b; }
      if (maxV > 0) {
        const vpW = Math.min(plotW * 0.22, 150);
        for (let b = 0; b < bins; b++) {
          if (vol[b] <= 0) continue;
          const w = (vol[b] / maxV) * vpW, frac = upVol[b] / vol[b], isPoc = b === pocBin;
          const col = frac >= 0.5 ? COL.up : COL.down;
          const yA = yP(lo + ((b + 1) / bins) * range), yB = yP(lo + (b / bins) * range);
          ctx.fillStyle = hexA(col, isPoc ? 0.32 : 0.09 + 0.13 * (vol[b] / maxV));
          ctx.fillRect(plotL, Math.min(yA, yB), w, Math.max(1, Math.abs(yB - yA) - 0.5));
        }
        const pocPrice = lo + ((pocBin + 0.5) / bins) * range, pocY = yP(pocPrice);
        ctx.strokeStyle = hexA(COL.flip, 0.65); ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(plotL, px(pocY) - 0.5); ctx.lineTo(plotR, px(pocY) - 0.5); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '700 8px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = hexA(COL.flip, 0.85);
        ctx.fillText('POC ' + nf(pocPrice), plotL + 4, pocY - 6); ctx.font = '11px ui-monospace, monospace';
      }
    }

    // PRIOR-DAY CLOSE — yesterday's settlement; a classic intraday reaction level. Behind candles, left-tagged
    // (never on the right axis, so it can't recreate the double-column it would otherwise add).
    if (showPrevClose && n > 1) {
      const lastTs = candles[n - 1].timestamp; let prevClose: number | null = null;
      for (let gi = n - 1; gi > 0; gi--) { if (!sameDay(candles[gi].timestamp, lastTs)) { prevClose = candles[gi].close; break; } }
      if (prevClose != null) {
        const y = yP(prevClose);
        if (y >= priceTop && y <= priceBottom) {
          ctx.strokeStyle = hexA(T.dim, 0.5); ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(plotL, px(y) - 0.5); ctx.lineTo(plotR, px(y) - 0.5); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = '700 8px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = hexA(T.dim, 0.75);
          ctx.fillText('PDC ' + nfT(prevClose), plotL + 8, y - 5); ctx.font = '11px ui-monospace, monospace';
        }
      }
    }

    // SESSION VWAP + σ BANDS — volume-weighted average price, re-anchored each session, with ±1σ/±2σ
    // envelopes. The institutional fair-value line: intraday price pivots around it, and a decisive break
    // of the outer band is a momentum tell. Re-anchors each day so it never smears across sessions. Drawn
    // behind candles so wicks/bodies stay on top.
    if (showVwap && vwap && vwap.line.length === n) {
      const vwapCol = mixHex(T.info, T.accent, 0.5);
      // Visible index ranges split at session resets (VWAP jumps each new day → don't connect the gap).
      const ranges: [number, number][] = [];
      let s0 = -1;
      for (let i = 0; i < vis.length; i++) {
        const gi = start + i;
        const reset = i === 0 || (gi > 0 && !sameDay(candles[gi - 1].timestamp, candles[gi].timestamp));
        if (reset) { if (s0 >= 0) ranges.push([s0, gi - 1]); s0 = gi; }
      }
      if (s0 >= 0) ranges.push([s0, start + vis.length - 1]);
      const band = (hiA: (number | null)[], loA: (number | null)[], a: number) => {
        ctx.fillStyle = hexA(vwapCol, a);
        for (const [a0, a1] of ranges) {
          if (a1 <= a0) continue;
          ctx.beginPath();
          for (let gi = a0; gi <= a1; gi++) { const v = hiA[gi]; if (v == null) continue; const x = xOf(gi), y = yP(v); gi === a0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          for (let gi = a1; gi >= a0; gi--) { const v = loA[gi]; if (v == null) continue; ctx.lineTo(xOf(gi), yP(v)); }
          ctx.closePath(); ctx.fill();
        }
      };
      // Subtle filled envelopes (TradingView-style: faint fill, clean SOLID edge lines — no dashes).
      band(vwap.u2, vwap.d2, 0.045);
      band(vwap.u1, vwap.d1, 0.08);
      const edge = (arr: (number | null)[], a: number) => {
        ctx.strokeStyle = hexA(vwapCol, a); ctx.lineWidth = 1; ctx.beginPath();
        for (const [a0, a1] of ranges) { let st = false; for (let gi = a0; gi <= a1; gi++) { const v = arr[gi]; if (v == null) continue; const x = xOf(gi), y = yP(v); st ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), st = true); } }
        ctx.stroke();
      };
      edge(vwap.u2, 0.14); edge(vwap.d2, 0.14); edge(vwap.u1, 0.22); edge(vwap.d1, 0.22);
      // Main VWAP — one clean solid line, the institutional fair value (TradingView's default look).
      ctx.strokeStyle = hexA(vwapCol, 0.95); ctx.lineWidth = 1.6;
      for (const [a0, a1] of ranges) {
        ctx.beginPath(); let started = false;
        for (let gi = a0; gi <= a1; gi++) { const v = vwap.line[gi]; if (v == null) continue; const x = xOf(gi), y = yP(v); started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), started = true); }
        ctx.stroke();
      }
      // Right-edge value tag (like TradingView) at the line's latest point.
      const lastRange = ranges[ranges.length - 1];
      if (lastRange) {
        let gi = lastRange[1]; while (gi >= lastRange[0] && vwap.line[gi] == null) gi--;
        const lv = gi >= lastRange[0] ? vwap.line[gi] : null;
        if (lv != null) {
          const ly = yP(lv); ctx.font = '700 9px ui-monospace, monospace';
          const label = `VWAP ${nf(lv)}`, lw = ctx.measureText(label).width + 10, lx = Math.min(xOf(gi) + 6, plotR - lw);
          ctx.fillStyle = hexA(vwapCol, 0.92); (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(lx, ly - 8, lw, 15, 3), ctx.fill()) : ctx.fillRect(lx, ly - 8, lw, 15);
          ctx.fillStyle = contrastInk(vwapCol); ctx.textAlign = 'left'; ctx.fillText(label, lx + 5, ly); ctx.font = '11px ui-monospace, monospace';
        }
      }
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
        // Body edges are EACH snapped to the pixel grid (not center+width rounded independently): the width
        // absorbs the sub-pixel remainder, so the GAP between adjacent candles stays visually constant at
        // every zoom — no alternating 1px gaps, no shimmer while scrolling. (TradingView-style crispness.)
        const yO = yP(c.open), yC = yP(c.close), bw = Math.max(1, barW * 0.62);
        const bxL = Math.round(x - bw / 2), bxR = Math.max(bxL + 1, Math.round(x + bw / 2)), w = bxR - bxL;
        const wx = px((bxL + bxR) / 2);   // wick centered on the ROUNDED body + half-pixel snapped → crisp 1px line
        // wick first (sits behind the body)
        ctx.strokeStyle = wickCol; ctx.lineWidth = wickW;
        ctx.beginPath(); ctx.moveTo(wx, Math.round(yP(c.high))); ctx.lineTo(wx, Math.round(yP(c.low))); ctx.stroke();
        const by = Math.round(Math.min(yO, yC)), bh = Math.max(1, Math.round(Math.abs(yC - yO)));
        if (chartType === 'hollow' && up) { ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.strokeRect(bxL + 0.5, by + 0.5, w - 1, Math.max(1, bh - 1)); }
        else { ctx.fillStyle = col; ctx.fillRect(bxL, by, w, bh); if (w >= 3 && bh >= 3) { ctx.fillStyle = shade(col, 1.34); ctx.fillRect(bxL, by, w, 1); } if (border) { ctx.strokeStyle = shade(col, 0.72); ctx.lineWidth = 1; ctx.strokeRect(bxL + 0.5, by + 0.5, w - 1, Math.max(1, bh - 1)); } }
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
        ctx.fillStyle = contrastInk(d.color); ctx.textAlign = 'left'; ctx.font = '700 10px ui-monospace, monospace'; ctx.fillText(nf(d.price), plotR + 6, y); ctx.font = '11px ui-monospace, monospace';
        if (sel) { ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(plotL + 7, y, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(plotR - 7, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
      } else if (d.kind === 'rect') {
        // Zone box (supply/demand / dealer band) — faint fill + framed outline, anchored to time+price.
        const x1 = xOfT(d.a.t), y1 = yP(d.a.price), x2 = xOfT(d.b.t), y2 = yP(d.b.price);
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        ctx.fillStyle = hexA(d.color, sel ? 0.16 : 0.10); ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = d.color; ctx.strokeRect(px(rx), px(ry), Math.max(1, rw), Math.max(1, rh));   // px() already half-pixel-snaps for a crisp 1px stroke
        if (sel) { ctx.fillStyle = d.color; for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) { ctx.beginPath(); ctx.arc(hx, hy, 3.4, 0, Math.PI * 2); ctx.fill(); } }
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
    } else if (draft && hov && toolRef.current === 'rect') {
      const dx = xOfT(draft.t), dy = yP(draft.price);
      ctx.strokeStyle = hexA(T.accent, 0.85); ctx.fillStyle = hexA(T.accent, 0.1); ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      ctx.fillRect(Math.min(dx, hov.x), Math.min(dy, hov.y), Math.abs(hov.x - dx), Math.abs(hov.y - dy));
      ctx.strokeRect(Math.min(dx, hov.x), Math.min(dy, hov.y), Math.abs(hov.x - dx), Math.abs(hov.y - dy)); ctx.setLineDash([]); ctx.lineWidth = 1;
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
      ctx.fillStyle = contrastInk(mc); ctx.textAlign = 'center'; ctx.fillText(label, lx, ly); ctx.font = '11px ui-monospace, monospace';
    }

    // Dealer levels — retail-friendly NAMED lines that flow with the chart. Each key level draws a
    // clean colored line at its true price plus a floating name tag at the right edge; when tags
    // crowd near spot they stack and draw a connector back to the line, so a label never floats free.
    const last = candles[n - 1].close, lastUp = candles[n - 1].close >= candles[n - 1].open, lastY = yP(last);
    const tagH = 15;
    const NAMES: Record<string, string> = { CW: 'Call Wall', PW: 'Put Wall', 'γF': 'Gamma Flip', MAG: 'Magnet', 'EM+': 'Exp Move ↑', 'EM-': 'Exp Move ↓', MP: 'Max Pain' };
    const lvls: { price: number; color: string; label: string; gex?: number; value?: string; conf?: boolean }[] = [];
    const pushLvl = (price: any, color: string, label: string, gex?: number, value?: string, conf?: boolean) => { if (typeof price === 'number' && price > 0) lvls.push({ price, color, label, gex, value, conf }); };
    const gexAt = (price: any): number => { const ss = profile.strikes; if (typeof price !== 'number' || !ss || !ss.length) return 0; let best = 0, bd = Infinity; for (const s of ss) { const d = Math.abs(s.strike - price); if (d < bd) { bd = d; best = s.netGex || 0; } } return bd <= price * 0.0015 ? best : 0; };
    pushLvl(profile.callWall, COL.callWall, 'CW', Math.abs(gexAt(profile.callWall)), undefined, profile.wallsConfident !== false); pushLvl(profile.putWall, COL.putWall, 'PW', Math.abs(gexAt(profile.putWall)), undefined, profile.wallsConfident !== false);
    pushLvl(profile.gammaFlip, COL.flip, 'γF', undefined, undefined, profile.gammaFlipConfident !== false); pushLvl(profile.magnet, COL.magnet, 'MAG', Math.abs(gexAt(profile.magnet)));
    if (profile.spot && profile.expectedMovePct) { pushLvl(profile.spot * (1 + profile.expectedMovePct), COL.em, 'EM+'); pushLvl(profile.spot * (1 - profile.expectedMovePct), COL.em, 'EM-'); }
    // Max Pain — the settlement strike that minimizes total ITM payout to option holders (a classic expiry
    // magnet, distinct from the gamma magnet — they often disagree). Computed from per-strike OI; opt-in.
    if (showMaxPain && profile.strikes && profile.strikes.length > 2) {
      let mp = NaN, best = Infinity;
      for (const k of profile.strikes) {
        let pain = 0;
        for (const s of profile.strikes) { if (k.strike > s.strike) pain += (s.callOi || 0) * (k.strike - s.strike); else if (k.strike < s.strike) pain += (s.putOi || 0) * (s.strike - k.strike); }
        if (pain < best) { best = pain; mp = k.strike; }
      }
      if (!isNaN(mp)) pushLvl(mp, mixHex(T.warning, T.accent, 0.55), 'MP');
    }
    // Loaded GEX Strikes — the actual top gamma strikes around price (with their $ values + size-weighted
    // lines), so the dealer positioning BEHIND the walls is visible, not just the walls themselves.
    if (showLadder && profile.strikes && profile.strikes.length) {
      const named = [profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet].filter((x): x is number => typeof x === 'number');
      // The chart is the structural SUMMARY, not the full per-strike table — that's the Exposure Ladder's
      // job, and labeling all ~20 strikes here just duplicates it. The 4 named levels (walls/flip/magnet)
      // are drawn separately; here we add only the strongest gamma strike(s) on EACH side of price, so the
      // two surfaces don't compete. "Strikes shown" (gexCount) scales how many per side for power users.
      const perSide = Math.max(1, Math.min(3, Math.round(gexCount / 2)));   // cap on-chart strikes — the full per-strike table lives in the Exposure Ladder; the chart shows only the strongest few so structure stays readable
      const byMag = (a: typeof profile.strikes[number], b: typeof profile.strikes[number]) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0);
      const eligible = profile.strikes.filter(s => Math.abs(s.netGex || 0) > 0 && !named.some(nm => Math.abs(nm - s.strike) < 1e-6));
      const above = eligible.filter(s => s.strike > last && s.strike <= hi).sort(byMag).slice(0, perSide);
      const below = eligible.filter(s => s.strike < last && s.strike >= lo).sort(byMag).slice(0, perSide);
      [...above, ...below].forEach(s => { const g = s.netGex || 0; pushLvl(s.strike, g >= 0 ? COL.up : COL.down, 'GEX', Math.abs(g), `${nf(s.strike)}  ${fmtGex(g)}`); });
    }
    const maxLoadedGex = Math.max(...lvls.filter(L => L.value).map(L => L.gex || 0), 1e-9);
    // ΔGEX vs a rolling ~45s checkpoint — lets each loaded strike show how its net γ is building (↑) or bleeding (↓).
    const gd = gexDeltaRef.current, nowMs = Date.now();
    if (gd.ts === 0 || nowMs - gd.ts > 45000 || gd.tick !== (tickKey || '')) {
      gd.base = new Map((profile.strikes || []).map(s => [s.strike, s.netGex || 0])); gd.ts = nowMs; gd.tick = tickKey || '';
    }
    const gexDeltaAt = (price: number): number => { const ss = profile.strikes; if (!ss) return 0; let best = ss[0], bd = Infinity; for (const s of ss) { const d = Math.abs(s.strike - price); if (d < bd) { bd = d; best = s; } } if (bd > price * 0.0015) return 0; const b = gd.base.get(best.strike); return b == null ? 0 : (best.netGex || 0) - b; };
    // The loaded strike nearest the current price gets a static "active" emphasis (no pulse → no jitter).
    let activeStrike = NaN; { let bd = Infinity; for (const L of lvls) if (L.value && Math.abs(L.price - last) < bd) { bd = Math.abs(L.price - last); activeStrike = L.price; } }
    const placed = lvls.map(L => { const rawY = yP(L.price); const off2 = L.price < lo || L.price > hi; return { ...L, rawY, off: off2, dir: off2 ? (L.price > hi ? -1 : 1) : 0, y: Math.max(priceTop + tagH / 2, Math.min(priceBottom - tagH / 2, rawY)) }; });
    // Declutter the right-edge label column: relax the on-chart tags apart AND away from the live-price
    // badge (a pinned, immovable obstacle), so a label never piles onto the spot price or another tag.
    // Force-relaxation pushes BOTH directions (tags above spot float up, tags below float down) instead
    // of the old single downward cascade that stacked everything under spot.
    {
      const slot = tagH + 3, lo2 = priceTop + tagH / 2, hi2 = priceBottom - tagH / 2;
      const nodes: { y: number; h: number; pin: boolean; L?: (typeof placed)[number] }[] = placed.filter(L => !L.off).map(L => ({ y: L.y, h: slot, pin: false, L }));
      if (lastY >= priceTop && lastY <= priceBottom) nodes.push({ y: lastY, h: tagH + 7, pin: true });   // the spot price badge is a fixed obstacle
      nodes.sort((a, b) => a.y - b.y);
      for (let pass = 0; pass < 7; pass++) {
        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i], b = nodes[i + 1], need = (a.h + b.h) / 2 - (b.y - a.y);
          if (need > 0.3) { if (a.pin) b.y += need; else if (b.pin) a.y -= need; else { a.y -= need / 2; b.y += need / 2; } }
        }
        for (const nd of nodes) if (!nd.pin) nd.y = Math.max(lo2, Math.min(hi2, nd.y));
      }
      for (const nd of nodes) if (nd.L) nd.L.y = nd.y;
    }
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
    // Loaded-strike tag hitboxes — captured during layout, consumed by the overlay's renderHover so the
    // tooltip tracks the LIVE cursor without repainting the candle layer (the crosshair lives on the overlay).
    const tagHits: { L: (typeof placed)[number]; tagL: number; tagR: number; ty: number }[] = [];
    for (const L of placed) {
      const name = NAMES[L.label] || L.label, isWall = L.label === 'CW' || L.label === 'PW';
      const isStrike = !!L.value;                       // a loaded per-strike GEX level → right-edge marker, NOT a full-width line
      const estd = !L.value && L.conf === false;        // estimated (low-confidence) named level → render tentative + tag it
      const lrel = isStrike ? Math.min(1, (L.gex || 0) / maxLoadedGex) : 0;
      const isTop = !!(isStrike && (L.gex || 0) === maxLoadedGex);
      const act = !!(isStrike && L.price === activeStrike);
      // Calm 2-colour scheme: named levels keep their semantic hue (green call-side, red put-side, amber
      // flip, accent magnet); strikes are simply green (call) / red (put) with STRENGTH shown by opacity +
      // a magnitude bar, not a rainbow of hues. Structural hierarchy: P1 walls+flip crisp & glow; P2
      // magnet/max-pain thin & dashed; EM± faint dotted (the shaded band already carries the zone).
      const col = L.color;
      const p1 = !isStrike && (L.label === 'CW' || L.label === 'PW' || L.label === 'γF');
      const p2 = !isStrike && (L.label === 'MAG' || L.label === 'MP');
      const isEM = L.label === 'EM+' || L.label === 'EM-';
      if (!L.off) {
        if (isStrike) {
          // Right-edge marker only — a short tick on the strike's true price (the Γ-MAP heatmap glow already
          // shows it across the chart). Keeps the candle area clean: structure owns the full-width lines.
          ctx.strokeStyle = hexA(col, act ? 0.95 : 0.3 + lrel * 0.5); ctx.lineWidth = act ? 2.2 : 1 + lrel * 1.6;
          ctx.beginPath(); ctx.moveTo(plotR - (12 + lrel * 22), px(L.rawY) - 0.5); ctx.lineTo(plotR, px(L.rawY) - 0.5); ctx.stroke(); ctx.lineWidth = 1;
        } else {
          // Structural full-width line, tiered so the eye ranks them instantly.
          ctx.strokeStyle = col; ctx.globalAlpha = (p1 ? 0.82 : p2 ? 0.4 : 0.24) * (estd ? 0.6 : 1); ctx.lineWidth = p1 ? 1.6 : 1;
          ctx.setLineDash(estd ? [3, 5] : p1 ? (L.label === 'γF' ? [6, 4] : []) : isEM ? [1, 4] : [5, 5]);
          ctx.beginPath(); ctx.moveTo(plotL, px(L.rawY) - 0.5); ctx.lineTo(plotR, px(L.rawY) - 0.5);
          if (p1 && !estd) { ctx.save(); ctx.shadowColor = hexA(col, 0.5); ctx.shadowBlur = 7; ctx.stroke(); ctx.restore(); } else ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
        }
      }
      // Forward projection: extend ONLY the structural walls/flip into the future zone (strikes + EM stay plain).
      if (!L.off && !isStrike && p1 && projBars) {
        const gy = px(L.rawY) - 0.5, grad = ctx.createLinearGradient(nowX, 0, plotR, 0);
        grad.addColorStop(0, hexA(col, 0)); grad.addColorStop(1, hexA(col, 0.16));
        ctx.fillStyle = grad; ctx.fillRect(nowX, px(L.rawY) - 4, plotR - nowX, 8);
        ctx.strokeStyle = hexA(col, 0.88); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(nowX, gy); ctx.lineTo(plotR, gy); ctx.stroke(); ctx.lineWidth = 1;
      }
      // Name + (for walls/magnet) the gamma-concentration %, so you read strength at a glance.
      const pct = (isWall || L.label === 'MAG') ? gexPctAt(L.price) : null;
      const nameLbl = (L.off ? (L.dir < 0 ? '↑ ' : '↓ ') : '') + (L.value || name) + (estd ? ' ~est' : ''), pctLbl = pct != null ? `  ${pct}%` : '';
      // ΔGEX beside the value (#1): how this strike's net γ has moved since the ~45s checkpoint (↑ building / ↓ bleeding).
      let deltaLbl = '', deltaUp = true;
      if (isStrike) { const dv = gexDeltaAt(L.price); if (Math.abs(dv) >= 1e6) { deltaUp = dv >= 0; deltaLbl = `  ${deltaUp ? '↑' : '↓'}${fmtGex(Math.abs(dv)).replace(/^\+/, '')}`; } }
      ctx.font = '700 10px ui-monospace, monospace'; // uniform tag text — importance reads from line weight/colour, not font size
      const nameW = ctx.measureText(nameLbl).width, pctW = pctLbl ? ctx.measureText(pctLbl).width : 0, deltaW = deltaLbl ? ctx.measureText(deltaLbl).width : 0;
      const tagW = nameW + pctW + deltaW + 17, tagR = plotR - 4, tagL = tagR - tagW, ty = L.off ? (L.dir < 0 ? priceTop + tagH / 2 + 2 : priceBottom - tagH / 2 - 2) : L.y;
      tagHits.push({ L, tagL, tagR, ty });
      // connector from the line/marker right end back to the tag whenever the tag was nudged off its price
      if (!L.off && Math.abs(L.y - L.rawY) > 1) { ctx.strokeStyle = hexA(col, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(plotR - 3, px(L.rawY) - 0.5); ctx.lineTo(tagR - 2, px(ty) - 0.5); ctx.stroke(); }
      rr(tagL, ty - tagH / 2, tagW, tagH, 3);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1; ctx.fillStyle = 'rgba(9,12,17,0.92)'; ctx.fill(); ctx.restore();
      ctx.strokeStyle = hexA(col, isStrike ? (isTop ? 0.9 : 0.4 + lrel * 0.45) : (p1 ? 0.9 : 0.5)); ctx.lineWidth = (isTop || p1) ? 1.2 : 1; ctx.stroke(); ctx.lineWidth = 1;
      // Magnitude bar (#3): faint colour fill from the left, width ∝ this strike's share of peak GEX — bars read faster than numbers.
      if (isStrike && lrel > 0) { rr(tagL + 1, ty - tagH / 2 + 1, (tagW - 2) * Math.max(0.05, lrel), tagH - 2, 2.5); ctx.fillStyle = hexA(col, 0.16); ctx.fill(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(tagL + 7, ty, 2.4, 0, Math.PI * 2); ctx.fill();
      // Text: named levels in their hue (≤6 of them → semantic & legible); strikes in calm light ink so they
      // recede behind the structure (colour is carried by the dot + magnitude bar).
      ctx.textAlign = 'left'; ctx.fillStyle = isStrike ? hexA(T.text, 0.9) : hexA(col, 0.95); ctx.fillText(nameLbl, tagL + 12, ty);
      if (pctLbl) { ctx.fillStyle = hexA(T.text, 0.66); ctx.fillText(pctLbl, tagL + 12 + nameW, ty); }
      if (deltaLbl) { ctx.fillStyle = deltaUp ? COL.up : COL.down; ctx.fillText(deltaLbl, tagL + 12 + nameW + pctW, ty); }
      // named levels print their exact price on the axis at the SAME size as the gridline scale (uniform)
      if (!isStrike) { ctx.textAlign = 'right'; ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = hexA(col, 0.95); ctx.fillText(nf(L.price), W - 3, ty); }
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
      ctx.fillStyle = contrastInk(lc); ctx.fillText(nf(last), priceX + 6, lastY); ctx.font = '11px ui-monospace, monospace';
      // Publish last-price geometry to the dedicated OVERLAY layer, which paints the live pulse — so live
      // pulsing repaints only the lightweight overlay canvas, never the candle layer. (Layered-canvas Phase 1)
      if (liveOverlayRef) liveOverlayRef.current = { plotR, lastY, up: lastUp, upCol, downCol };
    } else if (liveOverlayRef) {
      liveOverlayRef.current = null;   // last price scrolled off-screen → overlay clears the dot, no ghost
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

    // GAMMA MIGRATION COMET — the gamma center-of-mass (Σ strike·|netGex| / Σ|netGex|) drifting over recent
    // updates. Bright head at the current CoM, fading ghosts trailing its recent path. Rising = dealer gamma
    // concentrating higher (supportive drift); falling = the reverse. A right-edge HUD widget, on top of price.
    if (showMigration && gammaCoM != null && comHist && comHist.length >= 2) {
      const headY = yP(gammaCoM);
      if (headY >= priceTop + 4 && headY <= priceBottom - 4) {
        const N = Math.min(comHist.length, 14), slice = comHist.slice(comHist.length - N);
        const xR = plotR - 12, dx = 6, drift = slice[N - 1] - slice[0];
        const dCol = drift > 0.02 ? COL.up : drift < -0.02 ? COL.down : T.dim;
        // connecting thread through the recent path
        ctx.strokeStyle = hexA(dCol, 0.28); ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < N; i++) { const x = xR - (N - 1 - i) * dx, y = yP(slice[i]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        // fading ghost dots (oldest faintest)
        for (let i = 0; i < N; i++) { const x = xR - (N - 1 - i) * dx, y = yP(slice[i]); ctx.fillStyle = hexA(dCol, 0.10 + 0.5 * (i / (N - 1))); ctx.beginPath(); ctx.arc(x, y, 1 + 1.5 * (i / (N - 1)), 0, Math.PI * 2); ctx.fill(); }
        // bright head + drift chevron (points the direction of drift)
        ctx.fillStyle = hexA(dCol, 0.97); ctx.beginPath(); ctx.arc(xR, headY, 3, 0, Math.PI * 2); ctx.fill();
        const ar = drift > 0 ? -1 : 1;
        ctx.strokeStyle = hexA(dCol, 0.9); ctx.lineWidth = 1.4; ctx.beginPath();
        ctx.moveTo(xR - 2.6, headY + ar * 5); ctx.lineTo(xR, headY + ar * 9); ctx.lineTo(xR + 2.6, headY + ar * 5); ctx.stroke(); ctx.lineWidth = 1;
        // label, placed opposite the chevron so they never overlap
        ctx.font = '700 7.5px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.fillStyle = hexA(dCol, 0.82);
        ctx.fillText('γ-CoM', xR + 4, headY + (drift > 0 ? 13 : -10)); ctx.font = '11px ui-monospace, monospace';
      }
    }

    // DEALER EXPOSURE HUD — aggregate net Δ (DEX) and Vanna across the whole chain, always-on (the hover
    // tooltip shows these per-strike; this is the global picture). Each row: label, a centered tilt gauge
    // (how net-long/short dealers are = net ÷ gross), and the signed total. Top-left, under the legend.
    if (showExposure && profile.strikes && profile.strikes.length) {
      let netD = 0, grossD = 0, netV = 0, grossV = 0;
      for (const s of profile.strikes) {
        const dx = s.netDex != null ? s.netDex : (s.callDex || 0) + (s.putDex || 0);
        const vx = s.netVex != null ? s.netVex : (s.callVex || 0) + (s.putVex || 0);
        netD += dx; grossD += Math.abs(dx); netV += vx; grossV += Math.abs(vx);
      }
      const rowsX: { lbl: string; net: number; tilt: number }[] = [];
      if (grossD > 0) rowsX.push({ lbl: 'DEALER Δ', net: netD, tilt: Math.max(-1, Math.min(1, netD / grossD)) });
      if (grossV > 0) rowsX.push({ lbl: 'VANNA', net: netV, tilt: Math.max(-1, Math.min(1, netV / grossV)) });
      let ey = priceTop + 26;
      const gaugeW = 46, gx = plotL + 8, tx = gx + 46;
      for (const r of rowsX) {
        const col = r.net >= 0 ? COL.up : COL.down;
        ctx.font = '700 8px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = hexA(T.text, 0.6); ctx.fillText(r.lbl, gx, ey);
        ctx.fillStyle = hexA(T.text, 0.12); ctx.fillRect(tx, ey - 3, gaugeW, 4);                       // track
        ctx.fillStyle = hexA(T.text, 0.28); ctx.fillRect(tx + gaugeW / 2 - 0.5, ey - 4.5, 1, 7);        // zero tick
        const fillW = (gaugeW / 2) * Math.abs(r.tilt);
        ctx.fillStyle = hexA(col, 0.9);
        if (r.tilt >= 0) ctx.fillRect(tx + gaugeW / 2, ey - 3, fillW, 4); else ctx.fillRect(tx + gaugeW / 2 - fillW, ey - 3, fillW, 4);
        ctx.fillStyle = col; ctx.fillText(fmtGex(r.net), tx + gaugeW + 6, ey);
        ey += 13;
      }
      ctx.font = '11px ui-monospace, monospace';
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

    // Symbol legend (top-left) — always painted on the base layer; on hover the overlay's OHLC box covers it.
    {
      ctx.textAlign = 'left'; ctx.font = '11px ui-monospace, monospace';
      const segs: { t: string; c: string }[] = [];
      const dC = n > 1 ? candles[n - 1].close - candles[n - 2].close : 0, dPct = n > 1 && candles[n - 2].close ? (dC / candles[n - 2].close) * 100 : 0;
      segs.push({ t: `${tickKey || ''}${tfKey ? ' · ' + tfKey : ''}`, c: T.text });
      segs.push({ t: `${nf(last)}  ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%`, c: lastUp ? COL.up : COL.down });
      for (const d of OVERLAY_DEFS) { if (!ovOn[d.key] || !overlaySeries[d.key]) continue; const v = overlaySeries[d.key][0]?.vals[n - 1]; if (v != null) segs.push({ t: `${d.label} ${nf(v as number)}`, c: overlaySeries[d.key][0].color }); }
      let lx = plotL + 8; const ly = priceTop + 11;
      for (const sg of segs) { ctx.fillStyle = sg.c; ctx.fillText(sg.t, lx, ly); lx += ctx.measureText(sg.t).width + 16; }
    }
    // Crosshair / axis bubbles / OHLC / dealer-context / loaded-strike tooltip — drawn on the OVERLAY (not
    // here) so moving the cursor never repaints the candle/heatmap layer. drawChart stores this closure;
    // SlayerChart's overlay rAF calls it with the overlay ctx + the live hover point. (Layered-canvas 1b)
    const renderHover = (octx: CanvasRenderingContext2D, hv: { x: number; y: number }) => {
      const ctx = octx;
      let hoverTag: (typeof placed)[number] | null = null;
      for (const h of tagHits) { if (hv.x >= h.tagL - 3 && hv.x <= h.tagR + 6 && Math.abs(hv.y - h.ty) <= tagH / 2 + 2) { hoverTag = h.L; break; } }
      if (!(hv.x >= plotL && hv.x <= plotR)) return;
      // rr bound to the OVERLAY ctx — the outer rr closes over the BASE ctx, so using it here would paint
      // the tooltip box onto the candle layer (invisible / cleared on the next base draw). Shadow fixes it.
      const rr = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
      const gi = Math.max(start, Math.min(Math.min(end - 1, n - 1), start + Math.round((hv.x - plotL - barW / 2 - panX) / barW)));
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
            const lbl = `${nf(ns.strike)} · ${fmtGex(g)}γ${tag}`;
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
    };
    if (geomRef.current) (geomRef.current as any).renderHover = renderHover;
}
