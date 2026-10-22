# P4 build artifacts and MongoDB infrastructure

**Final-review correction:** the `.tmp/prisma-cache-p4` packed context,
`run-packed-query.sh`, `run-runtime-query.sh`, `run-portal.sh` and associated
overlays were not retained. Commands using those paths below report historical
observations; they cannot be replayed exactly from this checkout. The full
Dockerfile is tracked, and the durable `npm --prefix packages/redbox-core run
test:cache-package` regenerates its own context/lock and runs the installed,
pruned package/type/shim/CRUD assertions. Its Node 24 variant is shown below.
For later full-portal replay use the tracked
[P5 harness](evidence/p5/harness/README.md); to repeat the broader shared-client
selection, replace its newline-delimited test paths with the nine tracked files
listed in this record. Rebuild current core/dependencies first. These are current
equivalent checks, not reconstruction of the original temporary image/context.
The retained phase records and later tracked acceptance suites support the G4 decision;
the missing historical harness does not itself establish reproducibility.

Recorded 2026-10-19 Australia/Adelaide. Input G3: `a8d0622db`.
Build implementation: `b59d8cbb1`; lock/CI repair: `64dddd926`. MongoDB pins:
`c41376e21`; durable package/shared-client fixtures: `867d7eb2e`;
standalone core CI install/freshness audit: `187b836fe`; npm lock ordering: `bbae971b5`;
remaining CI toolchain/Node-matrix fixture audit: `2fca229b7`.

## G4 decision

**G4 passes for development deployment. P4.1–P4.8 are complete.** Clean local,
CI-toolchain, packed-package and Docker paths preserve the committed contracts;
stale/missing artifacts fail deliberately; MongoDB 8.0.34 shared clients pass
with both explicitly selected cache adapters. Node 24.16.0 and 26.11.1 packed
production runtimes work without contract sources, the CLI or build-time DB
access. Implementation checkpoints and exact versions appear below.

No P5 gate, backend-default promotion or stable Prisma qualification is implied.
Waterline remains the default. RC dependencies still block official v6 readiness.

## Deterministic contracts and build audit (P4.1–P4.4)

`packages/redbox-core/scripts/cache-contract.cjs` is the generation/check/copy
entry point. It invokes the pinned CLI through its installed package bin using
the running Node executable, with tracking disabled, no database configuration
and no schema synchronization. Both generation and checking emit to a newly
created temporary directory and remove it in `finally`. Checking compares bytes
without writing committed artifacts, and fails on missing or stale JSON or
`.d.ts`. Generation copies both emitted files into the authoritative committed
`src/persistence/prisma/generated` directory.

The temporary output must be inside the core package. Emitting to the operating
system temp directory caused this RC to emit unresolved `@internal/*` declaration
imports: Prisma discovers public import aliases from output ancestry. Moving
the temporary directory inside core preserves the public `@prisma/orm-mongo/*`
imports, without patching generated declarations or changing module semantics.
Both committed files remain byte-identical to P1/P3:

- JSON SHA256: `1cca2cc02a0c6a833ed835618cb4e8f49b4bc36224c1e91fa55be37ae89aa993`.
- Declaration SHA256: `3be17d603d4cc61aac3cd71128467a9348891665b525b410d18c9b836d3e60be`.

Core `build` explicitly generates, removes `dist`, compiles, then copies JSON and
`.d.ts` after cleanup. `tsconfig.json` excludes the build-only `contract.ts`, so
its builder module is absent from `dist`. Package `files: ["dist", ...]` already
includes the generated directory. `client.ts` resolves the JSON using its own
`__dirname`, independent of the application's current working directory.

The compiler remains TypeScript **5.9.3** with the existing NodeNext/CommonJS
package conventions. Prisma CLI is **8.0.0-rc.23**, runtime
`@prisma/orm-mongo` **8.0.0-rc.18**, core Effect **4.0.2**, native MongoDB driver
**7.7.0**, and URI parser **7.0.2**. No package module-type migration is made.

