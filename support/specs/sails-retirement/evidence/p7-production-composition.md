# P7 production composition qualification in progress

These are prerequisites and focused checks for SR-045–SR-050, not completed P7
acceptance. Source starts at `ab08ccb7d` plus the changes in the commits containing
this record. Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, Express
**5.1.0**; no dependency changes. Raw logs remain in ignored
`.tmp/sails-retirement/p7/`.

## Selected lifecycle and Agenda placement

The real production composition exposed two defects. Spreading a class lifecycle
object discarded its prototype methods; explicit delegates now retain both methods
and receiver. The application/extension wrappers also forward the absolute drain
deadline to the resource. Agenda's backend used its configured separate database,
but startup inspection and job history still used the main database. Those three
operations now select the same owned Agenda resource.

Focused commands, with the qualified Node directory prepended to `PATH`, from
`packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 10000 \
  test/services/AgendaQueueService.test.ts test/extensions/*.test.ts \
  test/application/Application.test.ts test/application/PortalDomain.test.ts \
  test/queues/ScheduledWork.test.ts test/http/ExpressHost.test.ts

LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p3_lifecycle \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 30000 test/queues/QueueMongo.test.ts
```

- `portal-composition-existing-second.log`: **100 passing / 0 failing / 0 pending**,
  exit **0**, approximately 8 s. Includes the two new targeted composition cases.
- `portal-queue-mongo-existing.log`: **8 passing / 0 failing / 0 pending**, exit
  **0**, approximately 3 s. Existing real-Mongo bodies and assertions unchanged.
- Mongo is the actual Docker MongoDB **8.0.34**, port **29511**, raised file limits,
  image `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
  This focused run is not a replica-set or full-portal matrix claim.

### Existing test change justification

The first focused run was **97 passing / 1 failing**, exit **1**
(`portal-composition-existing.log`). Its held audit-storage test awaited the
worker before releasing a held notification enqueue. The extracted audit handler
now correctly awaits that enqueue, making that ordering deadlock. The test now
waits until the original expected enqueue is observed, preserves its assertions
that shutdown is unfinished and persistence remains available, releases the
enqueue, and then awaits both worker and shutdown. No assertion was removed,
status/timeout relaxed, or test skipped. This tests the stronger completion
contract instead of restoring an unawaited production write.

## Production application and HTTP milestones

The composed application binds actual data, reference, identity, provider,
workspace, queue and installed storage/PDF modules. Installed registration is
resolved offline before selected factories acquire resources. The candidate
`app.express.cjs` is separate from the default until qualification gates pass.
HTTP bindings use the existing Express adapters and actual selected instances.

Before the supplemental queued-hook migration, `portal-application-real-sixth.log`
completed **1 passing / 0 failing / 0 skipped**, exit **0**. Its actual application
initialized **46 domains**, **29 types**, **31 forms**, **17 jobs** and **5 ledger
migrations**, persisted a configured SecurityEvent Agenda job, stopped to zero
pools, and restarted with the same persisted brand/forms. Assertion body
**18872.191143 ms**; total **318943.083485 ms**. The pinned Agenda processor keeps
passive watchdog delays after successful job completion (default lock lifetime / 2);
resource cleanup reached zero pools before those timers expired. The executable
owns process exit after successful stop. No private Agenda timer mutation is used.

`portal-host-real-third.log` completed **1 passing / 0 failing / 0 skipped**, exit
**0**, **12585.561026 ms** total, assertion body **9248.660418 ms**. It actually
served home and three authenticated metadata/form APIs, created/read/updated an
RDMP, refused a stale strict-concurrency update with **412**, refused an anonymous
API request with **401**, returned health **200**, readiness **503** before and
**200** after activation, and stopped to **0 pools**. No Sails global or comparison
service barrel was loaded. These seven authenticated API operations are a focused
qualification, not the existing full Bruno or Playwright collections.

Failed new-harness attempts are retained: missing required SecurityEvent
`deliveryState`; missing generated Prisma contract copy after an unsuccessful
build; and incorrectly expecting **200** for an actual successful record-create
**201**. They are not counted as passes. The successful assertions retain the
actual production response contract. Failed harness processes were specifically
terminated; disposable databases were cleaned before subsequent runs.

The production build (`npm --prefix packages/redbox-core run build`,
`portal-production-build.log`) exited **0**, including generated Prisma contracts,
portal configuration schema verification and full TypeScript compilation. A fresh
application run with six migrations and explicit separate-database job history is
in progress; full-suite/artifact/topology/recovery evidence must follow before any
P7 checkbox or default promotion.
