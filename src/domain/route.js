// Route domain model (T08, T-REQ-008/009/010). Route is complete in-memory
// session history with a monotonic sequence; nothing here ever discards an
// event — virtualization for presentation is a separate, non-destructive view
// (selectRouteWindow), matching D-DEC-22 exactly.

export function clearRoute() {
  return { events: [], nextIndex: 0 };
}

// P-RULE-004: appends exactly once for a successful new direct commit: only
// when the committed id differs from the current reading anchor. Same-id
// activation (re-committing what's already anchored) appends nothing, and so
// does anything that isn't a direct commit at all — callers only reach this
// function for COMMIT_OBJECT/INTERRUPT_ONBOARDING_WITH_OBJECT in the first
// place; replay, inspection, View, Solo, About, chamber and camera actions
// have no code path that calls appendRouteEvent (T-REQ-009).
export function appendRouteEvent(routeState, event, currentAnchorId) {
  if (event.id === currentAnchorId) return routeState;
  const index = routeState.nextIndex;
  const entry = {
    id: event.id,
    type: event.objectType ?? null,
    label: event.label ?? null,
    from: currentAnchorId ?? null,
    source: event.source ?? 'unknown',
    index,
    committedAt: event.committedAt ?? Date.now(),
  };
  return {
    events: [...routeState.events, entry],
    nextIndex: index + 1,
  };
}

// D-DEC-22 / P-RULE-039: a non-destructive, presentation-only window over the
// complete history — first `headSize` plus most recent `tailSize`, never
// touching routeState.events itself. Route truth is unbounded; only this view is.
export function selectRouteWindow(routeState, { headSize = 5, tailSize = 40 } = {}) {
  const events = routeState.events;
  const fullLength = events.length;
  if (fullLength <= headSize + tailSize) {
    return { events, truncated: false, hiddenCount: 0, fullLength };
  }
  const head = events.slice(0, headSize);
  const tail = events.slice(fullLength - tailSize);
  return {
    events: [...head, ...tail],
    truncated: true,
    hiddenCount: fullLength - headSize - tailSize,
    fullLength,
  };
}
