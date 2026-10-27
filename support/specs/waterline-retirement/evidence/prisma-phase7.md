# Prisma phase 7 — remaining storage S

2026-10-22; worktree `t3-815a2a6e`, branch `t3/waterline-retirement`, base
`34f4c905b`. ARM64 / 2 CPUs / 12 GiB; Node **24.16.0**, npm **11.20.0**.
Prisma **8.0.0-rc.24** / orm-mongo **8.0.0-rc.19** pins/locks unchanged.
Sequential heavy commands have external timeouts. Only owned `wrpz7-*` resources;
MongoDB exclusively the ADR's `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
No transactions, prior-image/budget/mixed-instance/browser campaign, push or PR.

## Fields and owners

Inventory combines Waterline Record/DeletedRecord/Counter definitions, native
MongoStorageService/recordSchemaCodec/lifecycle writers, permanent identity
claims, core RecordsService normalization/workflow/bootstrap/authorization
writers, RecordWriteClassification, Counter producer, attachment rebind and
`evidence/p10-s/raw-fixtures.json`. The portal's real create path exposed
previousWorkflow; the follow-up core/config audit includes all six authorization
aliases and configured notification.state/log writers (redbox-hook-dev recordtype.ts).
No fixture-only probes enter a production contract. **45 fields** including IDs:

| Logical datastore / physical model | Declared fields |
| --- | --- |
| redboxStorage / record (**24**) | _id, redboxOid, harvestId, revision, incarnationId, lifecycleOperationId, metaMetadata, metadata, workflow, previousWorkflow, notification, authorization, authorization_edit, authorization_view, authorization_editRoles, authorization_viewRoles, authorization_editPending, authorization_viewPending, figshareSyncIntent, recordVersion, dateCreated, lastSaveDate, createdAt, updatedAt |
| redboxStorage / deletedrecord (**11**) | _id, redboxOid, revision, incarnationId, brandId, lifecycleState, lifecycleOperation, deletedRecordMetadata, dateDeleted, createdAt, updatedAt |
| redboxStorage / recordidentity (**4**) | _id, redboxOid, incarnationId, createdAt |
| mongodb / counter (**6**) | _id, name, branding, value, createdAt, updatedAt |

Physical names/datastores are unchanged. IDs and Counter branding are BSON
ObjectIds; revisions/versions/value are doubles; ordinary timestamps are ISO
strings. Free-form record/workflow/authorization/alias/source-intent/snapshot
content is Json. Existing schema Date codecs remain. Model reads may expose
missing optional fields as null and omit undeclared fields; patches set supplied
fields only. Authoritative getMeta and atomic removed-record snapshots use public
typed result shapes with declared codecs, retaining absent keys and explicit null
separately (S-PG-07). This prevents lifecycle null backfill and preserves configured
notification initialization that tests for undefined. Supplied
undefined values preserve native BSON's null serialization; absence is not filled.

Plain RecordDocuments operations now carry the shared lifecycle protocol. Prisma
provides conditional model update after-images, typed atomic delete before-images,
increment/unset and model
identity claims. Source-intent pipelines become JS transformations with whole
previous-intent plus revision/version predicates; only certified misses retry,
at most 64. Exceptions/ambiguous acknowledgments never retry. Create reservation
release/readback, tombstone write order, restore ownership, permanent incarnation,
CAS/ABA guards, compensation and partial effects remain. No transaction/session
unit is inferred. Internal protocol calls retain their admitted owner during drain.

Core bootstrap/harvest/authorization/pending-access lookups use S repositories.
U linking retains its ordered record rewrites through RecordsService; a later
record failure leaves earlier rewrites and U effects intact. Schema authorization
replaces native lookup with grant pages of 100 and model permission reads, checking
the existing 1-second availability deadline around awaits. The model API cannot
cancel an in-flight request; deadline expiry is reported as unavailable, never denial.

