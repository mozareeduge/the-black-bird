import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNodeVisible, reconcileHiddenAnchor, restoreVisibility } from '../../src/domain/visibility.js';
import { computeSoloMembership, enterSolo, exitSolo } from '../../src/domain/solo.js';
import { selectVisibleNodeIds, selectVisibleBaseEdges, selectFocusSet, selectReaderViewModel } from '../../src/domain/selectors.js';
import { createInitialState } from '../../src/state/initial-state.js';

const NODES = [
  { id: 'FO.CAIN', type: 'FO' },
  { id: 'FO.ABEL', type: 'FO' },
  { id: 'FO.CORPSE', type: 'FO' },
  { id: 'RelO.R1', type: 'RelO' },
];
const NODES_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));
const RELATIONS = { 'RelO.R1': ['FO.CAIN', 'FO.ABEL', 'FO.CORPSE'] };

function baseView() {
  return createInitialState().view;
}

test('individual hide always hides, regardless of type visibility (structural, no ontology change)', () => {
  const view = { ...baseView(), objectVisibility: { 'FO.CAIN': false } };
  assert.equal(isNodeVisible(NODES_BY_ID['FO.CAIN'], view), false);
  assert.equal(isNodeVisible(NODES_BY_ID['FO.ABEL'], view), true);
});

test('a group-hidden type stays hidden even without an individual override (P-RULE-016)', () => {
  const view = { ...baseView(), typeVisibility: { ...baseView().typeVisibility, FO: false } };
  assert.equal(isNodeVisible(NODES_BY_ID['FO.CAIN'], view), false);
  // "Index Open removes an individual hide... does not override an intentionally
  // disabled type group": clearing the individual entry does not force it visible.
  const viewWithClearedIndividualHide = { ...view, objectVisibility: {} };
  assert.equal(isNodeVisible(NODES_BY_ID['FO.CAIN'], viewWithClearedIndividualHide), false);
});

test('restoreVisibility clears every type toggle and every individual hide', () => {
  const view = {
    ...baseView(),
    typeVisibility: { ...baseView().typeVisibility, FO: false, RelO: false },
    objectVisibility: { 'FO.CAIN': false },
  };
  const restored = restoreVisibility(view);
  assert.ok(Object.values(restored.typeVisibility).every((v) => v === true));
  assert.deepEqual(restored.objectVisibility, {});
});

test('a focused object going invisible neutralizes field attention but leaves the anchor and Reader subject explicit (P-RULE-015)', () => {
  const s0 = createInitialState();
  const reading = {
    ...s0.reading,
    anchorId: 'FO.CAIN',
    fieldAttention: { kind: 'focus', id: 'FO.CAIN' },
    readerSubject: { kind: 'object', id: 'FO.CAIN' },
  };
  const hiddenView = { ...baseView(), objectVisibility: { 'FO.CAIN': false } };
  const reconciled = reconcileHiddenAnchor(reading, NODES_BY_ID['FO.CAIN'], hiddenView);
  assert.equal(reconciled.fieldAttention.kind, 'whole-field');
  assert.equal(reconciled.anchorId, 'FO.CAIN', 'the reading anchor must remain, not be silently cleared');
  assert.equal(reconciled.readerSubject.id, 'FO.CAIN', 'the Reader subject must remain');
});

test('reconcileHiddenAnchor is a no-op when the focused object is still visible', () => {
  const s0 = createInitialState();
  const reading = { ...s0.reading, anchorId: 'FO.CAIN', fieldAttention: { kind: 'focus', id: 'FO.CAIN' } };
  const visibleView = baseView();
  const reconciled = reconcileHiddenAnchor(reading, NODES_BY_ID['FO.CAIN'], visibleView);
  assert.equal(reconciled, reading);
});

test('RelO Solo membership is the RelO plus every canonical participant, exactly (P-RULE-013)', () => {
  const members = computeSoloMembership('RelO.R1', { nodesById: NODES_BY_ID, relations: RELATIONS });
  assert.deepEqual([...members].sort(), ['FO.ABEL', 'FO.CAIN', 'FO.CORPSE', 'RelO.R1'].sort());
});

