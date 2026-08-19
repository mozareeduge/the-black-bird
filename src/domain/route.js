// Route domain model (T08, T-REQ-008/009/010). Route is complete in-memory
// session history with a monotonic sequence; nothing here ever discards an
// event -- virtualization for presentation is a separate, non-destructive view
// (selectRouteWindow), matching D-DEC-22 exactly.
//
// Canonical shape (head correction v4, contracts/semantic-normalization.json):
// { route: RouteEvent[], nextSequence } where RouteEvent is
// { sequence, id, type, label, fromId, source, committedAt }.

export function clearRoute() {
  return { route: [], nextSequence: 1 };
}

// P-RULE-004: appends exactly once for a successful new direct commit: only
// when the committed id differs from the current reading anchor. Same-id
// activation (re-committing what's already anchored) appends nothing, and so
// does anything that isn't a direct commit at all -- callers only reach this
// function for COMMIT_OBJECT/INTERRUPT_ONBOARDING_WITH_OBJECT in the first
// place; replay, inspection, View, Solo, About, chamber and camera actions
// have no code path that calls appendRouteEvent (T-REQ-009).
export function appendRouteEvent(routeState, event, currentAnchorId) {
  if (event.id === currentAnchorId) return routeState;
  const sequence = routeState.nextSequence;
  const entry = {
    sequence,
    id: event.id,
    type: event.objectType ?? null,
    label: event.label ?? null,
    fromId: currentAnchorId ?? null,
    source: event.source ?? 'unknown',
    committedAt: event.committedAt ?? Date.now(),
  };
  return {
    route: [...routeState.route, entry],
    nextSequence: sequence + 1,
  };
}

// D-DEC-22 / P-RULE-039: a non-destructive, presentation-only window over the
// complete history -- first `headSize` plus most recent `tailSize`, never
// touching routeState.route itself. Route truth is unbounded; only this view is.
export function selectRouteWindow(routeState, { headSize = 5, tailSize = 40 } = {}) {
  const route = routeState.route;
  const fullLength = route.length;
  if (fullLength <= headSize + tailSize) {
    return { route, truncated: false, hiddenCount: 0, fullLength };
  }
  const head = route.slice(0, headSize);
  const tail = route.slice(fullLength - tailSize);
  return {
    route: [...head, ...tail],
    truncated: true,
    hiddenCount: fullLength - headSize - tailSize,
    fullLength,
  };
}

// REPLAY_ROUTE_EVENT (P-RULE-007): find a committed entry by its canonical
// sequence number. Read-only -- replay never mutates route history.
export function findRouteEventBySequence(routeState, sequence) {
  return routeState.route.find((entry) => entry.sequence === sequence) ?? null;
}
