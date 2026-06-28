import React, { useState, useMemo } from 'react';
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  ShieldCheck,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import { AssetInfo, SystemScore, V8TradeRecord } from '../types';
import { fmtNum } from '../lib/format';

interface QuantAuditViewProps {
  selectedAsset: AssetInfo;
  isCall: boolean;
  systemScore: SystemScore;
  optionPremium: number;
  trades: V8TradeRecord[];
  onClearTrades: () => void;
}

// ── Outcome model ────────────────────────────────────────────────────────────
// A trade is one of three states. 'Active' is OPEN/unresolved — it has no
// realized P&L and no win/loss verdict and must never render a fabricated gain.
type OutcomeState = 'active' | 'win' | 'loss';

const resolveOutcomeState = (t: V8TradeRecord): OutcomeState => {
  if (t.finalOutcome === 'Active') return 'active';
  if (t.finalOutcome === 'Failure') return 'loss';
  return 'win';
};

// Realized return % for a resolved trade. Use ?? so a legitimate 0 is honored.
// Open trades have no realized return.
const realizedReturnPct = (t: V8TradeRecord, state: OutcomeState): number | null => {
  if (state === 'active') return null;
  if (state === 'loss') return -(t.maxDrawdown ?? t.expectedDrawdown ?? 0);
  return t.maxGain ?? 0;
};

