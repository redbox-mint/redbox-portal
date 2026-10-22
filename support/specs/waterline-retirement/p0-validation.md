# P0 validation and G0 assessment

Reviewed **2026-10-19 (Adelaide)**. Scope: P0.1–P0.8 and G0 only, on branch `t3/waterline-retirement`, stacked on the
completed cache pilot. **No production source, dependency/lock, backend selector, application configuration or running
institution/development database was changed.** P0 fixtures live under
`packages/redbox-core/test/fixtures/waterline-retirement/`, following package test conventions and the pilot's opt-in
Sails capture pattern.

**Result:** technical discovery/assessment delivered. **G0 full-graph approval HOLD**. P0.1–P0.4/P0.6 are evidenced;
P0.5/P0.7/P0.8 retain open acceptance checkboxes because owner agreement, supported topology/release/artifact decisions
and agreed budgets have not been supplied. No human sign-off is inferred from this implementation review. All P1–P12
production implementation remains pending.

## Evidence index and source baseline

| Task | Durable evidence / result                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0.1 | [inventory.json](evidence/inventory.json), [reviewed surfaces](evidence/inventory-review.json): 40 core + 6 storage declarations allocated once to twelve groups; source hashes/definitions, named calls and mention-file/line index; dynamic/native/transaction/extension candidates; pilot/current-source delta. Policies, controllers, bootstrap, migrations, loader/shims, published types, templates/dev tools and bundled hook registrations included.                         |
| P0.2 | [canonical EJSON archive](evidence/waterline-mongo8.ejson), [capture log](evidence/capture.txt), [mapping summary](evidence/mappings.md): all 46 actual source model definitions loaded through Sails ORM with two real datastores; synthetic inputs, loaded attributes/schema/associations/callbacks, raw BSON, physical types, returned/serialized data, observed indexes and required-field negatives per model. Native service writes and post-init indexes are separate phases. |
| P0.3 | EJSON `generatedModels`/`junction`, [reference catalogue](evidence/references.json): 41 declared associations,33 application reference families and actual membership physical graph/operations. Generated archive included. Institution-configurable JSON/queries/private hooks remain scoped unknowns.                                                                                                                                                                             |
| P0.4 | [native-owners.json](evidence/native-owners.json): every native candidate assigned ownership/disposition, including false positives/types/fixtures; undeclared locks/identity, CAS/leases/cursors/backfill, Agenda/history, sessions, GridFS/Flydrive and all discovered manager/client/close paths.                                                                                                                                                                                 |
| P0.5 | [atomicity/effect matrix](evidence/atomicity-effects.md): four helper consumers, U↔S required participation, cross-database branding, current partial/unknown recovery, external/postcommit effects and newly explicit gated S subset. **Owner agreement pending.**                                                                                                                                                                                                                  |
| P0.6 | [ADR0002](adr/0002-full-model-prisma-suitability.md), [npm + official source snapshot](evidence/capabilities.json), real read-only Prisma relation/routing/transaction-property probe. Current full-graph adoption rejected; repository boundary retained.                                                                                                                                                                                                                           |
| P0.7 | [environment/release/support record](evidence/environment-release-support.md): actual resolution/versions/FCV/topology, G-STABLE/G-TX closure, OPS-TX-01 standalone conversion and replica-set policy, release scope/owner, per-group prior-artifact/checkpoint record. **Release/topology/support and built-artifact decisions pending.**                                                                                                                                           |
| P0.8 | [per-group PostgreSQL readiness and proposed budgets](evidence/postgresql-readiness-budgets.md): twelve assessments, hook/ID/time/null/JSON/relationship/index/query/blob obligations and measurable workload/resource proposals. **Agreement and deployment capacity measurements pending.**                                                                                                                                                                                        |

