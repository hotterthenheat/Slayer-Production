import { useMemo } from 'react';
import type { GexProfileData } from '../types';

/**
 * Strike Matrix — institutional "no-box" build. No cell fills, no checkerboard: every value is
 * right-aligned tabular monospace with a thin inline magnitude bar beneath it, so a row tells its
 * story at a glance without the eye fighting solid colour blocks. Weak strikes fade toward passive
 * gray; walls / flip / spot carry quiet markers, never boxes. Numbers are tabular so nothing wobbles
 * horizontally as values tick.
 */

const fmtG = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : '+'; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`; if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`; return `${s}${Math.round(a)}`; };
const fmtOi = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `${Math.round(v)}`;
// Value colour fades from passive gray (weak) to the directional hue (strong) — discipline over saturation.
const valCol = (token: string, mag: number, top: boolean) => top ? `var(${token})` : `color-mix(in srgb, var(${token}) ${Math.round(26 + mag * 66)}%, var(--text-tertiary))`;

function Bar({ mag, token, top }: { mag: number; token: string; top: boolean }) {
  if (mag <= 0) return null;
  return <div className="absolute bottom-[1.5px] right-0 h-[2px] rounded-full pointer-events-none" style={{ width: `${Math.max(3, Math.min(100, mag * 100))}%`, background: `var(${token})`, opacity: top ? 0.92 : 0.16 + mag * 0.5 }} />;
}

export function StrikeMatrix({ profile, decimals = 0 }: { profile: GexProfileData; decimals?: number }) {
  const { rows, totals } = useMemo(() => {
    const all = profile.strikes || [];
    const ss = all.filter(s => Math.abs(s.netGex || 0) > 0 || (s.callOi || 0) + (s.putOi || 0) > 0);
    const spot = profile.spot || 0;
    const near = spot ? [...ss].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 36) : ss.slice(0, 36);
    const maxC = Math.max(...near.map(s => Math.abs(s.callGex || 0)), 1);
    const maxP = Math.max(...near.map(s => Math.abs(s.putGex || 0)), 1);
    const maxV = Math.max(...near.map(s => (s.callVolume || 0) + (s.putVolume || 0)), 1);
    // Spotlight strikes: biggest call γ, biggest put γ, busiest by volume.
    let topCallK = NaN, topPutK = NaN, topVolK = NaN, mc = 0, mp = 0, mv = 0;
    for (const s of near) { if ((s.callGex || 0) > mc) { mc = s.callGex || 0; topCallK = s.strike; } if (Math.abs(s.putGex || 0) > mp) { mp = Math.abs(s.putGex || 0); topPutK = s.strike; } const v = (s.callVolume || 0) + (s.putVolume || 0); if (v > mv) { mv = v; topVolK = s.strike; } }
    const rows = near.sort((a, b) => b.strike - a.strike).map(s => ({
      strike: s.strike, callGex: s.callGex || 0, putGex: s.putGex || 0, net: s.netGex || 0,
      cMag: Math.abs(s.callGex || 0) / maxC, pMag: Math.abs(s.putGex || 0) / maxP,
      vol: (s.callVolume || 0) + (s.putVolume || 0), volMag: ((s.callVolume || 0) + (s.putVolume || 0)) / maxV,
      isSpot: !!spot && Math.abs(s.strike - spot) < spot * 0.0008,
      isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
      topCall: s.strike === topCallK, topPut: s.strike === topPutK, topVol: s.strike === topVolK,
    }));
    const totals = {
      callGex: all.reduce((a, s) => a + Math.max(0, s.callGex || 0), 0),
      putGex: all.reduce((a, s) => a + Math.min(0, s.putGex || 0), 0),
      vol: all.reduce((a, s) => a + (s.callVolume || 0) + (s.putVolume || 0), 0),
    };
    return { rows, totals };
  }, [profile]);

  if (!rows.length) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;

  const cols = 'grid grid-cols-[50px_1fr_1fr_46px] gap-x-2.5 px-3';
  return (
    <div className="w-full font-mono text-[10.5px] tabular-nums">
      <div className={`${cols} py-1.5 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] text-[8px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]`}>
        <div className="text-right">Strike</div>
        <div className="text-right" style={{ color: 'color-mix(in srgb, var(--success) 50%, var(--text-tertiary))' }}>Call γ</div>
        <div className="text-right" style={{ color: 'color-mix(in srgb, var(--danger) 50%, var(--text-tertiary))' }}>Put γ</div>
        <div className="text-right">Vol</div>
      </div>
      <div>
        {rows.map(r => (
          <div key={r.strike} className={`${cols} items-stretch h-[22px] hover:bg-white/[0.02] transition-colors`} style={r.isSpot ? { boxShadow: 'inset 2px 0 0 var(--accent-color)' } : undefined}>
            <div className="relative flex items-center justify-end">
              {(r.isCW || r.isPW || r.isFlip) && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full" style={{ background: r.isCW ? 'var(--success)' : r.isPW ? 'var(--danger)' : 'var(--warning)' }} title={r.isCW ? 'Call Wall' : r.isPW ? 'Put Wall' : 'Gamma Flip'} />}
              <span style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: r.isSpot ? 800 : 600 }}>{r.strike.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>
            </div>
            <div className="relative flex items-center justify-end" style={{ color: valCol('--greek', r.cMag, r.topCall), fontWeight: r.topCall ? 800 : 600 }}>{r.callGex ? fmtG(r.callGex) : <span className="text-[var(--text-tertiary)] opacity-40">·</span>}<Bar mag={r.cMag} token="--success" top={r.topCall} /></div>
            <div className="relative flex items-center justify-end" style={{ color: valCol('--greek', r.pMag, r.topPut), fontWeight: r.topPut ? 800 : 600 }}>{r.putGex ? fmtG(r.putGex) : <span className="text-[var(--text-tertiary)] opacity-40">·</span>}<Bar mag={r.pMag} token="--danger" top={r.topPut} /></div>
            <div className="relative flex items-center justify-end" style={{ color: r.topVol ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: r.topVol ? 800 : 600 }}>{fmtOi(r.vol)}<Bar mag={r.volMag} token="--accent-color" top={r.topVol} /></div>
          </div>
        ))}
      </div>
      <div className={`${cols} py-1.5 sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] text-[9px] font-black tabular-nums z-10`}>
        <div className="text-right text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[8px] self-center">Total</div>
        <div className="text-right" style={{ color: 'var(--success)' }}>{fmtG(totals.callGex)}</div>
        <div className="text-right" style={{ color: 'var(--danger)' }}>{fmtG(totals.putGex)}</div>
        <div className="text-right text-[var(--text-secondary)]">{fmtOi(totals.vol)}</div>
      </div>
    </div>
  );
}