Entry-point audit:

- Root `compile:core` and `compile:core:prod` call package `build` after installing
  build dependencies. `compile:all`, `compile:server`, development preparation,
  hook core-mount preparation, publishing and API documentation compilation
  transitively use these paths. `dev:all` now builds core before Sails/Angular.
- Docker replaces its direct core `tsc` with `check:cache-contract` and `build`
  under `RUN --network=none`. Core installation now uses its committed lock via
  `npm ci`. Production still reinstalls/prunes the graph and copies packages;
  runtime removes core's `src`, `scripts` and `prisma.config.ts`.
- Playwright's mounted preparation removes `dist` before invoking package `build`,
  which performs generation/cleanup/copying in the required order.
- Bruno S3 previously compiled with `tsc --noEmitOnError false || true`; mounted
  sources now use the complete package build and propagate failures. Published
  images use the already-built package without requiring a CLI.
- CircleCI's main build checks committed contracts immediately after root
  installation, before Docker or other compile scripts can regenerate them.
  Other actual core compile paths route through the scripts above. Root-only
  Sails compilation and `--noEmit` checks consume the already-built/committed
  contracts; they are not alternative core package builds.
- `dev:run` itself starts/mounts a prepared checkout; it does not claim to build
  core. Preparation and `dev:all` supply that build as before.

Commands exercised:

```bash
npm run compile:core
npm run compile:core:prod
npm run check:cache-contract
npm --prefix packages/redbox-core run generate:cache-contract
npm --prefix packages/redbox-core run build
```

`compile:core` and `compile:core:prod` pass inside the Node 26.11.1 / npm 11.20.0
image against the mounted worktree, including their strict dependency-install
step and the complete core build. The direct package build also runs on host
Node 24.18.0. No build-time database is configured for contract emission; Docker additionally enforces `--network=none` for its freshness/build.
A deliberate failure probe appends a newline to each committed artifact
in turn, runs the root freshness check, removes the artifact and checks again,
then restores the original bytes in `finally`. All four stale/missing cases
exit nonzero; the restored pair passes. The check never repairs a missing/stale
file during these probes. Emission's existing typeless-package/skills notices
are diagnostic output, not nondeterministic artifact content.

## npm toolchain and lock repair

Observed actual versions:

- Host: Node 24.18.0 / npm 12.0.2 (not used to regenerate the final locks).
- Docker builder: Node 26.11.1 / npm 11.20.0.
- Pinned CircleCI `cimg/node:24.16.0` digest: Node 24.16.0 / npm 11.13.0.
- `.nvmrc` selects Node 24.16.0; root/core had no npm engine/package-manager pin.

Root/core now declare `packageManager: "npm@11.20.0"`. CircleCI's root-install
steps explicitly install that npm before strict `npm ci`; its core machine job
also selects `.nvmrc`, pins npm and uses root `npm ci`. Docker already supplies
11.20.0. All direct dependency pins remain exact and unchanged from P3.

Repair started with both locks from `0cfbd62b9`, retained the previously tested
Prisma dependency versions, and resolved the additions with npm 11.20.0.
A wholly fresh resolution encountered newer optional Effect peers in Composer;
merely running npm 11 against the npm 12 lock or forcing resolution did not
produce a valid strict core installation. The accepted seed isolates the CLI's
peer cohort beneath `prisma/node_modules`, including its own Effect and optional
MongoDB 6 client, independently of core's Effect 4.0.2 and MongoDB 7.7.0.
Existing unrelated minor versions were retained; where a new tool needs a newer
version it receives a nested dependency rather than upgrading the application.
No new override or relaxed final install flag was added.

[Semantic lock delta](evidence/p4-lock-delta.json) compares with `0cfbd62b9`.
No surviving pre-existing `peer: true` flag is removed, including root's
`@emotion/*` entries. Existing-version changes are limited to:

