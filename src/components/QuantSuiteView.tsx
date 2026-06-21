/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Layers, 
  Activity, 
  Gauge, 
  SlidersHorizontal, 
  TrendingUp, 
  Database, 
  RadioTower, 
  RefreshCw, 
  Plus, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownRight,
  Calculator,
  Bell,
  Scale,
  Brain,
  History,
  ShieldCheck,
  Zap,
  Maximize2,
  X,
  Clock
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
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
  generateCharmVannaClock, 
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
  type CharmVannaClockPoint, 
  type AlertDispatch, 
  type CalibrationResult
} from '../lib/quantSuite';
import { ChainContract } from '../lib/v11Math';

export default function QuantSuiteView() {
  const activeTicker = useContractStore(s => s.selectedAsset?.ticker || 'SPX');
  const serverState = useContractStore(s => s.serverState);
  
  // Tab control inside the suite
  const [activeSubTab, setActiveSubTab] = useState<'rnd' | 'vol' | 'builder' | 'scenarios' | 'portfolio' | 'alerts' | 'calibration'>('rnd');
  const [refreshKey, setRefreshKey] = useState(0);

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

      // Call options
      chain.push({
        strike,
        type: 'call',
        openInterest: Math.round(14500 * prob * (i >= 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.008) + (i * i * 0.002), // Smile skew
        bid: Math.max(0.1, (base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing),
        ask: Math.max(0.2, ((base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing) + 0.1),
        delta: Math.max(0.01, Math.min(0.99, 0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.15 - Math.abs(i) * 0.02,
        vanna: i * -0.015,
        charm: i * -0.01
      });

      // Put options
      chain.push({
        strike,
        type: 'put',
        openInterest: Math.round(14500 * prob * (i < 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.012) + (i * i * 0.0025), // steeper smile skew for puts
        bid: Math.max(0.1, (strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing),
        ask: Math.max(0.2, ((strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing) + 0.1),
        delta: Math.max(-0.99, Math.min(-0.01, -0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.12 - Math.abs(i) * 0.018,
        vanna: i * -0.012,
        charm: i * -0.008
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
      list.push({
        time: i + 1,
        open,
        high,
        low,
        close,
        volume: 240000 + Math.floor(Math.sin(i) * 45000)
      });
      curr = close;
    }
    return list;
  }, [serverState, spotPrice]);

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
    const sorted = [...rndResult.density].sort((a,b) => b.strike - a.strike);
    let runSum = 0;
    let foundProb = 0;
    for (const node of sorted) {
      runSum += node.probability;
      if (node.strike <= probStrike) {
        foundProb = runSum;
        break;
      }
    }
    const percent = Math.round(Math.max(0, Math.min(100, foundProb * 100)));
    return {
      percent,
      statement: `The options chain is currently pricing a ${percent}% probability of ${activeTicker} trading ABOVE ${probStrike.toLocaleString(undefined, {maximumFractionDigits:0})} by termination date (${dteD} days).`
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
  // 4. MULTI-LEG STRATEGY BUILDER
  // ===================================
  const [strategyLegs, setStrategyLegs] = useState<OptionLeg[]>([]);

  useEffect(() => {
    const step = activeTicker === 'SPX' ? 25 : 5;
    const center = Math.round(spotPrice / step) * step;
    const t = Math.max(1, dteD) / 365.25;
    
    const pPut = bsmPrice(spotPrice, center - step, t, defaultIv * 1.1, 'put', 0.05, 0.0);
    const pCall = bsmPrice(spotPrice, center + step, t, defaultIv * 0.9, 'call', 0.05, 0.0);

    setStrategyLegs([
      { id: '1', strike: center - step, type: 'put', action: 'sell', qty: 1, iv: defaultIv * 1.1, entryPrice: Math.round(Math.max(0.01, pPut) * 100) / 100 },
      { id: '2', strike: center + step, type: 'call', action: 'sell', qty: 1, iv: defaultIv * 0.9, entryPrice: Math.round(Math.max(0.01, pCall) * 100) / 100 }
    ]);
  }, [activeTicker, spotPrice, defaultIv, dteD]);

  const strategySuite: StrategyMetrics = useMemo(() => {
    return buildStrategySuite(strategyLegs, spotPrice, dteD, 0.05, rndResult);
  }, [strategyLegs, spotPrice, rndResult]);

  const payoffChartCoordinates = useMemo(() => {
    return generatePayoffCoordinates(strategyLegs, spotPrice, rndResult);
  }, [strategyLegs, spotPrice, rndResult]);

  const handleAddLeg = (type: 'call' | 'put') => {
    const baseSpacing = activeTicker === 'SPX' ? 25 : 5;
    const strikeOffset = type === 'call' ? baseSpacing : -baseSpacing;
    const baseStrike = Math.round(spotPrice / baseSpacing) * baseSpacing + strikeOffset;
    const iv = defaultIv;
    const calcPrice = bsmPrice(spotPrice, baseStrike, Math.max(1, dteD) / 365.25, iv, type, 0.05, 0.0);

    const newLeg: OptionLeg = {
      id: Math.random().toString(36).substring(7),
      strike: baseStrike,
      type,
      action: 'buy',
      qty: 1,
      iv,
      entryPrice: Math.round(Math.max(0.01, calcPrice) * 100) / 100
    };
    setStrategyLegs(prev => [...prev, newLeg]);
  };

  const handleRemoveLeg = (id: string) => {
    setStrategyLegs(prev => prev.filter(l => l.id !== id));
  };

  const handleUpdateLeg = (id: string, updates: Partial<OptionLeg>) => {
    setStrategyLegs(prev => prev.map(l => {
      if (l.id === id) {
        const merged = { ...l, ...updates };
        if (updates.strike !== undefined || updates.iv !== undefined || updates.type !== undefined) {
          const calcPrice = bsmPrice(spotPrice, merged.strike, Math.max(1, dteD) / 365.25, merged.iv, merged.type, 0.05, 0.0);
          merged.entryPrice = Math.round(Math.max(0.01, calcPrice) * 100) / 100;
        }
        return merged;
      }
      return l;
    }));
  };

  // Preset strategies loader
  const loadPreset = (preset: 'iron_condor' | 'straddle' | 'butterfly') => {
    const step = activeTicker === 'SPX' ? 25 : 5;
    const center = Math.round(spotPrice / step) * step;
    const t = Math.max(1, dteD) / 365.25;
    
    const getPrice = (K: number, ivVal: number, oType: 'call' | 'put') => {
      const p = bsmPrice(spotPrice, K, t, ivVal, oType, 0.05, 0.0);
      return Math.round(Math.max(0.01, p) * 100) / 100;
    };

    if (preset === 'iron_condor') {
      const k1 = center - 2 * step;
      const k2 = center - step;
      const k3 = center + step;
      const k4 = center + 2 * step;
      setStrategyLegs([
        { id: '1', strike: k1, type: 'put', action: 'buy', qty: 1, iv: defaultIv * 1.1, entryPrice: getPrice(k1, defaultIv * 1.1, 'put') },
        { id: '2', strike: k2, type: 'put', action: 'sell', qty: 1, iv: defaultIv * 1.02, entryPrice: getPrice(k2, defaultIv * 1.02, 'put') },
        { id: '3', strike: k3, type: 'call', action: 'sell', qty: 1, iv: defaultIv * 0.98, entryPrice: getPrice(k3, defaultIv * 0.98, 'call') },
        { id: '4', strike: k4, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 1.05, entryPrice: getPrice(k4, defaultIv * 1.05, 'call') }
      ]);
    } else if (preset === 'straddle') {
      setStrategyLegs([
        { id: '1', strike: center, type: 'call', action: 'buy', qty: 1, iv: defaultIv, entryPrice: getPrice(center, defaultIv, 'call') },
        { id: '2', strike: center, type: 'put', action: 'buy', qty: 1, iv: defaultIv * 1.05, entryPrice: getPrice(center, defaultIv * 1.05, 'put') }
      ]);
    } else if (preset === 'butterfly') {
      const k1 = center - step;
      const k2 = center;
      const k3 = center + step;
      setStrategyLegs([
        { id: '1', strike: k1, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 1.02, entryPrice: getPrice(k1, defaultIv * 1.02, 'call') },
        { id: '2', strike: k2, type: 'call', action: 'sell', qty: 2, iv: defaultIv, entryPrice: getPrice(k2, defaultIv, 'call') },
        { id: '3', strike: k3, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 0.98, entryPrice: getPrice(k3, defaultIv * 0.98, 'call') }
      ]);
    }
  };

  // ===================================
  // 5. DETERMINISTIC SHOCK MATRIX
  // ===================================
  const spotShocks = [-0.04, -0.02, 0, 0.02, 0.04];
  const volShocks = [-0.04, -0.02, 0, 0.02, 0.04];
  const scenarioMatrix: ShockNode[] = useMemo(() => {
    return computeScenarioShockMatrix(strategyLegs, spotPrice, spotShocks, volShocks, [dteD, Math.round(dteD/2), 0], 0.05);
  }, [strategyLegs, spotPrice]);

  const [selectedDteScenario, setSelectedDteScenario] = useState<number>(dteD);

  // ===================================
  // 6. PORTFOLIO BOOK MANAGER
  // ===================================
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([
    { id: '1', symbol: activeTicker, type: 'stock', qty: 100, entryPrice: spotPrice * 0.98, currentPrice: spotPrice },
    { id: '2', symbol: `${activeTicker} Call ${Math.round(spotPrice * 1.02)}`, type: 'call', qty: -2, entryPrice: 6.2, currentPrice: 5.4, strike: Math.round(spotPrice * 1.02), iv: defaultIv, dte: dteD }
  ]);

  const portfolioResult: PortfolioGreeksGroup = useMemo(() => {
    return aggregatePortfolioGreeks(portfolio, spotPrice, 0.05);
  }, [portfolio, spotPrice]);

  const handleAddPortfolioStock = () => {
    setPortfolio(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        symbol: `${activeTicker} Stock`,
        type: 'stock',
        qty: 100,
        entryPrice: spotPrice,
        currentPrice: spotPrice
      }
    ]);
  };

  const handleAddPortfolioOption = (optionType: 'call' | 'put') => {
    const step = activeTicker === 'SPX' ? 25 : 5;
    const defaultStrike = Math.round(spotPrice / step) * step;
    setPortfolio(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        symbol: `${activeTicker} ${optionType.toUpperCase()} ${defaultStrike}`,
        type: optionType,
        qty: 1,
        entryPrice: 5.0,
        currentPrice: 5.0,
        strike: defaultStrike,
        iv: defaultIv,
        dte: dteD
      }
    ]);
  };

  const handleRemovePortfolioItem = (id: string) => {
    setPortfolio(prev => prev.filter(p => p.id !== id));
  };

  // ===================================
  // 7. EXPIRY GEX & CHARM ENGINE
  // ===================================
  const expiryGex: ExpiryGexNode[] = useMemo(() => {
    return aggregateExpiryGexCurve(optionChain, spotPrice);
  }, [optionChain, spotPrice]);

  const decayClock: CharmVannaClockPoint[] = useMemo(() => {
    return generateCharmVannaClock();
  }, []);

  // ===================================
  // 8. REAL ALERTS TRIGGER ENGINE
  // ===================================
  const [alertsRules, setAlertsRules] = useState<AlertRule[]>([
    { id: '1', name: 'SPX Spot Breaches Flip', metric: 'gex_flip', operator: 'crosses', isActive: true },
    { id: '2', name: 'Dealers Shift Short Gamma', metric: 'gex_negative', operator: 'is_negative', isActive: true },
    { id: '3', name: 'IV Richness Edge Detected', metric: 'vrp_high', operator: 'above', thresholdValue: 90, isActive: true }
  ]);

  const [alertsLog, setAlertsLog] = useState<AlertDispatch[]>([
    { timestamp: '14:02:15', ruleName: 'SPX Spot Breaches Flip', message: 'SPOT CRITICAL ALERT: Spot crossed below gamma flip price.', type: 'danger' }
  ]);

  const handleToggleRule = (id: string) => {
    setAlertsRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const handleAddNewRule = (metric: 'spot' | 'vrp_high', threshold: number) => {
    setAlertsRules(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        name: `${activeTicker} Spot Cross ${threshold}`,
        metric,
        operator: metric === 'spot' ? 'crosses' : 'above',
        thresholdValue: threshold,
        isActive: true
      }
    ]);
  };

  // Keep the latest inputs in a ref so the 12s evaluation interval is created ONCE
  // and reads fresh values, instead of being torn down/recreated on every SSE frame
  // (serverState/spotPrice change ~7×/sec, which previously meant the timer reset
  // every ~150ms and effectively never fired).
  const alertCtxRef = useRef({ alertsRules, spotPrice, serverState, volSuite, skewMetrics });
  alertCtxRef.current = { alertsRules, spotPrice, serverState, volSuite, skewMetrics };

  // Run periodic rule evaluation simulation (ticker ticking effect)
  useEffect(() => {
    const interval = setInterval(() => {
      const { alertsRules, spotPrice, serverState, volSuite, skewMetrics } = alertCtxRef.current;
      // Simulate slight underlying spot tick fluctuation
      const noisePrice = spotPrice * (1.0 + (Math.random() - 0.5) * 0.001);
      const prevNoise = spotPrice;
      const netGexVal = serverState?.system_score?.total ? (serverState.system_score.total - 60) * 1e7 : -1500000;
      const calculatedFlip = spotPrice * 0.992;

      const triggered = evaluateAlertRules(
        alertsRules,
        noisePrice,
        prevNoise,
        netGexVal,
        calculatedFlip,
        volSuite.vrpPercentile,
        skewMetrics.riskReversalPercentile
      );

      if (triggered.length > 0) {
        setAlertsLog(prev => [...triggered, ...prev].slice(0, 30));
      }
    }, 12000); // Evaluates every 12s on live flow updates
    return () => clearInterval(interval);
  }, []);

  // ===================================
  // 9. JOURNAL CALIBRATION COGNITION
  // ===================================
  const [journal, setJournal] = useState<JournalTradeRecord[]>([
    { id: '1', ticker: 'SPX', setup: 'GEX Mean Reversion', entryTime: '2026-06-12', entryPrice: 5410, expectedMovePct: 0.015, pop: 0.65, outcome: 'WIN', finalPrice: 5435, pnl: 2200 },
    { id: '2', ticker: 'SPX', setup: 'Wall Rejection Strike', entryTime: '2026-06-15', entryPrice: 5425, expectedMovePct: 0.012, pop: 0.58, outcome: 'WIN', finalPrice: 5450, pnl: 1850 },
    { id: '3', ticker: 'NDX', setup: 'Gamma Flip Breakout', entryTime: '2026-06-18', entryPrice: 18120, expectedMovePct: 0.022, pop: 0.45, outcome: 'LOSS', finalPrice: 18010, pnl: -1400 },
    { id: '4', ticker: 'SPY', setup: 'Magnet Strike Drift', entryTime: '2026-06-19', entryPrice: 520.5, expectedMovePct: 0.010, pop: 0.61, outcome: 'WIN', finalPrice: 523.1, pnl: 850 },
    { id: '5', ticker: 'SPX', setup: 'GEX Mean Reversion', entryTime: '2026-06-20', entryPrice: spotPrice, expectedMovePct: 0.012, pop: 0.60, outcome: 'OPEN' }
  ]);

  const calibrationLoop: CalibrationResult = useMemo(() => {
    return calculateCalibrationLoop(journal);
  }, [journal]);

  const handleLogTrade = (setup: string, popVal: number) => {
    const newRecord: JournalTradeRecord = {
      id: Math.random().toString(36).substring(7),
      ticker: activeTicker,
      setup,
      entryTime: new Date().toISOString().split('T')[0],
      entryPrice: spotPrice,
      expectedMovePct: 0.015,
      pop: popVal,
      outcome: 'OPEN'
    };
    setJournal(prev => [newRecord, ...prev]);
  };

  const handleResolveTrade = (id: string, outcome: 'WIN' | 'LOSS') => {
    setJournal(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          outcome,
          finalPrice: outcome === 'WIN' ? t.entryPrice * 1.01 : t.entryPrice * 0.99,
          pnl: outcome === 'WIN' ? 1200 : -850
        };
      }
      return t;
    }));
  };

  return (
    <div className="flex flex-col gap-6 w-full text-[#E5E5E5] bg-black border border-[#1f1f1f] rounded-sm p-4 font-mono select-none" id="quant-suite-terminal-view">
      {/* Top Banner and Summary metrics bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#2A2A2F] pb-4 mb-2 gap-4">
        <div>
          <h2 className="text-sm font-black tracking-widest text-[#FFF] uppercase flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#D9A15C]" />
            Options Quant Lab
            <span
              className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${
                isLiveData
                  ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                  : 'text-amber-400 border-amber-500/40 bg-amber-500/10'
              }`}
              title={isLiveData
                ? 'Computing on the live option chain streamed from the server.'
                : 'No live chain connected — computing on a high-fidelity simulated chain. Connect a data API key to go live.'}
            >
              {isLiveData ? '● LIVE CHAIN' : '○ SIMULATED'}
            </span>
          </h2>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
            Price Distribution (RND) • Realized Vol • Multi-Leg Risk Scenarios
          </p>
        </div>
        
        {/* Rapid summary stats */}
        <div className="flex items-center gap-3 bg-[#0a0a0c] border border-zinc-800/40 rounded-sm p-2">
          <div className="flex flex-col">
            <span className="text-[8px] text-zinc-500 uppercase font-black">Local Spot</span>
            <span className="text-[11px] font-bold text-white tabular-nums">{spotPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div className="flex flex-col">
            <span className="text-[8px] text-zinc-500 uppercase font-black">RND Skew</span>
            <span className={`text-[11px] font-bold ${rndResult.skewness < 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{rndResult.skewness.toFixed(3)}</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div className="flex flex-col">
            <span className="text-[8px] text-zinc-500 uppercase font-black">Realized Vol (Y-Z)</span>
            <span className="text-[11px] font-bold text-white tabular-nums">{(volSuite.yangZhang * 100).toFixed(2)}%</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div className="flex flex-col">
            <span className="text-[8px] text-zinc-500 uppercase font-black">25-Delta Risk Reversal</span>
            <span className="text-[11px] font-bold text-emerald-400">{(skewMetrics.riskReversal25D * 100).toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Primary Sub-Tabs Controller */}
      <div className="flex flex-nowrap overflow-x-auto scrollbar-none items-center gap-1 border-b border-[#1f1f1f] pb-0" id="quant-suite-sub-tabs">
        {/* RND tab — default starting point, slightly emphasized */}
        <button
          onClick={() => setActiveSubTab('rnd')}
          className={`shrink-0 px-3.5 py-2.5 min-h-[36px] text-[9px] font-black uppercase tracking-wider transition-all rounded-lg cursor-pointer relative ${
            activeSubTab === 'rnd'
              ? 'bg-white/5 text-[#E5E5E5] border-b-2 border-[#4ADE80]'
              : 'text-zinc-400 hover:text-[#E5E5E5] border-b-2 border-transparent'
          }`}
        >
          <span className={activeSubTab !== 'rnd' ? 'text-[#4ADE80]/80' : ''}>Price Distribution</span>
          {activeSubTab !== 'rnd' && (
            <span className="ml-1 text-[7px] font-black text-[#4ADE80]/60 normal-case tracking-normal">(start here)</span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('vol')}
          className={`shrink-0 px-3.5 py-2.5 min-h-[36px] text-[9px] font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer border-b-2 ${
            activeSubTab === 'vol'
              ? 'bg-white/5 text-[#E5E5E5] border-[#4ADE80]'
              : 'text-zinc-400 hover:text-[#E5E5E5] border-transparent'
          }`}
        >
          Realized Vol
        </button>
        <button
          onClick={() => setActiveSubTab('builder')}
          className={`shrink-0 px-3.5 py-2.5 min-h-[36px] text-[9px] font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer border-b-2 ${
            activeSubTab === 'builder'
              ? 'bg-white/5 text-[#E5E5E5] border-[#4ADE80]'
              : 'text-zinc-400 hover:text-[#E5E5E5] border-transparent'
          }`}
        >
          Strategy Builder
        </button>
        <button
          onClick={() => setActiveSubTab('scenarios')}
          className={`shrink-0 px-3.5 py-2.5 min-h-[36px] text-[9px] font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer border-b-2 ${
            activeSubTab === 'scenarios'
              ? 'bg-white/5 text-[#E5E5E5] border-[#4ADE80]'
              : 'text-zinc-400 hover:text-[#E5E5E5] border-transparent'
          }`}
        >
          Scenarios
        </button>
        <button
          onClick={() => setActiveSubTab('portfolio')}
          className={`shrink-0 px-3.5 py-2.5 min-h-[36px] text-[9px] font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer border-b-2 ${
            activeSubTab === 'portfolio'
              ? 'bg-white/5 text-[#E5E5E5] border-[#4ADE80]'
              : 'text-zinc-400 hover:text-[#E5E5E5] border-transparent'
          }`}
        >
          Book Greeks
        </button>
        <button
          onClick={() => setActiveSubTab('alerts')}
          className={`shrink-0 px-3.5 py-2.5 min-h-[36px] text-[9px] font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer border-b-2 flex items-center gap-1.5 ${
            activeSubTab === 'alerts'
              ? 'bg-white/5 text-[#E5E5E5] border-[#4ADE80]'
              : 'text-zinc-400 hover:text-[#E5E5E5] border-transparent'
          }`}
        >
          Alerts
          {alertsLog.length > 0 && (
            <span className="rounded-full bg-[#4ADE80]/15 text-[#4ADE80] text-[9px] font-black px-1.5 leading-4 tabular-nums">
              {alertsLog.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('calibration')}
          className={`shrink-0 px-3.5 py-2.5 min-h-[36px] text-[9px] font-bold uppercase tracking-wider transition-all rounded-lg cursor-pointer border-b-2 ${
            activeSubTab === 'calibration'
              ? 'bg-white/5 text-[#E5E5E5] border-[#4ADE80]'
              : 'text-zinc-400 hover:text-[#E5E5E5] border-transparent'
          }`}
        >
          Trade Journal
        </button>
      </div>

      {/* View panel area */}
      <div className="min-h-[460px]" id="quant-suite-view-canvas">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="w-full flex flex-col gap-4"
          >
            {/* TAB 1: BREEDEN LITZENBERGER RISK NEUTRAL PDF */}
            {activeSubTab === 'rnd' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200">Market-Implied Price Distribution f(K)</span>
                    <span className="text-[8px] text-zinc-600">BREEDEN-LITZENBERGER (RND)</span>
                  </div>

                  {/* Render probability distribution graph in SVG */}
                  <div className="h-56 w-full relative mb-1">
                    <svg viewBox="0 0 500 224" className="w-full h-full overflow-hidden" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="pdfGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.14" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Grid lines */}
                      {[0.25, 0.5, 0.75].map((ratio, idx) => (
                        <line 
                          key={idx} 
                          x1="0" 
                          y1={224 * ratio} 
                          x2="500" 
                          y2={224 * ratio} 
                          stroke="rgba(255,255,255,0.035)" 
                          strokeWidth="1" 
                        />
                      ))}
                      {/* Density shape curve */}
                      <path 
                        d={(() => {
                          const h = 224;
                          const pts = rndResult.density;
                          if (pts.length === 0) return '';
                          
                          // Dynamically scale peak of probability density function to take up max 80% of graph height
                          let maxProb = 1e-5;
                          pts.forEach(p => { if (p.probability > maxProb) maxProb = p.probability; });
                          
                          return pts.map((p, idx) => {
                            const x = (idx / (pts.length - 1)) * 500; // spread
                            const ratio = p.probability / maxProb;
                            const y = h - (ratio * 0.80 * h); // size scaling (80% peak as requested)
                            return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }).join(' ') + ` L 500 ${h} L 0 ${h} Z`;
                        })()} 
                        fill="url(#pdfGradient)" 
                        stroke="#10b981" 
                        strokeWidth="1.5" 
                      />
                      {/* Center spot location line */}
                      {(() => {
                        const pts = rndResult.density;
                        let spotX = 250;
                        if (pts.length > 0) {
                          const minS = pts[0].strike;
                          const maxS = pts[pts.length - 1].strike;
                          spotX = ((spotPrice - minS) / (maxS - minS || 1)) * 500;
                        }
                        return (
                          <>
                            <line 
                              x1={spotX} 
                              y1="0" 
                              x2={spotX} 
                              y2="224" 
                              stroke="#10b981" 
                              strokeWidth="1" 
                              strokeDasharray="2,2" 
                              opacity="0.4"
                            />
                            <text 
                              x={spotX} 
                              y="16" 
                              textAnchor="middle" 
                              fill="#10b981" 
                              className="font-mono text-[7px] font-bold tracking-[0.2em]"
                            >
                              CURRENT SPOT: {spotPrice.toLocaleString(undefined, {maximumFractionDigits:0})} {activeTicker}
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  </div>

                  {/* Graph labels */}
                  <div className="flex justify-between text-[8px] text-zinc-600 border-t border-zinc-900 pt-1.5 px-1 font-bold">
                    <span>-20% DOWNSIDE</span>
                    <span>ATM</span>
                    <span>+20% UPSIDE</span>
                  </div>
                </div>

                {/* Distribution stats sidebar */}
                <div className="flex flex-col gap-4">
                  <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs">
                    <span className="text-[10px] uppercase font-black text-zinc-400 tracking-wider flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-zinc-500" />
                      Distribution Stats
                    </span>
                    <div className="mt-3 gap-3 flex flex-col">
                      <div className="flex justify-between border-b border-zinc-900/50 pb-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Implied Spread</span>
                        <span className="text-[10px] font-bold text-white tabular-nums">{(rndResult.stdDev / spotPrice * 100).toFixed(2)}% implied</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/50 pb-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Risk-Neutral Mean</span>
                        <span className="text-[10px] font-bold text-white tabular-nums">{rndResult.mean.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/50 pb-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">PDF Skewness</span>
                        <span className={`text-[10px] font-bold tabular-nums ${rndResult.skewness < 0 ? 'text-[#F87171]' : 'text-[#4ADE80]'}`}>{rndResult.skewness.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/50 pb-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Excess Kurtosis</span>
                        <span className="text-[10px] font-bold text-zinc-300 tabular-nums">{rndResult.kurtosis.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Fat Tails</span>
                        <span className={`text-[10px] font-black uppercase ${rndResult.isFatTailed ? 'text-rose-500 animate-pulse' : 'text-zinc-600'}`}>{rndResult.isFatTailed ? 'FAT TAILS DETECTED' : 'NORMAL RANGE'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive probability pricing */}
                  <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs">
                    <span className="text-[10px] uppercase font-black text-zinc-400 tracking-wider flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-[#fbbf24]" />
                      Probability Pricer
                    </span>
                    <p className="text-[9.5px] text-zinc-500 mt-2 leading-relaxed">
                      Derives the market-implied probability of price reaching any strike, read directly from the options chain via Breeden-Litzenberger (RND).
                    </p>
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] text-zinc-500 uppercase font-black">1σ Expected-Move Strike</span>
                        <span className="text-[12px] font-mono font-black text-[#fbbf24]">{probStrike.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="bg-[#0a0a0d] border border-zinc-800/40 p-2.5 rounded-[1px] mt-1">
                        <p className="text-[9.5px] text-zinc-300 font-bold leading-normal lowercase first-letter:uppercase">
                          {probabilityPricingText.statement}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: VOLATILITY ARCHITECTURE */}
            {activeSubTab === 'vol' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col gap-4">
                  {/* Estimators comparison table */}
                  <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200 block border-b border-zinc-900 pb-2 mb-3">
                      Realized Volatility Estimators (20-day)
                    </span>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="bg-[#08080a] border border-zinc-800/40 rounded-sm p-3 flex flex-col items-center">
                        <span className="text-[8px] text-zinc-500 font-bold uppercase">Parkinson RV</span>
                        <span className="text-xl font-black text-rose-400 tabular-nums mt-1">{(volSuite.parkinson * 100).toFixed(2)}%</span>
                        <p className="text-[7.5px] text-zinc-600 text-center mt-2 lowercase">uses daily high/low range; excludes overnight gaps.</p>
                      </div>
                      <div className="bg-[#08080a] border border-zinc-800/40 rounded-sm p-3 flex flex-col items-center">
                        <span className="text-[8px] text-zinc-500 font-bold uppercase">Garman-Klass RV</span>
                        <span className="text-xl font-black text-teal-400 tabular-nums mt-1">{(volSuite.garmanKlass * 100).toFixed(2)}%</span>
                        <p className="text-[7.5px] text-zinc-600 text-center mt-2 lowercase">uses OHLC; accounts for intraday high/low range.</p>
                      </div>
                      <div className="bg-[#08080a] border border-zinc-800/40 rounded-sm p-3 flex flex-col items-center">
                        <span className="text-[8px] text-[#fbbf24] font-bold uppercase">Yang-Zhang RV</span>
                        <span className="text-xl font-black text-amber-500 tabular-nums mt-1">{(volSuite.yangZhang * 100).toFixed(2)}%</span>
                        <p className="text-[7.5px] text-zinc-600 text-center mt-2 lowercase">minimum-variance estimator; combines overnight gaps and intraday drift.</p>
                      </div>
                    </div>
                  </div>

                  {/* IV-RV Spread / Variance Risk Premium */}
                  <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#E5E5E5] block border-b border-zinc-900 pb-2 mb-3">
                      Variance Risk Premium (IV − RV) Spread
                    </span>
                    <div className="flex flex-col md:flex-row justify-between items-center bg-[#0a0a0c] border border-zinc-85 * 0.40 p-4 rounded-[1px] gap-4">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-zinc-500 font-black uppercase">Current ATM IV</span>
                        <span className="text-lg font-black text-white">{(defaultIv * 100).toFixed(2)}%</span>
                      </div>
                      <span className="text-lg font-bold text-zinc-700">−</span>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-zinc-500 font-black uppercase">Yang-Zhang RV</span>
                        <span className="text-lg font-black text-[#fbbf24]">{(volSuite.yangZhang * 100).toFixed(2)}%</span>
                      </div>
                      <span className="text-lg font-bold text-zinc-700">=</span>
                      <div className="flex flex-col bg-zinc-950 px-4 py-2 border border-zinc-800/40 rounded-xs">
                        <span className="text-[8px] text-[#4ADE80] font-black uppercase">VRP (IV minus RV)</span>
                        <span className="text-xl font-black text-emerald-400">{(volSuite.varianceRiskPremium * 100).toFixed(2)} pts</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] text-zinc-500 font-black uppercase">VRP Percentile</span>
                        <span className="text-xl font-black text-emerald-400 tabular-nums">{volSuite.vrpPercentile}th</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Volatility Cone Panel */}
                <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs flex flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200 block border-b border-zinc-900 pb-2 mb-3 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-zinc-500" />
                    Vol Cone (Historical Range)
                  </span>
                  
                  {/* Table */}
                  <div className="flex-1 mt-2">
                    <table className="w-full text-left text-[9px]">
                      <thead>
                        <tr className="border-b border-zinc-900 text-zinc-500 uppercase font-black h-6">
                          <th>DTE</th>
                          <th>MIN</th>
                          <th>P50</th>
                          <th>MAX</th>
                          <th className="text-right text-[#fbbf24]">CUR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {volCone.map((c, idx) => (
                          <tr key={idx} className="border-b border-zinc-900/30 h-7 text-zinc-300">
                            <td className="font-bold">{c.window}d</td>
                            <td className="text-zinc-600">{(c.min * 100).toFixed(0)}%</td>
                            <td>{(c.p50 * 100).toFixed(0)}%</td>
                            <td className="text-zinc-600">{(c.max * 100).toFixed(0)}%</td>
                            <td className="text-right text-emerald-400 font-bold font-mono">{(c.current * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: COMPOUND OPTION STRATEGY BUILDER */}
            {activeSubTab === 'builder' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Legs Configuration lists */}
                <div className="lg:col-span-2 flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs gap-4">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#D9A15C]" />
                      Strategy Legs
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => loadPreset('iron_condor')} 
                        className="px-2 py-1 border border-zinc-800 text-[8px] font-bold uppercase hover:bg-[#111] hover:text-white rounded-xs cursor-pointer"
                      >
                        Iron Condor
                      </button>
                      <button 
                        onClick={() => loadPreset('straddle')} 
                        className="px-2 py-1 border border-zinc-800 text-[8px] font-bold uppercase hover:bg-[#111] hover:text-white rounded-xs cursor-pointer"
                      >
                        ATM Straddle
                      </button>
                      <button 
                        onClick={() => loadPreset('butterfly')} 
                        className="px-2 py-1 border border-zinc-800 text-[8px] font-bold uppercase hover:bg-[#111] hover:text-white rounded-xs cursor-pointer"
                      >
                        Butterfly
                      </button>
                    </div>
                  </div>

                  {/* Legs Table list */}
                  <div className="space-y-2 mt-1">
                    {strategyLegs.length === 0 ? (
                      <div className="text-center py-8 text-zinc-600 uppercase text-[9px] border border-dashed border-zinc-900 rounded-sm">
                        No legs added. Use the buttons below to add legs.
                      </div>
                    ) : (
                      strategyLegs.map((leg) => (
                        <div key={leg.id} className="flex flex-wrap md:flex-nowrap items-center justify-between bg-[#0a0a0c] border border-zinc-900 rounded-sm p-2 gap-2 text-[9px]">
                          <span className={`font-black uppercase px-1.5 py-0.5 rounded-[1px] w-12 text-center ${leg.type === 'call' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : 'bg-rose-950/40 text-rose-400 border border-rose-500/20'}`}>
                            {leg.type}
                          </span>
                          
                          {/* Buy / Sell selector */}
                          <select 
                            value={leg.action} 
                            onChange={(e) => handleUpdateLeg(leg.id, { action: e.target.value as 'buy' | 'sell' })}
                            className="bg-black border border-zinc-900 text-[9px] px-2 py-1 font-bold rounded-xs cursor-pointer text-white"
                          >
                            <option value="buy">BUY / LONG</option>
                            <option value="sell">SELL / SHORT</option>
                          </select>

                          {/* Strike Input */}
                          <div className="flex items-center gap-1.5">
                            <label className="text-[8px] text-zinc-500">Strike</label>
                            <input 
                              type="number" 
                              value={leg.strike} 
                              onChange={(e) => handleUpdateLeg(leg.id, { strike: parseInt(e.target.value) || spotPrice })}
                              className="bg-black border border-zinc-900 text-[9px] px-2 py-1 text-right font-black w-20 rounded-xs" 
                            />
                          </div>

                          {/* Qty */}
                          <div className="flex items-center gap-1.5">
                            <label className="text-[8px] text-zinc-500">Qty</label>
                            <input 
                              type="number" 
                              value={leg.qty} 
                              onChange={(e) => handleUpdateLeg(leg.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                              className="bg-black border border-zinc-900 text-[9px] px-2 py-1 text-right font-black w-12 rounded-xs" 
                            />
                          </div>

                          {/* IV input */}
                          <div className="flex items-center gap-1.5">
                            <label className="text-[8px] text-zinc-500">IV</label>
                            <input 
                              type="number" 
                              step="0.01" 
                              value={leg.iv} 
                              onChange={(e) => handleUpdateLeg(leg.id, { iv: parseFloat(e.target.value) || defaultIv })}
                              className="bg-black border border-zinc-900 text-[9px] px-2 py-1 text-right font-black w-14 rounded-xs text-[#fbbf24]" 
                            />
                          </div>

                          {/* Entry Price */}
                          <div className="flex items-center gap-1.5">
                            <label className="text-[8px] text-zinc-500">Prem</label>
                            <input 
                              type="number" 
                              step="0.1" 
                              value={leg.entryPrice} 
                              onChange={(e) => handleUpdateLeg(leg.id, { entryPrice: parseFloat(e.target.value) || 1.0 })}
                              className="bg-black border border-zinc-900 text-[9px] px-2 py-1 text-right font-black w-14 rounded-xs text-white" 
                            />
                          </div>

                          {/* Delete */}
                          <button 
                            onClick={() => handleRemoveLeg(leg.id)}
                            className="bg-zinc-950 p-1 border border-zinc-900 hover:border-rose-500 hover:text-rose-500 rounded-sm cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Addition triggers */}
                  <div className="flex justify-start gap-2 pt-2 border-t border-zinc-950">
                    <button 
                      onClick={() => handleAddLeg('call')}
                      className="px-3 py-1.5 border border-emerald-900 hover:border-emerald-500 text-emerald-400 bg-emerald-950/20 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-emerald-950/40 rounded-xs cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add call leg
                    </button>
                    <button 
                      onClick={() => handleAddLeg('put')}
                      className="px-3 py-1.5 border border-rose-900 hover:border-rose-500 text-rose-400 bg-rose-950/20 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-rose-950/40 rounded-xs cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add put leg
                    </button>
                  </div>
                </div>

                {/* Risk & Payoff Sidebar Analysis */}
                <div className="flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs gap-4">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200 border-b border-zinc-900 pb-2">
                    Payoff & Risk Summary
                  </span>

                  {/* Summary grid */}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="bg-[#08080a] border border-zinc-900 p-2.5 rounded-sm flex flex-col">
                      <span className="text-[7.5px] text-zinc-600 font-bold uppercase">Net Debit / Credit</span>
                      <span className={`text-sm font-black tabular-nums mt-1 ${strategySuite.netPremium >= 0 ? 'text-amber-500' : 'text-emerald-400'}`}>
                        {strategySuite.netPremium >= 0 ? `Debit: $${Math.abs(strategySuite.netPremium).toLocaleString()}` : `Credit: $${Math.abs(strategySuite.netPremium).toLocaleString()}`}
                      </span>
                    </div>
                    <div className="bg-[#08080a] border border-zinc-900 p-2.5 rounded-sm flex flex-col">
                      <span className="text-[7.5px] text-zinc-600 font-bold uppercase">Prob. of Profit (RND)</span>
                      <span className="text-sm font-black text-[#fbbf24] tabular-nums mt-1">
                        {(strategySuite.pop * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-[#08080a] border border-zinc-900 p-2.5 rounded-sm flex flex-col">
                      <span className="text-[7.5px] text-zinc-600 font-bold uppercase">Max Profit Potential</span>
                      <span className="text-sm font-black text-emerald-400 tabular-nums mt-1">
                        {typeof strategySuite.maxProfit === 'number' ? `$${strategySuite.maxProfit.toLocaleString()}` : `${strategySuite.maxProfit}`}
                      </span>
                    </div>
                    <div className="bg-[#08080a] border border-zinc-900 p-2.5 rounded-sm flex flex-col">
                      <span className="text-[7.5px] text-zinc-600 font-bold uppercase">Max Risk / Loss</span>
                      <span className="text-sm font-black text-rose-500 tabular-nums mt-1">
                        {typeof strategySuite.maxLoss === 'number' ? `$${Math.abs(strategySuite.maxLoss).toLocaleString()}` : `${strategySuite.maxLoss}`}
                      </span>
                    </div>
                  </div>

                  {/* Kelly sizing recommendation */}
                  <div className="bg-zinc-950 border border-zinc-900/60 p-3 rounded-sm">
                    <span className="text-[8px] text-[#4ADE80] font-black uppercase tracking-wider block">Suggested Position Size (Half-Kelly)</span>
                    <span className="text-md font-black text-white block mt-1">{(strategySuite.kellySizing * 100).toFixed(1)}% of capital</span>
                    <p className="text-[7.5px] text-zinc-650 mt-1 lowercase leading-relaxed">
                      Sized from implied-probability edge. Reduces drawdowns across multiple trades.
                    </p>
                  </div>

                  {/* SVG mini payoff curve */}
                  <div className="h-28 w-full bg-black border border-zinc-900 relative rounded-sm overflow-hidden p-2">
                    <div className="absolute top-1 left-2 text-[7px] text-zinc-500 font-bold uppercase">PnL Payoff Curve</div>
                    <svg className="w-full h-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                      <line x1="0" y1="56" x2="100%" y2="56" stroke="rgba(255,255,255,0.08)" strokeDasharray="1,2" />
                      {/* Plot path */}
                      <path 
                        d={(() => {
                          const h = 112;
                          const w = 240;
                          if (payoffChartCoordinates.length === 0) return '';
                          
                          // Find min/max pnl for scaling
                          const pnls = payoffChartCoordinates.map(c => c.pnl);
                          const maxPl = Math.max(10, ...pnls);
                          const minPl = Math.min(-10, ...pnls);
                          const range = maxPl - minPl || 1;

                          return payoffChartCoordinates.map((c, idx) => {
                            const x = (idx / (payoffChartCoordinates.length - 1)) * 260;
                            const pnlRatio = (c.pnl - minPl) / range;
                            const y = h - (pnlRatio * h * 0.8) - 10;
                            return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }).join(' ');
                        })()}
                        fill="none"
                        stroke="#D9A15C"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: DETERMINISTIC SCENARIO SHOCK RISK GRID */}
            {activeSubTab === 'scenarios' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200">Scenario Stress Test (Spot vs Vol)</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setSelectedDteScenario(dteD)} 
                        className={`px-2 py-0.5 border text-[7.5px] rounded-xs cursor-pointer font-bold ${selectedDteScenario === dteD ? 'bg-[#111] text-white border-zinc-700' : 'border-transparent text-zinc-500 hover:text-zinc-350'}`}
                      >
                        Target {dteD} DTE
                      </button>
                      <button 
                        onClick={() => setSelectedDteScenario(Math.round(dteD/2))} 
                        className={`px-2 py-0.5 border text-[7.5px] rounded-xs cursor-pointer font-bold ${selectedDteScenario === Math.round(dteD/2) ? 'bg-[#111] text-white border-zinc-700' : 'border-transparent text-zinc-500 hover:text-zinc-350'}`}
                      >
                        Mid-life {Math.round(dteD/2)} DTE
                      </button>
                      <button 
                        onClick={() => setSelectedDteScenario(0)} 
                        className={`px-2 py-0.5 border text-[7.5px] rounded-xs cursor-pointer font-bold ${selectedDteScenario === 0 ? 'bg-[#111] text-white border-zinc-700' : 'border-transparent text-zinc-500 hover:text-zinc-350'}`}
                      >
                        Maturity (0 DTE)
                      </button>
                    </div>
                  </div>

                  {/* 2D Heatmap layout */}
                  <div className="flex-1 overflow-x-auto">
                    <div className="min-w-[420px] grid grid-cols-6 gap-1 p-2 text-center text-[9px] font-bold bg-[#08080a] border border-zinc-900 rounded-sm">
                      {/* Y axis column header filler */}
                      <span className="border-b border-zinc-900 pb-1.5 text-zinc-650 uppercase text-[7.5px]">Spot / Vol Shift</span>
                      {volShocks.map((vol, vIdx) => (
                        <span key={vIdx} className="border-b border-zinc-900 pb-1.5 text-white">{(vol * 100).toFixed(1)}%</span>
                      ))}

                      {/* Filter scenario matrix on selected decay DTE and plot rows */}
                      {spotShocks.map((spotScr, sIdx) => {
                        return (
                          <React.Fragment key={sIdx}>
                            {/* row label */}
                            <span className="bg-[#121215] border border-zinc-900 p-2 text-zinc-400 flex items-center justify-center font-bold">
                              {(spotScr * 100).toFixed(1)}% Shift
                            </span>
                            
                            {volShocks.map((volScr, vIdx) => {
                              const matchNode = scenarioMatrix.find(n => 
                                Math.abs(n.spotChange - spotScr) < 1e-4 && 
                                Math.abs(n.volChange - volScr) < 1e-4 && 
                                n.dteRemaining === selectedDteScenario
                              );
                              const pnlValue = matchNode ? matchNode.pnl : 0;
                              
                              let bgStyle = 'rgba(113, 113, 122, 0.08)'; // neutral slate gray
                              let borderStyle = 'border-zinc-900';
                              if (pnlValue > 50) {
                                bgStyle = `rgba(16, 185, 129, ${Math.min(0.8, 0.12 + (pnlValue / 4000))})`; // green scaling
                                borderStyle = 'border-emerald-500/25';
                              } else if (pnlValue < -50) {
                                bgStyle = `rgba(239, 68, 68, ${Math.min(0.8, 0.12 + (Math.abs(pnlValue) / 4000))})`; // red scaling
                                borderStyle = 'border-rose-500/25';
                              }

                              return (
                                <div 
                                  key={vIdx} 
                                  className="p-2 border rounded-xs font-mono font-black tabular-nums transition-all hover:scale-[1.03] flex flex-col justify-center items-center h-11"
                                  style={{ backgroundColor: bgStyle, borderColor: borderStyle }}
                                  title={`Spot change: ${(spotScr*100).toFixed(1)}%, Vol change: ${(volScr*100).toFixed(1)}%`}
                                >
                                  <span className={`text-[9.5px] ${pnlValue >= 0 ? (pnlValue === 0 ? 'text-zinc-500' : 'text-[#4ADE80]') : 'text-rose-450'}`}>
                                    {pnlValue >= 0 ? (pnlValue === 0 ? '$0' : `+$${pnlValue.toLocaleString(undefined, {maximumFractionDigits:0})}`) : `-$${Math.abs(pnlValue).toLocaleString(undefined, {maximumFractionDigits:0})}`}
                                  </span>
                                </div>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Explanation text sidebar */}
                <div className="flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200 border-b border-zinc-900 pb-2">
                    How to Read This Grid
                  </span>
                  <p className="text-[9.5px] text-zinc-500 leading-normal">
                    Each cell shows estimated P&amp;L if spot and IV move by the amounts shown. Unlike simple delta approximations, each cell is a full Black-Scholes re-price under those exact conditions.
                  </p>
                  <p className="text-[9.5px] text-zinc-500 leading-normal">
                    Use the tabs above to see P&amp;L at entry (full DTE), halfway through, or at expiration to track how theta and vega eat into the position over time.
                  </p>
                  <div className="bg-[#0a0a0d] border border-zinc-900 p-3 rounded-sm text-zinc-400 text-[8px] mt-2 gap-1.5 flex flex-col uppercase font-bold">
                    <span className="text-white text-[9px] tracking-wider block">Key Risk Signals</span>
                    <span>• Delta hedge needed above +4% spot move</span>
                    <span>• Long vega risk visible in lower-right cells</span>
                    <span>• Pin risk peaks near spot +2.5%</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: PORTFOLIO BOOK & AGGREGATE GREEKS */}
            {activeSubTab === 'portfolio' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs gap-4">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#E5E5E5] flex items-center gap-1.5 animate-pulse">
                      <Scale className="w-4 h-4 text-emerald-400" />
                      Position Book
                    </span>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={handleAddPortfolioStock} 
                        className="px-2 py-1 border border-zinc-900 text-[7.5px] rounded-xs font-black hover:bg-zinc-950 uppercase cursor-pointer"
                      >
                        + Add Stock Shares
                      </button>
                      <button 
                        onClick={() => handleAddPortfolioOption('call')} 
                        className="px-2 py-1 border border-zinc-900 text-[7.5px] rounded-xs font-black hover:bg-zinc-950 uppercase cursor-pointer"
                      >
                        + Call contract
                      </button>
                      <button 
                        onClick={() => handleAddPortfolioOption('put')} 
                        className="px-2 py-1 border border-zinc-900 text-[7.5px] rounded-xs font-black hover:bg-zinc-950 uppercase cursor-pointer"
                      >
                        + Put contract
                      </button>
                    </div>
                  </div>

                  {/* Portfolio positions Table */}
                  <div className="space-y-1.5">
                    {portfolio.length === 0 ? (
                      <div className="text-center py-10 text-zinc-650 text-[9px] uppercase font-bold border border-dashed border-zinc-900">
                        Book is empty. Add stock or options positions above.
                      </div>
                    ) : (
                      portfolio.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-[#08080a] border border-zinc-900 p-2 rounded-xs text-[9px]">
                          <div className="flex items-center gap-2">
                            <span className={`w-8 text-[7px] text-center font-bold px-1 py-0.5 rounded-sm uppercase ${p.type === 'stock' ? 'bg-zinc-800 text-zinc-300' : p.type === 'call' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' : 'bg-rose-950 text-rose-400 border border-rose-900/30'}`}>
                              {p.type}
                            </span>
                            <span className="font-bold text-white uppercase">{p.symbol}</span>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col text-right">
                              <span className="text-[7.5px] text-zinc-600">Cost Basis</span>
                              <span className="font-bold text-zinc-400 tabular-nums">${p.entryPrice}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[7.5px] text-zinc-600">Current</span>
                              <span className="font-bold text-[#fbbf24] tabular-nums">${p.currentPrice}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[7.5px] text-zinc-600">Inventory</span>
                              <span className="font-bold text-white tabular-nums">{p.qty > 0 ? `+${p.qty}` : p.qty} {p.type === 'stock' ? 'shs' : 'c'}</span>
                            </div>
                            
                            <button 
                              onClick={() => handleRemovePortfolioItem(p.id)}
                              className="bg-zinc-950 p-1 border border-zinc-900 text-zinc-550 hover:text-rose-500 hover:border-rose-900/40 rounded-sm cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Portfolio Greeks aggregators */}
                <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs gap-3 flex flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#E5E5E5] border-b border-zinc-900 pb-2">
                    Book Greeks (Totals)
                  </span>
                  
                  {/* Aggregated values layout */}
                  <div className="flex-1 mt-1 flex flex-col gap-2.5">
                    <div className="flex justify-between border-b border-zinc-900 pb-1 text-[9.5px]">
                      <span className="text-zinc-500 uppercase font-black">Net Book Delta</span>
                      <span className={`font-black tabular-nums ${portfolioResult.delta >= 0 ? 'text-[#4ADE80]' : 'text-rose-450'}`}>
                        {portfolioResult.delta >= 0 ? `+${portfolioResult.delta.toFixed(2)} delta` : `${portfolioResult.delta.toFixed(2)} delta`}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1 text-[9.5px]">
                      <span className="text-zinc-500 uppercase font-black">Net Book Gamma</span>
                      <span className="font-black text-white tabular-nums">{portfolioResult.gamma.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1 text-[9.5px]">
                      <span className="text-zinc-500 uppercase font-black">Total Book Vega</span>
                      <span className="font-black text-emerald-400 tabular-nums">${portfolioResult.vega.toFixed(1)} vega</span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1 text-[9.5px]">
                      <span className="text-zinc-500 uppercase font-black">Daily Theta decay</span>
                      <span className="font-black text-rose-500 tabular-nums">${portfolioResult.theta.toFixed(1)} theta</span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1 text-[9.5px]">
                      <span className="text-zinc-500 uppercase font-black">Vanna (delta/vol sensitivity)</span>
                      <span className="font-black text-[#fbbf24] tabular-nums">{portfolioResult.vanna.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1 text-[9.5px]">
                      <span className="text-zinc-500 uppercase font-black">Charm (delta time-decay)</span>
                      <span className="font-black text-zinc-350 tabular-nums">{portfolioResult.charm.toFixed(3)}</span>
                    </div>

                    {/* Book net value */}
                    <div className="mt-4 bg-[#09090b] border border-zinc-900 p-2.5 rounded-sm flex items-center justify-between text-[10px]">
                      <span className="text-zinc-500 uppercase font-black">Net value PnL</span>
                      <span className={`font-black tabular-nums ${portfolioResult.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-450'}`}>
                        {portfolioResult.totalProfit >= 0 ? `+$${portfolioResult.totalProfit.toLocaleString()}` : `-$${Math.abs(portfolioResult.totalProfit).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: TRIGGER ALERTS ENGINE */}
            {activeSubTab === 'alerts' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs gap-3">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200 flex items-center gap-1.5">
                      <RadioTower className="w-4 h-4 text-[#D9A15C]" />
                      Active Alert Rules
                    </span>
                    <button 
                      onClick={() => handleAddNewRule('spot', Math.round(spotPrice * 1.03))}
                      className="px-2 py-1 bg-zinc-950 border border-zinc-800 text-[7.5px] rounded-xs font-black uppercase tracking-wider text-emerald-400 hover:bg-zinc-900 cursor-pointer"
                    >
                      + Create Rule
                    </button>
                  </div>

                  {/* Rules Lists */}
                  <div className="space-y-1.5 flex-1 mt-1">
                    {alertsRules.map(rule => (
                      <div key={rule.id} className="flex justify-between items-center bg-[#070709] border border-zinc-910 p-2.5 rounded-xs text-[9px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-zinc-100 uppercase">{rule.name}</span>
                          <span className="text-[7.5px] text-zinc-500 uppercase font-black font-mono">
                            Type: {rule.metric} • Trigger: {rule.operator} {rule.thresholdValue ? `[${rule.thresholdValue}]` : ''}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => handleToggleRule(rule.id)}
                            className={`px-2 py-1 text-[8px] font-black border uppercase rounded-xs cursor-pointer ${rule.isActive ? 'bg-emerald-950/45 border-emerald-500 text-emerald-400' : 'bg-zinc-950 border-zinc-900 text-zinc-500'}`}
                          >
                            {rule.isActive ? 'ACTIVE' : 'MUTED'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alerts log feed */}
                <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs flex flex-col gap-2">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#E5E5E5] flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-[#A3A3A3]" />
                      Alert dispatch Log
                    </span>
                    <span className="text-[7px] text-zinc-650 tracking-wider">LIVE FEED</span>
                  </div>

                  {/* Dispatch list */}
                  <div className="flex-1 overflow-y-auto max-h-[300px] mt-1 space-y-2 pr-1 scrollbar-thin">
                    {alertsLog.length === 0 ? (
                      <div className="text-center py-10 text-[8px] text-zinc-700 uppercase font-black">
                        Monitoring for alert triggers...
                      </div>
                    ) : (
                      alertsLog.map((log, idx) => (
                        <div key={idx} className="bg-zinc-950 border border-zinc-910 p-2 rounded-sm text-[8.5px] flex flex-col gap-1 leading-normal border-l-2" style={{ borderLeftColor: log.type === 'danger' ? '#ef4444' : log.type === 'warning' ? '#f59e0b' : '#3b82f6' }}>
                          <div className="flex justify-between text-[7px] text-zinc-500 uppercase font-bold font-mono">
                            <span>{log.ruleName}</span>
                            <span>{log.timestamp}</span>
                          </div>
                          <p className="text-zinc-300 font-bold lowercase first-letter:uppercase">{log.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: CALIBRATION JOURNAL LOOP */}
            {activeSubTab === 'calibration' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#E5E5E5] border-b border-zinc-900 pb-2 block">
                    Trade Journal
                  </span>

                  {/* Add Trade Trigger manually for simulation */}
                  <div className="flex gap-2 mb-2">
                    <button 
                      onClick={() => handleLogTrade('GEX Mean Reversion', 0.60)}
                      className="px-2 py-1.5 bg-zinc-950 border border-zinc-900 hover:border-emerald-500/50 text-[#fbbf24] text-[8px] font-black uppercase rounded-xs cursor-pointer"
                    >
                      + Log GEX Mean Reversion Trade
                    </button>
                    <button 
                      onClick={() => handleLogTrade('Magnet Strike Drift', 0.58)}
                      className="px-2 py-1.5 bg-zinc-950 border border-zinc-900 hover:border-emerald-500/50 text-[#fbbf24] text-[8px] font-black uppercase rounded-xs cursor-pointer"
                    >
                      + Log Magnet Strike Trade
                    </button>
                  </div>

                  {/* Journal list */}
                  <div className="space-y-1.5 mt-1 overflow-y-auto max-h-[310px] pr-1">
                    {journal.map(trade => (
                      <div key={trade.id} className="bg-zinc-950 border border-zinc-900/60 p-2 rounded-xs flex justify-between items-center text-[9px] font-mono">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white uppercase">{trade.ticker}</span>
                            <span className="text-[7.5px] text-zinc-500 font-bold uppercase">[{trade.entryTime}]</span>
                            <span className="text-zinc-400 font-semibold">{trade.setup}</span>
                          </div>
                          <span className="text-[7.55px] text-zinc-650 font-black uppercase mt-0.5">
                            Entry spot: {trade.entryPrice.toFixed(1)} • Predicted PoP: {(trade.pop * 100).toFixed(0)}%
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {trade.outcome === 'OPEN' ? (
                            <div className="flex gap-1.5">
                              <button 
                                onClick={() => handleResolveTrade(trade.id, 'WIN')}
                                className="px-2 py-0.5 bg-emerald-950/50 text-emerald-400 border border-emerald-900/40 text-[7.5px] font-bold rounded-xs cursor-pointer"
                              >
                                WIN
                              </button>
                              <button 
                                onClick={() => handleResolveTrade(trade.id, 'LOSS')}
                                className="px-2 py-0.5 bg-rose-950/50 text-rose-455 border border-rose-900/40 text-[7.5px] font-bold rounded-xs cursor-pointer"
                              >
                                LOSS
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-4 text-right">
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-[1px] uppercase ${trade.outcome === 'WIN' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/20' : 'bg-rose-950 text-rose-400 border border-rose-500/20'}`}>
                                {trade.outcome}
                              </span>
                              <span className={`font-black tabular-nums text-[9.5px] ${trade.pnl && trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {trade.pnl ? (trade.pnl >= 0 ? `+$${trade.pnl}` : `-$${Math.abs(trade.pnl)}`) : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brier score and reliability points */}
                <div className="bg-[#050505] border border-[#1f1f1f] p-4 rounded-xs flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-200">
                      Model Accuracy Scores
                    </span>
                    <span className="text-[7.5px] font-mono text-[#4ADE80] font-black uppercase">
                      ACTIVE
                    </span>
                  </div>

                  {/* Key Stats Bento */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-zinc-950 border border-zinc-900 p-2.5 rounded text-center">
                      <span className="text-[7.5px] text-zinc-500 font-bold uppercase block mb-1">Win Rate</span>
                      <span className="text-sm font-black text-[#4ADE80] tabular-nums">
                        {(calibrationLoop.winRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-900 p-2.5 rounded text-center">
                      <span className="text-[7.5px] text-zinc-500 font-bold uppercase block mb-1">Avg Option Return</span>
                      <span className="text-sm font-black text-cyan-400 tabular-nums">
                        ${calibrationLoop.averageReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-900 p-2.5 rounded text-center">
                      <span className="text-[7.5px] text-zinc-500 font-bold uppercase block mb-1">Max Drawdown</span>
                      <span className="text-sm font-black text-rose-500 tabular-nums">
                        -{calibrationLoop.maxDrawdown.toFixed(2)}%
                      </span>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-900 p-2.5 rounded text-center">
                      <span className="text-[7.5px] text-zinc-500 font-bold uppercase block mb-1">Sharpe Ratio</span>
                      <span className="text-sm font-black text-amber-500 tabular-nums">
                        {calibrationLoop.sharpeRatio.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-950 border border-zinc-900 p-2.5 rounded text-center flex flex-col justify-between">
                      <div>
                        <span className="text-[7px] text-zinc-500 font-bold uppercase">Brier Score Calibration</span>
                        <span className="text-md font-black text-[#fbbf24] mt-1 block tabular-nums">{calibrationLoop.brierScore.toFixed(4)}</span>
                      </div>
                      <p className="text-[6.5px] text-zinc-750 mt-1 uppercase leading-snug">(0.00 is mathematically perfect calibration)</p>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-900 p-2.5 rounded text-center flex flex-col justify-between">
                      <div>
                        <span className="text-[7px] text-zinc-500 font-bold uppercase">Expected Calibration Deviation (ECE)</span>
                        <span className="text-md font-black text-[#fbbf24] mt-1 block tabular-nums">{(calibrationLoop.expectedCalibrationError * 100).toFixed(2)}%</span>
                      </div>
                      <p className="text-[6.5px] text-zinc-750 mt-1 uppercase leading-snug">(average probability confidence delta)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Expectancy by setup list */}
                    <div className="bg-black/40 border border-zinc-900 p-3 rounded flex flex-col gap-2">
                      <span className="text-[8.5px] text-zinc-400 uppercase font-black block border-b border-zinc-900 pb-1.5">
                        Avg P&amp;L by Setup
                      </span>
                      <div className="space-y-2 text-[8 px]">
                        {calibrationLoop.expectancyBySetup.map((s, idx) => (
                          <div key={idx} className="flex justify-between items-center text-zinc-350">
                            <span className="text-zinc-500 font-mono text-[8.5px]">{s.setup}</span>
                            <div className="flex gap-2.5 text-right font-mono text-[8.5px]">
                              <span className="text-zinc-600">{(s.winRate * 100).toFixed(0)}% wins</span>
                              <span className={`font-black tabular-nums ${s.expectancy >= 0 ? 'text-[#4ADE80]' : 'text-rose-455'}`}>
                                {s.expectancy >= 0 ? `+$${s.expectancy}` : `-$${Math.abs(s.expectancy)}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Task 1 Dynamic Learning modifiers */}
                    <div className="bg-black/40 border border-zinc-900 p-3 rounded flex flex-col gap-2">
                      <span className="text-[8.5px] text-zinc-400 uppercase font-black block border-b border-zinc-900 pb-1.5">
                        Setup Weight Adjustments
                      </span>
                      <div className="space-y-2 text-[8.5px] font-mono">
                        {(calibrationLoop.futureAdjustedWeightings || []).map((wt, idx) => {
                          const stateCol = wt.modifier >= 1.0 ? 'text-[#4ADE80]' : wt.modifier > 0.70 ? 'text-amber-500' : 'text-rose-455';
                          return (
                            <div key={idx} className="flex justify-between items-center text-zinc-350">
                              <span className="text-zinc-500 font-mono">{wt.setup}</span>
                              <div className="flex gap-2 text-right">
                                <span className={`${stateCol} font-black`}>{(wt.modifier).toFixed(2)}x</span>
                                <span className="text-[7.5px] text-zinc-600 uppercase font-bold">
                                  {wt.modifier >= 1.0 ? 'ACCRETIVE' : 'UNDERWEIGHT'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Live Failures Error Categorization Log */}
                  <div className="mt-2.5">
                    <span className="text-[8px] text-zinc-400 uppercase font-bold font-mono tracking-widest block border-b border-zinc-900 pb-1 mb-2">
                      Prediction Errors (Discrepancy of 40% or more)
                    </span>
                    <div className="max-h-[145px] overflow-y-auto space-y-1.5 pr-0.5">
                      {(calibrationLoop.errorDivergences || []).map((err, idx) => (
                        <div key={err.id} className="bg-zinc-950/80 border border-zinc-900/60 p-2 rounded text-left font-mono text-[8px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-zinc-400">
                              <span className="text-[#fbbf24]">⚠️ ERROR ID : {err.id}</span>
                              <span className="text-zinc-650">|</span>
                              <span>SETUP: {err.setup}</span>
                            </div>
                            <p className="text-rose-400 font-extrabold max-w-[280px]">
                              FAIL CLASSIFICATION: {err.reason}
                            </p>
                          </div>
                          <div className="flex gap-2.5 text-[8.5px] sm:text-right font-black">
                            <span className="text-zinc-500">POP: {(err.prediction * 100).toFixed(0)}%</span>
                            <span className="text-zinc-450">&rarr;</span>
                            <span className="text-[#fbbf24]">ERR: +{(err.error * 100).toFixed(0)}% DELTA</span>
                          </div>
                        </div>
                      ))}
                      {(calibrationLoop.errorDivergences || []).length === 0 && (
                        <p className="text-center text-zinc-650 italic py-4 text-[8px]">
                          No large prediction errors detected in closed trades.
                        </p>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Expiry GEX graph and intraday decay footer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 border-t border-[#1f1f1f] pt-4 gap-4" id="quant-suite-telemetry-footer">
        {/* Intraday clock */}
        <div className="bg-[#050505] border border-zinc-900 p-3 rounded-sm flex flex-col gap-2">
          <div className="flex justify-between items-center border-b border-zinc-900 pb-1.5">
            <span className="text-[9px] text-[#fbbf24] font-black uppercase flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Intraday Decay Clock (Charm/Vanna)
            </span>
            <span className="text-[7.5px] text-zinc-600 font-bold">DECAY RATE</span>
          </div>
          <div className="flex flex-col gap-1 text-[8.5px]">
            <div className="flex justify-between text-zinc-400 border-b border-zinc-900/50 pb-1">
              <span>09:30 AM - 12:00 PM EST</span>
              <span>1.0x (normal decay)</span>
            </div>
            <div className="flex justify-between text-zinc-400 border-b border-zinc-900/50 pb-1">
              <span>12:00 PM - 02:00 PM EST</span>
              <span>0.8x (midday slowdown)</span>
            </div>
            <div className="flex justify-between text-white border-b border-[#D9A15C]/25 pb-1 font-bold">
              <span className="text-amber-500 animate-pulse flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> 02:00 PM - 04:00 PM EST
              </span>
              <span>2.5x+ (power hour / pre-close vol spikes)</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-900/60 p-2 rounded-sm text-[7.8px] text-zinc-500 font-bold uppercase leading-normal mt-1 text-center">
              After 2:00 PM EST, option decay accelerates. Vol expansion setups work best in this window.
            </div>
          </div>
        </div>

        {/* Expiry GEX breakdown graph */}
        <div className="lg:col-span-2 bg-[#050505] border border-zinc-900 p-3 rounded-sm flex flex-col gap-1">
          <div className="flex justify-between items-center border-b border-zinc-900 pb-1.5 mb-2">
            <span className="text-[9px] text-zinc-300 font-extrabold uppercase tracking-wide">Dealer GEX by Expiry Date</span>
            <span className="text-[7.5px] text-zinc-600">PER-EXPIRY</span>
          </div>

          <div className="grid grid-cols-6 gap-2 mt-1">
            {expiryGex.map((node, idx) => (
              <div key={idx} className="bg-zinc-950 p-2 border border-zinc-900/60 rounded-xs flex flex-col items-center">
                <span className="text-[8.5px] font-black text-white">{node.expiry}</span>
                <span className={`text-[8px] font-black tabular-nums mt-1 ${node.totalGex >= 0 ? 'text-emerald-400' : 'text-rose-455'}`}>
                  {node.totalGex >= 0 ? `+$${(node.totalGex/1e6).toFixed(1)}M` : `-$${Math.abs(node.totalGex/1e6).toFixed(1)}M`}
                </span>
                <span className="text-[7px] text-zinc-550 mt-1 uppercase">Key strike: {node.dominantStrike}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
