// Structural (single-snapshot) invariants from the state contract (T05, T-REQ-004).
//
// Some contract invariants describe a *transition* ("RETURN_TO_WHOLE_FIELD does
// not clear anchor", "projected-edge inspection never changes anchor, route,
// trace, solo or view", "delayed presentation effects carry the active txId
// and abort signal") and cannot be checked from one state snapshot alone —
// those belong to the reducer/guards/effect-planner modules of a later task.
// What is checked here is what a single snapshot can actually prove: the
// structural half of each invariant, including the key property that makes
// the transition invariants meaningful in the first place (this checker
// never demands anchorId be null just because fieldAttention is whole-field,
// which is what "return-to-field does not clear anchor" depends on).

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function assertStateInvariants(state) {
  const violations = [];
  const fail = (msg) => violations.push(msg);

  if (!isPlainObject(state)) {
    return { ok: false, violations: ['state is not an object'] };
  }

  const { reading, history, trace, solo, overlay } = state;

  // "anchorId is null only before first commit; RETURN_TO_WHOLE_FIELD does not clear it"
  if (isPlainObject(history) && Array.isArray(history.route) && isPlainObject(reading)) {
    if (history.route.length > 0 && reading.anchorId === null) {
      fail('anchorId is null but history.route is non-empty (a commit has already happened)');
    }
  }

  // "fieldAttention and readerSubject are independent": both are present, separately
  // shaped regions with no coupling asserted between their values. Deliberately NOT
  // checking any relationship between fieldAttention and readerSubject here — asserting
  // one *would* reintroduce the coupling this invariant forbids.
  if (isPlainObject(reading)) {
    for (const key of ['fieldAttention', 'readerSubject']) {
      const region = reading[key];
      if (!isPlainObject(region) || typeof region.kind !== 'string' || !('id' in region)) {
        fail(`reading.${key} is not a well-formed { kind, id } region`);
      }
    }
  }

  // "route contains only direct commits" (structural shape of any existing entries)
  if (isPlainObject(history) && Array.isArray(history.route)) {
    history.route.forEach((entry, i) => {
      if (!isPlainObject(entry) || typeof entry.id !== 'string' || typeof entry.seq !== 'number') {
        fail(`history.route[${i}] is not a well-formed { id, seq } commit entry`);
      }
    });
    if (typeof history.nextSequence !== 'number') fail('history.nextSequence is not a number');
  }

  // "only one modal overlay may be active" — a single kind field can only ever hold one
  // value; check it's actually shaped that way (not, say, an array of active overlays).
  if (isPlainObject(overlay)) {
    if (overlay.kind !== null && typeof overlay.kind !== 'string') {
      fail('overlay.kind must be null or a single string, never a list of active overlays');
    }
  }

  // "solo snapshot is captured once on entry and restored exactly on exit"
  if (isPlainObject(solo)) {
    if (solo.active === true && solo.snapshot === null) {
      fail('solo.active is true but solo.snapshot was never captured');
    }
    if (solo.active === false && solo.snapshot !== null) {
      fail('solo.active is false but solo.snapshot was not restored/cleared on exit');
    }
  }

  // "afterglow deadlines are wall-clock timestamps"
  if (isPlainObject(trace) && Array.isArray(trace.afterglows)) {
    trace.afterglows.forEach((entry, i) => {
      if (!isPlainObject(entry) || typeof entry.deadline !== 'number') {
        fail(`trace.afterglows[${i}] has no numeric wall-clock deadline`);
      }
    });
  }

  return { ok: violations.length === 0, violations };
}
