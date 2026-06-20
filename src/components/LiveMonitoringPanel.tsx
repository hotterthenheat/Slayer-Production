/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShieldAlert, BadgeInfo, CheckCircle, Crosshair, AlertTriangle } from 'lucide-react';
import { SystemScore } from '../types';

interface LiveMonitoringPanelProps {
  score: SystemScore;
  invalidationTriggered: boolean;
  selectedTicker: string;
  currentPrice: number;
  isBullish?: boolean;
}

export function LiveMonitoringPanel({
  score,
  invalidationTriggered,
  selectedTicker,
  currentPrice,
  isBullish = true,
}: LiveMonitoringPanelProps) {
  const isWeak = invalidationTriggered || score.total < 75;

  let statusStr: 'ACTIVE' | 'WEAKENING' | 'INVALIDATED' = 'ACTIVE';
  let statusColor = 'text-[#4ADE80] border-black bg-black/40';
  let instructionTitle = 'SUGGESTED ACTION: HOLD';
  let instructionDesc = 'Setup is still valid. Hold your position and keep your original take-profit and stop-loss levels.';
  let exitCoordinates = `Target Stops: Hold current limits. Target exit at market if price falls below $${(currentPrice * 0.992).toFixed(2)}.`;
  
  // Custom checklist of conditions
  let drivers: { label: string; ok: boolean; desc?: string }[] = [];

  if (invalidationTriggered) {
    statusStr = 'INVALIDATED';
    statusColor = 'text-[#F87171] border-[#F87171]/50 bg-rose-950/40 animate-pulse';
    instructionTitle = 'EXIT NOW';
    instructionDesc = 'Setup has failed. Key support levels are broken. Close your position immediately.';
    exitCoordinates = `EXIT AT MARKET NOW (Current: $${currentPrice.toFixed(2)}). Do not wait for a bounce.`;
    drivers = [
      { label: 'VWAP Support Breach', ok: false, desc: 'Price closed heavily past the major intraday VWAP anchor.' },
      { label: 'Structure Broke Down', ok: false, desc: 'Lower low recorded. Market structure support line broken.' },
      { label: 'Buying Volume Fading', ok: false, desc: 'Sell volume is overtaking buy volume.' },
    ];
  } else if (isWeak) {
    statusStr = 'WEAKENING';
    statusColor = 'text-amber-500 border-amber-950 bg-[#78350F]/20';
    instructionTitle = 'REDUCE POSITION SIZE';
    instructionDesc = 'Momentum is fading on shorter timeframes. Cut your position size by 50% to lock in gains.';
    exitCoordinates = `ADJUSTED PLAN: Close 50% now. Move stop on remainder to break-even. Exit all if price drops under $${(currentPrice * 0.996).toFixed(2)}.`;
    drivers = [
      { label: '1m / 5m RSI Rolling Over', ok: false, desc: 'Momentum turning negative on short-term charts.' },
      { label: 'Buying Momentum Fading', ok: false, desc: 'Buy-side volume weakening on the order book.' },
      { label: 'Fair Value Gaps Holding (Barely)', ok: true, desc: 'Prior bullish fair value gaps are still intact but under stress.' },
    ];
  } else {
    statusStr = 'ACTIVE';
    statusColor = 'text-[#4ADE80] border-black bg-black/40';
    drivers = [
      { label: 'Support Levels Holding', ok: true, desc: 'Key support zones are defending price.' },
      { label: 'Volume Expanding on Up-Moves', ok: true, desc: 'Relative volume increasing with each positive candle.' },
      { label: 'Higher Lows Intact', ok: true, desc: 'Uptrend structure is intact across all timeframes.' },
    ];
  }

  // Trajectory calculations
  const baseConf = Math.min(94, Math.max(70, score.total - 4));
  const currentConf = score.total;
  const projectedConf = invalidationTriggered ? 0 : Math.min(99, Math.max(75, score.total + (isWeak ? -7 : 4)));

  // Core 7 monitored vectors
  const monitoredProperties = [
    { name: 'VWAP', status: invalidationTriggered ? 'FAILED' : score.vwapAlignment >= 5 ? 'SUPPORTING' : 'CONSOLIDATIVE', color: invalidationTriggered ? 'text-[#F87171]' : score.vwapAlignment >= 5 ? 'text-[#4ADE80]' : 'text-amber-500' },
    { name: 'RSI Continuity', status: invalidationTriggered ? 'DIVERGING' : score.rsiCascade >= 5 ? 'TRENDING' : 'OVERBOUGHT - PULLBACK', color: invalidationTriggered ? 'text-[#F87171]' : score.rsiCascade >= 5 ? 'text-[#4ADE80]' : 'text-amber-500' },
    { name: 'RVOL', status: score.volumeExpansion >= 6 ? 'HIGH' : 'NORMAL', color: score.volumeExpansion >= 6 ? 'text-[#4ADE80]' : 'text-zinc-500' },
    { name: 'Market Structure', status: invalidationTriggered ? 'BROKEN' : score.structureQuality >= 6 ? 'HIGHER LOWS' : 'RANGING', color: invalidationTriggered ? 'text-[#F87171]' : score.structureQuality >= 6 ? 'text-[#4ADE80]' : 'text-amber-500' },
    { name: 'Momentum', status: score.momentumAcceleration >= 6 ? 'ACCELERATING' : 'STABLE', color: score.momentumAcceleration >= 6 ? 'text-[#4ADE80]' : 'text-zinc-500' },
    { name: 'Liquidity', status: score.liquiditySweep >= 5 ? 'SWEPT' : 'INTACT', color: score.liquiditySweep >= 5 ? 'text-[#4ADE80]' : 'text-zinc-500' },
    { name: 'Target Probabilities', status: invalidationTriggered ? '0% [FAILED]' : `${Math.min(96, Math.max(70, score.total + 3))}%`, color: invalidationTriggered ? 'text-[#F87171]' : 'text-[#4ADE80]' }
  ];

  return (
    <div className="bg-black border border-black rounded-sm font-mono overflow-hidden shadow-lg h-full flex flex-col justify-between p-5">
      <div>
        {/* Title */}
        <div className="flex items-[#888] justify-between border-b border-black pb-3 mb-4 gap-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-[#4ADE80] animate-pulse" />
            <span className="text-xs tracking-[0.2em] font-bold text-[#E0E0E0]">LIVE TRADE MONITOR</span>
          </div>
          <span className="text-[8px] border border-black px-1.5 bg-black/40 py-0.2 select-none uppercase">continuous feed</span>
        </div>

        {/* State Display */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] text-zinc-550 uppercase font-bold">Thesis Health State</span>
          <span className={`px-3 py-0.5 border text-[11px] font-black rounded-sm uppercase tracking-widest ${statusColor}`}>
            {statusStr}
          </span>
        </div>

        {/* Confidence Vector trajectory */}
        <div className="bg-black/40 p-3 border border-black rounded-sm mb-4">
          <span className="text-[9px] text-[#888888] font-bold uppercase block mb-2">Confidence Trend</span>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500 font-semibold">{baseConf}% [BASE]</span>
            <span className="text-zinc-650">➔</span>
            <span className={`font-black ${statusStr === 'INVALIDATED' ? 'text-rose-500' : statusStr === 'WEAKENING' ? 'text-amber-500' : 'text-[#4ADE80]'}`}>
              {currentConf}% [CURR]
            </span>
            <span className="text-zinc-650">➔</span>
            <span className={`font-black flex items-center gap-1 ${statusStr === 'ACTIVE' ? 'text-[#4ADE80]' : 'text-rose-500'}`}>
              {projectedConf}% [PROJ]
              {statusStr === 'ACTIVE' ? 'holding' : statusStr === 'INVALIDATED' ? 'failing' : 'testing'}
            </span>
          </div>
        </div>

        {/* 7 Monitored Properties Table */}
        <div className="bg-black/25 border border-black rounded-sm p-3 mb-4">
          <span className="text-[9px] text-[#888888] font-bold uppercase block mb-2">LIVE READINGS</span>
          <div className="space-y-1.5 text-[10.5px]">
            {monitoredProperties.map((v, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-black/40 pb-1 last:border-0 last:pb-0">
                <span className="text-zinc-450 font-sans">{v.name}:</span>
                <span className={`font-bold uppercase tracking-wider ${v.color}`}>{v.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Specific drivers/deterioration list */}
        <div className="space-y-2 mb-4">
          <span className="text-[9px] text-[#888888] font-bold uppercase block">
            {statusStr === 'ACTIVE' ? 'Why the Setup is Still Valid' : 'Why the Setup is Failing'}
          </span>
          {drivers.map((drv, idx) => (
            <div key={idx} className="bg-black/60 p-2.5 border border-black rounded-sm">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${drv.ok && statusStr === 'ACTIVE' ? 'bg-black/40' : 'bg-rose-500'}`} />
                <span className={`text-[10.5px] font-bold uppercase ${drv.ok && statusStr === 'ACTIVE' ? 'text-[#4ADE80]' : 'text-[#EF4444]'}`}>
                  {drv.label}
                </span>
              </div>
              {drv.desc && (
                <span className="text-[9.5px] text-zinc-550 block font-sans mt-0.5">
                  {drv.desc}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actionable Exit coordinates */}
      <div className="mt-4 pt-4 border-t border-black">
        <div className={`p-4 border rounded-sm flex gap-3 items-start ${
          statusStr === 'INVALIDATED' 
            ? 'bg-rose-950/15 border-[#F87171]/40 text-[#F87171]' 
            : statusStr === 'WEAKENING' 
            ? 'bg-[#78350F]/10 border-amber-900/40 text-[#D97706]' 
            : 'bg-black/40 border-black text-[#4ADE80]'
        }`}>
          {statusStr === 'INVALIDATED' ? (
            <ShieldAlert className="w-5 h-5 text-[#F87171] mt-0.5 flex-shrink-0 animate-bounce" />
          ) : statusStr === 'WEAKENING' ? (
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0 animate-pulse" />
          ) : (
            <Crosshair className="w-5 h-5 text-[#4ADE80] mt-0.5 flex-shrink-0" />
          )}
          <div className="space-y-1 text-xs">
            <span className="block font-black uppercase tracking-wider">
              {instructionTitle}
            </span>
            <span className="block text-[10.5px] leading-relaxed opacity-90 font-sans">
              {instructionDesc}
            </span>
            <span className="block text-[10px] font-bold p-1 px-1.5 bg-black/60 border border-black font-mono text-[#E5E5E5] rounded-sm mt-2">
              {exitCoordinates}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
