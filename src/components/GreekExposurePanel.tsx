/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER GREEK EXPOSURE PROFILE (panel)
 * -------------------------------------
 * The per-strike dealer exposure for the canonical hedging Greeks — gamma,
 * delta, vanna, charm, vega — computed from the REAL front-expiry chain via
 * src/lib/greekExposure (whose gamma/delta/vanna nets reconcile with the
 * platform's dealer-inventory engine). Switch Greek to see where each dealer
 * flow concentrates: where they pin (long γ), where their delta flips as vol
 * moves (vanna), where decay drags them into expiry (charm), and where a vol
 * shock bites (vega). Bars are green for positive net exposure, red for
 * negative; spot, the dealer walls, and the cumulative-zero flip are marked.
 *
 * Crosshair reads the exact exposure (and call/put split) at any strike; the
 * profile exports to SVG / PNG / CSV. Front-expiry, real per-contract Greeks ⇒
 * LIVE; off-hours it runs the clearly-labelled model chain.
 */
import { useMemo, useRef, useState } from 'react';
import type { ChainContract } from '../lib/v11Math';
import { computeGreekExposureProfile, GREEK_META, GREEK_ORDER, type GreekKey } from '../lib/greekExposure';
import { useCrosshair, ChartTools } from './quant/chartInteraction';
import { useStrikeSync, StrikePublisher } from './quant/crosshairSync';

interface GreekExposurePanelProps {
  chain: ChainContract[];
  spot: number;
  decimals?: number;
  ticker?: string;
  live?: boolean;
  callWall?: number | null;
  putWall?: number | null;
  gammaFlip?: number | null;
}

export function GreekExposurePanel({ chain, spot, decimals = 0, ticker, live, callWall, putWall, gammaFlip }: GreekExposurePanelProps) {
  const [greek, setGreek] = useState<GreekKey>('gamma');
  const prof = useMemo(() => computeGreekExposureProfile(chain, spot, greek), [chain, spot, greek]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);
  const { syncedStrike } = useStrikeSync('greek-exposure');

  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const meta = GREEK_META[greek];
  // Compact magnitude formatter — exposures span $thousands ($Δ/day) to $billions (GEX).
  const mag = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `${v < 0 ? '-' : ''}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${v < 0 ? '-' : ''}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${v < 0 ? '-' : ''}${(a / 1e3).toFixed(1)}k`;
    return `${v < 0 ? '-' : ''}${a.toFixed(0)}`;
  };

  if (!prof) {
    return (
      <div className="h-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">Chain too sparse for Greek exposure</span>
      </div>
    );
  }

  const W = 1000, H = 240, padL = 8, padR = 8, padT = 16, padB = 24;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const minS = prof.nodes[0].strike, maxS = prof.nodes[prof.nodes.length - 1].strike;
  const sx = (k: number) => x0 + ((k - minS) / ((maxS - minS) || 1)) * (x1 - x0);
  const sy = (e: number) => (y0 + y1) / 2 - (e / prof.maxAbs) * ((y1 - y0) / 2 - 2);
  const zeroY = sy(0);
  const barW = Math.max(1.5, ((x1 - x0) / prof.nodes.length) * 0.74);

  // Crosshair → nearest node.
  const hoverStrike = vx != null ? minS + ((vx - x0) / ((x1 - x0) || 1)) * (maxS - minS) : null;
  const hoverNode = hoverStrike != null && hoverStrike >= minS && hoverStrike <= maxS
    ? prof.nodes.reduce((b, n) => (Math.abs(n.strike - hoverStrike) < Math.abs(b.strike - hoverStrike) ? n : b), prof.nodes[0]) : null;

  const Cell = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
      {sub && <span className="text-[9px] text-[var(--text-tertiary)] leading-tight">{sub}</span>}
    </div>
  );

  const netTone = prof.net >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)] gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Dealer Greek Exposure{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-[var(--border)]">
            {GREEK_ORDER.map((k) => (
              <button key={k} onClick={() => setGreek(k)}
                className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 transition-colors cursor-pointer ${greek === k ? 'bg-[var(--accent-color)]/15 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                title={GREEK_META[k].label}>
                {GREEK_META[k].short}
              </button>
            ))}
          </div>
          <ChartTools name={`greek-exposure-${greek}-${ticker || 'spx'}`} svgRef={svgRef} fullscreenRef={wrapRef}
            csv={() => ({ headers: ['strike', 'net_exposure', 'call', 'put'], rows: prof.nodes.map((n) => [n.strike.toFixed(2), n.exposure.toFixed(2), n.call.toFixed(2), n.put.toFixed(2)]) })} />
          <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase" style={live
            ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }
            : { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>{live ? 'LIVE' : 'MODEL'}</span>
        </div>
      </div>

      <div className="relative">
        <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block cursor-crosshair" preserveAspectRatio="none" style={{ maxHeight: 220 }}>
          {/* dealer walls */}
          {callWall != null && callWall >= minS && callWall <= maxS && <line x1={sx(callWall)} y1={y0} x2={sx(callWall)} y2={y1} stroke="var(--success)" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />}
          {putWall != null && putWall >= minS && putWall <= maxS && <line x1={sx(putWall)} y1={y0} x2={sx(putWall)} y2={y1} stroke="var(--danger)" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />}
          {/* cumulative-zero flip */}
          {prof.flip != null && prof.flip >= minS && prof.flip <= maxS && <line x1={sx(prof.flip)} y1={y0} x2={sx(prof.flip)} y2={y1} stroke="var(--warning)" strokeWidth={1.25} strokeDasharray="4 3" />}
          {/* spot */}
          {spot >= minS && spot <= maxS && <line x1={sx(spot)} y1={y0} x2={sx(spot)} y2={y1} stroke="var(--text-secondary)" strokeWidth={1.25} />}
          {/* zero line */}
          <line x1={x0} y1={zeroY} x2={x1} y2={zeroY} stroke="var(--border)" strokeWidth={1} />
          {/* exposure bars */}
          {prof.nodes.map((n) => {
            const yv = sy(n.exposure);
            const top = Math.min(zeroY, yv), h = Math.abs(yv - zeroY);
            const pos = n.exposure >= 0;
            return <rect key={n.strike} x={sx(n.strike) - barW / 2} y={top} width={barW} height={Math.max(0.5, h)}
              fill={pos ? 'color-mix(in srgb, var(--success) 70%, transparent)' : 'color-mix(in srgb, var(--danger) 70%, transparent)'} />;
          })}
          {/* synced strike from a sibling panel */}
          {syncedStrike != null && syncedStrike >= minS && syncedStrike <= maxS && (
            <line x1={sx(syncedStrike)} y1={y0} x2={sx(syncedStrike)} y2={y1} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" opacity={0.65} />
          )}
          {/* crosshair */}
          {hoverNode && <line x1={sx(hoverNode.strike)} y1={y0} x2={sx(hoverNode.strike)} y2={y1} stroke="var(--accent-color)" strokeWidth={1} opacity={0.7} />}
          {hoverNode && <circle cx={sx(hoverNode.strike)} cy={sy(hoverNode.exposure)} r={3} fill="var(--accent-color)" />}
        </svg>
        <StrikePublisher id="greek-exposure" strike={hoverNode ? hoverNode.strike : null} />
        {hoverNode && (
          <div className="pointer-events-none absolute top-1 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ left: `${Math.min(80, (sx(hoverNode.strike) / W) * 100)}%` }}>
            <div className="text-[var(--text-primary)] font-bold">K {fmt(hoverNode.strike)}</div>
            <div style={{ color: hoverNode.exposure >= 0 ? 'var(--success)' : 'var(--danger)' }}>{mag(hoverNode.exposure)} {meta.symbol}</div>
            <div className="text-[var(--text-tertiary)] text-[8.5px]">C {mag(hoverNode.call)} · P {mag(hoverNode.put)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[9px] text-[var(--text-tertiary)] tabular-nums">
        <span>K {fmt(minS)}</span>
        <span className="uppercase tracking-widest">{meta.label} · {meta.unit}</span>
        <span>K {fmt(maxS)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 px-3.5 py-2.5 border-t border-[var(--border)]">
        <Cell label={`Net ${meta.symbol}`} value={mag(prof.net)} sub={meta.unit} tone={netTone} />
        <Cell label="Gross" value={mag(prof.gross)} sub="Σ |exposure|" />
        <Cell label="Peak +" value={prof.topPositive ? fmt(prof.topPositive.strike) : '—'} sub={prof.topPositive ? mag(prof.topPositive.exposure) : 'none'} tone="var(--success)" />
        <Cell label="Peak −" value={prof.topNegative ? fmt(prof.topNegative.strike) : '—'} sub={prof.topNegative ? mag(prof.topNegative.exposure) : 'none'} tone="var(--danger)" />
        <Cell label="Σ-flip (zero)" value={prof.flip != null ? fmt(prof.flip) : '—'} sub="cum. sign change" tone="var(--warning)" />
      </div>

      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Model</span> <span className="font-mono">{meta.formula}</span> (sgn +call/−put), per strike ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Reads</span> {meta.note} ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Source</span> {live ? 'live front-expiry chain' : 'model chain (off-hours)'} — gamma/delta/vanna nets reconcile with the dealer-inventory engine
      </div>
    </div>
  );
}
