/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ChartPanelGrid — add / move / resize multiple chart panels on one page. Reuses the same
 * dependency-free pointer-event snap-grid interaction as WorkspaceView (React-19 safe, no
 * findDOMNode). Each panel hosts an independent SlayerChart (its own timeframe / chart-type /
 * indicators / drawings, keyed by panelId). First pass feeds every panel the store's candles
 * + GEX profile so it renders with no backend; per-symbol live data is a follow-up.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { SlayerChart } from './SlayerChart';
import { GexProfileData, Candle, TimeframeVal } from '../types';
import { ChartPanel, GRID_COLS, ROW_HEIGHT, GAP, MIN_W, MIN_H, MAX_PANELS, loadPanels, savePanels, makePanel } from '../lib/chartPanels';

interface Props { profile: GexProfileData; decimals: number; candles: Candle[]; baseTicker: string; timeframe: TimeframeVal; }

export function ChartPanelGrid({ profile, decimals, candles, baseTicker, timeframe }: Props) {
  const [panels, setPanels] = useState<ChartPanel[]>(() => { const p = loadPanels(); return p.length ? p : [makePanel(baseTicker, timeframe, 0)]; });
  const containerRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(80);
  const interaction = useRef<null | { id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: ChartPanel }>(null);

  useEffect(() => {
    const measure = () => { const w = containerRef.current?.clientWidth || 960; setColWidth(Math.max(24, (w - GAP * (GRID_COLS + 1)) / GRID_COLS)); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const commit = useCallback((next: ChartPanel[]) => { setPanels(next); savePanels(next); }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const it = interaction.current; if (!it) return;
    const dxCols = Math.round((e.clientX - it.startX) / (colWidth + GAP));
    const dyRows = Math.round((e.clientY - it.startY) / (ROW_HEIGHT + GAP));
    setPanels(prev => prev.map(p => {
      if (p.id !== it.id) return p;
      if (it.mode === 'move') return { ...p, x: Math.max(0, Math.min(GRID_COLS - it.orig.w, it.orig.x + dxCols)), y: Math.max(0, it.orig.y + dyRows) };
      return { ...p, w: Math.max(MIN_W, Math.min(GRID_COLS - p.x, it.orig.w + dxCols)), h: Math.max(MIN_H, it.orig.h + dyRows) };
    }));
  }, [colWidth]);

  const endInteraction = useCallback(() => {
    if (interaction.current) { interaction.current = null; setPanels(cur => { savePanels(cur); return cur; }); }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endInteraction);
  }, [onPointerMove]);

  const startInteraction = (id: string, mode: 'move' | 'resize', e: React.PointerEvent) => {
    e.preventDefault();
    const orig = panels.find(p => p.id === id); if (!orig) return;
    interaction.current = { id, mode, startX: e.clientX, startY: e.clientY, orig: { ...orig } };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endInteraction);
  };

  // Safety net: detach window listeners if we unmount mid-drag.
  useEffect(() => () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', endInteraction); }, [onPointerMove, endInteraction]);

  const addPanel = () => { if (panels.length >= MAX_PANELS) return; const maxY = panels.reduce((m, p) => Math.max(m, p.y + p.h), 0); commit([...panels, makePanel(baseTicker, timeframe, maxY)]); };
  // Close a panel AND sweep its persisted state so closed panels don't accumulate dead
  // localStorage keys across reloads: one prefs blob + one drawings blob per ticker it visited.
  const closePanel = (id: string) => {
    try {
      localStorage.removeItem('slayerchart.prefs.v1.' + id);
      const drawPrefix = 'slayerchart.draw.' + id + '.';
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(drawPrefix)) localStorage.removeItem(k); }
    } catch { /* storage unavailable */ }
    commit(panels.filter(p => p.id !== id));
  };

  const maxRow = panels.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  const gridHeight = Math.max(8, maxRow) * (ROW_HEIGHT + GAP) + GAP;

  return (
    <div className="flex flex-col w-full h-full bg-[var(--bg-base)] select-none">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] shrink-0 bg-[var(--surface)]">
        <span className="text-[10px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)]">Multi-Chart · {panels.length}/{MAX_PANELS}</span>
        <button onClick={addPanel} disabled={panels.length >= MAX_PANELS} title="Add a chart panel" className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Plus className="w-3 h-3" /> Add Chart
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto p-2 relative">
        <div className="relative w-full" style={{ height: gridHeight }}>
          {panels.map(p => {
            const style: React.CSSProperties = {
              position: 'absolute',
              left: p.x * (colWidth + GAP), top: p.y * (ROW_HEIGHT + GAP),
              width: p.w * colWidth + (p.w - 1) * GAP, height: p.h * ROW_HEIGHT + (p.h - 1) * GAP,
              transition: interaction.current?.id === p.id ? 'none' : 'all 0.15s ease-out',
              zIndex: interaction.current?.id === p.id ? 10 : 1,
            };
            return (
              <div key={p.id} style={style}>
                <div className="w-full h-full flex flex-col border border-[var(--border)] rounded-md overflow-hidden bg-[var(--surface)]">
                  <div onPointerDown={(e) => startInteraction(p.id, 'move', e)} className="flex items-center justify-between px-2 h-6 shrink-0 bg-[var(--surface-2)] border-b border-[var(--border)] cursor-move" style={{ touchAction: 'none' }}>
                    <span className="text-[9px] font-mono font-black uppercase tracking-[0.25em] text-[var(--text-tertiary)] select-none">⠿ drag</span>
                    <button onClick={() => closePanel(p.id)} onPointerDown={(e) => e.stopPropagation()} title="Close panel" className="text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="flex-1 min-h-0 relative">
                    <SlayerChart panelId={p.id} profile={profile} decimals={decimals} candles={candles} initialTimeframe={p.timeframe} title={p.ticker} />
                  </div>
                </div>
                <div onPointerDown={(e) => startInteraction(p.id, 'resize', e)} className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize z-20" style={{ background: 'linear-gradient(135deg, transparent 45%, var(--text-tertiary) 45%, var(--text-tertiary) 55%, transparent 55%)', touchAction: 'none' }} title="Resize" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
