import React, { useState } from 'react';
import { motion } from 'motion/react';
import { HelpCircle, ShieldCheck, Pocket, Layers, RefreshCw, Key } from 'lucide-react';

export function SettingsView() {
  const [strictCompliance, setStrictCompliance] = useState(true);
  const [streamDampener, setStreamDampener] = useState(false);
  const [latencyLimit, setLatencyLimit] = useState(true);
  const [sandboxMode, setSandboxMode] = useState(true);

  return (
    <div className="w-full text-[#4ADE80] flex flex-col font-mono select-none antialiased space-y-6">
      
      {/* 1. HEADER (CONFIGS HEADER) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Key className="w-4 h-4 text-[#4ADE80]" />
          <span className="text-[9.5px] text-[#4ADE80] uppercase tracking-widest font-black">
            SLAYER CONFIG SYSTEM SETTINGS // RECENT SESSION
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/10 text-[#4ADE80] border border-black px-3 py-1 rounded-lg text-[9px] font-black uppercase">
          CLIENT STATE LOCAL VALIDATED
        </div>
      </div>

      {/* 2. PRIMARY HERO CARD (Apple-level aesthetic, enormous spacing, minimal controls) */}
      <div className="w-full flex justify-center animate-fadeIn">
        <div className="max-w-3xl w-full apple-glass rounded-2xl p-6 sm:p-10 relative overflow-hidden shadow-2xl flex flex-col justify-between border border-white/5">
          
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#4ADE80] via-indigo-500 to-[#4ADE80]" />

          {/* Settings title */}
          <div className="border-b border-white/5 pb-5 mb-6 text-left">
            <span className="text-[8px] text-zinc-550 tracking-[0.25em] font-black block uppercase">PREFERENCES HUB</span>
            <h2 className="text-xl sm:text-2xl font-black text-[#E5E5E5] tracking-tight uppercase leading-none font-sans mt-0.5">
              SYSTEM CONFIGURATIONS
            </h2>
          </div>

          {/* Highly generous negative space control rows */}
          <div className="space-y-6 text-left my-2">
            
            {/* Control index 1 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[#E5E5E5] uppercase tracking-wider block">
                  Model Strict Compliance mode
                </span>
                <p className="text-[10px] text-zinc-450 font-sans leading-relaxed leading-snug">
                  When active, execution recommendations strictly mandate both high htfAgreement and positive dealer GEX shielding. Neutral signals remain gated inside standard buffers.
                </p>
              </div>

              {/* Minimal toggle switch */}
              <button 
                onClick={() => setStrictCompliance(!strictCompliance)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${strictCompliance ? 'bg-[#d4d4d8]' : 'bg-black/40 border border-white/10'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow ${strictCompliance ? 'translate-x-5 bg-black' : 'translate-x-0 bg-black'}`} />
              </button>
            </div>

            {/* Control index 2 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[#E5E5E5] uppercase tracking-wider block">
                  CME Stream Dampener frequency
                </span>
                <p className="text-[10px] text-zinc-450 font-sans leading-relaxed leading-snug">
                  Smooth volatility updates by pooling consecutive SSE intervals. Throttles rendering calculations from 0.8s loops to 1.6s locks, reducing browser pipeline CPU overhead.
                </p>
              </div>

              <button 
                onClick={() => setStreamDampener(!streamDampener)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${streamDampener ? 'bg-[#d4d4d8]' : 'bg-black/40 border border-white/10'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow ${streamDampener ? 'translate-x-5 bg-black' : 'translate-x-0 bg-black'}`} />
              </button>
            </div>

            {/* Control index 3 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[#E5E5E5] uppercase tracking-wider block">
                  High Performance Latency limit
                </span>
                <p className="text-[10px] text-zinc-450 font-sans leading-relaxed leading-snug">
                  Enforces strict 200ms roundtrip timeout constraints on cloud-node calculations, falling back immediately to local calculations if network congestion swells.
                </p>
              </div>

              <button 
                onClick={() => setLatencyLimit(!latencyLimit)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${latencyLimit ? 'bg-[#d4d4d8]' : 'bg-black/40 border border-white/10'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow ${latencyLimit ? 'translate-x-5 bg-black' : 'translate-x-0 bg-black'}`} />
              </button>
            </div>

            {/* Control index 4 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[#E5E5E5] uppercase tracking-wider block">
                  Simulated Sandbox engine
                </span>
                <p className="text-[10px] text-zinc-450 font-sans leading-relaxed leading-snug">
                  Enables mock terminal trading records and offline caching regimes. When disabled, the system attempts direct real-time portfolio integration checks.
                </p>
              </div>

              <button 
                onClick={() => setSandboxMode(!sandboxMode)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${sandboxMode ? 'bg-[#d4d4d8]' : 'bg-black/40 border border-white/10'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow ${sandboxMode ? 'translate-x-5 bg-black' : 'translate-x-0 bg-black'}`} />
              </button>
            </div>

          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS (Credentials/Handshake API variables blocks) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        
        {/* API Credentials */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 border border-white/5 bg-black/30 shadow-md">
          <div className="space-y-1.5">
            <span className="text-[8px] text-[#d4d4d8] block uppercase font-bold tracking-widest">TELECOM WEBHOOK CHANNELS</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">TWILIO INTEGRATION CREDENTIALS</h4>
            <p className="text-[10px] text-zinc-450 font-sans leading-relaxed uppercase leading-snug">
              SMS dispatch channels route through a default client-side simulation. Real keys reside safely on standard server environment maps.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-zinc-550 block uppercase text-[8px] font-bold">ACCOUNT SID</span>
              <span className="text-zinc-400 font-mono text-[9.5px]">AC****************************4f11</span>
            </div>
            <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-zinc-550 block uppercase text-[8px] font-bold">AUTH TIMEOUT</span>
              <span className="text-[#d4d4d8] font-bold font-mono text-[10px]">15.0 SECONDS</span>
            </div>
          </div>
        </div>

        {/* System parameters logs view */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 border border-white/5 bg-black/30 shadow-md">
          <div className="space-y-1.5">
            <span className="text-[8px] text-[#d4d4d8] block uppercase font-bold tracking-widest">CUSTODY SYSTEM METRIC DECK</span>
            <h4 className="text-xs font-black text-[#E5E5E5] uppercase">CALIBRATOR ATTRIBUTES</h4>
            <p className="text-[10px] text-zinc-455 font-sans leading-relaxed uppercase leading-snug">
              Verify local browser storage cache status, software build numbers, and system diagnostic integrity bounds.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-zinc-550 block uppercase text-[8px] font-bold">LOCAL STORAGE CHRONOLOGY</span>
              <span className="text-[#d4d4d8] font-bold font-mono text-[9.5px]">ACTIVE CACHED (68.4 KB)</span>
            </div>
            <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-zinc-550 block uppercase text-[8px] font-bold">VERSION BUILD ID</span>
              <span className="text-zinc-400 font-mono text-[10px]">SLAYERS-V11.2.9S-W1</span>
            </div>
          </div>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg border border-white/5">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Layers className="w-3.5 h-3.5 text-zinc-550" />
          <h4 className="text-[10.5px] font-black text-[#E5E5E5] uppercase tracking-wider block">
            End-User License Agreement Boundary Notes
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-zinc-400 font-sans space-y-2">
          <p>
            Configurations set above affect local browser runtime behaviors exclusively. All underlying data streams, telemetry records, and GEX calculations are compiled on secure backend server nodes and remain unaffected by client modifications.
          </p>
          <p>
            For safety and custody standards, do not attempt to bypass strict compliance gates during high-imbalance markets, as rapid volatility expansion sequences can impair outcome probability models.
          </p>
        </div>
      </div>

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[8px] text-zinc-400 uppercase tracking-widest pl-4 font-black shadow-md">
        <span>PREFERENCES SUCCESSFULLY WRITTEN AND COMMITTED LOCALLY</span>
        <div className="flex items-center gap-1.5 text-[#E5E5E5]">
          <span className="h-1.5 w-1.5 bg-[#d4d4d8] rounded-full animate-ping" />
          <span>PREFS WRITTEN</span>
        </div>
      </div>

    </div>
  );
}
