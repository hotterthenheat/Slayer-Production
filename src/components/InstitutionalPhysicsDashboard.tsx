/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as THREE from 'three';
import { stdNormalCDF, stdNormalPDF } from '../lib/normalDist';
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
import { computeRndProfile } from '../lib/rndEngine';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { fmtNum } from '../lib/format';

// ============================================================
// MATHEMATICAL CORE (BLACK-SCHOLES-MERTON ENGINE)
// ============================================================

// normalPdf/normalCdf are imported from ../lib/normalDist (canonical West/Hart CDF,
// ~1e-15) instead of a local Abramowitz-Stegun approximation (~1.5e-7, asymmetric
// tails) that made the displayed deep-OTM greeks disagree with the rest of the engine.

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

  const n_prime_d1 = stdNormalPDF(d1);
  const N_d1 = stdNormalCDF(d1);

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
    vpinColor: 'text-[var(--danger)]',
    friction: 0.0014,
    volState: 'VOL FALLING',
    marketEnergy: '0.457 λ',
    impliedRegime: 'RANGE-BOUND / PINNED',
    expectedMovePct: 0.015,
  },
  NDX: {
    spot: 18250.00,
    netGex: 1.08e9,
    netVex: -680.2e6,
    netCex: 18.5e6,
    fwdVar: 0.0680,
    vpin: '0.87 (HIGH)',
    vpinColor: 'text-[var(--danger)]',
    friction: 0.0021,
    volState: 'VOL EXPANDING',
    marketEnergy: '0.621 λ',
    impliedRegime: 'BREAKOUT WATCH',
    expectedMovePct: 0.022,
  },
  QQQ: {
    spot: 445.50,
    netGex: 120.4e6,
    netVex: -35.2e6,
    netCex: 0.85e6,
    fwdVar: 0.0570,
    vpin: '0.74 (MODERATE)',
    vpinColor: 'text-[var(--warning)]',
    friction: 0.0008,
    volState: 'VOL FALLING',
    marketEnergy: '0.288 λ',
    impliedRegime: 'BALANCED',
    expectedMovePct: 0.018,
  },
  SPY: {
    spot: 512.30,
    netGex: 280.5e6,
    netVex: -72.8e6,
    netCex: 1.20e6,
    fwdVar: 0.0380,
    vpin: '0.65 (MODERATE)',
    vpinColor: 'text-[var(--warning)]',
    friction: 0.0006,
    volState: 'LOW VOL / QUIET',
    marketEnergy: '0.194 λ',
    impliedRegime: 'STABLE / PINNED',
    expectedMovePct: 0.012,
  },
  RUT: {
    spot: 2025.00,
    netGex: -15.4e6,
    netVex: 11.2e6,
    netCex: -0.40e6,
    fwdVar: 0.0820,
    vpin: '0.89 (HIGH)',
    vpinColor: 'text-[var(--danger)]',
    friction: 0.0035,
    volState: 'HIGH VOL / UNSTABLE',
    marketEnergy: '0.748 λ',
    impliedRegime: 'TRENDING / UNSTABLE',
    expectedMovePct: 0.025,
  }
};

// Small provenance chip rendered next to every headline metric so the trader
// can tell at a glance whether a value is sourced from the live server payload
// (LIVE) or is a local quantitative model (MODEL). Honesty-first: nothing is
// allowed to imply a live feed when the underlying value is simulated.
function SourceTag({ live }: { live: boolean }) {
  return (
    <span
      className="text-[10px] font-black tracking-widest uppercase px-1 py-px rounded-sm leading-none"
      style={{
        color: live ? 'var(--success)' : 'var(--text-tertiary)',
        border: `1px solid ${live ? 'var(--success)' : 'var(--border)'}`,
        background: 'var(--surface-2)',
      }}
    >
      {live ? 'LIVE' : 'MODEL'}
    </span>
  );
}

interface DashboardProps {
  profile?: GexProfileData;
  ticker?: string;
  decimals?: number;
}

