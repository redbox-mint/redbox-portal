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

### Application-owned configuration fixtures and HTTP boundary checks

`appconfig11-second.log`: **99 passing / 0 pending / 0 failing** (901ms),
Node 26.11.1, source based on `0d304ca8a`; explicit core Mocha runner with
`test/services/AppConfigService.test.ts`, `test/ConfigModels.test.ts`, and
`test/configmodels/ConfigModels.test.ts`. First run: 97 passing/2 fixture
failures (actual duplicate-name diagnostic and default API envelope selection),
both corrected. No new pending cases.

AppConfigs now receives explicit repositories/configuration/brand functions and
an application-local ConfigModelRegistry. Registry tests construct independent
instances. The unused process-wide comparison ConfigModels facade is removed;
the package exports the actual ConfigModelRegistry. Actual Express admin and
configuration write route owners execute the single/all/nested masking,
masked round-trip, sanitized AWS failure and SIEM credential-target 400 cases.
The helper fixes an authenticated brand administrator and bypasses CSRF only
for these focused domain-response checks; real security coverage remains in
the dedicated HTTP suites.

Justified replacement of retired conventions: directory-discovered
mergeHookConfig writes become awaited, named extension bootstrap work. The
unchanged-secret checks still verify two writes, one AWS resolution, preserved
references and a failed third write; initialization failure is observable.
Duplicate-directory key scenarios become duplicate explicit bootstrap/migration
work-name rejection before execution, with identical names permitted across
separate stages. V6 does not scan the old branded-config directory trees.
This checkpoint does not claim full core or final artifact qualification.

### Chronicle fixture migration

`chronicle12-first.log`: **44 passing / 0 pending / 0 failing** (308ms),
Node 26.11.1, source based on `c5b30cc16`, explicit core Mocha runner with
`test/services/RequestChronicleServices.test.ts`. The retired inherited
CoreService/CoreController wrappers are replaced by actual
recordServiceChronicle capture. Email, workflow hooks, datastreams, Solr and
AuthenticationAccounts receive explicit collaborators; authored hook names
replace evaluated function strings. Both OIDC and AAF callback outcomes,
redaction, error deduplication, interleaved async context, hostile getters,
late logging and module-copy context checks remain.

AAF callback tests target AuthenticationAccounts.aafAuthVerifyCallback;
transport strategy registration is owned and verified by the dedicated HTTP
provider suites. The user post-save case now asserts an owned promise, completes
the response before rejecting the hook, awaits the promise and checks the
original late-failure logging/redaction. This implements v6 ownership instead
of the deleted adapter's detached undefined return. No skips were introduced.
Full-core/artifact qualification remains outstanding.

### Build correction for page language inputs

`core-build-audit.log` exposed a TypeScript error in the earlier page-language
change: templateConfig's open dictionary did not declare the nested i18n input.
PagesHttpInput now describes the optional lng/fallbackLng data explicitly;
runtime selection and existing language behavior are unchanged. The same build
also caught the newly added authentication event helper missing from the HTTP
barrel; that export is included with its audit fix below.
`core-build-audit-second.log` completes Prisma generation/schema checks,
TypeScript 5.9.3 compilation and Prisma artifact copy with **exit 0** on Node
26.11.1. This is an incremental source build, not clean-package qualification.

### Audit lifetime and authentication event regressions

Source based on `2118c0d18` (page type correction isolated in `c55bd3f05`),
Node 26.11.1/npm 11.20.0. Existing drain/privacy fixtures now use explicit
AgendaQueue, SecurityEventService, Records, PrismaAttachments, HTTP session and
Express route/policy owners. No framework globals, legacy callbacks or new skips.

Regressions found and fixed in production:

- Record audit SIEM lookup delayed the HTTP response after the comparison
  adapter was removed. Records accepts an explicit follow-up retainer; production
  composition retains the work in both its request lifetime and application set.
  Workers/direct callers continue awaiting the same work. The migrated existing
  HTTP test against pre-fix Records/SecurityEvents reproduces **0 passing / 1
  failing**: “An optional SIEM lookup must not delay the HTTP response”
  (`audit13-regression-proof.log`, exit 1). Files were restored after this bounded
  regression check.
- Record/attachment capture now owns asynchronous brand lookup from admission
  through enqueue. A lookup admitted before quiesce finishes without being
  discarded by a second admission check; its active work prevents early closure.
- Production storage initialization now supplies the selected attachment audit
  emitter and retainer; adapter removal had left the default logging-only input.
- Login success is emitted after final session save, logout success after session
  invalidation. Session failures emit login failure. Invalid credential shapes
  emit failure without serializing the body; a bounded string username may be
  selected explicitly. The shared HTTP event function is used in production and
  the real-route fixture. One meaningful new assertion covers final session-save
  failure and forbids a premature login-success event.

Executed results:

- `audit13-first.log`: **10 passing / 0 pending / 0 failing**. All existing
  HTTP-response/nonblocking lookup, optional failure diagnostic, worker ownership,
  accepted enqueue and shutdown-drain assertions execute.
- `privacy14-first.log`: 33 passing/1 fixture failure (missing Express response
  `end` method); corrected without changing the behavior assertion.
- `privacy14-second.log`: **78 passing / 0 pending / 0 failing** (988ms), privacy,
  audit-drain and chronicle suites together.
- `audit-siem-final.log`: **70 passing / 0 pending / 0 failing** (3s), audit-drain,
  privacy, SIEM services, delivery and ownership suites; real MongoDB 8.0.34 claims
  and the controlled HTTP collector execute with
  `SIEM_TEST_MONGO_URL=mongodb://127.0.0.1:29511/redbox`.
- `lint-audit.log`: cross-package import verification and oxlint **0 errors /
  0 warnings**, 932 source files. `core-build-audit-second.log`: **exit 0**.

All use the explicit core Mocha runner above. These checks do not yet prove the
final installed production composition, whole core suite or clean artifact.

### Explicit migration and build-command fixtures

Node 26.11.1/npm 11.20.0, source following `df28923bc`. The existing migration
runner fixture now invokes runApplicationMigrations with local ledger, logger,
context and version inputs. Ordering, metadata, progress, executed-name exclusion,
failure halting and down forwarding remain covered. The former optional
REDBOX_SKIP_MIGRATIONS bypass case now proves that mandatory v6 migrations cannot
be bypassed by that retired variable. `migrations15-first.log`: **10 passing**.

