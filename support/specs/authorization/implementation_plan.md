# Detailed Implementation Plan

## 1. Delivery objective

Implement the phase-1 authorization model defined in [design.md](design.md) and the decision record in [Application Authorization and Permission Model](../../wiki/Application-Authorization-and-Permission-Model.md): configurable brand roles, stable business scopes, preserved brand/entity/record access controls, protected Guest and system-administrator behavior, full UI/API management, and a reversible shadow rollout.

OAuth token issuance is explicitly deferred. The completed delivery must continue to accept current browser sessions, local/federated users, and legacy bearer UUID tokens without introducing an authorization-server dependency.

The implementation is complete only when:

- every in-scope UI and API action has an explicit authorization declaration;
- the new decision engine passes brand and record-access matrices;
- role and assignment mutations are atomic, audited, and concurrency-safe;
- the embedded administration UI supports roles, assignments, scope catalog, and audit;
- legacy role APIs and bearer tokens work for the documented compatibility window;
- production-like shadow evidence meets the readiness gates;
- operators can select `enforce` and safely return to `legacy` during the first enforced release.

## 2. Fixed implementation decisions

These decisions are not reopened during normal implementation. A change requires an explicit design update.

1. **Authorization and OAuth are separate deliveries.** Phase 1 does not issue access or refresh tokens and does not require Keycloak or another authorization server.
2. **Scopes are business capabilities.** They are declared by core/hooks, not created by administrators and not derived mechanically from controller names.
3. **Scope keys are flat and explicit.** No wildcards, hierarchy, deny entries, or role inheritance.
4. **Roles are additive and delegation is bounded.** Effective scopes are the union of applicable active role scopes; brand administrators cannot grant authority outside their own effective scopes.
5. **Guest is implicit.** Every request receives the active brand's Guest baseline. Guest is not manually assigned.
6. **Current role names become immutable keys.** Mutable UI labels use `displayName`; record/Solr ACL strings are not rewritten in phase 1.
7. **Templates are global and immutable by revision.** A brand role pins a revision and stores explicit add/remove overrides. Upgrades are previewed and administrator-initiated.
8. **Assignments are sourced.** Manual, onboarding, migration, external-claim, and recovery sources can coexist; revoking one source does not revoke another.
9. **Administrative quorum is protected.** The bootstrap parent admin receives the explicit system role; neither the final effective brand administrator nor the final effective system administrator can be removed or disabled, and enforce readiness requires two system administrators.
10. **Scopes never bypass brand ownership implicitly.** Brand/entity checks and record ACLs remain independent resource gates.
11. **Broad record access is explicit.** `record.read.all`/`record.update.all` satisfy only the record ACL gate and still require the base action scope and correct brand.
12. **No mutable cross-request cache.** Authorization is re-resolved per request and per privileged WebSocket event.
13. **Authorization mutations require transactions.** No fallback through `runWithOptionalTransaction` is permitted.
14. **Optimistic concurrency is mandatory.** Mutable authorization resources use expected versions and return `409` on stale writes.
15. **Administrative audit is typed and append-only.** Successful mutations and their audit event commit atomically.
16. **Route declarations fail closed.** Protected actions require a scope; public and pre-authentication actions require a reason.
17. **The Angular UI uses the contract API.** Compatibility AJAX endpoints are adapters, not a second implementation.
18. **Unsafe session-authenticated contract calls require CSRF.** Valid bearer clients are not forced to provide browser CSRF state.
19. **Invalid supplied bearer credentials return `401`.** They never fall through to anonymous Guest.
20. **Rollout is deployment-wide and operator-controlled.** Modes are `legacy`, `shadow`, and `enforce`; readiness does not change mode automatically.
21. **Known security defects are fixed in all modes.** Shadow comparison excludes approved unsafe legacy outcomes from readiness parity.
22. **Legacy compatibility lasts at least one enforced release.** Exact removal timing depends on integrator evidence.

## 3. Target module boundaries

```text
core/hook scope declarations
        |
        v
AuthorizationScopeRegistry ---- route declaration validator
        |                                  |
        v                                  v
persisted scope catalog             authorizeRequest policy
        |                                  |
        +----------> AuthorizationService <+
                           |
             +-------------+--------------+
             |                            |
             v                            v
RoleAdministrationService        resource-owning services
             |                    (records, vocabularies, ...)
     +-------+--------+                    |
     |       |        |                    v
role state assignments audit       brand/entity/record gates
     |
legacy user-role projection
```

Boundary rules:

- Pure registry/decision code cannot depend on `sails`, Waterline globals, Express requests, or Angular types.
- `AuthorizationService` reads authorization state and creates immutable contexts; it does not expose generic role mutation.
- `RoleAdministrationService` is the only supported role/template/assignment writer, including local suppression of externally sourced assignments.
- Controllers translate HTTP input/output only and never calculate effective scope sets.
- Resource services constrain brand-owned queries and enforce object-level predicates.
- Navigation and Angular projections consume decisions but cannot authorize a mutation.
- Compatibility adapters call the same services and cannot mutate legacy associations directly.
- Legacy/shadow mode can project protected system-admin authority to the active brand's legacy Admin decision, but it cannot translate arbitrary custom scopes into `PathRule` rows.

## 4. Proposed file map

The exact split may be adjusted to keep modules deep, but responsibilities must not leak across the boundaries above.

### 4.1 Core authorization module

New files under `packages/redbox-core/src/authorization/`:

```text
types.ts
errors.ts
core-scopes.ts
default-role-templates.ts
legacy-route-scope-map.ts
scope-registry.ts
role-effective-scopes.ts
decision.ts
route-authorization.ts
shadow-fingerprint.ts
index.ts
```

Modify public exports in:

```text
packages/redbox-core/src/index.ts
```

### 4.2 Waterline and storage-facing models

New files:

```text
packages/redbox-core/src/waterline-models/AuthorizationScope.ts
packages/redbox-core/src/waterline-models/RoleTemplate.ts
packages/redbox-core/src/waterline-models/RoleTemplateRevision.ts
packages/redbox-core/src/waterline-models/RoleScopeOverride.ts
packages/redbox-core/src/waterline-models/RoleAssignment.ts
packages/redbox-core/src/waterline-models/AuthorizationAudit.ts
packages/redbox-core/src/waterline-models/AuthorizationShadowMismatch.ts

packages/redbox-core/src/model/storage/AuthorizationScopeModel.ts
packages/redbox-core/src/model/storage/RoleTemplateModel.ts
packages/redbox-core/src/model/storage/RoleTemplateRevisionModel.ts
packages/redbox-core/src/model/storage/RoleAssignmentModel.ts
packages/redbox-core/src/model/storage/AuthorizationAuditModel.ts
```

