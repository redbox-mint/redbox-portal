# P10 S operation classification

**Current status — Prisma phase 7:** the S selector now covers all record,
DeletedRecord, CAS/lifecycle/source-intent, recordidentity, authorization/U,
Counter and OID-rebind paths as well as staged storage. Values are
`prisma | waterline`, default Prisma; `mongodb` is rejected. Counter uses an
atomic Prisma increment (S-01 improved). TX-PARITY-01/01a and ADR 0004 supersede
all transaction/shared-session and campaign gates below. No transactions;
ordered partial outcomes remain. [Phase 7 evidence](evidence/prisma-phase7.md)
and the [current operator guide](../../wiki/Staged-Storage-Persistence.md) are
current. The rest of this page records the **historical staged qualification**.


The initial inventory covers P10.1–P10.3, starting at `004c91054`. P10.5 adds
the independent staged-safe revision maintenance unit below; P10.6 changes byte
resource ownership without moving record/U operations. G-TX remains CLOSED /
OPS-TX-01 undecided. P10.7–P10.8 now qualify and separately promote only the
staged subset (`0be51a5f6`), with `mongodb` default and explicit `waterline`
rollback. The baseline/atomic classifications below are unchanged. Record,
identity, U participation, authorization lookup, Counter and OID rebind remain
Waterline/native-owned regardless of selector; P10.4 and P11 remain outstanding.
See [validation](p10-s-validation.md) for the bounded G-S staged PASS.

The physical spike loads all nine definitions against isolated standalone MongoDB.
`evidence/p10-s/raw-fixtures.json` records synthetic raw BSON, loaded attributes,
index options, native identity/schema documents and a binary SHA-256 fixture.
No institution data is inspected. Plain DTO timestamps distinguish ISO strings
from the native schema path's Date values; external service contracts keep Dates.

| Operation family | Existing consistency / outcome | Disposition |
| --- | --- | --- |
| Attachment reads, metadata upsert/remove, journal prepare/mark, coordinator claim/renew/release and cleanup state transitions | Staged coordination. Conditional single-document writes fence generation, token and lease. Preparation is not a multi-row transaction. A dispatched exception is unknown, never automatically replayed as absent. Cleanup retains journals until authoritative reconciliation. | Staged candidate; keep the complete journal/coordinator protocol together. |
| Attachment access metadata update followed by audit append | Ordered best effort, caught errors; accessCount is read/write and can lose updates. No exactly-once append claim. | Staged. |
| Attachment OID rebind | Multi-row update, currently staged with record/file operations. Not an atomic rename. | Baseline while record identity orchestration remains baseline. |
| Counter find-or-create, read, mutate candidate, write next value | Unique name alone, optional branding reference. Concurrent readers can write the same next value; no atomic allocation guarantee. | Baseline with the retained record orchestration: the caller candidate is mutated before an unconditional observed-value overwrite, with no CAS, retry key or outcome ledger. This is not an independently recoverable allocator protocol; a staged allocator backend needs a separate domain decision and must not silently introduce `$inc`. |
| Record create/reserve identity, revision CAS/update, tombstone intent/claim/remove, restore, identity retention and unused reservation release | Existing staged state machine. Single-document CAS is atomic; the entire lifecycle is not a multi-document transaction. Unknown create retains its reservation; only certified non-application plus empty-state checks permits release. | Baseline for this round, including staged lifecycle, to keep the U-participating record boundary intact. |
| Record authorization rewrites for linking/pending access | UsersService.rewriteLinkedRecordAuthorizations calls RecordsService.mutateMetaInternal, which reaches the same updateMeta used by ordinary saves. Storage options carry no atomic-unit/session discriminator. User callbacks also scan the loaded Record model. Splitting updateMeta by selector would route part of U through a new driver pool without coordinated sessions. | G-TX baseline-only. Do not infer that the baseline itself supplies multi-document atomicity. |
| Record reads, relationship/export scans, harvest enrichment, Figshare source intents, binary streams | Coupled to the retained record adapter and capability/identity ownership. Existing native queries and streams remain private there. | Baseline for this round; no partial record owner switch. |
| RecordAudit / IntegrationAudit append/read/count | Standalone audit writes, no unit spanning primary record and audit. Unknown append must not be blindly retried; record durable-audit failures retain existing service behavior. | Staged candidate. |
| Immutable schema artifact put/read/page/touch | Digest-content collision checks, duplicate race readback, bounded page. Dates physically native BSON Dates. | Staged. |
| Schema grant/save/pin put/read/page, expiry filtering | Artifact check, immutable reference-key write, artifact recheck and own-row compensation. This is the existing staged protocol; it is not a transaction. | Staged. |
| Schema authorization grant lookup | Read-only indexed cursor; update grant joins current record authorization. | Baseline with record authorization owner. |
| Schema retention | Existing non-destructive bounded dry run; reads artifacts/references and expiry. No destructive retention API exists. A future atomic reference/artifact deletion is a new consistency decision. | Staged reads; future atomic deletion G-TX if required. |
| Record revision backfill | Conditional missing/null-only wrapper batches and restart checks; no record content, identity, authorization or lifecycle-operation mutations. | P10.5 independent staged-safe maintenance operation. S=mongodb uses the app-owned redboxStorage driver after wrapper mapping checks; waterline keeps the native borrowed manager. Record/U operations remain baseline-only. |
| Any new all-or-none record/audit/schema/attachment unit or operation participating with U | Requires shared supported driver session on approved topology and failure/rollback evidence. Compensation or single-document CAS does not qualify it. | G-TX baseline-only regardless of S selector. |

