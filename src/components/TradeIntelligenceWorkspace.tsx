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
  return map[s] || 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)]';
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

  // 1. CONFIDENCE STATE — derived from the real systemScore (no random walk).
  // The value tracks systemScore.total (or the clicked contract's confidence)
  // and bleeds only when an actual invalidation is triggered.
  const baseConfidence = clickedContractOverride?.confidence ?? systemScore.total;
  const liveConfidence = invalidationTriggered
    ? Math.max(34, Math.round(baseConfidence * 0.55))
    : Math.round(baseConfidence);

  // Direction of the most recent change, derived deterministically from state.
  const [prevConfidence, setPrevConfidence] = useState(liveConfidence);
  const [lastConfidenceChange, setLastConfidenceChange] = useState<'UP' | 'DOWN' | 'STABLE'>('STABLE');
  useEffect(() => {
    setLastConfidenceChange(
      liveConfidence > prevConfidence ? 'UP' : liveConfidence < prevConfidence ? 'DOWN' : 'STABLE'
    );
    setPrevConfidence(liveConfidence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveConfidence]);

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
    if (invalidationTriggered) return { text: 'INVALIDATED / COLLAPSED', color: 'text-[var(--danger)]', bg: 'bg-[var(--surface-2)] border-[var(--danger)]/60' };
    if (liveConfidence < 75) return { text: 'DETERIORATING / WEAK', color: 'text-[var(--warning)]', bg: 'bg-[var(--surface-2)] border-[var(--warning)]/40' };
    if (lastConfidenceChange === 'UP') return { text: 'IMPROVING / HIGH HEALTH', color: 'text-[var(--success)]', bg: 'bg-[var(--surface-2)] border-[var(--border)]' };
    return { text: 'STEADY / HEALTHY', color: 'text-[var(--success)]', bg: 'bg-[var(--surface)] border-[var(--border)]' };
  }, [liveConfidence, lastConfidenceChange, invalidationTriggered]);

  // Target Execution Matrix — prefer the real target ladder supplied via props
  // (serverState-derived TargetLevel[]). Each target's option value scales the
  // current premium by the underlying move to that level (~0.5-delta proxy).
  // Falls back to a clearly-labeled MODEL ladder if no targets are present.
  const targetsAreReal = Array.isArray(targets) && targets.length > 0;
  const optionTargets = useMemo(() => {
    const scale = currentOptionPrice;
    const etaByIdx = ['5-15 Minutes', '15-30 Minutes', '30-60 Minutes', '1-3 Hours'];

    if (targetsAreReal) {
      return targets.slice(0, 4).map((t, i) => {
        const moveMult = 1 + Math.max(0, Math.abs(t.distancePct) / 100) * 2;
        return {
          id: `tgt-${i}`,
          label: t.label || `TARGET ${i + 1}`,
          value: scale * (invalidationTriggered ? 0.6 : moveMult),
          prob: invalidationTriggered ? Math.max(0, Math.round((t.probabilityPct || 0) * 0.15)) : Math.round(t.probabilityPct || 0),
          eta: etaByIdx[i] || '1-3 Hours',
        };
      });
    }

    return [
      { id: 'opt1', label: 'TARGET 1 (MODEL)', value: scale * 1.25, prob: invalidationTriggered ? 12 : 88, eta: '5-15 Minutes' },
      { id: 'opt2', label: 'TARGET 2 (MODEL)', value: scale * 1.55, prob: invalidationTriggered ? 5 : 81, eta: '15-30 Minutes' },
      { id: 'opt3', label: 'TARGET 3 (MODEL)', value: scale * 2.10, prob: invalidationTriggered ? 2 : 67, eta: '30-60 Minutes' },
      { id: 'stretch', label: 'STRETCH (MODEL)', value: scale * 3.80, prob: invalidationTriggered ? 0 : 34, eta: '1-3 Hours' },
    ];
  }, [currentOptionPrice, invalidationTriggered, targets, targetsAreReal]);

  // Decision-header figures: first target (T1) and a protective stop on the
  // option premium (model stop = ~40% of premium below entry).
  const t1Value = optionTargets[0]?.value ?? currentOptionPrice * 1.25;
  const stopValue = currentOptionPrice * 0.6;
  const priceDec = selectedAsset.decimals === 5 ? 4 : 2;

  // Real, computed VWAP distance (percent of spot from VWAP). Replaces the
  // previous constant "SAFE (+0.42%)" string.
  const vwapRef = currentCandle.vwap || currentCandle.close;
  const vwapDistancePct = ((currentCandle.close - vwapRef) / vwapRef) * 100;

  // Gate "real-time / OPRA-live" copy on an actual connected data source.
  const isRealFeed = !!serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC';

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

      {/* 0. STICKY DECISION HEADER — Recommendation · Entry · T1 · Stop */}
      <div className="sticky top-0 z-20 bg-[var(--surface)] border border-[var(--border)] rounded-sm shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">RECO</span>
          <span className={`text-base font-mono font-black ${
            currentRecommendation === 'BUY' ? 'text-[var(--success)]' :
            currentRecommendation === 'EXIT' ? 'text-[var(--danger)]' :
            currentRecommendation === 'REDUCE' ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'
          }`}>
            {currentRecommendation}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">ENTRY</span>
          <span className="text-xs font-mono font-bold text-[var(--text-primary)] tabular-nums">{entryZoneStr}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">T1</span>
          <span className="text-xs font-mono font-bold text-[var(--success)] tabular-nums">${t1Value.toFixed(priceDec)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">STOP</span>
          <span className="text-xs font-mono font-bold text-[var(--danger)] tabular-nums">${stopValue.toFixed(priceDec)}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">CONF</span>
          <span className="text-xs font-mono font-bold text-[var(--text-primary)] tabular-nums">{liveConfidence}%</span>
        </div>
      </div>

      {/* 1. Header Information Summary */}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-mono font-bold tracking-widest text-[var(--text-primary)] uppercase">{contractDisplayName}</span>
            <span className={`px-2 py-0.5 border text-[10px] font-mono font-bold rounded-sm ${
              contractBias === 'BULLISH' ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--success)]' : 'bg-[var(--surface-2)] border-[var(--danger)]/60 text-[var(--danger)]'
            }`}>
              {contractBias} ACTIVE
            </span>
          </div>
          <p className="text-[10.5px] font-mono text-[var(--text-tertiary)] mt-1">
            Associated Underlying: <span className="text-[var(--success)]">{selectedAsset.name} ({selectedTimeframe})</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isLiveTicking && (
            <span className="w-2.5 h-2.5 bg-[var(--success)] rounded-full inline-block mr-1"></span>
          )}
          <span className="text-[10px] font-mono tracking-widest text-[var(--text-tertiary)] uppercase">LIVE THESIS FEED</span>
        </div>
      </div>

      {/* 2. Core Decisions / Universally Understood Metrics Layout */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* Metric 1: Recommendation Action Badge */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">WORKSTATION DECISION</span>
          <div className="my-2 flex items-center gap-3">
            <span className={`text-3xl font-mono font-black ${
              currentRecommendation === 'BUY' ? 'text-[var(--success)]' :
              currentRecommendation === 'EXIT' ? 'text-[var(--danger)]' :
              currentRecommendation === 'REDUCE' ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'
            }`}>
              {currentRecommendation}
            </span>
          </div>
          <span className="text-[10.5px] font-mono text-[var(--text-secondary)] leading-normal">
            {currentRecommendation === 'BUY' ? 'Immediate bullish execution suggested on pullback pockets.' :
             currentRecommendation === 'EXIT' ? 'Setup fully invalidated. Cut active structures.' :
             currentRecommendation === 'REDUCE' ? 'Trim size. Aggregate trend dynamics weakening.' :
             'Secure positions or stand aside for clearer impulse alignment.'}
          </span>
        </div>

        {/* Metric 2: System Confidence Score (derived from systemScore) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest flex justify-between items-center">
            SYSTEM CONFIDENCE
            {lastConfidenceChange === 'UP' && <span className="text-[var(--success)] text-[10px] uppercase font-black">rising</span>}
            {lastConfidenceChange === 'DOWN' && <span className="text-[var(--danger)] text-[10px] uppercase font-black">falling</span>}
          </span>
          <div className="my-2 flex items-baseline gap-1.5 font-mono">
            <span className="text-3xl font-bold font-mono text-[var(--text-primary)] tabular-nums">{liveConfidence}%</span>
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase">SCORE</span>
          </div>
          <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                liveConfidence >= 88 ? 'bg-[var(--success)]' :
                liveConfidence >= 75 ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]'
              }`}
              style={{ width: `${liveConfidence}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Universally Understood Trend / Momentum */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">MOMENTUM & RISK</span>
          <div className="my-2 flex flex-col gap-0.5">
            <span className="text-[13px] font-mono font-bold text-[var(--text-primary)] uppercase">
              Momentum: <span className="text-[var(--success)]">{systemScore.rsiCascade >= 7 ? 'Strong Impulse' : 'Muted'}</span>
            </span>
            <span className="text-[13px] font-mono font-bold text-[var(--text-primary)] uppercase">
              Risk Profile: <span className="text-[var(--success)]">{selectedAsset.volatility > 1.2 ? 'High Vol' : 'Medium'}</span>
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] leading-normal uppercase">
            Participation Level: <span className="text-[var(--success)]">{(currentCandle.relativeVolume || 2.1) > 1.8 ? 'High' : 'Normal'}</span>
          </span>
        </div>

        {/* Metric 4: Thesis Health State */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">ACTIVE TRADE DIAGNOSIS</span>
          <div className="my-2">
            <span className={`text-xs font-mono font-semibold tracking-wide uppercase px-2 py-1 rounded-sm block text-center border ${thesisHealthStatus.bg} ${thesisHealthStatus.color}`}>
              {thesisHealthStatus.text}
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] leading-normal">
            Max Expected Hold Time: <span className="font-bold text-[var(--text-secondary)] uppercase">15-45 Min</span>
          </span>
        </div>

      </section>

      {/* 3. Living Thesis Container (Signature Feature #5) & Simulation Controllers */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* Signature Live Monitoring Panel */}
        <div className="lg:col-span-8 bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between relative overflow-hidden">
          {/* Subtle background glow representing health */}
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 transition-all pointer-events-none duration-1000 ${
            invalidationTriggered ? 'bg-[var(--danger)]/40' : 'bg-[var(--surface-3)]'
          }`} />

          <div>
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
              <span className="text-xs font-bold font-mono tracking-wider text-[var(--text-primary)] uppercase flex items-center gap-1.5">
                <Gauge className="w-4 text-[var(--success)]" /> Signature Live Thesis Monitor
              </span>
              <span className={`font-mono text-[10px] font-bold ${
                invalidationTriggered ? 'text-[var(--danger)]' : 'text-[var(--success)]'
              } uppercase`}>
                STATUS: {invalidationTriggered ? 'WEAKENING' : 'ACTIVE_STEADY'}
              </span>
            </div>

            <p className="text-[10.5px] font-mono text-[var(--text-tertiary)] mb-4 leading-normal">
              Continuous validation logs tracking structural health and invalidation metrics.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column values */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border)] p-1">
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">THESIS STABILIZATION:</span>
                  <span className={`text-[11px] font-mono font-bold uppercase ${invalidationTriggered ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {invalidationTriggered ? 'FAILING' : 'SECURED'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] p-1">
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">VWAP DISTANCE:</span>
                  <span className={`text-[11px] font-mono font-bold uppercase tabular-nums ${
                    vwapDistancePct >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                  }`}>
                    {vwapDistancePct >= 0
                      ? `ABOVE (+${vwapDistancePct.toFixed(2)}%)`
                      : `LOST VWAP (${vwapDistancePct.toFixed(2)}%)`}
                  </span>
                </div>
              </div>

              {/* Right Column details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border)] p-1">
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">PARTICIPATION QUALITY:</span>
                  <span className="text-[11px] font-mono font-bold text-[var(--text-primary)] tabular-nums">
                    {(currentCandle.relativeVolume || 2.1).toFixed(1)}x RVOL
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] p-1">
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">PEAK SHIFT DIAGNOSTICS:</span>
                  <span className={`text-[11px] font-mono font-bold uppercase ${invalidationTriggered ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {invalidationTriggered ? 'STRUCTURE FAILED' : 'HH / HL STEADY'}
                  </span>
                </div>
              </div>
            </div>

            {/* If setup is weakening/invalidated, broadcast a warning box */}
            {invalidationTriggered && (
              <div className="mt-4 p-3 bg-[var(--surface-2)] border border-[var(--danger)]/60 rounded-sm flex items-start gap-3">
                <AlertTriangle className="w-4 text-[var(--danger)] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[11.5px] font-mono font-bold text-[var(--danger)] uppercase">COLLAPSE CRITERIA REASONS TRIGGERED</h4>
                  <p className="text-[10px] font-mono text-[var(--danger)] mt-1 leading-relaxed">
                    Lost VWAP Anchor Support • High Volatility Structure breakdown • Relative Volume bleed • RSI rapid rollover down. EXIT recommendation enforced.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border)] flex justify-between items-center text-[10px] font-mono text-[var(--text-tertiary)] uppercase">
            <span>Last Checked Cycle: {invalidationTriggered ? 'WEAKENING' : 'SECURE'}</span>
            <span>Ref: SV_SYSTEM_LIVING_THESIS</span>
          </div>

        </div>

        {/* Dynamic Sandbox Simulator UI Card Panel */}
        <div className="lg:col-span-4 bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 border-b border-[var(--border)] pb-2">
              <Sliders className="w-4 text-[var(--text-secondary)]" />
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                {isRealFeed ? 'Real-Time Order Flow Tapes' : 'Order Flow Sandbox Console'}
              </h3>
            </div>
            <p className="text-[10.5px] font-mono text-[var(--text-tertiary)] mb-4 leading-normal">
              {isRealFeed
                ? `Displaying consolidated options transactions from the connected market feed (${serverState?.data_source}).`
                : 'SANDBOX (synthetic data): inject custom order blocks to force-test living thesis outcomes. Not live market data.'}
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={injectBuy}
                className="px-2 py-2 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--success)] font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3"
              >
                Buy Block
              </button>
              <button
                onClick={injectSell}
                className="px-2 py-2 rounded-sm border border-[var(--danger)]/50 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--danger)] font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3"
              >
                Sell Block
              </button>
              <button
                onClick={injectStopHunt}
                className="px-2 py-2 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--success)] font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3 col-span-2"
              >
                Stop Hunt Sweep
              </button>
              <button
                onClick={injectVWAPBreakdown}
                className="px-2 py-2 rounded-sm border border-[var(--danger)]/60 bg-[var(--surface-2)] text-[var(--danger)] font-mono text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer uppercase text-left pl-3 col-span-2 hover:bg-[var(--surface-3)]"
              >
                Trigger VWAP Breakdown
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between text-[11px] font-mono">
            <span className="text-[var(--text-tertiary)]">Live Ticking Feed:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsLiveTicking(!isLiveTicking)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  isLiveTicking ? 'bg-[var(--success)] text-black' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'
                }`}
              >
                {isLiveTicking ? 'RUNNING' : 'PAUSED'}
              </button>
              {isLiveTicking && (
                <select
                  value={tickSpeed}
                  onChange={(e) => setTickSpeed(Number(e.target.value))}
                  className="mirror-panel text-[10px] font-mono text-[var(--text-secondary)] p-0.5 rounded-sm"
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
        <div className="md:col-span-4 bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5 mb-3">
              <span className="text-xs font-bold font-mono tracking-wider text-[var(--text-primary)] uppercase">
                Why SkyVision Likes This Trade
              </span>
            </div>

            <div className="space-y-2">
              {checklistItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 font-mono text-[11.5px]">
                  {item.active ? (
                    <CheckCircle className="w-4 text-[var(--success)] shrink-0" />
                  ) : (
                    <XCircle className="w-4 text-[var(--text-tertiary)] shrink-0" />
                  )}
                  <span className={item.active ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border)] text-[10px] font-mono text-[var(--text-tertiary)] text-center uppercase">
            No Jargon • Standardised Thesis Models Only
          </div>
        </div>

        {/* Options Target Cards Matrix (Fills Col 8) */}
        <div className="md:col-span-8 flex flex-col gap-3">
          <span className="text-xs font-bold font-mono tracking-wider text-[var(--success)] uppercase block">
            Target Execution Matrix {targetsAreReal ? 'Projections' : '(MODEL)'}
          </span>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {optionTargets.map((target, idx) => {
              // Decide styles depending on probability levels
              let textAccentColor = 'text-[var(--success)]';
              let borderAccentColor = 'border-[var(--border)]';

              if (target.prob < 50) {
                textAccentColor = 'text-[var(--danger)]';
                borderAccentColor = 'border-[var(--danger)]/50';
              } else if (target.prob < 75) {
                textAccentColor = 'text-[var(--warning)]';
                borderAccentColor = 'border-[var(--warning)]/50';
              }

              return (
                <div
                  key={target.id}
                  className={`bg-[var(--surface)] border ${borderAccentColor} p-3.5 rounded-sm flex flex-col justify-between`}
                >
                  <div>
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)] block">{target.label}</span>
                    <span className="text-[17px] font-mono font-black text-[var(--text-primary)] block mt-1 tabular-nums">
                      ${target.value.toFixed(priceDec)}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex flex-col gap-1 font-mono text-[10px]">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--text-tertiary)]">Probability:</span>
                      <span className={`font-bold tabular-nums ${textAccentColor}`}>{target.prob}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--text-tertiary)]">ETA:</span>
                      <span className="text-[var(--success)]">{target.eta}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive expansion check for raw indices */}
          <div className="bg-[var(--surface)] border border-[var(--border)] p-2 text-center rounded-sm mt-1">
            <button
              onClick={() => setShowRawMetrics(!showRawMetrics)}
              className="text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
            >
              Diagnostic Raw Indices Feed {showRawMetrics ? <ChevronUp className="w-3.5" /> : <ChevronDown className="w-3.5" />}
            </button>

            {showRawMetrics && (
              <div className="mt-3 border-t border-[var(--border)] pt-3 text-left grid grid-cols-2 md:grid-cols-4 gap-4 p-2 text-[11px] font-mono">
                <div>
                  <span className="block text-[var(--text-tertiary)] uppercase">RSI CASCADE RAW</span>
                  <span className="text-[var(--text-primary)] font-bold tabular-nums">1m RSI: {Math.floor(systemScore.rsiCascade * 6.5 + 23)} • 5m RSI: {Math.floor(systemScore.rsiCascade * 6.0 + 31)}</span>
                </div>
                <div>
                  <span className="block text-[var(--text-tertiary)] uppercase">DISTANCE FROM VWAP</span>
                  <span className="text-[var(--text-primary)] font-bold tabular-nums">{vwapDistancePct >= 0 ? '+' : ''}{vwapDistancePct.toFixed(3)}%</span>
                </div>
                <div>
                  <span className="block text-[var(--text-tertiary)] uppercase">RELATIVE VOL MULTI</span>
                  <span className="text-[var(--text-primary)] font-bold tabular-nums">{(currentCandle.relativeVolume || 2.1).toFixed(2)}x RVOL</span>
                </div>
                <div>
                  <span className="block text-[var(--text-tertiary)] uppercase">DISPLACEMENT FACTOR</span>
                  <span className="text-[var(--text-primary)] font-bold tabular-nums">{systemScore.total} Points</span>
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
      <section className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-sm flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
          <span className="text-xs font-bold font-mono tracking-wider text-[var(--text-tertiary)] uppercase">
            SUPPORTING TELEMETRY EVIDENCE & STRUCTURAL NODES
          </span>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] mr-1 uppercase">Not the core product, click buttons to interact</span>
        </div>

        <div className="flex flex-col gap-4">

          {/* ============== INSTITUTIONAL MICRO-STRUCTURE METRICS ============== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden mb-4" id="dealerflow-displacement-row">
            <SlayerScoreWidget />
            <VolatilityStateWidget />
          </div>

          {/* ============== FULL WIDTH CHART AT BOTTOM ============== */}
          <div className="bg-[var(--surface-2)] rounded-lg p-5 flex flex-col w-full overflow-hidden" id="displacement-overlay-chart-panel" style={{ minHeight: '380px' }}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[var(--text-tertiary)] uppercase">
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                Price Action — Displacement & Imbalance Overlay
              </div>
            </div>
            <div className="flex-1 w-full min-h-[300px]">
              <InteractiveChart
                candles={candles}
                displacementZones={serverState?.displacement?.zones || []}
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
