import { useState } from 'react';
import { useContractStore } from '../lib/store';
import {
  ShieldAlert, TrendingUp, Magnet, Activity, Zap, Layers, Hexagon, Terminal
} from 'lucide-react';
import { fmtNum } from '../lib/format';

const num = (v: any): v is number => typeof v === 'number' && isFinite(v);

function fmtBig(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

export function InstitutionalDashboard() {
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const serverState = useContractStore(s => s.serverState);

  const ticker = selectedAsset.ticker || 'SPX';
  const profile = serverState?.gex_profile;
  const dynamics = serverState?.dealer_dynamics;
  const deep = serverState?.deep_intelligence;
  const spot = num(profile?.spot) ? profile!.spot! : selectedAsset.defaultPrice || 5000;

  const [simulatorStrike, setSimulatorStrike] = useState(Math.round(spot / 25) * 25);

  // Dealer positioning derived strictly from the real net-GEX sign (guarded).
  const netGex = profile?.netGex;
  const gexKnown = num(netGex);
  const dealerBias = gexKnown ? (netGex! >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA') : null;

  return (
    <div className="w-full space-y-4 font-mono antialiased" id="institutional-dashboard-root">

      {/* 1. Market Regime & Dealer Behavior Engine */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Dealer Behavior Engine — sourced from gex_profile.netGex sign */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col justify-between hover:border-[var(--border-strong)] transition-colors shadow-lg">
          <div className="flex justify-between items-center mb-3 border-b border-[var(--border)] pb-2">
            <div className="flex items-center gap-2">
              <Hexagon className="w-4 h-4 text-[var(--info)]" />
              <span className="text-[10px] font-black tracking-widest uppercase text-[var(--info)]">DEALER BEHAVIOR ENGINE</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider">DEALER POSITIONING</span>
                <div className={`text-[12px] font-bold ${dealerBias === 'LONG GAMMA' ? 'text-[var(--success)]' : dealerBias === 'SHORT GAMMA' ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}`}>{dealerBias ?? 'N/A'}</div>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider">CURRENT REGIME</span>
                <div className="text-[12px] font-bold text-[var(--text-primary)]">{dealerBias == null ? 'N/A' : dealerBias === 'LONG GAMMA' ? 'RANGE BOUND' : 'DYNAMIC INSTABILITY'}</div>
              </div>
            </div>

            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-3 space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase mt-0.5">Expected Behavior</span>
                <span className="text-[10px] text-[var(--text-secondary)] font-black uppercase text-right leading-tight whitespace-pre-line">
                  {dealerBias == null ? 'Awaiting feed' : dealerBias === 'LONG GAMMA' ? 'Buy dips\nSell rips' : 'Amplify moves\nSell into weakness'}
                </span>
              </div>
              <div className="h-px bg-[var(--border)] w-full" />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">Wall Range</span>
                <span className="text-[11px] font-mono text-[var(--text-primary)] font-black uppercase tabular-nums">
                  {num(profile?.putWall) && num(profile?.callWall) ? `${fmtNum(profile!.putWall!)} - ${fmtNum(profile!.callWall!)}` : 'N/A'}
                </span>
              </div>
              <div className="h-px bg-[var(--border)] w-full" />
              <div className="grid grid-cols-2 gap-2 text-center pt-1.5">
                <div>
                  <div className="text-[15px] font-black text-[var(--info)] tabular-nums">
                    {num(profile?.expectedMovePct) ? `±${profile!.expectedMovePct!.toFixed(2)}%` : 'N/A'}
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest mt-0.5">Expected Move</div>
                </div>
                <div>
                  <div className="text-[15px] font-black text-[var(--text-primary)] tabular-nums">
                    {num(profile?.gammaFlip) ? fmtNum(profile!.gammaFlip!) : 'N/A'}
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest mt-0.5">Gamma Flip</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Forced Hedging / Vanna-Charm Detector — sourced from dealer_dynamics */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col justify-between hover:border-[var(--border-strong)] transition-colors shadow-lg">
          <div className="flex justify-between items-center mb-3 border-b border-[var(--border)] pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--warning)]" />
              <span className="text-[10px] font-black tracking-widest uppercase text-[var(--warning)]">FORCED HEDGING DETECTOR</span>
            </div>
            {!dynamics && <span className="text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--text-tertiary)] rounded-sm">NO FEED</span>}
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] tracking-wider">VANNA HEDGE FLOW</span>
              <div className="text-[12px] font-bold text-[var(--text-primary)]">{dynamics?.vanna?.hedgeFlow ?? 'N/A'}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded-sm text-center">
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1">NET VANNA</span>
                <span className="text-[11px] font-mono font-bold text-[var(--warning)] tabular-nums">
                  {num(dynamics?.vanna?.net) ? fmtBig(dynamics!.vanna.net) : 'N/A'}
                </span>
              </div>
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded-sm text-center">
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-1">CHARM / DAY</span>
                <span className="text-[11px] font-mono font-bold text-[var(--info)] tabular-nums">
                  {num(dynamics?.charm?.netPerDay) ? fmtBig(dynamics!.charm.netPerDay) : 'N/A'}
                </span>
              </div>
            </div>

            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-3 mt-1 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] font-black tracking-widest uppercase block mb-0.5">GAMMA HEDGING STATE</span>
                <span className="text-[14px] text-[var(--text-primary)] font-black uppercase">{dynamics?.gamma?.state?.replace(/_/g, ' ') ?? 'N/A'}</span>
              </div>
              <Activity className="w-6 h-6 text-[var(--warning)]" />
            </div>
          </div>
        </div>

        {/* Liquidity Magnet & Charm Bias */}
        <div className="flex flex-col gap-3 h-full">
          {/* Liquidity Magnet — sourced from gex_profile.magnet */}
          <div className="bg-[var(--surface)] border border-[var(--border)] p-3.5 rounded-lg flex-1 shadow-lg flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2 border-b border-[var(--border)] pb-1.5">
              <span className="text-[10px] font-black tracking-widest uppercase text-[var(--info)] flex items-center gap-1.5"><Magnet className="w-3.5 h-3.5" /> LIQUIDITY MAGNET</span>
            </div>
            <div className="flex items-center justify-between px-2 pt-1">
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-0.5">Gamma Magnet Strike</span>
                <span className="text-[18px] font-mono font-black text-[var(--info)] tabular-nums">{num(profile?.magnet) ? fmtNum(profile!.magnet!) : 'N/A'}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-0.5">Spot</span>
                <span className="text-[12px] font-bold text-[var(--text-primary)] tabular-nums">{fmtNum(spot)}</span>
              </div>
            </div>
          </div>

          {/* Charm Bias Meter — sourced from dealer_dynamics.charm */}
          <div className="bg-[var(--surface)] border border-[var(--border)] p-3.5 rounded-lg flex-1 shadow-lg flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2 border-b border-[var(--border)] pb-1.5">
              <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)] flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> CHARM BIAS</span>
            </div>
            <div className="flex items-center justify-between px-2 mt-1">
              <div>
                <span className={`text-[18px] font-black uppercase tracking-tight transition-colors duration-300 ${
                  dynamics?.charm?.bias === 'BULLISH' ? 'text-[var(--success)]' : dynamics?.charm?.bias === 'BEARISH' ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'
                }`}>{dynamics?.charm?.bias ?? 'N/A'}</span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-medium block mt-0.5 tracking-wider">{dynamics?.charm?.note ?? 'Time-decay hedging flow.'}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Strike Accumulation Engine — sourced from gex_profile.strikes (top by net GEX magnitude) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-[var(--border)] pb-2">
            <TrendingUp className="w-4 h-4 text-[var(--success)]" />
            <span className="text-[10px] font-black tracking-widest uppercase text-[var(--success)]">STRIKE ACCUMULATION ENGINE</span>
            {!Array.isArray(profile?.strikes) && <span className="text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--text-tertiary)] rounded-sm">NO FEED</span>}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded-sm text-center">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-0.5">CALL WALL</span>
              <span className="text-[12px] font-mono font-bold text-[var(--text-primary)] tabular-nums">{num(profile?.callWall) ? fmtNum(profile!.callWall!) : 'N/A'}</span>
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded-sm text-center">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-0.5">TOTAL CALL OI</span>
              <span className="text-[12px] font-mono font-bold text-[var(--success)] tabular-nums">{num(profile?.totalCallOi) ? fmtBig(profile!.totalCallOi!) : 'N/A'}</span>
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded-sm text-center">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase block mb-0.5">C/P OI RATIO</span>
              <span className="text-[12px] font-mono font-bold text-[var(--warning)] tabular-nums">{profile?.callPutOiRatio ?? 'N/A'}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-widest block mb-2 px-1">HIGHEST GEX STRIKES</span>
            {(Array.isArray(profile?.strikes) ? [...profile!.strikes!]
              .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
              .slice(0, 3) : []).map((st, i) => {
                const isCall = st.netGex >= 0;
                return (
                  <div key={i} className="flex justify-between items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-2.5 cursor-default hover:border-[var(--border-strong)] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-[var(--text-tertiary)] tabular-nums">#{i + 1}</span>
                      <span className={`text-[12px] font-black font-mono tabular-nums ${isCall ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{fmtNum(st.strike)} {isCall ? 'CALL' : 'PUT'}</span>
                    </div>
                    <div className="flex gap-4 text-right">
                      <span className="text-[11px] font-mono text-[var(--text-primary)] font-medium tracking-wide tabular-nums">{fmtBig(st.netGex)}</span>
                      <span className="text-[11px] font-mono text-[var(--text-tertiary)] w-16 tabular-nums">OI {fmtBig(st.callOi + st.putOi)}</span>
                    </div>
                  </div>
                );
              })}
            {!Array.isArray(profile?.strikes) && (
              <div className="text-[11px] text-[var(--text-tertiary)] italic px-1 py-2">No strike profile in current feed.</div>
            )}
          </div>
        </div>

        {/* Position Simulator — explicitly labelled MODEL (illustrative scenarios) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-[var(--border)] pb-2">
            <Layers className="w-4 h-4 text-[var(--info)]" />
            <span className="text-[10px] font-black tracking-widest uppercase text-[var(--info)]">POSITION SIMULATOR</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--warning)] rounded-sm uppercase">MODEL</span>
          </div>

          <div className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-3 mb-4">
            <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase">Scenario Strike</span>
            <div className="flex items-center gap-2 text-[var(--text-primary)] font-mono text-[12px] font-black bg-[var(--surface-3)] px-3 py-1 rounded border border-[var(--border)] tabular-nums">
              {ticker} {fmtNum(simulatorStrike)} CALL
            </div>
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-center">
            <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
              Illustrative payoff scenarios for the selected strike. These are model
              what-ifs, not quotes or predictions, and update only when you change the
              scenario strike below.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSimulatorStrike((s) => s - 25)}
                className="flex-1 text-[11px] font-bold text-[var(--text-secondary)] border border-[var(--border)] rounded-sm py-1.5 hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors tabular-nums"
              >− 25</button>
              <button
                onClick={() => setSimulatorStrike((s) => s + 25)}
                className="flex-1 text-[11px] font-bold text-[var(--text-secondary)] border border-[var(--border)] rounded-sm py-1.5 hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors tabular-nums"
              >+ 25</button>
            </div>
            {[
              { label: `If ${ticker} moves +10 pts`, sub: 'Gamma acceleration', accent: 'var(--success)' },
              { label: 'If IV drops 5%', sub: 'Volatility crush', accent: 'var(--warning)' },
              { label: 'If dealer hedging accelerates', sub: 'Forced-buying delta', accent: 'var(--info)' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center bg-[var(--surface-2)] border border-[var(--border)] p-3.5 rounded-sm relative overflow-hidden hover:border-[var(--border-strong)] transition-colors">
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: row.accent }} />
                <div className="pl-2">
                  <span className="text-[11px] font-bold text-[var(--text-secondary)] block tracking-wide">{row.label}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-wider mt-0.5 block">{row.sub}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest block mb-0.5">Directional Bias</span>
                  <span className="text-[13px] font-mono font-black" style={{ color: row.accent }}>{i === 1 ? 'NEGATIVE' : 'POSITIVE'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Catalyst commentary, raw exposures & dealer read */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* Catalyst / Commentary — sourced from deep_intelligence.commentary */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-[var(--border)] pb-2">
            <Activity className="w-4 h-4 text-[var(--warning)]" />
            <span className="text-[10px] font-black tracking-widest uppercase text-[var(--warning)]">ENGINE COMMENTARY</span>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            {Array.isArray(deep?.commentary) && deep!.commentary!.length > 0 ? (
              deep!.commentary!.slice(0, 4).map((line, i) => (
                <div key={i} className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-sm">
                  <span className="text-[11px] text-[var(--text-secondary)] leading-snug">{line}</span>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-[var(--text-tertiary)] italic px-1 py-2">No commentary in current feed.</div>
            )}
          </div>
        </div>

        {/* Raw Institutional Exposures (2 cols) — guarded reads from gex_profile / deep_intelligence */}
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-2 mb-4 border-b border-[var(--border)] pb-2">
            <Terminal className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)]">RAW INSTITUTIONAL EXPOSURES</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <MetricBox label="Net Gamma Exposure" value={num(netGex) ? fmtBig(netGex!) : 'N/A'} color={gexKnown ? (netGex! >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]') : 'text-[var(--text-tertiary)]'} />
            <MetricBox label="Net Delta Exposure" value={num(profile?.netDex) ? fmtBig(profile!.netDex!) : 'N/A'} color="text-[var(--info)]" />
            <MetricBox label="Net Vega Exposure" value={num(profile?.netVex) ? fmtBig(profile!.netVex!) : 'N/A'} color="text-[var(--warning)]" />
            <MetricBox label="Net Vanna" value={num(dynamics?.vanna?.net) ? fmtBig(dynamics!.vanna.net) : 'N/A'} color="text-[var(--warning)]" />
            <MetricBox label="Net Charm / Day" value={num(dynamics?.charm?.netPerDay) ? fmtBig(dynamics!.charm.netPerDay) : 'N/A'} color="text-[var(--danger)]" />
            <MetricBox label="Gamma Velocity" value={num(dynamics?.gamma?.velocity) ? fmtBig(dynamics!.gamma.velocity) : 'N/A'} color="text-[var(--info)]" />
            <MetricBox label="Dealer Inventory" value={dealerBias == null ? 'N/A' : dealerBias === 'LONG GAMMA' ? 'LONG' : 'SHORT'} color={dealerBias === 'LONG GAMMA' ? 'text-[var(--success)]' : dealerBias === 'SHORT GAMMA' ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'} />
            <MetricBox label="Dealer Flip Level" value={num(profile?.gammaFlip) ? fmtNum(profile!.gammaFlip!) : 'N/A'} color="text-[var(--text-primary)]" />
            <MetricBox label="Dealer Pressure" value={dealerBias == null ? 'N/A' : dealerBias === 'LONG GAMMA' ? 'BUYING DIPS' : 'SELLING RALLIES'} color={dealerBias === 'LONG GAMMA' ? 'text-[var(--success)]' : dealerBias === 'SHORT GAMMA' ? 'text-[var(--warning)]' : 'text-[var(--text-tertiary)]'} />
          </div>
        </div>

        {/* Dealer Gamma Read — from gex_summary text (plain-English server read) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg relative overflow-hidden flex flex-col shadow-lg">
          <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-2 z-10">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--info)]" />
              <span className="text-[10px] font-black tracking-widest uppercase text-[var(--info)]">DEALER GAMMA READ</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3 rounded-md z-10">
            {serverState?.gex_summary?.text ? (
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded text-[var(--text-secondary)] text-[11.5px] font-medium leading-relaxed tracking-wide">
                {serverState.gex_summary.text}
              </div>
            ) : (
              <div className="text-[11px] text-[var(--text-tertiary)] italic px-1 py-2">No dealer gamma summary in current feed.</div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded-sm">
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-black block mb-1">Magnet</span>
                <span className="text-[var(--text-primary)] font-black font-mono text-[14px] tabular-nums">{num(profile?.magnet) ? fmtNum(profile!.magnet!) : 'N/A'}</span>
              </div>
              <div className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded-sm">
                <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-black block mb-1">Migration</span>
                <span className={`font-black font-mono text-[14px] tabular-nums transition-colors duration-300 ${
                  dynamics?.migration?.direction === 'BULLISH' ? 'text-[var(--success)]' : dynamics?.migration?.direction === 'BEARISH' ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'
                }`}>{dynamics?.migration?.direction ?? 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

function MetricBox({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-3 hover:bg-[var(--surface-3)] transition-colors flex flex-col justify-center">
      <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-widest block mb-1.5">{label}</span>
      <span className={`text-[15px] font-mono font-bold tracking-tight tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
