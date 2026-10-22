# P3 — R reference definitions validation

Group R covers ThemeConfig, Form, RecordType, WorkflowStep, DashboardType,
RBReport (physical `report`), NamedQuery and WorkspaceType. Pre-change checkpoint:
`cb874201e2c0215c003ae0a78a4ca637a4e789dc`. R now defaults to **MongoDB**
in the separate promotion change recorded below; explicit Waterline rollback remains.
**G-R PASS for this transaction-free R implementation on `next`**: all eight
entities, consumers, query targets, interoperability, rollback, operations and
standard-runner checks below are evidenced. Qualification commit `641b380a4` and
DTO fix `e784f9fbe` kept the committed R default Waterline. Default promotion is
a separate change, with renewed fresh-runner evidence below. G-TX stays CLOSED; standalone deployments remain unchanged.

## Physical spike

Command:

```bash
R_SOURCE_COMMIT=cb874201e2c0215c003ae0a78a4ca637a4e789dc \
  bash packages/redbox-core/test/fixtures/waterline-retirement/run-reference.sh spike
```

**PASS** on host Node 24.18.0 and an owned disposable MongoDB 8.0.34 standalone.
The runner uses a random loopback port and removes only its returned container
and anonymous volumes. No existing container or institution database is used.
[Actual loaded mappings, raw writes and query inventory](evidence/p3-r/spike.txt)
renew the [P0 physical capture](evidence/waterline-mongo8.ejson).

All eight identities and association references are physical BSON ObjectIds,
with string-facing IDs and ISO string timestamps. Optional strings default to
`''`, optional JSON to null; explicit declared defaults win. ThemeConfig is
unscoped. Other R definitions have required branding; WorkflowStep scopes through
RecordType. WorkflowStep has one optional Form and one optional RecordType;
RecordType has many WorkflowSteps. Missing populated form is null, and the many
side is an array. Definition deletion does not authorize cascading cleanup.

RecordType/DashboardType/RBReport/NamedQuery overwrite a submitted key on create
with `${branding}_${name}`; changing name on update leaves the original key.
RBReport's collection is **`report`**. In safe mode each freshly written
collection has only `_id_`; declared key uniqueness does not prepare indexes.
The four full unique key indexes must be prepared explicitly before driver use.
Do not invent unique brand/name constraints on the other four collections.

## Named-query compatibility inventory

The checkout's eight JSON bootstrap definitions target **record (seven)** and
**user (one)**. Current `namedQuery.supportedCollections` lists those two targets.
They use nested/dotted field equality, `contains`, `<=` and `>=` parameters,
string dates, template projection, and ASC/DESC ordering. User queries scope by
brand roles or active secondary-account links and remove password/token fields.
Record queries scope by `metaMetadata.brandId`. These rules must survive backend
selection independently of the definition repository.

The existing service also accepts any loaded model with a `branding` attribute,
including institution models, and silently skips unavailable related-filter
models. The replacement must publish explicit target metadata and refuse
unknown targets/expressions with migration guidance. Related filters must enforce
their own tenant scope and must not disappear when a target is missing. Query
expressions are application-owned, not a generic repository query language.

No private institution hook/data snapshot is supplied in this checkout. This is
an inventory of available source/config/bootstrap definitions, **not** a claim
that production stored expressions or private targets have been inspected.
Institution operators must inventory those before selecting MongoDB in their deployment; each unknown target
needs an explicit scoped execution implementation or an actionable refusal.

## Verification and gate ledger

P3.1–P3.3 are implemented for all eight entities. P3.4 is evidenced by the
shared real-MongoDB contract and designated prior image. Operational and
standard-runner qualification is recorded below. P3.6 is the separate promotion
after G-R, with renewed default-runner proof.

## Repository and execution implementation

`ReferenceRepositories` contains eight entity-specific operation interfaces,
string IDs and plain DTOs. The Waterline baseline uses each actual loaded model;
MongoDB codecs preserve the observed collections, ObjectId foreign keys, ISO
string timestamps, implicit defaults, required values, create-only keys and
schemaless JSON extension fields. Patches do not replace documents or normalize
historical missing fields on read. Each repository operation participates in
shared app draining and old references are fenced after cleanup/reinitialization.

