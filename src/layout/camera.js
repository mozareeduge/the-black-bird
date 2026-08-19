// Single safe-rectangle camera authority (T14, T-REQ-017/018). Pure geometry:
// no DOM, no d3.zoom instance owned here — callers apply the returned
// { x, y, k } transform. Constants from
// .bb-authority/contracts/algorithm-contracts.json#camera and visual-tokens.json#occupancy.

const SCALE_MIN = 0.2;
const SCALE_MAX = 2.4;
const NEUTRAL_OCCUPANCY = 0.8;
const NEUTRAL_PRIMARY_MIN = 0.72;
const NEUTRAL_PRIMARY_MAX = 0.88;
const NEUTRAL_SECONDARY_MIN = 0.52;
const FOCUS_OCCUPANCY = 0.7;
const FOCUS_OCCUPANCY_MIN = 0.58;
const FOCUS_OCCUPANCY_MAX = 0.82;
const REFIT_OUTSIDE_THRESHOLD = 0.2;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Pane bounds minus title/navigation/Reader/modal-safe margins and safe-area insets.
export function computeSafeRect(pane, margins = {}) {
  const top = margins.top || 0;
  const right = margins.right || 0;
  const bottom = margins.bottom || 0;
  const left = margins.left || 0;
  return {
    x: pane.x + left,
    y: pane.y + top,
    width: Math.max(0, pane.width - left - right),
    height: Math.max(0, pane.height - top - bottom),
  };
}

// Fits `envelope` (world-space bounding box) to `occupancy` of the limiting
// safe-rect dimension, centered, scale clamped to [scaleMin, scaleMax].
export function fitEnvelope(envelope, safeRect, opts = {}) {
  const { scaleMin = SCALE_MIN, scaleMax = SCALE_MAX, occupancy } = opts;
  const scaleX = envelope.width > 0 ? (safeRect.width * occupancy) / envelope.width : scaleMax;
  const scaleY = envelope.height > 0 ? (safeRect.height * occupancy) / envelope.height : scaleMax;
  const k = clamp(Math.min(scaleX, scaleY), scaleMin, scaleMax);
  const envelopeCx = envelope.x + envelope.width / 2;
  const envelopeCy = envelope.y + envelope.height / 2;
  const safeCx = safeRect.x + safeRect.width / 2;
  const safeCy = safeRect.y + safeRect.height / 2;
  return { x: safeCx - envelopeCx * k, y: safeCy - envelopeCy * k, k };
}

// neutral: fit all visible authored homes to target occupancy 0.80.
export function computeNeutralCamera(envelope, safeRect, opts = {}) {
  return fitEnvelope(envelope, safeRect, { ...opts, occupancy: opts.occupancy ?? NEUTRAL_OCCUPANCY });
}

// Mobile neutral core fit (H-VIS-001 secondary-axis extension, decided
// 2026-08-11): the full-world envelope's aspect ratio is fixed (H-VIS-002
// locks node topology) and, at portrait/extreme-landscape safe rects, far
// enough from the safe rect's own aspect ratio that no single uniform scale
// k can satisfy both the primary [0.72,0.88] and secondary [>=0.52]
// occupancy bands at once (their ratio, independent of k, exceeds what the
// bands can jointly tolerate -- see the world-camera spec's comment for the
// full derivation). Rather than distort node bodies with anisotropic
// scaling (forbidden by H-VIS-005's circular typed morphology) or move
// authored world positions (forbidden by H-VIS-002's stable world), this
// crops the *reference envelope* itself -- centered on `anchor` (the
// aperture's own world position) -- down to the safe rect's own aspect
// ratio, but ONLY when the full envelope would actually leave an axis out
// of band; a viewport where the full envelope already satisfies both bands
// (every desktop viewport, and any mobile viewport that happens to)
// receives the full envelope back, byte-identical to before this function
// existed. When it does apply, both axes land at exactly NEUTRAL_OCCUPANCY
// (0.8) -- comfortably centered in both bands, not scraping a floor -- and
// the rest of the field remains reachable by the same pan/zoom gesture
// already used everywhere else (this changes what neutral fits, not what
// exists or what View/Solo/visibility mean).
export function neutralCoreEnvelope(envelope, safeRect, anchor, opts = {}) {
  const {
    occupancy = NEUTRAL_OCCUPANCY,
    primaryMin = NEUTRAL_PRIMARY_MIN,
    primaryMax = NEUTRAL_PRIMARY_MAX,
    secondaryMin = NEUTRAL_SECONDARY_MIN,
  } = opts;
  if (envelope.width <= 0 || envelope.height <= 0 || safeRect.width <= 0 || safeRect.height <= 0) return envelope;
  const scaleX = (safeRect.width * occupancy) / envelope.width;
  const scaleY = (safeRect.height * occupancy) / envelope.height;
  const k = Math.min(scaleX, scaleY);
  const occX = (envelope.width * k) / safeRect.width;
  const occY = (envelope.height * k) / safeRect.height;
  const primary = Math.max(occX, occY);
  const secondary = Math.min(occX, occY);
  const inBand = primary >= primaryMin && primary <= primaryMax && secondary >= secondaryMin;
  if (inBand) return envelope;
  const safeAspect = safeRect.width / safeRect.height;
  const envAspect = envelope.width / envelope.height;
  if (envAspect > safeAspect) {
    const width = envelope.height * safeAspect;
    return { x: anchor.x - width / 2, y: envelope.y, width, height: envelope.height };
  }
  const height = envelope.width / safeAspect;
  return { x: envelope.x, y: anchor.y - height / 2, width: envelope.width, height };
}

