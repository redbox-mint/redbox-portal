# Programme review and fixes — Round 14

Input: clean `4df2d44fd`, branch `t3/waterline-retirement`; comparison baseline
`ef23e07fe`. Read R13 and R12 evidence first. Runtime fixes are frozen at
`2ad89fd80`; final test typing checkpoint is `1f84a1cc0`.

## Findings and fixes

Two unique P2 defects were reproduced and fixed. No P1 was found.

1. **Optional SIEM work blocked successful HTTP responses.** R13's `60c59ed7c`
   awaited security lookup/enqueue after the primary record/attachment audit
   write. A held lookup or capture queue request therefore withheld attachment
   download/list responses even when their storage was healthy. **`67220e557`**
   retains the explicit follow-up promise in the existing app-local HTTP request
   lifetime while allowing the primary response to finish. Workers/direct callers
   retain their awaited completion. No independent completion permission is added;
   the existing queue deadline and application scope still apply. Three real HTTP
   controls fail before the fix; afterward those three plus six worker
   success/failure controls pass.
2. **Expired SQS receipts permanently poisoned cleanup retries.** R13's retained
   claim release kept retrying an unusable receipt after `MessageNotInflight` or
   `ReceiptHandleIsInvalid`, so the Sails shutdown guard refused every retry even
   after actual work finished. **`2ad89fd80`** treats only these confirmed ended
   receipts as relinquished ownership, with a fixed bounded warning. Other
   failures remain owned and retryable. Two real Agenda/repository/AWS SDK
   local-protocol controls fail before the fix and pass afterward, proving one
   release attempt and no stale reuse. These are documented
   [ChangeMessageVisibility errors](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ChangeMessageVisibility.html).

[issues.json](issues.json) records scenarios, input coordinates, contracts and
commits. [fix-validation.json](fix-validation.json) retains red/green commands,
counts and raw-log hashes. No assertion, timeout, skip or budget was relaxed.

## Lifecycle and proportionality review

The Mongo timestamp plus unique-owner predicate remains intact. Retained live
controls verify recovered null-next-run jobs become runnable, persisted future
retry dates survive, applied-release reply loss preserves an equal-timestamp
successor, and acknowledged/ambiguous heartbeat saves remain releasable. No new
Mongo fencing machinery was added.

The actual default drain returns after **30,003 ms**, preserves resources while
the worker is held, refuses its completion enqueue after the deadline, and
finishes cleanup on retry after release. Each attempt calls its callback once.
Existing request/worker, cross-app, detached-descendant, early unlock failure,
startup and prior-hook deadline controls remain enabled. R14 reuses request
ownership; it adds no broader admission mechanism. Figshare heartbeat intervals,
durations, owner/expiry predicates and renewal arithmetic are unchanged; R13's
await-before-release ownership remains covered under both selectors.

[coverage.md](coverage.md) maps the requested concerns and lists pre-existing
master behavior explicitly as not fixed. G-TX remains CLOSED: Records/DeletedRecord,
CAS/lifecycle/permanent identity, U/authorization, Counter and attachment OID
rebind retain their Waterline/native owners. P10 changes only the staged subset.
ADR0003 and C2 driver/retired-Prisma/null-timestamp contracts remain intact.

## Verification

All **77 required commands passed**, sequentially, using the retained runner
introduced in `d73b89047` and its committed inventory, with npm **11.20.0**.

| Check | Result |
| --- | --- |
| Builds, lint, required root/core/storage/cache/persistence types | Pass |
| Core | 4,290 passing / 117 pending |
| Storage; enabled live storage | 291 passing / 38 pending; 329 passing |
| Figshare worker/HTTP | 57 passing per selector |
| Queue/storage ownership; failures/retry; real Sails shutdown/signals | 25 per selector; 5 controls; 4 controls |
| Fresh stock Mocha | 419 passing / 10 pending |
| Fresh stock Bruno | 309/309 requests; 553/553 tests; 3/3 assertions |
| Both dev selectors, index deployment/upgrade/preflight, TLS/SRV, selector edges | Pass |
| Creation budgets | 16 assertions / 24 samples; zero failures |
| Existing-volume upgrade | 49 scopes / 20 collections; all 6 sentinels preserved |

The existing-volume upgrade refuses HTTP before explicit index preparation,
then becomes HTTP 200 ready. Its retained P4 image and sentinel digest are recorded
in [existing-volume-upgrade.json](existing-volume-upgrade.json). Budget summaries
are in [create-budget.json](create-budget.json). Pending optional tests are reported
separately; the required live suite runs independently.

The runner captures its clean starting HEAD `2ad89fd80` once. During cross-group
checks, test-only `4bd1aea7a` supplies required explicit `undefined` arguments in
the new SDK fixture. Afterward, supplemental strict compilation found one missing
HTTP fixture callback annotation; test-only `1f84a1cc0` fixes it. Final strict test
compilation and all **102 focused controls pass** at that checkpoint. These two
changes alter only test call typing; all **630 runtime source and 1,856 compiled
file hashes remain identical** throughout qualification. No uninterrupted
77-command run at the later test-only HEAD is claimed. The complete mandatory
run passes with one runner exit zero; no test assertions or runtime code changed
during it. [verification.json](verification.json), [supplemental.json](supplemental.json)
and [attempts.json](attempts.json) distinguish these checkpoints and attempts.

No apparently flaky test occurred; no unchanged flaky retry was needed. The
intentional red probes and deterministic fixture typing correction are recorded
separately. An early read-only container capture found the portal had not yet
started; its later capture succeeded. Both fresh portals report Node 26.10.0 /
npm 11.20.0, the Bruno CLI reports npm 11.20.0, and 16 critical compiled artifacts
in each portal match the host. All **39 tracked manifests/locks** retain their
starting hashes. See [runtime.json](runtime.json); map hashes use SHA-256 over
compact sorted-key JSON of repository-relative paths to SHA-256.

## Final review and cleanup

### Standards

NO ISSUES FOUND — fresh independent whole-feature P1/P2 pass.

### Spec

NO ISSUES FOUND — fresh independent whole-feature P1/P2 pass.

Both final passes started after the full 77-command qualification and compare the
feature against `ef23e07fe`. Runtime sources remain frozen at `2ad89fd80` through
the final test typing checkpoint. The parent also rechecked the lifecycle/fix
boundaries and source/build hashes. [review-axes.json](review-axes.json) retains
separate axes, task IDs, checkpoints, original finding dispositions and report
hashes. No remaining P1/P2 was found.

Cleanup matches the initial resource sets exactly: **31 pre-existing stopped
containers, 77 volumes and 10 networks**; no owned additions or running containers
remain. All **11 prior/P4-runtime image tags** retain their starting image IDs,
including `redbox-p10-s:prior-12e566575`. See [cleanup.json](cleanup.json).

The input remains an ancestor, retaining all reviewed R1–R13 history. No history
rewrite, change-then-revert, dependency change or push occurred. No quota limit
was encountered. Raw logs and one-off probe material remain ignored under
`.tmp/review-round-14/`; committed evidence contains summaries, counts and hashes.
The final evidence-only commit follows the implementation/test checkpoints.
`SHA256SUMS` covers every evidence file except itself.
