# Ponytail simplification evidence

Base: `28d386fb808a4054940bf039c6b12b32a2e949e5`. Branch: `t3/waterline-ponytail`. No push, PR, retirement-branch rewrite, other-worktree mutation or smoke-stack operation.

All 26 findings were implemented; two use an adjusted implementation described below. ADR 0004 remains in force: model API first, named-query/catalog/audit raw exceptions, direct GridFS, no transactions, unchanged physical collections/contracts and exact dependency pins.

## Actual line changes

Code delta: **-3,463 lines**, versus the review estimate **−3,004**. Measured with `git diff 28d386fb8 --numstat`, excluding `support/specs/**`, Markdown and lockfiles. Tests, wiring, comments and blank lines in code files are included. Shared/overlapping edits count once; phase check fixes are assigned to their finding. A file-to-symlink change counts its one link-target line.

| Finding | Status | Actual net lines | Result / adjustment |
| --- | --- | ---: | --- |
| 1 | Applied | -800 | Shared app-owned group registry, readiness, operation admission, drain and stale-handle checks; concrete factories remain lazy. |
| 2 | Applied | -382 | One closed named-query catalogue/executor for R/Q/progress/V/B; identity/record semantics, tenant scope, decoder/field allowlists remain. |
| 3 | Applied | -234 | Common inspect/ensure skeleton, version/collation guard, legacy alternatives and Figshare audit callback. Added a late-failure DDL barrier regression. |
| 4 | Applied | -188 | Forwarding methods bind from storageOperations in the service constructor; stream/Observable calls stay synchronous. |
| 5 | Adjusted | -186 | One canonical dev-tools template; the integration resource is a relative symlink, so Compose follows it without a second copy or generation step. |
| 6 | Applied | -170 | One inspect/ensure entry per group; all groups are inspected before any DDL. Storage composes its two owners. |
| 7 | Applied | -159 | Shared schema-order field loop replaces Waterline diagnostic/order/batch wording; required/default/enum rules and callbacks remain. |
| 8 | Applied | -113 | Removed every named dead function, pipeline, diagnostic/classifier and staged/baseline list; kept missing-run counter assertions. |
| 9 | Applied | -102 | Deleted the Figshare physical metadata table; preflight names figsharesync explicitly. |
| 10 | Applied | -111 | Prisma model rows use one _id-to-id mapper; String(_id) also handles BSON identities returned by typed counter pipelines. Raw named-query decoders and domain write checks remain. |
| 11 | Applied | -84 | Prisma first-match reads, conditional updates and returning deletes replace read-two/count/read-before-write compatibility checks. Identity limits one before population. |
| 12 | Applied | -88 | Cache index is a PersistenceIndex using common catalog, duplicate inspection and ensure; cache retains its small report/diagnostic adapter. |
| 13 | Adjusted | -54 | Public attributes derive from repository row fields with Omit and populated-relationship overrides. A mapped helper removes the repository index signature so Omit retains named fields and the public shapes. |
| 14 | Applied | -74 | Direct runtime re-exports replace lazy forwarding functions; concrete factories/preflights remain deferred for offline imports. |
| 15 | Applied | -90 | Module exports replace private namespace aliases; Source/Category share requireTrimmed with an entity label. |
| 16 | Applied | -56 | Removed constant backend maps, cache selector wrapper, singleton type and obsolete backend arguments/comparisons; configuration is checked at shared startup. |
| 17 | Applied | -33 | One descriptor-based suppliedDataProperties helper rejects symbols/accessors/non-enumerable or non-plain inputs, omits undefined and copies with safe own properties. |
| 18 | Applied | -4 | One domain operation helper handles passthrough, duplicate mapping and bounded fallback; callback/identity policies remain separate. Long diagnostic strings and formatter layout make the physical-line saving smaller than estimated. |
| 19 | Applied | -230 | One concrete PrismaStorage owns schema/audit/record/GridFS behavior; factory/lifecycle guard remains a small separate module. |
| 20 | Applied | -40 | Deleted impossible/zero-ID predicates and invalid-IN filtering; explicit malformed model IDs reach Prisma. Username/slug alternatives route explicitly; scoped slug/fallback regressions cover both routes. |
| 21 | Applied | -48 | Plain async list/options replaces fake cursors; dotted-sort typed fallback and schema projections remain. Removed hint/maxTimeMS options that the Prisma adapter already ignored; authorization deadline remains. |
| 22 | Applied | -136 | Cache registers and cleans up through the common persistence resource lifecycle; startup waits and stale handles remain covered. |
| 23 | Applied | -45 | Closure-backed Figshare repository replaces class-to-factory forwarding, injected readiness callback and internal no-op awaits; shared lifecycle owns the public assertReady seam. |
| 24 | Applied | -13 | Capabilities depend on initialized typed handles and required index readiness; retained capability version and pre-init refusal. |
| 25 | Applied | -12 | Related-record builder emits $in directly; removed nativeCriteria. |
| 26 | Applied | -11 | Plain model equality predicates replace prismaModelEquals. Union-typed Prisma collection handles also remove redundant per-model update dispatch tables. The intentional all-workflow bootstrap reset retains an explicit _id-exists filter because Prisma rejects empty write filters. |