Production baseline is exact commit **`441d87304cbb820ead569a9fcab405f112de0701`**. Capture/inventory `sourceCommit`
records the later local discovery checkpoint; no production source changed between them. Inventory hashes allow
independent checking. Compared with pilot consumer snapshot `f6668358…` and design baseline
`79c116fe0a6e07830ac1313d7403b4277b39e498`, model declarations are unchanged. Pilot's 43 model names / 80 named
model-file pairs were incomplete as retirement scope: CacheService/branding CacheEntry calls moved behind the pilot
seam; historical branding migrations, revision backfill/dev migration templates and pilot tools are newly visible
candidates. Literal 85 production-category pairs include spike/template candidates, **not 85 executable application
consumers**. Dynamic NamedQuery aliases/discovery and Reports getReportModel need explicit replacement despite lexical
counts. `Counter.findOrCreate` is now included.

Reviewed AGENTS.md and all programme/pilot contract, ADR, inventory, consumer, P7/deferred/final-review evidence;
relevant wiki architecture/services/loader/ standards/testing/cache pages. Router's missing `redbox-core.md` was
resolved to `support/wiki/Redbox-Core-Types.md`. Wiki remains the preferred architecture and test reference. The Redbox
Testing skill was applied for fixture placement and test-runner conventions; P0 intentionally owns an isolated DB
instead of running shared development Compose services.

## Real capture and reproducible commands

Commands run from repository root using existing installed dependencies/built core (storage source definitions import
the public core package). No install or lock regeneration; host npm 12 was used only to run/read existing scripts or npm
registry metadata. **npm 11.20.0 remains mandatory for later lock maintenance.**

```bash
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only \
  packages/redbox-core/test/fixtures/waterline-retirement/inventory.cjs
bash packages/redbox-core/test/fixtures/waterline-retirement/run-capture.sh
python3 packages/redbox-core/test/fixtures/waterline-retirement/capture-support.py
python3 packages/redbox-core/test/fixtures/waterline-retirement/review-inventory.py
python3 packages/redbox-core/test/fixtures/waterline-retirement/audit-evidence.py
```

The capture starts **its own** uniquely labelled digest-pinned MongoDB 8.0.34 container on a random 127.0.0.1 port, with
no shared volume/Compose project. It uses only `wr_p0_core` and `wr_p0_storage`, synthetic addresses/passwords/data, a
temporary Sails app, actual source definitions and real sails-mongo queries. It never addresses `development-mongodb-1`
or existing database volumes. EXIT cleanup removes only the returned container ID and its anonymous volumes; native
clients, Sails and temporary files close/remove in finally. Each replay uses a fresh Node process (sails-mongo
registration is process stateful).

**Actual environment:** Node 24.18.0, capture-resolved Sails 1.5.18 (root manifest/ resolution 1.5.17), ORM hook 4.0.3,
Waterline 0.15.2, sails-mongo 2.1.2, native 7.7.0, MongoDB 8.0.34/FCV 8.0 standalone without auth. The nested Waterline
driver is 6.3.0, storage package resolves 7.2.0. This is synthetic physical-behavior evidence, not auth/TLS/production
load/replica-set/failover qualification.

Only the **UsersService pending-access side effect** is stubbed; callback calls are logged and a deliberate failure
proves timing. Database, Waterline, relationships and model callbacks are real. Native legacy/rich BSON injections are
explicitly labelled. Canonical archive serialization normalizes nested BSON6 ObjectId/Binary instances to BSON7
equivalents with identical type/value; it does not transform stored data. Raw BSON and Waterline JSON are separate.
There are no hidden Mocha skips: the opt-in script runs assertions directly.

## Observed physical and callback behavior

All 46 ordinary Waterline creates produced ObjectId `_id`, string-facing returned IDs and ISO-string
createdAt/updatedAt. Loaded collection/datastore/column mapping and each field's top-level physical BSON type appear in
the archive and [mapping table](evidence/mappings.md). `RBReport` maps to **report**; BrandingConfigHistory and all six
storage models use **redboxStorage**. Other core models use mongodb. No collection relocation or bulk rewrite occurred.