Modify:

```text
packages/redbox-core/src/waterline-models/Role.ts
packages/redbox-core/src/waterline-models/User.ts              # compatibility comments/types only
packages/redbox-core/src/waterline-models/index.ts
packages/redbox-core/src/model/storage/RoleModel.ts
packages/redbox-core/src/model/storage/UserModel.ts
packages/redbox-core/src/model/index.ts
```

Use model-level composite indexes in the same style as `Vocabulary.ts` and `AttachmentMetadata.ts`.

### 4.3 Services and utilities

New files:

```text
packages/redbox-core/src/services/AuthorizationScopeService.ts
packages/redbox-core/src/services/AuthorizationService.ts
packages/redbox-core/src/services/RoleAdministrationService.ts
packages/redbox-core/src/services/AuthorizationAuditService.ts
packages/redbox-core/src/services/AuthorizationRolloutService.ts
packages/redbox-core/src/utilities/RequiredTransactionUtils.ts
```

Modify:

```text
packages/redbox-core/src/services/index.ts
packages/redbox-core/src/services/RolesService.ts
packages/redbox-core/src/services/UsersService.ts
packages/redbox-core/src/services/NavigationService.ts
packages/redbox-core/src/services/RecordsService.ts
packages/redbox-core/src/services/VocabularyService.ts
packages/redbox-core/src/services/FormsService.ts
packages/redbox-core/src/services/RecordTypesService.ts
packages/redbox-core/src/services/ReportsService.ts
packages/redbox-core/src/services/NamedQueryService.ts
packages/redbox-core/src/bootstrap.ts
```

Additional brand-owned services are added from the phase-0 inventory rather than guessed from filenames.

### 4.4 Route declarations, policies, and controllers

New files:

```text
packages/redbox-core/src/api-routes/groups/authorization.ts
packages/redbox-core/src/api-routes/schemas/authorization.ts
packages/redbox-core/src/controllers/webservice/AuthorizationController.ts
packages/redbox-core/src/policies/resolveAuthorizationContext.ts
packages/redbox-core/src/policies/authorizeRequest.ts
packages/redbox-core/src/policies/protectSessionMutation.ts
packages/redbox-core/src/responses/authorization-problems.ts
```

Modify:

```text
packages/redbox-core/src/api-routes/types.ts
packages/redbox-core/src/api-routes/define.ts
packages/redbox-core/src/api-routes/route-factory.ts
packages/redbox-core/src/api-routes/helpers.ts
packages/redbox-core/src/api-routes/openapi.ts
packages/redbox-core/src/api-routes/route-registry.ts
packages/redbox-core/src/api-routes/index.ts
packages/redbox-core/src/config/routes.config.ts
packages/redbox-core/src/config/policies.config.ts
packages/redbox-core/src/policies/isWebServiceAuthenticated.ts
packages/redbox-core/src/policies/checkAuth.ts                # compatibility only
packages/redbox-core/src/controllers/AdminController.ts
packages/redbox-core/src/controllers/UserController.ts
packages/redbox-core/src/controllers/webservice/UserManagementController.ts
```

All route-group files are modified to add explicit scope/public/pre-auth declarations.

### 4.5 Loader and hook contract

Modify:

```text
packages/redbox-core/src/loader/index.ts
packages/redbox-core/src/loader/bootstrapShimRuntime.ts
packages/redbox-core/src/loader/* types/tests that describe hook registrations
packages/redbox-dev-tools hook archetype templates and tests
```

Generate a config shim equivalent to the existing API route hook registration for synchronous `registerRedboxAuthorizationScopes()` providers. Hook package metadata uses an explicit opt-in such as `sails.hasAuthorizationScopes: true`.

### 4.6 Configuration and migrations

New files:

```text
packages/redbox-core/src/config/authorization.config.ts
api/migrations/<timestamp>-authorization-model-v1.js
scripts/verify-authorization-contracts.ts
scripts/authorization-readiness.ts
scripts/recover-system-admin.ts
```

Modify:

```text
packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts
packages/redbox-core/src/configmodels/MenuConfig.ts
packages/redbox-core/src/configmodels/HomePanelConfig.ts
packages/redbox-core/src/configmodels/AdminSidebarConfig.ts
package.json
packages/redbox-core/package.json
```

Any added package dependency must be an exact version. Prefer existing libraries and platform primitives.

### 4.7 Angular application

New or substantially replaced files:

```text
angular/projects/researchdatabox/manage-roles/src/app/authorization-admin.models.ts
angular/projects/researchdatabox/manage-roles/src/app/authorization-admin.service.ts
angular/projects/researchdatabox/manage-roles/src/app/roles/*
angular/projects/researchdatabox/manage-roles/src/app/assignments/*
angular/projects/researchdatabox/manage-roles/src/app/scopes/*
angular/projects/researchdatabox/manage-roles/src/app/audit/*

angular/projects/researchdatabox/portal-ng-common/src/lib/authorization-projection.service.ts
angular/projects/researchdatabox/portal-ng-common/src/lib/authorization-projection.models.ts
```

Modify:

```text
angular/projects/researchdatabox/manage-roles/src/app/manage-roles.component.ts
angular/projects/researchdatabox/manage-roles/src/app/manage-roles.component.html
angular/projects/researchdatabox/manage-roles/src/app/manage-roles.component.scss
angular/projects/researchdatabox/manage-roles/src/app/manage-roles.component.spec.ts
angular/projects/researchdatabox/manage-roles/src/app/manage-roles.module.ts
angular/projects/researchdatabox/portal-ng-common/src/public-api.ts
views/default/default/admin/roles.ejs                           # only if mount inputs change
```

Do not add Angular Router. The top-level component owns tab state.

### 4.8 Tests and documentation

Expected test locations:

```text
packages/redbox-core/test/authorization/*
packages/redbox-core/test/services/AuthorizationService.test.ts
packages/redbox-core/test/services/RoleAdministrationService.test.ts
packages/redbox-core/test/services/AuthorizationRolloutService.test.ts
packages/redbox-core/test/policies/authorizeRequest.test.ts
packages/redbox-core/test/policies/protectSessionMutation.test.ts
packages/redbox-core/test/loader/loader.test.ts
packages/redbox-core/test/unit/api-routes.test.ts

test/integration/models/AuthorizationModels.test.ts
test/integration/services/AuthorizationService.test.ts
test/integration/services/RoleAdministrationService.test.ts
test/integration/services/AuthorizationMigration.test.ts
test/integration/services/AuthorizationBrandIsolation.test.ts
test/integration/services/AuthorizationRecordAccess.test.ts

test/bruno/1 - REST API/<authorization collection>/*
test/bruno/2 - AJAX calls/<legacy authorization compatibility>/*
test/playwright/authorization-admin.spec.ts
```