Webpack fixtures invoke the actual explicit development build runner, exported
from wrapper-webpack.js. Development builds execute; only WEBPACK_SKIP=true
skips explicitly. Configuration validation happens before acquisition; authored
options remain unchanged; compilation is awaited and the compiler always closes.
The retired framework-global/environment skip conventions are replaced by these
implemented command contracts. Invalid options, four CSS-minification values,
compiler/stats/cleanup failures and pending compilation are exercised.
`tooling15-first.log`: **23 passing / 0 pending / 0 failing** (135ms), migration
and build-command suites together, using the explicit core Mocha command above.
This is source-level incremental evidence, not final clean-artifact proof.

### Hook, bootstrap and conservative retirement fixtures

`hooks16-first.log`: **32 passing / 0 pending / 0 failing** (169ms), Node
26.11.1, explicit core Mocha runner with hooks/{defineRedboxHook,hookDiscovery,
hookResources} and loader/{bootstrapShimRuntime,retirement} test files.

The deleted callback/arity adapter is replaced by real bindExtensionFactory/work
checks: exact inputs/results, awaited authored callback bridges (including default
and rest parameters), promise/error identity and synchronous failure. Application
bootstrap retains preparation/migration/core/extension order and both preparation
failure paths. Removed secret-bearing snapshot output is now asserted absent;
explicit post-bootstrap work failure is observable and cleanup completes.

Installed discovery uses the public v6 registration and optional explicit dev
allowlist. Name/priority precedence, resource roots, view/asset winners and
traversal protection remain; outside-root symlink protection also executes.
V6 invalid/unknown priorities fail before acquisition instead of the retired
loader's warn-and-ignore convention. Valid duplicate priorities are deduplicated.

Model/config removal tests invoke the actual offline opt-in reconciler: dry run
preserves exact files, apply removes only matching trusted hashes, repeated apply
is safe, custom/edited files survive. Old framework-only metadata is ignored
without executing its module; legacy persistence configuration remains rejected.
These changes replace removed runtime generation/startup deletion conventions
with their implemented v6 contracts; no runtime compatibility facade or skip was
introduced. The whole core suite still needs the remaining consumer migrations.

### Async loading, configuration and contributor fixture migration

`loader17-first.log`: **41 passing / 0 pending / 0 failing** (171ms), Node
26.11.1, explicit core Mocha runner, loader/{loader,
record-contract-contributor-loader}. Real installed temporary packages execute
native async registration; no factory or migration acquires resources offline.

Preserved assertions include branding-array privilege displacement, named Agenda
job/options merging, scoped dotted package names, priorities and intentional
factory replacements, ordered config/bootstrap/routes, independent lexical
migration ordering/attribution, invalid exports, duplicate migrations and sanitized
internal import/registration errors. V6 accepts awaited async registration and
rejects missing installed dependencies and ambiguous duplicates in every
execution mode. Local migration directories are not implicitly executed.

Deleted generation/write helpers are tested through actual conservative offline
reconciliation (missing/edited/exact content and unchanged inspection timestamp)
and actual extension loading (no output under development/production, empty
folders or legacy marker; authored files/markers remain). Generated bootstrap,
config/migration/API-route and form source-text assertions become checks of real
resolved declarations plus absence of generated files. Core's read-only form is
always available; demo forms require explicit extension declarations independently
of the retired LOAD_DEFAULT_FORMS switch. This is the current implemented v6
contract, not an assertion change to bypass a failure.

Contributor discovery now uses neutral declarations and explicitly bound
implementations. Core coverage, deterministic component ordering, package
attribution, duplicate diagnostics, malformed/throwing registrations and implementation
identity remain. Invalid/unbound registrations fail closed without generating a
RecordSchemaService shim; v6 does not continue startup with invalid declarations.
No tests are skipped. Whole-suite and installed-artifact verification remain open.

### Static headers, parser exclusions and Companion popup regressions

Node 26.11.1/npm 11.20.0, source following `1b25aedd1`.
The deleted HTTP-config suites now exercise actual Express middleware and declared
PageArtifacts rather than framework globals, Skipper or generated config imports.
Existing escape/origin/Secure-cookie, static path, cache lifetime/no-cache suffix,
parser exclusion and hook/core specificity assertions remain.

Production fixes found while retaining these assertions:

- An actual fingerprinted static bundle returned `public, max-age=0`; the bounded
  `static-headers-regression.cjs` reproduction fails exit 1 on the pre-fix tree
  (`static-headers-regression.log`). Page headers now preserve private session-age
  caching, configured page.noCache suffixes, immutable fingerprinted artifacts,
  Expires/Pragma and popup-compatible COOP. Public immutable caching is applied
  only after an actual declared static file resolves. Existing or deferred
  Set-Cookie headers are suppressed for those public artifacts. The same real
  HTTP reproduction passes exit 0 (`static-headers-fixed.log`).
- Explicit raw parser mounts now match case-insensitively, agreeing with the
  host's Express routes, and retain mount-boundary checks. First migrated run:
  **19 passing / 1 failing**, uppercase exclusion mismatch (`http18-first.log`).
  No assertion was weakened; the actual parser owner was fixed.
- The inert, escaped Companion send-token popup response moved to its own module
  and the real authenticated/membership-protected Companion mount. Production
  supplies its canonical configured app URL. Responses retain no-cache/CSP and
  HTTPS Secure cookies. Actor and brand authorization still precede delivery;
  callback/shared secrets do not replace authentication.

`http18-third.log`: **40 passing / 0 pending / 0 failing** (1s), HTTP-config,
hook-static, Companion authorization and HTTP middleware suites together, explicit
core Mocha runner. New focused assertions check public-artifact cookie suppression,
actual authorized/denied popup delivery, HEAD/no-write behavior, malformed decoding,
symlink boundaries and owned-route precedence. Raw parsing uses explicit concrete
mount inputs; retired dynamic global pattern/Skipper dispatch checks are replaced
by actual raw bytes and ordinary Express parser outputs.

