# Waterline retirement tasks

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

Historical driver qualification (superseded by ADR0004): ADR0003 accepted / **G0R PASSED**; **G0 full-graph approval HOLD**.
Transaction-free **P1.1–P1.10 delivered; G1 foundation PASS** within the tested
matrix. See [P1 validation](p1-validation.md) and [public seams](p1-foundation.md).
[C2 driver cache](c2-validation.md) passed G-C2, separately promoted MongoDB and removed Prisma; explicit Waterline remains a next transition. **P2.1–P2.6 delivered; G-M PASS for `next`**;
M defaults to `mongodb` in a separate promotion commit, with explicit Waterline
rollback retained. **P3.1–P3.6 delivered; G-R PASS for `next`**; R defaults to MongoDB in a
separate promotion, with fresh standard default runner evidence. Other groups retain their separate gates. **P10.7–P10.8 staged subset delivered; G-S staged PASS for next**, separately promoted in `0be51a5f6`. P10.4 is now parity work under TX-PARITY-01 (2026-10-22) and all P11 retirement remains unticked.
Historical [P0 validation](p0-validation.md) retains its discovery evidence.
The [round 1 programme review](review-round-1.md) records final safety fixes and
renewed validation without changing the gates or retirement checkboxes.
The [design](design.md) defines
behavior and binding gates; the [plan](implementation_plan.md) defines ordering,
existing commands and proposed tooling. The [inventory](p0-inventory.md) is
design-time discovery, not a completed P0 task. Check a task only when its
acceptance evidence is recorded and reviewable.

**G-STABLE:** supported stable official driver / Node / Mongo matrix, exact pins and renewed
qualification before any official group retirement. **G-TX:** G-STABLE plus
supported official-driver Mongo transactions, **replica-set or sharded MongoDB**
(standalone is ineligible), shared participants/session and actual topology/
failure/concurrency proof. OPS-TX-01 requires deployment/operations approval for
standalone institution conversion, dev/test/CI replica-set stacks, single-node
no-HA policy and matching backup/upgrade/restore runbooks. Currently closed.
Since TX-PARITY-01 (2026-10-22), G-TX gates only a later optional transaction
improvement; struck-through `[GATED: G-TX]` markers below are historical and
the task evidence is re-scoped to Waterline parity (no shared session/rollback).
`[GATED: …]` marks work
that cannot select/promote an operational driver backend or retire Waterline
until the named gate passes. Discovery/spikes and Waterline seams may proceed.

For each group, the validation file must identify source, exact commands/results,
versions/topology, asserted backend, sanitized physical fixtures/indexes, hook
limits, PostgreSQL obligations, rollback artifact and gate decision. Interop
means both write/read directions **and simultaneous mixed instances**; rollback
means config switching plus the designated prior development artifact on
unchanged MongoDB. No checkbox implies a gate waiver.

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
blocker by TX-PARITY-01 above: U/V/B and the remaining S paths proceed at parity. Do not switch repository dev/test/CI stacks to replica
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
- Unchanged: G-STABLE, REL-01, SEC-01, INST-01, OPS-BUDGET-01/OPS-ROLLBACK-01,
  per-group gates, physical/raw compatibility, hook/PostgreSQL obligations and
  no silent fallback. Strengthening any consistency guarantee remains a separate,
  recorded decision. Earlier G-TX text below is historical where it conflicts.

## Container MongoDB image — 2026-10-22

Decision owner: **user (Andrew)**. Repository dev/test/CI containers and live
fixture runners now use `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`
(Docker Hub `latest`). `mongo:8.0.34` exits at startup on Linux kernel ≥ 6.19
(SERVER-121912; the Ubuntu kernel exemption SERVER-131779 is fixed in 8.0.35,
8.3.14 and 9.0.4, and only 9.0.4 is published). Confirmed on the OCI host
(`7.0.0-1013-oracle`): 8.0.34 refuses to start, 9.0.4 starts. Do not fall back
to MongoDB 7. Earlier 8.0.34 results remain historical evidence; later phases
qualify on 9.0.4. `support/deployment-examples` and historical evidence/spike
harnesses are unchanged; the supported production engine matrix is a separate
release decision.

## P0 — inventory and suitability (G0)

