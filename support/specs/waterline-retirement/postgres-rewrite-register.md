# PostgreSQL rewrite register

MongoDB-specific persistence code that a later PostgreSQL migration must
rewrite, under [ADR 0004](adr/0004-prisma-for-all-persistence.md). Add a row
whenever code uses Prisma raw MongoDB APIs (`$runCommandRaw`, `findRaw`,
`aggregateRaw`) or keeps a direct MongoDB driver call. Direct driver calls also
need the specific reason no supported Prisma approach works.

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| C-PG-01 | C | `packages/redbox-core/src/persistence/indexes.ts:inspectPersistenceIndex` | Prisma raw (`client.raw.collection('cacheentry').aggregate`, then `client.runtime().query`) | Count duplicate-name groups without decoding payloads. | RC19's raw aggregation is the supported equivalent of `aggregateRaw`; normal ORM aggregation cannot express this group/count pipeline. | SQL `GROUP BY name HAVING count(*) > 1`, count groups. |
| C-PG-02 | C | `indexes.ts:inspectPersistenceIndex` | Prisma control inspection (`MongoInspectionExecutor`, `ListCollectionsCommand`, `ListIndexesCommand`) | Inspect collection collation and all indexes without a raw cursor limit. | Catalog metadata is outside model CRUD. RC19 has no `$runCommandRaw`/`findRaw`/`aggregateRaw` methods; its exported control API supplies these inspections. | Inspect PostgreSQL catalogs/constraints and collations. |
| C-PG-03 | C | `indexes.ts:ensurePersistenceIndex` | Prisma control DDL (`MongoControlAdapterImpl.executeDdl`, `MongoDriverImpl.fromDb`, `CreateIndexCommand`) | Explicitly ensure the existing full unique cache name index; startup remains inspect-only. | Use Prisma's supported DDL API, not application `createIndex` or an invented raw-command wrapper. No new uniqueness requirement. | Explicit SQL migration for the same name constraint after duplicate assessment. |
| C-PG-04 | C | `indexPreflight.ts:inspectPersistenceCollections` | Kept direct driver `db.command({buildInfo:1})` | Verify server major before activating Prisma cache. | **RC19 gap:** runtime/raw APIs accept only collection DML/aggregation, and control inspection only exposes collection/index/schema metadata. No arbitrary command or server-version API exists; aggregation and multiple model calls cannot return the MongoDB binary version. Reassess on RC upgrades. | Use supported connection/server version metadata. |
| F-PG-01 | Foundation | `persistence/runtime.ts:mongoDatabase`, `mongoResourceDatabase`, `mongoSessionDatabase`, `prismaDatabase`, `cleanupPersistence`; `mongodb/configuration.ts` | **Final native transport ownership**: offline `MongoClient` option parsing; app-owned connect/db/close | One pool per equal effective connection policy; core/storage Prisma clients and Agenda/session/GridFS borrow it. Explicit Agenda/GridFS/session URLs use the same owner. Resources drain/close before Prisma clients, then pools; failed closes retain ownership for retry. | Prisma URL-owned clients expose no supported native Db/pool handle to GridFS, Agenda or connect-mongo. Those SDKs require a real driver client/Db, so the app must supply and own it; this is transport, never a CRUD fallback. | App-owned datasource lifecycle. Retain MongoDB transport for GridFS unless bytes move to another store; replace Agenda/session backends before removing their Mongo transport. |

Phase 1 leaves existing M/R/Q/J1–J4/V/B/staged-S driver adapters and their
preflights unchanged, as explicitly required by the phase scope. These are
**pending Prisma migration**, not assertions that Prisma cannot implement them.
Their complete call sites remain in `packages/redbox-core/src/persistence/`
(group subdirectories) and `packages/sails-hook-redbox-storage-mongo/` plus the
native-owner inventory in `p0-inventory.md`. Replace each adapter and record its
Prisma raw uses or individually justified native exceptions in its own phase.
The cache has no driver CRUD adapter after phase 1.