Wiki deliverables:

```text
support/wiki/Authorization-Administration.md
support/wiki/Authorization-Scope-Catalog.md
support/wiki/Authorization-Hook-Contract.md
support/wiki/Authorization-Migration-and-Rollout.md
support/wiki/Legacy-Bearer-Token-Migration.md
support/wiki/Authorization-Operations.md
```

### 4.9 Integration and deployment profiles

Modify the MongoDB topology used by every authorization test profile, not only
the first profile that happens to exercise a transaction:

```text
support/integration-testing/docker-compose.yml
support/integration-testing/docker-compose.mocha.yml
support/integration-testing/docker-compose.bruno.yml
support/integration-testing/docker-compose.bruno.general.yml
support/integration-testing/docker-compose.bruno.oidc.yml
support/integration-testing/docker-compose.bruno.s3.yml
support/integration-testing/docker-compose.playwright.yml
support/integration-testing/<shared replica-set initialization script/config>
```

These profiles currently start standalone MongoDB processes. Convert them to a
deterministically initialized single-node replica set (or a shared equivalent
that supports transactions), and make portal startup wait for transaction
readiness rather than a successful `ping` alone. Keep production configuration
topology-neutral, but document that `enforce` requires a replica set or sharded
cluster with working transactions.

## 5. Implementation sequence

Tests are interleaved with production changes. A phase is not complete when only code or only tests exist.

## Phase 0 — Inventory and freeze the compatibility baseline

### 0.1 Build a route/action inventory

- Enumerate every core contract route from `getMergedApiRoutes()`.
- Enumerate non-contract routes from `routes.config.ts`, generated shims, and installed hooks.
- Record method, route ID, controller/action, current path-rule matches, current roles, authentication expectations, brand ownership, resource type, and proposed business scope.
- Mark every intentional `public` and `pre-auth` route with a concrete reason.
- Identify paths currently allowed only because no `PathRule` matched.
- Identify overlapping broad and narrow path rules whose outcomes depend on role membership.
- Commit the reviewed machine-readable mapping in `legacy-route-scope-map.ts` and generate a human-readable inventory for the wiki.

### 0.2 Inventory role and record dependencies

- Find all reads/writes of `User.roles`, `Role.users`, `Role.name`, `sails.config.auth.roles`, and `sails.config.auth.rules`.
- Find every call to `RolesService.getNestedRoles()`, `UsersService.updateUserRoles()`, and Waterline role collection mutation.
- Inventory record ACL readers/writers across record controllers, search/Solr, export, attachments, visitors, asynchronous actions, and integrations.
- Inventory configuration schemas using `requiredRoles`, including menu, home panels, admin sidebar, and form/visitor configuration.
- Inventory hook contracts that mutate roles based on claims.
- Identify direct ID-only access for brand-owned entities, with specific attention to vocabularies and records.

### 0.3 Capture golden legacy fixtures

- Create fixtures for Guest, Researcher, Librarians, Admin, the bootstrap administrator, and representative custom roles in two brands.
- Capture expected legacy decisions for every inventoried action.
- Capture record ACL decisions for direct users, `viewRoles`, `editRoles`, and edit-implies-view.
- Capture valid, absent, malformed, revoked, and disabled-user legacy bearer behavior.
- Capture a reproducible legacy request-latency/query-count baseline and agree the maximum authorization overhead before enforce.
- Mark approved security-fix differences separately from migration regressions.

### Tests

- Add a deterministic inventory test that reports undeclared routes.
- Add golden tests for the current `PathRulesService` and current record ACL functions before changing them.
- Ensure fixture output contains no bearer values or passwords.

### Exit criteria

- Every known route has an owner and proposed declaration.
- Every brand-owned resource family has a named service boundary and test owner.
- Product/security review approves the explicit list of legacy behaviors that will intentionally change.
- No implementation phase proceeds with an unexplained route or role-mutation path.

## Phase 1 — Pure authorization contracts and scope registry

### 1.1 Add types and validation

- Implement branded `ScopeKey`, grandfathered exact `RoleKey`, strict new-role key, rollout mode, principal, context, route declaration, decision, and reason-code types.
- Implement the scope-key grammar and reserved core/hook namespace rules.
- Implement deterministic ordering and generation hashing.
- Implement duplicate, conflict, deprecated replacement, and unknown-reference errors.

### 1.2 Define the initial core catalog and templates

- Convert the approved phase-0 inventory into business scope definitions.
- Add immutable default template revisions for Guest, Researcher, Librarians, and brand Admin.
- Add the protected system-administrator template/role definition.
- Review Guest's scope set against the explicit safe allowlist.
- Confirm the Admin templates enumerate scopes and contain no wildcard behavior.

### 1.3 Add hook declaration discovery

- Extend loader metadata parsing for authorization-scope providers.
- Generate a deterministic configuration shim for providers.
- Merge hook definitions with core definitions before route readiness validation.
- Reject async providers, invalid exports, duplicate keys, and namespace theft.
- Update the hook archetype to include the optional contract and an example without enabling it by default.

### Tests

- Pure unit tests for all registry and template calculations.
- Loader generation/snapshot tests matching current API-route/migration conventions.
- Hook collision and invalid-provider tests.
- Test deterministic registry generation independent of provider discovery order.

### Exit criteria

- The registry can be constructed without Sails or a datastore.
- Core and hook definitions are deterministic and collision-safe.
- The agreed initial roles can be represented without role hierarchy.

## Phase 2 — Data model, required transactions, and audit foundation

### 2.1 Add Waterline models and indexes

- Implement all models from design section 2.
- Extend `Role` without removing its compatibility fields/associations.
- Add the single-field sparse unique role `identityKey`, the non-unique brand/key lookup index, and the other composite indexes; prove old rows missing `identityKey` do not collide before migration.
- Export Waterline definitions, attribute interfaces, and storage models.
- Regenerate shims through the normal loader process.

### 2.2 Add required transaction support

- Implement `runWithRequiredTransaction()` separately from the optional helper.
- Detect absent or unsupported transaction capability and return a typed error.
- Ensure all queries, association mutations, CAS updates, and audit writes accept/use the leased connection.
- Add a startup capability probe that does not mutate production authorization data.
- Convert all maintained integration Docker profiles from standalone MongoDB to a transaction-capable single-node replica set, with idempotent initialization and a readiness check that proves transactions are available.
- Document the production Mongo requirement: a replica set or sharded cluster with working transactions; a successful server `ping` is not sufficient.

### 2.3 Implement append-only audit writes

