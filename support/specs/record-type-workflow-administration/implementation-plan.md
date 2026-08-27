# Detailed Implementation Plan

## 1. How the orchestrator should use this plan

Each task has a stable ID, dependencies, a bounded implementation scope, and a completion checklist. A delegated thread should own one task unless the task explicitly says it may be split. Threads must not mark a task complete merely because code exists: every listed test, migration fixture, documentation update, and evidence item is part of completion.

Rules for orchestration:

- Respect `Depends on`; do not let downstream threads invent contracts that an upstream task owns.
- Parallelize tasks only when their dependencies are complete and their file ownership does not overlap materially.
- Contract-owning tasks land types and tests before consumer tasks begin.
- Preserve unrelated worktree changes.
- Use exact dependency versions if dependencies are added.
- Do not release any individual PR independently; this is one stacked deployment.
- A task may be checked only when its acceptance evidence is recorded in the PR or orchestrator log.

Status legend:

- `[ ]` not started
- `[-]` in progress
- `[x]` complete with evidence
- `[!]` blocked, with the blocking task or external decision recorded

## 2. Dependency overview

```text
A01 current-behavior fixtures
 ├─ A02 registry contracts ─ A03 loader ─ A04 runtime resolver
 │                          ├─ A05 expression runtime
 │                          ├─ A06 secret abstraction
 │                          └─ A07 built-in action migrations
 ├─ A08 executor/result hardening ─ A09 record-save integration
 ├─ A10 automatic transition engine
 ├─ A11 legacy ActionController removal
 └─ A12 unsafe-expression guard/inventory

B01 persisted aggregate contracts
 ├─ B02 Waterline models/indexes
 ├─ B03 canonicalization/validation
 ├─ B04 draft service
 ├─ B05 publication/history service
 ├─ B06 runtime resolution/cache
 ├─ B07 transition service
 ├─ B08 secret-slot persistence
 ├─ B09 admin controllers/routes/auth
 ├─ B10 bootstrap seeds
 └─ B11 upgrade migration/preflight

C01 Angular app shell/service/contracts
 ├─ C02 list/clone/retire
 ├─ C03 record-type editor
 ├─ C04 stage/transition editor
 ├─ C05 action/Formly editor
 ├─ C06 graph preview
 ├─ C07 validation/publish/conflicts
 ├─ C08 history/rollback
 └─ C09 browser/API verification

R01 documentation/runbook ─ R02 full upgrade rehearsal ─ R03 release gate
```

## 3. PR 1 — Action foundation

### [ ] A01 — Capture legacy behavior and inventory every shipped record action

**Depends on:** none

**Scope**

- Inventory every `RecordHookDefinition.function` shipped by core, `redbox-hook-dev`, fixtures, and supported bundled hooks.
- Inventory nested executable structures such as `onNotifySuccess` and `runHooksSync`.
- Record each occurrence's lifecycle mode, phase, parameter shape, mutation behavior, return shape, failure semantics, and ordering assumptions.
- Trace create, update, delete, and workflow-transition orchestration in `RecordsService` and the record-hook coordinator.
- Create representative configuration/database fixtures for migration tests.
- Add characterization tests before changing runtime behavior.

**Completion checklist**

- [ ] A machine-readable legacy-action inventory exists.
- [ ] Every shipped expression has a proposed namespaced action ID and owner.
- [ ] Direct mutation, replacement-return, side-effect-only, and nested-callback behaviors are classified.
- [ ] Characterization tests assert phase and action order for all four lifecycle modes.
- [ ] Tests capture transition detection and `onTransitionWorkflow` behavior.
- [ ] Unsupported/unknown expressions are represented in a negative fixture.
- [ ] Inventory is linked from the migration documentation.

**Evidence**

- Focused core tests pass.
- Inventory count equals an automated repository scan count, with documented exclusions.

### [ ] A02 — Define shared action registry, binding, context, result, and schema contracts

**Depends on:** A01

**Scope**

