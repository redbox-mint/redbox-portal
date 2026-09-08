# Authorization Hook Contract

Hooks extend ReDBox authorization in two bounded ways: declaring business
scopes, and assigning roles from external identity claims. Neither path may
mutate the legacy user-role association directly; direct database writes are
reported as drift by readiness checks.

## Declaring scopes

A hook opt-in declares a synchronous scope provider. Package metadata enables
discovery with `sails.hasAuthorizationScopes: true`, and the hook exports:

```ts
export function registerRedboxAuthorizationScopes(): readonly AuthorizationScopeDefinition[];
```

Each definition carries `key`, `label`, `description`, `risk`
(`read`/`write`/`admin`/`system`), and optional deprecation metadata with a
replacement key. Rules enforced at load and startup validation:

- the provider is synchronous and pure: no datastore, network, or bootstrap
  side effects;
- keys use the lowercase dot-segment grammar and must begin with the hook's own
  approved package namespace (for example `figshare.publication.submit`);
- duplicate keys, invalid namespace ownership, invalid replacements, and
  conflicting metadata fail startup validation;
- wildcards, role hierarchies, and denies are not part of the model.

Registration never grants the scope. A registered hook scope becomes usable by
routes and roles through the merged runtime registry, and administrators adopt
newly registered system-risk scopes explicitly.

## Assigning roles from claims

Claim synchronization uses `RoleAdministrationService.replaceExternalAssignments()`
with a complete `ReplaceExternalAssignmentsCommand` (types are exported by
`@researchdatabox/redbox-core`). Every call requires:

- `requestId`: a non-empty correlation ID of at most 128 characters;
- `actor`: the original server-issued `AuthorizationContext`, active and carrying
  `authorization.assignment.manage` plus every effective scope of every desired
  role (the delegation ceiling); actor metadata or claimed scope arrays alone
  cannot authorize the call;
- `principalId`: the subject user ID; the service canonicalizes linked aliases;
- `brandId`: exactly one explicit brand ID for the entire replacement;
- `provider` and a stable provider-local `sourceKey`: non-empty text, each at
  most 64 characters after normalization; the stored external source key is
  `provider::sourceKey`. Choose unambiguous, stable identifiers, without raw
  claims or credentials, and do not reuse that combined identity across
  independent mappings;
- `roleKeys`: the complete desired set for that subject/brand/provider/source,
  at most 100 distinct keys, each non-empty and at most 128 characters. An empty
  set intentionally removes that source's unsuppressed grants in this brand.

Acquire the actor from `req.authorization` after the request authorization
policies, or `AuthorizationService.resolveRequestContext(req)` after normal
credential validation. Trusted server code may use
`AuthorizationService.resolveUserContext(authorizedActorUserId, brandId)` for an
already authenticated/authorized acting user; resolving a user is not a login
or permission grant. Resolve the acting administrator, not the claim subject
merely because they are signing in. A session/bearer actor keeps its current
scope provenance and credential ceiling. Never deserialize, copy, cast or freeze
an object to manufacture authority: only the original server-issued context
passes provenance validation. There is no public `createSystemProcessContext`
factory. Background claim jobs need a reviewed server-owned adapter with bounded
internal authority; the private issuer is not a hook/request API or a way to
accept identity/scopes from payloads.

This typed example receives the guarded Sails service, the acquired actor and
server-validated mapping inputs. `expectedState` is the complete observed source
snapshot, when the caller chooses to pin one:

```ts
import { randomUUID } from 'node:crypto';
import type {
  AuthorizationContext,
  ExternalAssignmentExpectedState,
  ReplaceExternalAssignmentsCommand,
} from '@researchdatabox/redbox-core';

export async function synchronizeClaims(
  roleAdministration: {
    replaceExternalAssignments(command: ReplaceExternalAssignmentsCommand): Promise<unknown>;
  },
  actor: AuthorizationContext,
  subjectUserId: string,
  brandId: string,
  desiredRoleKeys: readonly string[],
  expectedState?: readonly ExternalAssignmentExpectedState[]
): Promise<unknown> {
  const command: ReplaceExternalAssignmentsCommand = {
    requestId: randomUUID(),
    actor,
    principalId: subjectUserId,
    brandId,
    provider: 'institution-oidc',
    sourceKey: 'research-groups',
    roleKeys: desiredRoleKeys,
    expectedState,
    reason: 'Synchronize the verified institutional research-group mapping',
  };
  return roleAdministration.replaceExternalAssignments(command);
}
```

All desired roles must be assignable in that single brand; Guest, inactive,
missing or wrong-context roles are rejected. System-role assignments are not
part of this brand-only contract. Synchronize different brands with separate
calls and authorized contexts; there is no cross-brand atomic replacement.
Group-to-role mapping remains a hook responsibility; no mapping UI is included
in phase 1.

The service validates the complete desired set, delegation and existing source
state before changes. Desired rows are created or reactivated for the exact
external source tuple; stale unsuppressed rows are revoked. `sourcePresent`
tracks provider disappearance/reappearance even for locally **suppressed** rows,
which synchronization never reactivates. Manual, onboarding, recovery, migration,
other providers/source keys, and other brands remain untouched. Identical
synchronization is a no-op with bounded audit behavior. Assignment changes,
legacy membership projection and success audit commit in one required transaction.

For optimistic concurrency, supply `expectedState` entries such as
`[{ roleKey: 'Researcher', expectedVersion: 3 }]`, using assignment versions,
not role versions. Include every existing row for the exact source tuple in the
brand, including revoked/suppressed/source-absent rows, with no duplicate role
keys; versions are positive integers. `expectedState: []` asserts that no rows
exist. Missing/extra rows or changed versions fail with
`409 authorization.version-conflict`. Omission allows reconciliation against
state read inside the transaction; per-row version predicates still protect
writes from concurrent changes. Re-read the complete source state and recompute
the desired mapping before retrying a conflict.

Missing/untrusted actors fail with `401`; insufficient assignment/delegation
scope fails with `403`; missing/wrong-brand state fails with `404`. Validation
errors depend on the check reached; with an authorized actor and otherwise valid
input, examples include:

- `400 authorization.invalid-role`: required provider/source/role text is empty
  or invalid after normalization, such as `provider: ' '` or `roleKeys: ['']`,
  or a desired role is inactive.
- `422 authorization.bulk-invalid`: the desired set exceeds 100 distinct role
  keys, or `expectedState` repeats a role key with otherwise valid entries (for
  example, two `{ roleKey: 'Researcher', expectedVersion: 3 }` entries).
- `409 authorization.version-conflict`: an expected assignment version is not a
  positive safe integer (for example, `expectedVersion: 0`), the pinned source
  state differs, or a concurrent write defeats a version predicate.
- `409 authorization.query-bound-exceeded`: existing source state exceeds the
  100-row bound.

These examples do not promise a uniform status for arbitrary malformed payloads.
Administrator quorum and optimistic concurrency guards remain active. Unavailable transactions fail
closed with `503`; audit or write failure rolls back the mutation. Failure never
returns partial success counters or a success audit; attributable denials/failures
use the separate attempt-audit path. Do not fall back to direct database writes.

See the [contract API](Authorization-Contract-API.md) for supported catalog and
assignment reads, and [migration/rollout guide](Authorization-Migration-and-Rollout.md)
for provenance, legacy projection and release gates.

## Onboarding default role

Per-brand/provider authentication configuration may set a default onboarding
role key (compatibility default `Researcher`). First onboarding creates one
`onboarding`-sourced assignment through the assignment service; revoked
onboarding rows are retained so later logins never reapply a changed default.
Guest is implicit and never assigned.
