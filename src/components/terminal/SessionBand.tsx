import { Clock } from 'lucide-react';

const SEGS = [{ k: 'o', sess: 'OPEN', l: 'Open Drive', w: 0.154 }, { k: 'm', sess: 'MIDDAY', l: 'Midday', w: 0.615 }, { k: 'p', sess: 'POWER_HOUR', l: 'Power Hour', w: 0.154 }, { k: 'c', sess: 'CLOSE', l: 'Into Close', w: 0.077 }] as const;

/**
 * 0DTE session band — phase segments (open drive / midday / power hour / into close) with a live
 * progress marker and the countdown to the cash close. Purely presentational.
 */
export function SessionBand({ sess, clock }: { sess: { live: boolean; prog: number; cd: string }; clock: { session: string } }) {
  return (
      <div className="flex items-center gap-2.5 h-6 px-3 border-b border-[var(--border)] shrink-0" style={{ background: 'var(--bg-base)' }}>
        <Clock className="w-3 h-3 shrink-0" style={{ color: sess.live ? 'var(--accent-color)' : 'var(--text-tertiary)' }} />
        <div className="relative flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }}>
          {SEGS.map(s => (<div key={s.k} className="h-full" style={{ width: `${s.w * 100}%`, borderRight: '1px solid var(--bg-base)', background: clock.session === s.sess ? 'color-mix(in srgb, var(--accent-color) 55%, transparent)' : 'transparent' }} title={s.l} />))}
          {sess.live && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ left: `${sess.prog * 100}%`, background: 'var(--accent-color)', boxShadow: '0 0 6px var(--accent-color)' }} />}
        </div>
        <span className="text-[9px] font-mono font-black uppercase tracking-widest shrink-0" style={{ color: sess.live ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{SEGS.find(s => s.sess === clock.session)?.l ?? (sess.live ? 'Session' : 'Closed')}</span>
        <span className="text-[10px] font-mono font-black tabular-nums shrink-0 w-[88px] text-right" style={{ color: sess.cd !== 'CLOSED' && sess.prog > 0.77 ? 'var(--warning)' : sess.live ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{sess.cd !== 'CLOSED' ? `${sess.cd} to close` : 'Market closed'}</span>
      </div>
  );
}
