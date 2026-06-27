import { useState, useEffect, useRef } from 'react';
import type { GexProfileData } from '../types';
import type { GexSnap } from '../components/StrikeGexChart';

/**
 * Accumulates per-strike net-GEX snapshots over the session so the Strike Chart can
 * plot each strike's gamma as a line. Throttled (one sample / minMs) and capped to a
 * ring of the last `cap` samples; resets when the ticker changes. History builds in
 * the background whether or not the chart is on screen, so switching to it is instant.
 */
export function useGexHistory(profile: GexProfileData | undefined, ticker: string, opts: { cap?: number; minMs?: number } = {}): GexSnap[] {
  const { cap = 240, minMs = 1500 } = opts;
  const [hist, setHist] = useState<GexSnap[]>([]);
  const lastRef = useRef(0);
  const tickerRef = useRef(ticker);

  useEffect(() => {
    if (tickerRef.current !== ticker) { tickerRef.current = ticker; lastRef.current = 0; setHist([]); }
    const strikes = profile?.strikes;
    if (!strikes || !strikes.length) return;
    const now = Date.now();
    if (now - lastRef.current < minMs) return;
    lastRef.current = now;
    const m: Record<number, number> = {};
    for (const s of strikes) m[s.strike] = s.netGex || 0;
    setHist(h => { const base = h.length >= cap ? h.slice(h.length - cap + 1) : h; return [...base, { t: now, m }]; });
  }, [profile, ticker, cap, minMs]);

  return hist;
}