`core-build-http18.log`: clean incremental core build **exit 0** (Prisma
contracts/schema, TypeScript, copied artifacts). `tsc-http18-final.log`: final
source typecheck **exit 0** after cookie suppression. `lint-http18.log`:
cross-package imports pass, **0 errors / 0 warnings**, 934 files. These are source
checks, not the final clean installed artifact or whole-suite qualification.

### Explicit logging, context and reference-persistence fixtures

`utilities19-first.log`: **75 passing / 0 pending / 0 failing** (862ms),
Node 26.11.1, explicit core Mocha runner, config/logConfig,
utilities/{RequestChronicle,ContextVariableUtils}, unit/reference-persistence.
Chronicle receives explicit retention settings and Express request facts;
route-option merge and module-copy identity assertions use ordinary Lodash.
ContextVariables receives its local configuration/logger. No process framework
registry is installed or restored by these suites.

Namespace/Pino/logfmt/error-redaction assertions remain, with explicit extension
logger binding replacing the deleted CoreBase getter. The inherited generic
getObservable test now exercises actual repository-backed Asynchs.get: it stays
cold and shares the first result or rejection across subscribers. All reference
predicate/projection/tenant/BSON/JSON contracts remain. The source comment now
describes explicit chronicle settings. No new skips or weakened assertions.

### Explicit Oni and Figshare binding fixtures

Node 26.11.1, source following `94b97dcfd`. Oni fixtures now pass local current
configuration/brand/creator/record/audit ports and owned publish work. The actual
Oni Effect program receives its logger. Figshare bindings/context use their actual
per-instance factories and local crosswalk/brand/logger ports. Sequential
vocabulary fixtures discard an unused framework import and empty global-restoration
loop. No framework globals remain in these three suites.

`integrations20-first.log`: 68 passing/2 fixture failures. Inspection found an
over-broad cast-edit expression had also removed three scenario bodies. The Oni
file was restored from its committed version and converted with bounded balanced
cast edits. A scripted check confirms **all 46 original Oni scenario titles in
identical order**; the actual RO-Crate publication, committed-write/failed-ingestion
and disabled-ingestion cases are retained. No incomplete first-run result counts
as acceptance. `integrations20-second.log`: **73 passing / 0 pending / 0 failing**
(638ms), services/{figshare-bindings,OniService,FigshareVocabularyServiceSequential},
explicit core Mocha runner. All mapping, brand resolution, conditional publishing,
audit/writeback, OCFL/Flydrive, crosswalk fallback/privacy and sequential partial
failure contracts execute. The deleted exports() adapter assertion now checks the
actual public exportDataset operation. No skips were introduced.

### Explicit branding and real persistence fixtures

Node 26.11.1/npm 11.20.0, source following `d4732076b`. Branding positive-integer
validation receives explicit config/logger; migration fixtures use local owners.
Persistence tests use structural PersistenceOwner types, actual BrandingLogo ports
and composeHttpSession with awaited preparation. No global framework/storage
registry is installed. Existing legacy malformed-GridFS cursor-kill/session-end,
shared session transport, restart/fencing, raw BSON and durable concurrency checks
remain; no assertions or scenarios were dropped.

Explicit core Mocha runner (`--no-config --require ts-node/register/transpile-only
--require chai --require test/setup.ts`, TS_NODE_PROJECT=test/tsconfig.json):

- `PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:29511/p8_prisma21`,
  model/BrandingTypeface, migrations/BrandingTypefaceBackfill and
  integration/PrismaPersistence: **53 passing / 0 pending / 0 failing** (4s),
  `persistence21-first.log`. Real MongoDB 8.0.34; disposable database dropped.
- unit/{prisma-runtime,storage-named-query,persistence-index-preflight} plus
  services/NamedQueryService: **60 passing / 0 pending / 0 failing** (2s),
  `persistence21-unit.log`.
- `P1_MONGO_URL=mongodb://p1_fixture:p1-only@127.0.0.1:29512/wr_p1_core?authSource=admin`,
  integration/PersistenceFoundation: **3 passing / 0 pending / 0 failing** (9s),
  `foundation21.log`. Actual authenticated MongoDB 9.0.4, image
  `mongo@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`,
  task-owned `sr-p8-foundation-mongo`, nofile 64000:64000, 768 MiB limit,
  WiredTiger 0.25 GiB, host network/127.0.0.1:29512.

These focused source results do not close the final artifact or matrix gates.

### Explicit authentication, route context, path authorization and CSP fixtures

Nine retired policy suites now exercise createHttpPolicies, actual per-application
Passport strategies, PathRules, pageCsp and page headers. A local fixture supplies
observable Express request/response facts and explicit ports; it implements no
legacy policy facade. The same 91 scenarios execute (30 initial basic-policy
cases plus 61 path/CSP cases). Actual guest/admin/researcher paths, case/trailing
slash/tenant matching, schema Problem Details/media/cache headers, nonce identity,
Redoc exceptions, analytics allowlists and parser-independent context remain.
Failure capture is now explicitly awaited before the 403 response.

Intentional v6 scenario conversions (design authentication/authorization rules):
anonymous APIs return 401/Bearer rather than 403/continue; authenticated actors
come from Passport, never session.authenticated/session.user; explicit bad bearer
credentials cannot fall back to a valid session and provider errors propagate.
Brand/portal live in validated immutable request context rather than mutable
framework options; missing params/unknown brands fail 404 without default-brand
disclosure. Transport-looking prefixes do not alter route params. The retired
Companion flag cannot bypass current path ACL. Configured noCache suffixes belong
to page headers; protected noCache policies always set no-store. CSP consumes the
selected explicit config/analytics snapshot: tests of old config-location lookup
and global branding callback failure become direct snapshot/absence tests, since
those ambient lookups no longer exist. Header/nonce and analytics security
assertions are retained; each request gets a distinct nonce.

Explicit core runner, Node 26.11.1: `policies22-first.log` **30 passing/0 pending/0
failing**. `policies23-first.log` failed to load due to fixture syntax; corrected.
`policies23-second.log` **38 passing/1 failing** (stale Services.PathRules import);
converted to actual PathRules. `policies23-third.log`: all nine files together,
**91 passing / 0 pending / 0 failing** (222ms). No production failure was bypassed
and no skip introduced. Formatting uses pinned Prettier. Full-suite gates remain.