The concrete operation inventory below distinguishes replay-safe state changes
from operations that merely retain the existing staged behavior. **Staged does
not mean automatically retryable.** A validation rejection before dispatch is
not applied; a conditional miss is not applied by that write (an earlier retry
may already have advanced the state). After dispatch, an acknowledgement failure
is unknown. Neither adapter adds an automatic write replay. Read-only failures
have no write outcome. Existing response/error contracts remain authoritative.

| Attachment repository operation | Route under `mongodb` / replay and outcome rule |
| --- | --- |
| `upsert` | Staged driver. Read by stable key/physical identity, then one insert or update. Repeating the same payload converges on that identity but refreshes timestamps and can overwrite concurrent metadata; not a CAS or replay authorization after unknown. Unique keys reject identity collisions. |
| `findByOid` | Staged driver read; confirmed physical rows only, existing creation ordering. |
| `findUnresolvedByOid` | Staged driver read of retained unresolved journal states. |
| `findUnresolvedByStagingFileId` | Staged driver read across OIDs for the normalized global staging identity. |
| `findOneByStorageKey` | Staged driver singular read; missing is undefined, multiple matches refuse use. |
| `prepareMutations` | Staged driver sequence per row: claim/renew conditional coordinator lease, insert generation journal, release coordinator. Not batch atomic or blindly idempotent; an existing generation rejects, so reconcile unknown preparation rather than recreate it. |
| `markMutation` | Staged driver conditional single-row transition from an allowed source state, keyed by journal identity/generation. A replay after advancement returns false without a second transition or attempt increment. |
| `hasCleanupClaim` | Staged driver singular read; malformed/ambiguous ownership refuses use. |
| `claimExpiredStagingCleanup` | Staged driver bounded scan plus conditional row claims. Initial claims fence cancelled state/age; reclamation fences old token/state/lease. Earlier claims may apply if a later claim fails; reconcile unknowns. |
| `beginStagingCleanup` | Staged driver coordinator acquisition plus conditional journal transition; recognizes the same token already checking/removing. This is a fenced staged sequence, not a two-row transaction. |
| `authorizeStagingCleanup` | Staged driver coordinator renewal plus conditional checking-to-removing transition; recognizes the same token already removing. Physical bytes are still removed by the retained caller. |
| `releaseStagingCleanup` | Staged driver conditional pending/checking-to-cancelled transition followed by coordinator release. Same-token cancelled readback permits recovery; coordinator release can still return false. |
| `completeStagingCleanup` | Staged driver conditional removing-to-cleaned transition followed by coordinator release. Same-token cleaned readback permits recovery; no repeated physical deletion is authorized by this method. |
| `recoverStagingCleanup` | Staged driver reconciliation using caller-observed byte presence: absent completes; present retains and renews the removing lease. Stale token loses; presence never authorizes destructive retry. |
| `rebindOid` | **Baseline only**, injected into the driver repository; no native rebind implementation. Multi-row rename remains with record/U/byte orchestration and does not become atomic. |
| `markDeleted` | Staged driver metadata tombstone upsert. Same identity/payload converges but timestamp/overwrite caveats match upsert; no byte-delete transaction. |
| `deleteByStorageKey` | Staged driver deletion by unique storageKey (at most one row after readiness). Repeated acknowledged deletion is a no-op; after unknown, reconcile identity before replay because a new row could reuse the key. |
| `recordAccess` | Staged driver ordered metadata read/overwrite then independent audit insert and best-effort SIEM emit. Non-idempotent append; concurrent counts can lose updates. Metadata failure prevents append; append failure can follow an applied metadata change. |

