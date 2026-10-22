# P0 validation and gate review

Reviewed 2026-10-19 Australia/Adelaide. Production source baseline:
`f6668358d148e09f77fd335bd9941ddaa9dbe949`. The evidence revision is the Git
commit introducing this file, resolvable with
`git log --diff-filter=A --format='%H %s' -- support/specs/prisma-cache-persistence/p0-validation.md`.
All tests below use existing Waterline behavior; no Prisma adapter, selector,
dependency, lockfile or production behavior is changed by P0.

## Acceptance review

- **P0.1:** [inventory](p0-inventory.md) lists 40 core and six storage-hook model
  definitions, relationships/callbacks, hook replacement, direct/native access,
  datastore/connection ownership and shared-server clients.
  [Named model call evidence](evidence/direct-model-consumers.json) indexes
  43 models / 80 model-file pairs; generic/runtime calls are qualified separately.
- **P0.2:** the inventory enumerates both direct CacheEntry business consumers,
  notification use through CacheService, exports/shims, model/service overrides,
  customized collection/datastore/ID/callback behavior and non-JSON value risks.
  Private institution hooks/data remain an institution activation review.
- **P0.3:** the [raw EJSON archive](../../../packages/redbox-core/test/fixtures/cache-persistence/waterline-mongo8.ejson)
  contains 14 synthetic documents captured through actual Sails/Waterline on an
  isolated MongoDB 8.0.34 server. It records physical ID/timestamp/data types,
  optional/null behavior, updates, indexes and duplicate errors. The
  [fixture README](../../../packages/redbox-core/test/fixtures/cache-persistence/README.md)
  identifies native legacy probes and reproduction/safety boundaries.
- **P0.4:** [characterization](p0-characterization.md), 16 new actual-service
  tests and existing notification/branding coverage preserve TTL/falsy/null,
  memory-first asynchronous writes/logging and preview expiry/deletion/errors.
  [Deferred changes](p0-deferred-behavior.md) are recorded separately.
- **P0.5:** [environment record](p0-environment.md) distinguishes declared and
  observed Node/compiler/module/build/image versions, actual npm candidates and
  maturity, and designates immutable rollback snapshot
  `next@0cfbd62b93260b63ad907d7c01ed9f33a2af619e`. That snapshot is not yet a
  qualified published image or a rehearsed rollback.
- **P0.6:** [ADR 0001](adr/0001-cache-repository-and-prisma-evaluation.md)
  compares Prisma, MikroORM, Waterline and native MongoDB using the compatibility,
  hook, packaging, operational and prospective PostgreSQL requirements.
- **P0 gate:** reviewed the above inventory, fixture, ADR and baseline results.
  Discovery is complete for checked-in code and tested CacheEntry defaults.
  Prisma suitability remains unestablished, and the core baseline has the
  unresolved startup timeout below. P0 completion authorizes the compatibility
  investigation; it is not G1, default promotion or official v6 qualification.

## Environment and isolation

Host runs Node 24.18.0, npm 12.0.2 and TypeScript 5.9.3, Linux x86_64.
Exact supporting package/image versions and untested matrix paths are recorded
in [p0-environment.md](p0-environment.md). The raw capture archives its source
commit, capture time, Node, Sails/Waterline/driver and server build versions.

The raw fixture runner creates a random-name container with a P0 label, a random
localhost-only port and `redbox_cache_p0_*` database, without existing volumes.
Its trap removes only its newly created container ID and anonymous volumes.
Pinned image:
`mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
The server is standalone and unauthenticated; no topology, TLS or authentication
compatibility beyond this setup is implied.

Docker portal tests used isolated Compose project `redbox-cache-p0-815a2a6e` and
that project's own MongoDB, never `development-mongodb-1` or existing data.
The runner removed its project containers/network after each run. The final
raw-container rerun also cleaned up. No existing running container was modified.
The mounted portal image was
`qcifengineering/redbox-portal@sha256:07120382d99c344ddfa07e16ce8b24f5e5b91be2959998d9b0bb78976ca8a129`
(observed Node 26.7.0); the Compose MongoDB image was
`mongo@sha256:bac22ea7710d774103dcad3ec8ac13cba1eb378f488e3ce8a6b3a1adf2ba9dcc`
(observed `mongod --version` 9.0.2). This is the existing integration baseline,
separate from the MongoDB 8 fixture. It is not a current-Dockerfile build proof.

## Exact commands and results

Commands start in the repository root unless the working directory is stated.
Output redirection to temporary logs is omitted where it does not affect the
command. Raw portal logs are not committed because bootstrap can print generated
tokens; the durable results here contain no copied credentials or payloads.

Dependency preparation:

```bash
npm ci --ignore-scripts --strict-peer-deps --allow-git=all --no-audit --no-fund
```

Exit 0; 1,839 packages installed from the root lockfile. Initial root/core
`npm ci --ignore-scripts --strict-peer-deps --no-audit --no-fund` attempts were
unsuccessful: npm 12's default `allow-git=none` rejected an existing ro-crate Git
dependency, and concurrent installs collided. They were stopped/replaced with
the sequential root command above. No manifest/lockfile was changed. Docker's
existing runner also installed its pinned Redoc helper without saving it.

Existing package/backend compilation (each command exit 0):

```bash
node_modules/.bin/tsc -p packages/sails-ng-common/tsconfig.prod.json
node_modules/.bin/tsc -p packages/raido/tsconfig.json
node_modules/.bin/tsc -p packages/rva-registry/tsconfig.json
node_modules/.bin/tsc -p packages/agenda-sqs-backend/tsconfig.json
npm --prefix packages/redbox-core run build
node_modules/.bin/tsc -p packages/redbox-dev-tools/tsconfig.json
node_modules/.bin/tsc -p packages/sails-hook-redbox-storage-mongo/tsconfig.json
node_modules/.bin/tsc -p packages/redbox-hook-dev/tsconfig.json
node_modules/.bin/tsc -p tsconfig.json
```

These compiled local dependencies before testing; `compile:core`/`compile:all`
and a clean packed/Docker build were not run and are not claimed equivalent.

Full core baseline:

```bash
npm run test:core
```

Exit **1**: **4,058 passing, 66 pending, 1 failing** (reported 2 minutes).
Includes the 16 new service characterization cases. The opt-in real MongoDB
case is skipped without the dedicated URI. The failure is the unchanged
`test/unit/startup-module-loading.test.ts:36` assertion: its child process
exceeds the existing 12,000 ms spawn timeout and returns `ETIMEDOUT` rather
than status 0. The underlying cause is not diagnosed by P0, and no timeout
increase or production fix was made. Pending cases are not passing evidence.

Independent startup-case recheck, working directory `packages/redbox-core`:

```bash
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only ../../node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 15000 \
  test/unit/startup-module-loading.test.ts
