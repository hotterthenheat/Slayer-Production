import React, { useState, useEffect, memo, useRef, useMemo, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useContractStore, isLocalDevEnv, accessTierToNumber } from './lib/store';
import { applyAllPreferences } from './lib/displayPrefs';
import { ASSET_LIST } from './data';
import { AssetInfo } from './types';
import { formatTime } from './lib/timeUtils';

// Import Workspace Modular Views — eager imports are the shell + landing path.
import { DiscoveryView } from './components/DiscoveryView';
import SlayerIntro from './components/SlayerIntro';
import { SkyseyeAlertHub } from './components/SkyseyeAlertHub';
import TierGuard from './components/TierGuard';
import { ClerkGate } from './components/ClerkGate';
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette } from './components/CommandPalette';
// Eagerly imported because SlayerIntro (also eager, on the landing path) imports it
// statically — a lazy() wrapper here can't code-split it and only warns at build.
import { SubscriptionPricing } from './components/SubscriptionPricing';

// Heavy secondary views are code-split (lazy) to keep the initial bundle small;
// they load on demand inside the <Suspense> boundary in the main workspace.
const SkyVisionView = lazy(() => import('./components/SkyVisionView').then(m => ({ default: m.SkyVisionView })));
const QuantAuditView = lazy(() => import('./components/QuantAuditView').then(m => ({ default: m.QuantAuditView })));
const DealerFlowView = lazy(() => import('./components/DealerFlowView').then(m => ({ default: m.DealerFlowView })));
const ArborCapital = lazy(() => import('./components/ArborCapital'));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const AdminOverseerPanel = lazy(() => import('./components/AdminOverseerPanel').then(m => ({ default: m.AdminOverseerPanel })));
const WorkspaceView = lazy(() => import('./components/WorkspaceView').then(m => ({ default: m.WorkspaceView })));
const QuantSuiteView = lazy(() => import('./components/QuantSuiteView'));
import { AppShell } from './components/AppShell';

import {
  Sparkles,
  Database,
  Compass,
  Dna,
  Lock,
  LayoutGrid,
  LogOut,
  Waves,
  ShieldCheck,
  Sun,
  Moon,
  Activity,
  Bell,
  Smartphone,
  FileText,
  SlidersHorizontal,
  GraduationCap,
  Search,
  ChevronRight,
  Calculator
} from 'lucide-react';

