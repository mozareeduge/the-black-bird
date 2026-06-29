# Black Bird — Decisions and Changelog

This file is the canonical project log. Keep it in the repository root. Update it after every Claude Code round.

## 2026-06-29 — Fix mobile About Field return

Branch: `claude/mobile-about-field-return`
Base file: `index.html`

### Decision

Fix a one-interaction bug: when the mobile About sheet was open and the user tapped bottom-nav `Field`, About did not close — it remained visible over the graph.

### Root cause

The mobile `[data-mobile="field"]` handler called `closeAllDrawers()` and `closeSheet()` but not `closeAbout()`. The About panel is not a drawer and not the sheet, so it was never closed as part of that path. The rest of the Field-return logic (framing, aperture, `returnToField`) ran correctly but remained hidden under the open About panel.

### Fix

Added `if(S.aboutOpen) closeAbout();` at the top of the `if(a==='field')` block in the mobile bottom-nav handler, before the existing conditional that dispatches to the focused-object or `returnToField({source:'mobile-nav'})` path:

```js
if(a==='field'){
  if(S.aboutOpen) closeAbout();
  if(isMobile()&&S.activeId){ ... } else { returnToField({source:'mobile-nav'}); }
  return;
}
```

`closeAbout()` only clears `S.aboutOpen` and `S.aboutOrigin` and removes the panel's `open`/`from-threshold` classes — it does not touch `S.activeId`, `S.routeEvents`, `S.soloSet`, `S.objectVisibility`, `S.viewOptions`, or camera state.

### Changed files

- `index.html`: one line added to mobile bottom-nav Field handler

### Commands run

- `npm run test:data` → PASS: all data integrity checks passed (50 nodes)
- Playwright 7/7 passed (mobile 390×844 + desktop 1280×800)

### Known risks

None.

## 2026-06-29 — Polish About chamber navigation and affordance

Branch: `claude/about-chamber-polish`
Base file: `index.html`

### Decision

Fix five concrete About-chamber regressions found after PR #15 merged: rough threshold link, wrong section-nav scroll offset, primitive close button, missing rail toggle, and mobile overflow risk.

### Root causes

- `.th-about-link` used `text-decoration:underline` + `display:block;text-align:left` — raw, left-stuck under Enter button, clipped browser underline.
- `jumpAboutSection` used `el.offsetTop-16` which is relative to offset parent (not to scroll container), causing scroll to land past the section label.
- Close button reused `.drawer-close` — wrong visual weight for this context.
- Rail `data-action="about"` binding called `openAbout('rail')` unconditionally with no toggle check.
- Mobile About panel had no `max-width:100vw` or `overflow:hidden` guard; tiles/cards lacked `min-width:0` protection.

### Changes

**A — Threshold About affordance**: Replaced crude `text-decoration:underline` approach with `text-decoration:none`, `text-transform:uppercase`, `color:var(--ghost)`, `text-align:center`, `min-width:190px` (matches Enter button), and a `::after` amber hairline that scales in on hover/focus. Mobile override adds `width:100%;min-width:0`.

**B — Section nav scroll**: Rewrote `jumpAboutSection()` to use `getBoundingClientRect()` on both the body container and target section, computing scroll offset relative to the live container. Added `scroll-padding-top:28px` and `scroll-margin-top:28px` as CSS backup.

**C — Panel visual refinement**: Added `.about-close` CSS rule (replaces `.drawer-close` reuse) with muted ghost color, transparent border on idle, `line2` border + bone color on hover/focus. Added `scrollbar-width:thin` to `.about-body`. Changed close button `class="drawer-close"` to `class="about-close"` in HTML.

**D — Rail ABOUT toggle**: Changed action binding from `openAbout('rail')` to `if(S.aboutOpen) closeAbout(); else openAbout('rail')`.

**E — Mobile overflow guards**: Added `.about-panel{max-width:100vw;overflow:hidden}`, `.about-body{overflow-x:hidden}`, `.about-nav{min-width:0}`, `.about-tile,.about-grammar-card,.about-source-row{min-width:0}` in mobile media query.

### Changed files

- `index.html`: About CSS, `jumpAboutSection()`, rail action binding, close button HTML class

### Commands run

- `npm run test:data` → PASS: all data integrity checks passed (50 nodes)
- Playwright desktop 9/9 passed (1280×800, Chromium)
- Playwright mobile 6/6 passed (390×844, Chromium)

### Known risks

- None beyond those noted in PR #15.

## 2026-06-29 — Add compact About chamber (PR: Add compact About chamber)

Branch: `claude/compact-about-chamber-u9tdoo`
Base file: `index.html`

### Decision

Add an internal About chamber to The Black Bird — a compact, scrollable panel that explains the work without turning it into external documentation or a help site.

About is an overlay/chamber, not a graph object. It does not add to Route, does not call `focusObject()`, does not change `S.activeId`, does not refit the graph or move the camera. Closing About restores the previous reading condition by design (the overlay approach means no reader state was displaced).

### Implementation

**State**: Added `S.aboutOpen` and `S.aboutOrigin` to the state object.

**HTML elements added**:
- `#thAboutBtn` — "About the work" secondary link below ENTER THE FIELD on threshold card
- `#mobileAboutBtn` — small mono ABOUT button in map-wrap (mobile only, hidden in threshold/onboarding)
- Rail ABOUT button: replaced `SRC` (data-action="sources") with `ABOUT` (data-action="about"). SRC's `openIndex('sources')` function is preserved internally.
- `#aboutPanel` — new absolutely-positioned chamber with:
  - Header: `About the Work` + close button
  - Section nav: Statement · Read · Grammar · Source · Author (5 anchor buttons)
  - `#aboutBody`: 5 sections with static content

**CSS**:
- `.about-panel`: z-index 35 desktop (above reader panel, below drawers at 30... correction: above drawers too since drawers are z-index 30), 42 mobile (above sheet at 40, below bottom-nav at 45), 65 when `.from-threshold` (above threshold at 60)
- Desktop: slides in from right (`translateX(100%)` to `translateX(0)`), `width: min(640px, calc(100% - 56px))`, bounded to graph+panel area (not covering rail)
- Mobile: full-width, `bottom: calc(56px + env(safe-area-inset-bottom,0px))` so bottom nav remains below it; `.from-threshold` removes bottom offset
- `.th-about-link`: muted mono text link, amber underline on hover/focus
- `.map-about-btn`: hidden desktop, block on mobile with `position:absolute; right:18px; top:20px`; hidden during phase-threshold/onboarding

