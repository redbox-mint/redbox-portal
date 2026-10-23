# P3 configuration and lifecycle evidence

Starting source: `247db6dafc2551527e972e238ff1504f4687a3a5`, shared checkout,
branch `stack/sails-retirement`. P0–P2 implementations are reused. No P4 work.
Commands below run at the repository root unless specified. Local logs live in
ignored `.tmp/sails-retirement/p3-*.log`; raw logs are not committed.

## SR-019 — Startup resolution and finalization

`src/configuration` owns explicit core → low/high extension → application → selected
environment → local → supported environment input → supported CLI input resolution.
The composition supplies a typed Zod configuration schema and explicit input
bindings. It validates each merged contribution, rejects unsupported keys through
the schema, and reports only source/path/error code (never values or Zod messages).
Functions require both a declared executable path and their typed schema position.
Ordinary and branding arrays replace; Agenda arrays/maps normalize and merge by
job name. Undefined means no contribution; null remains explicit and is validated.
The owned frozen snapshot does not mutate/freeze declarations or clone through JSON.

`loadStartupConfiguration` awaits explicit ESM or CommonJS data files. It does not
scan Sails config directories, import generated shims, run bootstrap, copy assets,
or acquire clients/workers. Native ESM top-level await is exercised. Extension
registration and these config modules remain separate from domain initialization.