- Define bounded event types and redaction helpers.
- Implement transactional audit insertion for successful mutations.
- Implement independent best-effort audit insertion plus security logging for denied/failed administrative attempts; audit failure must never turn a deny into an allow.
- Prevent update/destroy methods from being exported through the service/controller surface.
- Add cursor pagination/filter validation for later query use.
- Add bounded age-based retention as the only deletion path; default to indefinite retention when unset, respect legal hold, and emit a current summary event.

### Tests

- Model validation and composite uniqueness integration tests.
- Required transaction success, rollback, and unsupported-adapter tests.
- Compose-profile smoke tests proving Mocha, Bruno, OIDC, general integration, S3, and Playwright portal processes connect after replica-set initialization.
- Prove a failed audit insert rolls back a successful-looking primary mutation.
- Prove a failed primary mutation writes no success audit.
- Redaction tests for token, password, raw claims, session, and headers.
- Audit retention disabled/bounded/legal-hold/summary-event tests.

### Exit criteria

- A transaction commits or rolls back authorization state and its success audit as one unit.
- Unsupported transaction deployments are detectable before `enforce`.
- New models are available through generated shims in integration tests.

## Phase 3 — Migration, declaration reconciliation, and protected bootstrap state

### 3.1 Write the idempotent migration

- Extend existing roles with immutable key, server-computed `brand:<id>:<key>` identity key, label, context, status, protected kind, and version.
- Preserve migrated role key case/text exactly; reject/report only empty/control values and exact same-brand duplicates rather than applying the new-role slug grammar.
- Match known roles to initial template revisions without changing existing names.
- Create sourced migration assignments from user-role associations, excluding Guest.
- Preserve all legacy associations.
- Detect and report duplicate brand role names, roles without brands, user references to missing roles, and linked-account anomalies.
- Make batches bounded and resumable; record progress through migration state rather than assuming one unbounded transaction.

### 3.2 Reconcile declared catalog and templates

- Upsert runtime scope definitions without repurposing existing keys.
- Publish missing immutable default template revisions idempotently.
- Do not mark unseen hook definitions orphaned during normal startup.
- Add the explicit post-deployment orphan reconciliation command.

### 3.3 Establish protected roles and assignments

- Ensure one Guest role for every brand.
- Identify brands with no active, unexpired brand administrator as readiness blockers; do not auto-promote an arbitrary user.
- Ensure one global system-administrator role.
- After `UsersService.bootstrap()`, resolve the canonical bootstrap parent administrator and ensure its protected system assignment.
- Fail readiness, not fresh installation, when the configured bootstrap user is ambiguous or disabled.
- Audit created/repaired invariant state with bounded bootstrap/migration actor identifiers.

### Tests

- Empty database/fresh-install bootstrap.
- Existing single-brand and multi-brand migrations.
- Re-running migration/bootstrap produces no duplicate revisions, roles, or assignments.
- Linked alias migration canonicalizes correctly.
- Existing record ACL and Solr strings remain byte-for-byte unchanged.
- Rolling-version catalog reconciliation does not falsely orphan a hook scope.

### Exit criteria

- Existing installations gain a complete new projection without losing legacy state.
- Fresh installations receive protected Guest and system-administrator state.
- Migration reruns and interrupted batches are safe.

## Phase 4 — Effective-context and decision engine

### 4.1 Implement request/user context resolution

- Resolve brand from the established branding service, never from request body authority.
- Resolve session, legacy bearer, anonymous, and trusted system-process principal categories.
- Canonicalize linked accounts and reject disabled effective users.
- Load active/unexpired assignments and active roles directly from storage per request; revoked and locally suppressed rows grant nothing.
- Include system assignments and implicit brand Guest.
- Build the compatibility `req.user.roles` projection from effective roles without persisting Guest membership.
- Return immutable role keys, scope keys, auth method, brand, and optional token ceiling.

### 4.2 Implement effective role scopes

- Load pinned template revision and explicit overrides.
- Apply removes then adds and filter to runtime-active definitions.
- Deduplicate and deterministically sort effective scopes.
- Treat inactive role, absent revision, missing scope, orphaned scope, and expired assignment as non-granting states with bounded reason/evidence.
- Intersect with a token scope ceiling only when a credential validator supplies one.

### 4.3 Implement decision composition

- Implement action-only, brand-entity, and record decision entry points.
- Keep normal denials opaque while retaining an internal explanation graph.
- Add the privileged explanation view that reports contributing Guest/roles/assignments and failed gates.
- Ensure system admin authority is represented by explicit scopes rather than username checks.

### Tests

- Full pure/service matrix for multiple sources, multiple roles, two brands, Guest, system admin, expiry boundaries, disabled/linked users, inactive roles, missing/orphaned definitions, and token ceilings.
- Query-count assertions to prevent per-scope database queries.
- Representative latency/load checks for one-role, multi-role, system-admin, and large-assignment fixtures against the agreed budget.
- Prove no process-local cache allows authority after revocation.
- Prove role display-name changes do not affect effective role keys.

### Exit criteria

- The service can answer every action/resource decision independently of HTTP policies.
- Changes are visible on the next request/event.
- System admin and Guest work without hard-coded usernames or assigned Guest rows.

## Phase 5 — Role and assignment administration service

### 5.1 Implement role operations

- Create custom/template-based roles with normalized immutable keys.
- Clone only a same-brand source role, copying its current effective scopes into a new unprotected role without copying assignments or protected identity.
- Update label/description through versioned CAS.
- Convert desired effective scope sets into minimal add/remove overrides.
- Preview and apply template upgrades using old base/new base/current override comparison.
- Preview and apply bounded cross-brand template upgrades only for explicitly selected role IDs/keys, with per-role versions/audits and a batch summary.
- Preview and inactivate referenced unprotected roles.
- Hard-delete only a never-used unprotected role with no assignment row, workflow/navigation/config reference, or record ACL reference; remove its local overrides in the same transaction and retain the audit event.
- Calculate references from assignments, navigation/config, record ACL samples/counts, and template state without exposing cross-brand data.

### 5.2 Implement assignment operations

- Grant/reactivate and revoke one source tuple idempotently.
- Suppress/unsuppress exact external source tuples while preserving the latest provider `sourcePresent` state.
- Canonicalize user targets.
- Validate role brand, active status, Guest prohibition, protected system-role authority, and optional expiry.
- Deduplicate effective authority across multiple sources.
- Dual-write the legacy association for any role whose last effective assignment is added or removed.
- Implement external-source replacement as one transaction per bounded subject/provider set.
- On successful external synchronization, update `sourcePresent`; never reactivate a locally suppressed tuple.

### 5.3 Implement safety invariants

