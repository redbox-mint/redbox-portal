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
- `redbox-loader` consumes `registerRedboxModels()`, `registerRedboxServices()`, and `registerRedboxConfig()` from the built entrypoint
- Service/model names remain `MongoStorageService`, `Record`, `DeletedRecord`, and `RecordAudit`

## Configuration

- The storage models use the Sails datastore named `redboxStorage`
- Datastore connection details still live in the host portal’s Sails config
