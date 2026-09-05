# Authorization Administration

This page describes day-to-day administration of brand roles, assignments, the
scope catalog, and the authorization audit. The server is always authoritative:
navigation visibility and UI affordances are convenience projections only.

## Surfaces

Administrators manage authorization through two equivalent surfaces:

- the embedded **Manage Roles** Angular application (`/admin/roles`), which
  consumes the contract API; and
- the **Authorization Contract API** under `/:branding/:portal/api/authorization`
  documented in [Authorization Contract API](Authorization-Contract-API.md).

Both surfaces enforce the same conditional CSRF contract: browser-session
mutations must present the CSRF token; valid legacy bearer clients are exempt.

## Roles

A role belongs to exactly one brand (except the protected system role), has an
**immutable key** (legacy `name`), a mutable display label and description, and
effective scopes computed as:

```text
(pinned template revision scopes - remove overrides) union add overrides
```

Common workflows:

- **Create** a custom role from an empty base or a template revision. New keys
  use `^[a-z][a-z0-9-]{0,63}$`; existing deployment role names keep their
  original spelling.
- **Clone** a same-brand role. Copied effective scopes only; assignments and
  protected identity are never copied.
- **Edit scopes** through preview then apply. Previews report additions,
  removals, risk broadening, affected assignments, and protected-role warnings,
  and return a short-lived confirmation token that must be supplied to apply
  together with the expected version (`409` on drift).
- **Upgrade template revision** through preview then apply; pinned roles never
  change automatically when a new revision is published.
- **Inactivate** referenced roles after preview; history is preserved.
- **Delete** only never-used, unprotected, dependency-free roles; the server
  rechecks every dependency inside the apply transaction.

Delegation is bounded: a brand administrator can only grant scopes inside their
own effective brand scopes. New system scopes require explicit adoption with
`system.authorization.manage`.

## Protected roles

- **Guest** is implicit for every request in the brand; it is never assigned,
  cannot be inactivated, and must retain `authorization.self.read`.
- **Brand administrator** must retain the administration floor
  (`authorization.scope.read`, `authorization.role.read`,
  `authorization.role.manage`, `authorization.assignment.read`,
  `authorization.assignment.manage`). Each brand must keep at least one
  effective brand administrator; the final one cannot be removed.
- **System administrator** is a single global protected role. Enforce readiness
  requires at least two active, unexpired, unsuppressed assignments. The final
  effective system administrator cannot be removed through any supported path.

## Assignments

Assignments are **sourced**: `manual`, `onboarding`, `migration`, `external`,
and `recovery` rows coexist and are deduplicated for effective authority.

- Grant/reactivate and revoke operate on one exact source tuple and are
  idempotent. Revoking the manual source never revokes external or migration
  authority.
- Expiry is optional and independent of token lifetime.
- External claim-sourced rows can be **suppressed** locally; claim
  synchronization cannot reactivate a suppressed tuple, and unsuppression
  activates only when the provider still requests the role.
- Bulk assignment import is available through bounded preview/apply with one
  audit event per changed assignment plus a batch summary. The CSV/JSON bulk UI
  is deliberately deferred.

## Scope catalog

The catalog is read-only. Definitions come from deployed core and hook code,
carry risk classification and source metadata, and expose
`active`/`deprecated`/`orphaned` status with replacement keys. Orphaned and
deprecated scopes grant nothing and cannot be newly selected in the role editor.

## Audit

The audit tab filters typed, append-only, redacted authorization events by
time, event type, outcome, actor, and target. Passwords, bearer values, CSRF
values, raw claims, session identifiers, and authorization headers are never
recorded.

## Navigation configuration

Menu items, home panel items, and admin sidebar sections/items accept an
optional `requiredScope` business scope key evaluated against the request
context. In `legacy` and `shadow` modes the scope engine is advisory for
navigation (legacy role behavior is unchanged); in `enforce` mode `requiredScope`
is authoritative and unknown scope keys fail closed. `requiredRoles` remains
readable during the compatibility window. Hiding navigation is never a security
boundary: destination routes run the authoritative policy.
