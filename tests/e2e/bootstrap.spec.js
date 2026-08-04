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
});
