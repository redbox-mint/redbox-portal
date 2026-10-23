# P0R — choose ReDBox repositories over the official MongoDB driver

Status: **ACCEPTED — G0R PASSED**. Decision date: **2026-10-20,
Australia/Adelaide**. Decision owner: **user**. Supersedes ADR0002's Prisma
investigation direction; retains its physical/security/release constraints.
G0 remains **HOLD**, G-TX **CLOSED / OPS-TX-01 undecided**; since 2026-10-22
TX-PARITY-01 removes G-TX as a migration gate (see below). The user authorizes
transaction-free P1/C2 implementation without approving gated group promotion.
REL-01's approved cache sub-decision replaces the v6 Prisma-only contract with
**driver-repository cache**; scope/date otherwise remain open.

## Recommendation

Use **ReDBox-owned repositories/domain operations implemented directly with the
official MongoDB Node driver**, initially evaluated at **7.7.0**. Keep Sails and
the planned per-group Waterline transition. Do not introduce another ORM or a
generic query/CRUD facade. BSON, filters, sessions, clients and cursors remain
private to concrete Mongo implementations; public contracts remain plain DTOs,
opaque IDs, domain operations and explicit outcomes.

The driver meets the actual physical and transactional requirements with the
least extra translation in this codebase: exact legacy edge documents, two
database handles on one client/session, conditional writes, leases, cursors and
GridFS already feature heavily in P0's native-owner inventory. It also supplies
the supported transaction/retry primitives Prisma lacks today. This is a
deliberate architecture choice, **not** driver writes disguised as Prisma
transactions or an exception to the existing gate.

MikroORM is a viable stable ORM alternative, with the strongest shared ORM
tooling for a future PostgreSQL adapter. Its useful mapping/transaction APIs did
work, after explicit edge metadata, DTO projection, identity-map refresh,
separate database context names and application conflict retry. Those costs
bring little demonstrated benefit to the programme's substantial existing
native Mongo protocols. Mongoose also works and is included as a credible stable
TypeScript ODM control; it adds casting/schema/document semantics and gives no
PostgreSQL adapter. Neither is rejected for an imagined packaging incompatibility.

## Evidence and comparison

The [validation record](../p0r-validation.md) is the command/result authority.
[Runnable spikes](../../../spikes/orm-reevaluation/README.md) use selected
unchanged raw P0 documents, a disposable **MongoDB 8.0.34 / FCV 8.0** single-node
replica set, isolated exact dependency pins and their own **npm 11.20.0** lock.
Docker Node **24.16.0 / 26.11.1**, TypeScript **5.9.3**, NodeNext/CommonJS,
offline generation/build/import and installed tarball execution are exercised.
See [primary-source research](../evidence/p0r-upstream.md) and its timestamped
[source archive](../evidence/p0r-upstream.json) for support/maturity/roadmap claims.

