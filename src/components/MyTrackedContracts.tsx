/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MY TRACKED CONTRACTS — the per-user live positions panel on the Trade History page.
 *
 * Polls /api/tracked for the signed-in user's tracked contracts (open + closed),
 * shows live P&L, the math-computed exit plan (T1/T2/stop), scale state and the slot
 * count (X/10), and lets the user close an open contract manually. The server's exit
 * engine auto-closes positions on target/stop/time/model-edge between polls.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Crosshair, X, Loader2 } from 'lucide-react';

interface TrackedTrade {
  id: string;
  underlying: string;
  contract: string;
  direction: string;
  category: string;
  entryPrice: number;
  currentPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  status: 'OPEN' | 'CLOSED';
  pnl: number;
  pnlPct: number;
  maxGain: number;
  maxDrawdown: number;
  qtyOpen: number;
  scaledOut: boolean;
  exitReason: string | null;
  outcome: string | null;
  elapsedMin: number;
  timeStopMin: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  top_opportunity: 'Top Opportunity',
  discounted: 'Discounted',
  quickscalp: 'QuickScalp',
  manual: 'Manual',
};

const fmt = (v: number, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—');

export function MyTrackedContracts() {
  const [trades, setTrades] = useState<TrackedTrade[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [maxOpen, setMaxOpen] = useState(10);
  const [loaded, setLoaded] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/tracked', { credentials: 'include' });
      if (!res.ok) { setLoaded(true); return; }
      const data = await res.json();
      setTrades(data.trades || []);
      setOpenCount(data.openCount || 0);
      setMaxOpen(data.maxOpen || 10);
    } catch {
      /* keep last good state */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const close = async (id: string) => {
    setClosing(id);
    try {
      await fetch(`/api/tracked/${id}/close`, { method: 'POST', credentials: 'include' });
      await refresh();
    } finally {
      setClosing(null);
    }
  };

  const open = trades.filter((t) => t.status === 'OPEN');
  const closed = trades.filter((t) => t.status === 'CLOSED').slice(0, 8);

  return (
    <div className="rounded-xl border bg-white/[0.02] p-5 shadow-lg" style={{ borderColor: 'rgba(96,165,250,0.22)', borderLeftColor: 'rgba(96,165,250,0.9)', borderLeftWidth: '3px' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[#60A5FA]" />
          <span className="text-[11px] font-black tracking-widest uppercase text-[#E5E5E5]">My Tracked Contracts</span>
        </div>
        <span className="text-[10px] font-mono font-bold text-zinc-300">
          <span style={{ color: openCount >= maxOpen ? '#F87171' : '#60A5FA' }}>{openCount}</span> / {maxOpen} slots
        </span>
      </div>

      {!loaded ? (
        <div className="text-[10px] text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading your contracts…</div>
      ) : open.length === 0 && closed.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
          <div className="text-[11px] text-zinc-300 font-bold mb-1">No tracked contracts yet</div>
          <div className="text-[10px] text-zinc-400">Add a contract from Sky Vision (or the setups) and the engine will track it here and auto-exit on target, stop, time, or a thesis break.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* OPEN */}
          {open.length > 0 && (
            <div className="space-y-2">
              {open.map((t) => {
                const up = t.pnlPct >= 0;
                const pnlTone = up ? '#4ADE80' : '#F87171';
                return (
                  <div key={t.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-black text-[#E5E5E5]">{t.contract}</span>
                        <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>{CATEGORY_LABEL[t.category] || t.category}</span>
                        {t.scaledOut && <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}>SCALED ½ @ T1</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[15px] font-black leading-none" style={{ color: pnlTone }}>{up ? '+' : ''}{fmt(t.pnlPct, 1)}%</div>
                          <div className="text-[9px]" style={{ color: pnlTone }}>{up ? '+' : ''}${fmt(t.pnl)}</div>
                        </div>
                        <button onClick={() => close(t.id)} disabled={closing === t.id} className="rounded-md p-1.5 border border-rose-500/30 text-[#F87171] hover:bg-rose-500/10 transition-colors disabled:opacity-50" title="Close now">
                          {closing === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                      <div><span className="text-zinc-400">Entry </span><span className="font-mono text-[#E5E5E5]">${fmt(t.entryPrice)}</span></div>
                      <div><span className="text-zinc-400">Now </span><span className="font-mono text-[#E5E5E5]">${fmt(t.currentPrice)}</span></div>
                      <div><span className="text-zinc-400">T1 </span><span className="font-mono text-[#4ADE80]">${fmt(t.target1)}</span></div>
                      <div><span className="text-zinc-400">T2 </span><span className="font-mono text-[#4ADE80]">${fmt(t.target2)}</span></div>
                      <div><span className="text-zinc-400">Stop </span><span className="font-mono text-[#F87171]">${fmt(t.stopLoss)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CLOSED */}
          {closed.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-zinc-400 mb-1.5">Recently Closed</div>
              <div className="space-y-1">
                {closed.map((t) => {
                  const win = (t.outcome || '') === 'WIN';
                  const tone = win ? '#4ADE80' : t.outcome === 'LOSS' ? '#F87171' : '#A3A3A3';
                  return (
                    <div key={t.id} className="flex items-center justify-between text-[10px] rounded px-2 py-1.5 bg-black/20">
                      <span className="font-mono font-bold text-[#E5E5E5]">{t.contract}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-400 uppercase text-[8.5px]">{(t.exitReason || '').replace('_', ' ')}</span>
                        <span className="font-black uppercase text-[8.5px] px-1.5 py-0.5 rounded" style={{ background: `${tone}1a`, color: tone }}>{t.outcome}</span>
                        <span className="font-mono font-bold w-14 text-right" style={{ color: tone }}>{t.pnlPct >= 0 ? '+' : ''}{fmt(t.pnlPct, 1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
