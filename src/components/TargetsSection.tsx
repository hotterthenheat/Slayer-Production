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
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono overflow-hidden shadow-lg p-5">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Crosshair className="w-4 h-4 text-[var(--success)]" />
          <span className="text-xs tracking-[0.2em] font-bold text-[var(--text-primary)]">PROJECTION TARGET ENGINE</span>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)] font-bold tracking-widest border border-[var(--border)] px-2 py-0.5 bg-[var(--surface-2)]">MODEL: OPTION ESTIMATOR V3</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {optionTargets.map((item, idx) => {
          let sideBorder = 'border-l-2 border-[var(--success)]';
          let confidenceColor = 'text-[var(--success)]';
          let confidenceBadge = 'bg-[var(--surface-2)] text-[var(--success)] border border-[var(--success)]/40';
          let icon = <Target className="w-4 h-4 text-[var(--success)]" />;

          if (idx === 2) {
            sideBorder = 'border-l-2 border-[var(--warning)]';
            confidenceColor = 'text-[var(--warning)]';
            confidenceBadge = 'bg-[var(--surface-2)] text-[var(--warning)] border border-[var(--warning)]/40';
            icon = <Milestone className="w-4 h-4 text-[var(--warning)]" />;
          } else if (idx === 3) {
            sideBorder = 'border-l-2 border-[var(--danger)]';
            confidenceColor = 'text-[var(--danger)]';
            confidenceBadge = 'bg-[var(--surface-2)] text-[var(--danger)] border border-[var(--danger)]/40';
            icon = <Zap className="w-4 h-4 text-[var(--danger)]" />;
          }

          return (
            <div
              key={item.id}
              className={`bg-[var(--surface-2)] p-4 border border-[var(--border)] flex flex-col justify-between rounded-sm ${sideBorder} hover:border-[var(--border-strong)] transition-colors`}
            >
              <div>
                {/* Header: title + elevated confidence badge with color weight */}
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    {icon}
                    <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">{item.title}</span>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-sm tracking-widest ${confidenceBadge}`}>
                    {item.confidenceLevel}
                  </span>
                </div>

                {/* Option Value */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase select-none">Option Value</span>
                  <span className="text-sm font-black text-[var(--text-primary)] font-mono tracking-wide tabular-nums">{item.optionValue}</span>
                </div>

                {/* Probability */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase select-none">Probability</span>
                  <span className="text-xs font-bold text-[var(--text-primary)] font-mono tabular-nums">{item.probability}%</span>
                </div>

                {/* Risk Reward */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase select-none">Risk / Reward</span>
                  <span className={`text-xs font-bold font-mono tabular-nums ${confidenceColor}`}>{item.riskReward}</span>
                </div>
              </div>

              {/* Footer ETA */}
              <div className="mt-4 pt-2.5 border-t border-[var(--border)] flex justify-between items-center text-[10px]">
                <span className="text-[var(--text-tertiary)] uppercase font-bold tracking-tight">target eta</span>
                <span className="text-[var(--success)] font-bold font-mono tabular-nums">{item.eta}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
