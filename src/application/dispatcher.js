import { validateCommand } from '../state/guards.js';
import { reduceCommand } from '../state/reducer.js';
import { planEffects } from './effect-planner.js';

// The single entry point commands pass through (T07, T-REQ-005/006): validate,
// reduce, open a new owning transaction, and plan the resulting presentation
// effects tagged with that transaction. No DOM access here — `getState` is
// caller-supplied so this stays testable and framework-agnostic; running the
// planned effects is a later, presentation-layer concern.
export function createDispatcher({ getState, transactions }) {
  function dispatch(command) {
    const validation = validateCommand(command);
    if (!validation.ok) {
      return { accepted: false, errors: validation.errors };
    }
    const prevState = getState();
    const nextState = reduceCommand(prevState, command);
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
