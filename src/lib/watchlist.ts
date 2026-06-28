/**
 * Watchlist — a persistent set of starred tickers the trader curates. Stored in localStorage so it
 * survives reloads; the terminal surfaces it at the top of the symbol picker for quick switching and
 * lets the user star/unstar the active symbol. Pure helpers (no React) so it's unit-testable.
 */
const KEY = 'slayer.watchlist.v1';

export function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return a.filter((x): x is string => typeof x === 'string');
    }
  } catch { /* storage unavailable / malformed */ }
  return [];
}

export function saveWatchlist(tickers: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(tickers)); } catch { /* storage unavailable */ }
}

/** Add the ticker if absent, remove it if present. Returns a new array (does not mutate). */
export function toggleWatch(list: string[], ticker: string): string[] {
  return list.includes(ticker) ? list.filter(t => t !== ticker) : [...list, ticker];
}
