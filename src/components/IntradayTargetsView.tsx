import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GexProfileData, GexStrikeDetail } from '../types';
import { fmtNum } from '../lib/format';
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

type FilterType = 'all' | 'top-10' | 'nbr-5x' | 'nbr-10x' | 'gamma-walls' | 'near-spot';
type SortType = 'score' | 'nbr' | 'volume' | 'oi' | 'distance' | 'callActivity' | 'putActivity' | 'netGex';
type ViewMode = 'grid' | 'ranked';

export function IntradayTargetsView({ profile, ticker, decimals }: IntradayTargetsViewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortType>('score');

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

    // Score is built ONLY from fields the server actually delivers on the live
    // chain (volume → NBR, net gamma, spot proximity). No fabricated OI-growth /
    // flow-aggression / sweep-intensity seeds — those require historical chain
    // snapshots we don't receive, so they are not invented here.
    return mapped.map(s => {
      const { strikeVol, nbr } = s;

      // Input 1: Neighbor Volume Ratio (NBR) — real, capped at 12x (Weight: 45%)
      const nbrCapped = Math.min(nbr, 12);
      const nbrScore = (nbrCapped / 12) * 45;

      // Input 2: Net Dealer Gamma magnitude — real (Weight: 35%)
      const absGex = Math.abs(s.netGex || 0);
      const gexScore = (absGex / maxAbsGex) * 35;

      // Input 3: Spot Proximity Factor — real (Weight: 20%)
      const distance = Math.abs(s.strike - spot);
      const distPct = distance / spot;
      const proxFactor = Math.exp(-distPct * 45); // close to spot is ~1.0, decays quickly
      const proxScore = proxFactor * 20;

      // Total Importance Score (real inputs only)
      const strikeScore = Math.min(100, Math.round(nbrScore + gexScore + proxScore));

      // Open interest currently on the chain (real snapshot — NOT a growth rate)
      const totalOi = (s.callOi || 0) + (s.putOi || 0);

      return {
        ...s,
        strikeVol,
        nbr,
        totalOi,
        strikeScore,
        distanceBps: distPct * 10000,
        isAboveSpot: s.strike > spot,
        absGex
      };
    });
  }, [profile?.strikes, spot]);

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
    } else if (activeFilter === 'near-spot') {
      result = result.filter(s => s.distanceBps <= 150); // within 1.5%
    }

    // Sort by selected metric (all real chain-derived fields)
    return result.sort((a, b) => {
      if (sortBy === 'score') return b.strikeScore - a.strikeScore;
      if (sortBy === 'nbr') return b.nbr - a.nbr;
      if (sortBy === 'volume') return b.strikeVol - a.strikeVol;
      if (sortBy === 'oi') return b.totalOi - a.totalOi;
      if (sortBy === 'distance') return a.distanceBps - b.distanceBps; // ascending
      if (sortBy === 'callActivity') return (b.callGex + b.callVolume) - (a.callGex + a.callVolume);
      if (sortBy === 'putActivity') return (Math.abs(b.putGex) + b.putVolume) - (Math.abs(a.putGex) + a.putVolume);
      if (sortBy === 'netGex') return Math.abs(b.netGex) - Math.abs(a.netGex); // absolute → biggest walls first
      return b.strikeScore - a.strikeScore;
    });
  }, [scoredStrikes, activeFilter, maxAbsGexVal, sortBy]);

  // 3. COLOR SYSTEM — collapsed to the 4 semantic token hues
  //    (warning / info / success / danger). The previous rogue fuchsia + orange
  //    tiers were dropped; major-gamma and volume-anomaly strikes now fold into
  //    the info accent so a terminal never shows more than 4 hues.
  const getStrikeStyleClass = (s: any) => {
    const isGold = highestScoreObj && s.strike === highestScoreObj.strike;
    const isActiveSpot = activeStrikeObj && s.strike === activeStrikeObj.strike;

    if (isGold) {
      return {
        type: 'GOLD', // Highest ranked (warning token)
        borderColor: 'border-[var(--warning)]/80',
        glowColor: 'shadow-[0_0_22px_rgba(251,191,36,0.22)]',
        accentCol: 'text-[var(--warning)]',
        badgeBg: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20',
        metricCol: 'text-[var(--warning)]',
        gradientFrom: 'from-[var(--warning)]/10 via-[var(--surface-2)] to-[var(--surface)]'
      };
    }
    if (isActiveSpot) {
      return {
        type: 'SPOTLIGHT', // Nearest-to-spot highlight (info token)
        borderColor: 'border-[var(--info)]/90',
        glowColor: 'shadow-[0_0_22px_rgba(96,165,250,0.22)]',
        accentCol: 'text-[var(--info)]',
        badgeBg: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/20',
        metricCol: 'text-[var(--info)]',
        gradientFrom: 'from-[var(--info)]/10 via-[var(--surface-2)] to-[var(--surface)]'
      };
    }
    if (s.absGex >= maxAbsGexVal * 0.6 || s.nbr >= 4.0) {
      return {
        type: 'NOTABLE', // Major gamma concentration or volume anomaly (info token)
        borderColor: 'border-[var(--info)]/60',
        glowColor: 'shadow-[0_0_15px_rgba(96,165,250,0.12)]',
        accentCol: 'text-[var(--info)]',
        badgeBg: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/20',
        metricCol: 'text-[var(--info)]',
        gradientFrom: 'from-[var(--info)]/5 via-[var(--surface-2)] to-[var(--surface)]'
      };
    }
    if (s.netGex > 0) {
      return {
        type: 'GREEN', // Bullish / positive gamma
        borderColor: 'border-[var(--success)]/60',
        glowColor: 'shadow-[0_0_12px_rgba(74,222,128,0.08)]',
        accentCol: 'text-[var(--success)]',
        badgeBg: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/10',
        metricCol: 'text-[var(--success)]',
        gradientFrom: 'from-[var(--surface-2)] to-[var(--surface)]'
      };
    }
    if (s.netGex < 0) {
      return {
        type: 'RED', // Bearish / negative gamma
        borderColor: 'border-[var(--danger)]/60',
        glowColor: 'shadow-[0_0_12px_rgba(248,113,113,0.08)]',
        accentCol: 'text-[var(--danger)]',
        badgeBg: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/10',
        metricCol: 'text-[var(--danger)]',
        gradientFrom: 'from-[var(--surface-2)] to-[var(--surface)]'
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
      gradientFrom: 'from-[var(--surface-2)] to-[var(--surface)]'
    };
  };

  // 4. DEALER INTERPRETATION LEVEL (Phase 3)
  const getDealerPressure = (absGex: number) => {
    const pct = absGex / maxAbsGexVal;
    if (pct >= 0.75) return { text: 'EXTREME', color: 'text-[var(--danger)] font-extrabold' };
    if (pct >= 0.40) return { text: 'HIGH', color: 'text-[var(--warning)] font-bold' };
    if (pct >= 0.15) return { text: 'MODERATE', color: 'text-[var(--info)] font-medium' };
    return { text: 'LOW', color: 'text-[var(--text-tertiary)] font-normal' };
  };

  // 5. INTRADAY NARRATIVE MAKER (Phase 3) — derived from real chain fields only
  const getIntradayNarrative = (s: any, isActiveSpot: boolean) => {
    const isCallDominant = s.callGex > Math.abs(s.putGex);

    if (isActiveSpot) {
      return `Critical spot lock. Heavy delta/gamma pinning here prevents breakout; expect dynamic compression in the near-term.`;
    }
    if (s.strikeScore >= 92) {
      return isCallDominant
        ? `Supreme call resistance. Heavy concentration above spot. Strong directional breakout expected upon test.`
        : `Primary downside liquidity floor. Heavy put shielding. Massive bounce potential, but breach triggers slide.`;
    }
    if (s.nbr >= 6.0) {
      return `Extreme volume anomaly (NBR: ${s.nbr.toFixed(1)}x). Concentrated volume vs. neighbors suggests strategic positioning.`;
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
          <div className="bg-[var(--danger)]/10 p-2.5 rounded-lg border border-[var(--danger)]/20 text-[var(--danger)] shadow-[0_0_15px_rgba(248,113,113,0.12)]">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-black tracking-widest text-[var(--danger)] uppercase">
                Ranked Targets
              </h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-black font-mono tracking-widest bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/20">
                SCORING ENGINE
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest mt-1">
              PRIORITY STRIKE INTELLIGENCE & VOLATILITY IDENTIFICATION
            </p>
          </div>
        </div>

        {/* Dynamic HUD capsules (Spot Dashboard) */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Active Spot Indicator */}
          <div className="bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-lg flex items-center gap-3 shrink-0">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-widest flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[var(--accent-color)]" /> ACTIVE SPOT:
            </span>
            <span className="text-[12px] font-mono font-black text-[var(--text-primary)] flex items-center gap-1.5 tabular-nums">
              ${fmtNum(spot, decimals)}
              <span className="w-1.5 h-1.5 bg-[var(--accent-color)] rounded-full" />
            </span>
          </div>

          {/* Highest Rank Strike */}
          {highestScoreObj && (
            <div className="bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 rounded-lg hidden sm:flex items-center gap-3 shrink-0">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--warning)]" /> HEAVYWEIGHT:
              </span>
              <span className="text-[11px] font-mono font-black text-[var(--warning)] tabular-nums">
                ${fmtNum(highestScoreObj.strike, decimals)}
              </span>
              <span className="text-[10px] bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 px-1 rounded font-black tabular-nums">
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
                className="bg-[var(--surface-3)] text-[var(--text-primary)] font-mono border border-[var(--border)] rounded-md px-2 py-1 outline-none cursor-pointer"
              >
                <option value="score">Rank Score</option>
                <option value="nbr">Neighbor Ratio (NBR)</option>
                <option value="volume">Total Volume</option>
                <option value="oi">Open Interest</option>
                <option value="distance">Near Spot</option>
                <option value="callActivity">Call Activity</option>
                <option value="putActivity">Put Activity</option>
                <option value="netGex">Net Gex Magnitude</option>
              </select>
            </div>

            {/* View Mode Toggle Segment Controller */}
            <div className="flex bg-[var(--surface-2)] border border-[var(--border)] p-0.5 rounded-lg text-[10px] font-black tracking-widest uppercase shrink-0 h-full">
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
                        ? 'bg-[var(--surface-3)] text-[var(--text-primary)] font-black border border-[var(--border)] shadow-md'
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
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <span className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest leading-none">
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
            { id: 'near-spot', label: ' Near Spot' },
          ].map(tab => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as FilterType)}
                className={`px-3 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase shrink-0 transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-[var(--success)]/15 border-[var(--success)]/30 text-[var(--success)] font-black'
                    : 'bg-transparent border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
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
          <ShieldAlert className="w-10 h-10 text-[var(--text-tertiary)] mb-3.5" />
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-black">
            NO ANOMALY STRIKES DETECTED CURRENTLY UNDER THIS ISOLATOR
          </div>
          <button
            onClick={() => setActiveFilter('all')}
            className="mt-4 text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] rounded-md border border-[var(--border)] transition"
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
              <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xl flex flex-col pt-1">
                {/* Table Header */}
                <div className="grid grid-cols-[120px_80px_1fr_120px_120px_100px] gap-4 px-5 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] text-[10px] font-black tracking-widest text-[var(--text-tertiary)] uppercase">
                  <div>Strike / Score</div>
                  <div>Status</div>
                  <div>Primary Driver</div>
                  <div className="text-right">Volume / OI</div>
                  <div className="text-right">Neighbor Ratio</div>
                  <div className="text-right">Distance</div>
                </div>

                <div className="flex flex-col">
                  {filteredStrikes.map((s, idx) => {
                    const isActiveSpot = activeStrikeObj && s.strike === activeStrikeObj.strike;
                    const isCallDominant = s.callGex > Math.abs(s.putGex);
                    const score = s.strikeScore;

                    let statusColor = 'text-[var(--text-tertiary)]';
                    let statusLabel = 'QUIET';
                    if (score >= 90) { statusColor = 'text-[var(--danger)]'; statusLabel = 'CRITICAL'; }
                    else if (score >= 70) { statusColor = 'text-[var(--warning)]'; statusLabel = 'ELEVATED'; }
                    else if (score >= 50) { statusColor = 'text-[var(--info)]'; statusLabel = 'ACTIVE'; }

                    const driverText = s.absGex >= maxAbsGexVal * 0.9 ? (isCallDominant ? 'MAX CALL GAMMA' : 'MAX PUT GAMMA')
                                     : s.nbr >= 5.0 ? `H-NBR CLUSTER`
                                     : s.absGex >= maxAbsGexVal * 0.6 ? 'GAMMA CONCENTRATION'
                                     : 'LIQUIDITY NODE';

                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={`target-row-${s.strike}`}
                        className="grid grid-cols-[120px_80px_1fr_120px_120px_100px] gap-4 items-center px-5 py-3 border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors group relative"
                      >
                        {score >= 70 && <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${score >= 90 ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`} />}

                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-mono font-black text-[var(--text-primary)] tabular-nums">${fmtNum(s.strike, decimals)}</span>
                          <span className="text-[10px] font-mono font-bold text-[var(--text-tertiary)] tabular-nums">[{score}/100]</span>
                        </div>

                        <div>
                          <span className={`text-[10px] font-bold tracking-widest uppercase font-mono ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5">
                           <span className={`text-[10px] font-bold tracking-wider uppercase font-sans ${isCallDominant ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                             {driverText}
                           </span>
                           {idx === 0 && sortBy === 'score' && (
                             <span className="text-[10px] tracking-widest text-[var(--warning)] font-bold uppercase mt-0.5 max-w-max">PRIMARY TARGET</span>
                           )}
                           {isActiveSpot && (
                             <span className="text-[10px] tracking-widest text-[var(--accent-color)] font-bold uppercase mt-0.5 max-w-max">NEAREST TO SPOT</span>
                           )}
                        </div>

                        <div className="flex flex-col items-end gap-0.5 text-right w-full">
                          <span className="text-[11px] font-mono font-bold text-[var(--text-secondary)] tabular-nums">{s.strikeVol.toLocaleString()}</span>
                          <span className="text-[10px] font-mono text-[var(--info)] tabular-nums">{s.totalOi.toLocaleString()} OI</span>
                        </div>

                        <div className="flex flex-col items-end gap-0.5 text-right w-full">
                          <span className={`text-[11px] font-mono font-bold tabular-nums ${s.nbr >= 4.0 ? 'text-[var(--info)]' : 'text-[var(--text-secondary)]'}`}>{s.nbr.toFixed(2)}x</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">DENSITY</span>
                        </div>

                        <div className="flex flex-col items-end gap-0.5 text-right w-full">
                          <span className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">{s.distanceBps.toFixed(0)}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">BPS {s.isAboveSpot ? 'ABOVE' : 'BELOW'}</span>
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
                let pressureColor = 'text-[var(--success)]';
                if (s.putGex < 0 && Math.abs(s.putGex) > s.callGex) {
                    pressureText = 'RESISTANCE';
                    pressureColor = 'text-[var(--danger)]';
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
                    className={`bg-[var(--surface)] border ${cellStyle.borderColor} ${cellStyle.glowColor} ${bentoColSpan} flex flex-col justify-between rounded-xl relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 ${cardScale}`}
                    style={{
                      boxShadow: cellStyle.glowColor ? undefined : '0 4px 20px rgba(0,0,0,0.5)'
                    }}
                  >
                    {/* Color Top Edge Strip (token hues only) */}
                  <div className={`absolute top-0 left-0 right-0 h-[3px] ${cellStyle.type === 'GOLD' ? 'bg-[var(--warning)]' : cellStyle.type === 'SPOTLIGHT' ? 'bg-[var(--accent-color)]' : cellStyle.type === 'NOTABLE' ? 'bg-[var(--info)]' : cellStyle.type === 'GREEN' ? 'bg-[var(--success)]' : cellStyle.type === 'RED' ? 'bg-[var(--danger)]' : 'bg-[var(--border-strong)]'}`} />

                  {/* Gradient Backing */}
                  <div className={`absolute inset-0 bg-gradient-to-b ${cellStyle.gradientFrom} opacity-[0.22] pointer-events-none`} />

                  <div className={`${bentoPadding} flex flex-col h-full gap-3 relative z-10`}>
                    
                    {/* CARDHEADER: STRIKE PRICE & SCORE RING (Phase 1, 3, 7) */}
                    <div className="flex justify-between items-start">
                      <div>
                        {isActiveSpot && (
                          <div className="flex items-center gap-1 text-[var(--accent-color)] text-[10px] font-black tracking-widest uppercase mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] shrink-0" />
                             SPOTLIGHT CORE ACTIVE
                          </div>
                        )}
                        {cellStyle.type === 'GOLD' && !isActiveSpot && (
                          <div className="flex items-center gap-1 text-[var(--warning)] text-[10px] font-black tracking-widest uppercase mb-1">
                            <Sparkles className="w-3 h-3 text-[var(--warning)]" />
                            SUPREME HIGHEST RANKED
                          </div>
                        )}
                        <h3 className={`${titleSize} font-mono font-black text-[var(--text-primary)] leading-tight flex items-center gap-1 tabular-nums`}>
                          ${fmtNum(s.strike, decimals)}
                        </h3>
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1 font-mono tabular-nums">
                          <Compass className="w-3 h-3" />
                          {s.distanceBps.toFixed(0)} BPS {s.isAboveSpot ? 'ABOVE SPOT' : 'BELOW SPOT'}
                        </div>
                      </div>

                      {/* Score Indicator Ring */}
                      <div className="flex flex-col items-center select-none shrink-0 border border-[var(--border)] rounded-lg p-1 px-1.5 bg-[var(--surface-2)]">
                        <span className="text-[10px] text-[var(--text-tertiary)] font-extrabold tracking-widest uppercase leading-none mb-0.5">SCORE</span>
                        <div className="flex items-baseline gap-0.5">
                          <span className={`${cellStyle.metricCol} font-mono font-black text-[13px] leading-none tabular-nums`}>
                            {score}
                          </span>
                          <span className="text-[var(--text-tertiary)] text-[10px] font-bold">/100</span>
                        </div>
                      </div>
                    </div>

                    {/* KEY-FLAG BADGES ROW (real chain-derived flags only) */}
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {isActiveSpot && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--accent-color)]/10 text-[var(--accent-color)] border border-[var(--accent-color)]/20">
                           SPOT TARGET
                        </span>
                      )}
                      {s.nbr >= 4.0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20 flex items-center gap-1 tabular-nums">
                           {s.nbr.toFixed(1)}x NBR
                        </span>
                      )}
                      {s.absGex >= maxAbsGexVal * 0.6 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20 flex items-center gap-1">
                           GAMMA WALL
                        </span>
                      )}
                    </div>

                    {/* CORE METRICS GRID — all real chain fields */}
                    <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] font-mono mt-1 tabular-nums">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider uppercase font-black">Volume</span>
                        <span className="text-[10px] font-black text-[var(--text-primary)]">{s.strikeVol.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col border-l border-[var(--border)] pl-2">
                        <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider uppercase font-black">Neighbors (NBR)</span>
                        <span className={`text-[10px] font-black ${s.nbr >= 4.0 ? 'text-[var(--info)]' : 'text-[var(--success)]'}`}>{s.nbr.toFixed(2)}x</span>
                      </div>
                      <div className="flex flex-col border-t border-[var(--border)] pt-1.5">
                        <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider uppercase font-black">Net GEX EXPOSURE</span>
                        <span className={`text-[10px] font-black ${s.netGex >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {Math.abs(s.netGex) > 1000000 ? (s.netGex / 1000000).toFixed(1) + 'M' : s.netGex.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col border-t border-l border-[var(--border)] pl-2 pt-1.5">
                        <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider uppercase font-black">Open Interest</span>
                        <span className="text-[10px] font-black text-[var(--info)]">{s.totalOi.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* DEALER PRESSURE + REAL CALL/PUT ACTIVITY SNAPSHOT (chain figures) */}
                    <div className="flex flex-col gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2 mt-0.5 font-mono">

                      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-[var(--text-tertiary)] font-extrabold uppercase tracking-wide">Dealer Pressure</span>
                          <span className={`text-[10px] font-bold ${pressureColor}`}>{pressureText}</span>
                        </div>

                        <div className="flex flex-col items-end text-right">
                          <span className="text-[10px] text-[var(--text-tertiary)] font-extrabold uppercase tracking-wide">Rank Score</span>
                          <span className={`text-[10px] font-black tabular-nums ${cellStyle.metricCol}`}>
                            {score}/100
                          </span>
                        </div>
                      </div>

                      {/* Real call vs put activity on this strike (from the live chain) */}
                      <div className="grid grid-cols-2 gap-1.5 pt-0.5 tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-[var(--text-tertiary)] font-bold tracking-wider uppercase">Call Side</span>
                          <span className="px-1 py-0.5 text-[10px] rounded border text-center font-bold bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20">
                            VOL {(s.callVolume || 0).toLocaleString()}
                          </span>
                          <span className="px-1 py-0.5 text-[10px] rounded border text-center font-bold bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border)]">
                            OI {(s.callOi || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-[var(--text-tertiary)] font-bold tracking-wider uppercase">Put Side</span>
                          <span className="px-1 py-0.5 text-[10px] rounded border text-center font-bold bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20">
                            VOL {(s.putVolume || 0).toLocaleString()}
                          </span>
                          <span className="px-1 py-0.5 text-[10px] rounded border text-center font-bold bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border)]">
                            OI {(s.putOi || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                    </div>

                    {/* INTENT DIRECTIVE BAR */}
                    <div className="mt-1 flex items-center justify-between text-[10px] font-black tracking-widest uppercase border-t border-[var(--border)] pt-2 shrink-0">
                      <span className="text-[var(--text-tertiary)]">HEDGING CLASS:</span>
                      <span className={`px-2 py-0.5 rounded ${isCallDominant ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--danger)]/10 text-[var(--danger)]'}`}>
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
      <div className="flex flex-col sm:flex-row justify-between items-center text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono border-t border-[var(--border)] pt-3.5 gap-2 tabular-nums">
        <div className="flex items-center gap-3">
          <span>Active matrix count: {scoredStrikes.length} strikes parsed</span>
          <span>·</span>
          <span>Normalized gex floor: {fmtVal(maxAbsGexVal)}</span>
        </div>
        <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
          <span>SCORE = NBR · NET-GAMMA · SPOT-PROXIMITY (REAL CHAIN)</span>
          <Check className="w-3 h-3 text-[var(--success)]" />
        </div>
      </div>

    </div>
  );
}
