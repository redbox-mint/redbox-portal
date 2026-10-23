# P1 runtime implementation evidence

Recorded 2026-10-23 in `/home/andrew/src/github/redbox-portal`, branch
`stack/sails-retirement`. Starting SHA:
`b3d25a405badbfe9e6be96198850cae1f9e2f46f`. The commits containing each task are
identified by their conventional subject below (and by the branch history).
This record uses the P0 inventory/configuration characterization; it does not
qualify an institution deployment or claim P2 work.

## Execution environment

All build/test/lint commands below run from the repository root after:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node --version
npm --version
```

Observed **Node 26.11.1**, **npm 11.20.0**, TypeScript **5.9.3**, ts-node
**10.9.2**, Mocha **11.7.6**; existing exact Prisma pair
`@prisma/orm-mongo@8.0.0-rc.19` / `prisma@8.0.0-rc.24`. No dependency changes.
The shell's unmodified Node remains 24.18.0; no reported check uses it.

Real database setup, actually executed:

```sh
docker run -d --name sr-p1-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker port sr-p1-mongo8 27017/tcp
docker exec sr-p1-mongo8 mongosh --quiet --eval 'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion,hello:db.hello()}))'
docker image inspect mongo:8.0.34 --format '{{.Id}}'
```

Observed port **34899**, MongoDB **8.0.34**, FCV **8.0**, unauthenticated standalone,
image `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Regression databases are disposable `redbox_prisma_p1` / `redbox_prisma_p1_storage`
on this one server. This is no replica-set, institution, TLS or auth qualification.

## SR-006 — Structural persistence ownership and explicit Sails lifecycle

Implementation commit subject: `refactor(persistence): isolate Sails lifecycle from resource ownership`.

- `src/persistence/owner.ts` defines the structural configuration/log owner;
  runtime, groups, indexes and concrete persistence collaborators accept it.
  Root type exports preserve normal package consumption. No persistence source
  signature uses `Sails.Application`.
- `src/compat/sails/persistenceLifecycle.ts` owns the former shutdown guard,
  process/signal adaptation and `beforeShutdown` composition. Legacy
  `preLiftSetup()` installs it explicitly. Standalone initialization never mutates
  host configuration or installs handlers. Existing tests that exercise the Sails
  hook now explicitly prepare that adapter; their behavior/assertions remain.
- Pool/group identity, admission, retained close/drain retry, client-before-pool
  ordering and stale-handle logic are unchanged. Existing optional repository
  getters still support the legacy global fallback; explicit owners avoid it.
  This does not claim all repository/domain operations are standalone.
- The new compiled child-process check runs without `global.sails`, rejects any
  `sails` package load and checks that no compatibility adapter is imported.
  Structural-owner tests require no Sails type assertion and preserve listeners.

Commands/results:

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:persistence
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/unit/persistence-owner.test.ts test/unit/persistence-foundation.test.ts test/unit/persistence-shutdown.test.ts test/unit/cache-persistence-runtime.test.ts test/unit/prisma-runtime.test.ts test/services/AgendaQueueService.test.ts test/services/AuditFollowupDrain.test.ts test/middleware/redboxSession.test.ts test/middleware/requestLifetime.test.ts
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34899/redbox_prisma_p1 npm --prefix packages/redbox-core run test:persistence
npm run lint
git diff --check
```

- Clean core build: **exit 0** (Prisma generation, TypeScript, contract copy).
- Persistence typecheck, including the structural fixture: **exit 0**.
- Focused owner/legacy shutdown/queue/session/HTTP drain suites: **141 passing,
  0 failing, 0 pending**, about 3 seconds. The real Sails shutdown test retains
  failed-drain/no-lower/concurrent/retry assertions. This is focused legacy
  lifecycle evidence, not a complete legacy portal startup.
- Existing real-Mongo regression suite: **30 passing, 0 failing, 0 pending**,
  about 5 seconds. This suite executes all persistence groups, concurrency,
  indexes, native/session/GridFS ownership and stale/restarted handles.
- Repository lint: **exit 0**, **841 files, 0 warnings/errors**.
- `git diff --check`: **exit 0**.

Initial failures, fixed before completion: the new child-process test initially
had a template-string regexp escaping error (140 passing / 1 failing). Its code
was corrected with `String.raw`, then the complete focused command passed 141.
Typechecking first exposed an overly broad fixture `object` parameter, then a
string-array signal annotation; both were narrowed to their actual types. Final
typecheck exits 0. No production cast or test skip was added to hide these errors.
Prisma's existing module-type/skills notices persist; no runtime module-format or
Prisma dependency migration was attempted.

Local logs are small, uncommitted `.tmp/sails-retirement/p1-{build,typecheck,ownership,persistence,lint}.log`.
