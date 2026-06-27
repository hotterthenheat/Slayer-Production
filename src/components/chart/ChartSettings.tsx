import { useState, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_COLORS } from './format';

export type ColorPrefs = { up?: string; down?: string; line?: string; wick?: string; bg?: string; grid?: string };
type Toggle = readonly [string, boolean, Dispatch<SetStateAction<boolean>>];

/**
 * Chart appearance dropdown (the ⚙ gear). Owns its own open/close state so the parent
 * chart never re-renders just to toggle the menu. The parent supplies the color prefs and
 * the two toggle groups (Display, Dealer Map) as [label, value, setter] tuples, plus the
 * "strikes shown" count — pure presentation, no chart logic leaks in here.
 */
export function ChartSettings({ colors, setColors, display, dealer, gexCount, setGexCount }: {
  colors: ColorPrefs;
  setColors: Dispatch<SetStateAction<ColorPrefs>>;
  display: readonly Toggle[];
  dealer: readonly Toggle[];
  gexCount: number;
  setGexCount: Dispatch<SetStateAction<number>>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} title="Chart appearance" className="flex items-center justify-center w-6 h-6 rounded-sm text-[12px] leading-none border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors">⚙</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 z-50 w-[232px] max-h-[78vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl p-3">
            <div className="text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">Colors</div>
            <div className="space-y-1.5">
              {([['up', 'Up bars', DEFAULT_COLORS.up], ['down', 'Down bars', DEFAULT_COLORS.down], ['wick', 'Wick', DEFAULT_COLORS.up], ['line', 'Line / Area', DEFAULT_COLORS.line], ['bg', 'Background', '#0d0d0d'], ['grid', 'Grid', '#262626']] as const).map(([key, label, def]) => (
                <label key={key} className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">{label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono tabular-nums uppercase text-[var(--text-tertiary)]">{colors[key] || def}</span>
                    <input type="color" value={colors[key] || def} onChange={e => setColors(c => ({ ...c, [key]: e.target.value }))} className="w-7 h-6 rounded cursor-pointer bg-transparent border border-[var(--border)] p-0" />
                  </span>
                </label>
              ))}
            </div>
            <div className="text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mt-3 mb-1.5">Display</div>
            <div className="space-y-1.5">
              {display.map(([label, val, set]) => (
                <button key={label} onClick={() => set(v => !v)} className="w-full flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">{label}</span>
                  <span className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${val ? '' : 'bg-[var(--surface-3)]'}`} style={val ? { background: 'var(--accent-color)' } : undefined}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${val ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                </button>
              ))}
            </div>
            <div className="text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mt-3 mb-1.5">Dealer Map</div>
            <div className="space-y-1.5">
              {dealer.map(([label, val, set]) => (
                <button key={label} onClick={() => set(v => !v)} className="w-full flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">{label}</span>
                  <span className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${val ? '' : 'bg-[var(--surface-3)]'}`} style={val ? { background: 'var(--accent-color)' } : undefined}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${val ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2.5">
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">Strikes shown</span>
              <div className="flex items-center gap-0.5">
                {([['8', 8], ['16', 16], ['24', 24], ['Max', 40]] as const).map(([lbl, num]) => (
                  <button key={lbl} onClick={() => setGexCount(num)} className={`px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold transition-colors ${gexCount === num ? 'text-black' : 'text-[var(--text-tertiary)] border border-[var(--border)] hover:text-[var(--text-primary)]'}`} style={gexCount === num ? { background: 'var(--accent-color)' } : undefined}>{lbl}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setColors({})} className="w-full mt-3 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-widest border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">Reset colors</button>
          </div>
        </>
      )}
    </div>
  );
}
