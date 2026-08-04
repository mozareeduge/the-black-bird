# Testing — full-system recomposition candidate (v3)

This document describes how the v3 full-system field recomposition
candidate (executed against a drop-in execution-loop authority package,
base `main@5972b2b2e4a70b2b2f457b6345f84894af95ef2a`) is validated, and what
a reviewer should read before accepting it.

## Current architecture harness (T06–T28)

The recomposition extracted the original monolithic `index.html` script
into a layered `src/` tree (`state/`, `domain/`, `layout/`, `application/`,
`presentation/`, `controllers/`, `accessibility/`, `styles/`), tested
independently of the still-live application:

- `npm run test:unit` — `node --test` over `tests/unit/*.test.js` (121
  tests): reducer/invariants/selectors, Route/trace/Solo domain logic,
  camera/focus-target/label-solver/pointer-ownership geometry, transaction
  and timer-registry reconciliation. Expected values are read from
  `tests/contracts/*.json`, committed copies of the authority's state/
  command/algorithm/visual-token contracts, rather than hand-copied
  literals — a contract change becomes a visible fixture diff, not a
  silently stale test.
- `npm run test:e2e` — Playwright, Chromium, real (unforced) actionability
  only, over `tests/e2e/**` and `tests/generated/**`: bootstrap failure
  surfaces, field rendering, Reader, Route/trace, View/Index/Solo, modals/
  About, tooltip/keyboard/status, desktop composition, mobile chambers,
  environmental resilience, reduced motion, plus the generated
  `COV-CRITICAL-TRIPLES`/`COV-ORDERED-ACTION-PAIRS` coverage specs.
- `npm run test:a11y` — Playwright + axe-core over `tests/a11y/**`: automated
  scans at five app states plus explicit focus/modal/tooltip/target-size/
  reflow/status/reduced-motion checks. Two real, disclosed findings
  (`nested-interactive`, `aria-dialog-name`) are excluded by name pending a
  future round with `src/**` access; see `.bb-control/CONFLICT.json`.
- `npm run test:cross-browser` — the same semantic smoke suite
  (`tests/cross-browser/smoke.spec.js`) against Chromium/Firefox/WebKit
  projects declared in `playwright.config.cjs`.
- `npm run test:coverage` — `scripts/generate-coverage.mjs` generates every
  declared combinatorial obligation (three-way/pairwise dimension
  combinations, ordered action pairs, named critical triples, canonical-type
  and boundary enumerations, recovery-scenario list) and cross-references
  all 115 declared product scenarios to real test/evidence, reporting
  covered/gap status with a reason for every gap — no silent exclusions.

## Legacy released-behavior harness

- `npm run test:legacy` — repository is free of active Claude control-plane files.
- `npm run test:traceability` — supplied traceability rows are present.
- `npm run test:data` — canonical `DATA` block is untouched (50 nodes, six
  types, opaque RelO labels).
- `npm run test:baseline` — released behavior contract still holds
  (onboarding, mobile Field/Read separation, About purity, Solo/route
  geometry, MNO inline spans).
- `npm run test:route-solo` — Route/Solo state-transaction contract: exact
  onboarding/committed-sequence Route events, replay/Solo/View/About/
  same-id all add zero Route events, `computeSoloSet()` for both RelO and
  object cores.
- `npm run test:world-camera` — stable-world contract: `clusterCenter()` is
  viewport-invariant, opening the Reader doesn't move world topology,
  active body stays inside the safe rectangle at 1440×960/1280×800/1024×640,
  neutral/focused occupancy ratios.
- `npm run test:accessibility` — roving tabindex (exactly one visible
  `tabindex=0` node, tracking the active object), arrow-key navigation,
  Enter commits the keyboard-focused node, `aria-pressed` on View toggles,
  modal focus containment (background `inert`, focus enters/returns) for
  drawers and About.
- `npm run test:mobile` — 390×844 vs 430×932 occupancy parity, Field→Read→
  Field state preservation, active-body containment at 390×844.
- `npm run test:design` — the decided visual-system contract: canonical
  morphology and aperture role, warm/cold focus, one masked continuous
  relation clearing (RelO clearing; no member circles/spokes), vendored
  fonts with no external font requests, reduced-motion state, absence of
  any persistent map readout, bounded performance counters.
- `npm run test:visual` — generates the named candidate evidence matrix
  (screenshots + state + design snapshot per scenario) into
  `test-results/black-bird-evidence/`.
- `npm run test:docs` — this file and the changelog entry exist and mention
  the required candidate-bound terms.
- `npm run test:full` — runs all of the above in sequence. Current count:
  42 checks across 10 suites, run twice consecutively (clean both times)
  after every commit on this branch.

## What changed, mechanically (T00–T05)