- Reject final-system-admin revocation, suppression, expiry, disabling, linking-away, or role inactivation.
- Reject final-brand-admin revocation, suppression, expiry, disabling, linking-away, role inactivation, or deletion in each brand.
- Reject brand administrators assigning global system roles.
- Reject removal of `authorization.self.read` from Guest, the protected brand-administration floor from brand Admin, or the protected brand/system floor from system Admin.
- Enforce that a brand administrator can configure/assign only roles whose resulting scopes are a subset of the actor's effective brand scopes.
- Allow explicit adoption of a newly registered scope into the protected system role only with `system.authorization.manage`, impact preview, confirmation, versioning, and audit; registration itself remains non-granting.
- Reject dangerous Guest scopes through the code allowlist.
- Require preview confirmation for scope broadening/removal, template upgrades, role inactivation, bulk apply, and imports.
- Sign bounded confirmation tokens with operation hash, target, expected version, actor/brand, and short expiry.
- Recompute invariants and versions at apply time; a token never suppresses server validation.

### Tests

- CAS races with exactly one winning writer.
- Source-specific revoke while another source remains.
- External suppression survives provider disappearance/reappearance; unsuppression activates only when `sourcePresent` is true.
- Expired/revoked reactivation semantics.
- Dual-write rollback with audit failure.
- Guest/protected-role/final-brand-admin/final-system-admin attacks.
- Protected Guest/brand/system scope-floor removal attacks.
- Delegation-ceiling and explicit system-scope-adoption cases.
- Cross-brand role ID/name poisoning.
- Stale, replayed, wrong-actor, wrong-brand, and expired confirmation tokens.
- Deterministic template upgrade normalization.

### Exit criteria

- No supported controller or hook needs to mutate `User.roles` directly.
- Concurrent changes cannot silently overwrite one another.
- Protected invariants survive all mutation paths.

## Phase 6 — Route metadata, policies, and rollout engine

### 6.1 Extend route definitions

- Add the authorization discriminated union to contract and UI route target types.
- Preserve metadata in the built Sails route config so policies can read it.
- Emit OpenAPI `x-redbox-scope` and correct security declarations.
- Remove path-derived `x-redbox-roles` only after the compatibility documentation can replace it; until then, mark it deprecated.
- Require hook routes to pass the merged registry validator.

### 6.2 Resolve credentials and context

- Refactor `isWebServiceAuthenticated` or introduce a resolver that distinguishes absent and invalid bearer headers.
- Prefer an explicitly valid bearer when supplied; reject invalid/mixed credential ambiguity.
- Attach auth method and immutable context to the request.
- Preserve browser redirect behavior only for appropriate HTML/session routes, never JSON API bearer failures.

### 6.3 Implement `authorizeRequest`

- Resolve stable route ID and declaration.
- Execute legacy and/or scope engines based on mode.
- Enforce approved security fixes in all modes.
- Return representation-appropriate `401`, `403`, or existing specialized Problem Details where required.
- Record bounded shadow discrepancies asynchronously without delaying/altering the legacy result.
- Fail startup/readiness for missing declarations; deny missing declarations in `enforce` even if startup validation was bypassed.

### 6.4 Protect session mutations

- Add the conditional CSRF policy to authorization mutation actions.
- Use the framework's existing CSRF verification primitives/header.
- Test session, bearer, absent, malformed, and mixed-credential cases.

### Tests

- Route-map and OpenAPI snapshot/consistency tests.
- All three rollout modes for allow/deny/mismatch/missing declaration.
- Invalid bearer regression tests.
- HTML redirect versus JSON Problem Details behavior.
- Session CSRF and bearer non-CSRF matrix.
- Hook route/scope registration validation.

### Exit criteria

- Every merged route has an explicit declaration or a reviewed compatibility exception.
- Shadow decisions are observable without affecting users.
- Enforce mode cannot fall through because a path has no rule.

## Phase 7 — Brand/entity and record resource gates

### 7.1 Preserve and harden record ACLs

- Update record role comparisons to prefer immutable role key.
- Add action-scope checks before record service operations.
- Add explicit broad-scope handling to the ACL predicate.
- Ensure direct-user ACL and edit-implies-view behavior is unchanged.
- Ensure Solr/search role filtering uses effective keys and agrees with direct checks.
- Cover deleted records, audit, permissions, attachments, related records, exports, asynchronous actions, and integrations.

### 7.2 Close cross-brand entity gaps

- Replace controller ID-only lookups with brand-constrained service methods.
- Start with vocabulary get/update/delete/import/sync and every record path.
- Continue through the phase-0 inventory: forms, record types, reports, named queries, dashboard config, app config, branding assets/config, harvest/integration state, and hook-owned entities.
- Ignore/reject payload branding changes; derive brand from context.
- Use `404` for cross-brand object identifiers and `403` only for a known in-brand object denied by capability/resource policy.

### 7.3 Internal calls and WebSockets

- Add explicit contexts to user-triggered jobs.
- Add constrained system-process contexts to trusted scheduled work.
- Revalidate privileged WebSocket messages.
- Update hook-facing service contracts and remove ambient-brand assumptions in in-scope calls.

### Tests

- Cross-brand matrix for every brand-owned family.
- Direct record fetch versus search/list/export consistency.
- Record ACL matrix for browser, bearer, system admin, job, and WebSocket.
- Payload brand spoofing tests.
- No object-existence leakage in response body or status.

### Exit criteria

- Capability checks cannot be used to cross a brand boundary.
- Record behavior preserves intended ACLs and explicitly tests broad access.
- All inventoried background/hook entry points provide an authorization context.

## Phase 8 — Authorization contract API

### 8.1 Add schemas and controller actions

- Implement Zod request/response schemas for all endpoints in design section 5.4.
- Use cursor pagination, bounded filters, and stable deterministic sorting.
- Validate `expectedVersion`, desired scope sets, expiry timestamps, reasons, bulk limits, and confirmation tokens.
- Keep controller actions thin and return typed Problem Details.

### 8.2 Effective projection and catalog

- Implement `/me` with only the caller-safe projection.
- Implement catalog/template listing with deprecation/orphan/source metadata.
- Implement brand role read/create/clone/update/preview/apply/inactivate/delete.

### 8.3 Assignment, audit, explain, and import/export

- Implement assignment list/grant/revoke/suppress/unsuppress and bounded bulk preview/apply.
- Write one audit event per changed bulk assignment plus a batch summary in the same transaction.
- Implement system-only selected-role bulk template upgrade preview/apply with per-role conflict reporting and no silent all-brand auto-upgrade.
- Implement redacted audit filtering.
- Implement privileged explanation without performing a mutation.
- Implement deterministic versioned export and preview/apply import, excluding users and system-administrator assignments by default.
- Implement rollout readiness endpoint for system administrators.

### Tests

