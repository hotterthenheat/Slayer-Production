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
    // Per-column max |γ| — wall glows gate on THIS so every expiry lights its own call/put wall, even a
    // far-dated column whose gamma is small next to the 0DTE column (global gating would leave it dark).
    const colMaxAbs = cols.map((_, ci) => { let m = 1; for (const k of ks) m = Math.max(m, Math.abs(cell[ci].get(k) || 0)); return m; });
    const rowNet = ks.map(k => cell.reduce((a, m) => a + (m.get(k) || 0), 0));
    const maxRowNet = Math.max(1, ...rowNet.map(Math.abs));
    const colTot = cols.map(m => 0).map((_, ci) => ks.reduce((a, k) => a + (cell[ci].get(k) || 0), 0));
    const grand = colTot.reduce((a, b) => a + b, 0);
    // Per-expiry KEY LEVELS — in EACH column the brightest call wall (largest +γ) and put wall (largest
    // −γ), so every expiry's dominant level on each side carries a subtle ring.
    const callWall = cols.map((_, ci) => { let bs = NaN, bm = 0; for (const k of ks) { const v = cell[ci].get(k) || 0; if (v > bm) { bm = v; bs = k; } } return bs; });
    const putWall = cols.map((_, ci) => { let bs = NaN, bm = 0; for (const k of ks) { const v = cell[ci].get(k) || 0; if (v < bm) { bm = v; bs = k; } } return bs; });
    // HERO walls — the single strongest call wall (+γ) and put wall (−γ) across the whole grid. These two
    // cells get the prominent ring + CW/PW tag (the "biggest" the eye lands on first); every other per-column
    // wall keeps only a faint ring, so the grid reads calm instead of a wall of tags.
    let cwHero = { ci: -1, k: NaN, v: 0 }, pwHero = { ci: -1, k: NaN, v: 0 };
    cols.forEach((_, ci) => { for (const k of ks) { const v = cell[ci].get(k) || 0; if (v > cwHero.v) cwHero = { ci, k, v }; if (v < pwHero.v) pwHero = { ci, k, v }; } });
    // Gamma-flip row — where the AGGREGATE net γ crosses from + to − going down strikes (the dealer flip
    // level): the line is drawn between rows flipIdx-1 and flipIdx. −1 if no crossing is in view.
    let flipIdx = -1;
    for (let i = 1; i < rowNet.length; i++) { if (rowNet[i - 1] > 0 && rowNet[i] <= 0) { flipIdx = i; break; } }
    // The strike row NEAREST spot gets the accent highlight, so the live price is always located even when
    // it sits between strikes (it usually does).
    let nearestK = NaN; if (spot) { let bd = Infinity; for (const k of ks) { const d = Math.abs(k - spot); if (d < bd) { bd = d; nearestK = k; } } }
    // Expected-move boundary strikes — the strikes nearest spot×(1±EM%), tagged so the implied day range
    // is located on the grid (the "expected" the eye should also catch). NaN when no EM% / no spot.
    let emHiK = NaN, emLoK = NaN;
    if (spot && profile.expectedMovePct) {
      const emHi = spot * (1 + profile.expectedMovePct), emLo = spot * (1 - profile.expectedMovePct);
      let bdH = Infinity, bdL = Infinity;
      for (const k of ks) { const dh = Math.abs(k - emHi); if (dh < bdH) { bdH = dh; emHiK = k; } const dl = Math.abs(k - emLo); if (dl < bdL) { bdL = dl; emLoK = k; } }
    }
    return { cols, ks, cell, maxAbs, colMaxAbs, rowNet, maxRowNet, colTot, grand, callWall, putWall, cwHero, pwHero, flipIdx, nearestK, emHiK, emLoK, spot };
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
    const { cols, ks, cell, maxAbs, colMaxAbs, rowNet, maxRowNet, colTot, grand, callWall, putWall, cwHero, pwHero, flipIdx, nearestK, emHiK, emLoK } = matrix;
    const strikeW = full ? 74 : 52, netW = full ? 84 : 52, colMin = full ? 56 : 38;
    const rowH = full ? 23 : 17, fz = full ? 'text-[11px]' : 'text-[9px]';
    const PITCH = rowH;   // no row gap → cell hairlines form the grid; used to place the spot box / flip overlays
    const template = `${strikeW}px repeat(${cols.length}, minmax(${colMin}px, 1fr)) ${netW}px`;
    const stick = 'sticky left-0';   // frozen strike axis when scrolling expiries
    const hair = 'inset 0 0 0 1px var(--border)';   // crisp hairline around every cell → reads as a true matrix grid
    const FIELD = 'color-mix(in srgb, var(--surface) 45%, var(--bg-base))';   // near-black cell field → bright cells glow against it
    const spotIdx = ks.indexOf(nearestK);
    // Per-expiry heat — intensity is relative to THAT column's own peak (so every expiry reveals its own
    // call/put structure, not just the front month), then gently damped by how that column's peak compares
    // to the global peak so a near-dead far-dated column stays dim. A steep curve sinks weak cells into the
    // near-black FIELD and lets only the dealer walls blaze — a dark canvas with glowing hotspots, not a
    // green/red wash. The printed value is always the truth; the fill is only a reading aid. green +γ, red −γ.
    const heat = (v: number, ci: number) => Math.min(1, Math.abs(v) / colMaxAbs[ci]) * Math.pow(colMaxAbs[ci] / maxAbs, 0.28);
    const cellBg = (v: number, ci: number) => { if (!v) return FIELD; const tok = v >= 0 ? 'var(--success)' : 'var(--danger)'; return `color-mix(in srgb, ${tok} ${Math.round(3 + Math.pow(heat(v, ci), 1.7) * 91)}%, ${FIELD})`; };
    const cellInk = (v: number, ci: number) => { const t = heat(v, ci); return t > 0.4 ? 'var(--text-primary)' : t > 0.1 ? 'var(--text-secondary)' : 'var(--text-tertiary)'; };
    // Magnitude-proportional bloom: cells past mid-strength cast a soft coloured glow so the walls read as
    // luminous hotspots (the itmatrix look), scaled by how hot the cell is.
    const cellGlow = (v: number, ci: number) => { const t = heat(v, ci); return t > 0.5 ? `, 0 0 ${Math.round((t - 0.5) * 26) + 4}px -3px color-mix(in srgb, ${v >= 0 ? 'var(--success)' : 'var(--danger)'} 62%, transparent)` : ''; };

    return (
      <div className="w-full overflow-x-auto hide-scrollbar">
        <div className={`min-w-max font-mono ${fz} tabular-nums select-none`}>
          {/* Legend — decodes the markers. Full-screen only (the rail is too narrow); theme tokens throughout. */}
          {full && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b border-[var(--border)] text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)] bg-[var(--surface)]">
              <span className="text-[var(--text-secondary)]">Net γ / strike · per-expiry heat</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--success) 60%, var(--surface))' }} />+ γ long</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--danger) 60%, var(--surface))' }} />− γ short</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1.5px var(--success)' }} />CW call wall</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1.5px var(--danger)' }} />PW put wall</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1.5px var(--accent-color)' }} />Spot</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--info)' }} />EM exp move</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5" style={{ background: 'var(--warning)' }} />γ flip</span>
            </div>
          )}
          {/* Column header — STRIKE · expiry (date · DTE) · NET */}
          <div className="grid sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)] text-[8px] font-black uppercase tracking-[0.12em]" style={{ gridTemplateColumns: template }}>
            <div className={`${stick} z-30 bg-[var(--surface)] text-right text-[var(--text-tertiary)] self-stretch flex items-center justify-end pl-2 pr-2 py-2`}>Strike</div>
            {cols.map((c, ci) => (
              <div key={c.expiration} className="text-center leading-tight self-center px-0.5 py-2">
                <div className="text-[var(--text-secondary)]">{fmtExp(c.expiration)}</div>
                <div style={{ color: c.dte <= 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{c.dte <= 0 ? '0DTE' : `${c.dte}D`}</div>
              </div>
            ))}
            <div className="text-center text-[var(--text-tertiary)] self-center pr-1 py-2">Net γ</div>
          </div>
          {/* Body — every cell is a surface tile outlined by a 1px hairline → a true matrix grid; the spot
              box + γ-flip divider are drawn as overlays on top. */}
          <div className="relative flex flex-col" style={{ background: 'var(--surface)' }}>
            {ks.map((k, ri) => {
              const isSpot = k === nearestK;
              const isEm = !isSpot && (k === emHiK || k === emLoK);   // expected-move boundary strike (not the spot row)
              const rn = rowNet[ri];
              return (
                <div key={k} className="grid items-stretch" style={{ gridTemplateColumns: template, height: rowH }}>
                  <div className={`${stick} z-20 h-full flex items-center justify-end gap-1 text-right font-bold pl-2 pr-2`} style={{ color: isSpot ? 'var(--accent-color)' : isEm ? 'var(--info)' : 'var(--text-secondary)', background: isSpot ? 'color-mix(in srgb, var(--accent-color) 16%, var(--surface))' : isEm ? 'color-mix(in srgb, var(--info) 12%, var(--surface))' : 'var(--surface)', boxShadow: isSpot ? 'inset 3px 0 0 var(--accent-color), inset -1px 0 0 var(--border)' : isEm ? 'inset 3px 0 0 var(--info), inset -1px 0 0 var(--border)' : 'inset -1px 0 0 var(--border)' }}>
                    {isEm && <span className="px-0.5 rounded-[2px] text-[6.5px] font-black leading-none tracking-wide" style={{ background: 'color-mix(in srgb, var(--info) 26%, transparent)', color: 'var(--info)' }}>EM</span>}
                    {Number.isInteger(k) ? k.toLocaleString('en-US') : nf(k)}
                  </div>
                  {cols.map((c, ci) => {
                    const v = cell[ci].get(k) || 0;
                    // Per-column wall ring (subtle); the single strongest call/put wall in the whole grid is the
                    // HERO — brighter ring + soft glow + CW/PW tag, so the dominant level pops without a wall of tags.
                    const isCW = callWall[ci] === k && v > 0 && heat(v, ci) > 0.38;
                    const isPW = putWall[ci] === k && v < 0 && heat(v, ci) > 0.38;
                    const heroCW = ci === cwHero.ci && k === cwHero.k, heroPW = ci === pwHero.ci && k === pwHero.k;
                    const ring = heroCW ? 'inset 0 0 0 1.5px var(--success), 0 0 14px -2px var(--success)'
                      : heroPW ? 'inset 0 0 0 1.5px var(--danger), 0 0 14px -2px var(--danger)'
                      : isCW ? 'inset 0 0 0 1px color-mix(in srgb, var(--success) 60%, transparent)'
                      : isPW ? 'inset 0 0 0 1px color-mix(in srgb, var(--danger) 60%, transparent)' : hair;
                    return (
                      <div key={c.expiration} className="relative h-full flex items-center justify-center" style={{ background: cellBg(v, ci), boxShadow: `${ring}${(heroCW || heroPW) ? '' : cellGlow(v, ci)}` }}>
                        <span style={{ color: v ? cellInk(v, ci) : 'var(--text-tertiary)', fontWeight: heat(v, ci) > 0.5 ? 800 : 600 }}>{v ? fmtG(v) : '·'}</span>
                        {full && (heroCW || heroPW) && <span className="absolute top-px right-0.5 text-[6.5px] font-black leading-none" style={{ color: heroCW ? 'var(--success)' : 'var(--danger)' }}>{heroCW ? 'CW' : 'PW'}</span>}
                      </div>
                    );
                  })}
                  {/* NET-by-strike — the row aggregate; a diverging mini-bar (green right / red left of centre)
                      pins to the bottom edge so it never collides with the number. */}
                  <div className="relative h-full flex items-center justify-center" style={{ background: 'var(--surface)', boxShadow: hair }}>
                    <span className="font-bold leading-none" style={{ color: rn >= 0 ? 'var(--success)' : 'var(--danger)' }}>{rn ? fmtG(rn) : '·'}</span>
                    {rn !== 0 && (
                      <div className="absolute bottom-[2px] left-1.5 right-1.5 h-[2.5px] flex items-stretch opacity-90">
                        <div className="flex-1 flex justify-end"><div style={{ width: `${Math.min(100, (Math.abs(rn) / maxRowNet) * 100)}%`, background: rn < 0 ? 'var(--danger)' : 'transparent', borderRadius: 1 }} /></div>
                        <div className="w-px shrink-0" style={{ background: 'var(--border-strong)' }} />
                        <div className="flex-1 flex justify-start"><div style={{ width: `${Math.min(100, (Math.abs(rn) / maxRowNet) * 100)}%`, background: rn >= 0 ? 'var(--success)' : 'transparent', borderRadius: 1 }} /></div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Boxed current strike — the clean accent ring around the live-price row (overlay so the frozen
                strike cell's fill never clips it). */}
            {spotIdx >= 0 && (
              <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: spotIdx * PITCH - 1, height: rowH + 2, boxShadow: 'inset 0 0 0 1.5px var(--accent-color)', borderRadius: 3 }} />
            )}
            {/* Gamma-flip divider — the aggregate +γ → −γ crossing, drawn ON the gridline between rows with a
                small chip at the strike edge (never overlaps a row's numbers). */}
            {flipIdx > 0 && (
              <div className="absolute left-0 right-0 z-[31] pointer-events-none flex items-center" style={{ top: flipIdx * PITCH - 1.5, height: 3 }}>
                <span className="shrink-0 px-0.5 py-px rounded-[2px] text-[6.5px] font-black uppercase tracking-wide leading-none" style={{ background: 'var(--warning)', color: 'var(--bg-base)' }}>Γ Flip</span>
                <div className="flex-1 h-px" style={{ background: 'var(--warning)', boxShadow: '0 0 7px color-mix(in srgb, var(--warning) 75%, transparent)' }} />
              </div>
            )}
          </div>
          {/* TOTAL footer — per-expiry Σ net γ + grand total */}
          <div className="grid sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] text-[9px] font-black z-20" style={{ gridTemplateColumns: template }}>
            <div className={`${stick} z-30 bg-[var(--surface)] text-right text-[var(--text-tertiary)] uppercase tracking-[0.1em] text-[8px] flex items-center justify-end pl-2 pr-2 py-2`}>Total</div>
            {colTot.map((t, ci) => (<div key={cols[ci].expiration} className="text-center self-center py-2" style={{ color: t >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtG(t)}</div>))}
            <div className="text-center self-center py-2" style={{ color: grand >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtG(grand)}</div>
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
