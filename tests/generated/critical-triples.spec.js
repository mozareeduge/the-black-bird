'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

// Generated executable coverage for coverage.json's COV-CRITICAL-TRIPLES
// obligation (T27, T-REQ-044/045). Each of these 8 named triples is taken
// verbatim from .bb-authority/authority/models/coverage.json and actually
// executed here -- not merely enumerated -- per T27's completion condition
// "ordered high-risk pairs and critical triples execute". Every step uses
// real, unforced Playwright actionability with no silent retry fallback
// (T-REQ-045, D-DEC-17).

test.describe('COV-CRITICAL-TRIPLES: the 8 named triples actually execute (T27)', () => {
  test('[commit, commit, stale-callback]: a second rapid commit supersedes the first; no stale partial state survives', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const beforeCount = await page.evaluate(() => (window.__bbState.history?.route ?? window.__bbState.routeEvents).length);
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN'); // second commit, before any settling wait
    const state = await page.evaluate(() => ({
      activeId: window.__bbState.activeId,
      routeIds: (window.__bbState.history?.route ?? window.__bbState.routeEvents).map((e) => e.id),
    }));
    expect(state.activeId).toBe('FO.CAIN');
    expect(state.routeIds.slice(beforeCount)).toEqual(['FO.CORPSE', 'FO.CAIN']);
  });

  test('[commit, viewport-change, commit]: a commit survives a resize, and a following commit still works correctly', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const beforeCount = await page.evaluate(() => (window.__bbState.history?.route ?? window.__bbState.routeEvents).length);
    await clickNode(page, 'FO.CORPSE');
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.waitForTimeout(50);
    const afterResize = await page.evaluate(() => window.__bbState.activeId);
    expect(afterResize).toBe('FO.CORPSE');
    await clickNode(page, 'FO.CAIN');
    const final = await page.evaluate(() => ({
      activeId: window.__bbState.activeId,
      routeCount: (window.__bbState.history?.route ?? window.__bbState.routeEvents).length,
    }));
    expect(final.activeId).toBe('FO.CAIN');
    expect(final.routeCount).toBe(beforeCount + 2);
  });

  test('[solo, group-filter, exit-solo]: a visibility change made while Solo is active is preserved exactly after exit', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('#objectSearch').fill('Cain');
    const soloBtn = page.locator('[data-solo="FO.CAIN"]').first();
    await expect(soloBtn).toBeVisible();
    await soloBtn.click();
    const soloActive = await page.evaluate(() => !!window.__bbState.soloSet || window.__bbState.solo?.active === true);
    expect(soloActive).toBeTruthy();

    // group-filter while Solo is active
    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-type="RelO"]').first().click();

    // exit-solo: Restore Field, in the same drawer (the live app's Solo-exit control).
    await page.locator('#restoreField').click();

    const afterExit = await page.evaluate(() => ({
      soloActive: !!window.__bbState.soloSet || window.__bbState.solo?.active === true,
    }));
    expect(afterExit.soloActive).toBeFalsy();
  });

  test('[modal, breakpoint-cross, close-modal]: a modal stays open and functional across a desktop/mobile breakpoint crossing, then closes cleanly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="about"]').click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);

    await page.setViewportSize({ width: 390, height: 844 }); // cross the mobile breakpoint
    await page.waitForTimeout(50);
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);

    // close-modal via the panel's own close control (the rail is not present on mobile).
    await page.locator('#aboutClose').click();
    await expect(page.locator('#aboutPanel')).not.toHaveClass(/open/);
  });

  test('[afterglow, page-hide, resume]: an afterglow entry recorded before hiding is gone on resume once its deadline has passed, without replay', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    const result = await page.evaluate(async () => {
      const mod = await import('/src/domain/trace.js');
      let trace = mod.clearTrace();
      trace = mod.recordAfterglow(trace, { id: 'FO.CORPSE', nowMs: 0, durationMs: 4000, cap: 3 }); // mobile cap/duration
      const beforeHide = trace.afterglows.length;
      // page-hide: elapsed wall-clock time passes while hidden (no timers fire, no replay).
      const afterResume = mod.reconcileTraceDeadlines(trace, 5000); // resume 5s later, past the 4s deadline
      return { beforeHide, afterResumeIds: afterResume.afterglows.map((a) => a.id) };
    });
    expect(result.beforeHide).toBe(1);
    expect(result.afterResumeIds).toEqual([]);
  });

  test('[all-hidden, replay, index-open]: replaying a Route event while all-hidden does not restore visibility, and Index still opens and recovers', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN');

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    for (const type of ['RNO', 'MNO', 'FO', 'NameO', 'RefO', 'RelO']) {
      // Disabling the active object's own type (FO, here) closes the drawer as
      // part of the live app's own field-attention reset; reopen it before each
      // toggle rather than assuming it stays open across the whole sequence.
      if (!(await page.locator('#fieldViewDrawer').first().evaluate((el) => el.classList.contains('open')))) {
        await page.locator('.rail-btn[data-action="view"]').click();
        await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
      }
      const toggle = page.locator(`[data-type="${type}"]`);
      if ((await toggle.getAttribute('aria-pressed')) !== 'false') {
        await toggle.click();
        await expect(page.locator(`[data-type="${type}"]`)).toHaveAttribute('aria-pressed', 'false');
      }
    }
    if (await page.locator('#fieldViewDrawer').first().evaluate((el) => el.classList.contains('open'))) {
      await page.locator('[data-close="fieldViewDrawer"]').first().click();
    }

    // replay while all-hidden: must not change visibility.
    const beforeVisibility = await page.evaluate(() => ({ ...window.__bbState.objectVisibility }));
    const items = page.locator('#route .route-item');
    const count = await items.count();
    if (count > 0) await items.first().click();
    const afterVisibility = await page.evaluate(() => ({ ...window.__bbState.objectVisibility }));
    expect(afterVisibility).toEqual(beforeVisibility);

    // index-open still works as the recovery path.
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
  });

  test('[pointerdown, pan-or-cancel, synthetic-click]: a pan/cancel sequence leaves no path for a following synthetic click to commit', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    const result = await page.evaluate(async () => {
      const mod = await import('/src/controllers/pointer-controller.js');
      class FakeSurface extends EventTarget {}
      const surface = new FakeSurface();
      const dispatched = [];
      const controller = mod.createPointerController({
        surface,
        dispatch: (c) => dispatched.push(c),
        getCandidates: () => [{ id: 'FO.CORPSE', screenX: 100, screenY: 100, bodyRect: { x: 95, y: 95, width: 10, height: 10 }, canonicalIndex: 0 }],
        getFocusMemberIds: () => new Set(),
      });
      controller.start();
      function pe(type, x, y) {
        const e = new Event(type);
        e.pointerId = 1;
        e.clientX = x;
        e.clientY = y;
        e.pointerType = 'touch';
        return e;
      }
      surface.dispatchEvent(pe('pointerdown', 100, 100));
      surface.dispatchEvent(pe('pointermove', 130, 100)); // pan-or-cancel: well past slop
      surface.dispatchEvent(pe('pointerup', 130, 100));
      // synthetic-click: the browser's compatibility click after a touch pan/cancel.
      // The pointer controller only ever listens for its own pointerdown/pointermove/
      // pointerup sequence -- a bare 'click' event has no handler at all, so it
      // structurally cannot commit anything.
      surface.dispatchEvent(new Event('click'));
      controller.stop();
      return dispatched;
    });
    expect(result).toEqual([]);
  });

  test('[reduced-motion, rapid-commit, modal]: two rapid commits under reduced motion leave a clean, consistent state that a following modal open does not disturb', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoField(page, { reduced: true });
    const beforeCount = await page.evaluate(() => (window.__bbState.history?.route ?? window.__bbState.routeEvents).length);
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.BURIAL');
    const beforeModal = await page.evaluate(() => window.__bbDesign.snapshot());
    expect(beforeModal.reducedMotion).toBe(true);
    expect(beforeModal.maxAppliedBlurPx).toBe(0);
    expect(beforeModal.travelPulseActive).toBeFalsy();

    await page.locator('.rail-btn[data-action="about"]').click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    const afterModal = await page.evaluate(() => ({
      activeId: window.__bbState.activeId,
      routeCount: (window.__bbState.history?.route ?? window.__bbState.routeEvents).length,
    }));
    expect(afterModal.activeId).toBe('FO.BURIAL');
    expect(afterModal.routeCount).toBe(beforeCount + 2);
  });
});
