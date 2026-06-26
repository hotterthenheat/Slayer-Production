import { useEffect, useMemo, useRef, useState } from 'react';
import { Candle, GexProfileData } from '../types';
import { useContractStore } from '../lib/store';
import * as TI from '../lib/indicators';

interface SlayerChartProps {
  profile: GexProfileData;
  decimals: number;
  candles?: Candle[]; // optional override; falls back to the live store stream
}

// Price-pane overlay indicators (drawn on the candles). Oscillators (RSI/MACD/…) live in
// the tested indicator library too and get their own sub-panes in a later pass.
const OVERLAYS: { key: string; label: string; color: string }[] = [
  { key: 'vwap', label: 'VWAP', color: '#f5b300' },
  { key: 'ema20', label: 'EMA 20', color: '#60a5fa' },
  { key: 'ema50', label: 'EMA 50', color: '#a855f7' },
  { key: 'sma200', label: 'SMA 200', color: '#f97316' },
  { key: 'bb', label: 'Bollinger', color: '#63a0ff' },
  { key: 'donchian', label: 'Donchian', color: '#c084fc' },
  { key: 'keltner', label: 'Keltner', color: '#34d399' },
  { key: 'psar', label: 'PSAR', color: '#e5e7eb' },
  { key: 'supertrend', label: 'SuperTrend', color: '#10b981' },
];

/**
 * SlayerChart — our own canvas candlestick renderer (no third-party charting library).
 * Candles come from the live store stream; every overlay is computed by the unit-tested
 * src/lib/indicators library. GEX walls / γ-flip / magnet / expected-move are drawn as price
 * levels (so they line up horizontally with the dealer ladder beside it), and displacement
 * bursts that land on a GEX level are flagged — the 1/1 "displacement ↔ dealer-gamma" read.
 */
const EMPTY_CANDLES: Candle[] = [];

