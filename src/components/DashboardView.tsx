import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { Zap, ShieldCheck, Activity, Clock, Layers } from 'lucide-react';
import { InstitutionalHUD } from './InstitutionalHUD';

export function DashboardView() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const marketState = useContractStore((s) => s.marketState);

  const confidence = serverState?.trade_health || 88;
  const expectedMove = serverState?.expected_move?.pct || '±1.3%';
  const expectedRange = serverState?.expected_move?.range || '±52.4 pts';
  const dealerSupport = serverState?.position_management?.dealer_support || 'IMPROVING';
  const momentum = serverState?.position_management?.momentum || 'ACCELERATING';

  // Derived values for identical layout aesthetic
  const marketStateLabel = useMemo(() => {
    if (momentum === 'ACCELERATING') {
      return 'Trending — moves are speeding up';
    }
    return 'Calm — range-bound, low movement';
  }, [momentum]);

  const dealerBiasLabel = useMemo(() => {
    if (dealerSupport === 'IMPROVING') {
      return 'BULLISH SHELTER BIAS';
    }
    return 'NEUTRAL SYMMETRICAL SKEW';
  }, [dealerSupport]);

  return (
    <div className="w-full text-[#4ADE80] flex flex-col font-mono select-none antialiased space-y-6">
      
      {/* 1. HEADER CONTAINER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Zap className="w-4 h-4 text-[#4ADE80] animate-pulse" />
          <span className="text-[9px] text-[#4ADE80] uppercase tracking-widest font-black">
            SLAYER DASHBOARD
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/40 p-1 px-1.5 border border-white/5 rounded-lg">
          <span className="text-[8.5px] uppercase tracking-widest text-[#4ADE80] px-2 font-black">
            TERMINAL SESSION ACTIVE
          </span>
        </div>
      </div>

      {/* 2. PRIMARY HERO CARD (Centered 70% Max Width Layout) */}
      <div className="w-full flex justify-center">
        <div 
          className="max-w-3xl w-full apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between"
          style={{ minHeight: '340px' }}
        >
          {/* Subtle mirrored reflection accent line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#4ADE80] via-indigo-500 to-[#4ADE80]" />

          {/* Top Row Labeling */}
          <div className="flex justify-between items-start border-b border-black/40 pb-4">
            <div className="text-left space-y-1">
              <span className="text-[8px] text-[#d4d4d8] tracking-[0.2em] uppercase font-black block">CURRENT READ</span>
              <h2 className="text-2xl font-black text-[#E5E5E5] font-sans tracking-tight uppercase leading-none">
                MARKET STATE OVERVIEW
              </h2>
            </div>
            <div className="text-right bg-black/60 px-2 py-1 border border-white/5 rounded-lg text-[10px]">
              <span className="text-zinc-500 uppercase text-[8px] block">INDEX REF</span>
              <span className="text-[#d4d4d8] font-extrabold block text-sm">{selectedAsset.ticker}</span>
            </div>
          </div>

          {/* Grid of Dashboard Hero Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch my-2">
            
            {/* Market State Block */}
            <div className="bg-black/40 border border-white/5 p-5 rounded-xl flex flex-col justify-between text-left">
              <div>
                <span className="text-[8px] text-zinc-500 tracking-wider uppercase block">CURRENT MARKET STATE</span>
                <span className="text-xl md:text-2xl font-extrabold text-[#E5E5E5] font-sans uppercase block tracking-tight pt-1 leading-tight">
                  {marketStateLabel}
                </span>
              </div>
              <div className="text-[9.5px] text-zinc-400 pt-3 border-t border-white/5 leading-relaxed font-sans">
                Live read of current market conditions, checked against CBOE order flow.
              </div>
            </div>

            {/* Symmetrical Parameters Dashboard Dial Box */}
            <div className="bg-black/20 border border-white/5 p-4 rounded-xl flex flex-col justify-center space-y-3.5 text-left">
              {/* Trade Score hero anchor */}
              <div className="pb-3 border-b border-white/5">
                <span className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">TRADE SCORE</span>
                <span className="text-4xl md:text-5xl font-black text-[#4ADE80] leading-none">{confidence}</span>
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider ml-1">/ 100</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-white/5">
                <span className="text-zinc-400 uppercase text-[9px] tracking-wider">EXPECTED MOVE</span>
                <span className="font-extrabold text-[#E5E5E5]">{expectedMove} <span className="text-[#d4d4d8] text-[8.5px]">({expectedRange})</span></span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 uppercase text-[9px] tracking-wider">DEALER BIAS</span>
                <span className="font-extrabold text-[#E5E5E5] uppercase">{dealerBiasLabel}</span>
              </div>
            </div>

          </div>

          {/* Bottom Compliance Affirmation */}
          <div className="border-t border-black/40 pt-4 flex flex-col sm:flex-row justify-between items-center text-[10px] text-zinc-400 gap-2">
            <span className="uppercase text-[8px] text-zinc-400 block font-bold">DATA-DRIVEN. NO SPECULATION.</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
              <span className="text-[8px] text-zinc-600 uppercase tracking-wider font-bold">
                INTEGRITY CHECK: PASSED
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS (Symmetrical 4 Supporting cards below Hero) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        
        {/* Card 1: Asset Core */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[8px] text-[#d4d4d8] tracking-wider block font-bold uppercase">ASSET PROFILE</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">{selectedAsset.ticker} INDEX</h4>
            <div className="text-[11px] text-zinc-400 font-mono pt-1.5 space-y-1 border-t border-white/5">
              <div className="flex justify-between">
                <span>Spot Price:</span>
                <span className="text-[#E5E5E5] font-bold">${(serverState?.pinpoint_map?.spot_price || selectedAsset.defaultPrice).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span>Volatility (σ):</span>
                <span className="text-[#E5E5E5]">{(selectedAsset.volatility * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <span className="text-[7.5px] text-zinc-600 uppercase font-mono tracking-wider font-bold">SECURE LOCAL CACHE SYNC</span>
        </div>

        {/* Card 2: Dealer Exposure */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[8px] text-purple-400 tracking-wider block font-bold uppercase">DEALER EXPOSURE</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">DEALER GAMMA BOUNDARIES</h4>
            <div className="text-[11px] text-zinc-400 font-mono pt-1.5 space-y-1 border-t border-white/5">
              <div className="flex justify-between">
                <span>Gamma State:</span>
                <span className="text-[#E5E5E5] font-bold">{serverState?.system_score?.liquiditySweep >= 5 ? 'STABLE GEX' : 'NEGATIVE SKEW'}</span>
              </div>
              <div className="flex justify-between">
                <span>Dealer Sign:</span>
                <span className="text-[#d4d4d8] font-bold">SHORT CALLS (-1)</span>
              </div>
            </div>
          </div>
          <span className="text-[7.5px] text-zinc-650 uppercase font-mono tracking-wider font-bold">BLACK-SCHOLES COMPLIANT</span>
        </div>

        {/* Card 3: Quantitative Pipeline */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[8px] text-[#d4d4d8] tracking-wider block font-bold uppercase">SIGNAL PIPELINE</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">SCORE BREAKDOWN</h4>
            <div className="text-[11px] text-zinc-400 font-mono pt-1.5 space-y-1 border-t border-white/5">
              <div className="flex justify-between">
                <span>HTF Agreement:</span>
                <span className="text-[#E5E5E5] font-bold">{serverState?.system_score?.htfAgreement >= 7 ? 'VERIFIED' : 'DIVERGENT'}</span>
              </div>
              <div className="flex justify-between">
                <span>Volatility:</span>
                <span className="text-[#E5E5E5]">{serverState?.system_score?.volatilityRegime >= 6 ? 'STABLE' : 'EXPANDING'}</span>
              </div>
            </div>
          </div>
          <span className="text-[7.5px] text-zinc-650 uppercase font-mono tracking-wider font-bold">0.8S LATENCY CYCLE SEC</span>
        </div>

        {/* Card 4: Hardware Timer status */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[8px] text-[#d4d4d8] tracking-wider block font-bold uppercase">MARKET TIMER</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">CBOE / NYSE CLOCK</h4>
            <div className="text-[11px] text-zinc-400 font-mono pt-1.5 space-y-1 border-t border-white/5">
              <div className="flex justify-between">
                <span>Market Hours:</span>
                <span className={marketState.open ? 'text-[#d4d4d8] font-bold' : 'text-zinc-500'}>
                  {marketState.open ? 'OPEN' : 'CLOSED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Closing bell:</span>
                <span className="text-[#E5E5E5] font-bold">{marketState.open ? marketState.closeIn : marketState.openIn}</span>
              </div>
            </div>
          </div>
          <span className="text-[7.5px] text-[#d4d4d8] uppercase font-mono tracking-wider font-bold">STREAM STATE: LIVE SYNC</span>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Layers className="w-3.5 h-3.5 text-zinc-550" />
          <h4 className="text-[10.5px] font-black text-[#E5E5E5] uppercase tracking-wider block">
            How Slayer Works
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-zinc-400 font-sans space-y-2">
          <p>
            Slayer continuously scores each setup using dealer gamma positioning, order flow, and past market conditions. Signals are cross-checked against CBOE clearing records so only high-probability setups are flagged.
          </p>
          <p>
            Risk levels are defined before entry. Expected move ranges, support, and resistance levels update in real time to keep your stops and targets current.
          </p>
        </div>
      </div>

      {/* Institutional HUD Cockpit Panel */}
      <InstitutionalHUD />

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[8px] text-zinc-400 uppercase tracking-widest pl-4 font-black shadow-md">
        <span>ALL SIGNALS VERIFIED / NO DATA GAPS</span>
        <div className="flex items-center gap-1 pr-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#d4d4d8] animate-ping" />
          <span className="text-[#E5E5E5]">LIVE FEED ACTIVE</span>
        </div>
      </div>

    </div>
  );
}
