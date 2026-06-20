import { useMemo } from 'react';
import { GexProfileData } from '../types';
import { Target, Activity, Zap, Layers } from 'lucide-react';

interface IntradayTargetsViewProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}

export function IntradayTargetsView({ profile, ticker, decimals }: IntradayTargetsViewProps) {
  const spot = profile?.spot || 0;
  
  // Find interesting strikes: near money, high GEX, directional clues
  const targets = useMemo(() => {
    if (!profile?.strikes || !spot) return [];

    // Determine bounds
    const strikes = profile.strikes;
    const distanceThreshold = spot * 0.05; // 5% away from spot max
    
    const candidates = strikes.filter(s => Math.abs(s.strike - spot) <= distanceThreshold);
    
    // Score them
    const scored = candidates.map(s => {
      const gexScore = Math.abs(s.netGex);
      const callDominant = s.callGex > Math.abs(s.putGex);
      const isCallTarget = callDominant; 
      
      const distance = Math.abs(s.strike - spot);
      const proxScore = distance === 0 ? 1 : 1 / (distance / spot);
      
      // Calculate a heuristic score from 0-100 range roughly
      const scoreRaw = (gexScore / 1e9) * 3 + (proxScore) * 0.5;
      const totalScore = Math.min(Math.max(scoreRaw * 10, 0), 99);
      
      return {
        ...s,
        totalScore,
        isCallTarget,
        distanceBps: (distance / spot) * 10000,
        isAboveSpot: s.strike > spot
      };
    });
    
    return scored.sort((a, b) => b.totalScore - a.totalScore).slice(0, 12);
  }, [profile?.strikes, spot]);

  const fmtBn = (v: number) => `$${Math.abs(v / 1e9).toFixed(2)}B`;
  const fmtMn = (v: number) => `$${Math.abs(v / 1e6).toFixed(0)}M`;
  
  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
         <div>
           <h2 className="text-[13px] font-black tracking-widest text-[#e4e4e7] uppercase flex items-center gap-2">
             <Target className="w-4 h-4 text-[#4ADE80]" />
             Strategic Intraday Nodes
           </h2>
           <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">
             Algorithmic isolation of high-magnetism strikes based on order flow & dealer repositioning.
           </p>
         </div>
         <div className="bg-black border border-black px-3.5 py-2 rounded-lg flex items-center gap-3">
           <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest flex items-center gap-1.5">
             <Activity className="w-3 h-3 text-sky-500" /> Active Spot
           </span>
           <span className="text-[13px] font-mono font-bold text-[#E5E5E5]">${spot.toFixed(decimals)}</span>
         </div>
      </div>
      
      {targets.length === 0 ? (
        <div className="py-16 text-center bg-black/40 border border-black rounded-lg flex flex-col items-center justify-center">
          <Activity className="w-8 h-8 text-zinc-800 animate-pulse mb-3" />
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">No Convergence Nodes Detected</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {targets.map((t, idx) => {
            const isDominantCall = t.isCallTarget;
            const distancePct = Math.abs(t.strike - spot) / spot;
            
            let status = 'HOLDING';
            let statusColorClass = 'status-holding';
            let statusBgClass = '';

            if (distancePct < 0.002) {
              status = 'TESTING';
              statusColorClass = 'status-testing';
              statusBgClass = '';
            } else if ((isDominantCall && spot > t.strike) || (!isDominantCall && spot < t.strike)) {
              status = 'FAILING';
              statusColorClass = 'status-failing';
              statusBgClass = '';
            } else {
              status = 'HOLDING';
              statusColorClass = 'status-holding';
              statusBgClass = '';
            }

            const rawCall = Math.abs(t.callGex || 0);
            const rawPut = Math.abs(t.putGex || 0);
            const totalWidth = rawCall + rawPut;
            const callPct = totalWidth > 0 ? (rawCall / totalWidth) * 100 : 0;
            const putPct = totalWidth > 0 ? (rawPut / totalWidth) * 100 : 0;
            
            const accentColor = isDominantCall ? 'emerald' : 'rose';
            
            return (
              <div key={t.strike} className={`bg-black/90 border border-black overflow-hidden relative rounded-xl hover:border-${accentColor}-500/30 transition-all duration-300 group`}>
                {/* Top thin accent line */}
                <div className={`absolute top-0 left-0 right-0 h-[2px] ${isDominantCall ? 'bg-black/40 shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                
                <div className="p-4 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-[17px] font-mono font-black text-[#E5E5E5] relative inline-block drop-shadow-md">
                        ${t.strike.toFixed(decimals)}
                        {idx === 0 && <span className="absolute -top-1 -right-3 w-2 h-2 bg-amber-500 rounded-full border border-black" />}
                      </div>
                      <div className="text-[8.5px] font-black uppercase tracking-widest text-zinc-500 mt-0.5">
                        {t.distanceBps.toFixed(0)} bps {t.isAboveSpot ? 'Above Spot' : 'Below Spot'}
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${statusBgClass} ${statusColorClass}`}>
                       {status}
                    </div>
                  </div>

                  <div className="mb-5 flex-1">
                     <span className={`text-[9.5px] uppercase font-black tracking-widest flex items-center gap-1.5 bg-black border border-black px-2.5 py-1.5 rounded-md inline-flex ${isDominantCall ? 'text-[#4ADE80] border-black' : 'text-[#F87171] border-[#F87171]/50/40'}`}>
                       {isDominantCall ? 'Upside Gamma Target' : 'Downside Floor Zone'}
                     </span>
                  </div>

                  {/* Micro-meter for Call vs Put Distribution */}
                  <div className="space-y-2 mb-4 bg-black border border-black/60 p-2.5 rounded-lg">
                    <div className="flex justify-between text-[8px] font-mono text-zinc-500 uppercase font-bold">
                       <span>Call Vol</span>
                       <span>Put Vol</span>
                    </div>
                    <div className="h-1.5 w-full bg-black rounded-full overflow-hidden flex shadow-inner">
                       <div style={{width: `${callPct}%`}} className="h-full bg-black/40 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                       <div style={{width: `${putPct}%`}} className="h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                    </div>
                    <div className="flex justify-between text-[8.5px] font-mono font-black">
                       <span className="text-[#4ADE80]">{rawCall >= 1e9 ? fmtBn(rawCall) : fmtMn(rawCall)}</span>
                       <span className="text-[#F87171]">{rawPut >= 1e9 ? fmtBn(rawPut) : fmtMn(rawPut)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto bg-black/60 border border-black/80 rounded-md p-2 relative z-10 overflow-hidden">
                     <div className={`absolute inset-0 opacity-10 ${t.netGex > 0 ? 'bg-black/40' : 'bg-rose-500'}`} />
                     <span className="text-[8px] font-black uppercase text-zinc-400 tracking-widest flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-zinc-500" /> Net Delta Force
                     </span>
                     <span className={`text-[12px] font-mono font-black ${t.netGex > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                        {t.netGex >= 1e9 || t.netGex <= -1e9 ? fmtBn(t.netGex) : fmtMn(t.netGex)}
                     </span>
                  </div>
                </div>
                
                {/* Background resonance glow */}
                <div className={`absolute -bottom-6 -right-6 w-24 h-24 rounded-full blur-[32px] opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity duration-500 ${isDominantCall ? 'bg-black/40' : 'bg-rose-500'}`} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
