// ── Production module imports (F02) ─────────────────────────────────────────
// src/app.js is the composition/bootstrap root: it imports the independently
// tested layered modules as its geometry authority rather than reimplementing
// them. scripts/build.mjs bundles this file (and everything it imports) with
// esbuild into one deterministic, backend-free <script>.
import { AUTHORED_HOMES, WORLD as AUTHORED_WORLD } from './layout/authored-world.js';
import { computeFocusTargets } from './layout/focus-targets.js';
import { computeSafeRect, computeNeutralCamera, computeFocusCamera } from './layout/camera.js';
import { solveLabels } from './layout/label-solver.js';
import { resolvePointerOwner } from './layout/pointer-ownership.js';
import { CommandType } from './state/command-types.js';
import { createInitialState } from './state/initial-state.js';
import { createTransactionController } from './application/transaction-controller.js';
import { createDispatcher } from './application/dispatcher.js';
import { validateBootstrap } from './bootstrap.js';
import { renderBootstrapFailure } from './presentation/bootstrap-renderer.js';
import { isApertureNode, morphologyOf, computeNodeMetrics } from './presentation/field-renderer.js';
import { createStatusRenderer } from './presentation/status-renderer.js';

// ── Bootstrap validation (T04, T-REQ-003) ───────────────────────────────────
const BB_UI_COPY = {
  bootstrapUnavailableTitle: "The field could not be opened",
  bootstrapUnavailableBody:
    "The artwork did not finish loading. Reload the page. If the problem continues, use the source and citation links below.",
};
function bbValidateBootstrap() {
  return validateBootstrap({ data: typeof DATA !== "undefined" ? DATA : null, hasD3: typeof d3 !== "undefined" });
}
function bbRenderBootstrapFailure() {
  const app = document.getElementById("app");
  if (!app) return;
  renderBootstrapFailure(app, BB_UI_COPY);
}
// A global listener, not a wrapping try/catch: everything below declares its
// top-level bindings with const/let, and this file is concatenated as one
// flat classic <script> (see scripts/build.mjs). Wrapping the rest of this
// file in a block would scope every one of those declarations to that block,
// breaking every external page.evaluate() call (including this whole test
// suite's) that reads them as script-global names. A window error listener
// gets the same "never leave a partial page visible" guarantee with no
// wrapping block.
window.addEventListener("error", function () {
  if (!document.querySelector(".bb-unavailable")) bbRenderBootstrapFailure();
});
window.addEventListener("unhandledrejection", function () {
  if (!document.querySelector(".bb-unavailable")) bbRenderBootstrapFailure();
});
const bbBootstrap = bbValidateBootstrap();
if (!bbBootstrap.ok) {
  throw new Error("BB_BOOTSTRAP_FAILED:" + bbBootstrap.reason);
}
// ── Stable graph world (viewport-independent) ───────────────────────────────
// The poem has one spatial world, sourced from the authored contract
// (src/layout/authored-world.js / src/data/world-layout.json) — not a
// locally re-typed literal. Desktop/mobile/Reader-open camera framing
// changes; the authored topology underneath never does.
const WORLD = AUTHORED_WORLD;
const WORLD_CLUSTER_CENTERS = Object.freeze({
  central: [500, 360],
  quran: [225, 225],
  norse: [725, 215],
  irish: [215, 535],
  american: [790, 505],
  lyric: [500, 650],
});

// ── Core data ──────────────────────────────────────────────────────────────
const nodes = DATA.nodes.map((d) => ({ ...d }));
const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
const typeOrder = DATA.ui.objectTypes;
const defaultVisibility = Object.fromEntries(nodes.map((n) => [n.id, true]));

// ── Reference algorithms (deterministic morphology + wear path) ────────────
function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededUnit(seed) {
  let x = stableHash(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function irregularCirclePath(id, radius = 6.8, points = 12) {
  const rnd = seededUnit(id);
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (Math.PI * 2 * i) / points;
    const r = radius * (0.955 + rnd() * 0.09);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return (
    pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(" ") + " Z"
  );
}
function stableBfsPath(start, goal, orderedEdges, visibleIds) {
  if (!start || !goal || start === goal) return [];
  const visible = new Set(visibleIds);
  if (!visible.has(start) || !visible.has(goal)) return [];
  const adj = new Map();
  for (const [a, b] of orderedEdges) {
    if (!visible.has(a) || !visible.has(b)) continue;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  for (const v of adj.values()) v.sort();
  const q = [start],
    prev = new Map([[start, null]]);
  while (q.length) {
    const cur = q.shift();
    for (const next of adj.get(cur) || []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === goal) {
        q.length = 0;
        break;
      }
      q.push(next);
    }
  }
  if (!prev.has(goal)) return [];
  const path = [];
  for (let at = goal; at != null; at = prev.get(at)) path.push(at);
  return path.reverse();
}
function canonicalEdgeKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

// ── State ──────────────────────────────────────────────────────────────────
let S = {
  phase: "threshold",
  viewport: isMobile() ? "mobile" : "desktop",
  surface: "field",
  overlay: null,
  activeId: null,
  touchedId: null,
  activeEdge: null,
  activeRelos: [],
  routeEvents: [],
  // Presentation-only recent-tail window for route halos/segments (routeStats,
  // routeSegments); Route truth itself is never capped or truncated
  // (P-RULE-005/039, D-DEC-22) — see registerRouteEvent below.
  recentRouteWindow: 11,
  maxVisibleRouteSegments: 10,
  objectGroups: { RNO: true, MNO: true, FO: true, NameO: true, RefO: true, RelO: true },
  viewOptions: { projected: true, labels: true, sourceNames: false },
  objectVisibility: { ...defaultVisibility },
  soloSet: null,
  transform: d3.zoomIdentity,
  readerOpen: false,
  onboardingActive: false,
  cameraInFlight: false,
  previewTarget: null,
  previewTimer: null,
  showSheet: false,
  indexFilter: "all",
  aboutOpen: false,
  aboutOrigin: null,
  fieldTrace: {
    previousCommittedId: null,
    wear: Object.create(null),
    afterglows: [],
    activeClearingId: null,
    designContractVersion: "2.0.0",
  },
};

// Expose state for testing (S is let, not on window automatically)
window.__bbState = S;

// ── Canonical semantic state (F03) ──────────────────────────────────────────
// src/state/reducer.js (tested against tests/contracts/command-contract.json)
// is the single authority for whether a semantic change is accepted and what
// Route/trace policy it carries; src/application/dispatcher.js +
// transaction-controller.js (tests/unit/transactions.test.js) are the tested
// modules that own validate -> reduce -> open-one-transaction, so app.js
// calls those directly rather than re-deciding validation or transaction
// ownership inline. S above stays the legacy read-model the rest of this
// file renders from and is not replaced wholesale — but every semantic
// mutation it models now goes through dispatch() first. Presentation-only
// fields with no counterpart in the canonical shape (camera-in-flight, hover
// timers, sheet visibility) and effects the canonical model does not compute
// (edge-BFS wear, afterglow decay — see algorithm-contracts.json's richer
// "trace.wear" spec vs. the reducer's simpler per-id counter) remain local
// to S. planEffects()'s declarative effect list (camera-focus, reader-render,
// route-draw, ...) is available on every dispatch result but not yet
// consumed here — app.js's existing imperative orchestration in commitFocus/
// focusObject already performs the equivalent work with call-site-specific
// timing app.js's own opts already parameterize; wiring an effect-interpreter
// to replace that orchestration is disclosed, separate remaining scope.
let canonicalState = createInitialState();
const canonicalTransactions = createTransactionController();
const canonicalDispatcher = createDispatcher({
  getState: () => canonicalState,
  transactions: canonicalTransactions,
});
function dispatch(command) {
  const result = canonicalDispatcher.dispatch(command);
  if (!result.accepted) {
    throw new Error(`dispatch: ${command.type} rejected: ${result.errors.join('; ')}`);
  }
  canonicalState = result.state;
  return canonicalState;
}
dispatch({ type: CommandType.BOOTSTRAP_READY });

// ── Design-response local runtime (not stored on S; not DOM nodes) ─────────
const afterglowTimers = new Map();
let pulseTimers = [];
let travelPulseActive = false;
let currentLightMode = "field";
let currentPenumbraVisible = false;
let appliedBlurPx = 0;

// ── Read-only diagnostic adapter (window.__bbDesign) ────────────────────────
const FONT_SPECS = [
  { family: "IBM Plex Mono", url: "assets/fonts/IBMPlexMono-Regular.woff2" },
  { family: "IBM Plex Mono", url: "assets/fonts/IBMPlexMono-Medium.woff2" },
  { family: "Crimson Pro", url: "assets/fonts/crimson-pro-latin-ext-400-normal.woff2" },
  { family: "Crimson Pro", url: "assets/fonts/crimson-pro-latin-ext-400-italic.woff2" },
  { family: "Scheherazade New", url: "assets/fonts/scheherazade-new-arabic-400-normal.woff2" },
];
window.__bbDesign = {
  contractVersion: "2.0.0",
  morphologyFor(id) {
    const n = byId[id];
    if (!n) return null;
    return { canonicalType: n.type, visualRole: renderRole(n), morphology: morphologyOf(n) };
  },
  snapshot() {
    return {
      contractVersion: "2.0.0",
      activeId: S.activeId,
      activeType: S.activeId ? byId[S.activeId]?.type || null : null,
      lightMode: currentLightMode,
      penumbraVisible: currentPenumbraVisible,
      apertureCoreLit: false,
      clearing: this.clearingSnapshot(),
      afterglowIds: S.fieldTrace.afterglows.map((a) => a.id),
      wearEntries: this.wearSnapshot().entries,
      routeIds: S.routeEvents.map((e) => e.id),
      reducedMotion: prefersReducedMotion(),
      maxAppliedBlurPx: isMobile() || prefersReducedMotion() ? 0 : appliedBlurPx,
      travelPulseActive,
      layerCounts: {
        clearing: S.fieldTrace.activeClearingId ? 1 : 0,
        afterglow: S.fieldTrace.afterglows.length,
      },
      timerCount: afterglowTimers.size + pulseTimers.length,
    };
  },
  clearingSnapshot() {
    const relOId = S.fieldTrace.activeClearingId;
    if (!relOId)
      return {
        relOId: null,
        count: 0,
        visibleMemberIds: [],
        pathD: "",
        finite: true,
        bounds: null,
      };
    const memberIds = clearingMemberIdsFor(relOId);
    const allPts = [byId[relOId], ...memberIds.map((id) => byId[id])].filter(Boolean);
    const finitePts = allPts.filter((d) => Number.isFinite(nodeX(d)) && Number.isFinite(nodeY(d)));
    const finite = allPts.length > 0 && finitePts.length === allPts.length;
    return {
      relOId,
      count: 1,
      visibleMemberIds: memberIds,
      pathD: "",
      finite,
      bounds: finitePts.length ? getNodeBounds(finitePts, 20) : null,
    };
  },
  wearSnapshot() {
    const entries = Object.entries(S.fieldTrace.wear).map(([edgeKey, passCount]) => ({
      edgeKey,
      passCount,
    }));
    return { entries, maxPassCount: entries.reduce((m, e) => Math.max(m, e.passCount), 0) };
  },
  async fontSnapshot() {
    try {
      await document.fonts.ready;
    } catch (e) {}
    return {
      faces: FONT_SPECS.map((s) => ({
        family: s.family,
        status: document.fonts.check(`12px "${s.family}"`) ? "loaded" : "unloaded",
      })),
      urls: FONT_SPECS.map((s) => s.url),
    };
  },
  performanceSnapshot() {
    return {
      nodeCount: simNodes.length,
      edgeCount: baseLinks.length + projectedLinks.length,
      clearingCount: S.fieldTrace.activeClearingId ? 1 : 0,
      afterglowCount: S.fieldTrace.afterglows.length,
      timerCount: afterglowTimers.size + pulseTimers.length,
    };
  },
  resetTrace() {
    clearFieldTrace();
    return this.snapshot();
  },
  simAlpha() {
    return positioningActive ? 0.2 : 0;
  },
  fieldFitted() {
    return fitted;
  },
};
["IBM Plex Mono", "Crimson Pro", "Scheherazade New"].forEach((f) => {
  try {
    // document.fonts.load() is async and rejects on a blocked/failed font
    // request (P-SCN-006) — the try/catch above only guards a synchronous
    // throw. An uncaught rejection here is an unhandledrejection, which
    // window.addEventListener("unhandledrejection", ...) treats as a real
    // bootstrap failure and renders the full unavailable surface for what
    // is only a font preload nicety.
    document.fonts.load(`12px "${f}"`).catch(() => {});
  } catch (e) {}
});

// ── Helpers ────────────────────────────────────────────────────────────────
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion:reduce)").matches;
}
function isMobile() {
  return matchMedia("(max-width:860px)").matches;
}
function countType(t) {
  return nodes.filter((n) => n.type === t).length;
}
function labelOf(id) {
  return byId[id]?.label || id;
}
function shortOf(id) {
  return byId[id]?.shortLabel || byId[id]?.label || id;
}
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function updatePhaseClass() {
  const app = document.getElementById("app");
  S.viewport = isMobile() ? "mobile" : "desktop";
  app.classList.remove(
    "phase-threshold",
    "phase-onboarding",
    "phase-focused",
    "phase-field",
    "surface-field",
    "surface-read",
  );
  app.classList.add("phase-" + S.phase, "surface-" + S.surface);
  document
    .querySelectorAll("[data-mobile]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mobile === S.surface));
}
function syncSurfaceCanonical() {
  dispatch({ type: CommandType.SET_SURFACE, surface: S.surface });
}
async function setSurface(surface, opts = {}) {
  S.surface = surface;
  syncSurfaceCanonical();
  updatePhaseClass();
  await nextFrame();
  if (surface === "field" && opts.measure !== false) measureGraph();
}
function setOverlay(name) {
  S.overlay = name;
}
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function measureGraph() {
  // Camera-pane geometry only (4.1) — authored world topology never changes
  // on resize; only the camera projection (viewBox/safe-rect) does.
  width = mapWrap.clientWidth;
  height = mapWrap.clientHeight;
  if (width < 10 || height < 10) return;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  updateGraphGeometry();
}
async function setReaderOpen(open, opts = {}) {
  S.readerOpen = open;
  document.getElementById("mainLayout").classList.toggle("reader-open", open);
  await nextFrame();
  if (opts.measure !== false) measureGraph();
  if (opts.waitTransition) {
    await sleep(opts.transitionMs ?? 680);
    if (opts.measure !== false) measureGraph();
  }
}

// ── Edge data ──────────────────────────────────────────────────────────────
const relParticipant = [];
Object.entries(DATA.relations).forEach(([rid, parts]) => {
  parts.forEach((pid) => relParticipant.push({ source: rid, target: pid, kind: "rel" }));
});
const citationEdges = [];
Object.entries(DATA.texts).forEach(([tid, t]) => {
  (t.refs || []).forEach((rid) =>
    citationEdges.push({ source: tid, target: rid, kind: "citation" }),
  );
  (t.objects || []).forEach((oid) =>
    citationEdges.push({ source: tid, target: oid, kind: "appears" }),
  );
});
Object.entries(DATA.nameos).forEach(([nid, no]) => {
  (no.attached || []).forEach((a) => citationEdges.push({ source: nid, target: a, kind: "name" }));
});
const baseEdgesRaw = [...relParticipant, ...citationEdges];

function buildProjected() {
  const map = new Map();
  Object.entries(DATA.relations).forEach(([rid, parts]) => {
    const usable = parts.filter((id) => byId[id] && byId[id].type !== "RefO");
    for (let i = 0; i < usable.length; i++)
      for (let j = i + 1; j < usable.length; j++) {
        const a = usable[i],
          b = usable[j],
          key = [a, b].sort().join("||");
        if (!map.has(key)) map.set(key, { source: a, target: b, relos: [], kind: "projected" });
        map.get(key).relos.push(rid);
      }
  });
  return [...map.values()].map((e) => ({ ...e, weight: e.relos.length }));
}
const projectedRaw = buildProjected();

const adj = {};
nodes.forEach((n) => (adj[n.id] = new Set()));
baseEdgesRaw.forEach((e) => {
  if (adj[e.source] && adj[e.target]) {
    adj[e.source].add(e.target);
    adj[e.target].add(e.source);
  }
});
projectedRaw.forEach((e) => {
  if (adj[e.source] && adj[e.target]) {
    adj[e.source].add(e.target);
    adj[e.target].add(e.source);
  }
});
// Canonical base links only (relation participation + citation/appearance/name
// edges) — excludes projected edges. Used to rank direct neighbors for the
// focus force's candidate selection (4.2).
const baseAdj = {};
nodes.forEach((n) => (baseAdj[n.id] = new Set()));
baseEdgesRaw.forEach((e) => {
  if (baseAdj[e.source] && baseAdj[e.target]) {
    baseAdj[e.source].add(e.target);
    baseAdj[e.target].add(e.source);
  }
});
// Canonical DATA order — the same tie-break convention already used by
// resolveNearestVisibleNode's "canonical DATA order (simNodes iteration
// order)" fallback; computeFocusTargets uses it to break angle ties.
const nodeCanonicalIndex = new Map(nodes.map((n, i) => [n.id, i]));
// RelOs containing each id as a participant (F04 focus-target context).
const containingRelOsIndex = new Map(nodes.map((n) => [n.id, []]));
Object.entries(DATA.relations).forEach(([rid, parts]) => {
  parts.forEach((pid) => {
    if (containingRelOsIndex.has(pid)) containingRelOsIndex.get(pid).push(rid);
  });
});
// Projected-edge partners per id (F04 focus-target context, lowest tier).
const projectedAdj = new Map(nodes.map((n) => [n.id, new Set()]));
projectedRaw.forEach((e) => {
  if (projectedAdj.has(e.source) && projectedAdj.has(e.target)) {
    projectedAdj.get(e.source).add(e.target);
    projectedAdj.get(e.target).add(e.source);
  }
});

// ── Graph setup ────────────────────────────────────────────────────────────
const svg = d3.select("#graphSvg");
const mapWrap = document.getElementById("mapWrap");
let width = 0,
  height = 0;
// ── RelO clearing: one masked continuous field (4.9, fixes BB-R11) ─────────
// One visible rect, shaped entirely by a blurred/thresholded mask of hidden
// kernel circles at the RelO + participant coordinates — no visible member
// pools, no spokes. Kernel/subtract-circle coordinates are world-space
// (same coordinate system as everything else in `root`).
const defs = svg.append("defs");
const clearingFilter = defs
  .append("filter")
  .attr("id", "bb-clearing-blur")
  .attr("x", "-60%")
  .attr("y", "-60%")
  .attr("width", "220%")
  .attr("height", "220%");
const clearingBlur = clearingFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", 18);
clearingFilter
  .append("feComponentTransfer")
  .append("feFuncA")
  .attr("type", "table")
  .attr("tableValues", "0 0 0 0.25 0.9 1 1 1");
const clearingMask = defs.append("mask").attr("id", "bb-clearing-mask");
const clearingMaskGroup = clearingMask.append("g").attr("filter", "url(#bb-clearing-blur)");
const root = svg.append("g");
const clearingLayer = root.append("g").attr("class", "bb-clearing-layer");
const clearingRect = clearingLayer
  .append("rect")
  .attr("class", "bb-clearing-field")
  .attr("x", WORLD.cx - WORLD.width)
  .attr("y", WORLD.cy - WORLD.height)
  .attr("width", WORLD.width * 2)
  .attr("height", WORLD.height * 2)
  .attr("mask", "url(#bb-clearing-mask)")
  .attr("fill", "var(--bb-clearing-fill)")
  .attr("opacity", 0)
  .attr("pointer-events", "none");
// Ordinary warm/cold focus: one broad, screen-stable radial penumbra under
// the active object (4.8, BB-R12) — never applied to the Black Bird core.
const warmPenumbraGradient = defs
  .append("radialGradient")
  .attr("id", "bb-warm-penumbra-gradient");
warmPenumbraGradient
  .append("stop")
  .attr("offset", "0%")
  .attr("stop-color", "#c9924a")
  .attr("stop-opacity", 0.22);
warmPenumbraGradient
  .append("stop")
  .attr("offset", "100%")
  .attr("stop-color", "#c9924a")
  .attr("stop-opacity", 0);
// Afterglow: soft departure residue (4.11) — a radial fade, not a ring.
const afterglowGradient = defs.append("radialGradient").attr("id", "bb-afterglow-gradient");
afterglowGradient
  .append("stop")
  .attr("offset", "0%")
  .attr("stop-color", "var(--bb-warm)")
  .attr("stop-opacity", 0.32);
afterglowGradient
  .append("stop")
  .attr("offset", "70%")
  .attr("stop-color", "var(--bb-warm)")
  .attr("stop-opacity", 0.1);
afterglowGradient
  .append("stop")
  .attr("offset", "100%")
  .attr("stop-color", "var(--bb-warm)")
  .attr("stop-opacity", 0);
const warmPenumbraLayer = root
  .append("g")
  .attr("class", "bb-warm-penumbra-layer")
  .attr("pointer-events", "none");
const warmPenumbraCircle = warmPenumbraLayer
  .append("circle")
  .attr("class", "bb-warm-penumbra")
  .attr("fill", "url(#bb-warm-penumbra-gradient)")
  .attr("opacity", 0);
const baseLayer = root.append("g");
const projectedLayer = root.append("g");
const wearLayer = root.append("g").attr("class", "bb-wear-layer").attr("pointer-events", "none");
const routeMemoryLayer = root.append("g").attr("class", "route-memory-layer");
const nodeLayer = root.append("g");
const afterglowLayer = root
  .append("g")
  .attr("class", "bb-afterglow-layer")
  .attr("pointer-events", "none");

const zoom = d3
  .zoom()
  .scaleExtent([0.55, 2.4])
  .on("zoom", (ev) => {
    S.transform = ev.transform;
    root.attr("transform", ev.transform);
    updateLabelVisibility();
    if (+warmPenumbraCircle.attr("opacity") > 0)
      warmPenumbraCircle.attr("r", 110 / Math.max(0.01, ev.transform.k));
  })
  // Placement is expensive (DOM measurement + O(n^2) collision checks) and
  // is recomputed only at zoom end, not every zoom tick (4.6).
  .on("end", () => recomputeLabelPlacements());
svg.call(zoom).on("dblclick.zoom", null);
svg.on("click", () => {
  if (S.activeId) returnToField();
});

// Focus layout moves nodes in real simulation coordinates (see the "focus"
// force below) — there is no separate render-only displacement layer.
function nodeX(d) {
  return d.x;
}
function nodeY(d) {
  return d.y;
}
function updateGraphGeometry() {
  function applyLine(sel) {
    sel.each(function (d) {
      const x1 = nodeX(d.source),
        y1 = nodeY(d.source),
        x2 = nodeX(d.target),
        y2 = nodeY(d.target);
      if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2))
        d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
    });
  }
  applyLine(baseSel);
  applyLine(projSel);
  applyLine(projHitSel);
  if (typeof wearSel !== "undefined") applyLine(wearSel);
  nodeSel.each(function (d) {
    const x = nodeX(d),
      y = nodeY(d);
    if (Number.isFinite(x) && Number.isFinite(y))
      d3.select(this).attr("transform", `translate(${x},${y})`);
  });
  routeMemoryLayer.selectAll("line.route-segment").each(function (d) {
    const x1 = d.source.x,
      y1 = d.source.y,
      x2 = d.target.x,
      y2 = d.target.y;
    if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2))
      d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
  });
  clearingMaskGroup.selectAll("circle.bb-clearing-kernel,circle.bb-clearing-subtract").each(function (d) {
    const x = nodeX(d),
      y = nodeY(d);
    if (Number.isFinite(x) && Number.isFinite(y)) d3.select(this).attr("cx", x).attr("cy", y);
  });
  afterglowLayer.selectAll("circle.bb-afterglow").each(function (d) {
    const x = nodeX(d.node),
      y = nodeY(d.node);
    if (Number.isFinite(x) && Number.isFinite(y)) d3.select(this).attr("cx", x).attr("cy", y);
  });
  if (+warmPenumbraCircle.attr("opacity") > 0 && S.activeId) {
    const core = byId[S.activeId];
    if (core && Number.isFinite(core.x) && Number.isFinite(core.y))
      warmPenumbraCircle.attr("cx", core.x).attr("cy", core.y);
  }
}
// ── Focus force: a constrained local opening in real simulation coordinates ─
// (4.2). Up to 14 focus-set nodes are pulled onto two rings around the
// active core via computeFocusTargets' deterministic, cost-free rotation
// search (src/layout/focus-targets.js) — the sole authority for focus-driven
// node displacement. There is no render-only offset layer: all rendered
// bodies, labels, clearing geometry, pointer targeting, and camera bounds
// read d.x/d.y directly.
function clearLocalAperture() {
  retargetPositions(computeFocusTargets(null, focusContext()));
}
function applyLocalAperture(focus) {
  const coreId = focus && focus.coreId;
  const core = coreId ? byId[coreId] : null;
  if (!core || !AUTHORED_HOMES[coreId]) {
    clearLocalAperture();
    return;
  }
  retargetPositions(computeFocusTargets(coreId, focusContext()));
}

