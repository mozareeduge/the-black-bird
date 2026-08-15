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
  (F09/R7).** `tests/contracts/evidence-plan.json` names all primary
  artifacts `final-closure-contract.json`'s `required_evidence_ids`/
  `required_primary_entry_count` declare (originally 30 individually-named
  static captures, 7 motion recordings, 7 machine reports = 44; a later
  completion round, FQ-03 below, split one ambiguously-named entry into two
  truthfully-named ones, so this is now 31/7/7 = 45), replacing an untracked
  `.bb-authority/contracts/evidence-plan.json` overlay that `scripts/
  generate-evidence.mjs` used to read when present, falling back to a
  separately hand-maintained, easy-to-drift duplicate list when absent (the
  normal case in a fresh checkout). `scripts/generate-evidence.mjs`'s
  `manifest.json` lists all of them as primary, gate-required `entries[]`;
  the 3 grouped contact-sheet composites move to `supplementary_evidence[]`
  (`final-closure-contract.json` itself: "Contact sheets are supplementary
  review aids only" -- they had it backwards). `scripts/ci-evidence-gate
  .mjs` asserts `entries[]` is exactly the plan's ids, no fewer and
  no more, in addition to its existing per-entry hash/dimension/duration/
  duplicate-bytes checks (and, since FQ-04 below, per-entry semantic state
  identity).

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

- **Label placement: zero overlap at the tested densest-cluster states, not
  a universal guarantee for every arbitrary transient configuration.**
  `recomputeLabelPlacements()` in `src/app.js` (spec §4.6) delegates to
  `src/layout/label-solver.js`'s `solveLabels()` (R2/R4), which scores all 8
  candidate positions (four orthogonal + four diagonal) per label against
  overlap/safe-area/edge-crossing/distance/stability weights and picks the
  cheapest zero-overlap candidate (or, for the always-shown active label, the
  least-bad candidate if none are overlap-free) — real cost-minimization, not
  first-valid selection. An earlier round disclosed a bounded 1-2 residual
  overlaps in the densest canonical RelO cluster; that measurement was made
  against a wrong, inflated safe rect (a `.main` `min-height` bug, since
  fixed — see the E2 camera/safe-rect entries below). Re-measured after the
  fix: 0 label overlaps at that same RelO cluster, at all 3 desktop
  viewports (1440×960/1280×800/1024×640), across repeated runs. Current
  protected tests require `overlapCount === 0` there (sealed exact zero, not
  a tolerance) — see `tests/black-bird-world-camera.spec.js`. This is an
  exact guarantee for those tested states, not a universal mathematical
  claim for every arbitrary transient user-created pan/zoom configuration.
- **Cross-browser Firefox/WebKit** verified only on Chromium in every
  sandboxed session run so far, for the environment reasons described
  above; the same spec runs unmodified wherever those binaries are
  present.
- **`ffprobe`/`ffmpeg`** is not installed in this sandboxed session and
  cannot be fetched here (package-manager mirror access is restricted),
  so `scripts/ci-evidence-gate.mjs`'s video-duration probe for the 8
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

Real, candidate-bound evidence (49 individually-named primary artifacts --
34 static captures, 8 motion recordings, 7 machine reports, per
`tests/contracts/evidence-plan.json` -- plus 3 supplementary contact-sheet
composites) is generated fresh from the exact frozen candidate SHA by
`npm run evidence:generate`, gated both locally and in CI by
`scripts/ci-evidence-gate.mjs` (F09/R7: no longer dependent on the
untracked `.bb-authority/` overlay; FQ-04: also gated on per-entry semantic
state identity, not just file identity -- see the FQ-01–FQ-10 section
below), and uploaded as a CI build artifact (`candidate-evidence/` itself
is gitignored, not committed to the tree). Zero NaN/Infinity SVG geometry
has been observed across any capture. `candidate-evidence/human-review
.json` leaves all 10 review dimensions `pending_user_review` — no agent
self-attests artistic acceptance. This candidate does not self-attest
`SUBJECTIVE_ACCEPTED` or `RELEASE_AUTHORIZED`, and the PR remains a draft.

**Candidate freeze history.** An earlier freeze (R8/F11-F12) ran at
`3391ab461d7b3b70335039e3a4417348f89421e5` and was recorded as terminal at
the time. A later, independent completion run (the FQ-01–FQ-10 section
below) found and fixed real remaining defects and proof gaps after that
freeze -- so that freeze is superseded, not current. The present, actual
freeze SHA/CI record is in `candidate-review-packet.json` (repo root),
kept current with whichever freeze is now live rather than preserved as a
historical artifact.

## FQ-01–FQ-10: final completion round (owner-directed, post-audit)

A separate, later intake (`BLACK_BIRD_CLAUDE_CODE_FINAL_COMPLETION_INTAKE`)
picked up after the independent audit above (Source Names label-priority
fix, NameO Reader-panel bidi-reversal fix, NameO body design) and drove the
remaining confirmed defects and proof gaps to closure, explicitly
superseding this file's and the changelog's own prior terminal claims where
they conflicted. Base for this round: `bdef0087ed8234a55357a602085ce786f2bc5388`
(the commit right after the NameO body design's own CI confirmation).

- **FQ-01 — removed the remaining duplicate NameO Reader label.** The
  earlier bidi-reversal fix (audit round) left `buildNameoContent()`
  (`src/presentation/reader-renderer.js`) rendering the full mixed-script
  label a *second* time, directionally correct now but still a plain
  repeat of what the title already showed. Removed the redundant
  paragraph entirely; `metaBlock()`'s title is the sole canonical
  rendering. Removed the now-dead `isArabicScript()`/`ARABIC_TEST` helper.
  New regression test (`tests/e2e/reader.spec.js`) asserts exactly one
  leaf element carries the complete label; proven to fail against the
  pre-fix duplicate.
- **FQ-02 — closed Source Names/NameO proof gaps across representative
  states.** The Source Names label-priority fix (audit round) was real,
  but never proven on mobile (`labelBudget()` halves for `isMobile()`, a
  genuinely distinct code path), never proven against the global Labels
  toggle in combination (Labels off must dominate Source Names, through a
  real UI sequence, not two isolated toggles), and never checked for
  label overlap at the state where NameO gets its highest priority tier
  (a focused RelO, the real worst case for crowding). Added all three;
  every new assertion proven to fail against the pre-fix tier ordering.
- **FQ-03 — separated the reflow proof from a real 200% text-resize
  proof.** `RESPONSIVE-ACCESS/text-zoom-200` was only ever a smaller CSS
  viewport (renamed `reflow-zoom-equivalent`, same real reflow capture,
  honestly named) -- it never proved any rendered text doubled in size.
  Confirmed directly: every `font-size` in `src/index.template.html` is
  an absolute px value (no `em`/`rem`/`%` anywhere), so
  `document.documentElement.style.fontSize='200%'` genuinely has zero
  effect in this codebase (verified live). Built a test-only stress
  harness instead (`tests/e2e/text-resize-stress.spec.js`,
  `RESPONSIVE-ACCESS/text-resize-200`): measures each representative
  surface's own baseline computed font-size, forces it to exactly 2x that
  baseline, proves the precondition (≥1.9x for every surface), then
  proves real usability under the stress (no overflow, non-degenerate
  drawer/control boxes, Reader stays scrollable, controls stay operable,
  roving tabindex still resolves). Does not touch production typography.
- **FQ-04 — semantic evidence-state contract + gate.** The evidence
  system already proved file identity (hash/dimensions/duration/
  duplicate-bytes/SHA/completeness); it never proved a screenshot/video
  named "X" was actually captured in state X. Added a compact semantic
  snapshot (`captureSemanticState()`, reads only through the same bounded
  `window.__bbTest` surface every e2e spec uses), a real `expect`/
  `expect_end` predicate for every one of the 31 static + 7 motion
  entries (derived from each capture function's actual behavior, several
  verified empirically live before being written), and independent
  recomputation in `scripts/ci-evidence-gate.mjs` (not just trusting the
  generator's own claimed pass/fail). Writing real predicates surfaced
  two genuine, pre-existing "captured the wrong state" bugs in the
  generator itself: `keyboard-edge-focus` pressed Tab only twice, landing
  on a rail button (4 rail buttons precede any graph node in tab order),
  never showing a node's keyboard-focus ring at all; fixed to 5 Tabs.
  Verified end to end: a real `evidence:generate` run produced all 45
  entries with zero oracle failures; the gate independently re-verified
  the same manifest clean; a manual negative-proof test (corrupted state
  + a lied-about pass flag, in the gitignored evidence output, never
  committed) confirmed the gate rejects both.
- **FQ-05 — fixed the mobile-field-390 evidence state.** The other
  bug FQ-04's predicates surfaced: `captureMobileField()` focused
  `FO.CORPSE`, neither the neutral nor the aperture-default state -- the
  artifact never actually showed the approved mobile neutral-core framing
  (aperture-centered crop) it's named for. Fixed to use the real product
  restore mechanism (`window.__bbTest.returnToField()`); verified live
  that `active_id` becomes `null`, matching the new `neutral_field`
  oracle predicate exactly.
- **FQ-06 — falsified latest-action-wins under a real race; no defect
  found.** Existing coverage (the `[commit, commit, stale-callback]`
  critical triple, P-SCN-100, P-SCN-126) each proved a partial slice of
  "a second rapid commit supersedes the first." Added one adversarial
  test proving all six surfaces converge on the latest commit
  simultaneously under a real, unreduced-motion race (semantic focus,
  rendered focus, Reader subject, camera re-targeting, Route, trace).
  Result: passed cleanly, stable across repeated runs. No product defect
  -- the existing dispatcher/transaction/cancellation mechanism already
  handles this correctly. Architecture left unchanged, per the intake's
  own instruction not to refactor absent a real failure.
- **FQ-07 — final scoped diff audit.** Every file changed since the
  `bdef0087` base maps cleanly to FQ-01–FQ-06 or a generated build
  artifact (`index.html`) -- no unexplained changes. Full baseline-
  preservation suite (`test:data`, `test:baseline`, `test:route-solo`,
  `test:world-camera`, `test:mobile`, `test:accessibility`,
  `test:design`) re-run clean; no canonical DATA, poetry, citation, or
  world-layout drift.
- **FQ-08 (this section) — truthful final documentation.** Removed stale
  candidate/freeze claims from this file's "Candidate-bound review"
  section (a later completion round, not the R8/F11-F12 freeze, is now
  the live one) and updated the evidence-count references (44/30 → 45/31)
  this round's own FQ-03 work changed.

## FR-01/FR-02: bounded final correction (owner-directed, post-FQ-10)

A third, still later owner note reviewed the FQ-01–FQ-10 candidate's own
attached mobile-390x844 neutral-Field evidence directly and found one real
remaining rendering defect the semantic-oracle work above never checked
for (it proves state correctness, not per-label screen geometry), plus one
more stale documentation claim this round's own re-measurement work had
already superseded but never removed from every surface it appeared on.
Explicitly scoped as a bounded correction, not a further design/audit
round -- the visual system, mobile neutral-core camera, world coordinates,
Source Names behavior, NameO body, Reader, Route/trace/wear/afterglow, and
accessibility are all unchanged.

- **FR-01 — mobile Field label clipping.** The mobile neutral-core camera
  deliberately crops the world reference envelope on extreme aspect
  ratios (a decided, kept design) -- but `solveLabels()`
  (`src/layout/label-solver.js`) only ever screened a candidate placement
  for label/body/contour overlap, never for whether the resulting screen
  rect actually landed inside the Field's safe rectangle. An off-core,
  low-priority node's label (e.g. "American Crows",
  `RNO.AMERICAN_CROWS_CORPSE__9FFB70D1`) could have zero overlap with
  anything else and still be chosen while sitting off the visible edge --
  rendered clipped rather than suppressed. Fixed: every label except the
  single active one now also requires a fully-safe-rect-contained
  zero-overlap candidate to be chosen; with none, it is suppressed (same
  fallback the overlap path already used for low-priority labels). This
  intentionally also applies to required-but-not-active labels (RelO
  participants, NameO, structural anchors) -- their prior guarantee was
  priority in the overlap contest, never a pass on containment, so they
  could already be suppressed by overlap alone; containment is simply a
  second, consistent suppression trigger. Only the single active label
  keeps its separate, pre-existing T-REQ-020 exemption (never suppressed,
  containment is the camera-reconciliation caller's job). New regression
  coverage: `tests/unit/label-solver.test.js` (solver-level, proven to
  fail pre-fix) and a real rendered-geometry regression in
  `tests/e2e/responsive-visual-closure.spec.js` at all four protected
  mobile viewports (430x932/390x844/320x640/844x390), each exercising
  neutral/restored Field, an ordinary focused object, a dense RelO state,
  and Source Names on with NameO participating -- proven to fail against
  the pre-fix solver at all four viewports before the fix, clean after.
  `ARTISTIC-CORE/mobile-field-390` evidence regenerated from the fixed
  build and visually confirmed clipping-free.
- **FR-02 — obsolete residual-overlap documentation.** An earlier round's
  disclosed "1-2 residual overlaps" limitation (made against a
  now-fixed, wrongly-inflated safe rect) had already been superseded by a
  re-measured, sealed `overlapCount === 0` contract
  (`tests/black-bird-world-camera.spec.js`) -- but the stale claim was
  still presented as current truth in this file's "Known limits" and in
  `candidate-review-packet.json`'s disclosed-limitations list. Corrected
  both to state the current, exact guarantee (zero overlap at the three
  tested densest-RelO viewports, not a universal claim for every
  transient configuration) and its provenance, without touching the
  already-sealed executable test.

## MR-00B/MICRO-01–03/ADJ-01/TYPO-01: micro-refinement round (owner-directed, post-FR-02)

A final, bounded pre-promotion round authorizing three product/design
refinements plus one narrowly-necessary adjacent correction, on top of the
FQ-01–FR-02 candidate. Everything else in that candidate is the protected
baseline; no force simulation, dragging, NameO label-only reversion, wider
Reader, mobile chamber-model change, stronger RelO clearing, or broad
typography/color/polish pass was introduced. Every item below follows the
same negative-before discipline as the FQ round: a scenario test proven to
fail against the pre-change source, then made to pass by the smallest
correct change, recorded in `.git/blackbird-micro-refinement/logs/` (session-
local, not committed, per the intake's own harness constraint).

- **PRE-01 — app-shell containment fix, ported from source.** `.app-frame`
  (`src/index.template.html`) relied on an implicit `auto`-sized CSS Grid
  row with no explicit upper bound -- a real, spec-documented unbounded-
  growth hazard, independently found and root-caused against the old
  production artifact in a separate PR. Ported the fix
  (`grid-template-rows:minmax(0,1fr)`) into this candidate's own semantic
  source rather than merging that PR, per the intake. New regression:
  `tests/e2e/app-shell-containment.spec.js` at the three protected desktop
  viewports plus a keyboard-traversal check that roving graph navigation
  cannot scroll the fixed shell. Negative-before investigation (recorded in
  `.git/blackbird-micro-refinement/logs/MR-00B-negative-before.md`): no
  locally-reproducible visible regression was found against this exact
  candidate's current markup under tested content/viewport/text-resize
  stress (`.reader{overflow:auto}` already self-contains Reader growth in
  this codebase's current shape) -- the fix is applied as directed,
  defensive hardening against a real CSS Grid hazard confirmed by the
  separate root-fix PR, and the new test is kept as a permanent guard.
- **TYPO-01 — Reader title Arabic wrapping (MICRO-03 prerequisite).**
  `metaBlock()`'s title (`src/presentation/reader-renderer.js`) wrote
  `node.label` as one plain text node; a mixed-script NameO title needs its
  Arabic run wrapped in the same `lang="ar"`/`dir="rtl"` span the rest of
  the Reader already uses, without reintroducing the earlier-removed
  duplicate NameO label paragraph (FQ-01). Fixed via the existing
  `appendArabicWrapped()` helper; the FQ-01 regression test was updated for
  the now-non-leaf `.title` structure while keeping its no-duplicate-
  paragraph guard. No new font asset; Scheherazade New remains the single
  self-hosted Arabic family (`--bb-arabic`), unchanged.
- **MICRO-01 — RelO Reader relational caption.** Added one restrained,
  derived `.relation-caption` between the RelO Reader's opaque meta
  identity and its existing full participant Objects list -- canonical
  participant-array order, first three participants (NameO full label,
  every other type's `shortLabel`/`label`), `+N` for the remainder, no
  interpretive prose. `tests/e2e/reader-relation-caption.spec.js`
  (RLC-01–07); 5/7 proven to fail pre-change (the other 2 assert absence
  and correctly hold either way).
- **MICRO-02/ADJ-01 — Reader-local SOLO/HIDE-SHOW actions + shared
  presentation reconciliation.** Added a two-button contextual action row
  to every canonical object Reader (never orientation/projected-edge),
  reusing the exact canonical `ENTER_SOLO`/`EXIT_SOLO`/
  `SET_OBJECT_VISIBILITY` commands and re-root/snapshot semantics Index
  already used -- no second Solo state. ADJ-01 fixes a previously
  disclosed, deliberately-unfixed gap (the Index eye-toggle handler's own
  comment): the canonical reducer already neutralizes semantic
  `reading.fieldAttention` when the field-attended anchor becomes
  invisible, but the separate presentation-only `uiRuntime.focusedId`
  (camera framing, local aperture/clearing, roving tabindex) stayed stale.
  `reconcileHiddenPresentationFocus()` is the one shared fix, reused by
  both the existing Index path and the new Reader HIDE action; it never
  closes the Index drawer or touches Route/trace/responsive surface.
  `tests/e2e/reader-context-actions.spec.js` (RCA-01–13); 10/11 proven to
  fail pre-change. This same fix corrected a stale oracle in
  `tests/contracts/evidence-plan.json`'s `STATE-AND-RECOVERY/hidden-anchor`
  entry, which had been asserting the old bug (`active_id` staying
  `"FO.CORPSE"`) as if it were correct -- updated to the fixed behavior
  (`active_id: null`).
- **MICRO-03 — active NameO linguistic inscription.** A directly committed,
  Field-attention-holding NameO now unfolds its ordinary single-line label
  into a compact two-line inscription (primary 14 screen px, secondary 9.5
  screen px, both screen-stable under zoom) around the unchanged 3px body --
  derived purely from canonical `node.label` (split once on the literal
  `" / "` separator, Arabic side primary when exactly one side is) via
  `splitNameOInscription()`/`isArabicScript()`, new pure exports in
  `src/presentation/field-renderer.js` with direct unit coverage against
  all four canonical NameOs. The one Source Names amendment: the active
  NameO stays eligible even when Source Names is off (direct commitment is
  a stronger act than the global background-label preference); every other
  NameO keeps the existing gate exactly. `syncGraphLabelContent()`
  (`src/app.js`) is the one place that rewrites label text content, called
  only from the three `uiRuntime.focusedId` assignment sites -- never from
  hover/preview/roving-focus-before-commit, preserving the preview-vs-
  commit distinction. No label-solver change was needed: the existing
  cost-based candidate scoring already prefers a contained zero-overlap
  candidate for the active label whenever one exists, confirmed by a real
  rendered-geometry containment matrix (`getBBox()`/`getScreenCTM()`) for
  all four NameOs at all six protected viewports (three desktop, four
  mobile/landscape). `tests/e2e/nameo-active-inscription.spec.js`
  (NAI-01–10); 9/10 proven to fail pre-change. Fixed one stale P-SCN-052
  assertion in `tests/e2e/view-index-solo.spec.js` that expected a
  directly-active NameO's label to still hide under Source Names off --
  exactly the behavior this amendment changes -- while preserving its
  "labels toggle hides everything" and "Source Names gates ordinary NameO
  labels" coverage.
- **Cross-feature composition (MR-04).** `tests/e2e/cross-feature-
  composition.spec.js` exercises RelO+caption+Solo, RelO+hide+clearing, and
  mobile NameO+Reader-action combinations not already covered end-to-end by
  the per-feature specs above (NameO+Solo/hide/Source-Names are already in
  NAI-01/02/09/10). No product changes were required; every combination
  already behaves correctly given the shared reconciliation/Solo/caption
  paths built above.
- **Evidence (MR-05).** Added 4 new required primary entries (45 → 49):
  `ARTISTIC-CORE/relo-reader-caption`, `ARTISTIC-CORE/nameo-active-
  inscription`, `STATE-AND-RECOVERY/reader-actions-hide-show`, `motion/
  reader-context-actions-mobile`, in `tests/contracts/evidence-plan.json`
  and `tests/contracts/final-closure-contract.json` in lockstep, with
  matching capture functions in `scripts/generate-evidence.mjs`.
  `scripts/ci-evidence-gate.mjs` needed no functional change (ids/count are
  already read dynamically from the plan). Validated via a dry
  `evidence:generate` run: 49/49 entries, zero oracle failures. The new
  split is 34 static + 8 motion + 7 machine-report = 49 (motion count 7 →
  8 for `motion/reader-context-actions-mobile`).
- **Scoped-diff audit (MR-06).** `git diff --stat` over the full round
  (`6afb258..HEAD` at the time: 19 files, 2044 insertions(+), 63
  deletions(-)) maps every changed file to a named item above (PRE-01/
  MICRO-01–03/ADJ-01/MR-04/MR-05/docs/generated build artifact) with
  nothing unexplained or reverted-away. Explicit invariant re-checks, all
  confirmed unchanged: canonical `DATA` block SHA-256 (recomputed
  independently, exact match to the locked hash and the intake's declared
  value), `src/data/world-layout.json` (`width=1000, height=760`), the
  Reader-open grid column width, every file under `src/domain/ src/state/
  src/layout/ src/controllers/ src/application/ src/accessibility/
  src/styles/` (all empty diffs), `package.json`/`package-lock.json` (no
  new runtime dependency), and the RelO clearing render/update/style
  functions in `src/app.js` (absent from the diff's hunk headers). No new
  specimen card/badge/toolbar/legend/tutorial was introduced.
- **First full local closure pass surfaced two pre-existing test defects,
  fixed (MR-07).** Both were latent since earlier in this round, not
  introduced by MR-06:
  - `tests/e2e/reader-context-actions.spec.js` (RCA-09) used
    `.click({force:true})` against a disabled button to probe the type
    gate. `scripts/source-policy-scan.mjs`'s forced-Playwright-action rule
    correctly rejects this pattern repo-wide: a real disabled `<button>`
    is not clickable by an actual user, so Playwright's own actionability
    check already refuses a real click there, making the forced click both
    prohibited and redundant with the disabled-state assertion already in
    the test. Removed the forced click; the disabled-state assertion alone
    is sufficient proof.
  - `tests/unit/final-closure-contract.test.js`'s "exactly N primary
    entries" test still hardcoded the pre-MR-05 45/31/7/7 split. Updated
    to the current, intentional 49/34/8/7 split MR-05 actually produced.
- **Two-pass local closure freeze (MR-08).** After the MR-07 fixes, `npm
  run verify:closure:local` was run twice in immediate succession against
  the identical, unchanged tree (`git status --short` clean before, between,
  and after both passes): SUCCESS, 16/17 passed, 1 skipped
  (`cross_browser_smoke` — Firefox/WebKit binaries unavailable to this
  sandboxed session, the same disclosed limitation as every prior round;
  `playwright.config.cjs` only pins Chromium's own binary path locally).
  Functional freeze SHA: `ab237033fdcf309fc2bc07e1a807c4e6ead9a056` (HEAD
  after the MR-07 fix commit — both passes ran against this exact tree).
  Evidence was then regenerated fresh from this frozen SHA:
  `evidence:generate` → "evidence generated for ab237033…: 49 required
  entries, 3 supplementary artifacts", no oracle-failure exception (all 49
  semantic-state oracles passed). The local `ci-evidence-gate.mjs` run
  reported `valid:false`, but strictly on the disclosed "unprobeable video"
  finding for all 8 motion entries (`ffprobe`/`ffmpeg` absent locally,
  confirmed via `which ffprobe ffmpeg`) — every hash/candidate-SHA/
  duplicate-bytes/completeness/semantic-state check passed.
  `.github/workflows/final-candidate-gate.yml` installs `ffmpeg` explicitly
  before running this same gate in CI, closing the gap there.
- **Push + exact-SHA CI verification (MR-09).** Pushed `ab237033…` to PR
  #9's branch and confirmed all 8 GitHub Actions checks green at that exact
  commit via `mcp__github__pull_request_read.get_check_runs` and
  `mcp__github__get_job_logs` — real job-log content inspected, not just
  the green badge: `Exact-Head Verify` (`exact-head-verify`) log confirms
  `=== verify:closure:ci: SUCCESS (17/17 passed, 0 skipped) ===` (the 17th
  check being `cross_browser_smoke`, which only CI can run); `Final
  Candidate Gate` (`final-candidate-evidence`) log confirms `evidence
  generated for ab237033fdcf309fc2bc07e1a807c4e6ead9a056: 49 required
  entries, 3 supplementary artifacts` and `ci-evidence-gate.mjs`:
  `{"valid":true,"errors":[],"candidate_sha":"ab237033fdcf309fc2bc07e1a807c4e6ead9a056","entries_checked":49}`
  (`ffmpeg` installed in that workflow, closing the local video-probe gap);
  `build-and-test`, `cross-browser (chromium/firefox/webkit)`, `validate`,
  and `publish` (the `/next/` preview) all completed with `conclusion:
  success`. `candidate-review-packet.json` records this exact-SHA CI result
  under `verification.exact_sha_ci`.