Phase 2 additions (M, R and Q; updated by phase 2b):

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| M-PG-01 | M | `migration/preflight.ts`, `prisma/catalog.ts`, `indexes.ts` | Prisma control inspection/DDL | Preserve collection collation, complete index inspection and explicit existing name-index preparation. | Catalog metadata/DDL is outside model CRUD; RC19 exports `MongoInspectionExecutor` and `MongoControlAdapterImpl`. | Inspect catalogs; explicit constraint migration. |
| M-PG-02 | M | `indexes.ts:inspectPersistenceIndex` | Prisma raw aggregation/runtime | Count duplicate groups, treating missing key parts as null; never repair data. | Model aggregation cannot express this grouped duplicate audit. M/R/Q require simple collection/index collation, so the raw pipeline uses that same comparison. | `GROUP BY` / `HAVING` with matching null semantics. |
| M-PG-03 | M | `indexPreflight.ts:inspectPersistenceCollections` (via `migration/preflight.ts`) | Kept driver `db.command({buildInfo:1})` | Existing server-version readiness guard. | RC19 has no arbitrary-command or server-version API; neither model/raw collection DML nor catalog control commands expose the binary version (same gap as C-PG-04). | Supported datasource/server metadata. |

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| R-PG-02 | R | `reference/PrismaNamedQueryTargets.ts:executePrismaNamedQuery` | Prisma raw match/count/sort/page/project aggregation | Translate the unchanged closed expression subset, including dotted JSON, literal text operators, IDs and exact object/array equality. | Runtime stored expressions need Mongo predicates beyond ordinary typed field filters, with existing refusal and tenant scope. | Translate the same validated subset to SQL/JSON paths, collation and scoped count/page. |
| R-PG-03 | R | `reference/preflight.ts`, `prisma/catalog.ts`, `indexes.ts` | Prisma control inspection/DDL and raw duplicate aggregation | Inspect eight collations and four existing key indexes; explicit ensure only. | Catalog/DDL and duplicate grouping are outside model CRUD (M-PG-01/02 implementation shared). | Catalog audit and reviewed unique constraints, no new brand/name constraint. |
| R-PG-04 | R | `indexPreflight.ts:inspectPersistenceCollections` (via `reference/preflight.ts`) | Kept driver `buildInfo` | Existing version guard. | Specific RC19 server-version gap documented in M-PG-03/C-PG-04. | Datasource/server metadata. |

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| Q-PG-02 | Q | `reference/PrismaNamedQueryTargets.ts:executePrismaNamedQuery` | Prisma raw match/count/sort/page/project aggregation | Four closed tenant-scoped query targets, same supported expressions/refusals. | Stored dotted JSON expressions and exact Mongo equality/collation semantics exceed ordinary typed filters. | Validated SQL/JSON expression translator and scoped count/page. |
| Q-PG-03 | Q | `configuration/preflight.ts`, `prisma/catalog.ts`, `indexes.ts` | Prisma control inspection/DDL and raw duplicate aggregation | Existing three Q indexes, collection collations, explicit deployment ensure. | Catalog/DDL/duplicate grouping are outside model CRUD; shared M/R implementation. No AppConfig uniqueness or lease TTL. | Catalog audit / reviewed existing constraints. |
| Q-PG-04 | Q | `indexPreflight.ts:inspectPersistenceCollections` (via `configuration/preflight.ts`) | Kept driver `buildInfo` | Existing binary-version guard. | RC19 gap: no arbitrary/server-version command in model, raw collection DML or catalog control APIs (C-PG-04/M-PG-03). | Supported datasource/server metadata. |

Phase 2b removes **R-PG-01, Q-PG-01, Q-PG-05 and Q-PG-06**: every R/Q
ordinary read/create/patch/delete uses `client.orm.<model>`. Dashboard CAS uses
`where({branding, revision}).update(submitted)`; a non-null after-image means a
match even for a no-op, without relying on modified counts. Lease inspection
uses the model API and accepts null-for-missing metadata under ADR 0004.

**Q-PG-07** is retired from this raw-use table: lease writes use the supported
typed builder, never `client.raw`. It expresses conditional upsert, nondecreasing
expiry (`max`), owner-fenced token writes and owner `unset` with matched counts.
Port these operators to conditional insert/update, `GREATEST` and nullable owner
columns. This is a portability note, not a raw CRUD exception.

Remaining R/Q raw operations are only the stored NamedQuery/report expression
translators and duplicate audits; catalog/DDL and individually justified
`buildInfo` guards are also listed above. Null/missing read shape and newly
discovered fields are contract/quirk concerns, never raw-access reasons.

