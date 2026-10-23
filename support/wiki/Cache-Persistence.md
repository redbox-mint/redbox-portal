# Cache persistence architecture and builds

Prisma is the sole persistence owner. Remove every backend selector, including explicit `prisma`. See [persistence migration](Persistence-Migration.md) for configuration and institution hook guidance. Keep the established `datastores.mongodb` connection keys. Startup inspects indexes; use [index preparation](Persistence-Index-Preparation.md) for explicit deployment DDL.

## Public seam and document shape

CacheService and BrandingService use `CacheEntryRepository` and
`getCacheEntryRepository` from the package root. The four operations remain
`findByName`, `create`, `updateByName` and `deleteById`. Hooks should use this plain
JSON/string-ID interface, not private Prisma clients or driver collections.

Prisma uses the existing `cacheentry` collection: BSON ObjectId `_id`, string
`name`, optional JSON `data`, double epoch-seconds `ts_added`, and optional string
`createdAt`/`updatedAt`. Writes supply ISO strings. Missing JSON reads as null;
missing or null timestamps are omitted from the Prisma DTO. Reads never rewrite
raw rows. Omitted create data stores null; omitted update data preserves the
stored field. Partial updates preserve unknown fields and createdAt. There are
no upserts, retries, transactions or bulk rewrites. Existing documents remain readable without rewriting them.

## Ownership and lifecycle

Imports and shim generation open no connections. `preLiftSetup` initializes
persistence after configuration loads, verifies readiness, then initializes
services/migrations. The app persistence runtime creates one lazy Prisma client
per logical datastore, borrowing its existing pool. Compatible connection
policies may share a pool; the core and storage Prisma clients remain distinct.

Cache cleanup invalidates its repository facade. Foundation shutdown drains
resources and accepted operations, closes Prisma clients, then closes owned
pools. Prisma `close()` does not close its borrowed pool. Repeated cleanup is
safe; failed closes retain ownership for retry. Retained repository references
refuse work while draining or after closure.

## Schemas and builds

Both datastore schemas live in `packages/redbox-core/src/persistence/prisma`:
`contract.ts` for core and `storage-contract.ts` for storage. Storage's schema contains record, schema, history and audit models. Core owns the repository contracts and lifecycle,
so the storage hook consumes the generated client without owning a competing
schema/generator. Declare institution extension fields in the appropriate schema.

```bash
npm --prefix packages/redbox-core run generate:prisma
npm --prefix packages/redbox-core run check:prisma
npm --prefix packages/redbox-core run build
```

Commit both generated JSON and declaration files for each schema. Freshness
checks emit to temporary directories and compare without changing committed
artifacts. CI/Docker check before building. Build emits offline, compiles, and
copies both contracts into dist; prepack checks freshness before rebuilding.
Production needs the generated contracts and `@prisma/orm-mongo`, with no CLI or
TypeScript schema source. Pins: CLI **8.0.0-rc.24**, Mongo runtime **8.0.0-rc.19**;
Node **24.16.0**, lock maintenance **npm 11.20.0**. See
[phase-1 evidence](../specs/waterline-retirement/evidence/prisma-phase1.md) for
RC API gaps, exact overrides and ARM64 generation measurements.

## Preserved service behaviour

`set()` remains void, memory-first and best-effort asynchronous. Falsy memory
values trigger persistence reads. Expiry equality, configured database expiry,
per-call local TTL, retained expired rows and notification null reset retain
the pilot behaviour. Preview consumption reads then deletes, including deletion
before HTTP 304 handling; concurrent consumers can receive the same token.
See the [quirk register](../specs/waterline-retirement/quirk-register.md).

Use [hook migration](Cache-Persistence-Hook-Migration.md),
[development rollback](Cache-Persistence-Rollback.md), and
[backup/restoration](Cache-Persistence-Recovery.md) for deployment planning.