```

Exit **1**: **0 passing, 1 failing**, same 12-second child-process `ETIMEDOUT`.
This is an unresolved baseline issue for later validation, not a Prisma finding.

Focused regression/characterization, working directory `packages/redbox-core`:

```bash
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only ../../node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/CacheServiceCharacterization.test.ts \
  test/services/BrandingPreviewCharacterization.test.ts \
  test/services/CacheService.test.ts \
  test/services/IntegrationNotificationService.test.ts \
  test/services/BrandingService.test.ts \
  test/services/BrandingServiceLifecycle.test.ts \
  test/controllers/BrandingFontDelivery.test.ts
```

Exit **0**: **104 passing** (10 seconds), including all 16 new cases.

Isolated real MongoDB fixture capture:

```bash
bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh \
  test/fixtures/cache-persistence/waterline-mongo8.ejson
```

Exit **0**: **1 passing** (3 seconds), MongoDB **8.0.34**, **14 raw documents**,
duplicate error **E_UNIQUE**. After hardening runner cleanup to use only the newly
created container ID, reran the same script without its optional archive argument:
exit **0**, **1 passing** (940 ms), same server/document/error findings, without
overwriting the archive. An early standalone Waterline harness rejected Sails'
unnormalized `unique` metadata; the final test uses actual Sails ORM loading.

Existing Docker CacheService/BrandingService integration tests:

```bash
COMPOSE_PROJECT_NAME=redbox-cache-p0-815a2a6e \
RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/CacheService.test.ts\ntest/integration/services/BrandingService.test.ts' \
npm run test:mocha:mount
```

Exit **0**: **8 passing** (Mocha reported 2 minutes), portal lifted/lowered,
project removed. Includes preview creation/expiry, publish/history/restore and
cache hit/miss. Waterline was the active backend. Existing transaction fallback
warnings were observed; this is not transaction support proof.

The first attempt used the wiki/spec's space-delimited value:
`RBPORTAL_MOCHA_TEST_PATHS='test/integration/services/CacheService.test.ts test/integration/services/BrandingService.test.ts'`
with the same project and npm command. It exited 0 but ran **0 tests**, warning
that the combined path did not match. That attempt is not validation. The current
runner reads newline-delimited environment paths; the corrected command above
selected both files. No runner/wiki production change was made in this phase.

New test typechecking, formatting and script/diff checks:

```bash
node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json
node_modules/.bin/prettier --check packages/redbox-core/test/services/CacheServiceCharacterization.test.ts packages/redbox-core/test/services/BrandingPreviewCharacterization.test.ts packages/redbox-core/test/integration/CacheEntryWaterline.test.ts packages/redbox-core/test/tsconfig.cache-persistence.json
bash -n packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh
git diff --check
```

Each exit **0**. Initial new-test typing issues were fixed before the successful
focused and real-database runs. Repository Oxlint configuration ignores test
files; attempted scoped linting selected zero files, so no lint pass is claimed.

## Limits carried into later phases

P1 must prove Prisma's physical mappings and both interoperability directions,
unsupported-value behavior, NodeNext/CommonJS and installed-package execution.
P3 must handle the observed absent unique index explicitly; safe migration mode
is not index evidence. P4 must qualify MongoDB 8+ shared clients and every build
path. P5 must resolve/reassess the baseline timeout, rehearse restart/rollback
and mixed adapters, and measure operational cost. No API/browser, benchmark,
institution data audit or rollback rehearsal was performed in P0.

The current RC CLI and early-access MongoDB runtime cannot satisfy the stable
official v6 gate. A successful P0 discovery gate makes no broader ORM suitability
or PostgreSQL migration claim.
