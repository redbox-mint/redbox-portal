# Granular Task List

This is the execution checklist for the authorization delivery. Read [design.md](design.md), [implementation_plan.md](implementation_plan.md), and [Application Authorization and Permission Model](../../wiki/Application-Authorization-and-Permission-Model.md) before starting. If this checklist conflicts with the design, stop and resolve the design rather than improvising a new security contract.

Tasks are ordered by dependency. Keep checkboxes accurate in the implementation branch and attach test/evidence links beside completed stop gates.

## Bounded-worktree qualification (2026-09-06 round)

This round verifies repository behavior only with bounded checks runnable in
this worktree (nested controller suites, focused Phase 5/service suites, core
`src`/`test` `tsc`, lint, Prettier, `git diff --check`, API/OpenAPI route
suites with timeout, Angular common/manage-users build/type/spec where
feasible). The following are explicitly NOT claimed as repository-verified in
this round and remain open operational/release gates: Docker/Mongo
concurrency, overlapping-transaction races, commit/rollback on live
datastores, restart/rollback rehearsal, recovery on real deployments, Bruno
collections run against a live portal, browser/Playwright workflows, numeric
performance (query-count/latency budgets, p95/p99), and product/security
sign-off. Historical `[x]` marks below record prior implementation state, not
a fresh full-stack release qualification. Gate A and the operational phases
14 through 16 remain OPEN (see the ledger below and sections 14/15).

## Reconciled delivery evidence through Phase 9

This ledger reconciles the implementation at `219cff3cb` plus the final council
remediation without rewriting the original granular planning inputs below. A
phase marked implemented means the repository contains its production slice and
owned tests; it does not by itself claim product/security approval or a fresh
full-stack release qualification.

| Phase | Repository evidence                                                                                                    | Stop-gate status for this remediation                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Route/writer/resource inventories, compatibility fixtures, and explicit security-difference tests                      | **Gate A remains open:** the numeric performance budget and external product/security sign-off are not recorded.                                          |
| 1     | Pure contracts, registry, templates, validators, decisions, hook-provider loading, and unit tests                      | Gate B implementation evidence is present.                                                                                                                |
| 2     | Persistence models, required transactions, audit/shadow storage, replica-set profiles, and integration tests           | Gate C implementation evidence is present; release qualification still reruns the maintained profiles.                                                    |
| 3     | Migration, catalog/template reconciliation, protected bootstrap, drift reporting, and Phase 3 tests                    | Gate D implementation evidence is present. Final remediation adds fail-closed revoked/suppressed/expired bootstrap regressions.                           |
| 4     | Immutable authorization contexts, bounded effective-role/scope resolution, compatibility projection, and Phase 4 tests | Gate E functional evidence is present; the Gate A numeric performance approval remains open.                                                              |
| 5     | `RoleAdministrationService`, CAS/transactions/audit, protected floors/quorum, preview/apply, and Phase 5 tests         | Gate F implementation evidence is present. Final remediation makes adoption canonical and tests tampering, impact drift, and the successful round trip.   |
| 6     | Explicit route targets, central source map, rollout modes, policies, conditional CSRF, and Phase 6 tests               | Gate G implementation evidence is present. Final remediation proves explicit-target/central-map/fail-closed resolution and enforce-mode no-rule behavior. |
| 7     | Brand/entity/record gates, maintained resource inventory, background/WebSocket boundaries, and Phase 7 tests           | Gate H implementation evidence is present.                                                                                                                |
| 8     | 33 authorization contract routes, runtime schemas, controllers, OpenAPI, Bruno, and Phase 8 integration suites         | Gate I implementation evidence is present; release qualification still requires the full mounted matrix.                                                  |
| 9     | Embedded `manage-roles` models/service/tabs, component tests, builds, and Playwright workflows                         | Gate J implementation evidence is present; the optional CSV/JSON bulk-assignment UI is explicitly deferred.                                               |

**Gate A disposition (2026-08-31): OPEN — external release input required.**
The repository has a deterministic bounded-query regression that asserts one
assignment, role, template-revision, and override query for a multi-role/system
administrator resolution in
[`AuthorizationService.test.ts`](../../../packages/redbox-core/test/services/AuthorizationService.test.ts).
That is implementation evidence, not the missing legacy latency baseline or an
approved numeric p95/p99 authorization-overhead budget. No product/security
approval record is present in the repository. Those two approvals cannot be
created by a code change and remain explicit release blockers; Phase 9
repository implementation is complete, but Gate A and any later enforce/release
readiness claim remain open. Remediation (2026-09-03): the readiness report now
models these gates as fail-closed blockers driven by operator-supplied
`authorization.releaseEvidence`, and `npm run authorization:readiness` reports
them; supplying the durable evidence remains an external release action.

**Remediation ledger (2026-09-03): phases 10 through 13 implemented.**
This remediation round completed the repository implementation of phases 10
through 13 on top of `219cff3cb` and the final council remediation:

- Phase 10: `requiredScope` on menu/home-panel/admin-sidebar configuration
  (schema editors included), mode-aware navigation evaluation with fail-closed
  unknown-scope handling in `enforce`, navigation shadow-mismatch evidence,
  migrated default navigation entries with a navigation/route scope parity
  test, and the shared `AuthorizationProjectionService` in `portal-ng-common`
  consumed by `manage-roles`.
- Phase 11: onboarding confirmed on `RoleAdministrationService` with
  `getNestedRoles()` deprecated and removed from exported runtime methods;
  user create/update role flows converted to a guarded assignment-service
  adapter (Guest/system/cross-brand rejection, response shape preserved);
  linked-account authority canonicalized through the guarded writer; legacy
  AJAX role routes carry `Deprecation`/successor headers.
- Phase 12: bearer hardening verified through policy tests plus automated
  credential-sentinel leakage coverage for Problem Details, CSRF denials, and
  audit payloads; integrator migration documented.
- Phase 13: readiness report extended with the fail-closed release-evidence
  gates; operator readiness and system-administrator recovery commands added
  (`scripts/authorization-readiness.js`, `scripts/recover-system-admin.js`);
  shadow mismatch acknowledgement and bounded retention added.
- Phase 15 documentation deliverables (administration, scope catalog, hook
  contract, migration/rollout, bearer migration, operations) published under
  `support/wiki/` and indexed.

Phases 14 through 16 remain operational/planning work that cannot be completed
by repository changes alone: representative-traffic shadow evidence, external
product/security/operations/hook-owner/integrator approvals recorded as release
evidence, rollback rehearsal, deployment to production, and the integrator
evidence gate for compatibility retirement (phase 16 is explicitly unscheduled).
The maintained wiki, production/test files, and these three planning inputs are
retained under `support/` as versioned repository artifacts.

## Orchestrator working rules

- [ ] Treat phase 1 as authorization only; do not add an OAuth server, access-token issuer, refresh-token issuer, or mandatory auth-server dependency.
- [ ] Preserve unrelated worktree changes and inspect `git status` before each task batch.
- [ ] Work in small vertical slices with tests beside production changes.
- [ ] Do not mark a task complete until its tests run successfully or a documented environment blocker is attached.
- [ ] Do not skip a stop gate. Later phases may be prepared, but authoritative behavior must not advance past an unmet gate.
- [ ] Keep the pure authorization module free of Sails/Waterline/Express dependencies.
- [ ] Route all supported role/template/assignment writes through `RoleAdministrationService`.
- [ ] Never use `runWithOptionalTransaction` for authorization mutations.
- [ ] Never trust client-supplied effective scopes, role membership, brand authority, impact counts, auth method, or internal-process identity.
- [ ] Keep role `key`/legacy `name` immutable; expose label edits through `displayName`.
- [ ] Keep Guest implicit and reject explicit Guest assignments.
- [ ] Preserve brand checks and record ACL checks as independent gates after action-scope checks.
- [ ] Use bounded enums/identifiers in logs and metrics; never emit credentials, raw claims, usernames, arbitrary entity IDs, or authorization headers.
- [ ] Use exact dependency versions if a dependency is unavoidable; prefer no new dependency.
- [ ] Put maintained project documentation in `support/wiki/` and update its index.
- [ ] Run focused checks after each task, package checks at each section gate, and the full relevant integration/API/browser matrix before enforce readiness.
- [ ] If a task reveals a decision-changing ambiguity, update `design.md` and `implementation_plan.md` first and record the reason.

## 0. Establish the compatibility and security baseline

### 0.1 Generate the complete route inventory

- [x] Use the deterministic read-only route inventory test/inspection command; no temporary standalone script is retained.
- [x] Include hook-provided contract routes from the merged route registry.
- [x] Parse non-contract route objects from `packages/redbox-core/src/config/routes.config.ts`.
- [x] Validate generated/runtime hook routes in the deterministic lift-time inventory; the maintained source artifact explicitly cannot enumerate deployment-specific hooks that are not installed.
- [x] Normalize methodless Sails routes to an explicit wildcard method in stable IDs and flag them in the inventory.
- [x] Assign a stable route ID based on method, normalized path, controller, and action.
- [x] Record current `PathRule` matches for representative concrete variants of each path.
- [x] Record current authentication expectations: anonymous, session, bearer, or pre-auth infrastructure.
- [x] Record whether the action touches a brand-owned entity or record.
- [x] Record the proposed business scope or an explicit `public`/`pre-auth` reason.
- [x] Flag routes currently allowed because no path rule matches.
- [x] Flag broad path rules that mask a more specific business action.
- [x] Commit the reviewed mapping to `packages/redbox-core/src/authorization/legacy-route-scope-map.ts` when that module exists.
- [x] Generate `support/wiki/Authorization-Route-Scope-Inventory.md` from the mapping.

Complete for the source snapshot when every runtime-reachable core action is represented once and no row has an unexplained authorization state. Deployment readiness repeats the same validation against the actually installed hook set.

### 0.2 Inventory role mutation and consumption

- [x] Find every read of `User.roles`, `Role.users`, `Role.name`, and `req.user.roles`.
- [x] Find every `User.addToCollection(..., 'roles')`, `replaceCollection`, and equivalent mutation.
- [x] Find every call to `UsersService.updateUserRoles()`.
- [x] Find every call to `RolesService.getNestedRoles()` and identify the onboarding provider.
- [x] Inventory role-name checks in controllers, services, policies, visitors, EJS, Angular, and hooks.
- [x] Inventory `requiredRoles` in menu, home-panel, admin-sidebar, form, and hook configuration.
- [x] Inventory local-user, AAF, OIDC, linked-account, bootstrap, and claim-hook role flows.
- [x] Classify each writer as supported API, internal implementation, hook contract, or unsupported direct database usage.
- [x] Define the exact compatibility response shape required for `/admin/roles/get` and `/admin/roles/user`.

Complete when each role writer has a named migration task to the new service or an explicit unsupported/deprecated classification.

### 0.3 Inventory brand-owned resources

- [x] Enumerate records, deleted records, attachments, vocabularies, vocabulary entries, forms, record types, workflow/config objects, reports, named queries, dashboard config, app config, branding config/assets, harvest data, integration data, and hook entities.
- [x] Identify controller/service operations that query only by entity ID.
- [x] Identify create/update bodies that can supply or change `branding`.
- [x] Identify list/search/export paths that could omit a brand predicate.
- [x] Identify internal jobs and hook calls using ambient/default brand state.
- [x] Assign each resource family an authoritative service method and phase-7 test file.
- [x] Give records and vocabularies explicit first-priority remediation status.

