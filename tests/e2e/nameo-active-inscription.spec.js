'use strict';
// MICRO-03: active NameO linguistic inscription, NAI-01..10.

const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, commitViaIndex } = require('../bb-helpers.cjs');
const path = require('path');
const { pathToFileURL } = require('url');

function modulePath(rel) {
  return pathToFileURL(path.resolve(__dirname, rel)).href;
}

async function loadModels() {
  const { DATA } = await import(modulePath('../../src/data/canonical-data.js'));
  const fieldRenderer = await import(modulePath('../../src/presentation/field-renderer.js'));
  return { DATA, ...fieldRenderer };
}

const ALL_NAMEOS = ['NameO.AR.GHURAB', 'NameO.ON.HRAFN', 'NameO.OI.SCALD_CROW', 'NameO.EN.AMERICAN_CROW'];

async function inscriptionState(page, id) {
  return page.evaluate((nodeId) => {
    const text = document.querySelector(`g.node[data-bb-id="${CSS.escape(nodeId)}"] text.node-label`);
    if (!text) return null;
    return {
      display: text.getAttribute('display'),
      active: text.getAttribute('data-bb-nameo-inscription') === 'active',
      primary: text.querySelector('.bb-nameo-inscription-primary')?.textContent ?? null,
      secondary: text.querySelector('.bb-nameo-inscription-secondary')?.textContent ?? null,
      primaryLang: text.querySelector('.bb-nameo-inscription-primary')?.getAttribute('lang') ?? null,
      primaryDir: text.querySelector('.bb-nameo-inscription-primary')?.getAttribute('dir') ?? null,
      wholeText: text.textContent,
    };
  }, id);
}

async function activeInscriptionScreenRect(page, id) {
  return page.evaluate((nodeId) => {
    const text = document.querySelector(
      `g.node[data-bb-id="${CSS.escape(nodeId)}"] text.node-label[data-bb-nameo-inscription="active"]`,
    );
    if (!text) return null;
    const bbox = text.getBBox();
    const ctm = text.getScreenCTM();
    if (!ctm) return null;
    const points = [
      new DOMPoint(bbox.x, bbox.y),
      new DOMPoint(bbox.x + bbox.width, bbox.y),
      new DOMPoint(bbox.x, bbox.y + bbox.height),
      new DOMPoint(bbox.x + bbox.width, bbox.y + bbox.height),
    ].map((p) => p.matrixTransform(ctm));
    return {
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)),
    };
  }, id);
}

// commitViaIndex (bb-helpers.cjs) always opens Index via the desktop rail
// button, which is display:none on mobile (.rail is hidden below 860px) --
// this is the same commit-via-Index path, just reaching the drawer through
// whichever control (rail or bottom-nav) is actually visible at the current
// viewport.
async function commitViaIndexAnyViewport(page, id) {
  const railIndex = page.locator('.rail-btn[data-action="index"]');
  const opener = (await railIndex.isVisible()) ? railIndex : page.locator('[data-mobile="index"]');
  await opener.click();
  await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
  await page.locator('#objectSearch').fill(id);
  const openLink = page.locator(`[data-open="${id}"]`).first();
  await expect(openLink).toBeVisible();
  await openLink.click();
  await expect.poll(() => page.evaluate(() => window.__bbTest.getUiRuntime().focusedId)).toBe(id);
}

async function fieldSafeRectPage(page) {
  return page.evaluate(() => {
    const safe = window.__bbTest.computeFieldSafeRect();
    const wrap = document.getElementById('mapWrap').getBoundingClientRect();
    return { left: wrap.left + safe.left, top: wrap.top + safe.top, right: wrap.left + safe.right, bottom: wrap.top + safe.bottom };
  });
}

