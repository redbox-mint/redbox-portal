# Application Authorization and Permission Model

> **Status:** Agreed design direction. OAuth authorization-server selection and
> deployment are explicitly deferred.
>
> **Last reviewed:** 28 August 2026

This page records the outcome of the permission-model design review. It is the
shared design boundary for implementation: it documents the current system,
the agreed target model, rollout and compatibility requirements, and the
decisions deliberately left for a later OAuth investigation.

## Executive decision

ReDBox will replace path-and-role authorization with configurable roles made
from stable business-capability scopes. The server remains authoritative. The
same scope declarations drive API actions, server-rendered pages, navigation,
Angular controls, and generated API documentation.

Scopes answer **whether a principal may attempt an operation**. They do not
replace brand isolation, entity ownership checks, or the existing record
view/edit ACL. A successful authorization decision requires every applicable
gate to pass.

OAuth is not a phase-one dependency. Existing opaque bearer tokens remain
available until deployments have a viable replacement. A later investigation
will decide whether ReDBox integrates with an external or co-deployed
authorization server, incorporates authorization-server capability itself, or
retains a hardened non-OAuth option.

## Goals

- Allow security administrators to create and configure roles through the UI
  and contract APIs without deploying code.
- Use stable, server-enforced scopes for UI pages, navigation, and API actions.
- Preserve additive multi-role behavior and role-based record access.
- Make brand context an authoritative part of every operation on brand-owned
  data.
- Make effective access explainable and every authorization mutation auditable.
- Preserve intended access during migration without preserving known security
  defects.
- Give hooks a stable, namespaced scope-registration contract.
- Retain a safe compatibility path for current integrations.

## Non-goals for phase one

- Deploying or implementing an OAuth authorization server.
- Issuing refresh tokens or supporting user-delegated OAuth grants.
- Replacing local, AAF, or OIDC browser login with OAuth.
- Introducing role inheritance, explicit deny rules, wildcard scopes, or a
  general-purpose policy-expression language.
- Replacing record ACLs with scopes.
- Introducing project-level or record-type-level role assignments.
- Automatically mapping external identity-provider groups to roles.

## Current implementation findings

The following findings describe the implementation at the time of this design.
They are migration constraints, not desired behavior.

### Roles and assignments

- `packages/redbox-core/src/waterline-models/Role.ts` stores only `name`,
  `branding`, and the many-to-many `users` association. It has no scope,
  description, immutable key, system marker, or protected-role metadata.
- Core seeds `Admin`, `Librarians`, `Researcher`, and `Guest` from
  `packages/redbox-core/src/config/auth.config.ts`.
- The `/admin/roles` Angular application assigns existing roles to users. It
  does not create, rename, deactivate, delete, or configure roles.
- A user can hold roles from several brands because users are global while each
  role belongs to one brand.
- There is no persisted role-inheritance model. A legacy login helper,
  `RolesService.getNestedRoles`, expands an SSO default through a hard-coded
  role list. That list refers to `Maintainer` while the shipped role is
  `Librarians`; it must not become part of the new model.
- Role membership is an unversioned many-to-many association. It does not
  retain source, actor, reason, assignment time, expiry, or external mapping
  provenance.

### Route and UI authorization

- `PathRule` maps a URL pattern and brand to a role and coarse read/write flags.
  Runtime enforcement is path based rather than HTTP-method or action based.
- `checkAuth` calls the read check for every request. The current read check
  accepts either read or update authority.
- A request proceeds when no path rule matches. This is a fail-open boundary.
- Configuration and persistence disagree on `can_update` versus `can_write`.
- Path rules and brand-role data are held in process-local caches without
  cross-instance invalidation.
- Navigation visibility is separately driven by `requiredRoles`. A link can be
  visible while its route is denied, or hidden while its route remains callable.
- Angular features inspect raw roles or one-off `is-admin` values. There is no
  central effective-permission projection.
- Contract API route definitions already know the method, controller, action,
  policies, and extension metadata. They are the preferred declaration point
  for API scopes and generated OpenAPI metadata.

