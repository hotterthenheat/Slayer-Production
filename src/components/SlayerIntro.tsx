/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { FeatureMatrix } from './FeatureMatrix';
import { SubscriptionPricing } from './SubscriptionPricing';
import { ArrowRight, Search } from 'lucide-react';
import { AssetInfo, TimeframeVal, SystemScore, V8TradeRecord } from '../types';
import { ASSET_LIST } from '../data';

interface SlayerIntroProps {
  onEnterApp: (targetTab?: string) => void;
  onUpgradeComplete?: (newTier: number) => void;
  selectedAsset: AssetInfo;
  setSelectedAsset: (asset: AssetInfo) => void;
  selectedTimeframe: TimeframeVal;
  setSelectedTimeframe: (tf: TimeframeVal) => void;
  systemScore: SystemScore;
  v8Trades: V8TradeRecord[];
  bestOpportunity: {
    asset: AssetInfo;
    ticker: string;
    confidence: number;
    isCall: boolean;
    currentPrice: string;
    fairValue: string;
    entryZone: string;
  };
  topSub10Calls: Array<{ asset: AssetInfo; ticker: string; confidence: number }>;
  topSub10Puts: Array<{ asset: AssetInfo; ticker: string; confidence: number }>;
  onSelectOpportunity: (asset: AssetInfo, type: 'C' | 'P', strike?: number) => void;
  session?: any;
  onRequestAuth?: () => void;
}

