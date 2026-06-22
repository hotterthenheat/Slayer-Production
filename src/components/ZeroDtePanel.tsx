import React from 'react';
import { useContractStore } from '../lib/store';
import { Timer, Crosshair, Magnet, AlertTriangle } from 'lucide-react';
import type { ZeroDteResult } from '../lib/zeroDte';
import { probExpireITM, probabilityOfTouch } from '../lib/zeroDte';
import { PanelSkeleton } from './PanelSkeleton';
import { optionExpiryLabel } from '../data';

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
  const expiryLabel = selectedAsset ? optionExpiryLabel(selectedAsset) : '0DTE';

  const fmt = (v: number) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—');
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  if (!z || !gex || !(gex.spot > 0)) {
    return <PanelSkeleton label={`${expiryLabel} Probabilities`} />;
  }

  const spot = gex.spot;
  const eod = z.expectedMove.find((b) => b.horizon === 'EOD');
  const oneH = z.expectedMove.find((b) => b.horizon === '1H');
  const callWall = gex.callWall > 0 ? gex.callWall : 0;
  const putWall = gex.putWall > 0 ? gex.putWall : 0;

  // Touch probabilities to the walls + ATM ITM, from the same iv / time-to-close.
  // Skip walls the dealer engine hasn't resolved yet (0/undefined) so we never render
  // a nonsensical "wall 0" row or feed an invalid barrier into the first-passage math.
  const potCall = callWall > 0 ? probabilityOfTouch(spot, callWall, z.T, z.atmIv) : 0;
  const potPut = putWall > 0 ? probabilityOfTouch(spot, putWall, z.T, z.atmIv) : 0;
  const atmCallITM = probExpireITM(spot, Math.round(spot), z.T, z.atmIv, true);

  // Resolve theme tokens once so inline-styled colors track the design system.
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string, f: string) => { const v = css.getPropertyValue(n).trim(); return v || f; };
  const C = { success: tok('--success', '#4ADE80'), danger: tok('--danger', '#F87171'), warning: tok('--warning', '#FBBF24'), info: tok('--info', '#60A5FA'), textPrimary: tok('--text-primary', '#E5E5E5') };

  const walls = [
    { label: 'Call Wall', strike: callWall, p: potCall, tone: C.danger },
    { label: 'Put Wall', strike: putWall, p: potPut, tone: C.success },
  ].filter((w) => w.strike > 0);

  const Cell = ({ label, value, sub, tone = C.textPrimary }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] leading-tight">{label}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none" style={{ color: tone }}>{value}</span>
      {sub && <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{sub}</span>}
    </div>
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4" style={{ borderLeftColor: 'var(--warning)', borderLeftWidth: '3px' }}>
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
        <Timer className="w-4 h-4 text-[var(--warning)]" />
        <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">{expiryLabel} Probabilities — {selectedAsset?.ticker}</h2>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest ml-auto">{z.hoursToClose.toFixed(1)}h to close · ATM IV {(z.atmIv * 100).toFixed(1)}%</span>
      </div>

      {/* Expected move bands */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cell label="1H Expected Move" value={oneH ? `±${fmt(oneH.movePts)}` : '—'} sub={oneH ? `${(oneH.movePct * 100).toFixed(2)}%` : ''} tone={C.info} />
        <Cell label="EOD Expected Move" value={eod ? `±${fmt(eod.movePts)}` : '—'} sub={eod ? `${(eod.movePct * 100).toFixed(2)}%` : ''} tone={C.info} />
        <Cell label="EOD ±1σ Band" value={eod ? `${fmt(eod.lower1)}–${fmt(eod.upper1)}` : '—'} />
        <Cell label="EOD ±2σ Band" value={eod ? `${fmt(eod.lower2)}–${fmt(eod.upper2)}` : '—'} />
      </div>

      {/* Pin / magnet / settlement */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cell label="Strike Pin Probability" value={pct(z.pin.pinProbability)} sub={`magnet ${fmt(z.pin.magnet)}`} tone={z.pin.pinProbability >= 0.5 ? C.success : C.warning} />
        <Cell label="EOD Pin Target" value={fmt(z.eodMagnet)} sub="positive-gamma gravity zone" tone="#D9A15C" />
        <Cell label="ATM chance of expiring ITM" value={pct(atmCallITM)} sub="risk-neutral probability" />
        <Cell label="Settlement Risk" value={pct(z.settlementRiskPct)} sub="P(|move| > 1 EM)" tone="#FB923C" />
      </div>

      {/* Probability of touch to the walls */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><Crosshair className="w-3 h-3 text-[var(--text-tertiary)]" /><h3 className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">Chance of price reaching dealer walls today</h3></div>
        {walls.length === 0 && <span className="text-[10px] text-[var(--text-tertiary)]">Dealer walls not yet resolved.</span>}
        {walls.map(({ label, strike, p, tone }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] font-bold w-24 shrink-0" style={{ color: tone }}>{label} {fmt(strike)}</span>
            <div className="flex-1 h-2 rounded-sm bg-[var(--surface-3)] overflow-hidden">
              <div className="h-full rounded-sm" style={{ width: `${Math.round(p * 100)}%`, background: tone }} />
            </div>
            <span className="text-[10px] tabular-nums w-9 text-right" style={{ color: tone }}>{pct(p)}</span>
          </div>
        ))}
      </div>

      {z.pin.pinProbability >= 0.55 && (
        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--success)] bg-[var(--success)]/10 border border-[var(--success)]/40 rounded px-3 py-2">
          <Magnet className="w-3.5 h-3.5" /> High pin risk into the close — price likely to gravitate toward {fmt(z.pin.magnet)}.
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
