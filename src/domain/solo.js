// Solo lens domain model (T10, T-REQ-028). Solo never appends Route or trace —
// nothing here touches history/trace at all, by construction — and its
// snapshot is captured once on entry and restored exactly on exit (P-RULE-012).

// P-RULE-013: RelO Solo = the RelO plus every canonical participant. Object
// Solo = the object, every RelO that contains it, and all of those RelOs'
// participants.
export function computeSoloMembership(id, { nodesById, relations }) {
  const node = nodesById[id];
  if (!node) return new Set();
  if (node.type === 'RelO') {
    return new Set([id, ...(relations[id] || [])]);
  }
  const members = new Set([id]);
  for (const [relOId, participants] of Object.entries(relations)) {
    if (participants.includes(id)) {
      members.add(relOId);
      for (const p of participants) members.add(p);
    }
  }
  return members;
}

export function enterSolo(state, id, computeMembership) {
  const members = computeMembership(id);
  return {
    active: true,
    rootId: id,
    members: [...members],
    // Snapshot is captured once on entry; re-entering Solo (switching root
    // while already active) does not overwrite the original pre-lens snapshot.
    snapshot: state.solo.active ? state.solo.snapshot : { view: state.view },
  };
}

export function exitSolo(state) {
  return {
    solo: { active: false, rootId: null, members: [], snapshot: null },
    view: state.solo.snapshot ? state.solo.snapshot.view : state.view,
  };
}
