'use strict';

const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

// A dense RelO with a long participant list produces the tallest realistic
// Reader content, which is exactly the scenario that previously let the
// implicit CSS Grid row grow past the viewport and made the fixed shell
// internally scrollable.
const TALL_READER_TARGET = 'RelO.R4CB4A8D8';

test.describe('app shell containment (PRE-01)', () => {
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 1280, height: 800 },
    { width: 1024, height: 640 },
  ]) {
    test(`fixed shell stays within ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await gotoField(page, { reduced: true });
      await clickNode(page, TALL_READER_TARGET);

      const geometry = await page.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector)?.getBoundingClientRect() || null;

        return {
          app: rect('#app'),
          frame: rect('.app-frame'),
          rail: rect('.rail'),
          main: rect('.main'),
          panel: rect('.panel'),
          appScrollTop: document.querySelector('#app')?.scrollTop || 0,
        };
      });

      for (const key of ['app', 'frame', 'rail', 'main', 'panel']) {
        expect(geometry[key], `${key} exists`).toBeTruthy();
        expect(geometry[key].height, `${key} height`).toBeLessThanOrEqual(
          viewport.height + 1,
        );
      }

      expect(geometry.appScrollTop).toBe(0);
    });
  }

  test('real keyboard graph navigation cannot scroll the fixed app shell', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { reduced: true });

    for (let i = 0; i < 12; i += 1) {
      if (await page.locator('g.node:focus').count()) break;
      await page.keyboard.press('Tab');
    }

    await expect(page.locator('g.node:focus')).toHaveCount(1);

    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];

    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press(keys[i % keys.length]);
      const scrollTop = await page.evaluate(
        () => document.querySelector('#app')?.scrollTop || 0,
      );
      expect(scrollTop).toBe(0);
    }
  });
});
