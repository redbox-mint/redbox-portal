# Programme review and fixes — Round 15

Input: clean `dcf7d7ad7`, branch `t3/waterline-retirement`; merge-base
`ef23e07fe`. Read R14 README/coverage, then R13 README and R10–R12 coverage in
their READMEs. Runtime fix: `73f9afb7c`; qualification checkpoint: `5de68b600`.

## Finding and fix

One P2 was reproduced and fixed; no P1 was found.

**SQS redelivery conflated distinct receipt owners.** R13's ownership map used
only the envelope/job ID. Two receives with the same job ID and different
receipts therefore overwrote ownership. An older unlock released the newer
receipt; an older real `Job.run` completion could instead delete the newer
prefetched claim from tracking, losing its shutdown release/retry.
[AWS documents a distinct receipt per receive and possible successful deletion
with an old receipt without deleting the message](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html).

**`73f9afb7c`** keys SQS claims by job ID and receipt, while retaining Mongo's
existing ID/timestamp/owner path. ID-only bulk unlocks enumerate matching
retained claims. No new Mongo fencing protocol or retry mechanism is added.
R14's `MessageNotInflight`/`ReceiptHandleIsInvalid` classification is unchanged
and applies only to the particular expired receipt. Other release errors remain
owned and retryable.

Two retained tests use actual Agenda, the SQS repository and AWS SDK against a
local AWS JSON protocol endpoint. Both fail before the fix and pass after it.
They also require AccessDenied on the newer receipt to refuse shutdown, then
retry that same receipt successfully. [issues.json](issues.json) records the
scenario, origin, scope and fix; [fix-validation.json](fix-validation.json)
records red/green counts and raw-log hashes.

## R14 fix review and scope

The HTTP follow-up still uses the existing app-local request lifetime and
completion deadline. **`5de68b600`** expands its real HTTP tests across record
and both attachment producers: success, lookup rejection and enqueue rejection.
The response completes before held optional work; shutdown retains it; failures
produce the expected bounded diagnostic and do not change the response. Existing
worker/direct completion remains awaited. All **110 focused controls** and their
strict typecheck pass at the qualification checkpoint.

Supplemental probes exercise overlapping same-app requests, a different app and
completed-request descendants through the actual follow-up API. Ownership stays
independent. Actual default-deadline probes return after **30,006 ms** for a held
worker and **30,001 ms** for a held HTTP follow-up. Both retain resources, refuse
late completion admission, call back once per attempt and finish cleanup on
retry. The HTTP response has already returned 200; its refused late enqueue is
logged. See [supplemental.json](supplemental.json).

[coverage.md](coverage.md) maps the critical fixes and the fresh whole-feature
P1/P2 pass, including less recently emphasised codec/query/mapping/configuration
and consumer boundaries. Separate initial standards/spec passes found no issues;
the parent found the receipt-identity defect. Both final passes include that
finding/fix and report **NO ISSUES FOUND**. Task IDs/checkpoints are retained
separately in [review-axes.json](review-axes.json).

ADR0003 remains official-driver/no-ORM. C2 retired-Prisma refusal and the
intentional legacy-null timestamp contract remain intact. G-TX stays CLOSED:
Records/DeletedRecord, CAS/lifecycle/permanent identity, U/authorization, Counter
and attachment OID rebind remain Waterline/native-owned. P10 promotes only the
staged subset. The pre-existing master cache/TTL/find-create and RDMP counter
behaviors listed by R14 remain unchanged.

## Verification and attempts

All **77 required inventory entries pass at frozen `5de68b600` after one unchanged
fresh Bruno retry**, using the retained `d73b89047` runner and npm **11.20.0**.
The complete inventory run exits **1**, solely for the first Bruno attempt; the
single-entry retry exits **0**. No uninterrupted 77-command zero-exit run is
claimed. [verification.json](verification.json) identifies the accepted results;
[attempts.json](attempts.json) preserves both Bruno attempts.

- Core/storage builds, root/core/storage lint, root/persistence/cache types and
  storage test compilation: pass.
- Core: **4,298 passing / 117 pending**. Storage: **291 passing / 38 pending**;
  enabled live storage: **329 passing**.
- Figshare worker/HTTP: **57 per selector**. Live queue/storage ownership:
  **25 per selector**; failure/retry: **5**; real Sails lower/signals: **4**.
- Fresh stock Mocha: **419 passing / 10 pending**.
- Fresh stock Bruno retry: **309/309 requests, 553/553 tests, 3/3 assertions**.
- Both development selectors, index deployment/upgrade/preflight, TLS/SRV and
  selector-edge checks: pass.
- Creation budgets: **16 assertions / 24 samples**, zero failures.
- Existing-volume upgrade: **49 scopes / 20 collections** ready after explicit
  preparation; all **six sentinels** preserved. Before preparation it refuses
  HTTP and fails fast in **6,648 ms**; afterward it serves HTTP **200**.

The first fresh Bruno run received HTTP 413 for the regular-font upload rather
than 200, and bailed after 52 passing requests, one failure and 256 skipped;
91/92 tests and 1/1 assertion passed. The **21,884-byte** fixture still matches
the commit. Exactly one fresh retry, with unchanged source/builds/manifests,
fixtures, assertions and limits, passes completely. Its cause is not established;
no load attribution or product fix is inferred. The failed attempt is excluded
from accepted coverage.

The preliminary runner was stopped before fixing the reproduced receipt issue;
its incomplete results are excluded. Expected red probes and deterministic
in-progress implementation/new-fixture corrections are recorded separately.
They are not labelled flaky retries. No reviewed assertion, timeout, healthcheck,
skip or budget was relaxed.

Both fresh portals and the retry report Node **26.10.0** / npm **11.20.0**;
Bruno CLI npm is also verified in both attempts. All **16 critical artifacts**
match the host in each capture. All **630 runtime source and 1,856 compiled file
hashes** remain identical throughout final qualification. All **39 tracked
manifests/locks** retain their starting hashes. [runtime.json](runtime.json)
records these checks; map hashes use compact sorted-key path-to-SHA256 JSON.
Budget and upgrade summaries are retained separately without raw payload logs.

## Cleanup and history

Resource sets exactly match the starting **31 stopped containers, 77 volumes and
10 networks**; no running containers or owned additions remain. All **11 prior/P4
image tags** retain their original image IDs, including
`redbox-p10-s:prior-12e566575`. See [cleanup.json](cleanup.json).

All R1–R14 history remains ancestral. No history rewrite, reviewed-fix reversal,
dependency change or push occurred. No quota limit was encountered. Raw logs and
one-off probes remain ignored under `.tmp/review-round-15/`. Committed evidence
contains structured summaries, counts and SHA256; `SHA256SUMS` covers every
other evidence file. The final evidence-only commit follows qualification.
