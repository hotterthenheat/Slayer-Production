/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { AssetInfo, SystemScore } from '../types';
import { Sparkles, Check, Compass } from 'lucide-react';
import { calculateV10Metrics } from '../lib/v10Math';

interface TopOpportunitiesHubProps {
  assets: AssetInfo[];
  masterScore: SystemScore;
  onSelectOpportunity: (asset: AssetInfo, optionType: 'C' | 'P') => void;
  selectedAsset: AssetInfo;
}

export function TopOpportunitiesHub({
  assets,
  masterScore,
  onSelectOpportunity,
  selectedAsset,
}: TopOpportunitiesHubProps) {
  // NOTE: Every row below is produced by the deterministic V10 decision model
  // (calculateV10Metrics) from the master score — it is a MODEL projection, not a
  // live market feed. The UI is labelled MODEL accordingly.

  // Generate opportunities for the main hero grid using the V10 decision model
  const opportunities = assets.map((asset, index) => {
    const isBullish = index % 2 === 0;
    const basePrice = asset.defaultPrice;

    // Nearest round strike price
    const roundStep = basePrice > 1000 ? 100 : basePrice > 100 ? 5 : 1;
    const targetStrike = Math.round(basePrice / roundStep) * roundStep + (isBullish ? roundStep : -roundStep);

    // Computed premium based on scale
    const basePremium = basePrice * 0.0008 * (asset.decimals === 5 ? 100000 : 1);
    const premiumFloat = Math.max(1.15, basePremium * (1.1 + Math.sin(index + 55000) * 0.45));
    const currentPriceStr = `$${premiumFloat.toFixed(2)}`;

    // Compute dynamic mathematical attributes under the V10 decision template
    const metrics = calculateV10Metrics(asset, isBullish, masterScore, premiumFloat);
    const confidence = metrics.posteriorWinRate;
    const expectedValue = metrics.expectedValuePct;

    const fairValueStr = `$${metrics.fairValue.toFixed(2)}`;
    const entryZoneStr = `$${metrics.entryZoneMin.toFixed(2)} - $${metrics.entryZoneMax.toFixed(2)}`;

    let recommendation: 'BUY' | 'WAIT' | 'REDUCE' | 'EXIT' = 'WAIT';
    if (expectedValue >= 11) {
      recommendation = 'BUY';
    } else if (expectedValue >= 4.0) {
      recommendation = 'WAIT';
    } else {
      recommendation = 'REDUCE';
    }

    const tickerStr = `${asset.ticker} ${targetStrike}${isBullish ? 'C' : 'P'}`;

    return {
      asset,
      ticker: tickerStr,
      strike: targetStrike,
      type: isBullish ? 'BULLISH' : 'BEARISH',
      confidence,
      expectedValue,
      currentPrice: currentPriceStr,
      fairValue: fairValueStr,
      entryZone: entryZoneStr,
      recommendation,
      isCall: isBullish,
    };
  });

  // Re-sort opportunities for ranking strictly by Expected Value (EV) as per the decision hierarchy!
  const mainGridOpportunities = [...opportunities].sort((a, b) => b.expectedValue - a.expectedValue);

  // Generate Top 10 Calls List using V10 model maths
  const top10Calls = assets.concat(assets).slice(0, 10).map((asset, idx) => {
    const basePrice = asset.defaultPrice;
    const roundStep = basePrice > 1000 ? 100 : basePrice > 100 ? 5 : 1;
    const strike = Math.round(basePrice / roundStep) * roundStep + (idx + 1) * roundStep;

    const basePremium = basePrice * 0.0008 * (asset.decimals === 5 ? 100000 : 1);
    const premiumFloat = Math.max(1.15, basePremium * (1.1 + Math.sin(idx + 55000) * 0.45));
    const metrics = calculateV10Metrics(asset, true, masterScore, premiumFloat);

    let action: 'BUY' | 'WAIT' | 'HOLD' = 'WAIT';
    if (metrics.expectedValuePct >= 11) action = 'BUY';
    else if (metrics.expectedValuePct >= 4) action = 'HOLD';

    return {
      asset,
      ticker: `${asset.ticker} $${strike}C`,
      confidence: Math.round(metrics.posteriorWinRate),
      expectedValue: metrics.expectedValuePct,
      action,
      type: 'C' as const,
    };
  });

  // Generate Top 10 Puts List using V10 model maths
  const top10Puts = assets.concat(assets).slice(0, 10).map((asset, idx) => {
    const basePrice = asset.defaultPrice;
    const roundStep = basePrice > 1000 ? 100 : basePrice > 100 ? 5 : 1;
    const strike = Math.round(basePrice / roundStep) * roundStep - (idx + 1) * roundStep;

    const basePremium = basePrice * 0.0008 * (asset.decimals === 5 ? 100000 : 1);
    const premiumFloat = Math.max(1.15, basePremium * (1.1 + Math.sin(idx + 55000) * 0.45));
    const metrics = calculateV10Metrics(asset, false, masterScore, premiumFloat);

    let action: 'BUY' | 'WAIT' | 'HOLD' = 'WAIT';
    if (metrics.expectedValuePct >= 11) action = 'BUY';
    else if (metrics.expectedValuePct >= 4) action = 'HOLD';

    return {
      asset,
      ticker: `${asset.ticker} $${strike}P`,
      confidence: Math.round(metrics.posteriorWinRate),
      expectedValue: metrics.expectedValuePct,
      action,
      type: 'P' as const,
    };
  });

  return (
    <div className="flex flex-col gap-5">

      {/* Model disclosure banner (replaces the unverifiable "84.6% hit rate" vanity claims) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm p-4 font-mono shadow-md flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-[var(--info)]" />
        <div>
          <span className="text-[10px] tracking-[0.2em] text-[var(--text-tertiary)] font-bold block uppercase">V10 DECISION MODEL — PROJECTION</span>
          <span className="text-xs text-[var(--text-secondary)] font-sans tracking-wide">
            Rankings below are model projections derived from the master score. Not a live feed and not a verified track record.
          </span>
        </div>
        <span className="ml-auto text-[10px] px-2 py-0.5 border border-[var(--border)] text-[var(--warning)] rounded-sm uppercase font-bold">MODEL</span>
      </div>

      {/* Hero: Top Opportunities Grid */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 text-[var(--info)]" />
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-primary)]">
              TOP OPPORTUNITIES ENGINE
            </h2>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] border border-[var(--border)] px-2 py-0.5 bg-[var(--surface-3)] uppercase">MODEL · MASTER SCORE</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-2)] text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-2.5">Rank</th>
                <th className="px-4 py-2.5">Contract</th>
                <th className="px-4 py-2.5 text-center">Bias</th>
                <th className="px-4 py-2.5 text-center">P(win)</th>
                <th className="px-4 py-2.5 text-center text-[var(--info)]">Expected Value (EV)</th>
                <th className="px-4 py-2.5 text-right">Model Price</th>
                <th className="px-4 py-2.5 text-right">Fair Value</th>
                <th className="px-4 py-2.5 text-center">Entry Area</th>
                <th className="px-4 py-2.5 text-center">Action</th>
                <th className="px-4 py-2.5 text-right">Control</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--surface)]">
              {mainGridOpportunities.map((opp, idx) => {
                const isSelected = selectedAsset.ticker === opp.asset.ticker;
                const isBuy = opp.recommendation === 'BUY';
                const isWait = opp.recommendation === 'WAIT';

                return (
                  <tr
                    key={opp.ticker}
                    className={`hover:bg-[var(--surface-2)] transition-colors border-t border-[var(--border)] ${
                      isSelected ? 'bg-[var(--surface-2)] border-l-2 border-l-[var(--info)]' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="px-4 py-3 font-semibold text-[var(--text-tertiary)] tabular-nums">
                      #0{idx + 1}
                    </td>

                    {/* Contract */}
                    <td className="px-4 py-3">
                      <span
                        onClick={() => onSelectOpportunity(opp.asset, opp.isCall ? 'C' : 'P')}
                        className="text-[var(--text-primary)] tracking-wider font-semibold hover:underline cursor-pointer"
                      >
                        {opp.ticker}
                      </span>
                    </td>

                    {/* Bias Direction */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm font-bold border border-[var(--border)] ${
                        opp.isCall
                          ? 'bg-[var(--surface-2)] text-[var(--success)]'
                          : 'bg-[var(--surface-2)] text-[var(--danger)]'
                      }`}>
                        {opp.isCall ? 'BULLISH' : 'BEARISH'}
                      </span>
                    </td>

                    {/* Win probability (P_win) */}
                    <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)] tabular-nums">
                      <span>{opp.confidence.toFixed(1)}%</span>
                    </td>

                    {/* Expected Value */}
                    <td className="px-4 py-3 text-center font-black">
                      <span className={`text-xs px-2 py-0.5 rounded-sm border border-[var(--border)] tabular-nums ${opp.expectedValue >= 0 ? 'text-[var(--success)] bg-[var(--surface-2)]' : 'text-[var(--danger)] bg-[var(--surface-2)]'}`}>
                        {opp.expectedValue >= 0 ? '+' : ''}{opp.expectedValue.toFixed(1)}%
                      </span>
                    </td>

                    {/* Model price */}
                    <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)] tabular-nums">
                      {opp.currentPrice}
                    </td>

                    {/* Fair Value target */}
                    <td className="px-4 py-3 text-right text-[var(--info)] font-mono font-medium tabular-nums">
                      {opp.fairValue}
                    </td>

                    {/* Opt Entry Zone */}
                    <td className="px-4 py-3 text-center text-[var(--text-tertiary)] font-mono tabular-nums">
                      {opp.entryZone}
                    </td>

                    {/* Action badge */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-sm text-[10px] font-black tracking-wider border border-[var(--border)] ${
                        isBuy
                          ? 'bg-[var(--success)] text-black'
                          : isWait
                          ? 'bg-[var(--surface-2)] text-[var(--success)]'
                          : 'bg-[var(--surface-2)] text-[var(--danger)]'
                      }`}>
                        {opp.recommendation}
                      </span>
                    </td>

                    {/* Analysis launcher */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onSelectOpportunity(opp.asset, opp.isCall ? 'C' : 'P')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-sm border cursor-pointer uppercase transition-all flex items-center gap-1 ml-auto ${
                          isSelected
                            ? 'bg-[var(--surface-2)] border-[var(--border-strong)] text-[var(--success)]'
                            : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {isSelected ? <Check className="w-3" /> : null}
                        {isSelected ? 'LOADED' : 'DECIDERS'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side-by-Side: Top 10 Calls & Top 10 Puts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top 10 Calls list */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono overflow-hidden shadow-md">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[var(--success)]" />
              <span className="text-xs font-bold text-[var(--success)] uppercase tracking-wider">TOP 10 RANKED BULLISH CALLS</span>
            </div>
            <span className="text-[10px] text-[var(--warning)] font-extrabold uppercase">MODEL</span>
          </div>

          <div className="overflow-y-auto max-h-[360px]">
            {top10Calls.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onSelectOpportunity(item.asset, 'C')}
                className="flex items-center justify-between p-3.5 hover:bg-[var(--surface-2)] transition-colors cursor-pointer border-t border-[var(--border)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[var(--success)] font-bold font-mono tabular-nums">#{(idx + 1).toString().padStart(2, '0')}</span>
                  <span className="text-[var(--text-primary)] tracking-wider font-semibold font-mono text-xs">{item.ticker}</span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] text-[var(--text-tertiary)] block uppercase font-mono">EXPECTED VALUE</span>
                    <span className="text-xs font-black text-[var(--success)] font-mono flex items-center justify-end tabular-nums">{item.expectedValue >= 0 ? '+' : ''}{item.expectedValue.toFixed(1)}%</span>
                  </div>

                  <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border border-[var(--border)] ${
                    item.action === 'BUY' ? 'bg-[var(--surface-3)] text-[var(--success)] font-black' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'
                  }`}>
                    {item.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 Puts list */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono overflow-hidden shadow-md">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[var(--danger)]" />
              <span className="text-xs font-bold text-[var(--danger)] uppercase tracking-wider">TOP 10 RANKED BEARISH PUTS</span>
            </div>
            <span className="text-[10px] text-[var(--warning)] font-extrabold uppercase">MODEL</span>
          </div>

          <div className="overflow-y-auto max-h-[360px]">
            {top10Puts.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onSelectOpportunity(item.asset, 'P')}
                className="flex items-center justify-between p-3.5 hover:bg-[var(--surface-2)] transition-colors cursor-pointer border-t border-[var(--border)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[var(--danger)] font-bold font-mono tabular-nums">#{(idx + 1).toString().padStart(2, '0')}</span>
                  <span className="text-[var(--text-primary)] tracking-wider font-semibold font-mono text-xs">{item.ticker}</span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] text-[var(--text-tertiary)] block uppercase font-mono">EXPECTED VALUE</span>
                    <span className="text-xs font-black text-[var(--success)] font-mono flex items-center justify-end tabular-nums">{item.expectedValue >= 0 ? '+' : ''}{item.expectedValue.toFixed(1)}%</span>
                  </div>

                  <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border border-[var(--border)] ${
                    item.action === 'BUY' ? 'bg-[var(--surface-3)] text-[var(--danger)]' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'
                  }`}>
                    {item.action === 'BUY' ? 'SELL' : item.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