- Controller/service contract tests and OpenAPI coverage.
- Bruno happy paths and all documented status codes.
- Pagination/filter limits, oversized bulk payload, malformed CSV/JSON, duplicate rows, and partial-failure prevention.
- Cross-brand and privilege escalation attempts against every endpoint family.
- Confirm the API never accepts effective scopes or impact counts from clients.

### Exit criteria

- Every administration workflow is available through one documented contract API.
- API schemas and runtime responses agree.
- A bearer integrator can perform only actions granted to its effective user.

## Phase 9 — Embedded Angular administration UI

### 9.1 Replace the single-table component with a tab shell

- Retain the `manage-roles` project and EJS mount.
- Add component-state tabs and optional `?tab=` persistence without Angular Router.
- Load active-brand and `/me` projection once per page, with reload after mutations.
- Remove the hard-coded `hiddenUsers = ['admin']`; protected state is shown safely according to caller scope.
- Display the current rollout mode. In `legacy`/`shadow`, state plainly that custom scope changes are evaluated by the new engine but are not yet authoritative.

### 9.2 Build Roles and Scope Catalog tabs

- Role list with status, template revision, override count, assignment count, and protected badges.
- Create/edit drawer or modal with immutable key and mutable label clearly separated.
- Same-brand clone flow that previews copied scopes and never copies assignments/protected identity.
- Grouped/filterable scope selector showing base/add/remove/effective state and risk.
- Preview dialogs for scope changes, template upgrades, and inactivation.
- Delete control only for server-confirmed never-used/dependency-free roles.
- Read-only scope catalog with source, status, replacement, and role usage.

### 9.3 Build Assignments and Audit tabs

- Server-side user/role/source/status/source-presence/expiry filtering.
- Manual grant/revoke and external suppress/unsuppress with provenance and optional expiry.
- If product confirms the still-open phase-1 bulk UI need, add CSV/JSON preview and explicit apply over the already delivered bounded API; otherwise record the UI task as deliberately deferred.
- Audit filters and redacted before/after detail.
- System-only controls shown from effective scopes, not username or role labels.

### 9.4 Concurrency, errors, and accessibility

- Preserve editor input on `409` and offer reload/compare.
- Map Problem Details codes to actionable messages.
- Disable duplicate submissions while a mutation is pending.
- Announce async validation/results to assistive technology.
- Ensure keyboard tab navigation, modal focus management, labels, headings, and non-color status cues.

### Tests

- Unit tests for services, each tab, protected state, previews, version conflict, bulk validation, and errors.
- Browser tests for brand admin and system admin workflows.
- Direct URL denial test even when UI control is hidden.
- Accessibility smoke tests for keyboard/focus/name/role/value.

### Exit criteria

- Administrators can complete all normal role and assignment workflows without legacy AJAX calls.
- The app remains an embedded Angular application with the existing base-path/CSP behavior.
- UI state cannot conceal or override server authority.

## Phase 10 — Navigation and shared UI projection

### 10.1 Add `requiredScope` configuration

- Extend menu, home panel, and admin sidebar interfaces and schemas.
- Resolve scope visibility through `AuthorizationService` using the request context.
- Migrate default Admin/Librarian/Researcher navigation entries to destination-route scopes.
- Retain `requiredRoles` compatibility reads and warnings according to rollout mode.
- Update configuration editors to write `requiredScope` for new changes.

### 10.2 Add Angular projection service

- Add typed `/me` client to `portal-ng-common`.
- Provide synchronous-after-load `hasScope()` and observable state for components.
- Invalidate/reload after role/assignment mutation and brand/session change.
- Document that it controls affordances only.

### Tests

- Menu/home/admin sidebar legacy/shadow/enforce behavior.
- Unknown scope validation.
- Destination route and navigation scope parity test.
- Angular projection refresh and error behavior.

### Exit criteria

- Navigation and destination routes use the same capability identifiers.
- Existing `requiredRoles` configurations remain readable during the compatibility window.

## Phase 11 — Onboarding, compatibility adapters, and hooks

### 11.1 Replace fixed nested-role onboarding

- Replace AAF/OIDC calls to `getNestedRoles()` with one configured explicit default role assignment.
- Keep `Researcher` as the compatibility default when no per-brand/provider value is configured.
- Rely on implicit Guest rather than assigning it.
- Create the onboarding source only for a genuinely first brand/provider onboarding; retain revoked onboarding rows so later logins do not reapply a changed default.
- Validate missing/inactive configured roles and expose readiness errors rather than silently choosing a more powerful role.
- Deprecate then remove `getNestedRoles()` from exported runtime methods after consumers migrate.

### 11.2 Adapt legacy role endpoints and user flows

- Route legacy role listing/update through the new read/mutation services.
- Convert user create/update role arrays into manual assignments.
- Update account linking to merge/canonicalize sourced assignments while enforcing final-brand-admin and final-system-admin safety.
- Require recent server-verified proof of both identities, preview merged authority across all affected brands, and reject brand administrators acting outside their brand.
- Commit the link, assignment canonicalization, legacy projection, quorum validation, and audits atomically; do not implement automatic authority redistribution on unlink.
- Maintain response compatibility and add deprecation headers/docs.
- Add drift checks between assignment authority and legacy associations.

### 11.3 Stabilize claim-hook API

- Export a typed external-assignment replacement contract that respects local suppression.
- Require provider/source key, canonical subject, explicit brand, desired role keys, and actor metadata.
- Make provider synchronization idempotent, update source presence, revoke only that provider's stale unsuppressed rows, and preserve suppressed rows.
- Update maintained hooks and archetype documentation.

### Tests

- AAF/OIDC/local onboarding with default role, configured role, missing role, multi-brand user, revoked onboarding, and later default changes that affect future users only.
- Guest is effective but never explicitly assigned.
- Legacy AJAX/API response compatibility.
- Linked-account and claim-hook source behavior.
- Drift detection for direct legacy association mutation.

### Exit criteria

- Supported onboarding, user management, and maintained hooks use the new assignment service.
- Integrators have a documented compatibility and migration path.

## Phase 12 — Legacy bearer enforcement and authentication boundary

### 12.1 Correct bearer resolution

- Distinguish no header, malformed scheme/value, unknown/revoked token, disabled user, and valid token.
- Reject supplied invalid credentials with `401` before Guest evaluation.
- Resolve linked canonical account and current authorization state per request.
- Ensure token revoke/replace is visible on the next request.

### 12.2 Apply the complete authorization stack

- Route valid legacy bearer requests through action scopes and resource gates.
- Ensure no API-specific Admin shortcut remains.
- Keep tokens opaque in docs and responses.
- Scrub authorization headers and token fields from logs, errors, audit, traces, exports, and test snapshots.

