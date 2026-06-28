// Chart-type + drawing-tool type/constant definitions (pure).

export type ChartType = 'candles' | 'hollow' | 'heikin' | 'bars' | 'line' | 'area' | 'baseline' | 'step' | 'columns';
export const CHART_TYPES: { k: ChartType; l: string }[] = [
  { k: 'candles', l: 'Candles' }, { k: 'hollow', l: 'Hollow' }, { k: 'heikin', l: 'Heikin Ashi' }, { k: 'bars', l: 'Bars' }, { k: 'line', l: 'Line' }, { k: 'step', l: 'Step' }, { k: 'area', l: 'Area' }, { k: 'baseline', l: 'Baseline' }, { k: 'columns', l: 'Columns' },
];

// ── Drawing tools ──────────────────────────────────────────────────────────────
export type DrawTool = 'cursor' | 'trend' | 'ray' | 'hline' | 'rect' | 'measure';
export type Anchor = { t: number; price: number }; // timestamp + price, so a mark stays glued on pan/zoom
export type Drawing =
  | { id: string; kind: 'hline'; price: number; color: string }
  | { id: string; kind: 'trend' | 'ray' | 'rect'; a: Anchor; b: Anchor; color: string };
export const DRAW_COLOR = '#38bdf8';
export const DRAW_TOOLS: { k: Exclude<DrawTool, 'cursor'>; g: string; l: string }[] = [
  { k: 'trend', g: '╱', l: 'Trend line' }, { k: 'ray', g: '➚', l: 'Ray' }, { k: 'hline', g: '─', l: 'Horizontal line' }, { k: 'rect', g: '▭', l: 'Rectangle / zone' }, { k: 'measure', g: '⊡', l: 'Measure' },
];
