'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

test.describe('Field renderer: morphology, aperture, RelO clearing, trace layers (T17)', () => {
  test('all six canonical morphologies plus the aperture role are present and match the extracted metric roles', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const morphologies = await page.evaluate(() => [
      ...new Set([...document.querySelectorAll('g.node')].map((g) => g.getAttribute('data-bb-morphology'))),
    ]);
    const expectedRoles = ['fo', 'rno', 'mno', 'nameo', 'refo', 'relo', 'aperture'];
    for (const role of expectedRoles) {
      expect(morphologies, `missing morphology role: ${role}`).toContain(role);
    }
    expect(morphologies.length, 'no extra, unaccounted-for morphology role should appear').toBe(expectedRoles.length);
  });

  test('rendered body/ring radii match the exact per-type metrics (coreR/outerR) for every canonical type', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const radii = await page.evaluate(() => {
      const out = {};
      for (const g of document.querySelectorAll('g.node')) {
        const morphology = g.getAttribute('data-bb-morphology');
        if (out[morphology] !== undefined) continue;
        const body = g.querySelector('.bb-body, .bb-aperture-core, .bb-rno-ring, .bb-aperture-rim');
        if (!body) {
          out[morphology] = null;
        } else if (body.hasAttribute('r')) {
          out[morphology] = Number(body.getAttribute('r'));
        } else if (body.hasAttribute('width')) {
          out[morphology] = Number(body.getAttribute('width')) / 2;
        } else {
          // MNO's body is an irregular hand-authored path (10% irregularity
          // by design, not a perfect circle): approximate its radius from
          // its own bounding box instead of a literal r/width attribute.
          const box = body.getBBox();
          out[morphology] = (box.width + box.height) / 4;
        }
      }
      return out;
    });
    // Exact metrics per visual-tokens.json#morphology (coreR unless noted).
    // "fo" here means ordinary FO nodes -- the aperture (also type FO but
    // morphology "aperture") is asserted separately, matching how
    // morphologyOf() itself distinguishes them.
    expect(radii.fo).toBeCloseTo(6.4, 5);
    expect(radii.rno).toBeCloseTo(11.5, 5); // ring outerR is the first .bb-*ring match
    expect(radii.mno).toBeCloseTo(7.4, 1); // irregular path: approx by design (10% irregularity)
    expect(radii.refo).toBeCloseTo(4.5, 5); // half of the 9px diamond side
    expect(radii.relo).toBeCloseTo(8.5, 5);
    expect(radii.aperture).toBeCloseTo(11, 5); // rim outerR (core is 9.5, rim is queried first)
  });

  test('the Black Bird aperture keeps its distinct core/rim role and is never recolored as an ordinary focused selection (T-REQ-031)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const before = await page.evaluate(() => {
      const g = document.querySelector('g.node[data-bb-id="FO.BLACK_BIRD_FIELD"]');
      const core = g.querySelector('.bb-aperture-core');
      return { hasCore: !!core, fill: core ? getComputedStyle(core).fill : null };
    });
    expect(before.hasCore).toBe(true);
    await clickNode(page, 'FO.CORPSE');
    const after = await page.evaluate(() => {
      const g = document.querySelector('g.node[data-bb-id="FO.BLACK_BIRD_FIELD"]');
      const core = g.querySelector('.bb-aperture-core');
      return { hasCore: !!core, fill: core ? getComputedStyle(core).fill : null };
    });
    expect(after.hasCore).toBe(true);
    expect(after.fill).toBe(before.fill);
  });

  test('RelO attention is one continuous masked field: no visible per-member circles or spokes (T-REQ-029)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'RelO.R7080EA25');
    const structure = await page.evaluate(() => {
      const maskedFields = document.querySelectorAll('.bb-clearing-field');
      const spokes = document.querySelectorAll('.bb-clearing-spoke, [class*="spoke"]');
      const memberBubbles = document.querySelectorAll('.bb-clearing-member-bubble, [class*="member-bubble"]');
      return { maskedFieldCount: maskedFields.length, spokeCount: spokes.length, memberBubbleCount: memberBubbles.length };
    });
    expect(structure.maskedFieldCount).toBeGreaterThanOrEqual(1);
    expect(structure.spokeCount).toBe(0);
    expect(structure.memberBubbleCount).toBe(0);
  });

  test('Route and wear use distinct, non-confusable materials (T-REQ-030)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN');
    const routeColor = await page.evaluate(() => {
      const halo = document.querySelector('.node-route-halo[stroke-opacity]:not([stroke-opacity="0"])');
      return halo ? getComputedStyle(halo).stroke : null;
    });
    expect(routeColor).toBeTruthy();
    // Route's own neutral silver/bone mark must never equal wear's amber-brown.
    const WEAR_MARK_COLOR_RGB = 'rgb(154, 103, 54)'; // #9a6736
    expect(routeColor).not.toBe(WEAR_MARK_COLOR_RGB);
  });

  test('the Field carries no persistent object-information card', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const persistentCard = await page.evaluate(() => !!document.getElementById('bbFocusReadout'));
    expect(persistentCard).toBe(false);
  });
});