- Root MongoDB 7.2.0 → 7.7.0 and root URI parser 7.0.1 → 7.0.2.
- Root's nested storage-hook development driver 6.21.0 → its already-declared
  7.2.0, now required separately because root's driver is 7.7.0.
- Core's URI parser 3.0.2 → the new exact direct 7.0.2, retaining older nested
  parsers for older drivers.

Removed duplicate driver/parser/AWS entries reflect rehoisting for the new
Prisma graph; unrelated existing package versions (including Babel) are retained.
The large net additions are the pinned Prisma CLI/runtime and their dependency
closure, rather than npm 12's repository-wide peer metadata stripping.

Core strict clean `npm ci` also passes with **1,679 packages** on Node 26.11.1 /
npm 11.20.0. Install time includes an intentional pause to reduce disk contention.
No force, legacy-peer or relaxed peer flag was used. The pinned CI
image with the explicit npm 11.20.0 setup passes root
`npm ci --ignore-scripts --strict-peer-deps` (2,094 packages). This is a local
execution of that CI path, not a claim that a remote CircleCI pipeline ran. A
copied core config/source/artifact
fixture with **no private node_modules** also passes `cache-contract.cjs check`
using only the installed root dependency tree, covering resolution before CI has
installed core's private graph.

## MongoDB baseline and topology (P4.6–P4.7)

The selected fresh-stack baseline is official MongoDB **8.0.34**, pinned as:

```text
mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907
```

Use MongoDB's 8.0 major-release line as the conservative tested baseline. No
qualification of 8.2/9.0 or arbitrary future 8+ versions follows from the cache
preflight's minimum-major check. Prisma CLI 8.0.0-rc.23 and Mongo runtime
8.0.0-rc.18 remain RC/early access, so official v6 is still gated separately.

Read-only `docker run --rm --entrypoint mongod <digest> --version` reconfirms:
selected digest **8.0.34**; old `bac22...` digest **9.0.2**; old `e0ce8...` digest
**8.2.12**. The old `latest` labels did not identify a consistent server line.
No existing running MongoDB server was queried. `docker buildx imagetools inspect`
confirms the pin is a multi-platform image index including linux/amd64 and
linux/arm64/v8; only amd64 execution is claimed here.

Updated all checked-in active MongoDB definitions: root development, generic
integration, Mocha, all Bruno variants, Playwright, PDFgen development/Bruno,
hook-archetype development/Mocha templates, CircleCI Figshare and storage tests.
Legacy acceptance/deployment examples also receive the same pin so they no
longer suggest an unverified Alpine MongoDB image; their legacy application and
browser stacks are not independently qualified by this phase.

The selected cache operations work on standalone MongoDB. No transaction or
replica-set dependency is introduced. Replica-set/TLS/SRV deployment handshakes
and institutional upgrade rehearsals remain later qualification; the tests below
explicitly report the standalone server and selected cache adapter.

### Existing-data upgrade/FCV boundary

These definitions select images for **new disposable stacks**, not an automatic
upgrade or downgrade of persistent databases. In particular, replacing a 9.0.2
or 8.2.12 image with 8.0.34 must never reuse those newer server's data files as an
assumed supported downgrade. Keep the existing institution/server deployment
until its migration/recovery plan has been reviewed.

For an older institution deployment, inventory server/FCV/topology, all databases
and clients, take backups and rehearse restoration first. Follow the exact
MongoDB-supported sequential upgrade path for that starting release. For a
7.0 → 8.0 upgrade, first satisfy the 7.0 patch/FCV prerequisites, upgrade binaries
according to standalone/replica-set guidance, validate the shared clients and
then explicitly advance FCV using MongoDB's documented confirmation procedure.
Earlier releases need their intermediate supported upgrades. Retain rollback
and backup options until that deliberate FCV change. Switching the cache adapter
is an application change, not a database-engine downgrade.

Primary operator references:

- <https://www.mongodb.com/docs/manual/release-notes/8.0/>
- <https://www.mongodb.com/docs/manual/release-notes/8.0-upgrade-standalone/>
- <https://www.mongodb.com/docs/manual/release-notes/8.0-upgrade-replica-set/>
- <https://www.mongodb.com/docs/manual/reference/command/setFeatureCompatibilityVersion/>

P6 still owns the institution-specific runbook, backup/restoration and migration
rehearsal. P4 does not claim to have upgraded an existing database.

## Package/runtime and shared-client validation (P4.5, P4.8)

The committed `test:cache-package` fixture stages the actual core package files
and tarballs of its four local dependencies. It substitutes exact local versions
as the publish staging workflow does; it does not inject a spike implementation
or modify runtime dependencies. The consumer root retains core's existing security
overrides; no Prisma/Effect override is introduced. The NodeNext consumer includes
expected-error
checks for numeric timestamps and unknown fields so missing generated types
cannot pass as `any` under declaration-library checking.

The fixture Dockerfile performs clean production `npm ci`, compiles the consumer
and runs import/shim/artifact smoke with networking disabled, prunes production
dependencies, copies to the slim runtime, changes working directory to `/tmp`
and repeats the offline smoke. The smoke asserts both artifacts exist, no
contract source/builder module or generation CLI is available, and imports,
client construction and generated shims open zero sockets. A separate disposable
standalone MongoDB then exercises the installed repository's CRUD and raw BSON
representation; the fixture database is created only after the image build.

Validation commands and observed results:

```bash
docker build --progress plain --target runtime -t redbox-cache-p4:runtime-815a2a6e .
docker build --progress plain -t redbox-cache-p4:packed-815a2a6e .tmp/prisma-cache-p4/packed
bash .tmp/prisma-cache-p4/run-packed-query.sh redbox-cache-p4:packed-815a2a6e
bash .tmp/prisma-cache-p4/run-runtime-query.sh redbox-cache-p4:runtime-815a2a6e
```

All four pass. The full application build runs the actual Dockerfile, including
root/core clean installs, offline core contract freshness/build, all Angular
production bundles, webpack/API assets and production `npm ci --omit=dev`
(**1,558 packages**). Its root clean install adds **2,094 packages**, verifying
the repaired root lock with the actual npm 11.20.0 Docker toolchain. The final
runtime import/Companion check also passes. Existing Angular CommonJS/bundle-size
and webpack warnings remain diagnostics; no build errors are suppressed.
The final image manifest list is
`sha256:ba6b99f1c669cff71db60c2e2a7396dc13cf0d99dd7f26e711df157a1c3186b8`.

The packed Docker build performs clean `npm ci --omit=dev --ignore-scripts
--strict-peer-deps` (**1,295 packages**), consumer compilation and offline smoke,
pruning and a second offline smoke in the slim stage. Both final images pass
live installed-repository create/read/update/delete plus raw BSON assertions on
MongoDB 8.0.34. Runtime wrappers change cwd to `/tmp` and mount only the smoke
scripts into the installed application's directory for dependency resolution;
they do not mount contract sources or the development dependency tree. Both
report `PASS installed core/artifacts/shims: no sources, CLI or sockets` and
`PASS installed Prisma repository CRUD + raw BSON on MongoDB 8.0.34 (v26.11.1)`.
All wrappers trap resource cleanup. The durable runner additionally accepts
`CACHE_PACKAGE_NODE_VERSION` (default `26.11.1`) and pins the build-stage npm to
11.20.0 on either Node line. The Node 24 matrix command is:

```bash
CACHE_PACKAGE_NODE_VERSION=24.16.0 npm --prefix packages/redbox-core run test:cache-package
```

This full durable command passes **exit 0** on Node **24.16.0** with npm
**11.20.0** for installation. Clean production `npm ci`, consumer field-error type
checks, offline build-stage import/shims, prune, slim-runtime offline loading and
installed-repository CRUD/raw BSON all pass. It reports the same two `PASS`
messages with `(v24.16.0)`. Its temporary image, context, MongoDB container,
anonymous volumes and private network are removed by its EXIT trap. This
complements the Node 26.11.1 packed and actual application-runtime checks above.

