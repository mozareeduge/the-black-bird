import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/state/initial-state.js';
import { assertStateInvariants } from '../../src/state/invariants.js';
import { readContract } from '../contracts/load.mjs';

// Loaded from tests/contracts/state-contract.json -- a committed copy of the
// recomposition authority's state-contract.json, not the ephemeral
// .bb-authority/ overlay itself (that directory is intentionally never
// committed, so a runtime dependency on it would make this test unrunnable
// for anyone -- or any CI -- checking out the branch without it installed
// locally). Asserting against the fixture, rather than a hand-copied
// literal, means a future contract change shows up as a visible fixture
// diff instead of this test silently drifting out of sync with it.
const STATE_CONTRACT = readContract('state-contract.json');

test('createInitialState() matches the state contract exactly', () => {
  assert.deepEqual(createInitialState(), STATE_CONTRACT.initial);
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
  s.history.route = [{ id: 'FO.CORPSE', sequence: 1 }];
  s.history.nextSequence = 2;
  const result = assertStateInvariants(s);
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test('anchorId null after a commit is a violation', () => {
  const s = createInitialState();
  s.history.route = [{ id: 'FO.CORPSE', sequence: 1 }];
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
