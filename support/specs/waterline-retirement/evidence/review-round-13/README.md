# Programme review and fixes — Round 13

Input: clean `dc77696de`, branch `t3/waterline-retirement`. Runtime qualification
checkpoint: `0341c6241`. Read the R12 README first, then all R12 fixes, programme
specifications/ADR0003, C2 contracts, wiki standards and prior review evidence.

## Findings and fixes

Twelve P2 lifecycle defects were addressed. No P1 was found. Related corrections
found while reviewing the fixes are recorded separately below, not counted as
new defects in the input checkpoint.

1. **Unbounded queue drain/completion admission.** A blocked worker or a cycle
   of completion enqueues could keep shutdown pending indefinitely. `f05d62074`
   adds a validated 30-second default (`options.drainTimeoutMs`), revokes scoped
   completion permission at the deadline and retains live resources for retry.
   `cf8b249c5` also bounds later producer/session shutdown hooks, with one callback.
2. **Agenda's watchdog ended ownership before actual work finished.** A handler
   awaiting remote I/O can outlive its lock and disappear from Agenda's running
   count. `f05d62074` retains actual handler promises. `3f50da154` extends ownership
   through Agenda's initial/final state writes, retry metadata, final SQS
   acknowledgement, completion event and automatic removal. `61adee143` owns
   the whole public removal promise before its internal readiness await; a
   16-interleaving real-Agenda control catches the former deletion/close race. Resources close only
   after these settle. A real SDK DeleteMessage held at the local protocol server
   remains owned after watchdog expiry.
3. **Pending enqueues/startup index work delayed stopping consumers.** Agenda
   continued claiming new jobs while shutdown awaited earlier writes/startup.
   `f05d62074`/`0f0a90038` quiesce started processors first. Late-finishing starts
   quiesce themselves; completion enqueues persist without restarting consumers.
4. **A failed concurrent start abandoned other pending starts.** Cleanup could
   close a backend while another Agenda start was still pending.
   `0f0a90038`/`601a8318c` own each start independently and retain the original
   fail-fast startup error. Cleanup still awaits all acquired starts.
5. **Accepted staged audits encountered database admission again.** Immediate
   cleanup rejected append/read/count inside already accepted operations.
   `ac1485647` uses the initialized staged database for all five audit methods.
6. **Accepted HTTP requests lost audit/notification/retry enqueues during drain.**
   `cf8b249c5` connects HTTP/session quiescence to app-scoped active request
   contexts. Only accepted requests/workers retain completion permission before
   the deadline; unrelated callers and descendants outliving their scope fail.
   `95f6bbb00` corrects a fix-review cross-application ownership regression.
7. **A failed foundation drain waited forever behind other live work.**
   `cf8b249c5` reports a resource drain failure without waiting for other held
   resources/operations, retaining all ownership for cleanup retry. `bd0c2e4f5`
   starts resource drains before pending acquisition waits, so startup deadlines
   can report even with indefinitely pending connection selection.
8. **Primary record/attachment audits detached their security follow-ups.**
   Asynchronous brand lookup could finish after the primary audit/request and
   lose its security enqueue. `60c59ed7c` awaits existing security emission from
   the record and both attachment audit producers. Existing best-effort failure
   handling remains intact; record/authorization ownership does not change.
9. **Agenda drain discarded prefetched locks.** `3f50da154` uses public
   `stop(false)` before waiting, owns outstanding claim/unlock work, and releases
   late claims before closure. `f48c69dad` retains receipt attributes for SQS; `73683793c` releases Mongo
   claims with an atomic driver update fenced by captured timestamp and unique
   Agenda owner. `61adee143` reads the currently persisted next-run state in
   that atomic pipeline: null/missing becomes runnable and future retry dates
   remain intact, including a failed final state save after initial null state. Successfully
   released IDs are skipped on a partial-stop retry so another owner's lock is
   not cleared. Failed unlocks retain ownership. The live Mongo control verifies
   a recovered job is released while the active handler remains held, then proves subsequent redelivery. A second
   live case applies release, loses its reply and installs an equal-timestamp
   successor; retry preserves the successor. `e3d592bde` refreshes the retained
   fence after acknowledged heartbeats; actual `Job.touch()` followed by a failed
   final save proves release still makes the pending job runnable. `127595832`
   retains both possible timestamp/owner fences after an uncertain renewal,
   including an applied write whose response was lost. SQS keeps one receipt release.