- **Route/Solo state transaction (T01):** `commitFocus(id, opts)` is the
  single function permitted to mutate `S.activeId`, append a Route event,
  or trigger wear/afterglow recording, gated by explicit `routePolicy`
  (`append`/`replay`/`none`) and `tracePolicy` (`record`/`none`) flags set
  by each call site. `computeSoloSet()` now special-cases `RelO` (RelO Solo
  = RelO + canonical participants, not just the RelO alone).
- **Stable world + real focus force + safe-rect camera (T02):** frozen
  `WORLD`/`WORLD_CLUSTER_CENTERS` constants; `clusterCenter()` no longer
  reads viewport size. The render-only `apDx/apDy` local-aperture offset is
  replaced by a real simulation "focus" force (ranked candidate selection,
  two-ring placement preserving polar angle, weak home-restore for
  everything else); `nodeX`/`nodeY` read `d.x`/`d.y` directly everywhere.
  `computeFieldSafeRect()`/`computeNodeEnvelope()`/`ensureEnvelopeVisible()`/
  `fitWholeField()` replace the old hardcoded 0.56-of-viewport-height camera
  bias with safe-rect-relative occupancy targeting.
- **Overlays, labels, pointer resolution (T03, partial):** `#bbFocusReadout`
  removed entirely — Reader metadata is the only persistent record; label
  font-size is `desiredScreenPx / k` with no graph-unit floor (fixes labels
  growing with zoom) plus 8-tier semantic density budgets;
  `recomputeLabelPlacements()` adds a real 4-candidate (below/above/right/
  left) collision-rejection placement pass, run only at the spec's listed
  trigger points (font load, sim settle, focus commit, zoom end, resize,
  View/Solo/Field-restoration changes) rather than every frame;
  `resolveNearestVisibleNode()` gives deterministic screen-space click
  targeting instead of trusting whatever DOM element the browser reports as
  the event target.
- **Clearing, lighting, morphology, temporal material (T04, complete):**
  RelO clearing is one masked continuous field (SVG mask + blur + alpha
  threshold over hidden kernel circles) with no visible member pool or
  spokes; Route and wear are now visually distinct (neutral bone vs.
  amber); ordinary-focus opacity/edge numbers match the spec's bands; the
  persistent amber "selected" ring is gone in favor of a screen-stable warm
  penumbra plus a CSS `:focus-visible` outline for keyboard users;
  morphology radii match spec exactly; afterglow is a soft radial residue
  (was a ring) and now also appears on mobile (was previously skipped
  there entirely).
- **Accessibility (T05, partial):** roving tabindex (was: all 50 nodes
  independently tabbable) with directional arrow-key navigation that
  prefers direct graph neighbors; `aria-pressed` on View toggles; drawers
  and About are now genuinely modal (background `inert`, focus moves in on
  open and returns to the invoker on close, `aria-modal="true"` asserted
  only because the background is actually inert while it's set).

## Known limits

- **Label placement uses 4 candidates, not the full 8, and first-valid
  rather than cost-minimizing selection.** `recomputeLabelPlacements()`
  (spec §4.6) tries below/above/right/left (not the four diagonals too)
  and accepts the first collision-free candidate rather than scoring all
  valid candidates and picking the cheapest. In the densest canonical RelO
  cluster this leaves a small, timing-dependent number of residual overlaps
  (observed 1-2 across repeated runs) — bounded and asserted by
  `tests/black-bird-world-camera.spec.js`, not a full "zero overlaps
  everywhere" guarantee. Ordinary (non-densest) clusters are collision-free.
- **Tooltip lifecycle/ARIA association (spec §4.13) not yet repaired.**
  `#microPreview` remains the sole transient desktop tooltip, but its
  collision positioning, `aria-describedby` association, and "never opens
  for the already-active object" guarantees have not been independently
  re-verified against the spec in this round.
- **Target-size (24×24 CSS px) audit and a full reduced-motion pass across
  every JS/CSS motion path** have not been independently swept; individual
  new motion paths added in T04/T05 (penumbra, afterglow, clearing blur,
  modal transitions) do honor `prefers-reduced-motion`, but no systematic
  audit of the whole surface has been done.
- **No motion (video) evidence yet.** The five required 8–15s motion
  recordings from spec §7 have not been captured; only static screenshots
  and geometry/state dumps exist so far (see the evidence package attached
  to the PR).

## Candidate-bound review

A 22-scenario static evidence package (screenshots + geometry/state JSON
per scenario, `evidence-manifest.json`, `EVIDENCE-NOTES.md`) was generated
fresh from candidate commit `1ac66d0813b26896893b48c4fd0d351b71414e64` and
delivered alongside the PR; it is not committed to the repository. Zero
NaN/Infinity SVG geometry was observed across any of the 22 captures.
Motion evidence is a disclosed gap (see EVIDENCE-NOTES.md and "Known
limits" above). Acceptance is GPT-or-user only; this candidate does not
self-attest `SUBJECTIVE_ACCEPTED` or `RELEASE_AUTHORIZED`, and the PR
remains a draft.
