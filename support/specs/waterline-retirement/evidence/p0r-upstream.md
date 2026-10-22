# P0R upstream research — ORM re-evaluation

Date: **2026-10-20 (Australia/Adelaide)**. This is primary-source research for
[ADR0003](../adr/0003-orm-reevaluation.md), not an architecture approval or an
executable compatibility result. The timestamped registry metadata, release
excerpts, source hashes and transaction-roadmap issue/comment are archived in
[p0r-upstream.json](p0r-upstream.json). Runtime and physical-data conclusions must
come from [P0R validation](../p0r-validation.md), not this document.

Read first: root `AGENTS.md`, [ADR0002](../adr/0002-full-model-prisma-suitability.md),
[P0 capabilities](capabilities.json), the programme design/plan/tasks, and wiki
[architecture](../../../wiki/Architecture-Overview.md),
[services](../../../wiki/Services-Architecture.md),
[loader](../../../wiki/Redbox-Loader.md),
[coding standards](../../../wiki/Coding-Standards-and-Conventions.md) and
[cache persistence](../../../wiki/Cache-Persistence.md). This research changes no
root/core dependency, lockfile, container, deployment or hook registration.

## Exact versions available at the checkpoint

All values below were retrieved from the owning npm registry and checked against
official release records where available. An npm `latest` tag is not itself proof
of production stability. Declared engine compatibility does not replace the
requested Node 24.16 / 26.11 packed-install tests.

| Candidate              | Exact spike version                                    | Published UTC | Licence    | Declared Node / TypeScript / module facts                                                                                                                                         |
| ---------------------- | ------------------------------------------------------ | ------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------- | --- | ---------------------- |
| Prisma 8 CLI           | `prisma@8.0.0-rc.23`                                   | 2026-10-15    | Apache-2.0 | Node `^22.18.0                                                                                                                                                                    |     | ^24.11.0 |     | >=26.0.0`; native ESM. |
| Prisma Mongo runtime   | `@prisma/orm-mongo@8.0.0-rc.18`                        | 2026-10-14    | Apache-2.0 | Peer `mongodb ^7.0.0`, TypeScript `>=5.9`; native ESM. Independent CLI/runtime version numbers are intentional.                                                                   |
| MikroORM               | `@mikro-orm/core@7.2.5` and `@mikro-orm/mongodb@7.2.5` | 2026-10-09    | MIT        | Node `>=22.17.0`; TypeScript 5.8+ per migration guide; native ESM consumable from CommonJS using `require(esm)` and NodeNext. Mongo driver dependency is exactly `mongodb 7.7.0`. |
| Direct official driver | `mongodb@7.7.0`                                        | 2026-09-28    | Apache-2.0 | Node `>=20.19.0`; CommonJS entry point; bundled TypeScript declarations, public types checked against TypeScript 5.6.0.                                                           |
| Mongoose               | `mongoose@9.11.2`                                      | 2026-10-12    | MIT        | Node `>=20.19.0`; CommonJS, bundled TypeScript bindings; dependency `mongodb ~7.7`.                                                                                               |

Sources: npm registry metadata for [Prisma][N1], [Prisma Mongo][N2],
[MikroORM core][N3], [MikroORM Mongo][N4], [driver][N5] and [Mongoose][N6];
[Prisma release status][P1], [MikroORM v7 migration][M2], [driver README][D4].
The spike manifests must pin these direct versions exactly and use their own
npm 11.20.0 locks; the upstream dependency ranges shown above describe upstream
packages, not permission to put ranges in ReDBox manifests.

The official driver 7.7.0 README states MongoDB Server 4.4+ support, including
the spike's MongoDB 8.0 family; Mongoose's own compatibility table explicitly lists
MongoDB 8.x with Mongoose 9.x. MikroORM documents an actively supported Mongo
driver, using that same exact 7.7.0 official driver. These support statements
still need the physical/runtime spike.[D4], [S5], [N4]

No stable Prisma 8 CLI or stable `@prisma/orm-mongo` release was present in the
registry at this checkpoint. The `latest` pair is unchanged from P0; newer `dev`
builds are still prereleases. The stable historical CLI is `7.10.1`, whose release
does not qualify the separate new Prisma 8 Mongo runtime. MikroORM, the official
driver and Mongoose publish their selected releases without prerelease status;
their recent official patch/release records establish continuing activity, not a
promise that every ReDBox use is supported.[P1], [R1], [R2], [R3], [R4]

