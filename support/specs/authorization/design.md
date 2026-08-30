# Design

This document defines the target design for configurable application authorization in ReDBox Portal. It translates the decisions recorded in [Application Authorization and Permission Model](../../wiki/Application-Authorization-and-Permission-Model.md) into concrete module, data, API, UI, migration, and rollout contracts for this repository.

The first delivery changes authorization, not authentication. Existing browser sessions, federated sign-in, local users, and legacy bearer UUID tokens remain authentication mechanisms. OAuth 2.0/OIDC token issuance is a separate phase and has no runtime dependency in this delivery.

## Goals

- Let authorized administrators create and configure brand roles through the UI and API.
- Replace path-pattern permissions with stable, namespaced business scopes declared by core and hooks.
- Apply the same scope to a browser route, its navigation affordance, and the API action that performs the operation.
- Preserve brand isolation, entity ownership, direct-user record ACLs, and role-based record ACLs.
- Support one user having different roles in multiple brands.
- Preserve the synthetic Guest baseline for anonymous and authenticated users without assigning Guest to every user.
- Support a protected system administrator that can administer multiple brands.
- Make every permission mutation versioned, atomic, auditable, and safe under concurrency.
- Provide a reversible `legacy -> shadow -> enforce` rollout with measurable readiness gates.
- Keep legacy bearer tokens working for at least one compatibility release while applying the new authorization checks to them.
- Give hooks stable extension contracts for declaring scopes and assigning roles from claims.

## Non-goals for the first delivery

- Operating an OAuth authorization server.
- Choosing Keycloak or any other external authorization-server product.
- Issuing access tokens, refresh tokens, or JWTs.
- Adding user-delegated OAuth consent or delegated API access for federated users.
- Adding role inheritance, role nesting, wildcard scopes, explicit deny rules, or ordered policy precedence.
- Building a general-purpose policy language.
- Letting administrators invent scope identifiers at runtime. Scope keys come from deployed core or hook code.
- Replacing the existing record ACL representation.
- Making a single role span multiple brands. A user receives separate role assignments in each brand.
- Adding an IdP group-to-role mapping UI. Existing claim hooks may continue through the typed assignment API.
- Using authorization UI visibility as a security boundary.
- Preserving insecure legacy behavior merely to obtain a zero-difference shadow report.

## Contract vocabulary

| Term                 | Meaning                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Scope                | A stable business capability such as `record.create` or `authorization.role.manage`.                                          |
| Scope definition     | Immutable scope identity plus deployed metadata supplied by core or a hook.                                                   |
| Role template        | A global, versioned default set of scopes from which brand roles can be created or upgraded.                                  |
| Role                 | A configurable collection of effective scopes in exactly one brand, except for the protected system role.                     |
| Role key             | Immutable identifier used by integrations and record ACLs. Existing `Role.name` values become role keys.                      |
| Display label        | Mutable, translated or human-readable role name shown in the UI.                                                              |
| Role override        | An explicit scope addition or removal relative to a pinned template revision.                                                 |
| Assignment           | A sourced and optionally expiring grant of a role to a principal.                                                             |
| Guest baseline       | The protected brand role whose scopes are included for every request in that brand. It is not a user assignment.              |
| System administrator | A protected, brand-independent role assigned to the bootstrap administrator and optionally other users.                       |
| Action gate          | The route or service operation's required scope.                                                                              |
| Resource gate        | Brand, entity ownership, record ACL, or other object-level constraint applied after the action gate.                          |
| Effective scopes     | The additive union of scopes from all applicable active assignments plus the Guest baseline.                                  |
| Token scope ceiling  | An optional upper bound on effective scopes supplied by a future token format. Legacy bearer tokens have no separate ceiling. |
| Decision             | A typed allow or deny result with a bounded reason code.                                                                      |
| Rollout mode         | Deployment-wide authorization behavior: `legacy`, `shadow`, or `enforce`.                                                     |

## 1. Authorization invariants

### 1.1 The complete decision

A capability never grants cross-brand or object-level access by itself. The authoritative decision is:

```text
allow =
  required action scope is effective
  AND principal is active
  AND requested brand is authorized
  AND entity belongs to the requested brand when the entity is brand-owned
  AND record ACL permits the operation when a record is involved
  AND requested scope is inside the token scope ceiling when one exists
```

Every term is additive. There is no deny precedence, role priority, or role hierarchy.

### 1.2 Fail-closed rules

- A protected action without an explicit scope declaration is a startup/readiness error and is denied in `enforce` mode.
- A scope key used by a route, template, role override, or token ceiling but absent from the runtime registry grants nothing.
- An inactive role, revoked assignment, expired assignment, disabled user, linked disabled primary account, or orphaned scope grants nothing.
- A missing or invalid brand returns `404`.
- A resource identifier that exists only in another brand returns `404`, not `403`.
- A valid in-brand resource for which the actor lacks permission returns `403`.
- An invalid supplied bearer token returns `401`, even if anonymous Guest access would otherwise be possible.
- The server never accepts client-computed effective scopes, brand authority, role membership, or impact counts.

### 1.3 Stable role identity

The current role `name` is already embedded in configuration, hooks, record `authorization.viewRoles`, record `authorization.editRoles`, and Solr fields. Phase 1 therefore treats that value as an immutable compatibility key.

- Existing role: `key = name`, `displayName = name`.
- New role: the server creates an immutable normalized key and writes the same value to legacy `name`.
- Rename in the UI changes `displayName`, never `key` or legacy `name`.
- Record ACL checks compare `role.key ?? role.name` with stored ACL values.
- A key change is not a normal update. It is a future explicit migration operation with record and Solr impact analysis.

Migrated keys are treated as opaque, exact, case-sensitive compatibility values and are never lowercased or slugified; deployment-specific roles may not follow a new grammar. Migration rejects only empty/control-character values and reports same-brand exact duplicates. Newly created keys use the stricter `^[a-z][a-z0-9-]{0,63}$` grammar. API clients URL-encode grandfathered keys, and all equality checks remain exact.

This avoids a phase-1 bulk rewrite of record ACLs and search indexes.

## 2. Data model (Waterline models)

All new models live in `packages/redbox-core/src/waterline-models/`, are exported by its `index.ts`, and are added to `WaterlineModels`. Storage interfaces and public model classes are updated alongside them.

### 2.1 `AuthorizationScope`

`AuthorizationScope` is the persisted projection of the deployed scope registry. Code remains authoritative for whether a scope exists at runtime.

| Field                | Type    | Rules                                                          |
| -------------------- | ------- | -------------------------------------------------------------- |
| `key`                | string  | Required, unique, immutable; lowercase dot-separated segments. |
| `namespace`          | string  | First key segment or registered hook namespace.                |
| `label`              | string  | Human-readable catalog label.                                  |
| `description`        | string  | Required explanation of what the capability permits.           |
| `risk`               | enum    | `read`, `write`, `admin`, or `system`.                         |
| `sourceType`         | enum    | `core` or `hook`.                                              |
| `sourcePackage`      | string  | Package that owns the definition.                              |
| `sourceVersion`      | string  | Deployed package version that last declared it.                |
| `status`             | enum    | `active`, `deprecated`, or `orphaned`.                         |
| `replacementKey`     | string? | Optional active replacement for a deprecated scope.            |
| `lastSeenGeneration` | string  | Registry generation that last observed the scope.              |
| `metadataVersion`    | number  | Optimistic version for catalog reconciliation only.            |

Indexes:

- unique `{ key: 1 }`;
- `{ namespace: 1, status: 1, key: 1 }` for catalog browsing;
- `{ sourcePackage: 1, status: 1 }` for hook reconciliation.

