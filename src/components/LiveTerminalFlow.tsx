import { useMemo, useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { GexProfileData, OrderFlowData } from '../types';
import { useContractStore } from '../lib/store';
import { computeTerminalRead } from '../lib/terminalRead';
import { SlayerChart } from './SlayerChart';
import { OrderFlow } from './OrderFlow';
import { Crosshair, Activity, Zap, Layers, ChevronDown, Gauge as GaugeIcon, Swords, Radio, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ASSET_LIST, TIMEFRAMES } from '../data';

const biasColor = (b: string) => (b === 'LONG' ? 'var(--success)' : b === 'SHORT' ? 'var(--danger)' : 'var(--text-secondary)');
const toneColor = (t: string) => (t === 'pos' ? 'var(--success)' : t === 'neg' ? 'var(--danger)' : 'var(--text-tertiary)');

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
  const [tickerOpen, setTickerOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<'levels' | 'flow'>('levels');
  const [scope, setScope] = useState<'0DTE' | 'ALL'>('0DTE');
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

  const hvl = useMemo(() => { const ss = profile.strikes || []; if (!ss.length) return undefined; return ss.reduce((a, b) => ((b.callOi || 0) + (b.putOi || 0)) > ((a.callOi || 0) + (a.putOi || 0)) ? b : a).strike; }, [profile]);
  const callOi = profile.totalCallOi || 0, putOi = profile.totalPutOi || 0;
  const bullPct = callOi + putOi ? (callOi / (callOi + putOi)) * 100 : 50;

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

  const ladder = useMemo(() => {
    let ss = [...(profile.strikes || [])];
    if (profile.spot) ss = ss.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 30);
    const maxG = Math.max(...ss.map(s => Math.max(Math.abs(s.callGex || 0), Math.abs(s.putGex || 0))), 1);
    const maxV = Math.max(...ss.map(s => (s.callVolume || 0) + (s.putVolume || 0)), 1);
    return ss.sort((a, b) => b.strike - a.strike).map(s => ({
      strike: s.strike, net: s.netGex || 0,
      callPct: (Math.abs(s.callGex || 0) / maxG) * 100, putPct: (Math.abs(s.putGex || 0) / maxG) * 100,
      vol: (s.callVolume || 0) + (s.putVolume || 0), volPct: (((s.callVolume || 0) + (s.putVolume || 0)) / maxV) * 100,
      isSpot: Math.abs(s.strike - spot) < spot * 0.0008, isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
    }));
  }, [profile, spot]);

  const expClose = profile.magnet || spot;
  const expDir = expClose > spot * 1.0008 ? 'BULLISH' : expClose < spot * 0.9992 ? 'BEARISH' : 'NEUTRAL';
  const regime = longGamma ? 'PINNING' : 'TRENDING';

  // Synthesis — the actionable read (bias / confluence / battle plan / narrative).
  const read = useMemo(() => computeTerminalRead(profile, candles.slice(-12).map(c => c.close)), [profile, candles]);
  const rColor = biasColor(read.bias);

  const Tile = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) => (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2.5 py-2">
      <div className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">{label}</div>
      <div className="text-[14px] font-mono font-black tabular-nums leading-tight mt-0.5" style={{ color }}>{value}</div>
      {sub && <div className="text-[8.5px] font-mono text-[var(--text-tertiary)] mt-0.5 truncate">{sub}</div>}
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
    <div className="w-full flex flex-col animate-fadeIn" style={{ minHeight: '820px', background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
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
            <div className="text-[7.5px] font-mono uppercase tracking-[0.28em] mt-0.5 text-[var(--text-tertiary)]">Dealer Flow Engine</div>
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
          <div className="hidden md:block">{segToggle(TF.map(t => t.val), selectedTimeframe, setSelectedTimeframe)}</div>
          {segToggle(['0DTE', 'ALL'], scope, v => setScope(v as '0DTE' | 'ALL'), true)}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono font-black uppercase tracking-widest" style={{ borderColor: longGamma ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'color-mix(in srgb, var(--danger) 40%, transparent)', background: longGamma ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)', color: trend, boxShadow: `0 0 16px ${longGamma ? 'color-mix(in srgb, var(--success) 18%, transparent)' : 'color-mix(in srgb, var(--danger) 18%, transparent)'}` }}>
            {longGamma ? <Activity className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-current" />}{longGamma ? 'Long γ' : 'Short γ'}
          </span>
        </div>
      </div>

      {/* ── Command bar: the at-a-glance actionable read ── */}
      <div className="flex items-stretch h-[58px] border-b border-[var(--border)] shrink-0 bg-[var(--surface)] overflow-x-auto">
        <div className="flex items-center gap-2.5 px-4 border-r border-[var(--border)] shrink-0">
          <div className="flex flex-col leading-none">
            <span className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Bias</span>
            <span className="text-[19px] font-sans font-black leading-none tracking-tight mt-1" style={{ color: rColor }}>{read.bias}</span>
          </div>
          {read.bias === 'LONG' ? <TrendingUp className="w-5 h-5" style={{ color: rColor }} /> : read.bias === 'SHORT' ? <TrendingDown className="w-5 h-5" style={{ color: rColor }} /> : <Minus className="w-5 h-5" style={{ color: rColor }} />}
        </div>
        <div className="flex flex-col justify-center gap-1 px-4 border-r border-[var(--border)] shrink-0 min-w-[170px]">
          <div className="flex items-center justify-between"><span className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Confluence</span><span className="text-[10px] font-mono font-black tabular-nums" style={{ color: rColor }}>{read.confidence}%</span></div>
          <div className="h-1.5 rounded-full overflow-hidden bg-[var(--surface-3)]"><motion.div className="h-full rounded-full" style={{ background: rColor }} animate={{ width: `${read.confidence}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} /></div>
          <span className="text-[8.5px] font-mono text-[var(--text-tertiary)]">{read.confidenceLabel} · {read.regime} regime</span>
        </div>
        <div className="flex flex-col justify-center gap-0.5 px-4 border-r border-[var(--border)] flex-1 min-w-[260px]">
          <span className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">The Play</span>
          <span className="text-[11px] font-mono leading-snug text-[var(--text-secondary)] line-clamp-2">{read.play}</span>
        </div>
        <div className="flex flex-col justify-center px-4 border-r border-[var(--border)] shrink-0">
          <span className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Target</span>
          <span className="text-[14px] font-mono font-black tabular-nums leading-tight text-[var(--text-primary)]">{read.target ? read.target.toFixed(0) : '—'}</span>
          <span className="text-[8.5px] font-mono tabular-nums" style={{ color: rColor }}>{read.target ? distLabel(read.target) : ''}</span>
        </div>
        <div className="flex flex-col justify-center px-4 shrink-0">
          <span className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Exp Move</span>
          <span className="text-[14px] font-mono font-black tabular-nums leading-tight" style={{ color: 'var(--info)' }}>{emPct != null ? `±${(emPct * 100).toFixed(2)}%` : '—'}</span>
        </div>
      </div>

      {/* ── 3-column workspace (centered on ultrawide) ── */}
      <div className="flex-1 w-full overflow-hidden flex justify-center">
        <div className="flex flex-col xl:flex-row w-full max-w-[2280px] h-full overflow-hidden">

          {/* ░ LEFT — Key Levels / Flow ░ */}
          <aside className="order-2 xl:order-1 w-full xl:w-[276px] shrink-0 border-r border-[var(--border)] flex flex-col min-h-[360px] xl:min-h-0 bg-[var(--surface)]">
            <div className="flex items-center gap-4 px-3 h-9 border-b border-[var(--border)] shrink-0">
              {(['levels', 'flow'] as const).map(t => (
                <button key={t} onClick={() => setLeftTab(t)} className="relative text-[11px] font-sans font-black tracking-widest uppercase transition-colors py-2" style={{ color: leftTab === t ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {t === 'levels' ? 'Key Levels' : 'Order Flow'}
                  {leftTab === t && <span className="absolute -bottom-px left-0 right-0 h-[2px]" style={{ background: 'var(--accent-color)' }} />}
                </button>
              ))}
            </div>

            {leftTab === 'flow' ? (
              <div className="flex-1 min-h-0"><OrderFlow data={orderFlow} decimals={decimals} /></div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {/* Net gamma hero */}
                <div className="rounded-lg border px-3 py-2.5 relative overflow-hidden" style={{ borderColor: longGamma ? 'color-mix(in srgb, var(--success) 32%, transparent)' : 'color-mix(in srgb, var(--danger) 32%, transparent)', background: `linear-gradient(135deg, color-mix(in srgb, ${longGamma ? 'var(--success)' : 'var(--danger)'} 9%, transparent), transparent)` }}>
                  <div className="flex items-center gap-1.5 text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]"><GaugeIcon className="w-3 h-3" /> Net Gamma Exposure</div>
                  <div className="text-[26px] font-mono font-black tabular-nums leading-none mt-1" style={{ color: trend }}>{netGex >= 0 ? '+' : ''}{fmtBig(netGex)}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest" style={{ background: `color-mix(in srgb, ${trend} 14%, transparent)`, color: trend }}>{aboveFlip ? 'Above Flip' : 'Below Flip'}</span>
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)]">{regime}</span>
                  </div>
                </div>

                {/* Confluence breakdown — the signals behind the bias */}
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md overflow-hidden">
                  <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[var(--border)]">
                    <span className="text-[9px] font-sans font-black tracking-widest uppercase text-[var(--text-secondary)]">Confluence</span>
                    <span className="text-[9px] font-mono font-black" style={{ color: rColor }}>{read.confidence}% {read.bias}</span>
                  </div>
                  <div className="py-0.5">
                    {read.signals.map(s => (
                      <div key={s.key} className="flex items-center gap-2 px-3 h-[28px] hover:bg-[var(--surface-3)] transition-colors" title={s.detail}>
                        {s.dir > 0 ? <TrendingUp className="w-3 h-3 shrink-0" style={{ color: 'var(--success)' }} /> : s.dir < 0 ? <TrendingDown className="w-3 h-3 shrink-0" style={{ color: 'var(--danger)' }} /> : <Minus className="w-3 h-3 shrink-0 text-[var(--text-tertiary)]" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-mono font-bold text-[var(--text-secondary)] truncate leading-tight">{s.label}</div>
                          <div className="text-[8px] font-mono text-[var(--text-tertiary)] truncate leading-tight">{s.detail}</div>
                        </div>
                        <div className="w-9 h-1 rounded-full bg-[var(--surface-3)] overflow-hidden shrink-0"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.weight / 28) * 100)}%`, background: s.dir > 0 ? 'var(--success)' : s.dir < 0 ? 'var(--danger)' : 'var(--text-tertiary)' }} /></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* dealer-structure spectrum */}
                {structure && (
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-3 py-3">
                    <div className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)] mb-3">Dealer Structure</div>
                    <div className="relative h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--danger) 45%, transparent), color-mix(in srgb, var(--text-tertiary) 25%, transparent), color-mix(in srgb, var(--success) 45%, transparent))' }}>
                      {structure.pts.map((pt, i) => (<div key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-3 rounded-full" style={{ left: `${pt.x}%`, background: pt.c }} title={pt.l} />))}
                      <motion.div className="absolute -top-[5px] -translate-x-1/2 z-10" animate={{ left: `${structure.spotPos}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }}>
                        <div className="w-3 h-3 rotate-45" style={{ background: 'var(--text-primary)', boxShadow: '0 0 8px var(--accent-color)' }} />
                      </motion.div>
                    </div>
                    <div className="relative h-7 mt-2">
                      {structure.pts.map((pt, i) => (<div key={i} className="absolute -translate-x-1/2 text-center leading-tight" style={{ left: `${pt.x}%` }}><div className="text-[8px] font-mono font-black" style={{ color: pt.c }}>{pt.l}</div><div className="text-[8px] font-mono text-[var(--text-tertiary)] tabular-nums">{(pt.p as number).toFixed(0)}</div></div>))}
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
                        <span className="text-[10.5px] font-mono font-bold flex-1 truncate text-[var(--text-secondary)]">{l.n}</span>
                        <span className="text-[10.5px] font-mono font-black tabular-nums" style={{ color: l.c }}>{(l.v as number).toFixed(0)}</span>
                        <span className="text-[8.5px] font-mono tabular-nums w-[42px] text-right text-[var(--text-tertiary)]">{distLabel(l.v)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Vanna · VEX" value={fmtBig(profile.netVex ?? netGex * 0.34)} sub={longGamma ? 'Stabilizing' : 'Destabilizing'} color="var(--info)" />
                  <Tile label="Net Delta · DEX" value={fmtBig(profile.netDex ?? 0)} sub={(profile.netDex ?? 0) >= 0 ? 'Long delta' : 'Short delta'} color={(profile.netDex ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'} />
                  <Tile label="Exp Move" value={emPct != null ? `±${(emPct * 100).toFixed(2)}%` : '—'} color="var(--text-primary)" />
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
                  <span className="px-1.5 py-0.5 rounded text-[8.5px]" style={{ background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)', color: 'var(--accent-color)' }}>{scope}</span>
                  <span className="hidden sm:inline text-[var(--text-tertiary)]">· {selectedTimeframe} · LIVE</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono font-black tabular-nums shrink-0">
                  <span style={{ color: 'var(--success)' }}>BULL {bullPct.toFixed(0)}%</span>
                  <span style={{ color: 'var(--danger)' }}>BEAR {(100 - bullPct).toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full" style={{ width: `${bullPct}%`, background: 'var(--success)' }} />
                <div className="h-full flex-1" style={{ background: 'var(--danger)' }} />
              </div>
            </div>
            <div className="flex-1 min-h-[400px] relative" style={{ background: 'var(--bg-base)' }}><SlayerChart profile={profile} decimals={decimals} /></div>
            {/* Live tape — streaming narrative of the dealer read */}
            <div className="border-t border-[var(--border)] bg-[var(--surface)] h-7 shrink-0 flex items-center gap-2 px-3 overflow-hidden">
              <span className="flex items-center gap-1 text-[8px] font-black tracking-widest uppercase shrink-0" style={{ color: 'var(--accent-color)' }}><Radio className="w-3 h-3" /> Tape</span>
              <div className="flex items-center gap-5 overflow-hidden whitespace-nowrap">
                {read.events.map((e, i) => (<span key={i} className="flex items-center gap-1.5 text-[10px] font-mono shrink-0" style={{ color: toneColor(e.tone) }}><span className="w-1 h-1 rounded-full shrink-0" style={{ background: toneColor(e.tone) }} />{e.text}</span>))}
              </div>
            </div>
          </main>

          {/* ░ RIGHT — Exposure Ladder ░ */}
          <aside className="order-3 w-full xl:w-[340px] shrink-0 flex flex-col min-h-[360px] xl:min-h-0 bg-[var(--surface)]">
            {/* Battle plan — the regime-aware tactical card */}
            <div className="m-2.5 mb-1 rounded-lg border p-2.5 relative overflow-hidden shrink-0" style={{ borderColor: `color-mix(in srgb, ${rColor} 30%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${rColor} 8%, transparent), transparent)` }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Swords className="w-3.5 h-3.5" style={{ color: rColor }} />
                <span className="text-[10px] font-sans font-black tracking-widest uppercase text-[var(--text-primary)]">Battle Plan</span>
                <span className="ml-auto text-[8px] font-mono font-black px-1.5 py-0.5 rounded uppercase tracking-widest" style={{ background: `color-mix(in srgb, ${rColor} 14%, transparent)`, color: rColor }}>{read.regime}</span>
              </div>
              <p className="text-[10px] font-mono leading-relaxed text-[var(--text-secondary)]">{read.play}</p>
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <div className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 min-w-0"><div className="text-[7.5px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Entry</div><div className="text-[9px] font-mono font-bold text-[var(--text-secondary)] truncate" title={read.entry}>{read.entry}</div></div>
                <div className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1"><div className="text-[7.5px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Target</div><div className="text-[12px] font-mono font-black tabular-nums" style={{ color: 'var(--success)' }}>{read.target ? read.target.toFixed(0) : '—'}</div></div>
                <div className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1"><div className="text-[7.5px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Stop</div><div className="text-[12px] font-mono font-black tabular-nums" style={{ color: 'var(--danger)' }}>{read.stop ? read.stop.toFixed(0) : '—'}</div></div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 h-9 border-b border-t border-[var(--border)] shrink-0">
              <Layers className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} />
              <span className="text-[11px] font-sans font-black tracking-widest uppercase text-[var(--text-primary)]">Exposure Ladder</span>
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest border border-[var(--border)]" style={{ color: trend }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: trend }} />{regime}
              </span>
            </div>
            <div className="grid grid-cols-[52px_1fr_64px] gap-2 px-3 py-1.5 border-b border-[var(--border)] shrink-0 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)]">
              <div className="text-right">Strike</div>
              <div className="flex justify-between"><span style={{ color: 'var(--danger)' }}>◄ Put</span><span style={{ color: 'var(--success)' }}>Call ►</span></div>
              <div className="text-right">Net</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {ladder.map(r => (
                <div key={r.strike} className="grid grid-cols-[52px_1fr_64px] gap-2 px-3 h-[24px] items-center text-[10px] font-mono tabular-nums hover:bg-[var(--surface-2)]" style={r.isSpot ? { background: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', boxShadow: 'inset 2px 0 0 var(--accent-color)' } : undefined}>
                  <div className="text-right flex items-center justify-end gap-1">
                    {r.isCW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} title="Call Wall" />}
                    {r.isPW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--danger)' }} title="Put Wall" />}
                    {r.isFlip && <span className="w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--warning)' }} title="GEX Flip" />}
                    <span className="font-black tracking-wider" style={{ color: r.isSpot ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{r.strike.toFixed(0)}</span>
                  </div>
                  <div className="relative flex items-center h-full">
                    <div className="w-1/2 h-full flex items-center justify-end pr-0.5 border-r border-dotted border-[var(--border)]"><div className="h-[9px] rounded-sm" style={{ width: `${r.putPct}%`, background: 'color-mix(in srgb, var(--danger) 60%, transparent)' }} /></div>
                    <div className="w-1/2 h-full flex items-center pl-0.5"><div className="h-[9px] rounded-sm" style={{ width: `${r.callPct}%`, background: 'color-mix(in srgb, var(--success) 60%, transparent)' }} /></div>
                  </div>
                  <div className="text-right font-black" style={{ color: r.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtBig(r.net)}</div>
                </div>
              ))}
              {ladder.length === 0 && <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]">Awaiting dealer chain…</div>}
            </div>
            <div className="px-3 py-2 border-t border-[var(--border)] shrink-0 flex items-center justify-between bg-[var(--surface)]">
              <div>
                <div className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Expected Close</div>
                <div className="text-[15px] font-mono font-black tabular-nums text-[var(--text-primary)]">{expClose ? expClose.toFixed(decimals) : '—'}</div>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-black uppercase tracking-widest border border-[var(--border)]" style={{ color: expDir === 'BULLISH' ? 'var(--success)' : expDir === 'BEARISH' ? 'var(--danger)' : 'var(--accent-color)' }}>{expDir}</span>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