## New quirks

F-PNY-01: first-match singular operations and direct conditional writes/deletes. F-PNY-02: concise schema-order B/V validation and shared null/coercion rules. F-PNY-03: Prisma rejection for malformed model IDs, with explicit username/slug routing. F-PNY-04: Prisma-owned model decoding. F-PNY-05: common readiness diagnostics. See [quirk register](../quirk-register.md).

The [PostgreSQL rewrite register](../postgres-rewrite-register.md) records the shared raw named-query executor, shared index/catalog paths, moved storage methods and canonical fixture. No driver CRUD or transactions were added.

## Validation

Every phase ran the core/storage/server builds, core/server typechecks, the persistence test tsconfig, Prisma generation freshness (`npm --prefix packages/redbox-core run check:prisma`), lint and core Mocha checks, sequentially under external timeouts. Phase 4 also typechecked the storage tests.

| Phase | Core Mocha passing | Pending | Notes |
| --- | ---: | ---: | --- |
| 1 — lifecycle | 4,305 | 98 | Passed after lifecycle fixture updates. |
| 2 — named queries | 4,305 | 98 | Passed. |
| 3 — index readiness | 4,306 | 98 | Includes the late-failure inspection-barrier regression. |
| 4 — storage | 4,306 | 98 | Passed. |
| 5 — compatibility | 4,305 | 98 | One old slug-routing expectation failed; replaced with two tenant-scoped route/fallback checks, both passing in a focused run. The next full run passed. |
| 6 — dead code and shrinks | 4,307 | 98 | Full suite passed, including the phase 5 fixes. |

The storage-mongo full suite ran once against a throwaway, pinned Mongo 9.0.4 container with both `MONGO_TEST_URL` and `MONGO_CONCURRENCY_TEST_URL` set. It reported **288 passing, 14 failing**: all 38 live cases passed; the failures were unit fixtures for removed cursor/dialect/capability flexibility. Updated those fixtures, retained direct-driver GridFS cursors, and reran only `MongoStorageService.test.ts`: **247 passing, zero failing**. This covers **302 distinct storage tests** across the full and focused runs; it is not a second clean full-suite run. A focused intermediate rerun exposed six inadvertently converted GridFS fixture cursors; those fixtures were restored before the successful rerun.

The initial Docker portal Mocha attempt stopped in bootstrap (**zero tests passed, one before-all hook failed**). Removing the equality AST exposed Prisma's refusal of empty write filters in the intentional all-workflow bootstrap reset. Restored an explicit model `_id`-exists predicate at that call site and rebuilt core. The completed suite run below includes this fix.

