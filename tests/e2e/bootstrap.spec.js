'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const UNAVAILABLE_TITLE = 'The field could not be opened';
const UNAVAILABLE_BODY =
  'The artwork did not finish loading. Reload the page. If the problem continues, use the source and citation links below.';

const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function corruptedDataHtml() {
  const m = indexHtml.match(/^const DATA = (\{[\s\S]*?\});$/m);
  if (!m) throw new Error('could not locate DATA block in built index.html');
  const data = JSON.parse(m[1]);
  data.nodes = data.nodes.slice(0, 2); // invalid: must be exactly 50
  return indexHtml.replace(m[0], `const DATA = ${JSON.stringify(data)};`);
}

async function assertUnavailableSurface(page) {
  const surface = page.locator('.bb-unavailable');
  await expect(surface).toBeVisible();
  await expect(page.locator('.bb-unavailable-title')).toHaveText(UNAVAILABLE_TITLE);
  await expect(page.locator('.bb-unavailable-body')).toHaveText(UNAVAILABLE_BODY);
  await expect(page.locator('.bb-unavailable-links a[href="research/"]')).toHaveText('Research');
  await expect(
    page.locator('.bb-unavailable-links a[href="https://github.com/mozareeduge/the-black-bird/blob/main/CITATION.cff"]')
  ).toHaveText('Citation');
  await expect(
    page.locator('.bb-unavailable-links a[href="https://github.com/mozareeduge/the-black-bird"]')
  ).toHaveText('Source repository');
  expect(await page.locator('g.node').count()).toBe(0);
}

test.describe('Bootstrap validation and failure surfaces (T04)', () => {
  test('ready state appears only after validation succeeds; no unavailable surface on the normal path', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?skipIntro=1&bbtest=1');
    await page.waitForFunction(() => window.__bbState && document.querySelectorAll('g.node').length === 50, {
      timeout: 12000,
    });
    expect(await page.locator('.bb-unavailable').count()).toBe(0);
    expect(await page.getAttribute('#app', 'class')).not.toMatch(/phase-unavailable/);
    expect(errors).toEqual([]);
  });

  test('runtime failure (D3 unavailable) shows the truthful unavailable surface, never a blank or partial graph', async ({
    page,
  }) => {
    await page.route('**/vendor/d3.v7.9.0.min.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* d3 failed to load */' })
    );
    await page.goto('/?skipIntro=1&bbtest=1');
    await assertUnavailableSurface(page);
    expect(await page.getAttribute('#app', 'class')).toBe('phase-unavailable');
  });

  test('invalid canonical data shows the truthful unavailable surface, never a blank or partial graph', async ({ page }) => {
    const html = corruptedDataHtml();
    await page.route('**/*', (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/' || pathname === '/index.html') {
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      }
      return route.continue();
    });
    await page.goto('/?skipIntro=1&bbtest=1');
    await assertUnavailableSurface(page);
    expect(await page.getAttribute('#app', 'class')).toBe('phase-unavailable');
  });

  test('no-script surface identifies the work and provides stable links when JavaScript is unavailable', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    const surface = page.locator('.bb-unavailable');
    await expect(surface).toBeVisible();
    await expect(page.locator('.bb-unavailable-card h1')).toHaveText('THE BLACK BIRD');
    await expect(page.locator('.bb-unavailable-links a[href="research/"]')).toHaveText('Research');
    await expect(
      page.locator('.bb-unavailable-links a[href="https://github.com/mozareeduge/the-black-bird/blob/main/CITATION.cff"]')
    ).toHaveText('Citation');
    await expect(
      page.locator('.bb-unavailable-links a[href="https://github.com/mozareeduge/the-black-bird"]')
    ).toHaveText('Source repository');
    expect(await page.locator('g.node').count()).toBe(0);
    await context.close();
  });

  test('a direct object click interrupts tacit onboarding cleanly and commits that object (P-SCN-004)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?bbtest=1');
    const enterBtn = page.getByRole('button', { name: /enter/i }).first();
    await expect(enterBtn).toBeVisible();
    await enterBtn.click();
    // Reduced motion: each onboarding stage holds ~400ms; land inside stage 1.
    await page.waitForFunction(() => window.__bbState?.onboardingActive === true, { timeout: 4000 });
    await page.waitForTimeout(150);

    await page.evaluate(() => {
      for (const g of document.querySelectorAll('g.node')) if (g.__data__?.id) g.setAttribute('data-bb-test-id', g.__data__.id);
    });
    const target = page.locator('g.node[data-bb-test-id="FO.CORPSE"]');
    await expect(target).toBeVisible();
    const hit = target.locator('.node-hit,.bb-hit,.node-core,.bb-body').first();
    const box = await hit.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.waitForFunction(() => window.__bbState?.activeId === 'FO.CORPSE', { timeout: 6000 });
    const state = await page.evaluate(() => ({
      onboardingActive: window.__bbState.onboardingActive,
      phase: window.__bbState.phase,
      route: window.__bbState.routeEvents.map((e) => e.id),
    }));
    expect(state.onboardingActive, 'the interrupting click must end onboarding, not queue behind it').toBe(false);
    expect(state.phase).toBe('focused');
    expect(state.route).toEqual(['FO.CORPSE']);
  });

  test('a repeated Enter input is structurally impossible mid-transition, so entry only ever runs once (P-SCN-005)', async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?bbtest=1');
    const enterBtn = page.getByRole('button', { name: /enter/i }).first();
    await expect(enterBtn).toBeVisible();
    await enterBtn.click();
    // CSS (.threshold.leaving { pointer-events: none }) disables the whole
    // threshold, including this button, the instant the first click's
    // "leaving" class is applied — verify that's actually in effect rather
    // than assuming it from the stylesheet alone.
    await expect(page.locator('#threshold')).toHaveClass(/leaving/);
    await expect(page.locator('#threshold')).toHaveCSS('pointer-events', 'none');
    // A genuine second click is therefore not deliverable to the button; a
    // forced one lands on an unclickable target and must not be able to
    // trigger a second entry.
    await enterBtn.click({ force: true, timeout: 2000 }).catch(() => {});

    await page.waitForFunction(() => window.__bbState?.phase === 'focused' && !!window.__bbState.activeId, {
      timeout: 15000,
    });
    expect(errors).toEqual([]);
    expect(await page.locator('.bb-unavailable').count()).toBe(0);
    expect(await page.locator('g.node').count()).toBe(50);
    const state = await page.evaluate(() => ({ route: window.__bbState.routeEvents.map((e) => e.id) }));
    // A repeated Enter must not double-run onboarding into two Route commits
    // for the same landing object.
    expect(new Set(state.route).size).toBe(state.route.length);
  });

  test('the threshold card reveals within a bounded time even when custom fonts never finish loading (P-SCN-006)', async ({
    page,
  }) => {
    await page.route(/assets\/fonts\/.+\.woff2?$/, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('.threshold-card')).toBeAttached();
    // .threshold-card starts at opacity:0 in CSS by design (T04's own font-
    // ready gate) — the 1600ms document.fonts.ready-or-timeout fallback
    // (src/app.js "Threshold font-ready gate") must still reveal it even
    // though every font request above is being aborted.
    await expect
      .poll(async () => page.locator('.threshold-card').evaluate((el) => getComputedStyle(el).opacity), {
        timeout: 3000,
      })
      .toBe('1');
  });
});
