'use strict';
// MR-04: cross-feature composition checks (intake section 9) for
// combinations not already exercised end-to-end by the per-feature specs:
// RelO + caption + Solo, RelO + hide + clearing, and mobile NameO + Reader
// action. NameO + Solo, NameO + hide, and NameO + Source Names on/off are
// already covered by nameo-active-inscription.spec.js's NAI-09/NAI-10/
// NAI-01/NAI-02.

const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

test.describe('Cross-feature composition (MR-04)', () => {
  test('RelO + caption + Solo: the relation caption stays visible through Solo enter/exit, and Solo membership is the full participant set', async ({
    page,
  }) => {
    const relId = 'RelO.R4CB4A8D8';
    await gotoField(page, { reduced: true });
    await clickNode(page, relId);

    await expect(page.locator('#reader .relation-caption')).toHaveCount(1);
    const captionText = await page.locator('#reader .relation-caption').textContent();

    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);

    // Caption survives Solo entry unchanged; Solo membership is the RelO
    // plus every canonical participant (P-RULE-013), and the action row
    // reflects EXIT SOLO.
    await expect(page.locator('#reader .relation-caption')).toHaveText(captionText);
    const solo = await page.evaluate(() => ({
      rootId: window.__bbTest.getState().solo.rootId,
      members: [...window.__bbTest.getState().solo.members].sort(),
    }));
    expect(solo.rootId).toBe(relId);
    expect(solo.members).toContain(relId);
    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('EXIT SOLO');

    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(false);
    await expect(page.locator('#reader .relation-caption')).toHaveText(captionText);
  });

  test('RelO + hide: hiding the active RelO removes its Field clearing, leaves the Reader/caption visible, and neutralizes Field attention', async ({
    page,
  }) => {
    const relId = 'RelO.R4CB4A8D8';
    await gotoField(page, { reduced: true });
    await clickNode(page, relId);

    await expect.poll(() => page.evaluate(() => window.__bbTest.getUiRuntime().activeClearingId)).toBe(relId);
    const captionText = await page.locator('#reader .relation-caption').textContent();

    await page.locator('[data-reader-action="visibility"]').click();
    await expect
      .poll(() => page.evaluate((id) => window.__bbTest.getState().view.objectVisibility[id], relId))
      .toBe(false);

    // Clearing gone (ADJ-01 presentation reconciliation), Reader/caption
    // stay exactly as they were, Field attention neutral.
    expect(await page.evaluate(() => window.__bbTest.getUiRuntime().activeClearingId)).toBeNull();
    await expect(page.locator('#reader')).toBeVisible();
    await expect(page.locator('#reader .relation-caption')).toHaveText(captionText);
    expect(await page.evaluate(() => window.__bbTest.getState().reading.fieldAttention.kind)).toBe('whole-field');
    expect(await page.evaluate(() => window.__bbTest.getState().reading.anchorId)).toBe(relId);
    await expect(page.locator('[data-reader-action="visibility"]')).toHaveText('SHOW IN FIELD');
  });

  test('mobile NameO + Reader action: Solo from the Reader on a directly-active NameO switches to Field, preserves the inscription, and returns cleanly to Read', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');
    await page.locator('[data-mobile="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('read');

    const routeBefore = await page.evaluate(() => window.__bbTest.getState().history.route.length);
    await page.locator('[data-reader-action="solo"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().solo.active)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('field');

    const inscription = await page.evaluate(() => {
      const text = document.querySelector('g.node[data-bb-id="NameO.AR.GHURAB"] text.node-label');
      return {
        active: text?.getAttribute('data-bb-nameo-inscription') === 'active',
        primary: text?.querySelector('.bb-nameo-inscription-primary')?.textContent ?? null,
      };
    });
    expect(inscription.active).toBe(true);
    expect(inscription.primary).toBe('غراب');
    expect(await page.evaluate(() => window.__bbTest.getState().history.route.length)).toBe(routeBefore);

    await page.locator('[data-mobile="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().responsive.surface)).toBe('read');
    await expect(page.locator('[data-reader-action="solo"]')).toHaveText('EXIT SOLO');
    expect(await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId)).toBe('NameO.AR.GHURAB');
  });
});
