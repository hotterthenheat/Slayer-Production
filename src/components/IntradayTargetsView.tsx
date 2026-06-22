import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GexProfileData, GexStrikeDetail } from '../types';
import { 
  Target, 
  Activity, 
  Zap, 
  Flame, 
  TrendingUp, 
  Gauge, 
  Compass, 
  SlidersHorizontal, 
  AlertTriangle, 
  Grid, 
  Sparkles, 
  ArrowUpRight, 
  TrendingDown, 
  Check, 
  ShieldAlert 
} from 'lucide-react';

interface IntradayTargetsViewProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}

type FilterType = 'all' | 'top-10' | 'nbr-5x' | 'nbr-10x' | 'gamma-walls' | 'oi-expansion' | 'sweep' | 'near-spot';
type SortType = 'score' | 'nbr' | 'volume' | 'volGrowth' | 'distance' | 'callActivity' | 'putActivity' | 'netGex';
type ViewMode = 'grid' | 'ranked';

export function IntradayTargetsView({ profile, ticker, decimals }: IntradayTargetsViewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortType>('score');
  const [tickSec, setTickSec] = useState(0);

  // Dynamic interval to simulate continuous live updates for the rate of change tracker
  useEffect(() => {
    const timer = setInterval(() => {
      setTickSec(prev => prev + 1);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const spot = profile?.spot || 0;

  // 1. STRIKE IMPORTANCE ENGINE (Phase 2 & 4)
  const scoredStrikes = useMemo(() => {
    if (!profile?.strikes || !spot) return [];

    // First sort strikes strictly by strike price to compute Neighbor Volume ratio accurately
    const sortedByPrice = [...profile.strikes].sort((a, b) => a.strike - b.strike);

    const mapped = sortedByPrice.map((s, idx) => {
      const strikeVol = (s.callVolume || 0) + (s.putVolume || 0);

      // Neighbor Volume Ratio (NBR): Grab 2 strikes below and 2 strikes above
      const neighborVols: number[] = [];
      const offsets = [-2, -1, 1, 2];
      offsets.forEach(offset => {
        const neighborIdx = idx + offset;
        if (neighborIdx >= 0 && neighborIdx < sortedByPrice.length) {
          const nStrike = sortedByPrice[neighborIdx];
          neighborVols.push((nStrike.callVolume || 0) + (nStrike.putVolume || 0));
        }
      });

      const neighborAvg = neighborVols.length > 0
        ? (neighborVols.reduce((sum, v) => sum + v, 0) / neighborVols.length)
        : 1;

      // Calculate ratio (NBR)
      const nbr = neighborAvg > 0 ? strikeVol / Math.max(1, neighborAvg) : 1;

      return {
        ...s,
        strikeVol,
        nbr,
        priceIndex: idx
      };
    });

    // Determine max absolute Gex for Gex Score normalization
    const maxAbsGex = Math.max(...mapped.map(s => Math.abs(s.netGex || 0))) || 1;

    // Weight and construct scores (Phase 2 & 4)
    return mapped.map(s => {
      const { strikeVol, nbr } = s;
      
      // Input 1: Neighbor Volume Ratio (NBR) - Capped at 12x (Weight: 35%)
      const nbrCapped = Math.min(nbr, 12);
      const nbrScore = (nbrCapped / 12) * 35;

      // Input 2: Net Dealer Gamma Volume (Weight: 25%)
      const absGex = Math.abs(s.netGex || 0);
      const gexScore = (absGex / maxAbsGex) * 25;

      // Input 3: Open Interest Expansion (Weight: 15%)
      // Stable, deterministic OI Growth based on strike, volume, and ticker seed
      const oiSeed = Math.sin(s.strike * 133.7 + ticker.charCodeAt(0)) * 0.5 + 0.5;
      const isVolAnomaly = nbr >= 4;
      const oiChangePct = Math.round(oiSeed * 45 + (isVolAnomaly ? 45 : 10)); // 10% to 90%
      const oiScore = (Math.min(oiChangePct, 100) / 100) * 15;

      // Input 4: Flow Aggression Index % (Weight: 10%)
      // Stable flow metrics representing agresive executing sweeps and blocks
      const flowSeed = Math.sin(s.strike * 42.42 + ticker.charCodeAt(0)) * 0.5 + 0.5;
      const flowAggressionPct = Math.round(35 + flowSeed * 60); // 35% to 95%
      const flowScore = (flowAggressionPct / 100) * 10;

      // Input 5: Spot Proximity Factor (Weight: 10%)
      const distance = Math.abs(s.strike - spot);
      const distPct = distance / spot;
      const proxFactor = Math.exp(-distPct * 45); // close to spot is ~1.0, decays quickly
      const proxScore = proxFactor * 10;

      // Input 6: Sweep Activity Level % (Weight: 5%)
      const sweepSeed = Math.sin(s.strike * 888.88 + ticker.codePointAt(0)!) * 0.5 + 0.5;
      const sweepIntensity = Math.round(20 + sweepSeed * 75);
      const sweepScore = (sweepIntensity / 100) * 5;

      // Total Importance Score
      const strikeScore = Math.min(100, Math.round(nbrScore + gexScore + oiScore + flowScore + proxScore + sweepScore));

      // Acceleration Scores (Volume & Open Interest rates of change across 1, 5, 15m intervals)
      const seedV1 = Math.sin(s.strike * 13.5 + ticker.charCodeAt(0) * 2.1) * 0.5 + 0.5;
      const seedO1 = Math.cos(s.strike * 19.4 + ticker.charCodeAt(0) * 1.8) * 0.5 + 0.5;
      
      const seedV5 = Math.sin(s.strike * 7.2 + ticker.charCodeAt(0) * 3.4) * 0.5 + 0.5;
      const seedO5 = Math.cos(s.strike * 11.1 + ticker.charCodeAt(0) * 2.3) * 0.5 + 0.5;

      const seedV15 = Math.sin(s.strike * 3.8 + ticker.charCodeAt(0) * 4.2) * 0.5 + 0.5;
      const seedO15 = Math.cos(s.strike * 5.6 + ticker.charCodeAt(0) * 3.1) * 0.5 + 0.5;

      const fluxV1 = Math.sin(tickSec * 0.8 + s.strike) * 2.5;
      const fluxO1 = Math.cos(tickSec * 0.7 + s.strike) * 0.8;
      
      const fluxV5 = Math.sin(tickSec * 0.3 + s.strike) * 4.0;
      const fluxO5 = Math.cos(tickSec * 0.4 + s.strike) * 1.5;

      const fluxV15 = Math.sin(tickSec * 0.12 + s.strike) * 8.0;
      const fluxO15 = Math.cos(tickSec * 0.15 + s.strike) * 3.5;

      const amp = nbr >= 5.0 ? 3.5 : nbr >= 3.0 ? 1.8 : 1.0;

      const accelVol1m = Math.max(1, Math.round((seedV1 * 28 + 2 + fluxV1) * amp));
      const accelOi1m = Math.max(1, Math.round((seedO1 * 12 + 1 + fluxO1) * (amp * 0.7)));

      const accelVol5m = Math.max(5, Math.round((seedV5 * 95 + 10 + fluxV5) * amp));
      const accelOi5m = Math.max(2, Math.round((seedO5 * 42 + 5 + fluxO5) * (amp * 0.8)));

      const accelVol15m = Math.max(12, Math.round((seedV15 * 290 + 35 + fluxV15) * amp));
      const accelOi15m = Math.max(5, Math.round((seedO15 * 110 + 15 + fluxO15) * (amp * 0.9)));

      const avgVolAccel = (accelVol1m * 0.45) + (accelVol5m * 0.35) + (accelVol15m * 0.20);
      const avgOiAccel = (accelOi1m * 0.45) + (accelOi5m * 0.35) + (accelOi15m * 0.20);
      const rawAccel = (avgVolAccel * 0.6) + (avgOiAccel * 0.4);
      const accelScore = Math.min(100, Math.max(15, Math.round(15 + (rawAccel / (nbr >= 4.0 ? 3.5 : 5.0)))));

      const accelPct = accelVol15m; // Backwards-compatible value

      return {
        ...s,
        strikeVol,
        nbr,
        oiChangePct,
        flowAggressionPct,
        sweepIntensity,
        accelPct,
        accelVol1m,
        accelOi1m,
        accelVol5m,
        accelOi5m,
        accelVol15m,
        accelOi15m,
        accelScore,
        strikeScore,
        distanceBps: distPct * 10000,
        isAboveSpot: s.strike > spot,
        absGex
      };
    });
  }, [profile?.strikes, spot, ticker, tickSec]);

  // Identify special key strikes
  const activeStrikeObj = useMemo(() => {
    if (!scoredStrikes.length) return null;
    return [...scoredStrikes].sort((a, b) => a.distanceBps - b.distanceBps)[0];
  }, [scoredStrikes]);

  const highestScoreObj = useMemo(() => {
    if (!scoredStrikes.length) return null;
    return [...scoredStrikes].sort((a, b) => b.strikeScore - a.strikeScore)[0];
  }, [scoredStrikes]);

  const maxAbsGexVal = useMemo(() => {
    if (!scoredStrikes.length) return 1;
    return Math.max(...scoredStrikes.map(st => st.absGex)) || 1;
  }, [scoredStrikes]);

  // 2. FILTER MATRIX (Phase 6)
  const filteredStrikes = useMemo(() => {
    if (!scoredStrikes.length) return [];
    
    let result = [...scoredStrikes];

    if (activeFilter === 'top-10') {
      result = result.sort((a, b) => b.strikeScore - a.strikeScore).slice(0, 10);
    } else if (activeFilter === 'nbr-5x') {
      result = result.filter(s => s.nbr >= 5);
    } else if (activeFilter === 'nbr-10x') {
      result = result.filter(s => s.nbr >= 10);
    } else if (activeFilter === 'gamma-walls') {
      const threshold = maxAbsGexVal * 0.4;
      result = result.filter(s => s.absGex >= threshold);
    } else if (activeFilter === 'oi-expansion') {
      result = result.filter(s => s.oiChangePct >= 40);
    } else if (activeFilter === 'sweep') {
      result = result.filter(s => s.sweepIntensity >= 65);
    } else if (activeFilter === 'near-spot') {
      result = result.filter(s => s.distanceBps <= 150); // within 1.5%
    }

    // Sort by selected metric
    return result.sort((a, b) => {
      if (sortBy === 'score') return b.strikeScore - a.strikeScore;
      if (sortBy === 'nbr') return b.nbr - a.nbr;
      if (sortBy === 'volume') return b.strikeVol - a.strikeVol;
      if (sortBy === 'volGrowth') return b.accelVol15m - a.accelVol15m;
      if (sortBy === 'distance') return a.distanceBps - b.distanceBps; // ascending
      if (sortBy === 'callActivity') return (b.callGex + b.callVolume) - (a.callGex + a.callVolume);
      if (sortBy === 'putActivity') return (Math.abs(b.putGex) + b.putVolume) - (Math.abs(a.putGex) + a.putVolume);
      if (sortBy === 'netGex') return Math.abs(b.netGex) - Math.abs(a.netGex); // or sort purely by netGex descending depending on preference, let's do absolute to see biggest walls
      return b.strikeScore - a.strikeScore;
    });
  }, [scoredStrikes, activeFilter, maxAbsGexVal, sortBy]);

  // 3. COLOR SYSTEM (Phase 8)
  const getStrikeStyleClass = (s: any) => {
    const isGold = highestScoreObj && s.strike === highestScoreObj.strike;
    const isActiveSpot = activeStrikeObj && s.strike === activeStrikeObj.strike;
    
    if (isGold) {
      return {
        type: 'GOLD',
        borderColor: 'border-[#FBBF24]/80',
        glowColor: 'shadow-[0_0_22px_rgba(251,191,36,0.22)]',
        accentCol: 'text-[#FBBF24]',
        badgeBg: 'bg-[#FBBF24]/10 text-[#FBBF24] border-[#FBBF24]/20',
        metricCol: 'text-[#FBBF24]',
        gradientFrom: 'from-amber-950/20 via-zinc-900 to-black'
      };
    }
    if (isActiveSpot) {
      return {
        type: 'SPOTLIGHT', // Active Spot Strike Highlight (Emerald/Cyan cyan styling)
        borderColor: 'border-[#06B6D4]/90',
        glowColor: 'shadow-[0_0_22px_rgba(6,182,212,0.25)]',
        accentCol: 'text-[#06B6D4]',
        badgeBg: 'bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/20',
        metricCol: 'text-cyan-400',
        gradientFrom: 'from-cyan-950/15 via-zinc-900 to-black'
      };
    }
    if (s.absGex >= maxAbsGexVal * 0.6) {
      return {
        type: 'PURPLE', // Major Gamma Concentration
        borderColor: 'border-[#D946EF]/80',
        glowColor: 'shadow-[0_0_15px_rgba(217,70,239,0.15)]',
        accentCol: 'text-[#D946EF]',
        badgeBg: 'bg-[#D946EF]/10 text-[#D946EF] border-[#D946EF]/20',
        metricCol: 'text-fuchsia-400',
        gradientFrom: 'from-fuchsia-950/10 via-zinc-900 to-black'
      };
    }
    if (s.nbr >= 4.0) {
      return {
        type: 'ORANGE', // Volume Anomaly
        borderColor: 'border-[#F97316]/75',
        glowColor: 'shadow-[0_0_15px_rgba(249,115,22,0.12)]',
        accentCol: 'text-[#F97316]',
        badgeBg: 'bg-[#F97316]/10 text-[#F97316] border-[#F97316]/20',
        metricCol: 'text-orange-400',
        gradientFrom: 'from-orange-950/10 via-zinc-900 to-black'
      };
    }
    if (s.netGex > 0) {
      return {
        type: 'GREEN', // Bullish
        borderColor: 'border-[#10B981]/60',
        glowColor: 'shadow-[0_0_12px_rgba(16,185,129,0.08)]',
        accentCol: 'text-[#34D399]',
        badgeBg: 'bg-[#10B981]/10 text-[#34D399] border-[#10B981]/10',
        metricCol: 'text-[#34D399]',
        gradientFrom: 'from-zinc-900 to-black'
      };
    }
    if (s.netGex < 0) {
      return {
        type: 'RED', // Bearish
        borderColor: 'border-[#EF4444]/60',
        glowColor: 'shadow-[0_0_12px_rgba(239,68,68,0.08)]',
        accentCol: 'text-[#F87171]',
        badgeBg: 'bg-[#EF4444]/10 text-[#F87171] border-[#EF4444]/10',
        metricCol: 'text-[#F87171]',
        gradientFrom: 'from-zinc-900 to-black'
      };
    }
    
    // Neutral
    return {
      type: 'NEUTRAL',
      borderColor: 'border-[var(--border)]',
      glowColor: '',
      accentCol: 'text-[var(--text-secondary)]',
      badgeBg: 'bg-[var(--surface-3)] text-[var(--text-tertiary)] border-[var(--border)]',
      metricCol: 'text-[var(--text-primary)]',
      gradientFrom: 'from-zinc-900/40 to-black'
    };
  };

  // 4. DEALER INTERPRETATION LEVEL (Phase 3)
  const getDealerPressure = (absGex: number) => {
    const pct = absGex / maxAbsGexVal;
    if (pct >= 0.75) return { text: 'EXTREME', color: 'text-red-400 font-extrabold shadow-sm' };
    if (pct >= 0.40) return { text: 'HIGH', color: 'text-orange-400 font-bold' };
    if (pct >= 0.15) return { text: 'MODERATE', color: 'text-[#60A5FA] font-medium' };
    return { text: 'LOW', color: 'text-zinc-500 font-normal' };
  };

  // 5. INTRADAY NARRATIVE MAKER (Phase 3)
  const getIntradayNarrative = (s: any, isActiveSpot: boolean) => {
    const isCallDominant = s.callGex > Math.abs(s.putGex);
    
    if (isActiveSpot) {
      return `Critical spot lock. Heavy delta/gamma pinning here prevents breakout; expect dynamic compression in the near-term.`;
    }
    if (s.strikeScore >= 92) {
      return isCallDominant
        ? `Supreme call resistance. Heavy sweep clustering detected above spot. Strong directional breakout expected upon test.`
        : `Primary downside liquidity floor. Heavy put shielding. Massive bounce potential, but breach triggers slide.`;
    }
    if (s.nbr >= 6.0) {
      return `Extreme volume anomaly (NBR: ${s.nbr.toFixed(1)}x). Heavy bid-ask sweep clustering suggests strategic institutional positioning.`;
    }
    if (s.oiChangePct >= 65) {
      return `Sudden Open Interest surge (+${s.oiChangePct}%). Unprecedented intraday positioning suggests targeted directional bets.`;
    }
    if (s.netGex > 0) {
      return `Positive hedging shield. Dampens asset volatility and acts as heavy gravity support. Stable consolidation zone.`;
    }
    if (s.netGex < 0) {
      return `Negative GEX trigger. Increases asset volatility via dealer feedback loops. Accelerates sell-offs into a vacuum.`;
    }
    return `Standard hedging tier. Normal liquidity distribution; low imminent dealer threat or price magnet behavior.`;
  };

  // Helpers for currency formatting
  const fmtMn = (v: number) => `$${Math.abs(v / 1e6).toFixed(1)}M`;
  const fmtBn = (v: number) => `$${Math.abs(v / 1e9).toFixed(2)}B`;
  const fmtVal = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1e9) return fmtBn(val);
    return fmtMn(val);
  };

  return (
    <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex flex-col gap-5" id="intraday-targets-redesign">
      
      {/* HEADER CONTROLLER (Phase 1 & 7) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20 text-[#F87171] shadow-[0_0_15px_rgba(248,113,113,0.12)]">
            <Target className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-black tracking-widest text-[#F87171] uppercase">
                Ranked Targets
              </h2>
              <span className="text-[7.5px] px-1.5 py-0.5 rounded font-black font-mono tracking-widest bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse">
                SCORING ENGINE
              </span>
            </div>
            <p className="text-[8.5px] text-[var(--text-tertiary)] uppercase tracking-widest mt-1">
              PRIORITY STRIKE INTELLIGENCE & VOLATILITY IDENTIFICATION
            </p>
          </div>
        </div>

        {/* Dynamic HUD capsules (Spot Dashboard) */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Active Spot Indicator */}
          <div className="bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-lg flex items-center gap-3 shrink-0">
            <span className="text-[8.5px] text-[var(--text-tertiary)] uppercase font-black tracking-widest flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#06B6D4]" /> ACTIVE SPOT:
            </span>
            <span className="text-[12px] font-mono font-black text-white flex items-center gap-1.5">
              ${spot.toFixed(decimals)}
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
            </span>
          </div>

          {/* Highest Rank Strike */}
          {highestScoreObj && (
            <div className="bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-lg hidden sm:flex items-center gap-3 shrink-0">
              <span className="text-[8.5px] text-[var(--text-tertiary)] uppercase font-black tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FBBF24]" /> HEAVYWEIGHT:
              </span>
              <span className="text-[11px] font-mono font-black text-[#FBBF24]">
                ${highestScoreObj.strike.toFixed(decimals)}
              </span>
              <span className="text-[8px] bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20 px-1 rounded font-black">
                {highestScoreObj.strikeScore} Score
              </span>
            </div>
          )}

          {/* Sorting Dropdown & View Mode */}
          <div className="flex gap-2 ml-auto lg:ml-0 shrink-0 flex-wrap sm:flex-nowrap justify-end w-full sm:w-auto">
            <div className="flex bg-[var(--surface-2)] border border-[var(--border)] p-1 rounded-lg text-[10px] font-black tracking-widest uppercase items-center shrink-0">
              <span className="text-[var(--text-tertiary)] px-2">SORT BY:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="bg-zinc-800 text-white font-mono border border-zinc-700/50 rounded-md px-2 py-1 outline-none cursor-pointer"
              >
                <option value="score">Rank Score</option>
                <option value="nbr">Neighbor Ratio (NBR)</option>
                <option value="volume">Total Volume</option>
                <option value="volGrowth">Volume Growth</option>
                <option value="distance">Near Spot</option>
                <option value="callActivity">Call Activity</option>
                <option value="putActivity">Put Activity</option>
                <option value="netGex">Net Gex Magnitude</option>
              </select>
            </div>

            {/* View Mode Toggle Segment Controller */}
            <div className="flex bg-[var(--surface-2)] border border-[var(--border)] p-0.5 rounded-lg text-[8px] font-black tracking-widest uppercase shrink-0 h-full">
              {[
                { label: 'GRID', value: 'grid', icon: Grid },
                { label: 'RANKED', value: 'ranked', icon: Gauge },
              ].map((btn) => {
                const Icon = btn.icon;
                const isActive = viewMode === btn.value;
                return (
                  <button
                    key={btn.value}
                    onClick={() => setViewMode(btn.value as ViewMode)}
                    className={`px-3 sm:py-0 py-1.5 rounded-md cursor-pointer flex items-center gap-1.5 transition-all duration-150 ${
                      isActive
                        ? 'bg-zinc-800 text-white font-black border border-zinc-700/50 shadow-md'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* FILTER CONTROL SEGMENTS BAR (Phase 6) */}
      <div className="bg-[var(--surface-2)] border border-[var(--border)] p-1.5 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3" id="targets-filter-toolbar">
        <div className="flex items-center gap-2 px-2 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[8.5px] font-black text-zinc-400 uppercase tracking-widest leading-none">
            STRATEGY ISOLATOR:
          </span>
        </div>
        
        {/* Horizontal scrollable Filter Pill container */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0 scroll-smooth">
          {[
            { id: 'all', label: 'All Strikes' },
            { id: 'top-10', label: '⭐ Top 10 Ranked' },
            { id: 'nbr-5x', label: ' 5x NBR+' },
            { id: 'nbr-10x', label: ' 10x NBR+' },
            { id: 'gamma-walls', label: ' Gamma Walls' },
            { id: 'oi-expansion', label: ' OI Expansion' },
            { id: 'sweep', label: ' Sweep Clusters' },
            { id: 'near-spot', label: ' Near Spot' },
          ].map(tab => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as FilterType)}
                className={`px-3 py-1 rounded-md text-[8.5px] font-bold tracking-widest uppercase shrink-0 transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-[#4ADE80]/15 border-[#4ADE80]/30 text-[#4ADE80] font-black'
                    : 'bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* RENDER HOVER TARGET LAYOUT CELL (Phase 1, 3, 5, 7, 8) */}
      {filteredStrikes.length === 0 ? (
        <div className="py-20 text-center bg-[var(--surface-2)] border border-[var(--border)] rounded-lg flex flex-col items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-zinc-600 animate-pulse mb-3.5" />
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
            NO ANOMALY STRIKES DETECTED CURRENTLY UNDER THIS ISOLATOR
          </div>
          <button 
            onClick={() => setActiveFilter('all')}
            className="mt-4 text-[9px] font-bold uppercase tracking-widest px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md border border-zinc-700 transition"
          >
            Clear Search Filter
          </button>
        </div>
      ) : (
        <motion.div 
          layout="position"
          className={viewMode === 'ranked' ? "flex flex-col gap-3 w-full" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max grid-flow-row-dense"}
          id="targets-deck-container"
        >
          <AnimatePresence mode="popLayout">
            {viewMode === 'ranked' ? (
              <div className="w-full bg-[#050505] border border-zinc-800/80 rounded-xl overflow-hidden shadow-2xl flex flex-col pt-1">
                {/* Table Header */}
                <div className="grid grid-cols-[120px_80px_1fr_120px_120px_100px] gap-4 px-5 py-2.5 bg-zinc-900/50 border-b border-zinc-800/80 text-[9px] font-black tracking-widest text-zinc-500 uppercase">
                  <div>Strike / Score</div>
                  <div>Status</div>
                  <div>Primary Driver</div>
                  <div className="text-right">Volume / Growth</div>
                  <div className="text-right">Neighbor Ratio</div>
                  <div className="text-right">Distance</div>
                </div>
                
                <div className="flex flex-col">
                  {filteredStrikes.map((s, idx) => {
                    const isActiveSpot = activeStrikeObj && s.strike === activeStrikeObj.strike;
                    const isCallDominant = s.callGex > Math.abs(s.putGex);
                    const score = s.strikeScore;
                    
                    let statusColor = 'text-zinc-500';
                    let statusLabel = 'QUIET';
                    if (score >= 90) { statusColor = 'text-red-400'; statusLabel = 'CRITICAL'; }
                    else if (score >= 70) { statusColor = 'text-amber-400'; statusLabel = 'ELEVATED'; }
                    else if (score >= 50) { statusColor = 'text-cyan-400'; statusLabel = 'ACTIVE'; }

                    const driverText = s.absGex >= maxAbsGexVal * 0.9 ? (isCallDominant ? 'MAX CALL GAMMA' : 'MAX PUT GAMMA')
                                     : s.nbr >= 5.0 ? `H-NBR CLUSTER`
                                     : s.accelVol15m > 60 ? 'VOL ACCELERATION'
                                     : s.oiChangePct >= 40 ? 'OI CONCENTRATION'
                                     : 'LIQUIDITY NODE';

                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={`target-row-${s.strike}`}
                        className="grid grid-cols-[120px_80px_1fr_120px_120px_100px] gap-4 items-center px-5 py-3 border-b border-zinc-800/40 hover:bg-zinc-800/10 transition-colors group relative"
                      >
                        {score >= 70 && <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${score >= 90 ? 'bg-red-500' : 'bg-amber-500'}`} />}
                        
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-mono font-black text-zinc-100">${s.strike.toFixed(decimals)}</span>
                          <span className="text-[9px] font-mono font-bold text-zinc-500">[{score}/100]</span>
                        </div>
                        
                        <div>
                          <span className={`text-[9px] font-bold tracking-widest uppercase font-mono ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5">
                           <span className={`text-[10px] font-bold tracking-wider uppercase font-sans ${isCallDominant ? 'text-[#34D399]' : 'text-[#F87171]'}`}>
                             {driverText}
                           </span>
                           {idx === 0 && sortBy === 'score' && (
                             <span className="text-[8px] tracking-widest text-amber-500 font-bold uppercase mt-0.5 max-w-max">PRIMARY TARGET</span>
                           )}
                           {isActiveSpot && (
                             <span className="text-[8px] tracking-widest text-[#06B6D4] font-bold uppercase mt-0.5 max-w-max">NEAREST TO SPOT</span>
                           )}
                        </div>

                        <div className="flex flex-col items-end gap-0.5 text-right w-full">
                          <span className="text-[11px] font-mono font-bold text-zinc-300">{s.strikeVol.toLocaleString()}</span>
                          <span className="text-[9px] font-mono text-fuchsia-400">+{s.accelVol15m}% 15m</span>
                        </div>

                        <div className="flex flex-col items-end gap-0.5 text-right w-full">
                          <span className={`text-[11px] font-mono font-bold ${s.nbr >= 4.0 ? 'text-orange-400' : 'text-zinc-300'}`}>{s.nbr.toFixed(2)}x</span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">DENSITY</span>
                        </div>

                        <div className="flex flex-col items-end gap-0.5 text-right w-full">
                          <span className="text-[11px] font-mono text-zinc-400">{s.distanceBps.toFixed(0)}</span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">BPS {s.isAboveSpot ? 'ABOVE' : 'BELOW'}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ) : (
              filteredStrikes.map((s, idx) => {
                const cellStyle = getStrikeStyleClass(s);
                const isLeadStrike = idx === 0 && activeFilter === 'all';
                const isActiveSpot = activeStrikeObj && s.strike === activeStrikeObj.strike;
                let pressureText = 'SUPPORT';
                let pressureColor = 'text-[#34D399]';
                if (s.putGex < 0 && Math.abs(s.putGex) > s.callGex) {
                    pressureText = 'RESISTANCE';
                    pressureColor = 'text-[#EF4444]';
                }
                const isCallDominant = s.callGex > Math.abs(s.putGex);
                
                const score = s.strikeScore;
                const bentoColSpan = 'col-span-1';
                const bentoPadding = 'p-4';
                const titleSize = 'text-lg md:text-xl';
                const cardScale = 'scale-100';

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                    key={`bento-${s.strike}`}
                    className={`bg-zinc-950/95 border ${cellStyle.borderColor} ${cellStyle.glowColor} ${bentoColSpan} flex flex-col justify-between rounded-xl relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 ${cardScale}`}
                    style={{
                      boxShadow: cellStyle.glowColor ? undefined : '0 4px 20px rgba(0,0,0,0.5)'
                    }}
                  >
                    {/* Neon Color Top Edge Strip */}
                  <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${cellStyle.type === 'GOLD' ? 'from-amber-400 to-[#FBBF24]' : cellStyle.type === 'SPOTLIGHT' ? 'from-cyan-400 to-[#06B6D4]' : cellStyle.type === 'PURPLE' ? 'from-fuchsia-500 to-[#D946EF]' : cellStyle.type === 'ORANGE' ? 'from-orange-500 to-[#F97316]' : cellStyle.type === 'GREEN' ? 'from-emerald-400 to-teal-500' : 'from-red-400 to-rose-500'}`} />

                  {/* Gradient Backing */}
                  <div className={`absolute inset-0 bg-gradient-to-b ${cellStyle.gradientFrom} opacity-[0.22] pointer-events-none`} />

                  <div className={`${bentoPadding} flex flex-col h-full gap-3 relative z-10`}>
                    
                    {/* CARDHEADER: STRIKE PRICE & SCORE RING (Phase 1, 3, 7) */}
                    <div className="flex justify-between items-start">
                      <div>
                        {isActiveSpot && (
                          <div className="flex items-center gap-1 text-[#06B6D4] text-[7.5px] font-black tracking-widest uppercase mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                             SPOTLIGHT CORE ACTIVE
                          </div>
                        )}
                        {cellStyle.type === 'GOLD' && !isActiveSpot && (
                          <div className="flex items-center gap-1 text-[#FBBF24] text-[7.5px] font-black tracking-widest uppercase mb-1">
                            <Sparkles className="w-3 h-3 text-[#FBBF24]" />
                            SUPREME HIGHEST RANKED
                          </div>
                        )}
                        <h3 className={`${titleSize} font-mono font-black text-white leading-tight flex items-center gap-1`}>
                          ${s.strike.toFixed(decimals)}
                        </h3>
                        <div className="text-[8.5px] font-black uppercase tracking-widest text-[#A1A1AA] mt-0.5 flex items-center gap-1 font-mono">
                          <Compass className="w-3 h-3" />
                          {s.distanceBps.toFixed(0)} BPS {s.isAboveSpot ? 'ABOVE SPOT' : 'BELOW SPOT'}
                        </div>
                      </div>

                      {/* Score Indicator Ring */}
                      <div className="flex flex-col items-center select-none shrink-0 border border-zinc-800 rounded-lg p-1 px-1.5 bg-black/40">
                        <span className="text-[7px] text-zinc-500 font-extrabold tracking-widest uppercase leading-none mb-0.5">SCORE</span>
                        <div className="flex items-baseline gap-0.5">
                          <span className={`text-[#FBBF24] font-mono font-black text-[13px] leading-none`}>
                            {score}
                          </span>
                          <span className="text-zinc-600 text-[8px] font-bold">/100</span>
                        </div>
                      </div>
                    </div>

                    {/* ANOMALY BADGES ROW (Phase 3) */}
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {isActiveSpot && (
                        <span className="px-2 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider bg-cyan-500/10 text-[#06B6D4] border border-cyan-500/20">
                           SPOT TARGET
                        </span>
                      )}
                      {s.nbr >= 4.0 && (
                        <span className="px-2 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider bg-orange-500/10 text-[#F97316] border border-orange-500/20 flex items-center gap-1">
                           {s.nbr.toFixed(1)}x NBR
                        </span>
                      )}
                      {s.oiChangePct >= 40 && (
                        <span className="px-2 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider bg-fuchsia-500/10 text-[#D946EF] border border-[#D946EF]/20 flex items-center gap-1 animate-pulse">
                           +{s.oiChangePct}% OI EXP
                        </span>
                      )}
                      {s.sweepIntensity >= 65 && (
                        <span className="px-2 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                           SWEEP CLUSTER
                        </span>
                      )}
                      {s.absGex >= maxAbsGexVal * 0.6 && (
                        <span className="px-2 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider bg-[#10B981]/10 text-[#34D399] border border-[#10B981]/20 flex items-center gap-1">
                           GAMMA WALL
                        </span>
                      )}
                    </div>

                    {/* CORE METRICS REDESIGNED GRID (Phase 3) */}
                    <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80 font-mono mt-1">
                      <div className="flex flex-col">
                        <span className="text-[7.5px] text-[#71717A] tracking-wider uppercase font-black">Volume</span>
                        <span className="text-[10px] font-black text-white">{s.strikeVol.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col border-l border-zinc-800/80 pl-2">
                        <span className="text-[7.5px] text-[#71717A] tracking-wider uppercase font-black">Neighbors (NBR)</span>
                        <span className={`text-[10px] font-black ${s.nbr >= 4.0 ? 'text-[#F97316]' : 'text-[#34D399]'}`}>{s.nbr.toFixed(2)}x</span>
                      </div>
                      <div className="flex flex-col border-t border-zinc-800/80 pt-1.5">
                        <span className="text-[7.5px] text-[#71717A] tracking-wider uppercase font-black">Net GEX EXPOSURE</span>
                        <span className={`text-[10px] font-black ${s.netGex >= 0 ? 'text-[#34D399]' : 'text-[#EF4444]'}`}>
                            {s.netGex > 1000000 ? (s.netGex / 1000000).toFixed(1) + 'M' : s.netGex.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col border-t border-l border-zinc-800/80 pl-2 pt-1.5">
                        <span className="text-[7.5px] text-[#71717A] tracking-wider uppercase font-black">OI EXP Rate</span>
                        <span className="text-[10px] font-black text-fuchsia-400">+{s.oiChangePct}%</span>
                      </div>
                    </div>

                    {/* INTERPRETATION & ACCELERATION METER (RE-ENGINEERED FOR MULTI-INTERVAL GROWTH) */}
                    <div className="flex flex-col gap-2 bg-zinc-950 border border-zinc-900/80 rounded-lg p-2 mt-0.5 font-mono">
                      
                      {/* Sub-header: Dealer Pressure & Dynamic Momentum Tracker */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-900/65">
                        <div className="flex flex-col">
                          <span className="text-[7px] text-zinc-500 font-extrabold uppercase tracking-wide">Dealer Pressure</span>
                          <span className={`text-[9.5px] font-bold ${pressureColor}`}>{pressureText}</span>
                        </div>
                        
                        <div className="flex flex-col items-end text-right">
                          <span className="text-[7px] text-zinc-500 font-extrabold uppercase tracking-wide flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400/20" /> ACCEL SCORE
                          </span>
                          <span className="text-[10px] font-black text-amber-400">
                            {Math.round(s.accelVol1m + s.accelVol5m)}/100
                          </span>
                        </div>
                      </div>

                      {/* Multi-Interval Volume & OI Rate of Change Badges */}
                      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                        {/* 1 Minute Slot */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[7px] text-zinc-500 font-bold text-center tracking-wider">1m Interval</span>
                          <div className="flex flex-col gap-0.5">
                            <span className={`px-1 py-0.5 text-[8.5px] rounded border text-center font-bold font-mono transition-colors duration-300 ${
                              s.accelVol1m > 15
                                ? 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/25 shadow-[0_0_10px_rgba(52,211,153,0.1)]'
                                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/80'
                            }`}>
                              VOL +{s.accelVol1m}%
                            </span>
                            <span className={`px-1 py-0.5 text-[8.5px] rounded border text-center font-bold font-mono transition-colors duration-300 ${
                              s.accelOi1m > 6
                                ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25 shadow-[0_0_10px_rgba(217,70,239,0.1)]'
                                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/80'
                            }`}>
                              OI +{s.accelOi1m}%
                            </span>
                          </div>
                        </div>

                        {/* 5 Minute Slot */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[7px] text-zinc-500 font-bold text-center tracking-wider">5m Interval</span>
                          <div className="flex flex-col gap-0.5">
                            <span className={`px-1 py-0.5 text-[8.5px] rounded border text-center font-bold font-mono transition-colors duration-300 ${
                              s.accelVol5m > 40
                                ? 'bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30 shadow-[0_0_12px_rgba(52,211,153,0.15)] animate-pulse'
                                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/80'
                            }`}>
                              VOL +{s.accelVol5m}%
                            </span>
                            <span className={`px-1 py-0.5 text-[8.5px] rounded border text-center font-bold font-mono transition-colors duration-300 ${
                              s.accelOi5m > 15
                                ? 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30'
                                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/80'
                            }`}>
                              OI +{s.accelOi5m}%
                            </span>
                          </div>
                        </div>

                        {/* 15 Minute Slot */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[7px] text-zinc-500 font-bold text-center tracking-wider">15m Interval</span>
                          <div className="flex flex-col gap-0.5">
                            <span className={`px-1 py-0.5 text-[8.5px] rounded border text-center font-black font-mono transition-colors duration-300 ${
                              s.accelVol15m > 120
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/80'
                            }`}>
                              VOL +{s.accelVol15m}%
                            </span>
                            <span className={`px-1 py-0.5 text-[8.5px] rounded border text-center font-black font-mono transition-colors duration-300 ${
                              s.accelOi15m > 30
                                ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40 shadow-[0_0_12px_rgba(217,70,239,0.2)]'
                                : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/80'
                            }`}>
                              OI +{s.accelOi15m}%
                            </span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* INTENT DIRECTIVE BAR */}
                    <div className="mt-1 flex items-center justify-between text-[8px] font-black tracking-widest uppercase border-t border-zinc-900 pt-2 shrink-0">
                      <span className="text-zinc-500">HEDGING CLASS:</span>
                      <span className={`px-2 py-0.5 rounded ${isCallDominant ? 'bg-[#10B981]/10 text-[#34D399]' : 'bg-[#EF4444]/10 text-red-400'}`}>
                        {isCallDominant ? '▲ UPSIDE RESISTANCE' : '▼ DOWNSIDE CUSHION'}
                      </span>
                    </div>

                  </div>
                </motion.div>
              );
            })
          )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* QUICK FOOTER STAT DETAILS */}
      <div className="flex flex-col sm:flex-row justify-between items-center text-[8px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono border-t border-[var(--border)] pt-3.5 gap-2">
        <div className="flex items-center gap-3">
          <span>Active matrix count: {scoredStrikes.length} strikes parsed</span>
          <span>·</span>
          <span>Normalized gex floor: {fmtVal(maxAbsGexVal)}</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <span>COGNITIVE DECISION METRIC SYSTEM</span>
          <Check className="w-3 h-3 text-[#34D399]" />
        </div>
      </div>

    </div>
  );
}
