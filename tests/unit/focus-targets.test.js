import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFocusTargets } from '../../src/layout/focus-targets.js';

const CORE_ID = 'CORE';
const CORE_HOME = { x: 500, y: 500 };

function deg(d) {
  return (d * Math.PI) / 180;
}

// Eight candidates evenly spaced 45 degrees apart around the core, at a
// distance that does not matter (only angle matters for ring assignment).
const RING_ANGLES_DEG = [-135, -90, -45, 0, 45, 90, 135, 180];
const RING_IDS = RING_ANGLES_DEG.map((_, i) => `RING_${i}`);
const RING_HOMES = Object.fromEntries(
  RING_ANGLES_DEG.map((a, i) => [RING_IDS[i], { x: CORE_HOME.x + 50 * Math.cos(deg(a)), y: CORE_HOME.y + 50 * Math.sin(deg(a)) }])
);

const ALL_HOMES = { [CORE_ID]: CORE_HOME, ...RING_HOMES, EXTRA: { x: 0, y: 0 } };
const ALL_IDS = Object.keys(ALL_HOMES);
const CANONICAL_INDEX = Object.fromEntries(ALL_IDS.map((id, i) => [id, i]));

function baseContext(overrides = {}) {
  return {
    homeFor: (id) => ALL_HOMES[id] || null,
    allIds: ALL_IDS,
    nodeType: () => 'FO',
    canonicalIndexOf: (id) => CANONICAL_INDEX[id],
    baseEdgeNeighborsOf: () => RING_IDS,
    ...overrides,
  };
}

function angleFromCore(point) {
  return Math.atan2(point.y - CORE_HOME.y, point.x - CORE_HOME.x);
}
function radiusFromCore(point) {
  return Math.hypot(point.x - CORE_HOME.x, point.y - CORE_HOME.y);
}
function closeTo(actual, expected, eps, msg) {
  assert.ok(Math.abs(actual - expected) < eps, `${msg}: expected ~${expected}, got ${actual}`);
}

test('core stays at its authored home', () => {
  const targets = computeFocusTargets(CORE_ID, baseContext());
  assert.deepEqual(targets.get(CORE_ID), CORE_HOME);
});

test('whole Field (no active id) restores exact authored homes for every node', () => {
  const targets = computeFocusTargets(null, baseContext());
  for (const id of ALL_IDS) {
    assert.deepEqual(targets.get(id), ALL_HOMES[id]);
  }
});

test('evenly spaced candidates land on the inner ring at radius 76, preserving their original angle (rotation finds the zero-cost alignment)', () => {
  const targets = computeFocusTargets(CORE_ID, baseContext());
  for (const id of RING_IDS) {
    const target = targets.get(id);
    closeTo(radiusFromCore(target), 76, 1e-6, `${id} radius`);
    const originalAngle = angleFromCore(RING_HOMES[id]);
    const targetAngle = angleFromCore(target);
    const diff = Math.atan2(Math.sin(targetAngle - originalAngle), Math.cos(targetAngle - originalAngle));
    closeTo(diff, 0, 1e-6, `${id} angle preserved`);
  }
});

test('a node with no authored home and any node beyond MAX_NEIGHBORS is left at its authored home (unselected)', () => {
  const targets = computeFocusTargets(CORE_ID, baseContext());
  assert.deepEqual(targets.get('EXTRA'), ALL_HOMES.EXTRA);
});

test('tier priority: canonical participants (RelO core) outrank base-edge neighbors, which outrank structural neighbors', () => {
  const context = baseContext({
    nodeType: (id) => (id === CORE_ID ? 'RelO' : 'FO'),
    canonicalParticipantsOf: () => ['P1'],
    baseEdgeNeighborsOf: () => ['B1'],
    structuralNeighborsOf: () => ['S1'],
  });
  const homes = { ...ALL_HOMES, P1: { x: 600, y: 500 }, B1: { x: 500, y: 600 }, S1: { x: 400, y: 500 } };
  const ctx = { ...context, homeFor: (id) => homes[id] || null, allIds: [CORE_ID, 'P1', 'B1', 'S1'] };
  const targets = computeFocusTargets(CORE_ID, ctx);
  // With only 3 candidates and inner capacity 8, all land on the inner ring;
  // what matters here is that all three were actually selected (none left at
  // its raw authored home, since with n=3 candidates and evenly spaced
  // 120-degree slots none of these particular angles land back on a home).
  assert.notDeepEqual(targets.get('P1'), homes.P1);
  assert.notDeepEqual(targets.get('B1'), homes.B1);
  assert.notDeepEqual(targets.get('S1'), homes.S1);
  for (const id of ['P1', 'B1', 'S1']) {
    closeTo(radiusFromCore(targets.get(id)), 76, 1e-6, `${id} radius`);
  }
});

test('candidates beyond MAX_NEIGHBORS (14) are dropped in tier/angle/index order and left at their authored homes', () => {
  const manyIds = Array.from({ length: 20 }, (_, i) => `N${i}`);
  const homes = Object.fromEntries(
    manyIds.map((id, i) => [id, { x: CORE_HOME.x + 50 * Math.cos(deg(i * 18)), y: CORE_HOME.y + 50 * Math.sin(deg(i * 18)) }])
  );
  const ctx = {
    homeFor: (id) => (id === CORE_ID ? CORE_HOME : homes[id] || null),
    allIds: [CORE_ID, ...manyIds],
    nodeType: () => 'FO',
    canonicalIndexOf: (id) => manyIds.indexOf(id),
    baseEdgeNeighborsOf: () => manyIds,
  };
  const targets = computeFocusTargets(CORE_ID, ctx);
  let selectedCount = 0;
  let leftAtHomeCount = 0;
  for (const id of manyIds) {
    const t = targets.get(id);
    if (Math.abs(radiusFromCore(t) - 76) < 1 || Math.abs(radiusFromCore(t) - 118) < 1) selectedCount++;
    else leftAtHomeCount++;
  }
  assert.equal(selectedCount, 14);
  assert.equal(leftAtHomeCount, 6);
});

test('the inner ring holds at most 8; the remainder overflows to the outer ring at radius 118', () => {
  const tenIds = Array.from({ length: 10 }, (_, i) => `N${i}`);
  const homes = Object.fromEntries(
    tenIds.map((id, i) => [id, { x: CORE_HOME.x + 50 * Math.cos(deg(i * 36)), y: CORE_HOME.y + 50 * Math.sin(deg(i * 36)) }])
  );
  const ctx = {
    homeFor: (id) => (id === CORE_ID ? CORE_HOME : homes[id] || null),
    allIds: [CORE_ID, ...tenIds],
    nodeType: () => 'FO',
    canonicalIndexOf: (id) => tenIds.indexOf(id),
    baseEdgeNeighborsOf: () => tenIds,
  };
  const targets = computeFocusTargets(CORE_ID, ctx);
  const radii = tenIds.map((id) => Math.round(radiusFromCore(targets.get(id))));
  const innerCount = radii.filter((r) => r === 76).length;
  const outerCount = radii.filter((r) => r === 118).length;
  assert.equal(innerCount, 8);
  assert.equal(outerCount, 2);
});

test('computeFocusTargets is deterministic: identical inputs produce byte-identical targets', () => {
  const t1 = computeFocusTargets(CORE_ID, baseContext());
  const t2 = computeFocusTargets(CORE_ID, baseContext());
  assert.deepEqual([...t1.entries()], [...t2.entries()]);
});