export default function SlayerIntro({
  onEnterApp,
  onUpgradeComplete,
  selectedAsset,
  setSelectedAsset,
  selectedTimeframe,
  setSelectedTimeframe,
  systemScore,
  v8Trades,
  bestOpportunity,
  topSub10Calls,
  topSub10Puts,
  onSelectOpportunity,
  session,
  onRequestAuth,
}: SlayerIntroProps) {
  const rawServerState = useContractStore(s => s.serverState);
  const prismKeybind = useContractStore(s => s.keybinds).prismMenu;

  // Active index selected on the landing hero.
  const [activeHeroIdx, setActiveHeroIdx] = useState<'SPX' | 'NDX' | 'QQQ' | 'SPY' | 'RUT'>('SPX');

  // Only treat server data as live when it actually matches the index the user
  // is looking at — otherwise the card honestly shows an awaiting-data state.
  const serverState = React.useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== activeHeroIdx) return null;
    return rawServerState;
  }, [rawServerState, activeHeroIdx]);

  const dealerMetrics = serverState?.deep_intelligence?.dealer_metrics ?? null;
  const isLive = !!dealerMetrics;

  // Synchronize with external selectedAsset when it updates.
  useEffect(() => {
    if (['SPX', 'NDX', 'QQQ', 'SPY', 'RUT'].includes(selectedAsset.ticker)) {
      setActiveHeroIdx(selectedAsset.ticker as any);
    }
  }, [selectedAsset]);

  // Honest, prop-derived headline figures.
  const callCount = topSub10Calls.length;
  const putCount = topSub10Puts.length;
  const contractsScanned = callCount + putCount;
  const tradesLogged = v8Trades.length;
  const compositeScore = Math.round(systemScore?.total ?? 0);

  // Open the live workspace at the currently selected opportunity.
  const handleLaunchToActiveOpportunity = () => {
    useContractStore.getState().setSelectedStrike(null);
    if (bestOpportunity?.asset) {
      onSelectOpportunity(bestOpportunity.asset, bestOpportunity.isCall ? 'C' : 'P');
    }
    onEnterApp('skyvision');
  };

  return (
    <div
      id="slayer-ecosystem-landing"
      className="w-full bg-transparent text-[var(--text-secondary)] flex flex-col font-sans relative pb-0 antialiased scroll-smooth"
    >
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 72% 62% at 50% 42%, rgba(8,9,10,.85) 0%, rgba(8,9,10,.5) 46%, transparent 80%)' }} />

      {/* ==================================================
          HERO
          ================================================== */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16 pt-20 md:pt-28 flex flex-col gap-16"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-12 lg:gap-16 items-center">
          {/* Left — message */}
          <div className="flex flex-col items-start text-left">
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--text-tertiary)] mb-6">
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`} />
              {isLive ? 'Live dealer positioning' : 'Connecting to market data'}
            </span>

            <h1 className="text-[clamp(40px,6vw,68px)] font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.04]">
              Trade the data
              <br />
              market makers see.
            </h1>

            <p className="text-[clamp(13px,1.4vw,15px)] text-[var(--text-secondary)] max-w-[46ch] leading-relaxed mt-6">
              Slayer reads dealer gamma positioning and order flow in real time, then
              scores and ranks every contract — so you act on signal instead of guessing.
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              <button
                onClick={() => onEnterApp('workspace')}
                className="bg-[var(--text-primary)] text-black px-7 py-3 font-semibold text-xs tracking-wide rounded-lg hover:bg-white transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Open terminal
              </button>
              <button
                onClick={() => document.getElementById('feature-matrix')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] px-7 py-3 font-medium text-xs tracking-wide rounded-lg hover:bg-[var(--surface-2)] transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                See how it works
              </button>
            </div>

            {/* Honest, prop-derived stats */}
            <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-12 w-full max-w-md border-t border-[var(--border)] pt-6">
              <div>
                <span className="block text-xl font-bold text-[var(--text-primary)] tabular-nums">{contractsScanned}</span>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-1">Contracts ranked</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-[var(--success)] tabular-nums">{compositeScore}</span>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-1">System score</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-[var(--text-primary)] tabular-nums">{tradesLogged}</span>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-1">Trades logged</span>
              </div>
            </div>
          </div>

          {/* Right — asset selector + live opportunity */}
          <div className="flex flex-col items-stretch gap-5 w-full max-w-lg mx-auto lg:mx-0 lg:ml-auto">
            {/* Index selector */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
              {(['SPX', 'NDX', 'QQQ', 'SPY', 'RUT'] as const).map((ticker) => (
                <button
                  key={ticker}
                  onClick={() => {
                    setActiveHeroIdx(ticker);
                    const targetAsset = ASSET_LIST.find(a => a.ticker === ticker);
                    if (targetAsset) setSelectedAsset(targetAsset);
                  }}
                  className={`flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide rounded-md transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                    activeHeroIdx === ticker
                      ? 'bg-[var(--text-primary)] text-black'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  {ticker}
                </button>
              ))}
            </div>

            {/* Global search */}
            <button
              type="button"
              onClick={() => useContractStore.getState().setIsGlobalSearchOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors duration-150 group focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            >
              <span className="flex items-center gap-2.5 text-[11px] tracking-wide text-[var(--text-tertiary)]">
                <Search className="w-3.5 h-3.5 text-[var(--success)]" />
                Search all securities &amp; index greeks
              </span>
              {prismKeybind && (
                <kbd className="hidden sm:inline-block bg-[var(--surface-2)] text-[var(--text-tertiary)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {prismKeybind.replace('cmd', typeof window !== 'undefined' && navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl').toUpperCase()}
                </kbd>
              )}
            </button>

            {/* ==================================================
                BEST OPPORTUNITY CARD (real, prop-derived)
                ================================================== */}
            <div
              id="slayer-hero-opportunity"
              onClick={handleLaunchToActiveOpportunity}
              className="w-full rounded-2xl p-4 sm:p-6 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors duration-200 cursor-pointer flex flex-col gap-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--text-tertiary)]">
                  Best opportunity
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'}`} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${isLive ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                    {isLive ? 'Live' : 'Syncing'}
                  </span>
                </span>
              </div>

              {/* Headline contract + pricing — guarded so a partial/incomplete
                  opportunity object can never render a blank ticker or NaN figures. */}
              {bestOpportunity?.ticker ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="block text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                        {bestOpportunity.ticker}
                      </span>
                      <span className="block text-[11px] text-[var(--text-tertiary)] uppercase tracking-wide mt-1">
                        {bestOpportunity.isCall ? 'Call' : 'Put'} · {activeHeroIdx}
                      </span>
                    </div>
                    <span className={`text-[11px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-md ${
                      bestOpportunity.isCall ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--danger)]/15 text-[var(--danger)]'
                    }`}>
                      {bestOpportunity.isCall ? 'Bullish' : 'Bearish'}
                    </span>
                  </div>

                  {/* Real pricing metrics */}
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Trade score</span>
                      <span className="block text-base font-bold text-[var(--success)] mt-1 tabular-nums">{Number.isFinite(bestOpportunity.confidence) ? Math.round(bestOpportunity.confidence) : '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Market</span>
                      <span className="block text-base font-bold text-[var(--text-primary)] mt-1 tabular-nums">{bestOpportunity.currentPrice ?? '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Fair value</span>
                      <span className="block text-base font-bold text-[var(--text-primary)] mt-1 tabular-nums">{bestOpportunity.fairValue ?? '—'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="uppercase tracking-wide text-[var(--text-tertiary)]">Entry zone</span>
                    <span className="font-semibold text-[var(--text-secondary)] tabular-nums">{bestOpportunity.entryZone ?? '—'}</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 p-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)]">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Ranking best opportunity for {activeHeroIdx}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">Syncing live market data…</span>
                </div>
              )}

              {/* Dealer intelligence — only rendered when genuinely live */}
              {dealerMetrics ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Dealer bias</span>
                    <span className={`block text-xs font-semibold mt-0.5 ${dealerMetrics.bias === 'LONG GAMMA' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {dealerMetrics.bias}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Vol state</span>
                    <span className="block text-xs font-semibold text-[var(--success)] mt-0.5">{dealerMetrics.volState}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Call wall</span>
                    <span className="block text-xs font-semibold text-[var(--text-primary)] mt-0.5 tabular-nums">{Number(dealerMetrics.callWall ?? 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Put wall</span>
                    <span className="block text-xs font-semibold text-[var(--text-primary)] mt-0.5 tabular-nums">{Number(dealerMetrics.putWall ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Dealer positioning</span>
                      <span className="text-[11px] font-semibold text-[var(--text-primary)] tabular-nums">{dealerMetrics.dealerScore}/100</span>
                    </div>
                    <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[var(--success)] h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, Number(dealerMetrics.dealerScore ?? 0)))}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 p-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)]">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Awaiting dealer data for {activeHeroIdx}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">Syncing live market data…</span>
                </div>
              )}

              {/* Primary action */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLaunchToActiveOpportunity();
                }}
                className="w-full py-3 mt-1 bg-[var(--text-primary)] hover:bg-white text-black font-semibold text-xs tracking-wide rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Launch live workspace
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ==================================================
          FEATURE MATRIX
          ================================================== */}
      <FeatureMatrix onEnterApp={onEnterApp} />

      {/* SUBSCRIPTION PRICING */}
      <SubscriptionPricing
        onUpgradeComplete={onUpgradeComplete}
        onEnterApp={onEnterApp}
        session={session}
        onRequestAuth={onRequestAuth}
      />
    </div>
  );
}
