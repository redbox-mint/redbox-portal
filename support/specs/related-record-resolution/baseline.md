# RR-01 baseline and shared fixtures

Recorded 3 November 2026, before related-record runtime implementation.

## Checkout and scope

- Repository: `/home/andrew/src/github/redbox-portal`.
- Branch: `feature/related-record-resolution`.
- HEAD: `fa8c7844fb9988ce0444c0b5452b2a5c23f22b5d`
  (`Docs(specs): add related-record resolution design and task plan`).
- Parent/investigation baseline: `d7b7eb479` (`Chore(ci): remove Nexus upload from staging promotion`).
- Initial `git status --short`: empty (clean worktree).
- Node `v22.23.2`; npm `10.9.8`.
- No commits, branch changes, dependency changes or wiki edits made. Builds only
  generated ignored local output. No Mongo instance, containers, mail transport,
  DOI endpoint or browser server was started.

Read root `AGENTS.md`, the core plan, design sections 1, 2 and 11, implementation
plan and RR-01 briefs in `tasks.md`/`tasks.json`. Consulted wiki pages:
`Form-Configuration-Recipe-Populate-From-Related-Record`,
`Configuring-Form-Expressions`, `Form-Event-Bus-Architecture`,
`Form-Configuration-Internals`, `Configuring-Related-Records`,
`Services-Architecture`, `Concurrent-Record-Modifications`,
`Record-Schema-Contract-API`, `ReDBox-Automated-Tests` and
`Coding-Standards-and-Conventions`. Inspected core test setup, Playwright helpers,
current record envelope/relation contracts and package scripts. No new runtime
contract is inferred from these fixtures.

## Exact baseline commands and outcomes

Commands below ran sequentially from repository root unless a working directory
is stated. Output redirection to `/tmp/rr01-*.log` captured logs; those temporary
logs are not required to interpret the results here.

1. `npm --prefix packages/sails-ng-common run compile` — exit 0. Runs
   `tsc -p tsconfig.prod.json`.
2. `npm --prefix packages/redbox-core run build` — exit 2. Runs
   `rm -rf dist && tsc`. Exact diagnostic:

   ```text
   src/controllers/RecordController.ts(1946,15): error TS2339: Property 'checkDiskSpace' does not exist on type '{ default: typeof import("/home/andrew/src/github/redbox-portal/packages/redbox-core/node_modules/check-disk-space/dist/check-disk-space"); InvalidPathError: typeof InvalidPathError; NoMatchError: typeof NoMatchError; getFirstExistingParentPath: (directoryPath: string, dependencies: Dependencies) => Promise<...>; }'.
   ```

   No runtime source was changed to address this unrelated baseline failure.
   Focused core tests below use transpile-only loading; their success does not
   imply the core build passed.

Working directory for commands 3–6: `packages/redbox-core`.

3. Isolated visitor and relationship authorization:

   ```sh
   npm test -- --no-config --fail-zero --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/visitor/related-object-data-inline.visitor.test.ts test/controllers/RecordRelationshipsAuthorization.test.ts
   ```

   Exit 0; **15 passing (141ms)**. Covers projection/order, legacy references,
   limits and authorized tenant-safe graph responses.

4. Focused RecordsService first attempt:

   ```sh
   npm test -- --no-config --fail-zero --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/services/RecordsService.test.ts --grep 'getMeta|getRelatedRecords|record concurrency save pipeline|leaves the non-schema create chain unchanged|preserves baseline'
   ```

   Exit 1; **0 passing, 1 failing (2s)**. Exact failure:

   ```text
   1) RecordsService
        "before each" hook for "should get record metadata":
      Error: Timeout of 2000ms exceeded. For async tests and hooks, ensure "done()" is called; if returning a Promise, ensure it resolves. (/home/andrew/src/github/redbox-portal/packages/redbox-core/test/services/RecordsService.test.ts)
       at processImmediate (node:internal/timers:484:21)
   ```

