/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, 
  Layers, 
  ShieldAlert, 
  Search, 
  Activity, 
  Terminal,
  ChevronRight,
  Percent,
  Crosshair,
  GitCommit,
  Clock
} from 'lucide-react';
import { GexProfileData, GexStrikeDetail } from '../types';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';

// ============================================================
// MATHEMATICAL CORE (BLACK-SCHOLES-MERTON ENGINE)
// ============================================================

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.39894228 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

interface BsmGreeks {
  delta: number;
  gamma: number;
  vanna: number;
  charm: number;
}

function calculateBSMGreeks(
  S: number,
  K: number,
  t: number,
  sigma: number,
  r = 0.05,
  q = 0.012,
  option_type: 'call' | 'put'
): BsmGreeks {
  if (t <= 0) t = 1e-4;
  if (sigma <= 0) sigma = 1e-3;

  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);

  const n_prime_d1 = normalPdf(d1);
  const N_d1 = normalCdf(d1);

  const delta = option_type === 'call'
    ? Math.exp(-q * t) * N_d1
    : Math.exp(-q * t) * (N_d1 - 1);

  const gamma = (Math.exp(-q * t) * n_prime_d1) / (S * sigma * Math.sqrt(t));
  const vanna = -Math.exp(-q * t) * n_prime_d1 * (d2 / sigma);

  const charm_base = Math.exp(-q * t) * n_prime_d1 * ((r - q) / (sigma * Math.sqrt(t)) - d2 / (2 * t));
  const charm = option_type === 'call'
    ? q * Math.exp(-q * t) * N_d1 - charm_base
    : -q * Math.exp(-q * t) * (1 - N_d1) - charm_base;

  return { delta, gamma, vanna, charm };
}

