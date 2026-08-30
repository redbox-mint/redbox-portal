# Authorization Contract API

The authorization contract API exposes the caller's effective authority and
the deployed scope/template catalog through runtime-validated, OpenAPI-derived
routes. It is the supported HTTP boundary for the configurable authorization
model; clients must not infer authority from legacy role names.

The currently delivered routes are under:

```text
/:branding/:portal/api/authorization
```

The surface includes the audit, explanation, rollout-readiness, and
configuration import/export operations required for deployment-wide
authorization administration. These operations use the same runtime schemas,
business-scope policies, Problem Details, and API-version envelope contract as
the role and assignment routes.

## Authentication and route scopes

Browser sessions and bearer credentials resolve the same immutable
`AuthorizationContext`. Each route also declares the business scope shown
below. The scope check does not replace the active-brand and resource checks
performed by services.

| Method and path                           | Required scope                | Result                                                                                       |
| ----------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /me`                                 | `authorization.self.read`     | Caller-safe effective principal projection. The protected Guest template retains this scope. |
| `GET /scopes`                             | `authorization.scope.read`    | Filtered, cursor-paginated deployed scope catalog.                                           |
| `GET /templates`                          | `authorization.role.read`     | Filtered, cursor-paginated global template catalog with immutable revisions.                 |
| `GET /templates/:key/revisions/:revision` | `authorization.role.read`     | One immutable template revision, or an opaque `404`.                                         |
| `POST /templates/:key/revisions`          | `system.authorization.manage` | Preview and then publish the next global template revision.                                  |
| `GET /roles`                              | `authorization.role.read`     | Filtered, cursor-paginated roles from the active brand.                                       |
| `POST /roles`                             | `authorization.role.manage`   | Create a custom, template-based, or same-brand cloned role.                                   |
| `GET /roles/:key`                         | `authorization.role.read`     | Read one active-brand role's base scopes, overrides, effective scopes, and version.           |
| `PATCH /roles/:key`                       | `authorization.role.manage`   | CAS-update the role label or description.                                                     |
| `POST /roles/:key/scope-preview`          | `authorization.role.manage`   | Preview a desired complete effective scope set.                                               |
| `PUT /roles/:key/scopes`                  | `authorization.role.manage`   | Apply an unchanged confirmed scope preview.                                                   |
| `POST /roles/:key/template-upgrade-preview` | `authorization.role.manage` | Preview a pinned template revision upgrade.                                                   |
| `POST /roles/:key/template-upgrade`       | `authorization.role.manage`   | Apply an unchanged confirmed template upgrade.                                                |
| `POST /template-upgrades/bulk-preview`    | `system.authorization.manage` | Preview one revision for at most 100 explicitly selected roles.                               |
| `POST /template-upgrades/bulk-apply`      | `system.authorization.manage` | Atomically apply an unchanged selected-role preview.                                          |
| `POST /roles/:key/inactivation-preview`   | `authorization.role.manage`   | Preview bounded assignment, record, and configuration impact.                                 |
| `POST /roles/:key/inactivate`             | `authorization.role.manage`   | Inactivate an eligible role while retaining assignments and history.                          |
| `DELETE /roles/:key`                      | `authorization.role.manage`   | Preview, then confirm, deletion of a never-used dependency-free role.                          |
| `GET /assignments`                        | `authorization.assignment.read` | Filtered, cursor-paginated assignments in the active authorization context.                 |
| `PUT /assignments/:roleKey/users/:userId` | `authorization.assignment.manage` | Idempotently grant or reactivate the documented manual source tuple.                       |
| `DELETE /assignments/:roleKey/users/:userId` | `authorization.assignment.manage` | Revoke only the documented manual source tuple with CAS.                                |
| `POST /assignments/:assignmentId/suppress` | `authorization.assignment.manage` | Locally suppress one exact external source tuple with CAS.                                |
| `POST /assignments/:assignmentId/unsuppress` | `authorization.assignment.manage` | Remove local suppression without inventing provider presence.                           |
| `POST /assignments/bulk-preview`          | `authorization.assignment.manage` | Validate and preview at most 100 manual assignment rows.                                  |
| `POST /assignments/bulk-apply`            | `authorization.assignment.manage` | Atomically apply an unchanged, confirmed assignment preview.                              |
| `GET /audit`                               | `authorization.audit.read`        | Filtered, cursor-paginated, redacted authorization events.                                |
| `POST /explain`                            | `authorization.explain`           | Read-only explanation of one subject, brand, scope, and optional resource decision.       |
| `GET /rollout/readiness`                   | `system.authorization.manage`     | Bounded deployment-wide readiness evidence; it never changes rollout mode.                |
| `GET /export`                              | `system.authorization.manage`     | Deterministic versioned configuration export with separately confirmed assignment modes.  |
| `POST /import-preview`                     | `system.authorization.manage`     | Strictly parse and preview a bounded configuration document.                              |
| `POST /import-apply`                       | `system.authorization.manage`     | Atomically apply the unchanged, confirmed configuration preview.                          |

Session-authenticated mutation requests must pass the existing ReDBox CSRF
token. Bearer-authenticated mutation requests do not use browser CSRF state.
All request bodies, path parameters, and query parameters are parsed by the
route's runtime schema before the controller runs.

## Effective principal projection

`GET /me` returns the active brand, rollout mode, principal category and auth
method, role summaries, and sorted effective scope keys. It deliberately does
not return a username, credentials, raw claims, or authorization resolution
evidence.

Role-assignment provenance is included only when the caller also has
`authorization.assignment.read`. Ordinary Guest and user clients therefore
receive role identities without assignment-source topology. Authorized
provenance readers also receive `assignmentCount` and `assignmentsTruncated`
alongside up to 100 assignment-evidence entries, so a truncated projection
cannot be mistaken for a complete source history.

The default API version (`1.0`) returns the projection as the response body.
API version `2.0`, selected using `X-ReDBox-Api-Version: 2.0`, uses the standard
`{ data, meta }` success envelope.

## Catalog pagination and filters

Both catalogs sort by immutable `key` ascending. `limit` defaults to `50` and
is bounded to `1..100`. When another page exists, `nextCursor` is the last key
in the returned page; pass it unchanged as `cursor` to continue. Scope keys and
cursors are bounded to 256 characters, namespace filters to 256 characters,
search terms to 128 characters, and every role/template scope set to 500
entries across HTTP, service, and persistence boundaries.

`GET /scopes` accepts:

- `cursor`, `limit`, and `search`;
- `namespace`;
- `risk`: `read`, `write`, `admin`, or `system`;
- `sourceType`: `core` or `hook`;
- `status`: `active`, `deprecated`, or `orphaned`.

Each scope includes source package/version, risk, status, optional replacement
key, and the persisted metadata version. The response also includes the
deployed registry generation.

`GET /templates` accepts `cursor`, `limit`, `search`, `protectedKind`, and
`status`. Each template includes its current version and its immutable
revision summaries in descending revision order. At most the latest 20 numeric
revision slots are included per template; `revisionsTruncated` tells clients
when older slots fall outside that window. Fetch a selected revision through
`GET /templates/:key/revisions/:revision` to obtain its complete scope set.

For example:

```bash
curl \
  -H "Authorization: Bearer $REDBOX_API_TOKEN" \
  "https://portal.example/default/rdmp/api/authorization/scopes?namespace=authorization&limit=25"
