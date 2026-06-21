/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BrandHeader } from './BrandLogo';
import { useContractStore } from '../lib/store';
import { FeatureMatrix } from './FeatureMatrix';
import { SubscriptionPricing } from './SubscriptionPricing';
import { ArrowRight, Eye, Search } from 'lucide-react';
import { AssetInfo, TimeframeVal, SystemScore, V8TradeRecord } from '../types';
import { ASSET_LIST } from '../data';

interface SlayerIntroProps {
  onEnterApp: (targetTab?: string) => void;
  onUpgradeComplete?: (newTier: number) => void;
  selectedAsset: AssetInfo;
  setSelectedAsset: (asset: AssetInfo) => void;
  selectedTimeframe: TimeframeVal;
  setSelectedTimeframe: (tf: TimeframeVal) => void;
  systemScore: SystemScore;
  v8Trades: V8TradeRecord[];
  bestOpportunity: {
    asset: AssetInfo;
    ticker: string;
    confidence: number;
    isCall: boolean;
    currentPrice: string;
    fairValue: string;
    entryZone: string;
  };
  topSub10Calls: Array<{ asset: AssetInfo; ticker: string; confidence: number }>;
  topSub10Puts: Array<{ asset: AssetInfo; ticker: string; confidence: number }>;
  onSelectOpportunity: (asset: AssetInfo, type: 'C' | 'P', strike?: number) => void;
  renderTerminalWorkspace: () => React.ReactNode;
  session?: any;
  onRequestAuth?: () => void;
}

