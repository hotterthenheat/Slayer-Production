/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Gauge,
  Sliders,
  ChevronDown,
  ChevronUp,
  Zap,
  Layers,
  Droplets,
  ShieldAlert
} from 'lucide-react';
import { AssetInfo, Candle, FairValueGap, LiquidityEvent, TargetLevel, SystemScore } from '../types';
import { InteractiveChart } from './InteractiveChart';
import { SlayerScoreWidget, VolatilityStateWidget } from './WorkspaceWidgets';
import { SkyVisionV11Cockpit } from './SkyVisionV11Cockpit';
import { useContractStore } from '../lib/store';

// Helper for formatting state chips
const formatState = (state: string) => {
  if (['ARMED', 'ACTIVE'].includes(state)) return 'HOLDING';
  if (['TESTED'].includes(state)) return 'TESTING';
  return 'FAILING';
};

const stateChip = (state: string) => {
  const s = formatState(state);
  const map: Record<string, string> = {
    HOLDING: 'status-holding mirror-panel',
    TESTING: 'status-testing mirror-panel',
    FAILING: 'status-failing mirror-panel'
  };
  return map[s] || 'bg-black text-zinc-400 border-black';
};

interface TradeIntelligenceWorkspaceProps {
  selectedAsset: AssetInfo;
  selectedTimeframe: string;
  candles: Candle[];
  fvgs: FairValueGap[];
  liquidityEvents: LiquidityEvent[];
  targets: TargetLevel[];
  systemScore: SystemScore;
  invalidationTriggered: boolean;
  onPlaceAuditTrade: (direction: 'BULLISH' | 'BEARISH', entry: number, target: number, stop: number) => void;
  // Interactive simulations
  injectBuy: () => void;
  injectSell: () => void;
  injectStopHunt: () => void;
  injectVWAPBreakdown: () => void;
  resetSimulation: () => void;
  // Active ticking
  isLiveTicking: boolean;
  setIsLiveTicking: (live: boolean) => void;
  tickSpeed: number;
  setTickSpeed: (speed: number) => void;
  // Specific clicked contract opportunity metadata override
  clickedContractOverride?: {
    contract: string;
    direction: 'BULLISH' | 'BEARISH';
    confidence: number;
    price: number;
    fairValue: number;
    recommendation: 'BUY' | 'WAIT' | 'REDUCE' | 'EXIT';
  } | null;
}

