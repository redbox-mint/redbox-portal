# Branding persistence

B owns BrandingConfig in the configured `mongodb` datastore and
BrandingConfigHistory in `redboxStorage`. Prisma is the sole owner. Remove selectors and model registrations; see [persistence migration](Persistence-Migration.md). Unsupported fields must be declared in the contract and callbacks ported to services.

Follow [index preparation](Persistence-Index-Preparation.md) before upgrading on existing volumes. Inspect, review, explicitly ensure and inspect again
while branding/migration writers are stopped. Startup only inspects. B adds two
nonunique lookup indexes on their respective existing datastores. Never infer
history uniqueness from model declarations, delete duplicates or relocate history.
Two logical databases on one server and two separate servers are supported.
No transaction, session or topology conversion is introduced.

Publication inserts history before conditionally updating the active brand by
version and draftRevision. TX-PARITY-01a permits Prisma's model conditional
update; stale writers return the existing conflict and attempt history removal.
Certified-not-applied errors permit compensation. Transport errors may follow an
applied write: keep history, inspect active version/hash/revision and retained
snapshots, then use the existing publication retry. A reported error does not
prove rollback. Cache refresh, retention and external cleanup are separate effects.

Restore regenerates CSS, verifies font bytes and allocates a new increasing
version. It retains current logo/favicon metadata. Missing/corrupt fonts block
restore before active mutation. Logo bytes can be overwritten before metadata
failure; ambiguous favicon cleanup can remove a newly referenced object.
Reinstate matching known bytes/metadata before resuming delivery. Preview
consumption remains read-then-delete through the cache repository.
See every preserved/improved quirk in the [register](../specs/waterline-retirement/quirk-register.md).

Drain editors, publication/restore requests, migrations and asset reconciliation;
checkpoint both logical databases with configuration/hooks and primary-disk
font/logo/favicon objects at the same stopped-writer boundary. Separate-server
backups require that boundary across both servers. Test restores in isolated
namespaces, preserving BSON/indexes, and verify asset hashes and public reads.
The typeface migration's history pruning is irreversible without a backup.
A backend switch neither restores data nor reconstructs missing objects.

There is no runtime backend switch. Recovery requires a compatible deployment image/checkpoint and reconciliation of later writes and external effects.

Phase 4 uses separate app-owned Prisma clients for the core and storage contracts,
including separate servers. History stays in redboxStorage. Obsolete `mongodb`
selectors are rejected with index/migration guidance. Missing optional model
reads may be null; patches only write supplied fields. Both pending migration
bodies and V brand-name resolution use B repositories. The frozen sidebar
operation alone bypasses the current CSS allowlist, using variable-only model
patches without audit/CSS/hash/version changes. Typeface backfill tests physical
field presence and is idempotent. History named queries use the storage client.
