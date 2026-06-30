/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QUANT CHART INTERACTION LAYER
 * -----------------------------
 * Shared, reusable interaction primitives that bring the platform's analytical
 * SVG charts up to research-workstation usage: a crosshair that reports the exact
 * value under the cursor, and export (SVG / PNG / CSV) + fullscreen affordances.
 *
 *   • useCrosshair(viewBoxW) — pointer→viewBox-x mapping for a `preserveAspectRatio
 *     ="none"` chart; returns the hovered x (in viewBox units) so each chart can
 *     resolve it to its own data and draw a readout.
 *   • <ChartTools/> — export-SVG/PNG/CSV menu + fullscreen toggle for a container.
 *
 * Kept tiny and dependency-free so any panel can opt in with a few lines.
 */
import { useCallback, useRef, useState } from 'react';
import { Download, Maximize2 } from 'lucide-react';

/** Pointer→viewBox-x crosshair for a width=100% SVG with viewBox width `viewBoxW`. */
export function useCrosshair(viewBoxW: number) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vx, setVx] = useState<number | null>(null);
  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const el = svgRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    setVx(((e.clientX - r.left) / r.width) * viewBoxW);
  }, [viewBoxW]);
  const onPointerLeave = useCallback(() => setVx(null), []);
  return { svgRef, vx, onPointerMove, onPointerLeave };
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Inline the resolved theme colors so the exported file renders standalone.
  const cs = getComputedStyle(document.documentElement);
  let s = new XMLSerializer().serializeToString(clone);
  s = s.replace(/var\((--[a-z0-9-]+)\)/gi, (_m, name) => (cs.getPropertyValue(name).trim() || '#888'));
  // color-mix is not universally supported in standalone SVG viewers; flatten to a neutral.
  s = s.replace(/color-mix\([^)]*\)/gi, 'rgba(120,120,130,0.35)');
  const bg = cs.getPropertyValue('--surface').trim() || '#0A0A0A';
  return `<?xml version="1.0" encoding="UTF-8"?>\n${s.replace('<svg', `<svg style="background:${bg}"`)}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(svg: SVGSVGElement | null, name: string) {
  if (!svg) return;
  triggerDownload(new Blob([serializeSvg(svg)], { type: 'image/svg+xml' }), `${name}.svg`);
}

export function exportPng(svg: SVGSVGElement | null, name: string, scale = 2) {
  if (!svg) return;
  const data = serializeSvg(svg);
  const img = new Image();
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * scale)), h = Math.max(1, Math.round(rect.height * scale));
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = (getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#0A0A0A');
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    c.toBlob((b) => { if (b) triggerDownload(b, `${name}.png`); }, 'image/png');
  };
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(data)))}`;
}

/** Snapshot a (WebGL or 2D) canvas to PNG. The renderer must preserve its drawing buffer. */
export function exportCanvasPng(canvas: HTMLCanvasElement | null, name: string) {
  if (!canvas) return;
  canvas.toBlob((b) => { if (b) triggerDownload(b, `${name}.png`); }, 'image/png');
}

export function exportCsv(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv' }), `${name}.csv`);
}

interface ChartToolsProps {
  name: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  fullscreenRef?: React.RefObject<HTMLElement | null>;
  csv?: () => { headers: string[]; rows: (string | number)[][] };
}

/** Export (SVG/PNG/CSV) + fullscreen control cluster for a chart panel. */
export function ChartTools({ name, svgRef, fullscreenRef, csv }: ChartToolsProps) {
  const [open, setOpen] = useState(false);
  const btn = 'text-[9px] font-bold uppercase tracking-wider px-2 py-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors';
  const fs = () => {
    const el = fullscreenRef?.current; if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };
  return (
    <div className="flex items-center gap-1 relative">
      <div className="relative">
        <button className={btn} onClick={() => setOpen((o) => !o)} aria-label="Export chart" title="Export">
          <Download className="w-3.5 h-3.5" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 flex flex-col rounded-md border border-[var(--border)] bg-[var(--surface-2)] shadow-lg overflow-hidden min-w-[88px]">
            {svgRef && <button className={`${btn} text-left`} onClick={() => { exportSvg(svgRef.current, name); setOpen(false); }}>SVG</button>}
            {svgRef && <button className={`${btn} text-left`} onClick={() => { exportPng(svgRef.current, name); setOpen(false); }}>PNG</button>}
            {csv && <button className={`${btn} text-left`} onClick={() => { const { headers, rows } = csv(); exportCsv(headers, rows, name); setOpen(false); }}>CSV</button>}
          </div>
        )}
      </div>
      {fullscreenRef && (
        <button className={btn} onClick={fs} aria-label="Fullscreen" title="Fullscreen">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