Administrators cannot create, rename, or delete these records. Reconciliation can update descriptive metadata but cannot repurpose a key. A conflicting definition for the same key fails startup validation.

### 2.2 `RoleTemplate`

`RoleTemplate` owns global template identity.

| Field             | Type   | Rules                                                                                                    |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `key`             | string | Required, unique, immutable. Initial keys include `guest`, `researcher`, `librarian`, and `brand-admin`. |
| `displayName`     | string | Mutable template label.                                                                                  |
| `description`     | string | Administrator-facing purpose.                                                                            |
| `currentRevision` | number | Latest published revision.                                                                               |
| `protectedKind`   | enum   | `none`, `guest`, `brand-admin`, or `system-admin`.                                                       |
| `status`          | enum   | `active` or `inactive`.                                                                                  |
| `version`         | number | Optimistic concurrency version.                                                                          |

Only a principal with a system-level template-management scope may publish template revisions. Normal brand administrators can view templates, create a brand role from one, and explicitly upgrade a role to an available revision.

### 2.3 `RoleTemplateRevision`

Template revisions are immutable snapshots.

| Field         | Type                     | Rules                                       |
| ------------- | ------------------------ | ------------------------------------------- |
| `template`    | belongsTo `RoleTemplate` | Required.                                   |
| `revision`    | number                   | Required; unique with `template`.           |
| `scopeKeys`   | JSON string array        | Sorted, unique, active declared scope keys. |
| `notes`       | string?                  | Release or upgrade notes.                   |
| `publishedBy` | string                   | Actor identifier.                           |
| `publishedAt` | datetime                 | Required.                                   |

Indexes:

- unique `{ template: 1, revision: 1 }`;
- `{ template: 1, publishedAt: -1 }`.

Existing revisions are never edited. Publishing a revision and advancing `RoleTemplate.currentRevision` occur in one required datastore transaction with an audit event.

### 2.4 Extended `Role`

The existing `Role` model remains the role identity used by record ACL and compatibility code. It gains the following fields while retaining `name`, `branding`, and the temporary `users` association.

