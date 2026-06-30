/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IMPLIED VOLATILITY SMILE / SKEW
 * -------------------------------
 * The real front-expiry implied-volatility smile: per-strike IV straight from the
 * option chain (the one IV dimension the feed actually ships per contract), with
 * the at-the-money level, the 25-delta wings, and the dealer-desk skew dials
 * (25Δ risk reversal, 25Δ butterfly, ∂IV/∂lnK) computed from it.
 *
 * No term-structure extrapolation here — this is a single, REAL expiry. (A full
 * IV surface over DTE would be a labelled model, since per-(strike,expiry) IV is
 * not in the feed.) Everything plotted traces to a real contract IV.
 */
import { useMemo, useRef } from 'react';
import { computeSkew, ivAtDelta } from '../lib/skewAnalytics';
import type { ChainContract } from '../lib/v11Math';
import { useCrosshair, ChartTools } from './quant/chartInteraction';
import { useStrikeSync, StrikePublisher } from './quant/crosshairSync';

interface IvSmileProps {
  chain: ChainContract[];
  spot: number;
  decimals?: number;
  ticker?: string;
  live?: boolean;
  windowPct?: number;
}

export function IvSmile({ chain, spot, decimals = 0, ticker, live, windowPct = 0.14 }: IvSmileProps) {
  const m = useMemo(() => {
    if (!Array.isArray(chain) || chain.length < 4 || !(spot > 0)) return null;
    const lo = spot * (1 - windowPct), hi = spot * (1 + windowPct);
    // Blend call+put IV at each strike within the window.
    const byStrike = new Map<number, number[]>();
    chain.forEach((c) => {
      if (c.strike >= lo && c.strike <= hi && isFinite(c.iv) && c.iv > 0) {
        (byStrike.get(c.strike) || byStrike.set(c.strike, []).get(c.strike)!).push(c.iv);
      }
    });
    const pts = Array.from(byStrike.entries())
      .map(([strike, ivs]) => ({ strike, iv: ivs.reduce((a, b) => a + b, 0) / ivs.length }))
      .sort((a, b) => a.strike - b.strike);
    if (pts.length < 4) return null;

    const skew = computeSkew(chain, spot);
    const calls = chain.filter((c) => c.type === 'call');
    const puts = chain.filter((c) => c.type === 'put');
    // strike at a target |delta| (for marking the 25Δ wings on the curve)
    const strikeAtDelta = (side: ChainContract[], target: number): number | null => {
      const f = side.filter((c) => isFinite(c.delta) && isFinite(c.iv) && c.iv > 0)
        .map((c) => ({ ad: Math.abs(c.delta), k: c.strike })).sort((a, b) => a.ad - b.ad);
      if (f.length < 2) return null;
      for (let i = 1; i < f.length; i++) if (target <= f[i].ad) {
        const a = f[i - 1], b = f[i]; const t = (target - a.ad) / (b.ad - a.ad || 1);
        return a.k + (b.k - a.k) * t;
      }
      return f[f.length - 1].k;
    };
    const callWingK = strikeAtDelta(calls, 0.25);
    const putWingK = strikeAtDelta(puts, 0.25);

    const ivs = pts.map((p) => p.iv);
    const minIv = Math.min(...ivs), maxIv = Math.max(...ivs);
    const minS = pts[0].strike, maxS = pts[pts.length - 1].strike;
    return { pts, skew, minIv, maxIv, minS, maxS, callWingK, putWingK, callIv25: ivAtDelta(calls, 0.25), putIv25: ivAtDelta(puts, 0.25) };
  }, [chain, spot, windowPct]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);
  const { syncedStrike } = useStrikeSync('iv-smile');
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  if (!m) {
    return (
      <div className="h-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">No IV smile (chain too sparse)</span>
      </div>
    );
  }

  const W = 1000, H = 240, padL = 44, padR = 12, padT = 16, padB = 26;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const padIv = (m.maxIv - m.minIv) * 0.15 || 0.01;
  const loIv = Math.max(0, m.minIv - padIv), hiIv = m.maxIv + padIv;
  const sx = (k: number) => x0 + ((k - m.minS) / ((m.maxS - m.minS) || 1)) * (x1 - x0);
  const sy = (iv: number) => y1 - ((iv - loIv) / ((hiIv - loIv) || 1)) * (y1 - y0);
  const curve = m.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.strike).toFixed(1)},${sy(p.iv).toFixed(1)}`).join(' ');
  const area = `${curve} L${sx(m.maxS).toFixed(1)},${y1} L${sx(m.minS).toFixed(1)},${y1} Z`;
  const spotX = sx(spot);
  const ticks = [loIv, (loIv + hiIv) / 2, hiIv];

  // Crosshair: resolve pointer's viewBox-x to a strike, then interpolate the smile IV there.
  const hoverStrike = vx != null ? m.minS + ((vx - x0) / ((x1 - x0) || 1)) * (m.maxS - m.minS) : null;
  const hoverIv = (() => {
    if (hoverStrike == null || hoverStrike < m.minS || hoverStrike > m.maxS) return null;
    const p = m.pts;
    for (let i = 1; i < p.length; i++) {
      if (p[i].strike >= hoverStrike) {
        const a = p[i - 1], b = p[i];
        const t = b.strike === a.strike ? 0 : (hoverStrike - a.strike) / (b.strike - a.strike);
        return a.iv + t * (b.iv - a.iv);
      }
    }
    return p[p.length - 1].iv;
  })();

  const bias = m.skew?.bias ?? 'FLAT';
  const biasColor = bias === 'PUT SKEW' ? 'var(--danger)' : bias === 'CALL SKEW' ? 'var(--success)' : 'var(--text-secondary)';

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Implied Volatility Smile{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ChartTools name={`iv-smile-${ticker || 'spx'}`} svgRef={svgRef} fullscreenRef={wrapRef}
            csv={() => ({ headers: ['strike', 'iv'], rows: m.pts.map((p) => [p.strike.toFixed(2), p.iv.toFixed(6)]) })} />
          <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase" style={{ color: biasColor, background: `color-mix(in srgb, ${biasColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${biasColor} 30%, transparent)` }}>{bias}</span>
          <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase" style={live
            ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }
            : { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>{live ? 'LIVE' : 'MODEL'}</span>
        </div>
      </div>

      <div className="relative">
        <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block cursor-crosshair" preserveAspectRatio="none" style={{ maxHeight: 220 }}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={x0} y1={sy(t)} x2={x1} y2={sy(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
              <text x={4} y={sy(t) + 3} fontSize={10} fill="var(--text-tertiary)" fontFamily="ui-monospace, monospace">{(t * 100).toFixed(0)}%</text>
            </g>
          ))}
          {/* spot */}
          <line x1={spotX} y1={y0} x2={spotX} y2={y1} stroke="var(--text-secondary)" strokeWidth={1.25} />
          {/* 25Δ wings */}
          {m.putWingK && <line x1={sx(m.putWingK)} y1={y0} x2={sx(m.putWingK)} y2={y1} stroke="var(--danger)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />}
          {m.callWingK && <line x1={sx(m.callWingK)} y1={y0} x2={sx(m.callWingK)} y2={y1} stroke="var(--success)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />}
          {/* smile */}
          <path d={area} fill="color-mix(in srgb, var(--accent-color) 10%, transparent)" stroke="none" />
          <path d={curve} fill="none" stroke="var(--accent-color)" strokeWidth={2.25} />
          {m.pts.map((p, i) => <circle key={i} cx={sx(p.strike)} cy={sy(p.iv)} r={1.6} fill="var(--accent-color)" opacity={0.7} />)}
          {/* synced strike from a sibling panel */}
          {syncedStrike != null && syncedStrike >= m.minS && syncedStrike <= m.maxS && (
            <line x1={sx(syncedStrike)} y1={y0} x2={sx(syncedStrike)} y2={y1} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" opacity={0.65} />
          )}
          {/* crosshair */}
          {hoverStrike != null && hoverIv != null && (
            <>
              <line x1={sx(hoverStrike)} y1={y0} x2={sx(hoverStrike)} y2={y1} stroke="var(--accent-color)" strokeWidth={1} opacity={0.75} />
              <circle cx={sx(hoverStrike)} cy={sy(hoverIv)} r={3.2} fill="var(--accent-color)" />
            </>
          )}
        </svg>
        <StrikePublisher id="iv-smile" strike={hoverStrike} />
        {hoverStrike != null && hoverIv != null && (
          <div className="pointer-events-none absolute top-1 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ left: `${Math.min(80, (sx(hoverStrike) / W) * 100)}%` }}>
            <div className="text-[var(--text-primary)] font-bold">K {fmt(hoverStrike)}</div>
            <div style={{ color: 'var(--accent-color)' }}>IV {(hoverIv * 100).toFixed(1)}%</div>
            <div className="text-[var(--text-tertiary)] text-[8.5px]">{hoverStrike >= spot ? `+${(((hoverStrike / spot) - 1) * 100).toFixed(1)}%` : `${(((hoverStrike / spot) - 1) * 100).toFixed(1)}%`} vs spot</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[9px] text-[var(--text-tertiary)] tabular-nums">
        <span>K {fmt(m.minS)}</span>
        <span className="uppercase tracking-widest">strike · spot {fmt(spot)}</span>
        <span>K {fmt(m.maxS)}</span>
      </div>

      {m.skew && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3.5 py-2.5 border-t border-[var(--border)]">
          <Cell label="ATM IV" value={`${(m.skew.atmIv * 100).toFixed(1)}%`} />
          <Cell label="25Δ Risk Reversal" value={`${(m.skew.riskReversal25 * 100).toFixed(2)} pts`} tone={m.skew.riskReversal25 >= 0 ? 'var(--danger)' : 'var(--success)'} />
          <Cell label="25Δ Butterfly" value={`${(m.skew.butterfly25 * 100).toFixed(2)} pts`} tone="var(--info)" />
          <Cell label="ATM skew ∂IV/∂lnK" value={m.skew.skewSlope.toFixed(3)} tone={m.skew.skewSlope < 0 ? 'var(--danger)' : 'var(--success)'} />
        </div>
      )}

      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Inputs</span> front-expiry chain, per-strike IV (call/put blended), n={m.pts.length} ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">25Δ wings</span> interpolated at |Δ|=0.25 ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Source</span> {live ? 'live option chain' : 'model chain (off-hours)'} ·{' '}
        single real expiry — not a DTE extrapolation
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