// World coordinates only — never derived from viewport/pane size. Camera
// (zoom/pan) is the only thing that adapts to viewport; topology does not.
function clusterCenter(cluster) {
  return WORLD_CLUSTER_CENTERS[cluster] || [WORLD.cx, WORLD.cy];
}

const isAperture = isApertureNode;
function renderRole(d) {
  return isAperture(d) ? "APERTURE" : d.type;
}
const nodeMetrics = computeNodeMetrics;
function nodeR(d) {
  return nodeMetrics(d).outerR;
}
// ── Deterministic screen-space pointer resolution (4.3, fixes BB-R06) ──────
// The DOM element under the pointer is not authoritative when hit areas
// overlap in a dense cluster. Given a click point in the SVG's own pixel
// space (which is 1:1 with mapWrap CSS pixels via the viewBox), find the
// nearest VISIBLE node whose screen distance is inside the target radius.
// Ties: prefer the node whose visible body contains the pointer; then the
// active focus set; then canonical DATA order (simNodes iteration order).
function resolveNearestVisibleNode(screenPoint, opts = {}) {
  const t = S.transform;
  const focusIds = opts.focusIds || null;
  const point = { x: screenPoint[0], y: screenPoint[1] };
  const candidates = [];
  simNodes.forEach((d, i) => {
    if (!nodeVisible(d.id) || d.x == null || d.y == null) return;
    const sx = t.applyX(d.x),
      sy = t.applyY(d.y);
    const r = nodeMetrics(d).outerR * t.k;
    candidates.push({
      id: d.id,
      screenX: sx,
      screenY: sy,
      // Circumscribing square around the node's true circular/diamond body:
      // resolvePointerOwner's contract takes a rectangle (T-REQ-021), and the
      // radius-gated inRange filter below is what actually governs candidacy
      // -- this only affects containment-tier tie-breaking at the margins.
      bodyRect: { x: sx - r, y: sy - r, width: r * 2, height: r * 2 },
      canonicalIndex: i,
    });
  });
  const ownerId = resolvePointerOwner(point, candidates, {
    modality: opts.touch ? 'touch' : 'mouse',
    focusMemberIds: focusIds || new Set(),
  });
  return ownerId ? byId[ownerId] : null;
}
// ── Roving tabindex + directional keyboard navigation (4.15, BB-R17) ───────
function visibleNodesList() {
  return simNodes.filter((d) => nodeVisible(d.id) && d.x != null && d.y != null);
}
// One visible node has tabindex=0 (Tab enters the graph there); all others
// are -1. Falls back to Black Bird when neutral, or the first visible node.
function updateRovingTabindex(preferredId) {
  const visible = visibleNodesList();
  if (!visible.length) return;
  let targetId = preferredId && nodeVisible(preferredId) ? preferredId : null;
  if (!targetId)
    targetId = nodeVisible("FO.BLACK_BIRD_FIELD") ? "FO.BLACK_BIRD_FIELD" : visible[0].id;
  dispatch({ type: CommandType.SET_ROVING_FOCUS, id: targetId });
  nodeSel.attr("tabindex", (d) => (d.id === targetId ? 0 : -1));
}
function focusNodeElement(id) {
  const el = nodeLayer.select(`g.node[data-bb-id="${CSS.escape(id)}"]`).node();
  if (el && el.focus) el.focus();
}
// Nearest visible node in the requested screen direction from `fromId`,
// preferring graph neighbors when candidates are otherwise similar.
function nearestNodeInDirection(fromId, dx, dy) {
  const from = byId[fromId];
  if (!from || from.x == null) return null;
  let best = null,
    bestScore = Infinity;
  visibleNodesList().forEach((d) => {
    if (d.id === fromId) return;
    const vx = d.x - from.x,
      vy = d.y - from.y;
    const dist = Math.hypot(vx, vy);
    if (dist < 1e-6) return;
    const dot = (vx / dist) * dx + (vy / dist) * dy;
    if (dot <= 0.15) return; // must lie roughly in the requested direction
    const neighborBonus = adj[fromId] && adj[fromId].has(d.id) ? -20 : 0;
    const score = dist * (1.4 - dot) + neighborBonus;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  });
  return best;
}
function nodeShape(g, d) {
  const m = nodeMetrics(d);
  g.append("circle")
    .attr("class", "node-route-halo")
    .attr("r", m.haloR)
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 1);
  g.append("circle")
    .attr("class", "node-focus-ring")
    .attr("r", m.focusR)
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 1.5)
    .attr("vector-effect", "non-scaling-stroke");
  if (isAperture(d)) {
    g.append("circle")
      .attr("class", "bb-aperture-rim")
      .attr("r", m.outerR)
      .attr("fill", "none")
      .attr("stroke", "var(--bb-aperture-rim)")
      .attr("stroke-width", 1.4)
      .attr("stroke-opacity", 0.9)
      .attr("vector-effect", "non-scaling-stroke");
    g.append("circle").attr("class", "bb-aperture-core").attr("r", m.coreR);
  } else if (d.type === "RNO") {
    g.append("circle")
      .attr("class", "bb-rno-ring")
      .attr("r", m.outerR)
      .attr("fill", "none")
      .attr("stroke", "var(--bb-rno-ring)")
      .attr("stroke-width", 1.2)
      .attr("vector-effect", "non-scaling-stroke");
    g.append("circle")
      .attr("class", "bb-body")
      .attr("r", m.coreR)
      .attr("fill", "var(--bb-node-fill)");
  } else if (d.type === "MNO") {
    g.append("path")
      .attr("class", "bb-body")
      .attr("d", irregularCirclePath(d.id, m.coreR, 14))
      .attr("fill", "var(--bb-node-fill)");
  } else if (d.type === "NameO") {
    // textual body only: no visible geometric core, hit target still present via .node-hit below
  } else if (d.type === "RefO") {
    const side = m.coreR * 2; // 9x9 diamond (4.7): coreR=4.5, side=9
    g.append("rect")
      .attr("class", "bb-body")
      .attr("width", side)
      .attr("height", side)
      .attr("x", -side / 2)
      .attr("y", -side / 2)
      .attr("transform", "rotate(45)")
      .attr("fill", "var(--bb-refo-fill)");
  } else if (d.type === "RelO") {
    g.append("circle")
      .attr("class", "bb-body")
      .attr("r", m.coreR)
      .attr("fill", "none")
      .attr("stroke", "var(--bb-relo-stroke)")
      .attr("stroke-width", 1.3)
      .attr("vector-effect", "non-scaling-stroke");
  } else {
    g.append("circle")
      .attr("class", "bb-body")
      .attr("r", m.coreR)
      .attr("fill", "var(--bb-node-fill)");
  }
  g.append("circle").attr("class", "node-hit").attr("r", m.hitR);
  g.attr("data-bb-id", d.id)
    .attr("data-bb-type", d.type)
    .attr("data-bb-morphology", morphologyOf(d))
    .attr("data-bb-light", "field")
    .attr("data-bb-afterglow", "0");
}

