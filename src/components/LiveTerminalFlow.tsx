import { useMemo, useState } from 'react';
import { GexProfileData } from '../types';
import { useContractStore } from '../lib/store';
import { InteractiveChart } from './InteractiveChart';
import { Activity, LayoutGrid, Maximize2, Shield, Zap } from 'lucide-react';

interface LiveTerminalFlowProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}

export function LiveTerminalFlow({ profile, ticker, decimals }: LiveTerminalFlowProps) {
  const { themeMode } = useContractStore();
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
    const maxDex = Math.max(...strikes.map(s => Math.max(Math.abs(s.callDex || 0), Math.abs(s.putDex || 0))), 1);

    return strikes
      .sort((a, b) => b.strike - a.strike) // descending order
      .map(s => {
         const callVolPct = (s.callVolume / maxVol) * 100;
         const putVolPct = (s.putVolume / maxVol) * 100;

         const callGexPct = (s.callGex / maxGex) * 100;
         const putGexPct = (Math.abs(s.putGex) / maxGex) * 100;

         const callDexPct = (s.callDex / maxDex) * 100;
         const putDexPct = (Math.abs(s.putDex) / maxDex) * 100;

         return {
           strike: s.strike,
           isSpot: Math.abs(s.strike - profile.spot) < 0.001,
           isFlip: s.strike === profile.gammaFlip,
           isCallWall: s.strike === profile.callWall,
           isPutWall: s.strike === profile.putWall,
           
           callVolPct, putVolPct,
           callGexPct, putGexPct,
           callDexPct, putDexPct,
         };
      });
  }, [profile, activeLadder]);

  return (
    <div className={`w-full flex flex-col h-auto ${isLight ? 'bg-zinc-100 text-zinc-900' : 'bg-[#050505] text-zinc-300'}`} style={{ minHeight: '800px' }}>
      
      {/* HUD Header */}
      <div className={`flex items-center justify-between p-3 border-b ${isLight ? 'border-zinc-300 bg-white' : 'border-zinc-800/80 bg-[#090909]'}`}>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-sm bg-zinc-900 border border-zinc-800 text-[11px] font-mono font-bold tracking-widest text-[#06B6D4] uppercase shadow-inner">
            <Activity className="w-3 h-3 inline-block mr-1.5 mb-0.5" />
            LIVE TERMINAL FLOW
          </div>
          <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest px-2">{ticker} // DYNAMIC LADDER</span>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-[9px] font-bold font-mono tracking-widest rounded transition-colors text-zinc-300 flex items-center gap-1">
            <LayoutGrid className="w-3 h-3" />
            MATRIX
          </button>
          <button className="px-3 py-1 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-[9px] font-bold font-mono tracking-widest rounded transition-colors text-zinc-300 flex items-center gap-1">
            <Maximize2 className="w-3 h-3" />
            FULLSCREEN
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 h-full w-full overflow-hidden">
        
        {/* LEFT PANE: CHARTING */}
        <div className={`flex-1 relative flex flex-col ${isLight ? 'border-r border-zinc-300' : 'border-r border-zinc-800/80'}`}>
          <div className="absolute top-2 left-2 z-10 flex gap-2">
             <div className="px-2 py-1 bg-black/60 border border-zinc-700 backdrop-blur-sm rounded text-[9px] font-black font-mono text-zinc-300 tracking-wider">
               {profile.expectedMovePct ? `EXPECTED MOVE: ${(profile.expectedMovePct * 100).toFixed(2)}%` : 'INTRA-DAY FLOW'}
             </div>
             <div className="px-2 py-1 bg-black/60 border border-zinc-700 backdrop-blur-sm rounded text-[9px] font-black font-mono text-[#FBBF24] tracking-wider flex items-center gap-1">
               <Zap className="w-2.5 h-2.5 fill-current" />
               VOLATILITY REGIME: ACTIVE
             </div>
          </div>
          
          <div className="w-full h-full min-h-[500px]">
            {/* 
              We want to render a large chart here.
              We can use the InteractiveChart with empty data arrays or pass the serverState if available.
              Since we don't have serverState in props, we'll provide an empty placeholder that mimics the chart,
              or we just use the chart component with dummy data if we don't have real candles.
              In this case, a simulated interactive terminal window fits perfectly. 
            */}
            <div className="w-full h-full relative" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(30,30,40,0.5) 0%, transparent 70%)'}}>
               {/* Terminal Grid Background */}
               <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgwem0zOSAzOVYxaC0zOHYzOHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA0KSIvPjwvc3ZnPg==')] opacity-60" />
               
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <Shield className="w-16 h-16 text-zinc-800/50 mb-4" />
                 <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-600">ADVANCED PRICE ACTION OVERLAY</span>
                 <span className="text-[9px] font-mono text-zinc-700 mt-2">WAITING FOR TAPE STREAM...</span>
               </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: LADDER / DEALER MAP */}
        <div className="w-full lg:w-[500px] shrink-0 bg-[#0A0A0A] flex flex-col border-l border-black overflow-hidden relative">
           
           {/* Ladder Controls */}
           <div className="px-3 py-2 border-b border-zinc-800/80 bg-black/40 flex justify-between items-center z-10 shrink-0">
             <div className="text-[10px] font-mono font-bold text-zinc-400">LADDER</div>
             <div className="flex bg-zinc-900 border border-zinc-800 rounded p-[2px]">
               <button 
                 onClick={() => setActiveLadder('30')}
                 className={`px-3 py-0.5 text-[9px] font-black tracking-widest rounded ${activeLadder === '30' ? 'bg-zinc-700/50 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                 30 + SPOT
               </button>
               <button 
                 onClick={() => setActiveLadder('ALL')}
                 className={`px-3 py-0.5 text-[9px] font-black tracking-widest rounded ${activeLadder === 'ALL' ? 'bg-zinc-700/50 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                 ALL
               </button>
             </div>
           </div>

           {/* Ladder Column Headers */}
           <div className="grid grid-cols-[70px_1fr_1fr_1fr] gap-2 px-3 py-1.5 border-b border-zinc-800/60 bg-[#050505] text-[9px] font-black font-mono tracking-widest text-zinc-500 shrink-0 uppercase">
             <div className="text-right pr-2 border-r border-zinc-800/50">STRIKE</div>
             <div className="flex justify-between">
                <span className="text-zinc-600">VOL (P)</span>
                <span className="text-zinc-400">VOL (C)</span>
             </div>
             <div className="flex justify-between border-l border-zinc-800/50 pl-2">
                <span className="text-rose-500/50">GEX (P)</span>
                <span className="text-emerald-500/50">GEX (C)</span>
             </div>
             <div className="flex justify-between border-l border-zinc-800/50 pl-2">
                <span className="text-red-500/30">DEX (P)</span>
                <span className="text-blue-500/30">DEX (C)</span>
             </div>
           </div>

           {/* Ladder Matrix Scroll Area */}
           <div className="flex-1 overflow-y-auto python-scrollbar relative">
             <div className="flex flex-col py-2 min-h-full pb-10">
               {ladderData.map((row) => (
                 <div key={row.strike} className={`grid grid-cols-[70px_1fr_1fr_1fr] gap-2 px-3 h-[18px] items-center text-[10px] tabular-nums font-mono hover:bg-zinc-900/40 relative group ${row.isSpot ? 'bg-zinc-900/80 border-y border-zinc-700/50' : ''}`}>
                    
                    {row.isSpot && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#06B6D4]" />
                    )}

                    {/* Strike Col */}
                    <div className="text-right pr-2 border-r border-zinc-800/50 flex items-center justify-end gap-1">
                      {row.isCallWall && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Call Wall" />}
                      {row.isPutWall && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Put Wall" />}
                      {row.isFlip && <span className="w-1.5 h-1.5 rounded-sm bg-amber-500" title="Gamma Flip" />}
                      <span className={`font-black tracking-wider ${row.isSpot ? 'text-[#06B6D4]' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                        {row.strike.toFixed(decimals)}
                      </span>
                    </div>

                    {/* VOL Col (Split Bull/Bear) */}
                    <div className="flex items-center h-full relative border-r border-zinc-800/30 pr-2">
                       <div className="w-1/2 h-full flex justify-end items-center pr-0.5 border-r border-dotted border-zinc-800">
                         <div className="h-[7px] bg-zinc-600" style={{ width: `${Math.min(100, Math.max(0, row.putVolPct))}%` }} />
                       </div>
                       <div className="w-1/2 h-full flex justify-start items-center pl-0.5">
                         <div className="h-[7px] bg-zinc-400" style={{ width: `${Math.min(100, Math.max(0, row.callVolPct))}%` }} />
                       </div>
                    </div>

                    {/* GEX Col */}
                    <div className="flex items-center h-full relative pl-2 border-r border-zinc-800/30 pr-2">
                       <div className="w-1/2 h-full flex justify-end items-center pr-0.5 border-r border-dotted border-zinc-800">
                         <div className="h-[7px] bg-rose-500" style={{ width: `${Math.min(100, Math.max(0, row.putGexPct))}%` }} />
                       </div>
                       <div className="w-1/2 h-full flex justify-start items-center pl-0.5">
                         <div className="h-[7px] bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, row.callGexPct))}%` }} />
                       </div>
                    </div>

                    {/* DEX Col */}
                    <div className="flex items-center h-full relative pl-2">
                       <div className="w-1/2 h-full flex justify-end items-center pr-0.5 border-r border-dotted border-zinc-800">
                         <div className="h-[7px] bg-red-500/50" style={{ width: `${Math.min(100, Math.max(0, row.putDexPct))}%` }} />
                       </div>
                       <div className="w-1/2 h-full flex justify-start items-center pl-0.5">
                         <div className="h-[7px] bg-blue-500/50" style={{ width: `${Math.min(100, Math.max(0, row.callDexPct))}%` }} />
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
