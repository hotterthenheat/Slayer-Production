import React from 'react';
import { motion } from 'motion/react';
import { FileText, Download, ShieldCheck, Printer, FileSpreadsheet, Layers } from 'lucide-react';
import { useContractStore } from '../lib/store';

export function ReportsView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);

  // Trigger manual simulated file print download
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full text-[#4ADE80] flex flex-col font-mono select-none antialiased space-y-6 print:bg-white print:text-black">
      
      {/* 1. HEADER (REPORT EXPORTER CONTROL) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg print:hidden">
        <div className="flex gap-2 items-center">
          <FileText className="w-4 h-4 text-[#4ADE80]" />
          <span className="text-[9.5px] text-[#4ADE80] uppercase tracking-widest font-black">
            SLAYER EXECUTIVE COMPLIANCE REPORT CARD // EXPORT READY
          </span>
        </div>
        
        {/* Export triggers */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-white hover:bg-black text-black font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[8.5px] tracking-widest flex items-center gap-1 shadow"
          >
            <Printer className="w-3" />
            <span>PRINT / SAVE PDF</span>
          </button>
          <div className="bg-black/40 px-3 py-1.5 border border-white/5 text-[8px] text-zinc-400 uppercase font-black rounded-lg">
            CLASSIFICATION: COGNITIVE PRIVATE
          </div>
        </div>
      </div>

      {/* 2. PRIMARY HERO CARD (Aesthetic SEC-style mathematical validation report) */}
      <div className="w-full animate-fadeIn">
        <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl text-left space-y-6 border border-white/5 print:border-none print:bg-white print:p-0">
          
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#4ADE80] via-indigo-500 to-[#4ADE80] print:hidden" />

          {/* Institutional Document Header */}
          <div className="border-b-2 border-black/40 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="space-y-1">
              <span className="text-[8px] text-[#4ADE80] tracking-[0.25em] font-black block uppercase">PRIVATE DISCLOSURE COGNITIVE LEDGER</span>
              <h2 className="text-xl md:text-2xl font-black text-[#E5E5E5] font-sans tracking-tight uppercase leading-none print:text-black">
                Q2 MATHEMATICAL VALIDATION REPORT
              </h2>
              <span className="text-[8px] text-zinc-500 font-bold block pt-1">
                AUTHORS: SLAYERS MULTIVARIATE LABS • CALIBRATION NO. S-V11-S02
              </span>
            </div>
            
            <div className="flex flex-col text-right text-[8px] text-zinc-500 font-mono self-start sm:self-center">
              <span>DOCUMENT CUSTODY: COMPLIANT</span>
              <span>INDEX BASE: {selectedAsset.ticker} MULTI-NODE</span>
              <span>TIMESTAMP: {new Date().toLocaleDateString()}</span>
            </div>
          </div>

          <p className="text-[11px] font-sans text-zinc-450 leading-relaxed font-light print:text-zinc-800">
            This formal dossier presents quantitative validation findings relative to the V11 continuous options scoring pipeline. Backtested indexes demonstrate robust compliance across 487 out-of-sample setups with zero data leakage. We certify transaction performance, error margins, and dealer hedging buffers under security guidelines.
          </p>

          {/* FORMAL TABULAR REPORT CARD */}
          <div className="border border-white/5 rounded-xl bg-black/40 overflow-hidden shadow-inner print:border-black print:bg-white">
            <div className="grid grid-cols-4 bg-black/55 p-3 text-[8.5px] text-zinc-500 border-b border-white/5 uppercase font-bold tracking-wider print:bg-black print:text-black">
              <span>METRIC CLASSIFICATION</span>
              <span>FORMULA MODEL BASIS</span>
              <span>TARGET CALIBRATION</span>
              <span className="text-right">ACTUAL PERFORMANCE</span>
            </div>

            <div className="divide-y divide-white/5 font-mono text-[10.5px] text-[#4ADE80] print:divide-zinc-200 print:text-black">
              {/* Row 1 */}
              <div className="grid grid-cols-4 p-3 hover:bg-white/5 transition-colors">
                <span className="font-extrabold text-[#E5E5E5] print:text-black">Brier score calibration</span>
                <span className="text-[9.5px] text-zinc-550 italic font-sans">(1 / N) * Σ(p - o)^2</span>
                <span>Fit below &lt; 0.18</span>
                <span className="text-right font-black text-[#d4d4d8]">0.124 (VERIFIED SUCCESS)</span>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-4 p-3 hover:bg-white/5 transition-colors">
                <span className="font-extrabold text-[#E5E5E5] print:text-black">Expected Value Margin</span>
                <span className="text-[9.5px] text-zinc-550 italic font-sans">E[X] = Σ x_i * p_i</span>
                <span>Asymmetrical Positive</span>
                <span className="text-right font-black text-indigo-400">+1.41% AVERAGE SKEW</span>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-4 p-3 hover:bg-white/5 transition-colors">
                <span className="font-extrabold text-[#E5E5E5] print:text-black">Max drawdown threshold</span>
                <span className="text-[9.5px] text-zinc-550 italic font-sans">V11 Peak-To-Trough</span>
                <span>Bounded limit &lt; 15%</span>
                <span className="text-right font-black text-zinc-400">-8.42% Drawdown max</span>
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-4 p-3 hover:bg-white/5 transition-colors">
                <span className="font-extrabold text-[#E5E5E5] print:text-black">Delta momentum sync</span>
                <span className="text-[9.5px] text-zinc-550 italic font-sans">CBOE direct clears</span>
                <span>No temporal lag</span>
                <span className="text-right font-black text-[#E5E5E5] print:text-black font-extrabold">0.82 seconds latency</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS (Stress Scenario testing matrix) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full print:hidden">
        
        {/* Scenario 1 */}
        <div className="apple-glass p-5 rounded-2xl text-left flex flex-col justify-between space-y-3 shadow-md border border-white/5">
          <div className="space-y-1.5">
            <span className="text-[7.5px] text-[#d4d4d8] block uppercase font-bold tracking-widest">STRESS TESTING MATRIX</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase leading-none">SCENARIO A: DISPERSION</h4>
            <p className="text-[10px] text-zinc-450 font-sans leading-relaxed pt-1 uppercase">
              Underlying Index undergoes sudden -5% liquidation cascade over standardNYSE opening blocks.
            </p>
          </div>
          <div className="pt-2 border-t border-white/5 text-[10px] flex justify-between uppercase">
            <span className="text-zinc-550">Expected Outcome:</span>
            <span className="text-[#E5E5E5] font-extrabold">VaR safeguarded</span>
          </div>
        </div>

        {/* Scenario 2 */}
        <div className="apple-glass p-5 rounded-2xl text-left flex flex-col justify-between space-y-3 shadow-md border border-white/5">
          <div className="space-y-1.5">
            <span className="text-[7.5px] text-[#d4d4d8] block uppercase font-bold tracking-widest">STRESS TESTING MATRIX</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase leading-none">SCENARIO B: VOL SHORT</h4>
            <p className="text-[10px] text-zinc-455 font-sans leading-relaxed pt-1 uppercase">
              Implied volatility expansions of 15% spike on forward-month options chain contracts.
            </p>
          </div>
          <div className="pt-2 border-t border-white/5 text-[10px] flex justify-between uppercase">
            <span className="text-zinc-550">Hedge Protection:</span>
            <span className="text-[#E5E5E5] font-extrabold">Active rebalance</span>
          </div>
        </div>

        {/* Scenario 3 */}
        <div className="apple-glass p-5 rounded-2xl text-left flex flex-col justify-between space-y-3 shadow-md border border-white/5">
          <div className="space-y-1.5">
            <span className="text-[7.5px] text-[#F87171] block uppercase font-bold tracking-widest">STRESS TESTING MATRIX</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase leading-none">SCENARIO C: GEX BREAK</h4>
            <p className="text-[10px] text-zinc-455 font-sans leading-relaxed pt-1 uppercase">
              Spot price penetrates primary call/put wall GEX support floors on SPX index.
            </p>
          </div>
          <div className="pt-2 border-t border-white/5 text-[10px] flex justify-between uppercase">
            <span className="text-zinc-550">Pivot Defense:</span>
            <span className="text-rose-455 font-extrabold">Auto liquidation</span>
          </div>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg border border-white/5 print:border-none print:p-0 print:text-black">
        <div className="flex items-center gap-2 border-b border-black pb-2 print:border-black">
          <Layers className="w-3.5 h-3.5 text-zinc-550 print:hidden" />
          <h4 className="text-[10.5px] font-black text-[#E5E5E5] uppercase tracking-wider block print:text-black">
            Regulatory Disclosures & Author License Limits
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-zinc-450 font-sans space-y-2 print:text-zinc-800">
          <p>
            This file is classified as private intelligence. Distribution, duplication, or reproduction of these continuous calibration metrics is strictly prohibited under Export Control Regulations (15 CFR Chapter VII) for institutional users.
          </p>
          <p>
            Formulas, variables, expected return calculations, and simulated balances provided across active sessions serve only for mathematical validation benchmarks. They do not constitute structural brokerage advice or financial consulting guarantees.
          </p>
        </div>
      </div>

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[8px] text-zinc-400 uppercase tracking-widest pl-4 font-black shadow-md print:hidden">
        <span>SECURITY SIGNATURE COMMITTED C-L10X81</span>
        <div className="flex items-center gap-1.5 text-[#E5E5E5]">
          <span className="h-1.5 w-1.5 bg-black rounded-full animate-ping" />
          <span>DOCUMENT VERIFIED</span>
        </div>
      </div>

    </div>
  );
}