**JS functions**:
- `openAbout(origin)`: closes drawers/sheet, sets `from-threshold` class, opens panel, marks rail btn active, resets scroll to top
- `closeAbout()`: guard if not open; closes panel, removes active class — does NOT modify route, activeId, solo, view, or graph state
- `jumpAboutSection(id)`: scrolls about-body to section offsetTop
- Escape handler updated: `closeAbout()` called before `closeAllDrawers()` (safe, has early return guard)
- Action binding: `a==='about'` → `openAbout('rail')`

**Content** (5 sections, exact spec wording):
1. Statement — 3 paragraphs
2. How to Read — 7 tiles (FIELD/READ/INDEX/VIEW/SOLO/HIDE/ROUTE), 2-col desktop, 1-col mobile
3. Object Grammar — intro + 6 cards (RNO/MNO/FO/NameO/RefO/RelO)
4. Source and Code — intro + 4 source rows (Live work, GitHub repository, Citation, Version)
5. Author — 1 paragraph

**Source and Code link behavior**: Live work and GitHub links use real existing URLs, open in new tab with `rel="noopener"`. Version field shows "Current GitHub Pages release" (no commit loop). SRC rail button replaced by ABOUT; `openIndex('sources')` function internally preserved.

### Changed files

- `index.html`: CSS block, threshold HTML, map-wrap HTML, rail HTML, aboutPanel HTML, state, Escape handler, action bindings, About functions

### Commands run

- `npm run test:data` → PASS: all data integrity checks passed (50 nodes)
- Manual Playwright smoke: 13 About-specific tests, all passed
  - Threshold About link present and functional
  - Threshold About opens with from-threshold class, closes to threshold
  - Enter field works after closing threshold About
  - Rail ABOUT present, SRC removed
  - Route/activeId/viewOptions unchanged by open/close
  - Escape closes About
  - All 5 sections with correct labels
  - Mobile ABOUT hidden threshold, visible field surface
  - Mobile About opens; bottom nav has 4 items, no ABOUT
  - S.aboutOpen/S.aboutOrigin state correct
  - ABOUT rail btn active class toggles correctly

### Known risks

- `@playwright/test@1.45.0` in local node_modules expects chromium-1124 (not available); tests run using system playwright with system chromium-1194
- About panel z-index (35) sits above drawers (30) on desktop — when About is open, drawers are inaccessible. This is intentional: `openAbout()` closes all drawers before opening About.
- Mobile ABOUT button is inside `.map-wrap` (overflow:hidden) — positioned at right:18px top:20px, well within bounds.

## 2026-06-27 — Desktop handoff dissolve polish (PR #14)

Branch: `claude/desktop-handoff-dissolve`
Base file: `index.html`

### Problem

PR #13 masked all visible state jumps during desktop `finishOnboarding()`, but the graph transition was still a hard instantaneous blackout (opacity 0 instantly applied). No easing or dissolve.

### Decision

Make `beginGraphHandoff` and `endGraphHandoff` async and add opt-in fade support via `{fade:true, duration:N}`:

- `beginGraphHandoff({fade:true,duration:180})` — CSS `opacity` transition to 0 over 180ms, then resolves.
- `endGraphHandoff({fade:true,duration:260})` — sets opacity:0, sets transition, waits one frame, clears opacity (triggers fade-in to natural state), waits for transition to complete.
- `prefersReducedMotion()` guard: both functions skip CSS transitions when reduced motion is active.
- All existing callers (mobile Field nav, `startTacitOnboarding`, `enter`) pass no opts — instant behavior preserved.
- Only `finishOnboarding()` desktop path uses `{fade:true}`.

### Changed files

- `index.html`: `beginGraphHandoff`, `endGraphHandoff`, desktop `finishOnboarding()` path

### Commands run

- Playwright frame inspection at 1920×920 and 1440×900
- Data integrity check: 50 nodes, no console errors

### Visual test results

**1920×920**: f03 (t≈600ms) graph partially faded (dissolve visible), f04 fully masked, f05 reader+graph both dark under mask, f06 final focused state with aperture and reader. No hard cut.

**1440×900**: Settled final state — `phase-focused surface-field`, Black Bird active, split-pane, aperture applied, SVG opacity cleared. No errors.

### Known risks

- CSS transition timing depends on the browser compositing `opacity:''` as a from-0 start. Works correctly in Playwright Chromium 1194. May degrade gracefully in very old browsers (falls back to instant if `prefersReducedMotion()` returns true or if `fade` opt is not set).

---

## 2026-06-27 — Final desktop onboarding handoff sequence (PR #13)

Branch: `claude/final-desktop-handoff-sequence`
Base file: `index.html`

### Problem

After PR #12, the desktop `finishOnboarding()` flow still showed three visible graph states:
1. Full-width onboarding field (all nodes, no aperture, no focus) — correct
2. Reader/split layout opens; graph recomposed once — **visible unfocused graph in split pane**
3. Black Bird focus/aperture applied after reveal — **second visible recomposition**

Root cause: in PR #12, `endGraphHandoff()` fired AFTER `setReaderOpen` and `fitVisibleField`, but BEFORE `focusObject`. So all of focusObject's side-effects — aperture, lighting, route memory, reader render — happened after the graph was revealed, producing visible state 3. Additionally, `beginGraphHandoff()` was called AFTER `setReaderOpen(680ms)`, leaving the graph visible in its unfocused state during the 680ms reader-opening animation (state 2).

### Decision

Restructure desktop `finishOnboarding()` to:
1. Call `beginGraphHandoff()` BEFORE `setReaderOpen()` — graph is masked before the reader-opening animation, so the split-pane resize and viewBox change are invisible.
2. Call `focusObject()` under the mask with all durations at 0 (aperture, lighting, route, reader).
3. After `focusObject()` returns, re-measure and place camera with `fitVisibleField({duration:0})`.
4. Only then call `endGraphHandoff()` — graph fades in with complete final state already applied.

Split the function into explicit mobile/desktop paths; mobile path is identical to its pre-PR-12 behavior.

### Visual test results (Playwright frame inspection)