const simNodes = nodes;
const baseLinks = baseEdgesRaw.map((e) => ({ ...e }));
const projectedLinks = projectedRaw.map((e) => ({ ...e }));

// ── Authored world positions: the sole geometry authority (F04) ────────────
// No runtime physics simulation, no public node dragging (removed: the
// former d3.forceSimulation with link/charge/collide/cluster/center/focus
// forces, and the d3.drag() call on nodeSel). Every node starts at its fixed
// authored home from src/layout/authored-world.js; a focus change retargets
// the affected subset via computeFocusTargets' deterministic ring geometry
// (src/layout/focus-targets.js). Motion between positions is a plain
// interpolated tween driven by d3.timer (an animation scheduler, not a
// physics integrator), instant under prefers-reduced-motion.
simNodes.forEach((d) => {
  const home = AUTHORED_HOMES[d.id];
  d.homeX = home ? home.x : WORLD.cx;
  d.homeY = home ? home.y : WORLD.cy;
  d.x = d.homeX;
  d.y = d.homeY;
});

let positionTimer = null;
let positioningActive = false;

// Everything computeFocusTargets needs to know about the graph shape; the
// module itself owns only ring geometry, not what "canonical participant"
// or "structural neighbor" means (see its own header comment).
function focusContext() {
  return {
    homeFor: (id) => AUTHORED_HOMES[id] || null,
    allIds: nodes.map((n) => n.id),
    nodeType: (id) => byId[id]?.type,
    canonicalIndexOf: (id) => nodeCanonicalIndex.get(id) ?? 0,
    canonicalParticipantsOf: (id) => DATA.relations[id] || [],
    baseEdgeNeighborsOf: (id) => [...(baseAdj[id] || [])],
    containingRelOsOf: (id) => containingRelOsIndex.get(id) || [],
    projectedNeighborsOf: (id) => [...(projectedAdj.get(id) || [])],
  };
}

// Retargets every node toward targetMap's positions with one deterministic
// tween (or instantly under reduced motion / duration:0), calling
// updateGraphGeometry() each frame so the DOM stays in sync.
function retargetPositions(targetMap, opts = {}) {
  if (positionTimer) positionTimer.stop();
  const duration = prefersReducedMotion() ? 0 : (opts.duration ?? 420);
  if (duration === 0) {
    simNodes.forEach((d) => {
      const t = targetMap.get(d.id);
      if (t) {
        d.x = t.x;
        d.y = t.y;
      }
    });
    positioningActive = false;
    updateGraphGeometry();
    return;
  }
  const startPositions = new Map(simNodes.map((d) => [d.id, { x: d.x, y: d.y }]));
  const ease = d3.easeCubicInOut;
  positioningActive = true;
  positionTimer = d3.timer((elapsed) => {
    const t = Math.min(1, elapsed / duration);
    const e = ease(t);
    simNodes.forEach((d) => {
      const target = targetMap.get(d.id);
      const start = startPositions.get(d.id);
      if (!target || !start) return;
      d.x = start.x + (target.x - start.x) * e;
      d.y = start.y + (target.y - start.y) * e;
    });
    updateGraphGeometry();
    if (t >= 1) {
      positioningActive = false;
      positionTimer.stop();
    }
  });
}

let baseSel = baseLayer
  .selectAll("line")
  .data(baseLinks)
  .join("line")
  .attr("class", "link-base")
  .attr("stroke", "#5d503c")
  .attr("stroke-opacity", 0.18)
  .attr("stroke-width", 0.65);
let projSel = projectedLayer
  .selectAll("line")
  .data(projectedLinks)
  .join("line")
  .attr("class", "link-proj")
  .attr("stroke", "#b79045")
  .attr("stroke-opacity", 0.14)
  .attr("stroke-width", (d) => Math.min(3, 0.55 + d.weight * 0.32));
let projHitSel = projectedLayer
  .selectAll("line.hit")
  .data(projectedLinks)
  .join("line")
  .attr("class", "hit")
  .attr("stroke", "transparent")
  .attr("stroke-width", 16)
  .attr("pointer-events", "stroke");
let wearSel = wearLayer
  .selectAll("line")
  .data(baseLinks)
  .join("line")
  .attr("class", "bb-wear")
  .attr("stroke-linecap", "round")
  .attr("pointer-events", "none")
  .attr("stroke-opacity", 0);
let nodeSel = nodeLayer
  .selectAll("g.node")
  .data(simNodes)
  .join("g")
  .attr("class", (d) => "node " + d.type);
// No d3.drag() here (F04): canonical node positions are fixed authored data,
// not publicly draggable state.
nodeSel.each(function (d) {
  nodeShape(d3.select(this), d);
});
function graphLabelFor(d) {
  if (d.type === "NameO") {
    const m = (d.label || "").match(/[؀-ۿ][؀-ۿ\s]*/);
    if (m) return m[0].trim();
  }
  return d.shortLabel || d.label;
}
function isArabicScript(s) {
  return /[؀-ۿ]/.test(s || "");
}
nodeSel
  .append("text")
  .attr(
    "class",
    (d) =>
      "node-label" + (d.type === "NameO" && isArabicScript(graphLabelFor(d)) ? " bb-arabic" : ""),
  )
  .attr("text-anchor", "middle")
  .attr("y", (d) => nodeMetrics(d).labelOffset)
  .attr("lang", (d) => (d.type === "NameO" && isArabicScript(graphLabelFor(d)) ? "ar" : null))
  .attr("dir", (d) => (d.type === "NameO" && isArabicScript(graphLabelFor(d)) ? "rtl" : null))
  .text((d) => graphLabelFor(d));
nodeSel
  .append("title")
  .text((d) =>
    d.type === "NameO" && d.shortLabel !== d.label ? `${d.shortLabel} — ${d.label}` : d.label,
  );

// Node events
nodeSel
  .attr("tabindex", -1) // roving tabindex: updateRovingTabindex() sets the one 0 (4.15)
  .attr("role", "button")
  .attr("aria-label", (d) => `${d.type}: ${d.label}`)
  .on("mouseenter", (ev, d) => {
    if (isMobile()) return;
    clearTimeout(S.previewTimer);
    S.previewTimer = setTimeout(() => touchObject(d.id, { source: "graph-hover" }), 200);
  })
  .on("mouseleave", () => {
    if (isMobile()) return;
    clearTimeout(S.previewTimer);
    clearTouch();
  })
  .on("click", (ev, d) => {
    ev.stopPropagation();
    // A hover-preview timer armed by mouseenter (200ms) can still be pending
    // when the click lands (P-SCN-020) — without this it fires after commit
    // and shows a stale hover preview for the object just committed.
    clearTimeout(S.previewTimer);
    hidePreview();
    // The datum bound to the DOM element under the pointer is not
    // authoritative when hit areas overlap (BB-R06) — resolve the true
    // nearest visible node in screen space and commit that instead.
    const focus = S.activeId ? buildFocusSet(S.activeId) : null;
    const resolved =
      resolveNearestVisibleNode(d3.pointer(ev, svg.node()), {
        touch: isMobile(),
        focusIds: focus ? new Set(focus.ids) : null,
      }) || d;
    if (S.onboardingActive) {
      S.onboardingActive = false;
      hideFieldPrompt();
      return focusObject(resolved.id, { source: "onboarding-interrupt" });
    }
    if (isMobile()) return selectInField(resolved.id, { source: "graph-mobile" });
    focusObject(resolved.id, { source: "graph" });
  })
  .on("keydown", (ev, d) => {
    // Keyboard activation always selects the keyboard-focused node directly
    // (4.3) — pointer resolution does not apply here.
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      focusObject(d.id, { source: "keyboard" });
      return;
    }
    if (ev.key === "Escape") {
      clearTouch();
      closeSheet();
      document.querySelector('[data-action="field"]')?.focus();
      return;
    }
    const dirMap = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const dir = dirMap[ev.key];
    if (!dir) return;
    ev.preventDefault();
    const next = nearestNodeInDirection(d.id, dir[0], dir[1]);
    if (next) {
      updateRovingTabindex(next.id);
      focusNodeElement(next.id);
    }
  });
updateRovingTabindex(null);

// Edge events
projSel
  .on("mouseenter", (ev, d) => {
    if (isMobile()) return;
    showEdgePreview(d, ev);
  })
  .on("mouseleave", hidePreview);
projHitSel
  .on("mouseenter", (ev, d) => {
    if (isMobile()) return;
    showEdgePreview(d, ev);
  })
  .on("mouseleave", hidePreview)
  .on("click", (ev, d) => {
    ev.stopPropagation();
    openProjectedEdge(d);
  });

// Initial render: authored positions are already assigned above, so a
// single geometry pass (not a settling simulation) draws the starting Field.
updateGraphGeometry();

// ── Label candidate placement (4.6): collision-rejection pass ──────────────
// Deliberately not run on every zoom tick — only at the trigger points spec
// §4.6 lists (font load, sim settle, focus change, zoom end, resize, View
// change, Solo change, Field restoration). Tries 4 candidate positions
// (below/above/right/left) around each visible label's anchor, in priority
// order, rejecting any that would collide with an already-accepted label or
// cross the safe rectangle; keeps the previous accepted position first when
// still valid, to avoid jitter. Falls back to "below" (with the resulting
// overlap left visible) when no collision-free candidate exists — priority
// order means the label that loses that contest is always the lower-tier one.
const LABEL_CANDIDATES = [
  { key: "below", dx: 0, dyFactor: 1, anchor: "middle" },
  { key: "above", dx: 0, dyFactor: -1, anchor: "middle" },
  { key: "right", dx: 1, dyFactor: 0.15, anchor: "start" },
  { key: "left", dx: -1, dyFactor: 0.15, anchor: "end" },
  { key: "lower-right", dx: 0.7, dyFactor: 0.8, anchor: "start" },
  { key: "lower-left", dx: -0.7, dyFactor: 0.8, anchor: "end" },
  { key: "upper-right", dx: 0.7, dyFactor: -0.7, anchor: "start" },
  { key: "upper-left", dx: -0.7, dyFactor: -0.7, anchor: "end" },
];
const labelPlacementChoice = new Map(); // id -> last-accepted candidate key
function rectsOverlap(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}
// Eight-candidate cost-scored placement (F04): every valid candidate is
// scored (src/layout/label-solver.js), not just the first collision-free
// one, and a non-required label the solver cannot place without overlap is
// suppressed rather than drawn on top of something else.
function recomputeLabelPlacements() {
  const t = S.transform;
  const safeRaw = computeFieldSafeRect();
  const safeRect = { x: safeRaw.left, y: safeRaw.top, width: safeRaw.width, height: safeRaw.height };
  const visible = nodeSel
    .selectAll("text.node-label")
    .nodes()
    .filter((el) => getComputedStyle(el).getPropertyValue("display") !== "none")
    .map((el) => ({ el, d: d3.select(el).datum() }))
    .filter(({ d }) => d && d.x != null && d.y != null);
  const focus = S.activeId ? buildFocusSet(S.activeId) : null;
  const focusIds = focus ? new Set(focus.ids) : null;
  const core = focus && focus.coreId ? byId[focus.coreId] : null;
  const relParticipants =
    core && core.type === "RelO" ? new Set(DATA.relations[focus.coreId] || []) : null;

  const entries = [];
  for (const { el, d } of visible) {
    let bbox;
    try {
      bbox = el.getBBox();
    } catch (e) {
      continue;
    }
    const isActive = d.id === S.activeId;
    const isFocusMember = !!(focusIds && focusIds.has(d.id));
    const isRelParticipant = !!(relParticipants && relParticipants.has(d.id));
    const tier = labelPriorityTier(d, isActive, isFocusMember, isRelParticipant);
    entries.push({ el, d, bbox, isActive, tier, isRequired: tier <= 2 });
  }
  entries.sort((a, b) => a.tier - b.tier);

  const w = (e) => Math.max(1, e.bbox.width);
  const h = (e) => Math.max(1, e.bbox.height);
  const candidatesById = new Map(
    entries.map((e) => {
      const gap = (nodeMetrics(e.d).outerR || 6) + 3;
      const ew = w(e),
        eh = h(e);
      const cands = LABEL_CANDIDATES.map((cand) => {
        const ox = cand.dx * (gap + ew / 2);
        const oy = cand.dyFactor * (gap + eh * 0.5) + eh * 0.35;
        const cx = e.d.x + ox,
          cy = e.d.y + oy;
        let rx1, rx2;
        if (cand.anchor === "middle") {
          rx1 = cx - ew / 2;
          rx2 = cx + ew / 2;
        } else if (cand.anchor === "start") {
          rx1 = cx;
          rx2 = cx + ew;
        } else {
          rx1 = cx - ew;
          rx2 = cx;
        }
        const ry1 = cy - eh * 0.8,
          ry2 = cy + eh * 0.3;
        const sx1 = t.applyX(rx1),
          sx2 = t.applyX(rx2),
          sy1 = t.applyY(ry1),
          sy2 = t.applyY(ry2);
        const x = Math.min(sx1, sx2),
          y = Math.min(sy1, sy2);
        return {
          side: cand.key,
          anchor: cand.anchor,
          ox,
          oy,
          rect: { x, y, width: Math.abs(sx2 - sx1), height: Math.abs(sy2 - sy1) },
        };
      });
      return [e.d.id, cands];
    }),
  );

  const items = entries.map((e) => ({ id: e.d.id, isRequired: e.isRequired, isActive: e.isActive }));
  const results = solveLabels(
    items,
    (item) => candidatesById.get(item.id).map((c) => ({ side: c.side, rect: c.rect })),
    { safeRect, previousSide: undefined },
  );

  const entryById = new Map(entries.map((e) => [e.d.id, e]));
  for (const r of results) {
    const entry = entryById.get(r.id);
    if (!entry) continue;
    if (r.suppressed) {
      d3.select(entry.el).attr("display", "none");
      labelPlacementChoice.delete(r.id);
      continue;
    }
    const cand = candidatesById.get(r.id).find((c) => c.side === r.side);
    d3.select(entry.el)
      .attr("display", null)
      .attr("text-anchor", cand.anchor)
      .attr("x", cand.ox)
      .attr("y", cand.oy);
    labelPlacementChoice.set(r.id, r.side);
  }
}

// ── Resize ─────────────────────────────────────────────────────────────────
// Viewport changes reproject the camera only; authored topology (d.x/d.y)
// never changes here (F04) — there is no longer a simulation to (re)start.
function resize() {
  S.viewport = isMobile() ? "mobile" : "desktop";
  dispatch({ type: CommandType.RECONCILE_ENVIRONMENT, profile: S.viewport });
  updatePhaseClass();
  // P-SCN-122: a transient hover preview is positioned from the pointer
  // coordinates at hover time (placePreviewNearPoint) and never
  // recalculated — after a resize those coordinates (and often the
  // hovered node's own screen position) are stale, so dismiss it rather
  // than leave a mispositioned tooltip standing.
  clearTimeout(S.previewTimer);
  clearTouch();
  if (isMobile() && S.surface === "read") {
    renderRoute();
    return;
  }
  measureGraph();
  if (S.activeId) {
    applyLocalAperture(buildFocusSet(S.activeId));
    fitFocusFrame(buildFocusSet(S.activeId), { duration: 0 });
  } else fitVisibleField({ duration: 0 });
  recomputeLabelPlacements();
}
window.addEventListener("resize", () => {
  resize();
  renderRoute();
});
document.addEventListener("visibilitychange", () => {
  dispatch({ type: CommandType.RECONCILE_DOCUMENT_VISIBILITY, visibility: document.visibilityState });
});
resize();

