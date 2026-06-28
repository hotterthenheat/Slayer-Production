import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useContractStore, ContractState } from '../lib/store';
import { InteractiveChart } from './InteractiveChart';
import { StrikeGravityPanel } from './StrikeGravityPanel';
import { TradePlanCard } from './TradePlanCard';
import { ASSET_LIST, optionExpiryLabel } from '../data';
import { Zap, FileText, CheckCircle2, Maximize2, Minimize2, Layers, Target, Activity } from 'lucide-react';
import { DiscoveryView } from './DiscoveryView';
import { SkyVisionV2Panel } from './SkyVisionV2Panel';
import { AssetSparkline } from './AssetSparkline';
// Pure, client-safe math (no server-only deps): shared Black-Scholes greeks used
// as a clearly-labelled MODEL fallback when the premium-gated server option_chain
// is unavailable. `ChainContract` mirrors the server's per-strike chain shape.
import { calculateAnalyticGreeks, type ChainContract } from '../lib/v11Math';

// OptionCard Component for selection - strictly no Delta/Gamma clutter (Bug #4, Bug #7)
// Hoisted to module scope so its identity is stable across renders (prevents remounting
// every card and resetting their internal tickDirection state on each parent re-render).
interface OptionCardProps {
  strikeLabel: string;
  health: number;
  move: number;
  price: number;
  action: string;
  isSelected: boolean;
  isCall: boolean;
  onClick: () => void;
  key?: string;
}
function OptionCard({ strikeLabel, health, move, price, action, isSelected, isCall, onClick }: OptionCardProps) {
  const actionColor = action === 'ENTER' ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10' : action === 'SELL' ? 'text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10' : 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-2)]';
  const momentum = health > 85 ? 'STRENGTHENING' : health < 60 ? 'WEAKENING' : 'NEUTRAL';

  const [tickDirection, setTickDirection] = React.useState<'up' | 'down' | null>(null);
  const prevPriceRef = React.useRef<number>(price);

  React.useEffect(() => {
    if (price !== prevPriceRef.current) {
      const direction = price > prevPriceRef.current ? 'up' : 'down';
      setTickDirection(direction);
      prevPriceRef.current = price;
      const timer = setTimeout(() => {
        setTickDirection(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [price]);

  let cardBgClass = '';

  if (isSelected) {
    cardBgClass = isCall
      ? 'bg-[var(--surface-3)] border-[var(--success)]/60 text-[var(--text-primary)]'
      : 'bg-[var(--surface-3)] border-[var(--danger)]/60 text-[var(--text-primary)]';
  } else {
    cardBgClass = 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[var(--text-tertiary)]';
  }

  const tickClass = tickDirection === 'up' ? 'tick-up' : tickDirection === 'down' ? 'tick-down' : '';

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`p-3 border rounded-lg cursor-pointer transition-colors flex flex-col gap-2 text-left ${cardBgClass}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 text-left">
          <span className="text-[13px] font-black font-sans text-[var(--text-primary)]">{strikeLabel}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">HEALTH {health}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className={`text-xs font-black font-mono text-[var(--text-primary)] tabular-nums ${tickClass}`}>
              ${price.toFixed(2)}
            </span>
            <span className={`font-bold font-mono text-[10px] tabular-nums ${isCall ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              +{move}%
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest border uppercase shrink-0 ${actionColor}`}>
            {action}
          </span>
        </div>
      </div>
      <div className="flex pt-2 border-t border-[var(--border)] justify-between items-center">
         <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-mono">Momentum</span>
         <span className={`text-[10px] font-black uppercase ${momentum === 'STRENGTHENING' ? 'text-[var(--success)]' : momentum === 'WEAKENING' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>{momentum}</span>
      </div>
    </motion.div>
  );
}

export function SkyVisionView() {
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const selectedOptionType = useContractStore(s => s.selectedOptionType);
  const selectedTimeframe = useContractStore(s => s.selectedTimeframe);
  const selectedStrike = useContractStore(s => s.selectedStrike);
  const activeContract = useContractStore(s => s.activeContract);
  const rawServerState = useContractStore(s => s.serverState);
  const serverState = useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== selectedAsset.ticker) return null;
    return rawServerState;
  }, [rawServerState, selectedAsset.ticker]);
  const isContractLocked = useContractStore(s => s.isContractLocked);
  
  const selectContract = useContractStore(s => s.selectContract);
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const setSelectedStrike = useContractStore(s => s.setSelectedStrike);
  const setSelectedOptionType = useContractStore(s => s.setSelectedOptionType);
  const isPositionOpen = useContractStore(s => s.isPositionOpen);

  const isExpanded = selectedStrike !== null;

  const spotPrice = serverState?.pinpoint_map?.spot_price || selectedAsset.defaultPrice;
  const activeStrike = selectedStrike || Math.round(spotPrice / 10) * 10;

  const isDeepSkyseyeExpanded = useContractStore(s => s.isDeepSkyseyeExpanded);
  const setIsDeepSkyseyeExpanded = useContractStore(s => s.setIsDeepSkyseyeExpanded);

  // ── REAL market data source of truth ──────────────────────────────────────
  // The server publishes a near-the-money option chain with REAL greeks (analytic
  // vanna/charm) when keys are live, and a high-fidelity model when keyless. It is
  // premium-gated (tier 3+), so it can be `undefined` — guard every access.
  const liveChain = (serverState?.option_chain as ChainContract[] | undefined) ?? undefined;
  const hasLiveChain = Array.isArray(liveChain) && liveChain.length > 0;
  // True only when a real provider chain backs the data (not the keyless model).
  const isChainLive = !!serverState?.chain_live && hasLiveChain;

  // Nearest matching real contract in the chain for a given strike + side.
  const findChainContract = React.useCallback(
    (strike: number, isCall: boolean): ChainContract | undefined => {
      if (!hasLiveChain || !liveChain) return undefined;
      const wantType = isCall ? 'call' : 'put';
      let best: ChainContract | undefined;
      let bestDist = Infinity;
      for (const c of liveChain) {
        if (c.type !== wantType) continue;
        const d = Math.abs(c.strike - strike);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      return best;
    },
    [hasLiveChain, liveChain]
  );

  // ATM implied vol from the chain (contract whose strike sits closest to spot);
  // falls back to the asset's static volatility. Used to seed the MODEL greeks.
  const atmIv = useMemo(() => {
    let iv = selectedAsset.volatility || 0.17;
    if (hasLiveChain && liveChain) {
      let best = Infinity;
      for (const c of liveChain) {
        const d = Math.abs(c.strike - spotPrice);
        if (d < best && isFinite(c.iv) && c.iv > 0) { best = d; iv = c.iv; }
      }
    }
    return iv;
  }, [hasLiveChain, liveChain, spotPrice, selectedAsset.volatility]);


  // Render the preloaded Strikes Chain Centered on Spot but display them as list of OptionCards (Bug #4)
  const strikesList = useMemo(() => {
    const step = spotPrice > 1000 ? 50 : spotPrice > 150 ? 5 : 1;
    const center = Math.round(spotPrice / step) * step;

    // Mid price from a real chain contract's bid/ask, when present.
    const chainMid = (c?: ChainContract): number | null => {
      if (!c) return null;
      const bid = isFinite(c.bid) ? c.bid : 0;
      const ask = isFinite(c.ask) ? c.ask : 0;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : (ask || bid);
      return mid > 0 ? Number(mid.toFixed(2)) : null;
    };

    // Generate 10 strike rows centered on active Spot Price
    return [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(factor => {
      const strikeValue = center + (factor * step);
      const isSpotRow = factor === 0;

      // Prefer the REAL chain contract for this strike + side (source of truth).
      const callContract = findChainContract(strikeValue, true);
      const putContract = findChainContract(strikeValue, false);

      // Health: when a real chain is present, derive it from the contract's REAL
      // delta (probability-of-finishing-ITM proxy) so it is data-backed rather
      // than a hardcoded-volatility distance formula. Otherwise fall back to the
      // existing positional heuristic (this list is not labelled "live").
      let callHealth: number;
      if (callContract && isFinite(callContract.delta)) {
        callHealth = Math.max(30, Math.min(98, Math.round(Math.abs(callContract.delta) * 100)));
      } else if (strikeValue <= spotPrice) {
        callHealth = Math.round(96 - (spotPrice - strikeValue) * 0.04);
      } else {
        callHealth = Math.round(91 - (strikeValue - spotPrice) * 1.6 / step);
      }
      callHealth = Math.max(30, Math.min(98, callHealth));
      const callAction = callHealth >= 94 ? 'ENTER' : callHealth >= 75 ? 'HOLD' : callHealth <= 45 ? 'SELL' : 'REDUCE';

      let putHealth: number;
      if (putContract && isFinite(putContract.delta)) {
        putHealth = Math.max(25, Math.min(94, Math.round(Math.abs(putContract.delta) * 100)));
      } else if (strikeValue >= spotPrice) {
        putHealth = Math.round(34 - (strikeValue - spotPrice) * 1.1 / step);
      } else {
        putHealth = Math.round(79 + (spotPrice - strikeValue) * 0.4 / step);
      }
      putHealth = Math.max(25, Math.min(94, putHealth));
      const putAction = putHealth >= 88 ? 'ENTER' : putHealth >= 65 ? 'HOLD' : putHealth <= 40 ? 'SELL' : 'REDUCE';

      // Price: prefer the real chain bid/ask mid; otherwise the local distance
      // estimate (× static vol) as a clearly non-live fallback.
      const callDistance = Math.abs(spotPrice - strikeValue);
      const callNormalizedDistance = callDistance / spotPrice;
      const callPremiumBase = strikeValue <= spotPrice
        ? (spotPrice * 0.003) * Math.exp((spotPrice - strikeValue) / spotPrice * 3)
        : (spotPrice * 0.003) / Math.exp(callNormalizedDistance * 60);
      const callPrice = chainMid(callContract)
        ?? Math.max(0.20, Number((callPremiumBase * (1 + selectedAsset.volatility * 0.15)).toFixed(2)));

      const putDistance = Math.abs(spotPrice - strikeValue);
      const putNormalizedDistance = putDistance / spotPrice;
      const putPremiumBase = strikeValue >= spotPrice
        ? (spotPrice * 0.0035) * Math.exp((strikeValue - spotPrice) / spotPrice * 3)
        : (spotPrice * 0.0035) / Math.exp(putNormalizedDistance * 65);
      const putPrice = chainMid(putContract)
        ?? Math.max(0.20, Number((putPremiumBase * (1 + selectedAsset.volatility * 0.15)).toFixed(2)));

      return {
        strike: strikeValue,
        isSpotRow,
        callHealth,
        callAction,
        callMove: Math.max(1, Math.round(35 + (spotPrice - strikeValue) * 0.4)),
        callPrice,
        putHealth,
        putAction,
        putMove: Math.max(1, Math.round(22 + (spotPrice - strikeValue) * 0.35)),
        putPrice
      };
    });
  }, [spotPrice, selectedAsset.volatility, findChainContract]);

  // Memoize array props for InteractiveChart so they keep a stable reference when the
  // underlying data is unchanged. The inline `|| []` + optional chaining otherwise create
  // a fresh array every render, forcing the chart effect to tear down & rebuild all series.
  const chartCandles = useMemo(() => activeContract?.chartData || [], [activeContract?.chartData]);
  const chartDisplacementZones = useMemo(() => serverState?.displacement?.zones || [], [serverState?.displacement?.zones]);
  const chartFvgs = useMemo(() => serverState?.displacement?.fvgs || [], [serverState?.displacement?.fvgs]);
  const chartLiquidityEvents = useMemo(() => serverState?.displacement?.sweeps || [], [serverState?.displacement?.sweeps]);
  const chartTape = useMemo(() => serverState?.tape || [], [serverState?.tape]);

  // Active decision and parameters derived
  const selectedFocusedOption = strikesList.find(s => s.strike === activeStrike);
  // Real contract for the active strike + side, when the server chain is present.
  const activeChainContract = findChainContract(activeStrike, selectedOptionType === 'C');
  const activeChainMid = activeChainContract && isFinite(activeChainContract.bid) && isFinite(activeChainContract.ask)
    ? (() => {
        const b = activeChainContract.bid, a = activeChainContract.ask;
        const mid = b > 0 && a > 0 ? (b + a) / 2 : (a || b);
        return mid > 0 ? mid : null;
      })()
    : null;
  // Premium for the active contract: live server mid first, then the matching
  // chain contract's bid/ask mid, then the focused strike/side estimate.
  const activePrice = serverState?.optionPremiumFloat
    ?? activeChainMid
    ?? (selectedFocusedOption
      ? (selectedOptionType === 'C' ? selectedFocusedOption.callPrice : selectedFocusedOption.putPrice)
      : 0);
  // Confidence = the server's REAL per-contract trade_health (0–100) when present;
  // otherwise the focused-row health proxy. Guard: trade_health can be missing.
  const serverTradeHealth = typeof serverState?.trade_health === 'number' && isFinite(serverState.trade_health)
    ? Math.max(0, Math.min(100, Math.round(serverState.trade_health)))
    : null;
  const tradeHealthValue = serverTradeHealth
    ?? (selectedFocusedOption
      ? (selectedOptionType === 'C' ? selectedFocusedOption.callHealth : selectedFocusedOption.putHealth)
      : 85);
  const activeRecommendation = selectedFocusedOption
    ? (selectedOptionType === 'C' ? selectedFocusedOption.callAction : selectedFocusedOption.putAction)
    : (activeContract?.recommendation || 'HOLD');
  // Expected move = the server's REAL expected_move (parsed from its `pct` string,
  // e.g. "+42%") when present; otherwise the activeContract value, then a neutral
  // positional heuristic. Mirrors the store's own expected_move.pct parsing.
  const serverExpectedMove = (() => {
    const raw = serverState?.expected_move?.pct;
    if (raw == null) return null;
    const n = Number(String(raw).replace(/[^0-9.]/g, ''));
    return isFinite(n) && n > 0 ? Math.round(n) : null;
  })();
  const expectedMoveField = serverExpectedMove
    ?? activeContract?.expectedMove
    ?? (selectedFocusedOption
      ? (selectedOptionType === 'C' ? selectedFocusedOption.callMove : selectedFocusedOption.putMove)
      : 42);

  // Provenance for the confidence + expected-move readouts, mirroring the greeks
  // treatment: 'live' only when a real server figure backs the value, else it is a
  // model estimate and must be labelled as such (never presented as live data).
  const isConfidenceLive = serverTradeHealth !== null;
  const isExpectedMoveLive = serverExpectedMove !== null;

  // Greeks for the "Physics Grid" — honesty-first source of truth:
  //  1. REAL per-strike greeks from the server option_chain when present (the
  //     server publishes analytic delta/gamma/vega/theta). `source: 'live'` only
  //     when a real provider backs the chain, else 'chain' (server model chain).
  //  2. Otherwise the SHARED, pure Black-Scholes `calculateAnalyticGreeks` seeded
  //     with the best available IV (ATM chain iv, else static vol), flagged
  //     `source: 'model'` so the UI never presents it as live.
  // The OLD local Math.exp distance approximation (ignored real greeks, used a
  // static vol as IV, shown unlabelled on a "Live Terminal") has been removed.
  const derivedGreeks = useMemo(() => {
    const isCallOption = selectedOptionType === 'C';
    const fmt = (g: { delta: number; gamma: number; theta: number; vega: number }, source: 'live' | 'chain' | 'model') => ({
      delta: isFinite(g.delta) ? Number(g.delta.toFixed(2)) : 0,
      gamma: isFinite(g.gamma) ? Number(g.gamma.toFixed(4)) : 0,
      theta: isFinite(g.theta) ? Number(g.theta.toFixed(2)) : 0,
      vega: isFinite(g.vega) ? Number(g.vega.toFixed(2)) : 0,
      source,
    });

    // 1. Real greeks straight from the matching server chain contract.
    if (activeChainContract) {
      return fmt(activeChainContract, isChainLive ? 'live' : 'chain');
    }

    // 2. Model fallback via the shared pure Black-Scholes greeks (client-safe).
    //    No exact DTE is surfaced in this view; 14d matches the platform's other
    //    client-side analytic default (QuantSuite). Clearly marked as MODEL.
    const dteDays = 14;
    const g = calculateAnalyticGreeks(spotPrice, activeStrike, dteDays, atmIv, isCallOption);
    return fmt(g, 'model');
  }, [activeChainContract, isChainLive, spotPrice, activeStrike, selectedOptionType, atmIv]);

  // Dynamic Forensic Thesis generator
  const forensicThesis = useMemo(() => {
    switch (activeRecommendation) {
      case 'ENTER':
        return {
          title: selectedOptionType === 'C' ? 'STRONG BREAKOUT — BUYERS IN CONTROL' : 'STRONG BREAKDOWN — SELLERS IN CONTROL',
          desc: 'Heavy volume is pushing price in your direction and the move is picking up speed. Good spot to enter.',
          color: 'text-[var(--success)]',
          badges: ['HEAVY VOLUME', 'PRICE MOVING', 'MOMENTUM']
        };
      case 'REDUCE':
        return {
          title: 'LOSING STEAM — CONSIDER TRIMMING',
          desc: 'The move is stalling and time decay is eating into the option price. Think about taking some off to lock in profit.',
          color: 'text-[var(--warning)]',
          badges: ['TIME DECAY', 'LOW VOLATILITY', 'SLOWING DOWN']
        };
      case 'SELL':
        return {
          title: 'SUPPORT BROKEN — EXIT SIGNAL',
          desc: 'Price broke a key support level and big sellers are stepping in. Cut the position to limit losses.',
          color: 'text-[var(--danger)]',
          badges: ['SUPPORT BROKEN', 'HEAVY SELLING', 'TIME TO EXIT']
        };
      case 'HOLD':
      default:
        return {
          title: 'SIDEWAYS — WAIT FOR A MOVE',
          desc: 'Price is chopping in a range with no clear direction yet. Hold and wait for a breakout before adding.',
          color: 'text-[var(--info)]',
          badges: ['RANGE-BOUND', 'NO CLEAR TREND', 'WAIT IT OUT']
        };
    }
  }, [activeRecommendation, selectedOptionType]);

  // Real-time custom targets list
  const profitTargetsList = useMemo(() => {
    return [
      { id: 't1', label: 'Take Profit 1', optionValue: activePrice * 1.3, expectedPnL: '+30%', status: tradeHealthValue > 70 ? 'HIT TP 1' : 'IN PROGRESS' },
      { id: 't2', label: 'Take Profit 2', optionValue: activePrice * 1.8, expectedPnL: '+80%', status: tradeHealthValue > 85 ? 'HIT TP 2' : 'IN PROGRESS' },
      { id: 't3', label: 'Take Profit 3', optionValue: activePrice * 2.5, expectedPnL: '+150%', status: tradeHealthValue > 95 ? 'HIT TP 3' : 'PENDING' },
      { id: 't4', label: 'Take Profit 4', optionValue: activePrice * 3.5, expectedPnL: '+250%', status: 'PENDING' },
    ];
  }, [activePrice, tradeHealthValue]);

  if (!isExpanded) {
    return (
      <div className="w-full text-[var(--text-secondary)] font-mono select-none antialiased pt-2 relative flex flex-col xl:flex-row xl:items-start gap-4">
        {/* Main: the opportunity scanner. Sky Vision moves to a sticky side rail (right on wide
            screens, top on mobile) so its dense intel reads as a vertical card, not a wide strip. */}
        <div className="flex-1 min-w-0 order-2 xl:order-1">
          <DiscoveryView
            systemScore={serverState?.system_score}
            discovery={serverState?.discovery}
            onSelectContract={(asset, strike, isCall) => {
              setSelectedAsset(asset);
              setSelectedStrike(strike);
              setSelectedOptionType(isCall ? 'C' : 'P');
            }}
          />
        </div>
        <aside className="w-full xl:w-[380px] shrink-0 order-1 xl:order-2 xl:sticky xl:top-2 xl:self-start">
          <SkyVisionV2Panel compact />
        </aside>
      </div>
    );
  }

  return (
    <div className="w-full text-[var(--text-secondary)] flex flex-col font-mono select-none antialiased space-y-6">

      {/* Back Button to list */}
      <div className="w-full flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
        <button
          onClick={() => {
            setSelectedStrike(null);
          }}
          className="flex shrink-0 items-center gap-2 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] uppercase tracking-widest font-black py-2 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded hover:bg-[var(--surface-3)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
        >
          ← Back to Signals
        </button>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-wider tabular-nums truncate text-right">Selected: {selectedAsset.ticker} {activeStrike}{selectedOptionType}</span>
      </div>

      {/* Index + timeframe selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg gap-3">
        <div className="flex gap-2 items-center">
          <Zap className="w-4 h-4 text-[var(--success)]" />
          <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-black">Slayer Terminal</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <div className="flex items-center bg-[var(--surface-2)] p-0.5 border border-[var(--border)] rounded-md gap-x-1 overflow-x-auto scrollbar-none max-w-full">
            {ASSET_LIST.map(asset => (
              <button
                key={asset.ticker}
                type="button"
                onClick={() => setSelectedAsset(asset)}
                className={`flex shrink-0 items-center gap-2 px-3 py-1.5 text-[10px] uppercase font-black tracking-widest rounded transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                  selectedAsset.ticker === asset.ticker
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)] border border-white/5'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                <span>{asset.ticker}</span>
                <span className="hidden sm:inline opacity-80 scale-90 origin-left" style={{ filter: 'brightness(1.1)' }}>
                  <AssetSparkline ticker={asset.ticker} width={45} height={12} strokeWidth={1.25} />
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pl-0 sm:pl-2.5 sm:border-l border-[var(--border)]">
            <span className="text-[10px] text-[var(--text-tertiary)] font-black uppercase tracking-wider mr-1 hidden sm:inline">Timeframe</span>
            <div className="flex items-center bg-[var(--surface-2)] p-0.5 border border-[var(--border)] rounded-md">
              {(['5m', '15m', '1h', '4h', '1D'] as const).map(tf => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => useContractStore.getState().setSelectedTimeframe(tf)}
                  className={`px-3 py-1 text-[10px] uppercase font-black tracking-wider rounded transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                    selectedTimeframe === tf
                      ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SKY'S VISION TRADE PLAN — structured, actionable 0DTE synthesis (headline) */}
      <TradePlanCard />

      {/* =====================================================================
          BUG #5: SKYVISION SCREEN HIERARCHY - REORGANIZED FOR PARALLEL GRID
          Left: Provenance Evaluation Matrix, Profit Targets & Summary
          Right: Options Cards Selection
          Bottom: Full-Width High-Precision Chart View
          ===================================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        
        {/* LEFT COLUMN: PROVENANCE EVALUATION MATRIX & METRICS */}
        <div className="lg:col-span-6 flex flex-col gap-4 w-full">
          
          {/* TRADE VERDICT CARD */}
          <div
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 sm:p-6 flex flex-col gap-4 shadow-lg"
            style={{ minHeight: '340px' }}
          >
            {/* Header: verdict + live mid */}
            <div className="flex justify-between items-start border-b border-[var(--border)] pb-4">
              <div className="text-left space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] block">Your Trade</span>
                <div className={`inline-flex items-center px-3 py-1.5 rounded-lg border font-black text-2xl md:text-3xl uppercase tracking-tight leading-none ${
                  activeRecommendation === 'ENTER'
                    ? 'bg-[var(--success)]/10 border-[var(--success)]/40 text-[var(--success)]'
                    : activeRecommendation === 'SELL'
                    ? 'bg-[var(--danger)]/10 border-[var(--danger)]/40 text-[var(--danger)]'
                    : activeRecommendation === 'REDUCE'
                    ? 'bg-[var(--warning)]/10 border-[var(--warning)]/40 text-[var(--warning)]'
                    : 'bg-[var(--info)]/10 border-[var(--info)]/40 text-[var(--info)]'
                }`}>
                  {activeRecommendation}
                </div>
                <h1 className="text-base md:text-lg font-black text-[var(--text-secondary)] font-sans tracking-tight uppercase leading-none tabular-nums">
                  {selectedAsset.ticker} {activeStrike}{selectedOptionType}
                </h1>
              </div>
              <div className="text-right bg-[var(--surface-2)] p-2.5 border border-[var(--border)] rounded-lg">
                <span className="text-[var(--text-tertiary)] uppercase text-[10px] block tracking-wider">Live Mid</span>
                <span className="text-[var(--text-primary)] font-black block text-sm font-mono tabular-nums">${(activePrice ?? 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Decision grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch flex-1">

              {/* Thesis */}
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-lg flex flex-col justify-between text-left gap-3">
                <div className="space-y-1.5 text-left">
                  <span className="text-[10px] text-[var(--text-tertiary)] tracking-widest uppercase block font-black">The Setup</span>
                  <span className={`text-[13px] md:text-sm font-black font-sans uppercase block tracking-tight leading-tight ${forensicThesis.color}`}>
                    {forensicThesis.title}
                  </span>
                  <div className="text-[10px]/[14px] text-[var(--text-secondary)] font-sans tracking-wide">
                    {forensicThesis.desc}
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-3">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-black block mb-1.5">Why</span>
                  <div className="flex flex-wrap gap-1">
                    {forensicThesis.badges.map((b, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-[var(--surface-3)] border border-[var(--border)] rounded text-[var(--success)] font-bold text-[10px] tracking-wider uppercase">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Confidence + greeks + expected move */}
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-lg flex flex-col justify-between text-left gap-4">

                <div className="space-y-1.5 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-tertiary)] uppercase text-[10px] font-black flex items-center gap-1.5">
                      Confidence
                      <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        isConfidenceLive
                          ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10'
                          : 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-3)]'
                      }`}>
                        {isConfidenceLive ? 'Live' : 'Model Est.'}
                      </span>
                    </span>
                    <span className="font-black text-[var(--text-primary)] text-[10px] font-mono tabular-nums">{tradeHealthValue}%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[var(--success)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${tradeHealthValue}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                  {!isConfidenceLive && (
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider leading-snug">
                      Model estimate · not investment advice
                    </span>
                  )}
                </div>

                {/* Greeks 2x2 grid — labelled by provenance so a model/estimate
                    fallback is never presented as live data. */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-black">Greeks</span>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    derivedGreeks.source === 'live'
                      ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10'
                      : 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-3)]'
                  }`}>
                    {derivedGreeks.source === 'live' ? 'Live' : derivedGreeks.source === 'chain' ? 'Model Chain' : 'Model Est.'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 border-t border-b border-[var(--border)] py-3 font-mono text-[10px]">
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">DELTA</span>
                    <span className={`font-bold tabular-nums ${derivedGreeks.delta > 0 ? 'text-[var(--success)]' : derivedGreeks.delta < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>
                      <span aria-hidden="true">{derivedGreeks.delta > 0 ? '▲ ' : derivedGreeks.delta < 0 ? '▼ ' : ''}</span>{derivedGreeks.delta > 0 ? '+' : ''}{derivedGreeks.delta}
                    </span>
                  </div>
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">GAMMA</span>
                    <span className="text-[var(--text-primary)] font-bold tabular-nums">{derivedGreeks.gamma}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">THETA</span>
                    <span className="text-[var(--warning)] font-bold tabular-nums">{derivedGreeks.theta}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">VEGA</span>
                    <span className="text-[var(--info)] font-bold tabular-nums"><span aria-hidden="true">{derivedGreeks.vega > 0 ? '▲ ' : derivedGreeks.vega < 0 ? '▼ ' : ''}</span>{derivedGreeks.vega > 0 ? '+' : ''}{derivedGreeks.vega}</span>
                  </div>
                </div>

                {/* Expected move */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[var(--text-tertiary)] tracking-widest font-black uppercase flex items-center gap-1.5">
                      Expected Move
                      <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        isExpectedMoveLive
                          ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10'
                          : 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-3)]'
                      }`}>
                        {isExpectedMoveLive ? 'Live' : 'Model Est.'}
                      </span>
                    </span>
                    <span className="font-black text-[var(--info)] text-sm font-mono tabular-nums">+{expectedMoveField}%</span>
                  </div>
                  {!isExpectedMoveLive && (
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider leading-snug">
                      Model estimate · not investment advice
                    </span>
                  )}
                </div>

              </div>

            </div>

          </div>

          {/* PROFIT TARGETS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {profitTargetsList.map((tgt) => {
              const isHit = tgt.status.includes('HIT TP');
              return (
                <div
                  key={tgt.id}
                  className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex items-center justify-between text-left"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider block font-black uppercase">{tgt.label}</span>
                    <h4 className={`text-[10px] font-black uppercase ${isHit ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>{tgt.status}</h4>
                    <span className="text-[10px] text-[var(--text-secondary)] block font-mono">Target <span className="font-bold text-[var(--text-primary)] tabular-nums">${tgt.optionValue.toFixed(2)}</span></span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-[var(--success)] block tabular-nums">{tgt.expectedPnL}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)] uppercase block font-mono tracking-wider">Expected</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* STRIKE GRAVITY MAP — dealer-pressure ranking & zones */}
          <StrikeGravityPanel />

          {/* ANALYSIS SUMMARY */}
          <div className="w-full bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-5 rounded-xl text-left space-y-3">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
              <FileText className="w-3.5 h-3.5 text-[var(--success)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                Analysis Summary
              </span>
            </div>
            <div className="text-[11px] leading-relaxed text-[var(--text-secondary)] space-y-2 bg-[var(--surface-2)] p-3 rounded-lg border border-[var(--border)]">
              <p>
                <span className="text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider font-black">Decision Logic</span>{' '}
                {serverState?.position_management?.decision_reason || 'High confidence condition detected.'}
              </p>
              <p>
                Order book flows indicate {serverState?.position_management?.momentum === 'ACCELERATING' ? 'concentrated execution pressure' : 'neutral shifts'}.
                Recommended action is <span className="text-[var(--success)] font-black">{activeRecommendation}</span> with momentum biased {tradeHealthValue > 70 ? 'upwards' : 'downwards'}.
              </p>
              {serverState?.deep_intelligence && (
                <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1">
                  {serverState.deep_intelligence.strike_metrics?.gammaContribution && (
                    <p className="text-[var(--success)] font-bold tabular-nums">• {activeStrike} contains {serverState.deep_intelligence.strike_metrics.gammaContribution} of total {selectedOptionType === 'C' ? 'call' : 'put'} gamma.</p>
                  )}
                  {serverState.deep_intelligence.dealer_metrics?.flipLevel && serverState.deep_intelligence.dealer_metrics.flipLevel > 0 ? (
                    <p className="text-[var(--success)] font-bold tabular-nums">• Dealers become aggressive {selectedOptionType === 'C' ? 'buyers above' : 'sellers below'} {serverState.deep_intelligence.dealer_metrics.flipLevel.toFixed(2)}.</p>
                  ) : null}
                  {serverState.deep_intelligence.dealer_metrics?.putWall && serverState.deep_intelligence.dealer_metrics.putWall > 0 ? (
                    <p className="text-[var(--success)] font-bold tabular-nums">• {serverState.deep_intelligence.dealer_metrics.putWall.toFixed(2)} remains strongest downside support.</p>
                  ) : null}
                  {serverState.deep_intelligence.dealer_metrics?.magnetStrike && serverState.deep_intelligence.dealer_metrics.magnetStrike > 0 ? (
                    <p className="text-[var(--success)] font-bold tabular-nums">• {serverState.deep_intelligence.dealer_metrics.magnetStrike.toFixed(2)} remains primary magnet strike.</p>
                  ) : null}
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-[var(--border)] flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-wider">
              <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
              <span>Checked across multiple timeframes</span>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: OPTIONS CHAIN */}
        <div className="lg:col-span-6 w-full bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-5 rounded-xl flex flex-col" style={{ minHeight: '520px' }}>

          <div className="border-b border-[var(--border)] pb-3 text-left">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)] inline-flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[var(--success)]" />
              Contract Chain
            </span>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-1">
              Health scores, momentum and premium per strike.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 flex-1">
            {/* CALLS */}
            <div className="space-y-2.5">
              <span className="text-[10px] text-[var(--success)] uppercase tracking-widest block text-left font-black pl-1">
                Calls
              </span>
              <div className="flex flex-col gap-2">
                {strikesList.map((row) => {
                  const strikeLabel = `${selectedAsset.ticker} ${row.strike}C`;
                  const isSelected = isContractLocked && selectedStrike !== null && activeStrike === row.strike && selectedOptionType === 'C';
                  return (
                    <OptionCard
                      key={`call-${row.strike}`}
                      strikeLabel={strikeLabel}
                      health={row.callHealth}
                      move={row.callMove}
                      price={row.callPrice}
                      action={row.callAction}
                      isSelected={isSelected}
                      isCall={true}
                      onClick={() => {
                        setSelectedStrike(row.strike);
                        setSelectedOptionType('C');
                        selectContract(selectedAsset.ticker, row.strike, true);
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* PUTS */}
            <div className="space-y-2.5">
              <span className="text-[10px] text-[var(--danger)] uppercase tracking-widest block text-left font-black pl-1">
                Puts
              </span>
              <div className="flex flex-col gap-2">
                {strikesList.map((row) => {
                  const strikeLabel = `${selectedAsset.ticker} ${row.strike}P`;
                  const isSelected = isContractLocked && selectedStrike !== null && activeStrike === row.strike && selectedOptionType === 'P';
                  return (
                    <OptionCard
                      key={`put-${row.strike}`}
                      strikeLabel={strikeLabel}
                      health={row.putHealth}
                      move={row.putMove}
                      price={row.putPrice}
                      action={row.putAction}
                      isSelected={isSelected}
                      isCall={false}
                      onClick={() => {
                        setSelectedStrike(row.strike);
                        setSelectedOptionType('P');
                        selectContract(selectedAsset.ticker, row.strike, false);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-2.5 mt-4 text-[10px] text-[var(--text-tertiary)] uppercase font-bold text-left tracking-wider tabular-nums">
            Selected: {selectedAsset.ticker} {activeStrike}{selectedOptionType}
          </div>

        </div>

      </div>

      {/* EXPANDABLE DEEP INTELLIGENCE */}
      <div className="w-full mt-2">
        <button
          onClick={() => setIsDeepSkyseyeExpanded(!isDeepSkyseyeExpanded)}
          className="w-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-colors p-3 rounded-lg flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
        >
          {isDeepSkyseyeExpanded ? 'Hide Advanced Details' : 'Show Advanced Details'}
        </button>

        {isDeepSkyseyeExpanded && serverState?.deep_intelligence && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4 text-left"
          >
            {/* COLUMN 1: CONTRACT & STRIKE INTELLIGENCE */}
            <div className="lg:col-span-8 flex flex-col gap-4">
               {/* Largest Impact Contracts */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-4 flex justify-between items-center">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-[var(--success)]" /> Largest Impact Contracts
                    </span>
                    <span className="text-[10px] text-[var(--info)] uppercase px-2 py-0.5 border border-[var(--info)]/30 bg-[var(--info)]/10 rounded tracking-wider font-black">
                      Gamma Ranking
                    </span>
                  </div>
                  {/* Mobile card list — md and below */}
                  <div className="md:hidden flex flex-col gap-2">
                    {(serverState.deep_intelligence.impact_contracts || []).map((c: any) => (
                      <div key={c.contract} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 flex flex-col gap-1.5 font-mono">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-black tabular-nums ${c.rank === 1 ? 'text-[var(--danger)]' : c.rank === 2 ? 'text-[var(--info)]' : 'text-[var(--text-tertiary)]'}`}>
                            #{c.rank}
                          </span>
                          <span className="text-[11px] font-black text-[var(--text-primary)]">{c.contract}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[10px]">
                          <div>
                            <span className="block text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">OI</span>
                            <span className="text-[var(--success)] font-bold tabular-nums">{c.oi != null ? c.oi.toLocaleString() : '--'}</span>
                          </div>
                          <div>
                            <span className="block text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">Volume</span>
                            <span className="text-[var(--success)] font-bold tabular-nums">{c.volume != null ? c.volume.toLocaleString() : '--'}</span>
                          </div>
                          <div>
                            <span className="block text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">Gamma</span>
                            <span className="text-[var(--text-primary)] font-bold tabular-nums">{c.gammaContribution ?? '--'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(serverState.deep_intelligence.impact_contracts?.length ?? 0) === 0 && (
                      <div className="text-[var(--text-tertiary)] text-[10px] font-mono italic py-2 text-center">No impact contracts available.</div>
                    )}
                  </div>
                  {/* Full table — md and up */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-[10px] font-mono text-[var(--text-secondary)]">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--text-tertiary)] uppercase tracking-widest">
                          <th className="pb-2 font-black">Rank</th>
                          <th className="pb-2 font-black">Contract</th>
                          <th className="pb-2 font-black">Exp</th>
                          <th className="pb-2 font-black">Open Int</th>
                          <th className="pb-2 font-black">Volume</th>
                          <th className="pb-2 font-black text-right">Delta Notional</th>
                          <th className="pb-2 font-black text-right">Gamma</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] text-xs">
                        {(serverState.deep_intelligence.impact_contracts || []).map((c: any) => (
                          <tr key={c.contract} className="hover:bg-[var(--surface-2)] transition-colors">
                            <td className={`py-2 font-black tabular-nums ${c.rank === 1 ? 'text-[var(--danger)]' : c.rank === 2 ? 'text-[var(--info)]' : 'text-[var(--text-tertiary)]'}`}>#{c.rank}</td>
                            <td className="py-2 font-black text-[var(--text-primary)]">{c.contract}</td>
                            <td className="py-2">{c.expiration}</td>
                            <td className="py-2 text-[var(--success)] tabular-nums">{c.oi != null ? c.oi.toLocaleString() : '--'}</td>
                            <td className="py-2 text-[var(--success)] tabular-nums">{c.volume != null ? c.volume.toLocaleString() : '--'}</td>
                            <td className="py-2 text-right font-bold text-[var(--text-primary)] tabular-nums">{c.deltaNotional}</td>
                            <td className="py-2 text-right font-bold text-[var(--text-primary)] tabular-nums">{c.gammaContribution}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </div>

               {/* Strike Breakdown (Strike Intelligence) */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-4">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2 tabular-nums">
                       <Target className="w-3.5 h-3.5 text-[var(--success)]" />
                       Strike Detail · {(activeStrike ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Total OI</span>
                      <span className="font-black text-[var(--text-primary)] tabular-nums">{(serverState.deep_intelligence.strike_metrics?.totalOi || 0).toLocaleString()}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Net Exposure</span>
                      <span className={`font-black tabular-nums ${serverState.deep_intelligence.strike_metrics?.netExposure?.includes('+') ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                         {serverState.deep_intelligence.strike_metrics?.netExposure}
                      </span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Call / Put Ratio</span>
                      <span className="font-black text-[var(--text-primary)] tabular-nums">{serverState.deep_intelligence.strike_metrics?.callPutRatio}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Hedge Sensitivity</span>
                      <span className="font-black text-[var(--danger)] tabular-nums">{serverState.deep_intelligence.strike_metrics?.hedgeSensitivity}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Dealer Exposure</span>
                      <span className="font-black text-[var(--info)] tabular-nums">{serverState.deep_intelligence.strike_metrics?.dealerExposure}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Gamma Contribution</span>
                      <span className="font-black text-[var(--text-primary)] tabular-nums">{serverState.deep_intelligence.strike_metrics?.gammaContribution}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 col-span-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Delta Contribution</span>
                        <span className="font-black text-[var(--text-primary)] tabular-nums">{serverState.deep_intelligence.strike_metrics?.deltaContribution}</span>
                      </div>
                      <div className="w-1/2 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                         <div className="h-full bg-[var(--info)]" style={{ width: serverState.deep_intelligence.strike_metrics?.deltaContribution }} />
                      </div>
                    </div>
                  </div>
               </div>
            </div>

            {/* COLUMN 2: WHALE DETECTION & FLOW FEED */}
            <div className="lg:col-span-4 flex flex-col gap-4">
               {/* Live Dealer Commentary Card */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-3">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[var(--success)]" />
                      Dealer Notes
                    </span>
                  </div>
                  <div className="space-y-2">
                     {serverState.deep_intelligence.commentary?.map((point: string, idx: number) => (
                       <div key={idx} className="p-2.5 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[10px] font-sans text-[var(--text-secondary)] leading-relaxed flex gap-2">
                          <span className="text-[var(--info)] mt-0.5 select-none text-[10px]">■</span>
                          <span>{point}</span>
                       </div>
                     ))}
                     {(!serverState.deep_intelligence.commentary || serverState.deep_intelligence.commentary.length === 0) && (
                       <div className="text-[var(--text-tertiary)] italic text-xs py-2 text-center">No commentary for the current frame.</div>
                     )}
                  </div>
               </div>

               {/* Whale Detection */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-3">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-[var(--success)]" />
                      Biggest Trades
                    </span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center gap-2 p-2.5 bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-lg">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[var(--success)] uppercase block font-black tracking-wider">Largest Bullish</span>
                        <span className="text-[var(--text-primary)] font-bold block truncate">{serverState.deep_intelligence.whale_detection?.bullish?.contract} • {optionExpiryLabel(selectedAsset)}</span>
                      </div>
                      <span className="font-black text-[var(--text-primary)] tabular-nums shrink-0">{serverState.deep_intelligence.whale_detection?.bullish?.size}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 p-2.5 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-lg">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[var(--danger)] uppercase block font-black tracking-wider">Largest Bearish</span>
                        <span className="text-[var(--text-primary)] font-bold block truncate">{serverState.deep_intelligence.whale_detection?.bearish?.contract} • {optionExpiryLabel(selectedAsset)}</span>
                      </div>
                      <span className="font-black text-[var(--text-primary)] tabular-nums shrink-0">{serverState.deep_intelligence.whale_detection?.bearish?.size}</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg gap-3">
                      <div>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase block font-black tracking-wider">Largest Call</span>
                        <span className="text-[var(--text-primary)] font-bold tabular-nums">{serverState.deep_intelligence.whale_detection?.largestCall}</span>
                      </div>
                      <span className="font-black text-[var(--text-tertiary)] block text-right text-[10px]">HEDGE</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg gap-3">
                      <div>
                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase block font-black tracking-wider">Largest Put</span>
                        <span className="text-[var(--text-primary)] font-bold tabular-nums">{serverState.deep_intelligence.whale_detection?.largestPut}</span>
                      </div>
                      <span className="font-black text-[var(--text-tertiary)] block text-right text-[10px]">HEDGE</span>
                    </div>
                  </div>
               </div>

               {/* Institutional Flow Feed */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-5 flex-1 flex flex-col h-[300px]">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-3 shrink-0 flex justify-between items-center">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                       <Activity className="w-3.5 h-3.5 text-[var(--success)]" />
                       {(!!serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC') ? 'Live Order Flow' : 'Model Order Flow'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto text-[10px] font-mono pr-1 flex-1">
                     {(serverState.deep_intelligence.flow_feed || []).slice(0, 10).map((f: any) => (
                       <div key={f.id} className={`flex flex-col gap-1.5 p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg transition-colors hover:bg-[var(--surface-3)] ${f.type === 'UNUSUAL' ? 'border-l-2 border-l-[var(--info)]' : ''}`}>
                          <div className="flex justify-between gap-2">
                             <span className={`${f.type === 'SWEEP' ? 'text-[var(--success)]' : f.type === 'BLOCK' ? 'text-[var(--danger)]' : 'text-[var(--info)]'} font-bold shrink-0`}>{f.type}</span>
                             <span className="text-[var(--text-primary)] font-bold truncate text-right">{f.contract}</span>
                          </div>
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider break-words">{f.desc}</span>
                       </div>
                     ))}
                     {(serverState.deep_intelligence.flow_feed?.length ?? 0) === 0 && (
                       <div className="text-[var(--text-tertiary)] text-center py-4 italic text-xs">Waiting for market flows…</div>
                     )}
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* CHART */}
      <div className="w-full mt-2">

        <div className="w-full bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-5 rounded-xl space-y-3">
          <div className="flex justify-between items-center pb-2.5 border-b border-[var(--border)]">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)] flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[var(--success)]" /> Live Chart
            </span>
            <button
              onClick={() => setIsChartExpanded(!isChartExpanded)}
              className="-m-2 p-2 inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              title={isChartExpanded ? "Collapse Chart" : "Expand Chart"}
              aria-label={isChartExpanded ? "Collapse chart" : "Expand chart"}
            >
              {isChartExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
          <motion.div
            animate={{ height: isChartExpanded ? 500 : 210 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="w-full relative"
          >
            <InteractiveChart
              candles={chartCandles}
              displacementZones={chartDisplacementZones}
              fvgs={chartFvgs}
              liquidityEvents={chartLiquidityEvents}
              tape={chartTape}
              timeframe={selectedTimeframe}
              selectedTicker={selectedAsset.ticker}
              showFVGs={true}
              showLiquiditySweeps={true}
              showDisplacementEvents={true}
              watermarkText="LIVE CHART"
              gexLevels={serverState?.deep_intelligence?.dealer_metrics ? {
                callWall: serverState.deep_intelligence.dealer_metrics.callWall,
                putWall: serverState.deep_intelligence.dealer_metrics.putWall,
                gammaFlip: serverState.deep_intelligence.dealer_metrics.flipLevel,
                magnet: serverState.deep_intelligence.dealer_metrics.magnetStrike,
              } : undefined}
            />
          </motion.div>
        </div>

      </div>

    </div>
  );
}
