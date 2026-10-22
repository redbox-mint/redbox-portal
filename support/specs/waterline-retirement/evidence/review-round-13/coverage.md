# R13 coverage coordinates

Checkpoint: `0341c6241`. Coordinates refer to committed source; the accompanying
`followup-sites.json` gives exact per-file hashes and matched lines. Inventory
matches are navigation aids, not independent fault injection of every line.

| Boundary | Coordinates and review result | Runtime evidence |
|---|---|---|
| Queue admission/claims/completion | `services/AgendaQueueService.ts:120` admission, `:128` handler lifetime, `:147` drain, `:232` repository ownership; real Agenda initial state, retry state, final acknowledgement, complete event and remove-on-complete traced. Stop claims first; late receives release their claims; owned final writes survive watchdog expiry. Acknowledged heartbeat fences advance before failed-final-save recovery. Deadline revokes completion admission, retains resources and permits cleanup retry. | Core queue tests; real processor controls; storage owners/owner failures; fresh stock lifts. |
| Actual Sails shutdown/signals | `persistence/shutdown.ts:11` guards native lower and Sails-owned signal callbacks; `runtime.ts:132` installs it before lifecycle hooks. Failed drains return without native `lower`; successful hooks run once before teardown. Concurrent attempts share ownership; SIGTERM/SIGINT/SIGUSR2 retain resources on error and retry safely. | Real Sails unit/concurrent lower control; four live native-checkpoint/subprocess controls. |
| HTTP/session | `middleware/requestLifetime.ts:30` app owner and `:60` request completion; `middleware/redboxSession.ts:36` drain and `:94` refusal. Async/controller/callback/abort/background/session writes traced through to completion. Queue admission uses captured app, active context and deadline. | Request/session unit controls; HTTP completion queue controls; actual connect-mongo/Express roundtrip and TTL; both owner selectors, live SQS acknowledgement, recovered null-nextRunAt Mongo redelivery and fenced reply-lost release retry. |
| Foundation/resources | `persistence/runtime.ts:174` acquisition, `:223` operation, `:236` cleanup. Fulfillment and rejection remove active promises. Drain failure reports before other held operations/resources and retains ownership. Partial connection/close retry paths traced. | Foundation suite; failed-drain controls; TLS/auth; resource ownership/failure fixtures. |
| Cache/C2 | `persistence/cache/runtime.ts` initialized concrete handle plus tracked four driver operations; `services/CacheService.ts:92` best-effort local-first persistence. Existing rebuildable-cache behavior and null timestamps are unchanged. Explicit Prisma refusal retained. | Cache contracts/transition/operations/read-values; fresh all-selector lifts; budgets. |
| Configuration/Q | `persistence/configuration/runtime.ts:93` guards; concrete configuration methods have no guarded internal re-entry. `services/AppConfigService.ts:520` bundles secret leases/read/write; bootstrap schema generation is local work. Dashboard/i18n/AppConfig and named-query translations traced. | Configuration/secret leases/locales, operation-boundaries, named-query literal/order regressions; fresh API suites. |
| Progress/J1 | `persistence/progress/runtime.ts:90`, `progress/MongoNamedQueryTargets.ts:54`; `services/WorkspaceAsyncService.ts:85` stops loops and awaits accepted result writes; bootstrap default cron targets that guarded loop. Async progress checkpoints traced from controllers and configured jobs. | Progress writes/operations, workspace drain, named-query pages/targets, both selector configurations. |
| Harvest/J2 | `services/HarvestRunService.ts:110` and `:115` admission tracks complete submissions through storage/event/checkpoint/counter; `persistence/harvest/runtime.ts` and counters delegate to concrete owners. | Harvest contracts/operations/counter and event-order controls; core harvest suite and stock APIs. |
| SIEM/J3 | `services/SecurityEventService.ts:49` accepted worker set, `:110` emission, `:254` append then forwarding enqueue; `persistence/siem/runtime.ts:78`. Trace policy/user emissions (enqueue immediately), record/attachment/integration brand lookup followed by enqueue, exporter leases, retry/outbox. Primary record/attachment audit callers now await that security follow-up. | Six actual SecurityEventService brand-lookup controls; SIEM contract/operations/leases; queue completion tests. |
| Figshare/J4 and RAiD | `services/figshare-v2/worker-lifecycle.ts:21` owns complete remote/checkpoint work; `persistence/figshare/runtime.ts` wraps factory-bound concrete owner, preserving internal composition. The active interval renewal is awaited before releasing its lease and settling the worker. `services/RaidService.ts:155` and `:230` delayed retry enqueue uses scoped worker permission. Completion persistence does not start consumers again. | Figshare contracts/operations/worker drain; worker and delayed retry queue controls; index and budget fixtures. |
| Reference/R | `persistence/reference/runtime.ts:88` concrete compound workflow/form composition; accepted operation remains tracked across both reads and all rejected/aborted paths. | Accepted-drain fixture with success and error paths, both selectors; reference contracts/operations; query/order controls. |
| Attachment staged metadata/journal/access | `persistence/storage/runtime.ts:80` guarded facade; concrete `prepareMutations` and `markDeleted` composition; journal stage-claim/write errors release tracking. `WaterlineAttachmentRepository.ts:618` and `MongoAttachmentRepository.ts:684` access audit waits for security emission. OID rebind stays baseline. | Accepted compound 36 controls, six audit follow-up controls; storage contracts/journal/rebind/access/grant/retained/budgets. |
| Schema artifacts/references and audit append/read/count | `sails-hook-redbox-storage-mongo/src/persistence/MongoStagedStorage.ts:70` initialized database, `:86` audit collection, `:170` guard; all five admitted audit methods avoid reacquisition. Schema methods use initialized collection overrides without guarded internal re-entry. | Accepted-staged-drain 36 controls; staged schema/audit contracts, physical shape, live storage and mixed/restart/rollback. |
| Integration audit and notification | `services/IntegrationAuditService.ts:278` persistence plus notification/SIEM, `:1028` awaited worker; `IntegrationNotificationService.ts:51` and `:137` throttle update after channels. Store failures preserve prior swallowed failure/retry behavior; follow-ups run once after successful persistence. | Real audit storage handler/held notification enqueue; core audit/notification tests; actual Agenda finalization controls. |
| Maintenance/migration/cleanup | `persistence/maintenance.ts:18`; `loader/MigrationRunner.ts:77` awaits body then ledger; storage-hook `RecordRevisionMaintenance.ts:58` and `migrations/recordRevisionBackfill.ts:16` awaited revision-only unit. Admitted revision maintenance captures and awaits its database acquisition before deferred execution; both selectors finish during immediate cleanup without changing record metadata/authorization. Restart remains resumable. Native-byte/session/queue owners dispose after accepted work and retain failed closes. | Index inspect/ensure/drift/duplicates; migration transition/rollback; revision interrupted-batch/resume; upgrade existing volume; owner failures. |

