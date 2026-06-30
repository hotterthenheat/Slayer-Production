/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MONTE CARLO SIMULATION PANEL
 * ----------------------------
 * Drives the real path-simulation engine (src/lib/monteCarlo.ts) and renders it:
 * a canvas of actual simulated sample paths (revealed left-to-right so the
 * animation IS the model, not decorative motion), the terminal-price histogram,
 * and the risk read-out (expected value, percentiles, VaR/ES tail risk, P[up]).
 *
 * The user picks the process (GBM / jump-diffusion / Heston) and the path count
 * (100 → 100k). Seeded ⇒ reproducible. Clearly a MODEL — it simulates under an
 * assumed risk-neutral process; the GBM mean is validated against S·e^{rT}.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { simulateMonteCarlo, type MCModel } from '../lib/monteCarlo';
import { useCrosshair, ChartTools } from './quant/chartInteraction';

interface MonteCarloPanelProps {
  spot: number;
  r: number;
  sigma: number;     // annualized vol
  tYears: number;
  ticker?: string;
  decimals?: number;
}

const MODELS: { key: MCModel; label: string }[] = [
  { key: 'gbm', label: 'GBM' },
  { key: 'jump', label: 'Jump-Diffusion' },
  { key: 'heston', label: 'Heston' },
];
const PATH_COUNTS = [100, 1000, 10000, 100000];
const pathLabel = (n: number) => (n >= 1000 ? `${n / 1000}k` : `${n}`);

