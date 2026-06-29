import { useMemo } from 'react';
import type { GexProfileData } from '../types';

/**
 * Strike Matrix — the institutional dealer-gamma grid.
 *
 * When the profile carries ≥2 expiries (the opt-in multi-expiry fetch, or the MODEL ladder on the
 * sandbox feed) it renders the flagship GAMMA MATRIX: rows = strikes (desc), columns = expiries, each
 * cell a diverging green(+)/red(−) heatmap of that strike·expiry net γ, a NET-by-strike diverging bar
 * column on the right, and a per-expiry TOTAL footer. Spot is marked on the left edge and each expiry's
 * dominant wall cell gets a ring. Otherwise it falls back to the single-expiry CALL Γ | PUT Γ | VOL chain.
 *
 * All colour comes from Slayer theme tokens (--success / --danger / --accent-color) — green for call /
 * positive γ, red for put / negative γ. `size`: 'compact' for the rail, 'full' for the maximized view.
 */

const fmtG = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : '+'; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`; if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`; return `${s}${Math.round(a)}`; };
const fmtVol = (v: number) => { const a = Math.abs(v); if (a >= 1e6) return `${(a / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`; return `${Math.round(a)}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtExp = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso; return `${MON[+m[2] - 1] ?? '?'} ${+m[3]}`; };
const NEAR = 60;

export function StrikeMatrix({ profile, decimals = 0, size = 'compact' }: { profile: GexProfileData; decimals?: number; size?: 'compact' | 'full' }) {
  const full = size === 'full';
  const expiries = profile.expiries && profile.expiries.length ? profile.expiries : null;
  const multi = !!(expiries && expiries.length >= 2);   // ≥2 expiries → the strike × expiry gamma heatmap

  const nf = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // ── GAMMA MATRIX (strike × expiry net-γ heatmap) ──────────────────────────────────────────────
  const matrix = useMemo(() => {
    if (!multi || !expiries) return null;
    const spot = profile.spot || 0;
    const cols = [...expiries].sort((a, b) => a.dte - b.dte).slice(0, full ? 9 : 3);   // rail shows the nearest 3 expiries; the full-screen view shows up to 9
    // Union of strikes carrying γ across the shown expiries, kept near spot.
    const set = new Set<number>();
    for (const c of cols) for (const s of (c.strikes || [])) if (Math.abs(s.netGex || 0) > 0) set.add(s.strike);
    let ks = [...set];
    if (!ks.length) return null;
    if (spot) ks.sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot));
    ks = ks.slice(0, full ? 42 : 26).sort((a, b) => b - a);   // nearest-N, then strike-descending (high at top)
    const cell = cols.map(c => { const m = new Map<number, number>(); for (const s of (c.strikes || [])) m.set(s.strike, s.netGex || 0); return m; });
    let maxAbs = 1;
    for (const m of cell) for (const k of ks) maxAbs = Math.max(maxAbs, Math.abs(m.get(k) || 0));
    const rowNet = ks.map(k => cell.reduce((a, m) => a + (m.get(k) || 0), 0));
    const maxRowNet = Math.max(1, ...rowNet.map(Math.abs));
    const colTot = cols.map(m => 0).map((_, ci) => ks.reduce((a, k) => a + (cell[ci].get(k) || 0), 0));
    const grand = colTot.reduce((a, b) => a + b, 0);
    const maxColTot = Math.max(1, ...colTot.map(Math.abs));   // for the per-expiry net-bias bars in the header
    // Each expiry's dominant wall = its largest |net γ| strike (gets a ring + CW/PW tag).
    const wall = cols.map((_, ci) => { let bs = NaN, bm = 0; for (const k of ks) { const v = Math.abs(cell[ci].get(k) || 0); if (v > bm) { bm = v; bs = k; } } return bs; });
    // Gamma-flip row — where the AGGREGATE net γ crosses from + to − going down strikes (the dealer flip
    // level): the line is drawn between rows flipIdx-1 and flipIdx. −1 if no crossing is in view.
    let flipIdx = -1;
    for (let i = 1; i < rowNet.length; i++) { if (rowNet[i - 1] > 0 && rowNet[i] <= 0) { flipIdx = i; break; } }
    // The strike row NEAREST spot gets the accent highlight, so the live price is always located even when
    // it sits between strikes (it usually does).
    let nearestK = NaN; if (spot) { let bd = Infinity; for (const k of ks) { const d = Math.abs(k - spot); if (d < bd) { bd = d; nearestK = k; } } }
    return { cols, ks, cell, maxAbs, rowNet, maxRowNet, colTot, grand, maxColTot, wall, flipIdx, nearestK, spot };
  }, [multi, expiries, profile.spot, full]);

  // ── Single-expiry CALL | PUT | VOL chain (fallback when <2 expiries) ──────────────────────────
  const single = useMemo(() => {
    if (multi) return null;
    const spot = profile.spot || 0;
    const near0 = (a: number, b: number) => spot ? Math.abs(a - b) < spot * 0.0008 : a === b;
    const src = expiries ? (expiries[0].strikes || []).map(s => ({ strike: s.strike, call: s.callGex ?? Math.max(0, s.netGex || 0), put: s.putGex ?? Math.min(0, s.netGex || 0), vol: s.vol ?? 0 }))
      : (profile.strikes || []).map(s => ({ strike: s.strike, call: s.callGex || 0, put: s.putGex || 0, vol: (s.callVolume || 0) + (s.putVolume || 0) || (s.callOi || 0) + (s.putOi || 0) }));
    let ss = src.filter(s => Math.abs(s.call) > 0 || Math.abs(s.put) > 0 || s.vol > 0);
    ss = (spot ? ss.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)) : ss).slice(0, full ? NEAR + 24 : NEAR);
    ss.sort((a, b) => b.strike - a.strike);
    const maxCall = Math.max(1, ...ss.map(s => Math.abs(s.call))), maxPut = Math.max(1, ...ss.map(s => Math.abs(s.put))), maxVol = Math.max(1, ...ss.map(s => s.vol));
    let cwStrike = 0, pwStrike = 0, cwMax = 0, pwMax = 0;
    for (const s of ss) { if (s.call > cwMax) { cwMax = s.call; cwStrike = s.strike; } if (-s.put > pwMax) { pwMax = -s.put; pwStrike = s.strike; } }
    const rows = ss.map(s => ({ ...s, isSpot: !!spot && near0(s.strike, spot), isCW: s.strike === cwStrike, isPW: s.strike === pwStrike }));
    const totCall = src.reduce((a, s) => a + (s.call > 0 ? s.call : 0), 0), totPut = src.reduce((a, s) => a + (s.put < 0 ? s.put : 0), 0), totVol = src.reduce((a, s) => a + s.vol, 0);
    return { rows, maxCall, maxPut, maxVol, totCall, totPut, totVol };
  }, [multi, profile, expiries, full]);

  // ════════════════════════════ GAMMA MATRIX render ════════════════════════════
  if (multi && matrix && matrix.ks.length) {
    const { cols, ks, cell, maxAbs, rowNet, maxRowNet, colTot, grand, maxColTot, wall, flipIdx, nearestK } = matrix;
    const strikeW = full ? 66 : 54, netW = full ? 78 : 56, colMin = full ? 52 : 38;
    const rowH = full ? 23 : 18, fz = full ? 'text-[11px]' : 'text-[9px]';
    const template = `${strikeW}px repeat(${cols.length}, minmax(${colMin}px, 1fr)) ${netW}px`;
    const stickCol = 'sticky left-0 bg-[var(--surface)]';   // frozen strike axis when scrolling expiries
    // Diverging heatmap cell: green for +γ, red for −γ; intensity ∝ |net|/maxAbs. Faint floor so a cell
    // with γ never fully vanishes, capped so candles-elsewhere stay dominant. Text brightens with intensity.
    const cellBg = (v: number) => { const t = Math.min(1, Math.abs(v) / maxAbs); const tok = v >= 0 ? 'var(--success)' : 'var(--danger)'; return `color-mix(in srgb, ${tok} ${Math.round(8 + t * 60)}%, transparent)`; };
    const cellInk = (v: number) => { const t = Math.min(1, Math.abs(v) / maxAbs); return t > 0.45 ? 'var(--text-primary)' : t > 0.12 ? 'var(--text-secondary)' : 'var(--text-tertiary)'; };

    return (
      <div className="w-full overflow-x-auto hide-scrollbar">
        <div className={`min-w-max font-mono ${fz} tabular-nums select-none`}>
          {/* Column header — STRIKE · expiry (date · DTE · net-bias bar) · NET */}
          <div className="grid gap-x-0.5 pr-2 py-1.5 sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)] text-[8px] font-black uppercase tracking-[0.12em]" style={{ gridTemplateColumns: template }}>
            <div className={`${stickCol} z-30 text-right text-[var(--text-tertiary)] self-center pl-2 pr-1`}>Strike</div>
            {cols.map((c, ci) => (
              <div key={c.expiration} className="text-center leading-tight self-center px-0.5">
                <div className="text-[var(--text-secondary)]">{fmtExp(c.expiration)}</div>
                <div style={{ color: c.dte <= 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{c.dte <= 0 ? '0DTE' : `${c.dte}D`}</div>
                {/* per-expiry net-γ bias bar — width ∝ this expiry's |Σγ| share, coloured by sign */}
                <div className="mt-1 h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text-tertiary) 16%, transparent)' }}>
                  <div className="h-full mx-auto rounded-full" style={{ width: `${Math.max(6, Math.round((Math.abs(colTot[ci]) / maxColTot) * 100))}%`, background: colTot[ci] >= 0 ? 'var(--success)' : 'var(--danger)' }} />
                </div>
              </div>
            ))}
            <div className="text-center text-[var(--text-tertiary)] self-center pr-1">Net γ</div>
          </div>
          {/* Body — one row per strike, with the aggregate gamma-flip line drawn across it */}
          <div className="relative">
            {ks.map((k, ri) => {
              const isSpot = k === nearestK;
              const rn = rowNet[ri];
              return (
                <div key={k} className="grid gap-x-0.5 pr-2 items-center" style={{ gridTemplateColumns: template, height: rowH, ...(isSpot ? { background: 'color-mix(in srgb, var(--accent-color) 8%, transparent)' } : undefined) }}>
                  <div className={`${stickCol} z-20 h-full flex items-center justify-end text-right font-bold pl-1.5 pr-1`} style={{ color: isSpot ? 'var(--accent-color)' : 'var(--text-secondary)', background: isSpot ? 'color-mix(in srgb, var(--accent-color) 14%, var(--surface))' : 'var(--surface)', boxShadow: isSpot ? 'inset 3px 0 0 var(--accent-color)' : undefined }}>{Number.isInteger(k) ? k.toLocaleString('en-US') : nf(k)}</div>
                  {cols.map((c, ci) => {
                    const v = cell[ci].get(k) || 0;
                    const isWall = wall[ci] === k && Math.abs(v) > 0;
                    return (
                      <div key={c.expiration} className="relative h-full flex items-center justify-center rounded-[2px]" style={{ background: v ? cellBg(v) : undefined, boxShadow: isWall ? `inset 0 0 0 1px ${v >= 0 ? 'var(--success)' : 'var(--danger)'}` : undefined }}>
                        <span style={{ color: v ? cellInk(v) : 'var(--text-tertiary)', fontWeight: Math.abs(v) / maxAbs > 0.5 ? 800 : 600 }}>{v ? fmtG(v) : '·'}</span>
                        {full && isWall && <span className="absolute top-0 right-0.5 text-[6px] font-black leading-none pt-px" style={{ color: v >= 0 ? 'var(--success)' : 'var(--danger)' }}>{v >= 0 ? 'CW' : 'PW'}</span>}
                      </div>
                    );
                  })}
                  {/* NET-by-strike — diverging bar from centre (green right / red left) + value */}
                  <div className="relative h-full flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-y-[3px] left-1/2 w-px" style={{ background: 'var(--border)' }} />
                    {rn !== 0 && <div className="absolute top-1/2 -translate-y-1/2 h-[58%] rounded-[1px]" style={rn >= 0 ? { left: '50%', width: `${Math.min(49, (Math.abs(rn) / maxRowNet) * 49)}%`, background: 'color-mix(in srgb, var(--success) 50%, transparent)' } : { right: '50%', width: `${Math.min(49, (Math.abs(rn) / maxRowNet) * 49)}%`, background: 'color-mix(in srgb, var(--danger) 50%, transparent)' }} />}
                    <span className="relative z-10 font-bold" style={{ color: rn >= 0 ? 'var(--success)' : 'var(--danger)' }}>{rn ? fmtG(rn) : '·'}</span>
                  </div>
                </div>
              );
            })}
            {/* Gamma-flip line — the aggregate +γ → −γ crossing (the dealer flip level) */}
            {flipIdx > 0 && (
              <div className="absolute left-0 right-0 z-[21] pointer-events-none flex items-center" style={{ top: flipIdx * rowH }}>
                <div className="flex-1 h-px" style={{ background: 'var(--warning)', boxShadow: '0 0 6px color-mix(in srgb, var(--warning) 70%, transparent)' }} />
                <span className="shrink-0 mr-1.5 px-1 py-px rounded-sm text-[7px] font-black uppercase tracking-wider" style={{ background: 'var(--warning)', color: '#06090d' }}>γ Flip</span>
              </div>
            )}
          </div>
          {/* TOTAL footer — per-expiry Σ net γ + grand total */}
          <div className="grid gap-x-0.5 pr-2 py-1.5 sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] text-[9px] font-black z-20" style={{ gridTemplateColumns: template }}>
            <div className={`${stickCol} z-30 text-right text-[var(--text-tertiary)] uppercase tracking-[0.1em] text-[8px] self-center pl-2 pr-1`}>Total</div>
            {colTot.map((t, ci) => (<div key={cols[ci].expiration} className="text-center" style={{ color: t >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtG(t)}</div>))}
            <div className="text-center" style={{ color: grand >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtG(grand)}</div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════ Single-expiry fallback (CALL | PUT | VOL) ════════════════════════════
  if (!single || !single.rows.length) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;
  const { rows, maxCall, maxPut, maxVol, totCall, totPut, totVol } = single;
  const grid = full ? 'grid grid-cols-[84px_1fr_1fr_56px]' : 'grid grid-cols-[58px_1fr_1fr_42px]';
  const rowH = full ? 'h-[24px]' : 'h-[19px]';
  const fz = full ? 'text-[12px]' : 'text-[10px]';
  const callBg = (v: number) => `color-mix(in srgb, var(--success) ${Math.round(6 + Math.min(1, Math.abs(v) / maxCall) * 54)}%, transparent)`;
  const putBg = (v: number) => `color-mix(in srgb, var(--danger) ${Math.round(6 + Math.min(1, Math.abs(v) / maxPut) * 54)}%, transparent)`;

  return (
    <div className={`w-full font-mono ${fz} tabular-nums select-none`}>
      <div className={`${grid} gap-x-1 px-2 py-1.5 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] text-[8px] font-black uppercase tracking-[0.14em]`}>
        <div className="text-right text-[var(--text-tertiary)]">Strike</div>
        <div className="text-center" style={{ color: 'var(--success)' }}>Call Γ</div>
        <div className="text-center" style={{ color: 'var(--danger)' }}>Put Γ</div>
        <div className="text-right text-[var(--text-tertiary)]">Vol</div>
      </div>
      <div>
        {rows.map(r => {
          const cMag = Math.abs(r.call) / maxCall, pMag = Math.abs(r.put) / maxPut, vHot = r.vol / maxVol > 0.55;
          return (
            <div key={r.strike} className={`${grid} gap-x-1 px-2 items-center ${rowH} hover:bg-white/[0.03] transition-colors duration-150`}
              style={r.isSpot ? { boxShadow: 'inset 3px 0 0 var(--accent-color)', background: 'color-mix(in srgb, var(--accent-color) 9%, transparent)' } : undefined}>
              <div className="text-right font-bold" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: r.isSpot ? 800 : 600 }}>{nf(r.strike)}</div>
              <div className="h-full flex items-center justify-center rounded-[2px] transition-colors duration-300"
                style={{ background: callBg(r.call), boxShadow: r.isCW ? 'inset 0 0 0 1px var(--success), 0 0 7px -2px var(--success)' : undefined }}>
                <span style={{ color: cMag > 0.4 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: cMag > 0.6 ? 800 : 600 }}>{r.call ? fmtG(r.call) : '·'}</span>
              </div>
              <div className="h-full flex items-center justify-center rounded-[2px] transition-colors duration-300"
                style={{ background: putBg(r.put), boxShadow: r.isPW ? 'inset 0 0 0 1px var(--danger), 0 0 7px -2px var(--danger)' : undefined }}>
                <span style={{ color: pMag > 0.4 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: pMag > 0.6 ? 800 : 600 }}>{r.put ? fmtG(r.put) : '·'}</span>
              </div>
              <div className="flex justify-end">
                <span className="px-1 rounded-full text-[8.5px] font-bold tabular-nums" style={{ background: vHot ? 'color-mix(in srgb, var(--text-tertiary) 30%, transparent)' : 'color-mix(in srgb, var(--text-tertiary) 13%, transparent)', color: vHot ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{r.vol ? fmtVol(r.vol) : '–'}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={`${grid} gap-x-1 px-2 py-1.5 sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] text-[9px] font-black z-10`}>
        <div className="text-right text-[var(--text-tertiary)] uppercase tracking-[0.1em] text-[8px] self-center">Total</div>
        <div className="text-center" style={{ color: 'var(--success)' }}>{fmtG(totCall)}</div>
        <div className="text-center" style={{ color: 'var(--danger)' }}>{fmtG(totPut)}</div>
        <div className="text-right text-[var(--text-secondary)]">{fmtVol(totVol)}</div>
      </div>
    </div>
  );
}
