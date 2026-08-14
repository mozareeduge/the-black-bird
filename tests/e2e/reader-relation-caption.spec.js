'use strict';
// MICRO-01: RelO Reader relational caption (RLC-01..07).

const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, commitViaIndex } = require('../bb-helpers.cjs');
const path = require('path');
const { pathToFileURL } = require('url');

function modulePath(rel) {
  return pathToFileURL(path.resolve(__dirname, rel)).href;
}

async function loadModels() {
  const { DATA } = await import(modulePath('../../src/data/canonical-data.js'));
  const nodesById = Object.fromEntries(DATA.nodes.map((n) => [n.id, n]));
  return { DATA, nodesById };
}

// Derives the same caption text MICRO-01 requires, from canonical data only
// -- used as the test's oracle, never as a hardcoded literal.
function expectedCaptionText(relId, DATA, nodesById) {
  const ids = DATA.relations[relId] || [];
  const parts = ids.slice(0, 3).map((id) => {
    const node = nodesById[id];
    return node?.type === 'NameO' ? node.label || id : node?.shortLabel || node?.label || id;
  });
  let text = parts.join(' · ');
  if (ids.length > 3) text += ` +${ids.length - 3}`;
  return text;
}

test.describe('RelO Reader relational caption (MICRO-01)', () => {
  test('RLC-01: a directly committed RelO shows exactly one derived caption, the opaque id remains, and the full participant list remains', async ({
    page,
  }) => {
    const { DATA, nodesById } = await loadModels();
    const relId = 'RelO.R4CB4A8D8';
    const expected = expectedCaptionText(relId, DATA, nodesById);

    await gotoField(page, { reduced: true });
    await clickNode(page, relId);

    const reader = page.locator('#reader');
    await expect(reader.locator('.meta')).toHaveText(`RelO · ${relId}`);

    const captions = reader.locator('.relation-caption');
    await expect(captions).toHaveCount(1);
    await expect(captions).toHaveText(expected);

    const participantIds = await reader.locator('.index-item').evaluateAll((els) => els.map((el) => el.dataset.id));
    expect(participantIds).toEqual(DATA.relations[relId]);
  });

  test('RLC-02: a relation with more than three participants shows exactly the first three plus a correct +N, with the full Objects list intact', async ({
    page,
  }) => {
    const { DATA, nodesById } = await loadModels();
    const relId = 'RelO.R4CB4A8D8';
    const participants = DATA.relations[relId];
    expect(participants.length).toBeGreaterThan(3);

    await gotoField(page, { reduced: true });
    await clickNode(page, relId);

    const captionText = await page.locator('#reader .relation-caption').textContent();
    expect(captionText.trim()).toBe(expectedCaptionText(relId, DATA, nodesById));
    expect(captionText).toMatch(new RegExp(`\\+${participants.length - 3}$`));

    const participantIds = await page.locator('#reader .index-item').evaluateAll((els) => els.map((el) => el.dataset.id));
    expect(participantIds).toEqual(participants);
  });

  test('RLC-03: a relation with three or fewer participants has no +N suffix', async ({ page }) => {
    const { DATA, nodesById } = await loadModels();
    const relId = 'RelO.R7080EA25';
    expect(DATA.relations[relId].length).toBeLessThanOrEqual(3);

    await gotoField(page, { reduced: true });
    await clickNode(page, relId);

    const captionText = await page.locator('#reader .relation-caption').textContent();
    expect(captionText.trim()).toBe(expectedCaptionText(relId, DATA, nodesById));
    expect(captionText).not.toContain('+0');
    expect(captionText.trim()).not.toMatch(/\+\d*$/);
  });

  test('RLC-04: a NameO participant in the caption uses its full canonical mixed-script label with correctly scoped Arabic bidi', async ({
    page,
  }) => {
    const { DATA, nodesById } = await loadModels();
    const relId = 'RelO.R4CB4A8D8';
    const nameoParticipant = DATA.relations[relId].find((id) => nodesById[id].type === 'NameO');
    expect(nameoParticipant).toBeTruthy();

    await gotoField(page, { reduced: true });
    await clickNode(page, relId);

    const caption = page.locator('#reader .relation-caption');
    await expect(caption).toContainText(nodesById[nameoParticipant].label);

    const arabicRuns = caption.locator('.bb-arabic');
    await expect(arabicRuns).toHaveCount(1);
    expect(await arabicRuns.getAttribute('lang')).toBe('ar');
    expect(await arabicRuns.getAttribute('dir')).toBe('rtl');

    // The caption element itself must stay LTR -- only the Arabic run gets
    // dir="rtl", never the whole mixed-script caption.
    const captionDir = await caption.evaluate((el) => el.getAttribute('dir'));
    expect(captionDir).toBeNull();
  });

  test('RLC-05: the caption wraps naturally with no horizontal overflow or clipping at narrow/mobile widths, and the Objects list remains reachable', async ({
    page,
  }) => {
    const relId = 'RelO.R4CB4A8D8';
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoField(page, { reduced: true, mobile: true });
      await clickNode(page, relId);
      await page.locator('[data-mobile="read"]').click();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `no horizontal overflow at ${viewport.width}x${viewport.height}`).toBe(false);

      const caption = page.locator('#reader .relation-caption');
      await expect(caption).toBeVisible();
      const captionBox = await caption.boundingBox();
      expect(captionBox.width).toBeLessThanOrEqual(viewport.width);

      await expect(page.locator('#reader .index-item').first()).toBeVisible();
    }
  });

  test('RLC-06: projected-edge Reader inspection does not receive a RelO caption', async ({ page }) => {
    await gotoField(page, { reduced: true });
    const found = await page.evaluate(() => {
      const hit = document.querySelector('line.hit');
      if (!hit) return false;
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    expect(found).toBe(true);

    const reader = page.locator('#reader');
    await expect(reader.locator('.edge-head')).toBeVisible();
    await expect(reader.locator('.relation-caption')).toHaveCount(0);
  });

  test('RLC-07: no relational caption is introduced to FO/RNO/MNO/NameO/RefO Readers', async ({ page }) => {
    const { DATA } = await loadModels();
    await gotoField(page, { reduced: true });

    for (const type of ['FO', 'RNO', 'MNO', 'NameO', 'RefO']) {
      const id = DATA.nodes.find((n) => n.type === type && n.id !== 'FO.BLACK_BIRD_FIELD').id;
      // commitViaIndex, not clickNode: this loop deliberately jumps between
      // unrelated clusters, which a correctly-fitted focus camera can
      // legitimately leave off-screen -- see bb-helpers.cjs.
      await commitViaIndex(page, id);
      await expect(page.locator('#reader .relation-caption'), `${type} Reader must not show a relation caption`).toHaveCount(0);
    }
  });
});
