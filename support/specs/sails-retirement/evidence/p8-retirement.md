# P8 retirement evidence

Work starts at `ad5c68d3b`, branch `stack/sails-retirement`, shared checkout.
No worktree, branch switch, push or publication. Wiki is an ordinary tracked
snapshot on this branch; the user explicitly confirmed that it must stay so.
SR-005/045/049's institution designation gap remains unchanged.

## SR-051 — Generated-file reconciliation (in progress)

The SR-001 `app-shims-before.json` was compared against the actual working tree:
245 files, all 236 generated files match their recorded SHA256 exactly; nine
application-owned files (three migrations and six environment modules) are
preserved. One application-owned migration has changed since the baseline.
The offline `support/migrations/retire-v5-shims.cjs` defaults to inspection and
requires a trusted manifest, exact digest and ordinary path. It preserves edits,
unknown files and symlinks. It never generates output or imports the application.

Actual commands:

```sh
node --test test/tooling/retire-v5-shims.test.cjs
node support/migrations/retire-v5-shims.cjs . support/specs/sails-retirement/evidence/app-shims-before.json --apply
PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH" npm --prefix packages/redbox-core run build
```

Cleanup regression: **1 passed / 0 failed / 0 skipped**, including inspect-only,
exact removal, edited output, symlink preservation and traversal rejection.
Initial cleanup rejected the manifest's old model-shim paths after removing
preceding exact matches. The command now validates every candidate before
mutation and includes those obsolete model paths; retry exits **0** and removes
the remaining exact matches. All 236 are absent and the nine owned files remain.
Logs/reconciliation details stay in ignored `.tmp/sails-retirement/p8/`.

Core clean build: Node **26.11.1**, npm **11.20.0**, Prisma generation/schema
verification/TypeScript/copy **exit 0**. Shim generator, generation templates,
public loader export and former entrypoint generation calls have been removed.
`app.js` and `app.integrationtest.js` delegate to the sole Express executable.
Consumer tests/tooling conversion remains in progress; no P8 checkbox is claimed.

## Qualification status

No final P8 artifact or broad-suite result has yet been obtained. Earlier P7
results are historical inputs, not post-removal proof. Runtime, test/tooling,
documentation and final clean-artifact closure are still in progress.

## SR-052 — Runtime and dependency removal (not yet accepted)

The comparison host, `src/compat/sails`, generated-controller implementations,
loader/lift/bootstrap/policy/response adapters, ambient framework declarations,
framework config, service singleton registries and browser `sails.io.js` are
removed. Service import paths now expose the explicitly constructed owned domains.
Storage/PDF/development package entries expose `registerRedboxExtension`;
published historical names remain unchanged. The PDF audit global lookup and its
obsolete type augmentation were also found during review and removed.

Exact dependency changes, including **every removed lock entry**, are in
[p8-dependencies.json](p8-dependencies.json), compared with `ad5c68d3b`:

- Root: remove `sails@1.5.17`, `sails-hook-sockets@3.0.2`, `rc@1.2.8`,
  `include-all@4.0.3`, `typescript-require@0.3.0`, and unused duplicate
  `@uppy/companion@7.0.2`. Core retains the owned `@uppy/companion@7.1.1`.
- Core: remove `sails@1.5.18`, `skipper@0.9.8`, `skipper-gridfs@1.0.2`.
- Storage development dependency: remove `sails@1.5.17`.
- Six lockfiles were regenerated using Node **26.11.1**, npm **11.20.0**,
  `npm install --package-lock-only --ignore-scripts --strict-peer-deps
  --legacy-peer-deps=false --no-audit --no-fund`. Root/core/storage remove
  **351/217/255** lock entries respectively. The other three locks reconcile local
  package metadata. There are **zero added resolutions or resolved-version
  changes**. No package pin was broadened.