- [x] **P0.1** Refresh machine-readable model/consumer inventories, including dynamic queries, policies/controllers/bootstrap, migrations, shims, dev tools and hooks. Evidence: all 40 core + six storage entities allocated once; delta from pilot and current source recorded.
- [x] **P0.2** Capture sanitized real raw documents/indexes and loaded mappings/callback behavior per group. Evidence: datastore/collection/column/ID/timestamp/JSON/null/default/validation matrix; declarations distinguished from observations.
- [x] **P0.3** Capture actual User/Role generated junction data and all declared/application references. Evidence: physical keys/BSON/indexes/cardinalities, duplicates/dangling/deletion behavior and membership operations; no guessed junction schema.
- [x] **P0.4** Inventory native/undeclared owners and connections. Evidence: secret locks, recordidentity, leases/CAS/cursors/backfills/GridFS, Agenda/history, sessions and every manager/client/close path assigned an owner.
- [ ] **P0.5** Agree atomicity/effect matrix. Evidence: four TransactionUtils consumers plus identity/storage requirements, cross-datastore participants, external/postcommit effects and current partial/unknown recovery semantics. **TX-PARITY-01 (2026-10-22):** transaction policy is settled at Waterline parity; no migration transaction gate. Phase 0 removes transaction attempts from the four consumers while preserving partial writes/cleanup and a deprecated published helper shim; [evidence](evidence/tx-parity-phase0.md). Broader per-group effect/interop/recovery qualification remains pending.
- [x] **P0.6** Write ADR addendum `adr/0002-full-model-prisma-suitability.md`. Evidence: relationship/transaction/routing/storage capability comparison, native exceptions, retained repository value, chosen investigation scope and explicit rejection/re-decision triggers.
- [ ] **P0.7** Record environment, release and support decisions. Evidence: exact independent CLI/runtime maturity, Node/Mongo/FCV/topologies, designated prior artifact/checkpoints per group, v6 versus full-major scope owner and branding topology decision/owner.
- [ ] **P0.8** Complete per-group PostgreSQL-readiness assessment and budgets. Evidence: IDs/time/null/JSON/relationships/index/query/blob obligations without PostgreSQL implementation; agreed operations/connection budgets, hook fixtures and G0 decision.

### Phase 0 / TX-PARITY evidence — 2026-10-22

[OCI baseline and sequential execution](evidence/tx-parity-phase0.md): Node
24.16.0/npm 11.20.0 on ARM64; 10 backend builds, 139 affected tests, final core
4,317 passed/117 pending, storage unit baseline 291 passed/38 pending. Live
MongoDB 9.0.4: 14 foundation + all 38 storage integration cases passed; driver
7.7.0 support confirmed. Two peer-lock omissions repaired without other
version changes; initial startup deadline failure passed isolated and full reruns.
No U/V/B/S migration or promotion; no G0/release gate advanced.

### P0R — ORM re-evaluation (G0R)

ARCH-01 directs this spike **before further implementation**. Candidate adoption
is **ACCEPTED by the user on 2026-10-20**. G0 remains HOLD and OPS-TX-01 remains open;
no repository dev/test/CI topology conversion is authorized.

- [x] **P0R.1** Read programme/pilot/wiki evidence and record 2026-10-20 human decisions.
- [x] **P0R.2** Check current Prisma, MikroORM, official driver and credible TypeScript alternative releases, support, licence and transaction roadmap using primary sources.
- [x] **P0R.3** Create isolated exact-pin/npm 11.20.0 spikes using P0 physical fixtures and an owned disposable MongoDB 8.0.34 replica set; prove mapping, relationships/junction mutations and unknown-field preservation.
- [x] **P0R.4** Exercise candidate transaction commit, injected rollback, conflicts/retries and same-client cross-database branding, recording unsupported APIs honestly.
- [x] **P0R.5** Exercise CAS/leases/indexes/cursors/GridFS and DB-free CommonJS/NodeNext builds, clean packed installs and startup/memory on Docker Node 24.16.0 and 26.11.1.
- [x] **P0R.6** Write `adr/0003-orm-reevaluation.md` and `p0r-validation.md`, including hooks/PostgreSQL obligations, comparison, recommendation, trade-offs, limits and re-decision triggers; update design/plan/tasks conditionally.
- [x] **P0R.7** Record conditional group/gate/cache-pilot changes and provisional `next` budget/pre-change-image rollback policy; preserve REL-01/SEC-01/INST-01 and OPS-TX-01 blockers. Evidence: ADR0003 and updated design/plan, no application or stack mutation.
- [x] **G0R** User ACCEPTED ADR0003 and the driver/cache plan on 2026-10-20. G0 remains HOLD; G-STABLE and G-TX require their own evidence.

P0R evidence: [commands/results/limits](p0r-validation.md), [accepted decision](adr/0003-orm-reevaluation.md).

P0 evidence: [validation and corrections](p0-validation.md),
[reviewed inventory/native/reference catalogues](evidence/README.md),
[ADR0002](adr/0002-full-model-prisma-suitability.md).
P0.5 matrix, P0.7 environment/release/support record and P0.8 per-group assessment
are delivered; **remaining release/topology/security/institution decisions and
actual per-group artifact qualification remain pending**, so those checkboxes
stay open. Budgets and pre-change built-image policy are provisionally accepted
for `next`; formal operations approval remains required for official releases.

- [x] **G0 review recorded — HOLD, not passed.** P0's Prisma pair failed stable
      and transaction suitability; ADR0003's driver architecture is now accepted.
      REL-01 scope/date, SEC-01, INST-01 and topology/support decisions remain open.
      Transaction-free P1/C2 implementation is authorized; gated operational
      backends, promotion and retirement retain their own approvals/evidence.

## P1 — shared foundation (G1)

