/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Info, Gauge } from 'lucide-react';
import { SystemScore } from '../types';

interface ScoreRadarProps {
  score: SystemScore;
}

export function DisplacementScoreRadar({ score }: ScoreRadarProps) {
  const getGrade = (total: number) => {
    if (total >= 95) return { grade: 'Elite', color: 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--surface-2)]' };
    if (total >= 90) return { grade: 'Exceptional', color: 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--surface-2)]' };
    if (total >= 80) return { grade: 'Strong', color: 'text-[var(--text-primary)] border-[var(--border)] bg-[var(--surface-2)]' };
    if (total >= 70) return { grade: 'Good', color: 'text-[var(--success)] border-[var(--border)] bg-[var(--surface-2)]' };
    if (total >= 60) return { grade: 'Tradable', color: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--surface-2)]' };
    return { grade: 'Avoid', color: 'text-[var(--danger)] border-[var(--danger)]/40 bg-[var(--surface-2)]' };
  };

  const { grade, color } = getGrade(score.total);

  // List of weights/breakdowns with helpful institutional tooltips
  const components = [
    { name: 'Displacement Quality', val: score.displacementQuality, max: 15, desc: 'Quality of the body/range ratio & ATR expansion ratio.' },
    { name: 'Volume Expansion', val: score.volumeExpansion, max: 10, desc: 'Volume multiplier & relative institutional buying/selling power.' },
    { name: 'RSI Cascade Multi', val: score.rsiCascade, max: 10, desc: 'Multi-timeframe momentum cascade agreement.' },
    { name: 'VWAP Slope & Dist', val: score.vwapAlignment, max: 10, desc: 'Distance and acceleration of price relative to institutional average.' },
    { name: 'Market Structure Shift', val: score.structureQuality, max: 10, desc: 'Clean breakout strength and sequence of higher highs/lows.' },
    { name: 'Liquidity Event Sweep', val: score.liquiditySweep, max: 10, desc: 'Interaction with high/low liquidity levels & order books.' },
    { name: 'HTF Agreement Matrix', val: score.htfAgreement, max: 10, desc: 'Alignment percentage of aggregate macro timeframes.' },
    { name: 'Volatility Regime Alignment', val: score.volatilityRegime, max: 10, desc: 'Implied vol expansion supporting price displacement.' },
    { name: 'Premium / Discount Deal', val: score.premiumDiscount, max: 5, desc: 'Location inside premium/discount dealing range.' },
    { name: 'Momentum Acceleration', val: score.momentumAcceleration, max: 10, desc: 'Price velocity & short-term explosive impulse.' },
  ];

  // Top-3 contributing components (by fraction of max) shown inline below the
  // breakdown so the meanings are visible without hovering.
  const topComponents = [...components]
    .sort((a, b) => b.val / b.max - a.val / a.max)
    .slice(0, 3);

  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 text-[var(--text-secondary)]" />
          <h3 className="font-display font-medium text-xs md:text-sm tracking-wide text-[var(--text-primary)] uppercase">
            Master Institutional Score
          </h3>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono tracking-wider">REF: SLAYERS_M_01</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center mb-4">
        {/* Giant Score Circle */}
        <div className="md:col-span-5 flex flex-col items-center justify-center py-2">
          <div className="relative w-28 h-28 flex flex-col items-center justify-center rounded-full border-4 border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            {/* Outer score arc indicator */}
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="48"
                stroke="var(--border)"
                strokeWidth="4"
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r="48"
                stroke="var(--success)"
                className="transition-all duration-700"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={301.6}
                strokeDashoffset={301.6 - (301.6 * score.total) / 100}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-3xl font-mono font-bold tracking-tighter tabular-nums text-[var(--text-primary)]">
              {score.total}
            </span>
            <span className="text-[10px] font-mono tracking-widest text-[var(--text-tertiary)] uppercase mt-[-2px]">
              POINTS
            </span>
          </div>

          <div className={`mt-3 px-3 py-1 rounded-full border text-[11px] font-mono font-semibold tracking-wider uppercase ${color}`}>
            {grade}
          </div>
        </div>

        {/* Weighted breakdown list */}
        <div className="md:col-span-7 space-y-2.5">
          {components.map((item, idx) => (
            <div key={idx} className="group relative">
              <div className="flex justify-between items-center text-[11px] font-mono mb-1">
                <span className="text-[var(--text-secondary)] flex items-center gap-1 group-hover:text-[var(--text-primary)] transition-colors">
                  {item.name}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Info className="w-3 text-[var(--text-tertiary)] inline cursor-help" />
                  </span>
                </span>
                <span className="font-semibold text-[var(--success)] tabular-nums">
                  {item.val} <span className="text-[var(--text-tertiary)]">/ {item.max}</span>
                </span>
              </div>
              <div className="w-full bg-[var(--surface)] h-1 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    item.val / item.max >= 0.8
                      ? 'bg-[var(--success)]'
                      : item.val / item.max >= 0.5
                      ? 'bg-[var(--warning)]'
                      : 'bg-[var(--danger)]'
                  }`}
                  style={{ width: `${(item.val / item.max) * 100}%` }}
                />
              </div>

              {/* Dynamic explanations (hover) */}
              <div className="pointer-events-none absolute bottom-full left-0 mb-2 w-64 p-2 mirror-panel rounded shadow-xl text-[10px] font-mono text-[var(--success)] leading-normal opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-10">
                <span className="text-[var(--text-secondary)] font-semibold block mb-0.5">{item.name}</span>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inline top-3 component meanings (visible without hovering) */}
      <div className="border-t border-[var(--border)] pt-3 mt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] block mb-2">
          Top contributing components
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {topComponents.map((item, idx) => (
            <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] rounded-sm p-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-mono font-bold text-[var(--text-primary)]">{item.name}</span>
                <span className="text-[10px] font-mono font-bold text-[var(--success)] tabular-nums">{item.val}/{item.max}</span>
              </div>
              <p className="text-[10px] font-mono text-[var(--text-tertiary)] leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