5. Same selection with explicit setup/test timeout:

   ```sh
   npm test -- --no-config --fail-zero --timeout 10000 --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/services/RecordsService.test.ts --grep 'getMeta|getRelatedRecords|record concurrency save pipeline|leaves the non-schema create chain unchanged|preserves baseline'
   ```

   Exit 0; **23 passing (2s)**. Includes raw/graph delegation, concurrency
   boundaries and disabled-schema create/update/transition/browser-merge behavior.

6. Existing email and DOI suites (mocked side effects):

   ```sh
   npm test -- --no-config --fail-zero --timeout 10000 --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/services/EmailService.test.ts test/services/DoiService.test.ts
   ```

   Exit 0; **61 passing (742ms)**. Includes record notification/template evaluation,
   DOI publication/bindings, error handling and DOI writeback. No live identifiers
   minted or email sent.

7. From repository root: `npm run test:storage-mongo` — exit 0;
   **291 passing (18s), 42 pending**. Package script expands to
   `TS_NODE_PROJECT=test/tsconfig.json mocha --require ts-node/register --require test/setup.ts --extension ts --recursive test`
   in `packages/sails-hook-redbox-storage-mongo`.
   Includes native-write unit doubles, lifecycle CAS, migration, pagination/sort
   and schema-storage tests. The 42 pending cases are the existing Mongo-dependent
   Figshare intent, shared concurrency and pagination integration suites. No live
   Mongo URL was supplied; this is **not actual Mongo persistence evidence**.

The historical missing `express-rate-limit` error was not observed in these
focused runs. Broad core, Angular, PDF, runtime Docker and browser suites were not
run for RR-01; their feature coverage belongs to later tasks.

## Shared fixture contract and checks

Added `packages/redbox-core/test/fixtures/related-records.fixtures.ts` with the
factory `createRelatedRecordsFixtures()`. It has no imports or dependency on future
resolver types. Each call creates fresh mutable data, including independent
before/after snapshots. Consumers adapt these plain objects to their established
runtime/user/storage types and seed their own isolated datastore.

- Generic plan and activity records, two explicit relation identities targeting
  the same activity type, local notes, retained copied/nested/repeatable values.
- Reader/editor/denied users, role vocabulary and separate tenant IDs. Roles are
  test inputs, not an authorization policy or privileged service identity.
- Scalar, object, configurable-key object and ordered mixed-array references with
  duplicate OIDs; expected unique order is explicit.
- ACL-denied and cross-tenant active sources, plus a deleted snapshot kept outside
  active records and a missing ID with no snapshot. Adapters choose tombstone shape.
- Empty string, null, false, zero, empty array, absent fields and distinct literal
  dot/slash/tilde/colon keys alongside nested data.
- Shared source-only-change snapshots (unchanged root/revision/dates/audit), A-to-B
  response race, same-ID refresh, unlink, retained-local-answer and required versus
  optional unavailable-source scenarios. These describe intended acceptance
  behavior; they do not claim the current runtime implements resolution.

Additional commands from repository root:

```sh
./node_modules/.bin/prettier --write packages/redbox-core/test/fixtures/related-records.fixtures.ts
./node_modules/.bin/tsc --noEmit --skipLibCheck --strict --target es2022 --module commonjs --types node packages/redbox-core/test/fixtures/related-records.fixtures.ts
```

Both exited 0. An inline assertion smoke check also exited 0 using
`TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types -r ./packages/redbox-core/node_modules/ts-node/register/transpile-only`.
It checked factory/snapshot isolation, unchanged root and audit for source-only
changes, changed source snapshots, distinct relations to one type, deleted/missing
source exclusion, cross-tenant identity, denied ACLs, literal versus nested keys
and explicit empty-value presence. This checks fixture integrity, not new runtime
behavior.

## Baseline versus new failures and handoff

Baseline failures: core `checkDiskSpace` type error, and default-timeout
RecordsService setup failure (passes with 10-second timeout). Storage integration
pending cases remain unverified. No new failure observed in fixture checks.
Only the fixture file and this baseline document are added; task statuses and all
existing work are preserved. Later tasks must implement and test actual resolution,
persistence exclusion, form races and backend consumers against these scenarios.
