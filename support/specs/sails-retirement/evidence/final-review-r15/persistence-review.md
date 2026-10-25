# R15 persistence and standards differential

**Result: no new verified defect; no runtime/test changes. Runtime freeze preserved.**

Reviewed fixed baseline `a49366803164429f9d8bdd249dadcdf856c9d13e` through `e4a198691e8713b308386535acb9d6008f82c051` (initial HEAD `bda01cb2525ef31bdb1f449ddb7ea52e52deafb3`). Only `persistence*` evidence and assigned scratch files were written. Parent owns full compile/qualification and HTTP target controls.

## Source enumeration

The reproducible [inventory](persistence-inventory.json) scans all tracked runtime TypeScript in `packages/redbox-core/src/` and `packages/sails-hook-redbox-storage-mongo/src/`, excluding generated code and declarations. It retains source hashes, baseline paths/lines, moved-method provenance, actual argument text, and unchanged body controls. Generated persisted contracts are compared separately.

- 693 files: 253 changed/moved, 156 new/extracted, 284 unchanged controls.
- 4,452 methods: 863 changed bodies, 782 new/extracted, 2,807 unchanged bodies.
- 1,485 conservative mutation-named calls: 27 explicit exclusions, 1,088 unchanged argument-token controls, 63 changed arguments individually dispositioned, 307 new/extracted callers. Caller and sink layers overlap; these are not distinct Mongo-write counts. Non-document operations also match the conservative detector.
- 643 persisted contract fields across 49 models: 641 unchanged, two added optional attachment ownership strings (`stagingActorId`, `stagingBrandId`), zero removed fields. All 19 selected physical/default/normalization sources compared: 17 byte-identical, two changed only for those ownership fields.

The [review ledger](persistence-review.json) assigns every candidate a source family and control/disposition, lists all 63 changed-argument dispositions, all model names and per-family proof IDs. The full method inventory includes unchanged moved bodies as controls. R14 machine ledgers supply prior caller lineage; source counts do not stand in for executed compatibility.

## Persisted writes and legacy reads

| Family | Contract fields | Source candidates | Result / proof |
|---|---:|---:|---|
| records | 127 | 262 | Legacy live and already-deleted snapshots retain metadata (nested JSON, zero/false/null), workflow, ACL and created date. Actual baseline/current delete/restore both use staged CAS; revisions 0→2→4 for live round trip and backfilled 0→2 for legacy tombstone. Correct brand reads, foreign brand null, no read rewrite. Creation/transition preserve incarnation and creation fields. |
| users-roles | 40 | 85 | ObjectId IDs/brand/join relations, string timestamps, active/loginDisabled defaults, salted password hash verification, safe credential projection and audit redaction match. Missing legacy flags decode null without read/patch materialization; name patch preserves extra JSON and createdAt. |
| datastream-attachments-storage | 40 | 203 | Legacy partial attachment update preserves absent input fields, createdAt and physical extras; defaults and zero length preserved; access audit/count correct. Native GridFS bytes and Date uploadDate verified. Intentional optional stagingActorId/stagingBrandId ownership fields are the only contract changes. |
| workflow-reference-definitions | 54 | 17 | Record type, form and workflow definitions retain ObjectId links and config/hidden/starting fields. Actual baseline/current workflow transition sets expected prior/current workflow, form and JSON-LD, retaining record identity. |
| vocabularies | 110 | 103 | Vocabulary/entry links remain ObjectId; lowercase fields and historical=false default unchanged. Legacy label-only patch preserves existing value/valueLower/createdAt. Figshare callers retain typed existing repository encoding. |
| configuration | 48 | 121 | Brand ObjectId association, nested JSON zero/false/null and unknown physical legacy fields survive replacement. New config shape unchanged; dashboard CAS advances once and rejects stale revision. |
| audit-chronicles | 78 | 89 | Record/user/access audits append/read with correct IDs, types and credential redaction. Chronicle summaries flow through utilities/serviceChronicle.ts to request/logger, not a new Mongo collection. Existing R14 P3 custom marker differences remain recorded, not a new finding. |

Family source counts are a file-based index, not an exclusive attribution of every cross-domain operation. Record transition, access audit and user audit proofs intentionally support more than one family. Remaining schema models and other runtime controls are explicitly listed in the machine ledger.

## Accepted real Mongo evidence

**Node 26.11.1; MongoDB 9.0.4**, confirmed by live `buildInfo` (git version `64ade602b836c9adeffba7fa038c887ffab56196`). Only disposable databases `sr_r15_persistence` and `sr_r15_persistence_storage` were used; no Docker management or unrelated reset.

- [Probe results](persistence-probe-results.json): **18 passed observations**, including both baseline/current already-deleted legacy tombstone backfill/restore extras; **five paired normalized document equality assertions**. Raw EJSON preserves actual BSON types. [Accepted probe log](persistence-probes.log).
- [Focused existing Prisma suite log](persistence-prisma.log): **30 passing, zero failing/skipped**. Covers physical shapes/defaults, JSON/references/vocab, credentials, CAS, cache/migration/harvest/SIEM/Figshare/counters, sessions and stale handles. No broad suite was run by this reviewer.

Baseline execution loads actual historical repository and StorageProtocol source using `git show a49366803`, plus selected actual Records methods via the R14 extractor. It binds explicit current unchanged dependency ports/domain helpers and a minimal retired base class. This is **not a full historical Sails server/checkout**. Five equality assertions normalize generated IDs, automatic timestamps and salted bcrypt bytes; independent assertions check relationships, types, preserved fields, defaults, stale-CAS refusal and redaction.

The critical restoration proofs inspect raw persisted live rows, staged deleted rows and restored rows. Live record round trips advance revisions 0→2→4; a genuinely old deleted row missing wrapper revision/state/brand reads without mutation, rejects a foreign brand, backfills revision 0/state deleted, restores to revision 2 and removes the tombstone. Both versions preserve embedded metadata, workflow, ACL and creation date. Parent separately verified route delete intent.

## Standards and disposition

Reviewed AGENTS.md, CONTRIBUTING.md and the coding standards wiki, the eight supplied feature specifications, earlier reviews/backlog and R13/R14 ledgers. No concrete introduced P1/P2 standards defect or new P3 was verified. No dependency changes or speculative refactors. Neutral domain names follow the selected architecture. Full qualification belongs to the parent. Existing inherited backlog, R14 P3 chronicle-marker disposition and accepted SR-005/045/049/055 gaps remain unchanged.

Rejected harness attempts are recorded in the JSON ledger: wrong response assertion, invalid fixture concurrency mode, omitted baseline helper binding, unsupported root extension field and null/undefined expectation. These were fixture/harness corrections, not application findings.

## Reproduction

Run from repository root with local Node 26:

```sh
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node support/specs/sails-retirement/evidence/final-review-r15/persistence-inventory.cjs
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types support/specs/sails-retirement/evidence/final-review-r15/persistence-probes.cjs
```

The probes modify only their two named disposable fixture databases. Source and result artifacts are hashed in [persistence-manifest.json](persistence-manifest.json).