export function QuantAuditView({
  // selectedAsset, isCall, systemScore and optionPremium are part of the public
  // props contract for this tab; the registry renders from `trades` directly.
  selectedAsset,
  isCall,
  systemScore,
  optionPremium,
  trades,
  onClearTrades,
}: QuantAuditViewProps) {
  void selectedAsset; void isCall; void systemScore; void optionPremium;

  // Resolve design tokens once for inline-style / chart color values.
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string, f: string) => {
    const v = css.getPropertyValue(n).trim();
    return v || f;
  };
  const C = {
    success: tok('--success', '#4ADE80'),
    danger: tok('--danger', '#F87171'),
    warning: tok('--warning', '#FBBF24'),
    info: tok('--info', '#60A5FA'),
    textPrimary: tok('--text-primary', '#E5E5E5'),
  };

  const expandedId = useContractStore(s => s.expandedAuditId);
  const setExpandedId = useContractStore(s => s.setExpandedAuditId);
  const searchQuery = useContractStore(s => s.auditSearchQuery);
  const setSearchQuery = useContractStore(s => s.setAuditSearchQuery);
  const prismKeybind = useContractStore(s => s.keybinds).prismMenu;

  const [assetFilter, setAssetFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');

  // Only real, server-provided trades feed this view. No mock archive.
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      const baseTicker = t.underlying.replace(/[^a-zA-Z]/g, '').toUpperCase();
      if (assetFilter !== 'ALL' && baseTicker !== assetFilter) return false;

      const state = resolveOutcomeState(t);
      if (outcomeFilter === 'WINS' && state !== 'win') return false;
      if (outcomeFilter === 'LOSSES' && state !== 'loss') return false;

      if (searchQuery.trim() !== '') {
        const query = searchQuery.toUpperCase();
        const haystack = `${t.contract} ${t.finalOutcome} ${t.vwapState}`.toUpperCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [trades, assetFilter, outcomeFilter, searchQuery]);

  const bullishTrades = useMemo(
    () => filteredTrades.filter(t => t.direction === 'BULLISH'),
    [filteredTrades]
  );
  const bearishTrades = useMemo(
    () => filteredTrades.filter(t => t.direction === 'BEARISH'),
    [filteredTrades]
  );

  // Aggregate stats — computed only from real resolved trades. Open positions
  // are counted separately and excluded from win-rate / averages.
  const stats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let active = 0;
    let winnerSum = 0;
    let loserSum = 0;
    let holdSum = 0;
    let holdCount = 0;
    let netReturn = 0;

    filteredTrades.forEach(t => {
      const state = resolveOutcomeState(t);
      if (state === 'active') {
        active++;
        return;
      }
      const ret = realizedReturnPct(t, state) ?? 0;
      netReturn += ret;
      if (typeof t.timeTaken === 'number') {
        holdSum += t.timeTaken;
        holdCount++;
      }
      if (state === 'win') {
        wins++;
        winnerSum += ret;
      } else {
        losses++;
        loserSum += ret; // already negative
      }
    });

    const resolved = wins + losses;
    return {
      wins,
      losses,
      active,
      resolved,
      total: filteredTrades.length,
      winRate: resolved > 0 ? Math.round((wins / resolved) * 100) : 0,
      avgHold: holdCount > 0 ? Math.round(holdSum / holdCount) : 0,
      avgWinner: wins > 0 ? winnerSum / wins : 0,
      avgLoser: losses > 0 ? loserSum / losses : 0,
      netReturn,
    };
  }, [filteredTrades]);

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

  // Selecting a contract loads it into the analyzer and switches tabs.
  const handleContractClick = (contractStr: string) => {
    const parts = contractStr.trim().split(/\s+/);
    if (parts.length < 2) return;
    const ticker = parts[0];
    const contractRaw = parts[1];
    const strikeMatch = contractRaw.match(/(\d+)/);
    const typeMatch = contractRaw.match(/([CPcp])/);
    if (!strikeMatch || !typeMatch) return;
    const strike = parseInt(strikeMatch[0], 10);
    const optionIsCall = typeMatch[0].toUpperCase() === 'C';
    const asset = ASSET_LIST.find(a => a.ticker === ticker);
    if (!asset) return;
    const store = useContractStore.getState();
    store.selectContractAtomically(asset, strike, optionIsCall);
    store.setActiveTab('skyvision', true);
  };

  const getAssetBadgeClass = (ticker: string) => {
    const clean = ticker.replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (clean === 'NDX') return 'bg-[var(--surface-3)] text-[var(--warning)] border border-[var(--border)]';
    if (clean === 'SPX') return 'bg-[var(--surface-3)] text-[var(--danger)] border border-[var(--border)]';
    if (clean === 'SPY') return 'bg-[var(--surface-3)] text-[var(--info)] border border-[var(--border)]';
    if (clean === 'QQQ') return 'bg-[var(--surface-3)] text-[var(--info)] border border-[var(--border)]';
    return 'bg-[var(--surface-3)] text-[var(--text-tertiary)] border border-[var(--border)]';
  };

  // Outcome pill — explicit, honest states. Active = OPEN, no P&L.
  const getOutcomeBadge = (t: V8TradeRecord) => {
    const state = resolveOutcomeState(t);
    if (state === 'active') {
      return {
        text: 'OPEN',
        classes:
          'border border-[var(--warning)]/40 text-[var(--warning)] bg-[var(--warning)]/10 text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide tabular-nums',
      };
    }
    if (state === 'win') {
      const gain = realizedReturnPct(t, state) ?? 0;
      const isPartial =
        t.finalOutcome === 'Target 1 Winner' || t.finalOutcome === 'Target 2 Winner';
      return {
        text: `${isPartial ? 'PARTIAL' : 'WIN'} +${gain.toFixed(0)}%`,
        classes:
          'border border-[var(--success)]/40 text-[var(--success)] bg-[var(--success)]/10 text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide tabular-nums',
      };
    }
    const loss = Math.abs(realizedReturnPct(t, state) ?? 0);
    return {
      text: `LOSS -${loss.toFixed(0)}%`,
      classes:
        'border border-[var(--danger)]/40 text-[var(--danger)] bg-[var(--danger)]/10 text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide tabular-nums',
    };
  };

  const sectionLabel =
    'text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]';

  // ── Expanded detail drawer (shared by both columns) ─────────────────────────
  const renderDetail = (t: V8TradeRecord) => {
    const state = resolveOutcomeState(t);
    const isActive = state === 'active';
    const ret = realizedReturnPct(t, state);

    return (
      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            <Zap className="w-3 h-3" />
            {t.direction === 'BULLISH' ? 'CALL' : 'PUT'} TRADE DETAIL
          </span>
          <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">
            {typeof t.timeTaken === 'number' ? `${t.timeTaken} min hold` : 'open'}
          </span>
        </div>

        {/* P&L row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
            <span className={`${sectionLabel} block`}>ENTRY</span>
            <span className="text-[var(--text-primary)] font-bold text-[12px] block mt-1 tabular-nums">
              ${fmtNum(t.entryPrice, 2)}
            </span>
          </div>
          <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
            <span className={`${sectionLabel} block`}>{isActive ? 'STATUS' : 'REALIZED'}</span>
            {isActive ? (
              <span className="text-[var(--warning)] font-bold text-[12px] block mt-1">OPEN</span>
            ) : (
              <span
                className={`font-bold text-[12px] block mt-1 tabular-nums transition-colors duration-300 ${
                  (ret ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                }`}
              >
                {(ret ?? 0) >= 0 ? '+' : ''}
                {(ret ?? 0).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
            <span className={`${sectionLabel} block`}>RESULT</span>
            <span
              className={`font-black text-[12px] block mt-1 uppercase transition-colors duration-300 ${
                isActive
                  ? 'text-[var(--warning)]'
                  : state === 'win'
                  ? 'text-[var(--success)]'
                  : 'text-[var(--danger)]'
              }`}
            >
              {isActive ? 'PENDING' : state === 'win' ? 'WIN' : 'LOSS'}
            </span>
          </div>
        </div>

        {/* Thesis vectors */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
            <span className={`${sectionLabel} block`}>WIN PROB</span>
            <span className="text-[var(--text-primary)] font-bold text-[11px] block mt-1 tabular-nums">
              {t.probabilityPositive}%
            </span>
          </div>
          <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
            <span className={`${sectionLabel} block`}>CONFIDENCE</span>
            <span className="text-[var(--text-primary)] font-bold text-[11px] block mt-1 tabular-nums">
              {t.thesisStability}%
            </span>
          </div>
          <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
            <span className={`${sectionLabel} block`}>EXP RETURN</span>
            <span className="text-[var(--success)] font-bold text-[11px] block mt-1 tabular-nums">
              +{t.expectedReturn}%
            </span>
          </div>
          <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
            <span className={`${sectionLabel} block`}>EXP DRAWDOWN</span>
            <span className="text-[var(--danger)] font-bold text-[11px] block mt-1 tabular-nums">
              -{t.expectedDrawdown}%
            </span>
          </div>
        </div>

        {/* Greeks */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-lg">
          <span className={`${sectionLabel} block mb-2`}>GREEKS</span>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([
              ['DELTA', t.greeks.delta, 'text-[var(--text-primary)]'],
              ['GAMMA', t.greeks.gamma, 'text-[var(--text-primary)]'],
              ['THETA', t.greeks.theta, 'text-[var(--danger)]'],
              ['VEGA', t.greeks.vega, 'text-[var(--text-primary)]'],
            ] as const).map(([label, val, color]) => (
              <div key={label} className="bg-[var(--surface-2)] p-2 border border-[var(--border)] rounded-lg">
                <span className={`${sectionLabel} block`}>{label}</span>
                <span className={`${color} font-bold text-[11px] block mt-1 tabular-nums`}>{val.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Technical indicators */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-lg">
          <span className={`${sectionLabel} block mb-2`}>MARKET STRUCTURE</span>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-left">
            {([
              ['VWAP', t.vwapState],
              ['RSI', t.rsiState],
              ['STRUCTURE', t.structureState],
              ['RVOL', t.rvolState],
              ['GEX', t.gexState],
              ['DEALER', t.dealerPositioning],
            ] as const).map(([label, val]) => (
              <div key={label} className="bg-[var(--surface-2)] p-2 border border-[var(--border)] rounded-lg">
                <span className={`${sectionLabel} block`}>{label}</span>
                <span className="text-[var(--text-secondary)] font-semibold text-[10px] block truncate mt-1">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Targets */}
        <div className="space-y-2">
          <span className={`${sectionLabel} block`}>TARGETS &amp; STOP</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {([
              ['TARGET 1', t.target1, t.target1Hit, t.target1HitTime],
              ['TARGET 2', t.target2, t.target2Hit, t.target2HitTime],
              ['TARGET 3', t.target3, t.target3Hit, t.target3HitTime],
            ] as const).map(([label, price, hit, hitTime]) => (
              <div key={label} className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-wide text-[var(--text-tertiary)]">
                    {label}
                  </span>
                  {hit ? (
                    <span className="text-[10px] text-[var(--success)] bg-[var(--success)]/10 font-bold px-1.5 py-0.5 rounded border border-[var(--success)]/30">
                      HIT
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--text-tertiary)] font-bold">—</span>
                  )}
                </div>
                <span className="text-[var(--text-primary)] font-bold text-[11px] block mt-1.5 tabular-nums">
                  ${fmtNum(price, 2)}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold block mt-0.5">
                  {hit && typeof hitTime === 'number' ? `hit @ ${hitTime}m` : 'pending'}
                </span>
              </div>
            ))}
            <div className="bg-[var(--surface)] p-2.5 border border-[var(--border)] rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-wide text-[var(--text-tertiary)]">
                  STOP LOSS
                </span>
                {state === 'loss' ? (
                  <span className="text-[10px] text-[var(--danger)] bg-[var(--danger)]/10 font-bold px-1.5 py-0.5 rounded border border-[var(--danger)]/30">
                    BREACHED
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--text-tertiary)] font-bold">INTACT</span>
                )}
              </div>
              <span className="text-[var(--text-primary)] font-bold text-[11px] block mt-1.5 tabular-nums">
                ${fmtNum(t.stopLoss, 2)}
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold block mt-0.5">
                {state === 'loss' ? 'hit' : isActive ? 'live' : 'held'}
              </span>
            </div>
          </div>
        </div>

        {/* Failure reasons — only when present */}
        {state === 'loss' && t.failureReasons && t.failureReasons.length > 0 && (
          <div className="bg-[var(--surface)] p-3 border border-[var(--border)] rounded-lg space-y-1.5">
            <span className={`${sectionLabel} block`}>EXIT NOTES</span>
            <ul className="space-y-1">
              {t.failureReasons.map((reason, i) => (
                <li key={i} className="text-[11px] text-[var(--text-secondary)] font-medium leading-relaxed">
                  • {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleContractClick(t.contract);
          }}
          className="w-full text-center py-2.5 border border-[var(--border)] bg-[var(--surface-3)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[10px] font-black uppercase rounded-lg cursor-pointer tracking-[0.14em] transition-all focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
        >
          LOAD CONTRACT IN ANALYZER
        </button>
      </div>
    );
  };

  // ── Single trade card ───────────────────────────────────────────────────────
  const renderCard = (t: V8TradeRecord) => {
    const isExpanded = expandedId === t.id;
    const outcome = getOutcomeBadge(t);
    const ticker = t.underlying.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const state = resolveOutcomeState(t);
    const ret = realizedReturnPct(t, state);
    const isBull = t.direction === 'BULLISH';

    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${t.contract} ${ticker} trade — ${outcome.text}. ${isExpanded ? 'Collapse' : 'Expand'} details`}
        className={`bg-[var(--surface)] border transition-all rounded-xl overflow-hidden cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
          isExpanded ? 'border-[var(--border-strong)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
        }`}
        onClick={() => toggleExpand(t.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpand(t.id);
          }
        }}
      >
        <div className="p-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border ${
                isBull
                  ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30'
                  : 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30'
              }`}
            >
              {isBull ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-black text-[var(--text-primary)] uppercase tracking-tight">
                  {t.contract}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${getAssetBadgeClass(ticker)}`}>
                  {ticker}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--text-tertiary)] font-medium">
                <span>{t.timestamp}</span>
                <span>·</span>
                <span>{typeof t.timeTaken === 'number' ? `${t.timeTaken}m hold` : 'open'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block min-w-[48px]">
              {state === 'active' ? (
                <span className="text-[var(--warning)] text-[13px] font-black block leading-none">OPEN</span>
              ) : (
                <span
                  className={`text-[15px] font-black block leading-none tabular-nums transition-colors duration-300 ${
                    (ret ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                  }`}
                >
                  {(ret ?? 0) >= 0 ? '+' : ''}
                  {(ret ?? 0).toFixed(0)}%
                </span>
              )}
            </div>
            <span className={outcome.classes}>{outcome.text}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" aria-label="Collapse trade details" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" aria-label="Expand trade details" />
            )}
          </div>
        </div>
        {isExpanded && renderDetail(t)}
      </div>
    );
  };

  const renderColumn = (
    columnTrades: V8TradeRecord[],
    title: string,
    accent: string,
    Icon: React.ComponentType<{ className?: string }>
  ) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center border-b border-[var(--border)] pb-2.5">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: accent }}>
          <Icon className="w-3.5 h-3.5" />
          {title}
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">
          {columnTrades.length} {columnTrades.length === 1 ? 'TRADE' : 'TRADES'}
        </span>
      </div>
      <div className="space-y-2.5">
        {columnTrades.map(renderCard)}
        {columnTrades.length === 0 && (
          <div className="text-center py-12 border border-dashed border-[var(--border)] bg-[var(--surface)] rounded-xl">
            <span className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-widest">
              No trades recorded
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const filterPills: Array<{ key: 'ALL' | 'WINS' | 'LOSSES'; label: string }> = [
    { key: 'ALL', label: 'ALL' },
    { key: 'WINS', label: 'WINS' },
    { key: 'LOSSES', label: 'LOSSES' },
  ];

  // "as of" cue for the session footer — reflects when this view last rendered
  // its session tally (recomputed whenever the trade set changes). Not a live clock.
  const sessionAsOf = useMemo(
    () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    [trades]
  );

  const macKey = typeof window !== 'undefined' && navigator.userAgent.includes('Mac');
  const prismLabel = prismKeybind
    ? prismKeybind.replace('cmd', macKey ? '⌘' : 'Ctrl').toUpperCase()
    : '';

  return (
    <div className="w-full flex flex-col font-mono select-none antialiased space-y-5 max-w-7xl mx-auto pt-2 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <span className="text-[10px] text-[var(--text-tertiary)] font-bold tracking-[0.22em] uppercase block mb-1.5">
            TRADE HISTORY
          </span>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
            Trade Record
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] text-[10px] font-bold rounded-lg uppercase tracking-wide">
            <span className="w-1.5 h-1.5 bg-[var(--success)] rounded-full" />
            Synced
          </div>
          <button
            onClick={onClearTrades}
            className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--danger)] hover:border-[var(--danger)]/50 hover:bg-[var(--danger)]/5 text-[10px] font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Session
          </button>
        </div>
      </div>

      {/* Performance summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl">
          <div className="flex justify-between items-center">
            <span className={sectionLabel}>WIN RATE</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          </div>
          <h3 className="text-2xl font-black text-[var(--text-primary)] mt-2 tabular-nums">{stats.winRate}%</h3>
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold tracking-wide mt-1">
            {stats.resolved} closed
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl">
          <div className="flex justify-between items-center">
            <span className={sectionLabel}>AVG HOLD</span>
            <Clock className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          </div>
          <h3 className="text-2xl font-black text-[var(--text-primary)] mt-2 tabular-nums">
            {stats.avgHold}
            <span className="text-sm font-bold text-[var(--text-tertiary)]"> min</span>
          </h3>
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold tracking-wide mt-1">
            per trade
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl">
          <div className="flex justify-between items-center">
            <span className={sectionLabel}>AVG WINNER</span>
            <TrendingUp className="w-3.5 h-3.5 text-[var(--success)]" />
          </div>
          <h3 className="text-2xl font-black text-[var(--success)] mt-2 tabular-nums">
            {stats.wins > 0 ? `+${stats.avgWinner.toFixed(1)}%` : '—'}
          </h3>
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold tracking-wide mt-1">
            gain on wins
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl">
          <div className="flex justify-between items-center">
            <span className={sectionLabel}>AVG LOSER</span>
            <TrendingDown className="w-3.5 h-3.5 text-[var(--danger)]" />
          </div>
          <h3 className="text-2xl font-black text-[var(--danger)] mt-2 tabular-nums">
            {stats.losses > 0 ? `${stats.avgLoser.toFixed(1)}%` : '—'}
          </h3>
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold tracking-wide mt-1">
            loss on losses
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl col-span-2 md:col-span-1">
          <div className="flex justify-between items-center">
            <span className={sectionLabel}>OPEN NOW</span>
            <Activity className="w-3.5 h-3.5 text-[var(--warning)]" />
          </div>
          <h3 className="text-2xl font-black text-[var(--text-primary)] mt-2 tabular-nums">{stats.active}</h3>
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold tracking-wide mt-1">
            live positions
          </p>
        </div>
      </div>

      {/* Controls: search + filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <button
          onClick={() => useContractStore.getState().setIsGlobalSearchOpen(true)}
          aria-label="Open trade history search"
          className="global-prism-trigger flex-1 bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg flex items-center justify-between gap-2 text-left cursor-pointer hover:border-[var(--border-strong)] transition-all focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <span className="text-[11px] font-bold tracking-wide text-[var(--text-secondary)] uppercase">
              {searchQuery ? `FILTER: ${searchQuery}` : 'Search trade history'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {searchQuery && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                }}
                className="text-[10px] bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30 px-2 py-1 rounded font-bold hover:bg-[var(--danger)]/20 transition-all cursor-pointer uppercase"
              >
                Clear
              </span>
            )}
            {prismLabel && (
              <span className="text-[10px] bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-tertiary)] px-2 py-0.5 rounded font-bold">
                {prismLabel}
              </span>
            )}
          </div>
        </button>

        <div className="flex flex-wrap gap-2">
          <div className="flex flex-1 sm:flex-none overflow-x-auto scrollbar-none bg-[var(--surface)] p-1 border border-[var(--border)] rounded-lg">
            {['ALL', 'SPX', 'NDX', 'QQQ', 'SPY'].map(ticker => (
              <button
                key={ticker}
                onClick={() => setAssetFilter(ticker)}
                className={`shrink-0 px-3 py-1.5 text-[10px] font-bold uppercase rounded transition-all cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                  assetFilter === ticker
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {ticker}
              </button>
            ))}
          </div>
          <div className="flex flex-1 sm:flex-none overflow-x-auto scrollbar-none bg-[var(--surface)] p-1 border border-[var(--border)] rounded-lg">
            {filterPills.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setOutcomeFilter(key)}
                className={`shrink-0 flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold uppercase rounded transition-all cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                  outcomeFilter === key
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Split list */}
      {filteredTrades.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[var(--border)] bg-[var(--surface)] rounded-xl">
          <Activity className="w-6 h-6 text-[var(--text-tertiary)] mx-auto mb-3" />
          <span className="text-[12px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block">
            No trades recorded yet
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wide block mt-1.5">
            Logged trades will appear here as they resolve
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderColumn(bullishTrades, 'Bullish · Calls', C.success, TrendingUp)}
          {renderColumn(bearishTrades, 'Bearish · Puts', C.danger, TrendingDown)}
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4 border-t border-[var(--border)]">
        <span className="text-[var(--text-tertiary)] text-[10px] uppercase tracking-[0.28em] font-bold">
          {stats.total} {stats.total === 1 ? 'Trade' : 'Trades'} · Logged This Session · as of {sessionAsOf}
        </span>
      </div>
    </div>
  );
}
