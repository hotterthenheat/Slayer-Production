import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, RefreshCw, Send, AlertCircle, Cpu, Wifi, Database, Layers } from 'lucide-react';
import { useContractStore } from '../lib/store';
import { formatTime } from '../lib/timeUtils';

export function AutomationView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const activeContract = useContractStore((s) => s.activeContract);
  const serverState = useContractStore((s) => s.serverState);

  // SMS state (simulation only — see handleSendSMS)
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchLogs, setDispatchLogs] = useState<string[]>([]);
  const [sentAlerts, setSentAlerts] = useState<{ message: string; timestamp: string }[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const dispatchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Real per-tick option premium from the server payload (falls back to the
  // preloaded contract bridge value, then 0). No fabricated execution price.
  const activePrice = serverState?.optionPremiumFloat ?? 0;
  const hasLivePrice = typeof serverState?.optionPremiumFloat === 'number';
  const decisionStrategy = activeContract?.recommendation || 'HOLD';
  const expectedValuePct = activeContract?.expectedMove || 1.1;
  const pipelineLive = !!serverState;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let clean = e.target.value.replace(/\D/g, '');
    if (clean.length > 10) clean = clean.slice(0, 10);
    
    // Apply (XXX) XXX-XXXX mask
    let formatted = '';
    if (clean.length > 0) {
      formatted += '(' + clean.slice(0, 3);
    }
    if (clean.length > 3) {
      formatted += ') ' + clean.slice(3, 6);
    }
    if (clean.length > 6) {
      formatted += '-' + clean.slice(6, 10);
    }
    setPhoneNumber(formatted);
  };

  const handleSendSMS = () => {
    if (phoneNumber.replace(/\D/g, '').length < 10) return;
    setIsDispatching(true);
    setDispatchLogs([]);

    // Clear any timers still pending from a previous dispatch before scheduling new ones.
    dispatchTimers.current.forEach(clearTimeout);
    dispatchTimers.current = [];

    const cleanNum = phoneNumber.replace(/\D/g, '');
    // SIMULATION ONLY — no SMPP socket, no Twilio call, no message transmitted.
    const steps = [
      `[SIMULATION] Building alert payload for +1 ${cleanNum} ...`,
      `[SIMULATION] Encoding parameters for ${selectedAsset.ticker} ${decisionStrategy} signal ...`,
      `[SIMULATION] Formatting subscriber message preview ...`,
      `[SIMULATION] Preview ready — NO SMS was transmitted to any device.`
    ];

    steps.forEach((step, idx) => {
      const timer = setTimeout(() => {
        setDispatchLogs((prev) => [...prev, `[${formatTime(new Date())}] ${step}`]);
        if (idx === steps.length - 1) {
          setIsDispatching(false);
          const priceStr = hasLivePrice ? `$${activePrice.toFixed(2)}` : 'n/a (no live premium)';
          const alertMsg = `Slayer Terminal [SAMPLE]: ${selectedAsset.ticker} ${decisionStrategy} signal. Expected target premium movement +${expectedValuePct}%. Premium ${priceStr}. GEX bounds consolidated.`;
          setSentAlerts((prev) => [
            { message: alertMsg, timestamp: formatTime(new Date()) },
            ...prev
          ]);
        }
      }, (idx + 1) * 600);
      dispatchTimers.current.push(timer);
    });
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [dispatchLogs]);

  // Clear any pending dispatch timers if the view unmounts mid-sequence.
  useEffect(() => () => { dispatchTimers.current.forEach(clearTimeout); }, []);

  return (
    <div className="w-full text-[var(--success)] flex flex-col font-mono select-none antialiased space-y-6">

      {/* 1. HEADER (DISPATCH SEQUENCE) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Cpu className="w-4 h-4 text-[var(--success)]" />
          <span className="text-[10px] text-[var(--success)] uppercase tracking-widest font-black">
            SLAYER AUTOMATION PIPELINE // SMS PREVIEW
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--surface-2)] p-1 px-1.5 border border-[var(--warning)]/40 rounded-lg text-[10px] text-[var(--warning)] font-bold uppercase">
          DEMO — NO REAL SMS SENT
        </div>
      </div>

      {/* 2. PIPELINE STATUS ROW (compact, textual — no decorative node graph) */}
      <div className="w-full animate-fadeIn">
        <div className="apple-glass rounded-2xl p-6 relative overflow-hidden shadow-2xl space-y-4 border border-[var(--border)]">
          <div className="border-b border-[var(--border)] pb-3 flex justify-between items-start">
            <div className="text-left space-y-1">
              <span className="text-[10px] text-[var(--text-tertiary)] tracking-[0.25em] font-black block">PIPELINE STATUS</span>
              <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans">
                DISPATCH PIPELINE
              </h2>
            </div>
            <span className="text-[10px] bg-[var(--warning)]/20 text-[var(--warning)] border border-[var(--warning)]/40 font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-widest leading-none">
              DEMO
            </span>
          </div>

          {/* Compact textual pipeline-status row (replaces the decorative SVG graph) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { stage: 'FEED', label: 'Market Data', state: pipelineLive ? 'CONNECTED' : 'WAITING', icon: <Wifi className="w-3" /> },
              { stage: 'ENGINE', label: 'GEX / Edge', state: pipelineLive ? 'COMPUTED' : 'IDLE', icon: <Database className="w-3" /> },
              { stage: 'RISK', label: 'Invalidation', state: decisionStrategy, icon: <Layers className="w-3" /> },
              { stage: 'DISPATCH', label: 'SMS Preview', state: 'SIMULATED', icon: <Smartphone className="w-3" /> },
            ].map((node) => (
              <div key={node.stage} className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-xl text-left flex flex-col justify-between gap-2 shadow-md">
                <div>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-bold block uppercase">{node.stage}</span>
                  <span className="text-[11px] font-black text-[var(--text-primary)] block">{node.label}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] tabular-nums">
                  {node.icon}
                  <span className="uppercase font-bold">{node.state}</span>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS (Side-by-side dispatcher inputs + cell view) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        
        {/* Left Side: SMS Cockpit Input & Simulation Logs */}
        <div className="apple-glass p-6 rounded-2xl flex flex-col justify-between space-y-4 shadow-lg border border-[var(--border)]">
          <div className="text-left space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">SMS PREVIEW INPUT</span>
              <span className="text-[10px] text-[var(--warning)] font-bold uppercase">SIMULATION</span>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] font-sans leading-snug">
              Preview how the current high expected value contract would format as an SMS alert. This is a client-side simulation &mdash; no message is transmitted.
            </p>

            <div className="bg-[var(--surface-2)] border border-[var(--border)] p-4 rounded-xl flex flex-col gap-3">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-black block">DEVICE PHONE REGISTRY</span>
              <div className="flex gap-2.5">
                <div id="phone-prefix-wrap" className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-[var(--text-tertiary)] text-xs font-bold tabular-nums">+1</span>
                  <input
                    type="text"
                    placeholder="(500) 000-0000"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    disabled={isDispatching}
                    className="w-full bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--border-strong)] rounded-lg py-2.5 pl-8 pr-3 text-xs focus:outline-none transition-all font-mono font-bold tabular-nums"
                  />
                </div>

                <button
                  onClick={handleSendSMS}
                  disabled={isDispatching || phoneNumber.replace(/\D/g, '').length < 10}
                  className="px-5 py-2.5 bg-[var(--surface-3)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] font-extrabold uppercase rounded-lg cursor-pointer disabled:opacity-30 transition-all text-[10px] flex items-center gap-1 shrink-0 shadow hover:scale-[1.01]"
                >
                  {isDispatching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{isDispatching ? 'BUILDING' : 'SIMULATE'}</span>
                </button>
              </div>
              {phoneNumber.length > 0 && phoneNumber.replace(/\D/g, '').length < 10 && (
                <span className="text-[10px] text-[var(--warning)] flex items-center gap-1">
                  <AlertCircle className="w-3" /> ENTER A VALID PHONE NUMBER (MIN 10 DIGITS)
                </span>
              )}
            </div>

            {/* Simulation Logs */}
            {dispatchLogs.length > 0 && (
              <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3 h-[110px] overflow-y-auto text-[10px] leading-relaxed text-[var(--text-secondary)] scrolling-auto select-text font-mono">
                <span className="text-[var(--text-tertiary)] font-bold block uppercase border-b border-[var(--border)] pb-1 mb-1.5 font-sans tracking-wide">
                  SMS PREVIEW PIPELINE [SIMULATION]
                </span>
                {dispatchLogs.map((log, i) => {
                  const isLast = i === dispatchLogs.length - 1;
                  return (
                    <div key={i} className={`tabular-nums ${isLast ? 'text-[var(--text-primary)] font-bold' : 'text-[var(--text-secondary)]'}`}>
                      {log}
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Mock Device Preview Phone Screen */}
        <div className="apple-glass p-6 rounded-2xl flex flex-col justify-between shadow-lg border border-[var(--border)]">
          <div className="text-left space-y-3">
            <div className="border-b border-[var(--border)] pb-2">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-black block">SUBSCRIBER MOBILE HUB PREVIEW</span>
              <h3 className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider mt-0.5">
                Device Simulation
              </h3>
            </div>

            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 font-sans relative overflow-hidden min-h-[140px] flex flex-col justify-between">

              {/* Phone Status Grid */}
              <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] font-mono tracking-wider border-b border-[var(--border)] pb-1 mb-2 font-black">
                <span>SLAYER NODE HUB</span>
                <div className="flex gap-2 items-center tabular-nums">
                  <span>NET5</span>
                  <span className="text-[var(--text-secondary)] font-bold">100%</span>
                </div>
              </div>

              {sentAlerts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {sentAlerts.slice(0, 1).map((alert, idx) => (
                    <div key={idx} className="bg-[var(--surface-3)] text-[var(--text-primary)] p-3 rounded-lg text-[10px] leading-relaxed w-[95%] ml-auto shadow-md border border-[var(--border)] animate-slideUp relative">
                      <span className="absolute -left-9 text-[10px] font-mono tabular-nums text-[var(--text-tertiary)] top-1">{alert.timestamp}</span>
                      <div className="font-extrabold font-mono text-[10px] text-[var(--text-secondary)] mb-0.5">SLAYER.TRADE</div>
                      {alert.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center text-[var(--text-tertiary)] text-[10px] font-mono leading-relaxed uppercase">
                  <Smartphone className="w-5 text-[var(--text-tertiary)] mb-1" />
                  <span>Run Simulate to build a preview message on this mock display. Nothing is sent.</span>
                </div>
              )}

              <div className="h-1" /> {/* bottom spacer */}
            </div>
          </div>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg border border-[var(--border)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <Layers className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <h4 className="text-[10.5px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
            About this preview [DEMO]
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans space-y-2">
          <p>
            This panel is a client-side simulation of how a contract alert would be formatted for SMS delivery. It does not open any network socket, does not contact Twilio or any carrier, and does not transmit a message to the entered phone number.
          </p>
          <p>
            The premium shown in the preview is the live <code className="text-[var(--text-primary)]">optionPremiumFloat</code> from the server payload when available; all other copy is illustrative sample text.
          </p>
        </div>
      </div>

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[10px] text-[var(--text-secondary)] uppercase tracking-widest pl-4 font-black shadow-md">
        <span>SMS PREVIEW — SIMULATION ONLY, NO TRANSMISSION</span>
        <div className="flex items-center gap-1.5 text-[var(--warning)] font-bold">
          <span className="h-1.5 w-1.5 bg-[var(--warning)] rounded-full" />
          <span>DEMO MODE</span>
        </div>
      </div>

    </div>
  );
}
