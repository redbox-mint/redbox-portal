# Authorization Route-Scope Inventory

This is the maintained Phase 0 compatibility baseline for the configurable
authorization model. It records the reviewed route sources, explicit
classification rules, legacy compatibility boundary, and regression-test
owners. The snapshot was reconciled against the implementation through
`219cff3cb` plus the final whole-spec remediation through Phase 9.

## Authoritative inventories

The row-level inventory is deliberately code-backed so it cannot drift from
runtime behavior:

- `packages/redbox-core/src/config/routes.config.ts` contains every configured
  core Sails route target, its stable route ID, and its explicit `scope`,
  `public`, or `pre-auth` declaration.
- `packages/redbox-core/src/api-routes/route-registry.ts` merges all core
  contract routes with synchronous hook route providers.
- `packages/redbox-core/src/authorization/legacy-route-scope-map.ts` is the
  reviewed compatibility mapping used while converting legacy route objects.
- `packages/redbox-core/test/authorization/route-authorization.test.ts` proves
  that the configured and contract inventories are completely classified and
  that stable route IDs are unique.
- `packages/redbox-core/test/unit/authorization-api-routes.test.ts` proves that
  runtime authorization routes and generated OpenAPI operations stay in
  lockstep.

At this snapshot there are 317 configured core routes: 160 contract routes and
157 configured-only UI, AJAX, authentication, or infrastructure routes. Every
row has a declaration: 299 scoped, 10 explicitly public, and 8 explicitly
pre-auth. There are no unclassified core rows. The 160 contract rows are not a
second runtime inventory; they are the contract source for matching entries in
the 317-row configured map.

Hook-provided routes cannot be enumerated correctly from a source-only checkout
because installed hooks are deployment-specific. At lift, synchronous hook
providers are merged into the central registry and subjected to the same
unique-route-ID, explicit-declaration, and registered-scope validation. An
invalid, ambiguous, or unclassified hook route fails readiness/startup rather
than acquiring an implicit permission.

## Resolution and deny baseline

Authorization resolution is deterministic:

1. Use explicit authorization and route ID retained on the matched Sails target.
2. If framework target metadata is absent, use the central merged contract map.
3. Finally, match the explicitly classified `sails.config.routes` map.
4. Treat unresolved or ambiguous metadata as no grant.

Controller/action names, URL text, role names, and missing `PathRule` entries
are not authority sources. Legacy mode continues to preserve the historical
no-rule behavior for compatibility. Enforce mode does not consult that result
when legacy evidence collection is disabled, and a missing declaration or
missing path rule cannot silently permit. These expectations are owned by
`AuthorizationRolloutService.test.ts` and
`request-resource-authorization.test.ts`.

The shipped compatibility baseline contains 78 `auth.rules` rows: 40 for
`Admin`, 20 for `Librarians`, 17 for `Researcher`, and one for `Guest`.
Forty-seven are broad `(/*)` patterns. Runtime OpenAPI compatibility metadata
continues to project matching roles from these rules as deprecated
`x-redbox-roles`; the explicit scope target remains authoritative in
`enforce`. Representative path-rule matching, multiple-role additive behavior,
and the historical no-match result are owned by `PathRulesService.test.ts` and
the legacy-compatibility fixtures. The reviewed central scope map deliberately
splits broad legacy patterns into action-level business capabilities.

## Scoped-route distribution

This compact projection is generated from the 317-row configured map. The
counts provide reviewable coverage without copying a second, drift-prone route
table into the wiki.

