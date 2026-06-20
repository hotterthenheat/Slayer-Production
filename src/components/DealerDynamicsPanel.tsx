import React from 'react';
import { useContractStore } from '../lib/store';
import { Activity, Waves, Hourglass, Move, Wind, BrickWall } from 'lucide-react';
import type { DealerDynamics } from '../lib/dealerDynamics';

const num = (v: any, d = 0) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

function Tile({ label, value, sub, tone = '#E5E5E5', active = false }: { label: string; value: string; sub?: string; tone?: string; active?: boolean }) {
  return (
    <div className="rounded-md border p-2.5 flex flex-col gap-1" style={{ borderColor: active ? `${tone}66` : 'rgba(63,63,70,0.5)', background: active ? `${tone}10` : 'rgba(0,0,0,0.35)' }}>
      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 leading-tight">{label}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none" style={{ color: tone }}>{value}</span>
      {sub && <span className="text-[8px] text-zinc-500 tabular-nums leading-tight">{sub}</span>}
    </div>
  );
}

/**
 * Dealer Dynamics — the time-derivative + structural layer on top of GEX:
 * vanna/charm hedge flow, strike migration, gamma velocity, liquidity vacuums and
 * wall strength. Lives in the Dealer Flow tab alongside the static positioning.
 */
export function DealerDynamicsPanel() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const decimals = selectedAsset?.decimals ?? 2;
  const dd = serverState?.dealer_dynamics as DealerDynamics | null | undefined;

  if (!dd) {
    return (
      <div className="rounded-lg border border-black/60 bg-black/40 p-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 animate-pulse">Computing dealer dynamics…</p>
      </div>
    );
  }

  const fmtK = (v: number) => `${v >= 0 ? '+' : '−'}$${(Math.abs(v) / 1e6).toFixed(1)}M`;
  const dirTone = (d: string) => (d === 'BULLISH' ? '#4ADE80' : d === 'BEARISH' ? '#F87171' : '#60A5FA');
  const trendTone = (t: string) => (t === 'RISING' ? '#4ADE80' : t === 'FALLING' ? '#F87171' : '#60A5FA');

  const v = dd.vanna, c = dd.charm, m = dd.migration, g = dd.gamma, vac = dd.vacuums, w = dd.walls;
  const fmtZone = (z: { lo: number; hi: number } | null) =>
    !z ? '—' : `${z.lo.toLocaleString(undefined, { maximumFractionDigits: decimals })}–${z.hi.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;

  return (
    <div className="rounded-lg border border-black/60 bg-black/30 p-4 flex flex-col gap-4 shadow-inner">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-[#C084FC]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[#E5E5E5]">Dealer Dynamics — {selectedAsset?.ticker}</h2>
        <span className="text-[8px] text-zinc-500 uppercase tracking-widest ml-auto">vanna · charm · migration · vacuums · walls</span>
      </div>

      {/* Vanna + Charm + Gamma + Migration */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Vanna Hedge Flow" value={v.hedgeFlow} sub={`${v.trend} · ${fmtK(v.net)}`} tone={v.hedgeFlow === 'SUPPORTIVE' ? '#4ADE80' : v.hedgeFlow === 'PRESSURING' ? '#F87171' : '#60A5FA'} active />
        <Tile label="Charm Decay Bias" value={c.bias} sub={`${fmtK(c.netPerDay)}/day · ${Math.round(c.intensity * 100)}% int`} tone={dirTone(c.bias)} active />
        <Tile label="Gamma Hedging" value={g.state.replace('_', ' ')} sub={`vel ${fmtK(g.velocity)}`} tone={g.state === 'ADDING_HEDGES' ? '#4ADE80' : g.state === 'REMOVING_HEDGES' ? '#F87171' : '#60A5FA'} active />
        <Tile label="Strike Migration" value={m.direction} sub={`CoM ${m.shift >= 0 ? '+' : ''}${num(m.shift, decimals)}`} tone={dirTone(m.direction)} active={m.direction !== 'STABLE'} />
      </div>

      {/* Wall strength + liquidity vacuums */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><BrickWall className="w-3 h-3 text-zinc-400" /><h3 className="text-[9px] font-black tracking-widest uppercase text-zinc-400">Wall Strength (0-100)</h3></div>
          {[{ label: 'Resistance', x: w.resistance, tone: '#F87171' }, { label: 'Support', x: w.support, tone: '#4ADE80' }].map(({ label, x, tone }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[9px] font-bold w-20 shrink-0" style={{ color: tone }}>{label} {x ? num(x.strike, decimals) : ''}</span>
              <div className="flex-1 h-2 rounded-sm bg-black/50 overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: `${x ? x.score : 0}%`, background: tone }} />
              </div>
              <span className="text-[9px] tabular-nums w-8 text-right" style={{ color: tone }}>{x ? x.score : '—'}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><Wind className="w-3 h-3 text-zinc-400" /><h3 className="text-[9px] font-black tracking-widest uppercase text-zinc-400">Liquidity Vacuums</h3></div>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Nearest Above" value={fmtZone(vac.nearestAbove)} sub={vac.nearestAbove ? `${(vac.nearestAbove.widthPct * 100).toFixed(1)}% gap · ${Math.round(vac.nearestAbove.score * 100)}%` : 'none'} tone="#F87171" active={!!vac.nearestAbove} />
            <Tile label="Nearest Below" value={fmtZone(vac.nearestBelow)} sub={vac.nearestBelow ? `${(vac.nearestBelow.widthPct * 100).toFixed(1)}% gap · ${Math.round(vac.nearestBelow.score * 100)}%` : 'none'} tone="#4ADE80" active={!!vac.nearestBelow} />
          </div>
          <span className="text-[8px] text-zinc-600 leading-tight">Thin OI/GEX/volume bands — price tends to move fast through these (explosive-move targets).</span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[9px] text-zinc-500 bg-black/30 border border-zinc-900 rounded px-3 py-2">
        <Waves className="w-3.5 h-3.5 text-[#C084FC] shrink-0 mt-0.5" />
        <span>{v.note}</span>
      </div>
    </div>
  );
}
