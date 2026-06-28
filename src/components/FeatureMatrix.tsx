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
    <section className="relative z-10 py-16 w-full overflow-hidden border-t border-[var(--border)]">
      
      {/* Decorative backdrop glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[var(--accent-color)]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[var(--success)] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 space-y-32">
        
        <div className="text-center space-y-3">
          <span className="text-[10px] font-mono tracking-[0.35em] text-[var(--text-tertiary)] font-black bg-[var(--surface-2)] px-4 py-1.5 border border-[var(--border)] rounded-md inline-block">
            Platform Overview
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tight font-sans">
            What Is Inside
          </h2>
          <p className="text-[var(--text-tertiary)] text-xs md:text-sm font-mono max-w-xl mx-auto">
            Scroll to explore the tools powering the platform.
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
              <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--accent-color)]" />
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-4 font-mono text-[9px] text-[var(--text-tertiary)]">
                <span className="font-extrabold text-[var(--text-primary)] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]" />
                  SkyVision · Trade Dashboard
                </span>
                <span className="uppercase text-[var(--text-tertiary)] font-bold border border-white/10 rounded px-1.5 py-0.5 text-[8px] tracking-widest">EXAMPLE</span>
              </div>

              <div className="space-y-4">
                {/* Active forensic asset */}
                <div className="bg-[var(--surface-2)] p-3.5 border border-[var(--border)] rounded-xl flex justify-between items-center font-mono">
                  <div className="space-y-0.5">
                    <span className="text-[8px] text-[var(--text-tertiary)] uppercase block tracking-wider">Active Analytical Asset</span>
                    <span className="text-sm font-black text-[var(--text-primary)] block">SPX 7640 CALL</span>
                  </div>
                  <div className="text-right space-y-0.5">
                    <span className="text-[8px] text-[var(--text-tertiary)] uppercase block">Decision Score</span>
                    <span className="text-sm font-black text-[var(--success)] block">94.2% [VERY HIGH]</span>
                  </div>
                </div>

                {/* Simulated interactive goalposts */}
                <div className="grid grid-cols-3 gap-2.5 font-mono text-center">
                  <button 
                    onClick={() => setActiveGoalpost(0)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${activeGoalpost === 0 ? 'bg-[var(--surface-2)] border-[var(--border-strong)]' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}
                  >
                    <span className="text-[7.5px] text-[var(--text-secondary)] block uppercase font-bold">Entry Point</span>
                    <span className="text-[var(--text-primary)] font-extrabold block text-xs mt-0.5">$12.40</span>
                  </button>
                  <button 
                    onClick={() => setActiveGoalpost(1)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${activeGoalpost === 1 ? 'bg-[var(--surface-2)] border-[var(--border-strong)]' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}
                  >
                    <span className="text-[7.5px] text-[var(--success)] block uppercase font-black">Goalpost 1</span>
                    <span className="text-[var(--success)] font-black block text-xs mt-0.5">$16.50 (+33%)</span>
                  </button>
                  <button 
                    onClick={() => setActiveGoalpost(2)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${activeGoalpost === 2 ? 'bg-[var(--accent-color)]/5 border-[var(--accent-color)]/30' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}
                  >
                    <span className="text-[7.5px] text-[var(--accent-color)] block uppercase font-black">Goalpost 2</span>
                    <span className="text-[var(--accent-color)] font-extrabold block text-xs mt-0.5">$22.30 (+80%)</span>
                  </button>
                </div>

                {/* Dynamic mathematical visuals */}
                <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-[8.5px] font-mono">
                    <span className="text-[var(--text-tertiary)] uppercase font-bold">Dealer Hedge Pressure:</span>
                    <span className="text-[var(--accent-color)] font-bold uppercase text-[8px] leading-relaxed">
                      {activeGoalpost === 0 && 'Stable'}
                      {activeGoalpost === 1 && 'Squeeze Underway'}
                      {activeGoalpost === 2 && 'Full Breakout Range'}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--surface-2)] h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-[var(--accent-color)] h-full transition-all duration-500"
                      style={{ width: activeGoalpost === 0 ? '45%' : activeGoalpost === 1 ? '78%' : '96%' }} 
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1 pt-1 text-[7.5px] text-[var(--text-tertiary)] font-mono text-center">
                    <div className="border border-[var(--border)] py-1 bg-[var(--surface-2)] rounded">Delta: 0.52</div>
                    <div className="border border-[var(--border)] py-1 bg-[var(--surface-2)] rounded">Gamma: 0.08</div>
                    <div className="border border-[var(--border)] py-1 bg-[var(--surface-2)] rounded">Vanna: 0.04</div>
                    <div className="border border-[var(--border)] py-1 bg-[var(--surface-2)] rounded">Charm: 0.12</div>
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
              <span className="text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)] uppercase font-bold flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-[var(--accent-color)]" />
                TRADE DASHBOARD
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] tracking-tight font-sans">
                SkyVision Dashboard
              </h3>
            </div>
            <p className="text-[var(--text-tertiary)] text-xs md:text-sm leading-relaxed font-sans font-light">
              The main trade analysis screen. SkyVision highlights specific index option contracts showing potential mispricings and strong dealer hedging setups.
            </p>

            <ul className="space-y-3 font-mono text-[10px] md:text-[10px] text-[var(--text-secondary)]">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Option Goalposts:</strong> Auto-calculated take-profit targets based on live dealer positioning.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Conviction Score:</strong> 100-point score combining flow direction and the option Greeks profile.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">IV Pressure Zones:</strong> Shows where dealer hedging is absorbing or amplifying price moves.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button
                onClick={handleLaunchToSkyeye}
                className="px-5 py-3 bg-[var(--text-primary)] text-[var(--surface)] hover:opacity-90 font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Open SkyVision</span>
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
              <span className="text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)] uppercase font-bold flex items-center gap-1.5">
                <Compass className="w-3 h-3 text-[var(--success)]" />
                GEX MAP
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans">
                Pinpoint GEX Chart
              </h3>
            </div>
            <p className="text-[var(--text-tertiary)] text-xs md:text-sm leading-relaxed font-sans font-light">
              Every options trade forces the market maker to hedge. Pinpoint tracks those hedges by strike so you can see exactly where dealer buying and selling pressure sits.
            </p>
            
            <ul className="space-y-3 font-mono text-[10px] md:text-[10px] text-[var(--text-secondary)]">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Gamma Support:</strong> Spot the areas where passive dealer hedging cushions any drops.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Call & Put Walls:</strong> Locate the key overhead pinning strikes representing absolute institutional limits.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Dealer Position Score:</strong> Continuously indexes whether dealers are short or long Gamma.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button
                onClick={() => handleLaunchToTab('pinpoint')}
                className="px-5 py-3 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border)] font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Open Pinpoint GEX</span>
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
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--border-strong)] via-[var(--border)] to-[var(--border)]" />
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-4 font-mono text-[9px] text-[var(--text-tertiary)]">
                <span className="font-extrabold uppercase text-[var(--text-primary)] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                  PINPOINT // GEX BY STRIKE
                </span>
                <span className="uppercase text-[var(--text-tertiary)] font-bold border border-white/10 rounded px-1.5 py-0.5 text-[8px] tracking-widest">EXAMPLE</span>
              </div>

              {/* Simulated GEX Strike Histogram bar layout */}
              <div className="space-y-3 font-mono">
                
                {/* Spot Price tracker */}
                <div className="flex justify-between items-center text-[8.5px] border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--text-tertiary)] uppercase font-black text-[7.5px]">ATM Spot Target:</span>
                  <span className="text-[var(--text-secondary)] font-black">7620.42 oscillating</span>
                </div>

                {/* Histogram bars */}
                <div className="space-y-2.5">
                  {[
                    { strike: '7640 [CALL WALL]', gex: '+28.4M', pct: '92%', type: 'HEAVY CEILING', color: 'border-[var(--text-secondary)]', bg: 'bg-[var(--success)]/20', txt: 'text-[var(--text-secondary)]' },
                    { strike: '7630 [ATM SPOT AREA]', gex: '+4.5M', pct: '40%', type: 'SPOT PIN RISK', color: 'border-[var(--accent-color)]', bg: 'bg-[var(--accent-color)]/10', txt: 'text-[var(--text-tertiary)]' },
                    { strike: '7610 [GAMMA FLIP]', gex: '-11.8M', pct: '65%', type: 'VOL TRANSITION', color: 'border-rose-400', bg: 'bg-rose-500/10', txt: 'text-[var(--danger)]' }
                  ].map((row, idx) => (
                    <div 
                      key={idx}
                      onMouseEnter={() => setHoveredGexStrike(idx)}
                      onMouseLeave={() => setHoveredGexStrike(null)}
                      className={`space-y-1 transition-all duration-300 ${hoveredGexStrike === idx ? 'scale-[1.01]' : ''}`}
                    >
                      <div className="flex justify-between text-[8px] text-[var(--text-tertiary)] font-bold">
                        <span>Strike {row.strike}</span>
                        <span className={`${row.txt} font-extrabold`}>{row.gex} GEX</span>
                      </div>
                      <div className="h-4 bg-[var(--surface-2)] font-mono rounded overflow-hidden flex items-center px-1 border border-[var(--border)] relative">
                        <div className={`h-full ${row.bg} transition-all border-r-2 ${row.color}`} style={{ width: row.pct }} />
                        <span className={`text-[7.5px] ${row.txt} ml-2 font-black font-sans relative z-10 whitespace-nowrap`}>
                          {row.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-[var(--surface-2)] p-2 text-[8px] text-[var(--text-tertiary)] text-center uppercase tracking-wide border border-[var(--border)] rounded">
                  Magnet Strike: <strong className="text-[var(--text-primary)]">7620.00</strong> | Net positioning score: <span className="text-[var(--success)] font-bold">68 / Bullish long-gamma</span>
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
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--border-strong)] via-[var(--border)] to-[var(--border)]" />
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-4 font-mono text-[9px] text-[var(--text-tertiary)]">
                <span className="font-extrabold uppercase text-[var(--text-primary)] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                  TRADE HISTORY ARCHIVE
                </span>
                <span className="uppercase text-[var(--text-tertiary)] font-bold border border-white/10 rounded px-1.5 py-0.5 text-[8px] tracking-widest">EXAMPLE</span>
              </div>

              {/* Illustrative trade-history table (example rows, not actual trades) */}
              <div className="space-y-2.5 font-mono">
                <div className="grid grid-cols-12 text-[7.5px] uppercase font-bold text-[var(--text-tertiary)] px-2 pb-1 border-b border-[var(--border)]">
                  <span className="col-span-4 text-left">CONTRACT</span>
                  <span className="col-span-4 text-center">ENTRANCE</span>
                  <span className="col-span-4 text-right">RESULT</span>
                </div>

                <div className="space-y-1.5">
                  {[
                    { contract: 'SPX 7620C', enter: '$11.20', result: '+38.2% Exit', rColor: 'text-[var(--text-secondary)]' },
                    { contract: 'QQQ 515C', enter: '$2.10', result: '+22.4% Exit', rColor: 'text-[var(--text-secondary)]' },
                    { contract: 'NDX 18300C', enter: '$165.40', result: '-12.5% Out', rColor: 'text-[var(--danger)]' }
                  ].map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-center text-[9px] bg-[var(--surface-2)] p-2 rounded border border-[var(--border)]">
                      <span className="col-span-4 font-bold text-[var(--text-primary)] uppercase text-[8.5px] sm:text-[9.5px]">{row.contract}</span>
                      <span className="col-span-4 text-center text-[var(--text-tertiary)]">{row.enter}</span>
                      <span className={`col-span-4 text-right font-bold ${row.rColor} text-[8.5px] sm:text-[9.5px]`}>{row.result}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center bg-[var(--surface-2)] px-3 py-2 rounded border border-[var(--border)] text-[8px] text-[var(--text-tertiary)] uppercase tracking-wide">
                  <span className="font-bold text-[var(--text-tertiary)]">
                    Illustrative example — not actual trades
                  </span>
                  <span>Sample data</span>
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
              <span className="text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)] uppercase font-bold flex items-center gap-1.5">
                <Database className="w-3 h-3 text-[var(--text-tertiary)]" />
                TRADE HISTORY
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans">
                The Trade Ledger
              </h3>
            </div>
            <p className="text-[var(--text-tertiary)] text-xs md:text-sm leading-relaxed font-sans font-light">
              No deleted calls, no edited screenshots. As the engine logs trades, each one is recorded with its entry and outcome so the track record stays in one place.
            </p>

            <ul className="space-y-3 font-mono text-[10px] md:text-[10px] text-[var(--text-secondary)]">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Timestamped Logs:</strong> Each logged trade keeps the time and entry it was recorded at.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Historical Record:</strong> Review past entries and outcomes as they were logged.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">One Track Record:</strong> Wins and losses sit together in the same ledger.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button 
                onClick={() => handleLaunchToTab('auditor')}
                className="px-5 py-3 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border)] font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
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
              <span className="text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)] uppercase font-bold flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3 text-[#5865F2]" />
                DISCORD ALERTS
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans">
                Discord Trade Alerts
              </h3>
            </div>
            <p className="text-[var(--text-tertiary)] text-xs md:text-sm leading-relaxed font-sans font-light">
              Get trade alerts straight to your phone via Discord. Automated alerts are sent to the channel the moment a setup is detected.
            </p>

            <ul className="space-y-3 font-mono text-[10px] md:text-[10px] text-[var(--text-secondary)]">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Instant Delivery:</strong> Alerts go straight from the server to Discord with no manual step.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Clear Alert Format:</strong> Each alert includes the target, entry range, take-profit levels, and stop loss.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Active Community:</strong> Chat live with other options traders in the server.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button
                onClick={() => handleLaunchToTab('community')}
                className="px-5 py-3 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border)] font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Open Discord</span>
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
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-4 font-mono text-[9px] text-[var(--text-tertiary)]">
                <span className="font-extrabold uppercase text-[var(--text-primary)] tracking-widest flex items-center gap-1.5">
                  <span className="font-bold text-[var(--text-primary)] bg-[#5865F2] px-2 py-0.5 rounded-sm text-[7px] leading-relaxed">DISCORD</span>
                  #spx-realtime-alerts webhook
                </span>
                <span className="uppercase text-[var(--text-tertiary)] font-bold border border-white/10 rounded px-1.5 py-0.5 text-[8px] tracking-widest">EXAMPLE</span>
              </div>

              {/* Mock discord message embed card */}
              <div className="bg-[#2f3136] rounded-lg p-4 font-sans text-left border border-[var(--border)] space-y-3 relative overflow-hidden shadow-xl select-none">
                <div className="absolute top-0 right-0 bg-[var(--success)]/15 text-[var(--text-secondary)] text-[7.5px] font-mono tracking-widest px-2.5 py-1.5 rounded-bl-lg font-black uppercase">
                  SAMPLE ALERT
                </div>

                <div className="flex items-center gap-2 font-mono">
                  <div className="w-7 h-7 rounded-full bg-[var(--success)]/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-[var(--text-secondary)]" />
                  </div>
                  <div>
                    <span className="font-extrabold text-[var(--text-primary)] text-[11px] block">Slayer Signal Bot</span>
                    <span className="text-[var(--text-tertiary)] text-[7px] uppercase tracking-wider block">Today at 9:18 AM</span>
                  </div>
                </div>

                {/* Main Embed section */}
                <div className="bg-[var(--surface-2)] border-l-4 border-[var(--text-secondary)] p-3.5 rounded-r-md space-y-2 text-xs">
                  <div className="font-mono text-[10.5px] font-black text-[var(--text-secondary)] uppercase">
                     SPX ALERT: HIGH-SCORE SETUP FOUND
                  </div>
                  <p className="text-[var(--success)] text-[10.5px] font-light leading-snug">
                    Large options order flow detected on SPX. IV is compressing above key support.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[var(--border)] font-mono text-[9.5px]">
                    <div>
                      <span className="text-[var(--text-tertiary)] block text-[7.5px] uppercase">Option target</span>
                      <span className="text-[var(--text-primary)] font-extrabold">SPX 7620 CALL</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] block text-[7.5px] uppercase">Entry threshold</span>
                      <span className="text-[var(--text-primary)] font-extrabold">Under $12.50</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] block text-[7.5px] uppercase">Goalpost 1 exit</span>
                      <span className="text-[var(--text-secondary)] font-bold">$16.50 (+32%)</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] block text-[7.5px] uppercase">Stop Guideline</span>
                      <span className="text-[var(--danger)] font-bold">$9.50 (-24%)</span>
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
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--border-strong)] via-[var(--border)] to-[var(--border)]" />
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-4 font-mono text-[9px] text-[var(--text-tertiary)]">
                <span className="font-extrabold uppercase text-[var(--text-primary)] tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                  DEALER FLOW // SWEEPS
                </span>
                <span className="uppercase text-[var(--text-tertiary)] font-bold border border-white/10 rounded px-1.5 py-0.5 text-[8px] tracking-widest">EXAMPLE</span>
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
                    className={`p-2 sm:p-2.5 rounded-lg bg-[var(--surface-2)] border transition-all duration-300 flex justify-between items-center text-[8.5px] sm:text-[9px] ${
                      hoveredSweep === idx ? 'border-[var(--border)] bg-[var(--surface-3)]' : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--text-tertiary)] font-bold">{sweep.time}</span>
                      <span className="text-[var(--text-primary)] font-black">{sweep.strike}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-black ${sweep.isGreen ? 'bg-[var(--success)]/10 text-[var(--text-secondary)]' : 'bg-rose-500/10 text-rose-400'}`}>
                        {sweep.type}
                      </span>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <span className="text-[var(--text-primary)] font-extrabold">{sweep.value}</span>
                      <span className={`hidden sm:inline text-[7.5px] font-black uppercase px-2 py-0.5 rounded ${sweep.isGreen ? 'bg-[var(--success)]/5 text-[var(--text-secondary)]' : 'bg-rose-500/5 text-rose-400'}`}>
                        {sweep.impact}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between items-center text-[7.5px] bg-[var(--surface-2)] p-2 border border-[var(--border)] rounded font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <span>Continuous sweep pressure ratio:</span>
                  <span className="flex items-center gap-1.5 font-sans">
                    <span className="text-[var(--text-secondary)] font-mono">BULLISH GEX: 64.2%</span>
                    <span className="text-[var(--text-tertiary)] font-mono">|</span>
                    <span className="text-[var(--danger)] font-mono">BEARISH DEX: 35.8%</span>
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
              <span className="text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)] uppercase font-bold flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-[var(--success)]" />
                ORDER FLOW
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans">
                Live Order-Flow Monitor
              </h3>
            </div>
            <p className="text-[var(--text-tertiary)] text-xs md:text-sm leading-relaxed font-sans font-light">
              See the large trades that move index prices. The Dealer Flow feed watches for institutional block sweeps across major index options and flags them as they print.
            </p>

            <ul className="space-y-3 font-mono text-[10px] md:text-[10px] text-[var(--text-secondary)]">
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Large Block Alerts:</strong> Flags multi-million dollar sweeps that force dealers to hedge quickly.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Sweep Rate Tracker:</strong> Watches how fast sweeps accelerate to catch breakout moves early.</span>
              </li>
              <li className="flex gap-2 items-start">
                <Check className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5 animate-pulse" />
                <span><strong className="text-[var(--text-primary)] uppercase font-black mr-1">Aggregated Flow Score:</strong> Rolls up split orders to show the true buyer conviction level.</span>
              </li>
            </ul>

            <div className="pt-2">
              <button
                onClick={() => handleLaunchToTab('dealerflow')}
                className="px-5 py-3 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border)] font-extrabold uppercase tracking-widest text-[9px] rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <span>Open Dealer Flow</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
};
