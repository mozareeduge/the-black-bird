import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, AUTHORED_HOMES, homeFor } from '../../src/layout/authored-world.js';
// src/data/world-layout.json is a committed, byte-identical copy of the
// recomposition authority's world-layout contract (verified by diff when it
// was added) — comparing against it, not against .bb-authority/ at runtime,
// keeps this test runnable for anyone checking out the branch without the
// (intentionally uncommitted) overlay installed, including CI.
import contract from '../../src/data/world-layout.json' with { type: 'json' };

test('WORLD matches the authority contract exactly', () => {
  assert.deepEqual(WORLD, contract.world);
});

test('all 50 homes equal the contract exactly (T-REQ-014)', () => {
  assert.equal(Object.keys(AUTHORED_HOMES).length, 50);
  for (const n of contract.nodes) {
    assert.deepEqual(homeFor(n.id), { x: n.x, y: n.y, cluster: n.cluster });
  }
});

test('homeFor returns null for an unknown id, never a fabricated home', () => {
  assert.equal(homeFor('FO.DOES_NOT_EXIST'), null);
});

test('AUTHORED_HOMES is frozen: nothing can mutate the authored world at runtime (viewport cannot mutate topology)', () => {
  assert.ok(Object.isFrozen(AUTHORED_HOMES));
  const home = homeFor('FO.BLACK_BIRD_FIELD');
  assert.ok(Object.isFrozen(home));
  assert.throws(() => {
    'use strict';
    home.x = 999;
  }, TypeError);
  assert.equal(homeFor('FO.BLACK_BIRD_FIELD').x, contract.nodes.find((n) => n.id === 'FO.BLACK_BIRD_FIELD').x);
});

test('WORLD is frozen and independent of any viewport/window size', () => {
  assert.ok(Object.isFrozen(WORLD));
  assert.throws(() => {
    'use strict';
    WORLD.width = 1;
  }, TypeError);
});
