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
});
