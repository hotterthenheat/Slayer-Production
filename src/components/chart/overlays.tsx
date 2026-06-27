// Right-click "View" context menu — the only DOM overlay left on the chart. The dealer-positioning
// dashboard and regime chip were removed: that data lives once, in the Live Terminal's left rail.
export function ChartContextMenu({ menu, onClose, resetView, view, tweenView, priceView, onAutoFit }: { menu: { x: number; y: number }; onClose: () => void; resetView: () => void; view: { bars: number; off: number }; tweenView: (v: { bars: number; off: number }) => void; priceView: unknown; onAutoFit: () => void }) {
  return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => onClose()} onContextMenu={e => { e.preventDefault(); onClose(); }} onWheel={() => onClose()} />
            <div className="absolute z-50 min-w-[182px] bg-[var(--surface)] border border-[var(--border-strong)] rounded-md shadow-2xl py-1 select-none" style={{ left: menu.x, top: menu.y }}>
              <div className="px-3 pt-1 pb-1 text-[8.5px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]">View</div>
              <button onClick={() => { resetView(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] transition-colors"><span className="text-[var(--accent-color)]">⟳</span> Reset to live view</button>
              {view.off !== 0 && <button onClick={() => { tweenView({ bars: view.bars, off: 0 }); onClose(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] transition-colors"><span className="text-[var(--accent-color)]">⟲</span> Jump to live edge</button>}
              {priceView && <button onClick={() => { onAutoFit(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] transition-colors"><span className="text-[var(--accent-color)]">⤢</span> Auto-fit price scale</button>}
            </div>
          </>
  );
}
