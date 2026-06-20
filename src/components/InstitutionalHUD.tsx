import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { 
  Compass, 
  ShieldAlert, 
  Target, 
  GitBranch, 
  Cpu, 
  Terminal 
} from 'lucide-react';

export function InstitutionalHUD() {
  const serverState = useContractStore((s) => s.serverState);

  // Safely extract hud_metrics with absolute parity to server SSE payload
  const metrics = useMemo(() => {
    return serverState?.hud_metrics || {
      reflexivity_vector: '+0.12 λ [STABLE]',
      systemic_fragility: 'LOW / STABLE',
      campaign_state: 'RANGE-BOUND / THETA DECAY',
      propagation_path: 'THETA DECAY -> RANGE PIN'
    };
  }, [serverState?.hud_metrics]);

  // Derived color indicators for fragility status
  const fragilityConfig = useMemo(() => {
    const text = (metrics.systemic_fragility || '').toUpperCase();
    if (text.includes('CRITICAL')) {
      return {
        borderColor: 'border-rose-500/30',
        textColor: 'text-[#F87171]',
        dotColor: 'bg-rose-500',
        glowColor: 'shadow-rose-500/20',
        desc: 'Elevated stress. Dealers likely hedging aggressively.'
      };
    } else if (text.includes('SENSITIVE') || text.includes('FRICTION')) {
      return {
        borderColor: 'border-amber-500/30',
        textColor: 'text-amber-400',
        dotColor: 'bg-amber-400',
        glowColor: 'shadow-amber-400/20',
        desc: 'Some friction detected. Delta sensitivity is moderate.'
      };
    } else {
      return {
        borderColor: 'border-black',
        textColor: 'text-[#4ADE80]',
        dotColor: 'bg-[#4ADE80] text-black',
        glowColor: 'shadow-zinc-300/20',
        desc: 'Within normal range. Market is stable.'
      };
    }
  }, [metrics.systemic_fragility]);

  // Derived styling for other parameters to fit extreme styling guidelines
  const isNegativeReflexivity = (metrics.reflexivity_vector || '').startsWith('-');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="apple-glass rounded-lg p-5 w-full relative overflow-hidden shadow-2xl flex flex-col"
      id="institutional-hud-frosted-container"
    >
      {/* Absolute background accent grids to reinforce tech-design */}
      <div className="absolute right-0 top-0 bottom-0 w-32 opacity-[0.03] select-none pointer-events-none bg-grid" />
      <div className="absolute top-0 left-[20%] right-[20%] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Cockpit top banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-3.5 mb-5 gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#4ADE80] animate-pulse" />
          <span className="text-[10px] text-[#E5E5E5] tracking-[0.25em] uppercase font-black font-sans leading-none">
            INSTITUTIONAL METRICS HUD
          </span>
        </div>
        <div className="flex items-center gap-4 text-[8px] font-mono text-zinc-400 tracking-wider">
          <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 border border-white/10 rounded-xs">
            <Terminal className="w-3 h-3 text-zinc-500" />
            <span className="text-[#4ADE80]">LIVE FEED: REAL-TIME</span>
          </div>
          <span className="hidden sm:inline-block">SESSION: US MARKET HOURS</span>
        </div>
      </div>

      {/* Grid displays */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        
        {/* Metric 1: Reflexivity Vector */}
        <div className="bg-black/20 border border-white/5 hover:border-white/10 hover:bg-black/30 transition-all rounded p-4 flex flex-col justify-between text-left space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[8px] text-zinc-500 tracking-wider font-extrabold uppercase font-mono">
                FEEDBACK SPEED
              </span>
            </div>
            <div className="pt-1.5">
              <span className={`text-sm md:text-base font-black tracking-tight ${isNegativeReflexivity ? 'text-[#F87171]' : 'text-[#E5E5E5]'}`}>
                {metrics.reflexivity_vector}
              </span>
            </div>
          </div>
          <span className="text-[8.5px] text-zinc-400 leading-normal font-sans border-t border-white/5 pt-2">
            How fast dealer delta adjustments are feeding back into price.
          </span>
        </div>

        {/* Metric 2: Systemic Fragility */}
        <div className={`bg-black/20 border ${fragilityConfig.borderColor} hover:bg-black/30 transition-all rounded p-4 flex flex-col justify-between text-left space-y-3`}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[8px] text-zinc-500 tracking-wider font-extrabold uppercase font-mono">
                MARKET FRAGILITY
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1.5">
              <span className={`w-2 h-2 rounded-full ${fragilityConfig.dotColor} ${fragilityConfig.glowColor} shadow-md`}></span>
              <span className={`text-xs md:text-sm font-black uppercase tracking-tight ${fragilityConfig.textColor}`}>
                {metrics.systemic_fragility}
              </span>
            </div>
          </div>
          <span className="text-[8.5px] text-zinc-400 leading-normal font-sans border-t border-white/5 pt-2">
            {fragilityConfig.desc}
          </span>
        </div>

        {/* Metric 3: Campaign State */}
        <div className="bg-black/20 border border-white/5 hover:border-white/10 hover:bg-black/30 transition-all rounded p-4 flex flex-col justify-between text-left space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[8px] text-zinc-500 tracking-wider font-extrabold uppercase font-mono">
                MARKET STATE
              </span>
            </div>
            <div className="pt-1.5">
              <span className="text-xs md:text-sm font-black text-[#E5E5E5] uppercase tracking-tight">
                {metrics.campaign_state}
              </span>
            </div>
          </div>
          <span className="text-[8.5px] text-zinc-400 leading-normal font-sans border-t border-white/5 pt-2">
            Current market mode based on institutional positioning and order flow.
          </span>
        </div>

        {/* Metric 4: Propagation Path */}
        <div className="bg-black/20 border border-white/5 hover:border-white/10 hover:bg-black/30 transition-all rounded p-4 flex flex-col justify-between text-left space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[8px] text-zinc-500 tracking-wider font-extrabold uppercase font-mono">
                FLOW PATH
              </span>
            </div>
            <div className="pt-1.5">
              <span className="text-xs md:text-sm font-black text-[#5ba5fc] uppercase tracking-tight leading-snug">
                {metrics.propagation_path}
              </span>
            </div>
          </div>
          <span className="text-[8.5px] text-zinc-400 leading-normal font-sans border-t border-white/5 pt-2">
            How gamma and delta are expected to shift as price moves.
          </span>
        </div>

      </div>
    </motion.div>
  );
}
