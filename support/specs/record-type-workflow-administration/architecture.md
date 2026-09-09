# Secure Record-Type and Workflow Administration Architecture

## 1. Context

ReDBox currently persists brand-scoped `RecordType` rows and related `WorkflowStep` rows in MongoDB. Their initial values are populated from `sails.config.recordtype` and `sails.config.workflow`. Record hooks contain arbitrary function strings and options. Runtime resolution currently reaches direct `eval` paths in `RecordsService` and `TriggerService`.

The current ActionController is a separate unsafe surface: `sails.config.action` names a service and method, and a route callable by several roles attempts to invoke the configured target. It has no registered capability contract, authoritative input schema, per-action authorization, or safe output contract.

The feature must make record types and workflows administrable without turning database content into executable server code.

## 2. Goals

- Let an administrator safely clone, edit, validate, publish, retire, inspect history, and roll back brand-scoped record-type/workflow definitions.
- Replace record hook function strings with a deterministic, code-owned action registry.
- Model workflows as explicit stage-and-transition graphs, including conditional automatic transitions.
- Make every published configuration immutable, auditable, recoverable, and safe to resolve across multiple application instances.
- Provide schema-driven action parameter editing without exposing arbitrary Formly or executable configuration.
- Migrate all shipped legacy record hooks with no eval fallback.
- Provide task-level implementation and verification boundaries suitable for delegated execution.

## 3. Non-goals

See the deferred list in [README.md](README.md). In particular, this release does not build form authoring, a generic remote-action endpoint, bulk stage-key migration, or fine-grained permissions.

## 4. Existing implementation anchors

The implementation should extend rather than duplicate these mechanisms:

- Record-type persistence and brand ownership: `packages/redbox-core/src/waterline-models/RecordType.ts` and `RecordTypesService.ts`.
- Workflow persistence: `WorkflowStep.ts` and `WorkflowStepsService.ts`.
- Record hook definitions: `packages/redbox-core/src/config/recordtype.config.ts`.
- Existing action execution policies, reports, retry, timeout, idempotency, and phase orchestration: `packages/redbox-core/src/action-execution/` and `services/record-hooks/coordinator.ts`.
- Hook capability discovery and explicit registries: `packages/redbox-core/src/loader/index.ts` and `support/wiki/Redbox-Loader.md`.
- Safe expression primitives: `packages/sails-ng-common/src/jsonata-helpers.ts` and `handlebars-helpers.ts`.
- Data migration runner: `packages/redbox-core/src/loader/MigrationRunner.ts` and `support/wiki/Data-Migrations.md`.
- Schema-to-Formly precedent: the `app-config` Angular project.
- Admin HTTP/CSRF precedent: `angular/projects/researchdatabox/branding/src/app/branding-admin.service.ts`.
- Embedded Angular/EJS application pattern: `angular/angular.json` and `views/default/default/admin/`.

The branding history implementation is a useful reference but not a contract to copy. Its draft and published state are not fully isolated, and its publication concurrency check is not an atomic compare-and-swap.

## 5. Trust model

Administrators are authorized but not trusted as code authors. Every administrator-supplied value is data.

The following must never be accepted from a definition draft or bootstrap payload:

- JavaScript source or function bodies;
- service names, method names, module paths, globals, or property paths that resolve code;
- arbitrary Formly configuration;
- unrestricted Handlebars helpers;
- unrestricted JSONata functions or runtime bindings;
- Sails request/response objects or service registries;
- secret values embedded in definition snapshots, audit events, diffs, or logs.

All mutation APIs require authentication, existing `Admin` authorization, brand resolution through the request path, CSRF protection, authoritative server validation, optimistic concurrency, and bounded payloads.

## 6. Domain model

### 6.1 Stable record-type identity

Retain `RecordType` as the stable, brand-scoped identity. Its durable identity is `(branding, key/name)`. Add lifecycle fields such as:

- `activeRevisionId`;
- `draftId`;
- `retiredAt`, `retiredBy`, and optional retirement reason;
- a concurrency/version field used for active-pointer compare-and-swap.

Deployment/storage-owned fields such as `packageType` and `searchCore` remain code-owned or read-only in the first UI.

