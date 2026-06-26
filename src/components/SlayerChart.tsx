import { useEffect, useMemo, useRef, useState } from 'react';
import { Candle, GexProfileData } from '../types';
import { useContractStore } from '../lib/store';
import * as TI from '../lib/indicators';

interface SlayerChartProps {
  profile: GexProfileData;
  decimals: number;
  candles?: Candle[]; // optional override; falls back to the live store stream
}

// Price-pane overlays (toggle chips). γ-MAP is the GEX-by-strike gamma landscape.
const OVERLAYS: { key: string; label: string; color: string }[] = [
  { key: 'vwap', label: 'VWAP', color: '#f5b300' },
  { key: 'ema20', label: 'EMA 20', color: '#3b9bff' },
  { key: 'ema50', label: 'EMA 50', color: '#b070ff' },
  { key: 'sma200', label: 'SMA 200', color: '#ff8a3d' },
  { key: 'bb', label: 'BOLL', color: '#63a0ff' },
  { key: 'donchian', label: 'DONCH', color: '#c084fc' },
  { key: 'keltner', label: 'KELT', color: '#34d399' },
  { key: 'psar', label: 'PSAR', color: '#e5e7eb' },
  { key: 'supertrend', label: 'ST', color: '#10b981' },
  { key: 'gexmap', label: 'γ-MAP', color: '#26d07c' },
];
const SUBPANES: { key: string; label: string }[] = [
  { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' },
  { key: 'stoch', label: 'STOCH' },
];

// Refined palette — vivid on true black, cohesive across candles / levels / overlays.
const COL = {
  up: '#26d07c', down: '#ff4d5e',
  upFill: '#26d07c', downFill: '#ff4d5e',
  upVol: 'rgba(38,208,124,0.28)', downVol: 'rgba(255,77,94,0.28)',
  grid: 'rgba(255,255,255,0.05)', gridV: 'rgba(255,255,255,0.028)',
  axis: '#7d8694', axisDim: '#565e6b',
  callWall: '#26d07c', putWall: '#ff4d5e', flip: '#f5c518', magnet: '#b070ff', em: '#5b9cff',
};

const EMPTY: Candle[] = [];
const niceStep = (raw: number) => {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw)), f = raw / Math.pow(10, exp);
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * Math.pow(10, exp);
};
const fmtTime = (ts: number) => { const d = new Date(ts); const h = d.getHours(), m = d.getMinutes(); return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`; };
const sameDay = (a: number, b: number) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
const px = (v: number) => Math.round(v) + 0.5; // pixel-snap a 1px stroke for crispness

/**
 * SlayerChart — our own canvas charting engine (no third-party library). Pan (drag) + zoom
 * (cursor-anchored wheel), a price pane with candles/volume/overlays, stacked oscillator
 * sub-panes, a dedicated GEX gamma-profile lane, dealer levels with collision-free pills, and
 * displacement bursts that gold-ring when they land on a dealer level. Every series comes from
 * the unit-tested src/lib/indicators library; redraws are rAF-throttled for buttery panning.
 */
export function SlayerChart({ profile, decimals, candles: propCandles }: SlayerChartProps) {
  const storeChart = useContractStore(s => s.activeContract?.chartData);
  const candles = propCandles ?? storeChart ?? EMPTY;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Nothing auto-on except the dealer gamma-map (this is a dealer chart, not a TA chart) —
  // every technical indicator is opt-in via the toolbar.
  const [on, setOn] = useState<Record<string, boolean>>({ vwap: false, ema20: false, ema50: false, sma200: false, bb: false, donchian: false, keltner: false, psar: false, supertrend: false, gexmap: true });
  const [panes, setPanes] = useState<Record<string, boolean>>({ rsi: false, macd: false, stoch: false });
  const [showDisp, setShowDisp] = useState(true);
  const [view, setView] = useState<{ bars: number; off: number }>({ bars: 110, off: 0 });

  // Snap back to the latest bars whenever the symbol or timeframe changes.
  const tfKey = useContractStore(s => s.selectedTimeframe);
  const tickKey = useContractStore(s => s.selectedAsset?.ticker);
  useEffect(() => { setView({ bars: 110, off: 0 }); }, [tfKey, tickKey]);

  // Mutable mirrors for the native pointer handlers (attached once).
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; off: number } | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const drawRef = useRef<() => void>(() => {});
  const onRef = useRef(on); onRef.current = on;
  // Geometry published each draw so pointer handlers can map cursor↔bar↔price accurately.
  const geomRef = useRef<{ plotL: number; plotR: number; barW: number; start: number; end: number; n: number; priceTop: number; priceBottom: number; volBandH: number; lo: number; hi: number } | null>(null);

  const s = useMemo(() => {
    const o = candles.map(c => c.open), h = candles.map(c => c.high), l = candles.map(c => c.low), c = candles.map(c => c.close), v = candles.map(c => c.volume);
    return {
      o, h, l, c, v,
      vwap: TI.vwap(h, l, c, v), ema20: TI.ema(c, 20), ema50: TI.ema(c, 50), sma200: TI.sma(c, 200),
      bb: TI.bollingerBands(c, 20, 2), donchian: TI.donchianChannels(h, l, 20), keltner: TI.keltnerChannels(h, l, c, 20, 2),
      psar: TI.parabolicSAR(h, l), supertrend: TI.superTrend(h, l, c, 10, 3), atr: TI.atr(h, l, c, 14),
      rsi: TI.rsi(c, 14), macd: TI.macd(c), stoch: TI.stochastic(h, l, c, 14, 3),
    };
  }, [candles]);

  const displacements = useMemo(() => {
    const levels = [profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet, profile.spot].filter(x => typeof x === 'number' && (x as number) > 0) as number[];
    const out: { i: number; dir: 1 | -1; onLevel: boolean }[] = [];
    for (let i = 1; i < candles.length; i++) {
      const a = s.atr[i]; if (a == null || a === 0) continue;
      const c = candles[i];
      if (Math.abs(c.close - c.open) > 1.5 * a) {
        const mid = (c.high + c.low) / 2, tol = Math.max(c.high - c.low, (profile.spot || c.close) * 0.0007);
        out.push({ i, dir: c.close >= c.open ? 1 : -1, onLevel: levels.some(L => Math.abs(mid - L) <= tol) });
      }
    }
    return out;
  }, [candles, s.atr, profile]);

  drawRef.current = () => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth, H = container.clientHeight;
    if (W <= 0 || H <= 0) return;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.font = '11px ui-monospace, monospace'; ctx.textBaseline = 'middle';

    if (candles.length === 0) { ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'; ctx.fillText('Awaiting candle stream…', W / 2, H / 2); return; }

    // ── Layout: [plot] [γ-lane?] [price axis gutter]; sub-panes share the time axis ──
    const axisW = 60, topPad = 6, xAxisH = 18;
    const gammaW = (on.gexmap && profile.strikes && profile.strikes.length) ? 46 : 0;
    const leftPad = 2;
    const plotL = leftPad, plotR = W - axisW - gammaW, plotW = plotR - plotL;
    const gammaR = plotR + gammaW; // gamma lane occupies [plotR, gammaR]
    const subKeys = SUBPANES.filter(p => panes[p.key]).map(p => p.key);
    const availH = H - topPad - xAxisH;
    const subH = subKeys.length ? Math.min(82, (availH * 0.4) / subKeys.length) : 0;
    const priceH = availH - subH * subKeys.length;
    const priceTop = topPad, priceBottom = topPad + priceH;

    // ── Viewport ──
    const n = candles.length;
    const bars = Math.max(20, Math.min(n, viewRef.current.bars));
    const off = Math.max(0, Math.min(Math.max(0, n - 10), viewRef.current.off));
    const end = n - off, start = Math.max(0, end - bars);
    const barW = plotW / bars;
    const xOf = (gi: number) => plotL + (gi - start) * barW + barW / 2;
    const vis = candles.slice(start, end);

    // ── Smart price scale: anchor to candle range, only stretch to catch *nearby* dealer
    //    levels (within ~85% of the candle range beyond the extremes). Far levels are drawn
    //    clamped to the edge instead of squishing the price action into a sliver. ──
    let lo = Infinity, hi = -Infinity;
    for (const c of vis) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
    if (!isFinite(lo) || !isFinite(hi)) return;
    const cRange = (hi - lo) || (hi || 1) * 0.01;
    const capLo = lo - cRange * 0.85, capHi = hi + cRange * 0.85;
    const levelPrices = [profile.spot, profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet];
    if (profile.spot && profile.expectedMovePct) levelPrices.push(profile.spot * (1 + profile.expectedMovePct), profile.spot * (1 - profile.expectedMovePct));
    for (const p of levelPrices) { if (typeof p === 'number' && p > 0 && p >= capLo && p <= capHi) { lo = Math.min(lo, p); hi = Math.max(hi, p); } }
    const pad = ((hi - lo) || 1) * 0.08; lo -= pad; hi += pad;
    const volBandH = priceH * 0.13;
    const priceAreaH = priceH - volBandH;
    const yP = (p: number) => priceTop + priceAreaH - ((p - lo) / (hi - lo)) * priceAreaH;
    const pOfY = (y: number) => lo + (1 - (y - priceTop) / priceAreaH) * (hi - lo);
    geomRef.current = { plotL, plotR, barW, start, end, n, priceTop, priceBottom, volBandH, lo, hi };

    // faint ticker · timeframe watermark
    if (tickKey) {
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.font = '600 46px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`${tickKey}${tfKey ? '  ·  ' + tfKey : ''}`, plotL + plotW / 2, priceTop + priceAreaH * 0.46);
      ctx.restore(); ctx.font = '11px ui-monospace, monospace';
    }

    // ── Horizontal grid + round price ticks (suppressed later near level pills) ──
    const step = niceStep((hi - lo) / 6);
    const gridYs: { y: number; label: string }[] = [];
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      const y = yP(g); if (y < priceTop + 4 || y > priceBottom - 2) continue;
      ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(plotL, px(y) - 0.5); ctx.lineTo(plotR, px(y) - 0.5); ctx.stroke();
      gridYs.push({ y, label: g.toFixed(decimals) });
    }

    // ── Vertical session gridlines + day dividers (drawn under candles) ──
    let lastDayTickX = -1e9;
    for (let i = 0; i < vis.length; i++) {
      const gi = start + i; const c = candles[gi]; if (!c) continue;
      const prev = candles[gi - 1];
      const dayBreak = prev && !sameDay(prev.timestamp, c.timestamp);
      const x = xOf(gi);
      if (dayBreak) { ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(px(x - barW / 2), priceTop); ctx.lineTo(px(x - barW / 2), priceBottom); ctx.stroke(); lastDayTickX = x; }
    }

    // ── Volume strip (bottom of price pane) ──
    let maxVol = 0; for (const c of vis) maxVol = Math.max(maxVol, c.volume || 0);
    const volBase = priceBottom;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(plotL, px(priceBottom - volBandH - 1)); ctx.lineTo(plotR, px(priceBottom - volBandH - 1)); ctx.stroke();
    for (let i = 0; i < vis.length; i++) { const c = vis[i], vh = maxVol ? ((c.volume || 0) / maxVol) * (volBandH - 2) : 0; ctx.fillStyle = c.close >= c.open ? COL.upVol : COL.downVol; ctx.fillRect(xOf(start + i) - barW * 0.34, volBase - vh, barW * 0.68, vh); }

    // ── GEX gamma-profile lane (dedicated, right of the plot) ──
    if (gammaW && profile.strikes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.moveTo(px(plotR), priceTop); ctx.lineTo(px(plotR), priceBottom); ctx.stroke();
      const inView = profile.strikes.filter(r => { const y = yP(r.strike); return y >= priceTop && y <= priceBottom; });
      const maxAbs = Math.max(...inView.map(r => Math.abs(r.netGex || 0)), 1e-9);
      // thickness ≈ strike spacing in px, so the lane reads as a continuous profile
      let thick = 6;
      if (inView.length > 1) { const span = Math.abs(yP(inView[0].strike) - yP(inView[inView.length - 1].strike)); thick = Math.max(2, Math.min(11, (span / (inView.length - 1)) * 0.82)); }
      for (const r of inView) {
        const y = yP(r.strike), len = Math.max(1, (Math.abs(r.netGex || 0) / maxAbs) * (gammaW - 5));
        const isWall = r.strike === profile.callWall || r.strike === profile.putWall;
        ctx.fillStyle = (r.netGex || 0) >= 0 ? (isWall ? 'rgba(38,208,124,0.95)' : 'rgba(38,208,124,0.6)') : (isWall ? 'rgba(255,77,94,0.95)' : 'rgba(255,77,94,0.6)');
        ctx.fillRect(plotR + 2, y - thick / 2, len, thick);
      }
      ctx.fillStyle = COL.axisDim; ctx.textAlign = 'left'; ctx.font = '8px ui-monospace, monospace'; ctx.fillText('γ', plotR + 3, priceTop + 7); ctx.font = '11px ui-monospace, monospace';
    }

    // ── Candles (crisp, refined palette) ──
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i], x = xOf(start + i), up = c.close >= c.open, col = up ? COL.up : COL.down;
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(px(x), Math.round(yP(c.high))); ctx.lineTo(px(x), Math.round(yP(c.low))); ctx.stroke();
      const yO = yP(c.open), yC = yP(c.close), bw = Math.max(1, barW * 0.7);
      ctx.fillRect(Math.round(x - bw / 2), Math.round(Math.min(yO, yC)), Math.round(bw), Math.max(1, Math.round(Math.abs(yC - yO))));
    }

    // ── Overlay polylines ──
    const line = (data: TI.Num[], color: string, w = 1.5) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); let st = false;
      for (let i = 0; i < vis.length; i++) { const val = data[start + i]; if (val == null) { st = false; continue; } const x = xOf(start + i), y = yP(val); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.lineWidth = 1;
    };
    if (on.vwap) line(s.vwap, '#f5b300', 2);
    if (on.ema20) line(s.ema20, '#3b9bff');
    if (on.ema50) line(s.ema50, '#b070ff');
    if (on.sma200) line(s.sma200, '#ff8a3d');
    if (on.bb) { line(s.bb.upper, 'rgba(99,160,255,0.5)'); line(s.bb.lower, 'rgba(99,160,255,0.5)'); }
    if (on.donchian) { line(s.donchian.upper, 'rgba(192,132,252,0.45)'); line(s.donchian.lower, 'rgba(192,132,252,0.45)'); }
    if (on.keltner) { line(s.keltner.upper, 'rgba(52,211,153,0.4)'); line(s.keltner.lower, 'rgba(52,211,153,0.4)'); }
    if (on.supertrend) line(s.supertrend.trend, '#10b981', 1.5);
    if (on.psar) { ctx.fillStyle = '#e5e7eb'; for (let i = 0; i < vis.length; i++) { const val = s.psar[start + i]; if (val == null) continue; ctx.beginPath(); ctx.arc(xOf(start + i), yP(val), 1.3, 0, Math.PI * 2); ctx.fill(); } }

    // ── Dealer levels: dashed line across plot + collision-free pill in the axis gutter ──
    const last = candles[n - 1].close, lastUp = candles[n - 1].close >= candles[n - 1].open;
    const pillH = 13, gx = gammaR; // pills sit in [gammaR, W]
    type Lvl = { price: number; color: string; label: string };
    const lvls: Lvl[] = [];
    const pushLvl = (price: any, color: string, label: string) => { if (typeof price === 'number' && price > 0) lvls.push({ price, color, label }); };
    pushLvl(profile.callWall, COL.callWall, 'CW'); pushLvl(profile.putWall, COL.putWall, 'PW');
    pushLvl(profile.gammaFlip, COL.flip, 'γF'); pushLvl(profile.magnet, COL.magnet, 'MAG');
    if (profile.spot && profile.expectedMovePct) { pushLvl(profile.spot * (1 + profile.expectedMovePct), COL.em, 'EM+'); pushLvl(profile.spot * (1 - profile.expectedMovePct), COL.em, 'EM-'); }
    // resolve pill Y positions (declutter), but draw dashed line at true price y
    const placed = lvls.map(L => { const rawY = yP(L.price); const off = L.price < lo || L.price > hi; return { ...L, rawY, off, dir: off ? (L.price > hi ? -1 : 1) : 0, y: Math.max(priceTop + pillH / 2, Math.min(priceBottom - pillH / 2, rawY)) }; }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) { if (placed[i].y - placed[i - 1].y < pillH + 1) placed[i].y = placed[i - 1].y + pillH + 1; }
    const lastY = yP(last);
    for (const L of placed) {
      if (!L.off) { ctx.strokeStyle = L.color; ctx.globalAlpha = 0.55; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(plotL, px(L.rawY) - 0.5); ctx.lineTo(plotR, px(L.rawY) - 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      // pill — label always; price too when the level is off-screen (can't read it off the axis)
      ctx.fillStyle = L.color; ctx.beginPath(); (ctx as any).roundRect?.(gx + 1, L.y - pillH / 2, axisW - 2, pillH, 3); if ((ctx as any).roundRect) ctx.fill(); else ctx.fillRect(gx + 1, L.y - pillH / 2, axisW - 2, pillH);
      ctx.fillStyle = '#06090d'; ctx.textAlign = 'left'; ctx.font = '700 9px ui-monospace, monospace';
      ctx.fillText(L.off ? `${L.dir < 0 ? '↑' : '↓'}${L.label}` : L.label, gx + 4, L.y);
      if (L.off) { ctx.textAlign = 'right'; ctx.fillText(L.price >= 100 ? L.price.toFixed(0) : L.price.toFixed(decimals), W - 3, L.y); }
      ctx.font = '11px ui-monospace, monospace';
    }

    // ── Price-axis numbers (skip any that collide with a pill or the last-price tag) ──
    ctx.textAlign = 'right';
    for (const g of gridYs) {
      if (Math.abs(g.y - lastY) < pillH) continue;
      if (placed.some(L => Math.abs(L.y - g.y) < pillH)) continue;
      ctx.fillStyle = COL.axisDim; ctx.fillText(g.label, W - 4, g.y);
    }

    // ── Displacement markers (gold-ring on a dealer level) ──
    if (showDisp) for (const d of displacements) {
      if (d.i < start || d.i >= end) continue; const c = candles[d.i], x = xOf(d.i);
      const y = d.dir > 0 ? yP(c.low) + 10 : yP(c.high) - 10, z = 4;
      ctx.fillStyle = d.onLevel ? '#f5c518' : (d.dir > 0 ? COL.up : COL.down);
      ctx.beginPath();
      if (d.dir > 0) { ctx.moveTo(x, y - z); ctx.lineTo(x - z, y + z); ctx.lineTo(x + z, y + z); } else { ctx.moveTo(x, y + z); ctx.lineTo(x - z, y - z); ctx.lineTo(x + z, y - z); }
      ctx.closePath(); ctx.fill();
      if (d.onLevel) { ctx.strokeStyle = '#f5c518'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
    }

    // ── Last price: glow line + prominent tag with Δ ──
    if (lastY >= priceTop && lastY <= priceBottom) {
      ctx.strokeStyle = lastUp ? 'rgba(38,208,124,0.55)' : 'rgba(255,77,94,0.55)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(plotL, px(lastY) - 0.5); ctx.lineTo(plotR, px(lastY) - 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = lastUp ? COL.up : COL.down; const tagW = axisW + gammaW - 1;
      (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(plotR + 1, lastY - 8, tagW, 16, 3), ctx.fill()) : ctx.fillRect(plotR + 1, lastY - 8, tagW, 16);
      ctx.fillStyle = '#06090d'; ctx.textAlign = 'left'; ctx.font = '700 11px ui-monospace, monospace'; ctx.fillText(last.toFixed(decimals), plotR + 6, lastY);
      ctx.font = '11px ui-monospace, monospace';
    }

    // ── Sub-panes ──
    const drawSub = (key: string, top: number, h: number) => {
      const bot = top + h;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(plotL, px(top)); ctx.lineTo(plotR, px(top)); ctx.stroke();
      const subLine = (data: TI.Num[], yScale: (v: number) => number, color: string, w = 1.3) => {
        ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); let stt = false;
        for (let i = 0; i < vis.length; i++) { const val = data[start + i]; if (val == null) { stt = false; continue; } const x = xOf(start + i), y = yScale(val); if (!stt) { ctx.moveTo(x, y); stt = true; } else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.lineWidth = 1;
      };
      ctx.textAlign = 'left';
      if (key === 'rsi') {
        const yS = (v: number) => bot - (v / 100) * h;
        [30, 50, 70].forEach(lv => { const y = yS(lv); ctx.strokeStyle = lv === 50 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'; ctx.setLineDash(lv === 50 ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(plotL, px(y)); ctx.lineTo(plotR, px(y)); ctx.stroke(); ctx.setLineDash([]); });
        subLine(s.rsi, yS, '#e879f9', 1.4);
        const cur = s.rsi[n - 1]; ctx.fillStyle = '#9ca3af'; ctx.fillText(`RSI 14  ${cur != null ? (cur as number).toFixed(1) : '—'}`, plotL + 4, top + 9);
      } else if (key === 'macd') {
        let mx = 1e-9; for (let i = start; i < end; i++) { for (const arr of [s.macd.macd, s.macd.signal, s.macd.histogram]) { const v = arr[i]; if (v != null) mx = Math.max(mx, Math.abs(v)); } }
        const yS = (v: number) => (top + bot) / 2 - (v / mx) * (h / 2 - 5);
        const z = yS(0); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(plotL, px(z)); ctx.lineTo(plotR, px(z)); ctx.stroke();
        for (let i = 0; i < vis.length; i++) { const v = s.macd.histogram[start + i]; if (v == null) continue; const x = xOf(start + i), y = yS(v as number); ctx.fillStyle = (v as number) >= 0 ? 'rgba(38,208,124,0.55)' : 'rgba(255,77,94,0.55)'; ctx.fillRect(x - barW * 0.3, Math.min(y, z), barW * 0.6, Math.max(1, Math.abs(y - z))); }
        subLine(s.macd.macd, yS, '#3b9bff', 1.3); subLine(s.macd.signal, yS, '#f5b300', 1.3);
        ctx.fillStyle = '#9ca3af'; ctx.fillText('MACD 12·26·9', plotL + 4, top + 9);
      } else if (key === 'stoch') {
        const yS = (v: number) => bot - (v / 100) * h;
        [20, 80].forEach(lv => { const y = yS(lv); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(plotL, px(y)); ctx.lineTo(plotR, px(y)); ctx.stroke(); ctx.setLineDash([]); });
        subLine(s.stoch.k, yS, '#38bdf8', 1.3); subLine(s.stoch.d, yS, '#ff8a3d', 1.3);
        ctx.fillStyle = '#9ca3af'; ctx.fillText('STOCH 14·3', plotL + 4, top + 9);
      }
    };
    subKeys.forEach((k, idx) => drawSub(k, priceBottom + idx * subH, subH));

    // ── X time axis ──
    const axisY = H - xAxisH; ctx.fillStyle = COL.axisDim; ctx.textAlign = 'center';
    const ticks = Math.max(2, Math.floor(plotW / 96));
    for (let t = 0; t <= ticks; t++) { const gi = start + Math.round(((end - 1 - start) * t) / ticks); if (gi < start || gi >= end || !candles[gi]) continue; const c = candles[gi]; const lbl = (lastDayTickX > 0 && Math.abs(xOf(gi) - lastDayTickX) < 40) ? `${new Date(c.timestamp).getMonth() + 1}/${new Date(c.timestamp).getDate()}` : fmtTime(c.timestamp); ctx.fillText(lbl, xOf(gi), axisY + 9); }

    // ── Crosshair + readouts ──
    const hv = hoverRef.current;
    if (hv && hv.x >= plotL && hv.x <= plotR) {
      const gi = Math.max(start, Math.min(end - 1, start + Math.round((hv.x - plotL - barW / 2) / barW)));
      const cx = xOf(gi);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px(cx), priceTop); ctx.lineTo(px(cx), H - xAxisH); ctx.stroke();
      if (hv.y > priceTop && hv.y < H - xAxisH) { ctx.beginPath(); ctx.moveTo(plotL, px(hv.y)); ctx.lineTo(plotR, px(hv.y)); ctx.stroke(); }
      ctx.setLineDash([]);
      // price label at crosshair
      if (hv.y >= priceTop && hv.y <= priceBottom - volBandH) {
        const pr = pOfY(hv.y);
        ctx.fillStyle = '#252b36'; (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(plotR + 1, hv.y - 8, axisW + gammaW - 1, 16, 3), ctx.fill()) : ctx.fillRect(plotR + 1, hv.y - 8, axisW + gammaW - 1, 16); ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'left'; ctx.fillText(pr.toFixed(decimals), plotR + 6, hv.y);
      }
      // time label
      const c = candles[gi]; ctx.fillStyle = '#252b36'; ctx.textAlign = 'center'; const tw = 40; ctx.fillRect(cx - tw / 2, H - xAxisH, tw, xAxisH); ctx.fillStyle = '#e5e7eb'; ctx.fillText(fmtTime(c.timestamp), cx, H - xAxisH + 9);
      // OHLC readout (top-left)
      const up = c.close >= c.open; const dC = c.close - c.open, dPct = c.open ? (dC / c.open) * 100 : 0;
      const txt = `O ${c.open.toFixed(decimals)}   H ${c.high.toFixed(decimals)}   L ${c.low.toFixed(decimals)}   C ${c.close.toFixed(decimals)}   ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%   V ${(c.volume || 0) >= 1e6 ? ((c.volume || 0) / 1e6).toFixed(2) + 'M' : (c.volume || 0).toFixed(0)}`;
      ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left'; const wTxt = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(8,10,14,0.82)'; ctx.fillRect(plotL + 2, priceTop + 2, wTxt, 16); ctx.fillStyle = up ? COL.up : COL.down; ctx.fillText(txt, plotL + 9, priceTop + 10);
    } else {
      // persistent legend (top-left) when not hovering: symbol + enabled overlay values
      ctx.textAlign = 'left'; ctx.font = '11px ui-monospace, monospace';
      const segs: { t: string; c: string }[] = [];
      const dC = n > 1 ? candles[n - 1].close - candles[n - 2].close : 0, dPct = n > 1 && candles[n - 2].close ? (dC / candles[n - 2].close) * 100 : 0;
      segs.push({ t: `${tickKey || ''}${tfKey ? ' · ' + tfKey : ''}`, c: '#cbd5e1' });
      segs.push({ t: `${last.toFixed(decimals)}  ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%`, c: lastUp ? COL.up : COL.down });
      const ov: [string, string, TI.Num[], string][] = [['vwap', 'VWAP', s.vwap, '#f5b300'], ['ema20', 'EMA20', s.ema20, '#3b9bff'], ['ema50', 'EMA50', s.ema50, '#b070ff'], ['sma200', 'SMA200', s.sma200, '#ff8a3d']];
      for (const [key, lab, arr, col] of ov) { if (on[key]) { const v = arr[n - 1]; if (v != null) segs.push({ t: `${lab} ${(v as number).toFixed(decimals)}`, c: col }); } }
      let lx = plotL + 8; const ly = priceTop + 11;
      for (const sg of segs) { ctx.fillStyle = sg.c; ctx.fillText(sg.t, lx, ly); lx += ctx.measureText(sg.t).width + 16; }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current; if (!canvas || !container) return;
    let rafPending = false;
    const schedule = () => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; drawRef.current(); }); };
    drawRef.current();
    const ro = new ResizeObserver(() => schedule()); ro.observe(container);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const n = candlesRef.current.length || 300; const factor = e.deltaY > 0 ? 1.15 : 0.87;
      const cur = viewRef.current; const next = Math.max(20, Math.min(n, Math.round(cur.bars * factor)));
      if (next === cur.bars) return;
      // cursor-anchored zoom: keep the bar under the pointer fixed
      const g = geomRef.current; const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left;
      if (g && mx >= g.plotL && mx <= g.plotR) {
        const giUnder = g.start + (mx - g.plotL) / g.barW;
        const newBarW = (g.plotR - g.plotL) / next;
        const newStart = giUnder - (mx - g.plotL) / newBarW;
        let newOff = Math.round(n - next - newStart);
        newOff = Math.max(0, Math.min(Math.max(0, n - 10), newOff));
        setView({ bars: next, off: newOff });
      } else setView(v => ({ ...v, bars: next }));
    };
    const onDown = (e: MouseEvent) => { dragRef.current = { x: e.clientX, off: viewRef.current.off }; };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect(); hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      const drag = dragRef.current;
      if (drag && geomRef.current) {
        const n = candlesRef.current.length, barW = geomRef.current.barW;
        const dOff = Math.round((e.clientX - drag.x) / barW);
        const nextOff = Math.max(0, Math.min(Math.max(0, n - 10), drag.off + dOff));
        if (nextOff !== viewRef.current.off) { setView(v => ({ ...v, off: nextOff })); return; }
      }
      schedule();
    };
    const onUp = () => { dragRef.current = null; };
    const onLeave = () => { hoverRef.current = null; schedule(); };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    return () => { ro.disconnect(); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); canvas.removeEventListener('mouseleave', onLeave); };
  }, []);

  useEffect(() => { drawRef.current(); }, [candles, s, displacements, on, panes, showDisp, view, profile, decimals, tfKey, tickKey]);

  const chip = (active: boolean, label: string, onClick: () => void, dot?: string, tone = 'default') => (
    <button onClick={onClick} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border transition-colors cursor-pointer ${active ? (tone === 'warn' ? 'bg-[var(--warning)]/15 border-[var(--warning)]/40 text-[var(--warning)]' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]') : 'bg-transparent border-transparent text-[var(--text-tertiary)] opacity-50'}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot, opacity: active ? 1 : 0.4 }} />}{label}
    </button>
  );

  return (
    <div className="w-full h-full flex flex-col bg-black" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0">
        {OVERLAYS.map(o => chip(!!on[o.key], o.label, () => setOn(p => ({ ...p, [o.key]: !p[o.key] })), o.color))}
        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        {SUBPANES.map(p => chip(!!panes[p.key], p.label, () => setPanes(s => ({ ...s, [p.key]: !s[p.key] }))))}
        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        {chip(showDisp, '⚡ DISP', () => setShowDisp(v => !v), undefined, 'warn')}
        {view.off > 0 && chip(true, '⟳ LIVE', () => setView(v => ({ ...v, off: 0 })))}
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-[300px]" style={{ position: 'relative', flex: 1, minHeight: 300 }}>
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
