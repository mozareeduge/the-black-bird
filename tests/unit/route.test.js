import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRouteEvent, clearRoute, selectRouteWindow, findRouteEventBySequence } from '../../src/domain/route.js';
import { readContract } from '../contracts/load.mjs';

test('the route contract states no semantic limit (T26, T-REQ-044)', () => {
  assert.equal(readContract('algorithm-contracts.json').route.semanticLimit, null);
});

test('a new-id commit appends exactly one event with the full canonical field set (P-RULE-006)', () => {
  const r0 = clearRoute();
  const r1 = appendRouteEvent(r0, { id: 'FO.CORPSE', objectType: 'FO', label: 'Corpse', source: 'field' }, null);
  assert.equal(r1.route.length, 1);
  const [entry] = r1.route;
  assert.equal(entry.id, 'FO.CORPSE');
  assert.equal(entry.type, 'FO');
  assert.equal(entry.label, 'Corpse');
  assert.equal(entry.fromId, null);
  assert.equal(entry.source, 'field');
  assert.equal(entry.sequence, 1);
  assert.equal(typeof entry.committedAt, 'number');
  assert.equal(r1.nextSequence, 2);
});

test('same-id activation appends nothing (P-RULE-004)', () => {
  const r0 = clearRoute();
  const r1 = appendRouteEvent(r0, { id: 'FO.CORPSE', source: 'field' }, null);
  const r2 = appendRouteEvent(r1, { id: 'FO.CORPSE', source: 'field' }, 'FO.CORPSE');
  assert.equal(r2.route.length, 1);
  assert.equal(r2, r1, 'a no-op append should return the identical route state, not a new object');
});

test('appendRouteEvent only appends when the id differs from the current anchor, regardless of the last route entry', () => {
  // Route currently ends at CAIN, but the true current anchor (post-replay, say)
  // is CORPSE. Re-committing CORPSE must append nothing even though the last
  // route entry is CAIN, not CORPSE.
  const r0 = clearRoute();
  const r1 = appendRouteEvent(r0, { id: 'FO.CORPSE', source: 'field' }, null);
  const r2 = appendRouteEvent(r1, { id: 'FO.CAIN', source: 'field' }, 'FO.CORPSE');
  assert.equal(r2.route.length, 2);
  const r3 = appendRouteEvent(r2, { id: 'FO.CORPSE', source: 'field' }, 'FO.CORPSE');
  assert.equal(r3.route.length, 2, 'committing the true current anchor again must not append');
});

test('replay-shaped and non-commit actions never append: clearRoute/selectRouteWindow/findRouteEventBySequence are read-only, non-appending operations', () => {
  const r0 = clearRoute();
  const r1 = appendRouteEvent(r0, { id: 'FO.CORPSE', source: 'field' }, null);
  const windowed = selectRouteWindow(r1);
  assert.equal(windowed.route.length, r1.route.length);
  assert.equal(r1.route.length, 1, 'selectRouteWindow must not mutate or append to routeState');
  const found = findRouteEventBySequence(r1, 1);
  assert.equal(found.id, 'FO.CORPSE');
  assert.equal(r1.route.length, 1, 'findRouteEventBySequence must not mutate routeState');
  const cleared = clearRoute();
  assert.equal(cleared.route.length, 0);
  assert.equal(cleared.nextSequence, 1);
});

test('history has no semantic cap: monotonic sequence and unbroken growth for many events', () => {
  let route = clearRoute();
  let anchor = null;
  for (let i = 0; i < 500; i++) {
    const id = `FO.NODE_${i}`;
    route = appendRouteEvent(route, { id, source: 'field' }, anchor);
    anchor = id;
  }
  assert.equal(route.route.length, 500);
  assert.deepEqual(
    route.route.map((e) => e.sequence),
    Array.from({ length: 500 }, (_, i) => i + 1)
  );
  assert.equal(route.nextSequence, 501);
  assert.equal(route.route[0].id, 'FO.NODE_0');
  assert.equal(route.route[499].id, 'FO.NODE_499');
});

test('a 500+ event route window is virtualized without deleting any semantic event (D-DEC-22, P-RULE-039)', () => {
  let route = clearRoute();
  let anchor = null;
  for (let i = 0; i < 520; i++) {
    const id = `FO.NODE_${i}`;
    route = appendRouteEvent(route, { id, source: 'field' }, anchor);
    anchor = id;
  }
  assert.equal(route.route.length, 520, 'the underlying route truth is complete');

  const windowed = selectRouteWindow(route, { headSize: 5, tailSize: 40 });
  assert.equal(windowed.truncated, true);
  assert.equal(windowed.fullLength, 520);
  assert.equal(windowed.hiddenCount, 520 - 5 - 40);
  assert.equal(windowed.route.length, 45);
  assert.deepEqual(
    windowed.route.slice(0, 5).map((e) => e.id),
    ['FO.NODE_0', 'FO.NODE_1', 'FO.NODE_2', 'FO.NODE_3', 'FO.NODE_4']
  );
  assert.equal(windowed.route[windowed.route.length - 1].id, 'FO.NODE_519');

  // The window is a view: route.route itself is untouched and still complete.
  assert.equal(route.route.length, 520);
});