All direct R calls in core services/controllers have moved to this seam,
including DashboardConfigService and WorkspaceTypesController. ReportsService's
model alias and NamedQueryService's arbitrary model/attribute discovery are
removed. See [consumer audit](evidence/p3-r/consumers.json). Retained model
registrations/generators remain deliberate P11/P12 owners.

`NamedQueryExecution` owns a closed catalogue, existing-dialect validation,
scoped count/page/projection and explicit institution registrations. R targets
follow R selection. Cross-group identity and record-storage readers remain
Waterline-owned with explicit DTO results. User roles are many, a user belongs
through a tenant role or active secondary link, filtering precedes pagination,
and password/token removal precedes projection. Related targets are tenant-scoped
and unknown targets/operators/malformed serialized JSON fail actionably.

The live spike exposed two details beyond the original P0 sample: schemaless
Waterline retains undeclared write fields, and its `select` clause refuses
schemaless models. The adapter preserves extension writes and performs explicit
DTO field projection after the loaded query. This supplies the requested plain
projection operation without silently dropping fields or changing stored data.

The four R key-index descriptors are shared by startup inspection and explicit
ensure. The shared fresh init, hook template, selected-group maintenance command
and Compose forwarding initially included opt-in R. Implementation and
qualification kept R on Waterline until the separate promotion record below. No new dependency or application lockfile changes were needed.

## Qualification ledger at `641b380a4`

The shared standalone contract passes all eight raw-write/read directions,
create-only keys, unknown-field retention, historical missing-field reads without
rewrites, explicit one/many/missing forms, singular duplicate refusal, nested
range/membership filters, counts/order/projection/pagination, simultaneous mixed
independent processes, actual fresh-process restart, config rollback/forward and
stale-reference fencing. Cross-group tests cover user roles/active links,
access-filtered counts, secret exclusion and record tenant scope.

Actual loaded hook callbacks, collection overrides and schema mode retain their
Waterline behavior and refuse driver selection until migrated. A service-owned
ported callback and explicit institution target then run on both selectors,
including another tenant's matching data, count/order/projection/page and
unsupported-predicate refusal. These are representative public fixtures; they do
not certify private institution databases or hooks.

The contract launches the immutable pre-R image from
[the artifact manifest](evidence/p3-r/rollback-artifact.json) against the same
unchanged standalone database. Its old model/callback code reads driver-written
forms/reports, preserves an existing generated key on update, and writes a form
that the driver reads. The image is production-pruned installed core/storage,
from the pre-change commit, with an OCI revision label and npm-11.20.0 lock and
package hashes. [The actual recipe](evidence/p3-r/Dockerfile.rollback) is retained.
This rehearses the R code/data rollback; it does not certify a complete private
portal/assets restore or MongoDB engine downgrade.

