'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField } = require('../bb-helpers.cjs');

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
});
