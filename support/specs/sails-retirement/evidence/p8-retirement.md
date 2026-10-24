# P8 retirement evidence

Work starts at `ad5c68d3b`, branch `stack/sails-retirement`, shared checkout.
No worktree, branch switch, push or publication. Wiki is an ordinary tracked
snapshot on this branch; the user explicitly confirmed that it must stay so.
SR-005/045/049's institution designation gap remains unchanged.

## SR-051 — Generated-file reconciliation (accepted)

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
The subsequent clean artifact checks below complete this task; broader consumer
qualification remains SR-053/055.

## Qualification status

**All locally executable P8 gates passed** against the clean application commit
`5088f4a7a5be746697ba7b493c302b57f85e19a8`, twelve real npm packs and three
immutable images. The final PDF fixture/verifier is84eb91a70; later edits are
documentation/evidence only. Every current runtime, built, packed and installed
owned graph has0 executable Sails violations/0 forbidden dependencies. All1261
SR-001 baseline entries reconcile.

**SR-051/052/053/054 are accepted. SR-055 is partial only for its inherited
representative-institution criterion**, because SR-005/045/049's institution,
source, hooks/configuration and actual topology are still undesignated. All local
final-artifact, full-suite, public released-v5 stand-in cutover and complete
checkpoint recovery checks pass. No further local implementation gap is claimed.
The original institution gate is not satisfied by a synthetic scaffold or public
stand-in, and no production release acceptance is granted.

The final results/disposition are collected in the final section and
[p8-artifacts.json](p8-artifacts.json). Earlier “pending”, “in progress” and
“outstanding” statements below are chronological checkpoints, superseded by the
recorded later results; failed attempts remain visible. A8 and earlier artifact
results are explicitly superseded by5088 after the HTTP browser-header regression.

## SR-052 — Runtime and dependency removal (accepted)

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
  **351/217/253** lock entries respectively. The other three locks reconcile local
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
cross-package import-boundary check. This is source/build evidence only. The shared checkout
still has ignored old node_modules directories; they are not the qualified
application graph. The clean installed runtime and packed-consumer closure is
accepted in the final SR-052 section below.

## SR-053 — Consumer and test conversion (implementation chronology)

`compile:host` replaces the executable-host `compile:sails` command. Historical
`sails-ng-common` package command names remain. Root test fixtures now pass a
suite-owned fixture object and concrete repositories/domains; they do not install
service/framework globals. At this early checkpoint the migration was unfinished; it is not full-suite
proof. Final accepted suite results appear below. The historical root test entry delegates to the owned Express fixture.
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

### Earlier regressions/failures (resolved by the recorded later results)

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

### Named hook authorization closure

RecordCreateAuthorization now accepts only registered record.assignPermissions and
record.complexAssignPermissions operations. Historical executable aliases are
accepted solely by the explicit persisted-declaration converter, never by runtime
authorization. The compiled qualification retains negative unconverted input and
positive converted input, nested options, PDF conversion and bundled producer checks.

Node26.11.1: npm --prefix packages/redbox-core run build and npm --prefix
packages/redbox-hook-dev run build both exit0 (hooknames43-build.log and
hooknames43-dev-build.log). node --test packages/redbox-core/test/qualification/
record-hook-names.cjs: **3 passing/0 skipped/0 failing**, 54 inspected bundled
declarations (hooknames43-qualification.log). This incremental build is not the
clean final artifact.

### Record API transport consumer retirement

All81 scenarios in the retired webservice/RecordController suite now dispatch real
HTTP in recordApiMutations (60), recordApiReads (8), recordHarvestDelegation (4)
and recordDatastreamContracts (9). Mutation ports independently inspect validated
submissions/trusted contexts; reads use actual current grants and complete branded
relationship graphs. Uploads use actual FormData/streaming multipart and physical
filesystem staging, including post-upload reload/CAS/authority and cleanup.

Fixed production regressions: permission/update/object-metadata v1 failure literals;
typed v1 transition conflicts retain the legacy result; malformed concurrency
headers retain versioned code/header diagnostics; revoked view access clears
projected metadata and concurrency. Disabled Express automatic weak entity tags
in the production host (and matching local fixture); record validators remain
owned strong revision tags. Source TypeScript exit0 (recordapi44-tsc.log).

recordapi44-first/second logs:10/0/6 then15/0/1, as previously described by the
fixture-path and failure-literal/weak-tag findings. recordapi44-third:60/0/0.
Initial reads/harvest:11/0/1 because the old relationship fixture omitted sourceOid;
the actual v6 graph requires both endpoints and branded grants. Corrected the
fixture rather than relaxing filtering. Upload run9/0/0. Final combined
recordapi44-final.log: **81 passing/0 pending/0 failing**, Node26.11.1, explicit
core runner, 2s. No scenario removed or skipped. The obsolete req.apiRequest
forged-context test now submits body-forged ifMatch without the validated header;
actual header/body ownership is asserted. Storage failures return sanitized500
over HTTP rather than escaping as native controller exceptions (design§1.3).

The chronicle baseline fixture listener was closed in finally after a failed
privacy assertion; only its task-owned diagnostic Mocha process was stopped.
These focused checks do not qualify a final packed artifact or full application.

### Browser record, resumable and progress consumer retirement

All 123 registered scenarios from the old browser RecordController suite are
accounted for. The replacement HTTP suites execute 123 cases: pages42, forms24,
reads17, metadata6, mutations17, resumable13 and progress4. One new filesystem
reserve check is included; the obsolete controller timestamp-helper scenario is
consolidated into the actual RecordsService timestamp case (UTC, lastSavedBy and
creation preservation), which ran in the same qualification. Actual HTTP, EJS,
FormProjection, ACLs, multipart files, filesystem disks and owned protocol ports
replace fabricated framework requests and service globals. No scenario is skipped.

Production fixes found by preserving those contracts: whitespace OIDs fail before
storage; missing brand IDs fail404; title/type fallbacks remain usable; view-orig
uses the existing view renderer (the previous target template did not exist).
Browser conflict responses project current metadata through the current actor's
actual edit/view form; projection failures redact metadata. Current concurrency
and authoritative OID remain available. Restored version1 browser failure literals.
Filesystem resumable staging again checks length plus configured disk reserve
before creating state; trailing-slash prefixes no longer produce doubled slashes.
Missing attachment metadata/bytes return browser404 or JSON404 as appropriate,
before attachment headers are set; other stream failures remain sanitized500.
The real progress socket test retains backend authorization-error denial.

Diagnostic logs record pages/forms54 passing/12 failing (11 whitespace-sensitive
title fixture assertions and one missing template), reads15/2, mutations16/1,
then mutations/tus25/4. Fixtures now use actual valid named forms, complete
relationship endpoints and real disk paths; assertions were not weakened.
recordbrowser45-pagesformsreads2.log:83/0/0; metadata6/0/0;
recordbrowser45-combined4.log:122/0/0 before the final attachment case.
recordbrowser45-final-consumers.log: **518 passing / 0 pending / 0 failing**,
17s (123 browser +81 API +314 RecordsService). Source TypeScript exit0,
recordbrowser45-tsc.log. Pinned Prettier and git diff --check pass.

Real Docker Mongo8.0.34 with nofile64000/64000,
sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907:
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p4_http
HTTP_READ_SOLR_PORT=8983 TS_NODE_PROJECT=test/tsconfig.json
node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config
--require ts-node/register/transpile-only --require chai --require test/setup.ts
--timeout 45000 test/http/RecordMutationsMongo.test.ts
test/http/ResumableUploadsMongo.test.ts test/http/ProgressSocketsMongo.test.ts
(from packages/redbox-core).
recordbrowser45-real-mongo.log: **21 passing / 0 pending / 0 failing**,18s,
including all8 existing Bruno permission mutations/16 assertions. At completion
there were no active sockets/requests; inspector diagnosis found31 outstanding
300000ms one-shot timers. Natural process termination is checked separately;
assertion completion alone is not claimed as full lifecycle qualification.

### PDF/storage package test and development-tool retirement

PDF tests now pass explicit configuration, logger, datastream, brand, staging,
audit and accepted-work ports; no global installation or comparison dependency
module remains. All75 existing cases execute. The old lower monkey-patch case now
holds the real owned close behind PDF cleanup and verifies that close cannot
complete early. The missing-global audit case removes the optional input instead.
Config assertions inspect the actual neutral declaration and declared queue merge.
The PDF integration record-type fixture uses the finite registered operation names.

The first public test:unit command failed because the compiler wrapper restricted
its type roots to empty nested directories after npm hoisted Mocha/Chai types.
The wrapper now resolves the actual installed type-package directories through its
own package resolver. npm --prefix packages/redbox-dev-tools run build exit0;
npm --prefix packages/sails-hook-redbox-pdfgen run test:unit:
**75 passing/0 pending/0 failing**,1s, exit0 (pdf46-second.log). No dependency
change or test bypass was needed.

Storage tests construct plain PersistenceOwner and StorageCollaborators inputs;
local form/type/disk ports replace globals. Export page size is supplied per
fixture. Native Mongo/Prisma codecs and physical collection behavior are unchanged.
Subclass tests instantiate the actual owned PrismaStorage class; declaration tests
verify the module/migration/configuration and offline registration, replacing
obsolete shim-export assertions. First run293/9/2: concurrency URL was omitted and
two obsolete entrypoint assertions failed. Corrected the declarations and supplied
both MONGO_TEST_URL and MONGO_CONCURRENCY_TEST_URL=mongodb://127.0.0.1:29511.
Explicit runner from the package, TS_NODE_PROJECT=test/tsconfig.json,
node --no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js
--no-config --require chai --require ts-node/register/transpile-only
--require test/setup.ts --timeout30000 --recursive --extension ts test
(space between --timeout and30000): **304 passing/0 pending/0 failing**,47s,
exit0, storage46-second.log. This includes real3068-record pagination/exports and
all9 actual shared-Mongo concurrency scenarios. Same Docker Mongo8/nofile pins
as the preceding browser check. No test was skipped or assertion weakened.

The browser real-Mongo runner subsequently terminated naturally with exit0;
its one-shot timer diagnosis is retained above for transparency.

### Response, visitor and API-documentation consumer closure

Migrated the last core response/visitor/admin-documentation global fixtures.
The retired framework response helpers no longer exist:21 replacement actual
HTTP checks cover200/201 JSON, both API-version error envelopes400/403/404/500,
actual branded403/404/500 HTML/JSON, scoped title, cache headers, explicit page
routing and safe immediate/chronicle failure reporting. Implicit framework view
selection and custom response method calls are retired; owned explicit routing
and renderer behavior are exercised. Unexpected failures remain sanitized per
design1.3. Inline-vocabulary tests retain their paging/tree/historical cases via
explicit vocabulary inputs; migration verification needs no global service setup.

Preserved runtime role metadata in generated JSON/YAML/Blueprint by passing
ApiRouteConfiguration explicitly through the transport/builders. The production
composition binds actual auth/extension configuration. The offline generator
accepts supplied configuration without reading/mutating an application global;
form-independent deterministic output and custom role metadata assertions remain.

Initial full-core loading exposed the obsolete Responses import; initial focused
loading then exposed the removed routes.config import. Fixed both consumers.
The first actual HTTP response run used the wrong fixture portal ('rdmp' rather
than its declared 'portal'), yielding404; fixed fixture URLs. The next run97/0/1
expected a translation key from the static404 artifact; it now checks the actual
Page Not Found heading while retaining status, content type and scoped title.
consumers47-final.log: **98 passing/0 pending/0 failing**,6s, explicit core runner.
Source TypeScript exit0, consumers47-tsc-final.log; a first source check correctly
reported a callback narrowing error, corrected by binding the validated rule array.
The affected real PagesMongo view-orig assertion now requires200 and the persisted
record title, replacing its former assertion that a missing template produced500.

### Final startup consumer and documentation checks

The first complete diagnostic core run ended **4460 passing / 40 pending /
2 failing**, 4m (`core47-second.log`, exit2). It started before the response
fixture and startup consumer fixes were loaded. Its two failures were the static
404 heading expectation and the removed global DOMPurify lookup; the response
checks pass in the 98-case focused run above. Optional persistence environment
inputs were absent from this diagnostic, so its pending cases are not final proof.