Safe-mode model setup initially creates **only `_id` indexes** in this fixture; that is an observation of loaded
Waterline, not a claim production has no indexes. Source annotations/index declarations are recorded separately. A later
capture phase invokes actual storage initialization, dashboard/SIEM/Figshare index routines in the disposable DB and
records all resulting indexes under `nativeOwners.indexes`. This distinguishes model intent, safe-mode baseline and
service-owned runtime DDL. Migration of DDL to operator inspect/ensure is P1 and group work, not implemented here.
J2/model-only index intent still needs its future scoped readiness fixture, as do Agenda/session/GridFS-owned indexes.

The JSON probe covers every JSON-owning group (M has scalar fields): object, array, empty string, false, zero and null,
native missing field, unknown field retention and rich legacy Date/ObjectId/Binary. Success of Waterline's permissive
read does not certify plain-JSON portability or allow a destructive cleanup. Strict codecs/readiness decisions and real
institution legacy data remain group adoption obligations.

| Group | Characterized callbacks / material result                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C     | Cache JSON/default/null behavior and unknown-field retention; inherited pilot behavior unchanged.                                                                                                                                                                                                                                                                                          |
| M     | Exact fields `ranAt` epoch-ms, `durationMs`, `executedBy` hostname; no duration/host physical aliases. No exactly-once migration execution claim.                                                                                                                                                                                                                                          |
| R     | RecordType/DashboardType/RBReport/NamedQuery generated keys survive rename; loaded associations/reference mappings retained.                                                                                                                                                                                                                                                               |
| Q     | Bundle UID is create-only; key-only translation update retains old UID; empty value accepted, null update rejected; branding/global defaults captured. Secret lock `_id` is string/BSON Date expiry; release removes owner and sets epoch expiry, observed without AWS calls.                                                                                                              |
| J1    | Real status/default/reference/JSON writes; no job/status atomicity claim.                                                                                                                                                                                                                                                                                                                  |
| J2    | Run/chunk/event dimensions, numeric counters/attempts and JSON snapshots/defaults; native conditional counters source-owned, no P0 contention qualification.                                                                                                                                                                                                                               |
| J3    | Event/attempt schema, payload/lease/history defaults and actual native index setup; no external SIEM delivery attempted.                                                                                                                                                                                                                                                                   |
| J4    | Loaded model shape and actual native store initialize/index output, ms lease fields; no remote Figshare work or recovery qualification.                                                                                                                                                                                                                                                    |
| U     | Password create uses bcrypt cost 10 and matches input; custom serialization omits it, ordinary find retains it. Throwing afterCreate access callback rejects **after User row persists**. Membership probes described below.                                                                                                                                                               |
| V     | Trimming/lowercase/defaults, duplicate identifier and missing-parent failures, scope/category/revision/approval/state validation. **Direct partial self-parent update succeeds**; omitted optional category path becomes null then callback rejects non-array. No production fix.                                                                                                          |
| B     | `$` CSS key normalization/allowlist rejection and real history cross-datastore mapping; publication transaction not qualified.                                                                                                                                                                                                                                                             |
| S     | Attachment bounded-ID/normalization and optional-enum/null warnings; ordinary Record/DeletedRecord caller revision stripped/reset to 0. Native record create supplies revision 0, recordVersion 1, UUID incarnation and dateCreated/lastSaveDate strings; permanent identity raw document captured. **Native schema service writes BSON Date timestamps/expiry**, unlike Waterline writes. |

The underlying callback names/config are archived for each model; these probes do not exhaust every service branch or
institution override. Private hooks, source-data topology and API/browser parity must be qualified before their group
adopts a new backend. Generated `archive` is loaded, but no current `.archive(` source caller or historical institution
rows were inspected. Assign historical archive maintenance to the core/institution migration owner; retain unknown rows
and block final removal until assessed.

## Actual User/Role junction

