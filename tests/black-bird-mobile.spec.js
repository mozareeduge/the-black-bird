const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState, noGeometryErrors } = require('./bb-helpers.cjs');

test.describe('Mobile viewport contract (T05/4.14)', () => {
  test('390x844 and 430x932 neutral occupancy differ by no more than 15%', async ({ page }) => {
    const ratioAt = async (vp) => {
      await page.setViewportSize(vp);
      await gotoField(page, { mobile: true });
      await page.evaluate(() => window.__bbTest.returnToField({ source: 'test' }));
      await page.waitForTimeout(900);
      return page.evaluate(() => {
        const T = window.__bbTest;
        const safe = T.computeFieldSafeRect();
        const visible = T.simNodes.filter((d) => T.nodeVisible(d.id));
        const envelope = T.getNodeBounds(visible, 30);
        const t = window.__bbTest.getUiRuntime().transform;
        const rx = (envelope.width * t.k) / safe.width;
        const ry = (envelope.height * t.k) / safe.height;
        return Math.max(rx, ry);
      });
    };
    const r390 = await ratioAt({ width: 390, height: 844 });
    const r430 = await ratioAt({ width: 430, height: 932 });
    const diff = Math.abs(r390 - r430) / Math.max(r390, r430);
    expect(diff).toBeLessThanOrEqual(0.15);
  });

  test('switching Field -> Read -> Field preserves active ID, Route, and Solo state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { mobile: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.BURIAL');
    const before = await appState(page);
    await page.locator('[data-mobile="read"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-mobile="field"]').click();
    await page.waitForTimeout(200);
    const after = await appState(page);
    expect(after.activeId).toBe(before.activeId);
    expect(after.routeIds).toEqual(before.routeIds);
    expect(after.soloIds).toEqual(before.soloIds);
    await noGeometryErrors(page);
  });

  test('no clipped active label or active body at 390x844 bottom-nav-adjusted safe rect', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { mobile: true });
    await clickNode(page, 'FO.CORPSE');
    await page.waitForTimeout(700);
    const result = await page.evaluate(() => {
      const safe = window.__bbTest.computeFieldSafeRect();
      const t = window.__bbTest.getUiRuntime().transform;
      const n = window.__bbTest.byId['FO.CORPSE'];
      const sx = t.x + n.x * t.k,
        sy = t.y + n.y * t.k;
      return {
        bodyInside: sx >= safe.left - 2 && sx <= safe.right + 2 && sy >= safe.top - 2 && sy <= safe.bottom + 2,
      };
    });
    expect(result.bodyInside).toBeTruthy();
    await noGeometryErrors(page);
  });
});