### Record authorization

- Record authorization stores direct username grants in `view` and `edit`, and
  role-name grants in `viewRoles` and `editRoles`.
- Edit implies view. Role grants are resolved against roles in the current
  brand, and Solr applies equivalent brand-filtered ACL clauses.
- Workflow stages remain the source of default record view/edit role grants.
- Record creation already derives an authoritative ACL from workflow state
  rather than trusting submitted authorization.
- Role names are persisted in records, tombstones, workflow configuration, and
  Solr fields. A cosmetic role rename can strand access unless identity is
  separated from display text.

### Brand isolation

- Brand ownership exists on many entities, but enforcement is implemented
  independently in each service. There is no required application-wide actor
  and brand authorization context.
- Newer services commonly query by both entity identity and brand. This is the
  desired pattern.
- Vocabulary administration contains concrete cross-brand gaps: list, get,
  update, reorder, delete, and sync paths can omit the active brand from their
  service criteria. This design therefore includes a systematic brand-boundary
  remediation, not only new route scopes.
- Ordinary cross-brand failures must not disclose that an entity exists.

### Administration, audit, and consistency

- The bootstrap `admin` account is an ordinary user associated with roles in
  the default brand. It is not currently a stable parent or system principal
  and has no deliberate cross-brand authority.
- There is no last-administrator quorum or reliable break-glass recovery path.
- Role and assignment changes are not transactionally audited. Existing user
  audit events cover only a small set of login and account-management actions.
- Role creation and assignment updates are check-then-write operations without
  optimistic concurrency. Concurrent changes can duplicate roles or overwrite
  unrelated brand assignments.
- Current audit rows are loosely structured and are not transactionally coupled
  to the mutation they describe.

### Sessions and API tokens

- Normal HTTP session deserialization reloads the user and current roles on
  each request, so role membership changes are naturally visible on the next
  request.
- Disabled users remain authenticated in already-established browser sessions.
- WebSocket authorization uses a stored user snapshot and can retain stale
  roles or disabled state.
- API credentials are opaque UUID values. Only one token hash is stored per
  user. Tokens have no issuance time, expiry, audience, client, token-specific
  scope, or refresh-token family.
- Bearer authentication reloads the current user and roles, but the reported
  Passport scope is a decorative `all` value that does not participate in
  authorization.
- A failed bearer attempt currently continues into downstream path
  authorization. Combined with fail-open path behavior, this is a security
  migration edge.
- OpenAPI currently labels these opaque credentials as JWTs.

## Terminology

| Term | Meaning |
| --- | --- |
| Principal | A human user, the anonymous Guest principal, or a future service client. System administrator is a protected assignment, not a separate identity type. |
| Scope | A stable business capability such as `record.read` or `authorization.assignment.manage`. |
| Scope definition | Code- or hook-declared metadata for a scope: immutable key, label, description, namespace, and risk classification. |
| Role template | A global, versioned default bundle of scopes. |
| Brand role | A brand-scoped role instance derived from a template and optionally overridden for that brand. |
| Role assignment | A relationship granting a principal a brand role, with provenance and optional expiry. |
| Guest | The synthetic, brand-aware public baseline inherited by anonymous and authenticated principals. |
| System administrator | A protected global assignment with explicit cross-brand and system capabilities. |
| Authorization context | Trusted request or job context containing principal, active brand, effective scopes, authentication method, and request/correlation identity. |
| Legacy bearer token | The current opaque UUID API credential associated with a user. It is not an OAuth token. |

## Authorization decision model

For an ordinary brand-owned operation, authority is the intersection of
independent gates:

```text
required action scope
AND active principal status
AND active/target brand authority
AND entity ownership constraint
AND record ACL, when the entity is a record
AND token scope ceiling, when token-specific scopes exist
```

An action scope permits attempting an operation; it does not grant access to
every entity of that type. Administrative record bypasses are explicit,
high-risk scopes such as `record.read.all` and `record.update.all`. They must not
be inferred from a role named `Admin`.

