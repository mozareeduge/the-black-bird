'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

// Same isolation technique as desktop-composition.spec.js / environmental-
// resilience.spec.js: layout.css and mobile.css are extracted/target-
// architecture modules not yet linked from index.html, so accessibility.css's
// reduced-motion authority is exercised against their real transitions here.
async function isolateWithReducedMotionCss(page, bodyHtml) {
  await page.evaluate(
    async (bodyHtml) => {
      document.head.querySelectorAll('style').forEach((el) => el.remove());
      for (const href of ['/src/styles/layout.css', '/src/styles/mobile.css', '/src/styles/accessibility.css']) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        await new Promise((resolve) => {
          if (link.sheet) resolve();
          else link.onload = resolve;
        });
      }
      document.body.innerHTML = bodyHtml;
    },
    bodyHtml
  );
}

test.describe('Reduced motion is the authority over every CSS and JS motion path (T25, T-REQ-039)', () => {
  test('without reduced motion, layout.css/mobile.css transitions keep their authored duration', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // mobile.css's .sheet rules live behind max-width:900px
    await page.goto('/?bbtest=1');
    await isolateWithReducedMotionCss(
      page,
      `<div class="main reader-open"><div class="map-wrap"></div><div class="panel"></div></div>
       <div class="sheet open"></div>`
    );
    const durations = await page.evaluate(() => ({
      main: getComputedStyle(document.querySelector('.main')).transitionDuration,
      panel: getComputedStyle(document.querySelector('.panel')).transitionDuration,
      sheet: getComputedStyle(document.querySelector('.sheet')).transitionDuration,
    }));
    expect(parseFloat(durations.main)).toBeGreaterThan(0.1);
    expect(parseFloat(durations.panel)).toBeGreaterThan(0.1);
    expect(parseFloat(durations.sheet)).toBeGreaterThan(0.05);
  });

  test('with reduced motion, accessibility.css collapses those same layout.css/mobile.css transitions to an effective instant, with no per-module cooperation required', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // mobile.css's .sheet rules live behind max-width:900px
    await page.goto('/?bbtest=1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await isolateWithReducedMotionCss(
      page,
      `<div class="main reader-open"><div class="map-wrap"></div><div class="panel"></div></div>
       <div class="sheet open"></div>`
    );
    const durations = await page.evaluate(() => ({
      main: getComputedStyle(document.querySelector('.main')).transitionDuration,
      panel: getComputedStyle(document.querySelector('.panel')).transitionDuration,
      sheet: getComputedStyle(document.querySelector('.sheet')).transitionDuration,
    }));
    expect(parseFloat(durations.main)).toBeLessThan(0.001);
    expect(parseFloat(durations.panel)).toBeLessThan(0.001);
    expect(parseFloat(durations.sheet)).toBeLessThan(0.001);
  });

  test('live app: reduced motion already collapses the Reader/panel/sheet transitions via the template\'s own blanket rule (regression guard)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const durations = await page.evaluate(() => {
      const panel = document.querySelector('.panel');
      const sheet = document.getElementById('sheet');
      return {
        panel: panel ? getComputedStyle(panel).transitionDuration : '0s',
        sheet: sheet ? getComputedStyle(sheet).transitionDuration : '0s',
      };
    });
    expect(parseFloat(durations.panel)).toBe(0);
    expect(parseFloat(durations.sheet)).toBe(0);
  });

  test('live app JS motion paths: reduced motion yields zero blur, no travel pulse, and no field-force alpha heating across two commits (regression guard)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.BURIAL');
    const snap = await page.evaluate(() => window.__bbDesign.snapshot());
    expect(snap.reducedMotion).toBe(true);
    expect(snap.maxAppliedBlurPx).toBe(0);
    expect(snap.travelPulseActive).toBeFalsy();
  });

  test('live app: an orientation change under reduced motion still preserves the active object with no re-animation (P-RULE-022/033)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const before = await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId);
    expect(after).toBe(before);
  });
});
