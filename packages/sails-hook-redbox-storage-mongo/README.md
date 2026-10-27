# ReDBox MongoDB Storage Plugin

This package provides the MongoDB-backed Prisma storage service and config registrations for ReDBox Portal.

## Monorepo workflow

- Build the package with `npm run build`
- Run the package unit suite with `npm run test`
- Use the root aliases from the repository root when you want monorepo wiring checks:
  - `npm run compile:storage-mongo`
  - `npm run test:storage-mongo`
- End-to-end storage behaviour is covered by the root integration suites:
  - `npm run test:mocha`
  - `npm run test:bruno:general`

## Runtime integration

- The package builds from `src/` to `dist/`
- The public `/extension` entry exports `registerRedboxExtension()`. The host selects its named storage module and binds its explicit dependencies before initialization.
- `MongoStorageService` uses the declared core storage Prisma contract; model globals and registration are removed.

## Configuration

- Storage uses the logical datastore named `redboxStorage`
- Set `datastores.redboxStorage` in the host's explicit v6 configuration module; select it with `REDBOX_APPLICATION_CONFIG`.

## Prisma persistence

All storage operations use Prisma. Remove `persistence.groups.storage.backend`,
`RBPORTAL_STORAGE_BACKEND` and equivalent Sails environment settings, including
explicit `prisma` values: startup rejects obsolete selectors. Keep connection
settings under `datastores.redboxStorage`; remove ORM adapter/migrate settings.
See [institution migration](../../support/wiki/Persistence-Migration.md) for
retired model registrations, mapping overrides and safe shim cleanup.

Prisma owns Record/DeletedRecord, permanent recordidentity, CAS/lifecycle/source
intents, authorization/U participation, Counter atomic allocation, attachment
metadata/OID rebind, schemas and audits. GridFS bytes remain on the driver under
ADR 0004, borrowing app-owned pools. Multi-step write order and partial failures
remain; no transactions are introduced.

Stop writers and run `npm run persistence:indexes -- --inspect`, review reports,
explicitly `--ensure`, then inspect before restarting. S requires 35 scopes,
including Counter global-name uniqueness; duplicates block preparation without
cleanup. See [storage persistence](../../support/wiki/Staged-Storage-Persistence.md).

## Record revision migration

This hook registers the restart-safe
`@researchdatabox/sails-hook-redbox-storage-mongo:20260823T000000-backfill-record-revisions`
migration. It installs the initial server-owned revision on active records and
the revision plus `deleted` lifecycle state on legacy tombstones. It does not
touch record metadata, workflow, authorization, `lastSaveDate`, or search
documents.

Run an upgrade with exactly one initializing portal instance, let migrations finish,
and only then start the remaining instances. The repository migration runner
has no distributed migration lock. Back up the database first; do not use
any migration-skip override; v6 has no such startup mode.

## Storage concurrency capability

Strict record types require a storage adapter to expose `getCapabilities()` and
return the supported `recordConcurrency` version token from
`@researchdatabox/redbox-core`. An absent method, absent field, unknown version,
or a non-Mongo dialect without native atomic operations is unsupported and
fails closed.

The capability covers these adapter methods:

- `create(..., options?)`: strips client revision and initializes a server revision;
- `updateMeta(..., options?)`: atomic active compare-and-set plus increment;
- `removeActiveRecord(..., options?)`: atomic conditional removal returning the removed state;
- `updateTombstone(..., options?)`: atomic restore/purge claim plus increment;
- `removeTombstone(..., options?)`: atomic conditional restore finalization/purge.

Every existing signature keeps its optional concurrency options last for source
compatibility. A supplied `expectedRevision` must always be honored. A
certified no-match returns `not-applied` with a bounded
`nonApplicationReason`; a thrown or unrecognized fact after dispatch returns
`unknown`. Adapters must never fall back to an OID-only success path
after advertising strict capability.

Hook-provided adapters must verify these guarantees against their real
datastore/dialect before declaring capability. The bundled Mongo adapter does
so in `test/integration/MongoStorageConcurrency.integration.test.ts`.

## Pagination regression tests

Record and deleted-record lists append `_id` to the requested sort so equal
timestamps or titles have a consistent order across pages. CSV and JSON exports
use `lastSaveDate` descending, then `_id` ascending. This does not provide a
snapshot if matching records are inserted, deleted, or updated during pagination.

The optional Mongo integration tests seed 3,068 records with repeated timestamps
in a temporary database and check both list methods and export formats. Run the
package tests in a Docker development environment with `MONGO_TEST_URL` pointing
to a test Mongo server:

```bash
cd packages/sails-hook-redbox-storage-mongo
MONGO_TEST_URL=mongodb://mongodb:27017 npm test -- --timeout 30000
```

Without `MONGO_TEST_URL`, the Mongo integration tests are skipped. The tests
remove only the uniquely named database they create.
