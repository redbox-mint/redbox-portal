# P0 environment, release and support decisions

P0 decision record: **2026-10-19, Adelaide**; human dispositions updated **2026-10-20**. Implementation assessment only; human release/topology approvals remain
pending. See [upstream snapshot](capabilities.json) for command arrays, timestamps, HTTP status, excerpts and response
hashes.

## Historical P0 capture — before P0R and adoption

| Item                      | Observed baseline / decision                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production source         | `441d87304cbb820ead569a9fcab405f112de0701`; P0 changes only discovery fixtures/spec/evidence. Model declarations unchanged from pilot `f6668358…` and design baseline `79c116fe…`. Capture sourceCommit records the local discovery checkpoint separately.                                                                         |
| Host execution            | Node 24.18.0 / npm 12.0.2; installed scripts and read-only registry queries only. **No install, manifest or lock edits**. Any later lock maintenance must use npm **11.20.0** and exact pins.                                                                                                                                      |
| Actual capture resolution | Sails 1.5.18 from the core fixture's module ancestry; root declared/installed Sails is 1.5.17. ORM hook 4.0.3, Waterline 0.15.2, sails-mongo 2.1.2. Capture native driver 7.7.0; sails-mongo resolves driver 6.3.0; storage package resolves driver 7.2.0. Do not collapse these into one supported-driver claim.                  |
| Server                    | MongoDB **8.0.34**, FCV **8.0**, standalone, no auth, unique disposable container/random loopback port; two synthetic databases. Digest `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`. Not a production auth/TLS/failover qualification.                                                               |
| Prisma CLI                | `prisma` npm latest **8.0.0-rc.23**; no nonprerelease 8.0 version in current registry. Official release status: RC. Upstream engines: Node 22.18+ on 22, 24.11+ on 24, or 26+; TypeScript 5.9+. Exact registry expression is archived in capabilities.json. This is upstream metadata, not a new dependency range.                 |
| Independent Mongo runtime | `@prisma/orm-mongo` latest **8.0.0-rc.18**, official **early access**. Historical suffix-free 0.16/0.17 do not establish supported stable ORM 8 Mongo. **G-STABLE closed**. Recheck independently at P6 and any promotion/release.                                                                                                 |
| Prisma Mongo transactions | Official docs explicitly say no `db.transaction`; actual runtime probe reports `undefined`. Docs' shared-driver session example executes driver writes, not Prisma transactional operations. **G-TX closed**, even on a replica set.                                                                                               |
| Relationships/routing     | Explicit physical membership-edge model and two belongsTo includes read successfully, including dangling edges. One `dbName` routes a whole client; second client on storage reads no core users. No cross-db include/transaction proof. No nested Mongo writes. Included raw related fields require explicit safe DTO projection. |
| Alternative maturity      | MikroORM core/mongodb latest 7.2.5; current official Mongo documentation describes transactions requiring replica set and transaction APIs. No installation, physical compatibility, packaging, multi-database session or performance qualification performed.                                                                     |
| Node deployment matrix    | Pilot Node 24/26 package evidence remains bounded by its final review. This P0 ran only host Node 24.18.0. Future exact stable versions require renewed clean packages/images on supported Node 24/26 releases; no claim that every minor is supported.                                                                            |

## Human decisions — 2026-10-20 (binding task direction)

Recorded verbatim in substance from the user; these supersede the corresponding
pending dispositions in the historical P0 table above/below, without inventing
formal release or operations approval:

- **ARCH-01 / G0R: ACCEPT ADR0003.** Following the authorized P0R re-evaluation,
  the user accepted ReDBox-owned repositories/domain operations over the official
  MongoDB Node driver, without an ORM, for all remaining groups. Transaction-free
  P1/C2 implementation is authorized. G0 remains HOLD for the other decisions.
- **OPS-TX-01: replica-set/sharded topology requirement is NOT DECIDED yet.
  G-TX stays blocked on it. Do not switch repo dev/test/CI stacks.** P0R's
  disposable single-node replica set is spike-only, not a support-policy change.
- **BRAND-TX-01: REQUIRE SAME DEPLOYMENT** — supported configuration has both
  logical databases (`mongodb` and `redboxStorage`) on one transaction-capable
  deployment so one client/session can transact across them; separate-server
  installs keep branding on Waterline until they consolidate. **No history
  relocation.** This records the routing requirement, not OPS-TX-01 approval.
- **OPS-BUDGET-01 / OPS-ROLLBACK-01: PROVISIONAL FOR NEXT** — accept P0's proposed
  budgets and use a built image of each group's pre-change commit as the rollback
  artifact for `next` promotions; formal operations approval required only for
  official releases. Each promotion still records its actual immutable image
  digest, matching data/assets checkpoint and successful rehearsal. No image
  was built by this decision record.
