import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreLabelCandidate, solveLabels, CANDIDATE_SIDES } from '../../src/layout/label-solver.js';
import { readContract } from '../contracts/load.mjs';

const LABELS_CONTRACT = readContract('algorithm-contracts.json').labels;

test('CANDIDATE_SIDES matches the algorithm contract\'s candidate list and tie-break order exactly', () => {
  assert.deepEqual(CANDIDATE_SIDES, LABELS_CONTRACT.candidates);
  assert.deepEqual(CANDIDATE_SIDES, LABELS_CONTRACT.tieBreakOrder);
});

const SIZE = { width: 60, height: 16 };

function candidatesAround(anchor, size = SIZE, offset = 15) {
  const { width, height } = size;
  const positions = {
    below: { x: anchor.x - width / 2, y: anchor.y + offset },
    above: { x: anchor.x - width / 2, y: anchor.y - offset - height },
    right: { x: anchor.x + offset, y: anchor.y - height / 2 },
    left: { x: anchor.x - offset - width, y: anchor.y - height / 2 },
    'lower-right': { x: anchor.x + offset * 0.7, y: anchor.y + offset * 0.7 },
    'lower-left': { x: anchor.x - offset * 0.7 - width, y: anchor.y + offset * 0.7 },
    'upper-right': { x: anchor.x + offset * 0.7, y: anchor.y - offset * 0.7 - height },
    'upper-left': { x: anchor.x - offset * 0.7 - width, y: anchor.y - offset * 0.7 - height },
  };
  return CANDIDATE_SIDES.map((side) => ({ side, rect: { ...positions[side], width, height } }));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('every one of the eight candidates is scored', () => {
  const candidates = candidatesAround({ x: 500, y: 500 });
  assert.equal(candidates.length, 8);
  const scored = candidates.map((c) => scoreLabelCandidate(c.rect, c.side, {}));
  assert.equal(scored.length, 8);
  assert.deepEqual(
    scored.map((s) => s.side).sort(),
    [...CANDIDATE_SIDES].sort()
  );
  for (const s of scored) assert.equal(typeof s.cost, 'number');
});

test('an unobstructed candidate has zero overlap and zero cost', () => {
  const rect = { x: 100, y: 100, width: 60, height: 16 };
  const s = scoreLabelCandidate(rect, 'below', {});
  assert.equal(s.hasOverlap, false);
  assert.equal(s.cost, 0);
});

test('overlapping a placed label, a body, or a focus contour raises cost and marks hasOverlap', () => {
  const rect = { x: 100, y: 100, width: 60, height: 16 };
  const withLabelOverlap = scoreLabelCandidate(rect, 'below', { placedRects: [{ x: 110, y: 105, width: 20, height: 10 }] });
  assert.ok(withLabelOverlap.hasOverlap);
  assert.ok(withLabelOverlap.cost > 0);

  const withBodyOverlap = scoreLabelCandidate(rect, 'below', { bodyRects: [{ x: 100, y: 100, width: 5, height: 5 }] });
  assert.ok(withBodyOverlap.hasOverlap);

  const withContourOverlap = scoreLabelCandidate(rect, 'below', { focusContourRects: [{ x: 90, y: 90, width: 200, height: 200 }] });
  assert.ok(withContourOverlap.hasOverlap);
});

test('two well-separated required labels both land with zero overlap', () => {
  const items = [
    { id: 'active', isRequired: true, isActive: true, anchor: { x: 200, y: 200 } },
    { id: 'FO.BLACK_BIRD_FIELD', isRequired: true, anchor: { x: 800, y: 800 } },
  ];
  const results = solveLabels(items, (item) => candidatesAround(item.anchor));
  assert.equal(results.length, 2);
  for (const r of results) {
    assert.equal(r.suppressed, false);
    assert.equal(r.overlapping, false);
  }
  assert.equal(rectsOverlap(results[0].rect, results[1].rect), false);
});

test('a required, non-active label is suppressed rather than overlap a higher-priority required label whose placement covers every candidate side', () => {
  const anchor = { x: 500, y: 500 };
  // A large blocking body covering every one of the second item's 8
  // candidate positions around the same anchor (offset 15, half-size ~30x8,
  // so a +/-60 box around the anchor swallows all eight sides).
  const bigBlockerRect = { x: anchor.x - 60, y: anchor.y - 60, width: 120, height: 120 };
  const items = [
    { id: 'active', isRequired: true, isActive: true, anchor, size: bigBlockerRect },
    { id: 'RelO.PARTICIPANT', isRequired: true, anchor },
  ];
  const results = solveLabels(items, (item) =>
    item.size
      ? CANDIDATE_SIDES.map((side) => ({ side, rect: item.size }))
      : candidatesAround(item.anchor)
  );
  const active = results.find((r) => r.id === 'active');
  const participant = results.find((r) => r.id === 'RelO.PARTICIPANT');
  assert.equal(active.suppressed, false);
  assert.equal(active.overlapping, false, 'active placed first, before any conflict exists');
  assert.equal(participant.suppressed, true, 'no candidate is overlap-free once active covers every side');
});

test('the active label is never suppressed even when every candidate is forced to overlap', () => {
  const anchor = { x: 500, y: 500 };
  const items = [
    { id: 'blocker-1', isRequired: true, anchor },
    { id: 'blocker-2', isRequired: true, anchor: { x: anchor.x + 1, y: anchor.y } },
    { id: 'active', isRequired: true, isActive: true, anchor }, // placed last, fully boxed in
  ];
  const results = solveLabels(items, (item) => candidatesAround(item.anchor));
  const active = results.find((r) => r.id === 'active');
  assert.equal(active.suppressed, false, 'the active label must always receive a placement');
  assert.ok(active.rect, 'the active label must have a real rect even under overlap');
});

test('a non-required label with no valid placement is suppressed, not rendered overlapping', () => {
  const anchor = { x: 500, y: 500 };
  const bigBlockerRect = { x: anchor.x - 60, y: anchor.y - 60, width: 120, height: 120 };
  const items = [
    { id: 'active', isRequired: true, isActive: true, anchor, size: bigBlockerRect },
    { id: 'ordinary', isRequired: false, anchor },
  ];
  const results = solveLabels(items, (item) =>
    item.size
      ? CANDIDATE_SIDES.map((side) => ({ side, rect: item.size }))
      : candidatesAround(item.anchor)
  );
  const ordinary = results.find((r) => r.id === 'ordinary');
  assert.equal(ordinary.suppressed, true);
  assert.equal(ordinary.rect, null);
});

test('a non-required, non-active label with a zero-overlap candidate outside the safe rect is suppressed, not rendered clipped', () => {
  const anchor = { x: 780, y: 400 }; // near the right edge of a 0..800 safe rect
  const safeRect = { x: 0, y: 0, width: 800, height: 600 };
  const items = [{ id: 'edge-node', isRequired: false, isActive: false, anchor }];
  // Every one of the 8 candidates (offset 15, width 60) around this anchor
  // extends past x=800 on the right-anchored sides and is itself
  // off-safe-rect-adjacent enough that none land fully inside -- exercise
  // via a synthetic candidate set that is deliberately all outside.
  const build = () =>
    CANDIDATE_SIDES.map((side) => ({ side, rect: { x: 810, y: 400, width: 60, height: 16 } }));
  const results = solveLabels(items, build, { safeRect });
  const r = results[0];
  assert.equal(r.suppressed, true, 'a zero-overlap candidate outside the safe rect must not be chosen');
  assert.equal(r.rect, null);
});

test('a non-required, non-active label with at least one contained zero-overlap candidate is placed there, not suppressed', () => {
  const safeRect = { x: 0, y: 0, width: 800, height: 600 };
  const items = [{ id: 'edge-node', isRequired: false, isActive: false }];
  const build = () => [
    { side: 'below', rect: { x: 810, y: 400, width: 60, height: 16 } }, // outside
    { side: 'above', rect: { x: 400, y: 300, width: 60, height: 16 } }, // inside
  ];
  const results = solveLabels(items, build, { safeRect });
  const r = results[0];
  assert.equal(r.suppressed, false);
  assert.equal(r.side, 'above');
});

test('containment applies to required (non-active) labels too: their prior guarantee was priority in the overlap contest, never a pass on containment', () => {
  const safeRect = { x: 0, y: 0, width: 800, height: 600 };
  const outsideRect = { x: 810, y: 400, width: 60, height: 16 };
  const buildOutside = () => CANDIDATE_SIDES.map((side) => ({ side, rect: outsideRect }));

  const requiredResults = solveLabels(
    [{ id: 'required-node', isRequired: true, isActive: false }],
    buildOutside,
    { safeRect }
  );
  assert.equal(requiredResults[0].suppressed, true, 'a required, non-active label with only uncontained zero-overlap candidates is suppressed, same as a low-priority one');
  assert.equal(requiredResults[0].rect, null);
});

test('only the active label keeps the T-REQ-020 containment-independent guarantee: never suppressed, even fully outside the safe rect', () => {
  const safeRect = { x: 0, y: 0, width: 800, height: 600 };
  const outsideRect = { x: 810, y: 400, width: 60, height: 16 };
  const buildOutside = () => CANDIDATE_SIDES.map((side) => ({ side, rect: outsideRect }));

  const activeResults = solveLabels(
    [{ id: 'active-node', isRequired: false, isActive: true }],
    buildOutside,
    { safeRect }
  );
  assert.equal(activeResults[0].suppressed, false, 'the active label is never suppressed, containment or not');
  assert.deepEqual(activeResults[0].rect, outsideRect);
});

test('suppression is deterministic: identical input produces identical output across runs', () => {
  const anchor = { x: 500, y: 500 };
  const items = [
    { id: 'active', isRequired: true, isActive: true, anchor },
    { id: 'a', isRequired: true, anchor },
    { id: 'b', isRequired: false, anchor: { x: anchor.x + 5, y: anchor.y } },
    { id: 'c', isRequired: false, anchor: { x: anchor.x + 10, y: anchor.y } },
  ];
  const build = (item) => candidatesAround(item.anchor);
  const r1 = solveLabels(items, build);
  const r2 = solveLabels(items, build);
  assert.deepEqual(r1, r2);
});