**1920×920:**
- Mask active before reader opens: both panes dark during 680ms reader transition
- No unfocused graph state visible
- Final state (Black Bird active, aperture, reader content) appears in one smooth 240ms fade
- State stable for 1.5s+ — no movement after reveal
- No aperture/focus visible after reveal

**1440×900:**
- Same pattern — single controlled handoff
- Constellation sits slightly low (lower-center of left pane) — pre-existing characteristic of force simulation equilibrium position when recentered to split-pane dimensions; not introduced by this PR

### Changed files

- `index.html`
- `BLACK_BIRD_DECISIONS_CHANGELOG.md`

### Commands run

- `npm run test:data` → PASS (50 nodes)
- Playwright frame capture at 1920×920 (20 frames at 200ms intervals)
- Playwright frame capture at 1440×900 (10 frames at 250ms intervals)

### Known risks

- The graph is masked during the full reader-opening animation (680ms). Users see a dark left pane while the reader slides in. Per the task spec, "graph may briefly fade/soften or be hidden during the handoff" — this is acceptable.
- At smaller viewports (1440×900), the constellation sits slightly below center. This is the force simulation's natural equilibrium after split-pane recentering, not a bug in the handoff sequence. If the user requests vertical centering improvement, that is a separate concern.
- Mobile path is unchanged.

---

## 2026-06-27 — Final entry/surface handoff repair (PR #12)

Branch: `claude/final-entry-surface-handoff`
Base file: `index.html`

### Problems

1. Desktop first-focus still animated/jumpy after reader pane opens during onboarding handoff.
2. Mobile threshold exit shows graph bleeding through fading threshold card.
3. Mobile Read→Field nav reveals graph before camera has settled on active object.
4. Mobile focused-field active object can land too close to edges/cropped.
5. Mobile bottom nav overlaps system home indicator on phones with safe areas.

### Decision

Introduce a graph-handoff opacity mask (`beginGraphHandoff` / `endGraphHandoff`) that hides the SVG before any surface transition that repositions the camera, then fades it in once the camera is already positioned. Use `setCamera()` (immediate `zoom.transform`) instead of animated `animateCamera()` during handoff setup so no pan/zoom motion is ever visible. Add `padX`/`padY` opts to `fitFocusFrame` for the Read→Field path to ensure active node lands with comfortable clearance.

For mobile safe area: extend all `calc(100dvh - 56px)` and `padding-bottom:56px` values with `env(safe-area-inset-bottom,0px)` in `@media(max-width:860px)`.

### Changed files

- `index.html`
- `BLACK_BIRD_DECISIONS_CHANGELOG.md`

### Commands run

- `npm run test:data` → PASS (50 nodes)

### Known risks

- `beginGraphHandoff` hides the SVG synchronously; if `endGraphHandoff` is somehow not called (e.g. an early return in a branch), the graph stays invisible. All call sites are audited. `prefers-reduced-motion` skips the fade and removes opacity immediately.
- `setCamera` uses `zoom.transform(svg, t)` which fires the zoom event synchronously and updates `S.transform`; this is correct.
- Mobile safe-area env() falls back to 0px on non-notch devices — no layout change there.

## 2026-06-27 — Repair desktop Black Bird landing camera after onboarding

Branch: `claude/desktop-landing-camera-repair`
Base file: `index.html`

### Problem

After PR #10, desktop onboarding no longer had a premature `fitFocusFrame` before the reader opened. But `finishOnboarding()` still ended by calling `focusObject()`, which unconditionally called `fitFocusFrame()` on desktop. `fitFocusFrame` computed bounds for the Black Bird focus set (Black Bird + close neighbors) and placed it at `getFocusBiasY()=0.56` (below center) with a zoom of 0.72–1.35x. After the reader panel had already opened and layout was stable, this produced a camera dive from overview into a lower-left zoomed composition — visible to the user as an abrupt jump after the reader appeared.

### Root cause

`focusObject()` line 812: `if(!(isMobile()&&S.surface==='read')) fitFocusFrame(...)`. No way to suppress this for the initial desktop landing without breaking later node focus behavior.

### Fix

Two-line change (one line modified, two lines added):

1. Added `opts.camera!==false` guard to the `fitFocusFrame` call in `focusObject()`. When `camera:false` is passed, the focus-frame camera is skipped; everything else (activeId, route, aperture, lighting, reader render) proceeds normally. All existing callers pass no `camera` option, so `opts.camera` is `undefined` → `undefined!==false` → `fitFocusFrame` fires as before. No existing behavior changed.

2. In `finishOnboarding()`: added `camera:isMobile()?undefined:false` to the `focusObject` options. On desktop, `camera:false` suppresses `fitFocusFrame`. On mobile, `camera:undefined` leaves existing behavior unchanged.

3. Added `if(!isMobile()) fitVisibleField({duration:680})` after `focusObject` returns. This lands the desktop first view as a composed visible-field scene — the full constellation centered in the split pane with 88px padding — not a zoomed focus-cluster shot.

Global `fitFocusFrame` behavior for later desktop node clicks is completely unchanged.

Changed files: `index.html`, `BLACK_BIRD_DECISIONS_CHANGELOG.md`
Commands run: `npm run test:data` (PASS, 50 nodes)
Known risks: None. Mobile contract, later desktop focus, route logic, ontology, and prose are all unchanged.

---

## 2026-06-27 — Desktop entry framing polish: threshold font gate, onboarding camera, duplicate controls

Branch: `claude/desktop-entry-framing-polish-azsjpe`
Base file: `index.html`

### Problem 1: Threshold font flash (FOUT)

The `.threshold-card` rendered immediately at `opacity:1` while Google Fonts (IBM Plex Mono, Crimson Pro) loaded asynchronously with `display=swap`. This caused visible fallback typography on cold load before the final font settled.

Fix: Added `opacity:0; transition:opacity 360ms ease` to `.threshold-card` CSS. Added a IIFE JS font-ready gate using `document.fonts.ready` with a 1600ms fallback `setTimeout`. The card reveals (`opacity:1`) when fonts are ready or at timeout, whichever comes first. `prefers-reduced-motion` CSS rule (`transition:none!important`) suppresses the fade; opacity still resolves to 1.

### Problem 2: Desktop onboarding camera jump and bad Black Bird framing

