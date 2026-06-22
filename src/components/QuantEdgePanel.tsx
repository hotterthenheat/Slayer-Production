import React, { useMemo } from 'react';
import { useContractStore } from '../lib/store';
import { Activity, Gauge, Sigma, Layers, Target, Clock } from 'lucide-react';
import { PanelSkeleton } from './PanelSkeleton';

const pct = (v: any, d = 1) => (typeof v === 'number' && isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const num = (v: any, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—');
const signedPct = (v: any, d = 1) => (typeof v === 'number' && isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%` : '—');

function Card({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: `${accent}1a`, border: `1px solid ${accent}55` }}>{icon}</div>
        <h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

/** Mini SVG density curve for the risk-neutral distribution. */
function DensityCurve({ density, spot, p25, p75 }: { density: { k: number; f: number }[]; spot: number; p25: number; p75: number }) {
  const path = useMemo(() => {
    if (!density || density.length < 2) return null;
    const ks = density.map((d) => d.k);
    const fs = density.map((d) => d.f);
    const kMin = ks[0], kMax = ks[ks.length - 1];
    const fMax = Math.max(...fs, 1e-9);
    const W = 100, H = 40;
    const x = (k: number) => ((k - kMin) / (kMax - kMin || 1)) * W;
    const y = (f: number) => H - (f / fMax) * H;
    let d = `M ${x(ks[0]).toFixed(1)} ${H}`;
    for (let i = 0; i < density.length; i++) d += ` L ${x(ks[i]).toFixed(1)} ${y(fs[i]).toFixed(1)}`;
    d += ` L ${x(ks[ks.length - 1]).toFixed(1)} ${H} Z`;
    return { d, spotX: x(spot), p25X: x(p25), p75X: x(p75), W, H };
  }, [density, spot, p25, p75]);
  if (!path) return null;
  // Resolve theme tokens once so the SVG curve tracks the design system.
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string, f: string) => { const v = css.getPropertyValue(n).trim(); return v || f; };
  const success = tok('--success', '#4ADE80');
  const textPrimary = tok('--text-primary', '#E5E5E5');
  return (
    <svg viewBox={`0 0 ${path.W} ${path.H}`} preserveAspectRatio="none" className="w-full h-[44px]">
      <defs>
        <linearGradient id="rndg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={success} stopOpacity="0.45" />
          <stop offset="100%" stopColor={success} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* interquartile band */}
      <rect x={Math.min(path.p25X, path.p75X)} y={0} width={Math.abs(path.p75X - path.p25X)} height={path.H} fill={success} opacity={0.07} />
      <path d={path.d} fill="url(#rndg)" stroke={success} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      {/* spot marker */}
      <line x1={path.spotX} y1={0} x2={path.spotX} y2={path.H} stroke={textPrimary} strokeWidth={0.6} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Heatmap cell color for a scenario P&L %. */
function pnlColor(v: number): string {
  if (!isFinite(v)) return 'rgba(113,113,122,0.15)';
  const clamped = Math.max(-100, Math.min(100, v));
  if (clamped >= 0) return `rgba(16,185,129,${0.12 + (clamped / 100) * 0.55})`;
  return `rgba(239,68,68,${0.12 + (Math.abs(clamped) / 100) * 0.55})`;
}

export function QuantEdgePanel() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const edge = serverState?.quant_edge;

  if (!edge) {
    return <PanelSkeleton label="Quant Edge" />;
  }

  const rnd = edge.rnd;
  const vrp = edge.vrp;
  const rv = edge.realizedVol;
  const skew = edge.skew;
  const sc = edge.scenario;
  const kelly = edge.kelly;
  const clock = edge.dealerClock;

  // Resolve theme tokens once so inline-styled signal colors track the design system.
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string, f: string) => { const v = css.getPropertyValue(n).trim(); return v || f; };
  const C = { success: tok('--success', '#4ADE80'), danger: tok('--danger', '#F87171'), warning: tok('--warning', '#FBBF24'), info: tok('--info', '#60A5FA'), neutral: tok('--text-tertiary', '#A3A3A3'), textPrimary: tok('--text-primary', '#E5E5E5') };

  const richTone = vrp?.richness === 'IV RICH' ? C.success : vrp?.richness === 'IV CHEAP' ? C.danger : C.neutral;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-3" style={{ borderLeftColor: 'var(--success)', borderLeftWidth: '3px' }}>
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
        <Sigma className="w-4 h-4 text-[var(--success)]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">Edge Analytics — {selectedAsset?.ticker}</h2>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest ml-auto">live</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Risk-Neutral Density */}
        {rnd && (
          <Card title="Market-Implied Probability Distribution" icon={<Activity className="w-3.5 h-3.5 text-[var(--success)]" />} accent={C.success}>
            <DensityCurve density={rnd.density} spot={selectedAsset?.defaultPrice || rnd.percentiles?.p50 || 0} p25={rnd.percentiles?.p25 || 0} p75={rnd.percentiles?.p75 || 0} />
            <div className="grid grid-cols-3 gap-2">
              <Stat label="P(up by exp)" value={pct(rnd.pAboveSpot)} tone={rnd.pAboveSpot >= 0.5 ? C.success : C.danger} />
              <Stat label={`Implied move (${rnd.dteDays}d)`} value={`±${pct(rnd.expectedMovePct)}`} />
              <Stat label="Skew bias" value={rnd.skewBias} tone={rnd.skewBias === 'DOWNSIDE SKEW' ? C.danger : rnd.skewBias === 'UPSIDE SKEW' ? C.success : C.neutral} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
              {(rnd.levels || []).map((l: any) => (
                <span key={l.label} className="text-[10px] tabular-nums text-[var(--text-tertiary)]">
                  {l.label} <span className="text-[var(--text-primary)] font-bold">{pct(l.pAbove, 0)}</span>
                </span>
              ))}
            </div>
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">Tail risk vs normal: {num(rnd.fatTailRatio, 2)}x</span>
          </Card>
        )}

        {/* Realized Vol + VRP */}
        {vrp && rv && (
          <Card title="Realized Vol and Variance Risk Premium" icon={<Gauge className="w-3.5 h-3.5 text-[var(--info)]" />} accent={C.info}>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Implied (ATM)" value={pct(vrp.iv)} />
              <Stat label="Realized (YZ)" value={pct(vrp.rv)} />
              <Stat label="VRP" value={signedPct(vrp.vrp)} tone={vrp.vrp >= 0 ? C.success : C.danger} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded" style={{ color: richTone, border: `1px solid ${richTone}`, background: `${richTone}14` }}>{vrp.richness}</span>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">IV/RV {num(vrp.ratio, 2)}x · RV pctile {num(vrp.rvPercentile, 0)}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-0.5">
              <Stat label="Parkinson" value={pct(rv.parkinson)} />
              <Stat label="Garman-K" value={pct(rv.garmanKlass)} />
              <Stat label="Rogers-S" value={pct(rv.rogersSatchell)} />
              <Stat label="Yang-Z" value={pct(rv.yangZhang)} />
            </div>
          </Card>
        )}

        {/* Skew */}
        {skew && (
          <Card title="Skew (25Δ Risk Reversal / Butterfly)" icon={<Layers className="w-3.5 h-3.5 text-[#C084FC]" />} accent="#C084FC">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="RR 25Δ" value={signedPct(skew.riskReversal25, 2)} tone={skew.riskReversal25 >= 0 ? C.danger : C.success} />
              <Stat label="Fly 25Δ" value={signedPct(skew.butterfly25, 2)} />
              <Stat label="Slope" value={num(skew.skewSlope, 3)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Bias" value={skew.bias} tone={skew.bias === 'PUT SKEW' ? C.danger : skew.bias === 'CALL SKEW' ? C.success : C.neutral} />
              <Stat label="RR pctile" value={num(skew.rrPercentile, 0)} />
              <Stat label="Fly pctile" value={num(skew.bfPercentile, 0)} />
            </div>
          </Card>
        )}

        {/* Scenario matrix */}
        {sc && (
          <Card title="Scenario P&L: Spot vs IV Change" icon={<Target className="w-3.5 h-3.5 text-[var(--warning)]" />} accent={C.warning}>
            <div className="overflow-x-auto">
              <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="text-[10px] text-[var(--text-tertiary)] font-black uppercase">IV\Spot</th>
                    {sc.spotShiftsPct.map((s: number) => (
                      <th key={s} className="text-[10px] text-[var(--text-tertiary)] font-bold tabular-nums px-0.5">{s >= 0 ? '+' : ''}{(s * 100).toFixed(1)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sc.pnlPct.map((row: number[], i: number) => (
                    <tr key={i}>
                      <td className="text-[10px] text-[var(--text-tertiary)] font-bold tabular-nums pr-1">{sc.ivShiftsAbs[i] >= 0 ? '+' : ''}{(sc.ivShiftsAbs[i] * 100).toFixed(0)}</td>
                      {row.map((v: number, j: number) => (
                        <td key={j} className="text-[10px] text-center tabular-nums rounded font-bold" style={{ background: pnlColor(v), color: C.textPrimary, minWidth: 30 }}>
                          {isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(0)}` : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              <Stat label="Best" value={`${sc.best.pnlPct > 0 ? '+' : ''}${num(sc.best.pnlPct, 0)}%`} tone={C.success} />
              <Stat label="Worst" value={`${num(sc.worst.pnlPct, 0)}%`} tone={C.danger} />
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest ml-auto">{sc.daysForward}d theta decay</span>
            </div>
          </Card>
        )}
      </div>

      {/* Kelly + Dealer clock strip */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {kelly && (
          <Card title="Edge-Based Sizing (Kelly)" icon={<Sigma className="w-3.5 h-3.5 text-[#34D399]" />} accent="#34D399">
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Half-Kelly" value={pct(kelly.recommended, 1)} tone="#34D399" />
              <Stat label="Full Kelly" value={pct(kelly.kelly, 1)} />
              <Stat label="Payoff" value={`${num(kelly.payoffRatio, 2)}x`} />
              <Stat label="Verdict" value={kelly.verdict} tone={kelly.verdict === 'STRONG' ? C.success : kelly.verdict === 'NO EDGE' ? C.danger : C.neutral} />
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
              <div className="h-full bg-[#34D399]" style={{ width: `${Math.min(100, (kelly.recommended || 0) * 100 * 2)}%` }} />
            </div>
          </Card>
        )}
        {clock && (
          <Card title="Intraday Dealer Hedging Clock (Charm/Vanna)" icon={<Clock className="w-3.5 h-3.5 text-[#F472B6]" />} accent="#F472B6">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Session" value={clock.session?.replace('_', ' ')} tone="#F472B6" />
              <Stat label="Hedge ramp" value={pct(clock.weight, 0)} />
              <Stat label="To close" value={clock.minutesToClose != null ? `${clock.minutesToClose}m` : '—'} />
            </div>
            <span className="text-[10px] text-[var(--text-tertiary)]">{clock.label}</span>
            <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
              <div className="h-full bg-[#F472B6]" style={{ width: `${Math.min(100, (clock.weight || 0) * 100)}%` }} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
