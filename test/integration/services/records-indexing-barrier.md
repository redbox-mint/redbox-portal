# RecordsService indexing barrier: supported subset

`records-indexing-barrier.ts` implements test-only coordination for ordinary
one-shot Mongo Agenda Solr submissions. It leaves the configured job name, real
handler, queue submission path, definition object and every definition option in
place. It does not drain the queue, disable indexing, change production exports,
or infer handler termination from lock timestamps or cancellation.

**This is not wired into `RecordsService.test.ts` teardown.** The helper and its
live adapter are a reviewable single-processor subset, not a claim that the
existing RecordsService integration lifecycle is fixed. The adapter rejects
installation unless its caller explicitly supplies `soleProcessor: true`. That
argument is a topology assertion by the caller, not automatic detection.

## Why live integration remains blocked

The private `SolrIndexFixtureLifecycle` defines a fresh random name in one
process. Installed Agenda processors scan and accept notifications only for
names they define; its closed wrapper therefore fences even delayed claims.
That isolation does not apply to the ordinary configured indexing name, which
every portal worker can define. Renaming RecordsService jobs to private fixture
names would change the path under test.

`docker-compose.mocha.yml` normally starts one portal profile with a private,
unpublished Mongo container. However, neither a lifted Sails configuration nor
the current queue API proves that it is the only processor of a shared database.
Mocha's private `ensureQueueInitialized` and `getAgendaForJobName` exports expose
the local Agenda definition, but provide no cluster admission fence or remote
handler join. Mongo completion/history, watchdog cancellation, disable and
deletion cannot prove that an older remote handler has stopped writing.

A live caller needs a trustworthy exclusive-worker topology guarantee, or queue
support for a distributed admission fence and joins of every admitted attempt.
The latter would exceed a test-only implementation. Until that support exists,
do not assert exclusivity for shared development databases or change default
RecordsService teardown to rely on this local barrier.

## Scope and cleanup contract

After installing the adapter in a proven exclusive process, open one scope per
test and run the **whole test body** inside `barrier.run(scope, body)`. Async local
context follows nested and detached continuations, including generated record
IDs first seen at `queue.now`. Unowned submissions and other job names pass
through. Repeated submissions for one record receive separate ledger entries;
acknowledgement must yield a unique, exact Agenda job ID. Handler admission is
registered synchronously before the real handler runs. Attempts entering before
acknowledgement are provisional until reconciled by that exact ID.

Record IDs must be fresh: the caller must guarantee that no earlier submission
for an owned ID is queued or can arrive later. A handler already running when
ownership begins is tracked and joined, and makes the scope fail; the local
wrapper cannot detect an earlier queued job that has not entered its handler.
Reconciliation requires both the job ID and record ID to match.
Owned record IDs must be strings; the submission captures the ID before calling
the queue. A rejected or mismatched acknowledgement leaves ownership uncertain,
so fixtures and configuration are retained even after local promises settle.

Call `barrier.cleanup(scope, workDeadline, joinDeadline, cleanupFixturesAndConfig)`
before restoring Sinon, schema/validation configuration, stored hooks, global
hook callbacks, records, audit/deletion records, schema references or users. Move
any test-local `finally` restoration into that cleanup callback as well. Merely
waiting in `afterEach` after those restorations would be too late. Deadlines are
absolute `performance.now()` values; Mocha's timeout must allow both budgets.

Cleanup seals submissions immediately. Success requires acknowledged exact jobs,
successful durable state in the jobs/history collections, matching successful
local attempts and zero active handler promises. Agenda's complete event wakes
observation after persistence; it is not itself proof of persistence. Observation
uses primary reads and the original acknowledged BSON ID. There is no queue-wide
poll or fixed sleep. Unsupported queues, backends, datastore overrides,
auto-removal and custom/callback handlers are rejected.

On any error, admission closes before joining all admitted handler promises.
New attempts for owned records are fenced, including prefetched claims. Errors,
missing state, unacknowledged/mismatched IDs, late submissions and deadlines stay
failures even if subsequent work settles. A failed but safely joined scope may
clean its fixtures and still rejects. A pending acknowledgement or active handler
at the join deadline retains fixtures **and configuration**, does not invoke the
cleanup callback, and returns an incomplete ledger. There is no delayed automatic
deletion. A cleanup callback already running when its own deadline expires cannot
be cancelled, but it starts only after fencing and joining.

Both wrappers and the complete listener must stay installed until Sails lowers;
restoring them after a test would reopen delayed owned work. Retained scopes and
ownership intentionally last for this process lifetime. A caller must preserve
the live scope ledgers for diagnostics: late submissions can invalidate an earlier
snapshot, and a local helper cannot retrospectively fail an already reported
Mocha test. It also cannot join unrelated post-save jobs or arbitrary async test
work; those need their own completion contracts. Never continue later tests with
retained modified configuration after an unsafe cleanup failure.

`scope.ledger()` is JSON-serializable and includes `state`, `incomplete`,
`admissionClosed`, `cleanupSafe`, active handlers, pending acknowledgements,
errors, every submission and every attempt (including rejected/fenced attempts).
`RecordsIndexBarrierError.ledger` captures the failure snapshot. `cleanupSafe`
means fencing and joining succeeded; it does not mean indexing succeeded.

## Verification

The deterministic Mocha tests retain the default
`test/integration/**/*.test.ts` discovery pattern. They can also run without a
Sails lift, Mongo, Solr, Docker or CI:

```sh
TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"Node"}' \
  node --no-experimental-strip-types -r ts-node/register/transpile-only \
  node_modules/mocha/bin/mocha.js --no-config --timeout 5000 \
  test/integration/services/records-indexing-barrier.test.ts
```

Deferred fixtures control acknowledgement, handler admission, overlapping writes,
durable reads and cleanup. The installed Agenda `Job.run()` is exercised for the
cancel/overlap race. Expired monotonic deadlines exercise retention without elapsed
time sleeps. These tests do not validate a live Mongo/Solr lifecycle or establish
distributed topology parity. The existing private Solr lifecycle probes remain
unchanged and independently runnable.
