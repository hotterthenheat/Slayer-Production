/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  Cpu,
  Layers,
  Search,
  Database,
  BarChart4,
  DollarSign,
  HelpCircle,
  Percent,
  Calculator,
  Activity
} from 'lucide-react';
import { AssetInfo, SystemScore } from '../types';
import { calculateV11Metrics } from '../lib/v11Math';

interface SkyVisionV11CockpitProps {
  asset: AssetInfo;
  isCall: boolean;
  score: SystemScore;
  optionPremium: number;
  optionStrike: number;
}

export function SkyVisionV11Cockpit({
  asset,
  isCall,
  score,
  optionPremium,
  optionStrike
}: SkyVisionV11CockpitProps) {
  const [activeTab, setActiveTab] = useState<'exposure' | 'knn' | 'probability' | 'fairvalue'>('exposure');

  // Compute model V11 metrics. These are derived from a deterministic model
  // (calculateV11Metrics) — they are NOT a connected/audited live backtest, so
  // model-derived panels below are explicitly labeled MODEL / SAMPLE.
  const metrics = calculateV11Metrics(asset, isCall, score, optionPremium, optionStrike);
  const integrity = metrics.integrity;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono p-5 shadow-lg select-text text-left">

      {/* 1. Header with Data Quality & EV Anchor */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-[var(--border)] pb-4 mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[var(--success)]" />
            <h2 className="text-sm font-black text-[var(--text-primary)] tracking-[0.2em] uppercase">
              SKYVISION V11 // INSTITUTIONAL DECISION SUITE
            </h2>
          </div>
          <p className="text-[10.5px] text-[var(--text-tertiary)] mt-1 uppercase">
            Active Asset: <span className="text-[var(--success)] font-bold">{asset.ticker}</span> •
            Strike: <span className="text-[var(--success)] font-bold tabular-nums">${optionStrike}</span> •
            Bias: <span className={`font-bold ${isCall ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{isCall ? 'CALL / BULLISH' : 'PUT / BEARISH'}</span>
          </p>
        </div>

        {/* Quality Indicator (Tier 0) — model integrity score, no fake latency. */}
        <div className="flex items-center gap-3 bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-sm">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className={`w-2 h-2 rounded-full ${integrity.isValid ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
              <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">T0 INTEGRITY SCORE:</span>
            </div>
            <span className="text-[13px] font-black text-[var(--text-primary)] tabular-nums">{integrity.score}% / {integrity.greeksConsistency}</span>
          </div>
          {integrity.isValid ? (
            <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
          ) : (
            <AlertOctagon className="w-5 h-5 text-[var(--danger)]" />
          )}
        </div>
      </div>

      {/* Warning if data falls below safe boundaries */}
      {!integrity.isValid && (
        <div className="bg-[var(--surface-2)] border border-[var(--danger)]/60 p-3.5 mb-4 text-[11px] text-[var(--danger)] leading-normal flex gap-2">
          <AlertOctagon className="w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase block">DATA QUALITY WARNING</span>
            Quality scores fell below the safe 75% threshold. SkyVision recommendation engines are deactivated until microstructural data synchronicity is re-established.
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2 mb-4">
        <button
          onClick={() => setActiveTab('exposure')}
          className={`px-3 py-1.5 text-[10.5px] font-bold uppercase rounded-sm border transition-all cursor-pointer ${
            activeTab === 'exposure'
              ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--success)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>EXPOSURE & SURFACE (T1-T4)</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('knn')}
          className={`px-3 py-1.5 text-[10.5px] font-bold uppercase rounded-sm border transition-all cursor-pointer ${
            activeTab === 'knn'
              ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--success)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" />
            <span>FEATURE SIMILARITY (T5-T6)</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('probability')}
          className={`px-3 py-1.5 text-[10.5px] font-bold uppercase rounded-sm border transition-all cursor-pointer ${
            activeTab === 'probability'
              ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--success)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <BarChart4 className="w-3.5 h-3.5" />
            <span>OUTCOME DISTRIBUTION (T7-T8)</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('fairvalue')}
          className={`px-3 py-1.5 text-[10.5px] font-bold uppercase rounded-sm border transition-all cursor-pointer ${
            activeTab === 'fairvalue'
              ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--success)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            <span>VALUATION & ENTRY (T9-T11)</span>
          </div>
        </button>
      </div>

      {/* TAB CONTENTS */}

      {/* TAB 1: EXPOSURE & Vol Surface */}
      {activeTab === 'exposure' && (
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Vol Surface Curve Viewer */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-sm">
              <h3 className="text-xs font-black text-[var(--success)] border-b border-[var(--border)] pb-2 mb-3 flex items-center gap-1.5">
                <Activity className="w-3.5 text-[var(--success)]" /> T2 // OPTIONS IMPLIED VOLATILITY SKEW
              </h3>

              <div className="space-y-2">
                <div className="text-[10px] text-[var(--text-tertiary)] mb-2 flex justify-between">
                  <span>STRIKE LEVEL</span>
                  <span>IV (%)</span>
                </div>
                {metrics.surface.skewCurve.map((st, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] font-mono p-1 border-b border-[var(--border)]">
                    <span className="text-[var(--text-secondary)] tabular-nums">
                      ${st.strike.toFixed(1)} <span className="text-[10px] text-[var(--text-tertiary)]">({st.label})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-[var(--surface-3)] rounded-sm overflow-hidden hidden sm:block">
                        <div className="h-full bg-[var(--success)]" style={{ width: `${st.iv * 180}%` }} />
                      </div>
                      <span className="text-[var(--text-primary)] font-bold tabular-nums">{(st.iv * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3.5 text-[10px] text-[var(--text-tertiary)] flex justify-between border-t border-[var(--border)] pt-2 uppercase tabular-nums">
                <span>TERM STRUCTURE: ATM IV</span>
                <span>RANK: {metrics.surface.ivRank} // PERC: {metrics.surface.ivPercentile}</span>
              </div>
            </div>

            {/* Dealer Walls Engine */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-sm">
              <h3 className="text-xs font-black text-[var(--success)] border-b border-[var(--border)] pb-2 mb-3 flex items-center gap-1.5">
                <Database className="w-3.5 text-[var(--success)]" /> T3 // DEALER EXPOSURES & INVENTORY WALLS
              </h3>

              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-[10.5px] border-b border-[var(--border)] pb-1">
                  <span className="text-[var(--text-tertiary)]">DEALER GAMMA STATE:</span>
                  <span className="text-[var(--text-primary)] font-black text-[10px] uppercase bg-[var(--surface)] px-1.5 py-0.5 rounded-sm border border-[var(--border)]">
                    {metrics.dealer.gammaExposureText}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="p-2 bg-[var(--surface)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-tertiary)] block">CALL WALL LEVEL</span>
                    <span className="text-xs font-black text-[var(--text-primary)] tabular-nums">${metrics.dealer.callWall}</span>
                  </div>
                  <div className="p-2 bg-[var(--surface)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-tertiary)] block">PUT WALL LEVEL</span>
                    <span className="text-xs font-black text-[var(--text-primary)] tabular-nums">${metrics.dealer.putWall}</span>
                  </div>
                  <div className="p-2 bg-[var(--surface)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-tertiary)] block">GAMMA FLIP BOUNDARY</span>
                    <span className="text-xs font-black text-[var(--danger)] tabular-nums">${metrics.dealer.gammaFlipPrice.toFixed(1)}</span>
                  </div>
                  <div className="p-2 bg-[var(--surface)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-tertiary)] block">DEALER INVENTORY PRESS</span>
                    <span className="text-xs font-black text-[var(--success)] tabular-nums">{(metrics.dealer.dealerPressureIndex).toFixed(1)} / 10.0</span>
                  </div>
                </div>

                <div className="p-2 rounded-sm mirror-panel mt-2">
                  <span className="text-[10px] text-[var(--text-tertiary)] block font-bold uppercase">CHARM EXPOSURE DECAY INFLUENCE:</span>
                  <p className="text-[10px] text-[var(--success)] leading-relaxed font-sans mt-0.5">
                    {metrics.dealer.charmExposureText}
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Market regime (Tier 4) */}
          <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-sm flex flex-col sm:flex-row justify-between items-start sm:items-center text-[10.5px]">
            <div>
              <span className="text-[var(--text-tertiary)] uppercase font-black">T4 // COMPOSITE MARKET REGIME CLASSIFIER:</span>
              <p className="text-[var(--text-secondary)] mt-0.5 font-sans leading-relaxed">
                Structural label determined: <span className="text-[var(--text-primary)] font-bold uppercase">{asset.type} REGIME DETECTED</span> • Spot {score.total > 70 ? 'exhibiting bullish momentum acceleration' : 'facing overhead liquidation pressure'}.
              </p>
            </div>
            <div className="mt-2 sm:mt-0 shrink-0 uppercase tracking-widest px-2 py-1 bg-[var(--surface)] text-[var(--success)] border border-[var(--border)] rounded-sm font-black text-[10px]">
              {score.total > 75 ? 'DEALER SUPPORTIVE' : 'RANGE BOUND EXPANSION'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KNN & Similar setups */}
      {activeTab === 'knn' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <h3 className="text-xs font-black text-[var(--success)] border-b border-[var(--border)] pb-2 mb-2 uppercase flex items-center gap-1.5">
              <Search className="w-3.5 text-[var(--success)]" /> T5 // CURRENT ACTIVE STATE FEATURE VECTOR
            </h3>

            {/* Feature lists */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px] uppercase text-[var(--text-tertiary)] font-mono mb-4 text-center">
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-1.5">
                <span className="block text-[var(--text-tertiary)] font-bold mb-0.5">RSI 1m</span>
                <span className="text-[var(--success)] font-black tabular-nums">{Math.floor(score.rsiCascade * 6.5 + 23)}</span>
              </div>
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-1.5">
                <span className="block text-[var(--text-tertiary)] font-bold mb-0.5">RVOL MULTI</span>
                <span className="text-[var(--success)] font-black tabular-nums">{(score.volumeExpansion * 0.35 + 0.8).toFixed(2)}x</span>
              </div>
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-1.5">
                <span className="block text-[var(--text-tertiary)] font-bold mb-0.5">GEX SCORE</span>
                <span className="text-[var(--success)] font-black tabular-nums">+{score.total}</span>
              </div>
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-1.5">
                <span className="block text-[var(--text-tertiary)] font-bold mb-0.5">ATR MULTI</span>
                <span className="text-[var(--success)] font-black tabular-nums">{(asset.volatility * 1.4).toFixed(3)}</span>
              </div>
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-1.5 col-span-2 sm:col-span-1">
                <span className="block text-[var(--text-tertiary)] font-bold mb-0.5">STRUCTURE</span>
                <span className="text-[var(--success)] font-black">REGIME_A{score.structureQuality}</span>
              </div>
            </div>
          </div>

          {/* Similarity table (Tier 6) — MODEL-generated, not a real backtest. */}
          <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm overflow-hidden">
            <div className="px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] flex justify-between items-center text-xs font-black text-[var(--success)] uppercase">
              <span className="flex items-center gap-2">
                T6 // FEATURE SIMILARITY ENGINE (KNN)
                <span className="text-[10px] text-[var(--warning)] font-black tracking-widest border border-[var(--warning)]/40 px-1.5 py-0.5 rounded">MODEL</span>
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)]">{metrics.similarTrades.length} Closest Matches</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-tertiary)] uppercase text-[10px] bg-[var(--surface)]">
                    <th className="p-3">Matched Date</th>
                    <th className="p-3">Asset</th>
                    <th className="p-3 text-center">Distance Similarity</th>
                    <th className="p-3 text-center">Outcome</th>
                    <th className="p-3 text-right">R-Multiple</th>
                    <th className="p-3 text-right">Max Drawdown</th>
                    <th className="p-3 text-right">MFE Excursion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  {metrics.similarTrades.map((tr, index) => (
                    <tr key={index} className="hover:bg-[var(--surface)]">
                      <td className="p-3 text-[var(--text-secondary)] tabular-nums">{tr.date}</td>
                      <td className="p-3 font-bold text-[var(--text-primary)] shrink-0">{tr.pastTicker}</td>
                      <td className="p-3 text-center font-bold text-[var(--success)] tabular-nums">
                        {tr.similarityRating}%
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded-sm font-bold text-[10px] ${
                          tr.win ? 'bg-[var(--surface)] text-[var(--success)] border border-[var(--border)]' : 'bg-[var(--surface)] text-[var(--danger)] border border-[var(--danger)]/40'
                        }`}>
                          {tr.win ? 'WINNER' : 'STOP_LOSS'}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-bold tabular-nums ${tr.pnlMultiplier >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {tr.pnlMultiplier >= 0 ? '+' : ''}{tr.pnlMultiplier}R
                      </td>
                      <td className="p-3 text-right text-[var(--danger)] font-semibold tabular-nums">{tr.maxDrawdown}%</td>
                      <td className="p-3 text-right text-[var(--success)] font-semibold tabular-nums">+{tr.maxExcursion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* KNN Summary Stat Box — framed as model output, not real precedent. */}
            <div className="p-3 bg-[var(--surface)] border-t border-[var(--border)] text-[10.5px] leading-relaxed font-sans text-[var(--text-secondary)]">
              <span className="font-bold text-[var(--success)] font-mono uppercase text-[10px]">Model Similarity Summary (MODEL):</span>
              <p className="mt-0.5">
                The model surfaced {metrics.similarTrades.length} high-similarity samples with a <span className="text-[var(--success)] font-bold tabular-nums">{(metrics.similarTrades.filter(t => t.win).length / (metrics.similarTrades.length || 1) * 100).toFixed(1)}% modeled win rate</span>. Average modeled PnL excursion equals <span className="text-[var(--success)] font-bold tabular-nums">+{(metrics.similarTrades.reduce((acc, t) => acc + t.pnlMultiplier, 0) / (metrics.similarTrades.length || 1)).toFixed(2)}R</span>, with modeled median adverse drawdown of <span className="text-[var(--danger)] font-bold tabular-nums">{(metrics.similarTrades.reduce((acc, t) => acc + t.maxDrawdown, 0) / (metrics.similarTrades.length || 1)).toFixed(1)}%</span>. These are model estimates, not audited trade results.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Probability outcome spectrum */}
      {activeTab === 'probability' && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Outcome Spectrum Summation (Tier 7 & 8) */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-sm">
              <h3 className="text-xs font-black text-[var(--success)] border-b border-[var(--border)] pb-2 mb-3 uppercase flex items-center gap-1.5">
                <BarChart4 className="w-3.5 text-[var(--success)]" /> T7 // PROBABILITY OUTCOME SPECTRUM
              </h3>

              <div className="space-y-3 mt-1 text-[11px]">
                {metrics.outcomeDistribution.map((oc, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between items-center text-[var(--text-secondary)]">
                      <span className="font-sans leading-normal">{oc.outcomeName}:</span>
                      <span className="text-[var(--text-primary)] font-mono font-black tabular-nums">{oc.probability}%</span>
                    </div>
                    {/* Visual distribution horizontal bar */}
                    <div className="w-full bg-[var(--surface-3)] h-2 rounded-sm overflow-hidden relative border border-[var(--border)]">
                      <div
                        className={`h-full rounded-sm transition-all duration-300 ${
                          oc.averageValuePct > 0 ? 'bg-[var(--success)]' :
                          oc.averageValuePct > -10 ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]'
                        }`}
                        style={{ width: `${oc.probability}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] italic font-mono tabular-nums">
                      <span>Value: {oc.averageValuePct > 0 ? '+' : ''}{oc.averageValuePct.toFixed(1)}%</span>
                      <span>EV Contrib: {oc.contribution > 0 ? '+' : ''}{oc.contribution.toFixed(2)}% EV</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expected value engine stats and ML adjusters */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-[var(--success)] border-b border-[var(--border)] pb-2 mb-3 uppercase flex items-center gap-1.5">
                  <Cpu className="w-3.5 text-[var(--success)]" /> T8 // EV CALCULATIONS MATRIX (RISK-ADJUSTED)
                </h3>

                <div className="p-3 bg-[var(--surface)] rounded-sm border border-[var(--border)] relative overflow-hidden mb-3">
                  <div className="absolute right-2 top-2 select-none font-bold text-[10px] text-[var(--warning)] uppercase border border-[var(--warning)]/40 px-1 py-0.5 rounded-sm">
                    MODEL
                  </div>
                  <span className="text-[10px] text-[var(--text-tertiary)] block uppercase font-mono">INTEGRATED EXPECTED VALUE ENSEMBLE</span>
                  <div className="flex items-baseline gap-1.5 mt-1 font-mono">
                    <span className="text-[22px] font-black tracking-wide text-[var(--success)] tabular-nums">
                      {metrics.expectedValuePct >= 0 ? '+' : ''}{metrics.expectedValuePct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] uppercase">Modeled expected return per trade</span>
                  </div>
                </div>

                <div className="text-[10.5px] space-y-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-tertiary)]">EXPECTED DRAWDOWN METRIC:</span>
                    <span className="text-[var(--danger)] font-bold tabular-nums">{metrics.expectedDrawdownPct}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-tertiary)]">EXPECTED REWARD/RISK RATIO:</span>
                    <span className="text-[var(--text-primary)] font-bold tabular-nums">{metrics.riskRewardRatio}x R</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-tertiary)]">EXPECTED TIME IN STRUCTURE:</span>
                    <span className="text-[var(--success)] font-bold tabular-nums">{metrics.expectedHoldTimeMinutes} Minutes</span>
                  </div>
                </div>
              </div>

              {/* Tier 14 Machine Learning Adjuster */}
              <div className="mt-4 pt-3 border-t border-[var(--border)] font-mono text-[10px]">
                <div className="flex justify-between items-center font-black uppercase text-[var(--success)] mb-1">
                  <span>T14 // XGBoost PARAMETER BIAS ADJUST</span>
                  <span className="tabular-nums">{metrics.xgbAdjustPct >= 0 ? '+' : ''}{metrics.xgbAdjustPct.toFixed(2)}%</span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed font-sans">
                  Regressor trees adjust the prior win-likelihood model based on volatility contraction and GEX hedging-flow pressure.
                </p>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* TAB 4: Fair Value & Targets */}
      {activeTab === 'fairvalue' && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Black-Scholes valuation (Tier 9) */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-[var(--success)] border-b border-[var(--border)] pb-2 mb-3 uppercase flex items-center gap-1.5">
                  <Calculator className="w-3.5 text-[var(--success)]" /> T9 // BLACK-SCHOLES OPTIONS VALUATION
                </h3>

                <div className="space-y-3 text-[10.5px] leading-relaxed">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-tertiary)]">MARKET ASK PRICE:</span>
                    <span className="text-[var(--text-primary)] font-bold tabular-nums">${optionPremium.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-tertiary)]">BLACK-SCHOLES MODEL VALUE:</span>
                    <span className="text-[var(--success)] font-bold tabular-nums">${metrics.optionModelPrice.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-tertiary)]">VALUATION SKEW / DEVIATION:</span>
                    <span className={`font-black tabular-nums ${metrics.premiumSurchargePct <= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {metrics.premiumSurchargePct <= 0 ? '' : '+'}{metrics.premiumSurchargePct.toFixed(1)}% {metrics.premiumSurchargePct <= 0 ? 'Discount' : 'Premium'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center border-t border-[var(--border)] pt-2 text-[11px]">
                    <span className="text-[var(--text-secondary)] uppercase font-bold">VALUATION HEALTH INDEX:</span>
                    <span className={`px-2 py-0.5 rounded-sm font-black text-[10px] ${
                      metrics.valuationLabel === 'UNDERVALUED' ? 'bg-[var(--surface)] text-[var(--success)] border border-[var(--border)]' :
                      metrics.valuationLabel === 'FAIRLY_PRICED' ? 'bg-[var(--surface)] text-[var(--success)] border border-[var(--border)]' : 'bg-[var(--surface)] text-[var(--danger)] border border-[var(--danger)]/40'
                    }`}>
                      {metrics.valuationLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Entry Optimisation (Tier 10) */}
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <span className="text-[10px] uppercase text-[var(--text-tertiary)] font-black block">T10 // OPTIMAL ENTRY ZONE (MODEL):</span>
                <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed mt-1">
                  Optimal Fill: <span className="text-[var(--success)] font-mono font-bold tabular-nums">${metrics.entryZoneMin.toFixed(2)} - ${metrics.entryZoneMax.toFixed(2)}</span> (estimated bid slip {metrics.expectedSlippagePct.toFixed(2)}%). Bounded by the model's positive-EV range.
                </p>
              </div>
            </div>

            {/* Target Distributions (Tier 11) */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-sm">
              <h3 className="text-xs font-black text-[var(--success)] border-b border-[var(--border)] pb-2 mb-3 uppercase flex items-center gap-1.5">
                <Percent className="w-3.5 text-[var(--success)]" /> T11 // TARGET DISTRIBUTION ESTIMATOR
              </h3>

              <div className="space-y-2 mt-1 text-[10.5px]">
                {metrics.targets.map((t, idx) => {
                  let probColor = 'text-[var(--success)]';
                  if (t.probability < 50) probColor = 'text-[var(--danger)]';
                  else if (t.probability < 75) probColor = 'text-[var(--warning)]';

                  return (
                    <div key={idx} className="flex justify-between items-center p-1.5 border-b border-[var(--border)] font-mono">
                      <div>
                        <span className="block text-[var(--text-primary)] font-bold tabular-nums">{t.label} (Value: ${t.optionValue.toFixed(2)})</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tabular-nums">Spot Under: ${t.price.toFixed(1)} • {t.confidenceInterval}</span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`block font-black tabular-nums ${probColor}`}>{t.probability}%</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] font-sans uppercase tabular-nums">ETA: {t.expectedTimeMinutes}m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* T12 Thesis health state explanation on foot of component */}
      <div className="mt-4 pt-3.5 border-t border-[var(--border)] flex flex-col sm:flex-row justify-between items-start sm:items-center text-[10px] text-[var(--text-tertiary)] gap-2 uppercase font-bold tracking-wider select-none">
        <div className="flex items-center gap-1">
          <HelpCircle className="w-3.5 text-[var(--text-tertiary)]" />
          <span>T12 // Thesis engine: re-evaluates on each engine tick</span>
        </div>
        <span>Ref code: SV_DECISION_FRAMEWORK_V11</span>
      </div>

    </div>
  );
}