Complete when every in-scope brand-owned resource has an owner, brand-source rule, and test target.

### 0.4 Capture legacy decision fixtures

- [x] Create two brands with Guest, Researcher, Librarians, Admin, custom role, and bootstrap administrator fixtures.
- [x] Capture anonymous and authenticated route decisions for each legacy role combination.
- [x] Capture multiple-role decisions without interpreting them as hierarchy.
- [x] Capture local, AAF, OIDC, linked-account, and legacy bearer principal shapes.
- [x] Capture absent, malformed, unknown, revoked, and disabled-user bearer behavior.
- [x] Capture direct-user record view/edit ACL decisions.
- [x] Capture role `viewRoles`/`editRoles` and edit-implies-view decisions.
- [x] Capture search/Solr, export, attachment, related-record, and deleted-record outcomes.
- [x] Separate unsafe legacy behavior from behavior that must be preserved.
- [x] Ensure snapshots redact token/password/session/raw claim values.
- [ ] Capture a reproducible legacy query-count and request-latency baseline and record the agreed maximum authorization overhead. **OPEN — external release evidence:** bounded new-model query counts are asserted in [`AuthorizationService.test.ts`](../../../packages/redbox-core/test/services/AuthorizationService.test.ts), but no legacy latency baseline or approved numeric overhead budget is recorded.

Complete when shadow comparison has a stable baseline and every intentional security difference is named.

### 0.5 Approve initial scope and template mapping

- [x] Group route actions into stable business capabilities rather than one scope per URL.
- [ ] Review scope granularity with record, vocabulary, configuration, reporting, integration, and user-management owners. **OPEN — external approval:** product/security sign-off is not recorded in this repository.
- [x] Define risk classification and administrator-facing descriptions.
- [x] Define Guest template scopes and review each against the Guest safe allowlist.
- [x] Define Researcher, Librarians, brand Admin, and system Admin revisions with explicit scope arrays.
- [x] Confirm no wildcard or inherited/template-auto-upgrade behavior.
- [x] Confirm broad record scopes require base record action scopes.
- [x] Confirm existing `Admin`, `Librarians`, `Researcher`, and `Guest` strings remain immutable role keys.
- [x] Decide whether current operations justify the optional phase-1 bulk assignment UI; the bounded/audited API is required either way.

Complete when the route mapping and default templates receive product/security sign-off.

**STOP GATE A — Baseline approval OPEN**

- [x] Source inventory has no unknown core actions; deployment readiness repeats validation for the installed hook set.
- [x] Role-writer inventory has no unknown supported mutations.
- [x] Resource inventory has no unowned high-risk brand entity.
- [x] Golden fixtures pass before production behavior changes.
- [x] Intentional security fixes are recorded separately from parity expectations.
- [ ] Numeric authorization-overhead budget is recorded and approved. **Not available from repository evidence.**
- [ ] Product/security sign-off is recorded. **Not received/recorded; requires the named external approvers.**

## 1. Build pure authorization contracts and the scope registry

### 1.1 Add foundational types

- [x] Create `packages/redbox-core/src/authorization/types.ts`.
- [x] Add branded `ScopeKey` and `RoleKey` constructors/validators.
- [x] Separate grandfathered exact role-key validation from strict new-role key creation grammar.
- [x] Add principal/auth-method/brand/token-ceiling context types.
- [x] Add `RouteAuthorization` discriminated union.
- [x] Add role template/revision/override types.
- [x] Add assignment source/status types.
- [x] Add decision and bounded reason-code types.
- [x] Add `legacy | shadow | enforce` rollout type.
- [x] Export only stable public contracts from the authorization index.

Complete when invalid keys/states cannot be constructed without an explicit validation failure or unsafe internal cast.

### 1.2 Implement scope-key and namespace validation

- [x] Implement lowercase dot-segment grammar.
- [x] Reserve core namespaces.
- [x] Derive/validate hook namespace ownership from package metadata.
- [x] Reject wildcards, empty segments, uppercase, whitespace, and path/controller syntax.
- [x] Validate deprecated scopes have a distinct valid replacement when supplied.
- [x] Reject a replacement chain that cycles.
- [x] Produce stable error codes/messages for build/startup tooling.

Complete when grammar, namespace, replacement, and collision tests cover valid/invalid boundaries.

### 1.3 Define core scope catalog

- [x] Create `core-scopes.ts` from the approved inventory.
- [x] Give every scope a label, description, risk, and owner.
- [x] Keep route-independent business language.
- [x] Add explicit record base and broad resource-gate scopes.
- [x] Add authorization-admin and system scopes.
- [x] Do not add `system.brand.create` unless its service boundary is confirmed in scope.
- [x] Sort definitions deterministically.

Complete when every phase-0 route maps to one active scope or an explicit public/pre-auth declaration.

### 1.4 Define immutable default template revisions

- [x] Create `default-role-templates.ts`.
- [x] Define Guest, Researcher, Librarians, brand Admin, and system Admin identities.
- [x] Use sorted unique scope arrays.
- [x] Make the revision content hash deterministic.
- [x] Validate template scopes against the registry.
- [x] Validate Guest against the code-level safe allowlist.
- [x] Verify brand/system protected-kind compatibility.

Complete when template snapshots are deterministic and contain no implicit hierarchy.

### 1.5 Implement registry merge and generation

- [x] Create `scope-registry.ts` with pure merge logic.
- [x] Include source type/package/version metadata.
- [x] Reject duplicate/conflicting definitions.
- [x] Validate replacement references after the complete merge.
- [x] Calculate deterministic generation hash independent of provider order.
- [x] Provide lookup, active-check, catalog-list, and validation methods.
- [x] Keep registry immutable after construction.

Complete when repeated randomized provider order produces the same registry and generation.

### 1.6 Implement role effective-scope calculation

- [x] Create `role-effective-scopes.ts`.
- [x] Load an immutable template base input.
- [x] Apply unique `remove` overrides, then unique `add` overrides.
- [x] Normalize a desired effective set into minimal overrides.
- [x] Compute old-base/new-base/current three-way upgrade preview.
- [x] Preserve intentional removals/additions across template revision upgrades.
- [x] Drop runtime-missing/orphaned scopes from authority while retaining explanation evidence.

Complete when custom, template-only, overridden, deprecated, orphaned, and upgraded roles have exhaustive unit tests.

### 1.7 Implement pure decisions and shadow fingerprints

- [x] Create `decision.ts` for action + principal + brand + entity + record + token composition.
- [x] Return one stable primary reason code and optional internal evidence.
- [x] Ensure normal public result does not disclose role topology.
- [x] Create `shadow-fingerprint.ts` using only bounded fields.
- [x] Hash route ID, brand ID, outcomes, principal category, and reason code.
- [x] Exclude actor/resource IDs, usernames, paths with parameters, and credentials.

Complete when truth-table and redaction tests cover every decision term.

### 1.8 Add hook scope provider support

- [x] Extend loader dependency metadata for `hasAuthorizationScopes`.
- [x] Discover synchronous `registerRedboxAuthorizationScopes()`.
- [x] Generate deterministic config shim/provider ordering.
- [x] Reject async, missing, malformed, duplicate, and namespace-stealing providers.
- [x] Export the provider type from `@researchdatabox/redbox-core`.
- [x] Add optional hook-archetype example and tests.
- [x] Document provider purity: no datastore/network/bootstrap effects.

Complete when core and hook registry tests pass in isolation and via generated loader shims.

### 1.9 Run foundation verification

- [x] Run focused authorization unit tests.
- [x] Run loader tests.
- [x] Run `npm --prefix packages/redbox-core run build`.
- [x] Run `npm --prefix packages/redbox-core run lint`.
- [x] Run format check for touched files.

**STOP GATE B — Pure contracts stable**

- [x] Registry generation is deterministic.
- [x] Hook collisions fail clearly.
- [x] Default templates pass registry and Guest safety validation.
- [x] No pure module imports Sails/Waterline/Express globals.

## 2. Add persistence, atomicity, and audit foundations

### 2.1 Extend the `Role` model safely

- [x] Add `key`, server-computed `identityKey`, `displayName`, `description`, `contextType`, template/revision, protected kind, status, version, and actor metadata.
- [x] Retain `name`, `branding`, and `users` compatibility fields.
- [x] Add unique sparse single-field `identityKey` plus a non-unique `{ branding, key }` lookup index; prove pre-migration rows with no `identityKey` do not collide on first lift.
- [x] Add brand/status/display-name and template/revision indexes.
- [x] Update Waterline interfaces and `RoleModel`.
- [x] Add service validation for brand/system shape because relation optionality alone is insufficient.

Complete when old role rows can still deserialize and new invalid context shapes are rejected by service validation.

### 2.2 Add scope and template models

- [x] Implement `AuthorizationScope` fields/indexes.
- [x] Implement `RoleTemplate` fields/indexes.
- [x] Implement immutable `RoleTemplateRevision` fields/indexes.
- [x] Prevent normal revision update/delete surfaces.
- [x] Add interfaces/storage types.
- [x] Add deterministic JSON scope-array validation at the service boundary.

Complete when duplicate scope keys and duplicate template revisions fail at storage level in integration tests.

### 2.3 Add role override and assignment models

- [x] Implement `RoleScopeOverride` with unique role/scope and add/remove effect.
- [x] Implement `RoleAssignment` with canonical principal, role/brand, source tuple, active/revoked/suppressed status, source presence, expiry, actor, revocation/suppression metadata, and version.
- [x] Add all effective-resolution, role-impact, brand-list, status/source-presence, and expiry indexes.
- [x] Validate Guest cannot be represented as an assignment through the service.
- [x] Validate assignment brand matches role context.
- [x] Add interfaces/storage types.

Complete when source-specific duplicates fail while distinct sources for the same user/role succeed.

### 2.4 Add audit and shadow models

- [x] Implement append-only `AuthorizationAudit` fields and query indexes.
- [x] Implement aggregate `AuthorizationShadowMismatch` fields and indexes.
- [x] Define bounded event types/outcomes/principal categories.
- [x] Add redaction/sanitization helpers before persistence.
- [x] Keep shadow operational evidence separate from append-only admin audit.

Complete when model tests prove the intended uniqueness/query shapes and redaction.

### 2.5 Wire model exports and shims

- [x] Export every model from `waterline-models/index.ts`.
- [x] Add every definition to `WaterlineModels`.
- [x] Export storage interfaces/models from their index.
- [x] Regenerate model shims through normal loader tooling.
- [x] Add loader/model registration tests.
- [x] Confirm model identities do not collide with hook models.

Complete when an integration lift exposes every model under the expected global/service identity.

### 2.6 Implement required transaction utility

- [x] Create `RequiredTransactionUtils.ts` rather than modifying optional semantics for other features.
- [x] Require a datastore transaction function.
- [x] Convert unsupported-adapter errors into `authorization.transaction-unavailable`.
- [x] Never invoke work outside a transaction after a transaction error.
- [x] Add a non-destructive capability probe.
- [x] Document how `.usingConnection(connection)` is applied to Waterline model and association queries.
- [x] Verify association writes participate in the same Mongo transaction.
- [x] Convert every maintained integration Docker profile from standalone MongoDB to a transaction-capable single-node replica set.
- [x] Add idempotent replica-set initialization shared by Mocha, Bruno, OIDC, general integration, S3, and Playwright profiles.
- [x] Make portal health dependencies wait for replica-set/transaction readiness rather than MongoDB `ping` alone.
- [x] Document replica-set or sharded-cluster transaction support as an `enforce` deployment prerequisite.

