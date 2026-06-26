import { useMemo, useState } from 'react';
import { GexProfileData } from '../types';
import { useContractStore } from '../lib/store';
import { SlayerChart } from './SlayerChart';
import { Activity, Shield, Zap, Layers, Target } from 'lucide-react';

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
  const dist = (lvl?: number) => (lvl && spot ? ((lvl - spot) / spot) * 100 : null);
  const distLabel = (lvl?: number) => { const d = dist(lvl); return d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`; };

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

  const accent = longGamma ? 'var(--success)' : 'var(--danger)';

  const Tile = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <div className="border border-[var(--border)] rounded-md px-2.5 py-2 bg-white/[0.015]">
      <div className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{label}</div>
      <div className="text-[15px] font-black tabular-nums leading-tight mt-1" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[9px] font-mono text-[var(--text-tertiary)] mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );

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
        <div className="w-full lg:w-[420px] shrink-0 bg-black flex flex-col overflow-hidden">
          {/* Dealer GEX dashboard */}
          <div className="p-3 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Activity className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              <span className="text-[11px] font-mono font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Dealer GEX</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">{profile.feed || 'live'}</span>
            </div>

            {/* Net GEX hero */}
            <div className="rounded-md px-3 py-2.5 mb-2 border" style={{ borderColor: longGamma ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)', background: longGamma ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Net Gamma Exposure</div>
                  <div className="text-[22px] font-black tabular-nums leading-tight" style={{ color: accent }}>{netGex >= 0 ? '+' : '−'}{fmtBig(Math.abs(netGex))}</div>
                </div>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-black uppercase tracking-widest" style={{ background: longGamma ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: accent }}>
                  {longGamma ? <Shield className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-current" />}{longGamma ? 'Long γ' : 'Short γ'}
                </span>
              </div>
              <div className="text-[9px] font-mono text-[var(--text-tertiary)] mt-1">Dealers {longGamma ? 'dampen' : 'amplify'} moves · {aboveFlip == null ? '' : aboveFlip ? 'spot above flip' : 'spot below flip'}</div>
            </div>

            {/* Metric grid */}
            <div className="grid grid-cols-2 gap-2">
              <Tile label="γ Flip" value={flip ? flip.toFixed(decimals) : '—'} sub={aboveFlip == null ? undefined : aboveFlip ? 'spot above' : 'spot below'} color="var(--warning)" />
              <Tile label="Magnet" value={profile.magnet ? profile.magnet.toFixed(decimals) : '—'} sub={distLabel(profile.magnet)} color="#a855f7" />
              <Tile label="Call Wall" value={profile.callWall ? profile.callWall.toFixed(decimals) : '—'} sub={distLabel(profile.callWall)} color="var(--success)" />
              <Tile label="Put Wall" value={profile.putWall ? profile.putWall.toFixed(decimals) : '—'} sub={distLabel(profile.putWall)} color="var(--danger)" />
              <Tile label="Exp. Move" value={profile.expectedMovePct != null ? `±${(profile.expectedMovePct * 100).toFixed(2)}%` : '—'} sub={profile.expectedMovePct != null && spot ? `${(spot * (1 - profile.expectedMovePct)).toFixed(0)} – ${(spot * (1 + profile.expectedMovePct)).toFixed(0)}` : undefined} color="var(--info)" />
              <Tile label="Call / Put OI" value={profile.callPutOiRatio || (profile.totalCallOi && profile.totalPutOi ? (profile.totalCallOi / Math.max(1, profile.totalPutOi)).toFixed(2) : '—')} sub="bias" />
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