| Field              | Type                        | Rules                                                                                                                  |
| ------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`             | string                      | Existing field; immutable compatibility key after migration.                                                           |
| `key`              | string                      | Required after migration; immutable.                                                                                   |
| `identityKey`      | string                      | Server-computed immutable uniqueness key: `brand:<brandingId>:<key>` or `system:<key>`. Never accepted from API input. |
| `displayName`      | string                      | Mutable UI label.                                                                                                      |
| `description`      | string?                     | Administrator-facing purpose.                                                                                          |
| `contextType`      | enum                        | `brand` or `system`.                                                                                                   |
| `branding`         | belongsTo `BrandingConfig`? | Required for `brand`; absent for `system`.                                                                             |
| `template`         | belongsTo `RoleTemplate`?   | Optional template identity.                                                                                            |
| `templateRevision` | number?                     | Pinned immutable revision.                                                                                             |
| `protectedKind`    | enum                        | `none`, `guest`, `brand-admin`, or `system-admin`.                                                                     |
| `status`           | enum                        | `active` or `inactive`. Inactivation preserves referenced/history-bearing roles.                                       |
| `version`          | number                      | Required optimistic concurrency version.                                                                               |
| `createdBy`        | string?                     | Actor identifier or `migration`.                                                                                       |
| `updatedBy`        | string?                     | Last actor identifier.                                                                                                 |

Indexes:

- unique sparse `{ identityKey: 1 }`; the single-field sparse index safely skips pre-migration rows that do not yet have the field;
- `{ branding: 1, key: 1 }` for normal lookups;
- `{ branding: 1, status: 1, displayName: 1 }`;
- `{ template: 1, templateRevision: 1 }`.

Service validation, rather than optional Waterline relations alone, enforces the brand/system shape and recomputes `identityKey`; mismatched client/stored values are rejected or repaired only by migration. There is exactly one active protected Guest role per brand and exactly one protected system-administrator role globally.

### 2.5 `RoleScopeOverride`

Role scope configuration is represented as a three-way-template override, not as a copied untraceable scope list.

| Field       | Type             | Rules                          |
| ----------- | ---------------- | ------------------------------ |
| `role`      | belongsTo `Role` | Required.                      |
| `scopeKey`  | string           | Required registry key.         |
| `effect`    | enum             | `add` or `remove`.             |
| `createdBy` | string           | Actor identifier.              |
| `reason`    | string?          | Optional administrator reason. |

Indexes:

- unique `{ role: 1, scopeKey: 1 }`;
- `{ scopeKey: 1, effect: 1 }` for impact analysis.

The effective scopes of a role are:

```text
(pinned template revision scopes - remove overrides) union add overrides
```

A custom role without a template has an empty base, so its `add` overrides are its complete scope set. When the UI submits a desired effective scope set, `RoleAdministrationService` derives the minimal overrides relative to the pinned template revision.

Template upgrades do not silently alter brand roles. The administrator previews a three-way diff, then explicitly pins the new revision. Existing overrides remain explicit and are re-normalized against the new base in the same transaction.

### 2.6 `RoleAssignment`

`RoleAssignment` becomes the authoritative source of explicit membership in `shadow` and `enforce` modes.

| Field           | Type                        | Rules                                                                                                          |
| --------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `principalType` | enum                        | `user` in phase 1; reserved values are not accepted yet.                                                       |
| `principalId`   | string                      | Canonical active user ID.                                                                                      |
| `role`          | belongsTo `Role`            | Required; Guest is forbidden.                                                                                  |
| `branding`      | belongsTo `BrandingConfig`? | Must equal the role brand; absent for the system role.                                                         |
| `source`        | enum                        | `manual`, `onboarding`, `migration`, `external`, or `recovery`.                                                |
| `sourceKey`     | string                      | Stable source-local identity, such as `manual` or an IdP mapping key.                                          |
| `status`        | enum                        | `active`, `revoked`, or `suppressed`. Suppression is a local administrative block on an external source tuple. |
| `sourcePresent` | boolean                     | For recurring external sources, whether the latest successful synchronization still requested the role.        |
| `assignedBy`    | string                      | Actor identifier or trusted process name.                                                                      |
| `assignedAt`    | datetime                    | Required.                                                                                                      |
| `expiresAt`     | datetime?                   | Optional assignment expiry; independent of token expiry.                                                       |
| `revokedBy`     | string?                     | Actor identifier.                                                                                              |
| `revokedAt`     | datetime?                   | Required when revoked.                                                                                         |
| `suppressedBy`  | string?                     | Local actor that suppressed an external assignment.                                                            |
| `suppressedAt`  | datetime?                   | Required when suppressed.                                                                                      |
| `reason`        | string?                     | Operator/admin reason.                                                                                         |
| `version`       | number                      | Optimistic concurrency version.                                                                                |

Indexes:

- unique `{ principalType: 1, principalId: 1, role: 1, source: 1, sourceKey: 1 }`;
- `{ principalType: 1, principalId: 1, status: 1, expiresAt: 1 }`;
- `{ branding: 1, role: 1, status: 1 }`;
- `{ role: 1, status: 1 }` for impact previews;
- `{ expiresAt: 1, status: 1 }`.

Multiple sources may independently grant the same role. Revoking one source does not remove authority while another active, unexpired source remains. A local administrator may suppress an exact external source tuple; provider synchronization updates `sourcePresent` but cannot reactivate a suppressed row. Unsuppressing makes the row active only when the latest provider synchronization still requests it, otherwise it becomes revoked. This is source governance, not a general role/scope deny rule. Effective role IDs are deduplicated after filtering assignments.

Guest never has assignment rows. It is injected from the active brand configuration. Linked-account operations canonicalize to the active primary user before reading or mutating assignments.

Account linking remains a `UsersService` operation gated by `user.account-link.manage`, but it must obtain recent, server-verified proof for both identities and preview the merged authority across every affected brand. The link, assignment canonicalization, legacy projection, quorum checks, and audits commit atomically. A brand administrator cannot link authority owned by another brand. A client-supplied user pair is not proof, and unlinking cannot guess how to redistribute already merged authority.

### 2.7 `AuthorizationAudit`

`AuthorizationAudit` is a typed, append-only security log distinct from `UserAudit`.

| Field           | Type        | Rules                                                              |
| --------------- | ----------- | ------------------------------------------------------------------ |
| `eventId`       | string      | Required unique UUID.                                              |
| `schemaVersion` | number      | Required event schema version.                                     |
| `eventType`     | string enum | Bounded event type such as `role.updated` or `assignment.revoked`. |
| `outcome`       | enum        | `succeeded`, `denied`, or `failed`.                                |
| `actorType`     | enum        | `user`, `system-process`, or `operator`.                           |
| `actorId`       | string      | Canonical user ID or bounded process/operator identifier.          |
| `authMethod`    | enum        | `session`, `legacy-bearer`, `internal`, or `operator`.             |
| `brandId`       | string?     | Target brand when applicable.                                      |
| `targetType`    | string      | Bounded resource type.                                             |
| `targetId`      | string?     | Target identifier.                                                 |
| `before`        | JSON?       | Redacted prior state.                                              |
| `after`         | JSON?       | Redacted resulting state.                                          |
| `reasonCode`    | string?     | Bounded machine reason.                                            |
| `reason`        | string?     | Sanitized administrator/operator reason.                           |
| `requestId`     | string?     | Correlation ID.                                                    |
| `batchId`       | string?     | Bulk operation correlation ID.                                     |
| `occurredAt`    | datetime    | Required server timestamp.                                         |

Indexes:

- unique `{ eventId: 1 }`;
- `{ occurredAt: -1 }`;
- `{ brandId: 1, occurredAt: -1 }`;
- `{ actorId: 1, occurredAt: -1 }`;
- `{ targetType: 1, targetId: 1, occurredAt: -1 }`;
- `{ eventType: 1, outcome: 1, occurredAt: -1 }`.

No normal service exports update or destroy operations for this model. Audit queries are paginated and scope-protected. Passwords, bearer values, CSRF values, raw claims, session IDs, and authorization headers are never written.

Audit retention is configurable independently of shadow evidence. Unset retention means retain indefinitely. The only permitted deletion is a bounded age-based retention job through `AuthorizationAuditService`; it cannot target actors/events selectively, respects any configured legal hold, and writes a current `audit.retention.completed` summary event. Audit rows are never edited.

### 2.8 `AuthorizationShadowMismatch`

Shadow comparison must be useful in multi-instance deployments without logging a row for every request. `AuthorizationShadowMismatch` stores bounded aggregates keyed by a safe fingerprint.

| Field               | Type      | Rules                                                                         |
| ------------------- | --------- | ----------------------------------------------------------------------------- |
| `fingerprint`       | string    | Unique hash of route ID, brand, legacy outcome, new outcome, and reason code. |
| `routeId`           | string    | Stable route/action identity.                                                 |
| `brandId`           | string?   | Brand identifier, not brand-supplied free text.                               |
| `legacyOutcome`     | enum      | `allow` or `deny`.                                                            |
| `scopeOutcome`      | enum      | `allow` or `deny`.                                                            |
| `reasonCode`        | string    | Bounded new-engine reason.                                                    |
| `principalCategory` | enum      | `anonymous`, `authenticated`, `system-admin`, or `legacy-bearer`.             |
| `count`             | number    | Aggregate occurrence count.                                                   |
| `firstSeenAt`       | datetime  | First observation.                                                            |
| `lastSeenAt`        | datetime  | Latest observation.                                                           |
| `sampleRequestId`   | string?   | One correlation identifier; no resource or actor data.                        |
| `resolvedAt`        | datetime? | Operator acknowledgement/remediation timestamp.                               |

Indexes:

- unique `{ fingerprint: 1 }`;
- `{ resolvedAt: 1, lastSeenAt: -1 }`;
- `{ brandId: 1, lastSeenAt: -1 }`.

Updates use atomic increment/upsert. A configured retention job deletes old resolved aggregates after the documented retention period. This model is operational evidence, not the append-only administrative audit.

### 2.9 Legacy structures during compatibility

The following remain for at least the first enforced release:

- `PathRule` and `PathRulesService`, read-only after migration except in explicit `legacy` rollback mode;
- `User.roles` and `Role.users` associations as compatibility projections;
- `Role.name` as the immutable compatibility key;
- `User.token` as the legacy bearer credential;
- legacy role-management AJAX routes as adapters over the new services.

All supported assignment mutations dual-write the legacy user-role association and the new `RoleAssignment` state inside the same required transaction. Scope configuration has no faithful `PathRule` projection: in `legacy` and `shadow`, the UI clearly marks scope edits as staged for the new engine. Direct database writes are not a supported compatibility contract and are reported as drift by rollout readiness checks.

## 3. Scope registry and extension contract

### 3.1 Scope-key grammar

Core keys use lowercase dot-separated business terms:

```text
^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$
```

Examples:

- `record.read`
- `record.update`
- `record.permission.manage`
- `vocabulary.manage`
- `authorization.role.manage`
- `system.brand.create`

Hook keys must begin with an approved package namespace, for example `figshare.publication.submit`. Wildcards such as `record.*` are invalid.
Scope keys are limited to 256 characters, and each persisted role/template scope set is limited to 500 entries, so persistence indexes, request payloads, responses, and keyset pagination cursors share one finite contract.

### 3.2 Code declaration

Core definitions live in `packages/redbox-core/src/authorization/core-scopes.ts`. Hooks opt in through a synchronous loader export:

```ts
export interface AuthorizationScopeDefinition {
  key: ScopeKey;
  label: string;
  description: string;
  risk: 'read' | 'write' | 'admin' | 'system';
  deprecated?: boolean;
  replacementKey?: ScopeKey;
}