Repeated core builds use `npm --prefix packages/redbox-core run build`, which
removes old dist output, generates/copies Prisma contracts, checks the portal
configuration schema and runs TypeScript **5.9.3**. The fourth build exits **0**.
Storage/PDF/development/dev-tools builds also passed earlier in this P8 working
session. The development extension initially failed because it imported retired
loader types; it now declares its own inferred route/view/scenario data. A clean
rebuild of the final complete tree remains required.

`npm run lint`: latest execution **0 errors, 0 warnings**, including the
cross-package import-boundary check. This is source/build evidence only. Existing
node_modules directories still contain old packages; installed/packed/image graph
closure has **not** been established.

## SR-053 — Consumer and test conversion (in progress)

`compile:host` replaces the executable-host `compile:sails` command. Historical
`sails-ng-common` package command names remain. Root test fixtures now pass a
suite-owned fixture object and concrete repositories/domains; they do not install
service/framework globals. This migration is unfinished and is not full-suite
proof. The historical root test entry delegates to the owned Express fixture.
Figshare administration initializes the selected application without activating
HTTP/queue workers and always stops it. App migrations receive an explicit owner.

Dev-tools supports only the v6 archetype. Generators emit classes, explicit logger
inputs, plain reexports and authenticated named handler declarations. Angular app
scaffolding uses `page.root`, `page.t` and `page.bundleHash`, with named page
handlers requiring explicit binding. A further review fixed route duplicate
recognition across quote styles, range normalization to installed exact core/tool
versions, and rejection of nonexact custom dependency inputs. These changes do
not rename published packages.

Integration Compose files now select explicit configuration/profiles and session
inputs. Runners prepare disposable database indexes explicitly before serving.
The obsolete mounted email configuration shim is removed; selected configuration
supplies SMTP data. Build freshness hashes authored JavaScript/configuration and
`app.express.cjs`; it no longer assumes that a lift will recreate ignored shims.
The historical recovery driver still configures its **released-v5 process** with
v5 environment variables; those commands do not configure the v6 executable.

Executed focused checks (no new test exclusions/skips):

| Command/scope | Result |
|---|---|
| Three converted core service suites: RecordTypes, Cache, DomSanitizer | 61 passing, 0 failures/skips |
| `npm run validate:api-routes` with explicit route/auth configuration | 49 passing, 0 failures/skips |
| `npm --prefix packages/redbox-dev-tools test` after Angular route/local migration | 50 passing, 0 failures/skips; later pin/idempotency additions require rerun |
| Core bootstrap + brand configuration + actual Companion mount/policies | 26 passing, 0 failures/skips |
| Core log configuration | 10 passing, 0 failures/skips |
| `node --test test/playwright-harness/build-state.test.cjs` | 1 passing, 0 failures/skips |

Core focused command uses the package-local Mocha and Chai to avoid starting a
second dynamic import of a separately installed Chai copy:

```sh
cd packages/redbox-core
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require ./node_modules/chai \
  --require ./test/setup.ts --timeout 10000 \
  test/bootstrap.test.ts test/config/companionAuthorization.test.ts \
  test/services/ConfigService.test.ts
```

Justification for test changes: retired bootstrap tests now invoke real awaited
`ApplicationRuntime` stages; Companion cases traverse the actual Express mount
and authentication/brand/path policies, adding a foreign-brand denial. The 401
body now includes the owned API's `details` field. Logging tests inject namespace
or fallback loggers explicitly and exercise initialization cleanup/status and
cache-cause redaction without the removed second Sails lift log or captains-log.
The previous structured-logging test's dependency-absence skip is replaced with
an unconditional test of the owned logger. Existing assertions about structured
values, blank calls and sensitive causes remain exercised.

### Actual regressions/failures still being resolved

Full core Mocha attempts failed during loading, first on `src/sails`, then removed
`src/bootstrap`, then `src/config/http.config` from the old Companion helper test.
The bootstrap/Companion cases are now migrated, but many other controller/policy/
loader/comparison tests still import retired code. No completed core count is
claimed. A targeted run initially hit Node's ESM Chai loading race because the
root Mocha command preloaded a different package copy; the package-local command
above passes.

