# Phase 0 / TX-PARITY — 2026-10-22

[TX-PARITY-01](../design.md): sequential execution, with no U/V/B/S migration,
promotion, Counter change or topology conversion. Start `60e937c10`; application
baseline after lock repairs and parent image update `828618064`: `d80d8989a`.
Implementation: `b256af7e1846174913a18040d428e59b93ae2599`.

## Environment / support

- OCI: Ubuntu **24.04.4 LTS**, Linux **7.0.0-1013-oracle**, **linux/arm64**
  (`aarch64`), **2 CPUs / 12 GiB nominal RAM / no swap**.
- **Node 24.16.0 / npm 11.20.0 / TypeScript 5.9.3**. Initial shell used Node
  22.23.2/npm 10.9.8; installed Node 24 bundled npm 11.13.0. Used the existing
  Node 24 binary plus a worktree-local extraction of the exact
  `https://registry.npmjs.org/npm/-/npm-11.20.0.tgz`. From the root,
  `source .tmp/tx-parity-phase0/env.sh` selects this prepared toolchain.
- Docker Engine **29.1.3** (`linux/arm64`), Compose **2.40.3+ds1-0ubuntu1~24.04.1**.
- MongoDB **9.0.4 / FCV 9.0 / standalone** (`hello`: no `setName`), image
  `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
  This phase started no MongoDB 7/8 container.
- Both packages install **mongodb 7.7.0**. The official
  [compatibility table](https://www.mongodb.com/docs/drivers/compatibility/)
  marks **7.6–7.7 / server 9.0** and **7.0–7.7 / Node 24** fully compatible (✓).
  Checked 2026-10-22 using `timeout 45 curl -fsSL https://www.mongodb.com/docs/drivers/compatibility.md`;
  response SHA-256 `ce94cc06869ccb68436fa2f49ce32dd5275b89f10272fbe4625460198c9788d1`.

## Clean install / build baseline

Used wiki/package build order with `npm ci` replacing scripts' `npm install`.
All measured commands used `/usr/bin/time -v` and external `timeout`:

```bash
timeout 1200 npm ci --include=dev --ignore-scripts --strict-peer-deps --no-audit --no-fund
for pkg in raido rva-registry sails-ng-common agenda-sqs-backend redbox-core redbox-dev-tools sails-hook-redbox-storage-mongo redbox-hook-dev sails-hook-redbox-pdfgen; do
  peers=--strict-peer-deps
  if [[ "$pkg" == sails-hook-redbox-pdfgen ]]; then peers=--legacy-peer-deps; fi
  timeout 1200 npm --prefix "packages/$pkg" ci --include=dev --ignore-scripts "$peers" --no-audit --no-fund
  target=build
  if [[ "$pkg" == sails-ng-common || "$pkg" == sails-hook-redbox-pdfgen ]]; then target=compile; fi
  timeout 600 npm --prefix "packages/$pkg" run "$target"
done
timeout 600 node_modules/.bin/tsc
```

Clean installs **10/10 passed**; backend package/root builds **10/10 passed**.
Build seconds in that order: 1.41, 2.06, 4.97, 2.07, 26.09, 5.38, 4.98, 4.31,
4.45; root 1.91. Root install: 39.52 s. No Angular build needed.

Two initial `npm ci` attempts failed **EUSAGE**: core lacked
`openapi-types@12.1.3`; storage lacked `rxjs@7.8.2` and `tslib@2.8.1`.
These were pre-existing peer-lock omissions, not ARM64 errors. Repair command:

```bash
for pkg in redbox-core sails-hook-redbox-storage-mongo; do
  timeout 300 npm --prefix "packages/$pkg" install --package-lock-only --include=dev --ignore-scripts --strict-peer-deps --no-audit --no-fund
done
```

Only those **three entries** were added. No existing version, manifest or
`packageManager` changed; **17 other tracked locks** remain byte-identical.
Repaired locks remained byte-identical through subsequent `npm ci`, builds and
tests (`sha256sum -c`). Every resolution used **npm 11.20.0**. SHA-256:

| Lock | Before | After |
| --- | --- | --- |
| Root (unchanged) | `3b453c1bbac3831ad836b9defdaece5b6ec5ed4a8cb6d2be76752a2689e83eb9` | same |
| Core | `b84354085a9d71de1103d5dbf2a3662e3aaf3d4031c655858ea5c25e547e51ef` | `6a0b1c6cf47060c3c446475270bef3b782e0d798e61bf3603f6017bb615be3a4` |
| Storage | `959ac9e39e987ecb6922fe4054cdb4dd5c4109ee85c1daa61a7b36b574881cdc` | `9fb853b6f32364c0efac40461f5b64244500ffb26a1da2c7b407e991b6cffe58` |

## Helper / published API decision

The four services run their work directly, preserving order, bounded forest
parent writes, errors and compensation/cleanup. RVA keeps its error wrapper/log;
branding keeps history on uncertain writes and removes it for certified
non-application/conflict. Tests assert earlier writes remain after later failure.

`TransactionUtils` is absent from the core index, but `files: [dist, …]` and no
`exports` restriction permit published deep imports. Keep/deprecate its helper,
options type and error predicate. The shim is exactly `return work(undefined)`:
no datastore inspection, retry or warning. Three public vocabulary methods keep
deprecated/ignored optional connection arguments for hook source compatibility;
private connection plumbing is removed. No index export was added.

`(cd packages/redbox-core && timeout 60 npm pack --dry-run --json)` passed
(3.79 s), listing `dist/utilities/TransactionUtils.js`, `.d.ts` and `.d.ts.map`.
Compiled deep-import smoke passed without reading a throwing transaction getter.
An initial root-directory `npm --prefix … pack` attempt timed out at 60 s;
use explicit package cwd for packing. Focused lint: **0 warnings / 0 errors**:
`timeout 60 node_modules/.bin/oxlint packages/redbox-core/src/utilities/TransactionUtils.ts packages/redbox-core/src/services/{VocabularyService,FigshareVocabularyService,RvaImportService,BrandingService}.ts`.

