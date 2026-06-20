/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { 
  ArrowRight, 
  Check, 
  Compass, 
  Database,
  MessageSquare,
  Sliders,
  Activity,
  Bot,
  ExternalLink
} from 'lucide-react';

interface FeatureMatrixProps {
  onEnterApp: (targetTab?: string) => void;
}

export const FeatureMatrix: React.FC<FeatureMatrixProps> = ({ onEnterApp }) => {
  const [hoveredGexStrike, setHoveredGexStrike] = useState<number | null>(null);
  const [activeGoalpost, setActiveGoalpost] = useState<number>(1);
  const [hoveredSweep, setHoveredSweep] = useState<number | null>(null);

  const handleLaunchToSkyeye = () => {
    // Clear selected strike so they land on the clean front of Skyeye
    useContractStore.getState().setSelectedStrike(null);
    useContractStore.getState().setActiveTab('skyvision');
    onEnterApp('skyvision');
  };

  const handleLaunchToTab = (tab: 'pinpoint' | 'auditor' | 'community' | 'dealerflow') => {
    useContractStore.getState().setActiveTab(tab);
    onEnterApp(tab);
  };

  return (
    <section className="relative z-10 py-16 w-full overflow-hidden border-t border-black">
      
      {/* Decorative backdrop glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#4ADE80] text-black/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 space-y-32">
        
        <div className="text-center space-y-3">
          <span className="text-[10px] font-mono tracking-[0.35em] text-[#A1A1AA] uppercase font-black bg-black px-4 py-1.5 border border-black rounded-md inline-block">
            INTELLIGENCE OVERVIEW
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-[#E5E5E5] tracking-tight uppercase font-sans">
            Dynamic Ecosystem Core
          </h2>
          <p className="text-zinc-500 text-xs md:text-sm font-mono max-w-xl mx-auto">
            Scroll to explore the sub-second automated option analysis engines powering the institutional workspace.
          </p>
        </div>

        {/* 1. SKYEYE FEATURE SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* RENDER CELL */}
          <motion.div 
            initial={{ opacity: 0, x: -60, scale: 0.95 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 w-full"
          >
            <div className="apple-glass rounded-2xl p-5 border border-white/10 shadow-3xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-550 via-purple-500 to-indigo-550" />
              <div className="flex justify-between items-center border-b border-black/60 pb-3 mb-4 font-mono text-[9px] text-zinc-505">
                <span className="font-extrabold uppercase text-[#E5E5E5] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  SKYSEYE v1.2 // CORE CONTRACT COCKPIT
                </span>
                <span className="uppercase text-zinc-650 font-bold">LIVE MODEL RENDER</span>
              </div>

              <div className="space-y-4">
                {/* Active forensic asset */}
                <div className="bg-black/60 p-3.5 border border-black/60 rounded-xl flex justify-between items-center font-mono">
                  <div className="space-y-0.5">
                    <span className="text-[8px] text-zinc-500 uppercase block tracking-wider">Active Analytical Asset</span>
                    <span className="text-sm font-black text-[#E5E5E5] block">SPX 7640 CALL</span>
                  </div>
                  <div className="text-right space-y-0.5">
                    <span className="text-[8px] text-zinc-500 uppercase block">Decision Score</span>
                    <span className="text-sm font-black text-[#4ADE80] block">94.2% [VERY HIGH]</span>
                  </div>
                </div>

                {/* Simulated interactive goalposts */}
                <div className="grid grid-cols-3 gap-2.5 font-mono text-center">
                  <button 
                    onClick={() => setActiveGoalpost(0)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${activeGoalpost === 0 ? 'bg-black border-white/30' : 'bg-black/80 border-black/80'}`}
                  >
                    <span className="text-[7.5px] text-zinc-450 block uppercase font-bold">Entry Point</span>
                    <span className="text-[#E5E5E5] font-extrabold block text-xs mt-0.5">$12.40</span>
                  </button>
                  <button 
                    onClick={() => setActiveGoalpost(1)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${activeGoalpost === 1 ? 'bg-black/5 border-black' : 'bg-black/80 border-black/80'}`}
                  >
                    <span className="text-[7.5px] text-[#4ADE80] block uppercase font-black">Goalpost 1</span>
                    <span className="text-[#4ADE80] font-black block text-xs mt-0.5">$16.50 (+33%)</span>
                  </button>
                  <button 
                    onClick={() => setActiveGoalpost(2)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${activeGoalpost === 2 ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-black/80 border-black/80'}`}
                  >
                    <span className="text-[7.5px] text-indigo-400 block uppercase font-black">Goalpost 2</span>
                    <span className="text-indigo-400 font-extrabold block text-xs mt-0.5">$22.30 (+80%)</span>
                  </button>
                </div>

                {/* Dynamic mathematical visuals */}
                <div className="bg-black/40 p-3 border border-black/40 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-[8.5px] font-mono">
                    <span className="text-zinc-500 uppercase font-bold">Implied Hedge Compression:</span>
                    <span className="text-indigo-450 font-bold uppercase text-[8px] leading-relaxed">
                      {activeGoalpost === 0 && 'Stable Consolidation'}
                      {activeGoalpost === 1 && 'Hedge Squeeze Triggered'}
                      {activeGoalpost === 2 && 'Fully Skybound Corridor'}
                    </span>
                  </div>
                  <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-505 to-[#4ADE80] h-full transition-all duration-500" 
                      style={{ width: activeGoalpost === 0 ? '45%' : activeGoalpost === 1 ? '78%' : '96%' }} 
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1 pt-1 text-[7.5px] text-zinc-550 font-mono text-center">
                    <div className="border border-black/60 py-1 bg-black/40 rounded">Delta: 0.52</div>
                    <div className="border border-black/60 py-1 bg-black/40 rounded">Gamma: 0.08</div>
                    <div className="border border-black/60 py-1 bg-black/40 rounded">Vanna: 0.04</div>
                    <div className="border border-black/60 py-1 bg-black/40 rounded">Charm: 0.12</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* EXPLANATION SLIDE */}
          <motion.div 
            initial={{ opacity: 0, x: 60 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 text-left space-y-6"
          >
            <div className="space-y-2">
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#d4d4d8] uppercase font-bold flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-indigo-455" />
                DECISION ENGINE
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans">
                Sky's Eye Cockpit
              </h3>
            </div>
            <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-sans font-light">
              Our institutional deep contract cockpit. Skyeye isolates specific index option contracts that feature dynamic model mispricings and optimal hedging corridors.
            </p>
            
            <ul className="space-y-3 font-mono text-[9px] md:text-[10px] text-zinc-350">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Option Goalposts:</strong> Automatically mapped exits utilizing real-time dealer speed constraints.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Conviction Meter:</strong> 100-point multi-factor model evaluating direction flow and Greeks profile.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Volatility Suppression:</strong> Visualizes areas where hedge activity buffers or accelerates price action.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button 
                onClick={handleLaunchToSkyeye}
                className="px-5 py-3 bg-white hover:bg-black text-black font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Launch SkyEye Cockpit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        </div>

        {/* 2. PINPOINT FEATURE SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* EXPLANATION SLIDE */}
          <motion.div 
            initial={{ opacity: 0, x: -60 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 text-left space-y-6 lg:order-1"
          >
            <div className="space-y-2">
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#d4d4d8] uppercase font-bold flex items-center gap-1.5">
                <Compass className="w-3 h-3 text-[#4ADE80]" />
                MARKET MAP GPS
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans">
                Pinpoint GEX Matrix
              </h3>
            </div>
            <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-sans font-light">
              Every transaction requires an options market maker to take the other side, and they must immediately hedge. Pinpoint tracks these institutional commitments to reveal specific key barriers.
            </p>
            
            <ul className="space-y-3 font-mono text-[9px] md:text-[10px] text-zinc-350">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Gamma Support:</strong> Spot the areas where passive dealer hedging cushions any drops.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Call & Put Walls:</strong> Locate the key overhead pinning strikes representing absolute institutional limits.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Dealer Position Score:</strong> Continuously indexes whether dealers are short or long Gamma.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button 
                onClick={() => handleLaunchToTab('pinpoint')}
                className="px-5 py-3 bg-black hover:bg-black text-[#E5E5E5] border border-black font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Launch Pinpoint Matrix</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>

          {/* RENDER CELL */}
          <motion.div 
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 w-full lg:order-2"
          >
            <div className="apple-glass rounded-2xl p-5 border border-white/10 shadow-3xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#d4d4d8] via-zinc-300 to-zinc-300" />
              <div className="flex justify-between items-center border-b border-black/60 pb-3 mb-4 font-mono text-[9px] text-zinc-500">
                <span className="font-extrabold uppercase text-[#E5E5E5] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/40 animate-pulse" />
                  PINPOINT // ACTIVE GEX SPECTRUM GRAPH
                </span>
                <span className="uppercase text-zinc-650 font-bold">LIVE RENDER</span>
              </div>

              {/* Simulated GEX Strike Histogram bar layout */}
              <div className="space-y-3 font-mono">
                
                {/* Spot Price tracker */}
                <div className="flex justify-between items-center text-[8.5px] border-b border-black pb-2">
                  <span className="text-zinc-550 uppercase font-black text-[7.5px]">ATM Spot Target:</span>
                  <span className="text-[#d4d4d8] font-black">7620.42 oscillating</span>
                </div>

                {/* Histogram bars */}
                <div className="space-y-2.5">
                  {[
                    { strike: '7640 [CALL WALL]', gex: '+28.4M', pct: '92%', type: 'HEAVY CEILING', color: 'border-[#d4d4d8]', bg: 'bg-[#4ADE80]/20', txt: 'text-[#d4d4d8]' },
                    { strike: '7630 [ATM SPOT AREA]', gex: '+4.5M', pct: '40%', type: 'SPOT PIN RISK', color: 'border-indigo-400', bg: 'bg-indigo-500/10', txt: 'text-zinc-400' },
                    { strike: '7610 [GAMMA FLIP]', gex: '-11.8M', pct: '65%', type: 'VOL TRANSITION', color: 'border-rose-400', bg: 'bg-rose-550/10', txt: 'text-[#F87171]' }
                  ].map((row, idx) => (
                    <div 
                      key={idx}
                      onMouseEnter={() => setHoveredGexStrike(idx)}
                      onMouseLeave={() => setHoveredGexStrike(null)}
                      className={`space-y-1 transition-all duration-300 ${hoveredGexStrike === idx ? 'scale-[1.01]' : ''}`}
                    >
                      <div className="flex justify-between text-[8px] text-[#A1A1AA] font-bold">
                        <span>Strike {row.strike}</span>
                        <span className={`${row.txt} font-extrabold`}>{row.gex} GEX</span>
                      </div>
                      <div className="h-4 bg-black font-mono rounded overflow-hidden flex items-center px-1 border border-black relative">
                        <div className={`h-full ${row.bg} transition-all border-r-2 ${row.color}`} style={{ width: row.pct }} />
                        <span className={`text-[7.5px] ${row.txt} ml-2 font-black font-sans relative z-10 whitespace-nowrap`}>
                          {row.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-black/60 p-2 text-[8px] text-zinc-505 text-center uppercase tracking-wide border border-black rounded">
                  Magnet Strike: <strong className="text-[#E5E5E5]">7620.00</strong> | Net positioning score: <span className="text-[#4ADE80] font-bold">68 / Bullish long-gamma</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 3. TRUST LEDGER FEATURE SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* RENDER CELL */}
          <motion.div 
            initial={{ opacity: 0, x: -60, scale: 0.95 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 w-full"
          >
            <div className="apple-glass rounded-2xl p-5 border border-white/10 shadow-3xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-zinc-600 via-[#d4d4d8]/50 to-zinc-500" />
              <div className="flex justify-between items-center border-b border-black/60 pb-3 mb-4 font-mono text-[9px] text-zinc-500">
                <span className="font-extrabold uppercase text-[#E5E5E5] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                  TRUST REGISTER // COMPLIANT HISTORICAL ARCHIVE
                </span>
                <span className="uppercase text-zinc-650 font-bold">AUDIT RENDER</span>
              </div>

              {/* Cryptographic rolling table */}
              <div className="space-y-2.5 font-mono">
                <div className="grid grid-cols-12 text-[7.5px] uppercase font-bold text-zinc-500 px-2 pb-1 border-b border-black">
                  <span className="col-span-3 text-left">CONTRACT</span>
                  <span className="col-span-3 text-center">ENTRANCE</span>
                  <span className="col-span-3 text-center">RESULT</span>
                  <span className="col-span-3 text-right">HASH SIGN</span>
                </div>

                <div className="space-y-1.5">
                  {[
                    { contract: 'SPX 7620C', enter: '$11.20', result: '+38.2% Exit', rColor: 'text-[#d4d4d8]', hash: '0xbd5a...1e9f' },
                    { contract: 'QQQ 515C', enter: '$2.10', result: '+22.4% Exit', rColor: 'text-[#d4d4d8]', hash: '0xf3e2...8d9e' },
                    { contract: 'NDX 18300C', enter: '$165.40', result: '-12.5% Out', rColor: 'text-[#F87171]', hash: '0xab91...4c5a' }
                  ].map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-center text-[9px] bg-black/70 p-2 rounded border border-black/50">
                      <span className="col-span-3 font-bold text-[#E5E5E5] uppercase text-[8.5px] sm:text-[9.5px]">{row.contract}</span>
                      <span className="col-span-3 text-center text-zinc-400">{row.enter}</span>
                      <span className={`col-span-3 text-center font-bold ${row.rColor} text-[8.5px] sm:text-[9.5px]`}>{row.result}</span>
                      <span className="col-span-3 text-right text-[7.5px] text-zinc-600">{row.hash}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center bg-black/60 px-3 py-2 rounded border border-black text-[8px] text-zinc-550 uppercase">
                  <span className="flex items-center gap-1.5 font-bold text-[#d4d4d8]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-ping" />
                    SEC COMPLIANT AUDIT TRACE
                  </span>
                  <span>1.8ms Log footprint latency</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* EXPLANATION SLIDE */}
          <motion.div 
            initial={{ opacity: 0, x: 60 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 text-left space-y-6"
          >
            <div className="space-y-2">
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#d4d4d8] uppercase font-bold flex items-center gap-1.5">
                <Database className="w-3 h-3 text-zinc-500" />
                PERMANENT PROOF REGISTER
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans">
                The Trust Ledger
              </h3>
            </div>
            <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-sans font-light">
              No deleted calls, no photoshopped gains. Every single signal dispatched to subscribers is permanently indexed in our cryptographically signed public trust journal.
            </p>
            
            <ul className="space-y-3 font-mono text-[9px] md:text-[10px] text-zinc-350">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Cryptographic Logs:</strong> Fully immutable trade signatures hashed on-chain at milliseconds speed.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Model Accuracy:</strong> Instantly check historical performance specs against exact entry ranges.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Complete Transparency:</strong> Open auditable trails designed strictly to meet SEC disclosure benchmarks.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button 
                onClick={() => handleLaunchToTab('auditor')}
                className="px-5 py-3 bg-black hover:bg-black text-[#E5E5E5] border border-black font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Audit Historic Logs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        </div>

        {/* 4. DISCORD FEATURE SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* EXPLANATION SLIDE */}
          <motion.div 
            initial={{ opacity: 0, x: -60 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 text-left space-y-6 lg:order-1"
          >
            <div className="space-y-2">
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#d4d4d8] uppercase font-bold flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3 text-[#5865F2]" />
                COMMUNITY ALERT HUD
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans">
                Slayer Labs Discord Webhooks
              </h3>
            </div>
            <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-sans font-light">
              Get high-conviction decision analytics immediately in your pocket. Our cloud routing servers push automated webhook alerts into Discord chat instantly as clusters are discovered.
            </p>
            
            <ul className="space-y-3 font-mono text-[9px] md:text-[10px] text-zinc-350">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Zero Lag Dispatches:</strong> Directly routed from our back-end calculation cluster to chat API gates.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Structured Alerts:</strong> Complete guidelines specifying targets, entry zone limits, and stop losses.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Professional Network:</strong> Collaborate live in real-time with an active network of options traders.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button 
                onClick={() => handleLaunchToTab('community')}
                className="px-5 py-3 bg-black hover:bg-black text-[#E5E5E5] border border-black font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Connect Alert Channels</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>

          {/* RENDER CELL */}
          <motion.div 
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 w-full lg:order-2"
          >
            <div className="apple-glass rounded-2xl p-5 border border-white/10 shadow-3xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#5865F2]" />
              <div className="flex justify-between items-center border-b border-black/60 pb-3 mb-4 font-mono text-[9px] text-[#A1A1AA]">
                <span className="font-extrabold uppercase text-[#E5E5E5] tracking-widest flex items-center gap-1.5">
                  <span className="font-bold text-[#E5E5E5] bg-[#5865F2] px-2 py-0.5 rounded-sm text-[7px] leading-relaxed">DISCORD_HUD</span>
                  #spx-realtime-alerts webhook
                </span>
                <span className="uppercase text-zinc-650 font-bold">CLIENT CONNECTED</span>
              </div>

              {/* Mock discord message embed card */}
              <div className="bg-[#2f3136] rounded-lg p-4 font-sans text-left border border-black/40 space-y-3 relative overflow-hidden shadow-xl select-none">
                <div className="absolute top-0 right-0 bg-[#4ADE80]/15 text-[#d4d4d8] text-[7.5px] font-mono tracking-widest px-2.5 py-1.5 rounded-bl-lg font-black uppercase">
                  ALERT DISPATCHED
                </div>

                <div className="flex items-center gap-2 font-mono">
                  <div className="w-7 h-7 rounded-full bg-[#4ADE80]/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-[#d4d4d8]" />
                  </div>
                  <div>
                    <span className="font-extrabold text-[#E5E5E5] text-[11px] block">Slayer Signal Bot</span>
                    <span className="text-zinc-500 text-[7px] uppercase tracking-wider block">Today at 9:18 AM</span>
                  </div>
                </div>

                {/* Main Embed section */}
                <div className="bg-black border-l-4 border-[#d4d4d8] p-3.5 rounded-r-md space-y-2 text-xs">
                  <div className="font-mono text-[10.5px] font-black text-[#d4d4d8] uppercase">
                    🚨 SPX MOMENTUM GRID SIGNAL: CONVICTION SECURED
                  </div>
                  <p className="text-[#4ADE80] text-[10.5px] font-light leading-snug">
                    High-speed options order-flow clustering detected on institutional SPX grids. Volatility showing compression patterns above key support.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-black font-mono text-[9.5px]">
                    <div>
                      <span className="text-zinc-550 block text-[7.5px] uppercase">Option target</span>
                      <span className="text-[#E5E5E5] font-extrabold">SPX 7620 CALL</span>
                    </div>
                    <div>
                      <span className="text-zinc-550 block text-[7.5px] uppercase">Entry threshold</span>
                      <span className="text-[#E5E5E5] font-extrabold">Under $12.50</span>
                    </div>
                    <div>
                      <span className="text-zinc-550 block text-[7.5px] uppercase">Goalpost 1 exit</span>
                      <span className="text-[#d4d4d8] font-bold">$16.50 (+32%)</span>
                    </div>
                    <div>
                      <span className="text-zinc-550 block text-[7.5px] uppercase">Stop Guideline</span>
                      <span className="text-[#F87171] font-bold">$9.50 (-24%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 5. QUANT DEALER FLOW FEATURE SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* RENDER CELL */}
          <motion.div 
            initial={{ opacity: 0, x: -60, scale: 0.95 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 w-full"
          >
            <div className="apple-glass rounded-2xl p-5 border border-white/10 shadow-3xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-zinc-300 via-zinc-300 to-[#d4d4d8]" />
              <div className="flex justify-between items-center border-b border-black/60 pb-3 mb-4 font-mono text-[9px] text-zinc-500">
                <span className="font-extrabold uppercase text-[#E5E5E5] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/40 animate-pulse" />
                  ECOLOGICAL QUANT FLOW // CONTINUOUS SWEEPS
                </span>
                <span className="uppercase text-zinc-650 font-bold">LIVE RENDER</span>
              </div>

              {/* Simulated live sweeps ticker flow */}
              <div className="space-y-2 pt-1 font-mono">
                {[
                  { time: '10:48:12', strike: 'SPX 7620 C', type: 'SWEEP', value: '$1.24M', impact: 'HEAVY GEX SWEEP', isGreen: true },
                  { time: '10:48:05', strike: 'QQQ 515 C', type: 'BLOCK', value: '$580K', impact: 'MEDIUM IMPACT', isGreen: true },
                  { time: '10:47:51', strike: 'SPX 7600 P', type: 'SWEEP', value: '$2.15M', impact: 'SEVERE SHIFT', isGreen: false },
                  { time: '10:47:32', strike: 'RUT 2020 C', type: 'BLOCK', value: '$310K', impact: 'LOCAL TRIGGER', isGreen: true }
                ].map((sweep, idx) => (
                  <div 
                    key={idx} 
                    onMouseEnter={() => setHoveredSweep(idx)}
                    onMouseLeave={() => setHoveredSweep(null)}
                    className={`p-2 sm:p-2.5 rounded-lg bg-black/70 border transition-all duration-300 flex justify-between items-center text-[8.5px] sm:text-[9px] ${
                      hoveredSweep === idx ? 'border-black bg-black' : 'border-black'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-650 font-bold">{sweep.time}</span>
                      <span className="text-[#E5E5E5] font-black">{sweep.strike}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-black ${sweep.isGreen ? 'bg-[#4ADE80]/10 text-[#d4d4d8]' : 'bg-rose-500/10 text-rose-405'}`}>
                        {sweep.type}
                      </span>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <span className="text-[#E5E5E5] font-extrabold">{sweep.value}</span>
                      <span className={`hidden sm:inline text-[7.5px] font-black uppercase px-2 py-0.5 rounded ${sweep.isGreen ? 'bg-[#4ADE80]/5 text-[#d4d4d8]' : 'bg-rose-500/5 text-rose-405'}`}>
                        {sweep.impact}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between items-center text-[7.5px] bg-black p-2 border border-black rounded font-bold uppercase tracking-wider text-zinc-505">
                  <span>Continuous sweep pressure ratio:</span>
                  <span className="flex items-center gap-1.5 font-sans">
                    <span className="text-[#d4d4d8] font-mono">BULLISH GEX: 64.2%</span>
                    <span className="text-zinc-700 font-mono">|</span>
                    <span className="text-[#F87171] font-mono">BEARISH DEX: 35.8%</span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* EXPLANATION SLIDE */}
          <motion.div 
            initial={{ opacity: 0, x: 60 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 text-left space-y-6"
          >
            <div className="space-y-2">
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#d4d4d8] uppercase font-bold flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-[#4ADE80]" />
                FLOW MONITOR
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans">
                Dealer Flow Sweep Engine
              </h3>
            </div>
            <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-sans font-light">
              Follow the whale entries that force index swings. Our Dealer Flow Stream continuously indexes institutional block sweep purchases on all major indexing options grids.
            </p>
            
            <ul className="space-y-3 font-mono text-[9px] md:text-[10px] text-zinc-350">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Whale Block Flagging:</strong> Isolate multi-million dollar sweeps forcing quick dealer hedging offsets.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Velocity Indicators:</strong> Tracks sweep rate accelerations to spotlight breakout triggers immediately.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[#d4d4d8] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[#E5E5E5] uppercase font-black mr-1">Buyer Aggregation:</strong> Compiles sub-order streams to compute genuine conviction values.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button 
                onClick={() => handleLaunchToTab('dealerflow')}
                className="px-5 py-3 bg-black hover:bg-black text-[#E5E5E5] border border-black font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Stream Dealer Sweeps</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
};
