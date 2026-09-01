# ReDBox MongoDB Storage Plugin

This package provides the MongoDB-backed storage service, models, and config registrations for ReDBox Portal.

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
- The `@researchdatabox/redbox-core` loader consumes `registerRedboxModels()`, `registerRedboxServices()`, and `registerRedboxConfig()` from the built entrypoint
- Service/model names remain `MongoStorageService`, `Record`, `DeletedRecord`, and `RecordAudit`

## Configuration

- The storage models use the Sails datastore named `redboxStorage`
- Datastore connection details still live in the host portal’s Sails config

## Record revision migration

This hook registers the restart-safe
`@researchdatabox/sails-hook-redbox-storage-mongo:20260823T000000-backfill-record-revisions`
migration. It installs the initial server-owned revision on active records and
the revision plus `deleted` lifecycle state on legacy tombstones. It does not
touch record metadata, workflow, authorization, `lastSaveDate`, or search
documents.

Run an upgrade with exactly one lifting portal instance, let migrations finish,
and only then start the remaining instances. The repository migration runner
has no distributed migration lock. Back up the database first; do not use
`REDBOX_SKIP_MIGRATIONS=true` for a strict-concurrency rollout.

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
`unknown`. Adapters must never fall back to an OID-only Waterline success path
after advertising strict capability.

Hook-provided adapters must verify these guarantees against their real
datastore/dialect before declaring capability. The bundled Mongo adapter does
so in `test/integration/MongoStorageConcurrency.integration.test.ts`.
