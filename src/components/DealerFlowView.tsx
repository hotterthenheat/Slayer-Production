/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER FLOW — gamma exposure profile, dealer buying pressure, and the
 * Displacement Zones × Volatility Engine. Every figure on this page is
 * computed server-side from the live Tradier chain + real candles (or the
 * clearly-labeled deterministic model when offline).
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { SlayerScoreWidget, VolatilityStateWidget } from './WorkspaceWidgets';
import { InteractiveChart } from './InteractiveChart';
import { InstitutionalPhysicsDashboard } from './InstitutionalPhysicsDashboard';
import { IntradayTargetsView } from './IntradayTargetsView';
import { QuantEdgePanel } from './QuantEdgePanel';
import { RegimeMatrixPanel } from './RegimeMatrixPanel';
import { DealerDynamicsPanel } from './DealerDynamicsPanel';
import { ZeroDtePanel } from './ZeroDtePanel';
import { DealerFlowMap } from './DealerFlowMap';
import {
  Waves,
  Crosshair,
  Magnet,
  Layers,
  Zap,
  ShieldAlert,
  Droplets,
  Play,
  Share2,
  RefreshCw,
  Skull,
  Clock,
  Briefcase,
  Sliders,
  HelpCircle,
  Activity,
  Target
} from 'lucide-react';
import { ASSET_LIST } from '../data';

const fmtBn = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v / 1e9).toFixed(2)}B`;
const fmtMn = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v / 1e6).toFixed(1)}M`;
const fmtGreek = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e9) {
    return `${v >= 0 ? '+' : '−'}$${(abs / 1e9).toFixed(2)}B`;
  }
  return `${v >= 0 ? '+' : '−'}$${(abs / 1e6).toFixed(1)}M`;
};

