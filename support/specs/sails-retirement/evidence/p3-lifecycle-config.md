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

## SR-024 — Quiesce, scoped completion and retryable draining

SR-023 commit `a9f53a126`. The existing persistence resource interface now has
synchronous idempotent `quiesce()`. Application stop and the partial Express host
fence admission immediately; initialized/activating modules, queue, cron, native
GridFS/storage, sessions and PDF retain their original registry and close order.
Acquisitions already in accepted initialization scopes stay owned; new stages
cannot begin. Quiesce failure remains observable and retryable. No second native
resource registry or process signal owner was added.

The persistence owner's AsyncLocalStorage scopes allow accepted startup, queue,
cron and HTTP work to complete repository/late enqueue/native writes while unrelated
operations are denied. Each accepted operation stays in the existing active set;
settled scopes revoke detached descendants. Native GridFS owners wait these scopes
before their final stream drain, covering bytes started by a late completion.
Different owners cannot borrow each other's admission. Prisma closes after every
native dependent, then pooled clients close. Cleanup failure/deadline keeps status
unready with retained ownership, and retry cannot restart a stopped instance.

The partial Express host reuses `middleware/requestLifetime.ts`, now structurally
typed, and accepts the same explicit persistence owner. It tracks actual declared
request work past response finish or transport abort; transport closure alone
never releases that work. P4/P5 still own full returned-action/session middleware
adaptation. Existing nonpersistent host/test interfaces and comparison sessions
remain intact. `configuration-v6.md` documents bounded **30,000 ms** defaults,
explicit application/host/Agenda settings, container grace, longer uploads and the
pinned Agenda passive-watchdog process-exit consideration.

Qualified commands (Node **26.11.1**, Mongo **8.0.34 / FCV 8.0**):

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/sails-hook-redbox-storage-mongo run build
npm --prefix packages/sails-hook-redbox-pdfgen run compile
# From packages/redbox-core (absolute qualified PATH):
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 15000 test/application/Application.test.ts test/application/Initialization.test.ts test/application/Quiesce.test.ts test/http/ExpressHost.test.ts test/services/AgendaQueueService.test.ts test/queues/ScheduledWork.test.ts
# Root:
LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p3_lifecycle npm --prefix packages/redbox-core run test:lifecycle:mongo
EXTENSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p2_extensions node --test packages/redbox-core/test/extensions/storage-mongo.cjs
node --test packages/redbox-core/test/extensions/pdf-lifecycle.cjs
MONGO_TEST_URL=mongodb://127.0.0.1:34902/sr_p3_storage MONGO_CONCURRENCY_TEST_URL=mongodb://127.0.0.1:34902/sr_p3_storage npm --prefix packages/sails-hook-redbox-storage-mongo test
npm --prefix packages/sails-hook-redbox-pdfgen run test:unit
npm run lint
```

Results: clean core build (including actual Prisma generation), incremental
production compile, storage/PDF builds and strict application typecheck **exit 0**.
Focused core/host/legacy-queue/quiesce **90 passing / 0 failing/pending** (~6 s).
Real lifecycle **11 passing / 0 failing/pending** (~3 s): a held real Agenda handler
finishes its persisted record, late GridFS byte write and durable audit enqueue
through a failed stop/retry; finished and aborted HTTP transports retain held real
repository writes. All verify live Prisma clients/pools during timeout, refusal of
outside work, actual persisted completion, and zero clients/pools after retry.
Detached descendants are refused. No required Mongo case is skipped.

Existing compiled standalone storage **3 passing / 0 failing/skipped** (~6.6 s),
including held real GridFS upload; PDF lifecycle **5 passing / 0 failing/skipped**
(~2.2 s), including uninterruptible datastream write, retry interruption and failed
browser close retry. Complete storage suite with both real Mongo inputs **304
passing / 0 failures/pending** (~50 s); complete PDF unit suite **75 passing /
0 failures/pending** (~1 s). Browser lifecycle fixtures substitute Chromium; public
PDF/auth/upload parity remains P5/P6. Lint **887 files / 0 errors/warnings**,
focused format and diff checks pass. No dependency change.

Intermediate focused run **85 pass / 3 fail** found an over-broad second generic
drain (changed the existing once-only drain contract) and a host retry beginning
cleanup early because quiesce had changed readiness. Removed the generic second
drain, made native completion owners await accepted work, and retained the first
stop's startup/active classification across retries. All original assertions pass.
One rerun overlapped a clean build and failed two compiled subprocess cases while
dist was absent; rerunning after build passed without deadline/assertion changes.
This was an avoidable verification scheduling error, not accepted proof. Several
mixed-directory edit invocations failed before touching files and were repeated
at the repository root. No failure was hidden by a skip or timeout relaxation.

## SR-025 — Standalone inactive maintenance

SR-024 source `c7258c1b7`. `bin/persistence-indexes.cjs` now uses the public
`@researchdatabox/redbox-core/maintenance` entrypoint, explicit typed operational
files/environment inputs and installed v6 extension declarations. No Sails/rc,
legacy core barrel, generated shims, temporary controller directory, HTTP server
or signal owner is loaded. Configuration resolution reuses SR-019/020. Selected
bundled Mongo storage preflight is loaded through its public extension export;
custom replacement providers fail offline rather than inherit wrong descriptors.
Domain contributions stay offline; retired ORM selectors are rejected. The neutral
storage declaration omits the legacy Mongo index DSL (existing Prisma descriptors
remain authoritative); its comparison entrypoint is unchanged.

The existing inspect-all-before-DDL coordinator now also covers selected Mongo
Agenda indexes, including a separate URL/collection. SQS-only selections acquire no
Agenda Mongo pool. Duplicate/conflicting definitions block all ensure DDL. Default
inspect, explicit ensure, ready/not-ready/error exit statuses and finally cleanup
remain. The existing explicit revision backfill is exported publicly and stays
separate from index preparation, migrations and business startup. Operator guidance:
[maintenance-v6.md](../maintenance-v6.md).

Commands (qualified absolute Node PATH from SR-019):

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/sails-hook-redbox-storage-mongo run build
LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p3_lifecycle node packages/redbox-core/test/extensions/run-packed.cjs --maintenance-mongo
# From packages/redbox-core:
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 15000 'test/configuration/*.test.ts' 'test/extensions/*.test.ts' test/application/Initialization.test.ts test/services/ConfigService.test.ts
# Root:
npm run lint
git diff --check
```

