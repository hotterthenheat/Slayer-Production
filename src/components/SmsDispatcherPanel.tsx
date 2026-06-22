/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Smartphone, Send, ShieldCheck, Zap, RefreshCw, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { AssetInfo, SystemScore } from '../types';
import { calculateV10Metrics } from '../lib/v10Math';
import { formatTime } from '../lib/timeUtils';

interface SmsDispatcherPanelProps {
  selectedAsset: AssetInfo;
  isCall: boolean;
  systemScore: SystemScore;
  optionPremiumFloat: number;
  optionStrike: number;
}

export function SmsDispatcherPanel({
  selectedAsset,
  isCall,
  systemScore,
  optionPremiumFloat,
  optionStrike,
}: SmsDispatcherPanelProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchStage, setDispatchStage] = useState<number>(0);
  const [dispatchLogs, setDispatchLogs] = useState<string[]>([]);
  const [sentAlerts, setSentAlerts] = useState<Array<{ phone: string; message: string; timestamp: string }>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const dispatchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeContractTicker = `${selectedAsset.ticker} ${optionStrike}${isCall ? 'C' : 'P'}`;
  const metrics = calculateV10Metrics(selectedAsset, isCall, systemScore, optionPremiumFloat);

  const formatPhoneNumber = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  // SIMULATION ONLY. No real SMS is sent and no network/carrier call is made —
  // these lines preview how an alert payload would be assembled client-side.
  const mockTwilioSequence = [
    '[SIMULATION] Building alert payload from current contract metrics ...',
    '[SIMULATION] Calculating P(win) and dynamic fair value locally ...',
    '[SIMULATION] Formatting subscriber message preview ...',
    '[SIMULATION] Preview ready — NO message was transmitted to any device.'
  ];

  const handleSendSMS = () => {
    if (!phoneNumber) return;
    setIsDispatching(true);
    setDispatchStage(0);
    setDispatchLogs([]);

    let stage = 0;
    const interval = setInterval(() => {
      if (stage < mockTwilioSequence.length) {
        setDispatchLogs((prev) => [...prev, `[${formatTime(new Date())}] ${mockTwilioSequence[stage]}`]);
        setDispatchStage(stage + 1);
        stage++;
      } else {
        clearInterval(interval);
        dispatchIntervalRef.current = null;
        setIsDispatching(false);

        // Build the simulated preview message shown on the mock device screen.
        // This is never transmitted — it only previews alert formatting locally.
        const alertMsg = `[SLAYER.TRADE ALERT] Best Contract detected: ${activeContractTicker} | Buy Zone: $${(metrics.entryZoneMin ?? 0).toFixed(2)}-$${(metrics.entryZoneMax ?? 0).toFixed(2)} | Current: $${(optionPremiumFloat ?? 0).toFixed(2)} | Bayesian Win Prob: ${metrics.posteriorWinRate}% | Expected Value (EV): +${(metrics.expectedValuePct ?? 0).toFixed(1)}% | GEX Support: supportive. Track at slayer.trade.`;
        setSentAlerts((prev) => [
          {
            phone: phoneNumber,
            message: alertMsg,
            timestamp: formatTime(new Date()),
          },
          ...prev,
        ]);
      }
    }, 850);
    dispatchIntervalRef.current = interval;
  };

  // Clear the dispatch interval on unmount so it can't fire setState afterwards.
  useEffect(() => {
    return () => {
      if (dispatchIntervalRef.current) clearInterval(dispatchIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [dispatchLogs]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm font-mono p-5 overflow-hidden shadow-lg h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-[var(--success)]" />
            <span className="text-xs tracking-[0.2em] font-bold text-[var(--text-primary)]">SMS DISPATCH PREVIEW</span>
          </div>
          <span className="text-[10px] text-[var(--warning)] font-bold uppercase select-none border border-[var(--warning)]/40 px-2 bg-[var(--surface-2)] py-0.5">SIMULATION</span>
        </div>

        <p className="text-[11px] text-[var(--text-secondary)] leading-normal mb-4 font-sans">
          Preview how this high Expected Value contract would format as an SMS alert. This is a client-side simulation only &mdash; no real message is sent and no Twilio/carrier call is made.
        </p>

        {/* Input area */}
        <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-sm mb-4">
          <div className="flex flex-col gap-2.5">
            <label className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">DEVICE REGISTER (MOBILE PHONE NUMBER)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2 text-[var(--text-tertiary)] text-xs tabular-nums">+1</span>
                <input
                  type="text"
                  placeholder="(555) 000-0000"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  disabled={isDispatching}
                  className="w-full bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--border-strong)] rounded-sm py-1.5 pl-8 pr-3 text-xs focus:outline-none transition-all font-mono tabular-nums"
                />
              </div>

              <button
                onClick={handleSendSMS}
                disabled={isDispatching || phoneNumber.length < 10}
                className="px-4 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--success)] font-bold uppercase rounded-sm cursor-pointer disabled:opacity-40 disabled:hover:border-[var(--border)] transition-all text-xs flex items-center gap-1 shrink-0"
              >
                {isDispatching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isDispatching ? 'BUILDING' : 'SIMULATE'}</span>
              </button>
            </div>
            {phoneNumber.length > 0 && phoneNumber.length < 14 && (
              <span className="text-[10px] text-[var(--danger)] flex items-center gap-1 mt-0.5">
                <AlertCircle className="w-3" /> Minimum 10 digits required to build the preview
              </span>
            )}
          </div>
        </div>

        {/* Simulation pipeline logs */}
        {dispatchLogs.length > 0 && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm p-3 mb-4 h-[120px] overflow-y-auto custom-scrollbar text-[10px] leading-relaxed text-[var(--text-secondary)] select-text">
            <div className="text-[var(--text-tertiary)] border-b border-[var(--border)] pb-1 mb-1 font-bold tracking-wider text-[10px] uppercase">
              SMS PREVIEW PIPELINE [SIMULATION]
            </div>
            {dispatchLogs.map((log, i) => {
              const isLast = i === dispatchLogs.length - 1;
              return (
                <div key={i} className={`tabular-nums ${isLast ? 'text-[var(--success)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
                  {log}
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Mock phone screen displaying the simulated alert preview */}
      <div>
        <div className="text-[10px] uppercase text-[var(--text-tertiary)] font-bold mb-1.5 select-none text-center">
           SIMULATED SUBSCRIBER MESSAGE PREVIEW
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm p-3 font-sans relative overflow-hidden min-h-[92px]">
          {/* Top Status Bar of Phone */}
          <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] font-mono tracking-tighter border-b border-[var(--border)] pb-1 mb-2">
            <span>SLAYER MOBILE HUB</span>
            <div className="flex gap-1.5 items-center tabular-nums">
              <span>LTE</span>
              <span>100%</span>
            </div>
          </div>

          {sentAlerts.length > 0 ? (
            <div className="flex flex-col gap-2">
              {sentAlerts.slice(0, 1).map((alert, idx) => (
                <div key={idx} className="bg-[var(--surface-2)] text-[var(--text-primary)] p-2.5 rounded-lg text-[10px] leading-snug w-[92%] ml-auto shadow-md border border-[var(--border)] animate-slideUp relative">
                  <span className="absolute -left-10 text-[10px] font-mono tabular-nums text-[var(--text-tertiary)] top-1">{alert.timestamp}</span>
                  <div className="font-semibold font-mono text-[10px] text-[var(--success)] mb-0.5">SLAYER.TRADE</div>
                  {alert.message}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 text-center text-[var(--text-tertiary)] text-[10.5px]">
              <Smartphone className="w-5 text-[var(--text-tertiary)] mb-1" />
              <span>Enter a phone number above and run Simulate to build a preview SMS on this mock display. Nothing is sent.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
