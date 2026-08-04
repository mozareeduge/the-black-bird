import { CommandType } from '../state/command-types.js';

// Page visibility and connectivity (T11, T-REQ-042 / P-RULE-030/037). This
// controller only ever dispatches a command — it never touches Route/trace
// directly. What "resume reconciles elapsed residues without replay" means in
// practice is: RECONCILE_DOCUMENT_VISIBILITY is dispatched, and whatever owns
// the trace region calls src/domain/trace.js's reconcileTraceDeadlines against
// the current wall clock in response — that reconciliation logic already
// exists (T09) and is deliberately not duplicated here.
export function createLifecycleController({ dispatch, doc, nav }) {
  function onVisibilityChange() {
    dispatch({ type: CommandType.RECONCILE_DOCUMENT_VISIBILITY, visibility: doc.visibilityState });
  }
  function onOnline() {
    dispatch({ type: CommandType.RECONCILE_ENVIRONMENT, connectivity: 'online' });
  }
  function onOffline() {
    dispatch({ type: CommandType.RECONCILE_ENVIRONMENT, connectivity: 'offline' });
  }

  function start() {
    doc.addEventListener('visibilitychange', onVisibilityChange);
    if (nav) {
      nav.addEventListener('online', onOnline);
      nav.addEventListener('offline', onOffline);
    }
  }

  function stop() {
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    if (nav) {
      nav.removeEventListener('online', onOnline);
      nav.removeEventListener('offline', onOffline);
    }
  }

  return { start, stop };
}
