# Waterline retirement design

## Current status — Prisma phase 8, 2026-10-22

**ADR 0004 step 4 is implemented for all twelve groups (C, M, R, Q,
J1–J4, V, B, S, U).** Prisma is the sole backend; rollback adapters,
models/globals/decorators, loader model generation and ORM dependencies are
removed. Stale selectors (including explicit `prisma`), model mappings and
institution model registrations fail with migration guidance. Only exact
loader-generated model/config shims are removed automatically.

Native GridFS, Agenda, sessions, binary-version checks and Prisma share
app-owned transport with explicit resource drains. F-PG-01 is final ownership.
SIEM events and attempts both use `datastores.mongodb`; split model datastores
are refused. Domain CRUD uses Prisma models; retained raw/native operations
are individually registered. No transaction or data/index repair is introduced.

[Phase-8 evidence](evidence/prisma-phase8.md) records the light verification,
dependency/audit results and remaining whole-branch review focus.
**ADR 0004 supersedes the historical G-STABLE, G-TX and per-group G-RETIRE
requirements below for this implementation.** Their stable-driver, browser,
budget and rollback-image campaigns are not phase-8 prerequisites. ADR step 5,
fuller qualification and release-owner acceptance remain separate work; this
status does not grant release acceptance or authorize a push/PR.

The phase sections and older gate descriptions below are historical snapshots.


## Prisma phase 1 — 2026-10-22

[ADR 0004](adr/0004-prisma-for-all-persistence.md) is the current architecture
and testing authority; conflicting ADR0003/C2 gates below are historical.
Foundation schemas/codegen/freshness and app-owned lazy clients are restored.
Cache C now uses Prisma by default behind its unchanged repository interface;
`prisma | waterline` are valid and obsolete `mongodb` fails with guidance.
Other group backends are unchanged. Both logical schemas live in core because
core owns repository composition/lifecycle; storage's separate schema is empty
until S. No transaction, data rewrite or new index requirement is introduced.
See [evidence](evidence/prisma-phase1.md), [quirks](quirk-register.md) and
[PostgreSQL rewrite obligations](postgres-rewrite-register.md).

Historical driver qualification (superseded by ADR0004): P0 evidence and
implementation assessment recorded; **G0 full-graph
approval HOLD**. See [P0 validation](p0-validation.md). No default promotion or group retirement is approved by this document. The binding database,
release and transaction
constraints below come from the task's user decisions. Read with the
[plan](implementation_plan.md), [tasks and evidence status](tasks.md) and
[design-time inventory](p0-inventory.md).

## Approved implementation direction — 2026-10-20

Decision owner: **user**. **ARCH-01 / G0R PASSED:** ADR0003 is ACCEPTED;
ReDBox-owned repositories/domain operations over the official MongoDB Node driver
are the selected architecture for all remaining groups. No new ORM or generic
query/CRUD facade, unit of work, public BSON/session types or per-model pools.

**REL-01 approved sub-decision:** move cache to the driver too. The official v6
cache contract is revised from Prisma-only to **driver-repository cache**.
C2 implements and qualifies the driver adapter behind the existing four-operation
interface, then promotes it in a separate commit. Only after promotion and
consumer verification may Prisma adapter/contracts/generator/freshness tooling,
prisma.config.ts, CLI/runtime dependencies and CI/Docker steps be removed.
C2 passed G-C2, separately promoted MongoDB, and removed Prisma from core. Explicit Waterline remains a temporary next choice; obsolete Prisma configuration fails with migration guidance. P7/G7 are not
passed by this decision; release scope/date otherwise remain open.

**G0 remains HOLD:** architecture and cache direction approved; BRAND-TX-01
is superseded by TX-PARITY-01 (both existing datastores, including separate servers); OPS-BUDGET-01/OPS-ROLLBACK-01 are provisional for
`next`. REL-01 scope/date, SEC-01 and INST-01 remain open. The user explicitly
authorizes transaction-free P1 and C2 implementation/qualification while these
remain open. This is not full-graph promotion or official release approval.

**OPS-TX-01 remains undecided / G-TX CLOSED.** Superseded as a migration
blocker by TX-PARITY-01 below: U/V/B and the remaining S paths proceed at parity. Do not switch repository dev/test/CI stacks to replica
sets. Disposable replica-set driver feasibility spikes are permitted; they do
not supply deployment approval. Preserve all physical/group/interop/rollback/
security requirements and deferred cache behavior.

## Transaction-parity decision — 2026-10-22 (supersedes G-TX as a migration gate)

Decision owner: **user (Andrew)**. Waterline never provided multi-document
transactions on supported ReDBox deployments: `runWithOptionalTransaction`
falls back to sequential execution on standalone MongoDB, and the other
previously gated paths never attempted a transaction. Requiring G-TX before
migrating them held the driver to a stronger standard than production.

- **TX-PARITY-01:** migrate U, V, B and the remaining S paths (records, deleted
  records, CAS/lifecycle, permanent identity, authorization, Counter, attachment
  OID rebind) to driver repositories **at Waterline parity**: the same write
  order, cleanup/compensation, compare-and-set/change checks and partial-failure
  outcomes, with no transactions. Each group still passes the existing
  raw/bidirectional/mixed/restart/rollback/injected-failure comparison against
  its Waterline baseline before a separate promotion commit.
- **`runWithOptionalTransaction`** is replaced by plain sequential execution,
  matching deployed behaviour. No transaction is attempted and no fallback
  warning is logged.
- **G-TX / OPS-TX-01 / P6** become a separate, later consistency improvement.
  They no longer gate any group's implementation, promotion or retirement, or
  final Waterline removal. No dev/test/CI replica-set conversion is authorized.
- **BRAND-TX-01 is superseded:** B migrates at parity on the existing two
  logical datastores, including separate-server installations. No history
  relocation.
- **Counter:** keep today's read-then-write allocation at parity for this
  migration (concurrent callers can obtain the same number). An atomic
  increment is a separate later decision.
- **TX-PARITY-01a (2026-10-22, user):** parity is the default, not a goal to
  defend at any cost. Where the driver's straightforward implementation is
  strictly better than a Waterline quirk (for example a single atomic
  `findOneAndUpdate` instead of select-then-write), use it rather than adding
  code to reproduce the quirk. Conditions: no new transactions, no new unique
  indexes or data rewrites on existing volumes, the same API results for
  non-racing inputs, and raw documents that stay compatible with Waterline
  mixed instances and rollback. Every quirk, whether preserved or improved,
  goes in the [quirk register](quirk-register.md). Counter stays read-then-write
  until its own decision.
