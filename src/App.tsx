import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
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
import { LegalCenter, useLegal } from './components/LegalCenter';
// Eagerly imported because SlayerIntro (also eager, on the landing path) imports it
// statically — a lazy() wrapper here can't code-split it and only warns at build.
import { SubscriptionPricing } from './components/SubscriptionPricing';

// Heavy secondary views are code-split (lazy) to keep the initial bundle small;
// they load on demand inside the <Suspense> boundary in the main workspace.
const SkyVisionView = lazy(() => import('./components/SkyVisionView').then(m => ({ default: m.SkyVisionView })));
const QuantAuditView = lazy(() => import('./components/QuantAuditView').then(m => ({ default: m.QuantAuditView })));
const DealerFlowView = lazy(() => import('./components/DealerFlowView').then(m => ({ default: m.DealerFlowView })));
const MultiChartGrid = lazy(() => import('./components/MultiChartGrid').then(m => ({ default: m.MultiChartGrid })));
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
    <span className="text-[var(--warning)] font-black tabular-nums">{time}</span>
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
    selected_theme?: string; // theme id from the generated library (see src/lib/themes.generated.ts)
    no_refund_policy_logged?: boolean;
  } | null>(null);

  const [sessionBlockedMessage, setSessionBlockedMessage] = useState<string | null>(null);
  const [showWelcomeCelebration, setShowWelcomeCelebration] = useState(false);
  const [welcomeCelebrationTier, setWelcomeCelebrationTier] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // INJECT: VIEWPORT SIMULATION STATE
  const [originalAdminSession, setOriginalAdminSession] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [feedStatus, setFeedStatus] = useState<'connecting' | 'live' | 'offline' | 'stale'>('connecting');
  // Feed heartbeat: SSE 'open' only means the socket connected — NOT that ticks are still arriving.
  // We stamp every data frame and, if the stream goes quiet, flip to a distinct 'stale' state so the
  // UI can never keep flashing "Live" over frozen prices (a data-integrity failure, not just a UX one).
  const lastMsgRef = useRef<number>(0);
  const [staleSec, setStaleSec] = useState(0);

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
          label: "Guest",
          desc: "Sign in to unlock",
          style: "border bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-tertiary)]",
          dotColor: "bg-[var(--text-tertiary)]",
          iconColor: "text-[var(--text-tertiary)]"
        };
      case 1:
        return {
          label: "Discord",
          desc: "Community & live alerts",
          style: "border bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]",
          dotColor: "bg-[var(--text-secondary)]",
          iconColor: "text-[var(--text-secondary)]"
        };
      case 2:
        return {
          label: "Pinpoint GEX",
          desc: "Live dealer GEX",
          style: "border bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]",
          dotColor: "bg-[var(--text-secondary)]",
          iconColor: "text-[var(--text-secondary)]"
        };
      case 3:
        return {
          label: "SkyVision",
          desc: "Full terminal access",
          style: "border bg-[var(--surface-3)] border-[var(--border-strong)] text-[var(--text-primary)]",
          dotColor: "bg-[var(--text-primary)]",
          iconColor: "text-[var(--text-primary)]"
        };
      case 4:
        return {
          label: "SkyVision",
          desc: "Full terminal access",
          style: "border bg-[var(--surface-3)] border-[var(--border-strong)] text-[var(--text-primary)]",
          dotColor: "bg-[var(--text-primary)]",
          iconColor: "text-[var(--text-primary)]"
        };
      case 5:
      default:
        return {
          label: "Lifetime",
          desc: "Lifetime access",
          style: "border bg-[var(--surface-3)] border-[var(--border-strong)] text-[var(--text-primary)]",
          dotColor: "bg-[var(--text-primary)]",
          iconColor: "text-[var(--text-primary)]"
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

    const convertedLive = trades.map(t => ({
      ticker: t.underlying,
      name: `${t.underlying} ${t.contract} ${t.direction === 'BULLISH' ? 'CALL' : 'PUT'} Execution`,
      contract: t.contract,
      pnl: t.maxGain > 0 ? `+${t.maxGain.toFixed(1)}%` : 'Active Tracker',
      status: t.target3Hit ? 'Target 3 Clipped' : t.target2Hit ? 'Target 2 Clipped' : 'Staged/Live',
      id: t.id,
      isContract: true
    }));

    // Search surfaces only real, logged trades — never fabricated track-record entries.
    const mergedContracts = convertedLive;

    const toolsItems = [
      { ticker: 'SVI', name: 'SVI Volatility Solver', pnl: 'Volatility Tool', id: 'svi-solver', isTool: true },
      { ticker: 'G3D', name: '3D Gamma Map', pnl: 'Visualizer', id: 'gamma-surface', isTool: true }
    ];

    const navItems = [
      { id: 'nav-home', name: 'Home Workspace', ticker: 'HOME', pnl: 'Workspace', isNav: true, targetTab: 'home' },
      { id: 'nav-skyvision', name: 'SkyVision Cockpit', ticker: 'SKYV', pnl: 'Workspace', isNav: true, targetTab: 'skyvision' },
      { id: 'nav-multichart', name: 'Multi-Chart Grid', ticker: 'GRID', pnl: 'Workspace', isNav: true, targetTab: 'multichart' },
      { id: 'nav-pinpoint', name: 'Pinpoint GEX', ticker: 'PINP', pnl: 'Workspace', isNav: true, targetTab: 'pinpoint' },
      { id: 'nav-auditor', name: 'Trade History', ticker: 'AUDIT', pnl: 'Workspace', isNav: true, targetTab: 'auditor' },
      { id: 'nav-dealerflow', name: 'Dealer Flow', ticker: 'FLOW', pnl: 'Workspace', isNav: true, targetTab: 'dealerflow' },
      { id: 'nav-community', name: 'Research & Community', ticker: 'SLAYER', pnl: 'Workspace', isNav: true, targetTab: 'community' },
      { id: 'nav-settings', name: 'Settings & Preferences', ticker: 'SETT', pnl: 'System', isNav: true, targetTab: 'settings' }
    ];

    // Asset quick-nav. No prices/changes here — search must not show fabricated quotes;
    // the right column shows the asset class instead.
    const defaultTickers = [
      { ticker: 'SPX', name: 'S&P 500 Index', kind: 'Index', isContract: false },
      { ticker: 'NDX', name: 'Nasdaq 100 Index', kind: 'Index', isContract: false },
      { ticker: 'QQQ', name: 'Invesco QQQ Trust', kind: 'ETF', isContract: false },
      { ticker: 'SPY', name: 'SPDR S&P 500 ETF', kind: 'ETF', isContract: false },
      { ticker: 'RUT', name: 'Russell 2000 Index', kind: 'Index', isContract: false },
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
    
    const STALE_MS = 8000; // ~8 missed 1Hz frames → treat the feed as quiet, not live
    const eventSource = new EventSource(url);
    setFeedStatus('connecting');
    lastMsgRef.current = Date.now(); // don't trip 'stale' before the first frame lands
    eventSource.onopen = () => { setFeedStatus('live'); lastMsgRef.current = Date.now(); };
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
        // True heartbeat: a real data frame arrived → stamp it and clear any stale/offline state.
        lastMsgRef.current = Date.now();
        setFeedStatus(s => (s === 'live' ? s : 'live'));
      } catch (err) {
        console.error('[SkyVision Client] Parsing SSE Data Stream', err);
      }
    };

    // Watchdog: if no frame has landed within STALE_MS, surface a distinct 'stale' state (and a
    // live-counting age) without overriding a hard 'offline'. Cheap — only writes state while stale.
    const heartbeat = setInterval(() => {
      const age = Date.now() - lastMsgRef.current;
      if (age >= STALE_MS) { setFeedStatus(s => (s === 'offline' ? s : 'stale')); setStaleSec(Math.floor(age / 1000)); }
    }, 1000);

    
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
      clearInterval(heartbeat);
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
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--danger)] flex flex-col justify-center items-center font-mono p-6 text-center select-none antialiased">
        <div className="w-16 h-16 border-2 border-red-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
          <span className="text-3xl font-black">!</span>
        </div>
        <h1 className="text-xl font-black tracking-widest text-[var(--text-primary)] uppercase mb-2">Session ended</h1>
        <p className="text-xs text-[var(--danger)] max-w-md tracking-wider leading-relaxed mb-4">
          This account is active on another device. Only one live session is allowed at a time.
        </p>
        <div className="text-[10px] text-[var(--text-tertiary)] uppercase">
          If this was you, wait about 30 seconds and refresh to start a new session.
        </div>
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-500 text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
        >
          Reconnect
        </button>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-tertiary)] flex flex-col justify-center items-center font-mono select-none antialiased">
        <div className="w-8 h-8 border-t-2 border-[var(--text-primary)] rounded-full animate-spin mb-4"></div>
        <div className="tracking-widest uppercase text-xs text-[var(--text-primary)]">Connecting to your workspace…</div>
        <div className="text-[10px] text-[var(--text-tertiary)] mt-2 uppercase font-mono font-bold">Verifying your secure session</div>
      </div>
    );
  }

  // Gating check has been deferred so that unauthenticated users can view the full homepage landing workspace.
  // Clicking secondary workspace pages, settings, or purchase channels triggers authorization inline.

  // Safe fallback loading state and skeletal setup
  if (!serverState) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-tertiary)] flex flex-col justify-center items-center font-mono select-none antialiased">
        <div className="w-8 h-8 border-t-2 border-[var(--text-primary)] rounded-full animate-spin mb-4"></div>
        <div className="tracking-widest uppercase text-xs text-[var(--text-primary)]">Loading live market data…</div>
        <div className="text-[10px] text-[var(--text-tertiary)] mt-2 uppercase font-mono">Syncing the analytics engine</div>
      </div>
    );
  }

  const isCall = selectedOptionType === 'C';

  // The page frame follows the active theme's design tokens (set by <html data-theme>;
  // the :root defaults are the Slayer Dark look). The 73-theme library is generated —
  // see scripts/genThemes.mjs → themes.css / themes.generated.ts.
  const bgClass = "h-full min-h-full bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col font-mono select-none overflow-x-hidden antialiased relative transition-colors duration-700 ease-in-out";

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
            className="w-full bg-red-600 text-white font-bold text-center py-2 px-3 text-[10px] sm:text-xs leading-snug cursor-pointer hover:bg-red-700 transition-colors z-[9999]"
          >
            IMPERSONATING USER - CLICK HERE TO TERMINATE SESSION
          </div>
        )}
        {showAlerts && <SkyseyeAlertHub />}

        <div className="flex-1 flex flex-col w-full mx-auto relative z-10 h-full overflow-hidden">
          {/* Feed-honesty banner: surface SSE disconnects AND a quiet-but-open stream inside the
              views, not just the sidebar dot. 'offline' (hard drop) reads red; 'stale' (open but no
              fresh ticks) reads amber with a live age — never let frozen prices pass as live. */}
          {(feedStatus === 'offline' || feedStatus === 'stale') && !['home', 'subscription'].includes(activeTab) && (
            <div role="status" aria-live="polite" className={`shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest border-b ${feedStatus === 'offline' ? 'bg-[var(--danger)]/10 border-[var(--danger)]/30 text-[var(--danger)]' : 'bg-[var(--warning)]/10 border-[var(--warning)]/30 text-[var(--warning)]'}`}>
              <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${feedStatus === 'offline' ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`} aria-hidden="true" />
              {feedStatus === 'offline'
                ? 'Live feed disconnected — reconnecting. Figures may be stale.'
                : `Feed quiet ${staleSec}s — prices may be delayed, not live.`}
            </div>
          )}
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
                activeTab === 'multichart' ? 'Multi-Chart Grid' :
                activeTab === 'pinpoint' ? 'Pinpoint GEX' :
                activeTab === 'quant' ? 'Quant Lab' :
                activeTab === 'auditor' ? 'Trust Registry' :
                activeTab === 'community' ? 'Arbor Capital' :
                activeTab === 'settings' ? 'System Personalization' :
                activeTab === 'workspace' ? 'Workstation Editor' :
                activeTab === 'admin' ? 'Admin Overseer' :
                'Workspace'
              }
              key={activeTab}
            >
            <Suspense fallback={<div className="w-full min-h-[300px] flex items-center justify-center text-[var(--text-tertiary)] font-mono text-[11px] uppercase tracking-[0.25em] animate-pulse">Loading module…</div>}>
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
                <TierGuard requiredTier={3} tabKey="skyvision" planKey="skyvision" planName="SkyVision" planPrice="$499">
                  <SkyVisionView />
                </TierGuard>
              </div>
            )}

            {/* MULTI-CHART GRID — several tickers side by side, GEX overlays per panel.
                Open at the view level (GEX levels are gated server-side at Tier 2); wrap in
                a TierGuard here if this should be a paid-only view. */}
            {activeTab === 'multichart' && (
              <div className="view-enter h-full">
                <MultiChartGrid />
              </div>
            )}

            {/* TAB 3: PINPOINT AI (MARKET INTELLIGENCE) */}
            {activeTab === 'pinpoint' && (
              <div className="view-enter border border-[var(--border)] bg-[var(--surface)]/90 rounded-md p-1 drop-shadow-2xl">
                <TierGuard requiredTier={2} tabKey="pinpoint" planKey="pinpoint" planName="Pinpoint GEX" planPrice="$99">
                  <DealerFlowView />
                </TierGuard>
              </div>
            )}

            {/* TAB: INSTITUTIONAL QUANT LAB */}
            {activeTab === 'quant' && (
              <div className="view-enter border border-[var(--border)] bg-[var(--surface)]/90 rounded-md p-1 drop-shadow-2xl">
                <TierGuard requiredTier={3} tabKey="quant" planKey="skyvision" planName="SkyVision" planPrice="$499">
                  <QuantSuiteView />
                </TierGuard>
              </div>
            )}

            {/* TAB 5: AUDIT (TRUST ENGINE) */}
            {activeTab === 'auditor' && (
              <div className="view-enter">
                <TierGuard requiredTier={3} tabKey="trust archive & registry" planKey="skyvision" planName="SkyVision" planPrice="$499">
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
                <TierGuard requiredTier={1} tabKey="research & community" planKey="discord" planName="Discord" planPrice="$39">
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

            {/* Defensive fallback: an unknown tab (e.g. corrupt persisted value) never blanks the workspace. */}
            {!['home', 'subscription', 'skyvision', 'pinpoint', 'quant', 'auditor', 'community', 'settings', 'workspace', 'admin', 'multichart'].includes(activeTab) && (
              <div className="w-full flex-1 flex flex-col items-center justify-center text-center py-24 px-6 select-none">
                <div className="text-[var(--text-tertiary)] font-mono text-[11px] uppercase tracking-widest mb-3">View not found</div>
                <p className="text-[var(--text-secondary)] text-sm max-w-sm mb-6 leading-relaxed">This workspace view isn’t available. Let’s get you back to the home cockpit.</p>
                <button
                  onClick={() => useContractStore.getState().setActiveTab('home')}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-md bg-[var(--text-primary)] text-[var(--surface)] hover:opacity-90 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
                >
                  Return home
                </button>
              </div>
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
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-rose-600 text-[var(--text-primary)] px-3 sm:px-4 py-1.5 flex flex-wrap gap-2 justify-between items-center font-mono text-[10px] tracking-widest font-black shadow-[0_0_20px_rgba(225,29,72,0.4)]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2 h-2 bg-white rounded-full animate-ping shrink-0" />
            <span className="truncate"><span className="font-black">Preview mode</span> · Viewing as {session?.access_tier}</span>
          </div>
          <button
            onClick={handleExitSimulation}
            className="bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] px-4 py-1 transition-colors border border-rose-800 shrink-0"
          >
            Exit preview
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

      {/* Legal center — global overlay (Terms / Privacy / Risk / Refunds / Cookies) */}
      <LegalCenter />

      {/* Terminal Footer Status Bar */}
      {activeTab !== 'workspace' && (
        <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between text-[9px] text-[var(--text-tertiary)] font-mono tracking-widest uppercase gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-tertiary)]">NY</span>
          <FooterClock />
        </div>
        <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap justify-center order-last sm:order-none normal-case tracking-normal">
          <button onClick={() => useLegal.getState().open('terms')} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">Terms</button>
          <span className="text-[var(--border-strong)]" aria-hidden="true">·</span>
          <button onClick={() => useLegal.getState().open('privacy')} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">Privacy</button>
          <span className="text-[var(--border-strong)]" aria-hidden="true">·</span>
          <button onClick={() => useLegal.getState().open('risk')} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">Risk Disclosure</button>
          <span className="text-[var(--border-strong)]" aria-hidden="true">·</span>
          <span className="text-[var(--text-tertiary)]">Not investment advice.</span>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <div className={`w-1.5 h-1.5 rounded-full ${feedStatus === 'offline' ? 'bg-[var(--danger)]' : feedStatus === 'stale' ? 'bg-[var(--warning)]' : 'bg-[var(--success)] animate-pulse'}`}></div>
          <span className="text-[var(--text-tertiary)] font-bold">{feedStatus === 'offline' ? 'Offline' : feedStatus === 'stale' ? `Stale Feed · ${staleSec}s` : serverState?.data_source === 'SANDBOX_SYNTHETIC' ? 'Sandbox Feed' : 'Live Feed'}</span>
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
              role="dialog"
              aria-modal="true"
              aria-label="Global command menu"
              className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border-strong)] rounded-lg shadow-2xl overflow-hidden text-left"
            >
              <div className="p-4 border-b border-[var(--border)] flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Search className="w-4 h-4 text-[var(--text-tertiary)] animate-pulse" />
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
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] px-3.5 py-1.5 text-[var(--text-primary)] text-xs placeholder-[var(--text-tertiary)] font-mono rounded-md focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] focus:outline-none text-[11px]"
                  />
                  <button 
                    type="button"
                    onClick={() => setIsGlobalSearchOpen(false)}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-[9px] uppercase font-black transition-colors focus:outline-none"
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
                        prismFilter === filter ? 'bg-[var(--surface-2)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 max-h-[320px] overflow-y-auto hide-scrollbar">
                <div className="text-[7.5px] text-[var(--text-tertiary)] font-extrabold uppercase px-3 py-1 tracking-wider mb-1">
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
                            ? 'bg-[var(--surface-2)] border-[var(--border-strong)]'
                            : 'bg-transparent border-transparent'
                        }`}
                        onMouseEnter={() => setGlobalSearchIndex(idx)}
                      >
                        <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
                          <span className={`text-[12px] font-black tracking-wider shrink-0 ${isActive ? 'text-[var(--accent-color)]' : isTkActive ? 'text-[var(--success)]' : 'text-[var(--success)]'}`}>
                            {tickerItem.isContract ? tickerItem.contract : tickerItem.ticker}
                          </span>
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-medium truncate">
                            {tickerItem.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[10px] font-bold text-[var(--text-tertiary)] font-mono">
                            {tickerItem.isContract || tickerItem.isTool || tickerItem.isNav ? tickerItem.pnl : tickerItem.kind}
                          </span>
                          <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`} />
                        </div>
                      </button>
                    );
                  })}
                  {filterTickersList.length === 0 && (
                    <div className="text-[var(--text-tertiary)] font-mono text-[9px] text-center uppercase py-8 tracking-widest">
                      No matching records found
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[var(--surface)]/40 px-4 py-2 border-t border-[var(--border)] flex justify-between items-center text-[7.5px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold font-mono">
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
