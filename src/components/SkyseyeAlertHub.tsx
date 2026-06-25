import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import { formatTime } from '../lib/timeUtils';
import { 
  CheckCircle, 
  Info, 
  AlertTriangle, 
  Sparkles, 
  ShieldCheck, 
  ChevronRight, 
  X,
  Activity,
  Bot
} from 'lucide-react';

interface ToastItem {
  id: string;
  ticker: string;
  strike: number;
  type: 'C' | 'P' | 'MULTIPLE';
  health: number;
  action: string;
  move: number;
  price: number;
  rating: 'GOOD' | 'MODERATE' | 'WEAK';
  timestamp: string;
  count?: number;
  tradesSummary?: string;
}

const playCockpitPing = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Play two clean frequencies offset slightly for a physical metallic "ping" chime!
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1450, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.04);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2230, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.03);
    
    // Envelope: instant hit, fast decay
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('Audio feedback failed:', err);
  }
};

export function SkyseyeAlertHub() {
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const selectedOptionType = useContractStore(s => s.selectedOptionType);
  const selectedStrike = useContractStore(s => s.selectedStrike);
  const isContractLocked = useContractStore(s => s.isContractLocked);
  const serverState = useContractStore(s => s.serverState);

  // Store actions for automatic tab transfer and panel expansion
  const setActiveTab = useContractStore(s => s.setActiveTab);
  const selectContractAtomically = useContractStore(s => s.selectContractAtomically);
  const setIsDeepSkyseyeExpanded = useContractStore(s => s.setIsDeepSkyseyeExpanded);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Track auto-dismiss timers so they're cleared on unmount (no setState-after-unmount).
  const dismissTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { dismissTimers.current.forEach(clearTimeout); dismissTimers.current = []; }, []);
  
  // Refs for real-time background stream discovery and strict de-duplication
  const knownFlowIdsRef = useRef<Set<string>>(new Set());
  const notifiedContractsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (!serverState?.deep_intelligence?.flow_feed) return;

    const feeds = serverState.deep_intelligence.flow_feed;

    // For first load when data arrives, populate known ids without triggering alerts
    if (isFirstLoadRef.current) {
      feeds.forEach((item: any) => {
        knownFlowIdsRef.current.add(item.id);
        
        // Also pre-register existing items' keys to avoid repeating initial backlog
        const parts = item.contract.split(' ');
        let ticker = item.asset || parts[1] || 'SPX';
        let strike = 7600;
        let optionType: 'C' | 'P' = 'C';
        if (parts[2]) {
          const match = parts[2].match(/^(\d+)([CP])$/);
          if (match) {
            strike = parseInt(match[1]);
            optionType = match[2] as 'C' | 'P';
          }
        }
        const contractKey = `${ticker}-${strike}-${optionType}`;
        notifiedContractsRef.current.add(contractKey);
      });
      isFirstLoadRef.current = false;
      return;
    }

    // Identify new flows
    const newFlows = feeds.filter((item: any) => !knownFlowIdsRef.current.has(item.id));

    if (newFlows.length > 0) {
      const candidates: ToastItem[] = [];

      newFlows.forEach((flow: any) => {
        // Register ID so we don't trigger it again
        knownFlowIdsRef.current.add(flow.id);

        // Parse contract (e.g. "4500 SPX 7615P")
        const parts = flow.contract.split(' ');
        const sizeVal = parseInt(parts[0]) || 0;
        let ticker = flow.asset || parts[1] || 'SPX';
        let strike = 7600;
        let optionType: 'C' | 'P' = 'C';

        if (parts[2]) {
          const match = parts[2].match(/^(\d+)([CP])$/);
          if (match) {
            strike = parseInt(match[1]);
            optionType = match[2] as 'C' | 'P';
          }
        }

        // De-duplication key. If this contract was already alerted of recently, skip it!
        const contractKey = `${ticker}-${strike}-${optionType}`;
        if (notifiedContractsRef.current.has(contractKey)) {
          return;
        }

        // Parse Premium (e.g. "$1.5M Premium")
        const premMatch = flow.desc ? flow.desc.match(/\$(\d+(\.\d+)?)M/) : null;
        const premiumM = premMatch ? parseFloat(premMatch[1]) : 0.5;

        // Perform Greeks & health estimation
        const assetObj = ASSET_LIST.find(a => a.ticker === ticker) || selectedAsset;
        const spotPrice = serverState?.pinpoint_map?.spot_price || assetObj.defaultPrice;
        const step = spotPrice > 1000 ? 50 : spotPrice > 150 ? 5 : 1;
        const strikeValue = strike;

        let health = 50;
        let action = 'HOLD';
        let move = 15;
        let price = 1.50;

        if (optionType === 'C') {
          let callHealth = 88;
          if (strikeValue <= spotPrice) {
            callHealth = Math.round(96 - (spotPrice - strikeValue) * 0.04);
          } else {
            callHealth = Math.round(91 - (strikeValue - spotPrice) * 1.6 / step);
          }
          health = Math.max(30, Math.min(98, callHealth));
          action = health >= 94 ? 'ENTER' : health >= 75 ? 'HOLD' : health <= 45 ? 'SELL' : 'REDUCE';
          move = Math.round(35 + (spotPrice - strikeValue) * 0.4);

          const callDistance = Math.abs(spotPrice - strikeValue);
          const callNormalizedDistance = callDistance / spotPrice;
          const callPremiumBase = strikeValue <= spotPrice 
            ? (spotPrice * 0.003) * Math.exp((spotPrice - strikeValue) / spotPrice * 3)
            : (spotPrice * 0.003) / Math.exp(callNormalizedDistance * 60);
          price = Math.max(0.20, Number((callPremiumBase * (1 + selectedAsset.volatility * 0.15)).toFixed(2)));
        } else {
          let putHealth = 65;
          if (strikeValue >= spotPrice) {
            putHealth = Math.round(34 - (strikeValue - spotPrice) * 1.1 / step);
          } else {
            putHealth = Math.round(79 + (spotPrice - strikeValue) * 0.4 / step);
          }
          health = Math.max(25, Math.min(94, putHealth));
          action = health >= 88 ? 'ENTER' : health >= 65 ? 'HOLD' : health <= 40 ? 'SELL' : 'REDUCE';
          move = Math.round(22 + (spotPrice - strikeValue) * 0.35);

          const putDistance = Math.abs(spotPrice - strikeValue);
          const putNormalizedDistance = putDistance / spotPrice;
          const putPremiumBase = strikeValue >= spotPrice
            ? (spotPrice * 0.0035) * Math.exp((strikeValue - spotPrice) / spotPrice * 3)
            : (spotPrice * 0.0035) / Math.exp(putNormalizedDistance * 65);
          price = Math.max(0.20, Number((putPremiumBase * (1 + selectedAsset.volatility * 0.15)).toFixed(2)));
        }

        // Institutional Gate to filter "Best of the Best" of flow activity:
        // 1. Premium value must exceed $1.2M
        // 2. Or, Size must exceed 1800 contracts
        // 3. Or, Quant health score matches maximum conviction threshold (>= 86)
        const isBestOfTheBest = (premiumM >= 1.2) || (sizeVal >= 1800) || (health >= 86);
        if (!isBestOfTheBest) {
          return;
        }

        // Mark contract as notified so we never trigger it again
        notifiedContractsRef.current.add(contractKey);

        // Determine rating based on institutional signature status
        let rating: 'GOOD' | 'MODERATE' | 'WEAK' = 'MODERATE';
        if (action === 'ENTER' || health >= 84 || flow.type === 'SWEEP') {
          rating = 'GOOD';
        } else if (action === 'SELL' || health <= 40) {
          rating = 'WEAK';
        }

        const now = new Date();
        const timestamp = formatTime(now);

        candidates.push({
          // Stable, content-derived id: used as the AnimatePresence key. A
          // Math.random() id changed every render, remounting the toast and
          // resetting its enter/exit animation + 4.5s auto-dismiss timer.
          id: flow.id || `${ticker}-${strike}-${optionType}`,
          ticker,
          strike,
          type: optionType,
          health,
          action,
          move,
          price,
          rating,
          timestamp
        });
      });

      // Filter for 100% best trade only (rating === 'GOOD', or top health score)
      const optimalCandidates = candidates.filter(c => c.rating === 'GOOD');

      if (optimalCandidates.length === 1) {
        const best = optimalCandidates[0];
        // Enforce active single alert limit - one at a time
        setToasts([best]);
        playCockpitPing();

        // Auto dismiss after 4.5 seconds
        dismissTimers.current.push(setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== best.id));
        }, 4500));

      } else if (optimalCandidates.length > 1) {
        // Multiple trades found -> state multiple trades found
        const now = new Date();
        const timestamp = formatTime(now);
        
        const textSummary = `Optimal flows parsed: ${optimalCandidates.map(c => `${c.ticker} ${c.strike}${c.type}`).join(', ')}`;
        
        const multipleToast: ToastItem = {
          id: 'multiple-' + optimalCandidates.map(c => `${c.ticker}${c.strike}${c.type}`).join('_'),
          ticker: 'MULTIPLE',
          strike: 0,
          type: 'MULTIPLE',
          health: 100,
          action: 'ENTER',
          move: 0,
          price: 0,
          rating: 'GOOD',
          timestamp,
          count: optimalCandidates.length,
          tradesSummary: textSummary
        };

        setToasts([multipleToast]);
        playCockpitPing();

        // Auto dismiss after 4.5 seconds
        dismissTimers.current.push(setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== multipleToast.id));
        }, 4500));
      }
    }
    // selectedAsset is read inside (premium/health math); include it so the closure
    // never goes stale. The de-dup refs above prevent duplicate toasts on re-run.
  }, [serverState, selectedAsset]);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleAlertClick = (toast: ToastItem) => {
    if (toast.type === 'MULTIPLE') {
      // Direct access to cockpit options chain
      setActiveTab('skyvision');
      setIsDeepSkyseyeExpanded(true);
      return;
    }

    // Search corresponding contract asset object
    const assetObj = ASSET_LIST.find(a => a.ticker === toast.ticker);
    if (assetObj) {
      // 1. Select the exact contract criteria in state
      selectContractAtomically(assetObj, toast.strike, toast.type === 'C');
      
      // 2. Automatically maximize open/detailed expansion fields on Slayer // SkyVision
      setIsDeepSkyseyeExpanded(true);
      
      // 3. Switch dashboard to Sky's Eye
      setActiveTab('skyvision', true);
    }
  };

  return (
    <div 
      id="skyseye-alert-container" 
      className="fixed bottom-6 right-6 z-[120] flex flex-col gap-3 w-[350px] max-w-[calc(100vw-32px)] pointer-events-auto font-mono selection:bg-[var(--success)] text-black/30"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          // Color schemes based on rating
          let bgClass = 'bg-[#0A0A0A] border-[#1F1F1F] shadow-zinc-950/80';
          let borderLeftGlow = 'border-l-[var(--accent-color)]';
          let accentText = 'text-[var(--accent-color)]';
          let glowIntensity = 'shadow-[0_8px_32px_rgba(0,0,0,0.7)]';
          
          if (toast.rating === 'GOOD') {
            bgClass = 'bg-[#0A0A0A] border-[#1F1F1F]';
            borderLeftGlow = 'border-l-zinc-300';
            accentText = 'text-[var(--success)]';
            glowIntensity = 'shadow-[0_12px_44px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.8)]';
          } else if (toast.rating === 'WEAK') {
            bgClass = 'bg-[#0A0A0A] border-[var(--danger)]/50';
            borderLeftGlow = 'border-l-rose-500';
            accentText = 'text-[var(--danger)]';
            glowIntensity = 'shadow-[0_12px_44px_rgba(239,68,68,0.12),0_8px_24px_rgba(0,0,0,0.8)]';
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 40, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, x: 10, transition: { duration: 0.2 } }}
              layout
              role="button"
              tabIndex={0}
              aria-label={
                toast.type === 'MULTIPLE'
                  ? `Multiple flow setups found. Open SkyVision to review`
                  : `${toast.ticker} ${toast.strike}${toast.type} flow alert, estimated score ${toast.health} of 100. Open in analyzer`
              }
              onClick={() => handleAlertClick(toast)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAlertClick(toast);
                }
              }}
              className={`border transition-all duration-150 p-4 rounded-sm flex flex-col gap-3 border-l-4 ${borderLeftGlow} ${bgClass} ${glowIntensity} relative group select-none cursor-pointer hover:bg-[#111] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none`}
            >
              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent trigger navigation
                  removeToast(toast.id);
                }}
                aria-label="Dismiss alert"
                title="Dismiss alert"
                className="absolute top-2 right-2 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>

              {/* Toast Badge & Topline info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    toast.rating === 'GOOD'
                      ? 'bg-[var(--surface)] border border-[var(--border)] text-[var(--success)]'
                      : toast.rating === 'WEAK'
                        ? 'bg-rose-500/10 border border-rose-500/35 text-[var(--danger)]'
                        : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-tertiary)]'
                  }`}>
                    {toast.rating === 'GOOD' ? (
                      <Sparkles className="w-2.5 h-2.5" />
                    ) : toast.rating === 'WEAK' ? (
                      <AlertTriangle className="w-2.5 h-2.5" />
                    ) : (
                      <Info className="w-2.5 h-2.5" />
                    )}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] font-black text-[var(--text-primary)]/95 uppercase tracking-widest flex items-center gap-1.5">
                      {toast.rating === 'GOOD' ? 'TRADE ALERT' : 'FLOW UPDATE'}
                    </span>
                    <span
                      className="text-[10px] text-[var(--text-tertiary)] tracking-wider font-mono tabular-nums"
                      title="Premium, move and health are model estimates — not a live quoted value"
                    >
                      {toast.timestamp} • EST.
                    </span>
                  </div>
                </div>

                {/* Rating Badge */}
                <div className={`px-2 py-0.5 border text-[10px] font-black tracking-widest rounded-sm uppercase italic shrink-0 ${
                  toast.rating === 'GOOD'
                    ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--success)]'
                    : toast.rating === 'WEAK'
                      ? 'border-rose-500/30 bg-rose-500/10 text-[var(--danger)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-tertiary)]'
                }`}>
                  {toast.rating === 'GOOD' ? ' ENTER' : toast.rating === 'WEAK' ? ' AVOID' : ' HOLD'}
                </div>
              </div>

              {/* Main Content Info */}
              <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-sm p-2.5 space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  {toast.type === 'MULTIPLE' ? (
                    <span className="text-[var(--text-primary)] text-xs font-black tracking-widest font-mono">
                      MULTIPLE TRADES FOUND
                    </span>
                  ) : (
                    <span className="text-[var(--text-primary)] text-xs font-black tracking-widest font-mono tabular-nums">
                      {toast.ticker} {toast.strike}{toast.type}
                    </span>
                  )}
                  {toast.type === 'MULTIPLE' ? (
                    <span className={`text-[10px] font-black ${accentText}`}>
                      SCORE: 100%
                    </span>
                  ) : (
                    <span className={`text-[10px] font-black tabular-nums ${accentText}`}>
                      SCORE: {toast.health} / 100
                    </span>
                  )}
                </div>
                
                {/* Visual score bar */}
                <div className="w-full bg-[var(--surface-2)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      toast.rating === 'GOOD'
                        ? 'bg-[var(--surface)]'
                        : toast.rating === 'WEAK'
                          ? 'bg-rose-500'
                          : 'bg-[var(--accent-color)]'
                    }`}
                    style={{ width: `${toast.type === 'MULTIPLE' ? 100 : toast.health}%` }}
                  />
                </div>

                {/* Quantitative statistics / Summary list */}
                {toast.type === 'MULTIPLE' ? (
                  <div className="text-[10px] font-mono text-[var(--success)] border-t border-[var(--border)] pt-2 mt-1 leading-normal max-h-[60px] overflow-y-auto">
                    <span className="text-[var(--success)] font-bold block mb-1">Multiple setups found:</span>
                    <span className="text-[var(--text-tertiary)] block">{toast.tradesSummary}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono border-t border-[var(--border)] pt-2 mt-1">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-tertiary)]">Premium Estim:</span>
                      <span className="text-[var(--success)] font-bold tabular-nums">${toast.price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-tertiary)]">Expected Move:</span>
                      <span className={`${accentText} font-bold tabular-nums`}>+{toast.move}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action interpretation message (Micro AI commentary) */}
              <div className="text-[10px] text-[var(--text-tertiary)] text-left leading-relaxed font-sans px-0.5">
                {toast.type === 'MULTIPLE' ? (
                  <span className="text-[var(--success)] font-mono font-medium">
                     <strong>Multiple setups flagged.</strong> Click to open SkyVision and review all alerts.
                  </span>
                ) : toast.rating === 'GOOD' ? (
                  <span className="text-[var(--success)] font-mono font-medium">
                     <strong>Strong setup detected.</strong> Click to review. Dealers are holding heavy delta support.
                  </span>
                ) : toast.rating === 'WEAK' ? (
                  <span className="text-[var(--danger)]/90 font-mono font-medium">
                     <strong>Weak setup.</strong> Click to view. Dealer hedging is limiting upside.
                  </span>
                ) : (
                  <span className="text-[var(--success)]/90 font-mono font-medium text-left">
                     <strong>Consolidating.</strong> Click to review. Balanced call/put ratio.
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