- Unchanged: G-STABLE, REL-01, SEC-01, INST-01, OPS-BUDGET-01/OPS-ROLLBACK-01,
  per-group gates, physical/raw compatibility, hook/PostgreSQL obligations and
  no silent fallback. Strengthening any consistency guarantee remains a separate,
  recorded decision. Earlier G-TX text below is historical where it conflicts.

Implementation and bounded G1 evidence: [P1 validation](p1-validation.md),
[public interfaces/ownership/institution seam](p1-foundation.md). The opt-in
[C2 cache](c2-validation.md) passed G-C2, separately promoted MongoDB and removed Prisma. Explicit Waterline remains a temporary next choice.

## 1. Outcome and release boundary

Remove Waterline from ReDBox while retaining Sails. All **40 core and six
MongoDB-storage-hook entities**, generated relationship data, application
consumers, model globals/definitions/shims and ORM-dependent extension tooling
must have explicit replacements. Remove `sails-hook-orm`, `sails-mongo` and their
runtime/type/config dependencies when no remaining owner needs them. Retire the
cache pilot's temporary Waterline adapter and selector as part of this programme.

MongoDB remains the database, with the same collections, physical document
shapes and identities. No bulk rewrite, collection relocation or junction
conversion is authorized. Repositories expose plain domain operations so a
later PostgreSQL adapter is possible; this programme implements no PostgreSQL
adapter or cross-engine migration.

The release periods are distinct:

- **`next`:** investigate and migrate one group at a time behind explicit,
  temporary backend selection. New groups initially select Waterline. Only a
  separate promotion change may default a qualified group to the driver. Cache
  defaults to MongoDB on `next` after separate C2 promotion; Prisma is removed and explicit Waterline remains a temporary choice.
  Different instances may use different adapters against the same data during
  the bounded transition. Selection failure never triggers automatic fallback.
- **Official v6:** REL-01's approved sub-decision revises the pilot contract to
  **driver-repository cache**, qualified through C2 and revised pilot P7/G7.
  Full-retirement scope and release date remain open; this decision does not pass G7.
- **Full-retirement release:** plan for **v7 / the next agreed breaking major**,
  subject to a release-owner scope/date decision. Every group must qualify,
  affected institution hooks must migrate, and all ORM dependencies must be
  absent. An official release may retire an earlier qualified group only after
  its stable gate and explicit release-scope decision. `next` evidence alone is
  not official-release qualification.

Two independent, mandatory gates apply:

| Gate         | Required evidence                                                                                                                                                                                                                                                                                                                                                                | Current consequence                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G-STABLE** | Exact pinned supported stable official MongoDB driver and supported Node/Mongo matrix, upstream support record, clean packages/images, lifecycle/config/index/hook and affected regression evidence. Spike success alone is insufficient.                                                                                                                                        | Driver 7.7.0 is the selected exact pin; release qualification remains per group. Prisma RCs are removed from root/core; earlier pilot results remain historical evidence.                                                   |
| **G-TX**     | G-STABLE plus a supported **replica-set or sharded MongoDB deployment** (standalone is ineligible), supported **official-driver MongoDB transaction** APIs on the selected runtime, actual session propagation through every participating repository/datastore, and real topology tests proving commit, mid-operation rollback, isolation/conflict and unknown-commit handling. Since TX-PARITY-01 (2026-10-22): gates only a later optional transaction improvement. U/V/B and remaining S migrate at Waterline parity without it. |

**G-TX infrastructure prerequisite:** MongoDB multi-document transactions require
replica-set or sharded topology. Repo dev/test/CI and pilot qualification use
standalone MongoDB 8.0.34; that evidence cannot qualify transactional groups.
The operations/deployment lead owns supported topology, institution standalone
conversion and backup/upgrade/restore runbooks; architecture owns shared-session
proof and release owner owns scope/timing. Dev/test/CI replica-set stacks and
primary/readiness/failure tests must exist before G-TX. A single-node replica
set can enable development transactions but supplies no redundancy/failover;
production support needs an explicit decision and separate qualification.
Changing an app selector cannot roll back a deployment conversion. No stacks
or institution conversions are built/authorized by this P0 record.

MongoDB-driver sessions alongside the existing cache repository, the existing nontransactional
`TransactionUtils` fallback, compensating writes or splitting an atomic group
between backends **do not satisfy G-TX**. Isolated feasibility spikes and
Waterline repository work can proceed while it is closed. Recheck the gates at
P0, P6 and each proposed release. If the chosen driver/topology cannot satisfy the required unit, retain the
transition and record a release/architecture re-decision: change backend choice,
scope or timing explicitly. No silent fallback
or assumption that driver feasibility supplies deployment approval is permitted.

## 2. Scope and source baseline

The [inventory](p0-inventory.md) reconciles current source
`79c116fe0a6e07830ac1313d7403b4277b39e498` with the pilot. The 46 declarations
and storage implementation are unchanged; CacheService and branding previews
now use the pilot repository. The historical
[consumer JSON](../prisma-cache-persistence/evidence/direct-model-consumers.json)
contains 43 model names / 80 model-file pairs and misses generic/dynamic calls,
junctions and private hooks. P0 must refresh it, not treat it as a removal list.
The initial design inspected no live database. P0 now captures all 46 loaded
definitions and actual generated User/Role junctions on isolated synthetic
MongoDB; it inspects no institution database. See [P0 evidence](p0-validation.md).
`AGENTS.md`'s absent `redbox-core.md` is represented by the
actual [core wiki page](../../wiki/Redbox-Core-Types.md).

Include policies/controllers, bootstrap data, migrations, dev generators,
published types and hook overrides as well as services. Preserve current public
service/HTTP behavior, authorization, ordering, errors, callback effects and
physical writes unless a separately reviewed consistency decision is recorded.
The explicit stronger transaction gate does not claim Waterline currently makes
every multi-document operation atomic.

Exclude removal of Sails, PostgreSQL implementation, a generic ORM/query facade,
permanent dual-backend support, automatic index/data cleanup, engine downgrade,
and unrelated behavior fixes. Preserve the pilot's deferred cache TTL/falsy,
void best-effort write/race, notification reset and non-atomic preview behavior
([deferred work](../prisma-cache-persistence/deferred-work.md)). Broader changes
to RDMP number allocation, I18n atomicity or external-system consistency need
their own decisions.

## 3. Delivery groups and preserved behavior

Grouping follows datastore, callback, relationship, native-access and
consistency coupling. Each row is a separate evidence/promotion unit. A foreign
reference does not require converting both groups together: use explicit plain
read operations backed by the remaining Waterline adapter. An atomic operation
must have one coordinated adapter/session for all its participants. If a new
cross-group requirement prevents that, defer promotion or revise the group in
the ADR; do not hide it behind a model global.