### 6.2 Mutable draft

Create a separate draft model containing:

- brand and record-type identity;
- mutable aggregate definition snapshot;
- draft concurrency version;
- base published revision;
- `updatedAt` and `updatedBy`;
- validation status/hash, if useful as a cache only.

There is one shared draft per record type. Draft saves may be semantically incomplete, but must always pass security, type, size, and shape validation. Stale saves return a structured conflict and never overwrite a newer draft.

### 6.3 Immutable revision

Create an immutable revision model with a unique `(recordType, revisionNumber)` constraint and fields including:

- canonical aggregate snapshot;
- canonical hash;
- schema version;
- action contract references;
- created/published actor and timestamps;
- publication note;
- source revision and operation (`publish`, `rollback`, `migration`, or `bootstrap`).

Revisions are never edited or deleted. Rollback validates a historical snapshot and publishes it as a new, monotonically increasing revision.

### 6.4 Aggregate definition

The aggregate revision contains:

- editable record-type labels and searchability;
- search filters;
- record relationships;
- transfer-responsibility rules;
- validation and concurrency policy;
- record lifecycle action bindings;
- ordered workflow stages;
- explicit transitions;
- optional supported dashboard configuration after unsafe expressions are migrated;
- references to forms and validation operations.

Draft and revision payloads use stable schema versions and canonical ordering before hashing.

### 6.5 Workflow stage

A stage has a stable key and editable label. It includes:

- form reference;
- view/edit roles;
- display order;
- starting/terminal state;
- validation overrides;
- supported dashboard configuration;
- immutable base-record-type reference where applicable.

Exactly one starting stage is required at publication. Stage labels can change freely. A published stage key cannot be renamed or removed while any record references it.

### 6.6 Transition

A transition is an explicit edge with:

- stable binding-independent transition ID;
- source and target stage keys;
- label and optional description;
- `manual` or `automatic` mode;
- allowed roles for manual execution;
- optional JSONata eligibility condition;
- unique priority for automatic transitions from the same source/event;
- validation operation reference;
- ordered pre, postSync, and post action bindings.

Manual transition roles are constrained by source-stage authorization. Eligibility is always re-evaluated on the server. UI visibility is advisory.

Automatic transitions use first-match priority order and perform at most one transition in a save cycle. Chaining is deferred.

## 7. Action registry

### 7.1 Registration

Add an explicit hook capability, for example `hasActions`, and a synchronous `registerRedboxActions()` export. It returns complete descriptors with direct handler references. The loader records provenance and fails startup on malformed descriptors or duplicate IDs. Hook priority must not resolve action collisions.

An action descriptor includes:

- globally unique namespaced ID;
- contract version;
- title, description, and category metadata;
- direct handler function;
- supported lifecycle modes and phases;
- whether repeated bindings are permitted;
- supported future invocation contexts without exposing an endpoint;
- parameter schema and safe UI hints;
- typed result/output schema and condition-visible fields;
- allowed patch/result contract;
- safe execution-policy defaults and hard bounds.

An active revision referring to an unavailable action makes an application node unready. Draft references produce validation errors without preventing startup.

### 7.2 Binding

An action binding is brand-specific configuration with:

- stable binding ID;
- action ID and contract version;
- parameters;
- explicit order;
- bounded execution-policy overrides;
- optional dependency on the success or declared output of an earlier binding.

Dependencies may inspect only validated, redacted, descriptor-declared output fields. They must reference earlier bindings. Cycles and forward references are rejected.

Repeated bindings are allowed only when the descriptor opts in.

### 7.3 Context

Handlers receive a versioned, immutable context containing only approved data:

- current and candidate record snapshots where relevant;
- safe user identity and roles;
- brand ID;
- record type;
- operation and phase;
- source and target stage;
- timestamp and correlation/request ID;
- safe prior action outputs where explicitly declared.

No handler receives Sails request/response objects, service registries, environment variables, filesystem access through configuration, or secrets unless the handler explicitly resolves its own secret slot.

### 7.4 Results

Pre-actions return one of a closed set:

- no change;
- a validated patch;
- an explicitly supported replacement candidate;
- a typed rejection.