`finishOnboarding()` called `fitFocusFrame()` while the map was still full-width, then immediately called `setReaderOpen(true)` (which shrank the map to ~58vw over 680ms), then called `focusObject()` which triggered a second `fitFocusFrame()` on the new split-pane dimensions. The result: two competing camera fits with changing layout metrics, producing an abrupt jump and Black Bird landing near the lower-left edge.

Fix: On desktop, skip the early `fitFocusFrame` call in `finishOnboarding()` (guarded with `if(isMobile())`). Open the reader panel first (`setReaderOpen` with `waitTransition:true`), add one `await nextFrame()` for layout to settle, then let the single `focusObject` call at the end perform the final camera fit on stable split-pane dimensions. Mobile path unchanged.

### Problem 3: Duplicate Field/View buttons on desktop

`.map-tools` (containing `#fieldBtn` / `data-action="view"`) was `display:flex` in the base CSS rule, visible on desktop during field and focused phases. The left rail already provides FIELD/VIEW/INDEX/SRC. Two identical controls were visible simultaneously on desktop.

Fix: Changed `.map-tools` base rule from `display:flex` to `display:none`. `#fieldBtn` remains in DOM (its `onclick` listener at line 1147 is unaffected). The mobile media query (`display:none!important`) is now redundant but harmless. The left rail is unchanged.

Changed files: `index.html`, `BLACK_BIRD_DECISIONS_CHANGELOG.md`
Commands run: `npm run test:data` (PASS, 50 nodes), Playwright (pre-existing browser version mismatch in env — 29 failures on both main and branch; not caused by these changes)
Known risks: None. Mobile contract, route logic, ontology, and prose are all unchanged.

---

## 2026-06-26 — Visual polish: mobile solo framing + reader bottom padding

Branch: `claude/mobile-solo-reader-polish`
Base file: `index.html`

Goal: Address two non-blocking visual concerns from audit v3 (2026-06-26).

### Problem 1: Solo subgraphs biased to lower-center of mobile Field viewport

`fitVisibleField` centers on `height/2` (50%). For mobile solo views where the cluster is small and compact, this placed the cluster in the lower half, leaving empty dark space above the header. Added a conditional vertical bias for mobile+solo: `height * 0.42` instead of `height / 2`. The guard `isMobile() && S.soloSet` ensures desktop and non-solo field views are unaffected.

### Problem 2: Corpse Read last RelO row clipped at mobile reader container edge

On 390×844 mobile, the reader container (panel height − route height) was 788 − 50 = 738px. Corpse Read content (5 appears-in items with multi-line labels + 5 RelO rows + section headers + padding) exceeded this by ~5-15px, placing the last RelO row at the reader container's lower edge. Fixed by:
- Reducing mobile route strip from `height:50px` to `height:44px` (+6px for reader)
- Reducing mobile reader top padding from `34px` to `26px` (+8px effective content space)
- Combined: reader gains 14px, last row now clearly visible above the container edge

### Changes
- `index.html`: 3 targeted edits (1 JS line in `fitVisibleField`, 2 CSS values in `@media (max-width:860px)`)
- `playwright.config.js`: Changed `executablePath` to use the `/opt/pw-browsers/chromium` symlink (was hardcoded to `chromium-1194` which Playwright 1.45.0 ignores when `PLAYWRIGHT_BROWSERS_PATH` is set)
- `BLACK_BIRD_DECISIONS_CHANGELOG.md`: this entry

### Not changed
- Ontology, node labels, prose, poem text, RelO IDs — unchanged
- Interaction contract — unchanged (node tap stays field, Read → read, Index solo → field)
- Preview sheet — not added
- Tests — not changed (existing 29 smoke tests all pass)
- Screenshot baselines — not changed (tests use path-based screenshots, no `toMatchSnapshot`)
- Dependencies — not changed

### Validation
- `npm run test:data` → PASS (50 nodes)
- `npm test` → 29/29 PASS
- Visual audit v4: solo Corpse cluster now upper-center; solo Allah/Odin/God shifted upward; Corpse Read all 5 RelO rows visible with breathing room above nav
- No desktop regression (bias guard is mobile+soloSet only)

Known risks: none. The solo bias of 0.42 shifts clusters up by ~63px on 788px mapWrap. Clusters with very few nodes may still have empty lower space (inherent to compact soloSets). The route height reduction (50→44px) is uniform across all mobile states where the route strip is shown.

## 2026-06-26 — Phase 2B-emergency: Real onboarding surface contract tests

Branch: `claude/emergency-mobile-read-solo-contract`
Base file: `index.html`

Goal: Add reproduction tests for reported mobile bugs (node tap jumps to Read after returning from Read; Index solo goes to Read instead of Field) using the REAL onboarding flow without `skipIntro=1`.

Diagnosis:
- Bug 1 (node tap jumps to Read after returning from Read) and Bug 2 (Index solo goes to Read) were reported by user on live mobile.
- Investigation showed: existing tests (7, 9, 11, 23) covered these behaviors but used `skipIntro=1` (direct entry), bypassing the real onboarding flow.
- Running new tests with the REAL onboarding path (`enter()` → tacit onboarding → `finishOnboarding()` → `focusObject`) revealed that the existing code from Phase 2B already handles these cases correctly: `selectInField` sets `S.surface='field'` and the CSS `surface-field.phase-focused .panel { display:none!important }` hides the reader panel; the `[data-solo]` handler sets `S.surface='field'` before rendering.
- The previous Phase 2B PR fixed the code. The gap was test coverage: no tests verified the real onboarding sequence.

Fix applied:
- No code changes to `index.html` were needed — the behaviors are already correct.
- Three new Playwright tests added (27, 28, 29) covering the real onboarding path without `skipIntro=1`:
  - Test 27 (Real onboarding → Read → Field → node tap stays Field): uses `reducedMotion` to collapse onboarding, enters without skipIntro, taps Read, returns to Field, taps a non-Black-Bird node, asserts `surface-field`.
  - Test 28 (Real Read → Index → solo goes to Field): enters without skipIntro, taps Read, opens Index, taps solo for Corpse, asserts `surface-field`.
  - Test 29 (Top mobile controls hidden after real onboarding): verifies `.map-tools` is hidden and bottom nav is visible.

Files changed:
- `tests/black-bird-smoke.spec.js` — tests 27, 28, 29 added
- `BLACK_BIRD_DECISIONS_CHANGELOG.md` — this entry
- `TESTING_REPORT.md` — updated