### Chronicle observer isolation and parser boundary regression fixes

A bounded reproduction compiles the committed Express middleware from `dcb47adaa`
in memory (original relative module resolution), supplies its real router and
injects a failing Chronicle.finish. `chronicle24-regression.log`: **exit 1**,
`Got unwanted exception: observer failed` escaped the response event. The same
reproduction against the working implementation passes **exit 0**,
`chronicle24-fixed.log`. Earlier reproduction setup errors were corrected before
this result; they do not count as observed production failures.

The actual Express owner now installs explicit httpRequestChronicle and
httpBodyParser middleware. Chronicle start/completion/transport errors cannot
break dispatch or escape finish/close; downstream dispatch remains outside the
observer catch and runs once. Parser errors retain only status/type and a generic
message before extension middleware can see them; raw bodies/excerpts/causes
cannot leak through a later fallback logger. URL-encoded parameter overflow now
returns 413 (matching byte overflow), rather than generic 500. Malformed JSON is
400. No parser/error response returns private content.

The two retired middleware suites retain all 18 scenarios using the real Express
owner, recordServiceChronicle, direct owned error handler and StreamingMultipart
with actual temporary files. Buffered/streamed/authored callback bridges still
prove exact bytes, async context, service/controller error deduplication, staged
cleanup, no private-body capture, simultaneous request isolation, aborts and
observer failure isolation. The removed framework process-event registration
scenario becomes the actual pre-routing Express error path: repeated capture is
deduplicated and raw error text is excluded. Framework fallback 500 assertions
become deliberate v6 parser 400/413 responses; Skipper callback registration
becomes awaited streaming finalization. No scenario was skipped.

Node 26.11.1, explicit core runner: `chronicle24-first.log` **15 passing/0 pending/0
failing** (chronicle + existing HTTP middleware); `chronicle24-second.log` adds
both parser and full existing StreamingMultipart suites: **29 passing / 0 pending
/ 0 failing** (1s). `tsc --noEmit --incremental false`: **exit 0**,
`chronicle24-tsc.log`. Pinned Prettier and git diff --check pass. Whole-suite and
clean-artifact gates remain open.

### Actual query, search, harvest and configuration HTTP fixtures

Six former controller suites now use actual local HTTP through the production
route mounts and createHttpPolicies. Their local fixture supplies explicit
collaborators and controlled Admin identity; Express uses the same extended
query parser as ExpressHost. It implements no controller facade. All 37 existing
scenarios remain, including query tenant/name/mutation checks, override headers
and failed reset, literal false bundle options, harvest page caps/missing runs,
search exact/facet maps and audit dates/status/page validation.

Regression found with the actual namedQueryTarget refusal: unscoped/unknown
collection create/update returned 500 instead of the retained 400 validation
contract. `queries25-regression.log`: **16 passing / 3 failing**, all three
500-versus-400. Query writes now map only controlled PersistenceError with code
named-query-compatibility to a sanitized 400 response. Stored-definition recovery
instructions/native errors do not become API error text. Not-found/duplicate
mappings remain 404/409; raw backend errors remain sanitized 500.

Test-conversion justification: empty path names never reach a parameterized
Express action. GET of the collection URL lists definitions; nameless PUT/DELETE
return route 404 without invoking mutations. Invalid/reserved body names still
return 400. Missing-update fixtures now use the real domain's 'not found' error
rather than the deleted controller's alternate 'was not found' text. Unsupported
models use actual explicit target refusal instead of deleted model introspection.
Search removeAll now asserts the mandated tenant-scoped removeBrand operation,
replacing the unsafe cross-brand wildcard assertion. Indexing requires the loaded
record's current brand. All data/status/query-shape assertions remain; no skips.

Node 26.11.1, explicit core Mocha runner: `queries25-first.log` **30 passing / 0
pending / 0 failing** after the fix; `queries25-second.log` adds search and
integration-audit suites: **37 passing / 0 pending / 0 failing**. Source-only
results; final full-suite/artifact qualification remains outstanding.

### Page language options and owned navigation fixtures

The actual committed preparePage returned disabled languages and the cimode test
locale to the browser. After correcting an invalid empty-artifact fixture,
`pages26-regression-actual.log` compiles the `fa6db9e12` page module in memory and
shows the real failure (**exit 1**): both disabled French and cimode appear in
availableLanguages. The same bounded reproduction against the working source
passes **exit 0**, `pages26-fixed.log`.

Page preparation now filters disabled/test languages, fills absent display names,
uses configured supported-language options when no bundles exist, and safely
falls back to English with a generic warning if language acquisition fails.
A disabled language cannot be selected with lng. The explicit PagesHttpInput
states the consumed supportedLngs and enabled fields; no global lookup or
unsupported config alias was added. Existing configured selection precedence is
unchanged.

Three retired policy suites retain all 14 scenarios through actual preparePage
and Navigation. They check explicit page locals, current-brand translation,
awaited language preparation, menu/panel/sidebar resolution and fallback paths.
Framework request/response local mirroring becomes the explicit locals returned
for rendering. Navigation failure assertions use the actual owner's error logger
rather than the deleted policy wrapper's warning logger. Throwing configuration
getters exercise each actual resolution catch; translation fallback itself does
not throw. An initial malformed empty-artifact fixture caused all cases to fail;
corrected to existing absolute view/asset roots. A subsequent run exposed three
fixture assumptions (empty panel filtering and translation fallback); corrected
using actual valid panel items and throwing resolution inputs, without removing
assertions or scenarios.

Node 26.11.1 explicit core runner: `pages26-third.log` **14 passing / 0 pending / 0
failing**; final assertions rerun in `pages26-fourth.log` with the next method/socket
slice (**25 passing total / 0 pending / 0 failing**). `tsc --noEmit`: **exit 0**,
`pages26-tsc.log` (also checks the preceding named-query fix). No skip introduced.

### Route methods and socket credential fixture retirement

The two deleted prepWs/HEAD policies' 11 scenarios now exercise actual
prepareHttpMiddleware.authenticateCredential, its MemoryStore and real HTTP route
mounts. Current v6 sessions resolve authoritative actors; absent/null/old session
credentials are denied without deserialization; stale session.user never supplies
permissions and no second user serializer/authentication method is installed.
The actual refresh route rejects HEAD with 405/Allow: GET/empty body and no side
effects. Explicit GET refresh and validated POST/PUT/DELETE operations execute
once through their actual route owners. This replaces the retired global HEAD
policy's 400 and the removed virtual-request/session snapshot patching, per the
intentional v6 method/socket/session changes.