| Command | Result |
| --- | --- |
| `npm --prefix packages/redbox-core run build` | PASS, current compiled runtime. |
| `npm run test:core` | **4,136 passing, 106 pending**; startup **10,311 ms** under unchanged **12,000 ms**, with no eager R adapter/client/startup work on import. |
| `npm --prefix packages/redbox-core run typecheck:persistence` | PASS, strict persistence source and tests. |
| `npm --prefix packages/redbox-core run lint` | PASS, zero errors. |
| `npm --prefix packages/redbox-core run check:cache-contract` | PASS, unchanged cache storage/profile hashes. |
| Scoped Prettier check of R sources, boundary tests and fixtures | PASS. |
| `npm --prefix packages/redbox-core run test:persistence-foundation` | **12 passing**, isolated authenticated standalone. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **17 passing**, retained cache baseline and bootstrap cleanup. |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-driver-transition` | **15 passing**, actual Waterline/Prisma/driver interop and mixed processes. |
| `P2_ROLLBACK_IMAGE=sha256:8a996239b1ba3a94e71ce9d35f6a2f5b0edef00ccbdd51131a476fbfab0771be npm --prefix packages/redbox-core run test:migration-transition` | **15 passing**, including actual pre-P2 image rollback. |
| `npm --prefix packages/redbox-core run test:persistence-indexes` | **10 passing**, selected scopes, all-scope preflight, missing/sparse refusal, no startup DDL, duplicate refusal, preservation and idempotent ensure. |
| `bash packages/redbox-core/test/fixtures/waterline-retirement/run-reference.sh contract` | PASS, complete R contract and immutable prior-artifact rollback. |
| `bash packages/redbox-core/test/fixtures/waterline-retirement/run-reference-portal.sh` | Standard unmodified `npm run test:mocha:mount`: **30 passing, one pending per R backend**, fresh compose project/volumes per backend. |

The portal fixture explicitly asserts the selected backend and proves that a
loaded Form read is reached only by Waterline. Its direct-load bootstrap forwards
R configuration. Dashboard integration tests use real repository fixtures with
valid IDs. Dependencies alone are prewarmed for the slow Keycloak host; the
application runner, shared fresh-index init and test commands are unchanged.
No custom index preparation masks a fresh-stack failure.

Native record results cross the seam in their existing JSON wire representation,
with no BSON/Date instances in the public DTO. Native record identity criteria,
ordering and projections use `redboxOid`; `id`/`_id` requests fail with migration
guidance rather than silently reducing a count or related result. Focused
boundary tests also cover cold Observables, malformed stored JSON, explicit
metadata, scoped institution requests and runtime fencing.

The [six operational samples](evidence/p3-r/operations.json) pass every provisional
budget: p95 ratio **0.545**, throughput **1.761**, RSS **0.520**, database calls
**1.00**, readiness ≤128.28 ms, one M+R driver client and all connections back to
baseline. See the [workload, absolute values and limits](p3-r-operations.md).
P3.5's institution migration rehearsal includes the explicit scoped target and
ported service callback in the renewed contract. Formal institution/release
acceptance remains outside these representative fixtures.

Both packed runtimes pass on **Node 24.16.0** and **26.11.1** using
`REFERENCE_PACKAGE_NODE_VERSION=<version> bash packages/redbox-core/test/fixtures/waterline-retirement/run-reference-package.sh`.
Each is a clean production-pruned core/storage installation: offline
CommonJS/NodeNext imports/types/shims, cache and M interoperability, and all eight
R MongoDB writes. The installed consumer checks string workflow IDs, a single
nullable populated form and the absence of a generic `find` repository operation.
Fixture locks use npm **11.20.0**; application dependencies/locks are unchanged.

Run package builds sequentially. The concurrent Node 26 assembly was cancelled
(exit 130) after filesystem contention, then resumed with its exact preserved
manifest/lock/vendor/Dockerfile/consumer context. Its full original probes and
cleanup returned **0**, with no regenerated lock/packages or omitted checks.
[Context hashes and disposition](evidence/p3-r/node26-assembly.json) retain that
event. Node 24 completed its original full runner with exit **0**.

The first general Bruno attempt, while image builds were active, stopped at an
unrelated 21 KiB font upload with 413. That upload passed on the quiet retry.
The quiet run passed **189 requests** before SMTP failed with
`getaddrinfo EAI_AGAIN integration-testing-email-1`: the default notification
config expects the standard project's container hostname. The general Bruno
compose email service now supplies that compatibility alias inside its own
isolated network. Test scripts, application entrypoint, upload limits and index
preparation are unchanged. The complete both-backend retry passes; neither
failed attempt qualifies G-R.

The final standard `npm run test:bruno:general:mount` runner passes **305/305
requests and 549/549 tests on each R backend**, with fresh MongoDB volumes and
independent isolated compose projects. This includes the existing form/record-type,
report CRUD/preview/export and named-query regressions, plus general AJAX/OIDC
coverage. [Commands, counts and full-log hashes](evidence/p3-r/verification.json)
and [controlled retry dispositions](evidence/p3-r/runner-retries.json) retain the
qualification record.

## G-R decision

**PASS for `next`**, 2026-10-20. P3.1–P3.5 cover all eight R entities; no entity or
dynamic core consumer is deferred to make the gate appear complete. Repository
and execution seams remain domain-owned, BSON/driver types stay private, all new
indexes have fresh-stack and existing-volume preparation, and transaction-free
mixed operation/rollback and provisional budgets pass. The Waterline baseline
uses actual loaded models, preserving overrides; incompatible driver mappings
fail before application bootstrap. Representative migrated service/target hooks
pass both adapters.

This does not approve production institution data/hooks, release-level security,
auth/failover/capacity, G-STABLE/G-RETIRE or G-TX. Unknown private targets/expressions
must be inventoried and ported or actionably refused, as specified in the
operations guide. Existing bridge/model registrations remain P11/P12 owners.
G-TX stays closed and stacks remain standalone.

Qualification commit `641b380a4` deliberately left the default Waterline; the
DTO follow-up did too. The separate promotion below changes defaults only after
renewed standard fresh-runner proof without manual index preparation or
dependency prewarming.

## DTO boundary follow-up before promotion

A final audit found that native BSON values in undeclared/JSON R fields could
otherwise cross the plain DTO boundary. The MongoDB codec now refuses those
unsupported values and reserved top-level fields, after normalizing the qualified
identity/relationship ObjectIds. The existing loaded Waterline fallback remains
available for investigation and explicit institution migration. No read rewrites
fields, strips a row, or returns a smaller count/page after a DTO refusal.

Ten focused tests, the renewed **4,137-test core pass** (106 pending, startup
**9,909 ms** under 12,000 ms), strict typecheck/build/lint and the
[real-Mongo contract](evidence/p3-r/contract-bson-guard.txt) cover this follow-up.
The latter reads a native BSON extension through Waterline, proves both driver
repository and named-query refusal, and compares the raw document unchanged
before owned fixture cleanup. All prior interop/rollback/hook cases still pass.

The [renewed operations](evidence/p3-r/operations-bson-guard.json) include the
validation cost: p95 ratio **0.622**, throughput **1.592**, RSS **0.517**, calls
**1.00**, and unchanged shared-client/readiness/drain budgets. This implementation
fix is committed separately as `e784f9fbe`, before default promotion. Its final
package and fresh default runner evidence is recorded below.

## Separate R default promotion

**P3.6 delivered; G-R PASS for `next`.** The separate promotion selects `mongodb`
when R is omitted, in core selection and all ten active Compose/archetype
fallbacks. Explicit `waterline` rollback is retained. M stays MongoDB, cache stays
Prisma, and every future group stays Waterline until its own gate/promotion. No
transaction setting, deployment topology, dependency or application lock changed.

The renewed [command/result/hash record](evidence/p3-r/promotion.json) and
[safe runner excerpts](evidence/p3-r/promotion.txt) show:

- Build, strict persistence typecheck, lint and cache-contract freshness: PASS.
- `npm run test:core`: **4,137 passing, 106 pending**; startup **9,909 ms** under
  the unchanged **12,000 ms**. Ten focused R boundary tests pass.
- Live foundation **12**, Prisma cache **17**, three-backend cache **15**, M
  **15**, and index preparation **11** cases pass. The added index case proves
  omitted group selectors prepare cache plus promoted M/R, all six scopes.
- Renewed R raw/mixed/restart/config/prior-image/tenant/query/hook and unsupported
  BSON refusal contract: PASS. Provisional budgets include the DTO guard and pass.
- Clean production-pruned Node **24.16.0** and **26.11.1**: PASS offline types,
  CommonJS/NodeNext/shims, cache/M interop and all eight R writes with R omitted.
  These final builds ran sequentially and their original full runners returned 0.
- Stock `npm run test:mocha:mount`: **30 passing, one pending**, a new project
  with fresh MongoDB volumes, R omitted, no dependency prewarming and no manual
  index preparation. Its backend assertion proves MongoDB is selected and loaded
  Waterline Form reads are bypassed.
- Stock `npm run test:bruno:general:mount`: **305/305 requests, 549/549 tests**,
  another fresh default project, with the same omitted-selector/no-prewarming/
  no-manual-index conditions. Its SMTP compatibility alias remains network-local.

Exact fresh-default qualification commands:

```bash
REFERENCE_BACKENDS=default REFERENCE_SKIP_PREWARM=true \
  bash packages/redbox-core/test/fixtures/waterline-retirement/run-reference-portal.sh
REFERENCE_BACKENDS=default REFERENCE_SKIP_PREWARM=true \
  bash packages/redbox-core/test/fixtures/waterline-retirement/run-reference-bruno.sh
```

All fixtures create and clean only their own containers, volumes and networks.
No existing development/institution MongoDB data is used. The designated pre-R
image is retained. P4/Q owns the remaining configuration query readers, dashboard
CAS, secret leases and best-effort I18n behavior; see the operations handoff.
G-TX stays CLOSED, private institution inventory and official release acceptance
remain open, and model/bridge retirement remains P11/P12 work.
