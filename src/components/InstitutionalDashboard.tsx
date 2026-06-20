import React, { useState, useMemo } from 'react';
import { useContractStore } from '../lib/store';
import { 
  Building2, Crosshair, TrendingUp, TrendingDown, ShieldAlert,
  Magnet, Target, Activity, Zap, Layers, RefreshCw, Hexagon, Terminal
} from 'lucide-react';

export function InstitutionalDashboard() {
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const serverState = useContractStore(s => s.serverState);
  
  const ticker = selectedAsset.ticker || 'SPX';
  const profile = serverState?.gex_profile;
  const spot = profile?.spot || selectedAsset.defaultPrice || 5000;
  
  const [simulatorStrike, setSimulatorStrike] = useState(Math.round(spot / 25) * 25);
  
  // Simulated output matching the institutional needs
  const dealerBias = profile?.netGex >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA';
  
  return (
    <div className="w-full space-y-4 font-mono antialiased" id="institutional-dashboard-root">
      
      {/* 1. Market Regime & Dealer Behavior Engine */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* REPLICATING: Feature #1 & #5 Market Regime Engine + Dealer Behavior Engine */}
        <div className="bg-black/80 border border-black p-4 rounded-lg flex flex-col justify-between hover:border-zinc-800 transition-colors shadow-lg">
          <div className="flex justify-between items-center mb-3 border-b border-black/60 pb-2">
            <div className="flex items-center gap-2">
              <Hexagon className="w-4 h-4 text-sky-400" />
              <span className="text-[10px] font-black tracking-widest uppercase text-sky-400">DEALER BEHAVIOR ENGINE</span>
            </div>
            <span className="text-[8px] bg-black border border-sky-900/50 text-sky-500 px-1.5 py-0.5 rounded-sm">V11 CORE</span>
          </div>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[8px] text-zinc-500 tracking-wider">DEALER POSITIONING</span>
                <div className={`text-[12px] font-bold ${dealerBias === 'LONG GAMMA' ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>{dealerBias}</div>
              </div>
              <div>
                <span className="text-[8px] text-zinc-500 tracking-wider">CURRENT REGIME</span>
                <div className={`text-[12px] font-bold text-[#E5E5E5]`}>{dealerBias === 'LONG GAMMA' ? 'RANGE BOUND' : 'DYNAMIC INSTABILITY'}</div>
              </div>
            </div>
            
            <div className="bg-black/40 border border-black rounded-sm p-3 space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">Expected Behavior</span>
                <span className="text-[9px] text-[#4ADE80] font-black uppercase text-right leading-tight">
                  {dealerBias === 'LONG GAMMA' ? 'Buy dips\nSell rips' : 'Amplify moves\nSell into weakness'}
                </span>
              </div>
              <div className="h-px bg-black w-full" />
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-zinc-400 font-bold uppercase">Expected Range</span>
                <span className="text-[11px] font-mono text-[#E5E5E5] font-black uppercase">{(spot * 0.995).toFixed(0)} - {(spot * 1.005).toFixed(0)}</span>
              </div>
              <div className="h-px bg-black w-full" />
              <div className="grid grid-cols-2 gap-2 text-center pt-1.5">
                <div>
                  <div className="text-[15px] font-black text-sky-400">{dealerBias === 'LONG GAMMA' ? '82%' : '24%'}</div>
                  <div className="text-[7.5px] text-zinc-500 uppercase tracking-widest mt-0.5">Prob. Mean Reversion</div>
                </div>
                <div>
                  <div className="text-[15px] font-black text-[#F87171]">{dealerBias === 'LONG GAMMA' ? '18%' : '76%'}</div>
                  <div className="text-[7.5px] text-zinc-500 uppercase tracking-widest mt-0.5">Prob. Trend Day</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* REPLICATING: Feature #3 Forced Hedging Detector */}
        <div className="bg-black/80 border border-black p-4 rounded-lg flex flex-col justify-between hover:border-zinc-800 transition-colors shadow-lg">
          <div className="flex justify-between items-center mb-3 border-b border-black/60 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-500" />
              <span className="text-[10px] font-black tracking-widest uppercase text-amber-500">FORCED HEDGING DETECTOR</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <div>
              <span className="text-[8px] text-zinc-500 tracking-wider">LATEST ANOMALY</span>
              <div className="text-[12px] font-bold text-[#E5E5E5]">Institution bought OTM calls</div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/40 border border-black p-2 rounded-sm text-center">
                <span className="text-[8px] text-zinc-500 uppercase block mb-1">DEALER DELTA</span>
                <span className="text-[11px] font-mono font-bold text-[#F87171]">-15.4M</span>
              </div>
              <div className="bg-black/40 border border-black p-2 rounded-sm text-center">
                <span className="text-[8px] text-zinc-500 uppercase block mb-1">REQUIRED HEDGE</span>
                <span className="text-[11px] font-mono font-bold text-[#4ADE80]">+245,600 shrs</span>
              </div>
            </div>
            
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-sm p-3 mt-1 flex justify-between items-center">
              <div>
                <span className="text-[8px] text-amber-400/70 font-black tracking-widest uppercase block mb-0.5">POTENTIAL PRICE IMPACT</span>
                <span className="text-[14px] text-amber-400 font-black uppercase">HIGH SEVERITY</span>
              </div>
              <Activity className="w-6 h-6 text-amber-500 shadow-amber-500/50 animate-pulse" />
            </div>
          </div>
        </div>

        {/* REPLICATING: Feature #6 Liquidity Magnet & Feature #7 Dealer Stress */}
        <div className="flex flex-col gap-3 h-full">
          {/* Liquidity Magnet */}
          <div className="bg-black/80 border border-black p-3.5 rounded-lg flex-1 shadow-lg flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2 border-b border-black/60 pb-1.5">
              <span className="text-[9px] font-black tracking-widest uppercase text-sky-400 flex items-center gap-1.5"><Magnet className="w-3.5 h-3.5" /> LIQUIDITY MAGNET</span>
            </div>
            <div className="flex items-center justify-between px-2 pt-1">
              <div>
                <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Most Likely Closing Price</span>
                <span className="text-[18px] font-mono font-black text-sky-400">{(profile?.magnet || spot).toFixed(0)}</span>
              </div>
              <div className="text-right">
                <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Pull Strength</span>
                <span className="text-[12px] font-bold text-[#E5E5E5]">91% Pin Prob.</span>
              </div>
            </div>
          </div>
          
          {/* Dealer Stress Meter */}
          <div className="bg-black/80 border border-black p-3.5 rounded-lg flex-1 shadow-lg flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2 border-b border-black/60 pb-1.5">
              <span className="text-[9px] font-black tracking-widest uppercase text-rose-500 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> DEALER STRESS METER</span>
            </div>
            <div className="flex items-center justify-between px-2 mt-1">
              <div>
                <span className="text-[18px] font-black uppercase tracking-tight text-rose-500">EXTREME</span>
                <span className="text-[8px] text-zinc-400 font-medium block mt-0.5 tracking-wider">Potential Volatility Event imminent.</span>
              </div>
              <div className="w-10 h-10 rounded-full border-[3px] border-rose-500 border-t-rose-900 border-l-rose-800 animate-[spin_1.5s_linear_infinite]" />
            </div>
          </div>
        </div>
        
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* REPLICATING: Feature #2 Strike Accumulation Engine */}
        <div className="bg-[#0a0a0c] border border-black p-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-black/60 pb-2">
            <TrendingUp className="w-4 h-4 text-[#4ADE80]" />
            <span className="text-[10px] font-black tracking-widest uppercase text-[#4ADE80]">STRIKE ACCUMULATION ENGINE</span>
          </div>
          
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-black/40 border border-black p-2 rounded-sm text-center">
              <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">TARGET STRIKE</span>
              <span className="text-[12px] font-mono font-bold text-[#E5E5E5]">{simulatorStrike} C</span>
            </div>
            <div className="bg-black/40 border border-black p-2 rounded-sm text-center">
              <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">ACCUMULATION (24H)</span>
              <span className="text-[12px] font-mono font-bold text-[#4ADE80]">+9,450 CTs</span>
            </div>
            <div className="bg-black/40 border border-black p-2 rounded-sm text-center">
              <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">VELOCITY</span>
              <span className="text-[12px] font-mono font-bold text-amber-400">145 ct/min</span>
            </div>
          </div>
          
          <div className="space-y-1.5">
            <span className="text-[8.5px] text-zinc-500 uppercase font-black tracking-widest block mb-2 px-1">FASTEST GROWING STRIKES</span>
            {[
              { s: simulatorStrike, g: '+9,450', r: '145 ct/min', c: 'CALL' },
              { s: simulatorStrike + 25, g: '+6,200', r: '82 ct/min', c: 'CALL' },
              { s: simulatorStrike - 25, g: '+4,150', r: '45 ct/min', c: 'PUT' },
            ].map((st, i) => (
              <div key={i} className="flex justify-between items-center bg-black/40 border border-black/60 rounded-sm p-2.5 cursor-default hover:border-black transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-zinc-600">#{i + 1}</span>
                  <span className={`text-[12px] font-black font-mono ${st.c === 'CALL' ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>{st.s} {st.c}</span>
                </div>
                <div className="flex gap-4 text-right">
                  <span className="text-[11px] font-mono text-[#E5E5E5] font-medium tracking-wide">{st.g}</span>
                  <span className="text-[11px] font-mono text-amber-400 w-16">{st.r}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* REPLICATING: Feature #8 Position Simulator */}
        <div className="bg-[#0a0a0c] border border-black p-4 rounded-lg flex flex-col shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-black/60 pb-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-black tracking-widest uppercase text-indigo-400">INSTITUTIONAL POSITION SIMULATOR</span>
          </div>
          
          <div className="flex items-center justify-between bg-black/40 border border-black rounded-sm p-3 mb-4">
            <span className="text-[10px] font-bold text-zinc-400 uppercase">Selected Asset</span>
            <div className="flex items-center gap-2 text-[#E5E5E5] font-mono text-[12px] font-black bg-black px-3 py-1 rounded border border-black">
              {ticker} {simulatorStrike} CALL
            </div>
          </div>
          
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            <div className="flex justify-between items-center bg-black/40 border border-black p-3.5 rounded-sm relative overflow-hidden group hover:border-zinc-800 transition-colors">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4ADE80]" />
              <div className="pl-2">
                <span className="text-[11px] font-bold text-zinc-200 block tracking-wide">If {ticker} Moves +10 points</span>
                <span className="text-[8.5px] text-zinc-500 uppercase font-bold tracking-wider mt-0.5 block">Gamma Acceleration</span>
              </div>
              <div className="text-right">
                <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest block mb-0.5">Expected Premium</span>
                <span className="text-[15px] font-mono font-black text-[#4ADE80]">$14.50</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center bg-black/40 border border-black p-3.5 rounded-sm relative overflow-hidden group hover:border-zinc-800 transition-colors">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
              <div className="pl-2">
                <span className="text-[11px] font-bold text-zinc-200 block tracking-wide">If IV Drops 5%</span>
                <span className="text-[8.5px] text-zinc-500 uppercase font-bold tracking-wider mt-0.5 block">Volatility Crush</span>
              </div>
              <div className="text-right">
                <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest block mb-0.5">Expected Premium</span>
                <span className="text-[15px] font-mono font-black text-amber-500">$11.20</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center bg-black/40 border border-black p-3.5 rounded-sm relative overflow-hidden group hover:border-zinc-800 transition-colors">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-fuchsia-500" />
              <div className="pl-2">
                <span className="text-[11px] font-bold text-zinc-200 block tracking-wide">If Dealer Hedge Accelerates</span>
                <span className="text-[8.5px] text-zinc-500 uppercase font-bold tracking-wider mt-0.5 block">Forced Buying Delta</span>
              </div>
              <div className="text-right">
                <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest block mb-0.5">Expected Premium</span>
                <span className="text-[15px] font-mono font-black text-fuchsia-500">$18.70</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* REPLICATING: Feature #4 Catalyst Engine, Feature #9 Institutional Dashboard & Feature #10 AI Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* REPLICATING: Feature #4 Catalyst Engine */}
        <div className="bg-[#0a0a0c] border border-black p-4 rounded-lg flex flex-col shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-black/60 pb-2">
            <Activity className="w-4 h-4 text-orange-500" />
            <span className="text-[10px] font-black tracking-widest uppercase text-orange-500">CATALYST ENGINE</span>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <div className="bg-black/40 border border-black p-3 rounded-sm space-y-3">
              <div>
                <span className="text-[8.5px] text-zinc-500 uppercase font-black tracking-widest block mb-0.5">Top Catalyst</span>
                <span className="text-[12px] font-bold text-[#E5E5E5] leading-snug">Price Target Raised</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Bullishness</span>
                  <span className="text-[14px] font-black text-[#4ADE80]">7/10</span>
                </div>
                <div>
                  <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Dealer Impact</span>
                  <span className="text-[14px] font-black text-orange-500">2/10</span>
                </div>
              </div>

              <div className="bg-black border border-black p-2 mt-1 rounded text-center">
                <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Expected Move</span>
                <span className="text-[12px] font-bold text-zinc-300">SMALL</span>
              </div>
            </div>

            <div className="bg-black/40 border border-black p-3 rounded-sm space-y-3">
              <div>
                <span className="text-[8.5px] text-zinc-500 uppercase font-black tracking-widest block mb-0.5">Secondary Catalyst</span>
                <span className="text-[12px] font-bold text-[#E5E5E5] leading-snug">Production Numbers</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Bullishness</span>
                  <span className="text-[14px] font-black text-[#4ADE80]">7/10</span>
                </div>
                <div>
                  <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Dealer Impact</span>
                  <span className="text-[14px] font-black text-[#F87171]">9/10</span>
                </div>
              </div>

              <div className="bg-rose-950/20 border border-rose-900/30 p-2 mt-1 rounded text-center">
                <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Expected Move</span>
                <span className="text-[12px] font-black text-rose-500">LARGE</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Institutional Raw Metrics (2 cols wide) */}
        <div className="lg:col-span-2 bg-[#0a0a0c] border border-black p-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-black/60 pb-2">
            <Terminal className="w-4 h-4 text-zinc-400" />
            <span className="text-[10px] font-black tracking-widest uppercase text-zinc-300">RAW INSTITUTIONAL EXPOSURES</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {/* Real derived numbers mixed with mocked representation for UI */}
            <MetricBox label="Gamma Exposure" value={profile?.netGex ? (profile.netGex / 1e9).toFixed(2) + "B" : "1.23B"} color={profile?.netGex >= 0 ? "text-[#4ADE80]" : "text-[#F87171]"} />
            <MetricBox label="Vanna Exposure" value="-124.5M" color="text-amber-400" />
            <MetricBox label="Charm Exposure" value="-42.1M" color="text-[#F87171]" />
            <MetricBox label="Color Exposure" value="+1.2M" color="text-sky-400" />
            <MetricBox label="Vomma Exposure" value="842K" color="text-fuchsia-400" />
            <MetricBox label="Volga Exposure" value="-312K" color="text-rose-400" />
            <MetricBox label="Dealer Inventory" value={dealerBias === 'LONG GAMMA' ? 'LONG' : 'SHORT'} color={dealerBias === 'LONG GAMMA' ? 'text-[#4ADE80]' : 'text-rose-500'} />
            <MetricBox label="Dealer Flip Level" value={profile?.gammaFlip?.toFixed(0) || "N/A"} color="text-[#E5E5E5]" />
            <MetricBox label="Dealer Pressure" value={dealerBias === 'LONG GAMMA' ? 'BUYING DIPS' : 'SELLING RALLIES'} color={dealerBias === 'LONG GAMMA' ? 'text-[#4ADE80]' : 'text-amber-500'} />
          </div>
        </div>

        {/* Feature #10 Slayer AI (Market Engine) */}
        <div className="bg-[#050510] border border-indigo-900/50 p-4 rounded-lg relative overflow-hidden flex flex-col shadow-lg">
          <div className="absolute inset-0 bg-indigo-900/10 pointer-events-none" />
          <div className="absolute right-0 top-0 opacity-10 pointer-events-none">
            <Zap className="w-48 h-48 text-indigo-500 -translate-y-12 translate-x-12" />
          </div>
          <div className="flex items-center justify-between mb-4 border-b border-indigo-900/40 pb-2 z-10">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] font-black tracking-widest uppercase text-indigo-400">SLAYER MARKET ENGINE</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse" />
          </div>
          
          <div className="flex-1 flex flex-col gap-3 rounded-md z-10">
            <div className="bg-indigo-950/30 border border-indigo-500/20 p-3 rounded text-indigo-200 text-[11.5px] font-medium leading-relaxed tracking-wide">
              <span className="font-black text-indigo-400 mr-2 uppercase tracking-widest border border-indigo-400/30 px-1 py-0.5 rounded-xs text-[9px]">QUERY</span> 
              Why is {ticker} dropping right now?
            </div>
            
            <div className="flex-1 bg-black/80 border border-indigo-950/60 p-3.5 rounded flex flex-col gap-3">
              <div>
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block mb-1">Primary Cause</span>
                <span className="text-[#F87171] font-bold text-[12px]">Negative Charm (-$42.1M/day)</span>
              </div>
              <div className="h-px bg-indigo-950/50" />
              <div>
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block mb-1">Secondary Cause</span>
                <span className="text-amber-500 font-bold text-[12px]">Dealers unwinding long gamma hedges into the drop</span>
              </div>
              <div className="h-px bg-indigo-950/50" />
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block mb-1">Impact</span>
                  <span className="text-rose-500 font-extrabold text-[14px]">HIGH</span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block mb-1">Target</span>
                  <span className="text-[#E5E5E5] font-black font-mono text-[14px]">{(spot * 0.985).toFixed(0)}</span>
                </div>
              </div>
              <div className="pt-2 mt-auto">
                <div className="flex justify-between items-end mb-1">
                  <span className="text-[8.5px] text-zinc-400 uppercase tracking-widest font-bold">Expected Continuation</span>
                  <span className="text-[11px] text-[#F87171] font-black">68%</span>
                </div>
                <div className="w-full bg-black border border-black/80 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 w-[68%]" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
      
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="bg-black/40 border border-black rounded-sm p-3 hover:bg-black/60 transition-colors flex flex-col justify-center">
      <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest block mb-1.5">{label}</span>
      <span className={`text-[15px] font-mono font-bold tracking-tight ${color}`}>{value}</span>
    </div>
  );
}
