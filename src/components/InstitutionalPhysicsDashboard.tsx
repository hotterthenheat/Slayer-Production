/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as THREE from 'three';
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
    vpinColor: 'text-[#F87171]',
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
    vpinColor: 'text-amber-400',
    friction: 0.0008,
    volState: 'VOL FALLING',
    marketEnergy: '0.288 λ',
    impliedRegime: 'EQUILIBRIUM / BALANCED',
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
    vpinColor: 'text-[#F87171]',
    friction: 0.0035,
    volState: 'HIGH VOL / UNSTABLE',
    marketEnergy: '0.748 λ',
    impliedRegime: 'TRENDING / UNSTABLE',
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

  // Local calculation states
  const [ticker, setTicker] = useState<string>(activeTicker);
  const [profile, setProfile] = useState<TICKER_PROFILE_METRICS>(customProfile);
  const [systemState, setSystemState] = useState<'SYSTEM ACTIVE' | 'COMPUTING CASCADE...'>('SYSTEM ACTIVE');

  // Control over surface topography model setting: 'call' | 'put' | 'neutral'
  const [surfaceMode, setSurfaceMode] = useState<'call' | 'put' | 'neutral'>('neutral');

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

  // Synchronized active spot fluctuation price matching standard stream ticks
  const activeSpot = useMemo(() => {
    const priceTickFluctuation = isStreaming ? Math.sin(streamTick * 0.12) * (profile.spot * 0.0016) : 0;
    return profile.spot + priceTickFluctuation;
  }, [profile.spot, isStreaming, streamTick]);

  // Solves the Breeden-Litzenberger Risk Neutral Density Profile
  const rndAnalysis = useMemo(() => {
    return computeRndProfile(activeSpot, ticker, 30, 0.05, liveRealizedVol);
  }, [activeSpot, ticker, liveRealizedVol]);

  // Compute strikes table with completed call and put details (Real-time dynamic data binding)
  const impliedStrikes = useMemo(() => {
    const list: GexStrikeDetail[] = [];
    
    // Infuse high frequency real-time pricing ticks if active
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
  }, [ticker, profile, streamTick, isStreaming]);

  // Compute final Black-Scholes Greeks at active ATM zone
  const calculatedGreeks = useMemo(() => {
    const S = profile.spot;
    const K = Math.round(S / (ticker === 'SPX' ? 25 : ticker === 'NDX' ? 100 : 5)) * (ticker === 'SPX' ? 25 : ticker === 'NDX' ? 100 : 5);
    const maturity = 14 / 365; // 2 weeks DTE
    return calculateBSMGreeks(S, K, maturity, profile.expectedMovePct * 10, 0.05, 0.012, 'call');
  }, [profile, ticker]);

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
  const spotRef = useRef(profile.spot);
  const liveRvRef = useRef(liveRealizedVol);

  useEffect(() => {
    surfaceModeRef.current = surfaceMode;
    impliedStrikesRef.current = impliedStrikes;
    isStreamingRef.current = isStreaming;
    showRndRef.current = showRnd;
    tickerRef.current = ticker;
    spotRef.current = profile.spot;
    liveRvRef.current = liveRealizedVol;
  }, [surfaceMode, impliedStrikes, isStreaming, showRnd, ticker, profile.spot, liveRealizedVol]);

  // Interactive High-Performance Continuous 3D WebGL Surface and Wireframe Loop via Three.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Retina & container adaptations size parameters
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 480;
    const h = rect.height || 360;

    // Create GPU-accelerated WebGLRenderer on the target canvas
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);

    // Initial Scene setup
    const scene = new THREE.Scene();

    // Perspective Camera setup
    const camera = new THREE.PerspectiveCamera(42, w / h, 1, 1000);

    // Add cinematic soft lighting
    const ambientLight = new THREE.AmbientLight(0x1a1a1f, 1.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(200, 300, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x71717a, 1.0);
    dirLight2.position.set(-200, -100, -100);
    scene.add(dirLight2);

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
      roughness: 0.20,
      metalness: 0.30,
      side: THREE.DoubleSide
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

        // Mathematical saddle surface foundation
        let yVal = 4.0 * Math.sin(uNorm * Math.PI) * Math.cos(vNorm * Math.PI);

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
            } else {
              yVal += (pk.netGex / 1e6) * 10.0 * weight * edgeFadeDiscounts;
            }
          }
        });

        // Structural saddle variance offsets
        yVal += (uNorm * uNorm - vNorm * vNorm) * 14.0;
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
        const priceTickFluctuation = isStreamingRef.current ? Math.sin(time * 0.5) * (currentSpot * 0.0016) : 0;
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
              DEALER MAP
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
            <span className="text-zinc-650 font-extrabold uppercase text-[7px] tracking-wider leading-none mb-1">STATUS</span>
            <span className={`font-black tracking-wide leading-none text-[10px] ${systemState === 'SYSTEM ACTIVE' ? 'text-[#4ADE80]' : 'text-amber-500 animate-pulse'}`}>
              ● {systemState}
            </span>
          </div>
          
          <div className="h-4 w-px bg-black" />

          <div className="flex flex-col text-left">
            <span className="text-zinc-650 font-extrabold uppercase text-[7px] tracking-wider leading-none mb-1">DEALER FLOW INTENSITY</span>
            <span className="text-zinc-200 font-bold leading-none text-[10px]">{profile.marketEnergy}</span>
          </div>

          <div className="h-4 w-px bg-black" />

          <div className="flex flex-col text-left">
            <span className="text-zinc-650 font-extrabold uppercase text-[7px] tracking-wider leading-none mb-1">MARKET CONDITION</span>
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
                <div className="hud-label">NET DEALER GAMMA (GEX)</div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value ${profile.netGex >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                    {fmtBn(profile.netGex)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">USD/sh</span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">NET VANNA EXPOSURE (VEX)</div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value ${profile.netVex >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                    {fmtBn(profile.netVex)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">USD/vol</span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">NET CHARM EXPOSURE (CEX)</div>
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
                  FULLSCREEN VIEW
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
                <button
                  type="button"
                  onClick={() => setShowRnd(!showRnd)}
                  className={`px-3 py-1 text-[8.5px] uppercase font-extrabold tracking-wider rounded-xs focus:outline-none transition-all ${showRnd ? 'bg-emerald-950/60 border border-emerald-900/50 text-[#4ADE80]' : 'text-zinc-500 hover:text-zinc-400'}`}
                  title="Toggle Implied vs Historical Probability Density"
                >
                  {showRnd ? '● HIDE DENSITY' : '○ SHOW DENSITY'}
                </button>
              </div>

              {/* Quantum Live Telemetry Stream Indicator and Controls */}
              <div 
                onClick={() => setIsStreaming(!isStreaming)} 
                className={`flex items-center gap-2 px-2.5 py-1 rounded-xs border cursor-pointer select-none transition-all ${
                  isStreaming 
                    ? 'bg-emerald-950/20 border-emerald-900/50 text-[#4ADE80] hover:bg-emerald-950/30' 
                    : 'bg-[#120808]/40 border-rose-950/70 text-rose-500 hover:bg-rose-950/20'
                }`}
                title="Click to toggle live options data feed"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-[#4ADE80] animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-[7.5px] font-black tracking-widest uppercase font-mono">
                  FEED: {isStreaming ? 'ACTIVE [60Hz]' : 'INACTIVE'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[7px] text-zinc-550 border border-black bg-black px-2.5 py-1.5 rounded-sm uppercase tracking-wider font-extrabold">
                DRAG TO ROTATE
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
          <div className="flex-1 relative bg-black border border-black rounded-sm overflow-hidden animate-fade-in" id="canvas-stage-wrapper">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
            />
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
                  <div className="text-[10px] font-black tracking-widest text-[#4ADE80] uppercase mb-2 flex items-center gap-1.5 border-b border-emerald-950 pb-1">
                    <Layers className="w-3.5 h-3.5" />
                    <span>RISK-NEUTRAL DENSITY (RND)</span>
                  </div>
                  <p className="text-[7.5px] text-zinc-500 leading-normal mb-3">
                    Shows the market-implied probability of each price level at expiry, derived from option prices across strikes:
                    <span className="text-zinc-400 font-bold"> f(K) = e^(rT) ∂²C/∂K²</span>.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/60 p-2.5 border border-[#1e293b]/30 rounded-sm">
                    <div className="text-[7px] text-zinc-500 uppercase tracking-widest font-black">Implied Gamma Peak</div>
                    <div className="text-[11px] font-black text-[#4ADE80] mt-0.5">
                      {rndAnalysis.gexConcentrationPeak.toFixed(1)} <span className="text-[7.5px] text-zinc-500 font-normal">pts</span>
                    </div>
                  </div>

                  <div className="bg-black/60 p-2.5 border border-[#1e293b]/30 rounded-sm">
                    <div className="text-[7px] text-[#f43f5e] uppercase tracking-widest font-black">Implied vs Hist Divergence</div>
                    <div className="text-[11px] font-black text-[#f43f5e] mt-0.5">
                      {rndAnalysis.entropyDivergence.toFixed(4)} <span className="text-[7.5px] text-zinc-500 font-normal">nats</span>
                    </div>
                  </div>

                  <div className="bg-black/60 p-2.5 border border-[#1e293b]/30 rounded-sm">
                    <div className="text-[7px] text-zinc-550 uppercase tracking-widest font-black">Implied Price Mean</div>
                    <div className="text-[10.5px] font-bold text-zinc-200 mt-0.5">
                      {rndAnalysis.impliedMean.toFixed(2)} <span className="text-[7.5px] text-zinc-500 font-normal">avg</span>
                    </div>
                  </div>

                  <div className="bg-[#1c1917]/20 p-2.5 border border-stone-800 rounded-sm">
                    <div className="text-[7px] text-zinc-550 uppercase tracking-widest font-black">Hist Price Mean</div>
                    <div className="text-[10.5px] font-bold text-zinc-300 mt-0.5">
                      {rndAnalysis.historicalMean.toFixed(2)} <span className="text-[7.5px] text-zinc-500 font-normal">avg</span>
                    </div>
                  </div>

                  <div className="bg-black/60 p-2.5 border border-[#1e293b]/30 rounded-sm col-span-2">
                    <div className="text-[7px] text-zinc-550 uppercase tracking-widest font-black">Implied Price Range (1 Std Dev)</div>
                    <div className="flex justify-between items-baseline mt-0.5">
                      <span className="text-[11px] font-black text-[#4ADE80]">
                        ±{rndAnalysis.impliedStdDev.toFixed(1)} <span className="text-[7.5px] text-zinc-500 font-normal">pts</span>
                      </span>
                      <span className="text-[8px] text-rose-450 text-right">
                        Realized Vol Range: ±{rndAnalysis.historicalStdDev.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[7.5px] leading-relaxed text-zinc-400 border-l-2 border-emerald-500 pl-2 bg-emerald-950/10 py-1.5">
                  <span className="font-extrabold text-[#4ADE80] text-[8px] uppercase block tracking-wider mb-0.5">Dealer Hedging Read:</span>
                  {rndAnalysis.entropyDivergence > 0.04
                    ? "Heavy put skew. Traders are paying a large premium for downside protection relative to historical vol, signaling fear of a sharp drop."
                    : "Vol expectations are balanced and tight. Implied tail pricing is close to realized vol with low extra premium."
                  }
                </div>
              </div>

              {/* Graphical distribution density comparator block */}
              <div className="flex-1 min-h-[180px] bg-black/40 border border-[#1e293b]/30 p-2 rounded-sm flex flex-col">
                <div className="text-[8px] font-black tracking-widest text-zinc-400 uppercase mb-2 flex justify-between items-center px-1 border-b border-black/80 pb-1.5">
                  <span>PRICE PROBABILITY BY STRIKE (x: STRIKE / y: PROBABILITY)</span>
                  <div className="flex gap-3">
                    <span className="flex items-center gap-1 text-[8px] font-black uppercase"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> OPTION-IMPLIED</span>
                    <span className="flex items-center gap-1 text-[8px] font-black uppercase"><span className="w-1.5 h-1.5 rounded-full bg-[#f43f5e]" /> HISTORICAL</span>
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
                        tick={{ fill: '#71717a', fontSize: '7.5px', fontFamily: 'monospace' }}
                        stroke="#111"
                      />
                      <YAxis 
                        tick={{ fill: '#71717a', fontSize: '7.5px', fontFamily: 'monospace' }}
                        stroke="#111"
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#09090b] border border-[#1e293b] p-2 text-mono text-[7.5px] space-y-1 rounded-sm shadow-xl">
                                <div className="text-zinc-200 font-bold border-b border-[#27272a] pb-0.5 mb-1 text-[8.5px]">Strike: {Math.round(data.strike)}</div>
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
              <span>VOLATILITY & MICROSTRUCTURE</span>
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-600" />
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">FORWARD VARIANCE (IV^2)</div>
                <div className="flex items-baseline gap-2">
                  <span className="hud-value text-sky-400">
                    {profile.fwdVar.toFixed(4)}
                  </span>
                  <span className="text-[7.5px] text-zinc-550">v2_std</span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label text-[#F87171]/90">ORDER FLOW IMBALANCE (VPIN)</div>
                <div className="flex items-baseline gap-2">
                  <span className={`hud-value ${profile.vpinColor}`}>
                    {profile.vpin}
                  </span>
                </div>
              </div>

              <div className="bg-black/45 p-3 border border-black rounded-sm">
                <div className="hud-label">BID/ASK FRICTION (Λ)</div>
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
              <span>PRICE TARGET RANGE (95% CI)</span>
              <Compass className="w-3 h-3 text-zinc-600" />
            </div>

            <div className="bg-black/45 p-3 border border-black rounded-sm flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-zinc-500 font-black tracking-widest uppercase">Theta Decay Rate (per hr)</span>
                  <span className="text-[#4ADE80] font-bold">-0.842v / hr</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-zinc-500 font-black tracking-widest uppercase">Spread Friction (Λ)</span>
                  <span className="text-[#4ADE80] font-bold">1.22μ</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-zinc-500 font-black tracking-widest uppercase">Dealer Hedge Activity</span>
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
                DELTA
              </label>
              <span>
                {calculatedGreeks.delta.toFixed(4)} <span className="unit">Δ</span>
              </span>
            </div>

            {/* CARD 2: SPOT GAMMA CONVEXITY */}
            <div className="greek-card">
              <label>
                <GitCommit className="w-3.5 h-3.5 text-zinc-450 icon-small" />
                GAMMA (how fast delta changes)
              </label>
              <span>
                {calculatedGreeks.gamma.toFixed(6)} <span className="unit">Γ</span>
              </span>
            </div>

            {/* CARD 3: VANNA COVARIANCE */}
            <div className="greek-card">
              <label>
                <Percent className="w-3.5 h-3.5 text-[#F87171] icon-small" />
                VANNA (delta shift per vol move)
              </label>
              <span>
                {calculatedGreeks.vanna.toFixed(4)} <span className="unit">∂Δ/∂Σ</span>
              </span>
            </div>

            {/* CARD 4: CHARM DECAY SPEED */}
            <div className="greek-card">
              <label>
                <Clock className="w-3.5 h-3.5 text-zinc-400 icon-small" />
                CHARM (delta decay per day)
              </label>
              <span>
                {calculatedGreeks.charm.toFixed(4)} <span className="unit">∂Δ/∂T</span>
              </span>
            </div>

            {/* CARD 5: ATM MAGNET STRIKE */}
            <div className="greek-card">
              <label>
                <Crosshair className="w-3.5 h-3.5 text-sky-400 icon-small" />
                MAGNET STRIKE
              </label>
              <span className="text-sky-400">
                {profile.spot.toFixed(0)} <span className="unit">ATM</span>
              </span>
            </div>

          </div>
        </div>
      </footer>



    </div>
  );
}
