import { useMemo, useState } from 'react';
import { GexProfileData } from '../types';
import { useContractStore } from '../lib/store';
import { SlayerChart } from './SlayerChart';
import { Activity, LayoutGrid, Maximize2, Shield, Zap } from 'lucide-react';

interface LiveTerminalFlowProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}

export function LiveTerminalFlow({ profile, ticker, decimals }: LiveTerminalFlowProps) {
  // Narrow selector: this component only reads themeMode, so subscribe to that
  // single slice instead of the whole store (avoids a re-render on every tick mutation).
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  const [activeLadder, setActiveLadder] = useState<'30' | 'ALL'>('30');

  // Unified striking data
  const ladderData = useMemo(() => {
    let strikes = profile?.strikes || [];
    if (activeLadder === '30' && profile.spot) {
      // Find closest 30 strikes to spot
      const sorted = [...strikes].sort((a, b) => Math.abs(a.strike - (profile.spot || 0)) - Math.abs(b.strike - (profile.spot || 0)));
      strikes = sorted.slice(0, 30);
    }
    
    // Calculate max magnitudes to scale the histogram bars correctly
    const maxVol = Math.max(...strikes.map(s => (s.callVolume || 0) + (s.putVolume || 0)), 1);
    const maxGex = Math.max(...strikes.map(s => Math.max(Math.abs(s.callGex || 0), Math.abs(s.putGex || 0))), 1);

    return strikes
      .sort((a, b) => b.strike - a.strike) // descending order
      .map(s => {
         const callVolPct = ((s.callVolume || 0) / maxVol) * 100;
         const putVolPct = ((s.putVolume || 0) / maxVol) * 100;

         const callGexPct = ((s.callGex || 0) / maxGex) * 100;
         const putGexPct = (Math.abs(s.putGex || 0) / maxGex) * 100;

         return {
           strike: s.strike,
           isSpot: Math.abs(s.strike - (profile.spot || 0)) < 0.001,
           isFlip: s.strike === profile.gammaFlip,
           isCallWall: s.strike === profile.callWall,
           isPutWall: s.strike === profile.putWall,

           callVolPct, putVolPct,
           callGexPct, putGexPct,
         };
      });
  }, [profile, activeLadder]);

  return (
    <div className={`w-full flex flex-col h-auto ${isLight ? 'bg-zinc-100 text-zinc-900' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`} style={{ minHeight: '800px' }}>

      {/* HUD Header */}
      <div className={`flex items-center justify-between p-3 border-b ${isLight ? 'border-zinc-300 bg-white' : 'border-[var(--border)] bg-[var(--surface-2)]'}`}>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-sm bg-[var(--surface-3)] border border-[var(--border)] text-[11px] font-mono font-bold tracking-widest text-[var(--accent-color)] uppercase shadow-inner">
            <Activity className="w-3 h-3 inline-block mr-1.5 mb-0.5" />
            LIVE TERMINAL FLOW
          </div>
          <span className="text-[10px] font-bold font-mono text-[var(--text-tertiary)] uppercase tracking-widest px-2">{ticker} // DYNAMIC LADDER</span>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 border border-[var(--border)] bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[10px] font-bold font-mono tracking-widest rounded transition-colors text-[var(--text-secondary)] flex items-center gap-1">
            <LayoutGrid className="w-3 h-3" />
            MATRIX
          </button>
          <button className="px-3 py-1 border border-[var(--border)] bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[10px] font-bold font-mono tracking-widest rounded transition-colors text-[var(--text-secondary)] flex items-center gap-1">
            <Maximize2 className="w-3 h-3" />
            FULLSCREEN
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 h-full w-full overflow-hidden">

        {/* LEFT PANE: CHARTING */}
        <div className={`flex-1 relative flex flex-col ${isLight ? 'border-r border-zinc-300' : 'border-r border-[var(--border)]'}`}>
          <div className="absolute top-2 left-2 z-10 flex gap-2">
             <div className="px-2 py-1 bg-[var(--surface)]/80 border border-[var(--border)] backdrop-blur-sm rounded text-[10px] font-black font-mono text-[var(--text-secondary)] tracking-wider tabular-nums">
               {profile.expectedMovePct != null ? `EXPECTED MOVE: ${(profile.expectedMovePct * 100).toFixed(2)}%` : 'INTRA-DAY FLOW'}
             </div>
             <div className="px-2 py-1 bg-[var(--surface)]/80 border border-[var(--border)] backdrop-blur-sm rounded text-[10px] font-black font-mono text-[var(--text-tertiary)] tracking-wider flex items-center gap-1">
               <Zap className="w-2.5 h-2.5 fill-current" />
               EXPOSURE LADDER
             </div>
          </div>
          
          <div className="w-full h-full min-h-[500px]">
            {/* Custom canvas candle chart (no third-party charting lib): our own candles from
                the live store stream, tested indicators, and GEX dealer levels aligned to the
                ladder on the right — with displacement bursts flagged when they hit a level. */}
            <SlayerChart profile={profile} decimals={decimals} />
          </div>
        </div>

        {/* RIGHT PANE: LADDER / DEALER MAP */}
        <div className="w-full lg:w-[500px] shrink-0 bg-[var(--surface)] flex flex-col border-l border-[var(--border)] overflow-hidden relative">

           {/* Ladder Controls */}
           <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] flex justify-between items-center z-10 shrink-0">
             <div className="text-[10px] font-mono font-bold text-[var(--text-secondary)]">LADDER</div>
             <div className="flex bg-[var(--surface-2)] border border-[var(--border)] rounded p-[2px]">
               <button
                 onClick={() => setActiveLadder('30')}
                 className={`px-3 py-0.5 text-[10px] font-black tracking-widest rounded ${activeLadder === '30' ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                 30 + SPOT
               </button>
               <button
                 onClick={() => setActiveLadder('ALL')}
                 className={`px-3 py-0.5 text-[10px] font-black tracking-widest rounded ${activeLadder === 'ALL' ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                 ALL
               </button>
             </div>
           </div>

           {/* Ladder Column Headers (DEX dropped — non-actionable; GEX widened) */}
           <div className="grid grid-cols-[70px_1fr_1.4fr] gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-black font-mono tracking-widest text-[var(--text-tertiary)] shrink-0 uppercase">
             <div className="text-right pr-2 border-r border-[var(--border)]">STRIKE</div>
             <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">VOL (P)</span>
                <span className="text-[var(--text-secondary)]">VOL (C)</span>
             </div>
             <div className="flex justify-between border-l border-[var(--border)] pl-2">
                <span className="text-[var(--danger)]">GEX (P)</span>
                <span className="text-[var(--success)]">GEX (C)</span>
             </div>
           </div>

           {/* Ladder Matrix Scroll Area */}
           <div className="flex-1 overflow-y-auto python-scrollbar relative">
             <div className="flex flex-col py-2 min-h-full pb-10">
               {ladderData.map((row) => (
                 <div key={row.strike} className={`grid grid-cols-[70px_1fr_1.4fr] gap-2 px-3 h-[22px] items-center text-[10px] tabular-nums font-mono hover:bg-[var(--surface-2)] relative group ${row.isSpot ? 'bg-[var(--surface-3)] border-y border-[var(--border-strong)]' : ''}`}>

                    {row.isSpot && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-color)]" />
                    )}

                    {/* Strike Col */}
                    <div className="text-right pr-2 border-r border-[var(--border)] flex items-center justify-end gap-1">
                      {row.isCallWall && <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" title="Call Wall" />}
                      {row.isPutWall && <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" title="Put Wall" />}
                      {row.isFlip && <span className="w-1.5 h-1.5 rounded-sm bg-[var(--warning)]" title="Gamma Flip" />}
                      <span className={`font-black tracking-wider ${row.isSpot ? 'text-[var(--accent-color)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                        {row.strike.toFixed(decimals)}
                      </span>
                    </div>

                    {/* VOL Col (Split Put/Call) */}
                    <div className="flex items-center h-full relative border-r border-[var(--border)] pr-2">
                       <div className="w-1/2 h-full flex justify-end items-center pr-0.5 border-r border-dotted border-[var(--border)]">
                         <div className="h-[10px] bg-[var(--text-tertiary)]" style={{ width: `${Math.min(100, Math.max(0, row.putVolPct))}%` }} />
                       </div>
                       <div className="w-1/2 h-full flex justify-start items-center pl-0.5">
                         <div className="h-[10px] bg-[var(--text-secondary)]" style={{ width: `${Math.min(100, Math.max(0, row.callVolPct))}%` }} />
                       </div>
                    </div>

                    {/* GEX Col (widened) */}
                    <div className="flex items-center h-full relative pl-2">
                       <div className="w-1/2 h-full flex justify-end items-center pr-0.5 border-r border-dotted border-[var(--border)]">
                         <div className="h-[10px] bg-[var(--danger)]" style={{ width: `${Math.min(100, Math.max(0, row.putGexPct))}%` }} />
                       </div>
                       <div className="w-1/2 h-full flex justify-start items-center pl-0.5">
                         <div className="h-[10px] bg-[var(--success)]" style={{ width: `${Math.min(100, Math.max(0, row.callGexPct))}%` }} />
                       </div>
                    </div>
                 </div>
               ))}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