Counter is one applied model atomic increment/upsert returning its new value.
RC19's nullable numeric accessor omits .inc(), so its public FieldOperation uses
$inc through the model callback (no cast/raw). Only a known duplicate insertion
miss can retry as a conditional update on the same name/brand. Ambiguous outcomes
may consume a number; no replay/key/gapless guarantee. Waterline's original
read/modify/write remains only in explicit rollback. **S-01 improved:** 12
simultaneous Waterline callers receive **1 distinct** value; 24 Prisma callers
receive **24 distinct values, 1–24**. Numeric values stay BSON doubles; malformed
physical strings reject instead of JavaScript concatenation/coercion.

OID rebind conditionally updates metadata (including updatedAt), preserving
partial duplicate-key effects. GridFS byte I/O remains the permanent native
exception S-GRIDFS-01–03. S-PG-03 server buildInfo remains unsupported by Prisma.
S-PG-01/02 catalog/DDL and eight duplicate audits use controls/raw grouping.
**No operational S raw/native record query remains.** Dotted Json order/count
and stored record nested-array inclusion use the typed builder (S-PG-05/06),
including explicit ObjectId parameter codecs and a Json projection envelope.
Authoritative snapshot reads/deletes retain presence with typed result shapes
(S-PG-07); ordinary optional-null reads are never round-tripped as snapshots.
Stored queries retain tenant scope, redboxOid identity refusal and Mongo regex flags.

The S selector covers every operation, accepts **prisma | waterline**, defaults
Prisma and rejects mongodb. The unselected Waterline owner no longer registers a
ready handler. Full-S preparation is inspect-only at startup: **35 S scopes**,
**99 ready scopes / 40 indexed collections** overall, verified by the installed
portal CLI. Global Counter name uniqueness was already declared; safe mode may
not have installed it. Explicit stopped-writer ensure refuses duplicate names and
conflicting indexes without cleanup. Shared fresh init and archetype templates
match. Quirks **S-09–18** cover preserved lifecycle/U/rebind/source behavior,
optional reads, supplied BSON serialization, numeric allocation, preparation and
synchronous stream/Observable contracts;
S-02–08 remain. No data relocation or GridFS rewrite.

## Light verification

Commands source `.tmp/wrpz7/env.sh`; ignored recipes/logs are in `.tmp/wrpz7`.

| Command | Result |
| --- | --- |
| `timeout 360s bash .tmp/wrpz7/run-records.sh` (also `npm --prefix packages/redbox-core run test:storage-transition -- records`) | **22/22 groups pass**, `records-auth-final.log`; Waterline 12 callers/1 distinct, Prisma 24/24 distinct. Absent/null authoritative reads, atomic removed snapshots and restored physical fields verified. |
| `timeout 480s bash .tmp/wrpz7/run-storage-tests.sh`; affected live rerun `run-storage-live.sh` | Initial **316 passing / 13 failing**. **291 unit cases passed**; failures were deleted pagination fixture BSON _id nested in Json and root-only model sorting. The fixture now matches the real lifecycle writer; typed dotted sorting fixes production. Final live **38/38 pass** (12 intents, 9 concurrency, 17 pagination). Affected service fixture **264/264 pass** (`storage-service-final.log`, isolated loader allowance 10s); the cold isolated run first exceeded Mocha’s default 2s before-hook timeout. Final live rerun after snapshot/stream fixes **38/38 pass** (32s), `storage-live-final.log`. **329 applicable storage cases**, no unresolved failure. |
| `timeout 720s bash .tmp/wrpz7/run-core.sh`; affected two-file rerun using standard preload/options | Full **4,298 passed / 108 pending / 9 failed**; all nine native-query spy fixtures now explicitly select rollback. Focused **62/62 passed**. Isolated startup **1/1 passed** (9,549 ms). **4,308 applicable core cases pass**, no unresolved failure. Affected bootstrap selection **4/4 pass**, `core-bootstrap-final.log`; updated list fixtures retain singularity checks. |
| `timeout 2600s bash .tmp/wrpz7/run-standard.sh`, focused portal remediation, then `timeout 1500s bash .tmp/wrpz7/run-bruno-only.sh` / `run-bruno-focused-only.sh` | Initial portal **417 passed / 10 pending / 2 failed**: staged-owner expectation and missing real previousWorkflow contract field. **2/2 focused portal cases pass** (`mocha-focused.log`): **419 pass / 10 pending**, no unresolved failure. Bruno General folders 1–4: first harness copy lacked helper/assets (196/309 requests); corrected full run **306/309 requests, 547/549 tests, 3/3 assertions**. Three listing/export failures identified quoted literal sort rejection and Promise-wrapped stream output; fixed and **5/5 focused prerequisite/affected requests, 10/10 tests pass** (`bruno-focused.log`). Combined **309/309 requests, 553/553 tests, 3/3 assertions**, no unresolved failures/skips; `bruno-union-summary.json`. |
| Core/hook build, strict persistence types, lints, Prisma freshness and diff checks | **PASS**: `typecheck-last.log`, `lint-core-last.log`, `lint-hook-auth-final.log`, `freshness-last.log`, `compile-last.log`, `build-hook-auth-final.log`; zero hook lint diagnostics. Exact pins and locks unchanged. `git diff --check` passes. |

