# P1 Prisma compatibility evidence and G1 decision

Recorded 2026-10-19 Australia/Adelaide. P0 input: `4843bcc2c`.
Implementation checkpoints: `1b3777a1b` (contract/raw probes) and `9c9d7ce33`
(installed-package and Node matrix). The final evidence revision is the commit
with subject `test(persistence): complete P1 compatibility gate evidence`,
resolvable with `git log --format='%H %s' -- support/specs/prisma-cache-persistence/p1-validation.md`.

## G1 decision

**G1 PASS — a feasible adapter for the next development phases.** Both physical
interop directions, legacy fixtures, compiled CommonJS execution, clean packed
installation, generated shims, and production-pruned Docker execution pass.
The required adapter mappings are small and explicit; no bulk rewrite or broad
module conversion is required. No compiler setting needs changing. P1.1–P1.7
are complete within the tested matrix/topology and the limits recorded below.
This authorizes P2/P3/P4 work, not Prisma default promotion or official v6.

P1 changes only [the isolated spike](../../spikes/prisma-cache-persistence/README.md)
and spec/evidence files. No application service, core dependency/lockfile,
application module type, compiler configuration or existing Docker/Compose file
changed. No bulk document rewrite is needed for the tested default CacheEntry
shape. Unsupported institution values/customized models still require explicit
review and remediation, as the design requires.

## Versions, maturity and lockfiles (P1.1)

[Registry metadata](evidence/p1-npm-versions.json) records the exact npm queries.
Both initial and final queries found the same latest candidates:

- CLI **prisma 8.0.0-rc.23**: release candidate, upstream Node engines
  `^22.18.0 || ^24.11.0 || >=26.0.0` (upstream metadata, not a manifest range here).
- Runtime **@prisma/orm-mongo 8.0.0-rc.18**: separately versioned release
  candidate; MongoDB support is **early access**. No engines field was returned.
  A newer `dev` build is not a more appropriate candidate for this spike.
- Spike direct MongoDB peer **7.7.0**, TypeScript **5.9.3**, Sails **1.5.18**,
  sails-hook-orm **4.0.3**, Waterline **0.15.2**, sails-mongo **2.1.2**.
- Host Node **24.18.0**, npm **12.0.2**, Linux x86_64, Docker **29.6.1**.
  `.nvmrc` Node **24.16.0** also tested. Docker builder/runtime Node **26.11.1**
  ships npm **11.20.0**.
