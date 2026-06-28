// Shared formatters for the Live Terminal panels.

/** Compact magnitude for dealer dollar-greeks (e.g. +1.42B, −310M, 8K). Precision matches the chart's
 *  fmtGex exactly (B → 2dp, M/K → integer) so the same value never prints two ways across surfaces. */
export const fmtBig = (v: number) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B' : a >= 1e6 ? s + Math.round(a / 1e6) + 'M' : a >= 1e3 ? s + Math.round(a / 1e3) + 'K' : s + Math.round(a); };

/** Observation-tape tone → theme colour. */
export const toneColor = (t: string) => (t === 'pos' ? 'var(--success)' : t === 'neg' ? 'var(--danger)' : 'var(--text-tertiary)');
