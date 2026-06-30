/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Layers,
  Gauge,
  TrendingUp,
  RadioTower,
  Calculator,
  Bell,
  Scale,
  Brain,
  History,
  X,
  BarChart3,
  Target,
  SlidersHorizontal,
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import { RiskNeutralDistribution } from './RiskNeutralDistribution';
import { IvSmile } from './IvSmile';
import { GreekExposurePanel } from './GreekExposurePanel';
import { VolConePanel } from './VolConePanel';
import { StrikeSyncProvider } from './quant/crosshairSync';
import { MonteCarloPanel } from './MonteCarloPanel';
import { RegimeDetectionPanel } from './RegimeDetectionPanel';
import { DealerHedgingPanel } from './DealerHedgingPanel';
import {
  solveImpliedRND,
  calculateRealizedVolSuite,
  calculateVolatilityCone,
  computeSkewAnalytics,
  buildStrategySuite,
  generatePayoffCoordinates,
  computeScenarioShockMatrix,
  aggregatePortfolioGreeks,
  aggregateExpiryGexCurve,
  evaluateAlertRules,
  calculateCalibrationLoop,
  bsmPrice,
  type OptionLeg,
  type PortfolioPosition,
  type AlertRule,
  type JournalTradeRecord,
  type Candle,
  type BreedenLitzenbergerResult,
  type RealizedVolSuite,
  type VolConePoint,
  type SkewMetrics,
  type StrategyMetrics,
  type ShockNode,
  type PortfolioGreeksGroup,
  type ExpiryGexNode,
  type AlertDispatch,
  type CalibrationResult,
} from '../lib/quantSuite';
import { ChainContract } from '../lib/v11Math';

// Lazy-loaded: pulls in three.js. Only fetched when a multi-expiry GEX surface
// is actually rendered, keeping the heavy 3D vendor chunk off the page's load.
const GexSurface3D = lazy(() => import('./GexSurface3D').then(m => ({ default: m.GexSurface3D })));
const IvSurface3D = lazy(() => import('./IvSurface3D').then(m => ({ default: m.IvSurface3D })));

type StrategyPreset = 'iron_condor' | 'straddle' | 'butterfly' | 'vertical';

const PRESET_LABELS: Record<StrategyPreset, string> = {
  iron_condor: 'Iron Condor',
  straddle: 'ATM Straddle',
  butterfly: 'Call Butterfly',
  vertical: 'Call Vertical',
};

/** Shared section header: icon + uppercase tracked label, optional right slot. */
function SectionHeader({
  icon,
  label,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
      <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
        <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
        {icon}
        {label}
      </span>
      {right}
    </div>
  );
}

/** Compact stat tile used across panels. */
function StatTile({
  label,
  value,
  tone = 'text-[var(--text-primary)]',
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex flex-col bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-2.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] font-semibold">{label}</span>
      <span className={`text-[15px] font-bold tabular-nums mt-1 ${tone}`}>{value}</span>
    </div>
  );
}