- MongoDB **8.0.34**, git version `51db4515a6597aedcf6188ee4e48a27e65b065ae`,
  image `mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.

New tracked lock: `support/spikes/prisma-cache-persistence/package-lock.json`.
Its four direct dependency/devDependency versions are exact. Transitive upstream
ranges are resolved in that lock. Root/core manifests and lockfiles are unchanged.
`npm ci` of the spike lock installed 309 packages successfully. Separate temporary
packed-fixture locks record its experimental production graph; hashes and
package identities are retained in the packaging evidence summary. Tarballs,
node_modules, `.tmp` and dist are not committed. Emitted JSON/declarations are.

Maturity sources read: [release status](https://www.prisma.io/docs/orm/release-status),
[supported databases](https://www.prisma.io/docs/orm/supported-databases),
[CommonJS setup](https://www.prisma.io/docs/cli/orm-init#in-a-commonjs-project),
[MongoDB modeling](https://www.prisma.io/docs/orm/data-modeling/mongodb), and
[offline contract emission](https://www.prisma.io/docs/cli/contract-emit).
**Official v6 stability/support requirements are not satisfied.**

## Contract and physical interoperability (P1.2–P1.5)

Contract source: `support/spikes/prisma-cache-persistence/src/contract.ts`.
Emitted artifacts: `src/generated/contract.json` and `contract.d.ts` in that
package. Emission has no connection URL and calls no init, migration or schema
synchronization command. A Docker build invocation with `--network none` also
proved offline emission. Regeneration to another directory matched both files:

- JSON SHA256: `1cca2cc02a0c6a833ed835618cb4e8f49b4bc36224c1e91fa55be37ae89aa993`
- Declaration SHA256: `3be17d603d4cc61aac3cd71128467a9348891665b525b410d18c9b836d3e60be`
- Prisma storage hash: `cbf09781f810c3d73d37c21822b691fd75a9c25b70ceeb5cb61a9d2b6c5a3d87`

[Raw server evidence](evidence/p1-mongo8.ejson) archives synthetic documents,
server `$type` projections, indexes, omission handling and exact errors. The
runner starts its own digest-pinned standalone container, random loopback port,
random `redbox_cache_p1_*` database and anonymous volumes. The trap removes only
its returned container ID and volumes. No existing container/data was touched,
including `development-mongodb-1`. The probe rejects ordinary/default URLs.

Each full run asserts:

1. Eleven JSON cases in each direction: object, array, string, empty string,
   fractional number, zero, true, false, null, notification and branding-preview
   shapes. Waterline creates, Prisma reads/updates/deletes; Prisma creates,
   Waterline reads/updates/deletes. Opposite-adapter reads after updates and
   native reads after deletes verify actual persistence, not two mocked outputs.
2. Physical BSON ObjectId `_id` and identical hex string IDs in both APIs;
   `createdAt`/`updatedAt` stay ISO strings, updates preserve createdAt and
   advance/retain updatedAt. Adapter-local timestamp helpers are exercised
   without callers supplying timestamps. Unknown legacy fields survive updates.
3. Epoch **seconds** stay numeric. Legacy Waterline integers decode correctly
   through `field.double()`. Prisma writes BSON **double**, Waterline writes
   BSON **int** for the test epoch; both preserve the same number. This is not
   byte-identical numeric subtype preservation. The behavioral contract requires
   numeric seconds, and both readers/updaters accept both types. A future value
   of 2,200,000,000 seconds also works, avoiding an artificial Int32/2038 limit.
4. Prisma omitted `data` creates physical absence and reads as null. Waterline
   omitted create writes physical null. The candidate create helper explicitly
   supplies null for omission; candidate updates omit absent fields. A native
   legacy row with absent timestamps/data remains absent on read. Thirteen
   supported documents from the committed P0 EJSON archive also round-trip.
5. Update of an absent name affects zero rows; delete of a missing string ID is
   a no-op; a missing lookup returns null. No upsert/retry was introduced.
6. Loading/connecting creates no collections or indexes. After a Waterline seed,
   only `_id_` exists; same-name Prisma/Waterline writes both succeed until an
   explicitly invoked `{name:1}`, unique, simple/default-collation index is
   created. Thereafter Prisma surfaces native `MongoServerError` **11000**;
   Waterline reports **E_UNIQUE**. No duplicate cleanup/index creation is hidden
   inside an import or client constructor. Test fixture cleanup is explicit.
7. Nested BSON Date, Binary, ObjectId and Decimal128 fail reads with
   `RUNTIME.DECODE_FAILED` and writes with `RUNTIME.ENCODE_FAILED`. Failed writes
   create no row; serialized before/after native documents prove failed reads
   did not coerce, erase or rewrite the legacy BSON. Do not implement the error
   message's suggested serialization automatically.

The full probe also passed against compiled core model/defaults from the
immutable rollback source **0cfbd62b93260b63ad907d7c01ed9f33a2af619e**. Its source
was compiled from an archive with the same dependency installations. This proves
physical interop with that model implementation, not P5's full prior-release
image deployment, notification/preview or config-rollback rehearsal.

## CommonJS, installed artifacts and Docker (P1.6–P1.7)

`tsconfig.json` extends the existing core configuration: NodeNext module and
resolution, strict types, ES2024, declarations, CommonJS package semantics.
**No compiler adjustment is needed.** `client.js` uses `require()` of Prisma's
ESM runtime; it executes on tested Node 24/26. JSON is read relative to
`__dirname`, so no `resolveJsonModule`, import attributes or app module conversion
is required. Generated declarations resolve through Prisma's published exports.
The CLI emits a harmless MODULE_TYPELESS_PACKAGE_JSON warning while evaluating
contract.ts and suggests ESM; no package type change was made to suppress it.

`pack-fixture.cjs` stages actual built core, adds only the pinned Prisma runtime
and spike output at `dist/persistence/prisma-p1`, then runs `npm pack`. It packs
four local core dependencies separately and replaces checkout-relative
`file:../...` references with their exact versions **only in the staged manifest**.
The clean fixture supplies those four exact tarballs. This is the explicit
adaptation needed to install this monorepo package outside its checkout; the
application manifest is not edited. P4 must wire the actual release paths.

Clean installation outside the repository at `/tmp/redbox-prisma-p1-install-dkxv6q`
contains no symlinks to workspace packages or core source files. The compiled
contract builder is removed from the staged package. `packed-consumer.ts`
compiles core and generated contract types; expected-error assertions check bad
field names and string epoch seconds. Its CommonJS output is executed.
`packed-smoke.cjs` blocks `net.Socket.connect`, imports core and the installed
client, constructs/closes the lazy client, generates all shims, and loads the
CacheEntry model, CacheService and bootstrap shims. It asserts absent core source
and absent `prisma` CLI. Checks passed from unrelated `/tmp` cwd. Installed CRUD
and raw-document assertions also passed against a new MongoDB 8 container.

TypeScript is already a production dependency of core and remains installed.
The Mongo facade transitively brings `orm-toolchain` and the required
`@prisma/cli-engine` peer. The separate generation CLI `prisma` is absent; this
is not a claim that all generation-related library code is absent or that the
runtime dependency graph is minimal.

Tested matrix:

| Runtime | Offline emit + NodeNext compile | Full Mongo interop | Packed core/types/shims |
| --- | --- | --- | --- |
| Host Node 24.18.0 / npm 12.0.2 | Pass, fresh spike npm ci | Pass, current and base model | Pass, clean production install + CRUD |
| `.nvmrc` Node 24.16.0 | Pass | Pass | Pass, compiled consumer and runtime/shims |
| Docker Node 26.11.1 / npm 11.20.0 | Pass with network disabled; all core source typecheck also passes | Pass on standalone 8.0.34 | Pass, clean install/prune/stage-copy, offline shims, runtime CRUD |

Docker base images tested:

- Builder: `node:26.11.1-bookworm@sha256:f1233c415b41ffcf237c717b3dea92e9d4ea006e0e4c71edcb790605d74f5404`
- Runtime: `node:26.11.1-bookworm-slim@sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567`

Initial Docker `npm ci` failed **EUSAGE**: host npm 12's production lock omitted
peers required by Docker npm 11 (`openapi-types`, `@prisma/cli-engine` and its
transitives). Repeating host package-lock-only install did not fix it.
Regenerating the fixture lock with the actual Docker npm **11.20.0** added those
peer entries and enabled clean `npm ci`. This is fixture-only; it adds no new
application dependency pins. P4 must select a consistent npm toolchain and
validate lockfiles against production Docker, not assume a host install proves
Docker readiness. Lock delta/hashes are retained in the packaging summary.

**Final Docker result: pass.** The focused Dockerfile installs the fixture from
its normalized lock with `npm ci --omit=dev`, compiles and executes the installed
consumer and core/shims with network disabled, prunes production dependencies,
removes consumer source/tarballs, then copies into bookworm-slim. As user `node`
with `/tmp` cwd, offline core/shim/lazy-client checks pass again. The resulting
runtime image then successfully creates/reads/updates/deletes data on a fresh
MongoDB 8 container with raw BSON assertions. No CLI, contract builder source or
checkout paths are required. No P1 MongoDB containers remained after cleanup.

Image: `redbox-prisma-p1@sha256:fb3e9c67d0f78737c07fa399dcfaae0f5db857619e1b9b2641b0f21aeb479b68`
(local image, not pushed). [Packaging/matrix summary](evidence/p1-packaging.json)
records the image identity, tarball integrity, spike and temporary lock hashes,
peer additions, and Node/base-model run metadata. These outputs are reproducible
experiments; the full application Dockerfile is unchanged.

## Exact commands and outcomes

Commands start at repository root except where indicated. The
[spike README](../../spikes/prisma-cache-persistence/README.md) contains a complete
reproduction sequence including the temporary fixture preparation.

```bash
npm view prisma version dist-tags engines --json
npm view @prisma/orm-mongo version dist-tags engines --json
npm --prefix support/spikes/prisma-cache-persistence install --ignore-scripts --strict-peer-deps --no-audit --no-fund
npm --prefix support/spikes/prisma-cache-persistence install --save-exact mongodb@7.7.0 --ignore-scripts --strict-peer-deps --no-audit --no-fund
npm --prefix support/spikes/prisma-cache-persistence ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
DO_NOT_TRACK=1 npm --prefix support/spikes/prisma-cache-persistence run build
npm --prefix packages/redbox-core run build
bash support/spikes/prisma-cache-persistence/run-mongo.sh ../../../support/specs/prisma-cache-persistence/evidence/p1-mongo8.ejson
```

All exit 0. Full Mongo probe reports 22 JSON interop rows, 22 opposite-adapter
updates/deletes, P0 archive reads, missing operations, unique enforcement and
unsupported BSON rejection. The earliest exploratory run queried indexes before
any collection existed (Mongo code 26); corrected by an explicit Waterline seed.
A subsequent run overlapped a core dist-clean build and failed module resolution;
rerunning after compilation passed. These were harness ordering defects, not
Prisma mapping blockers. No production workaround was added.

```bash
# Node 24.16.0 build/probe
PATH="/home/andrew/.nvm/versions/node/v24.16.0/bin:$PATH" DO_NOT_TRACK=1 node support/spikes/prisma-cache-persistence/build.cjs
PATH="/home/andrew/.nvm/versions/node/v24.16.0/bin:$PATH" bash support/spikes/prisma-cache-persistence/run-mongo.sh ../../../.tmp/prisma-cache-p1/node24-interop.ejson
# Node 26.11.1 probe
P1_NODE_IMAGE='node@sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567' bash support/spikes/prisma-cache-persistence/run-mongo.sh ../../../.tmp/prisma-cache-p1/node26-interop.ejson
# Offline Docker generation/compilation
p1_builder='node@sha256:f1233c415b41ffcf237c717b3dea92e9d4ea006e0e4c71edcb790605d74f5404'
docker run --rm --network none --user "$(id -u):$(id -g)" -e DO_NOT_TRACK=1 -v "$PWD:/work" -w /work "$p1_builder" node support/spikes/prisma-cache-persistence/build.cjs
docker run --rm --network none --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work "$p1_builder" node node_modules/typescript/bin/tsc --noEmit -p packages/redbox-core/tsconfig.json
```

All exit 0. In the spike directory, `DO_NOT_TRACK=1 node_modules/.bin/prisma
contract emit --output-path .tmp/fresh-contract`, followed by `cmp` of both
artifacts with `src/generated`, also exits 0. No CI freshness gate is installed
in P1; P4 owns that integration and deliberate stale-artifact failure test.

```bash
node support/spikes/prisma-cache-persistence/pack-fixture.cjs
# Clean temporary install, consumer compilation and smoke: full sequence in README.
# p1_install_dir was /tmp/redbox-prisma-p1-install-dkxv6q.
npm --prefix "$p1_install_dir" install --omit=dev --ignore-scripts --strict-peer-deps --allow-git=all --no-audit --no-fund
(cd "$p1_install_dir" && ./node_modules/.bin/tsc -p tsconfig.json)
(cd /tmp && node "$p1_install_dir/smoke.cjs")
(cd /tmp && /home/andrew/.nvm/versions/node/v24.16.0/bin/node "$p1_install_dir/smoke.cjs")
P1_PACKED_FIXTURE="$p1_install_dir" bash support/spikes/prisma-cache-persistence/run-mongo.sh
# After fixture lock normalization with npm 11, as shown in README:
docker build -f support/spikes/prisma-cache-persistence/Dockerfile -t redbox-prisma-p1:815a2a6e .tmp/prisma-cache-p1/packed/fixture
P1_RUNTIME_IMAGE=redbox-prisma-p1:815a2a6e bash support/spikes/prisma-cache-persistence/run-mongo.sh
```

Host commands and final Docker build/runtime CRUD exit 0; the host clean
production install added 1,284 packages. npm 12's
`pack --json` returns an object keyed by package name; the fixture handles that
and npm 11's array format after an initial harness failure.
Final `prettier --check` on authored spike TS/CJS, `bash -n run-mongo.sh`, exact-pin
verification and `git diff --check` also pass. No generated build/dependency/temp
directory is tracked.

## Startup timeout on designated base (additional assignment)

```bash
mkdir -p .tmp/prisma-cache-p1/base
git archive 0cfbd62b9 | tar -x -C .tmp/prisma-cache-p1/base
ln -s "$PWD/node_modules" .tmp/prisma-cache-p1/base/node_modules
ln -s "$PWD/packages/redbox-core/node_modules" .tmp/prisma-cache-p1/base/packages/redbox-core/node_modules
# In .tmp/prisma-cache-p1/base:
npm run test:core
```

**Same failure on the base: 4,042 passing, 65 pending, 1 failing.**
`test/unit/startup-module-loading.test.ts:36` reports `spawnSync ... ETIMEDOUT`
after its unchanged 12,000 ms child timeout. `git diff 0cfbd62b9 4843bcc2c --
packages/redbox-core/src packages/redbox-core/test/unit/startup-module-loading.test.ts
packages/redbox-core/test/tsconfig.json` is empty. This predates P1 in the tested
environment. P0 had 4,058 passing / 66 pending / the same failure; added
characterization and opt-in fixture tests explain the count difference.

Focused command, run in both current `packages/redbox-core` and its base archive:

```bash
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only ../../node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 15000 \
  test/unit/startup-module-loading.test.ts