Complete when unsupported adapters run zero work and multi-write rollback is proven.

### 2.7 Implement audit service

- [x] Add typed event constructors.
- [x] Require actor, target, outcome, timestamp, and schema version.
- [x] Insert successful mutation events on the caller's leased connection.
- [x] Add independent denied/failed attempt recording with safe logging fallback.
- [x] Add cursor/filter read methods protected later by scope.
- [x] Do not export update/destroy.
- [x] Add secret-field denylist and recursive redaction.
- [x] Add bounded age-based retention as the only delete path, defaulting to indefinite retention when unset.
- [x] Respect configured legal hold and emit a current `audit.retention.completed` summary event.

Complete when primary mutation/audit rollback tests and denied-attempt failure tests pass.

### 2.8 Verify persistence foundation

- [x] Run model/service unit tests.
- [x] Run focused Mongo integration tests.
- [x] Smoke-lift every modified Docker profile and prove its portal process connects after replica-set initialization.
- [x] Run a commit/rollback transaction probe in at least the Mocha, Bruno, and Playwright profiles; verify the remaining profiles consume the same tested Mongo setup.
- [x] Run core build/lint/format.
- [x] Verify package manifests still use exact dependency versions.

**Bounded-worktree limitation (2026-09-06):** the Docker smoke-lift and
live commit/rollback probes above are historical implementation evidence,
NOT re-verified in this bounded round (no Docker daemon/live Mongo in this
worktree). Repository evidence in this round is the in-memory
required-transaction unit coverage plus `src`/`test` type/build/lint
checks; live concurrency/rollback/restart remain open operational gates
(see sections 14/15 and Gate A).

**STOP GATE C — Atomic persistence proven**

- [x] Model indexes work on the supported Mongo profile.
- [x] Maintained test profiles no longer rely on standalone MongoDB for authorization transaction coverage.
- [x] Authorization work never falls back to non-transactional execution.
- [x] Success audit and mutation are atomic.
- [x] Secrets cannot reach audit/shadow records.

## 3. Migrate existing data and establish protected bootstrap state

### 3.1 Create the local migration

- [x] Add a timestamped JS migration under `api/migrations/` with a globally unique name.
- [x] Backfill role key/server-computed identity key/label/context/status/version.
- [x] Preserve migrated role key case/text exactly; do not slugify deployment-specific names.
- [x] Match default roles to initial templates without changing `name`.
- [x] Detect duplicate same-brand names before unique index assumptions.
- [x] Create `migration` assignments from existing user-role associations.
- [x] Skip explicit Guest associations in new assignments.
- [x] Canonicalize linked aliases to active primary users.
- [x] Retain legacy associations untouched.
- [x] Process bounded batches and persist resumable progress.
- [x] Emit a summary without user/token secrets.

Complete when rerunning after full or partial completion is a no-op except safe continuation.

### 3.2 Reconcile scope catalog and templates

- [x] Implement `AuthorizationScopeService` startup registry merge.
- [x] Upsert seen metadata without changing key identity.
- [x] Store registry generation.
- [x] Publish missing default template revisions idempotently.
- [x] Advance template current revision only when the declared immutable revision is present.
- [x] Do not automatically orphan unseen definitions.
- [x] Add explicit post-deployment orphan reconciliation with impact output.

Complete when rolling old/new registry simulations do not spuriously revoke hook scopes.

### 3.3 Ensure protected Guest roles

- [x] Find/create one Guest per brand using the existing key when present.
- [x] Mark it `protectedKind: guest`.
- [x] Attach/pin the Guest template revision.
- [x] Normalize overrides without assigning Guest to users.
- [x] Detect multiple Guest candidates and block readiness rather than guessing.
- [x] Add protected invariant evidence to startup/readiness output.

Complete when fresh and migrated brands each have exactly one valid Guest baseline.

### 3.4 Ensure system-administrator state

- [x] Create the single brand-independent system role idempotently.
- [x] Pin the explicit system-administrator template revision.
- [x] Resolve the configured bootstrap parent admin after `UsersService.bootstrap()`.
- [x] Canonicalize it through linked-account state.
- [x] Create the missing protected bootstrap source assignment; accept an existing canonical row and report revoked/suppressed/expired/noncanonical rows without mutating them.
- [x] Reject ambiguous/disabled bootstrap user in readiness.
- [x] Record bounded bootstrap/migration audit events.

Complete when fresh and migrated installations have at least one effective protected system administrator.

### 3.5 Add migration drift reporting

- [x] Compare supported legacy associations with effective new assignments.
- [x] Report unknown/missing roles and wrong-brand associations.
- [x] Report record ACL role keys with no active same-brand role where derivable.
- [x] Report path rules that did not map to a reviewed scope.
- [x] Report protected-role/template anomalies.
- [x] Keep reports bounded/paginated and free of credentials.

Complete when every fixture anomaly is classified as blocker, warning, or expected compatibility state.

### 3.6 Verify migration and bootstrap

- [x] Test empty installation.
- [x] Test existing single-brand installation.
- [x] Test multi-brand user with different roles.
- [x] Test linked-account installation.
- [x] Test interrupted/repeated migration.
- [x] Prove record documents and Solr ACL strings are unchanged.
- [x] Run generated-shim and full focused integration tests.

**STOP GATE D — Migration safe**

- [x] No legacy role/ACL data is deleted or renamed.
- [x] Protected Guest/system-admin invariants hold.
- [x] Migration is idempotent/resumable.
- [x] Drift report exposes unsupported direct-write anomalies.

## 4. Implement effective authorization resolution

### 4.1 Build immutable authorization contexts

- [x] Add anonymous, user, legacy-bearer, and system-process context constructors.
- [x] Keep trusted system-process constructor unavailable to request/controllers.
- [x] Resolve active brand through `BrandingService`.
- [x] Canonicalize linked users.
- [x] Reject disabled effective users.
- [x] Store auth method and optional token ceiling.
- [x] Freeze/readonly the completed context.

Complete when request input cannot forge any authority-bearing field.

### 4.2 Resolve assignments and roles

- [x] Query active/unexpired assignment rows for canonical user.
- [x] Exclude revoked and locally suppressed rows from authority.
- [x] Include matching brand roles only.
- [x] Include global system-role assignments.
- [x] Exclude inactive roles and wrong-brand/system shapes.
- [x] Add implicit active Guest for the brand.
- [x] Deduplicate roles granted by multiple sources.
- [x] Use one bounded query plan rather than per-role/per-scope queries.

Complete when two-brand, multi-source, expiry, inactive-role, Guest, and system-admin tests pass.

### 4.3 Resolve effective scopes

- [x] Load template revision and overrides in bounded queries.
- [x] Calculate each role's effective scope set with pure helper.
- [x] Union role scopes additively.
- [x] Exclude runtime-absent/orphaned definitions.
- [x] Apply token ceiling when supplied.
- [x] Return deterministic sorted keys and internal provenance.
- [x] Memoize only inside one request/context instance.

Complete when revocation/expiry/scope edits are visible on the next independent request.

### 4.4 Add decision and explanation APIs

- [x] Implement action-scope decision.
- [x] Implement brand/entity decision composition.
- [x] Implement record decision composition using adapter contract.
- [x] Keep ordinary error details bounded.
- [x] Provide privileged explanation projection with contributing roles/sources/gates.
- [x] Prevent explain from mutating or using cross-brand object lookup.

Complete when normal callers cannot infer cross-brand existence or missing granting roles.

### 4.5 Project compatibility request roles

- [x] Populate effective non-Guest and implicit Guest role objects for current request consumers.
- [x] Preserve `id`, immutable `name`/`key`, label, and brand shape expected by current services.
- [x] Do not persist Guest membership.
- [x] Remove reliance on stale serialized session role arrays.
- [x] Add tests for existing `UsersService.hasRole()`/record callers during transition.

Complete when current in-process role consumers work from fresh authoritative state per request.

### 4.6 Verify decision engine

- [x] Run pure truth-table tests.
- [x] Run service query/memoization tests.
- [x] Run multi-brand/principal matrix.
- [ ] Run one-role, multi-role, system-admin, and large-assignment query-count/latency checks against the agreed budget. **Blocked on the open Gate A budget.**
- [x] Run disabled/link/expiry boundary tests with controlled time.
- [x] Run core build/lint/format.

**STOP GATE E — Effective authority stable**

- [x] No hierarchy or username shortcut contributes scopes.
- [x] Guest/system roles behave exactly as designed.
- [x] Authority changes take effect by the next request/event.
- [x] Missing/orphaned scopes fail closed.

## 5. Implement all role/template/assignment mutations

### 5.1 Add mutation command contracts

- [x] Define create/update/scope/template/inactivate/delete commands with actor context and brand.
- [x] Require expected version for existing mutable targets.
- [x] Define assignment grant/revoke/external-replace commands.
- [x] Define sanitized optional reason and correlation metadata.
- [x] Define typed result with version, audit event ID, request ID, and batch ID where applicable.
- [x] Reject extraneous authority-bearing fields at the API schema boundary later.

Complete when commands contain all authoritative context without passing raw HTTP requests into the service.

### 5.2 Implement role create/update

- [x] Normalize and validate immutable new key.
- [x] Apply `^[a-z][a-z0-9-]{0,63}$` only to newly created keys and URL-encode grandfathered keys in clients.
- [x] Write legacy `name = key` once.
- [x] Validate brand scope and unique key.
- [x] Create from empty base or approved template revision.
- [x] Support same-brand clone into a new unprotected role, copying effective scopes but no assignments/protected identity.
- [x] Apply requested scope set as normalized overrides.
- [x] CAS-update label/description/version.
- [x] Write success audit in the same required transaction.

Complete when duplicate/cross-brand/stale-version cases roll back completely.

### 5.3 Implement scope preview/apply

- [x] Normalize desired effective scope keys against runtime registry.
- [x] Reject missing/orphaned/newly deprecated selections.
- [x] Calculate additions/removals and risk broadening.
- [x] Count affected active assignments.
- [x] Count/configure bounded record/config references without exposing contents.
- [x] Enforce Guest safe allowlist and protected constraints.
- [x] Enforce `authorization.self.read` as the Guest minimum scope floor.
- [x] Enforce the documented brand-admin and system-admin minimum scope floors.
- [x] Issue a short-lived actor/brand/operation/version-bound confirmation token.
- [x] Revalidate token/state/version and apply overrides transactionally.

Complete when stale/replayed/wrong-actor/wrong-brand confirmations cannot apply.

### 5.4 Implement template publish/upgrade

- [x] Restrict publish to `system.authorization.manage` context.
- [x] Create immutable next revision and advance current revision atomically.
- [x] Preview old/new/current three-way role diff.
- [x] Preserve explicit local adds/removes.
- [x] Re-normalize minimal overrides on apply.
- [x] Require version/confirmation and audit both template/role changes.
- [x] Add system-only bounded bulk preview/apply for explicitly selected roles, with per-role versions/audits and a batch summary.
- [x] Never upgrade brand roles automatically at startup/deploy.

