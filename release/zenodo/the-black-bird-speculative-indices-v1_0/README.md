# Speculative Indices for a Research-Field
## The Black Bird — Research Annex, First Annex

**Version:** 1.0  
**Project:** The Black Bird: A Hypergraph Research Poem  
**Project URL:** https://theblackbirdfield.com/  
**Research Annex URL:** https://theblackbirdfield.com/research/speculative-indices/  
**Author:** Mohammad Zare  
**DOI:** pending

---

## Scope

The index set is bounded to the primary object domain X = RNO ∪ FO, where RNO is the set of Research Note Objects and FO is the set of Field Objects extracted from the poem's object grammar.

Relation Objects serve as mediating sites. Mapping Note Objects, Reference Objects, and Name Objects are excluded from the primary calculation and keep their roles in the poem's field.

The corpus covers four Research Note Objects and eighteen Field Objects from the v1.0 release of The Black Bird.

---

## Method Summary

Two incidence matrices underlie the indices:

**A** — RNO–FO incidence matrix (4 × 18). Each cell A[n,f] = 1 if Field Object f appears in Research Note Object n, 0 otherwise.

**B** — FO–RelO incidence matrix (18 × 12). Each cell B[f,r] = 1 if Field Object f participates in Relation Object r, 0 otherwise.

Six indices are derived:

| Index | Formula | Description |
|---|---|---|
| RNO Field Breadth | OI_N(n) = Σ_f A[n,f] | Field Object count per RNO |
| Field Object Research Recurrence | OI_F(f) = Σ_n A[n,f] | RNO appearances per FO |
| RNO–RNO Field Overlap | RT_NN = A Aᵀ | Shared FO count between RNO pairs |
| FO–FO Research Co-incidence | RT_FF^N = Aᵀ A | Co-appearance count in shared RNOs |
| Mediational Incidence | MI_R(f) = Σ_r B[f,r] | RelO participation count per FO |
| FO–FO RelO-Mediated Thickness | RT_FF^R = B Bᵀ | Shared RelO count between FO pairs |

---

## File Inventory

| File | Description |
|---|---|
| `the-black-bird-speculative-indices-v1_0.html` | Canonical HTML article with full indices, tables, and field-structure analysis |
| `the-black-bird-speculative-indices-v1_0.pdf` | PDF version of the same article |
| `the-black-bird-speculative-indices-data-v1_0.zip` | Data package: CSV matrices, JSON bundle, checksums |
| `README.md` | This file |
| `ZENODO_METADATA.md` | Metadata for Zenodo deposit |
| `SHA256SUMS.txt` | SHA-256 checksums for all files in this package |

### Data package contents (inside the ZIP)

| File | Description |
|---|---|
| `README.md` | Data package documentation |
| `relational_indices_bundle.json` | All matrices and metadata in a single JSON file |
| `rno_fo_incidence_matrix.csv` | A matrix (RNO × FO) |
| `object_incidence_rno.csv` | OI_N: RNO Field Breadth |
| `object_incidence_fo.csv` | OI_F: Field Object Research Recurrence |
| `rno_overlap_matrix.csv` | RT_NN: RNO–RNO Field Overlap |
| `fo_research_coincidence_matrix.csv` | RT_FF^N: FO–FO Research Co-incidence |
| `fo_relo_participation.csv` | MI_R: Mediational Incidence |
| `fo_relo_thickness_matrix.csv` | RT_FF^R: FO–FO RelO-Mediated Thickness |
| `SHA256SUMS.txt` | SHA-256 checksums for data files |

---

## Citation Note

Mohammad Zare. *Speculative Indices for a Research-Field: Object Incidence, Relational Thickness, and Mediational Incidence in The Black Bird.* Research Annex, First Annex. 2026. DOI: pending.

If citing the primary work: Mohammad Zare. *The Black Bird: A Hypergraph Research Poem.* Born-digital web work, 2026. https://theblackbirdfield.com/

---

## License Note

The Black Bird is a born-digital literary and research work. The source code and data are made available for study and citation. Redistribution or re-publication of the work in modified form without attribution is not permitted.

See RIGHTS.md in the project repository for the full rights statement: https://github.com/mozareeduge/the-black-bird
