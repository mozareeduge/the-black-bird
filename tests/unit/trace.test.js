import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordWear, recordAfterglow, reconcileTraceDeadlines, clearTrace } from '../../src/domain/trace.js';

// A small canonical graph for wear tests: A-B-C-D visible canonical base links,
// plus a "shortcut" A-D that only exists as a *projected* edge and is
// deliberately NOT included in `neighbors`, standing in for "projected edges
// never wear" — this module only ever sees what neighbors() gives it.
const CANONICAL_GRAPH = {
  A: ['B'],
  B: ['A', 'C'],
  C: ['B', 'D'],
  D: ['C'],
};
function neighbors(id) {
  return CANONICAL_GRAPH[id] || [];
}

test('wear traverses only the visible canonical base-link path (P-RULE-008)', () => {
  const t0 = clearTrace();
  const t1 = recordWear(t0, { fromId: 'A', toId: 'C', neighbors });
  assert.deepEqual(t1.wear, { 'A|B': 1, 'B|C': 1 });
});

test('a projected-only shortcut never wears: the module only uses the supplied canonical neighbors', () => {
  // A "projected" A-D edge is not in CANONICAL_GRAPH/neighbors at all, so even
  // though A and D are the endpoints, wear must be recorded along the real
  // canonical path A-B-C-D, never as a direct A-D edge.
  const t0 = clearTrace();
  const t1 = recordWear(t0, { fromId: 'A', toId: 'D', neighbors });
  assert.deepEqual(t1.wear, { 'A|B': 1, 'B|C': 1, 'C|D': 1 });
  assert.equal(t1.wear['A|D'], undefined);
});

test('wear is capped at 7 passes per edge', () => {
  let trace = clearTrace();
  for (let i = 0; i < 10; i++) {
    trace = recordWear(trace, { fromId: 'A', toId: 'B', neighbors });
  }
  assert.equal(trace.wear['A|B'], 7);
});

test('no visible canonical path means no wear is recorded', () => {
  const disconnected = { A: [], B: [] };
  const t0 = clearTrace();
  const t1 = recordWear(t0, { fromId: 'A', toId: 'B', neighbors: (id) => disconnected[id] || [] });
  assert.deepEqual(t1.wear, {});
});

test('same source and target records no wear', () => {
  const t0 = clearTrace();
  const t1 = recordWear(t0, { fromId: 'A', toId: 'A', neighbors });
  assert.equal(t1, t0);
});

test('afterglow stores a wall-clock deadline and respects a contextual cap (P-RULE-009)', () => {
  const t0 = clearTrace();
  const t1 = recordAfterglow(t0, { id: 'FO.CORPSE', nowMs: 1000, durationMs: 4000, cap: 3 });
  assert.deepEqual(t1.afterglows, [{ id: 'FO.CORPSE', deadline: 5000 }]);

  let trace = t0;
  for (let i = 0; i < 5; i++) {
    trace = recordAfterglow(trace, { id: `FO.N${i}`, nowMs: 1000, durationMs: 4000, cap: 3 });
  }
  assert.equal(trace.afterglows.length, 3);
  assert.deepEqual(
    trace.afterglows.map((a) => a.id),
    ['FO.N2', 'FO.N3', 'FO.N4']
  );
});

test('reconcileTraceDeadlines removes only expired entries against wall-clock time, without replay (P-RULE-030)', () => {
  let trace = clearTrace();
  trace = recordAfterglow(trace, { id: 'FO.EXPIRED', nowMs: 0, durationMs: 1000, cap: 8 });
  trace = recordAfterglow(trace, { id: 'FO.STILL_ACTIVE', nowMs: 0, durationMs: 5000, cap: 8 });
  const reconciled = reconcileTraceDeadlines(trace, 2000);
  assert.deepEqual(
    reconciled.afterglows.map((a) => a.id),
    ['FO.STILL_ACTIVE']
  );
});

test('reconcileTraceDeadlines is a no-op (same reference) when nothing has expired', () => {
  let trace = clearTrace();
  trace = recordAfterglow(trace, { id: 'FO.STILL_ACTIVE', nowMs: 0, durationMs: 5000, cap: 8 });
  const reconciled = reconcileTraceDeadlines(trace, 100);
  assert.equal(reconciled, trace);
});

test('clearTrace is idempotent and structurally cannot touch Route', () => {
  const first = clearTrace();
  const second = clearTrace();
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['afterglows', 'wear']);
});
