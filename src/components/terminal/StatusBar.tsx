import { useState, useEffect } from 'react';

export function SystemStatus({ feedLabel, live, feedColor, cd }: { feedLabel: string; live: boolean; feedColor: string; cd: string }) {
  const [t, setT] = useState<{ fps: number; mem: number | null }>({ fps: 0, mem: null });
  useEffect(() => {
    let frames = 0, raf = 0, last = performance.now();
    const loop = () => { frames++; const n = performance.now(); if (n - last >= 1000) { const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize; setT({ fps: Math.round((frames * 1000) / (n - last)), mem: m != null ? m / 1048576 : null }); frames = 0; last = n; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const Cell = ({ label, value, color, dot }: { label: string; value: string; color: string; dot?: string }) => (
    <div className="flex items-center gap-1.5 shrink-0">
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
      <span className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
  return (
    <div className="shrink-0 h-7 border-t border-[var(--border)] bg-[var(--surface)] flex items-center gap-5 px-4 overflow-hidden">
      <Cell label="Feed" value={live ? feedLabel.replace('LIVE · ', '') : 'IDLE'} color={feedColor} dot={feedColor} />
      <Cell label="FPS" value={t.fps ? String(t.fps) : '—'} color={t.fps >= 50 ? 'var(--success)' : t.fps ? 'var(--warning)' : 'var(--text-tertiary)'} />
      {t.mem != null && <Cell label="Mem" value={t.mem >= 1024 ? (t.mem / 1024).toFixed(2) + 'GB' : Math.round(t.mem) + 'MB'} color="var(--text-secondary)" />}
      <Cell label="Session" value={cd} color={cd === 'CLOSED' ? 'var(--text-tertiary)' : 'var(--text-secondary)'} />
      <div className="ml-auto text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-tertiary)] shrink-0">Slayer Terminal</div>
    </div>
  );
}