// ── Visibility ─────────────────────────────────────────────────────────────
function getEdgeSourceId(e) {
  return e.source.id || e.source;
}
function getEdgeTargetId(e) {
  return e.target.id || e.target;
}
function nodeVisible(id) {
  const n = byId[id];
  if (!n) return false;
  if (S.soloSet) return S.soloSet.has(id);
  if (S.objectVisibility[id] === false) return false;
  return !!S.objectGroups[n.type];
}
function edgeVisible(e) {
  return nodeVisible(getEdgeSourceId(e)) && nodeVisible(getEdgeTargetId(e));
}
function projectedVisible(e) {
  if (!S.viewOptions.projected) return false;
  const a = byId[getEdgeSourceId(e)],
    b = byId[getEdgeTargetId(e)];
  if (!a || !b) return false;
  if ((a.type === "NameO" || b.type === "NameO") && !S.viewOptions.sourceNames) return false;
  return nodeVisible(a.id) && nodeVisible(b.id);
}
// ── Label engine: screen-stable sizing + semantic density tiers (4.6) ──────
// Desired sizes are SCREEN pixels; graph-space size = desired / k, with no
// graph-unit minimum — screen size never grows with zoom.
function labelDesiredScreenPx(isActive, isFocusMember, isStructuralAnchor) {
  if (isActive) return 11.5;
  if (isFocusMember) return 10.5;
  if (isStructuralAnchor) return 10;
  return 9.5;
}
function labelPriorityTier(d, isActive, isFocusMember, isRelParticipant) {
  if (isActive) return 1;
  if (isRelParticipant || isFocusMember) return 2;
  if (d.id === "FO.BLACK_BIRD_FIELD") return 3;
  if (d.type === "RNO" || d.type === "MNO") return 4;
  if (d.type === "NameO" && isFocusMember) return 5;
  if (d.type === "FO") return 6;
  if (d.type === "NameO") return 7;
  return 8; // RefO, RelO
}
function labelBudget(k, hasFocus) {
  const mobile = isMobile();
  let n = mobile ? (hasFocus ? 14 : 12) : hasFocus ? 18 : 22;
  if (k >= 1.9) return Infinity;
  if (k >= 1.4) n += 8;
  return n;
}
function updateLabelVisibility(context = {}) {
  const k = S.transform.k;
  const focus = context.focus || (S.activeId ? buildFocusSet(S.activeId) : null);
  const focusIds = focus ? new Set(focus.ids) : null;
  const core = focus && focus.coreId ? byId[focus.coreId] : null;
  const relParticipants =
    core && core.type === "RelO" ? new Set(DATA.relations[focus.coreId] || []) : null;
  const ranked = simNodes
    .filter((d) => {
      if (!S.viewOptions.labels) return false;
      if (!nodeVisible(d.id)) return false;
      if (d.type === "NameO" && !S.viewOptions.sourceNames) return false;
      // Inactive RelO/RefO identity stays opaque/hidden below k=1.6 (4.6).
      if ((d.type === "RefO" || d.type === "RelO") && d.id !== S.activeId) {
        if (isMobile() || k < 1.6) return false;
      }
      return true;
    })
    .map((d) => {
      const isActive = d.id === S.activeId;
      const isFocusMember = !!(focusIds && focusIds.has(d.id));
      const isRelParticipant = !!(relParticipants && relParticipants.has(d.id));
      const isStructuralAnchor = d.type === "RNO" || d.type === "MNO" || d.id === "FO.BLACK_BIRD_FIELD";
      return {
        d,
        isActive,
        isFocusMember,
        desired: labelDesiredScreenPx(isActive, isFocusMember, isStructuralAnchor),
        tier: labelPriorityTier(d, isActive, isFocusMember, isRelParticipant),
      };
    })
    .sort((a, b) => a.tier - b.tier);
  const budget = labelBudget(k, !!S.activeId);
  const desiredById = new Map();
  const visibleIds = new Set();
  ranked.forEach((item, i) => {
    desiredById.set(item.d.id, item.desired);
    if (i < budget) visibleIds.add(item.d.id);
  });
  const kSafe = Math.max(0.01, k);
  nodeSel
    .selectAll("text.node-label")
    .attr("font-size", (d) => `${(desiredById.get(d.id) ?? 9.5) / kSafe}px`)
    .style("stroke-width", `${2 / kSafe}px`)
    .attr("display", (d) => (visibleIds.has(d.id) ? null : "none"))
    .classed("quiet", (d) => d.type === "NameO" || d.type === "RefO");
}
function updateVisibility() {
  nodeSel.attr("display", (d) => (nodeVisible(d.id) ? null : "none"));
  baseSel.attr("display", (d) => (edgeVisible(d) ? null : "none"));
  projSel.attr("display", (d) => (projectedVisible(d) ? null : "none"));
  projHitSel.attr("display", (d) => (projectedVisible(d) ? null : "none"));
  if (!S.activeId) transitionToFieldLighting({ duration: 0 });
  else presentFocus(S.activeId, buildFocusSet(S.activeId), { lightDuration: 0 });
  updateLabelVisibility();
  recomputeLabelPlacements();
  updateWearOverlay();
  drawRouteMemory({ duration: 0 });
  updateRovingTabindex(S.activeId);
}

// ── Camera ─────────────────────────────────────────────────────────────────
function setCamera(t) {
  svg.interrupt();
  zoom.transform(svg, t);
  S.cameraInFlight = false;
}
async function beginGraphHandoff(opts = {}) {
  const e = svg.node();
  const fade = opts.fade === true && !prefersReducedMotion();
  svg.interrupt();
  if (!fade) {
    e.style.transition = "none";
    e.style.opacity = "0";
    await nextFrame();
    return;
  }
  e.style.transition = `opacity ${opts.duration ?? 180}ms ease`;
  e.style.opacity = "0";
  await sleep((opts.duration ?? 180) + 40);
  e.style.transition = "none";
}
async function endGraphHandoff(opts = {}) {
  const e = svg.node();
  const fade = opts.fade === true && !prefersReducedMotion();
  if (!fade) {
    if (prefersReducedMotion()) {
      e.style.opacity = "";
      e.style.transition = "";
    } else {
      e.style.transition = "opacity 240ms ease";
      requestAnimationFrame(() => {
        e.style.opacity = "";
        setTimeout(() => {
          e.style.transition = "";
        }, 260);
      });
    }
    await nextFrame();
    return;
  }
  e.style.opacity = "0";
  e.style.transition = `opacity ${opts.duration ?? 260}ms ease`;
  await nextFrame();
  e.style.opacity = "";
  await sleep((opts.duration ?? 260) + 40);
  e.style.transition = "";
}
function animateCamera(transform, opts = {}) {
  const dur = prefersReducedMotion() ? 0 : (opts.duration ?? 760);
  S.cameraInFlight = true;
  svg
    .transition()
    .duration(dur)
    .ease(d3.easeCubicInOut)
    .call(zoom.transform, transform)
    .on("end", () => {
      S.cameraInFlight = false;
    });
}
function getNodeBounds(items, padNode = 34) {
  const minX = d3.min(items, (d) => nodeX(d) - padNode),
    maxX = d3.max(items, (d) => nodeX(d) + padNode);
  const minY = d3.min(items, (d) => nodeY(d) - padNode),
    maxY = d3.max(items, (d) => nodeY(d) + padNode);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}
// ── Safe rectangle & camera (4.4) ───────────────────────────────────────────
// Pane-relative geometry only — always mapWrap.clientWidth/clientHeight,
// never window.innerWidth/innerHeight. The actual fit/pan/refit decisions
// are src/layout/camera.js's pure functions (F04); this file only supplies
// pane-relative inputs and applies the returned transform via d3.zoom.
function computeFieldSafeRect() {
  const mobile = isMobile();
  const marginX = mobile ? 16 : 24;
  const marginBottom = mobile ? 16 : 24;
  let titleBottom = 0;
  const titleEl = mapWrap.querySelector(".map-title");
  if (titleEl) {
    const wrapRect = mapWrap.getBoundingClientRect();
    titleBottom = titleEl.getBoundingClientRect().bottom - wrapRect.top;
  }
  const top = mobile ? Math.max(62, titleBottom + 12) : Math.max(72, titleBottom + 16);
  const safe = computeSafeRect(
    { x: 0, y: 0, width, height },
    { top, right: marginX, bottom: marginBottom, left: marginX },
  );
  // Callers expect the pre-existing {left, top, right, bottom, width, height}
  // shape (including Playwright specs reading it directly via page.evaluate).
  return {
    left: safe.x,
    top: safe.y,
    right: safe.x + safe.width,
    bottom: safe.y + safe.height,
    width: safe.width,
    height: safe.height,
  };
}
function computeNodeEnvelope(ids, padNode) {
  const items = ids
    .map((id) => byId[id])
    .filter((d) => d && d.x != null && d.y != null && nodeVisible(d.id));
  if (!items.length) return null;
  return getNodeBounds(items, padNode ?? (isMobile() ? 30 : 40));
}
// The active-Reader vertical lift is a presentation nuance camera.js's pure
// occupancy math doesn't know about; applied here by shifting the safe
// rect's effective center before handing it to the pure fit functions.
function liftedSafeRect(safe, lift) {
  if (!lift) return { x: safe.left, y: safe.top, width: safe.width, height: safe.height };
  return { x: safe.left, y: safe.top - lift * safe.height, width: safe.width, height: safe.height };
}
function toZoomTransform(t) {
  return d3.zoomIdentity.translate(t.x, t.y).scale(t.k);
}
function envelopeToRect(envelope) {
  return { x: envelope.minX, y: envelope.minY, width: envelope.width, height: envelope.height };
}
// Camera and focus-force motion must not compete: wait for the local
// aperture to have mostly settled (or a short safety timeout) before the
// pane starts panning/zooming.
async function waitFocusForceSettled(timeoutMs = 480) {
  if (prefersReducedMotion()) return;
  await nextFrame();
  const start = performance.now();
  while (positioningActive && performance.now() - start < timeoutMs) {
    await nextFrame();
  }
}
function fitFocusFrame(focus, opts = {}) {
  const envelope = computeNodeEnvelope(focus.ids, isMobile() ? 30 : 44);
  if (!envelope || width < 10 || height < 10) return;
  const safe = liftedSafeRect(computeFieldSafeRect(), 0.04 * (S.readerOpen && !isMobile() ? 1 : 0));
  const envRect = envelopeToRect(envelope);
  const isFirstFocus = !!opts.fromNeutral;
  const current = isFirstFocus ? null : toZoomTransform(S.transform || d3.zoomIdentity);
  const transform = computeFocusCamera(envRect, safe, current, { occupancy: 0.7, isFirstFocus });
  if (isFirstFocus) {
    animateCamera(toZoomTransform(transform), { duration: opts.duration ?? 760 });
    return;
  }
  const changed = Math.abs(transform.x - current.x) > 0.5 || Math.abs(transform.y - current.y) > 0.5 || Math.abs(transform.k - current.k) > 1e-6;
  if (!changed) return;
  const wasRefit = Math.abs(transform.k - current.k) > 1e-6;
  animateCamera(toZoomTransform(transform), { duration: wasRefit ? (opts.duration ?? 760) : Math.min(opts.duration ?? 420, 420) });
}
function fitWholeField(opts = {}) {
  const visible = simNodes.filter((d) => nodeVisible(d.id));
  if (!visible.length || width < 10 || height < 10) return;
  const safe = liftedSafeRect(computeFieldSafeRect(), 0.04 * (S.readerOpen && !isMobile() ? 1 : 0));
  const envelope = getNodeBounds(visible, isMobile() ? 30 : 40);
  const transform = computeNeutralCamera(envelopeToRect(envelope), safe, { occupancy: 0.8 });
  animateCamera(toZoomTransform(transform), { duration: opts.duration ?? 850 });
}
function fitVisibleField(opts = {}) {
  return fitWholeField(opts);
}
function fitGraph(dur) {
  return fitWholeField({ duration: dur });
}

// ── Field lighting (warm/cold, RelO clearing) ───────────────────────────────
// The ordinary amber "this is selected" ring is gone (4.8) — the active
// node is conveyed by full opacity + the warm penumbra. .node-focus-ring
// is now exclusively a CSS :focus-visible outline for keyboard users (see
// index.html), not something this JS module touches.
function clearingMemberIdsFor(relOId) {
  return (DATA.relations[relOId] || []).filter(nodeVisible);
}
function updateBodyBlur(mode) {
  const enable = !isMobile() && !prefersReducedMotion() && mode !== "field";
  appliedBlurPx = enable ? 0.6 : 0;
  nodeSel.selectAll(".bb-body,.bb-rno-ring").classed("bb-cold-rest", function () {
    if (!enable) return false;
    const parent = this.parentNode;
    return parent && parent.getAttribute("data-bb-light") === "cold-rest";
  });
}
function setNodeLightAttrs(focus, mode) {
  const memberIds =
    mode === "clearing"
      ? new Set([focus.coreId, ...clearingMemberIdsFor(focus.coreId)])
      : new Set(focus.ids);
  nodeSel.each(function (d) {
    let light = "field";
    if (nodeVisible(d.id)) {
      if (mode === "clearing") light = memberIds.has(d.id) ? "clearing-member" : "cold-rest";
      else if (mode === "warm")
        light =
          d.id === focus.coreId ? "warm-core" : memberIds.has(d.id) ? "warm-related" : "cold-rest";
    }
    d3.select(this).attr("data-bb-light", light);
  });
}
function applyWarmColdStyling(focus, dur) {
  currentPenumbraVisible = true;
  const focusIds = new Set(focus.ids),
    neighborIds = new Set(focus.neighborIds);
  nodeSel
    .transition()
    .duration(dur)
    .attr("opacity", (d) => {
      if (!nodeVisible(d.id)) return 0;
      if (d.id === focus.coreId) return 1;
      if (neighborIds.has(d.id)) return 0.78; // related: 0.72-0.82 (4.8)
      return 0.38; // cold-context: 0.32-0.46 (4.8) — present, not near-absent
    });
  baseSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", (d) => {
      if (!edgeVisible(d)) return 0;
      const s = getEdgeSourceId(d),
        t = getEdgeTargetId(d);
      if (s === focus.coreId || t === focus.coreId || (focusIds.has(s) && focusIds.has(t)))
        return 0.24; // inside focus: 0.18-0.30 (4.8)
      return 0.07; // remaining: 0.05-0.09 (4.8)
    });
  projSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", (d) => {
      if (!projectedVisible(d)) return 0;
      const s = getEdgeSourceId(d),
        t = getEdgeTargetId(d);
      if (s === focus.coreId || t === focus.coreId || (focusIds.has(s) && focusIds.has(t)))
        return 0.16; // inside focus: 0.12-0.20 (4.8)
      return 0.035; // remaining: 0.02-0.05 (4.8)
    });
  projHitSel.attr("display", (d) => (projectedVisible(d) ? null : "none"));
  setNodeLightAttrs(focus, "warm");
  updateBodyBlur("warm");
  updateWarmPenumbra(focus.coreId, dur);
}
// Screen-stable ~110 CSS px warm penumbra under the active object. Never
// shown for the Black Bird aperture core (4.8) or outside warm-cold mode.
function updateWarmPenumbra(coreId, dur = 420) {
  const core = coreId && coreId !== "FO.BLACK_BIRD_FIELD" ? byId[coreId] : null;
  const visible = !!(core && core.x != null && core.y != null);
  warmPenumbraCircle
    .attr("r", 110 / Math.max(0.01, S.transform.k))
    .attr("cx", visible ? core.x : 0)
    .attr("cy", visible ? core.y : 0)
    .transition()
    .duration(prefersReducedMotion() ? 0 : dur)
    .attr("opacity", visible ? 1 : 0);
}
function applyClearingStyling(focus, dur) {
  currentPenumbraVisible = false;
  updateWarmPenumbra(null, dur);
  const memberIds = new Set([focus.coreId, ...clearingMemberIdsFor(focus.coreId)]);
  nodeSel
    .transition()
    .duration(dur)
    .attr("opacity", (d) => {
      if (!nodeVisible(d.id)) return 0;
      if (memberIds.has(d.id)) return 1;
      return 0.16;
    });
  baseSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", (d) => {
      if (!edgeVisible(d)) return 0;
      const s = getEdgeSourceId(d),
        t = getEdgeTargetId(d);
      return memberIds.has(s) && memberIds.has(t) ? 0.22 : 0.035;
    });
  projSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", (d) => {
      if (!projectedVisible(d)) return 0;
      const s = getEdgeSourceId(d),
        t = getEdgeTargetId(d);
      return memberIds.has(s) && memberIds.has(t) ? 0.16 : 0.02;
    });
  projHitSel.attr("display", (d) => (projectedVisible(d) ? null : "none"));
  setNodeLightAttrs(focus, "clearing");
  updateBodyBlur("clearing");
}
function renderClearing(relOId) {
  const relNode = byId[relOId];
  if (!relNode) return;
  const memberIds = clearingMemberIdsFor(relOId);
  const kernelIds = [relOId, ...memberIds].filter((id) => byId[id]);
  const kernelPool = kernelIds.map((id) => byId[id]).filter((d) => d.x != null && d.y != null);
  const kernelR = isMobile() ? 34 : 42;
  const kernels = clearingMaskGroup
    .selectAll("circle.bb-clearing-kernel")
    .data(kernelPool, (d) => d.id);
  kernels.exit().remove();
  kernels
    .enter()
    .append("circle")
    .attr("class", "bb-clearing-kernel")
    .attr("fill", "#fff")
    .merge(kernels)
    .attr("r", kernelR)
    .attr("cx", (d) => nodeX(d))
    .attr("cy", (d) => nodeY(d));
  // Subtract the aperture core from the mask whenever it falls inside the
  // clearing without itself being a canonical participant of this relation.
  const bb = byId["FO.BLACK_BIRD_FIELD"];
  const subtractData = bb && !kernelIds.includes(bb.id) && bb.x != null ? [bb] : [];
  const subtract = clearingMaskGroup
    .selectAll("circle.bb-clearing-subtract")
    .data(subtractData, (d) => d.id);
  subtract.exit().remove();
  subtract
    .enter()
    .append("circle")
    .attr("class", "bb-clearing-subtract")
    .attr("fill", "#000")
    .merge(subtract)
    .attr("r", nodeMetrics(bb).outerR + 6)
    .attr("cx", (d) => nodeX(d))
    .attr("cy", (d) => nodeY(d));
  const desiredBlurPx = isMobile() ? 14 : 18;
  clearingBlur.attr("stdDeviation", desiredBlurPx / Math.max(0.01, S.transform.k));
  clearingRect
    .transition()
    .duration(prefersReducedMotion() ? 0 : 420)
    .attr("opacity", 0.13);
}
function updateClearing(relOId) {
  S.fieldTrace.activeClearingId = relOId || null;
  if (!relOId) {
    clearingMaskGroup.selectAll("*").remove();
    clearingRect
      .transition()
      .duration(prefersReducedMotion() ? 0 : 300)
      .attr("opacity", 0);
    return;
  }
  renderClearing(relOId);
}
function presentFocus(id, focus, opts = {}) {
  const n = byId[id];
  if (!n) return;
  const dur = prefersReducedMotion() ? 0 : (opts.lightDuration ?? 420);
  if (n.type === "RelO") {
    currentLightMode = "clearing";
    updateClearing(id);
    applyClearingStyling(focus, dur);
  } else {
    currentLightMode = "warm-cold";
    updateClearing(null);
    applyWarmColdStyling(focus, dur);
  }
  updateLabelVisibility();
  recomputeLabelPlacements();
  // The focus force keeps moving nodes for up to ~420ms after commit;
  // recompute once more once it's settled rather than only measuring the
  // pre-settle position.
  clearTimeout(recomputeLabelPlacements._settleTimer);
  recomputeLabelPlacements._settleTimer = setTimeout(() => recomputeLabelPlacements(), 460);
}
function transitionToFieldLighting(opts = {}) {
  const dur = prefersReducedMotion() ? 0 : (opts.duration ?? 520);
  currentLightMode = "field";
  currentPenumbraVisible = false;
  updateClearing(null);
  updateWarmPenumbra(null, dur);
  nodeSel
    .transition()
    .duration(dur)
    .attr("opacity", (d) => {
      if (!nodeVisible(d.id)) return 0;
      if (d.type === "NameO" && !S.viewOptions.sourceNames) return 0.28;
      return 1;
    });
  baseSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", (d) => (edgeVisible(d) ? (d.kind === "rel" ? 0.24 : 0.1) : 0));
  projSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", (d) => (projectedVisible(d) ? 0.14 : 0));
  nodeSel
    .select(".node-focus-ring")
    .transition()
    .duration(dur)
    .attr("stroke-opacity", 0)
    .attr("stroke", "transparent");
  nodeSel.attr("data-bb-light", (d) => (nodeVisible(d.id) ? "field" : "field"));
  updateBodyBlur("field");
  updateLabelVisibility();
  recomputeLabelPlacements();
  drawRouteMemory({ duration: dur });
}

