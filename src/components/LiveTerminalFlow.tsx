import { useMemo, useState, useRef, useEffect, CSSProperties } from 'react';
import { GexProfileData, OrderFlowData } from '../types';
import { useContractStore } from '../lib/store';
import type { StrikeGravityResult } from '../lib/strikeGravity';
import { computeTerminalRead, computeGexOutlook } from '../lib/terminalRead';
import { computeDealerClock } from '../lib/dealerClock';
import { fmtNum } from '../lib/format';
import { SlayerChart } from './SlayerChart';
import { ChartPanelGrid } from './ChartPanelGrid';
import { StrikeGexChart } from './StrikeGexChart';
import { useGexHistory } from '../lib/gexHistory';
import { StrikeMatrix } from './StrikeMatrix';
import { GreeksMatrix } from './GreeksMatrix';
import { OrderFlow } from './OrderFlow';
import { DealerDynamicsPanel } from './DealerDynamicsPanel';
import { RegimeMatrixPanel } from './RegimeMatrixPanel';
import { TerminalWorkspace } from './TerminalWorkspace';
import { TopStrikesPanel } from './TopStrikesPanel';
import { LevelAlertsPanel } from './LevelAlertsPanel';
import { loadAlerts, saveAlerts, detectCrosses, newAlertId, type ArmedAlert, type FiredAlert, type AlertKind } from '../lib/levelAlerts';
import { SystemStatus } from './terminal/StatusBar';
import { ReplayScrubber } from './terminal/ReplayScrubber';
import { DealerPulse } from './terminal/DealerPulse';
import { SessionBand } from './terminal/SessionBand';
import { fmtBig } from './terminal/format';
import { CROSSHAIR_EVENT, CrosshairDetail } from '../lib/chartSync';
import { EdgeTrackRecord } from './EdgeTrackRecord';
import { Crosshair, Activity, Zap, Layers, ChevronDown, Gauge as GaugeIcon, TrendingUp, TrendingDown, Minus, Clock, Maximize2, Minimize2, LayoutGrid, Star } from 'lucide-react';
import { loadWatchlist, saveWatchlist, toggleWatch } from '../lib/watchlist';
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
  // Stabilize the live profile's identity (Phase 1C-4 perf): downstream gets a NEW object only when the
  // content actually changed. A heartbeat frame that re-sends an identical snapshot (common when the market
  // is closed — the user's frequent "LAST CLOSE" case) then no longer re-renders the chart/panels or
  // re-runs the profile-derived memos, since SlayerChart's memo + the useMemos below all key off this ref.
  const profileSigRef = useRef('');
  const stableLiveRef = useRef<GexProfileData>(liveProfile);
  {
    const lp = liveProfile;
    const sig = lp ? `${lp.spot}|${lp.netGex}|${lp.gammaFlip}|${lp.callWall}|${lp.putWall}|${lp.magnet}|${lp.expectedMovePct}|${lp.strikes?.length ?? 0}|${lp.feed}` : '∅';
    if (sig !== profileSigRef.current) { profileSigRef.current = sig; stableLiveRef.current = lp; }
  }
  const stableLive = stableLiveRef.current;
  const profile = useMemo(() => {
    if (replayT == null || !profileHist.length) return stableLive;
    let best = profileHist[0];
    for (const s of profileHist) { if (s.t <= replayT) best = s; else break; }
    return best.p;
  }, [replayT, stableLive, profileHist.length]);
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
  // Strike Gravity (premium tier-3): per-strike dealer-pressure score (0..1) + support/resistance ZONES,
  // computed server-side. Undefined at tier-2 — the ladder degrades to canonical wall/flip/pin labels and
  // suppresses the 0–100 strength entirely (never recomputed or fabricated client-side).
  const grav = serverState?.strike_gravity as StrikeGravityResult | undefined;
  const isReplay = replayT != null;   // scrubbed to a PAST snapshot — live gravity no longer describes the shown profile
  const [tickerOpen, setTickerOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<'levels' | 'matrix' | 'flow' | 'alerts' | 'dynamics'>('levels');
  const [scope, setScope] = useState<'0DTE' | 'ALL'>('0DTE');
  const [multiChart, setMultiChart] = useState(false); // opt-in movable/resizable multi-chart grid
  const [chartFocus, setChartFocus] = useState(false); // chart-hero focus mode — collapses both side rails (xl+)
  const [matrixMax, setMatrixMax] = useState(false); // full-screen the gamma matrix over the whole workspace
  const [matrixMode, setMatrixMode] = useState<'expiry' | 'greeks'>('expiry'); // EXPIRY = strike×expiry γ heatmap · GREEKS = strike×DEX/GEX/VEX/CEX exposure grid
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist()); // persisted starred tickers
  const toggleWatchTicker = (t: string) => setWatchlist(prev => { const next = toggleWatch(prev, t); saveWatchlist(next); return next; });
  const [customize, setCustomize] = useState(false); // TradingView-style drag/resize/save custom layout
  const [gexLines, setGexLines] = useState(false); // center toggle — multi-strike GEX line chart
  const [ladderMetric, setLadderMetric] = useState<'GAMMA' | 'DELTA' | 'VANNA' | 'OI' | 'VOL'>('GAMMA');
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
  // Gamma SIGN rides its own colour axis — blue = long γ (dealers suppress vol), amber = short γ
  // (dealers amplify vol) — so it never collides with green/red, which mean DIRECTION (bull/bear,
  // call/put, up/down) everywhere else. Matches the ambient regime wash (info/warning). (P2-18)
  const trend = longGamma ? 'var(--info)' : 'var(--warning)';

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

  // ── Level alerts — chime + log when spot crosses a dealer level or custom price (descriptive only) ──
  const tkr = selectedAsset.ticker;
  const [armedAlerts, setArmedAlerts] = useState<ArmedAlert[]>(() => loadAlerts());
  const [firedAlerts, setFiredAlerts] = useState<FiredAlert[]>([]);
  const prevSpotRef = useRef<number | null>(null);
  const updateArmed = (next: ArmedAlert[]) => { setArmedAlerts(next); saveAlerts(next); };
  const toggleAlert = (kind: Exclude<AlertKind, 'custom'>) => {
    const has = armedAlerts.some(a => a.kind === kind && a.ticker === tkr);
    updateArmed(has ? armedAlerts.filter(a => !(a.kind === kind && a.ticker === tkr)) : [...armedAlerts, { id: newAlertId(), ticker: tkr, kind }]);
  };
  const addCustomAlert = (price: number) => updateArmed([...armedAlerts, { id: newAlertId(), ticker: tkr, kind: 'custom', price }]);
  const removeAlert = (id: string) => updateArmed(armedAlerts.filter(a => a.id !== id));
  useEffect(() => {
    const prev = prevSpotRef.current; prevSpotRef.current = spot;
    if (prev == null || !spot || !marketOpen) return;             // only fire on a live, open-market move
    const mine = armedAlerts.filter(a => a.ticker === tkr);
    if (!mine.length) return;
    const crosses = detectCrosses(prev, spot, mine, { callWall: profile.callWall, putWall: profile.putWall, gammaFlip: profile.gammaFlip, magnet: profile.magnet }, Date.now());
    if (!crosses.length) return;
    setFiredAlerts(f => [...crosses, ...f].slice(0, 30));
    try {  // brief sine chime via Web Audio (best-effort)
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) { const c = new AC(); const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.32); o.start(); o.stop(c.currentTime + 0.34); o.onended = () => c.close(); }
    } catch { /* no audio */ }
  }, [spot, marketOpen, armedAlerts, tkr, profile.callWall, profile.putWall, profile.gammaFlip, profile.magnet]);
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

  // Dealer Gamma Profile — the WHOLE dealer chain in ONE static view. Every real strike (one that carries
  // OI or gamma) is a row, and the range is fitted EXACTLY to those strikes so the rows tile and fill the
  // panel top-to-bottom — no giant bars, no empty gaps. The strike SET is stable tick-to-tick (only the bar
  // lengths animate), and it's derived from the chain — NOT the chart — so it never moves when you pan/zoom.
  const gammaProfile = useMemo(() => {
    const oiLike = ladderMetric === 'OI' || ladderMetric === 'VOL';
    const pick = (s: NonNullable<typeof profile.strikes>[number]): [number, number] => ladderMetric === 'DELTA' ? [s.callDex || 0, s.putDex || 0] : ladderMetric === 'VANNA' ? [s.callVex || 0, s.putVex || 0] : ladderMetric === 'OI' ? [s.callOi || 0, s.putOi || 0] : ladderMetric === 'VOL' ? [s.callVolume || 0, s.putVolume || 0] : [s.callGex || 0, s.putGex || 0];
    // Real chain strikes (have OI or gamma) — a STABLE set across ticks (the chain doesn't add/remove
    // strikes each second), so the ladder doesn't reflow as values change; only the bars animate.
    const all = (profile.strikes || []).filter(s => (s.callOi || 0) + (s.putOi || 0) > 0 || Math.abs(s.callGex || 0) + Math.abs(s.putGex || 0) > 0);
    if (all.length < 2) return null;
    // Cap the row count so bars never shrink to an unreadable sliver — keep the strikes NEAREST spot
    // (a stable selection that doesn't churn tick-to-tick).
    const MAXROWS = 46;
    let kept = (all.length > MAXROWS && spot > 0)
      ? [...all].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, MAXROWS)
      : all;
    kept = [...kept].sort((a, b) => a.strike - b.strike);
    const maxM = Math.max(...kept.map(s => { const [c, p] = pick(s); return Math.max(Math.abs(c), Math.abs(p)); }), 1);
    const ks = kept.map(s => s.strike);
    const gaps = ks.slice(1).map((k, i) => k - ks[i]).filter(x => x > 0).sort((a, b) => a - b);
    const step = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Math.max(1, (ks[ks.length - 1] - ks[0]) / kept.length);  // median strike gap
    // Fit the range exactly to the kept strikes (+ half a step each side) so the rows pack the full panel.
    const lo = ks[0] - step / 2, hi = ks[ks.length - 1] + step / 2, span = hi - lo;
    if (!(span > 0)) return null;
    const rowHpct = Math.max(1.4, Math.min(14, (step / span) * 100));
    // Only LABEL rows tall enough to read; when many strikes pack a short panel, the bars still draw for
    // every row but text shows on a sparse subset (~>=4.6% apart) plus every named level.
    const labelEveryN = rowHpct >= 4.6 ? 1 : Math.max(1, Math.ceil(4.6 / rowHpct));
    return {
      lo, hi, span, rowHpct,
      rows: kept.map((s, i) => { const [c, p] = pick(s); const net = c + p;
        const isCW = s.strike === profile.callWall, isPW = s.strike === profile.putWall, isFlip = s.strike === profile.gammaFlip, isSpot = spot > 0 && Math.abs(s.strike - spot) < spot * 0.0008;
        return {
        strike: s.strike, net, netUp: oiLike ? c >= p : net >= 0,
        callPct: (Math.abs(c) / maxM) * 100, putPct: (Math.abs(p) / maxM) * 100,
        yPct: (1 - (s.strike - lo) / span) * 100,
        isCW, isPW, isFlip, isSpot,
        showLabel: (i % labelEveryN === 0) || isCW || isPW || isFlip || isSpot,
      }; }),
    };
  }, [profile, ladderMetric, spot]);

  // STRUCTURE ZONES — a per-strike label + 0–100 strength so the ladder reads like an institutional strike
  // map (Resistance / Support / Pin / OI-spike, with a strength meter). CW/PW/FLIP come from the row's own
  // canonical flags in the render; this map carries the EXTRAS: PIN (magnet, tier-2) plus RES/SUP/OI and the
  // strength score sourced ONLY from the real Strike Gravity engine (tier-3). When grav is absent (tier-2) no
  // score and no RES/SUP/OI are produced — we never recompute gravity or invent a zone client-side.
  const strikeZones = useMemo(() => {
    const m = new Map<number, { label?: string; color?: string; strength?: number }>();
    const ensure = (k: number) => { let e = m.get(k); if (!e) { e = {}; m.set(k, e); } return e; };
    // Gravity describes the LIVE chain. During replay the profile is a PAST snapshot that grav doesn't match,
    // so its score / RES / SUP / OI would mislabel historical strikes — only the canonical CW/PW/FLIP/PIN
    // (which travel with the shown profile) are honest then.
    const live = !!grav && !isReplay;
    const scoreOf = new Map<number, number>();
    if (live && grav) {
      for (const g of grav.ranked || []) scoreOf.set(g.strike, Math.round(100 * Math.max(0, Math.min(1, g.gravityScore || 0))));
      // Each support/resistance WALL is ONE structure — anchor the label to its strongest strike, not every
      // strike in the band (which stacked a run of identical RES/SUP labels).
      const anchorWall = (zone: { lo: number; hi: number } | null | undefined, label: string, color: string) => {
        if (!zone) return; let best = NaN, bestScore = -1;
        for (const s of (profile.strikes || [])) { const k = s.strike; if (k < zone.lo || k > zone.hi || k === profile.callWall || k === profile.putWall) continue; const sc = scoreOf.get(k) ?? 0; if (sc > bestScore) { bestScore = sc; best = k; } }
        if (!Number.isNaN(best)) { const e = ensure(best); if (!e.label) { e.label = label; e.color = color; } }
      };
      anchorWall(grav.resistanceWall, 'RES', 'var(--danger)');
      anchorWall(grav.supportWall, 'SUP', 'var(--success)');
      for (const g of grav.ranked || []) { if ((g.oiWeight || 0) >= 0.85) { const e = ensure(g.strike); if (!e.label) { e.label = 'OI'; e.color = 'var(--info)'; } } }
    }
    // PIN (gamma magnet) is canonical — travels with the profile (live OR historical), so it's always safe.
    if (typeof profile.magnet === 'number' && profile.magnet !== profile.callWall && profile.magnet !== profile.putWall) {
      const e = ensure(profile.magnet); if (!e.label) { e.label = 'PIN'; e.color = 'var(--greek)'; }
    }
    // 0–100 strength shows on labeled rows (+ the canonical walls/flip), ONLY when live gravity is present.
    if (live) { const attach = (k?: number) => { if (typeof k === 'number' && scoreOf.has(k)) ensure(k).strength = scoreOf.get(k); }; for (const k of Array.from(m.keys())) attach(k); attach(profile.callWall); attach(profile.putWall); attach(profile.gammaFlip); }
    return m;
  }, [profile, grav, isReplay]);

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
        <span className="font-black tracking-wider" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{fmtNum(r.strike, decimals)}</span>
      </div>
      <div className="relative flex items-center h-full">
        <div className="w-1/2 h-full flex items-center justify-end pr-0.5 border-r border-dotted border-[var(--border)]"><div className="h-[9px] rounded-sm" style={{ width: `${r.putPct}%`, background: 'color-mix(in srgb, var(--danger) 60%, transparent)', transition: 'width 0.45s cubic-bezier(0.16,1,0.3,1)' }} /></div>
        <div className="w-1/2 h-full flex items-center pl-0.5"><div className="h-[9px] rounded-sm" style={{ width: `${r.callPct}%`, background: 'color-mix(in srgb, var(--success) 60%, transparent)', transition: 'width 0.45s cubic-bezier(0.16,1,0.3,1)' }} /></div>
      </div>
      <div className="text-right font-black" style={{ color: r.netUp ? 'var(--success)' : 'var(--danger)' }}>{fmtBig(r.net)}</div>
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

  // Confidence as a qualitative BAND, not fake two-sig-fig precision — the scoring weights are
  // uncalibrated until the forward log resolves enough outcomes (the Edge · Track Record panel proves
  // them). Neutral colours so a confidence band never reads as a bull/bear (green/red) signal.
  const confBand = (n: number) => n >= 72 ? { t: 'High', c: 'var(--text-primary)' } : n >= 52 ? { t: 'Medium', c: 'var(--text-secondary)' } : { t: 'Low', c: 'var(--text-tertiary)' };

  // One hero status-line segment: tiny label + bold value (the scannable read lives here, once).
  const heroSeg = (label: string, value: string, color = 'var(--text-primary)') => (
    <span className="flex items-baseline gap-1 shrink-0">
      <span className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[12.5px] font-mono font-black tabular-nums" style={{ color }}>{value}</span>
    </span>
  );
  const heroDot = <span className="w-1 h-1 rounded-full bg-[var(--border-strong)] shrink-0" />;
  // The lead read — regime · pin · gamma sign · (pin strength) · wall range · expected move. This is
  // the one line a trader scans first; every value below it is detail/spatial, not a repeat at equal weight.
  const heroLine = (
    <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: outlookColor }} />
        <span className="text-[13px] font-sans font-black tracking-tight uppercase" style={{ color: outlookColor }}>{outlook.regime}</span>
      </span>
      {heroDot}{heroSeg('γ', longGamma ? 'Long' : 'Short', trend)}
      {read.regime === 'PIN' ? <>{heroDot}{heroSeg('str', `${read.pinStrength}`)}</> : null}
      {/* PIN level + WALLS live in the metric-card strip above (Pin Magnet / Call Wall / Put Wall), so the
          read line carries only what the cards don't: regime, dealer γ posture, pin strength, expected move. */}
      {emPct != null ? <>{heroDot}{heroSeg('exp', `±${(emPct * 100).toFixed(2)}%`, 'var(--info)')}</> : null}
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
      {sub && <div className="text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5 leading-snug">{sub}</div>}
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
      className="w-full flex-1 min-h-0 flex flex-col animate-fadeIn"
      data-gex-regime={longGamma ? 'long' : 'short'}
      style={{
        minHeight: '600px',
        backgroundColor: 'var(--bg-base)',
        backgroundImage: `radial-gradient(150% 70% at 50% 0%, color-mix(in srgb, ${regimeTint} ${ambientWash}%, transparent), transparent 72%)`,
        color: 'var(--text-secondary)',
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${regimeTint} ${ambientRing}%, transparent), inset 0 0 90px color-mix(in srgb, ${regimeTint} ${ambientGlow}%, transparent)`,
        transition: 'background-image 1200ms ease, box-shadow 1200ms ease',
        ['--gex-regime-tint' as string]: regimeTint,
      } as CSSProperties}
    >
      {/* ── Top bar ── On lg+ this is a single 48px row (identity left · centred ticker/price · controls
          right). Below lg the controls wrap to a second line instead of overflowing into the price, so
          the identity row stays legible on a phone rather than colliding badges. */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-2 gap-y-1.5 px-3 sm:px-4 py-2 lg:py-0 min-h-12 lg:h-12 border-b border-[var(--border)] shrink-0 bg-[var(--surface)] relative">
        {/* Left — symbol + the live print. No second brand block here: the module is already titled
            "Pinpoint GEX · {ticker}" in the strip directly above, so this bar is pure ticker + price + controls. */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* symbol + watchlist */}
          <div className="relative flex items-center gap-1">
            <button onClick={() => toggleWatchTicker(selectedAsset.ticker)} title={watchlist.includes(selectedAsset.ticker) ? 'Remove from watchlist' : 'Add to watchlist'} aria-label="Toggle watchlist" className="shrink-0 p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--warning)] hover:bg-[var(--surface-2)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors">
              <Star className="w-3.5 h-3.5" style={watchlist.includes(selectedAsset.ticker) ? { color: 'var(--warning)', fill: 'var(--warning)' } : undefined} />
            </button>
            <button onClick={() => setTickerOpen(o => !o)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[12px] font-mono font-black tracking-wider text-[var(--text-primary)] transition-colors">
              {selectedAsset.ticker}<ChevronDown className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform ${tickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {tickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setTickerOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 w-52 max-h-80 overflow-y-auto rounded-md shadow-2xl py-1 bg-[var(--surface)] border border-[var(--border-strong)]">
                  {(() => {
                    const watched = watchlist.map(t => ASSET_LIST.find(a => a.ticker === t)).filter((a): a is (typeof ASSET_LIST)[number] => !!a);
                    const row = (a: (typeof ASSET_LIST)[number]) => (
                      <div key={a.ticker} className={`w-full flex items-center gap-1 pl-3 pr-2 py-1.5 hover:bg-[var(--surface-3)] transition-colors ${a.ticker === selectedAsset.ticker ? 'bg-[var(--surface-2)]' : ''}`}>
                        <button onClick={() => { setSelectedAsset(a); setTickerOpen(false); }} className="flex-1 min-w-0 flex items-center justify-between text-left focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none rounded">
                          <span className="text-[12px] font-mono font-bold" style={{ color: a.ticker === selectedAsset.ticker ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{a.ticker}</span>
                          <span className="text-[9px] font-sans text-[var(--text-tertiary)] truncate ml-2 max-w-[96px]">{a.name}</span>
                        </button>
                        <button onClick={() => toggleWatchTicker(a.ticker)} title={watchlist.includes(a.ticker) ? 'Remove from watchlist' : 'Add to watchlist'} aria-label="Toggle watchlist" className="shrink-0 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--warning)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors">
                          <Star className="w-3 h-3" style={watchlist.includes(a.ticker) ? { color: 'var(--warning)', fill: 'var(--warning)' } : undefined} />
                        </button>
                      </div>
                    );
                    const head = (label: string) => <div className="px-3 pt-1 pb-0.5 text-[8px] font-sans font-black uppercase tracking-widest text-[var(--text-tertiary)]">{label}</div>;
                    return (
                      <>
                        {watched.length > 0 && (<>{head('★ Watchlist')}{watched.map(row)}<div className="my-1 border-t border-[var(--border)]" />{head('All Symbols')}</>)}
                        {ASSET_LIST.map(row)}
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
          {/* the live print — the hero number, sitting right next to the symbol as one clean cluster */}
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className={`text-[20px] sm:text-[23px] font-mono font-black tabular-nums leading-none text-[var(--text-primary)] ${flash === 'up' ? 'tick-up' : flash === 'down' ? 'tick-down' : ''}`}>{spot ? spot.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'}</span>
            <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: dayChg >= 0 ? 'var(--success)' : 'var(--danger)' }}>{dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)}%</span>
          </div>
          {/* session-aware feed status — lives with the price so LIVE / LAST CLOSE / STALE / MODEL reads at the print */}
          <span className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-black uppercase tracking-widest shrink-0" title={!marketOpen ? `Market closed — last-close snapshot${feedProvider ? ' from ' + feedProvider : ''} (updated ${staleSecs}s ago); data is frozen, not live` : liveFeed ? `Live options feed (${feedProvider}) · updated ${staleSecs}s ago` : isStale ? `Feed stalled — last update ${staleSecs}s ago` : 'Synthetic model data — connect a provider API key for a live feed'} style={{ borderColor: `color-mix(in srgb, ${feedColor} 42%, transparent)`, background: `color-mix(in srgb, ${feedColor} 10%, transparent)`, color: feedColor }}>
            {liveFeed
              ? <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: feedColor }} /><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: feedColor }} /></span>
              : <span className="w-1.5 h-1.5 rounded-full" style={{ background: feedColor }} />}
            {feedLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Timeframe + scope — one control cluster so no toggle sits alone on the bar. The wide
              desktop TF toggle (md+) and the compact mobile select (below md) swap inside it; the
              scope toggle is always shown. Regime is carried by DealerPulse directly below (all
              sizes), so it is not duplicated here — that frees the cramped mobile bar. */}
          <div className="flex items-center gap-1.5">
            <div className="hidden md:block">{segToggle(TF.map(t => t.val), selectedTimeframe, setSelectedTimeframe)}</div>
            <select
              value={selectedTimeframe}
              onChange={e => setSelectedTimeframe(e.target.value as typeof selectedTimeframe)}
              aria-label="Chart timeframe"
              className="md:hidden text-[10px] font-mono font-black tracking-wider rounded-md px-1.5 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none"
            >
              {TF.map(t => <option key={t.val} value={t.val}>{t.val}</option>)}
            </select>
            {segToggle(['0DTE', 'ALL'], scope, v => setScope(v as '0DTE' | 'ALL'), true)}
          </div>
          {/* Customize — TradingView-style drag/resize/save layout (opt-in; default layout untouched) */}
          <button onClick={() => setCustomize(c => !c)} title="Customize layout — drag, resize & save your own panel arrangement"
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-mono font-black uppercase tracking-wider transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none"
            style={customize ? { borderColor: 'var(--accent-color)', background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)', color: 'var(--accent-color)' } : { borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
            <LayoutGrid className="w-3 h-3" />Customize
          </button>
        </div>
      </div>

      {/* Dealer Pulse — force balance · dealer motion · the hero status line (the one read first) */}
      <DealerPulse read={read} showMotion={!!dyn} migration={migration} gammaMotion={gammaMotion} vannaFlow={vannaFlow} decimals={decimals} tail={heroLine} />

      {/* ── 0DTE session band: phase + live countdown to close ── */}
      <SessionBand sess={sess} clock={clock} />

      {/* ── 3-column workspace (full-bleed — fills the whole screen) ── */}
      <div className="flex-1 w-full overflow-hidden flex relative">
        {/* Full-screen gamma matrix — expands the heat-seeker over the whole workspace (multi-expiry,
            big + readable) so it isn't confined to the narrow rail box. */}
        {matrixMax && (
          <div className="absolute inset-0 z-40 flex flex-col bg-[var(--bg-base)] animate-fadeIn">
            <div className="flex items-center justify-between gap-3 px-4 h-9 border-b border-[var(--border)] shrink-0">
              <span className="text-[11px] font-sans font-black tracking-widest uppercase text-[var(--text-primary)] shrink-0">{matrixMode === 'greeks' ? 'Greeks Matrix' : 'Gamma Matrix'} · {selectedAsset.ticker}</span>
              {/* EXPIRY = strike×expiry γ heatmap · GREEKS = strike×exposure (DEX/GEX/VEX/CEX) grid */}
              {segToggle(['EXPIRY', 'GREEKS'], matrixMode === 'greeks' ? 'GREEKS' : 'EXPIRY', v => setMatrixMode(v === 'GREEKS' ? 'greeks' : 'expiry'))}
              <button onClick={() => setMatrixMax(false)} title="Restore" className="ml-auto flex items-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none rounded px-1.5 py-0.5 transition-colors shrink-0"><Minimize2 className="w-3.5 h-3.5" /> Restore</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
              <div className="w-full">{matrixMode === 'greeks' ? <GreeksMatrix profile={profile} decimals={decimals} /> : <StrikeMatrix profile={profile} decimals={decimals} size="full" />}</div>
            </div>
          </div>
        )}
        {customize ? (
          <TerminalWorkspace
            storageKey="slayer.terminal.layout.v1"
            onExit={() => setCustomize(false)}
            panels={[
              { id: 'chart', title: `Chart · ${selectedAsset.ticker}`, w: 8, h: 16, minW: 4, minH: 8, node: <SlayerChart profile={profile} decimals={decimals} live={liveFeed} /> },
              { id: 'matrix', title: 'Gamma Matrix', w: 4, h: 16, minW: 3, minH: 6, node: <StrikeMatrix profile={profile} decimals={decimals} size="full" /> },
              { id: 'flow', title: 'Order Flow', w: 4, h: 11, minW: 3, minH: 6, node: <OrderFlow data={orderFlow} decimals={decimals} /> },
              { id: 'dynamics', title: 'Dealer Dynamics', w: 8, h: 11, minW: 4, minH: 6, node: <div className="p-3"><DealerDynamicsPanel /></div> },
              { id: 'regime', title: 'Regime Matrix', w: 6, h: 9, minW: 3, minH: 5, node: <div className="p-3"><RegimeMatrixPanel /></div> },
              { id: 'topstrikes', title: 'Top Calls & Puts', w: 4, h: 9, minW: 3, minH: 5, node: <div className="p-3"><TopStrikesPanel profile={profile} spot={spot} decimals={decimals} /></div> },
            ]}
          />
        ) : (
        <div className="flex flex-col xl:flex-row w-full h-full overflow-hidden">

          {/* ░ LEFT — Key Levels / Flow ░ */}
          <aside className={`order-2 xl:order-1 w-full xl:w-[248px] shrink-0 border-r border-[var(--border)] flex-col min-h-[360px] xl:min-h-0 bg-[var(--surface)] ${chartFocus ? 'flex xl:hidden' : 'flex'}`}>
            <div className="flex items-center px-3 h-9 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar min-w-0">
                {(['levels', 'matrix', 'flow', 'alerts', 'dynamics'] as const).map(t => (
                  <button key={t} onClick={() => setLeftTab(t)} className="relative shrink-0 text-[10.5px] font-sans font-black tracking-wider uppercase transition-colors py-2" style={{ color: leftTab === t ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {t === 'levels' ? 'Levels' : t === 'matrix' ? 'Matrix' : t === 'flow' ? 'Flow' : t === 'alerts' ? 'Alerts' : 'Dynamics'}
                    {leftTab === t && <span className="absolute -bottom-px left-0 right-0 h-[2px]" style={{ background: 'var(--accent-color)' }} />}
                  </button>
                ))}
              </div>
              {leftTab === 'matrix' && (
                <button onClick={() => setMatrixMax(true)} title="Expand matrix full screen" className="ml-auto pl-2 shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none rounded p-0.5 transition-colors"><Maximize2 className="w-3.5 h-3.5" /></button>
              )}
            </div>

            {leftTab === 'matrix' ? (
              <div className="flex-1 min-h-0 overflow-y-auto"><StrikeMatrix profile={profile} decimals={decimals} /></div>
            ) : leftTab === 'flow' ? (
              <div className="flex-1 min-h-0"><OrderFlow data={orderFlow} decimals={decimals} /></div>
            ) : leftTab === 'dynamics' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-2"><DealerDynamicsPanel /></div>
            ) : leftTab === 'alerts' ? (
              <div className="flex-1 min-h-0">
                <LevelAlertsPanel
                  armed={armedAlerts.filter(a => a.ticker === tkr)}
                  levels={{ callWall: profile.callWall, putWall: profile.putWall, gammaFlip: profile.gammaFlip, magnet: profile.magnet, spot }}
                  fired={firedAlerts.filter(f => f.ticker === tkr)}
                  decimals={decimals}
                  onToggle={toggleAlert}
                  onAddCustom={addCustomAlert}
                  onRemove={removeAlert}
                  onClearFired={() => setFiredAlerts([])}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {/* GEX OUTLOOK — the regime read + where price is being drawn (pinning / gamma
                    squeeze / short squeeze / trend / range). Describes the path, not a trade. */}
                <div className="rounded-lg border border-[var(--border)] pl-3.5 pr-3 py-2 relative overflow-hidden" style={{ background: `color-mix(in srgb, ${outlookColor} 7%, var(--surface-2))` }}>
                  <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: outlookColor }} />
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]"><Crosshair className="w-3 h-3" /> GEX Outlook</span>
                    <span className="flex items-center gap-1 text-[9px] font-mono font-black uppercase tracking-widest" style={{ color: confBand(outlook.confidence).c }} title="Conviction band (Low / Medium / High) from the weighted dealer signals. Shown qualitatively until the forward log calibrates it — the Edge · Track Record panel reports how these reads have actually resolved.">Conf <span style={{ color: confBand(outlook.confidence).c }}>{confBand(outlook.confidence).t}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {outlook.bias === 'up' ? <TrendingUp className="w-4 h-4" style={{ color: 'var(--success)' }} /> : outlook.bias === 'down' ? <TrendingDown className="w-4 h-4" style={{ color: 'var(--danger)' }} /> : <Minus className="w-4 h-4 text-[var(--text-tertiary)]" />}
                    <span className="text-[20px] font-sans font-black tracking-tight leading-none" style={{ color: outlookColor }}>{outlook.regime}</span>
                  </div>
                  <div className="text-[11px] font-mono font-bold text-[var(--text-secondary)] mt-1.5 leading-snug">{outlook.headline}</div>
                  <div className="text-[9.5px] font-mono text-[var(--text-tertiary)] mt-0.5 leading-snug">{outlook.detail}</div>
                  {/* Only show a path when the target is materially away from spot (≥0.1%) — "head toward
                      where you already are, to a hundredth of a percent" is noise, not a read. */}
                  {outlook.target != null && spot > 0 && Math.abs((outlook.target - spot) / spot) >= 0.001 && (
                    <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}>
                      <span className="text-[8.5px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Path toward</span>
                      <span className="text-[12px] font-mono font-black tabular-nums" style={{ color: outlookColor }}>{fmtNum(outlook.target, decimals)}</span>
                      <span className="text-[9px] font-mono tabular-nums text-[var(--text-tertiary)] ml-auto">{distLabel(outlook.target)}</span>
                    </div>
                  )}
                  {narrative && (
                    <div className="flex gap-1.5 mt-1.5 pt-1.5 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)' }}>
                      <span className="mt-[3px] w-1 h-1 rounded-full shrink-0 animate-pulse" style={{ background: narrative.rising ? 'var(--success)' : 'var(--danger)' }} />
                      <p className="text-[9.5px] font-mono leading-snug text-[var(--text-secondary)]">{narrative.text}</p>
                    </div>
                  )}
                </div>
                {/* PROVEN EDGE — the GEX outlook above, scored against what price actually did.
                    Turns the regime call from an assertion into a measured, falsifiable hit-rate. */}
                <EdgeTrackRecord profile={profile} ticker={selectedAsset.ticker} candles={candles} provenance={realFeed ? 'live' : 'model'} />
                {/* Net gamma hero */}
                <div className="rounded-lg border border-[var(--border)] pl-3.5 pr-3 py-2 relative overflow-hidden" style={{ background: `color-mix(in srgb, ${trend} 6%, var(--surface-2))` }}>
                  <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: trend }} />
                  <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]"><GaugeIcon className="w-3 h-3" /> Net Gamma Exposure</div>
                  <div className="flex items-baseline gap-1.5 mt-1" title="Total dealer gamma in dollars of hedging per 1% move in the underlying. Positive = dealers buy dips / sell rips (vol-suppressing); negative = they chase the move (vol-amplifying). Same $/1% unit on every per-strike figure.">
                    <span className="text-[26px] font-mono font-black tabular-nums leading-none" style={{ color: trend }}>{netGex >= 0 ? '+' : ''}{fmtBig(netGex)}</span>
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] tracking-wide">$Γ / 1% move</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest" style={{ background: `color-mix(in srgb, ${trend} 14%, transparent)`, color: trend }}>{aboveFlip == null ? 'No Flip' : aboveFlip ? 'Above Flip' : 'Below Flip'}</span>
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)]">{read.regimeLabel}</span>
                  </div>
                  {/* Setup Strength (0–100) — conviction in the current read: confluence × agreement × regime clarity. */}
                  <div className="mt-2 pt-2 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}>
                    <div className="flex items-center justify-between mb-1" title="Conviction in the current directional read (0–100): blends confluence magnitude (|score|), signal agreement (confidence) and regime clarity (gamma concentration in a pin). Halved when there is no clean tradeable bracket, so a no-trade never reads as a strong setup.">
                      <span className="text-[8.5px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Setup Strength · {read.bias}</span>
                      <span className="text-[11px] font-mono font-black tabular-nums" style={{ color: read.bias === 'LONG' ? 'var(--success)' : read.bias === 'SHORT' ? 'var(--danger)' : 'var(--info)' }}>{read.positionStrength}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${read.positionStrength}%`, background: read.bias === 'LONG' ? 'var(--success)' : read.bias === 'SHORT' ? 'var(--danger)' : 'var(--info)', transition: 'width 400ms cubic-bezier(0.16,1,0.3,1)' }} /></div>
                  </div>
                  {/* Wall strength (0–100) — not all walls are equal; the engine blends gamma, OI
                      and volume so a trader can tell a concrete wall from a paper one. */}
                  {(wallRes || wallSup) && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}>
                      <div className="text-[8.5px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">Wall Strength · 0–100</div>
                      <div className="grid grid-cols-2 gap-2">
                        {[{ w: wallRes, lbl: 'Resistance', col: 'var(--danger)' }, { w: wallSup, lbl: 'Support', col: 'var(--success)' }].map(({ w, lbl, col }) => (
                          <div key={lbl} className="min-w-0" title={w ? `${lbl} ${fmtNum(w.strike, decimals)} — strength ${w.score}/100 (gamma · OI · volume)` : `no ${lbl.toLowerCase()} wall`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono font-bold tabular-nums text-[var(--text-secondary)]">{lbl === 'Resistance' ? '▲ ' : '▼ '}{w ? fmtNum(w.strike, decimals) : '—'}</span>
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
                      <div key={s.key} className="flex items-start gap-2 px-3 min-h-[28px] py-1 hover:bg-[var(--surface-3)] transition-colors" title={s.detail}>
                        {s.dir > 0 ? <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} /> : s.dir < 0 ? <TrendingDown className="w-3 h-3 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} /> : <Minus className="w-3 h-3 shrink-0 mt-0.5 text-[var(--text-tertiary)]" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-mono font-bold text-[var(--text-secondary)] truncate leading-tight">{s.label}</div>
                          <div className="text-[9px] font-mono text-[var(--text-tertiary)] leading-snug">{s.detail}</div>
                        </div>
                        <div className="w-9 h-1 rounded-full bg-[var(--surface-3)] overflow-hidden shrink-0 mt-1"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.weight / 28) * 100)}%`, background: s.dir > 0 ? 'var(--success)' : s.dir < 0 ? 'var(--danger)' : 'var(--text-tertiary)' }} /></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Calls & Puts — the heaviest dealer-gamma strikes on each side, ranked. */}
                <TopStrikesPanel profile={profile} spot={spot} decimals={decimals} />

                {/* Dealer Structure mini-scale removed — the chart already plots PW / γ-flip / magnet / CW
                    on the price axis spatially, and the hero status line carries the range; a 1-D copy here
                    was a worse duplicate of both. (Ship-review P1-8.) */}

                {/* key levels list */}
                <div className="bg-[var(--surface-2)] rounded-lg overflow-hidden">
                  <div className="px-3 pt-2 pb-1.5 text-[9px] font-sans font-black tracking-widest uppercase text-[var(--text-secondary)] border-b border-[var(--border)]">Key Levels</div>
                  <div className="stagger-children">
                    {levels.map((l, i) => (
                      <div key={l.n} className="flex items-center gap-2 px-3 h-[26px] hover:bg-[var(--surface-3)] transition-colors" style={{ borderTop: i ? '1px solid var(--border)' : undefined }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.c }} />
                        <span className="text-[11px] font-mono font-bold flex-1 truncate text-[var(--text-secondary)] flex items-center gap-1">{l.n}{((l.n === 'GEX Flip' && !flipConfident) || ((l.n === 'Call Wall' || l.n === 'Put Wall') && !wallsConfident)) && <span className="px-1 rounded-sm text-[8px] font-black tracking-wide uppercase shrink-0" style={{ background: 'color-mix(in srgb, var(--warning) 16%, transparent)', color: 'var(--warning)' }} title="Statistically thin — the engine flags this level as a low-confidence estimate">est</span>}</span>
                        <span className="text-[11px] font-mono font-black tabular-nums" style={{ color: l.c }}>{fmtNum(l.v as number, decimals)}</span>
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
          <main className="order-1 xl:order-2 flex-1 min-w-0 flex flex-col border-r border-[var(--border)] min-h-[520px]">
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
                  {/* Focus mode — collapse both side rails so the chart fills the screen (desktop). */}
                  <button onClick={() => setChartFocus(m => !m)} title={chartFocus ? 'Exit focus — restore the side panels' : 'Focus mode — expand the chart to full width'} className={`hidden xl:flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-black uppercase tracking-wide border transition-colors ${chartFocus ? 'border-[var(--accent-color)] text-black' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`} style={chartFocus ? { background: 'var(--accent-color)' } : undefined}>{chartFocus ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />} {chartFocus ? 'Exit' : 'Focus'}</button>
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
            <div className="flex-1 min-h-[600px] relative" style={{ background: 'var(--bg-base)' }}>
              {gexLines
                ? <div className="absolute inset-0 p-1.5"><StrikeGexChart history={gexHist} /></div>
                : multiChart
                ? <ChartPanelGrid profile={profile} decimals={decimals} candles={candles} baseTicker={selectedAsset.ticker} timeframe={selectedTimeframe} />
                : <SlayerChart profile={profile} decimals={decimals} live={liveFeed} />}
            </div>
          </main>

          {/* ░ RIGHT — Exposure Ladder ░ */}
          <aside className={`order-3 w-full xl:w-[300px] shrink-0 flex-col min-h-[360px] xl:min-h-0 bg-[var(--surface)] ${chartFocus ? 'flex xl:hidden' : 'flex'}`}>
            <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0">
              <Layers className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} />
              <span className="text-[11px] font-sans font-black tracking-widest uppercase text-[var(--text-primary)]">Exposure Ladder</span>
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest border border-[var(--border)]" style={{ color: trend }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: trend }} />{read.regime}
              </span>
            </div>
            {/* Exposure metric — a full-width segmented control (no label; the buttons are self-evident) */}
            <div className="flex items-stretch gap-1 px-3 py-1.5 border-b border-[var(--border)] shrink-0">
              {(['GAMMA', 'DELTA', 'VANNA', 'OI', 'VOL'] as const).map(m => { const dis = (m === 'DELTA' && !hasDex) || (m === 'VANNA' && !hasVex) || (m === 'OI' && !hasOi) || (m === 'VOL' && !hasVol); return (
                <button key={m} disabled={dis} onClick={() => setLadderMetric(m)} title={dis ? `No ${m.toLowerCase()} data in this feed` : `Show per-strike ${m.toLowerCase()}`} className="flex-1 py-1 text-[9px] font-mono font-black tracking-wider rounded transition-colors text-center" style={ladderMetric === m ? { background: 'var(--surface-3)', color: 'var(--text-primary)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' } : { color: dis ? 'color-mix(in srgb, var(--text-tertiary) 40%, transparent)' : 'var(--text-tertiary)', cursor: dis ? 'not-allowed' : 'pointer' }}>{m}</button>
              ); })}
            </div>
            {(vacAbove || vacBelow) && (
              <div className="px-3 py-1.5 border-b border-[var(--border)] shrink-0" style={{ background: 'color-mix(in srgb, var(--warning) 7%, transparent)' }} title="Liquidity vacuums — strike bands with little dealer gamma / OI / volume, where price tends to travel fast once it enters them">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3 h-3 fill-current shrink-0" style={{ color: 'var(--warning)' }} />
                  <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: 'var(--warning)' }}>Air Pockets</span>
                  <span className="text-[8.5px] font-mono text-[var(--text-tertiary)] ml-auto">fast-move zones</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono tabular-nums">
                  {vacAbove && <span className="flex items-baseline gap-1"><span style={{ color: 'var(--success)' }}>▲</span><span style={{ color: 'var(--text-secondary)' }}>{fmtNum(vacAbove.lo, decimals)}–{fmtNum(vacAbove.hi, decimals)}</span></span>}
                  {vacBelow && <span className="flex items-baseline gap-1"><span style={{ color: 'var(--danger)' }}>▼</span><span style={{ color: 'var(--text-secondary)' }}>{fmtNum(vacBelow.lo, decimals)}–{fmtNum(vacBelow.hi, decimals)}</span></span>}
                </div>
              </div>
            )}
            {/* KEY LEVELS are headlined in the metric-card strip up top and spotlighted on the rows below
                (coloured rail + CW/PW/FLIP/PIN tag), so no duplicate text block here. */}
            <div className="grid grid-cols-[52px_1fr_64px] gap-2 px-3 py-1.5 border-b border-[var(--border)] shrink-0 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)]">
              <div className="text-right">Strike</div>
              <div className="flex items-center gap-2.5 pl-1.5"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--success)' }} />Call {mSym}</span><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--danger)' }} />Put {mSym}</span></div>
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
                const dense = rowHpct < 4.6;              // many strikes packed short → solid profile + sparse labels (per-row showLabel)
                // The 2-line strike+zone stack is ~16px tall; gate it on the real PIXEL pitch (rowHpct% × panel
                // height) rather than the percentage, so labels show on the tall desktop rail but are suppressed
                // when the short mobile rail would pack rows tighter than the stack (which would overlap).
                const panelH = ladderScrollRef.current?.clientHeight || 600;
                const showZone = (rowHpct / 100) * panelH >= 17;
                // Strike-label stride from the REAL pixel pitch (not just rowHpct%), so labels never collide
                // on a short mobile rail where the same % resolves to far fewer pixels (~15px min gap).
                const labelEvery = Math.max(1, Math.ceil(15 / Math.max(1, (rowHpct / 100) * panelH)));
                // ONE bold bar per strike (left-anchored gamma profile): length = |net exposure| vs the panel
                // max, so the dealer walls span the FULL width instead of being capped to a 50% half-nub.
                const barH = dense ? 'calc(100% - 1px)' : 'min(82%, 24px)';
                const maxNet = Math.max(1, ...rows.map(rr => Math.abs(rr.net)));
                // Bright at the left rail, fading out → depth + anchored to the strike axis.
                const upGrad = 'linear-gradient(to right, color-mix(in srgb, var(--success) 95%, transparent), color-mix(in srgb, var(--success) 42%, transparent))';
                const downGrad = 'linear-gradient(to right, color-mix(in srgb, var(--danger) 95%, transparent), color-mix(in srgb, var(--danger) 42%, transparent))';
                return (
                  <>
                    {rows.map((r, i) => {
                      const mk = r.isCW ? 'var(--success)' : r.isPW ? 'var(--danger)' : r.isFlip ? 'var(--warning)' : null;
                      // pixel-aware label gate (key levels + spot always labelled; others thinned to ~15px pitch)
                      const lbl = (i % labelEvery === 0) || r.isCW || r.isPW || r.isFlip || r.isSpot;
                      // Key-level rows get a faint tint + a coloured left rail. (Air-pocket bands are named in the
                      // AIR POCKETS callout above — washing whole row-bands here read as muddy, so it's dropped.)
                      const keyBg = r.isCW ? 'color-mix(in srgb, var(--success) 11%, transparent)' : r.isPW ? 'color-mix(in srgb, var(--danger) 11%, transparent)' : r.isFlip ? 'color-mix(in srgb, var(--warning) 10%, transparent)' : undefined;
                      // Structure label: canonical CW/PW/FLIP from the row flags (so it can't disagree with the
                      // dot/rail beside it); PIN/RES/SUP/OI + the 0–100 strength come from the Strike Gravity map.
                      const z = strikeZones.get(r.strike);
                      const zoneLabel = r.isCW ? 'CW' : r.isPW ? 'PW' : r.isFlip ? 'FLIP' : z?.label;
                      const zoneColor = r.isCW ? 'var(--success)' : r.isPW ? 'var(--danger)' : r.isFlip ? 'var(--warning)' : (z?.color || 'var(--text-tertiary)');
                      const strength = z?.strength;
                      return (
                        <div key={r.strike} data-strike={r.strike} className="absolute left-0 right-0 flex items-center px-2" style={{ top: `${r.yPct}%`, height: `${rowHpct}%`, transform: 'translateY(-50%)', transition: 'top 0.3s cubic-bezier(0.22,1,0.36,1), height 0.3s cubic-bezier(0.22,1,0.36,1)', background: keyBg, boxShadow: mk ? `inset 2px 0 0 ${mk}` : undefined }}>
                          {lbl && (
                            <span className="w-[58px] shrink-0 flex flex-col items-end justify-center leading-none gap-px">
                              <span className="text-[9px] font-mono tabular-nums flex items-center gap-1 whitespace-nowrap" style={{ color: r.isSpot ? 'var(--accent-color)' : mk || 'var(--text-tertiary)', fontWeight: (mk || r.isSpot) ? 800 : 400 }}>{mk && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: mk, boxShadow: `0 0 5px ${mk}` }} />}{fmtNum(r.strike, decimals)}</span>
                              {showZone && zoneLabel && <span className="text-[6.5px] font-black uppercase tracking-wider flex items-center gap-0.5 leading-none whitespace-nowrap" style={{ color: zoneColor }}>{zoneLabel}{strength != null && <span className="font-bold tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{strength}</span>}</span>}
                            </span>
                          )}
                          <div className="relative flex-1 h-full flex items-center mx-1.5">
                            {/* faint baseline rail so a near-zero strike still reads as a row on the profile */}
                            {!dense && <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px pointer-events-none" style={{ background: 'color-mix(in srgb, var(--border) 55%, transparent)' }} />}
                            {(() => { const np = Math.min(100, (Math.abs(r.net) / maxNet) * 100); const big = np > 55; return (
                              <div className="rounded-r-sm" style={{ width: `${np}%`, height: barH, background: r.netUp ? upGrad : downGrad, boxShadow: big ? `0 0 12px -3px ${r.netUp ? 'var(--success)' : 'var(--danger)'}` : undefined, transition: 'width 0.42s cubic-bezier(0.22,1,0.36,1), height 0.3s ease' }} />
                            ); })()}
                          </div>
                          {lbl && <span className="w-[56px] shrink-0 text-right text-[9px] font-mono font-black tabular-nums" style={{ color: r.netUp ? 'var(--success)' : 'var(--danger)' }}>{fmtBig(r.net)}</span>}
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
        )}
      </div>
      {profileHist.length > 2 && <ReplayScrubber hist={profileHist} replayT={replayT} setReplayT={setReplayT} decimals={decimals} />}
      <SystemStatus feedLabel={feedLabel} live={liveFeed} feedColor={feedColor} cd={sess.cd} />
    </div>
  );
}