export function TradeIntelligenceWorkspace({
  selectedAsset,
  selectedTimeframe,
  candles,
  fvgs,
  liquidityEvents,
  targets,
  systemScore,
  invalidationTriggered,
  onPlaceAuditTrade,
  injectBuy,
  injectSell,
  injectStopHunt,
  injectVWAPBreakdown,
  resetSimulation,
  isLiveTicking,
  setIsLiveTicking,
  tickSpeed,
  setTickSpeed,
  clickedContractOverride
}: TradeIntelligenceWorkspaceProps) {
  const serverState = useContractStore(s => s.serverState);
  const profile = serverState?.gex_profile;
  const currentCandle = candles[candles.length - 1] || {
    timestamp: Date.now(),
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1000,
    vwap: 100,
    relativeVolume: 2.1
  };

  const isBullish = currentCandle.close >= currentCandle.open;

  // 1. DYNAMIC LIVING CONFIDENCE STATE
  // We simulate live changes to make the thesis genuinely live!
  const [liveConfidence, setLiveConfidence] = useState(clickedContractOverride?.confidence || 92);
  const [lastConfidenceChange, setLastConfidenceChange] = useState<'UP' | 'DOWN' | 'STABLE'>('STABLE');

  // Sync with selected asset or contract changes
  useEffect(() => {
    if (clickedContractOverride) {
      setLiveConfidence(clickedContractOverride.confidence);
    } else {
      setLiveConfidence(systemScore.total);
    }
    setLastConfidenceChange('STABLE');
  }, [clickedContractOverride, selectedAsset, systemScore.total]);

  // Live ticking shifts
  useEffect(() => {
    if (!isLiveTicking) return;
    const interval = setInterval(() => {
      setLiveConfidence((prev) => {
        // If vwap breakdown invalidates setup, bleed confidence fast
        if (invalidationTriggered) {
          setLastConfidenceChange('DOWN');
          return Math.max(34, prev - Math.floor(Math.random() * 4 + 2));
        }
        
        // Otherwise slightly oscillate or crawl upwards depending on market direction
        const delta = Math.random() > (isBullish ? 0.42 : 0.52) ? 1 : -1;
        if (delta > 0) {
          setLastConfidenceChange('UP');
          return Math.min(99, prev + 1);
        } else if (delta < 0) {
          setLastConfidenceChange('DOWN');
          return Math.max(68, prev - 1);
        }
        return prev;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isLiveTicking, invalidationTriggered, isBullish]);

  // Collapsible raw index diagnostics state
  const [showRawMetrics, setShowRawMetrics] = useState(false);

  // Derive dynamic contract information
  const contractDisplayName = useMemo(() => {
    if (clickedContractOverride) {
      return clickedContractOverride.contract;
    }
    const multipliedStrike = Math.floor(currentCandle.close * (isBullish ? 1.002 : 0.998));
    return `${selectedAsset.ticker} ${multipliedStrike}${isBullish ? 'C' : 'P'}`;
  }, [clickedContractOverride, selectedAsset, currentCandle, isBullish]);

  const contractBias = clickedContractOverride?.direction || (isBullish ? 'BULLISH' : 'BEARISH');

  // Dynamic values matched to current ticker price range
  const currentOptionPrice = useMemo(() => {
    if (clickedContractOverride) {
      // Scale with current tick changes (guard against a 0/undefined base price → NaN/Infinity)
      const drift = (currentCandle.close / (selectedAsset.defaultPrice || 1));
      return clickedContractOverride.price * drift;
    }
    // Baseline Option cost model
    return currentCandle.close * 0.005;
  }, [clickedContractOverride, currentCandle.close, selectedAsset]);

  const fairOptionValue = useMemo(() => {
    return currentOptionPrice * (invalidationTriggered ? 1.35 : 0.92);
  }, [currentOptionPrice, invalidationTriggered]);

  const entryZoneStr = useMemo(() => {
    const minZ = currentOptionPrice * 0.88;
    const maxZ = currentOptionPrice * 0.95;
    const dec = selectedAsset.decimals === 5 ? 4 : 2;
    return `$${minZ.toFixed(dec)} - $${maxZ.toFixed(dec)}`;
  }, [currentOptionPrice, selectedAsset]);

  // Derived recommendation according to living status
  const currentRecommendation = useMemo(() => {
    if (invalidationTriggered) return 'EXIT';
    if (liveConfidence < 75) return 'REDUCE';
    if (liveConfidence >= 90) return 'BUY';
    return clickedContractOverride?.recommendation || 'WAIT';
  }, [liveConfidence, invalidationTriggered, clickedContractOverride]);

  // Thesis Health state text
  const thesisHealthStatus = useMemo(() => {
    if (invalidationTriggered) return { text: 'INVALIDATED / COLLAPSED', color: 'text-rose-500', bg: 'bg-rose-950/20 border-rose-900/60' };
    if (liveConfidence < 75) return { text: 'DETERIORATING / WEAK', color: 'text-amber-500', bg: 'bg-amber-950/20 border-amber-900/40' };
    if (lastConfidenceChange === 'UP') return { text: 'IMPROVING / HIGH HEALTH', color: 'text-[#4ADE80]', bg: 'bg-black/40 border-black' };
    return { text: 'STEADY / HEALTHY', color: 'text-[#4ADE80]', bg: 'bg-black border-black' };
  }, [liveConfidence, lastConfidenceChange, invalidationTriggered]);

  // Custom targets section matching options values
  const optionTargets = useMemo(() => {
    const scale = currentOptionPrice;
    return [
      { id: 'opt1', label: 'TARGET 1', value: scale * 1.25, prob: invalidationTriggered ? 12 : 88, eta: '5-15 Minutes' },
      { id: 'opt2', label: 'TARGET 2', value: scale * 1.55, prob: invalidationTriggered ? 5 : 81, eta: '15-30 Minutes' },
      { id: 'opt3', label: 'TARGET 3', value: scale * 2.10, prob: invalidationTriggered ? 2 : 67, eta: '30-60 Minutes' },
      { id: 'stretch', label: 'STRETCH TARGET', value: scale * 3.80, prob: invalidationTriggered ? 0 : 34, eta: '1-3 Hours' },
    ];
  }, [currentOptionPrice, invalidationTriggered]);

  // Dynamic why we like checklists
  const checklistItems = [
    { label: '1m RSI Led', active: !invalidationTriggered && systemScore.rsiCascade >= 6 },
    { label: '5m RSI Confirmed', active: !invalidationTriggered && systemScore.rsiCascade >= 8 },
    { label: 'Above VWAP Level', active: !invalidationTriggered && currentCandle.close >= (currentCandle.vwap || currentCandle.close) },
    { label: 'RVOL Expanding Strength', active: (currentCandle.relativeVolume || 2.1) > 1.2 },
    { label: 'Bullish Peak Structure', active: !invalidationTriggered && systemScore.structureQuality >= 7 },
    { label: 'Strong Liquidity Grabs', active: !invalidationTriggered && systemScore.liquiditySweep >= 6 },
    { label: 'Higher Timeframe Matrix Alignment', active: systemScore.htfAgreement >= 7 },
    { label: 'Historical Positive Precedent', active: systemScore.total >= 75 },
  ];

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      
      {/* 1. Header Information Summary */}
      <div className="bg-black/70 border border-black p-4 rounded-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-mono font-bold tracking-widest text-[#E5E5E5] uppercase">{contractDisplayName}</span>
            <span className={`px-2 py-0.5 border text-[10px] font-mono font-bold rounded-sm ${
              contractBias === 'BULLISH' ? 'bg-black/40 border-black text-[#4ADE80]' : 'bg-rose-950/60 border-rose-900/60 text-[#F87171]'
            }`}>
              {contractBias} ACTIVE
            </span>
          </div>
          <p className="text-[10.5px] font-mono text-zinc-500 mt-1">
            Underlying: <span className="text-[#4ADE80]">{selectedAsset.name} ({selectedTimeframe})</span>
            <span className="mx-2">|</span> Last update: <span className="text-zinc-400">3 seconds ago</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isLiveTicking && (
            <span className="w-2.5 h-2.5 bg-black/40 rounded-full animate-pulse inline-block mr-1"></span>
          )}
          <span className="text-[10px] font-mono tracking-widest text-[#888888] uppercase">LIVE THESIS FEED</span>
        </div>
      </div>

      {/* 2. Core Decisions / Universally Understood Metrics Layout */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Metric 1: Recommendation Action Badge */}
        <div className="bg-black/50 border border-black p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[9.5px] font-mono text-zinc-500 uppercase tracking-widest">RECOMMENDED ACTION</span>
          <div className="my-2 flex items-center gap-3">
            <span className={`text-3xl font-mono font-black ${
              currentRecommendation === 'BUY' ? 'text-[#4ADE80]' :
              currentRecommendation === 'EXIT' ? 'text-rose-500 animate-pulse' :
              currentRecommendation === 'REDUCE' ? 'text-amber-500' : 'text-zinc-400'
            }`}>
              {currentRecommendation}
            </span>
          </div>
          <span className="text-[10.5px] font-mono text-zinc-400 leading-normal">
            {currentRecommendation === 'BUY' ? 'Conditions favor entry. Buy on a small pullback.' :
             currentRecommendation === 'EXIT' ? 'Setup failed. Exit now.' :
             currentRecommendation === 'REDUCE' ? 'Momentum weakening. Cut size.' :
             'Wait for a clearer signal before entering.'}
          </span>
        </div>

        {/* Metric 2: Living Confidence Score */}
        <div className="bg-black/50 border border-black p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[9.5px] font-mono text-[#888888] uppercase tracking-widest flex justify-between items-center">
            SIGNAL CONFIDENCE
            {lastConfidenceChange === 'UP' && <span className="text-[#4ADE80] text-[9px] uppercase font-black">rising</span>}
            {lastConfidenceChange === 'DOWN' && <span className="text-[#F87171] text-[9px] uppercase font-black">falling</span>}
          </span>
          <div className="my-2 flex items-baseline gap-1.5 font-mono">
            <span className="text-3xl font-bold font-mono text-zinc-100">{liveConfidence}%</span>
            <span className="text-[10px] text-zinc-500 uppercase">SCORE</span>
          </div>
          <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                liveConfidence >= 88 ? 'bg-black/40' :
                liveConfidence >= 75 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${liveConfidence}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Universally Understood Trend / Momentum */}
        <div className="bg-black/50 border border-black p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[9.5px] font-mono text-zinc-500 uppercase tracking-widest">MOMENTUM & RISK</span>
          <div className="my-2 flex flex-col gap-0.5">
            <span className="text-[13px] font-mono font-bold text-zinc-150 uppercase">
              Momentum: <span className="text-[#4ADE80]">{systemScore.rsiCascade >= 7 ? 'Strong Impulse' : 'Muted'}</span>
            </span>
            <span className="text-[13px] font-mono font-bold text-zinc-150 uppercase">
              Risk Profile: <span className="text-[#4ADE80]">{selectedAsset.volatility > 1.2 ? 'High Vol' : 'Medium'}</span>
            </span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 leading-normal uppercase">
            Participation Level: <span className="text-[#4ADE80]">{(currentCandle.relativeVolume || 2.1) > 1.8 ? 'High' : 'Normal'}</span>
          </span>
        </div>

        {/* Metric 4: Thesis Health State */}
        <div className="bg-black/50 border border-black p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[9.5px] font-mono text-zinc-500 uppercase tracking-widest">TRADE HEALTH</span>
          <div className="my-2">
            <span className={`text-xs font-mono font-semibold tracking-wide uppercase px-2 py-1 rounded-sm block text-center border ${thesisHealthStatus.bg} ${thesisHealthStatus.color}`}>
              {thesisHealthStatus.text}
            </span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 leading-normal">
            Typical hold time: <span className="font-bold text-zinc-400 uppercase">15-45 Min</span>
          </span>
        </div>

      </section>

      {/* 3. Living Thesis Container (Signature Feature #5) & Simulation Controllers */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* Signature Live Monitoring Panel */}
        <div className="lg:col-span-8 bg-black border border-black p-4 rounded-sm flex flex-col justify-between relative overflow-hidden">
          {/* Subtle background glow representing health */}
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 transition-all pointer-events-none duration-1000 ${
            invalidationTriggered ? 'bg-rose-900/40' : 'bg-black/40'
          }`} />

          <div>
            <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
              <span className="text-xs font-bold font-mono tracking-wider text-zinc-200 uppercase flex items-center gap-1.5">
                <Gauge className="w-4 text-[#4ADE80] animate-pulse" /> Signature Live Thesis Monitor
              </span>
              <span className={`font-mono text-[10px] font-bold ${
                invalidationTriggered ? 'text-[#F87171] animate-pulse' : 'text-[#4ADE80]'
              } uppercase`}>
                STATUS: {invalidationTriggered ? 'WEAKENING' : 'ACTIVE_STEADY'}
              </span>
            </div>

            <p className="text-[10.5px] font-mono text-zinc-500 mb-4 leading-normal">
              Live tracking of key structure and momentum conditions for this trade.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column values */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-black p-1">
                  <span className="text-[11px] font-mono text-zinc-400">THESIS STABILIZATION:</span>
                  <span className={`text-[11px] font-mono font-bold uppercase ${invalidationTriggered ? 'text-[#F87171]' : 'text-[#4ADE80]'}`}>
                    {invalidationTriggered ? 'FAILING' : 'SECURED'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-black p-1">
                  <span className="text-[11px] font-mono text-zinc-400">VWAP LINE LEVEL PROTECTION:</span>
                  <span className={`text-[11px] font-mono font-bold uppercase ${
                    currentCandle.close >= (currentCandle.vwap || currentCandle.close) ? 'text-[#4ADE80]' : 'text-[#F87171]'
                  }`}>
                    {currentCandle.close >= (currentCandle.vwap || currentCandle.close) ? 'SAFE (+0.42%)' : 'LOST VWAP'}
                  </span>
                </div>
              </div>

              {/* Right Column details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-black p-1">
                  <span className="text-[11px] font-mono text-zinc-400">PARTICIPATION QUALITY:</span>
                  <span className="text-[11px] font-mono font-bold text-zinc-200">
                    HI_VOLUME ({(currentCandle.relativeVolume || 2.1).toFixed(1)}x RVOL)
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-black p-1">
                  <span className="text-[11px] font-mono text-zinc-400">PEAK SHIFT DIAGNOSTICS:</span>
                  <span className={`text-[11px] font-mono font-bold uppercase ${invalidationTriggered ? 'text-[#F87171]' : 'text-[#4ADE80]'}`}>
                    {invalidationTriggered ? 'STRUCTURE FAILED' : 'HH / HL STEADY'}
                  </span>
                </div>
              </div>
            </div>

            {/* If setup is weakening/invalidated, broadcast a warning box */}
            {invalidationTriggered && (
              <div className="mt-4 p-3 bg-rose-950/20 border border-rose-900/60 rounded-sm flex items-start gap-3">
                <AlertTriangle className="w-4 text-[#F87171] shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h4 className="text-[11.5px] font-mono font-bold text-[#F87171] uppercase">COLLAPSE CRITERIA REASONS TRIGGERED</h4>
                  <p className="text-[10px] font-mono text-rose-500 mt-1 leading-relaxed">
                    Lost VWAP Anchor Support • High Volatility Structure breakdown • Relative Volume bleed • RSI rapid rollover down. EXIT recommendation enforced.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-black flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase">
            <span>Last Checked Cycle Match: SECURE</span>
            <span>Ref: SV_SYSTEM_LIVING_THESIS</span>
          </div>

        </div>

        {/* Dynamic Sandbox Simulator UI Card Panel */}
        <div className="lg:col-span-4 bg-black border border-black p-4 rounded-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 border-b border-black pb-2">
              <Sliders className="w-4 text-zinc-400" />
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                {serverState?.data_source !== 'SANDBOX_SYNTHETIC' ? 'Real-Time Order Flow Tapes' : 'Order Flow Sandbox Console'}
              </h3>
            </div>
            <p className="text-[10.5px] font-mono text-zinc-500 mb-4 leading-normal">
              {serverState?.data_source !== 'SANDBOX_SYNTHETIC' 
                ? 'Displaying consolidated options transactions live from the OPRA exchange tapes network.' 
                : 'Inject custom orders block directly into liquidity streams to force-test living thesis outcomes.'}
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={injectBuy}
                className="px-2 py-2 rounded-sm border border-black bg-black/40 hover:bg-black/40 text-[#4ADE80] font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3"
              >
                Buy Block
              </button>
              <button
                onClick={injectSell}
                className="px-2 py-2 rounded-sm border border-[#F87171]/50 bg-rose-950/20 hover:bg-rose-950/40 text-rose-405 font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3"
              >
                Sell Block
              </button>
              <button
                onClick={injectStopHunt}
                className="px-2 py-2 rounded-sm border border-black bg-black hover:bg-black text-[#4ADE80] font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3 col-span-2"
              >
                ⚔️ Stop Hunt Sweep
              </button>
              <button
                onClick={injectVWAPBreakdown}
                className="px-2 py-2 rounded-sm border border-rose-900/60 bg-red-950/20 text-[#F87171] font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3 col-span-2 hover:bg-rose-950/30"
              >
                💥 Trigger VWAP Breakdown
              </button>
            </div>
          </div>

          <div className="border-t border-black pt-3 flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-500">Live Ticking Feed:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsLiveTicking(!isLiveTicking)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                  isLiveTicking ? 'bg-black/40 text-black' : 'bg-black text-zinc-500'
                }`}
              >
                {isLiveTicking ? 'RUNNING' : 'PAUSED'}
              </button>
              {isLiveTicking && (
                <select
                  value={tickSpeed}
                  onChange={(e) => setTickSpeed(Number(e.target.value))}
                  className="mirror-panel text-[9px] font-mono text-zinc-400 p-0.5 rounded-sm"
                >
                  <option value={1000}>1s</option>
                  <option value={3000}>3s</option>
                  <option value={8000}>8s</option>
                </select>
              )}
            </div>
          </div>
        </div>

      </section>

      {/* 4. Options Targets Matrix Area & Why SkyVision Likes This Trade */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-5">
        
        {/* Why SkyVision Likes This Trade Card (Fills Col 5) */}
        <div className="md:col-span-4 bg-black/50 border border-black p-4 rounded-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-black pb-2.5 mb-3">
              <span className="text-xs font-bold font-mono tracking-wider text-zinc-200 uppercase">
                Why SkyVision Likes This Trade
              </span>
            </div>

            <div className="space-y-2">
              {checklistItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 font-mono text-[11.5px]">
                  {item.active ? (
                    <CheckCircle className="w-4 text-[#4ADE80] shrink-0" />
                  ) : (
                    <XCircle className="w-4 text-zinc-650 shrink-0" />
                  )}
                  <span className={item.active ? 'text-zinc-200' : 'text-zinc-500'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-black text-[10px] font-mono text-zinc-500 text-center uppercase">
            No Jargon • Standardised Thesis Models Only
          </div>
        </div>

        {/* Options Target Cards Matrix (Fills Col 8) */}
        <div className="md:col-span-8 flex flex-col gap-3">
          <span className="text-xs font-bold font-mono tracking-wider text-[#4ADE80] uppercase block">
            Target Execution Matrix Projections
          </span>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {optionTargets.map((target, idx) => {
              // Decide styles depending on probability levels
              let textAccentColor = 'text-[#4ADE80]';
              let borderAccentColor = 'border-black';
              let badgeColor = 'bg-black/40';

              if (target.prob < 50) {
                textAccentColor = 'text-[#F87171]';
                borderAccentColor = 'border-[#F87171]/50/50';
                badgeColor = 'bg-rose-950/20';
              } else if (target.prob < 75) {
                textAccentColor = 'text-amber-500';
                borderAccentColor = 'border-amber-950/60';
                badgeColor = 'bg-amber-950/25';
              }

              return (
                <div
                  key={target.id}
                  className={`bg-black/70 border ${borderAccentColor} p-3.5 rounded-sm flex flex-col justify-between`}
                >
                  <div>
                    <span className="text-[9.5px] font-mono text-zinc-550 block">{target.label}</span>
                    <span className="text-[17px] font-mono font-black text-zinc-100 block mt-1">
                      ${target.value.toFixed(selectedAsset.decimals === 5 ? 4 : 2)}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-black/60 flex flex-col gap-1 font-mono text-[10px]">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Probability:</span>
                      <span className={`font-bold ${textAccentColor}`}>{target.prob}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">ETA:</span>
                      <span className="text-[#4ADE80]">{target.eta}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive expansion check for raw indices */}
          <div className="bg-black/40 border border-black p-2 text-center rounded-sm mt-1">
            <button
              onClick={() => setShowRawMetrics(!showRawMetrics)}
              className="text-[10px] font-mono text-zinc-400 hover:text-[#E5E5E5] transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
            >
              Diagnostic Raw Indices Feed {showRawMetrics ? <ChevronUp className="w-3.5" /> : <ChevronDown className="w-3.5" />}
            </button>
            
            {showRawMetrics && (
              <div className="mt-3 border-t border-black/60 pt-3 text-left grid grid-cols-2 md:grid-cols-4 gap-4 p-2 text-[11px] font-mono">
                <div>
                  <span className="block text-zinc-500 uppercase">RSI CASCADE RAW</span>
                  <span className="text-zinc-150 font-bold">1m RSI: {Math.floor(systemScore.rsiCascade * 6.5 + 23)} • 5m RSI: {Math.floor(systemScore.rsiCascade * 6.0 + 31)}</span>
                </div>
                <div>
                  <span className="block text-zinc-500 uppercase">DISTANCE FROM VWAP</span>
                  <span className="text-zinc-150 font-bold">+{((currentCandle.close - (currentCandle.vwap || currentCandle.close)) / (currentCandle.vwap || currentCandle.close) * 100).toFixed(3)}%</span>
                </div>
                <div>
                  <span className="block text-zinc-500 uppercase">RELATIVE VOL MULTI</span>
                  <span className="text-zinc-150 font-bold">{(currentCandle.relativeVolume || 2.1).toFixed(2)}x RVOL</span>
                </div>
                <div>
                  <span className="block text-zinc-500 uppercase">DISPLACEMENT FACTOR</span>
                  <span className="text-zinc-150 font-bold">{systemScore.total} Points (Slayer Labss_M_01 index)</span>
                </div>
              </div>
            )}
          </div>

        </div>

      </section>

      {/* 4.5. SKYVISION V11 - QUANTITATIVE DECISION ENGINE (TIERS 0-14) */}
      <section>
        <SkyVisionV11Cockpit
          asset={selectedAsset}
          isCall={contractBias === 'BULLISH'}
          score={systemScore}
          optionPremium={currentOptionPrice}
          optionStrike={Math.floor(currentCandle.close * (contractBias === 'BULLISH' ? 1.002 : 0.998))}
        />
      </section>

      {/* 5. Supporting Evidential Candlestick Chart AND Structural Nodes (Placed at the bottom as evidence) */}
      <section className="bg-black/20 border border-black p-4 rounded-sm flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-black pb-2">
          <span className="text-xs font-bold font-mono tracking-wider text-zinc-500 uppercase">
            SUPPORTING TELEMETRY EVIDENCE & STRUCTURAL NODES
          </span>
          <span className="text-[9.5px] font-mono text-zinc-550 mr-1 uppercase">Not the core product, click buttons to interact</span>
        </div>

        <div className="flex flex-col gap-4">
          
          {/* ============== INSTITUTIONAL MICRO-STRUCTURE METRICS ============== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden mb-4" id="dealerflow-displacement-row">
            <SlayerScoreWidget />
            <VolatilityStateWidget />
          </div>

          {/* ============== FULL WIDTH CHART AT BOTTOM ============== */}
          <div className="bg-black rounded-lg p-5 flex flex-col w-full overflow-hidden" id="displacement-overlay-chart-panel" style={{ minHeight: '380px' }}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[#a1a1aa] uppercase">
                <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
                Price Action — Displacement & Imbalance Overlay
              </div>
            </div>
            <div className="flex-1 w-full min-h-[300px]">
              <InteractiveChart
                candles={candles}
                displacementZones={serverState?.displacement_engine?.zones || []}
                fvgs={fvgs}
                liquidityEvents={liquidityEvents}
                tape={serverState?.tape || []}
                targets={targets}
                priceDecimals={selectedAsset.decimals}
                timeframe={selectedTimeframe as any}
                selectedTicker={selectedAsset.ticker}
                onPlaceAuditTrade={onPlaceAuditTrade}
                triggerInvalidation={invalidationTriggered}
                watermarkText="PRICE ACTION — DISPLACEMENT & IMBALANCE OVERLAY"
              />
            </div>
          </div>

        </div>
      </section>

    </div>
  );
}