Complete when existing pinned roles remain unchanged after a template publish.

### 5.5 Implement role inactivation

- [x] Reject Guest, brand-admin where protected, and system-admin inactivation.
- [x] Preview assignment/config/record references.
- [x] Require confirmation/version.
- [x] Mark role inactive; do not hard-delete assignments/history.
- [x] Remove its authority on subsequent requests.
- [x] Maintain compatible legacy association projection as designed.

Complete when inactivation is safe, auditable, reversible only through an explicit future/reactivation operation, and does not erase history.

### 5.6 Implement dependency-free role deletion

- [x] Reject every protected role.
- [x] Require the role to have no active, revoked, expired, migration, external, onboarding, or manual assignment row.
- [x] Require no workflow, navigation, form/config, record/tombstone ACL, or other inventoried reference.
- [x] Recheck dependencies, version, and confirmation inside the transaction.
- [x] Remove role-local scope overrides and compatibility brand association in the same transaction.
- [x] Retain an append-only deletion audit containing the safe prior role state.
- [x] Return `409` with bounded dependency categories if the role became used after preview.

Complete when only a never-used, unprotected, dependency-free custom role can be hard-deleted.

### 5.7 Implement manual/source assignments

- [x] Canonicalize target user and validate active state.
- [x] Resolve role by immutable key inside active brand/system context.
- [x] Reject Guest assignment.
- [x] Grant/reactivate one exact source tuple idempotently.
- [x] Revoke only requested source tuple.
- [x] Suppress/unsuppress exact external source tuples with actor/reason/version/audit.
- [x] On unsuppress, activate only when the latest `sourcePresent` value is true; otherwise leave the row revoked.
- [x] Validate expiry is future/allowed.
- [x] Deduplicate effective role authority across sources.
- [x] Dual-write the legacy role association on first/last effective grant transition.
- [x] Apply all rows/projection/audit on one connection.

Complete when multi-source revoke and transaction rollback tests pass.

### 5.8 Enforce protected administrator quorum

- [x] Count effective system admins inside the transaction at decision time.
- [x] Count effective brand admins for every affected brand inside the transaction at decision time.
- [x] Guard manual/external assignment revoke, suppression, unsuppression, and expiry changes.
- [x] Guard user disable.
- [x] Guard account link/merge.
- [x] Guard system-role inactivation/scope removal that destroys recovery authority.
- [x] Guard the final active/unexpired brand-admin assignment in each brand across revoke, expiry, disable, link, role inactivation, and deletion.
- [x] Handle concurrent attempts to remove two remaining admins safely.
- [x] Return stable `409 authorization.last-system-admin`.
- [x] Return stable `409 authorization.last-brand-admin` for the brand quorum.

Complete when no supported race/path can leave zero effective system administrators or zero effective brand administrators in a brand.

### 5.9 Enforce delegation ceilings

- [x] Reject a brand-admin role scope set that is not a subset of the actor's effective brand scopes.
- [x] Reject assigning a role whose effective scopes exceed the brand administrator's effective scopes.
- [x] Recheck the ceiling inside the mutation transaction.
- [x] Add explicit high-risk system-scope adoption guarded by `system.authorization.manage`, preview, confirmation, version, and audit.
- [x] Ensure adoption updates the protected system role/template explicitly; registration alone remains non-granting.

Complete when brand administrators cannot grant authority beyond their own and new system scopes require an explicit adoption event.

### 5.10 Add external-source replacement

- [x] Require provider and stable source key.
- [x] Validate all desired role keys before mutating.
- [x] Grant/reactivate desired source rows.
- [x] Update `sourcePresent` for every row covered by a successful synchronization.
- [x] Revoke only stale unsuppressed rows for that exact provider/source.
- [x] Preserve local suppression across provider disappearance and reappearance.
- [x] Leave manual/onboarding/migration sources unchanged.
- [x] Make repeated identical synchronization a no-op with bounded audit behavior.

Complete when claim-hook synchronization is idempotent and source-isolated.

### 5.11 Add bulk preview/apply and config import/export

- [x] Define versioned deterministic export schema.
- [x] Exclude secrets and ephemeral runtime evidence.
- [x] Parse bounded CSV/JSON assignment batches.
- [x] Report row-level normalization/errors/no-ops without partial writes.
- [x] Bind confirmation to content hash, actor, brand, versions, and expiry.
- [x] Apply one bounded atomic batch.
- [x] Insert one audit event per changed assignment plus a batch summary using the same transaction/batch ID.
- [x] Return deterministic result/audit batch IDs.
- [x] Exclude users and system-administrator assignments from export by default; require an explicit separately confirmed option to include them.

Complete when oversized/malformed/stale/partial-failure/replay tests pass.

### 5.12 Verify mutation service

- [x] Run concurrency races.
- [x] Run protected-role/quorum attacks.
- [x] Run protected Guest/brand/system scope-floor removal attacks.
- [x] Run dependency-free delete and newly-referenced-after-preview races.
- [x] Run brand delegation-ceiling and system scope-adoption tests.
- [x] Run transaction/audit rollback cases.
- [x] Run dual-write drift cases.
- [x] Run full service package checks.

**Bounded-worktree limitation (2026-09-06):** concurrency/rollback items
above are proven with in-memory Waterline fakes plus an injected
transaction runner (named Phase 5 runtime regressions). True
cross-connection concurrency, physical rollback, overlapping-transaction
races, and restart recovery require the Docker-backed suites and are NOT
proven here; numeric performance approval remains under open Gate A.

**STOP GATE F — Single safe writer established**

- [x] All supported mutations use one service.
- [x] Atomicity and CAS are proven.
- [x] Protected roles/quorum survive concurrency.
- [x] Legacy projection remains rollback-ready.

**Remediation evidence (2026-09-06, independent review FAIL → fix):**
repository-verifiable hardening only, each item owned by a named runtime
regression test (in-memory Waterline fakes + injected transaction runner —
see the Limitation note in `RoleAdministrationPhase5Findings.test.ts`: true
cross-connection concurrency, physical rollback, and restart recovery still
require the Docker-backed suites and are NOT proven here):

- AUTH-P5-001: the WeakSet mint capability, the marker/issuer, AND the
  predicate are module-private to `services/AuthorizationService.ts` (no
  `mark...`/`issue...`/`isServerIssued...` export on the service module, the
  deep `authorization/context` module, or the public index; issuance only via
  the module-private `issueServerAuthorizationContext` used by
  `AuthorizationService` resolvers). Trusted writers
  (`RoleAdministrationService`, `UsersService`) verify actors only through
  the guarded `isTrustedAuthorizationContext` /
  `requireTrustedAuthorizationContext` instance operations on genuine
  resolver instances (module-private shared verifiers, injectable for
  tests). Proven by
  `RoleAdministrationPhase5IndependentVerification.test.ts` (frozen forgery
  rejected via the guarded operation, mint+predicate non-export asserted on
  all three entry points) and the fail-closed actor tests in
  `UsersService.test.ts`. Genuine-actor test helpers never import an
  issuer/predicate.
- AUTH-P5-002: guarded user mutations pin the observed version into atomic
  update predicates (CAS with legacy null-healing), audit writes fail closed
  (`authorization.audit-unavailable`, 503) with compensating destroy on
  create, and `findAndAssignAccessToRecords` is removed from exported methods
  with bounded discovery. `expectedVersion` is mandatory on EVERY
  request-facing user mutation path, including the role-set path:
  `GuardedRoleSetOptions.expectedVersion` is required and pinned against
  the user row at `applyUserRoleAssignments` entry (409 when omitted or
  stale, writer never runs); the standalone legacy roles route
  (`AdminController.updateUserRoles`) rejects a missing version with 422;
  composite create/update flows pin the in-request observed (create) or
  post-profile observed (update) version and fail closed with partial state
  when unreadable; Angular `updateUserRoles` sends the required
  `expectedVersion`. Proven by the `AUTH-P5-002 guarded mutations` block and
  the `updateUserRoles` mandatory-CAS block in `UsersService.test.ts`
  (predicate shape asserted from the actual `User.update` call args,
  audit-failure compensation, bound/overflow rejection), the 422 contract
  tests in `legacy-role-ajax-contracts.test.ts` and
  `UserManagementController.test.ts`, and the `expectedVersion` body
  assertion in `user.service.spec.ts`.
- AUTH-P5-003: linked-record discovery fails closed when the query surface
  lacks a limit capability (bound applied before await); updates keep the
  mandatory numeric revision pinned in brand+oid+revision CAS predicates.
  Proven by the AUTH-P5-003 block in
  `RoleAdministrationPhase5GateRemediation.test.ts` (limit-less surface →
  pending drift with `query-bound-exceeded`) and the existing revision-CAS
  assertions.
- AUTH-P5-004: the complete record plan persists atomically inside Commit 1;
  durable read errors throw 503 instead of falling back to process memory;
  operation transitions pin the attempt count in the update predicate
  (atomic CAS); completion uses the current persisted count inside the
  audit-contingent transaction; retries require the provenance/scope/brand
  gate plus the explicit preview operation ID. The initial record pass
  consumes ONLY the persisted pre-mutation plan (`planComplete` from Commit
  1 discovery; an unavailable Record store reports pending drift with no
  unplanned write); `findPendingLinkOperationForPair` never consults the
  process-local mirror when the durable model exists. Proven by the
  AUTH-P5-004 block in `RoleAdministrationPhase5GateRemediation.test.ts`
  plus the stored-plan authority test in
  `RoleAdministrationPhase5CompletedProof.test.ts` (late arrival outside the
  plan is never rewritten).
- AUTH-P5-005: all-brand authoritative snapshots for both accounts (no
  brand filter) with complete tuple proof (id, principal, tuple brand, role
  id/key, version, status, source/sourceKey, sourcePresent, expiry) and
  foreign-brand rejection. Proven by the AUTH-P5-005 block in
  `RoleAdministrationPhase5GateRemediation.test.ts`.
- AUTH-P5-006: one canonical mandatory DTO
  (`LinkUserAccountsRequest` + `normalizeLinkUserAccountsRequest`, publicly
  exported from the authorization index); versions enforced after the scope
  gate, token/operation binding after the live-version drift checks
  (drift-before-token ordering preserved); retries bind the explicit
  operation ID. Proven by the AUTH-P5-006 block in
  `RoleAdministrationPhase5IndependentVerification.test.ts` plus the
  preview → apply → retry round trips in the Phase 5 suites.
- AUTH-P5-007: composite flows prevalidate roles, track newly-inserted vs
  pre-existing rows (never deleting existing), restore every field verbatim
  (including empty/null email/password hash) through the guarded
  `compensateUserDetailsForBrand` CAS writer (no direct writes), and return
  primary + compensation failure detail in Problem Details and legacy
  envelopes. Proven by the `AUTH-P5-007 exact-restore compensator` block in
  `UsersService.test.ts`.
- AUTH-P5-008: `api/migrations/20260905T120000-account-link-uniqueness.js`
  and `UserLinkOperation.ts` are git-tracked sources, the model is in
  `WaterlineModels`/index with `userlinkoperation` identity plus
  `AUTHORIZATION_PERSISTENCE_MODEL_INDEXES` coverage, and loader generation
  converges from those tracked sources (`discoverLocalMigrationFiles` +
  temp-dir `generateMigrationConfigShim` output + `WaterlineModels`
  membership). The suite asserts the ignored generated artifacts
  (`config/migrations.js`, `api/models/UserLink*.js`) stay untracked and
  never asserts them on disk. Proven by the AUTH-P5-008 block in
  `RoleAdministrationPhase5IndependentVerification.test.ts` (includes a
  `git ls-files` tracked-source assertion).