- Add strongly typed contracts in an isolated core module and export supported public types.
- Define descriptor IDs, contract versions, provenance, contexts/phases, repetition rules, parameter schema, UI hints, output schema, safe output fields, patch/result union, and execution-policy bounds.
- Define action-binding IDs, parameters, ordering, dependencies, and policy overrides.
- Define safe identifier, size, nesting, and schema-version rules.
- Define a deliberately small parameter-schema vocabulary compatible with controlled Formly conversion.
- Include `secret` metadata without embedding secret values.

**Completion checklist**

- [ ] No deliberate `any` casts are used to bypass contract design.
- [ ] Descriptor and binding schemas have runtime validators as well as TypeScript types.
- [ ] Unknown properties are rejected at server boundaries.
- [ ] Contract versions are required and compared exactly.
- [ ] Result and patch types are closed discriminated unions.
- [ ] Parameter schema supports strings, multiline text, numbers, booleans, enums, arrays where required, JSONata, Handlebars, and write-only secrets.
- [ ] Server-safe defaults and maximums are explicit.
- [ ] Unit tests cover valid and invalid descriptors/bindings.

### [ ] A03 — Add hook action registration and loader validation

**Depends on:** A02

**Scope**

- Add hook capability metadata and `registerRedboxActions()` discovery.
- Register core actions through the same explicit mechanism.
- Build the registry from descriptors and direct handlers.
- Attach package/module provenance.
- Fail startup on duplicate IDs, invalid descriptors, asynchronous registration, missing handlers, or inconsistent contract versions.
- Expose read-only descriptor metadata for validation/UI without exposing handler references.

**Completion checklist**

- [ ] Loader documentation and hook type declarations include the new capability.
- [ ] Duplicate IDs fail regardless of hook priority.
- [ ] Registry ordering is deterministic.
- [ ] Handler functions cannot originate from persisted strings.
- [ ] Descriptor metadata serialization strips functions and internal details.
- [ ] Loader unit tests cover core-only, hook-provided, duplicate, malformed, and empty registries.
- [ ] Generated loader/shim behavior remains deterministic.

### [ ] A04 — Implement registry lookup and action-plan validation

**Depends on:** A02, A03

**Scope**

- Resolve bindings strictly by action ID plus contract version.
- Validate context/phase compatibility, parameters, dependency order, repetitions, safe outputs, and execution-policy bounds before any action runs.
- Precompile safe expressions/templates where appropriate.
- Produce path-addressed validation errors with action provenance.
- Ensure active-definition missing actions can drive readiness failure later.

**Completion checklist**

- [ ] No lookup reaches Sails globals, service names, module names, or property traversal from persisted values.
- [ ] Complete action plans are prevalidated before side effects.
- [ ] Dependencies can see only prior, declared safe outputs.
- [ ] Cycles, forward dependencies, missing contracts, and incompatible phases are rejected.
- [ ] Repeated actions obey descriptor policy.
- [ ] Unit tests cover every rejection category.

### [ ] A05 — Harden JSONata and Handlebars execution

**Depends on:** A02

**Scope**

- Reuse the fixed JSONata and Handlebars helper registries.
- Define versioned context projections for transition conditions, action parameters, text templates, and output dependencies.
- Add expression/template/input/result limits.
- Execute administrator-authored JSONata through an interruptible worker boundary with a hard timeout, or formally constrain the supported subset if worker isolation proves infeasible.
- Normalize errors without leaking context or secrets.

**Completion checklist**

- [ ] Forbidden bindings/helpers cannot be registered or referenced.
- [ ] Context projections contain no request, response, services, environment, filesystem, or secret data.
- [ ] Prototype/property escape tests fail safely.
- [ ] Oversized, deeply nested, recursively expensive, and timed-out expressions fail deterministically.
- [ ] Handlebars escaping is destination appropriate.
- [ ] Evaluation diagnostics are bounded and redacted.
- [ ] Security tests demonstrate that an ordinary timeout is not being misrepresented as interruption.

### [ ] A06 — Define the secret parameter provider boundary

**Depends on:** A02

**Scope**

- Define a provider API for write, replace, clear, resolve-for-handler, and configured-state checks.
- Define stable slot identity from brand, record type, action-binding ID, and parameter name.
- Ensure action handlers receive resolved secrets only when their descriptor declares the parameter.
- Keep external secret-manager implementations out of scope.

