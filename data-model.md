# Data model

## Overview

*The Black Bird* uses a typed hypergraph data model embedded in `index.html`.

Every object is a node with:

- `id`
- `type`
- `label`
- `shortLabel`
- `cluster`

The six object types are:

- RNO — Research Note Object
- MNO — Mapping Note Object
- FO — Field Object
- NameO — Name Object
- RefO — Reference Object
- RelO — Relation Object

## Counts

Extracted from the DATA object in `index.html` at source lab commit `6aff6659a38a66d6764296f2201cb5babef25f2f`:

- Total nodes: **50**
- RNO (Research Note Objects): 4
- MNO (Mapping Note Objects): 2
- FO (Field Objects): 18
- NameO (Name Objects): 4
- RefO (Reference Objects): 10
- RelO (Relation Objects): 12
- Text nodes (RNO + MNO with bodies): 6
- NameO records: 4
- RefO records: 10
- Relation Objects: 12

## Object grammar

RNO gives source pressure a returnable body.

MNO condenses a dense region of relation into poetic form.

FO gives recurrence an address.

NameO gives source-language pressure a place.

RefO gives citation and source-status an active place.

RelO gives relation a body before explanation.

## Relation model

Relation Objects are nodes.

Each RelO holds a participant array.

Visible graph edges are renderings or projections of that participant structure.

Relation is not reduced to an ordinary graph edge.

## Text model

RNO and MNO bodies live in `DATA.texts`.

RNOs contain source-bearing prose.

MNOs contain poem HTML with inline `.fl` object links.

Exact HTML matters because it carries traversal.

## Reference model

RefOs are graph objects, not hidden footnotes.

External source URLs appear as source rows in the Reader.

## Validation

A valid rebuild should preserve:

- total nodes = 50
- every text id exists as a node
- every object id referenced by a text exists
- every ref id referenced by a text exists and is a RefO
- every NameO id has a record
- every RelO has a participant array
- every relation participant id exists
- RelO labels remain opaque
- FO.ALLAH, FO.ODIN, and FO.GOD remain distinct
- there is no direct Allah–Odin RelO

## Canonical source

The canonical running model is the `DATA` object embedded in `index.html`.
