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
import { CROSSHAIR_EVENT, CrosshairDetail } from '../lib/chartSync';
import { EdgeTrackRecord } from './EdgeTrackRecord';
import { Crosshair, Activity, Zap, Layers, ChevronDown, Gauge as GaugeIcon, Radio, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import { ASSET_LIST, TIMEFRAMES } from '../data';

const toneColor = (t: string) => (t === 'pos' ? 'var(--success)' : t === 'neg' ? 'var(--danger)' : 'var(--text-tertiary)');
// Tight, legible type scale (raised the floor off 7.5/8px so dense data stays readable).

interface LiveTerminalFlowProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}

const fmtBig = (v: number) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + 'K' : s + a.toFixed(0); };

export function LiveTerminalFlow({ profile, ticker, decimals }: LiveTerminalFlowProps) {
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

  // Honest feed status from the server's own source label — provider when the options chain
  // is live, MODEL on synthetic data, STALE if the heartbeat stalls. Never a hardcoded "LIVE".
  const feedRaw = (profile.feed || serverState?.data_source || '').toUpperCase();
  const feedProvider = feedRaw.includes('THETA') ? 'THETADATA' : feedRaw.includes('TRADIER') ? 'TRADIER' : feedRaw.includes('POLYGON') ? 'POLYGON' : null;
  const liveFeed = !isStale && (feedRaw.startsWith('LIVE') || (!!feedProvider && !feedRaw.includes('DETERMINISTIC') && !feedRaw.includes('SANDBOX') && !feedRaw.includes('MODEL')));
  const feedColor = isStale ? 'var(--danger)' : liveFeed ? 'var(--success)' : 'var(--warning)';
  const feedLabel = isStale ? `STALE ${staleSecs}s` : liveFeed ? (feedProvider ? `LIVE · ${feedProvider}` : 'LIVE') : 'MODEL';
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
  const gexHist = useGexHistory(profile, selectedAsset.ticker);
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

  const mSym = ladderMetric === 'GAMMA' ? 'γ' : ladderMetric === 'DELTA' ? 'Δ' : ladderMetric === 'VANNA' ? 'V' : ladderMetric === 'OI' ? 'OI' : 'Vol';
  const gammaPin = profile.magnet || spot; // where dealer gamma pins price — descriptive, not a call

  // Descriptive read of dealer structure (regime, pin strength, force breakdown, observations).
  // We render only the descriptive outputs — this is an instrument, not a trade-picker.
  const read = useMemo(() => computeTerminalRead(profile, candles.slice(-12).map(c => c.close)), [profile, candles]);
  // GEX OUTLOOK — names the regime (pinning / gamma squeeze / short squeeze / trend / range)
  // and the level price is being drawn toward. Descriptive path read, not a trade pick.
  const outlook = useMemo(() => computeGexOutlook(profile, candles.slice(-12).map(c => c.close)), [profile, candles]);
  const outlookColor = outlook.bias === 'up' ? 'var(--success)' : outlook.bias === 'down' ? 'var(--danger)' : outlook.regime === 'PINNING' ? 'var(--info)' : 'var(--text-secondary)';

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
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2.5 py-2">
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
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 border-b border-[var(--border)] shrink-0 bg-[var(--surface)]">
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
          {/* spot */}
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className={`text-[18px] font-mono font-black tabular-nums leading-none text-[var(--text-primary)] ${flash === 'up' ? 'tick-up' : flash === 'down' ? 'tick-down' : ''}`}>{spot ? spot.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'}</span>
            <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: dayChg >= 0 ? 'var(--success)' : 'var(--danger)' }}>{dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Honest feed status — provider name when the chain is live, MODEL on synthetic data,
              STALE if the SSE heartbeat stalls. Replaces the old hardcoded "LIVE". */}
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono font-black uppercase tracking-widest shrink-0" title={liveFeed ? `Live options feed (${feedProvider}) · updated ${staleSecs}s ago` : isStale ? `Feed stalled — last update ${staleSecs}s ago` : 'Synthetic model data — connect a provider API key for a live feed'} style={{ borderColor: `color-mix(in srgb, ${feedColor} 42%, transparent)`, background: `color-mix(in srgb, ${feedColor} 10%, transparent)`, color: feedColor }}>
            {liveFeed
              ? <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: feedColor }} /><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: feedColor }} /></span>
              : <span className="w-1.5 h-1.5 rounded-full" style={{ background: feedColor }} />}
            {feedLabel}
          </span>
          <div className="hidden md:block">{segToggle(TF.map(t => t.val), selectedTimeframe, setSelectedTimeframe)}</div>
          {segToggle(['0DTE', 'ALL'], scope, v => setScope(v as '0DTE' | 'ALL'), true)}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono font-black uppercase tracking-widest" style={{ borderColor: longGamma ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'color-mix(in srgb, var(--danger) 40%, transparent)', background: longGamma ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)', color: trend, boxShadow: `0 0 16px ${longGamma ? 'color-mix(in srgb, var(--success) 18%, transparent)' : 'color-mix(in srgb, var(--danger) 18%, transparent)'}` }}>
            {longGamma ? <Activity className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-current" />}{longGamma ? 'Long γ' : 'Short γ'} · {read.regime === 'PIN' ? `Pin ${read.pinStrength}` : 'Trend'}
          </span>
        </div>
      </div>

      {/* ── Dealer Pulse: a descriptive, at-a-glance picture of dealer positioning. It SHOWS
          the mechanics (a force balance, net γ, the implied range, a live observation tape) —
          it does NOT issue a trade. The trader reads it and decides. ── */}
      <div className="flex items-stretch h-[58px] border-b border-[var(--border)] shrink-0 bg-[var(--surface)] overflow-hidden">
        {/* Dealer positioning force balance — a picture of the dealer book, not a call */}
        <div className="flex flex-col justify-center gap-1 px-4 border-r border-[var(--border)] shrink-0 w-[214px]">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Dealer Positioning</span>
            <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: read.score > 8 ? 'var(--success)' : read.score < -8 ? 'var(--danger)' : 'var(--text-tertiary)' }}>{read.score > 0 ? '+' : ''}{read.score}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px z-10" style={{ background: 'var(--border-strong)' }} />
            {read.score >= 0
              ? <motion.div className="absolute top-0 bottom-0 left-1/2" style={{ background: 'var(--success)' }} animate={{ width: `${Math.min(50, read.score / 2)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
              : <motion.div className="absolute top-0 bottom-0 right-1/2" style={{ background: 'var(--danger)' }} animate={{ width: `${Math.min(50, -read.score / 2)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />}
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest"><span style={{ color: 'var(--danger)' }}>Bearish book</span><span style={{ color: 'var(--success)' }}>Bullish book</span></div>
        </div>
        {/* Net gamma + regime */}
        <div className="flex flex-col justify-center px-4 border-r border-[var(--border)] shrink-0">
          <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Net γ · {read.regime === 'PIN' ? `Pin ${read.pinStrength}` : 'Trend'}</span>
          <span className="text-[16px] font-mono font-black tabular-nums leading-tight mt-0.5" style={{ color: trend }}>{netGex >= 0 ? '+' : ''}{fmtBig(netGex)}</span>
        </div>
        {/* Implied range */}
        <div className="flex flex-col justify-center px-4 border-r border-[var(--border)] shrink-0">
          <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Implied Range</span>
          <span className="text-[16px] font-mono font-black tabular-nums leading-tight mt-0.5" style={{ color: 'var(--info)' }}>{emPct != null ? `±${(emPct * 100).toFixed(2)}%` : '—'}</span>
        </div>
        {/* Dealer MOTION — how the book is CHANGING right now: gamma hedging state, vanna
            hedge-flow, and which way the gamma center-of-mass (the pin) is drifting. */}
        {dyn && (
          <div className="flex flex-col justify-center px-4 border-r border-[var(--border)] shrink-0 w-[188px]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Dealer Motion</span>
              {migration && migration.direction !== 'STABLE' && (
                <span className="flex items-center gap-0.5 text-[9px] font-mono font-black" style={{ color: migration.direction === 'BULLISH' ? 'var(--success)' : 'var(--danger)' }} title={`Gamma center-of-mass drifting ${migration.direction.toLowerCase()}${migration.comCurrent ? ` toward ${fmtNum(migration.comCurrent)}` : ''}`}>
                  {migration.direction === 'BULLISH' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}PIN
                </span>
              )}
            </div>
            <span className="text-[13px] font-mono font-black leading-tight mt-0.5" style={{ color: gammaMotion ? gammaMotion.color : 'var(--text-tertiary)' }}>{gammaMotion ? gammaMotion.label : '—'}</span>
            <span className="text-[9px] font-mono tracking-wide text-[var(--text-tertiary)] truncate">{gammaMotion?.sub ?? 'awaiting dynamics'}{vannaFlow && vannaFlow !== 'NEUTRAL' ? ` · vanna ${vannaFlow.toLowerCase()}` : ''}</span>
          </div>
        )}
        {/* Live observation tape — what's happening, never what to do */}
        <div className="flex-1 min-w-0 flex items-center gap-2 px-4 overflow-hidden">
          <span className="flex items-center gap-1 text-[9px] font-black tracking-widest uppercase shrink-0" style={{ color: 'var(--accent-color)' }}><Radio className="w-3 h-3" /> Tape</span>
          <div className="flex-1 overflow-hidden">
            <div className="flex gap-8 whitespace-nowrap animate-ticker-marquee">
              {[...read.events, ...read.events].map((e, i) => (<span key={i} className="text-[10px] font-mono inline-flex items-center gap-1.5" style={{ color: toneColor(e.tone) }}><span className="w-1 h-1 rounded-full shrink-0" style={{ background: toneColor(e.tone) }} />{e.text}</span>))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 0DTE session band: phase + live countdown to close ── */}
      <div className="flex items-center gap-2.5 h-6 px-3 border-b border-[var(--border)] shrink-0" style={{ background: 'var(--bg-base)' }}>
        <Clock className="w-3 h-3 shrink-0" style={{ color: sess.live ? 'var(--accent-color)' : 'var(--text-tertiary)' }} />
        <div className="relative flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }}>
          {SEGS.map(s => (<div key={s.k} className="h-full" style={{ width: `${s.w * 100}%`, borderRight: '1px solid var(--bg-base)', background: clock.session === s.sess ? 'color-mix(in srgb, var(--accent-color) 55%, transparent)' : 'transparent' }} title={s.l} />))}
          {sess.live && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ left: `${sess.prog * 100}%`, background: 'var(--accent-color)', boxShadow: '0 0 6px var(--accent-color)' }} />}
        </div>
        <span className="text-[9px] font-mono font-black uppercase tracking-widest shrink-0" style={{ color: sess.live ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{SEGS.find(s => s.sess === clock.session)?.l ?? (sess.live ? 'Session' : 'Closed')}</span>
        <span className="text-[10px] font-mono font-black tabular-nums shrink-0 w-[88px] text-right" style={{ color: sess.cd !== 'CLOSED' && sess.prog > 0.77 ? 'var(--warning)' : sess.live ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{sess.cd !== 'CLOSED' ? `${sess.cd} to close` : 'Market closed'}</span>
      </div>

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
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {/* GEX OUTLOOK — the regime read + where price is being drawn (pinning / gamma
                    squeeze / short squeeze / trend / range). Describes the path, not a trade. */}
                <div className="rounded-lg border px-3 py-2.5 relative overflow-hidden" style={{ borderColor: `color-mix(in srgb, ${outlookColor} 40%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${outlookColor} 13%, transparent), transparent)` }}>
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
                </div>
                {/* PROVEN EDGE — the GEX outlook above, scored against what price actually did.
                    Turns the regime call from an assertion into a measured, falsifiable hit-rate. */}
                <EdgeTrackRecord profile={profile} ticker={selectedAsset.ticker} candles={candles} provenance={liveFeed ? 'live' : 'model'} />
                {/* Net gamma hero */}
                <div className="rounded-lg border px-3 py-2.5 relative overflow-hidden" style={{ borderColor: longGamma ? 'color-mix(in srgb, var(--success) 32%, transparent)' : 'color-mix(in srgb, var(--danger) 32%, transparent)', background: `linear-gradient(135deg, color-mix(in srgb, ${longGamma ? 'var(--success)' : 'var(--danger)'} 9%, transparent), transparent)` }}>
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
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md overflow-hidden">
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
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-3 py-3">
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
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md overflow-hidden">
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
                  <span className="hidden sm:inline" style={{ color: isStale ? 'var(--danger)' : 'var(--text-tertiary)' }}>· {selectedTimeframe} · {liveFeed ? 'LIVE' : isStale ? `STALE ${staleSecs}s` : 'MODEL'}</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono font-black tabular-nums shrink-0">
                  <button onClick={() => setGexLines(m => !m)} title="Strike GEX line chart — top strikes' net gamma tracked over the session" className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-black uppercase tracking-wide border transition-colors ${gexLines ? 'border-[var(--accent-color)] text-black' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`} style={gexLines ? { background: 'var(--accent-color)' } : undefined}><Activity className="w-3 h-3" /> GEX</button>
                  <button onClick={() => setMultiChart(m => !m)} title="Toggle the movable multi-chart grid" className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-black uppercase tracking-wide border transition-colors ${multiChart ? 'border-[var(--accent-color)] text-black' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`} style={multiChart ? { background: 'var(--accent-color)' } : undefined}><Layers className="w-3 h-3" /> Multi</button>
                  <span style={{ color: 'var(--success)' }}>BULL {bullPct.toFixed(0)}%</span>
                  <span style={{ color: 'var(--danger)' }}>BEAR {(100 - bullPct).toFixed(0)}%</span>
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
            {/* Live tape — streaming narrative of the dealer read */}
            <div className="border-t border-[var(--border)] bg-[var(--surface)] h-7 shrink-0 flex items-center gap-2 px-3 overflow-hidden">
              <span className="flex items-center gap-1 text-[9px] font-black tracking-widest uppercase shrink-0" style={{ color: 'var(--accent-color)' }}><Radio className="w-3 h-3" /> Tape</span>
              <div className="flex items-center gap-5 overflow-hidden whitespace-nowrap">
                {read.events.map((e, i) => (<span key={i} className="flex items-center gap-1.5 text-[10px] font-mono shrink-0" style={{ color: toneColor(e.tone) }}><span className="w-1 h-1 rounded-full shrink-0" style={{ background: toneColor(e.tone) }} />{e.text}</span>))}
              </div>
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
            <div ref={ladderScrollRef} className="flex-1 overflow-y-auto">
              {ladder.map(r => {
                const inVac = !!((vacAbove && r.strike >= vacAbove.lo && r.strike <= vacAbove.hi) || (vacBelow && r.strike >= vacBelow.lo && r.strike <= vacBelow.hi));
                return (
                <div key={r.strike} data-strike={r.strike} className="grid grid-cols-[52px_1fr_64px] gap-2 px-3 h-[24px] items-center text-[10px] font-mono tabular-nums hover:bg-[var(--surface-2)]" style={r.isSpot ? { background: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', boxShadow: 'inset 2px 0 0 var(--accent-color)' } : inVac ? { background: 'color-mix(in srgb, var(--warning) 6%, transparent)' } : undefined}>
                  <div className="text-right flex items-center justify-end gap-1">
                    {r.isCW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} title="Call Wall" />}
                    {r.isPW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--danger)' }} title="Put Wall" />}
                    {r.isFlip && <span className="w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--warning)' }} title="GEX Flip" />}
                    <span className="font-black tracking-wider" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{fmtNum(r.strike)}</span>
                  </div>
                  <div className="relative flex items-center h-full">
                    <div className="w-1/2 h-full flex items-center justify-end pr-0.5 border-r border-dotted border-[var(--border)]"><div className="h-[9px] rounded-sm" style={{ width: `${r.putPct}%`, background: 'color-mix(in srgb, var(--danger) 60%, transparent)' }} /></div>
                    <div className="w-1/2 h-full flex items-center pl-0.5"><div className="h-[9px] rounded-sm" style={{ width: `${r.callPct}%`, background: 'color-mix(in srgb, var(--success) 60%, transparent)' }} /></div>
                  </div>
                  <div className="text-right font-black" style={{ color: r.netUp ? 'var(--success)' : 'var(--danger)' }}>{fmtBig(r.net)}</div>
                </div>
              ); })}
              {ladder.length === 0 && <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>}
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
    </div>
  );
}
