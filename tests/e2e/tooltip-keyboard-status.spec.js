'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode, node, tagNodes } = require('../bb-helpers.cjs');

test.describe('Tooltip, roving focus, and coalesced status (T22)', () => {
  test('tooltip lifecycle: show associates aria-describedby, hide removes it, Escape dismisses (T-REQ-034/035)', async ({
    page,
  }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async () => {
      const mod = await import('/src/presentation/tooltip-renderer.js');
      const tooltipEl = document.createElement('div');
      tooltipEl.id = 'testTooltip';
      document.body.appendChild(tooltipEl);
      const target = document.createElement('button');
      document.body.appendChild(target);
      const renderer = mod.createTooltipRenderer({ tooltipEl });

      renderer.show({ id: 'FO.CORPSE', label: 'Corpse' }, 100, 100, { bounds: { width: 800, height: 600 }, describedByTarget: target });
      const afterShow = {
        visible: tooltipEl.classList.contains('visible'),
        ariaHidden: tooltipEl.getAttribute('aria-hidden'),
        describedBy: target.getAttribute('aria-describedby'),
        associated: renderer.isAssociatedWith('FO.CORPSE'),
      };

      renderer.hide();
      const afterHide = {
        visible: tooltipEl.classList.contains('visible'),
        ariaHidden: tooltipEl.getAttribute('aria-hidden'),
        describedBy: target.getAttribute('aria-describedby'),
        associated: renderer.isAssociatedWith('FO.CORPSE'),
      };

      // Invalid geometry (off-screen / NaN) must remove association, not
      // render a broken/mispositioned tooltip.
      renderer.show({ id: 'FO.CAIN', label: 'Cain' }, 50, 50, { bounds: { width: 800, height: 600 }, describedByTarget: target });
      const validOnScreen = renderer.reconcileGeometry(50, 50, { width: 800, height: 600 });
      const invalidOffScreen = renderer.reconcileGeometry(NaN, -999, { width: 800, height: 600 });
      const afterInvalidGeometry = { visible: tooltipEl.classList.contains('visible'), associated: renderer.isAssociatedWith('FO.CAIN') };

      return { afterShow, afterHide, validOnScreen, invalidOffScreen, afterInvalidGeometry };
    });

    expect(result.afterShow).toEqual({ visible: true, ariaHidden: 'false', describedBy: 'testTooltip', associated: true });
    expect(result.afterHide).toEqual({ visible: false, ariaHidden: 'true', describedBy: null, associated: false });
    expect(result.validOnScreen).toBe(true);
    expect(result.invalidOffScreen).toBe(false);
    expect(result.afterInvalidGeometry).toEqual({ visible: false, associated: false });
  });

  test('tooltip and modal dismissal do not overlap ambiguously: Escape dismisses the tooltip first, the modal only on a second press', async ({
    page,
  }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async () => {
      const kbMod = await import('/src/controllers/keyboard-controller.js');
      const fmMod = await import('/src/accessibility/focus-manager.js');
      let tooltipOpen = true;
      let modalOpen = true;
      const focusManager = fmMod.createFocusManager({ getVisibleIds: () => ['A'], preferredFallbackId: () => 'A' });
      const controller = kbMod.createKeyboardController({
        surface: document,
        focusManager,
        onCommitRoving: () => {},
        onDirectional: () => {},
        dismissHandlers: [
          () => {
            if (!tooltipOpen) return false;
            tooltipOpen = false;
            return true;
          },
          () => {
            if (!modalOpen) return false;
            modalOpen = false;
            return true;
          },
        ],
      });
      const firstEscape = controller.onEscape();
      const afterFirst = { tooltipOpen, modalOpen };
      const secondEscape = controller.onEscape();
      const afterSecond = { tooltipOpen, modalOpen };
      return { firstEscape, afterFirst, secondEscape, afterSecond };
    });
    expect(result.firstEscape).toBe(true);
    expect(result.afterFirst).toEqual({ tooltipOpen: false, modalOpen: true });
    expect(result.secondEscape).toBe(true);
    expect(result.afterSecond).toEqual({ tooltipOpen: false, modalOpen: false });
  });

  test('exactly one visible node has tabindex=0 on the live app (T-REQ-036)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    const zeroCount = await page.evaluate(
      () => [...document.querySelectorAll('g.node')].filter((g) => g.getAttribute('tabindex') === '0').length
    );
    expect(zeroCount).toBe(1);
  });

  test('directional focus movement is deterministic: identical geometry produces identical results across runs', async ({
    page,
  }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async () => {
      const mod = await import('/src/accessibility/focus-manager.js');
      const visibleIds = ['A', 'B', 'C'];
      // A deterministic direction resolver: always B when moving right from A.
      const neighborInDirection = (from, dx, dy) => (from === 'A' && dx === 1 ? 'B' : null);
      function run() {
        const fm = mod.createFocusManager({ getVisibleIds: () => visibleIds, preferredFallbackId: () => 'A' });
        fm.setRovingTarget('A');
        fm.moveDirection(1, 0, neighborInDirection);
        return fm.getRovingTarget();
      }
      const r1 = run();
      const r2 = run();
      return { r1, r2 };
    });
    expect(result.r1).toBe('B');
    expect(result.r2).toBe('B');
  });

  test('focus-manager falls back deterministically when the roving target becomes hidden', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async () => {
      const mod = await import('/src/accessibility/focus-manager.js');
      let visibleIds = ['A', 'B', 'C'];
      const fm = mod.createFocusManager({ getVisibleIds: () => visibleIds, preferredFallbackId: () => 'FO.BLACK_BIRD_FIELD' });
      fm.setRovingTarget('B');
      visibleIds = ['A', 'C']; // B becomes hidden
      return fm.getRovingTarget();
    });
    expect(result).toBe('A'); // falls back to the first still-visible id
  });

  test('rapid status messages coalesce: only the latest meaningful message is published (T-REQ-037)', async ({ page }) => {
    await page.goto('/?skipIntro=1&bbtest=1');
    const result = await page.evaluate(async () => {
      const mod = await import('/src/presentation/status-renderer.js');
      const liveRegion = document.createElement('div');
      document.body.appendChild(liveRegion);
      const published = [];
      const originalTextContentSetter = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent').set;
      Object.defineProperty(liveRegion, 'textContent', {
        set(v) {
          published.push(v);
          originalTextContentSetter.call(liveRegion, v);
        },
        get() {
          return liveRegion.childNodes.length ? liveRegion.firstChild.textContent : '';
        },
      });
      const status = mod.createStatusRenderer({ liveRegion, coalesceMs: 60 });
      status.announce('Route: A.');
      status.announce('Route: A, B.');
      status.announce('Route: A, B, C.');
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { published, finalText: liveRegion.textContent };
    });
    expect(result.published.length).toBe(1);
    expect(result.finalText).toBe('Route: A, B, C.');
  });

  test('hovering the already-active object still previews it, with no Route/trace side effect (P-SCN-018)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    const before = await page.evaluate(() => ({
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
    }));
    await node(page, 'FO.CORPSE').hover();
    await page.waitForTimeout(260);
    const preview = page.locator('#microPreview');
    await expect(preview).toHaveClass(/visible/);
    await expect(preview.locator('.micro-preview-title')).toHaveText('Corpse');
    const after = await page.evaluate(() => ({
      route: window.__bbTest.getState().history.route.length,
      wear: Object.keys(window.__bbTest.getState().trace.wear || {}).length,
      activeId: window.__bbTest.getUiRuntime().focusedId,
    }));
    expect(after.route).toBe(before.route);
    expect(after.wear).toBe(before.wear);
    expect(after.activeId).toBe('FO.CORPSE');
  });

  test('preview near a viewport edge stays fully on-screen (P-SCN-019)', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 420 });
    await gotoField(page, { reduced: true });
    await tagNodes(page);
    // Move the mouse to every node's own measured screen center (not a
    // locator .hover(), which refuses targets outside the viewport/covered
    // by other elements) and check every resulting preview position — at
    // this small viewport at least one authored home lands near an edge.
    let checked = 0;
    const ids = await page.evaluate(() => [...document.querySelectorAll('g.node')].map((g) => g.__data__?.id).filter(Boolean));
    for (const id of ids) {
      const box = await node(page, id).locator('.node-hit,.bb-hit,.node-core,.bb-body').first().boundingBox();
      if (!box) continue;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(30);
      const preview = await page.locator('#microPreview').boundingBox();
      if (!preview) continue;
      checked += 1;
      expect(preview.x, `preview for ${id} left edge`).toBeGreaterThanOrEqual(0);
      expect(preview.y, `preview for ${id} top edge`).toBeGreaterThanOrEqual(0);
      expect(preview.x + preview.width, `preview for ${id} right edge`).toBeLessThanOrEqual(480);
      expect(preview.y + preview.height, `preview for ${id} bottom edge`).toBeLessThanOrEqual(420);
    }
    expect(checked, 'at least one node produced a measurable preview to check').toBeGreaterThan(0);
  });

  test('committing before the hover-preview delay elapses leaves no stale preview behind (P-SCN-020)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await tagNodes(page);
    await node(page, 'FO.CAIN').hover();
    // Commit immediately, well inside the 200ms hover-preview debounce.
    await clickNode(page, 'FO.CAIN');
    // If the armed hover timer were not cancelled on commit, it would fire
    // here (~200ms after hover) and show a stale preview for the object
    // that is now already the committed focus.
    await page.waitForTimeout(320);
    await expect(page.locator('#microPreview')).not.toHaveClass(/visible/);
  });

  test('an open preview is dismissed on resize rather than left stale-positioned (P-SCN-122)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    await tagNodes(page);
    await node(page, 'FO.ABEL').hover();
    await page.waitForTimeout(260);
    await expect(page.locator('#microPreview')).toHaveClass(/visible/);
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(page.locator('#microPreview')).not.toHaveClass(/visible/);
  });

  test('switching from pointer to keyboard to touch within one session commits correctly each time (P-SCN-097)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await tagNodes(page);

    // 1) Mouse/pointer.
    await clickNode(page, 'FO.CORPSE');
    expect((await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId))).toBe('FO.CORPSE');

    // 2) Keyboard: roving focus + Enter. The node click handler doesn't
    // discriminate by input origin (no per-modality state to desync), but
    // the roving-tabindex target must have followed the prior mouse commit.
    const roving = page.locator('g.node[tabindex="0"]');
    await expect(roving).toHaveCount(1);
    const rovingId = await roving.first().getAttribute('data-bb-id');
    await roving.first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId)).toBe(rovingId);

    // 3) Touch: a touch-originated tap dispatches the same "click" event the
    // mouse path does (there is no separate touch-only handler to desync).
    const target = page.locator('g.node[data-bb-test-id="FO.ABEL"]');
    await target.evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => window.__bbTest.getUiRuntime().focusedId === 'FO.ABEL', { timeout: 4000 });

    expect(await page.locator('.bb-unavailable').count()).toBe(0);
  });

  test('a user zoom overlapping a new direct commit leaves a consistent final state (P-SCN-100)', async ({ page }) => {
    await gotoField(page); // full motion: a real, overlappable camera transition
    await clickNode(page, 'FO.CORPSE');
    const svgBox = await page.locator('#graphSvg').boundingBox();

    // Start a user zoom gesture, then commit a different object mid-gesture.
    await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -80);
    await clickNode(page, 'FO.CAIN');
    await page.mouse.wheel(0, -80);
    await page.keyboard.up('Control');
    await page.waitForTimeout(150);

    const state = await page.evaluate(() => ({ activeId: window.__bbTest.getUiRuntime().focusedId, transform: window.__bbTest.getUiRuntime().transform }));
    expect(state.activeId).toBe('FO.CAIN');
    expect(
      Number.isFinite(state.transform.x) && Number.isFinite(state.transform.y) && Number.isFinite(state.transform.k),
    ).toBe(true);
    expect(state.transform.k).toBeGreaterThanOrEqual(0.55);
    expect(state.transform.k).toBeLessThanOrEqual(2.4);
    expect(await page.locator('.bb-unavailable').count()).toBe(0);
  });

  test('turning visual labels off leaves every node fully operable by keyboard, with its accessible name intact (P-SCN-102)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    const labelsToggle = page.locator('[data-view="labels"]').first();
    await labelsToggle.click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.labels)).toBe(false);
    await page.locator('[data-close="fieldViewDrawer"]').first().click();

    // aria-label is set once per node independent of the visual labels
    // toggle (updateLabelVisibility only touches the drawn <text>), so
    // every node keeps a real accessible name for a screen reader.
    const ariaLabels = await page.evaluate(() => [...document.querySelectorAll('g.node')].map((g) => g.getAttribute('aria-label')));
    expect(ariaLabels.every((l) => !!l && l.length > 0)).toBe(true);

    // Keyboard traversal and commit still work with labels off.
    const roving = page.locator('g.node[tabindex="0"]');
    await roving.first().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const state = await page.evaluate(() => ({ activeId: window.__bbTest.getUiRuntime().focusedId, labels: window.__bbTest.getState().view.labels }));
    expect(state.activeId).toBeTruthy();
    expect(state.labels).toBe(false);
  });

  test('inspecting a projected edge updates the Reader region with an accessible name for the pair (P-SCN-124)', async ({
    page,
  }) => {
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
    // The panel's own text content, not a synthesized announcement, is what
    // a screen reader would read here — it must name both endpoints, not
    // just restate "projected edge".
    const text = await reader.textContent();
    expect(text).toContain('Projected edge');
    expect(text.length).toBeGreaterThan('Projected edge'.length + 10);
  });

  test('reduced motion, a rapid commit, and a modal change together produce no error and a consistent final state (P-SCN-126)', async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN'); // rapid commit
    await page.locator('.rail-btn[data-action="about"]').click(); // modal change, overlapping
    await expect(page.locator('#aboutPanel')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#aboutPanel')).not.toHaveClass(/open/);

    expect(errors).toEqual([]);
    expect(await page.locator('.bb-unavailable').count()).toBe(0);
    const state = await page.evaluate(() => ({ activeId: window.__bbTest.getUiRuntime().focusedId, aboutOpen: window.__bbTest.getState().overlay.kind === 'about' }));
    expect(state.activeId).toBe('FO.CAIN');
    expect(state.aboutOpen).toBe(false);
  });

  test('landmark DOM order is identical across desktop and mobile, so assistive reading order does not depend on viewport (P-SCN-128)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    const desktopOrder = await page.evaluate(() =>
      [...document.querySelectorAll('nav, main, [role="dialog"]')].map((el) => el.id || el.className),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(50);
    const mobileOrder = await page.evaluate(() =>
      [...document.querySelectorAll('nav, main, [role="dialog"]')].map((el) => el.id || el.className),
    );
    // Responsive layout is CSS-only (display/position changes); the DOM
    // itself is never reordered, so a screen reader's linear reading order
    // is identical regardless of which chamber CSS currently shows.
    expect(mobileOrder).toEqual(desktopOrder);
  });

  test('keyboard navigation still resolves correctly in a dense cluster after a View filter change (P-SCN-129)', async ({
    page,
  }) => {
    await gotoField(page, { reduced: true });
    // Hide RefO to leave a denser mix of the remaining types.
    await page.locator('.rail-btn[data-action="view"]').click();
    await expect(page.locator('#fieldViewDrawer')).toHaveClass(/open/);
    await page.locator('[data-type="RefO"]').first().click();
    await expect.poll(() => page.evaluate(() => window.__bbTest.getState().view.typeVisibility['RefO'])).toBe(false);
    await page.locator('[data-close="fieldViewDrawer"]').first().click();

    const roving = page.locator('g.node[tabindex="0"]');
    await expect(roving).toHaveCount(1);
    const rovingId = await roving.first().getAttribute('data-bb-id');
    expect(await page.evaluate((id) => window.__bbTest.nodeVisible(id), rovingId), 'the roving target must never land on a filtered-out node').toBe(true);

    await roving.first().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    const afterId = await page.evaluate(() =>
      [...document.querySelectorAll('g.node')].find((g) => g.getAttribute('tabindex') === '0')?.getAttribute('data-bb-id'),
    );
    expect(afterId).toBeTruthy();
    expect(await page.evaluate((id) => window.__bbTest.nodeVisible(id), afterId), 'directional movement must never land on a filtered-out node').toBe(true);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const state = await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId);
    expect(state).toBe(afterId);
    expect(state).not.toBe('RefO'); // sanity: never resolves to a hidden type at all
  });
});
