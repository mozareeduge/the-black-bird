# PR #9 v6 candidate — working ledger

Source of authority: `BLACK_BIRD_HEAD_EXECUTOR_SYSTEM_v6.zip` (user-supplied,
hashes verified against `MANIFEST.json` at session start). This file is the
durable, committed continuation state for that work — read this first if
picking the work back up in a new session, before re-reading the package.

**Scope discipline (explicit user instruction, 2026-08-09):** fix only what
is listed below as a defect, or what gets newly *verified* (not assumed) as
a defect against the sealed `HORIZON_LOCK.md` / `ACCEPTANCE_CONTRACT.json`
during this work. No refactors, no unrelated cleanup, no changes justified
only by taste.

**Deliverable:** a finalized candidate, tested, live at
`https://poem.theblackbirdfield.com/next/` for owner review. Production
(`main` root, the currently-live site) is never touched except by the
additive, auto-published `next/` subfolder (see "Preview" below). Nothing
merges to the live site until the owner reviews `/next/` and says so.

**No separate bug list exists** beyond this package — confirmed with the
user. `REFERENCE/CURRENT_OBSERVED_STATE.md` and
`REFERENCE/BASELINE_TO_TARGET_MATRIX.md` (both marked non-authoritative,
"re-testable" in the package) are the leads; every item below was either
independently re-verified before being marked a real defect, or is still
open pending verification.

## Preview

`.github/workflows/publish-next-preview.yml`: on every push to this branch,
builds the candidate and publishes it into `main`'s `next/` subfolder only.
Root `index.html`, `CNAME`, and everything else on `main` are never
written by this job. Verified: the bot commit's diff touches only `next/**`
(checked against its immediate parent commit), and the workflow run
succeeded in CI (build + `build:verify` both green). `robots.txt` on `main`
got one manual, one-time line (`Disallow: /next/`) so the preview isn't
indexed.

## Test strategy (applies to every item below, not just smoke/functional)

1. **Verify before fixing.** Re-check each claimed defect against the live
   page / real test run before writing a fix — the leads are disclosed as
   re-testable, not ground truth (this already caught that the Arabic-script
   item was *not* actually broken).
2. **Fix at the smallest correct scope.** Prefer the existing
   mechanism/module; only change algorithms where the outcome genuinely
   requires it (`HORIZON_LOCK.md` §6A).
3. **Tighten, never weaken, thresholds.** Any test currently looser than
   `ACCEPTANCE_CONTRACT.json` gets corrected to the sealed number, not left
   or further loosened.
4. **Prove the fix, not just the absence of the old bug.** For visual/UX
   changes this means: state assertions (geometry/DOM/aria, via
   `window.__bbTest`) *and* a real rendered check (Playwright screenshot or
   live-DOM measurement), across every viewport the contract names for that
   surface — not just desktop/chromium.
5. **Check integration, not just the touched unit.** After each fix, re-run
   the full adjacent suite it could plausibly ripple into (reader ↔
   accessibility ↔ mobile ↔ route/solo ↔ world-camera), not only the one
   spec that names the change. `BASELINE_PRESERVATION.md` P4's four
   questions (protected property disappeared? target occurred? unrelated
   surface regressed? negative requirement satisfied via disappearance?)
   are asked explicitly, in the commit message, for every visual change.
6. **Full local suite + build:verify before every push.** Cross-browser
   (`test:cross-browser`) and full accessibility (`test:a11y`) at least
   once per DAG sub-phase, not only at the very end.
7. Nothing is marked done here on the strength of a passing test alone if
   the test's own threshold is suspected of being the thing that's wrong —
   check the number against the contract first.

## Defect checklist

Legend: ✅ done+verified · 🔎 verified defect, not yet fixed · ❓ lead, not
yet independently verified · — not yet reached.

### E1 — Baseline-preservation / semantic audit — CLOSED

- ✅ Reader index-list cross-references rendered `shortLabel` instead of full
  canonical RNO/MNO title / full opaque RelO id (`src/presentation/reader-renderer.js`).
  Fixed + regression test. Commit `6cdc64c`.
- ✅ `src/styles/accessibility.css` (reduced-motion backstop, forced-colors,
  missing-font safety, 200%/320px reflow) was never wired into the production
  build — several tests injected it manually via `<link>` instead of testing
  the real page. Wired into `scripts/build.mjs`. Commit `6cdc64c`.
