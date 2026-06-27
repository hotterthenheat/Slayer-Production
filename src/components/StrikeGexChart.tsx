import { useRef, useState, useEffect, useMemo } from 'react';

/**
 * Multi-strike GEX line chart — tracks the top dealer strikes' net gamma over the
 * session as labeled, color-coded lines (à la an institutional "strike chart").
 * Pure SVG, theme-token styled, with right-edge value tags that de-collide and a
 * legend. Data is a time-ordered list of snapshots: { t, m: { [strike]: netGex } }.
 */

export type GexSnap = { t: number; m: Record<number, number> };

const LINE_COLORS = ['#2dd4bf', '#f4436e', '#f59e0b', '#3b9bff', '#a78bfa', '#22c55e', '#e879f9', '#fb923c'];

const fmtB = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : '+';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${Math.round(a)}`;
};

export function StrikeGexChart({ history, topN = 6 }: { history: GexSnap[]; topN?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 640, h: el.clientHeight || 360 }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    if (history.length < 2) return null;
    const last = history[history.length - 1].m;
    const strikes = Object.keys(last).map(Number).sort((a, b) => Math.abs(last[b]) - Math.abs(last[a])).slice(0, topN);
    let lo = Infinity, hi = -Infinity;
    for (const snap of history) for (const k of strikes) { const v = snap.m[k]; if (v == null) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }
    if (lo > 0) lo = 0; if (hi < 0) hi = 0; // always show the zero baseline
    const pad = ((hi - lo) || 1) * 0.08; lo -= pad; hi += pad;
    return { strikes, lo, hi, tMin: history[0].t, tMax: history[history.length - 1].t };
  }, [history, topN]);

  const padL = 8, padR = 70, padT = 8, padB = 18;
  const W = size.w, H = size.h, plotW = Math.max(10, W - padL - padR), plotH = Math.max(10, H - padT - padB);

  if (!model) return <div ref={wrap} className="w-full h-full flex items-center justify-center text-[11px] font-mono text-[var(--text-tertiary)]">Accumulating dealer GEX…</div>;

  const { strikes, lo, hi, tMin, tMax } = model;
  const span = (hi - lo) || 1;
  const xOf = (t: number) => padL + ((t - tMin) / ((tMax - tMin) || 1)) * plotW;
  const yOf = (v: number) => padT + (1 - (v - lo) / span) * plotH;
  const lastM = history[history.length - 1].m;

  const tickN = 5;
  const tickVals = Array.from({ length: tickN + 1 }, (_, i) => lo + (span * i) / tickN);

  // right-edge value tags, de-collided vertically (never overlap)
  const labels = strikes
    .map((k, idx) => ({ k, col: LINE_COLORS[idx % LINE_COLORS.length], v: lastM[k] ?? 0, y0: yOf(lastM[k] ?? 0), y: yOf(lastM[k] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;

  return (
    <div ref={wrap} className="w-full h-full relative">
      <svg width={W} height={H} className="block">
        {tickVals.map((tv, i) => {
          const zero = Math.abs(tv) < span * 0.012;
          return (
            <g key={i}>
              <line x1={padL} y1={yOf(tv)} x2={padL + plotW} y2={yOf(tv)} stroke={zero ? 'var(--border-strong)' : 'var(--border)'} strokeWidth={zero ? 1 : 0.5} strokeDasharray={zero ? '' : '2 5'} opacity={0.55} />
              <text x={padL + plotW + 5} y={yOf(tv) + 3} fontSize={8.5} fontFamily="ui-monospace, monospace" fill="var(--text-tertiary)">{fmtB(tv)}</text>
            </g>
          );
        })}
        {strikes.map((k, idx) => {
          const col = LINE_COLORS[idx % LINE_COLORS.length];
          const pts = history.filter(s => s.m[k] != null).map(s => `${xOf(s.t).toFixed(1)},${yOf(s.m[k]).toFixed(1)}`).join(' ');
          return <polyline key={k} points={pts} fill="none" stroke={col} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {labels.map(L => (
          <g key={L.k}>
            {Math.abs(L.y - L.y0) > 1 && <line x1={padL + plotW} y1={L.y0} x2={padL + plotW + 2} y2={L.y} stroke={L.col} strokeWidth={0.75} opacity={0.6} />}
            <circle cx={padL + plotW} cy={L.y0} r={2.4} fill={L.col} />
            <g transform={`translate(${padL + plotW + 3}, ${L.y})`}>
              <rect x={0} y={-7} width={padR - 6} height={14} rx={3} fill={L.col} />
              <text x={4} y={3} fontSize={8.5} fontWeight={800} fontFamily="ui-monospace, monospace" fill="#08090c">{L.k}</text>
              <text x={padR - 10} y={3} fontSize={8.5} fontWeight={700} fontFamily="ui-monospace, monospace" fill="#08090c" textAnchor="end">{fmtB(L.v)}</text>
            </g>
          </g>
        ))}
      </svg>
      <div className="absolute top-1.5 left-2.5 flex flex-col gap-[3px] pointer-events-none">
        {strikes.map((k, idx) => (
          <div key={k} className="flex items-center gap-1.5 text-[9px] font-mono leading-none">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LINE_COLORS[idx % LINE_COLORS.length] }} />
            <span className="font-black text-[var(--text-secondary)] tabular-nums">{k}</span>
            <span className="tabular-nums font-bold" style={{ color: LINE_COLORS[idx % LINE_COLORS.length] }}>{fmtB(lastM[k] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
