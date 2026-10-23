# Prisma phase 3 — J1–J4

2026-10-22; base `2e234755e`, ARM64 / 2 CPUs / 12 GiB. Node **24.16.0**,
npm **11.20.0**; pins unchanged: Prisma **8.0.0-rc.24**, orm-mongo **8.0.0-rc.19**.
Only owned `wrpz3-*` disposable resources and the pinned MongoDB 9.0.4 digest.
Sequential memory-heavy commands use external timeouts. No transactions, prior
images, budget campaigns, mixed-instance matrices or browser runs.

Step 0 is `760d6a798`: remove 17 synthetic R/Q fields, retain the two real 2b
additions (`WorkspaceType.label`, `Form.attachmentFields`), regenerate artifacts,
and verify raw undeclared-field preservation plus omission from Prisma reads.
R **5 groups / 16 directions**, Q **7 groups / 8 directions** passed. Details
and superseded 2b claims are corrected in phase 2 evidence and R-05/Q-08.

## Field inventory and implementation

Fields come from the Waterline definitions, service/native writers, storage DTOs
and P0/P5 physical captures; probe-only extensions are excluded. All primary
identities remain ObjectId `_id`; audits remain ISO strings. Optional reads can
be null; partial patches never come from a round-tripped decoded row. J4 whole-state
replacement uses a typed JSON projection to retain physical field absence.

- **J1:** AsynchProgress: name, branding (ObjectId), date_started/date_completed,
  started_by, currentIdx/targetIdx (double), status, message, metadata (Json),
  relatedRecordId/taskType. WorkspaceAsync: name, recordType, dates, started_by,
  service/method, args/message (Json), status. Both include createdAt/updatedAt.
  These match P5a's physical map and AsynchsService/WorkspaceAsyncService;
  no real extra fields were found. Model create/list/patch/delete replace the
  driver; conditional per-row updates retain the original predicates.
  Stored named-query expression translation is the only raw CRUD-related use;
  readiness uses Prisma catalog control and retains only buildInfo natively.

- **J2:** HarvestRun: sourceRunId, brandId, recordType, sourceName/sourceUri,
  status, startedAt/completedAt/startedBy/lastChunkAt, totalProcessed, created,
  updated, deleted, unchanged, failed, chunksProcessed, duplicateChunks, metadata
  (Json). HarvestRunChunk: runId/brandId/recordType/sourceRunId/contentHash,
  attempt, chunkIndex/chunkLabel/totalExpected, status, recordCount and the six
  outcome counters, duplicate, submittedAt/completedAt/errorMessage,
  responseSummary (Json). HarvestRecordEvent: runId/chunkId/brandId/recordType/
  sourceRunId/harvestId/oid, operation/outcome/status/message/details/errorCode,
  recordSnapshot (Json), caller-createdAt. All include updatedAt; run/chunk also
  createdAt. Matches P5b, HarvestRunService and native counter writers. Driver
  CRUD is deleted. Models handle CRUD and ordered createAll; typed count and
  atomic counter pipelines cover the remaining domain operations without raw.
  Loaded Waterline CRUD/callbacks remain; its native counters now use Prisma,
  with the old counter algorithm in test helpers only.

## Verification

J1: `timeout 240s npm --prefix packages/redbox-core run build`, strict persistence
typecheck and `timeout 180s node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json`
PASS; `timeout 240s bash .tmp/wrpz3/run-j1.sh` **3 check groups / 4 entity directions
passed / 0 failed**. Initial deletion check found membership values wrapped as a
single parameter; corrected to encode each operand before the passing run.

J2 build, strict persistence typecheck and timed compile PASS; `timeout 240s
bash .tmp/wrpz3/run-j2.sh` **4 groups / 6 directions passed / 0 failed**.
Initial fixture backend replacement altered its mongodb import; corrected before
cases. Initial counter check exposed the typed builder's need for explicit
ObjectId parameter codecs; corrected using its exported codec ID, then passed
concurrent totals, null/missing coalescing and both failure outcomes.

Runners/logs live in ignored `.tmp/wrpz3/`. Final counts and cleanup follow after
all four groups are assembled.

## J3 — SIEM envelopes and delivery attempts

