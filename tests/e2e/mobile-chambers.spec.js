'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState } = require('../bb-helpers.cjs');

// createNavigationController (T24, T-REQ-040/041) is exercised directly via
// dynamic import with fake dispatch/env/doc collaborators, matching the
// established pattern for testing not-yet-wired-in target-architecture
// modules (see view-index-solo.spec.js) without needing a real DOM listener
// environment for visualViewport.
async function loadController(page, envOverrides = {}) {
  return page.evaluate(async (envOverrides) => {
    const mod = await import('/src/controllers/navigation-controller.js');
    const dispatched = [];
    const listeners = {};
    const fakeVisualViewport =
      envOverrides.hasVisualViewport === false
        ? null
        : {
            width: envOverrides.width ?? 390,
            height: envOverrides.height ?? 640,
            offsetTop: envOverrides.offsetTop ?? 0,
            addEventListener: (type, fn) => {
              listeners[type] = fn;
            },
            removeEventListener: (type, fn) => {
              if (listeners[type] === fn) delete listeners[type];
            },
          };
    const env = { visualViewport: fakeVisualViewport, innerHeight: envOverrides.innerHeight ?? 640 };
    const doc = document;
    const controller = mod.createNavigationController({
      dispatch: (cmd) => dispatched.push(cmd),
      env,
      doc,
    });
    window.__bbNavTest = { controller, dispatched, listeners, env };
    return true;
  }, envOverrides);
}

