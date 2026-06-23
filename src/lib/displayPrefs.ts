/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Display-preference helpers. Single source of truth for applying theme, text
 * size, compact density and ultrawide layout to the document root, mirrored to
 * localStorage (for zero-flash boot) and persisted to the DB by the caller.
 */

import { THEMES, type ThemeDef } from './themes.generated';
export { THEMES };
export type { ThemeDef };

export type FontScale = 'STANDARD' | 'ENHANCED' | 'ENHANCED_XL';

/** Maps the stored font-scale enum to the `data-text-size` attribute value. */
export const TEXT_SIZE_ATTR: Record<FontScale, string> = {
  STANDARD: 'standard',
  ENHANCED: 'large',
  ENHANCED_XL: 'xlarge',
};


const THEME_IDS = new Set(THEMES.map((t) => t.id));

function root(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.documentElement : null;
}

/** Applies a theme id to <html data-theme>. Unknown ids fall back to the native design. */
export function applyTheme(themeId: string | undefined | null) {
  const el = root();
  if (!el) return;
  if (themeId && THEME_IDS.has(themeId)) {
    el.setAttribute('data-theme', themeId);
    try { localStorage.setItem('slayer_theme', themeId); } catch {}
  } else {
    el.removeAttribute('data-theme');
    try { localStorage.removeItem('slayer_theme'); } catch {}
  }
}

/** Applies the global typography scale to <html data-text-size>. */
export function applyTextSize(scale: FontScale) {
  const el = root();
  if (!el) return;
  el.setAttribute('data-text-size', TEXT_SIZE_ATTR[scale] || 'standard');
  try { localStorage.setItem('slayer_text_size', scale); } catch {}
}

/** Toggles compact density via <html data-compact>. */
export function applyCompact(on: boolean) {
  const el = root();
  if (!el) return;
  if (on) el.setAttribute('data-compact', 'true');
  else el.removeAttribute('data-compact');
  try { localStorage.setItem('slayer_compact', on ? 'true' : 'false'); } catch {}
}

/** Toggles ultrawide multi-column layout via <html data-ultrawide>. */
export function applyUltrawide(on: boolean) {
  const el = root();
  if (!el) return;
  if (on) el.setAttribute('data-ultrawide', 'true');
  else el.removeAttribute('data-ultrawide');
  try { localStorage.setItem('slayer_ultrawide', on ? 'true' : 'false'); } catch {}
}

/** Applies every display preference at once (used on session load). */
export function applyAllPreferences(prefs: {
  selected_theme?: string;
  selected_font_scale?: FontScale;
  compact_view_enabled?: boolean;
  ultrawide_enabled?: boolean;
}) {
  if (prefs.selected_theme !== undefined) applyTheme(prefs.selected_theme);
  if (prefs.selected_font_scale !== undefined) applyTextSize(prefs.selected_font_scale);
  if (prefs.compact_view_enabled !== undefined) applyCompact(!!prefs.compact_view_enabled);
  if (prefs.ultrawide_enabled !== undefined) applyUltrawide(!!prefs.ultrawide_enabled);
}
