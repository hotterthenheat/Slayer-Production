import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Mail, User, Info, Check, X } from 'lucide-react';
import { useLegal } from './LegalCenter';

interface ClerkGateProps {
  onSuccess: (userData: any) => void;
  referralCodeFromUrl?: string;
  onClose?: () => void;
}

export function ClerkGate({ onSuccess, referralCodeFromUrl, onClose }: ClerkGateProps) {
  const [activeMode, setActiveMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [referralCode, setReferralCode] = useState(referralCodeFromUrl || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRefApplied, setShowRefApplied] = useState(!!referralCodeFromUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const endpoint = activeMode === 'signup' ? '/api/auth/clerk-signup' : '/api/auth/clerk-login';
      const body = activeMode === 'signup' 
        ? { email, name, password, referralCode: referralCode.trim(), avatar: avatarUrl } 
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        // Trigger parent callback 
        onSuccess(data.user);
        window.location.reload(); // Reload immediately to secure signed httpOnly session cookies!
      } else {
        const errorData = await res.json();
        setErrorMessage(errorData.error || 'Authentication error. Please try again.');
      }
    } catch (err) {
      setErrorMessage('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="clerk-authentication-gate" className="min-h-screen bg-black text-[var(--text-secondary)] flex flex-col justify-center items-center font-mono selection:bg-[var(--success)] selection:text-[var(--text-primary)] p-4">
      
      {/* Visual background atmospheric elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60rem] h-[60rem] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none" />
      <div className="absolute top-8 left-8 flex items-center gap-3 select-none">
        <div className="w-2 h-2 rounded-full bg-[#E5E5E5] animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
        <span className="text-xs text-[var(--text-secondary)] font-sans tracking-widest font-bold relative z-10">Slayer Terminal</span>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-[440px] bg-[#050505] border border-[#1f1f1f] shadow-[0_0_50px_rgba(0,0,0,0.5)] pt-12 rounded-3xl overflow-hidden p-8 relative z-10"
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer h-8 w-8 rounded-full bg-[#111] border border-[#222] hover:border-[#444] flex items-center justify-center z-20"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="text-center space-y-3 mb-6">
          <div className="flex justify-center mb-1 relative">
            <div className="p-4 bg-black border border-[#1f1f1f] rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.05)] relative z-10 transition-transform hover:scale-105">
              <ShieldCheck className="w-8 h-8 text-[#E5E5E5]" />
            </div>
          </div>
          <h1 className="text-2xl font-sans font-black tracking-tight text-[var(--text-primary)] select-none">
            Welcome to Slayer Terminal
          </h1>
          <p className="text-[var(--text-tertiary)] text-xs font-sans max-w-sm mx-auto leading-relaxed">
            Sign in with your secure credentials to access institutional-grade decision intelligence.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 bg-[#0a0a0a] rounded-xl p-1.5 border border-[#1f1f1f] text-xs font-bold mb-6">
          <button
            onClick={() => { setActiveMode('signin'); setErrorMessage(null); }}
            className={`py-2.5 rounded-lg transition-all cursor-pointer ${activeMode === 'signin' ? 'bg-[#1a1a1a] text-[#E5E5E5] shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setActiveMode('signup'); setErrorMessage(null); }}
            className={`py-2.5 rounded-lg transition-all cursor-pointer ${activeMode === 'signup' ? 'bg-[#1a1a1a] text-[#E5E5E5] shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Create Account
          </button>
        </div>

        {errorMessage && (
          <div className="p-3.5 bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-lg text-[10px] text-[var(--danger)] leading-relaxed font-mono uppercase" role="alert">
            <span className="font-black">Error:</span> {errorMessage}
          </div>
        )}

        {referralCode && activeMode === 'signup' && (
          <div className="p-3 bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-lg text-[10px] text-[var(--success)] leading-tight font-mono uppercase flex items-center gap-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>Referral applied — 5% discount taken at checkout.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {activeMode === 'signup' && (
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-extrabold block mb-1">
                Your Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full bg-[#0a0a0a] border border-[#1f1f1f] focus:border-[#4f4f4f] focus:ring-1 focus:ring-[#4f4f4f] text-[#E5E5E5] font-sans rounded-xl p-3.5 pl-11 text-sm focus:outline-none transition-all"
                />
                <User className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {activeMode === 'signup' && (
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-extrabold block mb-1">
                Profile Photo URL (Optional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="w-full bg-[#0a0a0a] border border-[#1f1f1f] focus:border-[#4f4f4f] focus:ring-1 focus:ring-[#4f4f4f] text-[#E5E5E5] font-sans rounded-xl p-3.5 pl-11 text-sm focus:outline-none transition-all"
                />
                <User className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-extrabold block mb-1">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@firm.com"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] focus:border-[#4f4f4f] focus:ring-1 focus:ring-[#4f4f4f] text-[#E5E5E5] font-sans rounded-xl p-3.5 pl-11 text-sm focus:outline-none transition-all"
              />
              <Mail className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-extrabold block mb-1">
              Security Key Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] focus:border-[#4f4f4f] focus:ring-1 focus:ring-[#4f4f4f] text-[#E5E5E5] font-sans rounded-xl p-3.5 pl-11 text-sm focus:outline-none transition-all"
              />
              <Lock className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {activeMode === 'signup' && (
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-extrabold block mb-1">
                Referral Code (Optional)
              </label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="SLAYERY123"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] focus:border-[#4f4f4f] focus:ring-1 focus:ring-[#4f4f4f] text-[#E5E5E5] font-sans rounded-xl p-3.5 text-sm focus:outline-none transition-all uppercase"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 mt-4 bg-[var(--text-primary)] hover:opacity-90 text-[var(--surface)] border-none font-bold text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-t-2 border-r-2 border-[var(--surface)] animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>{activeMode === 'signin' ? 'Sign in' : 'Create Account'}</span>
              </>
            )}
          </button>
        </form>

        <div className="border-t border-[#1f1f1f] pt-5 mt-6 text-center">
          <p className="text-xs text-[var(--text-tertiary)] font-sans leading-relaxed">
            By continuing, you agree to Slayer Terminal's{' '}
            <button type="button" onClick={() => useLegal.getState().open('terms')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors cursor-pointer">Terms of Service</button>
            {' '}and{' '}
            <button type="button" onClick={() => useLegal.getState().open('privacy')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors cursor-pointer">Privacy Policy</button>. Secure SSL connection.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