export function registerRedboxAuthorizationScopes(): readonly AuthorizationScopeDefinition[];
```

Hook metadata identifies the owning package. The loader merges definitions before route-policy validation. Duplicate keys, invalid namespace ownership, invalid replacements, and conflicting metadata fail validation. Registration is synchronous and has no datastore or network side effects.

### 3.3 Initial core capability families

The route inventory in implementation phase 0 finalizes the exact catalog. It must use business capabilities rather than mechanical controller names. The expected families are:

| Family                 | Representative scopes                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal                 | `portal.home.read`, `portal.profile.read`                                                                                                                                                                                              |
| Records                | `record.create`, `record.read`, `record.update`, `record.delete`, `record.restore`, `record.destroy`, `record.audit.read`, `record.permission.manage`, `record.read.all`, `record.update.all`                                          |
| Attachments            | `attachment.read`, `attachment.manage`                                                                                                                                                                                                 |
| Search and dashboards  | `search.execute`, `dashboard.read`, `dashboard.configure`                                                                                                                                                                              |
| Workspaces             | `workspace.read`, `workspace.manage`                                                                                                                                                                                                   |
| Vocabulary             | `vocabulary.read`, `vocabulary.manage`                                                                                                                                                                                                 |
| Forms and record types | `form.read`, `form.manage`, `record-type.read`, `record-type.manage`                                                                                                                                                                   |
| Reports and export     | `report.run`, `report.manage`, `export.run`                                                                                                                                                                                            |
| Harvesting             | `harvest.read`, `harvest.manage`                                                                                                                                                                                                       |
| Integrations           | `integration.audit.read` plus hook-owned integration scopes                                                                                                                                                                            |
| Portal configuration   | `branding.manage`, `translation.manage`, `app-config.manage`, `navigation.manage`, `named-query.manage`                                                                                                                                |
| Users                  | `user.read`, `user.manage`, `user.account-link.manage`, `user.token.manage`                                                                                                                                                            |
| Authorization          | `authorization.self.read`, `authorization.scope.read`, `authorization.role.read`, `authorization.role.manage`, `authorization.assignment.read`, `authorization.assignment.manage`, `authorization.audit.read`, `authorization.explain` |
| System                 | `system.authorization.manage`, `system.brand.read`, and, if delivered, `system.brand.create`                                                                                                                                           |

The broad record scopes are resource-gate bypasses, not substitutes for base action scopes. For example, reading a record still requires `record.read`; `record.read.all` only satisfies the record ACL part of the decision within an authorized brand.

### 3.4 Catalog reconciliation

At startup the registry:

1. merges core and hook definitions;
2. validates definitions and every declared route scope;
3. calculates a deterministic registry generation hash;
4. upserts seen definitions into `AuthorizationScope`;
5. records startup validation evidence.

An instance does not automatically orphan every unseen persisted hook scope because that is unsafe during rolling deployments. An operator readiness/reconciliation command, run after all instances use the new release, marks genuinely absent definitions `orphaned`. Orphaned or runtime-absent scopes never grant access, but remain visible for impact analysis and cleanup.

## 4. Services layer (business logic)

### 4.1 Pure authorization module

`packages/redbox-core/src/authorization/` contains framework-light code that can be unit tested without Sails globals:

- `types.ts`: branded keys, contexts, results, and reason codes;
- `core-scopes.ts`: core scope definitions;
- `scope-registry.ts`: merge and validation logic;
- `role-effective-scopes.ts`: template plus override calculation;
- `decision.ts`: pure action/resource decision composition;
- `route-authorization.ts`: metadata validation helpers;
- `shadow-fingerprint.ts`: bounded discrepancy fingerprinting;
- `errors.ts`: typed authorization/domain errors.

The pure decision contract is:

```ts
interface AuthorizationDecision {
  allowed: boolean;
  reasonCode:
    | 'allowed'
    | 'principal-inactive'
    | 'brand-not-found'
    | 'brand-not-authorized'
    | 'scope-missing'
    | 'scope-orphaned'
    | 'token-scope-ceiling'
    | 'resource-not-found'
    | 'resource-brand-mismatch'
    | 'record-acl-denied';
  requiredScope?: ScopeKey;
  brandId?: string;
}
```

Detailed explanations are returned only to callers with `authorization.explain`. Normal denied responses expose stable problem codes, not role topology or cross-brand existence.

### 4.2 `AuthorizationService`

`packages/redbox-core/src/services/AuthorizationService.ts` is the single runtime authority. Its exported operations include:

- `resolveRequestContext(req)`;
- `resolveUserContext(userId, brandId, authMethod)`;
- `createSystemProcessContext(operationId, brandId, allowedScopes)`;
- `getEffectiveRoles(context)`;
- `getEffectiveScopes(context)`;
- `hasScope(context, scopeKey)`;
- `authorizeAction(context, scopeKey)`;
- `authorizeBrandEntity(context, scopeKey, entityBrandId)`;
- `authorizeRecord(context, scopeKey, record, mode)`;
- `explainDecision(actorContext, subjectId, brandId, scopeKey, resource?)`.

Resolution behavior:

- Canonicalize linked users to the active primary account.
- Reject disabled effective accounts.
- Resolve active, unexpired assignments for the canonical user.
- Include system-role assignments for every brand context.
- Include only role assignments whose role is active and whose role brand matches the active brand.
- Add the active Guest role for the brand without creating an assignment.
- Deduplicate roles and scopes.
- Ignore missing/orphaned/deprecated-without-runtime definitions.
- Apply any token scope ceiling last.
- Attach the immutable context to `req.authorization`; never accept it from request input.

Only request-local memoization is allowed. Mutable role/assignment authorization state is not cached across requests in phase 1.

### 4.3 `RoleAdministrationService`

`packages/redbox-core/src/services/RoleAdministrationService.ts` owns all supported mutations:

- create/update/inactivate a brand role and hard-delete only an unprotected role with no assignment row (including historical rows) and no workflow/config/record ACL or other dependency;
- preview and apply effective scope changes;
- create a role from a template;
- clone a same-brand role into a new unprotected role with a new immutable key and explicit copied effective scopes;
- preview and apply a template revision upgrade;
- preview and apply a bounded cross-brand bulk template upgrade for explicitly selected roles;
- publish a template revision for system administrators;
- assign, revoke, reactivate, expire, suppress, and unsuppress sourced assignments;
- replace assignments for one external source after login;
- preview and apply bulk assignment imports;
- protect Guest, brand-admin, system-admin, final-brand-admin, and final-system-admin invariants;
- maintain the legacy user-role projection during compatibility;
- emit a typed audit event in the mutation transaction.

Every write accepts:

- an authoritative actor context;
- an explicit brand or system context;
- `expectedVersion` for mutable existing resources;
- an optional sanitized reason;
- request/batch correlation metadata.

Every write uses a required datastore transaction. `runWithOptionalTransaction` is not valid for these operations. A new `runWithRequiredTransaction` utility must fail closed when the adapter cannot guarantee atomicity. Rollout readiness fails until the deployment datastore supports the transaction contract.

Optimistic updates use a compare-and-set predicate on `version`; no matching row yields `409 authorization.version-conflict`. The audit insert and all primary/projection writes share the same leased connection.

Denied administrative attempts have no primary mutation with which to share a transaction. They are written as independent denied audit events with a bounded security-log fallback. An audit-storage failure never converts a denial into an allow. Successful mutations remain contingent on their audit insert succeeding in the same transaction.

Delegation is also bounded. A brand administrator may add a scope to a role or assign a role only when the resulting effective scope set is a subset of the actor's effective scopes in that brand. `system.authorization.manage` is the explicit, high-risk meta-capability that lets a system administrator adopt a newly deployed registered scope into the protected system role/template and then delegate it. Adoption is previewed, confirmed, versioned, and audited; registration alone never grants the scope, and the meta-capability does not let the actor perform the scope's business action before adoption.

### 4.4 Protected-role behavior

#### Guest

- One active Guest role per brand.
- Implicit for anonymous and authenticated principals.
- Cannot be manually assigned, inactivated, or converted to another protected kind.
- Must retain `authorization.self.read` so the safe effective-principal projection remains available to anonymous and authenticated UI clients.
- Its effective scopes are configurable with an impact preview.
- Validation rejects administrative, write, token-management, and system-risk scopes unless an explicit code-level Guest allowlist is extended and reviewed.

#### Brand administrator

- A normal brand role with protected identity and explicit scopes.
- Can be assigned in any number of brands independently.
- Cannot assign system roles or publish global templates.
- Must retain the protected administration floor: `authorization.scope.read`, `authorization.role.read`, `authorization.role.manage`, `authorization.assignment.read`, and `authorization.assignment.manage`. Other business scopes remain configurable.
- A brand cannot be left without an active, unexpired, unsuppressed brand administrator. Existing brands that violate this invariant block readiness and require an explicit system-administrator repair; bootstrap does not silently elevate an arbitrary user.

#### System administrator

- One global system role, normally keyed `system-admin`.
- The bootstrap parent administrator receives a protected assignment during migration/bootstrap.
- Its explicit brand-level scopes apply in every brand; its `system.*` scopes apply only to system operations.
- Must retain the brand-administration floor plus `system.authorization.manage`; this is a protected minimum, not a wildcard over current or future scopes.
- Multiple users may hold it.
- Revocation, suppression, expiry, disabling, account linking, or role inactivation that would leave zero effective system administrators is rejected.
- `enforce` readiness requires at least two active, unexpired, unsuppressed system administrators so the deployment is not operating at the minimum recoverable quorum.
- Recovery is an operator-only command, never an unauthenticated or secret URL.

The optional `system.brand.create` scope is delivered only if the existing brand-creation service can be safely routed through the same authorization boundary without expanding phase-1 scope. Its absence does not block the authorization release.

### 4.5 Onboarding and claim hooks

The current `RolesService.getNestedRoles()` helper is not part of the target model. It currently implements a fixed `Admin -> Maintainer -> Researcher -> Guest` list and is called during AAF/OIDC onboarding. It is replaced by one configured explicit default role plus implicit Guest.

Per-brand authentication configuration supports:

```ts
interface DefaultRoleAssignmentConfig {
  roleKey?: string; // defaults to `Researcher` compatibility key
  sourceKey?: string; // provider-specific stable source
}
```

On first onboarding for a brand/provider, the onboarding flow calls `RoleAdministrationService` rather than mutating `User.roles`. A retained revoked onboarding row prevents a later login from treating the user as new, so changing the configured default affects only genuinely future onboardings. Existing claims hooks may call `replaceExternalAssignments()` with a provider/source key. The service validates brand, role, protected-role restrictions, canonical user, provenance, local suppression, and audit. No group-mapping UI is included.

### 4.6 Record access adapter

`RecordsService.hasViewAccess()` and `hasEditAccess()` remain the authoritative record ACL predicates during phase 1, with these changes:

- callers must first pass `record.read` or `record.update` through `AuthorizationService`;
- roles compare by immutable `role.key ?? role.name`;
- `editRoles` continues to imply view access;
- direct `authorization.view` and `authorization.edit` usernames remain supported;
- `record.read.all` and `record.update.all` are explicit resource-gate bypasses within the active brand;
- system administrator status alone does not silently bypass record ACLs; the system role receives the explicit broad scopes if that is the intended default;
- all fetches and mutations resolve the record through a brand-constrained service lookup before applying ACLs.

Search queries, Solr filters, exports, related-record visitors, attachment access, background actions, and webservice controllers must use the same effective immutable role keys. A matrix test ensures direct checks and search filtering agree.

### 4.7 Brand-owned entity boundary

Scopes answer “may this actor perform this type of operation?” Services answer “does this object belong to the actor's active brand?”

Brand-aware services, beginning with records, vocabularies, forms, record types, reports, named queries, dashboard configuration, and integration configuration, expose methods that require `brandId` or `AuthorizationContext`. An ID-only lookup must not be used by a controller for a brand-owned entity.

Create/update payloads cannot select a different brand. The service supplies or preserves the authoritative brand. Cross-brand identifiers are indistinguishable from missing identifiers to ordinary callers.

### 4.8 Internal jobs, hooks, and WebSockets

- User-triggered jobs persist actor ID, target brand, and operation ID, then re-resolve authority when execution begins.
- Trusted recurring jobs use a named `system-process` context created by a non-request factory with explicit brand and allowed scopes.
- Request parameters cannot choose an internal process identity or its scopes.
- Hooks receive/use `AuthorizationContext` and cannot rely on ambient global brand state.
- WebSocket handshakes resolve a context, but every privileged event revalidates active user, assignment expiry, and required scope. Disconnect is not required for revocation to take effect.

## 5. Routes, policies, and request lifecycle

### 5.1 Explicit route metadata

Every emitted `ApiRouteDefinition` and `RouteTargetObject` has a required
authorization declaration:

```ts
type RouteAuthorization =
  | { kind: 'scope'; scope: ScopeKey }
  | { kind: 'public'; reason: string }
  | { kind: 'pre-auth'; reason: string };