The shared-client Docker Mocha checks include existing cache/branding, Agenda
execution, Waterline translations/users/roles and record-service/concurrent
record-storage suites, plus `MongoSharedClients.test.ts` for actual server,
standalone topology/backend reporting, connect-mongo persistence through two
stores (get/touch/destroy), and binary GridFS write/read/replace/delete through
the actual core driver. They run once per explicit backend selector. Both final
runs pass
**38 tests each, exit 0 (2 minutes of Mocha each)**, reporting
`Shared MongoDB smoke: server=8.0.34, topology=standalone, cache=waterline` and
`Shared MongoDB smoke: server=8.0.34, topology=standalone, cache=prisma`.
The assertion verifies the actual repository constructor in each run.
All three new shared-client assertions pass; Agenda executes its job; translation,
user/role, record CAS/update-removal, association and schema/save-boundary cases
pass. Full bootstrap and normal Sails lowering complete. Bootstrap Solr
indexing diagnostics (`undefined.add`) do not fail these MongoDB tests; Solr
search behavior is outside this infrastructure smoke's acceptance claim.

```bash
RBPORTAL_IMAGE=redbox-cache-p4:runtime-815a2a6e bash .tmp/prisma-cache-p4/run-portal.sh waterline
RBPORTAL_IMAGE=redbox-cache-p4:runtime-815a2a6e bash .tmp/prisma-cache-p4/run-portal.sh prisma
```

The wrappers use the standard `run-mocha-redbox.sh` entrypoint, including webpack,
loader shim generation, full lift/lower and nyc. `RBPORTAL_MOCHA_TEST_PATHS`
contains these newline-separated paths:

```text
test/integration/services/MongoSharedClients.test.ts
test/integration/services/CacheService.test.ts
test/integration/services/BrandingService.test.ts
test/integration/services/AgendaService.test.ts
test/integration/models/I18nTranslation.test.ts
test/integration/services/UsersService.test.ts
test/integration/services/RolesService.test.ts
test/integration/services/MongoStorageConcurrency.test.ts
test/integration/services/RecordsService.test.ts
```

The wrappers mount the current checkout and its test dependencies into the newly built runtime image; installed/pruned
runtime checks above run separately without that mount. The Prisma project alone
mounts an explicit init script creating the unique `name` index in its synthetic
`redbox-portal` database. This is fixture deployment preparation, not application
startup DDL. Test `migrate: drop` then recreates the compatible index as in P3.

All task-owned servers use newly created container IDs or uniquely named
`redbox-cache-p4-*` Compose projects/networks and synthetic databases/credentials.
Project cleanup removes only those resources/anonymous volumes. MongoDB ports
are private to the isolated networks or assigned ephemeral loopback ports.
No `development-mongodb-1` or other pre-existing data is accessed or modified.
Final `docker ps -a` checks for the two P4 Compose projects, P4 names and the raw
suite/package fixture labels return no containers; P4/package network filters
return none. All task-owned MongoDB anonymous volumes are removed by `down -v`
or `docker rm -fv`. The manually built `redbox-cache-p4:runtime-815a2a6e` and
`redbox-cache-p4:packed-815a2a6e` local image tags and ignored logs/build contexts
remain available for review/P5 reuse; no image was pushed. The self-contained
Node 24 runner removes its own temporary tag/context.

## Core regression and outstanding handoff