Promotion and definition removal have different dependencies. A retained
Waterline association may still require a migrated target to load: for example,
BrandingConfig declares `roles`, while Role declares `branding`. P11 must inspect
the remaining loaded association graph and retire connected definitions together
when necessary. Keep the affected bridge until then; do not claim retirement
or quietly replace an association with a scalar to make ORM loading succeed.

| Group / phase     | Entities                                                                                                                                                                      | Rationale                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C / C2, P11       | CacheEntry                                                                                                                                                                    | Driver migration, pilot-standard evidence, separate promotion and Prisma removal.                                                                        |
| M / P2            | Migration                                                                                                                                                                     | Persistence needed before domain bootstrap; also read by dashboard initialization.                                                                       |
| R / P3            | ThemeConfig, Form, RecordType, WorkflowStep, DashboardType, RBReport, NamedQuery, WorkspaceType                                                                               | Reference definitions, form/workflow relationships and create-time keys; no identified required multi-document atomic write.                             |
| Q / P4            | AppConfig, DashboardConfiguration, I18nBundle, I18nTranslation                                                                                                                | Configuration and projections; single-document CAS/leases, explicitly best-effort bundle synchronization.                                                |
| J1 / P5a          | AsynchProgress, WorkspaceAsync                                                                                                                                                | Progress and status.                                                                                                                                     |
| J2 / P5b          | HarvestRun, HarvestRunChunk, HarvestRecordEvent                                                                                                                               | Lineage, deduplication and atomic run counters.                                                                                                          |
| J3 / P5c          | SecurityEvent, SiemDeliveryAttempt                                                                                                                                            | Audit capture and fenced SIEM delivery.                                                                                                                  |
| J4 / P5d          | FigshareSync                                                                                                                                                                  | Durable sync/dispatch state, distinct from Figshare vocabularies.                                                                                        |
| U / P7 — parity | User, Role, UserLink, UserAudit, PathRule, WorkspaceApp; generated junctions                                                                                                  | Membership and account/security consistency.                                                                                                             |
| V / P8 — parity | Vocabulary, VocabularyEntry, FigshareVocabularySource, FigshareVocabularyCategory, FigshareVocabularyCrosswalk, FigshareVocabularyCrosswalkMapping, FigshareVocabularySyncRun | Hierarchy, managed vocabulary mirrors, RVA and approval.                                                                                                 |
| B / P9 — parity | BrandingConfig, BrandingConfigHistory                                                                                                                                         | Versioned publication/history across two configured datastores.                                                                                          |
| S / P10           | AttachmentMetadata, AttachmentAccessAudit, Counter; storage Record, DeletedRecord, RecordAudit, IntegrationAudit, RecordSchemaArtifact, RecordSchemaReference                 | Record/attachment/schema lifecycle and binary storage. Existing staged protocols remain; remaining paths migrate at parity (TX-PARITY-01). |

### M — migration ledger

[MigrationRunner](../../../packages/redbox-core/src/loader/MigrationRunner.ts)
uses Umzug and stores `name`, `source`, `appVersion`, `ranAt`, `durationMs`
and `executedBy` (the latter is `os.hostname()`). Preserve
lexical order, ledger identity, epoch-millisecond `ranAt`, skip configuration,
failure propagation and startup ordering. A unique name does not make migration
bodies exactly once across nodes: require one deployment migration runner (or
a separately proven lock) before starting writers. DashboardConfigService must
use the ledger repository too. Pending historical migrations must still execute
on the no-ORM artifact; see section 6.

### R — reference definitions

Preserve brand/global scoping, bootstrap override rules, defaults, validation,
sorting and missing-relationship behavior. RecordType/WorkflowStep/Form need
explicit cardinality and DTO fetch operations in place of `.populate()`.
RecordType, DashboardType, RBReport and NamedQuery generate
`${branding}_${name}` **on create**; updates must not unexpectedly regenerate
keys. `RBReport` maps to physical **`report`**. Retain ThemeConfig even though the
named-call index has no core reader.

[NamedQueryService](../../../packages/redbox-core/src/services/NamedQueryService.ts)
uses dynamic model/attribute discovery, related-collection filters, populated
user roles and native storage queries; ReportsService hides calls behind
`getReportModel()`. Replace those with explicit supported query-target metadata
and a named-query execution module, including tenant/access rules, count,
projection, ordering and pagination. Inventory institution-defined targets and
stored Mongo/Waterline query expressions. No arbitrary model lookup or new
general query language may escape through repositories. Incompatible stored
queries require a documented operator migration or an actionable refusal, not
a silently smaller result set.

### Q — configuration and translations

[AppConfigService](../../../packages/redbox-core/src/services/AppConfigService.ts)
permits duplicate brand/key rows, warns and chooses the latest. Preserve that
selection; do not introduce a brand/key unique index. Keep secret-reference
masking, AWS error/timeout semantics, publication/cache ordering and ownership
of `appconfigsecretlocks` in
[AppConfigSecrets](../../../packages/redbox-core/src/services/AppConfigSecrets.ts).
Database and AWS operations do not form a transaction.

[DashboardConfigService](../../../packages/redbox-core/src/services/DashboardConfigService.ts)
stores one aggregate per branding with a unique index and revision CAS. Preserve
all-or-none multi-target copy within that document, conflict results, legacy
initialization and Migration-ledger checks. Do not replace CAS with read/save.

I18n UIDs retain brand-or-global/locale/namespace/key construction, validation,
empty-string acceptance, null rejection, sanitization and reload behavior.
Bundle UID generation remains create-only; translation UID recomputation follows
the current submitted-field conditions on create/update, including partial
updates. Do not silently recompute from a merged loaded row.
Bundle/entry synchronization currently catches failures: characterize and
preserve its **best-effort** consistency. If product owners require atomic
synchronization, move the affected operation to G-TX with explicit approval.

### J1–J4 — job state and audit

- **J1:** preserve progress lifecycle, counters, failures/results, cleanup,
  branding and user/record/type references, Observable/service return behavior
  and restart-visible status. Do not imply progress updates transact with jobs.
- **J2:** preserve run/chunk/event lineage, unique dimensions/content hash plus
  attempt behavior, counters, retries and retention. Native conditional counter
  updates in [HarvestRunService](../../../packages/redbox-core/src/services/HarvestRunService.ts)
  become named atomic operations. Internal `pkFactory`/ObjectId discovery stays
  adapter-local. Storage enrichment uses the existing storage service seam.
- **J3:** preserve capture/redaction, delivery-attempt history, per-destination
  retry state, owner/token/expiry fencing, legacy lease recovery and retention
  in [SiemDeliveryStore](../../../packages/redbox-core/src/services/siem/SiemDeliveryStore.ts).
  Prove competing workers and expired-owner rejection, including restart.