- AUTH-P5-009 (2026-09-06): completed-operation proof enforcement on EVERY
  completed resume (`linkUserAccounts` early `completed && !recordsPending`,
  the in-transaction existing-link conflict resume, and
  `retryLinkOperation` `completed`). All require the canonical mandatory
  DTO/scope, the caller-supplied versions bound to the stored proof
  versions, the CURRENT caller actor bound to the stored proof actor, a
  complete stored row (proofHash, assignmentSnapshot, both account versions,
  proofActorId, operation identity, brand/pair), and token/proof
  verification with the deliberate expired-token error; there is no
  brand+pair-only bypass. Proven by the runtime-behavior suite in
  `RoleAdministrationPhase5CompletedProof.test.ts` (all resumes,
  mismatch/tamper, expired token, missing/incomplete row, foreign-actor and
  version-drift rejection on both completed paths, stored-plan authority, no
  durable-memory fallback, status+attempt CAS, partial per-record progress,
  all-brand authority, preview/get/retry round trip).
- AUTH-P5-010: Prettier + `git diff --check` enforced on touched files.
- AUTH-P5-011 (2026-09-06): every affected `UserManagementController` action
  uses typed `sendResp` (no `apiRespond` remains in the controller):
  `listSystemRoles` and `createSystemRole` converted with the declared 200
  list/action shapes preserved; disable/enable/token/profile/link/preview/
  retry/audit paths already on `sendResp` with mandatory-`expectedVersion`
  behavior tests. Proven by the `system roles (sendResp contract)` block in
  `UserManagementController.test.ts` (list shape, create success never
  touches `apiRespond`, 400 path) plus the existing disable/enable/token
  CAS tests.

Explicitly NOT claimed (external release verification): live Mongo
rollback/index/concurrency, overlapping-transaction races, cross-datastore
rollback, restart recovery on real deployments, Bruno against a live portal,
browser/Playwright workflows, and numeric performance
approval. Gate A and operational phases 14 through 16 remain OPEN.

**Strict-gate remediation (2026-09-06 round 2, repository-verified):**

- AUTH-P5-001 packaging/provenance: package `exports` now exposes only the
  entry point + `package.json`, so the internal
  `services/AuthorizationActorIssuer` module is unreachable via published
  package subpaths (source index/context/service modules still export no
  mint/verifier symbols). `RoleAdministrationServiceDependencies`
  no longer accepts an injectable `isTrustedActor` predicate — verification
  always goes through the module-private guarded predicate, and an injected
  `() => true` is ignored (forgeries still 401). Proven by the new
  independent suite
  `test/services/AuthorizationActorProvenancePackaging.test.ts` (4 passing:
  exports map, symbol non-export, forgery-vs-genuine, injection ignored)
  plus the 77 passing Phase 5 gate/remediation/completed-proof suites and
  `resource-inventory` reconciliation.
- AUTH-SAGA-001 user composite durability: new persisted
  `UserMutationOperation` model (`waterline-models/UserMutationOperation`,
  `WaterlineModels` membership, `AUTHORIZATION_PERSISTENCE_MODEL_INDEXES`
  coverage) backs a saga/outbox in `UsersService`
  (`begin` idempotent / `markRunning` attempt-fenced CAS / `complete` /
  `fail` / `recoverIncompleteUserMutationOperations` with bounded retry
  budget, unique-conflict resume, terminal exclusion). `createUser` and
  `updateUser` persist the validated role plan before the role phase and
  transition it on success/failure without changing the existing
  compensation semantics. Proven by the new
  `test/services/UsersMutationSaga.test.ts` (3 passing: idempotent+CAS,
  budget+failure, cross-instance restart recovery via the durable store)
  plus the 151 passing `RoleAdministrationService`/`UsersService`/
  lifecycle suites and 58 passing controller suites.
- Regression preservation: retry fencing/lease, user role CAS, all-brand
  authority/quorum, role-only profile preservation, API Problem
  Details/route propagation, manage-users tests, test types, and cast
  hygiene revalidated — `typecheck:strict` clean, `tsc -p test/tsconfig`
  clean, `oxlint` clean, Prettier applied, `git diff --check` clean,
  `test/unit/api-routes.test.ts` 52 passing.

**Strict-gate remediation (2026-09-06 round, repository-verified):**

- AUTH-P5-001 issuer hardening: the non-forgeable WeakSet capability moved
  from `services/AuthorizationService.ts` into the internal-only
  `services/AuthorizationActorIssuer.ts` (untracked → tracked this round;
  NOT exported from `src/authorization/index.ts`; no class/service
  surface, so `resource-inventory.test.ts` lists it in
  `NON_SERVICE_MODULES`). `AuthorizationService` exposes no
  `createSystemProcessContext` / `isTrusted` / `requireTrusted` methods;
  genuine resolvers mint via `issueTrustedAuthorizationContextInternal` and
  bounded production callers via `createSystemProcessContextInternal`;
  writers verify via `isTrustedAuthorizationContextInternal`.
  `test/services/genuineActor.ts` mints only through the internal issuer or
  the real resolver. Proven by 141 passing Phase 5 suites +
  `resource-inventory.test.ts` reconciliation (80/80 controller+inventory
  suite) and `tsc -p tsconfig.strict.json` clean.
- CAS/saga/preserve: `UsersService` mandatory `expectedVersion` CAS on all
  guarded mutations; `UserManagementController.createUser`/`updateUser`
  pin in-request/post-profile versions with partial-state + compensation
  reporting; role-only updates preserve omitted name/email (password left
  untouched); `destroyNewlyCreatedUserRecord` version-bound compensation.
  Proven by `UsersService.test.ts` + `UsersLifecycleLoader.test.ts`
  (123 passing) and controller CAS tests.
- Link operations: `getLinkOperation` binds brand actors to the requested
  brand with opaque 404 on cross-brand rows; `retryLinkOperation` claims
  the CAS lease (attempt count + status) BEFORE record I/O with later
  writes fenced on the leased values; bounded attempts; preview/get/retry
  round trip intact. Proven by the Phase 5 gate/remediation/completed-proof
  suites (141 passing).
- HTTP contract: token generate/revoke error paths route through
  `sendAuthorizationAdministrationError`/`sendAuthorizationResourceError`
  (409/401/403/404 stable, 500 without leaks); token routes declare
  complete 200/400/401/403/404/409/422/503 Problem Details schemas;
  `createSystemRole` propagates the `:roleName` path param authoritatively
  (body/query legacy fallbacks). Proven by `test/unit/api-routes.test.ts`
  (OpenAPI/spec suite passing) and `UserManagementController.test.ts`.
- Cast hygiene: security-sensitive `as unknown as` removed from actor
  paths in `RoleAdministrationService` (`actorId`/`auditInput` use `in`
  narrowing), `UsersService` (`hasProvenScope`/`requireRequestActor`/
  `requireMutationActor`/`describeGuardedActor`), `authorization-response`
  policy (`res.status` direct), and `UserManagementController`/
  `AdminController` role/brand handling. `tsc -p tsconfig.strict.json`,
  `tsc -p tsconfig.json`, and `tsc -p test/tsconfig.json` all pass clean;
  `oxlint` 0 warnings/errors on touched files; Prettier applied;
  `git diff --check` clean.

## 6. Declare and enforce route scopes with rollout modes

### 6.1 Extend route metadata types/builders

- [x] Add required authorization declaration to `ApiRouteDefinition`.
- [x] Add it to `RouteTargetObject`.
- [x] Preserve it through `defineApiRoute()` and Sails route-map generation.
- [x] Add ergonomic route-factory arguments/helpers without defaulting protected routes to public.
- [x] Emit `x-redbox-scope` for scoped OpenAPI operations.
- [x] Emit correct public/pre-auth security metadata.
- [x] Mark `x-redbox-roles` deprecated during compatibility.

Complete when contract source, runtime route target, and generated OpenAPI agree.

### 6.2 Annotate every route

- [x] Apply the approved mapping to every core API route group.
- [x] Annotate every non-contract UI/AJAX route object.
- [x] Annotate login/callback/logout/CSRF and other pre-auth actions with reasons.
- [x] Annotate intentional public routes with reasons.
- [x] Validate hook routes against merged scopes.
- [x] Add a test that fails on any missing declaration.

Complete when the generated inventory reports zero missing declarations.

### 6.3 Fix credential resolution

- [x] Distinguish no Authorization header from a supplied one.
- [x] Validate Bearer scheme and non-empty value.
- [x] Convert Passport error/false/disabled effective user into `401`.
- [x] Reject an invalid bearer even if a valid session is also present, according to the explicit mixed-credential rule.
- [x] Preserve session principal when no bearer is supplied.
- [x] Preserve HTML login redirect only for appropriate session UI requests.
- [x] Return Problem Details for APIs.

Complete when invalid bearer never reaches Guest or controller logic.

### 6.4 Add request context policy

- [x] Resolve brand before authority.
- [x] Build and attach one immutable `req.authorization` context.
- [x] Project fresh compatibility roles.
- [x] Set stable route/request correlation identity.
- [x] Avoid reading effective scopes from headers/body/query/session serialization.

Complete when downstream policies/controllers use the attached context and do not independently guess auth method.

### 6.5 Add rollout engine and policy

- [x] Add typed `authorization.config.ts` with deployment-wide mode.
- [x] Implement legacy evaluation adapter over `PathRulesService`.
- [x] Implement scope evaluation from route declaration/context.
- [x] In `legacy`, enforce legacy and report declaration/config warnings.
- [x] In `shadow`, enforce legacy plus approved security fixes and aggregate comparisons.
- [x] In `enforce`, enforce scope result and optionally collect legacy evidence.
- [x] Map an effective protected system administrator to the active brand's legacy Admin decision for legacy/shadow path evaluation.
- [x] Do not invent `PathRule` translations for arbitrary custom scopes.
- [x] Deny a missing declaration in enforce even if startup validation was skipped.
- [x] Preserve specialized response contracts such as record-schema Problem Details.

Complete when mode truth-table tests cover all allow/deny combinations.

### 6.6 Add conditional CSRF policy

- [x] Detect server-resolved session auth method.
- [x] Verify the existing CSRF token/header for unsafe session mutations.
- [x] Exempt only valid bearer-authenticated calls.
- [x] Reject absent/malformed/mixed credentials before exemption.
- [x] Attach the policy to every unsafe authorization contract route.
- [x] Keep GET/read endpoints side-effect free.

Complete when session/bearer/mixed CSRF matrix tests pass.

### 6.7 Add bounded shadow aggregation

- [x] Generate safe fingerprint only for differences.
- [x] Upsert count/first/last/sample request ID atomically.
- [x] Record bounded route/brand/outcome/reason/principal category.
- [x] Never record actor/resource/token/raw path values.
- [x] Do not delay or change the enforced request if aggregation fails.
- [x] Log one bounded operational failure.

Complete when concurrent upserts are correct and privacy tests pass.

