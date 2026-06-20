/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useContractStore } from '../lib/store';
import type { WidgetType } from '../lib/workspace';
import { formatTime } from '../lib/timeUtils';

interface PaneProps {
  title: string;
  isMaximized?: boolean;
  onClose?: () => void;
  onMaximize?: () => void;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}

export function Pane({ title, isMaximized, onClose, onMaximize, onHeaderPointerDown, children }: PaneProps) {
  return (
    <div className="flex flex-col h-full w-full bg-black border border-[var(--grey-700)] rounded-[2px] overflow-hidden mirror-panel">
      <div
        onPointerDown={onHeaderPointerDown}
        className="h-6 shrink-0 flex items-center justify-between px-2 bg-black/60 border-b border-[var(--grey-700)] cursor-move select-none"
        style={{ touchAction: 'none' }}
      >
        <span className="text-[9px] font-mono font-bold tracking-widest text-[#A3A3A3] truncate">
          &gt; {title}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={onMaximize} className="w-4 h-4 flex items-center justify-center text-[#A3A3A3] hover:text-[#E5E5E5]">
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          {onClose && (
            <button onClick={onClose} className="w-4 h-4 flex items-center justify-center text-[#A3A3A3] hover:text-[#F87171]">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2.5 font-mono">{children}</div>
    </div>
  );
}

const RegimeScan = React.memo(({ ticker }: { ticker: string }) => {
  const serverState = useContractStore((s) => s.serverState);
  const score = serverState?.system_score?.total ?? 72;
  const status = score >= 80 ? 'HOLDING' : score >= 55 ? 'TESTING' : 'FAILING';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-widest">{ticker} Regime</span>
        <span className={`text-[10px] font-bold ${status === 'HOLDING' ? 'text-[#4ADE80]' : status === 'TESTING' ? 'text-[#A1A1AA]' : 'text-[#F87171]'}`}>[{status}]</span>
      </div>
      <div className="text-3xl font-black text-[#E5E5E5] tabular-nums">{Math.round(score)}</div>
      <div className="text-[9px] text-[#A3A3A3] uppercase tracking-widest">System Score</div>
      <div className="h-1.5 bg-[#1F1F1F] rounded-[2px] overflow-hidden">
        <div className="h-full bg-[#4ADE80]" style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  );
});

const WhaleSweeps = React.memo(() => {
  const items = ['4500 SPX 7615C // $1.5M SWEEP', '900 NDX 18300P // $0.8M BLOCK', '2100 QQQ 448C // $0.6M UNUSUAL'];
  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#A3A3A3] uppercase tracking-widest mb-1">Institutional Block Tape</div>
      {items.map((line, i) => (
        <div key={i} className="text-[10px] text-[#E5E5E5] tabular-nums truncate border-b border-[#1F1F1F] pb-0.5">{line}</div>
      ))}
    </div>
  );
});

// Monotonic counter so every generated flow row gets a stable, unique id. Rows are
// unshift-ed to the front of the list, so an array-index key would shift on every insert
// and cause React to mis-associate rows.
let liveFlowRowSeq = 0;

