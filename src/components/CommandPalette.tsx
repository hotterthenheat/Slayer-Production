import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';

interface Command {
  id: string;
  title: string;
  hint?: string;      // right-aligned section/label
  keywords?: string;  // extra search terms
  run: () => void;
}

/**
 * ⌘K / Ctrl+K command palette — Bloomberg-style keyboard command line.
 * Self-contained: owns its open state + global hotkey, and drives navigation
 * through the existing store. Mounted once at the app root.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setActiveTab = useContractStore(s => s.setActiveTab);
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const setSelectedOptionType = useContractStore(s => s.setSelectedOptionType);
  const setIsGlobalSearchOpen = useContractStore(s => s.setIsGlobalSearchOpen);

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(0); }, []);

  // Global hotkey: ⌘K / Ctrl+K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); }
  }, [open]);

  const commands: Command[] = useMemo(() => {
    const go = (tab: any) => () => { setActiveTab(tab); close(); };
    const nav: Command[] = [
      { id: 'nav-home', title: 'Go to Home', hint: 'View', keywords: 'ecosystem intro dashboard', run: go('home') },
      { id: 'nav-skyvision', title: 'Go to SkyVision — Trade Dashboard', hint: 'View', keywords: 'scanner setups score', run: go('skyvision') },
      { id: 'nav-pinpoint', title: 'Go to Pinpoint GEX — Dealer Flow', hint: 'View', keywords: 'gamma gex dealer flow', run: go('pinpoint') },
      { id: 'nav-dealerflow', title: 'Go to Dealer Flow', hint: 'View', keywords: 'gex dex vex walls', run: go('dealerflow') },
      { id: 'nav-auditor', title: 'Go to Trade History', hint: 'View', keywords: 'audit trades history registry', run: go('auditor') },
      { id: 'nav-community', title: 'Go to Community', hint: 'View', keywords: 'community slayer capital discord', run: go('community') },
      { id: 'nav-workspace', title: 'Go to Workspace', hint: 'View', keywords: 'widgets layout panels', run: go('workspace') },
      { id: 'nav-settings', title: 'Open Settings', hint: 'View', keywords: 'preferences theme account profile', run: go('settings') },
      { id: 'nav-subscription', title: 'View Plans & Pricing', hint: 'Billing', keywords: 'upgrade subscribe tier plan', run: go('subscription') },
    ];
    const actions: Command[] = [
      { id: 'act-search', title: 'Open Global Search', hint: 'Action', keywords: 'find prism filter', run: () => { setIsGlobalSearchOpen(true); close(); } },
      { id: 'act-calls', title: 'Set Contract Type to Calls', hint: 'Action', keywords: 'call c bullish', run: () => { setSelectedOptionType('C'); close(); } },
      { id: 'act-puts', title: 'Set Contract Type to Puts', hint: 'Action', keywords: 'put p bearish', run: () => { setSelectedOptionType('P'); close(); } },
    ];
    const symbols: Command[] = ASSET_LIST.map(a => ({
      id: 'sym-' + a.ticker,
      title: `Switch symbol → ${a.ticker}`,
      hint: a.name,
      keywords: a.ticker + ' ' + a.name,
      run: () => { setSelectedAsset(a); setActiveTab('skyvision'); close(); },
    }));
    return [...nav, ...actions, ...symbols];
  }, [setActiveTab, setSelectedAsset, setSelectedOptionType, setIsGlobalSearchOpen, close]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c => (c.title + ' ' + (c.hint || '') + ' ' + (c.keywords || '')).toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row in view as the user arrows through results.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.run(); }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl mx-4 bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden font-mono"
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
          <span className="text-[var(--accent-color)] text-sm font-black select-none">&gt;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or symbol…"
            className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] tabular-nums"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="text-[9px] text-[var(--text-tertiary)] border border-[var(--border)] rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[var(--text-tertiary)] text-xs">No matching commands</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              data-idx={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => c.run()}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${i === active ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              style={i === active ? { boxShadow: 'inset 2px 0 0 var(--accent-color)' } : undefined}
            >
              <span>{c.title}</span>
              {c.hint && <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] ml-3 shrink-0">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-3 text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <span>↑↓ navigate</span><span>↵ select</span><span>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