| Scope | Route targets |
| --- | ---: |
| `app-config.manage` | 9 |
| `attachment.manage` | 5 |
| `attachment.read` | 4 |
| `authorization.assignment.manage` | 7 |
| `authorization.assignment.read` | 1 |
| `authorization.audit.read` | 1 |
| `authorization.explain` | 1 |
| `authorization.role.manage` | 10 |
| `authorization.role.read` | 8 |
| `authorization.scope.read` | 6 |
| `authorization.self.read` | 1 |
| `branding.manage` | 15 |
| `dashboard.configure` | 10 |
| `dashboard.read` | 8 |
| `export.run` | 4 |
| `form.read` | 6 |
| `harvest.manage` | 2 |
| `harvest.read` | 4 |
| `integration.audit.read` | 3 |
| `named-query.manage` | 7 |
| `portal.home.read` | 4 |
| `portal.profile.read` | 3 |
| `record-type.read` | 4 |
| `record.audit.read` | 4 |
| `record.create` | 3 |
| `record.delete` | 2 |
| `record.destroy` | 2 |
| `record.permission.manage` | 10 |
| `record.read` | 14 |
| `record.restore` | 2 |
| `record.update` | 12 |
| `record.update.all` | 3 |
| `report.manage` | 12 |
| `report.run` | 7 |
| `search.execute` | 3 |
| `system.authorization.manage` | 9 |
| `translation.manage` | 12 |
| `user.account-link.manage` | 6 |
| `user.manage` | 9 |
| `user.read` | 8 |
| `user.token.manage` | 6 |
| `vocabulary.manage` | 32 |
| `vocabulary.read` | 11 |
| `workspace.manage` | 3 |
| `workspace.read` | 6 |

The remaining 18 declarations are the 10 explicit public and 8 explicit
pre-auth routes.

## Methodless compatibility routes

Sails accepts these 18 historical methodless patterns. They remain visibly
flagged by a `*` method in their stable route IDs and are explicitly scoped;
methodlessness never means public access.

| Pattern | Scope |
| --- | --- |
| `/:branding/:portal/home` | `portal.home.read` |
| `/:branding/:portal/researcher/home` | `portal.home.read` |
| `/:branding/:portal/record/view/:oid` | `record.read` |
| `/:branding/:portal/record/search` | `search.execute` |
| `/:branding/:portal/record/view-orig/:oid` | `record.read` |
| `/:branding/:portal/admin` | `authorization.role.read` |
| `/:branding/:portal/admin/translation` | `translation.manage` |
| `/:branding/:portal/admin/harvest-runs` | `harvest.read` |
| `/:branding/:portal/admin/roles` | `authorization.role.read` |
| `/:branding/:portal/admin/users` | `user.read` |
| `/:branding/:portal/user/profile` | `portal.profile.read` |
| `/:branding/:portal/availableServicesList` | `portal.home.read` |
| `/:branding/:portal/workspaces/list` | `workspace.read` |
| `/:branding/:portal/getAdvice` | `portal.home.read` |
| `/:branding/:portal/record/:oid/attach` | `attachment.manage` |
| `/:branding/:portal/record/:oid/attach/:attachId` | `attachment.manage` |
| `/:branding/:portal/companion/record/:oid/attach` | `attachment.manage` |
| `/:branding/:portal/companion/record/:oid/attach/:attachId` | `attachment.manage` |

## Phase 8 authorization contract slice

All paths below are relative to
`/:branding/:portal/api/authorization`. They are included here because this
slice is the supported administration boundary and a release-critical subset
of the full route inventory.

