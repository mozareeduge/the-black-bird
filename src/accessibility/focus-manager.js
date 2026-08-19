// Roving graph focus (T22, T-REQ-036): exactly one tabindex=0 at a time,
// deterministic directional movement (delegated to a caller-supplied,
// geometry-aware neighbor function -- this module owns only the roving-target
// bookkeeping, not graph geometry), and a defined fallback when the current
// or preferred target becomes hidden.
export function createFocusManager({ getVisibleIds, preferredFallbackId }) {
  let currentId = null;

  function fallback() {
    const visible = getVisibleIds();
    if (!visible.length) return null;
    const preferred = preferredFallbackId();
    return visible.includes(preferred) ? preferred : visible[0];
  }

  function setRovingTarget(id) {
    const visible = getVisibleIds();
    currentId = visible.includes(id) ? id : fallback();
    return currentId;
  }

  function getRovingTarget() {
    if (currentId != null && !getVisibleIds().includes(currentId)) currentId = fallback();
    return currentId;
  }

  function moveDirection(dx, dy, neighborInDirection) {
    const from = getRovingTarget();
    if (from == null) return setRovingTarget(preferredFallbackId());
    const next = neighborInDirection(from, dx, dy);
    if (next != null) currentId = next;
    return currentId;
  }

  function tabIndexFor(id) {
    return id === getRovingTarget() ? 0 : -1;
  }

  return { setRovingTarget, getRovingTarget, moveDirection, tabIndexFor };
}
