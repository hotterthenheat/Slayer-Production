import React from 'react';
import { useContractStore } from '../lib/store';
import { Radar, Waves, Gauge, GitBranch, AlertTriangle } from 'lucide-react';
import { PanelSkeleton } from './PanelSkeleton';

const num = (v: any, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—');

/** A single ACTIVE/INACTIVE regime flag tile. */
function Flag({ label, value, active, tone = '#4ADE80' }: { label: string; value: string; active: boolean; tone?: string }) {
  return (
    <div
      className="rounded-md border p-2.5 flex flex-col gap-1 transition-colors"
      style={{
        borderColor: active ? tone : 'rgba(63,63,70,0.6)',
        background: active ? `${tone}12` : 'rgba(0,0,0,0.35)',
      }}
    >
      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 leading-tight">{label}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none" style={{ color: active ? tone : '#E5E5E5' }}>{value}</span>
      <span className="text-[8px] font-black tracking-widest" style={{ color: active ? tone : '#52525B' }}>
        {active ? '● ACTIVE' : '○ INACTIVE'}
      </span>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[9px] font-black tracking-widest uppercase text-zinc-400">{title}</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

export function RegimeMatrixPanel() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const edge = serverState?.quant_edge;
  if (!edge || !edge.regime) {
    return <PanelSkeleton label="Market State" />;
  }

  const reg = edge.regime;
  const ou = edge.ou;
  const comp = edge.compression;
  const exp = edge.expansion;
  const fwd = edge.forwardVol;
  const vpin = edge.vpin;
  const kyle = edge.kyle;
  const pca = edge.pca;

  const regimeTone = reg.state === 'TAIL_RISK' ? '#F87171' : reg.state === 'TREND_EXPANSION' ? '#4ADE80' : '#60A5FA';

  return (
    <div className="rounded-lg border border-black/60 bg-black/30 p-4 flex flex-col gap-4 shadow-inner">
      <div className="flex items-center gap-2">
        <Radar className="w-4 h-4 text-[#4ADE80]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[#E5E5E5]">Market State — {selectedAsset?.ticker}</h2>
        <span className="text-[8px] text-zinc-500 uppercase tracking-widest ml-auto">11 signals · live</span>
      </div>

      <Section title="Trend and Mean-Reversion Signals" icon={<GitBranch className="w-3 h-3 text-[#60A5FA]" />}>
        <Flag label="Market State" value={reg.state.replace('_', ' ')} active tone={regimeTone} />
        <Flag label="State Transition Prob" value={`${num(reg.transitionProb, 0)}%`} active={reg.transitionProb >= 60} tone={regimeTone} />
        <Flag label="Trend Persistence (Hurst)" value={num(reg.hurst, 2)} active={reg.hurst > 0.55} tone="#4ADE80" />
        <Flag label="Mean-Reversion Half-Life" value={isFinite(ou.halfLifeBars) ? `${num(ou.halfLifeBars, 1)} bars` : '∞'} active={ou.meanReverting} tone="#60A5FA" />
        <Flag label="Mean-Reversion Strength" value={ou.meanReverting ? `θ ${num(ou.theta, 4)}` : 'none'} active={ou.meanReverting} tone="#60A5FA" />
      </Section>

      <Section title="Volatility State" icon={<Waves className="w-3 h-3 text-[#C084FC]" />}>
        <Flag label="Volatility Compression" value={comp?.detail || '—'} active={!!comp?.active} tone="#FBBF24" />
        <Flag label="Volatility Expansion" value={exp?.detail || '—'} active={!!exp?.active} tone="#F87171" />
        <Flag label="Forward Volatility Term Structure" value={fwd?.detail || '—'} active={!!fwd?.active} tone="#C084FC" />
      </Section>

      <Section title="Order-Flow Analysis" icon={<Gauge className="w-3 h-3 text-[#34D399]" />}>
        <Flag label="Informed-trading pressure (VPIN)" value={num(vpin?.vpin, 3)} active={!!vpin?.toxic} tone="#F87171" />
        <Flag label="Order flow quality" value={vpin?.toxic ? 'INFORMED (TOXIC)' : 'NORMAL'} active={!!vpin?.toxic} tone="#F87171" />
        <Flag label="Price impact of size (Kyle lambda)" value={`${num(kyle?.impactPct, 3)}%`} active={!!kyle?.slippageRisk} tone="#FBBF24" />
        {pca && (
          <Flag label={`PCA Residual (${pca.direction})`} value={`${pca.z >= 0 ? '+' : ''}${num(pca.z, 2)}σ`} active={pca.active} tone={pca.z >= 0 ? '#F87171' : '#4ADE80'} />
        )}
      </Section>

      <Section title="Order Clustering and Cross-Asset Signals" icon={<AlertTriangle className="w-3 h-3 text-[#FB923C]" />}>
        {edge.hawkes && <Flag label="Order-burst risk (Hawkes)" value={num(edge.hawkes.cascadeProbability, 2)} active={!!edge.hawkes.ignition} tone="#FB923C" />}
        {edge.netDelta && <Flag label={`Aggressive net delta (${edge.netDelta.direction})`} value={`${edge.netDelta.netDelta >= 0 ? '+' : ''}${num(edge.netDelta.netDelta, 0)}`} active={!!edge.netDelta.anomaly} tone={edge.netDelta.netDelta >= 0 ? '#4ADE80' : '#F87171'} />}
        {edge.fisher && <Flag label="Market structure shift score" value={num(edge.fisher.divergence, 2)} active={!!edge.fisher.structuralShift} tone="#F472B6" />}
        {edge.leadLag && <Flag label="Which market leads (transfer entropy)" value={`${edge.leadLag.leader}→${edge.leadLag.follower}`} active={!!edge.leadLag.active} tone="#60A5FA" />}
      </Section>

      {reg.state === 'TAIL_RISK' && (
        <div className="flex items-center gap-2 text-[10px] font-bold text-[#F87171] bg-[#F87171]/10 border border-[#F87171]/40 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5" /> EXTREME-MOVE RISK — unusually large moves possible; reduce position size.
        </div>
      )}
    </div>
  );
}
