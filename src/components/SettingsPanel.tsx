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

// Ordered, de-duplicated theme groups (preserves the curated order from the generator).
const THEME_GROUPS = [...new Set(THEMES.map((t) => t.group))];

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
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 space-y-4">
      <div>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-bold">Your Referral Code</span>
        <div className="flex items-center gap-2 mt-1.5">
          <code className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm font-mono font-bold text-[var(--success)] tracking-widest">{code || '…'}</code>
          <button onClick={copy} className="px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">Share this code — referees get 10% off and you earn +1 token per use.</p>
      </div>
      <div className="pt-3 border-t border-[var(--border)]">
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-bold">Apply a Referral Code</span>
        <div className="flex items-center gap-2 mt-1.5">
          <input
            aria-label="Apply a referral code"
            value={applyInput}
            onChange={(e) => setApplyInput(e.target.value.toUpperCase())}
            placeholder="FRND10OFF"
            className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm font-mono text-[var(--text-primary)] uppercase placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] transition-colors"
          />
          <button onClick={apply} disabled={applying} className="px-4 py-2.5 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors">{applying ? '…' : 'Apply'}</button>
        </div>
        {applyMsg && <p role="alert" className={`text-[10px] mt-1.5 ${applyMsg.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{applyMsg.text}</p>}
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
    <div className={`flex items-center justify-between p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg transition-all ${isDisabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        {/* 36px minimum tap target wrapping the 16px checkbox visual */}
        <button
          onClick={() => setDisabledKeybinds({ [bindId]: !isDisabled })}
          className="flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg cursor-pointer"
          aria-label={isDisabled ? 'Enable keybind' : 'Disable keybind'}
        >
          <span className={`w-4 h-4 rounded flex items-center justify-center border ${isDisabled ? 'bg-transparent border-[var(--border-strong)]' : 'bg-[var(--accent-color)] border-[var(--accent-color)] text-[var(--bg-base)]'}`}>
            {!isDisabled && <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 stroke-current stroke-[3]"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </span>
        </button>
        <span className={`text-sm font-mono font-bold ${isDisabled ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-primary)]'}`}>{label}</span>
      </div>
      <button
        onClick={() => {
          if (!isDisabled) setIsRecording(true);
        }}
        disabled={isDisabled}
        className={`px-3 min-h-[36px] text-xs font-mono font-bold rounded-lg flex items-center justify-center min-w-[80px] transition-all border
          ${isDisabled ? 'bg-[var(--surface)] text-[var(--text-tertiary)] border-[var(--border)] cursor-not-allowed' : isRecording ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)] border-[var(--accent-color)]/50' : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'}`}
      >
        {isRecording ? 'Listening…' : displayKey.toUpperCase()}
      </button>
    </div>
  );
}

export function SettingsPanel({ session, onUpdateSession }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'privacy' | 'preferences' | 'keybinds' | 'referrals' | 'billing'>('profile');
  
  const [selectedFont, setSelectedFont] = useState<'STANDARD' | 'ENHANCED' | 'ENHANCED_XL'>(session?.selected_font_scale || 'STANDARD');
  const [compactMode, setCompactMode] = useState<boolean>(!!session?.compact_view_enabled);
  const [ultrawideMode, setUltrawideMode] = useState<boolean>(!!session?.ultrawide_enabled);
  // '' = native Slayer default (no data-theme). Any other value is a theme id from the generated library.
  const [activeTheme, setActiveTheme] = useState<string>(session?.selected_theme || '');

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
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
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
  const cancelDialogRef = useRef<HTMLDivElement>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement>(null);

  // Cancel-subscription modal a11y: focus the dialog on open, support Escape to
  // close, and restore focus to the trigger button on close.
  useEffect(() => {
    if (!showCancelConfirm) return;
    cancelDialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isCanceling) setShowCancelConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelTriggerRef.current?.focus();
    };
  }, [showCancelConfirm, isCanceling]);

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
      // Sync appearance prefs (these only seed via useState on first mount,
      // so re-sync here when the session loads/changes to avoid stale values).
      if (session.selected_font_scale) setSelectedFont(session.selected_font_scale);
      setCompactMode(!!session.compact_view_enabled);
      setUltrawideMode(!!session.ultrawide_enabled);
      if (session.selected_theme) setActiveTheme(session.selected_theme);

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
      }
    } else {
      if (metaTag) {
        metaTag.remove();
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
        showToast('Couldn’t sign out your other sessions.', 'error');
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

    setIsChangingPassword(true);
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
        setPwSuccess('Password updated.');
        setCurrentPassword('');
        setNewPassword('');
        showToast('Password updated.');
      }
    } catch (err) {
      setPwError('Server connection timeout. Please verify backend status.');
    } finally {
      setIsChangingPassword(false);
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
        showToast('Account deactivated. Signing out…', 'success');
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
    { id: 'billing', label: 'Billing', icon: Receipt },
    { id: 'security', label: 'Account & Security', icon: Lock },
    { id: 'privacy', label: 'Privacy & Alerts', icon: ShieldAlert },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'keybinds', label: 'Keyboard Shortcuts', icon: Type },
    { id: 'referrals', label: 'Referrals', icon: Coins },
  ] as const;

  // The Default swatch is "active" whenever no valid custom theme id is selected.
  const isDefaultThemeActive = !THEMES.some((t) => t.id === activeTheme);

  return (
    <div id="slayer-settings-panel" className="w-full flex flex-col gap-4 text-left font-mono max-w-[860px] mx-auto">

      {/* Tab Navigation — horizontal scroll on mobile, wraps with comfortable tap targets on md+ */}
      <div className="w-full">
        <div className="flex flex-nowrap overflow-x-auto gap-1.5 pb-1 md:flex-wrap md:overflow-x-visible scrollbar-none" role="tablist" aria-label="Settings sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 flex items-center gap-2 px-4 rounded-lg text-[11px] font-mono font-bold uppercase tracking-[0.15em] transition-all cursor-pointer min-h-[40px] md:min-h-[40px] whitespace-nowrap ${
                  isActive
                    ? 'bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-strong)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[var(--accent-color)]' : 'text-[var(--text-tertiary)]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 h-px bg-[var(--border)]" />
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
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <Lock className="w-4 h-4 text-[var(--accent-color)]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Account Security</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">Manage two-factor authentication, passwords, and account deletion.</p>

              <TwoFactorFlow />
            </div>

            {/* Email Transition Container */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[var(--accent-color)] stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 19.5h18M3 4.5h18M3 9.5h18M3 14.5h18" /></svg>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Primary Email &amp; Two-Step OTP</span>
              </div>

              <div className="space-y-3">
                <div className="text-xs text-[var(--text-secondary)] leading-normal">
                  Changing your email requires a verification code. A security notice will also be sent to your old address.
                </div>

                <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-lg text-xs">
                  <div className="text-[var(--text-tertiary)] font-bold mb-0.5 uppercase tracking-wide">Current Email</div>
                  <div className="text-[var(--text-primary)] font-mono font-bold">{session?.email || 'N/A'}</div>
                </div>

                {emailError && <div role="alert" className="text-xs font-bold text-[var(--danger)] p-2 bg-[var(--surface-2)] rounded-md border border-[var(--danger)]/30">{emailError}</div>}
                {emailSuccess && <div role="status" className="text-xs font-bold text-[var(--success)] p-2 bg-[var(--surface-2)] rounded-md border border-[var(--success)]/30">{emailSuccess}</div>}

                {otpSent ? (
                  <form onSubmit={handleEmailUpdateVerify} className="space-y-3 animate-fadeIn">
                    <div className="p-3 bg-[var(--accent-color)]/5 border border-[var(--accent-color)]/30 rounded-lg text-xs space-y-2">
                      <div className="font-bold text-[var(--accent-color)] uppercase tracking-wider text-[10px]">Verification Code</div>
                      <div className="font-mono text-sm font-bold text-[var(--success)] bg-[var(--surface-2)] px-2 py-1 rounded w-fit select-all border border-[var(--border)]">
                        {simulatedOtp}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="settings-email-otp" className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Enter Verification Code</label>
                      <input
                        id="settings-email-otp"
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        maxLength={6}
                        value={emailOtp}
                        onChange={e => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-center text-sm font-mono tracking-widest text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] transition-colors"
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setEmailOtp(''); }}
                        className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 min-h-[40px] bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      >
                        Verify &amp; Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleEmailUpdateRequest} className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="settings-new-email" className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">New Email Address</label>
                      <input
                        id="settings-new-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] transition-colors"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 min-h-[40px] bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      >
                        Send Verification Code
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Password Mutation Container */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[var(--accent-color)] stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Change Password</span>
              </div>

              <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                {pwError && <div role="alert" className="text-xs font-bold text-[var(--danger)] p-2 bg-[var(--surface-2)] rounded-md border border-[var(--danger)]/30">{pwError}</div>}
                {pwSuccess && <div role="status" className="text-xs font-bold text-[var(--success)] p-2 bg-[var(--surface-2)] rounded-md border border-[var(--success)]/30">{pwSuccess}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="settings-current-password" className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Current Password</label>
                    <input
                      id="settings-current-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="settings-new-password" className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">New Password</label>
                    <input
                      id="settings-new-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] transition-colors"
                    />
                  </div>
                </div>

                <ul className="text-[10px] text-[var(--text-tertiary)] space-y-1 leading-normal list-disc pl-4">
                  <li>At least 8 characters.</li>
                  <li>At least one uppercase letter.</li>
                  <li>At least one digit (0-9) and one special character.</li>
                </ul>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="px-4 py-2 min-h-[40px] bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] rounded-lg text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isChangingPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isChangingPassword ? 'Updating…' : 'Update Password'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Active Sessions & SSO Container */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[var(--accent-color)] stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Active Sessions</span>
                </div>
                <button
                  onClick={handleRevokeAllSessions}
                  type="button"
                  className="px-3 py-1 bg-[var(--danger)]/10 hover:bg-[var(--danger)] border border-[var(--danger)]/20 hover:border-[var(--danger)] text-[var(--danger)] hover:text-[var(--text-primary)] text-[11px] font-bold rounded-lg cursor-pointer transition-all"
                >
                  Log Out All Devices
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-normal">
                Devices and browsers currently signed in to your account. "Log Out All Devices" signs them out immediately.
              </p>

              <div className="divide-y divide-[var(--border)] bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden">
                {sessions.length === 0 ? (
                  <div className="p-4 text-xs text-center text-[var(--text-tertiary)] font-mono">No active sessions located.</div>
                ) : (
                  sessions.map((sess, idx) => (
                    <div key={idx} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)] font-mono">{sess.ip_address}</span>
                          {sess.is_current ? (
                            <span className="px-2 py-0.5 bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)] font-bold text-[9px] rounded-full uppercase tracking-wider">
                              Current
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-tertiary)] font-bold text-[9px] rounded-full uppercase tracking-wider">
                              Other Device
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate max-w-[300px] sm:max-w-md font-mono" title={sess.user_agent}>
                          {sess.user_agent}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                          Created: {formatDateTime(sess.created_at)} · Activity: {formatTime(sess.last_active)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* GDPR Deactivation & Account Purge Container */}
            <div className="bg-[var(--surface)] border border-[var(--danger)]/20 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-[var(--danger)]/20 pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[var(--danger)] stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--danger)]">Delete Account</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-normal">
                Under GDPR you can request account deletion. Your account is deactivated immediately and permanently removed after 30 days.
              </p>

              {deleteError && <div role="alert" className="text-xs font-bold text-[var(--danger)] p-2 bg-[var(--surface-2)] rounded-md border border-[var(--danger)]/30">{deleteError}</div>}

              {showDeleteConfirm ? (
                <div className="p-4 bg-[var(--surface-2)] border border-[var(--danger)]/30 rounded-lg space-y-3 animate-fadeIn">
                  <div className="text-xs text-[var(--text-primary)] font-bold">Are you absolutely sure?</div>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-normal">
                    This immediately disables your username, API keys, and options flow access. After 30 days it cannot be undone.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSoftDeleteAccount}
                      className="px-4 py-1.5 bg-[var(--danger)] hover:brightness-110 text-black rounded-lg text-xs font-bold cursor-pointer transition-all"
                    >
                      Confirm Delete Account
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-[var(--danger)]/10 hover:bg-[var(--danger)] border border-[var(--danger)]/20 hover:border-[var(--danger)] text-[var(--danger)] hover:text-black text-xs font-bold rounded-lg cursor-pointer transition-all"
                >
                  Request Account Deletion
                </button>
              )}
            </div>

          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-6 animate-fadeIn pb-12">

            {/* Notification preferences JSONB manager */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[var(--accent-color)] stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Notification Preferences</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-normal">
                Alerts are only sent through the channels you turn on.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="bg-[var(--surface-2)] p-4 rounded-xl border border-[var(--border)] flex items-center justify-between gap-3 cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">Email Alerts</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Send alerts to your email</div>
                  </div>
                  <span className="relative inline-flex items-center shrink-0">
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
                    <div className="w-9 h-5 bg-[var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-tertiary)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-color)] peer-checked:after:bg-[var(--bg-base)]"></div>
                  </span>
                </label>

                <label className="bg-[var(--surface-2)] p-4 rounded-xl border border-[var(--border)] flex items-center justify-between gap-3 cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">SMS Alerts</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Send alerts to your phone via SMS</div>
                  </div>
                  <span className="relative inline-flex items-center shrink-0">
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
                    <div className="w-9 h-5 bg-[var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-tertiary)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-color)] peer-checked:after:bg-[var(--bg-base)]"></div>
                  </span>
                </label>

                <label className="bg-[var(--surface-2)] p-4 rounded-xl border border-[var(--border)] flex items-center justify-between gap-3 cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">Discord Webhook Feeds</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Post sweeps directly to server webhooks</div>
                  </div>
                  <span className="relative inline-flex items-center shrink-0">
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
                    <div className="w-9 h-5 bg-[var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-tertiary)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-color)] peer-checked:after:bg-[var(--bg-base)]"></div>
                  </span>
                </label>

                <label className="bg-[var(--surface-2)] p-4 rounded-xl border border-[var(--border)] flex items-center justify-between gap-3 cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">Options Flow Alerts</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Alert on large GEX deviation events</div>
                  </div>
                  <span className="relative inline-flex items-center shrink-0">
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
                    <div className="w-9 h-5 bg-[var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-tertiary)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-color)] peer-checked:after:bg-[var(--bg-base)]"></div>
                  </span>
                </label>
              </div>
            </div>

            {/* Profile Visibility Enums & Search Indexing */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[var(--accent-color)] stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Profile Visibility &amp; Search</span>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-[var(--text-primary)] block">Profile Visibility</span>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-normal">Controls who can find and view your profile.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono">
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
                            ? 'bg-[var(--accent-color)]/10 border-[var(--accent-color)] text-[var(--text-primary)]'
                            : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[9px] text-[var(--text-tertiary)] mt-0.5 leading-tight">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between gap-4">
                  <div className="max-w-[80%]">
                    <span className="text-xs font-bold text-[var(--text-primary)] block">Restrict Search Engine Indexing</span>
                    <p className="text-[11px] text-[var(--text-tertiary)] leading-normal">
                      Adds a <code className="font-mono text-[var(--accent-color)]">noindex</code> tag so Google and Bing don't index your public profile.
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
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
                    <div className="w-9 h-5 bg-[var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-tertiary)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-color)] peer-checked:after:bg-[var(--bg-base)]"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* GDPR Compliance Data Export */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <FolderSync className="w-4 h-4 text-[var(--accent-color)]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Download Your Data (GDPR)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-normal">
                Export all your account data — logs, preferences, and payment records — as a single download. The file is available for 24 hours, then deleted.
              </p>

              {isExporting ? (
                <div className="space-y-2 animate-fadeIn pt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[var(--text-secondary)]">Building your data export…</span>
                    <span className="text-[var(--accent-color)] font-bold">{exportProgress}%</span>
                  </div>
                  <div className="w-full bg-[var(--surface-2)] h-2 rounded overflow-hidden border border-[var(--border)]">
                    <div className="bg-[var(--accent-color)] h-full transition-all duration-300" style={{ width: `${exportProgress}%` }}></div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={triggerGdprExport}
                    className="px-4 py-2 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    Export My Data
                  </button>
                </div>
              )}

              {/* Download Container */}
              {exportDownloadUrl && (
                <div className="mt-4 p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--success)]">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <span>Data export ready</span>
                  </div>

                  <div className="text-[11px] text-[var(--text-tertiary)] leading-normal">
                    Expires: {exportExpiresAt ? formatDateTime(exportExpiresAt) : 'in 24 hours'}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <a
                      href={exportDownloadUrl}
                      download
                      className="px-4 py-2 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] rounded-lg text-xs font-bold text-center cursor-pointer transition-colors flex items-center justify-center gap-2"
                    >
                      <span>Download Export Package</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        const link = window.location.origin + exportDownloadUrl;
                        navigator.clipboard.writeText(link);
                        showToast("Download URL copied.");
                      }}
                      className="px-4 py-2 bg-[var(--surface)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold border border-[var(--border)] text-xs rounded-lg cursor-pointer transition-colors"
                    >
                      Copy Direct File URL
                    </button>
                  </div>

                  {exportEmailLog && (
                    <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg text-[10px] space-y-1 font-mono">
                      <div className="font-bold text-[var(--text-secondary)] uppercase tracking-wider">Email notification</div>
                      <p className="text-[var(--text-tertiary)]">{exportEmailLog}</p>
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
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <Settings className="w-4 h-4 text-[var(--accent-color)]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Display Preferences</span>
              </div>

              {/* Option A: Font Size Scaling (STANDARD vs ENHANCED) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <Type className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span>Text Size</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-normal">
                  Adjust how large the text appears throughout the app.
                </p>

                <div className="mt-2">
                  <select
                    aria-label="Text size"
                    value={selectedFont}
                    onChange={(e) => {
                      const newVal = e.target.value as 'STANDARD' | 'ENHANCED' | 'ENHANCED_XL';
                      setSelectedFont(newVal);
                      applyTextSize(newVal);
                      handleSaveSettings(newVal, compactMode, activeTheme);
                    }}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg p-3 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] transition-colors cursor-pointer appearance-none"
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="ENHANCED">Large</option>
                    <option value="ENHANCED_XL">Extra Large</option>
                  </select>
                </div>
              </div>

              {/* Option Hour Format */}
              <div className="pt-4 border-t border-[var(--border)] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <Clock className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span>Clock Format</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-normal">
                  Show times as 12-hour (AM/PM) or 24-hour.
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setTimeFormat('12H')}
                    className={`flex-1 p-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${
                      timeFormat === '12H'
                        ? 'bg-[var(--accent-color)]/20 border-[var(--accent-color)] text-[var(--text-primary)]'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    12-Hour Clock
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeFormat('24H')}
                    className={`flex-1 p-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${
                      timeFormat === '24H'
                        ? 'bg-[var(--accent-color)]/20 border-[var(--accent-color)] text-[var(--text-primary)]'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    24-Hour Clock
                  </button>
                </div>
              </div>

              {/* Option Display Time Zone */}
              <div className="pt-4 border-t border-[var(--border)] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <Monitor className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span>Display Time Zone</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-normal">
                  All times display in this timezone. US market hours are in Eastern Time.
                </p>
                <div className="mt-2">
                  <select
                    aria-label="Display time zone"
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value as 'EST' | 'UTC' | 'LOCAL')}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg p-3 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] transition-colors cursor-pointer appearance-none"
                  >
                    <option value="EST">New York Time (EST / EDT)</option>
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                    <option value="LOCAL">Local System Time (User Device Zone)</option>
                  </select>
                </div>
              </div>

              {/* Option B: Compact rows spacing density (denser row rendering overlay) */}
              <div className="pt-4 border-t border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                    <Eye className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                    <span>Compact View</span>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
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
                    <div className="w-9 h-5 bg-[var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-tertiary)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-color)] peer-checked:after:bg-[var(--bg-base)]" />
                  </label>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-normal">
                  Reduces spacing between rows and panels so more data fits on screen at once.
                </p>
              </div>

              {/* Option D: Background Theme custom swatch grid */}
              <div className="pt-4 border-t border-[var(--border)] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <Palette className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span>Interface Theme</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-normal mb-3">
                  Changes the background and panel colors across the app.
                </p>

                <div className="max-h-80 overflow-y-auto pr-1 -mr-1 mt-3 space-y-4">
                  {/* Default / brand reset — restores the native Slayer black-and-white design */}
                  <div>
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono mb-1.5">Default</div>
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-2.5">
                      <button
                        title="Default (Slayer)"
                        type="button"
                        onClick={() => {
                          setActiveTheme('');
                          applyTheme('');
                          handleSaveSettings(selectedFont, compactMode, '');
                        }}
                        className={`group relative aspect-square rounded-lg border-2 transition-all ${
                          isDefaultThemeActive
                            ? 'border-[var(--accent-color)] scale-110 z-10'
                            : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:scale-105'
                        }`}
                        style={{ background: 'linear-gradient(135deg, #0A0A0A 0%, #0A0A0A 50%, #FFFFFF 50%, #FFFFFF 100%)' }}
                      >
                        {isDefaultThemeActive && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Curated theme groups */}
                  {THEME_GROUPS.map(group => (
                    <div key={group}>
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono mb-1.5">{group}</div>
                      <div className="grid grid-cols-6 sm:grid-cols-8 gap-2.5">
                        {THEMES.filter(t => t.group === group).map(t => (
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
                                ? 'border-[var(--accent-color)] scale-110 z-10'
                                : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:scale-105'
                            }`}
                            style={{ background: `linear-gradient(135deg, ${t.surface} 0%, ${t.surface} 50%, ${t.accent} 50%, ${t.accent} 100%)` }}
                          >
                            {activeTheme === t.id && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <Check className="w-4 h-4 text-[var(--text-primary)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono">
                  Active: <span className="text-[var(--text-primary)] font-bold">{THEMES.find(t => t.id === activeTheme)?.name || 'Default'}</span> · {THEMES.length} themes
                </div>
              </div>
            </div>

            {/* Informational notification */}
            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] text-[11px] rounded-xl text-[var(--text-secondary)] leading-normal flex gap-3">
              <ShieldAlert className="w-4 h-4 text-[var(--success)] shrink-0 mt-0.5" />
              <span>
                Themes change background and panel colors only. Signal indicators, heat maps, and status colors stay the same so data is always readable.
              </span>
            </div>
          </div>
        )}

        {activeTab === 'keybinds' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <Type className="w-4 h-4 text-[var(--accent-color)]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Keyboard Shortcuts</span>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-[var(--border)] pb-4">
                <p className="text-xs text-[var(--text-secondary)] max-w-md leading-normal">
                  Quick-access keybinds for menu toggles and workspace switching. Bindings work across macOS (Command) and Windows (Ctrl).
                </p>

                <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto shrink-0">
                  <div className="flex items-center justify-between gap-3 bg-[var(--surface-2)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
                    <span className="text-xs font-bold text-[var(--text-primary)]">Enable All Shortcuts</span>
                    <button
                      onClick={() => setGlobalKeybindsEnabled(!globalKeybindsEnabled)}
                      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${globalKeybindsEnabled ? 'bg-[var(--accent-color)]' : 'bg-[var(--surface-3)]'}`}
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
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Defaults
                  </button>
                </div>
              </div>

              <div className={`space-y-2 transition-opacity duration-300 ${!globalKeybindsEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                {[
                  { id: 'prismMenu', label: 'Toggle Command Palette', default: 'cmd+k' },
                  { id: 'home', label: 'Workspace: Home', default: 'shift+h' },
                  { id: 'skyvision', label: 'Workspace: SkyVision', default: 'shift+s' },
                  { id: 'pinpoint', label: 'Workspace: Pinpoint GEX', default: 'shift+p' },
                  { id: 'auditor', label: 'Workspace: Trade History', default: 'shift+a' },
                  { id: 'dealerflow', label: 'Workspace: Dealer Flow', default: 'shift+d' },
                  { id: 'community', label: 'Workspace: Research & Community', default: 'shift+r' },
                  { id: 'settings', label: 'Settings & Preferences', default: 'shift+o' },
                ].map(bind => (
                  <KeybindRow key={bind.id} bindId={bind.id as any} label={bind.label} />
                ))}
              </div>
            </div>

            <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] text-[11px] rounded-xl text-[var(--text-secondary)] leading-normal flex gap-3">
              <ShieldAlert className="w-4 h-4 text-[var(--success)] shrink-0 mt-0.5" />
              <span>
                To rebind, click a shortcut button and press your new key combination. Use a modifier (Shift, Ctrl, Alt, Meta) plus a character.
              </span>
            </div>
          </div>
        )}

        {activeTab === 'referrals' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Module 5: Referrals token stats */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
                <Coins className="w-4 h-4 text-[var(--success)]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Referral Rewards</span>
              </div>

              <ReferralCodeBox />

              {/* Referral Progress Bar (Gamification) */}
              <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">Tokens to Next Free Month</span>
                  <span className="text-xs font-mono text-[var(--success)]">{session?.referral_tokens_pool || 0} / 10</span>
                </div>
                <div className="w-full h-2.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--success)] rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, ((session?.referral_tokens_pool || 0) / 10) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Referral Token Pool Dashboard metrics */}
              <div className="grid grid-cols-2 gap-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 text-center">
                <div className="space-y-1">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Your Tokens</span>
                  <span className="text-2xl font-black text-[var(--success)] font-mono block">
                    {session?.referral_tokens_pool || 0}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] block font-mono mt-1">1 Token = 10% Off</span>
                </div>

                <div className="space-y-1 border-l border-[var(--border)] pl-3">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Current Discount</span>
                  <span className="text-2xl font-black text-[var(--text-primary)] font-mono block">
                    {Math.min(100, (session?.referral_tokens_pool || 0) * 10)}%
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] block font-mono mt-1">Applied at renewal</span>
                </div>
              </div>

              {/* Your custom referral code */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Your Referral Code</span>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm font-bold font-mono tracking-widest text-center">
                    {session?.custom_referral_code || 'SLAYERX'}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Your Custom Referral Link</span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] rounded-lg px-3 py-2 text-xs font-mono md:tracking-wider flex items-center">
                      <span className="break-all">{referralLink}</span>
                    </div>
                    <button
                      onClick={copyReferralLink}
                      className="px-6 py-2 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] text-xs font-bold rounded-lg flex items-center justify-center cursor-pointer transition-colors sm:shrink-0"
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
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4 text-[var(--accent-color)]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Subscription &amp; Tier</span>
                </div>
                {session?.customer_id && (
                  <span className="text-[9px] tracking-widest uppercase bg-[var(--accent-color)]/10 px-2 py-0.5 border border-[var(--accent-color)]/30 rounded text-[var(--accent-color)] font-mono">
                    Secured
                  </span>
                )}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 text-left">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">Current Plan</div>
                  <div className="text-2xl font-black uppercase text-[var(--text-primary)] tracking-widest flex items-center gap-2 flex-wrap">
                    <span>{session?.access_tier || 'GUEST'} TIER</span>
                    {session?.cancels_at_period_end ? (
                      <span className="text-[9px] tracking-normal font-sans font-semibold bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] px-2.5 py-0.5 rounded-full">
                        Cancels at Period End
                      </span>
                    ) : (
                      session?.access_tier && !['guest', 'discord'].includes(session?.access_tier) && (
                        <span className="text-[9px] tracking-normal font-sans font-semibold bg-[var(--success)]/10 border border-[var(--success)]/20 text-[var(--success)] px-2.5 py-0.5 rounded-full">
                          Active &amp; Auto-renewing
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      useContractStore.getState().setActiveTab('subscription');
                      window.scrollTo({ top: 0, behavior: 'auto' });
                    }}
                    className="px-4 py-2 min-h-[40px] bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] font-bold text-xs uppercase tracking-widest rounded-lg transition-colors cursor-pointer"
                  >
                    View Upgrades
                  </button>

                  {session?.access_tier && !['guest', 'discord'].includes(session?.access_tier) && (
                    <button
                      ref={cancelTriggerRef}
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={!!session?.cancels_at_period_end}
                      className={`px-4 py-2 min-h-[40px] font-bold text-xs uppercase tracking-widest rounded-lg transition-all cursor-pointer border ${
                        session?.cancels_at_period_end
                          ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] cursor-not-allowed border-[var(--border)]'
                          : 'bg-[var(--surface-2)] hover:bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--border)] hover:border-[var(--danger)]/30'
                      }`}
                    >
                      {session?.cancels_at_period_end ? 'Cancellation Logged' : 'Cancel Subscription'}
                    </button>
                  )}
                </div>
              </div>

              {/* Secure Customer_id and Payment_method_id details */}
              {session?.customer_id && (
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 space-y-2 text-left font-mono text-[10px] text-[var(--text-tertiary)]">
                  <div className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-widest pb-1 border-b border-[var(--border)]">Payment Info</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono">
                    <div>
                      <span className="text-[var(--text-tertiary)] font-bold block text-[9px] uppercase">Stripe Customer ID</span>
                      <code className="text-[var(--accent-color)] font-mono text-[10px]">{session.customer_id}</code>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] font-bold block text-[9px] uppercase">Tokenized Payment Method ID</span>
                      <code className="text-[var(--success)] font-mono text-[10px]">{session.payment_method_id || 'Not Saved (Iframe Protected)'}</code>
                    </div>
                  </div>
                  <p className="text-[9px] text-[var(--text-tertiary)] italic leading-tight pt-1">
                    No card numbers or CVVs are stored here. Payment details are kept securely by Stripe.
                  </p>
                </div>
              )}

              {/* Confirmation Dialog / Modal */}
              {showCancelConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => { if (!isCanceling) setShowCancelConfirm(false); }}>
                  <div
                    ref={cancelDialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cancel-subscription-title"
                    tabIndex={-1}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 text-left space-y-4 shadow-2xl relative focus:outline-none"
                  >
                    <div className="flex items-center gap-3 text-[var(--danger)] pb-2 border-b border-[var(--border)]">
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <h3 id="cancel-subscription-title" className="text-base font-black uppercase tracking-wider">Are you sure?</h3>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] leading-normal font-sans text-left">
                      Cancellation takes effect at the end of your current paid billing period. You <strong className="text-[var(--text-primary)]">retain full access</strong> to your tier and real-time options flow triggers until then.
                    </p>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest rounded-lg cursor-pointer transition-all border border-[var(--border)]"
                      >
                        Keep Subscription
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelSubscription}
                        disabled={isCanceling}
                        className="px-4 py-2 bg-[var(--danger)] hover:brightness-110 text-black font-bold text-xs uppercase tracking-widest rounded-lg cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {isCanceling ? 'Processing…' : 'Confirm Cancel'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Invoice simulation box */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5">
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4 text-[var(--accent-color)]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Billing &amp; Invoices</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider bg-[var(--surface-2)] px-2 py-0.5 border border-[var(--border)] rounded text-[var(--text-tertiary)]">Sandbox</span>
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-normal">
                No active cards on file. This environment uses a developer sandbox for simulated billing runs.
              </p>

              <button
                onClick={handleRunSimulatedBilling}
                disabled={isSimulatingInvoice}
                className="w-full py-3 bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] font-bold text-xs uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSimulatingInvoice ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Running Invoice Simulation…</span>
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
                  className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4 text-left font-mono text-[10px] text-[var(--text-secondary)] leading-relaxed space-y-1.5"
                >
                  <div className="text-[9px] text-[var(--text-tertiary)] font-bold tracking-widest uppercase border-b border-[var(--border)] pb-1.5 mb-1.5 flex justify-between">
                    <span>Invoice Receipt</span>
                    <span className="font-normal">Tier: {invoiceLog.access_tier}</span>
                  </div>
                  <div className="flex justify-between">Monthly Plan Price <span className="text-[var(--text-primary)] font-bold">${invoiceLog.base_rate}.00</span></div>
                  <div className="flex justify-between">Tokens Used <span className="text-[var(--danger)]">-{invoiceLog.tokens_deducted} ({invoiceLog.discount_rate_pct}% Off)</span></div>
                  <div className="flex justify-between">Discount Applied <span className="text-[var(--success)]">-${(invoiceLog.discount_amount_usd ?? 0).toFixed(2)}</span></div>
                  <div className="border-t border-[var(--border)] pt-2 mt-2 font-bold flex justify-between text-[11px]">
                    <span className="text-[var(--text-primary)]">Net Charged</span>
                    <span className="text-[var(--success)]">${(invoiceLog.total_charged_usd ?? 0).toFixed(2)} USD</span>
                  </div>
                  <div className="border-t border-[var(--border)] pt-2 mt-2 text-[9px] text-[var(--text-tertiary)] uppercase flex gap-1.5 items-center">
                    <FolderSync className="w-3.5 h-3.5 text-[var(--accent-color)]/80 shrink-0" />
                    <span>{invoiceLog.tokens_remaining_rolled_over} unused tokens rolled over to next month.</span>
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
          className={`fixed bottom-5 right-5 z-[100] p-4 bg-[var(--surface-2)] border ${toastType === 'success' ? 'border-[var(--success)]/30' : 'border-[var(--danger)]/30'} shadow-2xl flex items-center gap-2.5 font-mono text-[10.5px] text-[var(--text-primary)] rounded-lg`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${toastType === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'} animate-pulse`} />
          <span className={`uppercase font-semibold tracking-wider ${toastType === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{toastType === 'success' ? 'Success' : 'Error'}:</span>
          <span>{toastText}</span>
        </motion.div>
      )}
    </div>
  );
}
