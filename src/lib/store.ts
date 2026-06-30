import React, { useEffect } from 'react';
import { create } from 'zustand';
import { AssetInfo, Candle, V8TradeRecord, TimeframeVal, ServerStatePayload } from '../types';
import { ASSET_LIST } from '../data';
import { validateSsePayload } from './dataIntegrity';

// Make the store import-safe in non-browser contexts (tests, SSR, tooling) where
// `localStorage` is undefined. The store reads persisted prefs at init, so without
// this it would throw on import outside a browser. In the browser this guard is a
// no-op and the real localStorage is used unchanged.
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage === 'undefined') {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  };
}

export type ContractState = {
  contract: string;
  health: number;
  recommendation: 'ENTER' | 'HOLD' | 'REDUCE' | 'EXIT';
  expectedMove: number;
  targets: any[];
  chartData: Candle[];
};

interface MarketState {
  open: boolean;
  closeIn: string;
  openIn: string;
}

export interface ContractStore {
  // Navigation & View Tabs
  activeTab: 'home' | 'skyvision' | 'pinpoint' | 'quant' | 'auditor' | 'dealerflow' | 'community' | 'settings' | 'admin' | 'subscription' | 'workspace' | 'multichart';
  setActiveTab: (tab: 'home' | 'skyvision' | 'pinpoint' | 'quant' | 'auditor' | 'dealerflow' | 'community' | 'settings' | 'admin' | 'subscription' | 'workspace' | 'multichart', keepContract?: boolean) => void;

  // Theme settings
  themeMode: 'light' | 'dark';
  toggleThemeMode: () => void;

  // Smooth scroll settings
  smoothScroll: boolean;
  toggleSmoothScroll: () => void;

  // Time display settings (used by quant suite / timeUtils.formatTime)
  timeZone: 'EST' | 'UTC' | 'LOCAL';
  setTimeZone: (tz: 'EST' | 'UTC' | 'LOCAL') => void;
  timeFormat: '12H' | '24H';
  setTimeFormat: (fmt: '12H' | '24H') => void;

  // Selected parameters
  selectedAsset: AssetInfo;
  selectedTimeframe: TimeframeVal;
  selectedOptionType: 'C' | 'P';
  selectedStrike: number | null;
  isPositionOpen: boolean;
  isContractLocked: boolean;
  isDeepSkyseyeExpanded: boolean;
  isGlobalSearchOpen: boolean;
  prismFilter: 'All' | 'Assets' | 'Tools' | 'Navigation';
  setPrismFilter: (filter: 'All' | 'Assets' | 'Tools' | 'Navigation') => void;

  // State caches and broad items
  activeContract: ContractState | null;
  contractCache: Record<string, ContractState>;
  serverState: ServerStatePayload | null;
  trades: V8TradeRecord[];

  // Market status timer
  marketState: MarketState;

  // Actions
  setSelectedAsset: (asset: AssetInfo) => void;
  setSelectedTimeframe: (tf: TimeframeVal) => void;
  setSelectedOptionType: (type: 'C' | 'P') => void;
  setSelectedStrike: (strike: number | null) => void;
  selectContractAtomically: (asset: AssetInfo, strike: number, isCall: boolean) => void;
  setIsPositionOpen: (open: boolean) => void;
  setIsDeepSkyseyeExpanded: (expanded: boolean) => void;
  setIsGlobalSearchOpen: (open: boolean) => void;
  setTrades: (trades: V8TradeRecord[]) => void;

  // Cross-communication for Audit search & expand
  auditSearchQuery: string;
  setAuditSearchQuery: (query: string) => void;
  expandedAuditId: string | null;
  setExpandedAuditId: (id: string | null) => void;

  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;

  purchasedTier: number;
  setPurchasedTier: (tier: number) => void;
  
  checkoutPlan: string | null;
  setCheckoutPlan: (plan: string | null) => void;
  
