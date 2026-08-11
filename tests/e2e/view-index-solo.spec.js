'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, appState, tagNodes } = require('../bb-helpers.cjs');

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

  test('Source Names toggle actually renders a NameO label from the real default whole-field state, not only when a NameO is already focused (P-SCN-052 regression)', async ({
    page,
  }) => {
    // Unlike the test above (which pre-focuses NameO.AR.GHURAB before
    // toggling, so it always wins the label budget at tier 1), this exercises
    // the toggle exactly as a typical reader would reach for it: fresh field,
    // nothing focused, default zoom. updateLabelVisibility ranks label
    // candidates by priority tier and only renders the first N (a budget);
    // all 4 NameO nodes previously ranked below every ordinary FO node, so
    // they never won a budget slot here and the toggle visibly did nothing.
    await gotoField(page, { reduced: true });
    await tagNodes(page); // no clickNode() in this test to tag g.node elements implicitly
    const defaultActiveId = (await appState(page)).activeId; // FO.BLACK_BIRD_FIELD, the aperture -- not a NameO
    const visibleNameOLabelCount = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('g.node[data-bb-test-id^="NameO."] text.node-label')].filter(
            (el) => el.getAttribute('display') !== 'none'
          ).length
      );
    expect(await visibleNameOLabelCount()).toBe(0);

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);
    await expect.poll(visibleNameOLabelCount).toBeGreaterThan(0);
    expect((await appState(page)).activeId).toBe(defaultActiveId); // no incidental focus change caused this

    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(false);
    await expect.poll(visibleNameOLabelCount).toBe(0);
  });

  test('NameO Object-groups toggle now has a real, independent visible effect: the mark itself, regardless of Source Names (design decision, closes the audit-flagged gap)', async ({
    page,
  }) => {
    // Before this design decision, NameO had no visible geometric body at
    // all -- with Source Names off (the default), the "NameO (4)" toggle in
    // View -> Object groups was a genuine no-op (nothing to hide or show).
    // NameO now has its own small body (the smallest of all six types), so
    // this toggle has the same real, independent effect every other type's
    // toggle already has -- decoupled from Source Names, which continues to
    // control only the label text.
    await gotoField(page, { reduced: true });
    await tagNodes(page);
    const nameoIds = ['NameO.AR.GHURAB', 'NameO.ON.HRAFN', 'NameO.OI.SCALD_CROW', 'NameO.EN.AMERICAN_CROW'];
    const visibleNameOBodyCount = () =>
      page.evaluate(
        (ids) =>
          ids.filter((id) => {
            const g = document.querySelector(`g.node[data-bb-test-id="${id}"]`);
            return g && getComputedStyle(g).opacity !== '0' && g.querySelector('.bb-nameo-mark');
          }).length,
        nameoIds
      );
    expect(await page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(false);
    expect(await visibleNameOBodyCount(), 'all 4 NameO marks visible by default, with Source Names off').toBe(4);

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-type="NameO"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.typeVisibility.NameO)).toBe(false);
    await expect.poll(visibleNameOBodyCount, 'toggling the type off must genuinely hide every NameO mark').toBe(0);

    await page.locator('[data-type="NameO"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.typeVisibility.NameO)).toBe(true);
    await expect.poll(visibleNameOBodyCount, 'toggling back on must restore every NameO mark').toBe(4);
    await page.locator('[data-close="fieldViewDrawer"]').first().click();

    // Source Names still governs only the label -- unaffected by the body.
    const nameoLabelDisplay = () =>
      page.evaluate(
        () => document.querySelector('g.node[data-bb-test-id="NameO.AR.GHURAB"] text.node-label')?.getAttribute('display')
      );
    expect(await nameoLabelDisplay()).toBe('none');
    await page.locator('.rail-btn[data-action="view"]').click();
    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);
    await expect.poll(nameoLabelDisplay).not.toBe('none');
    expect(await visibleNameOBodyCount(), 'the mark stays visible with Source Names on too').toBe(4);
  });

  test('Source Names has the same real, visible effect on mobile as on desktop (FQ-02 Scenario A)', async ({ page }) => {
    // The default-state Source Names fix (P-SCN-052 regression, above) was
    // only ever exercised at desktop viewport. Mobile uses the same
    // fieldViewDrawer component (opened via the bottom-nav's
    // [data-mobile="view"] instead of the rail), and updateLabelVisibility's
    // label budget is viewport-dependent (labelBudget() halves roughly for
    // isMobile()) -- a real, distinct code path worth its own proof rather
    // than assuming desktop coverage transfers.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { mobile: true, reduced: true });
    const before = await page.evaluate(() => ({
      sourceNames: window.__bbTest.getState().view.sourceNames,
      labels: window.__bbTest.getState().view.labels,
      activeId: window.__bbTest.getUiRuntime().focusedId,
      routeLen: window.__bbTest.getState().history.route.length,
      trace: window.__bbTest.getState().trace,
      readerSubject: window.__bbTest.getState().reading.readerSubject,
    }));
    expect(before.sourceNames).toBe(false);
    expect(before.labels).toBe(true);

    const visibleNameOLabelCount = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('g.node[data-bb-type="NameO"] text.node-label')].filter(
            (el) => el.getAttribute('display') !== 'none'
          ).length
      );
    expect(await visibleNameOLabelCount()).toBe(0);

    await page.locator('.bottom-nav [data-mobile="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);
    await expect.poll(visibleNameOLabelCount, 'turning Source Names on must render at least one NameO label on mobile too').toBeGreaterThan(0);

    const after = await page.evaluate(() => ({
      activeId: window.__bbTest.getUiRuntime().focusedId,
      routeLen: window.__bbTest.getState().history.route.length,
      trace: window.__bbTest.getState().trace,
      readerSubject: window.__bbTest.getState().reading.readerSubject,
    }));
    expect(after.activeId, 'Source Names must not mutate focus').toBe(before.activeId);
    expect(after.routeLen, 'Source Names must not append Route history').toBe(before.routeLen);
    expect(after.trace, 'Source Names must not mutate trace/wear/afterglow').toEqual(before.trace);
    expect(after.readerSubject, 'Source Names must not change the Reader subject').toEqual(before.readerSubject);

    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(false);
    await expect.poll(visibleNameOLabelCount).toBe(0);
  });

  test('global Labels dominates Source Names: turning Labels off hides NameO labels too, and restoring Labels with Source Names still on brings them back (FQ-02 Scenario B)', async ({
    page,
  }) => {
    // updateLabelVisibility's filter chain checks `!state.view.labels` before
    // the sourceNames/NameO check, so this is structurally guaranteed by
    // code order -- but that guarantee was never exercised through a real UI
    // sequence combining both toggles, only each in isolation (P-SCN-052
    // above toggles Labels and Source Names as two separate, non-overlapping
    // sub-tests).
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);

    const visibleNameOLabelCount = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('g.node[data-bb-type="NameO"] text.node-label')].filter(
            (el) => el.getAttribute('display') !== 'none'
          ).length
      );
    await expect.poll(visibleNameOLabelCount).toBeGreaterThan(0);

    await page.locator('[data-view="labels"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.labels)).toBe(false);
    await expect.poll(visibleNameOLabelCount, 'Labels off must hide NameO labels too, even with Source Names still on').toBe(0);
    expect(await page.evaluate(() => window.__bbTest.getState().view.sourceNames), 'Labels off must not itself flip Source Names').toBe(
      true
    );

    await page.locator('[data-view="labels"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.labels)).toBe(true);
    await expect.poll(
      visibleNameOLabelCount,
      'restoring Labels with Source Names still on must bring NameO labels back without re-toggling Source Names'
    ).toBeGreaterThan(0);
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