- ✅ Arabic/source-script Reader rendering — checked, **not** actually
  regressed. Added a locking test anyway (`ba974bc`) since none existed.

### E2 — Field visual/material reconstruction — IN PROGRESS

- ✅ **Desktop neutral occupancy (primary, secondary, center-offset) — fully
  fixed and verified at all 3 desktop viewports (1440×960, 1280×800,
  1024×640).** Root causes were two real bugs, not a design problem:
  1. `.main` (the grid item hosting `.map-wrap`/`.panel`) had `min-width:0`
     but no `min-height:0`. Its grid row's automatic minimum size was
     content-based instead of clamped to the container, so
     `mapWrap.clientHeight` (and therefore `computeFieldSafeRect().height`)
     was inflated far past the real viewport — measured 1360px tall in a
     960px-tall window at 1440×960. Every occupancy number downstream of
     that was computed against a wrong, oversized safe rect. Fixed:
     `src/index.template.html` `.main` now has `min-height:0` too.
  2. `SCALE_MIN` in `src/layout/camera.js` was `0.55`, above the scale
     genuinely required to fit the world envelope at 1024×640 (~0.47) —
     clamped there, so primary occupancy overflowed the 0.88 ceiling.
     Lowered to `0.2`. Mirrored in the d3.zoom `scaleExtent` lower bound
     (`src/app.js`) so a subsequent interactive zoom-out gesture can't snap
     the already-below-0.55 camera back up, and in
     `tests/contracts/algorithm-contracts.json`'s `camera.scaleMin` so the
     committed contract fixture and the real constant stay in sync (a unit
     test reads the fixture as ground truth, not a re-typed literal).
  `tests/black-bird-world-camera.spec.js`'s neutral-occupancy test now
  asserts the exact sealed bands (was `[0.6,0.95]`) across all 3 desktop
  viewports, plus new secondary-axis and center-offset assertions (neither
  existed before). Full local suite re-verified clean after both fixes
  (187/187 Playwright + 130/130 unit), including one real ripple each fix
  surfaced and I fixed rather than ignored: a hover-preview e2e test that
  only "passed" before by riding leftover animation drift (real bug in the
  test, not the product — fixed to do a genuine mouse move), and a new,
  real, previously-masked Axe violation (`#reader`'s scrollable region
  wasn't keyboard-focusable — invisible before because the height bug meant
  it never actually needed to scroll; added `tabindex="0"`).
- 🔎 **Mobile secondary-axis occupancy — root-caused, not yet fixed; this is
  a real design/algorithm gap, not a bug with an obvious patch.** After the
  fixes above, mobile portrait viewports (430×932/390×844/320×640) and
  844×390 landscape now hit primary occupancy exactly on target (0.8) but
  secondary comes out ~0.28–0.37 against the 0.52 floor. Proven
  mathematically, not just measured: `rx/ry` for a given viewport is
  `(envelope.width/envelope.height) * (safeRect.height/safeRect.width)`,
  independent of k. At 390×844 that ratio is ≈2.8 — since the bands can
  only jointly tolerate a max/min ratio of ≈1.69 (0.88/0.52), **no single
  uniform (isotropic) scale k can satisfy both axis bands simultaneously**
  for this envelope-aspect/safe-rect-aspect combination. Anisotropic
  (non-uniform x/y) scaling would fix the math but would visually squash
  circular node bodies into ellipses, violating H-VIS-005's typed
  morphology — not a safe mechanism change. Needs real design thought
  (possibly: a different reference envelope for extreme-aspect viewports,
  not literally "all 50 nodes' bbox") before touching code. Do not attempt
  a quick fix here without revisiting this reasoning.
