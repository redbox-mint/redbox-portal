# Full-model persistence suitability and topology prerequisites

Status: **P0 implementation assessment recorded; full-graph Prisma approval HOLD**. Date: 2026-10-19 Adelaide.
Architecture/release/operations/security approval is pending. Extends the pilot's
[ADR0001](../../prisma-cache-persistence/adr/0001-cache-repository-and-prisma-evaluation.md); it does not replace cache
behavior, reopen deferred fixes, select another ORM, or authorize production adoption.

**Superseded in part, 2026-10-20 (decision owner: user):** accepted
[ADR0003](0003-orm-reevaluation.md) replaces the Prisma investigation/adoption
and Prisma-specific stable/transaction gate direction with official-driver
repositories, including C2/cache. Physical, security, topology, hook, recovery
and release limits below remain normative. This is the historical P0 assessment.

## Decision

Retain **ReDBox-owned plain repositories and storage/domain operations** as the programme boundary. Retain Waterline as
the behavior baseline/transition bridge. Continue Prisma 8 only as a bounded, transaction-free investigation target on
`next`. **Reject the currently pinned CLI 8.0.0-rc.23 / Mongo runtime 8.0.0-rc.18 as an operational full-graph
backend**: no supported Mongo transaction API and no stable Mongo release qualification. Cache CRUD success cannot
establish identity, approval, publication or storage atomicity.

G0 does not approve the full proposed implementation architecture. Independent Waterline seams, mapping/config/lifecycle
investigation and nontransactional spikes may proceed within their existing gates; promotion and connected model
retirement need their separate decisions. No implementation beyond P0 occurred. A future upstream release requires
renewed evidence, not an assumed gate opening.

## Evidence and new full-graph concerns

[Inventory](../evidence/inventory.json) allocates 40 core + 6 storage declarations exactly once.
[Actual Sails/Waterline capture](../evidence/waterline-mongo8.ejson) loads those sources on isolated standalone MongoDB
8.0.34/FCV 8.0; mappings, defaults, callbacks, raw documents/BSON types and safe-mode indexes are observed separately
from source index intent. It discovers generated `role_users__user_roles` **and `archive`**, so the declared 46 are not
the entire generated persistence surface. Private institution hooks/stored queries/historical archive data remain
unknown, owned adoption blockers.

The real membership collection has `_id`, `user_roles` and `role_users` ObjectIds, no pair uniqueness or model
timestamps. Duplicate/dangling edges are accepted; destroyed users/roles leave physical edges in the tested default
operations. Preserve this physical graph; do not convert it to arrays, impose uniqueness or infer cascades. The
read-only Prisma probe successfully represents it as an **explicit edge model with two belongsTo relations** and
includes both targets. This demonstrates bounded read feasibility, not graph mutation/security parity. Included raw
related fields can contain passwords despite a narrow contract; explicit safe DTO projection is mandatory.

Prisma official docs and [dated npm/source snapshot](../evidence/capabilities.json) confirm current ORM 8 RC/Mongo early
access; references/include supported, no nested Mongo writes and no Mongo include callback refinement. The observed
runtime's `transaction` property is undefined. Official Mongo transaction docs suggest driver-only writes in a shared
session: that pattern **fails the binding G-TX requirement for supported Prisma transactional operations**. Session
sharing cannot be inferred from using one MongoClient.

The [atomicity matrix](../evidence/atomicity-effects.md) identifies four actual TransactionUtils services,
nontransactional current fallback, cross-database branding and U↔S account authorization. Current fallback may leave
partial data; stronger required consistency is a deliberate programme requirement, not a claim that Waterline currently
provides it. Post-write access callbacks can fail after User persistence; remote/AWS/files/Solr and postcommit effects
remain separate.

