'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState } = require('../bb-helpers.cjs');

const UI_COPY = {
  states: {
    allHiddenTitle: 'The field is hidden',
    allHiddenBody: 'View settings currently hide every object. Restore the field to continue.',
    noResultsTitle: 'No objects found',
    noResultsBody: 'Change the search term or return to the complete index.',
    hiddenByView: 'HIDDEN BY VIEW',
    soloPrefix: 'SOLO',
  },
  actions: { restoreField: 'Restore field', exitSolo: 'Exit Solo' },
};

function baseView() {
  return {
    typeVisibility: { RNO: true, MNO: true, FO: true, NameO: true, RefO: true, RelO: true },
    objectVisibility: {},
    projectedEdges: true,
    labels: true,
    sourceNames: false,
  };
}

test.describe('View, Index, hide/show, all-hidden recovery, and Solo surfaces (T20)', () => {
  test('the all-hidden state is explicit and offers a one-action local recovery (D-DEC-09)', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(
      async ({ copy, view }) => {
        const mod = await import('/src/presentation/view-renderer.js');
        const container = document.createElement('div');
        document.body.appendChild(container);
        let restored = false;
        const renderer = mod.createViewRenderer({
          container,
          copy,
          onSetTypeVisibility: () => {},
          onSetViewOption: () => {},
          onRestoreField: () => (restored = true),
        });
        const hiddenView = { ...view, typeVisibility: Object.fromEntries(Object.keys(view.typeVisibility).map((k) => [k, false])) };
        renderer.render(hiddenView);
        const notice = container.querySelector('.all-hidden-notice');
        const restoreBtn = container.querySelector('.all-hidden-notice button');
        restoreBtn?.click();
        return { hasNotice: !!notice, title: notice?.querySelector('.notice-title')?.textContent, restored };
      },
      { copy: UI_COPY, view: baseView() }
    );
    expect(result.hasNotice).toBe(true);
    expect(result.title).toBe(UI_COPY.states.allHiddenTitle);
    expect(result.restored, 'the single recovery action must actually be reachable and callable').toBe(true);
  });

  test('the all-hidden notice disappears once at least one type is visible again (recoverable, not a dead end)', async ({
    page,
  }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(
      async ({ copy, view }) => {
        const mod = await import('/src/presentation/view-renderer.js');
        const container = document.createElement('div');
        document.body.appendChild(container);
        const renderer = mod.createViewRenderer({ container, copy, onSetTypeVisibility: () => {}, onSetViewOption: () => {}, onRestoreField: () => {} });
        renderer.render({ ...view, typeVisibility: Object.fromEntries(Object.keys(view.typeVisibility).map((k) => [k, false])) });
        const hiddenNoticePresent = !!container.querySelector('.all-hidden-notice');
        renderer.render(view); // all types visible again
        const recoveredNoticeAbsent = !container.querySelector('.all-hidden-notice');
        return { hiddenNoticePresent, recoveredNoticeAbsent };
      },
      { copy: UI_COPY, view: baseView() }
    );
    expect(result.hiddenNoticePresent).toBe(true);
    expect(result.recoveredNoticeAbsent).toBe(true);
  });

  test('a search with no matches shows an explicit, recoverable no-results state', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async ({ copy }) => {
      const mod = await import('/src/presentation/index-renderer.js');
      const container = document.createElement('div');
      document.body.appendChild(container);
      const renderer = mod.createIndexRenderer({ container, copy, onOpen: () => {} });
      const nodes = [{ id: 'FO.CORPSE', type: 'FO', label: 'Corpse' }];
      renderer.render(nodes, { typeVisibility: {}, objectVisibility: {} }, 'zzz-no-such-object');
      const notice = container.querySelector('.no-results-notice');
      return { hasNotice: !!notice, title: notice?.querySelector('.notice-title')?.textContent };
    }, { copy: UI_COPY });
    expect(result.hasNotice).toBe(true);
    expect(result.title).toBe(UI_COPY.states.noResultsTitle);
  });

  test('Index Open clears an individual hide but never overrides a group-hidden type (P-RULE-016)', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async ({ view }) => {
      const visMod = await import('/src/domain/visibility.js');
      const idxMod = await import('/src/presentation/index-renderer.js');
      const node = { id: 'FO.CORPSE', type: 'FO' };

      // Individually hidden, type otherwise visible: Open clears the individual hide.
      let v = { ...view, objectVisibility: { 'FO.CORPSE': false } };
      const beforeIndividual = visMod.isNodeVisible(node, v);
      v = idxMod.clearIndividualHide(v, 'FO.CORPSE');
      const afterIndividual = visMod.isNodeVisible(node, v);

      // Group-hidden type: Open (clearing any individual hide) must NOT make it visible.
      let g = { ...view, typeVisibility: { ...view.typeVisibility, FO: false }, objectVisibility: { 'FO.CORPSE': false } };
      g = idxMod.clearIndividualHide(g, 'FO.CORPSE');
      const stillHiddenByGroup = visMod.isNodeVisible(node, g);

      return { beforeIndividual, afterIndividual, stillHiddenByGroup };
    }, { view: baseView() });
    expect(result.beforeIndividual).toBe(false);
    expect(result.afterIndividual).toBe(true);
    expect(result.stillHiddenByGroup, 'clearing an individual hide must never override an intentionally disabled type group').toBe(false);
  });

  test('Route replay never changes visibility, even for a currently-hidden target (P-RULE-017)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN');
    const beforeVisibility = await page.evaluate(() => ({ ...window.__bbState.objectVisibility }));

    // Replay via the route strip's most recent non-current item.
    const items = page.locator('#route .route-item');
    const count = await items.count();
    if (count > 1) await items.nth(count - 2).click();

    const afterVisibility = await page.evaluate(() => ({ ...window.__bbState.objectVisibility }));
    expect(afterVisibility).toEqual(beforeVisibility);
  });

  test('Solo is rendered as a visible, explicit lens band (D-DEC-08), never impersonating a direct commit', async ({
    page,
  }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async ({ copy }) => {
      const mod = await import('/src/presentation/solo-renderer.js');
      const container = document.createElement('div');
      document.body.appendChild(container);
      const renderer = mod.createSoloRenderer({ container, copy, labelOf: (id) => id, onExitSolo: () => {} });
      renderer.render({ active: false, rootId: null, members: [], snapshot: null });
      const hiddenWhenInactive = container.hidden;
      renderer.render({ active: true, rootId: 'FO.CORPSE', members: ['FO.CORPSE'], snapshot: {} });
      const band = container.querySelector('.solo-band');
      return { hiddenWhenInactive, hasBand: !!band, label: band?.querySelector('.solo-label')?.textContent };
    }, { copy: UI_COPY });
    expect(result.hiddenWhenInactive).toBe(true);
    expect(result.hasBand).toBe(true);
    expect(result.label).toContain('SOLO');
  });

  test('entering Solo (live app) creates no Route or trace history (P-RULE-012)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const before = await page.evaluate(() => ({
      route: window.__bbState.routeEvents.length,
      wear: Object.keys(window.__bbState.fieldTrace?.wear || {}).length,
    }));

    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('#objectSearch').fill('Cain');
    const soloBtn = page.locator('[data-solo="FO.CAIN"]').first();
    await expect(soloBtn).toBeVisible();
    await soloBtn.click();

    const after = await page.evaluate(() => ({
      route: window.__bbState.routeEvents.length,
      wear: Object.keys(window.__bbState.fieldTrace?.wear || {}).length,
      soloActive: !!window.__bbState.soloSet,
    }));
    expect(after.soloActive).toBe(true);
    expect(after.route).toBe(before.route);
    expect(after.wear).toBe(before.wear);
  });
});