Root production-composition integration was executed with **real Docker MongoDB
8.0.34**, Solr **10.0.0**, Keycloak **26.8.1-0**, Mailpit, fresh `sr_p8_*` databases
and `/mnt/docker-storage/sr-p8-regression-files` byte directories. Mongo nofile is
**64000:64000**, memory 768 MiB and WiredTiger cache 0.25 GiB. Explicit index
maintenance exits **0**, reports ready, and ends with **0 pools/clients/resources**.

```sh
REDBOX_APPLICATION_CONFIG="$PWD/.tmp/sails-retirement/p8/regression-mocha.cjs" \
REDBOX_SESSION_SECRET=<disposable-test-secret> \
  bash support/integration-testing/run-mocha-express.sh
```

First root attempt failed on the removed controller base in the chronicle test.
The next full run executes **254 passing / 10 unchanged pending / 113 failing**,
including root cleanup's failed drain; this is a failure, not qualification. The
remaining issues include missing explicit repository owners, old merger/registry
APIs, lower-case legacy service keys, constructors without inputs and unfinished
fixture migrations. Owner calls and service keys have since been corrected;
results from reruns belong below. No assertions were removed to claim a pass.
Raw diagnostic logs remain ignored, not committed.

Provider images used in that run:

- Mongo 8.0.34: `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
- Solr 10.0.0: `sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`.
- Keycloak 26.8.1-0: `sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244`.
- Mailpit: `sha256:98b916bd3c8d61f7633a52d3ea2f58d00620cb01ca57ab59edde68c347a95365`.

## SR-054 — Documentation work and generation (not yet accepted)

Wiki pages are edited **in the main tracked snapshot**, per the user's correction;
there is no wiki submodule, separate checkout or wiki commit. Architecture,
services/controllers, loader, core types, configuration, development, tests,
installation, maintenance/configuration examples and migration guidance describe
the owned v6 entrypoints. [V6 client compatibility](../../../wiki/V6-Client-Compatibility.md)
lists the intentional design §1.3 public breaks, affected clients and remediation;
the upgrade/recovery runbook links it directly.

Executed on the P8 working tree using pinned Node/npm:

- `npm run doc:api`: **exit 0**, emits JSON/YAML/OpenAPI, Blueprint and HTML.
- `npm run docs:generate`: **exit 0**, **43 published surfaces / 523 advisory
  findings**. Retired shim/controller registries are no longer extractor inputs.
- Earlier `npm run docs:audit`: **exit 0**, 43/523; final rerun is still required.
- Earlier `npm run docs:test`: **4 passing / 0 failures/skips**; rerun in progress.

Generated site/health intermediates remain in their documented ignored output
paths. These figures are advisory reference-generation results, not broad runtime
qualification or final clean-commit artifact provenance.

## SR-055 — Outstanding final artifact gate

No post-retirement clean-commit npm-pack/Docker artifact has passed qualification.
Full P8 core/root Mocha, Playwright, general/OIDC/S3 Bruno, MongoDB 8/9 standalone/
replica/election/drain, upgrade/recovery and installed dependency closure remain
required. The new closure script is provisional and must itself be reviewed and
run alongside the original SR-001 inventory on the final commit. Neither an empty
runtime grep nor historical P7 counts close this gate.

## Continued retirement verification

The compiled RecordTypes fixture now uses the sole owned Express/ApplicationRuntime
composition. Concurrent and repeated **host initialization/activation**, rather
than the removed adapter's cache reference identity, must bootstrap one instance
and persist one definition. All three real-Mongo scenarios pass (same owner through
HTTP/stop, retained cleanup failure/retry, later extension failure with persisted
bootstrap writes). Command: `COMPILED_RECORD_TYPES_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p8_compiled npm --prefix packages/redbox-core run test:compiled-record-types:mongo`.
Result: **3 passing / 0 failures / 0 skips**.

Dev-tools, including the added exact-pin migration/rejection cases: `npm --prefix
packages/redbox-dev-tools test`: **52 passing / 0 failures / 0 skips**. PDF stale
emitted adapter files were explicitly removed and `npm --prefix
packages/sails-hook-redbox-pdfgen run compile` passes after their source deletion.

The migrated persistence foundation, application shutdown, request lifetime and
session middleware fixtures execute **58 passing / 0 failures / 0 skips**. They
pass owners to actual GridFS/session resources and retain abort, callback,
Observable, detached work, session save/touch/destroy/serialization failures,
coalesced drain failure and retry assertions. The old patched shutdown callback
is replaced with explicit owned drain/cleanup and ApplicationRuntime stop/status.
A first assertion expected `stopping` after failed stop; actual documented status
is `failed`, with retained cleanup and retry. Corrected without changing runtime.

The next complete root integration run improves to **394 passing / 10 unchanged
pending / 25 failing**; it is still a failed qualification. Failures identify a
non-writable task fixture byte directory, remaining missing constructor inputs,
role/context adaptation, schema context inputs, admin-token lookup, multipart
handling and failed final drain. The byte directory now uses a task-owned writable
path; dependency injection and context fixes are undergoing targeted rerun. The
preceding targeted config/model/persistence run had **68 passing / 1 failing**
(the new expected diagnostic path was `root`, actual rejected key was `responses`).
That diagnostic assertion now checks the real selected-source/key diagnostic.
No test exclusions or skips have been added.

### Continued SR-053 checks after `aff0dbf84`

- Root integration command, with disposable `sr_p8_regression13*` stores and real
  Mongo 8.0.34/Solr 10/Keycloak/Mailpit:
  `REDBOX_APPLICATION_CONFIG=.tmp/sails-retirement/p8/regression13-mocha.cjs REDBOX_SESSION_SECRET=<disposable> bash support/integration-testing/run-mocha-express.sh`.
  Result: **422 passing, 10 unchanged pending, 0 failures** (24 seconds). All
  application-owned resources, operations, Prisma clients and pools drain to zero.
  The former multipart timeout was a test import of the removed root
  `RequestChronicleHelper` export. The fixture now imports its explicit module;
  the streamed 1 MiB request and all chronicle/redaction assertions pass. No
  production upload behavior or test assertion was relaxed.
- Core lifecycle/cache/provider subset: package-local Mocha, the existing
  configuration brand/cache-runtime cases and `test/services/*-v2/*.test.ts`:
  **92 passing, 0 pending, 0 failures**. Configuration, DOI audit/client layers,
  Figshare bindings/metadata and RAiD token-cache ownership are explicit inputs.
- Final consumer lint: `npm run lint`, **0 warnings/errors**, 933 source files.
- Seven standalone integration Compose files pass `config --quiet`. The two
  overlay files fail intentionally when used without their documented base;
  each Express overlay/base general/OIDC/S3 pair and the Playwright/browser
  overlay/base pair then pass. These are configuration checks, not execution
  proof; real final suites and clean generated-app/artifact acceptance remain open.

Root fixture migration rationale: `test/integration/services/ConfigService.test.ts`
retains 35 scenarios. Imperative `mergeHookConfig`/hook-load mutation scenarios
now assert the corresponding v6 layer precedence, array/function handling,
immutable configuration, rejected unsupported inputs, explicit asset/template
lookup and declared factory selection. These retired loader assertions are
replaced by their implemented v6 contracts, not dropped to reduce the suite.
Other root cases bind the real selected domain instances and typed repository
owners through `test/helpers/portalFixture.cjs`; form projection and validation
helpers receive explicit collaborators. The full count remains 422/10/0.


### Core fixture migration checkpoint: records, validation and page languages

On the working tree based on `20fad0b3c`, Node `26.11.1` / npm
`11.20.0`, migrated domain fixtures construct the real plain implementations
with explicit repositories, configuration, logging, authorization, HTML sanitation,
and named operation callbacks. The 92 formerly evaluated record-hook expressions
are authored closures in a local operation map; no evaluator or comparison host
was reintroduced. The callable-reuse scenario now spies on actual named-operation
resolution and execution. Records/validation/schema cases retain their ACL,
revision/CAS, partial-save, schema, timeout and privacy assertions.

Commands (from `packages/redbox-core`, with the recorded Node toolchain on PATH):

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require ./node_modules/chai \
  --require ./test/setup.ts --timeout 10000 <explicit suite paths>
```

- `records-validation-second.log`: 512 passing / 4 failing. All four failures
  were missing fixture inputs for attachment security auditing or the exact
  Figshare named-operation key; corrected without changing the assertions.
- `domains-checkpoint.log`: 1,136 passing / 5 existing pending / 2 failing
  across 31 existing service suites. The two Solr inline-fallback fixtures
  now explicitly remove the injected queue as well as the mutable queue override.
- `users-second.log`: 162 passing / 0 pending / 0 failing across Users,
  Solr and Validator Visitor. OIDC parameter/state tests call the real explicit
  provider installer; HTML tests supply the real sanitizer and mode inputs.
- `core-build-page-language.log`: complete core build passed, including Prisma
  contract verification and portal configuration schema checks.

The page-language fixture exposed a production regression: sorting available
languages could select German before the configured/default English language.
The Express page owner now selects valid query/session language, configured
language/fallbacks, English, then the first available language. Existing page
language scenarios exercise that owner. Translation lifecycle methods remain on
its domain; request language/locals belong to the HTTP renderer. Cookie-specific
legacy assertions were replaced by checking the session's actual `langCode` and
rendered locals, which are the implemented v6 request contract. The shared page
preparation function is exported from its implementation module for focused
verification; it is not added to the package extension barrel.

These are incremental source checks, **not** the final full-core or clean-artifact
qualification. Core adapter/controller/policy fixtures and final matrix remain
outstanding; P8 acceptance boxes remain unchecked.

The combined rerun `domains-checkpoint-second.log` completed with **1,274
passing / 5 unchanged pending / 0 failing** (35 existing suite files, 27s).
Additional migrated fixtures were checked in the recorded focused runs:
`integrations-third.log` 92 passing, `doi-branding-third.log` 109 passing,
`appconfig-secrets-second.log` 45 passing, `page-utils-first.log` 11 passing,
and `workers-first.log` 30 passing. No new skips were introduced. These
source-fixture checkpoints do not close full-suite or artifact acceptance.

### Core fixture migration: navigation, vocabulary, queries and harvest

`services7-second.log`: **172 passing / 2 unchanged pending / 0 failing**
(Node 26.11.1, source based on `2328d2946`, explicit seven-file Mocha command
using the same ts-node setup above). `services7-first.log` had 14 failures;
all were fixture migration defects and passed after correction.

The seven existing suites construct Navigation, FormVocabulary, Vocabulary,
RvaImport, NamedQueries, Raid and HarvestRuns with their actual v6 inputs.
Harvest shutdown assertions now use ApplicationRuntime and await accepted event
writes; two authored local named hooks replace evaluated function strings.
The RAiD legacy-normalization case now verifies explicit JSONata mappings: the
retired adapter no longer normalizes unsupported configuration. Public-method
checks inspect the actual domain methods rather than a generated `exports()`
shim. Applicable business assertions and the two pre-existing pending RAiD cases
are retained. No production evaluator or comparison adapter was restored.

### Core fixture migration: publishing, projections and SIEM delivery

- `siem8-second.log`: **94 passing / 0 pending / 0 failing**, including native
  MongoDB delivery claims/expiry and real controlled HTTP receivers, plus all
  five existing Figshare vocabulary suites. Command used
  `SIEM_TEST_MONGO_URL=mongodb://127.0.0.1:29511/redbox` with the same explicit
  core Mocha runner above; MongoDB 8.0.34 remains a real Docker provider.
- `figshare8-third.log`: **122 passing / 0 pending / 0 failing** across publishing,
  configuration, managed-byte receipts, branding GridFS drain and form projection.
  Both use Node 26.11.1 and source based on `afe591df7`.

Figshare uses the actual v6 provider and explicit configuration/asset/metadata
closures. SIEM fixtures bind narrow ownership, configuration, enqueue and record
lookup functions; no process service registry. Branding drains its actual owned
read cursor before persistence cleanup. FormProjection and Forms own metadata
projection and template extraction respectively. The removed mergeRecord adapter
scenario now exercises the actual explicit-input merge owner. The removed global
service-fallback scenario verifies supplied configuration independently of module
registries, and missing development config uses the boundary's live-mode default.
These changes retain the applicable business assertions and introduce no skips.

Intermediate failures: `vocab8-first.log` 57 passing/1 failing (obsolete stub
target); `siem8-first.log` 93 passing/1 failing (fixture passed an unclaimed event
instead of its lease-bearing result, corrected); `figshare8-first.log` 78 passing/
4 failing and `figshare8-second.log` 107 passing/2 failing (missing explicit
inputs/old shim calls). All passed in the reruns above. Final artifact/full suite
acceptance remains outstanding.

### Queue lifecycle fixture migration

`agenda9-fifth.log`: **59 passing / 0 pending / 0 failing** (2s), using the
explicit core Mocha command above on Node 26.11.1 and source based on `d91c29b7a`.
The real Agenda processor/SQS HTTP receipt fixtures now construct the actual
v6 AgendaQueue, register owned resources explicitly, initialize and activate
separately, and stop through the real persistence resource lifecycle. Finite
authored named handlers replace global dotted-service lookup. HTTP completion
scenarios use composeHttpSession with their explicit owner.

Justified lifecycle assertion updates: processors stay stopped until index
validation completes; startup index failure admits no workers or completion
submissions. These replace assertions about the retired adapter's early processor
start. During drain, readiness closes immediately while resources remain owned;
tests check both closed admission and retained resources, then still verify
accepted writes, retry, bounded deadlines, release/acknowledgement and detached
caller refusal. Sanitized PersistenceError(code=cleanup) replaces exposure of
native unlock messages. Routing-only fixtures explicitly supply the already-active
state with their authored Agenda maps. No production behavior was stubbed to
restore the comparison adapter, and no skips were added.

Earlier `agenda9-first.log` failed to load the deleted session wrapper;
`agenda9-second.log` failed on the removed namespace export. `agenda9-third.log`
failed 39 cases; `agenda9-fourth.log` had 49 passing/10 failing while the old
readiness/start-order expectations were being migrated. The fifth run passes
all 59. These remain incremental checks, not full-core/artifact acceptance.

### Durable Figshare and path-rule fixture migration

Source based on `6782285e0`, Node 26.11.1/npm 11.20.0:

- `worker10-second.log`: **57 passing / 0 pending / 0 failing** (17s),
  `FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:29511/redbox` with the explicit
  core Mocha runner and `test/services/figshare-queued.test.ts`. The real MongoDB
  8.0.34 provider and controlled HTTP server execute claims, stale owners,
  heartbeats, lost delivery, admission/drain, generations, repairs, publication,
  owner identity and status-redaction scenarios. The provider, source-intent
  owner and pure status/configuration query functions receive explicit inputs.
  `worker10-first.log` had 44 passing/13 failures from deleted helper imports;
  migrating those imports/inputs resolved all failures without skips.
- `pathrules-first.log`: **12 passing / 0 pending / 0 failing** (41ms), same
  runner with `test/services/PathRulesService.test.ts`. Actual bootstrapPathRules
  and PathRules owners replace callback bootstrap and global role/brand lookup.
  Existing matching/read/write assertions remain; seed checks additionally
  verify both resolved role IDs and the selected brand. Public-method checks
  now inspect the domain's loadRules instead of a generated exports shim.

These are source checkpoints. Full-core and final clean artifact qualification
remain outstanding; P8 acceptance is not claimed.
