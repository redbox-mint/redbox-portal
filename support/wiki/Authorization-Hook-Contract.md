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

Claim synchronization uses the typed external-replacement contract exported by
`RoleAdministrationService.replaceExternalAssignments()`. The call requires:

- the provider identity and a stable provider-local `sourceKey`;
- the canonical subject (the service canonicalizes linked aliases);
- the explicit brand for every desired role key;
- the desired role keys, validated before any mutation; and
- actor metadata for the audit event.

Semantics:

- desired roles are granted or reactivated for that exact provider/source
  tuple;
- `sourcePresent` is updated for every row covered by a successful
  synchronization;
- stale unsuppressed rows for that provider/source are revoked;
- locally **suppressed** rows are preserved across provider disappearance and
  reappearance, and cannot be reactivated by synchronization;
- manual, onboarding, and migration sources are untouched;
- repeated identical synchronization is a no-op with bounded audit behavior.

Group-to-role mapping remains a hook responsibility; no mapping UI is included
in phase 1.

## Onboarding default role

Per-brand/provider authentication configuration may set a default onboarding
role key (compatibility default `Researcher`). First onboarding creates one
`onboarding`-sourced assignment through the assignment service; revoked
onboarding rows are retained so later logins never reapply a changed default.
Guest is implicit and never assigned.