The expanded transition checks both write/read directions, wrapper/notification fields and raw undefined serialization; absence vs explicit
null across authoritative read/removal/restore; CAS/lineage/identity; rejected/applied-failed-ack
create/update/delete/restore; rebind partial collision and manager bypass; nested
Json/authorization filters and field updates; stored count/projection/tenant and
regex/literal missing-field sorting semantics; synchronous export/Observable
contracts; schema permission joins and create-grant success/deadline expiry; U ordered partial rewrite with
Waterline record reads forbidden; and Counter interoperability/concurrency.
No prior campaigns or browser scope were added. Initial compile fixes included
RC19 nullable increment typing and an import rename; final checked code is below.

## Remaining Waterline accesses — phase 8 input

Audit found **66 candidate AST sites in 32 files**, including the explicitly
classified non-Waterline keys below. It uses TypeScript AST over runtime `.ts/.js/.cjs` under packages, typescript,
api and config, plus searches for global model CRUD, native/datastore calls,
WaterlineModels and loader registration. Tests, generated dist/node_modules,
model definitions and explicit Waterline adapters are excluded. There is **no
active global Waterline model CRUD** outside rollback. Remaining app.models
reads below are model presence/mapping/callback/association/table/datastore
metadata or rollback composition; they still make ORM loading necessary.
Paths/lines are current source locations, not historical capture locations.

| Runtime file | Direct loaded-model access lines |
| --- | --- |
| `packages/sails-hook-redbox-storage-mongo/src/persistence/RecordRevisionMaintenance.ts` | 28, 29, 70 (explicit rollback branch) |
| `packages/sails-hook-redbox-storage-mongo/src/persistence/preflight.ts` | 54, 67 |
| `packages/redbox-core/src/persistence/configuration/PrismaConfigurationCoordination.ts` | 11 |
| `packages/redbox-core/src/persistence/configuration/runtime.ts` | 68, 80 |
| `packages/redbox-core/src/persistence/configuration/preflight.ts` | 52, 61 |
| `packages/redbox-core/src/persistence/branding/runtime.ts` | 67, 75, 79 |
| `packages/redbox-core/src/persistence/branding/preflight.ts` | 22, 31 |
| `packages/redbox-core/src/persistence/progress/runtime.ts` | 64, 73 |
| `packages/redbox-core/src/persistence/progress/preflight.ts` | 34, 43 |
| `packages/redbox-core/src/persistence/figshare/runtime.ts` | 61 |
| `packages/redbox-core/src/persistence/figshare/preflight.ts` | 79, 88 |
| `packages/redbox-core/src/persistence/harvest/runtime.ts` | 65, 72, 86 |
| `packages/redbox-core/src/persistence/harvest/preflight.ts` | 173, 182 |
| `packages/redbox-core/src/persistence/reference/runtime.ts` | 64, 82 |
| `packages/redbox-core/src/persistence/reference/preflight.ts` | 46, 55 |
| `packages/redbox-core/src/persistence/siem/PrismaSiemCoordination.ts` | 13 |
| `packages/redbox-core/src/persistence/siem/runtime.ts` | 63 |
| `packages/redbox-core/src/persistence/siem/preflight.ts` | 112, 121 |
| `packages/redbox-core/src/persistence/cache/configuration.ts` | 48, 64, 107 |
| `packages/redbox-core/src/persistence/cache/runtime.ts` | 81, 87 |
| `packages/redbox-core/src/persistence/vocabulary/runtime.ts` | 65 |
| `packages/redbox-core/src/persistence/vocabulary/preflight.ts` | 29, 38 |
| `packages/redbox-core/src/persistence/storage/runtime.ts` | 54 |
| `packages/redbox-core/src/persistence/storage/preflight.ts` | 49, 51, 57 |
| `packages/redbox-core/src/persistence/migration/runtime.ts` | 63, 69 |
| `packages/redbox-core/src/persistence/migration/preflight.ts` | 20, 40 |
| `packages/redbox-core/src/persistence/runtime.ts` | 289, 297, 298 |
| `packages/redbox-core/src/persistence/identity/runtime.ts` | 69 |
| `packages/redbox-core/src/persistence/identity/preflight.ts` | 17, 18, 25, 33, 55, 60 |

