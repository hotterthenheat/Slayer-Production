import React, { useState, useEffect } from 'react';
import { Layers, Key } from 'lucide-react';

// Persist the preference toggles to localStorage so the "written locally" copy is
// honest: a flag flipped here survives reload. Reads default to the prior shipped
// defaults when no value has been stored yet.
const PREF_KEYS = {
  strictCompliance: 'slayer_pref_strict_compliance',
  streamDampener: 'slayer_pref_stream_dampener',
  latencyLimit: 'slayer_pref_latency_limit',
  sandboxMode: 'slayer_pref_sandbox_mode',
} as const;

function readPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : raw === 'true';
}

export function SettingsView() {
  const [strictCompliance, setStrictCompliance] = useState(() => readPref(PREF_KEYS.strictCompliance, true));
  const [streamDampener, setStreamDampener] = useState(() => readPref(PREF_KEYS.streamDampener, false));
  const [latencyLimit, setLatencyLimit] = useState(() => readPref(PREF_KEYS.latencyLimit, true));
  const [sandboxMode, setSandboxMode] = useState(() => readPref(PREF_KEYS.sandboxMode, true));

  // Write each toggle back to localStorage whenever it changes.
  useEffect(() => { window.localStorage.setItem(PREF_KEYS.strictCompliance, String(strictCompliance)); }, [strictCompliance]);
  useEffect(() => { window.localStorage.setItem(PREF_KEYS.streamDampener, String(streamDampener)); }, [streamDampener]);
  useEffect(() => { window.localStorage.setItem(PREF_KEYS.latencyLimit, String(latencyLimit)); }, [latencyLimit]);
  useEffect(() => { window.localStorage.setItem(PREF_KEYS.sandboxMode, String(sandboxMode)); }, [sandboxMode]);

  return (
    <div className="w-full text-[var(--success)] flex flex-col font-mono select-none antialiased space-y-6">

      {/* 1. HEADER (CONFIGS HEADER) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center apple-glass p-5 rounded-2xl gap-2 shadow-lg">
        <div className="flex gap-2 items-center">
          <Key className="w-4 h-4 text-[var(--success)]" />
          <span className="text-[10px] text-[var(--success)] uppercase tracking-widest font-black">
            SLAYER CONFIG SYSTEM SETTINGS
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--surface-2)] text-[var(--success)] border border-[var(--border)] px-3 py-1 rounded-lg text-[10px] font-black uppercase">
          SAVED LOCALLY
        </div>
      </div>

      {/* 2. PRIMARY HERO CARD (Apple-level aesthetic, enormous spacing, minimal controls) */}
      <div className="w-full flex justify-center animate-fadeIn">
        <div className="max-w-3xl w-full apple-glass rounded-2xl p-6 sm:p-10 relative overflow-hidden shadow-2xl flex flex-col justify-between border border-[var(--border)]">

          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[var(--success)] via-[var(--info)] to-[var(--success)]" />

          {/* Settings title */}
          <div className="border-b border-[var(--border)] pb-5 mb-6 text-left">
            <span className="text-[10px] text-[var(--text-tertiary)] tracking-[0.25em] font-black block uppercase">PREFERENCES HUB</span>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight uppercase leading-none font-sans mt-0.5">
              SYSTEM CONFIGURATIONS
            </h2>
          </div>

          {/* Highly generous negative space control rows */}
          <div className="space-y-6 text-left my-2">
            
            {/* Control index 1 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
                  Model Strict Compliance mode
                </span>
                <p className="text-[10px] text-[var(--text-tertiary)] font-sans leading-snug">
                  When active, execution recommendations strictly mandate both high htfAgreement and positive dealer GEX shielding. Neutral signals remain gated inside standard buffers.
                </p>
              </div>

              {/* Minimal toggle switch */}
              <button
                onClick={() => setStrictCompliance(!strictCompliance)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${strictCompliance ? 'bg-[var(--success)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow bg-[var(--surface)] ${strictCompliance ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Control index 2 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
                  CME Stream Dampener frequency
                </span>
                <p className="text-[10px] text-[var(--text-tertiary)] font-sans leading-snug">
                  Smooth volatility updates by pooling consecutive SSE intervals. Throttles rendering calculations from 0.8s loops to 1.6s locks, reducing browser pipeline CPU overhead.
                </p>
              </div>

              <button
                onClick={() => setStreamDampener(!streamDampener)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${streamDampener ? 'bg-[var(--success)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow bg-[var(--surface)] ${streamDampener ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Control index 3 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
                  High Performance Latency limit
                </span>
                <p className="text-[10px] text-[var(--text-tertiary)] font-sans leading-snug">
                  Enforces strict 200ms roundtrip timeout constraints on cloud-node calculations, falling back immediately to local calculations if network congestion swells.
                </p>
              </div>

              <button
                onClick={() => setLatencyLimit(!latencyLimit)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${latencyLimit ? 'bg-[var(--success)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow bg-[var(--surface)] ${latencyLimit ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Control index 4 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-md">
                <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
                  Simulated Sandbox engine
                </span>
                <p className="text-[10px] text-[var(--text-tertiary)] font-sans leading-snug">
                  Enables mock terminal trading records and offline caching regimes. When disabled, the system attempts direct real-time portfolio integration checks.
                </p>
              </div>

              <button
                onClick={() => setSandboxMode(!sandboxMode)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative self-start sm:self-center cursor-pointer ${sandboxMode ? 'bg-[var(--success)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}
              >
                <div className={`w-5 h-5 rounded-full transition-transform duration-200 transform shadow bg-[var(--surface)] ${sandboxMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

          </div>

        </div>
      </div>

      {/* 3. SECONDARY ANALYSIS CARDS (Credentials/Handshake API variables blocks) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        
        {/* API Credentials */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 border border-[var(--border)] bg-[var(--surface-2)] shadow-md">
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold tracking-widest">TELECOM WEBHOOK CHANNELS [DEMO]</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">TWILIO INTEGRATION CREDENTIALS</h4>
            <p className="text-[10px] text-[var(--text-tertiary)] font-sans uppercase leading-snug">
              SMS dispatch is a client-side simulation. The values below are placeholder demo data &mdash; no real credentials are read or displayed here.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-[var(--text-tertiary)] block uppercase text-[10px] font-bold">ACCOUNT SID [DEMO]</span>
              <span className="text-[var(--text-secondary)] font-mono text-[10px] tabular-nums">AC****************************4f11</span>
            </div>
            <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-[var(--text-tertiary)] block uppercase text-[10px] font-bold">AUTH TIMEOUT [DEMO]</span>
              <span className="text-[var(--text-secondary)] font-bold font-mono text-[10px] tabular-nums">15.0 SECONDS</span>
            </div>
          </div>
        </div>

        {/* System parameters logs view */}
        <div className="apple-glass p-5 rounded-2xl flex flex-col justify-between text-left space-y-4 border border-[var(--border)] bg-[var(--surface-2)] shadow-md">
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold tracking-widest">CUSTODY SYSTEM METRIC DECK [DEMO]</span>
            <h4 className="text-xs font-black text-[var(--text-primary)] uppercase">CALIBRATOR ATTRIBUTES</h4>
            <p className="text-[10px] text-[var(--text-tertiary)] font-sans uppercase leading-snug">
              Illustrative build/cache diagnostics. These are placeholder demo values and do not reflect actual storage usage or build identifiers.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-[var(--text-tertiary)] block uppercase text-[10px] font-bold">LOCAL STORAGE [DEMO]</span>
              <span className="text-[var(--text-secondary)] font-bold font-mono text-[10px] tabular-nums">ACTIVE CACHED (68.4 KB)</span>
            </div>
            <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex justify-between items-center shadow-inner">
              <span className="text-[var(--text-tertiary)] block uppercase text-[10px] font-bold">VERSION BUILD ID [DEMO]</span>
              <span className="text-[var(--text-secondary)] font-mono text-[10px] tabular-nums">SLAYERS-V11.2.9S-W1</span>
            </div>
          </div>
        </div>

      </div>

      {/* 4. SUPPORTING INFORMATION */}
      <div className="apple-glass p-6 rounded-2xl text-left space-y-3 shadow-lg border border-[var(--border)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <Layers className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <h4 className="text-[10.5px] font-black text-[var(--text-primary)] uppercase tracking-wider block">
            End-User License Agreement Boundary Notes
          </h4>
        </div>
        <div className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans space-y-2">
          <p>
            The four toggles above are saved to your browser&rsquo;s localStorage and persist across reloads. All underlying data streams, telemetry records, and GEX calculations are computed on backend server nodes and are unaffected by these client preferences.
          </p>
          <p>
            For safety and custody standards, do not attempt to bypass strict compliance gates during high-imbalance markets, as rapid volatility expansion sequences can impair outcome probability models.
          </p>
        </div>
      </div>

      {/* 5. STATUS BAR */}
      <div className="apple-glass min-h-[30px] p-3 rounded-xl flex items-center justify-between text-[10px] text-[var(--text-secondary)] uppercase tracking-widest pl-4 font-black shadow-md">
        <span>PREFERENCES SAVED TO LOCAL BROWSER STORAGE</span>
        <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
          <span className="h-1.5 w-1.5 bg-[var(--success)] rounded-full" />
          <span>SAVED</span>
        </div>
      </div>

    </div>
  );
}
