import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/state/initial-state.js';
import { assertStateInvariants } from '../../src/state/invariants.js';
import { CommandType, COMMAND_SPECS } from '../../src/state/command-types.js';
import { validateCommand } from '../../src/state/guards.js';
import { reduceCommand } from '../../src/state/reducer.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

// Minimal, contract-valid field values per command, for the "every command
// dispatches" coverage test below.
const SAMPLE_FIELDS = {
  id: 'FO.BLACK_BIRD_FIELD',
  source: 'test',
  sourceId: 'FO.CAIN',
  targetId: 'FO.CORPSE',
  relOIds: ['RelO.R7080EA25'],
  surface: 'read',
  objectType: 'FO',
  visible: false,
  option: 'labels',
  value: false,
  sequence: 1,
  kind: 'about',
  invoker: 'rail',
};

function sampleCommand(type) {
  const spec = COMMAND_SPECS[type];
  const command = { type };
  for (const field of spec.requiredFields) command[field] = SAMPLE_FIELDS[field];
  return command;
}

test('every command type is representable and validateCommand accepts a well-formed instance', () => {
  for (const type of Object.values(CommandType)) {
    const command = sampleCommand(type);
    const result = validateCommand(command);
    assert.equal(result.ok, true, `${type}: ${JSON.stringify(result.errors)}`);
  }
});

test('validateCommand rejects a command missing a required field', () => {
  const result = validateCommand({ type: CommandType.COMMIT_OBJECT });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('id')));
  assert.ok(result.errors.some((e) => e.includes('source')));
});

test('validateCommand rejects an unknown command type', () => {
  const result = validateCommand({ type: 'NOT_A_REAL_COMMAND' });
  assert.equal(result.ok, false);
});

test('reducer is pure: does not mutate a frozen input state, for every command', () => {
  for (const type of Object.values(CommandType)) {
    // Seed a state with a route entry first so REPLAY_ROUTE_EVENT has something to find.
    let seed = createInitialState();
    seed = reduceCommand(seed, sampleCommand(CommandType.COMMIT_OBJECT));
    const frozen = deepFreeze(seed);
    const command = sampleCommand(type);
    assert.doesNotThrow(() => reduceCommand(frozen, command), `${type} mutated or threw on a frozen state`);
    const next = reduceCommand(frozen, command);
    assert.ok(next, `${type} returned a falsy state`);
    const check = assertStateInvariants(next);
    assert.equal(check.ok, true, `${type} produced an invariant-violating state: ${JSON.stringify(check.violations)}`);
  }
});

