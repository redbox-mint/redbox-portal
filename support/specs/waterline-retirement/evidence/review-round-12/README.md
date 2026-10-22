# Programme review and fixes — Round 12

Input: clean `8584a2303`, branch `t3/waterline-retirement`; programme range
`441d87304^..HEAD`. Runtime qualification checkpoint: `73bb34656`.
Reviewed AGENTS.md, wiki coding standards, the programme design/plan/tasks,
ADR0003, per-group validation and prior rounds 1–11, including R9 coverage and
the R10/R11 repeatable runner. Separate standards/specification reviews and a
second review of the fixes supplement the direct whole-programme/error sweep.

## Issues and fixes

Locations identify the relevant operation; the commits retain exact diffs.

1. **P2 — storage startup re-exposed native failures after a bounded local log.**
   `packages/sails-hook-redbox-storage-mongo/src/persistence/WaterlineNativeStorage.ts:993` rethrew the original error to bootstrap;
   `createIndices` also JSON-serialized a native audit-index error. Native causes,
   error fields and payloads could therefore reach outer logs. **`2123ec7f0`**
   returns a controlled initialization error and logs only a fixed classification
   and safe integer native code. Operator guidance retains index/connectivity/
   permission remediation; controlled domain errors keep their own codes.
   Concurrent failure, one local log and retry behavior remain covered.
2. **P2 — accepted compound operations were refused again during cleanup.**
   Core `packages/redbox-core/src/persistence/storage/runtime.ts:83` replaced methods on their concrete owner, so
   `markDeleted`/`prepareMutations` hit external admission through internal calls.
   R's top-level `workflowForms` was untracked and its second read was refused.
   **`880f135b6`** publishes guarded facades, retains concrete internal calls and
   owns the complete workflow/form operation. Six real-Mongo cases fail against
   the original runtime modules; all **24 controls** pass after the fix, covering
   both selectors, durable rows/results and refusal/no write for late calls.
3. **P2 — accepted queue workers lost completion enqueues during shutdown.**
   `packages/redbox-core/src/services/AgendaQueueService.ts:105` refused completion audit/notification work once
   draining started. Figshare could then mark an audit closed after the enqueue
   rejection had been swallowed. **`bd336c6c9`** grants `now` admission only to an
   active configured/dynamic handler and awaits completion enqueues again after
   worker draining. External calls and descendants outliving their handler are
   refused. Production-mode IntegrationAuditService controls hold actual enqueue
   completion and verify shutdown waits.
4. **P2 — the retained attachment access-audit path disclosed native errors.**
   `packages/redbox-core/src/persistence/storage/WaterlineAttachmentRepository.ts:651` logged the native exception and
   rethrew it to the datastream caller, which logs failures again.
   **`666524fb0`** retains an explicit unknown-write failure and numeric operator
   code without forwarding native messages, documents or nested causes. Its
   list-action/no-counter-update behavior remains unchanged.
5. **P2 — the configured integration-audit worker completed before persistence.**
   `packages/redbox-core/src/services/IntegrationAuditService.ts:1028` returned void after launching
   `persistEntry`; its later notification enqueue had already lost worker
   admission. **`9e1493d25`** returns/awaits persistence and the security-event
   follow-up. The real queued handler's held storage write and notification
   enqueue now retain shutdown ownership. Existing best-effort failure handling
   remains; the regression fails before the fix.
6. **P2 — accepted RAiD retry workers lost delayed successors during shutdown.**
   `packages/redbox-core/src/services/AgendaQueueService.ts:649` guards delayed work.
   `RaidService` schedules a durable retry through `AgendaQueueService.schedule`,
   whose guard lacked the accepted-worker admission used by `now`.
   **`a0503fbe0`** applies the same active-handler rule to delayed schedules.
   A held retry enqueue keeps draining pending; external/detached schedules are
   still refused. The focused regression fails before the fix.
