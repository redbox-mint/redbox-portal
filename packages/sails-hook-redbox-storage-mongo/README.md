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

## Optional record query controls

`getRecords()` accepts a trailing `RecordQueryOptions` object. Omitting it keeps
existing filters, role handling, sort, offset and total-count behavior. These
controls are available to any storage caller:

- `anyOf`: up to 20 `{ field, value, match }` predicates, ORed together and ANDed
  with all existing filters, brand and ACL restrictions. `match: 'contains'`
  performs a literal case-insensitive substring match; `match: 'exact'` uses
  equality. Values are limited to 1,024 characters and field paths are validated.
- `afterOid`: an exclusive OID cursor; use `null` for the first batch. It selects
  binary `redboxOid` ascending order, requires a zero offset and 1–100 rows,
  excludes Mongo `_id`, and applies a five-second database-query limit.
- `count: false`: skips counting matches; `totalItems` remains zero and does not
  represent a calculated total. Counts remain enabled by default.
- `authorization: 'record-view'`: resolves canonical brand role IDs and supports
  legacy flattened ACLs consistently with `RecordsService.hasViewAccess`,
  including edit grants that imply view. Legacy authorization stays the default.

Email-template preview search uses these options on the existing storage API
for literal title substrings or exact `redboxOid`, without consulting Solr.
Core rechecks record-view access before visible page offsets and the single
lookahead used for `hasMore`. Deploy the rebuilt core and storage packages
together; custom storage adapters used for this endpoint must honor the options.
Other record searches retain their defaults.

The configured compound index `{ 'metaMetadata.brandId': 1, redboxOid: 1 }` is
created by normal storage initialization, including `migrate: safe` deployments.
It bounds scans to one brand and supports OID ordering. Arbitrary title
substrings cannot use a normal title index, so broad title searches still scan
that brand's candidates.

The real-Mongo regression suite exercises core, authorization, and this adapter
with Solr unavailable/stale, including permission-filtered pagination. After
building core, run it using the same isolated-database convention as the other
Mongo integration tests:

```bash
cd packages/sails-hook-redbox-storage-mongo
MONGO_TEST_URL=mongodb://127.0.0.1:27017 npm test -- --node-option no-experimental-strip-types --timeout 30000
```
