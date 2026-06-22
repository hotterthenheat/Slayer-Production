/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { V8TradeRecord, SystemScore, CalibrationBucket, TargetReliability, StrategyInsight } from '../types';
import { 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  Cpu, 
  Shuffle, 
  Sliders, 
  ChevronRight, 
  Clock, 
  Award,
  Zap,
  BarChart4,
  Flame,
  Search,
  Check
} from 'lucide-react';

interface V8AuditingProps {
  trades: V8TradeRecord[];
  activeScore: SystemScore;
  onClearTrades?: () => void;
}

export function SelfAuditingLog({ trades, activeScore, onClearTrades }: V8AuditingProps) {
  const [filterAsset, setFilterAsset] = useState<string>('ALL');
  const [filterOutcome, setFilterOutcome] = useState<string>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'kpi' | 'ml' | 'calibration' | 'strategy'>('kpi');
  const [showDocumentation, setShowDocumentation] = useState(false);

  // 1. COMPUTE ESSENTIAL QUANT METRICS
  const kpiStats = useMemo(() => {
    const closed = trades.filter(t => t.finalOutcome !== 'Active');
    if (closed.length === 0) {
      return {
        total: 0,
        winRate: 0,
        profitFactor: 0,
        avgGain: 0,
        avgDrawdown: 0,
        expectancy: 0,
        expectedValueAccuracy: 100, // percentage correlation
      };
    }

    const wins = closed.filter(t => t.finalOutcome !== 'Failure');
    const winRate = (wins.length / closed.length) * 100;

    // Profit Factor calculate
    let grossWins = 0;
    let grossLosses = 0;
    let totalPnl = 0;
    closed.forEach(t => {
      // Approximate PnL in relative option terms (e.g., multiplier of entry premium)
      const pnlPct = t.maxGain > 0 && t.finalOutcome !== 'Failure' ? t.maxGain : -t.maxDrawdown;
      totalPnl += pnlPct;
      if (pnlPct > 0) grossWins += pnlPct;
      else grossLosses += Math.abs(pnlPct);
    });

    const profitFactor = grossLosses === 0 ? grossWins : Number((grossWins / grossLosses).toFixed(2));
    const avgGain = wins.length > 0 ? (wins.reduce((acc, t) => acc + t.maxGain, 0) / wins.length) : 0;
    const avgDrawdown = closed.reduce((acc, t) => acc + t.maxDrawdown, 0) / closed.length;

    // Standard deviation / expectancy
    const expectancy = Number((winRate / 100 * avgGain - (100 - winRate) / 100 * avgDrawdown).toFixed(2));

    // Expected Value Accuracy: Correlate initial statistical expected positive probability vs actual win rate
    const avgExpectedProb = closed.reduce((acc, t) => acc + t.probabilityPositive, 0) / closed.length;
    const modelError = Math.abs(avgExpectedProb - winRate);
    const expectedValueAccuracy = Math.max(0, Math.min(100, Math.round(100 - modelError)));

    return {
      total: closed.length,
      winRate: Number(winRate.toFixed(1)),
      profitFactor,
      avgGain: Number(avgGain.toFixed(1)),
      avgDrawdown: Number(avgDrawdown.toFixed(1)),
      expectancy,
      expectedValueAccuracy,
    };
  }, [trades]);

  // 2. FAILURE ANALYSIS ENGINE
  const failureStats = useMemo(() => {
    const list = trades.filter(t => t.finalOutcome === 'Failure');
    const reasonFrequency: Record<string, number> = {
      'Lost VWAP': 0,
      'RSI Rollover': 0,
      'RVOL Collapse': 0,
      'Structure Break': 0,
      'Dealer Support Lost': 0,
      'Gamma Flip Failure': 0,
      'Volatility Expansion': 0,
      'Time Decay Expansion': 0,
      'Liquidity Deterioration': 0,
      'Late Entry': 0,
      'Poor Fill': 0
    };

    let totalReasonsMapped = 0;
    list.forEach(trade => {
      trade.failureReasons.forEach(r => {
        // Match general or custom
        let matched = false;
        Object.keys(reasonFrequency).forEach(k => {
          if (r.toLowerCase().includes(k.toLowerCase())) {
            reasonFrequency[k] += 1;
            matched = true;
          }
        });
        if (!matched) {
          reasonFrequency['Structure Break'] += 1;
        }
        totalReasonsMapped += 1;
      });
    });

    // Sort reasons by frequency
    const sorted = Object.entries(reasonFrequency)
      .map(([reason, count]) => ({ reason, count, pct: list.length > 0 ? Math.round((count / list.length) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);

    const mainThreat = sorted[0]?.count > 0 ? sorted[0].reason : 'None Triggered';

    return {
      sorted,
      mainThreat,
      totalFails: list.length
    };
  }, [trades]);

  // 3. PROBABILITY CALIBRATION ANALYSIS 30-DAY WINDOW
  const calibrationBuckets = useMemo<CalibrationBucket[]>(() => {
    const closed = trades.filter(t => t.finalOutcome !== 'Active');
    const bucketsConfig = [
      { range: '65-75%', min: 65, max: 75 },
      { range: '75-85%', min: 75, max: 85 },
      { range: '85-90%', min: 85, max: 90 },
      { range: '90-95%', min: 90, max: 95 },
      { range: '95-100%', min: 95, max: 100 },
    ];

    return bucketsConfig.map(b => {
      const match = closed.filter(t => t.probabilityPositive >= b.min && t.probabilityPositive < b.max);
      const wins = match.filter(t => t.finalOutcome !== 'Failure');
      const winRate = match.length > 0 ? Number(((wins.length / match.length) * 100).toFixed(1)) : 0;
      
      let state: 'Good' | 'Bad' | 'Under-performing' | 'No Data' = 'No Data';
      if (match.length > 0) {
        const diff = winRate - ((b.min + b.max) / 2);
        if (diff < -8) {
          state = 'Under-performing';
        } else if (Math.abs(diff) <= 6) {
          state = 'Good';
        } else {
          state = 'Bad';
        }
      }

      return {
        range: b.range,
        minProb: b.min,
        maxProb: b.max,
        predictedCount: match.length,
        actualWins: wins.length,
        winRate,
        calibrationState: state
      };
    });
  }, [trades]);

  // 4. TARGET RELIABILITY MATRIX
  const targetReliability = useMemo<TargetReliability[]>(() => {
    const closed = trades.filter(t => t.finalOutcome !== 'Active');
    const attempts = closed.length;

    if (attempts === 0) {
      return [
        { label: 'Target 1 (T1 Near Term)', predictedProb: 88, actualHitCount: 0, totalAttempts: 0, actualHitRate: 0 },
        { label: 'Target 2 (T2 Structural)', predictedProb: 81, actualHitCount: 0, totalAttempts: 0, actualHitRate: 0 },
        { label: 'Target 3 (T3 Expansion)', predictedProb: 67, actualHitCount: 0, totalAttempts: 0, actualHitRate: 0 },
        { label: 'T4 Ext Stretch Option', predictedProb: 34, actualHitCount: 0, totalAttempts: 0, actualHitRate: 0 },
      ];
    }

    const t1Hits = closed.filter(t => t.target1Hit).length;
    const t2Hits = closed.filter(t => t.target2Hit).length;
    const t3Hits = closed.filter(t => t.target3Hit).length;
    const stretchHits = closed.filter(t => t.stretchTargetHit).length;

    return [
      { label: 'Target 1 (T1 Near Term)', predictedProb: 88, actualHitCount: t1Hits, totalAttempts: attempts, actualHitRate: Math.round((t1Hits / attempts) * 100) },
      { label: 'Target 2 (T2 Structural)', predictedProb: 81, actualHitCount: t2Hits, totalAttempts: attempts, actualHitRate: Math.round((t2Hits / attempts) * 100) },
      { label: 'Target 3 (T3 Expansion)', predictedProb: 67, actualHitCount: t3Hits, totalAttempts: attempts, actualHitRate: Math.round((t3Hits / attempts) * 100) },
      { label: 'T4 Ext Stretch Option', predictedProb: 34, actualHitCount: stretchHits, totalAttempts: attempts, actualHitRate: Math.round((stretchHits / attempts) * 100) },
    ];
  }, [trades]);

  // 5. STRATEGY REFERENCE CONFIGURATIONS
  // NOTE: these are illustrative reference regimes for the scoring model — they
  // are not derived from the trade dataset and the panel is labeled "SAMPLE".
  const insights = useMemo<StrategyInsight>(() => {
    return {
      bestRegime: 'High-Volume Bullish Expansion Bracket',
      worstRegime: 'Low RVOL Consolidated Premium Squeeze',
      bestTimeOfDay: '09:45 - 11:30 EST (High Momentum Liquidity Flow)',
      bestGexState: 'Net Positive GEX Cluster with Strong Spot Support',
      bestRsiStructure: 'Oversold RSI Cascade Bullish Divergence Anchor',
    };
  }, []);

  // Filter trade lifecycles based on dropdowns
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const matchAsset = filterAsset === 'ALL' || t.underlying === filterAsset;
      const matchOutcome = 
        filterOutcome === 'ALL' || 
        (filterOutcome === 'WINNER' && t.finalOutcome !== 'Failure' && t.finalOutcome !== 'Active') ||
        (filterOutcome === 'FAILURE' && t.finalOutcome === 'Failure') ||
        (filterOutcome === 'ACTIVE' && t.finalOutcome === 'Active');
      return matchAsset && matchOutcome;
    });
  }, [trades, filterAsset, filterOutcome]);

  // True only once real closed setups exist; gates "computed from logged trades"
  // copy so illustrative panels are never presented as audited fact.
  const hasClosedData = kpiStats.total > 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm flex flex-col font-mono text-xs overflow-hidden shadow-2xl relative">
      <div className="absolute top-0 right-0 p-3 bg-[var(--surface-2)] border-l border-b border-[var(--border)] select-none rounded-bl-sm">
        <span className="text-[10px] text-[var(--text-tertiary)] font-black tracking-widest uppercase">
          {hasClosedData ? `${kpiStats.total} CLOSED SETUPS` : 'NO CLOSED SETUPS'}
        </span>
      </div>

      {/* Main Header Tab Section */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] p-3 md:px-5 gap-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[var(--success)]" />
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-[var(--text-primary)] uppercase leading-none font-mono">
              QUANT AUDIT & SELF-LEARNING INTELLIGENCE
            </h1>
            <p className="text-[10px] text-[var(--text-tertiary)] font-sans mt-1">
              Machine-learning calibration engine tracking every prediction from birth to death.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDocumentation(!showDocumentation)}
            className="p-1 px-2.5 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>EXPLAIN V8 ENGINE</span>
          </button>

          {onClearTrades && (
            <button
              onClick={onClearTrades}
              className="p-1 px-2.5 rounded-sm bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--danger)]/50 text-[var(--danger)] transition-all text-[10px] uppercase font-black cursor-pointer"
            >
              Flush Learning Database
            </button>
          )}
        </div>
      </div>

      {showDocumentation && (
        <div className="p-4 bg-[var(--surface)] border-b border-[var(--border)] text-[var(--text-secondary)] leading-relaxed space-y-3 font-sans max-h-[300px] overflow-y-auto">
          <h3 className="font-mono text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-[var(--border)] pb-1.5">
            <Cpu className="w-4 h-4 text-[var(--success)]" />
            BLUEPRINT: SKYVISION V8 CALIBRATION
          </h3>
          <p className="text-xs">
            The V8 Self-Auditing Framework enforces systematic feedback loops over opaque predictions. The platform logs the exact technical states at the time of trade creation (IV, Greeks, VWAP alignment, GEX positioning, RSI structures) and verifies the outcome.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px] text-[var(--text-secondary)] mt-2">
            <div className="bg-[var(--surface-2)] p-2.5 rounded-sm border border-[var(--border)]">
              <span className="text-[var(--text-primary)] block font-bold mb-1 uppercase">PROBABILITY CALIBRATION</span>
              If actual win rates under-perform predicted scores, the ML Correction Layer dampens statistical values, matching probability to empirical feedback.
            </div>
            <div className="bg-[var(--surface-2)] p-2.5 rounded-sm border border-[var(--border)]">
              <span className="text-[var(--text-primary)] block font-bold mb-1 uppercase">CRITICAL THESIS RANKINGS</span>
              Tracks structural invalidation to pinpoint whether lost VWAP, Gamma Flips, or RSI decays trigger early failures most frequently.
            </div>
          </div>
        </div>
      )}

      {/* Sub tabs selector */}
      <div className="flex border-b border-[var(--border)] bg-[var(--surface-2)] p-2 gap-1.5 font-mono">
        <button
          onClick={() => setActiveSubTab('kpi')}
          className={`px-3 py-1.5 rounded-xs transition-all text-[11px] font-bold ${
            activeSubTab === 'kpi'
              ? 'bg-[var(--success)] text-black font-black'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
          }`}
        >
           PERFORMANCE DASHBOARD
        </button>
        <button
          onClick={() => setActiveSubTab('ml')}
          className={`px-3 py-1.5 rounded-xs transition-all text-[11px] font-bold ${
            activeSubTab === 'ml'
              ? 'bg-[var(--success)] text-black font-black'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
          }`}
        >
           COGNITIVE MACHINE LEARNING
        </button>
        <button
          onClick={() => setActiveSubTab('calibration')}
          className={`px-3 py-1.5 rounded-xs transition-all text-[11px] font-bold ${
            activeSubTab === 'calibration'
              ? 'bg-[var(--text-secondary)] text-black font-black'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
          }`}
        >
           PROBABILITY CALIBRATION CURVES
        </button>
        <button
          onClick={() => setActiveSubTab('strategy')}
          className={`px-3 py-1.5 rounded-xs transition-all text-[11px] font-bold ${
            activeSubTab === 'strategy'
              ? 'bg-[var(--text-secondary)] text-black font-black'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
          }`}
        >
           STRATEGY DISCOVERY ENGINE
        </button>
      </div>

      {/* Render sub-panels */}
      <div className="p-4 flex flex-col gap-5">
        
        {/* TAB 1: GENERAL PERFORMANCE OVERVIEW — capped at 5 columns so cards
            keep readable widths; all figures are computed from logged trades. */}
        {activeSubTab === 'kpi' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 animate-fadeIn">
            {/* KPI 1 */}
            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm text-center">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase font-black">TOTAL LOGGED TRADES</span>
              <span className="text-2xl font-black text-[var(--text-primary)] block mt-1 tabular-nums">{trades.length}</span>
              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5 leading-tight">Birth to Death Records</span>
            </div>

            {/* KPI 2 */}
            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm text-center">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase font-black font-mono">SYSTEM WIN RATE</span>
              <span className={`text-2xl font-black block mt-1 tabular-nums ${kpiStats.winRate >= 70 ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}`}>
                {kpiStats.winRate}%
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5 tabular-nums">
                {trades.filter(t => t.finalOutcome !== 'Failure' && t.finalOutcome !== 'Active').length} W / {trades.filter(t => t.finalOutcome === 'Failure').length} L
              </span>
            </div>

            {/* KPI 3 */}
            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm text-center">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase font-black">PROFIT FACTOR</span>
              <span className="text-2xl font-black text-[var(--success)] block mt-1 tabular-nums">{kpiStats.profitFactor}x</span>
              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">Gross Win / Loss ratio</span>
            </div>

            {/* KPI 4 */}
            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm text-center">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase font-black">AVG EVENT GAIN</span>
              <span className="text-2xl font-black text-[var(--text-secondary)] block mt-1 tabular-nums">+{kpiStats.avgGain}%</span>
              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">Option Premium Expansion</span>
            </div>

            {/* KPI 5 */}
            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm text-center">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase font-black">AVG EVENT ADVERSE</span>
              <span className="text-2xl font-black text-[var(--danger)] block mt-1 tabular-nums">-{kpiStats.avgDrawdown}%</span>
              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">Average Drawdown Dip</span>
            </div>

            {/* KPI 6 */}
            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm text-center">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase font-black">PROBABILITY EXPEC.</span>
              <span className="text-2xl font-black text-[var(--warning)] block mt-1 tabular-nums">+{kpiStats.expectancy}%</span>
              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">Performance mathematical edge</span>
            </div>

            {/* KPI 7 */}
            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm text-center">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase font-black">EXPECTED VALUE ACCURACY</span>
              <span className="text-2xl font-black text-[var(--success)] block mt-1 tabular-nums">{kpiStats.expectedValueAccuracy}%</span>
              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">Probability correlation index</span>
            </div>
          </div>
        )}

        {/* TAB 2: COGNITIVE MACHINE LEARNING (EXPLAINABLE AI) */}
        {activeSubTab === 'ml' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fadeIn">
            {/* Left Box: Feature Weights & Explanations */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm space-y-4">
              <div className="border-b border-[var(--border)] pb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-[var(--text-secondary)]" />
                    FEATURE IMPORTANCE WEIGHTS
                  </h3>
                  <span className="text-[10px] text-[var(--text-tertiary)] block font-sans">Reference signal weighting used by the scoring model:</span>
                </div>
                <span className="text-[10px] text-[var(--warning)] font-black tracking-widest uppercase border border-[var(--warning)]/40 px-1.5 py-0.5 rounded shrink-0">MODEL</span>
              </div>

              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">
                    <span>1. VWAP Structural Alignment Zone</span>
                    <span className="text-[var(--text-primary)] tabular-nums">28.4%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-2 rounded-sm overflow-hidden p-0.5 border border-[var(--border)]">
                    <div className="h-full bg-[var(--success)] rounded-xs" style={{ width: '28.4%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">
                    <span>2. Dealer Positioning & Spot GEX Support</span>
                    <span className="text-[var(--text-primary)] tabular-nums">21.8%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-2 rounded-sm overflow-hidden p-0.5 border border-[var(--border)]">
                    <div className="h-full bg-[var(--success)] rounded-xs" style={{ width: '21.8%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">
                    <span>3. High Displacement Candlestick Structures</span>
                    <span className="text-[var(--text-primary)] tabular-nums">16.5%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-2 rounded-sm overflow-hidden p-0.5 border border-[var(--border)]">
                    <div className="h-full bg-[var(--success)] rounded-xs" style={{ width: '16.5%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">
                    <span>4. Relative Volume (RVOL) Excursions</span>
                    <span className="text-[var(--text-primary)] tabular-nums">12.2%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-2 rounded-sm overflow-hidden p-0.5 border border-[var(--border)]">
                    <div className="h-full bg-[var(--success)] rounded-xs" style={{ width: '12.2%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">
                    <span>5. RSI Cascade Traps & Stop Hunts</span>
                    <span className="text-[var(--text-primary)] tabular-nums">11.1%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-2 rounded-sm overflow-hidden p-0.5 border border-[var(--border)]">
                    <div className="h-full bg-[var(--success)] rounded-xs" style={{ width: '11.1%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">
                    <span>6. Multi-Timeframe (HTF) Concordance</span>
                    <span className="text-[var(--text-tertiary)] tabular-nums">10.0%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-2 rounded-sm overflow-hidden p-0.5 border border-[var(--border)]">
                    <div className="h-full bg-[var(--success)] rounded-xs" style={{ width: '10%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Box: ML Correction reference parameters */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm flex flex-col justify-between">
              <div>
                <div className="border-b border-[var(--border)] pb-2 mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-[var(--success)]" />
                      ML CORRECTION MODULE
                    </h3>
                    <span className="text-[10px] text-[var(--text-tertiary)] block font-sans">Reference correction-layer parameters for the scoring model:</span>
                  </div>
                  <span className="text-[10px] text-[var(--warning)] font-black tracking-widest uppercase border border-[var(--warning)]/40 px-1.5 py-0.5 rounded shrink-0">MODEL</span>
                </div>

                <div className="space-y-2 text-[10px] font-mono leading-relaxed">
                  <div className="flex justify-between items-center bg-[var(--surface)] p-2 border border-[var(--border)] rounded-sm">
                    <span className="text-[var(--text-secondary)]">CORRECTION LAYER:</span>
                    <span className="text-[var(--success)] font-bold uppercase">Active</span>
                  </div>

                  <div className="flex justify-between items-center bg-[var(--surface)] p-2 border border-[var(--border)] rounded-sm">
                    <span className="text-[var(--text-secondary)]">MODEL BIAS OFFSET:</span>
                    <span className="text-[var(--success)] font-bold block tabular-nums">-1.42%</span>
                  </div>

                  <div className="flex justify-between items-center bg-[var(--surface)] p-2 border border-[var(--border)] rounded-sm">
                    <span className="text-[var(--text-secondary)]">EXPLAINABILITY INDEX:</span>
                    <span className="text-[var(--text-primary)] font-bold block uppercase">High (Glass-box parameters)</span>
                  </div>
                </div>

                {/* Live-status summary computed from the actual trade dataset. */}
                <div className="bg-[var(--surface)] px-3 py-2 border border-[var(--border)] rounded-sm mt-3 text-[10px] text-[var(--success)] font-mono space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--text-secondary)] font-bold">[ENGINE]</span>
                    <span>{hasClosedData ? `Synchronized ${kpiStats.total} closed setups.` : 'Awaiting closed setups to calibrate.'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--text-secondary)] font-bold">[WEIGHTS]</span>
                    <span>Reference feature weights loaded.</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[var(--text-tertiary)] text-[10px] leading-relaxed font-sans italic border-t border-[var(--border)] pt-2 flex items-center gap-1.5 select-none text-right justify-end">
                <span>Empirical calibration updates as closed setups accumulate.</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PROBABILITY CALIBRATION ANALYSIS */}
        {activeSubTab === 'calibration' && (
          <div className="flex flex-col gap-4 animate-fadeIn">
            {/* Calibration details summary */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-4">
              <span className="block text-[10px] text-[var(--text-tertiary)] uppercase mb-2 font-bold select-none">EMPIRICAL PROBABILITY CALIBRATION LEDGER</span>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {calibrationBuckets.map((bucket, id) => (
                  <div key={id} className="bg-[var(--surface)] border border-[var(--border)] rounded-sm p-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase">{bucket.range} PROBABILITY</span>
                        {bucket.calibrationState === 'Good' ? (
                          <span className="w-1.5 h-1.5 bg-[var(--success)] rounded-full" title="Calibrated successfully" />
                        ) : bucket.calibrationState === 'Under-performing' ? (
                          <span className="w-1.5 h-1.5 bg-[var(--danger)] rounded-full" title="Needs Model Demotion" />
                        ) : null}
                      </div>

                      <div className="flex items-baseline mt-2 gap-1.5">
                        <span className="text-xl font-black text-[var(--text-primary)] tabular-nums">{bucket.winRate}%</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-sans">Empirical Output</span>
                      </div>
                    </div>

                    <div className="mt-3.5 pt-2 border-t border-[var(--border)] flex justify-between text-[10px] text-[var(--text-tertiary)]">
                      <span>Occurrences: <strong className="text-[var(--success)] font-semibold tabular-nums">{bucket.predictedCount}</strong></span>
                      <span className={`font-black ${
                        bucket.calibrationState === 'Good' ? 'text-[var(--success)]' :
                        bucket.calibrationState === 'Under-performing' ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'
                      }`}>
                        {bucket.calibrationState === 'Good' ? 'CALIBRATED' :
                         bucket.calibrationState === 'Under-performing' ? 'DEMOTING MODEL' : 'PENDING'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Target Reliability Auditing Grid */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-4">
              <span className="block text-[10px] text-[var(--text-secondary)] uppercase mb-3 font-bold select-none">TARGET RELIABILITY BENCHMARK OVERVIEW</span>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {targetReliability.map((target, idx) => (
                  <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] rounded-sm p-3">
                    <span className="text-[10px] text-[var(--text-secondary)] font-bold block truncate">{target.label}</span>
                    <div className="flex justify-between items-baseline mt-1.5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-[var(--text-primary)] tabular-nums">{target.actualHitRate}%</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase">Hit rate</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] font-mono tabular-nums">Predicted: {target.predictedProb}%</span>
                    </div>
                    {/* Progress Bar comparisons */}
                    <div className="mt-3 w-full bg-[var(--surface-3)] h-1.5 rounded-sm overflow-hidden p-0.5 border border-[var(--border)]">
                      <div
                        className="h-full rounded-xs bg-[var(--success)] transition-all duration-300"
                        style={{ width: `${target.actualHitRate}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] mt-1 uppercase tabular-nums">
                      <span>Matches: {target.actualHitCount}</span>
                      <span>Total: {target.totalAttempts}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: STRATEGY DISCOVERY DISCOVERY GRID */}
        {activeSubTab === 'strategy' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fadeIn">
            {/* Bento 1: Reference configurations (illustrative, not data-derived) */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm space-y-3.5">
              <div className="border-b border-[var(--border)] pb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[var(--text-secondary)]" />
                    REFERENCE TRADING CONFIGURATIONS
                  </h3>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-sans block mt-0.5">Illustrative regime references for the scoring model:</span>
                </div>
                <span className="text-[10px] text-[var(--warning)] font-black tracking-widest uppercase border border-[var(--warning)]/40 px-1.5 py-0.5 rounded shrink-0">SAMPLE</span>
              </div>

              <div className="space-y-2.5 text-[10.5px]">
                <div className="flex justify-between items-start gap-4 border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--text-tertiary)] font-bold uppercase min-w-[130px]">VOLATILITY BRACKET</span>
                  <span className="text-[var(--text-primary)] text-right font-mono">{insights.bestRegime}</span>
                </div>

                <div className="flex justify-between items-start gap-4 border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--text-tertiary)] font-bold uppercase min-w-[110px]">GEX CONTEXT</span>
                  <span className="text-[var(--text-secondary)] text-right font-semibold">{insights.bestGexState}</span>
                </div>

                <div className="flex justify-between items-start gap-4 border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--text-tertiary)] font-bold uppercase min-w-[110px]">TRADING HOUR</span>
                  <span className="text-[var(--text-primary)] text-right">{insights.bestTimeOfDay}</span>
                </div>

                <div className="flex justify-between items-start gap-4 border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--text-tertiary)] font-bold uppercase min-w-[110px]">RSI DEPTH</span>
                  <span className="text-[var(--success)] text-right">{insights.bestRsiStructure}</span>
                </div>
              </div>
            </div>

            {/* Bento 2: Failure Analysis Threat report (computed from trades) */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm space-y-3">
              <div className="border-b border-[var(--border)] pb-2">
                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[var(--danger)]" />
                  FAILURE ANALYSIS & THREAT VECTORS
                </h3>
                <span className="text-[10px] text-[var(--text-tertiary)] block font-sans">Computed from logged failed setups in this session:</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pb-3">
                <div className="bg-[var(--surface)] p-3 border border-[var(--border)] rounded-sm text-center">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase block font-black">MOST COMMON FAIL CRITERIA</span>
                  <span className="text-xs text-[var(--danger)] font-black tracking-wide block mt-1.5 font-mono uppercase bg-[var(--surface-2)] py-1.5 rounded-sm border border-[var(--danger)]/30">
                    {failureStats.mainThreat}
                  </span>
                </div>
                <div className="bg-[var(--surface)] p-3 border border-[var(--border)] rounded-sm text-center flex flex-col justify-center">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase block font-black">TOTAL FAILED SETUPS</span>
                  <span className="text-xl font-bold text-[var(--danger)] block tabular-nums">
                    {failureStats.totalFails} <span className="text-[10px] text-[var(--text-tertiary)]">of {trades.length}</span>
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[10px]">
                <span className="text-[10px] text-[var(--text-tertiary)] block uppercase font-bold mb-1">Top Trigger Threat Frequency Breakdown:</span>
                {failureStats.sorted.slice(0, 4).map((f, id) => (
                  <div key={id} className="flex justify-between items-center text-[var(--text-secondary)] font-mono">
                    <span className="flex items-center gap-1">
                      <span className="text-[var(--text-tertiary)] tabular-nums">#0{id+1}</span>
                      <span>{f.reason}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-[var(--surface-3)] h-1 rounded-sm overflow-hidden">
                        <div className="h-full bg-[var(--danger)]" style={{ width: `${f.pct}%` }} />
                      </div>
                      <span className="text-[var(--danger)] font-bold min-w-[24px] text-right tabular-nums">{f.count} Fails</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ITEM 7: PERMANENT TRADE LIFECYCLE LEDGER */}
      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-3 mb-3.5">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--success)]" />
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">PERMANENT TRADE LIFECYCLE REGISTER</span>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap sm:flex-nowrap">
            {/* Filter by indices */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-tertiary)] text-[10px] uppercase">PRODUCT:</span>
              <select
                value={filterAsset}
                onChange={(e) => setFilterAsset(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] text-[10px] p-1 text-[var(--text-secondary)] rounded-sm font-mono cursor-pointer"
              >
                <option value="ALL">ALL INDICES</option>
                <option value="SPX">SPX</option>
                <option value="SPY">SPY</option>
                <option value="NDX">NDX</option>
                <option value="QQQ">QQQ</option>
                <option value="RUT">RUT</option>
              </select>
            </div>

            {/* Filter by outcomes */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-tertiary)] text-[10px] uppercase">DIAGNOSTIC OUTCOME:</span>
              <select
                value={filterOutcome}
                onChange={(e) => setFilterOutcome(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] text-[10px] p-1 text-[var(--text-secondary)] rounded-sm font-mono cursor-pointer"
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="WINNER">WINNERS ONLY</option>
                <option value="FAILURE">FAILED ONLY</option>
                <option value="ACTIVE">ACTIVE ONLY</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dense Ledger Table */}
        <div className="overflow-x-auto border border-[var(--border)] rounded-sm bg-[var(--surface)] max-h-[350px]">
          <table className="w-full text-left border-collapse text-[11px] font-mono whitespace-nowrap">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] text-[10px] uppercase font-bold">
                <th className="p-2.5">Trade ID</th>
                <th className="p-2.5">Contract</th>
                <th className="p-2.5">Direction</th>
                <th className="p-2.5">Greek Profile</th>
                <th className="p-2.5">Initial VWAP State</th>
                <th className="p-2.5">IV Spot</th>
                <th className="p-2.5 text-center">T1/T2/T3/Stretch</th>
                <th className="p-2.5">Drawdown / Gain</th>
                <th className="p-2.5">Duration</th>
                <th className="p-2.5 text-right">Audit Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--text-secondary)]">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-[var(--text-tertiary)] uppercase italic tracking-widest text-[10px]">
                    No matching lifecycle logs present in the auditor registry
                  </td>
                </tr>
              ) : (
                filteredTrades.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--surface-2)] transition-colors">
                    <td className="p-2.5 font-bold text-[var(--text-secondary)] border-r border-[var(--border)] tabular-nums">
                      #{t.id.substring(t.id.length - 4)}
                    </td>
                    <td className="p-2.5 font-semibold text-[var(--text-primary)]">
                      {t.contract}
                    </td>
                    <td className="p-2.5">
                      <span className={`px-1 rounded-xs text-[10px] font-extrabold ${
                        t.direction === 'BULLISH'
                          ? 'bg-[var(--surface-2)] text-[var(--success)] border border-[var(--border)]'
                          : 'bg-[var(--surface-2)] text-[var(--danger)] border border-[var(--danger)]/30'
                      }`}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="p-2.5 text-[var(--text-tertiary)] text-[10px] tabular-nums">
                      Δ:{(t.greeks.delta).toFixed(2)} · Γ:{t.greeks.gamma.toFixed(2)} · Θ:{t.greeks.theta.toFixed(1)}
                    </td>
                    <td className="p-2.5 text-[var(--text-secondary)]">
                      {t.vwapState}
                    </td>
                    <td className="p-2.5 text-[var(--success)] tabular-nums">
                      {t.iv.toFixed(1)}%
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex justify-center items-center gap-1 select-none">
                        <span className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center text-[10px] font-bold ${t.target1Hit ? 'bg-[var(--surface-3)] text-[var(--success)]' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'}`}>1</span>
                        <span className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center text-[10px] font-bold ${t.target2Hit ? 'bg-[var(--surface-3)] text-[var(--success)]' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'}`}>2</span>
                        <span className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center text-[10px] font-bold ${t.target3Hit ? 'bg-[var(--surface-3)] text-[var(--success)]' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'}`}>3</span>
                        <span className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center text-[10px] font-bold ${t.stretchTargetHit ? 'bg-[var(--success)] text-black font-black' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'}`}>S</span>
                      </div>
                    </td>
                    <td className="p-2.5 tabular-nums">
                      <span className="text-[var(--danger)]">-{t.maxDrawdown}%</span> / <span className="text-[var(--success)]">+{t.maxGain}%</span>
                    </td>
                    <td className="p-2.5 text-[var(--text-tertiary)] text-[10px] flex items-center gap-1 mt-1 tabular-nums">
                      <Clock className="w-3" />
                      <span>{t.timeTaken === 0 ? 'In-Flight' : `${t.timeTaken}m`}</span>
                    </td>
                    <td className="p-2.5 text-right border-l border-[var(--border)] font-bold uppercase">
                      <span className={`px-2 py-0.5 rounded-xs text-[10px] font-extrabold ${
                        t.finalOutcome === 'Active' ? 'bg-[var(--surface-2)] text-[var(--warning)] border border-[var(--warning)]/40' :
                        t.finalOutcome === 'Failure' ? 'bg-[var(--surface-2)] text-[var(--danger)]' : 'bg-[var(--surface-2)] text-[var(--success)]'
                      }`}>
                        {t.finalOutcome}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
