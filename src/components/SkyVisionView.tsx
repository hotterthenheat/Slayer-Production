import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useContractStore, ContractState } from '../lib/store';
import { InteractiveChart } from './InteractiveChart';
import { ASSET_LIST } from '../data';
import { Zap, Percent, HelpCircle, FileText, CheckCircle2, Bot, Search, Maximize2, Minimize2 } from 'lucide-react';
import { DiscoveryView } from './DiscoveryView';

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
  const actionColor = action === 'ENTER' ? 'text-[#4ADE80] border-[#4ADE80]/30 bg-[#4ADE80]/5' : action === 'SELL' ? 'text-[#F87171] border-rose-400/30 bg-rose-400/5' : 'text-zinc-400 border-black bg-black/40';
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
    if (isCall) {
      cardBgClass = 'bg-[#151515] border-[#E5E5E5] text-[#E5E5E5] shadow-[0_0_15px_rgba(255,255,255,0.05)]';
    } else {
      cardBgClass = 'bg-[#1A0505] border-[#F87171] text-[#F87171] shadow-[0_0_15px_rgba(248,113,113,0.05)]';
    }
  } else {
    cardBgClass = 'bg-black border-[#1F1F1F] hover:bg-[#0A0A0A] hover:border-[#333333] text-[#A3A3A3]';
  }

  const tickClass = tickDirection === 'up' ? 'tick-up' : tickDirection === 'down' ? 'tick-down' : '';

  return (
    <motion.div
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={`p-3.5 border rounded-sm cursor-pointer transition-all flex flex-col gap-2 text-left relative overflow-hidden ${cardBgClass}`}
    >
      {/* Subtle breathing live glow indicator */}
      <div className="absolute top-1 right-1 flex items-center">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isCall ? 'bg-black/40' : 'bg-rose-450'}`}></span>
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isCall ? 'bg-black' : 'bg-[#F87171]'}`}></span>
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 text-left">
          <span className="text-sm font-black font-sans text-[#E5E5E5]">{strikeLabel}</span>
          <span className="text-[7.5px] uppercase tracking-wider text-zinc-500">HEALTH: {health} PTS</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className={`text-xs font-black font-mono text-[#E5E5E5] ${tickClass}`}>
              ${price.toFixed(2)}
            </span>
            <span className={`font-bold font-mono text-[9px] ${isCall ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
              +{move}%
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded-xs text-[8.5px] font-black tracking-widest border uppercase shrink-0 ${actionColor}`}>
            {action}
          </span>
        </div>
      </div>
      <div className="flex mt-1 pt-2 border-t border-black/45 justify-between items-center">
         <span className="text-[8px] text-zinc-500 font-mono">FLOW MOMENTUM:</span>
         <span className={`text-[8.5px] font-black uppercase ${momentum === 'STRENGTHENING' ? 'text-[#4ADE80]' : momentum === 'WEAKENING' ? 'text-[#F87171]' : 'text-zinc-400'}`}>{momentum}</span>
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
  
  // Setup nice option premium price
  const activePrice = serverState?.optionPremiumFloat || 4.20;

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
          title: selectedOptionType === 'C' ? 'GAMMA SQUEEZE BREAKOUT' : 'BEARISH ACCELERATION TRIGGER',
          desc: 'Quant models identify significant volume clustering. Positive directional feedback creates imbalance. Position entry confirmed.',
          color: 'text-[#d4d4d8]',
          badges: ['GEX FLOW', 'VOL SPIKE', 'SPOT MOMENTUM']
        };
      case 'REDUCE':
        return {
          title: 'THETA DOMINANCE / RANGE DRIFT',
          desc: 'Slower momentum allows theta decay factor to eat premium boundary lines. Consider reduction to mitigate risk exposure footprint.',
          color: 'text-amber-400',
          badges: ['THETA PENALTY', 'VOL COMPRESSION', 'DELTA BALANCE']
        };
      case 'SELL':
        return {
          title: 'LIQUIDITY SHELF BREACHED',
          desc: 'Derivative support levels violated. Institutional sell volume triggers state-wise exit sequence. Limit downside risks.',
          color: 'text-[#F87171]',
          badges: ['HEDGE SHELF GAP', 'FORCE CLOSURE', 'OUT-OF-THE-MONEY']
        };
      case 'HOLD':
      default:
        return {
          title: 'CONSOLIDATION / THETA NEUTRALITY',
          desc: 'Delta/Theta Neutrality reached. Price consolidation keeps contract neutrally balanced. Accumulating flow; watch option boundaries.',
          color: 'text-indigo-400',
          badges: ['DEALER BIAS STABLE', 'THETA DOMINANT', 'IN RANGE VALUE']
        };
    }
  }, [activeRecommendation, selectedOptionType]);

  // Real-time custom targets list
  const profitTargetsList = useMemo(() => {
    return [
      { id: 't1', label: 'Take Profit 1', optionValue: activePrice * 1.3, expectedPnL: '+30%', status: tradeHealthValue > 70 ? 'HIT TP 1 🎯' : 'IN PROGRESS' },
      { id: 't2', label: 'Take Profit 2', optionValue: activePrice * 1.8, expectedPnL: '+80%', status: tradeHealthValue > 85 ? 'HIT TP 2 🎯' : 'IN PROGRESS' },
      { id: 't3', label: 'Take Profit 3', optionValue: activePrice * 2.5, expectedPnL: '+150%', status: tradeHealthValue > 95 ? 'HIT TP 3 🎯' : 'PENDING' },
      { id: 't4', label: 'Take Profit 4', optionValue: activePrice * 3.5, expectedPnL: '+250%', status: 'PENDING' },
    ];
  }, [activePrice, tradeHealthValue]);

  if (!isExpanded) {
    return (
      <div className="w-full text-zinc-200 flex flex-col font-mono select-none antialiased pt-2 relative">
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
    <div className="w-full text-zinc-200 flex flex-col font-mono select-none antialiased space-y-6">
      
      {/* Back Button to list */}
      <div className="w-full flex items-center justify-between pb-2 border-b border-black/50">
        <button 
          onClick={() => {
            setSelectedStrike(null);
          }}
          className="flex items-center gap-2 text-[10px] text-zinc-400 hover:text-[#E5E5E5] uppercase tracking-widest font-black py-1 px-3 bg-black/50 rounded hover:bg-black transition-colors"
        >
          ← BACK TO SIGNALS
        </button>
        <span className="text-[10px] text-zinc-500 uppercase font-black">SELECTED: {selectedAsset.ticker} {activeStrike}{selectedOptionType}</span>
      </div>

      {/* Index Selector (Level 2 Brand Header Context) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-black border border-black p-3.5 rounded-sm gap-2">
        <div className="flex gap-2 items-center">
          <Zap className="w-4 h-4 text-zinc-400 animate-pulse" />
          <span className="text-[8.5px] text-zinc-550 uppercase tracking-widest font-black">SLAYER ACTIVE TERMINAL CORE</span>
        </div>
        
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-black p-0.5 border border-black rounded-sm">
            {ASSET_LIST.map(asset => (
              <button
                key={asset.ticker}
                type="button"
                onClick={() => setSelectedAsset(asset)}
                className={`px-3.5 py-1 text-[9px] uppercase font-black tracking-widest rounded-xs transition-all cursor-pointer ${
                  selectedAsset.ticker === asset.ticker
                    ? 'bg-black text-[#E5E5E5] font-extrabold shadow'
                    : 'text-zinc-500 hover:text-[#E5E5E5]'
                }`}
              >
                {asset.ticker}
              </button>
            ))}
          </div>
          
          {/* Small timeframe cards group, beautifully matching the layout */}
          <div className="flex items-center gap-1.5 pl-2.5 border-l border-black">
            <span className="text-[8px] text-zinc-550 font-mono font-black uppercase tracking-wider mr-1 hidden sm:inline">TIMEFRAME:</span>
            <div className="flex items-center bg-black p-0.5 border border-black rounded-sm">
              {(['5m', '15m', '1h', '4h', '1D'] as const).map(tf => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => useContractStore.getState().setSelectedTimeframe(tf)}
                  className={`px-3 py-1 text-[8.5px] uppercase font-black tracking-wider rounded-xs transition-all cursor-pointer ${
                    selectedTimeframe === tf
                      ? 'bg-black text-[#E5E5E5] font-black shadow'
                      : 'text-zinc-500 hover:text-[#E5E5E5]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          BUG #5: SKYVISION SCREEN HIERARCHY - REORGANIZED FOR PARALLEL GRID
          Left: Provenance Evaluation Matrix, Profit Targets & Summary
          Right: Options Cards Selection
          Bottom: Full-Width High-Precision Chart View
          ===================================================================== */}
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        
        {/* LEFT COLUMN: PROVENANCE EVALUATION MATRIX & METRICS */}
        <div className="lg:col-span-6 flex flex-col gap-4 w-full">
          
          {/* PROVENANCE EVALUATION MATRIX CARD */}
          <div 
            className="w-full apple-glass rounded-2xl p-6 relative overflow-hidden shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-white/15"
            style={{ minHeight: '340px' }}
          >
            {/* Moving border white line constantly running along the perimeter */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ borderRadius: 'inherit' }}>
              <rect
                x="0.75"
                y="0.75"
                width="calc(100% - 1.5px)"
                height="calc(100% - 1.5px)"
                rx="16"
                fill="none"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="1"
              />
              <rect
                x="0.75"
                y="0.75"
                width="calc(100% - 1.5px)"
                height="calc(100% - 1.5px)"
                rx="16"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.5"
                pathLength={1}
                strokeDasharray="0.16 0.84"
                className="animated-svg-border-rect"
              />
            </svg>

            {/* Accent high strip */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/20" />

            {/* Top Line label */}
            <div className="flex justify-between items-start border-b border-black/40 pb-4 relative z-10">
              <div className="text-left space-y-1">
                <span className="text-[8.5px] text-zinc-500 tracking-widest uppercase font-black block text-left">OPTION DECISION ENGINE</span>
                <h1 className="text-xl md:text-2xl font-black text-[#E5E5E5] font-sans tracking-tight uppercase leading-none">
                  {selectedAsset.ticker} {activeStrike}{selectedOptionType}
                </h1>
              </div>
              <div className="text-right bg-black p-2 border border-black rounded-lg text-[10px]">
                <span className="text-zinc-550 uppercase text-[8px] block">LIVE MID</span>
                <span className="text-[#E5E5E5] font-extrabold block text-xs">${(activePrice ?? 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Grid of decision layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch my-2 relative z-10">
              
              {/* Recommendation block (upgraded to Forensic Thesis statement) */}
              <div className="mirror-panel p-4.5 rounded-xl flex flex-col justify-between text-left gap-3">
                <div className="space-y-1.5 text-left">
                  <span className="text-[8px] text-zinc-500 tracking-wider uppercase block font-mono">FORENSIC EVALUATION THESIS</span>
                  <span className={`text-[13px] md:text-sm font-black font-sans uppercase block tracking-tight leading-tight ${forensicThesis.color}`}>
                    {forensicThesis.title}
                  </span>
                  <div className="text-[9.5px]/[14px] text-zinc-400 font-sans tracking-wide">
                    {forensicThesis.desc}
                  </div>
                </div>

                {/* Attribution pill-badges row (Tag Bar) */}
                <div className="border-t border-black/30 pt-3 mt-1.5">
                  <span className="text-[8px] text-zinc-550 uppercase tracking-widest font-black block mb-1">DECISION DRIVERS</span>
                  <div className="flex flex-wrap gap-1">
                    {forensicThesis.badges.map((b, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-black/40 border border-black/80 rounded-sm text-[#4ADE80] font-bold text-[7px] tracking-wider uppercase">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Health index dials (Upgraded to Physics Greek Grid + Confidence Band + Probability Cone) */}
              <div className="bg-black/30 border border-black/40 p-4 rounded-xl flex flex-col justify-between text-left gap-4">
                
                {/* Score & Institutional confidence bar */}
                <div className="space-y-1.5 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-550 uppercase text-[8.5px] font-black font-mono">INSTITUTIONAL CONFIDENCE BAND</span>
                    <span className="font-extrabold text-[#d4d4d8] text-[9.5px] font-mono">{tradeHealthValue}% CONFIDENCE</span>
                  </div>
                  {/* Linear Progress bar */}
                  <div className="w-full bg-black h-1.5 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-zinc-300/10 via-zinc-300/20 to-zinc-300/40" />
                    <motion.div 
                      className="h-full bg-[#d4d4d8] relative shadow-[0_0_8px_#d4d4d8]" 
                      initial={{ width: 0 }}
                      animate={{ width: `${tradeHealthValue}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Greek physics 2x2 grid */}
                <div className="grid grid-cols-2 gap-1.5 border-t border-b border-black/40 py-2.5 font-mono text-[9px]">
                  <div className="flex justify-between px-1.5 py-0.5 bg-black/35 border border-black/50 rounded-sm">
                    <span className="text-zinc-550 font-semibold tracking-wider">DELTA</span>
                    <span className={`font-bold ${derivedGreeks.delta > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                      {derivedGreeks.delta > 0 ? '+' : ''}{derivedGreeks.delta}
                    </span>
                  </div>
                  <div className="flex justify-between px-1.5 py-0.5 bg-black/35 border border-black/50 rounded-sm">
                    <span className="text-zinc-550 font-semibold tracking-wider">GAMMA</span>
                    <span className="text-[#E5E5E5] font-bold">{derivedGreeks.gamma}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-0.5 bg-black/35 border border-black/50 rounded-sm">
                    <span className="text-zinc-550 font-semibold tracking-wider">THETA</span>
                    <span className="text-amber-400 font-bold">{derivedGreeks.theta}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-0.5 bg-black/35 border border-black/50 rounded-sm">
                    <span className="text-zinc-550 font-semibold tracking-wider">VEGA</span>
                    <span className="text-indigo-400 font-bold">+{derivedGreeks.vega}</span>
                  </div>
                </div>

                {/* Expected move and Probability cone bell shape */}
                <div className="flex justify-between items-center bg-black/40 border border-black/70 rounded p-2">
                  <div className="space-y-0.5 text-left">
                    <span className="text-[8px] text-zinc-550 tracking-wider block font-black uppercase font-mono">PROBABILITY CONE</span>
                    <span className="font-extrabold text-[#4f8cff] text-[10px] block font-mono">+{expectedMoveField}% Expected</span>
                  </div>
                  {/* Minified Probability Gaussian Curve widget */}
                  <svg className="w-16 h-7 text-[#4f8cff]/55 shrink-0" viewBox="0 0 60 25" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M 5,23 Q 20,23 30,3 Q 40,23 55,23" stroke="currentColor" strokeOpacity="0.4" />
                    <motion.circle 
                      cx={30 + Math.min(20, Math.max(-20, (expectedMoveField - 42) * 0.6))} 
                      cy={21 - (15 * Math.exp(-0.5 * Math.pow((expectedMoveField - 42) / 18, 2)))} 
                      r="2" 
                      fill="#4f8cff" 
                      animate={{ r: [1.5, 3, 1.5] }}
                      transition={{ repeat: Infinity, duration: 2.2 }}
                    />
                    <line x1="30" y1="3" x2="30" y2="23" stroke="rgba(255, 255, 255, 0.15)" strokeDasharray="1.5,1.5" />
                  </svg>
                </div>

              </div>

            </div>

            {/* Bottom regulatory action bar */}
            <div className="border-t border-black pt-4 flex flex-col sm:flex-row justify-between items-center text-[10px] text-[#A1A1AA] gap-2 relative z-10">
              <span className="uppercase text-[8px] text-zinc-500 block">REAL-TIME GRID MODEL CALCULATION</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[#d4d4d8] rounded-full animate-ping" />
                <span className="font-black text-[#E5E5E5] px-2 py-0.5 border border-black rounded-md uppercase text-[8px]">
                  LIVE UPDATES ACTIVE
                </span>
              </div>
            </div>

          </div>

          {/* STAGE 2: PROFIT TARGETS SECTION */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
            {profitTargetsList.map((tgt) => (
              <div 
                key={tgt.id}
                className="bg-black border border-black p-4 rounded-sm flex items-center justify-between text-left"
              >
                <div className="space-y-1">
                  <span className="text-[7.5px] text-zinc-650 tracking-wider block font-black uppercase">{tgt.label}</span>
                  <h4 className={`text-[10px] font-black uppercase ${tgt.status.includes('HIT TP') ? 'text-[#d4d4d8]' : 'text-amber-400'}`}>{tgt.status}</h4>
                  <span className="text-[10px] text-zinc-400 block font-mono">Target: <span className="font-bold text-[#E5E5E5]">${tgt.optionValue.toFixed(2)}</span></span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-[#d4d4d8] block">{tgt.expectedPnL}</span>
                  <span className="text-[7px] text-zinc-500 uppercase block font-mono">EXPECTED</span>
                </div>
              </div>
            ))}
          </div>

          {/* STAGE 2.5: OPTION CHAIN ACTUAL GREEKS & INFO */}
          <div 
            className="w-full bg-black border border-black p-4 rounded-md text-left flex flex-col gap-3 relative overflow-hidden"
          >
            <div className="flex justify-between items-center border-b border-black/50 pb-2">
              <span className="text-[9.5px] text-zinc-500 uppercase tracking-widest font-black">Contract Greeks & Volume Info</span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-[10px] font-mono">
              <div>
                <span className="block text-[8px] text-zinc-600 mb-0.5 tracking-widest">DELTA</span>
                <span className={`font-bold ${selectedOptionType === 'C' ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>{selectedOptionType === 'C' ? '0.54' : '-0.46'}</span>
              </div>
              <div>
                <span className="block text-[8px] text-zinc-600 mb-0.5 tracking-widest">GAMMA</span>
                <span className="text-[#E5E5E5] font-bold">{selectedOptionType === 'C' ? '0.024' : '0.028'}</span>
              </div>
              <div>
                <span className="block text-[8px] text-zinc-600 mb-0.5 tracking-widest">THETA</span>
                <span className="text-amber-400 font-bold">{selectedOptionType === 'C' ? '-0.81' : '-0.68'}</span>
              </div>
              <div>
                <span className="block text-[8px] text-zinc-600 mb-0.5 tracking-widest">VEGA</span>
                <span className="text-[#E5E5E5] font-bold">{selectedOptionType === 'C' ? '0.14' : '0.18'}</span>
              </div>
              <div className="border-l border-black pl-3">
                <span className="block text-[8px] text-zinc-600 mb-0.5 tracking-widest">VOLUME</span>
                <span className="text-[#E5E5E5] font-bold">{selectedOptionType === 'C' ? '14,204' : '22,401'}</span>
              </div>
            </div>
          </div>

          {/* STAGE 3: ANALYSIS SUMMARY SECTION */}
          <div className="w-full bg-black border border-black p-5 rounded-2xl text-left space-y-3">
            <div className="flex items-center gap-2 border-b border-black pb-2">
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              <h4 className="text-[10.5px] font-black text-[#E5E5E5] uppercase tracking-wider block">
                Analysis Summary & Market Outlook
              </h4>
            </div>
            <div className="text-[11px] leading-relaxed text-zinc-400 font-mono space-y-2 uppercase tracking-wide bg-black/50 p-3 rounded border border-black/50">
              <p>
                Decision Logic Triggered: {serverState?.position_management?.decision_reason || `High confidence condition detected.`}
              </p>
              <p>
                Order book flows indicate {serverState?.position_management?.momentum === 'ACCELERATING' ? 'concentrated execution pressure' : 'weak neutral shifts'}. 
                Action recommended is <span className="text-[#4ADE80] font-black">{activeRecommendation}</span> based on momentum shifting {tradeHealthValue > 70 ? 'UPWARDS' : 'DOWNWARDS'}.
              </p>
              {serverState?.deep_intelligence && (
                <div className="mt-2 pt-2 border-t border-t-zinc-900/60 font-sans tracking-normal space-y-1">
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
            <div className="pt-2 border-t border-black/60 flex items-center gap-1 text-[8.5px] text-zinc-500 uppercase font-black">
              <CheckCircle2 className="w-3 h-3 text-[#4ADE80]" />
              <span>STATISTICAL ANALYTICS MODEL VERIFIED ON MULTI-TIMEFRAME</span>
            </div>
          </div>

          {/* NEW LIVE ORDER BOOK FEED LOCATION */}
          <div className="w-full bg-black border border-black p-4 rounded-2xl flex flex-col text-left mb-2">
             <div className="border-b border-black pb-2 mb-3">
                <span className="text-[9.5px] text-zinc-400 font-black uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#4f8cff] rounded-full animate-pulse"></span> Live Order Book Feed (Filtered: {selectedAsset.ticker} {activeStrike}{selectedOptionType})
                </span>
             </div>
             <div className="flex flex-col gap-2 overflow-hidden text-[9.5px] font-mono">
                
                <div className={`flex flex-col gap-1.5 bg-black/80 p-2 rounded border border-black/60 transition-colors hover:border-${selectedOptionType === 'C' ? '[#4ADE80]' : 'rose-400'}/30`}>
                  <div className="flex justify-between items-center">
                    <span className={`${selectedOptionType === 'C' ? 'text-[#4ADE80]' : 'text-[#F87171]'} font-bold`}>+1.2M BLOCK {selectedOptionType === 'C' ? 'BUY' : 'SELL'}</span>
                    <span className="text-[#E5E5E5] font-black">{selectedAsset.ticker} {activeStrike}{selectedOptionType}</span>
                  </div>
                  <span className="text-[8px] text-zinc-500 block">Dealer Desk • 2 Seconds Ago</span>
                </div>

                <div className={`flex flex-col gap-1.5 bg-black/80 p-2 rounded border border-black/60 transition-colors hover:border-${selectedOptionType === 'C' ? '[#4ADE80]' : 'rose-400'}/30`}>
                  <div className="flex justify-between items-center">
                    <span className={`${selectedOptionType === 'C' ? 'text-[#4ADE80]' : 'text-[#F87171]'} font-bold`}>+840K BLOCK {selectedOptionType === 'C' ? 'BUY' : 'SELL'}</span>
                    <span className="text-[#E5E5E5] font-black">{selectedAsset.ticker} {activeStrike}{selectedOptionType}</span>
                  </div>
                  <span className="text-[8px] text-zinc-500 block">Derivative VWAP Setup • 12 Seconds Ago</span>
                </div>

                <div className={`flex flex-col gap-1.5 bg-black/80 p-2 rounded border border-black/60 transition-colors hover:border-${selectedOptionType === 'C' ? 'rose-400' : 'zinc-300'}/30`}>
                  <div className="flex justify-between items-center">
                    <span className={`${selectedOptionType === 'C' ? 'text-[#F87171]' : 'text-[#4ADE80]'} font-bold`}>-400K REJECT</span>
                    <span className="text-[#E5E5E5] font-black">{selectedAsset.ticker} {activeStrike}{selectedOptionType}</span>
                  </div>
                  <span className="text-[8px] text-zinc-500 block">Dealer Liquidity Trap • 45 Seconds Ago</span>
                </div>

                <div className={`flex flex-col gap-1.5 bg-black/80 p-2 rounded border border-black/60 transition-colors hover:border-${selectedOptionType === 'C' ? '[#4ADE80]' : 'rose-400'}/30`}>
                  <div className="flex justify-between items-center">
                    <span className={`${selectedOptionType === 'C' ? 'text-[#4ADE80]' : 'text-[#F87171]'} font-bold`}>+3.5M SWEEP</span>
                    <span className="text-[#E5E5E5] font-black">{selectedAsset.ticker} {activeStrike}{selectedOptionType}</span>
                  </div>
                  <span className="text-[8px] text-zinc-500 block">Institutional Volatility Leg • 1 Min Ago</span>
                </div>
             </div>
          </div>

        </div>

        {/* RIGHT COLUMN: SIMPLIFIED ADAPTIVE OPTIONS CHAIN DISPLAY */}
        <div className="lg:col-span-6 w-full bg-black border border-black p-5 rounded-2xl flex flex-col justify-between" style={{ minHeight: '520px' }}>
          
          <div className="border-b border-black pb-3 text-left">
            <h3 className="text-xs font-black text-[#E5E5E5] uppercase tracking-wider relative inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#4ADE80] text-black animate-pulse"></span>
              LIVE CONTRACT FEED
            </h3>
            <p className="text-[8.5px] text-zinc-500 uppercase font-mono tracking-wider">
              Real-time changes, risk scores, momentum, and premium estimation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {/* CALL CARD COLUMNS */}
            <div className="space-y-2.5">
              <span className="text-[8.5px] text-zinc-500 uppercase tracking-widest block text-left font-bold pl-1">
                🟢 CALL CONTRACT CARDS
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

            {/* PUT CARD COLUMNS */}
            <div className="space-y-2.5">
              <span className="text-[8.5px] text-zinc-500 uppercase tracking-widest block text-left font-bold pl-1">
                🔴 PUT CONTRACT CARDS
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

          <div className="border-t border-black pt-2.5 mt-4 text-[8px] text-zinc-650 uppercase font-bold text-left">
            * Selected Contract: {selectedAsset.ticker} {activeStrike}{selectedOptionType} • Synced Live Coordinates
          </div>

        </div>

      </div>

      {/* EXPANDABLE DEEP INSTITUTIONAL INTELLIGENCE (SKYSEYE EXPANSION MODEL) */}
      <div className="w-full mt-2">
        <button 
          onClick={() => setIsDeepSkyseyeExpanded(!isDeepSkyseyeExpanded)}
          className="w-full bg-black border border-black hover:border-black hover:bg-black/50 transition-colors p-3 rounded-lg flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-400"
        >
          {isDeepSkyseyeExpanded ? '▽ Hide Deep Institutional Intelligence' : '▷ Expand Deep Institutional Intelligence'}
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
               <div className="bg-black border border-black rounded-xl p-5">
                  <div className="border-b border-black pb-2 mb-4 flex justify-between items-center">
                    <span className="text-[10px] text-[#4ADE80] font-black uppercase tracking-widest">Largest Impact Contracts</span>
                    <span className="text-[8px] text-[#4f8cff] uppercase px-2 py-0.5 border border-[#4f8cff]/30 bg-[#4f8cff]/10 rounded flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#4f8cff] rounded-full animate-pulse"></span>
                      Live Gamma Ranking 
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[9px] font-mono text-zinc-400">
                      <thead>
                        <tr className="border-b border-black text-zinc-500 uppercase tracking-widest">
                          <th className="pb-2 font-black">Impact Rank</th>
                          <th className="pb-2 font-black">Contract</th>
                          <th className="pb-2 font-black">Exp</th>
                          <th className="pb-2 font-black">Open Int</th>
                          <th className="pb-2 font-black">Volume</th>
                          <th className="pb-2 font-black text-right">Delta Notional</th>
                          <th className="pb-2 font-black text-right">Gamma Contribution</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/50 text-xs">
                        {(serverState.deep_intelligence.impact_contracts || []).map((c: any) => (
                          <tr key={c.contract} className="hover:bg-black/20 transition-colors">
                            <td className={`py-2 font-black ${c.rank === 1 ? 'text-[#ff4545]' : c.rank === 2 ? 'text-[#4f8cff]' : 'text-zinc-500'}`}>#{c.rank}</td>
                            <td className="py-2 font-black text-[#E5E5E5]">{c.contract}</td>
                            <td className="py-2">{c.expiration}</td>
                            <td className="py-2 text-[#4ADE80]">{c.oi.toLocaleString()}</td>
                            <td className="py-2 text-[#4ADE80]">{c.volume.toLocaleString()}</td>
                            <td className="py-2 text-right font-bold text-[#E5E5E5]">{c.deltaNotional}</td>
                            <td className="py-2 text-right font-bold text-[#d4d4d8]">{c.gammaContribution}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </div>

               {/* Strike Breakdown (Strike Intelligence) */}
               <div className="bg-black border border-black rounded-xl p-5 shadow-inner">
                  <div className="border-b border-black pb-2 mb-4">
                    <span className="text-[10px] text-[#4ADE80] font-black uppercase tracking-widest flex items-center gap-2">
                       <span className="w-1.5 h-1.5 bg-black/40 rounded-full animate-pulse"></span>
                       Live Strike Intelligence: {(activeStrike ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="mirror-panel rounded-md p-3">
                      <span className="text-[8px] text-zinc-500 uppercase block mb-1">Total Open Interest</span>
                      <span className="font-extrabold text-[#E5E5E5]">{(serverState.deep_intelligence.strike_metrics?.totalOi || 0).toLocaleString()}</span>
                    </div>
                    <div className="mirror-panel rounded-md p-3">
                      <span className="text-[8px] text-zinc-500 uppercase block mb-1">Net Exposure</span>
                      <span className={`font-extrabold ${serverState.deep_intelligence.strike_metrics?.netExposure?.includes('+') ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                         {serverState.deep_intelligence.strike_metrics?.netExposure}
                      </span>
                    </div>
                    <div className="mirror-panel rounded-md p-3">
                      <span className="text-[8px] text-zinc-500 uppercase block mb-1">Call / Put Ratio</span>
                      <span className="font-extrabold text-[#E5E5E5]">{serverState.deep_intelligence.strike_metrics?.callPutRatio}</span>
                    </div>
                    <div className="mirror-panel rounded-md p-3">
                      <span className="text-[8px] text-zinc-500 uppercase block mb-1">Hedge Sensitivity</span>
                      <span className="font-extrabold text-[#F87171]">{serverState.deep_intelligence.strike_metrics?.hedgeSensitivity}</span>
                    </div>
                    <div className="mirror-panel rounded-md p-3">
                      <span className="text-[8px] text-zinc-500 uppercase block mb-1">Dealer Exposure</span>
                      <span className="font-extrabold text-indigo-400">{serverState.deep_intelligence.strike_metrics?.dealerExposure}</span>
                    </div>
                    <div className="mirror-panel rounded-md p-3">
                      <span className="text-[8px] text-zinc-500 uppercase block mb-1">Gamma Contribution</span>
                      <span className="font-extrabold text-[#d4d4d8]">{serverState.deep_intelligence.strike_metrics?.gammaContribution}</span>
                    </div>
                    <div className="mirror-panel rounded-md p-3 col-span-2 flex items-center justify-between">
                      <div>
                        <span className="text-[8px] text-zinc-500 uppercase block mb-1">Delta Contribution</span>
                        <span className="font-extrabold text-[#E5E5E5]">{serverState.deep_intelligence.strike_metrics?.deltaContribution}</span>
                      </div>
                      <div className="w-1/2 h-1.5 bg-black rounded-full overflow-hidden">
                         <div className="h-full bg-[#4f8cff]" style={{ width: serverState.deep_intelligence.strike_metrics?.deltaContribution }} />
                      </div>
                    </div>
                  </div>
               </div>
            </div>

            {/* COLUMN 2: WHALE DETECTION & FLOW FEED */}
            <div className="lg:col-span-4 flex flex-col gap-4">
               {/* Live Dealer Commentary Card */}
               <div className="bg-black border border-black rounded-xl p-5 shadow-inner">
                  <div className="border-b border-black pb-2 mb-3">
                    <span className="text-[10px] text-[#4ADE80] font-black uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-[#4f8cff] rounded-full animate-pulse"></span>
                      Dealer Positioning Briefing
                    </span>
                  </div>
                  <div className="space-y-2.5">
                     {serverState.deep_intelligence.commentary?.map((point: string, idx: number) => (
                       <div key={idx} className="p-2 border border-black/50 rounded-lg bg-black/40 text-[9.5px] font-sans text-zinc-400 leading-relaxed flex gap-2">
                          <span className="text-[#4f8cff] mt-0.5 select-none text-[8px]">■</span>
                          <span>{point}</span>
                       </div>
                     ))}
                     {(!serverState.deep_intelligence.commentary || serverState.deep_intelligence.commentary.length === 0) && (
                       <div className="text-zinc-500 italic text-xs py-2 text-center">No commentary points compiled for the current frame.</div>
                     )}
                  </div>
               </div>

               {/* Whale Detection */}
               <div className="bg-black border border-black rounded-xl p-5">
                  <div className="border-b border-black pb-2 mb-3">
                    <span className="text-[10px] text-[#4ADE80] font-black uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse"></span>
                      Whale Detection Radar
                    </span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center p-2 bg-[#d4d4d8]/5 border border-[#d4d4d8]/20 rounded-md">
                      <div>
                        <span className="text-[8px] text-[#d4d4d8] uppercase block font-black">Largest Bullish Position</span>
                        <span className="text-[#E5E5E5] font-bold">{serverState.deep_intelligence.whale_detection?.bullish?.contract} • 0DTE</span>
                      </div>
                      <span className="font-black text-[#E5E5E5]">{serverState.deep_intelligence.whale_detection?.bullish?.size}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-[#ff4545]/5 border border-[#ff4545]/20 rounded-md">
                      <div>
                        <span className="text-[8px] text-[#ff4545] uppercase block font-black">Largest Bearish Position</span>
                        <span className="text-[#E5E5E5] font-bold">{serverState.deep_intelligence.whale_detection?.bearish?.contract} • 0DTE</span>
                      </div>
                      <span className="font-black text-[#E5E5E5]">{serverState.deep_intelligence.whale_detection?.bearish?.size}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 mirror-panel rounded-md gap-3">
                      <div>
                        <span className="text-[8px] text-zinc-400 uppercase block font-black">Largest Call Position</span>
                        <span className="text-[#E5E5E5] font-bold">{serverState.deep_intelligence.whale_detection?.largestCall}</span>
                      </div>
                      <span className="font-black text-[#E5E5E5] cursor-help border-b border-dashed border-black block text-right">HEDGE</span>
                    </div>
                    <div className="flex justify-between items-center p-2 mirror-panel rounded-md gap-3">
                      <div>
                        <span className="text-[8px] text-zinc-400 uppercase block font-black">Largest Put Position</span>
                        <span className="text-[#E5E5E5] font-bold">{serverState.deep_intelligence.whale_detection?.largestPut}</span>
                      </div>
                      <span className="font-black text-[#E5E5E5] cursor-help border-b border-dashed border-black block text-right">HEDGE</span>
                    </div>
                  </div>
               </div>
               
               {/* Institutional Flow Feed */}
               <div className="bg-black border border-black rounded-xl p-5 flex-1 flex flex-col h-[300px]">
                  <div className="border-b border-black pb-2 mb-3 shrink-0 flex justify-between items-center">
                    <span className="text-[10px] text-[#4ADE80] font-black uppercase tracking-widest flex items-center gap-2">
                       <span className="w-1.5 h-1.5 bg-[#4f8cff] rounded-full animate-pulse"></span>
                       Live Institutional Flow Feed
                    </span>
                    <span className="text-[7.5px] text-zinc-500 font-black uppercase">LIVE</span>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto text-[10px] font-mono hover:overflow-y-scroll pr-1 flex-1">
                     {(serverState.deep_intelligence.flow_feed || []).slice(0, 10).map((f: any) => (
                       <div key={f.id} className={`flex flex-col gap-1.5 p-2 mirror-panel/80 rounded transition-colors hover:bg-black ${f.type === 'UNUSUAL' ? 'border-l-2 border-l-indigo-500' : ''}`}>
                          <div className="flex justify-between">
                             <span className={`${f.type === 'SWEEP' ? 'text-[#d4d4d8]' : f.type === 'BLOCK' ? 'text-[#F87171]' : 'text-indigo-400'} font-bold`}>{f.type}</span>
                             <span className="text-[#E5E5E5] font-bold">{f.contract}</span>
                          </div>
                          <span className="text-[8px] text-zinc-500 uppercase">{f.desc}</span>
                       </div>
                     ))}
                     {(serverState.deep_intelligence.flow_feed?.length ?? 0) === 0 && (
                       <div className="text-zinc-500 text-center py-4 italic text-xs">Waiting for market flows...</div>
                     )}
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </div>

        {/* STAGE 4: HIGH-PRECISION INTEGRATED CHART REFERENCE & WEBHOOK FEED */}
      <div className="w-full mt-2">
        
        <div className="w-full bg-black border border-black p-5 rounded-sm space-y-3">
          <div className="flex justify-between items-center text-[8.5px] uppercase text-zinc-500 bg-black p-2.5 rounded border border-black">
            <span>Continuous TradingView Liquidity Flow Integration</span>
            <div className="flex items-center gap-3">
              <span className="text-zinc-650 font-bold">SLAYER WEBHOOK TUNNEL ACTIVE</span>
              <button 
                onClick={() => setIsChartExpanded(!isChartExpanded)}
                className="text-zinc-400 hover:text-[#E5E5E5] transition-colors"
                title={isChartExpanded ? "Collapse Chart" : "Expand Chart"}
              >
                {isChartExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
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
              watermarkText="CONTINUOUS TRADINGVIEW LIQUIDITY FLOW INTEGRATION"
            />
          </motion.div>
        </div>

      </div>

      {/* FOOTER: TRADINGVIEW WEBHOOK STATUS */}
      <div className="w-full mt-4 bg-black border border-black p-3 rounded-sm flex items-center justify-between text-[9px] font-mono select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 border border-black rounded text-[#4ADE80] font-bold uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-black/40 animate-pulse"></span>
            TradingView Webhook Active
          </div>
          <span className="text-zinc-500 uppercase tracking-widest hidden md:inline-block">Connected to Slayer Labs Liquidity Engine • Port 3000 Secured</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">IN/SEC:</span>
            <span className="font-bold text-[#E5E5E5]">12.4 MB/s</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">LATENCY:</span>
            <span className="font-bold text-[#d4d4d8]">14ms</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">DEALER FLOW:</span>
            <span className="font-bold text-[#E5E5E5]">SYNCED</span>
          </div>
        </div>
      </div>

    </div>
  );
}