Observed identity/table **`role_users__user_roles`**, datastore **mongodb**. Raw columns: ObjectId `_id`, ObjectId
**user_roles → User**, ObjectId **role_users → Role**. Only `_id` index; no compound pair constraint, no ordinary
createdAt/updatedAt fields. Both sides' add and populate operations executed; no array-based relation or guessed table
schema was used.

| Sequential operation                              | Physical edge count |
| ------------------------------------------------- | ------------------: |
| User adds two roles                               |                   2 |
| Role adds second user                             |                   3 |
| Repeat add same pair                              |                   4 |
| Remove one association                            |                   3 |
| Replace user's memberships                        |                   2 |
| Explicit native duplicate injection               |                   3 |
| Add nonexistent role ID through Waterline         |                   4 |
| Destroy role with default cascade metadata        |                   4 |
| Destroy second user with default cascade metadata |                   4 |

Raw snapshots and both-direction population results are archived at every step. Duplicate/dangling rows persist,
deleted/missing target documents disappear from populated target results, and default destroy does not clean the
physical edge rows. This is one observed operation sequence, not a global referential policy for every declared
association. Do not add unique-pair/FK/cascade cleanup or claim those constraints already exist. Other groups'
deletion/ordering behavior remains operation-specific qualification before adoption.

## Capability and topology conclusions

The read-only live probe on exact installed Prisma pair reads that explicit edge model with two belongsTo includes,
handles missing related targets and routes a second dbName client to a distinct database. The client has no transaction
API. No cross-db include, shared session, graph mutation, safe projection or full storage suitability follows. Official
docs/npm confirm current RC/early-access maturity, no nested Mongo writes and no Mongo transactions. See
[ADR0002](adr/0002-full-model-prisma-suitability.md).

The native-driver standalone transaction attempt rejects; current optional Waterline helper logs fallback and a failure
after first write **leaves the first write persisted**. No code 20 or successful transaction is invented. Two
independent G-TX blockers therefore exist: **unsupported Prisma API** and **standalone topology**; G-STABLE
independently remains closed too.

The operations/deployment lead owns **OPS-TX-01**: standalone institutions need approved replica-set/sharded
conversion/support and backup/upgrade/restore runbooks; dev/test/CI require qualified replica-set stacks. Single-node
replica sets can enable development transactions but add no HA/redundancy/failover. Production support, matching
FCV/oplog/backup recovery, common deployment for cross-db participants and release impact need explicit owner decisions.
No replica-set stack was needed/built for P0 negative evidence.

## Spec correction ledger

| ID     | Contradiction / clarification from P0                                                                                         | Corrected contract / future consequence                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COR-01 | MongoDB 8 alone/standalone pilot qualification cannot support transactions.                                                   | G-TX now explicitly requires replica-set/sharded topology in design/plan/tasks, OPS-TX-01, dev/test/CI changes, institutional conversion, single-node support limits and backup/upgrade/restore impact. Added future P6.T prerequisite. |
| COR-02 | One Prisma client routes all models by dbName, not Sails per-model datastore.                                                 | Replace aggregate runtime routing assumption with package/group manifests and private contracts/clients **per package/datastore**; explicit cross-db reads. P1 must prove installed generation/routing/session limits.                  |
| COR-03 | Actual membership physical shape/duplicates/dangling/deletion differs from inferred relational integrity.                     | Record exact edge keys/ObjectId types/indexes and observed operations. No pair uniqueness, arrays or cascade inferred. Include generated archive/historical owner in final scope.                                                       |
| COR-04 | VocabularyEntry partial updates bypass record.id-dependent self/cycle callback checks; category optional path omission fails. | Remove universal rejection claim, preserve characterized submitted-field behavior, name security/domain consistency decision; record required explicit path behavior. No production bug fix in P0.                                      |
| COR-05 | Migration shorthand duration/host could be mistaken for physical field names.                                                 | Exact `durationMs` and `executedBy` (hostname), plus `ranAt` epoch-ms in design/task acceptance.                                                                                                                                        |
| COR-06 | Native storage/schema writes do not all share ordinary Waterline timestamp fields/types.                                      | Explicit BSON Date schema times/expiry vs ISO strings in model/record/identity paths; per-operation codecs required.                                                                                                                    |
| COR-07 | Narrow contracts/customToJSON are not proof raw ordinary reads/includes exclude password.                                     | Plain repository/API safe DTO projection is explicit; credential operation narrow; direct Waterline find and Prisma include can carry password. Preserve cost 10 hashing and postwrite failure timing.                                  |
| COR-08 | Original specification-only/all-pending status became stale after discovery.                                                  | Link evidence/task statuses and recorded G0 HOLD; retain unapproved human agreements and all production phases as pending.                                                                                                              |

