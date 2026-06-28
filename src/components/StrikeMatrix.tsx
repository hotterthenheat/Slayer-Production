import { useMemo } from 'react';
import type { GexProfileData } from '../types';

/**
 * Strike Matrix — dealer-heatmap build (SpotGamma / Voltick style). Each strike is a row; its NET γ
 * reads as a colour-filled cell (green = positive / dealers sticky / PIN, red = negative / slippery /
 * ACCELERANT; brighter = bigger). Suspicious GEX (outlier-magnitude walls) gets a ★ + glow ring, and
 * the corridor between spot and the gamma magnet is tinted to show where price is being pulled.
 *
 * Two layouts, one component:
 *  • SINGLE expiry (the live default): expiry-dated header, one heatmap column + a magnitude bar, with
 *    spot / flip / walls / magnet marked inline and anomaly + path cues.
 *  • MULTI expiry (the full Voltick matrix): one heatmap column per expiration with the expiry dates
 *    across the top and a per-expiry net-γ bar footer. Renders only when `profile.expiries` is supplied
 *    (the server's multi-expiry fetch is opt-in — it adds OPRA cost — so it is absent by default).
 */

const fmtG = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : '+'; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`; if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`; return `${s}${Math.round(a)}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'YYYY-MM-DD' → 'Jun 28' (parsed by hand to stay timezone-stable).
const fmtExp = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso; const mo = +m[2]; return `${MON[mo - 1] ?? '?'} ${+m[3]}`; };
// Heat fill: green for +γ / red for −γ, brightness ∝ magnitude (relative to the matrix max).
const heatBg = (net: number, maxAbs: number) => { const mag = maxAbs ? Math.min(1, Math.abs(net) / maxAbs) : 0; const hue = net >= 0 ? 'var(--success)' : 'var(--danger)'; return `color-mix(in srgb, ${hue} ${Math.round(7 + mag * 50)}%, transparent)`; };
const MAX_EXP_COLS = 6; // keep the grid readable; surface a note if the server sent more
const NEAR = 56;        // strikes kept around spot — the actionable band (fuller than before)

// Compact, shared legend so the colour language is always explained.
function Legend() {
  return (
    <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 px-2 py-1 text-[8px] font-mono uppercase tracking-wide text-[var(--text-tertiary)] border-b border-[var(--border)] bg-[var(--surface)]">
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--success) 55%, transparent)' }} />Pin / sticky</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--danger) 55%, transparent)' }} />Slip / accel</span>
      <span className="flex items-center gap-1" title="Outlier-magnitude strike — a dealer wall"><span style={{ color: 'var(--warning)' }}>★</span>Wall</span>
      <span className="flex items-center gap-1" title="Gamma magnet — where dealer hedging pulls price"><span style={{ color: 'var(--info)' }}>◆</span>Magnet</span>
    </div>
  );
}

export function StrikeMatrix({ profile, decimals = 0 }: { profile: GexProfileData; decimals?: number }) {
  const view = useMemo(() => {
    const spot = profile.spot || 0;
    const magnet = profile.magnet || 0;
    const exps = (profile.expiries || []).filter(e => (e.strikes || []).length);
    const near0 = (a: number, b: number) => spot ? Math.abs(a - b) < spot * 0.0008 : a === b;

    // ── MULTI-EXPIRY GRID ────────────────────────────────────────────────────
    if (exps.length > 1) {
      const cols = exps.slice(0, MAX_EXP_COLS);
      const hiddenCols = exps.length - cols.length;
      const maps = cols.map(c => { const m = new Map<number, number>(); for (const s of c.strikes) m.set(s.strike, (m.get(s.strike) || 0) + (s.netGex || 0)); return m; });
      const strikeSet = new Set<number>();
      for (const m of maps) for (const k of m.keys()) strikeSet.add(k);
      let strikes = [...strikeSet].filter(k => maps.some(m => Math.abs(m.get(k) || 0) > 0));
      strikes = (spot ? strikes.sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot)) : strikes.sort((a, b) => b - a)).slice(0, 36);
      strikes.sort((a, b) => b - a);
      const maxAbs = Math.max(1, ...maps.flatMap(m => [...m.values()].map(Math.abs)));
      const maxColNet = Math.max(1, ...cols.map(c => Math.abs(c.netGex || 0)));
      const rows = strikes.map(strike => ({
        strike,
        isSpot: !!spot && near0(strike, spot),
        isFlip: strike === profile.gammaFlip,
        isCW: strike === profile.callWall, isPW: strike === profile.putWall,
        isMagnet: !!magnet && near0(strike, magnet),
        cells: maps.map(m => m.get(strike) ?? 0),
      }));
      return { mode: 'multi' as const, cols, hiddenCols, rows, maxAbs, maxColNet };
    }

    // ── SINGLE-EXPIRY HEATMAP (live default) ─────────────────────────────────
    const all = profile.strikes || [];
    const ss = all.filter(s => Math.abs(s.netGex || 0) > 0 || (s.callOi || 0) + (s.putOi || 0) > 0);
    const near = (spot ? [...ss].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, NEAR) : ss.slice(0, NEAR));
    const maxNet = Math.max(...near.map(s => Math.abs(s.netGex || 0)), 1);
    // Anomaly threshold: a strike whose |net γ| is a statistical outlier (≫ the band mean) is a dealer
    // wall worth flagging — "suspicious GEX" the eye should jump to.
    const absVals = near.map(s => Math.abs(s.netGex || 0));
    const mean = absVals.reduce((a, b) => a + b, 0) / (absVals.length || 1);
    // Path corridor: the strikes between spot and the magnet — where dealer hedging is pulling price.
    const pathLo = Math.min(spot || magnet, magnet || spot), pathHi = Math.max(spot || magnet, magnet || spot);
    const rows = near.sort((a, b) => b.strike - a.strike).map(s => {
      const net = s.netGex || 0, mg = Math.abs(net);
      return {
        strike: s.strike, net, pos: net >= 0, mag: mg / maxNet,
        isSpot: !!spot && near0(s.strike, spot),
        isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
        isMagnet: !!magnet && near0(s.strike, magnet),
        // Suspicious GEX = a dominant wall: large vs the biggest in view AND vs the typical strike.
        isAnomaly: near.length > 6 && mg / maxNet >= 0.55 && mg >= mean * 1.8,
        inPath: !!(spot && magnet) && s.strike >= pathLo && s.strike <= pathHi,
      };
    });
    const totalNet = all.reduce((a, s) => a + (s.netGex || 0), 0);
    const magnetDir = magnet && spot ? (magnet > spot ? 'up' : magnet < spot ? 'down' : 'flat') : null;
    return { mode: 'single' as const, rows, totalNet, magnet, spot, magnetDir };
  }, [profile]);

  const nf = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const expHdr = (profile.expiryDate || profile.expiryLabel)
    ? <span className="flex items-center gap-1.5"><span className="text-[var(--text-secondary)] font-black">{profile.expiryDate || ''}</span>{profile.expiryLabel && <span className="px-1 rounded-sm text-[7.5px] font-black" style={{ background: 'color-mix(in srgb, var(--accent-color) 16%, transparent)', color: 'var(--accent-color)' }}>{profile.expiryLabel}</span>}</span>
    : null;

  // ── MULTI-EXPIRY RENDER ────────────────────────────────────────────────────
  if (view.mode === 'multi') {
    const { cols, hiddenCols, rows, maxAbs, maxColNet } = view;
    const grid = { gridTemplateColumns: `52px repeat(${cols.length}, minmax(0, 1fr))` };
    if (!rows.length) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;
    return (
      <div className="w-full font-mono text-[10px] tabular-nums select-none">
        <Legend />
        <div className="grid gap-x-1 px-2 py-1.5 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)]" style={grid}>
          <div className="text-right text-[8px] font-black uppercase tracking-[0.14em] text-[var(--text-tertiary)] self-end">Strike</div>
          {cols.map(c => (
            <div key={c.expiration} className="flex flex-col items-center leading-tight" title={`${c.expiration} · ${c.dte}DTE · net γ ${fmtG(c.netGex)}`}>
              <span className="text-[9px] font-black text-[var(--text-secondary)]">{fmtExp(c.expiration)}</span>
              <span className="text-[7.5px] font-bold uppercase tracking-wider" style={{ color: c.dte <= 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{c.dte <= 0 ? '0DTE' : `${c.dte}d`}</span>
            </div>
          ))}
        </div>
        <div>
          {rows.map(r => {
            const marker = r.isMagnet ? 'var(--info)' : r.isCW ? 'var(--success)' : r.isPW ? 'var(--danger)' : r.isFlip ? 'var(--warning)' : null;
            return (
              <div key={r.strike} className="grid gap-x-1 px-2 items-center h-[19px] hover:bg-white/[0.03] transition-colors duration-150" style={{ ...grid, ...(r.isSpot ? { boxShadow: 'inset 2px 0 0 var(--accent-color)' } : {}) }}>
                <div className="flex items-center justify-end gap-1">
                  {r.isMagnet && <span className="text-[7px] font-black shrink-0" style={{ color: 'var(--info)' }}>◆</span>}
                  {marker && !r.isMagnet && <span className="w-1 h-1 rounded-full shrink-0" style={{ background: marker }} title={r.isCW ? 'Call Wall' : r.isPW ? 'Put Wall' : 'Gamma Flip'} />}
                  {r.isSpot && <span className="text-[6.5px] font-black" style={{ color: 'var(--accent-color)' }}>◄</span>}
                  <span style={{ color: r.isSpot ? 'var(--accent-color)' : r.isFlip ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: r.isSpot || r.isFlip ? 800 : 600 }}>{nf(r.strike)}</span>
                </div>
                {r.cells.map((net, i) => {
                  const mag = maxAbs ? Math.abs(net) / maxAbs : 0;
                  return (
                    <div key={i} className="h-[15px] rounded-[3px] flex items-center justify-center transition-colors duration-300" style={{ background: heatBg(net, maxAbs) }}>
                      <span style={{ color: mag > 0.32 ? 'var(--text-primary)' : `color-mix(in srgb, ${net >= 0 ? 'var(--success)' : 'var(--danger)'} 75%, var(--text-tertiary))`, fontWeight: mag > 0.6 ? 800 : 600 }}>{net ? fmtG(net) : '·'}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="grid gap-x-1 px-2 pt-1.5 pb-1 sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border-strong)] z-10" style={grid}>
          <div className="text-right text-[8px] font-black uppercase tracking-[0.1em] text-[var(--text-tertiary)] self-end pb-0.5">Net γ</div>
          {cols.map(c => {
            const pos = (c.netGex || 0) >= 0, h = Math.max(3, (Math.abs(c.netGex || 0) / maxColNet) * 22);
            return (
              <div key={c.expiration} className="flex flex-col items-center justify-end gap-0.5" title={`${fmtExp(c.expiration)} net γ ${fmtG(c.netGex)}`}>
                <div className="w-full flex items-end justify-center h-[22px]"><div className="w-[60%] rounded-sm" style={{ height: `${h}px`, background: pos ? 'var(--success)' : 'var(--danger)', opacity: 0.85 }} /></div>
                <span className="text-[8px] font-black" style={{ color: pos ? 'var(--success)' : 'var(--danger)' }}>{fmtG(c.netGex)}</span>
              </div>
            );
          })}
        </div>
        {hiddenCols > 0 && <div className="px-2 py-1 text-[8px] font-mono text-[var(--text-tertiary)] text-right">+{hiddenCols} more {hiddenCols === 1 ? 'expiry' : 'expiries'} not shown</div>}
      </div>
    );
  }

  // ── SINGLE-EXPIRY RENDER ────────────────────────────────────────────────────
  const { rows, totalNet, magnet, magnetDir } = view;
  if (!rows.length) return <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>;
  const cols = 'grid grid-cols-[58px_minmax(0,1fr)_40px] gap-x-1.5 px-2';

  return (
    <div className="w-full font-mono text-[10.5px] tabular-nums select-none">
      {/* Expiry + directional read header */}
      <div className="flex items-center justify-between px-2 py-1 text-[9px] font-mono border-b border-[var(--border)] bg-[var(--surface)]">
        <span className="flex items-center gap-1 text-[7.5px] font-black uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Exp{expHdr}</span>
        {magnet ? (
          <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wide" style={{ color: 'var(--info)' }} title="Gamma magnet — where dealer hedging is pulling price">
            ◆ Pull {magnetDir === 'up' ? '▲' : magnetDir === 'down' ? '▼' : '→'} {nf(magnet)}
          </span>
        ) : null}
      </div>
      <Legend />
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
            <div key={r.strike} className="grid grid-cols-[58px_minmax(0,1fr)_40px] gap-x-1.5 px-2 items-center h-[20px] hover:bg-white/[0.04] transition-colors duration-150"
              style={r.isSpot ? { boxShadow: 'inset 2px 0 0 var(--accent-color)' } : r.inPath ? { background: 'color-mix(in srgb, var(--info) 5%, transparent)' } : undefined}>
              {/* Strike + level markers */}
              <div className="relative flex items-center justify-end gap-0.5">
                {r.isAnomaly && <span className="text-[8px] font-black shrink-0" style={{ color: 'var(--warning)' }} title="Suspicious GEX — outlier-magnitude dealer wall">★</span>}
                {r.isMagnet && <span className="text-[7px] font-black shrink-0" style={{ color: 'var(--info)' }} title="Gamma magnet">◆</span>}
                {marker && !r.isMagnet && <span className="w-1 h-1 rounded-full shrink-0" style={{ background: marker }} title={r.isCW ? 'Call Wall' : r.isPW ? 'Put Wall' : 'Gamma Flip'} />}
                {r.isSpot && <span className="text-[6.5px] font-black tracking-wider shrink-0" style={{ color: 'var(--accent-color)' }}>◄</span>}
                <span style={{ color: r.isSpot ? 'var(--accent-color)' : r.isFlip ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: r.isSpot || r.isFlip ? 800 : 600 }}>{nf(r.strike)}</span>
              </div>
              {/* Net γ heatmap cell — colour by sign, brightness ∝ magnitude; anomalies get a glow ring */}
              <div className="relative h-[15px] rounded-[3px] flex items-center justify-end pr-1.5 overflow-hidden transition-colors duration-300"
                style={{ background: `color-mix(in srgb, ${hue} ${Math.round(9 + r.mag * 48)}%, transparent)`, boxShadow: r.isAnomaly ? `inset 0 0 0 1px ${hue}, 0 0 8px -2px ${hue}` : r.isFlip ? `inset 0 0 0 1px color-mix(in srgb, var(--warning) 60%, transparent)` : undefined }}>
                <span style={{ color: r.mag > 0.32 ? 'var(--text-primary)' : `color-mix(in srgb, ${hue} 80%, var(--text-tertiary))`, fontWeight: r.mag > 0.6 ? 800 : 600 }}>{r.net ? fmtG(r.net) : '·'}</span>
              </div>
              {/* Magnitude bar — the gamma profile as a shape down the column */}
              <div className="relative h-[15px] flex items-center">
                <div className="w-full h-[6px] rounded-sm overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text-tertiary) 12%, transparent)' }}>
                  <div className="h-full rounded-sm" style={{ width: `${Math.max(4, r.mag * 100)}%`, background: hue, opacity: 0.35 + r.mag * 0.6, transition: 'width 300ms ease-out' }} />
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