The completed portal run reported **420 passing, 10 pending, two failing**. One assertion still expected retired Waterline validation text; it now checks the retained `E_INVALID_NEW_RECORD` code and the concise field message. Harvest lineage exposed BSON `_id` values in typed counter-pipeline results; the common row mapper now converts identity with `String(_id)` without recoding the other fields. Expanded the existing boundary test to cover string and BSON identities: **four focused unit tests passed**. Only the two affected integration files were rerun, using the same Compose services/bootstrap/config; the focused run skips the already completed browser bundling and coverage instrumentation.

The focused portal integration rerun passed **eight tests, zero failing**, including both failures from the completed suite. Across the full and focused runs, **422 distinct integration tests are covered by passing runs, with 10 pending**. This is one completed full suite plus one focused rerun, rather than a claim of a second clean full suite.

The first Bruno attempt stopped at attachment upload: **223 requests passed, one failed, 85 skipped by bail; 410/411 tests and 3/3 assertions passed**. Server logs showed the existing 10 GiB free-disk reserve rejecting a 194,397-byte test upload on a filesystem with about 6 GiB free. No application change was needed. A temporary, Compose-only `config/local.js` sets the reserve to 1 GiB for the completed rerun; the collection must start on a fresh stack to reconstruct the state required by the remaining requests.

Bruno General then completed with **309/309 requests, 553/553 tests and 3/3 assertions passing**. No source/test assertion changes were needed for Bruno. The first attempt and the temporary disk reserve are recorded above; the successful rerun replayed the collection because earlier requests create the records and login state needed later.

Dev-tools runtime tests passed: **48 passing, zero failing**. The default command first stopped before tests on existing TS7006 errors in the unchanged `test/commands/form-config.test.ts` callbacks (lines 64 and 67), which load an untyped fixture through `loadTs`. The runtime run used `TS_NODE_TRANSPILE_ONLY=true NODE_OPTIONS=--no-experimental-strip-types npm --prefix packages/redbox-dev-tools test`. The root-pinned Mocha module was linked into the package's ignored dependency directory after the portal runner pruned its duplicate local install. No source typing workaround was committed; dev-tools test-file static checking remains a limitation.

After the final fixes, core rebuilt successfully and the focused harvest boundary tests passed. Final persistence-test, storage-test and server typechecks, Prisma freshness and lint all passed; lint reported **zero warnings and zero errors**. The storage typecheck initially caught local dependency drift caused by the portal runner's root `npm install --no-save redoc@2.5.2`: the root lockfile already contains a nested storage-hook MongoDB **6.21.0** entry despite its **7.7.0** manifest pin (confirmed against the base commit). Removed that ignored nested install so the hook resolves the pinned root **7.7.0** driver, then repeated the affected typecheck successfully. The root lockfile was not changed by this simplification; its stale entry needs separate correctness review.

Environment: ARM64, sequential memory-heavy commands under external timeouts; Node **24.16.0** and npm **11.20.0** verified using the required PATH on the host and runners. Mongo used only `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`. The storage container published one temporary loopback-only ephemeral port (32881). Compose projects were `waterline-ponytail-mocha` and `waterline-ponytail-bruno`, with **no published host ports**. The runners mounted this compiled checkout into the existing `redbox-portal:publication-ci-validation` image. Bruno's Solr override used the cached ARM64 digest from the Mocha definition (`4316295f16175f676ac6798769f7a21729131ab555f1ba8663839dd7abd92e13`).

All task containers, volumes and networks were removed with project-specific cleanup. The live `waterline-smoke-*` containers and their ports 1500, 27017 and 8983 were left alone. Bruno's generated environment/lockfile changes and the empty temporary mount target were restored/removed; the test-only disk-reserve override is not committed. Detailed logs remain in this checkout's ignored `.tmp/ponytail/` directory.

