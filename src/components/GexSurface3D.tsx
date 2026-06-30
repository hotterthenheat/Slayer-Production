/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER GAMMA EXPOSURE SURFACE (3D)
 * ----------------------------------
 * A real GPU surface of dealer net gamma exposure over (strike × expiration).
 * Height and colour are the actual per-(strike, expiry) netGEX the server ships
 * in gex_profile.expiries — real multi-expiry chains when the provider feed is
 * on, otherwise the clearly-labelled term-structure model. Nothing here is a
 * decorative wave: the mesh is the data.
 *
 * Rendering: WebGL (three.js) with real OrbitControls (rotate / zoom / pan,
 * damped), a three-point light rig, per-vertex diverging colour (green = dealers
 * long gamma / pinning, red = short gamma / amplifying), raycast hover readout,
 * and a spot reference plane. Static data ⇒ the animation loop only advances the
 * controls and renders, so it idles cheaply and holds 60fps under interaction.
 */
import { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ExpiryStrike { strike: number; netGex: number; callGex?: number; putGex?: number }
interface ExpirySlice { dte: number; expiration?: string; strikes: ExpiryStrike[] }
interface GexSurface3DProps {
  expiries: ExpirySlice[];
  spot: number;
  decimals?: number;
  ticker?: string;
  live?: boolean;
  windowPct?: number; // strike window around spot (default 0.08)
}

interface HoverInfo { x: number; y: number; strike: number; dte: number; gex: number }

export function GexSurface3D({ expiries, spot, decimals = 0, ticker, live, windowPct = 0.08 }: GexSurface3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // ---- Build the (strike × expiry) gamma grid from real data ----
  const grid = useMemo(() => {
    const exps = (expiries || []).filter((e) => e && Array.isArray(e.strikes) && e.strikes.length)
      .slice().sort((a, b) => a.dte - b.dte);
    if (!exps.length || !(spot > 0)) return null;

    // Common strike axis = strikes within the window, unioned across expiries, sorted.
    const lo = spot * (1 - windowPct), hi = spot * (1 + windowPct);
    const strikeSet = new Set<number>();
    exps.forEach((e) => e.strikes.forEach((s) => { if (s.strike >= lo && s.strike <= hi) strikeSet.add(s.strike); }));
    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    if (strikes.length < 4 || exps.length < 1) return null;

    // netGEX matrix [expiryIdx][strikeIdx], looked up per expiry (0 where absent).
    const z: number[][] = exps.map((e) => {
      const byStrike = new Map<number, number>();
      e.strikes.forEach((s) => byStrike.set(s.strike, (s.netGex ?? 0)));
      return strikes.map((k) => byStrike.get(k) ?? 0);
    });
    let maxAbs = 0;
    for (const row of z) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
    maxAbs = maxAbs || 1;
    return { strikes, dtes: exps.map((e) => e.dte), z, maxAbs };
  }, [expiries, spot, windowPct]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !grid) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 460;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(150, 140, 180);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // Three-point lighting for an engineering-viz feel (not gaming bloom).
    scene.add(new THREE.AmbientLight(0x20242c, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(120, 200, 120); scene.add(key);
    const fill = new THREE.DirectionalLight(0x8891a5, 0.7); fill.position.set(-160, 70, -100); scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 80;
    controls.maxDistance = 520;
    controls.maxPolarAngle = Math.PI * 0.49; // keep above the deck

    // ---- Build the surface mesh (BufferGeometry grid) ----
    const nK = grid.strikes.length, nE = grid.dtes.length;
    const GW = 200, GD = 120, GH = 64; // world extents (width across strikes, depth across expiries, max height)
    const center = new THREE.Vector3(0, 0, 0);
    controls.target.copy(center);

    const xi = (ki: number) => (nK > 1 ? (ki / (nK - 1) - 0.5) * GW : 0);
    // Height map: signed power (0.7) compresses a single dominant spike so smaller
    // structure stays legible. Purely presentational — the hover readout shows the
    // real signed $-netGEX, and the colour encodes sign+magnitude independently.
    const yi = (v: number) => Math.sign(v) * Math.pow(Math.abs(v) / grid.maxAbs, 0.7) * GH;
    const rows = Math.max(nE, 2);

    const geo = new THREE.PlaneGeometry(GW, GD, nK - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // PlaneGeometry vertex order: row-major (rows = z, cols = x). With segments (nK-1)x(rows-1),
    // vertex (row, col) index = row*nK + col.
    const sampleZ = (ei: number, ki: number) => {
      if (nE === 1) return grid.z[0][ki];
      const e = Math.min(nE - 1, Math.max(0, ei));
      return grid.z[e][ki];
    };
    for (let r = 0; r < rows; r++) {
      const ei = nE === 1 ? 0 : Math.round((r / (rows - 1)) * (nE - 1));
      for (let c = 0; c < nK; c++) {
        const idx = r * nK + c;
        const v = sampleZ(ei, c);
        pos.setY(idx, yi(v));
        const t = Math.min(1, Math.abs(v) / grid.maxAbs);
        // diverging: green for +γ, red for −γ; brighten with magnitude
        if (v >= 0) { colors[idx * 3] = 0.10 + t * 0.10; colors[idx * 3 + 1] = 0.35 + t * 0.55; colors[idx * 3 + 2] = 0.30 + t * 0.10; }
        else { colors[idx * 3] = 0.45 + t * 0.45; colors[idx * 3 + 1] = 0.10 + t * 0.06; colors[idx * 3 + 2] = 0.16 + t * 0.06; }
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Wireframe overlay for grid legibility.
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3a3f4a, transparent: true, opacity: 0.18 }));
    scene.add(wire);

    // Spot reference plane (vertical, at the strike nearest spot).
    let spotCol = 0, best = Infinity;
    grid.strikes.forEach((k, i) => { const d = Math.abs(k - spot); if (d < best) { best = d; spotCol = i; } });
    const spotX = xi(spotCol);
    const spotPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(GD, GH * 2),
      new THREE.MeshBasicMaterial({ color: 0xc8ccd4, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
    );
    spotPlane.rotateY(Math.PI / 2);
    spotPlane.position.set(spotX, 0, 0);
    scene.add(spotPlane);

    // ---- Raycast hover ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(mesh)[0];
      if (hit) {
        const ki = Math.min(nK - 1, Math.max(0, Math.round((hit.point.x / GW + 0.5) * (nK - 1))));
        const ei = nE === 1 ? 0 : Math.min(nE - 1, Math.max(0, Math.round((hit.point.z / GD + 0.5) * (nE - 1))));
        setHover({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, strike: grid.strikes[ki], dte: grid.dtes[ei], gex: grid.z[ei][ki] });
      } else setHover(null);
    };
    const onLeave = () => setHover(null);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const animate = () => { raf = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || width, h = mount.clientHeight || height;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      geo.dispose(); mat.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [grid, spot]);

  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  if (!grid) {
    return (
      <div className="h-[300px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">No multi-expiry GEX surface available</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Gamma Exposure Surface{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <span
          className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase"
          style={live
            ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }
            : { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}
          title={live ? 'Real per-expiry chains' : 'Per-expiry split modeled from the aggregate term structure'}
        >
          {live ? 'LIVE' : 'MODEL'}
        </span>
      </div>

      <div ref={mountRef} className="relative w-full h-[440px] cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg"
            style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12 }}
          >
            <div className="text-[var(--text-primary)] font-bold">K {fmt(hover.strike)} · {hover.dte}DTE</div>
            <div style={{ color: hover.gex >= 0 ? 'var(--success)' : 'var(--danger)' }}>{hover.gex >= 0 ? '+' : ''}{(hover.gex / 1e9).toFixed(2)}B net γ</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-3.5 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'rgb(38,217,128)' }} /> long γ (pin)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'rgb(217,51,72)' }} /> short γ (amplify)</span>
        <span className="ml-auto uppercase tracking-widest">drag rotate · scroll zoom · right-drag pan</span>
      </div>
    </div>
  );
}
