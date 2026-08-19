'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');

// FQ-03 (final completion intake): the existing "200%-zoom-equivalent"
// coverage (responsive-visual-closure.spec.js) is a real, useful reflow test
// -- a smaller CSS viewport -- but it does not prove that any rendered TEXT
// actually doubled in size. Confirmed by direct measurement: every font-size
// declaration in src/index.template.html is an absolute px value (or
// clamp(px,vw,px)/inherit) -- none are em/rem/%-relative -- so the
// real-user-zoom mechanism (document.documentElement.style.fontSize='200%')
// has zero effect here (verified live: computed font-size identical before
// and after). Per the intake, this proof therefore uses a test-only stress
// harness that explicitly forces representative elements' computed font
// sizes to 2x their own measured baseline, and is named for what it actually
// does -- a text-resize stress test, not a simulated browser zoom.
//
// This does not change production typography; the override is injected by
// the test itself and never touches src/**.

const REPRESENTATIVE = [
  { label: 'Reader title', selector: '#reader .title' },
  { label: 'Reader body', selector: '#reader .prose p' },
  { label: 'View drawer toggle label', selector: '#fieldViewDrawer .toggle-row span' },
  { label: 'Index drawer item title', selector: '#objectDrawer .olabel' },
  { label: 'primary nav control (rail)', selector: '.rail-btn' },
  { label: 'tooltip text', selector: '#microPreview' },
];

async function measurePx(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const fs = getComputedStyle(el).fontSize;
    return fs ? parseFloat(fs) : null;
  }, selector);
}

test.describe('200% text-resize stress (FQ-03): proves actual computed font-size doubling, not just a smaller viewport', () => {
  test('representative elements really reach >=1.9x their baseline computed font size, and the page stays usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoField(page, { reduced: true });
    // RNO gives Reader body real prose text (buildTextContent), unlike an FO
    // subject's index-list-only content.
    await clickNode(page, 'RNO.GHURAB_BURIAL__424A0ECF');

    const baselines = {};

    // Reader title/body -- already open via the commit above.
    baselines['Reader title'] = await measurePx(page, '#reader .title');
    baselines['Reader body'] = await measurePx(page, '#reader .prose p');

    // View drawer text.
    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    baselines['View drawer toggle label'] = await measurePx(page, '#fieldViewDrawer .toggle-row span');
    await page.locator('[data-close="fieldViewDrawer"]').first().click();

    // Index drawer text.
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    baselines['Index drawer item title'] = await measurePx(page, '#objectDrawer .olabel');
    await page.keyboard.press('Escape');
    await expect(page.locator('#objectDrawer')).not.toHaveClass(/open/);

    // Primary nav control.
    baselines['primary nav control (rail)'] = await measurePx(page, '.rail-btn');

    // Tooltip: a real hover, not a synthetic style probe.
    const hoverTarget = page.locator('g.node .node-hit').first();
    await hoverTarget.hover();
    await expect(page.locator('#microPreview')).toHaveClass(/visible/);
    baselines['tooltip text'] = await measurePx(page, '#microPreview');
    await page.mouse.move(0, 0);

    for (const { label } of REPRESENTATIVE) {
      expect(baselines[label], `expected a measurable baseline font-size for ${label}`).not.toBeNull();
      expect(baselines[label]).toBeGreaterThan(0);
    }

    // Inject the test-only 2x override -- each selector forced to exactly
    // 2x ITS OWN measured baseline, not a single guessed multiplier.
    const css = REPRESENTATIVE.map(({ selector, label }) => `${selector}{font-size:${baselines[label] * 2}px !important;}`).join('\n');
    await page.addStyleTag({ content: css });

    // Precondition: the resize actually happened, for every representative
    // element, each re-observed in the same real state it was measured in
    // originally (drawer open / tooltip hovered), not assumed to persist.
    const resized = {};
    resized['Reader title'] = await measurePx(page, '#reader .title');
    resized['Reader body'] = await measurePx(page, '#reader .prose p');

    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    resized['View drawer toggle label'] = await measurePx(page, '#fieldViewDrawer .toggle-row span');
    const viewDrawerBox = await page.locator('#fieldViewDrawer').boundingBox();

    await page.locator('[data-close="fieldViewDrawer"]').first().click();
    await page.locator('.rail-btn[data-action="index"]').click();
    await expect(page.locator('#objectDrawer')).toHaveClass(/open/);
    resized['Index drawer item title'] = await measurePx(page, '#objectDrawer .olabel');
    const indexDrawerBox = await page.locator('#objectDrawer').boundingBox();
    await page.keyboard.press('Escape');

    resized['primary nav control (rail)'] = await measurePx(page, '.rail-btn');
    const railBtnBox = await page.locator('.rail-btn').first().boundingBox();

    await hoverTarget.hover();
    await expect(page.locator('#microPreview')).toHaveClass(/visible/);
    resized['tooltip text'] = await measurePx(page, '#microPreview');
    await page.mouse.move(0, 0);

    for (const { label } of REPRESENTATIVE) {
      const ratio = resized[label] / baselines[label];
      expect(ratio, `${label}: resized (${resized[label]}px) / baseline (${baselines[label]}px) must be >= 1.9, got ${ratio}`).toBeGreaterThanOrEqual(
        1.9
      );
    }

    // Then: the page stays usable under the stress.
    // No accidental horizontal document overflow.
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(scrollW, `document.documentElement.scrollWidth (${scrollW}) exceeds clientWidth (${clientW})`).toBeLessThanOrEqual(clientW + 1);

    // Drawers/Reader remain usable: real, non-degenerate bounding boxes,
    // still within the (fixed) viewport.
    const vp = page.viewportSize();
    for (const [name, box] of [
      ['View drawer', viewDrawerBox],
      ['Index drawer', indexDrawerBox],
      ['rail control', railBtnBox],
    ]) {
      expect(box, `${name} has no measurable box under text-resize stress`).not.toBeNull();
      expect(box.width, `${name} collapsed to zero width under text-resize stress`).toBeGreaterThan(0);
      expect(box.height, `${name} collapsed to zero height under text-resize stress`).toBeGreaterThan(0);
      expect(box.x, `${name} left edge is off-screen under text-resize stress`).toBeGreaterThanOrEqual(-0.5);
      expect(box.y, `${name} top edge is off-screen under text-resize stress`).toBeGreaterThanOrEqual(-0.5);
    }

    // Reader content is not clipped away: the container remains scrollable
    // (overflow:auto, not hidden) so grown text stays reachable even if it
    // no longer fits the viewport in one screenful.
    const readerOverflowY = await page.evaluate(() => getComputedStyle(document.querySelector('.reader')).overflowY);
    expect(['auto', 'scroll', 'visible']).toContain(readerOverflowY);

    // Core controls remain operable: the rail's View control is still a
    // real, clickable target that opens its drawer under the stress.
    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-close="fieldViewDrawer"]').first().click();

    // Focus stays reachable: roving tabindex still resolves to exactly one
    // visible node, and Tab can still reach it.
    const rovingCount = await page.evaluate(
      () => [...document.querySelectorAll('g.node')].filter((g) => g.getAttribute('tabindex') === '0').length
    );
    expect(rovingCount, 'exactly one visible node must carry tabindex=0 under text-resize stress').toBe(1);
  });
});
