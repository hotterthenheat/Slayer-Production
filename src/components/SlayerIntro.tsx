/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrandHeader } from './BrandLogo';
import { useContractStore } from '../lib/store';
import { FeatureMatrix } from './FeatureMatrix';
import { SubscriptionPricing } from './SubscriptionPricing';
import { 
  ArrowRight, 
  Check, 
  Sparkles, 
  Compass, 
  Dna, 
  Database,
  Layers,
  MessageSquare,
  Sliders,
  CheckCircle2,
  ShieldCheck,
  Eye,
  Activity,
  Bot,
  ExternalLink,
  Lock,
  Search,
  Bell,
  CreditCard,
  X,
  Mail,
  User
} from 'lucide-react';
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
  const serverState = useContractStore(s => s.serverState);
  
  // State for active chosen index on landing hero
  const [activeHeroIdx, setActiveHeroIdx] = useState<'SPX' | 'NDX' | 'QQQ' | 'SPY' | 'RUT'>('SPX');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Synchronize with external selectedAsset when it updates
  useEffect(() => {
    if (['SPX', 'NDX', 'QQQ', 'SPY', 'RUT'].includes(selectedAsset.ticker)) {
      setActiveHeroIdx(selectedAsset.ticker as any);
    }
  }, [selectedAsset]);
  
  // Animation state matching direct timestamps:
  // 0.00s: Homepage is visible and interactive.
  // 0.05s: Ripple.
  // 0.15s: Words appear.
  // 0.15s - 0.60s: Interactive Mouse Move bend/distortion.
  // 0.70s: Ghost words dissolve.
  // 0.80s: Animation overlay gone.
  const [animStage, setAnimStage] = useState<'visible' | 'ripple' | 'words' | 'dissolving' | 'completed'>('visible');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);


  // Distortive word array
  const introWords = ['Momentum', 'Liquidity', 'Positioning', 'Conviction', 'Strength', 'Support', 'Resistance'];

  useEffect(() => {
    // 0.05s Ripple trigger
    const rippleTimer = setTimeout(() => {
      setAnimStage('ripple');
    }, 50);

    // 0.15s Words appear
    const wordsTimer = setTimeout(() => {
      setAnimStage('words');
    }, 150);

    // 0.70s Words dissolve
    const dissolveTimer = setTimeout(() => {
      setAnimStage('dissolving');
    }, 700);

    // 0.80s Gone
    const completeTimer = setTimeout(() => {
      setAnimStage('completed');
    }, 800);

    return () => {
      clearTimeout(rippleTimer);
      clearTimeout(wordsTimer);
      clearTimeout(dissolveTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  // Soft track mouse position for 2-4px non-heavy organic bending/distortion
  const handleMouseMove = (e: React.MouseEvent) => {
    if (animStage === 'completed') return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

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
      ref={containerRef}
      onMouseMove={handleMouseMove}
      id="slayer-ecosystem-landing" 
      className="w-full bg-transparent text-[#D4D4D8] flex flex-col font-sans selection:bg-white selection:text-black relative pb-0 antialiased scroll-smooth"
    >
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 72% 62% at 50% 44%, rgba(8,9,10,.9) 0%, rgba(8,9,10,.55) 44%, transparent 78%)' }}></div>
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 260px 70px rgba(0,0,0,.92)', background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,.62) 100%)' }}></div>
      
      {/* ==================================================
          GPU-ACCELERATED RIPPLE & DISTORTION INTRO LAYER (GONE BY 0.8s)
          ================================================== */}
      {animStage !== 'completed' && (
        <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden h-full w-full">
          {/* 0.05s SINGLE RIPPLE RING */}
          {(animStage === 'ripple' || animStage === 'words' || animStage === 'dissolving') && (
            <motion.div
              initial={{ scale: 0.1, opacity: 0.8 }}
              animate={{ scale: 4.5, opacity: 0 }}
              transition={{ duration: 0.74, ease: 'easeOut' }}
              className="absolute w-[300px] h-[300px] rounded-full border border-black -translate-x-1/2 -translate-y-1/2"
              style={{
                left: mousePos.x || '50%',
                top: mousePos.y || '40%',
              }}
            />
          )}

          {/* 0.15s GHOST WORDS BENDING COARDS */}
          {(animStage === 'words' || animStage === 'dissolving') && (
            <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-12 px-10 pointer-events-none max-w-4xl mx-auto top-1/4">
              <AnimatePresence>
                {animStage !== 'dissolving' && (
                  introWords.map((word, index) => {
                    // Custom coordinate-based displacement calculations creating elegant 2-4px organic bend
                    // words behave slightly magnetically to track pointer
                    const elementId = `intro-word-${index}`;
                    const element = document.getElementById(elementId);
                    let dx = 0;
                    let dy = 0;
                    
                    if (element && mousePos.x && mousePos.y) {
                      const rect = element.getBoundingClientRect();
                      const wordCenterX = rect.left + rect.width / 2;
                      const wordCenterY = rect.top + rect.height / 2;
                      const distX = mousePos.x - wordCenterX;
                      const distY = mousePos.y - wordCenterY;
                      const centerDist = Math.sqrt(distX * distX + distY * distY);
                      
                      if (centerDist < 300) {
                        const pullFactor = (1 - centerDist / 300) * 4.5; // caps at 4.5px displacement
                        dx = (distX / centerDist) * pullFactor;
                        dy = (distY / centerDist) * pullFactor;
                      }
                    }

                    return (
                      <motion.span
                        key={word}
                        id={elementId}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ 
                          opacity: 0.35, 
                          scale: 1,
                          x: dx,
                          y: dy,
                        }}
                        exit={{ opacity: 0, scale: 0.9, filter: 'blur(3px)' }}
                        transition={{ 
                          type: 'spring', 
                          stiffness: 90, 
                          damping: 10,
                          opacity: { duration: 0.2 } 
                        }}
                        className="text-[#E5E5E5] text-xs font-mono font-black uppercase tracking-widest pointer-events-none block whitespace-nowrap select-none"
                      >
                        {word}
                      </motion.span>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

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
                &gt; INSTITUTIONAL DECISION LAYER ACTIVE
              </span>
              <h1 className="text-[clamp(48px,7.5vw,90px)] font-[900] tracking-tighter text-[#E5E5E5] leading-[0.95] mb-8 animate-rise opacity-0 uppercase" style={{ animationDelay: '0.13s', animationFillMode: 'forwards' }}>
                ABSOLUTE<br/>SIGNAL.<br/>ZERO<br/>NOISE.
              </h1>
              <p className="text-[clamp(12px,1.4vw,14px)] font-bold text-[#a1a1aa] max-w-[50ch] leading-[1.8] mb-8 font-mono animate-rise opacity-0 tracking-wide" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
                Slayer decrypts dark pool order flow and active dealer gamma positioning. Cease retail speculation. Execute with the asymmetrical advantage of a market maker.
              </p>
              <div className="flex gap-4 pt-4 animate-rise opacity-0" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
                <button onClick={() => onEnterApp('workspace')} className="bg-[#E5E5E5] text-[#050505] px-8 py-3.5 font-[900] uppercase text-xs tracking-widest rounded-sm hover:bg-white hover:scale-[1.02] transition-all duration-200">
                  INITIALIZE TERMINAL
                </button>
                <button onClick={() => {
                    document.getElementById('feature-matrix')?.scrollIntoView({ behavior: 'smooth' })
                }} className="border border-[#333333] text-[#a1a1aa] bg-[#0A0A0A] px-8 py-3.5 font-[800] uppercase text-xs tracking-widest rounded-sm hover:bg-[#111] hover:text-[#E5E5E5] hover:border-[#555] transition-all duration-200">
                  EXPLORE ARCHITECTURE
                </button>
              </div>
              <p className="text-[10px] text-[#52525B] pt-8 max-w-[60ch] uppercase tracking-widest font-black animate-rise opacity-0" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
                AUTHORIZED PERSONNEL ONLY. DEPLOYING MARKET MICROSTRUCTURE OPTICS...
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
              <span className="text-[8px] text-[#4ADE80] font-extrabold uppercase">LIVE CALCULATED</span>
            </div>
          </div>

          {/* CORE STAT DETAILS */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-1 relative z-10">
            <div className="space-y-0.5">
              <span className="text-2xl font-black text-[#E5E5E5] block uppercase tracking-tight">
                {activeOpp.ticker}
              </span>
              <span className="text-[9.5px] text-zinc-500 uppercase block">
                Target Index Frame: {activeHeroIdx}
              </span>
            </div>

            <div className="bg-[#4ADE80] hover:bg-[#4ADE80]/90 text-black shadow-[0_0_15px_rgba(0,255,136,0.5)] font-black text-[10.5px] uppercase tracking-widest px-4 py-1.5 rounded-md border border-black shadow-lg">
              {activeOpp.status === 'Strengthening' ? 'ENTER' : 'ENTER'}
            </div>
          </div>

          {/* DYNAMIC RATINGS TABS */}
          <div className="grid grid-cols-3 gap-3 mirror-panel p-3 rounded-xl relative z-10 mb-3">
            <div>
              <span className="text-[8.5px] text-zinc-550 uppercase tracking-tight block">Decision Score</span>
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
          {serverState?.deep_intelligence?.dealer_metrics && (
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
          )}

          {/* Direct entry action */}
          <div className="pt-2 relative z-10 w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLaunchToActiveOpportunity();
              }}
              className="w-full py-3 bg-white hover:bg-[#F4F5F6] text-black font-[800] uppercase tracking-wide text-xs rounded-sm transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 shadow-xl hover:scale-[1.01]"
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
            <span className="text-[8.5px] text-[#A1A1AA] uppercase tracking-wider block mt-0.5">Intelligence Engines</span>
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
