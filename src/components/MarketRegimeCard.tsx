/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShieldAlert, Zap, Timer } from 'lucide-react';
import { SystemScore } from '../types';
import { useContractStore } from '../lib/store';

interface MarketRegimeProps {
  score: SystemScore;
  assetTicker: string;
}

export function MarketRegimeCard({ score }: MarketRegimeProps) {
  const serverState = useContractStore((s) => s.serverState);
  const profile = serverState?.gex_profile;

  // Authoritative regime read: dealer gamma sign from the live GEX profile when
  // present (long gamma => range-bound/bullish-supportive; short gamma =>
  // unstable/bearish). Falls back to the master-score VWAP alignment otherwise.
  const netGex = profile?.netGex;
  const gexKnown = typeof netGex === 'number';
  const isBullish = gexKnown ? netGex! >= 0 : score.vwapAlignment >= 5;
  const regimeStr = isBullish ? 'BULLISH REGIME' : 'BEARISH REGIME';
  const regimeSource = gexKnown ? 'DEALER GAMMA' : 'SCORE ENGINE';

  const confidence = score.total;

  // Volatility and momentum indications (from the master score engine)
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono overflow-hidden shadow-lg p-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full h-2 w-2 ${isBullish ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
          <span className="text-[10px] tracking-[0.25em] text-[var(--text-tertiary)] font-bold uppercase">GLOBAL MARKET REGIME</span>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase">SOURCE: {regimeSource}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Regime State */}
        <div className="bg-[var(--surface-2)] p-3 border-l border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider mb-1">
            <span className="text-[10px] font-bold">[TREND]</span> Market Regime
          </div>
          <span className={`text-sm font-bold tracking-tight uppercase ${isBullish ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {regimeStr}
          </span>
        </div>

        {/* Confidence rating */}
        <div className="bg-[var(--surface-2)] p-3 border-l border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider mb-1">
            <Zap className="w-3 text-[var(--warning)]" />
            <span>Score</span>
          </div>
          <span className="text-sm font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
            {confidence} <span className="text-[10px] text-[var(--text-tertiary)] font-normal">/ 100 PTS</span>
          </span>
        </div>

        {/* Momentum */}
        <div className="bg-[var(--surface-2)] p-3 border-l border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider mb-1">
            <ShieldAlert className="w-3 text-[var(--text-tertiary)]" />
            <span>Momentum</span>
          </div>
          <span className="text-sm font-bold tracking-wide text-[var(--text-primary)] uppercase">
            {score.momentumAcceleration >= 7 ? 'STRONG' : score.momentumAcceleration >= 4 ? 'MODERATE' : 'CONSOLIDATING'}
          </span>
        </div>

        {/* Participation */}
        <div className="bg-[var(--surface-2)] p-3 border-l border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider mb-1">
            <Timer className="w-3 text-[var(--success)]" />
            <span>Participation</span>
          </div>
          <span className="text-xs font-bold tracking-wide text-[var(--success)] uppercase">
            {score.volumeExpansion >= 7 ? 'HIGH PARTICIPATION' : score.volumeExpansion >= 4 ? 'STABLE REGIME' : 'MUTED ACTION'}
          </span>
        </div>
      </div>
    </div>
  );
}