Core source paths above are relative to `packages/redbox-core/src/`, except
explicit storage-hook paths. G-TX remains closed: Records/DeletedRecord,
CAS/lifecycle/permanent identity, U/authorization, Counter and attachment OID
rebind remain Waterline/native-owned. The record-service edit only awaits its
existing record-audit security follow-up; it does not change record ownership.
Private hook callbacks/custom raw targets remain institution-qualified; arbitrary
legacy diagnostics are not certified by the bounded staged-error review.


The parent repeated a fresh feature pass after all 76 commands passed at
`f96082066`, using `git diff master...HEAD` against
`ef23e07fe2933e62ea10620efa7db41f577213d0`. Rechecked group defaults, staged/native
operation lists, loaded mappings, query-path/scalar/pagination boundaries, C2
validation/read timestamps, resource acquisition/cleanup, session/controller
ownership, audit persistence/notifications, maintenance field projections and
bounded diagnostics. That parent pass did not identify the subsequent independent Standards finding: real Sails teardown ignored hook errors. `0341c6241` fixes that application entrypoint; final review follows the repeated 77-command qualification. Low-level cleanup's refusal
of new repository work is intentional; normal producer hooks await accepted
handlers before invoking that boundary. Notification enqueues are admitted
synchronously and their I/O remains queue-owned after the audit handler settles.
The full master diff also contains earlier unrelated history/renames; the table
and reproducible coordinate inventory identify this feature's reviewed paths.

After the repeated **77-command** qualification passed at `0341c6241`, the parent
rechecked selector refusal/defaults, cache null timestamps, shared scalar and
auto-timestamp rules, explicit staged/baseline operation lists, revision-only
maintenance projection, admitted audit handles, actual Sails lower/signal/lift
entrypoints, producer-hook ordering, claim/finalization ownership and awaited
Figshare heartbeat teardown. No additional concrete P1/P2 was found. Sails'
default failed-lift callback logs without forcing exit; the application's explicit
shim-generation exit occurs before accepted persistence work. Independent final
Standards and Spec results are recorded separately in `review-axes.json`.
