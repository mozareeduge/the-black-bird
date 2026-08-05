# Testing — full-system recomposition candidate (v3)

This document describes how the v3 full-system field recomposition
candidate (executed against a drop-in execution-loop authority package,
base `main@5972b2b2e4a70b2b2f457b6345f84894af95ef2a`) is validated, and what
a reviewer should read before accepting it.

## Current architecture harness (T06–T31)

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
  reflow/status/reduced-motion checks. Two real findings from an earlier
  round (`nested-interactive` on `#graphSvg`, `aria-dialog-name` on the
  drawers) were fixed at the source once `src/**` access was available
  (`#graphSvg` is now `role="group"`; every drawer is `aria-labelledby` its
  visible heading) — see `.bb-control/CONFLICT.json`'s `T31-redo` entry. One
  real but intermittent finding remains excluded by name,
  `color-contrast` on "cold" node labels: T04's authored warm/cold visual
  system deliberately lets unfocused labels dim as part of the intended
  recession effect, and whether that should have a hard contrast floor is
  an artistic call for human review, not a bug this suite silently patches.
- `npm run test:cross-browser` — the same semantic smoke suite
  (`tests/cross-browser/smoke.spec.js`) against Chromium/Firefox/WebKit
  projects declared in `playwright.config.cjs`. Verified green on Chromium
  in every sandboxed session so far; Firefox/WebKit require browser
  binaries this session's environment does not provide and is instructed
  not to fetch — a disclosed environment limitation, not a code defect (see
  `.bb-control/CONFLICT.json`).
- `npm run test:coverage` — `scripts/generate-coverage.mjs` generates every
  declared combinatorial obligation (three-way/pairwise dimension
  combinations, ordered action pairs, named critical triples, canonical-type
  and boundary enumerations, recovery-scenario list) and cross-references
  all 115 declared product scenarios to real test/evidence, reporting
  covered/gap status with a reason for every gap — no silent exclusions.
