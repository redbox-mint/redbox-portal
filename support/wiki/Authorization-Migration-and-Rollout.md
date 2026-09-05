# Authorization Migration and Rollout

This page documents how the configurable authorization model is delivered over
existing installations without breaking legacy integrations, and how operators
move between rollout modes.

## What the migration changes

The one-time migration is additive, idempotent, and resumable:

1. Existing roles gain an immutable `key` (equal to their legacy `name`), a
   server-computed `brand:<brandingId>:<key>` identity key, a display label,
   context, status, and optimistic version. Migrated key text is preserved
   byte-for-byte; no slugification.
2. Known default roles are attached to matching initial template revisions
   without changing their keys.
3. Each brand receives exactly one protected Guest role; existing Guest roles
   are marked protected. Guest is never assigned to users.
4. The single protected global system-administrator role is created and assigned
   to the canonical bootstrap parent administrator.
5. Existing user-role associations (except Guest) become `migration`-sourced
   assignments. Legacy associations are retained untouched.
6. Record ACL strings, Solr role fields, and configuration role references are
   unchanged because role keys preserve existing names.

## Dual-write and drift

During the compatibility window every supported role/assignment mutation
dual-writes the legacy user-role association and the new assignment state in the
same transaction. Direct database mutation of role associations is not a
supported API; drift reports expose it. Readiness compares supported legacy
associations with effective assignments and reports unknown roles, wrong-brand
associations, unmapped path rules, and protected-role anomalies.

## Rollout modes

| Mode      | Enforced decision                       | Additional behavior                                                        |
| --------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `legacy`  | Legacy path rules                       | Declarations validated; new data maintained; configuration warnings logged. |
| `shadow`  | Legacy path rules except approved fixes | Both engines evaluated; bounded mismatch aggregates recorded.               |
| `enforce` | Scope engine                            | Legacy evidence optionally collected; it never overrides the scope result.  |

The mode is deployment-wide configuration changed through normal deployment
controls. Readiness is evidence, never an automatic mode switch.

### Navigation in each mode

`requiredRoles` configuration remains readable in every mode during the
compatibility window (legacy behavior unchanged). `requiredScope` on
navigation is evaluated in all modes but is authoritative only in `enforce`;
unknown scope keys fail closed there. Shadow differences for navigation are
recorded as bounded mismatch evidence.

### Protected system administrators in legacy/shadow

An effective protected system-administrator assignment maps to the active
brand's legacy Admin role while path rules evaluate. Arbitrary custom scopes
are never translated back into path rules: new custom-role scope effects are
staged and observable, but not authoritative until `enforce`.

## Enforce prerequisites

Enforce readiness requires all of:

- registry and route declarations valid (including installed hook routes);
- migration complete with no unclassified drift;
- every brand has at least one effective brand administrator;
- at least two active, unexpired, unsuppressed system administrators;
- datastore transactions verified (replica set or sharded cluster; a standalone
  MongoDB is not sufficient and authorization writes fail closed with `503`);
- unresolved shadow mismatches classified and approved;
- release gates evidenced: navigation parity, approved security differences,
  performance within the approved budget, build/instance identity, a
  representative shadow window, a rollback rehearsal, and the
  product/security/operations/hook-owner/integrator approvals.

Run `npm run authorization:readiness` for the machine-readable report.

## Rollback

Switching back to `legacy` re-enables path rules without reversing data
migrations; new-service writes have maintained the legacy projection, and
approved security fixes remain enforced in every mode. Users relying only on
new custom-role scopes may temporarily lose those capabilities while rollback
is active; readiness reports this exposure before enforce.

## Solr ACL parity evidence

Record ACL strings and Solr role fields are unchanged by migration because
role keys preserve existing names. The byte-for-byte evidence is produced by
`test/integration/services/AuthorizationPhase3SolrAclParity.test.ts`
(P3-009) in the Docker integration profile (Mongo replica set + Solr from
`support/integration-testing/`): representative record docs (direct-user and
role ACLs, view/edit/empty variants) are persisted through the production
Record model, indexed through the production indexing path, the stored
`authorization_*` fields are read back raw (presence, type, order, and values
preserved with no normalization), the Phase 3 migration and protected
bootstrap run, the docs are refetched via a required successful
`Record.findOne` (no in-memory fallback), Mongo `authorization` fields are
snapshotted before/after, the docs are reindexed, the stored fields are read
back again raw, and the two reads are compared byte-for-byte.

Outside that profile the suite skips honestly: the Solr-dependent case stays
unexecuted and the blocker case records the exact missing dependency
(unreachable core, unconfigured cores, or unavailable search service). A skip
is never reported as a pass, and parity remains an open evidence item until
the integration profile executes it. Gate D CI sets
`AUTHORIZATION_GATE_D_STRICT=1` so a skip fails the gate instead of passing
silently.

## Compatibility retirement

Removal of path rules, legacy AJAX adapters, `requiredRoles` reading, and
emergency `legacy` mode happens only after documented integrator evidence —
never on calendar time alone. See
[Authorization Operations](Authorization-Operations.md) for the operational
tooling.
