import type { GexProfileData } from '../../types';
import { fmtGex } from './format';

export type DealerStats = { net: number; callPct: number; long: boolean; largestCall?: number; largestPut?: number; netDex: number | null; netVex: number | null };

// Dealer Map — glass positioning panel (top-left of the chart).
export function DealerMap({ stats, profile, decimals }: { stats: DealerStats; profile: GexProfileData; decimals: number }) {
  return (
          <div className="absolute top-[52px] left-2 z-10 w-[188px] px-2.5 py-2 pointer-events-none select-none font-mono" style={{ borderRadius: 10, background: 'linear-gradient(160deg, color-mix(in srgb, var(--surface) 90%, transparent), color-mix(in srgb, var(--surface) 78%, transparent))', border: '1px solid var(--border-strong)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: '0 14px 44px -10px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1.5">Dealer Map</div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Net GEX</span>
              <span className="text-[12px] font-black tabular-nums" style={{ color: stats.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtGex(stats.net)}</span>
            </div>
            <div className="rounded px-2 py-1.5 mb-2 text-center" style={{ background: `color-mix(in srgb, ${stats.long ? 'var(--success)' : 'var(--danger)'} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${stats.long ? 'var(--success)' : 'var(--danger)'} 45%, transparent)` }}>
              <div className="text-[7.5px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Dealer Bias</div>
              <div className="text-[16px] font-black uppercase tracking-wide leading-none" style={{ color: stats.long ? 'var(--success)' : 'var(--danger)' }}>{stats.long ? 'LONG γ' : 'SHORT γ'}</div>
            </div>
            {typeof profile.spot === 'number' && typeof profile.gammaFlip === 'number' && (
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Spot vs Flip</span>
                <span className="text-[9.5px] font-black tabular-nums" style={{ color: profile.spot >= profile.gammaFlip ? 'var(--success)' : 'var(--danger)' }}>{profile.spot >= profile.gammaFlip ? '▲ +' : '▼ '}{(profile.spot - profile.gammaFlip).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>
              </div>
            )}
            {/* Dealer greeks (#10): net delta + vanna exposure beside gamma, so the whole hedging picture reads in one card. */}
            {((profile.netDex ?? stats.netDex) != null || (profile.netVex ?? stats.netVex) != null) && (
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {([['Net Δ', profile.netDex ?? stats.netDex], ['Net Vanna', profile.netVex ?? stats.netVex]] as const).map(([k, v]) => (
                  <div key={k} className="rounded px-1.5 py-1" style={{ background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)' }}>
                    <div className="text-[7.5px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none mb-0.5">{k}</div>
                    <div className="text-[10px] font-black tabular-nums leading-none" style={{ color: v == null ? 'var(--text-tertiary)' : v >= 0 ? 'var(--success)' : 'var(--danger)' }}>{v == null ? '—' : fmtGex(v)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mb-1"><span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Dealer Pressure</span><span className="text-[9px] font-black tabular-nums" style={{ color: stats.long ? 'var(--success)' : 'var(--danger)' }}>{stats.callPct}%</span></div>
            <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: 'color-mix(in srgb, var(--danger) 45%, transparent)' }}><div className="h-full rounded-full" style={{ width: stats.callPct + '%', background: 'var(--success)' }} /></div>
            <div className="flex justify-between text-[8px] mb-2"><span style={{ color: 'var(--success)' }}>{stats.callPct}% calls</span><span style={{ color: 'var(--danger)' }}>{100 - stats.callPct}% puts</span></div>
            <div className="space-y-1 border-t border-[var(--border)] pt-1.5">
              {([['Call Wall', profile.callWall], ['Gamma Flip', profile.gammaFlip], ['Put Wall', profile.putWall], ['Largest Call', stats.largestCall], ['Largest Put', stats.largestPut]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-[9.5px] leading-none"><span className="text-[var(--text-tertiary)] whitespace-nowrap">{k}</span><span className="text-[var(--text-secondary)] font-bold tabular-nums">{typeof v === 'number' ? Math.round(v).toLocaleString() : '—'}</span></div>
              ))}
            </div>
          </div>
  );
}

// Market-regime chip — centred top read.
export function RegimeChip({ long }: { long: boolean }) {
  return (
          <div className="absolute top-1.5 z-10 pointer-events-none select-none flex items-center gap-1.5 rounded-md px-2 py-1 font-mono" style={{ left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(160deg, color-mix(in srgb, var(--surface) 90%, transparent), color-mix(in srgb, var(--surface) 78%, transparent))', border: `1px solid color-mix(in srgb, ${long ? 'var(--success)' : 'var(--danger)'} 42%, transparent)`, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: long ? 'var(--success)' : 'var(--danger)' }} />
            <span className="text-[8px] font-black uppercase tracking-[0.15em]" style={{ color: long ? 'var(--success)' : 'var(--danger)' }}>{long ? 'Positive γ' : 'Negative γ'}</span>
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{long ? 'Mean-Revert' : 'Trend · Vol'}</span>
          </div>
  );
}

// Right-click "View" context menu.
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
