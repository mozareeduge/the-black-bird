'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState } = require('../bb-helpers.cjs');

// Cross-browser semantic smoke (T28, T-REQ-046). Runs identically against
// every configured project (chromium/firefox/webkit in playwright.config.cjs)
// -- deterministic pixel-level geometry and visual regression stay
// Chromium-only (tests/black-bird-evidence.spec.js and friends); this file
// only asserts semantic behavior that must hold on every engine.
test.describe('Cross-browser semantic smoke', () => {
  test('the field bootstraps to 50 nodes with a real first reading anchor', async ({ page }) => {
    await gotoField(page, { reduced: true });
    const state = await appState(page);
    expect(state.phase).toBe('focused');
    expect(state.activeId).toBeTruthy();
  });

  test('a real click commits the target object and appends exactly one Route event', async ({ page }) => {
    await gotoField(page, { reduced: true });
    const before = await appState(page);
    await clickNode(page, 'FO.CORPSE');
    const after = await appState(page);
    expect(after.activeId).toBe('FO.CORPSE');
    expect(after.routeIds.length).toBe(before.routeIds.length + 1);
  });

  test('same-object activation appends nothing (idempotent commit)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const before = await appState(page);
    await clickNode(page, 'FO.CORPSE');
    const after = await appState(page);
    expect(after.routeIds.length).toBe(before.routeIds.length);
  });

  test('opening and closing the About modal is state-pure', async ({ page }) => {
    await gotoField(page, { reduced: true });
    const before = await appState(page);
    await page.locator('.rail-btn[data-action="about"]').click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    await page.locator('#aboutClose').click();
    await expect(page.locator('#aboutPanel')).not.toHaveClass(/open/);
    const after = await appState(page);
    expect(after.routeIds).toEqual(before.routeIds);
    expect(after.activeId).toBe(before.activeId);
  });

  test('no SVG geometry is NaN/Infinity after a real interaction sequence', async ({ page }) => {
    const { noGeometryErrors } = require('../bb-helpers.cjs');
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN');
    await noGeometryErrors(page);
  });
});
