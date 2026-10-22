# Queue delivery ownership — R17 holistic review

Checkpoint: `3691a3d73`, reviewed against input `2cdb5442d`. This is one design
review of both backends; individual R13–R16 fixes remain ancestral.

## Ownership identity and states

A **job** is an envelope/document ID. A **claim** is one delivery of that job.
Mongo claims now use `(job ID, lastModifiedBy)`, where `lastModifiedBy` is a fresh
`redbox-claim-<UUID>` for **each acquisition**, rather than an Agenda instance
name reused across acquisitions. SQS claims remain `(job ID, receipt handle)`.
The receipt is the AWS delivery identity; Mongo's existing `lastModifiedBy`
field carries the delivery identity. No schema, index, collection or dependency
is added. Mongo `lockedAt` still carries Agenda's normal expiry/renewal time.

The local states are **acquiring**, **owned**, **write pending**, **uncertain**,
**release pending**, **release failed**, and **ended**. A single map entry per
backend delivery stores compact attributes (no `data` payload), a sequencing
tail and an optional in-flight release promise. Owned/uncertain/release-failed
states retain the same record. Ended has no map entry. These states are logical
observations of that record and its pending promises, not a second state registry.

Application admission is a separate overlay: **open → draining → deadline
expired → closed**. Deadline expiry refuses new completion enqueues; it does
not end claim ownership, cancel accepted handlers or authorize backend closure.
Failed cleanup retains resources and can be retried. Each attempt is bounded
by the original configured/default 30s policy; the original completion-admission
deadline is not extended by retry.

## Transitions and enforcement

Code references are in `packages/redbox-core/src/services/AgendaQueueService.ts`.

1. **Claim**: `ownAgendaRepository` admits `getNextJobToRun`/`lockJob` only while
   open, injects a fresh owner into repository options, records the returned
   delivery, and returns it to Agenda. An acquisition admitted before drain can
   finish later; the same owned operation releases it and returns no runnable
   job. Repository operations are tracked by `ownBackendOperation`.
2. **Heartbeat/touch**: snapshot submitted attributes before waiting; put the
   save on this record's `sequence` tail. Mongo `repository.saveJobState` writes
   the pinned Agenda state fields only when ID/name/delivery owner match and a
   BSON Date lock remains. SQS's repository renews exactly the submitted receipt.
   Successful renewal retains the one original ownership record; no timestamp
   candidate history is necessary.
3. **Ambiguous write**: a rejected response might represent an applied save or
   release. Keep ownership until a later acknowledged completion, fenced release
   or confirmed ended claim. Sequential dispatch prevents older acknowledgements
   from erasing later outcomes. Mongo release matches the delivery owner across
   all renewal timestamps, so possible timestamp arrays are removed.
   A claim acquisition whose response is lost has no returned attributes/receipt
   to retain locally. Its owned repository operation settles with the failure;
   normal Mongo lock expiry or SQS visibility expiry recovers the unseen delivery.
   It cannot have started a handler, and cleanup must not guess an ID/receipt or
   release a different owner. This is bounded recovery, not immediate unlock of
   an unknowable remote acquisition.
4. **Redelivery**: allocate another independent record. Old completion, stale
   unlock and old release acknowledgement cannot address the new key. Even an
   identical Mongo lock timestamp does not reuse a delivery owner. Mongo state
   saves also use the captured owner; otherwise an old save would replace the
   new delivery token and defeat the simplified release predicate.
5. **Completion**: acknowledged final save with no lock removes only that
   delivery. Mongo saves `lockedAt:null`; SQS deletes a successful receipt. A
   subsequent state save for the ended delivery fails locally, and unlock is a no-op.
   `registerAgendaEvents` owns start→complete, final saves and removeOnComplete
   independently of Agenda's watchdog/processor count.
6. **State-save failure**: a nonterminal/ambiguous error leaves the compact
   record for release/retry. Mongo's acknowledged ownership miss is terminal
   (`AgendaClaimLostError`), as are only SQS `MessageNotInflight` and
   `ReceiptHandleIsInvalid`; delete that exact record and rethrow the save error.
   AccessDenied and other errors remain owned. Initial-save failure can occur
   before Agenda's start event; final-save failure is swallowed by Agenda, so
   the ownership record, not complete events, is the release authority.
7. **Retry scheduling**: an acknowledged final save persists future nextRunAt
   and ends this delivery. On a failed/ambiguous final save, release preserves
   an already persisted retry date. An applied completion or retry save has no
   lock and cannot be resurrected by release after reply loss. A still-locked
   null/missing-nextRunAt job is repaired atomically to a runnable Date. This
   guarantees recoverability, not durable preservation of a retry delay that
   never reached the server or exactly-once execution.
8. **Expiry**: elapsed time alone does not delete the local record. Mongo can
   be reclaimed through Agenda's normal expired-lock query, producing another
   unique owner; an old fenced save/release then misses. For SQS, only confirmed
   ended-receipt errors terminate the retained receipt locally; a new receive
   creates its own receipt record. No local clock is treated as authoritative
   proof of a remote visibility/write outcome.
