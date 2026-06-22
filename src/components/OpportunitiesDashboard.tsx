/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Target, ArrowRight, Activity, Percent, Sparkles, DollarSign } from 'lucide-react';

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

export function OpportunitiesDashboard({
  onSelectOpportunity,
  isLiveTicking,
}: OpportunitiesDashboardProps) {
  // Live local lists of opportunities so they can tick dynamically and feel extremely real!
  const [calls, setCalls] = useState<ContractOpportunity[]>([
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
  ]);

  const [puts, setPuts] = useState<ContractOpportunity[]>([
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
  ]);

  const [marketRegimeConfidence, setMarketRegimeConfidence] = useState(87.4);

  // Gentle live pricing fluctuate ticks
  useEffect(() => {
    if (!isLiveTicking) return;
    const interval = setInterval(() => {
      // Fluctuate calls
      setCalls((prevCalls) =>
        prevCalls.map((c) => {
          const delta = (Math.random() - 0.49) * (c.price * 0.015);
          const newPrice = Math.max(0.01, c.price + delta);
          return {
            ...c,
            price: Number(newPrice.toFixed(c.ticker === 'EURUSD' ? 4 : 2)),
          };
        })
      );
      // Fluctuate puts
      setPuts((prevPuts) =>
        prevPuts.map((p) => {
          const delta = (Math.random() - 0.49) * (p.price * 0.015);
          const newPrice = Math.max(0.01, p.price + delta);
          return {
            ...p,
            price: Number(newPrice.toFixed(p.ticker === 'EURUSD' ? 4 : 2)),
          };
        })
      );
      // Fluctuate market regime
      setMarketRegimeConfidence((prev) => {
        const delta = (Math.random() - 0.5) * 0.4;
        return Number(Math.max(75, Math.min(98, prev + delta)).toFixed(1));
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isLiveTicking]);

  // Combined Top Opportunities for Bento Highlight Grid
  const topThree = [
    { ...calls[0], rank: '#1', badgeColor: 'border-black bg-black/40 text-[#4ADE80]' },
    { ...calls[1], rank: '#2', badgeColor: 'border-black bg-black text-zinc-200' },
    { ...calls[2], rank: '#3', badgeColor: 'border-black bg-black text-[#4ADE80]' },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      
      {/* 1. Market Regime Highlight Bar */}
      <section className="bg-black/40 border border-black p-4 md:p-5 rounded-sm flex flex-col md:flex-row justify-between items-center gap-4 bg-gradient-to-r from-zinc-950/60 to-zinc-900/40">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 bg-black/40 border border-black flex items-center justify-center rounded-sm">
            <Activity className="w-5 text-[#4ADE80] animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 block uppercase font-mono tracking-widest">Global Intelligence System</span>
            <span className="text-sm font-bold font-mono tracking-tight text-[#E5E5E5] uppercase">
              ACTIVE COALITION REGIME STATE
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 md:gap-12 w-full md:w-auto justify-items-center md:justify-items-start border-t md:border-t-0 border-black pt-3 md:pt-0">
          <div className="text-center md:text-left">
            <span className="text-[9px] text-zinc-500 uppercase font-mono block">Regime Trend</span>
            <span className="text-sm font-mono text-[#4ADE80] font-bold uppercase flex items-center gap-1">
              [holding] BULLISH
            </span>
          </div>
          <div className="text-center md:text-left">
            <span className="text-[9px] text-zinc-500 uppercase font-mono block">Confidence</span>
            <span className="text-sm font-mono text-zinc-100 font-bold">{marketRegimeConfidence}%</span>
          </div>
          <div className="text-center md:text-left">
            <span className="text-[9px] text-zinc-500 uppercase font-mono block">Trend Quality</span>
            <span className="text-sm font-mono text-zinc-200 font-bold uppercase">Strong</span>
          </div>
          <div className="text-center md:text-left">
            <span className="text-[9px] text-zinc-500 uppercase font-mono block">Momentum Acceleration</span>
            <span className="text-sm font-mono text-[#4ADE80] font-bold uppercase flex items-center gap-1 animate-pulse">
              [testing] Increasing
            </span>
          </div>
        </div>
      </section>

      {/* 2. Top Ranked Opportunities Spotlight Panel */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold font-mono tracking-wider text-zinc-400 uppercase flex items-center gap-2">
            <Sparkles className="w-3.5 text-[#4ADE80]" /> HIGHLIGHT OPPORTUNITY ENGINE
          </h3>
          <span className="text-[9px] font-mono text-zinc-600 uppercase">SORTED BY CONVECTIVE WEIGHT</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topThree.map((opp, idx) => (
            <div
              key={opp.id}
              onClick={() => onSelectOpportunity(opp)}
              className="group bg-black/60 border border-black hover:border-black transition-all p-4 rounded-sm flex flex-col justify-between cursor-pointer shadow-lg hover:shadow-zinc-300/10 hover:bg-black/80"
            >
              <div className="flex justify-between items-start border-b border-black pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold font-mono text-zinc-600 tracking-wider">
                    {opp.rank}
                  </span>
                  <span className="text-[13px] font-bold font-mono text-zinc-100 group-hover:text-[#4ADE80] tracking-wider transition-colors">
                    {opp.contract}
                  </span>
                </div>
                <span className={`px-2 py-0.5 border text-[9px] font-mono font-bold uppercase transition-colors rounded-sm ${opp.badgeColor}`}>
                  {opp.direction} ({opp.confidence}%)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 my-2 text-center bg-black/30 p-2.5 rounded-sm border border-black/60 group-hover:bg-black/80 transition-colors">
                <div>
                  <span className="block text-[8.5px] text-zinc-500 uppercase tracking-wider font-mono">Current Val</span>
                  <span className="text-sm font-mono font-bold text-zinc-100 mt-1 block">
                    ${opp.price.toFixed(opp.ticker === 'EURUSD' ? 4 : 2)}
                  </span>
                </div>
                <div>
                  <span className="block text-[8.5px] text-zinc-500 uppercase tracking-wider font-mono">Fair Value</span>
                  <span className="text-sm font-mono font-bold text-[#4ADE80] mt-1 block">
                    ${opp.fairValue.toFixed(opp.ticker === 'EURUSD' ? 4 : 2)}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-black flex justify-between items-center">
                <span className="text-[9px] font-mono text-zinc-500">RECOMMENDATION</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono font-bold uppercase ${
                    opp.recommendation === 'BUY' ? 'text-[#4ADE80] font-semibold' : 'text-amber-500'
                  }`}>
                    {opp.recommendation}
                  </span>
                  <ArrowRight className="w-3 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-[#4ADE80]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Global Premium Matrix: Top 10 Calls & Top 10 Puts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top 10 Calls List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-black pb-1">
            <span className="text-xs font-semibold font-mono tracking-wider text-[#4ADE80] flex items-center gap-1.5 uppercase">
              [holding] Top 10 Call Opportunities
            </span>
            <span className="text-[9px] font-mono text-zinc-605">ACCELERATIVE HIGH IMPULSE</span>
          </div>

          <div className="bg-black/30 border border-black overflow-x-auto rounded-sm">
            <table className="w-full text-left font-mono text-xs divide-y divide-zinc-900 whitespace-nowrap">
              <thead>
                <tr className="bg-black/70 text-[9px] text-zinc-500 uppercase font-mono tracking-wider">
                  <th className="p-2.5">Contract</th>
                  <th className="p-2.5">Underlying</th>
                  <th className="p-2.5">Bias</th>
                  <th className="p-2.5 text-center">Confidence</th>
                  <th className="p-2.5 text-right">Premium</th>
                  <th className="p-2.5 text-right">Fair Value</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 bg-black/20">
                {calls.map((opp, idx) => (
                  <tr
                    key={opp.id}
                    onClick={() => onSelectOpportunity(opp)}
                    className="hover:bg-black/60 hover:text-[#E5E5E5] cursor-pointer transition-colors group"
                  >
                    <td className="p-2.5 text-zinc-100 font-bold group-hover:text-[#4ADE80] flex items-center gap-1">
                      <span className="text-[9px] text-zinc-600">#{idx+1}</span> {opp.contract}
                    </td>
                    <td className="p-2.5 text-zinc-400 text-[11px]">{opp.name}</td>
                    <td className="p-2.5 text-[#4ADE80] text-[10px] font-bold uppercase">{opp.direction}</td>
                    <td className="p-2.5 text-center text-[#4ADE80] font-bold">{opp.confidence}%</td>
                    <td className="p-2.5 text-right text-zinc-100 font-medium">${opp.price.toFixed(opp.ticker === 'EURUSD' ? 4 : 2)}</td>
                    <td className="p-2.5 text-right text-zinc-400">${opp.fairValue.toFixed(opp.ticker === 'EURUSD' ? 4 : 2)}</td>
                    <td className="p-2.5 text-center">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm ${
                        opp.recommendation === 'BUY' ? 'bg-black/40 border border-black text-[#4ADE80]' : 'bg-black border border-black text-zinc-400'
                      }`}>
                        {opp.recommendation}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top 10 Puts List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-black pb-1">
            <span className="text-xs font-semibold font-mono tracking-wider text-[#F87171] flex items-center gap-1.5 uppercase">
              [failing] Top 10 Put Opportunities
            </span>
            <span className="text-[9px] font-mono text-zinc-605">ACCELERATIVE DOWN SHIFT</span>
          </div>

          <div className="bg-black/30 border border-black overflow-x-auto rounded-sm">
            <table className="w-full text-left font-mono text-xs divide-y divide-zinc-900 whitespace-nowrap">
              <thead>
                <tr className="bg-black/70 text-[9px] text-zinc-500 uppercase font-mono tracking-wider">
                  <th className="p-2.5">Contract</th>
                  <th className="p-2.5">Underlying</th>
                  <th className="p-2.5">Bias</th>
                  <th className="p-2.5 text-center">Confidence</th>
                  <th className="p-2.5 text-right">Premium</th>
                  <th className="p-2.5 text-right">Fair Value</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 bg-black/20">
                {puts.map((opp, idx) => (
                  <tr
                    key={opp.id}
                    onClick={() => onSelectOpportunity(opp)}
                    className="hover:bg-black/60 hover:text-[#E5E5E5] cursor-pointer transition-colors group"
                  >
                    <td className="p-2.5 text-zinc-100 font-bold group-hover:text-[#F87171] flex items-center gap-1">
                      <span className="text-[9px] text-zinc-600">#{idx+1}</span> {opp.contract}
                    </td>
                    <td className="p-2.5 text-zinc-400 text-[11px]">{opp.name}</td>
                    <td className="p-2.5 text-[#F87171] text-[10px] font-bold uppercase">{opp.direction}</td>
                    <td className="p-2.5 text-center text-zinc-305 font-bold">{opp.confidence}%</td>
                    <td className="p-2.5 text-right text-zinc-100 font-medium">${opp.price.toFixed(opp.ticker === 'EURUSD' ? 4 : 2)}</td>
                    <td className="p-2.5 text-right text-zinc-400">${opp.fairValue.toFixed(opp.ticker === 'EURUSD' ? 4 : 2)}</td>
                    <td className="p-2.5 text-center">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm ${
                        opp.recommendation === 'BUY' ? 'bg-black/40 border border-black text-[#4ADE80]' : 'bg-black border border-black text-zinc-400'
                      }`}>
                        {opp.recommendation}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </section>

    </div>
  );
}
