# Mongo GraphQL collection migration

Implemented in the managed checkout
`/home/andrew/.t3/worktrees/redbox-portal/t3-f9cf0af7-e8cf14b92f8bbc94`, on
`t3/graphql-mongo-collections`. No push or PR was made. The parent checkout and
its `support/development/.env` were not edited.

## Baseline

- Starting task head: `c117226588888d229e74e43f7e0438308641fd69`.
- Fetched develop: `70b36c611`.
- Merge commit: `27f52931f9f1e3ea9b5358c44da04aadcb838156`.
- The branches had overlapping GraphQL metadata changes. Conflicts were resolved
  to develop's integrated implementation; the merge tree exactly matched develop.
- Implementation is the commit containing this report; compare it to the merge
  commit to inspect the migration alone.

## Design

`StorageService.executeRecordCollection` accepts authenticated server context,
trusted compiled read contracts, the bounded GraphQL filter/sort DSL, a normalized
continuation position, and a request deadline. It never accepts a Mongo pipeline,
operator or arbitrary storage path. The Mongo hook exports this optional storage
capability; other providers fail with `COLLECTION_UNAVAILABLE` when it is absent.

Discovery and execution share the catalogue derived from readable contracts.
Compatible scalar leaves present in all selected variants gain operations without
index mappings. Private, opaque, incompatible and repeating paths remain excluded
from filtering and sorting. Nested object keys use exact `$getField` expressions;
arrays cannot implicitly supply values to scalar declarations. DateInputComponent
adds a `date` or `date-time` format annotation according to its model's `dateOnly`
configuration while retaining its existing string schema.

Mongo matches brand, type, configured workflow stages, and viewer/editor user or
canonical brand-role grants before returning candidates. Admin has no record ACL
bypass; Guest/public role grants require the caller's canonical Guest role.
Legacy flat ACLs apply only without nested authorization. Metadata operations also
require an exact registered stage/form pair. Runtime hydration retains
`hasViewAccess` and defensive brand/type/stage/form checks. Access overrides can
restrict the base predicate but cannot broaden it.

Normalized scalar values define both filtering and sorting. Null, absent and
invalid scalar values form one missing bucket. Arrays/objects and numeric strings
are not coerced. Dates normalize BSON dates, offset strings, calendar dates and
legacy timezone-less timestamps to UTC milliseconds. Invalid dates and numeric
epochs are missing. Text operators escape regex syntax; IPREFIX folds ASCII case
only, preserving literal Unicode and controls (including NUL).

Encrypted authenticated keyset cursors carry the normalized sort tuple, with OID
as the deterministic tie break. They bind actor, roles, brand, portal, type,
stages, normalized filters/sorts, page size and readable-schema revision. The new
cursor domain intentionally invalidates old Solr cursors. A visible lookahead is
required before reporting `hasNextPage`; sparse defensive denials fail explicitly
at the work bound instead of returning misleading continuation metadata.

Each aggregation uses simple binary collation, at most 5,000 ms capped by the
request deadline, no disk spill, 50 projected candidates and bounded result bytes.
The resolver retains its 200-candidate and overall query budgets. Oversized sort
keys fail explicitly. No totals, speculative indexes or performance claims were
added. Solr's full-text and exact ACL behavior outside GraphQL is retained.

## Changed areas

- Core collection types, catalogue, query validation/cursors, Mongo compiler/provider,
  GraphQL resolver wiring and optional storage interface.
- Mongo storage hook capability and exports.
- Date component contract annotation.
- Removed grid Solr fields/configuration, structured adapter, protected copies,
  companion generation and index-binding helper; retained unrelated Solr behavior.
- GraphQL/Mongo regression fixtures and tests; removed obsolete Solr-specific tests.
- Saved-grid, named-query/promotion and cold-start fixtures no longer prepare or
  populate a grid Solr index. Updated obsolete sparse-index expectations.
- Wiki setup/filter/pagination/migration guidance and Bruno fixture notes.

## Verification

Builds passed after compiling the RVA prerequisite:

```bash
npm ci --ignore-scripts --strict-peer-deps
npm run compile:rva
npm run compile:server
npm run compile:core
npm run compile:storage-mongo
node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
```

The initial server build exposed the unbuilt local RVA package; the subsequent
server build passed. No package manifest or lockfile changed. The minimum backend
rebuild required by the wiki, the Mongo hook build and the wider server build were
performed. No Angular source changed.

Package checks:

- `npm --prefix packages/redbox-core run test:record-graphql`: **110 passing**,
  including its TypeScript check, contract discovery/privacy, validation, cursor
  context/tampering/expiry and old Solr cursor invalidation.
- `npm --prefix packages/sails-hook-redbox-storage-mongo test`: **325 passing,
  67 pending**. The package's conditional tests remain skipped; actual Mongo
  collection execution is verified in the Docker suite below.
- From `packages/redbox-core`, with `TS_NODE_PROJECT=test/tsconfig.json`:
  `../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types
  --require ts-node/register/transpile-only --require chai --require test/setup.ts
  test/unit/record-contract/compiler.test.ts`: **27 passing**.
- Same Mocha options with `test/services/SolrSearchService.test.ts`:
  **123 passing** (the earlier package-local Mocha binary was present for this run).
