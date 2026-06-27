import { Radio, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'motion/react';
import { fmtNum } from '../../lib/format';
import { computeTerminalRead } from '../../lib/terminalRead';
import { fmtBig, toneColor } from './format';

type Read = ReturnType<typeof computeTerminalRead>;
type Migration = { direction: string; comCurrent: number } | null;
type GammaMotion = { label: string; sub: string; color: string } | null;

/**
 * Dealer Pulse — the at-a-glance, descriptive picture of dealer positioning: a force-balance bar,
 * net γ + regime, the implied range, the live dealer-MOTION read, and a streaming observation tape.
 * It SHOWS the mechanics; it never issues a trade. Pure view-model presentation.
 */
export function DealerPulse({ read, trend, netGex, showMotion, migration, gammaMotion, vannaFlow }: {
  read: Read;
  trend: string;
  netGex: number;
  showMotion: boolean;
  migration: Migration;
  gammaMotion: GammaMotion;
  vannaFlow: string | null;
}) {
  return (
      <div className="flex items-stretch h-[58px] border-b border-[var(--border)] shrink-0 bg-[var(--surface)] overflow-hidden">
        {/* Dealer positioning force balance — a picture of the dealer book, not a call */}
        <div className="flex flex-col justify-center gap-1 px-4 border-r border-[var(--border)] shrink-0 w-[214px]">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Dealer Positioning</span>
            <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: read.score > 8 ? 'var(--success)' : read.score < -8 ? 'var(--danger)' : 'var(--text-tertiary)' }}>{read.score > 0 ? '+' : ''}{read.score}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px z-10" style={{ background: 'var(--border-strong)' }} />
            {read.score >= 0
              ? <motion.div className="absolute top-0 bottom-0 left-1/2" style={{ background: 'var(--success)' }} animate={{ width: `${Math.min(50, read.score / 2)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
              : <motion.div className="absolute top-0 bottom-0 right-1/2" style={{ background: 'var(--danger)' }} animate={{ width: `${Math.min(50, -read.score / 2)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />}
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest"><span style={{ color: 'var(--danger)' }}>Bearish book</span><span style={{ color: 'var(--success)' }}>Bullish book</span></div>
        </div>
        {/* Net gamma + regime */}
        <div className="flex flex-col justify-center px-4 border-r border-[var(--border)] shrink-0">
          <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Net γ · {read.regime === 'PIN' ? `Pin ${read.pinStrength}` : 'Trend'}</span>
          <span className="text-[16px] font-mono font-black tabular-nums leading-tight mt-0.5" style={{ color: trend }}>{netGex >= 0 ? '+' : ''}{fmtBig(netGex)}</span>
        </div>
        {/* Dealer MOTION — how the book is CHANGING right now: gamma hedging state, vanna
            hedge-flow, and which way the gamma center-of-mass (the pin) is drifting. */}
        {showMotion && (
          <div className="flex flex-col justify-center px-4 border-r border-[var(--border)] shrink-0 w-[188px]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Dealer Motion</span>
              {migration && migration.direction !== 'STABLE' && (
                <span className="flex items-center gap-0.5 text-[9px] font-mono font-black" style={{ color: migration.direction === 'BULLISH' ? 'var(--success)' : 'var(--danger)' }} title={`Gamma center-of-mass drifting ${migration.direction.toLowerCase()}${migration.comCurrent ? ` toward ${fmtNum(migration.comCurrent)}` : ''}`}>
                  {migration.direction === 'BULLISH' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}PIN
                </span>
              )}
            </div>
            <span className="text-[13px] font-mono font-black leading-tight mt-0.5" style={{ color: gammaMotion ? gammaMotion.color : 'var(--text-tertiary)' }}>{gammaMotion ? gammaMotion.label : '—'}</span>
            <span className="text-[9px] font-mono tracking-wide text-[var(--text-tertiary)] truncate">{gammaMotion?.sub ?? 'awaiting dynamics'}{vannaFlow && vannaFlow !== 'NEUTRAL' ? ` · vanna ${vannaFlow.toLowerCase()}` : ''}</span>
          </div>
        )}
        {/* Live observation tape — what's happening, never what to do */}
        <div className="flex-1 min-w-0 flex items-center gap-2 px-4 overflow-hidden">
          <span className="flex items-center gap-1 text-[9px] font-black tracking-widest uppercase shrink-0" style={{ color: 'var(--accent-color)' }}><Radio className="w-3 h-3" /> Tape</span>
          <div className="flex-1 overflow-hidden">
            <div className="flex gap-8 whitespace-nowrap animate-ticker-marquee">
              {[...read.events, ...read.events].map((e, i) => (<span key={i} className="text-[10px] font-mono inline-flex items-center gap-1.5" style={{ color: toneColor(e.tone) }}><span className="w-1 h-1 rounded-full shrink-0" style={{ background: toneColor(e.tone) }} />{e.text}</span>))}
            </div>
          </div>
        </div>
      </div>
  );
}
