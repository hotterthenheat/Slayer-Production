import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Mail, User, Info, Check, X } from 'lucide-react';

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
      setErrorMessage('Network timeout. Slayer auth server is offline.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="clerk-authentication-gate" className="min-h-screen bg-black text-zinc-400 flex flex-col justify-center items-center font-mono selection:bg-[#4ADE80] text-black/20 selection:text-[#E5E5E5] p-4">
      
      {/* Visual background atmospheric elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60rem] h-[60rem] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none" />
      <div className="absolute top-8 left-8 flex items-center gap-3 select-none">
        <div className="w-2 h-2 rounded-full bg-[#E5E5E5] animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
        <span className="text-xs text-zinc-400 font-sans tracking-widest uppercase font-bold relative z-10">SLAYER PLATFORM</span>
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
          <h1 className="text-2xl font-sans font-black tracking-tighter text-[#E5E5E5] uppercase select-none">
            Welcome to Slayer
          </h1>
          <p className="text-[#a1a1aa] text-xs font-sans max-w-sm mx-auto leading-relaxed">
            Enter your secure credentials to access institutional-grade decision intelligence.
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
          <div className="p-3.5 bg-rose-950/20 border border-[#F87171]/30 rounded-lg text-[10px] text-[#F87171] leading-relaxed font-mono uppercase">
            <span className="font-black">Error:</span> {errorMessage}
          </div>
        )}

        {referralCode && activeMode === 'signup' && (
          <div className="p-3 bg-black/40 border border-black rounded-lg text-[9.5px] text-[#4ADE80] leading-tight font-mono uppercase flex items-center gap-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>Referral code active! 5% discount applied automatically on subscription clearance.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {activeMode === 'signup' && (
            <div>
              <label className="text-[8.5px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-1">
                Your Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Zak Ali"
                  className="w-full bg-[#0a0a0a] border border-[#1f1f1f] focus:border-[#4f4f4f] focus:ring-1 focus:ring-[#4f4f4f] text-[#E5E5E5] font-sans rounded-xl p-3.5 pl-11 text-sm focus:outline-none transition-all"
                />
                <User className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {activeMode === 'signup' && (
            <div>
              <label className="text-[8.5px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-1">
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
            <label className="text-[8.5px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-1">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="slayer@trade.com"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] focus:border-[#4f4f4f] focus:ring-1 focus:ring-[#4f4f4f] text-[#E5E5E5] font-sans rounded-xl p-3.5 pl-11 text-sm focus:outline-none transition-all"
              />
              <Mail className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="text-[8.5px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-1">
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
              <label className="text-[8.5px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-1">
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
            className="w-full py-4 mt-4 bg-white hover:bg-zinc-200 text-black border-none font-bold text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-t-2 border-r-2 border-black animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>{activeMode === 'signin' ? 'Access Terminal' : 'Create Account'}</span>
              </>
            )}
          </button>
        </form>

        <div className="border-t border-[#1f1f1f] pt-5 mt-6 text-center">
          <p className="text-xs text-zinc-500 font-sans">
            By continuing, you agree to Slayer Trade's Terms of Service and Privacy Policy. Secure SSL connection.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