10. **Accepted revision backfill reacquired a forbidden database.** `8d05516e0`
    captures and awaits acquisition before the deferred operation; immediate
    cleanup completes the accepted backfill under both selectors. Only existing
    revision/lifecycle-default maintenance columns are written; record payload
    and authorization fields remain untouched.

11. **Figshare interval renewal outlived its worker.** `76f36bab0` retains the
    active heartbeat task and awaits it before lease release/worker settlement.
    A real HTTP/Mongo control holds an already-applied renewal response and proves
    no late queue touch escapes ownership. Both selectors pass. `c9cc76d39`
    also starts bounded drain after partial queue startup failure and retains
    accepted workers' scoped completion admission to healthy backends.

12. **Real Sails teardown ignored drain failure.** Sails logged the hook error,
    emitted native `lower` anyway, then exited or restarted on its signal callback.
    `0341c6241` guards the complete hook chain before native teardown and makes
    Sails-owned signal listeners exit only after success. Concurrent attempts
    share one drain; failed attempts retain native adapters and permit retry.
    Real Sails direct lower and SIGTERM/SIGINT/SIGUSR2 subprocess controls preserve
    a held worker's native checkpoint, then shut down successfully on retry.

Fix reviews also caught incomplete ownership of Agenda final acknowledgement,
Mongo single-unlock's null-nextRunAt exception, duplicate unlock on partial retry,
early completion-permission revocation, startup error timing and captured HTTP
application isolation. Their regressions are retained. Admission has an original
independent deadline even after an early stop error; cleanup retries do not
extend that permission. No reviewed history was rewritten or dropped, no change
was applied then reverted, no dependency manifests/locks changed, and no push
was made.

## Coverage and diagnostic review

[coverage.md](coverage.md) maps every requested migrated group and lifecycle
boundary. [followup-sites.json](followup-sites.json) records reproducible matched
source coordinates and file hashes. This inventory is not a claim of independent
fault injection at every line. [r12-recheck.json](r12-recheck.json) records each
R12 commit's outcome, including audit retry/follow-up and redaction checks.

R12 bounded diagnostics retain operation/group context, fixed error class/code,
index/connectivity/permission/reconciliation guidance and maintenance counts/
duration. New drain diagnostics include handler, completion, enqueue and backend
operation counts. Native payloads, query values, causes and credentials are not
restored. Existing native-only gated record diagnostics and arbitrary private
hook callbacks remain outside this bounded staged-error certification.

C2's local-first rebuildable cache behavior and null-timestamp contract remain
unchanged. G-TX remains closed: Records/DeletedRecord, CAS/lifecycle/permanent
identity, U/authorization, Counter and attachment OID rebind stay Waterline/native
owned. ADR0003 remains accepted; this review adds no ORM or storage migration.

## Verification

All **77 commands passed** at clean `0341c6241`, using the retained repeatable
runner and committed inventory. Builds and consumers ran sequentially. The final
run had no failures and required no unchanged flaky retry.

| Verification | Result |
| --- | --- |
| Core/storage builds, root/core/storage lint, root/persistence/cache types, storage test compilation | Pass |
| Core suite | 4,285 passing; 117 pending |
| Storage suite and live storage | 291 passing/38 pending; live 329 passing |
| Figshare worker HTTP/Mongo controls | 57 passing per selector |
| Queue/storage ownership | 25 controls per selector; 5 failure/retry controls |
| Real Sails shutdown/native checkpoint | 4 controls: lower, SIGTERM, SIGINT, SIGUSR2 |
| Fresh stock Mocha | 419 passing; 10 pending |
| Fresh stock Bruno | 309 requests; 553/553 tests; 3/3 assertions |
| Both dev selectors, index deployment/preflight, TLS/SRV and selector edges | Pass |
| Creation budgets | 16 assertions across 24 samples |
| Existing-volume upgrade | 49 scopes/20 collections; all 6 sentinels preserved |