Node 26.11.1 explicit core runner: `pages26-fourth.log` **25 passing / 0 pending /
0 failing** including the preceding 14 page scenarios. All 11 method/socket cases
execute, no skips or failures. No production change was needed for this slice.

### Final policy consumer retirement and composition-scoped API resolution

The remaining three policy files retain their 30 scenarios using actual Express
Chronicle, Companion/resumable route mounts, neutral API contracts and the owned
HTTP error boundary. The 12 shared-secret scenarios now assert the deliberate v6
actor requirement for absent/wrong/correct secret, public/local/private/proxied/
IPv4-mapped/RFC7239 peers, PATCH/HEAD resume and unrelated DELETE. Authenticated
brand members dispatch exactly once; missing brand membership returns 403; no
legacy bypass flag is installed. The four Chronicle privacy scenarios keep raw
preview tokens out of diagnostics while leaving the request path unchanged.

The 14 API-validation scenarios retain independent params/query/body/file checks,
operation redaction, repeated If-Match refusal, raw schema Problem Details/cache/
Vary in both versions, route identity and sanitized unexpected failures. Missing
routes now use the actual router's 404 (the retired policy's 500 was a framework
resolution artifact); unknown paths do not generate private-identifier logs.
Unexpected validation exceptions are handled by the real generic HTTP error
boundary rather than the deleted policy's logger. Neutral validation returns its
normalized value directly instead of mutating req.apiRequest. The sole remaining
unit consumer now creates its own resolver; unused process-level route cache and
legacy convenience exports are removed from source.

Node 26.11.1 explicit core Mocha runner: `policies27-first.log` **4/0/0**;
`policies27-second.log` **16/0/0**. Initial combined run `policies27-third.log`
**78 passing/1 failing**: the fault-injection fixture's getter-only req.params
prevented Express restoring router state and kept a listener open. Stopped that
specific test process and made the fixture property writable through a restoring
setter. `policies27-fourth.log`: **79 passing / 0 pending / 0 failing** (17s), all
three files plus the existing 49 API-route cases. No production workaround, test
skip or weakened security assertion was introduced. Full artifact gates remain.
Source `tsc --noEmit --incremental false`: **exit 0**, `policies27-tsc.log`.
Pinned Prettier and git diff --check pass.

### SIEM HTTP ownership and controlled query failure boundaries

The SIEM suite's 93 scenarios now use neutral contract inputs and actual owned
query/SIEM HTTP mounts. Existing redaction, masking, target-change refusal,
page-two brand isolation, date bounds, page limits, failed-state extraction,
configuration defaults and operation-failure assertions remain. Its 20 obsolete
session-brand scenarios become explicit missing/unknown/blank/numeric route-brand
refusals (404 before domain access). Strict query validation now rejects malformed
blank/non-string filter requests before querying, then separately verifies default
pagination on a valid empty query. Valid enum filters are sent in canonical form;
request validation still checks malformed inputs. Response assertions use actual
wire data and selected context rather than a stubbed controller BuildResponse.

Five real production failures are isolated after correcting two fixture-shape
assumptions (BrandingModel instance versus plain value, and getBrand's typed
lookup signature). `siem28-regression-confirmed.log`: **88 passing / 0 pending /
5 failing**. Three query-read failures leaked unexpected backend messages; two
SIEM save outages incorrectly returned 400. Query reads now admit public status/
messages only from owned QueryInputError, AuditReadError or ReportConfigServiceError
with a 4xx status. All other failures are sanitized 500, including spoofed status
properties and non-Error rejections. The report-results failure envelope retains
its existing 200/status:false shape with a sanitized message. SIEM save outages
are 500; controlled SiemConfigurationError retains actionable 400 messages;
collector diagnostics remain sanitized 400. No raw backend text becomes a response.

The generic AppConfig suite retains 17 scenarios with an actual explicitly
constructed AppConfigs and repository ports. REST and browser-form writes use
actual configuration routes and the same service. All nine reserved own header
names, literal dotted-secret header masking/restoration, changed masked target,
invalid budget, and sanitized storage outage cases execute without globals.
Seven focused query-error cases additionally cover v1/v2 sanitation, spoofed
status, string rejection, controlled audit/report 403/404 and report-result shape.

Node 26.11.1 explicit core runner: `siem28-fixed.log` **125 passing / 0 pending /
0 failing** (SIEM plus named-query/integration-audit/harvest/search suites);
`siem28-final.log` **100/0/0** (SIEM plus query-error cases);
`siem28-appconfig.log` **17/0/0**. `tsc --noEmit --incremental false`: **exit 0**,
`siem28-tsc.log`. Pinned Prettier passes. Earlier `siem28-regression.log` included
two fixture errors alongside the five confirmed production failures. No skips.
Whole-suite and final artifact qualifications remain outstanding.

### Metadata, dashboard and record-audit controller consumer retirement

Three deleted-controller suites retain all **31** scenarios (record audit 18,
record-type discovery 5, dashboard configuration 8). They now exercise actual
HTTP mounts, EJS pages, RecordAuditViews and explicit domain ports. The page
fixture initializes and closes the real ordered PageArtifacts and supplies a
local session; it has no legacy controller facade. Audit ordering/date bounds,
diff labels, missing/invalid event times, translation keys, admin-only diagnostics,
pagination, DOI context and missing trace/event ids remain asserted.

Intentional context conversions: a nameless page route is 404; invalid brand
segments are refused rather than borrowing another brand. Real view authorization
requires an explicit record grant, so the page fixture includes the granted
actor's username instead of stubbing a controller's access result. Record-type
HTTP uses valid public brand/portal names; the pure public URL builder separately
retains encoding checks for spaces and embedded slash segments. HTTP values are
compared by data rather than in-process object identity. Dashboard v2 structured
warning/fingerprint details are checked on the wire, and the actual retired
/defaults route returns 410. Admin route declarations replace deleted exported
controller-method metadata; owned CSRF behavior remains covered by the HTTP suites.

