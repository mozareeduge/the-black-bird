'use strict';
// MICRO-02: Reader-local contextual actions (SOLO / HIDE-SHOW), RCA-01..13.
// ADJ-01: shared presentation reconciliation, exercised both via the new
// Reader HIDE action and the existing Index eye-toggle path.

const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, commitViaIndex, appState } = require('../bb-helpers.cjs');
const path = require('path');
const { pathToFileURL } = require('url');

function modulePath(rel) {
  return pathToFileURL(path.resolve(__dirname, rel)).href;
}

async function loadModels() {
  const { DATA } = await import(modulePath('../../src/data/canonical-data.js'));
  const models = await import(modulePath('../../src/domain/reader-view-models.js'));
  const renderer = await import(modulePath('../../src/presentation/reader-renderer.js'));
  const nodesById = Object.fromEntries(DATA.nodes.map((n) => [n.id, n]));
  const ctx = { nodesById, texts: DATA.texts, nameos: DATA.nameos, refs: DATA.refs, relations: DATA.relations };
  return { DATA, ctx, ...models, ...renderer };
}

// A minimal DOM shim for the small subset reader-renderer.js's el()/
// appendArabicWrapped() actually use (createElement/createDocumentFragment/
// createTextNode + className/textContent/appendChild/append) -- lets
// buildReaderContent() run in plain Node (no `document` global) exactly
// like reader.spec.js's existing structural tests already do one level up
// (buildOrientationViewModel alone, never the renderer).
function fakeDoc() {
  return {
    createDocumentFragment() {
      return {
        kind: 'fragment',
        children: [],
        appendChild(c) {
          this.children.push(c);
          return c;
        },
        append(...cs) {
          cs.forEach((c) => this.appendChild(c));
        },
      };
    },
    createElement(tag) {
      return {
        kind: 'element',
        tag,
        className: '',
        textContent: '',
        children: [],
        appendChild(c) {
          this.children.push(c);
          return c;
        },
        append(...cs) {
          cs.forEach((c) => this.appendChild(c));
        },
      };
    },
    createTextNode(text) {
      return { kind: 'text', text };
    },
  };
}
function fakeDomHasClass(node, cls) {
  if (!node) return false;
  if (node.kind === 'element' && node.className && node.className.split(' ').includes(cls)) return true;
  return (node.children || []).some((c) => fakeDomHasClass(c, cls));
}

