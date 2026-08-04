// Cost-scored eight-candidate label solver (T15, T-REQ-019/020). Pure
// geometry + scoring; no DOM. Weights and candidate order exactly from
// .bb-authority/contracts/algorithm-contracts.json#labels.

export const CANDIDATE_SIDES = Object.freeze([
  'below',
  'above',
  'right',
  'left',
  'lower-right',
  'lower-left',
  'upper-right',
  'upper-left',
]);

const WEIGHTS = Object.freeze({
  requiredLabelOverlapArea: 1000,
  anyLabelOverlapArea: 600,
  nodeBodyOverlapArea: 500,
  focusContourOverlapArea: 350,
  outsideSafeArea: 250,
  edgeCrossingCount: 80,
  distanceFromPreferred: 20,
  sideChangeFromPrevious: 12,
  radialAngularDeviation: 5,
});

function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h;
}

function sumOverlap(rect, rects) {
  return rects.reduce((sum, r) => sum + overlapArea(rect, r), 0);
}

function areaOutsideSafeRect(rect, safeRect) {
  return Math.max(0, rect.width * rect.height - overlapArea(rect, safeRect));
}

// `bodyRects` is node bodies *and* authored chrome obstacles combined (the
// contract has one nodeBodyOverlapArea weight covering both; merging chrome
// into bodyRects at the call site keeps this module's weight vocabulary
// matching the contract exactly).
export function scoreLabelCandidate(rect, side, ctx = {}) {
  const {
    placedRects = [],
    requiredPlacedRects = [],
    bodyRects = [],
    focusContourRects = [],
    safeRect = null,
    edgeCrossingCount = 0,
    distanceFromPreferred = 0,
    previousSide = null,
    radialAngularDeviation = 0,
  } = ctx;

  const anyOverlap = sumOverlap(rect, placedRects);
  const requiredOverlapExtra = sumOverlap(rect, requiredPlacedRects);
  const bodyOverlap = sumOverlap(rect, bodyRects);
  const contourOverlap = sumOverlap(rect, focusContourRects);
  const outside = safeRect ? areaOutsideSafeRect(rect, safeRect) : 0;
  const sideChange = previousSide != null && previousSide !== side ? 1 : 0;

  const cost =
    WEIGHTS.requiredLabelOverlapArea * requiredOverlapExtra +
    WEIGHTS.anyLabelOverlapArea * anyOverlap +
    WEIGHTS.nodeBodyOverlapArea * bodyOverlap +
    WEIGHTS.focusContourOverlapArea * contourOverlap +
    WEIGHTS.outsideSafeArea * outside +
    WEIGHTS.edgeCrossingCount * edgeCrossingCount +
    WEIGHTS.distanceFromPreferred * distanceFromPreferred +
    WEIGHTS.sideChangeFromPrevious * sideChange +
    WEIGHTS.radialAngularDeviation * radialAngularDeviation;

  const hasOverlap = anyOverlap > 0 || bodyOverlap > 0 || contourOverlap > 0;
  return { side, rect, cost, hasOverlap };
}

// items: [{ id, isRequired, isActive }], already ordered highest-priority
// first by the caller (active, canonical RelO participants, direct focus
// members, FO.BLACK_BIRD_FIELD, RNO/MNO structural anchors, then everything
// else) -- this module scores and places, it does not decide priority order.
// buildCandidates(item) => exactly the 8 { side, rect } candidates for item.
export function solveLabels(items, buildCandidates, ctx = {}) {
  const placed = [];
  const results = [];

  for (const item of items) {
    const candidates = buildCandidates(item);
    const scored = candidates.map((c) =>
      scoreLabelCandidate(c.rect, c.side, {
        ...ctx,
        placedRects: placed.map((p) => p.rect),
        requiredPlacedRects: placed.filter((p) => p.isRequired).map((p) => p.rect),
      })
    );
    scored.sort((a, b) => a.cost - b.cost || CANDIDATE_SIDES.indexOf(a.side) - CANDIDATE_SIDES.indexOf(b.side));

    const zeroOverlap = scored.filter((s) => !s.hasOverlap);
    let chosen = null;
    let suppressed = false;

    if (zeroOverlap.length > 0) {
      chosen = zeroOverlap[0];
    } else if (item.isActive) {
      // T-REQ-020: the active label may never be suppressed; place at the
      // least-bad candidate even if that means some overlap remains --
      // resolving that overlap is the camera-reconciliation caller's job.
      chosen = scored[0];
    } else {
      suppressed = true;
    }

    if (chosen) {
      placed.push({ id: item.id, rect: chosen.rect, isRequired: !!item.isRequired });
      results.push({ id: item.id, side: chosen.side, rect: chosen.rect, cost: chosen.cost, suppressed: false, overlapping: chosen.hasOverlap });
    } else {
      results.push({ id: item.id, side: null, rect: null, cost: null, suppressed: true, overlapping: false });
    }
  }

  return results;
}