`RecordRevisionMaintenance.ts:70` is an explicit inline Waterline-only
getDatastore().manager branch (Prisma uses its own maintenance factory). Its
28/29 accesses validate optional loaded mappings. Remove the branch with rollback.
Core `persistence/runtime.ts:289,297,298` binds loaded collection names before
client creation, including explicit branding-history rollback routing.
The other table entries inspect/retrieve models for qualified mapping checks,
identity junction discovery, or explicit rollback repository construction; no
normal Prisma CRUD dispatch reaches their Waterline methods.

Additional ORM plumbing (outside model-definition/rollback exclusions) to remove
or replace in phase 8:

- `packages/redbox-core/src/loader/index.ts:277,454–463,759–787,1318` loads
  WaterlineModels, discovers hook model registrations and emits model shims.
- `packages/redbox-core/src/index.ts:185` exports WaterlineModels;
  `packages/sails-hook-redbox-storage-mongo/src/index.ts:28` registers hook models.
- `packages/redbox-core/bin/persistence-indexes.cjs:49–50` loads sails-hook-orm
  and safe model config for maintenance bootstrap.
- `packages/redbox-core/src/config/datastores.config.ts:8` and
  `config/env/docker.js:137`, `integrationtest.js:170`, `test.js:63` load sails-mongo;
  `persistence/mongodb/configuration.ts:53–54` validates the adapter identity.
- `config/models.js:14` merges model configuration. Generated `api/models/*`,
  Waterline definitions/decorators/types, hook hasModels declarations, selector
  rollback branches and dependency/lock entries remain removal categories.

The scanner's `prisma/client.ts:46` is a Prisma contract .models key, not a
Waterline access. `sails.ts` methods are declarations; two commented User.findOne
examples in RecordsService are inert. Agenda/connect-mongo/GridFS are independent
native owners, not direct Waterline model accesses, and retain their existing
registered decisions. No application model/ORM removal is claimed in phase 7.

## Commits and cleanup

Local commits: `74c8e3bda` (initial fields), `4f50ec915` (complete fields/mappings/indexes),
`3570da609` (core record lookups, Counter, OID rebind and typed helpers),
`cadf791a9` (hook lifecycle owner), `ab1eafb16` (light transition/fixture coverage),
`c242b2272` (create-grant authorization deadline and transition check).
The following documentation commit records evidence, both registers, status and
operator guidance. No push or PR.

Cleanup audit: zero owned containers (including stopped), networks, volumes or
images by `wrpz7` names/task labels and the owned Compose projects. No application
image was built. Unrelated `development-*` containers remain running. Root
`redoc`/`should` dependencies are restored; their holding directory is empty.
`.tmp/wrp8/prior-0ea5e9bc2.tar` remains **723,557,888 bytes**, SHA256
`321e678c626f7883306209e1cbdc257afaf08185b38ce7ee99f5218692a44091`.
Detailed API reports were reduced to request/test status summaries after count
extraction; no response credentials enter committed evidence. Pins and lockfiles
are unchanged.