## Transaction support and the roadmap distinction

**Prisma 8 remains unsuitable for the programme's required ORM transaction
boundary today.** Its official transaction page says there is no
`db.transaction(...)` on the Mongo client. It suggests sharing a `MongoClient`
and performing the transactional writes through the driver. That client sharing
does not enlist `db.orm` calls in the driver's session.[P2], [P3]

There is now explicit, dated roadmap evidence: the official repository's generated
Mongo quick reference says `db.transaction(...)` is planned under internal
**TML-2313** and the facade does not expose it. Issue **#30765** is open, created
2026-10-18, with no milestone at capture. Its 2026-10-19 contributor response links
the source and explicitly notes that `db.orm` calls accept no session; only raw
driver writes participate in that workaround.[P4], [P6] The runtime README likewise
says each activity is finalized immediately because the Mongo runtime has no
transactions.[P5] Prisma's overall GA expectation is October 2026; this is **not a
promised Mongo transaction delivery date**, stable Mongo support announcement or
a basis for opening G-TX.[P1]

**MikroORM has supported Mongo transactions**, documented through
`em.transactional()`; implicit transactions are disabled for Mongo by default.
The Mongo guide requires a replica set and recommends creating collections
explicitly before work. That recommendation does not authorize ReDBox startup
schema/index changes.[M1] Exact v7.2.5 source passes the transaction's `ClientSession`
to its native operations. However, `MongoConnection.transactional()` performs one
begin/callback/commit, or rollback, and ends the session. It does **not** implement
the driver's `withTransaction()` callback retry loop. Do not assume automatic
replay of write conflicts or full ambiguous-commit recovery from the generic ORM
transaction documentation.[M3], [M4]

**The official driver implements the needed primitive directly:**
`MongoClient.startSession()` plus `ClientSession.withTransaction()`, with the same
session explicitly passed to every operation. Its convenient API retries
`TransientTransactionError` transactions and `UnknownTransactionCommitResult`
commits. Its core API requires application error handling. Callbacks may run more
than once, so remote effects, emails and file writes must remain outside the
callback or have deliberate idempotence/recovery. Errors must propagate; swallowing
a server error can cause repeated transaction attempts. Parallel operations inside
one transaction are unsupported.[D1], [D2]

**Mongoose has supported Mongo transactions** through `session.withTransaction()`
or `Connection.transaction()`. The latter wraps the driver's convenient API and
resets Mongoose document change tracking after abort/retry. Exact v9.11.2 source
confirms that delegation; this is stronger retry evidence than merely finding a
`transaction()` method.[S1], [S2]

## Branding across two logical databases

MongoDB's own manual explicitly supports transactions across databases and gives
a Node example using `client.db('mydb1')`, `client.db('mydb2')` and one session.[D5]
The driver rejects passing a session from a different `MongoClient`, even when the
two clients use the same server URI.[D1] This supports BRAND-TX-01's same-deployment,
one-client/session requirement; it supplies no cross-server transaction mechanism.
Topology approval remains a separate human/operations prerequisite.

- **Direct driver:** two `Db` handles from one client are the documented design;
  no data/history relocation is required.[D5]
- **Mongoose:** `Connection.useDb()` creates database-specific connections sharing
  the underlying client; exact v9.11.2 source assigns `newConn.client = _this.client`.
  Pass the same session explicitly to operations on both models. Two independent
  `createConnection()` pools are not equivalent. Cross-database _populate_ is also
  documented, including across separate servers; that read facility must not be
  mistaken for cross-server transactional capability.[S3], [S7]
- **MikroORM:** exact Mongo connection source chooses `config.dbName` for all
  collection accesses. It can reuse an external client through `driverOptions`
  and exposes that client, but there is no demonstrated per-entity Mongo database
  routing in those methods. Two configured managers/ORM instances sharing one
  client and one explicit session/context need the executable spike; a native
  second-database write is not proof of ORM-to-ORM enlistment. Connection `close()`
  also closes that borrowed client, requiring deliberate shared lifecycle ownership.[M3]
- **Prisma:** a client likewise receives one `dbName`; the absence of an ORM session
  API prevents an ORM-to-ORM branding transaction. Writing both sides only through
  the driver would select a direct-driver operation, not fix the Prisma API gap.[P3], [P4]

## Physical mapping, relationships and native operations