**Completion checklist**

- [ ] Secret values cannot appear in serialized bindings or descriptors.
- [ ] Omitted/blank, replace, and explicit-clear semantics are unambiguous.
- [ ] Provider errors are redacted.
- [ ] Slot ownership is brand-isolated.
- [ ] Unit tests cover slot stability and cross-brand denial.

### [ ] A07 — Register and normalize every shipped legacy record action

**Depends on:** A01, A02, A03, A04, A05, A06, A08

**Scope**

- Implement descriptors/handlers for every action identified by A01.
- Refactor handlers to immutable input and typed result contracts.
- Replace Lodash conditions with JSONata and text interpolation with Handlebars where needed.
- Flatten action-specific nested callbacks into ordered bindings with generic dependencies.
- Define legacy-expression mapping and parameter transforms.

**Completion checklist**

- [ ] Every inventory entry maps to a tested registered action or is explicitly rejected with migration guidance.
- [ ] No migrated handler mutates its input object directly.
- [ ] Patch/replacement results validate before application.
- [ ] Side-effecting actions declare idempotency and bounded policy correctly.
- [ ] Secret-bearing actions use secret slots or existing server-owned configuration.
- [ ] Per-action unit tests cover success, validation failure, runtime failure, timeout, and redaction where applicable.
- [ ] Characterization tests document every intentional behavior difference.

### [ ] A08 — Enforce immutable inputs and typed results in the executor

**Depends on:** A01, A02

**Scope**

- Adapt existing `action-execution` infrastructure to registered handlers.
- Freeze/clone public inputs as appropriate.
- Validate results and patches before applying them.
- Preserve sequential fail-fast `pre`/`postSync` and detached `post` semantics.
- Integrate typed safe outputs for dependency evaluation.
- Retain execution reports, retries, timeouts, idempotency, cancellation metadata, and structured failure normalization.

**Completion checklist**

- [ ] Direct mutation attempts cannot alter the authoritative candidate.
- [ ] Invalid patches/replacements fail closed.
- [ ] Detached actions cannot mutate persisted state through returned values.
- [ ] Prior-action safe outputs are bounded and redacted.
- [ ] Existing execution report schema remains compatible or has an explicit schema migration.
- [ ] Characterization, retry, timeout, fail-fast, detached, and shutdown tests pass.

### [ ] A09 — Replace record hook eval resolution with registered action plans

**Depends on:** A04, A07, A08

**Scope**

- Replace `RecordsService.configuredHookFunction` and `TriggerService.runHooksSync` eval pathways for managed record actions.
- Adapt record create/update/delete/transition orchestration to bindings and typed contexts.
- Preserve current observable action order through characterization tests.
- Carry action execution summaries into existing record audit responses.

**Completion checklist**

- [ ] No managed record hook runtime path calls `eval` or resolves a function string.
- [ ] Create/update/delete/transition tests pass for empty and populated action plans.
- [ ] Optimistic-concurrency/CAS behavior remains correct around pre and postSync actions.
- [ ] Failures are mapped to existing safe record-save problem responses.
- [ ] Unknown action IDs fail before record side effects.

### [ ] A10 — Implement explicit automatic transition evaluation

**Depends on:** A02, A05, A09

**Scope**

- Replace the legacy `transitionWorkflow` mutating action with first-class automatic transition evaluation.
- Evaluate eligible transitions from the current stage in unique priority order.
- Apply only the first match and at most one automatic transition per save.
- Route stage/form changes through the authoritative transition engine.
- Trigger existing transition action semantics after detection.

**Completion checklist**

- [ ] Duplicate priorities are rejected.
- [ ] No-match, one-match, and competing-match behavior is deterministic.
- [ ] Automatic transition chaining cannot occur.
- [ ] Condition evaluation uses the safe JSONata context.
- [ ] Stage, label, form, validation, and audit state remain coherent.
- [ ] Legacy embargo/publication examples migrate and pass characterization tests.

### [ ] A11 — Remove the legacy ActionController surface

**Depends on:** none

**Scope**

