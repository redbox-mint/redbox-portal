# R15 coverage

Input `dcf7d7ad7`; merge-base `ef23e07fe`; qualification `5de68b600`.
Read R14 README/coverage and R13 README first; R10–R12 coverage is in their
READMEs (there are no separate coverage.md files). Separate standards/spec
passes supplement the parent review; both initial passes returned no findings.
The parent reproduced the SQS claim-identity defect and requested final passes
with that finding, fix and prior dispositions included.

| Concern | Review and executable coverage |
| --- | --- |
| R14 HTTP follow-up | `retainHttpRequestFollowup` uses the existing app-local AsyncLocalStorage and active request, and grants no new completion permission. Record and both attachment callers catch optional failures. The expanded real HTTP fixture holds brand lookup across the 200 response and shutdown, then exercises success, lookup failure and enqueue failure for all three producers. The expected bounded failure diagnostic is required; worker/direct completion remains awaited. |
| Request/app isolation | Retained queue controls cover captured app ownership, another app's context, external callers and descendants that outlive their handler/request. A supplemental probe invokes the actual follow-up API with overlapping requests in one app, another app, and a completed request; completion and retention stay independent. |
| Default deadline | Actual worker and HTTP follow-up probes use the unmodified 30,000 ms default. Both return one failure callback near 30 seconds, retain resources, refuse late completion admission and finish cleanup on a second attempt. The HTTP probe has already delivered 200 and requires a failure log for its refused late enqueue. |
| R14 ended SQS receipts | Actual Agenda/repository/AWS SDK protocol controls retain MessageNotInflight/ReceiptHandleIsInvalid classification. New redelivery controls prove an old receipt cannot release or discard a newer receipt with the same job ID. AccessDenied on the newer release must fail shutdown and retain that exact receipt for retry. A real Job.run initial save, handler and final DeleteMessage exercise the completion case. |
| Mongo ownership | Claim-key default remains job ID; timestamp/unique-owner fencing, ambiguous heartbeat candidates, future retry dates and null nextRunAt recovery are unchanged. Both live ownership selectors, failed release/retry and real Sails shutdown/signal controls remain in the full inventory. |
| Less-recently covered M/C2/configuration | Rechecked ledger query/write coercion, required/default/timestamp fields and error translation; C2 four-operation mapping/error/null-timestamp contracts and local-first cache scope; configuration find cardinality, branding IDs, locale/prefix queries, secret leases and dashboard CAS. Harness includes transition, mixed-writer/clock, native-value, scalar, mapping, error/no-replay and readback controls. |
| Less-recently covered R/J/S seams | Separate axes recheck named-query/tenant/identity/association translation, progress/harvest service consumers, SIEM/Figshare persistence and staged storage selection against the specs. Parent rechecks harvest counters/filter/pages, selected index preparation, connection-policy pooling and the complete staged/baseline operation lists. Retained contract/parity/selector/index/live/API/upgrade/budget controls run sequentially. No unrelated full-master-history feature is represented as part of this programme. |

No generic queue lifecycle abstraction, broader retry mechanism, transaction,
new connection pool or Mongo fencing protocol is introduced. The private claim
key is still the job ID for Mongo and includes the receipt for SQS. Bulk ID
unlocks enumerate only matching retained claims. Terminal receipt errors only
complete the release of that particular receipt; all other failures retain it.

G-TX remains CLOSED. Records/DeletedRecord, CAS/lifecycle/permanent identity,
U/authorization, Counter and attachment OID rebind remain Waterline/native-owned.
P10 promotes only staged S. ADR0003 (official driver, no ORM), C2 retired-Prisma
refusal, and the intentional cache legacy-null timestamp difference are intact.

Pre-existing master behaviors from R14 remain unchanged: falsy CacheService.get
hits fall through to persistence; per-call local TTL is not a persisted TTL;
local-first void cache writes retain find/create and best-effort behavior;
RDMP global counters retain read/compute/overwrite rather than an allocator.
No private institution-hook, transaction/failover or official-release
qualification is inferred from the public standalone fixtures.
