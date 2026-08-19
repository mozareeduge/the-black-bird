import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordWear, recordAfterglow, reconcileTraceDeadlines, clearTrace } from '../../src/domain/trace.js';
import { readContract } from '../contracts/load.mjs';

// The trace contract states these caps as prose ("cap 7 passes per edge";
// "desktop max 8 / 10s; mobile max 3 / 4s"), not structured numeric fields,
// so they can't be destructured directly. This guard still ties the
// hardcoded numbers below to the contract (T26, T-REQ-044): if the contract
// prose ever changes, this fails loudly instead of the numeric tests below
// silently drifting out of sync with it.
const TRACE_CONTRACT = readContract('algorithm-contracts.json').trace;
const WEAR_CAP = 7;
const AFTERGLOW_DESKTOP = { cap: 8, durationMs: 10000 };
const AFTERGLOW_MOBILE = { cap: 3, durationMs: 4000 };
test('the trace contract prose still states the exact wear/afterglow caps this suite hardcodes', () => {
  assert.match(TRACE_CONTRACT.wear, new RegExp(`cap ${WEAR_CAP} passes per edge`));
  assert.match(
    TRACE_CONTRACT.afterglow,
    new RegExp(`desktop max ${AFTERGLOW_DESKTOP.cap} / ${AFTERGLOW_DESKTOP.durationMs / 1000}s; mobile max ${AFTERGLOW_MOBILE.cap} / ${AFTERGLOW_MOBILE.durationMs / 1000}s`)
  );
});

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
  for (let i = 0; i < WEAR_CAP + 3; i++) {
    trace = recordWear(trace, { fromId: 'A', toId: 'B', neighbors });
  }
  assert.equal(trace.wear['A|B'], WEAR_CAP);
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

test('afterglow stores a wall-clock deadline and respects the mobile cap (P-RULE-009)', () => {
  const t0 = clearTrace();
  const t1 = recordAfterglow(t0, { id: 'FO.CORPSE', nowMs: 1000, durationMs: AFTERGLOW_MOBILE.durationMs, cap: AFTERGLOW_MOBILE.cap });
  assert.deepEqual(t1.afterglows, [
    { id: 'FO.CORPSE', deadline: 1000 + AFTERGLOW_MOBILE.durationMs, totalMs: AFTERGLOW_MOBILE.durationMs },
  ]);

  let trace = t0;
  for (let i = 0; i < AFTERGLOW_MOBILE.cap + 2; i++) {
    trace = recordAfterglow(trace, { id: `FO.N${i}`, nowMs: 1000, durationMs: AFTERGLOW_MOBILE.durationMs, cap: AFTERGLOW_MOBILE.cap });
  }
  assert.equal(trace.afterglows.length, AFTERGLOW_MOBILE.cap);
  assert.deepEqual(
    trace.afterglows.map((a) => a.id),
    Array.from({ length: AFTERGLOW_MOBILE.cap }, (_, i) => `FO.N${i + 2}`)
  );
});

test('reconcileTraceDeadlines removes only expired entries against wall-clock time, without replay (P-RULE-030)', () => {
  let trace = clearTrace();
  trace = recordAfterglow(trace, { id: 'FO.EXPIRED', nowMs: 0, durationMs: 1000, cap: AFTERGLOW_DESKTOP.cap });
  trace = recordAfterglow(trace, { id: 'FO.STILL_ACTIVE', nowMs: 0, durationMs: 5000, cap: AFTERGLOW_DESKTOP.cap });
  const reconciled = reconcileTraceDeadlines(trace, 2000);
  assert.deepEqual(
    reconciled.afterglows.map((a) => a.id),
    ['FO.STILL_ACTIVE']
  );
});

test('reconcileTraceDeadlines is a no-op (same reference) when nothing has expired', () => {
  let trace = clearTrace();
  trace = recordAfterglow(trace, { id: 'FO.STILL_ACTIVE', nowMs: 0, durationMs: 5000, cap: AFTERGLOW_DESKTOP.cap });
  const reconciled = reconcileTraceDeadlines(trace, 100);
  assert.equal(reconciled, trace);
});

test('clearTrace is idempotent and structurally cannot touch Route', () => {
  const first = clearTrace();
  const second = clearTrace();
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['afterglows', 'wear']);
});
