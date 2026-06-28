import type { ReactNode } from 'react';
import { GexProfileData } from '../types';
import { ArrowUpCircle, ArrowDownCircle, Trophy } from 'lucide-react';

/**
 * Top Calls & Puts — the strikes carrying the most dealer gamma on each side. Calls are ranked
 * by call γ (resistance the dealer must hedge into); puts by |put γ| (support). Pure read of the
 * live gex profile — strike, $γ, open interest and distance-to-spot — so a trader sees the
 * heaviest loaded strikes at a glance. Descriptive (where the walls are), never a trade.
 */
const fmtGex = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '−' : '+';
  return a >= 1e9 ? `${s}${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}${(a / 1e6).toFixed(0)}M` : a >= 1e3 ? `${s}${(a / 1e3).toFixed(0)}K` : `${s}${a.toFixed(0)}`;
};
const fmtOi = (v: number) => (v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`);

function Section({ title, rows, tone, icon, spot, nf, maxMag }: {
  title: string; tone: string; icon: ReactNode; spot: number; maxMag: number;
  nf: (v: number) => string;
  rows: { strike: number; gex: number; oi: number }[];
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {icon}
        <span className="text-[9px] font-sans font-black tracking-widest uppercase" style={{ color: tone }}>{title}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-2 pb-2 text-[9px] font-mono text-[var(--text-tertiary)]">No loaded strikes</div>
      ) : rows.map((r, i) => {
        const distPct = spot > 0 ? ((r.strike - spot) / spot) * 100 : 0;
        const pctOfMax = maxMag > 0 ? Math.min(100, (Math.abs(r.gex) / maxMag) * 100) : 0;
        return (
          <div key={r.strike} className="relative grid grid-cols-[14px_1fr_auto_auto] items-center gap-2 px-2 h-[26px] text-[10px] font-mono tabular-nums hover:bg-[var(--surface-3)] transition-colors">
            {/* magnitude bar behind the row */}
            <div className="absolute inset-y-[3px] left-0 rounded-r-sm pointer-events-none" style={{ width: `${pctOfMax}%`, background: `color-mix(in srgb, ${tone} 10%, transparent)` }} />
            <span className="relative text-[9px] text-[var(--text-tertiary)] font-black">{i + 1}</span>
            <span className="relative font-bold text-[var(--text-primary)]">{nf(r.strike)}</span>
            <span className="relative font-black" style={{ color: tone }}>{fmtGex(r.gex)}</span>
            <span className="relative w-12 text-right text-[var(--text-tertiary)]" title={`${fmtOi(r.oi)} OI`}>{distPct >= 0 ? '+' : ''}{distPct.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function TopStrikesPanel({ profile, spot, decimals }: { profile: GexProfileData; spot: number; decimals: number }) {
  const ss = profile.strikes || [];
  const nf = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const calls = ss.filter(s => (s.callGex || 0) > 0)
    .map(s => ({ strike: s.strike, gex: s.callGex || 0, oi: s.callOi || 0 }))
    .sort((a, b) => b.gex - a.gex).slice(0, 5);
  const puts = ss.filter(s => (s.putGex || 0) < 0)
    .map(s => ({ strike: s.strike, gex: s.putGex || 0, oi: s.putOi || 0 }))
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 5);
  const maxCall = calls.reduce((m, r) => Math.max(m, Math.abs(r.gex)), 0);
  const maxPut = puts.reduce((m, r) => Math.max(m, Math.abs(r.gex)), 0);

  return (
    <div className="bg-[var(--surface-2)] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[var(--border)]">
        <span className="flex items-center gap-1.5 text-[9px] font-sans font-black tracking-widest uppercase text-[var(--text-secondary)]"><Trophy className="w-3 h-3" /> Top Calls &amp; Puts</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]" title="Strikes ranked by dealer gamma exposure ($Γ per 1% move). Distance shown vs spot.">by $Γ · dist</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
        <Section title="Top Calls" tone="var(--success)" icon={<ArrowUpCircle className="w-3 h-3" style={{ color: 'var(--success)' }} />} rows={calls} spot={spot} nf={nf} maxMag={maxCall} />
        <Section title="Top Puts" tone="var(--danger)" icon={<ArrowDownCircle className="w-3 h-3" style={{ color: 'var(--danger)' }} />} rows={puts} spot={spot} nf={nf} maxMag={maxPut} />
      </div>
    </div>
  );
}