Node 26.11.1 explicit core runner, `metadata29-second.log`: **31 passing / 0 pending
/ 0 failing** (821ms). First attempts failed on fixtures (invalid public HTTP brand,
nonexistent /profiles retirement route, missing actual record grant and a local
variable shadow). Corrected to actual declared paths/ports; no production change,
scenario deletion or skip. Pinned Prettier and git diff --check pass. Complete
core/artifact qualification remains outstanding.

### Vocabulary list/error and notification defaults regressions

The 18 scenarios across browser/API vocabulary, configured actions, declared page
titles, named-query parameters and notification options now use owned HTTP/EJS and
explicit ports. Callback-style actions become selected authorize/execute operations
with exact facts, awaited data and one audit. The two public notification safety
cases now check v1/v2 requests; direct controller invocation is retired. They use
the actual Email sender and inspect transport messages, retaining exclusion of
client attachment paths, arbitrary headers and recipient/subject overrides.

Actual regression `vocabulary30-regression.log`: **5 passing / 2 failing**, browser
unexpected create error changed 500 to 400 and browser list lost its pagination
envelope. Restored browser/read failure statuses and the shared list envelope;
page calculation also preserves the zero-limit fallback. API mutation refusals
retain their existing 400. Provider failure details remain sanitized as required
by v6: the old raw RVA message assertion becomes actionable retry/review guidance
and a private-content exclusion, while retaining status/delivery assertions.

Actual regression `notifications30-regression.log`: **6 passing / 1 failing**.
Supplying a public replyTo discarded trusted configured headers. The owned Email
sender now merges trusted defaults into a fresh message before applying explicit
send options and mandatory recipient/subject/from fields. Existing mutation and
successive-send isolation tests remain. No request-supplied arbitrary options are
admitted by the public route.

`operations30-final.log`, Node 26.11.1 explicit core runner: **32 passing / 0 pending
/ 0 failing** (18 migrated cases plus 14 existing Email cases). First page-title
attempts failed solely on EJS whitespace; assertions now compare the trimmed title
element rather than matching exact markup whitespace. Pinned Prettier passes.
No skip or removed scenario; full-suite/final artifact gates remain outstanding.
Source `tsc --noEmit --incremental false`: **exit 0**, `operations30-tsc.log`.

### Form vocabulary response-code regression and form discovery retirement

The remaining form-vocabulary and form-management controller consumers retain all
30 scenarios through actual HTTP mounts and explicitly constructed Forms. Safe
operation discovery excludes internal policy; missing/foreign record contexts
fail closed. Vocabulary tests use selected brand/portal ports, real parameter and
query validation, and no framework controller facade. Missing path parameters
return route-level 404; invalid pagination is exercised with an otherwise valid
query identifier before any domain access.

`formvocabulary31-regression.log`: **22 passing / 0 pending / 4 failing**. Actual
migration exposed lost per-action failure codes and invalid-parent-id status.
Restored the established action-specific codes and controlled children 400, while
unexpected provider/native messages remain sanitized. `formvocabulary31-fixed.log`:
**30 passing / 0 pending / 0 failing** (535ms), Node 26.11.1 explicit core runner.
Source `tsc --noEmit --incremental false`: **exit 0**, `formvocabulary31-tsc.log`.
Pinned Prettier passes. No scenario removed or skipped. Full suites and final
artifact qualification remain outstanding.

### Figshare administration consumers and numeric HTTP boundary

Both deleted Figshare controller suites retain **64 scenarios** using actual
Figshare HTTP mounts and selected actor/brand ports. All list envelopes, page
calculations, filters, revision mappings, typed 404/409/410/422/502 failures,
preview/clone/crosswalk payloads and bodyless 204 remain asserted. Actual dispatch
exposed six numeric-port discrepancies: query strings were cast to numbers only
in TypeScript, permitting domain parseInt to accept malformed values. The HTTP
owner now converts bounded safe integers and refuses malformed/negative/zero-limit
pagination or revisions before any domain access. One additional scenario checks
six malformed numeric requests. Source/runtime uses no implicit framework ports.

Intentional v6 fixture conversions: authoritative actors replace request-user/
empty-brand fallbacks; unknown brand is 404 and absent actor 401, with no domain
call. Missing identifiers, required scope/body fields and malformed arrays are
refused before execution; valid explicit empty collections/defaulted optional
fields and mapping normalization are separately verified. Unexpected errors and
non-Error rejections are sanitized 500, while owned vocabulary errors keep their
mapped statuses/details. Real HTTP uses shared private/no-cache headers instead of
stubbed controller headers. Valid 24-hex resource ids replace synthetic path ids.

`figshare32-second.log`: **29 passing / 0 pending / 35 failing**, including fixture
assumptions plus numeric-port discrepancies. `figshare32-third.log`: **63/0/1**;
the remaining failure was an overbroad migration-script assertion applied to the
valid unrecognized-op case. Corrected that fixture. `figshare32-final.log`:
**65 passing / 0 pending / 0 failing** (1s). The eager rejected-promise fixture now
rejects when invoked, removing an unhandled-rejection warning without altering
its non-Error failure. `figshare32-tsc.log`: source TypeScript **exit 0**.
Node 26.11.1 explicit core runner; pinned Prettier and git diff --check pass.
No scenario removed or skipped; artifact gates remain outstanding.

### Declared views, user routes and relationship authorization consumers

Four deleted-controller suites retain **26 scenarios** (304 response 1, ordered
views 11, user routes 4, relationships 10). Views now render actual EJS with
PageArtifacts and explicit ordered extension/core roots. Tests retain branded
candidate precedence, core/extension layouts and partials, optional head locals,
error templates, unknown-URL context and plain-text terminal error fallback.
304 tests use actual schema routes in both API versions and assert bodylessness,
ETag, Cache-Control and Vary. User tests check actual login markup, credential-safe
identity profile, mapped lookup results and sanitized OIDC discovery failure;
configuration is no longer echoed/redacted through a deleted controller logger.

Relationship tests now use actual HTTP record-read routes and access checks with
real grants rather than stubbed controller authorization. They retain no-traversal
checks for denied/foreign/tenantless/missing roots, filtered nodes/edges/counts,
changed traversal root, and graph/pagination shapes. The internal-caller case now
uses the shared domain filter with actual access logic. Missing path OID is 404
before metadata; unexpected storage failure is sanitized but logged privately.

