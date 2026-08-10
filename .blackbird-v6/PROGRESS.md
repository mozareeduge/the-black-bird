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
  "Route/wear") — not yet independently re-measured.
- ❓ Mobile Field default collisions, thin relational material, unproven
  dense-zoom k≈2.4 state (matrix row "Mobile Field") — depends on the mobile
  measurement-methodology fix above.
- ❓ 1024×640 "horizontal mobile-sheet band" overlay leak
  (`CURRENT_OBSERVED_STATE.md`) — PR #9's own body says this was
  investigated and did not reproduce in the prior round; re-check once, but
  don't assume either way without looking.

### E3 — Interaction, accessibility, resilience — NOT YET REACHED

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
  a different criterion about genuine zoom behavior, and CDP-level real
  zoom emulation (not CSS zoom) would need investigating when E5 is
  reached, not assumed solved by the accessibility.css wiring.
- ❓ keyboard-edge-focus / tooltip-edge scenarios don't establish their named
  edge cases.
- — everything else in `EXECUTION_DAG.md` E3's list, not yet audited.

### E4 — Scenario proof reconstruction (115 P-SCN) — NOT YET REACHED

- ❓ 115/115 gate currently counts status/evidence strings rather than
  proving scenario-specific execution (`CURRENT_OBSERVED_STATE.md`). Needs
  re-verification of how many of the 115 are real vs. bookkeeping once E2/E3
  are stable (fixing scenario proof for a Field that's about to change
  geometry would be wasted work).

### E5 — Evidence system reconstruction — NOT YET REACHED

- ❓ Several named false/wrong-state evidence artifacts (projected-edge,
  route-long, mobile motion frame size, normal-motion captured as
  reduced-motion, Axe scanner error passing gate). Defer regeneration until
  E2–E4 are stable — evidence should be generated from the real final state,
  not regenerated repeatedly against a moving target.

### E6 — CI truth — NOT YET REACHED

- ❓ Exact-head CI reportedly doesn't run the complete closure command (a
  subset only). Re-verify once there's a stable candidate to run it against.

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