test.describe('Active NameO linguistic inscription (MICRO-03)', () => {
  test('NAI-01: Arabic NameO directly committed with Source Names OFF shows the active two-line inscription; other NameO labels stay hidden', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    expect(await page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(false);

    await clickNode(page, 'NameO.AR.GHURAB');
    const body = await page.evaluate(() => {
      const core = document.querySelector('g.node[data-bb-id="NameO.AR.GHURAB"] .bb-body');
      return core ? { display: getComputedStyle(core).display, r: core.getAttribute('r') } : null;
    });
    expect(body).toBeTruthy();
    expect(body.r).toBe('3');

    const st = await inscriptionState(page, 'NameO.AR.GHURAB');
    expect(st.active).toBe(true);
    expect(st.display).not.toBe('none');
    expect(st.primary).toBe('غراب');
    expect(st.secondary).toBe('ghurāb');
    expect(st.primaryLang).toBe('ar');
    expect(st.primaryDir).toBe('rtl');

    for (const other of ALL_NAMEOS.filter((id) => id !== 'NameO.AR.GHURAB')) {
      const otherSt = await inscriptionState(page, other);
      expect(otherSt.active, `${other} must not be active`).toBe(false);
      expect(otherSt.display, `${other} stays hidden with Source Names off`).toBe('none');
    }
  });

  test('NAI-02: with Source Names ON, the active inscription is still shown and other NameO labels use the ordinary treatment', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-view="sourceNames"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.sourceNames)).toBe(true);
    await page.keyboard.press('Escape');

    const st = await inscriptionState(page, 'NameO.AR.GHURAB');
    expect(st.active).toBe(true);
    expect(st.primary).toBe('غراب');
    expect(st.secondary).toBe('ghurāb');

    const otherSt = await inscriptionState(page, 'NameO.ON.HRAFN');
    expect(otherSt.active).toBe(false);
    // Ordinary treatment: single-line, no inscription tspans.
    expect(otherSt.primary).toBeNull();
    expect(otherSt.secondary).toBeNull();
  });

  test('NAI-03: every current canonical NameO derives a valid live active inscription with no invented content', async ({
    page,
  }) => {
    const { DATA, splitNameOInscription } = await loadModels();
    await gotoField(page, { reduced: true });

    for (const id of ALL_NAMEOS) {
      const node = DATA.nodes.find((n) => n.id === id);
      const expected = splitNameOInscription(node.label);
      await commitViaIndex(page, id);
      const st = await inscriptionState(page, id);
      expect(st.active, `${id} must be active once committed`).toBe(true);
      expect(st.primary).toBe(expected.primary);
      expect(st.secondary).toBe(expected.secondary || null);
    }
  });

  test('NAI-04: focusing a different object collapses the inscription and ordinary Source Names rules resume', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');
    expect((await inscriptionState(page, 'NameO.AR.GHURAB')).active).toBe(true);

    await clickNode(page, 'FO.CORPSE');
    const st = await inscriptionState(page, 'NameO.AR.GHURAB');
    expect(st.active).toBe(false);
    expect(st.primary).toBeNull();
    // Source Names is off (default) -- the now-inactive NameO reverts to hidden.
    expect(st.display).toBe('none');
  });

  test('NAI-05: hover or roving keyboard focus alone never expands the inscription (preview vs commit stays distinct)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });

    const hovered = await page.evaluate(() => {
      const g = document.querySelector('g.node[data-bb-id="NameO.AR.GHURAB"]');
      if (!g) return false;
      const hit = g.querySelector('.node-hit');
      hit.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return true;
    });
    expect(hovered).toBe(true);
    await page.waitForTimeout(300);
    expect((await inscriptionState(page, 'NameO.AR.GHURAB')).active).toBe(false);

    await page.evaluate(() => {
      document.querySelector('g.node[data-bb-id="NameO.AR.GHURAB"] .node-hit')?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    });

    // Roving keyboard focus (Tab-reachable, not yet committed) alone.
    await page.evaluate(() => {
      document.querySelector('g.node[data-bb-id="NameO.AR.GHURAB"]')?.setAttribute('tabindex', '0');
    });
    await page.locator('g.node[data-bb-id="NameO.AR.GHURAB"]').focus();
    await page.waitForTimeout(150);
    expect((await inscriptionState(page, 'NameO.AR.GHURAB')).active).toBe(false);
  });

  test('NAI-06: active inscription appears in the mobile Field chamber and stays contained/legible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');

    const st = await inscriptionState(page, 'NameO.AR.GHURAB');
    expect(st.active).toBe(true);
    expect(st.primary).toBe('غراب');

    const rect = await activeInscriptionScreenRect(page, 'NameO.AR.GHURAB');
    const safe = await fieldSafeRectPage(page);
    expect(rect).toBeTruthy();
    const TOL = 3;
    expect(rect.left).toBeGreaterThanOrEqual(safe.left - TOL);
    expect(rect.right).toBeLessThanOrEqual(safe.right + TOL);
    expect(rect.top).toBeGreaterThanOrEqual(safe.top - TOL);
    expect(rect.bottom).toBeLessThanOrEqual(safe.bottom + TOL);
  });

  test('NAI-07: mobile Read does not duplicate the Field inscription; returning to Field restores it if attention is still on the NameO', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');
    await page.locator('[data-mobile="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('read');

    // The Field inscription is not duplicated anywhere inside the Reader.
    const readerHasInscription = await page.evaluate(
      () => !!document.querySelector('#reader .bb-nameo-inscription-primary, #reader [data-bb-nameo-inscription]'),
    );
    expect(readerHasInscription).toBe(false);

    await page.locator('[data-mobile="field"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('field');
    const st = await inscriptionState(page, 'NameO.AR.GHURAB');
    expect(st.active).toBe(true);
    expect(st.primary).toBe('غراب');
  });

  test('NAI-08: at every protected viewport, all four NameOs render a contained, unclipped active inscription', async ({
    page,
  }) => {
    const viewports = [
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
      { width: 844, height: 390 },
      { width: 1280, height: 800 },
      { width: 1024, height: 640 },
    ];
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await gotoField(page, { reduced: true });
      const mobile = vp.width <= 860;
      for (const id of ALL_NAMEOS) {
        await commitViaIndexAnyViewport(page, id);
        // Committing via Index on mobile opens the Read chamber (the Field
        // is not the visible surface there -- see NAI-07); switch back to
        // Field so the inscription is actually the on-screen thing being
        // measured, not a collapsed/hidden map-wrap.
        if (mobile) {
          await page.locator('[data-mobile="field"]').click();
          await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('field');
        }
        // Let the focus camera finish animating to its fitted frame before
        // measuring geometry, matching responsive-visual-closure.spec.js's
        // existing settle pattern for the same class of check.
        await page.waitForTimeout(700);
        const st = await inscriptionState(page, id);
        expect(st.active, `${id} at ${vp.width}x${vp.height} must be active`).toBe(true);

        const rect = await activeInscriptionScreenRect(page, id);
        expect(rect, `${id} at ${vp.width}x${vp.height} must have a measurable active rect`).toBeTruthy();
        const safe = await fieldSafeRectPage(page);
        const TOL = 3;
        expect(rect.left, `${id} at ${vp.width}x${vp.height} left`).toBeGreaterThanOrEqual(safe.left - TOL);
        expect(rect.right, `${id} at ${vp.width}x${vp.height} right`).toBeLessThanOrEqual(safe.right + TOL);
        expect(rect.top, `${id} at ${vp.width}x${vp.height} top`).toBeGreaterThanOrEqual(safe.top - TOL);
        expect(rect.bottom, `${id} at ${vp.width}x${vp.height} bottom`).toBeLessThanOrEqual(safe.bottom + TOL);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow, `${id} at ${vp.width}x${vp.height} no horizontal overflow`).toBe(false);
      }
    }
  });

  test('NAI-09: hiding the active NameO removes body and inscription from the Field, keeps the Reader, and neutralizes Field attention', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');
    expect((await inscriptionState(page, 'NameO.AR.GHURAB')).active).toBe(true);

    await page.locator('[data-reader-action="visibility"]').click();
    await expect
      .poll(() => page.evaluate(() => window.__bbTest.getState().view.objectVisibility['NameO.AR.GHURAB']))
      .toBe(false);

    const st = await inscriptionState(page, 'NameO.AR.GHURAB');
    expect(st.display).toBe('none');
    expect(st.active).toBe(false);
    const bodyDisplay = await page.evaluate(() => {
      const g = document.querySelector('g.node[data-bb-id="NameO.AR.GHURAB"]');
      return g ? getComputedStyle(g).display : null;
    });
    expect(bodyDisplay).toBe('none');

    await expect(page.locator('#reader')).toBeVisible();
    expect(await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId)).toBeNull();
    expect(await page.evaluate(() => window.__bbTest.getState().reading.fieldAttention.kind)).toBe('whole-field');
    expect(await page.evaluate(() => window.__bbTest.getState().reading.anchorId)).toBe('NameO.AR.GHURAB');
  });

  test('NAI-10: Solo on the active NameO preserves its inscription and adds no Route/trace event', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');
    const routeBefore = await page.evaluate(() => window.__bbTest.getState().history.route.length);

    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);

    const st = await inscriptionState(page, 'NameO.AR.GHURAB');
    expect(st.active).toBe(true);
    expect(st.primary).toBe('غراب');

    const routeAfter = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    expect(routeAfter).toBe(routeBefore);
  });
});
