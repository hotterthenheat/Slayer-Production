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
    badge: "Tier 1 // Discord Plan",
    desc: "Gain entry to high-speed trade alerts and active trader community discussion channels.",
    features: [
      "Real-time Discord Chat & Alerts Feed",
      "Daily Options Discovery Reports",
      "Verified Historical Trade Archives"
    ],
    accentColor: "indigo",
    badgeBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
  },
  skyvision: {
    badge: "Tier 2 // SkyVision Cockpit",
    desc: "Gain access to real-time Volatility Solvers and advanced expected P&L calculation dashboards.",
    features: [
      "SVI Volatility Surface Solver Engine",
      "Live Strategy Health Tracking Indexes",
      "Expected P&L Simulation Models",
      "Full Discord Alert Suite Included"
    ],
    accentColor: "blue",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/20"
  },
  pinpoint: {
    badge: "Tier 3 // Pinpoint Gexbot",
    desc: "Track market maker position changes and key GEX trends.",
    features: [
      "Pinpoint Gexbot Exposure Tracker Feed",
      "Live Gamma (GEX), Delta (DEX) & Vega (VEX) Strips",
      "Interactive Dealer Spot Placement Grid",
      "Includes Tiers 1 and 2 Access"
    ],
    accentColor: "zinc",
    badgeBg: "bg-[#4ADE80] text-black/10 text-[#4ADE80] border-black"
  },
  quant: {
    badge: "Tier 4 // Quant Suite",
    desc: "Empower your portfolio with high-speed order flow tapes, backtesting, and market microstructure tracking.",
    features: [
      "Full Algorithmic Backtesting Sandbox",
      "Displacement Valuations & Speed Gauges",
      "High-Speed Microstructure Liquidity Monitor",
      "All Premium Platform Tiers Unlocked"
    ],
    accentColor: "violet",
    badgeBg: "bg-violet-500/10 text-violet-400 border-violet-500/20"
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

  // Specialized Discord Active subscriber portal gate
  if (purchasedTier === 1) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-3xl mx-auto my-12 border border-[#5865F2]/40 bg-black rounded-3xl relative overflow-hidden shadow-[0_25px_60px_-15px_rgba(88,101,242,0.15)] p-6 md:p-10"
      >
        {/* Decorative mechanical and glow accents */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#5865F2]/10 rounded-full blur-[125px] pointer-events-none -mr-40 -mt-40" />
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#5865F2]/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-[#5865F2]/10 to-transparent" />

        <div className="flex flex-col items-center text-center space-y-4 relative z-10 pb-6 border-b border-black/60">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#5865F2]/30 bg-[#5865F2]/10 text-[#5865F2] text-[9.5px] font-black uppercase tracking-wider font-mono">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#5865F2]"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#5865F2]"></span>
            </span>
            <span>Discord Plan Active</span>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans flex items-center justify-center gap-2.5">
              <span>EXCLUSIVE TRADER COMMUNITY PORTAL</span>
            </h3>
            <p className="text-xs text-zinc-400 max-w-lg leading-relaxed font-sans mt-1">
              Your payments are fully verified! The <strong>Discord Tier</strong> grants exclusive real-time options sweep alerts, live trade setups, and active community discussion channels inside our terminal server.
            </p>
          </div>
        </div>

        {/* Big Nice UI Style Discord Invitation Button Link */}
        <div className="relative z-10 py-8 px-6 my-6 bg-gradient-to-br from-[#0c0c14] via-[#080910] to-[#040407] border border-[#5865F2]/20 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-[inset_0_1px_3px_rgba(255,255,255,0.02)]">
          <div className="space-y-1.5 text-center md:text-left flex-1">
            <span className="text-[9px] text-[#5865F2] font-mono font-black uppercase tracking-widest block">
              SECURE VIP GATEWAY
            </span>
            <h4 className="text-sm font-black text-[#E5E5E5] uppercase tracking-tight">
              SKYSEYE INSTITUTIONAL DISCORD INVITE
            </h4>
            <p className="text-[11px] text-zinc-400 leading-normal max-w-md">
              Click below to instantly sync with our high-speed institutional feeds. Ensure your Discord username is linked to receive full access to options sweeps alerts channels.
            </p>
          </div>

          <a 
            href="https://discord.gg/euvkqFtgFa"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-4 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-[#E5E5E5] font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(88,101,242,0.4)] flex items-center gap-2.5 transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer shrink-0"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>JOIN DISCORD CHANNEL</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
          </a>
        </div>

        {/* Upgrade block letting them know their account is safe and they can upgrade */}
        <div className="relative z-10 border-t border-black/80 pt-6 text-center space-y-4">
          <div className="max-w-md mx-auto space-y-1">
            <span className="text-[9.5px] font-mono font-black text-zinc-500 uppercase tracking-widest block">
              WANT FULL TERMINAL GRAPHS & GEX FLOWS?
            </span>
            <p className="text-[10px] text-zinc-500 leading-normal font-sans">
              You are currently viewing the platform with active Discord-only rights. Interactive expected move levels, Gexbot strike visualizations, and microsecond flow feeds require a <strong>Tier 2 (SkyVision Cockpit)</strong> workspace license or higher.
            </p>
          </div>

          {/* Account status info & easy navigation link */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto pt-2">
            <div className="text-[9.5px] font-mono text-zinc-400 bg-black px-3.5 py-2 rounded-lg border border-black/60 w-full sm:w-auto">
              Current License: <span className="font-bold text-indigo-400">Discord Tier-1</span>
            </div>
            
            <button
              onClick={() => {
                useContractStore.getState().setActiveTab('subscription');
                window.scrollTo({ top: 0, behavior: 'auto' });
              }}
              className="w-full sm:w-auto px-5 py-2 rounded-lg bg-black hover:bg-white hover:text-black text-[#4ADE80] border border-black font-bold text-[10px] uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
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
    if (tierNum === 1) return "Tier 1: Discord Plan";
    if (tierNum === 2) return "Tier 2: SkyVision Cockpit";
    if (tierNum === 3) return "Tier 3: Pinpoint Gexbot";
    if (tierNum === 4) return "Tier 4: Quant Suite";
    if (tierNum >= 5) return "Tier 5: Lifetime Pass";
    return "Tier 0: Sandbox Edition";
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-3xl mx-auto my-12 border border-black/80 bg-gradient-to-b from-[#09090b] via-[#070709] to-[#040405] rounded-3xl relative overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] p-6 md:p-10"
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
          <h3 className="text-xl md:text-2xl font-black text-[#E5E5E5] uppercase tracking-tight font-sans flex items-center justify-center gap-2.5">
            <Lock className="w-5 h-5 text-indigo-400" />
            <span>{tabKey.toUpperCase()} LEVEL ACCESS REQUIRED</span>
          </h3>
          <p className="text-xs text-zinc-400 max-w-lg leading-relaxed font-sans mt-1">
            {details.desc} Purchase or upgrade your plan below to unlock this workspace tab.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch relative z-10 py-6 my-2 border-y border-black/85">
        {/* Left Grid Section: Interactive features checklist of what they will unlock */}
        <div className="bg-[#050556]/5 border border-black rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest font-mono block mb-3">
              GUARANTEED TIER ACCESS INCLUSIONS
            </span>
            <div className="space-y-3">
              {details.features.map((feature, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-[#4ADE80]">
                  <span className="w-5 h-5 rounded-full bg-black/40 border border-black flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#4ADE80]" />
                  </span>
                  <span className="font-mono text-[#4ADE80] leading-snug">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-zinc-500 border-t border-black pt-3 flex items-center gap-1.5 uppercase font-mono">
            <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
            <span>Cumulative access tier applies</span>
          </div>
        </div>

        {/* Right Grid Section: Authorization parameters comparing levels */}
        <div className="mirror-panel rounded-2xl p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest font-mono block">
              SUBSCRIBER LEVEL DETAIL
            </span>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-black border border-black p-3 rounded-xl">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">CURRENT LEVEL:</span>
                <span className="text-xs font-mono font-bold text-zinc-400">{getTierLabel(purchasedTier)}</span>
              </div>

              <div className="flex justify-between items-center bg-black border border-indigo-950/40 p-3 rounded-xl">
                <span className="text-[10px] font-mono text-indigo-400 uppercase">REQUIRED LEVEL:</span>
                <span className="text-xs font-mono font-bold text-indigo-300">{getTierLabel(requiredTier)}</span>
              </div>
            </div>
          </div>

          <div className="text-center pt-2">
            <div className="text-[11px] font-mono text-zinc-500">SUBSCRIPTION PRICE:</div>
            <div className="text-2xl font-black text-[#E5E5E5] font-sans mt-0.5">
              {planPrice} <span className="text-xs text-zinc-500 font-normal">/mo</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA upgrade trigger matching active pricing tier */}
      <div className="flex flex-col items-center justify-center space-y-3 pt-4 relative z-10 max-w-sm mx-auto">
        <button
          onClick={handleLiveCheckout}
          disabled={isProcessing}
          className="w-full py-3.5 px-6 rounded-xl bg-indigo-505 hover:bg-white hover:text-black border border-black bg-black text-zinc-200 font-black text-[11px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transform hover:scale-[1.01] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        >
          <span>{isProcessing ? 'AUTHORIZING UPGRADE...' : (userHasAccount ? '1-CLICK UPGRADE NOW' : 'GO PREMIUM - ACTIVATE NOW')}</span>
          {!isProcessing && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </motion.div>
  );
}
