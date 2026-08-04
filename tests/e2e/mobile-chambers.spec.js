'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

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
        surface: window.__bbState?.surface,
        activeId: window.__bbState?.activeId,
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
        surface: window.__bbState?.surface,
        activeId: window.__bbState?.activeId,
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
      surface: window.__bbState?.surface,
      activeId: window.__bbState?.activeId,
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
    const before = await page.evaluate(() => ({ activeId: window.__bbState.activeId, surface: window.__bbState.surface }));

    // Simulate a rotation to landscape: same semantic session, reprojected chrome only.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(50);

    const after = await page.evaluate(() => ({ activeId: window.__bbState.activeId, surface: window.__bbState.surface }));
    expect(after.activeId).toBe(before.activeId);
    expect(after.surface).toBe(before.surface);
  });
});
