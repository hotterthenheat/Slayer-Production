import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { fmtNum } from '../../lib/format';
import { computeTerminalRead } from '../../lib/terminalRead';

type Read = ReturnType<typeof computeTerminalRead>;
type Migration = { direction: string; comCurrent: number } | null;
type GammaMotion = { label: string; sub: string; color: string } | null;

/**
 * Dealer Pulse — the at-a-glance, descriptive picture of dealer positioning: a force-balance bar and
 * the live dealer-MOTION read, then the hero status line (`tail`). It SHOWS the mechanics; it never
 * issues a trade. Net γ lives once in the left "Net Gamma Exposure" hero, the regime/levels once in
 * the status line — so nothing here repeats a number that already has a home.
 */
export function DealerPulse({ read, showMotion, migration, gammaMotion, vannaFlow, decimals, tail }: {
  read: Read;
  showMotion: boolean;
  migration: Migration;
  gammaMotion: GammaMotion;
  vannaFlow: string | null;
  decimals: number;
  tail?: ReactNode;
}) {
  return (
      <div className="flex items-stretch h-[58px] border-b border-[var(--border)] shrink-0 bg-[var(--surface)] overflow-hidden">
        {/* Dealer positioning force balance — a picture of the dealer book, not a call. Score is the net
            of the weighted dealer signals on a −100…+100 scale (negative = bearish book, positive = bullish). */}
        <div className="flex flex-col justify-center gap-1 px-4 border-r border-[var(--border)] shrink-0 w-[214px]">
          <div className="flex items-center justify-between" title="Dealer positioning score: net of the weighted dealer-flow signals on a −100…+100 scale (negative = bearish book, positive = bullish book)">
            <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Dealer Positioning</span>
            <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: read.score > 8 ? 'var(--success)' : read.score < -8 ? 'var(--danger)' : 'var(--text-tertiary)' }}>{read.score > 0 ? '+' : ''}{read.score}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px z-10" style={{ background: 'var(--border-strong)' }} />
            {read.score >= 0
              ? <div className="absolute top-0 bottom-0 left-1/2" style={{ background: 'var(--success)', width: `${Math.min(50, read.score / 2)}%`, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
              : <div className="absolute top-0 bottom-0 right-1/2" style={{ background: 'var(--danger)', width: `${Math.min(50, -read.score / 2)}%`, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />}
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest"><span style={{ color: 'var(--danger)' }}>Bearish book</span><span style={{ color: 'var(--success)' }}>Bullish book</span></div>
        </div>
        {/* Dealer MOTION — how the book is CHANGING right now: gamma hedging state, vanna hedge-flow,
            and which way the gamma center-of-mass (the pin) is drifting. Widened so nothing clips. */}
        {showMotion && (
          <div className="flex flex-col justify-center px-4 border-r border-[var(--border)] shrink-0 w-[236px]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Dealer Motion</span>
              {migration && migration.direction !== 'STABLE' && (
                <span className="flex items-center gap-0.5 text-[9px] font-mono font-black" style={{ color: migration.direction === 'BULLISH' ? 'var(--success)' : 'var(--danger)' }} title={`Gamma center-of-mass drifting ${migration.direction.toLowerCase()}${migration.comCurrent ? ` toward ${fmtNum(migration.comCurrent, decimals)}` : ''}`}>
                  {migration.direction === 'BULLISH' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}PIN
                </span>
              )}
            </div>
            <span className="text-[13px] font-mono font-black leading-tight mt-0.5" style={{ color: gammaMotion ? gammaMotion.color : 'var(--text-tertiary)' }}>{gammaMotion ? gammaMotion.label : '—'}</span>
            <span className="text-[9px] font-mono tracking-wide text-[var(--text-tertiary)]">{gammaMotion?.sub ?? 'awaiting dynamics'}{vannaFlow && vannaFlow !== 'NEUTRAL' ? ` · vanna ${vannaFlow.toLowerCase()}` : ''}</span>
          </div>
        )}
        {/* Hero status line — the one read a trader should see first (regime · pin · γ · range). */}
        <div className="flex-1 min-w-0 flex items-center px-4 overflow-hidden">{tail}</div>
      </div>
  );
}
