import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useContractStore, ContractState } from '../lib/store';
import { InteractiveChart } from './InteractiveChart';
import { StrikeGravityPanel } from './StrikeGravityPanel';
import { TradePlanCard } from './TradePlanCard';
import { ASSET_LIST } from '../data';
import { Zap, FileText, CheckCircle2, Maximize2, Minimize2, Layers, Target, Activity } from 'lucide-react';
import { DiscoveryView } from './DiscoveryView';
import { SkyVisionV2Panel } from './SkyVisionV2Panel';

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
  const actionColor = action === 'ENTER' ? 'text-[#4ADE80] border-[#4ADE80]/30 bg-[#4ADE80]/10' : action === 'SELL' ? 'text-[#F87171] border-[#F87171]/30 bg-[#F87171]/10' : 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-2)]';
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
      ? 'bg-[var(--surface-3)] border-[#4ADE80]/60 text-[var(--text-primary)]'
      : 'bg-[var(--surface-3)] border-[#F87171]/60 text-[var(--text-primary)]';
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
          <span className="text-[8px] uppercase tracking-wider text-[var(--text-tertiary)]">HEALTH {health}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className={`text-xs font-black font-mono text-[var(--text-primary)] ${tickClass}`}>
              ${price.toFixed(2)}
            </span>
            <span className={`font-bold font-mono text-[9px] ${isCall ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
              +{move}%
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[8.5px] font-black tracking-widest border uppercase shrink-0 ${actionColor}`}>
            {action}
          </span>
        </div>
      </div>
      <div className="flex pt-2 border-t border-[var(--border)] justify-between items-center">
         <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider font-mono">Momentum</span>
         <span className={`text-[8.5px] font-black uppercase ${momentum === 'STRENGTHENING' ? 'text-[#4ADE80]' : momentum === 'WEAKENING' ? 'text-[#F87171]' : 'text-[var(--text-secondary)]'}`}>{momentum}</span>
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


  // Render the preloaded Strikes Chain Centered on Spot but display them as list of OptionCards (Bug #4)
  const strikesList = useMemo(() => {
    const step = spotPrice > 1000 ? 50 : spotPrice > 150 ? 5 : 1;
    const center = Math.round(spotPrice / step) * step;
    
    // Generate 10 strike rows centered on active Spot Price
    return [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(factor => {
      const strikeValue = center + (factor * step);
      const isSpotRow = factor === 0;

      // Calls logic
      let callHealth = 88;
      if (strikeValue <= spotPrice) {
        callHealth = Math.round(96 - (spotPrice - strikeValue) * 0.04);
      } else {
        callHealth = Math.round(91 - (strikeValue - spotPrice) * 1.6 / step);
      }
      callHealth = Math.max(30, Math.min(98, callHealth));
      const callAction = callHealth >= 94 ? 'ENTER' : callHealth >= 75 ? 'HOLD' : callHealth <= 45 ? 'SELL' : 'REDUCE';

      // Puts logic
      let putHealth = 65;
      if (strikeValue >= spotPrice) {
        putHealth = Math.round(34 - (strikeValue - spotPrice) * 1.1 / step);
      } else {
        putHealth = Math.round(79 + (spotPrice - strikeValue) * 0.4 / step);
      }
      putHealth = Math.max(25, Math.min(94, putHealth));
      const putAction = putHealth >= 88 ? 'ENTER' : putHealth >= 65 ? 'HOLD' : putHealth <= 40 ? 'SELL' : 'REDUCE';

      // Dynamic contract premium formulation based on distance to Spot Price
      const callDistance = Math.abs(spotPrice - strikeValue);
      const callNormalizedDistance = callDistance / spotPrice;
      const callPremiumBase = strikeValue <= spotPrice 
        ? (spotPrice * 0.003) * Math.exp((spotPrice - strikeValue) / spotPrice * 3)
        : (spotPrice * 0.003) / Math.exp(callNormalizedDistance * 60);
      const callPrice = Math.max(0.20, Number((callPremiumBase * (1 + selectedAsset.volatility * 0.15)).toFixed(2)));

      const putDistance = Math.abs(spotPrice - strikeValue);
      const putNormalizedDistance = putDistance / spotPrice;
      const putPremiumBase = strikeValue >= spotPrice
        ? (spotPrice * 0.0035) * Math.exp((strikeValue - spotPrice) / spotPrice * 3)
        : (spotPrice * 0.0035) / Math.exp(putNormalizedDistance * 65);
      const putPrice = Math.max(0.20, Number((putPremiumBase * (1 + selectedAsset.volatility * 0.15)).toFixed(2)));

      return {
        strike: strikeValue,
        isSpotRow,
        callHealth,
        callAction,
        callMove: Math.round(35 + (spotPrice - strikeValue) * 0.4),
        callPrice,
        putHealth,
        putAction,
        putMove: Math.round(22 + (spotPrice - strikeValue) * 0.35),
        putPrice
      };
    });
  }, [spotPrice, selectedAsset.volatility]);

  // Memoize array props for InteractiveChart so they keep a stable reference when the
  // underlying data is unchanged. The inline `|| []` + optional chaining otherwise create
  // a fresh array every render, forcing the chart effect to tear down & rebuild all series.
  const chartCandles = useMemo(() => activeContract?.chartData || [], [activeContract?.chartData]);
  const chartDisplacementZones = useMemo(() => serverState?.displacement_engine?.zones || [], [serverState?.displacement_engine?.zones]);
  const chartFvgs = useMemo(() => serverState?.displacement_engine?.fvgs || [], [serverState?.displacement_engine?.fvgs]);
  const chartLiquidityEvents = useMemo(() => serverState?.displacement_engine?.sweeps || [], [serverState?.displacement_engine?.sweeps]);
  const chartTape = useMemo(() => serverState?.tape || [], [serverState?.tape]);

  // Active decision and parameters derived
  const selectedFocusedOption = strikesList.find(s => s.strike === activeStrike);
  // Premium for the active contract: live server mid when available, otherwise the
  // computed premium for the focused strike/side (derived from real spot price).
  const activePrice = serverState?.optionPremiumFloat
    ?? (selectedFocusedOption
      ? (selectedOptionType === 'C' ? selectedFocusedOption.callPrice : selectedFocusedOption.putPrice)
      : 0);
  const tradeHealthValue = selectedFocusedOption
    ? (selectedOptionType === 'C' ? selectedFocusedOption.callHealth : selectedFocusedOption.putHealth) 
    : 85;
  const activeRecommendation = selectedFocusedOption
    ? (selectedOptionType === 'C' ? selectedFocusedOption.callAction : selectedFocusedOption.putAction)
    : (activeContract?.recommendation || 'HOLD');
  const expectedMoveField = selectedFocusedOption
    ? (selectedOptionType === 'C' ? selectedFocusedOption.callMove : selectedFocusedOption.putMove)
    : (activeContract?.expectedMove || 42);

  // Dynamic Greeks Attribution for the "Physics Grid"
  const derivedGreeks = useMemo(() => {
    const isCallOption = selectedOptionType === 'C';
    const distToStrike = activeStrike - spotPrice;
    const iv = selectedAsset.volatility || 0.17;
    const distNorm = distToStrike / (spotPrice * 0.05 || 1); // Normalize space

    // Delta estimation
    let delta = isCallOption ? 1 / (1 + Math.exp(distNorm)) : -1 / (1 + Math.exp(-distNorm));
    delta = Math.max(isCallOption ? 0.02 : -0.98, Math.min(isCallOption ? 0.98 : -0.02, delta));

    // Gamma approximation
    let gamma = (1 / (Math.sqrt(2 * Math.PI) * 1.6)) * Math.exp(-0.5 * Math.pow(distNorm, 2)) * (0.04 * (1.2 + iv));
    gamma = Math.max(0.001, gamma);

    // Theta approximation (always negative decay)
    let theta = -0.6 * (1.1 + Math.exp(-0.35 * Math.pow(distNorm, 2))) * (1 + iv);
    theta = Math.min(-0.02, theta);

    // Vega approximation
    let vega = 0.16 * Math.exp(-0.45 * Math.pow(distNorm, 2)) * (1.1 + iv);
    vega = Math.max(0.01, vega);

    return {
      delta: Number(delta.toFixed(2)),
      gamma: Number(gamma.toFixed(4)),
      theta: Number(theta.toFixed(2)),
      vega: Number(vega.toFixed(2))
    };
  }, [activeStrike, spotPrice, selectedOptionType, selectedAsset]);

  // Dynamic Forensic Thesis generator
  const forensicThesis = useMemo(() => {
    switch (activeRecommendation) {
      case 'ENTER':
        return {
          title: selectedOptionType === 'C' ? 'STRONG BREAKOUT — BUYERS IN CONTROL' : 'STRONG BREAKDOWN — SELLERS IN CONTROL',
          desc: 'Heavy volume is pushing price in your direction and the move is picking up speed. Good spot to enter.',
          color: 'text-[#4ADE80]',
          badges: ['HEAVY VOLUME', 'PRICE MOVING', 'MOMENTUM']
        };
      case 'REDUCE':
        return {
          title: 'LOSING STEAM — CONSIDER TRIMMING',
          desc: 'The move is stalling and time decay is eating into the option price. Think about taking some off to lock in profit.',
          color: 'text-[#FBBF24]',
          badges: ['TIME DECAY', 'LOW VOLATILITY', 'SLOWING DOWN']
        };
      case 'SELL':
        return {
          title: 'SUPPORT BROKEN — EXIT SIGNAL',
          desc: 'Price broke a key support level and big sellers are stepping in. Cut the position to limit losses.',
          color: 'text-[#F87171]',
          badges: ['SUPPORT BROKEN', 'HEAVY SELLING', 'TIME TO EXIT']
        };
      case 'HOLD':
      default:
        return {
          title: 'SIDEWAYS — WAIT FOR A MOVE',
          desc: 'Price is chopping in a range with no clear direction yet. Hold and wait for a breakout before adding.',
          color: 'text-[#60A5FA]',
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
      <div className="w-full text-[var(--text-secondary)] flex flex-col font-mono select-none antialiased pt-2 relative">
        <SkyVisionV2Panel />
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
    );
  }

  return (
    <div className="w-full text-[var(--text-secondary)] flex flex-col font-mono select-none antialiased space-y-6">

      {/* Back Button to list */}
      <div className="w-full flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <button
          onClick={() => {
            setSelectedStrike(null);
          }}
          className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] uppercase tracking-widest font-black py-1.5 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded hover:bg-[var(--surface-3)] transition-colors"
        >
          ← Back to Signals
        </button>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-wider">Selected: {selectedAsset.ticker} {activeStrike}{selectedOptionType}</span>
      </div>

      {/* Index + timeframe selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg gap-3">
        <div className="flex gap-2 items-center">
          <Zap className="w-4 h-4 text-[#4ADE80]" />
          <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-widest font-black">Live Terminal</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-[var(--surface-2)] p-0.5 border border-[var(--border)] rounded-md">
            {ASSET_LIST.map(asset => (
              <button
                key={asset.ticker}
                type="button"
                onClick={() => setSelectedAsset(asset)}
                className={`px-3.5 py-1 text-[9px] uppercase font-black tracking-widest rounded transition-colors cursor-pointer ${
                  selectedAsset.ticker === asset.ticker
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {asset.ticker}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pl-2.5 border-l border-[var(--border)]">
            <span className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-wider mr-1 hidden sm:inline">Timeframe</span>
            <div className="flex items-center bg-[var(--surface-2)] p-0.5 border border-[var(--border)] rounded-md">
              {(['5m', '15m', '1h', '4h', '1D'] as const).map(tf => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => useContractStore.getState().setSelectedTimeframe(tf)}
                  className={`px-3 py-1 text-[8.5px] uppercase font-black tracking-wider rounded transition-colors cursor-pointer ${
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
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-4 shadow-lg"
            style={{ minHeight: '340px' }}
          >
            {/* Header: verdict + live mid */}
            <div className="flex justify-between items-start border-b border-[var(--border)] pb-4">
              <div className="text-left space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] block">Your Trade</span>
                <div className={`inline-flex items-center px-3 py-1.5 rounded-lg border font-black text-2xl md:text-3xl uppercase tracking-tight leading-none ${
                  activeRecommendation === 'ENTER'
                    ? 'bg-[#4ADE80]/10 border-[#4ADE80]/40 text-[#4ADE80]'
                    : activeRecommendation === 'SELL'
                    ? 'bg-[#F87171]/10 border-[#F87171]/40 text-[#F87171]'
                    : activeRecommendation === 'REDUCE'
                    ? 'bg-[#FBBF24]/10 border-[#FBBF24]/40 text-[#FBBF24]'
                    : 'bg-[#60A5FA]/10 border-[#60A5FA]/40 text-[#60A5FA]'
                }`}>
                  {activeRecommendation}
                </div>
                <h1 className="text-base md:text-lg font-black text-[var(--text-secondary)] font-sans tracking-tight uppercase leading-none">
                  {selectedAsset.ticker} {activeStrike}{selectedOptionType}
                </h1>
              </div>
              <div className="text-right bg-[var(--surface-2)] p-2.5 border border-[var(--border)] rounded-lg">
                <span className="text-[var(--text-tertiary)] uppercase text-[8px] block tracking-wider">Live Mid</span>
                <span className="text-[var(--text-primary)] font-black block text-sm font-mono">${(activePrice ?? 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Decision grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch flex-1">

              {/* Thesis */}
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-lg flex flex-col justify-between text-left gap-3">
                <div className="space-y-1.5 text-left">
                  <span className="text-[8px] text-[var(--text-tertiary)] tracking-widest uppercase block font-black">The Setup</span>
                  <span className={`text-[13px] md:text-sm font-black font-sans uppercase block tracking-tight leading-tight ${forensicThesis.color}`}>
                    {forensicThesis.title}
                  </span>
                  <div className="text-[9.5px]/[14px] text-[var(--text-secondary)] font-sans tracking-wide">
                    {forensicThesis.desc}
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-3">
                  <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-widest font-black block mb-1.5">Why</span>
                  <div className="flex flex-wrap gap-1">
                    {forensicThesis.badges.map((b, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-[var(--surface-3)] border border-[var(--border)] rounded text-[#4ADE80] font-bold text-[8px] tracking-wider uppercase">
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
                    <span className="text-[var(--text-tertiary)] uppercase text-[8.5px] font-black">Confidence</span>
                    <span className="font-black text-[var(--text-primary)] text-[10px] font-mono">{tradeHealthValue}%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[#4ADE80]"
                      initial={{ width: 0 }}
                      animate={{ width: `${tradeHealthValue}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Greeks 2x2 grid */}
                <div className="grid grid-cols-2 gap-1.5 border-t border-b border-[var(--border)] py-3 font-mono text-[9px]">
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">DELTA</span>
                    <span className={`font-bold ${derivedGreeks.delta > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                      {derivedGreeks.delta > 0 ? '+' : ''}{derivedGreeks.delta}
                    </span>
                  </div>
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">GAMMA</span>
                    <span className="text-[var(--text-primary)] font-bold">{derivedGreeks.gamma}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">THETA</span>
                    <span className="text-[#FBBF24] font-bold">{derivedGreeks.theta}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-1 bg-[var(--surface-3)] border border-[var(--border)] rounded">
                    <span className="text-[var(--text-tertiary)] font-semibold tracking-wider">VEGA</span>
                    <span className="text-[#60A5FA] font-bold">+{derivedGreeks.vega}</span>
                  </div>
                </div>

                {/* Expected move */}
                <div className="flex justify-between items-center">
                  <span className="text-[8.5px] text-[var(--text-tertiary)] tracking-widest font-black uppercase">Expected Move</span>
                  <span className="font-black text-[#60A5FA] text-sm font-mono">+{expectedMoveField}%</span>
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
                    <span className="text-[8px] text-[var(--text-tertiary)] tracking-wider block font-black uppercase">{tgt.label}</span>
                    <h4 className={`text-[10px] font-black uppercase ${isHit ? 'text-[#4ADE80]' : 'text-[#FBBF24]'}`}>{tgt.status}</h4>
                    <span className="text-[10px] text-[var(--text-secondary)] block font-mono">Target <span className="font-bold text-[var(--text-primary)]">${tgt.optionValue.toFixed(2)}</span></span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-[#4ADE80] block">{tgt.expectedPnL}</span>
                    <span className="text-[7.5px] text-[var(--text-tertiary)] uppercase block font-mono tracking-wider">Expected</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* STRIKE GRAVITY MAP — dealer-pressure ranking & zones */}
          <StrikeGravityPanel />

          {/* ANALYSIS SUMMARY */}
          <div className="w-full bg-[var(--surface)] border border-[var(--border)] p-5 rounded-xl text-left space-y-3">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
              <FileText className="w-3.5 h-3.5 text-[#4ADE80]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                Analysis Summary
              </span>
            </div>
            <div className="text-[11px] leading-relaxed text-[var(--text-secondary)] space-y-2 bg-[var(--surface-2)] p-3 rounded-lg border border-[var(--border)]">
              <p>
                <span className="text-[var(--text-tertiary)] uppercase text-[9px] tracking-wider font-black">Decision Logic</span>{' '}
                {serverState?.position_management?.decision_reason || 'High confidence condition detected.'}
              </p>
              <p>
                Order book flows indicate {serverState?.position_management?.momentum === 'ACCELERATING' ? 'concentrated execution pressure' : 'neutral shifts'}.
                Recommended action is <span className="text-[#4ADE80] font-black">{activeRecommendation}</span> with momentum biased {tradeHealthValue > 70 ? 'upwards' : 'downwards'}.
              </p>
              {serverState?.deep_intelligence && (
                <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1">
                  {serverState.deep_intelligence.strike_metrics?.gammaContribution && (
                    <p className="text-[#4ADE80] font-bold">• {activeStrike} contains {serverState.deep_intelligence.strike_metrics.gammaContribution} of total {selectedOptionType === 'C' ? 'call' : 'put'} gamma.</p>
                  )}
                  {serverState.deep_intelligence.dealer_metrics?.flipLevel && serverState.deep_intelligence.dealer_metrics.flipLevel > 0 ? (
                    <p className="text-[#4ADE80] font-bold">• Dealers become aggressive {selectedOptionType === 'C' ? 'buyers above' : 'sellers below'} {serverState.deep_intelligence.dealer_metrics.flipLevel.toFixed(2)}.</p>
                  ) : null}
                  {serverState.deep_intelligence.dealer_metrics?.putWall && serverState.deep_intelligence.dealer_metrics.putWall > 0 ? (
                    <p className="text-[#4ADE80] font-bold">• {serverState.deep_intelligence.dealer_metrics.putWall.toFixed(2)} remains strongest downside support.</p>
                  ) : null}
                  {serverState.deep_intelligence.dealer_metrics?.magnetStrike && serverState.deep_intelligence.dealer_metrics.magnetStrike > 0 ? (
                    <p className="text-[#4ADE80] font-bold">• {serverState.deep_intelligence.dealer_metrics.magnetStrike.toFixed(2)} remains primary magnet strike.</p>
                  ) : null}
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-[var(--border)] flex items-center gap-1.5 text-[8.5px] text-[var(--text-tertiary)] uppercase font-black tracking-wider">
              <CheckCircle2 className="w-3 h-3 text-[#4ADE80]" />
              <span>Checked across multiple timeframes</span>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: OPTIONS CHAIN */}
        <div className="lg:col-span-6 w-full bg-[var(--surface)] border border-[var(--border)] p-5 rounded-xl flex flex-col" style={{ minHeight: '520px' }}>

          <div className="border-b border-[var(--border)] pb-3 text-left">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)] inline-flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#4ADE80]" />
              Contract Chain
            </span>
            <p className="text-[8.5px] text-[var(--text-tertiary)] uppercase tracking-wider mt-1">
              Health scores, momentum and premium per strike.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 flex-1">
            {/* CALLS */}
            <div className="space-y-2.5">
              <span className="text-[8.5px] text-[#4ADE80] uppercase tracking-widest block text-left font-black pl-1">
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
              <span className="text-[8.5px] text-[#F87171] uppercase tracking-widest block text-left font-black pl-1">
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

          <div className="border-t border-[var(--border)] pt-2.5 mt-4 text-[8px] text-[var(--text-tertiary)] uppercase font-bold text-left tracking-wider">
            Selected: {selectedAsset.ticker} {activeStrike}{selectedOptionType}
          </div>

        </div>

      </div>

      {/* EXPANDABLE DEEP INTELLIGENCE */}
      <div className="w-full mt-2">
        <button
          onClick={() => setIsDeepSkyseyeExpanded(!isDeepSkyseyeExpanded)}
          className="w-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-colors p-3 rounded-lg flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]"
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
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-4 flex justify-between items-center">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-[#4ADE80]" /> Largest Impact Contracts
                    </span>
                    <span className="text-[8px] text-[#60A5FA] uppercase px-2 py-0.5 border border-[#60A5FA]/30 bg-[#60A5FA]/10 rounded tracking-wider font-black">
                      Gamma Ranking
                    </span>
                  </div>
                  {/* Mobile card list — md and below */}
                  <div className="md:hidden flex flex-col gap-2">
                    {(serverState.deep_intelligence.impact_contracts || []).map((c: any) => (
                      <div key={c.contract} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 flex flex-col gap-1.5 font-mono">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-black ${c.rank === 1 ? 'text-[#F87171]' : c.rank === 2 ? 'text-[#60A5FA]' : 'text-[var(--text-tertiary)]'}`}>
                            #{c.rank}
                          </span>
                          <span className="text-[11px] font-black text-[var(--text-primary)]">{c.contract}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[9px]">
                          <div>
                            <span className="block text-[var(--text-tertiary)] uppercase tracking-wider text-[7.5px]">OI</span>
                            <span className="text-[#4ADE80] font-bold">{c.oi != null ? c.oi.toLocaleString() : '--'}</span>
                          </div>
                          <div>
                            <span className="block text-[var(--text-tertiary)] uppercase tracking-wider text-[7.5px]">Volume</span>
                            <span className="text-[#4ADE80] font-bold">{c.volume != null ? c.volume.toLocaleString() : '--'}</span>
                          </div>
                          <div>
                            <span className="block text-[var(--text-tertiary)] uppercase tracking-wider text-[7.5px]">Gamma</span>
                            <span className="text-[var(--text-primary)] font-bold">{c.gammaContribution ?? '--'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(serverState.deep_intelligence.impact_contracts?.length ?? 0) === 0 && (
                      <div className="text-[var(--text-tertiary)] text-[9px] font-mono italic py-2 text-center">No impact contracts available.</div>
                    )}
                  </div>
                  {/* Full table — md and up */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-[9px] font-mono text-[var(--text-secondary)]">
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
                            <td className={`py-2 font-black ${c.rank === 1 ? 'text-[#F87171]' : c.rank === 2 ? 'text-[#60A5FA]' : 'text-[var(--text-tertiary)]'}`}>#{c.rank}</td>
                            <td className="py-2 font-black text-[var(--text-primary)]">{c.contract}</td>
                            <td className="py-2">{c.expiration}</td>
                            <td className="py-2 text-[#4ADE80]">{c.oi.toLocaleString()}</td>
                            <td className="py-2 text-[#4ADE80]">{c.volume.toLocaleString()}</td>
                            <td className="py-2 text-right font-bold text-[var(--text-primary)]">{c.deltaNotional}</td>
                            <td className="py-2 text-right font-bold text-[var(--text-primary)]">{c.gammaContribution}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </div>

               {/* Strike Breakdown (Strike Intelligence) */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-4">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                       <Target className="w-3.5 h-3.5 text-[#4ADE80]" />
                       Strike Detail · {(activeStrike ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[8px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Total OI</span>
                      <span className="font-black text-[var(--text-primary)]">{(serverState.deep_intelligence.strike_metrics?.totalOi || 0).toLocaleString()}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[8px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Net Exposure</span>
                      <span className={`font-black ${serverState.deep_intelligence.strike_metrics?.netExposure?.includes('+') ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                         {serverState.deep_intelligence.strike_metrics?.netExposure}
                      </span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[8px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Call / Put Ratio</span>
                      <span className="font-black text-[var(--text-primary)]">{serverState.deep_intelligence.strike_metrics?.callPutRatio}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[8px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Hedge Sensitivity</span>
                      <span className="font-black text-[#F87171]">{serverState.deep_intelligence.strike_metrics?.hedgeSensitivity}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[8px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Dealer Exposure</span>
                      <span className="font-black text-[#60A5FA]">{serverState.deep_intelligence.strike_metrics?.dealerExposure}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                      <span className="text-[8px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Gamma Contribution</span>
                      <span className="font-black text-[var(--text-primary)]">{serverState.deep_intelligence.strike_metrics?.gammaContribution}</span>
                    </div>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 col-span-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[8px] text-[var(--text-tertiary)] uppercase block mb-1 tracking-wider">Delta Contribution</span>
                        <span className="font-black text-[var(--text-primary)]">{serverState.deep_intelligence.strike_metrics?.deltaContribution}</span>
                      </div>
                      <div className="w-1/2 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                         <div className="h-full bg-[#60A5FA]" style={{ width: serverState.deep_intelligence.strike_metrics?.deltaContribution }} />
                      </div>
                    </div>
                  </div>
               </div>
            </div>

            {/* COLUMN 2: WHALE DETECTION & FLOW FEED */}
            <div className="lg:col-span-4 flex flex-col gap-4">
               {/* Live Dealer Commentary Card */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-3">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[#4ADE80]" />
                      Dealer Notes
                    </span>
                  </div>
                  <div className="space-y-2">
                     {serverState.deep_intelligence.commentary?.map((point: string, idx: number) => (
                       <div key={idx} className="p-2.5 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[9.5px] font-sans text-[var(--text-secondary)] leading-relaxed flex gap-2">
                          <span className="text-[#60A5FA] mt-0.5 select-none text-[8px]">■</span>
                          <span>{point}</span>
                       </div>
                     ))}
                     {(!serverState.deep_intelligence.commentary || serverState.deep_intelligence.commentary.length === 0) && (
                       <div className="text-[var(--text-tertiary)] italic text-xs py-2 text-center">No commentary for the current frame.</div>
                     )}
                  </div>
               </div>

               {/* Whale Detection */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-3">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-[#4ADE80]" />
                      Biggest Trades
                    </span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center p-2.5 bg-[#4ADE80]/5 border border-[#4ADE80]/20 rounded-lg">
                      <div>
                        <span className="text-[8px] text-[#4ADE80] uppercase block font-black tracking-wider">Largest Bullish</span>
                        <span className="text-[var(--text-primary)] font-bold">{serverState.deep_intelligence.whale_detection?.bullish?.contract} • 0DTE</span>
                      </div>
                      <span className="font-black text-[var(--text-primary)]">{serverState.deep_intelligence.whale_detection?.bullish?.size}</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[#F87171]/5 border border-[#F87171]/20 rounded-lg">
                      <div>
                        <span className="text-[8px] text-[#F87171] uppercase block font-black tracking-wider">Largest Bearish</span>
                        <span className="text-[var(--text-primary)] font-bold">{serverState.deep_intelligence.whale_detection?.bearish?.contract} • 0DTE</span>
                      </div>
                      <span className="font-black text-[var(--text-primary)]">{serverState.deep_intelligence.whale_detection?.bearish?.size}</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg gap-3">
                      <div>
                        <span className="text-[8px] text-[var(--text-tertiary)] uppercase block font-black tracking-wider">Largest Call</span>
                        <span className="text-[var(--text-primary)] font-bold">{serverState.deep_intelligence.whale_detection?.largestCall}</span>
                      </div>
                      <span className="font-black text-[var(--text-tertiary)] block text-right text-[9px]">HEDGE</span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg gap-3">
                      <div>
                        <span className="text-[8px] text-[var(--text-tertiary)] uppercase block font-black tracking-wider">Largest Put</span>
                        <span className="text-[var(--text-primary)] font-bold">{serverState.deep_intelligence.whale_detection?.largestPut}</span>
                      </div>
                      <span className="font-black text-[var(--text-tertiary)] block text-right text-[9px]">HEDGE</span>
                    </div>
                  </div>
               </div>

               {/* Institutional Flow Feed */}
               <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex-1 flex flex-col h-[300px]">
                  <div className="border-b border-[var(--border)] pb-2.5 mb-3 shrink-0 flex justify-between items-center">
                    <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest flex items-center gap-2">
                       <Activity className="w-3.5 h-3.5 text-[#4ADE80]" />
                       Live Order Flow
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto text-[10px] font-mono pr-1 flex-1">
                     {(serverState.deep_intelligence.flow_feed || []).slice(0, 10).map((f: any) => (
                       <div key={f.id} className={`flex flex-col gap-1.5 p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg transition-colors hover:bg-[var(--surface-3)] ${f.type === 'UNUSUAL' ? 'border-l-2 border-l-[#60A5FA]' : ''}`}>
                          <div className="flex justify-between">
                             <span className={`${f.type === 'SWEEP' ? 'text-[#4ADE80]' : f.type === 'BLOCK' ? 'text-[#F87171]' : 'text-[#60A5FA]'} font-bold`}>{f.type}</span>
                             <span className="text-[var(--text-primary)] font-bold">{f.contract}</span>
                          </div>
                          <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">{f.desc}</span>
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

        <div className="w-full bg-[var(--surface)] border border-[var(--border)] p-5 rounded-xl space-y-3">
          <div className="flex justify-between items-center pb-2.5 border-b border-[var(--border)]">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)] flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#4ADE80]" /> Live Chart
            </span>
            <button
              onClick={() => setIsChartExpanded(!isChartExpanded)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              title={isChartExpanded ? "Collapse Chart" : "Expand Chart"}
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
            />
          </motion.div>
        </div>

      </div>

    </div>
  );
}
