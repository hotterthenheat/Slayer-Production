import React from 'react';
import { useContractStore } from '../lib/store';
import { Crosshair, Target, ShieldX, TrendingUp, TrendingDown, Minus, Clock, Waves, CheckCircle2, XCircle, Activity } from 'lucide-react';
import type { TradePlan } from '../lib/tradePlan';

/**
 * Sky's Vision Trade Plan — the structured, actionable 0DTE plan synthesized from
 * the dealer/regime/expected-move stack (direction, confidence, target contract,
 * entry/stop/targets, expected hold, dealer flow, flow confirmation, regime, win
 * rate). Replaces the bare "bullish = buy calls".
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
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 animate-pulse">Synthesizing trade plan…</p>
      </div>
    );
  }

  const dirTone = plan.direction === 'BULLISH' ? '#4ADE80' : plan.direction === 'BEARISH' ? '#F87171' : '#60A5FA';
  const DirIcon = plan.direction === 'BULLISH' ? TrendingUp : plan.direction === 'BEARISH' ? TrendingDown : Minus;

  const Row = ({ icon, label, value, tone = '#E5E5E5' }: { icon: React.ReactNode; label: string; value: string; tone?: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-900/70">
      <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-500">{icon}{label}</span>
      <span className="text-[11px] font-bold tabular-nums" style={{ color: tone }}>{value}</span>
    </div>
  );

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3 shadow-2xl" style={{ borderColor: `${dirTone}55`, background: `linear-gradient(180deg, ${dirTone}0D, rgba(0,0,0,0.55))` }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Crosshair className="w-4 h-4" style={{ color: dirTone }} />
        <h2 className="text-xs font-black tracking-widest uppercase text-[#E5E5E5]">Sky's Vision Plan — {plan.ticker} 0DTE</h2>
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm border ml-auto"
          style={{ color: dirTone, borderColor: `${dirTone}66`, background: `${dirTone}14` }}>
          <DirIcon className="w-3 h-3" /> {plan.direction}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 w-20 shrink-0">Confidence</span>
        <div className="flex-1 h-2.5 rounded-sm bg-black/50 overflow-hidden">
          <div className="h-full rounded-sm transition-all" style={{ width: `${plan.confidence}%`, background: dirTone }} />
        </div>
        <span className="text-[12px] font-bold tabular-nums w-10 text-right" style={{ color: dirTone }}>{plan.confidence}%</span>
      </div>

      {/* Headline contract */}
      <div className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-black/40 px-3 py-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Target Contract</span>
        <span className="text-[16px] font-black tabular-nums" style={{ color: dirTone }}>{plan.ticker} {plan.contract}</span>
      </div>

      {/* Structured levels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Row icon={<Target className="w-3 h-3 text-zinc-500" />} label="Entry Zone" value={`${fmt(plan.entryZone[0])} – ${fmt(plan.entryZone[1])}`} />
        <Row icon={<ShieldX className="w-3 h-3 text-[#F87171]" />} label="Stop" value={fmt(plan.stop)} tone="#F87171" />
        <Row icon={<TrendingUp className="w-3 h-3 text-[#4ADE80]" />} label="TP1" value={fmt(plan.tp1)} tone="#4ADE80" />
        <Row icon={<TrendingUp className="w-3 h-3 text-[#4ADE80]" />} label="TP2" value={fmt(plan.tp2)} tone="#4ADE80" />
        <Row icon={<Clock className="w-3 h-3 text-zinc-500" />} label="Expected Hold" value={`${plan.expectedHoldMin} min`} />
        <Row icon={<Waves className="w-3 h-3 text-[#C084FC]" />} label="Dealer Flow" value={plan.dealerFlow} tone={plan.dealerFlow.includes('Positive') ? '#4ADE80' : '#F87171'} />
        <Row
          icon={plan.flowConfirmation ? <CheckCircle2 className="w-3 h-3 text-[#4ADE80]" /> : <XCircle className="w-3 h-3 text-zinc-500" />}
          label="Flow Confirmation" value={plan.flowConfirmation ? 'Yes' : 'No'} tone={plan.flowConfirmation ? '#4ADE80' : '#A1A1AA'} />
        <Row icon={<Activity className="w-3 h-3 text-zinc-500" />} label="Trend Regime" value={plan.trendRegime} />
        <Row icon={<TrendingUp className="w-3 h-3 text-zinc-500" />} label="Win Rate (calibrated)" value={`${plan.winRate}%`} tone={plan.winRate >= 65 ? '#4ADE80' : plan.winRate >= 50 ? '#FBBF24' : '#F87171'} />
      </div>

      {/* Rationale */}
      <div className="flex flex-col gap-1 pt-1">
        {plan.rationale.map((r, i) => (
          <span key={i} className="text-[8.5px] text-zinc-500 leading-snug flex gap-1.5"><span className="text-zinc-700">›</span>{r}</span>
        ))}
      </div>
      <span className="text-[7.5px] text-zinc-600 uppercase tracking-widest">Model-derived plan · not financial advice · sharpens as live flow / history accrue</span>
    </div>
  );
}
