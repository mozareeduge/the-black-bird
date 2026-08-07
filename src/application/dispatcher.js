import { validateCommand } from '../state/guards.js';
import { assertStateInvariants } from '../state/invariants.js';
import { createReducer } from '../state/reducer.js';
import { planEffects } from './effect-planner.js';

// The single entry point commands pass through (T07, T-REQ-005/006; head
// correction v4, section 5): validate -> reduce -> assert invariants -> open
// a new owning transaction -> commit state -> plan the resulting
// presentation effects tagged with that transaction. A command rejected at
// either validation or the post-reduce invariant check opens no transaction
// and commits no state. No DOM access here -- `getState` is caller-supplied
// so this stays testable and framework-agnostic; running the planned
// effects is a later, presentation-layer concern. `graphContext`
// ({ nodesById, baseLinks, relations }) is the reducer's injected immutable
// graph context, derived once from canonical DATA by the caller.
export function createDispatcher({ getState, transactions, graphContext }) {
  const { reduceCommand } = createReducer(graphContext);

  function dispatch(command) {
    const validation = validateCommand(command);
    if (!validation.ok) {
      return { accepted: false, errors: validation.errors };
    }
    const prevState = getState();
    const nextState = reduceCommand(prevState, command);
    const invariantCheck = assertStateInvariants(nextState);
    if (!invariantCheck.ok) {
      return { accepted: false, errors: invariantCheck.violations };
    }
    const { txId, signal } = transactions.begin();
    const effects = planEffects({
      command,
      txId,
      signal,
      previousId: prevState.reading.anchorId,
      nextId: nextState.reading.anchorId,
    });
    return { accepted: true, state: nextState, txId, signal, effects };
  }

  return { dispatch };
}