- Remove the configured action route, auth entry, controller export, configuration contract/default, generated shim references, tests, and documentation.
- Confirm no shipped Angular app, EJS view, test suite, or hook uses it.
- Do not add a replacement generic execution endpoint.

**Completion checklist**

- [ ] Repository search finds no runtime `sails.config.action` execution path.
- [ ] The old route returns not found.
- [ ] Loader generation and compile succeed without the controller/config.
- [ ] Breaking-change release notes identify removal.

### [ ] A12 — Add unsafe-expression inventory and regression guard

**Depends on:** A01

**Scope**

- Document direct eval and unsafe configuration-template sites outside the managed scope.
- Add a static test/lint guard preventing new direct eval and unsafe `_.template` configuration execution.
- Maintain an allowlist containing only explicitly documented legacy sites, with owner and follow-up issue.
- Ensure managed record/workflow and removed ActionController code have no allowlist entries.

**Completion checklist**

- [ ] Guard fails on a deliberately introduced fixture.
- [ ] Existing allowlist entries include paths, rationale, and follow-up identifiers.
- [ ] The allowlist cannot grow without an explicit test/document change.
- [ ] Documentation does not claim system-wide remediation.

## 4. PR 2 — Versioned definition backend

### [ ] B01 — Define persisted aggregate and API contracts

**Depends on:** A02, A10

**Scope**

- Define schema-versioned record-type identity, draft, immutable revision, stage, transition, action-binding, validation-report, impact-report, history-summary, and conflict contracts.
- Define canonical IDs and safe naming rules.
- Separate deployment-owned/read-only fields from administrable fields.
- Share only appropriate DTOs with Angular through `sails-ng-common` or the established shared package.

**Completion checklist**

- [ ] Contracts represent every locked decision in the architecture.
- [ ] Secret values are impossible in public revision/binding DTO types.
- [ ] DTOs distinguish draft-incomplete from publishable definitions.
- [ ] Schema versions and upgrade strategy are documented.
- [ ] Runtime validation tests cover unknown fields and bounds.

### [ ] B02 — Add Waterline models, relations, and indexes

**Depends on:** B01

**Scope**

- Extend stable `RecordType` identity with active/draft lifecycle references and retirement metadata.
- Add draft, immutable revision, definition history/audit, and secret-slot models as required.
- Add unique constraints and supporting indexes for brand identity, revision numbers, draft uniqueness, history order, and secret slots.
- Update model exports and generated shim coverage.

**Completion checklist**

- [ ] `(brand, record-type key)` remains unique.
- [ ] One shared draft per record type is enforced.
- [ ] Revision numbers and canonical hashes are immutable and indexed.
- [ ] Cross-brand relations cannot be constructed through service APIs.
- [ ] Model lifecycle hooks do not perform unsafe asynchronous work.
- [ ] Model and shim-generation tests pass.

### [ ] B03 — Implement canonicalization, draft validation, and publish validation

**Depends on:** A04, A05, B01

**Scope**

- Build deterministic canonicalization/hashing.
- Implement payload-safety validation for draft saves.
- Implement complete graph, role, form, validation-operation, action, expression, policy, stage-impact, and storage-capability validation for publication.
- Return stable error codes and JSON-pointer-like paths.

**Completion checklist**

- [ ] Semantically equivalent definitions hash identically.
- [ ] Drafts can save while semantically incomplete.
- [ ] All architecture publication rules have positive and negative tests.
- [ ] Referenced-stage removal/rename is blocked.
- [ ] Validation never executes action handlers.
- [ ] Errors are safe, bounded, deterministic, and UI-addressable.

### [ ] B04 — Implement draft lifecycle service

**Depends on:** B02, B03

**Scope**

- Create draft by cloning an existing active record type.
- Get, save with optimistic concurrency, discard/reset, and inspect draft status.
- Strip secret values and environment-specific IDs during clone.
- Attribute saves to the actor without generating permanent audit noise per keystroke.

**Completion checklist**

- [ ] Blank-slate creation is not exposed.
- [ ] Stale writes return the current version and structured conflict metadata.
- [ ] Draft save never changes runtime behavior.
- [ ] Discard reconstructs from active revision safely.
- [ ] Brand-isolation and concurrent-editor integration tests pass.

