'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, appState } = require('../bb-helpers.cjs');

async function buildFixture(page) {
  return page.evaluate(async () => {
    const mod = await import('/src/controllers/modal-controller.js');
    document.body.innerHTML = `
      <button id="railView">View</button>
      <button id="railIndex">Index</button>
      <div id="mainLayout"><button id="bgButton">background</button></div>
      <div id="viewPanel"><button id="viewFirst">view-first</button></div>
      <div id="indexPanel"><button id="indexFirst">index-first</button></div>
    `;
    const panels = { view: document.getElementById('viewPanel'), index: document.getElementById('indexPanel') };
    const controller = mod.createModalController({
      doc: document,
      panels,
      fallbackFor: () => document.getElementById('railView'),
    });
    window.__modalController = controller;
    return true;
  });
}

test.describe('One modal controller and state-pure About (T21)', () => {
  test('exactly one modal is ever active: opening a second replaces the first', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    await buildFixture(page);
    const result = await page.evaluate(() => {
      const c = window.__modalController;
      c.open('view', document.getElementById('railView'));
      const afterFirst = c.activeKind();
      c.open('index', document.getElementById('railIndex'));
      const afterSecond = c.activeKind();
      const viewStillOpen = document.getElementById('viewPanel').classList.contains('open');
      const indexOpen = document.getElementById('indexPanel').classList.contains('open');
      return { afterFirst, afterSecond, viewStillOpen, indexOpen };
    });
    expect(result.afterFirst).toBe('view');
    expect(result.afterSecond).toBe('index');
    expect(result.viewStillOpen).toBe(false);
    expect(result.indexOpen).toBe(true);
  });

  test('the background is genuinely inert while a modal is open, and replacement never leaks focus to it', async ({
    page,
  }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    await buildFixture(page);
    const result = await page.evaluate(() => {
      const c = window.__modalController;
      c.open('view', document.getElementById('railView'));
      const bgInertDuringView = document.getElementById('mainLayout').hasAttribute('inert');
      const focusInView = document.activeElement?.id;
      c.open('index', document.getElementById('railIndex'));
      const focusAfterReplace = document.activeElement?.id;
      const bgInertDuringIndex = document.getElementById('mainLayout').hasAttribute('inert');
      return { bgInertDuringView, focusInView, focusAfterReplace, bgInertDuringIndex };
    });
    expect(result.bgInertDuringView).toBe(true);
    expect(result.focusInView).toBe('viewFirst');
    expect(result.focusAfterReplace, 'focus must land inside the new panel, never back on the background in between').toBe(
      'indexFirst'
    );
    expect(result.bgInertDuringIndex).toBe(true);
  });

  test('closing restores the recorded invoker', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    await buildFixture(page);
    const result = await page.evaluate(() => {
      const c = window.__modalController;
      c.open('view', document.getElementById('railView'));
      c.close();
      return { activeId: document.activeElement?.id, mainLayoutInert: document.getElementById('mainLayout').hasAttribute('inert') };
    });
    expect(result.activeId).toBe('railView');
    expect(result.mainLayoutInert).toBe(false);
  });

  test('closing falls back deterministically when the recorded invoker is no longer in the document', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    await buildFixture(page);
    const result = await page.evaluate(() => {
      const c = window.__modalController;
      const invoker = document.createElement('button'); // never attached to the document
      c.open('view', invoker);
      c.close();
      return document.activeElement?.id;
    });
    expect(result).toBe('railView'); // the deterministic fallback wired in the fixture
  });

  test('About changes no poem state on the live app (state-pure)', async ({ page }) => {
    await gotoField(page, { realOnboarding: true, reduced: true });
    const before = await appState(page);
    await page.locator('.rail-btn[data-action="about"]').click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    await page.locator('[data-about-section]').first().click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#aboutPanel')).not.toHaveClass(/open/);
    const after = await appState(page);
    expect(after).toEqual(before);
  });

  test('the About panel exposes a working link to the Research Annex (P-SCN-087)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="about"]').click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    const link = page.locator('#aboutPanel a[href="research/"]', { hasText: 'Research Annex' }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'research/');
  });

  // P-SCN-001: opening About before entry (from the threshold's own
  // #thAboutBtn) is a real, dedicated code path (openAbout("threshold"),
  // the from-threshold panel class), distinct from the post-entry rail
  // button -- and had no scenario-specific test. The registry's prior
  // "evidence" (the state-purity test above) always runs after
  // gotoField's own wait for the focused/entered phase, so it never
  // actually exercised the pre-entry threshold screen.
  test('opening About from the threshold, before entry, opens the from-threshold panel and leaves entry still available (P-SCN-001)', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    await expect(page.locator('.threshold-card')).toBeVisible();
    await expect(page.locator('#app')).toHaveClass(/phase-threshold/);
    await page.locator('#thAboutBtn').click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    await expect(page.locator('#aboutPanel')).toHaveClass(/from-threshold/);
    // Still pre-entry underneath the modal -- opening About didn't itself commit onboarding.
    await expect(page.locator('#app')).toHaveClass(/phase-threshold/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#aboutPanel')).not.toHaveClass(/open/);
    await expect(page.locator('.threshold-card')).toBeVisible();
    // Entry still works normally afterward.
    const enter = page.getByRole('button', { name: /enter/i }).first();
    await enter.click();
    await page.waitForFunction(
      () =>
        window.__bbTest?.getState() &&
        document.querySelectorAll('g.node').length === 50 &&
        window.__bbTest.getState().lifecycle.phase === 'focused',
      { timeout: 12000 },
    );
  });
});
