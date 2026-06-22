import React from 'react';
import { useContractStore } from '../lib/store';
import { Crosshair, ShieldX, TrendingUp, TrendingDown, Minus, Clock, Waves, CheckCircle2, XCircle, Activity, Layers } from 'lucide-react';
import type { TradePlan } from '../lib/tradePlan';
import { optionExpiryLabel } from '../data';

/**
 * Sky's Vision Trade Plan — the composite output (40% technical / 30% dealer /
 * 20% contract / 10% learning) with labeled, reasoned targets (EMA projection,
 * liquidity sweep, loaded strike, GEX wall).
 */
export function TradePlanCard() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const plan = serverState?.trade_plan as TradePlan | undefined;
  const decimals = selectedAsset?.decimals ?? 2;
  const fmt = (v: number) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—');

  if (!plan) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] animate-pulse">Building trade plan…</p>
      </div>
    );
  }

  const dirTone = plan.direction === 'BULLISH' ? '#4ADE80' : plan.direction === 'BEARISH' ? '#F87171' : '#60A5FA';
  const DirIcon = plan.direction === 'BULLISH' ? TrendingUp : plan.direction === 'BEARISH' ? TrendingDown : Minus;
  const e = plan.engineScores;
  const t = plan.technical;
  const reasonTone: Record<string, string> = { 'EMA Projection': '#60A5FA', 'Liquidity Sweep': '#C084FC', 'Loaded Strike': '#D9A15C', 'GEX Wall': '#F87171' };

  const EngineBar = ({ label, weight, score, tone }: { label: string; weight: string; score: number; tone: string }) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">{label} <span className="text-[var(--text-tertiary)]">{weight}</span></span>
        <span className="text-[10px] font-bold tabular-nums" style={{ color: tone }}>{score}</span>
      </div>
      <div className="h-1.5 rounded-sm bg-[var(--surface)] overflow-hidden"><div className="h-full rounded-sm" style={{ width: `${score}%`, background: tone }} /></div>
    </div>
  );

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3 shadow-2xl" style={{ borderColor: `${dirTone}55`, background: `linear-gradient(180deg, ${dirTone}0D, var(--surface))` }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Crosshair className="w-4 h-4" style={{ color: dirTone }} />
        <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">Sky's Vision Plan — {plan.ticker} {optionExpiryLabel(selectedAsset)}</h2>
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm border ml-auto" style={{ color: dirTone, borderColor: `${dirTone}66`, background: `${dirTone}14` }}>
          <DirIcon className="w-3 h-3" /> {plan.direction} · {plan.confidence}%
        </span>
      </div>

      {/* Composite engine breakdown — 40 / 30 / 20 / 10 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <EngineBar label="Technical" weight="40%" score={e.technical} tone="#4ADE80" />
        <EngineBar label="Dealer" weight="30%" score={e.dealer} tone="#C084FC" />
        <EngineBar label="Contract" weight="20%" score={e.contract} tone="#D9A15C" />
        <EngineBar label="Learning" weight="10%" score={e.learning} tone="#60A5FA" />
      </div>

      {/* Headline contract */}
      <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Target Contract</span>
        <span className="text-[16px] font-black tabular-nums" style={{ color: dirTone }}>{plan.ticker} {plan.contract}</span>
      </div>

      {/* Labeled target ladder — Target | Reason */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 mb-0.5"><Layers className="w-3 h-3 text-[var(--text-secondary)]" /><span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Targets</span></div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Entry</span>
          <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">{fmt(plan.entryZone[0])} – {fmt(plan.entryZone[1])}</span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">current zone</span>
          {plan.targets.map((tg, i) => (
            <React.Fragment key={tg.reason}>
              <span className="text-[10px] font-bold tabular-nums" style={{ color: reasonTone[tg.reason] || 'var(--text-primary)' }}>TP{i + 1} {fmt(tg.price)}</span>
              <div className="h-1.5 rounded-sm bg-[var(--surface)] overflow-hidden"><div className="h-full rounded-sm" style={{ width: `${Math.min(100, Math.max(6, Math.abs(tg.distancePct) / 0.015 * 100))}%`, background: reasonTone[tg.reason] || '#888' }} /></div>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: reasonTone[tg.reason] || 'var(--text-tertiary)' }}>{tg.reason}</span>
            </React.Fragment>
          ))}
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)]">Stop</span>
          <span className="text-[10px] tabular-nums text-[var(--danger)]">{fmt(plan.stop)}</span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">−0.5σ EM</span>
        </div>
      </div>

      {/* Technical readout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"><div className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">EMA Stack</div><div className="font-bold" style={{ color: t.emaAlignment === 'BULLISH' ? 'var(--success)' : t.emaAlignment === 'BEARISH' ? 'var(--danger)' : 'var(--text-tertiary)' }}>{t.emaAlignment}</div></div>
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"><div className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">RSI 1m/5m/15m</div><div className="font-bold tabular-nums text-[var(--text-secondary)]">{t.rsi.m1}/{t.rsi.m5}/{t.rsi.m15}{t.rsi.allRising ? ' ↑' : ''}</div></div>
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"><div className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">TTM Squeeze</div><div className="font-bold" style={{ color: t.squeeze.firing ? 'var(--success)' : t.squeeze.squeezeOn ? 'var(--warning)' : 'var(--text-tertiary)' }}>{t.squeeze.firing ? 'FIRING' : t.squeeze.squeezeOn ? 'COMPRESSED' : 'OFF'}</div></div>
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"><div className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">VWAP</div><div className="font-bold text-[var(--text-secondary)]">{t.vwapPosition}</div></div>
      </div>

      {/* Context flags */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[10px] border-t border-[var(--border)] pt-2">
        <span className="flex items-center justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">Hold</span><span className="tabular-nums text-[var(--text-secondary)] flex items-center gap-1"><Clock className="w-3 h-3" />{plan.expectedHoldMin}m</span></span>
        <span className="flex items-center justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">Flow</span><span className="font-bold" style={{ color: plan.dealerFlow.includes('Positive') ? 'var(--success)' : 'var(--danger)' }}>{plan.dealerFlow.split(' ')[0]} γ</span></span>
        <span className="flex items-center justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">Confirm</span><span className="flex items-center gap-1" style={{ color: plan.flowConfirmation ? 'var(--success)' : 'var(--text-tertiary)' }}>{plan.flowConfirmation ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{plan.flowConfirmation ? 'Yes' : 'No'}</span></span>
        <span className="flex items-center justify-between"><span className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px]">Win Rate</span><span className="tabular-nums font-bold" style={{ color: plan.winRate >= 65 ? 'var(--success)' : plan.winRate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{plan.winRate}%</span></span>
        <span className="flex items-center justify-between sm:col-span-2"><span className="text-[var(--text-tertiary)] uppercase tracking-widest text-[10px] flex items-center gap-1"><Activity className="w-3 h-3" />Trend</span><span className="text-[var(--text-secondary)]">{plan.trendRegime}</span></span>
      </div>

      <div className="flex flex-col gap-1 pt-1">
        {plan.rationale.map((r, i) => (
          <span key={i} className="text-[10px] text-[var(--text-tertiary)] leading-snug flex gap-1.5"><span className="text-[var(--text-tertiary)]">›</span>{r}</span>
        ))}
      </div>
      <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">Composite engine · technical confirmed by dealer flow · not financial advice</span>
    </div>
  );
}