Commands run:
- `npm run test:data` — PASS (50 nodes)
- `npm test` — PASS (29/29)

Known risks:
- As noted in Phase 2B changelog: `selectInField` uses `setReaderOpen(true)` to ensure the `reader-open` CSS class is present (needed for the `surface-field` override rules to apply). This is counter-intuitive but required by the CSS contract.
- The real onboarding tests use `reducedMotion` to avoid multi-second waits. Without it, the onboarding would take ~8+ seconds in tests.

## 2026-06-26 — Phase 2B: Mobile Field solo and Index behavior

Branch: `claude/mobile-field-solo-index`
Base file: `index.html`

Goal: Fix mobile graph interaction contract, solo behavior, Index flow, route-line state logic, and duplicate mobile controls.

Decisions:

- **Mobile node tap → Field select (not Read)**: Introduced `selectInField(id)` function. Mobile graph node tap now calls this instead of `focusObject`. Updates `S.activeId`, sets `phase=focused`, keeps `surface=field`, applies local aperture, fits focus frame, registers route event. User stays in graph. Bottom Read button then opens the selected object.

- **Solo computation via RelO participation**: Replaced adjacency-based `new Set([id,...adj[id]])` with `computeSoloSet(id)`. New algorithm: find all RelOs whose participant arrays contain `id`, add them to solo set, then add all their participants. Black Bird appears in solo only when it's a participant in one of the target object's RelOs — not forced into every solo.

- **Index `solo` → Field solo (not Reader)**: Updated `[data-solo]` handler in `renderObjectRows` to: set `S.soloSet` from `computeSoloSet`, set `S.activeId`, set `phase=focused`, set `surface=field`, call `updatePhaseClass`, close drawers, register route event, set reader open on mobile (for surface CSS to work correctly), apply focus lighting, fit field. Does NOT render reader, does NOT switch surface to read.

- **Show All clears solo and returns to overview**: Updated to call `closeAllDrawers()` and `returnToField()` after clearing visibility and soloSet. Previously only updated visibility in-place.

- **Restore Field clears solo and returns to overview**: Same as above — now calls `returnToField` after restoring defaults.

- **Inline links in Read stay in Read on mobile**: Changed `inlineHandlers` click handler to explicitly pass `openReader:true` when `isMobile() && S.surface==='read'`. This keeps user in Read when following links inside the reader panel.

- **Route lines conditioned by solo state**: In `routeSegments()`, added a check: when `S.soloSet` is active, skip any route segment where either endpoint is not in the solo set. This prevents long diagonal artifacts from pre-solo route history crossing the filtered graph.

- **updateVisibility redraws route memory**: Added `drawRouteMemory({duration:0})` call inside `updateVisibility()` so route segments are immediately recalculated whenever solo state or visibility changes.

- **Top mobile controls hidden**: Added `.map-tools{display:none!important;}` inside the `@media (max-width:860px)` block. The top Field and View buttons were duplicating bottom nav. Desktop rail and top tools unaffected.

- **Tests updated and added**: Tests 7, 9, 11 updated to reflect new mobile node tap → Field (not Read) contract. Tests 22–26 added covering: solo computation correctness, Index solo → Field, mobile top controls hidden, route lines in solo, Black Bird conditional in solo.

Files changed:
- `index.html` — `selectInField` function, `computeSoloSet` function, updated `[data-solo]` handler, updated Show All, Restore Field, inline link handlers, route segment solo filter, `updateVisibility` calls `drawRouteMemory`, mobile CSS hides `.map-tools`
- `tests/black-bird-smoke.spec.js` — tests 7/9/11 updated; tests 22–26 added
- `BLACK_BIRD_DECISIONS_CHANGELOG.md` — this entry

Commands run:
- `npm run test:data` — PASS (50 nodes)
- `npm test` — PASS (26/26)

Known risks:
- `selectInField` uses `setReaderOpen(true)` to ensure mobile layout CSS is applied correctly (surface-field hides .panel when reader-open class is present via CSS). This is slightly counter-intuitive but required by the CSS rules from Phase 1.
- `returnToField` called from Show All and Restore Field will clear `S.activeId` — this is correct for returning to overview state.

## 2026-06-26 — Phase 2A: Entry and MNO Reader integrity

Base file: `index.html`

Goal: Fix entry subtitle copy, center threshold button, repair MNO poem line integrity, prevent MNO reader font-size jump, and eliminate stale reader content flash on object transitions.

Decisions:

- **Entry subtitle**: Removed "SPECULATIVE" from threshold card `.sub`. Now reads `A HYPERGRAPH RESEARCH POEM`. Map header subtitle `HYPERGRAPH POEM` unchanged.
- **Button alignment**: Added `text-align:center` to `.th-actions button` base rule. Changed mobile override from `text-align:left` to `text-align:center`. Covers both desktop and mobile.
- **MNO line integrity (root cause)**: CSS rule was `.poem span{display:block}` — this made every `<span>` inside `.poem` a block element, including nested `.fl` link spans. Changed to `.poem > span{display:block}` so only direct-child line spans become block; nested `.fl` spans stay inline. This is the primary structural fix; no poem text content was changed.
- **MNO stable first paint**: In `renderTextNode`, for MNO type, reader content is set with opacity 0 first, then `document.fonts.ready.then(...)` reveals it with a 0.12s fade. Skipped entirely when `prefers-reduced-motion` is active. This prevents the fallback-to-webfont reflow jump visible on first MNO open.
- **Stale reader flash**: In `focusObject`, immediately before the `readerDelay` setTimeout, the reader `innerHTML` is cleared and `scrollTop` reset to 0. This ensures no stale content from the previous object is visible during the transition; the reader shows a neutral empty state during the 160ms delay.
- **@playwright/test**: Updated from `^1.45.0` to `1.56.1` to match the pre-installed Chromium 1194 binary in `/opt/pw-browsers`.

Files changed:
- `index.html` — subtitle text, button text-align CSS (×2), `.poem > span` selector fix, MNO font-ready opacity reveal in `renderTextNode`, reader clear + scroll reset in `focusObject`
- `tests/black-bird-smoke.spec.js` — added tests 15–21 (entry subtitle, mobile button alignment, MNO inline checks ×4, reader transition stale content)
- `package.json` / `package-lock.json` — @playwright/test bumped to 1.56.1
- `BLACK_BIRD_DECISIONS_CHANGELOG.md` — this entry

