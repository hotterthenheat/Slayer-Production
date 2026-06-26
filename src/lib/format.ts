/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Global display-formatting utilities. Centralizes decimal truncation so
 * floating-point artifacts (e.g. 42.5000001%) never reach the UI, and provides
 * cache-busting for avatar/image URLs whose content can change behind a stable URL.
 */

/** Percentages are strictly bounded to one decimal place. */
export function formatPct(value: number | string | null | undefined, withSign = false): string {
  const v = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (!isFinite(v as number)) return '0.0%';
  const sign = withSign && (v as number) > 0 ? '+' : '';
  return `${sign}${(v as number).toFixed(1)}%`;
}

/** Prices are strictly bounded to two decimal places. */
export function formatPrice(value: number | string | null | undefined): string {
  const v = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (!isFinite(v as number)) return '0.00';
  return (v as number).toFixed(2);
}

/** Generic fixed-decimal helper. */
export function toFixedSafe(value: number | string | null | undefined, digits = 2): string {
  const v = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (!isFinite(v as number)) return (0).toFixed(digits);
  return (v as number).toFixed(digits);
}

/**
 * Thousands-separated number for prices / strikes / OI / volume / $ amounts.
 * Use this anywhere a bare integer ≥ 1,000 would otherwise render (e.g. 6850 → 6,850).
 * NOT for percentages, ratios, years, ids, or small counts.
 */
export function fmtNum(value: number | string | null | undefined, decimals = 0): string {
  const v = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (!isFinite(v as number)) return (0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v as number).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Appends a cache-busting query param so a freshly uploaded avatar isn't served
 * from the browser/S3 cache behind an unchanged URL. Pass a stable `version`
 * (e.g. memoized on the avatar value) to avoid re-fetching on every render.
 */
export function withCacheBust(url?: string | null, version?: string | number): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url; // local previews don't need busting
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${version ?? Date.now()}`;
}
