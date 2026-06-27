import { useMemo } from 'react';
import type { GexProfileData } from '../types';

/**
 * Color-coded strike matrix — a dense, institutional strike table (à la SpotGamma /
 * the reference terminal). Each strike's call/put gamma renders as a cell tinted by
 * magnitude (heavy = saturated, weak = nearly invisible) with the $ value on top, plus
 * a net column and an OI bar. Single-expiry today; multi-expiry columns are a separate
 * backend task. Walls / flip / spot are marked.
 */

const fmtG = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : '+'; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`; if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`; return `${s}${Math.round(a)}`; };
const fmtOi = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `${Math.round(v)}`;
const tint = (token: string, mag: number) => `color-mix(in srgb, var(${token}) ${Math.round(8 + Math.pow(mag, 0.85) * 60)}%, transparent)`;

export function StrikeMatrix({ profile, decimals = 0 }: { profile: GexProfileData; decimals?: number }) {
  const rows = useMemo(() => {
    const ss = (profile.strikes || []).filter(s => Math.abs(s.netGex || 0) > 0 || (s.callOi || 0) + (s.putOi || 0) > 0);
    const spot = profile.spot || 0;
    const near = spot ? [...ss].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 36) : ss.slice(0, 36);
    const maxC = Math.max(...near.map(s => Math.abs(s.callGex || 0)), 1);
    const maxP = Math.max(...near.map(s => Math.abs(s.putGex || 0)), 1);
    const maxV = Math.max(...near.map(s => (s.callVolume || 0) + (s.putVolume || 0)), 1);
    // Spotlight strikes: biggest call γ, biggest put γ, busiest by volume.
    let topCallK = NaN, topPutK = NaN, topVolK = NaN, mc = 0, mp = 0, mv = 0;
    for (const s of near) { if ((s.callGex || 0) > mc) { mc = s.callGex || 0; topCallK = s.strike; } if (Math.abs(s.putGex || 0) > mp) { mp = Math.abs(s.putGex || 0); topPutK = s.strike; } const v = (s.callVolume || 0) + (s.putVolume || 0); if (v > mv) { mv = v; topVolK = s.strike; } }
    return near.sort((a, b) => b.strike - a.strike).map(s => ({
      strike: s.strike, callGex: s.callGex || 0, putGex: s.putGex || 0, net: s.netGex || 0,
      cMag: Math.abs(s.callGex || 0) / maxC, pMag: Math.abs(s.putGex || 0) / maxP,
      vol: (s.callVolume || 0) + (s.putVolume || 0), volMag: ((s.callVolume || 0) + (s.putVolume || 0)) / maxV,
      isSpot: !!spot && Math.abs(s.strike - spot) < spot * 0.0008,
      isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
      topCall: s.strike === topCallK, topPut: s.strike === topPutK, topVol: s.strike === topVolK,
    }));
  }, [profile]);

  if (!rows.length) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;

  return (
    <div className="w-full font-mono text-[10px] tabular-nums">
      <div className="grid grid-cols-[58px_1fr_1fr_56px] gap-px px-2 py-1.5 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] text-[8.5px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">
        <div className="text-right">Strike</div>
        <div className="text-center" style={{ color: 'var(--success)' }}>Call γ</div>
        <div className="text-center" style={{ color: 'var(--danger)' }}>Put γ</div>
        <div className="text-right">Vol</div>
      </div>
      <div>
        {rows.map(r => (
          <div key={r.strike} className="grid grid-cols-[58px_1fr_1fr_56px] gap-px items-stretch h-[19px]" style={r.isSpot ? { boxShadow: 'inset 2px 0 0 var(--accent-color)', background: 'color-mix(in srgb, var(--accent-color) 9%, transparent)' } : undefined}>
            <div className="flex items-center justify-end gap-1 pr-1.5">
              {r.isCW && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--success)' }} title="Call Wall" />}
              {r.isPW && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--danger)' }} title="Put Wall" />}
              {r.isFlip && <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: 'var(--warning)' }} title="Gamma Flip" />}
              <span className="font-black tracking-wide" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{r.strike.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>
            </div>
            <div className="flex items-center justify-center" style={{ background: tint('--success', r.cMag), color: r.cMag > 0.18 ? 'var(--success)' : 'var(--text-tertiary)', fontWeight: r.topCall ? 900 : 700, boxShadow: r.topCall ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--success) 75%, transparent)' : undefined }}>{r.callGex ? fmtG(r.callGex) : '·'}</div>
            <div className="flex items-center justify-center" style={{ background: tint('--danger', r.pMag), color: r.pMag > 0.18 ? 'var(--danger)' : 'var(--text-tertiary)', fontWeight: r.topPut ? 900 : 700, boxShadow: r.topPut ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--danger) 75%, transparent)' : undefined }}>{r.putGex ? fmtG(r.putGex) : '·'}</div>
            <div className="relative flex items-center justify-end pr-1.5 overflow-hidden">
              <div className="absolute inset-y-[3px] right-0 rounded-sm" style={{ width: `${Math.max(3, r.volMag * 100)}%`, background: r.topVol ? 'color-mix(in srgb, var(--accent-color) 40%, transparent)' : 'color-mix(in srgb, var(--accent-color) 15%, transparent)' }} />
              <span className="relative" style={{ fontWeight: r.topVol ? 900 : 700, color: r.topVol ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{fmtOi(r.vol)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