Phase 2 removes M/R/Q driver CRUD/query adapters. Waterline remains explicitly
selectable for loaded-model CRUD/callback rollback; its former Q native CAS,
lease and index helpers now also use Prisma. Only M/R/Q `buildInfo` calls remain
native, for the individually documented RC19 version gap. Other groups remain
pending as described in phase 1. The old native lease algorithm exists only in
unit-test mocks to retain pre-migration service/failure characterization.


Phase 3 additions (J1–J4):

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| J1-PG-01 | J1 | `reference/PrismaNamedQueryTargets.ts:executePrismaNamedQuery` | Prisma raw aggregation/runtime | Translate existing stored tenant-scoped progress queries, count/page/project. | Same closed stored-expression translator as R-PG-02; dotted JSON and exact object equality require this qualified translation. Ordinary progress CRUD uses models. | Validated SQL/JSON expressions and scoped count/page. |
| J1-PG-02 | J1 | `progress/preflight.ts`, `prisma/catalog.ts` | Prisma control inspection | Check both physical collections' simple collation; no new indexes. | Catalog metadata is outside model CRUD. | Catalog/collation inspection. |
| J1-PG-03 | J1 | `indexPreflight.ts:inspectPersistenceCollections` (via `progress/preflight.ts`) | Kept driver `buildInfo` | Existing server-version guard. | Specific RC19 binary-version/arbitrary-command gap, as C-PG-04. | Supported server metadata. |

| J2-PG-01 | J2 | `harvest/preflight.ts`, `prisma/catalog.ts`, `indexes.ts` (`prisma`) | Prisma control inspection/DDL and raw duplicate aggregation | Four run/four chunk/six event indexes, two pre-existing unique keys, explicit prepare. | Catalog/DDL/grouped duplicate audit are outside model CRUD. No automatic cleanup/new constraint. | Catalog audit, reviewed constraints and grouped SQL duplicate audit. |
| J2-PG-02 | J2 | `indexPreflight.ts:inspectPersistenceCollections` (via `harvest/preflight.ts`) | Kept driver `buildInfo` | Existing version guard. | RC19 binary-version/arbitrary-command API gap (C-PG-04). | Datasource/server metadata. |

J2 ordinary reads/writes use models; count uses the typed query builder's
`count`, and counters use its typed conditional `findOneAndUpdate` / stage
emitters. These are **not raw exceptions**. The counter pipeline coalesces
missing/null to zero and computes status from the resulting failed total in
one document write, leaving updatedAt untouched. Port to SQL atomic arithmetic,
COALESCE and CASE, returning the after-image. Waterline's native counter owner
also uses this implementation, bound to the loaded run datastore. Its old
native/optimistic algorithm is retained only in unit-test characterization.

### Phase 3 J3 Prisma audit

| ID | Site | Decision / PostgreSQL follow-up |
|---|---|---|
| J3-PG-01 | `indexPreflight.ts:inspectPersistenceCollections` via `siem/preflight.ts` | Direct driver server-version inspection only: RC19 exposes no equivalent control command. Replace with PostgreSQL server capability inspection. |
| J3-PG-02 | `PrismaSiemRepository` / legacy coordination | Model CRUD and conditional token/expiry writes; typed counts; control catalog/DDL and the shared raw eventId duplicate audit (grouped inspection has no model equivalent). No raw/direct operational CRUD. Preserve event/tenant/token fencing, fresh readback and ordered attempt-before-envelope cleanup. Port ISO timestamp ordering explicitly. |

### Phase 3 J4 Prisma audit

| ID | Site | Decision / PostgreSQL follow-up |
|---|---|---|
| J4-PG-01 | `indexPreflight.ts:inspectPersistenceCollections` via `figshare/preflight.ts` | Direct driver server-version inspection only; RC19 has no control equivalent. Replace with server metadata. |
| J4-PG-02 | `figshare/preflight.ts` / `indexes.ts` | Control catalog/DDL, shared full-OID and operation-specific partial-binding raw duplicate aggregations. Model CRUD has no grouped duplicate-audit equivalent; preserve the exact string-only partial filter. Array-key refusal uses typed query AST, not raw. PostgreSQL catalog and grouped SQL audits before reviewed unique constraints. |
| J4-PG-03 | `PrismaFigshareRepository` | Models handle upsert, lease/dispatch fencing, revision increment and scoped reads. Typed JSON projection plus typed whole-state replacement preserve absence, explicit null, unknown stored JSON and _id under CAS; no raw/direct CRUD. Port to revision-conditional JSON/state replacement with numeric-millisecond leases. |

