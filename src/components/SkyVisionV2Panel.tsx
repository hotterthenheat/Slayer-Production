/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKY VISION v2.0 — contract-intelligence header.
 *
 * Renders the server-computed `sky_vision` block as a compact, balanced
 * intelligence strip that sits directly above the opportunity scanner: the
 * master verdict cluster, the strongest contract, the rotation scanner, the
 * EMA target ladder with P(hit), and a slim component-score footer.
 * Read-only — everything is computed server-side each tick (from the live option
 * chain when one is connected, otherwise a deterministic model; the panel labels
 * which source is active via `sky_vision.isLive`).
 */
import React from 'react';
import { useContractStore } from '../lib/store';
import { Crosshair, TrendingUp, TrendingDown, Target, Gauge, Layers } from 'lucide-react';

const fmt = (v: number | undefined, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
const strengthTone = (s: number) => (s >= 70 ? 'var(--success)' : s >= 45 ? 'var(--warning)' : 'var(--danger)');

function ScoreBar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: tone }} />
    </div>
  );
}

/** A label-over-value stat, matching the scanner header beneath this panel. */
function Stat({ label, value, tone, big }: { label: string; value: React.ReactNode; tone?: string; big?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 first:pl-0">
      <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--text-tertiary)] whitespace-nowrap">{label}</span>
      <span className={`${big ? 'text-[18px]' : 'text-[13px]'} font-black leading-none whitespace-nowrap`} style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export function SkyVisionV2Panel({ compact = false }: { compact?: boolean }) {
  const serverState = useContractStore((s) => s.serverState);
  const sv = serverState?.sky_vision as any | undefined;

  if (!sv || !sv.master) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-lg mb-4 animate-pulse">
        <div className="flex items-center gap-2 text-[11px] font-black tracking-widest uppercase text-[var(--text-secondary)]">
          <Crosshair className="w-4 h-4 text-[var(--success)]" /> Sky Vision — computing contract intelligence…
        </div>
      </div>
    );
  }

  const dir: string = sv.direction;
  const dirBull = dir === 'BULLISH';
  const dirTone = dir === 'BULLISH' ? 'var(--success)' : dir === 'BEARISH' ? 'var(--danger)' : 'var(--text-tertiary)';
  // Lead side matches the server (leadIsCall = direction !== 'BEARISH'), so the
  // strongest contract stays consistent with the target ladder on a NEUTRAL read.
  const lead = dir !== 'BEARISH' ? sv.bestCall : sv.bestPut;
  const master = sv.master;
  // Source provenance: only claim a live chain when the server flagged this tick
  // as built from the real option chain (`sky_vision.isLive`). Guard for undefined.
  const isLiveChain = sv.isLive === true;

  const components: { key: string; label: string }[] = [
    { key: 'contractStrength', label: 'Contract' },
    { key: 'flowStrength', label: 'Flow' },
    { key: 'dealerPositioning', label: 'Dealer' },
    { key: 'emaStructure', label: 'EMA' },
    { key: 'volumeProfile', label: 'Volume' },
    { key: 'ivStructure', label: 'IV' },
    { key: 'swingEngine', label: 'Swing' },
  ];

  return (
    <section
      className="rounded-xl border bg-[var(--surface)] shadow-lg mb-4 overflow-hidden"
      style={{ borderColor: 'rgba(74,222,128,0.22)', borderLeftColor: 'rgba(74,222,128,0.9)', borderLeftWidth: '3px' }}
    >
      {/* Header strip: identity + verdict cluster (mirrors the scanner stat row below) */}
      <div className={`${compact ? 'flex flex-col items-stretch' : 'flex flex-wrap items-center justify-between'} gap-x-2 gap-y-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]`}>
        <div className="flex items-center gap-2 shrink-0">
          <Crosshair className="w-4 h-4 text-[var(--success)]" />
          <span className="text-[11px] font-black tracking-widest uppercase text-[var(--text-primary)]">Sky Vision</span>
          <span className="text-[var(--text-tertiary)]">·</span>
          <span className="text-[11px] font-black tracking-widest uppercase text-[var(--text-secondary)]">{sv.ticker}</span>
          <span
            className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border"
            style={
              isLiveChain
                ? { color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 40%, transparent)', background: 'color-mix(in srgb, var(--success) 10%, transparent)' }
                : { color: 'var(--warning)', borderColor: 'color-mix(in srgb, var(--warning) 40%, transparent)', background: 'color-mix(in srgb, var(--warning) 10%, transparent)' }
            }
            title={isLiveChain ? 'Computed from the live option chain streamed from the server.' : 'No live chain on this tick — computed from the deterministic model.'}
          >
            {isLiveChain ? 'LIVE CHAIN' : 'MODEL'}
          </span>
        </div>
        <div className={compact ? 'flex flex-wrap items-center gap-x-1 gap-y-1' : 'flex items-center divide-x divide-[var(--border)]'}>
          <Stat
            label="Direction"
            tone={dirTone}
            value={
              <span className="flex items-center gap-1">
                {dirBull ? <TrendingUp className="w-3.5 h-3.5" /> : dir === 'BEARISH' ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                {dir}
              </span>
            }
          />
          <Stat label="Master Score" value={master.score} tone={strengthTone(master.score)} big />
          <Stat label="Health" value={master.tradeHealth} />
          <Stat label="Confidence" value={`${master.confidence}%`} />
          <Stat label="Swing" value={master.swingType} />
        </div>
      </div>

      {/* Body: three balanced columns (stacked in compact/rail mode) separated by hairlines */}
      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'} gap-px bg-[var(--border)]`}>
        {/* Strongest contract */}
        <div className="bg-[var(--surface)] p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-2.5">
            <Target className="w-3 h-3 text-[var(--success)]" /> Strongest Contract
          </div>
          {lead ? (
            <div className="flex flex-col gap-2.5 flex-1">
              <div>
                <div className="text-[17px] font-black text-[var(--text-primary)] leading-none">{lead.key}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[13px] font-black" style={{ color: strengthTone(lead.strength) }}>{lead.strength}</span>
                  <span className="text-[10px] font-bold" style={{ color: lead.trend === 'RISING' ? 'var(--success)' : lead.trend === 'FALLING' ? 'var(--danger)' : 'var(--text-tertiary)' }}>{lead.trend}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)] truncate">"{lead.label}"</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] mt-auto">
                <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Premium</span><span className="text-[var(--text-primary)] font-mono font-bold">${fmt(lead.premium)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Δ</span><span className="text-[var(--text-primary)] font-mono">{fmt(lead.delta)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-secondary)]">IV</span><span className="text-[var(--text-primary)] font-mono">{fmt(lead.iv * 100, 1)}%</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Vol</span><span className="text-[var(--text-primary)] font-mono">{fmt(lead.volume, 0)}</span></div>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-[var(--text-secondary)] flex-1">No clear directional leader right now.</div>
          )}
        </div>

        {/* Rotation scanner */}
        <div className="bg-[var(--surface)] p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-2.5">
            <Gauge className="w-3 h-3 text-[var(--info)]" /> Rotation Scanner
          </div>
          <div className="space-y-1.5 flex-1">
            {(sv.contracts || []).slice(0, 5).map((c: any) => (
              <div key={c.key} className={`flex items-center gap-2 rounded px-2 py-1 ${c.strongest ? 'bg-[var(--success)]/10 border border-[var(--success)]/30' : ''}`}>
                <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] w-16 shrink-0">{(c.key || '').replace(sv.ticker + ' ', '')}</span>
                <div className="flex-1"><ScoreBar value={c.strength} tone={strengthTone(c.strength)} /></div>
                <span className="text-[10px] font-black w-7 text-right" style={{ color: strengthTone(c.strength) }}>{Math.round(c.strength)}</span>
                <span className="text-[9px] w-3 text-center" style={{ color: c.trend === 'RISING' ? 'var(--success)' : c.trend === 'FALLING' ? 'var(--danger)' : 'var(--text-tertiary)' }}>{c.trend === 'RISING' ? '▲' : c.trend === 'FALLING' ? '▼' : '–'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Target ladder */}
        <div className="bg-[var(--surface)] p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-2.5">
            <Layers className="w-3 h-3 text-[#C084FC]" /> EMA Target Ladder · P(hit)
          </div>
          {(sv.targetStack || []).length ? (
            <div className="space-y-2 flex-1">
              {(sv.targetStack || []).slice(0, 4).map((t: any) => (
                <div key={t.rank} className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--text-secondary)] truncate min-w-0"><span className="text-[var(--text-tertiary)] font-mono mr-1">T{t.rank}</span>{t.label} <span className="font-mono text-[var(--text-primary)]">{fmt(t.underlying)}</span></span>
                  <span className="flex items-center gap-2 shrink-0 pl-2">
                    <span className="font-mono font-bold text-[var(--success)]">${fmt(t.projectedPremium)} <span className="text-[var(--success)]/70">({t.projectedGainPct > 0 ? '+' : ''}{t.projectedGainPct}%)</span></span>
                    <span className="font-mono font-bold w-9 text-right" title="Probability price reaches this level before expiry" style={{ color: (t.touchProb ?? 0) >= 0.5 ? 'var(--success)' : (t.touchProb ?? 0) >= 0.25 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{Math.round((t.touchProb ?? 0) * 100)}%</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-[var(--text-secondary)] flex-1">Price is extended past the in-direction levels.</div>
          )}
        </div>
      </div>

      {/* Footer: slim master-score component strip (2-up in compact/rail mode) */}
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-4 sm:grid-cols-7'} gap-x-4 gap-y-2 px-4 py-2.5 border-t border-[var(--border)] bg-[var(--surface-2)]`}>
        {components.map((c) => {
          const v = master.components?.[c.key] ?? 0;
          return (
            <div key={c.key}>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                <span>{c.label}</span><span className="text-[var(--text-primary)] font-bold">{Math.round(v)}</span>
              </div>
              <ScoreBar value={v} tone={strengthTone(v)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
