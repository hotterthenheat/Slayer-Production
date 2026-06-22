import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { Zap, Layers } from 'lucide-react';
import { InstitutionalHUD } from './InstitutionalHUD';

const num = (v: any): v is number => typeof v === 'number' && isFinite(v);

export function DashboardView() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const marketState = useContractStore((s) => s.marketState);

  const confidence = num(serverState?.trade_health) ? serverState!.trade_health : null;
  const expectedMove = serverState?.expected_move?.pct ?? null;
  const expectedRange = serverState?.expected_move?.range ?? null;
  const dealerSupport = serverState?.position_management?.dealer_support ?? null;
  const momentum = serverState?.position_management?.momentum ?? null;

  // Single authoritative regime read for this screen, sourced from gex_profile.netGex
  // sign (long gamma => range-bound; short gamma => trending/unstable). Falls back to
  // the position-management momentum field, else AWAITING FEED.
  const netGex = serverState?.gex_profile?.netGex;
  const regimeLabel = useMemo(() => {
    if (num(netGex)) {
      return netGex >= 0 ? 'LONG GAMMA / RANGE-BOUND' : 'SHORT GAMMA / TREND-PRONE';
    }
    if (momentum === 'ACCELERATING') return 'TREND ACCELERATION (FROM MOMENTUM)';
    if (momentum) return 'RANGE DECAY (FROM MOMENTUM)';
    return 'AWAITING FEED';
  }, [netGex, momentum]);

  const dealerBiasLabel = useMemo(() => {
    if (!dealerSupport) return 'N/A';
    return dealerSupport === 'IMPROVING' ? 'SUPPORTIVE BIAS' : 'NEUTRAL / SYMMETRICAL';
  }, [dealerSupport]);

  // Guarded system-score reads (undefined >= n is false → must not render a definitive else-state)
  const sysScore = serverState?.system_score;
  const liquiditySweep = sysScore?.liquiditySweep;
  const htfAgreement = sysScore?.htfAgreement;
  const volRegime = sysScore?.volatilityRegime;

  return (
    <div className="w-full text-[var(--text-primary)] flex flex-col font-mono select-none antialiased space-y-6">

      {/* 1. HEADER CONTAINER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Zap className="w-4 h-4 text-[var(--success)]" />
          <span className="text-[10px] text-[var(--success)] uppercase tracking-widest font-black">
            SLAYER EXECUTIVE DASHBOARD / PORTFOLIO RECONCILIATION
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--surface-2)] p-1 px-1.5 border border-[var(--border)] rounded-lg">
          <span className={`w-1.5 h-1.5 rounded-full ${serverState ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`} />
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] px-2 font-black">
            {serverState ? 'STREAM CONNECTED' : 'AWAITING STREAM'}
          </span>
        </div>
      </div>

      {/* 2. PRIMARY HERO CARD */}
      <div className="w-full flex justify-center">
        <div
          className="max-w-3xl w-full apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between"
          style={{ minHeight: '340px' }}
        >
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[var(--success)] via-[var(--info)] to-[var(--success)]" />

          {/* Top Row Labeling */}
          <div className="flex justify-between items-start border-b border-[var(--border)] pb-4">
            <div className="text-left space-y-1">
              <span className="text-[10px] text-[var(--text-secondary)] tracking-[0.2em] uppercase font-black block">PRIMARY INTELLIGENCE</span>
              <h2 className="text-2xl font-black text-[var(--text-primary)] font-sans tracking-tight uppercase leading-none">
                MARKET STATE CORE OVERVIEW
              </h2>
            </div>
            <div className="text-right bg-[var(--surface-2)] px-2 py-1 border border-[var(--border)] rounded-lg text-[10px]">
              <span className="text-[var(--text-tertiary)] uppercase text-[10px] block">INDEX REF</span>
              <span className="text-[var(--text-primary)] font-extrabold block text-sm">{selectedAsset.ticker}</span>
            </div>
          </div>

          {/* Grid of Dashboard Hero Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch my-2">

            {/* Market State Block — single authoritative regime read */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-5 rounded-xl flex flex-col justify-between text-left">
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider uppercase block">CURRENT REGIME</span>
                <span className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)] font-sans uppercase block tracking-tight pt-1 leading-tight">
                  {regimeLabel}
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)] pt-3 border-t border-[var(--border)] leading-relaxed font-sans">
                Regime derived from dealer gamma sign in the current GEX profile feed.
              </div>
            </div>

            {/* Parameters Box */}
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-xl flex flex-col justify-center space-y-3.5 text-left">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border)]">
                <span className="text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider">EXPECTED MOVE</span>
                <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                  {expectedMove ?? 'N/A'} {expectedRange && <span className="text-[var(--text-secondary)] text-[10px]">({expectedRange})</span>}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border)]">
                <span className="text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider">TRADE HEALTH</span>
                <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                  {confidence ?? 'N/A'} {confidence != null && <span className="text-[var(--text-tertiary)] text-[10px]">/ 100</span>}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider">DEALER BIAS</span>
                <span className="font-extrabold text-[var(--text-primary)] uppercase">{dealerBiasLabel}</span>
              </div>
            </div>

          </div>

          {/* Bottom: data-source provenance (replaces unverifiable trust slogans) */}
          <div className="border-t border-[var(--border)] pt-4 flex flex-col sm:flex-row justify-between items-center text-[10px] text-[var(--text-tertiary)] gap-2">
            <span className="uppercase text-[10px] text-[var(--text-tertiary)] block font-bold">DATA SOURCE: {serverState?.data_source ?? 'NOT CONNECTED'}</span>
            <span className="font-black text-[var(--text-secondary)] px-2 py-0.5 border border-[var(--border)] bg-[var(--surface-2)] rounded uppercase">
              {serverState ? 'STREAM ACTIVE' : 'NO STREAM'}
            </span>
          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">

        {/* Card 1: Asset Core */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] text-[var(--text-secondary)] tracking-wider block font-bold uppercase">ASSET PROFILE</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">{selectedAsset.ticker}</h4>
            <div className="text-[11px] text-[var(--text-tertiary)] font-mono pt-1.5 space-y-1 border-t border-[var(--border)]">
              <div className="flex justify-between">
                <span>Spot Price:</span>
                <span className="text-[var(--text-primary)] font-bold tabular-nums">${(num(serverState?.pinpoint_map?.spot_price) ? serverState!.pinpoint_map!.spot_price! : selectedAsset.defaultPrice).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span>Volatility (σ):</span>
                <span className="text-[var(--text-primary)] tabular-nums">{(selectedAsset.volatility * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider font-bold">ASSET REFERENCE</span>
        </div>

        {/* Card 2: Dealer Exposure */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] text-[var(--info)] tracking-wider block font-bold uppercase">DEALER EXPOSURE</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">GEX BOUNDARIES</h4>
            <div className="text-[11px] text-[var(--text-tertiary)] font-mono pt-1.5 space-y-1 border-t border-[var(--border)]">
              <div className="flex justify-between">
                <span>Gamma State:</span>
                <span className="text-[var(--text-primary)] font-bold">{num(netGex) ? (netGex >= 0 ? 'POSITIVE GEX' : 'NEGATIVE GEX') : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Liquidity Sweep:</span>
                <span className="text-[var(--text-secondary)] font-bold">{num(liquiditySweep) ? (liquiditySweep >= 5 ? 'ELEVATED' : 'LOW') : 'N/A'}</span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider font-bold">FROM GEX PROFILE</span>
        </div>

        {/* Card 3: Quantitative Pipeline */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] text-[var(--text-secondary)] tracking-wider block font-bold uppercase">QUANT PIPELINE</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">SCORE MATRIX</h4>
            <div className="text-[11px] text-[var(--text-tertiary)] font-mono pt-1.5 space-y-1 border-t border-[var(--border)]">
              <div className="flex justify-between">
                <span>HTF Agreement:</span>
                <span className="text-[var(--text-primary)] font-bold">{num(htfAgreement) ? (htfAgreement >= 7 ? 'ALIGNED' : 'DIVERGENT') : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Vol Regime:</span>
                <span className="text-[var(--text-primary)]">{num(volRegime) ? (volRegime >= 6 ? 'STABLE' : 'EXPANDING') : 'N/A'}</span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider font-bold">FROM SYSTEM SCORE</span>
        </div>

        {/* Card 4: Market Timer status */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-3 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] text-[var(--text-secondary)] tracking-wider block font-bold uppercase">MARKET TIMER</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">SESSION CLOCK</h4>
            <div className="text-[11px] text-[var(--text-tertiary)] font-mono pt-1.5 space-y-1 border-t border-[var(--border)]">
              <div className="flex justify-between">
                <span>Market Hours:</span>
                <span className={marketState.open ? 'text-[var(--success)] font-bold' : 'text-[var(--text-tertiary)]'}>
                  {marketState.open ? 'OPEN' : 'CLOSED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Closing bell:</span>
                <span className="text-[var(--text-primary)] font-bold tabular-nums">{marketState.open ? marketState.closeIn : marketState.openIn}</span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider font-bold">SESSION STATE</span>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <Layers className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <h4 className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
            About This Dashboard
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-[var(--text-tertiary)] font-sans space-y-2">
          <p>
            This terminal maps options dealer-gamma structure (GEX), expected move and
            score-engine outputs from the live data feed. Regime and dealer-bias reads
            above are derived directly from the streamed GEX profile; where a field is
            not present in the current feed it is shown as N/A rather than estimated.
          </p>
          <p>
            Model-derived and sample panels are labelled MODEL or DEMO. Nothing here is
            investment advice or a guaranteed outcome.
          </p>
        </div>
      </div>

      {/* Institutional HUD Cockpit Panel */}
      <InstitutionalHUD />

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest pl-4 font-black shadow-md">
        <span>DATA SOURCE: {serverState?.data_source ?? 'NOT CONNECTED'}</span>
        <div className="flex items-center gap-1 pr-2">
          <span className={`h-1.5 w-1.5 rounded-full ${serverState ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`} />
          <span className="text-[var(--text-secondary)]">{serverState ? 'FEED ACTIVE' : 'NO FEED'}</span>
        </div>
      </div>

    </div>
  );
}