### Scope model

- Scope keys represent business capabilities, not URLs, controller names, UI
  routes, or individual buttons.
- Keys are namespaced, immutable, and treated as published contracts. Labels
  and descriptions may change. Keys are limited to 256 characters so registry
  persistence and keyset pagination remain bounded by the same contract.
- Scopes are flat and explicit. There are no wildcards or implicit hierarchy.
- Actions require one primary scope. Additional brand, entity, and record gates
  are composed in services rather than through arbitrary Boolean expressions.
- Core and hooks declare scope definitions. Administrators assign scopes to
  roles but cannot create arbitrary identifiers that no code understands.
- Hook scope-key collisions fail startup. Removed hook scopes remain visible as
  orphaned assignments and deny authority until migrated or removed.
- Newly registered scopes are never automatically granted.
- Hooks opt in with `sails.hasAuthorizationScopes: true` and export a synchronous,
  side-effect-free `registerRedboxAuthorizationScopes()` function. The loader
  validates namespace ownership and emits `authorizationScopeSources`; route
  validation and catalog reconciliation consume that same merged registry.
- Scope metadata classifies read, mutating, administrative, and system risk so
  administration and review surfaces can apply appropriate safeguards.

Example granularity includes `record.read`, `record.create`, `record.update`,
`record.delete`, `record.workflow.transition`, `vocabulary.read`,
`vocabulary.manage`, `authorization.role.read`, `authorization.role.manage`,
and `authorization.assignment.manage`. The reviewed initial catalogue must
distinguish materially different risks without creating one scope per endpoint.

### Roles and effective scopes

- Several roles combine through an additive union of allowed scopes.
- Default is deny. Explicit deny rules are not part of phase one.
- Roles do not inherit other roles.
- Each role has an immutable machine key and mutable display name and
  description. Existing role names become compatibility keys initially.
- Role templates are global and versioned. Brand role instances may override
  them because brands are genuine authorization boundaries.
- Brand instances pin a template version. Template upgrades are reviewed as a
  diff and may be bulk-applied. New template scopes are not auto-granted.
- A role can be created, cloned, edited, deactivated, or deleted when unused.
  A role with users, workflow references, record ACL references, or other
  dependencies must be deactivated rather than silently deleted.

For a normal principal in a brand:

```text
effective scopes = brand Guest scopes
                 UNION active, unexpired brand-role assignment scopes
```

Guest is not manually assigned to users. It is the public baseline for every
principal in the active brand. Brand-specific Guest configuration is allowed,
but changing it is changing anonymous access. Guest cannot receive security,
token, role-management, or system-administration scopes. Other mutating Guest
grants require explicit high-risk confirmation and audit. The protected Guest
role retains the safe self-permission projection scope used by UI clients.

### System administration

- The bootstrap account initially receives a protected global
  system-administrator assignment. Authorization uses a stable identity, never
  a username or display-name convention.
- Several system administrators may exist. The final active system
  administrator cannot be removed, disabled, or demoted.
- A brand cannot be left without an active brand administrator.
- The protected brand-administrator role retains the minimum scope floor needed
  to inspect roles/scopes and repair brand assignments; its other business
  capabilities remain configurable.
- System authority is an explicit set of scopes, not a wildcard over all
  present and future hook scopes.
- The protected system role retains the brand-administration floor plus the
  explicit system authorization-management scope needed for audited scope
  adoption and recovery.
- Ordinary operations still name a target brand. Cross-brand reporting or
  aggregation requires a separate high-risk scope.
- System-level capabilities, including existing brand-management operations,
  are declared in phase one. New brand-management workflows may be deferred.
- Recovery is an explicit operator-run action with deliberate confirmation and
  durable audit. Startup must not silently reset or elevate an established
  account.

## Brand and entity isolation

Every protected entity type must declare whether it is global or brand-owned.
Brand-owned service and repository methods require an authoritative context and
include the brand in read, update, and delete criteria.

- Controllers and route policies are not sufficient enforcement boundaries.
  Services must protect calls from HTTP controllers, hooks, jobs, and internal
  code alike.
