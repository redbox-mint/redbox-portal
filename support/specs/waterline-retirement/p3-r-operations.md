> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

> Phase 2 update (2026-10-22): this group's current selector is
> `prisma | waterline`, default `prisma`. Explicit `mongodb` is refused.
> Prisma replaces driver CRUD/query/preflight; existing physical contracts and
> rollback behavior below remain. Q fallback coordination also uses Prisma.
> Historical qualification matrices below are not repeated in this phase;
> see [phase 2 evidence](evidence/prisma-phase2.md).

# R reference definitions operations and institution migration

R defaults to `prisma` on `next` after the separate G-R promotion.
`persistence.groups.reference.backend` accepts `prisma` or explicit `waterline`
rollback. There is no automatic fallback. All eight R
entities select together. MongoDB stays standalone; R requires no transactions.
G-R and promotion status are recorded in [validation](p3-r-validation.md).

For app.js, an omitted R selector uses Prisma. To roll back, set
`sails_persistence__groups__reference__backend=waterline`. Supplied
Compose stacks forward `RBPORTAL_REFERENCE_BACKEND`; direct load/lift callers
must supply the configuration object. Restart every changed instance. The
repository runtime initializes before services, migrations and domain bootstrap;
imports do not acquire a driver client. R shares the application's compatible
MongoDB pool with M and other driver owners, without per-entity pools.

## Prepare an existing deployment

Stop writers, take the matching data/config/assets checkpoint, and retain the
pre-change built application image. Do not delete data, repair duplicates,
regenerate keys or change MongoDB topology as part of selector switching.

With the intended configuration/hooks and R selected as prisma, run:

```bash
npm run persistence:indexes -- --inspect
# Review all selected groups, then explicitly authorize DDL by running:
npm run persistence:indexes -- --ensure
npm run persistence:indexes -- --inspect
```

R requires full unique simple-collation `{key: 1}` indexes on `recordtype`,
`dashboardtype`, **`report`** and `namedquery`. Names may differ if the index is
otherwise equivalent. Partial, sparse, TTL, nonunique or incompatible indexes
and duplicate keys (including colliding missing/null keys) require an operator
decision. A unique index alone does not validate every historical row. All selected groups
are inspected before any ensure writes. Startup checks readiness and never
creates indexes or changes documents. Fresh stacks use the same shared init
script and hook template; existing volumes do not rerun MongoDB init scripts.
There are no new unique brand/name constraints on Form, WorkflowStep,
WorkspaceType or ThemeConfig.

## Replace institution model/query assumptions

The eight repositories returned by `getReferenceRepositories(app)` expose domain
operations for themes, forms, record types, workflows, dashboard types, reports,
named queries and workspace types. Promises replace deferred queries; existing
services keep their Observable/HTTP interfaces. Hook services can use `super.getObservable(() => repository.operation(...))` to start a repository call only on first subscription and retain its result/error for later subscriptions to that Observable. `workflowForms(recordType)`
returns many workflow DTOs and one form DTO or null per workflow using two
batched reads. It does not create or cascade-delete relationships. Retain these
explicit cardinalities and the existing bootstrap override rules.

Waterline uses the actual loaded model, callbacks, datastore and collection.
Prisma readiness refuses custom attributes, columns, defaults, validations,
collections/datastores, identities or callbacks that differ from the qualified
contract. Keep Waterline for those hooks until their behavior is moved into
explicit repositories/services. A selector does not translate institution
physical mappings. Do not remove the retained model shims or association targets;
that is P11/P12 work.

Prisma refuses unsupported native BSON objects in JSON/extension fields,
non-JSON values and reserved top-level fields, rather than exposing a driver
object or dropping a row from a page. Qualified ObjectId identities/relationships
still become strings. Retain Waterline while inspecting those raw fields and
reviewing a deliberate data/hook migration; reads never convert stored data.
A DTO refusal fails the whole repository/query operation, including count/page.

The loaded schemaless Mongo models retain undeclared JSON extension fields. Both
adapters preserve them and updates leave unrelated data intact. Only the four
keyed entities generate `${branding}_${name}` on create; updates retain the key.
Explicit field projections are DTO projections on the Waterline baseline because
Waterline rejects `select` for schemaless models. No generic query/model API is
published by the reference repositories.

## Inventory stored named queries before deployment

Export the stored definitions using the existing named-query API **for every
brand**, plus configured bootstrap directories and private hook config. Keep the
export alongside the pre-change image/checkpoint. Keep the raw serialized
columns in that database checkpoint too: older API parsing can normalize malformed
JSON, so API output alone is insufficient for that audit. Record each primary target,
related-filter target, expression, parameter `queryType`, sort and projection.
The checked-in inventory has seven record queries and one user query; it cannot
stand in for private institution data.

The editor's `supportedCollections` is a presentation setting, not permission to
look up a model. Core execution has a closed catalogue with explicit brand
scope. R targets follow the R backend. Other core targets still use explicit
Waterline readers until their owning group migrates. Record scope is
`metaMetadata.brandId`; users require a role in the tenant or an active secondary
link. Users are filtered before count/page and password/token are removed before
projection. Related-filter targets get their own tenant scope too.

