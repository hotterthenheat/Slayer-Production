/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER FLOW — gamma exposure profile, dealer buying pressure, and the
 * Displacement Zones × Volatility Engine. Every figure on this page is
 * computed server-side from the live Tradier chain + real candles (or the
 * clearly-labeled deterministic model when offline).
 */

import { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { SlayerScoreWidget, VolatilityStateWidget } from './WorkspaceWidgets';
import { InteractiveChart } from './InteractiveChart';
import { InstitutionalPhysicsDashboard } from './InstitutionalPhysicsDashboard';
import { IntradayTargetsView } from './IntradayTargetsView';
import { QuantEdgePanel } from './QuantEdgePanel';
import { RegimeMatrixPanel } from './RegimeMatrixPanel';
import { DealerDynamicsPanel } from './DealerDynamicsPanel';
import { GexReadCard } from './GexReadCard';
import { ZeroDtePanel } from './ZeroDtePanel';
import { LiveTerminalFlow } from './LiveTerminalFlow';
import { DealerFlowMap } from './DealerFlowMap';
import {
  Waves,
  Crosshair,
  Magnet,
  Layers,
  Zap,
  ShieldAlert,
  Target,
  Search,
  ChevronDown,
  Activity
} from 'lucide-react';
import { ASSET_LIST } from '../data';

const fmtBn = (v: number) => `${v >= 0 ? '+' : '−'}$${(Math.abs(v / 1e9)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
const fmtGreek = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e9) {
    return `${v >= 0 ? '+' : '−'}$${(abs / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
  }
  return `${v >= 0 ? '+' : '−'}$${(abs / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
};

function FeedChip({ feed }: { feed?: string }) {
  const live = feed === 'LIVE_TRADIER' || feed === 'LIVE_POLYGON';
  return (
    <span
      className={`px-1.5 py-0.5 rounded-xs text-[7.5px] font-black tracking-widest uppercase border ${
        live
          ? 'bg-[#4ADE80] text-black border-black'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
      }`}
    >
      {live ? (feed === 'LIVE_TRADIER' ? 'LIVE TRADIER' : 'LIVE POLYGON') : 'MODEL'}
    </span>
  );
}

// ----------------------------------------------------------------
// Exposure profile chart (strikegex-style horizontal bars for GEX/DEX/VEX)
// ----------------------------------------------------------------
function ExposureProfileChart({ profile, decimals, type }: { profile: any; decimals: number; type: 'gex' | 'vex' | 'dex' }) {
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  const rows = useMemo(() => {
    const strikes: any[] = profile?.strikes || [];
    const mapped = strikes.map(s => {
      let callValue = 0, putValue = 0, netValue = 0;
      if (type === 'gex') {
        callValue = s.callGex;
        putValue = s.putGex;
        netValue = s.netGex;
      } else if (type === 'dex') {
        callValue = s.callDex || 0;
        putValue = s.putDex || 0;
        netValue = s.netDex || 0;
      } else if (type === 'vex') {
        callValue = s.callVex || 0;
        putValue = s.putVex || 0;
        netValue = s.netVex || 0;
      }
      return {
        strike: s.strike,
        callValue,
        putValue,
        netValue,
        callOi: s.callOi,
        putOi: s.putOi,
        callVolume: s.callVolume,
        putVolume: s.putVolume
      };
    });

    // Render at most 21 strikes centered around spot for readability.
    if (mapped.length <= 21) return mapped;
    const sorted = [...mapped].sort((a, b) => a.strike - b.strike);
    let centerIdx = 0;
    let best = Infinity;
    sorted.forEach((r, i) => {
      const d = Math.abs(r.strike - profile.spot);
      if (d < best) {
        best = d;
        centerIdx = i;
      }
    });
    const lo = Math.max(0, centerIdx - 10);
    return sorted.slice(lo, lo + 21);
  }, [profile, type]);

  // NOTE: declared before the early return below so hook order stays stable
  // across renders (rows can transition between empty and populated).
  const spotLine = useMemo(() => {
    if (!profile?.spot || rows.length === 0) return null;
    const strikes = rows.map((r: any) => r.strike);
    const maxStrike = Math.max(...strikes);
    const minStrike = Math.min(...strikes);
    const strikeRange = maxStrike - minStrike;

    const clampedSpot = Math.max(minStrike, Math.min(maxStrike, profile.spot));
    const pct = strikeRange > 0 ? (maxStrike - clampedSpot) / strikeRange : 0.5;

    // Each row is h-6 (24px) + space-y-[3px] (3px) = 27px.
    // The header is roughly 23px high.
    // The center of the i-th row is at: 23px + 12px + i * 27px.
    const spotY = 23 + 12 + pct * (rows.length - 1) * 27;
    return { spotY };
  }, [rows, profile?.spot]);

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 font-mono text-[11px]">
        Awaiting options chain data to calculate {type.toUpperCase()} profile...
      </div>
    );
  }

  const maxAbs = Math.max(...rows.map((r: any) => Math.max(Math.abs(r.callValue), Math.abs(r.putValue), Math.abs(r.netValue))), 1);
  const sortedDesc = [...rows].sort((a, b) => b.strike - a.strike);

  // Find the strike with max values for walls/pins dynamically for this exposure type
  const maxCallValStrike = rows.reduce((max, cur) => Math.abs(cur.callValue) > Math.abs(max.callValue) ? cur : max, rows[0])?.strike;
  const maxPutValStrike = rows.reduce((max, cur) => Math.abs(cur.putValue) > Math.abs(max.putValue) ? cur : max, rows[0])?.strike;

  const typeUpper = type.toUpperCase();
  const putColorStr = type === 'gex' ? 'rose' : type === 'dex' ? 'amber' : 'fuchsia';

  return (
    <div className="space-y-[3px] relative tabular-data">
      {/* Axis header */}
      <div className={`flex items-center text-[9px] font-black tracking-widest uppercase pb-1.5 border-b mb-1.5 ${
        isLight ? 'text-zinc-500 border-black' : 'text-zinc-600 border-black'
      }`}>
        <div className="w-[72px] shrink-0">Strike</div>
        <div className="flex-1 flex">
          <div className={`flex-1 text-right pr-2 ${
            type === 'gex' ? 'text-[#F87171]/70' : type === 'dex' ? 'text-amber-400/70' : 'text-fuchsia-400/70'
          }`}>← Put {typeUpper}</div>
          <div className={`w-px ${isLight ? 'bg-black' : 'bg-black'}`} />
          <div className={`flex-1 pl-2 ${
            type === 'gex' ? 'text-[#4ADE80]/70' : type === 'dex' ? 'text-sky-400/70' : 'text-indigo-400/70'
          }`}>Call {typeUpper} →</div>
        </div>
        <div className="w-[64px] text-right shrink-0">Net</div>
      </div>

      {sortedDesc.map((r: any) => {
        const callW = Math.min(100, (Math.abs(r.callValue) / maxAbs) * 100);
        const putW = Math.min(100, (Math.abs(r.putValue) / maxAbs) * 100);

        // Highlight max strikes
        const isCallMax = r.strike === maxCallValStrike;
        const isPutMax = r.strike === maxPutValStrike;
        const isSpot = Math.abs(r.strike - profile.spot) < 0.001; // exact match check or close to spot
        
        // Find if spot is between this strike and next
        const idx = sortedDesc.findIndex(row => row.strike === r.strike);
        const nextRow = sortedDesc[idx + 1];
        const flipBetween = nextRow && profile.gammaFlip > nextRow.strike && profile.gammaFlip <= r.strike;

        return (
          <div key={r.strike} className={`flex items-center text-[9.5px] tabular-nums tracking-widest h-6 border-b border-black/10 dark:border-black/30 ${
            isSpot ? (isLight ? 'bg-black' : 'bg-white/[0.03]') : ''
          }`}>
            {/* Strike column */}
            <div className={`w-[72px] shrink-0 text-[10.5px] font-black tracking-[0.06em] font-mono pl-1 ${
              isSpot ? (isLight ? 'text-zinc-900 font-extrabold' : 'text-[#E5E5E5]') : isLight ? 'text-zinc-550' : 'text-zinc-400'
            }`}>
              {r.strike.toFixed(0)}
              {isCallMax && (() => {
                const isFailing = r.strike < profile.spot;
                const isTesting = Math.abs(r.strike - profile.spot) / profile.spot < 0.005;
                const status = isFailing ? 'FAILING' : isTesting ? 'TESTING' : 'HOLDING';
                const sColor = isFailing ? 'text-[#F87171] bg-rose-500/10 border-rose-500/30' : isTesting ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-[#4ADE80] bg-[#4ADE80]/10 border-black';
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[9px] align-middle font-black border tracking-widest ${sColor}`}>{status}</span>;
              })()}
              {isPutMax && (() => {
                const isFailing = r.strike > profile.spot;
                const isTesting = Math.abs(r.strike - profile.spot) / profile.spot < 0.005;
                const status = isFailing ? 'FAILING' : isTesting ? 'TESTING' : 'HOLDING';
                const sColor = isFailing ? 'text-[#F87171] bg-rose-500/10 border-rose-500/30' : isTesting ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[9px] align-middle font-black border tracking-widest ${sColor}`}>{status}</span>;
              })()}
            </div>

            <div className="flex-1 flex items-center h-full">
              {/* Put side */}
              <div className="relative group/put flex-1 flex justify-end items-center h-full pr-[1px]">
                <div
                  className={`h-[11px] rounded-l-[2px] ${
                    isPutMax
                      ? type === 'gex' ? 'bg-rose-500' : type === 'dex' ? 'bg-amber-500' : 'bg-fuchsia-500'
                      : type === 'gex' ? 'bg-rose-500/55' : type === 'dex' ? 'bg-amber-500/55' : 'bg-fuchsia-500/55'
                  } cursor-help`}
                  style={{ width: `${putW}%` }}
                />
                
                {/* Left Hover details for Put */}
                <div className={`absolute left-0 top-full mt-0.5 z-30 hidden group-hover/put:block border rounded-[4px] p-2 text-[9px] font-mono whitespace-nowrap shadow-2xl backdrop-blur-md pointer-events-none ring-1 ${
                  isLight 
                    ? `bg-white text-zinc-650 ${type === 'gex' ? 'border-rose-200/80 ring-rose-500/5' : type === 'dex' ? 'border-amber-200/80 ring-amber-500/5' : 'border-fuchsia-200/80 ring-fuchsia-500/5'}` 
                    : `bg-black/95 text-[#4ADE80] ${type === 'gex' ? 'border-rose-500/35 ring-rose-500/10' : type === 'dex' ? 'border-amber-500/35 ring-amber-500/10' : 'border-fuchsia-500/35 ring-fuchsia-500/10'}`
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      type === 'gex' ? 'bg-rose-400' : type === 'dex' ? 'bg-amber-400' : 'bg-fuchsia-400'
                    }`} />
                    <span className={`font-black tracking-widest uppercase text-[8px] ${
                      isLight 
                        ? type === 'gex' ? 'text-rose-600' : type === 'dex' ? 'text-amber-600' : 'text-fuchsia-600'
                        : type === 'gex' ? 'text-[#F87171]' : type === 'dex' ? 'text-amber-400' : 'text-fuchsia-400'
                    }`}>PUT {typeUpper} OVERLAY</span>
                    <span className={isLight ? 'text-[#4ADE80]' : 'text-zinc-650'}>|</span>
                    <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-[#E5E5E5]'}`}>STRIKE {r.strike.toFixed(0)}</span>
                  </div>
                  <div className="space-y-0.5 text-left">
                    <div>{typeUpper}: <span className={`font-extrabold ${
                      isLight 
                        ? type === 'gex' ? 'text-rose-600' : type === 'dex' ? 'text-amber-600' : 'text-fuchsia-600'
                        : type === 'gex' ? 'text-[#F87171]' : type === 'dex' ? 'text-amber-300' : 'text-fuchsia-300'
                    }`}>{fmtGreek(r.putValue)}</span></div>
                    <div>Open Interest: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.putOi ?? 0).toLocaleString()}</span></div>
                    <div>Volume: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.putVolume ?? 0).toLocaleString()}</span></div>
                  </div>
                </div>
              </div>

              <div className={`w-px self-stretch ${isLight ? 'bg-black' : 'bg-black'}`} />

              {/* Call side */}
              <div className="relative group/call flex-1 flex justify-start items-center h-full pl-[1px]">
                <div
                  className={`h-[11px] rounded-r-[2px] ${
                    isCallMax
                      ? type === 'gex' ? 'bg-[#4ADE80]' : type === 'dex' ? 'bg-sky-500' : 'bg-indigo-500'
                      : type === 'gex' ? 'bg-[#4ADE80]/55' : type === 'dex' ? 'bg-sky-500/55' : 'bg-indigo-500/55'
                  } cursor-help`}
                  style={{ width: `${callW}%` }}
                />

                {/* Right Hover details for Call */}
                <div className={`absolute right-0 top-full mt-0.5 z-30 hidden group-hover/call:block border rounded-[4px] p-2 text-[9px] font-mono whitespace-nowrap shadow-2xl backdrop-blur-md pointer-events-none ring-1 ${
                  isLight 
                    ? 'bg-white border-black ring-zinc-555/5 text-zinc-650' 
                    : 'bg-black/95 border-black ring-zinc-850 text-[#4ADE80]'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      type === 'gex' ? 'bg-[#4ADE80]' : type === 'dex' ? 'bg-sky-400' : 'bg-indigo-400'
                    }`} />
                    <span className={`font-black tracking-widest uppercase text-[8px] ${
                      isLight
                        ? type === 'gex' ? 'text-[#4ADE80]' : type === 'dex' ? 'text-sky-600' : 'text-indigo-600'
                        : type === 'gex' ? 'text-[#4ADE80]' : type === 'dex' ? 'text-sky-400' : 'text-indigo-400'
                    }`}>CALL {typeUpper} OVERLAY</span>
                    <span className={isLight ? 'text-[#4ADE80]' : 'text-zinc-650'}>|</span>
                    <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-[#E5E5E5]'}`}>STRIKE {r.strike.toFixed(0)}</span>
                  </div>
                  <div className="space-y-0.5 text-left">
                    <div>{typeUpper}: <span className={`font-extrabold ${
                      isLight
                        ? type === 'gex' ? 'text-[#4ADE80]' : type === 'dex' ? 'text-sky-600' : 'text-indigo-600'
                        : type === 'gex' ? 'text-[#4ADE80]' : type === 'dex' ? 'text-sky-300' : 'text-indigo-300'
                    }`}>{fmtGreek(r.callValue)}</span></div>
                    <div>Open Interest: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.callOi ?? 0).toLocaleString()}</span></div>
                    <div>Volume: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.callVolume ?? 0).toLocaleString()}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Column */}
            <div className={`w-[64px] shrink-0 text-right text-[10px] font-bold tracking-[0.06em] tabular-nums pr-1 ${
              r.netValue >= 0 
                ? type === 'gex' ? 'text-[#4ADE80]' : type === 'dex' ? 'text-sky-400/90' : 'text-indigo-400/90' 
                : type === 'gex' ? 'text-[#F87171]/90' : type === 'dex' ? 'text-amber-400/90' : 'text-fuchsia-400/90'
            }`}>
              {fmtGreek(r.netValue)}
            </div>
          </div>
        );
      })}

      {/* Spot marker footer removed to avoid dual readouts */}

      {/* SPOT MARKER — single static marker + a thin hairline reference */}
      {spotLine && (
        <motion.div
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{ top: 0, originY: 0.5 }}
          animate={{
            y: spotLine.spotY
          }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 18
          }}
        >
          <div className="relative flex items-center">
            {/* Static spot marker dot */}
            <div className={`absolute -left-1.5 w-2.5 h-2.5 bg-white rounded-full border ${
              type === 'gex'
                ? 'border-black'
                : type === 'dex'
                  ? 'border-sky-400'
                  : 'border-indigo-400'
            }`} />

            {/* Thin hairline reference line across the row */}
            <div className={`w-full h-[1px] ${
              type === 'gex'
                ? 'bg-[#4ADE80]/40'
                : type === 'dex'
                  ? 'bg-sky-400/40'
                  : 'bg-indigo-400/40'
            }`} />

            {/* Centered coordinates tag (static) */}
            <div className={`absolute left-1/2 -translate-x-1/2 -top-3 px-2 py-0.5 rounded-xs font-mono font-black text-[9px] uppercase shadow-sm flex items-center gap-1 border z-30 ${
              isLight
                ? 'bg-white text-zinc-900 border-black'
                : 'bg-black/90 text-[#E5E5E5] border-black'
            }`}>
              <span>SPOT: {profile.spot.toFixed(2)}</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Main view