### [ ] B05 — Implement publication, history, rollback, and retirement services

**Depends on:** B02, B03, B04

**Scope**

- Publish through validation, canonical revision creation, durable audit/history, and atomic active-pointer compare-and-swap.
- Handle harmless orphan revisions after CAS loss.
- List/get immutable history and bounded diffs.
- Roll back by publishing a new revision; require a reason.
- Retire/unretire stable record types while preserving existing-record resolution.

**Completion checklist**

- [ ] Publication uses expected draft and active versions.
- [ ] Concurrent publishes produce exactly one winner.
- [ ] Runtime never observes a partially published aggregate.
- [ ] Rollback revisions are monotonic and revalidated.
- [ ] Published/referenced revisions cannot be deleted.
- [ ] Retirement blocks new-record creation but not existing-record reads/history.
- [ ] Actor, hashes, diffs, validation, and operation metadata are durable and redacted.

### [ ] B06 — Implement runtime active-definition resolution and cache coherence

**Depends on:** B02, B05

**Scope**

- Resolve active aggregate definitions for record operations.
- Replace or bound existing mutable record-type caches.
- Cache by immutable revision/version.
- Invalidate locally on publish and support cross-instance detection through shared invalidation or a bounded TTL.
- Add readiness validation for active action references.

**Completion checklist**

- [ ] Drafts are never returned by runtime resolution.
- [ ] Publication becomes visible without restart.
- [ ] Multi-instance tests demonstrate bounded convergence.
- [ ] Active missing actions fail readiness; draft missing actions do not.
- [ ] Cache behavior preserves brand isolation.

### [ ] B07 — Implement authoritative manual transition service

**Depends on:** B03, B06, A09, A10

**Scope**

- Resolve transitions by stable ID from the active revision.
- Check source stage, record authorization, transition roles, JSONata eligibility, validation operation, optimistic record concurrency, and bound actions.
- Persist target stage/form through the normal record-save path.
- Emit transition/action audit evidence.

**Completion checklist**

- [ ] Client-supplied labels, roles, target stages, and validation groups are ignored as authority.
- [ ] UI-hidden transitions cannot be invoked when server conditions fail.
- [ ] Transition roles are constrained by source-stage authorization.
- [ ] Stale record revisions fail safely.
- [ ] Pre/postSync/post actions retain characterized order.
- [ ] Controller-independent service tests cover all denial modes.

### [ ] B08 — Implement protected secret-slot persistence

**Depends on:** A06, B02

**Scope**

- Implement the initial protected-storage provider.
- Write/replace/clear values separately from definition snapshots.
- Resolve secrets only for a declared action parameter at execution time.
- Redact models, logs, errors, history, diffs, and API serialization.

**Completion checklist**

- [ ] Read APIs expose only configured state.
- [ ] Blank retains, replace changes, and explicit clear removes.
- [ ] Clone does not copy secret values.
- [ ] Rollback does not resurrect historical secret values.
- [ ] Cross-brand and cross-binding access tests fail closed.
- [ ] Backup/operational documentation identifies protection limitations and future provider seam.

### [ ] B09 — Add Admin controllers, routes, authorization, and API tests

**Depends on:** B04, B05, B07, B08

**Scope**

- Add controller/service endpoints described in the architecture.
- Add routes and existing Admin authorization rules.
- Use established controller response handling and Sails-dependent initialization conventions.
- Enforce CSRF for mutations and brand resolution for every request.
- Expose serialized action descriptor metadata and write-only secret operations.

**Completion checklist**

- [ ] Every controller action is explicitly exported and routed.
- [ ] Non-Admin, unauthenticated, missing-CSRF, stale-version, and cross-brand requests are denied.
- [ ] Posted bodies receive authoritative server validation.
- [ ] No endpoint exposes handlers, secret values, internal errors, or mutable revision objects.
- [ ] Controller unit/integration tests and Bruno API coverage pass.

### [ ] B10 — Replace destructive bootstrap with versioned create-only seeds