// ── Wear (deterministic inferred passage) ───────────────────────────────────
function baseLinkPairsOrdered() {
  return baseLinks.map((e) => [getEdgeSourceId(e), getEdgeTargetId(e)]);
}
function wearCountFor(e) {
  return S.fieldTrace.wear[canonicalEdgeKey(getEdgeSourceId(e), getEdgeTargetId(e))] || 0;
}
function wearOpacityFor(count) {
  return count ? Math.min(0.85, 0.14 + count * 0.1) : 0;
}
const wearColorScale = d3.interpolateRgb("#6b6258", "#c49a45");
function recordInferredWear(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return null;
  const visibleIds = simNodes.filter((d) => nodeVisible(d.id)).map((d) => d.id);
  const path = stableBfsPath(fromId, toId, baseLinkPairsOrdered(), visibleIds);
  if (path.length < 2) return null;
  for (let i = 1; i < path.length; i++) {
    const key = canonicalEdgeKey(path[i - 1], path[i]);
    S.fieldTrace.wear[key] = Math.min(7, (S.fieldTrace.wear[key] || 0) + 1);
  }
  return path;
}
function updateWearOverlay() {
  wearSel
    .attr("display", (d) => (edgeVisible(d) ? null : "none"))
    .attr("stroke", (d) => wearColorScale(Math.min(1, wearCountFor(d) / 7)))
    .attr("stroke-opacity", (d) => wearOpacityFor(wearCountFor(d)))
    .attr("stroke-width", (d) => {
      const c = wearCountFor(d);
      return c ? Math.min(1.6, 0.5 + c * 0.12) : 0.5;
    });
}
function clearPulseTimers() {
  pulseTimers.forEach(clearTimeout);
  pulseTimers = [];
  travelPulseActive = false;
}
function pulseWearPath(pathIds) {
  clearPulseTimers();
  if (isMobile() || prefersReducedMotion() || pathIds.length < 2) {
    updateWearOverlay();
    return;
  }
  travelPulseActive = true;
  const segKeys = [];
  for (let i = 1; i < pathIds.length; i++)
    segKeys.push(canonicalEdgeKey(pathIds[i - 1], pathIds[i]));
  wearSel.each(function (d) {
    const key = canonicalEdgeKey(getEdgeSourceId(d), getEdgeTargetId(d));
    const idx = segKeys.indexOf(key);
    if (idx === -1) return;
    d3.select(this)
      .interrupt()
      .transition()
      .delay(idx * 90)
      .duration(220)
      .attr("stroke-opacity", 0.9)
      .transition()
      .duration(260)
      .attr("stroke-opacity", wearOpacityFor(wearCountFor(d)));
  });
  const total = segKeys.length * 90 + 480;
  pulseTimers.push(
    setTimeout(() => {
      travelPulseActive = false;
      updateWearOverlay();
    }, total),
  );
}

// ── Afterglow (bounded departure memory) ────────────────────────────────────
// Afterglow: bounded departure residue (4.11, fixes BB-R14). Desktop: max 8,
// 10s. Mobile: max 3, 4s (previously afterglow was skipped on mobile
// entirely — a real gap, not a deliberate reduction). No pulse/travel
// animation; reduced-motion shows the final static residue immediately.
function recordDepartureAfterglow(previousId, newId) {
  if (!previousId || previousId === newId) return;
  const cap = isMobile() ? 3 : 8;
  const duration = isMobile() ? 4000 : 10000;
  S.fieldTrace.afterglows = S.fieldTrace.afterglows.filter((a) => a.id !== previousId);
  S.fieldTrace.afterglows.push({ id: previousId, departedAt: Date.now(), duration });
  if (S.fieldTrace.afterglows.length > cap)
    S.fieldTrace.afterglows = S.fieldTrace.afterglows.slice(-cap);
  const old = afterglowTimers.get(previousId);
  if (old) clearTimeout(old);
  const t = setTimeout(() => {
    S.fieldTrace.afterglows = S.fieldTrace.afterglows.filter((a) => a.id !== previousId);
    afterglowTimers.delete(previousId);
    updateAfterglowOverlay();
  }, duration);
  afterglowTimers.set(previousId, t);
  updateAfterglowOverlay();
}
function updateAfterglowOverlay() {
  const data = S.fieldTrace.afterglows
    .map((a) => ({ ...a, node: byId[a.id] }))
    .filter((a) => a.node);
  const sel = afterglowLayer.selectAll("circle.bb-afterglow").data(data, (d) => d.id);
  sel.exit().remove();
  const residueR = isMobile() ? 46 : 64; // soft residue, larger than the body — not a ring hugging its edge
  const enter = sel
    .enter()
    .append("circle")
    .attr("class", "bb-afterglow")
    .attr("fill", "url(#bb-afterglow-gradient)")
    .attr("pointer-events", "none")
    .attr("cx", (d) => nodeX(d.node))
    .attr("cy", (d) => nodeY(d.node))
    .attr("r", residueR)
    .attr("opacity", 1);
  enter
    .merge(sel)
    .transition()
    .duration(prefersReducedMotion() ? 0 : (d) => d.duration)
    .ease(d3.easeLinear)
    .attr("opacity", 0);
  nodeSel.attr("data-bb-afterglow", (d) =>
    S.fieldTrace.afterglows.some((a) => a.id === d.id) ? "1" : "0",
  );
}
function clearFieldTrace() {
  dispatch({ type: CommandType.CLEAR_TRACE });
  afterglowTimers.forEach((t) => clearTimeout(t));
  afterglowTimers.clear();
  clearPulseTimers();
  S.fieldTrace.afterglows = [];
  S.fieldTrace.wear = Object.create(null);
  updateAfterglowOverlay();
  updateWearOverlay();
}

// The Field no longer carries a persistent map readout (4.13, BB-R10):
// #bbFocusReadout and its positioning logic have been removed. Persistent
// ID/type/label information now lives only in Reader metadata; #microPreview
// remains the sole transient desktop tooltip.

// ── Committed-focus design transaction (afterglow + wear + presentation) ───
function presentDesignTransition(id, previousId, focus, opts = {}) {
  recordDepartureAfterglow(previousId, id);
  const path = previousId && previousId !== id ? recordInferredWear(previousId, id) : null;
  presentFocus(id, focus, opts);
  if (path && path.length > 1) pulseWearPath(path);
  else updateWearOverlay();
  S.fieldTrace.previousCommittedId = id;
}

// ── Route ──────────────────────────────────────────────────────────────────
function makeRouteEvent(id, meta = {}) {
  return {
    id,
    type: byId[id]?.type || "",
    label: shortOf(id),
    from: meta.from || null,
    source: meta.source || "unknown",
    index: S.routeEvents.length + 1,
  };
}
// Internal: called only from commitFocus(). Do not call directly elsewhere —
// Route must record only successful, direct committed selection changes.
function registerRouteEvent(id, meta = {}) {
  const ev = makeRouteEvent(id, meta);
  // Route retains the complete ordered session history; only its presentation
  // is windowed (P-RULE-005/039, D-DEC-22) — nothing here truncates S.routeEvents.
  S.routeEvents.push(ev);
  renderRoute();
}
function routeApertureEvents() {
  const events = S.routeEvents;
  const maxTail = isMobile() ? 2 : window.innerWidth < 1180 ? 3 : 4;
  if (events.length <= maxTail + 1) return { leading: [], tail: events, collapsed: false };
  const first = events[0];
  const tail = events.slice(-maxTail);
  const tailHasFirst = tail.some((ev) => ev.index === first.index);
  return { leading: tailHasFirst ? [] : [first], tail, collapsed: true };
}
function renderRoute() {
  const r = document.getElementById("route");
  if (!S.routeEvents.length) {
    r.innerHTML = '<span class="route-empty">route is empty</span>';
    updateRouteLiveRegion();
    drawRouteMemory({ duration: 0 });
    renderRouteDrawer();
    return;
  }
  const ap = routeApertureEvents();
  const parts = [];
  const addEv = (ev, cls = "") =>
    parts.push(
      `<button class="route-item ${cls}" data-route-index="${ev.index}" data-id="${ev.id}" title="${esc(labelOf(ev.id))}">${esc(shortOf(ev.id))}</button>`,
    );
  ap.leading.forEach((ev) => addEv(ev));
  if (ap.collapsed) {
    if (parts.length) parts.push('<span class="sep">·</span>');
    parts.push(
      '<button class="route-ellipsis" data-route-open="1" title="show route">···</button>',
    );
  }
  ap.tail.forEach((ev, i) => {
    if (parts.length) parts.push('<span class="sep">·</span>');
    addEv(ev, i === ap.tail.length - 1 ? "current" : "");
  });
  r.innerHTML = parts.join("") + '<button class="clear-route" aria-label="clear route">clear</button>';
  r.querySelectorAll(".route-item").forEach((el) => {
    el.onmouseenter = () => touchObject(el.dataset.id, { source: "route-hover" });
    el.onmouseleave = () => clearTouch();
    el.onclick = () =>
      focusObject(el.dataset.id, {
        source: "route",
        routePolicy: "replay",
        tracePolicy: "none",
        sequence: Number(el.dataset.routeIndex),
      });
  });
  const ell = r.querySelector("[data-route-open]");
  if (ell)
    ell.onclick = () => {
      renderRouteDrawer();
      openDrawer("routeDrawer");
    };
  // Route-strip clear affects Route only (4.11); field trace has its own
  // separate public control in the Route drawer footer.
  r.querySelector(".clear-route").onclick = () => {
    dispatch({ type: CommandType.CLEAR_ROUTE });
    S.routeEvents = [];
    renderRoute();
    drawRouteMemory({ duration: 260 });
  };
  updateRouteLiveRegion();
  renderRouteDrawer();
}
function renderRouteDrawer() {
  const box = document.getElementById("routeList");
  if (!box) return;
  if (!S.routeEvents.length) {
    box.innerHTML = '<div class="route-empty" style="padding:18px 0">route is empty</div>';
    return;
  }
  box.innerHTML = S.routeEvents
    .map(
      (ev, i) =>
        `<div class="route-row" data-id="${ev.id}" data-route-index="${ev.index}"><div class="route-row-index">${String(i + 1).padStart(2, "0")}</div><div class="route-row-label">${esc(labelOf(ev.id))}</div></div>`,
    )
    .join("");
  box.querySelectorAll(".route-row").forEach(
    (row) =>
      (row.onclick = () => {
        focusObject(row.dataset.id, {
          source: "route-drawer",
          routePolicy: "replay",
          tracePolicy: "none",
          sequence: Number(row.dataset.routeIndex),
        });
        closeAllDrawers();
      }),
  );
}
// F05: src/presentation/status-renderer.js (tests/e2e/tooltip-keyboard-status.spec.js's
// "rapid status messages coalesce" case) is the real coalescing authority for
// this region -- rapid successive announcements (e.g. Solo entry immediately
// followed by a Route update) collapse to the latest message only, rather than
// flooding assistive technology with superseded text. #routeLive remains the
// single polite live region tests/a11y/axe.spec.js asserts.
const routeLiveRegion = document.getElementById("routeLive");
const statusRenderer = routeLiveRegion
  ? createStatusRenderer({ liveRegion: routeLiveRegion })
  : null;
function announceStatus(message) {
  statusRenderer?.announce(message);
}
function updateRouteLiveRegion() {
  const labels = S.routeEvents.map((ev) => ev.label).join(", ");
  announceStatus(labels ? `Route: ${labels}.` : "Route is empty.");
}

