import React, { useMemo } from 'react';
import { FileText, Printer, Layers } from 'lucide-react';
import { useContractStore } from '../lib/store';
import { V8TradeRecord } from '../types';

export function ReportsView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const serverState = useContractStore((s) => s.serverState);

  // Premium-gated: trade_archive can be undefined when not connected/entitled.
  const archive: V8TradeRecord[] | undefined = serverState?.trade_archive;

  // Compute report figures from the real trade archive when present. If there is
  // no audited data, the whole report renders under a SAMPLE / ILLUSTRATIVE label
  // and the figures are clearly marked as model placeholders, not measurements.
  const report = useMemo(() => {
    const closed = (archive || []).filter((t) => t.finalOutcome !== 'Active');
    if (closed.length === 0) {
      return { isReal: false, count: 0, evMargin: null as number | null, maxDrawdown: null as number | null, winRate: null as number | null };
    }
    const wins = closed.filter((t) => t.finalOutcome !== 'Failure');
    const winRate = (wins.length / closed.length) * 100;
    // Expected-value margin: average realized PnL across closed setups.
    const evMargin = closed.reduce((acc, t) => acc + (t.finalOutcome !== 'Failure' ? t.maxGain : -t.maxDrawdown), 0) / closed.length;
    const maxDrawdown = Math.max(0, ...closed.map((t) => t.maxDrawdown));
    return { isReal: true, count: closed.length, evMargin, maxDrawdown, winRate };
  }, [archive]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full text-[var(--success)] flex flex-col font-mono select-none antialiased space-y-6 print:bg-white print:text-black">

      {/* 1. HEADER (REPORT EXPORTER CONTROL) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg print:hidden">
        <div className="flex gap-2 items-center">
          <FileText className="w-4 h-4 text-[var(--success)]" />
          <span className="text-[10px] text-[var(--success)] uppercase tracking-widest font-black">
            SLAYER PERFORMANCE REPORT CARD // EXPORT READY
          </span>
        </div>

        {/* Export triggers */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-white hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] text-black font-extrabold uppercase rounded-lg transition-colors cursor-pointer text-[10px] tracking-widest flex items-center gap-1 shadow"
          >
            <Printer className="w-3" />
            <span>PRINT / SAVE PDF</span>
          </button>
          <div className="bg-[var(--surface)] px-3 py-1.5 border border-[var(--border)] text-[10px] text-[var(--text-tertiary)] uppercase font-black rounded-lg">
            CLASSIFICATION: PRIVATE
          </div>
        </div>
      </div>

      {/* 2. PRIMARY HERO CARD (mathematical validation report) */}
      <div className="w-full animate-fadeIn">
        <div className="apple-glass rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl text-left space-y-6 border border-[var(--border)] print:border-none print:bg-white print:p-0">

          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[var(--success)] via-indigo-500 to-[var(--success)] print:hidden" />

          {/* Document Header */}
          <div className="border-b-2 border-[var(--border)] pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="space-y-1">
              <span className="text-[10px] text-[var(--success)] tracking-[0.25em] font-black block uppercase">PRIVATE PERFORMANCE LEDGER</span>
              <h2 className="text-xl md:text-2xl font-black text-[var(--text-primary)] font-sans tracking-tight uppercase leading-none print:text-black">
                MATHEMATICAL VALIDATION REPORT
              </h2>
              {!report.isReal && (
                <span className="inline-block mt-1.5 text-[10px] text-[var(--warning)] tracking-widest font-black uppercase bg-[var(--surface)] border border-[var(--warning)]/40 px-2 py-0.5 rounded">
                  SAMPLE / ILLUSTRATIVE — NOT AUDITED
                </span>
              )}
            </div>

            <div className="flex flex-col text-right text-[10px] text-[var(--text-tertiary)] font-mono self-start sm:self-center">
              <span>BASIS: {report.isReal ? `${report.count} CLOSED SETUPS` : 'NO ARCHIVED DATA'}</span>
              <span>INDEX: {selectedAsset.ticker}</span>
              <span className="tabular-nums">GENERATED: {new Date().toLocaleDateString()}</span>
            </div>
          </div>

          <p className="text-[11px] font-sans text-[var(--text-secondary)] leading-relaxed font-light print:text-zinc-800">
            {report.isReal ? (
              <>This report presents quantitative validation findings from the V11 continuous options scoring pipeline, computed over {report.count} closed setups recorded in the trade archive. Figures below are derived directly from logged outcomes.</>
            ) : (
              <>No audited trade archive is available for this session, so the figures below are illustrative model placeholders, not measured results. Connect a data source and accumulate closed setups for verified statistics.</>
            )}
          </p>

          {/* TABULAR REPORT CARD */}
          <div className="border border-[var(--border)] rounded-xl bg-[var(--surface)] overflow-hidden shadow-inner print:border-black print:bg-white">
            <div className="grid grid-cols-4 bg-[var(--surface-2)] p-3 text-[10px] text-[var(--text-tertiary)] border-b border-[var(--border)] uppercase font-bold tracking-wider print:bg-black print:text-black">
              <span>METRIC CLASSIFICATION</span>
              <span>FORMULA MODEL BASIS</span>
              <span>TARGET CALIBRATION</span>
              <span className="text-right">{report.isReal ? 'ACTUAL PERFORMANCE' : 'MODEL SAMPLE'}</span>
            </div>

            <div className="divide-y divide-[var(--border)] font-mono text-[10.5px] text-[var(--success)] print:divide-zinc-200 print:text-black">
              {/* Row 1: Win Rate */}
              <div className="grid grid-cols-4 p-3 hover:bg-[var(--surface-2)] transition-colors">
                <span className="font-extrabold text-[var(--text-primary)] print:text-black">Win rate</span>
                <span className="text-[10px] text-[var(--text-tertiary)] italic font-sans">wins / closed setups</span>
                <span>Above &gt; 60%</span>
                <span className="text-right font-black text-[var(--text-primary)] tabular-nums">
                  {report.isReal ? `${report.winRate!.toFixed(1)}%` : '—'}
                </span>
              </div>

              {/* Row 2: Expected Value Margin */}
              <div className="grid grid-cols-4 p-3 hover:bg-[var(--surface-2)] transition-colors">
                <span className="font-extrabold text-[var(--text-primary)] print:text-black">Expected Value Margin</span>
                <span className="text-[10px] text-[var(--text-tertiary)] italic font-sans">E[X] = Σ x_i * p_i</span>
                <span>Asymmetrical Positive</span>
                <span className="text-right font-black text-[var(--info)] tabular-nums">
                  {report.isReal ? `${report.evMargin! >= 0 ? '+' : ''}${report.evMargin!.toFixed(2)}% AVG` : '—'}
                </span>
              </div>

              {/* Row 3: Max drawdown */}
              <div className="grid grid-cols-4 p-3 hover:bg-[var(--surface-2)] transition-colors">
                <span className="font-extrabold text-[var(--text-primary)] print:text-black">Max drawdown observed</span>
                <span className="text-[10px] text-[var(--text-tertiary)] italic font-sans">Peak-To-Trough</span>
                <span>Bounded limit &lt; 15%</span>
                <span className="text-right font-black text-[var(--text-secondary)] tabular-nums">
                  {report.isReal ? `-${report.maxDrawdown!.toFixed(2)}%` : '—'}
                </span>
              </div>

              {/* Row 4: Sample size */}
              <div className="grid grid-cols-4 p-3 hover:bg-[var(--surface-2)] transition-colors">
                <span className="font-extrabold text-[var(--text-primary)] print:text-black">Sample size</span>
                <span className="text-[10px] text-[var(--text-tertiary)] italic font-sans">closed setups logged</span>
                <span>Larger is better</span>
                <span className="text-right font-black text-[var(--text-primary)] print:text-black tabular-nums">
                  {report.isReal ? report.count : '0'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS (Stress Scenario testing matrix) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full print:hidden">
        <div className="apple-glass p-5 rounded-2xl text-left flex flex-col justify-between space-y-3 shadow-md border border-[var(--border)]">
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold tracking-widest">STRESS TESTING MATRIX — MODEL</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase leading-none">SCENARIO A: DISPERSION</h4>
            <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed pt-1 uppercase">
              Underlying Index undergoes a sudden -5% liquidation cascade over standard NYSE opening blocks.
            </p>
          </div>
          <div className="pt-2 border-t border-[var(--border)] text-[10px] flex justify-between uppercase">
            <span className="text-[var(--text-tertiary)]">Modeled Outcome:</span>
            <span className="text-[var(--text-primary)] font-extrabold">VaR safeguarded</span>
          </div>
        </div>

        <div className="apple-glass p-5 rounded-2xl text-left flex flex-col justify-between space-y-3 shadow-md border border-[var(--border)]">
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold tracking-widest">STRESS TESTING MATRIX — MODEL</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase leading-none">SCENARIO B: VOL SHORT</h4>
            <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed pt-1 uppercase">
              Implied volatility expansions of 15% spike on forward-month options chain contracts.
            </p>
          </div>
          <div className="pt-2 border-t border-[var(--border)] text-[10px] flex justify-between uppercase">
            <span className="text-[var(--text-tertiary)]">Hedge Protection:</span>
            <span className="text-[var(--text-primary)] font-extrabold">Active rebalance</span>
          </div>
        </div>

        <div className="apple-glass p-5 rounded-2xl text-left flex flex-col justify-between space-y-3 shadow-md border border-[var(--border)]">
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--danger)] block uppercase font-bold tracking-widest">STRESS TESTING MATRIX — MODEL</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase leading-none">SCENARIO C: GEX BREAK</h4>
            <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed pt-1 uppercase">
              Spot price penetrates primary call/put wall GEX support floors on the SPX index.
            </p>
          </div>
          <div className="pt-2 border-t border-[var(--border)] text-[10px] flex justify-between uppercase">
            <span className="text-[var(--text-tertiary)]">Pivot Defense:</span>
            <span className="text-[var(--danger)] font-extrabold">Auto liquidation</span>
          </div>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg border border-[var(--border)] print:border-none print:p-0 print:text-black">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2 print:border-black">
          <Layers className="w-3.5 h-3.5 text-[var(--text-tertiary)] print:hidden" />
          <h4 className="text-[10.5px] font-black text-[var(--text-primary)] uppercase tracking-wider block print:text-black">
            Disclosures & License Limits
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans space-y-2 print:text-zinc-800">
          <p>
            This file is private intelligence intended for the account holder only.
          </p>
          <p>
            Formulas, variables, expected return calculations, and any simulated balances shown across sessions serve as mathematical validation benchmarks. They do not constitute brokerage advice or any financial guarantee.
          </p>
        </div>
      </div>

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest pl-4 font-black shadow-md print:hidden">
        <span>{report.isReal ? `BASIS: ${report.count} CLOSED SETUPS` : 'BASIS: NO ARCHIVED DATA'}</span>
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <span className={`h-1.5 w-1.5 rounded-full ${report.isReal ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'}`} />
          <span>{report.isReal ? 'COMPUTED FROM ARCHIVE' : 'SAMPLE / ILLUSTRATIVE'}</span>
        </div>
      </div>

    </div>
  );
}
