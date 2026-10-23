# Programme review and fixes — Round 16

Input: clean `ebb1e6165`, branch `t3/waterline-retirement`; merge-base
`ef23e07fe`. Read R15 and R14 README/coverage first. Runtime fixes:
`1d6666614`, `c323055d8`; frozen qualification checkpoint: **`c323055d8`**.

## Findings and fixes

Two P2 defects were reproduced and fixed. No P1 was found.

1. **Ended SQS state-save receipts retained payloads until shutdown.** R15's
   per-receipt map retained each delivery when an initial visibility save or
   final deletion failed with a confirmed ended-receipt error. Repeated delivery
   of one envelope therefore accumulated historical payloads. Three actual
   Agenda/repository/AWS SDK controls each reproduce sixteen stale 15KB payloads.
   **`1d6666614`** applies R14's existing terminal-receipt classification to
   rejected state saves, removes only the captured matching entry and rethrows
   the original error. AccessDenied remains owned and releasable. No Mongo
   ownership predicate or completion permission changes.
2. **An older Mongo release forgot a later same-ID claim.** An old prefetched
   claim's fenced release can apply while its acknowledgement is held. An
   already-admitted query then claims the same document; its release fails.
   The older acknowledgement unconditionally deleted the replacement map entry,
   allowing cleanup to close the backend with the newer lock still persisted.
   Origin: branch commit `127595832c`. **`c323055d8`** deletes only when the map
   entry still equals the captured fence array. The newer entry survives for
   existing cleanup retry; database fencing, timers and lease arithmetic stay
   unchanged. Both a retained real-Agenda regression and a real MongoDB/Agenda
   backend probe fail before the fix. Afterward the backend remains owned, the
   retry releases the actual newer lock and closes once: four release attempts,
   zero handler executions.

[issues.json](issues.json), [fix-validation.json](fix-validation.json) and
[mongo-late-claim.json](mongo-late-claim.json) retain scenarios, origins,
red/green counts, commands and raw-log hashes. No speculative concern or
pre-existing master behavior was promoted to a finding.

## Review and scope

The initial independent standards/spec passes found the same SQS defect. Their
first follow-up passes at `1d6666614` returned no issues; the parent subsequently
falsified the separate Mongo release ordering. Fresh qualification passes at
`c323055d8`, supplied both findings and fixes, each report **NO ISSUES FOUND**.
[review-axes.json](review-axes.json) preserves all six passes separately with
task IDs, checkpoints, model/options and report hashes.

[coverage.md](coverage.md) maps the whole-feature pass against `ef23e07fe` and
the executable controls. ADR0003 remains official-driver/no-ORM. C2 retired-Prisma
refusal and its intentional legacy-null timestamp contract remain intact.
G-TX stays CLOSED: Records/DeletedRecord, CAS/lifecycle/permanent identity,
U/authorization, Counter and attachment OID rebind retain their Waterline/native
owners. P10 promotes only the staged subset. R14's pre-existing cache/TTL/
find-create and RDMP counter behavior remains unchanged.

## Verification

All **77 required inventory entries pass in one complete runner invocation,
exit 0**, at frozen `c323055d8`, using the retained `d73b89047` runner and npm
**11.20.0**. No apparently flaky test occurred and no unchanged flaky retry was
needed. [verification.json](verification.json) records every accepted result.

- Core/storage builds, root/core/storage lint and required root/persistence/
  cache/storage typechecks: pass.
- Core: **4,303 passing / 117 pending**. Storage: **291 passing / 38 pending**;
  separately enabled live storage: **329 passing**.
- Figshare worker/HTTP: **57 per selector**. Live ownership: **25 per selector**;
  failure/retry: **5**; real Sails lower/signals: **4**.
- Fresh stock Mocha: **419 passing / 10 pending**. Fresh stock Bruno:
  **309/309 requests, 553/553 tests, 3/3 assertions**, first attempt.
- Both development selectors, index deployment/upgrade/preflight, TLS/SRV and
  selector-edge controls: pass.
- Creation budgets: **16 assertions / 24 samples**, zero failures.
- Existing-volume upgrade: **49 scopes / 20 collections** ready after explicit
  preparation, all **six sentinels** preserved. Before preparation it refuses
  HTTP and fails fast in **6,685 ms**; afterward HTTP is **200**.

Supplemental strict compilation and **115 focused controls** pass. A compiled
SQS lifetime probe runs 256 historical deliveries of one envelope: 128 Job.run
completions (including 64 ended final saves) and 128 explicit unlocks. No
historical receipt remains; shutdown releases only the final active receipt.
Actual default worker/HTTP drains return after **30,007 / 30,001 ms**, retain
resources, refuse late admission, call back once per attempt and finish cleanup
on retry. The HTTP response already returned 200. Request/app/descendant scope
controls pass. See [supplemental.json](supplemental.json).

These supplemental probes and the complete inventory use identical source and
compiled artifacts, including the repeated static build: **630 runtime sources /
1,856 compiled files**. Both fresh portals report Node **26.10.0** / npm
**11.20.0**; the Bruno CLI also verifies npm **11.20.0**. All **16 critical
artifacts** match the host in each portal. All **39 tracked manifests/locks**
retain their starting hashes. [runtime.json](runtime.json) records these checks;
map hashes use compact sorted-key path-to-SHA256 JSON.

## Attempts and cleanup

Two preliminary runs are excluded from acceptance: static work stopped before
the SQS fix, then 67 completed inventory entries plus fresh Mocha at
`1d6666614`, stopped after the later Mongo reproduction. Neither is represented
as qualification of the final runtime. Intentional red probes and deterministic
draft-probe corrections are recorded separately: a syntax correction before the
first valid late-claim probe, and early observation of the live fixture's
expected cleanup rejection while its observer read awaited. Runtime and
assertions were unchanged for that fixture correction. No reviewed assertion,
timeout, skip, healthcheck or budget was relaxed. See [attempts.json](attempts.json).

Resource sets exactly match the starting **31 containers, 77 volumes and
10 networks**; no running containers or owned additions remain. All **11 prior/
P4 image tags** retain their original IDs, including
`redbox-p10-s:prior-12e566575`. [cleanup.json](cleanup.json) records preservation;
budget and existing-volume summaries are retained separately.

The input remains ancestral, retaining all R1–R15 history. No history rewrite,
dependency change or push occurred. No quota limit was encountered. Raw logs and
one-off probes remain ignored under `.tmp/review-round-16/`; committed evidence
contains structured summaries, counts and SHA256, with no raw transcripts or
patches. The evidence-only commit follows qualification. `SHA256SUMS` covers
every other evidence file.
