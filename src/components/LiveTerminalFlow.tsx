import { useMemo, useState } from 'react';
import { GexProfileData } from '../types';
import { useContractStore } from '../lib/store';
import { SlayerChart } from './SlayerChart';
import { Activity, Shield, Zap, Layers, Target, Crosshair } from 'lucide-react';

interface LiveTerminalFlowProps {
  profile: GexProfileData;
  ticker: string;
  decimals: number;
}

const fmtBig = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
};

export function LiveTerminalFlow({ profile, ticker, decimals }: LiveTerminalFlowProps) {
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';
  const [activeLadder, setActiveLadder] = useState<'30' | 'ALL'>('30');

  const spot = profile.spot || 0;
  const netGex = profile.netGex || 0;
  const longGamma = netGex >= 0;
  const flip = profile.gammaFlip;
  const aboveFlip = flip && spot ? spot >= flip : null;
  const accent = longGamma ? 'var(--success)' : 'var(--danger)';
  const dist = (lvl?: number) => (lvl && spot ? ((lvl - spot) / spot) * 100 : null);
  const distLabel = (lvl?: number) => { const d = dist(lvl); return d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`; };

  // Dealer-structure spectrum: spot's position across the key levels.
  const structure = useMemo(() => {
    const pts = ([
      { p: profile.putWall, c: 'var(--danger)', l: 'PW' },
      { p: profile.gammaFlip, c: 'var(--warning)', l: 'γF' },
      { p: profile.magnet, c: '#a855f7', l: 'MAG' },
      { p: profile.callWall, c: 'var(--success)', l: 'CW' },
    ] as { p?: number; c: string; l: string }[]).filter(x => typeof x.p === 'number' && (x.p as number) > 0);
    const all = [...pts.map(x => x.p as number), spot].filter(v => v > 0);
    if (all.length < 2) return null;
    const lo = Math.min(...all), hi = Math.max(...all), range = (hi - lo) || 1, pad = range * 0.1;
    const L = lo - pad, H = hi + pad;
    const pos = (p: number) => Math.max(1, Math.min(99, ((p - L) / (H - L)) * 100));
    return { pts: pts.map(pt => ({ ...pt, x: pos(pt.p as number) })), spotPos: pos(spot) };
  }, [profile, spot]);

  const insight = longGamma
    ? `Long-gamma — dealers fade extension. ${aboveFlip ? 'Holding above' : 'Pinned below'} γ-flip ${flip ? flip.toFixed(0) : '—'}${profile.magnet ? `; magnet ${profile.magnet.toFixed(0)} draws price` : ''}.`
    : `Short-gamma — dealers amplify moves; expect trend & vol. Reclaiming ${flip ? flip.toFixed(0) : 'the flip'} restores stability.`;

  const ladderData = useMemo(() => {
    let strikes = profile?.strikes || [];
    if (activeLadder === '30' && profile.spot) {
      strikes = [...strikes].sort((a, b) => Math.abs(a.strike - (profile.spot || 0)) - Math.abs(b.strike - (profile.spot || 0))).slice(0, 30);
    }
    const maxVol = Math.max(...strikes.map(s => (s.callVolume || 0) + (s.putVolume || 0)), 1);
    const maxGex = Math.max(...strikes.map(s => Math.max(Math.abs(s.callGex || 0), Math.abs(s.putGex || 0))), 1);
    return strikes.sort((a, b) => b.strike - a.strike).map(s => ({
      strike: s.strike,
      isSpot: Math.abs(s.strike - (profile.spot || 0)) < 0.001,
      isFlip: s.strike === profile.gammaFlip,
      isCallWall: s.strike === profile.callWall,
      isPutWall: s.strike === profile.putWall,
      callVolPct: ((s.callVolume || 0) / maxVol) * 100,
      putVolPct: ((s.putVolume || 0) / maxVol) * 100,
      callGexPct: ((s.callGex || 0) / maxGex) * 100,
      putGexPct: (Math.abs(s.putGex || 0) / maxGex) * 100,
    }));
  }, [profile, activeLadder]);

  const Tile = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <div className="border border-[var(--border)] rounded-md px-2.5 py-2 bg-white/[0.015] hover:bg-white/[0.03] transition-colors">
      <div className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{label}</div>
      <div className="text-[15px] font-black tabular-nums leading-tight mt-1" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[9px] font-mono text-[var(--text-tertiary)] mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );

  // Gamma pressure — transparent heuristic for how strongly dealer-gamma forces cage price
  // at spot (regime + proximity to magnet/walls + caged between the walls). Magnitude = force;
  // colour + label convey direction (green pin vs red instability).
  const pressure = (() => {
    let s = longGamma ? 45 : 18;
    const dMag = Math.abs(dist(profile.magnet) ?? 99);
    if (dMag < 0.15) s += 25; else if (dMag < 0.4) s += 15; else if (dMag < 0.8) s += 7;
    if (profile.putWall && profile.callWall && spot >= profile.putWall && spot <= profile.callWall) s += 18;
    const dWall = Math.min(Math.abs(dist(profile.callWall) ?? 99), Math.abs(dist(profile.putWall) ?? 99));
    if (dWall < 0.2) s += 12;
    return Math.max(3, Math.min(100, Math.round(s)));
  })();
  const pressureLabel = pressure >= 70 ? (longGamma ? 'Strong Pin' : 'Unstable') : pressure >= 45 ? 'Moderate' : 'Loose';

  const Gauge = ({ value, color }: { value: number; color: string }) => {
    const r = 26, c = 2 * Math.PI * r, dash = c * 0.75, filled = dash * (Math.max(0, Math.min(100, value)) / 100);
    return (
      <svg width="74" height="74" viewBox="0 0 72 72" style={{ transform: 'rotate(135deg)' }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${filled} ${c}`} strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div className={`w-full flex flex-col h-auto ${isLight ? 'bg-zinc-100 text-zinc-900' : 'bg-black text-[var(--text-secondary)]'}`} style={{ minHeight: '780px' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)] bg-black shrink-0">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-60" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" /></span>
          <span className="text-[13px] font-sans font-black tracking-tight text-[var(--text-primary)]">Live Terminal</span>
          <span className="px-2 py-0.5 rounded bg-[var(--surface-3)] border border-[var(--border)] text-[11px] font-mono font-bold tracking-widest text-[var(--text-secondary)]">{ticker}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-black uppercase tracking-widest ${longGamma ? 'bg-[var(--success)]/10 border-[var(--success)]/40 text-[var(--success)]' : 'bg-[var(--danger)]/10 border-[var(--danger)]/40 text-[var(--danger)]'}`}>
            {longGamma ? <Shield className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-current" />}{longGamma ? 'Long γ' : 'Short γ'}
          </span>
          <div className="text-right">
            <div className="text-[15px] font-black tabular-nums text-[var(--text-primary)] leading-none">{spot ? spot.toFixed(decimals) : '—'}</div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">spot</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 h-full w-full overflow-hidden">
        {/* ── Chart pane ── */}
        <div className="flex-1 relative flex flex-col border-r border-[var(--border)] min-h-[420px] bg-black">
          <SlayerChart profile={profile} decimals={decimals} />
        </div>

        {/* ── Right column: Dealer GEX panel + ladder ── */}
        <div className="w-full lg:w-[430px] shrink-0 bg-black flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Activity className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              <span className="text-[11px] font-mono font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Dealer GEX</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">{profile.feed || 'live'}</span>
            </div>

            {/* Hero: gamma-pressure gauge + net gamma */}
            <div className="flex items-center gap-3 rounded-lg px-3 py-3 mb-3 border relative overflow-hidden" style={{ borderColor: longGamma ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)', background: longGamma ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.02))' : 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.02))' }}>
              <div className="relative w-[74px] h-[74px] shrink-0">
                <Gauge value={pressure} color={accent} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[19px] font-black tabular-nums leading-none" style={{ color: accent }}>{pressure}</div>
                  <div className="text-[7px] font-mono uppercase tracking-[0.15em] text-[var(--text-tertiary)] mt-0.5">γ force</div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Net Gamma Exposure</div>
                <div className="text-[24px] font-black tabular-nums leading-tight" style={{ color: accent }}>{netGex >= 0 ? '+' : '−'}{fmtBig(Math.abs(netGex))}</div>
                <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-widest" style={{ background: longGamma ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)', color: accent }}>
                  {longGamma ? <Shield className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-current" />}{pressureLabel}
                </span>
              </div>
            </div>

            {/* Dealer structure spectrum */}
            {structure && (
              <div className="mb-3">
                <div className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">Dealer Structure</div>
                <div className="relative h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.45), rgba(120,120,130,0.22), rgba(34,197,94,0.45))' }}>
                  {structure.pts.map((pt, i) => (
                    <div key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-3 rounded-full" style={{ left: `${pt.x}%`, background: pt.c }} title={pt.l} />
                  ))}
                  <div className="absolute -top-[5px] -translate-x-1/2 z-10" style={{ left: `${structure.spotPos}%` }}>
                    <div className="w-3 h-3 rotate-45 bg-white border border-black" style={{ boxShadow: '0 0 8px rgba(255,255,255,0.85)' }} />
                  </div>
                </div>
                <div className="relative h-7 mt-2">
                  {structure.pts.map((pt, i) => (
                    <div key={i} className="absolute -translate-x-1/2 text-center leading-tight" style={{ left: `${pt.x}%` }}>
                      <div className="text-[8px] font-mono font-black" style={{ color: pt.c }}>{pt.l}</div>
                      <div className="text-[8px] font-mono text-[var(--text-tertiary)] tabular-nums">{(pt.p as number).toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-read */}
            <div className="flex items-start gap-1.5 px-2.5 py-2 mb-3 rounded-md border border-[var(--border)] bg-white/[0.02]">
              <Crosshair className="w-3 h-3 mt-0.5 shrink-0" style={{ color: accent }} />
              <p className="text-[10px] font-mono leading-relaxed text-[var(--text-secondary)]">{insight}</p>
            </div>

            {/* Metric grid */}
            <div className="grid grid-cols-3 gap-2">
              <Tile label="γ Flip" value={flip ? flip.toFixed(decimals) : '—'} sub={aboveFlip == null ? undefined : aboveFlip ? 'above' : 'below'} color="var(--warning)" />
              <Tile label="Magnet" value={profile.magnet ? profile.magnet.toFixed(decimals) : '—'} sub={distLabel(profile.magnet)} color="#a855f7" />
              <Tile label="Exp Move" value={profile.expectedMovePct != null ? `±${(profile.expectedMovePct * 100).toFixed(2)}%` : '—'} color="var(--info)" />
              <Tile label="Call Wall" value={profile.callWall ? profile.callWall.toFixed(decimals) : '—'} sub={distLabel(profile.callWall)} color="var(--success)" />
              <Tile label="Put Wall" value={profile.putWall ? profile.putWall.toFixed(decimals) : '—'} sub={distLabel(profile.putWall)} color="var(--danger)" />
              <Tile label="C/P OI" value={profile.callPutOiRatio || (profile.totalCallOi && profile.totalPutOi ? (profile.totalCallOi / Math.max(1, profile.totalPutOi)).toFixed(2) : '—')} sub="bias" />
            </div>
          </div>

          {/* Exposure ladder */}
          <div className="px-3 py-2 border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <span className="flex items-center gap-1.5 text-[11px] font-mono font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]"><Layers className="w-3.5 h-3.5 text-[var(--accent-color)]" /> Exposure Ladder</span>
            <div className="flex border border-[var(--border)] rounded p-[2px]">
              {(['30', 'ALL'] as const).map(m => (
                <button key={m} onClick={() => setActiveLadder(m)} className={`px-2.5 py-0.5 text-[10px] font-black tracking-widest rounded transition-colors ${activeLadder === m ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>{m === '30' ? '30±' : 'ALL'}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[64px_1fr_1.3fr] gap-2 px-3 py-1.5 border-b border-[var(--border)] text-[10px] font-black font-mono tracking-widest text-[var(--text-tertiary)] shrink-0 uppercase">
            <div className="text-right pr-2 border-r border-[var(--border)]">Strike</div>
            <div className="flex justify-between"><span>Vol P</span><span className="text-[var(--text-secondary)]">Vol C</span></div>
            <div className="flex justify-between border-l border-[var(--border)] pl-2"><span className="text-[var(--danger)]">GEX P</span><span className="text-[var(--success)]">GEX C</span></div>
          </div>

          <div className="flex-1 overflow-y-auto python-scrollbar">
            <div className="flex flex-col py-1 min-h-full pb-8">
              {ladderData.map(row => (
                <div key={row.strike} className={`grid grid-cols-[64px_1fr_1.3fr] gap-2 px-3 h-[24px] items-center text-[11px] tabular-nums font-mono relative group ${row.isSpot ? 'bg-[var(--accent-color)]/10 border-y border-[var(--accent-color)]/30' : 'hover:bg-white/[0.03]'}`}>
                  {row.isSpot && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-color)]" />}
                  <div className="text-right pr-2 border-r border-[var(--border)] flex items-center justify-end gap-1">
                    {row.isCallWall && <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" title="Call Wall" />}
                    {row.isPutWall && <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" title="Put Wall" />}
                    {row.isFlip && <span className="w-1.5 h-1.5 rounded-sm bg-[var(--warning)]" title="Gamma Flip" />}
                    <span className={`font-black tracking-wider ${row.isSpot ? 'text-[var(--accent-color)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>{row.strike.toFixed(decimals)}</span>
                  </div>
                  <div className="flex items-center h-full relative border-r border-[var(--border)] pr-2">
                    <div className="w-1/2 h-full flex justify-end items-center pr-0.5 border-r border-dotted border-[var(--border)]"><div className="h-[9px] rounded-sm bg-[var(--text-tertiary)]" style={{ width: `${Math.min(100, Math.max(0, row.putVolPct))}%` }} /></div>
                    <div className="w-1/2 h-full flex justify-start items-center pl-0.5"><div className="h-[9px] rounded-sm bg-[var(--text-secondary)]" style={{ width: `${Math.min(100, Math.max(0, row.callVolPct))}%` }} /></div>
                  </div>
                  <div className="flex items-center h-full relative pl-2">
                    <div className="w-1/2 h-full flex justify-end items-center pr-0.5 border-r border-dotted border-[var(--border)]"><div className="h-[9px] rounded-sm bg-[var(--danger)]" style={{ width: `${Math.min(100, Math.max(0, row.putGexPct))}%` }} /></div>
                    <div className="w-1/2 h-full flex justify-start items-center pl-0.5"><div className="h-[9px] rounded-sm bg-[var(--success)]" style={{ width: `${Math.min(100, Math.max(0, row.callGexPct))}%` }} /></div>
                  </div>
                </div>
              ))}
              {ladderData.length === 0 && <div className="flex items-center justify-center py-12 text-[11px] font-mono text-[var(--text-tertiary)]"><Target className="w-4 h-4 mr-2" /> Awaiting dealer chain…</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
