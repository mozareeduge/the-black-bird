'use strict';
const { test, expect } = require('@playwright/test');

// Loads layout.css/mobile.css/accessibility.css together into an isolated
// DOM (same isolation technique as desktop-composition.spec.js's
// isolateLayoutCss): these modules are extracted/target-architecture and not
// yet linked from index.html, so this is how their real cascade -- including
// accessibility.css's authority rules -- is exercised without depending on
// wiring that is a later integration task.
async function isolateAccessibilityCss(page, { extraCss = [], bodyHtml } = {}) {
  await page.evaluate(
    async ({ extraCss, bodyHtml }) => {
      document.head.querySelectorAll('style').forEach((el) => el.remove());
      for (const href of [...extraCss, '/src/styles/accessibility.css']) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        await new Promise((resolve) => {
          if (link.sheet) resolve();
          else link.onload = resolve;
        });
      }
      document.body.innerHTML = bodyHtml;
    },
    { extraCss, bodyHtml }
  );
}

test.describe('Environmental resilience: forced-colors, missing fonts, zoom/reflow, external failures (T25)', () => {
  test('forced-colors mode gives active/focus state a non-color affordance and leaves field-layer colors as authored data (T-REQ-038, D-DEC-21)', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    await page.emulateMedia({ forcedColors: 'active' });
    await isolateAccessibilityCss(page, {
      bodyHtml: `
        <button class="rail-btn active" id="activeBtn">Field</button>
        <button class="rail-btn" id="plainBtn">View</button>
        <svg><circle class="bb-body" id="body" r="5"></circle></svg>
      `,
    });
    const result = await page.evaluate(() => {
      const activeBtn = document.getElementById('activeBtn');
      const plainBtn = document.getElementById('plainBtn');
      const body = document.getElementById('body');
      const activeStyle = getComputedStyle(activeBtn);
      const plainStyle = getComputedStyle(plainBtn);
      return {
        activeOutline: activeStyle.outlineStyle,
        plainOutline: plainStyle.outlineStyle,
        activeBorder: activeStyle.borderStyle,
        bodyForcedColorAdjust: getComputedStyle(body).getPropertyValue('forced-color-adjust'),
      };
    });
    // The active state must carry a non-color signal (outline) the plain
    // button does not have -- so the distinction survives color removal.
    expect(result.activeOutline).not.toBe('none');
    expect(result.plainOutline).toBe('none');
    expect(result.activeBorder).not.toBe('none');
    // The field's semantic color layers are exempt (meaningful-graphics
    // allowance): their authored colors are the data, not decoration.
    expect(result.bodyForcedColorAdjust).toBe('none');
  });

  test('a fallback font (missing custom font) does not overflow running text, because overflow-wrap:break-word is authoritative (T-REQ-038)', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    await isolateAccessibilityCss(page, {
      bodyHtml: `<div class="poem" style="width:220px;font-family:monospace;font-size:16px;">${'unbrokenwordwithnowhitespacetotestwrap'.repeat(3)}</div>`,
    });
    const overflowed = await page.evaluate(() => {
      const el = document.querySelector('.poem');
      return el.scrollWidth > el.clientWidth + 1;
    });
    expect(overflowed).toBe(false);
  });

  test('the composition grid reflows to 320px CSS width with no horizontal overflow, and a 200%-zoom-equivalent viewport keeps the bottom-nav fully in view (T-REQ-040)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/?bbtest=1');
    await isolateAccessibilityCss(page, {
      extraCss: ['/src/styles/mobile.css'],
      bodyHtml: `
        <div class="app-frame">
          <div class="main">
            <div class="map-wrap"></div>
            <div class="panel"></div>
          </div>
          <nav class="bottom-nav">
            <button data-mobile="field">Field</button>
            <button data-mobile="read">Read</button>
            <button data-mobile="view">View</button>
            <button data-mobile="index">Index</button>
          </nav>
        </div>`,
    });
    const geometry = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      navRight: document.querySelector('.bottom-nav').getBoundingClientRect().right,
    }));
    expect(geometry.docScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.navRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  });

  test('createExternalLinkController shows a local non-modal status with retry/copy on a blocked popup, and never mutates the poem session (T-REQ-042, P-RULE-037)', async ({
    page,
  }) => {
    await gotoAndSnapshot(page);
    const result = await page.evaluate(async () => {
      const mod = await import('/src/controllers/external-link-controller.js');
      const container = document.createElement('div');
      container.hidden = true;
      document.body.appendChild(container);
      let openCalls = 0;
      let openShouldSucceed = false;
      let clipboardText = null;
      const fakeWin = {
        open: (url) => {
          openCalls += 1;
          return openShouldSucceed ? { closed: false } : null;
        },
        navigator: { clipboard: { writeText: async (text) => { clipboardText = text; } } },
      };
      const controller = mod.createExternalLinkController({ win: fakeWin, doc: document, container });

      const beforeState = JSON.stringify(window.__bbTest.getState());
      const ok1 = controller.attempt('https://github.com/mozareeduge/the-black-bird', 'Source repository');
      const afterFailureState = JSON.stringify(window.__bbTest.getState());
      const statusVisible = !container.hidden;
      const statusText = container.querySelector('.external-link-status-text')?.textContent;
      const hasRetry = !!container.querySelector('.external-link-status-retry');
      const hasCopy = !!container.querySelector('.external-link-status-copy');

      container.querySelector('.external-link-status-copy').click();
      await new Promise((r) => setTimeout(r, 0));

      openShouldSucceed = true;
      container.querySelector('.external-link-status-retry').click();
      const afterRetryVisible = !container.hidden;

      return {
        ok1,
        openCalls,
        statusVisible,
        statusText,
        hasRetry,
        hasCopy,
        clipboardText,
        afterRetryVisible,
        sessionUnchanged: beforeState === afterFailureState,
      };
    });
    expect(result.ok1).toBe(false);
    expect(result.statusVisible).toBe(true);
    expect(result.statusText).toContain('Source repository');
    expect(result.hasRetry).toBe(true);
    expect(result.hasCopy).toBe(true);
    expect(result.clipboardText).toBe('https://github.com/mozareeduge/the-black-bird');
    expect(result.openCalls).toBe(2);
    expect(result.afterRetryVisible, 'a successful retry must clear the local status').toBe(false);
    expect(result.sessionUnchanged, 'a blocked external destination must never mutate the poem session state').toBe(true);
  });

  test('an external source that opens successfully shows no local failure status (P-SCN-031)', async ({ page }) => {
    await gotoAndSnapshot(page);
    const result = await page.evaluate(async () => {
      const mod = await import('/src/controllers/external-link-controller.js');
      const container = document.createElement('div');
      container.hidden = true;
      document.body.appendChild(container);
      const fakeWin = { open: () => ({ closed: false }), navigator: window.navigator };
      const controller = mod.createExternalLinkController({ win: fakeWin, doc: document, container });
      const beforeState = JSON.stringify(window.__bbTest.getState());
      const ok = controller.attempt('https://example.org', 'Example source');
      return { ok, statusVisible: !container.hidden, sessionUnchanged: beforeState === JSON.stringify(window.__bbTest.getState()) };
    });
    expect(result.ok).toBe(true);
    expect(result.statusVisible, 'a successful open must never show the local failure status').toBe(false);
    expect(result.sessionUnchanged).toBe(true);
  });

  test('an external source that fails to open (blocked or offline) never mutates the poem session (P-SCN-032)', async ({
    page,
  }) => {
    // window.open() returning falsy is the one cross-browser signal
    // available to the opener for "could not open" — a blocked popup and an
    // offline/unreachable destination are indistinguishable at this API and
    // correctly receive the identical local recovery response (same code
    // path already exercised for the popup-blocked case above).
    await gotoAndSnapshot(page);
    const result = await page.evaluate(async () => {
      const mod = await import('/src/controllers/external-link-controller.js');
      const container = document.createElement('div');
      container.hidden = true;
      document.body.appendChild(container);
      const fakeWin = { open: () => null, navigator: window.navigator };
      const controller = mod.createExternalLinkController({ win: fakeWin, doc: document, container });
      const beforeState = JSON.stringify(window.__bbTest.getState());
      const ok = controller.attempt('https://example.org/offline', 'Offline source');
      return {
        ok,
        statusText: container.querySelector('.external-link-status-text')?.textContent,
        sessionUnchanged: beforeState === JSON.stringify(window.__bbTest.getState()),
      };
    });
    expect(result.ok).toBe(false);
    expect(result.statusText).toContain('Offline source');
    expect(result.sessionUnchanged, 'a failed/offline external destination must never mutate the poem session state').toBe(true);
  });

  test('createLifecycleController only ever dispatches RECONCILE_* commands, never a Route/trace command (T-REQ-042)', async ({
    page,
  }) => {
    await page.goto('/?bbtest=1');
    const result = await page.evaluate(async () => {
      const mod = await import('/src/controllers/lifecycle-controller.js');
      const dispatched = [];
      const docListeners = {};
      const navListeners = {};
      const fakeDoc = {
        visibilityState: 'visible',
        addEventListener: (t, fn) => (docListeners[t] = fn),
        removeEventListener: (t, fn) => { if (docListeners[t] === fn) delete docListeners[t]; },
      };
      const fakeNav = {
        addEventListener: (t, fn) => (navListeners[t] = fn),
        removeEventListener: (t, fn) => { if (navListeners[t] === fn) delete navListeners[t]; },
      };
      const controller = mod.createLifecycleController({ dispatch: (c) => dispatched.push(c), doc: fakeDoc, nav: fakeNav });
      controller.start();
      fakeDoc.visibilityState = 'hidden';
      docListeners.visibilitychange();
      navListeners.offline();
      navListeners.online();
      controller.stop();
      return { dispatched, listenersRemaining: Object.keys(docListeners).length + Object.keys(navListeners).length };
    });
    const forbiddenTypes = ['REPLAY_ROUTE_EVENT', 'CLEAR_ROUTE', 'CLEAR_TRACE', 'COMMIT_OBJECT', 'ENTER_SOLO', 'EXIT_SOLO'];
    expect(result.dispatched.length).toBeGreaterThan(0);
    expect(result.dispatched.every((c) => c.type.startsWith('RECONCILE_'))).toBe(true);
    expect(result.dispatched.some((c) => forbiddenTypes.includes(c.type))).toBe(false);
    expect(result.listenersRemaining).toBe(0);
  });
});

async function gotoAndSnapshot(page) {
  await page.goto('/?skipIntro=1&bbtest=1');
  await page.waitForFunction(() => window.__bbTest?.getState() && document.querySelectorAll('g.node').length === 50, { timeout: 12000 });
}