export default function SlayerIntro({
  onEnterApp,
  onUpgradeComplete,
  selectedAsset,
  setSelectedAsset,
  selectedTimeframe,
  setSelectedTimeframe,
  systemScore,
  v8Trades,
  bestOpportunity: originalBestOpportunity,
  topSub10Calls,
  topSub10Puts,
  onSelectOpportunity,
  session,
  onRequestAuth,
}: SlayerIntroProps) {
  const rawServerState = useContractStore(s => s.serverState);
  
  // State for active chosen index on landing hero
  const [activeHeroIdx, setActiveHeroIdx] = useState<'SPX' | 'NDX' | 'QQQ' | 'SPY' | 'RUT'>('SPX');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const serverState = React.useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== activeHeroIdx) return null;
    return rawServerState;
  }, [rawServerState, activeHeroIdx]);

  // Synchronize with external selectedAsset when it updates
  useEffect(() => {
    if (['SPX', 'NDX', 'QQQ', 'SPY', 'RUT'].includes(selectedAsset.ticker)) {
      setActiveHeroIdx(selectedAsset.ticker as any);
    }
  }, [selectedAsset]);
  
  // Pricing membership structures
  const pricingTab = 'PROFESSIONAL';

  // Selected Index-specific values matching client targets precisely
  const heroOpportunities = {
    SPX: { ticker: 'SPX 7620C', health: 94, move: '+38%', status: 'Strengthening', isCall: true },
    QQQ: { ticker: 'QQQ 515C', health: 91, move: '+29%', status: 'Improving', isCall: true },
    NDX: { ticker: 'NDX 18300C', health: 89, move: '+44%', status: 'Strengthening', isCall: true },
    SPY: { ticker: 'SPY 448C', health: 93, move: '+36%', status: 'Improving', isCall: true },
    RUT: { ticker: 'RUT 2020C', health: 92, move: '+31%', status: 'Strengthening', isCall: true },
  };

  const activeOpp = heroOpportunities[activeHeroIdx];

  const handleLaunchToActiveOpportunity = () => {
    // Clear any selected strike so it brings the user to the front of Sky's Eye
    useContractStore.getState().setSelectedStrike(null);
    onEnterApp('skyvision');
  };

  return (
    <div
      id="slayer-ecosystem-landing"
      className="w-full bg-transparent text-[#D4D4D8] flex flex-col font-sans selection:bg-white selection:text-black relative pb-0 antialiased scroll-smooth"
    >
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 72% 62% at 50% 44%, rgba(8,9,10,.9) 0%, rgba(8,9,10,.55) 44%, transparent 78%)' }}></div>
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 260px 70px rgba(0,0,0,.92)', background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,.62) 100%)' }}></div>
      
      {/* ==================================================
          MAIN HERO (LEVEL 2 & LEVEL 3 INTELS - ABSOLUTE FOCUS)
          ================================================= */}
      <motion.section 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 px-6 pb-12 max-w-6xl mx-auto flex flex-col gap-16 mt-16 md:mt-24"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex-1 flex flex-col items-start text-left space-y-7">
            {/* STOP GUESSING LEVEL 2 LANDING TITLE */}
            <div className="space-y-4 w-full text-left font-mono tabular-data">
              <span className="text-[11px] font-black tracking-widest text-[#a1a1aa] mb-4 inline-block uppercase animate-rise opacity-0" style={{ animationDelay: '0.05s', animationFillMode: 'forwards' }}>
                &gt; LIVE DEALER POSITIONING ACTIVE
              </span>
              <h1 className="text-[clamp(48px,7.5vw,90px)] font-black tracking-tighter text-[#E5E5E5] leading-[0.95] mb-8 animate-rise opacity-0 uppercase" style={{ animationDelay: '0.13s', animationFillMode: 'forwards' }}>
                ABSOLUTE<br/>SIGNAL.<br/>ZERO<br/>NOISE.
              </h1>
              <p className="text-[clamp(12px,1.4vw,14px)] font-bold text-[#a1a1aa] max-w-[50ch] leading-[1.8] mb-8 font-mono animate-rise opacity-0 tracking-wide" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
                Slayer reads dealer gamma positioning and order flow in real time. Stop guessing. Trade with the same data a market maker uses.
              </p>
              <div className="flex gap-4 pt-4 animate-rise opacity-0" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
                <button onClick={() => onEnterApp('workspace')} className="bg-white text-black px-8 py-3.5 font-black uppercase text-xs tracking-widest rounded-lg hover:bg-zinc-100 hover:scale-[1.02] transition-all duration-200">
                  OPEN TERMINAL
                </button>
                <button onClick={() => {
                    document.getElementById('feature-matrix')?.scrollIntoView({ behavior: 'smooth' })
                }} className="bg-black text-[#E5E5E5] border border-white/10 px-8 py-3.5 font-bold uppercase text-xs tracking-widest rounded-lg hover:border-white/20 hover:bg-[#111] transition-all duration-200">
                  SEE HOW IT WORKS
                </button>
              </div>
              <p className="text-[10px] text-[#52525B] pt-8 max-w-[60ch] uppercase tracking-widest font-black animate-rise opacity-0" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
                LIVE DATA. NO GUESSWORK. NO LAG.
              </p>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col items-center space-y-6 w-full max-w-lg mt-8 md:mt-0">
          {/* INDEX TABS SELECTOR */}
        <div className="flex flex-wrap justify-center mirror-panel rounded-sm p-1 font-mono items-center gap-1 sm:gap-1.5">
          {(['SPX', 'NDX', 'QQQ', 'SPY', 'RUT'] as const).map((ticker) => (
            <button
              key={ticker}
              onClick={() => {
                setActiveHeroIdx(ticker);
                const targetAsset = ASSET_LIST.find(a => a.ticker === ticker);
                if (targetAsset) {
                  setSelectedAsset(targetAsset);
                }
              }}
              className={`px-3 sm:px-6 py-2 sm:py-2.5 text-[10px] sm:text-xs font-mono font-black uppercase tracking-wider cursor-pointer rounded-xs transition-all ${
                activeHeroIdx === ticker
                  ? 'bg-white text-black font-extrabold'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {ticker}
            </button>
          ))}
        </div>

        <div className="w-full max-w-sm">
          <button 
            type="button"
            onClick={() => useContractStore.getState().setIsGlobalSearchOpen(true)}
            className="global-prism-trigger w-full flex items-center justify-between mirror-panel px-4 py-2.5 rounded-sm hover:cursor-pointer hover:border-black transition-all duration-150 group"
          >
            <div className="flex items-center gap-2.5 text-zinc-550 font-mono text-[10px] tracking-wider font-extrabold">
              <Search className="w-3.5 h-3.5 text-[#4ADE80] group-hover:scale-105 transition-transform" />
              <span>SEARCH ALL SECURITIES & INDEX GREEKS</span>
            </div>
            <kbd className="hidden sm:inline-block bg-black text-zinc-600 border border-black px-1.5 py-0.5 rounded-xs text-[8px] font-mono shadow-inner">{useContractStore(s => s.keybinds).prismMenu?.replace('cmd', typeof window !== 'undefined' && navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl').toUpperCase()}</kbd>
          </button>
        </div>

        <div className="text-[10.5px] font-mono tracking-widest text-[#71717A] uppercase">
          Continuously monitored. Continuously scored. Continuously managed.
        </div>

        {/* ==================================================
            BEST OPPORTUNITY RIGHT NOW PRECISE COARDS (THE HERO)
            ================================================== */}
        <div 
          id="slayer-hero-opportunity" 
          onClick={handleLaunchToActiveOpportunity}
          className="w-full max-w-lg apple-glass rounded-2xl p-6 md:p-7 relative overflow-hidden shadow-2xl text-left space-y-4 font-mono transition-all duration-300 hover:scale-[1.01] cursor-pointer animate-fadeIn"
        >
          
          {/* Top Line accent */}
          <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 to-transparent" />

          {/* Section Indicator */}
          <div className="flex justify-between items-center pb-2.5 border-b border-black/40 relative z-10">
            <span className="text-[9px] text-[#A1A1AA] uppercase tracking-widest font-black">
              BEST OPPORTUNITY RIGHT NOW
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-black" />
              <span className="text-[8px] text-[#4ADE80] font-extrabold uppercase">LIVE</span>
            </div>
          </div>

          {/* CORE STAT DETAILS */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-1 relative z-10">
            <div className="space-y-0.5">
              <span className="text-2xl font-black text-[#E5E5E5] block uppercase tracking-tight">
                {activeOpp.ticker}
              </span>
              <span className="text-[9.5px] text-zinc-500 uppercase block">
                Index: {activeHeroIdx}
              </span>
            </div>

            <div className="bg-[#4ADE80] hover:bg-[#4ADE80]/90 text-black font-black text-[10.5px] uppercase tracking-widest px-4 py-1.5 rounded-md border border-black shadow-lg">
              ENTER
            </div>
          </div>

          {/* DYNAMIC RATINGS TABS */}
          <div className="grid grid-cols-3 gap-3 mirror-panel p-3 rounded-xl relative z-10 mb-3">
            <div>
              <span className="text-[8.5px] text-zinc-550 uppercase tracking-tight block">Trade Score</span>
              <span className="text-base font-black text-[#4ADE80] mt-0.5 block">{activeOpp.health}</span>
            </div>
            <div>
              <span className="text-[8.5px] text-zinc-550 uppercase tracking-tight block">Expected Move</span>
              <span className="text-base font-bold text-[#E5E5E5] mt-0.5 block">{activeOpp.move}</span>
            </div>
            <div>
              <span className="text-[8.5px] text-zinc-550 uppercase tracking-tight block">Status</span>
              <span className="text-base font-bold text-indigo-400 mt-0.5 block uppercase tracking-tight font-sans text-xs">{activeOpp.status}</span>
            </div>
          </div>

          {/* NEW HERO ENHANCEMENTS (Dealer Bias, Vol State, etc) */}
          {serverState?.deep_intelligence?.dealer_metrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-black border border-black/40 p-2.5 rounded-lg relative z-10 text-[9px] mb-4">
               <div className="border border-black/50 p-2 rounded-md bg-black/50">
                  <span className="text-zinc-500 uppercase font-black block tracking-widest text-[7px] mb-0.5">Dealer Bias</span>
                  <span className={`font-bold ${serverState.deep_intelligence.dealer_metrics.bias === 'LONG GAMMA' ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                    {serverState.deep_intelligence.dealer_metrics.bias}
                  </span>
               </div>
               <div className="border border-black/50 p-2 rounded-md bg-black/50">
                  <span className="text-zinc-500 uppercase font-black block tracking-widest text-[7px] mb-0.5">Vol State</span>
                  <span className="text-[#4ADE80] font-bold">{serverState.deep_intelligence.dealer_metrics.volState}</span>
               </div>
               <div className="border border-black/50 p-2 rounded-md bg-black/50">
                  <span className="text-zinc-500 uppercase font-black block tracking-widest text-[7px] mb-0.5">Magnet Strike</span>
                  <span className="text-[#E5E5E5] font-bold">{Number(serverState.deep_intelligence.dealer_metrics.magnetStrike ?? 0).toFixed(2)}</span>
               </div>
               <div className="border border-black/50 p-2 rounded-md bg-black/50">
                  <span className="text-zinc-500 uppercase font-black block tracking-widest text-[7px] mb-0.5">Flip Level</span>
                  <span className="text-[#F87171] font-bold">{Number(serverState.deep_intelligence.dealer_metrics.flipLevel ?? 0).toFixed(2)}</span>
               </div>
               
               <div className="border border-black/50 p-2 rounded-md bg-black/50 col-span-1 md:col-span-2 flex justify-between items-center">
                  <div>
                     <span className="text-zinc-500 uppercase font-black block tracking-widest text-[7px] mb-0.5">Call Wall</span>
                     <span className="text-[#E5E5E5] font-bold">{Number(serverState.deep_intelligence.dealer_metrics.callWall ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                     <span className="text-zinc-500 uppercase font-black block tracking-widest text-[7px] mb-0.5">Put Wall</span>
                     <span className="text-[#E5E5E5] font-bold">{Number(serverState.deep_intelligence.dealer_metrics.putWall ?? 0).toFixed(2)}</span>
                  </div>
               </div>
               <div className="border border-black/50 p-2 rounded-md bg-black/50 col-span-1 md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                     <span className="text-zinc-500 uppercase font-black tracking-widest text-[7px]">Dealer Positioning Score</span>
                     <span className="text-[#E5E5E5] font-bold text-[9px]">{serverState.deep_intelligence.dealer_metrics.dealerScore}/100</span>
                  </div>
                  <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                     <div className="bg-[#4f8cff] h-full transition-all duration-300" style={{ width: `${serverState.deep_intelligence.dealer_metrics.dealerScore}%` }} />
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 border border-zinc-900 border-dashed rounded-lg bg-black/40 text-[9px] text-[#A3A3A3] uppercase tracking-widest animate-pulse mb-4 h-[116px]">
              <span>Awaiting dealer data for {activeHeroIdx}...</span>
              <span className="text-[8px] text-zinc-650 mt-1 uppercase font-mono">Syncing live market data</span>
            </div>
          )}

          {/* Direct entry action */}
          <div className="pt-2 relative z-10 w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLaunchToActiveOpportunity();
              }}
              className="w-full py-3 bg-white hover:bg-zinc-100 text-black font-black uppercase tracking-widest text-xs rounded-lg transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 shadow-xl hover:scale-[1.01]"
            >
              <span>Launch Live Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        </div>
        </div>

        {/* HERO TALLY SUMMARY */}
        <div className="grid grid-cols-3 gap-7 md:gap-14 pt-4 border-t border-black w-full max-w-6xl font-mono text-center">
          <div>
            <span className="text-xl md:text-2xl font-black text-[#E5E5E5] block">71%</span>
            <span className="text-[8.5px] text-[#A1A1AA] uppercase tracking-wider block mt-0.5">Target 1 Hit Rate</span>
          </div>
          <div>
            <span className="text-xl md:text-2xl font-black text-[#4ADE80] block">100%</span>
            <span className="text-[8.5px] text-[#A1A1AA] uppercase tracking-wider block mt-0.5">Public Trade History</span>
          </div>
          <div>
            <span className="text-xl md:text-2xl font-black text-[#E5E5E5] block">4</span>
            <span className="text-[8.5px] text-[#A1A1AA] uppercase tracking-wider block mt-0.5">Analysis Engines</span>
          </div>
        </div>

      </motion.section>

      {/* ==================================================
          SCROLL FEATURE MATRIX
          ================================================== */}
      <FeatureMatrix onEnterApp={onEnterApp} />

      {/* Subscription Matrices */}
      <SubscriptionPricing
        onUpgradeComplete={onUpgradeComplete}
        onEnterApp={onEnterApp}
        session={session}
        onRequestAuth={onRequestAuth}
      />

      </div>
  );
}