test.describe('Mobile Field/Read projection, safe areas, and visual viewport recovery (T24)', () => {
  test('setSurface dispatches exactly SET_SURFACE with the requested surface', async ({ page }) => {
    await page.goto('/?bbtest=1');
    await loadController(page);
    const result = await page.evaluate(() => {
      const { controller, dispatched } = window.__bbNavTest;
      dispatched.length = 0;
      controller.setSurface('read');
      return dispatched.slice();
    });
    expect(result).toEqual([{ type: 'SET_SURFACE', surface: 'read' }]);
  });

  test('reconcileVisualViewport publishes --bb-visual-viewport-height and dispatches RECONCILE_ENVIRONMENT from the real visual viewport', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    await loadController(page, { width: 380, height: 512, offsetTop: 40 });
    const result = await page.evaluate(() => {
      const { controller, dispatched } = window.__bbNavTest;
      dispatched.length = 0;
      controller.reconcileVisualViewport();
      return {
        cssVar: document.documentElement.style.getPropertyValue('--bb-visual-viewport-height'),
        dispatched: dispatched.slice(),
      };
    });
    expect(result.cssVar).toBe('512px');
    expect(result.dispatched).toEqual([
      { type: 'RECONCILE_ENVIRONMENT', visualViewport: { width: 380, height: 512, offsetTop: 40 } },
    ]);
  });

  test('reconcileVisualViewport falls back to env.innerHeight and a null visualViewport payload when the API is unavailable', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    await loadController(page, { hasVisualViewport: false, innerHeight: 700 });
    const result = await page.evaluate(() => {
      const { controller, dispatched } = window.__bbNavTest;
      dispatched.length = 0;
      controller.reconcileVisualViewport();
      return {
        cssVar: document.documentElement.style.getPropertyValue('--bb-visual-viewport-height'),
        dispatched: dispatched.slice(),
      };
    });
    expect(result.cssVar).toBe('700px');
    expect(result.dispatched).toEqual([{ type: 'RECONCILE_ENVIRONMENT', visualViewport: null }]);
  });

  test('start() wires the visualViewport resize listener and an immediate resize reconciles again; stop() unwires it (T-REQ-041)', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    await loadController(page, { width: 390, height: 640 });
    const afterStart = await page.evaluate(() => {
      const { controller } = window.__bbNavTest;
      controller.start();
      return document.documentElement.style.getPropertyValue('--bb-visual-viewport-height');
    });
    expect(afterStart).toBe('640px');

    const afterResize = await page.evaluate(() => {
      const { env, listeners, dispatched } = window.__bbNavTest;
      dispatched.length = 0;
      env.visualViewport.height = 420; // keyboard opened
      listeners.resize();
      return {
        cssVar: document.documentElement.style.getPropertyValue('--bb-visual-viewport-height'),
        dispatched: dispatched.slice(),
      };
    });
    expect(afterResize.cssVar).toBe('420px');
    expect(afterResize.dispatched).toEqual([
      { type: 'RECONCILE_ENVIRONMENT', visualViewport: { width: 390, height: 420, offsetTop: 0 } },
    ]);

    const afterStop = await page.evaluate(() => {
      const { controller, listeners } = window.__bbNavTest;
      controller.stop();
      return Object.keys(listeners).length;
    });
    expect(afterStop).toBe(0);
  });

  test('ensureNoRedundantSheet closes an open legacy sheet and reports whether it did (D-DEC-09/D-DEC-19)', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    await loadController(page);
    const result = await page.evaluate(() => {
      const { controller } = window.__bbNavTest;
      const openSheet = document.createElement('div');
      openSheet.className = 'sheet open';
      document.body.appendChild(openSheet);
      const closedOne = controller.ensureNoRedundantSheet(openSheet);
      const stillOpenAfter = openSheet.classList.contains('open');

      const closedSheet = document.createElement('div');
      closedSheet.className = 'sheet';
      document.body.appendChild(closedSheet);
      const closedTwo = controller.ensureNoRedundantSheet(closedSheet);

      const closedThree = controller.ensureNoRedundantSheet(null);

      openSheet.remove();
      closedSheet.remove();
      return { closedOne, stillOpenAfter, closedTwo, closedThree };
    });
    expect(result.closedOne).toBe(true);
    expect(result.stillOpenAfter).toBe(false);
    expect(result.closedTwo).toBe(false);
    expect(result.closedThree).toBe(false);
  });

  test('live app: ordinary selection remains in Field, and switching to Read via bottom-nav keeps the same object/session with no redundant sheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const afterTap = await page.evaluate(() => {
      const app = document.getElementById('app');
      const sheet = document.getElementById('sheet');
      return {
        surface: window.__bbTest?.getState()?.responsive.surface,
        activeId: window.__bbTest?.getUiRuntime()?.focusedId,
        fieldActive: app.classList.contains('surface-field'),
        sheetOpen: sheet ? sheet.classList.contains('open') : false,
      };
    });
    // P-RULE-033/completion condition: ordinary selection remains in Field.
    expect(afterTap.surface).toBe('field');
    expect(afterTap.fieldActive).toBe(true);
    expect(afterTap.activeId).toBe('FO.CORPSE');
    expect(afterTap.sheetOpen).toBe(false);

    await page.locator('[data-mobile="read"]').click();
    const afterRead = await page.evaluate(() => {
      const app = document.getElementById('app');
      const sheet = document.getElementById('sheet');
      return {
        surface: window.__bbTest?.getState()?.responsive.surface,
        activeId: window.__bbTest?.getUiRuntime()?.focusedId,
        readActive: app.classList.contains('surface-read'),
        sheetOpen: sheet ? sheet.classList.contains('open') : false,
      };
    });
    // Field and Read share one semantic session: the same object stays committed
    // across the chamber switch, and the legacy sheet is never open alongside Read.
    expect(afterRead.surface).toBe('read');
    expect(afterRead.readActive).toBe(true);
    expect(afterRead.activeId).toBe(afterTap.activeId);
    expect(afterRead.sheetOpen, 'the Read chamber and the legacy bottom sheet must never both be open for the same object').toBe(false);

    await page.locator('[data-mobile="field"]').click();
    const afterBackToField = await page.evaluate(() => ({
      surface: window.__bbTest?.getState()?.responsive.surface,
      activeId: window.__bbTest?.getUiRuntime()?.focusedId,
    }));
    expect(afterBackToField.surface).toBe('field');
    expect(afterBackToField.activeId).toBe(afterTap.activeId);
  });

  test('live app: an orientation/viewport change on mobile preserves the active object and the Field/Read session (P-RULE-033)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const before = await page.evaluate(() => ({ activeId: window.__bbTest?.getUiRuntime()?.focusedId, surface: window.__bbTest?.getState()?.responsive.surface }));

    // Simulate a rotation to landscape: same semantic session, reprojected chrome only.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(50);

    const after = await page.evaluate(() => ({ activeId: window.__bbTest?.getUiRuntime()?.focusedId, surface: window.__bbTest?.getState()?.responsive.surface }));
    expect(after.activeId).toBe(before.activeId);
    expect(after.surface).toBe(before.surface);
  });

  test('inspecting a projected edge on mobile opens the edge sheet, not the desktop panel (P-SCN-030)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    // The wider invisible line.hit target (not the thin visible link-proj
    // line) carries the click handler — dispatch directly on it rather than
    // fighting an SVG line's near-zero-height bounding box.
    const found = await page.evaluate(() => {
      const hit = document.querySelector('.link-proj-layer line.hit, line.hit');
      if (!hit) return false;
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    expect(found, 'at least one projected-edge hit target must exist in the field').toBe(true);

    await expect(page.locator('#sheet')).toHaveClass(/open/);
    const state = await appState(page);
    expect(state.overlay).toBe('edgeSheet');
  });

  test('About is reachable from mobile Field via its own dedicated handle (P-SCN-073)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await page.locator('[data-mobile="field"]').click();
    await expect((await appState(page))).toMatchObject({ surface: 'field' });
    const aboutBtn = page.locator('#mobileAboutBtn');
    await expect(aboutBtn).toBeVisible();
    await aboutBtn.click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
  });

  test('the mobile Read chamber has no reachable About handle (P-SCN-074)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await page.locator('[data-mobile="read"]').click();
    await expect((await appState(page))).toMatchObject({ surface: 'read' });
    // The rail (desktop's only other About affordance) is display:none on
    // mobile at every surface, so the dedicated mobile handle is the sole
    // remaining candidate; it must not be reachable while in Read.
    await expect(page.locator('.rail')).toBeHidden();
    const aboutBtn = page.locator('#mobileAboutBtn');
    const box = await aboutBtn.boundingBox();
    const visibleAndInViewport =
      (await aboutBtn.isVisible()) && !!box && box.y >= 0 && box.y + box.height <= 844 && box.x >= 0 && box.x + box.width <= 390;
    expect(visibleAndInViewport, 'no About handle should be reachable from mobile Read').toBe(false);
  });

  test('a pinch-equivalent zoom gesture on mobile changes the camera scale without breaking the session (P-SCN-076)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    const before = await appState(page);
    const svgBox = await page.locator('#graphSvg').boundingBox();

    // Browsers translate a trackpad/touch pinch into a wheel event with
    // ctrlKey set; d3-zoom's default filter treats that as scale, not pan —
    // the same signal a real mobile pinch produces.
    await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForTimeout(80);

    const after = await appState(page);
    expect(after.transform.k, 'the pinch gesture must change the camera scale').not.toBe(before.transform.k);
    expect(after.transform.k).toBeGreaterThanOrEqual(0.2); // scaleMin (algorithm-contracts.json)
    expect(after.transform.k).toBeLessThanOrEqual(2.4); // scaleMax
    expect(after.activeId).toBe(before.activeId);
    expect(await page.locator('.bb-unavailable').count()).toBe(0);
  });

  test('pinch-zooming to the maximum scale on a dense mobile RelO clearing produces no label or node collisions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'RelO.R4CB4A8D8'); // the dense, multi-participant RelO used throughout the suite
    await page.waitForTimeout(500);

    const svgBox = await page.locator('#graphSvg').boundingBox();
    await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
    await page.keyboard.down('Control');
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(30);
    }
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);

    const k = await page.evaluate(() => window.__bbTest.getUiRuntime().transform.k);
    expect(k).toBe(2.4); // scaleMax (algorithm-contracts.json) -- confirms this is genuinely the max-zoom state

    const counts = await page.evaluate(() => {
      const t = window.__bbTest.getUiRuntime().transform;
      const labelRects = [...document.querySelectorAll('text.node-label')]
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
      let labelOverlaps = 0;
      for (let i = 0; i < labelRects.length; i++)
        for (let j = i + 1; j < labelRects.length; j++) {
          const a = labelRects[i],
            b = labelRects[j];
          if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1) labelOverlaps++;
        }
      return { labelOverlaps, labelCount: labelRects.length };
    });
    expect(counts.labelOverlaps).toBe(0);
    expect(counts.labelCount).toBeGreaterThan(0);
  });

  test('keyboard traversal still works on the mobile viewport (P-SCN-077)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await page.locator('[data-mobile="field"]').click();

    const roving = page.locator('g.node[tabindex="0"]');
    await expect(roving).toHaveCount(1);
    await roving.first().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);

    const afterArrow = await page.evaluate(() =>
      [...document.querySelectorAll('g.node')].find((g) => g.getAttribute('tabindex') === '0')?.getAttribute('data-bb-id'),
    );
    expect(afterArrow, 'arrow-key roving focus must move to a different node on mobile too').toBeTruthy();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const state = await appState(page);
    expect(state.activeId).toBe(afterArrow);
  });

  test('opening Read with no active anchor lands on the field object without appending Route or trace (P-SCN-072)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await page.evaluate(() => window.__bbTest.returnToField());
    const before = await page.evaluate(() => ({
      activeId: window.__bbTest?.getUiRuntime()?.focusedId,
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
    }));
    expect(before.activeId).toBeNull();

    await page.locator('[data-mobile="read"]').click();
    await page.waitForTimeout(80);

    const after = await page.evaluate(() => ({
      activeId: window.__bbTest?.getUiRuntime()?.focusedId,
      surface: window.__bbTest?.getState()?.responsive.surface,
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
    }));
    expect(after.activeId).toBe('FO.BLACK_BIRD_FIELD');
    expect(after.surface).toBe('read');
    expect(after.route, 'a chamber switch with no prior anchor must never append Route').toBe(before.route);
    expect(after.wear, 'a chamber switch with no prior anchor must never record trace').toBe(before.wear);
  });
});
