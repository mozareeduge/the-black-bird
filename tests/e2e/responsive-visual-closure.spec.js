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

  // FQ-02 visual/ripple check: Source Names' label-priority fix changes
  // which labels compete for the render budget. Verify it doesn't introduce
  // overlap, swallow the active object's own legibility, or break chrome/
  // safe-area containment, at the three representative states named in the
  // completion intake -- not just the single default-state check the
  // regression test above already covers.
  async function checkSourceNamesOnState(page, { focusId, mobile = false }) {
    await clickNode(page, focusId);
    await page.waitForTimeout(900);
    const beforeActiveId = await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId);

    const viewButton = mobile ? page.locator('.bottom-nav [data-mobile="view"]') : page.locator('.rail-btn[data-action="view"]');
    await viewButton.click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);

    // Active identity unchanged and still legible (own label visible).
    const afterActiveId = await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId);
    expect(afterActiveId, 'Source Names must not mutate the active object').toBe(beforeActiveId);
    const activeLabelVisible = await page.evaluate(
      (id) => document.querySelector(`g.node[data-bb-id="${id}"] text.node-label`)?.getAttribute('display') !== 'none',
      beforeActiveId
    );
    expect(activeLabelVisible, "the active object's own label must remain visible with Source Names on").toBe(true);

    // No label overlap in this state.
    const overlapCount = await page.evaluate(countLabelOverlaps);
    expect(overlapCount, `expected 0 label overlaps with Source Names on, focus=${focusId}`).toBe(0);

    // Chrome/safe-area containment unaffected.
    await noHorizontalOverflow(page);
  }

  test('desktop 1280x800: ordinary FO focus + Source Names on has no label overlap and keeps the active label legible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { reduced: true });
    await checkSourceNamesOnState(page, { focusId: 'FO.CAIN' });
  });

  test('desktop 1280x800: RelO focus + Source Names on has no label overlap and keeps the active label legible', async ({
    page,
  }) => {
    // RelO focus is where NameO gets its highest, most contentious priority
    // (isRelParticipant, tier 2) -- the real worst case for crowding.
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { reduced: true });
    await checkSourceNamesOnState(page, { focusId: 'RelO.R4CB4A8D8' });
  });

  test('mobile 390x844: Source Names on has no label overlap and keeps the active label legible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { mobile: true, reduced: true });
    await checkSourceNamesOnState(page, { focusId: 'RelO.R4CB4A8D8', mobile: true });
  });

  // FR-01: a real rendered-geometry containment regression. The mobile
  // neutral-core camera deliberately crops the world reference envelope on
  // extreme aspect ratios (decided/kept as-is) -- but an off-core node's
  // label could still be *chosen* by the label solver even when its own
  // final screen rect fell outside the mobile Field's safe rectangle,
  // rendering it visibly clipped at the viewport edge (observed: "American
  // Crows" cut off at the right edge of the 390x844 neutral Field). Fixed
  // in src/layout/label-solver.js: a non-required, non-active label's
  // zero-overlap candidates must also be fully contained in the safe rect
  // to be chosen; with none, the label is suppressed (not rendered
  // clipped), same as the existing overlap-suppression path. Active/
  // required labels are unchanged (T-REQ-020 keeps its prior guarantee --
  // containment there is the camera-reconciliation caller's job).
  function getClippedLabels() {
    const safe = window.__bbTest.computeFieldSafeRect();
    const t = window.__bbTest.getUiRuntime().transform;
    const TOL = 2; // matches the existing containment tests' tolerance
    return [...document.querySelectorAll('text.node-label')]
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
        const x1 = Math.min(sx1, sx2),
          x2 = Math.max(sx1, sx2),
          y1 = Math.min(sy1, sy2),
          y2 = Math.max(sy1, sy2);
        const contained = x1 >= safe.left - TOL && x2 <= safe.right + TOL && y1 >= safe.top - TOL && y2 <= safe.bottom + TOL;
        return contained ? null : { id: n.id, rect: { x1, x2, y1, y2 }, safe };
      })
      .filter(Boolean);
  }

  async function assertNoClippedLabels(page, label) {
    const clipped = await page.evaluate(getClippedLabels);
    expect(clipped, `${label}: label(s) rendered outside the Field safe rect: ${JSON.stringify(clipped)}`).toEqual([]);
  }

  for (const vp of [
    { w: 430, h: 932, name: '430x932' },
    { w: 390, h: 844, name: '390x844' },
    { w: 320, h: 640, name: '320x640' },
    { w: 844, h: 390, name: '844x390' },
  ]) {
    test(`mobile ${vp.name}: no rendered label ever sits outside the Field safe rect, across neutral/focused/RelO-dense/Source-Names-on states`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await gotoField(page, { mobile: true, reduced: true });

      await page.evaluate(() => window.__bbTest.returnToField({ source: 'test' }));
      await page.waitForTimeout(900);
      await assertNoClippedLabels(page, 'neutral/restored mobile Field');

      await clickNode(page, 'FO.CORPSE');
      await page.waitForTimeout(700);
      await assertNoClippedLabels(page, 'ordinary focused object (FO.CORPSE)');

      await clickNode(page, 'RelO.R4CB4A8D8');
      await page.waitForTimeout(1600);
      await assertNoClippedLabels(page, 'RelO/dense state (RelO.R4CB4A8D8)');

      await page.locator('.bottom-nav [data-mobile="view"]').click();
      await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
      await page.locator('[data-view="sourceNames"]').first().click();
      await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900);
      await assertNoClippedLabels(page, 'RelO/dense state with Source Names on (NameO participates)');
    });
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

  // FQ-03: renamed from "200%-zoom-equivalent" -- this is a genuinely useful
  // small-viewport reflow proof, but it never claimed or measured any actual
  // text-size doubling; that real proof now lives in
  // tests/e2e/text-resize-stress.spec.js. RESPONSIVE-ACCESS/reflow-zoom-
  // equivalent (evidence-plan.json) is the same real, intentional viewport
  // this test exercises.
  test('reflow-zoom-equivalent viewport (640x360): no horizontal overflow, bottom-nav stays in frame', async ({ page }) => {
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
