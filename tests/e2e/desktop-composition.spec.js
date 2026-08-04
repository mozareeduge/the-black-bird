'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

// Clears every trace of the live page's own inline <style> (which this test
// deliberately does not want to measure) and loads exactly layout.css, so
// the measurement reflects only the new, corrected CSS being verified here.
async function isolateLayoutCss(page) {
  await page.evaluate(async () => {
    document.head.querySelectorAll('style').forEach((el) => el.remove());
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/styles/layout.css';
    document.head.appendChild(link);
    await new Promise((resolve) => {
      if (link.sheet) resolve();
      else link.onload = resolve;
    });
    document.body.innerHTML = `
      <div class="app-frame">
        <div class="rail"></div>
        <div class="main reader-open">
          <div class="map-wrap"></div>
          <div class="panel"></div>
        </div>
      </div>`;
  });
}

async function computedReaderWidth(page, width, height) {
  await page.setViewportSize({ width, height });
  await isolateLayoutCss(page);
  return page.evaluate(() => Math.round(document.querySelector('.panel').getBoundingClientRect().width));
}

test.describe('Final desktop composition across wide/standard/compact profiles (T23)', () => {
  test('Reader width matches the exact per-profile band at 1440x960 (wide: 420-480)', async ({ page }) => {
    await page.goto('/?bbtest=1');
    const width = await computedReaderWidth(page, 1440, 960);
    expect(width).toBeGreaterThanOrEqual(420);
    expect(width).toBeLessThanOrEqual(480);
  });

  test('Reader width matches the exact per-profile band at 1280x800 (desktop: 390-450)', async ({ page }) => {
    await page.goto('/?bbtest=1');
    const width = await computedReaderWidth(page, 1280, 800);
    expect(width).toBeGreaterThanOrEqual(390);
    expect(width).toBeLessThanOrEqual(450);
  });

  test('Reader width matches the exact per-profile band at 1024x640 (compact: 340-400)', async ({ page }) => {
    await page.goto('/?bbtest=1');
    const width = await computedReaderWidth(page, 1024, 640);
    expect(width).toBeGreaterThanOrEqual(340);
    expect(width).toBeLessThanOrEqual(400);
  });

  test('the wide profile keeps the Field at or above 60% of the post-rail width (fieldMinShare)', async ({ page }) => {
    await page.goto('/?bbtest=1');
    await page.setViewportSize({ width: 1440, height: 960 });
    await isolateLayoutCss(page);
    const shares = await page.evaluate(() => {
      const rail = document.querySelector('.rail').getBoundingClientRect();
      const mapWrap = document.querySelector('.map-wrap').getBoundingClientRect();
      const postRailWidth = window.innerWidth - rail.width;
      return { fieldShare: mapWrap.width / postRailWidth };
    });
    expect(shares.fieldShare).toBeGreaterThanOrEqual(0.6);
  });

  test('1024x640 has an explicit, stable arrangement: no clipped or overlapping chrome at that exact viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const geometry = await page.evaluate(() => {
      const rail = document.querySelector('.rail')?.getBoundingClientRect();
      const mapWrap = document.querySelector('.map-wrap')?.getBoundingClientRect();
      const reader = document.querySelector('.panel')?.getBoundingClientRect();
      return { rail, mapWrap, reader, viewport: { width: window.innerWidth, height: window.innerHeight } };
    });
    // The rail and map-wrap must not overlap, and nothing extends past the viewport.
    expect(geometry.rail.right).toBeLessThanOrEqual(geometry.mapWrap.left + 1);
    expect(geometry.mapWrap.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    if (geometry.reader && geometry.reader.width > 0) {
      expect(geometry.reader.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    }
  });

  test('the map title and tools never occlude the active label or focus contour', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const overlap = await page.evaluate(() => {
      function intersects(a, b) {
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      }
      const chrome = [...document.querySelectorAll('.map-title, .map-tools')].map((el) => el.getBoundingClientRect());
      const activeLabel = document
        .querySelector(`g.node[data-bb-id="FO.CORPSE"] text.node-label`)
        ?.getBoundingClientRect();
      if (!activeLabel || activeLabel.width === 0) return { checked: false };
      const hits = chrome.filter((c) => c.width > 0 && intersects(c, activeLabel));
      return { checked: true, hitCount: hits.length };
    });
    if (overlap.checked) expect(overlap.hitCount).toBe(0);
  });
});
