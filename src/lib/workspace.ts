/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workspace grid configuration: widget registry + hardcoded default layout
 * templates (spec Group 4/5). Layout units are on a 12-column grid; `h`/`y`
 * are in row units (see ROW_HEIGHT in WorkspaceView).
 */

export type WidgetType =
  // SkysVision
  | 'skysvision_scanner'
  | 'skysvision_setups'
  | 'skysvision_setup_details'
  | 'skysvision_trade_thesis'
  | 'skysvision_entry_levels'
  | 'skysvision_stop_levels'
  | 'skysvision_target_levels'
  | 'skysvision_confidence'
  | 'skysvision_history'
  // Pinpoint AI
  | 'dealer_positioning'
  | 'gex'
  | 'vex'
  | 'charm'
  | 'loaded_strikes'
  | 'dealer_flow_analysis'
  | 'market_regime'
  | 'key_levels'
  | 'institutional_positioning'
  // Admin Core (required for auth/admin flow to not break)
  | 'settings'
  | 'server_health'
  | 'user_crm'
  | 'financials';

export interface PaneLayout {
  i: string;        // unique pane id
  widget: WidgetType;
  x: number;        // grid column (0-11)
  y: number;        // grid row
  w: number;        // width in columns
  h: number;        // height in rows
}

export interface WidgetMeta {
  type: WidgetType;
  title: string;       // shown in the pane header, mono + caps
  adminOnly?: boolean;
  minW: number;
  minH: number;
}

export const GRID_COLS = 12;

export const WIDGETS: WidgetMeta[] = [
  // SkysVision Modules
  { type: 'skysvision_scanner', title: 'SKYSVISION SCANNER RESULTS', minW: 4, minH: 4 },
  { type: 'skysvision_setups', title: 'ACTIVE SETUPS', minW: 3, minH: 3 },
  { type: 'skysvision_setup_details', title: 'SETUP DETAILS', minW: 3, minH: 3 },
  { type: 'skysvision_trade_thesis', title: 'TRADE THESIS', minW: 3, minH: 3 },
  { type: 'skysvision_entry_levels', title: 'ENTRY LEVELS (SKYSVISION)', minW: 2, minH: 2 },
  { type: 'skysvision_stop_levels', title: 'STOP LEVELS (SKYSVISION)', minW: 2, minH: 2 },
  { type: 'skysvision_target_levels', title: 'TARGET LEVELS (SKYSVISION)', minW: 2, minH: 2 },
  { type: 'skysvision_confidence', title: 'SETUP CONFIDENCE SCORE', minW: 2, minH: 2 },
  { type: 'skysvision_history', title: 'SETUP HISTORY', minW: 3, minH: 3 },
  
  // PinPoint AI Modules
  { type: 'dealer_positioning', title: 'DEALER POSITIONING', minW: 3, minH: 3 },
  { type: 'gex', title: 'GAMMA EXPOSURE (GEX)', minW: 3, minH: 3 },
  { type: 'vex', title: 'VANNA EXPOSURE (VEX)', minW: 3, minH: 3 },
  { type: 'charm', title: 'CHARM EXPOSURE', minW: 3, minH: 3 },
  { type: 'loaded_strikes', title: 'LOADED STRIKES', minW: 3, minH: 3 },
  { type: 'dealer_flow_analysis', title: 'DEALER FLOW ANALYSIS', minW: 4, minH: 3 },
  { type: 'market_regime', title: 'MARKET STATE', minW: 4, minH: 3 },
  { type: 'key_levels', title: 'KEY LEVELS (PINPOINT)', minW: 3, minH: 3 },
  { type: 'institutional_positioning', title: 'INSTITUTIONAL POSITIONING', minW: 4, minH: 4 },

  // Admin Tools
  { type: 'settings', title: 'SYSTEM_SETTINGS', minW: 2, minH: 2 },
  { type: 'server_health', title: 'SERVER_HEALTH', adminOnly: true, minW: 4, minH: 3 },
  { type: 'user_crm', title: 'LIVE_USER_CRM', adminOnly: true, minW: 4, minH: 4 },
  { type: 'financials', title: 'FINANCIALS_LOG', adminOnly: true, minW: 3, minH: 3 },
];

export function widgetMeta(type: WidgetType): WidgetMeta {
  return WIDGETS.find((w) => w.type === type) || WIDGETS[0];
}

let _id = 0;
export function paneId(widget: WidgetType): string {
  _id += 1;
  return `${widget}-${Date.now().toString(36)}-${_id}`;
}

/** Default Terminal Layout */
const DEFAULT_LAYOUT: PaneLayout[] = [
  // Center: SkysVision Scanner (Col 0-7, Row 0-5)
  { i: 'def-skys-scan', widget: 'skysvision_scanner', x: 0, y: 0, w: 8, h: 6 },
  // Right Side: PinPoint AI (Col 8-11, Row 0-5)
  { i: 'def-pinpoint', widget: 'institutional_positioning', x: 8, y: 0, w: 4, h: 6 },
  // Bottom: Loaded Strikes, Dealer Positioning, Market Regime (Row 6)
  { i: 'def-loaded', widget: 'loaded_strikes', x: 0, y: 6, w: 4, h: 4 },
  { i: 'def-dealerpos', widget: 'dealer_positioning', x: 4, y: 6, w: 4, h: 4 },
  { i: 'def-regime', widget: 'market_regime', x: 8, y: 6, w: 4, h: 4 },
];

/** Template C — System Admin (God Mode): server health row, then CRM + financials. */
const TEMPLATE_C: PaneLayout[] = [
  { i: 'c-health', widget: 'server_health', x: 0, y: 0, w: 12, h: 4 },
  { i: 'c-crm', widget: 'user_crm', x: 0, y: 4, w: 7, h: 6 },
  { i: 'c-fin', widget: 'financials', x: 7, y: 4, w: 5, h: 6 },
];

export const TEMPLATES: Record<'A' | 'B' | 'C' | 'D' | 'E', { name: string; adminOnly?: boolean; layout: PaneLayout[] }> = {
  A: { name: 'Standard Terminal', layout: DEFAULT_LAYOUT },
  B: { name: 'Empty Workspace', layout: [] },
  C: { name: 'Empty Workspace', layout: [] },
  D: { name: 'Empty Workspace', layout: [] },
  E: { name: 'System Admin (God Mode)', adminOnly: true, layout: TEMPLATE_C },
};

/** Deep clone a template layout so callers never mutate the source. */
export function cloneTemplate(key: 'A' | 'B' | 'C' | 'D' | 'E'): PaneLayout[] {
  return TEMPLATES[key].layout.map((p) => ({ ...p }));
}
