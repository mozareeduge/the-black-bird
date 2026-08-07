import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/state/initial-state.js';
import { CommandType } from '../../src/state/command-types.js';
import { createTransactionController } from '../../src/application/transaction-controller.js';
import { createDispatcher } from '../../src/application/dispatcher.js';
import { createTimerRegistry } from '../../src/application/timer-registry.js';
import { DATA } from '../../src/data/canonical-data.js';

const nodesById = Object.fromEntries(DATA.nodes.map((n) => [n.id, n]));
const baseLinks = [];
Object.entries(DATA.relations).forEach(([rid, parts]) => {
  parts.forEach((pid) => baseLinks.push([rid, pid]));
});
const graphContext = { nodesById, baseLinks, relations: DATA.relations };

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('each accepted transaction has a monotonic txId and its own AbortController', () => {
  const transactions = createTransactionController();
  const t1 = transactions.begin();
  const t2 = transactions.begin();
  const t3 = transactions.begin();
  assert.deepEqual([t1.txId, t2.txId, t3.txId], [1, 2, 3]);
  assert.ok(t1.signal instanceof AbortSignal);
  assert.ok(t2.signal instanceof AbortSignal);
  assert.notEqual(t1.signal, t2.signal);
});

test('beginning a new transaction aborts the previous one', () => {
  const transactions = createTransactionController();
  const t1 = transactions.begin();
  assert.equal(t1.signal.aborted, false);
  const t2 = transactions.begin();
  assert.equal(t1.signal.aborted, true);
  assert.equal(t2.signal.aborted, false);
});

test('stale callbacks are unable to commit presentation: isActive is false once superseded', () => {
  const transactions = createTransactionController();
  const t1 = transactions.begin();
  assert.equal(transactions.isActive(t1.txId), true);
  transactions.begin();
  assert.equal(transactions.isActive(t1.txId), false);

  // The pattern a stale callback must follow: check isActive() (or its own
  // signal.aborted) before mutating anything.
  let staleCommitted = false;
  function stalePresentationCallback() {
    if (!transactions.isActive(t1.txId)) return;
    staleCommitted = true;
  }
  stalePresentationCallback();
  assert.equal(staleCommitted, false);
});

test('dispatcher opens exactly one new transaction per accepted command and rejects invalid commands without one', () => {
  let state = createInitialState();
  const transactions = createTransactionController();
  const dispatcher = createDispatcher({ getState: () => state, transactions, graphContext });

  const result = dispatcher.dispatch({ type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  assert.equal(result.accepted, true);
  assert.equal(result.txId, 1);
  state = result.state;

  const invalid = dispatcher.dispatch({ type: CommandType.COMMIT_OBJECT });
  assert.equal(invalid.accepted, false);
  assert.ok(invalid.errors.length > 0);
  // Rejected commands never open a transaction.
  assert.equal(transactions.currentTransaction().txId, 1);

  const second = dispatcher.dispatch({ type: CommandType.COMMIT_OBJECT, id: 'FO.CAIN', source: 'field' });
  assert.equal(second.txId, 2);
});

test('effects planned by the dispatcher carry the transaction txId and abort signal', () => {
  let state = createInitialState();
  const transactions = createTransactionController();
  const dispatcher = createDispatcher({ getState: () => state, transactions, graphContext });
  const result = dispatcher.dispatch({ type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  assert.ok(result.effects.length > 0);
  for (const effect of result.effects) {
    assert.equal(effect.txId, result.txId);
    assert.equal(effect.signal, result.signal);
  }
});

test('a superseding dispatch aborts the previous transaction\'s effects', () => {
  let state = createInitialState();
  const transactions = createTransactionController();
  const dispatcher = createDispatcher({ getState: () => state, transactions, graphContext });
  const first = dispatcher.dispatch({ type: CommandType.COMMIT_OBJECT, id: 'FO.CORPSE', source: 'field' });
  state = first.state;
  assert.equal(first.signal.aborted, false);
  const second = dispatcher.dispatch({ type: CommandType.COMMIT_OBJECT, id: 'FO.CAIN', source: 'field' });
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
});

test('owned timers cancel by transaction', async () => {
  const timers = createTimerRegistry();
  let fired = false;
  const id = timers.schedule(() => {
    fired = true;
  }, 10, { kind: 'transaction', id: 1 });
  assert.equal(timers.size(), 1);
  const cancelled = timers.cancelByOwner({ kind: 'transaction', id: 1 });
  assert.equal(cancelled, 1);
  assert.equal(timers.size(), 0);
  await wait(20);
  assert.equal(fired, false, 'a cancelled timer must not fire');
  assert.equal(timers.cancel(id), false, 'already-cancelled timer cannot be cancelled again');
});

test('owned timers cancel by trace clear, independent of transaction-owned timers', async () => {
  const timers = createTimerRegistry();
  let transactionFired = false;
  let traceFired = false;
  timers.schedule(() => {
    transactionFired = true;
  }, 10, { kind: 'transaction', id: 7 });
  timers.schedule(() => {
    traceFired = true;
  }, 10, { kind: 'trace', id: 'wear' });
  assert.equal(timers.size(), 2);

  const cancelled = timers.cancelByOwner({ kind: 'trace', id: 'wear' });
  assert.equal(cancelled, 1);
  assert.equal(timers.size(), 1, 'the transaction-owned timer must survive a trace-only clear');

  await wait(20);
  assert.equal(traceFired, false);
  assert.equal(transactionFired, true, 'the surviving transaction-owned timer still fires');
});

test('cancelAll clears every owned timer regardless of owner kind', () => {
  const timers = createTimerRegistry();
  timers.schedule(() => {}, 1000, { kind: 'transaction', id: 1 });
  timers.schedule(() => {}, 1000, { kind: 'trace', id: 'wear' });
  assert.equal(timers.size(), 2);
  timers.cancelAll();
  assert.equal(timers.size(), 0);
});
