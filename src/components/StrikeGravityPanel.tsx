import React from 'react';
import { useContractStore } from '../lib/store';
import { Magnet, Shield, Swords, Layers3 } from 'lucide-react';
import type { StrikeGravityResult, GravityZone } from '../lib/strikeGravity';
import { PanelSkeleton } from './PanelSkeleton';

/**
 * Strike Gravity Map — renders the server's Strike Gravity Engine output: the
 * primary dealer magnet, the strongest support/resistance ZONES (clustered
 * walls, not single strikes), and the gravity-ranked strike ladder. These are
 * the levels Sky's Vision keys entries/targets off of.
 */
export function StrikeGravityPanel() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const decimals = selectedAsset?.decimals ?? 2;
  const grav = serverState?.strike_gravity as StrikeGravityResult | undefined;

  const fmt = (v: number) => (isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : '—');
  const fmtGex = (v: number) => {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v), sign = v >= 0 ? '+' : '−';
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(0)}M`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
    return `${sign}$${a.toFixed(0)}`;
  };

  if (!grav || !grav.ranked || grav.ranked.length === 0) {
    return <PanelSkeleton label="Strike Gravity" />;
  }

  // Resolve theme tokens once so inline-styled colors track the design system.
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string, f: string) => { const v = css.getPropertyValue(n).trim(); return v || f; };
  const C = { success: tok('--success', '#4ADE80'), danger: tok('--danger', '#F87171'), warning: tok('--warning', '#FBBF24'), info: tok('--info', '#60A5FA') };

  const maxG = Math.max(...grav.ranked.map((s) => s.gravityScore)) || 1;
  const clusterPct = Math.round(grav.clusterScore * 100);
  const clusterTone = grav.clusterScore >= 0.6 ? C.success : grav.clusterScore >= 0.35 ? C.warning : C.info;

  const zoneLabel = (z: GravityZone | null) =>
    !z ? '—' : z.lo === z.hi ? fmt(z.lo) : `${fmt(z.lo)}–${fmt(z.hi)}`;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-4 shadow-inner">
      <div className="flex items-center gap-2">
        <Magnet className="w-4 h-4 text-[#D9A15C]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">Strike Gravity Map — {selectedAsset?.ticker}</h2>
        <span
          className="text-[10px] font-black uppercase tracking-widest ml-auto px-1.5 py-0.5 rounded-sm border"
          style={{ color: clusterTone, borderColor: `${clusterTone}66`, background: `${clusterTone}12` }}
          title="Share of total gravity concentrated in the single strongest dealer zone. High = a tight, dominant wall; low = pressure is dispersed."
        >
          CLUSTER {clusterPct}%
        </span>
      </div>

      {/* Primary magnet + the two walls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-md border border-[#D9A15C]/40 bg-[#D9A15C]/10 p-2.5 flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1"><Magnet className="w-3 h-3" /> Primary Magnet</span>
          <span className="text-[15px] font-bold tabular-nums leading-none text-[#E7C18B]">{grav.primary ? fmt(grav.primary.strike) : '—'}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{grav.primary ? `${fmtGex(grav.primary.netGex)} · g ${grav.primary.gravityScore.toFixed(2)}` : ''}</span>
        </div>
        <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/8 p-2.5 flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1"><Swords className="w-3 h-3 text-[var(--danger)]" /> Resistance Wall</span>
          <span className="text-[15px] font-bold tabular-nums leading-none text-[var(--danger)]">{zoneLabel(grav.resistanceWall)}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{grav.resistanceWall ? `${fmtGex(grav.resistanceWall.netGex)} · ${grav.resistanceWall.strikes.length} strike${grav.resistanceWall.strikes.length > 1 ? 's' : ''}` : 'none above spot'}</span>
        </div>
        <div className="rounded-md border border-[var(--success)]/30 bg-[var(--success)]/8 p-2.5 flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1"><Shield className="w-3 h-3 text-[var(--success)]" /> Support Wall</span>
          <span className="text-[15px] font-bold tabular-nums leading-none text-[var(--success)]">{zoneLabel(grav.supportWall)}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{grav.supportWall ? `${fmtGex(grav.supportWall.netGex)} · ${grav.supportWall.strikes.length} strike${grav.supportWall.strikes.length > 1 ? 's' : ''}` : 'none below spot'}</span>
        </div>
      </div>

      {/* Gravity-ranked strike ladder */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Layers3 className="w-3 h-3 text-[var(--text-tertiary)]" />
          <h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Gravity-Ranked Strikes</h3>
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest ml-auto">GEX·0.4 + OI·0.2 + Vol·0.2 + Prox·0.2</span>
        </div>
        <div className="flex flex-col gap-1">
          {grav.ranked.slice(0, 8).map((s) => {
            const tone = s.side === 'resistance' ? C.danger : s.side === 'support' ? C.success : '#D9A15C';
            return (
              <div key={s.strike} className="flex items-center gap-2">
                <span className="text-[10px] font-bold tabular-nums w-16 shrink-0" style={{ color: tone }}>{fmt(s.strike)}</span>
                <div className="flex-1 h-2 rounded-sm bg-[var(--surface-2)] overflow-hidden">
                  <div className="h-full rounded-sm transition-all" style={{ width: `${Math.max(3, (s.gravityScore / maxG) * 100)}%`, background: tone }} />
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums w-10 text-right">{s.gravityScore.toFixed(2)}</span>
                <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums w-14 text-right" title="distance from spot">{(s.distancePct * 100 >= 0 ? '+' : '') + (s.distancePct * 100).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