Clean core/Prisma generation, strict application typecheck and storage build all
**exit 0**. Focused suite **31 passing / 0 failing/pending** (~1 s). Lint **888
files / 0 errors/warnings**. Focused Prettier and diff checks pass. No dependency
version/lockfile change. An initial static hook type import pulled duplicate core
ambient declarations into source compilation; switched to the existing asynchronous
public module loader and a narrow preflight shape check. Exported the report type
for declaration emission. No skipLibCheck or weakened test assertions. An initial
focused command had a case-mismatched extension filename and ran only 20 cases;
the corrected complete glob produced the 31-case result above.

Installed proof ran on `agentvm`, Linux **6.8.0-147-generic x86_64**, Node
**26.11.1**, npm **11.20.0**, MongoDB **8.0.34 / FCV 8.0**, unauthenticated
standalone `sr-p3-mongo8` at `127.0.0.1:34902` (image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`).
Three unique disposable databases distinguish core, storage and Agenda. The runner
packed actual packages, installed production dependencies, removed node_modules,
and successfully repeated installation with **offline npm ci**. Consumer files
were confined to `/tmp/redbox-p3-packed-5tdeQe`, removed after success. No source
shortcut or NODE_PATH. Existing npm deprecation/git-integrity notices are retained
in ignored logs; no new package pin was introduced.

Packed proof **exit 0**, **9 CLI invocations / 102 index reports (3 Agenda)**,
**0 failures/pending/skips**: fresh default inspect exit 2 with zero collections;
duplicate cache keys block every scope's DDL; conflicting unique/sparse definition
blocks every scope's DDL; ensure and repeated default inspect exit 0 with matching
reports; SQS-only inspect succeeds despite an unreachable Agenda Mongo URL; real
non-simple Agenda collation fails after acquiring pools and exits naturally after
cleanup; invalid duplicate mode exits 2; unsupported config exits 1 without its
secret sentinel. Ready/not-ready reports show **zero pools/Prisma clients/active
operations/resources**. Import guards reject Sails, rc, core barrel, compatibility
graph, connects/listeners at import, and signal changes. An ESM/TLA probe has
throwing business factories/migrations/bootstrap plus a scheduled unbound job:
none executes. No job, migration-ledger entry or Agenda logger collection appears.
Explicit revision backfill updates **1 then 0** active records on repeat, with
zero pools after cleanup and no ledger/job side effects.

Packed artifacts (SHA-256; result manifest retained in ignored
`.tmp/sails-retirement/p3-maintenance-pack/result.json`):

| Artifact                                                        | SHA-256                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `researchdatabox-sails-ng-common-0.2.1.tgz`                     | `6d23632ef3a9f4c59637fc9e8ca44e480e7c87d6218132bf3ca81289c9442a72` |
| `researchdatabox-agenda-sqs-backend-0.0.1-beta.9472.tgz`        | `76d426e7ab5d9c71af1fff96e528bf800970132eb5ea4431eb7d9a87c2a3720f` |
| `researchdatabox-raido-openapi-generated-node-0.0.3.tgz`        | `d40363198433495e887285046e26e5a7067917b7e690540e2ccb57ec48d30adf` |
| `researchdatabox-rva-registry-openapi-generated-node-0.0.1.tgz` | `31131336308eb0fdf0ecb2d59e2bc455a8b64597ebb3cafcfb75923d7c03b82d` |
| `researchdatabox-redbox-core-0.0.1-beta.9022.tgz`               | `daeeb3a257ff10eade4866b2c75444c0504441070b9e8cbf1745f6da7162f097` |
| `researchdatabox-sails-hook-redbox-storage-mongo-1.5.3.tgz`     | `e1b38316a4f1c887d67008577fa2f3c52c782ea6768c133b601b38e5e50eb0b2` |
| `researchdatabox-sails-hook-redbox-pdfgen-1.0.0.tgz`            | `13c8b501f1c945d239b722203e09806594157c0c92d1fca219ccf4b35a551db6` |
| `redbox-hook-dev-1.0.0.tgz`                                     | `9c83eeadd4fe11d70ad277bd4f2da2362a032619ea9fab4f3f0a7a1b25784c7d` |
| `researchdatabox-redbox-dev-tools-4.5.1.tgz`                    | `44e3932b952d083649d25f697428218ff570b88ab5eaa5f36c833b19e39e32a5` |
| `sr-esm-only-1.0.0.tgz`                                         | `e5a6e1e9187afde18781788d9c6c39a9862497e92c4ad60a14d318dfd05f2b89` |
| `sr-esm-hook-1.0.0.tgz`                                         | `89025988a1495236d6a36e21e7c1a9a197d6f332c2ee2ad8bfe3b91fe0b73c21` |
| `sr-commonjs-hook-1.0.0.tgz`                                    | `60241f39f9d9485118c478fab03c2b2d9991c52563d92ab1e352c9a78f4d4c9e` |
| `sr-maintenance-probe-1.0.0.tgz`                                | `e1e6e567d5b2a046e7a32f8bbb9dd5db6c48bc18a8128c0f2fa443fdb8869ea8` |

Limitations: selected bundled Mongo storage only; custom replacements must expose
their own explicit preflight. Registration/config modules are trusted executable
code and must obey the side-effect-free contract. DDL and revision backfill retain
existing nontransactional/partial-write behavior; stopped writers and verified
backup remain operator prerequisites. This is standalone maintenance proof, not
institution, authenticated topology, newer-major or mixed-version qualification.

## P3 closeout — Integrated verification and source manifest

Implementation snapshot: **`5ab36cc30c589a8e5ba5bbfe551138ae663de25e`**.
All P3 acceptance criteria above passed; SR-019–SR-025 are checked. No P4 task was
started, no branch/worktree was created or switched, and nothing was pushed.
Every implementation commit has the requested GPT-6.1-sol co-author trailer:

| Task   | Commit      | Main source                                                                                          |
| ------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| SR-019 | `504b83ea3` | `src/configuration/resolution.ts`, `loading.ts`                                                      |
| SR-020 | `365cd7fc6` | `src/configuration/deployment.ts`, `configuration-v6.md`                                             |
| SR-021 | `fe030dcc4` | `src/configuration/brand.ts`, `src/compat/sails/configuration.ts`                                    |
| SR-022 | `eb56d9811` | `src/application/Application.ts`, `migrations.ts`, extension composition and Sails bootstrap adapter |
| SR-023 | `a9f53a126` | `src/queues/AgendaQueue.ts`, `ScheduledWork.ts`, Sails queue/schedule adapters                       |
| SR-024 | `c7258c1b7` | persistence/runtime, request lifetime/host, native GridFS/storage/PDF owners                         |
| SR-025 | `5ab36cc30` | `src/maintenance/indexes.ts`, existing persistence maintenance, CLI and public storage exports       |

Final commands (qualified **Node 26.11.1 / npm 11.20.0**, same real
**MongoDB 8.0.34 / FCV 8.0**, Linux `agentvm` as SR-025):

```sh
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34902/redbox_prisma_p3 npm run test:core
LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p3_lifecycle npm --prefix packages/redbox-core run test:lifecycle:mongo
EXTENSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:34902/sr_p2_extensions node --test packages/redbox-core/test/extensions/storage-mongo.cjs
node --test packages/redbox-core/test/extensions/pdf-lifecycle.cjs
```

**All exit 0.** Full core **4,394 passing / 68 pending / 0 failures** (~2 min),
including the real Prisma persistence regression suite (record/GridFS/cache/index,
ledger, identity, leases and sessions). All **17** additional P3 unit cases execute
relative to P2's 4,377 passing baseline. The existing startup subprocess passed in
**11,145 ms**, within its unchanged 12-second deadline. This final full run did not
overlap a clean build or packed installation. No failed phase-wide run preceded it.

The **68 pending** cases are unchanged: **51 Figshare** controlled-HTTP/Mongo,
**7 SIEM** receiver/delivery (separate fixture inputs absent), **3 older standalone
foundation** (separate newer/authenticated Mongo input), and existing explicit
**2 RaidService / 2 TriggerService / 3 WorkspaceService** skips. They remain pending,
not release evidence. No required P3 real-Mongo test is skipped. Standalone runtime
fixtures remain deliberately isolated from core's global legacy test setup.

Final isolated lifecycle **11 passing / 0 failures/pending** (~4 s), standalone
storage/GridFS **3 passing / 0 failures/skips** (~3.5 s), PDF lifecycle **5 passing /
0 failures/skips** (~1.1 s). These repeat on the final snapshot after SR-025's
public storage declaration/export change. All owned clients/pools reach zero;
held-handler, late GridFS write, transport finish/abort and failed-stop retry
assertions remain enabled. Final build/strict checks, packed proof, focused tests,
complete **304-case real-Mongo storage** and **75-case PDF unit** results are
recorded in their task sections above. Logs remain local under ignored
`.tmp/sails-retirement/p3-*.log`; only summaries/hashes are committed.

No dependency versions or lockfiles changed during P3. No provider usage/quota
limit occurred. Remaining release qualifications (institution designation SR-005,
authenticated/topology/newer-major rehearsal and later full HTTP/upload/socket
composition) retain their existing task ownership; no new P3 blocker or decision
is outstanding. Custom replacement storage preflight and production stop/watchdog
grace limits are explicitly documented rather than claimed as qualified here.
The unrelated untracked `support/specs/graphql-record-metadata/` remains untouched.

Disposable-host cleanup: `docker stop --time 45 sr-p3-mongo8` and
`docker rm -v sr-p3-mongo8` succeeded. Docker warned that `--time` is deprecated
in favor of `--timeout`. A filtered container listing is empty; subsequent inspect
of both recorded anonymous volumes reports **no such volume** (expected exit 1),
confirming removal. No other container, volume or institution backup was touched.
The successful packed sandbox was removed by its runner. Final focused formatting,
`git diff --check` and commit-trailer audit pass; only this evidence closeout remains
after the implementation snapshot above.
