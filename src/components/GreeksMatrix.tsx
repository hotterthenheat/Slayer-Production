import { useMemo } from 'react';
import type { GexProfileData, GexStrikeDetail } from '../types';

/**
 * Greeks Matrix — strike × dealer-exposure grid. Same visual language as the Gamma Matrix (diverging
 * green/red heat cells, frozen strike axis, per-column totals), but the columns are the four dealer
 * EXPOSURES per strike instead of expiries:
 *   DEX — net dealer Δ ($ per 1pt move)   GEX — net dealer Γ ($ per 1% move)
 *   VEX — net dealer vanna ($ per 1% IV)   CEX — net dealer charm ($ Δ-decay / day)
 * Every value is a real per-strike aggregation from the live/MODEL chain (no fabrication); a column with
 * no data in the feed simply renders empty. Spot, the call/put wall, the γ-flip and the pin are marked on
 * the strike axis. Slayer tokens only (--success/+, --danger/−, --accent-color spot, --warning flip, --greek pin).
 */

const fmtG = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : '+'; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`; if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`; return `${s}${Math.round(a)}`; };

type Col = { key: string; label: string; sub: string; get: (s: GexStrikeDetail) => number };
const COLS: Col[] = [
  { key: 'dex', label: 'DEX', sub: 'Δ-EXP', get: s => s.netDex ?? ((s.callDex || 0) + (s.putDex || 0)) },
  { key: 'gex', label: 'GEX', sub: 'Γ-EXP', get: s => s.netGex ?? ((s.callGex || 0) + (s.putGex || 0)) },
  { key: 'vex', label: 'VEX', sub: 'VANNA', get: s => s.netVex ?? ((s.callVex || 0) + (s.putVex || 0)) },
  { key: 'cex', label: 'CEX', sub: 'CHARM', get: s => s.charmEx ?? 0 },
];

