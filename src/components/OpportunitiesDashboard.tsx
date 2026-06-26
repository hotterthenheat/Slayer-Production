/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { ArrowRight, Activity, Sparkles } from 'lucide-react';
import { useContractStore } from '../lib/store';
import { fmtNum } from '../lib/format';

export interface ContractOpportunity {
  id: string;
  ticker: string;
  name: string;
  contract: string;
  direction: 'BULLISH' | 'BEARISH';
  confidence: number;
  price: number;
  fairValue: number;
  recommendation: 'BUY' | 'WAIT' | 'REDUCE' | 'EXIT';
}

interface OpportunitiesDashboardProps {
  onSelectOpportunity: (opp: ContractOpportunity) => void;
  isLiveTicking: boolean;
}

// Static structural sample set. This is illustrative reference data — it is NOT a
// live feed and is labelled DEMO in the UI. Real per-strike opportunity ranking is
// surfaced from serverState.gex_profile.strikes below when a tick is available.
const SAMPLE_CALLS: ContractOpportunity[] = [
  { id: 'c1', ticker: 'SPX', name: 'S&P 500 Index', contract: 'SPX 7650C', direction: 'BULLISH', confidence: 92, price: 2.15, fairValue: 1.95, recommendation: 'WAIT' },
  { id: 'c2', ticker: 'SPY', name: 'SPDR S&P 500 ETF', contract: 'SPY 515C', direction: 'BULLISH', confidence: 89, price: 1.72, fairValue: 1.68, recommendation: 'BUY' },
  { id: 'c3', ticker: 'NDX', name: 'Nasdaq 100 Index', contract: 'NDX 18300C', direction: 'BULLISH', confidence: 87, price: 3.22, fairValue: 3.08, recommendation: 'BUY' },
  { id: 'c4', ticker: 'QQQ', name: 'Invesco QQQ Trust', contract: 'QQQ 448C', direction: 'BULLISH', confidence: 85, price: 1.45, fairValue: 1.35, recommendation: 'BUY' },
  { id: 'c5', ticker: 'RUT', name: 'Russell 2000 Index', contract: 'RUT 2030C', direction: 'BULLISH', confidence: 95, price: 4.10, fairValue: 3.85, recommendation: 'WAIT' },
  { id: 'c6', ticker: 'SPX', name: 'S&P 500 Index', contract: 'SPX 7680C', direction: 'BULLISH', confidence: 91, price: 3.80, fairValue: 3.50, recommendation: 'BUY' },
  { id: 'c7', ticker: 'NDX', name: 'Nasdaq 100 Index', contract: 'NDX 18350C', direction: 'BULLISH', confidence: 86, price: 2.90, fairValue: 2.80, recommendation: 'BUY' },
  { id: 'c8', ticker: 'QQQ', name: 'Invesco QQQ Trust', contract: 'QQQ 450C', direction: 'BULLISH', confidence: 82, price: 1.65, fairValue: 1.70, recommendation: 'WAIT' },
  { id: 'c9', ticker: 'SPY', name: 'SPDR S&P 500 ETF', contract: 'SPY 512C', direction: 'BULLISH', confidence: 80, price: 2.10, fairValue: 1.98, recommendation: 'BUY' },
  { id: 'c10', ticker: 'RUT', name: 'Russell 2000 Index', contract: 'RUT 2040C', direction: 'BULLISH', confidence: 78, price: 5.40, fairValue: 5.10, recommendation: 'BUY' }
];

const SAMPLE_PUTS: ContractOpportunity[] = [
  { id: 'p1', ticker: 'QQQ', name: 'Invesco QQQ Trust', contract: 'QQQ 440P', direction: 'BEARISH', confidence: 85, price: 2.10, fairValue: 1.98, recommendation: 'BUY' },
  { id: 'p2', ticker: 'NDX', name: 'Nasdaq 100 Index', contract: 'NDX 18100P', direction: 'BEARISH', confidence: 81, price: 6.50, fairValue: 6.20, recommendation: 'BUY' },
  { id: 'p3', ticker: 'SPY', name: 'SPDR S&P 500 ETF', contract: 'SPY 508P', direction: 'BEARISH', confidence: 76, price: 4.80, fairValue: 4.90, recommendation: 'WAIT' },
  { id: 'p4', ticker: 'RUT', name: 'Russell 2000 Index', contract: 'RUT 2010P', direction: 'BEARISH', confidence: 73, price: 1.30, fairValue: 1.25, recommendation: 'BUY' },
  { id: 'p5', ticker: 'SPX', name: 'S&P 500 Index', contract: 'SPX 7600P', direction: 'BEARISH', confidence: 70, price: 1.15, fairValue: 1.10, recommendation: 'BUY' },
  { id: 'p6', ticker: 'QQQ', name: 'Invesco QQQ Trust', contract: 'QQQ 442P', direction: 'BEARISH', confidence: 68, price: 0.95, fairValue: 1.05, recommendation: 'WAIT' },
  { id: 'p7', ticker: 'SPY', name: 'SPDR S&P 500 ETF', contract: 'SPY 510P', direction: 'BEARISH', confidence: 65, price: 0.85, fairValue: 0.80, recommendation: 'BUY' },
  { id: 'p8', ticker: 'NDX', name: 'Nasdaq 100 Index', contract: 'NDX 18200P', direction: 'BEARISH', confidence: 62, price: 1.25, fairValue: 1.20, recommendation: 'BUY' },
  { id: 'p9', ticker: 'RUT', name: 'Russell 2000 Index', contract: 'RUT 2020P', direction: 'BEARISH', confidence: 59, price: 2.80, fairValue: 2.95, recommendation: 'WAIT' },
  { id: 'p10', ticker: 'SPX', name: 'S&P 500 Index', contract: 'SPX 7580P', direction: 'BEARISH', confidence: 72, price: 1.90, fairValue: 1.80, recommendation: 'BUY' }
];

