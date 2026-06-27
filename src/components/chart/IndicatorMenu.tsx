import { useState, type Dispatch, type SetStateAction } from 'react';
import { OVERLAY_DEFS, PANE_DEFS, OVERLAY_GROUPS, PANE_GROUPS } from './indicators';

type ToggleMap = Record<string, boolean>;

// Indicator menu — searchable 80+ overlay/pane picker. Owns its own open + search state;
// the parent only supplies the active-toggle maps + setters.
export function IndicatorMenu({ ovOn, setOvOn, paneOn, setPaneOn }: { ovOn: ToggleMap; setOvOn: Dispatch<SetStateAction<ToggleMap>>; paneOn: ToggleMap; setPaneOn: Dispatch<SetStateAction<ToggleMap>> }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);
  const activeCount = Object.values(ovOn).filter(Boolean).length + Object.values(paneOn).filter(Boolean).length;
  return (
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)} className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-black uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">
            <span className="text-[var(--accent-color)]">ƒ</span> Indicators{activeCount > 0 && <span className="px-1 rounded-full bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[9px]">{activeCount}</span>}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setMenuOpen(false); setQuery(''); }} />
              <div className="absolute top-full left-0 mt-1 z-50 w-[290px] max-h-[440px] flex flex-col bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-[var(--border)] shrink-0">
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search 80+ indicators…" className="w-full px-2 py-1.5 rounded bg-black/40 border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent-color)]/50" />
                </div>
                <div className="overflow-y-auto py-1">
                  {OVERLAY_GROUPS.map(group => {
                    const items = OVERLAY_DEFS.filter(d => d.group === group && matches(d.label));
                    if (!items.length) return null;
                    return (
                      <div key={group}>
                        <div className="px-3 pt-2 pb-1 text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{group}</div>
                        {items.map(d => (
                          <button key={d.key} onClick={() => setOvOn(p => ({ ...p, [d.key]: !p[d.key] }))} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.05] transition-colors">
                            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${ovOn[d.key] ? 'bg-[var(--accent-color)] border-[var(--accent-color)]' : 'border-[var(--border-strong)]'}`}>{ovOn[d.key] && <span className="text-black text-[9px] font-black">✓</span>}</span>
                            <span className="text-[11px] font-mono text-[var(--text-secondary)]">{d.label}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  {PANE_GROUPS.map(group => {
                    const items = PANE_DEFS.filter(d => d.group === group && matches(d.label));
                    if (!items.length) return null;
                    return (
                      <div key={group}>
                        <div className="px-3 pt-2 pb-1 text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{group} <span className="text-[var(--text-tertiary)]/60">· pane</span></div>
                        {items.map(d => (
                          <button key={d.key} onClick={() => setPaneOn(p => ({ ...p, [d.key]: !p[d.key] }))} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.05] transition-colors">
                            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${paneOn[d.key] ? 'bg-[var(--accent-color)] border-[var(--accent-color)]' : 'border-[var(--border-strong)]'}`}>{paneOn[d.key] && <span className="text-black text-[9px] font-black">✓</span>}</span>
                            <span className="text-[11px] font-mono text-[var(--text-secondary)]">{d.label}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {activeCount > 0 && <button onClick={() => { setOvOn({}); setPaneOn({}); }} className="shrink-0 border-t border-[var(--border)] py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors">Clear all ({activeCount})</button>}
              </div>
            </>
          )}
        </div>
  );
}
