import { useMemo, useState } from 'react';
import type { GexProfileData } from '../types';

/**
 * Strike Matrix — the dealer gamma chain (SpotGamma-style): one row per strike with a green CALL Γ
 * heatmap column, a red PUT Γ heatmap column, and a VOL column, plus a TOTAL footer. Spot is marked on
 * the left edge; the dominant call/put walls get a glow ring. When the profile carries multiple
 * expiries, a compact expiry selector switches the chain shown (each expiry keeps the same call/put/vol
 * format). `size`: 'compact' for the rail, 'full' for the maximized full-screen view.
 */

const fmtG = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : '+'; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`; if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`; return `${s}${Math.round(a)}`; };
const fmtVol = (v: number) => { const a = Math.abs(v); if (a >= 1e6) return `${(a / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`; return `${Math.round(a)}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtExp = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso; return `${MON[+m[2] - 1] ?? '?'} ${+m[3]}`; };
const NEAR = 60;

export function StrikeMatrix({ profile, decimals = 0, size = 'compact' }: { profile: GexProfileData; decimals?: number; size?: 'compact' | 'full' }) {
  const full = size === 'full';
  const [sel, setSel] = useState(0);
  const expiries = profile.expiries && profile.expiries.length ? profile.expiries : null;
  const selIdx = expiries ? Math.min(sel, expiries.length - 1) : 0;

  const view = useMemo(() => {
    const spot = profile.spot || 0;
    const near0 = (a: number, b: number) => spot ? Math.abs(a - b) < spot * 0.0008 : a === b;
    // Source rows: the selected expiry's chain, else the single front chain. Each → call/put/vol.
    const raw = expiries
      ? (expiries[selIdx].strikes || []).map(s => ({ strike: s.strike, call: s.callGex ?? Math.max(0, s.netGex || 0), put: s.putGex ?? Math.min(0, s.netGex || 0), vol: s.vol ?? 0 }))
      : (profile.strikes || []).map(s => ({ strike: s.strike, call: s.callGex || 0, put: s.putGex || 0, vol: (s.callVolume || 0) + (s.putVolume || 0) || (s.callOi || 0) + (s.putOi || 0) }));
    let ss = raw.filter(s => Math.abs(s.call) > 0 || Math.abs(s.put) > 0 || s.vol > 0);
    ss = (spot ? ss.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)) : ss).slice(0, full ? NEAR + 24 : NEAR);
    ss.sort((a, b) => b.strike - a.strike);
    const maxCall = Math.max(1, ...ss.map(s => Math.abs(s.call)));
    const maxPut = Math.max(1, ...ss.map(s => Math.abs(s.put)));
    const maxVol = Math.max(1, ...ss.map(s => s.vol));
    // Dominant walls (the rings) — biggest call γ and biggest |put γ|.
    let cwStrike = 0, pwStrike = 0, cwMax = 0, pwMax = 0;
    for (const s of ss) { if (s.call > cwMax) { cwMax = s.call; cwStrike = s.strike; } if (-s.put > pwMax) { pwMax = -s.put; pwStrike = s.strike; } }
    const rows = ss.map(s => ({ ...s, isSpot: !!spot && near0(s.strike, spot), isCW: s.strike === cwStrike, isPW: s.strike === pwStrike }));
    const totCall = raw.reduce((a, s) => a + (s.call > 0 ? s.call : 0), 0);
    const totPut = raw.reduce((a, s) => a + (s.put < 0 ? s.put : 0), 0);
    const totVol = raw.reduce((a, s) => a + s.vol, 0);
    return { rows, maxCall, maxPut, maxVol, totCall, totPut, totVol };
  }, [profile, expiries, selIdx, full]);

  const nf = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const { rows, maxCall, maxPut, maxVol, totCall, totPut, totVol } = view;

  const grid = full ? 'grid grid-cols-[84px_1fr_1fr_56px]' : 'grid grid-cols-[58px_1fr_1fr_42px]';
  const rowH = full ? 'h-[24px]' : 'h-[19px]';
  const fz = full ? 'text-[12px]' : 'text-[10px]';

  if (!rows.length) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;

  const callBg = (v: number) => `color-mix(in srgb, var(--success) ${Math.round(6 + Math.min(1, Math.abs(v) / maxCall) * 54)}%, transparent)`;
  const putBg = (v: number) => `color-mix(in srgb, var(--danger) ${Math.round(6 + Math.min(1, Math.abs(v) / maxPut) * 54)}%, transparent)`;

  return (
    <div className={`w-full font-mono ${fz} tabular-nums select-none`}>
      {/* Expiry selector — only when the profile carries multiple expiries */}
      {expiries && expiries.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--surface)] overflow-x-auto scrollbar-none">
          {expiries.map((e, i) => (
            <button key={e.expiration} onClick={() => setSel(i)}
              className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-wide transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none"
              style={i === selIdx ? { background: 'var(--surface-3)', color: 'var(--text-primary)', boxShadow: 'inset 0 -2px 0 var(--accent-color)' } : { color: 'var(--text-tertiary)' }}>
              {fmtExp(e.expiration)}<span style={{ color: e.dte <= 0 ? 'var(--warning)' : 'inherit', opacity: 0.8 }}>{e.dte <= 0 ? '0DTE' : `${e.dte}d`}</span>
            </button>
          ))}
        </div>
      )}
      {/* Column header */}
      <div className={`${grid} gap-x-1 px-2 py-1.5 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] text-[8px] font-black uppercase tracking-[0.14em]`}>
        <div className="text-right text-[var(--text-tertiary)]">Strike</div>
        <div className="text-center" style={{ color: 'var(--success)' }}>Call Γ</div>
        <div className="text-center" style={{ color: 'var(--danger)' }}>Put Γ</div>
        <div className="text-right text-[var(--text-tertiary)]">Vol</div>
      </div>
      {/* Chain */}
      <div>
        {rows.map(r => {
          const cMag = Math.abs(r.call) / maxCall, pMag = Math.abs(r.put) / maxPut, vHot = r.vol / maxVol > 0.55;
          return (
            <div key={r.strike} className={`${grid} gap-x-1 px-2 items-center ${rowH} hover:bg-white/[0.03] transition-colors duration-150`}
              style={r.isSpot ? { boxShadow: 'inset 3px 0 0 var(--accent-color)', background: 'color-mix(in srgb, var(--accent-color) 9%, transparent)' } : undefined}>
              <div className="text-right font-bold" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: r.isSpot ? 800 : 600 }}>{nf(r.strike)}</div>
              {/* CALL Γ */}
              <div className="h-full flex items-center justify-center rounded-[2px] transition-colors duration-300"
                style={{ background: callBg(r.call), boxShadow: r.isCW ? 'inset 0 0 0 1px var(--success), 0 0 7px -2px var(--success)' : undefined }}>
                <span style={{ color: cMag > 0.4 ? 'var(--text-primary)' : 'color-mix(in srgb, var(--success) 82%, var(--text-tertiary))', fontWeight: cMag > 0.6 ? 800 : 600 }}>{r.call ? fmtG(r.call) : '·'}</span>
              </div>
              {/* PUT Γ */}
              <div className="h-full flex items-center justify-center rounded-[2px] transition-colors duration-300"
                style={{ background: putBg(r.put), boxShadow: r.isPW ? 'inset 0 0 0 1px var(--danger), 0 0 7px -2px var(--danger)' : undefined }}>
                <span style={{ color: pMag > 0.4 ? 'var(--text-primary)' : 'color-mix(in srgb, var(--danger) 82%, var(--text-tertiary))', fontWeight: pMag > 0.6 ? 800 : 600 }}>{r.put ? fmtG(r.put) : '·'}</span>
              </div>
              {/* VOL pill */}
              <div className="flex justify-end">
                <span className="px-1 rounded-full text-[8.5px] font-bold tabular-nums" style={{ background: vHot ? 'color-mix(in srgb, var(--text-tertiary) 30%, transparent)' : 'color-mix(in srgb, var(--text-tertiary) 13%, transparent)', color: vHot ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{r.vol ? fmtVol(r.vol) : '–'}</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* TOTAL footer */}
      <div className={`${grid} gap-x-1 px-2 py-1.5 sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] text-[9px] font-black z-10`}>
        <div className="text-right text-[var(--text-tertiary)] uppercase tracking-[0.1em] text-[8px] self-center">Total</div>
        <div className="text-center" style={{ color: 'var(--success)' }}>{fmtG(totCall)}</div>
        <div className="text-center" style={{ color: 'var(--danger)' }}>{fmtG(totPut)}</div>
        <div className="text-right text-[var(--text-secondary)]">{fmtVol(totVol)}</div>
      </div>
    </div>
  );
}