The startup subprocess now checks actual lazy sanitizer use, no DOMPurify/global
host installation and explicit plain-owner persistence cleanup. Its source-loader
25000ms subprocess bound is unchanged. A concurrent run timed out during other
TypeScript jobs; the serial command below exits0, **1 passing / 0 pending /
0 failing**, 9s (`startup49-serial.log`). This changes the retired-global consumer,
not the production startup bound or lazy-import assertions.

```sh
cd packages/redbox-core
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only \
  --require chai --require test/setup.ts --timeout 30000 test/unit/startup-module-loading.test.ts
```

The affected real `PagesMongo.test.ts` suite now passes **10/0/0**,8s,
`pages49-mongo.log`: persisted view-orig renders200 with its title, and actual
brand/role/CSRF/proxy/assets/error behavior remains exercised against Docker
Mongo8.0.34/Solr. No fixture timeout or assertion was weakened.

## SR-054 — Tracked wiki and generated reference update

Wiki remains ordinary tracked files, as explicitly directed by the user.
Updated architecture, lifecycle/domains, controllers, configuration, installation,
development/testing, extensions, loader retirement, maintenance and persistence
pages in place. `V6-Client-Compatibility.md` maps every recorded design§1.3 break
to affected clients and remediation, including401, tenant/object grants,404,
query validation, forced login, CSRF/logout, tus/Companion authentication and
lifetime limits, direct sockets410 and sanitized errors. Upgrade/recovery and
wiki entry pages link to that operator/client list. No separate wiki repository
or submodule is created. Current source comments and bundled agent guidance now
use explicit configuration/owned lifecycle terminology. Historical package names
remain intact.

The extractor reads actual v6 extension declarations and classified owned domains,
not the removed service/controller shim registries. Compile-checked examples use
neutral registration and explicit contributor binding. Commands with Node26.11.1,
npm11.20.0 at source852a80bd2 plus the reviewed documentation changes:

| Command | Result |
|---|---|
| `npm run doc:api` | exit0; JSON/YAML/Blueprint/HTML generated |
| `npm run docs:generate` | exit0;43 published surfaces,523 advisory findings |
| `npm run docs:audit` | exit0; same43/523; findings remain advisory and visible |
| `npm run docs:test` |4 passing/0 pending/0 failing;118ms, compile-checked examples |
| `npm run validate:api-routes` |49 passing/0 pending/0 failing;25s |
| Changed wiki relative Markdown links |34 pages,92 links,0 missing |
| `npm --prefix packages/redbox-dev-tools test` |52 passing/0 pending/0 failing;1m |

Logs: docs48-{api,generate,audit,tests,routes,links}.log and tools46-tests.log.
Generated reference/API outputs remain in their designated ignored output
locations. Advisory counts do not prove runtime/artifact readiness.

### Closure method prepared for clean artifacts

`retirement-closure.cjs` complements the unchanged SR-001 text-candidate method
with AST/global/type/helper checks, structural exact dependency/lock checks and
recursive installed-package manifests. Artifact scans include `.tmp/public` and
scoped/unscoped owned extension source. Finite persisted-hook conversion fixtures,
negative unregistered-operation checks and absent-global assertions are classified
explicitly. The remaining `req.param` candidates in ContextVariables/Reports are
finite typed inputs supplied explicitly by form/query adapters; their test fixture
readers also require no framework request. They are classified rather than falsely
counted as Sails execution. Historical own package names are allowed individually;
other Sails hooks, framework packages, skipper and @sailshq packages are forbidden.
Removed stale linter overrides for already-deleted legacy files.

The original inventory now accepts git-grep exit1 for zero matches/generated
headers; genuine git errors still fail. Its source/candidate/owner method is
otherwise unchanged. The final committed/artifact scan and complete baseline
reconciliation are still required below; this method section is not a pass claim.

The committed closure scan at2e7da7a08 reports **0 executable violations /
0 forbidden dependency entries**,1046 candidate/manifest files. The original
SR-001 rerun finds1020 matched files. All1261 baseline entries reconcile:
136 removed,361 retained without candidates,18 structural dependency metadata
checks,746 explicitly classified remaining files. This is source-only proof.

The next lint invocation exposed an unused caught error in the sanitized RVA
HTTP failure branch. Removed that unused binding; behavior and assertions are
unchanged. `npm run lint` now exits0 with0 warnings/errors. The first archived
artifact build started from2e7da7a08 before this lint-only correction; a final
source archive/image rebuild is required before accepting SR-055.


### Clean-lock regression and remaining deployment consumers

The first two clean archive attempts (2e7da7a08/61f37e604) passed root/core
installs, then failed storage `npm ci` with EUSAGE: missing rxjs7.8.2 and
tslib2.8.1. The earlier package-lock-only command had used an installed tree and
omitted these required peer entries. Regenerated from the clean archived package
with no node_modules using the same strict/script-free npm11.20.0 command.
The restored resolutions/integrities are exactly those in the P8 baseline; no
version or manifest pin changes. Storage removal count is corrected to253 rather
than255 in the dependency ledger above. The final clean build must confirm ci.

`storage52-clean-lock.log` records regeneration exit0. The ledger explicitly
records the retained peer/helper and reason. This is a lock repair, not a test
exception or peer-dependency bypass.

A manual review of the broader SR-001 text candidates found legacy environment
inputs that the first AST helper check did not cover. Corrected the PM2/deployment
examples and both PDF Compose profiles to use explicit v6 configuration, current
environment inputs and the sole Express executable. PDF fixtures now compose
record definitions rather than overwriting emitted core files, and use bundled
forms/PDF via the rehearsal target. Mongo nofile64000/64000 is explicit. The
pre-v5 external DLCF/Selenium deployment is preserved as historical evidence;
its old Compose entry includes the maintained complete Playwright stack. No
current Mocha/Bruno/Playwright scenario or assertion is excluded by that redirect.
The scanner now rejects legacy environment inputs in active shell/YAML/template
files, inspects EJS inputs and classifies the released-v5 recovery command
explicitly. Docker Compose config validation exits0 for all four changed profiles.


### Clean webpack regression: preserve Angular HTML ownership

The clean71017283c archive passes all strict package installs (including the
repaired storage lock), Prisma/schema verification, package/host compilation and
all Angular production builds. Webpack then exits1 with14 HTML embedded-script
errors (`as is not a supported option`),6 warnings; no images or packs are accepted
from that attempt. Log: `packed-71017283c-webpack-failed.log`.

A minimal HTML-plus-JavaScript production webpack run reproduces the error without
the application wrapper or CSS plugin. The root webpack5.111.1 default native HTML
pipeline uses minimizer-webpack-plugin5.9.0 and passes HTML production metadata
`as` into Terser. Core's separate locked5.11.0 minimizer does not throw, which is
why the new regression explicitly resolves webpack from the real wrapper rather
than accidentally testing that other installed tree. Neither resolution changes.

The webpack configuration now disables its native HTML experiment: Angular owns
and already optimizes these emitted entry pages; webpack copies them and owns
shared JS/CSS minification. The added actual-compiler test first fails0passing/
1failing against the pinned wrapper tree, then passes with the fix. It asserts
byte-identical HTML including an event handler and inline script, constant-folded
shared JavaScript and compressed CSS. All13 existing wrapper checks remain;
combined result **14passing/0pending/0failing**,1s, original5000ms bound.
No test or assertion is removed or weakened, and no dependency/pin changes.

Commands: the core Mocha command with `--no-config --node-option
no-experimental-strip-types --require ts-node/register/transpile-only --timeout
5000 test/hooks/webpack-assets.test.ts test/hooks/webpack.test.ts`, and root
`npm run lint`. Logs: `webpack54-{red,hypothesis,regression-pinned-red,
regression-pinned-green}.log`, `lint54-final.log`. Full clean artifacts and suites
must be rebuilt/rerun after this source correction.


### Installed-path audit classification

Before image scanning, copying the existing retirement test to its real scoped
installed-package path reproduced a scanner false positive:1 executable violation
for that test's deliberately rejected `sails: { isHook: true }` metadata. Its
source path was already explicitly classified. Extended only that same finite
fixture classification to `node_modules/@researchdatabox/redbox-core/...`.
The copied fixture now reports0violations/0forbidden dependencies. Adding an
actual global assignment and required framework dependency still makes the audit
fail, with1 executable violation and1 forbidden dependency entry. Logs are
`closure55-{installed-fixture-red,installed-fixture-green,active-control-red}.json`.
This is audit tooling only; the853d0039d application archive is unchanged.


The dependency closure also rejects all other `sails-*` framework adapters/helpers
and already-retired `waterline`/`waterline-*`, in addition to framework/socket/
Skipper/@sailshq entries. The three documented historical own package names stay
explicitly allowed. A temporary manifest control accepts those names and rejects
`sails-mongo`, `waterline` and `waterline-utils` (3 forbidden entries); the actual
committed tree remains0/0. Logs: `closure56-{source,installed-fixture,
package-control-red}.json`. No package dependency or runtime artifact changes.


### SR-051 clean installation and emitted artifact acceptance

The clean `git archive` of853d0039d contains no ignored/local output.
`qualify-sails-retirement-packages.sh` builds all nine owned packages,20Angular
applications/two libraries, shared webpack assets and API descriptors, then
exports twelve real `npm pack` archives. All20 existing packed checks pass,
including online strict production install, offline `npm ci`, ESM-only/top-level
await, CommonJS registration, isolated offline discovery and compiling an actual
v6-generated hook. Node26.11.1/npm11.20.0. No framework/shim generator is invoked.
The archive hashes and check flags are in [p8-artifacts.json](p8-artifacts.json).

The pristine runtime image built from that same archive is
`sha256:771ebe39b424ae38dd7d3b876a4371d6c0cfd5865e80e3b5855fafab9b485b72`.
A network-disabled `docker run` mounts only the SR-001 digest manifest as data
and checks every generated path inside the installed artifact: **236 absent**,
exit0 (`runtime-shims56.log`). Earlier reconciliation preserves all nine
application-owned paths and rejects edits/symlinks. This completes SR-051's clean
build/install and edited-customization acceptance. It does not complete the
remaining image/suite/installed-graph gates of SR-052–055.

Commands:

```sh
git archive 853d0039df1164beaa4098a8dba9c7984e498147 | tar -x -C "$clean_context"
SR_P7_CLEAN_CONTEXT="$clean_context" SR_P7_PACKED_OUTPUT="$packed_output" \
  bash support/integration-testing/qualify-sails-retirement-packages.sh
docker build --network host --target runtime --iidfile "$logs/runtime.iid" "$clean_context"
docker run --rm --network none \
  -v "$PWD/support/specs/sails-retirement/evidence/app-shims-before.json:/audit-manifest.json:ro" \
  "$(cat "$logs/runtime.iid")" node -e '
  const assert=require("node:assert/strict"), fs=require("node:fs");
  const generated=require("/audit-manifest.json").files.filter(f=>f.generatedHeader);
  assert.equal(generated.length,236);
  for(const entry of generated) assert.equal(fs.existsSync(entry.file),false,entry.file);
  console.log(JSON.stringify({generatedShimsAbsent:generated.length,node:process.version}));'
```

Logs: `packed-final-build.log`, `runtime-build.log`,
`packed-853d0039d/result.json`, `runtime-shims56.log`.


### Current source inventory and image-runner dispatch

At auditor/evidence commit `87d55e2792a726dbed15fd9f2670982a06ca731f`,
the unchanged SR-001 method reports1019matched files/4938matched lines. The AST,
manifest and lock audit examines1045candidate/metadata files and exits0 with
**0 executable violations / 0 forbidden dependency entries**. Reconciliation
covers all1261baseline entries:742remaining-classified,136removed,
365retained-without-candidates and18dependency-metadata-checked.
This is source proof; installed/built/packed closure remains a separate gate.

```sh
node support/specs/sails-retirement/evidence/inventory.cjs HEAD > source-inventory58.json
node support/specs/sails-retirement/evidence/retirement-closure.cjs HEAD > source-closure58.json
node support/specs/sails-retirement/evidence/reconcile-retirement-inventory.cjs \
  source-inventory58.json source-closure58.json > inventory-reconciliation58.json
```

The image matrix harness was reviewed before execution. Bash functions alone do
not intercept `timeout node ...`; an executable PATH wrapper is therefore also
installed for node/npm. It delegates into the immutable image, forwarding the
explicit matrix/persistence/portal connection inputs, and mounts no application
source, emitted output or dependencies. The timeout-protected probe asserts
`process.cwd() === '/opt/redbox-portal'` and reports `insideImage:true`,
Node26.11.1. First probe executes there but exits124 during Docker cleanup while
cache reclamation is running; after reclamation the identical30s probe exits0
(`database-image-wrapper60.log`, `database-image-wrapper61.log`). This is harness
validation, not a matrix suite pass. Test assertions/deadlines are unchanged.