## Phase 4 — vocabulary V

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| V-PG-01 | V | `reference/PrismaNamedQueryTargets.ts:executePrismaNamedQuery` | Prisma raw match/count/sort/page/project | Retain the stored named-query dialect, including dotted JSON and exact object equality, tenant scope and refusal rules. | Runtime stored expressions exceed ordinary model filters; ordinary repository CRUD uses models. | Validated SQL/JSON translator with scoped count/page. |
| V-PG-02 | V | `vocabulary/preflight.ts`, `prisma/catalog.ts`, `indexes.ts` | Prisma catalog/index control and raw duplicate audit | Inspect/explicitly prepare 21 existing scopes; accept compatible operator uniqueness. | Catalog/DDL are outside model CRUD; existing duplicate audit uses grouped missing-as-null keys. No new constraints. | Catalog inspection and reviewed existing indexes/duplicate grouping. |
| V-PG-03 | V | `indexPreflight.ts:inspectPersistenceCollections` via `vocabulary/preflight.ts` | Native `buildInfo` | Check the qualified server version. | RC19 offers no binary-version or arbitrary-command API. This is the sole retained V driver operation. | Server version check. |

## Phase 4 — branding B

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| B-PG-01 | B | `branding/preflight.ts`, `prisma/catalog.ts`, `indexes.ts` | Prisma control catalog/DDL and raw duplicate audit | Inspect/explicitly prepare config name and storage history brand/version indexes. Compatible operator uniqueness is retained; audits route to the descriptor's logical Prisma client. | Catalog/DDL and grouped missing-as-null duplicate inspection are outside model CRUD. No new constraints. | Catalog audit/explicit indexes and duplicate grouping on the correct datasource. |
| B-PG-02 | B | `indexPreflight.ts:inspectPersistenceCollections` via `branding/preflight.ts` | Native `buildInfo` for each datastore | Check server versions independently, including separate-server layouts. | RC19 exposes no binary-version or arbitrary-command API; sole retained B native operation. | Per-datasource server metadata. |
| B-PG-03 | B | `reference/PrismaNamedQueryTargets.ts:executePrismaNamedQuery` | Prisma raw count and match/sort/page/project | Retain stored history queries, JSON equality, tenant scope and projection on redboxStorage. | Stored dotted JSON expressions and exact Mongo equality semantics exceed ordinary typed model filters; repository CRUD and migration bodies use models. | Validated scoped SQL/JSON translator on the history datasource. |

B has no raw operational CRUD, including publication and frozen migration writes.
Waterline's historical sidebar native helper is deleted; fallback borrows Prisma
model operations with loaded collection/datastore bindings. B-01's model update
retains version/draftRevision in its single conditional after-image. Neither client
provides a transaction across config/history. Phase 5 must route each storage
model/raw audit through redboxStorage rather than assuming the core contract.