export function SlayerChart({ profile, decimals, candles: propCandles }: SlayerChartProps) {
  // Select the raw reference (stable) and default OUTSIDE the selector — returning a fresh
  // `|| []` inside the selector makes zustand see a new value every render → infinite loop.
  const storeChartData = useContractStore(s => s.activeContract?.chartData);
  const candles = propCandles ?? storeChartData ?? EMPTY_CANDLES;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({ vwap: true, ema20: true, ema50: false, sma200: false, bb: true, donchian: false, keltner: false, psar: false, supertrend: false });
  const [showDisp, setShowDisp] = useState(true);

  // All overlay series, computed once per candle update from the tested library.
  const s = useMemo(() => {
    const o = candles.map(c => c.open), h = candles.map(c => c.high), l = candles.map(c => c.low), c = candles.map(c => c.close), v = candles.map(c => c.volume);
    return {
      o, h, l, c, v,
      vwap: TI.vwap(h, l, c, v),
      ema20: TI.ema(c, 20), ema50: TI.ema(c, 50), sma200: TI.sma(c, 200),
      bb: TI.bollingerBands(c, 20, 2),
      donchian: TI.donchianChannels(h, l, 20),
      keltner: TI.keltnerChannels(h, l, c, 20, 2),
      psar: TI.parabolicSAR(h, l),
      supertrend: TI.superTrend(h, l, c, 10, 3),
      atr: TI.atr(h, l, c, 14),
    };
  }, [candles]);

  // Displacement bursts: candle body > 1.5·ATR. Flag the ones sitting on a dealer level.
  const displacements = useMemo(() => {
    const levels = [profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet, profile.spot].filter(x => typeof x === 'number' && (x as number) > 0) as number[];
    const out: { i: number; dir: 1 | -1; onLevel: boolean }[] = [];
    for (let i = 1; i < candles.length; i++) {
      const a = s.atr[i];
      if (a == null || a === 0) continue;
      const c = candles[i];
      if (Math.abs(c.close - c.open) > 1.5 * a) {
        const mid = (c.high + c.low) / 2;
        const tol = Math.max(c.high - c.low, (profile.spot || c.close) * 0.0007);
        out.push({ i, dir: c.close >= c.open ? 1 : -1, onLevel: levels.some(L => Math.abs(mid - L) <= tol) });
      }
    }
    return out;
  }, [candles, s.atr, profile]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current, container = containerRef.current;
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const W = container.clientWidth, H = container.clientHeight;
      if (W === 0 || H === 0) return;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = '10px monospace';

      if (candles.length === 0) {
        ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Awaiting candle stream…', W / 2, H / 2);
        return;
      }

      const padR = 60, padB = 20, padT = 6, padL = 4;
      const plotW = W - padR - padL, plotH = H - padB - padT;
      const volH = plotH * 0.15, priceH = plotH - volH;

      const barW = Math.max(2, Math.min(13, plotW / Math.min(candles.length, 150)));
      const visible = Math.max(1, Math.min(candles.length, Math.floor(plotW / barW)));
      const start = candles.length - visible;
      const view = candles.slice(start);

      let lo = Infinity, hi = -Infinity;
      for (const c of view) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
      [profile.spot, profile.callWall, profile.putWall, profile.gammaFlip].forEach(p => { if (typeof p === 'number' && p > 0) { lo = Math.min(lo, p); hi = Math.max(hi, p); } });
      const span = (hi - lo) || 1, pad = span * 0.06; lo -= pad; hi += pad;
      const yOf = (p: number) => padT + priceH - ((p - lo) / (hi - lo)) * priceH;
      const xOf = (iv: number) => padL + iv * barW + barW / 2;

      // Grid + right-axis price labels
      ctx.textBaseline = 'middle';
      for (let t = 0; t <= 6; t++) {
        const p = lo + ((hi - lo) * t) / 6, y = yOf(p);
        ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
        ctx.fillStyle = '#6b7280'; ctx.textAlign = 'left'; ctx.fillText(p.toFixed(decimals), padL + plotW + 4, y);
      }

      // Volume sub-histogram
      let maxVol = 0; for (const c of view) maxVol = Math.max(maxVol, c.volume || 0);
      const volBase = padT + priceH + volH;
      for (let i = 0; i < view.length; i++) {
        const c = view[i], vh = maxVol ? ((c.volume || 0) / maxVol) * volH : 0;
        ctx.fillStyle = c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
        ctx.fillRect(xOf(i) - barW * 0.35, volBase - vh, barW * 0.7, vh);
      }

      // Candles
      for (let i = 0; i < view.length; i++) {
        const c = view[i], x = xOf(i), up = c.close >= c.open, col = up ? '#22c55e' : '#ef4444';
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x, yOf(c.high)); ctx.lineTo(x, yOf(c.low)); ctx.stroke();
        const yO = yOf(c.open), yC = yOf(c.close);
        ctx.fillRect(x - barW * 0.35, Math.min(yO, yC), barW * 0.7, Math.max(1, Math.abs(yC - yO)));
      }

      // Overlay polyline helper
      const line = (data: TI.Num[], color: string, width = 1.5) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        let started = false;
        for (let i = 0; i < view.length; i++) {
          const v = data[start + i];
          if (v == null) { started = false; continue; }
          const x = xOf(i), y = yOf(v);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
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
      if (on.psar) { ctx.fillStyle = '#e5e7eb'; for (let i = 0; i < view.length; i++) { const v = s.psar[start + i]; if (v == null) continue; ctx.beginPath(); ctx.arc(xOf(i), yOf(v), 1.3, 0, Math.PI * 2); ctx.fill(); } }

      // GEX dealer levels (dashed, labeled) — same prices the ladder lists, so they align.
      const level = (price: any, color: string, label: string) => {
        if (typeof price !== 'number' || price <= 0) return;
        const y = yOf(price); if (y < padT || y > padT + priceH) return;
        ctx.strokeStyle = color; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(label, padL + 4, y - 5);
      };
      level(profile.callWall, '#22c55e', 'Call Wall');
      level(profile.putWall, '#ef4444', 'Put Wall');
      level(profile.gammaFlip, '#eab308', 'γ Flip');
      level(profile.magnet, '#a855f7', 'Magnet');
      if (profile.spot && profile.expectedMovePct) {
        level(profile.spot * (1 + profile.expectedMovePct), '#60a5fa', 'EM +');
        level(profile.spot * (1 - profile.expectedMovePct), '#60a5fa', 'EM −');
      }

      // Displacement markers — gold + ringed when the burst lands on a dealer level.
      if (showDisp) {
        for (const d of displacements) {
          const iv = d.i - start; if (iv < 0 || iv >= view.length) continue;
          const c = view[iv], x = xOf(iv);
          const y = d.dir > 0 ? yOf(c.low) + 9 : yOf(c.high) - 9, sz = 4;
          ctx.fillStyle = d.onLevel ? '#f5b300' : (d.dir > 0 ? '#22c55e' : '#ef4444');
          ctx.beginPath();
          if (d.dir > 0) { ctx.moveTo(x, y - sz); ctx.lineTo(x - sz, y + sz); ctx.lineTo(x + sz, y + sz); }
          else { ctx.moveTo(x, y + sz); ctx.lineTo(x - sz, y - sz); ctx.lineTo(x + sz, y - sz); }
          ctx.closePath(); ctx.fill();
          if (d.onLevel) { ctx.strokeStyle = '#f5b300'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); }
        }
      }

      // Crosshair + OHLC readout
      if (hover) {
        const iv = Math.round((hover.x - padL - barW / 2) / barW);
        if (iv >= 0 && iv < view.length) {
          const x = xOf(iv), c = view[iv];
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + priceH); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(padL, hover.y); ctx.lineTo(padL + plotW, hover.y); ctx.stroke(); ctx.setLineDash([]);
          const txt = `O ${c.open.toFixed(decimals)}  H ${c.high.toFixed(decimals)}  L ${c.low.toFixed(decimals)}  C ${c.close.toFixed(decimals)}  V ${(c.volume || 0).toFixed(0)}`;
          ctx.fillStyle = '#0a0a0a'; ctx.fillRect(padL, padT, ctx.measureText(txt).width + 12, 16);
          ctx.fillStyle = c.close >= c.open ? '#22c55e' : '#ef4444'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(txt, padL + 6, padT + 3);
        }
      }
    };

    draw();
    const ro = new ResizeObserver(() => requestAnimationFrame(draw));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [candles, s, displacements, on, showDisp, hover, profile, decimals]);

  return (
    <div className="w-full h-full flex flex-col bg-[var(--surface)]" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Indicator toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0">
        {OVERLAYS.map(o => (
          <button
            key={o.key}
            onClick={() => setOn(p => ({ ...p, [o.key]: !p[o.key] }))}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold uppercase tracking-wide border transition-colors cursor-pointer ${on[o.key] ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]' : 'bg-transparent border-transparent text-[var(--text-tertiary)] opacity-50'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.color, opacity: on[o.key] ? 1 : 0.4 }} />
            {o.label}
          </button>
        ))}
        <button
          onClick={() => setShowDisp(v => !v)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold uppercase tracking-wide border transition-colors cursor-pointer ${showDisp ? 'bg-[var(--warning)]/15 border-[var(--warning)]/40 text-[var(--warning)]' : 'bg-transparent border-transparent text-[var(--text-tertiary)] opacity-50'}`}
          title="Displacement bursts (gold = landed on a dealer GEX level)"
        >
          ⚡ DISPLACEMENT
        </button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1 min-h-[300px]" style={{ position: 'relative', flex: 1, minHeight: 300 }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onMouseMove={e => { const r = canvasRef.current!.getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
          onMouseLeave={() => setHover(null)}
        />
      </div>
    </div>
  );
}