Commands run:
- `npm run test:data` — PASS (50 nodes)
- `./node_modules/.bin/playwright test` — 21/21 passed

Known risks:
- `document.fonts.ready` resolves on first font load; on second visit to same MNO the promise resolves instantly, so no delay. No risk of long blank waits.
- The 160ms empty-reader state on focus transitions is visually neutral (dark background matches panel). No visible white flash.
- Ontology unchanged. RNO/MNO words unchanged. No new modes or icons.

## 2026-06-25 — Verification tightening and repository hygiene (Phase 1 follow-up)

Base file: `index.html`

Goal: Tighten test verification and fix geometry guard without changing the approved mobile two-chamber design.

Decisions:
- `safeCoord()→0` pattern removed. `updateGraphGeometry()` and `drawRouteMemory()` now use `.each()` — only write SVG attributes when all four coordinates are finite; leave existing attribute values unchanged if any coord is non-finite. Eliminates phantom edges drawn to SVG origin (0,0).
- Test 6 rewritten to exercise real onboarding (not `?skipIntro=1`): uses `emulateMedia({reducedMotion:'reduce'})` for fast animations, waits on observable `surface-field` class, asserts Black Bird focus ring is active.
- Test 8 renamed and strengthened: first clears `activeId` by clicking empty SVG area, waits for `phase-field` class, then asserts specifically `FO.BLACK_BIRD_FIELD` in reader `.meta` element.
- Test 11 rewritten: records `tappedId` via `parentElement.__data__?.id` before tap, verifies identity in Read `.meta`, verifies `phase-focused` class preserved after Field return, checks focus ring active on that node, checks node in central safe viewport region, checks route non-empty, re-opens Read and verifies same ID.
- Test 14 added: verifies no SVG line has all four attrs at origin (`x1="0" y1="0" x2="0" y2="0"`) and no non-finite attribute values — the phantom-edge regression test for the old `safeCoord` pattern.
- `test-results/.last-run.json` removed from git tracking; added to `.gitignore`. Screenshots preserved.

Files changed:
- `index.html` — removed `safeCoord()`; rewrote `updateGraphGeometry()` with `.each()` last-finite pattern; rewrote `drawRouteMemory()` enter.merge block with same pattern
- `tests/black-bird-smoke.spec.js` — rewrote tests 6, 8, 11; added test 14; total now 14 tests
- `.gitignore` — added `test-results/.last-run.json`
- `BLACK_BIRD_DECISIONS_CHANGELOG.md` — this entry
- `TESTING_REPORT.md` — updated with 14/14 results

Commands run:
- `npm run test:data` → PASS (50 nodes)
- `npm test` → 14/14 passed (3.9m)

Known risks:
- Test 6 timeout set to 8s for `surface-field` class; real-device onboarding timing may vary.
- `drawRouteMemory` enter block no longer sets initial coordinates — lines are invisible until the next tick when coordinates become finite. On settled sims this is instantaneous; on very early ticks there may be a single frame without route lines, which is imperceptible.

---

## 2026-06-25 — Mobile two-chamber repair (Phase 1)

Base file: `index.html`

Goal: Emergency mobile viability repair — separate Field Chamber (graph) from Read Chamber (full-screen reader). Fix SVG NaN geometry errors. Reduce RelO label collision on mobile.

Decisions:
- Mobile onboarding ends in Field Chamber (graph overview), not Read. On desktop, onboarding still ends in focused+reader-open state.
- Mobile node tap now goes directly to full Read (no sheet detour). Sheet remains only for projected edge info.
- Mobile Read button opens FO.BLACK_BIRD_FIELD as fallback when no object is focused.
- Mobile Field button (from Read) returns to graph centered on current object — does not clear activeId. Graph lighting preserves focused state.
- SVG geometry: added `safeCoord()` guard — all line x1/y1/x2/y2 attributes now guard against NaN/Infinity. Route memory segments also guarded.
- RelO and RefO labels are fully hidden on mobile at all zoom levels (they caused dense label collisions). On desktop, existing threshold (k < 1.15) is preserved.
- Data ontology: unchanged. RNO/MNO prose: unchanged.

Files changed:
- `index.html` — `safeCoord()` + `updateGraphGeometry()` NaN guard; `drawRouteMemory` NaN guard; `updateLabelVisibility` RelO/RefO mobile suppression; `finishOnboarding` mobile ends in Field; node click handler direct focusObject on mobile; mobile nav 'read' button with FO.BLACK_BIRD_FIELD fallback; mobile nav 'field' button two-chamber return; `enter({skipOnboarding:true})` mobile Field path
- `tests/black-bird-smoke.spec.js` — expanded from 5 to 13 tests; added mobile two-chamber tests 6–13; screenshots: mobile-field-overview, mobile-node-tap-read, mobile-read-black-bird, mobile-return-field-focused, desktop-smoke
- `BLACK_BIRD_DECISIONS_CHANGELOG.md` — this entry

Commands run:
- `npm run test:data` → PASS (50 nodes)
- `npm test` → 13/13 passed

Screenshots verified:
- mobile-field-overview: full-height graph, Black Bird centered, no reader
- mobile-node-tap-read: full-screen reader (RNO prose + refs + object chips)
- mobile-read-black-bird: full-screen reader for FO.BLACK_BIRD_FIELD (appears-in list)
- mobile-return-field-focused: graph centered on tapped node, focus aperture ring visible
- desktop-smoke: graph+reader split with onboarding prompt — unchanged from prior

Known risks:
- Chromium symlink `/opt/pw-browsers/chromium-1124 → chromium-1194` required for @playwright/test 1.45.0 in this environment.
- Mobile aperture visual quality and real-device font rendering need physical device QA.
- Google Fonts still loaded from CDN.

---

## Round: Add FO.GOD field object (2026-06-24)