## G0 review and decision

**Decision: HOLD full-graph Prisma approval / G0 not passed.** Inventory and technical evidence support a useful
repository boundary, but current ORM maturity and transactions fail binding gates. Owner atomicity/recovery, release
scope, transaction topology, rollback artifact and budget decisions are outstanding. This is an implementation review
disposition, not architecture/security/release sign-off. Unknowns have accountable roles and block affected groups.

Permitted continuation is limited to independent transaction-free discovery, plain Waterline repository baselines and P1
feasibility work consistent with the existing gates. It does not authorize adopting another ORM, operational U/V/B or
atomic S Prisma adapters, default promotions, selector/model removal or official release qualification. No P1 task is
checked by this P0 work.

Human decisions required are enumerated with IDs/roles in
[environment-release-support.md](evidence/environment-release-support.md): ARCH-01 ORM/scope/timing; REL-01 official
v6/full major; OPS-TX-01 supported replica-set topology/institution conversions; BRAND-TX-01 common transactional
deployment; SEC-01 precise atomic/audit/postcommit boundaries and callback quirks; OPS-BUDGET-01 budget agreement;
OPS-ROLLBACK-01 immutable built prior artifacts; INST-01 private hook/query/legacy-data assessment. Rejection preserves
repository work and triggers explicit re-decision, not silent fallback.

## P1 handoff

- Reuse cache plain types/getters, app-scoped lazy runtime, failure cleanup, effective URL/split/escaped/TLS/SRV mapping
  parity and inspect/ensure. Preserve cache default/selector and deferred behavior; eliminate loaded-model dependence
  only with equivalent no-model proofs. No generic CRUD/query facade.
- Resolve both logical databases explicitly. Contracts/clients are private per package/datastore; pool ownership is by
  effective connection policy, never per entity. No cross-db relation/session assumptions. G-TX stays closed.
- Preserve actual loaded hook mappings/callbacks as Waterline baseline; supply
  custom-ID/collection/column/datastore/behavior and institution query fixtures before adoption. Unsupported overrides
  fail before writers.
- Account for generated membership/archive and connected association definition removal. Stage native index
  inspect/ensure separately from safe-mode model declarations; never cleanup legacy duplicates/orphans at startup.
- Carry U↔S authorization and branding cross-db dependencies, postcommit and unknown-outcome protocols explicitly.
  Preserve staged storage identity/schema/ attachment/Figshare protocols. No native-session workaround for G-TX.
- Assign/drain/close Agenda address clients/history, connect-mongo and app-scoped GridFS before removing Waterline
  pools. Current missing shutdown wiring is evidence for P1/P10 work, not fixed by this phase.
- Approve budgets before comparing workloads. Retain pilot P7/stable blocker, 12-second source-loading timeout and Solr
  readiness qualification concerns. Recheck capability/topology/release decisions at P6 and every proposed release.

## Verification record

The final command/results and evidence audit are recorded in [checks.txt](evidence/checks.txt). Only completed commands
count. Scope-appropriate verification is the real isolated capture, source/review invariants, syntax, formatting/local
links and git scope/whitespace checks. No production code was changed, so P0 does not claim
full-core/portal/browser/Bruno or new replica-set qualification. All owned containers must be absent at completion.
Local commits carry the requested Codex co-author trailer; no push is performed.