## Phase 5 — staged storage S

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| S-PG-01 | S | `storage/preflight.ts`, hook `persistence/preflight.ts`, `prisma/catalog.ts`, `indexes.ts` | Prisma control catalog/index inspection and explicit DDL | Preserve all 35 S scopes: seven attachment/Counter and 28 record/deletedrecord/identity/schema/audit scopes, simple collation and native schema hidden/persistent options. | Catalog/DDL has no model-CRUD equivalent. Startup remains inspect-only. | Inspect SQL catalogs and explicitly prepare the same constraints/indexes. |
| S-PG-02 | S | `indexes.ts::inspectPersistenceIndex` for `attachmentmetadata.storageKey`, `attachmentmetadata.oid/fileId`, `recordschemaartifact.digest`, `recordschemareference.referenceKey`, `counter.name`, `record.redboxOid`, `deletedrecord.redboxOid`, `recordidentity.redboxOid` | Eight Prisma raw duplicate aggregations | Count duplicate groups with missing-as-null key components before operator-owned uniqueness. Storage audits use redboxStorage; attachments use mongodb. | Grouping duplicates is outside ordinary model CRUD. No raw operational S CRUD. | GROUP BY/COALESCE duplicate checks on the corresponding datasource. |
| S-PG-03 | S | `storage/preflight.ts`, hook `persistence/preflight.ts` | Native `buildInfo` (one per logical datastore) | Verify qualified server binary version. | RC19 has no supported server-version or arbitrary-command API; catalog/DDL otherwise uses Prisma control. | Per-datasource server-version metadata. |
| S-PG-04 | S | `storage/PrismaRecordRevisionMaintenance.ts` | Prisma typed conditional update pipeline | Bounded model ID pages, apply-time missing/null coalescing of revision/lifecycle siblings, no broad record writes. | Ordinary patches cannot atomically coalesce two nullable siblings; typed builder does, without raw. | Conditional UPDATE with COALESCE and affected-row count; preserve page/restart/no-progress rules. |
| S-GRIDFS-01 | S / bytes | `storage/GridFSDriver.ts` (`getBucket`, reads, `put`, deletion/cleanup, filename/prefix listing); `storage/writeGridFSStream.ts`, `storage/ownGridFSDownload.ts` | **Permanent native exception**: GridFSBucket streaming upload/download, find and delete, stream lifetime | Modern binary-store owner, chunk/file protocol and cleanup. | User decision in ADR 0004 “GridFS stays on the driver”; Prisma has no supported GridFS streaming/chunk protocol. Do not port bytes to model/raw JSON CRUD. | MongoDB retained for GridFS (PostgreSQL has no equivalent), or a different binary store |
| S-GRIDFS-02 | S / bytes | hook `persistence/StorageProtocol.ts` (`prepareGridFs`, `removeDatastream`, `addDatastream`, `getDatastream`, `listDatastreams`, `getFileWithName` and failed-upload cleanup) | **Permanent native exception**: GridFSBucket construction/find/delete/openUploadStream/openDownloadStreamByName | Legacy record datastream bytes in their existing fs namespace and app-runtime borrowed Db. | Same explicit ADR/user decision; GridFS's byte/chunk protocol and streams have no supported Prisma equivalent. | MongoDB retained for GridFS (PostgreSQL has no equivalent), or a different binary store |
| S-GRIDFS-03 | B / bytes | `services/BrandingLogoService.ts` legacy-logo GridFSBucket/openDownloadStream; app-runtime borrowed Db | **Permanent native exception**: legacy GridFS binary read | Preserve existing logo byte identity and effective database resolution. | Same ADR/user decision; no Prisma GridFS download stream API. | MongoDB retained for GridFS (PostgreSQL has no equivalent), or a different binary store |

Attachment metadata/journal/access-audit CRUD, schema artifact/reference CRUD and
record/integration audit CRUD/count use Prisma models or typed queries. No raw
operational CRUD, transaction or automatic unknown-outcome replay is introduced.
Phase 7 also moves record/lifecycle/identity/authorization/Counter/OID-rebind
operations onto model CRUD, conditional updates, atomic increment and typed queries. Waterline rollback
keeps its historical loaded/native implementations pending removal.

## Phase 6 — identity U

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| U-PG-01 | U | `identity/preflight.ts`, `prisma/catalog.ts` | Prisma control catalog/index inspection only | Discover seven existing physical namespaces and inspect their built-in ObjectId index; retain every operator login/email/ownership index and its collation without U DDL. | Catalog/index metadata has no model CRUD equivalent. No raw aggregation, native command or direct-driver U CRUD is added. | Inspect SQL catalogs/collation and retain the reviewed existing constraints. |

U operational CRUD and the explicit membership graph use Prisma's model API.
Identity dotted JSON ordering uses the model-aware typed query builder because
RC19 model `orderBy` accepts root fields only; predicates carry explicit ObjectId
parameter codecs, sorting precedes repository paging, and the same safe DTO and
population boundary applies. This adds no raw/native use. A SQL port needs JSON-path
ordering with equivalent missing/null and array semantics; user tenant membership
filtering still precedes named-query count/paging. Root ordering stays on the model
API with all sort terms supplied together. DTO IDs remain strings while
all association keys and the edge's three keys remain BSON ObjectIds. A SQL
port must preserve duplicates/dangling edges until explicitly changed; no new
pair unique key or cascade is implied. UserLink IDs are application strings,
not foreign keys. Authentication credential checks stay private to repositories.
Account-link record selection/mutation and pending-access assignment now call
the Prisma S owner when selected; no U transaction/native exception is inferred.


## Phase 7 — remaining storage S

