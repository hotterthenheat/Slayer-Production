/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dependency-free resizable grid workspace (React-19 safe — no findDOMNode).
 * Snap-to-grid drag + resize via pointer events; debounced persistence to
 * localStorage + PATCH /api/users/workspace; hydrates from API or Template A.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, LayoutGrid, ChevronDown, Rocket, Dna, Settings, Database, Activity, Target, Network, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Pane, renderWidget } from './WorkspaceWidgets';
import { ErrorBoundary } from './ErrorBoundary';
import {
  PaneLayout, WidgetType, WIDGETS, widgetMeta, paneId, TEMPLATES, cloneTemplate, GRID_COLS,
} from '../lib/workspace';
import { useContractStore } from '../lib/store';

const ROW_HEIGHT = 40;
const GAP = 8;

interface Props { isSuperAdmin?: boolean; }

export function WorkspaceView({ isSuperAdmin }: Props) {
  const setActiveTab = useContractStore(s => s.setActiveTab);
  const [layout, setLayout] = useState<PaneLayout[]>([]);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(80);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interaction = useRef<null | { id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: PaneLayout }>(null);

  useEffect(() => {
    const measure = () => {
      const w = containerRef.current?.clientWidth || 960;
      setColWidth(Math.max(24, (w - GAP * (GRID_COLS + 1)) / GRID_COLS));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const persist = useCallback((next: PaneLayout[]) => {
    try { localStorage.setItem('slayer_workspace', JSON.stringify(next)); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/users/workspace', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: next }),
      }).catch(() => {});
    }, 1000);
  }, []);

  const commit = useCallback((next: PaneLayout[]) => { setLayout(next); persist(next); }, [persist]);

  // Cancel a pending debounced save on unmount so we don't fire a PATCH from a
  // component that no longer exists.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Hydrate: API -> localStorage -> Template A (never render an empty terminal).
  useEffect(() => {
    let cancelled = false;
    const fallback = (): PaneLayout[] => {
      try {
        const ls = localStorage.getItem('slayer_workspace');
        if (ls) { const p = JSON.parse(ls); if (Array.isArray(p) && p.length) return p; }
      } catch {}
      return cloneTemplate('A');
    };
    fetch('/api/users/workspace', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.layout) && d.layout.length) {
          setLayout(d.layout);
        } else {
          const fb = fallback();
          setLayout(fb);
          persist(fb); // hydrate Template A into the user's profile
        }
      })
      .catch(() => { if (!cancelled) setLayout(fallback()); });
    return () => { cancelled = true; };
  }, [persist]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const it = interaction.current;
    if (!it) return;
    const dxCols = Math.round((e.clientX - it.startX) / (colWidth + GAP));
    const dyRows = Math.round((e.clientY - it.startY) / (ROW_HEIGHT + GAP));
    setLayout((prev) => prev.map((p) => {
      if (p.i !== it.id) return p;
      const meta = widgetMeta(p.widget);
      if (it.mode === 'move') {
        return {
          ...p,
          x: Math.max(0, Math.min(GRID_COLS - it.orig.w, it.orig.x + dxCols)),
          y: Math.max(0, it.orig.y + dyRows),
        };
      }
      return {
        ...p,
        w: Math.max(meta.minW, Math.min(GRID_COLS - p.x, it.orig.w + dxCols)),
        h: Math.max(meta.minH, it.orig.h + dyRows),
      };
    }));
  }, [colWidth]);

  const endInteraction = useCallback(() => {
    if (interaction.current) {
      interaction.current = null;
      setLayout((cur) => { persist(cur); return cur; });
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endInteraction);
  }, [onPointerMove, persist]);

  const startInteraction = (id: string, mode: 'move' | 'resize', e: React.PointerEvent) => {
    e.preventDefault();
    const orig = layout.find((p) => p.i === id);
    if (!orig) return;
    interaction.current = { id, mode, startX: e.clientX, startY: e.clientY, orig: { ...orig } };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endInteraction);
  };

  // Safety net: if the component unmounts mid-drag, detach the window listeners
  // (endInteraction only runs on pointerup, which never fires after unmount).
  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endInteraction);
  }, [onPointerMove, endInteraction]);

  const closePane = (id: string) => commit(layout.filter((p) => p.i !== id));
  const addWidget = (widget: WidgetType) => {
    const maxY = layout.reduce((m, p) => Math.max(m, p.y + p.h), 0);
    const meta = widgetMeta(widget);
    commit([...layout, { i: paneId(widget), widget, x: 0, y: maxY, w: Math.max(meta.minW, 4), h: Math.max(meta.minH, 4) }]);
    setAddOpen(false);
  };
  const loadTemplate = (key: 'A' | 'B' | 'C' | 'D' | 'E') => { commit(cloneTemplate(key)); setLoadOpen(false); setMaximized(null); };

  const [saveName, setSaveName] = useState('');
  const [showSaveOverlay, setShowSaveOverlay] = useState(false);
  const [customLayouts, setCustomLayouts] = useState<Record<string, PaneLayout[]>>(() => {
    try {
      const stored = localStorage.getItem('slayer_ws_custom');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const saveCustomLayout = () => {
    if (!saveName.trim()) return;
    const newCustom = { ...customLayouts, [saveName.trim()]: [...layout] };
    setCustomLayouts(newCustom);
    localStorage.setItem('slayer_ws_custom', JSON.stringify(newCustom));
    setSaveName('');
    setShowSaveOverlay(false);
  };

  const deleteCustomLayout = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newCustom = { ...customLayouts };
    delete newCustom[name];
    setCustomLayouts(newCustom);
    localStorage.setItem('slayer_ws_custom', JSON.stringify(newCustom));
  };

  const maxRow = layout.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  const gridHeight = Math.max(8, maxRow) * (ROW_HEIGHT + GAP) + GAP;
  const visibleWidgets = WIDGETS.filter((w) => isSuperAdmin || !w.adminOnly);
  const templateKeys = (['A', 'B', 'C', 'D', 'E'] as const).filter((k) => isSuperAdmin || !TEMPLATES[k].adminOnly);
  return (
    <>
      <div className="flex-1 flex flex-col w-full h-full font-mono text-[#E5E5E5] bg-black overflow-hidden select-none relative">
        <div className="flex-none bg-[#0A0A0A] border-b border-[#1F1F1F] p-2 flex items-center justify-between z-40">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#A3A3A3]">Layout Editor</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <button onClick={() => { setShowSaveOverlay(true); setLoadOpen(false); setAddOpen(false); }} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-cyan-400 bg-black/40 border border-cyan-900/50 rounded-sm px-2 md:px-3 py-1.5 hover:bg-cyan-900/20 hover:border-cyan-400 transition-colors">
              <Plus className="w-3 h-3" /> <span className="hidden md:inline">Save Layout</span>
            </button>
            
            <div className="relative">
              <button onClick={() => { setLoadOpen(!loadOpen); setAddOpen(false); setShowSaveOverlay(false); }} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[#E5E5E5] bg-[#111] border border-[#1F1F1F] rounded-sm px-2 md:px-3 py-1.5 hover:bg-[#1A1A1A] transition-colors">
                <span className="hidden md:inline">Workspaces</span>{" "}<ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>
              {loadOpen && (
                <div className="absolute right-0 md:left-0 mt-1 w-64 bg-[#0A0A0A] border border-[#1F1F1F] rounded-sm z-50 p-1 shadow-2xl overflow-y-auto max-h-96 text-left">
                  {Object.keys(customLayouts).length > 0 && (
                    <div className="mb-2 pb-2 border-b border-[#1F1F1F]">
                      <div className="text-[8px] text-zinc-500 uppercase font-black px-2 pb-1 tracking-widest">Saved Workspaces</div>
                      {Object.keys(customLayouts).map(name => (
                        <div key={name} className="flex justify-between items-center group w-full px-2 py-1.5 text-[10px] hover:bg-[#1A1A1A] rounded-sm transition-colors">
                          <button onClick={() => { commit(customLayouts[name].map(p => ({...p}))); setLoadOpen(false); setMaximized(null); }} className="flex-1 text-[#E5E5E5] font-bold text-left truncate">
                            {name}
                          </button>
                          <button onClick={(e) => deleteCustomLayout(name, e)} className="text-rose-500/50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            [del]
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-[8px] text-cyan-400 uppercase font-black px-2 py-1 tracking-widest">Slayer Templates</div>
                  {templateKeys.map((k) => (
                    <button key={k} onClick={() => loadTemplate(k)} className="w-full flex items-center justify-between text-left px-2 py-1.5 text-[10px] text-cyan-400 hover:bg-[#1A1A1A] hover:text-cyan-300 font-bold rounded-sm transition-colors">
                      {TEMPLATES[k].name} <span className="text-zinc-600">[{k}]</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="relative">
              <button onClick={() => { setAddOpen(!addOpen); setLoadOpen(false); setShowSaveOverlay(false); }} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[#E5E5E5] bg-[#111] border border-[#1F1F1F] rounded-sm px-2 md:px-3 py-1.5 hover:bg-[#1A1A1A] transition-colors">
                <Plus className="w-3 h-3 text-[#4ADE80]" /> <span className="hidden md:inline">Add Widget</span>
              </button>
              {addOpen && (
                <div className="absolute right-0 mt-1 w-64 max-h-96 overflow-y-auto bg-[#0A0A0A] border border-[#1F1F1F] rounded-sm z-50 p-1 shadow-2xl text-left">
                  <div className="text-[8px] text-zinc-500 uppercase font-black px-2 py-1 tracking-widest">Available Widgets</div>
                  {visibleWidgets.map((w) => (
                    <button key={w.type} onClick={() => addWidget(w.type)} className="w-full text-left px-2 py-1.5 text-[10px] font-bold text-zinc-300 hover:text-[#4ADE80] hover:bg-[#1A1A1A] rounded-sm transition-colors">
                      {w.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div ref={containerRef} className="flex-1 overflow-auto bg-black p-2 relative h-full">
          <div className="relative w-full" style={{ height: gridHeight }}>
            {layout.map((p) => {
              const meta = widgetMeta(p.widget);
              const style: React.CSSProperties = {
                position: 'absolute',
                left: p.x * (colWidth + GAP),
                top: p.y * (ROW_HEIGHT + GAP),
                width: p.w * colWidth + (p.w - 1) * GAP,
                height: p.h * ROW_HEIGHT + (p.h - 1) * GAP,
                transition: interaction.current?.id === p.i ? 'none' : 'all 0.15s ease-out',
                zIndex: interaction.current?.id === p.i ? 10 : 1,
              };
              return (
                <div key={p.i} style={style}>
                  <Pane
                    title={meta.title}
                    onClose={() => closePane(p.i)}
                    onMaximize={() => setMaximized(p.i)}
                    onHeaderPointerDown={(e) => startInteraction(p.i, 'move', e)}
                  >
                    <ErrorBoundary label={meta.title}>
                      {renderWidget(p.widget)}
                    </ErrorBoundary>
                  </Pane>
                  <div
                    onPointerDown={(e) => startInteraction(p.i, 'resize', e)}
                    className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize z-20"
                    style={{ background: 'linear-gradient(135deg, transparent 45%, #52525b 45%, #52525b 55%, transparent 55%)', touchAction: 'none' }}
                    title="Resize"
                  />
                </div>
              );
            })}
            {layout.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                Loading Template...
              </div>
            )}
          </div>
        </div>

        {maximized && (() => {
          const p = layout.find((x) => x.i === maximized);
          if (!p) return null;
          return (
            <div className="fixed inset-0 z-[100] bg-black/95 p-4 flex flex-col">
              <Pane
                title={widgetMeta(p.widget).title}
                isMaximized
                onMaximize={() => setMaximized(null)}
                onClose={() => { closePane(p.i); setMaximized(null); }}
              >
                <ErrorBoundary label={widgetMeta(p.widget).title}>
                  {renderWidget(p.widget)}
                </ErrorBoundary>
              </Pane>
            </div>
          );
        })()}
      </div>

      {showSaveOverlay && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-sm p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <h2 className="text-[#E5E5E5] font-black text-xs tracking-widest uppercase">Save Custom Layout</h2>
            <p className="text-zinc-500 font-bold text-[10px] leading-relaxed">
              Name this workspace layout. It will be saved locally in your browser.
            </p>
            <input 
              type="text" 
              value={saveName} 
              onChange={e => setSaveName(e.target.value)} 
              placeholder="e.g., Options Scalping UI"
              className="bg-[#050505] border border-[#1F1F1F] text-[#E5E5E5] px-3 py-2 text-[10px] uppercase font-bold focus:outline-none focus:border-[#4ADE80] transition-colors rounded-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCustomLayout();
                if (e.key === 'Escape') { setShowSaveOverlay(false); setSaveName(''); }
              }}
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                onClick={() => { setShowSaveOverlay(false); setSaveName(''); }}
                className="text-[10px] uppercase font-bold text-zinc-500 hover:text-[#E5E5E5] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveCustomLayout}
                disabled={!saveName.trim()}
                className="text-[10px] uppercase font-black tracking-widest bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50 hover:text-cyan-300 border border-cyan-900/50 rounded-sm px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default WorkspaceView;
