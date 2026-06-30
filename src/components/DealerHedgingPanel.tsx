/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER HEDGING SIMULATOR (panel)
 * --------------------------------
 * Renders simulateDealerHedging(): the dealer net-gamma landscape as spot moves,
 * shaded green where dealers are long gamma (they fade moves → price is dampened)
 * and red where short (they chase moves → amplification / squeeze risk), with the
 * gamma-flip crossing, the spot, and the squeeze zone marked. All driven by the
 * REAL per-strike net GEX; the per-level projection is a labelled model.
 */
import { useMemo, useRef } from 'react';
import { simulateDealerHedging, type HedgeStrike } from '../lib/dealerHedging';
import { useCrosshair, ChartTools } from './quant/chartInteraction';
import { useStrikeSync, StrikePublisher } from './quant/crosshairSync';

interface DealerHedgingPanelProps {
  strikes: HedgeStrike[];
  spot: number;
  emPct: number;        // 1σ expected move fraction (kernel width)
  decimals?: number;
  ticker?: string;
  live?: boolean;
}

export function DealerHedgingPanel({ strikes, spot, emPct, decimals = 0, ticker, live }: DealerHedgingPanelProps) {
  const r = useMemo(() => simulateDealerHedging(strikes, spot, emPct), [strikes, spot, emPct]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);
  const { syncedStrike } = useStrikeSync('hedging');
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const bn = (v: number) => `${v >= 0 ? '+' : ''}${(v / 1e9).toFixed(2)}B`;

  if (!r) {
    return (
      <div className="h-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">No dealer gamma profile to simulate</span>
      </div>
    );
  }

  const W = 1000, H = 250, padL = 8, padR = 8, padT = 14, padB = 24;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const prices = r.nodes.map((n) => n.price);
  const minP = prices[0], maxP = prices[prices.length - 1];
  const maxAbsG = Math.max(1, ...r.nodes.map((n) => Math.abs(n.gammaDollar)));
  const sx = (p: number) => x0 + ((p - minP) / ((maxP - minP) || 1)) * (x1 - x0);
  const sy = (g: number) => (y0 + y1) / 2 - (g / maxAbsG) * ((y1 - y0) / 2);
  const zeroY = sy(0);
  const line = r.nodes.map((n, i) => `${i === 0 ? 'M' : 'L'}${sx(n.price).toFixed(1)},${sy(n.gammaDollar).toFixed(1)}`).join(' ');
  const areaPos = `M${sx(minP)},${zeroY} ${r.nodes.map((n) => `L${sx(n.price).toFixed(1)},${sy(Math.max(0, n.gammaDollar)).toFixed(1)}`).join(' ')} L${sx(maxP)},${zeroY} Z`;
  const areaNeg = `M${sx(minP)},${zeroY} ${r.nodes.map((n) => `L${sx(n.price).toFixed(1)},${sy(Math.min(0, n.gammaDollar)).toFixed(1)}`).join(' ')} L${sx(maxP)},${zeroY} Z`;

  // Crosshair: resolve the pointer's viewBox-x to the nearest simulated node.
  const hoverPrice = vx != null ? minP + ((vx - x0) / ((x1 - x0) || 1)) * (maxP - minP) : null;
  const hoverNode = hoverPrice != null && hoverPrice >= minP && hoverPrice <= maxP
    ? r.nodes.reduce((b, n) => (Math.abs(n.price - hoverPrice) < Math.abs(b.price - hoverPrice) ? n : b), r.nodes[0]) : null;

  const Cell = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
      {sub && <span className="text-[9px] text-[var(--text-tertiary)] leading-tight">{sub}</span>}
    </div>
  );

  const regimeColor = r.regimeNow === 'stabilizing' ? 'var(--success)' : 'var(--danger)';

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Dealer Hedging Simulator{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ChartTools name={`dealer-hedging-${ticker || 'spx'}`} svgRef={svgRef} fullscreenRef={wrapRef}
            csv={() => ({ headers: ['price', 'net_gamma_$', 'cum_hedge_$_per_pct', 'regime'], rows: r.nodes.map((n) => [n.price.toFixed(2), n.gammaDollar.toFixed(0), n.cumHedge.toFixed(0), n.regime]) })} />
          <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase" style={live
            ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }
            : { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>{live ? 'LIVE γ' : 'MODEL'}</span>
        </div>
      </div>

      <div className="relative">
        <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block cursor-crosshair" preserveAspectRatio="none" style={{ maxHeight: 230 }}>
          <path d={areaPos} fill="color-mix(in srgb, var(--success) 16%, transparent)" />
          <path d={areaNeg} fill="color-mix(in srgb, var(--danger) 16%, transparent)" />
          <line x1={x0} y1={zeroY} x2={x1} y2={zeroY} stroke="var(--border)" strokeWidth={1} />
          {/* squeeze zone */}
          {r.squeezePrice != null && <line x1={sx(r.squeezePrice)} y1={y0} x2={sx(r.squeezePrice)} y2={y1} stroke="var(--danger)" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />}
          {/* gamma flip */}
          {r.gammaFlip != null && <line x1={sx(r.gammaFlip)} y1={y0} x2={sx(r.gammaFlip)} y2={y1} stroke="var(--warning)" strokeWidth={1.25} strokeDasharray="4 3" />}
          {/* spot */}
          <line x1={sx(spot)} y1={y0} x2={sx(spot)} y2={y1} stroke="var(--text-secondary)" strokeWidth={1.25} />
          <path d={line} fill="none" stroke="var(--text-primary)" strokeWidth={1.75} opacity={0.85} />
          <circle cx={sx(spot)} cy={sy(r.netGammaNow)} r={3} fill={regimeColor} />
          {syncedStrike != null && syncedStrike >= minP && syncedStrike <= maxP && (
            <line x1={sx(syncedStrike)} y1={y0} x2={sx(syncedStrike)} y2={y1} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" opacity={0.65} />
          )}
          {hoverNode && <line x1={sx(hoverNode.price)} y1={y0} x2={sx(hoverNode.price)} y2={y1} stroke="var(--accent-color)" strokeWidth={1} opacity={0.75} />}
          {hoverNode && <circle cx={sx(hoverNode.price)} cy={sy(hoverNode.gammaDollar)} r={3.2} fill="var(--accent-color)" />}
        </svg>
        <StrikePublisher id="hedging" strike={hoverNode ? hoverNode.price : null} />
        {hoverNode && (
          <div className="pointer-events-none absolute top-1 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ left: `${Math.min(82, (sx(hoverNode.price) / W) * 100)}%` }}>
            <div className="text-[var(--text-primary)] font-bold">{fmt(hoverNode.price)}</div>
            <div style={{ color: hoverNode.gammaDollar >= 0 ? 'var(--success)' : 'var(--danger)' }}>{hoverNode.gammaDollar >= 0 ? '+' : ''}{(hoverNode.gammaDollar / 1e9).toFixed(2)}B net γ</div>
            <div className="text-[var(--text-tertiary)] uppercase tracking-wider text-[8.5px]">{hoverNode.regime}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[9px] text-[var(--text-tertiary)] tabular-nums">
        <span>{fmt(minP)}</span>
        <span className="uppercase tracking-widest">dealer net γ ($) vs spot · ⬆green dampens · ⬇red amplifies</span>
        <span>{fmt(maxP)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 px-3.5 py-2.5 border-t border-[var(--border)]">
        <Cell label="Regime now" value={r.regimeNow === 'stabilizing' ? 'Long γ' : 'Short γ'} sub={r.regimeNow === 'stabilizing' ? 'dealers fade moves' : 'dealers chase moves'} tone={regimeColor} />
        <Cell label="Net dealer γ" value={bn(r.netGammaNow)} tone={regimeColor} />
        <Cell label="Hedge / +1%" value={bn(r.hedgePer1PctUp)} sub={r.hedgePer1PctUp >= 0 ? 'dealers sell' : 'dealers buy'} />
        <Cell label="γ Flip" value={r.gammaFlip != null ? fmt(r.gammaFlip) : '—'} sub="stabilize ↔ amplify" tone="var(--warning)" />
        <Cell label="Squeeze risk" value={`${Math.round(r.squeezeScore * 100)}%`} sub={r.squeezePrice != null ? `near ${fmt(r.squeezePrice)}` : 'none'} tone={r.squeezeScore > 0.5 ? 'var(--danger)' : 'var(--text-secondary)'} />
      </div>

      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Model</span> Γ$(S′)=Σ netGEX_k·exp(−½((S′−K)/w)²), w=spot·EM ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Reads</span> long γ ⇒ dealers sell rallies/buy dips (pin); short γ ⇒ buy rallies/sell dips (amplify) ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Source</span> {live ? 'live per-strike GEX' : 'model per-strike GEX'} — per-level projection is modeled
      </div>
    </div>
  );
}