**Depends on:** B02, B03, B05

**Scope**

- Define versioned bootstrap aggregate data.
- Seed only missing `(brand, record-type key)` identities.
- Report skips and creations.
- Remove `bootstrapAlways` destruction/reseeding of record types and workflow steps.
- Require explicit migrations for modifications to deployed definitions.

**Completion checklist**

- [ ] Repeated startup is idempotent.
- [ ] Administrative changes survive restart with `bootstrapAlways` enabled elsewhere.
- [ ] Existing definitions are neither merged nor overwritten.
- [ ] Malformed seed data fails validation before persistence.
- [ ] Multi-brand bootstrap tests pass.

### [ ] B11 — Implement preflight and breaking database migration

**Depends on:** A07, B02, B03, B05, B10

**Scope**

- Add an Umzug migration registered through the supported loader mechanism.
- Build each brand's initial aggregate from its persisted record type and workflow steps.
- Convert legacy functions, options, conditions, nested callbacks, and automatic transitions.
- Create initial immutable revision, history, active pointer, and clean draft if required.
- Provide a read-only preflight command/report using the same transformation logic.
- Make the migration idempotent and fail startup on unknown/unsafe input.

**Completion checklist**

- [ ] Every representative database fixture migrates independently per brand.
- [ ] Default-brand data is never copied over another brand.
- [ ] Unknown expressions and unsupported mutations stop migration.
- [ ] Rerunning after partial failure is safe.
- [ ] Completion counts, hashes, warnings, and provenance are logged without secrets.
- [ ] No legacy function string persists in the new aggregate.
- [ ] Legacy `WorkflowStep` authority and compatibility projection lifecycle are explicitly resolved.

## 5. PR 3 — Administration UI

### [ ] C01 — Scaffold the embedded Angular admin application and HTTP service

**Depends on:** B01 and stable B09 API contracts

**Scope**

- Create the Angular project, EJS shell, build configuration/output, Admin route, auth entry, and navigation item.
- Add shared DTOs and a typed service extending `HttpClientService`.
- Wait for configuration initialization, enable CSRF, use `brandingAndPortalUrl`, and supply standard HTTP context.

**Completion checklist**

- [ ] App builds and mounts under each brand path.
- [ ] Non-Admins cannot render the page or call its APIs.
- [ ] HTTP service unit tests assert URLs, CSRF context, payloads, and error mapping.
- [ ] CSP nonce/hashed asset behavior follows existing admin applications.

### [ ] C02 — Implement record-type list, clone, retirement, and draft status

**Depends on:** C01, B09

**Scope**

- Display active revision, draft state, updated actor/time, validation summary, and retirement state.
- Clone an existing record type into a new draft key.
- Confirm retirement/unretirement and explain its effect on new versus existing records.
- Do not expose blank-slate creation or physical deletion.

**Completion checklist**

- [ ] List state is brand-scoped and refreshable.
- [ ] Clone strips secret/configured state as defined.
- [ ] Duplicate keys and stale operations display actionable errors.
- [ ] Retired types remain visible and inspectable.
- [ ] Component and browser tests pass.

### [ ] C03 — Implement record-type settings editor

**Depends on:** C01, B04

**Scope**

- Edit labels, searchability, search filters, relationships, transfer-responsibility rules, validation policy, concurrency policy, and record lifecycle action bindings.
- Display deployment-owned `packageType`/`searchCore` fields read-only where useful.
- Include dashboard configuration only for fields migrated to safe expression engines.
- Autosave or explicitly save with draft optimistic concurrency.

**Completion checklist**

- [ ] Unknown/raw JSON fields are not generally editable.
- [ ] Server path-addressed errors map back to controls.
- [ ] Stale-draft conflicts preserve local changes and offer reload/reconcile behavior.
- [ ] Accessibility labels, keyboard operation, dirty state, and leave-page warnings are tested.

### [ ] C04 — Implement ordered stage and transition editor

**Depends on:** C01, B03, B04

**Scope**

- Add/reorder/edit stages and transitions.
- Support form, view/edit roles, starting/terminal state, validation overrides, manual roles, automatic priority, condition, validation operation, and transition action bindings.
- Treat published stage keys and base record type as immutable.
- Show referenced-stage deletion/rename restrictions before publication.

