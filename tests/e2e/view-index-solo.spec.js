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
    const beforeVisibility = await page.evaluate(() => ({ ...window.__bbTest.getState().view.objectVisibility }));

    // Replay via the route strip's most recent non-current item.
    const items = page.locator('#route .route-item');
    const count = await items.count();
    if (count > 1) await items.nth(count - 2).click();

    const afterVisibility = await page.evaluate(() => ({ ...window.__bbTest.getState().view.objectVisibility }));
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

  test('Index search by label filters to matching objects (P-SCN-040)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    // "Battlefield" appears in exactly one node's label or id (FO.BATTLEFIELD).
    await page.locator('#objectSearch').fill('Battlefield');
    await expect(page.locator('.object-row [data-open="FO.BATTLEFIELD"]')).toBeVisible();
    const rows = await page.locator('#objectList .object-row').count();
    expect(rows).toBe(1);
  });

  test('Index search by opaque id filters to the matching object (P-SCN-041)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('#objectSearch').fill('FO.CORPSE');
    await expect(page.locator('.object-row [data-open="FO.CORPSE"]')).toBeVisible();
    const rows = await page.locator('#objectList .object-row').count();
    expect(rows).toBe(1);
  });

  test('opening a visible object from the Index commits it and closes the drawer (P-SCN-043)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('#objectSearch').fill('Cain');
    const openLink = page.locator('[data-open="FO.CAIN"]').first();
    await expect(openLink).toBeVisible();
    await openLink.click();
    await expect(page.locator('#objectDrawer')).not.toHaveClass(/open/);
    const state = await appState(page);
    expect(state.activeId).toBe('FO.CAIN');
  });

  test('Index search normalizes case, surrounding whitespace, and matches source-script text (P-SCN-107)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    const search = page.locator('#objectSearch');

    await search.fill('cAiN');
    await expect(page.locator('.object-row [data-open="FO.CAIN"]')).toBeVisible();

    await search.fill('  cain  ');
    await expect(page.locator('.object-row [data-open="FO.CAIN"]')).toBeVisible();

    await search.fill('غراب');
    await expect(page.locator('.object-row [data-open="NameO.AR.GHURAB"]')).toBeVisible();
  });

  test('entering Solo (live app) creates no Route or trace history (P-RULE-012)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const before = await page.evaluate(() => ({
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
    }));

    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('#objectSearch').fill('Cain');
    const soloBtn = page.locator('[data-solo="FO.CAIN"]').first();
    await expect(soloBtn).toBeVisible();
    await soloBtn.click();

    const after = await page.evaluate(() => ({
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
      soloActive: window.__bbTest.getState().solo.active,
    }));
    expect(after.soloActive).toBe(true);
    expect(after.route).toBe(before.route);
    expect(after.wear).toBe(before.wear);
  });

  test('a Reader link to an individually hidden object still commits it safely (P-SCN-108)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await page.locator('#objectSearch').fill('Abel');
    await page.locator('[data-eye="FO.ABEL"]').first().click();
    await expect
      .poll(() => page.evaluate(() => window.__bbTest.getState().view.objectVisibility['FO.ABEL']))
      .toBe(false);
    await page.locator('[data-close="objectDrawer"]').first().click();

    // .fl inline links only exist in RNO/MNO body text, not FO panels — this
    // RNO's body links to FO.ABEL (verified against canonical-data.js).
    await clickNode(page, 'RNO.GHURAB_BURIAL__424A0ECF');
    const link = page.locator('#reader .fl[data-id="FO.ABEL"]').first();
    await expect(link).toBeVisible();
    await link.click();

    const state = await appState(page);
    expect(state.activeId, 'a Reader link commits its target even if View currently hides it').toBe('FO.ABEL');
  });

  test('a Reader link to a group-hidden object still commits it safely (P-SCN-109)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-type="FO"]').first().click(); // group-hide every FO
    await expect
      .poll(() => page.evaluate(() => window.__bbTest.getState().view.typeVisibility['FO']))
      .toBe(false);
    // Hiding the FO group hides the currently-active FO.BLACK_BIRD_FIELD too,
    // which auto-triggers returnToField() (setObjectGroup's own active-
    // hidden-by-filter guard) — that closes the drawer itself; don't race it
    // with a second manual close.
    await expect(page.locator('#fieldViewDrawer')).not.toHaveClass(/open/);

    // RNO nodes aren't type FO, so they stay visible/clickable and its body
    // still links to FO.ABEL even though every FO is now group-hidden.
    await clickNode(page, 'RNO.GHURAB_BURIAL__424A0ECF');
    const link = page.locator('#reader .fl[data-id="FO.ABEL"]').first();
    await expect(link).toBeVisible();
    await link.click();

    const state = await appState(page);
    expect(state.activeId).toBe('FO.ABEL');
  });

  test('the projected-edge generator list opens a hidden RelO safely (P-SCN-110)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await page.locator('#objectSearch').fill('RelO.R7080EA25');
    await page.locator('[data-eye="RelO.R7080EA25"]').first().click();
    await expect
      .poll(() => page.evaluate(() => window.__bbTest.getState().view.objectVisibility['RelO.R7080EA25']))
      .toBe(false);
    await page.locator('[data-close="objectDrawer"]').first().click();

    await clickNode(page, 'FO.CAIN');
    const genLink = page.locator('#reader .index-item[data-id="RelO.R7080EA25"]').first();
    await expect(genLink).toBeVisible();
    await genLink.click();

    const state = await appState(page);
    expect(state.activeId).toBe('RelO.R7080EA25');
  });

  test('entering Solo reveals a core that was individually or group hidden (P-SCN-111)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await page.locator('#objectSearch').fill('Cain');
    await page.locator('[data-eye="FO.CAIN"]').first().click();
    await expect
      .poll(() => page.evaluate(() => window.__bbTest.getState().view.objectVisibility['FO.CAIN']))
      .toBe(false);
    expect(await page.evaluate(() => window.__bbTest.nodeVisible('FO.CAIN'))).toBe(false);

    const soloBtn = page.locator('[data-solo="FO.CAIN"]').first();
    await expect(soloBtn).toBeVisible();
    await soloBtn.click();

    const visibleUnderSolo = await page.evaluate(() => window.__bbTest.nodeVisible('FO.CAIN'));
    expect(visibleUnderSolo, 'Solo membership supersedes View hides for every member (P-RULE-012/013)').toBe(true);
  });

  test('group-hiding the field-focused object type returns to the whole field (P-SCN-047)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    expect((await appState(page)).activeId).toBe('FO.CORPSE');

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-type="FO"]').first().click(); // group-hide every FO, including the active one

    // setObjectGroup's own active-hidden-by-filter guard fires returnToField().
    await expect.poll(async () => (await appState(page)).activeId).toBeNull();
    const state = await appState(page);
    expect(state.phase).toBe('field');
  });

  test('attempting to hide the Solo core while Solo is active has no visible effect (P-SCN-048)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await page.locator('#objectSearch').fill('Cain');
    const soloBtn = page.locator('[data-solo="FO.CAIN"]').first();
    await expect(soloBtn).toBeVisible();
    await soloBtn.click();
    expect(await page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);

    await page.locator('.rail-btn[data-action="index"]').click();
    await page.locator('#objectSearch').fill('Cain');
    await page.locator('[data-eye="FO.CAIN"]').first().click();
    // The eye toggle still records the individual-hide preference...
    expect(await page.evaluate(() => window.__bbTest.getState().view.objectVisibility['FO.CAIN'])).toBe(false);
    // ...but nodeVisible's Solo branch (S.soloSet.has(id)) supersedes it
    // entirely while Solo is active, so the core stays visible (P-RULE-012/013).
    expect(await page.evaluate(() => window.__bbTest.nodeVisible('FO.CAIN'))).toBe(true);
  });

  test('toggling projected edges off hides every projected-edge line; toggling back on restores them (P-SCN-051)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    const countVisibleProj = () =>
      page.evaluate(
        () => [...document.querySelectorAll('.link-proj')].filter((el) => el.getAttribute('display') !== 'none').length
      );
    const total = await page.locator('.link-proj').count();
    expect(total).toBeGreaterThan(0);
    const visibleBefore = await countVisibleProj();
    expect(visibleBefore).toBeGreaterThan(0);

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="projected"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.projectedEdges)).toBe(false);
    expect(await countVisibleProj()).toBe(0);

    await page.locator('[data-view="projected"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.projectedEdges)).toBe(true);
    expect(await countVisibleProj()).toBe(visibleBefore);
  });

  test('toggling labels off hides every node label; toggling source names hides/shows only NameO labels (P-SCN-052)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const visibleLabelCount = () =>
      page.evaluate(
        () => [...document.querySelectorAll('text.node-label')].filter((el) => el.getAttribute('display') !== 'none').length
      );
    const visibleBefore = await visibleLabelCount();
    expect(visibleBefore).toBeGreaterThan(0);

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="labels"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.labels)).toBe(false);
    expect(await visibleLabelCount()).toBe(0);

    await page.locator('[data-view="labels"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.labels)).toBe(true);
    expect(await visibleLabelCount()).toBe(visibleBefore);
    await page.locator('[data-close="fieldViewDrawer"]').first().click();

    // sourceNames gates only NameO labels, independent of the labels toggle
    // above -- and unconditionally, even for a focused/active NameO node (the
    // filter in updateLabelVisibility excludes NameO before priority/budget
    // is ever considered when sourceNames is off). Focusing a NameO node
    // directly, rather than counting the whole field, avoids any dependency
    // on the label budget/priority interaction with other node types.
    await clickNode(page, 'NameO.AR.GHURAB');
    expect((await appState(page)).activeId).toBe('NameO.AR.GHURAB');
    const nameOLabelDisplay = () =>
      page.evaluate(() => document.querySelector('g.node[data-bb-test-id="NameO.AR.GHURAB"] text.node-label')?.getAttribute('display'));
    expect(await nameOLabelDisplay()).toBe('none');

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);
    await expect.poll(nameOLabelDisplay).not.toBe('none');

    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(false);
    await expect.poll(nameOLabelDisplay).toBe('none');
  });

  test('Solo survives a resize with membership and Route/trace untouched (P-SCN-056)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="index"]').click();
    await page.locator('#objectSearch').fill('Cain');
    const soloBtn = page.locator('[data-solo="FO.CAIN"]').first();
    await expect(soloBtn).toBeVisible();
    await soloBtn.click();
    const before = await page.evaluate(() => ({
      soloIds: (window.__bbTest.getState().solo.members || []).slice().sort(),
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
    }));
    expect(before.soloIds.length).toBeGreaterThan(0);

    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForTimeout(80);

    const after = await page.evaluate(() => ({
      soloIds: (window.__bbTest.getState().solo.members || []).slice().sort(),
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
    }));
    expect(after.soloIds).toEqual(before.soloIds);
    expect(after.route).toBe(before.route);
    expect(after.wear).toBe(before.wear);
  });
});
