import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Settings, 
  HelpCircle, 
  Type, 
  Eye, 
  Palette, 
  RefreshCw, 
  Coins, 
  Share2, 
  Receipt, 
  Calculator,
  ShieldAlert,
  FolderSync,
  User,
  CreditCard,
  Lock,
  RotateCcw,
  Monitor,
  Check,
  Clock
} from 'lucide-react';
import { UserProfile } from './UserProfile';
import { TwoFactorFlow } from './TwoFactorFlow';
import { useContractStore, ContractStore } from '../lib/store';
import { THEMES, applyTheme, applyTextSize, applyCompact, applyUltrawide } from '../lib/displayPrefs';
import { formatTime, formatDateTime } from '../lib/timeUtils';

interface SettingsPanelProps {
  session: any;
  onUpdateSession: () => void;
}

// Referral code display + apply box (spec §B). Shows the user's strict
// [PREFIX]10OFF code and applies a referral/promo code at /api/billing/apply-coupon.
function ReferralCodeBox() {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [applyInput, setApplyInput] = useState('');
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetch('/api/billing/my-referral-code', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => { if (d.referral_code) setCode(d.referral_code); })
      .catch(() => {});
  }, []);

  const copy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const apply = async () => {
    if (!applyInput.trim()) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      const r = await fetch('/api/billing/apply-coupon', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: applyInput.trim() }),
      });
      const d = await r.json();
      if (r.ok) setApplyMsg({ ok: true, text: `${d.discount_percentage}% discount applied — referrer ${d.referrer_name || ''} credited +1 token.` });
      else setApplyMsg({ ok: false, text: d.error || 'Invalid code.' });
    } catch {
      setApplyMsg({ ok: false, text: 'Network error.' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-black/40 border border-black rounded-xl p-4 space-y-4">
      <div>
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Your Referral Code</span>
        <div className="flex items-center gap-2 mt-1.5">
          <code className="flex-1 bg-black border border-black rounded-lg px-3 py-2.5 text-sm font-mono font-black text-[#4ADE80] tracking-widest">{code || '…'}</code>
          <button onClick={copy} className="px-3 py-2.5 mirror-panel rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#4ADE80] hover:text-[#E5E5E5]">{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5">Share this code — referees get 10% off and you earn +1 token per use.</p>
      </div>
      <div className="pt-3 border-t border-black/60">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Apply a Referral Code</span>
        <div className="flex items-center gap-2 mt-1.5">
          <input
            value={applyInput}
            onChange={(e) => setApplyInput(e.target.value.toUpperCase())}
            placeholder="FRND10OFF"
            className="flex-1 bg-black border border-black rounded-lg px-3 py-2.5 text-sm font-mono text-[#E5E5E5] uppercase placeholder:text-zinc-700 focus:outline-none focus:border-black"
          />
          <button onClick={apply} disabled={applying} className="px-4 py-2.5 bg-black/40 border border-black text-[#4ADE80] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-black/40 disabled:opacity-50">{applying ? '…' : 'Apply'}</button>
        </div>
        {applyMsg && <p className={`text-[10px] mt-1.5 ${applyMsg.ok ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>{applyMsg.text}</p>}
      </div>
    </div>
  );
}

function KeybindRow({ bindId, label }: { bindId: keyof ContractStore['keybinds'], label: string }) {
  const keybinds = useContractStore(state => state.keybinds);
  const setKeybinds = useContractStore(state => state.setKeybinds);
  const disabledKeybinds = useContractStore(state => state.disabledKeybinds);
  const setDisabledKeybinds = useContractStore(state => state.setDisabledKeybinds);
  const [isRecording, setIsRecording] = useState(false);

  const isDisabled = disabledKeybinds[bindId];

  useEffect(() => {
    if (!isRecording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let key = e.key.toLowerCase();
      // Ignore bare modifiers
      if (['control', 'meta', 'shift', 'alt'].includes(key)) return;
      
      const parts = [];
      if (e.metaKey || e.ctrlKey) parts.push('cmd');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(key);
      
      setKeybinds({ [bindId]: parts.join('+') });
      setIsRecording(false);
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isRecording, bindId, setKeybinds]);

  // Translate 'cmd' to standard display based on OS
  const displayKey = (keybinds[bindId] || '').replace('cmd', typeof window !== 'undefined' && navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl');

  return (
    <div className={`flex items-center justify-between p-3 bg-black/40 border ${isDisabled ? 'border-black/50 opacity-50' : 'border-black'} rounded-lg transition-all`}>
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setDisabledKeybinds({ [bindId]: !isDisabled })}
          className={`w-4 h-4 rounded flex items-center justify-center border ${isDisabled ? 'bg-transparent border-black' : 'bg-indigo-500 border-indigo-500 text-[#E5E5E5]'}`}
        >
          {!isDisabled && <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 stroke-current stroke-[3]"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </button>
        <span className={`text-sm font-bold ${isDisabled ? 'text-zinc-500 line-through' : 'text-[#4ADE80]'}`}>{label}</span>
      </div>
      <button
        onClick={() => {
          if (!isDisabled) setIsRecording(true);
        }}
        disabled={isDisabled}
        className={`px-3 py-1.5 text-xs font-mono font-bold rounded flex items-center justify-center min-w-[80px] transition-all border
          ${isDisabled ? 'bg-black text-zinc-600 border-black cursor-not-allowed' : isRecording ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : 'bg-black text-zinc-400 border-black hover:border-black hover:text-[#E5E5E5]'}`}
      >
        {isRecording ? 'Listening...' : displayKey.toUpperCase()}
      </button>
    </div>
  );
}

export function SettingsPanel({ session, onUpdateSession }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'privacy' | 'preferences' | 'keybinds' | 'referrals' | 'billing'>('profile');
  
  const [selectedFont, setSelectedFont] = useState<'STANDARD' | 'ENHANCED' | 'ENHANCED_XL'>(session?.selected_font_scale || 'STANDARD');
  const [compactMode, setCompactMode] = useState<boolean>(!!session?.compact_view_enabled);
  const [ultrawideMode, setUltrawideMode] = useState<boolean>(!!session?.ultrawide_enabled);
  const [activeTheme, setActiveTheme] = useState<string>(session?.selected_theme || 'SLAYER PURE DARK');

  const globalKeybindsEnabled = useContractStore(state => state.globalKeybindsEnabled);
  const setGlobalKeybindsEnabled = useContractStore(state => state.setGlobalKeybindsEnabled);

  const timeZone = useContractStore(state => state.timeZone);
  const setTimeZone = useContractStore(state => state.setTimeZone);
  const timeFormat = useContractStore(state => state.timeFormat);
  const setTimeFormat = useContractStore(state => state.setTimeFormat);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isSimulatingInvoice, setIsSimulatingInvoice] = useState(false);
  const [invoiceLog, setInvoiceLog] = useState<any | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

  // Security Vault & Compliance states
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [simulatedOtp, setSimulatedOtp] = useState('');
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Privacy Boundaries & Notification states
  const [notifPreferences, setNotifPreferences] = useState({
    email_enabled: true,
    sms_enabled: true,
    discord_enabled: true,
    options_flow_alerts: true
  });
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'private' | 'logged_in'>('public');
  const [blockSearchIndexing, setBlockSearchIndexing] = useState(false);
  const [isPatchingPrivacy, setIsPatchingPrivacy] = useState(false);

  // GDPR Data Portability states
  const gdprTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => { gdprTimers.current.forEach(clearTimeout); gdprTimers.current.forEach(clearInterval); }, []);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportDownloadUrl, setExportDownloadUrl] = useState('');
  const [exportExpiresAt, setExportExpiresAt] = useState<number | null>(null);
  const [exportEmailLog, setExportEmailLog] = useState('');

  const [toastText, setToastText] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastText(text);
    setToastType(type);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastText(null);
    }, 4000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Subscription Cancellation Flow attributes (Module 4)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const handleCancelSubscription = async () => {
    setIsCanceling(true);
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'Subscription scheduled for cancellation.', 'success');
        onUpdateSession();
      } else {
        showToast(data.error || 'Failed to cancel subscription.', 'error');
      }
    } catch (e) {
      showToast('Network error during cancellation request.', 'error');
    } finally {
      setIsCanceling(false);
      setShowCancelConfirm(false);
    }
  };

  // Link for copy
  const referralLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/join/${session?.custom_referral_code || 'SLAYERX'}` 
    : `/join/${session?.custom_referral_code || 'SLAYERX'}`;

  const handleSaveSettings = async (font: 'STANDARD' | 'ENHANCED' | 'ENHANCED_XL', compact: boolean, theme: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_font_scale: font,
          compact_view_enabled: compact,
          selected_theme: theme
        })
      });

      if (res.ok) {
        onUpdateSession();
        showToast('Display preferences saved and synchronized.');
      } else {
        showToast('Failed to save display preferences.', 'error');
      }
    } catch (e) {
      console.error('Failed to update Settings parameters', e);
      showToast('Backend connection error.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const saveUltrawide = async (on: boolean) => {
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ultrawide_enabled: on }),
      });
      if (res.ok) {
        onUpdateSession();
        showToast('Display preferences saved and synchronized.');
      }
    } catch (e) {
      console.error('Failed to update ultrawide preference', e);
    }
  };

  useEffect(() => {
    if (session) {
      if (session.notification_preferences) {
        setNotifPreferences({
          email_enabled: session.notification_preferences.email_enabled ?? true,
          sms_enabled: session.notification_preferences.sms_enabled ?? true,
          discord_enabled: session.notification_preferences.discord_enabled ?? true,
          options_flow_alerts: session.notification_preferences.options_flow_alerts ?? true,
        });
      }
      if (session.profile_visibility) {
        setProfileVisibility(session.profile_visibility);
      }
      if (session.block_search_indexing !== undefined) {
        setBlockSearchIndexing(session.block_search_indexing);
      }
    }
  }, [session]);

  // Dynamically inject/remove meta robots tags to block search engines
  useEffect(() => {
    let metaTag = document.querySelector('meta[name="robots"]');
    if (blockSearchIndexing) {
      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute('name', 'robots');
        metaTag.setAttribute('content', 'noindex, nofollow');
        document.head.appendChild(metaTag);
        console.log('[SEO COMPLIANCE] Injected <meta name="robots" content="noindex, nofollow"> to block search indexing.');
      }
    } else {
      if (metaTag) {
        metaTag.remove();
        console.log('[SEO COMPLIANCE] Restored search engine indexing.');
      }
    }
  }, [blockSearchIndexing]);

  const handleUpdatePrivacySettings = async (updates: {
    notification_preferences?: typeof notifPreferences;
    profile_visibility?: typeof profileVisibility;
    block_search_indexing?: boolean;
  }) => {
    setIsPatchingPrivacy(true);
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        onUpdateSession();
        showToast('Privacy updates saved successfully.');
      } else {
        const d = await res.json();
        showToast(d.error || 'Server rejected privacy updates.', 'error');
      }
    } catch (e) {
      showToast('Error syncing privacy settings.', 'error');
    } finally {
      setIsPatchingPrivacy(false);
    }
  };

  const triggerGdprExport = async () => {
    setIsExporting(true);
    setExportProgress(10);
    setExportDownloadUrl('');
    setExportExpiresAt(null);
    setExportEmailLog('');

    const interval = setInterval(() => {
      setExportProgress((p) => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + 20;
      });
    }, 200);
    gdprTimers.current.push(interval);

    try {
      const res = await fetch('/api/users/export-data', { method: 'POST' });
      clearInterval(interval);
      setExportProgress(100);

      const data = await res.json();
      if (res.ok) {
        setExportDownloadUrl(data.downloadUrl);
        setExportExpiresAt(data.expiresAt);
        setExportEmailLog(data.simulatedEmailLogs);
        showToast('GDPR record archive built successfully.', 'success');
      } else {
        showToast(data.error || 'Failed to trigger GDPR export.', 'error');
      }
    } catch (err) {
      clearInterval(interval);
      showToast('Export compilation interrupted.', 'error');
    } finally {
      gdprTimers.current.push(setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 800));
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/auth/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.error('Error fetching sessions list:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions();
    }
  }, [activeTab]);

  const handleRevokeAllSessions = async () => {
    try {
      const res = await fetch('/api/auth/revoke-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        showToast('All secondary sessions successfully terminated.');
        await fetchSessions();
        // Force hard reload as mandated for direct SSO JWT/cookie clearing sync
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        showToast('Encountered issue revoking secondary endpoints.', 'error');
      }
    } catch (e) {
      showToast('Network timeout during session revocation.', 'error');
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (!currentPassword || !newPassword) {
      setPwError('Please fill in both credential fields.');
      return;
    }
    
    // Front-end pre-validating password parameters
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPwError('Password must contain at least one uppercase letter (A-Z).');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPwError('Password must contain at least one digit (0-9).');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      setPwError('Password must contain at least one special character (!@#$%^&* etc.).');
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || 'Password update refused by server check.');
      } else {
        setPwSuccess('Vault security key updated and rehashed successfully.');
        setCurrentPassword('');
        setNewPassword('');
        showToast('Password updated.');
      }
    } catch (err) {
      setPwError('Server connection timeout. Please verify backend status.');
    }
  };

  const handleEmailUpdateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    if (!newEmail || !newEmail.includes('@')) {
      setEmailError('Please specify a valid email syntax.');
      return;
    }

    try {
      const res = await fetch('/api/auth/request-email-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || 'Failed to dispatch email verification.');
      } else {
        setOtpSent(true);
        if (data.otpCode) {
          setSimulatedOtp(data.otpCode);
        }
        setEmailSuccess('Two-step Verification OTP dispatched successfully.');
        showToast('OTP code issued.');
      }
    } catch (err) {
      setEmailError('Communication error trying to request email transition.');
    }
  };

  const handleEmailUpdateVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    if (!emailOtp) {
      setEmailError('6-digit OTP code required.');
      return;
    }

    try {
      const res = await fetch('/api/auth/verify-email-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: emailOtp })
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || 'OTP verification digit mismatch.');
      } else {
        setEmailSuccess('Primary account email updated successfully!');
        setOtpSent(false);
        setNewEmail('');
        setEmailOtp('');
        setSimulatedOtp('');
        onUpdateSession();
        showToast('Email verified and updated.');
      }
    } catch (err) {
      setEmailError('Network error during primary security confirmation.');
    }
  };

  const handleSoftDeleteAccount = async () => {
    setDeleteError('');
    try {
      const res = await fetch('/api/users/delete-account', {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to trigger deactivation flow.');
      } else {
        showToast('Vault deactivated. Logging out...', 'success');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    } catch (err) {
      setDeleteError('Connection error attempting to request GDPR soft delete.');
    }
  };

  const handleRunSimulatedBilling = async () => {
    setIsSimulatingInvoice(true);
    setInvoiceLog(null);
    try {
      const res = await fetch('/api/billing/sim-cron-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        setInvoiceLog(data);
        // Refresh token stats on header
        onUpdateSession();
      }
    } catch (e) {
      console.error('Invoice simulation failed', e);
    } finally {
      setIsSimulatingInvoice(false);
    }
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 2000);
  };

  const tabs = [
    { id: 'profile', label: 'Public Profile', icon: User },
    { id: 'security', label: 'Account & Security', icon: Lock },
    { id: 'privacy', label: 'Privacy & Alerts', icon: ShieldAlert },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'keybinds', label: 'Keyboard Shortcuts', icon: Type },
    { id: 'referrals', label: 'Referrals', icon: Coins },
    { id: 'billing', label: 'Billing', icon: Receipt },
  ] as const;

  return (
    <div id="slayer-settings-panel" className="w-full flex flex-col md:flex-row gap-8 text-left font-sans max-w-[800px] mx-auto">
      
      {/* Sidebar Navigation */}
      <div className="w-full md:w-56 shrink-0 space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                isActive 
                  ? 'bg-black text-[#E5E5E5] border border-black' 
                  : 'text-zinc-400 hover:text-[#E5E5E5] hover:bg-black/50 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 max-w-[800px]">
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fadeIn">
            <UserProfile session={session} onUpdateSession={onUpdateSession} />
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6 animate-fadeIn pb-12">
            
            {/* MFA Container */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-4 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <Lock className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-black tracking-tight text-[#E5E5E5] uppercase">Account Security</h2>
              </div>
              <p className="text-xs text-zinc-400">Manage two-factor authentication, passwords, and account deletion.</p>
              
              <TwoFactorFlow />
            </div>

            {/* Email Transition Container */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-4 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-indigo-400 stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 19.5h18M3 4.5h18M3 9.5h18M3 14.5h18" /></svg>
                <h2 className="text-sm font-bold tracking-wider text-[#E5E5E5] uppercase">Primary Email & Two-Step OTP</h2>
              </div>
              
              <div className="space-y-3">
                <div className="text-xs text-zinc-500">
                  Changing your email requires a verification code. A security notice will also be sent to your old address.
                </div>

                <div className="bg-black/30 border border-black p-3 rounded-lg text-xs">
                  <div className="text-zinc-500 font-bold mb-0.5 uppercase tracking-wide">Current Email</div>
                  <div className="text-[#4ADE80] font-mono font-bold">{session?.email || 'N/A'}</div>
                </div>

                {emailError && <div className="text-xs font-bold text-rose-500 p-2 bg-rose-950/20 rounded-md border border-[#F87171]/30">{emailError}</div>}
                {emailSuccess && <div className="text-xs font-bold text-[#4ADE80] p-2 bg-black/40 rounded-md border border-black">{emailSuccess}</div>}

                {otpSent ? (
                  <form onSubmit={handleEmailUpdateVerify} className="space-y-3 animate-fadeIn">
                    <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-lg text-xs space-y-2">
                      <div className="font-bold text-indigo-300">Demo mode - verification code:</div>
                      <p className="text-zinc-400">Because you are in demo mode, the 6-digit verification code is shown here:</p>
                      <div className="font-mono text-sm font-bold text-[#4ADE80] bg-black/50 px-2 py-1 rounded w-fit select-all border border-black">
                        {simulatedOtp}
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Enter Verification Code</label>
                      <input 
                        type="text"
                        placeholder="000000"
                        maxLength={6}
                        value={emailOtp}
                        onChange={e => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-full mirror-panel rounded-lg px-3 py-2 text-center text-sm font-mono tracking-widest text-[#E5E5E5] focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-1">
                      <button 
                        type="button" 
                        onClick={() => { setOtpSent(false); setEmailOtp(''); }} 
                        className="px-3 py-1.5 text-xs text-zinc-500 hover:text-[#E5E5E5] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      >
                        Verify & Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleEmailUpdateRequest} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">New Email Address</label>
                      <input 
                        type="email"
                        placeholder="newemailaddress@trade.com"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        className="w-full mirror-panel rounded-lg px-3 py-2 text-sm text-[#E5E5E5] focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button 
                        type="submit"
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      >
                        Send Verification Code
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Password Mutation Container */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-4 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-indigo-400 stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
                <h2 className="text-sm font-bold tracking-wider text-[#E5E5E5] uppercase">Change Password</h2>
              </div>
              
              <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                {pwError && <div className="text-xs font-bold text-rose-500 p-2 bg-rose-950/20 rounded-md border border-[#F87171]/30">{pwError}</div>}
                {pwSuccess && <div className="text-xs font-bold text-[#4ADE80] p-2 bg-black/40 rounded-md border border-black">{pwSuccess}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Current Password</label>
                    <input 
                      type="password"
                      placeholder="••••••••••••"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full mirror-panel rounded-lg px-3 py-2 text-sm text-[#E5E5E5] focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">New Password</label>
                    <input 
                      type="password"
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full mirror-panel rounded-lg px-3 py-2 text-sm text-[#E5E5E5] focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-zinc-500 space-y-1 leading-normal list-disc pl-3">
                  <div>• Password must be at least 8 characters.</div>
                  <div>• Must contain at least one UPPERCASE letter.</div>
                  <div>• Must contain at least one digit (0-9) and one special punctuation mark.</div>
                </div>

                <div className="flex justify-end">
                  <button 
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    Update Password
                  </button>
                </div>
              </form>
            </div>

            {/* Active Sessions & SSO Container */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-4 relative shadow-lg animate-fadeIn">
              <div className="flex items-center justify-between border-b border-black pb-3">
                <div className="flex items-center gap-2.5">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-indigo-400 stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
                  <h2 className="text-sm font-bold tracking-wider text-[#E5E5E5] uppercase">Active Sessions</h2>
                </div>
                <button
                  onClick={handleRevokeAllSessions}
                  type="button"
                  className="px-3 py-1 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-[#F87171] hover:text-[#E5E5E5] text-[11px] font-bold rounded-lg cursor-pointer transition-all"
                >
                  Log Out All Devices
                </button>
              </div>
              <p className="text-xs text-zinc-400 leading-normal">
                These are the devices and browsers currently signed in to your account. Clicking "Log Out All Devices" signs them out immediately.
              </p>

              <div className="divide-y divide-zinc-900/80 bg-black/40 border border-black rounded-xl overflow-hidden">
                {sessions.length === 0 ? (
                  <div className="p-4 text-xs text-center text-zinc-500 font-mono">No active sessions located.</div>
                ) : (
                  sessions.map((sess, idx) => (
                    <div key={idx} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#E5E5E5] font-mono">{sess.ip_address}</span>
                          {sess.is_current ? (
                            <span className="px-2 py-0.5 bg-[#4ADE80] text-black/15 border border-black text-[#4ADE80] font-bold text-[9px] rounded-full uppercase tracking-wider">
                              Current Connection
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-black border border-black text-zinc-400 font-bold text-[9px] rounded-full uppercase tracking-wider">
                              Other Device
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate max-w-[300px] sm:max-w-md font-mono" title={sess.user_agent}>
                          {sess.user_agent}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          Created: {formatDateTime(sess.created_at)} | Activity: {formatTime(sess.last_active)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* GDPR Deactivation & Account Purge Container */}
            <div className="bg-rose-950/10 border border-rose-500/20 rounded-xl p-6 space-y-4 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-rose-500/20 pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#F87171] stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <h2 className="text-sm font-bold tracking-wider text-[#F87171] uppercase">Delete Account</h2>
              </div>
              <p className="text-xs text-zinc-400 leading-normal">
                Under GDPR you can request account deletion. Your account will be deactivated immediately and permanently removed after 30 days.
              </p>

              {deleteError && <div className="text-xs font-bold text-rose-500 p-2 bg-rose-950/20 rounded-md border border-[#F87171]/30">{deleteError}</div>}

              {showDeleteConfirm ? (
                <div className="p-4 bg-black border border-rose-500/30 rounded-lg space-y-3 animate-fadeIn">
                  <div className="text-xs text-[#4ADE80] font-bold">Are you absolutely sure?</div>
                  <p className="text-[11px] text-zinc-500">
                    This immediately disables your username, API keys, and options flow access. After 30 days it cannot be undone.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 text-xs text-zinc-400 hover:text-[#E5E5E5] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSoftDeleteAccount}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-[#E5E5E5] rounded-lg text-xs font-bold cursor-pointer transition-colors"
                    >
                      Confirm Delete Account
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-[#F87171] hover:text-[#E5E5E5] text-xs font-bold rounded-lg cursor-pointer transition-all"
                >
                  Request Account Deletion
                </button>
              )}
            </div>

          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-6 animate-fadeIn pb-12">
            
            {/* Header Description Card */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-4 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <ShieldAlert className="w-5 h-5 text-indigo-400" />
                <h2 className="text-sm font-bold tracking-wider text-[#E5E5E5] uppercase">Privacy & Notifications</h2>
              </div>
              <p className="text-xs text-zinc-400 leading-normal">
                Control who can view your profile, toggle alerts, and download your data.
              </p>
            </div>

            {/* Notification preferences JSONB manager */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-5 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-indigo-400 stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <h2 className="text-xs font-bold tracking-wider text-[#E5E5E5] uppercase">Notification Preferences</h2>
              </div>
              <p className="text-xs text-zinc-500">
                Choose which alert channels are active. Alerts are only sent through channels you have turned on.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-black/40 p-4 rounded-xl border border-black flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#E5E5E5]">Email Alerts</div>
                    <div className="text-[10px] text-zinc-500">Send alerts to your email</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={notifPreferences.email_enabled}
                      disabled={isPatchingPrivacy}
                      onChange={(e) => {
                        const next = { ...notifPreferences, email_enabled: e.target.checked };
                        setNotifPreferences(next);
                        handleUpdatePrivacySettings({ notification_preferences: next });
                      }}
                      className="peer sr-only"
                    />
                    <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>

                <div className="bg-black/40 p-4 rounded-xl border border-black flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#E5E5E5]">SMS Alerts</div>
                    <div className="text-[10px] text-zinc-500">Send alerts to your phone via SMS</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={notifPreferences.sms_enabled}
                      disabled={isPatchingPrivacy}
                      onChange={(e) => {
                        const next = { ...notifPreferences, sms_enabled: e.target.checked };
                        setNotifPreferences(next);
                        handleUpdatePrivacySettings({ notification_preferences: next });
                      }}
                      className="peer sr-only"
                    />
                    <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>

                <div className="bg-black/40 p-4 rounded-xl border border-black flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#E5E5E5]">Discord Webhook Feeds</div>
                    <div className="text-[10px] text-zinc-500">Post sweeps directly to server webhooks</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={notifPreferences.discord_enabled}
                      disabled={isPatchingPrivacy}
                      onChange={(e) => {
                        const next = { ...notifPreferences, discord_enabled: e.target.checked };
                        setNotifPreferences(next);
                        handleUpdatePrivacySettings({ notification_preferences: next });
                      }}
                      className="peer sr-only"
                    />
                    <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>

                <div className="bg-black/40 p-4 rounded-xl border border-black flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#E5E5E5]">Options Flow Alerts</div>
                    <div className="text-[10px] text-zinc-500">Alert on large GEX deviation events</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={notifPreferences.options_flow_alerts}
                      disabled={isPatchingPrivacy}
                      onChange={(e) => {
                        const next = { ...notifPreferences, options_flow_alerts: e.target.checked };
                        setNotifPreferences(next);
                        handleUpdatePrivacySettings({ notification_preferences: next });
                      }}
                      className="peer sr-only"
                    />
                    <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Profile Visibility Enums & Search Indexing */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-4 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-indigo-400 stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <h2 className="text-xs font-bold tracking-wider text-[#E5E5E5] uppercase">Profile Visibility & Search</h2>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-[#E5E5E5] block">Profile Visibility Setting</span>
                  <p className="text-[11px] text-zinc-500 leading-normal">Controls who can find and view your profile.</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-sans">
                    {[
                      { value: 'public', label: 'Public (Everyone)', desc: 'Anyone can view your profile' },
                      { value: 'logged_in', label: 'Subscribers Only', desc: 'Only logged-in users' },
                      { value: 'private', label: 'Private (Just You)', desc: 'Only you can see your profile' }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setProfileVisibility(opt.value as any);
                          handleUpdatePrivacySettings({ profile_visibility: opt.value as any });
                        }}
                        className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                          profileVisibility === opt.value
                            ? 'bg-indigo-600/10 border-indigo-500 text-[#E5E5E5] shadow-md'
                            : 'bg-black/20 border-black text-zinc-450 hover:text-[#E5E5E5]'
                        }`}
                      >
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[9px] text-zinc-500 mt-0.5 leading-tight">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-black/60 flex items-center justify-between">
                  <div className="max-w-[80%]">
                    <span className="text-xs font-bold text-[#E5E5E5] block">Restrict Search Engine Indexing</span>
                    <p className="text-[11px] text-zinc-500 leading-normal">
                      Tells Google and Bing not to index your profile page. Adds a <code className="font-mono text-indigo-400">noindex</code> tag to your public profile.
                    </p>
                  </div>
                  
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={blockSearchIndexing}
                      disabled={isPatchingPrivacy}
                      onChange={(e) => {
                        setBlockSearchIndexing(e.target.checked);
                        handleUpdatePrivacySettings({ block_search_indexing: e.target.checked });
                      }}
                      className="peer sr-only"
                    />
                    <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* GDPR Compliance Data Export (S3 Storage) */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-4 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <FolderSync className="w-5 h-5 text-indigo-400 font-bold" />
                <h2 className="text-xs font-bold tracking-wider text-[#E5E5E5] uppercase">Download Your Data (GDPR)</h2>
              </div>
              <p className="text-xs text-zinc-400 leading-normal">
                Export all your account data - logs, preferences, and payment records - as a single download. The file is available for 24 hours, then deleted.
              </p>

              {isExporting ? (
                <div className="space-y-2 animate-fadeIn pt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400">Building your data export...</span>
                    <span className="text-indigo-400 font-bold">{exportProgress}%</span>
                  </div>
                  <div className="w-full bg-black h-2 rounded overflow-hidden border border-black">
                    <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${exportProgress}%` }}></div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end pt-1">
                  <button 
                    type="button"
                    onClick={triggerGdprExport}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-lg"
                  >
                    Export My Data
                  </button>
                </div>
              )}

              {/* Download Container */}
              {exportDownloadUrl && (
                <div className="mt-4 p-4 bg-black/60 border border-indigo-900/40 rounded-xl space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#4ADE80]">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <span>Data export ready</span>
                  </div>
                  
                  <div className="text-[11px] text-zinc-500 leading-normal space-y-1">
                    <div>• <strong>Stored at</strong>: Encrypted cloud storage (<code className="font-mono text-zinc-400">aws-eu-central-1-skyseye-gdpr-temp</code>)</div>
                    <div>• <strong>Access Expiration</strong>: {exportExpiresAt ? new Date(exportExpiresAt).toLocaleString() : '24 hours'}</div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <a
                      href={exportDownloadUrl}
                      download
                      className="px-4 py-2 bg-black/40 hover:bg-black/40 text-[#E5E5E5] rounded-lg text-xs font-bold text-center cursor-pointer transition-all flex items-center justify-center gap-2"
                    >
                      <span>⬇️ Download GDPR Export Package</span>
                    </a>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const link = window.location.origin + exportDownloadUrl;
                        navigator.clipboard.writeText(link);
                        showToast("GDPR direct download URL copied.");
                      }}
                      className="px-4 py-2 bg-black hover:bg-black text-[#4ADE80] font-bold border border-black text-xs rounded-lg cursor-pointer transition-colors"
                    >
                      Copy Direct File URL
                    </button>
                  </div>

                  {exportEmailLog && (
                    <div className="bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-lg text-[10px] space-y-1 font-mono">
                      <div className="font-bold text-indigo-300">Email notification sent (demo):</div>
                      <p className="text-zinc-500">{exportEmailLog}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {activeTab === 'preferences' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Module 6: Appearance customization option box */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-5 relative shadow-lg">
              <div className="absolute top-0 right-0 p-3 text-[10px] text-zinc-600 font-bold uppercase tracking-widest font-mono">
                System Display
              </div>

              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-black tracking-tight text-[#E5E5E5]">
                  Display Preferences
                </h2>
              </div>

              {/* Option A: Font Size Scaling (STANDARD vs ENHANCED) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#E5E5E5]">
                  <Type className="w-4 h-4 text-zinc-550 shrink-0" />
                  <span>Text Size</span>
                </div>
                <p className="text-xs text-[#8e8e93] leading-relaxed">
                  Adjust how large the text appears throughout the app.
                </p>
                
                <div className="mt-2">
                  <select
                    value={selectedFont}
                    onChange={(e) => {
                      const newVal = e.target.value as 'STANDARD' | 'ENHANCED' | 'ENHANCED_XL';
                      setSelectedFont(newVal);
                      applyTextSize(newVal);
                      handleSaveSettings(newVal, compactMode, activeTheme);
                    }}
                    className="w-full bg-black border border-black text-[#E5E5E5] rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer appearance-none"
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="ENHANCED">Large</option>
                    <option value="ENHANCED_XL">Extra Large</option>
                  </select>
                </div>
              </div>

              {/* Option Hour Format */}
              <div className="pt-4 border-t border-black/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#E5E5E5]">
                  <Clock className="w-4 h-4 text-zinc-550 shrink-0" />
                  <span>Clock Format</span>
                </div>
                <p className="text-xs text-[#8e8e93] leading-relaxed">
                  Choose whether times show as 12-hour (AM/PM) or 24-hour.
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setTimeFormat('12H')}
                    className={`flex-1 p-2.5 rounded-lg border text-xs font-black uppercase tracking-wider transition-all ${
                      timeFormat === '12H'
                        ? 'bg-indigo-600/20 border-indigo-500 text-[#E5E5E5] shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                        : 'bg-black border-black/60 text-zinc-550 hover:text-zinc-350 hover:border-zinc-800'
                    }`}
                  >
                    12-Hour Clock
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeFormat('24H')}
                    className={`flex-1 p-2.5 rounded-lg border text-xs font-black uppercase tracking-wider transition-all ${
                      timeFormat === '24H'
                        ? 'bg-indigo-600/20 border-indigo-500 text-[#E5E5E5] shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                        : 'bg-black border-black/60 text-zinc-550 hover:text-zinc-350 hover:border-zinc-800'
                    }`}
                  >
                    24-Hour Clock
                  </button>
                </div>
              </div>

              {/* Option Display Time Zone */}
              <div className="pt-4 border-t border-black/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#E5E5E5]">
                  <Monitor className="w-4 h-4 text-zinc-550 shrink-0" />
                  <span>Display Time Zone</span>
                </div>
                <p className="text-xs text-[#8e8e93] leading-relaxed">
                  All times in the app will display in this timezone. US market hours are in Eastern Time.
                </p>
                <div className="mt-2">
                  <select
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value as 'EST' | 'UTC' | 'LOCAL')}
                    className="w-full bg-black border border-black text-[#E5E5E5] rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer appearance-none"
                  >
                    <option value="EST">New York Time (EST / EDT)</option>
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                    <option value="LOCAL">Local System Time (User Device Zone)</option>
                  </select>
                </div>
              </div>

              {/* Option B: Compact rows spacing density (denser row rendering overlay) */}
              <div className="pt-4 border-t border-black/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#E5E5E5]">
                    <Eye className="w-4 h-4 text-zinc-550 shrink-0" />
                    <span>Compact View</span>
                  </div>
                  
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={compactMode}
                      onChange={(e) => {
                        const newVal = e.target.checked;
                        setCompactMode(newVal);
                        applyCompact(newVal);
                        handleSaveSettings(selectedFont, newVal, activeTheme);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:border-black after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:bg-black peer-checked:bg-indigo-600 peer-checked:after:bg-white" />
                  </label>
                </div>
                <p className="text-xs text-[#8e8e93] leading-relaxed">
                  Reduces spacing between rows and panels so more data fits on screen at once.
                </p>
              </div>

              {/* Option D: Background Theme custom swatch grid */}
              <div className="pt-4 border-t border-black/60 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#E5E5E5]">
                  <Palette className="w-4 h-4 text-zinc-550 shrink-0" />
                  <span>Interface Theme</span>
                </div>
                <p className="text-xs text-[#8e8e93] leading-relaxed mb-3">
                  Changes the background and panel colors across the app.
                </p>

                <div className="max-h-72 overflow-y-auto pr-1 -mr-1 mt-3">
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2.5">
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        title={t.name}
                        type="button"
                        onClick={() => {
                          setActiveTheme(t.id);
                          applyTheme(t.id);
                          handleSaveSettings(selectedFont, compactMode, t.id);
                        }}
                        className={`group relative aspect-square rounded-lg border-2 transition-all ${
                          activeTheme === t.id
                            ? 'border-indigo-500 scale-110 shadow-lg z-10'
                            : 'border-black/40 hover:border-black hover:scale-105'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${t.surface} 0%, ${t.surface} 50%, ${t.accent} 50%, ${t.accent} 100%)` }}
                      >
                        {activeTheme === t.id && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Check className="w-4 h-4 text-[#E5E5E5] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-[#8e8e93] uppercase tracking-widest font-mono">
                  Active: <span className="text-[#E5E5E5] font-bold">{THEMES.find(t => t.id === activeTheme)?.name || 'Default'}</span> · {THEMES.length} themes
                </div>
              </div>
            </div>

            {/* Informational notification */}
            <div className="p-4 bg-black/40 border border-black text-[11px] rounded-xl text-[#a1a1aa] leading-relaxed flex gap-3">
              <ShieldAlert className="w-4 h-4 text-[#4ADE80] shrink-0 mt-0.5" />
              <span>
                <b>Note:</b> Themes change background and panel colors. All signal indicators, heat maps, and status colors stay the same so data is always readable.
              </span>
            </div>
          </div>
        )}

        {activeTab === 'keybinds' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-5 relative shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <Type className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-black tracking-tight text-[#E5E5E5]">Keyboard Shortcuts & Hotkeys</h2>
              </div>
              <div className="flex justify-between items-start border-b border-black pb-4 mb-4">
                <p className="text-sm text-zinc-400 max-w-md">
                  Customize quick-access keybinds for global menu toggles and workspace switching. These bindings work universally across macOS (Command) and Windows (Ctrl).
                </p>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-3 bg-black/50 px-3 py-1.5 rounded-lg border border-black">
                    <span className="text-xs font-bold text-[#4ADE80]">Enable All Shortcuts</span>
                    <button
                      onClick={() => setGlobalKeybindsEnabled(!globalKeybindsEnabled)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${globalKeybindsEnabled ? 'bg-indigo-500' : 'bg-black'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${globalKeybindsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const defaults = {
                        home: 'shift+h',
                        skyvision: 'shift+s',
                        pinpoint: 'shift+p',
                        auditor: 'shift+a',
                        dealerflow: 'shift+d',
                        community: 'shift+r',
                        settings: 'shift+o',
                        prismMenu: 'cmd+k',
                      };
                      useContractStore.getState().setKeybinds(defaults);
                      useContractStore.getState().setDisabledKeybinds({});
                      setGlobalKeybindsEnabled(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-400 bg-black/50 hover:bg-black hover:text-[#E5E5E5] border border-black rounded-lg transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Defaults
                  </button>
                </div>
              </div>
              
              <div className={`space-y-2 transition-opacity duration-300 ${!globalKeybindsEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                {[
                  { id: 'prismMenu', label: 'Toggle Prism Command Menu', default: 'cmd+k' },
                  { id: 'home', label: 'Workspace: Home', default: 'shift+h' },
                  { id: 'skyvision', label: 'Workspace: SkyVision', default: 'shift+s' },
                  { id: 'pinpoint', label: 'Workspace: Pinpoint AI', default: 'shift+p' },
                  { id: 'auditor', label: 'Workspace: Quant Auditor', default: 'shift+a' },
                  { id: 'dealerflow', label: 'Workspace: Dealer Flow', default: 'shift+d' },
                  { id: 'community', label: 'Workspace: Research & Community', default: 'shift+r' },
                  { id: 'settings', label: 'Settings & Preferences', default: 'shift+o' },
                ].map(bind => (
                  <KeybindRow key={bind.id} bindId={bind.id as any} label={bind.label} />
                ))}
              </div>
            </div>
            
            <div className="p-4 bg-black/40 border border-black text-[11px] rounded-xl text-[#a1a1aa] leading-relaxed flex gap-3">
              <ShieldAlert className="w-4 h-4 text-[#4ADE80] shrink-0 mt-0.5" />
              <span>
                <b>Hotkey Note:</b> To rebind, click on a shortcut button and press your new key combination. Use Modifier keys (Shift, Ctrl, Alt, Meta) plus a character.
              </span>
            </div>
          </div>
        )}

        {activeTab === 'referrals' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Module 5: Referrals token stats */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-5 relative shadow-lg">
              <div className="absolute top-0 right-0 p-3 text-[10px] text-zinc-600 font-bold uppercase tracking-widest font-mono">
                Referrals
              </div>

              <div className="flex items-center gap-2.5 border-b border-black pb-3">
                <Coins className="w-5 h-5 text-[#4ADE80]" />
                <h2 className="text-lg font-black tracking-tight text-[#E5E5E5]">
                  Referral Rewards Token Pool
                </h2>
              </div>

              <ReferralCodeBox />

              {/* Referral Progress Bar (Gamification) */}
              <div className="bg-black/50 border border-black rounded-xl p-4 overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-[#E5E5E5]">Tokens to Next Free Month</span>
                  <span className="text-xs font-mono text-[#4ADE80]">{session?.referral_tokens_pool || 0} / 10</span>
                </div>
                <div className="w-full h-2.5 bg-black rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-black/40 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, ((session?.referral_tokens_pool || 0) / 10) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Referral Token Pool Dashboard metrics */}
              <div className="grid grid-cols-2 gap-3 bg-black/40 border border-black rounded-xl p-4 text-center">
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500 font-bold block">YOUR TOKENS</span>
                  <span className="text-2xl font-black text-[#4ADE80] font-mono block drop-shadow-[0_0_8px_rgba(34,211,238,0.2)]">
                    {session?.referral_tokens_pool || 0}
                  </span>
                  <span className="text-xs text-zinc-600 block font-mono mt-1">1 Token = 10% Off</span>
                </div>
                
                <div className="space-y-1 border-l border-black/60 pl-3">
                  <span className="text-xs text-zinc-500 font-bold block">CURRENT DISCOUNT</span>
                  <span className="text-2xl font-black text-[#E5E5E5] font-mono block">
                    {Math.min(100, (session?.referral_tokens_pool || 0) * 10)}%
                  </span>
                  <span className="text-xs text-[#8e8e93] block font-mono mt-1">Demo discount</span>
                </div>
              </div>

              {/* Your custom referral code */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-sm text-[#A1A1AA] font-bold block">Your Referral Code</span>
                  <div className="mirror-panel text-[#E5E5E5] rounded-lg px-3 py-2 text-sm font-bold font-mono tracking-widest text-center shadow-inner">
                    {session?.custom_referral_code || 'SLAYERX'}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <span className="text-sm text-[#A1A1AA] font-bold block">Your Custom Referral Link</span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 mirror-panel text-[#a1a1aa] rounded-lg px-3 py-2 text-xs font-bold font-mono md:tracking-wider flex items-center justify-between whitespace-nowrap overflow-hidden text-ellipsis shadow-inner">
                      <span className="truncate pr-2">{referralLink}</span>
                    </div>
                    <button
                      onClick={copyReferralLink}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] text-xs font-bold rounded-lg flex items-center justify-center cursor-pointer transition-colors sm:shrink-0"
                      title="Copy full referral link to clipboard"
                    >
                      {referralCopied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-black/20 border border-black rounded-xl p-6 relative shadow-lg space-y-4">
              <div className="flex justify-between items-center border-b border-black pb-3">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-black tracking-tight text-[#E5E5E5]">Subscription & Tier</h2>
                </div>
                {session?.customer_id && (
                  <span className="text-[8px] tracking-widest uppercase bg-indigo-950/40 px-2 py-0.5 border border-indigo-900/30 rounded text-indigo-400 font-mono">
                    Secured
                  </span>
                )}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 text-left">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Current Plan</div>
                  <div className="text-2xl font-black uppercase text-[#E5E5E5] tracking-widest flex items-center gap-2">
                    <span>{session?.access_tier || 'GUEST'} TIER</span>
                    {session?.cancels_at_period_end ? (
                      <span className="text-[9px] tracking-normal font-sans font-semibold bg-rose-500/10 border border-rose-500/20 text-[#F87171] px-2.5 py-0.5 rounded-full">
                        Cancels at Period End
                      </span>
                    ) : (
                      session?.access_tier && !['guest', 'discord'].includes(session?.access_tier) && (
                        <span className="text-[9px] tracking-normal font-sans font-semibold bg-black/40 border border-black text-[#4ADE80] px-2.5 py-0.5 rounded-full">
                          Active & Auto-renewing
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      useContractStore.getState().setActiveTab('subscription');
                      window.scrollTo({ top: 0, behavior: 'auto' });
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#E5E5E5] font-bold text-xs uppercase tracking-widest rounded-lg transition-colors cursor-pointer"
                  >
                    View Upgrades
                  </button>

                  {session?.access_tier && !['guest', 'discord'].includes(session?.access_tier) && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={!!session?.cancels_at_period_end}
                      className={`px-4 py-2 font-bold text-xs uppercase tracking-widest rounded-lg transition-all cursor-pointer ${
                        session?.cancels_at_period_end
                          ? 'bg-black text-zinc-500 cursor-not-allowed border border-black'
                          : 'bg-black hover:bg-rose-950/20 text-[#F87171] border border-black hover:border-[#F87171]/30'
                      }`}
                    >
                      {session?.cancels_at_period_end ? 'Cancellation Logged' : 'Cancel Subscription'}
                    </button>
                  )}
                </div>
              </div>

              {/* Secure Customer_id and Payment_method_id details */}
              {session?.customer_id && (
                <div className="bg-black/60 border border-black/60 rounded-xl p-4 space-y-2 text-left font-mono text-[10px] text-zinc-500">
                  <div className="text-zinc-400 font-bold text-[9px] uppercase tracking-widest pb-1 border-b border-black/40">Payment Info</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono">
                    <div>
                      <span className="text-zinc-600 font-bold block text-[8px] uppercase">Stripe Customer ID</span>
                      <code className="text-indigo-400 font-mono text-[9.5px]">{session.customer_id}</code>
                    </div>
                    <div>
                      <span className="text-zinc-600 font-bold block text-[8px] uppercase">Tokenized Payment Method ID</span>
                      <code className="text-[#4ADE80] font-mono text-[9.5px]">{session.payment_method_id || 'Not Saved (Iframe Protected)'}</code>
                    </div>
                  </div>
                  <p className="text-[9px] text-zinc-650 italic leading-tight pt-1">
                    No card numbers or CVVs are stored here. Payment details are kept securely by Stripe.
                  </p>
                </div>
              )}

              {/* Confirmation Dialog / Modal */}
              {showCancelConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                  <div className="bg-black border border-black rounded-2xl max-w-md w-full p-6 text-left space-y-4 shadow-2xl relative">
                    <div className="flex items-center gap-3 text-[#F87171] pb-2 border-b border-black">
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <h3 className="text-base font-black uppercase tracking-wider">Are you sure?</h3>
                    </div>
                    
                    <p className="text-xs text-zinc-400 leading-normal font-sans text-left">
                      Canceling your subscription takes effect at the end of your current paid billing period. You will <strong>retain full access</strong> to your current tier and real-time options flow triggers until your paid time expires.
                    </p>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-4 py-2 bg-black hover:bg-black text-[#4ADE80] font-bold text-xs uppercase tracking-widest rounded-lg cursor-pointer transition-all border border-black"
                      >
                        Keep Subscription
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelSubscription}
                        disabled={isCanceling}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-[#E5E5E5] font-bold text-xs uppercase tracking-widest rounded-lg cursor-pointer transition-all flex items-center gap-2 shadow-lg shadow-rose-950/40"
                      >
                        {isCanceling ? 'Processing...' : 'Confirm Cancel'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Invoice simulation box */}
            <div className="bg-black/20 border border-black rounded-xl p-6 space-y-5 relative shadow-lg">
              <div className="flex justify-between items-center border-b border-black pb-3">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-black tracking-tight text-[#E5E5E5]">Billing & Invoices</h2>
                </div>
                <span className="text-[8px] bg-black px-2 py-0.5 border border-black rounded text-zinc-400">Sandbox</span>
              </div>
              
              <p className="text-xs text-zinc-400">
                You currently have no active credit cards on file. This environment uses a developer sandbox integration for simulated billing runs.
              </p>

              <button
                onClick={handleRunSimulatedBilling}
                disabled={isSimulatingInvoice}
                className="w-full py-3 mt-2 bg-indigo-500/10 border border-indigo-500/30 hover:bg-[#6366f1]/20 text-indigo-400 font-black text-xs uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isSimulatingInvoice ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>RUNNING INVOICE SIMULATION...</span>
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    <span>Run Simulated Billing Invoice</span>
                  </>
                )}
              </button>

              {invoiceLog && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-black border border-black rounded-lg p-3 text-left font-mono text-[10px] text-[#a1a1aa] leading-relaxed space-y-1 mt-2 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-1 bg-indigo-500/10 border-l border-b border-black text-indigo-400 font-black tracking-widest text-[7px] uppercase select-none">Invoice Receipt</div>
                  <div className="text-[9px] text-zinc-650 font-black tracking-widest uppercase border-b border-black pb-1 mb-1.5 flex justify-between">
                    <span>BILLING_RUN_RESULT // SUCCESS</span>
                    <span className="text-zinc-600 font-normal">Active tier: {invoiceLog.access_tier}</span>
                  </div>
                  <div>Monthly Plan Price: <span className="text-[#E5E5E5] font-bold font-mono">${invoiceLog.base_rate}.00</span></div>
                  <div>Tokens Used: <span className="text-[#F87171] text-right">-{invoiceLog.tokens_deducted} Tokens ({invoiceLog.discount_rate_pct}% Off)</span></div>
                  <div>Discount Applied: <span className="text-[#4ADE80] text-right">-${(invoiceLog.discount_amount_usd ?? 0).toFixed(2)} USD</span></div>
                  <div className="border-t border-black/60 pt-2 mt-2 font-bold flex justify-between text-[11px]">
                    <span className="text-[#f4f4f5]">Net Amount Charged:</span>
                    <span className="text-[#4ADE80]">${(invoiceLog.total_charged_usd ?? 0).toFixed(2)} USD</span>
                  </div>
                  <div className="border-t border-dashed border-black/80 pt-2 mt-2 text-[9px] text-zinc-600 uppercase flex gap-1.5 items-center">
                    <FolderSync className="w-3.5 h-3.5 text-indigo-400/80 shrink-0" />
                    <span>Unused tokens: {invoiceLog.tokens_remaining_rolled_over} rolled over to next month.</span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </div>

      {toastText && (
        <motion.div 
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`fixed bottom-5 right-5 z-[100] p-4 bg-black border ${toastType === 'success' ? 'border-black' : 'border-rose-500/30'} shadow-2xl flex items-center gap-2.5 font-mono text-[10.5px] text-[#E5E5E5] rounded-sm`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${toastType === 'success' ? 'bg-black/40' : 'bg-rose-500'} animate-pulse`} />
          <span className="uppercase font-semibold tracking-wider text-zinc-400">{toastType === 'success' ? 'SUCCESS' : 'ERROR'}:</span>
          <span>{toastText}</span>
        </motion.div>
      )}
    </div>
  );
}
