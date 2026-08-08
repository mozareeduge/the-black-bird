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
  environmental resilience, reduced motion, responsive/visual closure
  (`responsive-visual-closure.spec.js` — F08/R6, below), plus the generated
  `COV-CRITICAL-TRIPLES`/`COV-ORDERED-ACTION-PAIRS` coverage specs.
- `npm run test:a11y` — Playwright + axe-core over `tests/a11y/**`: automated
  scans at five app states plus explicit focus/modal/tooltip/target-size/
  reflow/status/reduced-motion checks, with zero rule exclusions. Three real
  findings from earlier rounds were fixed at the source, not excluded:
  `nested-interactive` on `#graphSvg` and `aria-dialog-name` on the drawers
  once `src/**` access was available (`#graphSvg` is now `role="group"`;
  every drawer is `aria-labelledby` its visible heading — see
  `.bb-control/CONFLICT.json`'s `T31-redo` entry), and `color-contrast` on
  "cold" node label text (F07/R5): the warm/cold recession effect previously
  dimmed a node's entire `<g>` including its label text via SVG group
  opacity, which could push label contrast below 4.5:1. The fix
  (`src/app.js`'s `applyWarmColdStyling`/`applyClearingStyling`/
  `transitionToFieldLighting`) now applies recession opacity only to the
  node's visual body/ring/halo (everything but `.node-label`); the label
  itself always renders at full opacity, and coldness is instead conveyed by
  a hue shift (`g.node[data-bb-light="cold-rest"] .node-label` ->
  `var(--bb-cold-text)`, `src/index.template.html`) chosen to clear 4.5:1
  against the field background, plus the pre-existing tiered size/weight/
  blur/density cues on the body. The intended recession effect survives; the
  hard-contrast question is no longer live because text opacity is no
  longer the mechanism that conveys it.
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
  (`npm run evidence:generate`), from the exact PR head SHA (checkout `ref`
  pinned explicitly, F10/R7 — see below), and gates its structural
  integrity (`scripts/ci-evidence-gate.mjs`: hash/dimension/duration/
  duplicate-bytes/completeness checks, human-review left pending) on every
  push/PR, uploading `candidate-evidence/**` as a build artifact.
- **CI: three distinct verification passes (F10/R7).** GitHub's default
  `pull_request` checkout is a synthetic merge commit (the PR head merged
  onto the current base), not the literal branch-head SHA -- a legitimate,
  separate question ("does this still merge and pass on top of main"), kept
  intentionally in `verify.yml` and `black-bird-validation.yml`. It is never
  a substitute for proving the exact candidate SHA is green
  (`final-closure-contract.json`'s evidence_truth invariant: "Synthetic
  PR-merge verification is recorded separately and never substituted for
  the candidate SHA"). `.github/workflows/exact-head-verify.yml` is the
  dedicated exact-SHA check: it pins `ref:
  github.event.pull_request.head.sha` explicitly and runs the full local
  suite against that literal commit. `.github/workflows/
  cross-browser-matrix.yml` installs and runs Chromium, Firefox, and
  WebKit (`final-closure-contract.json`'s `browser_matrix`) against the
  same exact-head SHA -- closing the gap this session's own sandboxed
  environment discloses it cannot close locally (Firefox/WebKit binaries
  unavailable to fetch).
- **Evidence identity: one committed, declarative source of truth
  (F09/R7).** `tests/contracts/evidence-plan.json` names all 44 primary
  artifacts `final-closure-contract.json`'s `required_evidence_ids`/
  `required_primary_entry_count` declare (30 individually-named static
  captures, 7 motion recordings, 7 machine reports), replacing an untracked
  `.bb-authority/contracts/evidence-plan.json` overlay that `scripts/
  generate-evidence.mjs` used to read when present, falling back to a
  separately hand-maintained, easy-to-drift duplicate list when absent (the
  normal case in a fresh checkout). `scripts/generate-evidence.mjs`'s
  `manifest.json` now lists all 44 as primary, gate-required `entries[]`;
  the 3 grouped contact-sheet composites move to `supplementary_evidence[]`
  (`final-closure-contract.json` itself: "Contact sheets are supplementary
  review aids only" -- they had it backwards). `scripts/ci-evidence-gate
  .mjs` now asserts `entries[]` is exactly the plan's 44 ids, no fewer and
  no more, in addition to its existing per-entry hash/dimension/duration/
  duplicate-bytes checks.

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

## F00–F12: continuation round (swap-in complete through F07)

A second round, executed against a drop-in continuation authority package on
top of the T00–T31 candidate above, and then a head-driver correction package
(v4) on top of that, is underway on this branch. Its explicit goal is the
"full swap-in" T00–T31 called "a distinct, higher-risk future round, out of
this one's scope." Every module below is wired into `src/app.js`, the sole
production entry point (`scripts/build.mjs` inlines only `src/app.js` plus
canonical `DATA` into `index.html`), and reachable per
`scripts/check-production-ownership.mjs` (40/40 required modules). Each swap
was verified by the full suite (`test:unit`/`test:e2e`/`test:a11y`/
`test:full`) plus the closure gates (`node scripts/check-production-ownership.mjs`
/ `check-semantic-duplication.mjs` / `check-contract-coherence.mjs`) before
commit:

- **Semantic mutation authority (F02/F03):** `src/state/reducer.js` +
  `src/application/dispatcher.js` + `transaction-controller.js` are the real
  validate → reduce → transact authority `dispatch()` calls for every
  semantic command; the legacy parallel semantic store was eliminated (R1) —
  `checkSemanticDuplication.mjs` asserts no duplicate authority remains in
  `src/app.js`.
- **Geometry authority (F02/F04):** `authored-world.js`, `focus-targets.js`,
  `camera.js`, `label-solver.js`, and `pointer-ownership.js` are wired in as
  the real authority for world coordinates, focus-force targeting, camera
  framing, label placement, and pointer-to-node resolution; re-proven on the
  fully-wired production path (R4).
- **Presentation and controllers (F05, complete):** all nine presentation
  renderers (`bootstrap-`, `field-`, `status-`, `index-`, `modal-`, `reader-`,
  `route-`, `solo-`, `tooltip-`, `trace-`, `view-renderer.js`) and all seven
  `src/controllers/*.js` modules (lifecycle, navigation, environment, modal,
  keyboard, pointer, external-link) are wired into `src/app.js` (R3),
  strengthening several modules in the process rather than importing them as
  stubs: `reader-renderer.js` gained a dedicated render-generation counter
  decoupled from the command-dispatch transaction system;
  `keyboard-controller.js` gained `preventDefault` on Enter/Space and an
  optional directional-handling gate; `pointer-controller.js` gained an
  `onCommit` callback and a `toPoint` coordinate converter so pointer
  ownership resolves in the same SVG-local space as node geometry.
- **Scenario coverage (F06):** all 115 declared product scenarios are
  accounted for (covered or explicitly reasoned) with zero silent gaps,
  re-verified on the fully-wired production path (R4).
- **Accessibility (F07, complete, zero exclusions):** the one previously
  excluded finding, `color-contrast` on "cold" node label text, is fixed at
  the source rather than excluded (R5) — see the `test:a11y` bullet above for
  the mechanism. `tests/a11y/axe.spec.js` carries no rule-ID exclusion list;
  every axe finding at serious/critical severity fails the suite.
- **Responsive/visual closure (F08, complete):** the target contract's "no
  sheet leak, label collision, clipped required content, or chrome/focus
  conflict" bar was verified directly against the live, fully-wired page
  (R6) — a 1024x640 "overlay leak" and mobile dense-cluster label collisions
  had been named as defects to reproduce and repair, but neither reproduced:
  drawers/About settle fully inside the 1024x640 viewport once their
  320ms open transition completes (an initial reproduction attempt that
  measured mid-transition was itself the artifact, not a real defect), and
  node-label overlap count is 0 across all three dense RelO clusters at both
  390x844 and 430x932 (the label-solver/authored-world work landed since the
  older, now-stale collision report was written evidently already resolved
  it). 320px reflow, a 200%-zoom-equivalent viewport, landscape mobile, and
  forced-colors mode were also verified with no horizontal overflow and no
  chrome clipped out of frame. `tests/e2e/responsive-visual-closure.spec.js`
  makes all of this permanent, durable coverage against `index.html` itself
  rather than an informal one-time check.
- **Evidence and CI truth (F09/F10, complete):** `scripts/generate-evidence
  .mjs` and `scripts/ci-evidence-gate.mjs` now share one committed,
  declarative source for evidence identity (`tests/contracts/evidence-plan
  .json`) instead of an untracked overlay plus a hand-maintained fallback
  duplicate, and the manifest's gate-required `entries[]` is the 44
  individually-named primary artifacts the closure contract actually
  declares, not the 3 grouped contact sheets it used to be (R7) -- see the
  `test:a11y`-adjacent bullets above for the full mechanism. Making every
  artifact individually gate-checked exposed and fixed five real, previously
  latent bugs in the capture functions themselves: `whole-field-*` called a
  nonexistent `window.__bbDesign.returnToField` (the real method lives on
  `window.__bbTest`) and silently landed on whatever node gotoField's own
  auto-focus left active; `route-long` pre-checked a `data-bb-test-id`
  attribute before any `clickNode()` call had tagged it, so every iteration
  skipped and it committed nothing; `route-cleared-trace-retained` and
  `trace-cleared-route-retained` were wired to the exact same capture
  function, guaranteeing byte-identical images for what the evidence plan
  names as opposite states; `reduced-motion` duplicated `focus-ordinary
  -1280`'s exact target state (every capture already runs under
  `gotoField(..., {reduced:true})`, so a second capture of the identical
  node/viewport is trivially identical, not evidence of anything
  reduced-motion-specific); and a fixed 320x480 "undersized screenshot"
  floor in the gate rejected the legitimately short/landscape captures
  the plan itself requires (`text-zoom-200` at 640x400,
  `landscape-mobile` at 844x390). Also separates CI into three distinct
  passes (F10) -- see the CI bullet above.

## Known limits

- **Label placement: bounded residual overlap in the densest cluster.**
  `recomputeLabelPlacements()` in `src/app.js` (spec §4.6) now delegates to
  `src/layout/label-solver.js`'s `solveLabels()` (R2/R4), which scores all 8
  candidate positions (four orthogonal + four diagonal) per label against
  overlap/safe-area/edge-crossing/distance/stability weights and picks the
  cheapest zero-overlap candidate (or, for the always-shown active label, the
  least-bad candidate if none are overlap-free) — real cost-minimization, not
  first-valid selection. In the densest canonical RelO cluster this still
  leaves a small, timing-dependent number of residual overlaps (observed 1-2
  across repeated runs) — bounded and asserted by
  `tests/black-bird-world-camera.spec.js`, not a full "zero overlaps
  everywhere" guarantee. Ordinary (non-densest) clusters are collision-free.
- **Cross-browser Firefox/WebKit** verified only on Chromium in every
  sandboxed session run so far, for the environment reasons described
  above; the same spec runs unmodified wherever those binaries are
  present.
- **`ffprobe`/`ffmpeg`** is not installed in this sandboxed session and
  cannot be fetched here (package-manager mirror access is restricted),
  so `scripts/ci-evidence-gate.mjs`'s video-duration probe for the 7
  motion recordings could not be locally verified end-to-end -- every
  other check on those entries (hash, candidate SHA, duplicate bytes,
  presence) passed. `.github/workflows/final-candidate-gate.yml`
  installs `ffmpeg` explicitly (F10/R7) so this does not carry into CI.
- **This session's own direct GitHub API / `gh` CLI access is blocked**
  at the session level (confirmed by installing `gh` and reproducing an
  explicit 403), independent of anything in this repository; see
  `.bb-control/BLOCKER.json`. All real CI (`Verify`,
  `Black Bird Candidate Validation`, `Final Candidate Gate`) is green at
  the frozen candidate SHA regardless, verified via the GitHub MCP tools
  this session does have working access through.

## Candidate-bound review

Real, candidate-bound evidence (44 individually-named primary artifacts --
30 static captures, 7 motion recordings, 7 machine reports, per
`tests/contracts/evidence-plan.json` -- plus 3 supplementary contact-sheet
composites) is generated fresh from the exact frozen candidate SHA by
`npm run evidence:generate`, gated both locally and in CI by
`scripts/ci-evidence-gate.mjs` (F09/R7: no longer dependent on the
untracked `.bb-authority/` overlay), and uploaded as a CI build artifact
(`candidate-evidence/` itself is gitignored, not committed to the tree).
Zero NaN/Infinity SVG geometry has been observed across any capture.
`candidate-evidence/human-review.json` leaves all 10 review dimensions
`pending_user_review` — no agent self-attests artistic acceptance. This
candidate does not self-attest `SUBJECTIVE_ACCEPTED` or
`RELEASE_AUTHORIZED`, and the PR remains a draft.

**Candidate freeze (R8/F11-F12):** `candidate_sha = 3391ab461d7b3b70335039e3a4417348f89421e5`.
Two clean, consecutive `npm run verify:closure:local` passes with no
interim changes (16/17 checks, 1 non-blocking skip each time); exact-SHA
CI green across all 7 checks (`Verify`, `Black Bird Candidate Validation`,
`Exact-Head Verify`, `Cross-Browser Matrix` ×3, `Final Candidate Gate`);
candidate-bound evidence independently regenerated and gated locally
(44/44 required entries, zero duplicate bytes) after this freeze point.
`candidate-review-packet.json` (repo root) is the machine-readable record
of this verification for the reviewer -- real command/CI output, not a
narrated summary.
