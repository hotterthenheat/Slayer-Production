/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check, Info, ShieldAlert } from 'lucide-react';
import { SystemScore, AssetInfo } from '../types';
import { calculateV10Metrics } from '../lib/v10Math';

interface WhyWeLikeTradeProps {
  score: SystemScore;
  isBullish?: boolean;
  asset?: AssetInfo;
}

export function WhyWeLikeCard({ score, isBullish = true, asset }: WhyWeLikeTradeProps) {
  // Map points dynamically depending on score factors to keep it realistic and living
  const rsiContinuity = score.rsiCascade > 4;
  const vwapAligned = score.vwapAlignment > 4;
  const strongParticipation = score.volumeExpansion > 4;
  const healthyStructure = score.structureQuality > 5;
  const strongLiquidity = score.liquiditySweep > 4;
  const historicalPositive = score.total > 70;

  // Render metrics using V10 formulas
  const fallbackAsset: AssetInfo = asset || {
    ticker: 'SPX',
    name: 'S&P 500 Index',
    type: 'INDEXES',
    defaultPrice: 5175,
    decimals: 2,
    spread: 0.5,
    volatility: 0.16,
    unit: 'points'
  };

  const metrics = calculateV10Metrics(fallbackAsset, isBullish, score, 5.50);

  const factors = [
    {
      label: 'RSI Continuity',
      status: rsiContinuity,
      description: 'Momentum flows across 1m, 5m and 15m frames are in perfect alignment.',
    },
    {
      label: isBullish ? 'Above VWAP Alignment' : 'Below VWAP Alignment',
      status: vwapAligned,
      description: `Price successfully sustained ${isBullish ? 'above' : 'below'} the Volume-Weighted Average Price anchor.`,
    },
    {
      label: 'Strong Participation',
      status: strongParticipation,
      description: 'Volume Expansion (RVOL) and high-velocity institutional size blocks identified.',
    },
    {
      label: 'Healthy Structure',
      status: healthyStructure,
      description: 'Sustained Higher-Highs / Higher-Lows confirming structural trend continuation.',
    },
    {
      label: 'Strong Liquidity',
      status: strongLiquidity,
      description: 'Key opposing pools swept, leaving the path cleared for trade expansion.',
    },
    {
      label: 'Positive Historical Similar Setups',
      status: historicalPositive,
      description: `V10 calibration aligns patterns to precedents. Estimated Bayesian likelihood is calibrated at ${metrics.posteriorWinRate}% based on historical backtest indicators.`,
    },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono overflow-hidden shadow-lg p-5 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[var(--success)]" />
            <span className="text-xs tracking-[0.2em] font-bold text-[var(--text-primary)]">WHY SKYVISION LIKES THIS TRADE</span>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase select-none border border-[var(--border)] px-2 bg-[var(--surface-2)] py-0.5">ALGORITHMIC LOGIC</span>
        </div>

        <p className="text-[11px] text-[var(--text-tertiary)] leading-normal mb-4 font-sans">
          The system actively scans and validates institutional order blocks. All checked parameters identify strong core agreement:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {factors.map((f, idx) => (
            <div key={idx} className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-sm flex items-start gap-2.5">
              <div className={`w-4 h-4 mt-0.5 rounded-sm flex items-center justify-center border transition-all ${
                f.status
                  ? 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--success)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-tertiary)]'
              }`}>
                {f.status ? <Check className="w-3 h-3 stroke-[2.5]" /> : <span className="text-[10px]">◌</span>}
              </div>
              <div>
                <span className={`text-xs font-bold block ${f.status ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] line-through'}`}>
                  {f.label}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] block leading-tight mt-0.5 font-sans">
                  {f.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 pt-3.5 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)] italic flex items-center gap-1.5 leading-none">
        <ShieldAlert className="w-3.5 text-[var(--text-tertiary)]" />
        <span>No subjective bias. Purely data-driven mathematical thesis verification.</span>
      </div>
    </div>
  );
}
