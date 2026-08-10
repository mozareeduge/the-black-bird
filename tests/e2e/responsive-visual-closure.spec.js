'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

// F08/R6: responsive/visual closure against the live, fully-wired page
// (distinct from environmental-resilience.spec.js's isolated src/styles/
// cascade checks, which exercise the not-yet-linked stylesheet modules in a
// standalone DOM). The target contract
// (tests/contracts/final-closure-contract.json) requires "no sheet leak,
// label collision, clipped required content, or chrome/focus conflict" in
// compact and mobile compositions -- this file asserts that directly against
// index.html at the named viewports, rather than leaving it as an informal
// visual check.

async function noHorizontalOverflow(page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `document.documentElement.scrollWidth (${scrollW}) exceeds clientWidth (${clientW})`).toBeLessThanOrEqual(
    clientW + 1,
  );
}

async function withinViewport(page, locator) {
  const box = await locator.boundingBox();
  expect(box, 'element has no box (not rendered)').not.toBeNull();
  const vp = page.viewportSize();
  expect(box.x, `left edge ${box.x} is off-screen`).toBeGreaterThanOrEqual(-0.5);
  expect(box.y, `top edge ${box.y} is off-screen`).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width, `right edge ${box.x + box.width} exceeds viewport width ${vp.width}`).toBeLessThanOrEqual(
    vp.width + 0.5,
  );
  expect(box.y + box.height, `bottom edge ${box.y + box.height} exceeds viewport height ${vp.height}`).toBeLessThanOrEqual(
    vp.height + 0.5,
  );
}

function countLabelOverlaps() {
  const t = window.__bbTest.getUiRuntime().transform;
  const rects = [...document.querySelectorAll('text.node-label')]
    .filter((el) => getComputedStyle(el).display !== 'none')
    .map((el) => {
      const g = el.closest('g.node');
      const n = g && g.__data__;
      if (!n) return null;
      const bbox = el.getBBox();
      const ox = +el.getAttribute('x') || 0,
        oy = +el.getAttribute('y') || 0;
      const anchor = el.getAttribute('text-anchor');
      const cx = n.x + ox,
        cy = n.y + oy;
      let rx1, rx2;
      if (anchor === 'start') {
        rx1 = cx;
        rx2 = cx + bbox.width;
      } else if (anchor === 'end') {
        rx1 = cx - bbox.width;
        rx2 = cx;
      } else {
        rx1 = cx - bbox.width / 2;
        rx2 = cx + bbox.width / 2;
      }
      const ry1 = cy - bbox.height * 0.8,
        ry2 = cy + bbox.height * 0.3;
      const sx1 = t.applyX(rx1),
        sx2 = t.applyX(rx2),
        sy1 = t.applyY(ry1),
        sy2 = t.applyY(ry2);
      return { x1: Math.min(sx1, sx2), x2: Math.max(sx1, sx2), y1: Math.min(sy1, sy2), y2: Math.max(sy1, sy2) };
    })
    .filter(Boolean);
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i],
        b = rects[j];
      if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1) overlaps++;
    }
  }
  return overlaps;
}

