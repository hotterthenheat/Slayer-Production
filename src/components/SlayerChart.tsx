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

const COL = {
  up: '#26d07c', down: '#ff4d5e', upVol: 'rgba(38,208,124,0.30)', downVol: 'rgba(255,77,94,0.30)',
  grid: 'rgba(255,255,255,0.05)', axis: '#7d8694', axisDim: '#565e6b',
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

  // Everything off by default except the dealer gamma-map (this is a dealer chart, not a TA chart).
  const [ovOn, setOvOn] = useState<Record<string, boolean>>({});
  const [paneOn, setPaneOn] = useState<Record<string, boolean>>({});
  const [showGex, setShowGex] = useState(true);
  const [showDisp, setShowDisp] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<{ bars: number; off: number }>({ bars: 110, off: 0 });

  const tfKey = useContractStore(s => s.selectedTimeframe);
  const tickKey = useContractStore(s => s.selectedAsset?.ticker);
  useEffect(() => { setView({ bars: 110, off: 0 }); }, [tfKey, tickKey]);

  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; off: number } | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const drawRef = useRef<() => void>(() => {});
  const geomRef = useRef<{ plotL: number; plotR: number; barW: number; start: number; end: number; n: number } | null>(null);

  const ohlcv = useMemo<OHLCV>(() => ({ o: candles.map(c => c.open), h: candles.map(c => c.high), l: candles.map(c => c.low), c: candles.map(c => c.close), v: candles.map(c => c.volume) }), [candles]);
  const atr = useMemo(() => TI.atr(ohlcv.h, ohlcv.l, ohlcv.c, 14), [ohlcv]);

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
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.font = '11px ui-monospace, monospace'; ctx.textBaseline = 'middle';

    if (candles.length === 0) { ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'; ctx.fillText('Awaiting candle stream…', W / 2, H / 2); return; }

    const axisW = 60, topPad = 6, xAxisH = 22;
    const gammaW = (showGex && profile.strikes && profile.strikes.length) ? 46 : 0;
    const plotL = 2, plotR = W - axisW - gammaW, plotW = plotR - plotL, gammaR = plotR + gammaW;
    const availH = H - topPad - xAxisH;
    const subH = paneSeries.length ? Math.min(86, (availH * 0.42) / paneSeries.length) : 0;
    const priceH = availH - subH * paneSeries.length;
    const priceTop = topPad, priceBottom = topPad + priceH;

    const n = candles.length;
    const bars = Math.max(20, Math.min(n, viewRef.current.bars));
    const off = Math.max(0, Math.min(Math.max(0, n - 10), viewRef.current.off));
    const end = n - off, start = Math.max(0, end - bars);
    const barW = plotW / bars;
    const xOf = (gi: number) => plotL + (gi - start) * barW + barW / 2;
    const vis = candles.slice(start, end);

    let lo = Infinity, hi = -Infinity;
    for (const c of vis) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
    if (!isFinite(lo) || !isFinite(hi)) return;
    const cRange = (hi - lo) || (hi || 1) * 0.01;
    const capLo = lo - cRange * 0.85, capHi = hi + cRange * 0.85;
    const levelPrices = [profile.spot, profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet];
    if (profile.spot && profile.expectedMovePct) levelPrices.push(profile.spot * (1 + profile.expectedMovePct), profile.spot * (1 - profile.expectedMovePct));
    for (const p of levelPrices) { if (typeof p === 'number' && p > 0 && p >= capLo && p <= capHi) { lo = Math.min(lo, p); hi = Math.max(hi, p); } }
    const pad = ((hi - lo) || 1) * 0.08; lo -= pad; hi += pad;
    const volBandH = priceH * 0.13, priceAreaH = priceH - volBandH;
    const yP = (p: number) => priceTop + priceAreaH - ((p - lo) / (hi - lo)) * priceAreaH;
    const pOfY = (y: number) => lo + (1 - (y - priceTop) / priceAreaH) * (hi - lo);
    geomRef.current = { plotL, plotR, barW, start, end, n };

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
      gridYs.push({ y, label: g.toFixed(decimals) });
    }

    let lastDayTickX = -1e9;
    for (let i = 0; i < vis.length; i++) {
      const gi = start + i; const c = candles[gi]; if (!c) continue;
      const prev = candles[gi - 1];
      if (prev && !sameDay(prev.timestamp, c.timestamp)) { const x = xOf(gi); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(px(x - barW / 2), priceTop); ctx.lineTo(px(x - barW / 2), priceBottom); ctx.stroke(); lastDayTickX = x; }
    }

    // Volume strip — opacity scales with price velocity (|Δ| vs ATR) so impulse bars read louder.
    let maxVol = 0; for (const c of vis) maxVol = Math.max(maxVol, c.volume || 0);
    const volBase = priceBottom;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(plotL, px(priceBottom - volBandH - 1)); ctx.lineTo(plotR, px(priceBottom - volBandH - 1)); ctx.stroke();
    for (let i = 0; i < vis.length; i++) {
      const gi = start + i, c = vis[i], vh = maxVol ? ((c.volume || 0) / maxVol) * (volBandH - 2) : 0;
      const a = atr[gi], vel = a && a > 0 ? Math.min(1, Math.abs(c.close - c.open) / (1.6 * a)) : 0.4;
      const alpha = 0.2 + vel * 0.45;
      ctx.fillStyle = (c.close >= c.open ? `rgba(38,208,124,${alpha.toFixed(3)})` : `rgba(255,77,94,${alpha.toFixed(3)})`);
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
        ctx.fillStyle = (r.netGex || 0) >= 0 ? (isWall ? 'rgba(38,208,124,0.95)' : 'rgba(38,208,124,0.6)') : (isWall ? 'rgba(255,77,94,0.95)' : 'rgba(255,77,94,0.6)');
        ctx.fillRect(plotR + 2, y - thick / 2, len, thick);
      }
      ctx.fillStyle = COL.axisDim; ctx.textAlign = 'left'; ctx.font = '8px ui-monospace, monospace'; ctx.fillText('γ', plotR + 3, priceTop + 7); ctx.font = '11px ui-monospace, monospace';
    }

    // candles
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i], x = xOf(start + i), up = c.close >= c.open, col = up ? COL.up : COL.down;
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(px(x), Math.round(yP(c.high))); ctx.lineTo(px(x), Math.round(yP(c.low))); ctx.stroke();
      const yO = yP(c.open), yC = yP(c.close), bw = Math.max(1, barW * 0.7);
      ctx.fillRect(Math.round(x - bw / 2), Math.round(Math.min(yO, yC)), Math.round(bw), Math.max(1, Math.round(Math.abs(yC - yO))));
    }

    // overlays (registry-driven)
    const drawSeries = (ser: Series) => {
      if (ser.dots) { ctx.fillStyle = ser.color; for (let i = 0; i < vis.length; i++) { const val = ser.vals[start + i]; if (val == null) continue; ctx.beginPath(); ctx.arc(xOf(start + i), yP(val), 1.3, 0, Math.PI * 2); ctx.fill(); } return; }
      ctx.strokeStyle = ser.color; ctx.lineWidth = ser.w || 1.5; ctx.lineJoin = 'round'; ctx.beginPath(); let st = false;
      for (let i = 0; i < vis.length; i++) { const val = ser.vals[start + i]; if (val == null) { st = false; continue; } const x = xOf(start + i), y = yP(val); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.lineWidth = 1;
    };
    for (const key of Object.keys(overlaySeries)) for (const ser of overlaySeries[key]) drawSeries(ser);

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
      if (L.off) { ctx.textAlign = 'right'; ctx.fillText(L.price >= 100 ? L.price.toFixed(0) : L.price.toFixed(decimals), W - 3, L.y); }
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
      ctx.fillStyle = d.onLevel ? '#f5c518' : (d.dir > 0 ? COL.up : COL.down);
      ctx.beginPath();
      if (d.dir > 0) { ctx.moveTo(x, y - z); ctx.lineTo(x - z, y + z); ctx.lineTo(x + z, y + z); } else { ctx.moveTo(x, y + z); ctx.lineTo(x - z, y - z); ctx.lineTo(x + z, y - z); }
      ctx.closePath(); ctx.fill();
      if (d.onLevel) { ctx.strokeStyle = '#f5c518'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
    }

    if (lastY >= priceTop && lastY <= priceBottom) {
      ctx.strokeStyle = lastUp ? 'rgba(38,208,124,0.55)' : 'rgba(255,77,94,0.55)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(plotL, px(lastY) - 0.5); ctx.lineTo(plotR, px(lastY) - 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = lastUp ? COL.up : COL.down; const tagW = axisW + gammaW - 1;
      (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(plotR + 1, lastY - 8, tagW, 16, 3), ctx.fill()) : ctx.fillRect(plotR + 1, lastY - 8, tagW, 16);
      ctx.fillStyle = '#06090d'; ctx.textAlign = 'left'; ctx.font = '700 11px ui-monospace, monospace'; ctx.fillText(last.toFixed(decimals), plotR + 6, lastY); ctx.font = '11px ui-monospace, monospace';
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
      if (data.hist) { const z = yS(0); for (let i = 0; i < vis.length; i++) { const v = data.hist.vals[start + i]; if (v == null) continue; const x = xOf(start + i), y = yS(v as number); ctx.fillStyle = (v as number) >= 0 ? 'rgba(38,208,124,0.55)' : 'rgba(255,77,94,0.55)'; ctx.fillRect(x - barW * 0.3, Math.min(y, z), barW * 0.6, Math.max(1, Math.abs(y - z))); } }
      for (const ln of data.lines) {
        ctx.strokeStyle = ln.color; ctx.lineWidth = 1.3; ctx.beginPath(); let stt = false;
        for (let i = 0; i < vis.length; i++) { const val = ln.vals[start + i]; if (val == null) { stt = false; continue; } const x = xOf(start + i), y = yS(val); if (!stt) { ctx.moveTo(x, y); stt = true; } else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.lineWidth = 1;
      }
      const lastV = (data.lines[0]?.vals[n - 1] ?? data.hist?.vals[n - 1]);
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'left'; ctx.font = '700 9px ui-monospace, monospace';
      ctx.fillText(`${data.readout}${lastV != null ? '  ' + fmtOsc(lastV as number) : ''}`, plotL + 4, top + 9);
      ctx.font = '11px ui-monospace, monospace';
    };
    paneSeries.forEach((entry, idx) => drawPane(entry, priceBottom + idx * subH, subH));

    const axisY = H - xAxisH; ctx.fillStyle = COL.axisDim; ctx.textAlign = 'center';
    const ticks = Math.max(2, Math.floor(plotW / 96));
    for (let t = 0; t <= ticks; t++) { const gi = start + Math.round(((end - 1 - start) * t) / ticks); if (gi < start || gi >= end || !candles[gi]) continue; const c = candles[gi]; const lbl = (lastDayTickX > 0 && Math.abs(xOf(gi) - lastDayTickX) < 40) ? `${new Date(c.timestamp).getMonth() + 1}/${new Date(c.timestamp).getDate()}` : fmtTime(c.timestamp); ctx.fillText(lbl, xOf(gi), axisY + 11); }

    const hv = hoverRef.current;
    if (hv && hv.x >= plotL && hv.x <= plotR) {
      const gi = Math.max(start, Math.min(end - 1, start + Math.round((hv.x - plotL - barW / 2) / barW)));
      const cx = xOf(gi);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px(cx), priceTop); ctx.lineTo(px(cx), H - xAxisH); ctx.stroke();
      if (hv.y > priceTop && hv.y < H - xAxisH) { ctx.beginPath(); ctx.moveTo(plotL, px(hv.y)); ctx.lineTo(plotR, px(hv.y)); ctx.stroke(); }
      ctx.setLineDash([]);
      if (hv.y >= priceTop && hv.y <= priceBottom - volBandH) {
        const pr = pOfY(hv.y);
        ctx.fillStyle = '#252b36'; (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(plotR + 1, hv.y - 8, axisW + gammaW - 1, 16, 3), ctx.fill()) : ctx.fillRect(plotR + 1, hv.y - 8, axisW + gammaW - 1, 16); ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'left'; ctx.fillText(pr.toFixed(decimals), plotR + 6, hv.y);
      }
      const c = candles[gi]; ctx.fillStyle = '#252b36'; ctx.textAlign = 'center'; const tw = 40; ctx.fillRect(cx - tw / 2, H - xAxisH, tw, xAxisH); ctx.fillStyle = '#e5e7eb'; ctx.fillText(fmtTime(c.timestamp), cx, H - xAxisH + 11);
      const up = c.close >= c.open, dC = c.close - c.open, dPct = c.open ? (dC / c.open) * 100 : 0;
      const txt = `O ${c.open.toFixed(decimals)}   H ${c.high.toFixed(decimals)}   L ${c.low.toFixed(decimals)}   C ${c.close.toFixed(decimals)}   ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%   V ${(c.volume || 0) >= 1e6 ? ((c.volume || 0) / 1e6).toFixed(2) + 'M' : (c.volume || 0).toFixed(0)}`;
      ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left'; const wTxt = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(8,10,14,0.82)'; ctx.fillRect(plotL + 2, priceTop + 2, wTxt, 16); ctx.fillStyle = up ? COL.up : COL.down; ctx.fillText(txt, plotL + 9, priceTop + 10);
    } else {
      ctx.textAlign = 'left'; ctx.font = '11px ui-monospace, monospace';
      const segs: { t: string; c: string }[] = [];
      const dC = n > 1 ? candles[n - 1].close - candles[n - 2].close : 0, dPct = n > 1 && candles[n - 2].close ? (dC / candles[n - 2].close) * 100 : 0;
      segs.push({ t: `${tickKey || ''}${tfKey ? ' · ' + tfKey : ''}`, c: '#cbd5e1' });
      segs.push({ t: `${last.toFixed(decimals)}  ${dC >= 0 ? '+' : ''}${dPct.toFixed(2)}%`, c: lastUp ? COL.up : COL.down });
      for (const d of OVERLAY_DEFS) { if (!ovOn[d.key] || !overlaySeries[d.key]) continue; const v = overlaySeries[d.key][0]?.vals[n - 1]; if (v != null) segs.push({ t: `${d.label} ${(v as number).toFixed(decimals)}`, c: overlaySeries[d.key][0].color }); }
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
      const n = candlesRef.current.length || 300, factor = e.deltaY > 0 ? 1.15 : 0.87;
      const cur = viewRef.current, next = Math.max(20, Math.min(n, Math.round(cur.bars * factor)));
      if (next === cur.bars) return;
      const g = geomRef.current, r = canvas.getBoundingClientRect(), mx = e.clientX - r.left;
      if (g && mx >= g.plotL && mx <= g.plotR) {
        const giUnder = g.start + (mx - g.plotL) / g.barW, newBarW = (g.plotR - g.plotL) / next, newStart = giUnder - (mx - g.plotL) / newBarW;
        const newOff = Math.max(0, Math.min(Math.max(0, n - 10), Math.round(n - next - newStart)));
        setView({ bars: next, off: newOff });
      } else setView(v => ({ ...v, bars: next }));
    };
    const onDown = (e: MouseEvent) => { dragRef.current = { x: e.clientX, off: viewRef.current.off }; };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect(); hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      const drag = dragRef.current;
      if (drag && geomRef.current) {
        const n = candlesRef.current.length, barW = geomRef.current.barW;
        const nextOff = Math.max(0, Math.min(Math.max(0, n - 10), drag.off + Math.round((e.clientX - drag.x) / barW)));
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

  useEffect(() => { drawRef.current(); }, [candles, overlaySeries, paneSeries, displacements, showGex, showDisp, view, profile, decimals, tfKey, tickKey]);

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

  return (
    <div className="w-full h-full flex flex-col bg-black" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)] shrink-0 relative">
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
        {/* Active indicator chips (click to remove) */}
        {OVERLAY_DEFS.filter(d => ovOn[d.key]).map(d => removeChip(d.label, d.build(ohlcv)[0]?.color || '#888', () => setOvOn(p => ({ ...p, [d.key]: false }))))}
        {PANE_DEFS.filter(d => paneOn[d.key]).map(d => removeChip(d.label, '#7d8694', () => setPaneOn(p => ({ ...p, [d.key]: false }))))}

        <div className="ml-auto flex items-center gap-1">
          {specChip(showGex, 'γ-MAP', () => setShowGex(v => !v))}
          {specChip(showDisp, '⚡ DISP', () => setShowDisp(v => !v), 'warn')}
          {view.off > 0 && <button onClick={() => setView(v => ({ ...v, off: 0 }))} className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)]">⟳ LIVE</button>}
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-[300px]" style={{ position: 'relative', flex: 1, minHeight: 300 }}>
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
