import React from 'react';
import { useContractStore } from '../lib/store';
import { Crosshair, ShieldX, TrendingUp, TrendingDown, Minus, Clock, Waves, CheckCircle2, XCircle, Activity, Layers } from 'lucide-react';
import type { TradePlan } from '../lib/tradePlan';

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
      <div className="rounded-lg border border-black/60 bg-black/40 p-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 animate-pulse">Building trade plan…</p>
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
        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">{label} <span className="text-zinc-700">{weight}</span></span>
        <span className="text-[9px] font-bold tabular-nums" style={{ color: tone }}>{score}</span>
      </div>
      <div className="h-1.5 rounded-sm bg-black/50 overflow-hidden"><div className="h-full rounded-sm" style={{ width: `${score}%`, background: tone }} /></div>
    </div>
  );

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3 shadow-2xl" style={{ borderColor: `${dirTone}55`, background: `linear-gradient(180deg, ${dirTone}0D, rgba(0,0,0,0.55))` }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Crosshair className="w-4 h-4" style={{ color: dirTone }} />
        <h2 className="text-xs font-black tracking-widest uppercase text-[#E5E5E5]">Sky's Vision Plan — {plan.ticker} 0DTE</h2>
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
      <div className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-black/40 px-3 py-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Target Contract</span>
        <span className="text-[16px] font-black tabular-nums" style={{ color: dirTone }}>{plan.ticker} {plan.contract}</span>
      </div>

      {/* Labeled target ladder — Target | Reason */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 mb-0.5"><Layers className="w-3 h-3 text-zinc-400" /><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Targets</span></div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-center">
          <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Entry</span>
          <span className="text-[10px] tabular-nums text-zinc-300">{fmt(plan.entryZone[0])} – {fmt(plan.entryZone[1])}</span>
          <span className="text-[8px] uppercase tracking-widest text-zinc-600">current zone</span>
          {plan.targets.map((tg, i) => (
            <React.Fragment key={tg.reason}>
              <span className="text-[10px] font-bold tabular-nums" style={{ color: reasonTone[tg.reason] || '#E5E5E5' }}>TP{i + 1} {fmt(tg.price)}</span>
              <div className="h-1.5 rounded-sm bg-black/40 overflow-hidden"><div className="h-full rounded-sm" style={{ width: `${Math.min(100, Math.max(6, Math.abs(tg.distancePct) / 0.015 * 100))}%`, background: reasonTone[tg.reason] || '#888' }} /></div>
              <span className="text-[8px] uppercase tracking-widest" style={{ color: reasonTone[tg.reason] || '#A1A1AA' }}>{tg.reason}</span>
            </React.Fragment>
          ))}
          <span className="text-[8px] font-black uppercase tracking-widest text-[#F87171]">Stop</span>
          <span className="text-[10px] tabular-nums text-[#F87171]">{fmt(plan.stop)}</span>
          <span className="text-[8px] uppercase tracking-widest text-zinc-600">−0.5σ EM</span>
        </div>
      </div>

      {/* Technical readout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
        <div className="rounded border border-zinc-900 bg-black/30 px-2 py-1.5"><div className="text-zinc-600 uppercase tracking-widest text-[8px]">EMA Stack</div><div className="font-bold" style={{ color: t.emaAlignment === 'BULLISH' ? '#4ADE80' : t.emaAlignment === 'BEARISH' ? '#F87171' : '#A1A1AA' }}>{t.emaAlignment}</div></div>
        <div className="rounded border border-zinc-900 bg-black/30 px-2 py-1.5"><div className="text-zinc-600 uppercase tracking-widest text-[8px]">RSI 1m/5m/15m</div><div className="font-bold tabular-nums text-zinc-200">{t.rsi.m1}/{t.rsi.m5}/{t.rsi.m15}{t.rsi.allRising ? ' ↑' : ''}</div></div>
        <div className="rounded border border-zinc-900 bg-black/30 px-2 py-1.5"><div className="text-zinc-600 uppercase tracking-widest text-[8px]">TTM Squeeze</div><div className="font-bold" style={{ color: t.squeeze.firing ? '#4ADE80' : t.squeeze.squeezeOn ? '#FBBF24' : '#A1A1AA' }}>{t.squeeze.firing ? 'FIRING' : t.squeeze.squeezeOn ? 'COMPRESSED' : 'OFF'}</div></div>
        <div className="rounded border border-zinc-900 bg-black/30 px-2 py-1.5"><div className="text-zinc-600 uppercase tracking-widest text-[8px]">VWAP</div><div className="font-bold text-zinc-200">{t.vwapPosition}</div></div>
      </div>

      {/* Context flags */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[10px] border-t border-zinc-900/70 pt-2">
        <span className="flex items-center justify-between"><span className="text-zinc-500 uppercase tracking-widest text-[8px]">Hold</span><span className="tabular-nums text-zinc-300 flex items-center gap-1"><Clock className="w-3 h-3" />{plan.expectedHoldMin}m</span></span>
        <span className="flex items-center justify-between"><span className="text-zinc-500 uppercase tracking-widest text-[8px]">Flow</span><span className="font-bold" style={{ color: plan.dealerFlow.includes('Positive') ? '#4ADE80' : '#F87171' }}>{plan.dealerFlow.split(' ')[0]} γ</span></span>
        <span className="flex items-center justify-between"><span className="text-zinc-500 uppercase tracking-widest text-[8px]">Confirm</span><span className="flex items-center gap-1" style={{ color: plan.flowConfirmation ? '#4ADE80' : '#A1A1AA' }}>{plan.flowConfirmation ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{plan.flowConfirmation ? 'Yes' : 'No'}</span></span>
        <span className="flex items-center justify-between"><span className="text-zinc-500 uppercase tracking-widest text-[8px]">Win Rate</span><span className="tabular-nums font-bold" style={{ color: plan.winRate >= 65 ? '#4ADE80' : plan.winRate >= 50 ? '#FBBF24' : '#F87171' }}>{plan.winRate}%</span></span>
        <span className="flex items-center justify-between sm:col-span-2"><span className="text-zinc-500 uppercase tracking-widest text-[8px] flex items-center gap-1"><Activity className="w-3 h-3" />Trend</span><span className="text-zinc-300">{plan.trendRegime}</span></span>
      </div>

      <div className="flex flex-col gap-1 pt-1">
        {plan.rationale.map((r, i) => (
          <span key={i} className="text-[8.5px] text-zinc-500 leading-snug flex gap-1.5"><span className="text-zinc-700">›</span>{r}</span>
        ))}
      </div>
      <span className="text-[7.5px] text-zinc-600 uppercase tracking-widest">Composite engine · technical confirmed by dealer flow · not financial advice</span>
    </div>
  );
}