7. **P2 — retained record/integration audit methods disclosed errors/query values.**
   `packages/sails-hook-redbox-storage-mongo/src/persistence/WaterlineNativeStorage.ts:3712`
   audit appends serialized native errors and copied
   messages/causes into unsuccessful responses; reads logged criteria and could
   reject with native errors. **`63a8ddee2`** bounds the five staged audit methods'
   failure responses/rejections and removes criteria from verbose diagnostics.
   Success behavior, criteria, sorting, pagination and writes remain covered.
   An immutable-source in-memory probe shows native disclosure in all five
   methods and query logging in all three reads before; all disappear afterward.

Each fix has a separate successful build/typecheck record in
[fix-validation.json](fix-validation.json). No reviewed history was rewritten,
no runtime fix was changed and reverted, and no dependencies changed. A separate
test-only commit `73bb34656` updates two stock integration assertions to
the bounded error contract, retains ordering/no-write checks and adds nested-cause
non-disclosure coverage.

## R11 regression review and error sweep

- `09acabc00` retains compound-key order and embedded BSON equality-literal
  order. Its live controls still reject different bounds, collation strength,
  sparse/unique/TTL options and key/literal order, while equivalent field/operator
  dictionaries, including logical branches, remain ready.
- `857c2e8dc` retains bounded invalid-batch/no-progress diagnostics, duration,
  partial-write resumability and its original top-level maintenance failure.
  The nested-cause regression remains green; native details are not reinstated.
- [error-sites.json](error-sites.json) inventories **1198 matched sites in 107
  files** using logger/console/throw/cause searches over every core persistence
  module and the entire storage-hook source, plus migration/bootstrap/CLI,
  changed consumers, byte/session/queue owners and actual audit/RAiD callers.
  This is a source-site inventory, not a claim that every matched line received
  independent fault injection.
- Reviewed boundaries include M/R/Q/J1/J2/J3/J4 error translators, both cache
  adapters and cache validation/duplicate/operation errors; preflight and
  scoped inspect/ensure; configuration/URL/auth/TLS resolution; initializer,
  cleanup/drain and maintenance rethrows; bootstrap/Umzug and Pino serializers;
  `persistence:indexes`; attachment/schema/audit operations; workspace, SIEM,
  Figshare, Agenda and integration-audit worker paths; sessions/GridFS/legacy-logo
  owner cleanup. The retained **138 error-dispatch controls** are rerun, with new
  startup/audit nested-cause and response/query checks.
- Existing gated record/authorization/lifecycle/identity diagnostics and legacy
  binary error identity were traced but not redesigned. Original legacy record
  verbose/query logging is not certified as payload-free by this review.
  Arbitrary private-hook/module diagnostics remain outside public-fixture
  qualification. A method-body comparison confirms **156 of 164** existing
  retained storage/attachment methods are unchanged; the eight changed bodies
  are exactly startup/index diagnostics and staged audit methods. Cache duplicate
  causes retain the established internal
  classification contract and are bounded at the CacheService, bootstrap and
  Pino log boundaries; the retained duplicate/API regressions remain enabled.

## Validation

All **75 accepted commands pass** at clean `73bb34656`.
A turn interruption divides this into 30 completed commands and a 45-command
resumption using the runner's supported `--only` selector. The resumption exits
zero; the interrupted process has no successful whole-run exit claimed. The
same source/artifact hashes and exact toolchain apply to both segments.

- Core/storage builds, root/core/storage lint, root/persistence/cache typechecks
  and storage test compilation: **PASS**.
- `npm run test:core`: **4,257 passing / 116 pending**.
  Storage: **291 passing / 38 pending**;
  enabled live storage: **329 passing**.
- All retained persistence fixtures pass. New accepted-drain controls: **24**;
  retained error-boundary controls: **138**. R11 revision-backfill and live
  partial-index/key/literal-order regressions remain enabled and green.
- Fresh-volume `npm run test:mocha`: **419 passing / 10 pending**.
- Fresh-volume `npm run test:bruno:general`: **309/309 requests, 553/553 tests,
  3/3 assertions**, all successful. Both portal containers report Node 26.10.0 /
  npm 11.20.0; the actual Bruno CLI also reports npm 11.20.0. All six changed
  compiled modules in each portal container match the recorded host artifacts.