Unused failed-build cache reclamation (`docker builder prune --force --filter
until=15m`) exits0 and reports8.901GB reclaimed. Images and existing recovery
checkpoints are preserved. Core/Playwright runners remain paused during the
large dependency-copy build to avoid the already observed index-I/O contention.


### Compiled runtime and packed-content closure

The first actual runtime scan (3780owned source/built/template/manifest files)
and all twelve hash-verified extracted archives (2191files) each exit1 for one
false positive: `dist/services/oni-v2/templating.d.ts` exports
`declare const liveOniTemplatingService`. This is the declaration of an explicitly
exported Effect service object, not a global. The auditor now distinguishes
external-module exports from ambient service globals, including declarations
inside `declare global`. It also examines `let` and global-augmentation inputs.

Added `test/tooling/retirement-closure.test.cjs`: **5passing/0failed/0skipped**,
1.448s. Explicit module export is accepted; script global, implicit runtime
global in an external module, ordinary global augmentation and an exported
variable inside global augmentation are all rejected. No existing test changes,
no global/module path allowlist and no application/dependency change.

Repeated actual audits both exit0:

| Artifact | Examined files | Executable violations | Forbidden dependency entries |
|---|---:|---:|---:|
| Runtime771ebe39b424, built from853d0039d |3780|0|0|
| Twelve SHA256-verified packed contents from853d0039d |2191|0|0|

The runtime audit runs network-disabled/read-only as root, mounting only the
auditor and TypeScript5.9.3 outside `/opt/redbox-portal`. It recursively inspects
installed third-party manifests and owned installed/built code, including public
assets. No application source/output/dependencies are supplied by a host mount.
The packed audit verifies every archive's exact recorded digest before extracting
its npm payload to a disposable `packages/<leaf>` tree and invoking the same
auditor; all twelve manifest package names also match.

Commands: `node --test test/tooling/retirement-closure.test.cjs`;
`node .tmp/sails-retirement/p8/audit-packed-content.cjs`;
`docker run --rm --init --network none --read-only --user root
-e NODE_PATH=/audit/node_modules -v "$audit_tools:/audit:ro"
-v "$PWD/node_modules/typescript:/audit/node_modules/typescript:ro"
"$runtime_image" node /audit/retirement-closure.cjs --tree /opt/redbox-portal`.
Logs: `closure65-controls.log`, `runtime-closure65-module-export-red.json`,
`packed-content-closure-final.log` (first failure),
`runtime-closure-final.json`, `packed-content-closure-final.json`,
`runtime-closure66.log`, `packed-content-closure66.log`. Compact results and
executed auditor digest are in [p8-artifacts.json](p8-artifacts.json).
The installed packed-consumer graph and other image targets remain unaccepted.


### Final fixture preparation and extra consumer prerequisite

The core regression fixture is recreated as real MongoDB8.0.34 in Docker with
`--memory=768m --tmpfs /data/db:rw,size=768m --ulimit nofile=64000:64000`,
port29513 and WiredTiger0.25GiB, matching the accepted P7 core fixture. Its
readiness command exits0; full tests remain pending. The independent matrix and
production/recovery Mongo fixtures remain disk-backed. This changes no test
assertion/deadline and is not power-loss durability evidence. Exact inspect output
is `core-mongo-final-inspect.json`; prior disposable fixture state was removed.

An additional packed-installed audit was attempted early in the completed slim
runtime image. npm exits254 (`spawn git ENOENT`), before any installed scan: the
production runtime intentionally omits Git, while the original planned builder
consumer has it. The passing20 packed checks used that complete build environment.
This extra attempt is not accepted graph proof; repeat it in the prepared clean
builder image. Log: `packed-installed-runtime69-missing-git.log`. No dependency,
image or test change is made to bypass this installation prerequisite.

The new stand-in recovery scratch parent is the existing user-owned network mount
`/home/andrew/.npm/_redbox-sails-retirement-p8` (7.2TiB available when checked),
to preserve the full source-image archive without competing with local Docker
space. No institution data is used; existing P7 checkpoints remain untouched.
The actual unique checkpoint path will be recorded by the recovery driver.


### SR-052 strict installed packed graph acceptance

The additional consumer is now installed successfully in the clean Dockerfile
`base` target (Git/build tools, no application dependencies), built from the same
853d0039d archive. All application dependencies and overrides come from the twelve
SHA256-verified tarballs, including the packed core manifest; no source or emitted
application mount is used. TypeScript5.9.3 is supplied outside the consumer as an
auditor-only tool. Git2.39.5, Node26.11.1, npm11.20.0.

`npm install --prefer-offline --omit=dev --ignore-scripts --strict-peer-deps
--legacy-peer-deps=false --no-audit --no-fund` exits0: **1194packages added in2m**.
The installed owned graph scan examines2191files, recursively checks installed
package manifests, and exits0 with **0 executable violations / 0 forbidden
dependency entries**. The isolated temporary consumer is removed, and its Docker
container cleanup exits0. npm reports existing upstream deprecation advisories;
no dependency selection or peer bypass is added.

This completes SR-052: committed source, all nine compiled owned package payloads,
the pristine installed runtime graph and a fresh installed graph from all twelve
real packs have no required Sails path. The three explicitly documented historical
published package names are retained. The dependency ledger records every removed/
changed declared dependency and lock entry; exact pins are unchanged apart from
the recorded removals. Final test/rehearsal/builder image/suite/recovery proof
remains SR-053/055; it is not claimed by these scans.

Commands:

```sh
docker build --network host --target base --iidfile "$logs/consumer-base.iid" "$clean_context"
docker run --rm --init --network host --user root -e NODE_ENV=production \
  -e PUPPETEER_SKIP_DOWNLOAD=true -e NODE_PATH=/audit/node_modules \
  -e SR_P8_SOURCE_COMMIT=853d0039df1164beaa4098a8dba9c7984e498147 \
  -v "$packed:/packed:ro" -v "$audit_tools:/audit:ro" \
  -v "$PWD/node_modules/typescript:/audit/node_modules/typescript:ro" \
  "$consumer_base_image" node /audit/install-packed.cjs
```

Logs: `consumer-base-build.log`, `consumer-base-inspect.json`,
`packed-installed-closure.{json,log}`. Image ID, versions and compact closure
results are in [p8-artifacts.json](p8-artifacts.json). The earlier missing-Git
probe is superseded by this actual successful installation, not suppressed.


### Final operator-documentation reconciliation

The retirement review removes stale current-tense guidance to use `app.js`,
`compat/sails` and temporary bundled comparison entries from the extension and
upgrade runbooks. P2/P3 provenance remains described as history. The authoritative
wiki now states the actual default cookie name (`redbox.sid`), secure/HttpOnly/
SameSite=Lax defaults and path `/`, distinguishes the example's selected new
`redbox.v6.sid`, and directs operators to rotate the name/secret and validate
root-context, HTTPS/proxy and browser-origin settings. Clients must reacquire
CSRF/progress grants; staging and byte stores remain independent of forced login.
These are documentation corrections to the already implemented session behavior,
not application changes or a new protocol decision.

Four edited pages: a Python relative-link existence audit (including extensionless
GitHub wiki names) checks 24 local links, 0 missing; `git diff --check` exits0. Log: `docs73-links.json`. The source artifact
remains853d0039d; these documentation-only changes need no application rebuild.


### Canonical auditor recheck after documentation reconciliation

At8cb15b863, the original SR-001 inventory reports1020matched files/4943lines.
The AST/metadata audit checks1049candidate/manifest files:0executable violations,
0forbidden dependency entries. Reconciliation covers all1261baseline files.
The same committed canonical auditor (SHA256
`c367b232ff671c83e330232182805d7602d262b3d4523e969091144c6c8f033c`)
passes both runtime771ebe39b424 (3780files) and all twelve hash-verified packed
contents (2191files),0violations/0forbidden entries. Its five controls pass
again,0failures/0skips,1.517s. No application changes or additional suite claims.

Commands repeat the original `inventory.cjs HEAD`, `retirement-closure.cjs HEAD`,
`reconcile-retirement-inventory.cjs`, the network-none/read-only runtime audit,
packed-content extraction/digest check and `node --test
test/tooling/retirement-closure.test.cjs`. Logs: `source-inventory74.json`,
`source-closure74.json`, `inventory-reconciliation74.json`,
`runtime-closure74.{json,log}`, `packed-content-closure74.{json,log}`,
`closure74-controls.log`. Compact manifest now records the canonical digest.

The final design§1.3 cross-check additionally makes reporting/history/audit/log
and integration-permission diagnostics explicit in the client table: stored brand
checks apply, and integration audit/permission diagnostics need the owning brand's
Admin role. This avoids leaving the stricter role requirement implicit in the
general read/admin rows. No application or generated-contract change.


### SR-053 generated institution application regression

The final scaffold review finds a real production-composition gap: the compiled
v6 example contributes a hook-named top-level configuration key. The production
portal's schema correctly rejects it. The existing packed check compiled and
resolved the generated declaration but did not load it through production portal
configuration. Strengthening the existing dev-tools test reproduces:
`Configuration redbox-hook-123-demo at 123-demo: invalid configuration
(unrecognized_keys)` —0passing/1failing,2s.

The template now contributes data under `custom.<hook-name>`. The production
schema stays strict. Existing dev-tools assertions and30s bound are preserved;
the full suite passes **52/0/0**,26s, including the new finalized-config assertion.
No dependency changes. Dev-tools and generated README instructions now describe
the only v6 scaffold, exact artifacts and concrete production bindings rather
than removed `standard`, globals and shim registrations.

New `packages/redbox-core/test/qualification/generated-institution.cjs` generates,
compiles and packs a fresh hook, installs its archive in a fresh application
directory, and uses the real production `createPortalHost` with concrete selected
module/HTTP/repository inputs. It ensures a real default brand and upserts two
named-query definitions through the Prisma reference repository, verifies one
ledger migration and bootstrap on both startups, serves readiness/the generated
HTTP route, restarts and requires zero pools after each owned stop. Bundled
packages and assets resolve inside the application artifact; final execution
in the new clean image remains required. This synthetic institution does not
designate the outstanding representative-institution cohort.

The first two verifier assemblies fail for missing deployment view/asset roots
and an invalid synthetic brand reference. The fixture is corrected to supply
the existing packaged roots and establish/use the actual brand via its concrete
bootstrap operation. No application behavior/assertion/deadline is relaxed. The
next callback passes, but plain `node --test` stays alive for the accepted
process-owned provider cron and is interrupted after owned stop. The final
command uses the same `--test-force-exit` setting as the existing production-host
qualifiers: **1passing/0failed/0skipped**,15.027s, exit0, original120s test bound.
This flag terminates the provider's process-lifetime timer after the test; it
does not skip its startup, persisted-work, HTTP, restart or drain assertions.

```sh
npm --prefix packages/redbox-dev-tools test -- --grep 'compiles generated public declarations'
npm --prefix packages/redbox-dev-tools test
SR_GENERATED_APP_MONGO_URL=mongodb://127.0.0.1:29513/sr_p8_generated_institution \
SR_PORTAL_SOLR_PORT=8983 node --test --test-force-exit \
  packages/redbox-core/test/qualification/generated-institution.cjs
npm run doc:api
npm run docs:generate
npm run docs:audit
npm run docs:test
npm run lint
```

Actual services are the already recorded Docker Mongo8.0.34 fixture
(nofile64000/tmpfs) and Solr10.0.0. Node26.11.1/npm11.20.0/TypeScript5.9.3.
API generation writes4files; generation/audit report43published surfaces and
523advisories; documentation tests **4/0/0**. Source lint checks934files,
0warnings/0errors, plus the cross-package import check. A three-page relative
link audit checks7links,0missing. Logs: `scaffold80-config-{red,green}.log`,
`generated81-source.log`, `generated82-source.log`, `generated83-source.log`,
`generated84-source.log`, `docs85-{api,generate,audit,test}.log`,
`scaffold85-links.json`, `scaffold86-lint.log`. The extra attempted direct lint
of test files is ignored by repository patterns and is not counted as coverage.