  // Keybind preferences
  globalKeybindsEnabled: boolean;
  setGlobalKeybindsEnabled: (enabled: boolean) => void;
  disabledKeybinds: Record<string, boolean>;
  setDisabledKeybinds: (binds: Partial<Record<keyof ContractStore['keybinds'], boolean>>) => void;
  keybinds: {
    home: string;
    skyvision: string;
    pinpoint: string;
    auditor: string;
    dealerflow: string;
    community: string;
    settings: string;
    prismMenu: string;
  };
  setKeybinds: (binds: Partial<ContractStore['keybinds']>) => void;
  // High-latency prevention: selectContract set instantly!
  selectContract: (ticker: string, strike: number, isCall: boolean) => void;
  updateFromSSE: (payload: ServerStatePayload) => void;
  tickMarketState: () => void;
}

// Global NY/CBOE Market State check function (Bug #8)
// Hoisted to module scope: building an Intl.DateTimeFormat is expensive and
// getMarketState runs every second from the market-state ticker.
const NY_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false
});

export function getMarketState(currentTime = new Date()): MarketState {
  const parts = NY_TIME_FORMATTER.formatToParts(currentTime);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hours = getPart('hour');
  const minutes = getPart('minute');
  const seconds = getPart('second');

  const nyDate = new Date(year, month - 1, day, hours, minutes, seconds);
  const dayOfWeek = nyDate.getDay(); // 0 is Sunday, 6 is Saturday

  // NY market hours: 9:30 AM to 4:00 PM Eastern Time
  const nyTimeInSeconds = hours * 3600 + minutes * 60 + seconds;
  const marketOpenSeconds = 9 * 3600 + 30 * 60; // 09:30:00
  const marketCloseSeconds = 16 * 3600; // 16:00:00

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) {
    // Open in: Monday 9:30 AM
    const daysToMonday = dayOfWeek === 0 ? 1 : 2;
    const secondsToOpen = (daysToMonday * 24 * 3600) + (marketOpenSeconds - nyTimeInSeconds);
    return {
      open: false,
      closeIn: '00:00:00',
      openIn: formatDuration(Math.max(0, secondsToOpen))
    };
  }

  if (nyTimeInSeconds >= marketOpenSeconds && nyTimeInSeconds < marketCloseSeconds) {
    const secondsToClose = marketCloseSeconds - nyTimeInSeconds;
    return {
      open: true,
      closeIn: formatDuration(secondsToClose),
      openIn: '00:00:00'
    };
  } else {
    let secondsToOpen = 0;
    if (nyTimeInSeconds < marketOpenSeconds) {
      secondsToOpen = marketOpenSeconds - nyTimeInSeconds;
    } else {
      // after close, opens tomorrow
      const daysToNextOpen = dayOfWeek === 5 ? 3 : 1;
      secondsToOpen = (daysToNextOpen * 24 * 3600) - (nyTimeInSeconds - marketOpenSeconds);
    }
    return {
      open: false,
      closeIn: '00:00:00',
      openIn: formatDuration(Math.max(0, secondsToOpen))
    };
  }
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].join(':');
}

/**
 * True when the app is running locally / in the Vite dev server. Used to unlock the
 * full terminal on localhost so it's usable before billing is wired — production
 * (a real deployed domain) always enforces the paywall.
 */
export function isLocalDevEnv(): boolean {
  try {
    // import.meta.env.DEV is true under `npm run dev`; the hostname check also
    // covers a locally-served production build.
    const dev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
    if (dev) return true;
  } catch { /* import.meta may be unavailable in some bundles */ }
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
}

/**
 * Single source of truth: map a server access_tier string to its numeric level.
 * Tier ladder (value order): Discord (1) → Pinpoint GEX (2) → SkyVision (3, the
 * flagship — includes the GEX tool AND Quant Lab) → Lifetime (5). Canonical strings
 * are 'discord' | 'pinpoint' | 'skyvision' | 'lifetime' | 'guest'. Legacy strings
 * from before the restructure ('intraday'/'quant'/'enterprise') are normalized to the
 * closest new level so no one is silently locked out (→ 0).
 * NOTE: the server mirrors this mapping in marketEngine.accessTierToLevel — keep in sync.
 */
