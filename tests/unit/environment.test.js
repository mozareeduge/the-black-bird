import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentController, computeProfile, computeOrientation } from '../../src/controllers/environment-controller.js';
import { createLifecycleController } from '../../src/controllers/lifecycle-controller.js';
import { CommandType } from '../../src/state/command-types.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createReducer } from '../../src/state/reducer.js';
import { recordAfterglow, reconcileTraceDeadlines } from '../../src/domain/trace.js';
import { DATA } from '../../src/data/canonical-data.js';

const nodesById = Object.fromEntries(DATA.nodes.map((n) => [n.id, n]));
const baseLinks = [];
Object.entries(DATA.relations).forEach(([rid, parts]) => {
  parts.forEach((pid) => baseLinks.push([rid, pid]));
});
const { reduceCommand } = createReducer({ nodesById, baseLinks, relations: DATA.relations });

class FakeWindow extends EventTarget {
  constructor({ width, height } = { width: 1440, height: 900 }) {
    super();
    this.innerWidth = width;
    this.innerHeight = height;
    this.visualViewport = null;
  }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.visibilityState = 'visible';
  }
}

class FakeNavigator extends EventTarget {}

function spyDispatch() {
  const calls = [];
  const dispatch = (command) => calls.push(command);
  dispatch.calls = calls;
  return dispatch;
}

test('computeProfile/computeOrientation classify breakpoints deterministically', () => {
  assert.equal(computeProfile(390), 'mobile');
  assert.equal(computeProfile(1024), 'compact-desktop');
  assert.equal(computeProfile(1440), 'desktop');
  assert.equal(computeOrientation(390, 844), 'portrait');
  assert.equal(computeOrientation(844, 390), 'landscape');
});

test('a resize dispatches exactly RECONCILE_ENVIRONMENT, never a Route/trace-affecting command', () => {
  const env = new FakeWindow({ width: 1024, height: 640 });
  const dispatch = spyDispatch();
  const controller = createEnvironmentController({ dispatch, env });
  controller.start();
  assert.equal(dispatch.calls.length, 1, 'start() reconciles once immediately');
  env.innerWidth = 390;
  env.innerHeight = 844;
  env.dispatchEvent(new Event('resize'));
  controller.stop();
  assert.equal(dispatch.calls.length, 2);
  for (const command of dispatch.calls) {
    assert.equal(command.type, CommandType.RECONCILE_ENVIRONMENT);
  }
  const last = dispatch.calls[1];
  assert.equal(last.profile, 'mobile');
  assert.equal(last.orientation, 'portrait');
});

test('breakpoint/orientation/viewport changes preserve semantic state when applied through the real reducer (P-RULE-033)', () => {
  const env = new FakeWindow({ width: 1440, height: 900 });
  const dispatch = spyDispatch();
  const controller = createEnvironmentController({ dispatch, env });
  controller.start();
  env.innerWidth = 390;
  env.innerHeight = 844;
  env.dispatchEvent(new Event('resize'));
  controller.stop();

  let state = createInitialState();
  state = reduceCommand(state, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  const before = { reading: state.reading, history: state.history, trace: state.trace, solo: state.solo, view: state.view };
  for (const command of dispatch.calls) {
    state = reduceCommand(state, command);
  }
  assert.deepEqual(state.reading, before.reading);
  assert.deepEqual(state.history, before.history);
  assert.deepEqual(state.trace, before.trace);
  assert.deepEqual(state.solo, before.solo);
  assert.deepEqual(state.view, before.view);
  assert.equal(state.responsive.profile, 'mobile');
});

test('lifecycle controller dispatches RECONCILE_DOCUMENT_VISIBILITY on visibilitychange, never mutating Route/trace itself', () => {
  const doc = new FakeDocument();
  const nav = new FakeNavigator();
  const dispatch = spyDispatch();
  const controller = createLifecycleController({ dispatch, doc, nav });
  controller.start();
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  controller.stop();
  assert.equal(dispatch.calls.length, 2);
  assert.deepEqual(dispatch.calls.map((c) => [c.type, c.visibility]), [
    [CommandType.RECONCILE_DOCUMENT_VISIBILITY, 'hidden'],
    [CommandType.RECONCILE_DOCUMENT_VISIBILITY, 'visible'],
  ]);
});

test('resume removes expired residues without replay: the RECONCILE_DOCUMENT_VISIBILITY signal, paired with trace reconciliation, drops only expired afterglow', () => {
  const doc = new FakeDocument();
  const dispatch = spyDispatch();
  const controller = createLifecycleController({ dispatch, doc, nav: null });
  controller.start();

  let trace = { wear: {}, afterglows: [] };
  trace = recordAfterglow(trace, { id: 'FO.EXPIRED', nowMs: 0, durationMs: 1000, cap: 8 });
  trace = recordAfterglow(trace, { id: 'FO.STILL_ACTIVE', nowMs: 0, durationMs: 10000, cap: 8 });

  // Page hidden, then resumed 2000ms of wall-clock time later.
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  controller.stop();

  assert.equal(dispatch.calls.at(-1).type, CommandType.RECONCILE_DOCUMENT_VISIBILITY);
  assert.equal(dispatch.calls.at(-1).visibility, 'visible');

  // No replay: reconciliation only ever removes expired entries against the
  // wall clock, it never re-runs or re-schedules anything.
  const reconciled = reconcileTraceDeadlines(trace, 2000);
  assert.deepEqual(
    reconciled.afterglows.map((a) => a.id),
    ['FO.STILL_ACTIVE']
  );
});

test('connectivity changes and external navigation failure do not mutate Route/trace/reading history', () => {
  const nav = new FakeNavigator();
  const doc = new FakeDocument();
  const dispatch = spyDispatch();
  const controller = createLifecycleController({ dispatch, doc, nav });
  controller.start();
  nav.dispatchEvent(new Event('offline'));
  nav.dispatchEvent(new Event('online'));
  controller.stop();
  assert.deepEqual(dispatch.calls.map((c) => c.connectivity), ['offline', 'online']);

  let state = createInitialState();
  state = reduceCommand(state, { type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  const before = { reading: state.reading, history: state.history, trace: state.trace };
  for (const command of dispatch.calls) {
    state = reduceCommand(state, command);
  }
  state = reduceCommand(state, { type: CommandType.EXTERNAL_NAVIGATION_FAILED });
  assert.deepEqual(state.reading, before.reading);
  assert.deepEqual(state.history, before.history);
  assert.deepEqual(state.trace, before.trace);
  assert.equal(state.presentation.statusMessage, 'external-navigation-failed');
});