- **base file:** `index.html`
- **decision:** Added `FO.GOD` as a central FO. Connected to Quranic mediation structure via `RelO.R9C3F1A62` (participants: FO.GOD, FO.ALLAH, FO.BLACK_BIRD_FIELD, NameO.AR.GHURAB, FO.CAIN, FO.CORPSE, FO.BURIAL) and to Norse structure via `RelO.RB6E74D1A` (participants: FO.GOD, FO.ODIN, FO.BLACK_BIRD_FIELD, NameO.ON.HRAFN, FO.HUGINN, FO.MUNINN, FO.BATTLEFIELD, FO.CORPSE). FO.GOD added to objects lists for RNO.GHURAB_BURIAL__424A0ECF and RNO.HUGINN_MUNINN_RETURN__E0CB0303. No RNO/MNO body prose altered. FO.ALLAH and FO.ODIN remain separate. No direct Allah–Odin RelO added.
- **changed files:** `index.html`, `tests/black-bird-data-integrity.cjs`, `BLACK_BIRD_DECISIONS_CHANGELOG.md`, `docs/PROJECT_STATE.md`, `TESTING_REPORT.md`
- **commands run:** `npm run test:data` → PASS (50 nodes); `npm test` → browser smoke deferred to GitHub Actions
- **known risks:** None — additive only, no existing objects or relations modified.

## Round: Ontology ID Singularity + Approved RNO Copy (2026-06-24)

- **base file:** `index.html`
- **decision:** Migrated all ordered ontology IDs (RNO.04.x, MNO.04/05, RefO.04.x, RefO.05.1, RelO.04.x, RelO.05.x, RelO.MNO.04/05) to singular non-sequential content-hash IDs. Applied approved RNO bodies. Added FO.ALLAH, RefO.SAYERS_HUGINN_MUNINN_CORPSE__C003F76E, RefO.NI_MHAOLDOMHNAIGH_SCALD_CROW__694164EE. RelO labels set to opaque IDs; RelO shortLabels set to rel·XXXX forms. NameO attachment arrays updated to new RNO IDs. Added durable data integrity validator. Added Playwright Smoke GitHub Actions workflow.
- **changed files:** `index.html`, `tests/black-bird-data-integrity.cjs` (new), `package.json`, `.github/workflows/playwright-smoke.yml` (new), `BLACK_BIRD_DECISIONS_CHANGELOG.md`, `docs/PROJECT_STATE.md`, `TESTING_REPORT.md`
- **commands run:** `npm run test:data` → PASS (47 nodes); `npm test` → blocked (Chromium not installable in remote container; deferred to GitHub Actions)
- **known risks:** Browser smoke must be verified via GitHub Actions CI on the PR branch. No visual/layout changes were made.

## Current direction

The Black Bird is being stabilized as a single-file HTML artifact before any full repo migration. The next architecture may use Vite/TypeScript/D3 modules, but not until the experience is stable.

## Standing decisions

- Keep the current object ontology: `RNO`, `MNO`, `FO`, `NameO`, `RefO`, `RelO`.
- Keep the work as a speculative research poem, not a dashboard.
- Do not separate poem and research into preset lenses.
- Do not use representational icons for object types.
- Do not restore cluster labels.
- Treat route as bounded focus-history, not breadcrumb navigation.
- Treat mobile as a separate interaction flow, not compressed desktop.
- Use local aperture for dense graph areas instead of permanently spacing the field.
- Maintain a single overlay stack: drawers, sheets, previews, and route drawer should not layer unpredictably.

## Version notes

### V5.6-nightly — governed interaction repair

Base file: `the_black_bird_v5_clean_v3(2).html` or latest single-file HTML equivalent.

Decisions:
- Keep a single-file HTML build for the nightly round.
- Add explicit phase/surface/overlay logic inside the single-file build.
- Desktop remains graph + reader split.
- Mobile becomes two-surface: Field and Read.
- Dense graph areas use temporary local aperture on focus.
- Overlays should close or replace incompatible overlays.

Known risks:
- Mobile Read/Field switching needs real-device QA.
- Local aperture needs visual tuning around very dense neighborhoods.
- Desktop Black Bird first focus should be checked on the laptop viewport.

### Testing harness round — pending

Planned decision:
- Add Playwright smoke tests for desktop onboarding, Field refit, dense aperture evidence, mobile Field surface, and mobile Read surface.
- No app behaviour changes in this round.

Files expected:
- `package.json`
- `playwright.config.js`
- `tests/black-bird-smoke.spec.js`
- `TESTING_REPORT.md`
- `BLACK_BIRD_DECISIONS_CHANGELOG.md`

## 2026-06-22 — Final visual QA and mobile Field surface fix

Base file: `index.html`

Decision:
- Fixed test 4 locator: the mobile Field button inside `.map-wrap` (`#fieldBtn`) is hidden when `surface-read` is active, so `isVisible()` returned false and the click was skipped. Updated the locator to `[data-mobile="field"]` (bottom-nav Field button), which is always visible on mobile.
- Increased the post-click wait from 600ms to 800ms to ensure surface transition completes before screenshot.
- Tightened the mobile-04 assertion: `#mapWrap` height must now exceed 400px (full-height graph surface) rather than 200px.

Files changed:
- `tests/black-bird-smoke.spec.js` — mobile Field button locator fix

Commands run:
- `npm test` — 5/5 passed

Screenshots saved:
- `qa/final-visual-qa/` — all 9 smoke screenshots

Visual QA summary:
- Desktop threshold: PASS — centered card, no noise.
- Desktop after onboarding: PASS — graph centered in field, onboarding prompt visible.
- Desktop field refit ×3: PASS — graph visible in split view (≥85% nodes in viewport).
- Desktop dense aperture: PASS — reader pane + focused state screenshot captured.
- Mobile Field surface: FIXED — now correctly shows full-height graph-only surface with bottom nav.
- Mobile Read surface: PASS — reader occupies full surface, bottom nav visible and clickable.

Known risks:
- Desktop graph appears slightly small in split view during field refit; camera centering could be tightened in a later round.
- Local aperture visual quality still requires human review on real devices.
- Google Fonts still loaded from CDN.

## 2026-06-22 — Canonical artifact and changelog cleanup

Base file:
- `index.html` (promoted from `the_black_bird_v5_6_nightly.html`)

Goal:
- Establish `index.html` as the single active root artifact.
- Rename `BLACK_BIRD_DECISIONS_CHANGELOG(1).md` to canonical `BLACK_BIRD_DECISIONS_CHANGELOG.md`.
- Update all references in tests, README, docs, and reports.

