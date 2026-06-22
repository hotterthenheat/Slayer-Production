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
      reflexivity_vector: '+0.12 λ [STABLE GRAVITY PIN]',
      systemic_fragility: 'DAMPENED / STABLE',
      campaign_state: 'CONVERGENT GRAVITY RECONCILIATION',
      propagation_path: 'PASSIVE THETA STREAM -> STABILIZED RANGE PIN'
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
        desc: 'Elevated tail stress. High dynamic hedging required.'
      };
    } else if (text.includes('SENSITIVE') || text.includes('FRICTION')) {
      return {
        borderColor: 'border-amber-500/30',
        textColor: 'text-amber-400',
        dotColor: 'bg-amber-400',
        glowColor: 'shadow-amber-400/20',
        desc: 'Intermittent friction detected. Delta sensitivity is moderate.'
      };
    } else {
      return {
        borderColor: 'border-black',
        textColor: 'text-[#4ADE80]',
        dotColor: 'bg-[#4ADE80] text-black',
        glowColor: 'shadow-zinc-300/20',
        desc: 'System remains within normal statistical bounds. Stable core.'
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
            INSTITUTIONAL COCKPIT HUD / SYSTEM MATRIX
          </span>
        </div>
        <div className="flex items-center gap-4 text-[8px] font-mono text-zinc-400 tracking-wider">
          <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 border border-white/10 rounded-xs">
            <Terminal className="w-3 h-3 text-zinc-500" />
            <span className="text-[#4ADE80]">STREAMING CORE: REAL-TIME SEC</span>
          </div>
          <span className="hidden sm:inline-block">REGION: CONTINUOUS INTEGRITY S2</span>
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
                REFLEXIVITY VECTOR
              </span>
            </div>
            <div className="pt-1.5">
              <span className={`text-sm md:text-base font-black tracking-tight ${isNegativeReflexivity ? 'text-[#F87171]' : 'text-[#E5E5E5]'}`}>
                {metrics.reflexivity_vector}
              </span>
            </div>
          </div>
          <span className="text-[8.5px] text-zinc-400 leading-normal font-sans border-t border-white/5 pt-2">
            Captures option feedback-loop speed and dealer delta acceleration strength.
          </span>
        </div>

        {/* Metric 2: Systemic Fragility */}
        <div className={`bg-black/20 border ${fragilityConfig.borderColor} hover:bg-black/30 transition-all rounded p-4 flex flex-col justify-between text-left space-y-3`}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[8px] text-zinc-500 tracking-wider font-extrabold uppercase font-mono">
                SYSTEMIC FRAGILITY
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
                CAMPAIGN STATE
              </span>
            </div>
            <div className="pt-1.5">
              <span className="text-xs md:text-sm font-black text-[#E5E5E5] uppercase tracking-tight">
                {metrics.campaign_state}
              </span>
            </div>
          </div>
          <span className="text-[8.5px] text-zinc-400 leading-normal font-sans border-t border-white/5 pt-2">
            Translates passive and active institutional accumulations into action regimes.
          </span>
        </div>

        {/* Metric 4: Propagation Path */}
        <div className="bg-black/20 border border-white/5 hover:border-white/10 hover:bg-black/30 transition-all rounded p-4 flex flex-col justify-between text-left space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[8px] text-zinc-500 tracking-wider font-extrabold uppercase font-mono">
                PROPAGATION PATH
              </span>
            </div>
            <div className="pt-1.5">
              <span className="text-xs md:text-sm font-black text-[#5ba5fc] uppercase tracking-tight leading-snug">
                {metrics.propagation_path}
              </span>
            </div>
          </div>
          <span className="text-[8.5px] text-zinc-400 leading-normal font-sans border-t border-white/5 pt-2">
            V11 model flow-channel pathway for structural gamma and delta realignments.
          </span>
        </div>

      </div>
    </motion.div>
  );
}
