// Field trace domain model (T09, T-REQ-011/012/013): wear and afterglow.
// clearTrace has no access to Route state at all — by construction it cannot
// clear Route, satisfying P-RULE-010's independence requirement structurally
// rather than by convention.

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// P-RULE-008 / T-REQ-012: wear is inferred only over visible canonical base
// links; projected edges never wear. `neighbors(id)` is caller-supplied and
// must already return only visible canonical base-link neighbors of `id`,
// sorted by canonical index — this module has no opinion on what "canonical"
// or "visible" means, only on tracing wear along whatever graph it's given.
function shortestVisiblePath(fromId, toId, neighbors) {
  if (fromId === toId) return [fromId];
  const visited = new Set([fromId]);
  const parent = new Map();
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift();
    for (const next of neighbors(current)) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === toId) {
        const path = [toId];
        let cur = toId;
        while (cur !== fromId) {
          cur = parent.get(cur);
          path.push(cur);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

const WEAR_CAP_PER_EDGE = 7;

export function recordWear(traceState, { fromId, toId, neighbors }) {
  if (fromId == null || toId == null || fromId === toId) return traceState;
  const path = shortestVisiblePath(fromId, toId, neighbors);
  if (!path || path.length < 2) return traceState;
  const wear = { ...traceState.wear };
  let changed = false;
  for (let i = 0; i + 1 < path.length; i++) {
    const key = edgeKey(path[i], path[i + 1]);
    const current = wear[key] || 0;
    if (current < WEAR_CAP_PER_EDGE) {
      wear[key] = current + 1;
      changed = true;
    }
  }
  return changed ? { ...traceState, wear } : traceState;
}

// P-RULE-009 / T-REQ-013: afterglow belongs only to departure from a successful
// new direct commit and stores a wall-clock deadline; cap is contextual
// (desktop/mobile counts differ) and supplied by the caller, keeping the
// deadline semantics themselves invariant regardless of cap.
export function recordAfterglow(traceState, { id, nowMs = Date.now(), durationMs, cap }) {
  const entry = { id, deadline: nowMs + durationMs };
  let afterglows = [...traceState.afterglows, entry];
  if (afterglows.length > cap) {
    afterglows = afterglows.slice(afterglows.length - cap);
  }
  return { ...traceState, afterglows };
}

// P-RULE-030 / D-DEC-18: hidden-tab / resume reconciliation. Expired deadlines
// are dropped against the current wall clock; nothing is replayed.
export function reconcileTraceDeadlines(traceState, nowMs = Date.now()) {
  const afterglows = traceState.afterglows.filter((a) => a.deadline > nowMs);
  if (afterglows.length === traceState.afterglows.length) return traceState;
  return { ...traceState, afterglows };
}

// T-REQ-011: idempotent — clearing an already-clear trace returns an
// equivalent empty trace every time, and never reads or touches Route.
export function clearTrace() {
  return { wear: {}, afterglows: [] };
}