test('COMMIT_OBJECT with a new id appends exactly one Route event and records wear', () => {
  const s0 = createInitialState();
  const s1 = reduceCommand(s0, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  assert.equal(s1.history.route.length, 1);
  assert.equal(s1.history.route[0].id, 'FO.CORPSE');
  assert.equal(s1.reading.anchorId, 'FO.CORPSE');
  assert.equal(s1.reading.fieldAttention.kind, 'focus');
  assert.equal(s1.reading.readerSubject.id, 'FO.CORPSE');
  assert.equal(s1.trace.wear['FO.CORPSE'], 1);
});

test('COMMIT_OBJECT with the same id appends nothing (P-RULE-004)', () => {
  const s0 = createInitialState();
  const s1 = reduceCommand(s0, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  const s2 = reduceCommand(s1, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  assert.equal(s2.history.route.length, 1);
  assert.equal(s2.trace.wear['FO.CORPSE'], 1);
});

test('RETURN_TO_WHOLE_FIELD neutralizes field attention but retains anchor and Reader subject (P-RULE-011)', () => {
  const s0 = createInitialState();
  const s1 = reduceCommand(s0, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  const s2 = reduceCommand(s1, { type: CommandType.RETURN_TO_WHOLE_FIELD });
  assert.equal(s2.reading.fieldAttention.kind, 'whole-field');
  assert.equal(s2.reading.anchorId, 'FO.CORPSE');
  assert.equal(s2.reading.readerSubject.id, 'FO.CORPSE');
  assert.equal(assertStateInvariants(s2).ok, true);
});

test('preview, inspection, View, Solo, chamber, and camera-shaped commands never touch Route or trace (P-RULE-003/007/012/014)', () => {
  const s0 = createInitialState();
  const routeNeutral = [
    { type: CommandType.PREVIEW_OBJECT, id: 'FO.CORPSE' },
    { type: CommandType.CLEAR_PREVIEW },
    { type: CommandType.INSPECT_PROJECTED_EDGE, sourceId: 'FO.CAIN', targetId: 'FO.CORPSE', relOIds: ['RelO.R7080EA25'] },
    { type: CommandType.CLEAR_INSPECTION },
    { type: CommandType.SET_SURFACE, surface: 'read' },
    { type: CommandType.SET_TYPE_VISIBILITY, objectType: 'RelO', visible: false },
    { type: CommandType.SET_OBJECT_VISIBILITY, id: 'FO.CORPSE', visible: false },
    { type: CommandType.SET_VIEW_OPTION, option: 'labels', value: false },
    { type: CommandType.ENTER_SOLO, id: 'FO.CORPSE' },
    { type: CommandType.EXIT_SOLO },
    { type: CommandType.RESTORE_FIELD },
  ];
  let state = s0;
  for (const command of routeNeutral) {
    state = reduceCommand(state, command);
    assert.equal(state.history.route.length, 0, `${command.type} appended a Route event`);
    assert.deepEqual(state.trace, { wear: {}, afterglows: [] }, `${command.type} recorded trace`);
  }
});

test('ENTER_SOLO captures a snapshot once; EXIT_SOLO restores it exactly (P-RULE-012)', () => {
  const s0 = createInitialState();
  const s1 = reduceCommand(s0, { type: CommandType.SET_TYPE_VISIBILITY, objectType: 'RelO', visible: false });
  const s2 = reduceCommand(s1, { type: CommandType.ENTER_SOLO, id: 'FO.CORPSE' });
  assert.equal(s2.solo.active, true);
  assert.ok(s2.solo.snapshot);
  const s3 = reduceCommand(s2, { type: CommandType.SET_TYPE_VISIBILITY, objectType: 'FO', visible: false });
  const s4 = reduceCommand(s3, { type: CommandType.EXIT_SOLO });
  assert.equal(s4.solo.active, false);
  assert.equal(s4.solo.snapshot, null);
  assert.deepEqual(s4.view, s1.view);
});

test('REPLAY_ROUTE_EVENT changes presentation without adding Route/trace or changing View/Solo (P-RULE-007)', () => {
  const s0 = createInitialState();
  const s1 = reduceCommand(s0, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  const s2 = reduceCommand(s1, { type: CommandType.COMMIT_OBJECT, id: 'FO.CAIN', source: 'field' });
  const s3 = reduceCommand(s2, { type: CommandType.SET_TYPE_VISIBILITY, objectType: 'RelO', visible: false });
  const before = { route: s3.history.route, trace: s3.trace, view: s3.view, solo: s3.solo };
  const s4 = reduceCommand(s3, { type: CommandType.REPLAY_ROUTE_EVENT, sequence: 1 });
  assert.equal(s4.reading.anchorId, 'FO.CORPSE');
  assert.deepEqual(s4.history.route, before.route);
  assert.deepEqual(s4.trace, before.trace);
  assert.deepEqual(s4.view, before.view);
  assert.deepEqual(s4.solo, before.solo);
});

test('INSPECT_PROJECTED_EDGE may change Reader subject but never anchor, Route, trace, solo, or view (P-RULE-014)', () => {
  const s0 = createInitialState();
  const s1 = reduceCommand(s0, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  const before = { anchor: s1.reading.anchorId, route: s1.history.route, trace: s1.trace, solo: s1.solo, view: s1.view };
  const s2 = reduceCommand(s1, {
    type: CommandType.INSPECT_PROJECTED_EDGE,
    sourceId: 'FO.CAIN',
    targetId: 'FO.CORPSE',
    relOIds: ['RelO.R7080EA25'],
  });
  assert.equal(s2.reading.anchorId, before.anchor);
  assert.deepEqual(s2.history.route, before.route);
  assert.deepEqual(s2.trace, before.trace);
  assert.deepEqual(s2.solo, before.solo);
  assert.deepEqual(s2.view, before.view);
  assert.equal(s2.reading.readerSubject.kind, 'projected-edge');
});