### 12.3 Publish migration guidance

- List affected endpoints/scopes and legacy endpoint deprecations.
- Give integrators a way to test effective scopes and denials in shadow before enforce.
- State the supported compatibility releases without claiming an OAuth replacement is already selected.

### Tests

- Bruno matrix for absent/valid/invalid/revoked/disabled token across Guest, scoped, cross-brand, and record-ACL actions.
- Logging/audit redaction tests.
- Session behavior remains unchanged except where approved security fixes apply.

### Exit criteria

- Legacy bearer authentication remains usable but cannot evade scope, brand, or record checks.
- No runtime or documentation presents it as OAuth/JWT.

## Phase 13 — Readiness, shadow evidence, recovery, and operations

### 13.1 Implement bounded mismatch aggregation

- Compute safe fingerprints from bounded fields.
- Atomically upsert counts/first/last timestamps.
- Do not block a user request if shadow evidence storage fails; emit a bounded operational error.
- Add retention for resolved aggregates.
- Separate approved security-fix differences from unresolved mapping defects.

### 13.2 Implement readiness tooling

- Verify registry, routes, templates, protected roles, transactions, migration state, legacy projection drift, navigation parity, and shadow mismatches.
- Treat any brand without an active, unexpired, unsuppressed brand administrator as an `enforce` readiness blocker.
- Treat fewer than two active, unexpired, unsuppressed system administrators as an `enforce` readiness blocker even though the runtime invariant prevents only the final administrator's removal.
- Produce machine-readable JSON and concise operator output.
- Include build/version and registry generation per instance.
- Never change rollout mode from the tool or endpoint.

### 13.3 Implement system-admin recovery

- Build the non-HTTP operator command through the normal application/service environment.
- Require exact canonical target and typed confirmation/reason.
- Use the same transaction/audit/invariant code as ordinary assignment changes with the privileged operator path explicitly marked.
- Document offline/online invocation, expected output, and verification.

### Tests

- Multi-instance mismatch upsert race.
- Bounded-cardinality/redaction tests.
- Readiness fixtures for every blocking and warning condition.
- Recovery success, idempotency, ambiguity, disabled/alias target, transaction failure, and audit rollback.

### Exit criteria

- Operators can measure readiness without inspecting raw database state.
- A lockout has a documented, audited, non-HTTP recovery path.

## Phase 14 — Shadow rollout and security remediation

### 14.1 Deploy in `legacy`

- Run migrations with one lifting instance before scaling out because the current migration runner has no cross-instance lock, then run declaration reconciliation on the deployment.
- Confirm transaction capability and protected-role invariants.
- Exercise new UI/API with a limited administrator cohort while legacy path rules still enforce.
- Confirm legacy projection drift remains zero for supported writes.

### 14.2 Enable `shadow`

- Enable mode deployment-wide through configuration.
- Run representative anonymous, session, bearer, multi-brand, and record workflows.
- Review discrepancies by route/reason/brand category, not by ad hoc log sampling.
- Classify each mismatch as mapping defect, legacy bug/security fix, data anomaly, or intentional product change.
- Fix mapping/data defects and rerun evidence.

### 14.3 Close known security gaps

- Enforce invalid-bearer `401` in every mode.
- Close cross-brand vocabulary/record/entity lookups.
- Remove “no PathRule means allow” from enforce readiness.
- Remove stale session-role authority.
- Confirm hidden navigation and direct route decisions agree.
- Obtain explicit review for every intentional mismatch retained as a security fix.

### Tests and evidence

- Production-like test deployment for at least the agreed observation window.
- Production-like load evidence showing authorization query count and p95/p99 latency within the agreed budget.
- Zero unresolved allow/deny discrepancies for covered representative traffic.
- No high-risk route without exercised evidence.
- Security review signs off approved differences.
- Restore/rollback rehearsal using `legacy` mode without reversing migration.

### Exit criteria

- All enforce-readiness blockers are clear.
- Remaining discrepancies are approved security/product changes with tests.
- Integrators have received migration documentation and a test window.

## Phase 15 — Enforce, stabilize, and hand over

### 15.1 Switch to `enforce`

- Deploy the reviewed configuration to all instances.
- Verify each instance reports the same build, registry generation, and mode.
- Run smoke tests for Guest, Researcher, brand Admin, system Admin, legacy bearer, two brands, and record ACLs.
- Monitor decision reasons, `401/403/404`, mismatch evidence, conflicts, transaction errors, and support reports.

### 15.2 Preserve rollback and compatibility

- Keep path rules, legacy projection, compatibility endpoints, and emergency mode for the full documented release.
- Continue dual-write/drift checks.
- Report users/roles that depend on new-only custom scopes and would lose capabilities under emergency legacy semantics.
- Do not remove compatibility based only on elapsed time; require integrator evidence.
- Patch authorization issues through new services, not direct legacy writes.

### 15.3 Complete documentation and release evidence

- Publish administrator, hook author, integrator, migration, rollout, recovery, audit, and troubleshooting docs.
- Publish the initial scope catalog and role-template mapping.
- Record deferred OAuth questions and evidence needed for the later architecture spike.
- Add a release note that clearly separates new authorization from unchanged legacy authentication.

### Exit criteria

- Scope authorization is authoritative in production-like and supported deployment profiles.
- No unresolved high-severity authorization defect remains.
- Operators can observe, recover, and roll back within the documented boundary.
- Compatibility consumers have a clear deadline/process, not an undocumented break.

## 6. Error and result contracts

### 6.1 Domain error mapping

| Domain error                            | HTTP           | Retry guidance                                                    |
| --------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `authorization.authentication-required` | `401`          | Authenticate and retry.                                           |
| `authorization.invalid-credential`      | `401`          | Replace/reissue credential; do not retry unchanged.               |
| `authorization.scope-denied`            | `403`          | Administrative change required.                                   |
| `authorization.resource-denied`         | `403`          | ACL/ownership change required.                                    |
| `authorization.not-found`               | `404`          | Do not reveal cross-brand existence.                              |
| `authorization.invalid-scope`           | `400`          | Correct requested scope set.                                      |
| `authorization.protected-role`          | `400` or `409` | Change operation/target.                                          |
| `authorization.version-conflict`        | `409`          | Reload and compare before retry.                                  |
| `authorization.preview-stale`           | `409`          | Generate a new preview.                                           |
| `authorization.last-brand-admin`        | `409`          | Assign another effective administrator in the target brand first. |
| `authorization.last-system-admin`       | `409`          | Assign another effective system admin first.                      |
| `authorization.bulk-invalid`            | `422`          | Correct rows and preview again.                                   |
| `authorization.transaction-unavailable` | `503`          | Correct deployment datastore; mutation was not applied.           |

