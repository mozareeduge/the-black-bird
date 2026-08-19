import { isNodeVisible } from './visibility.js';

export function selectVisibleNodeIds(nodes, view) {
  return nodes.filter((n) => isNodeVisible(n, view)).map((n) => n.id);
}

// `edges` is a caller-supplied list of { source, target } canonical base-link
// pairs (built elsewhere, e.g. by a graph-index module) — this selector only
// filters that list down to edges whose endpoints are both currently visible.
export function selectVisibleBaseEdges(edges, view, nodesById) {
  const visibleIds = new Set(selectVisibleNodeIds(Object.values(nodesById), view));
  return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
}

export function selectFocusSet(reading) {
  if (reading.fieldAttention.kind === 'focus' && reading.fieldAttention.id) {
    return new Set([reading.fieldAttention.id]);
  }
  return new Set();
}

export function selectReaderViewModel(reading, nodesById) {
  const subject = reading.readerSubject;
  if (subject.kind === 'object' && subject.id) {
    return { kind: 'object', node: nodesById[subject.id] || null };
  }
  if (subject.kind === 'projected-edge' && subject.id) {
    return { kind: 'projected-edge', id: subject.id };
  }
  return { kind: 'orientation', node: null };
}