| ID | Group | Location | Kind | Purpose | Why not plain Prisma | PostgreSQL approach |
| --- | --- | --- | --- | --- | --- | --- |
| S-PG-05 | S | hook `PrismaRecordDocuments.ts`, core `storage/PrismaRecordRepository.ts` | Model-aware typed sorting/counting | Dotted Json/literal missing-field record/deletedrecord order and bounded counts with explicit ObjectId predicate codecs. | RC19 model orderBy accepts root fields only; models have no scalar count method. Typed builder covers both; no raw/native call. | JSON-path ORDER BY and COUNT with equivalent tenant/authorization predicates. |
| S-PG-06 | S | `storage/NamedQueryTargets.ts`, `prisma/modelFilter.ts` | Typed stored-query projection and model predicates | Preserve Mongo nested-array inclusion projection, physical absence, _id wire strings and regex options on declared Json content. | Model select cannot project nested arrays while retaining their structure and missing fields. Typed inclusion stage plus a Json envelope avoids read-null materialization; count uses typed match/count. No raw translator remains in S. | Validated tenant-scoped SQL/JSON projection and regex translator; retain output shape and identity refusal. |
| S-PG-07 | S | `prisma/recordOperations.ts::prismaRecordSnapshot`, hook `StorageProtocol.ts:PrismaStorage.getMeta` / `PrismaRecordDocuments.findOneAndDelete` | Typed authoritative read and atomic delete before-image | Preserve physical absence separately from explicit null when lifecycle snapshots are persisted and notification initialization tests for undefined. | Model reads/deletes coalesce missing optionals to null; read-then-delete cannot supply an authoritative atomic before-image. Public typed plans reuse the declared model result shape with absence-preserving leaves; all field codecs still run. No raw command, driver CRUD or unknown result decoding. | Presence-aware JSON projection and conditional DELETE RETURNING with the same snapshot/codec policy. |

Remaining operational record CRUD, CAS/lifecycle/identity/source intents,
authorization joins, Counter and attachment OID rebind use model API calls,
with presence-sensitive snapshots using the typed model result shape above.
Source pipelines are restructured as conditional model transformations; schema
authorization is bounded model grant paging plus model permission lookups. No new
S raw operational query or direct-driver exception remains. S-PG-01/02 include
full-S indexes/duplicate audits; S-PG-03 buildInfo and S-GRIDFS-01–03 are the only
S native exceptions outside explicit rollback. Counter atomic arithmetic maps to
UPDATE value = value + 1 RETURNING value / equivalent conflict-safe insert.

Final round 3 restores Counter's field-aware named-query predicates and ID sort
mapping on the model API; its existing typed count uses the identical translated
filter with explicit ObjectId codecs. A SQL port must retain scalar coercion and
case-sensitive model text modifiers, separately from Record's native Json/regex
dialect (S-PG-06). No raw API or driver exception is added. Deleted records,
recordidentity, audits and schema artifacts are not core named-query targets and
remain refused unless an institution registers an explicit scoped target.

## Phase 8 — final native ownership and raw audit

The sections above record historical phases; rollback/model bindings in those
sections no longer exist. All collections bind to the two declared logical
contracts. Q-PG-08 is retired: the inline rollback maintenance branch is deleted.
F-PG-01 is final ownership, not transitional migration scaffolding.

| ID | Owner / locations | Kept operation and strict supported-API gap | Final lifecycle / PostgreSQL approach |
| --- | --- | --- | --- |
| N-AGENDA-01 | `services/AgendaQueueService.ts:createAgendaForBackend`, third-party `@agendajs/mongo-backend` | Agenda's native Mongo backend requires a real Db and owns its scheduling/locking BSON protocol; Prisma exposes neither an Agenda backend nor the driver Db interface. The claim-fencing overrides (`saveJobState`, `saveJob`, release) participate in that same third-party protocol. This exception does not authorize application domain CRUD on native collections. | Default and explicit `agendaQueue.options.db` addresses borrow app runtime pools; registered `agenda` drains claims/operations and disconnects backend wrappers before pools. PostgreSQL requires another Agenda backend preserving its claim protocol, or replacement scheduler. |
| N-AGENDA-02 | `AgendaQueueService.ts:moveHistory`, `createMongoIndexes` | Native Agenda history copies opaque third-party job BSON, including native values and SDK-owned extension fields, without JSON decoding or altering its storage protocol. Dynamic configured collection names and native job result shape are owned by that SDK, not ReDBox domain contracts. Its supporting scheduling indexes are part of that protocol. | Maintenance is tracked by `agenda`; history retains its established app `mongodb` routing. Port history/indexes with the scheduler backend; do not convert job payload BSON through a Json codec. |
| N-SESSION-01 | `middleware/redboxSession.ts`, `runtime.ts:mongoSessionDatabase` | `connect-mongo` requires a native MongoClient; Prisma cannot implement that SDK interface. Session serialization, expiry index and touch operations belong to the store. | Registered `sessions` drains requests/store callbacks and closes timers; a close-only proxy stops the store closing the borrowed client. Replace with a PostgreSQL-compatible session store. |
| N-VERSION-01 | All group `preflight.ts` buildInfo sites, including storage hook | RC19 has no server-version or arbitrary command API (C-PG-04). All checks use runtime-owned Db handles; no extra pools. | No independent resource; version reads are tracked persistence operations. Replace with datasource capability inspection. |