```

- `scope` covers both UI and API actions. Guest may satisfy it.
- `public` is for content intentionally outside authorization, such as static health or public metadata.
- `pre-auth` is for login initiation, callbacks, logout, CSRF bootstrap, and other narrowly reviewed authentication infrastructure.
- There is no implicit “no rule means allow” in `enforce` mode.

Authorization resolution first uses the explicit declaration and stable route ID
retained on the matched Sails target (`req.options`, then `req.route`). When the
framework does not expose that target metadata, the resolver uses the central
merged core-and-hook contract route map and finally the explicitly classified
`sails.config.routes` map. It does not derive authorization from controller or
action names, URL text, legacy roles, or a missing `PathRule`. An unresolved or
ambiguous route has no permission grant: resource gates fail closed, and
`enforce` denies the request even if startup validation was bypassed.

Core source routes may supply the declaration inline or obtain it from the
reviewed action/pattern inventory in `legacy-route-scope-map.ts`. This is a
route-table construction mechanism, not a runtime inference rule:
`apiRoute()` and `attachRouteAuthorizations()` resolve and normalize the
metadata while building their route tables and throw when no mapping exists.
Hook API routes cannot use the core compatibility map; they must declare a
hook-owned or core scope present in the merged registry.

The contract route factory emits `x-redbox-scope` in OpenAPI for scoped actions
and no longer derives `x-redbox-roles` from path rules after the compatibility
window. Built UI route targets carry the same metadata from
`routes.config.ts`.

### 5.2 Policy chain

The target default request flow is:

```text
brand/portal resolution
  -> authentication resolution (session or legacy bearer)
  -> explicit invalid-credential rejection
  -> immutable AuthorizationContext construction
  -> route-scope decision in legacy/shadow/enforce mode
  -> contract request validation
  -> controller
  -> service-level brand/entity/record gate
```

`authorizeRequest` replaces `checkAuth` in the default policy chain while delegating according to rollout mode:

| Mode      | Enforced result                                   | Additional behavior                                                                       |
| --------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `legacy`  | `PathRulesService`                                | Validate declarations and dual-write new data; emit configuration warnings.               |
| `shadow`  | `PathRulesService` except approved security fixes | Evaluate both engines and aggregate differences.                                          |
| `enforce` | Scope engine                                      | Optionally evaluate legacy for rollback evidence; never let it override the scope result. |

For compatibility, the legacy evaluator treats an effective protected system-administrator assignment as the active brand's legacy Admin role while evaluating path rules. It does not attempt to translate arbitrary custom scopes back into path rules. Consequently, new custom-role scope effects are staged and observable but not authoritative until `enforce`; the UI and readiness report must say so explicitly.

`isWebServiceAuthenticated` is split or revised so “no Authorization header” and “invalid Authorization header” are distinguishable. Passport bearer errors and `user === false` for a supplied credential produce a typed `401` instead of silently continuing.

Controllers retain resource-gate checks. A policy is not allowed to load an arbitrary resource solely from an untrusted ID without the service's brand constraint.

### 5.3 Response contract

Authorization APIs use `application/problem+json` with stable types/codes.

| Status | Meaning                                                                                 |
| ------ | --------------------------------------------------------------------------------------- |
| `400`  | Invalid key, invalid scope set, malformed filter, unsupported protected-role operation. |
| `401`  | Missing required authentication or invalid/disabled bearer/session principal.           |
| `403`  | Active principal lacks the required scope or in-brand resource permission.              |
| `404`  | Brand/role/entity absent in the authorized context, including cross-brand object IDs.   |
| `409`  | Version conflict, stale impact preview, duplicate key, or last-system-admin invariant.  |
| `410`  | Optional use for a previously issued but now invalid preview token.                     |
| `422`  | Structurally valid bulk import with row-level semantic errors.                          |
| `503`  | Required transactional guarantee is unavailable.                                        |

Normal deny responses include a correlation ID and bounded code. They do not list which roles/scopes would have granted access. The explain endpoint provides that detail only to authorized administrators.

### 5.4 Contract API surface

All routes are under `/:branding/:portal/api/authorization` unless noted.

#### Effective principal

| Method/path | Scope                     | Purpose                                                                                                                                                                |
| ----------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me`   | `authorization.self.read` | Return current brand, rollout mode, principal status, role summaries, and effective scope keys for server/UI projection. The scope is in the protected Guest template. |