- ✅ **Focused occupancy — fixed and verified at all 3 desktop viewports.**
  Was the real mechanism behind the audit's "ordinary focus weak/knotted"
  finding, not just a loose threshold: `computeFocusCamera`'s later-focus
  path preserved the current transform (or did a minimal pan) whenever the
  focus envelope was geometrically inside the safe rect at all — even a
  tiny envelope occupying a small fraction of it, which is "inside" but not
  remotely composed to the 0.58–0.82 target. Measured live: ~0.20 before
  the fix. Fixed in `src/layout/camera.js`: `computeFocusCamera` now also
  forces a refit when the *current projected occupancy itself* falls
  outside `[FOCUS_OCCUPANCY_MIN=0.58, FOCUS_OCCUPANCY_MAX=0.82]`, not only
  when a meaningful fraction of the envelope is geometrically outside the
  rect — "avoid a jarring refit when already in view" was never meant to
  also mean "never correct an out-of-band composition." Verified live
  after the fix: ~0.60 at all 3 desktop viewports, now inside the sealed
  band; `tests/black-bird-world-camera.spec.js`'s focused-occupancy test
  tightened from `[0.4,0.95]` to the exact sealed band across all 3
  viewports (was 1). Kept, not broke, the existing preserve/minimal-pan
  mechanics: the two unit tests for those got occupancy-realistic fixtures
  (the old ones used arbitrarily tiny envelopes never meant to test
  occupancy compliance — that's *why* they didn't already catch this), plus
  a new unit test for the added out-of-band-refit case.
  This is a broad-reach change (every later-focus transition app-wide), and
  it surfaced real ripples, all fixed: two Route-accumulation e2e tests
  that click through several distant, unrelated clusters in sequence now
  legitimately leave earlier targets off-screen after a tighter, more
  correct focus refit (exactly as a real reader would experience — they'd
  reach for Index/search too) — added `commitViaIndex()` to
  `tests/bb-helpers.cjs` (the same commit path already used/tested
  elsewhere for Index-driven commits) and switched those specific
  multi-cluster sequences to it; `clickNode`'s real-screen-click contract
  is untouched for tests actually about pointer commit. One more
  hover-preview test hit the same "content animates under a stationary
  mouse" issue as the earlier P-SCN-018 fix — same fix (move the mouse off
  the graph first). Full suite reverified clean after all of it: 191/191
  Playwright + 131/131 unit.
- ✅ **Label-overlap — was already resolved by the geometry fixes above; no
  solver rework needed.** The test's own comment blamed "first-valid-
  candidate" placement, but `src/layout/label-solver.js`'s `solveLabels()`
  already scores all 8 candidates by weighted overlap cost and picks the
  lowest-cost zero-overlap one (not first-valid) — that description was
  simply wrong/outdated. Re-measured after the safe-rect and occupancy
  fixes: 0 label overlaps at the densest RelO cluster, at all 3 desktop
  viewports, across repeated runs (21/21 total across two verification
  passes) — the prior "1-2 residual overlaps" measurements this test's
  loose tolerance was based on were almost certainly against the wrong,
  inflated safe rect from the `.main` `min-height` bug. Tightened
  `tests/black-bird-world-camera.spec.js` from `<=2` to the sealed exact
  `0`, extended to all 3 desktop viewports (was 1).
