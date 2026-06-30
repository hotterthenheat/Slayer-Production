/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IMPLIED VOLATILITY SURFACE (3D) — MODEL
 * ---------------------------------------
 * A GPU surface of implied vol over (strike × DTE). The FRONT row is the REAL
 * front-expiry smile (highlighted); every deeper row is the same smile scaled by
 * a Heston forward-variance term factor — a transparent MODEL of the DTE axis the
 * feed does not carry (see src/lib/ivSurface). Height and a sequential cool→hot
 * colour both encode IV level; the real front edge is drawn brighter so the eye
 * separates measured from modelled.
 *
 * Rendering shares the platform's surface conventions with the GEX surface: real
 * OrbitControls (rotate/zoom/pan, damped), a three-point light rig, raycast hover
 * readout (K · DTE · IV), camera-facing axis labels, and reset / fullscreen /
 * PNG / CSV controls. Static data ⇒ the loop only advances controls and renders.
 */
import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Download, Maximize2, RotateCcw } from 'lucide-react';
import { exportCanvasPng, exportCsv } from './quant/chartInteraction';
import { buildIvSurfaceModel } from '../lib/ivSurface';
import type { ChainContract } from '../lib/v11Math';

interface IvSurface3DProps {
  chain: ChainContract[];
  spot: number;
  frontDteDays: number;
  decimals?: number;
  ticker?: string;
}

interface HoverInfo { x: number; y: number; strike: number; dte: number; iv: number; real: boolean }
interface SurfaceApi { reset: () => void; png: () => void }

const CAM_DEFAULT = new THREE.Vector3(150, 150, 185);

/** Sequential cool→hot vertex colour for a normalized IV level t∈[0,1]. */
function ivColor(t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t));
  // teal (low) → amber (mid) → red (high)
  if (u < 0.5) { const k = u / 0.5; return [0.13 + k * 0.77, 0.55 + k * 0.20, 0.55 - k * 0.30]; }
  const k = (u - 0.5) / 0.5; return [0.90 + k * 0.05, 0.75 - k * 0.55, 0.25 - k * 0.10];
}