Initial view attempts failed on fixture assumptions (exact cache directive and
missing merged generateToken port); initial login assertion expected a form action
instead of the actual embedded local-auth application. Corrected to actual
contracts. `relationships34-first.log`: **26 passing / 0 pending / 0 failing**
(572ms), Node 26.11.1 explicit core runner. Pinned Prettier and diff check pass.
No production change or skip; whole-suite/artifact qualification remains open.

### Download consumers now exercise real HTTP cancellation and stream cleanup

All **15 scenarios** (browser attachment, browser datastream and API datastream,
five each) now run actual datastream route mounts and access logic over local HTTP.
They check original complete bytes and response finish, mid-stream disconnect,
late storage-stream arrival after disconnect, source error without another
response, and the next storage request with an Agent limited to maxSockets:1.
Selected brand/actor and attachment ownership use explicit ports and real grants.

Initial fixture attempts used events.once for an expected errored stream close,
which rejects on the preceding AbortError, and a fully buffered storage response
could close before the cancellation observer attached. `downloads35-first.log`
records those failed/timeout cases; stopped only that task's Mocha PID 3322324
after inspecting the blocked old fixture. Corrected expected-error event handling
and made the storage provider actually stream until cancellation. The follow-up
request still must execute/finish within its existing 2s deadline. No production
workaround or weakened cleanup assertion was needed.

`downloads35-second.log`: **15 passing / 0 pending / 0 failing** (223ms), Node
26.11.1 explicit core runner. Pinned Prettier and diff check pass. No skipped or
removed scenario. Whole-suite/final artifact qualification remains outstanding.

### Owned response guards and whitespace-title regressions

The core response suite retains **19 scenarios** against actual response helpers,
record/schema HTTP and EJS pages, with no generic controller response facade.
Actual `responses36-regression.log`: **16 passing / 0 pending / 3 failing**.
Whitespace-only translated page titles yielded `| Site`; raw schema responses
accepted non-object values and JSON values that serialization silently rewrites.
Page formatting now trims title/site text. Schema delivery validates/clones using
the existing Canonical JSON owner before setting success headers, rejects non-object
schemas, and retains raw safe 503 Problem Details on invalid provider output.
Getter rejection is tested without executing the accessor; sparse arrays, NaN,
strings, dates and stream-like objects are rejected.

The retired response-bag API is replaced by route-owned payload/status/media
selection: schema success is its actual 200; unexpected provider failure becomes
safe 503 without private diagnostics; unsupported client media negotiation cannot
change the schema route's fixed media type. V1 special payloads are selected by
the route; v2 record metadata is checked on real record reads. Neither an embedded
error status nor a spoofed Error.status=200 changes the owned HTTP failure status.
No scenario or raw-JSON safety coverage was deleted.

`identity37-second.log`: **83 passing / 0 pending / 0 failing** (2s), including
these 19, preceding 26 view/user/relationship cases and 38 account cases below.
Node 26.11.1 explicit core runner; source TypeScript **exit 0**, `identity37-tsc.log`.
Pinned Prettier and diff check pass. Full artifact gates remain outstanding.

### Account controller consumers and identifier validation

Admin and user-management suites retain all **38 scenarios** through actual
account-link/admin HTTP mounts. The shared fixture uses real Users enrichment and
requireUserInBrand with explicit repository ports, preserving linked counts,
primary usernames/fallbacks, audit credential exclusion, self-disable refusal,
link validation, typed domain errors and token grant/refusal checks. The admin
harvest page renders actual EJS. No global model/controller services are installed.

Actual `identity37-first.log`: **27 passing / 0 pending / 11 failing**. Most were
migration fixture assumptions (bodyless unknown-brand 404, inconsistent existing
user/lookup identity, omitted required update fields, a remaining deleted capture).
Corrected to actual HTTP contracts, and added explicit 24-hex identifier validation
before account mutation lookup. Previously a malformed target could reach the
repository and depend on native validation; malformed IDs now return controlled
400 before mutation. Unknown brands remain 404 before any account domain access.
Known account-link validation uses UserAccountLinkError rather than message-based
Error classification. Missing required update fields are separately validated by
the actual API contract; the cross-brand test now supplies otherwise-valid fields.

`identity37-second.log`: **83/0/0** including all 38 account scenarios; source
TypeScript **exit 0**, `identity37-tsc.log`. Pinned Prettier passes. No skip or
scenario removal; whole-suite/final artifact qualification remains outstanding.

### Schema controller consumers and normalized HTTP input

All 20 schema-controller scenarios now use actual record-schema HTTP routes and
explicit domain ports. They retain raw media/304/cache/link behavior, normalized
create/update context, authoritative credential-safe actor, deterministic mapped
errors, generic denied/missing 404, pre-authorization corruption concealment and
actual immutable-grant/ACL service checks. Generated shim/export initialization is
replaced by actual route registration. Missing context now terminates at routing
404 and absent authentication at raw 401 before schema delegation, per v6.

`recordschema38-first.log`: 18 passing / 0 pending / 2 failing. HTTP migration found
recordType/OID whitespace was retained; the owner now trims these and operation
before delegation, restoring the previous normalization. A subsequent fixture
assertion was corrected for UserModel's existing empty additionalAttributes default;
private source attributes remain excluded. `fonts39-third.log`: **35 passing / 0
pending / 0 failing**, comprising all 20 schema and 15 font scenarios. Node 26.11.1
explicit core runner; source TypeScript exit 0 (`fonts39-tsc.log`), pinned Prettier
and diff check pass. No skipped/removed scenario. Final artifact gates remain open.

### Font delivery consumers use neutral owners

All 15 font/layout scenarios retain bytes, immutable headers/HEAD/304,
missing/corrupt faces, 16MiB LRU behavior, publication hashes, preloads and layout
ordering. They construct BrandingDelivery/Branding/Typeface explicitly with
repository and disk ports. Preview-token cases use actual HTTP; no global
services or controller facade. The obsolete optional request.param branch was
removed from delivery after confirming every consumer uses params/query/body.

