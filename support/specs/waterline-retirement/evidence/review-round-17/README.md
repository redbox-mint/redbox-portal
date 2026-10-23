# Programme review and fixes — Round 17

Input: clean `2cdb5442d`, branch `t3/waterline-retirement`; merge-base
`ef23e07fe`. Fixes: **`a23b7cbe4`**, **`3691a3d73`**. Frozen qualification:
**`3691a3d73`**. Read R16, R15 and R14 README/coverage first.

## Findings and holistic design correction

Two input P2 defects were reproduced against actual MongoDB/Agenda. No P1 was
found, and the fresh remaining-feature pass found no additional P1/P2.

1. **An older Mongo delivery unlocked its newer same-ID owner.** The ID-keyed
   map addressed the replacement claim when the old delivery requested unlock.
   The live control removes the newer lock on the input; equal-timestamp
   deliveries are included in the retained regression.
2. **An older heartbeat acknowledgement forgot a newer ambiguous renewal.**
   A applies with its response held; B applies and rejects as reply lost; A then
   acknowledges. The input replaces the possible-fence array with A, and cleanup
   succeeds while B's owned lock remains persisted. Repeated failed renewals
   additionally retain one attributes snapshot/payload reference per attempt:
   128 failed renewals cause **129 releases**, versus **one** after simplification.
   This corroborates the design problem; it is not counted as a third issue.

The forward design uses **one compact record per backend delivery**, serializes
its state/user saves and release, and provides **one release path** for single,
bulk, late-acquisition and drain release. Mongo's existing lastModifiedBy field
carries a fresh per-acquisition owner, so acknowledged/ambiguous heartbeat
outcomes need no timestamp candidate history. State writes and release match
that owner. SQS retains its job-ID/receipt key and existing terminal-receipt
classification. Records retain no job data payload.

The integration audit of the first implementation also reproduced a handler
Job.save regression: the pinned library replaced the new owner and prevented
final completion metadata. **`3691a3d73`** corrects this forward with a fenced
user/scheduling update that preserves lock/owner and processor fields. Ended or
stale Mongo delivery objects cannot fall back to an unfenced user save. Unclaimed
creation/scheduling and SQS enqueue-copy behavior retain their existing paths.
The first partial qualification is excluded; final qualification starts clean
after this correction.

[Ownership state machine](ownership-state-machine.md) records states,
transitions, invariants and enforcing code. [Transition pairs](transition-pairs.json)
explicitly reviews **12×12 pairs per backend, 288 total**, including handler
Job.save. Pair enumeration is exhaustive source inspection with named executable
witnesses, **not 288 independently executed live interleavings**.
[Issues](issues.json) and [red/green validation](fix-validation.json) retain
origins, concrete scenarios, counts, commands and SHA256.

## Verification

All **77 required inventory entries pass in one complete runner invocation, exit 0**, at frozen `3691a3d73`, using the retained `d73b89047` runner and npm **11.20.0**. No apparently flaky test occurred; no unchanged flaky retry was needed.
[verification.json](verification.json) records every accepted inventory entry.

- Core/storage builds, root/core/storage lint, required root/persistence/cache
  typechecks and storage test compilation: pass.
- Core: **4,304 passing / 117 pending**. Storage: **291 passing / 38 pending**;
  separately enabled live storage: **329 passing**.
- Figshare worker/HTTP: **57 per selector**. Live queue/storage ownership:
  **25 per selector**; failure/retry: **5**; real Sails lower/signals: **4**.
- Fresh stock Mocha: **419 passing / 10 pending**. Fresh stock Bruno:
  **309/309 requests, 553/553 tests, 3/3 assertions**.
- Both dev selectors, index deployment/upgrade/preflight, TLS/SRV and selector
  edges: pass. Creation budgets: **16 assertions / 24 samples**, zero failures.
- Existing-volume upgrade: **49 scopes / 20 collections** ready after explicit
  preparation; all **six sentinels** preserved. Before preparation HTTP is
  refused; afterward it is **200**. [Upgrade evidence](existing-volume-upgrade.json)
  and [budget evidence](create-budget.json) retain compact measurements.

Supplemental strict compilation, **116 focused controls** and **eight live
Mongo/Agenda scenarios** pass at the same checkpoint. These cover older/equal-
timestamp delivery release, overlapping ambiguous renewals, 128 failed renewals,
stale/ended saves, applied completion reply loss, persisted future retry reply
loss, refused final save and handler Job.save. Three baseline replays fail as
expected, loading only the exact input AgendaQueueService source in memory;
worktree source/history is never reversed.

The real SQS SDK lifetime probe processes **256 historical deliveries** and
leaves only the final active receipt for shutdown. Request/app/descendant scope
controls pass. Actual default worker and HTTP drains return after
**30,005 / 30,000 ms**, retain resources, refuse late
completion enqueue, call back once per attempt and complete cleanup on retry.
The HTTP response already returned **200**. See [supplemental.json](supplemental.json).

All **630 runtime sources / 1856 compiled files** remain identical
through final qualification and supplemental probes. Only AgendaQueueService's
source, compiled JS and declaration map differ from input. All **39 tracked
manifests/locks** retain their starting hashes. Both fresh portals and the Bruno
CLI report npm **11.20.0**, and all **16 critical artifacts** in each portal
match the host. [runtime.json](runtime.json) records Node/npm, artifact/source
map hashes and captures; map hashes use compact sorted-key path-to-SHA256 JSON.

## Scope, attempts and cleanup

[coverage.md](coverage.md) maps the fresh P1/P2 pass against `ef23e07fe`, including
foundation/config/index, codec/mapping/query/tenant, Q/J consumers, staged storage,
GridFS and shutdown boundaries. ADR0003 remains official-driver/no-ORM. C2's
explicit retired-Prisma failure and intentional legacy-null timestamp contract
are intact. G-TX stays CLOSED: Records/DeletedRecord, CAS/lifecycle/permanent
identity, U/authorization, Counter and attachment OID rebind keep their
Waterline/native owners. P10 promotes only staged operations.

The preliminary run at `a23b7cbe4` completed **26 entries with zero failures**
before the handler-save compatibility reproduction; it is excluded from final
acceptance. Deliberate red controls and deterministic fixture/type/lint/loader
corrections are distinguished from flaky retries in [attempts.json](attempts.json).
No reviewed assertion, timeout, skip, healthcheck or budget was relaxed.

Resource sets exactly match the starting **31 containers, 77 volumes and
10 networks**; no running containers or owned additions remain. All **11 prior/
P4 image tags** retain their original IDs, including
`redbox-p10-s:prior-12e566575`. See [cleanup.json](cleanup.json).

The input remains ancestral, retaining all R1–R16 history. No history rewrite,
dependency change or push occurred. No quota limit was encountered. Raw logs and
one-off probes remain ignored under `.tmp/review-round-17/`; committed evidence
contains structured summaries, counts and SHA256, with no raw transcripts or
patches. The evidence-only commit follows qualification. `SHA256SUMS` covers
every other evidence file.