The response never includes assignment provenance the caller is not allowed to inspect.

#### Scope catalog and templates

| Method/path                               | Scope                         | Purpose                                                           |
| ----------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `GET /scopes`                             | `authorization.scope.read`    | Filtered, paginated scope catalog with orphan/deprecation status. |
| `GET /templates`                          | `authorization.role.read`     | List templates and available revisions.                           |
| `GET /templates/:key/revisions/:revision` | `authorization.role.read`     | Read an immutable revision.                                       |
| `POST /templates/:key/revisions`          | `system.authorization.manage` | Publish a global revision.                                        |

#### Roles

| Method/path                                 | Scope                         | Purpose                                                                                         |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /roles`                                | `authorization.role.read`     | List roles for the active brand.                                                                |
| `POST /roles`                               | `authorization.role.manage`   | Create a custom, template-based, or same-brand cloned role with a new immutable key.            |
| `GET /roles/:key`                           | `authorization.role.read`     | Read role, base revision, overrides, effective scopes, and version.                             |
| `PATCH /roles/:key`                         | `authorization.role.manage`   | Change label/description with `expectedVersion`.                                                |
| `POST /roles/:key/scope-preview`            | `authorization.role.manage`   | Preview desired effective scope set and affected assignments.                                   |
| `PUT /roles/:key/scopes`                    | `authorization.role.manage`   | Apply desired set with version and confirmation token.                                          |
| `POST /roles/:key/scope-adoption-preview`   | `system.authorization.manage` | Preview adoption of one deployed scope into the protected system-administrator role.            |
| `POST /roles/:key/scope-adoption`           | `system.authorization.manage` | Apply the unchanged scope-adoption preview with version and confirmation token.                 |
| `POST /roles/:key/template-upgrade-preview` | `authorization.role.manage`   | Preview three-way upgrade.                                                                      |
| `POST /roles/:key/template-upgrade`         | `authorization.role.manage`   | Apply pinned revision upgrade.                                                                  |
| `POST /template-upgrades/bulk-preview`      | `system.authorization.manage` | Preview one target revision across explicitly selected brand roles.                             |
| `POST /template-upgrades/bulk-apply`        | `system.authorization.manage` | Apply an unchanged bounded preview with one role audit per change plus batch summary.           |
| `POST /roles/:key/inactivation-preview`     | `authorization.role.manage`   | Preview affected users/records/config references.                                               |
| `POST /roles/:key/inactivate`               | `authorization.role.manage`   | Inactivate an eligible role after confirmation while preserving references/history.             |
| `DELETE /roles/:key`                        | `authorization.role.manage`   | Hard-delete only a never-used, unprotected, dependency-free role with version and confirmation. |

#### Assignments

| Method/path                                  | Scope                             | Purpose                                                                                                                          |
| -------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /assignments`                           | `authorization.assignment.read`   | Paginated brand assignments filtered by user, role, source, status, or expiry.                                                   |
| `PUT /assignments/:roleKey/users/:userId`    | `authorization.assignment.manage` | Idempotently grant/reactivate a manual assignment.                                                                               |
| `DELETE /assignments/:roleKey/users/:userId` | `authorization.assignment.manage` | Revoke only the manual assignment source.                                                                                        |
| `POST /assignments/:assignmentId/suppress`   | `authorization.assignment.manage` | Locally suppress one external source tuple so claim synchronization cannot reactivate it.                                        |
| `POST /assignments/:assignmentId/unsuppress` | `authorization.assignment.manage` | Remove local suppression; activate only if the provider still requests the assignment.                                           |
| `POST /assignments/bulk-preview`             | `authorization.assignment.manage` | Validate CSV/JSON rows and return bounded impact/error summary.                                                                  |
| `POST /assignments/bulk-apply`               | `authorization.assignment.manage` | Apply exactly a valid preview in one bounded batch transaction with one audit event per changed assignment plus a batch summary. |

#### Audit, explain, and rollout