Pending optional/live cases are reported rather than counted as passing. Required
live suites run separately. The upgrade starts from the retained P4 runtime,
refuses service with missing indexes, and becomes HTTP-ready after documented
index preparation; it retains every sentinel digest.

The final checks confirm 41 manifests/locks match their starting hashes. The stock
Bruno wrapper restores its temporary environment and npm lock-name normalization.
Both fresh application containers and the Bruno CLI use npm 11.20.0; 16 critical
compiled artifacts match the host. All 630 source and 1,856 compiled files retain
their qualification hashes. Aggregate maps use SHA-256 over compact sorted-key
JSON mapping repository-relative paths to SHA-256. See [runtime.json](runtime.json).

The earlier partial `127595832` run found a deterministic diagnostic mismatch:
automatic startup draining hid the existing `startup failed` message. Trivial
`f96082066` preserves that diagnostic for outside callers without changing scoped
completion admission. All five ownership-failure controls passed afterward, then
the entire 76-command run passed at that checkpoint. Its fresh review then found
the real Sails teardown P2. After `0341c6241`, the complete 77-command run was
repeated with direct and signal shutdown controls.

The focused queue/HTTP/foundation/audit/Sails tests have 113 passing controls.
All required final typechecks pass, including the new Sails unit. An additional
strict queue/audit/foundation probe passed at `127595832`. Figshare worker/HTTP
controls have 57 passing cases per selector; the production build checks their
source. An additional strict probe of the legacy Figshare test file reported
existing nullability diagnostics outside the required typecheck target. Earlier
counterfactual probes load immutable committed source in memory. The
real Sails baseline controls ran against unchanged `f96082066` source/artifacts
before implementing the guard; no reviewed worktree source was reverted. The staged live
fixture has 36 passing controls, including accepted maintenance and unchanged
record metadata. Real queue ownership has 25 controls per selector, including
held final SQS acknowledgement and Mongo recovered-lock release.

No apparently flaky test occurred in the final run; no unchanged retry was needed. Preliminary
runs stopped for subsequently discovered defects are excluded from accepted
whole-run qualification. Deterministic test-setup corrections (type annotations,
valid fixture/import/clock setup and mandatory SQS receive checksum) are also
excluded; they are not classified as flaky product tests. No build overlaps a
consumer in an accepted run.

## Independent review and final state

### Standards

NO ISSUES FOUND — final independent P1/P2 pass at `0341c6241` against
`ef23e07fe`: 0 P1 and 0 P2.

### Spec

NO ISSUES FOUND — final independent P1/P2 pass at the same checkpoint and
baseline: 0 P1 and 0 P2. C2 null timestamps and closed G-TX boundaries remain
intact.

Both reviews started after the complete 77-command qualification. The parent
also repeated its feature pass after verification. Earlier findings, dispositions,
source checkpoints, review axes, report hashes and coordinates remain separate
in [review-axes.json](review-axes.json). No remaining P1/P2 was found.

Cleanup matches the initial sets exactly: 31 pre-existing stopped containers,
77 volumes and 10 networks; no owned additions or running containers remain.
All 10 tagged prior rollback images and the designated P4 upgrade runtime retain
their initial image IDs. The starting `dc77696de` remains an ancestor, with all
R1–R12 history retained. No push or history rewrite occurred, and no quota limit
was encountered. The evidence-only commit follows the frozen implementation
checkpoint; it adds no runtime changes. `SHA256SUMS` covers every evidence file
except itself.