Two initial host `npm run test:core` runs each report **4,098 passing, 80 pending,
1 failing**, solely `startup-module-loading.test.ts` child `ETIMEDOUT` at the
unchanged 12-second limit. This is the P0/P3-known base `0cfbd62b9` flake, not a
new assertion failure. No timeout, skip or assertion was changed. A third run
overlapped the disk-stalled container cleanup/build and reported
4,096 passing / 80 pending / 3 timeouts: the known startup timeout plus existing
5-second log-config and AAF request-chronicle cases. The first infrastructure
attempt did not reach Mocha because Keycloak missed its existing health deadline;
the raw suite's first attempt likewise timed out waiting for its newly created
MongoDB. All those task-owned containers were cleaned. These attempts are not
counted as passes. A second raw-suite attempt, concurrent with Keycloak
augmentation, reached its
existing 500 ms Waterline server-selection timeout during setup; its after hook
then rejected the incomplete configuration. The failed Mocha child was terminated
and the runner removed its server. No timeout/assertion was changed. The final
uncongested `npm run test:core` is **exit 0: 4,099 passing, 80 pending,
zero failures (1 minute)** on Node 24.18.0. The unchanged startup test passes in
**10,840 ms**. The two contention-only 5-second timeouts also pass. Pending opt-in
MongoDB cases are not counted as passes and are exercised separately below.

The final isolated authenticated suite also passes **13 tests, exit 0 (3 seconds)**:

```bash
P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma
```

It exercises the freshly compiled P4 dist/artifacts and verifies raw mappings,
duplicate/index/preflight failures, authentication/unavailability, repeated
startup/shutdown and owned-versus-borrowed connection cleanup. Expected injected
startup/migration error logs accompany passing assertions. Its isolated server
and temporary application are removed. No assertion, timeout or skip changed.

## Final static checks

Targeted Prettier checks pass for the generator, package fixture sources, shared
MongoDB test, checklist and this evidence. `bash -n` passes for the package runner
and modified Bruno S3 entrypoint. CircleCI YAML parses with `js-yaml`;
`docker compose config --quiet` passes for all twelve changed concrete Compose
files (portal/dev/integration/Bruno/Playwright/PDFgen and legacy examples).
Hook template MongoDB lines contain the identical verified digest. Final
`git diff --check` passes. No lint claim is made for files excluded by Oxlint.

## P5 handoff and validation boundaries

- Waterline remains the default. Use `sails_persistence__cache__backend` explicitly
  for portal runs and assert the repository constructor; `test:cache-prisma` uses
  its own disposable authenticated URI and `P3_SKIP_BUILD=true` only with a current
  core build. Prepare/verify the unique-name index explicitly before Prisma startup.
- Use `npm@11.20.0` for root/core lock maintenance. Start from these repaired locks,
  retain the isolated Prisma CLI peer cohort, and run strict clean installs after
  a dependency change. Do not regenerate with host npm 12 or add force/legacy-peer
  flags to bypass resolution failures. Package fixture lock generation also uses
  npm 11.20.0.
- Contract changes must commit source plus JSON and declarations. Run freshness
  **before** any build that regenerates artifacts. Build core through its package
  script; direct tsc cannot copy JSON/declarations or prove freshness.
- The tested database is fresh standalone MongoDB 8.0.34 on amd64. The digest has
  arm64 manifests, but no arm64 execution, replica-set/TLS/SRV rehearsal, existing
  institution upgrade or engine downgrade is claimed. P6 owns those deployment
  runbooks/rehearsals. Keep application-backend rollback separate from MongoDB
  downgrade and FCV/backup recovery.
- P5 still needs shared-adapter contracts and mixed writers, restart/switch/previous
  development release rollback, complete notification/preview/API/browser coverage
  and the bounded operational comparison. P4's successful MongoDB record writes do
  not qualify Solr indexing/search or external integrations.
- The unchanged startup timeout remains load-sensitive, although the final full
  core suite passes. Keep build/install jobs away from timed smoke runs on this
  four-vCPU host. Remote CircleCI execution remains a CI responsibility; the exact
  pinned CI image/install command was exercised locally.
- Prisma CLI/runtime remain RC/early access. G4 qualifies development deployment;
  G5/default promotion and stable-runtime official v6 gates remain uncompleted.