MikroORM documents `_id: ObjectId` with optional virtual `id: string`, but its Mongo
many-to-many default stores an owning-side **array of identifiers**, not a pivot
collection. Therefore `role_users__user_roles` must be an explicit edge entity
with its real ObjectId `_id`, `user_roles` and `role_users`; generic many-to-many
mapping must not rewrite it. Native `insert`/`nativeUpdate`/`nativeDelete` operations
bypass hydration and lifecycle hooks.[M1] Request/entity-manager scope, identity-map
invalidation after raw/CAS writes, timestamp field types, unknown fields and
null/missing semantics all remain executable obligations.

Mongoose is included as a serious control because it is stable, Mongo-focused,
TypeScript-capable, CommonJS and transaction-aware. It supports references and
populate, including cross-database models.[S4], [S7] For existing Waterline data,
explicit collection names and an explicit edge model avoid implicit naming/array
changes. Default strict mode strips fields not in the schema from writes;
`versionKey` adds `__v`, and automatic timestamps use their own date policy.
Those defaults need deliberate configuration (for example `strict: false`,
`versionKey: false`, no automatic date timestamps), followed by physical-document
assertions. This is not a reason to change existing string timestamps.[S6]

A direct driver repository performs reads/patches against exact collection/key
names and offers native filters, `$set`/`$unset`, CAS predicates,
`findOneAndUpdate`, indexes and cursor APIs without ORM translation. ReDBox must
own BSON/string ID conversion, validation, projections, relationship batching,
legacy defaults/errors and domain operations. Driver generics are useful but not
complete validation: default dot-notation filters are not fully type-safe;
projection result types and recursive structures have documented limits.[D3]
No documentation substitutes for the real-fixture unknown-field/junction tests.

All candidates can coexist with driver-owned GridFS and native modules when client
and close ownership are explicit. The driver exposes `GridFSBucket` and streaming
APIs.[D6] **GridFS does not support multi-document transactions**; coexistence must
not be reported as transactional file atomicity.[D7] CAS/leases and indexes may
use private native operations behind the repository seam, but an ORM candidate's
required transactional writes must prove actual session enlistment.

## Packaging, extension and PostgreSQL implications

MikroORM's ESM packaging is not by itself a request for a portal module conversion:
its official v7 guide explicitly supports CommonJS consumers on modern Node and
TypeScript using `require(esm)` and `moduleResolution: nodenext`.[M2] ReDBox already
uses NodeNext with CommonJS package semantics. Prisma's emitted contract and
independent ESM runtime remain extra artifacts/lifecycle concerns; the completed
pilot proves its bounded cache packaging, not full-graph readiness. Mongoose and
the driver publish CommonJS entry points.[N1], [N2], [N3], [N5], [N6] Compile, offline build,
clean packed install, Node-version tests and startup/memory measurements belong to
P0R's runnable evidence. No startup or memory ranking is inferred here.

ReDBox hooks currently override model/service registrations and bootstrap through
the loader. The existing cache guidance already requires lazy repository resolution
and says Prisma does not execute Waterline callbacks. None of these candidates
can automatically replay institution Waterline callbacks, custom identity rules
or partial-update behavior. Plain DTO repositories and explicit domain operations
must remain the supported extension boundary; ORM/driver entities, sessions and
query builders should remain private. Replacing Waterline with an ORM's hook
system would still be a migration requiring institution-specific evidence.

MikroORM provides the most direct **shared ORM tooling** for a later PostgreSQL
adapter: its supported backends include PostgreSQL and Mongo, and both use its
metadata/unit-of-work patterns.[M5] Prisma also has a PostgreSQL library but
intentionally different families/contracts and differing relation/transaction
features.[P2] Neither carries Mongo BSON IDs, null/missing, string timestamps,
collation, pipelines, GridFS, implicit edge behavior or two Mongo databases into
PostgreSQL unchanged. Mongoose and the official Mongo driver provide no
PostgreSQL adapter. A ReDBox-owned repository/domain boundary is the useful
investment common to all choices; a future SQL implementation and data migration
remain separate work, including the treatment of cross-database branding.

## Research conclusion for ADR0003

The strongest upstream case for **proposing retained ReDBox repositories over the
official driver** is that the mature, already-used Mongo driver directly provides
the exact sessions, cross-database routing and native operations the programme
needs. It removes waiting for Prisma's undated transaction work, while retaining
all behavioral, topology, operational and group acceptance gates. The cost is
ReDBox-owned mapping/relationships/validation and a separate future SQL adapter.
The runnable spikes must decide whether that cost is preferable in this codebase.

