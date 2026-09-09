# Concurrent Record Modifications

ReDBox uses opaque entity tags and storage-level compare-and-swap (CAS) to
prevent unaware whole-record overwrites. This page is the operator and client
runbook for the concurrent-modifications release.

## Record-type policy

Set `concurrentModification.mode` on a record type:

```ts
recordtype: {
  rdmp: {
    concurrentModification: { mode: 'observe' }
  }
}
```

The supported modes are:

- `last-write-wins` (the default): tokenless legacy requests remain compatible,
  but a supplied `If-Match` is still enforced and every write advances the
  revision.
- `observe`: uses the conditional storage path and records tokenless traffic so
  operators can migrate callers before enforcement.
- `strict`: public whole-record mutations require an exact strong `If-Match`.

An invalid policy or a storage adapter without the declared full concurrency
capability fails closed. There is no force flag or runtime bypass for CAS.

### Lifecycle and browser-create compatibility

Delete, restore, and purge follow the same missing-token policy as other
mutations. Under `last-write-wins` and `observe`, a tokenless public request is
accepted for compatibility, but the service still reloads the authoritative
active record or tombstone and passes that revision to every staged lifecycle
CAS. Under `strict`, the same tokenless request is answered `428`. A supplied
exact tag is enforced in every mode, and a stale tag is answered `412`.

The preserved two-argument internal delete overload also reloads the
authoritative snapshot and derives its expected revision. It never falls back
to an OID-only delete.

Generated browser creates have no prior entity tag. Under `last-write-wins` and
`observe`, a legacy caller that omits `X-ReDBox-Form-Fingerprint` remains
compatible. If a caller supplies the fingerprint, it is checked against the
authoritative form/workflow contract in every mode. Under `strict`, the
fingerprint is required; a missing or stale value is answered `409` with
`form-definition-changed` and the current safe fingerprint. Public API creates
remain form-independent. For browser updates, a caller that sends an exact
`If-Match` must also send the form fingerprint issued with that form.

## Browser and API clients

Authorized active-record and tombstone reads return an opaque `ETag` header and
numeric revision metadata. Generated browser forms also return
`formFingerprint`. Treat entity tags as opaque: do not parse or synthesize
them, do not send `If-Match: *`, and do not reuse a tag for a different OID.

Send the exact current tag on metadata, transition, permission,
object-metadata, datastream, delete, restore, and purge mutations:

```http
If-Match: "rb-record-v1.7.<opaque-binding>"
```

Form-backed browser mutations also send the issued
`X-ReDBox-Form-Fingerprint`. A successful response supplies the next `ETag`;
clients must replace their prior baseline and token.

API v1 keeps its legacy body shape but receives the same opt-in status
semantics. API v2 includes the typed result and safe current projection:

| Status | Meaning | Client action |
| ---: | --- | --- |
| 428 | Exact precondition required | Reload, retain local work, and retry intentionally |
| 412 | Record/lifecycle representation changed | Use the authorized latest projection; do not blindly retry |
| 409 | Form/workflow contract changed or lifecycle claim conflicts | Load the current form/state and resolve explicitly |
| 403 | Current authorization no longer permits disclosure | Discard any server projection; do not show deleted/current details |
| 500 | Persistence outcome is unknown | Reconcile by a fresh read or operator recovery; never auto-rebase |

### Browser conflict navigation ownership

The form project in this repository is an Angular application, not a routed
feature module. `FormModule` bootstraps `FormComponent` directly into the
`<redbox-form>` element emitted by the server-rendered edit/view templates, and
it deliberately has no Angular Router configuration. The component's native
`beforeunload` listener is therefore the active protection when a user leaves a
shipped form page with unresolved in-memory conflict work.

`formConflictCanDeactivateGuard` is an exported integration contract for a
downstream host that renders the form through an Angular route. Exporting the
guard does not register or activate it. Such a host must attach it explicitly:

```ts
const routes: Routes = [
  {
    path: 'records/:oid/edit',
    component: FormComponent,
    canDeactivate: [formConflictCanDeactivateGuard],
  },
];
```

An SPA form route that omits that registration has no Angular route-change
protection from this package. The native `beforeunload` listener remains in
place for document-level navigation.

## Storage adapters and hooks

Custom storage adapters must advertise the versioned full record-concurrency
capability only after passing the exported storage conformance checks. They
must provide atomic active CAS, permanent OID ownership/incarnation claims,
conditional tombstone create/update/remove, conditional active removal, and
conditional restore creation. A returned mutation state is mandatory:
`applied`, certified `not-applied`, or `unknown`.

The bundled Mongo adapter requires unique `redboxOid` indexes on the active
record, tombstone, and `recordidentity` collections. It does not emit its ready
event or advertise the concurrency capability if any required index cannot be
created. Before rollout, inspect active records for duplicate OIDs and inspect
the existing active `redboxOid_1` index options. If an older non-unique index
uses that key, back up and drain every writer, resolve any duplicates, remove
only that verified non-unique index, and lift one new-version instance to create
the required unique index. Do not attempt this index replacement while any
application instance is serving writes.

