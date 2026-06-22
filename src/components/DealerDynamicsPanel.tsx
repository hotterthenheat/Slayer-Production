import React from 'react';
import { useContractStore } from '../lib/store';
import { Activity, Waves, Hourglass, Move, Wind, BrickWall } from 'lucide-react';
import type { DealerDynamics } from '../lib/dealerDynamics';
import { PanelSkeleton } from './PanelSkeleton';

const num = (v: any, d = 0) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

function Tile({ label, value, sub, tone = '#E5E5E5', active = false }: { label: string; value: string; sub?: string; tone?: string; active?: boolean }) {
  return (
    <div className="rounded-md border p-2.5 flex flex-col gap-1 bg-[var(--surface-2)]" style={{ borderColor: active ? `${tone}66` : 'var(--border)', background: active ? `${tone}10` : undefined }}>
      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)] leading-tight">{label}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none" style={{ color: tone }}>{value}</span>
      {sub && <span className="text-[9px] text-[var(--text-tertiary)] tabular-nums leading-tight">{sub}</span>}
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
    return <PanelSkeleton label="Dealer Dynamics" />;
  }

  const fmtK = (v: number) => {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v), sign = v >= 0 ? '+' : '−';
    if (a >= 1e9) return `${sign}$${(a / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toLocaleString(undefined, { maximumFractionDigits: 0 })}K`;
    return `${sign}$${a.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };
  const dirTone = (d: string) => (d === 'BULLISH' ? '#4ADE80' : d === 'BEARISH' ? '#F87171' : '#60A5FA');
  const trendTone = (t: string) => (t === 'RISING' ? '#4ADE80' : t === 'FALLING' ? '#F87171' : '#60A5FA');

  const v = dd.vanna, c = dd.charm, m = dd.migration, g = dd.gamma, vac = dd.vacuums, w = dd.walls;
  const fmtZone = (z: { lo: number; hi: number } | null) =>
    !z ? '—' : `${z.lo.toLocaleString(undefined, { maximumFractionDigits: decimals })}–${z.hi.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4" style={{ borderLeftColor: '#C084FC', borderLeftWidth: '3px' }}>
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
        <Activity className="w-4 h-4 text-[#C084FC]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">Dealer Dynamics — {selectedAsset?.ticker}</h2>
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest ml-auto hidden sm:block">hedging flow · time decay · gamma · walls</span>
      </div>

      {/* Vanna + Charm + Gamma + Migration */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Vanna (dealer hedging)" value={v.hedgeFlow} sub={`${v.trend} · ${fmtK(v.net)}`} tone={v.hedgeFlow === 'SUPPORTIVE' ? '#4ADE80' : v.hedgeFlow === 'PRESSURING' ? '#F87171' : '#60A5FA'} active />
        <Tile label="Charm (time decay of hedges)" value={c.bias} sub={`${fmtK(c.netPerDay)}/day · ${Math.round(c.intensity * 100)}% intensity`} tone={dirTone(c.bias)} active />
        <Tile label="Dealer gamma hedging" value={g.state.replace('_', ' ')} sub={`rate ${fmtK(g.velocity)}`} tone={g.state === 'ADDING_HEDGES' ? '#4ADE80' : g.state === 'REMOVING_HEDGES' ? '#F87171' : '#60A5FA'} active />
        <Tile label="Strike migration (where dealer gamma is shifting)" value={m.direction} sub={`Center ${m.shift >= 0 ? '+' : ''}${num(m.shift, decimals)}`} tone={dirTone(m.direction)} active={m.direction !== 'STABLE'} />
      </div>

      {/* Wall strength + liquidity vacuums */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><BrickWall className="w-3 h-3 text-[var(--text-tertiary)]" /><h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">Wall Strength (0-100)</h3></div>
          {[{ label: 'Resistance', x: w.resistance, tone: '#F87171' }, { label: 'Support', x: w.support, tone: '#4ADE80' }].map(({ label, x, tone }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[10px] font-bold w-20 shrink-0" style={{ color: tone }}>{label} {x ? num(x.strike, decimals) : ''}</span>
              <div className="flex-1 h-2 rounded-sm bg-[var(--surface-3)] overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: `${x ? x.score : 0}%`, background: tone }} />
              </div>
              <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: tone }}>{x ? x.score : '—'}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><Wind className="w-3 h-3 text-[var(--text-tertiary)]" /><h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">Liquidity Vacuums (fast-move zones)</h3></div>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Nearest Above" value={fmtZone(vac.nearestAbove)} sub={vac.nearestAbove ? `${(vac.nearestAbove.widthPct * 100).toFixed(1)}% gap · ${Math.round(vac.nearestAbove.score * 100)}%` : 'none'} tone="#F87171" active={!!vac.nearestAbove} />
            <Tile label="Nearest Below" value={fmtZone(vac.nearestBelow)} sub={vac.nearestBelow ? `${(vac.nearestBelow.widthPct * 100).toFixed(1)}% gap · ${Math.round(vac.nearestBelow.score * 100)}%` : 'none'} tone="#4ADE80" active={!!vac.nearestBelow} />
          </div>
          <span className="text-[9px] text-[var(--text-tertiary)] leading-tight">Thin OI and volume gaps — price can move quickly through these zones.</span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2">
        <Waves className="w-3.5 h-3.5 text-[#C084FC] shrink-0 mt-0.5" />
        <span>{v.note}</span>
      </div>
    </div>
  );
}
