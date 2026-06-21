/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKY VISION v2.0 — contract-intelligence panel.
 *
 * Renders the server-computed `sky_vision` block: the master verdict, the strongest
 * contract on the chain (rotation scanner), the EMA target ladder with projected
 * option premiums, the swing read, and the position-health-style component breakdown.
 * Read-only — everything is computed server-side from the live chain each tick.
 */
import React from 'react';
import { useContractStore } from '../lib/store';
import { Crosshair, TrendingUp, TrendingDown, Activity, Gauge, Target, Layers } from 'lucide-react';

const fmt = (v: number | undefined, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

function ScoreBar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: tone }} />
    </div>
  );
}

const strengthTone = (s: number) => (s >= 70 ? '#4ADE80' : s >= 45 ? '#FBBF24' : '#F87171');

export function SkyVisionV2Panel() {
  const serverState = useContractStore((s) => s.serverState);
  const sv = serverState?.sky_vision as any | undefined;

  if (!sv || !sv.master) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg animate-pulse">
        <div className="flex items-center gap-2 text-[11px] font-black tracking-widest uppercase text-[var(--text-secondary)]">
          <Crosshair className="w-4 h-4 text-[#4ADE80]" /> Sky Vision — computing contract intelligence…
        </div>
      </div>
    );
  }

  const dir: string = sv.direction;
  const dirBull = dir === 'BULLISH';
  const dirTone = dir === 'BULLISH' ? '#4ADE80' : dir === 'BEARISH' ? '#F87171' : '#A3A3A3';
  const lead = dirBull ? sv.bestCall : sv.bestPut;
  const master = sv.master;

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
    <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-lg mb-4" style={{ borderColor: 'rgba(74,222,128,0.22)', borderLeftColor: 'rgba(74,222,128,0.9)', borderLeftWidth: '3px' }}>
      {/* Header: master verdict */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[#4ADE80]" />
          <span className="text-[11px] font-black tracking-widest uppercase text-[var(--text-primary)]">Sky Vision — {sv.ticker}</span>
          <span className="text-[10px] text-[var(--text-secondary)]">contract intelligence</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Master Score</div>
            <div className="sv-metric-lg" style={{ color: strengthTone(master.score) }}>{master.score}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Direction</div>
            <div className="text-[14px] font-black flex items-center gap-1 justify-end" style={{ color: dirTone }}>
              {dirBull ? <TrendingUp className="w-3.5 h-3.5" /> : dir === 'BEARISH' ? <TrendingDown className="w-3.5 h-3.5" /> : null}
              {dir}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Health · Conf</div>
            <div className="text-[12px] font-bold text-[var(--text-primary)]">{master.tradeHealth} · {master.confidence}%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Strongest contract + add */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">
            <Target className="w-3 h-3 text-[#4ADE80]" /> Strongest Contract
          </div>
          {lead ? (
            <>
              <div className="text-[18px] font-black text-[var(--text-primary)] leading-none">{lead.key}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[13px] font-black" style={{ color: strengthTone(lead.strength) }}>{lead.strength}</span>
                <span className="text-[10px] font-bold" style={{ color: lead.trend === 'RISING' ? '#4ADE80' : lead.trend === 'FALLING' ? '#F87171' : '#A3A3A3' }}>{lead.trend}</span>
                <span className="text-[10px] text-[var(--text-secondary)]">"{lead.label}"</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                <div><span className="text-[var(--text-secondary)]">Premium </span><span className="text-[var(--text-primary)] font-mono font-bold">${fmt(lead.premium)}</span></div>
                <div><span className="text-[var(--text-secondary)]">Δ </span><span className="text-[var(--text-primary)] font-mono">{fmt(lead.delta)}</span></div>
                <div><span className="text-[var(--text-secondary)]">IV </span><span className="text-[var(--text-primary)] font-mono">{fmt(lead.iv * 100, 1)}%</span></div>
                <div><span className="text-[var(--text-secondary)]">Vol </span><span className="text-[var(--text-primary)] font-mono">{fmt(lead.volume, 0)}</span></div>
              </div>
            </>
          ) : (
            <div className="text-[10px] text-[var(--text-secondary)]">No clear directional leader right now.</div>
          )}
        </div>

        {/* Rotation scanner */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">
            <Gauge className="w-3 h-3 text-[#60A5FA]" /> Rotation Scanner — strongest on the chain
          </div>
          <div className="space-y-1.5">
            {(sv.contracts || []).slice(0, 6).map((c: any) => (
              <div key={c.key} className={`flex items-center gap-2 rounded px-2 py-1 ${c.strongest ? 'bg-[#4ADE80]/10 border border-[#4ADE80]/30' : ''}`}>
                <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] w-20 shrink-0">{c.key.replace(sv.ticker + ' ', '')}</span>
                <div className="flex-1"><ScoreBar value={c.strength} tone={strengthTone(c.strength)} /></div>
                <span className="text-[10px] font-black w-7 text-right" style={{ color: strengthTone(c.strength) }}>{Math.round(c.strength)}</span>
                <span className="text-[9px] w-3 text-center" style={{ color: c.trend === 'RISING' ? '#4ADE80' : c.trend === 'FALLING' ? '#F87171' : '#71717A' }}>{c.trend === 'RISING' ? '▲' : c.trend === 'FALLING' ? '▼' : '–'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Target ladder */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">
            <Layers className="w-3 h-3 text-[#C084FC]" /> EMA Target Ladder · premium · P(hit)
          </div>
          {(sv.targetStack || []).length ? (
            <div className="space-y-1.5">
              {(sv.targetStack || []).slice(0, 5).map((t: any) => (
                <div key={t.rank} className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--text-secondary)] truncate"><span className="text-[var(--text-tertiary)] font-mono mr-1">T{t.rank}</span>{t.label} <span className="font-mono text-[var(--text-primary)]">{fmt(t.underlying)}</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-[#4ADE80]">${fmt(t.projectedPremium)} <span className="text-[#4ADE80]/70">({t.projectedGainPct > 0 ? '+' : ''}{t.projectedGainPct}%)</span></span>
                    <span className="font-mono font-bold w-9 text-right" title="Probability price reaches this level before expiry" style={{ color: (t.touchProb ?? 0) >= 0.5 ? '#4ADE80' : (t.touchProb ?? 0) >= 0.25 ? '#FBBF24' : '#A3A3A3' }}>{Math.round((t.touchProb ?? 0) * 100)}%</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-[var(--text-secondary)]">Price is extended past the in-direction levels.</div>
          )}
          <div className="mt-3 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[10px]">
            <Activity className="w-3 h-3 text-[#FBBF24]" />
            <span className="text-[var(--text-secondary)]">Swing:</span>
            <span className="text-[var(--text-primary)] font-bold">{master.swingType}</span>
          </div>
        </div>
      </div>

      {/* Master-score component breakdown */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {components.map((c) => {
          const v = master.components?.[c.key] ?? 0;
          return (
            <div key={c.key}>
              <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                <span>{c.label}</span><span className="text-[var(--text-primary)] font-bold">{Math.round(v)}</span>
              </div>
              <ScoreBar value={v} tone={strengthTone(v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