// ── Route memory ────────────────────────────────────────────────────────────
function routeStats() {
  const recent = S.routeEvents.slice(-S.recentRouteWindow);
  const stats = new Map();
  recent.forEach((ev, i) => {
    const age = recent.length - 1 - i;
    const existing = stats.get(ev.id) || { count: 0, minAge: age };
    existing.count += 1;
    existing.minAge = Math.min(existing.minAge, age);
    stats.set(ev.id, existing);
  });
  return stats;
}
// Route uses a neutral silver/bone mark; only wear (recordInferredWear,
// below) uses amber-brown. Keeping these visually distinct is required by
// 4.11/BB-R13 — Route is exact reading history, wear is inferred passage.
const ROUTE_MARK_COLOR = "#a89f8f";
function updateRouteHalos(duration = 420) {
  const stats = routeStats();
  nodeSel
    .select(".node-route-halo")
    .transition()
    .duration(prefersReducedMotion() ? 0 : duration)
    .attr("stroke", (d) => (stats.has(d.id) ? ROUTE_MARK_COLOR : "transparent"))
    .attr("stroke-opacity", (d) => {
      const s = stats.get(d.id);
      if (!s) return 0;
      return Math.max(0.06, 0.28 - s.minAge * 0.025) + Math.min(0.12, (s.count - 1) * 0.04);
    })
    .attr("stroke-width", (d) => {
      const s = stats.get(d.id);
      return s ? Math.min(2.2, 1 + (s.count - 1) * 0.25) : 1;
    });
}
function routeSegments() {
  const events = S.routeEvents.slice(-S.recentRouteWindow);
  const segs = [];
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1],
      b = events[i];
    if (!byId[a.id] || !byId[b.id] || !nodeVisible(a.id) || !nodeVisible(b.id)) continue;
    // In solo state: only draw segments where both endpoints are in the solo set
    if (S.soloSet && (!S.soloSet.has(a.id) || !S.soloSet.has(b.id))) continue;
    segs.push({
      key: `${a.index}-${b.index}`,
      source: byId[a.id],
      target: byId[b.id],
      age: events.length - 1 - i,
    });
  }
  return segs.slice(-S.maxVisibleRouteSegments);
}
function drawRouteMemory(opts = {}) {
  const dur = opts.duration ?? 420;
  updateRouteHalos(dur);
  const data = routeSegments();
  const seg = routeMemoryLayer.selectAll("line.route-segment").data(data, (d) => d.key);
  seg
    .exit()
    .transition()
    .duration(prefersReducedMotion() ? 0 : 260)
    .attr("stroke-opacity", 0)
    .remove();
  const enter = seg
    .enter()
    .append("line")
    .attr("class", "route-segment")
    .attr("stroke", ROUTE_MARK_COLOR)
    .attr("stroke-width", 0.8)
    .attr("stroke-dasharray", "1.4 2.2")
    .attr("stroke-linecap", "round")
    .attr("vector-effect", "non-scaling-stroke")
    .attr("pointer-events", "none")
    .attr("stroke-opacity", 0);
  enter
    .merge(seg)
    .each(function (d) {
      const x1 = d.source.x,
        y1 = d.source.y,
        x2 = d.target.x,
        y2 = d.target.y;
      if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2))
        d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
    })
    .transition()
    .duration(prefersReducedMotion() ? 0 : dur)
    .attr("stroke-opacity", (d) => Math.max(0.06, 0.42 - d.age * 0.055));
}

// ── Solo computation ───────────────────────────────────────────────────────
function computeSoloSet(id) {
  const node = byId[id];
  if (!node) return new Set();
  if (node.type === "RelO") {
    // RelO Solo shows the relation itself: the RelO plus every canonical participant.
    return new Set([id, ...(DATA.relations[id] || []).filter((pid) => byId[pid])]);
  }
  // Object Solo = object + its RelOs + all participants in those RelOs
  const relationIds = relosFor(id);
  const result = new Set([id]);
  for (const rid of relationIds) {
    result.add(rid);
    for (const pid of DATA.relations[rid] || []) if (byId[pid]) result.add(pid);
  }
  return result;
}

// ── Focus set ──────────────────────────────────────────────────────────────
function appearingIn(id) {
  return Object.entries(DATA.texts)
    .filter(([, t]) => (t.objects || []).includes(id))
    .map(([tid]) => tid);
}
function relosFor(id) {
  return Object.entries(DATA.relations)
    .filter(([, parts]) => parts.includes(id))
    .map(([rid]) => rid);
}
function linkedNotesForRef(id) {
  return Object.entries(DATA.texts)
    .filter(([, t]) => (t.refs || []).includes(id))
    .map(([tid]) => tid);
}
function buildFocusSet(id) {
  const core = byId[id];
  const ids = new Set([id]);
  (adj[id] ? [...adj[id]] : []).forEach((x) => ids.add(x));
  relosFor(id).forEach((x) => ids.add(x));
  if (core.type === "FO" || core.type === "NameO") appearingIn(id).forEach((x) => ids.add(x));
  if (core.type === "FO")
    nodes
      .filter((x) => x.type === "NameO" && (DATA.nameos[x.id]?.attached || []).includes(id))
      .forEach((x) => ids.add(x.id));
  if (core.type === "RelO") (DATA.relations[id] || []).forEach((x) => ids.add(x));
  if (core.type === "RNO" || core.type === "MNO") {
    const t = DATA.texts[id];
    (t?.objects || []).forEach((x) => ids.add(x));
    (t?.refs || []).forEach((x) => ids.add(x));
  }
  if (core.type === "RefO") linkedNotesForRef(id).forEach((x) => ids.add(x));
  const visibleIds = [...ids].filter(nodeVisible);
  return {
    id,
    coreId: id,
    ids: visibleIds,
    neighborIds: visibleIds.filter((x) => x !== id),
    relationIds: relosFor(id).filter(nodeVisible),
  };
}

// ── Committed state transaction (single mutation authority) ────────────────
// Route, Solo, and trace semantics are decided ENTIRELY by the caller's
// policy flags — no code outside this function may mutate S.activeId,
// append a Route event, or trigger wear/afterglow recording.
//   routePolicy: 'append' (default) | 'replay' | 'none'
//     append -> registerRouteEvent() only when id !== previousCommittedId
//     replay -> focus changes, no Route event
//     none   -> focus/view changes, no Route event
//   tracePolicy: 'record' (default) | 'none'
//     record -> afterglow + wear recorded (only meaningful with a real id change)
//     none   -> no afterglow/wear side effects (Solo, replay, View, About, chamber switch)
async function commitFocus(id, opts = {}) {
  const n = byId[id];
  if (!n) return null; // failed/invalid target: no mutation at all
  const {
    source = "unknown",
    routePolicy = "append",
    tracePolicy = "record",
    openReader = true,
    forceReaderOpen = false,
    surface,
  } = opts;
  const previousId = S.activeId;
  const isSameId = previousId === id;
  S.phase = "focused";
  if (surface) S.surface = surface;
  else if (isMobile() && openReader !== false) S.surface = "read";
  syncSurfaceCanonical();
  updatePhaseClass();
  S.activeId = id;
  S.activeEdge = null;
  S.activeRelos = [];
  S.previewTarget = null;
  dispatch({ type: CommandType.CLEAR_INSPECTION });
  closeAllDrawers();
  hidePreview();
  updateRovingTabindex(id);
  if (routePolicy === "append") {
    // Route/trace policy ("was this a genuinely new id") is decided by the
    // tested reducer, not recomputed here — registerRouteEvent only fires
    // when reduceCommand actually appended (P-RULE-004: same-id no-ops).
    const routeLenBefore = canonicalState.history.route.length;
    dispatch({ type: CommandType.COMMIT_OBJECT, id, source });
    if (canonicalState.history.route.length > routeLenBefore) {
      registerRouteEvent(id, { from: previousId, source });
    }
  } else if (routePolicy === "replay" && opts.sequence != null) {
    dispatch({ type: CommandType.REPLAY_ROUTE_EVENT, sequence: opts.sequence });
  }
  if (openReader !== false && (forceReaderOpen || !S.readerOpen)) {
    await setReaderOpen(true, { measure: !(isMobile() && S.surface === "read") });
  }
  const focus = buildFocusSet(id);
  applyLocalAperture(focus);
  if (tracePolicy === "record" && !isSameId) {
    presentDesignTransition(id, previousId, focus, opts);
  } else {
    presentFocus(id, focus, opts);
  }
  return { focus, previousId, isSameId };
}

// ── Focus object (desktop-oriented commit: opens Reader, fits focus camera) ─
async function focusObject(id, opts = {}) {
  const source = opts.source || opts.from || "unknown";
  const result = await commitFocus(id, { ...opts, source });
  if (!result) return;
  const { focus, previousId } = result;
  const cameraDuration = opts.cameraDuration ?? 760;
  if (!(isMobile() && S.surface === "read") && opts.camera !== false) {
    const applyCamera = () =>
      fitFocusFrame(focus, { duration: cameraDuration, fromNeutral: previousId == null });
    if (cameraDuration > 0) waitFocusForceSettled().then(applyCamera);
    else applyCamera();
  }
  const readerEl = document.getElementById("reader");
  if (readerEl) {
    readerEl.innerHTML = "";
    readerEl.scrollTop = 0;
  }
  if (opts.readerDelay !== false)
    setTimeout(() => renderNodePanel(id), prefersReducedMotion() ? 0 : (opts.readerDelay ?? 160));
  drawRouteMemory({ duration: opts.routeDuration ?? 420 });
  updateRouteLiveRegion();
}
function selectNode(id, opts = {}) {
  return focusObject(id, { source: opts.from || "legacy", openReader: true });
}
async function returnToField(opts = {}) {
  dispatch({ type: CommandType.RETURN_TO_WHOLE_FIELD });
  dispatch({ type: CommandType.CLEAR_INSPECTION });
  S.phase = "field";
  S.surface = "field";
  syncSurfaceCanonical();
  S.activeId = null;
  S.activeEdge = null;
  S.activeRelos = [];
  S.previewTarget = null;
  closeAllDrawers();
  closeSheet();
  hidePreview();
  updatePhaseClass();
  updateRovingTabindex(null);
  if (isMobile()) await setReaderOpen(true, { measure: true });
  else {
    await nextFrame();
    width = mapWrap.clientWidth;
    height = mapWrap.clientHeight;
    if (width > 10 && height > 10) {
      svg.attr("viewBox", `0 0 ${width} ${height}`);
    }
  }
  clearLocalAperture();
  transitionToFieldLighting({ duration: opts.duration ?? 520 });
  await nextFrame();
  fitVisibleField({ duration: opts.duration ?? 850 });
}
function deselectAll() {
  returnToField();
}

// Mobile: select/focus in Field without opening Read
async function selectInField(id, opts = {}) {
  const source = opts.source || "mobile-field";
  const result = await commitFocus(id, {
    ...opts,
    source,
    surface: "field",
    forceReaderOpen: true,
  });
  if (!result) return;
  const { focus, previousId } = result;
  const cameraDuration = opts.cameraDuration ?? 680;
  const applyCamera = () =>
    fitFocusFrame(focus, { duration: cameraDuration, fromNeutral: previousId == null });
  if (cameraDuration > 0) waitFocusForceSettled().then(applyCamera);
  else applyCamera();
  drawRouteMemory({ duration: opts.routeDuration ?? 420 });
  updateRouteLiveRegion();
}

// ── Micro-preview ──────────────────────────────────────────────────────────
function graphPointToScreen(x, y) {
  const p = S.transform.apply([x, y]);
  const rect = mapWrap.getBoundingClientRect();
  return { x: rect.left + p[0], y: rect.top + p[1] };
}
function previewLineForObject(id) {
  const n = byId[id];
  if (!n) return "";
  if (n.type === "FO") {
    const terms = [
      ...appearingIn(id).map(shortOf).slice(0, 3),
      ...relosFor(id).map(shortOf).slice(0, 3),
    ].slice(0, 4);
    return terms.length ? `held with ${terms.join(", ")}` : "field object";
  }
  if (n.type === "NameO") return DATA.nameos[id]?.sourceLayer || "name object";
  if (n.type === "RefO") return DATA.refs[id]?.status || "reference object";
  if (n.type === "RelO")
    return `holds ${(DATA.relations[id] || []).map(shortOf).slice(0, 4).join(", ")}`;
  if (n.type === "RNO" || n.type === "MNO") {
    const objs = (DATA.texts[id]?.objects || []).map(shortOf).slice(0, 4);
    return objs.length ? `opens toward ${objs.join(", ")}` : "note object";
  }
  return "";
}
function placePreviewNearPoint(x, y) {
  const w = 260,
    h = 120,
    m = 16;
  let left = x + 18,
    top = y + 18;
  if (left + w > window.innerWidth - m) left = x - w - 18;
  if (top + h > window.innerHeight - m) top = y - h - 18;
  return { left: Math.max(m, left), top: Math.max(m, top) };
}
function showObjectPreview(id, pos = {}) {
  const n = byId[id];
  if (!n) return;
  const el = document.getElementById("microPreview");
  el.innerHTML = `<div class="micro-preview-title">${esc(n.label)}</div><div class="micro-preview-meta">${esc(n.type)}</div><div class="micro-preview-line">${esc(previewLineForObject(id))}</div>`;
  const x = pos.x ?? width / 2,
    y = pos.y ?? 80;
  const pp = placePreviewNearPoint(x, y);
  el.style.left = `${pp.left}px`;
  el.style.top = `${pp.top}px`;
  el.classList.add("visible");
  el.setAttribute("aria-hidden", "false");
}
function hidePreview() {
  const el = document.getElementById("microPreview");
  if (el) {
    el.classList.remove("visible");
    el.setAttribute("aria-hidden", "true");
  }
}
function touchObject(id, opts = {}) {
  S.touchedId = id;
  dispatch({ type: CommandType.PREVIEW_OBJECT, id });
  // Transient hover indicator only — there is no persistent amber ring for
  // the active/selected node (4.8); that identity is carried by full
  // opacity plus the warm penumbra instead.
  nodeSel
    .select(".node-focus-ring")
    .attr("stroke", (n) => (n.id === id ? "#c49a45" : "transparent"))
    .attr("stroke-opacity", (n) => (n.id === id ? 0.42 : 0));
  if (opts.showPreview !== false && byId[id]) {
    const d = byId[id];
    const pt = d.x != null ? graphPointToScreen(d.x, d.y) : { x: 120, y: 80 };
    showObjectPreview(id, pt);
  }
}
function clearTouch() {
  S.touchedId = null;
  dispatch({ type: CommandType.CLEAR_PREVIEW });
  hidePreview();
  nodeSel.select(".node-focus-ring").attr("stroke", "transparent").attr("stroke-opacity", 0);
}

function showEdgePreview(e, ev) {
  const relos = e.relos || [];
  const el = document.getElementById("microPreview");
  el.innerHTML = `<div class="micro-preview-title">Projected edge</div><div class="micro-preview-meta">${relos.length} relation object${relos.length === 1 ? "" : "s"}</div><div class="micro-preview-line">generated by ${relos.map(shortOf).slice(0, 3).join(", ")}</div>`;
  const pp = placePreviewNearPoint(ev.clientX, ev.clientY);
  el.style.left = `${pp.left}px`;
  el.style.top = `${pp.top}px`;
  el.classList.add("visible");
  el.setAttribute("aria-hidden", "false");
}

// ── Mobile preview sheet ────────────────────────────────────────────────────
function showNodePreviewSheet(id) {
  const n = byId[id];
  if (!n) return;
  closeAllDrawers();
  hidePreview();
  S.previewTarget = { kind: "object", id, source: "mobile-sheet" };
  S.showSheet = true;
  setOverlay("nodeSheet");
  document.getElementById("sheetBody").innerHTML =
    `<div class="sheet-title">${esc(n.label)}</div><div class="meta">${esc(n.type)} · ${esc(n.id)}</div><div class="prose"><p>${esc(previewLineForObject(id))}</p></div><div class="sheet-actions"><button class="tool-btn" id="sheetEnter">Enter</button><button class="tool-btn" id="sheetHold">Hold in field</button><button class="tool-btn" id="sheetClose">Keep reading</button></div>`;
  document.getElementById("sheet").classList.add("open");
  document.getElementById("sheetEnter").onclick = () => {
    closeSheet();
    focusObject(id, { source: "graph-mobile" });
  };
  document.getElementById("sheetHold").onclick = () => {
    const focus = buildFocusSet(id);
    applyLocalAperture(focus);
    presentFocus(id, focus, { lightDuration: 320 });
    fitFocusFrame(focus, { openReader: false, duration: 620 });
  };
  document.getElementById("sheetClose").onclick = closeSheet;
}
function closeSheet() {
  document.getElementById("sheet").classList.remove("open");
  S.showSheet = false;
  S.previewTarget = null;
  if (S.overlay === "nodeSheet" || S.overlay === "edgeSheet") setOverlay(null);
}