| Requirement / observed result                                                      | Prisma 8 CLI rc.23 / Mongo rc.18                                                                                         | MikroORM core + Mongo 7.2.5                                                                                                                                  | Repositories + driver 7.7.0                                                                                               | Mongoose 9.11.2                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Current maturity / licence                                                         | CLI RC, Mongo early access; Apache-2.0. Still no stable 8 pair.                                                          | Stable releases; MIT; current Mongo driver supported.                                                                                                        | Stable official Mongo driver; Apache-2.0; already the core's exact direct dependency.                                     | Stable Mongo ODM; MIT; TypeScript declarations and current Mongo support.                |
| Existing ObjectId IDs / string times / numeric values                              | PASS, typed emitted contract and explicit string timestamp fields.                                                       | PASS, ObjectId metadata and explicit string fields; no Date timestamp automation.                                                                            | PASS, adapter-local ObjectId codec and unchanged physical values.                                                         | PASS, explicit collection/schema; no automatic Date timestamps or `__v`.                 |
| JSON falsy/null / physically missing                                               | PASS values; absent optional JSON reads **null**. Patch leaves physical absence intact.                                  | PASS values; absent JSON reads **null**; refresh required after native updates.                                                                              | PASS values; missing remains absent.                                                                                      | PASS values; lean missing remains absent.                                                |
| Unknown fields on partial update                                                   | Preserved by `updateAndCount`.                                                                                           | Preserved by `nativeUpdate`; not blanket certification of every managed flush.                                                                               | Preserved by explicit `$set`.                                                                                             | Preserved by schema-aware `$set`; not blanket certification of every save/replacement.   |
| Belongs-to / has-many reads                                                        | Belongs-to includes work; has-many DTO assembled explicitly in this spike.                                               | Actual many-to-one / one-to-many population works, plus plain DTO assembly.                                                                                  | Explicit batched DTO reads; relationship queries are ReDBox's responsibility.                                             | Ref/virtual population works, plus lean/plain DTO assembly.                              |
| Actual Waterline membership shape                                                  | Explicit edge contract; add duplicate/remove/replace/populate PASS.                                                      | Explicit edge entity, **not** default Mongo many-to-many arrays; PASS.                                                                                       | Exact `_id`, `user_roles`, `role_users` ObjectIds; PASS.                                                                  | Explicit edge model; PASS.                                                               |
| Multi-document commit / injected rollback / visibility                             | **UNSUPPORTED**; transaction property is undefined.                                                                      | PASS through `em.transactional`; no native-driver substitution.                                                                                              | PASS through `withTransaction`.                                                                                           | PASS through `Connection.transaction`.                                                   |
| Real server write conflict / retry                                                 | **UNSUPPORTED**.                                                                                                         | PASS after application retry with fresh managers, bounded to 3, detecting label or server code 112.                                                          | PASS: convenient API replays callback; exactly 2 calls after 1 injected conflict.                                         | PASS: convenient API replays callback; exactly 2 calls after 1 injected conflict.        |
| Cross-database branding commit / rollback                                          | **UNSUPPORTED**, including with shared client.                                                                           | PASS with two named ORM contexts, common external client and explicit transaction context. Default same context name misrouted history in the initial probe. | PASS with two `Db` handles and one explicit session.                                                                      | PASS with `useDb()` models and one explicit session.                                     |
| Same client/session proof                                                          | No ORM session API.                                                                                                      | Monitored writes touch both DB names with one session hash and `autocommit:false`.                                                                           | Same proof.                                                                                                               | Same proof.                                                                              |
| Commit-disconnect recovery                                                         | **UNSUPPORTED**.                                                                                                         | **NOT QUALIFIED** for repeated disconnects; exploratory run stopped after 46 seconds without a result. No claim that core `commitTransaction` never retries. | Two injected commit disconnects recovered; one callback execution and durable committed data.                             | Same bounded recovery proof.                                                             |
| CAS / findOneAndUpdate lease / index inspect+ensure / bounded cursor+page / GridFS | PASS as explicitly labelled **native coexistence** on borrowed client. These do not prove ORM transactions.              | PASS as private driver operations on the shared client. Invalidate/refresh managed entities deliberately.                                                    | PASS directly, no additional persistence layer.                                                                           | PASS as private driver operations on the shared client. Avoid stale hydrated documents.  |
| Offline build / packed CJS execution on both Node versions                         | PASS; emitted JSON and compiled declarations included; CLI warns about TS source reparsing.                              | PASS using modern Node `require(esm)`; no package type conversion.                                                                                           | PASS.                                                                                                                     | PASS.                                                                                    |
| Connection/lifecycle work                                                          | Clients per logical DB can borrow one pool, but cannot enlist ORM operations.                                            | Per-DB contexts borrow pool; ORM `close()` closes borrowed client, so draining and ownership need care.                                                      | One app-owned client per compatible connection policy; explicit owned/borrowed closure.                                   | `useDb()` shares root client; close only after all DB users drain.                       |
| Hooks and future PostgreSQL                                                        | Contract tooling helps typing; callback/security migration remains. Separate PostgreSQL library is not data portability. | Best reusable SQL ORM tooling; still a separate SQL adapter, model design and migration. No Waterline callback parity by default.                            | Maximum explicit mapping/query/validation work owned by ReDBox; future SQL adapter separate. Plain boundary preserves it. | Mongo-only ODM; callback/casting migration still needed and future SQL adapter separate. |

All candidates preserve the duplicate-permitting junction in these tests. No new
pair uniqueness, referential cleanup, array storage, cascade or timestamps are
introduced. The selected snapshot intentionally contains a dangling target, and
population behavior is observed. These narrow metadata projections do not
certify User credential safety, institution callbacks or all 46 entities.

Native tests are deliberate private Mongo operations, not evidence that an ORM
supplies every operation. GridFS bytes coexist on the client **outside** the
transaction; MongoDB does not support GridFS inside transactions. File/AWS/Solr/
remote effects still need staged/postcommit recovery.

### Release and transaction roadmap

Prisma registry/official release status remains the pilot pair. Newer `dev`
builds do not satisfy G-STABLE. Mongo transaction work is explicitly tracked as
**TML-2313**, with official issue **#30765** open and no promised delivery date.
Official source says `db.orm` operations cannot accept a session. Neither the
overall ORM 8 GA forecast nor cache CRUD is evidence of forthcoming Mongo
transaction qualification. See the pinned references in the upstream note.

MikroORM/Mongoose/driver support is established by current official releases,
source and documentation, supplemented by these spikes. Stable package syntax
alone is not ReDBox production support or a qualification of arbitrary versions.

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

## Accepted plan and gate changes — effective 2026-10-20

1. **G0R:** PASSED by the user's acceptance. G0 remains HOLD for outstanding
   REL-01 scope/date, SEC-01, INST-01 and operational support decisions. P1/C2
   transaction-free implementation is explicitly authorized.
2. **G-STABLE for the programme:** require exact pinned supported stable official
   driver and its Node/Mongo compatibility matrix, clean packages/images,
   lifecycle/config/index/hook and affected regression evidence. Remove the
   requirement for a Prisma CLI/Mongo runtime from **new non-cache groups**.
   Do not equate the spike with those complete release checks. The official v6 cache contract now targets the driver under REL-01.
