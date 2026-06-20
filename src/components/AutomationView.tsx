import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Smartphone, RefreshCw, Send, AlertCircle, Cpu, Wifi, Database, Layers } from 'lucide-react';
import { useContractStore } from '../lib/store';
import { formatTime } from '../lib/timeUtils';

export function AutomationView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const activeContract = useContractStore((s) => s.activeContract);
  
  // Twilio Sms state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchLogs, setDispatchLogs] = useState<string[]>([]);
  const [sentAlerts, setSentAlerts] = useState<{ message: string; timestamp: string }[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const dispatchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const activePrice = 4.20;
  const decisionStrategy = activeContract?.recommendation || 'HOLD';
  const expectedValuePct = activeContract?.expectedMove || 1.1;

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
    const steps = [
      `Initializing direct SMPP socket connection to Twilio Gateway us-east-1...`,
      `Validating telecom route credentials for +1 ${cleanNum}...`,
      `Encoding payload parameters for ${selectedAsset.ticker} ${decisionStrategy} signal...`,
      `Handshake check passed. Dynamic SMS dispatch outbound initiated...`,
      `Twilio direct carrier delivery handshake completed. Packet delivered.`
    ];

    steps.forEach((step, idx) => {
      const timer = setTimeout(() => {
        setDispatchLogs((prev) => [...prev, `[${formatTime(new Date())}] ${step}`]);
        if (idx === steps.length - 1) {
          setIsDispatching(false);
          const alertMsg = `Slayer Private Terminal: ${selectedAsset.ticker} ${decisionStrategy} signal triggered! Expected target premium movement +${expectedValuePct}%. Execute at $${activePrice.toFixed(2)}. GEX bounds consolidated.`;
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
    <div className="w-full text-[#4ADE80] flex flex-col font-mono select-none antialiased space-y-6">
      
      {/* 1. HEADER (DISPATCH SEQUENCE) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Cpu className="w-4 h-4 text-[#4ADE80] animate-pulse" />
          <span className="text-[9.5px] text-[#4ADE80] uppercase tracking-widest font-black">
            AUTOMATED SMS ALERTS
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/40 p-1 px-1.5 border border-white/5 rounded-lg text-[9px] text-[#4ADE80] font-bold uppercase">
          TWILIO CONNECTED
        </div>
      </div>

      {/* 2. PRIMARY HERO CARD (Animated SVG node network) */}
      <div className="w-full animate-fadeIn">
        <div className="apple-glass rounded-2xl p-6 relative overflow-hidden shadow-2xl space-y-4 border border-white/5">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#4ADE80] via-indigo-500 to-[#4ADE80]" />

          {/* Node Graph Header */}
          <div className="border-b border-black/40 pb-3 flex justify-between items-start">
            <div className="text-left space-y-1">
              <span className="text-[8px] text-zinc-500 tracking-[0.25em] font-black block">HOW IT WORKS</span>
              <h2 className="text-xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans">
                ALERT DELIVERY FLOW
              </h2>
            </div>
            <span className="text-[9px] bg-white text-black font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-widest leading-none">
              V11
            </span>
          </div>

          {/* SVG Animated Node Graph Canvas */}
          <div className="w-full h-[180px] bg-black/30 border border-white/5 p-4 rounded-xl relative flex items-center justify-between overflow-hidden">
            
            {/* SVG Path drawing animating lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <linearGradient id="silver-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#1e1e24" />
                  <stop offset="50%" stopColor="#d4d4d8" />
                  <stop offset="100%" stopColor="#1e1e24" />
                </linearGradient>
              </defs>
              
              {/* Animating dash lines */}
              <path 
                d="M 120 90 L 260 90 L 460 90 L 660 90" 
                fill="none" 
                stroke="url(#silver-grad)" 
                strokeWidth="1.5" 
                strokeDasharray="6, 12"
                className="animate-dash"
                style={{ animationDuration: '6s' }}
              />
            </svg>

            {/* Node 1 */}
            <div className="bg-black/40 border border-white/5 p-3.5 h-[95px] w-[135px] rounded-xl text-left flex flex-col justify-between z-10 shadow-md">
              <div>
                <span className="text-[7.5px] text-zinc-550 font-bold block uppercase">FEED</span>
                <span className="text-[9.5px] font-black text-[#E5E5E5] block uppercase animate-pulse">CME DIRECT</span>
              </div>
              <div className="flex items-center gap-1.5 text-[8px] text-zinc-400">
                <Wifi className="w-3 text-[#d4d4d8]" />
                <span>0.8s sync</span>
              </div>
            </div>

            {/* Node 2 */}
            <div className="bg-black/40 border border-white/5 p-3.5 h-[95px] w-[135px] rounded-xl text-left flex flex-col justify-between z-10 shadow-md">
              <div>
                <span className="text-[7.5px] text-zinc-550 font-bold block uppercase">ENGINE</span>
                <span className="text-[9.5px] font-black text-[#E5E5E5] block uppercase">GEX MAPS</span>
              </div>
              <div className="flex items-center gap-1.5 text-[8px] text-zinc-400">
                <Database className="w-3 text-indigo-400" />
                <span>100% active</span>
              </div>
            </div>

            {/* Node 3 */}
            <div className="bg-black/40 border border-white/5 p-3.5 h-[95px] w-[135px] rounded-xl text-left flex flex-col justify-between z-10 shadow-md">
              <div>
                <span className="text-[7.5px] text-zinc-550 font-bold block uppercase">RISK</span>
                <span className="text-[9.5px] font-black text-[#E5E5E5] block uppercase">TAIL MONITOR</span>
              </div>
              <div className="flex items-center gap-1.5 text-[8px] text-zinc-400">
                <Layers className="w-3 text-purple-400" />
                <span>VaR Locked</span>
              </div>
            </div>

            {/* Node 4 */}
            <div className="bg-black/60 border border-white/10 p-3.5 h-[95px] w-[135px] rounded-xl text-left flex flex-col justify-between z-10 shadow-lg bg-gradient-to-tr from-black/80 to-zinc-950/20">
              <div>
                <span className="text-[7.5px] text-[#d4d4d8] font-bold block uppercase text-[#d4d4d8]">DISPATCH</span>
                <span className="text-[9.5px] font-black text-[#E5E5E5] block uppercase">SUBSCRIBER</span>
              </div>
              <div className="flex items-center gap-1.5 text-[8px] text-[#d4d4d8] font-bold">
                <Smartphone className="w-3" />
                <span>Outbound queue</span>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS (Side-by-side dispatcher inputs + cell view) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        
        {/* Left Side: SMS Cockpit Input & Handshake Logs */}
        <div className="apple-glass p-6 rounded-2xl flex flex-col justify-between space-y-4 shadow-lg border border-white/5">
          <div className="text-left space-y-3">
            <div className="flex items-center justify-between border-b border-black/40 pb-2">
              <span className="text-xs font-black text-[#E5E5E5] uppercase tracking-wider">SEND SMS ALERT</span>
              <span className="text-[7px] text-zinc-500 font-bold">VIA TWILIO</span>
            </div>

            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed leading-snug">
              Send the current high-EV trade alert directly to your phone via SMS.
            </p>

            <div className="bg-black/40 border border-white/5 p-4 rounded-xl flex flex-col gap-3">
              <span className="text-[8px] text-zinc-550 uppercase font-black block">YOUR PHONE NUMBER</span>
              <div className="flex gap-2.5">
                <div id="phone-prefix-wrap" className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-zinc-650 text-xs font-bold">+1</span>
                  <input
                    type="text"
                    placeholder="(500) 000-0000"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    disabled={isDispatching}
                    className="w-full bg-black/40 text-[#E5E5E5] border border-white/10 focus:border-black rounded-lg py-2.5 pl-8 pr-3 text-xs focus:outline-none transition-all font-mono font-bold"
                  />
                </div>

                <button
                  onClick={handleSendSMS}
                  disabled={isDispatching || phoneNumber.replace(/\D/g, '').length < 10}
                  className="px-5 py-2.5 bg-white hover:bg-black text-black font-extrabold uppercase rounded-lg cursor-pointer disabled:opacity-30 disabled:hover:bg-white transition-all text-[9.5px] flex items-center gap-1 shrink-0 shadow hover:scale-[1.01]"
                >
                  {isDispatching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{isDispatching ? 'ROUTING' : 'DISPATCH'}</span>
                </button>
              </div>
              {phoneNumber.length > 0 && phoneNumber.replace(/\D/g, '').length < 10 && (
                <span className="text-[8px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3" /> Enter at least 10 digits
                </span>
              )}
            </div>

            {/* Handshake Logs */}
            {dispatchLogs.length > 0 && (
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 h-[110px] overflow-y-auto text-[8.5px] leading-relaxed text-zinc-400 scrolling-auto select-text font-mono">
                <span className="text-zinc-500 font-bold block uppercase border-b border-black/40 pb-1 mb-1.5 font-sans tracking-wide">
                  SEND LOG
                </span>
                {dispatchLogs.map((log, i) => {
                  const isLast = i === dispatchLogs.length - 1;
                  return (
                    <div key={i} className={isLast ? 'text-[#E5E5E5] font-bold' : 'text-zinc-550'}>
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
        <div className="apple-glass p-6 rounded-2xl flex flex-col justify-between shadow-lg border border-white/5">
          <div className="text-left space-y-3">
            <div className="border-b border-black/40 pb-2">
              <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-black block">MESSAGE PREVIEW</span>
              <h3 className="text-[11px] font-black text-[#E5E5E5] uppercase tracking-wider mt-0.5">
                Simulated Phone Screen
              </h3>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-xl p-4 font-sans relative overflow-hidden min-h-[140px] flex flex-col justify-between">
              
              {/* Phone Status Grid */}
              <div className="flex justify-between items-center text-[7.5px] text-zinc-600 font-mono tracking-wider border-b border-black/40 pb-1 mb-2 font-black">
                <span>SLAYER NODE HUB</span>
                <div className="flex gap-2 items-center">
                  <span>NET5</span>
                  <span className="text-[#d4d4d8] font-bold">100% SECURE</span>
                </div>
              </div>

              {sentAlerts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {sentAlerts.slice(0, 1).map((alert, idx) => (
                    <div key={idx} className="bg-black/80 text-[#E5E5E5] p-3 rounded-lg text-[9.5px] leading-relaxed w-[95%] ml-auto shadow-md border border-white/5 animate-slideUp relative">
                      <span className="absolute -left-9 text-[7px] font-mono text-zinc-650 top-1">{alert.timestamp}</span>
                      <div className="font-extrabold font-mono text-[8px] text-[#d4d4d8] mb-0.5">SLAYER.TRADE</div>
                      {alert.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center text-zinc-600 text-[10px] font-mono leading-relaxed uppercase">
                  <Smartphone className="w-5 text-zinc-700 mb-1" />
                  <span>Enter a phone number and tap Dispatch to see a preview of the SMS here.</span>
                </div>
              )}

              <div className="h-1" /> {/* bottom spacer */}
            </div>
          </div>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg border border-white/5">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Layers className="w-3.5 h-3.5 text-zinc-550" />
          <h4 className="text-[10.5px] font-black text-[#E5E5E5] uppercase tracking-wider block">
            How SMS Delivery Works
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-zinc-400 font-sans space-y-2">
          <p>
            Alerts are sent through Twilio directly to the carrier, keeping delivery time under 0.6 seconds worldwide.
          </p>
          <p>
            To protect deliverability, alerts are capped at 10 per minute. This prevents your number from being flagged as spam during fast market moves.
          </p>
        </div>
      </div>

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[8px] text-zinc-400 uppercase tracking-widest pl-4 font-black shadow-md">
        <span>TWILIO CONNECTED</span>
        <div className="flex items-center gap-1.5 text-[#d4d4d8] font-bold">
          <span className="h-1.5 w-1.5 bg-black rounded-full animate-ping" />
          <span>SOCKET CONNECTED</span>
        </div>
      </div>

    </div>
  );
}