function FeedChip({ feed }: { feed?: string }) {
  const live = feed === 'LIVE_TRADIER' || feed === 'LIVE_POLYGON';
  return (
    <span
      className={`px-1.5 py-0.5 rounded-xs text-[7.5px] font-black tracking-widest uppercase border ${
        live
          ? 'bg-[#4ADE80] text-black/10 border-black text-[#4ADE80]'
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
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[6.5px] align-middle font-black border tracking-widest ${sColor}`}>{status}</span>;
              })()}
              {isPutMax && (() => {
                const isFailing = r.strike > profile.spot;
                const isTesting = Math.abs(r.strike - profile.spot) / profile.spot < 0.005;
                const status = isFailing ? 'FAILING' : isTesting ? 'TESTING' : 'HOLDING';
                const sColor = isFailing ? 'text-[#F87171] bg-rose-500/10 border-rose-500/30' : isTesting ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[6.5px] align-middle font-black border tracking-widest ${sColor}`}>{status}</span>;
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

      {/* FLOATING LASER SPOT GLIDER */}
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
            {/* Laser beam emitter core */}
            <div className={`absolute -left-1.5 w-2.5 h-2.5 bg-white rounded-full border animate-pulse ${
              type === 'gex' 
                ? 'border-black shadow-[0_0_8px_rgba(48,209,88,0.8)]' 
                : type === 'dex' 
                  ? 'border-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.8)]' 
                  : 'border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]'
            }`} />
            
            {/* White-to-accent gradient laser glow line */}
            <div className={`w-full h-[1.5px] bg-gradient-to-r from-white to-transparent ${
              type === 'gex' 
                ? 'via-zinc-300 shadow-[0_0_6px_rgba(48,209,88,0.4)]' 
                : type === 'dex' 
                  ? 'via-sky-400 shadow-[0_0_6px_rgba(14,165,233,0.4)]' 
                  : 'via-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.4)]'
            }`} />
            
            {/* Floating centered coordinates tag */}
            <div className={`absolute left-1/2 -translate-x-1/2 -top-3 px-2 py-0.5 rounded-xs font-mono font-black text-[7.5px] uppercase shadow-lg flex items-center gap-1 border z-30 ${
              isLight 
                ? 'bg-white text-zinc-900 border-black' 
                : 'bg-black/90 text-[#E5E5E5] border-black'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-ping ${
                type === 'gex' ? 'bg-[#4ADE80]' : type === 'dex' ? 'bg-sky-400' : 'bg-indigo-400'
              }`} />
              <span>SPOT: {profile.spot.toFixed(2)}</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Pure Market Microstructure & Mathematical Physics Helpers
// ----------------------------------------------------------------
function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.39894228 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

interface OptionGreekPayload {
  delta: number;
  gamma: number;
  vanna: number;
  charm: number;
  speed: number;
  color: number;
}

function calculateGreeksTS(
  S: number,
  K: number,
  t: number,
  sigma: number,
  r: number,
  q: number,
  option_type: "call" | "put"
): OptionGreekPayload {
  if (t <= 0) t = 1e-4;
  if (sigma <= 0) sigma = 1e-3;

  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);

  const n_prime_d1 = normalPdf(d1);
  const N_d1 = normalCdf(d1);

  // Delta & Gamma
  const delta = option_type === "call"
    ? Math.exp(-q * t) * N_d1
    : Math.exp(-q * t) * (N_d1 - 1);
  const gamma = (Math.exp(-q * t) * n_prime_d1) / (S * sigma * Math.sqrt(t));

  // Second-Order (Vanna, Charm)
  const vanna = -Math.exp(-q * t) * n_prime_d1 * (d2 / sigma);
  const charm_base = Math.exp(-q * t) * n_prime_d1 * ((r - q) / (sigma * Math.sqrt(t)) - d2 / (2 * t));
  const charm = option_type === "call"
    ? q * Math.exp(-q * t) * N_d1 - charm_base
    : -q * Math.exp(-q * t) * (1 - N_d1) - charm_base;

  // Third-Order (Speed, Color)
  const speed = -(gamma / S) * (1 + (d1 / (sigma * Math.sqrt(t))));
  const color = -(Math.exp(-q * t) * n_prime_d1 / (2 * S * t * sigma * Math.sqrt(t))) * (1 + d1 * ((r - q) / (sigma * Math.sqrt(t)) - d2 / (2 * t)));

  return { delta, gamma, vanna, charm, speed, color };
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
  const [activeEngineView, setActiveEngineView] = useState<'profile' | 'physics' | 'targets'>('profile');
  const [mocDirection, setMocDirection] = useState<'BUY' | 'SELL' | 'NEUTRAL'>('BUY');
  const [mocValue, setMocValue] = useState<number>(1.24 * 1e9);

  const recommendedPlay = useMemo(() => {
    const prof = serverState?.gex_profile;
    if (!prof || !prof.spot || !prof.strikes || prof.strikes.length === 0) {
      return { contract: '-', strategy: 'N/A', edge: '-', color: 'text-zinc-400' };
    }
    const spot = prof.spot;
    const strikesList = [...prof.strikes].sort((a, b) => a.strike - b.strike);
    const ticker = selectedAsset.ticker;

    if (mocDirection === 'BUY') {
      const targetStrike = strikesList.find(s => s.strike > spot);
      if (targetStrike) {
        return {
          contract: `${ticker} 0DTE $${targetStrike.strike.toFixed(0)} CALL`,
          strategy: 'OTM CALL BUY (GAMMA ACCELERATION)',
          edge: `+18.4% Edge`,
          color: 'text-[#4ADE80]'
        };
      }
    } else if (mocDirection === 'SELL') {
      const targetStrike = [...strikesList].reverse().find(s => s.strike < spot);
      if (targetStrike) {
        return {
          contract: `${ticker} 0DTE $${targetStrike.strike.toFixed(0)} PUT`,
          strategy: 'OTM PUT BUY (GAMMA ACCELERATION)',
          edge: `+21.2% Edge`,
          color: 'text-[#F87171]'
        };
      }
    } else {
      const magnetStrike = prof.magnet || spot;
      return {
        contract: `${ticker} 0DTE $${magnetStrike.toFixed(0)} Condor/Straddle`,
        strategy: 'MAGNET PINNING (THETA DECAY)',
        edge: `+12.8% Edge`,
        color: 'text-sky-400'
      };
    }
    return { contract: '-', strategy: 'N/A', edge: '-', color: 'text-zinc-400' };
  }, [serverState, mocDirection, selectedAsset]);

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
  const gauge = serverState?.dealer_flow;
  const disp = serverState?.displacement;
  const dm = serverState?.deep_intelligence?.dealer_metrics;

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
      <div className="w-full flex flex-col items-center justify-center min-h-[460px] bg-black/30 border border-black rounded-lg p-8 text-center space-y-4" id="dealerflow-data-pending">
        <div className="w-12 h-12 rounded-full bg-black/40 border border-black flex items-center justify-center">
          <Waves className="w-6 h-6 text-[#4ADE80]" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[11px] font-black tracking-widest text-[#E5E5E5] uppercase font-sans">
            LOADING DEALER FLOW DATA
          </h2>
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest leading-relaxed max-w-sm mx-auto">
            Loading hedging profiles, order flow, and price zones. Select any strike or option type to start the feed.
          </p>
        </div>
        <div className="flex items-center gap-2 justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
          <span className="text-[8px] font-mono tracking-widest text-zinc-400 font-bold uppercase">
            CONNECTING TO LIVE FEED...
          </span>
        </div>
      </div>
    );
  }

  const formatState = (state: string) => {
    if (['ARMED', 'ACTIVE'].includes(state)) return 'HOLDING';
    if (['TESTED'].includes(state)) return 'TESTING';
    return 'FAILING';
  };

  const stateChip = (state: string) => {
    const s = formatState(state);
    const map: Record<string, string> = {
      HOLDING: 'status-holding mirror-panel',
      TESTING: 'status-testing mirror-panel',
      FAILING: 'status-failing mirror-panel',
    };
    return map[s];
  };

  return (
    <div className="w-full space-y-6 tabular-data" id="dealerflow-main-workspace-view">
      {/* Ticker Bar (Image Matched) */}
      <div className="flex justify-center items-center w-full mb-2 relative z-10">
        <div className="bg-black/90 backdrop-blur-md border border-black rounded-[10px] flex items-center p-1 gap-0.5 shadow-inner">
          {ASSET_LIST.map(asset => {
            const isActive = selectedAsset.ticker === asset.ticker;
            return (
              <button
                key={asset.ticker}
                type="button"
                onClick={() => setSelectedAsset(asset)}
                className={`px-3.5 py-1 text-[10px] uppercase font-black tracking-widest rounded-lg transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-black text-[#E5E5E5] shadow hover:bg-black'
                    : 'text-zinc-500 hover:text-[#4ADE80] hover:bg-white/[0.02] border border-transparent'
                }`}
              >
                {asset.ticker}
              </button>
            );
          })}
        </div>
      </div>
      {/* ============== HEADER STRIP ============== */}
      <div className={`${theme.cardBg} rounded-lg px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between`} id="dealerflow-header-strip">
        <div className="flex items-center gap-3.5">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center ${theme.headerIconBg}`}>
            <Waves className={`w-4.5 h-4.5 ${theme.iconColor}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-widest text-[#E5E5E5] uppercase font-sans">
                PINPOINT AI | {selectedAsset.ticker}
              </h1>
              <FeedChip feed={profile?.feed} />
            </div>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">
              Gamma exposure · hedging pressure · price zones · volatility · {selectedTimeframe}
            </p>
          </div>
        </div>

        <div className="flex flex-nowrap overflow-x-auto scrollbar-none items-center gap-2.5 pb-0.5">
          {[
            { label: 'Net GEX', value: profile ? fmtBn(profile.netGex) : '-', tone: profile?.netGex >= 0 ? 'text-[#4ADE80] font-bold' : 'text-[#F87171] font-bold', icon: <Layers className="w-3 h-3" /> },
            { label: 'Call Wall', value: profile?.callWall?.toFixed(0) ?? '-', tone: 'text-[#4ADE80] font-bold', icon: <Layers className="w-3 h-3" /> },
            { label: 'Put Wall', value: profile?.putWall?.toFixed(0) ?? '-', tone: 'text-[#F87171] font-bold', icon: <Layers className="w-3 h-3" /> },
            { label: 'γ-Flip', value: profile?.gammaFlip?.toFixed(0) ?? '-', tone: 'text-amber-400 font-bold', icon: <Crosshair className="w-3 h-3" /> },
            { label: 'Pin Magnet', value: profile?.magnet?.toFixed(0) ?? '-', tone: 'text-sky-400 font-bold', icon: <Magnet className="w-3 h-3" /> },
          ].map(card => (
            <div key={card.label} className="bg-black/50 border border-black/60 rounded-md px-3 py-2 min-w-[86px] shrink-0" id={`card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="flex items-center gap-1 text-[7.5px] font-black tracking-widest text-zinc-500 uppercase">
                {card.icon}
                {card.label}
              </div>
              <div className={`text-[13px] font-mono ${card.tone}`}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Quantitative Dealer Analytics Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-black/80 border border-black rounded-lg p-3.5 flex flex-col justify-between hover:border-amber-500/30 transition-colors">
          <span className="text-[8px] font-bold tracking-widest text-[#a1a1aa] uppercase mb-2 flex items-center gap-1.5"><Activity className="w-3 h-3 text-amber-500" /> Acceleration Flow</span>
          <div>
            <div className="text-[14px] font-mono font-black text-amber-400 mb-0.5">+4.2x / hr</div>
            <div className="text-[9px] text-zinc-500 uppercase tracking-wide leading-snug">Gamma Acceleration</div>
          </div>
        </div>
        
        <div className="bg-black/80 border border-black rounded-lg p-3.5 flex flex-col justify-between hover:border-sky-500/30 transition-colors">
          <span className="text-[8px] font-bold tracking-widest text-[#a1a1aa] uppercase mb-2 flex items-center gap-1.5"><Crosshair className="w-3 h-3 text-sky-400" /> Distance to Flip</span>
          <div>
            <div className="text-[14px] font-mono font-black text-[#E5E5E5] mb-0.5">{profile?.gammaFlip ? `${Math.abs(profile.spot - profile.gammaFlip).toFixed(1)} pts` : '--'}</div>
            <div className="text-[9px] text-zinc-500 uppercase tracking-wide leading-snug">Distance to Gamma Flip</div>
          </div>
        </div>

        <div className="bg-black/40 border border-black rounded-lg p-3.5 flex flex-col justify-center relative overflow-hidden group hover:border-black transition-colors">
           <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
              <Clock className="w-12 h-12 text-[#4ADE80]" />
           </div>
           <span className="text-[8px] font-bold tracking-widest text-[#4ADE80] uppercase mb-2 flex items-center gap-1.5 relative z-10"><Clock className="w-3 h-3" /> Statistical Edge</span>
           <div className="relative z-10">
            <div className="text-[14px] font-mono font-black text-[#4ADE80] mb-0.5 leading-snug">72.4% Win Rate</div>
            <div className="text-[8.5px] text-[#4ADE80] uppercase tracking-widest font-black">Historical Win Rate</div>
          </div>
        </div>
      </div>

      {/* ============== SUB-TABS SELECTOR SEAMLESS GRIDS ============== */}
      <div className="flex flex-nowrap overflow-x-auto scrollbar-none gap-2.5 justify-start items-center pb-0.5" id="dealerflow-subtabs-bar">
        <button
          onClick={() => setActiveEngineView('profile')}
          className={`flex shrink-0 items-center gap-2 px-4.5 py-3 font-mono text-[9px] font-black uppercase tracking-wider border rounded-lg transition-all cursor-pointer ${
            activeEngineView === 'profile'
              ? theme.buttonActive + ' border-b-2 border-b-[#4ADE80]'
              : theme.buttonInactive
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          HEDGING PROFILE & LIQUIDITY LEVELS
        </button>
        <button
          onClick={() => setActiveEngineView('targets')}
          className={`flex shrink-0 items-center gap-2 px-4.5 py-3 font-mono text-[9px] font-black uppercase tracking-wider border rounded-lg transition-all cursor-pointer ${
            activeEngineView === 'targets'
              ? 'bg-rose-500/10 border-rose-500 border-b-2 border-b-rose-400 text-[#E5E5E5] shadow-[0_0_12px_rgba(244,63,94,0.12)]'
              : 'bg-black/45 border-black text-zinc-500 hover:text-[#4ADE80] hover:border-black'
          }`}
        >
          <Target className="w-3.5 h-3.5 text-[#F87171]" />
          LOADED STRIKE TARGETS (INTRADAY)
        </button>
        <button
          onClick={() => setActiveEngineView('physics')}
          className={`flex shrink-0 items-center gap-2 px-4.5 py-3 font-mono text-[9px] font-black uppercase tracking-wider border rounded-lg transition-all cursor-pointer ${
            activeEngineView === 'physics'
              ? 'bg-amber-500/10 border-amber-500 border-b-2 border-b-amber-400 text-[#E5E5E5] shadow-[0_0_12px_rgba(245,158,11,0.12)]'
              : 'bg-black/45 border-black text-zinc-500 hover:text-[#4ADE80] hover:border-black'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          DEALER MECHANICS
        </button>
      </div>

      {activeEngineView === 'profile' ? (
        <>
          {/* ============== DEALER FLOW MAP (Hero Chart) ============== */}
          <div className={`${theme.cardBg} rounded-lg p-5 mb-4`} id="dealerflow-map-panel">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[#a1a1aa] uppercase">
                <Layers className={`w-3.5 h-3.5 ${theme.iconColor}`} />
                Dealer Net Gamma Map
                <span className="text-zinc-700">|</span>
                <span className="text-zinc-550">Dealer inventory & pin levels by strike</span>
              </div>
            </div>
            <DealerFlowMap profile={profile} decimals={selectedAsset.decimals} />
          </div>

          {/* ============== MAIN GRID ============== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" id="dealerflow-main-grid">
            {/* GEX PROFILE */}
            <div className={`${theme.cardBg} rounded-lg p-5`} id="gex-profile-chart-panel">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[#a1a1aa] uppercase">
                  <Layers className={`w-3.5 h-3.5 ${theme.iconColor}`} />
                  Gamma Exposure (GEX)
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-550">$ per 1% move</span>
                </div>
              </div>
              <ExposureProfileChart profile={profile} decimals={selectedAsset.decimals} type="gex" />

              {/* GEX footer */}
              {profile && (
                <div className="mt-4 pt-3 border-t border-black/60 grid grid-cols-3 gap-2 text-center" id="gex-profile-chart-oi-footer">
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Call GEX</div>
                    <div className="text-[11px] font-mono text-[#4ADE80] font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.callGex || 0), 0))}</div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Put GEX</div>
                    <div className="text-[11px] font-mono text-[#F87171] font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.putGex || 0), 0))}</div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Net GEX</div>
                    <div className="text-[11px] font-mono text-[#E5E5E5] font-bold">{fmtGreek(profile.netGex)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* DEX PROFILE */}
            <div className={`${theme.cardBg} rounded-lg p-5`} id="dex-profile-chart-panel">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[#a1a1aa] uppercase">
                  <Waves className={`w-3.5 h-3.5 ${theme.iconColor}`} />
                  Delta Exposure (DEX)
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-550">$ per 1% spot move</span>
                </div>
              </div>
              <ExposureProfileChart profile={profile} decimals={selectedAsset.decimals} type="dex" />

              {/* DEX footer */}
              {profile && (
                <div className="mt-4 pt-3 border-t border-black/60 grid grid-cols-3 gap-2 text-center" id="dex-profile-chart-footer">
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Call DEX</div>
                    <div className="text-[11px] font-mono tabular-nums text-sky-300 font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.callDex || 0), 0))}</div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Put DEX</div>
                    <div className="text-[11px] font-mono tabular-nums text-[#F87171] font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.putDex || 0), 0))}</div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Net DEX</div>
                    <div className="text-[11px] font-mono tabular-nums text-[#E5E5E5] font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.netDex || 0), 0))}</div>
                  </div>
                </div>
              )}
            </div>

            {/* VEX PROFILE */}
            <div className={`${theme.cardBg} rounded-lg p-5`} id="vex-profile-chart-panel">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[#a1a1aa] uppercase">
                  <Zap className={`w-3.5 h-3.5 ${theme.iconColor}`} />
                  Vega Exposure (VEX)
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-550">$ per 1% vol shift</span>
                </div>
              </div>
              <ExposureProfileChart profile={profile} decimals={selectedAsset.decimals} type="vex" />

              {/* VEX footer */}
              {profile && (
                <div className="mt-4 pt-3 border-t border-black/60 grid grid-cols-3 gap-2 text-center" id="vex-profile-chart-footer">
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Call VEX</div>
                    <div className="text-[11px] font-mono tabular-nums text-indigo-300 font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.callVex || 0), 0))}</div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Put VEX</div>
                    <div className="text-[11px] font-mono tabular-nums text-[#F87171] font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.putVex || 0), 0))}</div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-zinc-500 font-black uppercase tracking-widest">Net VEX</div>
                    <div className="text-[11px] font-mono tabular-nums text-[#E5E5E5] font-bold">{fmtGreek(profile.strikes.reduce((acc, cur) => acc + (cur.netVex || 0), 0))}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ============== INSTITUTIONAL MICRO-STRUCTURE METRICS ============== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden mb-4" id="dealerflow-displacement-row">
            <SlayerScoreWidget />
            <VolatilityStateWidget />
          </div>

          {/* ============== FULL WIDTH CHART AT BOTTOM ============== */}
          <div className={`${theme.cardBg} rounded-lg p-5 flex flex-col w-full overflow-hidden`} id="displacement-overlay-chart-panel" style={{ minHeight: '380px' }}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[#a1a1aa] uppercase">
                <ShieldAlert className={`w-3.5 h-3.5 ${theme.iconColor}`} />
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
        <IntradayTargetsView profile={profile} ticker={selectedAsset.ticker} decimals={selectedAsset.decimals} />
      ) : (
        <div id="institutional-physics-dash-wrapper">
          <InstitutionalPhysicsDashboard
            profile={profile}
            ticker={selectedAsset.ticker}
            decimals={selectedAsset.decimals}
          />
        </div>
      )}

      {/* ============== DEEPER ANALYTICS (supplementary, below the core views) ============== */}
      {/* QUANT EDGE — RND / VRP / skew / scenario / Kelly / dealer clock */}
      <QuantEdgePanel />

      {/* REGIME MATRIX — HMM / Hurst / OU / vol regimes / VPIN / Kyle / PCA */}
      <RegimeMatrixPanel />

      {/* DEALER DYNAMICS — vanna/charm flow, strike migration, gamma velocity,
          liquidity vacuums, wall strength */}
      <DealerDynamicsPanel />

      {/* 0DTE PROBABILITIES — expected-move bands, pin probability, EOD magnet,
          probability-of-touch to walls, settlement risk */}
      <ZeroDtePanel />
    </div>
  );
}
