# Active record-definition resolution

B06 connects record-type and workflow reads to immutable published aggregates.
`RecordDefinitionRuntimeService.resolve(brandId, recordTypeKey)` returns the active
revision and a small runtime identity projection, or `null` when no revision is
active. It never reads the draft collection or returns lifecycle-operation payloads.
An invalid pointer, missing revision, hash mismatch, or unavailable action fails
closed; there is no fallback to an older cached revision.

Use `RecordTypesService.get(brand, name)` at the start of a record operation and
pass that returned object to `WorkflowStepsService`. Settings, lifecycle actions,
automatic transitions, and workflow stages then come from the same aggregate,
even if another request publishes during the operation. Existing records use the
active definition when the next operation resolves their type; they are not pinned
to historical revisions. Field selection happens after active resolution. The
existing observable service interfaces remain available.

The runtime projects labels, search settings, relationships, responsibility rules,
validation and concurrency policies, action bindings, and automatic graph edges
into the existing service shapes. Deployment-owned package/search-core fields
come from the identity. This work does not add the B07 manual transition service,
B08 secret storage, or B10/B11 seed and migration behavior.

## Cache and convergence

The mutable active pointer has **zero cache lifetime**: each resolution reads it
from the shared datastore. Use the normal primary MongoDB read preference; a
lagging read replica would add replication lag outside this guarantee. Each node
caches at most 64 schema-bounded immutable revisions, keyed by brand, type,
storage identity and canonical immutable revision ID. Revision IDs include the
revision number. Cached revision trees are frozen. Record-type projections are
separate copies; operation snapshots are associated through weak references.

Publication and rollback invalidate the local revision entries, including recovered
activation. Other instances detect the new shared pointer on their next resolution,
without a timer, invalidation subscription or restart. A read overlapping publication
may finish with the complete old aggregate. A read begun after the pointer commit
observes the new aggregate. In-flight reads cannot repopulate a stale pointer cache
because no such cache exists. Datastore failures do not extend a stale cache lifetime.
Retirement metadata is also read fresh; retired definitions remain resolvable for
existing records while the existing creation fence prevents new record creation.

`RecordTypesService.getAllCache(brand)` is deprecated and only returns a defensive
copy of the bootstrap snapshot for the matching brand, for at most one second
measured by a monotonic clock. Missing/wrong brands, expiry and local publication
invalidation return an empty list. Runtime callers must use `getAll(brand)`.

## Readiness

The generated bootstrap calls `RecordDefinitionRuntimeService.assertReady()` after
core and hook bootstraps and before reporting successful lift. Deployment readiness
probes can invoke the same service method repeatedly: every call re-reads active
identities from shared storage. A rejected promise means the node is not ready.
This service seam does not add a public HTTP health endpoint.

The check covers all brands, including retired types, and verifies both actual
bindings and the stored action-contract manifest against the node's immutable
registry. Missing, unsupported-version and retired actions fail readiness. Runtime
resolution performs the same check, including on cache hits, so an old node cannot
execute incomplete behavior after a new publication. Draft-only missing actions
and unavailable actions in inactive history do not affect readiness; draft
publication validation remains authoritative.

Deploy action implementations on every node before publishing definitions that
reference them. The default runtime uses the loader-owned `sails.config.actionRegistry`, as do
publication and record execution. The optional constructor registry is a code-owned
seam for isolated node/conformance tests.

Until B10/B11 migrations run, untouched legacy identities (no active pointer,
no draft, version zero) retain their existing read behavior. Managed unpublished
types are excluded from runtime lists and cannot fall back to mutable workflow
rows. No draft aggregate is treated as legacy configuration.

See [B06 evidence](../specs/record-type-workflow-administration/b06-evidence.md)
for validation commands and adversarial coverage.