- **J4:** [sync-store](../../../packages/redbox-core/src/services/figshare-v2/sync-store.ts)
  retains unique OID, partial namespace/article index, revision CAS **replacement**
  (omitted fields are removed), bounded retries, numeric millisecond leases,
  dispatch claims, generations and receipts. The worker must persist source
  intent before acknowledging storage changes. Preserve crash/replay and
  unknown-outcome rules; a successful update count alone is insufficient.

### U — identity and membership (Prisma phase 6 complete)

[User](../../../packages/redbox-core/src/waterline-models/User.ts) hashes supplied
passwords on create with bcrypt cost 10; UsersService hashes password updates
separately. Retain both without double hashing. Replace `customToJSON` with
explicit safe DTO projection: passwords never appear in plain repository/API
results, and tokens remain restricted where current APIs restrict them. P0
observed that current direct Waterline `findOne` still contains password while
serialization omits it; never forward a raw model or Prisma include result.
Authentication gets
a deliberately narrow credential operation. Preserve Local Admin/no-email
exceptions and pending-record access assignment after create/update, including
failure timing; a failed post-write callback is not proof the write rolled back.

P0 observed the generated **`role_users__user_roles`** collection in `mongodb`:
ObjectId `_id`, `user_roles` → User and `role_users` → Role; no ordinary
timestamps and only the `_id` index in safe mode. Actual add/remove/replace/
populate probes accept duplicate and dangling edges; default destroy leaves
physical edges. Preserve this shape and behavior without inventing pair
uniqueness, arrays, cascades or cleanup. Both declarations say `dominant: true`.
The generated **`archive`** model is also a scope owner: no current `.archive()`
consumer was found, but institution historical rows need maintenance assessment.
Preserve Role brand/global scope, PathRule grants,
WorkspaceApp ownership, UserLink alias/primary state, disabled-login/token
behavior and audit contents. Repositories expose membership/account operations,
not ORM association collections.

[UsersService](../../../packages/redbox-core/src/services/UsersService.ts)
account linking also rewrites record authorization and performs audit/access
effects. Under TX-PARITY-01/01a and ADR 0004, preserve ordered partial outcomes
without transactions or shared sessions. Phase 6 migrates U only and calls the
existing storage operations; record ownership remains phase 7. Both backends'
transition checks retain link/role/alias effects when record rewrite fails,
without writing the final audit. No automatic retry or rollback is inferred.

The six models (59 fields) and explicit `role_users__user_roles` edge (3 fields)
now use Prisma model APIs behind plain repositories. Loaded definitions
rediscover that junction and startup uses Prisma catalog/index controls without
U DDL. Existing login/email indexes/collation stay unchanged. The independent
`identity` selector defaults to `prisma`, accepts explicit `waterline`, and
rejects `mongodb`. Branding and named-query role/user access now use U.
U-01–U-11 and U-PG-01 record parity, accepted optional reads, safe credentials
and natural predicate fencing. See [phase 6 evidence](evidence/prisma-phase6.md).

### V — vocabularies, Figshare vocabularies and RVA (parity)

[VocabularyService](../../../packages/redbox-core/src/services/VocabularyService.ts),
[FigshareVocabularyService](../../../packages/redbox-core/src/services/FigshareVocabularyService.ts)
and [RvaImportService](../../../packages/redbox-core/src/services/RvaImportService.ts)
use explicit plain `VocabularyRepositories` operations. TX-PARITY-01 applies: sequential writes, no transactions or automatic retries.
Preserve hierarchy/parent-child integrity, vocabulary versions, managed-source
ownership, normalization/validation, source/category/crosswalk/mapping
relationships, preview/apply/clone behavior, revisioned approval and import sync
metadata. Explicit operations retain the existing API/conflict results, write order, change checks, compensation and partial outcomes. External fetches remain outside persistence, with the existing validation/version checks before apply. G-TX gates only a later consistency improvement.

Explicit operations now own the actual model callbacks: vocabulary name/slug
normalization, type/source defaults, RVA source key and brand-name resolution;
entry label/value trimming and lowercase fields, historical booleans,
per-vocabulary identifier checks and same-vocabulary parent checks. P0 observed
that a direct partial update can set an entry as its own parent: callback
cycle/self checks depend on submitted `record.id`, absent from normal update
values. Do not claim universal cycle rejection. Preserve and characterize
create-versus-partial-update behavior; security/domain owners must choose any
strengthening as a separate consistency change, without fixing it silently.
Figshare callbacks
retain trimmed identifiers/actors, scope/status/match-type enums, positive
category/revision checks, approved-revision/approver rules and sync-run required
fields. An omitted category `path` becomes null in Waterline and the callback
rejects it as non-array; model optionality is not proof the create accepts omission.
Preserve the service's `applying` concurrency latch and terminal sync-run
transitions. These checks must not disappear when decorators/models are removed.

P8.1–P8.6 are **PASS for bounded `next` under TX-PARITY-01**. V now
defaults to MongoDB through an independent P8.6 promotion, with explicit
Waterline rollback. Implementation and qualification are recorded in [V validation](p8-v-validation.md)
and [operations](p8-v-operations.md). The driver retains ObjectId relations,
ISO string timestamps, implicit defaults and the loaded callback semantics.
All seven models remain for explicit Waterline rollback/P11. The B-owned brand-name resolver now follows B independently of V through the
plain branding operations, including explicit Waterline rollback (P9).

Live safe-mode Waterline creates only `_id` indexes despite the entity index
declarations. V prepares 21 nonunique lookup shapes and retains compatible
existing unique constraints; it does not add uniqueness. The declared sparse
unique Figshare key conflicts with the ordinary `''` default. Resolve that
constraint/default mismatch only under a separate decision.

The `applying` latch is **not atomic** in the loaded sails-mongo baseline: it
selects IDs and writes those IDs without rechecking state. Controlled overlapping
callers can both succeed; the driver preserves that window. Failed clone helpers
can also leave an unregistered partial clone. These are additional characterized
baseline quirks, not fixes or stronger guarantees.

### B — branding and retained history (parity)

[BrandingService](../../../packages/redbox-core/src/services/BrandingService.ts)
inserts history then conditionally publishes by version/draftRevision. Preserve
history/hash/restore/retention semantics, font/logo integrity and preview
behavior. Existing compensation removes history only for certified not-applied
writes; a transport error may have committed and must retain recovery evidence.
BrandingConfig callbacks remove `$` prefixes from CSS keys and enforce
the allowlist; implement them explicitly on normal writes. Historical migration
operations that intentionally bypass that allowlist remain narrowly scoped.

