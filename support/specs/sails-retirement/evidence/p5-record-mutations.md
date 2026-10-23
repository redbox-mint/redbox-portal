# SR-035 — owned record mutations and workflow operations

## Implementation and scope

All **23 declarations** are implemented: **21** record mutation declarations
(API and browser aliases) plus **2** harvest declarations. The previous
create-authorization-only status is superseded. Starting source: `a7d5ae36a`,
shared `stack/sails-retirement` checkout on host **agentvm**. The owned pipeline
is `9b5942aa6`; HTTP operations and account linking are `3ce52f834`.
Providers are `1e7045a0f`; final API coverage is `54e20da55`.

`records/Records.ts` contains the existing save/lifecycle algorithms once.
`services/RecordsService.ts` is a thin comparison export;
`compat/sails/records.ts` supplies legacy-only configuration/event bindings.
Converted comparison instances live on the application, outside the old global
service cache. Standalone callers inject storage, datastreams, record types,
workflows, forms, schema/validation, queue, indexing, branding and named hooks.
There is no request-time Sails lookup, controller dispatch or `eval` in the owned
pipeline. `RecordCreateAuthorization` and the previously extracted projections
remain shared. `RBValidationError` now needs only a translation operation.

The same extraction includes `HarvestRuns`, `FigshareSourceIntents`,
`storage/StorageManager`, `storage/StandardDatastream` and `queries/Solr`.
Existing Flydrive/GridFS repositories and native resource owners are reused.
Figshare source intent is computed from injected configuration; actual delivery
requires its selected provider and is never replaced by a successful no-op.
Legacy service wrappers delegate rather than retaining another implementation.

## Security, concurrency and failure behavior

`recordMutations.ts` binds all effective policies before mounting any route,
then enforces owned browser CSRF or independently verified API bearer exemption,
actor/brand membership, object ACL and operation-specific role authorization.
The shared pipeline checks the **stored** concurrency policy, schema grants,
validation, create/target workflow grants, revisions, permanent incarnation
ownership, attachment references, audit/index work and compensation. It retains
v1/v2 envelopes, browser save responses, public ETags/preconditions and schema
links. It does not infer write authority from OpenAPI or submitted permissions.

Real HTTP tests cover missing/stale/racing strict preconditions; one racing write
wins. Observe and last-write-wins accept missing tags but still reject an explicit
stale tag. Merge and replacement retain their existing distinction. Unknown and
role-denied workflow targets have no persisted effect; an allowed target persists.
Delete/restore/purge use the existing lifecycle/CAS owner. Existing reconciliation
and action-execution tests remain authoritative for partial/unknown save effects;
no transaction or new exactly-once guarantee is introduced.

Harvest now scopes legacy lookup to the authenticated brand and authorizes
existing objects **before** duplicate/no-op shortcuts. The persisted checkpoint,
event-failure rollback and retry cases execute on Mongo. Account linking uses the
same writer for tenant-scoped ACL rewrites; a link cannot rewrite another brand's
record. Pre-write link refusals are typed 400 errors; later failures disclose
possible partial effects without leaking provider details.

Audit jobs, retained optional security follow-ups and index work remain owned
through request abort and shutdown. A compatibility regression caught a lost
optional security diagnostic after extraction; the catch now runs inside the
retained follow-up, preserving both lifetime and the original diagnostic.

## Actual verification

Use the exact environment/commands in [API closure](p5-api-closure.md#commands-and-results).
The final integrated command executes **12 record/harvest/link HTTP tests**,
including all **8 existing Bruno permission requests / 16 assertions**, with
zero failures or pending cases. These run against actual MongoDB **8.0.34**,
Solr **10.0.0**, GridFS, schema grants and the real queue. The complete HTTP
matrix is **146 passing**, plus a separately executed **7/7** multipart probe.

Focused original record/storage regression: **476 passing / 51 existing pending**
(`record-owned-regression3.log`); identity/harvest: **141 passing**, no pending
(`identity-harvest-regression6.log`); retained audit/progress/controller regression:
**139 passing**, no pending (`compat-drain-regression2.log`). Final full Mongo
core/build/typecheck/lint results and intermediate failures are recorded in API
closure. Existing pending cases establish no new acceptance.

The released-v5 artifact has representative read/form/auth observations, not a
complete write replay. Preserve that limit: retained original mutation tests,
current intermediate-source behavior and actual standalone writes are the write
comparison evidence. Institution qualification remains SR-005.

## Provider boundary

Multipart and direct portal progress, plus actor-bound tus resume/callbacks, are
implemented and exercised; see [uploads](p6-uploads.md) and
[realtime](p6-realtime.md). They satisfy the concrete dependencies of these owned
save operations. Remote-source Companion transfers and joint Companion/socket
shutdown remain externally blocked in SR-042/SR-043. No record mutation calls an
unowned Companion instance or reports a remote transfer as completed. Those
provider gaps remain explicit and do not hide unfinished save-pipeline work.
