/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QUANT CROSSHAIR SYNC
 * --------------------
 * A tiny opt-in channel that links the strike-domain charts in the Quant Lab so
 * hovering a strike in one panel draws a synced guide at the SAME strike in every
 * other panel — the IV smile, the dealer Greek exposure, the risk-neutral CDF and
 * the hedging landscape all read off one cursor, the way linked views work on an
 * institutional desk.
 *
 * Design: a single shared {strike, source}. A panel publishes the strike it is
 * hovering (tagged with its own id); every OTHER panel reads `syncedStrike` and
 * renders a faint guide. Clearing is source-guarded — a panel only clears the
 * channel if it was the one driving it — so an idle panel never wipes the active
 * hover. Outside a provider the hook degrades to a no-op, so each panel still
 * works standalone.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface StrikeSyncValue {
  strike: number | null;
  source: string | null;
  publish: (strike: number | null, source: string) => void;
}

const StrikeSyncContext = createContext<StrikeSyncValue | null>(null);

export function StrikeSyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ strike: number | null; source: string | null }>({ strike: null, source: null });
  const publish = useCallback((strike: number | null, source: string) => {
    setState((prev) => {
      // Source-guarded clear: only the driving panel may null the channel.
      if (strike == null) return prev.source === source ? { strike: null, source: null } : prev;
      return { strike, source };
    });
  }, []);
  return <StrikeSyncContext.Provider value={{ strike: state.strike, source: state.source, publish }}>{children}</StrikeSyncContext.Provider>;
}

/**
 * @param id stable identifier for the calling panel.
 * @returns syncedStrike — a strike another panel is hovering (null if none or self);
 *          publishStrike — broadcast this panel's hovered strike (null to release).
 */
export function useStrikeSync(id: string) {
  const ctx = useContext(StrikeSyncContext);
  const syncedStrike = ctx && ctx.strike != null && ctx.source !== id ? ctx.strike : null;
  const publishStrike = useCallback((s: number | null) => ctx?.publish(s, id), [ctx, id]);
  return { syncedStrike, publishStrike };
}

/**
 * Drop-in child that broadcasts a panel's locally-computed hovered strike to the
 * channel — placed in the panel's success render so it consumes the value already
 * derived there (no geometry duplication). Renders nothing; releases on unmount.
 */
export function StrikePublisher({ id, strike }: { id: string; strike: number | null }) {
  const { publishStrike } = useStrikeSync(id);
  useEffect(() => { publishStrike(strike); }, [strike, publishStrike]);
  useEffect(() => () => { publishStrike(null); }, [publishStrike]);
  return null;
}