Post and detached actions are side-effect-only unless their descriptor explicitly participates in the existing postSync chained-CAS contract. The executor validates results before applying them. Direct mutation of shared input objects is not part of the public contract.

### 7.5 Execution semantics

Preserve the existing observable create/update/delete/transition ordering unless an individual legacy action must change to satisfy immutable input and typed output. Characterization tests lock the current sequences before migration.

Use the existing execution infrastructure for:

- sequential fail-fast `pre` and `postSync` phases;
- detached `post` dispatch;
- timeouts, retries, idempotency, structured reports, and failure normalization.

Descriptor bounds constrain administrator-selectable execution policy. A configured timeout must not be represented as an interrupt guarantee when the execution mechanism cannot interrupt synchronous work.

## 8. Expressions and templates

### 8.1 JSONata

JSONata handles conditions and structured mappings. It receives a purpose-specific, read-only projection of the action or transition context and a fixed helper registry. Dangerous bindings remain prohibited.

Enforce:

- expression length and AST/complexity limits;
- input and result size/depth limits;
- bounded evaluation time;
- an interruptible worker boundary for administrator-authored expressions;
- normalized, non-sensitive diagnostics.

If the worker boundary cannot be delivered safely, ship only a constrained subset and do not describe an ordinary Promise timeout as a sandbox.

### 8.2 Handlebars

Handlebars handles human-readable text. Use the fixed helper registry, destination-appropriate escaping, template/input/result size limits, and context projections that omit secrets and server internals.

### 8.3 Unsafe-expression scope

This release removes direct eval and unsafe configurable Lodash execution from managed record types, workflows, and the removed ActionController pathway. Maintain a separate inventory for user hooks, email, validation, Solr, vocabulary, related-record, and other sites. Add an automated guard against introducing new direct eval or unsafe configuration templates.

## 9. Secret parameters

The parameter schema may mark a field as write-only secret. The browser receives only whether the value is configured.

Secret values are stored outside drafts, revisions, history, hashes, diffs, logs, and bootstrap data under a stable slot based on brand, record type, binding ID, and parameter name.

Update behavior is explicit:

- omitted or blank means retain the current value;
- replace writes a new value;
- clear removes it after confirmation.

Use the existing protected-storage pattern for this release behind a provider interface. External secret-manager providers are future work.

## 10. Validation

### 10.1 Draft-save validation

Draft saves enforce:

- request size and nesting bounds;
- known properties only;
- schema/type validity;
- safe identifiers;
- secret handling rules;
- optimistic concurrency;
- absence of executable strings and forbidden expression constructs.

They permit semantic incompleteness.

### 10.2 Publication validation

Publication additionally requires:

- one starting stage;
- unique record-type, stage, transition, action-binding, and priority identifiers;
- valid transition targets;
- no unreachable stages;
- viable exits from non-terminal stages;
- valid roles and protection against administrative lockout;
- resolvable forms and validation operations;
- resolvable action IDs and exact contract versions;
- parameters valid against server-owned action schemas;
- binding context/phase compatibility;
- valid action dependency order and declared output access;
- safe policy overrides within descriptor bounds;
- safe JSONata and Handlebars compilation;
- no removal/rename of referenced stage keys;
- supported dashboard expressions only;
- storage capability compatibility for concurrency policy.

Return path-addressed errors and warnings suitable for direct display in the editor.

## 11. Publication, history, and cache coherence

Publication follows this sequence:

1. Load draft using the expected draft version and active revision.
2. Run complete authoritative validation and impact analysis.
3. Canonicalize and hash the aggregate.
4. Create the immutable revision and durable audit/history record.
5. Atomically compare-and-swap the record type's active revision pointer.
6. Invalidate local definition caches and publish/detect cross-instance invalidation.
7. Return the active revision, validation report, and audit identifier.

An unreferenced immutable revision caused by a failed pointer swap is harmless and may be cleaned later. Publication must never expose a partially updated mutable graph.

Runtime resolution uses active-revision/version-keyed caching. Drafts are never runtime definitions. Other instances use shared invalidation or a short bounded cache lifetime; publication never requires restart.

