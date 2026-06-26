import { useMemo, useState, CSSProperties } from 'react';
import { GexProfileData, OrderFlowData } from '../types';
import { useContractStore } from '../lib/store';
import { SlayerChart } from './SlayerChart';
import { OrderFlow } from './OrderFlow';
import { ChevronDown, Activity, Zap, Crosshair } from 'lucide-react';
import { ASSET_LIST, TIMEFRAMES } from '../data';

interface LiveTerminalFlowProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}

// Institutional gold/amber aesthetic — true black, serif-italic section heads, dense data.
const G = {
  gold: '#d8b45e', goldHi: '#eccb7c', goldDim: '#9c7f3c',
  teal: '#34d6c2', up: '#3fd68a', down: '#f0646e',
  purple: '#b07cff', blue: '#5b9cff',
  text: '#d2d6dc', dim: '#7a818d', faint: '#474d57',
  line: '#191c21', panel: '#06070880',
};
const serif: CSSProperties = { fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' };
const fmtBig = (v: number) => { const a = Math.abs(v); const s = v < 0 ? '−' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + 'K' : s + a.toFixed(0); };
const fmtNum = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

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

  const dayOpen = candles.length ? candles[0].open : spot;
  const dayChg = spot && dayOpen ? ((spot - dayOpen) / dayOpen) * 100 : 0;

  // High-volume level (max total OI strike) — the "pin" magnet of open interest.
  const hvl = useMemo(() => { const ss = profile.strikes || []; if (!ss.length) return undefined; return ss.reduce((a, b) => ((b.callOi || 0) + (b.putOi || 0)) > ((a.callOi || 0) + (a.putOi || 0)) ? b : a).strike; }, [profile]);

  const callOi = profile.totalCallOi || 0, putOi = profile.totalPutOi || 0;
  const bullPct = callOi + putOi ? (callOi / (callOi + putOi)) * 100 : 50;

  const levels = ([
    { n: 'Call Wall', v: profile.callWall, c: G.up },
    { n: 'EM High', v: spot && emPct ? spot * (1 + emPct) : undefined, c: G.blue },
    { n: 'Magnet', v: profile.magnet, c: G.purple },
    { n: 'HVL', v: hvl, c: G.teal },
    { n: 'GEX Flip', v: flip, c: G.gold },
    { n: 'EM Low', v: spot && emPct ? spot * (1 - emPct) : undefined, c: G.blue },
    { n: 'Put Wall', v: profile.putWall, c: G.down },
  ] as { n: string; v?: number; c: string }[]).filter(l => typeof l.v === 'number' && (l.v as number) > 0).sort((a, b) => (b.v as number) - (a.v as number));

  const ladder = useMemo(() => {
    let ss = [...(profile.strikes || [])];
    if (profile.spot) ss = ss.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 28);
    const maxG = Math.max(...ss.map(s => Math.abs(s.netGex || 0)), 1);
    const maxV = Math.max(...ss.map(s => (s.callVolume || 0) + (s.putVolume || 0)), 1);
    return ss.sort((a, b) => b.strike - a.strike).map(s => ({
      strike: s.strike, net: s.netGex || 0, gexPct: (Math.abs(s.netGex || 0) / maxG) * 100,
      vol: (s.callVolume || 0) + (s.putVolume || 0), volPct: (((s.callVolume || 0) + (s.putVolume || 0)) / maxV) * 100,
      isSpot: Math.abs(s.strike - spot) < (spot * 0.0008), isCW: s.strike === profile.callWall, isPW: s.strike === profile.putWall, isFlip: s.strike === profile.gammaFlip,
    }));
  }, [profile, spot]);

  const expClose = profile.magnet || spot;
  const expDir = expClose > spot * 1.0008 ? 'BULLISH' : expClose < spot * 0.9992 ? 'BEARISH' : 'NEUTRAL';
  const regime = longGamma ? 'PINNING' : 'TRENDING';

  const Metric = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) => (
    <div className="rounded-md border px-3 py-2" style={{ borderColor: G.line, background: G.panel }}>
      <div className="text-[8.5px] font-mono font-bold uppercase tracking-[0.18em]" style={{ color: G.dim }}>{label}</div>
      <div className="text-[17px] font-black tabular-nums leading-tight mt-0.5 antialiased" style={{ color }}>{value}</div>
      {sub && <div className="text-[9px] font-mono mt-0.5" style={{ color: G.faint }}>{sub}</div>}
    </div>
  );

  const tickerSelect = (
    <div className="relative">
      <button onClick={() => setTickerOpen(o => !o)} className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-[12px] font-mono font-black tracking-wider transition-colors" style={{ borderColor: G.line, color: G.text, background: '#0c0d10' }}>
        {selectedAsset.ticker}<ChevronDown className={`w-3 h-3 transition-transform ${tickerOpen ? 'rotate-180' : ''}`} style={{ color: G.dim }} />
      </button>
      {tickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTickerOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 w-48 max-h-80 overflow-y-auto rounded-md shadow-2xl py-1 border" style={{ borderColor: G.line, background: '#0a0b0e' }}>
            {ASSET_LIST.map(a => (
              <button key={a.ticker} onClick={() => { setSelectedAsset(a); setTickerOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-white/[0.05] transition-colors" style={a.ticker === selectedAsset.ticker ? { background: 'rgba(216,180,94,0.08)' } : undefined}>
                <span className="text-[12px] font-mono font-bold" style={{ color: a.ticker === selectedAsset.ticker ? G.gold : G.text }}>{a.ticker}</span>
                <span className="text-[9px] font-sans truncate ml-2 max-w-[110px]" style={{ color: G.dim }}>{a.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="w-full flex flex-col bg-black" style={{ minHeight: '820px', color: G.text }}>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 h-12 border-b shrink-0" style={{ borderColor: G.line, background: '#040506' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full shrink-0" style={{ background: `radial-gradient(circle at 32% 28%, ${G.goldHi}, ${G.goldDim} 75%)`, boxShadow: `0 0 10px ${G.gold}55` }} />
            <div className="leading-none hidden sm:block">
              <div className="text-[14px] font-black" style={{ ...serif, color: G.gold }}>Slayer Terminal</div>
              <div className="text-[6.5px] font-mono uppercase tracking-[0.32em] mt-0.5" style={{ color: G.dim }}>Institutional Flow Intelligence</div>
            </div>
          </div>
          <span className="w-px h-5" style={{ background: G.line }} />
          {tickerSelect}
          {/* gold price pill */}
          <div className="flex flex-col items-end px-3 py-1 rounded shrink-0" style={{ background: `linear-gradient(135deg, ${G.goldHi}, ${G.gold})` }}>
            <span className="text-[14px] font-black tabular-nums leading-none text-black">{spot ? spot.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'}</span>
            <span className="text-[9px] font-mono font-bold tabular-nums leading-none mt-0.5" style={{ color: 'rgba(0,0,0,0.6)' }}>{dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* timeframe */}
          <div className="hidden md:flex items-center gap-0.5 rounded p-0.5 border" style={{ borderColor: G.line, background: '#0a0b0e' }}>
            {TF.map(t => (
              <button key={t.val} onClick={() => setSelectedTimeframe(t.val)} className="px-2 py-0.5 text-[10px] font-mono font-black rounded transition-colors" style={selectedTimeframe === t.val ? { background: 'rgba(216,180,94,0.16)', color: G.gold } : { color: G.dim }}>{t.val}</button>
            ))}
          </div>
          {/* 0DTE / ALL */}
          <div className="flex items-center rounded p-0.5 border" style={{ borderColor: G.line, background: '#0a0b0e' }}>
            {(['0DTE', 'ALL'] as const).map(s => (
              <button key={s} onClick={() => setScope(s)} className="px-2 py-0.5 text-[10px] font-mono font-black rounded transition-colors" style={scope === s ? { background: G.gold, color: '#000' } : { color: G.dim }}>{s}</button>
            ))}
          </div>
          {/* regime */}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-black uppercase tracking-widest" style={{ borderColor: longGamma ? 'rgba(63,214,138,0.4)' : 'rgba(240,100,110,0.4)', background: longGamma ? 'rgba(63,214,138,0.1)' : 'rgba(240,100,110,0.1)', color: longGamma ? G.up : G.down }}>
            {longGamma ? <Activity className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-current" />}{longGamma ? 'Long γ' : 'Short γ'}
          </span>
        </div>
      </div>

      {/* ── 3-column workspace (centered on ultrawide) ── */}
      <div className="flex-1 w-full overflow-hidden flex justify-center">
        <div className="flex flex-col xl:flex-row w-full max-w-[2280px] h-full overflow-hidden">

          {/* ░░ LEFT — Key Levels / Flow ░░ */}
          <aside className="order-2 xl:order-1 w-full xl:w-[272px] shrink-0 border-r flex flex-col min-h-[360px] xl:min-h-0" style={{ borderColor: G.line }}>
            <div className="flex items-center gap-4 px-3 h-9 border-b shrink-0" style={{ borderColor: G.line }}>
              {(['levels', 'flow'] as const).map(t => (
                <button key={t} onClick={() => setLeftTab(t)} className="text-[14px] font-black transition-colors" style={{ ...serif, color: leftTab === t ? G.gold : G.faint }}>{t === 'levels' ? 'Key Levels' : 'Order Flow'}</button>
              ))}
            </div>

            {leftTab === 'flow' ? (
              <div className="flex-1 min-h-0"><OrderFlow data={orderFlow} decimals={decimals} /></div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-3 antialiased">
                {/* Net gamma */}
                <Metric label="Net Gamma Exposure" value={`${netGex >= 0 ? '+' : ''}${fmtBig(netGex)}`} sub={`γ-flip ${flip ? flip.toFixed(0) : '—'}`} color={longGamma ? G.up : G.down} />
                {/* regime line */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border" style={{ borderColor: longGamma ? 'rgba(63,214,138,0.3)' : 'rgba(240,100,110,0.3)', background: longGamma ? 'rgba(63,214,138,0.06)' : 'rgba(240,100,110,0.06)' }}>
                  <Crosshair className="w-3 h-3 shrink-0" style={{ color: longGamma ? G.up : G.down }} />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: longGamma ? G.up : G.down }}>{aboveFlip ? 'Above Flip · Pinning' : 'Below Flip · Trending'}</span>
                </div>

                {/* Key levels list */}
                <div>
                  <div className="text-[15px] font-black mb-1.5" style={{ ...serif, color: G.text }}>Key Levels</div>
                  <div className="rounded-md border overflow-hidden" style={{ borderColor: G.line }}>
                    {levels.map((l, i) => {
                      return (
                        <div key={l.n} className="flex items-center gap-2 px-2.5 h-[26px]" style={{ background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.012)', borderTop: i ? `1px solid ${G.line}` : undefined }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.c }} />
                          <span className="text-[10.5px] font-mono font-bold flex-1 truncate" style={{ color: G.text }}>{l.n}</span>
                          <span className="text-[10.5px] font-mono font-black tabular-nums" style={{ color: l.c }}>{(l.v as number).toFixed(0)}</span>
                          <span className="text-[8.5px] font-mono tabular-nums w-[42px] text-right" style={{ color: G.dim }}>{distLabel(l.v)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Vanna + DEX */}
                <Metric label="Vanna Exposure · VEX" value={fmtBig(profile.netVex ?? netGex * 0.34)} sub={longGamma ? 'Stabilizing' : 'Destabilizing'} color={G.teal} />
                <Metric label="Net Delta · DEX" value={fmtBig(profile.netDex ?? 0)} sub={(profile.netDex ?? 0) >= 0 ? 'Dealers long delta' : 'Dealers short delta'} color={(profile.netDex ?? 0) >= 0 ? G.up : G.down} />
                <Metric label="Call / Put OI" value={profile.callPutOiRatio || (callOi && putOi ? (callOi / putOi).toFixed(2) : '—')} sub={`${fmtBig(callOi)} call · ${fmtBig(putOi)} put`} color={G.gold} />
              </div>
            )}
          </aside>

          {/* ░░ CENTER — flow header + chart ░░ */}
          <main className="order-1 xl:order-2 flex-1 min-w-0 flex flex-col border-r min-h-[440px]" style={{ borderColor: G.line }}>
            {/* flow header strip */}
            <div className="px-3 py-1.5 border-b shrink-0" style={{ borderColor: G.line, background: '#050607' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-wider min-w-0">
                  <span style={{ color: G.gold }}>◈ FLOW</span>
                  <span style={{ color: G.text }}>{selectedAsset.ticker}</span>
                  <span className="px-1.5 py-0.5 rounded text-[8.5px]" style={{ background: 'rgba(216,180,94,0.14)', color: G.gold }}>{scope}</span>
                  <span className="hidden sm:inline" style={{ color: G.dim }}>· {selectedTimeframe} · LIVE</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono font-black tabular-nums shrink-0">
                  <span style={{ color: G.up }}>BULL {bullPct.toFixed(0)}%</span>
                  <span style={{ color: G.down }}>BEAR {(100 - bullPct).toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="h-full" style={{ width: `${bullPct}%`, background: `linear-gradient(90deg, rgba(63,214,138,0.5), ${G.up})` }} />
                <div className="h-full flex-1" style={{ background: `linear-gradient(90deg, ${G.down}, rgba(240,100,110,0.5))` }} />
              </div>
            </div>
            {/* chart */}
            <div className="flex-1 min-h-[400px] bg-black relative"><SlayerChart profile={profile} decimals={decimals} /></div>
          </main>

          {/* ░░ RIGHT — Ladder ░░ */}
          <aside className="order-3 w-full xl:w-[336px] shrink-0 flex flex-col bg-black min-h-[360px] xl:min-h-0">
            <div className="flex items-center gap-2 px-3 h-9 border-b shrink-0" style={{ borderColor: G.line }}>
              <span className="text-[15px] font-black" style={{ ...serif, color: G.gold }}>Ladder</span>
              <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: G.dim }}>{ladder.length} · spot</span>
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest border" style={{ borderColor: G.line, color: longGamma ? G.up : G.down }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: longGamma ? G.up : G.down }} />{regime}
              </span>
            </div>
            {/* table header */}
            <div className="grid grid-cols-[58px_1fr_1fr] gap-2 px-3 py-1.5 border-b-2 shrink-0 text-[9px] font-mono font-black uppercase tracking-widest" style={{ borderColor: G.line, color: G.dim }}>
              <div className="text-right">Strike</div>
              <div className="flex justify-between"><span style={{ color: G.down }}>GEX P</span><span style={{ color: G.up }}>GEX C</span></div>
              <div className="text-right">Volume</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {ladder.map(r => (
                <div key={r.strike} className="grid grid-cols-[58px_1fr_1fr] gap-2 px-3 h-[24px] items-center text-[10.5px] font-mono font-medium tabular-nums antialiased" style={r.isSpot ? { background: 'rgba(216,180,94,0.1)', borderTop: `1px solid ${G.gold}55`, borderBottom: `1px solid ${G.gold}55` } : undefined}>
                  <div className="text-right flex items-center justify-end gap-1">
                    {r.isCW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: G.up }} title="Call Wall" />}
                    {r.isPW && <span className="w-1.5 h-1.5 rounded-full" style={{ background: G.down }} title="Put Wall" />}
                    {r.isFlip && <span className="w-1.5 h-1.5 rounded-sm" style={{ background: G.gold }} title="GEX Flip" />}
                    <span className="font-black tracking-wider" style={{ color: r.isSpot ? G.gold : G.text }}>{r.strike.toFixed(0)}</span>
                  </div>
                  <div className="relative flex items-center h-full">
                    <div className="absolute inset-y-0 right-1/2 flex items-center justify-end w-[calc(50%-2px)]">{r.net < 0 && <div className="h-[9px] rounded-sm" style={{ width: `${r.gexPct}%`, background: 'rgba(240,100,110,0.6)' }} />}</div>
                    <div className="absolute inset-y-0 left-1/2 flex items-center w-[calc(50%-2px)]">{r.net >= 0 && <div className="h-[9px] rounded-sm" style={{ width: `${r.gexPct}%`, background: 'rgba(63,214,138,0.6)' }} />}</div>
                    <div className="absolute left-1/2 -translate-x-1/2 text-[9px] font-black tabular-nums" style={{ color: r.net >= 0 ? G.up : G.down }}>{fmtBig(r.net)}</div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="h-[8px] rounded-sm" style={{ width: `${Math.max(3, r.volPct)}%`, background: 'rgba(216,180,94,0.4)' }} />
                    <span className="text-[8.5px] w-[34px] text-right" style={{ color: G.dim }}>{fmtBig(r.vol)}</span>
                  </div>
                </div>
              ))}
              {ladder.length === 0 && <div className="flex items-center justify-center py-12 text-[11px] font-mono" style={{ color: G.dim }}>Awaiting dealer chain…</div>}
            </div>
            {/* expected close footer */}
            <div className="px-3 py-2 border-t shrink-0 flex items-center justify-between" style={{ borderColor: G.line, background: '#050607' }}>
              <div>
                <div className="text-[8.5px] font-mono font-bold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Expected Close</div>
                <div className="text-[15px] font-black tabular-nums" style={{ color: G.text }}>{expClose ? expClose.toFixed(decimals) : '—'}</div>
              </div>
              <span className="px-2.5 py-1 rounded text-[10px] font-mono font-black uppercase tracking-widest border" style={{ borderColor: G.line, color: expDir === 'BULLISH' ? G.up : expDir === 'BEARISH' ? G.down : G.gold }}>{expDir}</span>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
