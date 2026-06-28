import * as TI from '../../lib/indicators';
import type { Candle, GexProfileData } from '../../types';
import { OVERLAY_DEFS, PANE_DEFS, type Series, type PaneData } from './indicators';
import type { ChartType, DrawTool, Anchor, Drawing } from './drawing';
import { shade, HEAT_POS, HEAT_NEG, fmtGex, mixHex, hexA, DEFAULT_COLORS, readTheme, niceStep, fmtTime, sameDay, px, fmtOsc, idxOfTime } from './format';

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
  tickKey: string; tfKey: string;
  onScale?: (lo: number, hi: number) => void;   // report the live visible price range (drives the price-aligned gamma profile)
};

export function drawChart(deps: DrawDeps) {
  const {
    canvasRef, containerRef, viewRef, priceViewRef, geomRef, dispRangeRef, scaleViewRef, themeRef,
    hoverRef, gexDeltaRef, draftRef, measureRef, drawingsRef, toolRef, selectedRef,
    candles, ha, atr, profile, colors, decimals, chartType, ovOn, overlaySeries, paneSeries,
    displacements, gexCount, showVolume, showGrid, showWatermark, candleBorders,
    showGex, showHeat, showOrbs, showDisp, showLadder, tickKey, tfKey, onScale,
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
        const top = [...inRange].sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0)).slice(0, Math.max(gexCount, 26));
        const spot = profile.spot || (candles[n - 1] ? candles[n - 1].close : 0), vspan = (hi - lo) || 1;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const s of top) {
          const y = yP(s.strike), mag = Math.abs(s.netGex || 0) / maxG, pos = (s.netGex || 0) >= 0;
          const col = pos ? mixHex('#1f6f52', '#2fe6a0', mag) : mixHex('#7a3550', '#ff5470', mag);
          const distFade = Math.max(0.18, 1 - Math.abs(s.strike - spot) / (vspan * 0.7));
          const peak = (0.06 + Math.pow(mag, 1.1) * 0.62) * distFade, bandH = 8 + mag * 44;
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
        else { ctx.fillStyle = col; ctx.fillRect(bx, by, w, bh); if (w >= 3 && bh >= 3) { ctx.fillStyle = shade(col, 1.34); ctx.fillRect(bx, by, w, 1); } if (border) { ctx.strokeStyle = shade(col, 0.72); ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, Math.max(1, bh - 1)); } }
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
      // The chart is the structural SUMMARY, not the full per-strike table — that's the Exposure Ladder's
      // job, and labeling all ~20 strikes here just duplicates it. The 4 named levels (walls/flip/magnet)
      // are drawn separately; here we add only the strongest gamma strike(s) on EACH side of price, so the
      // two surfaces don't compete. "Strikes shown" (gexCount) scales how many per side for power users.
      const perSide = Math.max(1, Math.round(gexCount / 2));
      const byMag = (a: typeof profile.strikes[number], b: typeof profile.strikes[number]) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0);
      const eligible = profile.strikes.filter(s => Math.abs(s.netGex || 0) > 0 && !named.some(nm => Math.abs(nm - s.strike) < 1e-6));
      const above = eligible.filter(s => s.strike > last && s.strike <= hi).sort(byMag).slice(0, perSide);
      const below = eligible.filter(s => s.strike < last && s.strike >= lo).sort(byMag).slice(0, perSide);
      [...above, ...below].forEach(s => { const g = s.netGex || 0; pushLvl(s.strike, g >= 0 ? COL.up : COL.down, 'GEX', Math.abs(g), `${nf(s.strike)}  ${fmtGex(g)}`); });
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
        ctx.beginPath(); ctx.moveTo(plotL, px(L.rawY) - 0.5); ctx.lineTo(plotR, px(L.rawY) - 0.5);
        // Dealer walls + flip read as solid "walls" — a soft glow makes the structural levels pop (SpotGamma feel).
        if (p1) { ctx.save(); ctx.shadowColor = hexA(col, 0.6); ctx.shadowBlur = 8; ctx.stroke(); ctx.restore(); } else ctx.stroke();
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
      if (!L.value) { ctx.textAlign = 'right'; ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = hexA(col, 0.95); ctx.fillText(nf(L.price), W - 3, ty); }
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
}
