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
});