test.describe('Responsive/visual closure (F08/R6): no sheet leak, label collision, or clipped chrome', () => {
  test('the compact desktop profile (1024x640): Index drawer, Field View drawer, About panel, and Route drawer settle fully inside the viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await gotoField(page, { reduced: true });

    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.waitForTimeout(400);
    await noHorizontalOverflow(page);
    await withinViewport(page, page.locator('#objectDrawer'));
    await page.keyboard.press('Escape');
    await expect(page.locator('#objectDrawer')).not.toHaveClass(/open/);

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.waitForTimeout(400);
    await noHorizontalOverflow(page);
    await withinViewport(page, page.locator('#fieldViewDrawer'));
    await page.keyboard.press('Escape');
    await expect(page.locator('#fieldViewDrawer')).not.toHaveClass(/open/);

    await clickNode(page, 'FO.CORPSE');
    await noHorizontalOverflow(page);

    await page.locator('.rail-btn[data-action="about"]').click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    await page.waitForTimeout(400);
    await noHorizontalOverflow(page);
    await withinViewport(page, page.locator('#aboutPanel'));
    await page.keyboard.press('Escape');
    await expect(page.locator('#aboutPanel')).not.toHaveClass(/open/);

    // The Route drawer was never checked at this compact height (it isn't
    // reachable via the drawers above -- opening it needs a collapsed
    // Route strip, which needs > 4 committed objects, see
    // routeApertureEvents() in src/app.js): a real coverage gap, not a
    // confirmed defect. 5 distinct commits (6 total with onboarding)
    // collapses the strip at this >=1180px... except 1024 is BELOW that
    // threshold, so maxTail is 3 here and collapse needs > 4 total events --
    // 4 explicit commits (5 total) already clears it.
    for (const id of ['FO.CORPSE', 'FO.CAIN', 'FO.BURIAL', 'FO.ALLAH']) {
      await clickNode(page, id);
    }
    await page.locator('#route [data-route-open], #route .route-ellipsis').first().click();
    await page.locator('#routeDrawer').waitFor({ state: 'visible' });
    await noHorizontalOverflow(page);
    await withinViewport(page, page.locator('#routeDrawer'));
  });

  for (const vp of [
    { w: 390, h: 844, name: '390x844' },
    { w: 430, h: 932, name: '430x932' },
  ]) {
    for (const relId of ['RelO.R4CB4A8D8', 'RelO.RB6E74D1A', 'RelO.R9C3F1A62']) {
      test(`mobile ${vp.name}: no node-label collisions in the dense cluster ${relId}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await gotoField(page, { mobile: true, reduced: true });
        await clickNode(page, relId);
        await page.waitForTimeout(1600);
        const overlapCount = await page.evaluate(countLabelOverlaps);
        expect(overlapCount).toBe(0);
      });
    }
  }

  test('320px reflow (WCAG baseline) on the live page: no horizontal overflow, Index drawer opens cleanly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await gotoField(page, { mobile: true, reduced: true });
    await noHorizontalOverflow(page);
    await page.locator('.bottom-nav [data-mobile="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.waitForTimeout(400);
    await noHorizontalOverflow(page);
  });

  test('320px viewport preserves all core capabilities, not just layout reflow (P-SCN-125)', async ({ page }) => {
    // The reflow test above only checks layout (no overflow) and that the
    // Index drawer opens -- this scenario's title claims "all capabilities",
    // which was never actually exercised together at this narrowest
    // supported width: committing a node, the View drawer + a type toggle,
    // Index search, and the Field<->Read surface switch.
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoField(page, { mobile: true, reduced: true });
    await clickNode(page, 'FO.CAIN');
    expect(await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId)).toBe('FO.CAIN');

    await page.locator('[data-mobile="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-type="FO"]').first().click();
    await page.keyboard.press('Escape');

    await page.locator('[data-mobile="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('#objectSearch').fill('Cain');
    expect(await page.locator('[data-open], .index-item').count()).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    await page.locator('[data-mobile="read"]').click();
    expect(await page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('read');
    await noHorizontalOverflow(page);
  });

  test('200%-zoom-equivalent viewport (640x360): no horizontal overflow, bottom-nav stays in frame', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await gotoField(page, { mobile: true, reduced: true });
    await noHorizontalOverflow(page);
    await withinViewport(page, page.locator('.bottom-nav'));
  });

  test('landscape mobile (844x390): no horizontal overflow through focus, bottom-nav stays in frame', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await gotoField(page, { mobile: true, reduced: true });
    await noHorizontalOverflow(page);
    await clickNode(page, 'FO.CORPSE');
    await noHorizontalOverflow(page);
    await withinViewport(page, page.locator('.bottom-nav'));
  });

  test('forced-colors mode on the live page: no horizontal overflow', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoField(page, { reduced: true });
    await noHorizontalOverflow(page);
  });
});
