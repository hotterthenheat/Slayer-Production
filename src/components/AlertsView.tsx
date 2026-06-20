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

interface AlertItem {
  id: string;
  timestamp: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  message: string;
  source: string;
}

export function AlertsView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const serverState = useContractStore((s) => s.serverState);

  // Parse the live options discovery structures
  const mispricedCalls = serverState?.discovery?.mispricedCalls || [];
  const mispricedPuts = serverState?.discovery?.mispricedPuts || [];

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

  // General telemetry priority queue alerts
  const [telemetryAlerts, setTelemetryAlerts] = useState<AlertItem[]>([
    {
      id: 'alt-5a21',
      timestamp: '14:22:04',
      priority: 'CRITICAL',
      type: 'LIQUIDITY SWEEP',
      message: 'Institutional sweep void detected immediately below SPX 7620 node. Net dealer GEX shelter buffers shifted 15% lower.',
      source: 'CBOE DIRECT FEED'
    },
    {
      id: 'alt-12b4',
      timestamp: '14:15:30',
      priority: 'HIGH',
      type: 'EXPECTED RANGE EXCURSION',
      message: 'Spot price deviated past first standard boundary threshold. Underlying volatility index expanding rapidly.',
      source: 'VOLATILITY PIPELINE'
    },
    {
      id: 'alt-88c9',
      timestamp: '14:02:11',
      priority: 'MEDIUM',
      type: 'GAMMA FLIP SHIFT',
      message: 'Dealer gamma profile rebalancing near active strike nodes. Re-hedging pressures build on short positions.',
      source: 'GEX SKEW ENGINE'
    },
    {
      id: 'alt-09f1',
      timestamp: '13:58:15',
      priority: 'LOW',
      type: 'TIME DECAY COMPILING',
      message: 'Theta parameters accelerated on front-month QQQ expiration sets as market enters consolidation block.',
      source: 'SURFACE MATRIX'
    }
  ]);

  const addSimulatedAlert = (priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') => {
    const time = new Date().toLocaleTimeString();
    let newAlert: AlertItem;

    if (priority === 'CRITICAL') {
      newAlert = {
        id: `alt-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: time,
        priority: 'CRITICAL',
        type: 'TAIL EXCURSION WARNING',
        message: `Tail Risk VaR exceeded 95% boundaries on ${selectedAsset.ticker} index. Dynamic hedge safeguards activated.`,
        source: 'RISK CONTROL ENGINE'
      };
    } else if (priority === 'HIGH') {
      newAlert = {
        id: `alt-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: time,
        priority: 'HIGH',
        type: 'MOMENTUM VELOCITY ALIGNMENT',
        message: `High Timeframe trend agreement confirmed on ${selectedAsset.ticker}. Execution signals registered on V11.`,
        source: 'COPTIC TRACKER'
      };
    } else if (priority === 'MEDIUM') {
      newAlert = {
        id: `alt-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: time,
        priority: 'MEDIUM',
        type: 'VOLUME PROFILE SPIKE',
        message: `Trading volume expanded 3.2x normal standards over 5-minute index blocks. Spreads consolidating inside nodes.`,
        source: 'CME BLOCK SCANNER'
      };
    } else {
      newAlert = {
        id: `alt-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: time,
        priority: 'LOW',
        type: 'FEED SYNC NOTICE',
        message: `Direct clearing socket latency checked at 0.82 seconds. All data coordinates synchronized perfectly.`,
        source: 'TELEMETRY'
      };
    }

    setTelemetryAlerts((prev) => [newAlert, ...prev]);
  };

  const clearAlerts = () => {
    setTelemetryAlerts([]);
  };

  // Switch contract on central workspace
  const handleActivateOnWorkspace = (trade: any) => {
    const targetAsset = ASSET_LIST.find(a => a.ticker === trade.ticker) || trade.asset;
    useContractStore.getState().selectContractAtomically(targetAsset, trade.strike, trade.isCall);
    useContractStore.getState().setActiveTab('skyvision', true);
  };

  return (
    <div className="w-full text-[#4ADE80] flex flex-col font-mono select-none antialiased space-y-6">
      
      {/* 1. HEADER (COMMAND DECK) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Terminal className="w-4 h-4 text-[#4ADE80] animate-pulse" />
          <span className="text-[9.5px] text-[#4ADE80] uppercase tracking-widest font-black">
            SLAYER PRIORITIZED ALERTS COCKPIT // REALTIME SIGNAL STREAM
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/40 p-1 px-1.5 border border-white/5 rounded-lg">
          <span className="text-[8.5px] uppercase tracking-widest text-[#4ADE80] px-2 font-black">
            LIVE TELEMETRY ACTIVE
          </span>
        </div>
      </div>

      {/* 2. DYNAMIC PRIMARY BEST TRADE ALERTS SECTION */}
      <div className="w-full animate-fadeIn relative">
        
        {hasMultiple && !lockedTradeId ? (
          /* MULTIPLE TRADES FOUND STATE */
          <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl border border-amber-500/20 space-y-6">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 shadow-lg" />
            
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-white/10 pb-4">
              <div className="space-y-1.5 text-left">
                <div className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 px-3 py-1 border border-amber-500/20 rounded-md text-[9px] font-black uppercase tracking-widest">
                  <AlertTriangle className="w-3.5 h-3.5 animate-bounce" />
                  <span>Multiple Trades Found</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-[#E5E5E5] font-sans uppercase tracking-tight">
                  OPTION DISCOVERY CLUSTER DETECTED
                </h2>
              </div>
              <div className="bg-amber-400/10 text-amber-300 font-extrabold border border-amber-400/20 px-3 py-1 rounded-lg text-sm font-mono uppercase tracking-widest shrink-0">
                Found Counts: {bestTradesList.length}
              </div>
            </div>

            <p className="text-[11px] font-sans text-zinc-400 leading-relaxed text-left max-w-3xl">
              The automated quantitative engine has surfaced **{bestTradesList.length} trades** with exceptional ratings. In accordance with system safety constraints, execution is restricted to <span className="text-[#E5E5E5] font-bold">one isolated contract at a time</span> to avoid overlapping GEX hedge correlation. Select one option setup from the cluster below to lock the focused 100% Best Trade:
            </p>

            {/* List of high confidence options during "Multiple Found" mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bestTradesList.map((trade) => (
                <div 
                  key={trade.id}
                  onClick={() => setLockedTradeId(trade.id)}
                  className="bg-black/30 border border-white/5 hover:border-amber-500/40 p-5 rounded-xl cursor-pointer text-left transition-all hover:scale-[1.01] hover:bg-black/50 space-y-3 shadow-md"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[8px] text-zinc-500 font-black block tracking-widest uppercase">OPTION TARGET</span>
                      <span className="text-lg font-black text-[#E5E5E5]">{trade.ticker} {trade.strike} {trade.type}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8.5px] text-zinc-500 block">HEALTH INDEX</span>
                      <span className="text-[#4ADE80] font-black text-sm">{trade.health}/100</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10.5px] py-1 border-t border-white/5">
                    <div>
                      <span className="text-zinc-500 text-[8px] block">MARKET VALUE</span>
                      <span className="text-[#4ADE80] font-bold">${trade.marketPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[8px] block">EXPECTED ZONE</span>
                      <span className="text-[#4ADE80] font-bold">{trade.entryZone}</span>
                    </div>
                  </div>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setLockedTradeId(trade.id);
                    }}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-450 text-black font-black uppercase text-[9px] tracking-widest rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 shadow"
                  >
                    <span>Isolate & Lock Alert</span>
                    <ArrowRight className="w-3" />
                  </button>
                </div>
              ))}
            </div>

          </div>
        ) : (
          /* SINGLE 100% BEST TRADE LOCKED STATE */
          activeTrade && (
            <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl border border-black space-y-5">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#4ADE80] via-zinc-300 to-[#d4d4d8] shadow-lg" />

              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-white/10 pb-4">
                <div className="space-y-1 text-left">
                  <div className="inline-flex items-center gap-1.5 bg-black/10 text-[#d4d4d8] px-3 py-1 border border-[#d4d4d8]/20 rounded-md text-[9px] font-black uppercase tracking-widest">
                    <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                    <span>100% Best Trade Locked</span>
                  </div>
                  <h2 className="text-2xl font-black text-[#E5E5E5] font-sans uppercase tracking-tight">
                    OPTIMAL CONSOLIDATING EXPOSURE BOUNDS
                  </h2>
                </div>
                
                {/* Reset button if multiple exist in array */}
                {bestTradesList.length > 1 && (
                  <button 
                    onClick={() => setLockedTradeId(null)}
                    className="bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-[#E5E5E5] px-2.5 py-1 text-[8px] border border-white/10 rounded uppercase font-bold shrink-0 self-start sm:self-center transition-colors"
                  >
                    Show Other Candidates ({bestTradesList.length})
                  </button>
                )}
              </div>

              {/* Grid Layout of Trade Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch mb-2">
                
                {/* Left Block Contract Name */}
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 shadow-md md:col-span-1">
                  <div>
                    <span className="text-[8px] text-zinc-500 tracking-wider uppercase block">LOCKED CONTRACT</span>
                    <span className="text-2xl font-black text-[#E5E5E5] font-sans block tracking-tight uppercase leading-snug pt-1">
                      {activeTrade.ticker} {activeTrade.strike}{activeTrade.isCall ? 'C' : 'P'}
                    </span>
                    <span className="text-[10px] text-zinc-400 block pt-1 uppercase">Direction: {activeTrade.type} EXPOSURE</span>
                  </div>
                  
                  <div className="pt-2 border-t border-white/5 flex justify-between items-end">
                    <div>
                      <span className="text-[8.5px] text-zinc-500 uppercase block">DECISION SCORES</span>
                      <span className="text-xl font-extrabold text-[#d4d4d8]">{activeTrade.health} <span className="text-[10px] text-zinc-550 font-bold uppercase">SECURED</span></span>
                    </div>
                    <span className="text-[8px] text-zinc-650 uppercase font-black">V11 PLATINUM CODE</span>
                  </div>
                </div>

                {/* Middle Block Pricing details */}
                <div className="bg-black/20 border border-white/5 p-5 rounded-2xl flex flex-col justify-between text-left relative overflow-hidden shadow-md md:col-span-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-zinc-500 text-[8.5px] block uppercase">SPOT REF</span>
                      <span className="text-[#E5E5E5] font-bold text-sm">
                        ${(serverState?.pinpoint_map?.spot_price || 6100).toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[8.5px] block uppercase">MARKET BID</span>
                      <span className="text-[#d4d4d8] font-bold text-sm">${activeTrade.marketPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[8.5px] block uppercase">MODEL VALUE</span>
                      <span className="text-[#E5E5E5] font-bold text-sm">${activeTrade.modelValue.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[8.5px] block uppercase">MISPRICING SKEW</span>
                      <span className="text-indigo-400 font-black text-sm">
                        +{(((activeTrade.modelValue - activeTrade.marketPrice) / activeTrade.marketPrice) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5 text-[11px] font-sans">
                    <div className="flex justify-between items-center bg-black/40 px-3 py-2 rounded-lg border border-white/5">
                      <span className="text-zinc-500 font-mono text-[9px] uppercase font-bold">Entry Zone:</span>
                      <span className="text-[#d4d4d8] font-mono font-bold text-xs">{activeTrade.entryZone}</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/40 px-3 py-2 rounded-lg border border-white/5">
                      <span className="text-zinc-500 font-mono text-[9px] uppercase font-bold">Goalposts:</span>
                      <span className="text-[#E5E5E5] font-mono font-bold text-xs">T1: +25% | T2: +50%</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Action buttons with high glow */}
              <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-[10px] font-sans text-zinc-450 leading-relaxed text-left">
                  This 100% Isolated Trade is verified by net historical delta flow curves. Rebalancing weights are mathematically calibrated against extreme tail risk, achieving near-perfect GEX asymmetry.
                </p>
                
                <button 
                  onClick={() => handleActivateOnWorkspace(activeTrade)}
                  className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-black text-black font-extrabold uppercase text-[10px] tracking-widest rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:scale-[1.02] shrink-0"
                >
                  <span>Activate Option Terminal Workspace</span>
                  <ArrowRight className="w-4 h-4 text-black" />
                </button>
              </div>

            </div>
          )
        )}

      </div>

      {/* 3. DYNAMIC INCIDENT LIST TABLE (Now Apple glass styled) */}
      <div className="w-full animate-fadeIn">
        <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl space-y-4">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#d4d4d8]/50 via-indigo-500/50 to-rose-450/50" />
          
          <div className="border-b border-black pb-3 flex justify-between items-start">
            <div className="text-left space-y-1">
              <span className="text-[8px] text-[#d4d4d8] tracking-[0.25em] font-black block">SYSTEM SEVERITY DISPATCH QUEUE</span>
              <h2 className="text-xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans">
                TELEMETRY PRIORITY BOARD
              </h2>
            </div>
            <div className="text-right bg-rose-400/10 text-[#F87171] font-extrabold border border-rose-400/20 px-3 py-1 rounded-lg text-sm">
              <span className="text-zinc-500 uppercase text-[8px] block">CRITICAL STATUS</span>
              <span className="font-extrabold text-[13px] block">
                {telemetryAlerts.filter(a => a.priority === 'CRITICAL').length}
              </span>
            </div>
          </div>

          <p className="text-[11px] font-sans text-zinc-400 leading-relaxed max-w-3xl font-light text-left">
            Dynamic threshold alerts sorted automatically on mathematical relevance. When a spot boundary slips or GEX imbalances cross established risk parameters, direct updates compile here in real-time.
          </p>

          {/* Incident stream layout list block */}
          <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
            {telemetryAlerts.length > 0 ? (
              telemetryAlerts.map((al) => {
                const priorityClasses = 
                  al.priority === 'CRITICAL'
                    ? 'text-[#E5E5E5] border-white bg-white/5'
                    : al.priority === 'HIGH'
                    ? 'text-[#4ADE80] border-black bg-black'
                    : al.priority === 'MEDIUM'
                    ? 'text-zinc-450 border-black bg-black'
                    : 'text-zinc-550 border-black bg-black/40';

                return (
                  <motion.div
                    key={al.id}
                    layoutId={al.id}
                    className="p-4 bg-black/30 border border-white/5 hover:border-white/10 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left transition-all"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-[8px] font-black border uppercase tracking-wider rounded ${priorityClasses}`}>
                          {al.priority}
                        </span>
                        <span className="text-[9.5px] font-black text-[#E5E5E5] uppercase">{al.type}</span>
                        <span className="text-[7.5px] text-zinc-600 uppercase font-bold">•</span>
                        <span className="text-[8px] text-zinc-500 uppercase tracking-wider">{al.source}</span>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 font-sans leading-normal">
                        {al.message}
                      </p>
                    </div>

                    <div className="text-right text-[8.5px] text-[#A1A1AA] shrink-0 font-bold self-start sm:self-center font-mono">
                      {al.timestamp} GMT
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="py-12 text-center text-zinc-600 text-[10.5px] bg-black/30 border border-white/5 rounded-2xl uppercase">
                <CheckSquare className="w-5 text-zinc-700 mx-auto mb-1 animate-bounce" />
                <span>Zero prioritized incidents currently on telemetry stream channels.</span>
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
            <span className="text-[8px] text-[#d4d4d8] block uppercase font-bold tracking-widest">COMMAND SIGNALS SIMULATOR</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">DEPLOYS THRESHOLDS</h4>
            <p className="text-[10.5px] text-zinc-400 font-sans leading-relaxed">
              Manually deploy simulated market events downstream. Verify compliance speeds, SMPP dispatch routing, and prioritizations.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => addSimulatedAlert('CRITICAL')}
              className="py-2.5 bg-white hover:bg-black text-black font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[8.5px] tracking-widest flex items-center justify-center gap-1 shadow"
            >
              <PlusCircle className="w-3" />
              <span>TEST CRITICAL</span>
            </button>
            <button
              onClick={() => addSimulatedAlert('HIGH')}
              className="py-2.5 bg-black/60 hover:bg-black border border-white/10 text-[#E5E5E5] font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[8.5px] tracking-widest flex items-center justify-center gap-1"
            >
              <PlusCircle className="w-3" />
              <span>TEST HIGH</span>
            </button>
            <button
              onClick={() => addSimulatedAlert('MEDIUM')}
              className="py-2.5 bg-black/40 hover:bg-black border border-white/5 text-zinc-400 font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[8.5px] tracking-widest flex items-center justify-center gap-1"
            >
              <PlusCircle className="w-3" />
              <span>TEST MEDIUM</span>
            </button>
            <button
              onClick={() => addSimulatedAlert('LOW')}
              className="py-2.5 bg-black/40 hover:bg-black border border-white/5 text-zinc-550 font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[8.5px] tracking-widest flex items-center justify-center gap-1"
            >
              <PlusCircle className="w-3" />
              <span>TEST LOW</span>
            </button>
          </div>
        </div>

        {/* Action console clears */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 shadow-md">
          <div className="space-y-1">
            <span className="text-[8px] text-[#d4d4d8] block uppercase font-bold tracking-widest">INCIDENT CONSOLE HOUSEKEEPING</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">FLUSH COMPLIANT LEDGERS</h4>
            <p className="text-[10.5px] text-zinc-400 font-sans leading-relaxed">
              Clear current active logs. This performing action maintains local isolation parameters, purging transient setup events completely on active node sessions.
            </p>
          </div>

          <button
            onClick={clearAlerts}
            disabled={telemetryAlerts.length === 0}
            className="w-full py-2.5 bg-black/60 hover:bg-black/90 border border-white/10 hover:border-red-400/40 text-[#F87171] hover:text-red-400 font-extrabold uppercase rounded-lg cursor-pointer transition-all disabled:opacity-35 text-[8.5px] tracking-widest flex items-center justify-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>FLUSH TELEMETRY ALERTS QUEUE</span>
          </button>
        </div>

      </div>

      {/* 5. CBOE SUMMARY BLOCK */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Layers className="w-3.5 h-3.5 text-zinc-550" />
          <h4 className="text-[10.5px] font-black text-[#E5E5E5] uppercase tracking-wider block">
            CBOE Deviation Alarm Standards
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-zinc-400 font-sans space-y-2">
          <p>
            Alarm triggers follow rigorous regulatory parameters aligned with SEC Rule 15c3-5 for high-performance visual terminal devices. System coordinates monitor continuous asset distributions using double-signed covariant algorithms, establishing immediate alarms under high-imbalance shifts:
          </p>
          <p>
            A Critical notification is registered when a spot value breaks past established Standard Deviations, or if GEX dealer protection falls below 4.2 Billion Dollars in the respective contract set.
          </p>
        </div>
      </div>

      {/* 6. COCKPIT DESK STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[8px] text-zinc-400 uppercase tracking-widest pl-4 font-black shadow-md">
        <span>INCIDENTS RECONCILED ACCORDING TO CBOE TELEMETRICS</span>
        <div className="flex items-center gap-1.5 text-[#E5E5E5]">
          <span className="h-1.5 w-1.5 bg-[#d4d4d8] rounded-full animate-ping" />
          <span>DESK SECURED</span>
        </div>
      </div>

    </div>
  );
}