### 6.2 Successful mutation result

Every mutation returns:

```ts
interface AuthorizationMutationResult<T> {
  data: T;
  version: number;
  auditEventId: string;
  requestId: string;
}
```

Bulk results additionally return `batchId`, applied counts, no-op counts, and bounded row results. They never return raw credentials or client-supplied unvalidated authority.

### 6.3 Preview result

Preview responses include:

- normalized requested operation;
- current and proposed versions/state summaries;
- grants/removals and protected warnings;
- bounded affected assignment/config/record-reference counts;
- fatal validation errors;
- a short-lived opaque confirmation token only when apply is permitted.

Apply must include that token and the same expected version. The server recomputes current state and rejects drift.

## 7. Compatibility and migration

### 7.1 Supported compatibility surface

- Current role keys/names.
- Current record `viewRoles`/`editRoles` strings and direct usernames.
- Legacy bearer UUID authentication.
- Existing role-list and user-role update HTTP routes through adapters.
- Existing `req.user.roles` shape as a per-request effective projection.
- Existing `requiredRoles` navigation configuration reads.
- Existing claim hooks after adaptation to the typed source API.

### 7.2 Explicitly unsupported compatibility

- Direct database mutation of role associations as an integration API.
- Depending on a mutable role display label as an ACL identifier.
- Treating absence of a path rule as a public declaration.
- Invalid bearer fallback to Guest.
- Cross-brand lookup by arbitrary entity ID.
- Implicit role hierarchy through the fixed nested-role helper.
- Assuming an Admin label grants future scopes automatically.

### 7.3 Data rollback stance

The migration is forward-only for new projection records. Operational rollback switches decision mode and continues using the maintained legacy projection. A destructive down migration is not required and would be riskier than leaving additive models in place.

## 8. Security checklist

- [ ] Every core/hook route declares `scope`, `public`, or `pre-auth` with validation.
- [ ] Every unsafe session authorization API verifies CSRF.
- [ ] Supplied invalid bearer credentials return `401`.
- [ ] Disabled and linked-disabled users cannot authenticate or retain assignments.
- [ ] Effective roles/scopes are loaded from authoritative state each request/event.
- [ ] Guest cannot receive unsafe scopes and cannot be explicitly assigned.
- [ ] System/brand protected roles cannot be inactivated or transformed.
- [ ] The final effective system administrator cannot be removed through any user/link/role path.
- [ ] The final effective brand administrator in a brand cannot be removed through any user/link/role path.
- [ ] Brand administrators cannot delegate effective scopes they do not possess.
- [ ] Role keys are immutable; labels are not used for security comparison.
- [ ] Scope keys cannot be invented by UI/API clients.
- [ ] Missing/orphaned scopes grant nothing.
- [ ] New template revisions never auto-broaden pinned roles.
- [ ] Role/assignment mutations and success audit commit atomically.
- [ ] Stale versions and stale/replayed previews fail.
- [ ] Brand-owned queries include authoritative brand predicates.
- [ ] Cross-brand IDs return `404` without existence details.
- [ ] Record action scope and ACL are both enforced.
- [ ] Search/export/direct-read record decisions agree.
- [ ] Internal contexts cannot be created from request input.
- [ ] Logs, metrics, audit, exports, and mismatches contain no secrets/raw claims.
- [ ] No wildcard, hierarchy, or username-based admin shortcut remains.
- [ ] Rollout mode is consistent across instances and cannot be changed through the admin API.
- [ ] Recovery is non-HTTP, explicit, audited, transactional, and idempotent.

## 9. Main risks and mitigations

| Risk                                      | Consequence                                            | Mitigation                                                                                         |
| ----------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Incomplete route inventory                | Enforce mode unexpectedly denies or exposes an action. | Machine-readable inventory, fail-closed validation, hook route merge tests, shadow evidence.       |
| Existing datastore lacks transactions     | Mutation/audit inconsistency.                          | Early capability probe, `503` fail-closed writes, deployment documentation and readiness blocker.  |
| Legacy association and assignments drift  | Revocation or rollback behaves differently.            | Single writer service, transactional dual-write, drift report, no direct DB compatibility promise. |
| Role rename breaks record ACL             | Lost record access.                                    | Immutable key + separate label; no phase-1 key rename.                                             |
| Template update silently broadens roles   | Privilege escalation after deployment.                 | Immutable revisions, pinned roles, explicit preview/apply upgrades.                                |
| Rolling deployment orphans hook scopes    | Temporary denial.                                      | Startup only marks seen; orphaning is an explicit post-rollout reconciliation.                     |
| System admin lockout                      | No UI recovery.                                        | Quorum checks across revoke/expiry/disable/link/inactivate plus audited operator recovery.         |
| Shadow data leaks identifiers             | Security/privacy exposure.                             | Bounded enums, hashed fingerprint, no subject/resource/token labels, retention.                    |
| API/UI diverge                            | Hidden controls or unauthorized direct calls.          | Same contract API and scope identifiers; direct route tests.                                       |
| Brand checks remain in controllers        | ID-only service paths leak cross-brand objects.        | Context/brand-required service interfaces and cross-brand matrix tests.                            |
| Legacy bearer assumed to be OAuth         | Bad integrator security assumptions.                   | Consistent “opaque legacy bearer” terminology and explicit phase boundary.                         |
| Scope catalog becomes too granular        | Unmanageable roles.                                    | Business-capability review and route-to-capability reuse metrics.                                  |
| Scope catalog is too broad                | Excess privilege.                                      | Risk classification, explicit record broad scopes, route/resource matrix review.                   |
| Bulk operations exceed transaction limits | Availability or partial failure risk.                  | Bounded payload/batch size, preview, one documented atomic batch at a time.                        |

## 10. Deferred work

The following are backlog items, not hidden acceptance criteria for phase 1:

- OAuth authorization-server product/deployment decision.
- Client registration and secret lifecycle.
- OAuth Client Credentials access tokens.
- User-delegated Authorization Code with PKCE.
- Refresh token rotation/reuse detection/revocation.
- Token hashing, multiple active legacy credentials, expiry, and rotation overlap if pursued outside OAuth.
- Token-specific scope requests/consent.
- IdP group-to-role mapping UI.
- Service-principal administration UI/model beyond constrained internal process contexts.
- Role-key rename with record/Solr migration.
- Role hierarchy, denies, wildcards, or policy language unless a new evidenced use case appears.
- Automatic global template upgrades.
- Hard deletion of authorization history/models.
- Removal of `PathRule`, legacy role associations, compatibility AJAX routes, and emergency `legacy` mode before integrator evidence permits it.
- Optional global brand-creation scope if it cannot be added safely within the existing brand-management boundary.
