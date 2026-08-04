// Unique pointer ownership + gesture arbitration (T16, T-REQ-021/022/023).
// Constants from .bb-authority/contracts/algorithm-contracts.json#pointer and
// visual-tokens.json#pointer.

const MOUSE_PEN_RADIUS = 14;
const TOUCH_RADIUS = 18;
const MOVE_SLOP = { mouse: 6, pen: 6, touch: 10 };
const MINIMUM_TARGET = 24;
const MOBILE_PRIMARY_TARGET = 44;
const SYNTHETIC_CLICK_SUPPRESS_MS = 400;

function rectContains(rect, point) {
  if (!rect) return false;
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// ownerSelection, in order: within-radius candidates only, then body
// containment, then active focus membership, then smallest screen distance,
// then canonical index. At most one owner ever comes out (T-REQ-021).
export function resolvePointerOwner(point, candidates, opts = {}) {
  const { modality = 'mouse', focusMemberIds = new Set() } = opts;
  const radius = modality === 'touch' ? TOUCH_RADIUS : MOUSE_PEN_RADIUS;

  const inRange = candidates
    .filter((c) => c.visible !== false)
    .map((c) => ({
      ...c,
      distance: Math.hypot(c.screenX - point.x, c.screenY - point.y),
      contains: rectContains(c.bodyRect, point),
      isFocusMember: focusMemberIds.has(c.id),
    }))
    .filter((c) => c.contains || c.distance <= radius);

  if (inRange.length === 0) return null;

  inRange.sort((a, b) => {
    if (a.contains !== b.contains) return a.contains ? -1 : 1;
    if (a.isFocusMember !== b.isFocusMember) return a.isFocusMember ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.canonicalIndex - b.canonicalIndex;
  });

  return inRange[0].id;
}

// T-REQ-023: 24x24 CSS px, or a documented spacing exception (WCAG 2.5.8-style):
// an undersized target is acceptable if a MINIMUM_TARGET-diameter circle
// centered on it does not overlap any neighboring target's own circle.
export function meetsMinimumTarget(rect, neighborRects = [], opts = {}) {
  const min = opts.minimum ?? MINIMUM_TARGET;
  if (rect.width >= min && rect.height >= min) return true;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const requiredGap = min; // sum of two (min/2) radii
  return neighborRects.every((n) => {
    const ncx = n.x + n.width / 2;
    const ncy = n.y + n.height / 2;
    return Math.hypot(cx - ncx, cy - ncy) >= requiredGap;
  });
}

export function meetsMobilePrimaryTarget(rect) {
  return rect.width >= MOBILE_PRIMARY_TARGET && rect.height >= MOBILE_PRIMARY_TARGET;
}

// commitOnPointerUpOnly: a decision only ever comes out of pointerUp().
// Everything else (down/move/cancel) only updates internal tracking state.
export function createGestureArbiter() {
  let active = null;
  let secondPointerId = null;
  let lastCommitAt = null;

  function pointerDown(pointerId, point, ownerId, modality = 'mouse') {
    if (active) {
      // A second pointer means pinch/pan territory: never grant ownership to
      // the gesture (T-REQ-022, "no pinch or pan ownership"). Tracked
      // separately from `invalidated` (which means cancelled) so pointerUp
      // can report the more specific "second-pointer" reason.
      secondPointerId = pointerId;
      return;
    }
    active = { pointerId, ownerId, startX: point.x, startY: point.y, modality, moved: false, invalidated: false };
  }

  function pointerMove(pointerId, point) {
    if (!active || active.pointerId !== pointerId) return;
    const slop = MOVE_SLOP[active.modality] ?? MOVE_SLOP.mouse;
    if (Math.hypot(point.x - active.startX, point.y - active.startY) > slop) active.moved = true;
  }

  function pointerCancel(pointerId) {
    if (active && active.pointerId === pointerId) active.invalidated = true;
  }

  function pointerUp(pointerId, ownerIdAtUp) {
    if (!active || active.pointerId !== pointerId) {
      return { commit: false, reason: 'no-active-pointer' };
    }
    let result;
    if (active.invalidated) result = { commit: false, reason: 'invalidated-or-cancelled' };
    else if (secondPointerId != null) result = { commit: false, reason: 'second-pointer' };
    else if (active.moved) result = { commit: false, reason: 'moved-beyond-slop' };
    else if (ownerIdAtUp !== active.ownerId) result = { commit: false, reason: 'owner-changed' };
    else result = { commit: true, ownerId: active.ownerId };

    if (result.commit) lastCommitAt = Date.now();
    active = null;
    secondPointerId = null;
    return result;
  }

  // "suppress compatible synthetic click after pointer commit": browsers fire
  // a trailing click after pointerup; a real commit already happened, so that
  // click must be ignored rather than double-committing.
  function shouldSuppressSyntheticClick(now = Date.now()) {
    return lastCommitAt != null && now - lastCommitAt < SYNTHETIC_CLICK_SUPPRESS_MS;
  }

  function reset() {
    active = null;
    secondPointerId = null;
  }

  return { pointerDown, pointerMove, pointerCancel, pointerUp, shouldSuppressSyntheticClick, reset };
}