Audit/history captures brand, record type, actor, operation, time, source/target revision, hashes, validation result, bounded structural diff, and migration summary. Rollback reason is mandatory; publication note is optional but prompted. Security-relevant history writes fail closed.

## 12. Migration and bootstrap

### 12.1 Legacy action mapping

Inventory every shipped legacy record hook and nested callback. Provide an explicit mapping from its legacy expression to a registered action ID, contract version, and parameter transform.

The A01 baseline is recorded in the [legacy action migration inventory](../../wiki/Legacy-Record-Action-Migration-Inventory.md), with [machine-readable occurrences](legacy-action-inventory.json) and [proposed mappings](legacy-action-mappings.json).

Migration must:

- offer a preflight report;
- fail on unknown expressions, invalid parameters, unsupported mutation behavior, or missing action registrations;
- flatten nested callbacks into ordered bindings and dependencies;
- replace Lodash conditions with validated JSONata;
- preserve observable ordering through characterization tests;
- never retain a function string or eval fallback.

### 12.2 Existing database migration

For each brand independently:

- read its persisted `RecordType` and related `WorkflowStep` rows;
- build the aggregate definition;
- migrate action bindings and transitions;
- create the initial immutable published revision and active pointer;
- optionally create a matching clean draft;
- record counts, hashes, warnings, and provenance.

Do not copy the default brand over other brands. Migrations use the existing Umzug registration and must be idempotent because completion is logged after `up`. A failed migration stops startup.

### 12.3 Bootstrap data

Bootstrap definitions use a versioned schema and are create-only by default. If `(brand, record-type key)` already exists, skip and report it. Updating a deployed definition requires an explicit data migration; startup never merges or overwrites administrative state.

Remove destructive record-type/workflow reseeding behavior from `bootstrapAlways`.

## 13. Backend API

Use brand-scoped routes and existing `Admin` authorization. Suggested resource groups:

- list/get record-type identities and active summaries;
- create draft by cloning;
- get/save/discard draft with expected version;
- validate draft;
- publish draft;
- list/get immutable history;
- roll back to a historical revision by publishing a new revision;
- retire/unretire record type;
- list action descriptors available to the current deployment;
- write/replace/clear secret parameters without returning values;
- return workflow graph and publication-impact information.

All controllers delegate business logic to services, use established response formatting, and expose only explicitly exported actions. Server validation is authoritative; Formly validation is user guidance.

The legacy ActionController route and `sails.config.action` execution configuration are removed. No generic action-execution endpoint replaces them in this release.

### 13.1 Proposed route contract

Use the existing `/:branding/:portal` prefix. Final names may follow generator conventions, but implementations should converge on one resource family rather than adding unrelated controller endpoints.