- Development readiness with promoted defaults and all explicit Waterline
  overrides: **PASS**. HTTP/session/GridFS: **70 passing**.
  Live index upgrades, selector edges and authenticated TLS/SRV/TXT: **PASS**.
- [Create budgets](create-budget.json): **16 assertions / 24 workers** pass,
  with zero failures. MongoDB/Waterline p95 ratios: R **0.761**, Q **0.842**, J1 **0.731**, J2 **0.669**.
- [Existing-volume upgrade](existing-volume-upgrade.json): fail-fast **6,659 ms**,
  no HTTP before explicit index preparation; ensure and inspection are ready
  with **49 scopes / 20 collections**, then HTTP **200**.
  All **6 BSON sentinels** remain unchanged.

[verification.json](verification.json) records all accepted commands, exact exit
codes, durations, counts and raw-log SHA256. The runner remains sequential;
compiled artifacts are never rebuilt alongside their consumers. Raw logs and
synthetic payloads remain ignored under `.tmp/review-round-12/`.
[runtime.json](runtime.json) records source/artifact hashes, actual stock
container toolchains/artifact matches, unchanged manifests/locks and retained
owner comparisons.

## Attempts, boundaries and cleanup

The initial supplied-HEAD run passes its completed static, core/storage and
initial persistence cases, including all 15 migration cases. It is stopped at
a command boundary before applying fixes; it is not represented as a completed
whole-run qualification. A second partial run is stopped before the later audit
fixes, with its completed checks retained as preliminary only. The first full
post-fix attempt reaches fresh Mocha: 417 passing, 10 pending and two failures
from old native-message assertions. Fresh Bruno passes all 309 requests, 553
tests and three assertions. After correcting those test expectations without
changing runtime, the complete 75-command inventory is rerun at the final clean
test-fix commit; the earlier attempt is not accepted as qualification. A subsequent
attempt hits the unchanged 30-second worker-start deadline in the built pre-P2
rollback image (14 migration cases pass, one times out). The active cache
transition finishes all 17 cases and cleans up before the parent is terminated.
The exact migration command is replayed without any code/configuration/budget
change, followed by the complete inventory again. These attempts are not merged
into a claimed successful whole run. The final run is interrupted during SIEM
after 30 successful commands. Its process group ends and leaves one owned
MongoDB container, which is explicitly removed. The remaining 45 commands are
resumed through the runner’s supported `--only` selection at the same clean
commit, with identical source/artifact hashes and no rebuild. Acceptance comprises
75 successful commands across these two segments; no uninterrupted 75-command
process exit is claimed.

[attempts.json](attempts.json) also records one intermediate guard type error,
fixture setup corrections (reuse one loaded Sails instance; use a valid bounded
attachment ID), and isolated audit-probe imports exceeding the unchanged
2-second Mocha hook deadline. No timeout, skip, assertion or budget is relaxed.
The final full suites retain their original settings. Original-source probes
load immutable git content in memory; they never overwrite tracked code.

No qualifying defect is deliberately left unfixed in the delivered scope.
G-TX stays CLOSED / OPS-TX-01 undecided. ADR0003 remains accepted. P6, P7/U,
P8/V, P9/B, atomic S/P10.4 and P11/P12 remain gated. Record/DeletedRecord,
CAS/lifecycle, permanent identity, authorization/U, Counter and attachment OID
rebind keep their existing owners. C2's intentional legacy null-timestamp
contract is preserved. No arbitrary-clock-skew, private-institution or official
release qualification is claimed. These are deliberate scope boundaries.

All owned containers, networks and volumes are removed; unrelated containers
are left alone. Rollback images and the pre-programme image retain their recorded
IDs; see [cleanup.json](cleanup.json). No push is performed and no quota/usage
limit is encountered. Dependency manifests and locks remain byte-identical to
the supplied HEAD. The evidence commit contains documentation and JSON only.
