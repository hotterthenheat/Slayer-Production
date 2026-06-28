import React, { ReactNode } from 'react';
import { useContractStore, useTierValidation } from '../lib/store';
import { Lock, ArrowRight, ShieldCheck, Check, Sparkles, MessageSquare, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

interface TierGuardProps {
  requiredTier: number;
  tabKey: string;
  planKey: string;
  planName: string;
  planPrice: string;
  children: ReactNode;
}

// Interactive details specific to each tier
const TIER_LOOKUP: Record<string, {
  badge: string;
  desc: string;
  features: string[];
  accentColor: string;
  badgeBg: string;
}> = {
  discord: {
    badge: "Tier 1 // Discord",
    desc: "Get live trade alerts and join the active trader community on Discord.",
    features: [
      "Real-time Discord alerts and chat",
      "Daily options discovery reports",
      "Verified trade history archive"
    ],
    accentColor: "indigo",
    badgeBg: "bg-[var(--accent-color)]/10 text-[var(--accent-color)] border-[var(--accent-color)]/20"
  },
  pinpoint: {
    badge: "Tier 2 // Pinpoint GEX",
    desc: "Track live dealer positioning and key GEX levels in real time — the dealer-GEX tool.",
    features: [
      "Live dealer positioning (GEX, DEX, VEX)",
      "Gamma exposure by strike",
      "Zero-DTE levels and dealer dynamics",
      "Discord included"
    ],
    accentColor: "zinc",
    badgeBg: "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border)]"
  },
  skyvision: {
    badge: "Tier 3 // SkyVision",
    desc: "The flagship — it tells you which options to trade, with the live volatility surface, expected P&L and trade-health score, plus the Pinpoint GEX tool and Quant Lab built in.",
    features: [
      "Actionable trade picks & health score",
      "Live volatility surface + expected P&L",
      "Pinpoint GEX dealer positioning included",
      "Quant Lab: backtester, order flow & momentum",
      "Discord alerts included"
    ],
    accentColor: "zinc",
    badgeBg: "bg-[var(--surface-3)] text-[var(--text-primary)] border-[var(--border-strong)]"
  },
  quant: {
    badge: "Tier 3 // SkyVision",
    desc: "The flagship — it tells you which options to trade, with the live volatility surface, expected P&L and trade-health score, plus the Pinpoint GEX tool and Quant Lab built in.",
    features: [
      "Actionable trade picks & health score",
      "Live volatility surface + expected P&L",
      "Pinpoint GEX dealer positioning included",
      "Quant Lab: backtester, order flow & momentum",
      "Discord alerts included"
    ],
    accentColor: "zinc",
    badgeBg: "bg-[var(--surface-3)] text-[var(--text-primary)] border-[var(--border-strong)]"
  }
};

export default function TierGuard({
  requiredTier,
  tabKey,
  planKey,
  planName,
  planPrice,
  children
}: TierGuardProps) {
  useTierValidation();
  const purchasedTier = useContractStore(s => s.purchasedTier);
  const setCheckoutPlan = useContractStore(s => s.setCheckoutPlan);
  const setActiveTab = useContractStore(s => s.setActiveTab);
  const userHasAccount = useContractStore(s => s.isAuthenticated);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const hasAccess = purchasedTier >= requiredTier;

  if (hasAccess) {
    return <>{children}</>;
  }

  // Specialized Discord Active subscriber portal gate — only when the locked tab is the
  // immediate next step up (Tier 2 / SkyVision). For higher-tier tabs a Tier-1 user
  // falls through to the generic upgrade card, which shows the correct required level.
  if (purchasedTier === 1 && requiredTier === 2) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-3xl mx-auto my-12 border border-[#5865F2]/40 bg-[var(--bg-base)] rounded-2xl relative overflow-hidden shadow-[0_25px_60px_-15px_rgba(88,101,242,0.15)] p-6 md:p-10"
      >
        {/* Decorative mechanical and glow accents */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#5865F2]/10 rounded-full blur-[125px] pointer-events-none -mr-40 -mt-40" />
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#5865F2]/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-[#5865F2]/10 to-transparent" />

        <div className="flex flex-col items-center text-center space-y-4 relative z-10 pb-6 border-b border-[var(--border)]">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#5865F2]/30 bg-[#5865F2]/10 text-[#5865F2] text-[9.5px] font-black uppercase tracking-wider font-mono">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#5865F2]"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#5865F2]"></span>
            </span>
            <span>Discord Active</span>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans flex items-center justify-center gap-2.5">
              <span>DISCORD COMMUNITY ACCESS</span>
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] max-w-lg leading-relaxed font-sans mt-1">
              Your subscription is active. The <strong>Discord Tier</strong> gives you live options sweep alerts, trade setups, and access to our active trader community server.
            </p>
          </div>
        </div>

        {/* Big Nice UI Style Discord Invitation Button Link */}
        <div className="relative z-10 py-8 px-6 my-6 bg-[var(--bg-base)] border border-[#5865F2]/20 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-[inset_0_1px_3px_rgba(255,255,255,0.02)]">
          <div className="space-y-1.5 text-center md:text-left flex-1">
            <span className="text-[9px] text-[#5865F2] font-mono font-black uppercase tracking-widest block">
              JOIN THE SERVER
            </span>
            <h4 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-tight">
              SLAYER DISCORD INVITE LINK
            </h4>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-normal max-w-md">
              Click below to join. Make sure your Discord username matches your account so you receive full access to the alerts channels.
            </p>
          </div>

          <a 
            href="https://discord.gg/euvkqFtgFa"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-4 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-[var(--text-primary)] font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(88,101,242,0.4)] flex items-center gap-2.5 transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer shrink-0"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>JOIN DISCORD CHANNEL</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
          </a>
        </div>

        {/* Upgrade block letting them know their account is safe and they can upgrade */}
        <div className="relative z-10 border-t border-[var(--border)] pt-6 text-center space-y-4">
          <div className="max-w-md mx-auto space-y-1">
            <span className="text-[9.5px] font-mono font-black text-[var(--text-tertiary)] uppercase tracking-widest block">
              WANT THE FULL DASHBOARD AND GEX CHARTS?
            </span>
            <p className="text-[10px] text-[var(--text-tertiary)] leading-normal font-sans">
              You are on the Discord-only plan. Expected move levels, GEX charts, and live order flow require a <strong>Tier 2 (SkyVision)</strong> plan or higher.
            </p>
          </div>

          {/* Account status info & easy navigation link */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto pt-2">
            <div className="text-[9.5px] font-mono text-[var(--text-tertiary)] bg-[var(--surface)] px-3.5 py-2 rounded-lg border border-[var(--border)] w-full sm:w-auto">
              Current License: <span className="font-bold text-[var(--accent-color)]">Discord Tier-1</span>
            </div>
            
            <button
              onClick={() => {
                useContractStore.getState().setActiveTab('subscription');
                window.scrollTo({ top: 0, behavior: 'auto' });
              }}
              className="w-full sm:w-auto px-5 py-2 rounded-lg bg-white text-black hover:bg-zinc-100 font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Upgrade Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Retrieve plan specific metadata, default to discord values if safe-guarding
  const details = TIER_LOOKUP[planKey] || TIER_LOOKUP['discord'];

  const handleLiveCheckout = async () => {
    if (userHasAccount) {
      setIsProcessing(true);
      try {
        const res = await fetch('/api/billing/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: planKey,
            billingCycle: 'monthly'
          })
        });
        if (res.ok) {
          const { url } = await res.json();
          if (url) {
            // Redirect the browser to the hosted Stripe Checkout page.
            window.location.href = url;
            return;
          }
          // No URL returned — fall back to the in-app pricing flow.
          setCheckoutPlan(planKey);
          setActiveTab('home');
        } else {
          setCheckoutPlan(planKey);
          setActiveTab('home');
        }
      } catch (e) {
        setCheckoutPlan(planKey);
        setActiveTab('home');
      } finally {
        setIsProcessing(false);
      }
    } else {
      setCheckoutPlan(planKey);
      setActiveTab('home');
    }
  };

  // Build current vs target designation labels
  const getTierLabel = (tierNum: number) => {
    if (tierNum === 1) return "Tier 1: Discord";
    if (tierNum === 2) return "Tier 2: Pinpoint GEX";
    if (tierNum === 3) return "Tier 3: SkyVision";
    if (tierNum === 4) return "Tier 3: SkyVision";
    if (tierNum >= 5) return "Tier 5: Lifetime";
    return "Tier 0: Free Plan";
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-3xl mx-auto my-12 border border-[var(--border)] bg-gradient-to-b from-[#09090b] via-[#070709] to-[#040405] rounded-2xl relative overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] p-6 md:p-10"
    >
      {/* Decorative mechanical accents */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-zinc-850 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-zinc-900 to-transparent" />

      {/* Top action header info */}
      <div className="flex flex-col items-center text-center space-y-4 relative z-10 pb-4">
        {/* Dynamic Badge */}
        <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider font-mono ${details.badgeBg}`}>
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>{details.badge}</span>
        </div>

        {/* Locked Core Headline */}
        <div className="space-y-2">
          <h3 className="text-xl md:text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight font-sans flex items-center justify-center gap-2.5">
            <Lock className="w-5 h-5 text-[var(--accent-color)]" />
            <span>{tabKey.toUpperCase()} LEVEL ACCESS REQUIRED</span>
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-lg leading-relaxed font-sans mt-1">
            {details.desc} Upgrade your plan below to unlock this tab.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch relative z-10 py-6 my-2 border-y border-[var(--border)]">
        {/* Left Grid Section: Interactive features checklist of what they will unlock */}
        <div className="bg-black/40 border border-[var(--border)] rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-widest font-mono block mb-3">
              WHAT YOU GET
            </span>
            <div className="space-y-3">
              {details.features.map((feature, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
                  <span className="w-5 h-5 rounded-full bg-black/40 border border-[var(--border)] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[var(--text-secondary)]" />
                  </span>
                  <span className="font-mono text-[var(--text-secondary)] leading-snug">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-[var(--text-tertiary)] border-t border-[var(--border)] pt-3 flex items-center gap-1.5 uppercase font-mono">
            <ShieldCheck className="w-4 h-4 text-[var(--text-secondary)]" />
            <span>Includes all lower tiers</span>
          </div>
        </div>

        {/* Right Grid Section: Authorization parameters comparing levels */}
        <div className="mirror-panel rounded-2xl p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-widest font-mono block">
              PLAN LEVEL
            </span>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl">
                <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">CURRENT LEVEL:</span>
                <span className="text-xs font-mono font-bold text-[var(--text-tertiary)]">{getTierLabel(purchasedTier)}</span>
              </div>

              <div className="flex justify-between items-center bg-[var(--surface)] border border-[var(--accent-color)]/20 p-3 rounded-xl">
                <span className="text-[10px] font-mono text-[var(--accent-color)] uppercase">REQUIRED LEVEL:</span>
                <span className="text-xs font-mono font-bold text-[var(--accent-color)]">{getTierLabel(requiredTier)}</span>
              </div>
            </div>
          </div>

          <div className="text-center pt-2">
            <div className="text-[11px] font-mono text-[var(--text-tertiary)]">MONTHLY PRICE:</div>
            <div className="text-2xl font-black text-[var(--text-primary)] font-sans mt-0.5">
              {planPrice} <span className="text-xs text-[var(--text-tertiary)] font-normal">/mo</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA upgrade trigger matching active pricing tier */}
      <div className="flex flex-col items-center justify-center space-y-3 pt-4 relative z-10 max-w-sm mx-auto">
        <button
          onClick={handleLiveCheckout}
          disabled={isProcessing}
          className="w-full py-3.5 px-6 rounded-lg bg-white text-black hover:bg-zinc-100 font-black text-[11px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transform hover:scale-[1.01] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        >
          <span>{isProcessing ? 'REDIRECTING TO CHECKOUT...' : (userHasAccount ? 'UPGRADE NOW' : 'SEE PLANS AND PRICING')}</span>
          {!isProcessing && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </motion.div>
  );
}