export function OpportunitiesDashboard({
  onSelectOpportunity,
}: OpportunitiesDashboardProps) {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);

  const profile = serverState?.gex_profile;
  const strikes = profile?.strikes;
  const ticker = selectedAsset.ticker;
  const assetName = selectedAsset.name;

  // Derive call / put opportunity rows from the real per-strike GEX profile when the
  // server has streamed one. callGex / putGex come from gex_profile.strikes; the
  // "fair value" reference is the live option-chain mid when present, else N/A.
  const live = useMemo(() => {
    if (!Array.isArray(strikes) || strikes.length === 0) return null;
    const spot = profile?.spot ?? selectedAsset.defaultPrice;

    const chainMid = (strike: number, type: 'call' | 'put'): number | null => {
      const c = serverState?.option_chain?.find(
        (o) => o.strike === strike && o.type === type
      );
      if (!c || typeof c.bid !== 'number' || typeof c.ask !== 'number') return null;
      return Number(((c.bid + c.ask) / 2).toFixed(2));
    };

    const callRows: ContractOpportunity[] = strikes
      .filter((s) => s.strike >= spot)
      .sort((a, b) => b.callGex - a.callGex)
      .slice(0, 10)
      .map((s, i) => {
        const mid = chainMid(s.strike, 'call');
        return {
          id: `live-c-${s.strike}`,
          ticker,
          name: assetName,
          contract: `${ticker} ${s.strike}C`,
          direction: 'BULLISH' as const,
          confidence: 0,
          price: mid ?? 0,
          fairValue: mid ?? 0,
          recommendation: 'WAIT' as const,
          _rank: i + 1,
          _gex: s.callGex,
          _hasPrice: mid != null,
        } as ContractOpportunity & { _rank: number; _gex: number; _hasPrice: boolean };
      });

    const putRows: ContractOpportunity[] = strikes
      .filter((s) => s.strike <= spot)
      .sort((a, b) => b.putGex - a.putGex)
      .slice(0, 10)
      .map((s, i) => {
        const mid = chainMid(s.strike, 'put');
        return {
          id: `live-p-${s.strike}`,
          ticker,
          name: assetName,
          contract: `${ticker} ${s.strike}P`,
          direction: 'BEARISH' as const,
          confidence: 0,
          price: mid ?? 0,
          fairValue: mid ?? 0,
          recommendation: 'WAIT' as const,
          _rank: i + 1,
          _gex: s.putGex,
          _hasPrice: mid != null,
        } as ContractOpportunity & { _rank: number; _gex: number; _hasPrice: boolean };
      });

    return { callRows, putRows };
  }, [strikes, profile?.spot, serverState?.option_chain, ticker, assetName, selectedAsset.defaultPrice]);

  const isLive = live != null;
  const calls = isLive ? live!.callRows : SAMPLE_CALLS;
  const puts = isLive ? live!.putRows : SAMPLE_PUTS;

  // Regime read sourced from the real GEX profile sign (long vs short gamma).
  const netGex = profile?.netGex;
  const regimeKnown = typeof netGex === 'number';
  const regimeBullish = regimeKnown && netGex! >= 0;

  // Top three spotlight cards are taken from whichever call set is in use.
  const topThree = calls.slice(0, 3).map((opp, i) => ({
    ...opp,
    rank: `#${i + 1}`,
  }));

  const fmtGex = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* 1. Market Regime Highlight Bar — sourced from gex_profile.netGex sign */}
      <section className="bg-[var(--surface)]/60 border border-[var(--border)] p-4 md:p-5 rounded-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center rounded-sm">
            <Activity className="w-5 text-[var(--info)]" />
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-tertiary)] block uppercase font-mono tracking-widest">Dealer Gamma Regime</span>
            <span className="text-sm font-bold font-mono tracking-tight text-[var(--text-primary)] uppercase">
              {regimeKnown ? (regimeBullish ? 'LONG GAMMA / RANGE-BOUND' : 'SHORT GAMMA / UNSTABLE') : 'AWAITING FEED'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 md:gap-12 w-full md:w-auto justify-items-center md:justify-items-start border-t md:border-t-0 border-[var(--border)] pt-3 md:pt-0">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono block">Net GEX</span>
            <span className={`text-sm font-mono font-bold tabular-nums ${regimeKnown ? (regimeBullish ? 'text-[var(--success)]' : 'text-[var(--danger)]') : 'text-[var(--text-tertiary)]'}`}>
              {regimeKnown ? `$${fmtGex(netGex!)}` : 'N/A'}
            </span>
          </div>
          <div className="text-center md:text-left">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono block">Gamma Flip</span>
            <span className="text-sm font-mono text-[var(--text-primary)] font-bold tabular-nums">
              {typeof profile?.gammaFlip === 'number' ? fmtNum(profile.gammaFlip) : 'N/A'}
            </span>
          </div>
          <div className="text-center md:text-left">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono block">Feed</span>
            <span className="text-sm font-mono text-[var(--text-secondary)] font-bold uppercase">
              {profile?.feed || (isLive ? 'LIVE' : 'DEMO')}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Top Ranked Opportunities Spotlight Panel */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold font-mono tracking-wider text-[var(--text-tertiary)] uppercase flex items-center gap-2">
            <Sparkles className="w-3.5 text-[var(--info)]" /> HIGHLIGHT OPPORTUNITY ENGINE
            {!isLive && <span className="ml-1 text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--warning)] rounded-sm">DEMO</span>}
          </h3>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">{isLive ? 'RANKED BY DEALER GAMMA' : 'SAMPLE DATA'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topThree.map((opp) => {
            const anyOpp = opp as ContractOpportunity & { _gex?: number; _hasPrice?: boolean };
            return (
              <div
                key={opp.id}
                onClick={() => onSelectOpportunity(opp)}
                className="group bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-all p-4 rounded-sm flex flex-col justify-between cursor-pointer shadow-lg hover:bg-[var(--surface-2)]"
              >
                <div className="flex justify-between items-start border-b border-[var(--border)] pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold font-mono text-[var(--text-tertiary)] tracking-wider tabular-nums">
                      {opp.rank}
                    </span>
                    <span className="text-[13px] font-bold font-mono text-[var(--text-primary)] group-hover:text-[var(--success)] tracking-wider transition-colors">
                      {opp.contract}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 border border-[var(--border)] text-[10px] font-mono font-bold uppercase rounded-sm bg-[var(--surface-2)] text-[var(--success)]">
                    {opp.direction}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 my-2 text-center bg-[var(--surface-2)] p-2.5 rounded-sm border border-[var(--border)] transition-colors">
                  <div>
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-mono">Mid Price</span>
                    <span className="text-sm font-mono font-bold text-[var(--text-primary)] mt-1 block tabular-nums">
                      {isLive ? (anyOpp._hasPrice ? `$${opp.price.toFixed(2)}` : 'N/A') : `$${opp.price.toFixed(2)}`}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-mono">{isLive ? 'Dealer GEX' : 'Fair Value'}</span>
                    <span className="text-sm font-mono font-bold text-[var(--info)] mt-1 block tabular-nums">
                      {isLive ? `$${fmtGex(anyOpp._gex ?? 0)}` : `$${opp.fairValue.toFixed(2)}`}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-[var(--border)] flex justify-between items-center">
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{isLive ? 'GAMMA RANK' : 'RECOMMENDATION (DEMO)'}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono font-bold uppercase ${
                      isLive ? 'text-[var(--info)]' : opp.recommendation === 'BUY' ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                    }`}>
                      {isLive ? opp.rank : opp.recommendation}
                    </span>
                    <ArrowRight className="w-3 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--success)]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Global Premium Matrix: Top 10 Calls & Top 10 Puts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top 10 Calls List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-1">
            <span className="text-xs font-semibold font-mono tracking-wider text-[var(--success)] flex items-center gap-1.5 uppercase">
              Top 10 Call Strikes (by Dealer GEX)
              {!isLive && <span className="text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--warning)] rounded-sm">DEMO</span>}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{isLive ? 'LIVE GEX PROFILE' : 'SAMPLE'}</span>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] overflow-x-auto rounded-sm">
            <table className="w-full text-left font-mono text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-[var(--surface-2)] text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider">
                  <th className="p-2.5">Contract</th>
                  <th className="p-2.5">Underlying</th>
                  <th className="p-2.5">Bias</th>
                  <th className="p-2.5 text-right">{isLive ? 'Dealer GEX' : 'Confidence'}</th>
                  <th className="p-2.5 text-right">Mid Price</th>
                  <th className="p-2.5 text-center">{isLive ? 'Rank' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--surface)]">
                {calls.map((opp, idx) => {
                  const anyOpp = opp as ContractOpportunity & { _gex?: number; _hasPrice?: boolean };
                  return (
                    <tr
                      key={opp.id}
                      onClick={() => onSelectOpportunity(opp)}
                      className="hover:bg-[var(--surface-2)] cursor-pointer transition-colors group border-t border-[var(--border)]"
                    >
                      <td className="p-2.5 text-[var(--text-primary)] font-bold group-hover:text-[var(--success)] flex items-center gap-1">
                        <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">#{idx + 1}</span> {opp.contract}
                      </td>
                      <td className="p-2.5 text-[var(--text-tertiary)] text-[11px]">{opp.name}</td>
                      <td className="p-2.5 text-[var(--success)] text-[10px] font-bold uppercase">{opp.direction}</td>
                      <td className="p-2.5 text-right text-[var(--success)] font-bold tabular-nums">
                        {isLive ? `$${fmtGex(anyOpp._gex ?? 0)}` : `${opp.confidence}%`}
                      </td>
                      <td className="p-2.5 text-right text-[var(--text-primary)] font-medium tabular-nums">
                        {isLive ? (anyOpp._hasPrice ? `$${opp.price.toFixed(2)}` : 'N/A') : `$${opp.price.toFixed(2)}`}
                      </td>
                      <td className="p-2.5 text-center">
                        {isLive ? (
                          <span className="text-[10px] font-bold text-[var(--info)] tabular-nums">#{idx + 1}</span>
                        ) : (
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-sm border border-[var(--border)] ${
                            opp.recommendation === 'BUY' ? 'bg-[var(--surface-3)] text-[var(--success)]' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'
                          }`}>
                            {opp.recommendation}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top 10 Puts List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-1">
            <span className="text-xs font-semibold font-mono tracking-wider text-[var(--danger)] flex items-center gap-1.5 uppercase">
              Top 10 Put Strikes (by Dealer GEX)
              {!isLive && <span className="text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--warning)] rounded-sm">DEMO</span>}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{isLive ? 'LIVE GEX PROFILE' : 'SAMPLE'}</span>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] overflow-x-auto rounded-sm">
            <table className="w-full text-left font-mono text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-[var(--surface-2)] text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider">
                  <th className="p-2.5">Contract</th>
                  <th className="p-2.5">Underlying</th>
                  <th className="p-2.5">Bias</th>
                  <th className="p-2.5 text-right">{isLive ? 'Dealer GEX' : 'Confidence'}</th>
                  <th className="p-2.5 text-right">Mid Price</th>
                  <th className="p-2.5 text-center">{isLive ? 'Rank' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--surface)]">
                {puts.map((opp, idx) => {
                  const anyOpp = opp as ContractOpportunity & { _gex?: number; _hasPrice?: boolean };
                  return (
                    <tr
                      key={opp.id}
                      onClick={() => onSelectOpportunity(opp)}
                      className="hover:bg-[var(--surface-2)] cursor-pointer transition-colors group border-t border-[var(--border)]"
                    >
                      <td className="p-2.5 text-[var(--text-primary)] font-bold group-hover:text-[var(--danger)] flex items-center gap-1">
                        <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">#{idx + 1}</span> {opp.contract}
                      </td>
                      <td className="p-2.5 text-[var(--text-tertiary)] text-[11px]">{opp.name}</td>
                      <td className="p-2.5 text-[var(--danger)] text-[10px] font-bold uppercase">{opp.direction}</td>
                      <td className="p-2.5 text-right text-[var(--text-secondary)] font-bold tabular-nums">
                        {isLive ? `$${fmtGex(anyOpp._gex ?? 0)}` : `${opp.confidence}%`}
                      </td>
                      <td className="p-2.5 text-right text-[var(--text-primary)] font-medium tabular-nums">
                        {isLive ? (anyOpp._hasPrice ? `$${opp.price.toFixed(2)}` : 'N/A') : `$${opp.price.toFixed(2)}`}
                      </td>
                      <td className="p-2.5 text-center">
                        {isLive ? (
                          <span className="text-[10px] font-bold text-[var(--info)] tabular-nums">#{idx + 1}</span>
                        ) : (
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-sm border border-[var(--border)] ${
                            opp.recommendation === 'BUY' ? 'bg-[var(--surface-3)] text-[var(--success)]' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'
                          }`}>
                            {opp.recommendation}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </section>

    </div>
  );
}