test('object Solo membership is the object, its containing RelOs, and their participants, exactly (P-RULE-013)', () => {
  const members = computeSoloMembership('FO.CAIN', { nodesById: NODES_BY_ID, relations: RELATIONS });
  assert.deepEqual([...members].sort(), ['FO.ABEL', 'FO.CAIN', 'FO.CORPSE', 'RelO.R1'].sort());
});

test('an object in no relation has Solo membership of exactly itself', () => {
  const isolatedNodesById = { ...NODES_BY_ID, 'FO.LONE': { id: 'FO.LONE', type: 'FO' } };
  const members = computeSoloMembership('FO.LONE', { nodesById: isolatedNodesById, relations: RELATIONS });
  assert.deepEqual([...members], ['FO.LONE']);
});

test('enter/exit Solo never appends Route or trace (no such state is even reachable from these functions)', () => {
  const s0 = createInitialState();
  const solo1 = enterSolo(s0, 'FO.CAIN', () => computeSoloMembership('FO.CAIN', { nodesById: NODES_BY_ID, relations: RELATIONS }));
  assert.equal(solo1.active, true);
  assert.equal(solo1.rootId, 'FO.CAIN');
  assert.deepEqual([...solo1.members].sort(), ['FO.ABEL', 'FO.CAIN', 'FO.CORPSE', 'RelO.R1'].sort());
  assert.ok(solo1.snapshot);
});

test('exit Solo restores the snapshot captured on entry, exactly (P-RULE-012)', () => {
  const s0 = createInitialState();
  const viewBeforeSolo = { ...s0.view, typeVisibility: { ...s0.view.typeVisibility, RelO: false } };
  const stateBeforeSolo = { ...s0, view: viewBeforeSolo };
  const solo = enterSolo(stateBeforeSolo, 'FO.CAIN', () =>
    computeSoloMembership('FO.CAIN', { nodesById: NODES_BY_ID, relations: RELATIONS })
  );
  const stateInSolo = { ...stateBeforeSolo, solo, view: { ...viewBeforeSolo, typeVisibility: { ...viewBeforeSolo.typeVisibility, FO: false } } };
  const exited = exitSolo(stateInSolo);
  assert.equal(exited.solo.active, false);
  assert.equal(exited.solo.snapshot, null);
  assert.deepEqual(exited.view, viewBeforeSolo, 'view must be restored to exactly what it was before entering Solo');
});

test('re-entering Solo with a different root while already active keeps the original snapshot (captured once on entry)', () => {
  const s0 = createInitialState();
  const solo1 = enterSolo(s0, 'FO.CAIN', () => new Set(['FO.CAIN']));
  const stateInSolo = { ...s0, solo: solo1 };
  const solo2 = enterSolo(stateInSolo, 'FO.ABEL', () => new Set(['FO.ABEL']));
  assert.equal(solo2.rootId, 'FO.ABEL');
  assert.equal(solo2.snapshot, solo1.snapshot, 'the snapshot must not be recaptured while Solo is already active');
});

test('selectVisibleNodeIds / selectVisibleBaseEdges respect View without touching ontology', () => {
  const view = { ...baseView(), objectVisibility: { 'FO.ABEL': false } };
  const visibleIds = selectVisibleNodeIds(NODES, view);
  assert.ok(!visibleIds.includes('FO.ABEL'));
  assert.ok(visibleIds.includes('FO.CAIN'));

  const edges = [
    { source: 'FO.CAIN', target: 'FO.ABEL' },
    { source: 'FO.CAIN', target: 'FO.CORPSE' },
  ];
  const visibleEdges = selectVisibleBaseEdges(edges, view, NODES_BY_ID);
  assert.deepEqual(visibleEdges, [{ source: 'FO.CAIN', target: 'FO.CORPSE' }]);
});

test('selectFocusSet and selectReaderViewModel read only the reading region', () => {
  const s0 = createInitialState();
  const reading = { ...s0.reading, fieldAttention: { kind: 'focus', id: 'FO.CAIN' }, readerSubject: { kind: 'object', id: 'FO.CAIN' } };
  assert.deepEqual(selectFocusSet(reading), new Set(['FO.CAIN']));
  const viewModel = selectReaderViewModel(reading, NODES_BY_ID);
  assert.equal(viewModel.kind, 'object');
  assert.equal(viewModel.node.id, 'FO.CAIN');
});
