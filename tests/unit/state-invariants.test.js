import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/state/initial-state.js';
import { assertStateInvariants } from '../../src/state/invariants.js';

// Pinned to the recomposition authority's state-contract.json `initial` value at the time
// this module was written. Not read from .bb-authority/ at test time: that overlay is
// intentionally never committed, so a runtime dependency on it would make this test
// unrunnable for anyone (or any CI) checking out the branch without it installed locally.
const EXPECTED_INITIAL_STATE = {
  lifecycle: { phase: 'threshold', bootstrap: 'pending', documentVisibility: 'visible', connectivity: 'unknown' },
  responsive: { profile: 'derived', surface: 'field', orientation: 'derived', visualViewport: null },
  reading: {
    anchorId: null,
    fieldAttention: { kind: 'whole-field', id: null },
    readerSubject: { kind: 'orientation', id: null },
    inspection: null,
  },
  history: { route: [], nextSequence: 1 },
  trace: { wear: {}, afterglows: [] },
  view: {
    typeVisibility: { RNO: true, MNO: true, FO: true, NameO: true, RefO: true, RelO: true },
    objectVisibility: {},
    projectedEdges: true,
    labels: true,
    sourceNames: false,
  },
  solo: { active: false, rootId: null, members: [], snapshot: null },
  overlay: { kind: null, invoker: null },
  tooltip: { kind: null, targetId: null, describedById: null },
  focus: { graphRovingId: 'FO.BLACK_BIRD_FIELD', restoreTarget: null },
  presentation: { txId: 0, cameraIntent: null, statusMessage: null },
};

test('createInitialState() matches the state contract exactly', () => {
  assert.deepEqual(createInitialState(), EXPECTED_INITIAL_STATE);
});

test('the initial state satisfies its own invariants', () => {
  const result = assertStateInvariants(createInitialState());
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('fieldAttention and readerSubject vary independently with no forced coupling', () => {
  const s = createInitialState();
  s.reading.fieldAttention = { kind: 'focus', id: 'FO.CORPSE' };
  s.reading.readerSubject = { kind: 'orientation', id: null };
  const result = assertStateInvariants(s);
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test('return-to-field does not require clearing the reading anchor', () => {
  const s = createInitialState();
  // Simulate: a commit happened (anchor set, one route entry), then the field
  // returned to whole-field attention. The anchor and Reader subject stay put.
  s.reading.anchorId = 'FO.CORPSE';
  s.reading.readerSubject = { kind: 'object', id: 'FO.CORPSE' };
  s.reading.fieldAttention = { kind: 'whole-field', id: null };
  s.history.route = [{ id: 'FO.CORPSE', seq: 1 }];
  s.history.nextSequence = 2;
  const result = assertStateInvariants(s);
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test('anchorId null after a commit is a violation', () => {
  const s = createInitialState();
  s.history.route = [{ id: 'FO.CORPSE', seq: 1 }];
  s.history.nextSequence = 2;
  // anchorId left at null: invalid, a commit happened but nothing anchors reading.
  const result = assertStateInvariants(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('anchorId')));
});

test('solo.active without a captured snapshot is a violation', () => {
  const s = createInitialState();
  s.solo.active = true;
  const result = assertStateInvariants(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('solo')));
});

test('solo snapshot left set after exit is a violation', () => {
  const s = createInitialState();
  s.solo.active = false;
  s.solo.snapshot = { visibility: {} };
  const result = assertStateInvariants(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('solo')));
});

test('an afterglow entry without a numeric wall-clock deadline is a violation', () => {
  const s = createInitialState();
  s.trace.afterglows = [{ id: 'FO.CORPSE' }];
  const result = assertStateInvariants(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('afterglows')));
});