The current `mongo({ mongoClient, dbName, contractJson })` routes **all models in one client to one database**. The
second-client routing probe sees no core users in storage. One aggregate core contract cannot route
BrandingConfigHistory by its Sails datastore. Correct the packaging proposal: package-level group source
modules/manifests are useful, but emit **private contracts/clients per owning package and logical datastore**; a client
receives only that datastore's models. Compatible clients may borrow one proven compatible pool. Cross-db relations use
explicit repository reads and safe DTO assembly. No per-model client, unintended collection creation, cross-db include
or transactional composition is assumed. A different packaging solution needs its own P1 proof.

## Alternatives against full-model requirements

| Concern                       | Prisma 8, exact current candidate                                                                                                                                                                                                        | MikroORM 7.2.5, documentation-only candidate                                                                                                                                                                                                                                           | Retained repositories + direct MongoDB driver                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing physical graph       | ObjectId mappings and explicit edge includes read successfully. No implicit junction rewrite authorized. No nested Mongo writes; mutation/population parity unqualified.                                                                 | Native ObjectId/serialized string mapping and relationship/population APIs documented. Mongo many-to-many defaults may use different physical storage: mapping exact duplicate-permitting edge collection needs an explicit edge entity/spike. No installation or compatibility proof. | Can target exact collection/keys and preserve duplicate/dangling edges explicitly. Relationship batching, ordering and DTO assembly become adapter code; no automatic integrity claim.                                                             |
| Required transactions         | **Unsupported**, binding failure. Driver-only sessions alongside Prisma are not a substitute.                                                                                                                                            | Mongo transactions documented; replica set required. Must prove exact supported APIs, native operation participation, abort/conflict/ambiguous commit and cross-db sessions. Documentation is not qualification.                                                                       | Driver sessions can transact across databases on one supported deployment/client/topology. This is a credible architecture re-decision, **not a waiver** of the current Prisma-specific G-TX. Must deliberately change decision/gates if selected. |
| Multiple datastores           | dbName per whole client, separate private clients/contracts; cross-datastore transaction composition absent. Separate clusters cannot become one transaction.                                                                            | Connection/entity-manager configuration exists; cross-database graph/session routing under Mongo is **unqualified**. Separate managers alone do not prove common session/atomicity.                                                                                                    | Explicit Db handles and shared compatible client per server policy; actual same-deployment routing test still needed. No cross-server distributed transaction assumed.                                                                             |
| Storage/native semantics      | CAS replacement, unset, cursors, aggregation, immutable schemas, identity ledger, native leases and GridFS exceed simple typed CRUD. Retain private driver-backed operations where intentional; prove ownership/error/codec consistency. | Unit-of-work/flush/identity-map semantics must not overwrite staged CAS fields or bypass outcome classification. Private native operations and GridFS still needed; ESM/NodeNext/metadata packaging untested.                                                                          | Closest fit to current native protocols; smallest physical translation. More explicit validators/codecs/queries and separate future SQL adapter required. No ORM contract-generation advantage.                                                    |
| Callbacks/security/hooks      | Must move callbacks/custom behavior into explicit operations. Safe projection, post-write timing, submitted-field quirks and institution overrides cannot be inferred from contracts.                                                    | Same migration obligations; returning managed entities would violate plain DTO seam. Entity hooks do not automatically preserve Waterline partial-update behavior.                                                                                                                     | Same obligations, implemented in domain operations rather than low-level driver wrappers. Loaded Waterline bridge preserves override baseline during transition.                                                                                   |
| PostgreSQL / maintenance cost | Contract tooling useful per engine, but Mongo-specific JSON/IDs/query/index/blob semantics need deliberate future SQL design/migration. Extra generation/module/package qualification already exists in pilot.                           | SQL/Mongo support gives tooling options; does not migrate data or native owners. Entity metadata and flush lifecycle introduce different integration choices.                                                                                                                          | ReDBox interface remains stable; SQL implementation/migration is separate. More adapter code, less new runtime/tooling. No benchmark establishes lower operating cost.                                                                             |
| Support/release               | RC CLI and early-access independent Mongo runtime: G-STABLE closed. Recheck exact pins/official support.                                                                                                                                 | Registry core/driver 7.2.5, Node ≥ 22.17; official documentation supports investigation. Package/module/deployment support still requires qualification, no performance verdict.                                                                                                       | Existing installed driver versions differ by core/storage/Waterline; deliberate alignment/pinning/package qualification needed. Retaining Waterline indefinitely does not meet retirement outcome.                                                 |