Inventory: Waterline definitions, `siem/physical.ts`, capture/redaction and forwarding services, P0/P5 captures and the two delivery-ownership commits. SecurityEvent: eventId, brandId, portalId, eventType, category, severity, occurredAt, source, actor/subject/resource/requestContext/payload (Json), correlationId, traceId, deliveryState, leaseToken, leaseExpiresAt, nextEligibleAt, terminalAt, destinationStates (Json). SiemDeliveryAttempt: eventId, brandId, destinationId, adapterType, attemptNumber, leaseToken, status, startedAt, completedAt, durationMs, httpStatusCode, responseSummary/errorSummary (Json). Both include ObjectId _id and ISO createdAt/updatedAt. No fixture probes. Agenda ownership and serialized release remain unchanged.

`PrismaSiemRepository` uses model CRUD, predicate-fenced update and delete; counts use typed query builder. Claims retain a fresh token/expiry readback before external delivery; every save matches event, tenant, token and strictly unexpired lease. Retention deletes attempts before rechecking/deleting the terminal envelope. Legacy Waterline CRUD/callbacks remain loaded-model-owned; coordination and DDL use Prisma. Collection overrides bind the emitted contract before validation and hash recomputation. Both SIEM models must share the contract's application datastore; split datastore mappings fail with guidance rather than silently misroute. Prisma startup stays inspection-only. Catalog and index maintenance use control APIs; only server buildInfo remains native (J3-PG-01). No raw data API.

Validation: timed compile and `.tmp/wrpz3/run-j3.sh` PASS: **4 groups / 4 directions / 0 failures**. Both envelope/attempt directions, duplicate replay/tenant collision, raw IDs/audits/defaults, single concurrent claimant, stale token and expired-owner rejection, legacy missing-lease recovery, attempts-before-envelope retention, rejected/applied-failed-ack writes, real HTTP delivery redaction/per-destination retries/history and drain. Historical prior images and campaigns excluded. Initial compile reported missing loaded-model narrowing; corrected before running cases.

## J4 — Figshare durable state

Inventory: FigshareSync Waterline/physical map, storage DTO, native store and figshare-v2 import/receipt/checkpoint/worker writers, P0/P5 captures. Fields: oid, brandId, revision, importedGeneration, work (Json), nextActionAt, dispatchUntil, leaseOwner, leaseUntil, binding (Json), namespace, articleId, create (Json), createGeneration, createRequest, publish (Json), receipts/checkpoints (Json), status, waitingReason, publication, embargoed, accessible, observedAt, publicationAuditKey, error/audit/corrections (Json), auditClosed, optional ISO createdAt/updatedAt. No synthetic extension/lease probe fields. Revision is required: every durable state accepted by the existing validation has an integer revision.

`PrismaFigshareRepository` uses model upsert, conditional lease/dispatch/administration updates and model revision increment, owner lookup, due paging and binding reads. Whole-state CAS uses a typed replacement stage preserving immutable _id and omitted-field removal. Its read uses a typed JSON projection of the document without _id: both ordinary model reads and ordinary typed result decoding turn missing fields into null, which would backfill nulls during replacement. This projection preserves optional absence, explicit null and existing unknown stored JSON without adding probe fields to the contract. There is no raw operational CRUD. Legacy Waterline Figshare always bypassed callbacks and used fixed figsharesync; its wrapper now borrows the same Prisma adapter, loaded datastore and control DDL. Full unique OID, string-only partial unique namespace/article and polling index remain unchanged; no transaction/TTL/new constraint. Index readiness uses control APIs, typed array-key refusal and individually registered raw duplicate audit; native buildInfo only.

Validation: contract generation, corrected timed compile/copy, strict persistence typecheck and `.tmp/wrpz3/run-j4.sh` PASS: **4 groups / 2 directions / 0 failures**. Raw absent audits/optionals, exact replacement/unset and stable _id, receipts, binding conflict, concurrent CAS, stale/expired/successor lease fences, serialized dispatch, generation replay, fresh durable readback before source acknowledgement, rejected/applied-failed-ack CAS, source ack replay/drain and unsupported BSON. Existing retry/error unit coverage now exercises actual typed plan construction. Initial full build found JSON DTO/select-varargs typing mismatches, corrected before cases. Initial typed read backfilled nulls; the presence-preserving JSON projection corrected it. The old replaceOne count-only fault hook was adapted to the typed findAndModify transport. No prior images or hook/matrix campaigns ran.

