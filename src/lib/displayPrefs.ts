/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Display-preference helpers. Single source of truth for applying theme, text
 * size, compact density and ultrawide layout to the document root, mirrored to
 * localStorage (for zero-flash boot) and persisted to the DB by the caller.
 */

export type FontScale = 'STANDARD' | 'ENHANCED' | 'ENHANCED_XL';

/** Maps the stored font-scale enum to the `data-text-size` attribute value. */
export const TEXT_SIZE_ATTR: Record<FontScale, string> = {
  STANDARD: 'standard',
  ENHANCED: 'large',
  ENHANCED_XL: 'xlarge',
};

export interface ThemeDef {
  id: string;
  name: string;
  group: string;
  /** --bg-surface (one half of the swatch) */
  surface: string;
  /** --accent-color (the other half of the swatch) */
  accent: string;
}

/** The Master Theme Library — 31 color-harmonized themes. */
export const THEMES: ThemeDef[] = [
  // Base
  { id: 'abyss', name: 'Abyss', group: 'Base', surface: '#000000', accent: '#4ADE80' },
  { id: 'slate', name: 'Slate', group: 'Base', surface: '#172033', accent: '#38BDF8' },
  { id: 'phantom', name: 'Phantom', group: 'Base', surface: '#18181B', accent: '#8B5CF6' },
  { id: 'grid', name: 'Grid', group: 'Base', surface: '#18181B', accent: '#F43F5E' },
  { id: 'mocha', name: 'Mocha', group: 'Base', surface: '#3E322D', accent: '#D4A373' },
  { id: 'purple', name: 'Purple', group: 'Base', surface: '#2D1B4E', accent: '#D633FF' },
  { id: 'pink', name: 'Pink', group: 'Base', surface: '#FFFFFF', accent: '#E05286' },
  // Extreme / High-Tech
  { id: 'synthwave', name: 'Synthwave', group: 'High-Tech', surface: '#1A1F2B', accent: '#FF007A' },
  { id: 'obsidian', name: 'Obsidian', group: 'High-Tech', surface: '#000000', accent: '#D4AF37' },
  { id: 'crimson', name: 'Crimson', group: 'High-Tech', surface: '#1A0808', accent: '#FF1A1A' },
  { id: 'biolume', name: 'Biolume', group: 'High-Tech', surface: '#032115', accent: '#059669' },
  { id: 'tokyo', name: 'Tokyo', group: 'High-Tech', surface: '#141526', accent: '#FF2A6D' },
  { id: 'acid', name: 'Acid', group: 'High-Tech', surface: '#1C1E1C', accent: '#D4FF00' },
  { id: 'outrun', name: 'Outrun', group: 'High-Tech', surface: '#22102E', accent: '#FF7700' },
  { id: 'matrix', name: 'Matrix', group: 'High-Tech', surface: '#001400', accent: '#4ADE80' },
  { id: 'vaporwave', name: 'Vaporwave', group: 'High-Tech', surface: '#252542', accent: '#FF8EAF' },
  // Earth, Elements & Metals
  { id: 'arrakis', name: 'Arrakis', group: 'Earth & Metals', surface: '#261C14', accent: '#E67E22' },
  { id: 'arctic', name: 'Arctic', group: 'Earth & Metals', surface: '#0A1A2A', accent: '#00D0FF' },
  { id: 'volcanic', name: 'Volcanic', group: 'Earth & Metals', surface: '#1F1B1B', accent: '#FF4500' },
  { id: 'canopy', name: 'Canopy', group: 'Earth & Metals', surface: '#142418', accent: '#22C55E' },
  { id: 'trench', name: 'Trench', group: 'Earth & Metals', surface: '#051224', accent: '#06B6D4' },
  { id: 'sapphire', name: 'Sapphire', group: 'Earth & Metals', surface: '#0A1629', accent: '#3B82F6' },
  { id: 'copper', name: 'Copper', group: 'Earth & Metals', surface: '#11211F', accent: '#D97757' },
  { id: 'velvet', name: 'Velvet', group: 'Earth & Metals', surface: '#241217', accent: '#E11D48' },
  { id: 'iron', name: 'Iron', group: 'Earth & Metals', surface: '#1F1C18', accent: '#D96941' },
  // High-Contrast / Focus
  { id: 'solar', name: 'Solar', group: 'High-Contrast', surface: '#140D00', accent: '#F59E0B' },
  { id: 'bloodmoon', name: 'Bloodmoon', group: 'High-Contrast', surface: '#1A1D24', accent: '#E03131' },
  { id: 'ghost', name: 'Ghost', group: 'High-Contrast', surface: '#0F0F0F', accent: '#D4D4D4' },
  { id: 'cobalt', name: 'Cobalt', group: 'High-Contrast', surface: '#131F2E', accent: '#4285F4' },
  { id: 'matcha', name: 'Matcha', group: 'High-Contrast', surface: '#132117', accent: '#A3E635' },
  { id: 'amethyst', name: 'Amethyst', group: 'High-Contrast', surface: '#150A24', accent: '#A855F7' },
];

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
