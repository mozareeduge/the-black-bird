// Pure deterministic focus-target geometry (T13, T-REQ-016). No runtime
// physics simulation owns this geometry: given the same active id and the
// same authored/graph context, computeFocusTargets always returns the same
// targets. Exact constants and algorithm from
// .bb-authority/contracts/algorithm-contracts.json#focus_targets.

const MAX_NEIGHBORS = 14;
const INNER_RADIUS = 76;
const INNER_CAPACITY = 8;
const OUTER_RADIUS = 118;
const ROTATION_STEPS = 16;
const ROTATION_STEP_RAD = (2 * Math.PI) / ROTATION_STEPS;

function wrapAngle(a) {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

function angleFrom(center, point) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

// For each ring, evenly-spaced slots in the ring's sorted circular order are
// tested at 16 rotations (22.5-degree increments); the rotation minimizing
// the sum of squared wrapped angular displacement from each candidate's own
// authored-home angle wins. Ties keep the smallest rotation index, which
// falls out naturally from testing k = 0..15 in order and only replacing the
// best on a strictly smaller cost.
function assignRing(ring, radius, center, targets) {
  const n = ring.length;
  if (n === 0) return;
  const slotStep = (2 * Math.PI) / n;
  let bestRotation = 0;
  let bestCost = Infinity;
  for (let k = 0; k < ROTATION_STEPS; k++) {
    const rotation = k * ROTATION_STEP_RAD;
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const diff = wrapAngle(rotation + i * slotStep - ring[i].angle);
      cost += diff * diff;
    }
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      bestRotation = rotation;
    }
  }
  for (let i = 0; i < n; i++) {
    const slotAngle = bestRotation + i * slotStep;
    targets.set(ring[i].id, {
      x: center.x + Math.cos(slotAngle) * radius,
      y: center.y + Math.sin(slotAngle) * radius,
    });
  }
}

// context supplies everything graph-shaped: this module owns only the
// geometry, not what "canonical participant" or "structural neighbor" means.
export function computeFocusTargets(activeId, context) {
  const {
    homeFor,
    allIds,
    nodeType,
    canonicalIndexOf,
    canonicalParticipantsOf = () => [],
    baseEdgeNeighborsOf = () => [],
    containingRelOsOf = () => [],
    structuralNeighborsOf = () => [],
    projectedNeighborsOf = () => [],
  } = context;

  const targets = new Map();
  const coreHome = activeId != null ? homeFor(activeId) : null;

  if (!coreHome) {
    for (const id of allIds) targets.set(id, homeFor(id));
    return targets;
  }

  targets.set(activeId, coreHome);

  const seen = new Set([activeId]);
  const tiered = [];
  const addTier = (ids, tier) => {
    for (const id of ids || []) {
      if (seen.has(id)) continue;
      const home = homeFor(id);
      if (!home) continue;
      seen.add(id);
      tiered.push({ id, tier, home });
    }
  };

  addTier(nodeType(activeId) === 'RelO' ? canonicalParticipantsOf(activeId) : [], 0);
  addTier(baseEdgeNeighborsOf(activeId), 1);
  addTier(containingRelOsOf(activeId), 2);
  addTier(structuralNeighborsOf(activeId), 3);
  addTier(projectedNeighborsOf(activeId), 4);

  const ranked = tiered
    .map((t) => ({ id: t.id, tier: t.tier, angle: angleFrom(coreHome, t.home), index: canonicalIndexOf(t.id) }))
    .sort((a, b) => a.tier - b.tier || a.angle - b.angle || a.index - b.index)
    .slice(0, MAX_NEIGHBORS);

  assignRing(ranked.slice(0, INNER_CAPACITY), INNER_RADIUS, coreHome, targets);
  assignRing(ranked.slice(INNER_CAPACITY), OUTER_RADIUS, coreHome, targets);

  for (const id of allIds) {
    if (!targets.has(id)) targets.set(id, homeFor(id));
  }
  return targets;
}