// Format utilities with institutional units
function fmtBn(val: number): string {
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

interface TICKER_PROFILE_METRICS {
  netGex: number;
  netVex: number;
  netCex: number;
  fwdVar: number;
  vpin: string;
  vpinColor: string;
  friction: number;
  spot: number;
  volState: string;
  marketEnergy: string;
  impliedRegime: string;
  expectedMovePct: number;
}

const TICKER_PROFILES: Record<string, TICKER_PROFILE_METRICS> = {
  SPX: {
    spot: 7623.00,
    netGex: 1.42e9,
    netVex: -420.5e6,
    netCex: 12.8e6,
    fwdVar: 0.0422,
    vpin: '0.82 (HIGH)',
    vpinColor: 'text-[#F87171]',
    friction: 0.0014,
    volState: 'DECAYING CLOUD',
    marketEnergy: '0.457 λ',
    impliedRegime: 'STABLE RANGE PIN',
    expectedMovePct: 0.015,
  },
  NDX: {
    spot: 18250.00,
    netGex: 1.08e9,
    netVex: -680.2e6,
    netCex: 18.5e6,
    fwdVar: 0.0680,
    vpin: '0.87 (HIGH)',
    vpinColor: 'text-[#F87171]',
    friction: 0.0021,
    volState: 'EXPANDING BIAS',
    marketEnergy: '0.621 λ',
    impliedRegime: 'SENSITIVE BREAKOUT',
    expectedMovePct: 0.022,
  },
  QQQ: {
    spot: 445.50,
    netGex: 120.4e6,
    netVex: -35.2e6,
    netCex: 0.85e6,
    fwdVar: 0.0570,
    vpin: '0.74 (MODERATE)',
    vpinColor: 'text-amber-400',
    friction: 0.0008,
    volState: 'DECAYING CLOUD',
    marketEnergy: '0.288 λ',
    impliedRegime: 'EQUILIBRIUM COGNIZANCE',
    expectedMovePct: 0.018,
  },
  SPY: {
    spot: 512.30,
    netGex: 280.5e6,
    netVex: -72.8e6,
    netCex: 1.20e6,
    fwdVar: 0.0380,
    vpin: '0.65 (MODERATE)',
    vpinColor: 'text-amber-400',
    friction: 0.0006,
    volState: 'MUTED BASE',
    marketEnergy: '0.194 λ',
    impliedRegime: 'STABLE SLATE PIN',
    expectedMovePct: 0.012,
  },
  RUT: {
    spot: 2025.00,
    netGex: -15.4e6,
    netVex: 11.2e6,
    netCex: -0.40e6,
    fwdVar: 0.0820,
    vpin: '0.89 (HIGH)',
    vpinColor: 'text-[#F87171]',
    friction: 0.0035,
    volState: 'VOLATILE PIVOT',
    marketEnergy: '0.748 λ',
    impliedRegime: 'DYNAMIC INSTABILITY',
    expectedMovePct: 0.025,
  }
};

interface DashboardProps {
  profile?: GexProfileData;
  ticker?: string;
  decimals?: number;
}

export function InstitutionalPhysicsDashboard({ profile: externalProfile, ticker: externalTicker, decimals: externalDecimals }: DashboardProps) {
  const storeSelectedAsset = useContractStore(s => s.selectedAsset);
  const storeSetAsset = useContractStore(s => s.setSelectedAsset);

  // Active state ticker
  const activeTicker = storeSelectedAsset?.ticker || externalTicker || 'SPX';
  const customProfile = TICKER_PROFILES[activeTicker] || TICKER_PROFILES.SPX;
  const decimals = externalDecimals ?? (activeTicker === 'QQQ' || activeTicker === 'SPY' ? 2 : 0);

  // Local calculation states
  const [ticker, setTicker] = useState<string>(activeTicker);
  const [profile, setProfile] = useState<TICKER_PROFILE_METRICS>(customProfile);
  const [systemState, setSystemState] = useState<'SYSTEM ACTIVE' | 'COMPUTING CASCADE...'>('SYSTEM ACTIVE');

  // Control over surface topography model setting: 'call' | 'put' | 'neutral'
  const [surfaceMode, setSurfaceMode] = useState<'call' | 'put' | 'neutral'>('neutral');

  // Fullscreen expansion and resize coordination
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [resizeKey, setResizeKey] = useState<number>(0);

  // Esc keyboard shortcut to exit fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Monitor resize transitions
  useEffect(() => {
    const handleResize = () => setResizeKey(prev => prev + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 3D Matrix states
  const [rot, setRot] = useState<number>(35);
  const [elev, setElev] = useState<number>(45);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, isDown: false });

  // Update when external or global asset shifts
  useEffect(() => {
    setTicker(activeTicker);
    setProfile(TICKER_PROFILES[activeTicker] || TICKER_PROFILES.SPX);
  }, [activeTicker]);

  // Adjust canvas repaint whenever expanded state transitions
  useEffect(() => {
    // Small timeout ensures container layout completes in DOM before measuring
    const timer = setTimeout(() => {
      setResizeKey(prev => prev + 1);
    }, 50);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  // Run autonomous quantitative computation simulation when switching tickers
  const handleSelectTickerObj = (selectedTk: string) => {
    setSystemState('COMPUTING CASCADE...');
    
    // Instant execution to remove slow rendering delays
    const asset = ASSET_LIST.find(a => a.ticker === selectedTk);
    if (asset) {
      storeSetAsset(asset);
    }
    setTicker(selectedTk);
    setProfile(TICKER_PROFILES[selectedTk]);
    setSystemState('SYSTEM ACTIVE');
  };

  // Compute strikes table with completed call and put details
  const impliedStrikes = useMemo(() => {
    const list: GexStrikeDetail[] = [];
    const basePrice = profile.spot;
    const spacing = ticker === 'SPX' ? 25 : ticker === 'NDX' ? 100 : ticker === 'RUT' ? 10 : 5;

    // Use a clean, explicitly bounded iterator from -7 to 7 (exactly 15 strikes)
    for (let i = -7; i <= 7; i++) {
      const strikePrice = Math.round(basePrice / spacing) * spacing + i * spacing;
      const dist = strikePrice - basePrice;
      const distRatio = Math.abs(dist) / basePrice;
      
      const probabilitySpread = Math.exp(-Math.pow(distRatio / (profile.expectedMovePct * 1.5), 2));
      
      // Compute detailed simulated calls and puts
      const putBias = dist < 0 ? 1.55 : 0.45;
      const callBias = dist >= 0 ? 1.55 : 0.45;

      // Ensure exposure quantities are positive via absolute net Gex mapping
      const absNetGex = Math.abs(profile.netGex);
      const callGex = (absNetGex * 0.45 * probabilitySpread * callBias) / 10;
      const putGex = (absNetGex * 0.45 * probabilitySpread * putBias) / 10;
      
      const callOi = Math.round(18400 * probabilitySpread * callBias);
      const putOi = Math.round(18400 * probabilitySpread * putBias);
      const callVolume = Math.round(callOi * 0.15 * (1 + Math.random() * 0.05));
      const putVolume = Math.round(putOi * 0.15 * (1 + Math.random() * 0.05));

      list.push({
        strike: strikePrice,
        index: i,
        callGex,
        putGex,
        netGex: callGex - putGex,
        callOi,
        putOi,
        callVolume,
        putVolume
      });
    }

    return list.sort((a, b) => b.strike - a.strike);
  }, [ticker, profile]);

  // Compute final Black-Scholes Greeks at active ATM zone
  const calculatedGreeks = useMemo(() => {
    const S = profile.spot;
    const K = Math.round(S / (ticker === 'SPX' ? 25 : ticker === 'NDX' ? 100 : 5)) * (ticker === 'SPX' ? 25 : ticker === 'NDX' ? 100 : 5);
    const maturity = 14 / 365; // 2 weeks DTE
    return calculateBSMGreeks(S, K, maturity, profile.expectedMovePct * 10, 0.05, 0.012, 'call');
  }, [profile, ticker]);

  // Handle manual canvas mouse rotation and drag controls
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseRef.current.isDown = true;
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseRef.current.isDown) return;
    const dx = e.clientX - mouseRef.current.x;
    const dy = e.clientY - mouseRef.current.y;
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;

    setRot(prev => (prev - dx * 0.45 + 360) % 360);
    setElev(prev => Math.max(15, Math.min(85, prev + dy * 0.45)));
  };

  const handleMouseUpOrLeave = () => {
    mouseRef.current.isDown = false;
  };

  // Interactive 3D Wireframe Drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina DPR adaptation
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;

    // Clean canvas with deep sterile backdrop
    ctx.fillStyle = '#101012';
    ctx.fillRect(0, 0, w, h);

    // Subtle center light gradient
    const fillLight = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.7);
    fillLight.addColorStop(0, 'rgba(255, 255, 255, 0.045)');
    fillLight.addColorStop(0.5, 'rgba(255, 255, 255, 0.01)');
    fillLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = fillLight;
    ctx.fillRect(0, 0, w, h);

    // Render mesh grid coordinates
    const scale = 1.35;
    const size = 18; // 18x18 nodes
    const maxVal = 180;
    const points: { x2d: number; y2d: number; zVal: number }[][] = [];

    // Map strikes peak parameters onto the mesh
    const strikePeaks = impliedStrikes.map(s => ({
      offset: (((s.index ?? 0) / 7)) * 140, // Perfectly spread from -140 to +140
      netGex: s.netGex,
      callGex: s.callGex,
      putGex: s.putGex
    }));

    for (let i = 0; i < size; i++) {
      const u = (i / (size - 1) - 0.5) * 2; // -1 to 1
      const x3d = u * maxVal;
      points[i] = [];

      for (let j = 0; j < size; j++) {
        const v = (j / (size - 1) - 0.5) * 2; // -1 to 1
        const y3d = v * maxVal;

        // Base saddle topography equation
        let z3d = 8 * Math.sin(u * Math.PI) * Math.cos(v * Math.PI);

        // Map GEX surface deformations based on Call, Put, or Neutral selection
        if (surfaceMode === 'call') {
          strikePeaks.forEach(pk => {
            const range = Math.abs(x3d - pk.offset);
            if (range < 30) {
              const weight = Math.cos((range / 30) * Math.PI / 2);
              z3d += (Math.abs(pk.callGex) / 1e6) * 0.28 * weight * (1 - Math.abs(v) * 0.45);
            }
          });
        } else if (surfaceMode === 'put') {
          strikePeaks.forEach(pk => {
            const range = Math.abs(x3d - pk.offset);
            if (range < 30) {
              const weight = Math.cos((range / 30) * Math.PI / 2);
              z3d -= (Math.abs(pk.putGex) / 1e6) * 0.28 * weight * (1 - Math.abs(v) * 0.45);
            }
          });
        } else {
          // Symmetrical balance waves representing short/long hedging grids
          strikePeaks.forEach(pk => {
            const range = Math.abs(x3d - pk.offset);
            if (range < 30) {
              const weight = Math.cos((range / 30) * Math.PI / 2);
              const val = (pk.netGex / 1e6) * 0.24;
              z3d += val * weight * (1 - Math.abs(v) * 0.45);
            }
          });
        }

        // Saddle variance adjustments
        z3d += (u * u - v * v) * 10;
        z3d = Math.max(-90, Math.min(90, z3d));

        // 3D Pitch and Yaw Projection System
        const radRot = (rot * Math.PI) / 180;
        const radElev = (elev * Math.PI) / 180;

        // Yaw Rotation (around Z axis)
        const rx1 = x3d * Math.cos(radRot) - y3d * Math.sin(radRot);
        const ry1 = x3d * Math.sin(radRot) + y3d * Math.cos(radRot);

        // Pitch rotation (around X axis)
        const rx2 = rx1;
        const ry2 = ry1 * Math.cos(radElev) - z3d * Math.sin(radElev);
        const rz2 = ry1 * Math.sin(radElev) + z3d * Math.cos(radElev);

        points[i][j] = {
          x2d: cx + rx2 * scale,
          y2d: cy + ry2 * scale - 10,
          zVal: z3d
        };
      }
    }

    // Step-by-step rendering with exact line opacity parameters
    ctx.lineWidth = 0.85;
    for (let i = 0; i < size - 1; i++) {
      for (let j = 0; j < size - 1; j++) {
        const p0 = points[i][j];
        const p1 = points[i + 1][j];
        const p2 = points[i + 1][j + 1];
        const p3 = points[i][j + 1];

        const middleZ = (p0.zVal + p1.zVal + p2.zVal + p3.zVal) / 4;
        const pctHeight = (middleZ + 90) / 180;

        // Base wireframe colors matching options surface mode
        let strokeStyle = 'rgba(113, 113, 122, 0.2)';
        let fillStyle = 'rgba(113, 113, 122, 0.015)';

        if (surfaceMode === 'call') {
          strokeStyle = `rgba(16, 185, 129, ${0.12 + pctHeight * 0.35})`;
          fillStyle = `rgba(16, 185, 129, ${0.005 + pctHeight * 0.04})`;
        } else if (surfaceMode === 'put') {
          strokeStyle = `rgba(239, 68, 68, ${0.12 + pctHeight * 0.35})`;
          fillStyle = `rgba(239, 68, 68, ${0.005 + pctHeight * 0.04})`;
        } else {
          strokeStyle = `rgba(161, 161, 170, ${0.1 + pctHeight * 0.28})`;
          fillStyle = `rgba(161, 161, 170, ${0.005 + pctHeight * 0.03})`;
        }

        ctx.strokeStyle = strokeStyle;
        ctx.fillStyle = fillStyle;

        ctx.beginPath();
        ctx.moveTo(p0.x2d, p0.y2d);
        ctx.lineTo(p1.x2d, p1.y2d);
        ctx.lineTo(p2.x2d, p2.y2d);
        ctx.lineTo(p3.x2d, p3.y2d);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Centered axis crosshairs indicator lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;

    const latS = points[0][Math.floor(size / 2)];
    const latE = points[size - 1][Math.floor(size / 2)];
    ctx.beginPath();
    ctx.moveTo(latS.x2d, latS.y2d);
    ctx.lineTo(latE.x2d, latE.y2d);
    ctx.stroke();

    const lonS = points[Math.floor(size / 2)][0];
    const lonE = points[Math.floor(size / 2)][size - 1];
    ctx.beginPath();
    ctx.moveTo(lonS.x2d, lonS.y2d);
    ctx.lineTo(lonE.x2d, lonE.y2d);
    ctx.stroke();
    
    ctx.setLineDash([]);

    // Anchor text tags inside canvas bounds
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    
    const maxBound = points[size - 1][Math.floor(size / 2)];
    ctx.fillText('+SPOT', maxBound.x2d + 6, maxBound.y2d + 3);

    const minBound = points[0][Math.floor(size / 2)];
    ctx.fillText('-SPOT', minBound.x2d - 38, minBound.y2d + 3);

    const topVolBound = points[Math.floor(size / 2)][size - 1];
    ctx.fillText('+IV VARIANCE', topVolBound.x2d - 32, topVolBound.y2d + 12);

    // Dynamic spot coordinate tracker (Current Reality Anchor)
    const centerPoint = points[Math.floor(size / 2)][Math.floor(size / 2)];
    
    // Pulse glow
    ctx.beginPath();
    ctx.arc(centerPoint.x2d, centerPoint.y2d, 18, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.15)'; // amber-500 glow
    ctx.fill();
    
    // Core dot
    ctx.beginPath();
    ctx.arc(centerPoint.x2d, centerPoint.y2d, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#fbbf24'; // amber-400
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Slicing lines originating from the center
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
    ctx.lineDashOffset = Date.now() / 20; // moving dash effect
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerPoint.x2d, centerPoint.y2d - 40);
    ctx.lineTo(centerPoint.x2d, centerPoint.y2d + 40);
    ctx.stroke();

    // Coordinate Label
    ctx.fillStyle = '#fcd34d'; // amber-300
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`SPOT ${profile.spot.toFixed(2)}`, centerPoint.x2d + 8, centerPoint.y2d - 12);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
    ctx.font = '7px monospace';
    ctx.fillText(`IV LOCAL SKEW`, centerPoint.x2d + 8, centerPoint.y2d - 4);
    
    ctx.setLineDash([]);

  }, [rot, elev, profile, ticker, impliedStrikes, surfaceMode, isExpanded, resizeKey]);



  return (
    <div className="w-full text-[#4ADE80] flex flex-col font-mono select-none antialiased min-h-[640px] relative px-1 py-1" id="skyseye-physics-dashboard-root">
      
      <style dangerouslySetInnerHTML={{__html: `
        .quant-terminal-grid {
          display: grid;
          grid-template-columns: 1fr 2.5fr 1fr;
          grid-template-rows: auto 1fr auto;
          gap: 16px;
          align-items: stretch;
        }
        .quant-panel {
          background-color: #121215;
          border: 1px solid #1c1c21;
          border-radius: 2px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .panel-header-alt {
          border-bottom: 1px solid #1c1c21;
          padding-bottom: 8px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 800;
          color: #e4e4e7;
          font-size: 9px;
          letter-spacing: 0.15em;
        }
        .hud-label {
          color: #000000;
          font-size: 7.5px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 3px;
        }
        .hud-value {
          font-size: 15.5px;
          font-weight: 700;
          font-family: "JetBrains Mono", monospace;
          color: #ffffff;
          line-height: 1.25;
        }
        @media (max-width: 1024px) {
          .quant-terminal-grid {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
          }
        }

        /* Premium horizontal telemetry row and greek cards */
        .greeks-horizontal-grid { 
          display: grid; 
          grid-template-columns: repeat(5, 1fr);
          gap: 12px; 
          width: 100%;
        }
        @media (max-width: 1200px) {
          .greeks-horizontal-grid { 
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 768px) {
          .greeks-horizontal-grid { 
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .greek-card { 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center;
          gap: 6px; 
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 4px;
          padding: 12px 10px;
          text-align: center;
        }

        .greek-card label { 
          display: flex;
          align-items: center;
          gap: 4.5px;
          font-size: 0.65rem; 
          color: #8b949e; 
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .greek-card span { 
          font-size: 1.1rem; 
          font-family: 'JetBrains Mono', monospace; 
          color: #fff; 
          font-weight: 600;
        }

        .greek-card .unit {
          font-size: 8px;
          color: #000000;
          font-weight: normal;
        }

        .icon-small {
          opacity: 0.85;
        }
      `}} />

      {/* ============================================================
       TOP HEADER ROW
       ============================================================ */}
      <header className="quant-panel mb-4 flex flex-row justify-between items-center py-3.5 px-5 h-auto min-h-[64px]" id="quant-header" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-black/40 animate-pulse" />
            <span className="text-[10px] font-black tracking-widest text-zinc-100 font-sans uppercase">
              MASTER TELEMETRY
            </span>
          </div>
          <div className="h-4 w-px bg-black" />
          
          <div className="flex items-center gap-1.5 bg-black/80 border border-black px-2.5 py-1 rounded">
            <span className="text-zinc-500 text-[10px] font-bold">ACTIVE ASSET:</span>
            <span className="text-[#4ADE80] font-extrabold text-[11px] font-mono tracking-wider">{ticker}</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-[9.5px]">
          {/* State Classifier indicator */}
          <div className="flex flex-col text-left">
            <span className="text-zinc-650 font-extrabold uppercase text-[7px] tracking-wider leading-none mb-1">STATE_VECTOR</span>
            <span className={`font-black tracking-wide leading-none text-[10px] ${systemState === 'SYSTEM ACTIVE' ? 'text-[#4ADE80]' : 'text-amber-500 animate-pulse'}`}>
              ● {systemState}
            </span>
          </div>
          
          <div className="h-4 w-px bg-black" />

          <div className="flex flex-col text-left">
            <span className="text-zinc-650 font-extrabold uppercase text-[7px] tracking-wider leading-none mb-1">MARKET ENERGY (E_t)</span>
            <span className="text-zinc-200 font-bold leading-none text-[10px]">{profile.marketEnergy}</span>
          </div>

          <div className="h-4 w-px bg-black" />

          <div className="flex flex-col text-left">
            <span className="text-zinc-650 font-extrabold uppercase text-[7px] tracking-wider leading-none mb-1">IMPLIED REGIME</span>
            <span className="text-sky-400 font-bold leading-none text-[10px]">{profile.impliedRegime}</span>
          </div>
        </div>
      </header>

      {/* ============================================================
       PRIMARY GRID CONTAINER
       ============================================================ */}
      <div className="quant-terminal-grid flex-1 items-stretch gap-4">
        
        {/* ------------------------------------------------------------
         LEFT PANE (DEALER INVENTORY & FULL COMPLETED STRIKES PROFILE)
         ------------------------------------------------------------ */}
        <aside className="quant-panel flex-1 justify-between flex flex-col min-h-[500px]" id="pane-left">
          
          {/* Module 1: Inventory State */}
          <div className="mb-4">
            <div className="panel-header-alt">
              <span>DEALER INVENTORY STATE</span>
              <Terminal className="w-3 h-3 text-zinc-600" />
            </div>
            
            <div className="grid grid-cols-1 gap-3.5">
              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">NET GEX (GAMMA EXPOSURE)</div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value ${profile.netGex >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                    {fmtBn(profile.netGex)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">USD/sh</span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">NET VEX (VANNA EXPOSURE)</div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value ${profile.netVex >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                    {fmtBn(profile.netVex)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">USD/vol</span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">NET CEX (CHARM EXPOSURE)</div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value ${profile.netCex >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                    {fmtBn(profile.netCex)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">/24h</span>
                </div>
              </div>
            </div>
          </div>

          {/* Module 2: Strikes Hedging Profile (Complete Call and Put details rendered!) */}
          <div className="flex-1 flex flex-col justify-end" id="completed-hedging-profile">
            <div className="panel-header-alt mt-1.5">
              <span>HEDGING PROFILE</span>
              <Layers className="w-3 h-3 text-zinc-600" />
            </div>

            <div className="flex flex-col gap-[3px] bg-black/30 p-2.5 border border-black rounded-sm flex-1 overflow-y-auto max-h-[220px]">
              {/* Header */}
              <div className="grid grid-cols-5 text-[7px] text-zinc-600 font-extrabold uppercase border-b border-black pb-1.5 mb-1 tracking-wider text-center">
                <span className="text-left">C_GEX</span>
                <span>C_OI</span>
                <span className="text-zinc-400">STRIKE</span>
                <span>P_OI</span>
                <span className="text-right">P_GEX</span>
              </div>

              {impliedStrikes.slice(3, 12).map((strRow) => {
                const isAtSpotIdx = Math.abs(strRow.strike - profile.spot) === Math.min(...impliedStrikes.map(s => Math.abs(s.strike - profile.spot)));
                const isPositive = strRow.netGex >= 0;
                return (
                  <div 
                    key={strRow.strike} 
                    className={`grid grid-cols-5 text-[8.5px] font-mono py-1 px-1 items-center justify-center text-center border border-black/40 relative rounded-sm transition-all duration-150 ${
                      isAtSpotIdx 
                        ? 'bg-black/70 border border-black ring-[1px] ring-zinc-500/30' 
                        : isPositive 
                          ? 'bg-black/40 border-black text-[#4ADE80]' 
                          : 'bg-rose-950/20 border-rose-900/35 text-[#F87171]'
                    }`}
                  >
                    <span className="text-[#4ADE80] text-left font-bold px-0.5">{(strRow.callGex / 1e6).toFixed(1)}M</span>
                    <span className="text-zinc-450 font-medium">{Math.round(strRow.callOi / 100)}h</span>
                    <span className={`font-black font-mono text-[9px] ${isAtSpotIdx ? 'text-[#E5E5E5]' : 'text-zinc-205'}`}>{strRow.strike}</span>
                    <span className="text-zinc-450 font-medium">{Math.round(strRow.putOi / 100)}h</span>
                    <span className="text-[#F87171] text-right font-bold px-0.5">{(strRow.putGex / 1e6).toFixed(1)}M</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------------
         CENTER PANE (3D TOPOGRAPHY MAP WITH MORPH SHIFT TABS)
         ------------------------------------------------------------ */}
        <main 
          className={isExpanded 
            ? "fixed inset-0 z-[999] bg-black/98 backdrop-blur-md p-6 flex flex-col justify-between gap-4 animate-fade-in" 
            : "quant-panel flex-1 justify-between flex flex-col p-4 relative min-h-[500px]"
          } 
          id="pane-center"
        >
          
          {/* Top Panel Control Row for Morph Surface Shifts */}
          <div className="flex justify-between items-center border-b border-black/70 pb-3 mb-2" id="canvas-control-overlay">
            <div className="flex items-center gap-3">
              {isExpanded && (
                <span className="text-[9px] font-black tracking-widest text-[#4ADE80] font-mono uppercase bg-[#4ADE80] text-black/10 border border-black px-2 py-1 rounded-sm">
                  EXPANDED VIEWPORTS // QUANT COORDS
                </span>
              )}
              <div className="flex gap-1 bg-black p-0.5 border border-black rounded-sm">
                <button
                  type="button"
                  onClick={() => setSurfaceMode('neutral')}
                  className={`px-3 py-1 text-[8.5px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none transition-colors ${surfaceMode === 'neutral' ? 'bg-black text-zinc-200' : 'text-zinc-500 hover:text-zinc-400'}`}
                >
                  ● NEUTRAL TOPOGRAPHY
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode('call')}
                  className={`px-3 py-1 text-[8.5px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none transition-colors ${surfaceMode === 'call' ? 'bg-black/40 border border-black text-[#4ADE80]' : 'text-zinc-500 hover:text-zinc-400'}`}
                >
                  CALL WALL Topography
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode('put')}
                  className={`px-3 py-1 text-[8.5px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none transition-colors ${surfaceMode === 'put' ? 'bg-rose-950 border border-rose-900 text-[#F87171]' : 'text-zinc-500 hover:text-zinc-400'}`}
                >
                  PUT WALL Topography
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[7px] text-zinc-550 border border-black bg-black px-2.5 py-1.5 rounded-sm uppercase tracking-wider font-extrabold">
                DRAG CANVAS TO ROTATE TOPOGRAPHY VIEWPORT
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-black hover:mirror-panel hover:border-black text-zinc-400 hover:text-[#E5E5E5] rounded-xs p-1.5 px-3 transition-all text-[8.5px] font-bold flex items-center gap-1 cursor-pointer"
                title={isExpanded ? "Exit Fullscreen" : "Expand to Fullscreen"}
              >
                <span>{isExpanded ? "⛶ COLLAPSE [ESC]" : "⛶ EXPAND"}</span>
              </button>
            </div>
          </div>

          {/* Interactive 3D Canvas Box */}
          <div className="flex-1 relative bg-black border border-black rounded-sm overflow-hidden" id="canvas-stage-wrapper">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
            />
          </div>
        </main>

        {/* ------------------------------------------------------------
         RIGHT PANE (STRUCTURE ANALYSIS & PROPAGATION MODELS)
         ------------------------------------------------------------ */}
        <aside className="quant-panel flex-1 justify-between flex flex-col min-h-[500px]" id="pane-right">
          
          {/* Module 1: Market Structuring parameters */}
          <div className="mb-4">
            <div className="panel-header-alt">
              <span>VOLATILITY & MICROSTRUCTURE</span>
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-600" />
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">FDA / FORWARD-VARIANCE</div>
                <div className="flex items-baseline gap-2">
                  <span className="hud-value text-sky-400">
                    {profile.fwdVar.toFixed(4)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">v2_std</span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label text-[#F87171]/90">ORDER FLOW TOXICITY (VPIN)</div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value ${profile.vpinColor}`}>
                    {profile.vpin}
                  </span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">LIQUIDITY FRICTION (Λ)</div>
                <div className="flex items-baseline gap-2">
                  <span className="hud-value text-zinc-100">
                    {profile.friction.toFixed(4)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">coeff</span>
                </div>
              </div>
            </div>
          </div>

          {/* Module 2: Expected Propagation & target probability limits */}
          <div className="flex-1 flex flex-col justify-end" id="target-propagation-module">
            <div className="panel-header-alt mt-1.5">
              <span>TARGET PROPAGATION (95% CI)</span>
              <Compass className="w-3 h-3 text-zinc-600" />
            </div>

            <div className="bg-black/45 p-3 border border-black rounded-sm flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-zinc-500 font-black tracking-widest uppercase">Decay Velocity (Θ_rad)</span>
                  <span className="text-[#4ADE80] font-bold">-0.842v / hr</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-zinc-500 font-black tracking-widest uppercase">Local Friction (Λ)</span>
                  <span className="text-[#4ADE80] font-bold">1.22μ</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-zinc-500 font-black tracking-widest uppercase">Dealer Hedging Pressure</span>
                  <span className="text-[#F87171] font-bold">94.2%</span>
                </div>
                <div className="h-px bg-black/60 my-1" />
              </div>

              <div className="pt-3">
                <div className="flex justify-between items-center text-[9px] text-zinc-400 font-extrabold pb-1">
                  <span>95% CI LOWER</span>
                  <span>95% CI UPPER</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-[10.5px] font-mono">
                  <span className="text-[#F87171] bg-rose-950/20 border border-[#F87171]/40 py-1.5 rounded-sm">
                    {(profile.spot * (1 - 1.96 * profile.expectedMovePct)).toFixed(decimals === 0 ? 0 : 2)}
                  </span>
                  <span className="text-[#4ADE80] bg-black/40 border border-black py-1.5 rounded-sm">
                    {(profile.spot * (1 + 1.96 * profile.expectedMovePct)).toFixed(decimals === 0 ? 0 : 2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </aside>

      </div>

      {/* ============================================================
       BOTTOM FOOTER METRICS ROW
       ============================================================ */}
      <footer className="mt-4" id="quant-footer">
        <div className="quant-panel" style={{ padding: '16px' }}>
          <div className="greeks-horizontal-grid">
            
            {/* CARD 1: SPOT DELTA INTEGRATION */}
            <div className="greek-card">
              <label>
                <Activity className="w-3.5 h-3.5 text-[#4ADE80] icon-small" /> 
                SPOT DELTA INTEGRATION
              </label>
              <span>
                {calculatedGreeks.delta.toFixed(4)} <span className="unit">Δ_COEFF</span>
              </span>
            </div>

            {/* CARD 2: SPOT GAMMA CONVEXITY */}
            <div className="greek-card">
              <label>
                <GitCommit className="w-3.5 h-3.5 text-zinc-450 icon-small" /> 
                SPOT GAMMA CONVEXITY
              </label>
              <span>
                {calculatedGreeks.gamma.toFixed(6)} <span className="unit">Γ_COEFF</span>
              </span>
            </div>

            {/* CARD 3: VANNA COVARIANCE */}
            <div className="greek-card">
              <label>
                <Percent className="w-3.5 h-3.5 text-[#F87171] icon-small" /> 
                VANNA COVARIANCE (∂Δ/∂Σ)
              </label>
              <span>
                {calculatedGreeks.vanna.toFixed(4)} <span className="unit">V_COEFF</span>
              </span>
            </div>

            {/* CARD 4: CHARM DECAY SPEED */}
            <div className="greek-card">
              <label>
                <Clock className="w-3.5 h-3.5 text-zinc-400 icon-small" /> 
                CHARM DECAY SPEED (∂Δ/∂T)
              </label>
              <span>
                {calculatedGreeks.charm.toFixed(4)} <span className="unit">C_COEFF</span>
              </span>
            </div>

            {/* CARD 5: ATM MAGNET STRIKE */}
            <div className="greek-card">
              <label>
                <Crosshair className="w-3.5 h-3.5 text-sky-400 icon-small" /> 
                ATM MAGNET STRIKE
              </label>
              <span className="text-sky-400">
                {profile.spot.toFixed(0)} <span className="unit">MAGNET_STRIKE</span>
              </span>
            </div>

          </div>
        </div>
      </footer>



    </div>
  );
}
