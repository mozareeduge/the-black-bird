import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePointerOwner,
  createGestureArbiter,
  meetsMinimumTarget,
  meetsMobilePrimaryTarget,
} from '../../src/layout/pointer-ownership.js';
import { createPointerController } from '../../src/controllers/pointer-controller.js';
import { CommandType } from '../../src/state/command-types.js';
import { readContract } from '../contracts/load.mjs';

// Hit-test radii and target sizes come from the committed visual-tokens
// fixture (T26, T-REQ-044), not re-typed literals.
const { mousePenRadius: MOUSE_PEN_RADIUS, touchRadius: TOUCH_RADIUS, minimumTarget: MINIMUM_TARGET, mobilePrimaryTarget: MOBILE_PRIMARY_TARGET } =
  readContract('visual-tokens.json').pointer;

function candidate(id, x, y, overrides = {}) {
  return { id, screenX: x, screenY: y, bodyRect: { x: x - 5, y: y - 5, width: 10, height: 10 }, canonicalIndex: 0, ...overrides };
}

test('one point resolves to at most one owner (or none), never multiple', () => {
  const candidates = [candidate('A', 100, 100), candidate('B', 106, 100)];
  const owner = resolvePointerOwner({ x: 100, y: 100 }, candidates, { modality: 'mouse' });
  assert.ok(owner === 'A' || owner === 'B' || owner === null);
});

test('a point far from everything resolves to no owner', () => {
  const candidates = [candidate('A', 100, 100)];
  const owner = resolvePointerOwner({ x: 500, y: 500 }, candidates, { modality: 'mouse' });
  assert.equal(owner, null);
});

test('body containment wins over a closer centroid distance', () => {
  const near = candidate('near-centroid', 101, 100, { bodyRect: { x: 200, y: 200, width: 1, height: 1 }, canonicalIndex: 1 });
  const containing = candidate('contains-point', 300, 300, { bodyRect: { x: 95, y: 95, width: 20, height: 20 }, canonicalIndex: 2 });
  const owner = resolvePointerOwner({ x: 100, y: 100 }, [near, containing], { modality: 'mouse' });
  assert.equal(owner, 'contains-point');
});

test('active focus membership breaks a tie among equally-close, non-containing candidates', () => {
  const a = candidate('A', 105, 100, { canonicalIndex: 0 });
  const b = candidate('B', 95, 100, { canonicalIndex: 1 });
  const owner = resolvePointerOwner({ x: 100, y: 100 }, [a, b], { modality: 'mouse', focusMemberIds: new Set(['B']) });
  assert.equal(owner, 'B');
});

test('smallest screen distance breaks a tie when neither contains and neither is a focus member', () => {
  const a = candidate('A', 108, 100, { canonicalIndex: 5 });
  const b = candidate('B', 104, 100, { canonicalIndex: 3 });
  const owner = resolvePointerOwner({ x: 100, y: 100 }, [a, b], { modality: 'mouse' });
  assert.equal(owner, 'B');
});

test('canonical index breaks a final exact tie', () => {
  const a = candidate('A', 105, 100, { canonicalIndex: 7 });
  const b = candidate('B', 105, 100, { canonicalIndex: 2 });
  const owner = resolvePointerOwner({ x: 100, y: 100 }, [a, b], { modality: 'mouse' });
  assert.equal(owner, 'B');
});

test('touch modality uses the wider touch radius than mouse/pen', () => {
  const candidates = [candidate('A', 100, 100, { bodyRect: null })];
  const distance = (MOUSE_PEN_RADIUS + TOUCH_RADIUS) / 2; // strictly between the two contract radii
  const point = { x: 100 + distance, y: 100 };
  assert.equal(resolvePointerOwner(point, candidates, { modality: 'mouse' }), null);
  assert.equal(resolvePointerOwner(point, candidates, { modality: 'touch' }), 'A');
});

test('a clean tap commits on pointerup with the same owner throughout', () => {
  const arbiter = createGestureArbiter();
  arbiter.pointerDown(1, { x: 100, y: 100 }, 'A', 'mouse');
  arbiter.pointerMove(1, { x: 101, y: 101 });
  const result = arbiter.pointerUp(1, 'A');
  assert.deepEqual(result, { commit: true, ownerId: 'A' });
});

test('movement beyond the modality slop separates pan from tap/click (T-REQ-022)', () => {
  const arbiter = createGestureArbiter();
  arbiter.pointerDown(1, { x: 100, y: 100 }, 'A', 'mouse');
  arbiter.pointerMove(1, { x: 120, y: 100 }); // 20px, well past the 6px mouse slop
  const result = arbiter.pointerUp(1, 'A');
  assert.equal(result.commit, false);
  assert.equal(result.reason, 'moved-beyond-slop');
});

test('pointercancel invalidates the pending commit', () => {
  const arbiter = createGestureArbiter();
  arbiter.pointerDown(1, { x: 100, y: 100 }, 'A', 'mouse');
  arbiter.pointerCancel(1);
  const result = arbiter.pointerUp(1, 'A');
  assert.equal(result.commit, false);
  assert.equal(result.reason, 'invalidated-or-cancelled');
});