### 6.8 Verify routes and policies

- [x] Run `npm run validate:api-routes`.
- [x] Run policy tests.
- [x] Run OpenAPI generation/validation.
- [x] Run focused Bruno authentication/status tests.
- [x] Run build/lint/format.

**Bounded-worktree limitation (2026-09-06):** the Bruno authentication/status
item above is collection/contract evidence; a live-portal Bruno run is an
operational gate and is NOT claimed as repository-verified in this round.
Repository evidence here is `validate:api-routes`, policy suites, and
OpenAPI generation/validation where feasible.

**STOP GATE G — Every route explicitly classified**

- [x] Missing declarations fail tests/readiness.
- [x] Invalid bearer returns `401` in all modes.
- [x] Shadow never changes safe legacy outcomes except approved security fixes.
- [x] Enforce cannot fall through on absent path rules.

## 7. Enforce brand/entity and record resource gates

### 7.1 Introduce brand-constrained service contracts

- [x] Add `AuthorizationContext`/`brandId` to in-scope brand-owned service operations.
- [x] Centralize `404` cross-brand and `403` in-brand deny mapping.
- [x] Derive create branding from context.
- [x] Preserve entity branding on update.
- [x] Reject/ignore payload branding according to one documented rule.
- [x] Deprecate controller-facing ID-only methods.

Complete when controllers cannot retrieve an in-scope brand-owned entity without supplying authoritative brand context.

### 7.2 Harden records

- [x] Require `record.create` for create routes/services.
- [x] Require `record.read` before view/list/search/export/audit/attachment reads.
- [x] Require `record.update` before edit/save/transition/attachment writes.
- [x] Require explicit delete/restore/destroy/permission scopes.
- [x] Compare ACL role strings with `role.key ?? role.name`.
- [x] Preserve direct-user ACL.
- [x] Preserve edit-implies-view.
- [x] Implement broad record scope as ACL-gate bypass only within brand.
- [x] Apply same effective keys to Solr filters and direct checks.
- [x] Cover active/deleted records and audit/integration paths.

Complete when direct/list/search/export/attachment decisions agree for the same fixture.

### 7.3 Harden vocabularies

- [x] Constrain get-by-ID/slug to active brand.
- [x] Constrain entry operations through the parent vocabulary brand.
- [x] Derive brand on create/import.
- [x] Prevent update body from moving a vocabulary between brands.
- [x] Constrain delete/sync/import/export paths.
- [x] Add cross-brand ID/slug/notation tests.

Complete when a privileged administrator in brand A cannot observe or mutate brand B vocabulary data by ID, slug, or payload.

### 7.4 Harden remaining resource families

- [x] Forms and record types.
- [x] Workflows/dashboards.
- [x] Reports/exports.
- [x] Named queries.
- [x] App/navigation/branding/translation configuration.
- [x] Harvest and integration state.
- [x] User management and account linking by active brand/system context.
- [x] Hook-owned entities from the inventory.
- [x] Record each completed family in the route/resource inventory.

Complete when every phase-0 family has cross-brand integration coverage.

### 7.5 Add internal job and hook contexts

- [x] Persist user actor ID, operation ID, and brand for user-triggered jobs.
- [x] Re-resolve user authority when work begins.
- [x] Create named system-process contexts only from trusted internal factories.
- [x] Limit each process context to explicit scopes/brand.
- [x] Update maintained hook service calls.
- [x] Audit privileged process mutations with process identity.

Complete when background work cannot derive unrestricted authority from a username, default brand, or request payload.

### 7.6 Revalidate WebSocket authority

- [x] Resolve context at handshake for presentation state.
- [x] Re-resolve active principal/assignments for every privileged message.
- [x] Attach a stable operation scope to each privileged event.
- [x] Deny after role revocation/user disable/assignment expiry without waiting for disconnect.
- [x] Add message-level tests.

Complete when stale socket connections lose authority on the next privileged event.

### 7.7 Run the resource matrix

- [x] Anonymous/authenticated Guest.
- [x] Researcher/Librarians/brand Admin/system Admin.
- [x] Multiple roles and two brands.
- [x] Inactive role/expired assignment/disabled user.
- [x] Direct/role/broad/no record ACL.
- [x] Session/legacy bearer/job/WebSocket.
- [x] In-brand/cross-brand/missing entities.

**STOP GATE H — Resource boundaries proven**

- [x] Scope alone cannot cross brand/entity/record boundaries.
- [x] Cross-brand IDs consistently return `404`.
- [x] Record ACL semantics remain compatible.
- [x] Search/export/direct record authorization agrees.

## 8. Deliver the authorization contract API

### 8.1 Add shared schemas and Problem Details

- [x] Define scope/role/template/override/assignment/audit/effective-principal schemas.
- [x] Define expected-version and confirmation-token schemas.
- [x] Define cursor pagination/filter schemas and hard limits.
- [x] Define bulk/import preview/apply schemas.
- [x] Define stable Problem Details codes/statuses.
- [x] Add response-contract tests.

Complete when every controller input/output has a runtime schema and OpenAPI representation.

### 8.2 Implement `/me`, catalog, and templates

- [x] Add `GET /authorization/me` with Guest-safe declaration.
- [x] Return active brand, principal category, role summaries, and scope keys.
- [x] Do not expose hidden provenance without assignment-read scope.
- [x] Add paginated/filterable scope catalog.
- [x] Add template/revision reads.
- [x] Add system-only template revision publish.

Complete when ordinary users receive only their safe projection and template writes require system authority.

### 8.3 Implement role endpoints

- [x] List/read current-brand roles.
- [x] Create custom/template role.
- [x] Clone a same-brand role without copying assignments/protected identity.
- [x] Patch label/description with expected version.
- [x] Preview/apply scope set.
- [x] Preview/apply template upgrade.
- [x] System-only selected-role bulk template upgrade preview/apply.
- [x] Preview/apply inactivation.
- [x] Delete only a server-confirmed dependency-free role.
- [x] Hide cross-brand role existence.

Complete when all service errors map to documented HTTP results.

### 8.4 Implement assignment endpoints

- [x] Paginated assignment list with user/role/source/status/source-presence/expiry filters.
- [x] Idempotent manual grant/reactivate.
- [x] Manual-source-only revoke.
- [x] External-source suppress/unsuppress endpoints.
- [x] Optional validated expiry.
- [x] Bulk preview/apply with no partial writes.
- [x] Write one changed-assignment audit per applied bulk row plus a batch summary.
- [x] Protected system assignment restrictions.

Complete when brand admin and system admin matrices prevent cross-context grants.

### 8.5 Implement audit/explain/readiness/import/export

- [x] Redacted audit query.
- [x] Read-only decision explanation.
- [x] Readiness report endpoint.
- [x] Deterministic export.
- [x] Exclude users and system-administrator assignments from export by default.
- [x] Import preview/apply.
- [x] Scope-protect each endpoint exactly as designed.

Complete when response content cannot reveal secrets or cross-brand topology.

### 8.6 Verify contract API

- [x] Add/update API route consistency tests.
- [x] Add Mocha controller/service tests.
- [x] Add Bruno collection for happy paths.
- [x] Add Bruno cases for `400/401/403/404/409/422/503`.
- [x] Test payload limits/pagination/filter validation.
- [x] Generate and audit OpenAPI.

**Bounded-worktree limitation (2026-09-06):** the Bruno collections above
are maintained contract artifacts; executing them against a live portal is
an operational gate and is NOT claimed as repository-verified in this
round. Repository evidence here is the Mocha controller/service suites and
OpenAPI generation/audit where feasible.

**STOP GATE I — API complete**

- [x] Every admin workflow is available through one contract API.
- [x] Browser session and bearer clients follow the conditional CSRF contract.
- [x] Runtime/OpenAPI schemas match.
- [x] Cross-brand and protected-role attacks fail.

## 9. Build the embedded Angular administration UI

### 9.1 Add typed client models/service

- [x] Create authorization admin request/response interfaces.
- [x] Implement contract URLs relative to brand/portal base.
- [x] Use existing HTTP context/CSRF support.
- [x] Map Problem Details into typed UI errors.
- [x] Add cursor/filter/preview/apply methods.
- [x] Add service unit tests.

Complete when the new UI does not call legacy role AJAX endpoints.

### 9.2 Build tab shell

- [x] Replace single table with Roles/Assignments/Scope Catalog/Audit tabs.
- [x] Keep tab state in component and optional `?tab=` parameter.
- [x] Do not add Angular Router.
- [x] Load `/me` and current-brand summary.
- [x] Gate global controls by effective scopes, not role/username strings.
- [x] Show rollout mode and a clear staged/not-authoritative notice for custom scope changes in `legacy`/`shadow`.
- [x] Preserve existing EJS mount, base href, CSP nonce, and asset hashing.

Complete when tabs reload/deep-link correctly inside the embedded app.

### 9.3 Build Roles tab

- [x] Add server-backed role list/filter/status/template/protected indicators.
- [x] Add create custom/from-template flow.
- [x] Add same-brand clone flow with copied-scope preview and a new immutable key.
- [x] Show immutable key separately from editable label.
- [x] Add scope selector grouped by namespace/risk.
- [x] Visualize template base, additions, removals, and effective set.
- [x] Add scope/template/inactivation preview dialogs.
- [x] Add system-only selected-role bulk template-upgrade preview/apply controls.
- [x] Show delete only when the server reports a never-used dependency-free role.
- [x] Preserve input and offer reload/compare on `409`.

Complete when a brand admin can safely create/configure/inactivate an eligible role and delete a never-used dependency-free role end to end.

### 9.4 Build Assignments tab

- [x] Search/filter users and assignments server-side.
- [x] Show source, status, source presence, assigned/expiry/revocation/suppression metadata.
- [x] Add manual grant/reactivate and revoke.
- [x] Add external suppress/unsuppress with a clear explanation that local suppression survives claim synchronization.
- [x] Prevent Guest/system controls when caller lacks authority.
- [x] Add optional expiry editing with timezone clarity.
- [x] Record decision: the optional CSV/JSON bulk-assignment UI is deliberately deferred; the bounded/audited API is delivered.
- [x] Record the bulk-UI impact presentation as not applicable while that UI remains deferred.

Complete when multiple-source authority is understandable and manual revoke does not imply all-source revoke.

### 9.5 Build Scope Catalog tab

- [x] Add namespace/risk/source/status/search filters.
- [x] Show descriptions and replacement/deprecation/orphan status.
- [x] Show bounded role usage.
- [x] Make catalog read-only.
- [x] Prevent selection of orphaned/deprecated scopes in role editor.

Complete when administrators can understand where each capability comes from without editing identity metadata.

### 9.6 Build Audit tab

- [x] Add time/event/outcome/actor/target filters.
- [x] Use cursor pagination.
- [x] Show redacted before/after diff and correlation IDs.
- [x] Do not render raw JSON unsafely.
- [x] Restrict tab/action through `/me` projection and server scope.

Complete when permitted admins can trace changes without seeing credentials/raw claims.

### 9.7 Accessibility and UI safety

- [x] Implement correct tab roles/keyboard behavior.
- [x] Add labels/headings/table captions where needed.
- [x] Restore focus after dialogs.
- [x] Announce async save/preview/error state.
- [x] Do not use color alone for risk/status.
- [x] Disable duplicate submissions.
- [x] Keep server preview authoritative.
- [x] Remove hard-coded hidden bootstrap-admin behavior.