9. **Drain/deadline**: `drainAgenda` invokes stop(false) promptly, releasing
   prefetched claims through the same wrapper path. `drainWorkers` owns accepted
   handlers, HTTP follow-ups, enqueues, job completions and repository operations
   before the final claim sweep. `withDrainDeadline` reports failure and retains
   every resource. `completionAdmission` revokes late completion enqueue rights.
10. **Release/retry**: single unlock, ID-only bulk unlock, late acquisition and
    drain sweep all enter `releaseClaim`. Duplicate concurrent releases share
    one promise; release follows every earlier submitted save. Success/confirmed
    ended SQS receipt deletes the exact delivery. Failure retains it and clears
    only the in-flight release promise so retry remains possible. Mongo release
    matches ID/name/unique owner/Date lock; an applied release reply loss cannot
    unlock a successor or resurrect an already-unlocked completion.

11. **Handler Job.save**: an active Mongo delivery's user/scheduling save is
    serialized on the same record. Its native update matches the delivery owner
    and live lock, preserves processor fields/owner, and returns the existing
    public save result fields. Ordinary unclaimed creation/scheduling still uses
    the pinned repository. A Mongo object carrying an ended claim token cannot
    fall back to an unfenced save. SQS Job.save retains its existing enqueue-copy
    behavior; it does not finish or release the current receipt. The explicit
    handler-save control covers persisted data and final completion; stale/ended
    Mongo saves are refused. This path was found during integration audit of the
    first simplification, corrected forward in `3691a3d73`, and fully requalified.

## Invariants and witnesses

- **Never release another owner**: independent delivery keys; unique Mongo
  persisted owner on acquisition, save and release; exact SQS receipt metadata.
  New `storage-agenda-claims.cjs` equal-timestamp old-unlock/successor-save;
  retained SQS old-unlock/old-complete tests; R16 late-claim and retained live
  applied-release-loss/synthetic-successor controls.
- **Never permanently strand a runnable job**: release repairs null/missing
  nextRunAt only on a still-owned lock; expiry permits normal recovery; failed
  release keeps backend resources. New overlapping-touch/final-save-refused;
  retained recovered-prefetch/ambiguous-heartbeat/cleanup retry controls.
- **Never drop a persisted retry**: release's atomic `$ifNull` preserves future
  stored dates; unlocked final writes are never resurrected. New
  retry-reply-loss/completed-reply-loss and retained future-retry live controls.
- **Retain retry ownership**: rejected release and nonterminal saves retain the
  same record. Retained AccessDenied, late-release refusal, partial bulk unlock,
  deadline and close-failure controls cover both drain attempts.
- **Bound retained state**: O(unsettled deliveries + in-flight operations), one
  compact record per delivery, no job payload and no heartbeat history. This is
  not a fixed global concurrency limit or a promise to forget uncertain remote
  claims using local time. Confirmed ended saves/releases and acknowledged final
  saves remove records. New 128 ambiguous renewals cause exactly one release;
  retained SQS 256 historical-delivery lifetime probe leaves only one active
  receipt. Unresolved nonterminal failures deliberately remain owned for cleanup.
- **No closure based only on Agenda's count**: actual handler/job/write/HTTP
  lifetimes are awaited; deadline errors block Sails lowering and foundation
  closure. Existing live owner suites, signals, and default 30s worker/HTTP
  probes remain mandatory.

## Pair enumeration

`transition-pairs.json` explicitly enumerates all **12×12 = 144 ordered pairs
per backend (288 total)**: claim, heartbeat, ambiguous write, redelivery,
completion, state-save failure, expiry, drain deadline, release, release retry,
retry save, and user Job.save. Each entry states the ordered outcome, enforcement and relevant
existing/new witness. Terminal-delivery operations, new-delivery transitions,
and drain-overlay admission are distinguished. This is exhaustive **source
inspection**, not a claim that 288 separate live interleavings were executed.
The executable controls cover the risky overlaps and terminal/uncertain outcomes;
individual cells label compositional coverage honestly.

## Finding and proportionality decision

The old ID→possible-fences array conflated Mongo deliveries, allowed an older
successful save to discard a newer ambiguous fence, and retained one attributes snapshot with a
payload reference per unresolved failed renewal. Real Mongo controls reproduce
old-unlock of a later delivery, incomplete cleanup after overlapping heartbeat
replies, and 129 releases after 128 failed renewals. The first two are separate
P2 failures of the same ownership design; unbounded candidates corroborate why
another array-guard patch would not converge.

The forward simplification removes that candidate protocol and per-ack fence
replacement. Per-delivery serialization and a unique persisted owner give one
release predicate and one release path. The small Mongo state-save and owned user-save adapters are
required to preserve that delivery token across Agenda's writes, retaining the
pinned repository's exact state fields/null conversions while fencing ownership.
The baseline pinned repository's general stale-write behavior is not reported as
an additional newly introduced finding. Existing scheduling, lease arithmetic,
watchdog behavior, public queue API, SQS expiry classification and P10/G-TX
allocation remain unchanged. No broader retry framework or pool is introduced.