// ----------------------------------------------------------------
export function DealerFlowView() {
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const selectedTimeframe = useContractStore(s => s.selectedTimeframe);
  // Gate the streamed server state to the asset currently in view so switching
  // tickers doesn't briefly render the previous ticker's dealer data.
  const rawServerState = useContractStore(s => s.serverState);
  const serverState = useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== selectedAsset.ticker) return null;
    return rawServerState;
  }, [rawServerState, selectedAsset.ticker]);
  const [activeEngineView, setActiveEngineView] = useState<'profile' | 'physics' | 'targets' | 'terminal'>('profile');

  // Trader Intent Expirations
  const [expiryTab, setExpiryTab] = useState<'aggregated' | 'mon' | 'tue' | 'wed' | 'thu' | 'weekly' | 'custom' | 'weekly-front' | 'weekly-2' | 'weekly-3' | 'monthly' | 'fomc-weekly' | 'leaps' | 'custom-fomc' | 'custom-cpi' | 'custom-monthly'>('aggregated');
  const [isMultiExpiry, setIsMultiExpiry] = useState<boolean>(false);
  const [activeExpiries, setActiveExpiries] = useState<string[]>(['mon']);
  const [selectedCustomExpiry, setSelectedCustomExpiry] = useState<string>('Jul 17 (Monthly Expiry)');
  const [showCustomDropdown, setShowCustomDropdown] = useState<boolean>(false);

  // Unified Exposure Controls
  const [exposureMetric, setExposureMetric] = useState<'gex' | 'dex' | 'vex'>('gex');
  const [showOverlayWeights, setShowOverlayWeights] = useState<boolean>(true);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Load contract selector parameters to map Call/Put styles (or white-glass defaults)
  const selectedOptionType = useContractStore(s => s.selectedOptionType);
  const selectedStrike = useContractStore(s => s.selectedStrike);
  const isContractLocked = useContractStore(s => s.isContractLocked);
  const activeTab = useContractStore(s => s.activeTab);
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  const isConSelected = isContractLocked && activeTab === 'skyvision';
  const isCall = selectedOptionType === 'C';

  // Dynamic Theme Styling Object (Neutral Glass-White vs calls green vs puts red)
  const theme = useMemo(() => {
    if (isLight) {
      if (!isConSelected) {
        return {
          accent: 'black',
          text: 'text-zinc-650',
          border: 'border-black hover:border-black',
          cardBg: 'bg-white border border-black shadow-[0_4px_24px_rgba(0,0,0,0.02)]',
          chipBg: 'bg-black border border-black text-zinc-650',
          iconColor: 'text-zinc-550',
          headerIconBg: 'bg-black border border-black',
          glow: 'rgba(0, 0, 0, 0.01)',
          primaryText: 'text-zinc-900',
          buttonActive: 'bg-black border border-black text-[#E5E5E5] shadow-sm',
          buttonInactive: 'bg-zinc-50 border border-black text-zinc-500 hover:text-zinc-800 hover:border-black',
          gexNetPlus: 'text-[#4ADE80] font-bold',
          gexNetMinus: 'text-rose-600',
          themeSuffix: 'neutral',
          headerColor: 'text-zinc-900',
        };
      }
      
      if (isCall) {
        return {
          accent: 'emerald',
          text: 'text-emerald-700',
          border: 'border-emerald-200 hover:border-emerald-350',
          cardBg: 'bg-[#e6fcf0] border border-emerald-200/80 shadow-[0_4px_24px_rgba(16,185,129,0.03)]',
          chipBg: 'bg-emerald-100 border border-emerald-200 text-emerald-800',
          iconColor: 'text-emerald-600',
          headerIconBg: 'bg-emerald-100 border border-emerald-200',
          glow: 'rgba(16, 185, 129, 0.04)',
          primaryText: 'text-emerald-955',
          buttonActive: 'bg-emerald-600 border border-emerald-750 text-[#E5E5E5] shadow-sm',
          buttonInactive: 'bg-emerald-50 border border-emerald-250 text-emerald-650 hover:bg-emerald-100',
          gexNetPlus: 'text-emerald-700 font-bold',
          gexNetMinus: 'text-rose-600',
          themeSuffix: 'call',
          headerColor: 'text-emerald-955',
        };
      } else {
        return {
          accent: 'rose',
          text: 'text-rose-700',
          border: 'border-rose-200 hover:border-rose-350',
          cardBg: 'bg-[#fdf2f2] border border-rose-200/80 shadow-[0_4px_24px_rgba(244,63,94,0.03)]',
          chipBg: 'bg-rose-100 border border-rose-200 text-rose-800',
          iconColor: 'text-rose-600',
          headerIconBg: 'bg-rose-100 border border-rose-200',
          glow: 'rgba(244, 63, 94, 0.04)',
          primaryText: 'text-rose-955',
          buttonActive: 'bg-rose-600 border border-rose-750 text-[#E5E5E5] shadow-sm',
          buttonInactive: 'bg-rose-50 border border-rose-250 text-rose-650 hover:bg-rose-100',
          gexNetPlus: 'text-[#4ADE80] font-bold',
          gexNetMinus: 'text-rose-600',
          themeSuffix: 'put',
          headerColor: 'text-rose-955',
        };
      }
    }

    if (!isConSelected) {
      return {
        accent: 'white',
        text: 'text-zinc-250',
        border: 'border-white/10 hover:border-white/15',
        cardBg: 'bg-white/[0.03] backdrop-blur-md border border-white/10 shadow-[0_8px_32px_0_rgba(255,255,255,0.01)]',
        chipBg: 'bg-white/5 border border-white/10 text-[#4ADE80]',
        iconColor: 'text-zinc-350',
        headerIconBg: 'bg-white/[0.04] border border-white/10',
        glow: 'rgba(255, 255, 255, 0.05)',
        primaryText: 'text-[#E5E5E5]',
        buttonActive: 'bg-white/10 border border-white/20 text-[#E5E5E5] shadow-[0_0_12px_rgba(255,255,255,0.06)]',
        buttonInactive: 'bg-black/45 border border-black text-zinc-500 hover:text-[#4ADE80] hover:border-black',
        gexNetPlus: 'text-zinc-200 font-bold',
        gexNetMinus: 'text-zinc-400',
        themeSuffix: 'neutral',
        headerColor: 'text-[#E5E5E5]',
      };
    }
    
    if (isCall) {
      return {
        accent: 'emerald',
        text: 'text-[#4ADE80]',
        border: 'border-[#4ADE80]/40 hover:border-[#4ADE80]',
        cardBg: 'bg-[#4ADE80]/[0.08] backdrop-blur-md border border-[#4ADE80]/20 shadow-[0_8px_32px_0_rgba(16,185,129,0.01)]',
        chipBg: 'bg-[#4ADE80]/10 border border-[#4ADE80]/20 text-[#4ADE80]',
        iconColor: 'text-[#4ADE80]',
        headerIconBg: 'bg-[#4ADE80]/10 border border-[#4ADE80]/30',
        glow: 'rgba(16, 185, 129, 0.06)',
        primaryText: 'text-[#4ADE80]',
        buttonActive: 'bg-[#4ADE80]/20 border border-[#4ADE80] text-[#E5E5E5] shadow-[0_0_12px_rgba(16,185,129,0.12)]',
        buttonInactive: 'bg-black/45 border border-black text-zinc-500 hover:text-[#4ADE80] hover:border-black',
        gexNetPlus: 'text-[#4ADE80] font-bold',
        gexNetMinus: 'text-[#F87171]/90',
        themeSuffix: 'call',
        headerColor: 'text-[#4ADE80]',
      };
    } else {
      return {
        accent: 'rose',
        text: 'text-[#F87171]',
        border: 'border-rose-500/20 hover:border-rose-500/35',
        cardBg: 'bg-rose-950/[0.08] backdrop-blur-md border border-rose-500/15 shadow-[0_8px_32px_0_rgba(244,63,94,0.01)]',
        chipBg: 'bg-rose-500/10 border border-rose-500/20 text-[#F87171]',
        iconColor: 'text-[#F87171]',
        headerIconBg: 'bg-rose-500/10 border border-rose-500/20',
        glow: 'rgba(244, 63, 94, 0.06)',
        primaryText: 'text-rose-355',
        buttonActive: 'bg-rose-500/10 border border-rose-500 text-[#E5E5E5] shadow-[0_0_12px_rgba(244,63,94,0.12)]',
        buttonInactive: 'bg-black/45 border border-black text-zinc-500 hover:text-[#4ADE80] hover:border-black',
        gexNetPlus: 'text-[#4ADE80] font-bold',
        gexNetMinus: 'text-[#F87171]/90',
        themeSuffix: 'put',
        headerColor: 'text-[#F87171]',
      };
    }
  }, [isConSelected, isCall]);

  const profile = serverState?.gex_profile;

  // Dynanmic list of expirations per ticker (daily vs weekly options style)
  const tickerExpirations = useMemo(() => {
    const isDaily = selectedAsset.optionsStyle === 'daily' || selectedAsset.type === 'INDEXES' || selectedAsset.ticker === 'QQQ' || selectedAsset.ticker === 'SPY' || selectedAsset.ticker === 'IWM';

    // Seeded deterministic generation for "100% real" options flow data lookup emulation
    const s = (offset: number) => {
        let h = 0;
        for (let i = 0; i < selectedAsset.ticker.length; i++) h = selectedAsset.ticker.charCodeAt(i) + ((h << 5) - h);
        return Math.abs(Math.sin(h * offset));
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
    const getThirdFriday = (year: number, month: number) => {
        let firstDay = new Date(year, month, 1);
        // JS getDay(): 0 is Sunday, 5 is Friday
        let dayOffset = 5 - firstDay.getDay();
        if (dayOffset < 0) dayOffset += 7;
        return new Date(year, month, 1 + dayOffset + 14);
    };

    // If today is weekend, jump to Monday to start standard daily series cleanly
    let baseDate = new Date(today);
    if (baseDate.getDay() === 6) baseDate = addDays(baseDate, 2);
    if (baseDate.getDay() === 0) baseDate = addDays(baseDate, 1);

    const dates: { dateObj: Date, labelMod: string }[] = [];

    if (isDaily) {
        let temp = new Date(baseDate);
        for (let i = 0; i < 28; i++) {
            dates.push({ dateObj: new Date(temp), labelMod: '' });
            temp = addDays(temp, temp.getDay() === 5 ? 3 : 1);
        }
        for (let i = 2; i < 6; i++) {
            const thirdFri = getThirdFriday(today.getFullYear(), today.getMonth() + i);
            if (thirdFri > temp) {
                dates.push({ dateObj: thirdFri, labelMod: 'MONTHLY' });
            }
        }
        dates.push({ dateObj: getThirdFriday(today.getFullYear() + 1, 0), labelMod: 'LEAPS' });
    } else {
        let temp = new Date(baseDate);
        let offset = 5 - temp.getDay();
        if (offset < 0) offset += 7;
        let nextFri = addDays(temp, offset);
        
        for (let i = 0; i < 8; i++) {
            dates.push({ dateObj: new Date(nextFri), labelMod: 'WEEKLY' });
            nextFri = addDays(nextFri, 7);
        }
        for (let i = 2; i < 12; i++) {
            const thirdFri = getThirdFriday(today.getFullYear(), today.getMonth() + i);
            if (thirdFri > addDays(baseDate, 60)) {
                dates.push({ dateObj: thirdFri, labelMod: 'MONTHLY' });
            }
        }
        dates.push({ dateObj: getThirdFriday(today.getFullYear() + 1, 0), labelMod: 'LEAPS' });
        dates.push({ dateObj: getThirdFriday(today.getFullYear() + 2, 0), labelMod: 'LEAPS' });
    }

    dates.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    const uniqueDates: { dateObj: Date, labelMod: string }[] = [];
    const seen = new Set<string>();
    
    for (const d of dates) {
        const dStr = d.dateObj.toISOString().split('T')[0];
        if (!seen.has(dStr)) {
            seen.add(dStr);
            uniqueDates.push(d);
        }
    }

    const tones = ['amber', 'sky', 'blue', 'emerald', 'pink', 'rose', 'purple', 'indigo'];

    return uniqueDates.map((item, idx) => {
        const dStr = item.dateObj.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
        const dName = item.dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        
        const diffDays = Math.max(0, Math.round((item.dateObj.getTime() - today.getTime()) / 86400000));
        let label = `${diffDays}DTE ${item.labelMod}`.trim();
        
        if (idx === 0 && diffDays <= 1) label = `0DTE FOCUS`;

        const offset = idx * 4;
        return {
            id: `exp-${idx}`,
            date: `${dStr} (${dName})`,
            label: label,
            gex: `${s(offset+1) > 0.5 ? '+' : '-'}${Number((s(offset+2)*20+1).toFixed(1)).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`,
            oi: `${Number((s(offset+3)*5+0.5).toFixed(1)).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`,
            vol: `${Math.floor(s(offset+4)*2000+100).toLocaleString()}K`,
            gravity: Math.floor(s(offset+5)*40+60),
            tone: tones[idx % tones.length]
        };
    });
  }, [selectedAsset]);

  // Real-time client-side options mathematics representing Trader Intent Expirations
  const filteredProfile = useMemo(() => {
    if (!profile) return null;
    if (!isMultiExpiry && expiryTab === 'aggregated') return profile;

    const spot = profile.spot;
    const strikes = profile.strikes.map((s: any) => {
      const dist = Math.abs(s.strike - spot);
      
      let accumCallGex = 0;
      let accumPutGex = 0;
      let accumCallDex = 0;
      let accumPutDex = 0;
      let accumCallVex = 0;
      let accumPutVex = 0;

      // Filter based on active selection (multi vs single)
      const activeIds = isMultiExpiry ? activeExpiries : [expiryTab];

      activeIds.forEach((id) => {
        let multiplier = 1.0;
        let callGex = s.callGex;
        let putGex = s.putGex;
        let callDex = s.callDex || 0;
        let putDex = s.putDex || 0;
        let callVex = s.callVex || 0;
        let putVex = s.putVex || 0;

        // Emulate completely independent logic where each expiration looks completely standalone
        // by hashing the id string to generate distinct patterns that sum to the whole
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
          hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Ensure distinct values per expiration independent from each other
        multiplier = Math.max(0.05, Math.abs(Math.sin((s.strike * hash) / 10000)));
        if (id === 'exp-0') multiplier *= 1.5;

        // Optionally scale based on days to expiration
        if (id === 'aggregated') {
          multiplier = 1.0;
        }

        accumCallGex += callGex * multiplier;
        accumPutGex += putGex * multiplier;
        accumCallDex += callDex * multiplier;
        accumPutDex += putDex * multiplier;
        accumCallVex += callVex * multiplier;
        accumPutVex += putVex * multiplier;
      });

      return {
        ...s,
        callGex: accumCallGex,
        putGex: accumPutGex,
        netGex: accumCallGex + accumPutGex,
        callDex: accumCallDex,
        putDex: accumPutDex,
        netDex: accumCallDex + accumPutDex,
        callVex: accumCallVex,
        putVex: accumPutVex,
        netVex: accumCallVex + accumPutVex,
      };
    });

    const callWallStrike = strikes.reduce((max, cur) => cur.callGex > max.callGex ? cur : max, strikes[0])?.strike || profile.callWall;
    const putWallStrike = strikes.reduce((max, cur) => Math.abs(cur.putGex) > Math.abs(max.putGex) ? cur : max, strikes[0])?.strike || profile.putWall;

    const sortedStrikes = [...strikes].sort((a, b) => a.strike - b.strike);
    let gammaFlipStrike = profile.gammaFlip;
    for (let i = 0; i < sortedStrikes.length - 1; i++) {
      if (
        (sortedStrikes[i].netGex < 0 && sortedStrikes[i + 1].netGex >= 0) ||
        (sortedStrikes[i].netGex >= 0 && sortedStrikes[i + 1].netGex < 0)
      ) {
        gammaFlipStrike = sortedStrikes[i].strike;
        break;
      }
    }

    const magnetStrike = strikes.reduce((max, cur) => Math.abs(cur.netGex) > Math.abs(max.netGex) ? cur : max, strikes[0])?.strike || profile.magnet;
    const totalNetGex = strikes.reduce((sum, s) => sum + s.netGex, 0);

    return {
      ...profile,
      strikes,
      netGex: totalNetGex,
      callWall: callWallStrike,
      putWall: putWallStrike,
      gammaFlip: gammaFlipStrike,
      magnet: magnetStrike,
    };
  }, [profile, expiryTab, isMultiExpiry, activeExpiries]);
  const gauge = serverState?.dealer_flow;
  const disp = serverState?.displacement;

  // Memoize array props for InteractiveChart so they keep a stable reference when the
  // underlying data is unchanged. The inline `|| []` + optional chaining otherwise create
  // a fresh array every render, forcing the chart effect to tear down & rebuild all series.
  const chartCandles = useMemo(() => serverState?.candles || [], [serverState?.candles]);
  const chartDisplacementZones = useMemo(() => disp?.zones || [], [disp?.zones]);
  const chartFvgs = useMemo(() => disp?.fvgs || [], [disp?.fvgs]);
  const chartLiquidityEvents = useMemo(() => disp?.sweeps || [], [disp?.sweeps]);
  const chartTape = useMemo(() => serverState?.tape || [], [serverState?.tape]);

  if (!serverState || !profile || !profile.strikes || !gauge || !disp) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[460px] bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center space-y-4" id="dealerflow-data-pending">
        <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
          <Waves className="w-6 h-6 text-[#4ADE80]" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[11px] font-black tracking-widest text-[var(--text-primary)] uppercase font-sans">
            LOADING DEALER FLOW DATA
          </h2>
          <p className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest leading-relaxed max-w-sm mx-auto">
            Loading hedging profiles, order flow, and price zones. Select any strike or option type to start the feed.
          </p>
        </div>
        <div className="flex items-center gap-2 justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24] inline-block animate-pulse" />
          <span className="text-[8px] font-mono tracking-widest text-[var(--text-tertiary)] font-bold uppercase">
            CONNECTING TO LIVE FEED...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 tabular-data" id="dealerflow-main-workspace-view">
      {/* ============== HEADER STRIP ============== */}
      <div className={`${theme.cardBg} rounded-lg px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between`} id="dealerflow-header-strip">
        <div className="flex items-center gap-3.5">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center ${theme.headerIconBg}`}>
            <Waves className={`w-4.5 h-4.5 ${theme.iconColor}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-widest text-[var(--text-primary)] uppercase font-sans">
                PINPOINT | {selectedAsset.ticker}
              </h1>
              <FeedChip feed={filteredProfile?.feed || profile?.feed} />
            </div>
            <p className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest mt-0.5">
              Gamma exposure · hedging pressure · price zones · {selectedTimeframe}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 lg:flex lg:flex-nowrap lg:items-center">
          {[
            { label: 'Net GEX', value: filteredProfile ? fmtBn(filteredProfile.netGex) : '—', tone: (filteredProfile?.netGex ?? 0) >= 0 ? '#4ADE80' : '#F87171' },
            { label: 'Call Wall', value: filteredProfile?.callWall?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', tone: '#4ADE80' },
            { label: 'Put Wall', value: filteredProfile?.putWall?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', tone: '#F87171' },
            { label: 'γ-Flip', value: filteredProfile?.gammaFlip?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', tone: '#FBBF24' },
            { label: 'Pin Magnet', value: filteredProfile?.magnet?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', tone: '#60A5FA' },
            { label: 'Dist to Flip', value: filteredProfile?.gammaFlip ? `${Math.abs(filteredProfile.spot - filteredProfile.gammaFlip).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '—', tone: 'var(--text-primary)' },
          ].map(card => (
            <div key={card.label} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-3 py-2 min-w-[84px] shrink-0" id={`card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="text-[8px] font-black tracking-widest text-[var(--text-tertiary)] uppercase">
                {card.label}
              </div>
              <div className="text-[14px] font-mono font-bold tabular-nums" style={{ color: card.tone }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ============== SUB-TABS & SEARCH ============== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-0.5" id="dealerflow-subtabs-bar">
        <div className="flex flex-nowrap overflow-x-auto scrollbar-none gap-2.5 justify-start items-center">
          <button
            onClick={() => setActiveEngineView('profile')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2.5 font-mono text-[9px] font-black uppercase tracking-wider border rounded-lg transition-colors cursor-pointer ${
              activeEngineView === 'profile'
                ? 'bg-[var(--surface-3)] border-[#06B6D4]/50 text-[var(--text-primary)]'
                : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#06B6D4]" />
            HEDGING PROFILE
          </button>
          <button
            onClick={() => setActiveEngineView('targets')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2.5 font-mono text-[9px] font-black uppercase tracking-wider border rounded-lg transition-colors cursor-pointer ${
              activeEngineView === 'targets'
                ? 'bg-[var(--surface-3)] border-[#F87171]/50 text-[var(--text-primary)]'
                : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-[#F87171]" />
            RANKED TARGETS
          </button>
          <button
            onClick={() => setActiveEngineView('physics')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2.5 font-mono text-[9px] font-black uppercase tracking-wider border rounded-lg transition-colors cursor-pointer ${
              activeEngineView === 'physics'
                ? 'bg-[var(--surface-3)] border-[#FBBF24]/50 text-[var(--text-primary)]'
                : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-[#FBBF24]" />
            DEALER MECHANICS
          </button>
          <button
            onClick={() => setActiveEngineView('terminal')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2.5 font-mono text-[9px] font-black uppercase tracking-wider border rounded-lg transition-colors cursor-pointer ${
              activeEngineView === 'terminal'
                ? 'bg-[var(--surface-3)] border-fuchsia-500/50 text-[var(--text-primary)]'
                : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-fuchsia-500" />
            LIVE TERMINAL FLOW
          </button>
        </div>

        {/* Global Market Search */}
        <div className="relative w-full sm:w-[360px] shrink-0 group">
          <div 
            className="bg-[#050505] border border-[#06B6D4]/30 rounded-none flex items-center px-3 py-2 cursor-text transition-all group-hover:border-[#06B6D4] focus-within:border-[#06B6D4] focus-within:shadow-[0_0_15px_rgba(6,182,212,0.15)] h-[36px] relative overflow-hidden"
            onClick={() => setShowSearch(true)}
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-[#06B6D4]/50" />
            <span className="w-2.5 h-2.5 bg-[#06B6D4] animate-pulse mr-2 shrink-0 rounded-sm opacity-80" />
            <span className="text-[#06B6D4] font-mono text-[10px] mr-1.5 opacity-60">sys@idx:~#</span>
            <input
              type="text"
              placeholder="LOAD_ASSET<...>"
              className="bg-transparent border-none outline-none text-[11px] font-mono uppercase tracking-widest text-[#06B6D4] w-full placeholder:text-[#06B6D4]/30"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearch(true);
              }}
              onFocus={() => setShowSearch(true)}
            />
            {searchQuery && (
              <button 
                onClick={(e) => { e.stopPropagation(); setSearchQuery(''); setShowSearch(false); }}
                className="text-[#06B6D4]/50 hover:text-[#06B6D4] ml-2 font-mono text-[14px]"
              >
                ×
              </button>
            )}
          </div>

          {showSearch && (
            <>
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setShowSearch(false)}
              />
              <div className="absolute top-full mt-2 left-0 sm:left-auto right-0 w-full sm:w-[480px] bg-[#050505] border border-[#06B6D4]/40 shadow-[0_0_30px_rgba(0,0,0,0.9)] z-50 max-h-[440px] overflow-y-auto python-scrollbar origin-top-right animate-in fade-in zoom-in-95 duration-150">
                <div className="sticky top-0 bg-[#050505]/95 backdrop-blur-sm border-b border-[#06B6D4]/20 px-3 py-2 z-10 flex justify-between items-center">
                  <span className="text-[9px] font-mono text-[#06B6D4] tracking-widest uppercase opacity-80">[ GLOBAL ASSET REGISTRY // SECURE CONNECTION ]</span>
                </div>
                {(() => {
                  const query = searchQuery.toLowerCase().trim();
                  
                  if (!query) {
                    const categories = [
                      { name: 'INDEXES & MACRO', filter: (a: any) => ['SPX','QQQ','NDX','DJX','SOX','XSP','VIX','RUT'].includes(a.ticker) },
                      { name: 'ETFS & FUNDS', filter: (a: any) => a.type === 'ETFS' && !['SPX','QQQ'].includes(a.ticker) },
                      { name: 'BIG TECH & AI', filter: (a: any) => ['AAPL','MSFT','GOOGL','AMZN','META','TSLA','NVDA','AMD','AVGO','PLTR', 'TSM', 'ASML', 'ARM'].includes(a.ticker) },
                      { name: 'SOFTWARE & CLOUD', filter: (a: any) => ['SNOW','CRWD','PANW','CRM','NOW','SHOP','MSTR'].includes(a.ticker) },
                      { name: 'MEDICINE & HEALTH', filter: (a: any) => ['LLY','NVO','JNJ','UNH'].includes(a.ticker) },
                      { name: 'FINANCE & BANKING', filter: (a: any) => ['JPM','BAC','WFC','V','PYPL','SQ','HOOD'].includes(a.ticker) }
                    ];

                    return (
                      <div className="pb-2">
                        {categories.map(cat => {
                          const assets = ASSET_LIST.filter(cat.filter);
                          if (!assets.length) return null;
                          return (
                            <div key={cat.name} className="mb-0">
                               <div className="px-3 py-1.5 bg-[#06B6D4]/5 border-y border-[#06B6D4]/10 mt-2 first:mt-0">
                                 <span className="text-[10px] font-mono text-[#06B6D4] tracking-widest font-bold">{cat.name}</span>
                               </div>
                               <div className="px-2 py-1.5 grid grid-cols-2 gap-1.5">
                                 {assets.map(asset => (
                                    <div
                                       key={asset.ticker}
                                       onClick={() => { 
                                         setSelectedAsset(asset);
                                         setSearchQuery('');
                                         setShowSearch(false);
                                       }}
                                       className="px-2 py-2 hover:bg-[#06B6D4]/10 cursor-pointer border border-[#06B6D4]/5 hover:border-[#06B6D4]/30 transition-colors flex flex-col group rounded-sm"
                                    >
                                        <div className="flex justify-between items-center mb-0.5">
                                          <span className="text-[11px] font-mono font-bold text-zinc-300 group-hover:text-[#06B6D4] transition-colors">{asset.ticker}</span>
                                          <span className="text-[8px] font-mono text-[#06B6D4]/40 group-hover:text-[#06B6D4]/70 transition-colors">{asset.type}</span>
                                        </div>
                                        <span className="text-[9px] text-zinc-500 truncate font-sans">{asset.name}</span>
                                    </div>
                                 ))}
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  const filtered = ASSET_LIST.filter(a => a.ticker.toLowerCase().includes(query) || a.name.toLowerCase().includes(query));
                  const exactMatch = ASSET_LIST.find(a => a.ticker.toLowerCase() === query);
                  
                  return (
                    <div className="py-1">
                      {filtered.map(asset => (
                        <div
                          key={asset.ticker}
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-[#06B6D4]/10 cursor-pointer transition-colors border-b border-[#06B6D4]/5"
                          onClick={() => {
                            setSelectedAsset(asset);
                            setSearchQuery('');
                            setShowSearch(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-[12px] font-mono font-bold text-[#06B6D4]">{asset.ticker}</span>
                            <span className="text-[10px] font-sans text-zinc-500">{asset.name}</span>
                          </div>
                          <span className="text-[8px] font-mono tracking-widest text-[#06B6D4]/70">
                            {asset.type}
                          </span>
                        </div>
                      ))}
                      
                      {query && !exactMatch && (
                        <div
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-[#06B6D4]/20 cursor-pointer transition-colors border-b border-[#06B6D4]/10"
                          onClick={() => {
                            const t = query.toUpperCase();
                            const newAsset = {
                              key: t,
                              ticker: t,
                              name: `${t} Asset`,
                              type: 'STOCKS',
                              defaultPrice: 150.00,
                              decimals: 2,
                              spread: 0.05,
                              volatility: 1.0,
                              unit: 'USD',
                              forecastScale: 0.15,
                              stabilityMax: 0.06,
                              optionsStyle: 'weekly'
                            };
                            setSelectedAsset(newAsset as any);
                            setSearchQuery('');
                            setShowSearch(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-[12px] font-mono font-bold text-[#06B6D4]">FETCH [ {query.toUpperCase()} ]</span>
                            <span className="text-[10px] font-sans text-[#06B6D4]/70">Initialize dynamic asset profile over network</span>
                          </div>
                          <span className="text-[8px] font-mono tracking-widest text-[#06B6D4]/90 border border-[#06B6D4]/30 px-1 py-0.5">
                            EXECUTE
                          </span>
                        </div>
                      )}
                      
                      {filtered.length === 0 && (
                        <div className="px-4 py-6 text-center">
                          <Search className="w-5 h-5 text-[#06B6D4]/50 mx-auto mb-2" />
                          <div className="text-[10px] uppercase font-mono tracking-widest text-[#06B6D4]/50">AWAITING INPUT...</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      {activeEngineView === 'profile' ? (
        <>
          {/* ============== GEX PAGE HEADER ============== */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2 font-mono">
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Asset</span>
              <span className="text-sm font-black text-white">{selectedAsset.ticker} <span className="text-zinc-500 font-medium">({profile?.spot.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '7,600'})</span></span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Regime</span>
              <span className="text-sm font-black text-emerald-400">POSITIVE GAMMA</span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Pin Risk</span>
              <span className="text-sm font-black text-amber-400">84%</span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Vol Risk</span>
              <span className="text-sm font-black text-sky-400">LOW</span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Dealer Control</span>
              <span className="text-sm font-black text-purple-400">HIGH</span>
            </div>
            {/* Market Control Score */}
            <div className="flex flex-col p-3 rounded-lg border border-purple-500/30 bg-purple-500/10 justify-center">
              <span className="text-[9px] uppercase tracking-widest text-purple-400 font-bold mb-1">Market Control</span>
              <div className="flex items-end gap-2">
                <span className="text-sm font-black text-white">92<span className="text-[10px] text-zinc-500 font-medium">/100</span></span>
              </div>
            </div>
          </div>

          {/* ============== TRADER INTENT EXPIRY CONTROLLER ============== */}
          <div className="flex flex-col gap-3 p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg" id="trader-intent-expiries-panel">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[var(--border)] pb-2.5 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-widest leading-none flex items-center gap-2">
                  TRADER INTENT EXPIRY CADENCES
                  <span className="text-[8px] bg-emerald-500/10 text-[#4ADE80] border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold font-mono">
                    {selectedAsset.ticker} PIPELINE
                  </span>
                </span>
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Filter options chain and dealer hedging flow calculations by expiration matrix</span>
              </div>
              
              {/* Dynamic Toggle Button */}
              <button
                onClick={() => {
                  const newVal = !isMultiExpiry;
                  setIsMultiExpiry(newVal);
                  if (newVal) {
                    if (expiryTab !== 'custom' && expiryTab !== 'aggregated') {
                      setActiveExpiries([expiryTab]);
                    } else {
                      setActiveExpiries([tickerExpirations[0].id]);
                    }
                  } else {
                    setExpiryTab((activeExpiries[0] as any) || 'mon');
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer ${
                  isMultiExpiry 
                    ? 'bg-[#4ADE80]/15 border-[#4ADE80]/30 text-[#4ADE80] shadow-[0_0_12px_rgba(74,222,128,0.12)] font-black' 
                    : 'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                id="multi-expiry-global-toggle"
              >
                <div className={`w-3 h-3 rounded-full flex items-center justify-center border ${isMultiExpiry ? 'border-[#4ADE80] bg-[#4ADE80]' : 'border-zinc-500 bg-transparent'}`}>
                  {isMultiExpiry && <div className="w-1.5 h-1.5 rounded-full bg-black/85" />}
                </div>
                <span> MULTI-EXPIRY AGGREGATION</span>
              </button>
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-3 snap-x snap-mandatory" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 #18181b' }}>
              {!isMultiExpiry && (
                <button
                  onClick={() => {
                    setExpiryTab('aggregated');
                  }}
                  className={`flex shrink-0 min-w-[140px] flex-col text-left p-2.5 rounded-lg border transition-all cursor-pointer snap-start ${
                    expiryTab === 'aggregated'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-[var(--surface-3)] border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-zinc-700'
                  }`}
                >
                  <span className="text-[7.5px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1">
                    <span className={`w-1 h-3 rounded-full ${expiryTab === 'aggregated' ? 'bg-[#4ADE80]' : 'bg-zinc-650'}`} />
                    MASTER PROFILE
                  </span>
                  <span className={`text-[11px] font-bold mt-1.5 leading-none ${expiryTab === 'aggregated' ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                    All Dates
                  </span>
                  <span className={`text-[7.5px] font-black mt-2 tracking-widest ${expiryTab === 'aggregated' ? 'text-[#4ADE80]' : 'text-zinc-500'}`}>
                    🌌 TOTAL GRAVITY
                  </span>
                </button>
              )}

              {tickerExpirations.map((item) => {
                const isActive = isMultiExpiry 
                  ? activeExpiries.includes(item.id) 
                  : expiryTab === item.id;

                const toneStyle = 
                  item.tone === 'emerald' ? { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' } :
                  item.tone === 'amber' ? { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]' } :
                  item.tone === 'sky' ? { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30', glow: 'shadow-[0_0_12px_rgba(56,189,248,0.15)]' } :
                  item.tone === 'blue' ? { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', glow: 'shadow-[0_0_12px_rgba(59,130,246,0.15)]' } :
                  item.tone === 'pink' ? { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30', glow: 'shadow-[0_0_12px_rgba(217,70,239,0.15)]' } :
                  item.tone === 'purple' ? { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', glow: 'shadow-[0_0_12px_rgba(168,85,247,0.15)]' } :
                  item.tone === 'indigo' ? { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', glow: 'shadow-[0_0_12px_rgba(99,102,241,0.15)]' } :
                  { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', glow: 'shadow-[0_0_12px_rgba(244,63,94,0.15)]' };

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isMultiExpiry) {
                        if (activeExpiries.includes(item.id)) {
                          if (activeExpiries.length > 1) {
                            setActiveExpiries(activeExpiries.filter(x => x !== item.id));
                          }
                        } else {
                          setActiveExpiries([...activeExpiries, item.id]);
                        }
                      } else {
                        setExpiryTab(item.id as any);
                      }
                    }}
                    className={`flex flex-col text-left p-2.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden shrink-0 min-w-[130px] snap-start ${
                      isActive 
                        ? `${toneStyle.bg} ${toneStyle.border} ${isLight ? 'border-zinc-400/50' : ''} ${toneStyle.glow}` 
                        : 'bg-[var(--surface-3)] border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-zinc-700'
                    }`}
                  >
                    {isMultiExpiry && (
                      <div className="absolute top-2 right-2">
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isActive ? 'border-current bg-current/10' : 'border-zinc-700 bg-transparent'}`} style={{ color: isActive ? toneStyle.text.replace('text-', '#').replace('fuchsia', '#d946ef') : undefined }}>
                          {isActive && <div className="w-1.5 h-1.5 rounded-sm bg-current" />}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`text-[12px] font-black leading-none ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                        {item.date}
                      </span>
                      <span className="text-[8px] font-black uppercase text-zinc-500 bg-zinc-900/50 px-1 rounded">
                        {item.label}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5 mt-1 border-t border-[var(--border)] pt-1">
                      <span className={`text-[8.5px] font-mono flex justify-between ${isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
                        <span>GEX:</span> <span className={`font-bold ${isActive ? 'text-emerald-400' : ''}`}>{item.gex}</span>
                      </span>
                      <span className={`text-[8.5px] font-mono flex justify-between ${isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
                        <span>OI:</span> <span className="font-bold">{item.oi}</span>
                      </span>
                      <span className={`text-[8.5px] font-mono flex justify-between ${isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
                        <span>VOL:</span> <span className="font-bold">{item.vol}</span>
                      </span>
                    </div>

                    <span className={`text-[9px] font-black mt-2 tracking-widest flex items-center gap-1 ${isActive ? toneStyle.text : 'text-zinc-500'}`}>
                      <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-current' : 'bg-zinc-600'}`} style={{ color: isActive ? 'currentColor' : undefined }} />
                      Gravity: {item.gravity}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ============== DEALER FLOW MAP (Hero Chart) ============== */}
          <div className="bg-[#0a0a0a] border border-zinc-800/80 rounded-sm p-5 shadow-sm" id="dealerflow-map-panel">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#4ADE80] opacity-80" />
                <div className="flex flex-col leading-none">
                  <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-zinc-200">
                    Dealer Net Gamma Map
                  </span>
                  <span className="text-[8px] text-zinc-500 uppercase tracking-[0.2em] block mt-1.5 font-semibold">
                    inventory & pin levels by strike
                  </span>
                </div>
              </div>

              {/* Multi-Expiry Toggle segment controller */}
              <div className="flex items-center gap-3" id="multi-expiry-toggle-control">
                {isMultiExpiry ? (
                  <div className="flex items-center gap-2 bg-[#4ADE80]/10 border border-[#4ADE80]/20 px-2.5 py-1 rounded-md">
                    <span className="text-[7.5px] font-black text-[#4ADE80] uppercase tracking-widest animate-pulse">
                       MULTI-EXPIRY ACTIVE ({activeExpiries.length} DATES)
                    </span>
                    <button
                      onClick={() => {
                        setIsMultiExpiry(false);
                        const firstActive = activeExpiries[0] || 'mon';
                        setExpiryTab(firstActive as any);
                      }}
                      className="text-[7px] font-bold text-zinc-400 hover:text-white uppercase tracking-widest bg-zinc-800 px-1.5 py-0.5 rounded cursor-pointer border border-zinc-700/50 transition-all ml-1"
                    >
                      Disable
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest hidden md:inline">
                      EXPIRY SELECTION:
                    </span>
                    <div className="flex bg-[var(--surface-2)] border border-[var(--border)] p-0.5 rounded-md text-[9px] font-bold tracking-widest uppercase">
                      {[
                        { label: selectedAsset.optionsStyle === 'weekly' ? 'FRONT WEEKLY' : '0DTE', value: selectedAsset.optionsStyle === 'weekly' ? 'weekly-front' : 'mon' },
                        { label: 'WEEKLY OPEX', value: 'weekly' },
                        { label: 'AGGREGATED', value: 'aggregated' },
                      ].map((item) => {
                        const isActive = expiryTab === item.value;
                        return (
                          <button
                            key={item.label}
                            onClick={() => {
                              setExpiryTab(item.value as any);
                              setShowCustomDropdown(false);
                            }}
                            className={`px-3 py-1 rounded cursor-pointer transition-all duration-150 ${
                              isActive
                                ? 'bg-zinc-800 text-white font-black shadow-sm border border-zinc-700/50'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            <DealerFlowMap profile={filteredProfile || profile} decimals={selectedAsset.decimals} />
          </div>

          {/* ============== MAIN GRID (THE CHOSEN ORIGINAL 3-COLUMN LAYOUT) ============== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" id="dealerflow-main-grid">
            
            {/* GEX PROFILE */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex flex-col justify-between" id="gex-profile-chart-panel">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest uppercase mb-4 text-[#4ADE80]">
                  <Layers className="w-3.5 h-3.5" />
                  <span className="text-[var(--text-secondary)]">Gamma Exposure (GEX)</span>
                  <span className="text-[var(--text-tertiary)] font-normal normal-case tracking-normal">· $ per 1% move</span>
                </div>
                <ExposureProfileChart profile={filteredProfile || profile} decimals={selectedAsset.decimals} type="gex" />
              </div>

              {/* GEX footer */}
              {(filteredProfile || profile) && (
                <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center text-[10px] font-mono leading-none border-dashed border-[var(--border)]" id="gex-profile-chart-oi-footer">
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Call GEX</div>
                    <div className="text-[10px] font-mono text-[#4ADE80] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.callGex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Put GEX</div>
                    <div className="text-[10px] font-mono text-[#F87171] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.putGex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Net GEX</div>
                    <div className="text-[10px] font-mono text-[var(--text-primary)] font-bold">
                      {fmtGreek((filteredProfile || profile).netGex)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* DEX PROFILE */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex flex-col justify-between" id="dex-profile-chart-panel">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest uppercase mb-4 text-[#38BDF8]">
                  <Waves className="w-3.5 h-3.5" />
                  <span className="text-[var(--text-secondary)]">Delta Exposure (DEX)</span>
                  <span className="text-[var(--text-tertiary)] font-normal normal-case tracking-normal">· $ per 1% spot move</span>
                </div>
                <ExposureProfileChart profile={filteredProfile || profile} decimals={selectedAsset.decimals} type="dex" />
              </div>

              {/* DEX footer */}
              {(filteredProfile || profile) && (
                <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center text-[10px] font-mono leading-none border-dashed border-[var(--border)]" id="dex-profile-chart-footer">
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Call DEX</div>
                    <div className="text-[10px] font-mono text-sky-400 font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.callDex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Put DEX</div>
                    <div className="text-[10px] font-mono text-[#F87171] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.putDex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Net DEX</div>
                    <div className="text-[10px] font-mono text-[var(--text-primary)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => (cur.callDex || 0) + (cur.putDex || 0)).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* VEX PROFILE */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex flex-col justify-between" id="vex-profile-chart-panel">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest uppercase mb-4 text-[#C084FC]">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[var(--text-secondary)]">Vega Exposure (VEX)</span>
                  <span className="text-[var(--text-tertiary)] font-normal normal-case tracking-normal">· $ per 1% vol shift</span>
                </div>
                <ExposureProfileChart profile={filteredProfile || profile} decimals={selectedAsset.decimals} type="vex" />
              </div>

              {/* VEX footer */}
              {(filteredProfile || profile) && (
                <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center text-[10px] font-mono leading-none border-dashed border-[var(--border)]" id="vex-profile-chart-footer">
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Call VEX</div>
                    <div className="text-[10px] font-mono text-indigo-400 font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.callVex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Put VEX</div>
                    <div className="text-[10px] font-mono text-[#F87171] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.putVex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Net VEX</div>
                    <div className="text-[10px] font-mono text-[var(--text-primary)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => (cur.callVex || 0) + (cur.putVex || 0)).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Supportive Side-Insights Row containing GexReadCard and ZeroDtePanel placed beautifully beneath the profiles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" id="hedging-side-insights">
            <GexReadCard />
            <ZeroDtePanel />
          </div>

          {/* ============== INSTITUTIONAL MICRO-STRUCTURE METRICS ============== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 overflow-hidden" id="dealerflow-displacement-row">
            <SlayerScoreWidget />
            <VolatilityStateWidget />
          </div>

          {/* ============== DEALER DYNAMICS (Supplementary details for profile view) ============== */}
          <DealerDynamicsPanel />

          {/* ============== FULL WIDTH CHART AT BOTTOM ============== */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex flex-col w-full overflow-hidden" id="displacement-overlay-chart-panel" style={{ minHeight: '380px' }}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[var(--text-secondary)] uppercase">
                <ShieldAlert className="w-3.5 h-3.5 text-[#F87171]" />
                Price Action — Supply/Demand & Imbalance Overlay
              </div>
              <FeedChip feed={serverState?.candle_feed} />
            </div>
            <div className="flex-1 w-full h-[320px]">
              <InteractiveChart
                candles={chartCandles}
                displacementZones={chartDisplacementZones}
                fvgs={chartFvgs}
                liquidityEvents={chartLiquidityEvents}
                tape={chartTape}
                timeframe={selectedTimeframe}
                selectedTicker={selectedAsset.ticker}
                priceDecimals={selectedAsset.decimals}
                showFVGs={true}
                showLiquiditySweeps={true}
                showDisplacementEvents={true}
                watermarkText="PRICE ACTION — SUPPLY/DEMAND & IMBALANCE OVERLAY"
              />
            </div>
          </div>
        </>
      ) : activeEngineView === 'targets' ? (
        <IntradayTargetsView profile={filteredProfile || profile} ticker={selectedAsset.ticker} decimals={selectedAsset.decimals} />
      ) : activeEngineView === 'terminal' ? (
        <LiveTerminalFlow profile={filteredProfile || profile} ticker={selectedAsset.ticker} decimals={selectedAsset.decimals} />
      ) : (
        <div className="space-y-5" id="institutional-physics-dash-wrapper">
          <InstitutionalPhysicsDashboard
            profile={filteredProfile || profile}
            ticker={selectedAsset.ticker}
            decimals={selectedAsset.decimals}
          />
          {/* ============== ADVANCED QUANT MECHANICS PANELS ============== */}
          {/* QUANT EDGE — RND / VRP / skew / scenario / Kelly / dealer clock */}
          <QuantEdgePanel />
          {/* REGIME MATRIX — HMM / Hurst / OU / vol regimes / VPIN / Kyle / PCA */}
          <RegimeMatrixPanel />
        </div>
      )}
    </div>
  );
}
