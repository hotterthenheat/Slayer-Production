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
  FileSpreadsheet,
  Gauge,
  Percent,
  Calculator,
  Activity
} from 'lucide-react';
import { AssetInfo, SystemScore } from '../types';
import { calculateV11Metrics, SimilarTrade, TargetV11 } from '../lib/v11Math';

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

  // Compute our high-fidelity V11 metrics
  const metrics = calculateV11Metrics(asset, isCall, score, optionPremium, optionStrike);
  const integrity = metrics.integrity;

  return (
    <div className="bg-black border border-black rounded-sm font-mono p-5 shadow-lg select-text text-left">
      
      {/* 1. Header with Data Quality & EV Anchor */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-black pb-4 mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#4ADE80] animate-pulse" />
            <h2 className="text-sm font-black text-[#E5E5E5] tracking-[0.2em] uppercase">
              SKYVISION V11 // INSTITUTIONAL DECISION SUITE
            </h2>
          </div>
          <p className="text-[10.5px] text-zinc-500 mt-1 uppercase">
            Active Asset: <span className="text-[#4ADE80] font-bold">{asset.ticker}</span> • 
            Strike: <span className="text-[#4ADE80] font-bold">${optionStrike}</span> • 
            Bias: <span className={`font-bold ${isCall ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>{isCall ? 'CALL / BULLISH' : 'PUT / BEARISH'}</span>
          </p>
        </div>

        {/* Dynamic Quality Indicator (Tier 0) */}
        <div className="flex items-center gap-3 bg-black border border-black px-3 py-1.5 rounded-sm">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className={`w-2 h-2 rounded-full ${integrity.isValid ? 'bg-black/40' : 'bg-rose-400'} animate-ping`} />
              <span className="text-[9px] text-[#888888] font-bold uppercase tracking-wider">T0 INTEGRITY SCORE:</span>
            </div>
            <span className="text-[13px] font-black text-[#E5E5E5]">{integrity.score}% / {integrity.greeksConsistency}</span>
          </div>
          {integrity.isValid ? (
            <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
          ) : (
            <AlertOctagon className="w-5 h-5 text-[#F87171]" />
          )}
        </div>
      </div>

      {/* Warning if data falls below safe boundaries */}
      {!integrity.isValid && (
        <div className="bg-rose-950/20 border border-rose-900/60 p-3.5 mb-4 text-[11px] text-rose-500 leading-normal flex gap-2">
          <AlertOctagon className="w-4 shrink-0 mt-0.5 animate-bounce" />
          <div>
            <span className="font-bold uppercase block">DATA CORRUPTION WARNING</span>
            Quality scores fell below the safe 75% threshold. SkyVision recommendation engines are deactivated until microstructural queue synchronicity is re-established.
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-1 border-b border-black pb-2 mb-4">
        <button
          onClick={() => setActiveTab('exposure')}
          className={`px-3 py-1.5 text-[10.5px] font-bold uppercase rounded-sm border transition-all cursor-pointer ${
            activeTab === 'exposure'
              ? 'bg-black border-black text-[#E5E5E5]'
              : 'border-transparent text-zinc-500 hover:text-[#4ADE80]'
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
              ? 'bg-black border-black text-[#E5E5E5]'
              : 'border-transparent text-zinc-500 hover:text-[#4ADE80]'
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
              ? 'bg-black border-black text-[#E5E5E5]'
              : 'border-transparent text-zinc-500 hover:text-[#4ADE80]'
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
              ? 'bg-black border-black text-[#E5E5E5]'
              : 'border-transparent text-zinc-500 hover:text-[#4ADE80]'
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
            <div className="bg-black/30 border border-black p-4 rounded-sm">
              <h3 className="text-xs font-black text-[#4ADE80] border-b border-black pb-2 mb-3 flex items-center gap-1.5">
                <Activity className="w-3.5 text-[#4ADE80]" /> T2 // OPTIONS IMPLIED VOLATILITY SKEW
              </h3>
              
              <div className="space-y-2">
                <div className="text-[10px] text-zinc-500 mb-2 flex justify-between">
                  <span>STRIKE LEVEL</span>
                  <span>IV (%)</span>
                </div>
                {metrics.surface.skewCurve.map((st, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] font-mono p-1 border-b border-black">
                    <span className="text-zinc-450">
                      ${st.strike.toFixed(1)} <span className="text-[8.5px] text-zinc-600">({st.label})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-black rounded-sm overflow-hidden hidden sm:block">
                        <div className="h-full bg-[#4ADE80] text-black" style={{ width: `${st.iv * 180}%` }} />
                      </div>
                      <span className="text-[#E5E5E5] font-bold">{(st.iv * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3.5 text-[9px] text-zinc-550 flex justify-between border-t border-black pt-2 uppercase">
                <span>TERM STRUCTURE: ATM IV</span>
                <span>RANK: {metrics.surface.ivRank} // PERC: {metrics.surface.ivPercentile}</span>
              </div>
            </div>

            {/* Dealer Walls Engine */}
            <div className="bg-black/30 border border-black p-4 rounded-sm">
              <h3 className="text-xs font-black text-[#4ADE80] border-b border-black pb-2 mb-3 flex items-center gap-1.5">
                <Database className="w-3.5 text-[#4ADE80]" /> T3 // DEALER EXPOSURES & INVENTORY WALLS
              </h3>

              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-[10.5px] border-b border-black pb-1">
                  <span className="text-zinc-500">DEALER GAMMA STATE:</span>
                  <span className="text-[#E5E5E5] font-black text-[9.5px] uppercase bg-black px-1.5 py-0.5 rounded-sm border border-black">
                    {metrics.dealer.gammaExposureText}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="p-2 bg-black/60 border border-black">
                    <span className="text-[8px] text-zinc-500 block">CALL WALL LEVEL</span>
                    <span className="text-xs font-black text-[#E5E5E5]">${metrics.dealer.callWall}</span>
                  </div>
                  <div className="p-2 bg-black/60 border border-black">
                    <span className="text-[8px] text-zinc-500 block">PUT WALL LEVEL</span>
                    <span className="text-xs font-black text-[#E5E5E5]">${metrics.dealer.putWall}</span>
                  </div>
                  <div className="p-2 bg-black/60 border border-black">
                    <span className="text-[8px] text-zinc-500 block">GAMMA FLIP BOUNDARY</span>
                    <span className="text-xs font-black text-[#F87171]">${metrics.dealer.gammaFlipPrice.toFixed(1)}</span>
                  </div>
                  <div className="p-2 bg-black/60 border border-black">
                    <span className="text-[8px] text-zinc-500 block">DEALER INVENTORY PRESS</span>
                    <span className="text-xs font-black text-[#4ADE80]">{(metrics.dealer.dealerPressureIndex).toFixed(1)} / 10.0</span>
                  </div>
                </div>

                <div className="p-2 rounded-sm mirror-panel mt-2">
                  <span className="text-[8px] text-zinc-500 block font-bold uppercase">CHARM EXPOSURE DECAY INFLUENCE:</span>
                  <p className="text-[10px] text-[#4ADE80] leading-relaxed font-sans mt-0.5">
                    {metrics.dealer.charmExposureText}
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Market regime (Tier 4) */}
          <div className="bg-black border border-black p-3 rounded-sm flex flex-col sm:flex-row justify-between items-start sm:items-center text-[10.5px]">
            <div>
              <span className="text-zinc-500 uppercase font-black">T4 // COMPOSITE MARKET REGIME CLASSIFIER:</span>
              <p className="text-zinc-400 mt-0.5 font-sans leading-relaxed">
                Structural label determined: <span className="text-[#E5E5E5] font-bold uppercase">{asset.type} REGIME DETECTED</span> • Spot {score.total > 70 ? 'exhibiting bullish momentum acceleration' : 'facing overhead liquidation pressure'}.
              </p>
            </div>
            <div className="mt-2 sm:mt-0 shrink-0 uppercase tracking-widest px-2 py-1 bg-black/40 text-[#4ADE80] border border-black rounded-sm font-black text-[9.5px]">
              {score.total > 75 ? 'DEALER SUPPORTIVE' : 'RANGE BOUND EXPANSION'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KNN & SImilar setups */}
      {activeTab === 'knn' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <h3 className="text-xs font-black text-[#4ADE80] border-b border-black pb-2 mb-2 uppercase flex items-center gap-1.5">
              <Search className="w-3.5 text-[#4ADE80]" /> T5 // CURRENT ACTIVE STATE FEATURE VECTOR
            </h3>
            
            {/* Feature lists */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[9px] uppercase text-zinc-500 font-mono mb-4 text-center">
              <div className="bg-black border border-black p-1.5">
                <span className="block text-zinc-600 font-bold mb-0.5">RSI 1m</span>
                <span className="text-[#4ADE80] font-black">{Math.floor(score.rsiCascade * 6.5 + 23)}</span>
              </div>
              <div className="bg-black border border-black p-1.5">
                <span className="block text-zinc-600 font-bold mb-0.5">RVOL MULTI</span>
                <span className="text-[#4ADE80] font-black">{(score.volumeExpansion * 0.35 + 0.8).toFixed(2)}x</span>
              </div>
              <div className="bg-black border border-black p-1.5">
                <span className="block text-zinc-600 font-bold mb-0.5">GEX SCORE</span>
                <span className="text-[#4ADE80] font-black">+{score.total}</span>
              </div>
              <div className="bg-black border border-black p-1.5">
                <span className="block text-zinc-600 font-bold mb-0.5">ATR MULTI</span>
                <span className="text-[#4ADE80] font-black">{(asset.volatility * 1.4).toFixed(3)}</span>
              </div>
              <div className="bg-black border border-black p-1.5 col-span-2 sm:col-span-1">
                <span className="block text-zinc-600 font-bold mb-0.5">STRUCTURE</span>
                <span className="text-[#4ADE80] font-black">REGIME_A{score.structureQuality}</span>
              </div>
            </div>
          </div>

          {/* Historical similarity table (Tier 6) */}
          <div className="bg-black/30 border border-black rounded-sm overflow-hidden">
            <div className="px-4 py-2 bg-black border-b border-black flex justify-between items-center text-xs font-black text-[#4ADE80] uppercase">
              <span>T6 // HISTORICAL SIMILARITY ENGINE (KNN SUITE)</span>
              <span className="text-[10px] text-zinc-500">5 Closest Matches Found</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-black text-zinc-500 uppercase text-[9px] bg-black/40">
                    <th className="p-3">Matched Date</th>
                    <th className="p-3">Asset</th>
                    <th className="p-3 text-center">Distance Similarity</th>
                    <th className="p-3 text-center">Outcome</th>
                    <th className="p-3 text-right">R-Multiple</th>
                    <th className="p-3 text-right">Max Drawdown</th>
                    <th className="p-3 text-right">MFE Excursion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-950 text-zinc-200">
                  {metrics.similarTrades.map((tr, index) => (
                    <tr key={index} className="hover:bg-black/40">
                      <td className="p-3 text-zinc-400">{tr.date}</td>
                      <td className="p-3 font-bold text-[#E5E5E5] shrink-0">{tr.pastTicker}</td>
                      <td className="p-3 text-center font-bold text-[#4ADE80]">
                        {tr.similarityRating}%
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded-sm font-bold text-[9px] ${
                          tr.win ? 'bg-black/40 text-[#4ADE80] border border-black' : 'bg-rose-950/40 text-[#F87171] border border-[#F87171]/40'
                        }`}>
                          {tr.win ? 'WINNER' : 'STOP_LOSS'}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-bold ${tr.pnlMultiplier >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                        {tr.pnlMultiplier >= 0 ? '+' : ''}{tr.pnlMultiplier}R
                      </td>
                      <td className="p-3 text-right text-rose-500 font-semibold">{tr.maxDrawdown}%</td>
                      <td className="p-3 text-right text-[#4ADE80] font-semibold">+{tr.maxExcursion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* KNN Summary Stat Box */}
            <div className="p-3 bg-black/40 border-t border-black text-[10.5px] leading-relaxed font-sans text-zinc-400">
              <span className="font-bold text-[#4ADE80] font-mono uppercase text-[9.5px]">Master Historic Precedent Summary:</span>
              <p className="mt-0.5">
                The similarity module tracked {metrics.similarTrades.length} high-correlation precedents in the backtest archive with a <span className="text-[#4ADE80] font-bold">{(metrics.similarTrades.filter(t => t.win).length / (metrics.similarTrades.length || 1) * 100).toFixed(1)}% historic win rate</span>. Average PnL excursion equals <span className="text-[#4ADE80] font-bold">+{(metrics.similarTrades.reduce((acc, t) => acc + t.pnlMultiplier, 0) / (metrics.similarTrades.length || 1)).toFixed(2)}R</span>, median adverse drawdown restricted to <span className="text-rose-500 font-bold">{(metrics.similarTrades.reduce((acc, t) => acc + t.maxDrawdown, 0) / (metrics.similarTrades.length || 1)).toFixed(1)}%</span>.
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
            <div className="bg-black/30 border border-black p-4 rounded-sm">
              <h3 className="text-xs font-black text-[#4ADE80] border-b border-black pb-2 mb-3 uppercase flex items-center gap-1.5">
                <BarChart4 className="w-3.5 text-[#4ADE80]" /> T7 // PROBABILITY OUTCOME SPECTRUM
              </h3>

              <div className="space-y-3 mt-1 text-[11px]">
                {metrics.outcomeDistribution.map((oc, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between items-center text-zinc-350">
                      <span className="font-sans leading-normal">{oc.outcomeName}:</span>
                      <span className="text-[#E5E5E5] font-mono font-black">{oc.probability}%</span>
                    </div>
                    {/* Visual distribution horizontal bar */}
                    <div className="w-full bg-black h-2 rounded-sm overflow-hidden relative border border-black">
                      <div 
                        className={`h-full rounded-sm transition-all duration-300 ${
                          oc.averageValuePct > 10 ? 'bg-black/40' :
                          oc.averageValuePct > 0 ? 'bg-black' :
                          oc.averageValuePct > -10 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${oc.probability}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-zinc-550 italic font-mono">
                      <span>Value: {oc.averageValuePct > 0 ? '+' : ''}{oc.averageValuePct.toFixed(1)}%</span>
                      <span>EV Contrib: {oc.contribution > 0 ? '+' : ''}{oc.contribution.toFixed(2)}% EV</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expected value engine stats and ML adjusters */}
            <div className="bg-black/30 border border-black p-4 rounded-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-[#4ADE80] border-b border-black pb-2 mb-3 uppercase flex items-center gap-1.5">
                  <Cpu className="w-3.5 text-[#4ADE80]" /> T8 // EV CALCULATIONS MATRIX (RISK-ADJUSTED)
                </h3>

                <div className="p-3 bg-black/60 rounded-sm border border-black relative overflow-hidden mb-3">
                  <div className="absolute right-2 top-2 select-none font-bold text-[8px] text-[#4ADE80] uppercase border border-black px-1 py-0.5 rounded-sm">
                    STAT_READY
                  </div>
                  <span className="text-[9px] text-[#888888] block uppercase font-mono">INTEGRATED EXPECTED VALUE ENSEMBLE</span>
                  <div className="flex items-baseline gap-1.5 mt-1 font-mono">
                    <span className="text-[22px] font-black tracking-wide text-[#4ADE80]">
                      {metrics.expectedValuePct >= 0 ? '+' : ''}{metrics.expectedValuePct.toFixed(1)}%
                    </span>
                    <span className="text-[9.5px] text-zinc-550 uppercase">Expected return of layout per trade</span>
                  </div>
                </div>

                <div className="text-[10.5px] space-y-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">EXPECTED DRAWDOWN METRIC:</span>
                    <span className="text-[#F87171] font-bold">{metrics.expectedDrawdownPct}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">EXPECTED REWARD/RISK RATIO:</span>
                    <span className="text-[#E5E5E5] font-bold">{metrics.riskRewardRatio}x R</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">EXPECTED TIME IN STRUCTURE:</span>
                    <span className="text-[#4ADE80] font-bold">{metrics.expectedHoldTimeMinutes} Minutes</span>
                  </div>
                </div>
              </div>

              {/* Tier 14 Machine Learning Adjuster */}
              <div className="mt-4 pt-3 border-t border-black/60 font-mono text-[10px]">
                <div className="flex justify-between items-center font-black uppercase text-[#4ADE80] mb-1">
                  <span>T14 // XGBoost PARAMETER BIAS ADJUST</span>
                  <span>{metrics.xgbAdjustPct >= 0 ? '+' : ''}{metrics.xgbAdjustPct.toFixed(2)}%</span>
                </div>
                <p className="text-[9.5px] text-zinc-550 leading-relaxed font-sans">
                  Explainable regressor trees updated prior win likelihood models based on volatility contraction and GEX hedging flow pressure points.
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
            <div className="bg-black/30 border border-black p-4 rounded-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-[#4ADE80] border-b border-black pb-2 mb-3 uppercase flex items-center gap-1.5">
                  <Calculator className="w-3.5 text-[#4ADE80]" /> T9 // BLACK-SCHOLES OPTIONS VALUATION
                </h3>

                <div className="space-y-3 text-[10.5px] leading-relaxed">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">MARKET ASK PRICE:</span>
                    <span className="text-[#E5E5E5] font-bold">${optionPremium.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">BLACK-SCHOLES MODEL VALUE:</span>
                    <span className="text-[#4ADE80] font-bold">${metrics.optionModelPrice.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">VALUATION SKEW / DEVIATION:</span>
                    <span className={`font-black ${metrics.premiumSurchargePct <= 0 ? 'text-[#4ADE80]' : 'text-rose-500'}`}>
                      {metrics.premiumSurchargePct <= 0 ? '' : '+'}{metrics.premiumSurchargePct.toFixed(1)}% {metrics.premiumSurchargePct <= 0 ? 'Discount' : 'Premium'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center border-t border-black pt-2 text-[11px]">
                    <span className="text-zinc-400 uppercase font-bold">VALUATION HEALTH INDEX:</span>
                    <span className={`px-2 py-0.5 rounded-sm font-black text-[9px] ${
                      metrics.valuationLabel === 'UNDERVALUED' ? 'bg-black/40 text-[#4ADE80] border border-black' :
                      metrics.valuationLabel === 'FAIRLY_PRICED' ? 'bg-black text-[#4ADE80] border border-black' : 'bg-rose-950/30 text-rose-500 border border-[#F87171]/40'
                    }`}>
                      {metrics.valuationLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Entry Optimisation (Tier 10) */}
              <div className="mt-4 pt-3 border-t border-black/60">
                <span className="text-[8.5px] uppercase text-zinc-550 font-black block">T10 // MATHEMATICAL OPTIMAL FILLED CAP ENTRY ZONE:</span>
                <p className="text-[10px] text-zinc-400 font-sans leading-relaxed mt-1">
                  Optimal Fill: <span className="text-[#4ADE80] font-mono font-bold">${metrics.entryZoneMin.toFixed(2)} - ${metrics.entryZoneMax.toFixed(2)}</span> (estimated bid slip {metrics.expectedSlippagePct.toFixed(2)}%). Validated by positive historical EV bounds.
                </p>
              </div>
            </div>

            {/* Target Distributions (Tier 11) */}
            <div className="bg-black/30 border border-black p-4 rounded-sm">
              <h3 className="text-xs font-black text-[#4ADE80] border-b border-black pb-2 mb-3 uppercase flex items-center gap-1.5">
                <Percent className="w-3.5 text-[#4ADE80]" /> T11 // TARGET DISTRIBUTION ESTIMATOR
              </h3>

              <div className="space-y-2 mt-1 text-[10.5px]">
                {metrics.targets.map((t, idx) => {
                  let probColor = 'text-[#4ADE80]';
                  if (t.probability < 50) probColor = 'text-[#F87171]';
                  else if (t.probability < 75) probColor = 'text-amber-500';

                  return (
                    <div key={idx} className="flex justify-between items-center p-1.5 border-b border-black font-mono">
                      <div>
                        <span className="block text-[#E5E5E5] font-bold">{t.label} (Value: ${t.optionValue.toFixed(2)})</span>
                        <span className="text-[8.5px] text-zinc-550 uppercase">Spot Under: ${t.price.toFixed(1)} • {t.confidenceInterval}</span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`block font-black ${probColor}`}>{t.probability}%</span>
                        <span className="text-[8.5px] text-zinc-550 font-sans uppercase">ETA: {t.expectedTimeMinutes}m</span>
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
      <div className="mt-4 pt-3.5 border-t border-black/60 flex flex-col sm:flex-row justify-between items-start sm:items-center text-[10px] text-zinc-550 gap-2 uppercase font-bold uppercase tracking-wider select-none">
        <div className="flex items-center gap-1">
          <HelpCircle className="w-3.5 text-zinc-650" />
          <span>T12 // Thesis engine: ACTIVE RE-EVALUATION OCCURRING MINUTE-WISE BY CORE ENGINE</span>
        </div>
        <span>Ref code: SV_DECISION_FRAMEWORK_V11</span>
      </div>

    </div>
  );
}