```

## Template publication handshake

Template publication is a server-authoritative preview/apply operation. The
client sends the desired complete scope set and current template version:

```json
{
  "expectedVersion": 3,
  "scopeKeys": ["authorization.self.read", "portal.home.read"],
  "notes": "Publish reviewed capability set"
}
```

Without `confirmationToken`, the server returns HTTP `200` with the current and
proposed revisions and template metadata, added/removed scope keys, warnings,
fatal errors, and a bound confirmation token. Repeat the unchanged command with
that token to apply. The token binds the normalized scope set, display name,
description, revision notes, reason, actor, target, and expected version. A
successful publication returns HTTP `201`, revalidates current scope
availability, advances the template version/revision transactionally, creates
the immutable revision, and writes the audit event on the same datastore
connection.

The server rejects a stale version, changed command, expired/mismatched token,
invalid/protected scope set, or caller without system authority. Clients must
never supply impact counts or effective scopes as authority.

Tokens are signed with `authorization.confirmationSecret`, or with
`redboxSession.secret` when no dedicated secret is configured. The selected
secret must be at least 32 characters. See the
[Configuration Guide](Configuration-Guide) for the deployment and rotation
contract.

## Role catalog and lifecycle

`GET /roles` is hard-scoped to the authenticated context's active brand. It
accepts `cursor`, `limit`, `search`, `protectedKind`, `status`, and
`templateKey`; its ordering and `1..100` page bounds match the other catalogs.
`GET /roles/:key` preserves exact grandfathered role keys and returns the
pinned base scope set, local add/remove overrides, current effective scopes,
status, and CAS version. Missing and cross-brand keys have the same opaque
`404` result. Request bodies cannot select a brand or submit authority fields
such as effective scopes or impact counts.

`POST /roles` accepts one strict creation shape: a custom role with optional
`scopeKeys`, a role pinned to `templateKey` and an optional revision, or a
same-brand `cloneRoleKey`. A clone copies only the effective scope set; it does
not copy assignments or protected identity. New keys use
`^[a-z][a-z0-9-]{0,63}$`. `PATCH /roles/:key` requires `expectedVersion` and
changes only fields present in the body; `description: null` explicitly clears
the description.

Scope changes, template upgrades, and inactivation use separate preview and
apply routes. A preview computes the proposed role and bounded impact on the
server. A brand-role apply requires the unchanged desired state, reason, actor,
active brand, target, expected version, and confirmation token. Template upgrades use
a three-way merge so explicit local additions/removals survive a new pinned
revision. The system-only bulk form accepts at most 100 unique role IDs with
their versions. Preview returns a bounded conflict code and status for each
stale, missing, or otherwise invalid selected role; any conflict is fatal and
prevents confirmation. Its explicit `system.authorization.manage` authority
permits a selection spanning brands; the service resolves only those IDs,
never expands the selection to a brand or template cohort, revalidates the
unchanged selection, changes it in one required transaction, and writes one
audit event per change plus a batch event. For a role outside the caller's
active brand, only authority carried by the caller's system roles contributes
to the delegation ceiling; Guest or brand-role scopes from the active brand
cannot be delegated into another brand.

Inactivation preserves all assignment and audit rows but removes the role from
subsequent effective authority. Protected roles cannot be inactivated.
Dependency inspection reads at most 1,000 rows per inventoried source and
100,000 values per stored/runtime configuration scan; an incomplete scan fails
closed and produces no token.

Deletion uses `DELETE /roles/:key` for both steps. Omit `confirmationToken` to
receive the server dependency preview, then repeat the unchanged body with the
token. The apply step rechecks version and every assignment, record, tombstone,
workflow, form, configuration, and runtime reference inside the transaction.
The preview reports authoritative assignment rows separately from legacy
`Role.users` compatibility associations; either kind of membership blocks hard
deletion rather than being silently detached.
Only an unprotected, never-used dependency-free role is removed; its safe prior
state remains in the append-only audit.

Every role mutation uses optimistic concurrency, a required datastore
transaction, and a success audit on the same connection. If the adapter cannot
provide that guarantee, the API returns `503` without falling back to a partial
write.

## Assignment catalog and mutations

`GET /assignments` is ordered by immutable assignment ID and accepts `cursor`,
`limit`, `userId`, `roleKey`, `source`, `status`, `sourcePresent`, and `expiry`.
The page size is bounded to `1..100`. `sourcePresent` is the literal query value
`true` or `false`; `expiry` is `expired`, `unexpired`, or `never`. Each item
contains its exact source tuple, state, version, optional expiry, and bounded
assignment/revocation/suppression provenance. Brand administrators see only
rows whose assignment and role both belong to the active brand. A caller with
`system.authorization.manage` may additionally see the protected global
system-role context; neither actor type can use this route to enumerate another
brand. Missing roles or inconsistent persisted ownership fail closed instead of
returning a partially trusted page.

The single-user `PUT` and `DELETE` routes always address `source: "manual"` and
`sourceKey: "manual"`; request bodies cannot select an external source or a
brand. `PUT` accepts an optional `expectedVersion`, reason, and offset ISO-8601
`expiresAt`. Expiry must be in the future. Repeating an already-active grant
with the same expiry is a successful no-op with `changed: false`; a revoked or
expired tuple is reactivated in place so its source history is retained.
`DELETE` requires `expectedVersion` and revokes only that manual tuple. Other
manual keys and external tuples continue to contribute authority.

Through this contract API, external tuples are changed only by the
assignment-ID suppression routes. Both require `expectedVersion` and reject
manual sources. Suppression retains
the provider's last `sourcePresent` value. Unsuppression becomes active only
when the provider still requests the tuple; otherwise the tuple becomes
revoked. Assignment-ID lookup validates the role and assignment against the
active brand or the explicitly authorized protected global system context, and
inaccessible IDs return the same opaque `404` as missing IDs.

Every grant/reactivation checks the role status, implicit-Guest prohibition,
target-user canonicalization, the caller's delegation ceiling, and protected
system-role authority. Removing effective protected administrator authority
rechecks brand/system quorum under a role lock. System-role writes require
`system.authorization.manage`; brand administrators receive an opaque `404`
for the global role. Successful changes and the legacy `User.roles` projection
are committed with the authoritative assignment and audit event in one
required transaction.

### Bulk preview and apply

Bulk bodies accept JSON rows directly, a JSON-encoded row string, or a CSV
string. String payloads are limited to 256 KiB and every form contains between
1 and 100 rows. CSV headers are selected from `action`, `principalId`,
`roleKey`, `sourceKey`, `expiresAt`, and `expectedVersion`; duplicate or unknown
headers are invalid, and `action`, `principalId`, and `roleKey` are required.
Every CSV record must have exactly one value per declared header. JSON row
objects reject unknown fields, and `expiresAt` is valid only for `grant` rows.
Rows are manual `grant` or `revoke` actions and duplicate canonical
user/role/source tuples in one batch are rejected.

Preview resolves canonical users and current assignment versions on the
server, validates expiry, delegation, brand ownership, and row CAS, and reports
`grant`, `revoke`, `no-op`, or bounded `invalid` outcomes. It returns no token
when any row is invalid or the whole batch is a no-op. The signed token binds
the normalized rows, resolved targets and versions, reason, actor, active
brand, and short expiry.

Apply re-previews before token verification and again inside one required
transaction. A changed command/token or concurrent state change returns `409`;
a semantically invalid batch returns `422`. No valid row is written when any
row is invalid. Each changed row writes its own assignment audit event and the
batch writes one summary event with a shared `batchId`; no-op rows do not claim
a change audit. Legacy role projection and all audits share the assignment
transaction, and an unavailable transaction returns `503` without partial
writes.

## Audit query and decision explanation

`GET /audit` sorts newest first by occurrence time and immutable event ID. Its
opaque keyset cursor is limited to 1,024 characters, page size defaults to 50,
and `limit` is bounded to `1..100`. It accepts exact `actorId`, `brandId`,
`eventType`, `outcome`, `targetType`, and `targetId` filters. A brand reader is
always forced to the active brand; supplying another brand returns the same
opaque `404` as an unavailable context. A system administrator may query a
selected brand or omit `brandId` for deployment-wide results.

Audit snapshots are redacted again at read time and omit Waterline IDs and
timestamps that are not part of the public event contract. Passwords, bearer
or authorization values, CSRF/session material, raw claims, and other sensitive
keys are never returned. A malformed cursor or persisted audit row fails closed
instead of producing a partially trusted page.

`POST /explain` accepts a strict `subjectId`, `brandId`, and `scopeKey`, plus an
optional resource projection containing only `found`, `brandId`, and
`recordAcl`. It resolves the subject's current authority and returns the
decision, bounded role/assignment provenance, effective scopes, token ceiling,
and fail-closed resolution evidence without running a mutation or creating
synthetic authority. The caller must hold `authorization.explain` in the target
context. Missing or inaccessible brands remain opaque, and an in-context scope
denial returns `403` without disclosing another brand's topology.

## Rollout readiness

`GET /rollout/readiness` is a system-administrator-only, read-only report. It
checks the deployed registry projection and orphaned scopes, authorization route
declarations, migration and bounded persistence drift, datastore transaction
support, unresolved shadow mismatches, at least one effective administrator per
brand, and the protected minimum of two effective system administrators. The
response reports the complete missing-brand count but at most 100 sorted brand
identifiers, along with bounded blocker/warning codes and subjects; it never
returns raw records or configuration secrets. `readyForEnforce` is true only
when no blocker exists.

The readiness route does not switch authorization mode, repair drift, adopt new
system scopes, or provide the Phase 8.6 stop-gate decision. Operators must treat
a failed or truncated dependency check as not ready.

## Configuration export and import

`GET /export` returns a deterministic schema-version `1` document: templates
and immutable revisions sort by key/revision, roles sort by brand/key, effective
scope arrays are normalized, and assignments sort by their complete context and
source tuple. The service takes a transactional snapshot, rejects malformed
persistence relationships, bounds the combined scan to 5,000 rows and the
serialized result to 1 MiB, and writes a redacted
`authorization.config-exported` audit event.

Assignments and user identifiers are absent by default. Setting
`includeAssignments=true` first returns only counts, a content hash, and a
five-minute confirmation token. Repeat the unchanged request with that token in
the `X-ReDBox-Authorization-Confirmation` header to receive manual assignment
tuples; confirmation tokens never enter URLs. Protected system-administrator recovery
tuples remain excluded unless `includeSystemAssignments=true` is also supplied
and bound into the same confirmation. That second flag is invalid without
`includeAssignments=true`. A confirmed sensitive-export token is consumed by
the successful export audit insert and cannot be replayed, including under a
concurrent duplicate request. No route exports user objects, credentials, raw
claims, or ephemeral resolution evidence.

Import accepts either a strict document object or a JSON-encoded document
string. The serialized input is limited to 256 KiB and 500 combined template,
template-revision, role, and assignment rows. Unknown properties, unsupported schema versions,
duplicate canonical tuples, invalid dates, missing brands/templates, malformed
persistence state, and over-limit input fail closed. Documents carry CAS
versions for templates, roles, and assignments; immutable template history
must be retained as an exact prefix. Imports cannot invent global templates,
change protected identities or lifecycle state, create system/protected roles,
create recovery authority, alter implicit Guest, exceed the actor's delegation
ceiling, adopt new scopes into the protected system role, schedule expiry of the
last non-expiring administrator authority, or drop protected scope floors/quorum.
System-role broadening remains available only through the dedicated
scope-adoption preview/apply operation. The specialized import planner executes
behind `RoleAdministrationService`, which remains the supported mutation facade.

`POST /import-preview` computes all changes and bounded row-level fatal codes on
the server. A clean changing plan receives a five-minute confirmation token;
an invalid or all-no-op plan does not. The token binds the actor, normalized
document hash, reason, and a hash of the current template/role/assignment state.
`POST /import-apply` rebuilds the plan inside one required transaction and
rejects changed commands, version races, expired tokens, and replays after state
changes with `409`. Any semantic row failure returns `422` with no writes.
Successful apply updates the legacy membership projection, rechecks protected
administrator quorum under role locks, and commits each changed-row audit plus
the `authorization.config-imported` batch event on the same connection.

## Problem Details

Authorization contract failures use `application/problem+json` independently
of the requested API envelope version. Every problem includes `type`, `title`,
`status`, `detail`, `instance`, stable `code`, and `requestId`. Details are
bounded and never echo request values, backend exceptions, missing scopes,
role topology, or cross-brand identifiers.

| Status | Stable condition examples                                                                |
| ------ | ---------------------------------------------------------------------------------------- |
| `400`  | `authorization.invalid-request`, `authorization.invalid-query`, invalid key or scope set |
| `401`  | Missing authentication, invalid credential, or inactive principal                        |
| `403`  | Missing route/administration scope or an in-context authorization denial                 |
| `404`  | Missing or inaccessible resource, including an out-of-context identifier                 |
| `409`  | Version conflict, stale preview, protected invariant, or duplicate key                   |
| `422`  | Semantically invalid bounded bulk/import request                                         |
| `503`  | Required transactional guarantee is unavailable                                          |
| `500`  | An unexpected bounded internal authorization failure occurred                            |

Schema-validation failures are normalized at the shared contract-validation
policy, before controller code runs, so they use this Problem Details shape as
well.

The generated OpenAPI success schemas describe both negotiated representations:
the direct API v1 body and the API v2 `{ data, meta }` envelope. The
`X-ReDBox-Api-Version` header is constrained to `1.0` or `2.0`; Problem Details
is never wrapped by either success envelope.

## OpenAPI and verification

The route source is registered through the core API route registry. It drives
runtime validation, route authorization metadata, generated policy mappings,
and OpenAPI. After changing this surface, run:

```bash
npm run validate:api-routes
npm --prefix packages/redbox-core test -- --grep "authorization contract API routes|webservice AuthorizationController|AuthorizationAuditService|AuthorizationConfigurationService|AuthorizationReadinessService"
RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/AuthorizationPhase8.test.ts\ntest/integration/services/AuthorizationPhase8Assignments.test.ts\ntest/integration/services/AuthorizationPhase85.test.ts' npm run test:mocha:mount
npm run test:bruno:general:mount
```

The focused Mocha integration fixture exercises catalog pagination,
scope-ceiling denial, opaque revision lookup, transactional template
publication, cross-brand role hiding, the complete role lifecycle, and atomic
selected-role template upgrades. The assignment fixture adds source-specific
mutation, expiry, idempotency, concurrency, protected quorum, cross-brand,
confirmation, atomic bulk, audit, and legacy-projection coverage. The general
Bruno collection exercises the session-authenticated catalogs, assignment
happy/error workflows, redacted audit query, read-only explanation, readiness,
default and separately confirmed assignment export, no-op import preview, and
malformed import rejection through the mounted HTTP stack. The Phase 8.5
integration fixture additionally proves transactional import, replay
protection, protected-quorum rollback, cross-brand opacity, and readiness
against the real persistence adapter.