- `npm run test:named-query:types`: passed, also required by the Docker runner.
- Oxlint on all 16 affected source files: **0 warnings, 0 errors**.
- `git diff --check`: passed.

Docker command (newline-separated paths are intentional for the runner's `mapfile`):

```bash
COMPOSE_PROJECT_NAME=redbox-graphql-mongo-task \
RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/RecordGraphqlService.test.ts\ntest/integration/services/RecordGraphqlGrid.test.ts\ntest/integration/services/NamedQueryExecution.test.ts\ntest/integration/services/SavedGridService.test.ts\ntest/integration/services/NamedQueryPromotion.test.ts\ntest/integration/services/NamedQueryColdBootstrap.test.ts' \
npm run test:mocha:mount
```

On this host Docker requires passwordless sudo. A temporary `/tmp` PATH wrapper
ran `sudo -n --preserve-env=COMPOSE_PROJECT_NAME,RBPORTAL_MOCHA_TEST_PATHS,RBPORTAL_IMAGE,CI
/usr/bin/docker` so the npm runner retained its isolated project and exact scope.
The committed Compose stack and its pinned images were used. The runner includes
the bootstrap test, webpack build and named-query lifecycle type check, and cleans
up its disposable stack with volumes.

The first complete Docker run reported 59 passing / 2 failing. Real Mongo exposed
an embedded-NUL regex incompatibility, fixed by escaping NUL as `\x00`. The other
failure was an overly strict assertion: a foreign brand with no readable contracts
fails as `UNKNOWN_RECORD_TYPE` before cursor decoding. Both were corrected. The
final focused Docker run passed: **62 passing (4 minutes), exit code 0**.
All disposable project containers and its network were removed by the runner.

The Mongo assertions cover unindexed creation/update visibility with search
configuration removed, ACL filtering before hydration, canonical role/user/Admin/
Guest and legacy ACL behavior, brand/type/stage/form defenses, scalar/null/array
normalization, literal prefix/contains/IN/ranges, date formats and date keysets,
compound/duplicate/null sort keys, cursor context changes and storage failures.
Sparse runtime access overrides are tested for correct exhaustion and explicit
bounded failure. Saved queries, promotion, report paging/CSV and two-process cold
bootstrap/restart execute against real storage.

## Limits

Pagination is not a snapshot. Concurrent changes between candidate selection,
hydration and later pages can change membership or order. Custom access overrides
that reject more than the bounded scan can prove cause `COLLECTION_LIMIT`.
Large continuation keys fail instead of truncating their sort meaning. MongoDB
5.0 or later is required for exact-key expressions. No institution-specific
production performance or index assessment was performed. Frontend applications
were not changed or rebuilt; the Docker runner builds its required webpack assets.


The final Docker log is `/tmp/graphql-mongo-docker-final.log`; package logs are
`/tmp/graphql-mongo-unit-final.log`, `/tmp/graphql-mongo-storage-unit.log`,
`/tmp/graphql-mongo-solr-unit.log`, and `/tmp/graphql-mongo-contract-unit.log`.
Build logs are `/tmp/graphql-mongo-build.log`, `/tmp/graphql-mongo-storage-build.log`
and `/tmp/graphql-mongo-final-core-build.log`. These local logs are not committed.
Runner-generated changes to the integration Compose config shims were restored.

## File manifest

```text
packages/redbox-core/src/StorageService.ts
packages/redbox-core/src/config/recordGraphql.config.ts
packages/redbox-core/src/config/solr.config.ts
packages/redbox-core/src/index.ts
packages/redbox-core/src/record-contract/core-contributors.ts
packages/redbox-core/src/record-graphql/catalogue.ts
packages/redbox-core/src/record-graphql/collection.ts
packages/redbox-core/src/record-graphql/grid-schema.ts
packages/redbox-core/src/record-graphql/grid-types.ts
packages/redbox-core/src/record-graphql/index-bindings.ts
packages/redbox-core/src/record-graphql/mongo.ts
packages/redbox-core/src/record-graphql/schema.ts
packages/redbox-core/src/services/RecordGraphqlService.ts
packages/redbox-core/src/services/SolrSearchService.ts
packages/redbox-core/test/fixtures/record-grid.fixtures.ts
packages/redbox-core/test/services/SolrSearchService.test.ts
packages/redbox-core/test/unit/record-graphql/grid.test.ts
packages/redbox-core/test/unit/record-graphql/iprefix.test.ts
packages/redbox-core/test/unit/record-graphql/mongo.test.ts
packages/redbox-core/test/unit/record-graphql/read-privacy.test.ts
packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts
support/specs/graphql-record-metadata/mongo-collections-implementation.md
support/wiki/Configuring-Solr.md
support/wiki/Record-GraphQL-Grids.md
test/bruno/2 - AJAX calls/6 - Named Query Assistance/15 - Prepare visual exploration.bru
test/integration/helpers/named-query-lifecycle.worker.ts
test/integration/services/NamedQueryColdBootstrap.test.ts
test/integration/services/NamedQueryExecution.test.ts
test/integration/services/NamedQueryPromotion.test.ts
test/integration/services/RecordGraphqlGrid.test.ts
test/integration/services/SavedGridService.test.ts
```
