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
  { key: 'ema20', label: 'EMA 20', color: '#60a5fa' },
  { key: 'ema50', label: 'EMA 50', color: '#a855f7' },
  { key: 'sma200', label: 'SMA 200', color: '#f97316' },
  { key: 'bb', label: 'BOLL', color: '#63a0ff' },
  { key: 'donchian', label: 'DONCH', color: '#c084fc' },
  { key: 'keltner', label: 'KELT', color: '#34d399' },
  { key: 'psar', label: 'PSAR', color: '#e5e7eb' },
  { key: 'supertrend', label: 'ST', color: '#10b981' },
  { key: 'gexmap', label: 'γ-MAP', color: '#22c55e' },
];
const SUBPANES: { key: string; label: string }[] = [
  { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' },
  { key: 'stoch', label: 'STOCH' },
];

const EMPTY: Candle[] = [];
const niceStep = (raw: number) => {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw)), f = raw / Math.pow(10, exp);
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * Math.pow(10, exp);
};
const fmtTime = (ts: number) => { const d = new Date(ts); const h = d.getHours(), m = d.getMinutes(); return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`; };

/**
 * SlayerChart — our own canvas charting engine (no third-party library). Pan (drag) + zoom
 * (wheel), a price pane with candles/volume/overlays, stacked oscillator sub-panes, GEX
 * dealer levels + a per-strike gamma landscape, and displacement bursts that gold-ring when
 * they land on a dealer level (the 1/1 displacement↔gamma read). Every series comes from the
 * unit-tested src/lib/indicators library.
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

  // Mutable mirrors for the native pointer handlers (attached once).
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; off: number } | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const drawRef = useRef<() => void>(() => {});
  const geomRef = useRef<{ leftPad: number; plotW: number } | null>(null);

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
    ctx.font = '11px monospace'; ctx.textBaseline = 'middle';

    if (candles.length === 0) { ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'; ctx.fillText('Awaiting candle stream…', W / 2, H / 2); return; }

    // ── Layout: price pane + enabled sub-panes, shared bottom time axis ──
    const leftPad = 2, gutter = 56, xAxisH = 16, topPad = 4;
    const plotW = W - leftPad - gutter;
    geomRef.current = { leftPad, plotW };
    const subKeys = SUBPANES.filter(p => panes[p.key]).map(p => p.key);
    const availH = H - topPad - xAxisH;
    let subH = subKeys.length ? Math.min(78, (availH * 0.42) / subKeys.length) : 0;
    const priceH = availH - subH * subKeys.length;
    const priceTop = topPad, priceBottom = topPad + priceH;

    // ── Viewport ──
    const n = candles.length;
    const bars = Math.max(20, Math.min(n, viewRef.current.bars));
    const off = Math.max(0, Math.min(Math.max(0, n - 10), viewRef.current.off));
    const end = n - off, start = Math.max(0, end - bars);
    const barW = plotW / bars;
    const xOf = (gi: number) => leftPad + (gi - start) * barW + barW / 2;
    const vis = candles.slice(start, end);

    // ── Price scale (incl. key GEX levels so they stay in view) ──
    let lo = Infinity, hi = -Infinity;
    for (const c of vis) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
    [profile.spot, profile.callWall, profile.putWall, profile.gammaFlip].forEach(p => { if (typeof p === 'number' && p > 0) { lo = Math.min(lo, p); hi = Math.max(hi, p); } });
    if (!isFinite(lo) || !isFinite(hi)) return;
    const sp = (hi - lo) || 1, pd = sp * 0.06; lo -= pd; hi += pd;
    const volBandH = priceH * 0.14;
    const yP = (p: number) => priceTop + (priceH - volBandH) - ((p - lo) / (hi - lo)) * (priceH - volBandH);

    // grid + round price ticks
    const step = niceStep((hi - lo) / 6);
    ctx.textAlign = 'left';
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      const y = yP(g); if (y < priceTop || y > priceBottom) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(leftPad + plotW, y); ctx.stroke();
      ctx.fillStyle = '#6b7280'; ctx.fillText(g.toFixed(decimals), leftPad + plotW + 4, y);
    }

    // volume strip (bottom of price pane)
    let maxVol = 0; for (const c of vis) maxVol = Math.max(maxVol, c.volume || 0);
    const volBase = priceBottom;
    for (let i = 0; i < vis.length; i++) { const c = vis[i], vh = maxVol ? ((c.volume || 0) / maxVol) * volBandH : 0; ctx.fillStyle = c.close >= c.open ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'; ctx.fillRect(xOf(start + i) - barW * 0.34, volBase - vh, barW * 0.68, vh); }

    // GEX gamma landscape (per-strike net gamma, right edge of the price pane)
    if (on.gexmap && profile.strikes && profile.strikes.length) {
      const maxAbs = Math.max(...profile.strikes.map(r => Math.abs(r.netGex || 0)), 1e-9);
      const mapW = Math.min(96, plotW * 0.22);
      for (const r of profile.strikes) {
        const y = yP(r.strike); if (y < priceTop || y > priceBottom) continue;
        const len = Math.max(1.5, (Math.abs(r.netGex || 0) / maxAbs) * mapW);
        ctx.fillStyle = (r.netGex || 0) >= 0 ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)';
        ctx.fillRect(leftPad + plotW - len, y - 1.1, len, 2.2);
      }
    }

    // candles
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i], x = xOf(start + i), up = c.close >= c.open, col = up ? '#22c55e' : '#ef4444';
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x, yP(c.high)); ctx.lineTo(x, yP(c.low)); ctx.stroke();
      const yO = yP(c.open), yC = yP(c.close); ctx.fillRect(x - barW * 0.34, Math.min(yO, yC), barW * 0.68, Math.max(1, Math.abs(yC - yO)));
    }

    // overlay polylines
    const line = (data: TI.Num[], color: string, w = 1.5) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); let st = false;
      for (let i = 0; i < vis.length; i++) { const val = data[start + i]; if (val == null) { st = false; continue; } const x = xOf(start + i), y = yP(val); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.lineWidth = 1;
    };
    if (on.vwap) line(s.vwap, '#f5b300', 2);
    if (on.ema20) line(s.ema20, '#60a5fa');
    if (on.ema50) line(s.ema50, '#a855f7');
    if (on.sma200) line(s.sma200, '#f97316');
    if (on.bb) { line(s.bb.upper, 'rgba(99,160,255,0.5)'); line(s.bb.lower, 'rgba(99,160,255,0.5)'); }
    if (on.donchian) { line(s.donchian.upper, 'rgba(192,132,252,0.45)'); line(s.donchian.lower, 'rgba(192,132,252,0.45)'); }
    if (on.keltner) { line(s.keltner.upper, 'rgba(52,211,153,0.4)'); line(s.keltner.lower, 'rgba(52,211,153,0.4)'); }
    if (on.supertrend) line(s.supertrend.trend, '#10b981', 1.5);
    if (on.psar) { ctx.fillStyle = '#e5e7eb'; for (let i = 0; i < vis.length; i++) { const val = s.psar[start + i]; if (val == null) continue; ctx.beginPath(); ctx.arc(xOf(start + i), yP(val), 1.2, 0, Math.PI * 2); ctx.fill(); } }

    // GEX dealer levels (dashed + gutter tag)
    const level = (price: any, color: string, label: string) => {
      if (typeof price !== 'number' || price <= 0) return; const y = yP(price); if (y < priceTop || y > priceBottom) return;
      ctx.strokeStyle = color; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(leftPad + plotW, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.fillRect(leftPad + plotW, y - 6, gutter, 12); ctx.fillStyle = '#0a0a0a'; ctx.fillText(label, leftPad + plotW + 3, y);
    };
    level(profile.callWall, '#22c55e', 'CW'); level(profile.putWall, '#ef4444', 'PW'); level(profile.gammaFlip, '#eab308', 'γF'); level(profile.magnet, '#a855f7', 'MAG');
    if (profile.spot && profile.expectedMovePct) { level(profile.spot * (1 + profile.expectedMovePct), '#60a5fa', 'EM+'); level(profile.spot * (1 - profile.expectedMovePct), '#60a5fa', 'EM-'); }

    // displacement markers (gold-ring on a dealer level)
    if (showDisp) for (const d of displacements) {
      if (d.i < start || d.i >= end) continue; const c = candles[d.i], x = xOf(d.i);
      const y = d.dir > 0 ? yP(c.low) + 9 : yP(c.high) - 9, z = 4;
      ctx.fillStyle = d.onLevel ? '#f5b300' : (d.dir > 0 ? '#22c55e' : '#ef4444');
      ctx.beginPath();
      if (d.dir > 0) { ctx.moveTo(x, y - z); ctx.lineTo(x - z, y + z); ctx.lineTo(x + z, y + z); } else { ctx.moveTo(x, y + z); ctx.lineTo(x - z, y - z); ctx.lineTo(x + z, y - z); }
      ctx.closePath(); ctx.fill();
      if (d.onLevel) { ctx.strokeStyle = '#f5b300'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); }
    }

    // last price line + tag
    const last = candles[n - 1].close, yl = yP(last);
    if (yl >= priceTop && yl <= priceBottom) {
      ctx.strokeStyle = 'rgba(229,231,235,0.5)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(leftPad, yl); ctx.lineTo(leftPad + plotW, yl); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = candles[n - 1].close >= candles[n - 1].open ? '#16a34a' : '#dc2626'; ctx.fillRect(leftPad + plotW, yl - 7, gutter, 14); ctx.fillStyle = '#fff'; ctx.fillText(last.toFixed(decimals), leftPad + plotW + 3, yl);
    }

    // ── Sub-panes ──
    const drawSub = (key: string, top: number, h: number) => {
      const bot = top + h;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(leftPad, top); ctx.lineTo(leftPad + plotW, top); ctx.stroke();
      const subLine = (data: TI.Num[], yScale: (v: number) => number, color: string, w = 1.3) => {
        ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); let stt = false;
        for (let i = 0; i < vis.length; i++) { const val = data[start + i]; if (val == null) { stt = false; continue; } const x = xOf(start + i), y = yScale(val); if (!stt) { ctx.moveTo(x, y); stt = true; } else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.lineWidth = 1;
      };
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'left';
      if (key === 'rsi') {
        const yS = (v: number) => bot - (v / 100) * h;
        [30, 50, 70].forEach(lv => { const y = yS(lv); ctx.strokeStyle = lv === 50 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'; ctx.setLineDash(lv === 50 ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(leftPad + plotW, y); ctx.stroke(); ctx.setLineDash([]); });
        subLine(s.rsi, yS, '#e879f9', 1.4);
        const cur = s.rsi[n - 1]; ctx.fillText(`RSI 14 ${cur != null ? (cur as number).toFixed(1) : '—'}`, leftPad + 4, top + 8);
      } else if (key === 'macd') {
        let mx = 1e-9; for (let i = start; i < end; i++) { for (const arr of [s.macd.macd, s.macd.signal, s.macd.histogram]) { const v = arr[i]; if (v != null) mx = Math.max(mx, Math.abs(v)); } }
        const yS = (v: number) => (top + bot) / 2 - (v / mx) * (h / 2 - 4);
        const z = yS(0); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(leftPad, z); ctx.lineTo(leftPad + plotW, z); ctx.stroke();
        for (let i = 0; i < vis.length; i++) { const v = s.macd.histogram[start + i]; if (v == null) continue; const x = xOf(start + i), y = yS(v as number); ctx.fillStyle = (v as number) >= 0 ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'; ctx.fillRect(x - barW * 0.3, Math.min(y, z), barW * 0.6, Math.max(1, Math.abs(y - z))); }
        subLine(s.macd.macd, yS, '#60a5fa', 1.3); subLine(s.macd.signal, yS, '#f59e0b', 1.3);
        ctx.fillStyle = '#9ca3af'; ctx.fillText('MACD 12·26·9', leftPad + 4, top + 8);
      } else if (key === 'stoch') {
        const yS = (v: number) => bot - (v / 100) * h;
        [20, 80].forEach(lv => { const y = yS(lv); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(leftPad + plotW, y); ctx.stroke(); ctx.setLineDash([]); });
        subLine(s.stoch.k, yS, '#38bdf8', 1.3); subLine(s.stoch.d, yS, '#f97316', 1.3);
        ctx.fillStyle = '#9ca3af'; ctx.fillText('STOCH 14·3', leftPad + 4, top + 8);
      }
    };
    subKeys.forEach((k, idx) => drawSub(k, priceBottom + idx * subH, subH));

    // ── X time axis ──
    const axisY = H - xAxisH; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center';
    const ticks = Math.max(2, Math.floor(plotW / 90));
    for (let t = 0; t <= ticks; t++) { const gi = start + Math.round(((end - 1 - start) * t) / ticks); if (gi < start || gi >= end || !candles[gi]) continue; ctx.fillText(fmtTime(candles[gi].timestamp), xOf(gi), axisY + 8); }

    // ── Crosshair + readouts ──
    const hv = hoverRef.current;
    if (hv && hv.x >= leftPad && hv.x <= leftPad + plotW) {
      const gi = Math.max(start, Math.min(end - 1, start + Math.round((hv.x - leftPad - barW / 2) / barW)));
      const cx = xOf(gi);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx, priceTop); ctx.lineTo(cx, H - xAxisH); ctx.stroke();
      if (hv.y > priceTop && hv.y < H - xAxisH) { ctx.beginPath(); ctx.moveTo(leftPad, hv.y); ctx.lineTo(leftPad + plotW, hv.y); ctx.stroke(); }
      ctx.setLineDash([]);
      // price label at crosshair (only meaningful in the price pane)
      if (hv.y >= priceTop && hv.y <= priceBottom - volBandH) {
        const pr = lo + (1 - (hv.y - priceTop) / (priceH - volBandH)) * (hi - lo);
        ctx.fillStyle = '#1f2937'; ctx.fillRect(leftPad + plotW, hv.y - 7, gutter, 14); ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'left'; ctx.fillText(pr.toFixed(decimals), leftPad + plotW + 3, hv.y);
      }
      // time label
      const c = candles[gi]; ctx.fillStyle = '#1f2937'; ctx.textAlign = 'center'; const tw = 34; ctx.fillRect(cx - tw / 2, H - xAxisH, tw, xAxisH); ctx.fillStyle = '#e5e7eb'; ctx.fillText(fmtTime(c.timestamp), cx, H - xAxisH + 8);
      // OHLC readout
      const up = c.close >= c.open; const txt = `O ${c.open.toFixed(decimals)}  H ${c.high.toFixed(decimals)}  L ${c.low.toFixed(decimals)}  C ${c.close.toFixed(decimals)}  V ${(c.volume || 0).toFixed(0)}`;
      ctx.font = '11px monospace'; ctx.textAlign = 'left'; const wTxt = ctx.measureText(txt).width + 12;
      ctx.fillStyle = 'rgba(10,10,10,0.85)'; ctx.fillRect(leftPad + 2, priceTop + 2, wTxt, 15); ctx.fillStyle = up ? '#22c55e' : '#ef4444'; ctx.fillText(txt, leftPad + 8, priceTop + 9);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current; if (!canvas || !container) return;
    const draw = () => drawRef.current();
    draw();
    const ro = new ResizeObserver(() => requestAnimationFrame(draw)); ro.observe(container);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const n = candlesRef.current.length || 300; const factor = e.deltaY > 0 ? 1.15 : 0.87;
      const next = Math.max(20, Math.min(n, Math.round(viewRef.current.bars * factor)));
      if (next !== viewRef.current.bars) setView(v => ({ ...v, bars: next }));
    };
    const onDown = (e: MouseEvent) => { dragRef.current = { x: e.clientX, off: viewRef.current.off }; };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect(); hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      const drag = dragRef.current;
      if (drag && geomRef.current) {
        const n = candlesRef.current.length, barW = geomRef.current.plotW / Math.max(1, viewRef.current.bars);
        const dOff = Math.round((e.clientX - drag.x) / barW);
        const nextOff = Math.max(0, Math.min(Math.max(0, n - 10), drag.off + dOff));
        if (nextOff !== viewRef.current.off) setView(v => ({ ...v, off: nextOff })); else draw();
      } else draw();
    };
    const onUp = () => { dragRef.current = null; };
    const onLeave = () => { hoverRef.current = null; draw(); };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    return () => { ro.disconnect(); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); canvas.removeEventListener('mouseleave', onLeave); };
  }, []);

  useEffect(() => { drawRef.current(); }, [candles, s, displacements, on, panes, showDisp, view, profile, decimals]);

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
