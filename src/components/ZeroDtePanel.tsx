import React from 'react';
import { useContractStore } from '../lib/store';
import { Timer, Crosshair, Magnet, AlertTriangle } from 'lucide-react';
import type { ZeroDteResult } from '../lib/zeroDte';
import { probExpireITM, probabilityOfTouch } from '../lib/zeroDte';

/**
 * 0DTE Probabilities — expected-move bands, strike-pinning probability, end-of-day
 * magnet target and settlement risk (streamed), plus probability-of-touch to the
 * dealer walls and ATM probability-of-expiring-ITM (computed from the same iv/T).
 */
export function ZeroDtePanel() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const decimals = selectedAsset?.decimals ?? 2;
  const z = serverState?.zerodte as ZeroDteResult | undefined;
  const gex = serverState?.gex_profile;

  const fmt = (v: number) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—');
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  if (!z || !gex) {
    return (
      <div className="rounded-lg border border-black/60 bg-black/40 p-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 animate-pulse">Computing 0DTE probabilities…</p>
      </div>
    );
  }

  const spot = gex.spot;
  const eod = z.expectedMove.find((b) => b.horizon === 'EOD');
  const oneH = z.expectedMove.find((b) => b.horizon === '1H');
  const callWall = gex.callWall, putWall = gex.putWall;

  // Touch probabilities to the walls + ATM ITM, from the same iv / time-to-close.
  const potCall = probabilityOfTouch(spot, callWall, z.T, z.atmIv);
  const potPut = probabilityOfTouch(spot, putWall, z.T, z.atmIv);
  const atmCallITM = probExpireITM(spot, Math.round(spot), z.T, z.atmIv, true);

  const Cell = ({ label, value, sub, tone = '#E5E5E5' }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="rounded-md border border-zinc-800/50 bg-black/35 p-2.5 flex flex-col gap-0.5">
      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 leading-tight">{label}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none" style={{ color: tone }}>{value}</span>
      {sub && <span className="text-[8px] text-zinc-500 tabular-nums">{sub}</span>}
    </div>
  );

  return (
    <div className="rounded-lg border border-black/60 bg-black/30 p-4 flex flex-col gap-4 shadow-inner">
      <div className="flex items-center gap-2">
        <Timer className="w-4 h-4 text-[#60A5FA]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[#E5E5E5]">0DTE Probabilities — {selectedAsset?.ticker}</h2>
        <span className="text-[8px] text-zinc-500 uppercase tracking-widest ml-auto">{z.hoursToClose.toFixed(1)}h to close · ATM IV {(z.atmIv * 100).toFixed(1)}%</span>
      </div>

      {/* Expected move bands */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cell label="1H Expected Move" value={oneH ? `±${fmt(oneH.movePts)}` : '—'} sub={oneH ? `${(oneH.movePct * 100).toFixed(2)}%` : ''} tone="#60A5FA" />
        <Cell label="EOD Expected Move" value={eod ? `±${fmt(eod.movePts)}` : '—'} sub={eod ? `${(eod.movePct * 100).toFixed(2)}%` : ''} tone="#60A5FA" />
        <Cell label="EOD ±1σ Band" value={eod ? `${fmt(eod.lower1)}–${fmt(eod.upper1)}` : '—'} />
        <Cell label="EOD ±2σ Band" value={eod ? `${fmt(eod.lower2)}–${fmt(eod.upper2)}` : '—'} />
      </div>

      {/* Pin / magnet / settlement */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cell label="Strike Pin Probability" value={pct(z.pin.pinProbability)} sub={`magnet ${fmt(z.pin.magnet)}`} tone={z.pin.pinProbability >= 0.5 ? '#4ADE80' : '#FBBF24'} />
        <Cell label="EOD Magnet Target" value={fmt(z.eodMagnet)} sub="positive-γ center of mass" tone="#D9A15C" />
        <Cell label="ATM P(expire ITM)" value={pct(atmCallITM)} sub="risk-neutral N(d2)" />
        <Cell label="Settlement Risk" value={pct(z.settlementRiskPct)} sub="P(|move| > 1 EM)" tone="#FB923C" />
      </div>

      {/* Probability of touch to the walls */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><Crosshair className="w-3 h-3 text-zinc-400" /><h3 className="text-[9px] font-black tracking-widest uppercase text-zinc-400">Probability of Touch (to dealer walls)</h3></div>
        {[{ label: 'Call Wall', strike: callWall, p: potCall, tone: '#F87171' }, { label: 'Put Wall', strike: putWall, p: potPut, tone: '#4ADE80' }].map(({ label, strike, p, tone }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[9px] font-bold w-24 shrink-0" style={{ color: tone }}>{label} {fmt(strike)}</span>
            <div className="flex-1 h-2 rounded-sm bg-black/50 overflow-hidden">
              <div className="h-full rounded-sm" style={{ width: `${Math.round(p * 100)}%`, background: tone }} />
            </div>
            <span className="text-[9px] tabular-nums w-9 text-right" style={{ color: tone }}>{pct(p)}</span>
          </div>
        ))}
      </div>

      {z.pin.pinProbability >= 0.55 && (
        <div className="flex items-center gap-2 text-[10px] font-bold text-[#4ADE80] bg-[#4ADE80]/10 border border-[#4ADE80]/40 rounded px-3 py-2">
          <Magnet className="w-3.5 h-3.5" /> Elevated pin risk into the close — price gravitating to {fmt(z.pin.magnet)}.
        </div>
      )}
      {z.settlementRiskPct > 0.4 && (
        <div className="flex items-center gap-2 text-[10px] font-bold text-[#FB923C] bg-[#FB923C]/10 border border-[#FB923C]/40 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5" /> Wide settlement distribution — size for a larger close-out move.
        </div>
      )}
    </div>
  );
}