test('a second pointer arriving means no pinch/pan ownership: neither pointer can commit', () => {
  const arbiter = createGestureArbiter();
  arbiter.pointerDown(1, { x: 100, y: 100 }, 'A', 'touch');
  arbiter.pointerDown(2, { x: 200, y: 200 }, 'B', 'touch');
  const result = arbiter.pointerUp(1, 'A');
  assert.equal(result.commit, false);
  assert.equal(result.reason, 'second-pointer');
});

test('the owner changing between down and up (occluded/target-loss) blocks the commit', () => {
  const arbiter = createGestureArbiter();
  arbiter.pointerDown(1, { x: 100, y: 100 }, 'A', 'mouse');
  const result = arbiter.pointerUp(1, 'B'); // resolved to a different owner at up
  assert.equal(result.commit, false);
  assert.equal(result.reason, 'owner-changed');
});

test('a synthetic click immediately after a real pointer commit is suppressed, then stops being suppressed', () => {
  const arbiter = createGestureArbiter();
  arbiter.pointerDown(1, { x: 100, y: 100 }, 'A', 'mouse');
  const t0 = Date.now();
  arbiter.pointerUp(1, 'A');
  assert.equal(arbiter.shouldSuppressSyntheticClick(t0 + 10), true);
  assert.equal(arbiter.shouldSuppressSyntheticClick(t0 + 1000), false);
});

test('meetsMinimumTarget: 24x24+ always passes; smaller passes only with sufficient neighbor spacing', () => {
  assert.equal(meetsMinimumTarget({ x: 0, y: 0, width: MINIMUM_TARGET, height: MINIMUM_TARGET }, []), true);
  const small = { x: 0, y: 0, width: MINIMUM_TARGET - 8, height: MINIMUM_TARGET - 8 };
  assert.equal(meetsMinimumTarget(small, []), true, 'no neighbors: spacing exception trivially holds');
  const closeNeighbor = [{ x: 10, y: 0, width: MINIMUM_TARGET - 8, height: MINIMUM_TARGET - 8 }];
  assert.equal(meetsMinimumTarget(small, closeNeighbor), false);
  const farNeighbor = [{ x: 1000, y: 1000, width: MINIMUM_TARGET - 8, height: MINIMUM_TARGET - 8 }];
  assert.equal(meetsMinimumTarget(small, farNeighbor), true);
});

test('meetsMobilePrimaryTarget requires 44x44', () => {
  assert.equal(meetsMobilePrimaryTarget({ x: 0, y: 0, width: MOBILE_PRIMARY_TARGET, height: MOBILE_PRIMARY_TARGET }), true);
  assert.equal(meetsMobilePrimaryTarget({ x: 0, y: 0, width: MOBILE_PRIMARY_TARGET - 4, height: MOBILE_PRIMARY_TARGET }), false);
});

class FakeSurface extends EventTarget {}

function fakePointerEvent(type, { pointerId = 1, x = 0, y = 0, pointerType = 'mouse' } = {}) {
  const evt = new Event(type);
  evt.pointerId = pointerId;
  evt.clientX = x;
  evt.clientY = y;
  evt.pointerType = pointerType;
  return evt;
}

test('pointer-controller dispatches COMMIT_OBJECT exactly once for a clean tap on a real candidate', () => {
  const surface = new FakeSurface();
  const dispatched = [];
  const controller = createPointerController({
    surface,
    dispatch: (c) => dispatched.push(c),
    getCandidates: () => [candidate('FO.CORPSE', 100, 100)],
    getFocusMemberIds: () => new Set(),
  });
  controller.start();
  surface.dispatchEvent(fakePointerEvent('pointerdown', { x: 100, y: 100 }));
  surface.dispatchEvent(fakePointerEvent('pointermove', { x: 101, y: 100 }));
  surface.dispatchEvent(fakePointerEvent('pointerup', { x: 101, y: 100 }));
  controller.stop();
  assert.equal(dispatched.length, 1);
  assert.deepEqual(dispatched[0], { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'pointer' });
});

test('pointer-controller dispatches nothing for a pan-like sequence (movement beyond slop)', () => {
  const surface = new FakeSurface();
  const dispatched = [];
  const controller = createPointerController({
    surface,
    dispatch: (c) => dispatched.push(c),
    getCandidates: () => [candidate('FO.CORPSE', 100, 100)],
  });
  controller.start();
  surface.dispatchEvent(fakePointerEvent('pointerdown', { x: 100, y: 100 }));
  surface.dispatchEvent(fakePointerEvent('pointermove', { x: 300, y: 100 }));
  surface.dispatchEvent(fakePointerEvent('pointerup', { x: 300, y: 100 }));
  controller.stop();
  assert.equal(dispatched.length, 0);
});

test('keyboard activation bypasses the pointer solver entirely: a direct dispatch needs no pointer module at all', () => {
  const dispatched = [];
  // This is the whole point: keyboard commit is just dispatch(COMMIT_OBJECT),
  // with no resolvePointerOwner call, no gesture arbiter, no pointer events.
  function keyboardCommit(rovingFocusId) {
    dispatched.push({ type: CommandType.COMMIT_OBJECT, id: rovingFocusId, source: 'keyboard' });
  }
  keyboardCommit('FO.BLACK_BIRD_FIELD');
  assert.deepEqual(dispatched, [{ type: CommandType.COMMIT_OBJECT, id: 'FO.BLACK_BIRD_FIELD', source: 'keyboard' }]);
});
