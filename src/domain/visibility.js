// View/Hide domain model (T10, T-REQ-026/027): representation only, never
// ontology or Route. None of these functions read or return DATA/nodes/edges
// definitions or history.route — they only ever touch `view`/`reading`.

export function isNodeVisible(node, view) {
  if (!node) return false;
  if (view.objectVisibility[node.id] === false) return false;
  return view.typeVisibility[node.type] !== false;
}

// P-RULE-015: if the field-attended object becomes invisible, field attention
// becomes neutral (whole-field) while the reading anchor and Reader subject
// are left exactly as they were — the anchor stays explicit and readable,
// never silently re-shown just because it's the current anchor (P-RULE-017).
export function reconcileHiddenAnchor(reading, node, view) {
  if (reading.fieldAttention.kind !== 'focus') return reading;
  if (isNodeVisible(node, view)) return reading;
  return { ...reading, fieldAttention: { kind: 'whole-field', id: null } };
}

// RESTORE_FIELD: every type back on, every individual hide cleared.
export function restoreVisibility(view) {
  return {
    ...view,
    typeVisibility: Object.fromEntries(Object.keys(view.typeVisibility).map((k) => [k, true])),
    objectVisibility: {},
  };
}