| Method   | Suggested path                                                               | Purpose                                                                              |
| -------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`    | `/admin/record-definitions`                                                  | List stable identities, active revision, draft, validation, and retirement summaries |
| `POST`   | `/admin/record-definitions/:sourceKey/clone`                                 | Create a new identity and draft by cloning                                           |
| `GET`    | `/admin/record-definitions/:key`                                             | Get identity and active-definition summary                                           |
| `GET`    | `/admin/record-definitions/:key/draft`                                       | Get the shared draft                                                                 |
| `PUT`    | `/admin/record-definitions/:key/draft`                                       | Save draft with expected draft version                                               |
| `DELETE` | `/admin/record-definitions/:key/draft`                                       | Discard/reset the draft                                                              |
| `POST`   | `/admin/record-definitions/:key/validate`                                    | Run full publication validation and impact analysis                                  |
| `POST`   | `/admin/record-definitions/:key/publish`                                     | Publish using expected draft and active versions                                     |
| `GET`    | `/admin/record-definitions/:key/revisions`                                   | List immutable revision summaries                                                    |
| `GET`    | `/admin/record-definitions/:key/revisions/:revision`                         | Read an immutable revision and bounded diff metadata                                 |
| `POST`   | `/admin/record-definitions/:key/revisions/:revision/rollback`                | Validate and republish historical content as a new revision                          |
| `POST`   | `/admin/record-definitions/:key/retire`                                      | Retire the identity                                                                  |
| `POST`   | `/admin/record-definitions/:key/unretire`                                    | Restore creation availability                                                        |
| `GET`    | `/admin/record-actions`                                                      | List UI-safe registered action descriptors                                           |
| `PUT`    | `/admin/record-definitions/:key/draft/actions/:bindingId/secrets/:parameter` | Set or replace a write-only secret slot                                              |
| `DELETE` | `/admin/record-definitions/:key/draft/actions/:bindingId/secrets/:parameter` | Explicitly clear a secret slot                                                       |

Mutation requests carry explicit expected versions in the body or established concurrency header. Do not overload `PUT draft` with secret values. Response envelopes should use existing controller conventions.

### 13.2 Proposed backend ownership

Prefer small focused modules over extending `RecordsService` further:

- `ActionRegistryService`: immutable registry lookup, descriptor serialization, readiness validation.
- `RecordDefinitionValidationService`: canonicalization, draft/publish validation, impact analysis.
- `RecordDefinitionDraftService`: clone, get, save, and discard.
- `RecordDefinitionPublicationService`: publish, history, rollback, retirement, audit, and cache invalidation.
- `RecordDefinitionRuntimeService`: active-revision resolution and version-keyed cache.
- `WorkflowTransitionService`: authoritative manual and automatic transition resolution.
- `ActionSecretService` or provider: stable slot operations and handler-only resolution.
- `RecordDefinitionAdminController`: identity/draft/publication/history endpoints.
- `RecordActionAdminController`: UI-safe registry metadata and secret operations if separation improves authorization/testing.

Services follow the existing ReDBox service/export pattern. Controllers remain thin, explicitly export actions, and do not own validation or persistence logic.

### 13.3 Proposed model names

- Existing `RecordType`: stable identity and active/draft pointers.
- `RecordDefinitionDraft`: one mutable aggregate per record type.
- `RecordDefinitionRevision`: immutable aggregate revision.
- `RecordDefinitionHistory`: publication/rollback/retirement audit metadata if revision metadata alone is insufficient.
- `ActionSecret`: protected secret slot metadata/value through the provider boundary.

Names may change to match repository conventions, but their responsibilities and invariants must remain separate. Do not overload the existing mutable `WorkflowStep` row as an immutable aggregate revision.

## 14. Administration UI

Create a dedicated embedded Angular admin application, mounted through an EJS view and explicit Admin route/menu entry.

Recommended sections:

- record-type list with status, active revision, draft state, and retirement state;
- clone flow;
- record-type settings;
- ordered workflow-stage editor;
- transition editor with manual/automatic settings, roles, condition, and priority;
- action-binding editor using server-provided schemas converted to controlled Formly fields;
- write-only secret controls;
- read-only graph preview;
- validation and publication-impact panel;
- history, diff, rollback, and audit metadata;
- discard-draft and retirement confirmations.

The Angular HTTP service extends `HttpClientService`, waits for initialization, enables CSRF headers, uses `brandingAndPortalUrl`, and includes the standard HTTP context. The UI handles draft conflicts explicitly and never treats client-side validation as authoritative.

## 15. Operational behavior

- Nodes fail readiness when an active revision references unavailable actions.
- Draft-only unresolved actions are surfaced as validation errors.
- Definition publication and migration emit structured, bounded logs with correlation IDs.
- Action execution reports remain attached to record audit where supported.
- Secret values and unsafe input are redacted from errors and telemetry.
- Retired record types cannot create new records but remain resolvable for existing records and history.
- Published/referenced revisions cannot be deleted.

## 16. Key invariants

1. Database content never selects or constructs executable server code.
2. Runtime record operations never resolve a mutable draft.
3. A published revision is immutable and internally coherent.
4. A brand cannot read or mutate another brand's definitions or secret slots.
5. A stale draft save or publish cannot overwrite newer work.
6. A record cannot be stranded on an unknown stage by ordinary publication.
7. Action inputs, outputs, patches, policies, and dependencies are server validated.
8. No API returns secret values after initial submission.
9. Unknown legacy actions stop migration; they never fall back to eval.
10. The three PRs together constitute one deployable release.
