// ── Bootstrap validation (T04, T-REQ-003) ───────────────────────────────────
// Canonical, independently testable implementation: src/bootstrap.js and
// src/presentation/bootstrap-renderer.js. Reimplemented inline here (not
// imported) because scripts/build.mjs concatenates this file into a single
// non-module <script>; those two files are the real modules pending build
// support for actual ES module bundling.
const BB_UI_COPY = {
  bootstrapUnavailableTitle: "The field could not be opened",
  bootstrapUnavailableBody:
    "The artwork did not finish loading. Reload the page. If the problem continues, use the source and citation links below.",
};
function bbValidateBootstrap() {
  if (typeof d3 === "undefined") return { ok: false, reason: "runtime-missing" };
  if (!DATA || typeof DATA !== "object") return { ok: false, reason: "invalid-data" };
  const requiredKeys = ["nodes", "texts", "nameos", "refs", "relations", "meta", "docs", "ui"];
  if (requiredKeys.some((k) => !(k in DATA))) return { ok: false, reason: "invalid-data" };
  if (!Array.isArray(DATA.nodes) || DATA.nodes.length !== 50) return { ok: false, reason: "invalid-data" };
  const ids = DATA.nodes.map((n) => n && n.id);
  if (new Set(ids).size !== 50 || ids.some((id) => typeof id !== "string" || !id)) {
    return { ok: false, reason: "invalid-data" };
  }
  const types = new Set(DATA.nodes.map((n) => n && n.type));
  if (!["FO", "MNO", "NameO", "RNO", "RefO", "RelO"].every((t) => types.has(t))) {
    return { ok: false, reason: "invalid-data" };
  }
  return { ok: true };
}
function bbRenderBootstrapFailure() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";
  app.className = "phase-unavailable";
  const wrap = document.createElement("div");
  wrap.className = "bb-unavailable";
  wrap.setAttribute("role", "alert");
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  wrap.innerHTML = `
    <div class="bb-unavailable-card">
      <h1>THE BLACK BIRD</h1>
      <p class="bb-unavailable-title">${esc(BB_UI_COPY.bootstrapUnavailableTitle)}</p>
      <p class="bb-unavailable-body">${esc(BB_UI_COPY.bootstrapUnavailableBody)}</p>
      <ul class="bb-unavailable-links">
        <li><a href="research/">Research</a></li>
        <li><a href="https://github.com/mozareeduge/the-black-bird/blob/main/CITATION.cff">Citation</a></li>
        <li><a href="https://github.com/mozareeduge/the-black-bird">Source repository</a></li>
      </ul>
    </div>`;
  app.appendChild(wrap);
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
// The poem has one spatial world. Desktop/mobile/Reader-open camera framing
// changes; the force topology underneath never does.
const WORLD = Object.freeze({ width: 1000, height: 760, cx: 500, cy: 380 });
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
  maxRouteEvents: 11,
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
    return sim.alpha();
  },
  fieldFitted() {
    return fitted;
  },
};
["IBM Plex Mono", "Crimson Pro", "Scheherazade New"].forEach((f) => {
  try {
    document.fonts.load(`12px "${f}"`);
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
async function setSurface(surface, opts = {}) {
  S.surface = surface;
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
  // Camera-pane geometry only (4.1) — the simulation's world center and
  // cluster centers are fixed and never redefined here.
  width = mapWrap.clientWidth;
  height = mapWrap.clientHeight;
  if (width < 10 || height < 10) return;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  sim.alpha(0.08).restart();
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
// active core, preserving their original polar angle; every other node is
// pulled weakly toward its captured home position. This is the sole
// authority for focus-driven node displacement — there is no render-only
// offset layer. All rendered bodies, labels, clearing geometry, pointer
// targeting, and camera bounds read d.x/d.y directly.
let focusTargets = null; // { coreId, targets: Map<id, {x,y}> } | null
let homeCaptured = false;
let focusHeatTimer = null;
function captureHomePositions() {
  simNodes.forEach((d) => {
    if (d.homeX == null) d.homeX = d.x;
    if (d.homeY == null) d.homeY = d.y;
  });
}
function rankFocusCandidates(focus) {
  const core = byId[focus.coreId];
  if (!core) return [];
  const canonicalParticipants = new Set(
    core.type === "RelO" ? DATA.relations[focus.coreId] || [] : [],
  );
  const baseNeighbors = baseAdj[focus.coreId] || new Set();
  const tiers = [[], [], [], []];
  focus.neighborIds.forEach((id) => {
    const n = byId[id];
    if (!n || !nodeVisible(id) || n.x == null || n.y == null) return;
    if (canonicalParticipants.has(id)) tiers[0].push(id);
    else if (baseNeighbors.has(id)) tiers[1].push(id);
    else if (n.type === "RNO" || n.type === "MNO") tiers[2].push(id);
    else tiers[3].push(id);
  });
  tiers[3].sort((a, b) => {
    const da = Math.hypot(byId[a].x - core.x, byId[a].y - core.y);
    const db = Math.hypot(byId[b].x - core.x, byId[b].y - core.y);
    return da - db;
  });
  return [...tiers[0], ...tiers[1], ...tiers[2], ...tiers[3]].slice(0, 14);
}
function heatFocusForce() {
  clearTimeout(focusHeatTimer);
  if (prefersReducedMotion()) {
    sim.alpha(Math.max(sim.alpha(), 0.05)).restart();
    return;
  }
  sim.alphaTarget(0.16).restart();
  focusHeatTimer = setTimeout(() => sim.alphaTarget(0), 420);
}
function clearLocalAperture() {
  focusTargets = null;
  heatFocusForce();
  updateGraphGeometry();
}
function applyLocalAperture(focus) {
  const core = focus && focus.coreId ? byId[focus.coreId] : null;
  if (!core || core.x == null || core.y == null) {
    focusTargets = null;
    heatFocusForce();
    updateGraphGeometry();
    return;
  }
  const chosenIds = rankFocusCandidates(focus);
  const targets = new Map();
  chosenIds.forEach((id, i) => {
    const d = byId[id];
    const r = i < 8 ? 74 : 112;
    const angle = Math.atan2(d.y - core.y, d.x - core.x);
    targets.set(id, { x: core.x + Math.cos(angle) * r, y: core.y + Math.sin(angle) * r });
  });
  focusTargets = { coreId: focus.coreId, targets };
  heatFocusForce();
  updateGraphGeometry();
}

// World coordinates only — never derived from viewport/pane size. Camera
// (zoom/pan) is the only thing that adapts to viewport; topology does not.
function clusterCenter(cluster) {
  return WORLD_CLUSTER_CENTERS[cluster] || [WORLD.cx, WORLD.cy];
}

function isAperture(d) {
  return d.id === "FO.BLACK_BIRD_FIELD";
}
function renderRole(d) {
  return isAperture(d) ? "APERTURE" : d.type;
}
function morphologyOf(d) {
  return isAperture(d) ? "aperture" : d.type.toLowerCase();
}
// Exact morphology metrics per 4.7: FO coreR=6.4; RNO coreR=6.0/outerR=11.5;
// MNO mean radius 7.4; RefO diamond 9x9 (half-diagonal outerR = 4.5*sqrt(2));
// RelO hollow ring r=8.5; aperture core r=9.5 / rim r=11.
function nodeMetrics(d) {
  if (isAperture(d))
    return {
      role: "aperture",
      coreR: 9.5,
      outerR: 11,
      hitR: 11 + 9,
      collideR: 11 + 9,
      labelOffset: 11 + 9,
      haloR: 11 + 6,
      focusR: 11 + 8,
    };
  switch (d.type) {
    case "RNO":
      return {
        role: "rno",
        coreR: 6.0,
        outerR: 11.5,
        hitR: 11.5 + 9,
        collideR: 11.5 + 9,
        labelOffset: 11.5 + 9,
        haloR: 11.5 + 6,
        focusR: 11.5 + 8,
      };
    case "MNO":
      return {
        role: "mno",
        coreR: 7.4,
        outerR: 7.4,
        hitR: 7.4 + 9,
        collideR: 7.4 + 9,
        labelOffset: 7.4 + 9,
        haloR: 7.4 + 6,
        focusR: 7.4 + 8,
      };
    case "NameO":
      return {
        role: "nameo",
        coreR: 0,
        outerR: 5,
        hitR: 5 + 9,
        collideR: 5 + 9,
        labelOffset: 5 + 9,
        haloR: 5 + 6,
        focusR: 5 + 8,
      };
    case "RefO":
      return {
        role: "refo",
        coreR: 4.5,
        outerR: 4.5 * Math.SQRT2,
        hitR: 4.5 * Math.SQRT2 + 9,
        collideR: 4.5 * Math.SQRT2 + 9,
        labelOffset: 4.5 * Math.SQRT2 + 9,
        haloR: 4.5 * Math.SQRT2 + 6,
        focusR: 4.5 * Math.SQRT2 + 8,
      };
    case "RelO":
      return {
        role: "relo",
        coreR: 8.5,
        outerR: 8.5,
        hitR: 8.5 + 9,
        collideR: 8.5 + 9,
        labelOffset: 8.5 + 9,
        haloR: 8.5 + 6,
        focusR: 8.5 + 8,
      };
    default:
      return {
        role: "fo",
        coreR: 6.4,
        outerR: 6.4,
        hitR: 6.4 + 9,
        collideR: 6.4 + 9,
        labelOffset: 6.4 + 9,
        haloR: 6.4 + 6,
        focusR: 6.4 + 8,
      };
  }
}
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
  const radius = opts.radius ?? (opts.touch ? 18 : 14);
  const t = S.transform;
  const focusIds = opts.focusIds || null;
  let best = null,
    bestDist = Infinity,
    bestContains = false,
    bestInFocus = false;
  simNodes.forEach((d) => {
    if (!nodeVisible(d.id) || d.x == null || d.y == null) return;
    const sx = t.applyX(d.x),
      sy = t.applyY(d.y);
    const dist = Math.hypot(sx - screenPoint[0], sy - screenPoint[1]);
    if (dist > radius) return;
    const contains = dist <= nodeMetrics(d).outerR * t.k;
    const inFocus = !!(focusIds && focusIds.has(d.id));
    const better =
      !best ||
      (contains && !bestContains) ||
      (contains === bestContains && inFocus && !bestInFocus) ||
      (contains === bestContains && inFocus === bestInFocus && dist < bestDist);
    if (better) {
      best = d;
      bestDist = dist;
      bestContains = contains;
      bestInFocus = inFocus;
    }
  });
  return best;
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
const allForceLinks = [...baseLinks, ...projectedLinks.map((e) => ({ ...e, forceOnly: true }))];

const sim = d3
  .forceSimulation(simNodes)
  .randomSource(seededUnit("bb-world-simulation"))
  .force(
    "link",
    d3
      .forceLink(allForceLinks)
      .id((d) => d.id)
      .distance((d) => (d.kind === "projected" ? 42 : 34))
      .strength((d) => (d.kind === "projected" ? 0.08 : 0.42)),
  )
  .force(
    "charge",
    d3
      .forceManyBody()
      .strength((d) =>
        d.id === "FO.BLACK_BIRD_FIELD"
          ? -380
          : d.type === "RelO"
            ? -18
            : d.type === "RefO"
              ? -35
              : -95,
      ),
  )
  .force(
    "collide",
    d3
      .forceCollide()
      .radius((d) => nodeMetrics(d).collideR)
      .strength(1)
      .iterations(3),
  )
  .force("cluster", (alpha) => {
    simNodes.forEach((d) => {
      const [cx, cy] = clusterCenter(d.cluster);
      d.vx += (cx - d.x) * 0.035 * alpha;
      d.vy += (cy - d.y) * 0.035 * alpha;
    });
  })
  // World center is fixed and viewport-independent — never reassigned on
  // resize/reader-open/Field-Read switch (4.1).
  .force("center", d3.forceCenter(WORLD.cx, WORLD.cy))
  // Constrained local opening (4.2): pulls the chosen focus-set nodes onto
  // two rings around the active core; pulls every other node weakly toward
  // its captured home position. No-op (home-restore only) when neutral.
  .force("focus", (alpha) => {
    const targets = focusTargets && focusTargets.targets;
    simNodes.forEach((d) => {
      const t = targets && targets.get(d.id);
      if (t) {
        d.vx += (t.x - d.x) * 0.18 * alpha;
        d.vy += (t.y - d.y) * 0.18 * alpha;
      } else if (d.homeX != null) {
        d.vx += (d.homeX - d.x) * 0.035 * alpha;
        d.vy += (d.homeY - d.y) * 0.035 * alpha;
      }
    });
  });

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
  .attr("class", (d) => "node " + d.type)
  .call(
    d3
      .drag()
      .on("start", (ev, d) => {
        if (!ev.active) sim.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (ev, d) => {
        d.fx = ev.x;
        d.fy = ev.y;
      })
      .on("end", (ev, d) => {
        if (!ev.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }),
  );
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

sim.on("tick", () => {
  updateGraphGeometry();
  // Capture each node's settled position once, on initial settlement only
  // (4.1) — this is the home the weak restoring force in the "focus" force
  // pulls toward whenever a node isn't part of the active local aperture.
  if (!homeCaptured && sim.alpha() < 0.03) {
    captureHomePositions();
    homeCaptured = true;
  }
});

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
function recomputeLabelPlacements() {
  const t = S.transform;
  const safe = computeFieldSafeRect();
  const visible = nodeSel
    .selectAll("text.node-label")
    .nodes()
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => ({ el, d: d3.select(el).datum() }))
    .filter(({ d }) => d && d.x != null && d.y != null);
  const focus = S.activeId ? buildFocusSet(S.activeId) : null;
  const focusIds = focus ? new Set(focus.ids) : null;
  const core = focus && focus.coreId ? byId[focus.coreId] : null;
  const relParticipants =
    core && core.type === "RelO" ? new Set(DATA.relations[focus.coreId] || []) : null;
  visible.sort((a, b) => {
    const ta = labelPriorityTier(
      a.d,
      a.d.id === S.activeId,
      !!(focusIds && focusIds.has(a.d.id)),
      !!(relParticipants && relParticipants.has(a.d.id)),
    );
    const tb = labelPriorityTier(
      b.d,
      b.d.id === S.activeId,
      !!(focusIds && focusIds.has(b.d.id)),
      !!(relParticipants && relParticipants.has(b.d.id)),
    );
    return ta - tb;
  });
  const accepted = [];
  visible.forEach(({ el, d }) => {
    let bbox;
    try {
      bbox = el.getBBox();
    } catch (e) {
      return;
    }
    const w = Math.max(1, bbox.width),
      h = Math.max(1, bbox.height);
    const gap = (nodeMetrics(d).outerR || 6) + 3;
    const lastChoice = labelPlacementChoice.get(d.id);
    const order = lastChoice
      ? [lastChoice, ...LABEL_CANDIDATES.map((c) => c.key).filter((k) => k !== lastChoice)]
      : LABEL_CANDIDATES.map((c) => c.key);
    let chosenKey = null,
      chosenRect = null,
      chosenOx = 0,
      chosenOy = 0,
      chosenAnchor = "middle";
    for (const key of order) {
      const cand = LABEL_CANDIDATES.find((c) => c.key === key);
      const ox = cand.dx * (gap + w / 2);
      const oy = cand.dyFactor * (gap + h * 0.5) + h * 0.35;
      const cx = d.x + ox,
        cy = d.y + oy;
      let rx1, rx2;
      if (cand.anchor === "middle") {
        rx1 = cx - w / 2;
        rx2 = cx + w / 2;
      } else if (cand.anchor === "start") {
        rx1 = cx;
        rx2 = cx + w;
      } else {
        rx1 = cx - w;
        rx2 = cx;
      }
      const ry1 = cy - h * 0.8,
        ry2 = cy + h * 0.3;
      const sx1 = t.applyX(rx1),
        sx2 = t.applyX(rx2),
        sy1 = t.applyY(ry1),
        sy2 = t.applyY(ry2);
      const rect = {
        x1: Math.min(sx1, sx2),
        x2: Math.max(sx1, sx2),
        y1: Math.min(sy1, sy2),
        y2: Math.max(sy1, sy2),
      };
      if (rect.x1 < safe.left || rect.x2 > safe.right || rect.y1 < safe.top || rect.y2 > safe.bottom)
        continue;
      if (accepted.some((r) => rectsOverlap(rect, r))) continue;
      chosenKey = key;
      chosenRect = rect;
      chosenOx = ox;
      chosenOy = oy;
      chosenAnchor = cand.anchor;
      break;
    }
    if (!chosenKey) {
      const cand = LABEL_CANDIDATES[0];
      chosenKey = cand.key;
      chosenOx = cand.dx * (gap + w / 2);
      chosenOy = cand.dyFactor * (gap + h * 0.5) + h * 0.35;
      chosenAnchor = cand.anchor;
      chosenRect = null; // not collision-free; don't block later labels on it
    }
    // Active and focus-member labels must stay fully inside the safe
    // rectangle (spec §4.6/§6) even when no candidate was collision-free —
    // clamp the chosen position back into bounds as a last resort.
    const isActive = d.id === S.activeId;
    if (isActive || !chosenRect) {
      const cx = d.x + chosenOx,
        cy = d.y + chosenOy;
      let rx1, rx2;
      if (chosenAnchor === "middle") {
        rx1 = cx - w / 2;
        rx2 = cx + w / 2;
      } else if (chosenAnchor === "start") {
        rx1 = cx;
        rx2 = cx + w;
      } else {
        rx1 = cx - w;
        rx2 = cx;
      }
      const ry1 = cy - h * 0.8,
        ry2 = cy + h * 0.3;
      let sx1 = t.applyX(rx1),
        sx2 = t.applyX(rx2),
        sy1 = t.applyY(ry1),
        sy2 = t.applyY(ry2);
      let shiftX = 0,
        shiftY = 0;
      if (sx1 < safe.left) shiftX = safe.left - sx1;
      else if (sx2 > safe.right) shiftX = safe.right - sx2;
      if (sy1 < safe.top) shiftY = safe.top - sy1;
      else if (sy2 > safe.bottom) shiftY = safe.bottom - sy2;
      if (shiftX || shiftY) {
        const k = Math.max(0.01, t.k);
        chosenOx += shiftX / k;
        chosenOy += shiftY / k;
      }
    }
    labelPlacementChoice.set(d.id, chosenKey);
    if (chosenRect) accepted.push(chosenRect);
    d3.select(el).attr("text-anchor", chosenAnchor).attr("x", chosenOx).attr("y", chosenOy);
  });
}

// ── Resize ─────────────────────────────────────────────────────────────────
let simInitialized = false;
function resize() {
  S.viewport = isMobile() ? "mobile" : "desktop";
  updatePhaseClass();
  if (isMobile() && S.surface === "read") {
    renderRoute();
    return;
  }
  measureGraph();
  if (!simInitialized) {
    sim.alpha(0.45).restart();
    simInitialized = true;
  } else {
    if (S.activeId) {
      applyLocalAperture(buildFocusSet(S.activeId));
      fitFocusFrame(buildFocusSet(S.activeId), { duration: 0 });
    } else fitVisibleField({ duration: 0 });
  }
  recomputeLabelPlacements();
}
window.addEventListener("resize", () => {
  resize();
  renderRoute();
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
// never window.innerWidth/innerHeight.
const CAMERA_SCALE_MIN = 0.55,
  CAMERA_SCALE_MAX = 2.4;
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
  const right = Math.max(marginX + 1, width - marginX);
  const bottom = Math.max(top + 1, height - marginBottom);
  return {
    left: marginX,
    top,
    right,
    bottom,
    width: Math.max(1, right - marginX),
    height: Math.max(1, bottom - top),
  };
}
function computeNodeEnvelope(ids, padNode) {
  const items = ids
    .map((id) => byId[id])
    .filter((d) => d && d.x != null && d.y != null && nodeVisible(d.id));
  if (!items.length) return null;
  return getNodeBounds(items, padNode ?? (isMobile() ? 30 : 40));
}
function kForOccupancy(envelope, safe, ratio) {
  const limiting = Math.max(envelope.width / safe.width, envelope.height / safe.height) || 1;
  return Math.max(CAMERA_SCALE_MIN, Math.min(CAMERA_SCALE_MAX, ratio / limiting));
}
function safeRectCenter(safe, opts = {}) {
  const lift = opts.liftForReader && S.readerOpen && !isMobile() ? 0.04 : 0;
  return {
    x: (safe.left + safe.right) / 2,
    y: (safe.top + safe.bottom) / 2 - lift * safe.height,
  };
}
function envelopeOutsideFraction(envelope, safe, transform) {
  const x1 = transform.applyX(envelope.minX),
    x2 = transform.applyX(envelope.maxX);
  const y1 = transform.applyY(envelope.minY),
    y2 = transform.applyY(envelope.maxY);
  const ex1 = Math.min(x1, x2),
    ex2 = Math.max(x1, x2);
  const ey1 = Math.min(y1, y2),
    ey2 = Math.max(y1, y2);
  const areaTotal = Math.max(1, (ex2 - ex1) * (ey2 - ey1));
  const ix1 = Math.max(ex1, safe.left),
    ix2 = Math.min(ex2, safe.right);
  const iy1 = Math.max(ey1, safe.top),
    iy2 = Math.min(ey2, safe.bottom);
  const areaInside = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  return 1 - areaInside / areaTotal;
}
function minimalPanForEnvelope(envelope, safe, transform, margin = 12) {
  const k = transform.k;
  let dx = 0,
    dy = 0;
  const sx1 = transform.x + envelope.minX * k,
    sx2 = transform.x + envelope.maxX * k;
  const sy1 = transform.y + envelope.minY * k,
    sy2 = transform.y + envelope.maxY * k;
  if (sx1 < safe.left + margin) dx = safe.left + margin - sx1;
  else if (sx2 > safe.right - margin) dx = safe.right - margin - sx2;
  if (sy1 < safe.top + margin) dy = safe.top + margin - sy1;
  else if (sy2 > safe.bottom - margin) dy = safe.bottom - margin - sy2;
  return d3.zoomIdentity.translate(transform.x + dx, transform.y + dy).scale(k);
}
function fitEnvelopeToOccupancy(envelope, safe, ratio, opts = {}) {
  const k = kForOccupancy(envelope, safe, ratio);
  const center = safeRectCenter(safe, { liftForReader: true });
  animateCamera(
    d3.zoomIdentity.translate(center.x - k * envelope.cx, center.y - k * envelope.cy).scale(k),
    { duration: opts.duration ?? 760 },
  );
}
// Later selections: preserve zoom and pan minimally; only recompute scale
// when more than 20% of the envelope has drifted outside the safe rect.
function ensureEnvelopeVisible(envelope, opts = {}) {
  if (!envelope) return;
  const safe = computeFieldSafeRect();
  const current = S.transform || d3.zoomIdentity;
  const outside = envelopeOutsideFraction(envelope, safe, current);
  if (outside > (opts.refitThreshold ?? 0.2)) {
    fitEnvelopeToOccupancy(envelope, safe, opts.occupancy ?? 0.7, {
      duration: opts.duration ?? 760,
    });
    return;
  }
  const t = minimalPanForEnvelope(envelope, safe, current);
  if (Math.abs(t.x - current.x) > 0.5 || Math.abs(t.y - current.y) > 0.5) {
    animateCamera(t, { duration: Math.min(opts.duration ?? 420, 420) });
  }
}
// Camera and focus-force motion must not compete: wait for the local
// aperture to have mostly settled (or a short safety timeout) before the
// pane starts panning/zooming.
async function waitFocusForceSettled(timeoutMs = 480) {
  if (prefersReducedMotion()) return;
  await nextFrame();
  const start = performance.now();
  while (sim.alpha() >= 0.12 && performance.now() - start < timeoutMs) {
    await nextFrame();
  }
}
function fitFocusFrame(focus, opts = {}) {
  const envelope = computeNodeEnvelope(focus.ids, isMobile() ? 30 : 44);
  if (!envelope || width < 10 || height < 10) return;
  const safe = computeFieldSafeRect();
  if (opts.fromNeutral) {
    fitEnvelopeToOccupancy(envelope, safe, 0.7, { duration: opts.duration ?? 760 });
    return;
  }
  ensureEnvelopeVisible(envelope, { duration: opts.duration ?? 760, occupancy: 0.7 });
}
function fitWholeField(opts = {}) {
  const visible = simNodes.filter((d) => nodeVisible(d.id));
  if (!visible.length || width < 10 || height < 10) return;
  const safe = computeFieldSafeRect();
  const envelope = getNodeBounds(visible, isMobile() ? 30 : 40);
  fitEnvelopeToOccupancy(envelope, safe, 0.8, { duration: opts.duration ?? 850 });
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
  S.routeEvents.push(ev);
  if (S.routeEvents.length > S.maxRouteEvents)
    S.routeEvents = S.routeEvents.slice(-S.maxRouteEvents);
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
      focusObject(el.dataset.id, { source: "route", routePolicy: "replay", tracePolicy: "none" });
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
        `<div class="route-row" data-id="${ev.id}"><div class="route-row-index">${String(i + 1).padStart(2, "0")}</div><div class="route-row-label">${esc(labelOf(ev.id))}</div></div>`,
    )
    .join("");
  box.querySelectorAll(".route-row").forEach(
    (row) =>
      (row.onclick = () => {
        focusObject(row.dataset.id, {
          source: "route-drawer",
          routePolicy: "replay",
          tracePolicy: "none",
        });
        closeAllDrawers();
      }),
  );
}
function updateRouteLiveRegion() {
  const el = document.getElementById("routeLive");
  if (!el) return;
  const labels = S.routeEvents.map((ev) => ev.label).join(", ");
  el.textContent = labels ? `Route: ${labels}.` : "Route is empty.";
}

// ── Route memory ────────────────────────────────────────────────────────────
function routeStats() {
  const recent = S.routeEvents.slice(-S.maxRouteEvents);
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
  const events = S.routeEvents.slice(-S.maxRouteEvents);
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
  updatePhaseClass();
  S.activeId = id;
  S.activeEdge = null;
  S.activeRelos = [];
  S.previewTarget = null;
  closeAllDrawers();
  hidePreview();
  updateRovingTabindex(id);
  if (routePolicy === "append" && !isSameId) {
    registerRouteEvent(id, { from: previousId, source });
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
  S.phase = "field";
  S.surface = "field";
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
        S.viewOptions[btn.dataset.view] = !S.viewOptions[btn.dataset.view];
        renderFieldViewControls();
        updateVisibility();
        if (S.activeId) fitFocusFrame(buildFocusSet(S.activeId));
        else fitVisibleField();
      }),
  );
}
function setObjectGroup(type, value) {
  S.objectGroups[type] = value;
  renderFieldViewControls();
  updateVisibility();
  if (S.activeId) fitFocusFrame(buildFocusSet(S.activeId));
  else fitVisibleField();
  if (S.activeId && !nodeVisible(S.activeId)) returnToField({ reason: "active-hidden-by-filter" });
}
function renderObjectRows(container, filter = "", typeFilter = null) {
  const q = filter.toLowerCase();
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
        focusObject(el.dataset.open, { source: "object-drawer" });
        closeAllDrawers();
      }),
  );
  container.querySelectorAll("[data-eye]").forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.eye;
        S.objectVisibility[id] = S.objectVisibility[id] === false;
        renderFieldViewControls();
        updateVisibility();
      }),
  );
  container.querySelectorAll("[data-solo]").forEach(
    (el) =>
      (el.onclick = async () => {
        const id = el.dataset.solo;
        S.soloSet = computeSoloSet(id);
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
  renderFieldViewControls();
  updateVisibility();
  closeAllDrawers();
  returnToField({ source: "restore-field" });
};
document.getElementById("showAllObjects").onclick = () => {
  S.objectVisibility = { ...defaultVisibility };
  S.soloSet = null;
  renderObjectLists();
  updateVisibility();
  closeAllDrawers();
  returnToField({ source: "show-all" });
};
// Two explicit, separate public controls (4.11): Clear Route never touches
// field trace; Clear field trace never touches Route.
document.getElementById("clearRouteDrawer").onclick = () => {
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
  const th = document.getElementById("threshold");
  beginGraphHandoff();
  th.classList.add("leaving");
  await sleep(prefersReducedMotion() ? 0 : 520);
  th.style.display = "none";
  if (opts.skipOnboarding) {
    S.phase = "focused";
    S.surface = "field";
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
sim.on("end", () => {
  if (!fitted && !(isMobile() && S.surface === "read")) {
    fitted = true;
    fitVisibleField();
  }
  recomputeLabelPlacements();
});
if (typeof document.fonts !== "undefined") {
  document.fonts.ready.then(() => recomputeLabelPlacements()).catch(() => {});
}
setTimeout(() => {
  if (!fitted && !(isMobile() && S.surface === "read")) {
    fitted = true;
    fitVisibleField();
  }
}, 5000);