// ── Reader functions ────────────────────────────────────────────────────────
function reader(html) {
  document.getElementById("reader").innerHTML = html;
  inlineHandlers(document.getElementById("reader"));
}
function meta(n) {
  return `<div class="meta">${n.type} · ${n.id}</div><div class="title">${n.label}</div>`;
}
function renderIndexList(ids) {
  return `<div class="index-list">${ids.map((id) => `<div class="index-item" data-id="${id}"><div class="idx-type">${byId[id]?.type || ""}</div><div class="idx-title">${labelOf(id)}</div></div>`).join("")}</div>`;
}
function bindIndexItems() {
  document.querySelectorAll(".index-item").forEach((el) => {
    el.onmouseenter = () => !isMobile() && touchObject(el.dataset.id, { source: "index-hover" });
    el.onmouseleave = () => !isMobile() && clearTouch();
    el.onclick = () => focusObject(el.dataset.id, { source: "index-item" });
  });
}
function renderNodePanel(id) {
  closeSheet();
  const n = byId[id];
  if (["RNO", "MNO"].includes(n.type)) return renderTextNode(n);
  if (n.type === "FO") return renderFO(n);
  if (n.type === "NameO") return renderNameO(n);
  if (n.type === "RefO") return renderRefO(n);
  if (n.type === "RelO") return renderRelO(n);
}
function renderTextNode(n) {
  const t = DATA.texts[n.id];
  const objectChips = (t.objects || [])
    .map((id) => `<span class="chip" data-id="${id}">${shortOf(id)}</span>`)
    .join("");
  const refChips = (t.refs || [])
    .map((id) => `<span class="chip" data-id="${id}">${shortOf(id)}</span>`)
    .join("");
  const body =
    n.type === "MNO"
      ? `<div style="margin-bottom:8px">${t.body}</div><div class="disclosure"><button id="toggleObjects" style="font-size:10px;letter-spacing:.18em">objects ${(t.objects || []).length}</button><div id="mnoObjects" class="chip-row" style="display:none">${objectChips}</div></div>`
      : `<div class="prose"><p>${t.body}</p></div>${refChips ? '<div class="section-label">references</div><div class="chip-row">' + refChips + "</div>" : ""}<div class="section-label">objects</div><div class="chip-row">${objectChips}</div>`;
  if (n.type === "MNO" && !prefersReducedMotion()) {
    const rEl = document.getElementById("reader");
    if (rEl) rEl.style.opacity = "0";
    reader(`${meta(n)}${body}`);
    document.fonts.ready.then(() => {
      if (rEl) {
        rEl.style.transition = "opacity 0.12s";
        rEl.style.opacity = "";
        setTimeout(() => {
          if (rEl) rEl.style.transition = "";
        }, 140);
      }
    });
  } else {
    reader(`${meta(n)}${body}`);
  }
  document.querySelectorAll(".chip").forEach((c) => {
    c.onmouseenter = () => !isMobile() && touchObject(c.dataset.id, { source: "chip-hover" });
    c.onmouseleave = () => !isMobile() && clearTouch();
    c.onclick = () => focusObject(c.dataset.id, { source: "chip" });
  });
  const to = document.getElementById("toggleObjects");
  if (to)
    to.onclick = () => {
      const box = document.getElementById("mnoObjects");
      box.style.display = box.style.display === "none" ? "flex" : "none";
    };
}
function renderFO(n) {
  let html = `${meta(n)}`;
  const appears = appearingIn(n.id),
    relos = relosFor(n.id),
    names = nodes
      .filter((x) => x.type === "NameO" && (DATA.nameos[x.id]?.attached || []).includes(n.id))
      .map((x) => x.id);
  if (appears.length)
    html += `<div class="section-label">appears in</div>${renderIndexList(appears)}`;
  if (names.length)
    html += `<div class="section-label">source names</div>${renderIndexList(names)}`;
  if (relos.length)
    html += `<div class="section-label">relation objects</div>${renderIndexList(relos)}`;
  reader(html);
  bindIndexItems();
}
function wrapScriptSpans(s) {
  return esc(s).replace(
    /[؀-ۿ]+/g,
    (m) => `<span lang="ar" dir="rtl" class="bb-arabic">${m}</span>`,
  );
}
function renderNameO(n) {
  const no = DATA.nameos[n.id];
  const label = isArabicScript(n.label)
    ? `<p class="bb-arabic" lang="ar" dir="rtl">${esc(n.label)}</p>`
    : "";
  reader(
    `${meta(n)}${label}<div class="prose"><p>${wrapScriptSpans(no.sourceLayer)}</p><p>${wrapScriptSpans(no.gloss)}</p></div><div class="section-label">attached objects</div>${renderIndexList(no.attached || [])}`,
  );
  bindIndexItems();
}
function renderRefO(n) {
  const r = DATA.refs[n.id];
  const linked = Object.entries(DATA.texts)
    .filter(([, t]) => (t.refs || []).includes(n.id))
    .map(([tid]) => tid);
  let sourceBlock = "";
  if (r.sources && r.sources.length) {
    sourceBlock = r.sources
      .map((s) =>
        s.url
          ? `<a class="source-row" href="${s.url}" target="_blank" rel="noopener">${s.label} ↗</a>`
          : `<span class="source-row" style="opacity:.5;cursor:default">${s.label}</span>`,
      )
      .join("");
    if (r.statusNote)
      sourceBlock += `<div style="font-family:var(--mono);font-size:10px;color:var(--ghost);margin-top:10px;letter-spacing:.08em">${r.statusNote}</div>`;
  } else if (r.url) {
    sourceBlock = `<a class="source-row" href="${r.url}" target="_blank" rel="noopener">${r.status || "source"} ↗</a>`;
  } else {
    sourceBlock = `<span class="source-row" style="opacity:.45;cursor:default;border-bottom:0">${r.status || "bibliographic reference"}</span>`;
  }
  reader(
    `${meta(n)}<div class="ref-citation">${r.citation}</div>${sourceBlock}${linked.length ? '<div class="section-label">linked notes</div>' + renderIndexList(linked) : ""}`,
  );
  bindIndexItems();
}
function renderRelO(n) {
  const parts = DATA.relations[n.id] || [];
  reader(
    `<div class="meta">RelO · ${n.id}</div><div class="section-label">objects</div>${renderIndexList(parts)}`,
  );
  bindIndexItems();
}
function openProjectedEdge(e) {
  const s = getEdgeSourceId(e),
    t = getEdgeTargetId(e);
  S.activeEdge = { source: s, target: t };
  S.activeRelos = e.relos || [];
  S.previewTarget = null;
  dispatch({
    type: CommandType.INSPECT_PROJECTED_EDGE,
    sourceId: s,
    targetId: t,
    relOIds: S.activeRelos,
  });
  if (isMobile()) return showEdgeSheet(s, t, S.activeRelos);
  renderEdgePanel(s, t, S.activeRelos);
}
function renderEdgePanel(s, t, relos) {
  reader(
    `<div class="meta">Projected edge</div><div class="edge-head">${labelOf(s)} ↔ ${labelOf(t)}</div><div class="section-label">generated by</div>${renderIndexList(relos)}`,
  );
  bindIndexItems();
}
function showEdgeSheet(s, t, relos) {
  closeAllDrawers();
  hidePreview();
  setOverlay("edgeSheet");
  S.showSheet = true;
  document.getElementById("sheetBody").innerHTML =
    `<div class="sheet-title">${shortOf(s)} ↔ ${shortOf(t)}</div><div class="meta">Projected edge</div><div class="section-label">generated by</div>${renderIndexList(relos)}<div class="sheet-actions"><button class="tool-btn" id="sheetEdgeOpen">Open</button><button class="tool-btn" id="sheetClose2">Keep reading</button></div>`;
  document.getElementById("sheet").classList.add("open");
  bindIndexItems();
  document.getElementById("sheetEdgeOpen").onclick = () => {
    closeSheet();
    renderEdgePanel(s, t, relos);
  };
  document.getElementById("sheetClose2").onclick = closeSheet;
}
function renderDoc(kind = "statement") {
  const title =
    { statement: "Statement", how: "How to read", types: "Object types", sources: "Sources" }[
      kind
    ] || "Index";
  const text = DATA.docs[kind] || DATA.docs.statement;
  const paras = text
    .split("\n\n")
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  reader(
    `<div class="meta">Index</div><div class="title">${title}</div><div class="prose">${paras}</div>`,
  );
}
function inlineHandlers(root = document) {
  root.querySelectorAll(".fl").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      if (!isMobile()) touchObject(el.dataset.id, { source: "inline-hover" });
    });
    el.addEventListener("mouseleave", () => {
      if (!isMobile()) clearTouch();
    });
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (isMobile() && S.surface === "read")
        return focusObject(el.dataset.id, { source: "text-link-mobile", openReader: true });
      focusObject(el.dataset.id, { source: "text-link" });
    });
  });
}

// ── Drawers ────────────────────────────────────────────────────────────────
const backdrop = document.getElementById("drawerBackdrop");
// ── Modal overlay focus containment (4.15) ──────────────────────────────────
// Drawers and About behave as true modal dialogs: background made inert,
// focus enters the panel, Escape/close returns focus to the invoker.
// aria-modal is only meaningful (and only asserted in the HTML) because the
// background is actually made inert here, not merely visually covered.
let overlayReturnFocus = null;
function trapOverlayOpen(panelEl) {
  if (overlayReturnFocus) return; // already trapped by another open overlay
  overlayReturnFocus = document.activeElement;
  document.querySelector(".rail")?.setAttribute("inert", "");
  document.getElementById("mainLayout")?.setAttribute("inert", "");
  document.querySelector(".bottom-nav")?.setAttribute("inert", "");
  const focusable = panelEl?.querySelector(
    'button, [href], input, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable) focusable.focus();
}
function trapOverlayClose() {
  if (document.querySelector(".drawer.open, #aboutPanel.open")) return; // another overlay still open
  document.querySelector(".rail")?.removeAttribute("inert");
  document.getElementById("mainLayout")?.removeAttribute("inert");
  document.querySelector(".bottom-nav")?.removeAttribute("inert");
  const target = overlayReturnFocus;
  overlayReturnFocus = null;
  if (target && document.contains(target) && target.focus) target.focus();
}
function openDrawer(id) {
  closeSheet();
  hidePreview();
  ["fieldViewDrawer", "objectDrawer", "routeDrawer"].forEach((other) => {
    if (other !== id) {
      const d = document.getElementById(other);
      d.classList.remove("open");
      d.setAttribute("aria-hidden", "true");
      d.setAttribute("inert", "");
    }
  });
  const drawer = document.getElementById(id);
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  drawer.removeAttribute("inert");
  backdrop.classList.add("open");
  setOverlay(id);
  document.body.style.overflow = "hidden";
  trapOverlayOpen(drawer);
}
function closeDrawer(id) {
  const drawer = document.getElementById(id);
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("inert", "");
  if (!document.querySelector(".drawer.open")) {
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
    setOverlay(null);
  }
  trapOverlayClose();
}
function closeAllDrawers() {
  ["fieldViewDrawer", "objectDrawer", "routeDrawer"].forEach((id) => {
    const drawer = document.getElementById(id);
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
  });
  backdrop.classList.remove("open");
  document.body.style.overflow = "";
  setOverlay(null);
  trapOverlayClose();
}
backdrop.addEventListener("click", closeAllDrawers);
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => closeDrawer(b.dataset.close)));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAbout();
    closeAllDrawers();
    closeSheet();
    clearTouch();
  }
});

// ── Field view controls ─────────────────────────────────────────────────────
function renderFieldViewControls() {
  const typeBox = document.getElementById("typeToggles");
  const viewBox = document.getElementById("viewToggles");
  typeBox.innerHTML = typeOrder
    .map(
      (type) =>
        `<div class="toggle-row"><span>${type} <span style="color:var(--ghost)">(${countType(type)})</span></span><button class="switch ${S.objectGroups[type] ? "on" : ""}" data-type="${type}" aria-label="toggle ${type}" aria-pressed="${!!S.objectGroups[type]}"></button></div>`,
    )
    .join("");
  viewBox.innerHTML = [
    ["projected", "Projected edges"],
    ["labels", "Labels"],
    ["sourceNames", "Source names"],
  ]
    .map(
      ([key, label]) =>
        `<div class="toggle-row"><span>${label}</span><button class="switch ${S.viewOptions[key] ? "on" : ""}" data-view="${key}" aria-label="toggle ${label}" aria-pressed="${!!S.viewOptions[key]}"></button></div>`,
    )
    .join("");
  typeBox
    .querySelectorAll("[data-type]")
    .forEach(
      (btn) =>
        (btn.onclick = () => setObjectGroup(btn.dataset.type, !S.objectGroups[btn.dataset.type])),
    );
  viewBox.querySelectorAll("[data-view]").forEach(
    (btn) =>
      (btn.onclick = () => {
        const key = btn.dataset.view;
        S.viewOptions[key] = !S.viewOptions[key];
        dispatch({
          type: CommandType.SET_VIEW_OPTION,
          option: VIEW_OPTION_CANONICAL_KEY[key] || key,
          value: S.viewOptions[key],
        });
        renderFieldViewControls();
        updateVisibility();
        if (S.activeId) fitFocusFrame(buildFocusSet(S.activeId));
        else fitVisibleField();
      }),
  );
}
// app.js's own viewOptions keys ("projected") vs. the canonical command
// contract's SET_VIEW_OPTION option names ("projectedEdges") — see
// src/state/initial-state.js's view.* fields.
const VIEW_OPTION_CANONICAL_KEY = { projected: "projectedEdges" };
function setObjectGroup(type, value) {
  S.objectGroups[type] = value;
  dispatch({ type: CommandType.SET_TYPE_VISIBILITY, objectType: type, visible: value });
  renderFieldViewControls();
  updateVisibility();
  if (S.activeId) fitFocusFrame(buildFocusSet(S.activeId));
  else fitVisibleField();
  if (S.activeId && !nodeVisible(S.activeId)) returnToField({ reason: "active-hidden-by-filter" });
}
function renderObjectRows(container, filter = "", typeFilter = null) {
  const q = filter.trim().toLowerCase();
  const rows = nodes
    .filter(
      (n) =>
        (!typeFilter || n.type === typeFilter) &&
        (!q || n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)),
    )
    .map(
      (n) =>
        `<div class="object-row"><div class="otype">${n.type}</div><div class="olabel" data-open="${n.id}">${n.label}</div><button class="icon-small" data-eye="${n.id}">${S.objectVisibility[n.id] === false ? "show" : "hide"}</button><button class="icon-small" data-solo="${n.id}">solo</button></div>`,
    )
    .join("");
  container.innerHTML = rows;
  container.querySelectorAll("[data-open]").forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.open;
        // P-RULE-016: Index Open clears an individual hide but never forces
        // a group-hidden object visible — only the per-object override (not
        // the type-group gate nodeVisible() also checks) is cleared here.
        if (S.objectVisibility[id] === false) {
          S.objectVisibility[id] = true;
          dispatch({ type: CommandType.SET_OBJECT_VISIBILITY, id, visible: true });
        }
        focusObject(id, { source: "object-drawer" });
        closeAllDrawers();
      }),
  );
  container.querySelectorAll("[data-eye]").forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.eye;
        S.objectVisibility[id] = S.objectVisibility[id] === false;
        dispatch({ type: CommandType.SET_OBJECT_VISIBILITY, id, visible: S.objectVisibility[id] });
        renderFieldViewControls();
        updateVisibility();
        // P-RULE-015 (field attention neutralizes when the focused object
        // becomes hidden) is deliberately NOT handled the way setObjectGroup
        // handles it below (a full returnToField()) — the eye toggle lives
        // inside the open object drawer itself, and returnToField()'s
        // closeAllDrawers() would close the very drawer the reader is using,
        // which tests/generated/ordered-pairs.spec.js's [hide, commit]
        // scenario confirms must stay open. A correct fix needs a
        // field-attention-only neutralization that leaves drawers/reader/
        // camera untouched, which app.js's single S.activeId field (it
        // conflates anchor and field attention) can't express without
        // deeper surgery — left as disclosed, separate scope.
      }),
  );
  container.querySelectorAll("[data-solo]").forEach(
    (el) =>
      (el.onclick = async () => {
        const id = el.dataset.solo;
        S.soloSet = computeSoloSet(id);
        dispatch({ type: CommandType.ENTER_SOLO, id });
        announceStatus(`Solo: ${byId[id]?.label || id}.`);
        updateVisibility();
        closeAllDrawers();
        await nextFrame();
        if (isMobile()) await setReaderOpen(true, { measure: true });
        // Solo is a view mode: it never appends Route or records wear/afterglow.
        const result = await commitFocus(id, {
          source: "index-solo",
          routePolicy: "none",
          tracePolicy: "none",
          openReader: false,
          surface: "field",
          lightDuration: 420,
        });
        if (!result) return;
        fitVisibleField({ duration: 760 });
        drawRouteMemory({ duration: 420 });
      }),
  );
}
function renderObjectLists() {
  const objectList = document.getElementById("objectList");
  const title = document.getElementById("objectDrawerTitle");
  const typeFilter = S.indexFilter === "sources" ? "RefO" : null;
  if (title) title.textContent = S.indexFilter === "sources" ? "Sources" : "Index";
  if (objectList)
    renderObjectRows(objectList, document.getElementById("objectSearch")?.value || "", typeFilter);
}
function openIndex(filter = "all") {
  S.indexFilter = filter;
  const search = document.getElementById("objectSearch");
  if (search) search.value = "";
  renderObjectLists();
  openDrawer("objectDrawer");
}
document.getElementById("objectSearch").oninput = renderObjectLists;
document.getElementById("restoreField").onclick = () => {
  S.objectVisibility = { ...defaultVisibility };
  S.soloSet = null;
  Object.keys(S.objectGroups).forEach((k) => (S.objectGroups[k] = true));
  dispatch({ type: CommandType.RESTORE_FIELD });
  if (canonicalState.solo.active) dispatch({ type: CommandType.EXIT_SOLO });
  announceStatus("Field restored.");
  renderFieldViewControls();
  updateVisibility();
  closeAllDrawers();
  returnToField({ source: "restore-field" });
};
document.getElementById("showAllObjects").onclick = () => {
  S.objectVisibility = { ...defaultVisibility };
  S.soloSet = null;
  if (canonicalState.solo.active) dispatch({ type: CommandType.EXIT_SOLO });
  announceStatus("Field restored.");
  renderObjectLists();
  updateVisibility();
  closeAllDrawers();
  returnToField({ source: "show-all" });
};
// Two explicit, separate public controls (4.11): Clear Route never touches
// field trace; Clear field trace never touches Route.
document.getElementById("clearRouteDrawer").onclick = () => {
  dispatch({ type: CommandType.CLEAR_ROUTE });
  S.routeEvents = [];
  renderRoute();
  drawRouteMemory({ duration: 260 });
};
document.getElementById("clearFieldTraceDrawer").onclick = () => {
  clearFieldTrace();
};

