import { useMemo, useState, useRef, useEffect, CSSProperties } from 'react';
import { motion } from 'motion/react';
import { GexProfileData, OrderFlowData } from '../types';
import { useContractStore } from '../lib/store';
import { computeTerminalRead, computeGexOutlook } from '../lib/terminalRead';
import { computeDealerClock } from '../lib/dealerClock';
import { fmtNum } from '../lib/format';
import { SlayerChart } from './SlayerChart';
import { ChartPanelGrid } from './ChartPanelGrid';
import { StrikeGexChart } from './StrikeGexChart';
import { useGexHistory } from '../lib/gexHistory';
import { StrikeMatrix } from './StrikeMatrix';
import { OrderFlow } from './OrderFlow';
import { SystemStatus } from './terminal/StatusBar';
import { ReplayScrubber } from './terminal/ReplayScrubber';
import { DealerPulse } from './terminal/DealerPulse';
import { SessionBand } from './terminal/SessionBand';
import { fmtBig } from './terminal/format';
import { CROSSHAIR_EVENT, CrosshairDetail, PRICE_SCALE_EVENT, PriceScaleDetail } from '../lib/chartSync';
import { EdgeTrackRecord } from './EdgeTrackRecord';
import { Crosshair, Activity, Zap, Layers, ChevronDown, Gauge as GaugeIcon, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import { ASSET_LIST, TIMEFRAMES } from '../data';

// Tight, legible type scale (raised the floor off 7.5/8px so dense data stays readable).

// NYSE full-day closes (ET) — so the feed badge never reads "LIVE" over a weekday holiday when the
// SSE stream is still echoing the last snapshot. Extendable; the authoritative source should ultimately
// be a server session flag, with this + the staleness guard as the client backstop. Half-day early
// closes (1pm) are handled below.
const NYSE_HOLIDAYS = new Set<string>([
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
// 1pm ET early closes.
const NYSE_HALF_DAYS = new Set<string>(['2025-07-03', '2025-11-28', '2025-12-24', '2026-11-27', '2026-12-24', '2027-11-26']);

interface LiveTerminalFlowProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}


export function LiveTerminalFlow({ profile: liveProfile, ticker, decimals }: LiveTerminalFlowProps) {
  // ── Market Replay (§3.2) — append-only buffer of the full dealer state over the session; a scrubber
  //    rewinds the WHOLE terminal (walls, ladder, vanna, narrative) to any past moment. LIVE keeps
  //    buffering in the background while you're scrubbed back. Every panel below reads `profile`, which
  //    is the live state in LIVE mode and the reconstructed historical snapshot in REPLAY mode. ──
  const profileHistRef = useRef<{ t: number; p: GexProfileData }[]>([]);
  const profileHistTick = useRef('');
  const [replayT, setReplayT] = useState<number | null>(null);
  const [, bumpHist] = useState(0);
  useEffect(() => {
    if (profileHistTick.current !== ticker) { profileHistTick.current = ticker; profileHistRef.current = []; setReplayT(null); }
    if (!liveProfile?.strikes?.length) return;
    const t = Date.now(), buf = profileHistRef.current, last = buf[buf.length - 1];
    if (last && t - last.t < 2000) return; // ~1 snapshot / 2s, ring-buffered
    buf.push({ t, p: liveProfile });
    if (buf.length > 600) buf.splice(0, buf.length - 600);
    bumpHist(n => n + 1);
  }, [liveProfile, ticker]);
  const profileHist = profileHistRef.current;
  const profile = useMemo(() => {
    if (replayT == null || !profileHist.length) return liveProfile;
    let best = profileHist[0];
    for (const s of profileHist) { if (s.t <= replayT) best = s; else break; }
    return best.p;
  }, [replayT, liveProfile, profileHist.length]);
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const selectedTimeframe = useContractStore(s => s.selectedTimeframe);
  const setSelectedTimeframe = useContractStore(s => s.setSelectedTimeframe);
  const candles = useContractStore(s => s.activeContract?.chartData) ?? [];
  const orderFlow = useContractStore(s => (s as { orderFlowData?: OrderFlowData | null }).orderFlowData) ?? null;
  // Server truth: the dealer-DYNAMICS block (time-derivative mechanics) + which feed this
  // tick actually came from. We surface real provider/model status and live dealer motion —
  // never a hardcoded "LIVE".
  const serverState = useContractStore(s => s.serverState);
  const dyn = serverState?.dealer_dynamics ?? null;
  const [tickerOpen, setTickerOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<'levels' | 'matrix' | 'flow'>('levels');
  const [scope, setScope] = useState<'0DTE' | 'ALL'>('0DTE');
  const [multiChart, setMultiChart] = useState(false); // opt-in movable/resizable multi-chart grid
  const [gexLines, setGexLines] = useState(false); // center toggle — multi-strike GEX line chart
  const [ladderMetric, setLadderMetric] = useState<'GAMMA' | 'DELTA' | 'VANNA' | 'OI' | 'VOL'>('GAMMA');
  // Live price range the chart is showing — the Dealer Gamma Profile fills its panel with this range
  // and flows as the chart's price axis expands / shortens. null until the chart broadcasts.
  const [syncScale, setSyncScale] = useState<{ lo: number; hi: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  // Feed heartbeat — stamp every SSE frame; if the stream goes quiet the UI must SAY so
  // rather than show a frozen price as if it were live.
  const lastTickRef = useRef(Date.now());
  useEffect(() => { lastTickRef.current = Date.now(); }, [serverState]);
  const staleSecs = Math.max(0, Math.floor((now.getTime() - lastTickRef.current) / 1000));
  const isStale = staleSecs >= 6;
  const TF = TIMEFRAMES.filter(t => ['1m', '5m', '15m', '30m', '1h', '1D'].includes(t.val));

  const spot = profile.spot || 0;
  const netGex = profile.netGex || 0;
  const longGamma = netGex >= 0;
  const flip = profile.gammaFlip;
  const aboveFlip = flip && spot ? spot >= flip : null;
  const emPct = profile.expectedMovePct;
  const dist = (lvl?: number) => (lvl && spot ? ((lvl - spot) / spot) * 100 : null);
  const distLabel = (lvl?: number) => { const d = dist(lvl); return d == null ? '' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`; };
  const trend = longGamma ? 'var(--success)' : 'var(--danger)';

  // Market session (ET regular hours). A "LIVE" badge must never sit over a closed/frozen tape, so the
  // feed status below is gated on this: when the session is closed we show LAST CLOSE, not LIVE.
  const marketOpen = useMemo(() => {
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const secs = et.getHours() * 3600 + et.getMinutes() * 60 + et.getSeconds();
    const dow = et.getDay();
    const key = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
    if (dow === 0 || dow === 6 || NYSE_HOLIDAYS.has(key)) return false;   // weekend or full-day holiday
    const close = NYSE_HALF_DAYS.has(key) ? 13 * 3600 : 16 * 3600;        // 1pm early close on half-days
    return secs >= 9.5 * 3600 && secs <= close;
  }, [now]);
  // Honest feed status from the server's own source label — provider when the options chain
  // is live, MODEL on synthetic data, STALE if the heartbeat stalls. Never a hardcoded "LIVE".
  const feedRaw = (profile.feed || serverState?.data_source || '').toUpperCase();
  const feedProvider = feedRaw.includes('THETA') ? 'THETADATA' : feedRaw.includes('TRADIER') ? 'TRADIER' : feedRaw.includes('POLYGON') ? 'POLYGON' : null;
  // Provenance: real provider data present & fresh (used for the Proven-Edge ledger). A closed market is
  // still REAL provider data (last close), so this stays true — but it is NOT "live" for the badge.
  const realFeed = !isStale && (feedRaw.startsWith('LIVE') || (!!feedProvider && !feedRaw.includes('DETERMINISTIC') && !feedRaw.includes('SANDBOX') && !feedRaw.includes('MODEL')));
  const liveFeed = realFeed && marketOpen;   // streaming live, market open
  const feedColor = !marketOpen ? 'var(--text-tertiary)' : isStale ? 'var(--danger)' : liveFeed ? 'var(--success)' : 'var(--warning)';
  const feedLabel = !marketOpen ? (feedProvider ? `LAST CLOSE · ${feedProvider}` : 'LAST CLOSE') : isStale ? `STALE ${staleSecs}s` : liveFeed ? (feedProvider ? `LIVE · ${feedProvider}` : 'LIVE') : 'MODEL';
  // Level confidence — the engine flags when a flip/wall is statistically thin. Undefined ⇒
  // treat as confident (don't cry wolf on older payloads); only an explicit false marks it.
  const flipConfident = profile.gammaFlipConfident !== false;
  const wallsConfident = profile.wallsConfident !== false;

  // ── Dealer MOTION — the time-derivatives the server computes every tick and the page
  //    used to discard. These show HOW the book is changing, not just its static snapshot. ──
  const gammaState = dyn?.gamma.state ?? null;        // ADDING_HEDGES | REMOVING_HEDGES | STABLE
  const vannaFlow = dyn?.vanna.hedgeFlow ?? null;     // SUPPORTIVE | PRESSURING | NEUTRAL
  const migration = dyn?.migration ?? null;           // gamma center-of-mass drift
  const charm = dyn?.charm ?? null;                   // time-decay hedging intensity 0..1 + bias
  const wallRes = dyn?.walls.resistance ?? null;      // strongest strike above spot {strike, score}
  const wallSup = dyn?.walls.support ?? null;         // strongest strike below spot {strike, score}
  const vacAbove = dyn?.vacuums.nearestAbove ?? null; // nearest liquidity "air pocket" above
  const vacBelow = dyn?.vacuums.nearestBelow ?? null;
  const gammaMotion = gammaState === 'ADDING_HEDGES'
    ? { label: 'Adding hedges', sub: 'vol-suppressing', color: 'var(--success)' }
    : gammaState === 'REMOVING_HEDGES'
      ? { label: 'Pulling hedges', sub: 'vol-releasing', color: 'var(--danger)' }
      : gammaState ? { label: 'Hedges stable', sub: 'no net change', color: 'var(--text-tertiary)' } : null;

  const dayOpen = candles.length ? candles[0].open : spot;
  const dayChg = spot && dayOpen ? ((spot - dayOpen) / dayOpen) * 100 : 0;

  // spot tick flash (tickUp/tickDown keyframes)
  const prevSpot = useRef(spot);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (spot > prevSpot.current) setFlash('up'); else if (spot < prevSpot.current) setFlash('down');
    prevSpot.current = spot;
    const t = setTimeout(() => setFlash(null), 800); return () => clearTimeout(t);
  }, [spot]);

  // ── TASK 3 — Crosshair bridge ────────────────────────────────────────────────
  // The chart broadcasts the hovered price via a native window event (no mouse coords in React
  // state). We listen here and highlight the matching strike on the detached Exposure Ladder by
  // toggling an inline outline straight on the DOM node — rAF-throttled, zero re-renders.
  const ladderScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let pendingPrice: number | null = null;
    let lit: HTMLElement | null = null;
    const clearLit = () => { if (lit) { lit.style.outline = ''; lit.style.outlineOffset = ''; lit = null; } };
    const apply = () => {
      raf = 0;
      const box = ladderScrollRef.current;
      if (!box) return;
      if (pendingPrice == null) { clearLit(); return; }
      let best: HTMLElement | null = null, bestD = Infinity;
      box.querySelectorAll<HTMLElement>('[data-strike]').forEach(el => {
        const k = parseFloat(el.dataset.strike || '');
        if (!isFinite(k)) return;
        const d = Math.abs(k - (pendingPrice as number));
        if (d < bestD) { bestD = d; best = el; }
      });
      if (best !== lit) {
        clearLit();
        if (best) { (best as HTMLElement).style.outline = '1px solid var(--accent-color)'; (best as HTMLElement).style.outlineOffset = '-1px'; lit = best; }
      }
    };
    const onXhair = (e: Event) => {
      const det = (e as CustomEvent<CrosshairDetail>).detail;
      pendingPrice = det && typeof det.price === 'number' ? det.price : null;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener(CROSSHAIR_EVENT, onXhair as EventListener);
    return () => { window.removeEventListener(CROSSHAIR_EVENT, onXhair as EventListener); if (raf) cancelAnimationFrame(raf); clearLit(); };
  }, []);

  // ── Price-scale bridge — the gamma profile follows the chart's live visible range ──
  // rAF-throttled; the setState compare drops no-op frames so it only re-renders when the range moves.
  useEffect(() => {
    let raf = 0, pending: { lo: number; hi: number } | null = null;
    const flush = () => { raf = 0; const p = pending; if (p) setSyncScale(prev => (prev && Math.abs(prev.lo - p.lo) < 1e-6 && Math.abs(prev.hi - p.hi) < 1e-6) ? prev : p); };
    const onScale = (e: Event) => { const d = (e as CustomEvent<PriceScaleDetail>).detail; if (!d || !(d.hi > d.lo)) return; pending = { lo: d.lo, hi: d.hi }; if (!raf) raf = requestAnimationFrame(flush); };
    window.addEventListener(PRICE_SCALE_EVENT, onScale as EventListener);
    return () => { window.removeEventListener(PRICE_SCALE_EVENT, onScale as EventListener); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // ── TASK 4 — GEX regime theming ──────────────────────────────────────────────
  // Net-GEX sign is the regime. On a FLIP only, pulse the ambient frame harder for ~1.4s so the
  // change is felt peripherally; it then settles to a faint cool (long-gamma) / warning
  // (short-gamma) wash + inset ring. Binary, transition-driven, no per-tick churn.
  const prevRegime = useRef(longGamma);
  const [regimePulse, setRegimePulse] = useState(false);
  useEffect(() => {
    if (prevRegime.current === longGamma) return;
    prevRegime.current = longGamma;
    setRegimePulse(true);
    const t = setTimeout(() => setRegimePulse(false), 1400);
    return () => clearTimeout(t);
  }, [longGamma]);
  const regimeTint = longGamma ? 'var(--info)' : 'var(--warning)';
  const ambientWash = regimePulse ? 13 : 5;
  const ambientRing = regimePulse ? 44 : 20;
  const ambientGlow = regimePulse ? 17 : 6;

  const hvl = useMemo(() => { const ss = profile.strikes || []; if (!ss.length) return undefined; return ss.reduce((a, b) => ((b.callOi || 0) + (b.putOi || 0)) > ((a.callOi || 0) + (a.putOi || 0)) ? b : a).strike; }, [profile]);
  const callOi = profile.totalCallOi || 0, putOi = profile.totalPutOi || 0;
  // Clamp to [0,100] so a malformed (negative) OI can never overflow the BULL/BEAR bar width.
  const bullPct = callOi + putOi > 0 ? Math.max(0, Math.min(100, (callOi / (callOi + putOi)) * 100)) : 50;

  const levels = ([
    { n: 'Call Wall', v: profile.callWall, c: 'var(--success)' },
    { n: 'EM High', v: spot && emPct ? spot * (1 + emPct) : undefined, c: 'var(--info)' },
    { n: 'Magnet', v: profile.magnet, c: 'var(--info)' },
    { n: 'HVL', v: hvl, c: 'var(--accent-color)' },
    { n: 'GEX Flip', v: flip, c: 'var(--warning)' },
    { n: 'EM Low', v: spot && emPct ? spot * (1 - emPct) : undefined, c: 'var(--info)' },
    { n: 'Put Wall', v: profile.putWall, c: 'var(--danger)' },
  ] as { n: string; v?: number; c: string }[]).filter(l => typeof l.v === 'number' && (l.v as number) > 0).sort((a, b) => (b.v as number) - (a.v as number));

  // Dealer-structure spectrum (spot position among the dealer walls).
  const structure = useMemo(() => {
    const pts = ([
      { p: profile.putWall, c: 'var(--danger)', l: 'PW' },
      { p: profile.gammaFlip, c: 'var(--warning)', l: 'γF' },
      { p: profile.magnet, c: 'var(--info)', l: 'MAG' },
      { p: profile.callWall, c: 'var(--success)', l: 'CW' },
    ] as { p?: number; c: string; l: string }[]).filter(x => typeof x.p === 'number' && (x.p as number) > 0);
    const all = [...pts.map(x => x.p as number), spot].filter(v => v > 0);
    if (all.length < 2) return null;
    const lo = Math.min(...all), hi = Math.max(...all), range = (hi - lo) || 1, pad = range * 0.12, L = lo - pad, Hh = hi + pad;
    const pos = (p: number) => Math.max(2, Math.min(98, ((p - L) / (Hh - L)) * 100));
    return { pts: pts.map(pt => ({ ...pt, x: pos(pt.p as number) })), spotPos: pos(spot) };
  }, [profile, spot]);

  const hasDex = useMemo(() => (profile.strikes || []).some(s => s.callDex != null || s.putDex != null), [profile]);
  const hasVex = useMemo(() => (profile.strikes || []).some(s => s.callVex != null || s.putVex != null), [profile]);
  const hasOi = useMemo(() => (profile.strikes || []).some(s => (s.callOi || 0) + (s.putOi || 0) > 0), [profile]);
  const hasVol = useMemo(() => (profile.strikes || []).some(s => (s.callVolume || 0) + (s.putVolume || 0) > 0), [profile]);
  const gexHist = useGexHistory(liveProfile, selectedAsset.ticker); // GEX line history always tracks LIVE, even while scrubbed back
  const ladder = useMemo(() => {
    let ss = [...(profile.strikes || [])];
    if (profile.spot) ss = ss.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 30);
    const oiLike = ladderMetric === 'OI' || ladderMetric === 'VOL';
    const pick = (s: typeof ss[number]): [number, number] => ladderMetric === 'DELTA' ? [s.callDex || 0, s.putDex || 0] : ladderMetric === 'VANNA' ? [s.callVex || 0, s.putVex || 0] : ladderMetric === 'OI' ? [s.callOi || 0, s.putOi || 0] : ladderMetric === 'VOL' ? [s.callVolume || 0, s.putVolume || 0] : [s.callGex || 0, s.putGex || 0];
    const maxM = Math.max(...ss.map(s => { const [c, p] = pick(s); return Math.max(Math.abs(c), Math.abs(p)); }), 1);
    const maxV = Math.max(...ss.map(s => (s.callVolume || 0) + (s.putVolume || 0)), 1);
    return ss.sort((a, b) => b.strike - a.strike).map(s => { const [c, p] = pick(s); const net = c + p; return ({
      strike: s.strike, net, netUp: oiLike ? c >= p : net >= 0,
      callPct: (Math.abs(c) / maxM) * 100, putPct: (Math.abs(p) / maxM) * 100,
      vol: (s.callVolume || 0) + (s.putVolume || 0), volPct: (((s.callVolume || 0) + (s.putVolume || 0)) / maxV) * 100,
      isSpot: Math.abs(s.strike - spot) < spot * 0.0008, isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
    }); });
  }, [profile, spot, ladderMetric]);

  // Live flash — when a strike's net makes a BIG move on a refresh, briefly tint its row so the eye
  // catches where dealers are repositioning. Imperative (no re-render); gated to significant moves so
  // it stays calm, and skipped on metric switches (which change every value at once).
  const prevNetRef = useRef<{ metric: string; map: Map<number, number> }>({ metric: ladderMetric, map: new Map() });
  useEffect(() => {
    const box = ladderScrollRef.current; if (!box) return;
    const store = prevNetRef.current;
    const sameMetric = store.metric === ladderMetric;
    store.metric = ladderMetric;
    const moves: { strike: number; d: number }[] = [];
    for (const r of ladder) {
      const before = store.map.get(r.strike);
      if (sameMetric && before != null) {
        const d = r.net - before;
        if (Math.abs(d) > Math.max(3e7, Math.abs(before) * 0.08)) moves.push({ strike: r.strike, d });
      }
      store.map.set(r.strike, r.net);
    }
    // Only the 2 biggest movers flash — enough to draw the eye to where dealers are repositioning,
    // never a disco even on a volatile refresh.
    moves.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    for (const m of moves.slice(0, 2)) {
      const el = box.querySelector(`[data-strike="${CSS.escape(String(m.strike))}"]`) as HTMLElement | null;
      if (el) { el.classList.remove('ladder-flash-up', 'ladder-flash-down'); void el.offsetWidth; el.classList.add(m.d > 0 ? 'ladder-flash-up' : 'ladder-flash-down'); }
    }
  }, [ladder, ladderMetric]);

  // Dealer Gamma Profile — every strike inside the chart's live range, as a tiling horizontal histogram
  // (bar thickness = strike spacing so it fills the panel; length = the selected metric). Flows as the
  // chart's price axis expands/shortens.
  const gammaProfile = useMemo(() => {
    if (!syncScale) return null;
    const { lo, hi } = syncScale, span = hi - lo;
    if (!(span > 0)) return null;
    const inRange = (profile.strikes || []).filter(s => s.strike >= lo && s.strike <= hi);
    if (inRange.length < 2) return null;
    const oiLike = ladderMetric === 'OI' || ladderMetric === 'VOL';
    const pick = (s: typeof inRange[number]): [number, number] => ladderMetric === 'DELTA' ? [s.callDex || 0, s.putDex || 0] : ladderMetric === 'VANNA' ? [s.callVex || 0, s.putVex || 0] : ladderMetric === 'OI' ? [s.callOi || 0, s.putOi || 0] : ladderMetric === 'VOL' ? [s.callVolume || 0, s.putVolume || 0] : [s.callGex || 0, s.putGex || 0];
    const maxM = Math.max(...inRange.map(s => { const [c, p] = pick(s); return Math.max(Math.abs(c), Math.abs(p)); }), 1);
    const sorted = [...inRange].sort((a, b) => a.strike - b.strike);
    const steps = sorted.slice(1).map((s, i) => s.strike - sorted[i].strike).filter(x => x > 0).sort((a, b) => a - b);
    const step = steps.length ? steps[Math.floor(steps.length / 2)] : span / sorted.length;  // median strike gap
    const rowHpct = Math.min(14, (step / span) * 100);
    return {
      lo, hi, span, rowHpct,
      rows: sorted.map(s => { const [c, p] = pick(s); const net = c + p; return {
        strike: s.strike, net, netUp: oiLike ? c >= p : net >= 0,
        callPct: (Math.abs(c) / maxM) * 100, putPct: (Math.abs(p) / maxM) * 100,
        yPct: (1 - (s.strike - lo) / span) * 100,
        isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
        isSpot: Math.abs(s.strike - spot) < spot * 0.0008,
      }; }),
    };
  }, [syncScale, profile, ladderMetric, spot]);

  const mSym = ladderMetric === 'GAMMA' ? 'γ' : ladderMetric === 'DELTA' ? 'Δ' : ladderMetric === 'VANNA' ? 'V' : ladderMetric === 'OI' ? 'OI' : 'Vol';
  const gammaPin = profile.magnet || spot; // where dealer gamma pins price — descriptive, not a call

  // One Exposure-Ladder row's cells (strike · put/call bars · net) — shared by the price-aligned and
  // the fallback list modes. The bars carry a width transition so a live GEX refresh animates rather
  // than snapping.
  const ladderRowCells = (r: typeof ladder[number]) => (
    <>
      <div className="text-right flex items-center justify-end gap-1">
        {r.isCW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} title="Call Wall" />}
        {r.isPW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--danger)' }} title="Put Wall" />}
        {r.isFlip && <span className="w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--warning)' }} title="GEX Flip" />}
        <span className="font-black tracking-wider" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{fmtNum(r.strike)}</span>
      </div>
      <div className="relative flex items-center h-full">
        <div className="w-1/2 h-full flex items-center justify-end pr-0.5 border-r border-dotted border-[var(--border)]"><div className="h-[9px] rounded-sm" style={{ width: `${r.putPct}%`, background: 'color-mix(in srgb, var(--danger) 60%, transparent)', transition: 'width 0.45s cubic-bezier(0.16,1,0.3,1)' }} /></div>
        <div className="w-1/2 h-full flex items-center pl-0.5"><div className="h-[9px] rounded-sm" style={{ width: `${r.callPct}%`, background: 'color-mix(in srgb, var(--success) 60%, transparent)', transition: 'width 0.45s cubic-bezier(0.16,1,0.3,1)' }} /></div>
      </div>
      <div className="text-right font-black" style={{ color: (ladderMetric === 'GAMMA' || ladderMetric === 'DELTA' || ladderMetric === 'VANNA') ? 'var(--greek)' : (r.netUp ? 'var(--success)' : 'var(--danger)') }}>{fmtBig(r.net)}</div>
    </>
  );

  // Descriptive read of dealer structure (regime, pin strength, force breakdown, observations).
  // We render only the descriptive outputs — this is an instrument, not a trade-picker.
  const read = useMemo(() => computeTerminalRead(profile, candles.slice(-12).map(c => c.close)), [profile, candles]);
  // GEX OUTLOOK — names the regime (pinning / gamma squeeze / short squeeze / trend / range)
  // and the level price is being drawn toward. Descriptive path read, not a trade pick.
  const outlook = useMemo(() => computeGexOutlook(profile, candles.slice(-12).map(c => c.close)), [profile, candles]);
  const outlookColor = outlook.bias === 'up' ? 'var(--success)' : outlook.bias === 'down' ? 'var(--danger)' : outlook.regime === 'PINNING' ? 'var(--info)' : 'var(--text-secondary)';

  // Narrative Engine — translates the live net-γ trend into one readable sentence instead of a raw number.
  // Pure synthesis of real data (Δ net GEX over the session window + the regime); confidence reuses the
  // already-derived outlook score rather than inventing a new one.
  const narrative = useMemo(() => {
    const cur = (profile.strikes || []).reduce((a, s) => a + (s.netGex || 0), 0) || (profile.netGex ?? 0);
    if (gexHist.length < 3) return null;
    const last = gexHist[gexHist.length - 1].t, windowMs = 15 * 60 * 1000;
    let past = gexHist[0];
    for (const sn of gexHist) { if (last - sn.t <= windowMs) { past = sn; break; } }
    const pastNet = Object.values(past.m).reduce((a, v) => a + (v as number), 0);
    const delta = cur - pastNet, mins = Math.max(1, Math.round((last - past.t) / 60000));
    if (Math.abs(delta) < 1e6) return null;
    const longG = cur >= 0, rising = delta >= 0;
    const imp = longG && rising ? 'Dealers are growing more long gamma — historically this dampens intraday volatility and favours mean-reversion around the pin.'
      : longG && !rising ? 'Dealers stay long gamma but are bleeding it — the volatility pin is weakening; watch the flip.'
      : !longG && !rising ? 'Dealers are pushing deeper short gamma — hedging amplifies the move, so expect trend continuation and wider ranges.'
      : 'Dealers are short gamma but covering — downside acceleration is easing.';
    return { text: `Net GEX ${rising ? 'climbed' : 'slid'} ${delta >= 0 ? '+' : '−'}${fmtBig(Math.abs(delta))} over the last ${mins} min. ${imp}`, conf: outlook.confidence, rising };
  }, [profile, gexHist, outlook]);

  // Centred macro readout cell — one decision metric in clean stacked type (§2 header zone).
  const macroStat = (label: string, value: string, color: string) => (
    <div className="flex flex-col items-center leading-none">
      <span className="text-[7.5px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[12px] font-black tabular-nums mt-1" style={{ color }}>{value}</span>
    </div>
  );

  // 0DTE session clock — time is the dominant risk; surface session phase + live countdown.
  const clock = useMemo(() => computeDealerClock(0, profile.netVex || 0, now), [profile.netVex, now]);
  const sess = useMemo(() => {
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const secs = et.getHours() * 3600 + et.getMinutes() * 60 + et.getSeconds();
    const open = 9.5 * 3600, close = 16 * 3600, live = secs >= open && secs <= close;
    const toClose = live ? close - secs : 0;
    const prog = live ? (secs - open) / (close - open) : secs < open ? 0 : 1;
    const cd = live ? `${Math.floor(toClose / 3600)}:${String(Math.floor((toClose % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(toClose % 60)).padStart(2, '0')}` : 'CLOSED';
    return { live, prog, cd };
  }, [now]);
  const SEGS = [{ k: 'o', sess: 'OPEN', l: 'Open Drive', w: 0.154 }, { k: 'm', sess: 'MIDDAY', l: 'Midday', w: 0.615 }, { k: 'p', sess: 'POWER_HOUR', l: 'Power Hour', w: 0.154 }, { k: 'c', sess: 'CLOSE', l: 'Into Close', w: 0.077 }] as const;

  const Tile = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) => (
    <div className="bg-[var(--surface-2)] rounded-lg px-2.5 py-2">
      <div className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">{label}</div>
      <div className="text-[14px] font-mono font-black tabular-nums leading-tight mt-0.5" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5 truncate">{sub}</div>}
    </div>
  );

  const segToggle = (opts: readonly string[], val: string, set: (v: string) => void, accentActive = false) => (
    <div className="flex items-center p-0.5 rounded-md gap-0.5 bg-[var(--surface-2)] border border-[var(--border)]">
      {opts.map(o => (
        <button key={o} onClick={() => set(o)} className={`px-2 py-0.5 text-[10px] font-mono font-black tracking-wider rounded transition-colors ${val === o ? (accentActive ? 'text-black' : 'bg-[var(--surface-3)] text-[var(--text-primary)]') : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`} style={val === o && accentActive ? { background: 'var(--accent-color)' } : undefined}>{o}</button>
      ))}
    </div>
  );

  return (
    <div
      className="w-full flex flex-col animate-fadeIn"
      data-gex-regime={longGamma ? 'long' : 'short'}
      style={{
        minHeight: '820px',
        backgroundColor: 'var(--bg-base)',
        backgroundImage: `radial-gradient(150% 70% at 50% 0%, color-mix(in srgb, ${regimeTint} ${ambientWash}%, transparent), transparent 72%)`,
        color: 'var(--text-secondary)',
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${regimeTint} ${ambientRing}%, transparent), inset 0 0 90px color-mix(in srgb, ${regimeTint} ${ambientGlow}%, transparent)`,
        transition: 'background-image 1200ms ease, box-shadow 1200ms ease',
        ['--gex-regime-tint' as string]: regimeTint,
      } as CSSProperties}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 border-b border-[var(--border)] shrink-0 bg-[var(--surface)] relative">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-[var(--surface-2)] border border-[var(--border)]">
            <Crosshair className="w-4 h-4" style={{ color: 'var(--accent-color)' }} />
          </div>
          <div className="leading-none hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-sans font-black tracking-widest uppercase text-[var(--text-primary)]">Live Terminal</span>
              <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: 'var(--success)' }} /><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: 'var(--success)' }} /></span>
            </div>
            <div className="text-[9px] font-mono uppercase tracking-[0.28em] mt-0.5 text-[var(--text-tertiary)]">Dealer Flow Engine</div>
          </div>
          <span className="w-px h-5 bg-[var(--border)] hidden sm:block" />
          {/* symbol */}
          <div className="relative">
            <button onClick={() => setTickerOpen(o => !o)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[12px] font-mono font-black tracking-wider text-[var(--text-primary)] transition-colors">
              {selectedAsset.ticker}<ChevronDown className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform ${tickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {tickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setTickerOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 w-48 max-h-80 overflow-y-auto rounded-md shadow-2xl py-1 bg-[var(--surface)] border border-[var(--border-strong)]">
                  {ASSET_LIST.map(a => (
                    <button key={a.ticker} onClick={() => { setSelectedAsset(a); setTickerOpen(false); }} className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--surface-3)] transition-colors ${a.ticker === selectedAsset.ticker ? 'bg-[var(--surface-2)]' : ''}`}>
                      <span className="text-[12px] font-mono font-bold" style={{ color: a.ticker === selectedAsset.ticker ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{a.ticker}</span>
                      <span className="text-[9px] font-sans text-[var(--text-tertiary)] truncate ml-2 max-w-[110px]">{a.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* spot — compact (small screens); the centred macro readout takes over on lg+ */}
          <div className="flex items-baseline gap-1.5 shrink-0 lg:hidden">
            <span className={`text-[18px] font-mono font-black tabular-nums leading-none text-[var(--text-primary)] ${flash === 'up' ? 'tick-up' : flash === 'down' ? 'tick-down' : ''}`}>{spot ? spot.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'}</span>
            <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: dayChg >= 0 ? 'var(--success)' : 'var(--danger)' }}>{dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)}%</span>
          </div>
        </div>
        {/* Centred macro readout — Asset · Price · Δ · Regime · Gamma · Exp Move · Confidence (§2) */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-3.5 font-mono">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-black tracking-wider text-[var(--text-tertiary)]">{selectedAsset.ticker}</span>
            <span className={`text-[19px] font-black tabular-nums leading-none text-[var(--text-primary)] ${flash === 'up' ? 'tick-up' : flash === 'down' ? 'tick-down' : ''}`}>{spot ? spot.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'}</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: dayChg >= 0 ? 'var(--success)' : 'var(--danger)' }}>{dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)}%</span>
          </div>
          <span className="w-px h-6 bg-[var(--border)]" />
          {macroStat('Regime', outlook.regime, outlookColor)}
          {macroStat('Gamma', longGamma ? 'Long γ' : 'Short γ', trend)}
          {macroStat('Exp Move', emPct != null ? `±${(emPct * 100).toFixed(2)}%` : '—', 'var(--info)')}
          {macroStat('Conf', `${outlook.confidence}%`, outlookColor)}
        </div>
        <div className="flex items-center gap-2">
          {/* Honest feed status — provider name when the chain is live, MODEL on synthetic data,
              STALE if the SSE heartbeat stalls. Replaces the old hardcoded "LIVE". */}
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-black uppercase tracking-widest shrink-0" title={!marketOpen ? `Market closed — last-close snapshot${feedProvider ? ' from ' + feedProvider : ''} (updated ${staleSecs}s ago); data is frozen, not live` : liveFeed ? `Live options feed (${feedProvider}) · updated ${staleSecs}s ago` : isStale ? `Feed stalled — last update ${staleSecs}s ago` : 'Synthetic model data — connect a provider API key for a live feed'} style={{ borderColor: `color-mix(in srgb, ${feedColor} 42%, transparent)`, background: `color-mix(in srgb, ${feedColor} 10%, transparent)`, color: feedColor }}>
            {liveFeed
              ? <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: feedColor }} /><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: feedColor }} /></span>
              : <span className="w-1.5 h-1.5 rounded-full" style={{ background: feedColor }} />}
            {feedLabel}
          </span>
          <div className="hidden md:block">{segToggle(TF.map(t => t.val), selectedTimeframe, setSelectedTimeframe)}</div>
          {segToggle(['0DTE', 'ALL'], scope, v => setScope(v as '0DTE' | 'ALL'), true)}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono font-black uppercase tracking-widest lg:hidden" style={{ borderColor: longGamma ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'color-mix(in srgb, var(--danger) 40%, transparent)', background: longGamma ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)', color: trend, boxShadow: `0 0 16px ${longGamma ? 'color-mix(in srgb, var(--success) 18%, transparent)' : 'color-mix(in srgb, var(--danger) 18%, transparent)'}` }}>
            {longGamma ? <Activity className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-current" />}{longGamma ? 'Long γ' : 'Short γ'} · {read.regime === 'PIN' ? `Pin ${read.pinStrength}` : 'Trend'}
          </span>
        </div>
      </div>

      {/* Dealer Pulse — descriptive picture of dealer positioning (force balance · net γ · range · motion · tape) */}
      <DealerPulse read={read} trend={trend} netGex={netGex} showMotion={!!dyn} migration={migration} gammaMotion={gammaMotion} vannaFlow={vannaFlow} />

      {/* ── 0DTE session band: phase + live countdown to close ── */}
      <SessionBand sess={sess} clock={clock} />

      {/* ── 3-column workspace (full-bleed — fills the whole screen) ── */}
      <div className="flex-1 w-full overflow-hidden flex">
        <div className="flex flex-col xl:flex-row w-full h-full overflow-hidden">

          {/* ░ LEFT — Key Levels / Flow ░ */}
          <aside className="order-2 xl:order-1 w-full xl:w-[276px] shrink-0 border-r border-[var(--border)] flex flex-col min-h-[360px] xl:min-h-0 bg-[var(--surface)]">
            <div className="flex items-center gap-4 px-3 h-9 border-b border-[var(--border)] shrink-0">
              {(['levels', 'matrix', 'flow'] as const).map(t => (
                <button key={t} onClick={() => setLeftTab(t)} className="relative text-[11px] font-sans font-black tracking-widest uppercase transition-colors py-2" style={{ color: leftTab === t ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {t === 'levels' ? 'Key Levels' : t === 'matrix' ? 'Matrix' : 'Order Flow'}
                  {leftTab === t && <span className="absolute -bottom-px left-0 right-0 h-[2px]" style={{ background: 'var(--accent-color)' }} />}
                </button>
              ))}
            </div>

            {leftTab === 'matrix' ? (
              <div className="flex-1 min-h-0 overflow-y-auto"><StrikeMatrix profile={profile} decimals={decimals} /></div>
            ) : leftTab === 'flow' ? (
              <div className="flex-1 min-h-0"><OrderFlow data={orderFlow} decimals={decimals} /></div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {/* GEX OUTLOOK — the regime read + where price is being drawn (pinning / gamma
                    squeeze / short squeeze / trend / range). Describes the path, not a trade. */}
                <div className="rounded-lg border px-3 py-2 relative overflow-hidden" style={{ borderColor: `color-mix(in srgb, ${outlookColor} 40%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${outlookColor} 13%, transparent), transparent)` }}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]"><Crosshair className="w-3 h-3" /> GEX Outlook</span>
                    <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: outlookColor }}>{outlook.confidence}% conf</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {outlook.bias === 'up' ? <TrendingUp className="w-4 h-4" style={{ color: 'var(--success)' }} /> : outlook.bias === 'down' ? <TrendingDown className="w-4 h-4" style={{ color: 'var(--danger)' }} /> : <Minus className="w-4 h-4 text-[var(--text-tertiary)]" />}
                    <span className="text-[17px] font-sans font-black tracking-tight leading-none" style={{ color: outlookColor }}>{outlook.regime}</span>
                  </div>
                  <div className="text-[11px] font-mono font-bold text-[var(--text-secondary)] mt-1.5 leading-snug">{outlook.headline}</div>
                  <div className="text-[9.5px] font-mono text-[var(--text-tertiary)] mt-0.5 leading-snug">{outlook.detail}</div>
                  {outlook.target != null && (
                    <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}>
                      <span className="text-[8.5px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Path toward</span>
                      <span className="text-[12px] font-mono font-black tabular-nums" style={{ color: outlookColor }}>{fmtNum(outlook.target)}</span>
                      <span className="text-[9px] font-mono tabular-nums text-[var(--text-tertiary)] ml-auto">{distLabel(outlook.target)}</span>
                    </div>
                  )}
                  {narrative && (
                    <div className="flex gap-1.5 mt-1.5 pt-1.5 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)' }}>
                      <span className="mt-[3px] w-1 h-1 rounded-full shrink-0 animate-pulse" style={{ background: narrative.rising ? 'var(--success)' : 'var(--danger)' }} />
                      <p className="text-[9.5px] font-mono leading-snug text-[var(--text-secondary)]">{narrative.text} <span className="text-[var(--text-tertiary)]">({narrative.conf}% conf)</span></p>
                    </div>
                  )}
                </div>
                {/* PROVEN EDGE — the GEX outlook above, scored against what price actually did.
                    Turns the regime call from an assertion into a measured, falsifiable hit-rate. */}
                <EdgeTrackRecord profile={profile} ticker={selectedAsset.ticker} candles={candles} provenance={realFeed ? 'live' : 'model'} />
                {/* Net gamma hero */}
                <div className="rounded-lg border px-3 py-2 relative overflow-hidden" style={{ borderColor: longGamma ? 'color-mix(in srgb, var(--success) 32%, transparent)' : 'color-mix(in srgb, var(--danger) 32%, transparent)', background: `linear-gradient(135deg, color-mix(in srgb, ${longGamma ? 'var(--success)' : 'var(--danger)'} 9%, transparent), transparent)` }}>
                  <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]"><GaugeIcon className="w-3 h-3" /> Net Gamma Exposure</div>
                  <div className="text-[26px] font-mono font-black tabular-nums leading-none mt-1" style={{ color: trend }}>{netGex >= 0 ? '+' : ''}{fmtBig(netGex)}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest" style={{ background: `color-mix(in srgb, ${trend} 14%, transparent)`, color: trend }}>{aboveFlip == null ? 'No Flip' : aboveFlip ? 'Above Flip' : 'Below Flip'}</span>
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)]">{read.regimeLabel}</span>
                  </div>
                  {/* Wall strength (0–100) — not all walls are equal; the engine blends gamma, OI
                      and volume so a trader can tell a concrete wall from a paper one. */}
                  {(wallRes || wallSup) && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}>
                      <div className="text-[8.5px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">Wall Strength · 0–100</div>
                      <div className="grid grid-cols-2 gap-2">
                        {[{ w: wallRes, lbl: 'Resistance', col: 'var(--danger)' }, { w: wallSup, lbl: 'Support', col: 'var(--success)' }].map(({ w, lbl, col }) => (
                          <div key={lbl} className="min-w-0" title={w ? `${lbl} ${fmtNum(w.strike)} — strength ${w.score}/100 (gamma · OI · volume)` : `no ${lbl.toLowerCase()} wall`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono font-bold tabular-nums text-[var(--text-secondary)]">{lbl === 'Resistance' ? '▲ ' : '▼ '}{w ? fmtNum(w.strike) : '—'}</span>
                              <span className="text-[10px] font-mono font-black tabular-nums" style={{ color: w ? col : 'var(--text-tertiary)' }}>{w ? w.score : '—'}</span>
                            </div>
                            <div className="h-1 rounded-full bg-[var(--surface-3)] overflow-hidden mt-0.5"><div className="h-full rounded-full" style={{ width: `${w ? Math.min(100, w.score) : 0}%`, background: col }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Dealer Forces — each mechanic's lean, shown so the trader reads it themselves */}
                <div className="bg-[var(--surface-2)] rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[var(--border)]">
                    <span className="text-[9px] font-sans font-black tracking-widest uppercase text-[var(--text-secondary)]">Dealer Forces</span>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">what's driving structure</span>
                  </div>
                  <div className="py-0.5">
                    {read.signals.map(s => (
                      <div key={s.key} className="flex items-center gap-2 px-3 h-[28px] hover:bg-[var(--surface-3)] transition-colors" title={s.detail}>
                        {s.dir > 0 ? <TrendingUp className="w-3 h-3 shrink-0" style={{ color: 'var(--success)' }} /> : s.dir < 0 ? <TrendingDown className="w-3 h-3 shrink-0" style={{ color: 'var(--danger)' }} /> : <Minus className="w-3 h-3 shrink-0 text-[var(--text-tertiary)]" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-mono font-bold text-[var(--text-secondary)] truncate leading-tight">{s.label}</div>
                          <div className="text-[9px] font-mono text-[var(--text-tertiary)] truncate leading-tight">{s.detail}</div>
                        </div>
                        <div className="w-9 h-1 rounded-full bg-[var(--surface-3)] overflow-hidden shrink-0"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.weight / 28) * 100)}%`, background: s.dir > 0 ? 'var(--success)' : s.dir < 0 ? 'var(--danger)' : 'var(--text-tertiary)' }} /></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* dealer-structure spectrum */}
                {structure && (
                  <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Dealer Structure</span>
                      {migration && migration.direction !== 'STABLE' && (
                        <span className="flex items-center gap-0.5 text-[8.5px] font-mono font-black uppercase tracking-wide tabular-nums" style={{ color: migration.direction === 'BULLISH' ? 'var(--success)' : 'var(--danger)' }} title={`Gamma center-of-mass migrating ${migration.direction.toLowerCase()} — the dealer pin is drifting toward ${fmtNum(migration.comCurrent)}`}>
                          {migration.direction === 'BULLISH' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />} CoM {fmtNum(migration.comCurrent)}
                        </span>
                      )}
                    </div>
                    <div className="relative h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--danger) 45%, transparent), color-mix(in srgb, var(--text-tertiary) 25%, transparent), color-mix(in srgb, var(--success) 45%, transparent))' }}>
                      {structure.pts.map((pt, i) => (<div key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-3 rounded-full" style={{ left: `${pt.x}%`, background: pt.c }} title={pt.l} />))}
                      <motion.div className="absolute -top-[5px] -translate-x-1/2 z-10" animate={{ left: `${structure.spotPos}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }}>
                        <div className="w-3 h-3 rotate-45" style={{ background: 'var(--text-primary)', boxShadow: '0 0 8px var(--accent-color)' }} />
                      </motion.div>
                    </div>
                    <div className="relative h-7 mt-2">
                      {structure.pts.map((pt, i) => (<div key={i} className="absolute -translate-x-1/2 text-center leading-tight" style={{ left: `${pt.x}%` }}><div className="text-[9px] font-mono font-black" style={{ color: pt.c }}>{pt.l}</div><div className="text-[9px] font-mono text-[var(--text-tertiary)] tabular-nums">{fmtNum(pt.p as number)}</div></div>))}
                    </div>
                  </div>
                )}

                {/* key levels list */}
                <div className="bg-[var(--surface-2)] rounded-lg overflow-hidden">
                  <div className="px-3 pt-2 pb-1.5 text-[9px] font-sans font-black tracking-widest uppercase text-[var(--text-secondary)] border-b border-[var(--border)]">Key Levels</div>
                  <div className="stagger-children">
                    {levels.map((l, i) => (
                      <div key={l.n} className="flex items-center gap-2 px-3 h-[26px] hover:bg-[var(--surface-3)] transition-colors" style={{ borderTop: i ? '1px solid var(--border)' : undefined }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.c }} />
                        <span className="text-[11px] font-mono font-bold flex-1 truncate text-[var(--text-secondary)] flex items-center gap-1">{l.n}{((l.n === 'GEX Flip' && !flipConfident) || ((l.n === 'Call Wall' || l.n === 'Put Wall') && !wallsConfident)) && <span className="px-1 rounded-sm text-[8px] font-black tracking-wide uppercase shrink-0" style={{ background: 'color-mix(in srgb, var(--warning) 16%, transparent)', color: 'var(--warning)' }} title="Statistically thin — the engine flags this level as a low-confidence estimate">est</span>}</span>
                        <span className="text-[11px] font-mono font-black tabular-nums" style={{ color: l.c }}>{fmtNum(l.v as number)}</span>
                        <span className="text-[10px] font-mono tabular-nums w-[42px] text-right text-[var(--text-tertiary)]">{distLabel(l.v)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Vanna · VEX" value={read.netVex != null ? fmtBig(read.netVex) : '—'}
                    sub={vannaFlow ? `${vannaFlow === 'SUPPORTIVE' ? 'Supportive' : vannaFlow === 'PRESSURING' ? 'Pressuring' : 'Neutral'}${dyn && dyn.vanna.trend !== 'FLAT' ? ' · ' + dyn.vanna.trend.toLowerCase() : ''}` : (read.netVex != null ? (longGamma ? 'Stabilizing' : 'Destabilizing') : 'no feed')}
                    color={vannaFlow === 'SUPPORTIVE' ? 'var(--success)' : vannaFlow === 'PRESSURING' ? 'var(--danger)' : 'var(--info)'} />
                  <Tile label="Net Delta · DEX" value={fmtBig(profile.netDex ?? 0)} sub={(profile.netDex ?? 0) >= 0 ? 'Long delta' : 'Short delta'} color={(profile.netDex ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'} />
                  <Tile label="Charm · 0DTE" value={charm ? `${Math.round(charm.intensity * 100)}%` : '—'}
                    sub={charm ? `${charm.bias === 'BULLISH' ? 'Bullish' : charm.bias === 'BEARISH' ? 'Bearish' : 'Neutral'} · into close` : 'time-decay flow'}
                    color={charm ? (charm.bias === 'BULLISH' ? 'var(--success)' : charm.bias === 'BEARISH' ? 'var(--danger)' : 'var(--info)') : 'var(--text-primary)'} />
                  <Tile label="Call / Put OI" value={profile.callPutOiRatio || (callOi && putOi ? (callOi / putOi).toFixed(2) : '—')} sub="bias" color="var(--accent-color)" />
                </div>
              </div>
            )}
          </aside>

          {/* ░ CENTER — flow header + chart ░ */}
          <main className="order-1 xl:order-2 flex-1 min-w-0 flex flex-col border-r border-[var(--border)] min-h-[440px]">
            <div className="px-3 py-1.5 border-b border-[var(--border)] shrink-0 bg-[var(--surface)]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-wider min-w-0">
                  <span className="flex items-center gap-1" style={{ color: 'var(--accent-color)' }}><Activity className="w-3 h-3" /> Flow</span>
                  <span className="text-[var(--text-primary)]">{selectedAsset.ticker}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)', color: 'var(--accent-color)' }}>{scope}</span>
                  <span className="hidden sm:inline" style={{ color: isStale && marketOpen ? 'var(--danger)' : 'var(--text-tertiary)' }}>· {selectedTimeframe} · {!marketOpen ? 'LAST CLOSE' : liveFeed ? 'LIVE' : isStale ? `STALE ${staleSecs}s` : 'MODEL'}</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono font-black tabular-nums shrink-0">
                  <button onClick={() => setGexLines(m => !m)} title="Strike GEX line chart — top strikes' net gamma tracked over the session" className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-black uppercase tracking-wide border transition-colors ${gexLines ? 'border-[var(--accent-color)] text-black' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`} style={gexLines ? { background: 'var(--accent-color)' } : undefined}><Activity className="w-3 h-3" /> GEX</button>
                  <button onClick={() => setMultiChart(m => !m)} title="Toggle the movable multi-chart grid" className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-black uppercase tracking-wide border transition-colors ${multiChart ? 'border-[var(--accent-color)] text-black' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`} style={multiChart ? { background: 'var(--accent-color)' } : undefined}><Layers className="w-3 h-3" /> Multi</button>
                  {/* Round ONCE and derive the complement so the two halves always sum to 100 (no 101%). */}
                  <span style={{ color: 'var(--success)' }}>BULL {Math.round(bullPct)}%</span>
                  <span style={{ color: 'var(--danger)' }}>BEAR {100 - Math.round(bullPct)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full" style={{ width: `${bullPct}%`, background: 'var(--success)' }} />
                <div className="h-full flex-1" style={{ background: 'var(--danger)' }} />
              </div>
            </div>
            <div className="flex-1 min-h-[400px] relative" style={{ background: 'var(--bg-base)' }}>
              {gexLines
                ? <div className="absolute inset-0 p-1.5"><StrikeGexChart history={gexHist} /></div>
                : multiChart
                ? <ChartPanelGrid profile={profile} decimals={decimals} candles={candles} baseTicker={selectedAsset.ticker} timeframe={selectedTimeframe} />
                : <SlayerChart profile={profile} decimals={decimals} />}
            </div>
          </main>

          {/* ░ RIGHT — Exposure Ladder ░ */}
          <aside className="order-3 w-full xl:w-[340px] shrink-0 flex flex-col min-h-[360px] xl:min-h-0 bg-[var(--surface)]">
            <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0">
              <Layers className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} />
              <span className="text-[11px] font-sans font-black tracking-widest uppercase text-[var(--text-primary)]">Exposure Ladder</span>
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest border border-[var(--border)]" style={{ color: trend }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: trend }} />{read.regime}
              </span>
            </div>
            {/* GAMMA / DELTA / VANNA exposure metric */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] shrink-0">
              <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)] mr-1">Metric</span>
              {(['GAMMA', 'DELTA', 'VANNA', 'OI', 'VOL'] as const).map(m => { const dis = (m === 'DELTA' && !hasDex) || (m === 'VANNA' && !hasVex) || (m === 'OI' && !hasOi) || (m === 'VOL' && !hasVol); return (
                <button key={m} disabled={dis} onClick={() => setLadderMetric(m)} title={dis ? `No ${m.toLowerCase()} data in this feed` : `Show per-strike ${m.toLowerCase()}`} className="px-2 py-0.5 text-[9px] font-mono font-black tracking-wider rounded transition-colors" style={ladderMetric === m ? { background: 'var(--surface-3)', color: 'var(--text-primary)' } : { color: dis ? 'color-mix(in srgb, var(--text-tertiary) 40%, transparent)' : 'var(--text-tertiary)', cursor: dis ? 'not-allowed' : 'pointer' }}>{m}</button>
              ); })}
            </div>
            {(vacAbove || vacBelow) && (
              <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--border)] shrink-0 text-[9px] font-mono" style={{ background: 'color-mix(in srgb, var(--warning) 6%, transparent)' }} title="Liquidity vacuums — strike bands with little dealer gamma / OI / volume, where price tends to travel fast">
                <span className="font-black tracking-widest uppercase shrink-0" style={{ color: 'var(--warning)' }}>Air Pockets</span>
                {vacAbove && <span className="tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>▲ {fmtNum(vacAbove.lo)}–{fmtNum(vacAbove.hi)}</span>}
                {vacBelow && <span className="tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>▼ {fmtNum(vacBelow.lo)}–{fmtNum(vacBelow.hi)}</span>}
                <span className="ml-auto text-[var(--text-tertiary)] shrink-0 hidden sm:inline">fast-move zones</span>
              </div>
            )}
            <div className="grid grid-cols-[52px_1fr_64px] gap-2 px-3 py-1.5 border-b border-[var(--border)] shrink-0 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)]">
              <div className="text-right">Strike</div>
              <div className="flex justify-between"><span style={{ color: 'var(--danger)' }}>◄ Put {mSym}</span><span style={{ color: 'var(--success)' }}>{mSym} Call ►</span></div>
              <div className="text-right">{ladderMetric === 'OI' || ladderMetric === 'VOL' ? 'Total' : 'Net'}</div>
            </div>
            {/* Dealer Gamma Profile — a price-aligned tiling histogram that fills the panel with the
                chart's live range and flows as the price axis expands / shortens. Bar thickness tracks
                strike spacing (no sparse gaps); bar length = the metric. Falls back to a dense list
                until the chart broadcasts its scale. */}
            <div ref={ladderScrollRef} className={`flex-1 relative ${gammaProfile ? 'overflow-hidden' : 'overflow-y-auto'}`}>
              {ladder.length === 0 && <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>}
              {gammaProfile ? (() => {
                const { lo, hi, span, rowHpct, rows } = gammaProfile;
                const labels = rowHpct >= 3.1;            // show strike/value text only when rows are tall enough
                const barH = labels ? '68%' : 'calc(100% - 1px)';
                const greek = ladderMetric === 'GAMMA' || ladderMetric === 'DELTA' || ladderMetric === 'VANNA';
                return (
                  <>
                    {rows.map(r => {
                      const inVac = !!((vacAbove && r.strike >= vacAbove.lo && r.strike <= vacAbove.hi) || (vacBelow && r.strike >= vacBelow.lo && r.strike <= vacBelow.hi));
                      const mk = r.isCW ? 'var(--success)' : r.isPW ? 'var(--danger)' : r.isFlip ? 'var(--warning)' : null;
                      return (
                        <div key={r.strike} data-strike={r.strike} className="absolute left-0 right-0 flex items-center px-2" style={{ top: `${r.yPct}%`, height: `${rowHpct}%`, transform: 'translateY(-50%)', transition: 'top 0.3s cubic-bezier(0.22,1,0.36,1), height 0.3s cubic-bezier(0.22,1,0.36,1)', background: inVac ? 'color-mix(in srgb, var(--warning) 5%, transparent)' : undefined }}>
                          {labels && <span className="w-[42px] shrink-0 text-right text-[9px] font-mono tabular-nums flex items-center justify-end gap-1" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-tertiary)' }}>{mk && <span className="w-1 h-1 rounded-full shrink-0" style={{ background: mk }} />}{fmtNum(r.strike)}</span>}
                          <div className="flex-1 h-full flex items-center mx-1.5">
                            <div className="w-1/2 h-full flex items-center justify-end pr-px border-r border-[var(--border)]"><div className="rounded-l-[2px]" style={{ width: `${r.putPct}%`, height: barH, background: 'color-mix(in srgb, var(--danger) 62%, transparent)', transition: 'width 0.42s cubic-bezier(0.22,1,0.36,1), height 0.3s ease' }} /></div>
                            <div className="w-1/2 h-full flex items-center justify-start pl-px"><div className="rounded-r-[2px]" style={{ width: `${r.callPct}%`, height: barH, background: 'color-mix(in srgb, var(--success) 62%, transparent)', transition: 'width 0.42s cubic-bezier(0.22,1,0.36,1), height 0.3s ease' }} /></div>
                          </div>
                          {labels && <span className="w-[56px] shrink-0 text-right text-[9px] font-mono font-black tabular-nums" style={{ color: greek ? 'var(--greek)' : (r.netUp ? 'var(--success)' : 'var(--danger)') }}>{fmtBig(r.net)}</span>}
                        </div>
                      );
                    })}
                    {spot >= lo && spot <= hi && (
                      // Current price = an overlay LINE across the profile with its tag on the LEFT (the
                      // strike/axis side) and a "SPOT" prefix, so it can never be mistaken for a NET value.
                      <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center gap-1" style={{ top: `${(1 - (spot - lo) / span) * 100}%`, transform: 'translateY(-50%)', transition: 'top 0.3s cubic-bezier(0.22,1,0.36,1)' }} title={`Spot ${fmtNum(spot, decimals)}`}>
                        <span className="ml-1 shrink-0 text-[8px] font-mono font-black px-1 rounded-sm leading-none py-px" style={{ background: 'var(--accent-color)', color: '#06090d' }}>SPOT {fmtNum(spot, decimals)}</span>
                        <div className="flex-1 h-px" style={{ background: 'var(--accent-color)', boxShadow: '0 0 7px var(--accent-color)' }} />
                      </div>
                    )}
                  </>
                );
              })() : ladder.map(r => {
                const inVac = !!((vacAbove && r.strike >= vacAbove.lo && r.strike <= vacAbove.hi) || (vacBelow && r.strike >= vacBelow.lo && r.strike <= vacBelow.hi));
                return (
                  <div key={r.strike} data-strike={r.strike} className="grid grid-cols-[52px_1fr_64px] gap-2 px-3 h-[22px] items-center text-[10px] font-mono tabular-nums hover:bg-[var(--surface-2)]" style={r.isSpot ? { background: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', boxShadow: 'inset 2px 0 0 var(--accent-color)' } : inVac ? { background: 'color-mix(in srgb, var(--warning) 6%, transparent)' } : undefined}>
                    {ladderRowCells(r)}
                  </div>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t border-[var(--border)] shrink-0 flex items-center justify-between bg-[var(--surface)]">
              <div>
                <div className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Gamma Pin</div>
                <div className="text-[15px] font-mono font-black tabular-nums text-[var(--text-primary)]">{gammaPin ? fmtNum(gammaPin, decimals) : '—'}</div>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-black tabular-nums uppercase tracking-widest border border-[var(--border)]" style={{ color: gammaPin >= spot ? 'var(--success)' : 'var(--danger)' }}>{distLabel(gammaPin)} vs spot</span>
            </div>
          </aside>

        </div>
      </div>
      {profileHist.length > 2 && <ReplayScrubber hist={profileHist} replayT={replayT} setReplayT={setReplayT} decimals={decimals} />}
      <SystemStatus feedLabel={feedLabel} live={liveFeed} feedColor={feedColor} cd={sess.cd} />
    </div>
  );
}