export function accessTierToNumber(accessTier?: string | null): number {
  switch (accessTier) {
    case 'discord': return 1;
    case 'pinpoint':
    case 'quant': return 2;          // Pinpoint GEX (commodity dealer-GEX tool); legacy 'quant' = old pinpoint plan
    case 'skyvision':
    case 'intraday':
    case 'enterprise': return 3;     // SkyVision flagship (trade picks + GEX + Quant Lab); legacy 'intraday'/'enterprise'
    case 'lifetime': return 5;
    default: return 0;
  }
}

export function useTierValidation() {
  const setPurchasedTier = useContractStore(s => s.setPurchasedTier);
  const setIsAuthenticated = useContractStore(s => s.setIsAuthenticated);

  // Strictly validate condition on mount and hydration
  useEffect(() => {
    // 0. Local/dev: unlock the entire terminal (no paywall screens) so it's fully
    //    usable on localhost before payments are connected. Unconditional — a stale
    //    `slayer_tier` (the old code persisted '0' here) must NOT keep it locked.
    //    Production (a real domain) still runs the paywall validation below.
    if (isLocalDevEnv()) {
      setPurchasedTier(5);
      setIsAuthenticated(true);
      return;
    }

    // 1. Instantly force sync from local drift before network
    if (typeof window !== 'undefined') {
      const rawTier = Number(localStorage.getItem('slayer_tier') || '0');
      const localSync = Number.isFinite(rawTier) ? rawTier : 0; // corrupt/non-numeric -> 0, not NaN
      const authSync = localStorage.getItem('slayer_auth') === 'true';
      setPurchasedTier(localSync);
      setIsAuthenticated(authSync);
    }

    // 2. Perform definitive network validation. Guard against (a) a server error
    //    (res.ok) silently downgrading a paid user to tier 0, and (b) a stale
    //    response from a previous mount clobbering a newer one (cancelled flag).
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`session ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (data.authenticated && data.access_tier) {
          setIsAuthenticated(true);
          localStorage.setItem('slayer_auth', 'true');
          setPurchasedTier(accessTierToNumber(data.access_tier));
        } else {
          setIsAuthenticated(false);
          localStorage.setItem('slayer_auth', 'false');
          setPurchasedTier(0);
        }
      })
      .catch(err => console.error("Tier sync failed", err));
    return () => { cancelled = true; };
  }, [setPurchasedTier, setIsAuthenticated]);
}

export const useContractStore = create<ContractStore>((set, get) => ({
  activeTab: (() => {
    // Validate the restored tab against real render targets so a corrupt/renamed
    // localStorage value can't blank the workspace. Legacy 'dealerflow' → 'pinpoint'.
    const VALID = ['home', 'skyvision', 'pinpoint', 'quant', 'auditor', 'community', 'settings', 'admin', 'subscription', 'workspace'];
    const raw = typeof window !== 'undefined' ? localStorage.getItem('lastActiveTab') : null;
    const norm = raw === 'dealerflow' ? 'pinpoint' : raw;
    return (norm && VALID.includes(norm) ? norm : 'home') as ContractStore['activeTab'];
  })(),
  setActiveTab: (tab, keepContract = false) => {
    // The legacy 'dealerflow' tab was consolidated into 'pinpoint' (which renders
    // DealerFlowView). Normalize so any lingering 'dealerflow' navigation resolves
    // to a real, rendered view instead of a blank screen.
    const normalizedTab = tab === 'dealerflow' ? 'pinpoint' : tab;
    localStorage.setItem('lastActiveTab', normalizedTab);
    if (normalizedTab === 'skyvision' && !keepContract) {
      set({ activeTab: normalizedTab, selectedStrike: null, isContractLocked: false, auditSearchQuery: '', expandedAuditId: null });
    } else {
      if (normalizedTab === 'auditor' && get().activeTab === 'auditor') {
        // Clear active query and expand states when re-clicking the Auditor tab
        set({ auditSearchQuery: '', expandedAuditId: null });
      } else if (normalizedTab !== 'auditor') {
        // Reset query and expand states when navigating away from Auditor to other tabs
        set({ activeTab: normalizedTab, auditSearchQuery: '', expandedAuditId: null });
      } else {
        set({ activeTab: normalizedTab });
      }
    }
  },

  themeMode: 'dark',
  toggleThemeMode: () => set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),

  smoothScroll: typeof window !== 'undefined' ? (localStorage.getItem('slayer_smooth_scroll') !== 'false') : true,
  toggleSmoothScroll: () => set((state) => {
    const newVal = !state.smoothScroll;
    if (typeof window !== 'undefined') {
      localStorage.setItem('slayer_smooth_scroll', String(newVal));
    }
    return { smoothScroll: newVal };
  }),

  timeZone: (typeof window !== 'undefined' ? localStorage.getItem('slayer_timezone') as 'EST' | 'UTC' | 'LOCAL' : 'EST') || 'EST',
  setTimeZone: (tz) => {
    if (typeof window !== 'undefined') localStorage.setItem('slayer_timezone', tz);
    set({ timeZone: tz });
  },
  timeFormat: (typeof window !== 'undefined' ? localStorage.getItem('slayer_timeformat') as '12H' | '24H' : '12H') || '12H',
  setTimeFormat: (fmt) => {
    if (typeof window !== 'undefined') localStorage.setItem('slayer_timeformat', fmt);
    set({ timeFormat: fmt });
  },

  selectedAsset: ASSET_LIST[0],
  selectedTimeframe: '5m',
  selectedOptionType: 'C',
  selectedStrike: null,
  isPositionOpen: false,
  isContractLocked: false,
  isDeepSkyseyeExpanded: false,
  isGlobalSearchOpen: false,
  prismFilter: 'All',
  setPrismFilter: (filter) => set({ prismFilter: filter }),

  auditSearchQuery: '',
  setAuditSearchQuery: (query) => set({ auditSearchQuery: query }),
  expandedAuditId: null,
  setExpandedAuditId: (id) => set({ expandedAuditId: id }),

  isAuthenticated: false,
  setIsAuthenticated: (auth) => set({ isAuthenticated: auth }),

  purchasedTier: typeof window !== 'undefined' ? (isLocalDevEnv() ? 5 : (() => { const n = Number(localStorage.getItem('slayer_tier') || '0'); return Number.isFinite(n) ? n : 0; })()) : 0,
  setPurchasedTier: (tier) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('slayer_tier', String(tier));
    }
    set({ purchasedTier: tier });
  },

  checkoutPlan: null,
  setCheckoutPlan: (plan) => set({ checkoutPlan: plan }),

  globalKeybindsEnabled: typeof window !== 'undefined' ? localStorage.getItem('slayer_global_keybinds_enabled') !== 'false' : true,
  setGlobalKeybindsEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('slayer_global_keybinds_enabled', String(enabled));
    }
    set({ globalKeybindsEnabled: enabled });
  },

  disabledKeybinds: (() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('slayer_disabled_keybinds') : null;
      if (raw) return JSON.parse(raw);
    } catch { /* ignore corrupt/legacy value */ }
    return {};
  })(),
  setDisabledKeybinds: (binds) => set((state) => {
    const newDisabled = { ...state.disabledKeybinds, ...binds };
    if (typeof window !== 'undefined') {
      localStorage.setItem('slayer_disabled_keybinds', JSON.stringify(newDisabled));
    }
    return { disabledKeybinds: newDisabled };
  }),

  keybinds: (() => {
    const defaults = {
      home: 'shift+h',
      skyvision: 'shift+s',
      pinpoint: 'shift+p',
      auditor: 'shift+a',
      dealerflow: 'shift+d',
      community: 'shift+r',
      settings: 'shift+o',
      prismMenu: 'cmd+k',
    };
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('slayer_keybinds') : null;
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch { /* ignore corrupt/legacy value */ }
    return defaults;
  })(),
  setKeybinds: (binds) => set((state) => {
    const newBinds = { ...state.keybinds, ...binds };
    if (typeof window !== 'undefined') {
      localStorage.setItem('slayer_keybinds', JSON.stringify(newBinds));
    }
    return { keybinds: newBinds };
  }),

  activeContract: null,
  contractCache: {},
  serverState: null,
  trades: [],

  marketState: getMarketState(),

  setSelectedAsset: (asset) => {
    const step = asset.defaultPrice > 1000 ? 100 : asset.defaultPrice > 150 ? 5 : 1;
    const initialStrike = Math.round(asset.defaultPrice / step) * step;
    set({ selectedAsset: asset, selectedStrike: initialStrike, isContractLocked: false });
    get().selectContract(asset.ticker, initialStrike, get().selectedOptionType === 'C');
  },
  setSelectedTimeframe: (tf) => set({ selectedTimeframe: tf }),
  setSelectedOptionType: (type) => {
    const step = get().selectedAsset.defaultPrice > 1000 ? 100 : get().selectedAsset.defaultPrice > 150 ? 5 : 1;
    const currentStrike = get().selectedStrike || Math.round(get().selectedAsset.defaultPrice / step) * step;
    set({ selectedOptionType: type });
    get().selectContract(get().selectedAsset.ticker, currentStrike, type === 'C');
  },
  setSelectedStrike: (strike) => {
    set({ selectedStrike: strike, isContractLocked: strike !== null });
    if (strike) {
      get().selectContract(get().selectedAsset.ticker, strike, get().selectedOptionType === 'C');
    }
  },
  selectContractAtomically: (asset, strike, isCall) => {
    set({
      selectedAsset: asset,
      selectedStrike: strike,
      selectedOptionType: isCall ? 'C' : 'P',
      isContractLocked: true,
      activeTab: 'skyvision'
    });
    get().selectContract(asset.ticker, strike, isCall);
  },
  setIsPositionOpen: (open) => set({ isPositionOpen: open }),
  setIsDeepSkyseyeExpanded: (expanded) => set({ isDeepSkyseyeExpanded: expanded }),
  setIsGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
  setTrades: (trades) => set({ trades }),

  selectContract: (ticker, strike, isCall) => {
    const asset = ASSET_LIST.find(a => a.ticker === ticker) || get().selectedAsset;
    const contractKey = `${ticker}-${strike}${isCall ? 'C' : 'P'}`;
    const cached = get().contractCache[contractKey];

    if (cached) {
      set({
        selectedAsset: asset,
        selectedStrike: strike,
        selectedOptionType: isCall ? 'C' : 'P',
        activeContract: cached
      });
    } else {
      // Build immediate high-similarity predicted state to bridge SSE gap (<50ms setup)
      const spot = asset.defaultPrice;
      const step = asset.defaultPrice > 1000 ? 100 : asset.defaultPrice > 150 ? 5 : 1;
      
      const preloadedState: ContractState = {
        contract: `${ticker} ${strike}${isCall ? 'C' : 'P'}`,
        health: 88, // predicted target health
        recommendation: 'HOLD',
        expectedMove: Number((asset.volatility * spot * 0.05).toFixed(1)),
        targets: [],
        chartData: [], // Start with empty chart data safely so we don't see previous ticker's candles
      };

      set({
        selectedAsset: asset,
        selectedStrike: strike,
        selectedOptionType: isCall ? 'C' : 'P',
        activeContract: preloadedState
      });
    }
  },

  updateFromSSE: (payload: ServerStatePayload) => {
    // Guard the contract field too: the SSE stream can deliver control/heartbeat
    // frames (or partial JSON) that parse to an object without `contract`. The
    // old `payload.contract.replace(...)` then threw inside the rAF flush loop,
    // killing all further updates until the effect re-ran.
    if (!payload || typeof payload.contract !== 'string') return;

    // 1. Race condition guard: Ensure the received payload is for the currently selected asset, option type, and strike!
    const payloadTicker = payload.contract.replace('-', ' ').split(' ')[0];
    const currentTicker = get().selectedAsset.ticker;

    const payloadOptType = payload.provenance?.inputs?.option_type;
    const currentIsCall = get().selectedOptionType === 'C';

    const payloadStrike = payload.optionStrike;
    const currentStrike = get().selectedStrike;

    if (payloadTicker !== currentTicker) {
      console.warn(`[SSE Race Condition Guard] Ignored stale payload for ${payloadTicker} (active: ${currentTicker})`);
      return;
    }
    // Only enforce the option-type match when the payload actually declares it —
    // otherwise a payload that omits provenance would be wrongly dropped for a
    // selected call (option_type undefined !== 'C' read as a put mismatch).
    if (payloadOptType && (payloadOptType === 'C') !== currentIsCall) {
      console.warn(`[SSE Race Condition Guard] Ignored stale payload for type ${payloadOptType} (active: ${currentIsCall ? 'C' : 'P'})`);
      return;
    }
    if (currentStrike !== null && payloadStrike !== currentStrike) {
      console.warn(`[SSE Race Condition Guard] Ignored stale payload for strike ${payloadStrike} (active: ${currentStrike})`);
      return;
    }

    // 2. Content integrity guard: the race guard only checks WHICH contract this is, never that its
    // VALUES are sane. Drop frames with a non-positive spot, an out-of-range health, or a malformed
    // candle so corrupt data can't quietly poison the read — last-good state stays, next frame heals.
    const integrity = validateSsePayload(payload);
    if (!integrity.ok) {
      console.warn(`[SSE Integrity Guard] Dropped frame: ${integrity.reason}`);
      return;
    }

    const contractKey = payload.contract.replace(/\s+/g, '-'); // e.g. "SPX-7620C"
    
    const newContractState: ContractState = {
      contract: payload.contract,
      health: payload.trade_health,
      recommendation: payload.recommendation,
      expectedMove: Number(String(payload.expected_move?.pct ?? '').replace(/[^0-9.]/g, '') || '0'),
      targets: payload.targets,
      chartData: payload.candles || [],
    };

    set((state) => {
      // Bound the cache: each entry holds a full candle array, so without
      // eviction it grows unbounded as a user browses contracts. Refresh the
      // touched key to the end (LRU) and drop the oldest beyond the cap.
      const MAX_CONTRACT_CACHE = 100;
      const updatedCache: Record<string, ContractState> = { ...state.contractCache };
      delete updatedCache[contractKey];
      updatedCache[contractKey] = newContractState;
      const cacheKeys = Object.keys(updatedCache);
      if (cacheKeys.length > MAX_CONTRACT_CACHE) {
        for (const staleKey of cacheKeys.slice(0, cacheKeys.length - MAX_CONTRACT_CACHE)) {
          delete updatedCache[staleKey];
        }
      }
      const hasActiveTrade = (payload.trade_archive || []).some((t: any) => t.finalOutcome === 'Active');
      return {
        serverState: payload,
        activeContract: newContractState,
        contractCache: updatedCache,
        trades: payload.trade_archive || [],
        selectedStrike: state.selectedStrike,
        isPositionOpen: hasActiveTrade
      };
    });
  },

  tickMarketState: () => {
    set({ marketState: getMarketState() });
  }
}));