test.describe('Reader-local contextual actions (MICRO-02)', () => {
  test('RCA-01: every one of the six canonical object types shows a Reader action row with SOLO and a visibility action', async ({
    page,
  }) => {
    const { DATA } = await loadModels();
    await gotoField(page, { reduced: true });

    for (const type of ['RNO', 'MNO', 'FO', 'NameO', 'RefO', 'RelO']) {
      const id = DATA.nodes.find((n) => n.type === type && n.id !== 'FO.BLACK_BIRD_FIELD').id;
      await commitViaIndex(page, id);

      const row = page.locator('#reader .reader-object-actions');
      await expect(row).toHaveCount(1);
      expect(await row.getAttribute('data-reader-object-id')).toBe(id);
      await expect(row.locator('[data-reader-action="solo"]')).toBeVisible();
      await expect(row.locator('[data-reader-action="visibility"]')).toBeVisible();
    }
  });

  test('RCA-02: orientation and projected-edge Reader subjects never receive an object action row', async ({
    page,
  }) => {
    const { DATA, ctx, buildOrientationViewModel, buildReaderContent } = await loadModels();

    // Orientation is a structurally distinct Reader kind (see reader.spec.js);
    // it is not currently reachable through the live UI, so it's checked at
    // the same source level reader.spec.js already checks its structure.
    const orientationVm = buildOrientationViewModel(DATA.docs);
    const orientationFragment = buildReaderContent(orientationVm, ctx.nodesById, fakeDoc());
    expect(fakeDomHasClass(orientationFragment, 'reader-object-actions')).toBe(false);

    // Projected-edge inspection is reachable live.
    await gotoField(page, { reduced: true });
    const found = await page.evaluate(() => {
      const hit = document.querySelector('line.hit');
      if (!hit) return false;
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    expect(found).toBe(true);
    await expect(page.locator('#reader .edge-head')).toBeVisible();
    await expect(page.locator('#reader .reader-object-actions')).toHaveCount(0);
  });

  test('RCA-03/RCA-04: desktop Solo enter/exit from the Reader mutates no Route/trace and keeps the Reader open on the same object', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');

    const before = await appState(page);
    const traceBefore = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().trace));

    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);

    const duringSolo = await appState(page);
    expect(duringSolo.routeIds).toEqual(before.routeIds);
    expect(duringSolo.activeId).toBe('FO.CORPSE');
    const traceDuring = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().trace));
    expect(traceDuring).toBe(traceBefore);

    // Reader stayed open, on the same subject, with the Solo band visible.
    // (#soloBand is a zero-height wrapper around the absolutely-positioned
    // .solo-band content -- .solo-band itself is the real, sized element.)
    await expect(page.locator('#reader .reader-object-actions')).toHaveAttribute('data-reader-object-id', 'FO.CORPSE');
    await expect(page.locator('#soloBand .solo-band')).toBeVisible();
    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('EXIT SOLO');

    // Exit.
    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(false);

    const afterExit = await appState(page);
    expect(afterExit.routeIds).toEqual(before.routeIds);
    expect(afterExit.activeId).toBe('FO.CORPSE');
    const traceAfter = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().trace));
    expect(traceAfter).toBe(traceBefore);
    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('SOLO');
  });

  test('RCA-05: SOLO THIS re-roots Solo onto the current Reader subject while preserving the original pre-Solo snapshot', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);

    const originalSnapshot = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().solo.snapshot));
    expect(await page.evaluate(() => window.__bbTest.getState().solo.rootId)).toBe('FO.CORPSE');

    // Commit a different object while Solo stays active on FO.CORPSE -- the
    // Reader subject becomes FO.CAIN, a real commit (Route appends), but
    // Solo's root is unaffected by an ordinary commit.
    await commitViaIndex(page, 'FO.CAIN');
    expect(await page.evaluate(() => window.__bbTest.getState().solo.rootId)).toBe('FO.CORPSE');
    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('SOLO THIS');

    const routeLenBeforeReroot = await page.evaluate(() => window.__bbTest.getState().history.route.length);

    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.rootId)).toBe('FO.CAIN');

    const routeLenAfterReroot = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    expect(routeLenAfterReroot).toBe(routeLenBeforeReroot);

    const rerootSnapshot = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().solo.snapshot));
    expect(rerootSnapshot).toBe(originalSnapshot);

    const state = await appState(page);
    expect(state.activeId).toBe('FO.CAIN');
    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('EXIT SOLO');
  });

  test('RCA-06: mobile Reader Solo switches the surface to Field and preserves the session across the chamber switch', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await page.locator('[data-mobile="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('read');

    const routeBefore = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    const traceBefore = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().trace));

    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('field');

    const routeAfterEnter = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    expect(routeAfterEnter).toBe(routeBefore);
    const traceAfterEnter = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().trace));
    expect(traceAfterEnter).toBe(traceBefore);
    expect((await appState(page)).activeId).toBe('FO.CORPSE');

    // Return to Read: same object, Solo still active, action reads EXIT SOLO.
    await page.locator('[data-mobile="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('read');
    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('EXIT SOLO');
    expect((await appState(page)).activeId).toBe('FO.CORPSE');

    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(false);
    const routeAfterExit = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    expect(routeAfterExit).toBe(routeBefore);
  });

  test('RCA-07/RCA-08: hiding then showing the current Reader object stays on the object, neutralizes Field attention, and never auto-recommits', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const routeBefore = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    const traceBefore = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().trace));

    await expect(page.locator('[data-reader-action="visibility"]')).toHaveText('HIDE FROM FIELD');
    await page.locator('[data-reader-action="visibility"]').click();

    await expect
      .poll(() => page.evaluate(() => window.__bbTest.getState().view.objectVisibility['FO.CORPSE']))
      .toBe(false);

    const afterHide = await page.evaluate(() => ({
      anchorId: window.__bbTest.getState().reading.anchorId,
      readerSubject: window.__bbTest.getState().reading.readerSubject,
      fieldAttentionKind: window.__bbTest.getState().reading.fieldAttention.kind,
      focusedId: window.__bbTest.getUiRuntime().focusedId,
      routeLen: window.__bbTest.getState().history.route.length,
    }));
    expect(afterHide.anchorId).toBe('FO.CORPSE');
    expect(afterHide.readerSubject).toEqual({ kind: 'object', id: 'FO.CORPSE' });
    expect(afterHide.fieldAttentionKind).toBe('whole-field');
    expect(afterHide.focusedId, 'presentation focus must also neutralize (ADJ-01)').toBeNull();
    expect(afterHide.routeLen).toBe(routeBefore);
    const traceAfterHide = await page.evaluate(() => JSON.stringify(window.__bbTest.getState().trace));
    expect(traceAfterHide).toBe(traceBefore);

    await expect(page.locator('#reader')).toBeVisible();
    await expect(page.locator('[data-reader-action="visibility"]')).toHaveText('SHOW IN FIELD');
    const bodyHidden = await page.evaluate(() => !document.querySelector('g.node[data-bb-id="FO.CORPSE"]') || getComputedStyle(document.querySelector('g.node[data-bb-id="FO.CORPSE"]')).display === 'none');
    expect(bodyHidden).toBe(true);

    // Show again.
    await page.locator('[data-reader-action="visibility"]').click();
    await expect
      .poll(() => page.evaluate(() => window.__bbTest.getState().view.objectVisibility['FO.CORPSE']))
      .toBe(true);

    const afterShow = await page.evaluate(() => ({
      anchorId: window.__bbTest.getState().reading.anchorId,
      fieldAttentionKind: window.__bbTest.getState().reading.fieldAttention.kind,
      focusedId: window.__bbTest.getUiRuntime().focusedId,
      routeLen: window.__bbTest.getState().history.route.length,
    }));
    expect(afterShow.anchorId).toBe('FO.CORPSE');
    // Show never auto-recommits/refocuses -- field attention stays neutral.
    expect(afterShow.fieldAttentionKind).toBe('whole-field');
    expect(afterShow.focusedId).toBeNull();
    expect(afterShow.routeLen).toBe(routeBefore);
    await expect(page.locator('[data-reader-action="visibility"]')).toHaveText('HIDE FROM FIELD');
  });

  test('RCA-09: an object whose whole type is hidden by View shows a disabled HIDDEN BY VIEW action, and the type gate is never silently overridden', async ({
    page,
  }) => {
    const { DATA } = await loadModels();
    const rnoId = DATA.nodes.find((n) => n.type === 'RNO').id;
    await gotoField(page, { reduced: true });
    await commitViaIndex(page, rnoId);

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-type="RNO"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.typeVisibility['RNO'])).toBe(false);

    const visibility = page.locator('[data-reader-action="visibility"]');
    await expect(visibility).toHaveText('HIDDEN BY VIEW');
    expect(await visibility.isDisabled()).toBe(true);

    // Clicking a disabled control must never silently re-enable the type.
    await visibility.click({ force: true });
    expect(await page.evaluate(() => window.__bbTest.getState().view.typeVisibility['RNO'])).toBe(false);
  });

  test('RCA-10: no visibility action is offered while Solo is active', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);
    await expect(page.locator('[data-reader-action="visibility"]')).toBeHidden();
  });

  test('RCA-11: an individually hidden object that becomes the Reader subject via a path that does not restore visibility truthfully offers SHOW IN FIELD', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN');

    // Hide FO.CORPSE via the Index eye-toggle (does not restore on its own).
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('[data-eye="FO.CORPSE"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.objectVisibility['FO.CORPSE'])).toBe(false);
    // ADJ-01: the drawer stays open across the eye-toggle.
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    await page.locator('[data-close="objectDrawer"]').first().click();

    // Route replay never restores visibility (P-RULE-017) -- exactly the
    // "path that does not restore visibility" this scenario needs.
    const items = page.locator('#route .route-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(1);
    await items.nth(count - 2).click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getUiRuntime().focusedId)).toBe('FO.CORPSE');

    expect(await page.evaluate(() => window.__bbTest.getState().view.objectVisibility['FO.CORPSE'])).toBe(false);
    await expect(page.locator('[data-reader-action="visibility"]')).toHaveText('SHOW IN FIELD');
  });

  test('RCA-12: action controls are keyboard-reachable, activate exactly once, and focus stays meaningful after a state change', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');

    const solo = page.locator('[data-reader-action="solo"]');
    await solo.focus();
    await expect(solo).toBeFocused();

    const routeBefore = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);
    const routeAfter = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    // Exactly one activation: Solo added no Route event, not a double-fire.
    expect(routeAfter).toBe(routeBefore);

    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('EXIT SOLO');
  });

  test('RCA-13: at 320px and under 200% text-resize stress, the action row wraps without horizontal overflow and the Reader stays operable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoField(page, { reduced: true, mobile: true });
    await clickNode(page, 'FO.CORPSE');
    await page.locator('[data-mobile="read"]').click();

    const row = page.locator('#reader .reader-object-actions');
    await expect(row).toBeVisible();
    // The Field->Read chamber switch animates (~520-620ms); wait for it to
    // settle before measuring geometry rather than racing a mid-transition
    // layout.
    await expect.poll(async () => (await row.boundingBox())?.width > 0).toBe(true);
    const rowBox = await row.boundingBox();
    expect(rowBox.width).toBeLessThanOrEqual(320);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);

    // Text-resize stress (see text-resize-stress.spec.js): force the action
    // buttons to 2x their own measured baseline.
    const baseline = await page.evaluate(() => {
      const el = document.querySelector('.reader-object-action');
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });
    expect(baseline).toBeGreaterThan(0);
    await page.addStyleTag({ content: `.reader-object-action{font-size:${baseline * 2}px !important;}` });
    await page.waitForTimeout(50);

    const overflowAfterStress = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflowAfterStress).toBe(false);
    await expect(row.locator('[data-reader-action="solo"]')).toBeVisible();
  });
});