// ── Action bindings ─────────────────────────────────────────────────────────
document.querySelectorAll("[data-action]").forEach(
  (b) =>
    (b.onclick = async () => {
      const a = b.dataset.action;
      if (a === "field") returnToField({ source: "rail" });
      else if (a === "view") openDrawer("fieldViewDrawer");
      else if (a === "index") openIndex("all");
      else if (a === "sources") openIndex("sources");
      else if (a === "about") {
        if (S.aboutOpen) closeAbout();
        else openAbout("rail");
      }
    }),
);
document.querySelectorAll("[data-mobile]").forEach(
  (b) =>
    (b.onclick = async () => {
      const a = b.dataset.mobile;
      if (a === "field") {
        if (S.aboutOpen) closeAbout();
        if (isMobile() && S.activeId) {
          const fid = S.activeId;
          beginGraphHandoff();
          S.surface = "field";
          syncSurfaceCanonical();
          updatePhaseClass();
          closeAllDrawers();
          closeSheet();
          hidePreview();
          await nextFrame();
          measureGraph();
          await nextFrame();
          const focus = buildFocusSet(fid);
          applyLocalAperture(focus);
          fitFocusFrame(focus, { duration: 0, padX: 56, padY: 72 });
          endGraphHandoff();
        } else {
          returnToField({ source: "mobile-nav" });
        }
        return;
      }
      if (a === "read") {
        const readTarget = S.activeId || "FO.BLACK_BIRD_FIELD";
        if (!S.activeId) {
          // Chamber switch only: never appends Route or records trace.
          await commitFocus(readTarget, {
            source: "read-btn",
            routePolicy: "none",
            tracePolicy: "none",
            surface: "read",
            forceReaderOpen: true,
          });
        } else {
          S.phase = "focused";
          S.surface = "read";
          syncSurfaceCanonical();
          updatePhaseClass();
          await setReaderOpen(true, { measure: false });
        }
        renderNodePanel(readTarget);
        return;
      }
      if (a === "view") openDrawer("fieldViewDrawer");
      if (a === "index") openIndex("all");
    }),
);
document.getElementById("fieldBtn").onclick = () => returnToField({ source: "field-button" });

// ── Onboarding ─────────────────────────────────────────────────────────────
const onboardingStages = [
  {
    text: "Enter from anywhere.",
    groups: ["RNO", "MNO", "FO", "NameO", "RefO", "RelO"],
    projected: false,
  },
  {
    text: "Objects appear with sources, names, notes, and relations.",
    groups: ["RNO", "MNO", "FO", "NameO", "RefO", "RelO"],
    projected: true,
  },
  {
    text: "The route begins where focus begins.",
    groups: ["RNO", "MNO", "FO", "NameO", "RefO", "RelO"],
    projected: true,
  },
];
function showFieldPrompt(text) {
  const el = document.getElementById("fieldPrompt");
  el.textContent = text;
  el.classList.add("visible");
}
function hideFieldPrompt() {
  document.getElementById("fieldPrompt").classList.remove("visible");
}
function applyOnboardingLight(stage) {
  const groupSet = new Set(stage.groups || []),
    emphasis = new Set(stage.emphasis || []);
  const dur = prefersReducedMotion() ? 0 : 520;
  nodeSel
    .transition()
    .duration(dur)
    .attr("opacity", (d) => {
      if (emphasis.has(d.id)) return 1;
      if (groupSet.has(d.type)) return 0.82;
      return 0.16;
    });
  baseSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", (d) => {
      const s = byId[getEdgeSourceId(d)],
        t = byId[getEdgeTargetId(d)];
      if (!s || !t) return 0;
      return groupSet.has(s.type) || groupSet.has(t.type) ? 0.16 : 0.035;
    });
  projSel
    .transition()
    .duration(dur)
    .attr("stroke-opacity", stage.projected ? 0.16 : 0);
}
function runOnboardingStage(i) {
  if (!S.onboardingActive) return;
  if (i >= onboardingStages.length) return finishOnboarding();
  const stage = onboardingStages[i];
  showFieldPrompt(stage.text);
  applyOnboardingLight(stage);
  const hold = prefersReducedMotion() ? 400 : 2600;
  setTimeout(() => {
    hideFieldPrompt();
    setTimeout(() => runOnboardingStage(i + 1), prefersReducedMotion() ? 0 : 520);
  }, hold);
}
async function startTacitOnboarding() {
  S.phase = "onboarding";
  S.surface = "field";
  syncSurfaceCanonical();
  updatePhaseClass();
  S.onboardingActive = true;
  await setReaderOpen(false);
  reader("");
  transitionToFieldLighting({ duration: 0 });
  await nextFrame();
  measureGraph();
  await nextFrame();
  fitVisibleField({ duration: 0 });
  endGraphHandoff();
  await nextFrame();
  runOnboardingStage(0);
}
async function finishOnboarding() {
  S.onboardingActive = false;
  hideFieldPrompt();
  await sleep(prefersReducedMotion() ? 0 : 260);

  const id = "FO.BLACK_BIRD_FIELD";

  if (isMobile()) {
    // Mobile: animate aperture/light/camera on full-width map, then commit focus.
    // S.activeId is intentionally left unset here — the commitFocus() call below
    // is the single authority that sets it and appends the one onboarding Route event.
    const focus = buildFocusSet(id);
    applyLocalAperture(focus);
    presentFocus(id, focus, { lightDuration: prefersReducedMotion() ? 0 : 520 });
    fitFocusFrame(focus, { duration: prefersReducedMotion() ? 0 : 780 });
    await sleep(prefersReducedMotion() ? 0 : 420);
    S.phase = "focused";
    S.surface = "field";
    syncSurfaceCanonical();
    updatePhaseClass();
    await focusObject(id, {
      source: "onboarding",
      openReader: false,
      cameraDuration: prefersReducedMotion() ? 0 : 680,
      lightDuration: prefersReducedMotion() ? 0 : 180,
      readerDelay: 0,
    });
    return;
  }

  // Desktop: fade graph out, open reader and apply all focus/aperture/camera under the mask,
  // then fade graph back in once the complete final Black Bird state is ready.
  S.phase = "focused";
  S.surface = "field";
  syncSurfaceCanonical();
  updatePhaseClass();
  await beginGraphHandoff({ fade: true, duration: 180 });
  await setReaderOpen(true, { waitTransition: true, transitionMs: 680, measure: true });
  await nextFrame();
  measureGraph();
  await nextFrame();
  // All focus effects (aperture, lighting, route, reader) run under the mask at duration:0.
  await focusObject(id, {
    source: "onboarding",
    openReader: true,
    camera: false,
    cameraDuration: 0,
    lightDuration: 0,
    routeDuration: 0,
    readerDelay: 0,
  });
  // Wait for readerDelay:0 setTimeout to fire, then re-measure and place camera.
  await nextFrame();
  measureGraph();
  await nextFrame();
  fitVisibleField({ duration: 0 });
  await nextFrame();
  await endGraphHandoff({ fade: true, duration: 260 });
}

// ── Entry ──────────────────────────────────────────────────────────────────
async function enter(opts = {}) {
  dispatch({ type: CommandType.ENTER_WORK });
  const th = document.getElementById("threshold");
  beginGraphHandoff();
  th.classList.add("leaving");
  await sleep(prefersReducedMotion() ? 0 : 520);
  th.style.display = "none";
  if (opts.skipOnboarding) {
    S.phase = "focused";
    S.surface = "field";
    syncSurfaceCanonical();
    updatePhaseClass();
    if (!isMobile()) {
      await setReaderOpen(true, { waitTransition: true, transitionMs: 520, measure: true });
    }
    await nextFrame();
    measureGraph();
    await nextFrame();
    const fid = "FO.BLACK_BIRD_FIELD";
    const ff = buildFocusSet(fid);
    fitFocusFrame(ff, { duration: 0 });
    endGraphHandoff();
    await focusObject(fid, { source: "direct-enter", openReader: !isMobile(), camera: false });
    return;
  }
  startTacitOnboarding();
}
document.querySelectorAll("[data-enter]").forEach((b) => (b.onclick = () => enter()));

// ── About chamber ──────────────────────────────────────────────────────────
function jumpAboutSection(id) {
  const body = document.getElementById("aboutBody");
  const target = document.getElementById(id);
  if (!body || !target) return;
  const pad = isMobile() ? 24 : 28;
  const bodyRect = body.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = body.scrollTop + (targetRect.top - bodyRect.top) - pad;
  body.scrollTo({
    top: Math.max(0, nextTop),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}
function openAbout(origin) {
  S.aboutOpen = true;
  S.aboutOrigin = origin;
  dispatch({ type: CommandType.OPEN_OVERLAY, kind: "about", invoker: origin || "unknown" });
  closeAllDrawers();
  closeSheet();
  hidePreview();
  const panel = document.getElementById("aboutPanel");
  panel.classList.toggle("from-threshold", origin === "threshold");
  panel.classList.add("open");
  panel.removeAttribute("inert");
  panel.setAttribute("aria-hidden", "false");
  document.getElementById("aboutBody").scrollTop = 0;
  document
    .querySelectorAll('.rail-btn[data-action="about"]')
    .forEach((b) => b.classList.add("active"));
  trapOverlayOpen(panel);
}
function closeAbout() {
  if (!S.aboutOpen) return;
  S.aboutOpen = false;
  S.aboutOrigin = null;
  dispatch({ type: CommandType.CLOSE_OVERLAY });
  const panel = document.getElementById("aboutPanel");
  panel.classList.remove("open", "from-threshold");
  panel.setAttribute("inert", "");
  panel.setAttribute("aria-hidden", "true");
  document
    .querySelectorAll('.rail-btn[data-action="about"]')
    .forEach((b) => b.classList.remove("active"));
  trapOverlayClose();
}
document.getElementById("aboutClose").onclick = closeAbout;
document
  .querySelectorAll("[data-about-section]")
  .forEach((b) => (b.onclick = () => jumpAboutSection(b.dataset.aboutSection)));
document.getElementById("thAboutBtn").onclick = () => openAbout("threshold");
document.getElementById("mobileAboutBtn").onclick = () => openAbout("mobile-field");

// ── Threshold font-ready gate ──────────────────────────────────────────────
(function () {
  const card = document.querySelector(".threshold-card");
  if (!card) return;
  const reveal = () => {
    card.style.opacity = "1";
  };
  const t = setTimeout(reveal, 1600);
  (typeof document.fonts !== "undefined" ? document.fonts.ready : Promise.resolve())
    .then(() => {
      clearTimeout(t);
      reveal();
    })
    .catch(() => {
      clearTimeout(t);
      reveal();
    });
})();

// ── Init ───────────────────────────────────────────────────────────────────
renderFieldViewControls();
renderRoute();
updateVisibility();
reader("");
updatePhaseClass();
if (location.search.includes("enter=1")) setTimeout(() => enter(), 200);
if (location.search.includes("skipIntro=1")) setTimeout(() => enter({ skipOnboarding: true }), 200);
let fitted = false;
// Authored positions are available synchronously (no simulation to settle
// for), so the initial fit and label pass run immediately rather than
// waiting on a settle event or a 5s safety-net fallback.
if (!fitted && !(isMobile() && S.surface === "read")) {
  fitted = true;
  fitVisibleField();
}
recomputeLabelPlacements();
if (typeof document.fonts !== "undefined") {
  document.fonts.ready.then(() => recomputeLabelPlacements()).catch(() => {});
}

// ── Deliberately bounded test interface (F02) ───────────────────────────────
// Bundling src/app.js scopes its ~150 top-level functions out of global
// reach, which the Playwright suite previously relied on via bare
// page.evaluate(() => someTopLevelFn()) calls. Rather than re-exposing
// everything, this is a named, reviewed allowlist of exactly what the test
// suite legitimately needs to reach — exposed only in ?bbtest=1 sessions,
// never in a real visitor's page.
if (new URLSearchParams(location.search).get("bbtest") === "1") {
  window.__bbTest = {
    buildFocusSet,
    closeAllDrawers,
    clusterCenter,
    computeFieldSafeRect,
    computeNodeEnvelope,
    computeSoloSet,
    focusObject,
    getNodeBounds,
    isMobile,
    nodeVisible,
    openDrawer,
    openIndex,
    returnToField,
    homeFor: (id) => AUTHORED_HOMES[id] || null,
    get simNodes() {
      return simNodes;
    },
    get byId() {
      return byId;
    },
  };
}