## Follow-up correctness review focus

- Check tenant scope and the branding-history refusal of structured equality and its projection special case in the shared named-query catalogue.
- Review operation ownership across startup, shutdown, internal compound calls and retained handles; check synchronous storage stream/Observable methods.
- Confirm shared index alternatives and Figshare partial/multikey audits precede DDL; inspect/ensure never weakens an existing constraint.
- Check duplicate-match first selection, B/V validation/null/coercion changes and explicit malformed model-ID rejection against accepted quirks.
- Review plain row typing, string model/BSON typed-counter identity mapping, schema projections and dotted-sort fallback against existing stored documents.
- Resolve the pre-existing root-lock nested MongoDB 6.21.0 entry under the storage hook; manifests and the hook lock pin 7.7.0, but the portal runner root install can restore the stale copy. Also review the existing dev-tools test-loader TS7006 limitation recorded above.

## Correctness review round 1

Reviewed all seven commits in `28d386fb8..58c4b2e20` against the base implementation, ADR 0004, the original ponytail review and accepted F-PNY-01 through F-PNY-05. Starting HEAD was confirmed as `58c4b2e20edce77412ad26f27bfdd70009f5c8fd`. The branch was already checked out elsewhere, so `git switch --ignore-other-worktrees t3/waterline-ponytail` selected it in this task's checkout only. No other checkout was used for edits or builds.

### Findings and fixes

Two confirmed P2 regressions, both fixed with focused failing-before coverage:

1. **Storage operation overrides failed during construction.** The constructor's `Object.defineProperty` calls in `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts` created non-configurable, non-writable, non-enumerable forwarded methods, unlike the previous arrow fields. An institution service with a class-field `getMeta = async ...` override threw `TypeError: Cannot redefine property: getMeta`. Commit `e4b774bb6` restores all three descriptor flags. The new subclass/export regression failed before the fix and passed afterward; the complete live storage suite also passes it.
2. **npm omitted the deployment index fixture.** `support/resources/mongodb-persistence-indexes.js` became a symlink, which npm pack excludes. The root archive consequently lost the deployment `.js` even though it retained the dev-tools `.hbs` target. Commit `0abc40b73` restores the simplest independent deployment artifact: a regular byte-identical copy. A new core test checks file type and template equality; it failed on the symlink and passes in the full core suite. This supersedes the symlink adjustment recorded in finding 5 above.

No further confirmed regression was found in the closed named-query target catalogue or tenant filters; operation admission, drain/startup ordering, stale references, cache shutdown registration and failure cleanup; global inspection-before-DDL and duplicate audits; legacy index alternatives; uniqueness/CAS/atomic increment; supplied-field writes and stored-document reads; typed counter IDs; synchronous streams/Observables, dotted sorts, projections and capabilities; or accessor/symbol rejection and safe own-property copying. Changed and deleted tests were compared with the base: no additional loss of a retained safety assertion was confirmed.

### Validation

All memory-heavy commands ran sequentially with external timeouts, using Node **24.16.0** and npm **11.20.0** from the requested PATH.

| Check | Result |
| --- | --- |
| Core, storage and server builds | Passed |
| Core, server, persistence-test and storage-test typechecks | Passed |
| `npm --prefix packages/redbox-core run check:prisma` | Passed for both contracts |
| Root lint and cross-package import check | Passed; 840 files, zero warnings/errors |
| Core Mocha with `PERSISTENCE_TEST_MONGO_URL` | **4,338 passing, 68 pending, zero failing** |
| Storage-mongo Mocha with both live Mongo URLs | **303 passing, zero pending/failing**, including all 38 live cases |
| Dev-tools build | Passed |
| Full Docker portal integration Mocha | **422 passing, 10 pending, zero failing**, exit 0; one clean full run from fresh volumes |

