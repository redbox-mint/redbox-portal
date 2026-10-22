# R14 review coverage

Baseline `ef23e07fe`; input `4df2d44fd`; implementation checkpoint `2ad89fd80`.
Test-only interface-argument/callback-type corrections: `4bd1aea7a`, `1f84a1cc0`;
runtime source/build hashes remain unchanged. Focused tests and their strict
typecheck are rerun after the complete inventory.
Read R13 and R12 evidence first, then ADR0003, both programme specifications,
the staged-storage classification, lifecycle contract and wiki standards.

| Concern | Review disposition and executable coverage |
| --- | --- |
| Mongo release fencing | Retained timestamp plus unique Agenda-owner predicate. The atomic pipeline repairs persisted null/missing `nextRunAt` while retaining future retry dates. `storage-ownership` and `storage-ownership-waterline` exercise recovered jobs, redelivery, lost release replies plus an equal-timestamp successor, acknowledged and ambiguous heartbeat saves, and failed final saves. No new Mongo fence machinery. |
| Queue deadlines and retries | Default 30,000 ms is retained in config, field initialization and ready setup. `AgendaQueueService.test.ts` exercises worker/watchdog holds, pending starts/indexes/enqueues, early unlock failure, unchanged original admission deadline, prior producer hooks and single callback delivery. Real Sails direct-lower and signal controls retain native checkpoints on refused shutdown. Known stale SQS receipts no longer poison every retry. |
| Request/worker completion scope | Admission uses the captured app's request context or the queue instance's still-active handler; deadline revokes it. Existing tests refuse unrelated callers, completed-handler/request descendants and other applications. The HTTP fix owns only the explicit follow-up promise in the existing app-local request lifetime; it grants no independent completion permission. |
| Optional audit response coupling | Three new real HTTP controls hold brand lookup after successful primary audit writes: record, Waterline attachment and Mongo attachment. Responses complete while shutdown waits; unrelated enqueues remain refused and the accepted request finishes exactly one enqueue. Six existing worker success/failure controls retain awaited completion. |
| Stale SQS receipt release | Two new controls use real Agenda, the actual SQS repository and AWS SDK against a local JSON-protocol endpoint returning `MessageNotInflight`/`ReceiptHandleIsInvalid`. Shutdown succeeds with one release attempt and does not reuse the receipt. Other release failures retain ownership; existing partial-release and retry controls remain enabled. |
| Figshare heartbeat | R13 serializes renew/touch tasks and awaits the active task before owner-fenced release. R14 changes no renewal interval, duration, owner/expiry check or lease arithmetic. Both selector worker/HTTP suites retain held renewal-response coverage. |
| Whole feature | Independent standards/spec source passes against the merge-base supplement the parent review of C2/M/R/Q/J1-J4/staged S, selectors/index deployment, configuration/mappings, codecs/query/default/timestamp behavior, diagnostics, lifecycle and retained native boundaries. Final review reports are recorded separately with task IDs and hashes. |

The fence predicates and published `JobRepository`/`AgendaBackend` interfaces are
supported by reproducible retained controls at the pinned Agenda/backend
versions. Replacing them with unfenced best-effort unlocks would lose demonstrated
guarantees. R14 adds a narrow terminal-receipt classification and reuses request
ownership, without a new queue lifecycle abstraction or broader retry engine.

G-TX stays CLOSED. Records/DeletedRecord, CAS/lifecycle/permanent identity,
U/authorization, Counter and attachment OID rebind retain Waterline/native
owners. P10 promotes only the staged subset. C2 remains on the official MongoDB
driver; explicit `prisma` refuses with migration guidance and the intentional
legacy null-timestamp contract remains intact.

Pre-existing, not fixed (verified against `ef23e07fe`):

- `CacheService.get`: falsy local cache hits fall through to persistence; per-call local TTL is not a persisted TTL contract.
- `CacheService.set`: local-first void writes retain the find/create race and best-effort failure behavior.
- `RDMPService.processRecordCounters`: global counters use read/compute/overwrite and can lose concurrent increments; the retained Counter owner is not converted into an allocator.

Low-level foundation cleanup deliberately refuses new repository operations;
the documented before-shutdown producer hooks finish accepted requests/workers
before invoking it. This distinction is not a new completion-admission grant.
No hypothetical race or unrelated behavior change was promoted to a finding.