MikroORM remains the strongest general ORM alternative, particularly if shared SQL
metadata becomes a concrete requirement; its unit of work, explicit legacy edge,
shared-client lifecycle and transaction retries are real integration costs to
measure. Mongoose merits the bounded comparison but adds another schema,
casting/hook/document layer without PostgreSQL support. Prisma retains its cache
pilot value but its current release/maturity and missing ORM transactions cannot
qualify the whole programme. Any recommendation to replace the pilot's adapter
must preserve `CacheEntryRepository` and undergo separate cache parity/packaging
qualification; this research performs no adapter replacement.

This is a **proposal rationale**, not ARCH-01 approval. If accepted, G-STABLE should
qualify the selected stable backend rather than require stable Prisma packages;
G-TX should require supported transactions through the selected backend and exact
shared-client/session propagation. OPS-TX-01 and institution topology approval stay
blocked, and the spike's disposable replica set does not authorize changes to
repository development/test/CI stacks. Production failover, unknown-commit
outcomes, private hooks, operations approval for official releases, REL-01,
SEC-01 and INST-01 remain outside an upstream library fact check.

## Primary-source references

[N1]: https://registry.npmjs.org/prisma
[N2]: https://registry.npmjs.org/@prisma%2form-mongo
[N3]: https://registry.npmjs.org/@mikro-orm%2fcore
[N4]: https://registry.npmjs.org/@mikro-orm%2fmongodb
[N5]: https://registry.npmjs.org/mongodb
[N6]: https://registry.npmjs.org/mongoose
[P1]: https://www.prisma.io/docs/orm/release-status
[P2]: https://www.prisma.io/docs/orm/supported-databases
[P3]: https://www.prisma.io/docs/orm/fundamentals/transactions#transactions-on-mongodb
[P4]: https://github.com/prisma/orm/blob/e18525ac2840668c77d2d0a8f27f5a282afc30b9/packages/1-framework/3-tooling/cli/src/commands/init/templates/quick-reference-mongo.md#L92-L100
[P5]: https://github.com/prisma/orm/blob/e18525ac2840668c77d2d0a8f27f5a282afc30b9/packages/2-mongo-family/7-runtime/README.md
[P6]: https://github.com/prisma/orm/issues/30765#issuecomment-6257534764
[M1]: https://mikro-orm.io/docs/usage-with-mongo
[M2]: https://mikro-orm.io/docs/upgrading-v6-to-v7
[M3]: https://github.com/mikro-orm/mikro-orm/blob/v7.2.5/packages/mongodb/src/MongoConnection.ts
[M4]: https://github.com/mikro-orm/mikro-orm/blob/v7.2.5/packages/mongodb/src/MongoEntityManager.ts
[M5]: https://github.com/mikro-orm/mikro-orm/blob/v7.2.5/packages/core/package.json
[D1]: https://www.mongodb.com/docs/drivers/node/current/crud/transactions/
[D2]: https://github.com/mongodb/node-mongodb-native/blob/v7.7.0/src/sessions.ts
[D3]: https://www.mongodb.com/docs/drivers/node/current/typescript/
[D4]: https://github.com/mongodb/node-mongodb-native/blob/v7.7.0/README.md
[D5]: https://www.mongodb.com/docs/manual/core/transactions/
[D6]: https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/
[D7]: https://www.mongodb.com/docs/manual/core/gridfs/
[S1]: https://mongoosejs.com/docs/transactions.html
[S2]: https://github.com/Automattic/mongoose/blob/9.11.2/lib/connection.js
[S3]: https://github.com/Automattic/mongoose/blob/9.11.2/lib/drivers/node-mongodb-native/connection.js
[S4]: https://mongoosejs.com/docs/typescript.html
[S5]: https://mongoosejs.com/docs/compatibility.html
[S6]: https://mongoosejs.com/docs/guide.html
[S7]: https://mongoosejs.com/docs/populate.html#cross-db-populate
[R1]: https://github.com/prisma/orm/releases/tag/v8.0.0-rc.18
[R2]: https://github.com/mikro-orm/mikro-orm/releases/tag/v7.2.5
[R3]: https://github.com/mongodb/node-mongodb-native/releases/tag/v7.7.0
[R4]: https://github.com/Automattic/mongoose/releases/tag/9.11.2