export function IvSurface3D({ chain, spot, frontDteDays, decimals = 0, ticker }: IvSurface3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SurfaceApi | null>(null);
  const hoverRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => buildIvSurfaceModel(chain, spot, frontDteDays), [chain, spot, frontDteDays]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !model) return;
    const width = mount.clientWidth || 800, height = mount.clientHeight || 440;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.copy(CAM_DEFAULT);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x20242c, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(120, 200, 120); scene.add(key);
    const fill = new THREE.DirectionalLight(0x8891a5, 0.7); fill.position.set(-160, 70, -100); scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 80; controls.maxDistance = 540; controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0, 0);

    const nK = model.strikes.length, nE = model.dtes.length;
    const GW = 200, GD = 120, GH = 70;
    const xi = (ki: number) => (nK > 1 ? (ki / (nK - 1) - 0.5) * GW : 0);
    const zi = (ei: number) => (nE > 1 ? (ei / (nE - 1) - 0.5) * GD : 0);
    let ivMin = Infinity, ivMax = -Infinity;
    for (const row of model.iv) for (const v of row) { ivMin = Math.min(ivMin, v); ivMax = Math.max(ivMax, v); }
    const span = ivMax - ivMin || 1;
    const yi = (v: number) => ((v - ivMin) / span) * GH;

    const rows = Math.max(nE, 2);
    const geo = new THREE.PlaneGeometry(GW, GD, nK - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const sampleE = (r: number) => (nE === 1 ? 0 : Math.round((r / (rows - 1)) * (nE - 1)));
    for (let r = 0; r < rows; r++) {
      const ei = sampleE(r);
      for (let c = 0; c < nK; c++) {
        const idx = r * nK + c;
        const v = model.iv[ei][c];
        pos.setY(idx, yi(v));
        const [cr, cg, cb] = ivColor((v - ivMin) / span);
        colors[idx * 3] = cr; colors[idx * 3 + 1] = cg; colors[idx * 3 + 2] = cb;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
    scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3a3f4a, transparent: true, opacity: 0.16 })));

    // Highlight the REAL front-expiry edge (z at dte index 0 → r=0).
    const frontPts = model.strikes.map((_, c) => new THREE.Vector3(xi(c), yi(model.iv[0][c]) + 0.6, zi(0)));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(frontPts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })));

    // Spot reference plane.
    let spotCol = 0, best = Infinity;
    model.strikes.forEach((k, i) => { const d = Math.abs(k - spot); if (d < best) { best = d; spotCol = i; } });
    const spotPlane = new THREE.Mesh(new THREE.PlaneGeometry(GD, GH * 1.6), new THREE.MeshBasicMaterial({ color: 0xc8ccd4, transparent: true, opacity: 0.07, side: THREE.DoubleSide }));
    spotPlane.rotateY(Math.PI / 2); spotPlane.position.set(xi(spotCol), GH / 2, 0); scene.add(spotPlane);

    // Camera-facing axis labels.
    const textures: THREE.Texture[] = [];
    const makeLabel = (text: string, color = '#c8ccd4') => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const ctx = cv.getContext('2d')!; ctx.fillStyle = color; ctx.font = 'bold 36px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 34);
      const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter; textures.push(tex);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.scale.set(46, 11.5, 1); return spr;
    };
    const kMin = makeLabel(`K ${Math.round(model.strikes[0])}`); kMin.position.set(xi(0), -6, GD / 2 + 16); scene.add(kMin);
    const kMax = makeLabel(`K ${Math.round(model.strikes[nK - 1])}`); kMax.position.set(xi(nK - 1), -6, GD / 2 + 16); scene.add(kMax);
    const dteN = makeLabel(`${model.dtes[0]}d·real`, '#e6e9ee'); dteN.position.set(-GW / 2 - 20, -6, zi(0)); scene.add(dteN);
    const dteF = makeLabel(`${model.dtes[nE - 1]}d`, '#9aa3b2'); dteF.position.set(-GW / 2 - 20, -6, zi(nE - 1)); scene.add(dteF);

    // Raycast hover.
    const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let raf = 0;
    const onMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(mesh)[0];
      const el = hoverRef.current; if (!el) return;
      if (hit) {
        const ki = Math.min(nK - 1, Math.max(0, Math.round((hit.point.x / GW + 0.5) * (nK - 1))));
        const ei = nE === 1 ? 0 : Math.min(nE - 1, Math.max(0, Math.round((hit.point.z / GD + 0.5) * (nE - 1))));
        const info: HoverInfo = { x: ev.clientX - rect.left, y: ev.clientY - rect.top, strike: model.strikes[ki], dte: model.dtes[ei], iv: model.iv[ei][ki], real: ei === 0 };
        el.style.display = 'block';
        el.style.left = `${Math.min(info.x + 12, rect.width - 120)}px`; el.style.top = `${info.y + 12}px`;
        el.innerHTML = `<div class="font-bold" style="color:var(--text-primary)">K ${info.strike.toLocaleString(undefined, { maximumFractionDigits: decimals })} · ${info.dte}DTE</div>` +
          `<div style="color:var(--accent-color)">IV ${(info.iv * 100).toFixed(1)}%</div>` +
          `<div style="color:var(--text-tertiary);font-size:8.5px;text-transform:uppercase;letter-spacing:.08em">${info.real ? 'real front' : 'model term'}</div>`;
      } else el.style.display = 'none';
    };
    const onLeave = () => { if (hoverRef.current) hoverRef.current.style.display = 'none'; };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const animate = () => { raf = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();
    const onResize = () => { const w = mount.clientWidth || width, h = mount.clientHeight || height; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);

    apiRef.current = {
      reset: () => { camera.position.copy(CAM_DEFAULT); controls.target.set(0, 0, 0); controls.update(); },
      png: () => { renderer.render(scene, camera); exportCanvasPng(renderer.domElement, `iv-surface-${ticker || 'spx'}`); },
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      apiRef.current = null; controls.dispose(); textures.forEach((t) => t.dispose());
      geo.dispose(); mat.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [model, spot, ticker, decimals]);

  const fullscreen = () => { const el = wrapRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.(); };
  const dumpCsv = () => {
    if (!model) return;
    const rows: (string | number)[][] = [];
    model.dtes.forEach((d, ei) => model.strikes.forEach((k, ki) => rows.push([d, ei === 0 ? 'real' : 'model', k.toFixed(2), model.iv[ei][ki].toFixed(5)])));
    exportCsv(['dte', 'source', 'strike', 'iv'], rows, `iv-surface-${ticker || 'spx'}`);
  };
  const toolBtn = 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors p-1 rounded';

  if (!model) {
    return (
      <div className="h-[300px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">Front smile too sparse for an IV surface</span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Implied Volatility Surface{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className={toolBtn} onClick={() => apiRef.current?.reset()} title="Reset camera" aria-label="Reset camera"><RotateCcw className="w-3.5 h-3.5" /></button>
          <button className={toolBtn} onClick={() => apiRef.current?.png()} title="Export PNG" aria-label="Export PNG"><Download className="w-3.5 h-3.5" /></button>
          <button className={toolBtn} onClick={dumpCsv} title="Export CSV" aria-label="Export CSV"><span className="text-[9px] font-bold tracking-wider">CSV</span></button>
          <button className={toolBtn} onClick={fullscreen} title="Fullscreen" aria-label="Fullscreen"><Maximize2 className="w-3.5 h-3.5" /></button>
          <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase ml-1" style={{ color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }} title="Front row real; DTE axis is a Heston forward-variance term model">MODEL</span>
        </div>
      </div>

      <div ref={mountRef} className="relative w-full h-[440px] cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
        <div ref={hoverRef} className="pointer-events-none absolute z-10 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ display: 'none' }} />
      </div>

      <div className="flex items-center gap-4 px-3.5 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)] flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'rgb(33,140,140)' }} /> low IV</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'rgb(230,191,64)' }} /> mid</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'rgb(242,51,38)' }} /> high IV</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px]" style={{ background: '#fff' }} /> real front edge</span>
        <span className="ml-auto uppercase tracking-widest">drag rotate · scroll zoom · right-drag pan</span>
      </div>
      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Model</span> front smile real; term <span className="font-mono">iv(K,T)=ivFront(K)·√(g(T)/g(T₀))</span>, <span className="font-mono">g(T)=θ+(v₀−θ)(1−e^(−κT))/(κT)</span> ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Inputs</span> v₀={(model.atmFront * 100).toFixed(1)}% ATM, θ={(Math.sqrt(model.theta) * 100).toFixed(0)}%, κ={model.kappa} ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Honest</span> per-(strike,expiry) IV is not in the feed — only the front row is measured; the DTE axis is a labelled term model
      </div>
    </div>
  );
}