export default function QuantSuiteView() {
  const activeTicker = useContractStore(s => s.selectedAsset?.ticker || 'SPX');
  const serverState = useContractStore(s => s.serverState);

  // Tab control inside the suite
  const [activeSubTab, setActiveSubTab] = useState<'rnd' | 'vol' | 'builder' | 'scenarios' | 'portfolio' | 'alerts' | 'calibration'>('rnd');

  // Asset defaults
  const activeAsset = useMemo(() => {
    return ASSET_LIST.find(a => a.ticker === activeTicker) || ASSET_LIST[0];
  }, [activeTicker]);

  const spotPrice = useMemo(() => {
    return serverState?.liveSpotPrices?.[activeTicker] || activeAsset.defaultPrice;
  }, [serverState, activeTicker, activeAsset]);

  // The server streams the SAME near-the-money chain its edge engine computed on
  // (real when API keys are connected, high-fidelity mock when keyless). Using it
  // makes the Lab's RND/greeks/skew match the server and go live automatically.
  const liveChain = serverState?.option_chain as ChainContract[] | undefined;
  const hasLiveChain = Array.isArray(liveChain) && liveChain.length > 0;
  const isLiveData = !!serverState?.chain_live && hasLiveChain;

  const defaultIv = useMemo(() => {
    if (hasLiveChain) {
      // ATM implied vol = the contract whose strike sits closest to spot.
      let best = Infinity;
      let iv = activeAsset.volatility;
      for (const c of liveChain!) {
        const d = Math.abs(c.strike - spotPrice);
        if (d < best && isFinite(c.iv) && c.iv > 0) { best = d; iv = c.iv; }
      }
      return iv;
    }
    return activeAsset.volatility;
  }, [hasLiveChain, liveChain, spotPrice, activeAsset]);

  // Real chain when available; otherwise a conforming high-fidelity mock chain.
  const optionChain = useMemo(() => {
    if (hasLiveChain) return liveChain!;
    const chain: ChainContract[] = [];
    const base = spotPrice;
    const spacing = activeTicker === 'SPX' ? 25 : activeTicker === 'NDX' ? 100 : 5;
    const center = Math.round(base / spacing) * spacing;

    for (let i = -10; i <= 10; i++) {
      const strike = center + i * spacing;
      if (strike <= 0) continue;
      const d1 = (Math.log(base / strike) + 0.05 * 0.08) / (defaultIv * 0.28);
      const prob = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);

      chain.push({
        strike,
        type: 'call',
        openInterest: Math.round(14500 * prob * (i >= 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.008) + (i * i * 0.002),
        bid: Math.max(0.1, (base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing),
        ask: Math.max(0.2, ((base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing) + 0.1),
        delta: Math.max(0.01, Math.min(0.99, 0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.15 - Math.abs(i) * 0.02,
        vanna: i * -0.015,
        charm: i * -0.01,
      });

      chain.push({
        strike,
        type: 'put',
        openInterest: Math.round(14500 * prob * (i < 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.012) + (i * i * 0.0025),
        bid: Math.max(0.1, (strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing),
        ask: Math.max(0.2, ((strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing) + 0.1),
        delta: Math.max(-0.99, Math.min(-0.01, -0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.12 - Math.abs(i) * 0.018,
        vanna: i * -0.012,
        charm: i * -0.008,
      });
    }
    return chain;
  }, [hasLiveChain, liveChain, spotPrice, defaultIv, activeTicker]);

  // Real streamed candles when available (mapped from the server Candle shape);
  // otherwise a synthetic 20-bar series so the Realized Vol Suite still renders.
  const candles: Candle[] = useMemo(() => {
    const live = serverState?.candles as Array<{ timestamp?: number; time?: number; open: number; high: number; low: number; close: number; volume: number }> | undefined;
    if (Array.isArray(live) && live.length >= 10) {
      return live.slice(-90).map((c, i) => ({
        time: c.timestamp ?? c.time ?? i + 1,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    }
    const list: Candle[] = [];
    const base = spotPrice;
    let curr = base * 0.96;
    for (let i = 0; i < 20; i++) {
      const scale = 1.0 + (Math.sin(i * 0.5) * 0.018);
      const open = curr;
      const close = curr * scale;
      const high = Math.max(open, close) * (1.0 + (Math.abs(Math.sin(i)) * 0.012));
      const low = Math.min(open, close) * (1.0 - (Math.abs(Math.cos(i)) * 0.01));
      list.push({ time: i + 1, open, high, low, close, volume: 240000 + Math.floor(Math.sin(i) * 45000) });
      curr = close;
    }
    return list;
  }, [serverState, spotPrice]);

  const strikeStep = activeTicker === 'SPX' ? 25 : activeTicker === 'NDX' ? 100 : 5;
  const atmStrike = useMemo(() => Math.round(spotPrice / strikeStep) * strikeStep, [spotPrice, strikeStep]);

  // Real dealer GEX profile streamed from the server (when present).
  const gexProfile = serverState?.gex_profile;

  // ===================================
  // 1. RISK-NEUTRAL DENSITY & FAT TAILS
  // ===================================
  const dteD = 14;
  const rndResult: BreedenLitzenbergerResult = useMemo(() => {
    return solveImpliedRND(optionChain, spotPrice, defaultIv, dteD / 365, 0.051);
  }, [optionChain, spotPrice, defaultIv]);

  // Probability target — auto-derived from the chain's own 1σ implied move
  // (no manual entry). Reads the risk-neutral std-dev straight from the RND.
  const probStrike = useMemo(
    () => Math.round(spotPrice + rndResult.stdDev),
    [spotPrice, rndResult.stdDev]
  );

  const probabilityPricingText = useMemo(() => {
    const sorted = [...rndResult.density].sort((a, b) => b.strike - a.strike);
    let runSum = 0;
    let foundProb = 0;
    for (const node of sorted) {
      runSum += node.probability;
      if (node.strike <= probStrike) { foundProb = runSum; break; }
    }
    const percent = Math.round(Math.max(0, Math.min(100, foundProb * 100)));
    return {
      percent,
      statement: `The chain is pricing a ${percent}% probability of ${activeTicker} settling above ${probStrike.toLocaleString(undefined, { maximumFractionDigits: 0 })} within ${dteD} days.`,
    };
  }, [rndResult, probStrike, activeTicker]);

  // ===================================
  // 2. REALIZED VOL SUITE & VRP SPREAD
  // ===================================
  const volSuite: RealizedVolSuite = useMemo(() => {
    return calculateRealizedVolSuite(candles, defaultIv, 20);
  }, [candles, defaultIv]);

  const volCone: VolConePoint[] = useMemo(() => {
    return calculateVolatilityCone(candles, volSuite.yangZhang);
  }, [candles, volSuite]);

  // ===================================
  // 3. SKEW ANALYTICS
  // ===================================
  const skewMetrics: SkewMetrics = useMemo(() => {
    return computeSkewAnalytics(optionChain, spotPrice, defaultIv);
  }, [optionChain, spotPrice, defaultIv]);

  // ===================================
  // 4. AUTO-BUILT PRESET STRATEGY (no manual entry)
  // Legs are derived from the live ATM strike + chain IV. Switching the preset
  // re-derives every leg; there are no typed inputs.
  // ===================================
  const [activePreset, setActivePreset] = useState<StrategyPreset>('iron_condor');

  const strategyLegs = useMemo<OptionLeg[]>(() => {
    const step = strikeStep;
    const center = atmStrike;
    const t = Math.max(1, dteD) / 365.25;
    const price = (K: number, ivVal: number, oType: 'call' | 'put') =>
      Math.round(Math.max(0.01, bsmPrice(spotPrice, K, t, ivVal, oType, 0.05, 0.0)) * 100) / 100;

    if (activePreset === 'iron_condor') {
      const k1 = center - 2 * step, k2 = center - step, k3 = center + step, k4 = center + 2 * step;
      return [
        { id: 'ic1', strike: k1, type: 'put', action: 'buy', qty: 1, iv: defaultIv * 1.1, entryPrice: price(k1, defaultIv * 1.1, 'put') },
        { id: 'ic2', strike: k2, type: 'put', action: 'sell', qty: 1, iv: defaultIv * 1.02, entryPrice: price(k2, defaultIv * 1.02, 'put') },
        { id: 'ic3', strike: k3, type: 'call', action: 'sell', qty: 1, iv: defaultIv * 0.98, entryPrice: price(k3, defaultIv * 0.98, 'call') },
        { id: 'ic4', strike: k4, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 1.05, entryPrice: price(k4, defaultIv * 1.05, 'call') },
      ];
    }
    if (activePreset === 'straddle') {
      return [
        { id: 'st1', strike: center, type: 'call', action: 'buy', qty: 1, iv: defaultIv, entryPrice: price(center, defaultIv, 'call') },
        { id: 'st2', strike: center, type: 'put', action: 'buy', qty: 1, iv: defaultIv * 1.05, entryPrice: price(center, defaultIv * 1.05, 'put') },
      ];
    }
    if (activePreset === 'butterfly') {
      const k1 = center - step, k2 = center, k3 = center + step;
      return [
        { id: 'bf1', strike: k1, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 1.02, entryPrice: price(k1, defaultIv * 1.02, 'call') },
        { id: 'bf2', strike: k2, type: 'call', action: 'sell', qty: 2, iv: defaultIv, entryPrice: price(k2, defaultIv, 'call') },
        { id: 'bf3', strike: k3, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 0.98, entryPrice: price(k3, defaultIv * 0.98, 'call') },
      ];
    }
    // vertical (bull call spread, 1σ wide)
    const kLong = center, kShort = Math.round((center + rndResult.stdDev) / step) * step;
    return [
      { id: 'vt1', strike: kLong, type: 'call', action: 'buy', qty: 1, iv: defaultIv, entryPrice: price(kLong, defaultIv, 'call') },
      { id: 'vt2', strike: kShort, type: 'call', action: 'sell', qty: 1, iv: defaultIv * 0.97, entryPrice: price(kShort, defaultIv * 0.97, 'call') },
    ];
  }, [activePreset, atmStrike, strikeStep, spotPrice, defaultIv, rndResult.stdDev]);

  const strategySuite: StrategyMetrics = useMemo(() => {
    return buildStrategySuite(strategyLegs, spotPrice, dteD, 0.05, rndResult);
  }, [strategyLegs, spotPrice, rndResult]);

  const payoffChartCoordinates = useMemo(() => {
    return generatePayoffCoordinates(strategyLegs, spotPrice, rndResult);
  }, [strategyLegs, spotPrice, rndResult]);

  // 1σ expected move (in points and %) read straight off the RND dispersion.
  const expectedMovePts = rndResult.stdDev;
  const expectedMovePct = (rndResult.stdDev / spotPrice) * 100;

  // ===================================
  // 5. DETERMINISTIC SHOCK MATRIX
  // ===================================
  const spotShocks = [-0.04, -0.02, 0, 0.02, 0.04];
  const volShocks = [-0.04, -0.02, 0, 0.02, 0.04];
  const scenarioMatrix: ShockNode[] = useMemo(() => {
    return computeScenarioShockMatrix(strategyLegs, spotPrice, spotShocks, volShocks, [dteD, Math.round(dteD / 2), 0], 0.05);
  }, [strategyLegs, spotPrice]);

  const [selectedDteScenario, setSelectedDteScenario] = useState<number>(dteD);

  // Worst / best cell across the currently selected DTE slice (real, from the matrix).
  const scenarioExtremes = useMemo(() => {
    const slice = scenarioMatrix.filter(n => n.dteRemaining === selectedDteScenario);
    if (slice.length === 0) return { worst: null as ShockNode | null, best: null as ShockNode | null };
    let worst = slice[0], best = slice[0];
    for (const n of slice) {
      if (n.pnl < worst.pnl) worst = n;
      if (n.pnl > best.pnl) best = n;
    }
    return { worst, best };
  }, [scenarioMatrix, selectedDteScenario]);

  // ===================================
  // 6. PORTFOLIO BOOK MANAGER
  // ===================================
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);

  const portfolioResult: PortfolioGreeksGroup = useMemo(() => {
    return aggregatePortfolioGreeks(portfolio, spotPrice, 0.05);
  }, [portfolio, spotPrice]);

  const handleAddPortfolioStock = () => {
    setPortfolio(prev => [
      ...prev,
      { id: Math.random().toString(36).substring(7), symbol: `${activeTicker} Shares`, type: 'stock', qty: 100, entryPrice: spotPrice, currentPrice: spotPrice },
    ]);
  };

  const handleAddPortfolioOption = (optionType: 'call' | 'put') => {
    const t = Math.max(1, dteD) / 365.25;
    const px = Math.round(Math.max(0.01, bsmPrice(spotPrice, atmStrike, t, defaultIv, optionType, 0.05, 0.0)) * 100) / 100;
    setPortfolio(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        symbol: `${activeTicker} ${optionType.toUpperCase()} ${atmStrike}`,
        type: optionType,
        qty: 1,
        entryPrice: px,
        currentPrice: px,
        strike: atmStrike,
        iv: defaultIv,
        dte: dteD,
      },
    ]);
  };

  const handleRemovePortfolioItem = (id: string) => {
    setPortfolio(prev => prev.filter(p => p.id !== id));
  };

  // ===================================
  // 7. EXPIRY GEX ENGINE
  // ===================================
  const expiryGex: ExpiryGexNode[] = useMemo(() => {
    return aggregateExpiryGexCurve(optionChain, spotPrice);
  }, [optionChain, spotPrice]);

  // ===================================
  // 8. REAL ALERTS TRIGGER ENGINE
  // ===================================
  const [alertsRules, setAlertsRules] = useState<AlertRule[]>([
    { id: '1', name: `${activeTicker} Crosses Gamma Flip`, metric: 'gex_flip', operator: 'crosses', isActive: true },
    { id: '2', name: 'Dealers Short Gamma', metric: 'gex_negative', operator: 'is_negative', isActive: true },
    { id: '3', name: 'IV Richness (variance risk premium ≥ 5 pts)', metric: 'vrp_high', operator: 'above', thresholdValue: 5, isActive: true },
  ]);

  const [alertsLog, setAlertsLog] = useState<AlertDispatch[]>([]);

  const handleToggleRule = (id: string) => {
    setAlertsRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const handleAddSpotRule = (threshold: number) => {
    setAlertsRules(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        name: `${activeTicker} Spot Crosses ${threshold.toLocaleString()}`,
        metric: 'spot',
        operator: 'crosses',
        thresholdValue: threshold,
        isActive: true,
      },
    ]);
  };

  // Keep the latest inputs in a ref so the evaluation interval is created ONCE and
  // reads fresh values, instead of being torn down/recreated on every SSE frame.
  const alertCtxRef = useRef({ alertsRules, spotPrice, gexProfile, volSuite, skewMetrics });
  alertCtxRef.current = { alertsRules, spotPrice, gexProfile, volSuite, skewMetrics };
  // Previous-tick spot so "crosses" rules can actually detect a crossing
  // (passing the same value for spot and prevSpot made them permanently dead).
  const prevAlertSpotRef = useRef(spotPrice);

  useEffect(() => {
    const interval = setInterval(() => {
      const { alertsRules, spotPrice, gexProfile, volSuite, skewMetrics } = alertCtxRef.current;
      // Evaluate against the REAL dealer GEX profile + flip when the server provides
      // them; if absent, skip GEX-dependent rules rather than fabricate a value.
      const netGexVal = typeof gexProfile?.netGex === 'number' ? gexProfile.netGex : 0;
      const gammaFlip = typeof gexProfile?.gammaFlip === 'number' ? gexProfile.gammaFlip : spotPrice;

      const triggered = evaluateAlertRules(
        alertsRules,
        spotPrice,
        prevAlertSpotRef.current,
        netGexVal,
        gammaFlip,
        // Honest underlying values (vol, decimal) — not fabricated percentiles.
        volSuite.varianceRiskPremium,
        skewMetrics.riskReversal25D
      );
      prevAlertSpotRef.current = spotPrice;

      if (triggered.length > 0) {
        setAlertsLog(prev => [...triggered, ...prev].slice(0, 30));
      }
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  // ===================================
  // 9. TRADE JOURNAL & CALIBRATION (user-recorded)
  // Starts empty — no fabricated history. Predictions logged from the live setup
  // use the strategy's real RND-derived probability of profit.
  // ===================================
  const [journal, setJournal] = useState<JournalTradeRecord[]>([]);

  const closedCount = useMemo(() => journal.filter(t => t.outcome !== 'OPEN').length, [journal]);

  const calibrationLoop: CalibrationResult = useMemo(() => {
    return calculateCalibrationLoop(journal);
  }, [journal]);

  const handleLogCurrentSetup = () => {
    const newRecord: JournalTradeRecord = {
      id: Math.random().toString(36).substring(7),
      ticker: activeTicker,
      setup: PRESET_LABELS[activePreset],
      entryTime: new Date().toISOString().split('T')[0],
      entryPrice: spotPrice,
      expectedMovePct: expectedMovePct / 100,
      pop: strategySuite.pop,
      outcome: 'OPEN',
    };
    setJournal(prev => [newRecord, ...prev]);
  };

  const handleResolveTrade = (id: string, outcome: 'WIN' | 'LOSS') => {
    setJournal(prev => prev.map(t => {
      if (t.id !== id) return t;
      // Mark against the live spot at resolution time (a real value). P&L is the
      // realized move applied to one contract's notional move — not a hardcoded figure.
      const finalPrice = spotPrice;
      const move = (finalPrice - t.entryPrice) * 100;
      const pnl = Math.round(outcome === 'WIN' ? Math.abs(move) : -Math.abs(move));
      return { ...t, outcome, finalPrice, pnl };
    }));
  };

  const handleRemoveTrade = (id: string) => {
    setJournal(prev => prev.filter(t => t.id !== id));
  };

  const fmtMoney = (n: number) => (n >= 0 ? `+$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`);

  const tabs: { id: typeof activeSubTab; label: string }[] = [
    { id: 'rnd', label: 'Price Distribution' },
    { id: 'vol', label: 'Realized Vol' },
    { id: 'builder', label: 'Strategy' },
    { id: 'scenarios', label: 'Scenarios' },
    { id: 'portfolio', label: 'Book Greeks' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'calibration', label: 'Journal' },
  ];

  return (
    <StrikeSyncProvider>
    <div className="flex flex-col gap-5 w-full text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 font-mono select-none" id="quant-suite-terminal-view">
      {/* Header + live summary stats */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-[var(--border)] pb-4 gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-[var(--surface-2)] border border-[var(--border)]">
            <Calculator className="w-[18px] h-[18px] text-[var(--accent-color)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-widest text-[var(--text-primary)] uppercase font-sans whitespace-nowrap">Quant Lab</h2>
              <span
                className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                  isLiveData
                    ? 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10'
                    : 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10'
                }`}
                title={isLiveData
                  ? 'Computing on the live option chain streamed from the server.'
                  : 'No live chain connected — computing on a high-fidelity simulated chain. Connect a data API key to go live.'}
              >
                {isLiveData ? 'LIVE CHAIN' : 'SIMULATED'}
              </span>
            </div>
            <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-widest">
              Risk-Neutral Density · Realized Vol · Multi-Leg Risk · Dealer GEX
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
          {([
            { l: 'Spot', v: spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), tone: 'var(--accent-color)', ink: 'var(--text-primary)' },
            { l: 'RND Skew', v: rndResult.skewness.toFixed(3), tone: rndResult.skewness < 0 ? 'var(--warning)' : 'var(--success)', ink: rndResult.skewness < 0 ? 'var(--warning)' : 'var(--success)' },
            { l: 'RV · Y-Z', v: `${(volSuite.yangZhang * 100).toFixed(2)}%`, tone: 'var(--info)', ink: 'var(--text-primary)' },
            { l: '25Δ RR', v: `${(skewMetrics.riskReversal25D * 100).toFixed(2)}%`, tone: skewMetrics.riskReversal25D < 0 ? 'var(--danger)' : 'var(--success)', ink: skewMetrics.riskReversal25D < 0 ? 'var(--danger)' : 'var(--success)' },
          ]).map(c => (
            <div key={c.l} className="relative overflow-hidden flex flex-col bg-[var(--surface-2)] border border-[var(--border)] rounded-md pl-3 pr-3 py-1.5 min-w-0 lg:min-w-[92px]">
              <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: c.tone, opacity: 0.8 }} />
              <span className="text-[8px] font-black tracking-widest text-[var(--text-tertiary)] uppercase truncate">{c.l}</span>
              <span className="text-[14px] font-bold tabular-nums leading-tight truncate" style={{ color: c.ink }}>{c.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex flex-nowrap overflow-x-auto items-center gap-1 border-b border-[var(--border)]" id="quant-suite-sub-tabs">
        {tabs.map(t => {
          const active = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`shrink-0 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                active
                  ? 'text-[var(--text-primary)] border-[var(--success)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border-transparent'
              }`}
            >
              {t.label}
              {t.id === 'alerts' && alertsLog.length > 0 && (
                <span className="rounded-full bg-[var(--success)]/15 text-[var(--success)] text-[10px] font-bold px-1.5 leading-4 tabular-nums">
                  {alertsLog.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* View panel area */}
      <div className="min-h-[280px]" id="quant-suite-view-canvas">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="w-full flex flex-col gap-4"
          >
            {/* TAB 1: RISK-NEUTRAL DENSITY */}
            {activeSubTab === 'rnd' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                  <SectionHeader
                    icon={<BarChart3 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
                    label="Market-Implied Price Distribution f(K)"
                    right={<span className="text-[10px] text-[var(--text-tertiary)] tracking-wide">BREEDEN-LITZENBERGER</span>}
                  />

                  <div className="w-full relative" style={{ height: 280 }}>
                    {(() => {
                      const pts = rndResult.density;
                      if (!pts.length) return <div className="flex items-center justify-center h-full text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting option chain…</div>;
                      const W = 500, H = 280;
                      const minS = pts[0].strike, maxS = pts[pts.length - 1].strike, span = (maxS - minS) || 1;
                      let maxProb = 1e-9; for (const p of pts) if (p.probability > maxProb) maxProb = p.probability;
                      const xOf = (s: number) => ((s - minS) / span) * W;
                      const yOf = (p: number) => H - (p / maxProb) * 0.82 * H;
                      const mean = rndResult.mean, sd = rndResult.stdDev || (spotPrice * 0.05);
                      const lo1 = mean - sd, hi1 = mean + sd, spotX = xOf(spotPrice);
                      const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.strike).toFixed(1)} ${yOf(p.probability).toFixed(1)}`).join(' ');
                      const area = `${line} L ${xOf(maxS).toFixed(1)} ${H} L ${xOf(minS).toFixed(1)} ${H} Z`;
                      // Reference symmetric bell (peak-matched) → the implied curve's deviation from it IS the skew/fat-tails.
                      const norm = pts.map(p => { const z = (p.strike - mean) / (sd || 1); return `${xOf(p.strike).toFixed(1)} ${(H - Math.exp(-0.5 * z * z) * 0.82 * H).toFixed(1)}`; });
                      const normPath = norm.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n}`).join(' ');
                      const tail = (arr: typeof pts) => arr.length < 2 ? '' : arr.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.strike).toFixed(1)} ${yOf(p.probability).toFixed(1)}`).join(' ') + ` L ${xOf(arr[arr.length - 1].strike).toFixed(1)} ${H} L ${xOf(arr[0].strike).toFixed(1)} ${H} Z`;
                      const down = tail(pts.filter(p => p.strike <= lo1)), up = tail(pts.filter(p => p.strike >= hi1));
                      return (
                        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                          <defs>
                            <linearGradient id="qpdf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--success)" stopOpacity="0" /></linearGradient>
                            <linearGradient id="qdown" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--danger)" stopOpacity="0.5" /><stop offset="100%" stopColor="var(--danger)" stopOpacity="0.04" /></linearGradient>
                            <linearGradient id="qup" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity="0.55" /><stop offset="100%" stopColor="var(--success)" stopOpacity="0.05" /></linearGradient>
                          </defs>
                          {[0.25, 0.5, 0.75].map(r => <line key={r} x1="0" y1={H * r} x2={W} y2={H * r} stroke="var(--border)" strokeWidth="1" opacity="0.5" />)}
                          <path d={area} fill="url(#qpdf)" />
                          {down && <path d={down} fill="url(#qdown)" />}
                          {up && <path d={up} fill="url(#qup)" />}
                          {/* reference normal (what a symmetric bell would look like) */}
                          <path d={normPath} fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="3,3" opacity="0.55" vectorEffect="non-scaling-stroke" />
                          {/* implied density */}
                          <path d={line} fill="none" stroke="var(--success)" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 5px color-mix(in srgb, var(--success) 50%, transparent))' }} />
                          {/* ±1σ boundaries */}
                          {[lo1, hi1].map((b, i) => <line key={i} x1={xOf(b)} y1={H * 0.12} x2={xOf(b)} y2={H} stroke="var(--warning)" strokeWidth="1" strokeDasharray="2,3" opacity="0.5" vectorEffect="non-scaling-stroke" />)}
                          {/* spot */}
                          <line x1={spotX} y1="0" x2={spotX} y2={H} stroke="var(--accent-color)" strokeWidth="1.25" strokeDasharray="3,2" opacity="0.8" vectorEffect="non-scaling-stroke" />
                        </svg>
                      );
                    })()}
                    {/* overlaid labels (non-scaling, in real px) */}
                    {rndResult.density.length > 0 && (() => {
                      const pts = rndResult.density, minS = pts[0].strike, maxS = pts[pts.length - 1].strike, span = (maxS - minS) || 1;
                      const sd = rndResult.stdDev || spotPrice * 0.05;
                      const pct = (s: number) => `${(((s - minS) / span) * 100).toFixed(1)}%`;
                      const tag = (s: number, txt: string, color: string, top = false) => (
                        <span className="absolute -translate-x-1/2 text-[8.5px] font-mono font-black uppercase tracking-wider whitespace-nowrap px-1 rounded-sm" style={{ left: pct(s), [top ? 'top' : 'bottom']: top ? 2 : 22, color, background: 'color-mix(in srgb, var(--bg-base) 70%, transparent)' }}>{txt}</span>
                      );
                      return (<>
                        {tag(spotPrice, `Spot ${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'var(--accent-color)', true)}
                        {tag(rndResult.mean - sd, '−1σ', 'var(--warning)')}
                        {tag(rndResult.mean + sd, '+1σ', 'var(--warning)')}
                      </>);
                    })()}
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-[var(--text-tertiary)] border-t border-[var(--border)] pt-2 px-1 font-mono font-bold tabular-nums">
                    {rndResult.density.length > 0 ? <>
                      <span style={{ color: 'var(--danger)' }}>{rndResult.density[0].strike.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[var(--text-tertiary)]">DOWNSIDE</span></span>
                      <span className="flex items-center gap-3 normal-case tracking-normal"><span className="flex items-center gap-1"><span className="w-3 h-[2px] inline-block" style={{ background: 'var(--success)' }} />Implied</span><span className="flex items-center gap-1"><span className="w-3 border-t border-dashed inline-block" style={{ borderColor: 'var(--text-tertiary)' }} />Normal</span></span>
                      <span style={{ color: 'var(--success)' }}><span className="text-[var(--text-tertiary)]">UPSIDE</span> {rndResult.density[rndResult.density.length - 1].strike.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </> : <><span>DOWNSIDE</span><span>ATM</span><span>UPSIDE</span></>}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                    <SectionHeader icon={<Brain className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Distribution Stats" />
                    <div className="flex flex-col gap-2.5">
                      {[
                        { l: 'Implied 1σ Spread', v: `${(rndResult.stdDev / spotPrice * 100).toFixed(2)}%`, t: 'text-[var(--text-primary)]' },
                        { l: 'Risk-Neutral Mean', v: rndResult.mean.toFixed(2), t: 'text-[var(--text-primary)]' },
                        { l: 'PDF Skewness', v: rndResult.skewness.toFixed(4), t: rndResult.skewness < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]' },
                        { l: 'Excess Kurtosis', v: rndResult.kurtosis.toFixed(4), t: 'text-[var(--text-secondary)]' },
                      ].map((row, i) => (
                        <div key={i} className="flex justify-between border-b border-[var(--border)] pb-1.5">
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">{row.l}</span>
                          <span className={`text-[11px] font-bold tabular-nums ${row.t}`}>{row.v}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">Tail Regime</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${rndResult.isFatTailed ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}`}>
                          {rndResult.isFatTailed ? 'Fat Tails' : 'Normal'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                    <SectionHeader icon={<Scale className="w-3.5 h-3.5 text-[var(--warning)]" />} label="Probability Pricer" />
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">1σ Move Strike</span>
                      <span className="text-[14px] font-bold text-[var(--warning)] tabular-nums">{probStrike.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2.5 rounded-md">
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        {probabilityPricingText.statement}
                      </p>
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] leading-snug mt-1.5">
                      Model estimate — risk-neutral, excludes slippage/commissions; not investment advice
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: VOLATILITY */}
            {activeSubTab === 'vol' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                    <SectionHeader icon={<Activity className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Realized Volatility Estimators (20d)" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { l: 'Parkinson', v: volSuite.parkinson, t: 'text-[var(--danger)]', d: 'high/low range; excludes overnight gaps' },
                        { l: 'Garman-Klass', v: volSuite.garmanKlass, t: 'text-[var(--success)]', d: 'OHLC; captures intraday range' },
                        { l: 'Yang-Zhang', v: volSuite.yangZhang, t: 'text-[var(--warning)]', d: 'min-variance; gaps + intraday drift' },
                      ].map((e, i) => (
                        <div key={i} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3 flex flex-col items-center text-center">
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">{e.l}</span>
                          <span className={`text-[20px] font-bold tabular-nums mt-1 ${e.t}`}>{(e.v * 100).toFixed(2)}%</span>
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-2 leading-snug">{e.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                    <SectionHeader icon={<TrendingUp className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Variance Risk Premium (IV − RV)" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatTile label="ATM IV" value={`${(defaultIv * 100).toFixed(2)}%`} />
                      <StatTile label="Yang-Zhang RV" value={`${(volSuite.yangZhang * 100).toFixed(2)}%`} tone="text-[var(--warning)]" />
                      <StatTile label="VRP Spread" value={`${(volSuite.varianceRiskPremium * 100).toFixed(2)} pts`} tone={volSuite.varianceRiskPremium >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'} />
                      <StatTile label="RV Percentile" value={`${volSuite.rvPercentile}th`} tone="text-[var(--success)]" />
                    </div>
                  </div>
                </div>

                <div id="quant-suite-vol-cone">
                  <VolConePanel cone={volCone} atmIv={defaultIv} realizedVol={volSuite.yangZhang} ticker={activeTicker} live={isLiveData} />
                </div>
              </div>
            )}

            {/* TAB 3: AUTO STRATEGY BUILDER */}
            {activeSubTab === 'builder' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg gap-4">
                  <SectionHeader
                    icon={<Layers className="w-3.5 h-3.5 text-[var(--accent-color)]" />}
                    label="Auto-Built Strategy"
                    right={
                      <span className="text-[10px] text-[var(--text-tertiary)] tracking-wide">
                        ATM {atmStrike.toLocaleString()} · EM (expected move) ±{expectedMovePts.toFixed(0)} pts ({expectedMovePct.toFixed(1)}%)
                      </span>
                    }
                  />

                  {/* Preset selector — strategies are derived from live ATM + expected move */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.keys(PRESET_LABELS) as StrategyPreset[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setActivePreset(p)}
                        className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wide rounded-md border cursor-pointer transition-colors ${
                          activePreset === p
                            ? 'border-[var(--success)]/50 bg-[var(--success)]/10 text-[var(--success)]'
                            : 'border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        {PRESET_LABELS[p]}
                      </button>
                    ))}
                  </div>

                  {/* Derived legs (read-only) */}
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-12 gap-2 px-2 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide font-semibold">
                      <span className="col-span-3">Side</span>
                      <span className="col-span-2 text-center">Type</span>
                      <span className="col-span-3 text-right">Strike</span>
                      <span className="col-span-2 text-right">Qty</span>
                      <span className="col-span-2 text-right">Prem</span>
                    </div>
                    {strategyLegs.map(leg => (
                      <div key={leg.id} className="grid grid-cols-12 gap-2 items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2 py-2 text-[11px]">
                        <span className={`col-span-3 font-bold uppercase ${leg.action === 'buy' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {leg.action === 'buy' ? 'Long' : 'Short'}
                        </span>
                        <span className={`col-span-2 text-center font-bold uppercase ${leg.type === 'call' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {leg.type}
                        </span>
                        <span className="col-span-3 text-right font-bold tabular-nums text-[var(--text-primary)]">{leg.strike.toLocaleString()}</span>
                        <span className="col-span-2 text-right tabular-nums text-[var(--text-secondary)]">×{leg.qty}</span>
                        <span className="col-span-2 text-right tabular-nums text-[var(--text-secondary)]">${leg.entryPrice.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Payoff curve */}
                  <div>
                    <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide font-semibold">P&amp;L Payoff at Expiry</span>
                    <div className="h-32 w-full bg-[var(--surface-2)] border border-[var(--border)] relative rounded-md overflow-hidden mt-1.5">
                      <svg viewBox="0 0 260 120" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                        <line x1="0" y1="60" x2="260" y2="60" stroke="rgba(255,255,255,0.1)" strokeDasharray="2,3" />
                        <path
                          d={(() => {
                            const h = 120;
                            if (payoffChartCoordinates.length === 0) return '';
                            const pnls = payoffChartCoordinates.map(c => c.pnl);
                            const maxPl = Math.max(10, ...pnls);
                            const minPl = Math.min(-10, ...pnls);
                            const range = maxPl - minPl || 1;
                            return payoffChartCoordinates.map((c, idx) => {
                              const x = (idx / (payoffChartCoordinates.length - 1)) * 260;
                              const pnlRatio = (c.pnl - minPl) / range;
                              const y = h - (pnlRatio * h * 0.86) - 8;
                              return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                            }).join(' ');
                          })()}
                          fill="none"
                          stroke="#D9A15C"
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg gap-4">
                  <SectionHeader icon={<Gauge className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Payoff & Risk" />
                  <div className="grid grid-cols-2 gap-3">
                    <StatTile
                      label="Net Debit / Credit"
                      value={strategySuite.netPremium >= 0 ? `Dr $${Math.abs(strategySuite.netPremium).toLocaleString()}` : `Cr $${Math.abs(strategySuite.netPremium).toLocaleString()}`}
                      tone={strategySuite.netPremium >= 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}
                    />
                    <StatTile label="Prob. of Profit" value={`${(strategySuite.pop * 100).toFixed(1)}%`} tone="text-[var(--warning)]" />
                    <StatTile
                      label="Max Profit"
                      value={typeof strategySuite.maxProfit === 'number' ? `$${strategySuite.maxProfit.toLocaleString()}` : strategySuite.maxProfit}
                      tone="text-[var(--success)]"
                    />
                    <StatTile
                      label="Max Loss"
                      value={typeof strategySuite.maxLoss === 'number' ? `$${Math.abs(strategySuite.maxLoss).toLocaleString()}` : strategySuite.maxLoss}
                      tone="text-[var(--danger)]"
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">
                    Prob. of profit is a model estimate — risk-neutral, excludes slippage/commissions; not investment advice
                  </p>

                  <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-md">
                    <span className="text-[10px] text-[var(--success)] font-semibold uppercase tracking-wide block">Half-Kelly Size</span>
                    <span className="text-[16px] font-bold text-[var(--text-primary)] block mt-1 tabular-nums">{(strategySuite.kellySizing * 100).toFixed(1)}% of capital</span>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-1 leading-relaxed">
                      Sized from the RND-implied edge. Capped at 20% to bound drawdowns.
                    </p>
                  </div>

                  {strategySuite.breakevens.length > 0 && (
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-md">
                      <span className="text-[10px] text-[var(--text-tertiary)] font-semibold uppercase tracking-wide block mb-1">Breakevens</span>
                      <div className="flex flex-wrap gap-2">
                        {strategySuite.breakevens.map((b, i) => (
                          <span key={i} className="text-[12px] font-bold text-[var(--text-primary)] tabular-nums">{b.toLocaleString()}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: SCENARIOS */}
            {activeSubTab === 'scenarios' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                  <SectionHeader
                    icon={<SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
                    label="Scenario Stress (Spot × Vol)"
                    right={
                      <div className="flex gap-1">
                        {[
                          { v: dteD, l: `${dteD}d` },
                          { v: Math.round(dteD / 2), l: `${Math.round(dteD / 2)}d` },
                          { v: 0, l: '0d' },
                        ].map(opt => (
                          <button
                            key={opt.v}
                            onClick={() => setSelectedDteScenario(opt.v)}
                            className={`px-2 py-0.5 text-[10px] rounded cursor-pointer font-semibold border ${
                              selectedDteScenario === opt.v
                                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] border-[var(--border-strong)]'
                                : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    }
                  />

                  {/* Full matrix — sm and up (horizontal scroll only when truly needed) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <div className="min-w-[420px] grid grid-cols-6 gap-1 text-center text-[11px] font-semibold">
                      <span className="border-b border-[var(--border)] pb-1.5 text-[var(--text-tertiary)] uppercase text-[10px]">Spot ↓ / Vol →</span>
                      {volShocks.map((vol, vIdx) => (
                        <span key={vIdx} className="border-b border-[var(--border)] pb-1.5 text-[var(--text-secondary)]">{(vol * 100).toFixed(0)}%</span>
                      ))}

                      {spotShocks.map((spotScr, sIdx) => (
                        <React.Fragment key={sIdx}>
                          <span className="bg-[var(--surface-2)] border border-[var(--border)] p-2 text-[var(--text-secondary)] flex items-center justify-center font-semibold rounded">
                            {(spotScr * 100).toFixed(0)}%
                          </span>
                          {volShocks.map((volScr, vIdx) => {
                            const matchNode = scenarioMatrix.find(n =>
                              Math.abs(n.spotChange - spotScr) < 1e-4 &&
                              Math.abs(n.volChange - volScr) < 1e-4 &&
                              n.dteRemaining === selectedDteScenario
                            );
                            const pnlValue = matchNode ? matchNode.pnl : 0;
                            let bg = 'rgba(255,255,255,0.04)';
                            let bd = 'var(--border)';
                            if (pnlValue > 50) {
                              bg = `rgba(74, 222, 128, ${Math.min(0.7, 0.12 + pnlValue / 4000)})`;
                              bd = 'rgba(74, 222, 128, 0.3)';
                            } else if (pnlValue < -50) {
                              bg = `rgba(248, 113, 113, ${Math.min(0.7, 0.12 + Math.abs(pnlValue) / 4000)})`;
                              bd = 'rgba(248, 113, 113, 0.3)';
                            }
                            return (
                              <div
                                key={vIdx}
                                className="p-2 border rounded font-mono font-bold tabular-nums flex items-center justify-center h-11"
                                style={{ backgroundColor: bg, borderColor: bd }}
                                title={`Spot ${(spotScr * 100).toFixed(0)}% · Vol ${(volScr * 100).toFixed(0)}%`}
                              >
                                <span className={`text-[10px] ${pnlValue > 0 ? 'text-[var(--success)]' : pnlValue < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}`}>
                                  {pnlValue === 0 ? '$0' : pnlValue > 0 ? `+$${pnlValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `-$${Math.abs(pnlValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                </span>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* Stacked-card fallback — below sm (no horizontal scroll on phones).
                      One card per spot shock; each lists the P&L across vol shocks. */}
                  <div className="sm:hidden flex flex-col gap-2">
                    {spotShocks.map((spotScr, sIdx) => (
                      <div key={sIdx} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-2.5">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5 mb-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] font-semibold">Spot Shock</span>
                          <span className="text-[11px] font-bold tabular-nums text-[var(--text-secondary)]">{(spotScr * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          {volShocks.map((volScr, vIdx) => {
                            const matchNode = scenarioMatrix.find(n =>
                              Math.abs(n.spotChange - spotScr) < 1e-4 &&
                              Math.abs(n.volChange - volScr) < 1e-4 &&
                              n.dteRemaining === selectedDteScenario
                            );
                            const pnlValue = matchNode ? matchNode.pnl : 0;
                            return (
                              <div key={vIdx} className="flex items-center justify-between text-[11px] tabular-nums">
                                <span className="text-[var(--text-tertiary)]">Vol {(volScr * 100).toFixed(0)}%</span>
                                <span className={`font-bold ${pnlValue > 0 ? 'text-[var(--success)]' : pnlValue < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}`}>
                                  {pnlValue === 0 ? '$0' : pnlValue > 0 ? `+$${pnlValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `-$${Math.abs(pnlValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg gap-3">
                  <SectionHeader icon={<Target className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Slice Summary" />
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                    Each cell is a full Black-Scholes re-price of the open strategy under that exact spot and IV shock — not a delta approximation. Switch DTE to see theta and vega bleed over time.
                  </p>

                  {scenarioExtremes.worst && scenarioExtremes.best && (
                    <div className="grid grid-cols-1 gap-2">
                      <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3">
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide block">Worst Case ({selectedDteScenario}d)</span>
                        <span className="text-[15px] font-bold text-[var(--danger)] tabular-nums block mt-1">{fmtMoney(scenarioExtremes.worst.pnl)}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">at spot {(scenarioExtremes.worst.spotChange * 100).toFixed(0)}% · vol {(scenarioExtremes.worst.volChange * 100).toFixed(0)}%</span>
                      </div>
                      <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3">
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide block">Best Case ({selectedDteScenario}d)</span>
                        <span className="text-[15px] font-bold text-[var(--success)] tabular-nums block mt-1">{fmtMoney(scenarioExtremes.best.pnl)}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">at spot {(scenarioExtremes.best.spotChange * 100).toFixed(0)}% · vol {(scenarioExtremes.best.volChange * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: PORTFOLIO BOOK */}
            {activeSubTab === 'portfolio' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg gap-4">
                  <SectionHeader
                    icon={<Scale className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
                    label="Position Book"
                    right={
                      <div className="flex gap-1.5">
                        <button onClick={handleAddPortfolioStock} aria-label="Add shares to book" className="px-2 py-1 min-h-[40px] inline-flex items-center justify-center border border-[var(--border)] text-[10px] rounded font-semibold hover:bg-[var(--surface-2)] uppercase tracking-wide cursor-pointer text-[var(--text-secondary)]">+ Shares</button>
                        <button onClick={() => handleAddPortfolioOption('call')} aria-label="Add call option to book" className="px-2 py-1 min-h-[40px] inline-flex items-center justify-center border border-[var(--border)] text-[10px] rounded font-semibold hover:bg-[var(--surface-2)] uppercase tracking-wide cursor-pointer text-[var(--success)]">+ Call</button>
                        <button onClick={() => handleAddPortfolioOption('put')} aria-label="Add put option to book" className="px-2 py-1 min-h-[40px] inline-flex items-center justify-center border border-[var(--border)] text-[10px] rounded font-semibold hover:bg-[var(--surface-2)] uppercase tracking-wide cursor-pointer text-[var(--danger)]">+ Put</button>
                      </div>
                    }
                  />

                  <div className="space-y-1.5">
                    {portfolio.length === 0 ? (
                      <div className="text-center py-12 text-[var(--text-tertiary)] text-[11px] uppercase tracking-wide border border-dashed border-[var(--border)] rounded-md">
                        Book is empty — add shares or option contracts above. Options are priced at the live ATM strike.
                      </div>
                    ) : (
                      portfolio.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] p-2.5 rounded-md text-[11px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-9 text-[10px] text-center font-bold px-1 py-0.5 rounded uppercase ${p.type === 'stock' ? 'bg-[var(--surface-3)] text-[var(--text-secondary)]' : p.type === 'call' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--danger)]/10 text-[var(--danger)]'}`}>
                              {p.type === 'stock' ? 'eq' : p.type}
                            </span>
                            <span className="font-semibold text-[var(--text-primary)] truncate">{p.symbol}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col text-right">
                              <span className="text-[10px] text-[var(--text-tertiary)]">Basis</span>
                              <span className="font-semibold text-[var(--text-secondary)] tabular-nums">${p.entryPrice.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[10px] text-[var(--text-tertiary)]">Qty</span>
                              <span className="font-semibold text-[var(--text-primary)] tabular-nums">{p.qty > 0 ? `+${p.qty}` : p.qty}</span>
                            </div>
                            <button onClick={() => handleRemovePortfolioItem(p.id)} className="p-1 border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 rounded cursor-pointer">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col">
                  <SectionHeader icon={<Gauge className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Book Greeks (Totals)" />
                  <div className="flex flex-col gap-2.5">
                    {[
                      { l: 'Net Delta', v: portfolioResult.delta.toFixed(2), t: portfolioResult.delta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]' },
                      { l: 'Net Gamma', v: portfolioResult.gamma.toFixed(4), t: 'text-[var(--text-primary)]' },
                      { l: 'Total Vega', v: `$${portfolioResult.vega.toFixed(1)}`, t: 'text-[var(--success)]' },
                      { l: 'Daily Theta', v: `$${portfolioResult.theta.toFixed(1)}`, t: 'text-[var(--danger)]' },
                      { l: 'Vanna', v: portfolioResult.vanna.toFixed(3), t: 'text-[var(--warning)]' },
                      { l: 'Charm', v: portfolioResult.charm.toFixed(3), t: 'text-[var(--text-secondary)]' },
                    ].map((row, i) => (
                      <div key={i} className="flex justify-between border-b border-[var(--border)] pb-1.5 text-[11px]">
                        <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">{row.l}</span>
                        <span className={`font-bold tabular-nums ${row.t}`}>{row.v}</span>
                      </div>
                    ))}
                    <div className="mt-3 bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-md flex items-center justify-between">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">Net P&amp;L</span>
                      <span className={`text-[14px] font-bold tabular-nums ${portfolioResult.totalProfit >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {fmtMoney(Math.round(portfolioResult.totalProfit))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: ALERTS */}
            {activeSubTab === 'alerts' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg gap-3">
                  <SectionHeader
                    icon={<RadioTower className="w-3.5 h-3.5 text-[var(--accent-color)]" />}
                    label="Active Alert Rules"
                    right={
                      <button
                        onClick={() => handleAddSpotRule(Math.round((spotPrice * 1.03) / strikeStep) * strikeStep)}
                        className="px-2 py-1 border border-[var(--border)] text-[10px] rounded font-semibold uppercase tracking-wide text-[var(--success)] hover:bg-[var(--surface-2)] cursor-pointer"
                      >
                        + Spot Rule
                      </button>
                    }
                  />
                  <div className="space-y-1.5 flex-1">
                    {alertsRules.map(rule => (
                      <div key={rule.id} className="flex justify-between items-center bg-[var(--surface-2)] border border-[var(--border)] p-2.5 rounded-md text-[11px]">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-semibold text-[var(--text-primary)] truncate">{rule.name}</span>
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">
                            {rule.metric} · {rule.operator}{rule.thresholdValue ? ` ${rule.thresholdValue.toLocaleString()}` : ''}
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleRule(rule.id)}
                          className={`px-2 py-1 text-[10px] font-bold border uppercase tracking-wide rounded cursor-pointer ${rule.isActive ? 'bg-[var(--success)]/10 border-[var(--success)]/50 text-[var(--success)]' : 'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-tertiary)]'}`}
                        >
                          {rule.isActive ? 'Active' : 'Muted'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                    Rules evaluate every 12s against live spot, the dealer GEX profile, VRP and skew percentiles. GEX-based rules stay dormant until a dealer profile is streamed.
                  </p>
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col">
                  <SectionHeader icon={<Bell className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Dispatch Log" />
                  <div className="flex-1 overflow-y-auto max-h-[320px] space-y-2 pr-1">
                    {alertsLog.length === 0 ? (
                      <div className="text-center py-12 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">
                        Monitoring — no alerts triggered yet.
                      </div>
                    ) : (
                      alertsLog.map((log, idx) => (
                        <div
                          key={idx}
                          className="bg-[var(--surface-2)] border border-[var(--border)] p-2.5 rounded-md text-[11px] flex flex-col gap-1 border-l-2"
                          style={{ borderLeftColor: log.type === 'danger' ? 'var(--danger)' : log.type === 'warning' ? 'var(--warning)' : 'var(--success)' }}
                        >
                          <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">
                            <span className="truncate">{log.ruleName}</span>
                            <span>{log.timestamp}</span>
                          </div>
                          <p className="text-[var(--text-secondary)] leading-snug">{log.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: JOURNAL & CALIBRATION */}
            {activeSubTab === 'calibration' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg gap-3">
                  <SectionHeader
                    icon={<History className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
                    label="Trade Journal"
                    right={
                      <button
                        onClick={handleLogCurrentSetup}
                        className="px-2 py-1 border border-[var(--border)] text-[10px] rounded font-semibold uppercase tracking-wide text-[var(--warning)] hover:bg-[var(--surface-2)] cursor-pointer"
                      >
                        + Log {PRESET_LABELS[activePreset]}
                      </button>
                    }
                  />
                  <div className="space-y-1.5 overflow-y-auto max-h-[360px] pr-1">
                    {journal.length === 0 ? (
                      <div className="text-center py-12 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide border border-dashed border-[var(--border)] rounded-md">
                        No trades logged. Use "Log" to record the current setup with its live RND probability of profit.
                      </div>
                    ) : (
                      journal.map(trade => (
                        <div key={trade.id} className="bg-[var(--surface-2)] border border-[var(--border)] p-2.5 rounded-md flex justify-between items-center text-[11px]">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[var(--text-primary)] uppercase">{trade.ticker}</span>
                              <span className="text-[10px] text-[var(--text-tertiary)]">{trade.entryTime}</span>
                              <span className="text-[var(--text-secondary)] truncate">{trade.setup}</span>
                            </div>
                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">
                              Entry {trade.entryPrice.toFixed(1)} · PoP {(trade.pop * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {trade.outcome === 'OPEN' ? (
                              <>
                                <button onClick={() => handleResolveTrade(trade.id, 'WIN')} className="px-2 py-0.5 bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/40 text-[10px] font-bold rounded cursor-pointer">WIN</button>
                                <button onClick={() => handleResolveTrade(trade.id, 'LOSS')} className="px-2 py-0.5 bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/40 text-[10px] font-bold rounded cursor-pointer">LOSS</button>
                              </>
                            ) : (
                              <div className="flex items-center gap-3 text-right">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${trade.outcome === 'WIN' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--danger)]/10 text-[var(--danger)]'}`}>{trade.outcome}</span>
                                <span className={`font-bold tabular-nums ${trade.pnl && trade.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                                  {typeof trade.pnl === 'number' ? fmtMoney(trade.pnl) : ''}
                                </span>
                              </div>
                            )}
                            <button onClick={() => handleRemoveTrade(trade.id)} className="p-1 border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 rounded cursor-pointer">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col gap-4">
                  <SectionHeader icon={<Brain className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Calibration & Edge" />
                  {closedCount === 0 ? (
                    <div className="text-center py-12 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide border border-dashed border-[var(--border)] rounded-md">
                      Resolve at least one logged trade to compute calibration, win rate and expectancy.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <StatTile label="Win Rate" value={`${(calibrationLoop.winRate * 100).toFixed(1)}%`} tone="text-[var(--success)]" />
                        <StatTile label="Avg P&L" value={`$${calibrationLoop.averageReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="text-[var(--text-primary)]" />
                        <StatTile label="Max Drawdown" value={`-${calibrationLoop.maxDrawdown.toFixed(1)}%`} tone="text-[var(--danger)]" />
                        <StatTile label="Sharpe" value={calibrationLoop.sharpeRatio.toFixed(2)} tone="text-[var(--warning)]" />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-md text-center">
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide block">Brier Score</span>
                          <span className="text-[15px] font-bold text-[var(--warning)] mt-1 block tabular-nums">{calibrationLoop.brierScore.toFixed(4)}</span>
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">0.00 = perfect</p>
                        </div>
                        <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-md text-center">
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide block">ECE</span>
                          <span className="text-[15px] font-bold text-[var(--warning)] mt-1 block tabular-nums">{(calibrationLoop.expectedCalibrationError * 100).toFixed(2)}%</span>
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">confidence drift</p>
                        </div>
                      </div>

                      <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-md">
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide block border-b border-[var(--border)] pb-1.5 mb-2">Expectancy by Setup</span>
                        <div className="space-y-2">
                          {calibrationLoop.expectancyBySetup.map((s, idx) => (
                            <div key={idx} className="flex justify-between items-center text-[11px]">
                              <span className="text-[var(--text-secondary)] truncate">{s.setup}</span>
                              <div className="flex gap-3 text-right tabular-nums">
                                <span className="text-[var(--text-tertiary)]">{(s.winRate * 100).toFixed(0)}%</span>
                                <span className={`font-bold ${s.expectancy >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{fmtMoney(s.expectancy)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Risk-neutral probability distribution — the market's own forward distribution (Breeden-Litzenberger),
          with the CDF + every probability (above/below/between/touch/ITM), expected move, CIs, and IV-vs-RV. */}
      {rndResult.density.length > 2 && spotPrice > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-rnd-distribution">
          <RiskNeutralDistribution
            rnd={rndResult}
            spot={spotPrice}
            dteDays={dteD}
            ivAtm={defaultIv}
            realizedVol={volSuite.yangZhang}
            callWall={gexProfile?.callWall}
            putWall={gexProfile?.putWall}
            gammaFlip={gexProfile?.gammaFlip}
            decimals={activeAsset.decimals}
            ticker={activeTicker}
            live={isLiveData}
          />
        </div>
      )}

      {/* Implied volatility smile/skew — real front-expiry per-strike IV */}
      {optionChain.length >= 4 && spotPrice > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-iv-smile">
          <IvSmile chain={optionChain} spot={spotPrice} decimals={activeAsset.decimals} ticker={activeTicker} live={isLiveData} />
        </div>
      )}

      {/* Dealer Greek exposure profiles — per-strike Γ/Δ/vanna/charm/vega from the real chain */}
      {optionChain.length >= 4 && spotPrice > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-greek-exposure">
          <GreekExposurePanel
            chain={optionChain}
            spot={spotPrice}
            decimals={activeAsset.decimals}
            ticker={activeTicker}
            live={isLiveData}
            callWall={gexProfile?.callWall}
            putWall={gexProfile?.putWall}
            gammaFlip={gexProfile?.gammaFlip}
          />
        </div>
      )}

      {/* Dealer gamma exposure surface (3D) — real per-(strike,expiry) netGEX over the chain */}
      {(() => {
        const exps = ((gexProfile as any)?.expiries || []) as any[];
        if (!(exps.length >= 1 && spotPrice > 0)) return null;
        return (
          <div className="border-t border-[var(--border)] pt-4" id="quant-suite-gex-surface">
            <Suspense fallback={<div className="h-[300px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />}>
              <GexSurface3D expiries={exps} spot={spotPrice} decimals={activeAsset.decimals} ticker={activeTicker} live={isLiveData} />
            </Suspense>
          </div>
        );
      })()}

      {/* Implied volatility surface (3D) — real front smile + Heston forward-variance term MODEL over DTE */}
      {optionChain.length >= 4 && spotPrice > 0 && dteD > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-iv-surface">
          <Suspense fallback={<div className="h-[300px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />}>
            <IvSurface3D chain={optionChain} spot={spotPrice} frontDteDays={dteD} decimals={activeAsset.decimals} ticker={activeTicker} />
          </Suspense>
        </div>
      )}

      {/* Monte Carlo simulation — real seeded paths under GBM / jump-diffusion / Heston */}
      {spotPrice > 0 && defaultIv > 0 && dteD > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-monte-carlo">
          <MonteCarloPanel spot={spotPrice} r={0.05} sigma={defaultIv} tYears={Math.max(1, dteD) / 365} ticker={activeTicker} decimals={activeAsset.decimals} />
        </div>
      )}

      {/* Dealer hedging simulator — net-gamma landscape as spot moves, from real per-strike GEX */}
      {(gexProfile?.strikes?.length ?? 0) >= 2 && spotPrice > 0 && expectedMovePct > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-hedging">
          <DealerHedgingPanel
            strikes={(gexProfile!.strikes as any[]).map((s) => ({ strike: s.strike, netGex: s.netGex }))}
            spot={spotPrice}
            emPct={expectedMovePct / 100}
            decimals={activeAsset.decimals}
            ticker={activeTicker}
            live={isLiveData}
          />
        </div>
      )}

      {/* Market regime — measurable-feature classifier over the candle series */}
      {candles.length >= 30 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-regime">
          <RegimeDetectionPanel candles={candles} ticker={activeTicker} />
        </div>
      )}

      {/* Footer: REAL dealer GEX (when streamed) + per-expiry GEX breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 border-t border-[var(--border)] pt-4 gap-4" id="quant-suite-gex-footer">
        <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg flex flex-col gap-2">
          <SectionHeader icon={<Layers className="w-3.5 h-3.5 text-[var(--accent-color)]" />} label="Dealer GEX Profile" />
          {gexProfile ? (
            <div className="flex flex-col gap-2 text-[11px]">
              <div className="flex justify-between border-b border-[var(--border)] pb-1.5">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Net GEX</span>
                <span className={`font-bold tabular-nums ${(gexProfile.netGex ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {typeof gexProfile.netGex === 'number' ? `${(gexProfile.netGex / 1e9).toFixed(2)}B` : '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-[var(--border)] pb-1.5">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Gamma Flip</span>
                <span className="font-bold text-[var(--warning)] tabular-nums">{gexProfile.gammaFlip ? gexProfile.gammaFlip.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border)] pb-1.5">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Call Wall</span>
                <span className="font-bold text-[var(--success)] tabular-nums">{gexProfile.callWall ? gexProfile.callWall.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Put Wall</span>
                <span className="font-bold text-[var(--danger)] tabular-nums">{gexProfile.putWall ? gexProfile.putWall.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">
              No dealer GEX profile streamed yet.
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg flex flex-col">
          <SectionHeader
            icon={<BarChart3 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
            label="GEX by Expiry"
            right={<span className="text-[10px] text-[var(--text-tertiary)] tracking-wide">PER-EXPIRY</span>}
          />
          {expiryGex.length ? (
            <div className="flex flex-col gap-1.5">
              {(() => { const maxAbs = Math.max(1, ...expiryGex.map(n => Math.abs(n.totalGex))); return expiryGex.map((node, idx) => {
                const up = node.totalGex >= 0, pct = Math.min(100, (Math.abs(node.totalGex) / maxAbs) * 100), tok = up ? 'var(--success)' : 'var(--danger)';
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    <span className="w-14 shrink-0 text-[10px] font-bold text-[var(--text-secondary)] tabular-nums">{node.expiry}</span>
                    <div className="flex-1 h-[22px] relative bg-[var(--surface-2)] rounded-sm overflow-hidden border border-[var(--border)]">
                      <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(3, pct)}%`, background: `linear-gradient(to right, color-mix(in srgb, ${tok} 70%, transparent), color-mix(in srgb, ${tok} 30%, transparent))` }} />
                      <span className="absolute inset-0 flex items-center px-2 text-[10px] font-black tabular-nums" style={{ color: tok }}>{up ? '+' : '-'}${(Math.abs(node.totalGex) / 1e6).toFixed(1)}M</span>
                    </div>
                    <span className="w-16 shrink-0 text-right text-[9px] text-[var(--text-tertiary)] tabular-nums">K {node.dominantStrike.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                );
              }); })()}
            </div>
          ) : (
            <div className="text-center py-8 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">No per-expiry GEX streamed yet.</div>
          )}
        </div>
      </div>
    </div>
    </StrikeSyncProvider>
  );
}
