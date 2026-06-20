import React, { useEffect } from 'react';
import { create } from 'zustand';
import { AssetInfo, Candle, V8TradeRecord, TimeframeVal, ServerStatePayload } from '../types';
import { ASSET_LIST } from '../data';

export type PinLevel = {
  strike: number;
  dollars: number;
  strength: number;
  type: 'support' | 'resistance' | 'magnet';
};

export type PinpointData = {
  spotPrice: number;
  step: number;
  levels: PinLevel[];
};

export type ContractState = {
  contract: string;
  health: number;
  recommendation: 'ENTER' | 'HOLD' | 'REDUCE' | 'EXIT';
  expectedMove: number;
  targets: any[];
  chartData: Candle[];
  pinpoint: PinpointData;
};

interface MarketState {
  open: boolean;
  closeIn: string;
  openIn: string;
}

export interface ContractStore {
  // Navigation & View Tabs
  activeTab: 'home' | 'skyvision' | 'pinpoint' | 'auditor' | 'dealerflow' | 'community' | 'settings' | 'admin' | 'subscription' | 'workspace';
  setActiveTab: (tab: 'home' | 'skyvision' | 'pinpoint' | 'auditor' | 'dealerflow' | 'community' | 'settings' | 'admin' | 'subscription' | 'workspace', keepContract?: boolean) => void;

  // Theme settings
  themeMode: 'light' | 'dark';
  toggleThemeMode: () => void;

  // Smooth scroll settings
  smoothScroll: boolean;
  toggleSmoothScroll: () => void;

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

export function useTierValidation() {
  const setPurchasedTier = useContractStore(s => s.setPurchasedTier);
  const setIsAuthenticated = useContractStore(s => s.setIsAuthenticated);

  // Strictly validate condition on mount and hydration
  useEffect(() => {
    // 1. Instantly force sync from local drift before network
    if (typeof window !== 'undefined') {
      const localSync = Number(localStorage.getItem('slayer_tier') || '0');
      const authSync = localStorage.getItem('slayer_auth') === 'true';
      setPurchasedTier(localSync);
      setIsAuthenticated(authSync);
    }

    // 2. Perform definitive network validation
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.access_tier) {
          setIsAuthenticated(true);
          localStorage.setItem('slayer_auth', 'true');
          const tierNum = data.access_tier === 'discord' ? 1
            : (data.access_tier === 'skyvision' || data.access_tier === 'intraday') ? 2
            : (data.access_tier === 'pinpoint' || data.access_tier === 'quant') ? 3
            : (data.access_tier === 'enterprise') ? 4
            : data.access_tier === 'lifetime' ? 5
            : 0;
          setPurchasedTier(tierNum);
        } else {
          setIsAuthenticated(false);
          localStorage.setItem('slayer_auth', 'false');
          setPurchasedTier(0);
        }
      })
      .catch(err => console.error("Tier sync failed", err));
  }, [setPurchasedTier, setIsAuthenticated]);
}

export const useContractStore = create<ContractStore>((set, get) => ({
  activeTab: (localStorage.getItem('lastActiveTab') as 'home' | 'skyvision' | 'pinpoint' | 'auditor' | 'dealerflow' | 'community' | 'settings' | 'admin' | 'subscription' | 'workspace') || 'home',
  setActiveTab: (tab, keepContract = false) => {
    localStorage.setItem('lastActiveTab', tab);
    if (tab === 'skyvision' && !keepContract) {
      set({ activeTab: tab, selectedStrike: null, isContractLocked: false, auditSearchQuery: '', expandedAuditId: null });
    } else {
      if (tab === 'auditor' && get().activeTab === 'auditor') {
        // Clear active query and expand states when re-clicking the Auditor tab
        set({ auditSearchQuery: '', expandedAuditId: null });
      } else if (tab !== 'auditor') {
        // Reset query and expand states when navigating away from Auditor to other tabs
        set({ activeTab: tab, auditSearchQuery: '', expandedAuditId: null });
      } else {
        set({ activeTab: tab });
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

  purchasedTier: typeof window !== 'undefined' ? Number(localStorage.getItem('slayer_tier') || '0') : 0,
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
        pinpoint: {
          spotPrice: spot,
          step,
          levels: []
        }
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
    if (!payload) return;

    // 1. Race condition guard: Ensure the received payload is for the currently selected asset, option type, and strike!
    const payloadTicker = payload.contract.replace('-', ' ').split(' ')[0];
    const currentTicker = get().selectedAsset.ticker;

    const payloadIsCall = payload.provenance?.inputs?.option_type === 'C';
    const currentIsCall = get().selectedOptionType === 'C';

    const payloadStrike = payload.optionStrike;
    const currentStrike = get().selectedStrike;

    if (payloadTicker !== currentTicker) {
      console.warn(`[SSE Race Condition Guard] Ignored stale payload for ${payloadTicker} (active: ${currentTicker})`);
      return;
    }
    if (payloadIsCall !== currentIsCall) {
      console.warn(`[SSE Race Condition Guard] Ignored stale payload for type ${payloadIsCall ? 'C' : 'P'} (active: ${currentIsCall ? 'C' : 'P'})`);
      return;
    }
    if (currentStrike !== null && payloadStrike !== currentStrike) {
      console.warn(`[SSE Race Condition Guard] Ignored stale payload for strike ${payloadStrike} (active: ${currentStrike})`);
      return;
    }

    const contractKey = payload.contract.replace(/\s+/g, '-'); // e.g. "SPX-7620C"
    
    // Pinpoint levels: dollars come straight from the server's per-strike
    // net GEX computation (real chain when live, deterministic mock offline).
    const rawLevels = payload.pinpoint_map?.levels || [];
    const mappedLevels: PinLevel[] = rawLevels.map((lvl: any) => {
      const dollarsStr = lvl.exposureInfo?.match(/([+-]?\$[0-9.]+[BM])/i)?.[1] || '';
      let dollarsNum = 0;
      if (dollarsStr) {
        const value = parseFloat(dollarsStr.replace(/[^0-9.]/g, ''));
        dollarsNum = dollarsStr.endsWith('B') ? value * 1e9 : value * 1e6;
      }
      return {
        strike: lvl.strike,
        dollars: Math.abs(lvl.gexDollars !== undefined ? lvl.gexDollars : dollarsNum),
        strength: lvl.strength,
        type: lvl.label === 'support' || lvl.isPutWall
          ? 'support'
          : lvl.label === 'resistance' || lvl.isCallWall
          ? 'resistance'
          : 'magnet'
      };
    });

    const newContractState: ContractState = {
      contract: payload.contract,
      health: payload.trade_health,
      recommendation: payload.recommendation,
      expectedMove: Number(String(payload.expected_move?.pct ?? '').replace(/[^0-9.]/g, '') || '0'),
      targets: payload.targets,
      chartData: payload.candles || [],
      pinpoint: {
        spotPrice: payload.pinpoint_map?.spot_price || payload.provenance?.inputs?.underlying_price || 0,
        step: payload.pinpoint_map?.step || 10,
        levels: mappedLevels
      }
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