Waterline behind plain repositories remains the safest behavioral baseline. It still owns models/shims/managers and does
not meet the final outcome; its unsupported-transaction fallback cannot be relabeled sufficient atomicity. Neither
alternative was installed or benchmarked in P0. Architecture must choose scope/timing/alternative explicitly if Prisma
cannot satisfy the binding gates.

## Private native exceptions with named owners

These remain **intentional Mongo commitments**, not missing Prisma entities: AppConfig secret locks; dashboard CAS;
harvest counter pipelines/ObjectId codec; SIEM lease/retention and Figshare revision/generation stores; storage active/
tombstone/permanent identity/schema retention/cursors/bounded backfill; Agenda jobs/history, connect-mongo sessions;
GridFS/Flydrive/legacy logo readers. [Native ownership](../evidence/native-owners.json) classifies every discovered
manager/client/close candidate and records current missing Agenda/session/GridFS lifecycle wiring. Driver/ORM types
never cross their plain public interfaces. Exceptions cannot be used to put a required Prisma atomic operation secretly
into driver-only sessions. External assets/systems need independent recovery.

## G-TX infrastructure requirement

MongoDB transactions require a **replica set or sharded cluster**. Repo dev, test/CI and pilot qualifications are
standalone 8.0.34; those results cannot qualify transactional groups. Standalone institutions need an approved
deployment conversion and matching backup/upgrade/restore runbooks. A single-member replica set may enable development
transactions but supplies no HA/failover qualification; operations must choose its production support policy. Branding
and U↔S need participating databases on one supported deployment/client/session.

The operations/deployment lead owns OPS-TX-01, architecture owns runtime/routing proof, security/domain owners agree
atomic units, release owner owns major/scope/ timing, and each institution owns its conversion. Dev/test/CI replica-set
stacks and failure/concurrency tests are prerequisite future work, **not built in P0**. See
[environment decisions](../evidence/environment-release-support.md).

## Rejection and re-decision triggers

Stop affected adoption and return to named architecture/release/deployment owners if any of the following occurs:

1. Supported stable CLI **and** Mongo runtime or required Prisma transaction API is unavailable at a release checkpoint.
   Do not infer it will arrive, bypass it with driver writes, or silently change the official v6/full-major scope.
2. Actual institution topology cannot support the required shared transaction, or the owner rejects standalone
   conversion/support/backup costs. No automatic history relocation or weaker compensation contract.
3. Existing collection/column/ID/junction compatibility needs a bulk rewrite, unique-pair cleanup, array conversion or
   collection relocation. All require a new approved scope/compatibility decision.
4. Package/client-per-datastore routing cannot preserve required relationships, session participation or installed
   CommonJS/NodeNext behavior; broad module conversion, per-entity pools or a public ORM/query facade would be required.
5. Institution custom callbacks/IDs/datastores/stored expressions cannot be represented by tested explicit
   operations/mappings, or safe projections and historical BSON/null/timestamp decoding cannot preserve behavior.
6. Required failure/recovery, mixed-instance/prior-artifact rollback, scoped index preparation or owner-approved
   operations budgets fail. Do not promote on CRUD success or repair data at startup.
7. Domain owners require stronger I18n/RDMP/history guarantees or change the U↔S/audit boundary: revise group
   dependencies and gate the newly atomic unit before implementation/promotion.

Re-decisions must retain useful plain repositories and update design/plan/tasks, not start an unplanned replacement ORM
implementation. P1 must carry these unknowns as explicit blockers and retain the cache pilot's lifecycle/config/ package
regressions and deferred behavior unchanged.
