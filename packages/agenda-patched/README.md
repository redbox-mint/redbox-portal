# Agenda watchdog cleanup (#5038)

## Why this dependency is local

Master pins `agenda@6.2.5` (Mongo backend 4.0.2); develop and next pin
6.2.6. Both published Agenda tarballs contain the same watchdog defect:
`runOrRetry()` races `job.run()` against an uncancellable `setTimeout` sleep.
Settling the race does not settle its losing branch. A completed job leaves a
referenced sleep for half its lock lifetime (normally 300,000 ms).

Checked on 2026-10-28: npm's latest Agenda is 6.2.6. The
[6.2.6 release](https://github.com/agenda/agenda/releases/tag/agenda%406.2.6)
does not fix this. Upstream [PR #1807](https://github.com/agenda/agenda/pull/1807)
(head `ae16dc8e5a901f4af69aab09bd3d977ec7190f1e`) proposes completed-job
sleep cleanup but is open and unreleased. No upstream messages were sent.

There was no dependency patch mechanism in this checkout. This uses the existing
`file:` dependency convention: `agenda-6.2.5-redbox.1.tgz` is the upstream
6.2.5 distribution with only `watchdog.patch` applied. It retains Agenda's
6.2.5 package version so exact Mongo/SQS peer requirements remain valid. Its
filename and lockfile integrity identify the local revision. It works with the
repository's `ignore-scripts=true` policy, including clean production installs.

The core dependency and SQS development dependency select this artifact. All
lockfiles containing Agenda references have been updated, including
snapshots of the local core package. No other dependency versions change.

## Behavior

Each running job owns an AbortController. Only its watchdog sleep uses the Node
abortable timers API. Completion or failure aborts the sleep in `finally`, before
queue bookkeeping that might itself throw. `stop()` and every terminal `drain()`
path cancel all remaining watchdogs, before fallible connection cleanup.

An aborted watchdog follows the original job promise: stopping monitoring does
not finish or cancel a still-running handler. A lock check already in flight
cannot rearm the timer or apply stale expiry/error results after cancellation.
While monitoring is active, the original interval, expiry checks, missing-lock
errors, `touch()` behavior, and error reporting remain in effect. The patch does
not change backend lock operations or Agenda's existing stop/unlock semantics.

Operationally, completed workers can exit naturally as soon as their other
resources close. This does not terminate handlers, cancel unrelated application
timers, or shorten database/SQS request timeouts. Graceful shutdown must still
wait for application work and close its clients. Mongo and SQS both execute the
same patched JobProcessor. An independently installed SQS adapter still takes
Agenda from its caller through its exact peer dependency.

Docker explicitly includes this tarball despite its general `*.tgz` exclusion.
For npm publication, the existing staging script replaces checkout-relative
Agenda references with the exact upstream version and bundles the patched
Agenda plus its installed, locked runtime dependency graph into both core and
generated core-types packages. The adapter's development reference becomes an
exact registry version; it has no bundled processor. The publication test checks
that the processor and its cron-parser dependency actually reach both archives.

## Reproduction and validation

Use the repository Node 24 version. From the repository root:

```sh
npm ci --ignore-scripts --strict-peer-deps
npm run compile:agenda-sqs
npm run test:agenda-watchdog
# Include real MongoDB jobs (otherwise these cases explicitly skip):
AGENDA_TEST_MONGO_URL=mongodb://127.0.0.1:27017/agenda_watchdog npm run test:agenda-watchdog
bash support/build/npm-publish-backend-packages.test.sh
packages/agenda-patched/rebuild.sh
```

The focused tests exercise the actual processor with controlled job promises and
40 ms lock checks: completion, run rejection, stop, cleanup failure, drain
abort/timeout, active expiry/lost lock/read errors, and stale lock-check success
or failure after stop/completion. Timer observations use Node async_hooks and
inspect only timers created from JobProcessor; they do not modify timers.

Child-process regressions run real Agenda jobs against real MongoDB and the real
SQS repository with an in-memory SQS transport. They cover success, handler
failure, draining, stopping a running handler, backend cleanup failure, initial
and completion persistence errors, and `touch()` across several lock lifetimes.
Each child reports pending watchdogs and must exit naturally within five seconds.
Only the parent can kill a failing child at its deadline; workers never force
exit or unref timers. The Mongo cases run in CircleCI's storage-mongo job.

Using the worker's `AGENDA_TEST_AGENDA` override with an extracted unpatched
6.2.5 package reproduces one pending watchdog after successful execution and clean
stop; an external three-second deadline kills that otherwise-idle process.
The patched success/failure workers exit in approximately 0.2–0.4 seconds locally.
SQS transport tests do not require AWS credentials or certify live AWS behavior.

`rebuild.sh` verifies the upstream tarball's SHA-256, applies the textual patch
with no fuzz, and checks byte-for-byte artifact reproducibility without install
scripts. `rebuild.sh --write` regenerates it; update the SHA-512 integrity in each
Agenda lock entry after an intentional patch change. Upstream licensing remains
inside the distribution. Source maps are upstream originals; the reviewable patch
targets the published JavaScript and declaration file.

When a compatible upstream release includes completion, stop, and in-flight
cleanup, run these regressions against it. Then replace both local references
with exact released versions, update every lockfile, and remove this artifact,
its rebuild script/patch, the Docker exception, and publication bundling.

## Develop and next integration

Develop and next preserve Agenda 6.2.6 using `agenda-6.2.6-redbox.1.tgz`, with the same watchdog patch. The reproducible rebuild now uses the exact 6.2.6 upstream tarball and SHA-256. The 6.2.5 artifact remains for master/history. Both core and SQS test manifests reference the patched 6.2.6 artifact.