BrandingConfig stays on `mongodb`; **BrandingConfigHistory stays on
`redboxStorage`**. BRAND-TX-01 is superseded by TX-PARITY-01: both two-database
one-server and two-separate-server configurations use sequential history then
conditional publication, without sessions, transactions or relocation. Font/logo
storage, cache refresh and pruning retain their separate failure/recovery effects.

P9.1–P9.6 are **PASS for bounded `next`**. Qualification is recorded in
[B validation](p9-b-validation.md) and [operations](p9-b-operations.md). The
independent P9.6 promotion makes MongoDB the default; explicit Waterline remains
available for rollback. Two nonunique lookup
indexes are explicitly prepared on their owning datastores; startup is
inspect-only. Existing compatible operator uniqueness is retained. The B-owned V
lookup bridge follows B's selector, so MongoDB B reads never call Waterline
BrandingConfig. U-owned role projection/inverse membership writes and B model
associations remain until U/P11.

Under TX-PARITY-01a, B's driver uses atomic conditional `findOneAndUpdate` instead
of reproducing Waterline's select-IDs-then-write race. Controlled intervening
version/revision writes are overwritten on loaded Waterline and rejected on the
driver, including history-before-write and conflict compensation. Non-racing API
results/errors and raw rollback compatibility remain unchanged. No transaction,
new unique index or data rewrite is added. Every observed B quirk and its
preserved/improved decision is in the [quirk register](quirk-register.md).

### S — records, attachments and schemas

Current status: **Prisma phase 7 full S implemented**. The entire storage
service/capability contract defaults to Prisma, including Record/DeletedRecord,
permanent recordidentity, CAS/lifecycle/source intents, authorization/U access,
Counter atomic increment and attachment OID rebind. `prisma | waterline` remains
selectable until phase 8; removed `mongodb` is rejected. GridFS stays native.
[Phase 7 evidence](evidence/prisma-phase7.md) records the light qualification and
phase-8 inventory. TX-PARITY-01/01a/ADR 0004 supersede historical staged/shared-session
and G-TX migration gates; no multi-document transaction is claimed.

Retain the storage service/capability contracts in
[MongoStorageService](../../../packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts)
and [recordSchemaCodec](../../../packages/sails-hook-redbox-storage-mongo/src/persistence/recordSchemaCodec.ts).
The repository adapter must preserve:

- Active/deleted identity, revision/incarnation/lifecycle operation fencing,
  authoritative CAS, tombstones, idempotent restore and ABA protection. Normal
  create/update normalization must continue to strip/reset caller-controlled
  revision/lifecycle fields; only explicit authoritative operations advance them.
  Preserve conflict, missing, certified-not-applied and unknown-write outcomes.
- The undeclared **`recordidentity`** ledger, retained after every committed
  incarnation; audit/integration payloads, metadata/workflow/authorization and
  capability-version semantics. Do not replace this with delete/recreate CRUD.
- Ordinary Waterline model timestamps are ISO strings; native schema service
  writes use BSON Date for createdAt/updatedAt and pin expiresAt. Native record
  creation uses dateCreated/lastSaveDate strings; recordidentity uses a UUID
  incarnation, ObjectId primary key and ISO createdAt. Do not impose one model
  timestamp codec on both paths.
- Immutable schema artifacts/digests, reference grant/save/pin validation,
  scope/expiry/retention and authorization filtering. Cursors/aggregations become
  bounded plain pages or async iteration with opaque cursors and cancellation;
  no Mongo cursor/query/session is exposed to callers.
- AttachmentMetadata trimming, validation, enum/date/count normalization, journal
  state and ownership leases, attachment audit and byte integrity. Preserve staged
  record/file coordination, cleanup/recovery and unknown outcomes. Binary/GridFS
  operations use a separate stream/blob interface; do not put bytes in JSON DTOs.
- Counter now uses the explicitly approved Prisma atomic increment/upsert,
  returning distinct acknowledged allocations while retaining its field names,
  BSON numeric value and branding reference. S-01 is improved; ambiguous writes
  can consume numbers and never automatically retry.

The [revision backfill](../../../packages/sails-hook-redbox-storage-mongo/src/migrations/recordRevisionBackfill.ts)
retains bounded batches (currently 500), conditional missing/null-only updates,
restart/no-progress checks and untouched metadata/workflow/auth/lastSaveDate.
Replace its model-dependent entrypoint and native implementation with a specific
maintenance operation. Do not run a broad data rewrite to make an adapter fit.
Preserve ordered partial outcomes under TX-PARITY-01. Optional future
multi-document transactions require their own decision and qualification.

## 4. Repository and PostgreSQL-readiness rules

Generalize the pilot's
[repository](../../../packages/redbox-core/src/persistence/cache/CacheEntryRepository.ts),
plain JSON validator and concrete adapters. Use a small interface per cohesive
domain module with explicit operations such as claim/renew/release, publish-if-
revision or replace-memberships. Do not clone every Waterline method, expose
generic filters/populate chains, or introduce a universal unit-of-work/DI system.
Domain operations own any transactional coordination; callers receive no Mongo/Waterline/session types. Native driver use may remain
private for Mongo-specific CAS, leases, aggregation and GridFS when justified;
it must not bypass the transaction gate or hide an
otherwise unassessed model migration. Record each such exception in the ADR.

Use existing constructor/getter injection and service override composition.
Repositories return Promises/plain DTOs; existing RxJS service interfaces stay
at their current layer. Convert populated objects to explicit relationship DTOs
and keep security projections independent of persistence serialization.

Every group's contract/mapping evidence must specify:

1. **IDs:** opaque strings at the interface, distinct domain IDs/record OIDs/
   schema digests where meaningful. Preserve actual Mongo `_id`/reference BSON
   types with adapter codecs. No universal ObjectId, UUID or integer assumption.
2. **Time:** optional ISO strings for actual instants, explicitly named numeric
   second/millisecond fields where required, and an identified clock source.
   Preserve existing physical strings, BSON Dates and epoch units. Characterize
   legacy formats before selecting a decoder; no automatic timestamp rewrite.
3. **JSON:** reuse strict plain JSON rules (finite numbers, no nested undefined,
   cycles, classes, accessors or rich BSON). Non-JSON legacy fields require an
   explicit codec or refusal with migration guidance; never implicit `toJSON`.
   Binary data has its separate interface.
4. **Missing/null:** describe absent field, explicit JSON null, nullable scalar,
   empty string, unset and no-change separately per operation. A future SQL NULL
   must not silently collapse JSON null/missing. Preserve update versus full
   replacement semantics and unknown fields retained by existing operations.