- `.github/workflows/final-candidate-gate.yml` — a dedicated CI workflow
  (distinct from `verify.yml`'s build/test check and
  `black-bird-validation.yml`'s full-suite check) that regenerates
  candidate-bound evidence fresh on GitHub's own runners
  (`npm run evidence:generate`) and gates its structural integrity
  (`scripts/ci-evidence-gate.mjs`: hash/dimension/duration/duplicate-bytes
  checks, human-review left pending) on every push/PR, uploading
  `candidate-evidence/**` as a build artifact.

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
- `npm run test:full` — runs the legacy released-behavior suites above in
  sequence (`test:legacy` through `test:docs`); does not include
  `test:unit`/`test:e2e`/`test:a11y`/`test:cross-browser`/`test:coverage`
  from the architecture harness, which are run separately (all of the
  above, run individually, are clean; see `.bb-control/CONFLICT.json` for
  the one standing, disclosed `test:legacy` exception while the Claude
  Code control-plane overlay is active in a development session).

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

## What changed, mechanically (T06–T31)

- **Extracted, independently-tested architecture (T06–T22), deliberately
  not yet swapped in.** The 34-module layered tree under `src/state/`,
  `src/domain/`, `src/layout/`, `src/application/`, `src/presentation/`,
  `src/controllers/`, `src/accessibility/` (dispatcher, pure reducer,
  transaction controller, timer registry, every domain selector, camera,
  the real cost-scored eight-candidate label solver, every renderer, every
  controller) is real, complete, and covered by the 121 `test:unit` cases
  plus dedicated fixtures read from `tests/contracts/*.json`. It is proven
  correct in isolation, not yet the live code path: `scripts/build.mjs`
  inlines only `src/app.js` (plus canonical `DATA`) into `index.html` --
  `src/app.js` has zero imports from the layered tree. This was the
  decided strategy for this round (see
  `BLACK_BIRD_DECISIONS_CHANGELOG.md`'s 2026-08-04 entry): prove every new
  module correct before risking a live-behavior change, and change
  `src/app.js` itself only for specific, disclosed, evidence-bound
  defects -- not a partial or accidental integration. A full swap-in is a
  distinct, higher-risk future round, out of this one's scope.
- **Real, targeted live-app fixes landed directly in `src/app.js` /
  `src/index.template.html`** where a genuine defect was found: the
  `.sheet` pointer-events bug that let a closed mobile sheet intercept
  desktop clicks; destructive Route-history truncation removed; the
  Playwright click helper's forced-click fallback retired once real
  gesture arbitration made it provably unnecessary (verified: zero
  remaining forced-click options anywhere in `tests/bb-helpers.cjs`,
  confirmed by the shared `source_policy_gate.py` scanner passing clean);
  `#graphSvg`'s landmark role corrected from `img` to `group` (an image
  landmark should not contain focusable descendants; its roving-tabindex
  node children are real controls); the three drawer dialogs
  (`fieldViewDrawer`, `objectDrawer`, `routeDrawer`) now carry
  `aria-labelledby` pointing at their existing visible heading text
  (`aboutPanel` already had its own `aria-label`).
- **Accessibility, coverage, and CI completed (T27–T31):** contract-driven
  test fixtures; generated `COV-CRITICAL-TRIPLES`/`COV-ORDERED-ACTION-PAIRS`
  scenario coverage (115/115 product scenarios accounted for, 75 covered +
  40 explicitly-reasoned gaps, zero silent exclusions); real axe-core
  scanning at five app states; a dedicated `Final Candidate Gate` CI
  workflow that regenerates and gates evidence on every push.

## Known limits

- **Label placement: 8 candidates, first-valid rather than
  cost-minimizing selection, in the live app.** `recomputeLabelPlacements()`
  in `src/app.js` (spec §4.6) does try all 8 directions (four
  orthogonal + four diagonal), but accepts the first collision-free
  candidate rather than scoring all valid candidates and picking the
  cheapest (`src/layout/label-solver.js`, in the not-yet-integrated
  layered tree, does implement true cost-scoring). In the densest
  canonical RelO cluster this leaves a small, timing-dependent number of
  residual overlaps (observed 1-2 across repeated runs) — bounded and
  asserted by `tests/black-bird-world-camera.spec.js`, not a full "zero
  overlaps everywhere" guarantee. Ordinary (non-densest) clusters are
  collision-free.
- **One real, intermittent WCAG AA color-contrast finding**, disclosed
  above, in the a11y bullet, and in `.bb-control/CONFLICT.json` — an
  artistic-recession-effect question for human review, not silently
  patched.
- **Cross-browser Firefox/WebKit** verified only on Chromium in every
  sandboxed session run so far, for the environment reasons described
  above; the same spec runs unmodified wherever those binaries are
  present.
- **This session's own direct GitHub API / `gh` CLI access is blocked**
  at the session level (confirmed by installing `gh` and reproducing an
  explicit 403), independent of anything in this repository; see
  `.bb-control/BLOCKER.json`. All real CI (`Verify`,
  `Black Bird Candidate Validation`, `Final Candidate Gate`) is green at
  the frozen candidate SHA regardless, verified via the GitHub MCP tools
  this session does have working access through.

## Candidate-bound review

Real, candidate-bound evidence (per-scenario screenshots composited into
contact sheets, 8–20s motion recordings, state/event/geometry/design/
accessibility/coverage-report/build-manifest machine artifacts) is
generated fresh from the exact frozen candidate SHA by
`npm run evidence:generate`, gated locally by
`.bb-authority/scripts/candidate_gate.py` and in CI by the dedicated
`Final Candidate Gate` workflow, and delivered as a ZIP alongside the PR
(gitignored, not committed to the tree). Zero NaN/Infinity SVG geometry
has been observed across any capture. `candidate-evidence/human-review.json`
leaves all 10 review dimensions `pending_user_review` — no agent
self-attests artistic acceptance. This candidate does not self-attest
`SUBJECTIVE_ACCEPTED` or `RELEASE_AUTHORIZED`, and the PR remains a draft.