| Storage hook operation | Route under `mongodb` / replay and outcome rule |
| --- | --- |
| `putRecordSchemaArtifact` | Staged driver immutable digest insert with content-identity readback on duplicates; identical content is accepted, differing content conflicts. Unknown acknowledgement still requires reconciliation. |
| `getRecordSchemaArtifact` | Staged driver read with existing digest validation and domain error codes. |
| `listRecordSchemaArtifacts` | Staged driver bounded page/read; no raw cursor escapes. |
| `touchRecordSchemaArtifact` | Staged driver one-row timestamp update; repeats refresh time, not exactly-once. |
| `putRecordSchemaReference` | Staged driver immutable reference-key insert/readback between target existence checks; own-row compensation if target disappears. Identical key/content accepted; collision rejected. No transaction or stronger grant/retention guarantee. |
| `listRecordSchemaReferences` | Staged driver bounded/scoped read with existing expiry/pin semantics. |
| `createRecordAudit` | Staged driver standalone non-idempotent append, existing response contract; unknown requires reconciliation before retry. |
| `getRecordAudit` | Staged driver read, existing date filtering/row DTO semantics. |
| `createIntegrationAudit` | Staged driver standalone non-idempotent append, same unknown rule. |
| `getIntegrationAudit` | Staged driver paginated read with existing date/status/order semantics. |
| `countIntegrationAudit` | Staged driver read using the same criteria as the page. |
| `findRecordSchemaGrantForAuthorization` | **Baseline only**: read joins current record authorization; shares retained record owner. |

All remaining storage operations are explicitly baseline-only:

- `init`, `getCapabilities`: retained owner initialization/capability contract;
  the facade separately inspects staged readiness.
- `create`, `updateMeta`, `setRecordFields`, `createBatch`,
  `provideUserAccessAndRemovePendingAccess`: current record writes/reservations,
  revision CAS and authorization mutation. `updateMeta` is also reached by U;
  an atomic U unit must wait for G-TX. Batch is not promoted to atomicity.
- `createTombstone`, `updateTombstone`, `removeTombstone`, `removeActiveRecord`,
  `createActiveRecordFromTombstone`, `delete`, `restoreRecord`,
  `destroyDeletedRecord`: existing staged lifecycle and permanent identity ledger,
  including conditional incarnation/operation ownership and unknown outcomes.
  Any future all-or-none cross-collection lifecycle is G-TX-gated.
- `getTombstone`, `getLifecycleTombstones`, `getMeta`, `getRecords`,
  `getRelatedRecords`, `getDeletedRecords`, `getDeletedRecordMeta`,
  `exportAllPlans`, `exists`, `scanFigshareRecords`, `findHarvestRecords`,
  `findFigshareArticleRecords`: retained record/identity reads, scans and export.
- `readyFigshareIntent`, `pendingFigshareIntents`, `recoverStaleFigshareIntents`,
  `abandonFigshareIntent`, `acknowledgeFigshareIntent`, `updateNotificationLog`:
  retained record-side conditional intents/metadata; J4 orchestration is unchanged.
- `addDatastreams`, `updateDatastream`, `removeDatastream`,
  `removeStagedDatastream`, `addDatastream`, `addAndRemoveDatastreams`,
  `getDatastream`, `listDatastreams`: retained byte owner and record coordination;
  staged recovery remains staged, atomic metadata/byte units are not introduced.
- Counter `readOrStartGlobal`, `writeObservedValue`: retained actual loaded model
  callbacks and unconditional overwrite, including legacy JavaScript addition.
  Two readers can both write 1; stronger allocation is a separate decision.
- Revision backfill entrypoint: the independent selected bounded maintenance
  operation delivered in P10.5. Schema retention remains existing read-only
  orchestration borrowing the selected schema operations.

The live contract iterates the exported `baselineStorageOperations` list and
checks every facade owner, invokes attachment rebind through the loaded model,
and exercises the real baseline Counter under MongoDB selection.

PostgreSQL obligations remain explicit: permanent OID/incarnation ledger,
tombstone uniqueness and ABA fencing, JSON missing/null and query semantics,
digest/reference constraints, string versus native Date codecs, conditional
leases and a separate blob replacement. No generic ORM/query port is introduced.

The historical P10a byte probe characterized a legacy native-owner failure:
`new GridFSBucket(Record.getDatastore().manager)` rejected BSON 7 ObjectIds in
the borrowed Waterline manager's BSON 6 serializer. The original storage 7.2.0
and attempted 7.7.0 alignment both used BSON 7; pin alignment alone did not fix
it. That failed probe remains in `evidence/p10-s/legacy-gridfs-abi.json`.

P10b separately pinned first-party drivers to exact 7.7.0 and fixed legacy bytes
by giving the bucket the app-owned BSON 7 Db in the same Record datastore/fs
namespace. Record/U/lifecycle operations still borrow the Waterline manager.
P10.6 draining/partial-init/failed-close proofs and P10.7 byte/journal/prior-image
recovery renew that ownership. See [validation](p10-s-validation.md); no collection
or record/atomic operation moves merely because S defaults to MongoDB.