| Method/path | Action | Required scope |
| --- | --- | --- |
| `GET /me` | `getMe` | `authorization.self.read` |
| `GET /scopes` | `listScopes` | `authorization.scope.read` |
| `GET /templates` | `listTemplates` | `authorization.role.read` |
| `GET /templates/:key/revisions/:revision` | `getTemplateRevision` | `authorization.role.read` |
| `POST /templates/:key/revisions` | `publishTemplateRevision` | `system.authorization.manage` |
| `GET /roles` | `listRoles` | `authorization.role.read` |
| `POST /roles` | `createRole` | `authorization.role.manage` |
| `GET /roles/:key` | `getRole` | `authorization.role.read` |
| `PATCH /roles/:key` | `updateRole` | `authorization.role.manage` |
| `POST /roles/:key/scope-preview` | `previewRoleScopes` | `authorization.role.manage` |
| `PUT /roles/:key/scopes` | `applyRoleScopes` | `authorization.role.manage` |
| `POST /roles/:key/scope-adoption-preview` | `previewScopeAdoption` | `system.authorization.manage` |
| `POST /roles/:key/scope-adoption` | `applyScopeAdoption` | `system.authorization.manage` |
| `POST /roles/:key/template-upgrade-preview` | `previewRoleTemplateUpgrade` | `authorization.role.manage` |
| `POST /roles/:key/template-upgrade` | `applyRoleTemplateUpgrade` | `authorization.role.manage` |
| `POST /template-upgrades/bulk-preview` | `previewBulkTemplateUpgrade` | `system.authorization.manage` |
| `POST /template-upgrades/bulk-apply` | `applyBulkTemplateUpgrade` | `system.authorization.manage` |
| `POST /roles/:key/inactivation-preview` | `previewRoleInactivation` | `authorization.role.manage` |
| `POST /roles/:key/inactivate` | `inactivateRole` | `authorization.role.manage` |
| `DELETE /roles/:key` | `deleteRole` | `authorization.role.manage` |
| `GET /assignments` | `listAssignments` | `authorization.assignment.read` |
| `PUT /assignments/:roleKey/users/:userId` | `grantAssignment` | `authorization.assignment.manage` |
| `DELETE /assignments/:roleKey/users/:userId` | `revokeAssignment` | `authorization.assignment.manage` |
| `POST /assignments/:assignmentId/suppress` | `suppressAssignment` | `authorization.assignment.manage` |
| `POST /assignments/:assignmentId/unsuppress` | `unsuppressAssignment` | `authorization.assignment.manage` |
| `POST /assignments/bulk-preview` | `previewBulkAssignments` | `authorization.assignment.manage` |
| `POST /assignments/bulk-apply` | `applyBulkAssignments` | `authorization.assignment.manage` |
| `GET /audit` | `listAudit` | `authorization.audit.read` |
| `POST /explain` | `explainDecision` | `authorization.explain` |
| `GET /rollout/readiness` | `getReadiness` | `system.authorization.manage` |
| `GET /export` | `exportConfiguration` | `system.authorization.manage` |
| `POST /import-preview` | `previewImport` | `system.authorization.manage` |
| `POST /import-apply` | `applyImport` | `system.authorization.manage` |

## Compatibility and security fixtures

The baseline is split between compatibility expectations and named security
fixes:

- `test/fixtures/authorization-request.fixtures.ts` owns bounded principal,
  active-brand, and request-shape fixtures.
- `PathRulesService.test.ts` and `action-execution/legacy-compatibility.test.ts`
  own supported legacy evaluation behavior.
- `AuthorizationRolloutService.test.ts` owns the legacy/shadow/enforce decision
  matrix, including the explicit enforce-mode no-rule denial boundary.
- `route-authorization.test.ts` owns complete classification, hook validation,
  invalid-credential policy coverage, and generated authorization metadata.
- `AuthorizationPhase6.test.ts` and `AuthorizationPhase7.test.ts` own request
  policy and resource-gate integration coverage.
- `Authorization-Resource-Gate-Inventory.md` owns the brand/entity/record
  resource inventory and test targets.

Unsafe historical behavior is not a compatibility promise. Specifically,
invalid supplied bearer credentials, unclassified routes in enforce mode,
cross-brand ID lookup, and a missing legacy path rule as an enforce-mode grant
are recorded security differences.

## Reconciliation command

Run the package route tests and API validator whenever a route or scope changes:

```bash
npm --prefix packages/redbox-core test -- --grep "route authorization metadata|authorization contract API routes|request resource authorization extraction"
npm run validate:api-routes
```

Deployment readiness must additionally lift the actual installed hook set; a
static source snapshot cannot claim coverage for hooks that are not installed.
