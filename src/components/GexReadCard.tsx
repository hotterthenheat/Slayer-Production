/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Market Summary — a per-ticker, simple-language summary of the dealer-gamma
 * posture, generated deterministically server-side from the same GEX data the
 * cards show and refreshed on the 30-minute mark (with a live countdown).
 */
import React, { useEffect, useState } from 'react';
import { useContractStore } from '../lib/store';
import { Brain, Clock } from 'lucide-react';
import { formatTime } from '../lib/timeUtils';

function useCountdown(target?: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!target) return '--:--';
  const ms = Math.max(0, target - now);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function GexReadCard() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const summary = serverState?.gex_summary;
  const countdown = useCountdown(summary?.nextRefreshAt);

  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-3"
      style={{ borderLeftColor: 'var(--info)', borderLeftWidth: '3px' }}
    >
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[var(--info)]" />
          <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">
            Market Summary — {selectedAsset?.ticker}
          </h2>
        </div>
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold tabular-nums text-[var(--text-tertiary)] uppercase tracking-widest"
          title="Time until the next 30-minute refresh"
        >
          <Clock className="w-3 h-3" />
          <span>Refresh {countdown}</span>
        </div>
      </div>

      {summary?.text ? (
        <p className="text-[13px] leading-relaxed text-[var(--text-primary)] font-medium">{summary.text}</p>
      ) : (
        <p className="text-[12px] text-[var(--text-tertiary)] animate-pulse">Reading dealer-gamma posture…</p>
      )}

      <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest tabular-nums">
        {summary?.generatedAt
          ? `As of ${formatTime(summary.generatedAt)} · auto-generated from this ticker's live GEX — refreshes every 30 min`
          : "Model estimate — auto-generated from this ticker's live GEX, refreshes every 30 min"}
      </span>
    </div>
  );
}
