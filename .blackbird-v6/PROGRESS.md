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

- 🔎 **Occupancy test thresholds weakened vs. sealed contract.**
  `tests/black-bird-world-camera.spec.js` asserts neutral `[0.6, 0.95]` /
  focused `[0.4, 0.95]` where `ACCEPTANCE_CONTRACT.json` requires
  `[0.72, 0.88]` / `[0.58, 0.82]`. Densest-RelO label-overlap test allows
  ≤2 overlaps where the contract requires 0. No test exists yet for
  secondary-axis occupancy, center-offset, or margin-ratio (all new in v6).
  Only 1 of the 7 sealed viewports is covered per metric.
- 🔎 **Secondary-axis occupancy genuinely fails**, confirmed by direct
  measurement (same methodology as the existing test) at all 3 desktop
  viewports: 1440×960 → 0.38, 1280×800 → 0.32, 1024×640 → 0.26, all against
  a 0.52 floor. The field really is wide-and-flat. 1024×640 primary-axis
  (0.93) also exceeds the 0.88 ceiling.
- ❓ **Mobile occupancy** — my ad hoc measurement at the four mobile/landscape
  sealed viewports showed ratios >1.0 (envelope larger than safe rect),
  which would mean severe overflow, but I used a generic measurement script,
  not the mobile chambers' actual activation path
  (`tests/black-bird-mobile.spec.js`, `tests/e2e/mobile-chambers.spec.js`
  have the validated methodology). **Must re-measure with the correct
  methodology before treating this as real** — don't fix against unverified
  numbers.
- 🔎 **Label-overlap solver** is disclosed first-valid-candidate, not
  cost-minimizing (test file's own comment). Needs real rework to reach the
  sealed zero-overlap requirement in the densest RelO cluster, not just a
  tighter test.
- ❓ RelO continuous clearing "almost disappears" perceptually (matrix row
  "RelO") — H-VIS-006 requires positive local-luminance-lift proof within
  the 0.10–0.16 fill band. Not yet independently re-measured.
- ❓ Ordinary/ambient focus material "weak, central labels still congest"
  (matrix row "Ordinary focus") — not yet independently re-measured.
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

- ❓ text-zoom-200 evidence was viewport substitution, not real 200% browser
  zoom — my accessibility.css wiring fix may have removed the reason this
  was faked (the reflow-safety CSS it needed now exists in production);
  needs a real 200%-zoom test to confirm, not assumed fixed as a side effect.
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
- Next concrete step when work resumes: re-measure mobile occupancy with
  the correct methodology (see E2 ❓ above), then design the Field
  composition fix for the confirmed secondary-axis failure, then the
  label-overlap solver rework — in that order, since the composition fix
  changes the geometry the label solver has to work with.
- Every fix: full local suite + `build:verify` before pushing; push
  triggers the `/next/` republish automatically.
