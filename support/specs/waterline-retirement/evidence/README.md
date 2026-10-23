# P0 evidence catalogue

Use [P0 validation](../p0-validation.md) for conclusions, limitations, corrections and G0 HOLD. All database documents
are synthetic. No existing container or institution data was accessed. Exact replay commands and dependency requirements
are in the [fixture README](../../../../packages/redbox-core/test/fixtures/waterline-retirement/README.md).

| Artifact                                                           | Meaning / provenance                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [inventory.json](inventory.json)                                   | Source-derived model/group allocation, SHA256 definitions, named consumers, mentions and lexical dynamic/native/extension/transaction paths; pilot/current-source delta. Candidate matches include false positives.                                                                |
| [inventory-review.json](inventory-review.json)                     | Reviewed file-level disposition and line catalogue for every lexical surface, including templates, shims, migrations, tests and dynamic query aliases.                                                                                                                             |
| [waterline-mongo8.ejson](waterline-mongo8.ejson)                   | Canonical real raw BSON, loaded mappings, Waterline results, callbacks, junction sequence, JSON/legacy injections, standalone/fallback transaction probes, native service/index/lock phase and read-only Prisma feasibility. Initial snapshots and later service DDL are separate. |
| [mappings.md](mappings.md)                                         | Compact all 46 model mapping/default/callback/negative-result index into the archive.                                                                                                                                                                                              |
| [capture.txt](capture.txt)                                         | Completed isolated capture stdout/stderr, normalized workspace paths/trailing whitespace only; warnings are observations, not cleanup instructions.                                                                                                                                |
| [references.json](references.json)                                 | 41 declared association edges and 33 reviewed application reference families; actual generated junction/archive and institution unknowns.                                                                                                                                          |
| [native-owners.json](native-owners.json)                           | Borrowed/owned resource and shutdown matrix; every native candidate assigned a disposition/owner, including UI/PDF/socket false positives.                                                                                                                                         |
| [atomicity-effects.md](atomicity-effects.md)                       | Four TransactionUtils services and identity/storage requirements, cross-db/required atomic units, current partial/unknown recovery and external/postcommit effects; owner agreement pending.                                                                                       |
| [capabilities.json](capabilities.json)                             | Timestamped read-only npm results plus primary Prisma/MongoDB/MikroORM doc excerpts/status/response hashes. No package install. Not a guarantee upstream remains unchanged.                                                                                                        |
| [environment-release-support.md](environment-release-support.md)   | Actual versions/topology, stable/transaction gates, replica-set prerequisite/owner, release/support/rollback checkpoints and pending decisions.                                                                                                                                    |
| [postgresql-readiness-budgets.md](postgresql-readiness-budgets.md) | Twelve group assessments and proposed measurable workload/connection budgets; no PostgreSQL implementation, measurements or human budget approval.                                                                                                                                 |
| [checks.txt](checks.txt)                                           | Final completed command results, semantic/syntax/link/scope checks and owned-container cleanup.                                                                                                                                                                                    |

Inventory/review runners read tracked source and the archived capture. The review script embeds explicit
ownership/reference decisions and fails on a new unassigned production native file. It also audits semantic evidence
invariants; these checks are not replacements for future live adapter/failure/concurrency qualification. Changing
source/evidence requires rerunning and reviewing the catalogue; it cannot certify private institution extensions
automatically.

## Subsequent programme evidence

[P1 foundation logs](p1/README.md) accompany [P1 validation](../p1-validation.md)
and [C2 cache status](../c2-validation.md). P0/P0R captures remain historical; the
user accepted ADR0003 on 2026-10-20. G0R passed, G0 remains HOLD, G-TX remains
closed, and no cache default was promoted by P1.