**Completion checklist**

- [ ] Exactly-one-starting-stage feedback is clear.
- [ ] Manual and automatic transition controls differ appropriately.
- [ ] Duplicate IDs/priorities and dangling targets are surfaced.
- [ ] Form, role, action, and validation-operation options come from authoritative APIs.
- [ ] Editor remains keyboard accessible without graph manipulation.

### [ ] C05 — Implement schema-driven action-binding and secret controls

**Depends on:** C01, A02, B08, B09

**Scope**

- Convert the controlled server parameter schema into Formly fields.
- Support action selection filtered by context/phase.
- Edit order, dependencies, bounded policy overrides, JSONata, Handlebars, and ordinary parameters.
- Render secret fields as configured/unconfigured write-only controls with replace/clear operations.

**Completion checklist**

- [ ] Raw Formly config is never accepted from descriptors or users.
- [ ] Client control types cover the supported schema vocabulary.
- [ ] Unsupported schema versions fail visibly.
- [ ] Secret values are cleared from component memory after submission and never redisplayed.
- [ ] Dependency choices include only earlier compatible bindings and declared output fields.
- [ ] Client validation is clearly advisory; server errors remain authoritative.

### [ ] C06 — Implement read-only workflow graph preview

**Depends on:** C04

**Scope**

- Render stages, manual transitions, automatic transitions, starting/terminal status, and invalid/unreachable states.
- Keep editing in structured controls rather than drag-and-drop.
- Provide an accessible textual/tabular equivalent.

**Completion checklist**

- [ ] Graph updates from draft state without mutating it.
- [ ] Automatic priorities and conditions are discoverable.
- [ ] Invalid edges/stages link back to editor controls.
- [ ] Large but bounded graphs remain usable.
- [ ] Accessibility tests cover the non-visual equivalent.

### [ ] C07 — Implement validation, impact, publication, conflicts, and discard flows

**Depends on:** C03, C04, C05, B05, B09

**Scope**

- Run explicit validation and display errors/warnings by path.
- Display referenced-stage impact and publication diff.
- Publish with expected draft/active versions and optional note.
- Handle CAS conflict, readiness/action mismatch, and stale validation.
- Discard draft after confirmation.

**Completion checklist**

- [ ] Publish is disabled only as guidance; server rejection is always handled.
- [ ] Warnings require explicit acknowledgement where policy demands it.
- [ ] Success updates active/draft state without page restart.
- [ ] Conflicts never silently discard local work.
- [ ] Publication never submits secret values as part of the aggregate.

### [ ] C08 — Implement history, diff, and rollback UI

**Depends on:** C01, B05, B09

**Scope**

- List immutable revisions and actors/timestamps/operations.
- Show bounded structural diffs without secrets.
- Preview rollback validation/impact.
- Require rollback reason and publish the result as a new revision.

**Completion checklist**

- [ ] Historical revisions are read-only.
- [ ] Rollback never appears to decrement version numbers.
- [ ] Diff and audit metadata contain no secrets.
- [ ] Failed rollback leaves the active revision unchanged.
- [ ] Component and browser tests pass.

### [ ] C09 — Add browser-level administration verification

**Depends on:** C02, C03, C04, C05, C06, C07, C08

**Scope**

- Add natural-language/browser verification for Admin login, clone, edit, conflict, validation failure, action configuration, automatic transition graph, publish, runtime use, history, rollback, retirement, and authorization denial.
- Capture stable screenshots or artifacts where the repository's verification workflow expects them.

**Completion checklist**

- [ ] Admin completes the full happy path without direct database manipulation.
- [ ] Non-Admin access is denied at page and API layers.
- [ ] Two-editor conflict is demonstrated.
- [ ] Secret replacement never reveals the prior value.
- [ ] Published automatic and manual transitions execute as configured.
- [ ] Rollback creates a new active revision.

## 6. Cross-cutting release tasks

### [ ] R01 — Update developer, administrator, migration, and security documentation

**Depends on:** A12, B11, C09

