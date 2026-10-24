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