export function MonteCarloPanel({ spot, r, sigma, tYears, ticker, decimals = 0 }: MonteCarloPanelProps) {
  const [model, setModel] = useState<MCModel>('gbm');
  const [nPaths, setNPaths] = useState<number>(10000);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);

  const result = useMemo(() => {
    if (!(spot > 0) || !(tYears > 0) || !(sigma > 0)) return null;
    return simulateMonteCarlo({
      spot, r, sigma, tYears,
      steps: 60, nPaths, samplePaths: 90, seed: 0x5151ace,
      model,
      jump: { lambda: 3, muJ: -0.04, sigJ: 0.12 },
      heston: { kappa: 2.0, theta: sigma * sigma, xi: 0.4, rho: -0.6, v0: sigma * sigma },
    });
  }, [spot, r, sigma, tYears, nPaths, model]);

  // Draw the sample paths on the canvas, revealing them left→right (one pass).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 700, cssH = canvas.clientHeight || 260;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const paths = result.samplePaths;
    const steps = paths[0]?.length ?? 1;
    const padL = 4, padR = 4, padT = 8, padB = 8;
    const x0 = padL, x1 = cssW - padR, y0 = padT, y1 = cssH - padB;
    // y-range from the p05..p95 band, widened, clamped to include spot.
    let lo = result.percentiles.p05, hi = result.percentiles.p95;
    const pad = (hi - lo) * 0.12 || spot * 0.02;
    lo = Math.min(lo - pad, spot); hi = Math.max(hi + pad, spot);
    const sx = (i: number) => x0 + (i / (steps - 1)) * (x1 - x0);
    const sy = (p: number) => y1 - ((p - lo) / ((hi - lo) || 1)) * (y1 - y0);

    const css = getComputedStyle(document.documentElement);
    const colUp = (css.getPropertyValue('--success') || '#26d980').trim();
    const colDn = (css.getPropertyValue('--danger') || '#d93348').trim();
    const colSpot = (css.getPropertyValue('--text-secondary') || '#9aa').trim();

    let reveal = 0;
    const draw = () => {
      ctx.clearRect(0, 0, cssW, cssH);
      // spot baseline
      ctx.strokeStyle = colSpot; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x0, sy(spot)); ctx.lineTo(x1, sy(spot)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const upTo = Math.max(1, Math.floor(reveal * (steps - 1)));
      ctx.lineWidth = 1;
      for (const path of paths) {
        const up = path[path.length - 1] >= spot;
        ctx.strokeStyle = up ? colUp : colDn;
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(path[0]));
        for (let i = 1; i <= upTo; i++) ctx.lineTo(sx(i), sy(path[i]));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (reveal < 1) { reveal = Math.min(1, reveal + 0.06); rafRef.current = requestAnimationFrame(draw); }
    };
    cancelAnimationFrame(rafRef.current);
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [result, spot]);

  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  if (!result) {
    return (
      <div className="h-[260px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">Monte Carlo needs spot, vol & horizon</span>
      </div>
    );
  }

  // Histogram geometry (SVG)
  const HW = 1000, HH = 120;
  const maxC = Math.max(1, ...result.histogram.counts);
  const bw = HW / result.histogram.counts.length;

  // Crosshair: resolve the pointer's viewBox-x to a terminal-price bin.
  const hoverBin = vx != null ? Math.floor(vx / bw) : -1;
  const hb = hoverBin >= 0 && hoverBin < result.histogram.counts.length ? hoverBin : null;
  const hbLo = hb != null ? result.histogram.edges[hb] : null;
  const hbHi = hb != null ? (result.histogram.edges[hb + 1] ?? result.histogram.edges[hb]) : null;
  const hbCount = hb != null ? result.histogram.counts[hb] : null;
  const hbProb = hbCount != null ? hbCount / result.nPaths : null;

  const Cell = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
    </div>
  );

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)] gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Monte Carlo{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-[var(--border)]">
            {MODELS.map((m) => (
              <button key={m.key} onClick={() => setModel(m.key)}
                className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 transition-colors cursor-pointer ${model === m.key ? 'bg-[var(--accent-color)]/15 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md overflow-hidden border border-[var(--border)]">
            {PATH_COUNTS.map((n) => (
              <button key={n} onClick={() => setNPaths(n)}
                className={`text-[9.5px] font-bold tabular-nums px-2 py-1 transition-colors cursor-pointer ${nPaths === n ? 'bg-[var(--accent-color)]/15 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                {pathLabel(n)}
              </button>
            ))}
          </div>
          <ChartTools name={`monte-carlo-${ticker || 'spx'}-${model}`} svgRef={svgRef} fullscreenRef={wrapRef}
            csv={() => ({ headers: ['bin_low', 'bin_high', 'count', 'probability'], rows: result.histogram.counts.map((c, i) => [result.histogram.edges[i].toFixed(2), (result.histogram.edges[i + 1] ?? result.histogram.edges[i]).toFixed(2), c, (c / result.nPaths).toFixed(6)]) })} />
          <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase" style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)' }}>Model</span>
        </div>
      </div>

      <canvas ref={canvasRef} className="w-full h-[240px] block" />

      {/* Terminal distribution */}
      <div className="relative">
        <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${HW} ${HH}`} className="w-full block cursor-crosshair" style={{ height: 90 }} preserveAspectRatio="none">
          {result.histogram.counts.map((c, i) => {
            const edge = result.histogram.edges[i];
            const up = edge >= spot;
            const h = (c / maxC) * (HH - 4);
            return <rect key={i} x={i * bw} y={HH - h} width={Math.max(1, bw - 0.5)} height={h} fill={up ? 'color-mix(in srgb, var(--success) 55%, transparent)' : 'color-mix(in srgb, var(--danger) 55%, transparent)'} />;
          })}
          {hb != null && <rect x={hb * bw} y={0} width={Math.max(1, bw)} height={HH} fill="color-mix(in srgb, var(--accent-color) 22%, transparent)" />}
        </svg>
        {hb != null && hbLo != null && hbHi != null && (
          <div className="pointer-events-none absolute top-0.5 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ left: `${Math.min(80, (hb * bw / HW) * 100)}%` }}>
            <div className="text-[var(--text-primary)] font-bold">{fmt(hbLo)} – {fmt(hbHi)}</div>
            <div style={{ color: hbLo >= spot ? 'var(--success)' : 'var(--danger)' }}>P {(hbProb! * 100).toFixed(2)}% · {hbCount!.toLocaleString()} paths</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[9px] text-[var(--text-tertiary)] tabular-nums">
        <span>{fmt(result.histogram.edges[0])}</span>
        <span className="uppercase tracking-widest">terminal price · {result.nPaths.toLocaleString()} paths · {model}</span>
        <span>{fmt(result.histogram.edges[result.histogram.edges.length - 1])}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 px-3.5 py-2.5 border-t border-[var(--border)]">
        <Cell label="Expected price" value={fmt(result.terminalMean)} />
        <Cell label="Expected return" value={pct(result.expectedReturnPct)} tone={result.expectedReturnPct >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <Cell label="P(up)" value={pct(result.probUp)} tone="var(--success)" />
        <Cell label="5th–95th" value={`${fmt(result.percentiles.p05)} – ${fmt(result.percentiles.p95)}`} />
        <Cell label="VaR 95 / 99" value={`${pct(result.var95)} / ${pct(result.var99)}`} tone="var(--danger)" />
        <Cell label="ES 95 / 99" value={`${pct(result.es95)} / ${pct(result.es99)}`} tone="var(--danger)" />
      </div>

      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Process</span> {model === 'gbm' ? 'geometric Brownian motion dS=rS dt+σS dW' : model === 'jump' ? 'Merton jump-diffusion (compensated Poisson log-normal jumps)' : 'Heston stochastic vol dv=κ(θ−v)dt+ξ√v dW₂'} ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Inputs</span> spot {fmt(spot)}, r={(r * 100).toFixed(1)}%, σ={(sigma * 100).toFixed(1)}%, T={(tYears * 365).toFixed(0)}d, {result.nPaths.toLocaleString()} seeded paths ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Validated</span> GBM mean ≡ S·e^{'{rT}'} (tests/monteCarlo)
      </div>
    </div>
  );
}