- Cross-brand entity reads behave as not found. Collections, search results,
  counts, and autocomplete omit inaccessible entities.
- A `403` is appropriate when the entity is in the active brand but the
  principal lacks the required scope or entity-level access.
- Ordinary updates cannot change an entity's brand. Ownership transfer, if
  needed, is a separate audited system operation.
- Jobs and hooks receive an explicit brand-scoped actor context. Genuine global
  maintenance uses a distinct, audited system context. Missing request context
  must never imply default-brand access or unrestricted authority.
- The existing vocabulary administration gaps and equivalent services are in
  the remediation scope for this release.

## Record access preservation

The existing record model remains a second authorization axis:

- `record.read` permits the read operation, while record view/edit ACLs decide
  which records are visible.
- `record.update` permits editing, while edit ACLs decide which records may be
  changed.
- Edit continues to imply view.
- Workflow-derived `viewRoles` and `editRoles` remain supported.
- Direct username grants remain supported.
- Mongo and Solr filtering must produce equivalent authorized result sets.
- Cross-brand roles never satisfy a record ACL in another brand.
- Explicit `record.read.all` and `record.update.all` capabilities may bypass an
  ACL only after brand authority and all other service-level constraints pass.

Role identity migration must not strand persisted record grants. Existing role
names remain valid compatibility keys and are not rewritten for cosmetic
normalization. If implementation changes the persisted role-reference
representation, legacy names and new references are dual-read until active
records and tombstones are migrated. Any required Solr rebuild uses an
authorization-independent storage scan; the current user-filtered `indexAll`
path is not sufficient for this migration.

## Enforcement surfaces

### Server routes and API actions

- Route targets use one typed declaration: `{ kind: 'scope', scope }`,
  `{ kind: 'public', reason }`, or `{ kind: 'pre-auth', reason }`. The declaration
  and stable method/path/controller/action route ID are retained in the Sails
  route target and validated against the merged core-and-hook scope registry at
  startup.
- Every protected action declares a required business scope. Every intentional
  anonymous action declares public access explicitly.
- API scope metadata belongs with the contract route definition so method and
  action are authoritative and hook routes use the same registry.
- Server-rendered UI routes use the same capability keys. Loading a page uses
  the lowest applicable business capability; individual API mutations still
  enforce their stronger capabilities.
- A route with neither required scope nor explicit public/pre-auth classification
  fails startup validation in every mode. If startup validation is bypassed,
  `enforce` still denies the request at runtime.
- Infrastructure endpoints such as login callbacks, static assets, and health
  checks use a very small code-declared pre-authentication allowlist visible in
  diagnostics.
- Unauthenticated denial returns `401`; authenticated-but-unauthorized denial
  returns `403`. Browser page requests may redirect to login while APIs retain
  the status semantics.
- Cross-brand failures do not disclose entity existence.
- Standardized API errors include a stable reason code and request ID, but do
  not disclose missing scope, role topology, ACL evidence, or cross-brand
  existence details. Detailed evidence remains a separately authorized surface.

### Navigation and Angular applications

- Server enforcement is always authoritative; hiding a page, link, or button
  is only user experience.
- Navigation derives its requirement from the destination route when possible.
  External links and composite pages may declare an explicit registered scope.
- EJS navigation and Angular controls consume a central effective-scope
  projection rather than raw role names.
- ReDBox remains an embedded-Angular application: Sails/EJS owns page routing,
  and the existing `/admin/roles` page mounts the expanded Angular application.
  This design does not add Angular Router.
- OpenAPI required scopes and `401`/`403` responses are generated from the same
  metadata used at runtime. While legacy bearer tokens remain, documentation
  must describe them as opaque bearer credentials rather than JWTs.
- During the compatibility window, generated operations retain path-derived
  `x-redbox-roles` with `x-redbox-roles-deprecated: true`; `x-redbox-scope` is
  authoritative in enforce mode.

## Role and scope administration

