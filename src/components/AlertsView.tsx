import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Terminal, 
  AlertTriangle, 
  CheckSquare, 
  PlusCircle, 
  Trash2, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight,
  Sliders,
  DollarSign
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import { formatTime } from '../lib/timeUtils';

interface AlertItem {
  id: string;
  timestamp: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  message: string;
  source: string;
}

// Stable empty-array reference shared across renders (see usage below).
const EMPTY_LIST: any[] = [];

export function AlertsView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const serverState = useContractStore((s) => s.serverState);

  // Parse the live options discovery structures. Fall back to a STABLE empty array
  // (not a fresh `|| []` each render) so the memos below don't recompute every tick.
  const mispricedCalls = serverState?.discovery?.mispricedCalls || EMPTY_LIST;
  const mispricedPuts = serverState?.discovery?.mispricedPuts || EMPTY_LIST;

  // Create unified trade signal candidates
  const candidates = useMemo(() => {
    const list: any[] = [];
    
    mispricedCalls.forEach((c: any) => {
      list.push({
        id: `call-${c.strike}-${c.asset.ticker}`,
        asset: c.asset,
        ticker: c.asset.ticker,
        strike: c.strike,
        isCall: true,
        health: c.health || 90,
        marketPrice: c.marketPrice || 4.20,
        modelValue: c.modelValue || 6.80,
        type: 'CALL',
        entryZone: `$${((c.marketPrice || 4.20) * 0.92).toFixed(2)} - $${((c.marketPrice || 4.20) * 0.98).toFixed(2)}`
      });
    });

    mispricedPuts.forEach((p: any) => {
      list.push({
        id: `put-${p.strike}-${p.asset.ticker}`,
        asset: p.asset,
        ticker: p.asset.ticker,
        strike: p.strike,
        isCall: false,
        health: p.health || 88,
        marketPrice: p.marketPrice || 3.10,
        modelValue: p.modelValue || 4.90,
        type: 'PUT',
        entryZone: `$${((p.marketPrice || 3.10) * 0.92).toFixed(2)} - $${((p.marketPrice || 3.10) * 0.98).toFixed(2)}`
      });
    });

    // Sort by highest confidence/health score
    return list.sort((a, b) => b.health - a.health);
  }, [mispricedCalls, mispricedPuts]);

  // High score thresholds (health >= 90 represents a flawless 100% best trade contender)
  const bestTradesList = useMemo(() => {
    return candidates.filter(c => c.health >= 90);
  }, [candidates]);

  // User state for focused single trade choice
  const [lockedTradeId, setLockedTradeId] = useState<string | null>(null);

  // Determine active alert outcome:
  // - If multiple are found above 90 and none has been locked: MULTIPLE TRADES FOUND state.
  // - If exactly 1 is found: 100% BEST TRADE LOCKED state.
  // - If none are found: fall back to the absolute top candidate from the lists.
  const hasMultiple = bestTradesList.length > 1;
  const activeTrade = useMemo(() => {
    if (lockedTradeId) {
      return candidates.find(c => c.id === lockedTradeId) || candidates[0];
    }
    if (bestTradesList.length === 1) {
      return bestTradesList[0];
    }
    return candidates[0] || null;
  }, [candidates, bestTradesList, lockedTradeId]);

  // Real alert feed: derived from the server's live flow feed when present.
  // (Premium-gated: deep_intelligence / flow_feed can be undefined.)
  const flowFeed = serverState?.deep_intelligence?.flow_feed;
  const hasLiveFeed = Array.isArray(flowFeed) && flowFeed.length > 0;

  const feedAlerts = useMemo<AlertItem[]>(() => {
    if (!hasLiveFeed) return [];
    return flowFeed!.slice(0, 12).map((f, i) => {
      const t = (f.type || '').toUpperCase();
      const priority: AlertItem['priority'] =
        t.includes('SWEEP') || t.includes('BLOCK') ? 'HIGH' :
        t.includes('UNUSUAL') || t.includes('WHALE') ? 'CRITICAL' :
        i < 3 ? 'MEDIUM' : 'LOW';
      return {
        id: f.id || `flow-${i}`,
        timestamp: formatTime(new Date()),
        priority,
        type: f.type || 'FLOW EVENT',
        message: `${f.contract ? f.contract + ' — ' : ''}${f.desc || ''}`.trim(),
        source: 'LIVE FLOW FEED',
      };
    });
  }, [flowFeed, hasLiveFeed]);

  // User-injected demo alerts (clearly labeled DEMO; not measurements).
  const [demoAlerts, setDemoAlerts] = useState<AlertItem[]>([]);

  // Display list: real feed first, then any demo alerts the user added.
  const telemetryAlerts = useMemo<AlertItem[]>(
    () => [...demoAlerts, ...feedAlerts],
    [demoAlerts, feedAlerts]
  );

  const addSimulatedAlert = (priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') => {
    const time = formatTime(new Date());
    const templates: Record<typeof priority, { type: string; message: string }> = {
      CRITICAL: { type: 'TAIL EXCURSION (DEMO)', message: `Sample tail-risk scenario on ${selectedAsset.ticker}. Illustrative only — not a live measurement.` },
      HIGH: { type: 'MOMENTUM ALIGNMENT (DEMO)', message: `Sample higher-timeframe trend agreement on ${selectedAsset.ticker}. Illustrative only.` },
      MEDIUM: { type: 'VOLUME SPIKE (DEMO)', message: `Sample volume-profile expansion event. Illustrative only.` },
      LOW: { type: 'FEED SYNC (DEMO)', message: `Sample feed-sync notice. Illustrative only.` },
    } as const;

    const newAlert: AlertItem = {
      id: `demo-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: time,
      priority,
      type: templates[priority].type,
      message: templates[priority].message,
      source: 'DEMO',
    };

    setDemoAlerts((prev) => [newAlert, ...prev]);
  };

  const clearAlerts = () => {
    setDemoAlerts([]);
  };

  // Switch contract on central workspace
  const handleActivateOnWorkspace = (trade: any) => {
    const targetAsset = ASSET_LIST.find(a => a.ticker === trade.ticker) || trade.asset;
    useContractStore.getState().selectContractAtomically(targetAsset, trade.strike, trade.isCall);
    useContractStore.getState().setActiveTab('skyvision', true);
  };

  return (
    <div className="w-full text-[var(--success)] flex flex-col font-mono select-none antialiased space-y-6">

      {/* 1. HEADER (COMMAND DECK) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Terminal className="w-4 h-4 text-[var(--success)]" />
          <span className="text-[10px] text-[var(--success)] uppercase tracking-widest font-black">
            SLAYER PRIORITIZED ALERTS COCKPIT // SIGNAL STREAM
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--surface)] p-1 px-1.5 border border-[var(--border)] rounded-lg">
          <span className={`h-1.5 w-1.5 rounded-full ${hasLiveFeed ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'}`} />
          <span className={`text-[10px] uppercase tracking-widest px-1 font-black ${hasLiveFeed ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
            {hasLiveFeed ? 'LIVE FEED CONNECTED' : 'NO LIVE FEED — DEMO ONLY'}
          </span>
        </div>
      </div>

      {/* 2. DYNAMIC PRIMARY BEST TRADE ALERTS SECTION */}
      <div className="w-full animate-fadeIn relative">
        
        {hasMultiple && !lockedTradeId ? (
          /* MULTIPLE TRADES FOUND STATE */
          <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl border border-[var(--warning)]/20 space-y-6">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[var(--warning)] via-yellow-500 to-[var(--warning)] shadow-lg" />

            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-[var(--border)] pb-4">
              <div className="space-y-1.5 text-left">
                <div className="inline-flex items-center gap-1.5 bg-[var(--surface-2)] text-[var(--warning)] px-3 py-1 border border-[var(--warning)]/20 rounded-md text-[10px] font-black uppercase tracking-widest">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Multiple Trades Found</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-[var(--text-primary)] font-sans uppercase tracking-tight">
                  OPTION DISCOVERY CLUSTER DETECTED
                </h2>
              </div>
              <div className="bg-[var(--surface-2)] text-[var(--warning)] font-extrabold border border-[var(--warning)]/20 px-3 py-1 rounded-lg text-sm font-mono uppercase tracking-widest shrink-0 tabular-nums">
                Found Counts: {bestTradesList.length}
              </div>
            </div>

            <p className="text-[11px] font-sans text-[var(--text-secondary)] leading-relaxed text-left max-w-3xl">
              The discovery engine surfaced {bestTradesList.length} candidates with high health scores. Activate any candidate in one click to open it in the workspace.
            </p>

            {/* List of high confidence options during "Multiple Found" mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bestTradesList.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--warning)]/40 p-5 rounded-xl text-left transition-all hover:bg-[var(--surface-2)] space-y-3 shadow-md"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-black block tracking-widest uppercase">OPTION TARGET</span>
                      <span className="text-lg font-black text-[var(--text-primary)]">{trade.ticker} {trade.strike} {trade.type}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[var(--text-tertiary)] block">HEALTH INDEX</span>
                      <span className="text-[var(--success)] font-black text-sm tabular-nums">{trade.health}/100</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10.5px] py-1 border-t border-[var(--border)]">
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] block">MARKET VALUE</span>
                      <span className="text-[var(--success)] font-bold tabular-nums">${trade.marketPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] block">EXPECTED ZONE</span>
                      <span className="text-[var(--success)] font-bold tabular-nums">{trade.entryZone}</span>
                    </div>
                  </div>

                  {/* 1-click activate: open this candidate directly in the workspace. */}
                  <button
                    onClick={() => handleActivateOnWorkspace(trade)}
                    className="w-full py-2 bg-[var(--warning)] hover:opacity-90 text-black font-black uppercase text-[10px] tracking-widest rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 shadow cursor-pointer"
                  >
                    <span>Activate in Workspace</span>
                    <ArrowRight className="w-3" />
                  </button>
                </div>
              ))}
            </div>

          </div>
        ) : (
          /* SINGLE 100% BEST TRADE LOCKED STATE */
          activeTrade && (
            <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl border border-[var(--border)] space-y-5">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[var(--success)] via-zinc-300 to-[var(--text-secondary)] shadow-lg" />

              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-[var(--border)] pb-4">
                <div className="space-y-1 text-left">
                  <div className="inline-flex items-center gap-1.5 bg-[var(--surface-2)] text-[var(--text-secondary)] px-3 py-1 border border-[var(--border)] rounded-md text-[10px] font-black uppercase tracking-widest">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Top Candidate Selected</span>
                  </div>
                  <h2 className="text-2xl font-black text-[var(--text-primary)] font-sans uppercase tracking-tight">
                    OPTIMAL EXPOSURE CANDIDATE
                  </h2>
                </div>

                {/* Reset button if multiple exist in array */}
                {bestTradesList.length > 1 && (
                  <button
                    onClick={() => setLockedTradeId(null)}
                    className="bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 text-[10px] border border-[var(--border)] rounded uppercase font-bold shrink-0 self-start sm:self-center transition-colors"
                  >
                    Show Other Candidates ({bestTradesList.length})
                  </button>
                )}
              </div>

              {/* Grid Layout of Trade Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch mb-2">
                
                {/* Left Block Contract Name */}
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 shadow-md md:col-span-1">
                  <div>
                    <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider uppercase block">SELECTED CONTRACT</span>
                    <span className="text-2xl font-black text-[var(--text-primary)] font-sans block tracking-tight uppercase leading-snug pt-1">
                      {activeTrade.ticker} {activeTrade.strike}{activeTrade.isCall ? 'C' : 'P'}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] block pt-1 uppercase">Direction: {activeTrade.type} EXPOSURE</span>
                  </div>

                  <div className="pt-2 border-t border-[var(--border)] flex justify-between items-end">
                    <div>
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase block">HEALTH INDEX</span>
                      <span className="text-xl font-extrabold text-[var(--text-secondary)] tabular-nums">{activeTrade.health} <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">/ 100</span></span>
                    </div>
                  </div>
                </div>

                {/* Middle Block Pricing details */}
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl flex flex-col justify-between text-left relative overflow-hidden shadow-md md:col-span-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] block uppercase">SPOT REF</span>
                      <span className="text-[var(--text-primary)] font-bold text-sm tabular-nums">
                        {serverState?.pinpoint_map?.spot_price != null
                          ? `$${serverState.pinpoint_map.spot_price.toFixed(1)}`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] block uppercase">MARKET BID</span>
                      <span className="text-[var(--text-secondary)] font-bold text-sm tabular-nums">${activeTrade.marketPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] block uppercase">MODEL VALUE</span>
                      <span className="text-[var(--text-primary)] font-bold text-sm tabular-nums">${activeTrade.modelValue.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] block uppercase">MISPRICING SKEW</span>
                      <span className="text-[var(--info)] font-black text-sm tabular-nums">
                        +{(((activeTrade.modelValue - activeTrade.marketPrice) / activeTrade.marketPrice) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--border)] text-[11px] font-sans">
                    <div className="flex justify-between items-center bg-[var(--surface-2)] px-3 py-2 rounded-lg border border-[var(--border)]">
                      <span className="text-[var(--text-tertiary)] font-mono text-[10px] uppercase font-bold">Entry Zone:</span>
                      <span className="text-[var(--text-secondary)] font-mono font-bold text-xs tabular-nums">{activeTrade.entryZone}</span>
                    </div>
                    <div className="flex justify-between items-center bg-[var(--surface-2)] px-3 py-2 rounded-lg border border-[var(--border)]">
                      <span className="text-[var(--text-tertiary)] font-mono text-[10px] uppercase font-bold">Goalposts:</span>
                      <span className="text-[var(--text-primary)] font-mono font-bold text-xs tabular-nums">T1: +25% | T2: +50%</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Action: single-click activation into the workspace */}
              <div className="border-t border-[var(--border)] pt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-[10px] font-sans text-[var(--text-secondary)] leading-relaxed text-left">
                  This candidate is ranked by the discovery engine's health score and model-vs-market mispricing. Review the full thesis in the workspace before placing any trade.
                </p>

                <button
                  onClick={() => handleActivateOnWorkspace(activeTrade)}
                  className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] text-black font-extrabold uppercase text-[10px] tracking-widest rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-lg shrink-0"
                >
                  <span>Activate Option Terminal Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )
        )}

      </div>

      {/* 3. DYNAMIC INCIDENT LIST TABLE */}
      <div className="w-full animate-fadeIn">
        <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl space-y-4">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[var(--text-secondary)]/50 via-indigo-500/50 to-[var(--danger)]/50" />

          <div className="border-b border-[var(--border)] pb-3 flex justify-between items-start">
            <div className="text-left space-y-1">
              <span className="text-[10px] text-[var(--text-secondary)] tracking-[0.25em] font-black block">SYSTEM SEVERITY DISPATCH QUEUE</span>
              <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans flex items-center gap-2">
                TELEMETRY PRIORITY BOARD
                {!hasLiveFeed && (
                  <span className="text-[10px] text-[var(--warning)] font-black tracking-widest border border-[var(--warning)]/40 px-1.5 py-0.5 rounded">DEMO</span>
                )}
              </h2>
            </div>
            <div className="text-right bg-[var(--surface-2)] text-[var(--danger)] font-extrabold border border-[var(--danger)]/20 px-3 py-1 rounded-lg text-sm">
              <span className="text-[var(--text-tertiary)] uppercase text-[10px] block">CRITICAL COUNT</span>
              <span className="font-extrabold text-[13px] block tabular-nums">
                {telemetryAlerts.filter(a => a.priority === 'CRITICAL').length}
              </span>
            </div>
          </div>

          <p className="text-[11px] font-sans text-[var(--text-secondary)] leading-relaxed max-w-3xl font-light text-left">
            {hasLiveFeed
              ? 'Alerts derived from the live options flow feed. Items refresh as the server publishes new flow events.'
              : 'No live flow feed is connected for this session. The list below shows only DEMO entries you add with the simulator — these are illustrative, not measurements.'}
          </p>

          {/* Incident stream layout list block */}
          <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
            {telemetryAlerts.length > 0 ? (
              telemetryAlerts.map((al) => {
                const priorityClasses =
                  al.priority === 'CRITICAL'
                    ? 'text-[var(--danger)] border-[var(--danger)]/40 bg-[var(--surface-2)]'
                    : al.priority === 'HIGH'
                    ? 'text-[var(--success)] border-[var(--border)] bg-[var(--surface)]'
                    : al.priority === 'MEDIUM'
                    ? 'text-[var(--text-secondary)] border-[var(--border)] bg-[var(--surface)]'
                    : 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface)]';

                return (
                  <motion.div
                    key={al.id}
                    layoutId={al.id}
                    className="p-4 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left transition-all"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-[10px] font-black border uppercase tracking-wider rounded ${priorityClasses}`}>
                          {al.priority}
                        </span>
                        <span className="text-[10px] font-black text-[var(--text-primary)] uppercase">{al.type}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">•</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{al.source}</span>
                      </div>
                      <p className="text-[10.5px] text-[var(--text-secondary)] font-sans leading-normal">
                        {al.message}
                      </p>
                    </div>

                    <div className="text-right text-[10px] text-[var(--text-tertiary)] shrink-0 font-bold self-start sm:self-center font-mono tabular-nums">
                      {al.timestamp}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="py-12 text-center text-[var(--text-tertiary)] text-[10.5px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl uppercase">
                <CheckSquare className="w-5 text-[var(--text-tertiary)] mx-auto mb-1" />
                <span>No incidents on the stream. Connect a live feed or add a DEMO alert below.</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 4. CONTROLLER SIMULATOR (Command controls) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        
        {/* Simulate Controls */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold tracking-widest">DEMO SIGNAL SIMULATOR</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">ADD SAMPLE ALERTS</h4>
            <p className="text-[10.5px] text-[var(--text-secondary)] font-sans leading-relaxed">
              Add illustrative DEMO alerts to preview each priority style. These are clearly labeled DEMO and are not real market measurements.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => addSimulatedAlert('CRITICAL')}
              className="py-2.5 bg-white hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] text-black font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[10px] tracking-widest flex items-center justify-center gap-1 shadow"
            >
              <PlusCircle className="w-3" />
              <span>DEMO CRITICAL</span>
            </button>
            <button
              onClick={() => addSimulatedAlert('HIGH')}
              className="py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[10px] tracking-widest flex items-center justify-center gap-1"
            >
              <PlusCircle className="w-3" />
              <span>DEMO HIGH</span>
            </button>
            <button
              onClick={() => addSimulatedAlert('MEDIUM')}
              className="py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[10px] tracking-widest flex items-center justify-center gap-1"
            >
              <PlusCircle className="w-3" />
              <span>DEMO MEDIUM</span>
            </button>
            <button
              onClick={() => addSimulatedAlert('LOW')}
              className="py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-tertiary)] font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[10px] tracking-widest flex items-center justify-center gap-1"
            >
              <PlusCircle className="w-3" />
              <span>DEMO LOW</span>
            </button>
          </div>
        </div>

        {/* Action console clears */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold tracking-widest">INCIDENT CONSOLE HOUSEKEEPING</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">CLEAR DEMO ALERTS</h4>
            <p className="text-[10.5px] text-[var(--text-secondary)] font-sans leading-relaxed">
              Clear the DEMO alerts you have added. This only affects local demo entries; the live feed (when connected) is unaffected.
            </p>
          </div>

          <button
            onClick={clearAlerts}
            disabled={demoAlerts.length === 0}
            className="w-full py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--danger)]/40 text-[var(--danger)] font-extrabold uppercase rounded-lg cursor-pointer transition-all disabled:opacity-35 text-[10px] tracking-widest flex items-center justify-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>CLEAR DEMO ALERTS</span>
          </button>
        </div>

      </div>

      {/* 5. ALARM STANDARDS SUMMARY BLOCK */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <Layers className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <h4 className="text-[10.5px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
            Deviation Alarm Standards
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans space-y-2">
          <p>
            Alarms monitor continuous asset distributions and surface notable shifts in spot, expected-move boundaries, and dealer GEX imbalances.
          </p>
          <p>
            A critical notification is registered when spot breaks past an established expected-move boundary or dealer-gamma protection weakens materially for the active contract set.
          </p>
        </div>
      </div>

      {/* 6. COCKPIT DESK STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest pl-4 font-black shadow-md">
        <span>{hasLiveFeed ? `LIVE FEED · ${feedAlerts.length} EVENTS` : 'NO LIVE FEED CONNECTED'}</span>
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <span className={`h-1.5 w-1.5 rounded-full ${hasLiveFeed ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'}`} />
          <span>{hasLiveFeed ? 'FEED ACTIVE' : 'DEMO MODE'}</span>
        </div>
      </div>

    </div>
  );
}