The first core run had **4,337 passing, 68 pending and one failing**: the existing session middleware smoke test assumed a valid global Sails config left by another suite. Both its source and test were unchanged from the base. Commit `bfc677815` gives that test its own mock and restores the previous global, preserving its assertion. The subsequent full core run is the clean result above. An incidental storage run without Mongo URLs passed 265 unit tests and skipped 38 live cases; the reported 303-test result is a separate clean full run with both URLs set.

The first full portal attempt completed with **413 passing, 10 pending and nine failing**. Docker had created this checkout's missing attachment bind directory as root; the UID 1001 runner could not create `/attachments/primary`, causing favicon/logo/typeface storage failures. The entire project, including all three anonymous volumes and its network, was removed. Corrected only this checkout's attachment/mail bind ownership, cleared their disposable data and restarted the complete unfiltered runner from fresh services and volumes. The runner removes Redoc after webpack, so its pinned **2.5.4** archive was restored directly before the rerun, avoiding its fallback dependency installation. No application or assertion change was needed for these environment failures.

The second portal run completed cleanly with all **422 tests passing in one run**, plus 10 pending. It included webpack, shim generation, bootstrap, coverage instrumentation and the complete `test/integration/**/*.test.ts` glob. No per-file reruns contribute to that clean result.

Packaging and deployment checks:

- Root `npm pack --dry-run --ignore-scripts --json` confirmed the `.js` fixture was absent before the fix and present afterward. CI's deploy job uses root npm pack.
- Actual `npm pack --ignore-scripts` archives contain **1,752 core files** and **124 dev-tools files**, with no symbolic or hard links. Core includes its maintenance CLI and both generated Prisma JSON/type contracts; dev-tools includes the regular canonical `.hbs` template.
- Generating a hook from the extracted dev-tools archive produced **48 files**. Its index fixture is a regular, byte-identical file, mounted at the expected initdb path by the generated pinned Mongo service.
- The main Dockerfile's `COPY . .` includes both fixture paths under the repository's `.dockerignore`. A minimal scratch-image build using that COPY and those ignore rules preserved the deployment file byte-for-byte; its temporary container and image were removed. The portal run exercises the actual Compose bind mount.

Environment details and rejected suspicions:

- F-PNY-01 first-match cardinality, F-PNY-02 validation order/wording, F-PNY-03 malformed-ID rejection, F-PNY-04 Prisma decoding/identity mapping and F-PNY-05 shared diagnostics are accepted changes. ADR 0004's model-first Prisma ownership, driver GridFS and absence of transactions remain accepted. These were not reported as bugs.
- The nested storage-hook MongoDB **6.21.0** lock entry predates the base and conflicts with the existing **7.7.0** manifest pin. After npm ci reproduced it, the ignored nested installation was moved aside so validation used pinned root MongoDB 7.7.0 and TypeScript 5.9.3. No dependency manifest or lockfile changed.
- Only the required `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8` image was used. The host suites' throwaway container published loopback ephemeral port **32882**; its container and anonymous volumes were removed afterward.
- The portal Compose project was `waterline-ponytail-review-r1`, with **no published host ports**, its own fresh services/volumes/network, the unfiltered standard webpack/bootstrap/coverage runner and the requested toolchain mounted into the cached test image. A disposable untracked `config/local.js` lowered the free-disk reserve to **256 MiB**, because the shared filesystem has less than the default 10 GiB reserve. The override and disposable attachment/mail bind data were removed after validation.

Project-specific cleanup and subsequent Docker inspection confirmed that every task container, volume and network was removed. The `waterline-smoke-*` stack and host ports 1500, 27017 and 8983 were left alone. No push, PR, retirement/stack branch movement or other-worktree mutation was performed.

Detailed validation logs and package inspection artifacts remain in this checkout's ignored `.tmp/ponytail-review/` directory. A further review should have lower yield, but lifecycle race schedules and Prisma RC edge cases can still warrant independent scrutiny; passing these checks does not prove their absence.
