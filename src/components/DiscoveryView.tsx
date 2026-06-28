import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Search,
  ShieldAlert,
  Flame,
  Database,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Target,
  Info
} from 'lucide-react';
import { AssetInfo } from '../types';
import { ASSET_LIST } from '../data';
import { useContractStore } from '../lib/store';
import { formatTime } from '../lib/timeUtils';
import { fmtNum } from '../lib/format';
import { AssetSparkline } from './AssetSparkline';

interface DiscoveryViewProps {
  systemScore: any;
  discovery?: {
    mispricedCalls: any[];
    mispricedPuts: any[];
    mostImproved: any[];
    nearInvalidation: any[];
  };
  onSelectContract: (asset: AssetInfo, strike: number, isCall: boolean) => void;
}

// SAMPLE / ILLUSTRATIVE options tiles — static demo rows used to seed the layout
// before/without a connected options feed. These are NOT a live scan and the
// numbers are placeholders; the UI labels this view "SAMPLE DATA".
const INITIAL_CONTRACTS = [
  // SHELF: CONVICTION
  {
    id: 'spx-7620-c',
    ticker: 'SPX',
    strike: 7620,
    isCall: true,
    health: 96,
    expectedMove: '+42.5%',
    action: 'ENTER' as const,
    narrative: 'Heavy institutional volume cluster matched. Dealer buy walls are perfectly positioned.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.54,
    gamma: 0.024,
    vega: 0.14,
    theta: -0.81,
    volume: 14205,
    price: 5.40,
    bid: 5.35,
    ask: 5.45,
    t1: 7.20,
    p1: 33
  },
  {
    id: 'spy-515-c',
    ticker: 'SPY',
    strike: 515,
    isCall: true,
    health: 93,
    expectedMove: '+36.2%',
    action: 'ENTER' as const,
    narrative: 'Unusually clean volume profile confirms call momentum.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.48,
    gamma: 0.038,
    vega: 0.12,
    theta: -0.45,
    volume: 38201,
    price: 3.20,
    bid: 3.18,
    ask: 3.22,
    t1: 4.35,
    p1: 36
  },
  {
    id: 'qqq-448-c',
    ticker: 'QQQ',
    strike: 448,
    isCall: true,
    health: 91,
    expectedMove: '+29.0%',
    action: 'ENTER' as const,
    narrative: 'Dealer block purchases confirm near-term floor.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.52,
    gamma: 0.041,
    vega: 0.15,
    theta: -0.55,
    volume: 22401,
    price: 4.20,
    bid: 4.15,
    ask: 4.25,
    t1: 5.40,
    p1: 29
  },
  {
    id: 'ndx-18350-c',
    ticker: 'NDX',
    strike: 18350,
    isCall: true,
    health: 90,
    expectedMove: '+31.4%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in derivative order flow on Nasdaq nodes.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.49,
    gamma: 0.015,
    vega: 0.18,
    theta: -1.25,
    volume: 5204,
    price: 15.50,
    bid: 15.30,
    ask: 15.70,
    t1: 20.30,
    p1: 31
  },
  {
    id: 'spx-7600-c',
    ticker: 'SPX',
    strike: 7600,
    isCall: true,
    health: 95,
    expectedMove: '+39.1%',
    action: 'ENTER' as const,
    narrative: 'Below spot magnet concentration attracts structural institutional buyer hedging.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.62,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.92,
    volume: 18940,
    price: 11.20,
    bid: 11.10,
    ask: 11.30,
    t1: 15.60,
    p1: 39
  },
  {
    id: 'spy-510-c',
    ticker: 'SPY',
    strike: 510,
    isCall: true,
    health: 92,
    expectedMove: '+34.8%',
    action: 'ENTER' as const,
    narrative: 'Slayer deep learning index detects massive localized volume sweep.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.58,
    gamma: 0.035,
    vega: 0.13,
    theta: -0.48,
    volume: 45100,
    price: 5.10,
    bid: 5.05,
    ask: 5.15,
    t1: 6.85,
    p1: 34
  },

  // SHELF: IMPROVED / VELOCITY
  {
    id: 'ndx-18300-c',
    ticker: 'NDX',
    strike: 18300,
    isCall: true,
    health: 89,
    expectedMove: '+55.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid jump in scoring index over the last 15 minutes. High expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.58,
    gamma: 0.018,
    vega: 0.19,
    theta: -1.15,
    volume: 6310,
    price: 14.20,
    bid: 14.05,
    ask: 14.35,
    t1: 22.01,
    p1: 55
  },
  {
    id: 'qqq-446-c',
    ticker: 'QQQ',
    strike: 446,
    isCall: true,
    health: 88,
    expectedMove: '+32.4%',
    action: 'ENTER' as const,
    narrative: 'Dealer short blocks have dissolved, freeing up massive room overhead.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.54,
    gamma: 0.043,
    vega: 0.16,
    theta: -0.58,
    volume: 29402,
    price: 3.80,
    bid: 3.75,
    ask: 3.85,
    t1: 5.05,
    p1: 32
  },
  {
    id: 'spy-514-c',
    ticker: 'SPY',
    strike: 514,
    isCall: true,
    health: 87,
    expectedMove: '+28.5%',
    action: 'ENTER' as const,
    narrative: 'Score rating surges as dealers transition from negative gamma to neutral gamma.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.51,
    gamma: 0.039,
    vega: 0.12,
    theta: -0.46,
    volume: 18920,
    price: 2.80,
    bid: 2.77,
    ask: 2.83,
    t1: 3.60,
    p1: 28
  },
  {
    id: 'spx-7660-c',
    ticker: 'SPX',
    strike: 7660,
    isCall: true,
    health: 86,
    expectedMove: '+45.0%',
    action: 'ENTER' as const,
    narrative: 'Breakout momentum identified. Standard dispersion limit predicts vol expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.42,
    gamma: 0.019,
    vega: 0.14,
    theta: -0.84,
    volume: 9811,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 6.95,
    p1: 45
  },
  {
    id: 'qqq-450-c',
    ticker: 'QQQ',
    strike: 450,
    isCall: true,
    health: 85,
    expectedMove: '+26.8%',
    action: 'ENTER' as const,
    narrative: 'Derivative speed indices ticking straight up; fast buy feedback loop active.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.46,
    gamma: 0.040,
    vega: 0.17,
    theta: -0.61,
    volume: 15400,
    price: 2.65,
    bid: 2.61,
    ask: 2.69,
    t1: 3.35,
    p1: 26
  },
  {
    id: 'spx-7640-c',
    ticker: 'SPX',
    strike: 7640,
    isCall: true,
    health: 88,
    expectedMove: '+30.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in order flow profile matches strong buy trend.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.52,
    gamma: 0.022,
    vega: 0.13,
    theta: -0.85,
    volume: 12401,
    price: 6.80,
    bid: 6.70,
    ask: 6.90,
    t1: 8.85,
    p1: 30
  },

  // SHELF: MISPRICED / ARBITRAGE
  {
    id: 'spy-442-p',
    ticker: 'SPY',
    strike: 442,
    isCall: false,
    health: 85,
    expectedMove: '+24.1%',
    action: 'HOLD' as const,
    narrative: 'Valuation curve points to an extreme temporary discount on deep puts.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.12,
    gamma: 0.008,
    vega: 0.06,
    theta: -0.15,
    volume: 5310,
    price: 0.45,
    bid: 0.43,
    ask: 0.47,
    t1: 0.55,
    p1: 22
  },
  {
    id: 'spx-7650-c',
    ticker: 'SPX',
    strike: 7650,
    isCall: true,
    health: 83,
    expectedMove: '+18.5%',
    action: 'HOLD' as const,
    narrative: 'Priced exceptionally cheap relative to general spot move; heavy IV discount.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: 0.45,
    gamma: 0.020,
    vega: 0.14,
    theta: -0.83,
    volume: 8105,
    price: 5.10,
    bid: 5.00,
    ask: 5.20,
    t1: 6.05,
    p1: 18
  },
  {
    id: 'spy-508-p',
    ticker: 'SPY',
    strike: 508,
    isCall: false,
    health: 81,
    expectedMove: '+20.5%',
    action: 'HOLD' as const,
    narrative: 'Theoretical model price sits at $1.85, while active broker ask is $1.35.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.38,
    gamma: 0.025,
    vega: 0.11,
    theta: -0.32,
    volume: 12502,
    price: 1.35,
    bid: 1.32,
    ask: 1.38,
    t1: 1.62,
    p1: 20
  },
  {
    id: 'spx-7590-p',
    ticker: 'SPX',
    strike: 7590,
    isCall: false,
    health: 84,
    expectedMove: '+27.0%',
    action: 'ENTER' as const,
    narrative: 'Implied volatility suppression created a perfect risk-to-reward underpricing node.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.41,
    gamma: 0.018,
    vega: 0.13,
    theta: -0.75,
    volume: 7500,
    price: 12.80,
    bid: 12.60,
    ask: 13.00,
    t1: 16.25,
    p1: 27
  },
  {
    id: 'qqq-442-p',
    ticker: 'QQQ',
    strike: 442,
    isCall: false,
    health: 80,
    expectedMove: '+19.2%',
    action: 'HOLD' as const,
    narrative: 'Underpriced hedge option with high delta sensitivity relative to current spot.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.39,
    gamma: 0.034,
    vega: 0.14,
    theta: -0.42,
    volume: 16210,
    price: 2.15,
    bid: 2.12,
    ask: 2.18,
    t1: 2.56,
    p1: 19
  },
  {
    id: 'ndx-18200-p',
    ticker: 'NDX',
    strike: 18200,
    isCall: false,
    health: 82,
    expectedMove: '+22.4%',
    action: 'HOLD' as const,
    narrative: 'Strong theoretical offset detected. Arbitrage spread calculated at 14.5%.',
    tagText: 'ARBITRAGE',
    shelf: 'mispriced',
    delta: -0.44,
    gamma: 0.014,
    vega: 0.18,
    theta: -1.10,
    volume: 3840,
    price: 42.10,
    bid: 41.50,
    ask: 42.70,
    t1: 51.50,
    p1: 22
  },

  // SHELF: INVALIDATION / BOUNDARIES
  {
    id: 'spx-7610-p',
    ticker: 'SPX',
    strike: 7610,
    isCall: false,
    health: 48,
    expectedMove: '-15.4%',
    action: 'REDUCE' as const,
    narrative: 'Slipped past main dealer GEX hedge floor. Tail risk exponentially flashing high.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.42,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.85,
    volume: 15401,
    price: 18.50,
    bid: 18.30,
    ask: 18.70,
    t1: 15.65,
    p1: -15
  },
  {
    id: 'spy-440-p',
    ticker: 'SPY',
    strike: 440,
    isCall: false,
    health: 51,
    expectedMove: '-10.2%',
    action: 'SELL' as const,
    narrative: 'Liquidity sweep void detected below current level. Immediate defensive alert.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.10,
    gamma: 0.005,
    vega: 0.05,
    theta: -0.12,
    volume: 24500,
    price: 0.35,
    bid: 0.33,
    ask: 0.37,
    t1: 0.31,
    p1: -10
  },
  {
    id: 'spx-7580-p',
    ticker: 'SPX',
    strike: 7580,
    isCall: false,
    health: 41,
    expectedMove: '-24.0%',
    action: 'SELL' as const,
    narrative: 'Extreme threshold crossover boundary triggers automatic institutional liquidation.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.32,
    gamma: 0.016,
    vega: 0.12,
    theta: -0.80,
    volume: 11040,
    price: 8.50,
    bid: 8.35,
    ask: 8.65,
    t1: 6.45,
    p1: -24
  },
  {
    id: 'spy-502-p',
    ticker: 'SPY',
    strike: 502,
    isCall: false,
    health: 45,
    expectedMove: '-18.5%',
    action: 'SELL' as const,
    narrative: 'Brushed beneath primary dealer put wall support. Hedging dynamics turned negative.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.28,
    gamma: 0.022,
    vega: 0.09,
    theta: -0.28,
    volume: 19105,
    price: 2.10,
    bid: 2.05,
    ask: 2.15,
    t1: 1.71,
    p1: -18
  },
  {
    id: 'qqq-438-p',
    ticker: 'QQQ',
    strike: 438,
    isCall: false,
    health: 49,
    expectedMove: '-14.0%',
    action: 'REDUCE' as const,
    narrative: 'Unwinds beneath crucial volume-weighted index pivot. Support levels dissolve.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.31,
    gamma: 0.028,
    vega: 0.12,
    theta: -0.38,
    volume: 14210,
    price: 3.15,
    bid: 3.10,
    ask: 3.20,
    t1: 2.70,
    p1: -14
  },
  {
    id: 'ndx-18100-p',
    ticker: 'NDX',
    strike: 18100,
    isCall: false,
    health: 38,
    expectedMove: '-32.5%',
    action: 'SELL' as const,
    narrative: 'System score degraded as gamma flip point triggers extreme margin sell hedging.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.36,
    gamma: 0.010,
    vega: 0.16,
    theta: -1.02,
    volume: 2901,
    price: 28.50,
    bid: 28.00,
    ask: 29.00,
    t1: 19.20,
    p1: -32
  },

  // SHELF: WHALE SWEEPS
  {
    id: 'spx-7700-c',
    ticker: 'SPX',
    strike: 7700,
    isCall: true,
    health: 94,
    expectedMove: '+62.4%',
    action: 'ENTER' as const,
    narrative: 'Block institutional trades sweep SPX 7700 strike, representing $14.2M notional.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.35,
    gamma: 0.018,
    vega: 0.15,
    theta: -0.78,
    volume: 62400,
    price: 2.45,
    bid: 2.40,
    ask: 2.50,
    t1: 3.98,
    p1: 62
  },
  {
    id: 'ndx-18500-c',
    ticker: 'NDX',
    strike: 18500,
    isCall: true,
    health: 91,
    expectedMove: '+75.0%',
    action: 'ENTER' as const,
    narrative: 'Massive out-of-the-money block trade cluster. Aggressive bullish volatility positioning.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.30,
    gamma: 0.010,
    vega: 0.17,
    theta: -1.08,
    volume: 11400,
    price: 8.90,
    bid: 8.70,
    ask: 9.10,
    t1: 15.55,
    p1: 75
  },
  {
    id: 'spy-520-c',
    ticker: 'SPY',
    strike: 520,
    isCall: true,
    health: 89,
    expectedMove: '+44.1%',
    action: 'ENTER' as const,
    narrative: 'Sweeps executed on Ask price consistently over the last 10 minutes. Bull run.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.34,
    gamma: 0.031,
    vega: 0.11,
    theta: -0.40,
    volume: 92400,
    price: 1.15,
    bid: 1.12,
    ask: 1.18,
    t1: 1.65,
    p1: 44
  },
  {
    id: 'qqq-455-c',
    ticker: 'QQQ',
    strike: 455,
    isCall: true,
    health: 88,
    expectedMove: '+38.5%',
    action: 'ENTER' as const,
    narrative: 'Multimillion institutional block sweep targeting the upper resistance channel wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.32,
    gamma: 0.033,
    vega: 0.13,
    theta: -0.52,
    volume: 51200,
    price: 1.45,
    bid: 1.41,
    ask: 1.49,
    t1: 2.01,
    p1: 38
  },
  {
    id: 'spx-7500-p',
    ticker: 'SPX',
    strike: 7500,
    isCall: false,
    health: 85,
    expectedMove: '+52.0%',
    action: 'HOLD' as const,
    narrative: 'Huge defensive protective put basket sweep ($22.4M notional hedge) detected.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.19,
    gamma: 0.010,
    vega: 0.09,
    theta: -0.55,
    volume: 48900,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 7.30,
    p1: 52
  },
  {
    id: 'ndx-17800-p',
    ticker: 'NDX',
    strike: 17800,
    isCall: false,
    health: 83,
    expectedMove: '+48.5%',
    action: 'HOLD' as const,
    narrative: 'Significant tail protection sweep blocks are locking up hedge positions at put wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.15,
    gamma: 0.008,
    vega: 0.12,
    theta: -0.78,
    volume: 8520,
    price: 12.40,
    bid: 12.10,
    ask: 12.70,
    t1: 18.40,
    p1: 48
  }
];