The existing `/admin/roles` surface becomes a searchable administration area
with separate views for:

- **Roles:** template, brand instance, template-base scopes, local overrides,
  status, dependencies, and version.
- **Assignments:** users, brands, provenance, expiry, and batch operations.
- **Scope catalogue:** registered core and hook capabilities, namespace,
  descriptions, risk, deprecation, and orphan state.
- **Audit history:** actor, target, brand, diff, reason, time, authentication
  method, correlation ID, and batch identity.

The UI and external callers use the same contract APIs. Required behavior
includes:

- impact preview before changes, including scope diff, risk, affected-user
  count, affected capabilities, and lockout warnings;
- an explanation view showing why a user has an effective scope;
- versioned updates and `409 Conflict` on stale edits;
- a versioned JSON export and dry-run import for promotion between
  environments, excluding users and system administrators by default;
- optional validated bulk assignment with one audit event per changed
  assignment plus a batch summary;
- accessible confirmation dialogs for high-risk changes;
- delegation ceilings: an administrator cannot create or assign authority they
  do not possess;
- `system.authorization.manage` is the explicit, high-risk exception used to
  adopt a newly deployed registered scope into the protected system role before
  it can be delegated; adoption is previewed, versioned, confirmed, and audited,
  and registration alone never grants the scope;
- separate capabilities for editing role definitions and assigning roles; and
- prevention of self-demotion when it would remove the last active system or
  brand administrator.

Role definition, assignment, and audit writes commit in one transaction. A
failed audit write fails the authorization mutation rather than leaving an
unrecorded change.

This requires a MongoDB replica set or sharded cluster with working transaction
support. The maintained integration profiles use an initialized single-node
replica set and do not report healthy until a rolled-back transaction probe
succeeds. Production rollout readiness likewise checks transaction capability,
not merely database connectivity, and blocks `enforce` when the guarantee is
unavailable.

## Assignment lifecycle

- New SSO users inherit Guest and may receive one configurable onboarding role
  per brand and provider on first login. `Researcher` remains the typical
  default but is not hard-coded.
- Changing an onboarding default affects future users only. Existing users may
  be updated through an explicit previewed and audited bulk operation.
- Assignment records retain source, actor, brand, creation time, optional
  expiry, and external source identifiers.
- Expired assignments cease contributing authority on the next request; no
  scheduler is required for enforcement.
- External AAF/OIDC claim mapping is not a first-class phase-one feature. The
  existing hook seam may remain temporarily, but it must ultimately call the
  typed assignment service and retain provenance.
- Local ReDBox administration remains authoritative. An administrator can
  suppress an exact externally sourced assignment; synchronization records
  whether the provider still requests it but cannot reactivate the suppressed
  row. Unsuppressing activates it only when the provider still requests it.
  This source-level suppression is not a general role/scope deny rule. Profile
  claims do not grant access merely because they were copied onto a user.
- Identity linking requires recent proof of both identities and previews the
  resulting authority. Assignments across all brands merge atomically into the
  canonical principal with their provenance retained. Unlinking cannot guess
  how to redistribute merged authority.
- A brand administrator cannot use identity linking to alter authority owned by
  another brand.

## Freshness, caching, and sessions

- Mutable role-to-scope mappings and effective permissions are read from
  authoritative storage per request in phase one, with request-local reuse
  only. Process-local authorization caches are not used.
- Permission changes are effective on the next request after an atomic save.
- Session deserialization rechecks active/disabled state as well as current
  assignments.
- Disabling a user terminates their authority on the next HTTP, bearer, or
  WebSocket operation.
- Disabling permanently revokes the legacy bearer token. Re-enabling the user
  does not restore it.
- Protected WebSocket operations revalidate current principal and scope rather
  than trusting the connection-time snapshot.
- A later distributed cache is permitted only after measured performance shows
  a need and it preserves next-request revocation across all instances.

## Authorization audit

Authorization uses a typed append-only audit model rather than overloading the
current loosely structured user-audit rows.

Audit coverage includes:

