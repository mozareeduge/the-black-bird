# The Black Bird

**by Mohammad Zare (Mozare) · version 1.0.0 · [Experience the work](https://poem.theblackbirdfield.com/)**

A black bird appears beside a body, and other scenes gather around that contact. Each source, name, object, and relation receives an address without being closed into one explanation. *The Black Bird* is a hypergraph research poem: the reader moves between a field of linked materials and the text held in its Reader.

**Research annex:** [Speculative Indices for a Research-Field](https://poem.theblackbirdfield.com/research/speculative-indices/) (v1.0; source in [`research/speculative-indices/`](research/speculative-indices/)) computes three index families from the poem's object grammar — Object Incidence, Relational Thickness and Mediational Incidence — over the four Research Note Objects and eighteen Field Objects of the v1.0 release. Its main finding: Black Bird and Corpse recur equally (Object Incidence 4 each), but Corpse is held more densely by Relation Objects (Mediational Incidence 9 against 8), so the entry-object and the densest relation-body are not the same. Deposit metadata is in [ZENODO_METADATA.md](release/zenodo/the-black-bird-speculative-indices-v1_0/ZENODO_METADATA.md); no DOI has been assigned yet.

**Status:** published work, version 1.0.0; this repository is its public source archive.

**How to cite:** Zare, M. (2026). *The Black Bird: A Hypergraph Research Poem* (Version 1.0.0) [Electronic literature]. https://poem.theblackbirdfield.com/

**Rights:** All rights reserved; the source is visible for reading, study and citation only. See [RIGHTS.md](RIGHTS.md).

---

## Live work

[The Black Bird](https://poem.theblackbirdfield.com/)

## About

*The Black Bird* is a born-digital hypergraph research poem. It gathers black-bird appearances across scriptural, mythic, linguistic, behavioral, poetic, and forensic materials and gives them a spatial and textual form.

The work is read through Field, Reader, Index, View, Route, and About. A source can return as a scene. A name can keep its pressure. A relation can remain visible before explanation.

## Repository status

This repository is a public source archive for the artwork.

It is source-visible for reading, citation, study, and archival inspection. It is not currently released as open-source software.

See [RIGHTS.md](RIGHTS.md) before reusing, modifying, redistributing, adapting, publishing, or commercially using any part of the work.

## Structure

- `index.html` — the complete static artwork.
- `assets/`, `favicon/` — fonts, images and favicon files used by the artwork.
- `vendor/d3.v7.9.0.min.js` — vendored D3 dependency.
- `research/speculative-indices/` — the Research Annex page, PDF and data.
- `release/zenodo/` — the Zenodo-ready package for the annex.
- `next/`, `next2/` — review previews of candidate builds; not the public build.
- `tests/`, `TESTING.md`, `package.json` — test harness and its description.
- `data-model.md` — data model and object grammar summary.
- `BLACK_BIRD_DECISIONS_CHANGELOG.md` — development and decision record.
- `CITATION.cff` — citation metadata.
- `RIGHTS.md` — rights and reuse statement.
- `NOTICE.md` — third-party and project notices.

## Running locally

Open `index.html` in a modern browser.

If browser security settings block local files, serve the folder locally:

```bash
python3 -m http.server 8000
```

Then open:

```
http://localhost:8000
```

## Citation

Use the citation provided in [CITATION.cff](CITATION.cff).

Short form:

Mohammad Zare. *The Black Bird: A Hypergraph Research Poem*. Born-digital web work, 2026.

## Rights

Copyright © 2026 Mohammad Zare.

This repository is source-visible but not open-source unless a future explicit license says otherwise. See [RIGHTS.md](RIGHTS.md).

## Development repository

Development and experimental work happen separately in:

https://github.com/mozareeduge/black-bird-lab
