// Shared formatters for the Live Terminal panels.

/** Compact magnitude for dealer dollar-greeks (e.g. +1.42B, −310M, 8.5K). */
export const fmtBig = (v: number) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + 'K' : s + a.toFixed(0); };

/** Observation-tape tone → theme colour. */
export const toneColor = (t: string) => (t === 'pos' ? 'var(--success)' : t === 'neg' ? 'var(--danger)' : 'var(--text-tertiary)');
