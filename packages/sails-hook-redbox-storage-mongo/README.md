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
