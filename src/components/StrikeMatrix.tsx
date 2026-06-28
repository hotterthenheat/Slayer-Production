import { useMemo } from 'react';
import type { GexProfileData } from '../types';

/**
 * Strike Matrix — dealer-heatmap build (SpotGamma / Voltick style). Each strike is a row; its NET γ
 * reads as a colour-filled cell (green = positive / dealers sticky, red = negative / slippery; brighter
 * = bigger) with the value in light text, plus a magnitude bar so the gamma profile reads as a shape
 * down the column. Spot / gamma-flip / walls are marked inline. Single-expiry (our feed is one chain at
 * a time) — the multi-expiry columns of a full matrix need per-expiry GEX we don't fetch.
 */

const fmtG = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : '+'; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`; if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`; return `${s}${Math.round(a)}`; };

export function StrikeMatrix({ profile, decimals = 0 }: { profile: GexProfileData; decimals?: number }) {
  const { rows, totalNet } = useMemo(() => {
    const all = profile.strikes || [];
    const ss = all.filter(s => Math.abs(s.netGex || 0) > 0 || (s.callOi || 0) + (s.putOi || 0) > 0);
    const spot = profile.spot || 0;
    // Keep the strikes nearest spot (the actionable band), then sort high→low so the ladder reads like the chart.
    const near = (spot ? [...ss].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 42) : ss.slice(0, 42));
    const maxNet = Math.max(...near.map(s => Math.abs(s.netGex || 0)), 1);
    const rows = near.sort((a, b) => b.strike - a.strike).map(s => {
      const net = s.netGex || 0;
      return {
        strike: s.strike, net, pos: net >= 0, mag: Math.abs(net) / maxNet,
        isSpot: !!spot && Math.abs(s.strike - spot) < spot * 0.0008,
        isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
      };
    });
    const totalNet = all.reduce((a, s) => a + (s.netGex || 0), 0);
    return { rows, totalNet };
  }, [profile]);

  if (!rows.length) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;

  const cols = 'grid grid-cols-[46px_minmax(0,1fr)_40px] gap-x-1.5 px-2';
  const nf = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className="w-full font-mono text-[10.5px] tabular-nums select-none">
      <div className={`${cols} py-1.5 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] text-[8px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]`}>
        <div className="text-right">Strike</div>
        <div className="text-right">Net γ</div>
        <div className="text-right">GEX</div>
      </div>
      <div>
        {rows.map(r => {
          const hue = r.pos ? 'var(--success)' : 'var(--danger)';
          const marker = r.isCW ? 'var(--success)' : r.isPW ? 'var(--danger)' : r.isFlip ? 'var(--warning)' : null;
          return (
            <div key={r.strike} className="grid grid-cols-[46px_minmax(0,1fr)_40px] gap-x-1.5 px-2 items-center h-[20px] hover:bg-white/[0.03] transition-colors"
              style={r.isSpot ? { boxShadow: 'inset 2px 0 0 var(--accent-color)' } : undefined}>
              {/* Strike + level marker / inline tag */}
              <div className="relative flex items-center justify-end gap-1">
                {marker && <span className="w-1 h-1 rounded-full shrink-0" style={{ background: marker }} title={r.isCW ? 'Call Wall' : r.isPW ? 'Put Wall' : 'Gamma Flip'} />}
                {r.isSpot && <span className="text-[6.5px] font-black tracking-wider px-0.5 rounded-sm" style={{ color: 'var(--accent-color)' }}>◄</span>}
                <span style={{ color: r.isSpot ? 'var(--accent-color)' : r.isFlip ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: r.isSpot || r.isFlip ? 800 : 600 }}>{nf(r.strike)}</span>
              </div>
              {/* Net γ heatmap cell — colour-filled by sign, brightness ∝ magnitude, value in light text */}
              <div className="relative h-[15px] rounded-[3px] flex items-center justify-end pr-1.5 overflow-hidden"
                style={{ background: `color-mix(in srgb, ${hue} ${Math.round(9 + r.mag * 48)}%, transparent)`, boxShadow: r.isFlip ? `inset 0 0 0 1px color-mix(in srgb, var(--warning) 60%, transparent)` : undefined }}>
                <span style={{ color: r.mag > 0.32 ? 'var(--text-primary)' : `color-mix(in srgb, ${hue} 80%, var(--text-tertiary))`, fontWeight: r.mag > 0.6 ? 800 : 600 }}>{r.net ? fmtG(r.net) : '·'}</span>
              </div>
              {/* Magnitude bar — the gamma profile as a shape down the column */}
              <div className="relative h-[15px] flex items-center">
                <div className="w-full h-[6px] rounded-sm overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text-tertiary) 12%, transparent)' }}>
                  <div className="h-full rounded-sm" style={{ width: `${Math.max(4, r.mag * 100)}%`, background: hue, opacity: 0.35 + r.mag * 0.6 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={`${cols} py-1.5 sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] text-[9px] font-black z-10`}>
        <div className="text-right text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[8px] self-center">Net</div>
        <div className="text-right pr-1.5" style={{ color: totalNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtG(totalNet)}</div>
        <div className="text-right text-[var(--text-tertiary)] text-[8px] self-center">Σγ</div>
      </div>
    </div>
  );
}
