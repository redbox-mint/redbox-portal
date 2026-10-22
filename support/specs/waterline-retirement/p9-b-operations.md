> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

# B branding persistence operations

Current phase 4: selectors are `prisma | waterline`, default `prisma`; `mongodb`
is rejected. [Phase 4 evidence](evidence/prisma-phase4.md) supersedes this driver
checkpoint for implementation/readiness details. Normal CRUD and frozen branding
migration writes use models. Optional missing reads may be null; patches preserve
physical absence. V applying claims are now atomic (one Prisma winner); explicit
Waterline rollback retains its two-winner window. The sequential failure and
recovery guidance below remains applicable; no transactions were added.

B owns BrandingConfig on `mongodb` and BrandingConfigHistory on `redboxStorage`.
`persistence.groups.branding.backend` selects `waterline` or `mongodb`; supplied
stacks forward `RBPORTAL_BRANDING_BACKEND`. The omitted selector now defaults to
MongoDB after the independent P9.6 promotion; explicit Waterline remains available.
Restart changed instances. No fallback,
session, transaction, automatic retry or history relocation is introduced.
TX-PARITY-01 supersedes BRAND-TX-01: separate-server installations are supported
at the existing sequential-write parity.

Drain branding editors, publication/restore requests, migration runners and asset
reconciliation before cutover. Retain the deployment's previous application,
hooks, configuration and matching database/external-asset checkpoints. With the
maintenance process configured for the intended selectors, run:

```bash
npm run persistence:indexes -- --inspect
npm run persistence:indexes -- --ensure
npm run persistence:indexes -- --inspect
```

Review every report before ensure. Startup only inspects; it never performs DDL
or repairs documents. B adds nonunique simple-collation `name_1` on brandingconfig
and `branding_1_version_1` on brandingconfighistory, on their respective configured
datastores. Safe-mode loaded Waterline supplied only `_id`, despite the declared
history uniqueness. Compatible full unique indexes already installed by operators
are accepted and retained. Do not install a new uniqueness constraint or delete
conflicting histories as part of this migration.

The public `getBrandingRepository(app)` exposes plain brand/history snapshots and
explicit draft, publication, asset metadata and history operations. Normal writes
retain scalar/default/timestamp behavior, one-leading-`$` normalization and the
configured variable allowlist. Missing historical fields stay missing on reads;
patches preserve unrelated stored fields. Unsupported BSON, mappings, datastores,
callbacks, defaults, custom validators or collation refuse driver readiness/reads.
Keep institution overrides on Waterline until their explicit operations qualify.
Resources belong to the lazy application foundation: one client for compatible
connection policies, two when the configured datastores use separate servers.
Shutdown drains operations before closing these clients.

V's brand-name resolver follows B's selector in both V adapters. It no longer
reads Waterline BrandingConfig when B selects MongoDB. B's populated role reads
still use the explicit U-owned Role projection. RolesService's retained
BrandingConfig collection-membership calls are U-owned inverse Role.branding
writes; U must replace/qualify those. Both B definitions/shims remain for rollback
and the connected Waterline association graph until P11.

Publication inserts history before conditionally updating the brand by version
and draftRevision. TX-PARITY-01a authorizes the driver's natural atomic
`findOneAndUpdate`: a stale predicate returns no row and triggers the existing
conflict compensation. Explicit Waterline rollback retains its select-IDs-then-write
race; mixed deployments still contain those Waterline writers. See B-01 in the
[quirk register](quirk-register.md); this adds no transaction or uniqueness.
History is removed after a certified not-applied validation/uniqueness/usage
error, or best-effort after an empty conditional result. A transport error may
have applied the active write: retain history, inspect active version/hash,
draftRevision and retained rows, and use the existing publication retry flow.
A failed compensating deletion can leave recovery evidence, or replace the
original certified error. Do not treat an HTTP error as rollback proof.

Unknown-before-application retries allocate above the retained maximum and prune
a superseded ambiguous row only after the same snapshot publishes successfully.
Unknown-after-application retries use existing hash/typeface idempotence and
refresh the in-memory brand cache. Retention occurs after durable publication;
its failure can leave excess histories. Restore regenerates CSS from historical
variables, verifies every referenced font byte before mutation, and creates a new
monotonically increasing version. The deprecated rollback route keeps restore
semantics. Neither backend makes database writes atomic with font/logo storage,
cache refresh, pruning or external cleanup. History restores colours/typefaces,
not historical logo/favicon metadata. Logo keys are mutable: bytes are written
before metadata, so metadata failure can leave overwritten bytes and an old hash.
Favicon failure cleanup deletes its new object even when an unknown response
followed an applied metadata write; the active reference can then be missing.
Both are characterized baseline candidates for a separate consistency decision.
Recover matching known bytes/metadata before resuming delivery.

Both preview paths await the cache repository. Preview consumption remains
read-then-delete: concurrent readers can receive the same token; expiry and
preview deletion failures retain their existing outcomes. Serving paths retain
delete-before-304 behavior. Cache persistence has its own independent selector.

Pending migration names/order/ledger identities are unchanged. The typeface
backfill preserves a rewound/divergent published snapshot before pruning; it must
fail before pruning when published colours cannot be recovered. The frozen
sidebar operation alone bypasses today's allowlist to preserve historical keys,
CSS, hashes, versions and draft changes. It performs native variable-only patches
without changing model timestamps. Reruns skip completed sidebar writes. Typeface
history pruning has no down migration: recovery requires a matching prior backup.

For configuration rollback, drain, close, explicitly select Waterline and restart
on the same namespaces/indexes. For code rollback, restore the designated pre-B
artifact with matching hooks/config/assets and compatible selections for later
groups. The local ARM64 rehearsal is an installed core/storage/dependency snapshot,
not a clean production-pruned institution portal image. Retain and rehearse the
actual deployment artifact. Backend switching neither reverses later writes nor
changes MongoDB/FCV/topology.

A database checkpoint alone cannot restore branding assets. Back up both logical
datastores together with primary-disk `branding-fonts/<brand-id>/<sha256>.woff2`,
logo/favicon objects, configuration and hooks while writers/reconciliation are
stopped. Restore into isolated targets, compare raw BSON/indexes and asset hashes,
then verify public asset reads, publication, preview and retained restore before
admitting writers. Missing/corrupt font bytes correctly block restore; databases
cannot reconstruct pruned histories or deleted objects. Separate-server backups
need the same stopped-writer boundary across both servers.

Provisional next budgets: p95 <=1.20x, throughput >=0.90x, RSS <=1.10x, database
calls <=1.25x, readiness <250ms and application connections returning to baseline.
[Validation](p9-b-validation.md) records the bounded standalone MongoDB 9.0.4 / FCV
9.0 ARM64 qualification and its limits. Official release, private institution
mappings/hooks/auth/failover, identity and remaining record/Counter/rebind paths
remain separate work.