The first preview fixtures omitted POST/current-history repository input and
referenced deleted asset classification; corrected these fixture assumptions.
`fonts39-third.log`: 35/0/0 including all schema cases. After removing request.param,
`fonts39-final.log`: **15 passing / 0 pending / 0 failing** (968ms). Pinned Prettier
and diff check pass; source check is recorded above. Final qualification is open.

### Branding management consumers and configured upload limits

All 17 management scenarios now exercise actual operation/upload HTTP routes.
REST/AJAX lifecycle registration, Admin denial, actor spoof exclusion, error/status
mapping, rollback deprecation, param validation and response parity remain. Real
FormData uploads pass through StreamingMultipart to physical temporary files;
success, parser size failure, staging failure and domain conflict must remove all
staged files before the response on both surfaces. No Skipper callbacks or global
services/controller response captures remain.

`branding40-first.log`: **15 passing / 0 pending / 2 failing**. One fixture searched
the wrong route export. The other found that the HTTP owner fixed the default
2MiB face constraint, ignoring runtime overrides and returning 400 for size
violations. Production composition now passes validated typefaceFaceMaxBytes to
the upload owner, which checks it with 413 and supplies the same override to the
file contract validator. The existing runtime-override scenario now proves both
3MiB refusal at the default and successful HTTP delegation with a 4MiB setting.
The real domain retains structural/font/family validation after this boundary.

`branding40-second.log`: **17 passing / 0 pending / 0 failing** (1s). Node26.11.1,
explicit core runner; source TypeScript exit0 (`branding40-tsc.log`), pinned
Prettier and diff check pass. No scenario removal or skip. Final gates remain open.

### Request-chronicle consumers and safe operation observations

The 35 scenarios formerly calling deleted controllers now use actual HTTP route
mounts and httpRequestChronicle. Six translation reads/writes retain unknown-brand
no-delegation checks and single correlated failure capture. Namespace delivery
uses the actual I18nEntries implementation; committed-entry/bundle reload failure
cases use actual domain writes over explicit repositories. All local/OIDC/AAF
session-callback failures must suppress redirects/audits. Vocabulary cyclic cause,
profile/token failures, report/CSV paging/results, missing observation, owned audit,
late-operation correlation, email and preview-token exclusion remain covered.

Test-contract changes follow design §1.3 and owned completion: unknown brand is
routing 404; backend/native diagnostics are sanitized; profile/key operational
failures are truthful 500; malformed paging is 400. Authentication failures do not
return provider text. Logout awaits its owned audit and refuses a successful
redirect if it fails. The former background-only logout scenario now checks that
failure; separate RequestChronicleHelper coverage retains late correlated results
without mutation after completion. These changes preserve and strengthen the
security/outcome assertions; no scenario or skip was introduced to bypass failure.

Actual `chronicle41-baseline.log` stopped after 0 passing/9 failures, including an
afterEach privacy failure: getBundle captured a provider error containing the test
secret. Other missing observations and empty reports were confirmed during
migration. Owners now record safe operation failures once without provider errors,
translation/report/email contents or tokens, and retain safe identifiers, paging,
counts and success flags. A shared small HTTP observation function handles
request/no-observer logging; middleware retains its single generic terminal error.
The empty report owner again returns `{status:false,message:null}` instead of an
incorrect `{success:true}`. Best-effort translation reloads remain successful but
now record their safe failure in the owning async request context.

`chronicle41-second.log`:33/0/2 (fixtures omitted roles and used the wrong bundle
repository port); `chronicle41-third.log`:35/0/0. The affected-route run
`chronicle41-affected.log` passes **292/0/0**. Source TypeScript caught the actual
ReportResult `recordsPerPage` field; corrected the observation and representative
fixture. `chronicle41-final.log`:140/0/1 from that stale fixture;
`chronicle41-final-corrected.log`: **141 passing / 0 pending / 0 failing** (3s),
including all35 HTTP, I18nEntries domain and chronicle utility scenarios. Source
TypeScript **exit0**, `chronicle41-tsc-final.log`; pinned Prettier/diff check pass.
No whole-suite/final-artifact qualification is claimed by these focused checks.

### Framework-free shared domain fixtures and browser bootstrap

Removed createMockSails/global setup/cleanup and the final global Lodash/model
installation from test/setup. createDomainFixture now returns explicit local
configuration, logger and collaborator data. Domain suites and Figshare helpers
refer to that local collaborator data; production vocabulary service declarations
in config.vocab.services are unchanged. Four tests now import their used Lodash
module explicitly. Removed an unused Institution global fixture. SIEM replay now
constructs its actual capture service with explicit repository/enqueue ports,
retaining the committed-capture/retry/delivered-state assertions.

The first mechanical fixture edit missed environment/owner references beyond the
fixture variable; `fixtures42-services.log` records **2211 passing/65 pending/6
failing**. It omitted Mongo environment URLs and is diagnostic only. Corrected
those local references and an unmigrated SIEM no-argument/global-service test.
A focused attempt recorded172 passing/1 failing from an RVA literal property;
corrected that fixture as well. No test assertion was removed or relaxed.

Full service execution with real Docker Mongo8.0.34 on29511:
`SIEM_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p8_siem
FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:29511/sr_p8_figshare
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types
node_modules/mocha/bin/mocha.js --no-config --require
ts-node/register/transpile-only --require chai --require test/setup.ts
--timeout20000 test/services/*.test.ts` (space between `--timeout` and `20000`).
`fixtures42-services-final.log`: **2334 passing / 7 unchanged pending / 0 failing**,
exit0, 1m. Durable Mongo cases execute; the seven existing placeholders remain
2 RAID contributors,2 workflow template validation and3 workspace API scenarios.
They do not count as executed qualification and are not new skips.

The explicit branding browser suite installs no framework globals. Its first run
passed print/font rendering but failed because a hardcoded duplicate Angular
node_modules Bootstrap path was absent. It now resolves the existing exact root
Bootstrap dependency, preserving actual CSS/native keyboard chooser assertions.
`fixtures42-browser-final.log`: **2 passing/0 pending/0 failing**, Chromium1243,
CHROME_BIN=/home/andrew/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome,
Node26.11.1. Sass emits its existing inspect() deprecation advisory. Pinned
Prettier/diff check pass. Clean production artifact/full suites remain pending.