- **REL-01 approved cache sub-decision:** move cache to the driver through C2,
  revising official v6 to driver-repository cache. Qualify before a separate
  promotion commit, then remove Prisma. The current default remains Prisma.
  **REL-01 release scope/date, SEC-01 and INST-01 remain open.**

## Explicit topology prerequisite before G-TX

**Decision needed: OPS-TX-01.** The operations/deployment lead is accountable for the supported transaction topology
policy, co-reviewed by architecture/security; the release owner accepts scope/timing, and each institution's deployment
owner approves conversion of its infrastructure. No named individual or approval has been supplied. This record assigns
responsible roles without inventing sign-off.

MongoDB standalone does **not** support multi-document transactions. A replica set or sharded cluster is a separate
prerequisite from official-driver API support.
[MongoDB production considerations](https://www.mongodb.com/docs/v8.0/core/transactions-production-consideration/) and
[standalone conversion guide](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/) are
captured in capabilities.json. The negative driver probe on standalone 8.0.34 rejected with the recorded
retryable-writes deployment message, despite retryWrites:false. No fabricated server code 20 or rollback success is
reported.

Checkout inspection finds standalone 8.0.34 in `support/development/docker-compose.yml`, all Mongo services in
`support/integration-testing/docker-compose*.yml`, `support/acceptance-testing/docker-compose.yml`, the deployment
example and CircleCI storage/Figshare Mongo jobs. Pilot live qualification also used standalone; its P6 source-volume7→8
harness does not qualify replica sets. None configures `--replSet` or initiation. This is **a deployment/support
change** for standalone institutions, not a small URI option or inherited pilot proof.

Before opening G-TX the owners must deliver and review:

1. **Institution conversion:** inventory actual server placement/core+storage database routing, credentials/TLS/DNS,
   downtime/maintenance window, backups, disk/oplog capacity, rollback checkpoint and approved conversion plan. Separate
   Mongo deployments for branding history/core must be co-located on one transaction-capable deployment by an explicit
   institution decision or B remains blocked. No collection relocation is authorized by P0.
2. **Dev/test/CI:** isolated replica-set stacks, deterministic initiation/primary readiness, routable replica member
   hostnames, appropriate auth/keyfile/TLS configuration, driver URI parity and clean teardown. Exercise cross-db
   participants, mid-write abort, conflicts and unknown commit using the **supported official-driver API**, fallback disabled, after OPS-TX-01 approval.
   Keep standalone tests for transaction-free compatibility/refusal. No stack was built in P0 because none is required
   for its negative prerequisite evidence.
3. **Single-node replica set policy:** one member can supply a transactional development topology, but it provides **no
   redundancy or automatic failover**. It must not be represented as HA or proof for supported multi-node/sharded
   production deployments. Operations must decide if any production institution may use it and document
   outage/durability/majority-write limitations, oplog, recovery, monitoring, and required multi-node qualification
   separately.
4. **Backup/upgrade/restore:** topology-aware consistent backups/oplog and external-asset checkpoints, matching MongoDB
   8/FCV 8 restore, member/key/DNS configuration, primary election/restart, pending migration exclusion and
   prior-artifact restore rehearsals. Record engine/FCV upgrade sequencing and compatibility of the previous app
   artifact. Replica-set conversion is not reversed by an application selector; no old-engine downgrade promise. Update
   operator/support runbooks and deployment examples before adoption.

## Release, rollback and owner decisions

| ID / accountable role                                    | Recorded disposition / remaining decision                                                                                                                                                                                                                      | Blocks                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| REL-01 release owner                                     | **2026-10-20 approved sub-decision:** official v6 driver-repository cache through C2; retain Prisma default until separate promotion, then remove Prisma. Pilot P7 remains blocked. Other release scope/date and fallback timing remain open.                  | Official retirement/full release; P0.7 acceptance.                      |
| ARCH-01 architecture owner                               | **2026-10-20: user ACCEPTED [ADR0003](../adr/0003-orm-reevaluation.md).** ReDBox-owned official-driver repositories selected; G0R PASSED. Transaction-free P1/C2 authorized.                                                                                   | Architecture decision closed; G0 still needs other owner decisions.     |
| OPS-TX-01 deployment/operations lead                     | **2026-10-20: NOT DECIDED.** Replica-set/sharded support and single-node policy remain open; do not switch repo dev/test/CI stacks. P0R disposable replica set is spike-only.                                                                                  | G-TX independently of backend capability.                               |
| BRAND-TX-01 architecture + institution deployment owners | **2026-10-20: REQUIRE SAME DEPLOYMENT.** Both logical databases on one transaction-capable deployment/client/session; separate-server installs keep branding on Waterline until consolidation. No history relocation. P0R proves bounded cross-db feasibility. | B per-institution consolidation and full G-TX qualification.            |
| SEC-01 security + vocabulary + storage domain owners     | Agree [atomicity/effects](atomicity-effects.md), U↔S authorization and audit boundary, callback/postcommit recovery, direct entry self-parent quirk and I18n/RDMP decisions.                                                                                   | Affected groups, P0.5 acceptance.                                       |
| OPS-BUDGET-01 operations + each domain owner             | **2026-10-20: PROVISIONAL FOR NEXT.** P0 proposed [budgets](postgresql-readiness-budgets.md) accepted for `next`; actual group measurement/compliance still required. Formal operations approval only for official releases.                                   | Measured group promotion evidence; official approval remains open.      |
| INST-01 institution hook/query maintainer                | Supply representative custom IDs/columns/datastores/callbacks, stored queries, archive/legacy rich BSON and pending migrations. Bundled storage definitions and pilot hook fixture are not certification of private deployments.                               | Affected group's adoption.                                              |
| OPS-ROLLBACK-01 operations + release owner               | **2026-10-20: PROVISIONAL FOR NEXT.** Use a built image of each group's pre-change commit for `next` promotion rollback; record actual digest/data/assets checkpoint and rehearse. Formal operations approval only for official releases.                      | Built artifact/rehearsal per promotion; official approval remains open. |

### Per-group checkpoint record

For P0 the **candidate source checkpoint for every group** is `441d87304cbb820ead569a9fcab405f112de0701`: pre-programme
behavior with completed pilot. It is an exact source designation, **not a built image digest or a rehearsed rollback
artifact**. For `next`, the user's 2026-10-20 decision designates a built image of each
group's pre-change commit; record its actual immutable digest and rehearse at
cutover. Formal operations approval is required only for official releases. No P0 compatibility campaign against those future artifacts exists.

| Group | Data/assets that must be checkpointed and preserved for prior-artifact rehearsal                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C     | cacheentry BSON/indexes and notification/preview behavior; retain pilot selector until its stable/P7 retirement.                                                                                                     |
| M     | migration entries plus pending body list, exclusion window and body-touched databases/assets; never replay logged bodies.                                                                                            |
| R     | all eight definitions, related brand/form/workflow data, stored query expressions and institution hook version.                                                                                                      |
| Q     | AppConfig duplicates/order, secret reference versions (no plaintext), locks/owner policy, dashboard revision/provenance, I18n projection snapshot. AWS restoration is independent.                                   |
| J1    | in-progress and completed status rows, worker schedules/drain checkpoint.                                                                                                                                            |
| J2    | run/chunk/event lineage, dedup/attempt indexes, source offsets and counters; external source replay position.                                                                                                        |
| J3    | event/attempt data, redacted destinations/config, live claim tokens/expiry and SIEM retry/drain position.                                                                                                            |
| J4    | sync state, source-record intent generations, receipts/bindings, remote article identity and dispatch drain; do not recreate remote articles on restore.                                                             |
| U     | user/link/audit/path/workspace records and exact membership junction, credential/token protection, corresponding storage authorization checkpoint.                                                                   |
| V     | all seven collections, source snapshots/run latch, hierarchy and mapping/approval revisions, remote source version.                                                                                                  |
| B     | both datastore snapshots at one consistent point, history/active version/CAS, font/logo/file assets; prior typeface pruning may be irreversible without bytes.                                                       |
| S     | active/tombstone/permanent identity, record/integration audits, schema artifacts/references, attachments/journal and GridFS/FS/S3 bytes; queue/session ownership and external indexes need explicit recovery policy. |

The pilot's load-sensitive unchanged 12-second source-loading timeout and Solr-before-ready bootstrap issue remain
separate qualification concerns. P0 neither reran the full portal suite nor marks those issues resolved. No release,
topology conversion, container belonging to another task, or institution data was changed.

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
The current cache default remains Prisma until that promotion. P7/G7 are not
passed by this decision; release scope/date otherwise remain open.

**G0 remains HOLD:** architecture and cache direction approved; BRAND-TX-01
requires the same deployment; OPS-BUDGET-01/OPS-ROLLBACK-01 are provisional for
`next`. REL-01 scope/date, SEC-01 and INST-01 remain open. The user explicitly
authorizes transaction-free P1 and C2 implementation/qualification while these
remain open. This is not full-graph promotion or official release approval.

**OPS-TX-01 remains undecided / G-TX CLOSED.** U/V/B and atomic S remain
operationally blocked. Do not switch repository dev/test/CI stacks to replica
sets. Disposable replica-set driver feasibility spikes are permitted; they do
not supply deployment approval. Preserve all physical/group/interop/rollback/
security requirements and deferred cache behavior.