- ✅ **RelO continuous clearing — independently re-measured, found compliant,
  not the defect the matrix row described.** `--bb-clearing-fill` is
  `rgba(228,219,201,.16)` (already at the sealed 0.16 ceiling), and the
  live rendered result was checked by actually sampling composited pixel
  luminance (screenshot round-tripped through an in-page `<canvas>` +
  `getImageData` — no new dependency needed), not just reading the CSS
  value: mean luminance inside the clearing (~16–18) vs. matched cold-field
  background (~6–8) at 1280×800 — roughly 2–2.5x, a genuine, non-trivial
  lift, not "practically invisible." Locked with a new regression test
  (`tests/black-bird-design.spec.js`, "RelO clearing has positive
  local-luminance presence"), robust across 5 repeated runs. Possible this
  matrix-row complaint predates other fixes in this round, or was about a
  different aspect (shape/extent) than raw luminance — either way, current
  state is verified, not assumed.
- ❓→likely-resolved-as-side-effect. Visually inspected a live FO.CORPSE
  focus screenshot at 1280×800 after the focused-occupancy fix: clear,
  well-sized warm penumbra, immediate participants legibly clustered
  around it, no visible label congestion/overlap. Consistent with the
  occupancy jump (0.20→0.60) actually being the mechanism behind this
  matrix-row complaint too, not just the "weak, knotted" framing in
  isolation. Not marked ✅/closed: this is one screenshot, one object, one
  viewport — a visual spot-check, not the same rigor as the measured
  items above, and "is it actually good" is ultimately the user's/GPT's
  artistic call per the package's own terms, not mine to certify. Worth
  the user looking at `/next/` directly on this point specifically.
- ❓ Route/wear/afterglow "visible material too weak/unproven" (matrix row
  "Route/wear") — partial spot-check only. A live 4-commit sequence screenshot
  shows Route's thin neutral dotted connector lines clearly and distinctly
  (matches spec). Could not responsibly judge wear (amber-brown
  accumulation) or afterglow (departure residue) from a single static
  screenshot — both are inherently temporal/motion materials, and a still
  frame at one arbitrary moment isn't rigorous evidence either way for
  them. Needs actual motion capture to verify properly (this is really an
  E5 evidence-capture question, not something to eyeball now) — left open
  rather than guessed at.
- ✅ **Mobile Field default collisions / dense-zoom k≈2.4 — checked directly
  with real geometry measurement, does not reproduce.** Measured actual
  label-bbox and node-body overlap (same formula as the desktop
  zero-overlap test) at: (a) default whole-field mobile state, both
  390x844 and 430x932 — 0 overlaps; (b) a real pinch-zoom gesture
  (Ctrl+wheel, matching P-SCN-076's established pattern) on the densest
  RelO clearing driven all the way to scaleMax=2.4 — 0 label overlaps, 0
  significant node-body overlaps, 50 labels rendered. Added a permanent
  regression test for the max-zoom case (previously uncovered — existing
  tests check the *result* of automatic focus-camera fits, not manual
  zoom-in past that) to `tests/e2e/mobile-chambers.spec.js`. "Thin
  relational material" is a qualitative/aesthetic claim, not something a
  collision count can settle — left as the user's own call, same as the
  Route/wear/afterglow material-strength item above.
- ✅ **1024×640 "horizontal mobile-sheet band" — checked directly, does not
  reproduce.** Screenshotted the live page at 1024×640 in both neutral and
  focused states: clean compact-desktop composition, no mobile-sheet
  styling bleed (1024 is above the 900px mobile breakpoint, so it should
  never see mobile sheet styles at all, and doesn't).
- ✅ **1024×640 "overlay-leak" — checked directly, does not reproduce.**
  Every overlay at this viewport was individually verified within-bounds:
  Index/Field-View/About (existing test, already passing) plus Route
  drawer (untested before — real coverage gap, not a confirmed defect;
  measured directly, clean, added to the same test). No edge sheet applies
  (mobile-only, and 1024 is above the 860px breakpoint). A different claim
  than the mobile-sheet-band finding above, same viewport, same
  conclusion.
- ✅ **Flaky `black-bird-design.spec.js` "reduced motion preserves state
  without blur or pulse" test — root-caused and fixed.** Root cause: this
  was the only test in the file that calls `page.reload()` then
  `clickNode()` — but its post-reload readiness wait only checked
  `window.__bbDesign?.contractVersion==='2.0.0'` (proves the design API
  exists, nothing about whether reload's own re-triggered auto-focus/
  camera-fit/simulation settling had finished). Every other test gets a
  much stronger gate via `gotoField()` (node count, lifecycle phase,
  anchorId, `fieldFitted()`, camera-settle poll) — this one, uniquely,
  didn't, because it reloads mid-test instead of navigating via
  `gotoField()`. Racing `clickNode`'s 2nd call against that still-settling
  reheat was the real cause: the click lands on stale pre-reheat
  coordinates and misses, `activeId` reads back as the initial
  `FO.BLACK_BIRD_FIELD`. Fixed by adding the same readiness wait
  `gotoField()` uses, inline, after the reload. Verified: 18/18 repeat
  runs clean after the fix (was ~1/3 fail rate before, reproduced
  independently via `git stash` on clean HEAD).
- ✅ **Object Solo — spot-checked, composition held up through the camera
  fixes (uses the same focus-fit path, so benefits from the same
  occupancy correction).** Live screenshot (FO.CORPSE Solo via the real
  Index-drawer solo button, not a raw dispatch shortcut — first attempt at
  a raw `dispatch({type:'ENTER_SOLO',...})` silently did nothing useful,
  redone through the actual UI path): recessive `SOLO · Corpse` band
  visible at bottom per H-VIS-008, full members clearly distinguished
  from secondary (hollow, unlabeled) participants, no visible overlap or
  overflow.

### E3 — Interaction, accessibility, resilience — MOSTLY ALREADY COVERED

- ❓ text-zoom-200: confirmed this is `RESPONSIVE-ACCESS/text-zoom-200` in
  `tests/contracts/evidence-plan.json`/`final-closure-contract.json` — an
  E5 evidence-artifact identifier, not a current test-suite gap. Correctly
  deferred to E5, not miscategorized. One real finding worth recording:
  tried CSS `zoom:2` on `<html>` as a "real zoom" simulation and it does
  NOT change `window.innerWidth` in headless Chromium/Playwright (verified
  directly) — doesn't behave like real browser page zoom here. Existing
  tests' "200%-zoom-equivalent viewport" (shrunk viewport width) is
  actually the W3C's own defined reflow-testing methodology (WCAG SC
  1.4.10 explicitly equates zoom levels to CSS-pixel viewport widths), so
  that part is legitimate, not a shortcut -- but SC 1.4.4 (Resize Text) is
  a different criterion about genuine zoom behavior. Follow-up: real
  Chrome page-zoom (Ctrl+/-) isn't cleanly reachable through Playwright/CDP
  either -- it's a known, general automation-tooling gap, not something
  fixable by writing better test code here. The genuinely faithful way to
  test SC 1.4.4 specifically (which is about *text* resize, not full-page
  reflow) is root `font-size` scaling (e.g.
  `documentElement.style.fontSize='200%'`) rather than chasing real
  browser zoom -- worth building that way when E5 is reached, not
  reattempting CSS/CDP zoom tricks.
- ❓ keyboard-edge-focus / tooltip-edge: same pattern as text-zoom-200 —
  confirmed these are `RESPONSIVE-ACCESS/keyboard-edge-focus` and
  `RESPONSIVE-ACCESS/tooltip-edge` in `tests/contracts/evidence-plan.json`,
  E5 evidence-artifact identifiers, not E3 test-suite gaps. Deferred to E5,
  not miscategorized.
- Most of E3's *functional* list (pointer ownership/no retry, tooltip
  lifecycle, target sizes, roving keyboard, focus visibility, modal
  inert/restore, reduced motion, breakpoint transitions) already has real,
  passing test coverage exercised repeatedly throughout this round's full
  suite runs (`tests/black-bird-accessibility.spec.js`,
  `tests/e2e/tooltip-keyboard-status.spec.js`, `tests/a11y/axe.spec.js`,
  `tests/e2e/desktop-composition.spec.js`) — not a fresh audit, but not an
  unverified gap either; 194/194 passing repeatedly is real signal, not
  nothing. What's *not* yet done: "actual 200% text resize" and "forced
  colors on production" as genuinely fresh, dedicated checks (forced-colors
  got real production coverage as part of the E1 accessibility.css fix;
  200% resize is blocked on the same CDP-zoom-emulation gap noted above).

