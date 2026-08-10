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
- ❓ Mobile Field default collisions, thin relational material, unproven
  dense-zoom k≈2.4 state (matrix row "Mobile Field") — depends on the mobile
  measurement-methodology fix above.
- ✅ **1024×640 "horizontal mobile-sheet band" — checked directly, does not
  reproduce.** Screenshotted the live page at 1024×640 in both neutral and
  focused states: clean compact-desktop composition, no mobile-sheet
  styling bleed (1024 is above the 900px mobile breakpoint, so it should
  never see mobile sheet styles at all, and doesn't). Confirms the PR
  body's own "did not reproduce" finding independently, not just repeated
  from it.
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
- **Not done**: my audit checked "does the reference point to something
  real" and "does the note admit weakness" — it did NOT re-read all 115
  scenario *titles* against their referenced tests' actual assertions to
  judge whether each is genuinely scenario-*specific* (vs. real-but-generic
  coverage that happens to also satisfy the scenario). That deeper pass is
  still open if a fully rigorous E4 closure is wanted; what's done so far
  is the mechanical-validity pass plus the specific gaps a systematic
  self-admission scan actually surfaced, not a claim that all 115 are
  individually perfect.

### E5 — Evidence system reconstruction — NOT YET REACHED

- ❓ Several named false/wrong-state evidence artifacts (projected-edge,
  route-long, mobile motion frame size, normal-motion captured as
  reduced-motion, Axe scanner error passing gate). Defer regeneration until
  E2–E4 are stable — evidence should be generated from the real final state,
  not regenerated repeatedly against a moving target.

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
