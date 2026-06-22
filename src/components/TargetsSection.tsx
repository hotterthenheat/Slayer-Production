/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Target, Milestone, Zap, Crosshair } from 'lucide-react';
import { TargetLevel } from '../types';

interface TargetsSectionProps {
  targets: TargetLevel[];
  assetName: string;
  decimals: number;
}

export function TargetsSection({ targets, assetName, decimals }: TargetsSectionProps) {
  // Option-specific targets mapping to match V3 specifications
  const optionTargets = targets.map((t, idx) => {
    let multiplier = 1;
    let etaStr = '5-15 Minutes';
    let riskReward = '1.5:1';
    let confidenceLevel: 'HIGH' | 'MODERATE' | 'STRETCH' = 'HIGH';
    
    if (idx === 0) {
      multiplier = 1.15;
      etaStr = '5-15 Minutes';
      riskReward = '1.2 : 1';
      confidenceLevel = 'HIGH';
    } else if (idx === 1) {
      multiplier = 1.34;
      etaStr = '15-30 Minutes';
      riskReward = '2.5 : 1';
      confidenceLevel = 'HIGH';
    } else if (idx === 2) {
      multiplier = 1.68;
      etaStr = '30-45 Minutes';
      riskReward = '4.2 : 1';
      confidenceLevel = 'MODERATE';
    } else {
      multiplier = 2.40;
      etaStr = '1-2 Hours';
      riskReward = '7.8 : 1';
      confidenceLevel = 'STRETCH';
    }

    const value = Math.max(0.45, (t.price * 0.0004 * multiplier * (decimals === 5 ? 100000 : 1)));

    return {
      ...t,
      title: idx === 3 ? 'STRETCH TARGET' : `TARGET ${idx + 1}`,
      optionValue: `$${value.toFixed(2)}`,
      eta: etaStr,
      probability: t.probabilityPct,
      riskReward,
      confidenceLevel,
    };
  });

  return (
    <div className="bg-black border border-black rounded-sm font-mono overflow-hidden shadow-lg p-5">
      <div className="flex items-center justify-between border-b border-black pb-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Crosshair className="w-4 h-4 text-[#4ADE80] animate-spin" style={{ animationDuration: '6s' }} />
          <span className="text-xs tracking-[0.2em] font-bold text-[#E0E0E0]">PROJECTION TARGET ENGINE</span>
        </div>
        <span className="text-[9px] text-[#888888] font-bold tracking-widest border border-black px-2 py-0.5 bg-black/40">MODEL: OPTION ESTIMATOR V3</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {optionTargets.map((item, idx) => {
          let sideBorder = 'border-l-2 border-black';
          let badgeBgColor = 'bg-black/40 text-[#4ADE80] border border-black';
          let icon = <Target className="w-4 h-4 text-[#4ADE80]" />;

          if (idx === 2) {
            sideBorder = 'border-l-2 border-amber-500';
            badgeBgColor = 'bg-amber-950/40 text-amber-500 border border-amber-900/30';
            icon = <Milestone className="w-4 h-4 text-amber-500" />;
          } else if (idx === 3) {
            sideBorder = 'border-l-2 border-rose-500';
            badgeBgColor = 'bg-rose-950/40 text-[#F87171] border border-[#F87171]/30';
            icon = <Zap className="w-4 h-4 text-[#F87171]" />;
          }

          return (
            <div
              key={item.id}
              className={`bg-black/35 p-4 border border-black flex flex-col justify-between rounded-sm ${sideBorder} hover:border-[#3A3A3D] transition-colors`}
            >
              <div>
                <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
                  <span className="text-[9.5px] text-[#888888] font-bold uppercase tracking-wider">{item.title}</span>
                  {icon}
                </div>
                
                {/* Option Value */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#888888] uppercase select-none">Option Value</span>
                  <span className="text-sm font-black text-[#E5E5E5] font-mono tracking-wide">{item.optionValue}</span>
                </div>

                {/* Probability */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#888888] uppercase select-none">Probability</span>
                  <span className="text-xs font-bold text-[#E5E5E5] font-mono">{item.probability}%</span>
                </div>

                {/* Confidence Level */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#888888] uppercase select-none">Confidence</span>
                  <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-sm tracking-widest ${badgeBgColor}`}>
                    {item.confidenceLevel}
                  </span>
                </div>

                {/* Risk Reward */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#888888] uppercase select-none">Risk / Reward</span>
                  <span className="text-xs font-bold text-[#4ADE80] font-mono">{item.riskReward}</span>
                </div>
              </div>

              {/* Footer ETA */}
              <div className="mt-4 pt-2.5 border-t border-black flex justify-between items-center text-[10px]">
                <span className="text-[#66666A] uppercase font-bold tracking-tight">target eta</span>
                <span className="text-[#4ADE80] font-bold font-mono">{item.eta}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
