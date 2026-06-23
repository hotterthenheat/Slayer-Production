/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dependency-free resizable grid workspace (React-19 safe — no findDOMNode).
 * Snap-to-grid drag + resize via pointer events; debounced persistence to
 * localStorage + PATCH /api/users/workspace; hydrates from API or Template A.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, ChevronDown, X } from 'lucide-react';
import { Pane, renderWidget } from './WorkspaceWidgets';
import { ErrorBoundary } from './ErrorBoundary';
import {
  PaneLayout, WidgetType, WIDGETS, widgetMeta, paneId, TEMPLATES, cloneTemplate, GRID_COLS,
} from '../lib/workspace';

const ROW_HEIGHT = 40;
const GAP = 8;

interface Props { isSuperAdmin?: boolean; }

export function WorkspaceView({ isSuperAdmin }: Props) {
  const [layout, setLayout] = useState<PaneLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(80);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interaction = useRef<null | { id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: PaneLayout }>(null);

  // Lightweight self-contained toast for surfacing save failures.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyError = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
      })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        .catch(() => notifyError('Workspace changes saved locally but failed to sync to your account.'));
    }, 1000);
  }, [notifyError]);

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
      .catch(() => { if (!cancelled) setLayout(fallback()); })
      .finally(() => { if (!cancelled) setLoading(false); });
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
  const saveInputRef = useRef<HTMLInputElement>(null);
  const saveTriggerRef = useRef<HTMLButtonElement>(null);

  // Save-Workspace modal a11y: focus the name field on open, support Escape to
  // close, and restore focus to the trigger when the modal closes.
  useEffect(() => {
    if (!showSaveOverlay) return;
    saveInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSaveOverlay(false); setSaveName(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      saveTriggerRef.current?.focus();
    };
  }, [showSaveOverlay]);
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
      <div className="flex-1 flex flex-col w-full h-full text-[var(--text-primary)] bg-[var(--background)] overflow-hidden select-none relative">
        <div className="flex-none bg-[var(--surface)] border-b border-[var(--border)] px-3 py-2 flex items-center justify-between gap-3 z-40">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Workspace Editor</span>
          <div className="flex items-center gap-1.5">
            <button ref={saveTriggerRef} onClick={() => { setShowSaveOverlay(true); setLoadOpen(false); setAddOpen(false); }} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-2.5 py-1.5 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors">
              <Plus className="w-3 h-3" /> <span className="hidden md:inline">Save</span>
            </button>

            <div className="relative">
              <button onClick={() => { setLoadOpen(!loadOpen); setAddOpen(false); setShowSaveOverlay(false); }} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-2.5 py-1.5 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors">
                <span className="hidden md:inline">Workspaces</span><ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
              </button>
              {loadOpen && (
                <div className="absolute right-0 md:left-0 mt-1.5 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-[3px] z-50 p-1.5 shadow-2xl overflow-y-auto max-h-96 text-left">
                  {Object.keys(customLayouts).length > 0 && (
                    <div className="mb-1.5 pb-1.5 border-b border-[var(--border)]">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold px-2 pb-1 tracking-[0.14em]">Saved</div>
                      {Object.keys(customLayouts).map(name => (
                        <div key={name} className="flex justify-between items-center gap-2 group w-full px-2 py-1.5 text-[10px] hover:bg-[var(--surface-3)] rounded-[2px] transition-colors">
                          <button onClick={() => { commit(customLayouts[name].map(p => ({...p}))); setLoadOpen(false); setMaximized(null); }} className="flex-1 text-[var(--text-secondary)] font-medium text-left truncate hover:text-[var(--text-primary)]">
                            {name}
                          </button>
                          <button onClick={(e) => deleteCustomLayout(name, e)} title="Delete" className="text-[var(--text-tertiary)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold px-2 py-1 tracking-[0.14em]">Templates</div>
                  {templateKeys.map((k) => (
                    <button key={k} onClick={() => loadTemplate(k)} className="w-full flex items-center justify-between text-left px-2 py-1.5 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] font-medium rounded-[2px] transition-colors">
                      {TEMPLATES[k].name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button onClick={() => { setAddOpen(!addOpen); setLoadOpen(false); setShowSaveOverlay(false); }} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-2.5 py-1.5 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors">
                <Plus className="w-3 h-3 text-[var(--success)]" /> <span className="hidden md:inline">Add Widget</span>
              </button>
              {addOpen && (
                <div className="absolute right-0 mt-1.5 w-64 max-h-96 overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-[3px] z-50 p-1.5 shadow-2xl text-left">
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold px-2 py-1 tracking-[0.14em]">Available Widgets</div>
                  {visibleWidgets.map((w) => (
                    <button key={w.type} onClick={() => addWidget(w.type)} className="w-full text-left px-2 py-1.5 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--success)] hover:bg-[var(--surface-3)] rounded-[2px] transition-colors">
                      {w.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div ref={containerRef} className="flex-1 overflow-auto bg-[var(--background)] p-2 relative h-full">
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
                    style={{ background: 'linear-gradient(135deg, transparent 45%, var(--text-tertiary) 45%, var(--text-tertiary) 55%, transparent 55%)', touchAction: 'none' }}
                    title="Resize"
                  />
                </div>
              );
            })}
            {layout.length === 0 && loading && (
              <div className="absolute inset-0 p-2" aria-busy="true" aria-label="Loading workspace">
                <div className="grid grid-cols-2 lg:grid-cols-3 auto-rows-[160px] gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-[3px] overflow-hidden animate-pulse">
                      <div className="h-7 shrink-0 bg-[var(--surface-2)] border-b border-[var(--border)]" />
                      <div className="flex-1 p-3 flex flex-col gap-2">
                        <div className="h-3 w-2/3 rounded bg-[var(--surface-3)]" />
                        <div className="h-3 w-1/2 rounded bg-[var(--surface-3)]" />
                        <div className="h-3 w-3/4 rounded bg-[var(--surface-3)]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {maximized && (() => {
          const p = layout.find((x) => x.i === maximized);
          if (!p) return null;
          return (
            <div className="fixed inset-0 z-[100] bg-[var(--background)]/95 backdrop-blur-sm p-4 flex flex-col">
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { setShowSaveOverlay(false); setSaveName(''); }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-workspace-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 w-full max-w-sm flex flex-col gap-4 shadow-2xl"
          >
            <h2 id="save-workspace-title" className="text-[var(--text-primary)] font-semibold text-[11px] tracking-[0.14em] uppercase">Save Workspace</h2>
            <p className="text-[var(--text-tertiary)] text-[10px] leading-relaxed">
              Saved locally in this browser.
            </p>
            <label htmlFor="save-workspace-name" className="sr-only">Workspace name</label>
            <input
              id="save-workspace-name"
              ref={saveInputRef}
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Workspace name"
              className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] px-3 py-2 text-[11px] font-medium focus:outline-none focus:border-[var(--success)] transition-colors rounded-[3px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCustomLayout();
              }}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => { setShowSaveOverlay(false); setSaveName(''); }}
                className="text-[10px] uppercase font-semibold tracking-[0.12em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-3 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCustomLayout}
                disabled={!saveName.trim()}
                className="text-[10px] uppercase font-semibold tracking-[0.12em] bg-[var(--success)] text-[#04140A] hover:opacity-90 rounded-[3px] px-4 py-2 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-[300] flex items-center gap-2.5 bg-[var(--surface-2)] border border-[var(--danger)]/30 rounded-[3px] px-4 py-3 shadow-2xl text-[10px] font-medium text-[var(--text-primary)] max-w-xs"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}

export default WorkspaceView;