- role creation, template update, override, deactivation, and deletion;
- scope grants and removals;
- user-role assignments, expiry, removal, import, and batch operations;
- Guest and system-administrator changes;
- scope registration, deprecation, orphaning, and migration;
- enforcement-mode and emergency rollback changes;
- legacy token generation/replacement/revocation, plus expiry when a later
  hardening phase supports it; and
- rejected attempts to perform protected administration.

Events contain actor, target, brand, structured before/after values, reason,
request/correlation ID, authentication method, timestamp, and batch identity.
They never contain passwords, bearer values, refresh tokens, or credential
material. Brand security administrators can read their brand's events; system
administrators can read all brands.

Retention is configurable and defaults to indefinite retention when unset.
Rows are never edited. The only deletion path is a bounded age-based retention
job that respects legal hold and writes a current summary audit event; the
institution-specific retention period remains an operator decision.

Retention is configurable and exportable. Until an institutional policy is
defined, authorization events are not automatically deleted; operators must
monitor growth and use an explicit archival process.

## Migration and rollout

### Rollout modes

Authorization has one validated deployment-wide mode:

| Mode | Authority | Behavior |
| --- | --- | --- |
| `legacy` | Existing path/role logic | New models and diagnostics may be populated, but legacy remains authoritative. |
| `shadow` | Existing path/role logic | Legacy and scope decisions are both evaluated; bounded discrepancies are recorded. |
| `enforce` | New scope model | Missing declarations and denied scope decisions fail closed. |

Mode is deployment configuration, not an administrator-controlled UI toggle.
Every application instance must run the same mode. The UI displays current mode
and readiness but cannot switch it casually.

`sails.config.authorization.mode` is the runtime setting. Invalid supplied
bearer credentials, inactive principals, and invalid or unauthorized brands are
denied in every mode. Shadow mismatch writes are atomic bounded aggregates and
never delay or change the legacy result. They contain a stable route ID, bounded
brand and principal category, outcomes, reason, count, timestamps, and a sample
request ID; they do not contain actor IDs, raw URLs, resource IDs, or credentials.

### Migration sequence

1. Inventory path rules, navigation role checks, form and workflow role names,
   hard-coded `Admin` checks, hook routes, and internal service callers.
2. Add immutable role keys, display metadata, scope definitions, templates,
   brand instances, assignments, system authority, and authorization audit.
3. Backfill existing roles without normalizing or changing their compatibility
   names.
4. Supply reviewed capability mappings for core actions and known hooks.
   Path rules cannot be translated mechanically into business meaning.
5. Create brand-specific template instances and initial assignments that
   reproduce intended legitimate access.
6. Enable shadow evaluation and remediate unexplained allow/deny differences.
7. Fix brand-isolation defects, including vocabulary administration, and add
   query-boundary tests.
8. If the role-reference representation changes, dual-read legacy names and
   stable keys, migrate active records and tombstones, and rebuild Solr through
   an authorization-independent scan. Otherwise, verify the existing keys and
   Mongo/Solr projections without rewriting them.
9. Meet every readiness gate and switch the complete deployment to `enforce`.
10. Keep legacy data and readers read-only for the first enforced release.
11. Remove legacy mode and compatibility readers only in a later release after
    production validation.

Migrations are idempotent and restart-safe. Because the current runner has no
cross-instance lock, upgrades run with one lifting instance before scaling out.
Normal startup only executes `up`; rollback is a runtime authorization-mode
decision, not a promise that data migrations can be reversed automatically.

### Shadow reporting

Shadow mode records bounded discrepancy aggregates rather than every successful
decision. Reports contain brand, action, principal category, legacy outcome,
new outcome, and stable reason codes. They do not contain record content,
credentials, or sensitive request data.

Known security defects are not compatibility promises. Fail-open routes,
read/write confusion, and missing brand constraints are documented and fixed,
even when shadow mode shows that some callers previously benefited from them.

### Readiness gates

Enforcement cannot be enabled until all of the following hold:

