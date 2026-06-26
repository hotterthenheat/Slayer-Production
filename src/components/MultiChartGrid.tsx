import React, { useEffect, useState } from 'react';
import { InteractiveChart } from './InteractiveChart';
import { ASSET_LIST } from '../data';
import { Candle } from '../types';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '1D'];
const DEFAULT_TICKERS = ['SPX', 'QQQ', 'NVDA', 'IWM'];

interface PanelData {
  ticker: string;
  name: string;
  decimals: number;
  candles: Candle[];
  gexLevels?: { callWall?: number; putWall?: number; gammaFlip?: number; magnet?: number };
  gexProfile?: any;
  last: number;
  changePct: number;
}

/**
 * Multi-chart grid — several tickers side by side, each rendered with the shared
 * InteractiveChart (so every panel carries the same VWAP / Bollinger / volume / GEX
 * overlays as the main chart). Candles + GEX strike levels come from /api/multi-chart,
 * polled every few seconds so the grid stays near-live without one socket per panel.
 */
export function MultiChartGrid() {
  const [tf, setTf] = useState('5m');
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [charts, setCharts] = useState<PanelData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: any;
    const load = async () => {
      try {
        const res = await fetch(`/api/multi-chart?tf=${encodeURIComponent(tf)}&tickers=${encodeURIComponent(tickers.join(','))}`);
        if (!res.ok) {
          if (alive) setError(res.status === 401 ? 'Please sign in to view charts.' : 'Could not load charts.');
        } else {
          const data = await res.json();
          if (alive) { setCharts(data.charts || []); setError(null); }
        }
      } catch {
        if (alive) setError('Connection error — retrying…');
      } finally {
        if (alive) timer = setTimeout(load, 4000); // near-live refresh
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [tf, tickers]);

  const toggleTicker = (t: string) => {
    setTickers(prev => prev.includes(t)
      ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) // keep at least one
      : (prev.length < 6 ? [...prev, t] : prev));            // cap at six panels
  };

  return (
    <div className="w-full h-full flex flex-col gap-3 p-3 min-h-0">
      {/* Toolbar: shared timeframe + ticker picker */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] mr-1">Timeframe</span>
          {TIMEFRAMES.map(t => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2 py-1 text-[10px] font-mono font-bold rounded-sm border transition-colors cursor-pointer ${tf === t ? 'bg-[var(--surface-3)] border-[var(--border-strong)] text-[var(--text-primary)]' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            >{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] mr-1">Tickers</span>
          {ASSET_LIST.slice(0, 14).map(a => (
            <button
              key={a.ticker}
              onClick={() => toggleTicker(a.ticker)}
              className={`px-2 py-1 text-[10px] font-mono font-bold rounded-sm border transition-colors cursor-pointer ${tickers.includes(a.ticker) ? 'bg-[var(--success)]/15 border-[var(--success)]/40 text-[var(--success)]' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            >{a.ticker}</button>
          ))}
        </div>
      </div>

      {error && <div className="text-[11px] text-[var(--danger)] font-mono shrink-0">{error}</div>}

      {/* Responsive grid of chart panels */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 auto-rows-fr min-h-0">
        {charts.map(panel => (
          <div key={panel.ticker} className="flex flex-col border border-[var(--border)] rounded-sm bg-[var(--surface)] min-h-[280px] overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] shrink-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-black text-[var(--text-primary)] font-mono">{panel.ticker}</span>
                <span className="text-[11px] tabular-nums text-[var(--text-secondary)]">{panel.last?.toFixed(panel.decimals ?? 2)}</span>
                <span className={`text-[10px] tabular-nums font-bold ${panel.changePct >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {panel.changePct >= 0 ? '+' : ''}{panel.changePct?.toFixed(2)}%
                </span>
              </div>
              {panel.gexLevels && (
                <span className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wide" title="GEX strike levels overlaid">GEX ✓</span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <InteractiveChart
                candles={panel.candles}
                timeframe={tf}
                selectedTicker={panel.ticker}
                priceDecimals={panel.decimals ?? 2}
                gexLevels={panel.gexLevels}
                gexProfile={panel.gexProfile}
                showFVGs={false}
                showLiquiditySweeps={false}
                showDisplacementEvents={false}
                watermarkText={panel.ticker}
              />
            </div>
          </div>
        ))}
        {charts.length === 0 && !error && (
          <div className="col-span-full flex items-center justify-center text-[11px] text-[var(--text-tertiary)] font-mono py-12">Loading charts…</div>
        )}
      </div>
    </div>
  );
}