S-GRIDFS-01–03 permanently retain GridFS's file/chunk/stream protocol, including
legacy record and logo paths. Modern drivers register `gridfs`, legacy storage
registers `storage-gridfs`, and logos register `legacy-logo-gridfs`.
Every Db now comes from the app runtime. A PostgreSQL deployment keeps MongoDB
for GridFS or chooses another binary store.

The final source audit finds Prisma raw use only in stored NamedQuery translators
(R/Q/J1/V/B, shared `prisma/documents.ts`) and duplicate audits (cache, shared
`indexes.ts`, Figshare partial-key audit). The rows C/M/R/Q/J1/J4/V/B/S above
cover their purposes and SQL replacements. Index/catalog operations use Prisma's
supported control APIs exclusively; the old direct-driver fallback is removed.
Ordinary domain CRUD uses model APIs or the already registered typed operations.

SIEM's two collections both use `datastores.mongodb`. Old split model/datastore
registrations are rejected with explicit guidance to move both collections;
this phase does not add cross-datastore SIEM clients or silently ignore mappings.

Ponytail named-query consolidation: R/Q/J1/V/B now share one raw aggregation executor with a closed target catalogue. The catalogue fixes each datastore, field allowlist, ID conversion, readiness owner and decoder. Identity and record query semantics remain in their separate executors. The old `prismaDocuments` pipeline is removed; its raw query lives only in the shared executor.

Ponytail simplification: core group version/collation guards share `indexPreflight.ts:inspectPersistenceCollections`. Core storage uses the same guard; the storage hook retains its scoped schema/index audits. Generic catalog/duplicate inspection and DDL remain in `indexes.ts`/`prisma/catalog.ts`. This moves the listed native readiness calls without adding driver CRUD or startup DDL.

Cache now declares `cacheEntryIndex` and delegates duplicate/catalog inspection and DDL to the shared `indexes.ts` implementation. Its native buildInfo guard lives in `indexPreflight.ts`; the old cache raw aggregation and direct control adapters are removed. Cache report/error adaptation remains in `cache/preflight.ts`.

Storage simplification: the concrete `PrismaStorage` now lives in hook `persistence/StorageProtocol.ts`; former `PrismaStagedStorage.ts` audit/schema methods and `PrismaStorage.ts` record methods move there. `PrismaStorage.ts` retains only factory/lifecycle admission. All GridFS sites remain in `StorageProtocol.ts` (S-GRIDFS-02). `PrismaRecordDocuments.ts` retains the model-aware dotted-sort fallback and authoritative delete snapshot; list/options replaces cursors without adding raw or driver access. Audit count remains a model-aware typed plan.

The ponytail model-decoding and singular-query cuts add no raw or driver operations. Harvest/SIEM/attachment/audit model results use `prisma/modelRow.ts`; raw named-query decoders stay in the named-query catalogue. The stored physical field names and codecs are unchanged. Reference/configuration equality predicates now go directly through model `where` and its field codecs.

The mongosh deployment index fixture has its canonical template at `packages/redbox-dev-tools/templates/hook-archetype/standard/support/mongodb-persistence-indexes.js.hbs`; `support/resources/mongodb-persistence-indexes.js` is a byte-identical regular copy for deployment and Compose mounts, guarded by a core test. Correctness review round 1 restored the copy because npm pack omits symlinks. The commands are unchanged. Figshare's typed query plans now live in the closure-backed `prismaFigshareRepository` function in the same file; no raw/native work is added or removed by that composition change.