- no protected action lacks a scope or explicit public declaration;
- no decision discrepancy remains unexplained;
- no high-risk or orphaned assignment remains unresolved;
- brand-boundary, record ACL, and cross-brand enumeration tests pass;
- any required record and tombstone role-key migration is complete, and
  Mongo/Solr authorization projections are verified;
- at least two active system administrators exist;
- concurrency, audit atomicity, session, WebSocket, and disablement tests pass;
- core and installed-hook declarations validate; and
- the rollout configuration and readiness evidence have a durable audit
  fingerprint.

Emergency return to legacy mode remains operator-only for one release and is
itself audited. Approved security corrections remain active, but rollback can
ignore capabilities configured only in the new model. There is no guaranteed
data-level rollback.

## Legacy bearer-token compatibility

Phase one does not depend on an OAuth authorization server. Existing opaque
bearer tokens continue to work during migration subject to the following
changes:

- a valid token receives only the user's current effective scopes in the
  request brand;
- an invalid presented bearer credential returns `401` and does not degrade to
  Guest;
- account disablement permanently revokes the token;
- role and scope reductions take effect on the next request;
- documentation accurately identifies the credential as opaque rather than a
  JWT; and
- generation and revocation are audited.

Legacy bearer support is not removed on a fixed release number before a viable
replacement is available. Once a replacement exists, integrations receive at
least one full compatibility release, with telemetry, warnings, migration
instructions, and a dated cutoff before removal.

Because authorization-server adoption is deferred, retained bearer credentials
should gain issuance and expiry metadata in a separate token-hardening step.
The exact lifetime and whether the hardened credential becomes a supported
long-term no-authorization-server option remain open.

## Deferred OAuth decision

No authorization server is selected or required by this design. Keycloak is an
example of the mature external category discussed, not a product decision.

A later architecture and deployment spike will compare:

1. an institutional external OAuth/OIDC authorization server;
2. a supported co-deployed authorization-server component;
3. authorization-server capability incorporated into ReDBox; and
4. a hardened non-OAuth credential option for installations that do not want
   another production service.

The comparison must include deployment complexity, database and backup needs,
availability, upgrades, TLS and proxy configuration, client administration,
revocation behavior, monitoring, and migration from legacy credentials.

If OAuth proceeds, the following direction is already agreed:

- ReDBox remains authoritative for current local scopes, principal state,
  brands, entity ownership, and record ACLs.
- Tokens are a delegation ceiling and can never expand current local authority.
- The embedded web UI keeps server-side sessions; Angular does not receive
  access or refresh tokens.
- The first concrete OAuth use case is institution-controlled service clients.
- Service clients are distinct principals and are brand-specific by default.
- The initial service-client grant is Client Credentials.
- Client Credentials tokens do not receive refresh tokens; clients authenticate
  again for a new short-lived access token, following
  [OAuth 2.0 section 4.4.3](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.4.3).
- Existing local-user tokens migrate deliberately to service clients rather
  than being auto-converted.
- Human delegation for local, AAF, and OIDC users is not a day-one requirement.
  The architecture preserves a future authorization-code-with-PKCE path in
  line with the [OAuth Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html).

The later spike, not this document, decides issuer ownership, token format,
validation or introspection, client authentication methods, access-token
lifetimes, refresh-token policies for future user delegation, consent, and the
permanent legacy-token sunset.

## Acceptance coverage

Automated coverage must exercise more than route success cases. The required
matrix includes:

- anonymous Guest, authenticated allowed, authenticated denied, disabled user,
  and system-administrator decisions;
- multiple additive roles and brand-specific overrides;
- wrong-brand direct reads, mutations, collections, counts, autocomplete, and
  search;
- action scope combined with direct-user and role-based record ACLs;
- `record.read.all` and `record.update.all` bypasses that still honor brand
  authority;
- missing, orphaned, renamed, and colliding hook scopes;
- navigation and Angular visibility consistent with server route requirements;
- concurrent role and assignment edits returning `409` rather than losing data;
- audit mutation atomicity and credential redaction;
- immediate permission reduction across HTTP sessions, bearer requests, and
  WebSockets;
