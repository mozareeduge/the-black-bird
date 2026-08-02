# Testing — field recomposition candidate

This document describes how the typed, light-responsive, session-wearing
field recomposition candidate is validated, and what a reviewer should read
before accepting it.

## Harness

- `npm run test:legacy` — repository is free of active Claude control-plane files.
- `npm run test:traceability` — supplied traceability rows are present.
- `npm run test:data` — canonical `DATA` block is untouched (50 nodes, six
  types, opaque RelO labels).
- `npm run test:baseline` — released behavior contract still holds on the
  modified source (onboarding, mobile Field/Read separation, About purity,
  Solo/route geometry, MNO inline spans).
- `npm run test:design` — the decided visual-system contract: canonical
  morphology and aperture role, warm/cold focus, relation clearing, vendored
  fonts with no external font requests, reduced-motion state, the desktop
  focus readout, and bounded performance counters.
- `npm run test:visual` — generates the named candidate evidence matrix
  (screenshots + state + design snapshot per scenario) into
  `test-results/black-bird-evidence/`.
- `npm run test:docs` — this file and the changelog entry exist and mention
  the required candidate-bound terms.
- `npm run test:full` — runs all of the above in sequence.

## What changed, mechanically

- **Morphology**: `nodeMetrics`/`nodeShape` give each canonical type (FO,
  RNO, MNO, NameO, RefO, RelO) a distinct grayscale-safe body, plus a
  dedicated `aperture` visual role for `FO.BLACK_BIRD_FIELD` (dark core,
  pale rim, never recolored). `window.__bbDesign.morphologyFor(id)` exposes
  `{canonicalType, visualRole, morphology}` read-only.
- **Typography**: IBM Plex Mono, Crimson Pro, and Scheherazade New are
  vendored locally under `assets/fonts/` via `@font-face`; the Google Fonts
  `<link>`/preconnect tags are removed. NameO source-script forms (e.g.
  `غراب`) render as the primary graph label with the romanized form as a
  secondary/touch-accessible gloss (`<title>` + Reader panel).
  Graph label size is computed in screen pixels (9–10.5px) independent of
  zoom.
- **Warm/cold + relation clearing**: `presentFocus` branches focus
  presentation — ordinary objects get warm-core/warm-related/cold-rest
  styling with a restrained penumbra; a committed RelO instead suppresses
  the penumbra and raises exactly one live "bone" clearing (radial pools +
  spokes) that tracks `nodeX`/`nodeY` every simulation tick, including
  local-aperture offsets.
- **Afterglow + inferred wear**: `presentDesignTransition` is the single
  committed-focus transaction used by desktop focus, mobile Field selection,
  and Solo. On a real A→B move it registers Route (unchanged), then
  separately records a bounded (max 8) afterglow on the departed object and
  runs a deterministic stable-BFS wear pass over currently visible canonical
  base links only (max 7 passes/edge), rendered on a separate
  `pointer-events:none` overlay. `window.__bbDesign.resetTrace()` clears only
  afterglow + wear, never Route.
- **Focus readout**: one desktop-only (`min-width:721px`) persistent
  specimen readout (`#bbFocusReadout`) anchored to the live focus point;
  hidden on mobile and when nothing is focused.
- **Click-target separation**: `applyLocalAperture`'s neighbor ring
  placement now runs a small deterministic pairwise-separation pass so two
  structurally close neighbors (e.g. two participants of the same RelO)
  cannot collapse onto the same point and become mutually unclickable.
- **Click-target radius**: `nodeMetrics()`'s invisible `.node-hit` radius
  is now set per type equal to that type's own `collideR` (previously a
  flat `18` for every type, larger than the force simulation's actual
  minimum node separation for several type pairs). This removes a real
  hit-circle-overlap mis-click hazard between adjacent nodes; no rendered/
  visual metric (`coreR`/`outerR`/`labelOffset`/`haloR`/`focusR`) changed.

## Known limits

- `tests/black-bird-design.spec.js`'s "canonical morphology and aperture
  role" test previously built its representative-FO id via
  `nodes.find(n => n.type === 'FO')`. In the canonical, unmodified `DATA`
  block `FO.BLACK_BIRD_FIELD` is itself the first `FO`-typed node in
  document order, so this helper always resolved to the same id already
  used for the aperture assertion, and the test then asserted two different
  `morphology` values (`'aperture'` and `'fo'`) for that single id — a
  defect in the test fixture itself, verified independent of the
  implementation against the immutable baseline commit
  `283ce5bf5d17600f1d35457d4f84786187abe446`. Fixed by excluding
  `FO.BLACK_BIRD_FIELD` from the ordinary-`FO` representative lookup
  (`rep('FO')` now finds the first `FO` that is *not* the aperture id);
  every other assertion in the test, `DATA`, and `morphologyFor()` are
  unmodified. `test:design` is 9/9.
- Mobile dense-cluster label collisions: at small viewports, adjacent node
  labels (e.g. `Huginn / Muninn` and `Allah` near the Cain/Ghurāb cluster,
  see evidence `SCN-14`) can overlap illegibly. Text labels are not inputs
  to the collision force, so a general fix would require either
  materially larger minimum node separation (changing the whole graph's
  visual density) or new label-declutter logic — out of scope for a
  bounded correction; left as a known limitation.
- Body-only depth blur (`.bb-cold-rest`) and the desktop wear pulse are
  implemented per spec but are a secondary cosmetic layer; the design is
  intentionally coherent with them disabled (mobile, reduced motion).

## Candidate-bound review

Evidence (screenshots, state, design snapshot, network log) for named
scenarios SCN-01/02/07/08/10/12/13/14/15/18 is generated fresh from this
exact candidate by `npm run test:visual` into
`test-results/black-bird-evidence/evidence-index.json` and is not committed
to the repository. Acceptance is `GPT-or-user` only; this candidate does not
self-attest `SUBJECTIVE_ACCEPTED` or `RELEASE_AUTHORIZED`.