- [x] **P1.1** Generalize plain repository types/getters from cache. Evidence: small domain operations, no public ORM/driver/session types or generic query facade; Promise repositories preserve existing service/RxJS interfaces.
- [x] **P1.2** Generalize app-owned lazy runtime and lifecycle ordering. Evidence: import/no-socket, repeated/concurrent init/close, pre-service/migration readiness, failure cleanup/original-error preservation and shutdown tests.
- [x] **P1.3** Add explicit temporary group selectors and unsupported-mapping checks. Evidence: initial Waterline defaults for new groups, unchanged cache default, actual loaded overrides, invalid config failures and no automatic fallback/mixed atomic unit.
- [x] **P1.4** Resolve both logical datastores without a loaded model/manager. Evidence: pilot URL/split/escaping/credential/TLS/SRV/options parity, safe errors and live effective-database checks with no sails-mongo normalization dependency.
- [x] **P1.5** Generalize index inspection/readiness and scoped ensure. Evidence: duplicate/conflicting/missing/partial/sparse/TTL/collation tests, no foundation/cache startup DDL/cleanup, explicit operator prep and AppConfig duplicate preservation; legacy owner DDL remains with its owning phase.
- [x] **P1.6** Add explicit operation-specific codecs/mappings/index descriptors per package/datastore. Evidence: typed plain boundaries, no expanded Prisma codegen, correct two-database routing on shared compatible pools, no per-model clients or unintended collections; DB-free build/import.
- [x] **P1.7** Qualify build/package/Docker/CI paths. Evidence: existing cache freshness retained until C2 removal, offline NodeNext/CommonJS build/import and production-pruned installed core+storage on supported Node matrix; no generated driver contracts required.
- [x] **P1.8** Publish institution migration seam and safe shim transition. Evidence: plain exports/getters, real override baseline, service-based custom behavior/mapping migration, unsupported physical mapping/selector refusal and preservation of existing hook/shim files. Obsolete-registration refusal and provenance-safe removal remain P11/P12.
- [x] **P1.9** Define resource dependency/drain/close ownership. Evidence: Agenda no longer needs User specifically, session-store close and app-scoped GridFS disposal integration plan; borrowed/owned matrix and partial-init tests.
- [x] **P1.10** Review G1 foundation evidence and retained cache behavior. Evidence: existing cache regressions pass, clean packages/lifecycle/config/index/hook proof and documented exact new runner commands.

G1 technical foundation review: **PASS** for transaction-free P2; exact task
mapping, commands, source/matrix and limits are in [P1 validation](p1-validation.md).
P1.8 publishes the seam and preserves existing shims/files; it does not perform
P11/P12 obsolete-registration/shim retirement. P1.9 integrates ownership and
partial-init/retry checks; full real owner workloads/quiescence remain P10.

## C2 — cache driver migration (G-C2; separate from P1 acceptance)

- [x] **C2.1** Implement MongoDB driver CacheEntryRepository behind the existing four operations and explicit temporary selector; retain Prisma default, validation, errors, physical mapping and deferred behavior.
- [x] **C2.2** Prove raw and bidirectional Prisma↔driver↔Waterline interoperability, null/missing/falsy/unknown-field/string-time/ID parity, duplicate enforcement and no read rewrite.
- [x] **C2.3** Prove simultaneous mixed instances, restart, config rollback and designated pre-change built-image rollback with digest/checkpoints.
- [x] **C2.4** Qualify CacheService, notification failure/recovery/reset and both branding preview paths, including expiry/deletion/error and existing race behavior.
- [x] **C2.5** Qualify config/auth/TLS/SRV/index readiness, resource lifecycle/drain, imports/build/package/production Docker and operational budgets to the pilot evidence standard.
- [x] **C2.6 [GATED: G-C2]** Promote driver default in a separate reviewed commit, retaining temporary rollback until retirement. No default change in P1.
- [x] **C2.7 [GATED: C2.6; no remaining Prisma consumers]** Remove Prisma adapter/contracts/generator/freshness tooling, prisma.config.ts, CLI/runtime dependencies and CI/Docker steps; qualify the Prisma-free cache artifact and revised pilot P7/G7 requirements. REL-01 scope/date remains open.

C2 evidence and gate review: **G-C2 PASS for next promotion**. [Validation](c2-validation.md)
records the full raw/mixed/restart/service/notification/preview, live TLS/SRV/TXT,
lifecycle/index, both packed runtimes, full portal/API/browser, matching restore,
designated original built-image rollback and bounded operations campaign.
The fresh standard Mocha/Bruno general/dev commands pass. C2.1–C2.5 are complete;
C2.6 separately promotes MongoDB in `744517a55` after all 26 checks, a full current
image, both packed runtimes and fresh default Mocha/Bruno/dev passes. C2.7 removes
Prisma in the following change after all 24 current checks, clean npm 11.20.0
locks/CI installs, a full Prisma-free image and repeated fresh standard runners.
The revised pilot P7.1 is superseded; remaining Waterline/model/selector retirement
and official-v6 acceptance stay open.

## P2 — M: Migration (G-M)

- [x] **P2.1** Spike ledger physical/runtime compatibility. Evidence: name/source/appVersion/epoch-ms `ranAt` / `durationMs` / `executedBy` mapping, actual indexes and no new exactly-once claim.
- [x] **P2.2** Move MigrationRunner and dashboard ledger reads to a plain repository with loaded Waterline baseline. Evidence: order/skip/error/bootstrap parity and no domain-service initialization cycle.
- [x] **P2.3** Add opt-in MongoDB driver ledger adapter/readiness. Evidence: shared physical collection, safe failures, duplicate/missing semantics and backend assertion.
- [x] **P2.4** Run raw/bidirectional/mixed-instance/restart and rollback cases. Evidence: logged bodies never replay; pending/failed/skipped migration behavior and prior-artifact compatibility.
- [x] **P2.5** Rehearse deployment migration exclusion and compare operations. Evidence: one-runner procedure, restart/failure recovery and agreed startup/connection budgets.
- [x] **P2.6** Promote M on `next` separately. Evidence: G-M acceptance, institution/operator guidance and continued explicit development rollback.

