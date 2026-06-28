import { useState, useCallback, useMemo, ReactNode } from 'react';
import * as ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { X, GripVertical, Plus, RotateCcw, LayoutGrid } from 'lucide-react';

// react-grid-layout ships as `export =` (namespace) — access the HOC + Responsive grid off it and
// keep our own lean layout-item type so we don't fight the @types version's Layout shape.
const RGL: any = (ReactGridLayout as any).WidthProvider((ReactGridLayout as any).Responsive);
type LItem = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };

/**
 * TerminalWorkspace — a TradingView-style customizable grid. Panels can be dragged (by their header),
 * resized from the corner, added/removed, and the layout persists per user (localStorage). Opt-in: the
 * terminal renders this only in "Customize" mode, so the curated default layout is never disturbed.
 */

export interface WorkspacePanel {
  id: string;
  title: string;
  node: ReactNode;
  w?: number; h?: number;          // default grid size
  minW?: number; minH?: number;
}

interface SavedState { layout: LItem[]; active: string[]; }

export function TerminalWorkspace({ panels, storageKey, onExit }: { panels: WorkspacePanel[]; storageKey: string; onExit?: () => void }) {
  const byId = useMemo(() => Object.fromEntries(panels.map(p => [p.id, p])), [panels]);

  const defaultState = useCallback((): SavedState => {
    let x = 0, y = 0, rowH = 0;
    const layout = panels.map((p) => {
      const w = p.w ?? 4, h = p.h ?? 10;
      if (x + w > 12) { x = 0; y += rowH; rowH = 0; }
      const item: LItem = { i: p.id, x, y, w, h, minW: p.minW ?? 2, minH: p.minH ?? 4 };
      x += w; rowH = Math.max(rowH, h);
      return item;
    });
    return { layout, active: panels.map(p => p.id) };
  }, [panels]);

  const [state, setState] = useState<SavedState>(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) { const j = JSON.parse(raw); if (Array.isArray(j?.layout) && Array.isArray(j?.active)) return j; } } catch { /* ignore */ }
    return defaultState();
  });

  const persist = useCallback((s: SavedState) => { setState(s); try { localStorage.setItem(storageKey, JSON.stringify(s)); } catch { /* storage unavailable */ } }, [storageKey]);

  const onLayoutChange = useCallback((l: LItem[]) => {
    // Keep only entries for active panels; merge so adds/removes don't wipe positions.
    persist({ layout: l.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH })), active: state.active });
  }, [persist, state.active]);

  const removePanel = (id: string) => persist({ layout: state.layout.filter(l => l.i !== id), active: state.active.filter(a => a !== id) });
  const addPanel = (id: string) => {
    if (state.active.includes(id)) return;
    const p = byId[id]; if (!p) return;
    const maxY = state.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    persist({ layout: [...state.layout, { i: id, x: 0, y: maxY, w: p.w ?? 4, h: p.h ?? 10, minW: p.minW ?? 2, minH: p.minH ?? 4 }], active: [...state.active, id] });
  };
  const reset = () => { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } setState(defaultState()); };

  const [addOpen, setAddOpen] = useState(false);
  const inactive = panels.filter(p => !state.active.includes(p.id));

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-base)]">
      {/* Workspace toolbar */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0 bg-[var(--surface)]">
        <span className="flex items-center gap-1.5 text-[10px] font-sans font-black tracking-widest uppercase text-[var(--text-primary)]"><LayoutGrid className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} /> Custom Layout</span>
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] hidden sm:inline">drag headers · resize corners · saved automatically</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <button onClick={() => setAddOpen(o => !o)} disabled={!inactive.length} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors"><Plus className="w-3 h-3" /> Add</button>
            {addOpen && inactive.length > 0 && (
              <div className="absolute top-full right-0 mt-1 z-50 w-44 rounded-md shadow-2xl py-1 bg-[var(--surface)] border border-[var(--border-strong)]">
                {inactive.map(p => (
                  <button key={p.id} onClick={() => { addPanel(p.id); setAddOpen(false); }} className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors">{p.title}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={reset} title="Reset layout" className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-black uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors"><RotateCcw className="w-3 h-3" /> Reset</button>
          {onExit && <button onClick={onExit} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors">Done</button>}
        </div>
      </div>
      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2">
        <RGL
          className="layout"
          layouts={{ lg: state.layout, md: state.layout, sm: state.layout, xs: state.layout, xxs: state.layout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 8, xs: 4, xxs: 2 }}
          rowHeight={30}
          margin={[8, 8]}
          draggableHandle=".ws-drag"
          onLayoutChange={onLayoutChange}
          isResizable
          isDraggable
          compactType="vertical"
        >
          {state.active.map(id => {
            const p = byId[id]; if (!p) return null;
            return (
              <div key={id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex flex-col shadow-lg">
                <div className="ws-drag flex items-center gap-1.5 px-2 h-7 border-b border-[var(--border)] shrink-0 cursor-move bg-[var(--surface-2)] select-none">
                  <GripVertical className="w-3 h-3 text-[var(--text-tertiary)]" />
                  <span className="text-[9px] font-sans font-black tracking-widest uppercase text-[var(--text-secondary)] truncate">{p.title}</span>
                  <button onClick={() => removePanel(id)} title="Remove panel" className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--danger)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none rounded transition-colors"><X className="w-3 h-3" /></button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">{p.node}</div>
              </div>
            );
          })}
        </RGL>
      </div>
    </div>
  );
}
