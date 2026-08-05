const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState, noGeometryErrors } = require('./bb-helpers.cjs');

test.describe('Route/Solo state transaction contract (T01)', () => {
  test('onboarding Route is exactly [FO.BLACK_BIRD_FIELD]', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { realOnboarding: true, reduced: true });
    const s = await appState(page);
    expect(s.routeIds).toEqual(['FO.BLACK_BIRD_FIELD']);
  });

  test('direct graph sequence CORPSE -> BURIAL -> ALLAH -> CAIN adds exactly those four events, no RelO insertion', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.BURIAL');
    await clickNode(page, 'FO.ALLAH');
    await clickNode(page, 'FO.CAIN');
    const s = await appState(page);
    expect(s.routeIds).toEqual([
      'FO.BLACK_BIRD_FIELD',
      'FO.CORPSE',
      'FO.BURIAL',
      'FO.ALLAH',
      'FO.CAIN',
    ]);
    await noGeometryErrors(page);
  });

  test('Route replay (route-strip click) changes focus and adds zero events', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.BURIAL');
    const before = await appState(page);
    expect(before.routeIds.length).toBe(3);
    await page.evaluate(() => {
      const btn = document.querySelector('#route .route-item[data-id="FO.CORPSE"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(150);
    const after = await appState(page);
    expect(after.activeId).toBe('FO.CORPSE');
    expect(after.routeIds).toEqual(before.routeIds);
  });

  test('Solo adds zero Route events regardless of target', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    const before = await appState(page);
    await page.evaluate(() => {
      window.__bbTest.openIndex('all');
    });
    await page.locator('[data-solo="FO.BURIAL"]').click();
    await page.waitForTimeout(200);
    const after = await appState(page);
    expect(after.routeIds).toEqual(before.routeIds);
    expect(after.soloIds).toContain('FO.BURIAL');
  });

  test('View/About/Field-Read changes add zero Route events', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    const before = await appState(page);
    const btn = page.locator('[data-action="about"]').first();
    await btn.click();
    await page.locator('#aboutClose').click();
    await page.evaluate(() => {
      window.__bbTest.openDrawer('fieldViewDrawer');
      window.__bbTest.closeAllDrawers();
    });
    const after = await appState(page);
    expect(after.routeIds).toEqual(before.routeIds);
  });

  test('same-ID activation adds zero events', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    const before = await appState(page);
    await clickNode(page, 'FO.CORPSE');
    const after = await appState(page);
    expect(after.routeIds).toEqual(before.routeIds);
  });

  test('Route event sources and from-fields match the committed sequence', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { realOnboarding: true, reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.BURIAL');
    const events = await page.evaluate(() => window.__bbState.routeEvents);
    expect(events[0].id).toBe('FO.BLACK_BIRD_FIELD');
    expect(events[0].source).toBe('onboarding');
    expect(events[0].from).toBeNull();
    expect(events[1].id).toBe('FO.CORPSE');
    expect(events[1].from).toBe('FO.BLACK_BIRD_FIELD');
    expect(events[2].id).toBe('FO.BURIAL');
    expect(events[2].from).toBe('FO.CORPSE');
  });

  test('computeSoloSet(RelO) equals the RelO plus its canonical participants', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    const set = await page.evaluate(() => [...window.__bbTest.computeSoloSet('RelO.R4CB4A8D8')].sort());
    expect(set).toEqual(
      [
        'RelO.R4CB4A8D8',
        'FO.BLACK_BIRD_FIELD',
        'NameO.AR.GHURAB',
        'FO.ALLAH',
        'FO.CAIN',
        'FO.CORPSE',
        'FO.BURIAL',
      ].sort(),
    );
  });

  test('object Solo membership equals object + containing RelOs + their participants', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    const result = await page.evaluate(() => {
      const set = window.__bbTest.computeSoloSet('FO.CORPSE');
      const relIds = Object.entries(DATA.relations)
        .filter(([, parts]) => parts.includes('FO.CORPSE'))
        .map(([rid]) => rid);
      const expected = new Set(['FO.CORPSE']);
      for (const rid of relIds) {
        expected.add(rid);
        for (const pid of DATA.relations[rid] || []) expected.add(pid);
      }
      return { actual: [...set].sort(), expected: [...expected].sort() };
    });
    expect(result.actual).toEqual(result.expected);
  });

  test('Route unchanged on entering and exiting Solo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page);
    await clickNode(page, 'FO.CORPSE');
    const before = await appState(page);
    await page.evaluate(() => {
      window.__bbTest.openIndex('all');
    });
    await page.locator('[data-solo="RelO.R4CB4A8D8"]').click();
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__bbTest.openDrawer('fieldViewDrawer'));
    await page.locator('#restoreField').click();
    await page.waitForTimeout(200);
    const after = await appState(page);
    expect(after.routeIds).toEqual(before.routeIds);
  });
});