G-M **PASS for `next`** on the qualified standalone matrix. Qualification
`e360dccb3` retained Waterline; the following separate commit promotes only M to
`mongodb`, retaining explicit Waterline rollback and unpromoted group defaults. See
[P2 evidence, commands, limits and P3 handoff](p2-m-validation.md) and
[deployment/index/one-runner/rollback guidance](p2-m-operations.md).
The post-promotion standard-stack index blocker is resolved by the shared
cache + M fresh init and selected-backend `npm run persistence:indexes` command.
Standard Mocha, fresh dev startup and existing-volume upgrade safety have live
evidence in the P2 validation correction. Every later group must extend the same
fresh script, hook template, operator coordinator and deployment regressions
before promotion.

## P3 — R: reference definitions (G-R)

- [x] **P3.1** Spike all eight R models and stored query targets. Evidence: physical `report`, ThemeConfig, brand/global/cardinality/key/index mapping and institution expression inventory.
- [x] **P3.2** Establish plain repositories/execution module with Waterline baseline. Evidence: create-only generated keys, populated relationship DTOs, bootstrap/default/error parity and scoped NamedQuery/Reports access without model discovery leaking out.
- [x] **P3.3** Add opt-in MongoDB driver R adapters/readiness. Evidence: relationship fetches, dynamic target metadata, supported query translation, unsupported-expression refusal and hook mapping checks.
- [x] **P3.4** Prove physical/bidirectional/mixed/restart/rollback compatibility. Evidence: reference/workflow/form/report/query results, tenant permissions, counts/order/pagination and cross-group Waterline-backed read seams.
- [x] **P3.5** Compare operations and rehearse institution query/hook migration. Evidence: representative workload/budgets, explicit expression limitations and recovery runbook.
- [x] **P3.6** Promote R on `next` separately. Evidence: G-R acceptance with all eight models and all dynamic consumers accounted for.

P3 discovery: [physical spike and available stored-query inventory](p3-r-validation.md).
G-R PASS for the transaction-free `next` implementation; R defaults to MongoDB
in a separate promotion, with explicit Waterline rollback retained. Private institution targets/data remain a deployment and
release qualification limit.

## P4 — Q: configuration, secret leases, I18n (G-Q)

- [x] **P4.1** Spike four Q models and secret locks. Evidence: AppConfig duplicates/latest selection, dashboard revision/index, I18n UID/empty/null and lock string-ID/BSON-Date mappings.
- [x] **P4.2** Introduce plain operations and loaded Waterline baseline. Evidence: secret masking/AWS failure/cache ordering, dashboard copy/CAS/legacy import and best-effort I18n sync/sanitization behavior.
- [x] **P4.3** Add opt-in MongoDB driver Q/lease adapters and deployment readiness. Evidence: owner/freshness predicates, explicit scoped DDL prep, no invented AppConfig unique index or cross-AWS atomicity.
- [x] **P4.4** Prove raw/bidirectional/mixed/restart/rollback and failure cases. Evidence: stale lease rejection, competing dashboard revisions, all-or-none in-document copy, caught I18n sync errors and prior-artifact reads.
- [x] **P4.5** Compare operations and rehearse hooks/secret recovery. Evidence: budgets, safe diagnostics and an explicit G-TX dependency if stronger I18n consistency is chosen.
- [x] **P4.6** Promote Q on `next` separately. Evidence: G-Q acceptance and documented operational index-preparation change.

## P5a — J1: progress/workspace status (G-J1)

- [x] **P5a.1** Spike AsynchProgress/WorkspaceAsync mapping. Evidence: status/result/failure/cleanup and user/brand/record/type reference fixtures.
- [x] **P5a.2** Move consumers behind plain operations and Waterline baseline. Evidence: status and existing service/Observable behavior characterized without cross-job atomicity claims.
- [x] **P5a.3** Add opt-in MongoDB driver/readiness. Evidence: matching physical writes/errors and actual backend assertion.
- [x] **P5a.4** Prove raw/bidirectional/mixed/restart/rollback behavior. Evidence: progress persists across restart and both adapters/previous artifact agree on references and cleanup.
- [x] **P5a.5** Compare operations and rehearse worker/hook recovery. Evidence: budgets, failure outcomes and drain-before-close behavior.
- [x] **P5a.6** Promote J1 on `next` separately. Evidence: G-J1 acceptance and development rollback guidance.

## P5b — J2: harvest lineage (G-J2)