Complete when keyboard and basic accessibility smoke tests pass.

### 9.8 Verify Angular app

- [x] Run focused `@researchdatabox/manage-roles` unit tests.
- [x] Run `portal-ng-common` tests when shared projection is added.
- [x] Build both Angular projects.
- [x] Run browser workflow tests in both brand/system admin contexts.
- [x] Verify direct route denial independent of hidden buttons.

**Bounded-worktree limitation (2026-09-06):** the browser-workflow item
above is an operational gate (Playwright/live browser) and is NOT claimed
as repository-verified in this round. Repository evidence here is the
Angular unit suites and builds/types where feasible; direct route denial
is covered by server policy suites.

**STOP GATE J — UI/API parity**

- [x] UI performs all normal workflows through contract APIs.
- [x] Concurrency/protected errors are recoverable and clear.
- [x] No UI state is treated as authority.
- [x] Embedded deployment/CSP/base paths remain intact.

## 10. Migrate navigation and shared capability projection

### 10.1 Extend navigation config contracts

- [x] Add `requiredScope` to menu items.
- [x] Add it to home panel items.
- [x] Add it to admin sidebar items and sections.
- [x] Update JSON/config schemas and editors.
- [x] Validate keys against merged runtime registry.
- [x] Keep `requiredRoles` readable during compatibility.

Complete when old configs deserialize and new configs prefer scope keys.

### 10.2 Use authorization service in navigation

- [x] Build resolution context once per request.
- [x] Evaluate `requiredScope` through `AuthorizationService`.
- [x] Evaluate legacy roles only according to rollout compatibility rules.
- [x] Report shadow visibility differences safely.
- [x] Migrate default Admin/Librarian/Researcher entries.
- [x] Verify each destination uses the same scope.

Complete when link visibility and direct route decisions agree for the matrix.

### 10.3 Add shared Angular projection service

- [x] Create typed `/me` models/service in `portal-ng-common`.
- [x] Expose loaded state and `hasScope()`.
- [x] Refresh on login/logout/brand switch and admin mutation.
- [x] Handle unavailable/denied projection safely.
- [x] Export through library public API.
- [x] Add tests and usage documentation.

Complete when other Angular apps can hide affordances without copying role-name logic.

### 10.4 Verify navigation compatibility

- [x] Legacy-mode existing config tests.
- [x] Shadow comparison tests.
- [x] Enforce scope tests.
- [x] Unknown/orphaned scope tests.
- [x] Default navigation parity test.

**STOP GATE K — Navigation migrated**

- [x] New configuration writes scopes.
- [x] Existing role-based configuration remains readable for the promised window.
- [x] Hidden links never substitute for server policy.

## 11. Migrate onboarding, hooks, and legacy role endpoints

### 11.1 Replace `getNestedRoles()` onboarding

- [x] Add per-brand/provider configurable default role key.
- [x] Default to existing `Researcher` key when unset.
- [x] Assign exactly that explicit role through `RoleAdministrationService`.
- [x] Rely on implicit Guest.
- [x] Create the onboarding source only for a genuinely first brand/provider onboarding.
- [x] Retain revoked onboarding rows so later logins do not reapply a changed default role.
- [x] Handle missing/inactive configured role as readiness/auth onboarding error without privilege fallback.
- [x] Update AAF tests.
- [x] Update OIDC tests.
- [x] Update local-user/bootstrap tests.
- [x] Deprecate/remove `getNestedRoles()` after all callers/tests migrate.

Complete when no onboarding path encodes a fixed role hierarchy.

### 11.2 Adapt user creation/update

- [x] Convert requested role names/keys to same-brand role assignments.
- [x] Validate all roles before user/assignment mutation. (2026-09-05: create/update resolve names to same-brand IDs first; unknown names fail closed with 422 before any mutation — create never returns success with silently dropped roles.)
- [x] Durable saga with explicit new-vs-pre-existing tracking (no single transaction across the legacy User.create + assignment phases). (2026-09-05: create compensates by destroying ONLY accounts newly created by the same request; pre-existing duplicates are never destroyed and failures report partial state; update snapshots the prior profile and restores it on role-phase failure, reporting restore failures too. User+RoleAssignment share the default datastore; a single required transaction remains a future orchestration, documented in design.md.)
- [x] Prevent Guest/system/cross-brand poisoning.
- [x] Preserve supported response shape.
- [x] Audit role changes through authorization audit.

Complete when user management contains no direct role collection writer.

### 11.3 Adapt linked accounts

- [x] Require recent, server-verified, pair-bound proof for both identities; client-supplied IDs alone are not proof. (2026-09-05 resolution: `previewLinkAccounts` issues pair versions + short-lived `account-link` confirmation token binding actor/brand/pair/versions/content; `linkUserAccounts` requires both `primaryExpectedVersion`/`secondaryExpectedVersion` and re-verifies the token before any write.)
- [x] Preview merged role authority across every affected brand before apply. (2026-09-05: preview returns rolesToAdopt/rolesToRetire computed from authoritative assignments; both accounts must be active brand members.)
- [x] Reject a brand administrator when either account carries authority outside the actor's brand.
- [x] Canonicalize assignment ownership to primary account.
- [x] Merge source tuples without duplicating authority.
- [x] Revoke/retire alias associations consistently. (Secondary effective brand tuples retire with per-row CAS; primary collisions on divergent state fail with 409.)
- [x] Enforce final-system-admin guard before linking.
- [x] Enforce final-brand-admin guard in every affected brand before linking.
- [x] Preserve audit provenance of supplied and canonical targets. (link + legacy link-accounts audits carry both identities, brand, roles merged, and pending state.)
- [x] Durable two-commit link protocol with bounded idempotent recovery (NOT single-datastore atomicity). (2026-09-05: Commit 1 required transaction on `mongodb`; Commit 2 separate Record-datastore phase with brand predicate, revision CAS, bounded discovery; unbranded rows rejected as opaque not-found; `UserLinkOperation` pending/running/completed/failed keyed by stable operation ID; `retryLinkOperation` resumes only the record phase; completion audit `user.link-operation-completed`; pending exposed via service/API/UI. Cross-datastore rollback is unsupported by design — see design.md.)
- [x] Existing-link conflicts normalize to 409 with safe retry. (Same-operation resume + pending-for-pair resume; distinct operations conflicting on one secondary get 409; unique `{secondaryUserId,status}` constraint shipped in model + `AUTHORIZATION_PERSISTENCE_MODEL_INDEXES` + migration `20260905T120000-account-link-uniqueness`.)
- [ ] Do not guess how to redistribute merged authority on unlink.
- [x] Add rollback/concurrency tests. (Stale pair versions, race-to-one-winner, partial multi-record progress + idempotent recovery, CAS coverage; live overlapping-transaction concurrency remains Docker-only and is documented as such.)

Complete when linking cannot remove or duplicate protected authority unexpectedly.

### 11.4 Adapt legacy AJAX routes

- [x] Make `/admin/roles/get` read new roles and project legacy shape.
- [x] Make `/admin/roles/user` translate names/keys and call assignment service.
- [x] Reject empty-role behavior according to documented compatibility mapping without bypassing Guest semantics. (2026-09-05: empty sets are 422 `authorization.invalid-role`, unknown names are 422, system assignments are 403, Guest is 422 — stable codes, never generic 500; controllers validate names before mutating.)
- [x] Add deprecation headers and successor links.
- [x] Preserve expected status/body for supported valid callers.
- [x] Add cross-brand/protected tests.

Complete when compatibility routes have no separate business logic.

### 11.5 Publish/update claim-hook contract

- [x] Export external-source replacement types/service method with `sourcePresent` and local-suppression semantics.
- [x] Require provider/source/brand/subject/role keys.
- [x] Update maintained claim hooks.
- [x] Update hook archetype docs/example.
- [x] Add idempotent login synchronization tests.
- [x] Add provider disappearance/reappearance and local suppress/unsuppress tests.
- [x] State that group-mapping UI is deferred.

Complete when hooks can retain current claims behavior without direct association writes.

### 11.6 Verify compatibility flows

- [x] Local/AAF/OIDC onboarding.
- [x] Multi-brand default roles.
- [x] User create/update/link.
- [x] Legacy AJAX response contract.
- [x] External source synchronization.
- [x] Guest never persisted as assignment.

**STOP GATE L — Supported writers migrated**

- [x] No maintained writer bypasses `RoleAdministrationService`.
- [x] Integrator compatibility APIs remain functional.
- [x] Fixed nested-role onboarding is gone.
- [x] Direct database writes are reported as unsupported drift.
- [x] Link proof/preview/confirmation, durable two-commit recovery, composite new-vs-pre-existing compensation, and empty-role mapping are implemented and tested (11.2/11.3/11.4 above). Residual external-runtime limits (no cross-datastore rollback, no live overlapping-transaction concurrency without Docker/Mongo replica set) are documented in design.md and test headers, not claimed as proven.

## 12. Complete legacy bearer security and compatibility

### 12.1 Harden bearer outcomes

- [x] No header remains anonymous/session as appropriate.
- [x] Wrong scheme/malformed value returns `401` when credential intent is supplied.
- [x] Unknown/revoked token returns `401`.
- [x] Disabled effective account returns `401`.
- [x] Valid token resolves canonical user and current assignments.
- [x] Token revoke/replace takes effect next request.
- [x] Guest never handles a failed supplied bearer.

Complete when all authentication boundary cases have policy and Bruno tests.

### 12.2 Apply scopes and resource gates to bearer clients

- [x] Test effective `/me` projection for bearer.
- [x] Test allowed/denied role administration actions.
- [x] Test two-brand role differences.
- [x] Test record action scope + ACL.
- [x] Test cross-brand entity `404`.
- [x] Test system-admin explicit scopes.
- [x] Confirm no API Admin shortcut remains.

Complete when bearer and session principals with the same user/brand receive the same authorization result.

### 12.3 Eliminate credential leakage

- [x] Audit log statements around Passport/bearer failures.
- [x] Audit HTTP errors and Problem Details.
- [x] Audit authorization/admin audit events.
- [x] Audit shadow aggregates and metrics.
- [x] Audit import/export and support diagnostics.
- [x] Add automated secret sentinel tests.

Complete when deliberate sentinel tokens do not appear in captured output/storage.

### 12.4 Document integrator migration

- [x] Call the credential an opaque legacy bearer token.
- [x] Document new required scopes/status outcomes.
- [x] Document effective-scope test endpoint.
- [x] Document deprecation headers/routes.
- [x] State one-or-two-release compatibility intent.
- [x] State OAuth replacement/product is deferred.

**STOP GATE M — Legacy bearer safely bounded**

- [x] Legacy clients remain usable.
- [x] They cannot bypass scope/brand/entity/record checks.
- [x] Invalid tokens cannot gain Guest access.
- [x] No docs/runtime mislabel tokens as OAuth/JWT.

## 13. Add readiness, operational recovery, and rollout evidence

### 13.1 Implement readiness service/report