3. **G-TX:** supported transaction APIs of the selected backend, common compatible
   client/session for every participant, real supported-topology commit/abort/
   conflict/unknown-commit/cleanup proof, security/domain atomicity decisions and
   **OPS-TX-01 approval** remain mandatory. Driver feasibility removes waiting
   for Prisma's undated API. It does **not** open G-TX: deployment policy, real
   dev/test/CI qualification, production topology/failover/auth and recovery are
   still pending. Do not switch existing stacks while OPS-TX-01 is undecided.
4. **P1:** preserve plain repositories/getters, effective config parity,
   inspect/ensure, lazy app ownership and shutdown, hook migration and supported
   NodeNext/CommonJS packaging. Use explicit operation-specific codecs/mappings
   per package/datastore, two `Db` handles on a shared compatible pool where
   appropriate. Do not expand Prisma contract generation to every group. No
   generic model/query registry, new unit of work, per-model pools or implicit
   schema synchronization.
5. **P2–P5 and staged P10:** retain group allocation/order and Waterline baselines;
   substitute opt-in direct Mongo repositories for planned Prisma adapters.
   Keep group-specific interop, simultaneous mixed instances, index prep,
   callback/error/null/default/timestamp parity, restart, rollback and budgets.
6. **P6:** qualify the driver/session/topology boundary early, alongside P1 when
   approved, instead of waiting for a Prisma release. Keep P6.T **blocked**.
   P7/U, P8/V, P9/B and atomic S remain operationally gated. Atomic units cannot
   mix Waterline/driver writers. The U↔S dependency remains.
7. **Branding:** implement the user's **REQUIRE SAME DEPLOYMENT** decision with
   both logical DBs on one transaction-capable deployment/client/session.
   Separate-server institutions keep branding on Waterline until consolidation;
   no history relocation. Their B/full retirement remains incomplete, even if
   transaction-free groups can advance. OPS-TX-01 support remains a separate gate.
8. **C2/cache:** approved driver migration behind the existing four-operation
   interface. Qualify raw/bidirectional Prisma↔driver↔Waterline, simultaneous mixed
   instances, restart, cache/notification/preview, lifecycle/config/index/packed
   parity. Separate promotion commit; default stays Prisma until then. Remove
   Prisma adapter, contract generation/freshness, config, CLI/runtime dependencies
   and CI/Docker steps only after promotion and consumer verification. REL-01's
   v6 cache contract is now driver-repository cache; P7/G7 remain incomplete.
9. **P11/P12:** per-group retirement and no-Waterline/no-ORM final audit remain.
   Include Prisma artifacts/dependencies if C has been explicitly redirected.
   `next` budgets are provisionally accepted; each group's rollback artifact is
   a built image of its pre-change commit, with actual digest/checkpoint/rehearsal.
   Formal operations approval remains required for official releases.

## Trade-offs and re-decision triggers

ReDBox owns more codecs, explicit relationship batching, validators, safe
projections, query/index definitions and error translation. Do not turn that
work into a home-grown ORM. TypeScript driver types do not validate stored data;
reuse the pilot's plain JSON validation and add per-operation physical codecs.
Driver `withTransaction` may replay a callback, so external/postcommit work must
not accidentally execute twice. Persisted unknown outcomes require domain
idempotency/recovery, not blanket retry.

MikroORM's SQL support is a material tooling option **only if** a funded
PostgreSQL adapter becomes concrete. It cannot translate Mongo pipelines,
missing-vs-null, legacy BSON, GridFS, queues/sessions, duplicate/dangling edges,
indexes/collation or cross-database history ownership automatically. A separate
adapter/data-migration programme remains necessary for every candidate.

Return to an explicit architecture decision if:

- actual group implementation repeats substantial mapping/relation machinery
  and a measured MikroORM prototype removes more code than it adds while passing
  the same physical, retry, session and lifecycle contract;
- a concrete PostgreSQL scope demonstrates that shared ORM metadata materially
  reduces verified implementation/migration work;
- a supported stable Prisma Mongo runtime gains transactions/session propagation
  and beats the selected approach on the same fixtures and maintenance cost;
- topology support is rejected, institutions cannot consolidate branding, or
  required physical/custom-hook compatibility needs a rewrite or weakened
  atomicity; retain Waterline for the affected group and revise scope/timing;
- group operations, correctness/security, unknown-outcome recovery, immutable
  rollback, or provisionally accepted `next` budgets fail; or upstream driver
  support/security/licensing changes materially.

Open risks: OPS-TX-01; REL-01's v6/full-major scope/date; SEC-01's exact U↔S/audit/
callback/postcommit boundaries; INST-01's private mappings/queries/rich BSON and
pending migrations; real production recovery and operations qualification. The
spike is single-node/no-auth and small-fixture only. No gate is silently waived.

**Decision recorded:** the user accepted the driver direction and plan/gate
changes on 2026-10-20, including C2 and the revised v6 cache contract. Topology
approval, remaining release scope/date, security and institution acceptance stay open.