This executable template change supersedes853d0039d for final SR-053/055
qualification. Earlier source/pack/runtime closure remains real historical
evidence; corrected clean packs and all final images/suites must be rebuilt.


### Build storage incident and test-image layer ownership

At2026-10-24T10:31Z, while no final suite is running, both idle disk-backed
Mongo fixtures hit actual `No space left on device` writes (WiredTiger/FTDC).
`sr-p8-mocha-mongo` exits134; `sr-p8-foundation-mongo` exits139; neither is
OOM-killed. The Mongo8 tmpfs core fixture remains running. The instruction
refresh interrupts the unified build process during test-image unpack: all
COPY/RUN steps and593.5s layer export had completed, but no successful final
build exit/iid is recorded. It is not accepted as a final artifact.

Docker's previous test stage copied and chowned the entire builder development
graph into a second layer tree over runtime, including two large Prisma CLI
dependency trees. Test now inherits the clean builder layers directly, retaining
all build/test dependencies and the compiled application. The existing mounted
CI profiles already run as root; this dedicated development target now states
that default explicitly by inheritance. The Angular build-Node path is a symlink
to the existing builder toolchain. CMD/port/readiness health remain aligned.
The separate production runtime still uses its strict pruned graph and node user
and receives its own installed-artifact qualification. No test/deadline changes.

`docker builder prune --force --filter until=15m` exits0 and reclaims1.134GB.
The interrupted unaccepted test tag
`redbox-portal:sr-p8-853d0039d-test`
(ID43749fe87597c7f45d027f40406ee89586b75ee5b2cad9c34677cebe7c9a7e4f)
is removed after retaining inspect output; P7 images/checkpoints and the accepted
P8 runtime are preserved. Disk remains constrained, so obsolete unused copied
cache will be reclaimed while the new build protects its active dependencies.
Timed suites wait for builds/GC to finish and the disposable disk fixtures to be
recreated with their exact images and nofile64000 limits.

Logs: `foundation79-enospc.log`, `mocha-mongo79-enospc.log`,
`prune79-unused-build-cache.log`, `test-interrupted84-inspect.json`,
`test-interrupted84-remove.log`, `images83-space-inventory.txt`. Corrected clean
build and final suite results remain pending; this records the incident and
implemented build change rather than a successful qualification.


### Corrected clean artifacts and canonical closure

Clean `git archive a193b87312a24221744c7e1ac58b1328d472156b` contains the
production-scaffold configuration fix and the builder-layer test target. No host
source/dist/node_modules is copied into this archive. The repeated clean package
qualification exits 0: **12 real npm archives / 20 checks**, including strict
installed/offline-ci consumers, ESM-only/top-level-await, bundled neutral hooks,
Express host and compiled v6 scaffold. The dev-tools archive changes to
`b9c62813c502eb73f44b1c92c87471567a787284eba8566e3dfdf87bef3a0223`;
the other eleven archive digests are unchanged. Exact digests are in
[p8-artifacts.json](p8-artifacts.json).

The pristine runtime build exits 0, immutable local image ID
`sha256:4dd74a393059adad91a990f8c0ec69ef2a41fae8df8f0eb881323428f721b647`.
Production `npm ci --omit=dev --no-audit` adds 1,183 packages. Its default user is
`node`; production startup/restart/health qualification remains pending. The
network-disabled/read-only canonical audit exits 0 across **3,781 owned files,
0 executable violations / 0 forbidden dependency entries**. A separate image check
requires all 236 retired shim paths absent and all 9 application-owned paths
present; it exits 0. The twelve SHA256-verified extracted archives pass across
2,191 owned files, 0 violations / 0 forbidden entries. Auditor/shim safety controls
pass **6 / 0 / 0**, 1.944s, including all five ambient-global distinctions.

A fresh strict consumer of these twelve archives runs in the previously qualified
build-tools-only base `733b974d5789` (Git 2.39.5), with no application/dependency
mount. Its disposable `/tmp` and npm cache use 1,536 MiB container tmpfs to avoid
additional disk contention. Actual `npm install --prefer-offline --omit=dev
--ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit --no-fund`
adds 1,194 packages in 3m; canonical installed-graph scan checks 2,191 owned files
and recursive installed manifests, 0 violations / 0 forbidden entries. The full
command including removal exits 0, 376.67s. No pin, peer bypass or test assertion
changes. Node 26.11.1 / npm 11.20.0 / TypeScript 5.9.3 remain unchanged.

The original SR-001 method is rerun at this exact commit: **1,021 matched files /
4,944 matched lines**. AST/metadata audit checks 1,050 candidate/manifest files,
0 violations / 0 forbidden entries. All 1,261 baseline entries reconcile: 742
explicitly classified, 136 removed, 365 retained without candidates and 18
structurally checked metadata files. Remaining matches are recorded as
documentation/historical names, finite conversion/negative fixtures or explicit
neutral parameter inputs; none requires Sails execution. Three published
historical package names stay unchanged.

Commands repeat the committed `inventory.cjs <commit>`,
`retirement-closure.cjs <commit>`, `reconcile-retirement-inventory.cjs`;
`qualify-sails-retirement-packages.sh` with the clean archive;
`docker build --target runtime --label org.opencontainers.image.revision=<commit>`;
`node --test test/tooling/*.test.cjs`; hash-verified packed-content extraction;
network-none/read-only image audit and strict installed-consumer audit as recorded
above. Logs under ignored `.tmp/sails-retirement/p8/final-a193b8731/`:
`packed-build.log`, `runtime-build.log`, source inventory/closure/reconciliation,
`packed-content-closure.*`, `tooling-controls.log`, `runtime-closure.*`,
`runtime-shims.*`, `packed-installed-closure.*` and `packed-installed-time.log`.
No final full-suite/recovery results are claimed in this subsection.

The test-image export remains actively gzip-compressing/reading tar layers on the
saturated local Docker disk. A supported Docker SIGUSR1 diagnostic at 11:27Z
shows active flate compression and tar reads, not a blocked registry/provider
request. The previously requested builder prune exits 0 and reclaims 11.1 GB.
Timed database/browser suites wait for all image builds and resource cleanup;
no deadline is relaxed. No provider usage/quota limit has occurred.

The final operator-runbook review removes stale current-tense comparison scripts,
`ConfigService.getBrand` adapter and `compat/sails/configuration.ts` instructions
from `configuration-v6.md`. It now directs explicit awaited bindings and owned
asset roots. `maintenance-v6.md` links the existing upload/realtime/P8 evidence
rather than promising completed SR-040/044 work as future. These are prose-only
corrections; no contract, generator input, dependency or application artifact
changes. Relative-link checks cover both pages and six links, 0 missing;
`git diff --check` exits 0. Log: `runbook-links.json`.


## Corrected test-image export retry (2026-10-24 12:25Z)

The original clean `a193b8731` test-image export ends **exit 1**, after
`exporting layers 4661.2s`, with containerd `failed to open writer: lease does not
exist: not found`. The preceding content commit reports a missing ingest path;
the opened ingest descriptor was already unlinked. The source compilation steps
were cached/successful; no test gate started. This is an infrastructure failure,
not a successful image or suite result. Runtime/packed acceptance above remains
unchanged. Disk has 8.5 GiB available after the failed export releases its writer.

Investigation checks the isolated daemon/containerd logs, active leases/content,
processes, kernel messages and disk usage. No other prune/build runs at failure;
prune88 ended at 10:51Z, before this export began at 11:07Z. No new ENOSPC, OOM or
filesystem error is observed. An expired/stale export lease is suspected; the
exact deletion cause is not established. Do not equate this with a provider quota
limit.

Retry uses the **same clean archive/context, Dockerfile, source revision and
normal Docker cache**, builds only the missing `test` then `rehearsal` targets,
and retains the original failure log. It changes no dependency, application,
assertion, deadline or test selection. All images must still have the exact
source revision label before the serial suite runner proceeds. No cache cleanup
runs during this retry. The gate runner's build-process liveness check follows
the new PID. Ignored scripts/logs: `resume-build91.sh`, `resume-build91.log`,
`final-a193b8731/test-build.log`, `test-build-retry91.log` and
`all-final-gates91.log`. Final qualification remains pending.


