'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState } = require('../bb-helpers.cjs');

// Desktop's max visible tail is 4 (routeApertureEvents), so condensation
// requires strictly more than 5 total route events; onboarding entry may
// already record one. Eight real commits guarantees condensation regardless.
const COMMIT_SEQUENCE = [
  'FO.CORPSE',
  'FO.CAIN',
  'FO.ABEL',
  'FO.BURIAL',
  'FO.ODIN',
  'FO.HUGINN',
  'FO.MUNINN',
  'FO.BATTLEFIELD',
];

async function openRouteDrawer(page) {
  const ellipsis = page.locator('#route [data-route-open], #route .route-ellipsis').first();
  await expect(ellipsis).toBeVisible({ timeout: 10000 });
  await ellipsis.click();
  await expect(page.locator('#routeDrawer')).toHaveClass(/open/);
}

test.describe('Route aperture/modal and independent trace controls (T19)', () => {
  test('the compact route strip condenses once events exceed the visible tail, but the expanded drawer exposes every event (D-DEC-10/22)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const initialRoute = (await appState(page)).routeIds.length;
    for (const id of COMMIT_SEQUENCE) await clickNode(page, id);

    const state = await appState(page);
    const totalEvents = initialRoute + COMMIT_SEQUENCE.length;
    expect(state.routeIds.length).toBe(totalEvents);

    const stripCount = await page.locator('#route .route-item').count();
    expect(stripCount, 'the strip must condense, not show every event inline').toBeLessThan(totalEvents);

    await openRouteDrawer(page);
    const drawerRows = await page.locator('#routeList .route-row').count();
    expect(drawerRows, 'the expanded drawer must expose every committed event, not just the visible tail').toBe(
      totalEvents
    );
  });

  test('replaying a route event changes the reading subject without appending Route or recording trace (P-RULE-007)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    for (const id of COMMIT_SEQUENCE) await clickNode(page, id);
    const before = await appState(page);
    const beforeWear = await page.evaluate(() => JSON.stringify(window.__bbState?.fieldTrace?.wear || {}));

    await openRouteDrawer(page);
    const firstRow = page.locator('#routeList .route-row').first();
    const replayTargetId = await firstRow.getAttribute('data-id');
    await firstRow.click();

    const after = await appState(page);
    const afterWear = await page.evaluate(() => JSON.stringify(window.__bbState?.fieldTrace?.wear || {}));
    expect(after.activeId).toBe(replayTargetId);
    expect(after.routeIds).toEqual(before.routeIds);
    expect(afterWear).toBe(beforeWear);
  });

  test('Clear Route and Clear field trace are independent: clearing one never touches the other (P-RULE-010)', async ({
    page,
  }) => {
    test.setTimeout(90000); // two full commit sequences plus two drawer cycles
    await gotoField(page, { reduced: true });
    for (const id of COMMIT_SEQUENCE) await clickNode(page, id);
    const before = await page.evaluate(() => ({
      route: window.__bbState.routeEvents.length,
      wear: Object.keys(window.__bbState.fieldTrace?.wear || {}).length,
    }));
    expect(before.route).toBeGreaterThan(0);
    expect(before.wear).toBeGreaterThan(0);

    // Open the drawer and clear Route only.
    await openRouteDrawer(page);
    await page.locator('#clearRouteDrawer').click();
    const afterRouteClear = await page.evaluate(() => ({
      route: window.__bbState.routeEvents.length,
      wear: Object.keys(window.__bbState.fieldTrace?.wear || {}).length,
    }));
    expect(afterRouteClear.route).toBe(0);
    expect(afterRouteClear.wear, 'clearing Route must not clear wear/trace').toBe(before.wear);
    await page.locator('#routeDrawer [data-close="routeDrawer"]').first().click();
    await expect(page.locator('#routeDrawer')).not.toHaveClass(/open/);

    // Rebuild route + wear, then clear field trace only.
    for (const id of COMMIT_SEQUENCE) await clickNode(page, id);
    const beforeTraceClear = await page.evaluate(() => ({
      route: window.__bbState.routeEvents.length,
      wear: Object.keys(window.__bbState.fieldTrace?.wear || {}).length,
    }));
    expect(beforeTraceClear.route).toBeGreaterThan(0);
    expect(beforeTraceClear.wear).toBeGreaterThan(0);

    await openRouteDrawer(page);
    await page.locator('#clearFieldTraceDrawer').click();
    const afterTraceClear = await page.evaluate(() => ({
      route: window.__bbState.routeEvents.length,
      wear: Object.keys(window.__bbState.fieldTrace?.wear || {}).length,
    }));
    expect(afterTraceClear.wear).toBe(0);
    expect(afterTraceClear.route, 'clearing field trace must not clear Route').toBe(beforeTraceClear.route);
  });

  test('committing a non-existent id is a safe no-op: no mutation, no crash (P-SCN-012)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    const before = await appState(page);
    const result = await page.evaluate(async () => {
      const r = await window.__bbTest.focusObject('NOT.A.REAL.ID', { source: 'test-invalid' });
      return { returned: r ?? null, errorOnPage: !!document.querySelector('.bb-unavailable') };
    });
    const after = await appState(page);
    expect(result.returned).toBeNull();
    expect(result.errorOnPage, 'an invalid target must never trigger the bootstrap-failure surface').toBe(false);
    expect(after.activeId).toBe(before.activeId);
    expect(after.routeIds).toEqual(before.routeIds);
    expect(after.phase).toBe(before.phase);
  });

  test('clicking the field background while focused returns to the whole field, retaining Route (P-SCN-016)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const before = await appState(page);
    expect(before.activeId).toBe('FO.CORPSE');

    await page.locator('#graphSvg').click({ position: { x: 4, y: 4 } });

    const after = await appState(page);
    expect(after.activeId).toBeNull();
    expect(after.phase).toBe('field');
    expect(after.routeIds, 'returning to the field must not clear Route').toEqual(before.routeIds);
  });
});