- [x] **P5b.1** Spike three harvest models/native operations. Evidence: run/chunk/event references, dimensions/hash/attempt uniqueness, counters and retention fixtures.
- [x] **P5b.2** Establish plain operations with Waterline baseline. Evidence: existing lineage/retry/enrichment behavior and adapter-local replacement for pkFactory ID discovery.
- [x] **P5b.3** Add opt-in MongoDB driver/CAS/readiness. Evidence: conditional atomic counter operations and exact index semantics under contention.
- [x] **P5b.4** Prove raw/bidirectional/mixed/restart/rollback cases. Evidence: duplicate attempts/counter races, run recovery and previous-artifact compatibility.
- [x] **P5b.5** Compare operations and rehearse harvest recovery. Evidence: bounded workload/budgets, storage read seam and worker drain.
- [x] **P5b.6** Promote J2 on `next` separately. Evidence: G-J2 acceptance, or explicit G-TX reclassification for any required multi-document unit.

## P5c — J3: security events/SIEM (G-J3)

- [x] **P5c.1** Spike event/attempt/native delivery mapping. Evidence: redaction, per-destination state, lease/token/expiry, retry/retention and legacy fixtures.
- [x] **P5c.2** Introduce plain delivery operations and Waterline baseline. Evidence: capture/history/error and configured collection/datastore behavior preserved.
- [x] **P5c.3** Add opt-in MongoDB driver/private native adapter/readiness. Evidence: atomic owner fencing, actual backend and explicit index-preparation procedure.
- [x] **P5c.4** Prove raw/bidirectional/mixed/restart/rollback cases. Evidence: simultaneous claimers, stale owners, legacy recovery, retry/retention and prior-artifact results.
- [x] **P5c.5** Compare operations and rehearse delivery recovery/draining. Evidence: capture/delivery budgets and no owner resource leak or sensitive logging.
- [x] **P5c.6** Promote J3 on `next` separately. Evidence: G-J3 acceptance and security/operator runbooks.

## P5d — J4: Figshare sync state (G-J4)

- [x] **P5d.1** Spike FigshareSync/native store. Evidence: unique OID/partial index, revision replacement/unset, ms leases and generation/receipt mappings.
- [x] **P5d.2** Establish plain sync/claim operations and Waterline/native baseline. Evidence: bounded retries, dispatch/source-intent acknowledgment and unknown-outcome behavior characterized.
- [x] **P5d.3** Add opt-in MongoDB driver/private native adapter/readiness. Evidence: raw replacement semantics, CAS fencing and unchanged namespaces/indexes.
- [x] **P5d.4** Prove raw/bidirectional/mixed/restart/rollback cases. Evidence: competing workers, crash/replay, durable source intent before ack and previous-artifact compatibility.
- [x] **P5d.5** Compare operations and rehearse sync recovery/draining. Evidence: budgets, receipt/generation recovery and storage interoperation.
- [x] **P5d.6** Promote J4 on `next` separately. Evidence: G-J4 acceptance, explicitly independent of gated Figshare vocabulary work.

## P6 — stable/transaction checkpoint (G-TX, currently closed)

After TX-PARITY-01, P6.T/P6.2–P6.6 are a separate later transaction improvement
and do not block P7–P12. P6.1 (G-STABLE) still applies to official retirement.

- [ ] **P6.T [GATED: OPS-TX-01 approval]** Qualify transaction-capable topology.
      Evidence: replica-set/sharded support decision, isolated dev/test/CI replica-set
      initiation/readiness/routing, standalone-institution conversion and maintenance
      plan, explicit single-node no-HA support policy, matching FCV/oplog/backup/
      upgrade/restore and prior-artifact runbooks. Operations/deployment lead owns
      policy; architecture/security/release and institution owners accept it.
- [ ] **P6.1 [GATED: G-STABLE]** Confirm exact supported stable official driver / Node / Mongo matrix and clean package/runtime/lifecycle/config/index/hook regressions. No Prisma generation expansion.
- [ ] **P6.2** Qualify supported driver transaction APIs on disposable replica sets (feasibility may overlap P1). Evidence: commit/abort/mid-write rollback, common session, conflict/retry, unknown commit/cleanup. Operational adoption remains G-TX gated; no repo stack switch.
- [ ] **P6.3 [GATED: G-TX; later improvement]** Qualify cross-repository/datastore units. Evidence: User/Role graph, vocabulary/approval/import and branding's two actual databases; participating storage dependencies identified and supported.
- [ ] **P6.4** Review external/postcommit effects separately. Evidence: owner-approved failure/recovery ordering without an external atomicity claim or native-session bypass.
- [ ] **P6.5** Record explicit checkpoint/re-decision. Evidence: closed/open G-TX decision and release/topology/ORM scope/timing owner; if unavailable, no operational gated driver promotion and no automatic fallback.
- [ ] **P6.6 [GATED: G-TX; later improvement]** Authorize gated group implementation/promotion stages. Evidence: architecture/security/operations review of exact stable version/topology matrix and renewed pilot P7 status.

## P7 — U: identity/membership (complete under ADR 0004)

The historical driver/shared-session, G-TX, budget and mixed-instance evidence
wording is superseded by TX-PARITY-01/01a and ADR 0004. No transaction work is
claimed. See [Prisma phase 6](evidence/prisma-phase6.md).