The short cached retry91 is deliberately interrupted (**exit 130**,203.4s export)
before repeating the same expiry. The live leases expose `gc.expire` exactly one
hour after creation. BuildKit's upstream
[`util/leaseutil/manager.go`](https://github.com/moby/buildkit/blob/master/util/leaseutil/manager.go)
creates the temporary lease with `leases.WithExpiration(time.Hour)` and provides
no renewal in that helper. This matches the original >77-minute export and the
unlinked ingest descriptor; expiry is the evidenced working diagnosis.

Only the owned isolated engine is stopped/restarted, after stopping its four P8
fixtures. Original containerd configuration is retained. Retry92 uses the same
root/state/socket/cache with containerd **2.2.5**, Docker **29.6.1**, changing only
GC `schedule_delay` from0s and `startup_delay` from100ms to24h. The supported
`ctr plugins ls --detailed` output confirms `ScheduleDelay 24h0m0s`. This delays
GC during the slow HDD export; it changes neither image contents nor runtime
behavior/assertion deadlines. It also avoids concurrent pruning. Original GC
settings must be restored and verified before any timed suite or cache
reclamation; the serial build driver includes that restoration before publishing
`build.complete`. Existing fixtures restart and pass real Mongo/Solr/IdP
readiness before tests. Default Docker and the older P7 daemon are untouched.

Commands/configurations/logs remain under ignored `engine92/`,
`resume-build92.sh`, `restore-engine92.sh`, `test-build-retry92.log` and
`all-final-gates92.log`. The initial unsupported `ctr plugins info` probe produces
no result; the supported detailed listing above provides the actual verification.
No provider quota/usage limit has occurred. Final images/suites remain pending.


## Generated Angular manifest pinning — final gate regression

All three `a193b8731` images finish building. The corrected test export succeeds
(2,013.6s export /579.7s unpack; Docker step2,596.2s, exit0), followed by the
production rehearsal image (147.8s export/unpack step, exit0). Image IDs:

- Runtime: `sha256:4dd74a393059adad91a990f8c0ec69ef2a41fae8df8f0eb881323428f721b647`.
- Test: `sha256:29b7c8a064e80bce8f79bdd340f19f1ad71e9671b1185f06130801384ffae063`.
- Rehearsal: `sha256:b79e9fbc52fce22ae895f591bf63ed84ffa25deba2a9a9311afbd8f83315cc63`.

Original containerd GC is restored and explicitly verified (`ScheduleDelay 0s`,
`MutationThreshold 100`) before qualification; Docker29.6.1/containerd2.2.5.
The serial gate starts13:21:48Z and stops13:23:19Z with **exit1**: canonical
read-only/network-none test-image closure scans **5,845 files**, reports **zero
forbidden Sails dependency entries** and **one exact-pin violation**:
`angular/dist/researchdatabox/portal-ng-common/package.json` contains
`tslib: "^2.3.0"`. No final core/browser/database/recovery suite has started.
The strict audit remains unchanged; this attempt is not final acceptance.

The source package declared `tslib2.8.1` only in `devDependencies`. The installed
ng-packagr22.2.1 implementation confirms that, absent a runtime/peer declaration,
it copies Angular compiler's `tslib` range into the emitted owned manifest. This
rules out stale output and an explicitly ranged source declaration. The fix
moves the **same exact2.8.1** declaration to `dependencies`; there is no version
upgrade/new resolution. The dependency ledger records both sections/reason.

Actual focused validation uses the completed test image, network disabled and
only the corrected source manifest mounted read-only, runs
`node node_modules/@angular/cli/bin/ng.js build @researchdatabox/portal-ng-common
--configuration production` from `angular`, and asserts the emitted exact pin.
It first prints the old `^2.3.0`, rebuilds the real library, then reports
**1 passing /0 failed /0 skipped**, generated `2.8.1`, Angular compile18.128s,
command exit0. Node26.11.1 remains selected. Existing canonical closure is the
regression gate; no assertion, test selection, timeout or audit allowance changes.
`npm --prefix angular install --package-lock-only --ignore-scripts
--strict-peer-deps --legacy-peer-deps=false --no-audit --no-fund` exits0 in2s
with **zero lock changes**, npm11.20.0. This inner library has no independent
lock; the outer lock still resolves2.8.1. `git diff --check` passes.

Logs: `final-a193b8731/{test-build-retry92,rehearsal-build-retry92,
restore-engine92,image-closures-driver,image-closures-time}.log`,
`test-closure.json`, `gates.jsonl`, `engine92/gc-restored-info.txt`,
`ng-packagr-tslib94-source.log`, `angular-emitted-pin94.log`, `angular-lock94.log`.
The first source-inspection probe used the wrong ng-packagr subpath; the actual
`src/lib/ng-package/entry-point/write-package.transform.js` provides the
confirmation above. No provider quota/usage limit has occurred. A new clean
committed archive, packs/images, closure and all full suites follow this fix.

## Final clean candidate a8c6712d0 — build and closure

Source: `a8c6712d07d0442aa7690ad3bab0af4ad0abd4d0`, clean `git archive` at
`/mnt/docker-storage/sr-p7-clean-production/.tmp/sr-p8-clean-a8c6712d0`.
Node26.11.1/npm11.20.0/TypeScript5.9.3; Docker29.6.1/containerd2.2.5 with
original GC settings restored. No provider usage/quota limit occurred.
Build script: `.tmp/sails-retirement/p8/build-final95.sh`, exit0. All package,
root TypeScript, Angular, webpack and API builds pass. Angular production233.1s;
production installation1183 packages/222.7s; test export/unpack210.6s. Rehearsal
native Chromium156.0.8078.47. No registry publication.

| Clean image | Immutable local image ID | Owned files | Executable violations / forbidden dependency entries |
|---|---|---:|---:|
| Runtime | `sha256:5b5a090463b3b790762784ab736352fcc65105cbae5f07dfff82c16eb363f88c` |3781|0/0|
| Test/tooling | `sha256:6ad4b7d68615d333c0a9c040b14c87e54896f7a8b6690c81fba72855d5389413` |5845|0/0|
| Rehearsal | `sha256:c7745b26e26ee2a2a7f60788f69d5ea6340c1ebd722af92099f3b54f3070d02f` |3994|0/0|

Each image's OCI revision label equals the full source SHA. Runtime user is
`node`, CMD `node app.express.cjs`. Each image independently proves236 generated
shims absent/nine authored paths retained. The canonical unchanged auditor is
`retirement-closure.cjs`, SHA256
`c367b232ff671c83e330232182805d7602d262b3d4523e969091144c6c8f033c`.
Actual packed graph:12 npm archives/20 checks, exit0; archive hashes match the
superseded a193 content (the Angular manifest fix is outside these archives).
Fresh strict installed consumer:1194 packages,2191 owned files,0/0 violations,
exit0/124.43s, tool-only image
`sha256:733b974d57895dbcfd61578f3729b62d99e221534a4edeb7f83452fd1ea271f2`.
Extracted packed closure verifies all12 hashes and scans2191 files,0/0. Install
uses actual packed core overrides, strict peers and1536MiB temporary/cache tmpfs.

The unchanged SR-001 method reports1021 candidate files/4947 lines; AST/metadata
closure scans1050 files and reports0/0. All1261 original entries reconcile:
742 remaining classified,136 removed,365 retained without candidates,18 metadata
checked. Remaining historical names/docs are not executable framework use.

Commands: `run-packed-closures95.sh`, `run-image-closures90.sh`, and
`recreate-final-fixtures90.sh`; all exit0. Logs/manifests are under ignored
`.tmp/sails-retirement/p8/{final-a8c6712d0,packed-a8c6712d0}/`.

### Core first-attempt failure and verifier correction

First full `npm --prefix packages/redbox-core test` in the immutable test image:
**4448 passing /7 unchanged pending /34 failing**, exit34,196.33s,
2026-10-24T13:55:55Z–13:59:11Z. Thirty-three errors are ENOENT for committed
root `test/resources/fonts` WOFF2 inputs: `.dockerignore` excludes root tests;
core package tests are present but these shared verifier inputs are not.
The runner now mounts only committed `test/resources` read-only at the expected
`/opt/redbox-portal/test/resources`. Application code/builds/dependencies still
come from the immutable image. This corrects verifier assembly; no application
change, assertion/timeout/selection change or new skip.

The separate first migration case exceeded its existing5000ms timeout; the
subsequent six migration cases passed. Isolation in the same image, network none:
`npm --prefix packages/redbox-core test -- --grep "Admin sidebar text colour migration"`
passes **7/0/0**, first call1565ms (suite2s), exit0. No root cause is inferred
from that successful retry; the complete unchanged core suite is rerun next.
Original log/timing preserved as `final-a8c6712d0/core-attempt1{,-time}.log`;
isolation in `migration-isolated.log`; retry gate separately named `core-retry`
in `gates.jsonl`. Final acceptance requires that retry plus all remaining gates.

### Full core retry and generated institution application

Full immutable-image core retry (committed verifier-resource mount only):
**4496 passing /7 unchanged pending /0 failing**, exit0,146.64s,
2026-10-24T14:02:25Z–14:04:51Z. The previously timed-out migration passes in577ms.
Pending placeholders remain RaidService contributor config(2), TriggerService
validation template(2), and WorkspaceService API placeholders(3). They are not
counted as executed coverage. The full unchanged assertions now execute all
font-dependent suites; no new skips or extended timeouts.

Generated institution qualifier in the same clean test image:
`node --test --test-force-exit packages/redbox-core/test/qualification/generated-institution.cjs`
passes **1/0/0**,33567.508378ms. It actually generates/compiles/packs a fresh v6
hook, starts the production host with real Mongo8/Solr, persists two queries,
runs the migration once and bootstraps twice across fresh/restart, serves HTTP
and ends with zero pools. This synthetic institution does not designate the
external SR-005/045/049 cohort. Logs: `core-final-image.log`,
`generated-final-image.log`, and the separate timed gate records.

All69 implementation/build/documentation commits from this round's base through
a8c6712d0 have the required final coauthor trailer; full SHA/title manifest:
[p8-commits.json](p8-commits.json). Wiki edits are normal main-repository commits.

### Package suites and complete real-Mongo matrix

All package suites run from the clean test image: dev-tools **52 passing**(28s),
PDF unit **75 passing**(1s), storage **304 passing**(43s), zero pending/failing.
Storage uses actual Docker Mongo8.0.34. Combined gate exits0 in111.85s.
Commands: `npm --prefix packages/redbox-dev-tools test`,
`npm --prefix packages/sails-hook-redbox-pdfgen run test:unit`, and the storage
Mocha command recorded above with unchanged30000ms bound and real required URLs.

The full `qualify-sails-retirement-databases.sh` runs application/native probes
from the immutable rehearsal image and TypeScript regression tests from the clean
test image, using the recorded PATH wrappers (no host application/dependency mount).
**216 passing /0 failing /0 skipped**, four rows of54 checks:

| Engine / FCV | Topology | Ownership + production host | Persistence / record-types / lifecycle |
|---|---|---:|---:|
|8.0.34 /8.0|Separate core/storage standalone|1+1|30/10/12|
|8.0.34 /8.0|Independent three-member sets|1+1|30/10/12|
|9.0.4 /9.0|Separate core/storage standalone|1+1|30/10/12|
|9.0.4 /9.0|Independent three-member sets|1+1|30/10/12|

Each replica row actually elects a new primary in **both** sets and verifies
maintenance/indexes, migration ledger, persisted GridFS, production authenticated
HTTP/pages/assets/namespace delivery, fresh/restart, deadline/retry and zero-pool
stop. Anonymous API is401; readiness transitions503→200. Container inspection
confirms `nofile=64000:64000` on every matrix Mongo. Exact source digests:
Mongo8 `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`;
Mongo9 `sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
All matrix containers are stopped/removed by the owned runner after success.
Gate:2026-10-24T14:07:18Z–14:14:08Z, exit0.

Additional new compiled-record-type verification runs the existing dedicated
command in the final test image with
`COMPILED_RECORD_TYPES_TEST_MONGO_URL=mongodb://127.0.0.1:29513/sr_p8_compiled`:
**3 passing /0 failing /0 skipped**(2s). It verifies one compiled instance/client
through HTTP/bootstrap/stop, retained cleanup failure and explicit retry, and
cleanup after extension initialization failure. This closes the added test's
final-image proof rather than counting the earlier source-tree result.

Host: Ubuntu24.04.4LTS, Linux6.8.0-147-generic, x86_64; images linux/amd64.
Builder base: `node:26.11.1-bookworm@sha256:f1233c415b41ffcf237c717b3dea92e9d4ea006e0e4c71edcb790605d74f5404`;
runtime base: `node:26.11.1-bookworm-slim@sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567`.
Commands `uname -srmo`, `/etc/os-release`, `docker version`, image inspection and
build logs confirm these values. runc1.3.6. Existing OpenAPI test20/30s limits
are unchanged from the round's base; the added compiled-Mongo test declares its
own30s limit. Diff audit finds **zero newly introduced skip calls**.

### Root integration bootstrap ownership and safe-error contract

First root attempt stops before tests: **0 passing /1 failing**, exit1,20.39s.
The production host has started and drained successfully; bootstrap's test-only
`require('express').Router()` incorrectly assumes a hoisted root dependency.
The clean install correctly owns Express5.2.1 under core; root has no direct
Express dependency. A network-none probe confirms root resolution fails while
`createRequire(require.resolve('@researchdatabox/redbox-core/portal'))` resolves
core's5.2.1 and Router function (**3 ownership assertions pass**). Commit
`ff0bb3623` changes only bootstrap dependency resolution, with no new dependency,
application behavior, assertion, timeout or skip.

Second full root run: **421 passing /10 unchanged pending /1 failing**, exit1,
31.50s. The remaining RequestChronicle expectation requires native provider text
with token substitution. The intentional v6 operation-observation contract already
recorded above (and covered by core tests) records a safe operation error without
arbitrary provider text, which can include record/user/translation contents not
recognized by credential redaction. Restoring that native text would regress
privacy. Commit `6af1e2841` aligns this stale root expectation: exact
`Translation read failed`, no upstream prefix or Authorization text, no credential
in the entire event. It retains HTTP500, exactly one error/event, correlated route,
severity, operation failure flag and zero warnings. This is a documented v6 safe
error contract conversion, not removing a failing privacy scenario.

Original logs/timings: `final-a8c6712d0/root-mocha-attempt{1,2}{,-time}.log`;
resolution probe: `root-dependency-resolution.log`. The next full root gate is
separately recorded as `root-mocha-final`.

Both fixes affect only verifier files excluded by `.dockerignore`'s root `test`.
`git diff a8c6712d0..6af1e2841 --name-only` contains exactly those two test files;
there is **no application/config/dependency/build input delta**. The immutable
application image source remains clean commita8c6712d0; mounted verifier source
is committed6af1e2841. Subsequent documentation generation asserts that precise
two-file-only committed delta. No completed application gate is discarded or
rerun because of unchanged application code.

### Final root integration and generated documentation gates

Full root integration retry at committed verifier6af1e2841 against application
imagea8c6712d0: **422 passing /10 unchanged pending /0 failing**, exit0,30.74s
(Mocha body19s),2026-10-24T14:17:14Z–14:17:45Z. Production Express initializes,
serves real integration requests and reports zero operations/clients/pools on
owned stop. All original correlation/privacy checks pass with the documented
safe operation contract. The ten unchanged pending cases are seven DOI writes,
one explicitly unmigrated legacy form, one opt-in live DataCite provider call
and one production RVA vocabulary import. They are **not executed or counted as
coverage**; no new skip has been introduced.

`run-root-image.sh` resets only disposable synthetic DBs/Solr, supplies selected
configuration/session inputs, mounts committed root tests/support/TypeScript
verifier inputs read-only, and invokes
`bash support/integration-testing/run-mocha-express.sh` in the clean test image.
Application source/dist/node_modules are not mounted. Core's fixture correction
adds `-v "$PWD/test/resources:/opt/redbox-portal/test/resources:ro"` to the actual
immutable-image `npm --prefix packages/redbox-core test` command.

Generated documentation and lint run under Node26.11.1/npm11.20.0 at verifier
commit6af1e2841, with the exact two-test-only delta from application commita8c6712d0
asserted before execution. **All exit0**,109.59s combined:

| Command | Actual result |
|---|---|
|`npm run doc:api`|JSON/YAML/Blueprint/HTML all generated|
|`npm run docs:generate`|43 published surfaces/523 advisory findings|
|`npm run docs:audit`|43 surfaces/523 findings, advisory policy unchanged|
|`npm run docs:test`|4 passing/0 pending/0 failing,21ms|
|`npm run lint`|934 files,0 warnings/0 errors; package-boundary check passes|

Outputs remain in the documented generated locations; no docs site is published.
Detailed logs and health JSON are under `final-a8c6712d0/`. The authoritative wiki
is ordinary main-repository content, including the complete intentional behavior
break/affected-client/remediation table linked from upgrade/recovery. Final wiki
status wording and relative-link validation follow completion of the remaining
deployment/browser/recovery gates.

### Browser qualification regression — HTTP opener policy

A8 browser harness passes **19/0/0**. The full124-case Playwright attempt starts
with `PLAYWRIGHT_REQUIRE_COMPLETE=true`,one worker,no retries. It is deliberately
interrupted after identifying a systematic production-code failure, to fix it
before repeating the complete suite: **32 failed /1 interrupted /91 not run**,
gate exit1,2026-10-24T14:19:35Z–14:23:21Z. None of the interrupted/unrun cases is
counted as coverage. Diagnostics from32 completed scenarios contain84 Chromium
console errors rejecting `Cross-Origin-Opener-Policy` on untrustworthy plain-HTTP
`redboxportal`; one request abort accompanies interruption. Portal stop exits0
with no OOM. The fixture's Docker health check incorrectly used default1500 while
actual readyz/browser requests use1504; the runner now selects existing `REDBOX_PORT=1504` so the native health check
uses the same port. This was separate from the browser failure and changes no
application readiness assertion.

`pageHeaders.ts` unconditionally emitted `same-origin-allow-popups`, introduced
while restoring legacy header ownership earlier in P8. The production header
owner now receives the **validated configured public URL**. It emits that policy
for HTTPS, omits it for HTTP/unspecified origin, and never selects it from request
or forwarded headers. Caching/CSP/auth/transport/diagnostics contracts are unchanged.
No browser diagnostic is allowed/ignored to accommodate the error.

Regression added **before** the fix, actual clean a8 test image, network none,
only two changed test inputs mounted read-only: **29 passing /1 failing**, exit1,
exact header-presence mismatch for configured HTTP. After mounting the corrected
header source for diagnosis only: **30 passing /0 pending /0 failing**,315ms,
exit0. Existing secure-header/static-cookie/cache assertions remain and explicitly
select their HTTPS fixture origin. Two new checks require HTTP omission despite
forwarded HTTPS and HTTPS retention despite forwarded HTTP. The corrected
production composition also passes its actual public URL to both ordinary page
and static header paths. No timeout, skip, diagnostic allowlist or weakened
assertion. This focused source overlay is **not** final artifact acceptance.

Source commit `5088f4a7a5be746697ba7b493c302b57f85e19a8` contains the four-file
implementation/regression fix. Pinned Prettier passes; complete core Prisma/schema/
TypeScript build exits0 under Node26.11.1/npm11.20.0. No dependency changes.
Logs: `page-header-{red,green,format,build}100.log`; failed browser diagnostics,
complete partial-run log and portal/state logs are preserved under
`final-a8c6712d0/`. Earlier completed candidate suite logs/matrix are preserved
there before reuse of runner output paths. The new clean5088f4a7a archive and
all final packs/images/suites, including already successful gates, follow.

### Replacement clean5088f4a7a packs and controls

`build-final101.sh` creates a fresh committed archive at
`/mnt/docker-storage/sr-p7-clean-production/.tmp/sr-p8-clean-5088f4a7a` and
reruns source inventory/AST closure/reconciliation before the real Docker build.
Actual source closure remains **1050 files/0 executable violations/0 forbidden
entries**, all1261 baseline entries reconciled. The clean builder recompiles
all packages, Angular, webpack and API outputs. Real pack qualification passes
**12 archives/20 checks**, stage194.2s, including ESM-only/TLA, CommonJS, bundled,
offline and compiled scaffold consumers. Eleven archive hashes are identical to
a8; only core changes to
`sha256:131a4f6d4a508fd1ec9d3858b7e85ad4b39c975117809a544764e29faec76bca`.

Fresh canonical auditor/shim controls at source5088f4a7a:
`node --test test/tooling/retirement-closure.test.cjs test/tooling/retire-v5-shims.test.cjs`
**6 passing /0 failed /0 skipped**,1508.744579ms, exit0. Clean image construction
and all final suite results follow; these facts alone do not close SR-055.
Installation/development/client wiki clarifications remain ordinary tracked
main-repository changes. A fresh changed-page/runbook link audit checks
**35 files/133 relative links/0 missing**. Generated docs/lint are rerun below
against the corrected source before acceptance.

### Replacement5088f4a7a immutable images and graph closure

All clean builds finish before2026-10-24T14:49:23Z, `build-final101.sh` exit0.
All package/core/root/Angular/webpack/API commands execute from the committed
archive, with normal containerd GC settings; no export lease workaround is needed.
Runtime export/unpack step33.2s; test129.2s; rehearsal66.0s. Exact source labels
on all images equal5088f4a7a5be746697ba7b493c302b57f85e19a8.

| Image | Immutable ID | Audited owned files | Executable violations / forbidden dependencies |
|---|---|---:|---:|
|Runtime|`sha256:9a9d595cb224d2215a5a31085e1d4663e64649eaa5212fb99f323da078cbe414`|3781|0/0|
|Test/tooling|`sha256:2e86451c0651b1102d928a82a20e5c9c5460bb819688580ae06bc5c9835d3658`|5845|0/0|
|Rehearsal|`sha256:581f7c6d5fe880e3c6daff909079635ee34d7cf75c93adc35b9bad90ef8806a1`|3994|0/0|

Every image independently proves236 obsolete generated shims absent/nine authored
paths preserved. Runtime/rehearsal default to `node`; test defaults to root (Docker
inspect omits the User key in that case). An initial metadata assembly probe
assumed the key existed, raised KeyError and wrote no partial manifest; it now
records Docker's actual default. All CMDs remain `node app.express.cjs`.
Actual native versions: Node26.11.1/npm11.20.0/Chromium156.0.8078.47 on Debian12.

Strict installed packed consumer: **1194 packages,2191 owned files,0/0**,
exit0,133.04s. Packed-content closure independently verifies all12 hashes and
scans2191 files,0/0. Canonical auditor SHA unchanged. Gates packed-closures
14:49:23Z–14:51:38Z and image-closures14:51:38Z–14:52:23Z both exit0.
Providers then restart/readiness-pass by14:53:16Z, including real Mongo29511/13
pings and authenticated Mongo9 at29512; no missing-provider skip. Mongo limits
remain64000:64000. Current full core starts14:53:16Z.

[Current artifact manifest](p8-artifacts.json) records only this replacement's
actual artifacts/results; [superseded a8 manifest](p8-artifacts-a8c6712d0.json)
preserves its completed suites and failed browser attempt. Detailed new logs are
under `.tmp/sails-retirement/p8/final-5088f4a7a/`; actual serial driver is
`run-all-final-gates101.sh`. No registry publication or push.

### Replacement5088f4a7a core, packages, topology and root regression

Every result in this section uses the new clean5088f4a7a images and committed
5088f4a7a verifier inputs. Serial gate timestamps are UTC2026-10-24. Full core
Mocha runs14:53:16–14:56:17,181.00s: **4498 passing /7 unchanged pending /
0 failing**,exit0. The seven baseline placeholders remain unexecuted and do not
count as coverage (RaidService2,TriggerService2,WorkspaceService3). Real Mongo
cases execute; committed font resources are mounted read-only. Initial migration
case takes1737ms under its unchanged5000ms limit.

Compiled record-type gate14:56:17–14:56:24: **3/0/0**,exit0,7.43s. Generated v6
institution-app gate14:56:24–14:56:49: **1/0/0**,exit0. This verifies the actual
compiled scaffold through production composition; it is synthetic and does not
designate an institution. Package gates14:56:49–14:58:37 all exit0: dev-tools
**52 passing**, PDF unit **75 passing**, storage **304 passing** with actual
Mongo; no pending/skips/failures.

`run-database-image.sh` invokes the committed
`support/integration-testing/qualify-sails-retirement-databases.sh` with clean test
and rehearsal image IDs. Matrix14:58:37–15:05:22,405.24s,exit0: **216 passing /
0 failing /0 skipped**. Each row executes one ownership test, one complete
production-host test and30+10+12 real persisted regression cases:

| MongoDB / FCV | Topology | Passing | Result |
|---|---|---:|---|
|8.0.34 /8.0|Independent core/storage standalone|54|Restart,GridFS,auth,drain/retry,zero pools|
|8.0.34 /8.0|Independent core/storage three-member sets|54|Both sets step down/re-elect in ownership and production checks|
|9.0.4 /9.0|Independent core/storage standalone|54|Restart,GridFS,auth,drain/retry,zero pools|
|9.0.4 /9.0|Independent core/storage three-member sets|54|Both sets step down/re-elect in ownership and production checks|

Each production row executes10 authenticated APIs, assets, translations, pages,
health200, readiness503→200 and anonymous401; clean stop leaves0 pools. Exact
members/elections and per-row metadata are preserved in[p8-artifacts.json](p8-artifacts.json).
All Mongo containers are inspected with `nofile=64000:64000`; exact8/9 image
hashes remain those recorded above. All matrix containers stop/remove successfully.
This is local supported-topology proof; institution-specific auth/TLS/topology
remains SR-005/045/049's existing external gap.

Full root integration15:05:22–15:06:01: **422 passing /10 unchanged pending /
0 failing**,exit0,39.10s. Production Express serves the full compiled-source
integration suite and ends with0 operations/clients/pools. Its ten baseline
placeholders/external opt-ins are explicitly listed in the earlier root section;
none counts as coverage. No application/test/dependency change was made between
these new clean gates. Detailed logs remain in
`.tmp/sails-retirement/p8/final-5088f4a7a/` and `database-image-final/`.

### Replacement5088f4a7a generated references and lint

`run-docs101.sh` verifies HEAD is the exact clean application/verifier5088f4a7a
commit before running all documented generation commands. Gate15:06:01–15:08:06,
exit0. `npm run doc:api` regenerates JSON,YAML,Blueprint and HTML;
`npm run docs:generate` and `npm run docs:audit` each report **43 published
surfaces/523 advisory findings**, with the existing advisory policy unchanged.
`npm run docs:test`: **4 passing /0 pending /0 failing**,20ms.
`npm run lint`: **934 files/0 warnings/0 errors**,125ms, package-boundary check
passes. Generated API/site/health outputs remain in their documented ignored
locations; no site or package is published. This is a fresh new-source run and
supersedes the prior candidate's documentation proof. Current intentional-break
list additionally documents safe request-chronicle messages and log-processor
remediation; wiki stays ordinary tracked files in the main repository.

Documentation-health detail remains explicit:246 undocumented-member,196 missing
parameter descriptions,45 missing return descriptions,30 missing examples,4
invalid form-component JSON examples (missing current required component fields),
and2 unclassified surfaces (`RelatedObjectDataComponent`,`ApplicationModule`).
The neutral hook/contributor TypeScript migration examples compile and all4 docs
tests pass; the4 advisory JSON examples are not reported as validated. The wiki
now distinguishes the hook example's use of ApplicationModule from publication
of a separate classified surface. None of these findings is suppressed or turned
into runtime proof; the documented advisory policy permits recorded findings.

### Replacement5088f4a7a complete browser qualification

Full Playwright gate15:08:06–15:18:16UTC2026-10-24,609.63s including setup and
teardown: **124 passing /0 failing /0 skipped**,exit0. Browser body536299.346ms
(8.9m). `PLAYWRIGHT_REQUIRE_COMPLETE=true`,one worker,zero retries; the required
coverage reporter confirms **20 application IDs/30 form IDs,complete=true,
errors=[]** and exactly one passed result for each of124 cases. Browser harness
also passes **19/0/0**,10201.278473ms. The portal runs the immutable5088f4a7a
test image, its native readiness probe is healthy, and owned stop exits0 with
OOMKilled=false. Configured HTTP responses produce no rejected opener-policy
console errors. No test, diagnostic allowance, skip, timeout or assertion changed
for this retry.

The user interrupted the tool turn after this gate completed. The serial driver's
next Bruno provider pull has no completion/result and no test containers exist;
its partial provider-pull log is retained, not counted as executed coverage.
`resume-final-gates103.sh` verifies the same committed HEAD and all three exact
image source labels, then resumes Bruno→PDF→runtime→recovery. No passed gate is
rerun or substituted. Successful and failed gate records remain separate from
this interrupted infrastructure start. No provider/model quota was reported.

### General Bruno disk-capacity failure and unchanged-guard retry

First completed general Bruno attempt15:24:00–15:28:47UTC,gate exit1,286.72s
including pinned provider pulls/start/cleanup. The collection body takes24115ms:
**223 requests passed/1 failed/85 not run after bail;410/411 tests,3/3 assertions**.
The first resumable attachment create returns500 instead of201. No unrun request
counts as coverage; OIDC/S3/PDF/runtime/recovery have not run at this point.
Containers/volumes clean up successfully. Failed collection/JUnit/provider/state
logs are preserved under `final-5088f4a7a/bruno-attempt1/` before retry.

A tight HTTP probe in the actual immutable test image uses its compiled
ResumableUploads, actual policy/context chain, Flydrive FSDriver, real filesystem
and the unchanged configured10GiB reserve. Only actor/record lookup ports use
fixed synthetic values; no disk result, tus server or response is mocked. Command:

```sh
docker run --rm --network none --user root \
  -v "$PWD/.tmp/attachments:/attachments" \
  -v "$PWD/.tmp/sails-retirement/p8/upload-space-probe104.cjs:/opt/redbox-portal/upload-space-probe104.cjs:ro" \
  sha256:2e86451c0651b1102d928a82a20e5c9c5460bb819688580ae06bc5c9835d3658 \
  node upload-space-probe104.cjs
```

It deterministically fails the201 assertion: **3298189312 bytes free**, reserve
**10737418240**, response500 `{message:"not-enough-disk-space",details:""}`.
That explicit guarded response and arithmetic identify an unmet test-environment
precondition; generic missing-directory/tus-write-error hypotheses are eliminated.
The same probe/request/image with **only the attachment bind source changed** to
`/home/andrew/.npm/_redbox-sails-retirement-p8/attachments` passes: free
**7877670338560 bytes**,status201,correct root-relative attachment Location.
Probe cleans its synthetic directory and owned server on both outcomes.
Logs `upload-space-probe104-{red,green}.log`; no instrumentation enters source.

Qualification-only Compose overrides now bind disposable general/OIDC/S3
attachments and separate PDF attachments under that already-recorded large
user-owned scratch mount. Compose config inspection confirms the exact selected
bind and Mongo nofile64000:64000. **No application, image, configuration reserve,
test assertion, timeout or skip changes.** The failed run correctly exercised the
low-space refusal. The complete unchanged collections are rerun with sufficient
storage, keeping all other passed5088f4a7a gates applicable. Main source remains
the same clean committed5088f4a7a artifact; this environment correction requires
no rebuild. Current retry driver: `resume-final-gates105.log`.

### Replacement5088f4a7a complete general/OIDC/S3 Bruno qualification

The unchanged full collections with sufficient staging capacity pass; combined
serial gate15:31:46–15:43:38UTC,**exit0**,712.15s including all fresh providers,
readiness/realm discovery, installed-image portal preparation and full teardown.
Each profile records a passing marker, complete JUnit and provider identities.

| Collection | Requests | Tests | Assertions | Failing / skipped | Body ms |
|---|---:|---:|---:|---:|---:|
|General|309|553|3|0/0|65919|
|Dedicated OIDC|13|17|0|0/0|9627|
|S3|7|12|0|0/0|5005|
|Total|329|582|3|0/0|80551|

Independent JUnit totals are556,17,12 checks, each0 failures/0 errors/0 skips.
All three runner exits and cleanup exits are0. Real providers include Mongo9.0.4,
Solr, Keycloak26.5.6, mail and S3 mock; exact per-profile image IDs and Mongo
nofile64000:64000 are captured in[p8-artifacts.json](p8-artifacts.json).
S3 mock is `adobe/s3mock@sha256:ab01a6946750f451ca215a47e91030695b260e4003b8a5a6201d25029b8fca92`.
The source Compose pins identify the remaining exact provider image digests.
No live identity/storage provider is substituted with a test skip.

Actual commands are the committed general/OIDC/S3 Compose profiles with
`--profile ci`, the unchanged collection runners and the qualification-only
network/attachment-volume overrides described above. The general/OIDC images
use installed dependencies and compiled packages. S3's existing guarded runner
also rebuilds core from the immutable tooling image's own source/scripts before
index preparation because those scripts exist in the test target; no host core
source/dist/dependency tree is mounted. Default production/pruned-runtime behavior
is separately verified by the following runtime gate. No application/source,
assertion, timeout, dependency or reserve change was required for these passes.

### Native PDF fixture environment failure and committed correction

First PDF gate15:43:38–15:44:20UTC,**exit1**,41.60s: extension startup fails
before tests. **0 Bruno requests executed**; no JUnit exists. The collection's
missing-JUnit copy also fails, so it is not mistaken for a successful collection
when Compose exits after a dependency failure. All containers/volumes clean up.
Logs preserved in `final-5088f4a7a/pdf-attempt1/`.

A network-none,read-only,node-user probe invokes real installed
`createPortalApplication` with exactly the PDF deployment module and the CLI's
same environment/discovery inputs. Integrationtest mode deterministically exits1:
`Extension @playwright/test: declared dependency is not installed`. The pruned
rehearsal graph intentionally excludes development dependencies; the old PDF
Compose override incorrectly selected nonproduction discovery. One-variable
probe with `NODE_ENV=production` constructs successfully, **0 resources /
0 operations /0 clients /0 pools**,exit0. Logs
`pdf-offline-probe107-{red,green}.log`; no datastore/provider or extension is mocked.

Commit `bebb61ccb` corrects both PDF API-integration and development Compose
files to use the runtime's production mode, retaining the same explicit deployment
module, authentication, storage, bootstrap, real providers and all PDF assertions.
No dependency or test/assertion/timeout/skip change. `git diff5088f4a7a..bebb61ccb`
contains **only those two externally applied Compose YAML files**: no application,
configuration-module, package, compiler/build or dependency changes. The clean
application artifact source/IDs remain5088f4a7a; no application suite is invalidated
by an external fixture-environment correction. The deployed production artifact
already defaults to production. PDF retry and subsequent gates use committed
fixture verifierbebb61ccb, with the exact two-file delta asserted by
`resume-final-gates108.sh` before execution. Image source labels remain5088f4a7a.

The completed Bruno runners wrote synthetic request/session variables into their
mounted environment file and normalized the test lock's top-level package name.
These generated test outputs are restored to their committed inputs; no dependency
resolution changed and no generated credential enters an implementation commit.

### Native PDF actor-credential fixture correction

The next full PDF run15:47:19–15:51:46UTC,exit1,does reach the actual generator.
Create succeeds201; native generation correctly refuses missing `pdfgen.token`.
The existing210000ms attachment poll expires unchanged: **2 requests executed,
1 passed/1 failed;3/4 tests;2 further requests not run**. Body210875ms.
No omitted generation is counted as PDF proof. Complete failed logs/JUnit remain
in `final-5088f4a7a/pdf-attempt2/`. The first failure had masked this second
missing explicit fixture input.

A focused installed-configuration probe now also requires the PDF token to be
nonempty and match the explicitly configured fixture actor credential. Production
composition is red before correction (`credentialMatches:false`),green afterward
(`credentialMatches:true`); both acquire0 resources/operations/clients/pools.
Only booleans are logged,never the credential. Logs `pdf-token-probe109-{red,green}.log`.

Commit `d160b8ccc` binds `pdfgen.token` to the **already-existing disposable API
actor credential** in the explicit PDF fixture deployment module. This applies to
both fixture Compose consumers. Production token defaults remain empty; native
PDF HTTP/byte/audit assertions and the210s poll remain unchanged. No dependency,
application implementation or compiler/build change. The current verifier delta
from application5088f4a7a is exactly **three external PDF fixture files** (the two
Compose selections plus their selected deployment input), asserted by
`resume-final-gates110.sh`; image source labels/IDs remain5088f4a7a. The complete
PDF collection is rerun from fresh providers before runtime/recovery proceed.

### Native PDF brand hydration correction

The d160b8ccc retry ran15:52:17–15:56:27UTC,exit1,250.84s.
It again executed2 requests (1 passed/1 failed),3/4 tests;2 requests were not
run after the unchanged210s attachment poll failed. The preceding offline probe
had checked only top-level extension configuration, which was the wrong boundary.
The actual generator reads hydrated `AppConfigs` brand settings. Its registered
PDF configuration model supplies an empty token which overrides that top-level
extension value. This failed attempt remains in `final-5088f4a7a/pdf-attempt3/`;
it is not qualification.

Commit `a5d4c0e92` moves the same disposable actor credential to the fixture's
`brandingConfigurationDefaults.pdfgen.token`. Production defaults, application
code, dependencies, assertions and timeouts are unchanged. The stronger probe
uses the actual installed `createPortalApplication`, registered configuration
models and `AppConfigs.loadAppConfigurationModel`; only synthetic empty repository
rows are supplied. It reports `credentialMatches:false` before the correction
and `true` afterward, with0 acquired resources/operations/clients/pools. Logs:
`pdf-brand-token-probe111-{red,green}.log`. No credential is printed.

`resume-final-gates112.sh` verifies committed fixture revisiona5d4c0e92 and the
same exact three-file external fixture delta from application5088f4a7a, checks
all three immutable image source labels, then runs fresh PDF, runtime-artifact
and released-v5 recovery gates serially. The PDF README now explains the actual
brand-default input and actor view permission requirement.

### Native PDF obsolete readiness-selector correction

The a5d4c0e92 attempt reaches native Chromium but its integration audit records
`BrowserError`, cause `Waiting for selector div#loading.hidden failed`. The
fixture's onCreate/onUpdate operation options still selected a marker removed
from the current Angular form. The optional session-only `/user/info` request
returns403 for this bearer-only browser; it is not the form failure. No identity
policy is relaxed.

The real Chromium diagnostic `pdf-readiness-probe114.cjs` runs inside the same
installed rehearsal container with its configured actor and created record.
It receives200, waits for the actual initialized-components container and asserts
that the obsolete marker is absent, the current marker exists and9 direct form
children are rendered. Result in `pdf-readiness-probe114.log`:
`status:200,oldLoadingSelector:false,loadedComponentsSelector:true,renderedFields:9`.
The Angular implementation sets `componentsLoaded` only after every component
wrapper, FormGroup, baseline, subscriptions and form-definition-ready event.

Commit `35042a07c` corrects both external fixture operation options to wait for
`redbox-form .rb-form-components:not([aria-hidden="true"])`. This preserves the
requirement to render the initialized form, all native generation/byte/audit
assertions and the existing210s poll. The fixture directory is mounted read-only
at `/pdf-fixtures`; it is an explicitly selected deployment input, not a change
to the qualified application image. The delta from application5088f4a7a is now
four external PDF fixture files, with no application/package/build/dependency
change. The PDF README explains the current readiness marker.

The a5d4c0e92 PDF collection finishes15:58:03–16:02:26UTC,exit1,262.87s:
2 requests executed (1 passed/1 failed),3/4 tests;2 further requests unrun after
the unchanged210s attachment poll. Failed attempt logs/JUnit are preserved in
`final-5088f4a7a/pdf-attempt4/`. The serial `resume-final-gates115.sh` starts from
committed fixture35042a07c, asserts the exact four-file delta and immutable image
labels, and reruns the same PDF collection against fresh providers before the
runtime/recovery gates.

### Native PDF production-audit verification boundary

Fixture35042a07c runs16:02:30–16:03:24UTC,exit1,54.37s. All4 requests execute;
3 pass/1 fails,8/10 tests pass,body7545ms. Native Chromium generates and stores
the PDF; attachment discovery and the200 download/content assertions pass.
Only the final immediate audit read fails: parent status is still `started`,
and its successful child has not yet been persisted. Failed logs/JUnit remain
in `final-5088f4a7a/pdf-attempt5/`.

The actual `IntegrationAudits.queueOrPersist` contract persists directly only
in integrationtest mode; production submits the owned Agenda store job. Its
unchanged default poll is5 seconds and store concurrency is1. The now-correct
production fixture therefore exposes an existing asynchronous boundary that the
old immediate assertion did not account for. Attachment visibility is an earlier
boundary; it does not promise that every subsequent audit job has run.

Commit `84eb91a70` adds a bounded30s pre-request poll for the successful parent
and child with matching trace/parent span, breaking immediately for a failed
parent. Then **all unchanged final-response assertions** run: HTTP200, PDF
entries, successful parent/finalStatus, successful child trace/span, file ID,
attempt, URL and readiness strategy. No assertion or scenario is deleted, no
skip is added, and no existing attachment timeout or production queue behavior is
changed. This is synchronization with the actual production contract, not a
replacement for a failing assertion. `resume-final-gates116.sh` asserts the
five-file external fixture/verifier delta and unchanged image labels before the
full PDF retry; runtime and recovery follow only if the collection passes.

### Replacement5088f4a7a complete native PDF qualification

Final PDF gate16:04:38–16:05:37UTC,exit0,58.94s,fixture/verifier84eb91a70.
**4 requests/10 tests/0 assertions,all pass;0 failures/skips**,body19842ms.
Independent JUnit parsing confirms10 cases,0 failures/errors/skips. Creation201,
attachment listing200, PDF download200/content and the successful terminal
parent/child trace with span linkage and metadata all pass. Native Chromium
156.0.8078.47 renders the actual selected form in the installed pruned rehearsal
image581f7c6d5fe8. Real Mongo9.0.4 has nofile64000:64000; Solr10 uses the pinned
c2a983cd image. Image identities and limits are in `pdf-final-identities.log` and
[p8-artifacts.json](p8-artifacts.json). Runner/Compose cleanup both exit0; all
PDF containers/volumes are removed. The mounted byte directory stays retained.

The broad clean5088f4a7a artifact/suites remain applicable: subsequent committed
deltas are exactly the five external PDF fixture/verifier files asserted before
this run. No production implementation, configuration default, package build,
dependency or image is patched. Native runtime-default and full released-v5
checkpoint recovery now proceed serially against the same immutable artifacts.

### Replacement5088f4a7a actual runtime-default qualification

```sh
SR_P7_IMAGE=sha256:9a9d595cb224d2215a5a31085e1d4663e64649eaa5212fb99f323da078cbe414 \
SR_P7_DEFAULT_ENTRYPOINT=true \
  bash support/integration-testing/qualify-sails-retirement-artifact.sh
```

This command
runs16:05:37–16:06:32UTC,exit0,55.54s. Image inspection confirms default user
`node`,CMD `node app.express.cjs`. Only read-only verifier/deployment inputs are
mounted; application source,dist,node_modules and compiled assets come from the
immutable clean image.

Asset inventory **1 passed/0 failed/skipped**:20 Angular applications,6 view
directories,standalone exports and no Sails. Installed component lifecycle **1
passed/0 failed/skipped** on real independent Mongo8.0.34/FCV8.0 core/storage
servers,nofile64000:64000:maintenance,ledger,HTTP,GridFS,drain and restart.
Explicit installed index maintenance exits0. Actual default executable fresh and
restart probes each return200 for health/readiness/page/asset/CSRF-login and run
20 persisted form reads. Native image healthcheck also passes on nondefault
REDBOX_PORT18527. Fresh startup9s,restart6s; both stops0s,exit0,OOMfalse.
Observed container memory343.3MiB fresh/273.6MiB restart within1.5GiB bound;
form read p95=16.364/15.549ms respectively. All owned providers/verifier/portal
containers are removed after stop. Detailed structured probe/state/timing summaries
are in [p8-artifacts.json](p8-artifacts.json); logs remain in
`.tmp/sails-retirement/p8/runtime-artifact-final/`.

### Replacement5088f4a7a complete released-v5 cutover and recovery

Actual command, with the recorded Node26 toolchain and isolated Docker socket:

```sh
SR_P7_CANDIDATE_IMAGE=sha256:581f7c6d5fe880e3c6daff909079635ee34d7cf75c93adc35b9bad90ef8806a1 \
SR_P7_SCRATCH_ROOT=/home/andrew/.npm/_redbox-sails-retirement-p8 \
SR_P7_RECOVERY_NETWORK=sr-p8-profiles \
  bash support/integration-testing/rehearse-sails-retirement-recovery.sh
```

Gate16:06:32–16:11:04UTC,exit0,271.43s. The released-v5 stand-in is
`qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`,
actually running Node24.16.0/npm11.13.0. Candidate uses the clean installed
rehearsal image,Node26.11.1/npm11.20.0. Core/storage are independent real
Mongo8.0.34/FCV8.0 servers,nofile64000:64000. Mongo tools100.19.1.

Source home/local-login and20 form reads pass;2 records,2 forms,2 workflows and
2 pages are verified. Source startup102s/stop0s,exit0. After quiescing all writers,
the consistent checkpoint contains **24 collections/1895 documents,including
GridFS**,both datastore archives,primary/staging bytes,configuration and the
complete matching released image/hook payload. Retained checkpoint:
`/home/andrew/.npm/_redbox-sails-retirement-p8/sr-p7-recovery.Zhos5q/checkpoint`.
Its image archive has23 layers,525915136 bytes,SHA256
`052c811bf18ced5437a52740ce8cfe19b867af37f14ad3b2042e80aebc461f1d`; actual
payload validation passes. Exact database/file archive sizes/hashes are in the
artifact manifest. No archive or binary is committed.

Index inspect correctly reports not-ready for the exact nonunique v5
`record.redboxOid_1`. The separate guarded operator review confirms0 duplicate
OID groups and preserves2 records before removing only that definition; explicit
ensure/inspect then report ready. Installed candidate ensure,inspect and
initialize-only commands all exit0. Actual v6 cutover and fresh-process restart
both return200 for home/login/health/readiness and20 form reads, preserving all
selected records/forms/workflows/pages. Fresh session version6 and CSRF login
are verified. Candidate startup9s/restart13s; stop0s/1s respectively,exit0,OOMfalse.
Container memory369.1/296.3MiB within1.5GiB. Form-read p95=21.705/21.016ms.

The installed component verifier proves migration idempotency,4 preserved roles,
local password and the deliberately injected partial migration failure. With
writers stopped, it damages the disposable databases,primary/staging bytes and
configuration. Both complete database archives restore with --drop (1885 core +10
storage documents,0 restore failures); saved bytes/configuration and matching
image payload are restored. Full inventory verification again reports exactly
24 collections/1895 documents including GridFS and original index definitions.
Only then does the recovered old image start; home/login and20 form reads pass,
with all selected record/form/workflow/page fixtures intact. Recovered startup28s,
stop0s,exit0,OOMfalse;memory424.8MiB,p95 form reads40.560ms.

The driver completes with exit0 and writes
`final-5088f4a7a/qualification.complete`. All owned rehearsal containers are
removed. This is complete **public released-v5 stand-in** recovery through both
Prisma and runtime retirement. It does not designate an institution.

## Final qualification and task disposition

| Task | Final disposition and evidence |
|---|---|
| SR-051 | Accepted:236 exact obsolete shims absent,nine authored paths preserved;safe edited/symlink reconciliation;clean installs/builds/packs do not regenerate them. |
| SR-052 | Accepted:comparison adapters/globals/types and executable dependencies removed;source,built,packed,1194-package strict installed consumer and all three image graphs report0/0. Every direct/lock dependency change and removed router override has a reason in p8-dependencies.json. Historical published package names stay unchanged. |
| SR-053 | Accepted:standalone full Mocha/bootstrap,real profiles,Docker default CMD/user/native health,CI/maintenance and v6-only dev-tools/scaffold qualify without Sails installed. PDF fixture and asynchronous audit verification corrections are documented above. |
| SR-054 | Accepted:tracked wiki and generated reference inputs describe implemented v6;operator/client break table is linked from the upgrade runbook;both generators,audit and compile-checked examples run. Advisory findings remain explicit. |
| SR-055 | All local final-artifact/inventory/packed-hook/bundled-hook/fresh/restart/stop/full-suite/released-v5 recovery work passes. **Partial/unchecked only for the undesignated representative institution**, inherited from SR-005/045/049; the original acceptance criterion is preserved. |

Final current-artifact results (failures are0 in every completed row):

| Gate | Actual passing result; pending/skips |
|---|---|
| Core Mocha |4498 passing;7 unchanged pending,0 failures. Pending cases are not counted as coverage. |
| Root integration Mocha |422 passing;10 unchanged pending,0 failures;0 retained operations/clients/pools on stop. |
| Compiled RecordTypes / generated production scaffold |3/1 passing respectively;0 failures/skips. Scaffold is synthetic. |
| Dev-tools / PDF unit / storage |52/75/304 passing respectively;0 failures/pending;storage uses real Mongo. |
| Mongo8/9 standalone + independent core/storage three-member sets |216 passing;0 failures/skips. Exact engines8.0.34/9.0.4,FCV8.0/9.0;both datastore sets elect/reconnect;GridFS,restart,HTTP and drain retry execute. |
| Full Playwright |124 passing,0 failed/skipped,retries0;all20 application/30 form scenario IDs complete. Harness19 passing/0 failed/skipped. |
| General/OIDC/S3 Bruno |309/13/7 requests;553/17/12 tests;3/0/0 assertions. Total329 requests/582 tests/3 assertions,0 failures/skips;all teardowns0. |
| Native Chromium PDF Bruno |4 requests/10 tests,0 failures/skips;terminal parent/child trace and downloaded PDF bytes verified. |
| Clean npm pack/consumers |12 archives/20 checks,0 failures/skips;ESM-only/TLA,CJS/ESM hooks,offline/import isolation,production scaffold and bundled extensions. |
| Actual production runtime |1 asset +1 installed-component test;fresh/restart HTTP/login and40 total form reads;native health,stop exit0. |
| Released-v5 full cutover/restart/recovery |24 collections/1895 documents,bytes/config/image restored and recovered probes pass;0 failed/skipped gates. |
| Generated docs/API/audit/tests/lint |43 published surfaces,523 explicit advisory findings;4 docs tests pass;934 lint files,0 errors/warnings. Four pre-existing invalid JSON examples are not claimed validated. |
| Canonical shim/auditor controls |6 passing,0 failed/skipped;zero source/built/packed/installed executable/forbidden entries. |

Exact commands,UTC gate times,image IDs,pins,provider identities,checksums,
per-suite counts,pending cases and every failed/superseded attempt are recorded
above and in [p8-artifacts.json](p8-artifacts.json). The focused commit ledger is
[p8-commits.json](p8-commits.json); the superseded A8 artifact record is retained
separately. The only post5088 implementation-tree differences are explicit external
PDF fixture/verifier inputs; subsequent wiki/README/status/evidence changes do
not alter the qualified application packages or images.

Regressions found during full retirement were fixed in application code:owned
page language/options and navigation contracts;artifact headers/authenticated
callbacks;query/identifier/schema validation and retained error codes;request
chronicle observer isolation/privacy;accepted audit shutdown followups;record
transport/hook authorization;configured font upload limits;Angular HTML packaging,
clean storage-lock metadata,exact emitted tslib and production scaffold discovery;
and configured HTTPS opener policy. The current full suites pass after the final
production correction. Tests retain their behavior assertions and record explicit
fixture/ownership/API-contract migration justifications in the chronology; no
missing-provider skip or removed assertion is substituted for proof.

After all gates,cleanup removes the six stopped owned P8 fixtures,the owned
sr-p8-profiles network and its three specifically commented firewall rules.
There are0 P8/artifact/rehearsal containers left. The isolated daemon,immutable
images,P7 artifacts/checkpoints and completed P8 checkpoint/byte stores remain.
Default Docker,unrelated work and the untracked graphql-record-metadata directory
are untouched. Nothing is pushed,published or uploaded to a registry. Wiki commits
are ordinary focused main-repository commits; no submodule is created.

Final documentation link audit after the closing status/runbook edits checks
**39 changed wiki/runbook files,146 relative links and7 heading anchors,0 missing**.
The29 extensionless GitHub-wiki links resolve to their tracked Markdown pages.
Logs: `wiki-links118.json`,`wiki-anchors118.json`. A separate manifest comparison
checks every changed package's dependencies/devDependencies/peerDependencies/
optionalDependencies/overrides against the reason ledger: **12 direct entry
changes** (including both sides of the existing exact tslib move) and **1 retired
router override**,all enumerated. The78 focused commits through376b7caf4 have
the required final coauthor trailer; the ledger is updated again after the closing
acceptance/evidence commit. Final committed-tree inventory closure follows.