**Scope**

- Replace record hook documentation with action definitions/bindings and migration guidance.
- Update record-type/workflow configuration and loader docs.
- Document bootstrap-data schema and create-only semantics.
- Document administration workflows, secret limitations, rollback, retirement, cache behavior, and troubleshooting.
- Add breaking-change notes for removed ActionController and eval hooks.
- Link the remaining unsafe-expression inventory and follow-up work.

**Completion checklist**

- [ ] Wiki pages no longer instruct users to enter function strings or Lodash code in managed definitions.
- [ ] Hook authors have a complete registered-action example.
- [ ] Operators have preflight, migration, recovery, and multi-instance deployment steps.
- [ ] Administrators understand draft versus published behavior and stage-key restrictions.

### [ ] R02 — Run representative full-stack upgrade rehearsal

**Depends on:** A01–A12, B01–B11, C01–C09, R01

**Scope**

- Upgrade a representative version-5 database with multiple brands, existing records in several stages, all shipped hook types, nested callbacks, secrets, and an intentionally unknown expression fixture.
- Exercise failure, repair, idempotent rerun, startup readiness, publication, record save, automatic/manual transition, rollback, and restart/cache convergence.

**Completion checklist**

- [ ] Known fixture upgrades without legacy executable strings.
- [ ] Unknown fixture fails before unsafe runtime begins.
- [ ] Repair and rerun complete without duplicate revisions/history.
- [ ] Existing records remain readable and operable.
- [ ] Administrative changes survive restart.
- [ ] Multi-brand hashes/counts match the preflight report.
- [ ] No secret appears in captured logs, APIs, diffs, or test artifacts.

### [ ] R03 — Final release gate and completion audit

**Depends on:** R02

**Scope**

- Audit every checklist item and linked evidence.
- Run compile, unit, integration, Bruno, Angular, browser, static security, and migration suites.
- Verify the three PRs form one deployment stack and document merge/deployment order.
- Confirm all deferred work has explicit follow-up tickets.

**Completion checklist**

- [ ] All task boxes A01–R02 are complete with evidence.
- [ ] No active definition references a missing action.
- [ ] Repository scans find no managed-path eval/function-string execution.
- [ ] Required commands pass in the supported Docker/test environments.
- [ ] Upgrade and rollback runbooks have been peer reviewed.
- [ ] Release notes identify all breaking changes and operational prerequisites.
- [ ] The full stack is approved for deployment; no individual PR is presented as independently releasable.

## 7. Required verification matrix

| Area                 | Minimum verification                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Types and validators | Unit tests for every descriptor, binding, aggregate, result, patch, and error code               |
| Loader               | Core/hook registration, malformed export, duplicate ID, deterministic provenance                 |
| Execution            | Ordering, failure modes, retry, timeout, idempotency, detached work, immutable input             |
| Expressions          | Context isolation, prototype escape, limits, interruption, redaction                             |
| Definitions          | Draft incompleteness, publish validity, hashing, history, rollback, retirement                   |
| Concurrency          | Stale draft save, concurrent publish, stale record transition, multi-instance cache              |
| Migration            | Every shipped action, nested dependency, unknown expression, partial failure, rerun, multi-brand |
| Secrets              | Write-only API/UI, retain/replace/clear, clone, rollback, logs/diffs, cross-brand isolation      |
| Authorization        | Admin success, non-Admin denial, CSRF denial, brand isolation                                    |
| Angular              | Service, components, path errors, conflicts, accessibility, graph textual equivalent             |
| End to end           | Clone → edit → validate → publish → runtime save/transition → history → rollback                 |

## 8. Suggested verification commands

Confirm exact scripts against `package.json` when implementation begins. Expected categories include:

- `npm run compile:server`
- focused package/core unit tests
- `npm run test:mocha:mount`
- `npm run test:bruno:general:mount`
- the relevant Angular project test command, using `support/unit-testing/angular/testDevAngular.sh` where appropriate
- the repository browser/web-interface verification workflow
- the new unsafe-expression static guard
- the migration preflight and representative upgrade rehearsal

Do not mark R03 complete from a subset of these categories.
