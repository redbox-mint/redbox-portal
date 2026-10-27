# Waterline retirement implementation plan

Status: P0 technical evidence and assessment recorded in [validation](p0-validation.md);
**G0 full-graph approval HOLD**. The [design](design.md) is the behavioral/release
contract; [tasks](tasks.md) distinguish evidenced discovery from pending owner
agreement and implementation. The [inventory](p0-inventory.md) remains the
historical design snapshot. No gate is passed by inclusion in this plan.

## Transaction-parity decision — 2026-10-22

TX-PARITY-01 (user) removes G-TX as a migration gate. U/V/B and the remaining S
paths migrate at Waterline parity without transactions; `runWithOptionalTransaction`
becomes sequential execution; Counter keeps read-then-write for now. See the
[design](design.md#transaction-parity-decision--2026-10-22-supersedes-g-tx-as-a-migration-gate)
for the full record. G-TX references below are historical where they conflict.

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

**OPS-TX-01 remains undecided / G-TX CLOSED.** TX-PARITY-01/01a removes this
as a migration/promotion gate for U/V/B and remaining S; optional transactions
remain later work. Do not switch repository dev/test/CI stacks to replica
sets. Disposable replica-set driver feasibility spikes are permitted; they do
not supply deployment approval. Preserve all physical/group/interop/rollback/
security requirements and deferred cache behavior.

## Delivery protocol and dependencies

Use reviewable group changes, retaining concrete Waterline and MongoDB driver adapters
only for the development comparison period. For **every group**, execute:

1. **Spike:** verify exact runtime/package capability, physical mapping, indexes,
   callbacks, relationship/query operations and hook constraints on real MongoDB.
   Record unsupported operations and private native-driver work explicitly.
2. **Repository baseline:** introduce plain domain operations and a loaded-model
   Waterline adapter; migrate all consumers, including dynamic/native/migration
   paths. Characterize existing behavior before changing backend selection.
3. **MongoDB driver adapter:** add explicit opt-in selection, readiness/index checks and
   lifecycle integration. Unknown config/unsupported mapping must fail closed.
   Never silently retry through Waterline or bypass G-TX with driver sessions.
4. **Evidence:** shared repository suites plus raw-document/index checks, both
   adapter directions, mixed instances, restart, cross-group reads, hook/security
   parity, config rollback, prior-artifact rollback and bounded operations data.
   Include failure injection/unknown outcomes appropriate to the group.
5. **Promotion:** separate reviewed `next` default change, after evidence and
   institution/operator runbooks. A gate may leave a repository complete but
   promotion blocked. Retirement/official qualification is a separate P11 step.

Evidence per group should include `p<phase>-<group>-validation.md`, a sanitized
fixture/physical mapping, exact source/commands/exit codes/versions/topology,
asserted adapter, compatibility matrix, recovery results, operational comparison
and explicit gate decision. Group adoption artifacts are future work; P0
discovery artifacts are linked from its validation record. Reuse pilot harnesses
where useful; add missing live runners
rather than presenting unit fixtures as database evidence.

| Phase                     | Depends on                                                                            | Exit gate                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| P0 inventory/ADR          | Current source + pilot                                                                | G0 assessment: scope/evidence recorded; full approval HOLD for capability and owner decisions. |
| P0R ORM re-evaluation     | ARCH-01 human direction                                                               | G0R PASSED: user accepted ADR0003 and cache migration on 2026-10-20.                           |
| P1 foundation             | G0R PASSED; explicit user authorization of transaction-free P1/C2                     | G1: package/lifecycle/config/hook/index foundation proven without a cache model dependency.    |
| P2 M ledger               | G1                                                                                    | G-M: migration repository and pending/recorded migration behavior.                             |
| P3 R reference            | G1, M where bootstrap reads ledger                                                    | G-R: complete reference/query-target behavior.                                                 |
| P4 Q configuration        | G1, G-M; R reads as needed                                                            | G-Q: config/CAS/secret leases/I18n parity.                                                     |
| P5a–d J1–J4               | G1; referenced R/Q operations or temporary plain Waterline read seams                 | G-J1…G-J4: separate promotion evidence for each subgroup.                                      |
| P6 transaction checkpoint | P0 capability assessment; may run earlier when upstream changes                       | G-TX (including G-STABLE): currently closed, mandatory before gated operational driver use.    |
| P7 U identity             | G1, G-TX, referenced R/Q and storage operations                                       | G-U; promotion waits if required atomic storage participation is not ready.                    |
| P8 V vocabularies         | G1, TX-PARITY-01, U/security read seams, reference/config dependencies                        | G-V.                                                                                           |
| P9 B branding             | G1, TX-PARITY-01/01a **on both existing datastores**, reference/config/security read seams                | G-B.                                                                                           |
| P10 S storage             | Foundation and application-group interface decisions; gated atomic units require G-TX | G-S: records, identity/schema/attachments, maintenance and owners qualified.                   |
| P11 bridge retirement     | Per-group promotion + G-STABLE + institution migration; G-TX for gated groups         | G-RETIRE(group), including pilot P7 / cache v6 gate.                                           |
| P12 no-ORM qualification  | All G-RETIRE, G-S, released extension migration contract                              | G-FINAL: no ORM dependency or model surface, qualified actual release artifact.                |

Dependencies describe behavior, not permission to keep globals in a completed
group. Introduce the smallest needed plain read operations for referenced
unmigrated groups. P7/P10 may overlap to supply a required storage operation;
neither may promote with an unproven cross-group atomicity assumption. Reclassify
any newly discovered transaction-dependent group at P0 or its spike.

## P0 — refreshed inventory, fixtures and ADR addendum

1. Regenerate machine-readable model/consumer/native-owner inventories from the
   current commit. Cover all 46 declarations, generated junctions, dynamic
   Reports/NamedQuery calls, policies, controllers, bootstraps, historical
   migrations, dev tools, shims, package exports and representative institution
   hooks. Record deltas from the pilot and this design-time snapshot.
2. On isolated real MongoDB, capture sanitized raw IDs, column/collection and
   datastore mappings, timestamps/units, JSON/null/missing/legacy BSON, defaults,
   validations, callback effects, relationship cardinalities and actual indexes.
   Load Waterline to discover real User/Role junctions; declarations are not proof.
3. Enumerate declared **and application** references, dangling/deletion behavior,
   stored queries, native operations and connection owners. Map all
   TransactionUtils users plus UsersService/storage consistency needs. Produce
   an atomicity/effect matrix: database unit, cross-datastore participants,
   postcommit/external effects, current partial/unknown outcomes and recovery.
4. Record ADR addendum `adr/0002-full-model-prisma-suitability.md` (to be written
   during P0). Reuse the pilot ADR, compare only new full-model concerns against
   MikroORM/retained Waterline/direct driver, and confirm or question Prisma for
   relations, transactions, raw operations, routing and storage. Do not infer
   suitability from cache CRUD. Record exceptions and stop/re-decision triggers.
5. Record exact supported versions/topology/FCV, stable/transaction support
   status, designated prior development rollback artifact per group, backup and
   external-asset checkpoints, representative hooks and operational budgets.
   Obtain release-owner scope/timing and deployment topology decisions.

**G0:** every physical owner/entity is allocated; unknowns have a named owner
and block the affected group. P0 records **HOLD**, not an architecture or
release waiver; see [the reviewed decision](p0-validation.md#g0-review-and-decision).
Raw fixture/index evidence, relationship map,
callback/security checklist, atomicity matrix, ADR and baseline results exist.
ADR0003 supplies the accepted replacement architecture; transaction-free P1/C2
implementation is authorized while the remaining G0 owner decisions stay open.

## P1 — shared persistence foundation

Implemented public seams and ownership rules are in [P1 foundation](p1-foundation.md);
exact results and G1 disposition are in [P1 validation](p1-validation.md).
[C2 evidence](c2-validation.md) remains separate from cache promotion.

Generalize the cache pilot's proven design:

- Plain JSON/ID/time/result types and small repository getter/composition seams;
  no generic CRUD facade, ORM-filter type or public session/client.
- App-owned lazy runtime, preLiftSetup ordering, partial-failure cleanup and
  repeat/concurrent initialization/shutdown; borrowed versus owned resources.
- Explicit temporary selection per delivery group, initially Waterline; retain
  the pilot cache selector/default until its separate retirement. The
  typed `persistence.groups.<group>.backend` config fails on unknown/stale entries. No environment
  selector exists for other groups yet; add/test documented forwarding only
  when introducing it. Cross-group atomic units cannot mix backends.
- Model-independent effective datastore/mapping resolver and connection owners
  for both logical databases. Test parity against the pilot/sails-mongo
  normalization cases and live credentials **with no cache model/manager**.
- Scoped inspect/ensure and readiness descriptors; operator remediation and
  startup ordering before writers. Inventory/move current runtime-created DDL
  without deleting documents or inferring extra unique indexes.
- Explicit operation-specific codecs/mappings/index descriptors per package and
  datastore. Resolve two logical database handles on a compatible app-owned pool;
  prove installed routing and no unintended collections. Do not expand Prisma
  contract generation, add per-model pools or introduce a generic registry.
- Published plain extension types/getters; actual loaded Waterline override
  baseline, supported service-based migration, unsupported override refusal and
  provenance-safe shim handling. Test representative custom-hook composition.
- Remove Agenda's User-manager dependence, establish session-store close and
  app-scoped GridFS disposal design before a group removes their borrowed owner.
  Integrate/test ownership changes at the owning group; do not close live users.

**G1:** import/shim generation/build has no sockets; clean core+storage packages
load correctly on supported Node/module paths; unsupported mappings fail;
config parity, readiness, hook and lifecycle failure/repeat tests pass. Keep
the existing cache regression evidence green. Confirm core multi-datastore
contract routing creates no unintended collections or clients.

## C2 — cache driver migration

Current C2 state: **G-C2 PASS; separate MongoDB promotion and Prisma removal delivered**. Explicit Waterline remains a temporary next choice; revised P7/G7 remains open. See [qualification](c2-validation.md).

Historical delivery sequence: first implement the driver adapter alongside P1 without changing the Prisma default, then qualify and separately promote/remove as recorded above.
Apply C2.1–C2.5 in tasks.md: all three pairwise bidirectional adapters, raw BSON,
simultaneous mixed instances, restart, service/notification/branding preview parity,
config/index/lifecycle/packed Docker and measured operations/rollback evidence.
G-C2 needs the pilot evidence standard. C2.6 is a separate promotion commit;
C2.7 removes Prisma only afterwards. Revised pilot P7/G7 qualifies the resulting
driver-only cache artifact; release scope/date otherwise remain REL-01 open.

## P2 — M: migration history

Apply the delivery protocol to MigrationRunner and DashboardConfigService's
ledger read. Preserve Umzug fields/order/skip/failure behavior and prepare a
single-runner deployment procedure. Exercise fresh install, already-applied
history, skipped and failed migration, restart and pending old migrations.
Historical bodies can still use loaded models during transition; their final
replacement is mandatory in P9/P10/P12. The ledger adapter itself must not
require initialized domain services.

**G-M:** both adapters share one unchanged ledger; prior artifact sees new
entries; logged bodies do not replay; duplicate ledger names do not falsely
claim exactly-once body execution. Repository initialized before migrations.

## P3 — R: reference definitions and query execution

Apply the protocol to all eight R entities, including ThemeConfig and physical
`report`. Preserve create-only generated keys, reference relationships,
brand/global/default/bootstrap behavior and explicit population projections.
Characterize NamedQuery/Reports dynamic targets and stored expressions; replace
their access with scoped execution operations and supported metadata. Supply
minimal Waterline-backed plain user/brand/storage readers as needed.

**G-R:** all public reference/form/workflow/report/named-query regressions pass,
including nontrivial filters, relationship reads, ordering, tenant permissions
and institution targets. No generic model registry/ORM query crosses the seam;
unsupported institution expressions are reported before promotion.

## P4 — Q: configuration, secret leases and I18n

Apply the protocol to AppConfig, DashboardConfiguration, I18nBundle and
I18nTranslation plus undeclared secret locks. Probe duplicates/latest-row
selection, AWS failure/timeout/cache ordering, masked results, lease ownership,
dashboard unique branding/revision CAS/copy and legacy migration lookup.
Characterize I18n normalization, sanitization, empty/null behavior and caught
bundle-sync failures. Move required index DDL to deployment prep.

**G-Q:** secret-lock string IDs/BSON Dates and all lease predicates remain
physically compatible; stale owners cannot release/renew another owner;
dashboard conflicts/copy preserve behavior; I18n remains explicitly best effort.
If stronger atomicity is chosen, affected work cannot promote before G-TX.

## P5 — transaction-free progress, audit and job state

Run the full delivery protocol **separately** for each subgroup:

| Phase / gate  | Required additional evidence                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P5a J1 / G-J1 | Progress/workspace status, JSON failures/results, cleanup, references, service return behavior and restart visibility.                                                                         |
| P5b J2 / G-J2 | Run/chunk/event lineage and dedup/attempt keys, native counter increments under contention, retries/retention and record enrichment.                                                           |
| P5c J3 / G-J3 | Redaction, capture/attempt persistence, per-destination retries, simultaneous SIEM claimers, token/expiry fencing, legacy recovery, retention and restart.                                     |
| P5d J4 / G-J4 | Raw replacement/unset behavior, unique/partial indexes, revision conflicts, dispatch/lease/generation/receipt fencing, source intent before acknowledgment, crash/replay and unknown outcomes. |

Do not combine FigshareSync promotion with the gated Figshare vocabulary group.
Any newly found required multi-document unit moves behind G-TX. Workers must
stop/await in-flight operations before closing persistence resources.

## P6 — transaction and stable-runtime checkpoint (**GATED**)

Record **closed** until all independent conditions are satisfied:

1. Refresh official driver support and exact Node/Mongo compatibility matrix;
   repeat affected module/package/lifecycle/config/index/hook/deployment checks.
   Revised pilot P7 follows C2; Prisma maturity is no longer a programme dependency.
2. Obtain **OPS-TX-01** topology/support approval from the operations/deployment
   lead with architecture/security and release owners. Multi-document
   transactions require replica-set or sharded MongoDB; current standalone
   MongoDB 8.0.34 dev/test/CI and pilot results do not qualify. Build isolated
   replica-set dev/test/CI stacks with initiation/primary readiness and routing
   before G-TX. Standalone institutions need an approved conversion, maintenance
   window, backup/oplog/FCV/upgrade/restore and prior-artifact recovery runbook.
   Single-node replica sets provide transaction capability without redundancy
   or failover; choose production support explicitly and qualify multi-node/
   sharded deployments separately. App rollback does not undo topology conversion.
3. Prove the runtime itself supports MongoDB transactions. Test its supported
   API against a representative replica-set/sharded deployment as applicable:
   shared sessions across participating repositories/databases, commit, injected
   failure after the first write, visibility/isolation/concurrent conflict,
   abort/cleanup and ambiguous-commit handling. Disable/detect all optional
   nontransactional fallback. Supported driver sessions must be used by every participating operation.
4. Qualify each gated operation's atomicity matrix, especially User/Role
   junction mutation and BrandingConfig/History's actual two-database topology.
   Test external/postcommit recovery separately; it is not transaction evidence.

**G-TX:** dated support record plus executable real-database evidence on the
exact stable runtime/topology, reviewed by architecture/security/operations
owners. Gate failure blocks P7–P9 operational MongoDB driver adapters/promotion and any
atomic S operation, while transaction-free `next` work may continue. If support
is absent at a release checkpoint or cannot serve an institution topology,
record the explicit ORM/topology/release-scope/timing re-decision and owners.
There is no automatic fallback or deadline that overrides the gate.

## P7 — U: users, roles and authorization (**GATED**)

Discovery/spike and Waterline repository baseline may precede G-TX. Operational
Driver selection and promotion require it. Apply the protocol to all six U
entities **and the actual generated junction data**. Preserve password hashing,
credential projection, membership cardinality, pending-access callbacks,
link/alias/disabled-login/token effects, PathRule and WorkspaceApp behavior.

Test concurrent membership/linking, rollback after each database step,
unauthorized access, callback failure timing and audit correctness. Separate
atomic database units from ordered record authorization/external effects;
implement required storage participation early or wait for P10 before promotion.

**G-U:** security/callback and physical junction evidence, supported transactions,
cross-group effects/recovery and prior-artifact rollback all pass. No password
or restricted credential leaks through DTOs/logs, and no old membership graph
is lost or silently rewritten.

## P8 — V: vocabularies, Figshare vocabularies and RVA (TX-PARITY-01)

Apply the protocol to all seven V entities and three service consumers using
explicit plain operations and the official driver. Preserve the loaded Waterline
baseline: write order, hierarchy/source/version behavior, preview/apply/clone,
approval, RVA metadata, errors, cleanup and partial failures. No transactions or
stronger latch/uniqueness guarantee is introduced.

**G-V:** raw/bidirectional/mixed/restart/config and pre-V-artifact rollback,
controlled concurrency, mid-step failures and recovery, provisional budgets and
both-selector existing suites are recorded in [V validation](p8-v-validation.md).
P8.1–P8.6 are complete for bounded `next`, including the independent MongoDB
default promotion and explicit Waterline rollback. G-TX gates a later optional
consistency improvement. B's name-resolution bridge now follows B's own selector (P9).

## P9 — B: branding/history (TX-PARITY-01/01a)

Qualify both actual datastores on their existing one-server or separate-server
configuration. BRAND-TX-01 is superseded: no same-deployment requirement, session,
transaction or history relocation. Retain history-insert-then-publication order,
certified-not-applied compensation and unknown-outcome recovery evidence.
Explicit operations own normal CSS normalization/allowlist checks; pending
migration bodies retain names/order/ledger and narrowly scoped bypasses.

TX-PARITY-01a permits the driver's natural atomic conditional write. B-01 records
the loaded Waterline race and the driver's stale-write rejection, including
publication conflict compensation. Every discovered quirk has a preserved or
improved entry in the [register](quirk-register.md).

**G-B:** [validation](p9-b-validation.md) records raw/bidirectional/mixed/restart,
configuration and pre-B artifact rollback, injected failures, previews, both
selectors' API/browser suites, budgets and database/assets restoration. Private
institution overrides and production-pruned release artifacts remain separate
qualification. P9.1–P9.6 pass for bounded `next`: the separate default-promotion
commit follows qualification, with omitted-selector, poisoned-model, restart and
Waterline rollback evidence. Both model definitions remain until P11.

## P10 — S: record storage, attachment lifecycle and remaining owners

P10.1–P10.3 and P10.5–P10.8 are complete for the **staged subset**.
[Qualification](p10-s-validation.md) precedes the independent default promotion
`0be51a5f6`: `mongodb` is the S default on next and explicit `waterline` remains.
The [classification](p10-s-classification.md) and [operations](p10-s-operations.md)
remain the scope authority. This covers attachment metadata/journal/audit (except
OID rebind), six schema artifact/reference and five record/integration audit
methods, and bounded revision-wrapper maintenance. The byte/session/queue
owners retain their P10b draining contracts and upstream Agenda watchdog limit.

Record/DeletedRecord reads/CAS/lifecycle/source intents, recordidentity, schema
authorization lookup, U participation, Counter and attachment OID rebind retain
their Waterline/native owner regardless of selector. **P10.4 remains blocked;
G-TX CLOSED / OPS-TX-01 undecided.** No P11 model/bridge retirement is included.
The current G-S PASS is bounded staged `next` acceptance; it is not full S,
transactional, institution or official-release qualification.

Apply the protocol to three core and six storage entities plus recordidentity,
schema persistence, GridFS and backfill/native operations. Preserve the storage
service/capability seam; isolate driver-specific CAS/aggregation/cursors. Prove
revisions/incarnations/tombstones, unknown versus not-applied results, restore/
ABA/idempotency, permanent identity and schema authorization/reference retention.

Retain attachment normalization/journal/lease/audit, staged file coordination
and bytes. Characterize Counter's existing race; escalate stronger allocation
requirements. Port revision backfill entrypoints while retaining conditional
bounded restart-safe updates. Qualify required transaction units through G-TX;
do not retrofit transactions onto every staged storage protocol implicitly.

Finish redboxStorage ownership, Agenda/history routing, connect-mongo close,
GridFSDriver.dispose/application isolation and legacy logo reads. Test lowered
apps, partial init, worker draining, connection counts, pending migrations and
real shared-server clients. Native binary/session/queue ownership remains
documented after ORM removal.

**G-S:** record/storage/API contract and real Mongo lifecycle/concurrency/recovery
evidence pass; no model/manager is required by storage, maintenance or remaining
owners. Clean installed core+storage packages and the supported Docker topology
work without changing existing stored shapes or moving data. The staged-only
P10.7/P10.8 acceptance above preserves this as the **full-S** target: retained
record/U/identity/authorization owners still need P10.4/G-TX evidence and later
P11 bridge retirement. A staged promotion does not satisfy those requirements.

## P11 — per-group bridge retirement and official qualification (**G-STABLE**)

This is a repeatable per-group phase, **not a requirement to hold cache pilot
P7 until all other groups finish**. Cache can complete first when its stable
gate and inherited v6 scope are resolved. For each promoted group:

1. Confirm G-STABLE (and G-TX where required), exact release pins, institution
   migration/recovery readiness and selected official release scope.
2. Complete final configuration/inspect/ensure with no retired model or manager.
   For C, explicitly close the pilot P7 loaded-CacheEntry dependency.
   Check incoming/outgoing associations in the remaining loaded Waterline graph;
   retire connected definitions together or defer their removal. Promotion alone
   does not make a relationship target removable (for example B's roles and U).
3. Remove temporary Waterline adapter, selector, env/Compose forwarding,
   entity definitions/shims/globals/exports and transition-only tests for that
   group. Reject **every** obsolete explicit selector, including `waterline`, `prisma` and `mongodb`, with
   actionable guidance. Preserve migration names/history and supported DTO types.
4. Archive comparison/rollback evidence; retain durable regression suites and
   verify the designated previous artifact or matching checkpoint recovery.
   Retain core's exact Sails-stack `rttc` scalar checker independently of Waterline;
   removing it requires a separately qualified replacement with the loaded-model
   coercion evidence preserved. See [P1 dependencies](p1-foundation.md).
5. Repeat affected core/storage/API/browser/package/image/operational checks on
   the actual **stable sole-backend artifact**. Document known failures and
   institution qualification limits; do not merely cite the RC pilot.

**G-RETIRE(group):** no runtime/model dependency remains for that group, stable
release evidence passes, migration/runbooks match the final artifact, and the
release owner explicitly accepts it. Cache additionally completes the pilot's
P7/G7 and v6 acceptance requirements without expanding its rollback promises.

## P12 — final ORM removal and v-next qualification

After every group retires, remove root/package/template `sails-hook-orm`,
`sails-mongo`, Waterline decorators/types/model config, loader model generation,
global declarations, registration metadata and scaffolding examples. Migrate
or actionably reject all obsolete institution config/files. Inspect lockfiles
and packed dependency trees, not only direct package dependencies. Keep Sails
services/routes/hooks/config bootstrapping working without its ORM hook.

Audit source, generated output, migrations, tests, fixtures, package exports,
dev tools, hook archetypes, image/CI/config examples and docs for executable ORM
references. Historical evidence/prose may remain explicitly archived; no
runtime allowlist of old model access. Rehearse fresh installation and supported
old-volume upgrade with pending migrations on the **no-ORM release image**,
plus restart, rollback/restoration, shared owners and lifecycle failures.

**G-FINAL:** all group evidence and stable/transaction gates pass; no installed
or transitive Waterline ORM dependency, generated model shim, global model use
or manager access remains. Run the agreed full release test matrix and bounded
operations comparison, resolve the pilot timeout/Solr concerns or obtain their
explicit independent disposition, and publish institution/operator migration
guidance with the release-owner v-next scope/date acceptance. Gate failure
means no full-retirement release, not an automatically weakened end state.

## Existing validation commands

These commands exist after C2 Prisma removal. Run the relevant subset
per change and the agreed full matrix for final qualification; this specification
does not claim they have been run or that they already cover future groups.

```bash
# Current cache artifacts, adapter fixtures and packed runtime
npm --prefix packages/redbox-core run test:cache-mongodb
npm --prefix packages/redbox-core run test:cache-transition
npm --prefix packages/redbox-core run test:cache-package
node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs

# Package/root compilation paths (exercise separately where they bypass one another)
npm --prefix packages/redbox-core run build
npm run compile:core
npm run compile:core:prod
npm run compile:storage-mongo
npm run compile:all

# Existing service/storage and Docker integration entrypoints
npm run test:core
npm run test:storage-mongo
npm run test:mocha:mount
npm run test:mocha:ci
npm run test:record-contracts

# Existing API/browser entrypoints; require their documented environments
npm run test:bruno
npm run test:bruno:general
npm run test:bruno:oidc
npm run test:playwright:ci
```

Targeted mounted Mocha uses **newline-separated** existing test paths, e.g.:

```bash
RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/UsersService.test.ts\ntest/integration/services/RolesService.test.ts' npm run test:mocha:mount
```

Use [automated-test](../../wiki/ReDBox-Automated-Tests.md),
[development](../../wiki/Development-Guide.md) and
[cache validation](../prisma-cache-persistence/p5-validation.md) instructions
for environment/credentials/cleanup. Existing cache runners are not full-model
transaction tests. `RBPORTAL_CACHE_BACKEND` selects only cache; setting it does
not qualify another group. Storage's current test script includes opt-in live
coverage; a green default run alone does not prove a real-database matrix ran.
Record observed test counts/skips and actual adapter assertions.

The accepted ORM evaluation retained the following read-only package-maturity
queries as historical research. They are not build or release requirements;
Prisma has been removed from core. Any future reevaluation must pair registry
results with dated official support/transaction documentation and executable
capability evidence:

```bash
npm view prisma version dist-tags --json
npm view @prisma/orm-mongo version dist-tags --json
```

### Implemented P1 commands

```bash
npm --prefix packages/redbox-core run test:persistence-foundation
npm --prefix packages/redbox-core run typecheck:persistence
npm --prefix packages/redbox-core run test:cache-driver-transition
CACHE_PACKAGE_NODE_VERSION=24.16.0 npm --prefix packages/redbox-core run test:cache-package
CACHE_PACKAGE_NODE_VERSION=26.11.1 npm --prefix packages/redbox-core run test:cache-package
```

The package runner packs built core/storage artifacts. Complete their builds
before starting it. Transition workers also consume built core: never rebuild
shared `dist` while they run. Each live runner owns and cleans disposable
standalone containers. Current cache transition/MongoDB/packed commands remain; Prisma/freshness commands are archived at the C2 qualification commit.
Scoped index maintenance is the public `inspectPersistenceIndex` /
`requirePersistenceIndex` / `ensurePersistenceIndex` API; no generic per-group CLI
or transaction runner is implied. Full commands/results: [P1 validation](p1-validation.md).

### Remaining scripts/runners — not present yet

- Explicit per-package/datastore codecs, mappings and index descriptors with
  DB-free typecheck/build; no expanded Prisma generation toolchain.
- Scoped per-group inspect/ensure maintenance entrypoints with explicit database,
  dry inspection, safe diagnostics and deployment/runbook integration.
- Guarded real-Mongo group contract/raw-format/interop/restart/rollback runners,
  replica-set transaction/failure/concurrency runner, core+storage clean-package
  runner and bounded lifecycle/operations evidence tooling.
- Retirement audit/final no-ORM install-and-lift checks, including transitive
  dependencies, stale selectors/hooks/shims/config and pending old migrations.

Select exact names/arguments in each owning phase and record them in evidence before use. Do not
document these proposed names as runnable commands until implemented. Keep
build/freshness DB-free, live runners isolated from institution databases and
destructive cleanup scoped to their explicitly created test database.