Qualified toolchain for root commands:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node --version
npm --version
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only packages/redbox-core/test/configuration/resolution.test.ts
npm run lint
```

Observed initial focused run: **5 passing, 0 failing, 0 pending**; clean core build
**exit 0**, including Prisma generation/copy. Existing Prisma typeless-package and
unsynced agent-skill notices remain. The compiled import test denies Sails loading,
socket connects/listens and checks that signal listeners, compatibility/CoreBase
and the legacy core barrel are absent. Production config defaults/deployment input
bindings follow in SR-020; runtime/business composition follows SR-022.
No dependency version or lockfile change.

Final SR-019 focused rerun: **5 passing / 0 failures / 0 pending** (119 ms).
Strict application typecheck and Node 26 incremental core TypeScript compile
**exit 0**; repo lint **873 files, 0 warnings/errors**, focused Prettier and
`git diff --check` **exit 0**. The first incremental compile used an incorrectly
relative PATH from the package directory and thus Node 24; it passed, but is not
target qualification. It was repeated with the absolute Node 26 PATH and passed.
The clean build, strict typecheck, focused tests and lint all used Node 26.11.1.

## SR-020 — Deployment conversion and diagnostics

SR-019 source: `504b83ea3`. `configuration/deployment.ts` adds an explicit typed
operational schema, shared pure defaults, exact canonical environment/CLI bindings,
and deterministic data/legacy-environment conversion helpers. It reuses the existing
Mongo connection/session resolvers offline. It does not load `rc`, arbitrary Sails
files, hooks, sessions or workers. The legacy Agenda module and new resolver share
pure default options; only the comparison module retains import-time env behavior.

[Implemented mapping and examples](../configuration-v6.md) classify connections,
sessions, local/OIDC/AAF bootstrap data, proxy/root paths, disks, both characterized
Agenda spellings, custom environment files and unsupported keys. A composition
extends the deployment schema with its actual typed domain sections; this is not
full auth/provider parity or a promise to load every old Sails key. Conversion
fixtures are synthetic and credential-free; institution designation remains
SR-005 and is not invented to complete this implementation task.

Additional commands, qualified Node 26 PATH as above:

```sh
# In packages/redbox-core, with the ABSOLUTE Node 26 toolchain PATH:
./node_modules/.bin/tsc
# From repository root:
npm --prefix packages/redbox-core run typecheck:application
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts 'packages/redbox-core/test/configuration/*.test.ts' packages/redbox-core/test/config/agendaQueue.test.ts
npm run lint
git diff --check
```

Results: incremental production build and strict application typecheck **exit 0**;
focused config/legacy Agenda **11 passing, 0 failing/pending** (699 ms); repository
lint **875 files, 0 warnings/errors**, diff check **exit 0**. The compiled offline
import guard runs against the deployment surface too. Initial expanded run:
**10 passing / 1 failing** because an over-broad test regexp matched MongoDB's
`@mongodb-js/saslprep/dist/index.js`. A direct loaded-module probe identified that
exact dependency; the assertion now targets core's barrel/compat/CoreBase paths.
The same complete focused command then passes; no acquisition assertion removed.
No dependency version, lockfile or runtime-module-format change.

## SR-021 — Dynamic settings and owned configuration effects

SR-020 source `365cd7fc6`. Existing ConfigService is a compatibility export over
`compat/sails/configuration.ts`; the imperative file/locale/assets/services/
controllers/responses path is confined there. Neutral configuration uses P2
factory/resource declarations and pure startup data. Package-relative asset/view
roots remain declarations for the later rendering/artifact tasks, with no runtime
copy into installed production packages.

`configuration/brand.ts` shares the existing brand/default/legacy-map resolution
with the comparison service, using an explicit fresh dynamic read collaborator.
It adds no cache and never changes startup values. Existing AppConfig publication,
secret handling and invalidation are retained. A typed already-exists error
separates expected init-only duplicates from failed application-data writes.

Each legacy branded write is registered with the existing persistence owner before
its thunk executes. Its returned completion is awaitable; comparison bootstrap
also awaits every tracked write before post-bootstrap/readiness, including ignored
old-call returns. Cleanup awaits all sibling writes even after failure. This is
a temporary comparison adapter, not another standalone bootstrap implementation.

Node 26 commands:

```sh
npm --prefix packages/redbox-core run typecheck:application
# From packages/redbox-core, with absolute qualified PATH:
./node_modules/.bin/tsc
# Repository root:
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts 'packages/redbox-core/test/configuration/*.test.ts' packages/redbox-core/test/services/ConfigService.test.ts packages/redbox-core/test/services/AppConfigService.test.ts packages/redbox-core/test/loader/bootstrapShimRuntime.test.ts
npm run lint
git diff --check
```

Production compile and strict application typecheck **exit 0**. Focused suites
**102 passing, 0 failing/pending**, about 1 second, including existing dynamic
AppConfig/secret/cache/override and legacy bootstrap assertions plus fresh-read,
false/null/default, delayed-write, failed-write and cleanup ownership cases.
Initial run **100 passing / 2 failing**, and first typecheck failed: a mechanical
adapter move omitted the local `completion` declaration. Added the owned aggregate
completion; the full focused command and strict checks pass. No assertion removed,
no skip introduced, no dependency change. Mongo migration/bootstrap/drain proof
follows SR-022–024; this unit run is not counted as that proof.

## SR-022 — Ordered initialization, migrations and bootstrap

SR-021 source `fe030dcc4`. `ApplicationRuntime` now awaits fixed persistence/index,
module, migration, core, ordered-extension and post-bootstrap stages. Named work
validates required module names offline and snapshots its operation declarations;
contributor/storage/schema and dashboard dependencies are explicit composition
inputs. The neutral composition binds selected extension work once, initializes
the existing ledger, runs lexical migrations, then core/hook/post work. No generic
DI/workflow engine or second migration implementation was added.

The existing Umzug/Prisma executor moved to `application/migrations.ts`; legacy
version/global/bypass discovery and generated-shim callbacks moved to
`compat/sails`. Old loader module exports remain. Existing module-failure status
objects are preserved; new non-module startup failures identify their stage.
The orchestration covers the selected migrated module set; unconverted business
operations remain assigned to P5/P6 rather than invoking Sails from the neutral
composition. The host is still a partial development host, not a full portal.

Actual real database: disposable `sr-p3-mongo8`, **MongoDB 8.0.34 / FCV 8.0**,
unauthenticated standalone at **127.0.0.1:34902**, image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
No institution, replica-set, TLS/auth or newer-engine qualification is claimed.
Tests check their disposable prefixes and drop created databases in teardown.

```sh
docker run -d --name sr-p3-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker port sr-p3-mongo8 27017/tcp
docker exec sr-p3-mongo8 mongosh --quiet --eval 'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion,hello:db.hello()}))'
# Qualified Node 26 PATH; from packages/redbox-core:
./node_modules/.bin/tsc
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/application/Application.test.ts test/application/Initialization.test.ts test/loader/MigrationRunner.test.ts test/loader/bootstrapShimRuntime.test.ts 'test/extensions/*.test.ts'
# Root:
npm --prefix packages/redbox-core run typecheck:application
LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p3_lifecycle npm --prefix packages/redbox-core run test:lifecycle:mongo
EXTENSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p2_extensions node --test packages/redbox-core/test/extensions/storage-mongo.cjs
npm run lint
git diff --check
```

Focused stage/legacy migration/bootstrap/extension cases: **45 passing, 0 failing/
pending** (694 ms). Real ledger/startup **3 passing, 0 failing/pending** (~3 s):
lexical bodies precede bootstrap, hook priority is independent, fresh owners skip
completed bodies, a failed second migration retains its partial record writes
and only the first success ledger entry, acquired clients/pools close, activation
is impossible after failure. Graph/signal checks deny Sails/compat ownership.
The dedicated command requires Mongo input and cannot pass by skipping.

Existing standalone storage fixture, adapted to bind its declared migration and
prepare the ledger index explicitly, **3 passing, 0 failing/skipped** (~6 s),
including real record/GridFS operations and held-upload stop timeout/retry. Its
existing assertions remain; it now also runs the real revision backfill via the
ledger. Production TypeScript compile passes; repo lint **881 files, 0 warnings/
errors**. Final strict typecheck result is recorded at phase closeout.

Intermediate failures: initial generic Umzug extraction needed its object context
constraint and unknown-message logger input; corrected without casts. A root-cwd
unit invocation failed the pre-existing compiled subprocess's relative dist path;
the corrected package-cwd suite passes. Stage metadata initially changed three
exact P1 status assertions; module failure status compatibility was preserved.
First Mongo run **2 passing / 1 failing** queried a stored BSON branding ID as a
string; corrected to ObjectId. A subsequent test-only import typo and string signal
annotations failed typechecking/fixtures; corrected explicitly. No production
assertion, skip condition, timeout or dependency pin was weakened. Failed body
writes are evidence of the existing nontransactional contract, not rollback.

Final SR-022 strict application typecheck, Node 26 production incremental compile,
focused Prettier and diff checks **exit 0**. After the final compatibility-file
move, the complete focused stage/loader/extension command again passed **45/45**,
**0 failures/pending** (480 ms). No dependency changes.

## SR-023 — Queue, PDF and cron activation

SR-022 commit `eb56d9811`. Extracted the existing Agenda implementation into
`queues/AgendaQueue.ts`; Mongo/SQS claim fencing, accepted-handler/backend-operation
tracking, queue/history APIs and serialization remain one implementation. Only
`compat/sails/agenda.ts` translates globals, ready/lazy startup, legacy index DDL
and beforeShutdown. Its public shim/export and existing private test seams remain.
Standalone initialization connects/defines/inspects; activation starts once and
awaits configured schedule writes before admitting normal submissions. Missing
handlers fail startup. SQS recurring/delay limitations remain unchanged.

Pinned MongoBackend.connect creates logger indexes even with logging disabled.
The neutral path uses the same pinned MongoJobRepository with `ensureIndex:false`,
borrowed transport and no persistent logger; explicit queue index maintenance uses
its actual ordered index keys plus the two historical indexes. No alternate job
repository or dependency patch/version change. Tests compare indexes/absence of
logger collections before and after startup. The selected deployment must prepare
these indexes explicitly. Full standalone maintenance composition is SR-025.

`queues/ScheduledWork.ts` owns node-schedule jobs before schedule acquisition,
activates once and tracks actual async callback completion. Invalid schedule
failure cleans already registered jobs. Comparison cron now prepares during
bootstrap and activates at ready instead of firing during bootstrap. Remote
vocabulary imports remain their existing awaited bootstrap operations; neutral
compositions bind them as named work, never as ordinary recurring producers.
PDF reuses P2's implementation and adds required-bootstrap-failure proof.

Commands (Node **26.11.1**, npm **11.20.0**, same Mongo **8.0.34 / FCV 8.0**):

```sh
LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p3_lifecycle npm --prefix packages/redbox-core run test:lifecycle:mongo
# From packages/redbox-core with absolute qualified PATH:
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 15000 test/services/AgendaQueueService.test.ts test/queues/ScheduledWork.test.ts
./node_modules/.bin/tsc
node --test test/extensions/pdf-lifecycle.cjs
# Root:
npm --prefix packages/redbox-core run typecheck:application
npm run lint
```

Results **8 Mongo passing / 0 failing/pending** (~3 s), **61 queue/cron passing /
0 failing/pending** (~2 s), **5 PDF passing / 0 failing/skipped** (~1.7 s).
Production compile and strict application typecheck **exit 0**; lint **887 files,
0 errors/warnings**; focused Prettier/diff checks pass. Real Agenda tests exercise
a seeded due job, no inactive claims/submissions/schedule writes, once-only starts,
migration/bootstrap failure, missing handler and cleanup after later activation
failure; persisted completed effects remain (no rollback claim). No skip accepted.

Intermediate checks: initial legacy suite **55 pass / 4 fail** exposed captured
HTTP-owner lookup, preserved legacy start-before-index behavior and diagnostic
text; corrected solely at the comparison boundary; unchanged suite passes **59**.
First Mongo run **3 pass / 5 fail** used the wrong diagnostic property `poolCount`
in new tests; corrected to existing `pools`. The first cron run **60 pass / 1 fail**
found node-schedule retains a failed Job; ownership now begins before scheduling.
An initial typecheck caught extraction-specific visibility/types and the diagnostic
property; fixed. Early successful Mongo processes stayed alive on pinned Agenda's
passive lock-watchdog delay (`lockLifetime/2`), despite closed clients/pools. The
fixture now explicitly configures a **200 ms lock lifetime**; it is not force-exited.
The upstream watchdog's passive delay remains a process-exit consideration for
long-lived production job lock settings; it performs no I/O once the handler has
settled. It is not evidence of a retained connection or a running handler.
No existing assertion, configured timeout, skip or dependency pin was weakened.
