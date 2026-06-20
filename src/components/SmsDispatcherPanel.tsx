/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Smartphone, Send, ShieldCheck, Zap, RefreshCw, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { AssetInfo, SystemScore } from '../types';
import { calculateV10Metrics } from '../lib/v10Math';

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

  const mockTwilioSequence = [
    'ESTABLISHING TWILIO REST GATEWAY CLOUD GATEWAY LINK ...',
    'VERIFYING CRYPTOGRAPHIC HMAC TOKEN CARRIER BRIDGE ...',
    'COMPILING DEVIATION THREAD: CALCULATING P(WIN) AND DYNAMIC FAIR VALUE ...',
    'MESSAGE GENERATION SUCCESSFUL // FORMATTING ENCRYPTED PAYLOAD ...',
    'HANDSHARKING WITH MOBILITY PROTOCOLS (AT&T, VERIZON, T-MOBILE) ...',
    'CARRIER REPROJECTION: SUCCESS // DISPATCHED THROUGH HIGH-VOLUME SMS DIRECT SHORTCODE 75293 ...',
    'BROADCAST PROTOCOL COMPLETE // ALERT CONFIRMED ON TARGET CELLULAR TRANSPANEL'
  ];

  const handleSendSMS = () => {
    if (!phoneNumber) return;
    setIsDispatching(true);
    setDispatchStage(0);
    setDispatchLogs([]);

    let stage = 0;
    const interval = setInterval(() => {
      if (stage < mockTwilioSequence.length) {
        setDispatchLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${mockTwilioSequence[stage]}`]);
        setDispatchStage(stage + 1);
        stage++;
      } else {
        clearInterval(interval);
        dispatchIntervalRef.current = null;
        setIsDispatching(false);

        // Record the actual sent alert details to display on our mock mobile device screen!
        const alertMsg = `[SLAYER.TRADE ALERT] Best Contract detected: ${activeContractTicker} | Buy Zone: $${(metrics.entryZoneMin ?? 0).toFixed(2)}-$${(metrics.entryZoneMax ?? 0).toFixed(2)} | Current: $${(optionPremiumFloat ?? 0).toFixed(2)} | Bayesian Win Prob: ${metrics.posteriorWinRate}% | Expected Value (EV): +${(metrics.expectedValuePct ?? 0).toFixed(1)}% | GEX Support: supportive. Track at slayer.trade.`;
        setSentAlerts((prev) => [
          {
            phone: phoneNumber,
            message: alertMsg,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
    <div className="bg-black border border-black rounded-sm font-mono p-5 overflow-hidden shadow-lg h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-black pb-3 mb-4">
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-[#4ADE80] animate-pulse" />
            <span className="text-xs tracking-[0.2em] font-bold text-[#E0E0E0]">DIRECT SMS DISPATCH COCKPIT</span>
          </div>
          <span className="text-[9px] text-[#888888] font-bold uppercase select-none border border-black px-2 bg-black/40 py-0.5">V10 MOBILITY EDGE</span>
        </div>

        <p className="text-[11px] text-zinc-400 leading-normal mb-4 font-sans">
          Route this high Expected Value contract directly to your device via Twilio SMS carrier streams. Subscribers receive real-time updates as Bayesian offsets fluctuate.
        </p>

        {/* Input area */}
        <div className="bg-black/40 border border-black p-4 rounded-sm mb-4">
          <div className="flex flex-col gap-2.5">
            <label className="text-[10px] text-zinc-500 uppercase font-bold">DEVICE REGISTER (MOBILE PHONE NUMBER)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2 text-zinc-650 text-xs">+1</span>
                <input
                  type="text"
                  placeholder="(555) 000-0000"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  disabled={isDispatching}
                  className="w-full bg-black text-[#E5E5E5] border border-black focus:border-black rounded-sm py-1.5 pl-8 pr-3 text-xs focus:outline-none transition-all font-mono"
                />
              </div>

              <button
                onClick={handleSendSMS}
                disabled={isDispatching || phoneNumber.length < 10}
                className="px-4 py-1.5 bg-black/40 border border-black hover:border-black text-[#4ADE80] font-bold uppercase rounded-sm cursor-pointer disabled:opacity-40 disabled:hover:border-transparent transition-all text-xs flex items-center gap-1 shrink-0"
              >
                {isDispatching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isDispatching ? 'ROUTING' : 'DISPATCH'}</span>
              </button>
            </div>
            {phoneNumber.length > 0 && phoneNumber.length < 14 && (
              <span className="text-[9px] text-[#F87171] flex items-center gap-1 mt-0.5">
                <AlertCircle className="w-3" /> Minimum 10 digits required for telecom routing
              </span>
            )}
          </div>
        </div>

        {/* Twilio Handshake Debug Logs */}
        {dispatchLogs.length > 0 && (
          <div className="bg-black border border-black rounded-sm p-3 mb-4 h-[120px] overflow-y-auto custom-scrollbar text-[9px] leading-relaxed text-zinc-400 select-text">
            <div className="text-zinc-550 border-b border-black pb-1 mb-1 font-bold tracking-wider text-[8px] uppercase">
              DEVIATION SMS DISPATCH PIPELINE LOGS
            </div>
            {dispatchLogs.map((log, i) => {
              const isLast = i === dispatchLogs.length - 1;
              return (
                <div key={i} className={`${isLast ? 'text-[#4ADE80] font-semibold' : 'text-zinc-400'}`}>
                  {log}
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Mock Physical Phone Screen Interface displaying the text alert! */}
      <div>
        <div className="text-[8.5px] uppercase text-zinc-650 font-bold mb-1.5 select-none text-center">
          📱 SIMULATED SUBSCRIBER MESSAGE PREVIEW
        </div>
        <div className="bg-black border border-black rounded-sm p-3 font-sans relative overflow-hidden min-h-[92px]">
          {/* Top Status Bar of Phone */}
          <div className="flex justify-between items-center text-[8px] text-zinc-550 font-mono tracking-tighter border-b border-black pb-1 mb-2">
            <span>SLAYER MOBILE HUB</span>
            <div className="flex gap-1.5 items-center">
              <span>LTE</span>
              <span>100%</span>
            </div>
          </div>

          {sentAlerts.length > 0 ? (
            <div className="flex flex-col gap-2">
              {sentAlerts.slice(0, 1).map((alert, idx) => (
                <div key={idx} className="bg-black text-[#E5E5E5] p-2.5 rounded-lg text-[10px] leading-snug w-[92%] ml-auto shadow-md border border-black animate-slideUp relative">
                  <span className="absolute -left-10 text-[8px] font-mono text-zinc-600 top-1">{alert.timestamp}</span>
                  <div className="font-semibold font-mono text-[9px] text-[#4ADE80] mb-0.5">SLAYER.TRADE</div>
                  {alert.message}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 text-center text-zinc-600 text-[10.5px]">
              <Smartphone className="w-5 text-zinc-700 mb-1" />
              <span>Enter phone above and commit Direct Dispatch to receive live simulated SMS on this display framework.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
