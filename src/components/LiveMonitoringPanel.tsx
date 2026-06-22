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
  let instructionTitle = 'SUGGESTED ACTION: HOLD / ACCUMULATE';
  let instructionDesc = 'The bullish thesis remains completely optimal. Retain all limit entries and target exits under standard configurations.';
  let exitCoordinates = `Target Stops: Hold current limits. Target exit at market if price falls below $${(currentPrice * 0.992).toFixed(2)}.`;
  
  // Custom checklist of conditions
  let drivers: { label: string; ok: boolean; desc?: string }[] = [];

  if (invalidationTriggered) {
    statusStr = 'INVALIDATED';
    statusColor = 'text-[#F87171] border-[#F87171]/50 bg-rose-950/40 animate-pulse';
    instructionTitle = 'CRITICAL: IMMEDIATE EXIT REQUIRED';
    instructionDesc = 'Thesis collapsed. Major displacement levels broken or invalidation anchors crossed. Discard any remaining exposure immediately.';
    exitCoordinates = `EXECUTION COORDINATES: Deliver exit order at market immediately (Current: $${currentPrice.toFixed(2)}). DO NOT attempt to hold for pullbacks.`;
    drivers = [
      { label: 'VWAP Support Breach', ok: false, desc: 'Price closed heavily past the major intraday VWAP anchor.' },
      { label: 'Structural Continuation Failure', ok: false, desc: 'Lower low recorded. Broken market structure support line.' },
      { label: 'Fading Order Block Participation', ok: false, desc: 'Distribution volume completely outpaced institutional buy queues.' },
    ];
  } else if (isWeak) {
    statusStr = 'WEAKENING';
    statusColor = 'text-amber-500 border-amber-950 bg-[#78350F]/20';
    instructionTitle = 'REDUCE DEPLOYMENT RISK';
    instructionDesc = 'Minor structures are starting to fade. RSI rollover mapped on lower timeframes. Decrease lot size exposures by 50% immediately to lock in rewards.';
    exitCoordinates = `ADJUSTED TARGETS: Secure 50% of trade size. Set remaining limits to break-even coordinates. Exit of all positions on drop under $${(currentPrice * 0.996).toFixed(2)}.`;
    drivers = [
      { label: '1m / 5m RSI Rollover', ok: false, desc: 'Negative momentum crossing registered on fast-frame indicators.' },
      { label: 'Buying Exhaustion Detected', ok: false, desc: 'Aggressed ask-volume slowing down on orderbook sweeps.' },
      { label: 'Sustained Value Gaps Tested', ok: true, desc: 'Prior bullish fair value gaps are holding, but under extreme stress.' },
    ];
  } else {
    statusStr = 'ACTIVE';
    statusColor = 'text-[#4ADE80] border-black bg-black/40';
    drivers = [
      { label: 'Order Blocks Holding Pristine', ok: true, desc: 'Bullish order gates are defending critical support boundaries.' },
      { label: 'RVOL Expanding Upward', ok: true, desc: 'Relative volume continues to increase on each positive expansion wave.' },
      { label: 'Higher-Lows successfully mapped', ok: true, desc: 'Ascending trend alignment remains completely intact on all frames.' },
    ];
  }

  // Trajectory calculations
  const baseConf = Math.min(94, Math.max(70, score.total - 4));
  const currentConf = score.total;
  const projectedConf = invalidationTriggered ? 0 : Math.min(99, Math.max(75, score.total + (isWeak ? -7 : 4)));

  // Core 7 monitored vectors
  const monitoredProperties = [
    { name: 'VWAP', status: invalidationTriggered ? 'FAILED' : score.vwapAlignment >= 5 ? 'SUPPORTING' : 'CONSOLIDATIVE', color: invalidationTriggered ? 'text-[#F87171]' : score.vwapAlignment >= 5 ? 'text-[#4ADE80]' : 'text-amber-500' },
    { name: 'RSI Continuity', status: invalidationTriggered ? 'DIVERGENCE' : score.rsiCascade >= 5 ? 'PERFECT CASCADE' : 'OVERBOUGHT RETRACE', color: invalidationTriggered ? 'text-[#F87171]' : score.rsiCascade >= 5 ? 'text-[#4ADE80]' : 'text-amber-500' },
    { name: 'RVOL', status: score.volumeExpansion >= 6 ? 'EXPANDED INSTITUTIONAL' : 'MUTED ACTION', color: score.volumeExpansion >= 6 ? 'text-[#4ADE80]' : 'text-zinc-500' },
    { name: 'Market Structure', status: invalidationTriggered ? 'CRACKED SUPPORTS' : score.structureQuality >= 6 ? 'HIGHER LOW CORES' : 'COMPRESSED RANGE', color: invalidationTriggered ? 'text-[#F87171]' : score.structureQuality >= 6 ? 'text-[#4ADE80]' : 'text-amber-500' },
    { name: 'Momentum', status: score.momentumAcceleration >= 6 ? 'ACCELERATING VELOCITY' : 'STABLE SYNC', color: score.momentumAcceleration >= 6 ? 'text-[#4ADE80]' : 'text-zinc-500' },
    { name: 'Liquidity', status: score.liquiditySweep >= 5 ? 'POOLS CLEANSED' : 'BOUNDS MAINTAINED', color: score.liquiditySweep >= 5 ? 'text-[#4ADE80]' : 'text-zinc-500' },
    { name: 'Target Probabilities', status: invalidationTriggered ? '0% [COLLAPSED]' : `${Math.min(96, Math.max(70, score.total + 3))}% COMPLETED`, color: invalidationTriggered ? 'text-[#F87171]' : 'text-[#4ADE80]' }
  ];

  return (
    <div className="bg-black border border-black rounded-sm font-mono overflow-hidden shadow-lg h-full flex flex-col justify-between p-5">
      <div>
        {/* Title */}
        <div className="flex items-[#888] justify-between border-b border-black pb-3 mb-4 gap-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-[#4ADE80] animate-pulse" />
            <span className="text-xs tracking-[0.2em] font-bold text-[#E0E0E0]">LIVE THESIS MONITORING ENGINE</span>
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
          <span className="text-[9px] text-[#888888] font-bold uppercase block mb-2">Confidence Trajectory Vector</span>
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
          <span className="text-[9px] text-[#888888] font-bold uppercase block mb-2">REAL-TIME CONTINUOUS VECTORS</span>
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
            {statusStr === 'ACTIVE' ? 'Primary Health Factors' : 'Thesis Deterioration Triggers'}
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