Files changed:
- `index.html` — new canonical root (copy of patched nightly with local D3)
- `archive/old-builds/the_black_bird_v5_6_nightly.html` — nightly moved here for reference
- `BLACK_BIRD_DECISIONS_CHANGELOG.md` — this file; renamed from `(1)` variant
- `tests/black-bird-smoke.spec.js` — PAGE_URL updated to `index.html`
- `README.md` — references updated to `index.html`
- `docs/PROJECT_STATE.md` — main file updated to `index.html`; archive note added
- `TESTING_REPORT.md` — main HTML file updated to `index.html`

Commands run:
- `npm test` — 5/5 passed

Decisions:
- `index.html` is now the canonical deployment artifact.
- Old nightly filename retained in `archive/old-builds/` for reference only.
- Changelog duplicate removed.

Known risks / next step:
- None introduced. Existing risks unchanged (mobile QA, aperture tuning, Google Fonts CDN).

## 2026-06-22 — GitHub Pages deployment readiness

Base file: `index.html`

Decision:
- Verified repo is ready to publish from GitHub Pages branch root. No changes to `index.html`.
- `.gitignore` confirmed safe: only `node_modules/` and `playwright-report/` are ignored.
- `vendor/d3.v7.9.0.min.js` loads via relative path — resolves correctly under the Pages subdirectory URL (`/Claude-Playground-/vendor/...`).
- `README.md` updated with Deployment section (GitHub Pages UI steps, expected URL) and Custom Domain Later section (Cloudflare Registrar + DNS recommendation).
- No `CNAME` file added; no DNS records configured yet. Custom domain deferred until a domain is chosen.

Files changed:
- `README.md` — added Deployment and Custom Domain Later sections
- `docs/PROJECT_STATE.md` — added deployment readiness note

Commands run:
- `npm test` — 5/5 passed

Known risks:
- Repository name `Claude-Playground-` contains a trailing hyphen; GitHub Pages URL will include it verbatim: `https://mozareeduge.github.io/Claude-Playground-/`. Verify this resolves correctly after enabling Pages.
- If the branch is not merged to `main` before Pages is enabled, the user must select the working branch (`claude/inspiring-euler-2fakpj`) as the source branch in Pages settings.

## 2026-06-22 — Desktop Field refit composition fix

Base file: `index.html`

Decision:
- Root cause identified: `returnToField()` called `measureGraph()` which restarted the D3 force simulation with `sim.alpha(0.08)`. The simulation cluster forces pull nodes toward positions biased toward the lower half of the viewport (lyric cluster at 80% height, irish at 70% height). `fitVisibleField` computed the camera for pre-drift node positions, but nodes continued drifting for ~3 seconds post-refit. Result: visible lower-left bias in all desktop Field refit screenshots.
- Fix: in `returnToField()` desktop path, replaced `measureGraph()` with an inline dimension measurement (`width`, `height`, `viewBox`, center force) that does NOT restart the simulation. The sim remains at its settled (low-alpha) state, so nodes stay stable when `fitVisibleField` computes the camera transform.
- Mobile path unchanged (`setReaderOpen` with measure).

Files changed:
- `index.html` — `returnToField()` desktop path: inline measure instead of `measureGraph()`
- `qa/desktop-composition-polish/` — 3 new composition screenshots

Commands run:
- `npm test` — 5/5 passed

Desktop composition measurements (1440×900 viewport):
- Refit 1: dx=+7.1% (±12% limit), dy=+7.4% (±14% limit) — PASS
- Refit 2: dx=-7.6% (±12% limit), dy=+12.2% (±14% limit) — PASS
- Refit 3: dx=+3.5% (±12% limit), dy=+0.4% (±14% limit) — PASS

Known risks:
- Refit 2 dy is at 87% of the ±14% limit; some node layouts may push closer to the boundary.
- If the user resizes the window between focus and field, `returnToField` will not restart the sim to adapt to new dimensions (the resize event listener handles this separately, which is correct).
- Mobile behavior unchanged; existing risks remain (real-device QA, aperture tuning, Google Fonts CDN).

---

## 2026-06-22 — Deployment hardening: local D3

Base file:
- `the_black_bird_v5_6_nightly.html`

Goal:
- Remove CDN dependency on cdnjs.cloudflare.com for D3.
- Add Playwright smoke test harness with CDN guard.

Files changed:
- `the_black_bird_v5_6_nightly.html` — replaced remote D3 CDN `<script>` with `<script src="vendor/d3.v7.9.0.min.js"></script>`
- `vendor/d3.v7.9.0.min.js` — D3 v7.9.0 minified, copied from `node_modules/d3/dist/d3.min.js`
- `package.json` — added name, scripts, devDependency on `@playwright/test@^1.45.0`
- `playwright.config.js` — new; configures Playwright for Chromium, `file://` base URL
- `tests/black-bird-smoke.spec.js` — new; 5 smoke scenarios + CDN guard (`beforeEach` throws if D3 CDN is requested)
- `README.md` — noted D3 is vendored locally
- `docs/PROJECT_STATE.md` — new; stack/dependency table including local D3 note
- `TESTING_REPORT.md` — updated with passing results; noted no CDN interception needed
- `BLACK_BIRD_DECISIONS_CHANGELOG(1).md` — this entry

Commands run:
- `npm install d3@7.9.0 --prefix .`
- `cp node_modules/d3/dist/d3.min.js vendor/d3.v7.9.0.min.js`
- `npm install` (added `@playwright/test@^1.45.0`)
- `npm test` — 5/5 passed (26.7s); no CDN requests detected

Decisions:
- Pin D3 version to what was in the CDN tag (7.8.5 → upgraded to 7.9.0 from npm; API compatible).
- Test guard uses `page.on('request')` to detect and fail on any D3 CDN request.
- No visual, design, ontology, or text changes made.

Results:
- All 5 smoke tests pass.
- No request to cdnjs.cloudflare.com during test run.

Known risks / next step:
- Google Fonts is still loaded from CDN; acceptable for now (not load-critical for app function).
- D3 version bumped from 7.8.5 (CDN) to 7.9.0 (npm); both are D3 v7 minor releases; no breaking changes expected.
- Chromium symlink at `/opt/pw-browsers/chromium-1124` → `chromium-1194` required in this environment due to Playwright version mismatch; may need updating when Playwright is upgraded.

---

## Changelog template

Use this for future entries:

```md
## YYYY-MM-DD — Short round name

Base file:
- `<filename>`

Goal:
- ...

Files changed:
- ...

Commands run:
- ...

Decisions:
- ...

Results:
- ...

Known risks / next step:
- ...
```