5. **Relations:** record source/target, one/many cardinality, optional/global
   scope, ordering, uniqueness, dangling references, deletion policy and whether
   a foreign key would be appropriate. Include undeclared application references,
   custom query targets and generated junction data. No new referential cleanup.
6. **Outcomes:** explicit duplicate/conflict/missing/validation/unavailable/unknown
   semantics and retry/idempotency rules; no driver errors or payloads in public
   results/logs. Preserve observable existing service results through translation.

Per-group future PostgreSQL work is a required assessment, **not implemented**:

| Group | Later PostgreSQL implementation/migration must address                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C     | Text ID/name uniqueness, JSON null/missing, numeric seconds and timestamp codecs; retain notification state and cache behavior.                                                                                                          |
| M     | Unique migration name, epoch-ms ledger fields and deployment execution lock; preserve history without replay.                                                                                                                            |
| R     | Explicit brand and RecordType/WorkflowStep/Form keys/cardinalities; create-time composite key rules and collation. Translate stored query expressions/JSON filtering and institution-defined targets separately.                         |
| Q     | Duplicate AppConfig selection/ties, secret-lease row locking and expiry; unique dashboard branding plus revision CAS; I18n UID/optional-global semantics and best-effort projections.                                                    |
| J1    | Optional user/record references, progress JSON and retention, without inventing cross-job atomicity.                                                                                                                                     |
| J2    | Run/chunk/event keys and deletion policy, hash/attempt indexes and atomic counter increments.                                                                                                                                            |
| J3    | JSON event payload/redaction, nullable references, attempt history, lease token/expiry predicates and retention indexes.                                                                                                                 |
| J4    | Unique OID and partial namespace/article uniqueness, replacement/unset semantics, revision fencing, millisecond leases, source-intent generations/receipts.                                                                              |
| U     | Explicit User/Role junction tables from real physical data, scoped roles, link/alias graph, optional refs/deletion policies, unique login/email collation and transactional authorization effects.                                       |
| V     | Hierarchy edges/cycles, managed-source ownership, crosswalk/mapping uniqueness, approval revisions and transactional imports; choose constraints after legacy-data assessment.                                                           |
| B     | Version/history keys, CSS/font JSON, retention and CAS; consolidate transactional ownership only by a separate data/topology decision, never assume cross-server SQL atomicity.                                                          |
| S     | Record JSON query/index support, permanent identity ledger and tombstone uniqueness, lifecycle CAS, schema digest/reference constraints, bounded backfill/cursors, attachment journal/audit and a separate blob/GridFS replacement plan. |

Mongo sparse/partial/TTL/unique indexes and collation have no assumed one-to-one
SQL equivalent. PostgreSQL readiness means exposing these obligations explicitly,
not promising a database switch by changing a connection string.

## 5. Hooks and institution migration

The [loader](../../../packages/redbox-core/src/loader/index.ts) currently accepts
`hasModels` / `registerRedboxModels`; the first hook in root `hookLoadPriority`
wins and replaces the **whole** model. Transitional Waterline adapters must use
the actual loaded definition, including datastore, collection, columns, IDs,
defaults, validation, callbacks and custom methods. The driver adapter may accept only a
declared, tested mapping/behavior. Unsupported overrides fail before writers;
they must not be silently ignored when selecting the driver.

Publish the intended plain repository types/getters through package exports.
Institutions migrate business callbacks to explicit service/domain operations
using existing service override/dependency injection, and mapping customizations
to an explicit supported adapter/configuration. A custom hook-owned persistence
module owns its plain contract and lifecycle; no general model registry is
introduced. Required hook initialization must complete before its service users
or migrations run. P0 must review representative hooks and prove this composition
is sufficient; any new extension mechanism needs a small separately reviewed
contract, not an automatic emulation of Waterline.

Final release behavior: reject obsolete model registration/config with an
actionable hook/package/model diagnostic. Remove model exports/globals and dev
model-generation templates; migrate examples and historical migrations. Keep
service/controller/policy/config hook ordering supported. Delete only known
generated shims identified by provenance/manifest; never remove arbitrary
institution files. Unknown hand-written model files block upgrade readiness
until migrated. Institutions need a compatibility report covering richer JSON,
custom IDs/collections, stored queries, direct driver calls and callback security
effects, plus a rehearsed upgrade/rollback procedure on their real topology.

## 6. Native access and maintenance

