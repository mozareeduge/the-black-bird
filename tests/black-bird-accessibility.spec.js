const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState } = require('./bb-helpers.cjs');

test.describe('Accessibility contract (T05)', () => {
  test('exactly one visible node has tabindex=0 (roving tabindex)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    const zeroCount = await page.evaluate(
      () => document.querySelectorAll('g.node[tabindex="0"]').length,
    );
    expect(zeroCount).toBe(1);
    await clickNode(page, 'FO.CORPSE');
    const zeroId = await page.evaluate(() => {
      const el = document.querySelector('g.node[tabindex="0"]');
      return el?.getAttribute('data-bb-id');
    });
    expect(zeroId).toBe('FO.CORPSE');
  });

  test('arrow key navigation moves the roving tab stop to a different visible node', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    await page.evaluate(() => {
      document.querySelector('g.node[tabindex="0"]').focus();
    });
    const before = await page.evaluate(
      () => document.querySelector('g.node[tabindex="0"]')?.getAttribute('data-bb-id'),
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const after = await page.evaluate(
      () => document.querySelector('g.node[tabindex="0"]')?.getAttribute('data-bb-id'),
    );
    expect(after).not.toBe(before);
    // Still exactly one tab stop after navigating.
    const zeroCount = await page.evaluate(
      () => document.querySelectorAll('g.node[tabindex="0"]').length,
    );
    expect(zeroCount).toBe(1);
  });

  test('Enter commits the keyboard-focused node directly', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    await page.evaluate(() => {
      document.querySelector('g.node[tabindex="0"]').focus();
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const targetId = await page.evaluate(
      () => document.querySelector('g.node[tabindex="0"]')?.getAttribute('data-bb-id'),
    );
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const s = await appState(page);
    expect(s.activeId).toBe(targetId);
  });

  test('View toggles expose aria-pressed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await page.evaluate(() => window.__bbTest.openDrawer('fieldViewDrawer'));
    const pressed = await page.locator('[data-view="projected"]').getAttribute('aria-pressed');
    expect(pressed).toBe('true');
    await page.locator('[data-view="projected"]').click();
    const pressedAfter = await page.locator('[data-view="projected"]').getAttribute('aria-pressed');
    expect(pressedAfter).toBe('false');
  });

  test('opening a drawer makes the background inert and moves focus into the panel; closing restores both', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    const fieldBtn = page.locator('[data-action="view"]').first();
    await fieldBtn.focus();
    await fieldBtn.click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    expect(await page.locator('#mainLayout').getAttribute('inert')).not.toBeNull();
    const focusedInDrawer = await page.evaluate(() =>
      document.getElementById('fieldViewDrawer').contains(document.activeElement),
    );
    expect(focusedInDrawer).toBeTruthy();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    expect(await page.locator('#mainLayout').getAttribute('inert')).toBeNull();
  });

  test('opening About makes the background inert; closing restores focus to the invoker', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    const aboutBtn = page.locator('[data-action="about"]').first();
    await aboutBtn.focus();
    await aboutBtn.click();
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    expect(await page.locator('#mainLayout').getAttribute('inert')).not.toBeNull();
    await page.locator('#aboutClose').click();
    await page.waitForTimeout(150);
    expect(await page.locator('#mainLayout').getAttribute('inert')).toBeNull();
    const active = await page.evaluate(() => document.activeElement?.getAttribute('data-action'));
    expect(active).toBe('about');
  });
});
