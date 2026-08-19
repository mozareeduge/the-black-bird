'use strict';
const { test, expect } = require('@playwright/test');
const { gotoField, clickNode } = require('../bb-helpers.cjs');
const path = require('path');
const { pathToFileURL } = require('url');

function modulePath(rel) {
  return pathToFileURL(path.resolve(__dirname, rel)).href;
}

async function loadModels() {
  const { DATA } = await import(modulePath('../../src/data/canonical-data.js'));
  const models = await import(modulePath('../../src/domain/reader-view-models.js'));
  const nodesById = Object.fromEntries(DATA.nodes.map((n) => [n.id, n]));
  const ctx = { nodesById, texts: DATA.texts, nameos: DATA.nameos, refs: DATA.refs, relations: DATA.relations };
  return { DATA, ctx, ...models };
}

test.describe('Reader subject view models and renderer (T18)', () => {
  test('object, projected-edge, and orientation subjects are structurally distinct models', async () => {
    const { DATA, ctx, buildObjectViewModel, buildProjectedEdgeViewModel, buildOrientationViewModel } = await loadModels();
    const anyFO = DATA.nodes.find((n) => n.type === 'FO' && n.id !== 'FO.BLACK_BIRD_FIELD');
    const object = buildObjectViewModel(anyFO.id, ctx);
    const edge = buildProjectedEdgeViewModel('FO.CAIN', 'FO.CORPSE', ['RelO.R7080EA25']);
    const orientation = buildOrientationViewModel(DATA.docs);
    const kinds = [object.kind, edge.kind, orientation.kind];
    expect(new Set(kinds).size).toBe(3);
    expect(object.node).toBeTruthy();
    expect(edge.node).toBeUndefined();
    expect(orientation.node).toBeUndefined();
  });

  test('every one of the six canonical object types produces a view model that preserves canonical text and links exactly, with no generated filler', async () => {
    const { DATA, ctx, buildObjectViewModel } = await loadModels();
    const byType = {};
    for (const n of DATA.nodes) if (!byType[n.type]) byType[n.type] = n.id;
    expect(Object.keys(byType).sort()).toEqual(['FO', 'MNO', 'NameO', 'RNO', 'RefO', 'RelO'].sort());

    for (const [type, id] of Object.entries(byType)) {
      const vm = buildObjectViewModel(id, ctx);
      expect(vm, `no view model for ${type}`).toBeTruthy();
      expect(vm.node.id).toBe(id);
      if (type === 'RNO' || type === 'MNO') {
        expect(vm.body).toBe(DATA.texts[id].body);
        expect(vm.objects).toEqual(DATA.texts[id].objects || []);
      } else if (type === 'NameO') {
        expect(vm.gloss).toBe(DATA.nameos[id].gloss);
        expect(vm.sourceLayer).toBe(DATA.nameos[id].sourceLayer);
      } else if (type === 'RefO') {
        expect(vm.citation).toBe(DATA.refs[id].citation);
      } else if (type === 'RelO') {
        expect(vm.participants).toEqual(DATA.relations[id] || []);
      } else if (type === 'FO') {
        expect(Array.isArray(vm.relos)).toBe(true);
      }
    }
  });

  test('projected-edge inspection never changes the Reader subject into an object model, matching P-RULE-014', async () => {
    const { buildProjectedEdgeViewModel } = await loadModels();
    const vm = buildProjectedEdgeViewModel('FO.CAIN', 'FO.CORPSE', ['RelO.R7080EA25']);
    expect(vm.kind).toBe('projected-edge');
    expect(vm.sourceId).toBe('FO.CAIN');
    expect(vm.targetId).toBe('FO.CORPSE');
    expect(vm.relOIds).toEqual(['RelO.R7080EA25']);
  });

  test('detached render commits only for the still-active transaction (T-REQ-024)', async () => {
    const { createReaderRenderer } = await import(modulePath('../../src/presentation/reader-renderer.js'));
    const container = { replaceChildren: [] };
    container.replaceChildren = (content) => container.lastContent = content;
    let activeTxId = 1;
    const isActive = (txId) => txId === activeTxId;
    let buildCalls = 0;
    const build = (vm) => {
      buildCalls += 1;
      return { vm };
    };
    const renderer = createReaderRenderer({ container, isActive, build });

    const fresh = renderer.commit({ kind: 'orientation' }, 1);
    expect(fresh.committed).toBe(true);
    expect(container.lastContent).toEqual({ vm: { kind: 'orientation' } });

    activeTxId = 2; // a newer transaction supersedes txId 1
    container.lastContent = null;
    const stale = renderer.commit({ kind: 'object' }, 1);
    expect(stale.committed).toBe(false);
    expect(container.lastContent, 'a stale commit must never touch the live container').toBe(null);
    expect(buildCalls).toBe(2, 'build still runs (detached, side-effect-free) even for a transaction that turns out stale');
  });

  test('the live Reader panel actually displays the same canonical text and citation the view model carries, for a representative RefO', async ({
    page,
  }) => {
    const { DATA, ctx, buildObjectViewModel } = await loadModels();
    const refId = DATA.nodes.find((n) => n.type === 'RefO').id;
    const vm = buildObjectViewModel(refId, ctx);

    await gotoField(page, { reduced: true });
    await clickNode(page, refId);
    const rendered = await page.evaluate(() => document.getElementById('reader')?.textContent || '');
    expect(rendered).toContain(vm.citation);
  });

  test('the live Reader panel preserves RNO/MNO canonical body text without paraphrase', async ({ page }) => {
    const { DATA, ctx, buildObjectViewModel } = await loadModels();
    const rnoId = DATA.nodes.find((n) => n.type === 'RNO').id;
    const vm = buildObjectViewModel(rnoId, ctx);
    const plainBody = vm.body.replace(/<[^>]+>/g, '');

    await gotoField(page, { reduced: true });
    await clickNode(page, rnoId);
    const rendered = await page.evaluate(() => document.getElementById('reader')?.textContent || '');
    // Compare on a normalized substring since the live DOM collapses whitespace differently.
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    expect(normalize(rendered)).toContain(normalize(plainBody).slice(0, 40));
  });

  test('the live Reader panel lists FO and RelO real canonical relations, not a paraphrase or omission (P-SCN-023/026)', async ({
    page,
  }) => {
    // RNO/MNO (above) and RefO/NameO (elsewhere in this file) already get a
    // live-DOM check; FO and RelO -- both separately named scenarios -- only
    // had the type-generic view-model unit test, never a live-render check.
    // Unlike RNO/MNO/RefO, FO and RelO have no prose `body` at all (they're
    // structural/relational objects) -- their Reader content is a rendered
    // index list of related ids (vm.relos/appearsIn/sourceNames for FO,
    // vm.participants for RelO), so the meaningful check is that those real
    // canonical ids actually appear as index items, not a body-text match.
    const { DATA, ctx, buildObjectViewModel } = await loadModels();
    const foId = DATA.nodes.find((n) => n.type === 'FO' && n.id !== 'FO.BLACK_BIRD_FIELD' && buildObjectViewModel(n.id, ctx).relos.length).id;
    const relId = DATA.nodes.find((n) => n.type === 'RelO').id;

    await gotoField(page, { reduced: true });

    const foVm = buildObjectViewModel(foId, ctx);
    await clickNode(page, foId);
    const foIndexIds = await page.evaluate(() => [...document.querySelectorAll('#reader .index-item')].map((el) => el.dataset.id));
    for (const relatedId of foVm.relos) expect(foIndexIds).toContain(relatedId);

    const relVm = buildObjectViewModel(relId, ctx);
    await clickNode(page, relId);
    const relIndexIds = await page.evaluate(() => [...document.querySelectorAll('#reader .index-item')].map((el) => el.dataset.id));
    for (const participantId of relVm.participants) expect(relIndexIds).toContain(participantId);
  });

  test('following an inline MNO link commits its target (P-SCN-027)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    // MNO.WINDOW_DARKNESS body links to FO.WINDOW (verified against canonical-data.js).
    await clickNode(page, 'MNO.WINDOW_DARKNESS__F488DD0A');
    const link = page.locator('#reader .fl[data-id="FO.WINDOW"]').first();
    await expect(link).toBeVisible();
    await link.click();
    const activeId = await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId);
    expect(activeId).toBe('FO.WINDOW');
  });

  test('following an RNO chip/list link commits its target (P-SCN-028)', async ({ page }) => {
    await gotoField(page, { reduced: true });
    // RNO.GHURAB_BURIAL's objects chip-row includes FO.CAIN (verified against canonical-data.js).
    await clickNode(page, 'RNO.GHURAB_BURIAL__424A0ECF');
    const chip = page.locator('#reader .chip[data-id="FO.CAIN"]').first();
    await expect(chip).toBeVisible();
    await chip.click();
    const activeId = await page.evaluate(() => window.__bbTest.getUiRuntime().focusedId);
    expect(activeId).toBe('FO.CAIN');
  });

  test('Reader index-list cross-references (appears in / relation objects) show the full canonical RNO/MNO title and the full opaque RelO id, never the compact shortLabel (baseline-preservation P2, H-VIS reader semantics)', async ({
    page,
  }) => {
    const { DATA } = await loadModels();
    const nodesById = Object.fromEntries(DATA.nodes.map((n) => [n.id, n]));
    // FO.CORPSE appears in multiple RNOs/MNOs and participates in multiple RelOs
    // (verified against canonical-data.js), so its FO Reader panel exercises both
    // the "appears in" and "relation objects" index-list sections.
    const foId = 'FO.CORPSE';
    const appearsInIds = Object.entries(DATA.texts)
      .filter(([, t]) => (t.objects || []).includes(foId))
      .map(([id]) => id);
    const relOIds = Object.entries(DATA.relations)
      .filter(([, participants]) => participants.includes(foId))
      .map(([id]) => id);
    expect(appearsInIds.length).toBeGreaterThan(0);
    expect(relOIds.length).toBeGreaterThan(0);

    await gotoField(page, { reduced: true });
    await clickNode(page, foId);
    const titles = await page.locator('#reader .index-item .idx-title').allTextContents();

    for (const id of appearsInIds) {
      const fullTitle = nodesById[id].label;
      const shortTitle = nodesById[id].shortLabel;
      expect(titles, `expected full RNO/MNO title "${fullTitle}" for ${id}`).toContain(fullTitle);
      if (shortTitle !== fullTitle) {
        expect(titles, `must not show compact shortLabel "${shortTitle}" for ${id} in the Reader index`).not.toContain(
          shortTitle
        );
      }
    }
    for (const id of relOIds) {
      // A RelO's canonical `label` *is* its full opaque id (e.g. "RelO.R7080EA25").
      expect(titles, `expected full opaque RelO id "${id}" in the Reader index`).toContain(id);
      const shortTitle = nodesById[id].shortLabel;
      expect(titles, `must not show compact shortLabel "${shortTitle}" for ${id} in the Reader index`).not.toContain(
        shortTitle
      );
    }
  });

  test('a NameO Reader panel preserves source-script (Arabic) rendering: the wrapped run keeps its literal script, lang="ar" and dir="rtl", inside otherwise-LTR gloss/source-layer prose (baseline-preservation P2)', async ({
    page,
  }) => {
    const { DATA, ctx, buildObjectViewModel } = await loadModels();
    const nameoId = 'NameO.AR.GHURAB';
    const vm = buildObjectViewModel(nameoId, ctx);
    expect(vm.gloss).toContain('غراب');

    await gotoField(page, { reduced: true });
    await clickNode(page, nameoId);
    const arabicRuns = await page.locator('#reader .bb-arabic').all();
    expect(arabicRuns.length, 'expected at least one Arabic-script span in the NameO Reader panel').toBeGreaterThan(0);
    for (const run of arabicRuns) {
      expect(await run.getAttribute('lang')).toBe('ar');
      expect(await run.getAttribute('dir')).toBe('rtl');
    }
    const runTexts = await Promise.all(arabicRuns.map((r) => r.textContent()));
    expect(runTexts.join('')).toContain('غراب');
    const rendered = await page.evaluate(() => document.getElementById('reader')?.textContent || '');
    expect(rendered).toContain(DATA.nameos[nameoId].sourceLayer);
    expect(rendered).toContain(DATA.nameos[nameoId].gloss.replace(/\n/g, ''));
  });

  test('a NameO Reader panel shows its full mixed-script label exactly once, with no redundant second paragraph (FQ-01 regression)', async ({
    page,
  }) => {
    // buildNameoContent() used to render vm.node.label a second time in a
    // dedicated paragraph immediately below the title -- first with a
    // blanket dir="rtl" that silently mirrored it (fixed earlier this
    // session), then, once that bidi bug was fixed, as a merely redundant
    // repeat of content already shown in the title. The duplicate paragraph
    // is removed entirely; metaBlock's title is the single canonical
    // rendering. Real per-run Arabic marking (lang="ar"/dir="rtl") still
    // exists where it's semantically needed: the gloss/sourceLayer prose.
    await gotoField(page, { reduced: true });
    await clickNode(page, 'NameO.AR.GHURAB');
    const reader = page.locator('#reader');
    const fullLabel = 'ghurāb / غراب';

    // TYPO-01: metaBlock() now wraps the title's Arabic run with the same
    // per-run lang="ar"/dir="rtl" span the rest of the Reader uses, instead
    // of writing node.label as one plain text node -- so the title is no
    // longer a leaf, but its own combined text is still exactly the full
    // canonical label, rendered exactly once.
    const title = reader.locator('.title');
    await expect(title).toHaveText(fullLabel);

    const titleArabic = title.locator('.bb-arabic');
    await expect(titleArabic).toHaveCount(1);
    await expect(titleArabic).toHaveText('غراب');
    expect(await titleArabic.getAttribute('lang')).toBe('ar');
    expect(await titleArabic.getAttribute('dir')).toBe('rtl');

    const bodyText = await reader.textContent();

    // No OTHER leaf element repeats the full label as a duplicate paragraph.
    // (The gloss prose legitimately starts with the same words as its own
    // real content -- "ghurāb / غراب. A source-language..." -- so a raw
    // substring count over the whole panel's text would conflate that
    // genuine content with a duplicated standalone label; this checks
    // structure, not a substring.)
    const standaloneLabelElements = await reader
      .locator('*')
      .evaluateAll((els, label) => els.filter((el) => el.children.length === 0 && el.textContent.trim() === label).length, fullLabel);
    expect(
      standaloneLabelElements,
      'expected no leaf element whose entire text is the full label outside the title -- one would mean a duplicate label paragraph survived'
    ).toBe(0);

    // No redundant label paragraph of any kind survives.
    await expect(reader.locator('.bb-arabic-label')).toHaveCount(0);

    // Arabic runs in the title and remaining content (gloss/sourceLayer)
    // still get correct per-run lang="ar"/dir="rtl" -- appendArabicWrapped's
    // pattern, untouched by this change.
    const arabicRuns = await reader.locator('.bb-arabic').all();
    expect(arabicRuns.length, 'expected Arabic-script spans in the title and remaining NameO content').toBeGreaterThan(1);
    for (const run of arabicRuns) {
      expect(await run.getAttribute('lang')).toBe('ar');
      expect(await run.getAttribute('dir')).toBe('rtl');
    }
    const runTexts = await Promise.all(arabicRuns.map((r) => r.textContent()));
    expect(runTexts.join('')).toContain('غراب');

    // sourceLayer and gloss content is unchanged.
    expect(bodyText).toContain('Quranic Arabic / tafsīr Arabic');
    expect(bodyText).toContain('A source-language black-bird name conventionally translated as crow or raven.');
  });
});