// Seed initial historical feed logs
// Monotonic id source so prepended feed logs keep stable React keys (timestamps
// are only second-granularity and indices shift on every prepend).
let _feedLogSeq = 0;
const nextFeedLogId = () => `feedlog-${++_feedLogSeq}`;

const INITIAL_FEED_LOGS = [
  { id: nextFeedLogId(), timestamp: '01:34:25 PM', ticker: 'SPX', strike: 7620, type: 'C', side: 'Sweep', size: '280 cons', premium: '$151,200', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:34:10 PM', ticker: 'QQQ', strike: 448, type: 'C', side: 'Block', size: '1,200 cons', premium: '$504,000', tag: 'BULLISH', action: 'AT ASK' },
  { id: nextFeedLogId(), timestamp: '01:33:48 PM', ticker: 'NDX', strike: 18350, type: 'C', side: 'Block', size: '150 cons', premium: '$232,500', tag: 'BULLISH', action: 'ABOVE ASK' },
  { id: nextFeedLogId(), timestamp: '01:33:02 PM', ticker: 'SPY', strike: 508, type: 'P', side: 'Sweep', size: '2,500 cons', premium: '$337,500', tag: 'BEARISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:31:55 PM', ticker: 'SPX', strike: 7700, type: 'C', side: 'Block', size: '3,000 cons', premium: '$735,000', tag: 'BULLISH', action: 'OFF-EXCHANGE' },
  { id: nextFeedLogId(), timestamp: '01:30:22 PM', ticker: 'NDX', strike: 17800, type: 'P', side: 'Sweep', size: '400 cons', premium: '$496,000', tag: 'HEDGE', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:29:15 PM', ticker: 'SPY', strike: 515, type: 'C', side: 'Sweep', size: '1,800 cons', premium: '$576,000', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:28:40 PM', ticker: 'QQQ', strike: 455, type: 'C', side: 'Sweep', size: '2,400 cons', premium: '$348,000', tag: 'BULLISH', action: 'ABOVE ASK' }
];

export function DiscoveryView({
  systemScore,
  discovery,
  onSelectContract
}: DiscoveryViewProps) {
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  const [contracts, setContracts] = useState(INITIAL_CONTRACTS);
  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({});
  const [activeShelf, setActiveShelf] = useState<'conviction' | 'improved' | 'mispriced' | 'invalidation' | 'whale' | 'all'>('conviction');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSearchAssets = ASSET_LIST.filter(a => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });

  const filteredSearchContracts = contracts.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return c.ticker.toLowerCase().includes(q) || String(c.strike).includes(q) || (c.ticker + ' ' + c.strike).toLowerCase().includes(q);
  });

  const [optionTypeFilter, setOptionTypeFilter] = useState<'all' | 'calls' | 'puts'>('all');
  const [feedLogs, setFeedLogs] = useState(INITIAL_FEED_LOGS);
  // True when the sample discovery SSE stream drops; surfaced as a subtle
  // "reconnecting" chip on the tape (the browser EventSource auto-reconnects).
  const [feedError, setFeedError] = useState(false);
  const [lastFlashingId, setLastFlashingId] = useState<string | null>(null);
  const [flashDirection, setFlashDirection] = useState<'up' | 'down'>('up');
  const [metricsPulse, setMetricsPulse] = useState(false);

  // Strategy Manual & target logic reasons dictionary (explanations in simple words why they are the best)
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(true);
  const [isMockScanning, setIsMockScanning] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState('Ready. Scan complete.');
  const [scanHistoryCount, setScanHistoryCount] = useState(0);

  const SHELF_EXPLANATIONS = {
    conviction: {
      title: "Core Conviction Setups (High Probability Positions)",
      whyItsBest: "Setups supported by concentrated dealer buy walls where market makers are positioned to defend price — strong support, but not a guarantee; all options carry risk.",
      horizon: "1 TO 3 DAYS (SWING)",
      mathTracking: "Strong dealer buy-walls sitting under price",
      confidenceTier: "Model confidence: Very High"
    },
    improved: {
      title: "High Velocity Breakouts (Quick Scalp Trades)",
      whyItsBest: "Momentum setups with rapidly accelerating volume. Useful for quick day trading (scalping): derivative volumes are speeding up in the last 15 minutes as buyers sweep options at the ask, which can force dealers to cover their shorts and drive price up.",
      horizon: "15 MIN TO 3 HOURS (SCALP)",
      mathTracking: "Fast volume and momentum building",
      confidenceTier: "Model confidence: High"
    },
    mispriced: {
      title: "Mathematical Arbitrage (Option Premium Discounts)",
      whyItsBest: "These are deep value opportunities where options are priced exceptionally cheap. They are 'the best' because temporary implied volatility drops have created a price mismatch: active brokers are selling these contracts at a -15% discount compared to their true mathematical value. Enter cheap, exit under normal curves.",
      horizon: "2 HOURS TO 1 DAY (VALUE)",
      mathTracking: "Option priced below fair value",
      confidenceTier: "Model confidence: Solid"
    },
    invalidation: {
      title: "Support Rebounds & Boundaries (Trades Coming Back)",
      whyItsBest: "These are options hovering right at critical line-in-the-sand support thresholds. They are 'the best' for reversals because they are 'coming back' to key support lines (put walls), offering a highly defined bounce-back entry with tight, predefined stop-losses.",
      horizon: "30 MIN TO 2 HOURS (BOUNCE)",
      mathTracking: "Bouncing off dealer put-wall support",
      confidenceTier: "Model confidence: Speculative"
    },
    whale: {
      title: "Institutional Block Sweeps",
      whyItsBest: "Large institutional block orders executing at the ask, following concentrated directional flow from major market participants.",
      horizon: "1 HOUR TO 2 DAYS (SWING)",
      mathTracking: "$5M+ block trades hitting the tape",
      confidenceTier: "Model confidence: High"
    },
    all: {
      title: "All Discovered Signals (Unified Market Catalog)",
      whyItsBest: "A unified look across the entire option spectrum under scanning supervision. Use this tab to compare all categories side-by-side, sorted from the absolute strongest active model ratings to the weakest.",
      horizon: "Dependent on Selection",
      mathTracking: "All signals combined",
      confidenceTier: "All setups"
    }
  };

  // Helper function to formulate simple human reasons why each specific card is the best
  const getSimpleWordReason = (c: any) => {
    const isCall = c.isCall;
    if (c.shelf === 'conviction') {
      return `Solid institutional buy walls are supporting price at ${c.strike}. Option market makers are heavily short this strike and must buy stock to remain hedged, forming an automatic protective floor under our entry target.`;
    } else if (c.shelf === 'improved') {
      return `Rapid volume surge detected over the last few minutes. Buyers are sweeping contracts on the ask, preparing the asset for a classic option squeeze. High-velocity setup ideal for a quick, fast-exit momentum scalp.`;
    } else if (c.shelf === 'mispriced') {
      return `Illustrative example of a model/market gap: a sample ask of $${c.price.toFixed(2)} against a sample model value of $${(c.price * 1.4).toFixed(2)}. Demo data — not a live mispricing.`;
    } else if (c.shelf === 'invalidation') {
      return `Option is coming back to primary support buffers. Hovering right near the crucial put wall invalidation level. Entering here offers a safe, highly-defined rebound setup with extremely tight loss limits.`;
    } else if (c.shelf === 'whale') {
      return `Multi-million dollar blocks are sweeping this exact strike. This is institutional smart money committing heavy leverage, forcing dealer market makers to rapidly buy hedge blocks. Excellent tailwind trade.`;
    }
    return `High-scoring index anomaly active. Positive order flow momentum backing are aligned with dealer positioning and index support.`;
  };

  // Stats tickers that change slightly
  const [brierScore, setBrierScore] = useState(0.042);
  const [globalGex, setGlobalGex] = useState(485.4);
  const [scanRate, setScanRate] = useState(14.8);
  // Wall-clock of the last sample-metric tick, shown as an "as of" caption so the
  // illustrative readouts carry a freshness cue (consistent with the SAMPLE label).
  const [metricsAsOf, setMetricsAsOf] = useState<number>(() => Date.now());

  // Subscribe to the backend discovery SSE stream. NOTE: this stream currently
  // carries the SAMPLE seed rows with light server-side jitter — it does not read
  // the live option chain/flows — so the view presents it as sample/demo data.
  useEffect(() => {
    const url = '/api/stream/discovery';
    const eventSource = new EventSource(url);
    const flashTimers: ReturnType<typeof setTimeout>[] = [];

    eventSource.onopen = () => {
      // A successful (re)connection clears any prior error chip.
      setFeedError(false);
    };

    eventSource.onmessage = (event) => {
      try {
        // Any delivered message means the stream is healthy again.
        setFeedError(false);
        const data = JSON.parse(event.data);
        if (data.contracts) setContracts(data.contracts);
        if (data.feedLogs) setFeedLogs(data.feedLogs);
        if (typeof data.brierScore === 'number') setBrierScore(data.brierScore);
        if (typeof data.globalGex === 'number') setGlobalGex(data.globalGex);
        if (typeof data.scanRate === 'number') setScanRate(data.scanRate);
        if (typeof data.brierScore === 'number' || typeof data.globalGex === 'number' || typeof data.scanRate === 'number') {
          setMetricsAsOf(Date.now());
        }
        if (data.lastFlashingId) {
          setLastFlashingId(data.lastFlashingId);
          if (data.flashDirection) setFlashDirection(data.flashDirection);

          setMetricsPulse(true);
          flashTimers.push(setTimeout(() => setMetricsPulse(false), 500));
          flashTimers.push(setTimeout(() => setLastFlashingId(null), 700));
        }
      } catch (err) {
        console.error('[SkyVision Discovery Client] Error parsing SSE Stream', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SkyVision Discovery Client] EventSource Error', err);
      // Surface a subtle reconnecting state without tearing down the pipeline —
      // EventSource reconnects on its own; onopen/onmessage will clear this.
      setFeedError(true);
    };

    return () => {
      eventSource.close();
      flashTimers.forEach(clearTimeout);
    };
  }, []);

  // SAMPLE animation only: gently jitters the demo tile prices so the illustrative
  // layout isn't perfectly static. This is NOT a live market feed — it runs purely
  // on the SAMPLE seed rows and is presented under the view's "SAMPLE DATA" label.
  useEffect(() => {
    const flashTimers: ReturnType<typeof setTimeout>[] = [];
    const tickInterval = setInterval(() => {
      // Compute purely inside the updater; collect the flash side-effect to run AFTER.
      let flashedId: any = null;
      let flashDir: 'up' | 'down' = 'up';
      setContracts(prev => {
        return prev.map(c => {
          // 8% chance of tick fluctuation on any option premium row
          if (Math.random() > 0.92) {
            const isUp = Math.random() > 0.48;
            const deviation = Number((Math.random() * 0.05 + 0.01).toFixed(2));
            const newPrice = isUp ? c.price + deviation : c.price - deviation;
            const nextPrice = Math.max(0.15, Number(newPrice.toFixed(2)));
            const bidDev = isUp ? c.bid + (deviation * 0.9) : c.bid - (deviation * 0.9);
            const askDev = isUp ? c.ask + (deviation * 1.1) : c.ask - (deviation * 1.1);

            flashedId = c.id;
            flashDir = isUp ? 'up' : 'down';

            return {
              ...c,
              price: nextPrice,
              bid: Math.max(0.10, Number(bidDev.toFixed(2))),
              ask: Math.max(0.20, Number(askDev.toFixed(2)))
            };
          }
          return c;
        });
      });
      // Side effects OUTSIDE the reducer — avoids duplicate timers/state under
      // StrictMode/concurrent rendering (the updater can run twice).
      if (flashedId) {
        setLastFlashingId(flashedId);
        setFlashDirection(flashDir);
        flashTimers.push(setTimeout(() => setLastFlashingId(null), 600));
      }
    }, 2800);

    return () => { clearInterval(tickInterval); flashTimers.forEach(clearTimeout); };
  }, []);

  // Manual scan refresh: re-ticks local contract premiums and appends a fresh
  // tape entry. Server-streamed metrics (GEX / accuracy / scan-rate) are left
  // untouched — they update on their own via the discovery SSE stream.
  const triggerManualScannerRefresh = () => {
    if (isMockScanning) return;
    setIsMockScanning(true);
    setLastScanMessage('Running a fresh scan...');

    setTimeout(() => {
      let scannedCount = 0;
      setContracts(prev => {
        scannedCount = prev.length;
        return prev.map(c => {
          const shiftPercent = 1 + (Math.random() * 0.04 - 0.02); // +/-2%
          const newPrice = Math.max(0.15, Number((c.price * shiftPercent).toFixed(2)));
          return {
            ...c,
            price: newPrice,
            bid: Math.max(0.10, Number((newPrice * 0.98).toFixed(2))),
            ask: Math.max(0.20, Number((newPrice * 1.02).toFixed(2)))
          };
        });
      });

      // Insert fresh scalp feed log to show raw activity across the full launch universe.
      const randomAsset = ASSET_LIST[Math.floor(Math.random() * ASSET_LIST.length)];
      const randomTicker = randomAsset.ticker;
      const feedStep = randomAsset.defaultPrice > 1000 ? 50 : randomAsset.defaultPrice > 150 ? 5 : 1;
      const randomStrike = Math.round(randomAsset.defaultPrice / feedStep) * feedStep;
      const randomIsBullish = Math.random() > 0.4;
      const timestampLabel = formatTime(new Date());

      const newLog = {
        id: nextFeedLogId(),
        timestamp: timestampLabel,
        ticker: randomTicker,
        strike: randomStrike,
        type: randomIsBullish ? 'C' : 'P',
        side: Math.random() > 0.5 ? 'Sweep' : 'Block',
        size: `${Math.floor(Math.random() * 1500 + 400)} cons`,
        premium: `$${((Math.floor(Math.random() * 400 + 100)) * 1000).toLocaleString()}`,
        tag: randomIsBullish ? 'BULLISH' : 'HEDGE',
        action: randomIsBullish ? 'SWEPT @ ASK' : 'AT BID'
      };

      setFeedLogs(prev => [newLog, ...prev.slice(0, 11)]);
      setIsMockScanning(false);
      setScanHistoryCount(prev => prev + 1);
      setLastScanMessage(`Scan complete. ${scannedCount} contracts re-priced.`);
    }, 1000);
  };

  // Combined filtering of our expanded database
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      // 1. Shelf check
      if (activeShelf !== 'all' && c.shelf !== activeShelf) {
        return false;
      }
      // 2. Call/Put check
      if (optionTypeFilter === 'calls' && !c.isCall) return false;
      if (optionTypeFilter === 'puts' && c.isCall) return false;
      
      // 3. Search query check (search strike or ticker)
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toUpperCase();
        const matchesTicker = c.ticker.includes(query);
        const matchesStrike = String(c.strike).includes(query);
        const matchesType = (query === 'C' || query === 'CALL') ? c.isCall : (query === 'P' || query === 'PUT') ? !c.isCall : false;
        return matchesTicker || matchesStrike || matchesType;
      }
      return true;
    });
  }, [contracts, activeShelf, optionTypeFilter, searchQuery]);

  // GROUP TICKER SEPARATION SYSTEM (Separate per ticker SPX, NDX, QQQ, SPY)
  // Inside each ticker group, sort contracts from STRONGEST (highest rating) to WEAKEST (lowest rating)
  const groupedByTickerAndSorted = useMemo(() => {
    const groups: Record<string, typeof filteredContracts> = {};
    filteredContracts.forEach(c => {
      if (!groups[c.ticker]) {
        groups[c.ticker] = [];
      }
      groups[c.ticker].push(c);
    });

    // Sort contracts in each ticker group descending by health score (rating)
    Object.keys(groups).forEach(tk => {
      groups[tk].sort((a, b) => b.health - a.health);
    });

    return groups;
  }, [filteredContracts]);

  // Sort tickers: prioritize major indices SPX, NDX, QQQ, SPY, RUT
  const sortedTickers = useMemo(() => {
    return Object.keys(groupedByTickerAndSorted).sort((a, b) => {
      const priority: Record<string, number> = { 'SPX': 1, 'NDX': 2, 'QQQ': 3, 'SPY': 4, 'RUT': 5 };
      return (priority[a] || 99) - (priority[b] || 99);
    });
  }, [groupedByTickerAndSorted]);

  // Quick statistics for display
  const metricsOverview = useMemo(() => {
    const totalCount = contracts.length;
    const enterCount = contracts.filter(c => c.health >= 88).length;
    const extremeEV = contracts.filter(c => c.shelf === 'whale' || c.shelf === 'conviction').length;
    return {
      totalCount,
      enterCount,
      extremeEV
    };
  }, [contracts]);

  // Largest trades derived from the live tape (feedLogs) rather than hardcoded.
  // Premiums arrive as formatted strings ("$504,000") so we parse to compare.
  const topFlows = useMemo(() => {
    const parsePremium = (p: string) => Number(String(p).replace(/[^0-9.]/g, '')) || 0;
    let bullish: typeof feedLogs[number] | null = null;
    let hedge: typeof feedLogs[number] | null = null;
    for (const log of feedLogs) {
      if (log.tag === 'BULLISH') {
        if (!bullish || parsePremium(log.premium) > parsePremium(bullish.premium)) bullish = log;
      } else {
        if (!hedge || parsePremium(log.premium) > parsePremium(hedge.premium)) hedge = log;
      }
    }
    const largestOverall = feedLogs.reduce<typeof feedLogs[number] | null>((max, log) =>
      !max || parsePremium(log.premium) > parsePremium(max.premium) ? log : max, null);
    return { bullish, hedge, largestOverall };
  }, [feedLogs]);

  // Match corresponding AssetInfo object to trigger selection
  const handleSelectWithMatch = (ticker: string, strike: number, isCall: boolean) => {
    const asset = ASSET_LIST.find(a => a.ticker === ticker);
    if (asset) {
      onSelectContract(asset, strike, isCall);
    }
  };

  const currentManualText = SHELF_EXPLANATIONS[activeShelf];

  // Theme classes mapping — driven by design tokens so cards/wells render on the
  // real surface/border in BOTH light and dark (was hardcoded bg-black/border-black
  // in both modes, plus an invalid zinc-550).
  const c_bgMain = "bg-[var(--surface)]";
  const c_textColor = "text-[var(--text-primary)]";
  const c_cardBg = "bg-[var(--surface)] border-[var(--border)] shadow-sm text-[var(--text-primary)]";
  const c_cardBorder = "border-[var(--border)]";
  const c_textWhite = "text-[var(--text-primary)] font-black";
  const c_textMuted = "text-[var(--text-tertiary)] font-medium";
  const c_pillBg = "bg-[var(--surface-2)] border-[var(--border)]";
  const c_innerCardBg = "bg-[var(--surface-2)] border-[var(--border)]";
  const c_innerWellBg = "bg-[var(--surface)] border-[var(--border)]";
  const c_glassBg = "bg-[var(--surface)] border border-[var(--border)] shadow-md text-[var(--text-primary)]";

  return (
    <div className={`w-full flex flex-col font-mono select-none antialiased space-y-6 max-w-6xl mx-auto pt-2 pb-12 ${c_textColor}`}>
      
      {/* 1. TOP STATUS BAR */}
      <div className={`flex flex-col md:flex-row justify-between items-stretch md:items-center p-3 sm:p-4 rounded-xl gap-4 md:gap-2 border ${c_cardBg}`}>

        <div className="flex items-center gap-2.5">
          <Target className="w-4 h-4 text-[var(--success)] shrink-0" />
          <div>
            <h1 className={`text-xs font-black tracking-widest uppercase ${c_textWhite}`}>
              Trade Finder <span className="text-[var(--text-tertiary)]">/ Options Scanner</span>
              <span className="ml-2 align-middle text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30 tracking-wider">
                SAMPLE DATA
              </span>
            </h1>
            <p className="text-[9.5px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-wide">
              Illustrative setups — demo data, not a live scan
            </p>
          </div>
        </div>

        {/* Sample cockpit statistics (illustrative, not a live market reading) */}
        <div className="flex items-center gap-5 flex-wrap text-left text-[10px] md:border-l md:pl-5 border-[var(--border)]">
          <div className="space-y-0.5">
            <span className="text-[9.5px] text-[var(--text-tertiary)] uppercase block tracking-wider font-extrabold">Dealer Support</span>
            <span className="text-[var(--success)] font-bold block font-mono">
              +{globalGex.toFixed(1)}M
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9.5px] text-[var(--text-tertiary)] uppercase block tracking-wider font-extrabold">Model Accuracy</span>
            <span className={`font-mono font-bold block ${c_textWhite}`}>
              {brierScore.toFixed(4)}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9.5px] text-[var(--text-tertiary)] uppercase block tracking-wider font-extrabold">Scan Rate</span>
            <span className="text-[var(--info)] font-bold block font-mono">
              {scanRate.toFixed(1)}/s
            </span>
          </div>
          <div className="w-full md:w-auto md:basis-full">
            <span className="text-[8.5px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold tabular-nums">
              Sample · as of {formatTime(metricsAsOf)}
            </span>
          </div>
        </div>

      </div>

      {/* 2. CONTROLS BAR (Segmented Selection, Filters, Search) */}
      <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-lg border ${c_glassBg}`}>
        
        {/* Navigation Categories Tabs */}
        <div className="md:col-span-8 flex items-center p-0.5 border rounded-md overflow-x-auto scrollbar-none gap-0.5 bg-[var(--surface-2)] border-[var(--border)]">
          {[
            { id: 'conviction', label: 'TOP OPPORTUNITIES', count: contracts.filter(c => c.shelf === 'conviction').length },
            { id: 'improved', label: 'Quick Scalp', count: contracts.filter(c => c.shelf === 'improved').length },
            { id: 'mispriced', label: 'DISCOUNTED', count: contracts.filter(c => c.shelf === 'mispriced').length },
            { id: 'invalidation', label: 'REBOUNDS', count: contracts.filter(c => c.shelf === 'invalidation').length },
            { id: 'whale', label: 'WHALE SWEEPS', count: contracts.filter(c => c.shelf === 'whale').length },
            { id: 'all', label: 'ALL', count: contracts.length }
          ].map(shelf => (
            <button
              key={shelf.id}
              onClick={() => setActiveShelf(shelf.id as any)}
              className={`px-3 py-1.5 text-[9.5px] uppercase font-black tracking-wider rounded transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeShelf === shelf.id
                  ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>{shelf.label}</span>
              <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${activeShelf === shelf.id ? 'bg-[var(--surface)] text-[var(--text-secondary)]' : 'bg-[var(--surface)] text-[var(--text-tertiary)]'}`}>
                {shelf.count}
              </span>
            </button>
          ))}
        </div>

        {/* Option Call/Put Type Filter */}
         <div className="md:col-span-2 flex justify-center p-0.5 border rounded-md bg-[var(--surface-2)] border-[var(--border)]">
          {[
            { id: 'all', label: 'ALL' },
            { id: 'calls', label: 'C' },
            { id: 'puts', label: 'P' }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setOptionTypeFilter(opt.id as any)}
              className={`px-3.5 py-1.5 text-[8.5px] uppercase font-extrabold rounded flex-1 transition-colors cursor-pointer ${
                optionTypeFilter === opt.id
                  ? 'bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/30'
                  : 'text-[var(--text-tertiary)] border border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Ticker / strike search box */}
        <div
          className="md:col-span-2 relative flex items-center rounded-lg px-3 py-1.5 border transition-colors bg-[var(--surface-2)] border-[var(--border)] focus-within:border-[var(--info)]/50"
          ref={searchContainerRef}
        >
          <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)] mr-2 shrink-0" />
          <input 
            type="text" 
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="FILTER BY TICKER OR STRIKE..." 
            className={`w-full bg-transparent border-none text-[9.5px] font-black uppercase focus:outline-none placeholder-zinc-500 font-mono tracking-wider transition-all duration-200 ${
              isLight ? 'text-zinc-900' : 'text-[var(--text-primary)]'
            }`}
          />
          {searchQuery.length > 0 ? (
            <button 
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIsSearchFocused(false);
              }} 
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-[8px] uppercase font-bold pl-1 font-mono hover:underline shrink-0"
            >
              CLEAR
            </button>
          ) : (
            <kbd className="hidden sm:inline-block bg-[var(--surface-2)] text-[var(--text-tertiary)] border border-[var(--border)] px-1 py-[1.5px] rounded-xs font-mono text-[7px] select-none shrink-0">
              TXT
            </kbd>
          )}

          {/* Dynamic Search Combobox results list overlay */}
          <AnimatePresence>
            {isSearchFocused && (
              <motion.div
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 3 }}
                className={`absolute right-0 top-full mt-2 w-[300px] max-w-[calc(100vw-24px)] border shadow-2xl rounded-lg overflow-hidden z-50 text-left font-mono ${
                  isLight ? 'bg-white border-[var(--border)] text-zinc-800' : 'bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)]'
                }`}
              >
                {/* 1. SECTION: MAIN INDEXES */}
                <div className={`px-2.5 py-1 text-[7.5px] font-extrabold uppercase tracking-widest border-b ${
                  isLight ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border)]' : 'bg-[var(--surface-2)]/40 text-[var(--text-tertiary)] border-[var(--border)]'
                }`}>
                  Switch Active Index Ticker
                </div>
                {filteredSearchAssets.length === 0 ? (
                  <div className="px-3.5 py-2 text-[8px] text-[var(--text-tertiary)] uppercase">No active assets found</div>
                ) : (
                  filteredSearchAssets.map(a => (
                    <button
                      key={a.ticker}
                      onClick={() => {
                        useContractStore.getState().setSelectedAsset(a);
                        setIsSearchFocused(false);
                        setSearchQuery('');
                      }}
                      className={`w-full text-left px-3.5 py-1.5 transition-all flex justify-between items-center border-b ${
                        isLight ? 'hover:bg-[var(--surface-2)] border-[var(--border)]' : 'hover:bg-[var(--surface-3)] border-[var(--border)]'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-[9.5px] font-black ${isLight ? 'text-zinc-900' : 'text-zinc-150'}`}>{a.ticker}</span>
                        <span className="text-[7.5px] text-[var(--text-tertiary)] font-sans uppercase font-bold">{a.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold block">${a.defaultPrice.toFixed(2)}</span>
                        <span className="text-[7.5px] font-bold text-[var(--success)]">+{a.volatility.toFixed(1)}% VOL</span>
                      </div>
                    </button>
                  ))
                )}

                {/* 2. SECTION: OPTIONS & TRANSITIONS */}
                <div className={`px-2.5 py-1 text-[7.5px] font-extrabold uppercase tracking-widest border-b ${
                  isLight ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border)]' : 'bg-[var(--surface-2)]/40 text-[var(--text-tertiary)] border-[var(--border)]'
                }`}>
                  Launch Option chain / Assessments
                </div>
                <div className="max-h-[160px] overflow-y-auto">
                  {filteredSearchContracts.length === 0 ? (
                    <div className="px-3.5 py-2 text-[8px] text-[var(--text-tertiary)] uppercase">No options matched</div>
                  ) : (
                    filteredSearchContracts.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const asset = ASSET_LIST.find(a => a.ticker === c.ticker);
                          if (asset) {
                            useContractStore.getState().selectContractAtomically(asset, c.strike, c.isCall);
                          }
                          setIsSearchFocused(false);
                          setSearchQuery('');
                        }}
                        className={`w-full text-left px-3.5 py-2 transition-all border-b last:border-none flex flex-col ${
                          isLight ? 'hover:bg-[var(--surface-2)] border-[var(--border)]' : 'hover:bg-[var(--surface-3)] border-[var(--border)]'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className={`text-[9.5px] font-black ${c.isCall ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {c.ticker} {fmtNum(c.strike)}{c.isCall ? 'C' : 'P'}
                          </span>
                          <span className={`text-[7.5px] font-bold px-1 py-0.5 rounded border ${
                            c.isCall
                              ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20'
                              : 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20'
                          }`}>
                            {c.shelf.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[8px] text-[var(--text-tertiary)] font-sans font-semibold uppercase truncate">{c.narrative}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* 2B. EXPANDABLE STRATEGY EXPLANATION */}
      <div className={`w-full p-4 rounded-xl text-left border ${c_cardBg}`}>

        <button
          type="button"
          onClick={() => setIsStrategyExpanded(!isStrategyExpanded)}
          aria-expanded={isStrategyExpanded}
          className="w-full text-left flex justify-between items-center cursor-pointer select-none pb-2.5 border-b border-[var(--border)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--info)]" />
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-primary)]">
              How This Category Works
            </span>
          </div>
          <div className="flex items-center gap-1.5 py-1 px-2 rounded border bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]">
            <span className="text-[8px] font-black tracking-widest uppercase">
              {isStrategyExpanded ? 'Hide' : 'Show'}
            </span>
            {isStrategyExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isStrategyExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden pt-3.5"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch text-[10.5px]">

                {/* Justification Column */}
                <div className="md:col-span-8 space-y-2.5">
                  <div className="p-3 rounded-xl border bg-[var(--surface-2)] border-[var(--border)]">
                    <span className={`font-extrabold text-sm block mb-1.5 uppercase tracking-tight ${c_textWhite}`}>
                      {currentManualText.title}
                    </span>
                    <p className="leading-relaxed font-sans text-[13px] text-[var(--text-primary)] font-medium">
                      {currentManualText.whyItsBest}
                    </p>
                  </div>
                </div>

                {/* Targets & Threshold Metrics Column */}
                <div className="md:col-span-4 p-3 rounded-xl flex flex-col justify-between gap-3 border bg-[var(--surface-2)] border-[var(--border)]">
                  <div className="space-y-1.5 text-left">
                    <span className="text-[8px] text-[var(--text-tertiary)] tracking-wider uppercase block font-black">Parameters</span>
                    <div className="flex justify-between items-baseline font-mono">
                      <span className="text-[var(--text-tertiary)]">Horizon</span>
                      <span className={`font-bold ${c_textWhite}`}>{currentManualText.horizon}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-mono border-t pt-1.5 border-[var(--border)] gap-2">
                      <span className="text-[var(--text-tertiary)] shrink-0">Signal</span>
                      <span className="text-[var(--info)] font-bold text-[9px] uppercase text-right">{currentManualText.mathTracking}</span>
                    </div>
                    <div className="flex justify-between items-baseline font-mono border-t pt-1.5 border-[var(--border)]">
                      <span className="text-[var(--text-tertiary)]">Confidence</span>
                      <span className="text-[var(--success)] font-bold text-[9px]">{currentManualText.confidenceTier}</span>
                    </div>
                  </div>
                  <div className="text-[8px] text-[var(--text-tertiary)] border-t pt-1.5 tracking-wide border-[var(--border)]">
                    Sample data — illustrative, not a live scan.
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2C. SCANNER CONTROL */}
      <div className={`w-full p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 text-xs border ${c_glassBg}`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isMockScanning ? 'bg-[var(--warning)]' : 'bg-[var(--success)]'}`} />
          <div className="text-left">
            <span className="text-[10px] text-[var(--text-tertiary)] block font-bold uppercase tracking-wider">Scanner</span>
            <span className={`text-[10.5px] font-black ${isMockScanning ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}>
              {lastScanMessage}
            </span>
          </div>
        </div>

        <button
          onClick={triggerManualScannerRefresh}
          disabled={isMockScanning}
          className={`px-5 py-2.5 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest cursor-pointer transition-colors flex items-center gap-2 ${
            isMockScanning
              ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border)]'
              : 'bg-[var(--surface-2)] text-[var(--text-primary)] hover:bg-[var(--surface-3)] border-[var(--border-strong)]'
          }`}
        >
          {isMockScanning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--success)]" />
              <span>Scanning…</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Scan ({scanHistoryCount})</span>
            </>
          )}
        </button>
      </div>

      {/* 3. CORE DUAL-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">

        {/* LEFT COLUMN: GROUPED PER TICKER (8 COLS) */}
        <div className="lg:col-span-8 flex flex-col gap-5 w-full">

          <div className="flex justify-between items-center px-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              Showing {filteredContracts.length} of {contracts.length} setups
            </span>
          </div>

          <div className="flex flex-col gap-6 w-full">
            <AnimatePresence mode="popLayout">
              {sortedTickers.map((ticker) => {
                const tickerContracts = groupedByTickerAndSorted[ticker];
                return (
                  <div key={ticker} className="space-y-3 p-3 sm:p-4 rounded-xl text-left border bg-[var(--surface)] border-[var(--border)]">

                    {/* Ticker Section Title segment */}
                    <div className="flex items-center justify-between gap-2 border-b pb-2.5 mb-1 border-[var(--border)] flex-wrap">
                      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-black tracking-widest uppercase font-mono ${c_textWhite}`}>{ticker}</span>
                          <span className="bg-[var(--info)]/10 border border-[var(--info)]/20 text-[var(--info)] text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {tickerContracts.length} found
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 bg-[var(--surface-2)]/60 px-2 py-0.5 rounded border border-[var(--border)]/40">
                          <AssetSparkline ticker={ticker} width={50} height={12} strokeWidth={1.25} />
                          <span className="text-[9px] font-mono font-bold text-[var(--text-secondary)] opacity-90">
                            ${(useContractStore.getState().serverState?.liveSpotPrices?.[ticker] || ASSET_LIST.find(a => a.ticker === ticker)?.defaultPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      <span className="text-[7.5px] text-[var(--text-tertiary)] uppercase tracking-widest font-black shrink-0">
                        Strongest → Weakest
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                      {tickerContracts.map((c, idx) => {
                        const actionColor = c.action === 'ENTER'
                          ? 'text-[var(--success)] border-[var(--success)]/20 bg-[var(--success)]/5'
                          : c.action === 'SELL'
                            ? 'text-[var(--danger)] border-[var(--danger)]/20 bg-[var(--danger)]/5'
                            : 'text-[var(--warning)] border-[var(--warning)]/20 bg-[var(--warning)]/5';

                        const isFlashing = lastFlashingId === c.id;

                        // Classification tags: Core vs Fast Scalps vs Rebound Recoveries
                        let classBadgeLabel = "TOP OPPORTUNITY";
                        let classBadgeStyle = "bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/20";
                        if (c.shelf === 'improved') {
                          classBadgeLabel = "QUICKSCALP";
                          classBadgeStyle = "bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20";
                        } else if (c.shelf === 'invalidation') {
                          classBadgeLabel = "REBOUND";
                          classBadgeStyle = "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20";
                        } else if (c.shelf === 'mispriced') {
                          classBadgeLabel = "DISCOUNTED";
                          classBadgeStyle = "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border)]";
                        } else if (c.shelf === 'whale') {
                          classBadgeLabel = "WHALE";
                          classBadgeStyle = "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20";
                        }

                        // Strongest indicator of this group (top sorted card is ALWAYS idx === 0 within its ticker)
                        const isPrimaryPeak = idx === 0;

                        // Parameters Price Targets calculation (Institutional Swing Target vs Quick Volatility Scalp)
                        const coreSwingTarget = c.t1 != null ? c.t1 : c.price * 1.35;
                        const coreSwingGain = c.p1 != null ? c.p1 : 35;
                        const quickScalpTarget = c.price * 1.18;
                        const quickScalpGain = 18;

                        const isCardExpanded = !!expandedContracts[c.id];

                        return (
                          <motion.div
                            layout
                            key={c.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.25 }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isCardExpanded}
                            aria-label={`${c.ticker} ${c.strike}${c.isCall ? 'C' : 'P'} — ${isCardExpanded ? 'collapse' : 'expand'} details`}
                            className={`p-4 border rounded-xl flex flex-col gap-2.5 text-left transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                              isFlashing
                                ? (flashDirection === 'up' ? 'bg-[var(--success)]/5 border-[var(--success)]/30' : 'bg-[var(--danger)]/5 border-[var(--danger)]/30')
                                : isCardExpanded
                                  ? 'bg-[var(--surface-2)] border-[var(--border-strong)]'
                                  : 'bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border-[var(--border)]'
                            }`}
                            onClick={() => {
                              setExpandedContracts(prev => ({
                                ...prev,
                                [c.id]: !prev[c.id]
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedContracts(prev => ({
                                  ...prev,
                                  [c.id]: !prev[c.id]
                                }));
                              }
                            }}
                          >

                            {/* Top Contract Badge & Header */}
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-xs font-black font-sans px-2.5 py-0.5 rounded-md border uppercase inline-block ${
                                    c.isCall
                                      ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/25'
                                      : 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/25'
                                  }`}>
                                    {c.ticker} {fmtNum(c.strike)}{c.isCall ? 'C' : 'P'}
                                  </span>
                                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border ${classBadgeStyle}`}>
                                    {classBadgeLabel}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <span className="text-[7.5px] uppercase tracking-wider text-[var(--text-tertiary)] font-extrabold font-mono">
                                    Score {c.health}
                                  </span>
                                  <span className="text-[var(--text-tertiary)]">•</span>
                                  <span className={`text-[7.5px] uppercase tracking-wider font-extrabold ${actionColor}`}>
                                    {c.action}
                                  </span>
                                  {isPrimaryPeak && (
                                    <>
                                      <span className="text-[var(--text-tertiary)]">•</span>
                                      <span className="text-[7px] text-[var(--success)] font-bold bg-[var(--success)]/10 border border-[var(--success)]/20 px-1 rounded uppercase tracking-wider">
                                        Top Rated
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Expected Return */}
                              <div className="text-right flex items-start gap-3">
                                <div className="space-y-0.5">
                                  <span className="text-[7.5px] text-[var(--text-tertiary)] tracking-wider block font-bold uppercase">Expected Move</span>
                                  <span className={`text-sm font-black tracking-tight font-mono ${c.health >= 55 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                                    {c.expectedMove}
                                  </span>
                                </div>
                                <div className="pt-1 select-none text-[var(--text-tertiary)]">
                                  {isCardExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* EXPANDED DETAIL */}
                            {isCardExpanded && (
                              <div className="space-y-3 mt-1 pt-3 border-t border-[var(--border)] animate-fadeIn">
                                {/* Targets: swing vs scalp */}
                                <div className="grid grid-cols-2 gap-2 p-2 rounded-lg text-center text-[10px] border bg-[var(--surface)] border-[var(--border)]">
                                  <div className="border-r text-left pl-1 border-[var(--border)]">
                                    <div className="text-[7.5px] text-[var(--text-tertiary)] uppercase tracking-widest font-black block">Swing Target</div>
                                    <span className={`font-extrabold font-mono block text-xs ${c_textWhite}`}>
                                      ${coreSwingTarget.toFixed(2)}
                                    </span>
                                    <span className="text-[7.5px] text-[var(--success)] font-bold font-mono">
                                      +{coreSwingGain}%
                                    </span>
                                  </div>
                                  <div className="text-left pl-2">
                                    <div className="text-[7.5px] text-[var(--text-tertiary)] uppercase tracking-widest font-black block">Scalp Exit</div>
                                    <span className="text-[var(--warning)] font-extrabold font-mono block text-xs">
                                      ${quickScalpTarget.toFixed(2)}
                                    </span>
                                    <span className="text-[7.5px] text-[var(--warning)] font-bold font-mono">
                                      +{quickScalpGain}%
                                    </span>
                                  </div>
                                </div>

                                {/* Plain-English reasoning */}
                                <div className="p-2.5 rounded-lg text-[9.5px]/[14.5px] tracking-wide text-left flex gap-1.5 items-start font-sans border bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)]">
                                  <Info className="w-3.5 h-3.5 text-[var(--info)] shrink-0 mt-0.5" />
                                  <div className="font-medium tracking-wide">
                                    <span className="text-[var(--info)] font-extrabold mr-1 uppercase">Why:</span>
                                    {getSimpleWordReason(c)}
                                  </div>
                                </div>

                                {/* Narrative */}
                                <p className="text-[10px] font-sans tracking-wide leading-relaxed border-t pt-2.5 border-[var(--border)] text-[var(--text-secondary)]">
                                  {c.narrative}
                                </p>

                                {/* Greeks */}
                                <div className="border rounded-lg p-2.5 grid grid-cols-4 gap-2 text-center text-[10px] font-mono bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)]">
                                  <div>
                                    <span className="block text-[7.5px] text-[var(--text-tertiary)] mb-0.5 tracking-wider uppercase">Delta</span>
                                    <span className={`font-bold block ${c.isCall ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{c.delta}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[7.5px] text-[var(--text-tertiary)] mb-0.5 tracking-wider uppercase">Gamma</span>
                                    <span className="font-bold block text-[var(--text-primary)]">{c.gamma}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[7.5px] text-[var(--text-tertiary)] mb-0.5 tracking-wider uppercase">Theta</span>
                                    <span className="text-[var(--warning)] font-bold block">{c.theta}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[7.5px] text-[var(--text-tertiary)] mb-0.5 tracking-wider uppercase">IV</span>
                                    <span className="font-bold block text-[var(--text-secondary)]">{(c.vega * 100).toFixed(1)}%</span>
                                  </div>
                                </div>

                                {/* Pricing */}
                                <div className="flex justify-between items-center pt-2.5 border-t border-[var(--border)] text-[10.5px]">
                                  <div className="space-y-0.5">
                                    <span className="text-[7.5px] text-[var(--text-tertiary)] uppercase block tracking-wider font-bold">Bid / Ask</span>
                                    <span className="text-[var(--text-secondary)] font-mono font-bold block">
                                      ${c.bid.toFixed(2)} – ${c.ask.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[7.5px] text-[var(--text-tertiary)] uppercase block tracking-wider font-bold">Sample Mid</span>
                                    <motion.span
                                      animate={isFlashing ? { scale: [1, 1.1, 1] } : {}}
                                      className={`text-xs font-black block font-mono ${
                                        isFlashing
                                          ? (flashDirection === 'up' ? 'text-[var(--success)]' : 'text-[var(--danger)]')
                                          : 'text-[var(--text-primary)]'
                                      }`}
                                    >
                                      ${c.price.toFixed(2)}
                                    </motion.span>
                                  </div>
                                </div>

                                {/* Action: open deep assessment */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectWithMatch(c.ticker, c.strike, c.isCall);
                                  }}
                                  className="w-full py-2.5 bg-[var(--success)] hover:bg-[#3fce72] border border-[var(--success)] text-[8.5px] text-[#04140A] font-extrabold uppercase tracking-widest rounded-md mt-1 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <span>Open Full Analysis</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}

                            {/* Expand/collapse hint */}
                            <div className="flex justify-end items-center text-[7.5px] font-sans text-[var(--text-tertiary)] uppercase tracking-wider pt-2 border-t border-[var(--border)] w-full mt-2.5 select-none">
                              <span className="flex items-center gap-0.5 font-bold">
                                {isCardExpanded ? "Collapse" : "Details"}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isCardExpanded ? 'rotate-180' : ''}`} />
                              </span>
                            </div>

                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </AnimatePresence>

            {filteredContracts.length === 0 && (
              <div className="border p-8 rounded-xl text-center uppercase text-xs space-y-2 bg-[var(--surface)] border-[var(--border)]">
                <ShieldAlert className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
                <p className={`font-extrabold tracking-widest text-[10px] ${c_textWhite}`}>No setups match your filters.</p>
                <p className="text-[9px] text-[var(--text-tertiary)] leading-snug font-sans">
                  Try clearing the filters or modifying your search terms above.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveShelf('all');
                    setOptionTypeFilter('all');
                    setSearchQuery('');
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border font-mono text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer bg-transparent border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--success)] hover:text-[var(--success)]"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clear filters
                </button>
              </div>
            )}

          </div>

          {/* GRID SUMMARY */}
          <div className={`w-full rounded-xl p-3 sm:p-5 text-left flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border ${c_cardBg}`}>
            <div className="space-y-1">
              <span className="text-[8.5px] text-[var(--info)] tracking-widest uppercase font-black block">How This Works</span>
              <p className="text-[10px] tracking-wide leading-relaxed font-sans font-medium text-[var(--text-secondary)]">
                This is a sample layout illustrating how dealer positioning, expected moves, and option pricing would be ranked. It is demo data, not a live scan. Tap any contract above to see its illustrative price targets.
              </p>
            </div>
            <div className="flex gap-5 shrink-0 text-left border-t md:border-t-0 md:border-l pt-3 md:pt-0 md:pl-5 border-[var(--border)]">
              <div>
                <span className="text-[7.5px] text-[var(--text-tertiary)] uppercase font-black tracking-widest block">Buy Signals</span>
                <span className={`text-sm font-black font-mono ${c_textWhite}`}>{(metricsOverview.totalCount > 0 ? (metricsOverview.enterCount / metricsOverview.totalCount) * 100 : 0).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-[7.5px] text-[var(--text-tertiary)] uppercase font-black tracking-widest block">High Conviction</span>
                <span className="text-sm font-black text-[var(--success)] font-mono">{metricsOverview.extremeEV}</span>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: FLOW FEED & LARGEST TRADES (4 COLS) */}
        <div className="lg:col-span-4 flex flex-col gap-4 w-full">

          {/* A. LARGEST TRADES (derived from live tape) */}
          <div className={`border rounded-xl p-3 sm:p-4.5 text-left flex flex-col gap-3.5 ${c_cardBg}`}>

            <div className="flex items-center gap-2 border-b pb-2.5 border-[var(--border)]">
              <Flame className="w-4 h-4 text-[var(--danger)]" />
              <h2 className={`text-[10.5px] font-black uppercase tracking-widest ${c_textWhite}`}>
                Largest Trades
              </h2>
            </div>

            <div className="space-y-2.5">

              {/* Largest bullish */}
              <div className="border p-2.5 rounded-lg flex justify-between items-center text-[10px] bg-[var(--surface-2)] border-[var(--border)]">
                {topFlows.bullish ? (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[7.5px] uppercase block font-black text-[var(--text-tertiary)]">Largest Bullish</span>
                      <span className="text-[var(--success)] font-bold block">{topFlows.bullish.ticker} {fmtNum(topFlows.bullish.strike)}{topFlows.bullish.type}</span>
                      <span className="text-[8px] font-sans uppercase text-[var(--text-secondary)]">{topFlows.bullish.size}</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="text-[7.5px] block uppercase font-bold text-[var(--text-tertiary)]">Premium</span>
                      <span className={`block font-black font-mono ${c_textWhite}`}>{topFlows.bullish.premium}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-[9px] text-[var(--text-tertiary)] italic">Awaiting bullish flow…</span>
                )}
              </div>

              {/* Largest hedge / bearish */}
              <div className="border p-2.5 rounded-lg flex justify-between items-center text-[10px] bg-[var(--surface-2)] border-[var(--border)]">
                {topFlows.hedge ? (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[7.5px] uppercase block font-black text-[var(--text-tertiary)]">Largest Hedge</span>
                      <span className="text-[var(--danger)] font-bold block">{topFlows.hedge.ticker} {fmtNum(topFlows.hedge.strike)}{topFlows.hedge.type}</span>
                      <span className="text-[8px] font-sans uppercase text-[var(--text-secondary)]">{topFlows.hedge.size}</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="text-[7.5px] block uppercase font-bold text-[var(--text-tertiary)]">Premium</span>
                      <span className={`block font-black font-mono ${c_textWhite}`}>{topFlows.hedge.premium}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-[9px] text-[var(--text-tertiary)] italic">Awaiting hedge flow…</span>
                )}
              </div>

              {/* Largest overall */}
              <div className="border p-2.5 rounded-lg flex justify-between items-center text-[10px] bg-[var(--surface-2)] border-[var(--border)]">
                {topFlows.largestOverall ? (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[7.5px] uppercase block font-black text-[var(--text-tertiary)]">Largest Overall</span>
                      <span className="text-[var(--info)] font-bold block">{topFlows.largestOverall.ticker} {fmtNum(topFlows.largestOverall.strike)}{topFlows.largestOverall.type}</span>
                      <span className="text-[8px] font-sans uppercase text-[var(--text-secondary)]">{topFlows.largestOverall.side}</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="text-[7.5px] block uppercase font-bold text-[var(--text-tertiary)]">Premium</span>
                      <span className={`block font-black font-mono ${c_textWhite}`}>{topFlows.largestOverall.premium}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-[9px] text-[var(--text-tertiary)] italic">Awaiting flow…</span>
                )}
              </div>

            </div>

          </div>

          {/* B. LIVE FLOW FEED */}
          <div className={`border rounded-xl p-3 sm:p-4.5 text-left flex flex-col gap-3.5 ${c_cardBg}`}>

            <div className="flex items-center justify-between border-b pb-2.5 border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[var(--info)]" />
                <h2 className={`text-[10.5px] font-black uppercase tracking-widest ${c_textWhite}`}>
                  Sample Option Flow
                </h2>
              </div>
              {feedError && (
                <span
                  className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30"
                  role="status"
                  aria-live="polite"
                >
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                  Reconnecting…
                </span>
              )}
            </div>

            {/* Scrolling Tape Container */}
            <div className="h-[285px] overflow-y-auto scrollbar-thin pr-1 select-none flex flex-col gap-1.5">
              <AnimatePresence initial={false}>
                {feedLogs.map((log, index) => {
                  const isSweep = log.side === 'Sweep';
                  const isBullish = log.tag === 'BULLISH';

                  return (
                    <motion.div
                      key={(log as any).id ?? `${log.timestamp}-${log.ticker}-${log.strike}-${index}`}
                      initial={{ opacity: 0, x: 20, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: 'auto' }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="py-2.5 border rounded-lg px-2.5 transition-colors flex flex-col gap-1 text-[9.5px] bg-[var(--surface-2)] border-[var(--border)] hover:bg-[var(--surface-3)]"
                    >
                      <div className="flex justify-between items-center text-[9px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-[var(--text-tertiary)]">{log.timestamp}</span>
                          <span className={`px-1 py-0.5 rounded font-black text-[7.5px] ${
                            isSweep ? 'bg-[var(--warning)]/10 border border-[var(--warning)]/25 text-[var(--warning)]' : 'bg-[var(--info)]/10 border border-[var(--info)]/25 text-[var(--info)]'
                          }`}>
                            {log.side.toUpperCase()}
                          </span>
                        </div>
                        <span className={`font-mono font-extrabold flex items-center gap-1 ${isBullish ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                          <span aria-hidden="true">{isBullish ? '▲' : '▼'}</span>
                          {log.action}
                        </span>
                      </div>

                      <div className="flex justify-between items-baseline font-mono font-bold">
                        <span className={`text-[10.5px] ${c_textWhite}`}>
                          {log.ticker} {fmtNum(log.strike)}{log.type}
                        </span>
                        <span className={isBullish ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                          <span aria-hidden="true">{isBullish ? '+' : '−'}</span>{log.premium}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[8.5px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border)]">
                        <span>Size {log.size}</span>
                        <span>Bias <span className={isBullish ? 'text-[var(--success)] font-bold' : 'text-[var(--text-secondary)] font-bold'}>{log.tag}</span></span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
