import { useMemo } from 'react';
import { GexProfileData } from '../types';
import { Target, Activity, Zap } from 'lucide-react';

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
    <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4 pb-3 border-b border-[var(--border)]">
         <div>
           <h2 className="text-[12px] font-black tracking-widest text-[var(--text-primary)] uppercase flex items-center gap-2">
             <Target className="w-4 h-4 text-[#4ADE80]" />
             Key Intraday Strikes
           </h2>
           <p className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest mt-1">
             High-OI strikes where dealer hedging creates strong price magnets
           </p>
         </div>
         <div className="bg-[var(--surface-2)] border border-[var(--border)] px-3.5 py-2 rounded-md flex items-center gap-3 shrink-0">
           <span className="text-[9px] text-[var(--text-tertiary)] uppercase font-black tracking-widest flex items-center gap-1.5">
             <Activity className="w-3 h-3 text-[#60A5FA]" /> Active Spot
           </span>
           <span className="text-[13px] font-mono font-bold text-[var(--text-primary)]">${spot.toFixed(decimals)}</span>
         </div>
      </div>

      {targets.length === 0 ? (
        <div className="py-16 text-center bg-[var(--surface-2)] border border-[var(--border)] rounded-lg flex flex-col items-center justify-center">
          <Activity className="w-8 h-8 text-[var(--text-tertiary)] animate-pulse mb-3" />
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-black">No Key Strikes Detected</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {targets.map((t, idx) => {
            const isDominantCall = t.isCallTarget;
            const distancePct = Math.abs(t.strike - spot) / spot;
            
            let status = 'HOLDING';
            let statusColorClass = 'status-holding';

            if (distancePct < 0.002) {
              status = 'TESTING';
              statusColorClass = 'status-testing';
            } else if ((isDominantCall && spot > t.strike) || (!isDominantCall && spot < t.strike)) {
              status = 'FAILING';
              statusColorClass = 'status-failing';
            } else {
              status = 'HOLDING';
              statusColorClass = 'status-holding';
            }

            const rawCall = Math.abs(t.callGex || 0);
            const rawPut = Math.abs(t.putGex || 0);
            const totalWidth = rawCall + rawPut;
            const callPct = totalWidth > 0 ? (rawCall / totalWidth) * 100 : 0;
            const putPct = totalWidth > 0 ? (rawPut / totalWidth) * 100 : 0;

            const accent = isDominantCall ? '#4ADE80' : '#F87171';

            return (
              <div key={t.strike} className="bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden relative rounded-lg">
                {/* Top thin accent line */}
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} />

                <div className="p-4 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-[17px] font-mono font-black text-[var(--text-primary)] relative inline-block">
                        ${t.strike.toFixed(decimals)}
                        {idx === 0 && <span className="absolute -top-1 -right-3 w-2 h-2 bg-[#FBBF24] rounded-full" />}
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)] mt-0.5">
                        {t.distanceBps.toFixed(0)} bps {t.isAboveSpot ? 'Above Spot' : 'Below Spot'}
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-[var(--border)] ${statusColorClass}`}>
                       {status}
                    </div>
                  </div>

                  <div className="mb-4 flex-1">
                     <span className="text-[9.5px] uppercase font-black tracking-widest inline-flex items-center gap-1.5 bg-[var(--surface-3)] border border-[var(--border)] px-2.5 py-1.5 rounded-md" style={{ color: accent }}>
                       {isDominantCall ? 'Call Resistance / Upside Target' : 'Put Support / Downside Floor'}
                     </span>
                  </div>

                  {/* Micro-meter for Call vs Put Distribution */}
                  <div className="space-y-2 mb-4 bg-[var(--surface-3)] border border-[var(--border)] p-2.5 rounded-md">
                    <div className="flex justify-between text-[9px] font-mono text-[var(--text-tertiary)] uppercase font-bold">
                       <span>Call Vol</span>
                       <span>Put Vol</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--surface)] rounded-full overflow-hidden flex">
                       <div style={{width: `${callPct}%`}} className="h-full bg-[#4ADE80]" />
                       <div style={{width: `${putPct}%`}} className="h-full bg-[#F87171]" />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono font-black">
                       <span className="text-[#4ADE80]">{rawCall >= 1e9 ? fmtBn(rawCall) : fmtMn(rawCall)}</span>
                       <span className="text-[#F87171]">{rawPut >= 1e9 ? fmtBn(rawPut) : fmtMn(rawPut)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto bg-[var(--surface-3)] border border-[var(--border)] rounded-md p-2">
                     <span className="text-[9px] font-black uppercase text-[var(--text-tertiary)] tracking-widest flex items-center gap-1.5">
                        <Zap className="w-3 h-3" /> Net GEX
                     </span>
                     <span className={`text-[12px] font-mono font-black ${t.netGex > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                        {t.netGex >= 1e9 || t.netGex <= -1e9 ? fmtBn(t.netGex) : fmtMn(t.netGex)}
                     </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