- [x] **P7.1** Inventory six U models, real stored auth fields, callbacks and the loaded physical membership junction; declare 62 fields without probes or new indexes.
- [x] **P7.2** Plain identity/auth/membership operations and actual Waterline rollback; preserve hashing, disabled/link/token/grant/ownership order and post-write callback failures.
- [x] **P7.3** Prisma model adapters, lazy runtime and catalog/index preflight; account linking calls existing record operations with sequential partial effects.
- [x] **P7.4** Light bidirectional model/junction, membership, partial account-link failure and credential safety checks on both backends.
- [x] **P7.5** Required default core, portal and General API suites plus existing OIDC subset; evidence, both registers and operator docs updated.
- [x] **P7.6** Independent U selector defaults to `prisma`, explicit `waterline` rollback; Waterline definitions remain through phase 8. No push or PR.

## P8 — V: vocabulary/Figshare vocabulary/RVA (G-V)

P8.1–P8.6 **PASS for bounded `next` under TX-PARITY-01**;
[validation](p8-v-validation.md) and [operations](p8-v-operations.md) record
actual loaded mappings, both selectors, failures/recovery, budgets and the locally
rebuilt pre-V artifact limits. Private institution overrides were unavailable and
must remain Waterline until separately qualified. P8.6 is the independent
MongoDB-default promotion; explicit Waterline rollback remains.

- [x] **P8.1** Spike all seven V entities and three TransactionUtils services. Evidence: hierarchy/source/crosswalk/mapping/application references and physical validation/version/approval fixtures.
- [x] **P8.2** Establish explicit domain operations and Waterline baseline. Evidence: preview/apply/clone/import/approval, normalization and existing error/compensation behavior.
- [x] **P8.3 ~~[GATED: G-TX]~~ [PARITY: TX-PARITY-01]** Add operational sequential MongoDB driver adapter. Evidence: parity hierarchy/mapping/version/import operations without public connection handles or fallback.
- [x] **P8.4 ~~[GATED: G-TX]~~ [PARITY: TX-PARITY-01]** Prove raw/bidirectional/mixed/restart/rollback cases. Evidence: concurrent tree/approval/import and injected mid-write failure, unchanged references and prior-artifact compatibility.
- [x] **P8.5 ~~[GATED: G-TX]~~ [PARITY: TX-PARITY-01]** Compare operations/rehearse source/import recovery. Evidence: budgets, external fetch/version failure handling and institution mappings.
- [x] **P8.6 ~~[GATED: G-TX]~~ [PARITY: TX-PARITY-01]** Promote V on `next` separately. Evidence: G-V acceptance, strict Waterline parity and standalone-runtime qualification.

## P9 — B: branding/history (G-B)

P9.1–P9.6 **PASS for bounded `next`** under TX-PARITY-01/01a.
[Validation](p9-b-validation.md), [operations](p9-b-operations.md) and the
[quirk register](quirk-register.md) retain the two-topology, mixed/recovery,
API/browser and budget evidence. The separate promotion makes B default to
MongoDB with explicit Waterline rollback and omitted-selector restart evidence;
private institution/release qualification stays separate.

- [x] **P9.1** Spike two B models and both actual datastores. Evidence: CSS/hash/version/draft/history/font/logo mappings and supported topology or blocking human decision.
- [x] **P9.2** Introduce plain publication/history operations with Waterline baseline. Evidence: callback allowlist/$ normalization, retention/restore, certified-not-applied versus unknown compensation and preview parity.
- [x] **P9.3 ~~[GATED: G-TX across both datastores]~~ [PARITY: TX-PARITY-01/01a]** Add operational MongoDB driver publication adapter. Evidence: both existing datastores, on one or separate standalone servers, history-first publication/compensation and no session/transaction/relocation/fallback; B-01 atomic conditional-write improvement.
- [x] **P9.4** Port pending branding migration bodies to scoped operations. Evidence: same names/order/ledger, deliberate native allowlist bypasses and recorded typeface-pruning recovery limits.
- [x] **P9.5 ~~[GATED: G-TX]~~ [PARITY: TX-PARITY-01/01a]** Prove raw/bidirectional/mixed/restart/rollback and API/browser cases. Evidence: publication conflicts/unknown outcomes/history rollback plus database/external-asset restoration and prior-artifact compatibility.
- [x] **P9.6 ~~[GATED: G-TX]~~ [PARITY: TX-PARITY-01/01a]** Compare operations and promote B on `next` separately. Evidence: budgets, institution topology/hook acceptance and G-B decision.

## P10 — S: records/attachments/schema and final owners (G-S)