const LiveOptionsFlow = React.memo(() => {
  const generateMockFlow = () => {
    return Array.from({length: 14}).map((_, i) => {
      const isCall = Math.random() > 0.5;
      const types = ['SWEEP', 'BLOCK'];
      const tickers = ['SPX', 'QQQ', 'NDX', 'SPY', 'IWM'];
      const type = types[Math.floor(Math.random() * types.length)];
      const ticker = tickers[Math.floor(Math.random() * tickers.length)];
      const strike = Math.floor(Math.random() * 1000 + 4000) + (isCall ? 'C' : 'P');
      const size = '$' + (Math.random() * 2 + 0.1).toFixed(1) + 'M';
      const d = new Date();
      d.setMinutes(d.getMinutes() - i * 2 - Math.floor(Math.random() * 5));
      const time = formatTime(d);
      return { id: `flow-${liveFlowRowSeq++}`, time, size, ticker, strike, type, isBullish: isCall };
    });
  };

  const [flow, setFlow] = useState(generateMockFlow());

  useEffect(() => {
    const t = setInterval(() => {
      setFlow(prev => {
        const next = [...prev];
        const isCall = Math.random() > 0.5;
        const types = ['SWEEP', 'BLOCK'];
        const tickers = ['SPX', 'QQQ', 'NDX', 'SPY', 'IWM'];
        const type = types[Math.floor(Math.random() * types.length)];
        const ticker = tickers[Math.floor(Math.random() * tickers.length)];
        const strike = Math.floor(Math.random() * 1000 + 4000) + (isCall ? 'C' : 'P');
        const size = '$' + (Math.random() * 2 + 0.1).toFixed(1) + 'M';
        const time = formatTime(new Date());
        next.unshift({ id: `flow-${liveFlowRowSeq++}`, time, size, ticker, strike, type, isBullish: isCall });
        return next.slice(0, 50);
      });
    }, 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="text-[9px] font-black tracking-widest text-[#a1a1aa] uppercase mb-2 shrink-0">
        LIVE OPTIONS FLOW
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-[10px] tabular-data">
          <thead className="text-[9px] text-zinc-500 uppercase tracking-widest sticky top-0 bg-[#0A0A0A]/80 backdrop-blur-md z-10">
            <tr>
              <th className="py-1 min-w-[60px]">Time</th>
              <th className="py-1">Size</th>
              <th className="py-1">Ticker</th>
              <th className="py-1">Strike</th>
              <th className="py-1">Type</th>
            </tr>
          </thead>
          <tbody>
            {flow.map((row) => (
              <tr key={row.id} className="border-b border-[#1F1F1F] hover:bg-[#161616] transition-colors group">
                <td className="py-1.5" style={{ borderLeft: `2px solid ${row.isBullish ? 'var(--status-holding)' : 'var(--status-failing)'}`, paddingLeft: '6px' }}>
                  <span className="text-[#A3A3A3]">{row.time}</span>
                </td>
                <td className="py-1.5 text-[#E5E5E5] font-bold">{row.size}</td>
                <td className="py-1.5 text-[#A3A3A3] font-bold">{row.ticker}</td>
                <td className="py-1.5 text-[#A3A3A3]">{row.strike}</td>
                <td className="py-1.5">
                  <span className={`text-[9px] font-bold ${row.type === 'SWEEP' ? 'text-[#E5E5E5]' : 'text-[#A3A3A3]'}`}>
                    {row.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const SettingsWidget = React.memo(() => {
  const setActiveTab = useContractStore((s) => s.setActiveTab);
  return (
    <button onClick={() => setActiveTab('settings')} className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-[#E5E5E5] border border-[#1F1F1F] rounded-[2px] px-2 py-2 hover:bg-[#161616]">
      Open System Settings
    </button>
  );
});

const AdminWidget = React.memo(({ kind }: { kind: 'health' | 'crm' | 'fin' }) => {
  if (kind === 'health') {
    return (
      <div className="grid grid-cols-2 gap-2 text-center h-full">
        {[['Live', 942, 'text-[#4ADE80]'], ['Users', 1512, 'text-[#E5E5E5]'], ['Suspended', 12, 'text-[#A1A1AA]'], ['Banned', 3, 'text-[#F87171]']].map(([l, v, c]) => (
          <div key={l as string} className="bg-[#161616] border border-[#1F1F1F] rounded-[2px] p-2 flex flex-col justify-center">
            <div className="text-[8px] text-[#A3A3A3] uppercase tracking-widest">{l}</div>
            <div className={`text-lg font-black tabular-nums ${c}`}>{v as any}</div>
          </div>
        ))}
      </div>
    );
  }
  return <div className="text-[10px] text-[#A3A3A3] tabular-nums flex items-center justify-center h-full">Admin Data Stream</div>;
});

// Dense, Information-Rich Trading Widgets
const MockTerminalTable = ({ rows, headers }: { rows: any[][], headers: string[] }) => (
  <div className="flex-1 overflow-auto w-full">
    <table className="w-full text-left text-[9.5px] tabular-nums">
      <thead className="text-[8.5px] text-zinc-500 uppercase tracking-widest sticky top-0 bg-black z-10 border-b border-[#1F1F1F]">
        <tr>
          {headers.map((h, i) => <th key={i} className="py-1 px-1 font-bold">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-[#1F1F1F] hover:bg-[#111] transition-colors leading-tight">
            {r.map((c, j) => (
              <td key={j} className={`py-1 px-1 ${typeof c === 'string' && c.startsWith('+') ? 'text-[#4ADE80]' : typeof c === 'string' && c.startsWith('-') ? 'text-rose-500' : 'text-[#E5E5E5]'}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SkysVisionScannerWidget = React.memo(() => {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    setData([
      ['SPX', 'CALL', '5500', '92%', '+0.45', 'HOLDING'],
      ['QQQ', 'PUT', '440', '88%', '-0.12', 'TESTING'],
      ['TSLA', 'CALL', '180', '95%', '+1.20', 'HOLDING'],
      ['NVDA', 'CALL', '125', '91%', '+0.85', 'HOLDING'],
      ['IWM', 'PUT', '200', '76%', '-0.05', 'FAILING'],
      ['AAPL', 'CALL', '190', '84%', '+0.25', 'HOLDING'],
      ['AMD', 'CALL', '160', '89%', '+0.60', 'TESTING'],
      ['META', 'PUT', '480', '81%', '-0.40', 'HOLDING'],
    ]);
  }, []);
  return (
    <div className="flex flex-col h-full space-y-1">
      <div className="flex justify-between items-center bg-[#111] border border-[#1F1F1F] p-1.5 rounded-sm">
        <span className="text-[8.5px] font-black text-[#4ADE80] uppercase tracking-widest">Scanner Active <span className="animate-pulse">●</span></span>
        <span className="text-[8.5px] font-bold text-zinc-500 uppercase">Filtered: High Probability</span>
      </div>
      <MockTerminalTable headers={['Ticker', 'Direction', 'Strike', 'Edge', 'Flow', 'Status']} rows={data} />
    </div>
  );
});

const PinPointDealerWidget = React.memo(() => {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    setData([
      ['5500', '14.2M (Long)', '+2.1M'],
      ['5450', '8.5M (Long)', '+0.5M'],
      ['5400', '1.2M (Neutral)', '-0.1M'],
      ['5350', '-4.5M (Short)', '-1.2M'],
      ['5300', '-12.8M (Short)', '-3.4M'],
    ]);
  }, []);
  return (
    <div className="flex flex-col h-full space-y-1">
      <div className="flex justify-between items-center bg-[#111] border border-[#1F1F1F] p-1.5 rounded-sm">
        <span className="text-[8.5px] font-black text-[#E5E5E5] uppercase tracking-widest">Dealer Gamma Profile</span>
      </div>
      <MockTerminalTable headers={['Strike', 'Net Dealer Gamma', '1D Change']} rows={data} />
    </div>
  );
});

const LoadedStrikesWidget = React.memo(() => {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    setData([
      ['5500', '245k', '54k', 'BULLISH'],
      ['5450', '180k', '40k', 'BULLISH'],
      ['5400', '120k', '115k', 'NEUTRAL'],
      ['5350', '65k', '190k', 'BEARISH'],
      ['5300', '45k', '280k', 'BEARISH'],
    ]);
  }, []);
  return (
    <div className="flex flex-col h-full space-y-1">
      <div className="flex justify-between items-center bg-[#111] border border-[#1F1F1F] p-1.5 rounded-sm">
        <span className="text-[8.5px] font-black text-[#E5E5E5] uppercase tracking-widest">Key Resistance/Support</span>
      </div>
      <MockTerminalTable headers={['Strike', 'Call Vol', 'Put Vol', 'Bias']} rows={data} />
    </div>
  );
});

const MarketRegimeWidget = React.memo(() => {
  const [sys, setSys] = useState(84);
  useEffect(() => {
    const t = setInterval(() => setSys(s => Math.min(100, Math.max(0, s + (Math.random() > 0.5 ? 1 : -1)))), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col h-full justify-between space-y-2">
      <div className="flex justify-between items-center bg-[#111] border border-[#1F1F1F] p-1.5 rounded-sm">
         <span className="text-[8.5px] font-black text-[#4ADE80] uppercase tracking-widest">Current Regime: EXPANSION</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center border border-[#1F1F1F] bg-[#0A0A0A] rounded-sm">
         <div className="text-[32px] font-black text-[#E5E5E5] leading-none mb-1">{sys}</div>
         <div className="text-[8px] text-zinc-500 uppercase tracking-widest">System Score</div>
         <div className="w-3/4 h-1 mt-2 bg-[#1F1F1F] rounded overflow-hidden">
             <div className="h-full bg-[#4ADE80] transition-all" style={{ width: `${sys}%` }} />
         </div>
      </div>
    </div>
  );
});

const SimpleValueWidget = ({ title, value, sub }: { title: string, value: string, sub: string }) => (
  <div className="flex flex-col h-full items-center justify-center bg-[#0A0A0A] border border-[#1F1F1F] rounded-sm p-2">
    <div className="text-[36px] font-black text-[#E5E5E5] leading-none">{value}</div>
    <div className="text-[9px] font-bold text-[#4ADE80] uppercase tracking-widest mt-1 mb-0.5">{title}</div>
    <div className="text-[8px] text-zinc-500 uppercase tracking-widest">{sub}</div>
  </div>
);

export const SlayerScoreWidget = React.memo(() => <MarketRegimeWidget />);
export const VolatilityStateWidget = React.memo(() => <MarketRegimeWidget />);

export function renderWidget(type: WidgetType): React.ReactNode {
  switch (type) {
    case 'settings': return <SettingsWidget />;
    case 'server_health': return <AdminWidget kind="health" />;
    case 'user_crm': return <AdminWidget kind="crm" />;
    case 'financials': return <AdminWidget kind="fin" />;

    case 'skysvision_scanner': return <SkysVisionScannerWidget />;
    case 'skysvision_setups': return <SkysVisionScannerWidget />;
    case 'skysvision_setup_details': return <SimpleValueWidget title="Setup Details" value="PND" sub="Awaiting Selection" />;
    case 'skysvision_trade_thesis': return <SimpleValueWidget title="Trade Thesis" value="BULL" sub="Momentum Breakout" />;
    case 'skysvision_entry_levels': return <SimpleValueWidget title="Entry Levels" value="5445.5" sub="Optimal Entry" />;
    case 'skysvision_stop_levels': return <SimpleValueWidget title="Stop Levels" value="5430.0" sub="Hard Stop" />;
    case 'skysvision_target_levels': return <SimpleValueWidget title="Target Levels" value="5480.0" sub="Primary Target" />;
    case 'skysvision_confidence': return <SimpleValueWidget title="Confidence" value="92%" sub="High Probability" />;
    case 'skysvision_history': return <SkysVisionScannerWidget />;

    case 'dealer_positioning': return <PinPointDealerWidget />;
    case 'gex': return <PinPointDealerWidget />;
    case 'vex': return <PinPointDealerWidget />;
    case 'charm': return <PinPointDealerWidget />;
    case 'loaded_strikes': return <LoadedStrikesWidget />;
    case 'dealer_flow_analysis': return <PinPointDealerWidget />;
    case 'market_regime': return <MarketRegimeWidget />;
    case 'key_levels': return <LoadedStrikesWidget />;
    case 'institutional_positioning': return <PinPointDealerWidget />;
    
    default: return <div className="text-[10px] text-rose-500">Widget rendering not mapped</div>;
  }
}