export function GreeksMatrix({ profile, decimals = 0 }: { profile: GexProfileData; decimals?: number }) {
  const nf = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const m = useMemo(() => {
    const spot = profile.spot || 0;
    let ss = (profile.strikes || []).filter(s => COLS.some(c => Math.abs(c.get(s)) > 0) || (s.callOi || 0) + (s.putOi || 0) > 0);
    if (!ss.length) return null;
    if (spot) ss = [...ss].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
    ss = ss.slice(0, 44).sort((a, b) => b.strike - a.strike);   // nearest-N near spot, then high→low
    const maxAbs: Record<string, number> = {};
    for (const c of COLS) maxAbs[c.key] = Math.max(1, ...ss.map(s => Math.abs(c.get(s))));
    const tot: Record<string, number> = {};
    for (const c of COLS) tot[c.key] = ss.reduce((a, s) => a + c.get(s), 0);
    const active = COLS.filter(c => ss.some(s => Math.abs(c.get(s)) > 0));   // hide a wholly-empty exposure column
    let nearestK = NaN; if (spot) { let bd = Infinity; for (const s of ss) { const d = Math.abs(s.strike - spot); if (d < bd) { bd = d; nearestK = s.strike; } } }
    let emHiK = NaN, emLoK = NaN;
    if (spot && profile.expectedMovePct) {
      const emHi = spot * (1 + profile.expectedMovePct), emLo = spot * (1 - profile.expectedMovePct);
      let bh = Infinity, bl = Infinity;
      for (const s of ss) { const dh = Math.abs(s.strike - emHi); if (dh < bh) { bh = dh; emHiK = s.strike; } const dl = Math.abs(s.strike - emLo); if (dl < bl) { bl = dl; emLoK = s.strike; } }
    }
    return { ss, maxAbs, tot, active, nearestK, emHiK, emLoK };
  }, [profile, decimals]);

  if (!m) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;
  const { ss, maxAbs, tot, active, nearestK, emHiK, emLoK } = m;
  const rowH = 24, PITCH = rowH;
  const template = `82px repeat(${active.length}, minmax(72px, 1fr))`;
  const stick = 'sticky left-0';
  const hair = 'inset 0 0 0 1px var(--border)';   // crisp hairline around every cell → a true matrix grid
  const FIELD = 'color-mix(in srgb, var(--surface) 45%, var(--bg-base))';   // near-black field → bright cells glow against it
  const spotIdx = ss.findIndex(s => s.strike === nearestK);
  // Each greek column is normalised to ITS OWN peak — the four exposures live on different scales (Δ-$, Γ-$,
  // vanna, charm), so cross-column brightness comparison is meaningless; the printed value is the truth.
  // A steep curve sinks weak cells into the near-black FIELD and lets the dominant strike in each exposure
  // blaze — a dark canvas with glowing hotspots. green = +, red = −.
  const heat = (v: number, mx: number) => Math.min(1, Math.abs(v) / mx);
  const cellBg = (v: number, mx: number) => { if (!v) return FIELD; const tok = v >= 0 ? 'var(--success)' : 'var(--danger)'; return `color-mix(in srgb, ${tok} ${Math.round(3 + Math.pow(heat(v, mx), 1.7) * 91)}%, ${FIELD})`; };
  const cellInk = (v: number, mx: number) => { const t = heat(v, mx); return t > 0.4 ? 'var(--text-primary)' : t > 0.1 ? 'var(--text-secondary)' : 'var(--text-tertiary)'; };
  const cellGlow = (v: number, mx: number) => { const t = heat(v, mx); return t > 0.5 ? `, 0 0 ${Math.round((t - 0.5) * 26) + 4}px -3px color-mix(in srgb, ${v >= 0 ? 'var(--success)' : 'var(--danger)'} 62%, transparent)` : ''; };
  const wallOf = (k: number) => k === profile.callWall ? { t: 'CW', c: 'var(--success)' } : k === profile.putWall ? { t: 'PW', c: 'var(--danger)' } : k === profile.gammaFlip ? { t: 'FLIP', c: 'var(--warning)' } : (k === profile.magnet ? { t: 'PIN', c: 'var(--greek)' } : null);

  return (
    <div className="w-full overflow-x-auto hide-scrollbar">
      <div className="min-w-max font-mono text-[11px] tabular-nums select-none">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b border-[var(--border)] text-[8px] font-black uppercase tracking-wider text-[var(--text-tertiary)] bg-[var(--surface)]">
          <span className="text-[var(--text-secondary)]">Dealer exposure / strike · per-column heat</span>
          <span>DEX · Δ-exp</span><span>GEX · Γ-exp</span><span>VEX · vanna</span><span>CEX · charm</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1.5px var(--accent-color)' }} />Spot</span>
          <span style={{ color: 'var(--success)' }}>+ long</span><span style={{ color: 'var(--danger)' }}>− short</span>
        </div>
        {/* Header */}
        <div className="grid sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)] text-[8px] font-black uppercase tracking-[0.12em]" style={{ gridTemplateColumns: template }}>
          <div className={`${stick} z-30 bg-[var(--surface)] text-right text-[var(--text-tertiary)] self-stretch flex items-center justify-end pl-2 pr-2 py-2`}>Strike</div>
          {active.map(c => (
            <div key={c.key} className="text-center leading-tight self-center px-0.5 py-2">
              <div className="text-[var(--text-secondary)]">{c.label}</div>
              <div className="text-[var(--text-tertiary)]">{c.sub}</div>
            </div>
          ))}
        </div>
        {/* Body — surface tiles outlined by hairlines; spot box drawn as an overlay */}
        <div className="relative flex flex-col" style={{ background: 'var(--surface)' }}>
          {ss.map(s => {
            const k = s.strike, isSpot = k === nearestK, isEm = !isSpot && (k === emHiK || k === emLoK), w = !isSpot && !isEm ? wallOf(k) : null;
            return (
              <div key={k} className="grid items-stretch" style={{ gridTemplateColumns: template, height: rowH }}>
                <div className={`${stick} z-20 h-full flex flex-col items-end justify-center leading-none gap-px pr-2 pl-2`} style={{ background: isSpot ? 'color-mix(in srgb, var(--accent-color) 16%, var(--surface))' : isEm ? 'color-mix(in srgb, var(--info) 12%, var(--surface))' : 'var(--surface)', boxShadow: isSpot ? 'inset 3px 0 0 var(--accent-color), inset -1px 0 0 var(--border)' : isEm ? 'inset 3px 0 0 var(--info), inset -1px 0 0 var(--border)' : (w ? `inset 3px 0 0 ${w.c}, inset -1px 0 0 var(--border)` : 'inset -1px 0 0 var(--border)') }}>
                  <span className="font-bold" style={{ color: isSpot ? 'var(--accent-color)' : isEm ? 'var(--info)' : 'var(--text-secondary)' }}>{Number.isInteger(k) ? k.toLocaleString('en-US') : nf(k)}</span>
                  {(w || isEm) && <span className="text-[6.5px] font-black uppercase tracking-wider" style={{ color: w ? w.c : 'var(--info)' }}>{w ? w.t : 'EM'}</span>}
                </div>
                {active.map(c => { const v = c.get(s), mx = maxAbs[c.key]; return (
                  <div key={c.key} className="h-full flex items-center justify-center" style={{ background: cellBg(v, mx), boxShadow: `${hair}${cellGlow(v, mx)}` }}>
                    <span style={{ color: v ? cellInk(v, mx) : 'var(--text-tertiary)', fontWeight: heat(v, mx) > 0.5 ? 800 : 600 }}>{v ? fmtG(v) : '·'}</span>
                  </div>
                ); })}
              </div>
            );
          })}
          {/* Boxed current strike — accent ring around the live-price row */}
          {spotIdx >= 0 && (
            <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: spotIdx * PITCH - 1, height: rowH + 2, boxShadow: 'inset 0 0 0 1.5px var(--accent-color)', borderRadius: 3 }} />
          )}
        </div>
        {/* Totals */}
        <div className="grid sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] text-[9px] font-black z-20" style={{ gridTemplateColumns: template }}>
          <div className={`${stick} z-30 bg-[var(--surface)] text-right text-[var(--text-tertiary)] uppercase tracking-[0.1em] text-[8px] flex items-center justify-end pl-2 pr-2 py-2`}>Net</div>
          {active.map(c => (<div key={c.key} className="text-center self-center py-2" style={{ color: tot[c.key] >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtG(tot[c.key])}</div>))}
        </div>
      </div>
    </div>
  );
}
