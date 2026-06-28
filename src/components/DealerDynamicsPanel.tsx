import React from 'react';
import { useContractStore } from '../lib/store';
import { Activity, Waves, Hourglass, Move, Wind, BrickWall, Crosshair } from 'lucide-react';
import type { DealerDynamics } from '../lib/dealerDynamics';
import { PanelSkeleton } from './PanelSkeleton';

const num = (v: any, d = 0) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

function Tile({ label, value, sub, tone = '#E5E5E5', active = false }: { label: string; value: string; sub?: string; tone?: string; active?: boolean }) {
  return (
    <div className="rounded-md border p-2.5 flex flex-col gap-1 bg-[var(--surface-2)]" style={{ borderColor: active ? `${tone}66` : 'var(--border)', background: active ? `${tone}10` : undefined }}>
      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] leading-tight">{label}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none" style={{ color: tone }}>{value}</span>
      {sub && <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums leading-tight">{sub}</span>}
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
  // Resolve theme tokens once so inline-styled colors track the design system.
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string, f: string) => { const v = css.getPropertyValue(n).trim(); return v || f; };
  const C = { success: tok('--success', '#4ADE80'), danger: tok('--danger', '#F87171'), info: tok('--info', '#60A5FA'), warning: tok('--warning', '#FBBF24') };
  // Honest provenance: the dynamics are computed from the option chain, which is a model
  // until a live provider is connected. Label the panel so model output is never read as live.
  const isLive = !!serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC';
  const dirTone = (d: string) => (d === 'BULLISH' ? C.success : d === 'BEARISH' ? C.danger : C.info);
  const trendTone = (t: string) => (t === 'RISING' ? C.success : t === 'FALLING' ? C.danger : C.info);

  const v = dd.vanna, c = dd.charm, m = dd.migration, g = dd.gamma, vac = dd.vacuums, w = dd.walls;
  const fmtZone = (z: { lo: number; hi: number } | null) =>
    !z ? '—' : `${z.lo.toLocaleString(undefined, { maximumFractionDigits: decimals })}–${z.hi.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4" style={{ borderLeftColor: '#C084FC', borderLeftWidth: '3px' }}>
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
        <Activity className="w-4 h-4 text-[#C084FC]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">Dealer Dynamics — {selectedAsset?.ticker}</h2>
        <span className="px-1 py-0.5 rounded-[2px] text-[8px] font-bold tracking-wider" style={{ color: isLive ? C.success : C.warning, background: `color-mix(in srgb, ${isLive ? C.success : C.warning} 14%, transparent)` }}>{isLive ? 'LIVE' : 'MODEL'}</span>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest ml-auto hidden sm:block">hedging flow · time decay · gamma · walls</span>
      </div>

      {/* Vanna + Charm + Gamma + Migration */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Vanna (dealer hedging)" value={v.hedgeFlow} sub={`${v.trend} · ${fmtK(v.net)}`} tone={v.hedgeFlow === 'SUPPORTIVE' ? C.success : v.hedgeFlow === 'PRESSURING' ? C.danger : C.info} active />
        <Tile label="Charm (time decay of hedges)" value={c.bias} sub={`${fmtK(c.netPerDay)}/day · ${Math.round(c.intensity * 100)}% intensity`} tone={dirTone(c.bias)} active />
        <Tile label="Dealer gamma hedging" value={g.state.replace('_', ' ')} sub={`rate ${fmtK(g.velocity)}`} tone={g.state === 'ADDING_HEDGES' ? C.success : g.state === 'REMOVING_HEDGES' ? C.danger : C.info} active />
        <Tile label="Strike migration (where dealer gamma is shifting)" value={m.direction} sub={`Center ${m.shift >= 0 ? '+' : ''}${num(m.shift, decimals)}`} tone={dirTone(m.direction)} active={m.direction !== 'STABLE'} />
      </div>

      {/* OI flow · gamma concentration · strike density */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="OI Flow (positioning velocity)" value={dd.oiFlow.state.replace('_', ' ')} sub={`${dd.oiFlow.velocity >= 0 ? '+' : ''}${num(dd.oiFlow.velocity, 0)}/min · ${num(dd.oiFlow.totalOi, 0)} OI`} tone={dd.oiFlow.state === 'UNWINDING' ? C.warning : C.info} active={dd.oiFlow.state !== 'STABLE'} />
        <Tile label="Gamma Concentration" value={`${num(dd.concentration.gammaTop3Pct, 0)}% top-3`} sub={`HHI ${dd.concentration.hhi.toFixed(2)} · OI ${num(dd.concentration.oiTop3Pct, 0)}% top-3`} tone={dd.concentration.gammaTop3Pct >= 50 ? C.warning : C.info} active={dd.concentration.gammaTop3Pct >= 50} />
        <Tile label="Strike Density (heaviest OI cluster)" value={`${num(dd.concentration.densityPct, 0)}%`} sub={`@ ${num(dd.concentration.densityStrike, decimals)} · ±2 strikes`} tone={C.info} active={dd.concentration.densityPct >= 40} />
      </div>

      {/* Neighbor-strike anomalies (NBRS): gamma / OI / volume */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><Crosshair className="w-3 h-3 text-[var(--text-tertiary)]" /><h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">Neighbor-Strike Anomalies (NBRS)</h3></div>
        <div className="grid grid-cols-3 gap-2">
          {([{ label: 'Gamma-NBRS', a: dd.nbrs.gamma }, { label: 'OI-NBRS', a: dd.nbrs.oi }, { label: 'Volume-NBRS', a: dd.nbrs.volume }]).map(({ label, a }) => (
            <Tile key={label} label={label} value={a ? `${a.ratio.toFixed(1)}×` : '—'} sub={a ? `@ ${num(a.strike, decimals)}` : 'n/a'} tone={a && a.ratio >= 3 ? C.warning : C.info} active={!!a && a.ratio >= 3} />
          ))}
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)] leading-tight">Strike whose gamma / OI / volume most exceeds the mean of its neighbors — concentrated positioning that stands apart from the chain.</span>
      </div>

      {/* Wall strength + liquidity vacuums */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><BrickWall className="w-3 h-3 text-[var(--text-tertiary)]" /><h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">Wall Strength (0-100)</h3></div>
          {[{ label: 'Resistance', x: w.resistance, tone: C.danger }, { label: 'Support', x: w.support, tone: C.success }].map(({ label, x, tone }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[10px] font-bold w-20 shrink-0" style={{ color: tone }}>{label} {x ? num(x.strike, decimals) : ''}</span>
              <div className="flex-1 h-2 rounded-sm bg-[var(--surface-3)] overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: `${x ? x.score : 0}%`, background: tone, transition: 'width 400ms cubic-bezier(0.16,1,0.3,1)' }} />
              </div>
              <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: tone }}>{x ? x.score : '—'}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><Wind className="w-3 h-3 text-[var(--text-tertiary)]" /><h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">Liquidity Vacuums (fast-move zones)</h3></div>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Nearest Above" value={fmtZone(vac.nearestAbove)} sub={vac.nearestAbove ? `${(vac.nearestAbove.widthPct * 100).toFixed(1)}% gap · ${Math.round(vac.nearestAbove.score * 100)}%` : 'none'} tone={C.danger} active={!!vac.nearestAbove} />
            <Tile label="Nearest Below" value={fmtZone(vac.nearestBelow)} sub={vac.nearestBelow ? `${(vac.nearestBelow.widthPct * 100).toFixed(1)}% gap · ${Math.round(vac.nearestBelow.score * 100)}%` : 'none'} tone={C.success} active={!!vac.nearestBelow} />
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] leading-tight">Thin OI and volume gaps — price can move quickly through these zones.</span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2">
        <Waves className="w-3.5 h-3.5 text-[#C084FC] shrink-0 mt-0.5" />
        <span>{v.note}</span>
      </div>
    </div>
  );
}