## Test results / exact commands

| Run | Pass / fail / pending | Wall seconds |
| --- | --- | --- |
| Core baseline, unmodified application | 4303 / 1 / 117 | 109.88 |
| Storage baseline, no Mongo URL | 291 / 0 / 38 | 44.23 |
| Affected sequential tests | 139 / 0 / 0 | 18.42 |
| Core + storage rebuild | 2 / 0 builds | 24.52 + 4.70 |
| Isolated startup, unchanged timeout | 1 / 0 / 0 | 10.81 |
| Final full core suite | 4317 / 0 / 117 | 108.18 |
| Live foundation, MongoDB 9.0.4 | 14 / 0 / 0 | 3.08 |
| Storage with `MONGO_TEST_URL` | 320 / 0 / 9 | 71.27 |
| Remaining live storage concurrency | 9 / 0 / 0 | 9.37 |

```bash
timeout 600 npm --prefix packages/redbox-core test
timeout 600 npm --prefix packages/sails-hook-redbox-storage-mongo test
timeout 600 npm --prefix packages/redbox-core run build
timeout 600 npm --prefix packages/sails-hook-redbox-storage-mongo run build
loaders=(--no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts)
timeout 180 npm --prefix packages/redbox-core test -- "${loaders[@]}" --timeout 5000 test/utilities/TransactionUtils.test.ts test/services/VocabularyService.test.ts 'test/services/FigshareVocabularyService*.test.ts' test/services/RvaImportService.test.ts test/services/BrandingServiceLifecycle.test.ts
timeout 90 npm --prefix packages/redbox-core test -- "${loaders[@]}" test/unit/startup-module-loading.test.ts
```

Initial core failure: `spawnSync … node ETIMEDOUT` at the startup test's fixed
**12 s subprocess deadline**. Isolated and final full runs passed unchanged.
No application/test/timeout workaround or dependency upgrade was introduced.
One diagnostic was cancelled (143) when found overlapping the storage baseline;
subsequent heavy commands were serialized. Pending tests are opt-in fixtures.
New assertions cover no transaction/warning, exactly-once execution, partial
reorder/RVA/mapping/approval failure, compensation and failed cleanup.

## Docker commands / later phases

Tested Mongo-only use of `support/integration-testing/docker-compose.mocha.yml`
with project **wrtx-phase0-815a2a6e** and `.tmp/tx-parity-phase0/mongo.yml`:

```yaml
services:
  mongodb:
    environment: {MONGO_INITDB_ROOT_USERNAME: p1_fixture, MONGO_INITDB_ROOT_PASSWORD: p1-only}
    ports: ['127.0.0.1::27017']
    mem_limit: 512m
    command: ['mongod', '--bind_ip_all', '--wiredTigerCacheSizeGB', '0.25']
    healthcheck:
      test: ['CMD-SHELL', 'mongosh --quiet -u p1_fixture -p p1-only --authenticationDatabase admin --eval "quit(db.runCommand({ping:1}).ok ? 0 : 1)"']
      interval: 2s
      timeout: 5s
      retries: 30
      start_period: 10s
```

```bash
compose=(docker compose -p wrtx-phase0-815a2a6e -f support/integration-testing/docker-compose.mocha.yml -f .tmp/tx-parity-phase0/mongo.yml)
timeout 240 "${compose[@]}" up -d --wait --wait-timeout 120 mongodb
bound=$("${compose[@]}" port mongodb 27017)
export P1_MONGO_URL="mongodb://p1_fixture:p1-only@${bound}/wr_p1_core?authSource=admin"
timeout 180 npm --prefix packages/redbox-core test -- "${loaders[@]}" --timeout 30000 test/unit/persistence-foundation.test.ts test/integration/PersistenceFoundation.test.ts
export MONGO_TEST_URL="mongodb://p1_fixture:p1-only@${bound}/?authSource=admin"
timeout 600 npm --prefix packages/sails-hook-redbox-storage-mongo test
export MONGO_CONCURRENCY_TEST_URL="$MONGO_TEST_URL"
(cd packages/sails-hook-redbox-storage-mongo && TS_NODE_PROJECT=test/tsconfig.json timeout 180 node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require chai --require ts-node/register --require test/setup.ts --timeout 30000 test/integration/MongoStorageConcurrency.integration.test.ts)
timeout 90 "${compose[@]}" down -v --remove-orphans --timeout 30
```

Ran as two disposable stacks with `EXIT` cleanup traps. Readiness **20.02 s**,
then **8.47 s** cached. Mongo sampled memory **198.6–384 MiB / 512 MiB**
(`docker stats`, not a peak); `OOMKilled=false`. Largest command RSS
**1,705,772 KiB** (final core suite), no swap/OOM. Containers, anonymous volumes
and project networks removed; project-label resource queries empty. Other
projects' running Docker resources were not changed.

Both live storage URLs are needed for all **38** cases (29 + nine). Foundation
covers database routing, indexes and cache restart, without qualifying U/V/B/S.
Full portal Mocha/Bruno stacks, per-group parity, packaging/images and rollback
remain for later phases. The x86 rollback image `redbox-p10-s:prior-12e566575`
is absent: build/qualify an ARM64 prior artifact first. Use unique Compose
projects, random loopback ports, sequential heavy commands and pinned **9.0.4**.
Do not use other projects' volumes or the dev Compose's fixed host ports.
The parent records 8.0.34's kernel failure; this phase did not retry it.