- [x] Registry conflicts/generation.
- [x] Route declaration coverage.
- [x] Unknown/orphaned references.
- [x] Template/role/Guest/system-admin invariants.
- [x] At least one active, unexpired, unsuppressed brand administrator in every brand.
- [x] At least two active, unexpired, unsuppressed system administrators for enforce readiness.
- [x] Transaction support.
- [x] Migration completion.
- [x] Legacy projection drift.
- [x] Navigation/route parity.
- [x] Unresolved shadow mismatches.
- [x] Users/roles dependent on new-only custom scopes that would lose capability during emergency legacy rollback.
- [x] Approved security differences.
- [x] Build version/mode/instance identity.
- [x] Machine-readable JSON plus concise operator summary.

Complete when fixtures trigger every blocker/warning deterministically.

### 13.2 Add orphan reconciliation

- [x] Require explicit operator action after rolling deployment completion.
- [x] Compare persisted definitions with merged runtime registry.
- [x] Preview affected roles/templates/routes.
- [x] Mark absent definitions orphaned transactionally/audited.
- [x] Never delete definitions/grants automatically.
- [x] Make repeat execution idempotent.

Complete when removing/re-adding a hook has safe, explainable behavior.

### 13.3 Add mismatch retention/resolution

- [x] Add paginated readiness/admin view of unresolved fingerprints.
- [x] Allow authorized operator acknowledgement with reason.
- [x] Retain counts/first/last evidence.
- [x] Delete only old resolved aggregates after configured retention.
- [x] Audit acknowledgement/retention operations appropriately.

Complete when unresolved evidence remains stable across instances and deployment restarts.

### 13.4 Add operator system-admin recovery

- [x] Implement non-HTTP command in normal application context.
- [x] Require exact canonical username/user ID.
- [x] Reject aliases, ambiguity, missing, or disabled target.
- [x] Require explicit confirmation and reason.
- [x] Use required transaction and same assignment/audit invariants.
- [x] Make repeat invocation idempotent.
- [x] Print safe verification only.
- [x] Document invocation and post-check.

Complete when lockout recovery is tested without adding a web backdoor.

### 13.5 Add operational metrics/logs

- [x] Decision counts by bounded route/mode/outcome/reason/category.
- [x] Shadow discrepancy counts.
- [x] Mutation outcomes.
- [x] Version conflicts.
- [x] Invalid bearer attempts.
- [x] Orphan grants.
- [x] Transaction failures.
- [x] Expired assignment observations.
- [x] Quorum guard rejections.
- [x] Cardinality/redaction tests.

Complete when metrics are actionable and contain no unbounded/user/resource/token labels.

### 13.6 Verify operations

- [x] Run multi-instance mismatch race tests.
- [x] Run readiness blocker matrix.
- [x] Run recovery tests.
- [x] Run retention tests.
- [x] Run authorization-audit indefinite/bounded/legal-hold retention tests separately from shadow retention.
- [x] Run secret/cardinality tests.
- [x] Publish operations wiki page.

**Bounded-worktree limitation (2026-09-06):** multi-instance races and
recovery/retention against live deployments are operational gates; the
repository evidence here is deterministic unit/integration coverage, not a
fresh multi-instance or restart rehearsal.

**STOP GATE N — Operators can assess and recover**

- [x] Readiness requires no manual database inspection.
- [x] Recovery is audited, transactional, idempotent, and non-HTTP.
- [x] Shadow evidence is durable/bounded/private.
- [x] Tools never change rollout mode automatically.

## 14. Execute shadow rollout and close discrepancies

### 14.1 Deploy new model in `legacy`

- [ ] Back up per normal deployment procedure.
- [ ] Lift exactly one application instance for migrations before scaling out; the current migration runner has no cross-instance lock.
- [ ] Deploy migration/schema/services with mode `legacy`.
- [ ] Verify every instance build and registry generation.
- [ ] Verify transaction support.
- [ ] Verify Guest/system-admin invariants.
- [ ] Exercise new UI/API with controlled administrators.
- [ ] Confirm supported writes have zero legacy projection drift.
- [ ] Confirm no token/claim leakage in operational output.

Complete when legacy behavior remains stable except approved security fixes.

### 14.2 Enable `shadow` deployment-wide

- [ ] Change configuration through normal deployment controls.
- [ ] Confirm every instance reports `shadow`.
- [ ] Run anonymous/session/bearer scenarios.
- [ ] Run all default/custom role scenarios.
- [ ] Run two-brand/system-admin scenarios.
- [ ] Run record ACL/search/export scenarios.
- [ ] Run vocabulary and other brand-entity scenarios.
- [ ] Run onboarding/link/claim-hook scenarios.
- [ ] Run WebSocket/background scenarios.

Complete when representative traffic covers every high-risk route family.

### 14.3 Classify and remediate mismatches

- [ ] Mapping defect.
- [ ] Data migration/drift defect.
- [ ] Missing route declaration.
- [ ] Resource-gate defect.
- [ ] Approved legacy security bug.
- [ ] Intentional product change.
- [ ] Add a regression test for each resolved/approved category.
- [ ] Reset/acknowledge evidence only through documented process.

Complete when no mismatch remains unexplained.

### 14.4 Rehearse rollback

- [ ] Switch a production-like deployment from shadow/enforce candidate to legacy.
- [ ] Do not reverse migrations.
- [ ] Verify new-service writes remain visible through legacy projections.
- [ ] Verify approved security fixes remain.
- [ ] Verify legacy bearer/admin/integrator workflows.
- [ ] Record timing/steps/operator observations.

Complete when rollback is practical within the release's operational target.

### 14.5 Obtain enforce approval

- [ ] Product approves intended role/scope outcomes.
- [ ] Security approves intentional legacy differences.
- [ ] Operations approves transaction/readiness/recovery/rollback.
- [ ] Maintained hook owners approve scope/assignment migration.
- [ ] Integrators receive documentation/test window.
- [ ] No unresolved high-risk route/mismatch remains.

**STOP GATE O — Enforce approved**

- [ ] All readiness blockers are clear.
- [ ] Representative shadow window is complete.
- [ ] Rollback rehearsal succeeds.
- [ ] Approval/evidence links are recorded.

## 15. Enable enforce and stabilize the release

### 15.1 Deploy `enforce`

- [ ] Change deployment configuration to `enforce` on all instances.
- [ ] Verify consistent mode/build/registry generation.
- [ ] Smoke test Guest home and pre-auth flows.
- [ ] Smoke test Researcher record workflow.
- [ ] Smoke test brand Admin role workflow.
- [ ] Smoke test system Admin across two brands.
- [ ] Smoke test valid/invalid legacy bearer.
- [ ] Smoke test direct/role/broad record ACLs.
- [ ] Smoke test cross-brand record/vocabulary `404`.

Complete when the expected matrix passes on the deployed profile.

### 15.2 Monitor stabilization signals

- [ ] `401/403/404` changes by bounded route/reason.
- [ ] Authorization decision deny spikes.
- [ ] Transaction `503` errors.
- [ ] CAS `409` errors.
- [ ] Assignment/projection drift.
- [ ] Authorization context query count and p95/p99 latency against the agreed budget.
- [ ] Orphaned scope use.
- [ ] System-admin quorum guard events.
- [ ] Support/integrator reports.
- [ ] Secret/cardinality monitoring.

Complete when the agreed stabilization window has no unexplained high-severity signal.

### 15.3 Preserve first-release rollback boundary

- [ ] Keep `PathRule` data/service available.
- [ ] Keep transactional legacy role projection.
- [ ] Keep legacy role AJAX adapters.
- [ ] Keep configured emergency `legacy` mode.
- [ ] Keep legacy bearer tokens.
- [ ] Continue drift/readiness monitoring.
- [ ] Do not remove compatibility based only on calendar time.

Complete when rollback remains tested throughout the supported release.

### 15.4 Finish documentation

- [x] Authorization administration guide.
- [x] Scope catalog/reference.
- [x] Hook scope/claim assignment contract.
- [x] Migration/shadow/enforce/rollback guide.
- [x] Legacy bearer integrator migration guide.
- [x] Operations/readiness/recovery guide.
- [x] API/OpenAPI reference updates.
- [x] Release notes distinguishing authorization from authentication.
- [x] Wiki Home/index links.

Complete when an administrator, hook author, integrator, and operator each have a complete path for their responsibilities.

### 15.5 Run final verification suite

**Bounded-worktree note (2026-09-06):** only the bounded subset below is
runnable/verifiable in this worktree; mounted Docker/Mongo, live Bruno, and
Playwright/browser rows remain open operational gates and are NOT marked
verified here. Gate A and phases 14–16 stay OPEN.

- [ ] `npm --prefix packages/redbox-core run build`.
- [ ] `npm --prefix packages/redbox-core run test`.
- [ ] `npm run validate:api-routes`.
- [ ] Focused/full `npm run test:mocha:mount` as configured for authorization integration tests.
- [ ] `npm run test:bruno:general:mount` or the authorization collection's supported profile.
- [ ] Focused Angular library/app tests and builds.
- [ ] `npm run test:playwright:mount` for authorization admin flows.
- [ ] `npm run lint`.
- [ ] `npm run format:check`.
- [ ] Documentation generation/audit checks.
- [ ] Review final `git diff` for secrets, unrelated edits, and unpinned dependencies.

**STOP GATE P — Phase 1 complete**

- [ ] Scope authorization is authoritative.
- [ ] Brand/entity/record access is preserved and tested.
- [ ] Configurable role UI/API is usable.
- [ ] Protected Guest/system admin and atomic audit guarantees hold.
- [ ] Legacy bearer/integrator compatibility and rollback remain documented/tested.
- [ ] No OAuth server/token issuance dependency was introduced.

## 16. Post-delivery compatibility retirement (future release decision)

Do not schedule these tasks until integrator evidence and the documented compatibility period permit them.

### 16.1 Assess compatibility consumers

- [ ] Inventory calls to legacy role AJAX endpoints.
- [ ] Inventory reliance on `x-redbox-roles`.
- [ ] Inventory direct use of legacy user-role association shape.
- [ ] Inventory current legacy bearer clients.
- [ ] Obtain migration confirmation from maintained integrations.
- [ ] Decide whether compatibility requires a second release.

### 16.2 Remove authorization compatibility only when approved

- [ ] Remove legacy AJAX routes after notice/evidence.
- [ ] Remove role projection dual-write after rollback mode is retired.
- [ ] Remove `requiredRoles` configuration reader after config migration.
- [ ] Remove path-derived OpenAPI role extension.
- [ ] Remove `PathRule` enforcement and emergency legacy mode.
- [ ] Retain historical audit/migration evidence.
- [ ] Plan any hard model/data cleanup as a separate reversible migration.

### 16.3 Begin the separate authentication/OAuth spike

- [ ] Gather actual service-client and delegated-user use cases.
- [ ] Compare institutional external auth server, co-deployed mature server, in-app server, and hardened opaque-token option.
- [ ] Measure deployment/operations burden, especially optional/offline installs.
- [ ] Define client registration, secret handling, token lifetime, revocation, rotation, and incident response requirements.
- [ ] Prefer Client Credentials for service clients if OAuth is selected.
- [ ] Do not issue refresh tokens for Client Credentials.
- [ ] Use Authorization Code with PKCE only when a real delegated-user use case is approved.
- [ ] Reuse the phase-1 `AuthorizationContext` and optional token scope ceiling boundary.
- [ ] Produce a separate design/implementation plan before writing auth-server code.

Complete when the OAuth choice is evidence-based and remains operationally separable from the phase-1 permission model.