| Method/path              | Scope                         | Purpose                                                                                                                                                                                |
| ------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /audit`             | `authorization.audit.read`    | Paginated, filterable authorization audit.                                                                                                                                             |
| `POST /explain`          | `authorization.explain`       | Explain a hypothetical/read-only decision for a subject and brand.                                                                                                                     |
| `GET /rollout/readiness` | `system.authorization.manage` | Registry, route coverage, migration, drift, mismatch, and transaction readiness.                                                                                                       |
| `GET /export`            | `system.authorization.manage` | Export versioned role/template/assignment configuration without secrets; users and system-administrator assignments are excluded unless explicitly requested and separately confirmed. |
| `POST /import-preview`   | `system.authorization.manage` | Validate a versioned configuration import.                                                                                                                                             |
| `POST /import-apply`     | `system.authorization.manage` | Apply the confirmed import transactionally.                                                                                                                                            |

Lists use cursor pagination and server-side filtering. Bulk/import endpoints enforce documented row and payload-size limits. Export order is deterministic for review and source control.

### 5.5 Conditional CSRF for shared browser/API endpoints

The Angular application consumes the contract APIs rather than a second privileged AJAX implementation. Unsafe authorization API requests authenticated by a browser session must present the existing CSRF token. Bearer-authenticated non-browser clients do not need a CSRF token.

Because the current `apiRoute()` helper sets `csrf: false`, authorization mutations add a dedicated `protectSessionMutation` policy that:

- requires a valid CSRF header when authentication came from a session;
- does not require CSRF for a valid bearer credential;
- rejects ambiguous or mixed invalid credentials;
- runs before the controller mutation.

This behavior is contract-tested. It must not be implemented by trusting a caller-supplied “API client” header.

### 5.6 Compatibility AJAX routes

For at least one enforced release:

- `GET /admin/roles/get` adapts new role responses to the legacy shape;
- `POST /admin/roles/user` resolves role names/keys in the active brand and calls the assignment service;
- existing user create/update flows call the assignment service instead of `UsersService.updateUserRoles()` directly;
- supported legacy responses and status codes are documented with deprecation headers;
- the routes cannot assign Guest, system roles, cross-brand roles, or arbitrary IDs.

The compatibility routes do not preserve direct database association mutation as a supported API.

## 6. Angular administration application

The existing embedded `manage-roles` Angular project remains mounted by `views/default/default/admin/roles.ejs`. It is expanded in place and does not add Angular Router.

### 6.1 Page structure

The page has four top-level tabs controlled by component state and query parameters for reloadability:

1. **Roles** — create, clone, inspect, edit, preview scope changes, compare template revision, inactivate referenced roles, and delete eligible unused roles.
2. **Assignments** — find users, view assignments/provenance/expiry/source presence, assign/revoke roles, and suppress/unsuppress external grants. A bulk preview/apply panel is included only if the remaining phase-1 UI decision approves it; the bounded contract API exists regardless.
3. **Scope Catalog** — browse/filter definitions, risk, source package, status, and role usage; read-only.
4. **Audit** — filter and inspect redacted authorization events.

System administrators see template revision, selected-role bulk-upgrade, and rollout/readiness controls inside the relevant tab. Brand administrators do not see unavailable global actions.

### 6.2 Component and service seams

Expected files under `angular/projects/researchdatabox/manage-roles/src/app/`:

- `manage-roles.component.*`: shell, tab state, active-brand summary;
- `authorization-admin.service.ts`: typed API client and problem mapping;
- `authorization-admin.models.ts`: request/response interfaces;
- `roles/role-list.component.*`;
- `roles/role-editor.component.*`;
- `roles/scope-selector.component.*`;
- `roles/impact-preview.component.*`;
- `assignments/assignment-list.component.*`;
- `assignments/assignment-editor.component.*`;
- `assignments/bulk-assignment.component.*` if the phase-1 bulk UI is approved;
- `scopes/scope-catalog.component.*`;
- `audit/authorization-audit.component.*`.

A shared `AuthorizationProjectionService` in `portal-ng-common` calls `/api/authorization/me` and exposes `hasScope(scopeKey)` for Angular affordances elsewhere. It is presentation support only; server denial remains authoritative.

### 6.3 UI state and safety

- Role editors retain the fetched `version` and send it on every mutation.
- A `409` preserves unsaved input and offers reload/compare, never blind overwrite.
- Scope selection groups definitions by namespace and risk and clearly distinguishes template base, additions, and removals.
- Orphaned/deprecated scopes cannot be newly selected and are visibly flagged on existing roles.
- Protected-role constraints are displayed before submission and revalidated by the server.
- Scope and assignment editors show delegation-ceiling failures before submission while retaining server revalidation.
- Destructive or broadening operations show server-computed impact, require explicit confirmation, and apply with the preview token.
- If the bulk UI is approved, it first renders valid rows, invalid rows, no-ops, grants, revocations, and protected-role failures. Apply is unavailable while any fatal validation error remains.
- The UI never sends an entire user or role object as authority; it sends identifiers, desired state, expected version, and confirmation token.
- Accessibility includes keyboard-operable tabs, proper table headings, form labels, status announcements, focus restoration after modals, and non-color-only risk/status signals.

## 7. Views and navigation

### 7.1 EJS view

`views/default/default/admin/roles.ejs` remains a thin mount point and continues to use the existing admin layout, CSP nonce, hashed Angular assets, and brand/portal base path. No authorization decision is embedded in EJS beyond using server-resolved navigation and page access.

### 7.2 Navigation configuration

`MenuItem`, `HomePanelItem`, `AdminSidebarItem`, and `AdminSidebarSection` gain:

```ts
requiredScope?: ScopeKey;
```

Visibility resolution calls `AuthorizationService.hasScope()` against the request context. Configuration validation rejects unknown scope keys.

`requiredRoles` remains readable during the compatibility window:

- `legacy`: role behavior is unchanged;
- `shadow`: both visibility results are evaluated and discrepancies are reported;
- `enforce`: `requiredScope` is authoritative; an item with only `requiredRoles` is handled by the documented compatibility mapping and emits a deprecation warning;
- newly saved configuration writes `requiredScope`, not `requiredRoles`.

Default navigation is migrated to the same scopes used by destination routes. Hiding a link is convenience only; direct route access runs the authoritative policy.

## 8. Bootstrap, migrations, and compatibility

### 8.1 Startup order

Authorization initialization is inserted after brands/users are available and before request readiness:

1. load core and hook scope declarations;
2. validate merged scope registry and route metadata;
3. reconcile the persisted scope projection;
4. ensure templates and immutable revisions exist idempotently;
5. migrate/ensure brand role metadata and protected Guest roles;
6. ensure the protected system role and bootstrap administrator assignment;
7. validate transaction capability and rollout mode;
8. emit a bounded startup readiness audit/log event.

The migration runner remains the mechanism for one-time data transformations. Bootstrap only performs idempotent declaration reconciliation and invariant checks.

### 8.2 Data migration

The migration is resumable and idempotent:

1. Extend each existing role with `key = name`, `identityKey = brand:<brandingId>:<key>`, `displayName = name`, `contextType = brand`, `status = active`, and `version = 1`.
2. Attach known default roles to matching initial template revisions without changing their existing key.
3. Mark the existing Guest role in each brand protected; create one only when absent.
4. Create the protected global system-administrator role and assign it to the canonical bootstrap parent administrator.
5. Convert each existing user-role association except Guest into a `migration` assignment.
6. Remove no legacy associations. Deduplicate effective assignments by source tuple.
7. Seed route-to-scope and default-template mappings from a committed, reviewed fixture derived from current `auth.rules`.
8. Leave record ACL and Solr role strings unchanged because role keys preserve existing names.
9. Generate a drift/readiness report: missing brand, duplicate key, unknown role ACL reference, unmatched path rule, unsupported route, missing bootstrap administrator, and legacy/new assignment mismatch.

The migration does not infer inheritance. Existing multiple role associations remain multiple additive assignments, while explicit Guest associations become redundant because Guest is implicit.

### 8.3 Compatibility releases

Recommended sequence:

| Release      | Default mode                             | Compatibility                                                                                                                     |
| ------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| N            | `legacy`, then operator-enabled `shadow` | New schema/UI/API available; legacy path rules enforce; assignment writes maintain the legacy projection; legacy bearer retained. |
| N+1          | `enforce` after readiness                | New scopes enforce; legacy AJAX and role projections retained; emergency `legacy` rollback supported.                             |
| N+2 or later | `enforce`                                | Remove rollback only after integrator migration evidence; separately decide old route/model cleanup.                              |

The exact duration may be one or two releases based on integrator readiness. Deprecation headers and migration documentation identify the supported window.

### 8.4 Rollback

For the first enforced release, changing the deployment configuration back to `legacy` re-enables `PathRulesService` without reversing data migrations. New-service writes have maintained the legacy projection. Rollback does not restore known security defects; approved fixes remain enforced in every mode.

Emergency rollback restores legacy authorization semantics, not a synthesized path-rule equivalent for every new custom scope. Users relying only on new custom-role scopes may temporarily lose those capabilities while rollback is active. Readiness reports this exposure before enforce, and the operator runbook identifies any required temporary legacy-role assignments. The protected system administrator still maps to the active brand's legacy Admin behavior through the compatibility evaluator.

## 9. Legacy bearer-token boundary

Phase 1 keeps the current opaque UUID bearer contract and `User.token` storage so integrators can migrate deliberately.

- A valid legacy bearer resolves the same canonical user and effective roles/scopes as a browser session.
- Disabling the effective user or revoking/replacing `User.token` denies the next request.
- All route scopes, brand constraints, entity ownership checks, and record ACLs apply.
- A supplied invalid token is `401`; it never falls through to Guest.
- Documentation calls the value an opaque legacy bearer token, never a JWT or OAuth access token.
- Raw token values never appear in logs, audit events, exports, URLs, or shadow fingerprints.
- Token expiry, hashing, rotation overlap, token-specific scopes, and multiple credentials per user are part of the later authentication-hardening decision, not silently introduced here.

## 10. OAuth phase boundary

The later phase begins with an architecture spike comparing:

- an institution-provided external authorization server;
- an optionally co-deployed mature authorization server such as Keycloak;
- an in-application authorization server;
- a hardened non-OAuth opaque-token design if deploying an authorization server is operationally disproportionate.

The phase-1 authorization design is deliberately independent of that choice. A later token validator must produce the same `AuthorizationContext`, including principal, auth method, brand context, and optional token scope ceiling.

If OAuth is selected, the current preferred direction is:

- browser users continue to use server-side sessions initially;
- service clients use Client Credentials first;
- Client Credentials does not issue refresh tokens;
- user-delegated access, if a real use case emerges, uses Authorization Code with PKCE;
- refresh tokens require rotation, reuse detection, revocation, bounded lifetime, and secure storage;
- federated login and API delegation remain distinct concepts.

No phase-1 task may add a mandatory authorization-server deployment dependency.

## 11. Observability and operational controls

### 11.1 Metrics and logs

Use bounded labels only:

- authorization decisions by route ID, mode, outcome, reason code, and principal category;
- legacy/scope discrepancies by fingerprint and route ID;
- role/assignment mutations by event type and outcome;
- optimistic concurrency conflicts;
- invalid bearer attempts;
- orphaned-scope grant counts;
- transaction-unavailable failures;
- assignment expiry observations;
- last-system-admin guard rejections.
- authorization-context query count and bounded decision latency histograms by mode/principal category.
- audit-retention batches by bounded outcome, never by deleted actor/event identity.

Never label metrics with username, user ID, bearer value, arbitrary entity ID, raw path, or raw scope arrays.

### 11.2 Readiness report

The readiness API and operator command report:

- registry generation and duplicate/conflict status;
- route declaration coverage, including hooks and pre-auth/public reasons;
- unknown/orphaned scope references;
- migration completion and legacy projection drift;
- protected Guest, brand-admin, and system-admin invariants;
- at least two active, unexpired, unsuppressed system administrators before `enforce`;
- required transaction support;
- unresolved shadow mismatch counts by bounded category;
- route/navigation scope parity;
- known security-fix exceptions;
- representative authorization query-count and latency results against the agreed pre-enforce budget;
- current rollout mode and instance build version.

Readiness is evidence, not an automatic mode switch. Operators change the deployment-wide mode through configuration and normal deployment controls.

### 11.3 Operator recovery

Provide a non-HTTP operator command that:

- requires an exact existing canonical username/user ID and explicit confirmation;
- runs with an `operator` audit identity;
- uses a required transaction;
- restores one system-administrator assignment without changing passwords or tokens;
- refuses ambiguous, disabled, or linked-alias targets;
- prints no credential values;
- is idempotent and records the recovery reason.

## 12. Testing architecture

### 12.1 Pure unit tests

- scope grammar, namespace ownership, duplicate detection, deprecation replacement;
- template base plus add/remove override calculation;
- additive multiple-role union without hierarchy;
- Guest inclusion for anonymous and authenticated users;
- assignment source deduplication, revocation, and expiry boundaries;
- token ceiling intersection;
- decision reason codes;
- shadow fingerprint bounding and redaction;
- route metadata completeness and public/pre-auth reasons;
- role-key compatibility behavior.
- query-count and representative latency regression coverage for one-role, multi-role, system-admin, and large-assignment fixtures.

### 12.2 Service and policy tests

- required transaction success/failure and audit atomicity;
- optimistic concurrency conflicts and retry safety;
- protected-role, final-brand-admin, and final-system-admin invariants;
- canonical linked-account resolution;
- brand-scoped role and assignment queries;
- invalid bearer versus absent bearer behavior;
- legacy, shadow, and enforce policy semantics;
- session-only CSRF requirement for shared APIs;
- no process-local stale authorization cache;
- external claim source replacement;
- migration idempotency and drift detection.

### 12.3 Resource-access matrix

At minimum, exercise:

- anonymous Guest, authenticated Guest baseline, Researcher, Librarian, brand Admin, and system Admin;
- one role, multiple roles, roles in two brands, inactive role, expired assignment, and disabled account;
- direct-user view/edit ACL, role view/edit ACL, edit-implies-view, broad record scope, and no ACL;
- same-brand and cross-brand record/vocabulary/form/config identifiers;
- browser session, valid legacy bearer, invalid legacy bearer, internal job, and WebSocket event;
- UI route, matching API action, navigation visibility, and direct service call.

The same fixtures must prove that record list/search/export results and direct record fetch decisions agree.

### 12.4 Integration, API, and Angular tests

- Mocha integration tests for services, policies, migration, brand isolation, record ACL preservation, and compatibility adapters.
- Bruno tests for effective scopes, role CRUD, scope preview/apply, assignments, protected roles, audit, `401/403/404/409/422/503`, and legacy bearer behavior.
- Angular unit tests for each tab, version conflicts, impact confirmation, protected controls, problem rendering, and bulk validation when that optional UI is approved.
- Browser tests for keyboard tab use, a brand administrator workflow, a system administrator switching brands, immediate revocation, and hidden-navigation/direct-route denial parity.
- Startup/contract tests that fail when any merged route lacks an authorization declaration in enforce-ready builds.

# Consistency analysis

## Authorization versus authentication

The design makes authentication replaceable by translating every accepted credential into the same `AuthorizationContext`. This is why OAuth can be deferred without forcing a second authorization rewrite.

## Scopes versus record ACLs

Scopes gate operations; record ACLs gate individual records. Neither subsumes the other. Explicit `record.*.all` scopes are visible, auditable resource-gate bypasses, not hidden effects of an `Admin` label.

## Configurable labels versus legacy record data

Separating immutable `key` from mutable `displayName` permits role customization while preserving current ACL, config, hook, and Solr values. This is the lowest-risk compatible representation.

## Templates versus brand autonomy

Immutable global revisions provide upgradeable defaults. Pinned revisions and explicit add/remove overrides ensure a package deployment never silently broadens a brand role.

## Additive roles versus current onboarding

Runtime roles remain additive. The fixed `getNestedRoles()` sequence is onboarding implementation detail, not a role hierarchy contract. Replacing it with one configured default assignment plus implicit Guest removes that accidental coupling.

## UI/API parity

The embedded Angular app consumes the same contract services used by integrations, with conditional CSRF for session mutations. Navigation and button visibility reuse effective scopes but cannot authorize the underlying action.

## Atomicity versus adapter portability

The agreed audit and concurrency guarantees require real transactions. Silently falling back to non-transactional writes would violate the security model, so authorization mutations fail closed and rollout readiness exposes unsupported deployments.

The current Mocha, Bruno, OIDC, general integration, and Playwright Docker profiles start standalone MongoDB processes. Standalone MongoDB cannot satisfy this contract. Before transaction tests can be authoritative, those profiles must run a single-node replica set (or another topology with transaction support), wait for replica-set initialization rather than only `ping`, and expose the same connection topology to the portal. Production and operator documentation must make the replica-set/sharded-cluster requirement an enforce-mode prerequisite; merely detecting a MongoDB server is insufficient.

## Multi-instance correctness

There is no mutable cross-request authorization cache. Shadow evidence is durable and aggregated. Scope orphaning is an explicit post-rollout reconciliation action, avoiding false orphaning while different application versions coexist.

## Compatibility versus revocation

New assignments are authoritative in enforce mode and are projected to legacy associations for supported integrations. Unioning arbitrary legacy database writes into enforce decisions would make revocation unreliable, so direct DB mutation is detected as drift rather than accepted as authority.

## Deferred OAuth decision

The design records the likely flows and security expectations but introduces no auth-server dependency. Legacy bearer compatibility is a bounded bridge, and the next-phase spike can select an operational model using evidence from integrators and deployments.