```

Both exit 0 (9,343 ms current, 10,179 ms base). Thus the failure is sensitive to
suite/environment context; a root cause beyond that has not been established.
No timeout increase, skipped assertion or source fix was made. Baseline testing
reuses the same installed dependencies through symlinks, not an independently
resolved historical dependency tree. The suite's raw local log is
`/tmp/redbox-p1-base-core.log`; only the safe results are retained here.

```bash
node_modules/.bin/tsc -p .tmp/prisma-cache-p1/base/packages/redbox-core/tsconfig.json
P1_WATERLINE_CORE_PATH="$PWD/.tmp/prisma-cache-p1/base/packages/redbox-core" bash support/spikes/prisma-cache-persistence/run-mongo.sh ../../../.tmp/prisma-cache-p1/base-interop.ejson
```

Both exit 0; this is the base-model physical interop result described above.

## Handoff and limits

- **P2:** own plain JSON/string-ID types; strict JSON validation remains necessary
  for nonfinite numbers, undefined members, functions, cycles and richer values.
  Preserve missing-read null normalization and characterized service timing/TTL.
- **P3:** use `cacheentry`, expose `_id` as `id`, optional string timestamps,
  numeric `field.double()` seconds, explicit null on omitted create, timestamp
  helpers, filtered count terminals for misses. Preserve createdAt/unknown fields.
  Normalize native duplicate 11000 with its cause. Explicitly verify index and
  unsupported legacy values; emitted index intent/connection is not readiness.
  No automatic index/schema initialization or fallback was proven/authorized.
  Implement lifecycle ownership and failure cleanup before activating the adapter.
- **P4:** integrate generation before declarations are consumed and copy artifacts
  after dist cleanup in package build, root compile:core/compile:core:prod,
  aggregates/dev scripts and Docker's direct tsc path (P0 audit). Package the JSON
  and d.ts under the real persistence path; use module-relative resolution.
  No compiler change is required by this spike. Align npm/lock generation and
  verify production peers, pruning and stage copies. Retest upgrades of the RC
  pair; ensure artifacts stay deterministic. Infrastructure remains unchanged.
- Standalone, unauthenticated MongoDB 8.0.34 works without a replica set for these
  four operations. TLS/authentication, SRV URI options, replica sets/sharding,
  other architectures and shared GridFS/session/queue/storage upgrades are not
  qualified. No transaction/relational suitability is implied.
- This is a focused Docker/core packaging experiment. Full portal/Angular image,
  CircleCI service images, API/browser regressions, simultaneous mixed writers,
  operational benchmarks, connection limits and complete deployment rollback are
  later gates. RC/early-access support blocks v6. The baseline suite timeout
  remains unresolved and must not be counted as a green regression suite.

## Final-review reproducibility clarification

The `.tmp/prisma-cache-p1` paths above are generated archives, staging directories
and outputs. Their source runners (`build.cjs`, `pack-fixture.cjs`, `run-mongo.sh`
and the Dockerfile) and preparation sequence are tracked in the
[spike README](../../spikes/prisma-cache-persistence/README.md); no untracked
helper script is required for those steps. Image IDs, temporary lock hashes and
timings above describe the historical run, not immutable outputs of a new run.
The standalone spike lock is retained as an isolated reproduction input; final
review repairs its npm 11 peer metadata without changing its exact direct pins.
See [final review](final-review.md) for the lock delta and current verification.
