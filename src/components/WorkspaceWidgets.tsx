/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workspace pane chrome + the widgets the grid renders. Every widget reads its
 * data from the live store (serverState / activeContract / selection) and shows
 * a clean empty state until the SSE feed populates it — no mock/fake data.
 */

import React from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useContractStore } from '../lib/store';
import type { WidgetType } from '../lib/workspace';
import { formatTime } from '../lib/timeUtils';

/* ------------------------------------------------------------------ */
/* Pane chrome                                                         */
/* ------------------------------------------------------------------ */

interface PaneProps {
  title: string;
  isMaximized?: boolean;
  onClose?: () => void;
  onMaximize?: () => void;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}

export function Pane({ title, isMaximized, onClose, onMaximize, onHeaderPointerDown, children }: PaneProps) {
  return (
    <div className="flex flex-col h-full w-full bg-[var(--surface)] border border-[var(--border)] rounded-[3px] overflow-hidden">
      <div
        onPointerDown={onHeaderPointerDown}
        className="h-7 shrink-0 flex items-center justify-between px-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] cursor-move select-none"
        style={{ touchAction: 'none' }}
      >
        <span className="text-[10px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase truncate">
          {title}
        </span>
        <div className="flex items-center gap-0.5">
          <button onClick={onMaximize} aria-label={isMaximized ? `Restore ${title} panel` : `Maximize ${title} panel`} className="w-5 h-5 flex items-center justify-center rounded-[2px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors">
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          {onClose && (
            <button onClick={onClose} aria-label={`Close ${title} panel`} className="w-5 h-5 flex items-center justify-center rounded-[2px] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--surface-3)] transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared presentational primitives (consistent across every widget)  */
/* ------------------------------------------------------------------ */

const Empty = ({ label = 'Awaiting live feed' }: { label?: string }) => (
  <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-center px-3">
    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
      {label}
    </span>
    <span className="text-[10px] text-[var(--text-tertiary)]">No data on this tick</span>
  </div>
);

const SubHead = ({ children, accent }: { children: React.ReactNode; accent?: string }) => (
  <div
    className="text-[10px] font-semibold uppercase tracking-[0.16em] mb-2 shrink-0"
    style={{ color: accent ?? 'var(--text-tertiary)' }}
  >
    {children}
  </div>
);

const STATUS_COLOR: Record<string, string> = {
  up: 'var(--success)',
  down: 'var(--danger)',
  flat: 'var(--text-tertiary)',
  warn: 'var(--warning)',
};

function biasTone(v?: string): 'up' | 'down' | 'flat' {
  const s = (v || '').toUpperCase();
  if (s.includes('BULL') || s.includes('LONG') || s === 'HOLDING' || s.includes('CALL') || s.includes('SUPPORT')) return 'up';
  if (s.includes('BEAR') || s.includes('SHORT') || s === 'FAILING' || s.includes('PUT') || s.includes('RESIST')) return 'down';
  return 'flat';
}

// Compact dollar formatter for exposure values (already in $ units).
function fmtDollars(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}K`;
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const fmtNum = (n?: number) => (typeof n === 'number' && isFinite(n) ? n.toLocaleString() : '—');

/** A single big-number tile (entry/stop/target/confidence/etc.). */
const MetricTile = ({ label, value, sub, tone = 'flat' }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' | 'flat' | 'warn' }) => (
  <div className="flex flex-col h-full w-full items-center justify-center text-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] p-3">
    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</div>
    <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: STATUS_COLOR[tone] === 'var(--text-tertiary)' ? 'var(--text-primary)' : STATUS_COLOR[tone] }}>
      {value}
    </div>
    {sub && <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">{sub}</div>}
  </div>
);

/** A score gauge driven by a real 0–100 system score. */
const ScoreGauge = ({ score, stateLabel, tone }: { score: number; stateLabel: string; tone: 'up' | 'down' | 'flat' }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const color = STATUS_COLOR[tone];
  return (
    <div className="flex flex-col h-full gap-1 text-[var(--text-secondary)] font-mono">
      <div className="flex items-center justify-between bg-[#0a0a0a] border border-zinc-800/50 rounded-sm px-3 py-1.5 shadow-sm">
        <span className="text-[8.5px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">State</span>
        <span className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color }}>{stateLabel}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0a0a0a] border border-zinc-800/50 rounded-sm relative shadow-sm min-h-[100px]">
        <div className="text-[32px] font-black tracking-tighter text-white leading-none">{Math.round(clamped)}</div>
        <div className="text-[8.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.25em] mt-2">System Score</div>
        
        {/* Progress Bar exactly matching screenshot */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-zinc-900/50 rounded-b-sm overflow-hidden">
          <div className="h-full transition-all duration-500 ease-out" style={{ width: `${clamped}%`, background: color }} />
        </div>
      </div>
    </div>
  );
};

/** Reusable dense data table with consistent header / row styling. */
const TerminalTable = ({
  headers,
  rows,
  empty = 'No data',
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) => {
  if (!rows.length) return <Empty label={empty} />;
  return (
    <div className="flex-1 overflow-auto w-full">
      <table className="w-full text-left text-[10px] tabular-nums">
        <thead className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] sticky top-0 bg-[var(--surface)] z-10">
          <tr className="border-b border-[var(--border)]">
            {headers.map((h, i) => (
              <th key={i} className="py-1.5 px-1.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 px-1.5 text-[var(--text-secondary)]">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const toned = (text: string, tone: 'up' | 'down' | 'flat' | 'warn') => (
  <span className="font-semibold" style={{ color: STATUS_COLOR[tone] === 'var(--text-tertiary)' ? 'var(--text-primary)' : STATUS_COLOR[tone] }}>{text}</span>
);

/* ------------------------------------------------------------------ */
/* Score / regime widgets — driven by serverState.system_score        */
/* ------------------------------------------------------------------ */

const RegimeScan = React.memo(({ ticker }: { ticker: string }) => {
  const serverState = useContractStore((s) => s.serverState);
  const score = serverState?.system_score?.total;
  if (typeof score !== 'number') return <Empty label={`${ticker} regime`} />;
  const stateLabel = score >= 70 ? 'EXPANSION' : score <= 40 ? 'CONTRACTION' : 'BALANCED';
  const tone: 'up' | 'down' | 'flat' = score >= 70 ? 'up' : score <= 40 ? 'down' : 'flat';
  return (
    <div className="h-full">
      <SubHead>{ticker} State</SubHead>
      <div className="h-[calc(100%-1.75rem)]">
        <ScoreGauge score={score} stateLabel={stateLabel} tone={tone} />
      </div>
    </div>
  );
});

const MarketRegimeWidget = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const score = serverState?.system_score?.total;
  if (typeof score !== 'number') return <Empty label="Market regime" />;
  const stateLabel = score >= 70 ? 'EXPANSION' : score <= 40 ? 'CONTRACTION' : 'BALANCED';
  const tone: 'up' | 'down' | 'flat' = score >= 70 ? 'up' : score <= 40 ? 'down' : 'flat';
  return <ScoreGauge score={score} stateLabel={stateLabel} tone={tone} />;
});

/* ------------------------------------------------------------------ */
/* Flow widgets — driven by serverState.deep_intelligence             */
/* ------------------------------------------------------------------ */

const WhaleSweeps = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const whale = serverState?.deep_intelligence?.whale_detection;
  const rows: { label: string; contract?: string; size?: string; tone: 'up' | 'down' | 'flat' }[] = [];
  if (whale?.bullish?.contract) rows.push({ label: 'Bullish', contract: whale.bullish.contract, size: whale.bullish.size, tone: 'up' });
  if (whale?.bearish?.contract) rows.push({ label: 'Bearish', contract: whale.bearish.contract, size: whale.bearish.size, tone: 'down' });
  if (whale?.largestCall) rows.push({ label: 'Largest Call', contract: whale.largestCall, tone: 'up' });
  if (whale?.largestPut) rows.push({ label: 'Largest Put', contract: whale.largestPut, tone: 'down' });

  if (!rows.length) return <Empty label="Large order flow" />;
  return (
    <div>
      <SubHead>Large Order Flow</SubHead>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1 text-[10px]">
            <span className="uppercase tracking-[0.12em]" style={{ color: STATUS_COLOR[r.tone] }}>{r.label}</span>
            <span className="text-[var(--text-secondary)] tabular-nums truncate">{r.contract}</span>
            {r.size && <span className="text-[var(--text-primary)] font-semibold tabular-nums">{r.size}</span>}
          </div>
        ))}
      </div>
    </div>
  );
});

const LiveOptionsFlow = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const updatedAt = serverState?.sky_vision?.updatedAt;
  const feed = serverState?.deep_intelligence?.flow_feed ?? [];
  // Stamp the feed with the server tick time (real), formatted via user prefs.
  const stamp = updatedAt ? formatTime(new Date(updatedAt)) : formatTime();
  // Honest source label: only read LIVE when a real provider is connected. The sandbox
  // tape is synthetic and must read MODEL — never presented under a "Live" header.
  const isLiveData = !!serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC';

  return (
    <div className="flex flex-col h-full w-full">
      <SubHead>
        <span className="flex items-center gap-1.5">
          Options Flow
          <span
            className="px-1 py-0.5 rounded-[2px] text-[8px] font-bold tracking-wider"
            style={{
              color: isLiveData ? 'var(--success)' : 'var(--warning)',
              background: `color-mix(in srgb, ${isLiveData ? 'var(--success)' : 'var(--warning)'} 14%, transparent)`,
            }}
          >
            {isLiveData ? 'LIVE' : 'MODEL'}
          </span>
        </span>
      </SubHead>
      {feed.length === 0 ? (
        <Empty label={isLiveData ? 'Live options flow' : 'Model options flow'} />
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-[10px] tabular-nums">
            <thead className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] sticky top-0 bg-[var(--surface)] z-10">
              <tr className="border-b border-[var(--border)]">
                <th className="py-1.5 px-1.5 font-semibold min-w-[64px]">Time</th>
                <th className="py-1.5 px-1.5 font-semibold">Contract</th>
                <th className="py-1.5 px-1.5 font-semibold">Type</th>
                <th className="py-1.5 px-1.5 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((row: any) => {
                const tone = biasTone(`${row.type} ${row.desc}`);
                return (
                  <tr key={row.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors">
                    <td className="py-1.5 px-1.5" style={{ borderLeft: `2px solid ${STATUS_COLOR[tone]}`, paddingLeft: '6px' }}>
                      <span className="text-[var(--text-tertiary)]">{stamp}</span>
                    </td>
                    <td className="py-1.5 px-1.5 text-[var(--text-primary)] font-semibold truncate">{row.contract}</td>
                    <td className="py-1.5 px-1.5">{toned(String(row.type || '—'), tone)}</td>
                    <td className="py-1.5 px-1.5 text-[var(--text-secondary)] truncate">{row.desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* SkysVision scanner — driven by serverState.sky_vision.contracts    */
/* ------------------------------------------------------------------ */

const SkysVisionScannerWidget = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const sv = serverState?.sky_vision;
  const contracts = (sv?.contracts ?? []).slice(0, 12);
  const rows = contracts.map((c: any) => {
    const tone: 'up' | 'down' | 'flat' = c.isCall ? 'up' : 'down';
    const healthTone = c.strength >= 70 ? 'up' : c.strength <= 45 ? 'down' : 'flat';
    return [
      <span className="text-[var(--text-primary)] font-semibold">{sv?.ticker ?? '—'}</span>,
      toned(c.isCall ? 'CALL' : 'PUT', tone),
      <span className="text-[var(--text-secondary)] tabular-nums">{c.strike}</span>,
      <span className="text-[var(--text-secondary)] tabular-nums">{typeof c.confidence === 'number' ? `${Math.round(c.confidence)}%` : '—'}</span>,
      toned(typeof c.strength === 'number' ? String(Math.round(c.strength)) : '—', healthTone),
    ];
  });
  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-2.5 py-1.5 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: sv ? 'var(--success)' : 'var(--text-tertiary)' }}>
          Scanner {sv ? 'Active' : 'Idle'}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          {sv?.direction ?? 'High Probability Setups'}
        </span>
      </div>
      <TerminalTable headers={['Ticker', 'Dir', 'Strike', 'Conf', 'Score']} rows={rows} empty="No active setups" />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Dealer / GEX — driven by serverState.gex_profile.strikes           */
/* ------------------------------------------------------------------ */

const PinPointDealerWidget = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const gex = serverState?.gex_profile;
  const strikes = (gex?.strikes ?? [])
    .slice()
    .sort((a: any, b: any) => Math.abs(b.netGex ?? 0) - Math.abs(a.netGex ?? 0))
    .slice(0, 8)
    .sort((a: any, b: any) => b.strike - a.strike);
  const rows = strikes.map((s: any) => {
    const tone: 'up' | 'down' | 'flat' = s.netGex > 0 ? 'up' : s.netGex < 0 ? 'down' : 'flat';
    const posture = s.netGex > 0 ? 'Long' : s.netGex < 0 ? 'Short' : 'Neutral';
    return [
      <span className="text-[var(--text-primary)] tabular-nums">{s.strike}</span>,
      toned(`${fmtDollars(s.netGex)} (${posture})`, tone),
      <span className="text-[var(--text-secondary)] tabular-nums">{fmtNum((s.callOi ?? 0) + (s.putOi ?? 0))}</span>,
    ];
  });
  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-2.5 py-1.5 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">Dealer Gamma Profile</span>
        {typeof gex?.netGex === 'number' && (
          <span className="text-[10px] font-semibold tabular-nums" style={{ color: STATUS_COLOR[biasTone(gex.netGex >= 0 ? 'long' : 'short')] }}>
            Net {fmtDollars(gex.netGex)}
          </span>
        )}
      </div>
      <TerminalTable headers={['Strike', 'Net Dealer Gamma', 'Total OI']} rows={rows} empty="No dealer exposure" />
    </div>
  );
});

const LoadedStrikesWidget = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const gex = serverState?.gex_profile;
  const strikes = (gex?.strikes ?? [])
    .slice()
    .sort((a: any, b: any) => ((b.callVolume ?? 0) + (b.putVolume ?? 0)) - ((a.callVolume ?? 0) + (a.putVolume ?? 0)))
    .slice(0, 8)
    .sort((a: any, b: any) => b.strike - a.strike);
  const rows = strikes.map((s: any) => {
    const callVol = s.callVolume ?? 0;
    const putVol = s.putVolume ?? 0;
    const bias = callVol > putVol * 1.15 ? 'BULLISH' : putVol > callVol * 1.15 ? 'BEARISH' : 'NEUTRAL';
    return [
      <span className="text-[var(--text-primary)] tabular-nums">{s.strike}</span>,
      <span className="text-[var(--text-secondary)] tabular-nums">{fmtNum(callVol)}</span>,
      <span className="text-[var(--text-secondary)] tabular-nums">{fmtNum(putVol)}</span>,
      toned(bias, biasTone(bias)),
    ];
  });
  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-2.5 py-1.5 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">Key Resistance / Support</span>
      </div>
      <TerminalTable headers={['Strike', 'Call Vol', 'Put Vol', 'Bias']} rows={rows} empty="No loaded strikes" />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* SkysVision single-value widgets — driven by sky_vision / trade_plan */
/* ------------------------------------------------------------------ */

const SetupDetailsWidget = React.memo(() => {
  const sv = useContractStore((s) => s.serverState?.sky_vision);
  if (!sv?.master) return <MetricTile label="Setup Details" value="—" sub="Awaiting selection" />;
  return <MetricTile label="Setup Details" value={sv.master.bestContract || '—'} sub={sv.master.swingType || 'Active setup'} tone={biasTone(sv.direction)} />;
});

const TradeThesisWidget = React.memo(() => {
  const sv = useContractStore((s) => s.serverState?.sky_vision);
  if (!sv) return <MetricTile label="Trade Thesis" value="—" sub="Awaiting feed" />;
  const tone = biasTone(sv.direction);
  return <MetricTile label="Trade Thesis" value={sv.direction || '—'} sub={sv.master?.tradeHealth ? `${sv.master.tradeHealth} conviction` : 'Directional bias'} tone={tone} />;
});

const EntryLevelWidget = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const spot = serverState?.sky_vision?.spot ?? serverState?.gex_profile?.spot;
  if (typeof spot !== 'number') return <MetricTile label="Entry Levels" value="—" sub="Optimal entry" />;
  return <MetricTile label="Entry Levels" value={spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sub="Reference spot" />;
});

const StopLevelWidget = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const wall = serverState?.sky_vision?.walls?.put ?? serverState?.gex_profile?.putWall;
  if (typeof wall !== 'number' || wall <= 0) return <MetricTile label="Stop Levels" value="—" sub="Hard stop" />;
  return <MetricTile label="Stop Levels" value={wall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sub="Put wall support" tone="down" />;
});

const TargetLevelWidget = React.memo(() => {
  const serverState = useContractStore((s) => s.serverState);
  const t = serverState?.sky_vision?.targetStack?.[0];
  const wall = serverState?.sky_vision?.walls?.call ?? serverState?.gex_profile?.callWall;
  const value = typeof t?.underlying === 'number' ? t.underlying.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : typeof wall === 'number' && wall > 0 ? wall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  if (!value) return <MetricTile label="Target Levels" value="—" sub="Primary target" />;
  return <MetricTile label="Target Levels" value={value} sub={t?.label ? `${t.label}` : 'Call wall'} tone="up" />;
});

const ConfidenceWidget = React.memo(() => {
  const sv = useContractStore((s) => s.serverState?.sky_vision);
  const conf = sv?.master?.confidence;
  if (typeof conf !== 'number') return <MetricTile label="Confidence" value="—" sub="Setup confidence" />;
  const tone: 'up' | 'down' | 'flat' = conf >= 75 ? 'up' : conf <= 45 ? 'down' : 'flat';
  return <MetricTile label="Confidence" value={`${Math.round(conf)}%`} sub={conf >= 75 ? 'High probability' : 'Component agreement'} tone={tone} />;
});

/* ------------------------------------------------------------------ */
/* Admin + settings                                                   */
/* ------------------------------------------------------------------ */

const SettingsWidget = React.memo(() => {
  const setActiveTab = useContractStore((s) => s.setActiveTab);
  return (
    <button
      onClick={() => setActiveTab('settings')}
      className="w-full h-full min-h-[2.5rem] flex items-center justify-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-3 py-2 hover:bg-[var(--surface-3)] transition-colors"
    >
      Open System Settings
    </button>
  );
});

// Admin feeds (server health / CRM / financials) are admin-gated in the workspace
// menu/templates and have no client-side data source in the store, so they render
// an honest empty state rather than fabricated figures or a dev placeholder.
const AdminWidget = React.memo(({ kind }: { kind: 'health' | 'crm' | 'fin' }) => {
  const label = kind === 'health' ? 'Server health' : kind === 'crm' ? 'Live user CRM' : 'Financials log';
  return <Empty label={label} />;
});

/* ------------------------------------------------------------------ */
/* Exports (signatures preserved)                                      */
/* ------------------------------------------------------------------ */

export const SlayerScoreWidget = React.memo(() => <MarketRegimeWidget />);
export const VolatilityStateWidget = React.memo(() => <MarketRegimeWidget />);

export function renderWidget(type: WidgetType): React.ReactNode {
  switch (type) {
    case 'settings': return <SettingsWidget />;
    case 'server_health': return <AdminWidget kind="health" />;
    case 'user_crm': return <AdminWidget kind="crm" />;
    case 'financials': return <AdminWidget kind="fin" />;

    case 'skysvision_scanner': return <SkysVisionScannerWidget />;
    case 'skysvision_setups': return <SkysVisionScannerWidget />;
    case 'skysvision_setup_details': return <SetupDetailsWidget />;
    case 'skysvision_trade_thesis': return <TradeThesisWidget />;
    case 'skysvision_entry_levels': return <EntryLevelWidget />;
    case 'skysvision_stop_levels': return <StopLevelWidget />;
    case 'skysvision_target_levels': return <TargetLevelWidget />;
    case 'skysvision_confidence': return <ConfidenceWidget />;
    case 'skysvision_history': return <SkysVisionScannerWidget />;

    case 'dealer_positioning': return <PinPointDealerWidget />;
    case 'gex': return <PinPointDealerWidget />;
    case 'vex': return <PinPointDealerWidget />;
    case 'charm': return <PinPointDealerWidget />;
    case 'loaded_strikes': return <LoadedStrikesWidget />;
    case 'dealer_flow_analysis': return <WhaleSweeps />;
    case 'market_regime': return <MarketRegimeWidget />;
    case 'key_levels': return <LoadedStrikesWidget />;
    case 'institutional_positioning': return <PinPointDealerWidget />;

    default: return <RegimeScan ticker="SPX" />;
  }
}
