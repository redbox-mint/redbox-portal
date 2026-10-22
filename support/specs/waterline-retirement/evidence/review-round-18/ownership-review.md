# R18 independent ownership audit

Reviewed input `790e92ca5` directly in `AgendaQueueService.ts` and the installed
Agenda, Mongo backend and first-party SQS backend implementations. R17's prose
was treated as a set of claims to verify. One reviewer; no delegated-axis claim.

## State representation and transitions

There is one `claims` map in each `ownAgendaRepository` closure (line 236).
A record contains compact attributes with `data: undefined`, a promise tail and
an optional release promise. There is no timestamp-candidate array, ID-only
ownership registry or second acknowledgement/fence registry. `jobCompletions`,
`workers`, `pending` and `backendOperations` own different asynchronous lifetimes;
they cannot authorize or select a claim release.

| Logical state | Actual representation and transition |
| --- | --- |
| Acquiring | The tracked repository operation (lines 264–323), before a returned delivery exists. Drain refuses new acquisitions; an admitted late result is recorded and released before returning no job. A rejected acquisition has no knowable local receipt; backend expiry recovers it. |
| Owned | The map entry inserted at line 313. Mongo options persist a fresh per-acquisition UUID owner; SQS keys include the receipt handle. |
| Write pending | `sequence` chains submitted state/user saves on the record tail, with a map-identity recheck immediately before dispatch. Attributes are captured before waiting. |
| Uncertain | Nonterminal rejected saves leave the same entry. The tail absorbs rejection for sequencing only; the caller still receives the error. No older acknowledgement replaces identity/history. |
| Release pending | `releaseClaim` shares `claim.releasing` and queues release after preceding saves. Single unlock, bulk unlock, late acquisition and final sweep all use it. |
| Release failed | Rejected release retains the entry; only `releasing` clears. Another cleanup can retry. Mongo owner/Date-lock matching makes an applied-but-lost release harmless to a successor. SQS catches only its two confirmed ended-receipt errors. |
| Ended | Acknowledged lockless final state save, confirmed lost ownership or successful release deletes that exact delivery. Later state saves refuse locally; stale Mongo user saves cannot fall through to an unfenced update. |

The admission overlay is separate: open, draining, deadline expired, closed.
`closing` refuses acquisition and outside submissions. Accepted worker/app-local
HTTP completions remain admitted only until the original completion deadline.
Deadline expiry does not cancel accepted writes, forget claims or close resources.
`withDrainDeadline` bounds every attempt; failed drains preserve backend resources
and can be retried without extending the original completion-admission deadline.

## Invariant assessment

- **No release of another owner:** Mongo acquisition, state save, user save and
  release consistently use `(ID, name, unique persisted owner)` and a live BSON
  Date lock. SQS uses `(ID, receipt)` and retains the exact receipt on release.
  Bulk unlock enumerates owned deliveries rather than dispatching an ID fallback.
- **No permanent unrunnable job:** release atomically repairs only still-owned
  null/missing `nextRunAt` to a Date. Lost acquisition replies recover through
  ordinary lock/visibility expiry. Failed releases remain retained for retry.
- **No dropped persisted retry:** `$ifNull` preserves an existing future date;
  an applied lockless final save no longer matches release. A retry write that
  never reached the server cannot promise a preserved delay; recovery is runnable.
- **Bound retained state:** one payload-free record per unsettled delivery;
  no heartbeat history. Confirmed completion/release/loss removes it. This is
  O(unsettled deliveries + in-flight operations), not a fixed global cap or a
  guarantee to discard unresolved remote outcomes using local time.
- **30s drain policy:** initialized/configured default is 30,000 ms. Stop starts
  promptly; actual handlers, HTTP follow-ups, final saves, enqueues and repository
  operations precede closure. Timeout returns failure with resources retained.
  A bounded failure is the contract when accepted work remains held.

The Mongo user-save adapter preserves processor fields and the delivery token;
ordinary unclaimed scheduling retains the pinned repository behavior. SQS user
`Job.save()` retains its enqueue-copy semantics, including its ordinary native
API behavior after application admission closes. It does not release a receipt.

## Pair matrix completeness

R17's event partition has 12 events and all 144 ordered pairs per backend,
288 unique cells total. Every row/column and rule reference resolves, and each
rule supplies an outcome, enforcing code and named witnesses. Source inspection
confirms conditional terminal versus nonterminal save failures and release-retry
outcomes are covered by the referenced guards; they are not a second protocol.
Acquisition failure is described explicitly in R17's state-machine text and
covered by the tracked operation/expiry behavior, rather than a thirteenth event.

`pair-audit.json` records independent structural checks. The matrix is complete
for its declared transition partition. This does not claim execution of every
possible overlap or 288 separate live scenarios. Retained focused controls and
the eight real Mongo/Agenda scenarios are rerun during R18 verification.

No violated invariant or reproducible new P1/P2 qualified in this audit.