Pre-save hooks may validate or transform an in-memory candidate, but must not
perform non-idempotent external effects. Post-commit work runs only after
confirmed persistence. Internal writers load an authoritative snapshot and use
the normal conditional service boundary. Retry is allowed only through the
bounded `mutateMetaInternal` contract when the mutation is explicitly
idempotent and recomputable; every attempt reloads authorization and state.

If the mandatory post-commit reload fails after persistence was confirmed, the
save result is `saved-with-warnings` with
`record-post-commit-reconciliation-deferred`. The response clears its projected
record data, retains only the last confirmed concurrency coordinates, and does
not claim that indexing or audit reconciliation completed. Operators should
obtain a fresh authoritative read and retry the projection/index/audit
reconciliation before treating the operation as fully complete.

## Lifecycle and attachment recovery

Delete, restore, and purge use durable tombstone stages such as
`delete-pending`, `restore-pending`, `purge-pending`, and `recovery-required`.
Startup recovery verifies the operation identity, incarnation, state, and
revision before acting. Never edit these rows manually while instances are
serving traffic.

An explicit OID is permanently claimed in the `recordidentity` collection.
Purging a tombstone does not release that claim, so an old revision-0 entity tag
can never alias a recreated incarnation. The one exception is compensation: when
a create claims an OID and its insert then fails without leaving any active
record or tombstone behind, storage releases that unused claim so the
caller-selected OID does not become permanently unusable. A claim is never
released while any state still refers to it, or while that state cannot be
observed. A network, timeout, write-concern, or otherwise ambiguous active
insert retains its reservation because a late commit may still appear; retries
then receive an OID collision instead of racing a second incarnation.

To recover an ambiguous unused reservation, first drain all writers and retain
a database backup. Read the exact `recordidentity` row and check both the active
and tombstone collections for the OID using an authoritative read. If either
record exists, retain the ledger row and reconcile its `incarnationId`; it is a
committed lineage, not an unused reservation. Only when both collections are
confirmed empty and the original create outcome has been reconciled as a
non-write may an operator remove the single ledger row using both its
`redboxOid` and `incarnationId` as the selector. Record that intervention, then
retry the create. Never delete a ledger row for an OID that has ever reached an
active record or tombstone.

Rejected attachment staging is memory/object-storage state, not a browser or
server draft. Cleanup only claims cancelled expired generations after
`record.attachments.stagingExpiryMs` (default seven days), rechecks active and
unresolved references, and retains the object whenever state is uncertain.

## Telemetry, metrics, and privacy

Structured `record_concurrency_event` logs contain bounded route, write,
policy, revision-coordinate, safe-code, resolution, and outcome fields. They do
not contain OID, username/actor/request identifiers, submitted metadata, raw
headers, credentials, storage paths, field paths, or raw exception text.
Routine successful concurrency events are logged at INFO. WARN is reserved for
conflicts, unknown or incomplete outcomes, exhausted recovery, and other
events carrying a safe problem/error classification.

The release emits these OpenTelemetry counters:

- `record_concurrency_precondition_total`
- `record_concurrency_conflict_total`
- `record_concurrency_resolution_total`
- `record_concurrency_internal_retry_total`
- `record_concurrency_lifecycle_recovery_total`

Metric labels are low-cardinality enums only. OID, username, actor, request ID,
revision, and field path are never labels. Rejected attempts create no mutation
audit. Successful audit entries carry the final revision and normalized
resolution; actor identity remains protected audit data and is not rendered in
the conflict UI.

## Coordinated deployment and rollback

1. Back up the database and run the revision/tombstone migration with exactly
   one lifting instance.
2. Complete the unique-index preflight above, including replacement of an old
   non-unique active OID index while every writer remains drained.
3. Deploy compatible code to every application instance with the default mode
   unchanged.
4. Verify the storage capability, permanent `recordidentity` index, lifecycle
   recovery, and absence of old-version traffic.
5. Enable `observe` on selected record types and inventory tokenless callers.
6. Migrate those callers to exact tag discovery and submission.
7. Enable `strict` on one canary record type; inspect conflict, retry, recovery,
   and unknown-outcome metrics before expanding.

Before application rollback, return affected record types to a mode understood
by the old release. Then drain all new instances before starting old code. A
single mixed-version instance invalidates the strict guarantee.

## Release scope and deferred work

This release adds active/tombstone revisions, permanent OID incarnation
ownership, exact public preconditions, form fingerprints, typed conflict
responses, safe browser conflict review, conditional internal writers,
lifecycle recovery, attachment staging cleanup, telemetry, and adapter
capability checks.

Durable request idempotency, live editor presence, stable repeatable-row
identity, server-side rebase, and persistent browser/session/server conflict
drafts remain explicitly deferred.

The repository contains focused test and contract artifacts recorded in the
implementation task tracker. Only checked `Run` rows in W12 assert that a suite
was actually executed. The remaining focused Angular checks, browser
automation, live-Mongo multi-instance races, full repository suites, builds,
and deployment/canary gates remain open until their corresponding W12 rows are
explicitly completed.