export function InstitutionalPhysicsDashboard({ profile: externalProfile, ticker: externalTicker, decimals: externalDecimals }: DashboardProps) {
  const storeSelectedAsset = useContractStore(s => s.selectedAsset);
  const storeSetAsset = useContractStore(s => s.setSelectedAsset);
  const serverState = useContractStore(s => s.serverState);
  // Real annualized realized vol (Yang-Zhang) from the server edge engine, used
  // as the historical-density baseline so the implied-vs-historical divergence on
  // the surface reflects live market vol. Falls back to the model default keyless.
  const liveRealizedVol = useMemo(() => {
    const rv = serverState?.quant_edge?.realizedVol?.primary;
    return typeof rv === 'number' && isFinite(rv) && rv > 0.01 && rv < 3 ? rv : undefined;
  }, [serverState]);

  // Active state ticker
  const activeTicker = storeSelectedAsset?.ticker || externalTicker || 'SPX';
  const customProfile = TICKER_PROFILES[activeTicker] || TICKER_PROFILES.SPX;
  const decimals = externalDecimals ?? (activeTicker === 'QQQ' || activeTicker === 'SPY' ? 2 : 0);

  // ----------------------------------------------------------------
  // REAL DATA LAYER (server SSE payload)
  // ----------------------------------------------------------------
  // The headline dealer/physics metrics below are sourced from the live server
  // payload when present. gex_profile is premium-gated (tier 3+) so it can be
  // undefined — every read is guarded and we fall back to the local model only
  // for values the payload does not supply. `liveGex` therefore reflects the
  // ACTUAL dealer book when available, not the hardcoded TICKER_PROFILES.
  const liveGex = serverState?.gex_profile;
  const liveSpot = useMemo(() => {
    const fromMap = serverState?.liveSpotPrices?.[activeTicker];
    if (typeof fromMap === 'number' && isFinite(fromMap) && fromMap > 0) return fromMap;
    if (typeof liveGex?.spot === 'number' && isFinite(liveGex.spot) && liveGex.spot > 0) return liveGex.spot;
    return undefined;
  }, [serverState, activeTicker, liveGex]);

  // True only when the server reports a live option chain AND we actually have a
  // real gex profile to render. Drives the feed badge: LIVE vs MODEL.
  const isLive = Boolean(serverState?.chain_live && liveGex);

  // Helper: a finite number > 0 (used to validate optional payload fields).
  const numOr = (v: unknown, fallback: number): number =>
    typeof v === 'number' && isFinite(v) ? v : fallback;

  // Resolve design tokens once for any raw color literals used in inline styles
  // or chart/canvas color values, so they track the shared theme.
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string, f: string) => { const v = css.getPropertyValue(n).trim(); return v || f; };
  const C = {
    success: tok('--success', '#4ADE80'),
    danger: tok('--danger', '#F87171'),
    warning: tok('--warning', '#FBBF24'),
    info: tok('--info', '#60A5FA'),
    textPrimary: tok('--text-primary', '#E5E5E5'),
  };

  // Local calculation states
  const [ticker, setTicker] = useState<string>(activeTicker);
  const [profile, setProfile] = useState<TICKER_PROFILE_METRICS>(customProfile);
  const [systemState, setSystemState] = useState<'SYSTEM ACTIVE' | 'COMPUTING...'>('SYSTEM ACTIVE');

  // Control over surface topography model setting: 'call' | 'put' | 'neutral'
  const [surfaceMode, setSurfaceMode] = useState<'call' | 'put' | 'neutral' | 'gex'>('neutral');

  // Dynamic Breeden-Litzenberger RND Layer state
  const [showRnd, setShowRnd] = useState<boolean>(false);

  // Live options stream simulation control (Slayer Terminal Standard)
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [streamTick, setStreamTick] = useState<number>(0);

  // Fullscreen expansion and resize coordination
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [resizeKey, setResizeKey] = useState<number>(0);

  // High frequency simulation ticking loop
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setStreamTick(prev => prev + 1);
    }, 450);
    return () => clearInterval(interval);
  }, [isStreaming]);

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

  // NOTE: window-resize is handled in-place inside the Three.js effect below via
  // renderer.setSize() (cheap). We deliberately do NOT bump resizeKey on every
  // resize — that re-keys the WebGL effect and tears down/rebuilds the entire
  // renderer/scene/geometry on each resize event (jank + GPU churn). resizeKey is
  // now only nudged on expand/collapse, where a full re-measure is actually needed.

  // 3D Matrix states - Ref based for 60 FPS non-blocking rotation dragging
  const targetRotRef = useRef<number>(35);
  const targetElevRef = useRef<number>(45);
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
    setSystemState('COMPUTING...');
    
    // Instant execution to remove slow rendering delays
    const asset = ASSET_LIST.find(a => a.ticker === selectedTk);
    if (asset) {
      storeSetAsset(asset);
    }
    setTicker(selectedTk);
    setProfile(TICKER_PROFILES[selectedTk] ?? TICKER_PROFILES.SPX);
    setSystemState('SYSTEM ACTIVE');
  };

  // Effective spot: real live spot when the server supplies it, otherwise the
  // local model value. When real, we do NOT add Math.sin jitter — a real quote
  // must not be perturbed by a cosmetic ripple.
  const effectiveSpot = liveSpot ?? profile.spot;

  // Effective headline metrics. Each field prefers the real gex_profile value
  // when present and falls back to the local model. Values the payload never
  // provides (VPIN, friction, vol-state copy, etc.) stay on the model and are
  // labelled MODEL in the UI.
  const effectiveProfile = useMemo(() => ({
    ...profile,
    spot: effectiveSpot,
    netGex: numOr(liveGex?.netGex, profile.netGex),
    netVex: numOr(liveGex?.netVex, profile.netVex),
    expectedMovePct: numOr(liveGex?.expectedMovePct, profile.expectedMovePct),
  }), [profile, effectiveSpot, liveGex]);

  // Synchronized active spot fluctuation price matching standard stream ticks.
  // Only the MODEL path gets the cosmetic tick; a real quote is passed through.
  const activeSpot = useMemo(() => {
    if (liveSpot !== undefined) return liveSpot;
    const priceTickFluctuation = isStreaming ? Math.sin(streamTick * 0.12) * (profile.spot * 0.0016) : 0;
    return profile.spot + priceTickFluctuation;
  }, [profile.spot, isStreaming, streamTick, liveSpot]);

  // Solves the Breeden-Litzenberger Risk Neutral Density Profile
  const rndAnalysis = useMemo(() => {
    return computeRndProfile(activeSpot, ticker, 30, 0.05, liveRealizedVol);
  }, [activeSpot, ticker, liveRealizedVol]);

  // Compute strikes table with completed call and put details.
  // Prefer the REAL per-strike GEX/OI/volume from the server payload when it
  // ships them; otherwise fall back to a clearly-labelled MODEL distribution.
  const realStrikes = useMemo(() => {
    const rs = liveGex?.strikes;
    if (Array.isArray(rs) && rs.length > 0) {
      return [...rs]
        .filter(s => typeof s?.strike === 'number')
        .sort((a, b) => b.strike - a.strike);
    }
    return undefined;
  }, [liveGex]);

  const impliedStrikes = useMemo(() => {
    if (realStrikes) return realStrikes;
    const list: GexStrikeDetail[] = [];

    // MODEL path only: synthesize a plausible distribution from the local profile.
    // The cosmetic stream tick is applied here purely to drive the model surface.
    const priceTickFluctuation = isStreaming ? Math.sin(streamTick * 0.12) * (profile.spot * 0.0016) : 0;
    const basePrice = profile.spot + priceTickFluctuation;
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
      
      // Fast pacing high-frequency volume ticks matching the flow ripple
      const callVolume = Math.round(callOi * 0.15 * (1 + Math.abs(Math.sin(streamTick * 0.2 + i)) * 0.4));
      const putVolume = Math.round(putOi * 0.15 * (1 + Math.abs(Math.cos(streamTick * 0.2 - i)) * 0.4));

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
  }, [ticker, profile, streamTick, isStreaming, realStrikes]);

  // Visible rows for the hedging-profile table: a window of ~9 strikes centered
  // on the effective spot. Works for both the real payload (arbitrary length)
  // and the 15-row model fallback (preserves the original 9-row view).
  const hedgingRows = useMemo(() => {
    const sorted = impliedStrikes; // already sorted descending
    if (sorted.length <= 9) return sorted;
    // Index of the strike closest to spot.
    let atmIdx = 0;
    let best = Infinity;
    sorted.forEach((s, i) => {
      const d = Math.abs(s.strike - effectiveSpot);
      if (d < best) { best = d; atmIdx = i; }
    });
    const start = Math.max(0, Math.min(sorted.length - 9, atmIdx - 4));
    return sorted.slice(start, start + 9);
  }, [impliedStrikes, effectiveSpot]);

  // Compute final Black-Scholes Greeks at active ATM zone (uses the effective
  // spot/expected-move so the Greeks track the real quote when it is live).
  const calculatedGreeks = useMemo(() => {
    const S = effectiveProfile.spot;
    const K = Math.round(S / (ticker === 'SPX' ? 25 : ticker === 'NDX' ? 100 : 5)) * (ticker === 'SPX' ? 25 : ticker === 'NDX' ? 100 : 5);
    const maturity = 14 / 365; // 2 weeks DTE
    return calculateBSMGreeks(S, K, maturity, effectiveProfile.expectedMovePct * 10, 0.05, 0.012, 'call');
  }, [effectiveProfile, ticker]);

  // Handle manual canvas mouse rotation and drag controls using momentum ref targets
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

    targetRotRef.current = (targetRotRef.current - dx * 0.45 + 360) % 360;
    targetElevRef.current = Math.max(15, Math.min(85, targetElevRef.current + dy * 0.45));
  };

  const handleMouseUpOrLeave = () => {
    mouseRef.current.isDown = false;
  };

  // Sync references for the rendering loop to completely avoid React stale closure re-renders
  const surfaceModeRef = useRef(surfaceMode);
  const impliedStrikesRef = useRef(impliedStrikes);
  const isStreamingRef = useRef(isStreaming);
  const showRndRef = useRef(showRnd);
  const tickerRef = useRef(ticker);
  const spotRef = useRef(effectiveSpot);
  const liveRvRef = useRef(liveRealizedVol);
  const liveSpotRef = useRef(liveSpot);

  useEffect(() => {
    surfaceModeRef.current = surfaceMode;
    impliedStrikesRef.current = impliedStrikes;
    isStreamingRef.current = isStreaming;
    showRndRef.current = showRnd;
    tickerRef.current = ticker;
    spotRef.current = effectiveSpot;
    liveRvRef.current = liveRealizedVol;
    liveSpotRef.current = liveSpot;
  }, [surfaceMode, impliedStrikes, isStreaming, showRnd, ticker, effectiveSpot, liveRealizedVol, liveSpot]);

  // Interactive High-Performance Continuous 3D WebGL Surface and Wireframe Loop via Three.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Retina & container adaptations size parameters
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 480;
    const h = rect.height || 360;

    // Create GPU-accelerated WebGLRenderer on the target canvas. The canvas is
    // keyed on resizeKey in the JSX, so every re-run of this effect gets a FRESH
    // canvas element — without that, recreating a renderer on a canvas that already
    // holds a (disposed) context throws "Canvas has an existing context of a
    // different type" and the surface freezes. Guard creation so a missing WebGL
    // context degrades gracefully instead of crashing the panel.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (err) {
      console.warn('[physics] WebGL unavailable — skipping 3D surface:', err);
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);

    // Initial Scene setup
    const scene = new THREE.Scene();

    // Perspective Camera setup
    const camera = new THREE.PerspectiveCamera(42, w / h, 1, 1000);

    // Add cinematic soft lighting
    // Three-point lighting for a sculpted, premium read of the surface.
    const ambientLight = new THREE.AmbientLight(0x202028, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(180, 320, 160);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8891a5, 0.8);
    fillLight.position.set(-220, 80, -120);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x4ade80, 0.45);
    rimLight.position.set(0, -160, -260);
    scene.add(rimLight);

    // Displace Plane Geometry representing options strike-vol matrix landscape (21 rows x 21 cols)
    const gridSize = 21;
    const geometry = new THREE.PlaneGeometry(160, 160, gridSize - 1, gridSize - 1);
    geometry.rotateX(-Math.PI / 2); // align flat to horizontal ground plane

    // Allocate initial custom vertex colors attribute buffer
    const colorAttribute = new THREE.BufferAttribute(new Float32Array(gridSize * gridSize * 3), 3);
    geometry.setAttribute('color', colorAttribute);

    // Solid Volumetric Shaded Mesh Material
    const surfaceMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.45,
      side: THREE.DoubleSide,
      envMapIntensity: 0.6
    });
    const surfaceMesh = new THREE.Mesh(geometry, surfaceMaterial);
    scene.add(surfaceMesh);

    // Glowing wireframe outlines overlay (sharing the EXACT SAME geometry!)
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x5a5a65,
      wireframe: true,
      transparent: true,
      opacity: 0.20
    });
    const wireMesh = new THREE.Mesh(geometry, wireframeMaterial);
    scene.add(wireMesh);

    // Render a vertical golden spot price indicator axis pole in the center
    const spotBarPoints = [new THREE.Vector3(0, -35, 0), new THREE.Vector3(0, 35, 0)];
    const spotBarGeom = new THREE.BufferGeometry().setFromPoints(spotBarPoints);
    const spotBarMaterial = new THREE.LineDashedMaterial({
      color: 0xfbbf24,
      dashSize: 4,
      gapSize: 3
    });
    const spotBarLine = new THREE.Line(spotBarGeom, spotBarMaterial);
    spotBarLine.computeLineDistances();
    scene.add(spotBarLine);

    // Sleek glowing golden floating spot orb
    const spotOrbGeom = new THREE.SphereGeometry(3.5, 16, 16);
    const spotOrbMaterial = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.95
    });
    const spotOrbMesh = new THREE.Mesh(spotOrbGeom, spotOrbMaterial);
    spotOrbMesh.position.set(0, 0, 0); // At center intersection
    scene.add(spotOrbMesh);

    // Dynamic pre-allocated buffer geometry structures for Breeden-Litzenberger Layer
    const RND_STEPS = 120;
    const rndImpliedGeometry = new THREE.BufferGeometry();
    const rndImpliedPositions = new Float32Array(RND_STEPS * 6 * 3);
    rndImpliedGeometry.setAttribute('position', new THREE.BufferAttribute(rndImpliedPositions, 3));

    const rndHistGeometry = new THREE.BufferGeometry();
    const rndHistPositions = new Float32Array(RND_STEPS * 6 * 3);
    rndHistGeometry.setAttribute('position', new THREE.BufferAttribute(rndHistPositions, 3));

    const rndImpliedMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    const rndImpliedMesh = new THREE.Mesh(rndImpliedGeometry, rndImpliedMaterial);
    scene.add(rndImpliedMesh);

    const rndHistMaterial = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    });
    const rndHistMesh = new THREE.Mesh(rndHistGeometry, rndHistMaterial);
    scene.add(rndHistMesh);

    const rndImpliedLinePositions = new Float32Array((RND_STEPS + 1) * 3);
    const rndImpliedLineGeometry = new THREE.BufferGeometry();
    rndImpliedLineGeometry.setAttribute('position', new THREE.BufferAttribute(rndImpliedLinePositions, 3));
    const rndImpliedLineMaterial = new THREE.LineBasicMaterial({
      color: 0x34d399,
      linewidth: 3
    });
    const rndImpliedLine = new THREE.Line(rndImpliedLineGeometry, rndImpliedLineMaterial);
    scene.add(rndImpliedLine);

    const rndHistLinePositions = new Float32Array((RND_STEPS + 1) * 3);
    const rndHistLineGeometry = new THREE.BufferGeometry();
    rndHistLineGeometry.setAttribute('position', new THREE.BufferAttribute(rndHistLinePositions, 3));
    const rndHistLineMaterial = new THREE.LineBasicMaterial({
      color: 0xfb7185,
      linewidth: 3
    });
    const rndHistLine = new THREE.Line(rndHistLineGeometry, rndHistLineMaterial);
    scene.add(rndHistLine);

    // Render GPU-offloaded ground axes grid for structural bounds
    const gridHelper = new THREE.GridHelper(160, 10, 0x27272a, 0x18181b);
    gridHelper.position.y = -35;
    scene.add(gridHelper);

    // Active camera rotation parameters (with momentum)
    let curRot = 35;
    let curElev = 45;

    // Timing clock for volumetric waves and rippling motion simulation
    const clock = new THREE.Clock();

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      const time = clock.getElapsedTime();

      // Smooth camera interpolation (dampened momentum rotation controls)
      curRot += (targetRotRef.current - curRot) * 0.12;
      curElev += (targetElevRef.current - curElev) * 0.12;

      // Translate polar angles to cartesian camera location
      const radius = 220;
      const phi = ((90 - curElev) * Math.PI) / 180;
      const theta = (curRot * Math.PI) / 180;

      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(0, -10, 0);

      // Re-map colors of wire contour overlay match active modes
      const currentMode = surfaceModeRef.current;
      if (currentMode === 'call') {
        wireframeMaterial.color.setHex(0x10b981);
      } else if (currentMode === 'put') {
        wireframeMaterial.color.setHex(0xef4444);
      } else if (currentMode === 'gex') {
        wireframeMaterial.color.setHex(0x67e8f9);
      } else {
        wireframeMaterial.color.setHex(0x5a5a65);
      }

      // Read current strikes data frame
      const currentStrikes = impliedStrikesRef.current;
      const positions = geometry.attributes.position;
      const colors = geometry.attributes.color;
      const maxBoundVal = 80;

      const strikePeaks = currentStrikes.map(s => ({
        offset: (((s.index ?? 0) / 7)) * maxBoundVal,
        netGex: s.netGex,
        callGex: s.callGex,
        putGex: s.putGex
      }));

      // Non-blocking vertex displacement buffer modifications (Slayer standard)
      for (let idx = 0; idx < positions.count; idx++) {
        const xVal = positions.getX(idx);
        const zVal = positions.getZ(idx);

        const uNorm = xVal / maxBoundVal;
        const vNorm = zVal / maxBoundVal;

        // Mathematical saddle surface foundation (GEX-profile mode skips it for a clean ridge)
        let yVal = currentMode === 'gex' ? 0 : 4.0 * Math.sin(uNorm * Math.PI) * Math.cos(vNorm * Math.PI);

        // Volatility peak deformations
        strikePeaks.forEach(pk => {
          const distanceRange = Math.abs(xVal - pk.offset);
          if (distanceRange < 24) {
            const weight = Math.cos((distanceRange / 24) * Math.PI / 2);
            const edgeFadeDiscounts = (1.0 - Math.abs(vNorm) * 0.45);
            
            if (currentMode === 'call') {
              yVal += (Math.abs(pk.callGex) / 1e6) * 12.0 * weight * edgeFadeDiscounts;
            } else if (currentMode === 'put') {
              yVal -= (Math.abs(pk.putGex) / 1e6) * 12.0 * weight * edgeFadeDiscounts;
            } else if (currentMode === 'gex') {
              yVal += (pk.netGex / 1e6) * 16.0 * weight * edgeFadeDiscounts;
            } else {
              yVal += (pk.netGex / 1e6) * 10.0 * weight * edgeFadeDiscounts;
            }
          }
        });

        // Structural saddle variance offsets (not applied in the literal GEX-profile mode)
        if (currentMode !== 'gex') yVal += (uNorm * uNorm - vNorm * vNorm) * 14.0;
        yVal = Math.max(-50, Math.min(50, yVal)); // Safe clipping constraints

        // Superimpose active fluid flow ripple if data stream is active
        if (isStreamingRef.current) {
          const waveRipple = 1.6 * Math.sin(uNorm * Math.PI * 2.5 + time * 3.5) * Math.cos(vNorm * Math.PI * 1.5 + time * 2.2);
          yVal += waveRipple;
        }

        positions.setY(idx, yVal);

        // Real-time vertex colors calculation
        let r = 0.4, g = 0.4, b = 0.4;
        const hPct = (yVal + 50) / 100;

        if (currentMode === 'call') {
          r = 0.05 + hPct * 0.15;
          g = 0.35 + hPct * 0.65;
          b = 0.25 + hPct * 0.25;
        } else if (currentMode === 'put') {
          r = 0.35 + hPct * 0.65;
          g = 0.05 + hPct * 0.15;
          b = 0.11 + hPct * 0.19;
        } else if (currentMode === 'gex') {
          // Diverging palette: cyan-green for positive (long) gamma, red for negative (short).
          const t = Math.max(-1, Math.min(1, yVal / 28));
          if (t >= 0) { r = 0.10; g = 0.45 + t * 0.45; b = 0.42; }
          else { r = 0.50 + (-t) * 0.40; g = 0.12; b = 0.18; }
        } else {
          r = 0.20 + hPct * 0.50;
          g = 0.22 + hPct * 0.48;
          b = 0.26 + hPct * 0.44;
        }

        colors.setXYZ(idx, r, g, b);
      }

      // Signal WebGL engine to transfer modified vertex heights and colors to GPU
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      geometry.computeVertexNormals();

      // -----------------------------------------------------------------
      // RND DISTRIBUTION OVERLAY CURTAINS
      // -----------------------------------------------------------------
      const isRndActive = showRndRef.current;
      rndImpliedMesh.visible = isRndActive;
      rndHistMesh.visible = isRndActive;
      rndImpliedLine.visible = isRndActive;
      rndHistLine.visible = isRndActive;

      if (isRndActive) {
        const currentTicker = tickerRef.current;
        const currentSpot = spotRef.current;
        // Real spot is passed through untouched; only the model path gets the
        // cosmetic ripple so the curtain doesn't appear artificially "alive".
        const isRealSpot = liveSpotRef.current !== undefined;
        const priceTickFluctuation = (!isRealSpot && isStreamingRef.current) ? Math.sin(time * 0.5) * (currentSpot * 0.0016) : 0;
        const activeSpot = currentSpot + priceTickFluctuation;

        const analysis = computeRndProfile(activeSpot, currentTicker, 30, 0.05, liveRvRef.current);
        const nodes = analysis.nodes;

        const impliedPosAttr = rndImpliedGeometry.attributes.position as THREE.BufferAttribute;
        const histPosAttr = rndHistGeometry.attributes.position as THREE.BufferAttribute;
        const impliedLinePosAttr = rndImpliedLineGeometry.attributes.position as THREE.BufferAttribute;
        const histLinePosAttr = rndHistLineGeometry.attributes.position as THREE.BufferAttribute;

        const floorY = -35;
        const zImplied = 20; // slice along forward edge
        const zHist = -20;   // slice along backward edge

        let maxDens = 0.001;
        nodes.forEach(n => {
          if (n.impliedDensity > maxDens) maxDens = n.impliedDensity;
          if (n.historicalDensity > maxDens) maxDens = n.historicalDensity;
        });

        const heightScaling = 45 / maxDens;

        for (let i = 0; i < RND_STEPS; i++) {
          const nodeA = nodes[i];
          const nodeB = nodes[i + 1];

          // Map strike range surrounding spotSurfaces (+/-30% moneyness)
          const xA = ((nodeA.strike - activeSpot) / (activeSpot * 0.30)) * 80;
          const xB = ((nodeB.strike - activeSpot) / (activeSpot * 0.30)) * 80;

          const yImpliedH = floorY + nodeA.impliedDensity * heightScaling;
          const yImpliedHNext = floorY + nodeB.impliedDensity * heightScaling;

          const yHistH = floorY + nodeA.historicalDensity * heightScaling;
          const yHistHNext = floorY + nodeB.historicalDensity * heightScaling;

          // Quad 1: Implied Mesh vertex triangles
          impliedPosAttr.setXYZ(i * 6 + 0, xA, floorY, zImplied);
          impliedPosAttr.setXYZ(i * 6 + 1, xA, yImpliedH, zImplied);
          impliedPosAttr.setXYZ(i * 6 + 2, xB, floorY, zImplied);

          impliedPosAttr.setXYZ(i * 6 + 3, xA, yImpliedH, zImplied);
          impliedPosAttr.setXYZ(i * 6 + 4, xB, yImpliedHNext, zImplied);
          impliedPosAttr.setXYZ(i * 6 + 5, xB, floorY, zImplied);

          // Quad 2: Historical Mesh vertex triangles
          histPosAttr.setXYZ(i * 6 + 0, xA, floorY, zHist);
          histPosAttr.setXYZ(i * 6 + 1, xA, yHistH, zHist);
          histPosAttr.setXYZ(i * 6 + 2, xB, floorY, zHist);

          histPosAttr.setXYZ(i * 6 + 3, xA, yHistH, zHist);
          histPosAttr.setXYZ(i * 6 + 4, xB, yHistHNext, zHist);
          histPosAttr.setXYZ(i * 6 + 5, xB, floorY, zHist);

          // Boundaries Lines
          impliedLinePosAttr.setXYZ(i, xA, yImpliedH, zImplied);
          histLinePosAttr.setXYZ(i, xA, yHistH, zHist);
        }

        // Set last line elements
        const lastIndex = RND_STEPS;
        const lastNode = nodes[lastIndex];
        const lastX = ((lastNode.strike - activeSpot) / (activeSpot * 0.30)) * 80;
        impliedLinePosAttr.setXYZ(lastIndex, lastX, floorY + lastNode.impliedDensity * heightScaling, zImplied);
        histLinePosAttr.setXYZ(lastIndex, lastX, floorY + lastNode.historicalDensity * heightScaling, zHist);

        impliedPosAttr.needsUpdate = true;
        histPosAttr.needsUpdate = true;
        impliedLinePosAttr.needsUpdate = true;
        histLinePosAttr.needsUpdate = true;
      }

      // Keep glowing price indicator orb perfectly attached to active matrix center height
      if (spotOrbMesh) {
        const centerIdx = Math.floor(positions.count / 2);
        spotOrbMesh.position.y = positions.getY(centerIdx);
      }

      // Draw the frame
      renderer.render(scene, camera);
    };

    // Initialize animation routine
    animate();

    const handleResize = () => {
      if (!canvas || !renderer || !camera) return;
      const b = canvas.getBoundingClientRect();
      const currentW = b.width || w;
      const currentH = b.height || h;
      renderer.setSize(currentW, currentH, false);
      camera.aspect = currentW / currentH;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);

    // Complete cleanup cycle to guarantee zero GPU memory or context leaks
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      renderer.forceContextLoss(); // release the GL context so the discarded canvas frees GPU memory
      geometry.dispose();
      surfaceMaterial.dispose();
      wireframeMaterial.dispose();
      spotBarGeom.dispose();
      spotBarMaterial.dispose();
      spotOrbGeom.dispose();
      spotOrbMaterial.dispose();

      // Dispose RND resources safely
      rndImpliedGeometry.dispose();
      rndImpliedMaterial.dispose();
      rndHistGeometry.dispose();
      rndHistMaterial.dispose();
      rndImpliedLineGeometry.dispose();
      rndImpliedLineMaterial.dispose();
      rndHistLineGeometry.dispose();
      rndHistLineMaterial.dispose();
    };
  }, [resizeKey]);



  return (
    <div className="w-full text-[color:var(--text-primary)] flex flex-col font-mono select-none antialiased min-h-[640px] relative px-1 py-1" id="skyseye-physics-dashboard-root">
      
      <style dangerouslySetInnerHTML={{__html: `
        .quant-terminal-grid {
          display: grid;
          grid-template-columns: 1fr 2.5fr 1fr;
          grid-template-rows: auto 1fr auto;
          gap: 16px;
          align-items: stretch;
        }
        .quant-panel {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 2px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .panel-header-alt {
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 800;
          color: var(--text-primary);
          font-size: 10px;
          letter-spacing: 0.15em;
        }
        .hud-label {
          color: var(--text-tertiary);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 3px;
        }
        .hud-value {
          font-size: 15.5px;
          font-weight: 700;
          font-family: "JetBrains Mono", monospace;
          color: var(--text-primary);
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
          color: var(--text-secondary);
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .greek-card span {
          font-size: 1.1rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-primary);
          font-weight: 600;
        }

        .greek-card .unit {
          font-size: 10px;
          color: var(--text-tertiary);
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
            <span className="w-2 h-2 rounded-full bg-[var(--surface)]" />
            <span className="text-[10px] font-black tracking-widest text-[var(--text-primary)] font-sans uppercase">
              DEALER MAP
            </span>
          </div>
          <div className="h-4 w-px bg-[var(--border)]" />
          
          <div className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1 rounded">
            <span className="text-[color:var(--text-tertiary)] text-[10px] font-bold">ACTIVE ASSET:</span>
            <span className="text-[var(--success)] font-extrabold text-[11px] font-mono tracking-wider">{ticker}</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-[10px]">
          {/* State Classifier indicator */}
          <div className="flex flex-col text-left">
            <span className="text-[color:var(--text-tertiary)] font-extrabold uppercase text-[10px] tracking-wider leading-none mb-1">STATUS</span>
            <span className={`font-black tracking-wide leading-none text-[10px] ${systemState === 'SYSTEM ACTIVE' ? 'text-[var(--success)]' : 'text-[var(--warning)] animate-pulse'}`}>
              ● {systemState}
            </span>
          </div>

          <div className="h-4 w-px bg-[var(--border)]" />

          <div className="flex flex-col text-left">
            <span className="text-[color:var(--text-tertiary)] font-extrabold uppercase text-[10px] tracking-wider leading-none mb-1 flex items-center gap-1.5">DEALER FLOW INTENSITY <SourceTag live={false} /></span>
            <span className="text-[color:var(--text-secondary)] font-bold leading-none text-[10px]">{profile.marketEnergy}</span>
          </div>

          <div className="h-4 w-px bg-[var(--border)]" />

          <div className="flex flex-col text-left">
            <span className="text-[color:var(--text-tertiary)] font-extrabold uppercase text-[10px] tracking-wider leading-none mb-1 flex items-center gap-1.5">MARKET CONDITION <SourceTag live={false} /></span>
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
              <Terminal className="w-3 h-3 text-[color:var(--text-tertiary)]" />
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm">
                <div className="hud-label flex items-center justify-between">
                  <span>NET DEALER GAMMA (GEX)</span>
                  <SourceTag live={isLive} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value tabular-nums ${effectiveProfile.netGex >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {fmtBn(effectiveProfile.netGex)}
                  </span>
                  <span className="text-[10px] text-[color:var(--text-tertiary)]">USD/sh</span>
                </div>
              </div>

              <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm">
                <div className="hud-label flex items-center justify-between">
                  <span>NET VANNA EXPOSURE (VEX)</span>
                  <SourceTag live={isLive} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value tabular-nums ${effectiveProfile.netVex >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {fmtBn(effectiveProfile.netVex)}
                  </span>
                  <span className="text-[10px] text-[color:var(--text-tertiary)]">USD/vol</span>
                </div>
              </div>

              <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm">
                <div className="hud-label flex items-center justify-between">
                  <span>NET CHARM EXPOSURE (CEX)</span>
                  <SourceTag live={false} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value tabular-nums ${effectiveProfile.netCex >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {fmtBn(effectiveProfile.netCex)}
                  </span>
                  <span className="text-[10px] text-[color:var(--text-tertiary)]">/24h</span>
                </div>
              </div>

              {/* Key dealer levels — rendered straight from the live gex_profile.
                  Only shown when the server actually supplies them (premium tier). */}
              {(typeof liveGex?.callWall === 'number' || typeof liveGex?.putWall === 'number' || typeof liveGex?.gammaFlip === 'number') && (
                <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm">
                  <div className="hud-label flex items-center justify-between">
                    <span>KEY DEALER LEVELS</span>
                    <SourceTag live={isLive} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider">Call Wall</span>
                      <span className="hud-value text-[var(--success)] text-[13px] tabular-nums">
                        {typeof liveGex?.callWall === 'number' ? liveGex.callWall.toFixed(decimals) : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider">Put Wall</span>
                      <span className="hud-value text-[var(--danger)] text-[13px] tabular-nums">
                        {typeof liveGex?.putWall === 'number' ? liveGex.putWall.toFixed(decimals) : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider">Flip</span>
                      <span className="hud-value text-[color:var(--info)] text-[13px] tabular-nums">
                        {typeof liveGex?.gammaFlip === 'number' ? liveGex.gammaFlip.toFixed(decimals) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Module 2: Strikes Hedging Profile (Complete Call and Put details rendered!) */}
          <div className="flex-1 flex flex-col justify-end" id="completed-hedging-profile">
            <div className="panel-header-alt mt-1.5">
              <span>HEDGING PROFILE</span>
              <div className="flex items-center gap-2">
                <SourceTag live={Boolean(realStrikes)} />
                <Layers className="w-3 h-3 text-[color:var(--text-tertiary)]" />
              </div>
            </div>

            <div className="flex flex-col gap-[3px] bg-[var(--surface-2)] p-2.5 border border-[var(--border)] rounded-sm flex-1 overflow-y-auto max-h-[220px]">
              {/* Header */}
              <div className="grid grid-cols-5 text-[10px] text-[color:var(--text-tertiary)] font-extrabold uppercase border-b border-[var(--border)] pb-1.5 mb-1 tracking-wider text-center">
                <span className="text-left">C_GEX</span>
                <span>C_OI</span>
                <span className="text-[color:var(--text-secondary)]">STRIKE</span>
                <span>P_OI</span>
                <span className="text-right">P_GEX</span>
              </div>

              {hedgingRows.map((strRow) => {
                const isAtSpotIdx = Math.abs(strRow.strike - effectiveProfile.spot) === Math.min(...hedgingRows.map(s => Math.abs(s.strike - effectiveProfile.spot)));
                const isPositive = strRow.netGex >= 0;
                return (
                  <div
                    key={strRow.strike}
                    className={`grid grid-cols-5 text-[10px] tabular-nums font-mono py-1 px-1 items-center justify-center text-center border border-[var(--border)] relative rounded-sm transition-all duration-150 ${
                      isAtSpotIdx
                        ? 'bg-[var(--surface-2)] border border-[var(--border-strong)] ring-[1px] ring-[var(--border-strong)]'
                        : isPositive
                          ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--success)]'
                          : 'bg-rose-950/20 border-rose-900/35 text-[var(--danger)]'
                    }`}
                  >
                    <span className="text-[var(--success)] text-left font-bold px-0.5 tabular-nums">{(strRow.callGex / 1e6).toFixed(1)}M</span>
                    <span className="text-[color:var(--text-tertiary)] font-medium tabular-nums">{Math.round(strRow.callOi / 100)}h</span>
                    <span className={`font-black font-mono text-[10px] tabular-nums ${isAtSpotIdx ? 'text-[var(--text-primary)]' : 'text-[color:var(--text-secondary)]'}`}>{fmtNum(strRow.strike)}</span>
                    <span className="text-[color:var(--text-tertiary)] font-medium tabular-nums">{Math.round(strRow.putOi / 100)}h</span>
                    <span className="text-[var(--danger)] text-right font-bold px-0.5 tabular-nums">{(strRow.putGex / 1e6).toFixed(1)}M</span>
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
            ? "fixed inset-0 z-[999] bg-[var(--surface)] backdrop-blur-md p-6 flex flex-col justify-between gap-4 animate-fade-in"
            : "quant-panel flex-1 justify-between flex flex-col p-4 relative min-h-[500px]"
          } 
          id="pane-center"
        >
          
          {/* Top Panel Control Row for Morph Surface Shifts */}
          <div className="flex justify-between items-center border-b border-[var(--border)] pb-3 mb-2" id="canvas-control-overlay">
            <div className="flex items-center gap-3">
              {isExpanded && (
                <span className="text-[10px] font-black tracking-widest text-black font-mono uppercase bg-[var(--success)] border border-[var(--border)] px-2 py-1 rounded-sm">
                  FULLSCREEN VIEW
                </span>
              )}
              <div className="flex gap-1 bg-[var(--surface-2)] p-0.5 border border-[var(--border)] rounded-sm">
                <button
                  type="button"
                  onClick={() => setSurfaceMode('neutral')}
                  className={`px-3 py-1 text-[10px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] transition-colors ${surfaceMode === 'neutral' ? 'bg-[var(--surface-3)] text-[color:var(--text-secondary)]' : 'text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'}`}
                >
                  ● NEUTRAL VIEW
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode('call')}
                  className={`px-3 py-1 text-[10px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] transition-colors ${surfaceMode === 'call' ? 'bg-[var(--surface-3)] border border-[var(--border)] text-[var(--success)]' : 'text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'}`}
                >
                  CALL WALL VIEW
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode('put')}
                  className={`px-3 py-1 text-[10px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] transition-colors ${surfaceMode === 'put' ? 'bg-rose-950 border border-rose-900 text-[var(--danger)]' : 'text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'}`}
                >
                  PUT WALL VIEW
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode('gex')}
                  className={`px-3 py-1 text-[10px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] transition-colors ${surfaceMode === 'gex' ? 'bg-cyan-950/50 border border-cyan-900 text-[#67e8f9]' : 'text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'}`}
                >
                  GEX PROFILE
                </button>
                <button
                  type="button"
                  onClick={() => setShowRnd(!showRnd)}
                  className={`px-3 py-1 text-[10px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] transition-all ${showRnd ? 'bg-emerald-950/60 border border-emerald-900/50 text-[var(--success)]' : 'text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'}`}
                  title="Toggle Implied vs Historical Probability Density"
                >
                  {showRnd ? '● HIDE DENSITY' : '○ SHOW DENSITY'}
                </button>
              </div>

              {/* Data-source indicator.
                  - When the server reports a real, live option chain (isLive), this
                    is a genuine LIVE feed: green pulsing dot, label "FEED: LIVE".
                  - Otherwise the surface is driven by a local quantitative MODEL.
                    The click toggles the model's cosmetic animation only; it never
                    claims a live feed and there is no "60Hz" / pulsing live dot. */}
              {isLive ? (
                <div
                  className="flex items-center gap-2 px-2.5 py-1 rounded-xs border select-none bg-emerald-950/20 border-emerald-900/50 text-[var(--success)]"
                  title="Live option chain feed from the server"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                  <span className="text-[10px] font-black tracking-widest uppercase font-mono">
                    FEED: LIVE
                  </span>
                </div>
              ) : (
                <div
                  onClick={() => setIsStreaming(!isStreaming)}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-xs border cursor-pointer select-none transition-all bg-[color:var(--surface-2)] border-[color:var(--border)] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]"
                  title="No live feed — surface is a local model. Click to toggle the model animation."
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-[color:var(--warning)]' : 'bg-[color:var(--text-tertiary)]'}`} />
                  <span className="text-[10px] font-black tracking-widest uppercase font-mono">
                    MODEL: {isStreaming ? 'ANIMATED' : 'PAUSED'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[10px] text-[color:var(--text-tertiary)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 rounded-sm uppercase tracking-wider font-extrabold">
                DRAG TO ROTATE
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-[var(--surface-2)] hover:mirror-panel hover:border-[var(--border-strong)] text-[color:var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-xs p-1.5 px-3 transition-all text-[10px] font-bold flex items-center gap-1 cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
                title={isExpanded ? "Exit Fullscreen" : "Expand to Fullscreen"}
              >
                <span>{isExpanded ? " COLLAPSE [ESC]" : " EXPAND"}</span>
              </button>
            </div>
          </div>

          {/* Interactive 3D Canvas Box */}
          <div className="flex-1 relative bg-[var(--surface)] border border-[var(--border)] rounded-sm overflow-hidden animate-fade-in" id="canvas-stage-wrapper">
            <canvas
              key={resizeKey}
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
            />
            {/* Axis + active-mode legend (HTML overlay — keeps the abstract surface legible) */}
            <div className="absolute bottom-2 left-3 z-10 pointer-events-none flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-full" style={{ background: surfaceMode === 'call' ? C.success : surfaceMode === 'put' ? C.danger : surfaceMode === 'gex' ? '#67e8f9' : '#a1a1aa' }} />
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-[color:var(--text-tertiary)]">
                  {surfaceMode === 'call' ? 'Call-wall gamma' : surfaceMode === 'put' ? 'Put-wall gamma' : surfaceMode === 'gex' ? 'Net GEX profile' : 'Net gamma (blended)'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-[color:var(--text-tertiary)] uppercase tracking-[0.2em]">← strikes →</span>
            </div>
            <div className="absolute top-2 right-3 z-10 pointer-events-none text-[10px] font-mono text-[color:var(--text-tertiary)] uppercase tracking-[0.2em]">
              height ↑ exposure
            </div>
          </div>

          {/* Breeden-Litzenberger Risk-Neutral Density Analysis Console Panel */}
          {showRnd && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="mt-3 bg-neutral-950/70 border border-emerald-950/40 p-4 rounded-sm flex flex-col md:flex-row gap-4 font-mono select-none"
              id="rnd-analytics-console"
            >
              <div className="w-full md:w-5/12 flex flex-col justify-between gap-3 text-left">
                <div>
                  <div className="text-[10px] font-black tracking-widest text-[var(--success)] uppercase mb-2 flex items-center gap-1.5 border-b border-emerald-950 pb-1">
                    <Layers className="w-3.5 h-3.5" />
                    <span>RISK-NEUTRAL DENSITY (RND)</span>
                  </div>
                  <p className="text-[10px] text-[color:var(--text-tertiary)] leading-normal mb-3">
                    Shows the market-implied probability of each price level at expiry, derived from option prices across strikes:
                    <span className="text-[color:var(--text-secondary)] font-bold"> f(K) = e^(rT) ∂²C/∂K²</span>.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[var(--surface-2)] p-2.5 border border-[#1e293b]/30 rounded-sm">
                    <div className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-widest font-black">Implied Gamma Peak</div>
                    <div className="text-[11px] font-black text-[var(--success)] mt-0.5 tabular-nums">
                      {rndAnalysis.gexConcentrationPeak.toFixed(1)} <span className="text-[10px] text-[color:var(--text-tertiary)] font-normal">pts</span>
                    </div>
                  </div>

                  <div className="bg-[var(--surface-2)] p-2.5 border border-[#1e293b]/30 rounded-sm">
                    <div className="text-[10px] text-[#f43f5e] uppercase tracking-widest font-black">Implied vs Hist Divergence</div>
                    <div className="text-[11px] font-black text-[#f43f5e] mt-0.5 tabular-nums">
                      {rndAnalysis.entropyDivergence.toFixed(4)} <span className="text-[10px] text-[color:var(--text-tertiary)] font-normal">nats</span>
                    </div>
                  </div>

                  <div className="bg-[var(--surface-2)] p-2.5 border border-[#1e293b]/30 rounded-sm">
                    <div className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-widest font-black">Implied Price Mean</div>
                    <div className="text-[10.5px] font-bold text-[color:var(--text-secondary)] mt-0.5 tabular-nums">
                      {rndAnalysis.impliedMean.toFixed(2)} <span className="text-[10px] text-[color:var(--text-tertiary)] font-normal">avg</span>
                    </div>
                  </div>

                  <div className="bg-[#1c1917]/20 p-2.5 border border-stone-800 rounded-sm">
                    <div className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-widest font-black">Hist Price Mean</div>
                    <div className="text-[10.5px] font-bold text-[color:var(--text-secondary)] mt-0.5 tabular-nums">
                      {rndAnalysis.historicalMean.toFixed(2)} <span className="text-[10px] text-[color:var(--text-tertiary)] font-normal">avg</span>
                    </div>
                  </div>

                  <div className="bg-[var(--surface-2)] p-2.5 border border-[#1e293b]/30 rounded-sm col-span-2">
                    <div className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-widest font-black">Implied Price Range (1 Std Dev)</div>
                    <div className="flex justify-between items-baseline mt-0.5">
                      <span className="text-[11px] font-black text-[var(--success)] tabular-nums">
                        ±{rndAnalysis.impliedStdDev.toFixed(1)} <span className="text-[10px] text-[color:var(--text-tertiary)] font-normal">pts</span>
                      </span>
                      <span className="text-[10px] text-rose-400 text-right tabular-nums">
                        Realized Vol Range: ±{rndAnalysis.historicalStdDev.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] leading-relaxed text-[color:var(--text-tertiary)] border-l-2 border-emerald-500 pl-2 bg-emerald-950/10 py-1.5">
                  <span className="font-extrabold text-[var(--success)] text-[10px] uppercase block tracking-wider mb-0.5">Dealer Hedging Read:</span>
                  {rndAnalysis.entropyDivergence > 0.04
                    ? "Heavy put skew. Traders are paying a large premium for downside protection relative to historical vol, signaling fear of a sharp drop."
                    : "Vol expectations are balanced and tight. Implied tail pricing is close to realized vol with low extra premium."
                  }
                </div>
              </div>

              {/* Graphical distribution density comparator block */}
              <div className="flex-1 min-h-[180px] bg-[var(--surface-2)] border border-[#1e293b]/30 p-2 rounded-sm flex flex-col">
                <div className="text-[10px] font-black tracking-widest text-[color:var(--text-tertiary)] uppercase mb-2 flex justify-between items-center px-1 border-b border-[var(--border)] pb-1.5">
                  <span>PRICE PROBABILITY BY STRIKE (x: STRIKE / y: PROBABILITY)</span>
                  <div className="flex gap-3">
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> OPTION-IMPLIED</span>
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase"><span className="w-1.5 h-1.5 rounded-full bg-[#f43f5e]" /> HISTORICAL</span>
                  </div>
                </div>
                <div className="flex-1 relative min-h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={rndAnalysis.nodes} margin={{ top: 5, right: 3, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="1 3" stroke="#222" />
                      <XAxis 
                        dataKey="strike" 
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => Math.round(v).toString()}
                        tick={{ fill: '#71717a', fontSize: '10px', fontFamily: 'monospace' }}
                        stroke="#111"
                      />
                      <YAxis 
                        tick={{ fill: '#71717a', fontSize: '10px', fontFamily: 'monospace' }}
                        stroke="#111"
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#09090b] border border-[#1e293b] p-2 text-mono text-[10px] space-y-1 rounded-sm shadow-xl tabular-nums">
                                <div className="text-[color:var(--text-secondary)] font-bold border-b border-[#27272a] pb-0.5 mb-1 text-[10px]">Strike: {fmtNum(Math.round(data.strike))}</div>
                                <div className="text-[#10b981] flex justify-between gap-4"><span>Option-Implied:</span> <span>{(data.impliedDensity * 100).toFixed(4)}%</span></div>
                                <div className="text-[#f43f5e] flex justify-between gap-4"><span>Historical:</span> <span>{(data.historicalDensity * 100).toFixed(4)}%</span></div>
                                <div className="text-sky-400 flex justify-between gap-4"><span>Implied Vol:</span> <span>{(data.impliedVol * 100).toFixed(2)}%</span></div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="impliedDensity" 
                        stroke="#10b981" 
                        strokeWidth={1.5}
                        fill="url(#colorImplied)" 
                        fillOpacity={0.15}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="historicalDensity" 
                        stroke="#f43f5e" 
                        strokeWidth={1.5}
                        fill="url(#colorHist)" 
                        fillOpacity={0.10}
                      />
                      <defs>
                        <linearGradient id="colorImplied" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorHist" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}
        </main>

        {/* ------------------------------------------------------------
         RIGHT PANE (STRUCTURE ANALYSIS & PROPAGATION MODELS)
         ------------------------------------------------------------ */}
        <aside className="quant-panel flex-1 justify-between flex flex-col min-h-[500px]" id="pane-right">
          
          {/* Module 1: Market Structuring parameters */}
          <div className="mb-4">
            <div className="panel-header-alt">
              <span>VOLATILITY & ORDER FLOW</span>
              <ShieldAlert className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm">
                <div className="hud-label flex items-center justify-between">
                  <span>FORWARD VARIANCE (IV^2)</span>
                  <SourceTag live={false} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="hud-value text-sky-400 tabular-nums">
                    {profile.fwdVar.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-[color:var(--text-tertiary)]">v2_std</span>
                </div>
              </div>

              <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm">
                <div className="hud-label flex items-center justify-between">
                  <span className="text-[var(--danger)]/90">ORDER FLOW IMBALANCE (VPIN)</span>
                  <SourceTag live={false} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value tabular-nums ${profile.vpinColor}`}>
                    {profile.vpin}
                  </span>
                </div>
              </div>

              <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm">
                <div className="hud-label flex items-center justify-between">
                  <span>BID/ASK FRICTION (Λ)</span>
                  <SourceTag live={false} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="hud-value text-[color:var(--text-primary)] tabular-nums">
                    {profile.friction.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-[color:var(--text-tertiary)]">coeff</span>
                </div>
              </div>
            </div>
          </div>

          {/* Module 2: Expected Propagation & target probability limits */}
          <div className="flex-1 flex flex-col justify-end" id="target-propagation-module">
            <div className="panel-header-alt mt-1.5">
              <span>PRICE TARGET RANGE (95% CI)</span>
              <Compass className="w-3 h-3 text-[color:var(--text-tertiary)]" />
            </div>

            <div className="bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-sm flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                {/* These three are illustrative model constants — there is no live
                    source for them in the payload, so they are tagged MODEL. */}
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-[color:var(--text-tertiary)] font-black tracking-widest uppercase flex items-center gap-1.5">
                    Theta Decay Rate (per hr) <SourceTag live={false} />
                  </span>
                  <span className="text-[color:var(--text-secondary)] font-bold tabular-nums">-0.842v / hr</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-[color:var(--text-tertiary)] font-black tracking-widest uppercase flex items-center gap-1.5">
                    Spread Friction (Λ) <SourceTag live={false} />
                  </span>
                  <span className="text-[color:var(--text-secondary)] font-bold tabular-nums">1.22μ</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-[color:var(--text-tertiary)] font-black tracking-widest uppercase flex items-center gap-1.5">
                    Dealer Hedge Activity <SourceTag live={false} />
                  </span>
                  <span className="text-[color:var(--text-secondary)] font-bold tabular-nums">94.2%</span>
                </div>
                <div className="h-px bg-[var(--border)] my-1" />
              </div>

              <div className="pt-3">
                <div className="flex justify-between items-center text-[10px] text-[color:var(--text-secondary)] font-extrabold pb-1">
                  <span className="flex items-center gap-1.5">95% CI <SourceTag live={isLive} /></span>
                  <span>RANGE</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-[10.5px] font-mono tabular-nums">
                  <span className="text-[var(--danger)] bg-rose-950/20 border border-[var(--danger)]/40 py-1.5 rounded-sm tabular-nums">
                    {(effectiveProfile.spot * (1 - 1.96 * effectiveProfile.expectedMovePct)).toFixed(decimals === 0 ? 0 : 2)}
                  </span>
                  <span className="text-[var(--success)] bg-[var(--surface-2)] border border-[var(--border)] py-1.5 rounded-sm tabular-nums">
                    {(effectiveProfile.spot * (1 + 1.96 * effectiveProfile.expectedMovePct)).toFixed(decimals === 0 ? 0 : 2)}
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
          <div className="panel-header-alt">
            <span>ATM GREEKS (BLACK-SCHOLES)</span>
            <div className="flex items-center gap-2">
              {/* Greeks are a BSM model evaluation; the inputs (spot) are live when
                  available, but the values themselves are computed, not fed. */}
              <SourceTag live={false} />
            </div>
          </div>
          <div className="greeks-horizontal-grid">
            
            {/* CARD 1: SPOT DELTA INTEGRATION */}
            <div className="greek-card">
              <label>
                <Activity className="w-3.5 h-3.5 text-[var(--success)] icon-small" />
                DELTA
              </label>
              <span className="tabular-nums">
                {calculatedGreeks.delta.toFixed(4)} <span className="unit">Δ</span>
              </span>
            </div>

            {/* CARD 2: SPOT GAMMA CONVEXITY */}
            <div className="greek-card">
              <label>
                <GitCommit className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] icon-small" />
                GAMMA (how fast delta changes)
              </label>
              <span className="tabular-nums">
                {calculatedGreeks.gamma.toFixed(6)} <span className="unit">Γ</span>
              </span>
            </div>

            {/* CARD 3: VANNA COVARIANCE */}
            <div className="greek-card">
              <label>
                <Percent className="w-3.5 h-3.5 text-[var(--danger)] icon-small" />
                VANNA (delta shift per vol move)
              </label>
              <span className="tabular-nums">
                {calculatedGreeks.vanna.toFixed(4)} <span className="unit">∂Δ/∂Σ</span>
              </span>
            </div>

            {/* CARD 4: CHARM DECAY SPEED */}
            <div className="greek-card">
              <label>
                <Clock className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] icon-small" />
                CHARM (delta decay per day)
              </label>
              <span className="tabular-nums">
                {calculatedGreeks.charm.toFixed(4)} <span className="unit">∂Δ/∂T</span>
              </span>
            </div>

            {/* CARD 5: ATM MAGNET STRIKE */}
            <div className="greek-card">
              <label>
                <Crosshair className="w-3.5 h-3.5 text-sky-400 icon-small" />
                MAGNET STRIKE
              </label>
              <span className="text-sky-400 tabular-nums">
                {effectiveProfile.spot.toFixed(decimals)} <span className="unit">ATM</span>
              </span>
            </div>

          </div>
        </div>
      </footer>



    </div>
  );
}