function projectEnvelope(envelope, t) {
  return { x: envelope.x * t.k + t.x, y: envelope.y * t.k + t.y, width: envelope.width * t.k, height: envelope.height * t.k };
}

function intersectionArea(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h;
}

function fractionOutside(projected, safeRect) {
  const area = projected.width * projected.height;
  if (area <= 0) return 0;
  return 1 - intersectionArea(projected, safeRect) / area;
}

function minimalPan(projected, safeRect, t) {
  let dx = 0;
  let dy = 0;
  if (projected.x < safeRect.x) dx = safeRect.x - projected.x;
  else if (projected.x + projected.width > safeRect.x + safeRect.width) {
    dx = safeRect.x + safeRect.width - (projected.x + projected.width);
  }
  if (projected.y < safeRect.y) dy = safeRect.y - projected.y;
  else if (projected.y + projected.height > safeRect.y + safeRect.height) {
    dy = safeRect.y + safeRect.height - (projected.y + projected.height);
  }
  return { x: t.x + dx, y: t.y + dy, k: t.k };
}

function projectedOccupancy(projected, safeRect) {
  if (safeRect.width <= 0 || safeRect.height <= 0) return 0;
  return Math.max(projected.width / safeRect.width, projected.height / safeRect.height);
}

// firstFocus: fit to 0.70. laterFocus: preserve transform when the focus
// envelope is fully inside the safe rect AND already within the sealed
// occupancy band [occupancyMin,occupancyMax]; a minimal pan when partially
// outside; a full refit when more than 20% of the envelope's projected area
// lies outside the safe rect, OR when it's fully/mostly inside but so small
// (or so large) that it sits outside the occupancy band regardless -- an
// envelope near a previous focus's center can be "fully inside" while
// occupying a small fraction of the safe rect, which preserve/minimal-pan
// alone would leave there indefinitely (H-VIS-001's focused-occupancy band
// is the locked outcome; "avoid a jarring refit for an in-view target" was
// never meant to also mean "never correct an out-of-band composition").
export function computeFocusCamera(envelope, safeRect, currentTransform, opts = {}) {
  const {
    scaleMin = SCALE_MIN,
    scaleMax = SCALE_MAX,
    occupancy = FOCUS_OCCUPANCY,
    occupancyMin = FOCUS_OCCUPANCY_MIN,
    occupancyMax = FOCUS_OCCUPANCY_MAX,
    isFirstFocus = false,
  } = opts;
  if (isFirstFocus || !currentTransform) {
    return fitEnvelope(envelope, safeRect, { scaleMin, scaleMax, occupancy });
  }
  const projected = projectEnvelope(envelope, currentTransform);
  const outside = fractionOutside(projected, safeRect);
  if (outside > REFIT_OUTSIDE_THRESHOLD) {
    return fitEnvelope(envelope, safeRect, { scaleMin, scaleMax, occupancy });
  }
  const inBand = projectedOccupancy(projected, safeRect) >= occupancyMin && projectedOccupancy(projected, safeRect) <= occupancyMax;
  if (!inBand) return fitEnvelope(envelope, safeRect, { scaleMin, scaleMax, occupancy });
  if (outside === 0) return currentTransform;
  return minimalPan(projected, safeRect, currentTransform);
}

// T-REQ-017: camera work is cancellable by txId. `compute` runs unconditionally
// (it's pure and cheap — geometry, not a rendered mutation); the result is
// only handed back if the owning transaction is still active, so a stale
// callback can compute a transform but can never have it applied.
export function reconcileCamera({ txId, isActive, compute }) {
  const result = compute();
  return isActive(txId) ? result : null;
}