- [x] **P10.1** Spike all nine S entities plus recordidentity/native schema/attachment paths. Evidence: revision/incarnation/lifecycle/tombstone/CAS/cursor/index/codec/byte fixtures and explicit staged-versus-atomic classification. See [classification](p10-s-classification.md) and [validation](p10-s-validation.md); borrowed-manager GridFS ABI failure is retained for P10.6.
- [x] **P10.2** Introduce plain persistence/maintenance operations with Waterline/native baseline. Evidence: unchanged storage/capability contracts, callback protection, identity ledger, schema grants/pins/retention, attachment journal/normalization/audit and Counter race characterization. See [validation](p10-s-validation.md); Counter retains its original lost-update and JavaScript addition behavior.
- [x] **P10.3** Add opt-in MongoDB driver/private Mongo adapter/readiness for staged operations. Evidence: no raw cursors/query/session types escape, unknown/not-applied outcomes and unchanged physical namespaces. See [operations](p10-s-operations.md) and [validation](p10-s-validation.md): six staged entity paths, 15 index scopes, explicit tested baseline routing. P10a retained Waterline default; P10.8 below separately promotes only the staged subset.
- [x] **P10.4 [PARITY: TX-PARITY-01/01a, ADR 0004 phase 7]** Move remaining record/lifecycle/identity/authorization/U operations to Prisma model operations. Preserve ordered partial failures without transactions/shared sessions; atomic Counter increment explicitly approved. [Evidence](evidence/prisma-phase7.md).
- [x] **P10.5** Port revision backfill entrypoint and maintenance. Evidence: [validation](p10-s-validation.md), `evidence/p10b-s/s-final-results.json`: 16 live checks across both selectors, including a model-free driver entrypoint; bounded conditional missing/null-only batches, restart/no-progress and untouched metadata/workflow/auth/lastSaveDate, no broad rewrite.
- [x] **P10.6** Complete resource ownership/draining. Evidence: [validation](p10-s-validation.md), `evidence/p10b-s/s-final-results.json`: 16 live checks per selector plus five startup/cleanup checks; redboxStorage pools, Agenda queue/history routing/SQS, session TTL/login/close, GridFS dispose/app isolation/partial-init and legacy logo reads. Connections return from 14 active to the observer-only baseline of 2; legacy GridFS ABI fixed through owned-driver byte I/O. Existing upstream Agenda watchdog timer limit is documented; P10b left G-S open for the later staged qualification below.
- [x] **P10.7 (staged subset only)** Prove raw/bidirectional/mixed/restart/rollback/storage/API/recovery cases. Evidence: [validation](p10-s-validation.md), `evidence/p10c-s/verification.json`: real failpoints, killed journal owner, ABA/idempotent restore/conflicts/unknowns/permanent identity on retained baseline, scoped schema authorization, bytes/journal checkpoint recovery, pending migrations, clean packed core+storage on Node 24/26, and actual built pre-promotion image. Full stock Mocha/Bruno and fresh readiness pass for promoted default and explicit Waterline. Atomic driver implementation remains P10.4.
- [x] **P10.8 (staged subset only)** Compare operations and promote S on `next` separately. Evidence: qualification `1e2085cd6`, single promotion `0be51a5f6`, [validation](p10-s-validation.md) and [operations](p10-s-operations.md): G-S staged PASS, all provisional budgets, owner/hook/readiness/rollback proofs and renewed post-promotion matrix. MongoDB is the staged S default; explicit Waterline remains. Record/identity/U/authorization/Counter/rebind stay Waterline/native-owned regardless of selector; every atomic subset remains G-TX blocked. No P11 retirement.

## P11 — bridge retirement (completed under ADR 0004)

The original stable-driver/per-group gate wording is superseded by ADR 0004.
The same implementation retirement applies to C, M, R, Q, J1, J2, J3, J4,
V, B, S and U; official release acceptance remains P12.7.

- [x] **P11.1** Confirm the twelve-group implementation scope and exact Prisma pins: CLI 8.0.0-rc.24, runtime 8.0.0-rc.19. ADR 0004 accepts these RCs.
- [x] **P11.2** Remove loaded-model/mapping/association dependencies from composition, maintenance and index inspection/preparation. Fixed logical contracts replace model mapping overrides.
- [x] **P11.3** Remove rollback adapters, models/shims/globals/types and backend switching. Refuse every obsolete selector/environment override, including `waterline`, `mongodb` and `prisma`; Compose passes through stale values for refusal.
- [x] **P11.4** Remove transition-only fixtures/runners and executable comparison spikes; retain historical reports and durable raw-format/service/credential/concurrency/index/lifecycle regressions. Preserve the designated prior tar for later recovery qualification.
- [x] **P11.5** Run ADR 0004's light default verification: clean installs, builds, core/storage/portal/Bruno and fresh dev login. Fuller artifact/browser/budget/recovery work is separate.
- [x] **P11.6** Retire cache's loaded-model checks, rollback adapter, selector and shims. Inspect/ensure use the fixed Prisma contract; deferred cache behavior is unchanged.
- [x] **P11.7** Record all twelve groups retired in phase-8 evidence and both registers. This is implementation completion, not official v6 release acceptance.

## P12 — no-ORM qualification and final acceptance

- [x] **P12.1** Remove root/package/transitive ORM dependencies and obsolete config/types/decorators. Regenerated lockfiles and six clean installed dependency trees contain no waterline, sails-hook-orm or sails-mongo. Full image qualification remains separate.
- [x] **P12.2** Remove loader model generation/registration and dev-tool/archetype examples. Keep services/controllers/policies/config/hooks; refuse obsolete institution surfaces and delete only proven generated shims.
- [x] **P12.3** Audit runtime/generated/migration/test/package/template/CI/Docker/docs surfaces. No executable ORM access remains; refusal fingerprints/tests, compatibility comments and historical evidence are classified in phase-8 evidence.
- [x] **P12.4a** Complete fresh install, live persistence/index/lifecycle regressions and fresh development stack login with the ORM disabled.
- [ ] **P12.4b — fuller qualification** Rehearse supported old-volume upgrades, pending migrations, restart and final built images against institution hooks/data.
- [ ] **P12.5 — fuller qualification** Rehearse prior-artifact/backup/binary recovery and connection/memory/startup/error budgets with matching binary/FCV/topology.
- [ ] **P12.6 — ADR step 5** Complete whole-branch review and fuller browser/package/image/recovery qualification. These are not prerequisites for phase-8 implementation completion.
- [x] **P12.7a** Publish institution/operator migration guidance, configuration refusal behavior and permanent native ownership.
- [ ] **P12.7b — release owner** Accept the full-retirement major and decide push/PR/split. No push or PR is made by phase 8.