### E4 — Scenario proof reconstruction (115 P-SCN) — FIRST PASS DONE, GOOD NEWS

- ✅ **Audited all 115 entries mechanically, not just the claim.** Wrote a
  script (not committed -- one-off, see method below) that, for every
  entry's `evidence` reference, verified the referenced file exists and
  the exact test-title string appears in it (i.e., not a dangling/fake
  pointer). Result: 106/115 clean on the first pass; 9 flagged, of which
  7 turned out to be false positives from my own strict string-matching
  (deliberately-truncated evidence strings ending "...", an escaped
  apostrophe, a missing subordinate function name in an otherwise-real,
  otherwise-matching test title) -- all still point to real, existing,
  passing tests. **`CURRENT_OBSERVED_STATE.md`'s blanket claim overstates
  the problem**: the registry is mostly solid, not mostly bookkeeping.
- Separately scanned every entry's `notes`+`evidence` text for
  self-admitted weak-coverage language ("as setup", "generally", "nearly
  every test", "incidental", etc.) — 3 of 115 flagged, 1 was a false
  positive (P-SCN-018, which has a real specific test plus an added
  engineering rationale, not weak evidence). The other 2 were **real,
  confirmed gaps**, now fixed:
  - **P-SCN-001** ("Open About before entry") — old evidence was a test
    that always runs *after* `gotoField`'s wait for the entered/focused
    phase, even with `realOnboarding:true`; it never actually exercised
    the pre-entry threshold screen. Turns out there's a whole real,
    dedicated code path for this (`#thAboutBtn`, `openAbout("threshold")`,
    a `from-threshold` panel class) with zero prior test coverage. Added
    a real one in `tests/e2e/modals-about.spec.js`.
  - **P-SCN-003** ("Complete onboarding with reduced motion") — old
    evidence was literally "every e2e test's own setup uses this",
    explicitly the "setup-only evidence" pattern `EXECUTION_DAG.md` E4
    forbids. Added a real one in `tests/e2e/bootstrap.spec.js`: runs a
    real Enter-triggered onboarding to its own natural completion (not
    interrupted, unlike the existing P-SCN-004/005 tests) under reduced
    motion, checks the landing Route event and the blur/pulse contract.
  Both new tests pass; `tests/generated/scenario-coverage-map.json`
  updated to point at them (checked the diff stayed minimal -- first
  attempt accidentally reformatted/re-encoded the whole 1173-line file
  via a naive Python re-serialize, caught and fixed before committing).
  `scripts/check-scenario-coverage.mjs` still reports 115/115/0/0.
- ✅ **Second, deeper pass: grepped every entry's `notes` for admitted
  generic/non-specific coverage** (words like "generically", "not X
  specifically", "not every"), the class of gap the self-admission scan
  above didn't target (that pass looked for setup-only/incidental language;
  this one specifically looked for "covered by a broader test, not this
  scenario's own behavior"). Found 5, all real:
  - **P-SCN-046** ("Hide inactive object") and **P-SCN-049** ("Disable
    active object type") both cited only
    `reducer.test.js`'s Route/trace-neutrality test for
    SET_OBJECT_VISIBILITY/SET_TYPE_VISIBILITY — a test that proves these
    commands don't corrupt history, not that hiding/disabling actually
    works. Real behavioral coverage already existed
    (`visibility-solo.test.js`'s `isNodeVisible` tests for individual-hide
    and group-hidden-type, plus P-SCN-047's own live e2e test for the
    active-type-disable case) — just never cited. Added those references;
    no new test needed, no app defect.
  - **P-SCN-051** ("Toggle projected edges") and **P-SCN-052** ("Toggle
    labels/source names") had the same reducer test as their *only*
    evidence, whose own note admitted it "not the projectedEdges option
    specifically" — genuinely no test anywhere verified the actual visual
    effect (traced the real mechanism: `projSel.attr("display", d =>
    projectedVisible(d) ? null : "none")` and `updateLabelVisibility()`'s
    unconditional `if (!state.view.labels) return false` / `if (d.type ===
    'NameO' && !state.view.sourceNames) return false` filters). Added two
    real dedicated tests to `tests/e2e/view-index-solo.spec.js`: one
    toggles `projected` and asserts every `.link-proj` line's `display`
    goes to `none` and back; one toggles `labels` and asserts every
    `text.node-label` goes to `none` and back, then focuses the one real
    NameO node (`NameO.AR.GHURAB`) and asserts its label is hidden with
    `sourceNames` off and shown with it on (a global visible-label-count
    comparison was tried first and rejected — the label budget/priority
    system already saturates on non-NameO nodes at whole-field zoom, so
    sourceNames toggling doesn't change the *count*, only which specific
    node renders; the per-node check is the actually-correct assertion).
    Both new tests pass on first real run. `scenario-coverage-map.json`
    updated for all 4 ids (diff verified minimal — 2 files/19 lines,
    correct re-serialization this time). `check-scenario-coverage.mjs`
    still reports 115/115/0/0.
  - No app defects found in this pass — every gap was a citation/coverage
    gap in the test suite itself, not incorrect product behavior.
- **Still not done**: a full line-by-line re-judgment of all 115 titles
  against their tests' actual assertions (as opposed to two targeted
  automated scans — dangling-reference validity, then self-admission
  language twice over). What's covered now: reference validity (115/115),
  setup-only/incidental language (2 gaps fixed), and generic-not-specific
  language (4 gaps fixed). A scenario whose evidence is real, specific, and
  silent about any limitation could still in principle be under-asserting
  something the title implies — that residual risk is what a full
  line-by-line pass would close, and remains open if wanted.

### E5 — Evidence system reconstruction — IN PROGRESS

- ✅ **Axe scanner error silently passing the evidence gate — confirmed real,
  root-caused, and fixed (not just the audit's suspicion).**
  `scripts/ci-evidence-gate.mjs` validated every `machine_reports` entry only
  for file-non-emptiness — never parsed or inspected the JSON content. Traced
  the actual failure mode in `scripts/generate-evidence.mjs`: the
  accessibility block wrapped `AxeBuilder({page}).analyze()` in a try/catch
  that, on any scanner exception, wrote the caught error object straight into
  the `violations` field (`{violations: {error: "..."}}` — a malformed,
  non-array shape) instead of failing the run. The gate's non-emptiness check
  passed on that fake payload every time.
  - Running `npm run evidence:generate` to reproduce this **immediately threw
    a real, previously-hidden error**: `Please use browser.newContext()`,
    from `AxeBuilder`, at the accessibility block. Root cause: that block
    used `browser.newPage({...options})` (the implicit-context shorthand
    used elsewhere in the same file for plain screenshots) instead of an
    explicit `browser.newContext()` → `context.newPage()`, which
    `@axe-core/playwright`'s `AxeBuilder` requires. **This means the Axe scan
    had never actually run successfully in this script before** — every
    prior `machine/accessibility.json` in evidence history was the swallowed
    error, not a real scan result, and the gate had no way to tell.
  - Fixed both ends:
    - `generate-evidence.mjs`: accessibility block now creates an explicit
      `browser.newContext({viewport, baseURL})` → `context.newPage()`,
      closes the context after the scan, and throws
      (`machine/accessibility.json: axe-core scan did not return a
      violations array`) if `analyze()` doesn't yield a real array — no more
      swallowing.
    - `ci-evidence-gate.mjs`: added a dedicated content-validation branch for
      `machine/accessibility.json` — parses the JSON, rejects a non-array
      `violations` field outright (defense in depth, in case a future
      failure mode reintroduces a swallowed-error shape), and fails the gate
      on any `serious`/`critical` impact violation actually found.
  - **Verified against real output, not assumption**: re-ran
    `npm run evidence:generate` — succeeded (`44 required entries, 3
    supplementary artifacts`); `candidate-evidence/machine/accessibility.json`
    now contains a genuine result:
    `{"candidate_sha": "...", "violations": []}`. Then ran
    `node scripts/ci-evidence-gate.mjs` — no `machine/accessibility.json`
    error in the output; the only failures present were `unprobeable video`
    entries from the local sandbox's missing `ffprobe` binary (expected,
    pre-existing, documented in TESTING.md — `final-candidate-gate.yml`
    installs ffmpeg in real CI, so this is not a defect and not something to
    chase locally).
  - Regression check before commit: full local suite re-run clean —
    `test:unit` 131/131, all 115 `tests/e2e/*.spec.js` (chromium), the 25
    `black-bird-design.spec.js`/`black-bird-world-camera.spec.js` tests,
    `build`/`build:verify` — all green. `verify:closure:local` also run as
    the aggregate integration check.
- ✅ **3 more real, confirmed bugs in `scripts/generate-evidence.mjs`, fixed and directly verified (not just re-run):**
  - `captureProjectedInspection`/`preview-and-projected-inspection`: the
    click selector (`.edge.projected, line.projected, .proj-edge,
    path.projected`) matches no element the app ever renders — the real
    class is `line.hit` (`src/app.js` `projHitSel`). `edge.count()` was
    always 0, so this "projected inspection" evidence never inspected one.
    Fixed to find the first `display!=none` `line.hit` and dispatch a real
    click event on it (Playwright locator `.click()` on these elements
    times out — their computed bounding boxes read as off-viewport under
    the camera pan/zoom transform even when actually rendered/clickable;
    matches the proven pattern already used by
    `tests/e2e/tooltip-keyboard-status.spec.js`'s P-SCN-124 test).
    Verified directly: dispatch succeeds, `state.reading.inspection` is
    populated, `#reader .edge-head` becomes visible.
  - `captureRouteLong`: committed only 4 nodes = 5 total route events
    (incl. onboarding), one short of the >5 threshold
    `routeApertureEvents()` needs to collapse the strip at this viewport —
    so "route-long" was indistinguishable from an ordinary route. Fixed to
    5 commits (6 total) and now opens the resulting drawer. Verified
    directly: 6 total events, ellipsis present, drawer opens.
  - Every motion-recording context was built with a hardcoded
    `recordVideo.size: {1280,800}` regardless of scenario;
    `mobile-complete-path` then called `setViewportSize(390,844)`
    mid-context, which changes the live page but not the already-fixed
    video frame size — its real mobile content was being
    recorded into a landscape frame. `MOTION_RECORDINGS` entries now
    declare their own viewport (`DESKTOP_VIEWPORT`/`MOBILE_VIEWPORT`), and
    the context/recordVideo size is built from that per entry. Not
    independently pixel-verified (no `ffprobe` locally, same pre-existing
    gap as always) — verified by code/API contract instead
    (Playwright's `recordVideo.size` is fixed at context creation; the fix
    makes that size match the scenario for the first time).
  - Re-ran `evidence:generate` after all 3 fixes: 44/44 entries, gate
    clean (only the expected local `ffprobe`-missing errors, unchanged
    from before).

### E6 — CI truth — CLOSED, VERIFIED IN ACTUAL CI (not just locally-plausible)

- ✅ **Confirmed, fixed, and the real CI run checked directly (job logs, not
  just the green checkmark).** `.github/workflows/exact-head-verify.yml`'s
  own header comment claimed it "runs the same full local suite against
  that literal commit," but its actual steps only ran
  build/build:verify/test:unit/test:e2e/test:a11y — never
  `npm run verify:closure:ci` (`scripts/verify-closure.mjs --ci`), the
  actual complete-closure command. source-policy, contract-coherence,
  production-ownership, semantic-duplication, traceability, the
  115-scenario coverage gate, the generated pairwise/critical-triple
  suites, and the legacy Playwright suites were never exercised by CI at
  all. Fixed: workflow now installs all 3 browsers and runs
  `verify:closure:ci` directly. Verified `verify:closure:local` passes
  cleanly locally first (16/17, cross-browser skipped only for lack of
  local binaries) before trusting the change enough to push it (`10cdfed`).
  **Then pulled the actual job log for the real CI run (run 31370897648,
  commit ad75ef3) rather than trusting the green checkmark alone**: log
  shows `=== verify:closure:ci: SUCCESS (17/17 passed, 0 skipped) ===` —
  every check ran for real in CI, 0 skipped this time (firefox/webkit
  genuinely installed and exercised there, all passing). E6 is genuinely
  closed on real evidence, not an assumption.

### E7–E9 — Freeze, final evidence/owner bundle, terminal state — NOT YET REACHED

Come last, once everything above is genuinely closed — not before.

## Continuation notes for a fresh session

- Branch: `claude/black-bird-system-recomposition-9hpoia` (PR #9). Base:
  `main` @ `5972b2b`. Always re-fetch and diff against the current `main`
  tip before assuming anything about production state — `main` now also
  carries the auto-published `next/` folder (bot commits from the preview
  workflow), which is expected and not a defect.
  - Read order on resume: this file → `EXECUTOR/HORIZON_LOCK.md` →
  `EXECUTOR/ACCEPTANCE_CONTRACT.json` → whichever checklist section is
  next.
- E2 desktop geometry is now fully closed and verified: neutral occupancy,
  focused occupancy, and label overlap all meet the sealed exact bands at
  all 3 desktop viewports (not loosened tests -- real bugs, root-caused,
  fixed, re-measured). The one open E2 item is the mobile secondary-axis
  design question (mathematically proven no uniform-k fix exists; needs
  real design thought before touching code, see above). Next concrete
  step when work resumes: either resolve that, or move on to auditing the
  rest of E2's list (RelO clearing perceptibility, Route/wear/afterglow
  material strength, mobile Field collisions/dense-zoom, the disputed
  1024x640 overlay-leak claim) and E3 (accessibility/interaction) --
  reasonable to interleave since both are currently unverified leads, not
  confirmed defects, and E3's text-zoom-200 item may already be
  side-effect-fixed by the E1 accessibility.css wiring (needs a real check,
  not an assumption).
- Every fix: full local suite + `build:verify` before pushing; push
  triggers the `/next/` republish automatically.