The existing expression subset includes field equality, arrays/in/nin, != and
comparison operators, contains/startsWith/endsWith, nested/dotted fields, and
and/or (or their Mongo `$` forms). Native record queries additionally accept
string `$regex`/`$options` and boolean `$exists`. Dates remain stored strings. Native record identity predicates, ordering and projections must use `redboxOid`; logical `id`/physical `_id` access is refused until an explicit storage-owned target supplies ID normalization. This avoids silently empty relations or counts from treating Mongo ObjectIds as strings.
SQL-like `like`, Waterline `not` aliases, `$where`, arbitrary operators, unknown target names, invalid
pagination, invalid paths and invalid serialized JSON are refused with migration
guidance. There is no new query language. Prisma R queries refuse fields outside
the qualified physical mapping, and deep paths must descend through JSON fields.
Waterline-style target ordering uses one attribute per term, without duplicate attributes.
Native record reads retain compound MongoDB sort objects. R
filters, ordering and projections fail explicitly for unqualified paths. Do not silently remove predicates or related
filters to make a query run.

For an institution target, register a plain `InstitutionNamedQueryTarget` with
`registerNamedQueryTarget(app, target)` during service initialization. Supply its
name, explicit scope metadata and `execute(request)` implementation. The request
contains the tenant, validated existing expression, select/sort and pagination;
the result contains plain records plus an access-filtered count. The institution
implementation owns field compatibility, physical mapping, permissions, count,
projection and ordering. It must honor the supplied tenant, even for related
filters. It must not accept arbitrary collection/model names. Test it against
both selectors and with another tenant's matching data. Merely declaring a
Waterline model with a branding attribute no longer registers a query target.

If an old expression has no equivalent within this subset, retain the prior
application artifact while migrating it through an explicit target operation,
or reject it with a documented operator action. Export/rewrite one reviewed
stored definition through the named-query API and compare counts, ordered IDs,
pages and projections against the original. Do not bulk-rewrite documents.
Unknown related targets now fail the query instead of being skipped. Related-filter intersections accept an existing Mongo `$in` constraint; move other existing local-field constraints into a separate explicit `and`/`$and` clause before applying a related filter. Ambiguous replacement is refused. Parameter/local/foreign field paths are validated before mutation.

## Bounded operational evidence

The [recorded comparison](evidence/p3-r/operations-bson-guard.json) uses one owned MongoDB
8.0.34 standalone, Node 24.18.0, 20 forms with 24 components and 26,639 bytes of
configuration each, and 20 related workflow stages. Three paired repeats alternate
backend order; each process performs 100 warmups and 1,000 form-list/detail,
workflow/form and named-query count/page operations. The database profiler counts
actual calls. Configuration/stage raw snapshots remain unchanged.

| Mean across three repeats | Waterline | MongoDB |
| --- | ---: | ---: |
| p50 | 7.75 ms | 5.18 ms |
| p95 | 11.77 ms | 7.32 ms |
| p99 | 13.81 ms | 8.53 ms |
| Throughput | 130.92 ops/s | 208.49 ops/s |
| RSS | 721.53 MiB | 373.02 MiB |
| Database calls, including warmups | 1,650 | 1,650 |
| M + R readiness range | 72.90–79.48 ms | 106.22–115.68 ms |

MongoDB/Waterline ratios are p95 **0.622** (budget ≤1.20), throughput **1.592**
(≥0.90), RSS **0.517** (≤1.10), calls **1.00** (≤1.25). All six M+R processes
create exactly one owned official-driver client; measured readiness stays below
250 ms. Observer/application connection counts are baseline 3, active 8 for
Waterline or 10 for MongoDB, and 3 after close in every repeat. The observer is
stabilized before measuring its monitor sockets, following the M harness.

These are provisional `next` budgets on representative synthetic data, not a
production throughput/capacity claim. The pure core-load regression independently
passes at 9,909 ms with the DTO guard against its unchanged 12,000 ms deadline. Importing core does
not eagerly load reference adapters or start persistence. Formal operations,
production auth/failover, institution data/query inventory and release acceptance
remain required outside this fixture.

## Rollback and P4 handoff

Drain traffic/work and close the application before changing configuration.
Select Waterline and restart against the **same unchanged database/indexes**.
Check a form/workflow, a report and a named-query count/page. Config rollback
continues to use explicit target metadata in this implementation; restoring
legacy arbitrary-model execution requires the designated pre-R artifact.

The retained pre-R installed core/storage runtime artifact is built from
`cb874201e2c0215c003ae0a78a4ca637a4e789dc`, tag
`redbox-p3-r:prior-cb874201`; its exact image identity and lock checksums are in the
validation evidence. Restore matching private hook/config/assets with that image.
This rolls back the application, not MongoDB/FCV or topology. Preserve the index
and all data. If data restoration is required, use the established isolated
backup/restore procedure and reconcile writes after the checkpoint.

P4 owns AppConfig, DashboardConfiguration, I18nBundle/I18nTranslation and secret
leases. DashboardConfigService's R reads already use these repositories; leave
AppConfig duplicate/latest-row selection and best-effort translation sync intact.
Its named-query target readers remain explicit Waterline bridges. When Q selects
its driver, replace those readers in the named-query execution owner and rerun
cross-group query tests. Extend the same index-preparation command/script and
fresh-stack tests; do not add AppConfig brand/key uniqueness. R is promoted
independently of Q. Q remains Waterline until its own
separate qualification/promotion; Q-only fixtures that lift core must prepare R
indexes or explicitly select R Waterline. Do not assume omitted R means Waterline.

Q owns DashboardConfiguration brand uniqueness, revision CAS/copy and secret
leases with string keys, BSON Dates and ownership/fencing. Keep I18n sync best
effort; any new required multi-document atomic unit remains behind G-TX. Reuse
the shared lifecycle/pool and index preparation rather than adding model pools.