## Prisma phase 2 (ADR 0004, 2026-10-22)

M, R and Q are implemented and pass bounded interoperability/failure checks,
including Prisma dashboard/secret coordination on explicit Waterline fallback.
Final validation passed: 4,307 core tests (108 pending), 419 portal Mocha tests
(10 pending), and Bruno folders 1–4 (309 requests / 553 tests / 3 assertions).
The final focused Q rerun passes seven groups, including datastore aliases.
Earlier per-group
budget/prior-image/matrix gates are superseded by ADR 0004's light test decision.
See [phase 2 evidence](evidence/prisma-phase2.md) for commands and phase 3 J1–J4 notes.

## Prisma phase 3 (ADR 0004, 2026-10-22)

- [x] Correct phase 2b: remove synthetic production fields; real label/attachmentFields remain. Undeclared fields survive in storage but are omitted from Prisma model reads.
- [x] J1–J4 real field inventories and Prisma adapters, default `prisma | waterline` selectors, control readiness/DDL, native-helper retirement and bounded transition checks. No transactions; Agenda/session/GridFS owners unchanged.
- [x] Record final core, portal Mocha and Bruno General folders 1–4 results and owned-resource cleanup in [phase 3 evidence](evidence/prisma-phase3.md).
- [x] V then B real-field inventories and model API migration: completed in phase 4 below; existing staged storage/identity work remains separate.

## Prisma phase 4 (ADR 0004, 2026-10-22)

V and B driver adapters replaced by model repositories. V's seven real models
and B config/history contracts are declared; history uses redboxStorage's client.
Selectors are `prisma | waterline`, default Prisma. V-06 improved; B-01 improvement
retained. Frozen B migrations and V brand lookup follow B repositories. Transition
contracts pass; final default suites/evidence are recorded in
[evidence/prisma-phase4.md](evidence/prisma-phase4.md). Next is staged S in the
storage hook, then U/full S and Waterline removal; no retirement gate is claimed.


## Prisma phase 5 (ADR 0004, 2026-10-22)

- [x] Inventory six staged S entities (94 fields) and declare core/storage models
  with native Date versus ISO-string timestamps; no fixture-only fields.
- [x] Replace attachment/journal/access-audit and schema/reference/record-audit/
  integration-audit driver adapters with model APIs; bounded revision paging and
  conditional typed coalescing; Prisma catalog/DDL; `prisma | waterline`, default Prisma.
- [x] Preserve stage/token/revision guards and partial failures; record S-02–08
  and the permanent GridFS native exception. Record/U/Counter/rebind owners stay.
- [x] Final defaults pass: core 4,308 (108 pending), storage 329 including 38
  live cases, portal 419 (10 pending), Bruno 309 requests / 553 tests / 3
  assertions; light S checks 219 + 16 + 14, no failures. Owned resources cleaned:
  see [phase 5 evidence](evidence/prisma-phase5.md).

Next: phase 6 U (six identity models and real generated membership data), then
phase 7 full S record/lifecycle/identity/authorization, Counter atomic increment
and OID rebind. No Waterline removal or push/PR in phase 5.

## Prisma phase 6 (ADR 0004, 2026-10-22)

P7 completed by direct Waterline-to-Prisma migration; U never had a driver
adapter. Six models plus one explicit ObjectId edge model (62 total fields).
U-01–U-11 and U-PG-01 document decisions; tests and exact outcomes are recorded
in [phase 6 evidence](evidence/prisma-phase6.md). Next: phase 7 records/deleted
records, CAS/lifecycle, recordidentity, authorization, Counter atomic increment
and OID rebind. GridFS stays on its driver; phase 8 removes Waterline.


## Prisma phase 7 (ADR 0004, 2026-10-22)

- [x] Inventory and declare all 45 real fields for Record, DeletedRecord,
  recordidentity (`redboxStorage`) and Counter (`mongodb`); keep physical mappings.
- [x] Move all remaining record CAS/lifecycle/source-intent/authorization/U access,
  Counter and OID rebind to model operations. Typed builder handles dotted Json
  order/count/projection; no raw operational S queries or transactions.
- [x] S defaults to Prisma for its entire contract; explicit Waterline rollback
  remains until phase 8. Full-S indexes use explicit stopped-writer preparation.
- [x] Record light transition/default-suite results and both registers in
  [phase 7 evidence](evidence/prisma-phase7.md), including the phase-8 access inventory.

Historical phase-7 next step (now completed above): phase 8 removes rollback adapters, model definitions/shims, ORM loader
plumbing, Waterline dependencies and selectors. Historical P10 atomic/shared-session
qualification is superseded; optional future transactions are separate work.
