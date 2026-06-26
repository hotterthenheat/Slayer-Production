/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the multi-chart panel model. The drag/resize/persist interaction itself is
 * verified headlessly (puppeteer); here we cover the pure helpers + storage-absent safety.
 */
import assert from 'assert';
import { newPanelId, makePanel, loadPanels, savePanels, GRID_COLS, MIN_W, MIN_H, MAX_PANELS } from '../src/lib/chartPanels';

console.log('--- RUNNING CHART-PANELS TEST SUITE ---');

// IDs are unique across rapid generation.
const ids = new Set<string>();
for (let i = 0; i < 1000; i++) ids.add(newPanelId());
assert(ids.size === 1000, 'newPanelId produces unique ids');

// makePanel: sensible defaults, carries ticker/timeframe, stacks at the requested y.
const a = makePanel('SPX', '5m', 0);
assert(a.ticker === 'SPX' && a.timeframe === '5m', 'panel carries ticker + timeframe');
assert(a.x === 0 && a.y === 0, 'panel placed at requested origin');
assert(a.w >= MIN_W && a.h >= MIN_H, 'panel respects minimum dimensions');
assert(a.w <= GRID_COLS, 'panel width fits the grid');
const b = makePanel('NDX', '1D', 8);
assert(b.y === 8 && b.id !== a.id, 'second panel stacks below with a fresh id');

// Grid constants are coherent.
assert(GRID_COLS >= 6 && MIN_W >= 1 && MIN_H >= 1 && MAX_PANELS >= 2, 'grid constants sane');

// Storage-absent safety (no localStorage in node): load returns [], save never throws.
assert(Array.isArray(loadPanels()) && loadPanels().length === 0, 'loadPanels safe without localStorage');
assert.doesNotThrow(() => savePanels([a, b]), 'savePanels safe without localStorage');

console.log('🎉 ALL CHART-PANELS TESTS PASSED! 🎉');