- template-version and local-override behavior;
- legacy, shadow, enforce, and emergency rollback modes;
- role-key compatibility or, only if the representation changes, record and
  tombstone migration, plus equivalent Mongo/Solr results; and
- legacy bearer compatibility and invalid-credential `401` behavior.

Performance is measured against an agreed baseline before caching is added.
Correct next-request revocation and cross-instance consistency take priority
over speculative optimization.

## Decision register

This register maps the design interview to the resulting decisions without
reproducing the full question transcript.

| Questions | Recorded decisions |
| --- | --- |
| Q1–Q7 | UI-configurable authorization, global templates with contextual assignments, human and service principals, protected security administration, canonical server scopes, staged compatibility, and OAuth as a separate phase. |
| Q8–Q16 | Business-capability scopes, code/hook-owned registry, stable role keys, additive allow-only composition, preserved record ACLs, fail-closed protected actions, brand-specific assignments, Guest retained, and central effective-scope projection. |
| Q17–Q27 | Flat scopes, simple action requirements, safe role lifecycle, Guest as public baseline with safeguards, explicit infrastructure allowlist, correct `401`/`403`, service-level brand enforcement, non-disclosing cross-brand failures, and safe hook scope lifecycle. |
| Q28–Q35 | Protected global system administration, administrator quorum, explicit system and cross-brand scopes, target-brand operations, full brand-isolation remediation, ownership classification, and explicit contexts for jobs and hooks. |
| Q36–Q45 | Immediate atomic versioned changes, next-request disablement and WebSocket revalidation, transactional authorization audit, no two-person approval in phase one, structured administration UI, impact explanations, API/UI parity, and lockout prevention. |
| Q46–Q55 | Global templates with brand overrides, no mutable process cache, typed audit storage, configurable retention, idempotent scope reconciliation, compatibility role keys, mandatory declarations, legacy/shadow/enforce rollout, security-defect correction, and reviewed rather than mechanical mapping. |
| Q56–Q66 | Reviewed template upgrades, deployment-wide rollout, operator-controlled mode, strict readiness gates, bounded shadow telemetry, limited emergency rollback, delayed legacy-data removal, conditional ACL/Solr migration with complete verification, broad test coverage, measured performance, and explicit system recovery. |
| Q67–Q75 | Domain-action granularity, no UI-only scopes, navigation derivation, safe error contracts, legacy-bearer compatibility, generated OpenAPI, versioned configuration export/import, principal-neutral foundations, and immutable scope keys. |
| Q76–Q87 | No role nesting, configurable Researcher-style onboarding, no retroactive default changes, local authority over external claims, assignment provenance and expiry, delegation ceilings, safe global identity linking, auditable bulk operations, single-version shadow/enforce rollout, and replacement-dependent token sunset. |
| Q88–Q99 | Service integrations are the first OAuth use case, browser sessions remain, OAuth does not replace login, client registration is controlled, service clients default to one brand, Client Credentials is the initial grant, no refresh token for that grant, deliberate integrator migration, and user delegation is deferred. |
| Q100–Q105 | No phase-one authorization-server dependency, current bearer credentials remain while the deployment choice is investigated, token hardening is separable from OAuth, local ReDBox authorization remains authoritative, and the OAuth issuer/deployment decision is explicitly deferred. |

## Remaining decisions

The phase-one authorization architecture is settled. The initial core scope
catalogue and curated core route mappings are code-declared delivery artifacts;
installed hook declarations and their business mappings still require review as
part of deployment readiness.

The following decisions remain deliberately open:

- authorization-server deployment and product selection;
- whether an in-application authorization server is acceptable;
- whether hardened bearer credentials remain a permanent fallback;
- token format, validation/introspection, lifetimes, and sender constraints;
- refresh-token policy for any future user-delegated flow;
- the numeric performance-regression budget;
- the institutional audit-retention period; and
- whether current operations justify phase-one bulk assignment UI.

These open items must not silently expand phase-one scope.
