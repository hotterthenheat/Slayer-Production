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
    if (total >= 95) return { grade: 'Elite', color: 'text-[#4ADE80] border-black bg-black/40' };
    if (total >= 90) return { grade: 'Exceptional', color: 'text-[#4ADE80]/90 border-black bg-black/40' };
    if (total >= 80) return { grade: 'Strong', color: 'text-zinc-200 border-black bg-black' };
    if (total >= 70) return { grade: 'Good', color: 'text-[#4ADE80] border-black bg-black' };
    if (total >= 60) return { grade: 'Tradable', color: 'text-amber-400 border-amber-800 bg-amber-950/20' };
    return { grade: 'Avoid', color: 'text-[#F87171] border-rose-900 bg-rose-950/30' };
  };

  const { grade, color } = getGrade(score.total);

  // List of weights/breakdowns with helpful institutional tooltips
  const components = [
    { name: 'Move Quality', val: score.displacementQuality, max: 15, desc: 'Candle body vs. range ratio and how far price expanded vs. ATR.' },
    { name: 'Volume Expansion', val: score.volumeExpansion, max: 10, desc: 'Volume multiplier vs. average — how hard buyers/sellers hit.' },
    { name: 'RSI Multi-TF', val: score.rsiCascade, max: 10, desc: 'RSI momentum agreement across multiple timeframes.' },
    { name: 'VWAP Slope & Dist', val: score.vwapAlignment, max: 10, desc: 'How far and fast price is running from VWAP.' },
    { name: 'Structure Break', val: score.structureQuality, max: 10, desc: 'Clean breakout strength and sequence of higher highs/lows.' },
    { name: 'Liquidity Sweep', val: score.liquiditySweep, max: 10, desc: 'Price swept a key high/low liquidity level.' },
    { name: 'Higher TF Agreement', val: score.htfAgreement, max: 10, desc: 'How many higher timeframes agree with the current move.' },
    { name: 'Volatility Alignment', val: score.volatilityRegime, max: 10, desc: 'IV expansion backing the price move.' },
    { name: 'Premium / Discount', val: score.premiumDiscount, max: 5, desc: 'Where price sits in the current dealing range.' },
    { name: 'Momentum Acceleration', val: score.momentumAcceleration, max: 10, desc: 'Price velocity and short-term impulse strength.' },
  ];

  return (
    <div className="bg-black/40 border border-black rounded-sm p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 animate-pulse text-zinc-400" />
          <h3 className="font-display font-medium text-xs md:text-sm tracking-wide text-zinc-100 uppercase">
            Setup Score
          </h3>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono tracking-wider">REF: SLAYERS_M_01</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center mb-4">
        {/* Giant Score Circle */}
        <div className="md:col-span-5 flex flex-col items-center justify-center py-2">
          <div className="relative w-28 h-28 flex flex-col items-center justify-center rounded-full border-4 border-black bg-black/80 shadow-2xl">
            {/* Outer score arc indicator */}
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="48"
                className="stroke-zinc-900"
                strokeWidth="4"
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r="48"
                className="stroke-zinc-300 transition-all duration-700"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={301.6}
                strokeDashoffset={301.6 - (301.6 * score.total) / 100}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-3xl font-mono font-bold tracking-tighter text-zinc-150">
              {score.total}
            </span>
            <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase mt-[-2px]">
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
                <span className="text-zinc-400 flex items-center gap-1 group-hover:text-zinc-100 transition-colors">
                  {item.name}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Info className="w-3 text-zinc-500 inline cursor-help" />
                  </span>
                </span>
                <span className="font-semibold text-[#4ADE80]">
                  {item.val} <span className="text-zinc-600">/ {item.max}</span>
                </span>
              </div>
              <div className="w-full bg-black h-1 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    item.val / item.max >= 0.8
                      ? 'bg-[#4ADE80] text-black'
                      : item.val / item.max >= 0.5
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${(item.val / item.max) * 100}%` }}
                />
              </div>
              
              {/* Dynamic explanations */}
              <div className="pointer-events-none absolute bottom-full left-0 mb-2 w-64 p-2 mirror-panel rounded shadow-xl text-[10px] font-mono text-[#4ADE80] leading-normal opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-10">
                <span className="text-zinc-400 font-semibold block mb-0.5">{item.name}</span>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