The final J4 fixture also checks the loaded Waterline model directly: Prisma-written receipts are readable through `FigshareSync.findOne`, and a fully shaped Waterline-created row (including its ISO audits) is readable by the Prisma repository. `.tmp/wrpz3/j4-loaded-model.log`: **4 groups / 2 directions / 0 failures**.

## Final verification and remaining phases

`timeout 120s npm --prefix packages/redbox-core run check:prisma` and the same timed `run lint` PASS. Both emitted contract pairs are fresh; no pin/lockfile changes.

The full core run was performed **once**, with the startup deadline check isolated in a fresh process as in phase 2. `timeout 720s bash .tmp/wrpz3/run-core.sh`: **4,305 passed / 108 pending / 2 failed**. Both failures were route/schema-order bootstrap fakes that still supplied native createIndex managers rather than a configured Prisma datastore. Those tests now stub the SIEM/Figshare initialization boundary; production persistence is covered by the transition fixtures. The focused `test/bootstrap.test.ts --grep 'bootstrap pre-lift setup'` rerun passes **2/2**; the fresh startup test passes **1/1** at **9,845 ms** with its unchanged deadline. Combined coverage: **4,308 passed / 108 pending / no unresolved failures**; the full suite was not repeated. The optional Figshare live-service selector and stock portal manager-bypass assertions were also updated from mongodb to prisma.

Next: inventory V's seven real collections and institution/native writers before declaring models, keep arbitrary vocabulary payloads in Json and preserve slug/ordering/lookup and approval/projection partial effects. For B, fill both core and storage contracts: branding config remains in mongodb and history in redboxStorage (including separate servers). Preserve revision-fenced publication, history-before-active ordering, assets/cache effects and failed-ack recovery without adding transactions. V/B control/DDL/duplicate audits follow the existing Prisma paths; native/raw exceptions need individual register rows. Agenda queues, sessions, GridFS, identity and staged record storage stay with their existing owners in this phase. Historical P0/P5/prior-image campaigns are not current phase-3 runners and were not rerun.

Field totals including _id/audits: J1 **28** (15 + 13), J2 **64** (22 + 25 + 17), J3 **40** (24 + 16), J4 **32**; **eight models / 164 fields**. Control inspection in the portal runner reports **72 ready index scopes / 29 collections**, with harvest/siem/figshare reporting Prisma (progress has no secondary index scopes).

| Final command (Node/npm environment sourced first) | Result |
| --- | --- |
| `timeout 240s npm --prefix packages/redbox-core run build` | PASS on the final source, including regeneration, compile and artifact copy. |
| `timeout 200s npm --prefix packages/redbox-core run typecheck:persistence` | PASS, all eight J models and persistence/unit boundaries. |
| `timeout 120s npm --prefix packages/redbox-core run check:prisma` | PASS, both emitted artifact pairs fresh. |
| `timeout 120s npm --prefix packages/redbox-core run lint` | PASS. |
| `timeout 1200s bash .tmp/wrpz3/run-portal.sh` (inside the sequential standard runner) | **419 passed / 10 pending / 0 failed**, default selectors. |
| `timeout 1300s bash .tmp/wrpz3/run-bruno.sh` (same runner) | **309 requests / 553 tests / 3 assertions passed / 0 failed**, General folders 1–4 only. |

Implementation commits: `760d6a798` (step 0), `d418df6ef` (J1), `a9274e63b` (J2), `292bff062` (J3), `b047c6a62` (J4), `6ef552cd1` (test harness/loaded-model checks). All are local; nothing pushed and no PR.

Cleanup audit after the standard runner and final build: **zero wrpz3 containers (including stopped), networks, or volumes** by names and ownership/project labels. No task images/build caches were created. Held root redoc/should dependencies are restored; no held directories remain populated. Generated outputs match the committed artifacts; ignored logs/runners remain under `.tmp/wrpz3`. Node 24.16.0/npm 11.20.0 and exact Prisma pins rechecked. No other worktree or unrelated development containers were changed.
