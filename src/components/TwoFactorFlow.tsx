import React, { useState } from 'react';
import { Shield, Key, Copy, CheckCircle2, ChevronRight, Download, Info } from 'lucide-react';

export function TwoFactorFlow() {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 5>(0); // 0: Idle, 1: Password Prompt, 2: Setup QR/Secret, 3: Handshake verification, 5: Backup Codes
  const [password, setPassword] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const startSetup = () => {
    setPassword('');
    setAuthCode('');
    setError('');
    setStep(1);
  };

  const handlePasswordSubmit = async () => {
    setError('');
    if (!password) {
      setError('Password is required');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Password verification failed.');
        setIsLoading(false);
        return;
      }
      
      // Verified! Now fetch 2FA secret generation
      const genRes = await fetch('/api/auth/generate-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const genData = await genRes.json();
      if (!genRes.ok) {
        setError(genData.error || 'Failed to generate 2FA secret.');
        setIsLoading(false);
        return;
      }
      
      setSecret(genData.secret);
      setOtpauthUrl(genData.otpauth_url);
      setStep(2);
    } catch (e) {
      setError('Network communication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyHandshake = async () => {
    setError('');
    if (authCode.length !== 6) {
      setError('Handshake requires the 6-digit authenticator code.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authCode })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Handshake failed. Token invalid.');
        setIsLoading(false);
        return;
      }

      setBackupCodes(data.backupCodes || []);
      setStep(5);
    } catch (e) {
      setError('Authentication server error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadBackupCodes = () => {
    if (backupCodes.length === 0) return;
    const textContent = `PINPOINT & SKYSEYE OPTIONS PLATFORM EMERGENCY RECOVERY CODES\nGenerated: ${new Date().toLocaleDateString()}\n\n` + 
      backupCodes.map((code, idx) => `[Code ${idx + 1}]: ${code}`).join('\n') + 
      '\n\nStore this list securely offline. Each recovery code acts as a one-time single-use bypass credential.';
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'skyseye-backup-codes.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setHasDownloaded(true);
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === 0) {
    return (
      <div className="p-4 bg-black/50 border border-black rounded-lg flex items-center justify-between transition-all">
        <div>
          <div className="text-sm font-bold text-[#E5E5E5] mb-1 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-indigo-400" />
            Two-Factor Authentication (TOTP)
          </div>
          <div className="text-xs text-zinc-500">Secure options records and user sessions with MFA.</div>
        </div>
        <button 
          onClick={startSetup}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] text-xs font-bold rounded-lg cursor-pointer transition-colors whitespace-nowrap"
        >
          Enable 2FA
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 bg-black/40 border border-indigo-500/30 rounded-xl space-y-4 animate-fadeIn transition-all">
      <div className="flex items-center gap-2 mb-2 pb-3 border-b border-black/80">
        <Shield className="w-4 h-4 text-indigo-400 animate-pulse" />
        <h3 className="text-sm font-bold text-[#E5E5E5] uppercase tracking-wider">2FA Compliance Setup</h3>
      </div>

      {step === 1 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-xs text-zinc-400 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>Handshake Setup: Password Verification required.</strong> Verify your current key credential to permit Multi-Factor initialization.
            </span>
          </div>
          <div className="space-y-2">
            <input 
              type="password" 
              placeholder="Confirm Current Password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full mirror-panel rounded-lg px-3 py-2 text-sm text-[#E5E5E5] focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && <div className="text-xs font-bold text-rose-500">{error}</div>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setStep(0)} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-[#E5E5E5] transition-colors cursor-pointer">Cancel</button>
            <button 
              onClick={handlePasswordSubmit} 
              disabled={isLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? 'Processing...' : 'Verify Password'} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-xs text-zinc-400 leading-relaxed">
            <strong>Configure Authenticator.</strong> Scan this code with Google Authenticator, Authy, or MS Authenticator.
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start bg-black p-4 border border-black rounded-lg">
            <div className="w-32 h-32 bg-white rounded-lg p-2 shrink-0 border-2 border-indigo-500/30 flex items-center justify-center">
              {otpauthUrl && (
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(otpauthUrl)}`} 
                  alt="2FA Setup Code" 
                  className="w-full h-full object-contain" 
                />
              )}
            </div>
            <div className="space-y-2 flex-1 w-full text-left">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Raw Private Key (Manual Entry)</span>
              <div className="flex border border-black rounded-lg overflow-hidden bg-black w-full">
                <div className="flex-1 px-3 py-2 text-xs font-mono text-[#4ADE80] select-all truncate">{secret}</div>
                <button 
                  onClick={copySecret}
                  className="px-3 bg-black border-l border-black hover:bg-black text-[#4ADE80] cursor-pointer transition-colors"
                >
                  {copied ? 'Copied' : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 leading-normal">
                If QR scan is not possible, copy this secret and manually select "Time-based TOTP" inside your app.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setStep(0)} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-[#E5E5E5] transition-colors cursor-pointer">Cancel Setup</button>
            <button 
              onClick={() => setStep(3)} 
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2"
            >
              Verify Code <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-xs text-zinc-400">
            <strong>Handshake Check.</strong> Enter the 6-digit code showing in your authenticator app to complete pairing.
          </div>
          <div className="space-y-2">
            <input 
              type="text" 
              placeholder="000000" 
              maxLength={6}
              value={authCode}
              onChange={e => setAuthCode(e.target.value.replace(/\D/g, ''))}
              className="w-full mirror-panel rounded-lg px-3 py-2 text-lg text-center font-mono tracking-[0.5em] text-[#E5E5E5] focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && <div className="text-xs font-bold text-rose-500">{error}</div>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-[#E5E5E5] transition-colors cursor-pointer">Back</button>
            <button 
              onClick={handleVerifyHandshake} 
              disabled={isLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? 'Verifying Handshake...' : 'Verify Pair Code'} <CheckCircle2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-xs text-[#F87171] leading-relaxed font-bold border-b border-[#F87171]/50 pb-2">
            ⚠️ 2FA ENABLED: DOWNLOAD EMERGENCY BACKUP RECOVERY KEYS
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            These are your 10 offline recovery codes. Each is a one-time credential to enter account vaults if you lose your phone.
          </p>
          
          <div className="grid grid-cols-2 gap-2 bg-black p-4 border border-black rounded-lg max-h-48 overflow-y-auto">
            {backupCodes.map((code, idx) => (
              <div key={idx} className="text-xs font-mono text-[#4ADE80] tracking-wider flex items-center justify-between border-b border-black last:border-0 pb-1">
                <span className="text-zinc-650 font-bold">{idx + 1}.</span>
                <span className="select-all font-semibold font-mono">{code}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-black">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
              {hasDownloaded ? 'ℹ️ Keys backup captured!' : '⚠️ Download codes to enable exit.'}
            </span>
            <div className="flex gap-3 justify-end w-full sm:w-auto">
              <button 
                onClick={handleDownloadBackupCodes}
                className="px-4 py-2 bg-black hover:bg-black text-[#E5E5E5] rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2"
              >
                Download Keys <Download className="w-3 h-3" />
              </button>
              <button 
                onClick={() => setStep(0)} 
                disabled={!hasDownloaded}
                className={`px-4 py-2 text-[#E5E5E5] text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
                  hasDownloaded 
                    ? 'bg-indigo-600 hover:bg-indigo-500 cursor-pointer' 
                    : 'bg-black text-zinc-600 border border-black cursor-not-allowed'
                }`}
                title={!hasDownloaded ? "Please download codes before proceeding" : "Setup Complete"}
              >
                Acknowledge & Save <CheckCircle2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
