# Prisma phase 5 — staged storage S

2026-10-22; supplied worktree `t3-815a2a6e`, branch `t3/waterline-retirement`,
base `5297ead80`. Parent's ADR-only `b839ff89a` is retained. ARM64 / 2 CPUs /
12 GiB; Node **24.16.0**, npm **11.20.0**. Exact Prisma **8.0.0-rc.24** /
orm-mongo **8.0.0-rc.19** pins and locks unchanged. Heavy commands are sequential
and externally timed. Only owned `wrpz5-*` Docker resources; MongoDB exclusively
`mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
No transactions, prior-image runs, budget campaigns, mixed-instance matrices,
browser runs, pushes or PRs.

## Inventory and implementation

Inventory: both core attachment Waterline definitions, `attachmentFields`,
normalization/physical codecs and metadata/access/journal writers; the hook's
four schema/audit definitions, native schema protocol, audit sanitizers/writers
and `recordSchemaCodec`; P10 `raw-fixtures.json` (loaded definitions and native
captures). **94 real fields** across six models, including `_id`/audits.
No fixture-only fields were declared. Existing journal/coordinator rows share
AttachmentMetadata; no separate journal collection or free-form details field
was found. Arbitrary content stays inside the declared schema/audit Json fields.

- **attachmentmetadata (28):** _id, oid, fileId, storageKey, isJournal, attachmentId, operation, mutationState, generation, mutationFileId, coordinationToken, attemptCount, lastAttemptAt, coordinationLeaseExpiresAt, lastSafeErrorCode, contentType, contentLength, etag, lastModified, filename, mimeType, uploadedBy, attachmentField, lastAccessedAt, lastAccessedBy, accessCount, createdAt, updatedAt.
- **attachmentaccessaudit (10):** _id, oid, fileId, storageKey, action, accessedBy, accessedAt, itemCount, createdAt, updatedAt.
- **recordschemaartifact (9):** _id, digest, document, contractFormat, completeness, byteLength, createdAt, updatedAt, lastAccessedAt.
- **recordschemareference (15):** _id, referenceKey, digest, kind, brand, portal, schemaKind, recordType, oid, operation, owner, purpose, expiresAt, createdAt, updatedAt.
- **recordaudit (11):** _id, redboxOid, occurredAt, user, record, dateCreated, action, executionSummary, concurrency, createdAt, updatedAt.
- **integrationaudit (21):** _id, redboxOid, brandId, integrationName, integrationAction, triggeredBy, status, message, errorDetail, httpStatusCode, traceId, spanId, parentSpanId, startedAt, completedAt, durationMs, requestSummary, responseSummary, dateCreated, createdAt, updatedAt.

All six identities remain BSON ObjectIds / opaque DTO strings. Attachments and
access audit are core-declared in **mongodb**, not moved to storage. Schema
artifacts/references and record/integration audits are in **redboxStorage**,
sharing its runtime client with B history. Native schema createdAt/updatedAt/
lastAccessedAt and pin expiresAt stay BSON Dates; attachments, leases and audit
times stay strings. The ordinary Waterline schema-model insertion probe uses
strings, while real schema service writers use native Dates; the staged
contract preserves the real service protocol and tests both service directions.

Two maintenance-only model projections add **5 fields**: record `_id/revision`
and deletedrecord `_id/revision/lifecycleState`. They do not confer record CRUD
ownership. Phase 7 must extend these same physical roots after full inventory.

- Attachment metadata, journal/coordinator/cleanup and access audit: model
  create/find/conditional update/delete. Allowed source state, token, generation,
  identity and lease predicates stay in model writes; pending attempt count is
  computed under its source-state fence. OID rebind remains injected Waterline.
- Schema artifact/reference CRUD: model IO behind the unchanged shared immutable
  protocol. Duplicate readback, timestamp-only idempotent refresh, digest/content
  identity, artifact recheck and own-row compensation retain order and outcomes.
  Page projections omit artifact bodies; bounded paging/order/expiry stay models.
  Authorization grant cursors remain with the retained record owner.
- Record/integration audits: model create/read/page; typed count. Same finite
  scalar coercion/rejection, Json payloads, insertion defaults and empty response
  OID. Append errors never imply non-application or trigger retries.
- Revision maintenance: bounded model ID pages, typed conditional per-document
  coalescing of both nullable siblings at apply time. Same migration identity,
  batch bounds 1–10,000/default 500, restart/no-progress and safe diagnostics.
  Native unordered bulk is retained only for explicit Waterline rollback.

**No raw operational S CRUD.** Prisma control APIs cover catalog/index inspection
and explicit DDL (S-PG-01). Four existing unique-key duplicate audits use the
shared raw aggregation (S-PG-02). The only staged native inspection is one
unsupported server `buildInfo` per datastore (S-PG-03); typed maintenance is
registered as S-PG-04. Prisma-selected baseline startup skips duplicate native
schema/audit DDL; retained record/identity indexes keep their phase-7 owner.

GridFS calls are **permanent native exceptions** under the parent's ADR/user
decision: modern GridFSDriver, legacy storage datastreams/cleanup and legacy
branding-logo reads (S-GRIDFS-01–03). Their PostgreSQL approach is **MongoDB
retained for GridFS (PostgreSQL has no equivalent), or a different binary store**.
This is not a SQL rewrite. Byte IO/lifetime code was not ported or changed.

Selectors are `prisma | waterline`, default Prisma; removed `mongodb` fails
with migration/index guidance. Supplied Compose/hook templates, wiki and storage
README are updated. The plain capability/repository contracts stay intact;
first-party helper exports are lazy and import opens no Prisma engine or sockets.

## Quirks and validation

S-02 accepts missing-as-null model reads/unknown-field omission without stored
rewrites. **S-03 improves** upsert patches: omitted accessCount/isJournal no longer
become create-default zero/false updates, following the user's supplied-fields
rule. S-04–08 preserve access-count read/overwrite/append order, journal and lease
fences, schema collision/recheck/compensation, audit coercion/append outcomes and
wrapper-only backfill partial effects. Counter S-01 remains untouched for phase 7.

Existing staged tests were adapted, not the historical campaigns. Contract
checks both attachment/schema/audit directions, raw fields, state replay, stale
cleanup tokens, scalar/Json shapes, rejected/applied-failed-ack writes, vanished
artifact compensation and manager bypass. Revision cases use 1,207 documents
per adapter and compare complete raw hashes; injected failure/resume, a 73-ID
page bound, malformed non-null preservation, no-progress, concurrent sibling
write, mapping refusal and model-free maintenance entrypoint are covered.
Readiness checks all 15 S scopes, duplicates/conflicts, hidden options, collation,
inspection-only/no automatic DDL and safe failures.

Commands source `.tmp/wrpz5/env.sh`; runners/logs remain ignored under `.tmp/wrpz5`.
All final checks pass:

| Command | Result |
| --- | --- |
| `timeout 420s npm --prefix packages/redbox-core run test:storage-transition` | **219 passed / 0 failed**; `final-contract.log`. |
| Same command with `-- backfill` | **16 passed / 0 failed**; `final-backfill.log`. Both complete raw hashes: `49ccded17f92518f88d45bdfb20ac1824f4e4b7569f83674afac04edaea8805d`. Observed Prisma pages are at most 73 IDs. |
| Same command with `-- readiness` | **14 passed / 0 failed**, all 15 S scopes; `final-readiness.log`. |
| `timeout 600s npm --prefix packages/redbox-core test -- --exclude test/unit/startup-module-loading.test.ts`, then isolated startup command below | **4,308 passed / 108 pending / 0 failed** combined: 4,307 in `core.log`, 1 in `core-startup-final.log`. |
| `timeout 480s bash .tmp/wrpz5/run-storage-tests.sh` | **329 passed / 0 failed**: 291 unit + 38 live MongoDB cases (12 Figshare intent, 9 shared concurrency, 17 pagination). Both `MONGO_TEST_URL` and `MONGO_CONCURRENCY_TEST_URL` enabled; `storage.log`. |
| `timeout 2600s bash .tmp/wrpz5/run-standard.sh` | Fresh sequential stacks: portal **419 passed / 10 pending / 0 failed** (`mocha.log`); Bruno General **folders 1–4 only**, **309/309 requests, 553/553 tests, 3/3 assertions** (`bruno.log`, `bruno-tests/result.json`). |
| `npm --prefix packages/redbox-core run build`; `npm --prefix packages/sails-hook-redbox-storage-mongo run build` | PASS, sequential externally timed builds, core generation/copy included. Core `tsc` and hook build pass again after the lazy-import correction. |
| `timeout 180s npm --prefix packages/redbox-core run typecheck:persistence`; core and hook `run lint` (90s each) | PASS on final code; `final-typecheck.log`, `final-lint.log`, `final-hook-lint.log`. |
| `npm --prefix packages/redbox-core run check:prisma`; `node .tmp/wrpz5/audit-fields.cjs`; `git diff --check` | PASS: generated contracts current, six inventories match exactly, no whitespace errors. Dependency pins and all lockfiles unchanged. |

The isolated startup command is `timeout 90s npm --prefix packages/redbox-core
test -- --no-config --node-option no-experimental-strip-types --require
ts-node/register/transpile-only --require chai --require test/setup.ts --timeout
5000 test/unit/startup-module-loading.test.ts` (9,735 ms). An initial core attempt
stopped on a deleted-adapter test import before cases ran; its fake now uses the
Prisma model seam. The first startup check exposed eager helper exports, fixed
with lazy wrappers and verified by the unchanged startup test. An explicit native
manager unit fixture now selects Waterline. The full core cases were not repeated
after the lazy-export correction; the focused startup, final transitions, strict
typecheck/lints, storage suite and portal/Bruno runs cover the final adapter code.
During implementation, the maintenance typed filter also required an explicit
ObjectId parameter codec; the final race/raw-hash checks cover that correction.

The stock portal confirms `storage=prisma`, attachment manager bypass and retained
record/authorization ownership. Its installed CLI inspection reports **72 ready
scopes / 29 collections**, including all **15 S scopes using Prisma**. Standard
mount-based Mocha/Bruno configurations were used with local resource limits,
pinned Node/MongoDB images and isolated `wrpz5-mocha` / `wrpz5-bruno` projects.
No application image was built. Temporary root `redoc`/`should` moves needed by
the mount runner were restored; the held dependency directory is empty.
Historical driver campaign fixtures remain archival and unexecuted; the current
S runner accepts only contract/backfill/readiness and rejects campaign arguments.

Local implementation commits: `f13ba3f39` (field contracts), `c899c7ef2` (model
adapters), `a039714d2` (lazy imports/index ownership), `ea8520bf5` (light tests).
The following documentation commit records this evidence, selectors and registers.
No push or PR. Cleanup audit finds **zero owned containers (including stopped),
networks, volumes or images**, checked by `wrpz5` names, task labels and both
Compose project labels; unrelated `development-*` containers remain running.
The preserved `.tmp/wrp8/prior-0ea5e9bc2.tar` is **723,557,888 bytes**, SHA256
`321e678c626f7883306209e1cbdc257afaf08185b38ce7ee99f5218692a44091`.

## Phase 6 / 7 handoff

Phase 6 covers User, Role, UserLink, UserAudit, PathRule, WorkspaceApp and actual
loaded membership collections. P0 captured **role_users__user_roles** on mongodb:
`_id`, `user_roles`, `role_users` ObjectIds, no unique pair/timestamps, duplicates
and dangling edges allowed. Use an explicit edge model; rediscover institution
junctions rather than assuming many-to-many arrays. `archive` is separately
generated, not a membership junction. Preserve password callbacks, credential-safe
projections and ordered link/disable/access/audit/external effects, no transactions.

Phase 7 covers records/deleted records, CAS/lifecycle, permanent recordidentity,
authorization, U participation, **Counter with Prisma atomic increment** and OID
rebind. The existing record/deletedrecord roots are maintenance-only projections.
Preserve revision/incarnation/operation fencing and unknown outcomes; keep the
two datastore owners and schema Date codecs. GridFS permanently remains native.