const TickerTape = memo(() => {
  const liveSpot = useContractStore((s) => s.serverState?.liveSpotPrices) as Record<string, number> | undefined;
  const prevRef = React.useRef<Record<string, number>>({});
  const meta = [
    { ticker: 'SPX', name: 'S&P 500 Index', fallback: 7623 },
    { ticker: 'NDX', name: 'NASDAQ 100 Index', fallback: 18250 },
    { ticker: 'QQQ', name: 'NASDAQ 100 ETF', fallback: 445.5 },
    { ticker: 'SPY', name: 'S&P 500 ETF', fallback: 512.3 },
    { ticker: 'RUT', name: 'Russell 2000 Index', fallback: 2025 },
  ];
  const items = meta.map((m) => {
    const v = liveSpot ? liveSpot[m.ticker] : undefined;
    const live = typeof v === 'number' && v > 0;
    const price = live ? (v as number) : m.fallback;
    const prev = prevRef.current[m.ticker];
    const isUp = prev === undefined ? true : price >= prev;
    return { ...m, price, isUp, live };
  });
  React.useEffect(() => { items.forEach((it) => { prevRef.current[it.ticker] = it.price; }); }, [liveSpot]);
  const staticTickers = [...items, ...items, ...items];

  return (
    <div className="w-full bg-black/75 border-b border-black/50 backdrop-blur-xl overflow-hidden py-1.5 relative z-40 select-none">
      <div className="animate-ticker-marquee flex whitespace-nowrap">
        {[...Array(2)].map((_, loopIdx) => (
          <div key={loopIdx} className="flex gap-14 items-center pr-14 animate-none">
            {staticTickers.map((t, idx) => (
              <div 
                key={`${loopIdx}-${idx}`} 
                className="flex items-center gap-2.5 font-mono text-[9.5px] px-2 py-1 rounded transition-all"
              >
                <span className="font-black text-[#E5E5E5] tracking-widest">{t.ticker}</span>
                <span className="text-zinc-500 text-[8.5px] uppercase">{t.name}</span>
                <span className={`font-extrabold tabular-nums ${t.isUp ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>${t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className={`text-[8px] font-black ${t.isUp ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                  {t.isUp ? '▲' : '▼'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

// Live footer clock that respects the user's global timezone/format preferences.
const FooterClock: React.FC = () => {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    // No overrides → formatTime reads the user's stored timezone/format prefs.
    const tick = () => setTime(formatTime(new Date()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-[#fbbf24] font-black tabular-nums">{time}</span>
  );
};

export default function App() {
  // Navigation & configuration subscribing to global useContractStore Zustand store
  const activeTab = useContractStore(s => s.activeTab);
  const setActiveTab = useContractStore(s => s.setActiveTab);

  const handleSelectTab = (tab: any) => {
    setActiveTab(tab);
  };

  const selectedAsset = useContractStore(s => s.selectedAsset);
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const selectedTimeframe = useContractStore(s => s.selectedTimeframe);
  const setSelectedTimeframe = useContractStore(s => s.setSelectedTimeframe);
  const selectedOptionType = useContractStore(s => s.selectedOptionType);
  const setSelectedOptionType = useContractStore(s => s.setSelectedOptionType);
  const selectedStrike = useContractStore(s => s.selectedStrike);
  const setCustomStrike = useContractStore(s => s.setSelectedStrike);
  const isPositionOpen = useContractStore(s => s.isPositionOpen);
  const setIsPositionOpen = useContractStore(s => s.setIsPositionOpen);

  const serverState = useContractStore(s => s.serverState);
  const updateFromSSE = useContractStore(s => s.updateFromSSE);
  const tickMarketState = useContractStore(s => s.tickMarketState);
  const isContractLocked = useContractStore(s => s.isContractLocked);
  const purchasedTier = useContractStore(s => s.purchasedTier);

  const themeMode = useContractStore(s => s.themeMode);
  const toggleThemeMode = useContractStore(s => s.toggleThemeMode);
  const isLight = themeMode === 'light';

  const smoothScroll = useContractStore(s => s.smoothScroll);
  const toggleSmoothScroll = useContractStore(s => s.toggleSmoothScroll);
  const keybinds = useContractStore(s => s.keybinds);

  useEffect(() => {
    if (isLight) {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [isLight]);

  useEffect(() => {
    if (smoothScroll) {
      document.documentElement.classList.add('scroll-smooth');
      document.body.classList.add('scroll-smooth');
    } else {
      document.documentElement.classList.remove('scroll-smooth');
      document.body.classList.remove('scroll-smooth');
    }
  }, [smoothScroll]);

  // User session state (Bug #9 HttpOnly cookie verification and storage)
  const [session, setSession] = useState<{ 
    authenticated: boolean; 
    name?: string; 
    provider?: string; 
    avatar?: string;
    access_tier?: 'guest' | 'discord' | 'intraday' | 'quant' | 'enterprise' | 'lifetime';
    is_super_admin?: boolean;
    admin_role?: string;
    is_impersonating?: boolean;
    impersonated_by?: string;
    referral_tokens_pool?: number;
    custom_referral_code?: string;
    selected_font_scale?: 'STANDARD' | 'ENHANCED';
    compact_view_enabled?: boolean;
    selected_theme?: 'SLAYER PURE DARK' | 'DEALER FLOW SLATE' | 'VOLATILITY RADAR' | 'CARBON MONITOR MATTE' | 'FOREST ALGORITHM' | 'CRIMSON TAPE' | 'MIDNIGHT OCEAN' | string;
    no_refund_policy_logged?: boolean;
  } | null>(null);

  const [sessionBlockedMessage, setSessionBlockedMessage] = useState<string | null>(null);
  const [showWelcomeCelebration, setShowWelcomeCelebration] = useState(false);
  const [welcomeCelebrationTier, setWelcomeCelebrationTier] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // INJECT: VIEWPORT SIMULATION STATE
  const [originalAdminSession, setOriginalAdminSession] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [feedStatus, setFeedStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');

  const handleSimulateTier = (targetTier: string, targetTierNum: number) => {
    // Save the real admin session in the background before overriding
    if (!isSimulating) setOriginalAdminSession(session);
    
    setIsSimulating(true);
    
    // Spoof the session object to downgrade clearance
    setSession((prev: any) => ({ 
      ...prev, 
      access_tier: targetTier, 
      is_super_admin: false 
    })); 
    
    // Override the global Zustand store to trigger the UI changes
    useContractStore.getState().setPurchasedTier(targetTierNum);
    
    // Route to home so the admin can test the routing locks natively
    setActiveTab('home');
  };

  const handleExitSimulation = () => {
    // Instantly restore God-Mode clearance
    setSession(originalAdminSession);
    setIsSimulating(false);
    useContractStore.getState().setPurchasedTier(5); // Restores Lifetime/Admin tier visually
    setOriginalAdminSession(null);
  };

  // Apply Text Size Scaling and Compact View to DOM
  useEffect(() => {
    if (!session) return;
    
    // Font Scaling
    const html = document.documentElement;
    if ((session.selected_font_scale as any) === 'ENHANCED') {
      html.style.fontSize = '18px';
    } else if ((session.selected_font_scale as any) === 'ENHANCED_XL') {
      html.style.fontSize = '20px';
    } else {
      html.style.fontSize = '16px';
    }

    // Compact View Mode
    if (session.compact_view_enabled) {
      html.style.setProperty('--grid-gap', '0.25rem');
      html.style.setProperty('--card-padding', '0.5rem');
      html.classList.add('compact-mode');
    } else {
      html.style.setProperty('--grid-gap', '1rem');
      html.style.setProperty('--card-padding', '1.5rem');
      html.classList.remove('compact-mode');
    }
  }, [session?.selected_font_scale, session?.compact_view_enabled]);

  // Prevent background scrolling when auth modal is active
  useEffect(() => {
    if (showAuthModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showAuthModal]);

  // Subscription tier calculations and click-to-upgrade behavior
  const tierInfo = useMemo(() => {
    switch (purchasedTier) {
      case 0:
        return {
          label: "TIER 0 // PUBLIC ACCESS",
          desc: "NOT SECURED // LOGIN REQUIRED",
          style: "bg-zinc-500/10 border-zinc-500/25 text-zinc-400 shadow-[0_0_15px_rgba(113,113,122,0.05)]",
          dotColor: "bg-zinc-500",
          iconColor: "text-zinc-400"
        };
      case 1:
        return {
          label: "TIER 1 // SQUIRE ALERTS",
          desc: "LIVE TRADING FEED ACTIVE",
          style: "bg-indigo-500/10 border-indigo-500/25 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.05)]",
          dotColor: "bg-indigo-500",
          iconColor: "text-indigo-400"
        };
      case 2:
        return {
          label: "TIER 2 // ASSASSIN COCKPIT",
          desc: "DECISION ARMORY UNLOCKED",
          style: "bg-sky-500/10 border-sky-500/25 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.05)]",
          dotColor: "bg-sky-450",
          iconColor: "text-sky-400"
        };
      case 3:
        return {
          label: "TIER 3 // DRAGONSLAYER DEALER FLOW",
          desc: "REAL-TIME GAMMA DEALER FLOW",
          style: "bg-[#4ADE80] text-black/10 border-black text-[#4ADE80] shadow-[0_0_15px_rgba(34,211,238,0.05)] border-2 border-black",
          dotColor: "bg-black/40",
          iconColor: "text-[#4ADE80] animate-pulse"
        };
      case 4:
        return {
          label: "TIER 4 // REAPER QUANT SUITE",
          desc: "INSTITUTIONAL QUANT SUITE",
          style: "bg-amber-500/10 border-amber-500/25 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.05)]",
          dotColor: "bg-amber-400",
          iconColor: "text-amber-400"
        };
      case 5:
      default:
        return {
          label: "TIER 5 // IMMORTAL LIFETIME UNLIMITED",
          desc: "WORKSPACE CLEARANCE GRANTED",
          style: "bg-gradient-to-r from-red-500/5 via-amber-500/5 to-indigo-500/5 border-amber-500/40 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.12)]",
          dotColor: "bg-gradient-to-r from-red-400 via-amber-400 to-indigo-400",
          iconColor: "text-amber-300 animate-pulse"
        };
    }
  }, [purchasedTier]);

  const handleUpgradeClick = () => {
    if (activeTab !== 'home') {
      setActiveTab('home');
      setTimeout(() => {
        const element = document.getElementById('pricing-matrices');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    } else {
      const element = document.getElementById('pricing-matrices');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Global Command Palette states (Prism Menu) backed by our Zustand store
  const isGlobalSearchOpen = useContractStore(s => s.isGlobalSearchOpen);
  const setIsGlobalSearchOpen = useContractStore(s => s.setIsGlobalSearchOpen);
  const trades = useContractStore(s => s.trades);

  const [globalSearchInput, setGlobalSearchInput] = useState('');
  const [globalSearchIndex, setGlobalSearchIndex] = useState(0);
  const prismFilter = useContractStore(s => s.prismFilter);
  const setPrismFilter = useContractStore(s => s.setPrismFilter);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);

  const filterTickersList = useMemo(() => {
    const query = globalSearchInput.trim().toLowerCase();

    // Contextual static items
    const staticContracts = [
      { ticker: 'SPX', name: 'SPX 7650C Call Winning Transaction', contract: 'SPX 7650C', pnl: '+$4.20B', status: 'Success Target 3', id: 'stat-1', isContract: true },
      { ticker: 'NDX', name: 'NDX 18200C Call Early Closed Transaction', contract: 'NDX 18200C', pnl: '+$2.50B', status: 'Success Target 2', id: 'stat-2', isContract: true },
      { ticker: 'NDX', name: 'NDX 18200P Put Swing Trade', contract: 'NDX 18200P', pnl: '+$1.80B', status: 'Success Target 2', id: 'stat-sp1', isContract: true },
      { ticker: 'SPY', name: 'SPY 448P Put Imbalance Washout', contract: 'SPY 448P', pnl: '+$240M', status: 'Success Target 3', id: 'stat-sp2', isContract: true },
      { ticker: 'QQQ', name: 'QQQ 492P Volatility Expansion Swing', contract: 'QQQ 492P', pnl: '-$45M', status: 'Stop Loss Hit', id: 'stat-sp3', isContract: true },
      { ticker: 'SPY', name: 'SPY 445P Put Short Cover Raid', contract: 'SPY 445P', pnl: '+$310M', status: 'Success Target 3', id: 'stat-sp4', isContract: true },
    ];

    const convertedLive = trades.map(t => ({
      ticker: t.underlying,
      name: `${t.underlying} ${t.contract} ${t.direction === 'BULLISH' ? 'CALL' : 'PUT'} Execution`,
      contract: t.contract,
      pnl: t.maxGain > 0 ? `+${t.maxGain.toFixed(1)}%` : 'Active Tracker',
      status: t.target3Hit ? 'Target 3 Clipped' : t.target2Hit ? 'Target 2 Clipped' : 'Staged/Live',
      id: t.id,
      isContract: true
    }));

    const mergedContracts = [...convertedLive, ...staticContracts];

    const toolsItems = [
      { ticker: 'SVI', name: 'SVI Volatility Solver', pnl: 'Volatility Tool', id: 'svi-solver', isTool: true },
      { ticker: 'G3D', name: '3D Gamma Map', pnl: 'Visualizer', id: 'gamma-surface', isTool: true },
      { ticker: 'VPIN', name: 'Order Flow Toxicity', pnl: 'Order Flow', id: 'vpin-tracker', isTool: true }
    ];

    const navItems = [
      { id: 'nav-home', name: 'Home Workspace', ticker: 'HOME', pnl: 'Workspace', isNav: true, targetTab: 'home' },
      { id: 'nav-skyvision', name: 'SkyVision Cockpit', ticker: 'SKYV', pnl: 'Workspace', isNav: true, targetTab: 'skyvision' },
      { id: 'nav-pinpoint', name: 'Pinpoint AI', ticker: 'PINP', pnl: 'Workspace', isNav: true, targetTab: 'pinpoint' },
      { id: 'nav-auditor', name: 'Trust Archive & Registry', ticker: 'AUDIT', pnl: 'Workspace', isNav: true, targetTab: 'auditor' },
      { id: 'nav-dealerflow', name: 'Dealer Flow', ticker: 'FLOW', pnl: 'Workspace', isNav: true, targetTab: 'dealerflow' },
      { id: 'nav-community', name: 'Research & Community', ticker: 'SLAYER', pnl: 'Workspace', isNav: true, targetTab: 'community' },
      { id: 'nav-settings', name: 'Settings & Preferences', ticker: 'SETT', pnl: 'System', isNav: true, targetTab: 'settings' }
    ];

    const defaultTickers = [
      { ticker: 'SPX', name: 'S&P 500 Index', price: 7623.00, change: '+0.88%', isUp: true, isContract: false },
      { ticker: 'NDX', name: 'Nasdaq 100 Index', price: 18250.00, change: '+1.42%', isUp: true, isContract: false },
      { ticker: 'QQQ', name: 'Invesco QQQ Trust', price: 445.50, change: '+1.24%', isUp: true, isContract: false },
      { ticker: 'SPY', name: 'SPDR S&P 500 ETF', price: 512.30, change: '+0.65%', isUp: true, isContract: false },
      { ticker: 'RUT', name: 'Russell 2000 Index', price: 2025.00, change: '+0.92%', isUp: true, isContract: false },
    ];

    let combinedSet = [];
    if (prismFilter === 'All') {
      combinedSet = [
        ...defaultTickers,
        ...toolsItems,
        ...navItems,
        ...(activeTab === 'auditor' ? mergedContracts : [])
      ];
    } else if (prismFilter === 'Assets') {
      combinedSet = defaultTickers;
    } else if (prismFilter === 'Tools') {
      combinedSet = toolsItems;
    } else if (prismFilter === 'Navigation') {
      combinedSet = navItems;
    }

    if (!query) return combinedSet;

    return combinedSet.filter(item => {
      const pnlSearch = (item.pnl || '').toString().toLowerCase();
      const statusSearch = (item.status || '').toString().toLowerCase();
      const contractSearch = (item.contract || '').toString().toLowerCase();

      return item.ticker.toLowerCase().includes(query) || 
             item.name.toLowerCase().includes(query) ||
             pnlSearch.includes(query) ||
             statusSearch.includes(query) ||
             contractSearch.includes(query);
    });
  }, [globalSearchInput, prismFilter, activeTab, trades]);

  useEffect(() => {
    if (isGlobalSearchOpen) {
      setGlobalSearchInput('');
      setGlobalSearchIndex(0);
      document.body.classList.add('prism-locked'); // Lock background scrolling
      const timer = setTimeout(() => {
        globalSearchInputRef.current?.focus();
      }, 80);
      return () => {
        clearTimeout(timer);
        document.body.classList.remove('prism-locked'); // Unlock scrolling
      };
    } else {
      document.body.classList.remove('prism-locked');
    }
  }, [isGlobalSearchOpen]);

  // Global Keybind Event Listener
  useEffect(() => {
    const handleGlobalSearchKeys = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          useContractStore.getState().setIsGlobalSearchOpen(false);
        }
        return;
      }
      
      const parts = [];
      if (e.metaKey || e.ctrlKey) parts.push('cmd');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.key.toLowerCase());
      const pressedCombo = parts.join('+');

      const state = useContractStore.getState();
      const binds = state.keybinds;
      const disabled = state.disabledKeybinds || {};
      const globalEnabled = state.globalKeybindsEnabled;

      // Handle escape independently of the configurable keybinds
      if (e.key === 'Escape') {
        useContractStore.getState().setIsGlobalSearchOpen(false);
        return;
      }

      if (!globalEnabled) return;

      if (pressedCombo === binds.prismMenu && !disabled.prismMenu) {
        e.preventDefault();
        const currentOpen = useContractStore.getState().isGlobalSearchOpen;
        useContractStore.getState().setIsGlobalSearchOpen(!currentOpen);
      } else if (pressedCombo === binds.home && !disabled.home) {
        e.preventDefault();
        useContractStore.getState().setActiveTab('home');
        useContractStore.getState().setIsGlobalSearchOpen(false);
      } else if (pressedCombo === binds.skyvision && !disabled.skyvision) {
        e.preventDefault();
        useContractStore.getState().setActiveTab('skyvision');
        useContractStore.getState().setIsGlobalSearchOpen(false);
      } else if (pressedCombo === binds.pinpoint && !disabled.pinpoint) {
        e.preventDefault();
        useContractStore.getState().setActiveTab('pinpoint');
        useContractStore.getState().setIsGlobalSearchOpen(false);
      } else if (pressedCombo === binds.auditor && !disabled.auditor) {
        e.preventDefault();
        useContractStore.getState().setActiveTab('auditor');
        useContractStore.getState().setIsGlobalSearchOpen(false);
      } else if (pressedCombo === binds.dealerflow && !disabled.dealerflow) {
        e.preventDefault();
        useContractStore.getState().setActiveTab('dealerflow');
        useContractStore.getState().setIsGlobalSearchOpen(false);
      } else if (pressedCombo === binds.community && !disabled.community) {
        e.preventDefault();
        useContractStore.getState().setActiveTab('community');
        useContractStore.getState().setIsGlobalSearchOpen(false);
      } else if (pressedCombo === binds.settings && !disabled.settings) {
        e.preventDefault();
        useContractStore.getState().setActiveTab('settings');
        useContractStore.getState().setIsGlobalSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalSearchKeys);
    return () => window.removeEventListener('keydown', handleGlobalSearchKeys);
  }, []);

  const handleGlobalSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filterTickersList.length === 0) return; // nothing to navigate; avoids % 0 → NaN index
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setGlobalSearchIndex(prev => (prev + 1) % filterTickersList.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setGlobalSearchIndex(prev => (prev - 1 + filterTickersList.length) % filterTickersList.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filterTickersList[globalSearchIndex]) {
        const item = filterTickersList[globalSearchIndex] as any;
        if (item.isContract) {
          useContractStore.setState({
            activeTab: 'auditor',
            auditSearchQuery: item.contract,
            expandedAuditId: item.id
          });

        } else if (item.isNav) {
          useContractStore.setState({
            activeTab: item.targetTab,
            auditSearchQuery: '',
            expandedAuditId: null
          });
        } else if (item.isTool) {
          if (item.id === 'svi-solver') {
            useContractStore.setState({
              activeTab: 'pinpoint',
              auditSearchQuery: '',
              expandedAuditId: null
            });
          } else if (item.id === 'gamma-surface') {
            useContractStore.setState({
              activeTab: 'skyvision',
              auditSearchQuery: '',
              expandedAuditId: null
            });
          } else if (item.id === 'vpin-tracker') {
            useContractStore.setState({
              activeTab: 'pinpoint',
              auditSearchQuery: '',
              expandedAuditId: null
            });
          }
        } else {
          const targetAsset = ASSET_LIST.find(a => a.ticker === item.ticker);
          if (targetAsset) {
            setSelectedAsset(targetAsset);
            useContractStore.setState({
              auditSearchQuery: '',
              expandedAuditId: null
            });
          }
        }
        setIsGlobalSearchOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsGlobalSearchOpen(false);
    }
  };

  // Fetch session on load
  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        
        // Restore avatar from local storage if server memory wiped it
        if (data.authenticated) {
          const localAvatar = localStorage.getItem('slayer_avatar');
          if (localAvatar) {
            data.avatar = localAvatar;
          }
          applyAllPreferences({
            selected_theme: data.selected_theme,
            selected_font_scale: data.selected_font_scale,
            compact_view_enabled: data.compact_view_enabled,
            ultrawide_enabled: data.ultrawide_enabled,
          });
        }
        
        setSession(data);
        
        // Sync the Zustand store tier from the session — but NEVER on localhost/dev,
        // where the terminal is intentionally fully unlocked (otherwise an
        // unauthenticated local session would re-lock it). Uses the shared
        // accessTierToNumber mapping so client and store can't diverge.
        if (!isLocalDevEnv()) {
          if (data.authenticated && data.access_tier) {
            useContractStore.getState().setIsAuthenticated(true);
            useContractStore.getState().setPurchasedTier(accessTierToNumber(data.access_tier));
          } else {
            useContractStore.getState().setIsAuthenticated(false);
            useContractStore.getState().setPurchasedTier(0);
            localStorage.removeItem('slayer_tier');
            localStorage.removeItem('slayer_auth');
          }
        }
      }
    } catch (e: any) {
      if (e?.message !== 'Failed to fetch') {
        console.error('Failed to load session details', e);
      }
    }
  };

  useEffect(() => {
    fetchSession();
    (window as any).refreshSlayerSession = fetchSession;

    // Check for referral link — route to subscription. Single cleanup path so the
    // refreshSlayerSession global is always removed (the previous early return on the
    // /join/ path skipped that cleanup and leaked the global).
    let joinTimer: ReturnType<typeof setTimeout> | undefined;
    if (window.location.pathname.startsWith('/join/')) {
      joinTimer = setTimeout(() => {
        setActiveTab('subscription');
      }, 100);
    }

    return () => {
      if (joinTimer) clearTimeout(joinTimer);
      delete (window as any).refreshSlayerSession;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        setSession({ authenticated: false });
        localStorage.removeItem('slayer_tier');
        localStorage.removeItem('slayer_auth');
        useContractStore.getState().setPurchasedTier(0);
        useContractStore.getState().setIsAuthenticated(false);
        // Redirect to homepage
        window.location.reload();
      }
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  // Keep NY hours tick alive globally every second
  useEffect(() => {
    const interval = setInterval(tickMarketState, 1000);
    return () => clearInterval(interval);
  }, [tickMarketState]);

  // Establish live SSE stream directly mapping payload updates into the Zustand cache (Bug #1, Bug #2)
  // Depend on a stable boolean, not the whole `session` object: setSession produces
  // a new object reference on every auth/tier refresh, which would needlessly tear
  // down and re-open the EventSource each time.
  const sessionActive = !!session;
  useEffect(() => {
    if (!sessionActive) return;
    const assetParam = selectedAsset.ticker;
    const tfParam = selectedTimeframe;
    const isCall = selectedOptionType === 'C';
    const strikeParam = selectedStrike !== null ? `&strike=${selectedStrike}` : '';
    const posParam = `&positionOpen=${isPositionOpen}`;

    const url = `/api/stream?asset=${assetParam}&timeframe=${tfParam}&isCall=${isCall}${strikeParam}${posParam}`;
    
    const eventSource = new EventSource(url);
    setFeedStatus('connecting');
    eventSource.onopen = () => setFeedStatus('live');
    let latestPayload: any = null;
    let flushInterval: any = null;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'TERMINATE') {
          setSessionBlockedMessage(data.reason || 'CONCURRENT_SESSION_IP_MISMATCH');
          eventSource.close();
          return;
        }
        if (data.type === 'TIER_UPGRADE') {
          window.location.reload();
          return;
        }
        latestPayload = data;
      } catch (err) {
        console.error('[SkyVision Client] Parsing SSE Data Stream', err);
      }
    };

    
    // Throttle SSE flushes to ~7/sec. Candle/greek data doesn't need 60fps, and
    // flushing on every animation frame forced a full app-tree reconcile (jank).
    let cancelled = false;
    let lastFlush = 0;
    const flushData = (ts: number) => {
      if (cancelled) return;
      if (latestPayload && ts - lastFlush >= 150) {
        updateFromSSE(latestPayload);
        latestPayload = null;
        lastFlush = ts;
      }
      flushInterval = requestAnimationFrame(flushData);
    };
    flushInterval = requestAnimationFrame(flushData);


    eventSource.onerror = (err) => {
      console.error('[SkyVision Client] Stream Connection Error', err);
      setFeedStatus('offline');
    };

    return () => {
      cancelled = true;
      eventSource.close();
      if (flushInterval) cancelAnimationFrame(flushInterval);
    };
  }, [selectedAsset, selectedTimeframe, selectedOptionType, selectedStrike, isPositionOpen, updateFromSSE, sessionActive]);

  // Option Action handlers connecting to backend storage
  const handleAddNewPerformanceLog = async (
    direction: 'BULLISH' | 'BEARISH',
    entry: number,
    target: number,
    stop: number
  ) => {
    if (!serverState) return;

    const body = {
      underlying: selectedAsset.ticker,
      contract: serverState.contract,
      direction: direction,
      entryPrice: entry,
      underlyingPrice: serverState.pinpoint_map?.spot_price ?? 0,
      iv: serverState.expected_move?.ivPercentile ?? 0,
      target1: serverState.targets?.[0]?.optionValue || (entry * 1.3),
      target2: serverState.targets?.[1]?.optionValue || (entry * 1.7),
      target3: serverState.targets?.[2]?.optionValue || (entry * 2.2),
      stretchTarget: serverState.targets?.[3]?.optionValue || (entry * 3.0),
      stopLoss: stop
    };

    try {
      const res = await fetch('/api/trades/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setIsPositionOpen(true);
      }
    } catch (e) {
      console.error('[SkyVision Client] POST trade action failure', e);
    }
  };

  const clearV8Trades = async () => {
    try {
      const res = await fetch('/api/trades/clear', { method: 'POST' });
      if (res.ok) {
        setIsPositionOpen(false);
      }
    } catch (e) {
      console.error('[SkyVision Client] POST clear state failure', e);
    }
  };

  const handleSelectOpportunity = (asset: AssetInfo, type: 'C' | 'P', strike?: number) => {
    const step = asset.defaultPrice > 1000 ? 100 : asset.defaultPrice > 150 ? 5 : 1;
    const targetStrike = strike || Math.round(asset.defaultPrice / step) * step;
    
    useContractStore.getState().selectContractAtomically(asset, targetStrike, type === 'C');
    setActiveTab('skyvision', true);
  };

  // Derived homepage/discovery props. These hooks MUST run before any early return
  // below: serverState is null on first paint and then populates from SSE, so computing
  // them only on some renders would change the hook order and crash React ("Rendered
  // more hooks than during the previous render") — which blanked the app to a black
  // screen. They tolerate an undefined discovery slice via the fallbacks.
  const discovery = serverState?.discovery;
  const bestOpportunity = useMemo(() => {
    const topMispriced = discovery?.mispricedCalls?.[0];
    return {
      asset: topMispriced?.asset || ASSET_LIST[0],
      ticker: `${topMispriced?.asset?.ticker || 'SPX'} ${topMispriced?.strike || 7640}C`,
      confidence: topMispriced?.health || 91,
      isCall: true,
      currentPrice: `$${(topMispriced?.marketPrice || 4.2).toFixed(2)}`,
      fairValue: `$${(topMispriced?.modelValue || 6.8).toFixed(2)}`,
      entryZone: `$${((topMispriced?.marketPrice || 4.2) * 0.92).toFixed(2)} - $${((topMispriced?.marketPrice || 4.2) * 0.98).toFixed(2)}`
    };
  }, [discovery]);

  const topSub10Calls = useMemo(() => (discovery?.mispricedCalls || []).map((c: any) => ({
    asset: c.asset,
    ticker: `${c.asset.ticker} ${c.strike}C`,
    confidence: c.health
  })), [discovery]);

  const topSub10Puts = useMemo(() => (discovery?.mispricedPuts || []).map((p: any) => ({
    asset: p.asset,
    ticker: `${p.asset.ticker} ${p.strike}P`,
    confidence: p.health
  })), [discovery]);

  if (sessionBlockedMessage) {
    return (
      <div className="min-h-screen bg-black text-red-500 flex flex-col justify-center items-center font-mono p-6 text-center select-none antialiased">
        <div className="w-16 h-16 border-2 border-red-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
          <span className="text-3xl font-black">!</span>
        </div>
        <h1 className="text-xl font-black tracking-widest text-[#E5E5E5] uppercase mb-2">SLAYER TERMINAL SECURITY KICKOUT</h1>
        <p className="text-xs text-red-500 max-w-md uppercase tracking-wider leading-relaxed mb-4">
          CONCURRENT ACCESS PROTECTOR DISPATCHED: Connection established from a different IP address of this verified user credential. Active real-time workstation constraints limited to 1 concurrent IP.
        </p>
        <div className="text-[10px] text-zinc-500 uppercase">
          If this was you, please wait 30 seconds and refresh to initiate a new primary handshake.
        </div>
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-500 text-[#E5E5E5] font-bold text-xs uppercase tracking-widest rounded transition-colors cursor-pointer"
        >
          Re-establish Session Hook
        </button>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="min-h-screen bg-black text-zinc-400 flex flex-col justify-center items-center font-mono select-none antialiased">
        <div className="w-8 h-8 border-t-2 border-white rounded-full animate-spin mb-4"></div>
        <div className="tracking-widest uppercase text-xs text-[#E5E5E5]">SECURE WORKSTATION COCKPIT CONNECTING...</div>
        <div className="text-[10px] text-zinc-650 mt-2 uppercase font-mono font-bold animate-pulse">Verifying verified Clerk credentials and security cookies</div>
      </div>
    );
  }

  // Gating check has been deferred so that unauthenticated users can view the full homepage landing workspace.
  // Clicking secondary workspace pages, settings, or purchase channels triggers authorization inline.

  // Safe fallback loading state and skeletal setup
  if (!serverState) {
    return (
      <div className="min-h-screen bg-black text-zinc-400 flex flex-col justify-center items-center font-mono select-none antialiased">
        <div className="w-8 h-8 border-t-2 border-white rounded-full animate-spin mb-4"></div>
        <div className="tracking-widest uppercase text-xs text-[#E5E5E5]">SLAYER CLIENT HYDRATION ENGINE ONLINE...</div>
        <div className="text-[10px] text-zinc-650 mt-2 uppercase font-mono">Resolving dynamic system variables</div>
      </div>
    );
  }

  const isCall = selectedOptionType === 'C';

  let bgClass = "h-full min-h-full text-[#f4f4f5] flex flex-col font-mono select-none overflow-x-hidden antialiased relative transition-colors duration-700 ease-in-out";
  const activeSlayerTheme = session?.selected_theme || 'SLAYER PURE DARK';

  if (activeSlayerTheme === 'CARBON MONITOR MATTE') {
    bgClass += " bg-black text-zinc-100";
  } else if (activeSlayerTheme === 'VOLATILITY RADAR') {
    bgClass += " bg-black text-purple-100";
  } else if (activeSlayerTheme === 'DEALER FLOW SLATE') {
    bgClass += " bg-black text-blue-50";
  } else if (activeSlayerTheme === 'FOREST ALGORITHM') {
    bgClass += " bg-[#4ADE80] text-[#4ADE80]";
  } else if (activeSlayerTheme === 'CRIMSON TAPE') {
    bgClass += " bg-black text-rose-50";
  } else if (activeSlayerTheme === 'MIDNIGHT OCEAN') {
    bgClass += " bg-black text-[#4ADE80]";
  } else {
    bgClass += " bg-black text-[#f4f4f5]";
  }

  // Determine if alert notifications are allowed to display.
  // Alert notifications are only allowed if purchasedTier > 1 (paid tiers).
  // Additionally, alerts are never allowed on the landing page ('home'), for any tier.
  const showAlerts = purchasedTier > 1 && activeTab !== 'home';

  return (
    <AppShell 
      session={session} 
      onLogout={handleLogout}
      tierInfo={tierInfo}
      feedStatus={feedStatus}
      onUpgradeClick={handleUpgradeClick}
      setShowAuthModal={setShowAuthModal}
    >
      <div className={`w-full h-full flex flex-col relative overscroll-none ${bgClass}`}>
        {session?.is_impersonating && (
          <div 
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload());
            }}
            className="w-full bg-red-600 text-white font-bold text-center py-2 text-xs cursor-pointer hover:bg-red-700 transition-colors z-[9999]"
          >
            IMPERSONATING USER - CLICK HERE TO TERMINATE SESSION
          </div>
        )}
        {showAlerts && <SkyseyeAlertHub />}

        <div className="flex-1 flex flex-col w-full mx-auto relative z-10 h-full overflow-hidden">
          {/* Main workspace frame */}
          <main 
            className={`flex-1 flex flex-col w-full max-w-full justify-start overflow-y-auto overflow-x-hidden scroll-smooth touch-pan-y ${['workspace', 'home'].includes(activeTab) ? 'p-0 gap-0' : 'p-2 sm:p-4 md:p-6 gap-4 md:gap-6'}`}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <ErrorBoundary
              label={
                activeTab === 'home' ? 'Home' :
                activeTab === 'subscription' ? 'Subscriptions' :
                activeTab === 'skyvision' ? 'SkyVision Cockpit' :
                activeTab === 'pinpoint' ? 'Pinpoint AI Tracker' :
                activeTab === 'quant' ? 'Institutional Quant Lab' :
                activeTab === 'auditor' ? 'Trust Registry' :
                activeTab === 'community' ? 'Arbor Capital' :
                activeTab === 'settings' ? 'System Personalization' :
                activeTab === 'workspace' ? 'Workstation Editor' :
                activeTab === 'admin' ? 'Admin Overseer' :
                'Workspace'
              }
              key={activeTab}
            >
            <Suspense fallback={<div className="w-full min-h-[300px] flex items-center justify-center text-zinc-600 font-mono text-[11px] uppercase tracking-[0.25em] animate-pulse">Loading module…</div>}>
            {/* TAB 1: HOME */}
            {activeTab === 'home' && (
              <div className="animate-fadeIn">
                <SlayerIntro 
                  onEnterApp={(targetTab) => {
                    const mappedTab = targetTab === 'quant' ? 'auditor' : (targetTab || 'skyvision');
                    handleSelectTab(mappedTab as any);
                  }} 
                  onUpgradeComplete={(newTier) => {
                    setWelcomeCelebrationTier(newTier);
                    setShowWelcomeCelebration(true);
                  }}
                  selectedAsset={selectedAsset}
                  setSelectedAsset={setSelectedAsset}
                  selectedTimeframe={selectedTimeframe}
                  setSelectedTimeframe={setSelectedTimeframe}
                  systemScore={serverState.system_score}
                  v8Trades={serverState.trade_archive}
                  bestOpportunity={bestOpportunity}
                  topSub10Calls={topSub10Calls}
                  topSub10Puts={topSub10Puts}
                  onSelectOpportunity={(asset, type, strike) => {
                    handleSelectOpportunity(asset, type, strike);
                  }}
                  renderTerminalWorkspace={() => null}
                  session={session}
                  onRequestAuth={() => setShowAuthModal(true)}
                />
              </div>
            )}

            {activeTab === 'subscription' && (
              <div className="view-enter w-full mx-auto min-h-screen">
                 <SubscriptionPricing 
                   onUpgradeComplete={(newTier) => {
                     setWelcomeCelebrationTier(newTier);
                     setShowWelcomeCelebration(true);
                   }}
                   onEnterApp={() => setActiveTab('home')}
                   session={session}
                   onRequestAuth={() => setShowAuthModal(true)}
                 />
              </div>
            )}

            {/* TAB 2: SKYVISION (DECISION ENGINE) */}
            {activeTab === 'skyvision' && (
              <div className="view-enter">
                <TierGuard requiredTier={2} tabKey="skyvision" planKey="skyvision" planName="SkyVision Cockpit" planPrice="$350">
                  <SkyVisionView />
                </TierGuard>
              </div>
            )}

            {/* TAB 3: PINPOINT AI (MARKET INTELLIGENCE) */}
            {activeTab === 'pinpoint' && (
              <div className="view-enter border border-black bg-black/80 rounded-md p-1 drop-shadow-2xl">
                <TierGuard requiredTier={3} tabKey="pinpoint" planKey="pinpoint" planName="Pinpoint AI Tracker" planPrice="$500">
                  <DealerFlowView />
                </TierGuard>
              </div>
            )}

            {/* TAB: INSTITUTIONAL QUANT LAB */}
            {activeTab === 'quant' && (
              <div className="view-enter border border-black bg-black/80 rounded-md p-1 drop-shadow-2xl">
                <TierGuard requiredTier={3} tabKey="quant" planKey="quant" planName="Institutional Quant Lab" planPrice="$800">
                  <QuantSuiteView />
                </TierGuard>
              </div>
            )}

            {/* TAB 5: AUDIT (TRUST ENGINE) */}
            {activeTab === 'auditor' && (
              <div className="view-enter">
                <TierGuard requiredTier={4} tabKey="trust archive & registry" planKey="quant" planName="Institutional Quant Engine" planPrice="$1500">
                  <QuantAuditView
                    selectedAsset={selectedAsset}
                    isCall={selectedOptionType === 'C'}
                    systemScore={serverState.system_score}
                    optionPremium={serverState.optionPremiumFloat}
                    trades={serverState.trade_archive}
                    onClearTrades={clearV8Trades}
                  />
                </TierGuard>
              </div>
            )}

            {/* TAB 11: RESEARCH & COMMUNITY */}
            {activeTab === 'community' && (
              <div className="view-enter">
                <TierGuard requiredTier={2} tabKey="research & community" planKey="skyvision" planName="SkyVision Cockpit" planPrice="$350">
                  <ArborCapital />
                </TierGuard>
              </div>
            )}

            {/* TAB 7: SETTINGS PERSONALIZATION */}
            {activeTab === 'settings' && (
              <div className="view-enter">
                <SettingsPanel session={session} onUpdateSession={fetchSession} />
              </div>
            )}

            {/* TAB 8: ADMIN OVERSEER */}
            {activeTab === 'workspace' && (
              <div className="w-full h-full flex-1">
                <WorkspaceView isSuperAdmin={!!session?.is_super_admin} />
              </div>
            )}

            {activeTab === 'admin' && (
              <AdminOverseerPanel
                session={session}
                onSimulateTier={handleSimulateTier}
              />
            )}
            </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* Command palette (⌘K) — keyboard-driven navigation */}
      <CommandPalette />

      {/* Subscription Tier Upgrade Celebration Overlay */}
      <CelebrationOverlay
        purchasedTier={welcomeCelebrationTier}
        isOpen={showWelcomeCelebration}
        onComplete={() => {
          setShowWelcomeCelebration(false);
          useContractStore.getState().setActiveTab('home');
        }}
      />

      {/* VIEWPORT SIMULATION ACTIVE BANNER */}
      {isSimulating && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-rose-600 text-[#E5E5E5] px-4 py-1.5 flex justify-between items-center font-mono text-[10px] uppercase tracking-widest font-black shadow-[0_0_20px_rgba(225,29,72,0.4)]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 bg-white rounded-full animate-ping" />
            <span>SPOOFING ACTIVE: VIEWING PLATFORM AS [{session?.access_tier}]</span>
          </div>
          <button 
            onClick={handleExitSimulation}
            className="bg-black hover:bg-black text-[#E5E5E5] px-4 py-1 transition-colors border border-rose-800"
          >
            TERMINATE SIMULATION & RESTORE MASTER CLEARANCE
          </button>
        </div>
      )}

      {/* Clerk Secure Gateway Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn">
          <ClerkGate 
            referralCodeFromUrl={window.location.pathname.startsWith('/join/') ? window.location.pathname.replace('/join/', '') : undefined}
            onSuccess={(user) => {
              setSession(user);
              setShowAuthModal(false);
              fetchSession();
            }}
            onClose={() => setShowAuthModal(false)}
          />
        </div>
      )}

      {/* Terminal Footer Status Bar */}
      {activeTab !== 'workspace' && (
        <footer className="mt-auto border-t border-white/5 bg-black px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between text-[9px] text-zinc-500 font-mono tracking-widest uppercase gap-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">NY</span>
          <FooterClock />
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full animate-pulse"></div>
          <span className="text-zinc-400 font-bold">{serverState?.data_source === 'SANDBOX_SYNTHETIC' ? 'Sandbox Feed' : 'Live Feed'}</span>
        </div>
      </footer>
      )}

      {/* ============================================================
       PRISM GLOBAL COMMAND MENU PALETTE MODAL (CMD+K Gateway)
       ============================================================ */}
      <AnimatePresence>
        {isGlobalSearchOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsGlobalSearchOpen(false);
              }
            }}
            className="fixed inset-0 bg-black/90 z-[999] flex items-center justify-center p-4 backdrop-blur-md font-mono cursor-default" 
            id="prism-menu"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 12, opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1.2, 0.36, 1] }} // --ease-spring
              className="w-full max-w-lg bg-black border border-black rounded-lg shadow-2xl overflow-hidden text-left"
            >
              <div className="p-4 border-b border-black/60 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Search className="w-4 h-4 text-zinc-500 animate-pulse" />
                  <input 
                    type="text"
                    ref={globalSearchInputRef}
                    value={globalSearchInput}
                    onChange={(e) => {
                      setGlobalSearchInput(e.target.value);
                      setGlobalSearchIndex(0);
                    }}
                    onKeyDown={handleGlobalSearchKeyDown}
                    placeholder="Type search keyword or select computing token..."
                    className="w-full bg-black border border-black px-3.5 py-1.5 text-[#E5E5E5] text-xs placeholder-zinc-650 font-mono rounded-md focus:ring-1 focus:ring-zinc-300/80 focus:border-black focus:outline-none text-[11px]"
                  />
                  <button 
                    type="button"
                    onClick={() => setIsGlobalSearchOpen(false)}
                    className="text-zinc-500 hover:text-[#E5E5E5] text-[9px] uppercase font-black transition-colors focus:outline-none"
                  >
                    ESC
                  </button>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar -mb-1 pb-1">
                  {['All', 'Assets', 'Tools', 'Navigation'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setPrismFilter(filter as any);
                        setGlobalSearchIndex(0);
                      }}
                      className={`px-3 py-1 rounded-sm text-[9px] uppercase font-bold transition-colors cursor-pointer ${
                        prismFilter === filter ? 'bg-black text-[#E5E5E5]' : 'text-zinc-500 hover:text-[#4ADE80]'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 max-h-[320px] overflow-y-auto hide-scrollbar">
                <div className="text-[7.5px] text-zinc-500 font-extrabold uppercase px-3 py-1 tracking-wider mb-1">
                  {prismFilter === 'All' ? 'GLOBAL REGISTRY' : prismFilter.toUpperCase()}
                </div>

                <div className="space-y-[1.5px]">
                  {filterTickersList.map((tickerItemRaw, idx) => {
                    const tickerItem = tickerItemRaw as any;
                    const isActive = idx === globalSearchIndex;
                    const isTkActive = selectedAsset.ticker === tickerItem.ticker;
                    
                    return (
                      <button
                        key={tickerItem.isContract || tickerItem.isNav || tickerItem.isTool ? tickerItem.id : tickerItem.ticker}
                        type="button"
                        onClick={() => {
                          if (tickerItem.isContract) {
                            useContractStore.setState({
                              activeTab: 'auditor',
                              auditSearchQuery: tickerItem.contract,
                              expandedAuditId: tickerItem.id
                            });
                          } else if (tickerItem.isNav) {
                            useContractStore.setState({
                              activeTab: tickerItem.targetTab,
                              auditSearchQuery: '',
                              expandedAuditId: null
                            });
                          } else if (tickerItem.isTool) {
                            if (tickerItem.id === 'svi-solver') {
                              useContractStore.setState({
                                activeTab: 'pinpoint',
                                auditSearchQuery: '',
                                expandedAuditId: null
                              });
                            } else if (tickerItem.id === 'gamma-surface') {
                              useContractStore.setState({
                                activeTab: 'skyvision',
                                auditSearchQuery: '',
                                expandedAuditId: null
                              });
                            } else if (tickerItem.id === 'vpin-tracker') {
                              useContractStore.setState({
                                activeTab: 'pinpoint',
                                auditSearchQuery: '',
                                expandedAuditId: null
                              });
                            }
                          } else {
                            const targetAsset = ASSET_LIST.find(a => a.ticker === tickerItem.ticker);
                            if (targetAsset) {
                              setSelectedAsset(targetAsset);
                              useContractStore.setState({
                                auditSearchQuery: '',
                                expandedAuditId: null
                              });
                            }
                          }
                          setIsGlobalSearchOpen(false);
                        }}
                        className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-md transition-all border outline-none focus:outline-none cursor-pointer ${
                          isActive 
                            ? 'bg-black border-black' 
                            : 'bg-transparent border-transparent'
                        }`}
                        onMouseEnter={() => setGlobalSearchIndex(idx)}
                      >
                        <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
                          <span className={`text-[12px] font-black tracking-wider shrink-0 ${isActive ? 'text-[#38bdf8]' : isTkActive ? 'text-[#4ADE80]' : 'text-[#4ADE80]'}`}>
                            {tickerItem.isContract ? tickerItem.contract : tickerItem.ticker}
                          </span>
                          <span className="text-[10px] text-zinc-500 uppercase font-medium truncate">
                            {tickerItem.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[10px] font-bold text-zinc-400 font-mono">
                            {tickerItem.isContract || tickerItem.isTool || tickerItem.isNav ? tickerItem.pnl : `$${tickerItem.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </span>
                          <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-[#E5E5E5]' : 'text-zinc-700'}`} />
                        </div>
                      </button>
                    );
                  })}
                  {filterTickersList.length === 0 && (
                    <div className="text-zinc-650 font-mono text-[9px] text-center uppercase py-8 tracking-widest">
                      No matching records found
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-black/40 px-4 py-2 border-t border-black flex justify-between items-center text-[7.5px] text-zinc-650 uppercase tracking-wider font-semibold font-mono">
                <span>USE KEYBOARD ARROWS  AND ENTER</span>
                <span>{keybinds.prismMenu?.replace('cmd', typeof window !== 'undefined' && navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl').toUpperCase()} TO TOGGLE</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
