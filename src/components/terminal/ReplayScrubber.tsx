import type { GexProfileData } from '../../types';


/**
 * ReplayScrubber — Market Replay timeline (§3.2). Drag (or click) to rewind the entire dealer state
 * to any buffered moment; LIVE snaps back to the latest. The buffer keeps filling in the background,
 * so you can study a turning point and rejoin the live tape without losing data.
 */
export function ReplayScrubber({ hist, replayT, setReplayT }: { hist: { t: number; p: GexProfileData }[]; replayT: number | null; setReplayT: (t: number | null) => void; decimals: number }) {
  const t0 = hist[0].t, t1 = hist[hist.length - 1].t, span = Math.max(1, t1 - t0);
  const live = replayT == null;
  const pos = live ? 100 : Math.max(0, Math.min(100, ((replayT - t0) / span) * 100));
  const fmt = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour12: false });
  const scrub = (e: { currentTarget: HTMLElement; clientX: number }) => { const r = e.currentTarget.getBoundingClientRect(); setReplayT(t0 + span * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
  const accent = live ? 'var(--success)' : 'var(--warning)';
  return (
    <div className="shrink-0 h-9 border-t border-[var(--border)] bg-[var(--surface)] flex items-center gap-3 px-4 font-mono select-none">
      <button onClick={() => setReplayT(live ? t0 + span * 0.5 : null)} className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border transition-colors shrink-0" style={{ borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`, color: accent, background: `color-mix(in srgb, ${accent} 11%, transparent)` }}>{live ? '● LIVE' : '⏸ REPLAY'}</button>
      <span className="text-[8px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] shrink-0 hidden md:block">Time Travel</span>
      <span className="text-[9px] tabular-nums text-[var(--text-tertiary)] w-[58px] shrink-0">{fmt(t0)}</span>
      <div className="relative flex-1 h-4 flex items-center cursor-pointer" onMouseDown={scrub} onMouseMove={e => { if (e.buttons === 1) scrub(e); }}>
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-[var(--surface-3)]" />
        <div className="absolute left-0 h-[3px] rounded-full" style={{ width: `${pos}%`, background: accent }} />
        <div className="absolute w-3 h-3 rounded-full -translate-x-1/2 border-2 border-[var(--surface)]" style={{ left: `${pos}%`, background: accent, boxShadow: `0 0 8px color-mix(in srgb, ${accent} 60%, transparent)` }} />
      </div>
      <span className="text-[9px] tabular-nums text-[var(--text-tertiary)] w-[58px] text-right shrink-0">{fmt(t1)}</span>
      <span className="text-[10px] font-black tabular-nums w-[68px] text-right shrink-0" style={{ color: accent }}>{live ? 'NOW' : fmt(replayT)}</span>
    </div>
  );
}