The [native-owner inventory](p0-inventory.md#native-access-and-owners-requiring-replacement)
is normative scope. Replace manager/native calls with domain operations, not
public `getCollection()` or raw query escape hatches:

- Secret leases preserve string `_id`, BSON Date expiry and owner/freshness
  predicates. Dashboard CAS, harvest counters, SIEM and Figshare claims retain
  single-document atomicity, affected-count interpretation and fencing.
- Storage keeps its private Mongo query/CAS/aggregation/backfill implementation
  where necessary, isolated from plain repository and storage interfaces. GridFS
  stays a driver-backed binary owner. Retain all existing physical namespaces.
- MigrationRunner uses the M repository. Pending
  [typeface backfill](../../../api/migrations/20260904000000-branding-typeface-backfill.js)
  and [sidebar migration](../../../api/migrations/20261014T000000-admin-sidebar-text-color.js)
  must run via narrowly scoped migration operations without globals. Preserve
  their names/order/ledger and intentional callback bypasses; never replay
  already recorded bodies. Typeface pruning limits reversibility and belongs in
  the recovery runbook. No permanent model emulator for old migration scripts.
- Agenda jobs/history remain Agenda/native Mongo; sessions remain connect-mongo.
  They are not missing Prisma models. Remove their **Waterline dependency**, not
  their independent ownership or backend choices. SQS behavior remains supported.

## 7. Connection ownership, initialization and shutdown

Extend the pilot's [lazy runtime](../../../packages/redbox-core/src/persistence/cache/runtime.ts):
app-owned state survives require-cache clearing, imports/shim generation never
connect, concurrent/repeated initialization is safe, and getters fail clearly
before readiness/during close/after cleanup. Await persistence in
[preLiftSetup](../../../packages/redbox-core/src/bootstrap.ts) **before the service
init loop**, hence before migrations, core bootstrap, hook bootstrap and
post-init/snapshot. Hook persistence prerequisites must be included in this
ordering. On failure, close acquired resources while preserving the original
error even when cleanup fails; chain normal shutdown and make it repeat-safe.

During transition, Waterline owns its managers and adapters only borrow them.
The application persistence runtime owns official-driver clients; compatible logical
databases borrow one pool. C2 removed the temporary cache Prisma runtime. Final
configuration resolves logical `mongodb` and `redboxStorage` directly, with
explicit collection/mapping metadata and **no loaded model or manager**.
Defaults remain `redbox-portal` and `redbox-storage`; overrides stay explicit.

Preserve the pilot's proven effective-config semantics from
[configuration.ts](../../../packages/redbox-core/src/persistence/cache/configuration.ts):
split/URL credentials and single decoding, protocol-less URLs, comma-bearing
URLs ignoring split overrides, escaped database names, SRV/auth/TLS/options and
safe errors. Remove reliance on sails-mongo normalization only after equivalent
tests run without that dependency/manager. No competing connection URL. Reject
obsolete adapter/model settings or unsupported mappings with migration guidance.
Pool sharing is by effective server/credentials/options and proven driver
compatibility, with separate logical database handles; equal URL text does not
authorize routing every collection to one database.

| Resource                             | Owner and shutdown contract                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core and storage persistence drivers | App-scoped runtime; share compatible pools deliberately. Stop users before close; prove cross-database transaction sharing where needed.                                                                                                                                                                                                                                                             |
| Agenda                               | [AgendaQueueService](../../../packages/redbox-core/src/services/AgendaQueueService.ts) currently obtains User's manager even for history/index paths. Replace it with explicit resolved queue/history DB access; preserve configured address backend. Borrowed DB is not closed by Agenda; its owned address client is. Stop claims/workers and await in-flight work before persistence pools close. |
| Sessions                             | [redboxSession middleware](../../../packages/redbox-core/src/middleware/redboxSession.ts) creates an independently owned connect-mongo store (normally database `sessions`). Preserve TTL/cookie/login behavior and close its store explicitly.                                                                                                                                                      |
| GridFS/Flydrive                      | [GridFSDriver](../../../packages/redbox-core/src/storage/GridFSDriver.ts) caches clients and has an uncalled production `dispose()`. Wire deterministic disposal with application ownership/ref-counting where sharing is intentional; lowering one app must not close another's clients. Test partial initialization, close failures and repeated shutdown.                                         |
| Legacy logo GridFS reader            | [BrandingLogoService](../../../packages/redbox-core/src/services/BrandingLogoService.ts) owns and closes its client in `finally`; retain effective application-database resolution and legacy reads.                                                                                                                                                                                                 |

Record startup, active and shutdown connection counts for **all** owners.
Sessions, Agenda, GridFS and native modules remain MongoDB commitments after
ORM retirement and are separate future PostgreSQL work.

## 8. Index readiness and explicit mappings

Reuse [cache preflight](../../../packages/redbox-core/src/persistence/cache/preflight.ts):
inspect-only startup, explicit scoped idempotent `ensure`, no index drops,
duplicate cleanup or database-wide schema synchronization. Each group declares
physical collections/keys/unique/sparse/partial/TTL/collation/options and verifies
legacy duplicates/missing/null behavior before enabling writes. Conflicts block
with remediation guidance. Preserve AppConfig duplicates; do not infer new
uniqueness from business intent.

SIEM, dashboard, Figshare and storage currently create indexes at bootstrap or
first use. Moving required DDL to **operator deployment preparation** is an
explicit operational change: inventory it, provide inspect/ensure and rehearse
existing-volume upgrades before enabling writers. Runtime credentials must not
need broad DDL privileges. Keep Agenda/session-owned index mechanisms documented
and separate. Backfills are named, bounded, resumable maintenance operations,
never a side effect of contract generation or repository construction.

Use explicit operation-specific codecs, collection/datastore mappings and index
descriptors in each owning package. No expanded Prisma contract generation:
TypeScript builds and installed-package tests verify these modules offline.
BSON/driver types remain private. Both logical databases may borrow one pool
only when effective connection policy matches. Cross-database reads are composed
through plain domain operations; transactions require G-TX. C2 removed cache contract freshness/generation/copy paths after its separate promotion and consumer qualification.

## 9. Acceptance, rollback and operations

Each group must prove the same repository contract against the loaded Waterline
baseline and the driver on an isolated **real MongoDB** deployment, with sanitized
raw documents/indexes and negative cases. Unit mocks do not qualify physical
mapping, junctions, atomicity, indexes, lifecycle or packaged runtime. Assert the
selected adapter in live tests; setting an environment variable is insufficient.

Required evidence includes both write/read directions, sequential switching,
simultaneous mixed-instance traffic, callback/security parity, restart persistence,
cross-group reads and failure injection at startup/write/cleanup. Exercise each
operation's conflict, duplicate, missing/null, stale lease, retry and unknown
outcomes. Gated groups additionally prove supported official-driver transactions,
mid-write rollback and concurrent membership/tree/approval/publication behavior.
Test sessions/Agenda/GridFS/shared clients and relevant APIs/browser workflows.

Before promotion rehearse (a) config rollback while the selector exists and
(b) the **designated prior development artifact** on unchanged MongoDB reading
driver-written data. For `next`, use a built image of the group's pre-change commit, recording
its immutable digest and matching data/assets checkpoint; it need not predate the
entire programme. Formal operations approval is required for official releases. After selector removal, rollback means the explicitly tested
previous artifact or matching backup restoration, not a hidden runtime fallback.
Rehearse database plus external asset recovery, pending migrations, retained
identity/history and exact engine/FCV/topology. No v5 or MongoDB-engine downgrade
promise follows from the pilot.

Make a bounded operational comparison per group/final workload: latency
distribution, throughput/errors, durable completion, startup, memory, total
connections, pool saturation and query/index behavior. The P0 budgets are provisionally accepted for `next` (2026-10-20); resolve
material regressions before promotion. Formal operations approval remains
required for official releases. Retain the
pilot's known 12-second source-loading timeout and Solr-before-ready indexing
concerns as qualification work, not evidence that all startup checks pass.
Archive transitional comparison fixtures when adapters retire; retain durable
behavior, physical-format, security, package and lifecycle regressions.

## 10. Risks and decisions still required

- **Release owner:** confirm full-retirement major/scope/date and decide v6
  timing/scope if the cache stable gate remains closed. No release promise here.
- **Architecture (ARCH-01 / G0R):** user ACCEPTED ADR0003 on 2026-10-20;
  driver repositories selected. Group, transaction and release qualification remain.
- **Deployment/operations lead (OPS-TX-01):** approve replica-set/sharded
  deployment support before G-TX. Standalone institutions require conversion,
  dev/test/CI need qualified replica-set stacks, and single-node support needs
  an explicit no-HA policy. Rehearse topology/FCV/backup/upgrade/restore runbooks.
  See [P0 environment decisions](evidence/environment-release-support.md).
- **Deployment owners:** BRAND-TX-01 is superseded. Qualify both existing B
  datastores and coordinated database/assets recovery, including separate-server
  installations; no history relocation or topology conversion.
- **Security/domain owners:** approve the atomicity/effect matrix for linking,
  access assignment, vocabulary approval, branding publication and storage.
  Decide separately whether RDMP allocation or I18n projections need stronger
  guarantees. Resolve pending postcommit effects and ambiguous outcomes without
  claiming external atomicity.
- **Institution owners:** generated junctions, private model overrides/custom
  IDs/rich BSON/stored queries and historical pending migrations may block
  adoption. Representative public fixtures cannot certify every institution.
- **Operations owners:** agree index-preparation window, migration-runner
  exclusion, connection/memory budgets, backup/asset checkpoints and rollback
  artifacts before promotion. If physical compatibility requires a bulk rewrite
  or transaction support never becomes available, return to an explicit
  programme decision rather than broaden the implementation silently.

## Prisma phase 2 implementation — 2026-10-22

M, R and Q now use Prisma and pass the bounded group checks. The existing plain operations,
physical mappings, no-transaction behavior and explicit Waterline rollback remain.
Raw/control APIs and native exceptions are tracked in the PostgreSQL register;
quirks in the quirk register. ADR 0004's light testing supersedes historical gates.
Final default core, portal Mocha and Bruno folders 1–4 suites passed; the focused
Q rerun also verifies loaded-datastore routing for Waterline coordination.
Phase 3 moves J1–J4 using the same runtime, conditional Prisma operations and
physical absence policy. See [evidence and next-phase notes](evidence/prisma-phase2.md).

## Prisma phase 3 implementation — 2026-10-22

J1–J4 now use the shared app-owned Prisma client and real-field contracts.
Step 0 removes phase 2b's synthetic fields; undeclared data survives partial
writes in raw storage but is omitted from model reads. TX-PARITY-01/01a remains:
no transactions, supplied-field patches, original failure/partial-effect semantics,
with natural predicate fencing improvements. J2 counters remain atomic; J3 token
readback/expiry fencing and Agenda ownership stay intact; J4 whole-state CAS uses
typed JSON projection/replacement to preserve absence and unset semantics.
Raw/control exceptions and quirks are registered. V/B are next, with B's two
datastores and external publication ordering retained. Final light-suite results
are recorded in [phase 3 evidence](evidence/prisma-phase3.md).

Final validation: combined core coverage 4,308 passing / 108 pending after fixing
and rerunning only two bootstrap fakes; portal Mocha 419 passing / 10 pending;
Bruno General folders 1–4: 309 requests / 553 tests / 3 assertions, all passing.
The full core suite ran once; the evidence retains its initial two failures.

## Prisma phase 4 implementation — 2026-10-22

V and B now use Prisma model CRUD behind their plain interfaces, with real-field
contracts (V 110, B 26; no fixture-only fields). History stays on redboxStorage's
separate schema/client, including separate servers. Publication order and unknown
outcome recovery are unchanged; no transactions. The applying latch now retains
its state predicate atomically under TX-PARITY-01a (V-06 improved), and B-01's
conditional draft/publication protection is retained. Normal patches write only
supplied fields; null-for-missing reads are accepted and registered. Catalog/DDL,
duplicate audits, stored query translation and unsupported native buildInfo have
individual rewrite entries. See [phase 4 evidence](evidence/prisma-phase4.md).
The current selectors for V/B are `prisma | waterline`, default Prisma. Earlier
driver operations/qualification records are historical where superseded.

Phase 5 moves staged attachment metadata/journal/access audit, schema artifacts/
references, record/integration audits and revision maintenance in the storage
hook onto the shared storage Prisma contract. Full S/U, Counter's ADR0004 atomic
increment and final Waterline retirement remain outstanding.


## Prisma phase 5 implementation — 2026-10-22

The staged allowlist uses Prisma model CRUD: AttachmentMetadata (including
journal/coordinator rows) and AttachmentAccessAudit in `mongodb`; schema
artifacts/references and record/integration audits in `redboxStorage`. The six
inventoried models declare 94 real fields, plus five wrapper-projection fields
for independently bounded maintenance. No test-only fields or whole-record
Prisma ownership. Schemas retain BSON Dates; attachments/audits retain strings.
Supplied-field patches preserve physical absence/unknown stored fields; model
null-for-missing reads are accepted. Immutable schema/reference protocol is
shared with Waterline while each backend owns its IO; authorization cursors
remain baseline. Revision maintenance uses model ID pages and one typed
apply-time coalescing write per document. No transaction or automatic replay.

Selectors accept `prisma | waterline`, default Prisma; removed `mongodb` fails
with guidance. Catalog/DDL uses Prisma control; raw duplicate audits and the two
unsupported native binary-version queries are individually registered. GridFS
is a permanent direct-driver byte owner under the user's ADR decision, with
MongoDB retained for GridFS (PostgreSQL has no equivalent), or a different binary store.
Quirks S-02–08 and [phase 5 evidence](evidence/prisma-phase5.md) describe read,
patch and ordered failure behavior. Remaining record/CAS/lifecycle/identity/
authorization/Counter/OID-rebind and U participation stay on existing owners;
phase 7 uses the explicitly approved Prisma atomic Counter increment.

## Prisma phase 6 implementation — 2026-10-22

P7 is complete under ADR 0004's Prisma/light-testing plan: six U models plus the
loaded membership junction, plain identity/auth/membership repositories, lazy
runtime and read-only index preflight, independent default Prisma selector and
actual Waterline rollback. DTOs and controlled errors omit credentials; account
linking and callbacks preserve ordered partial effects. Waterline definitions
remain until phase 8. Phase 7 covers records/deleted records, CAS/lifecycle,
recordidentity, authorization, Counter atomic increment and OID rebind. See
[phase 6 evidence](evidence/prisma-phase6.md).


## Prisma phase 7 implementation — 2026-10-22

Remaining S uses model CRUD and conditional revision/incarnation/lifecycle
writes, a permanent identity model, source-intent read/transform/CAS and bounded
schema-grant/record-authorization reads. Core record lookups and U account-link
participation now resolve the S repository. Counter uses one atomic increment
returning the value; OID rebind conditionally updates metadata. No transactions,
GridFS migration, raw operational record query or native record owner remains
under Prisma selection. Known fields extend the two existing record roots and
add identity/Counter on their actual logical datastores (45 fields across four
entities). Presence-sensitive authoritative reads/deletes retain absence and explicit
null through typed result shapes, preventing lifecycle snapshot backfill. Explicit index preparation
covers 35 S scopes (99 total / 40 collections). Registers S-01, S-09–18 and
S-PG-01/02/05/06/07 document improvements, preserved outcomes and typed operations.
[Evidence and phase-8 inventory](evidence/prisma-phase7.md). Waterline remains
only as explicit rollback and ORM/mapping/bootstrap plumbing pending phase 8.
