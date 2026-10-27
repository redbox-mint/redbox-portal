# Programme review and fixes — Round 11

Review input: clean `80a5546981d58c63d62e96dd2dd5fc8e4f1df9ec`,
`t3/waterline-retirement`; programme range `441d87304^..HEAD`.
Reviewed the repository instructions/wiki standards, programme design/plan/tasks,
ADR0003, group validation and rounds 1–10, including R9 coverage and R10's runner.
Severity is limited to P1/P2 and clearly incorrect P3 behavior.

## Issues and fixes

1. **P2 — revision maintenance disclosed native payloads through error causes.**
   `packages/sails-hook-redbox-storage-mongo/src/persistence/recordRevisionBackfill.ts:152`
   logged a bounded code but attached the original driver error as `Error.cause`.
   Bootstrap/Umzug logging subsequently inspected that cause, exposing native
   messages/fields despite the safe local log. The shared engine inherited this
   behavior from the older maintenance implementation; the promoted MongoDB
   maintenance entrypoint also exposed it. **Fixed `857c2e8dc`**: retain a fresh
   bounded diagnostic cause, including the existing no-progress/invalid-batch
   diagnostics. Native messages, codes, payloads and nested causes are discarded.
   The strengthened partial-write/resume regression fails before the fix and
   passes after it. Batch queries, mutations, resumability and public top-level
   failure message remain intact.
2. **P3 — equivalent partial-filter operator order caused false index conflicts.**
   `packages/redbox-core/src/persistence/indexes.ts:30` normalized only the outer
   field dictionary. A valid exported `PersistenceIndex` descriptor with
   `score: {$gte: 1, $lte: 10}` rejected the same existing predicate declared in
   reverse operator order, including inside `$and`. This blocks supported scoped
   inspect/ensure behavior. Shipped descriptors currently use simpler predicates;
   no claim is made that this range variant blocked stock portal startup.
   **Fixed `09acabc00`**: canonicalize predicate fields and operator dictionaries,
   including logical branches, while retaining BSON equality literals and
   compound index-key order. Two live before-fix failures become zero across
   **20 index controls**. Collation strength, unique, sparse, TTL, changed bounds,
   compound key order and equality-literal order remain significant.

Each fix has its own build/typecheck result in `fix-validation.json`.
`9a3f371c3` retains the broader review controls. `3d24e991a` makes the
fresh Bruno runner assert npm 11.20.0 in its CLI container before the unchanged
stock test script; application Compose files remain unchanged.
No reviewed history was rewritten and no production change was reverted.

## Fresh review coverage

- **Error mapping:** 138 fault-injection checks cover 46 concrete operations in
  M/R/Q/J1/J2/J3/J4/C2. Native validation, failed write-concern acknowledgment and
  transient network errors produce bounded API/log diagnostics and exactly one
  adapter dispatch. S's existing live attachment/schema/audit failure controls
  and the strengthened maintenance test cover its separate boundaries. The R10
  cache error tests remain unchanged; duplicate-log redaction and C2's intentional
  legacy null-timestamp behavior remain covered.
- **Mixed writers and clocks:** the retained contracts exercise independent
  Waterline/MongoDB writers against the same collections, counter/CAS/claim races,
  restart and selector rollback. The new two-process Q fixture adds **29 checks**
  with caller clocks two minutes apart, both selector directions, displaced-owner
  renew/token/release refusals and rollback/forward while a successor owns the
  lease. Q/J3/J4 continue sharing their native predicates. Clock-dependent expiry
  and external effects retain the baseline contract; these tests do not prove
  exclusion of external effects under arbitrary clock skew.
- **Retries/unknown outcomes:** repository wrappers add no replay of failed writes.
  The installed official driver's retry eligibility/session transaction-number
  handling was inspected in `mongodb/src/operations/execute_operation.ts` and
  `mongodb/src/utils.ts`; standalone writes are not server-retryable. Existing
  live failpoint contracts distinguish rejected from applied/failed-ack writes,
  retain J2 counters, J3 event identity and J4 revision/generation/receipt rules,
  and forbid external acknowledgment before durable readback. Replica-set
  failover/transaction qualification is not inferred from standalone evidence.
- **Configuration:** foundation tests compare the existing Sails URL/split/auth
  rules and effective pool policy; both logical databases retain distinct routing.
  The renewed authenticated TLS/SRV/TXT fixture checks CA and authentication
  rejection without fallback. No competing URL or connection options were added.
- **Extensions/docs:** public getters/plain interfaces and internal-only concrete
  seams were inspected against the institution guide and wiki generation rules.
  Existing hook/mapping and package consumers remain in the retained contracts.
  `npm run docs:audit` succeeds again at `3d24e991a`: 42 published surfaces and
  817 advisory findings. One existing advisory is CacheService's absent lifecycle
  classification; it is outside this review's defect threshold. No P1/P2
  documentation defect was found.
  Private institution hooks are not certified by this public fixture review.

## Validation

All **74 final accepted command records pass**; see [verification.json](verification.json).
The complete 74-command run at `9a3f371c3` exits zero. Its stock Bruno CLI bundled
npm 11.13.0, so that result is retained as an attempt and replaced for acceptance
by a fresh npm 11.20.0 replay. The latest static block and fresh Bruno both pass
at `3d24e991a`. The complete product source and compiled artifact trees remain
byte-identical across that fixture-only update and rebuild.

- Core/storage builds, root/core/storage lint, root/persistence/cache typechecks
  and storage test compilation: PASS.
- Core: **4,253 passing / 116 pending**. Storage: **288 passing / 38 pending**;
  enabled live storage: **326 passing**. HTTP/session/GridFS: **70 passing**.
- Every original retained persistence fixture passes. New fault/clock controls:
  **138 / 29 passing**. Expanded live index controls: **20 passing**.
- Fresh-volume `npm run test:mocha`: **419 passing / 10 pending**.
- Original stock `npm run test:bruno:general` and the accepted npm-pinned fresh
  replay each pass **309 requests / 553 tests / 3 assertions**, all successful.
  The accepted CLI reports **Node 24.16.0 / npm 11.20.0**; both portal containers
  report **Node 26.10.0 / npm 11.20.0** and matching host artifact hashes.
- Development readiness passes with promoted defaults (**49 scopes / 20
  collections**) and all explicit Waterline overrides (**zero selected scopes**).
- [Create budgets](create-budgets.json): **16 assertions / 24 workers** pass.
  MongoDB/Waterline p95 ratios: R **0.629**, Q **0.820**, J1 **0.572**, J2 **0.651**;
  call ratios **1.000–1.0023**, with zero measured errors and durable counts checked.
- [Existing-volume upgrade](existing-volume-upgrade.json): fail-fast **6,692 ms**,
  no HTTP before index preparation; explicit ensure yields **49 scopes / 20
  collections ready**, then HTTP **200**. All **six BSON sentinels** are unchanged.

Commands retain exact exits, durations, counts and raw-log SHA256. Raw logs remain
ignored under `.tmp/review-round-11/`; no payload logs are copied into evidence.

## Attempts, boundaries and cleanup

The preliminary supplied-HEAD run passes core/storage/static and initial parity
checks but hits a designated pre-P2 image worker startup timeout (14 other
migration tests pass). Docs audit/probes were concurrent at that point; a causal
attribution to load is not established. The preliminary scheduler is stopped
before fixes and its unfinished reference command is excluded. All its remaining
processes/resources are cleared before rebuilding. The final sequential run
passes all 15 migration cases; the prior-image case completes in 7.4 seconds.
The failed attempt and log hash remain in `attempts.json`; no timeout, assertion,
healthcheck, skip or budget is relaxed.

No qualifying defect is deliberately left unfixed. ADR0003 remains accepted;
G-TX remains CLOSED / OPS-TX-01 undecided. P6, P7/U, P8/V, P9/B, atomic S/P10.4,
P11/P12 remain gated. Record/DeletedRecord, lifecycle/CAS, permanent identity,
U/authorization, Counter and attachment OID rebind retain their existing owners.
Private hook/data certification and official-release qualification remain open.

[runtime.json](runtime.json) records source/artifact hashes, actual accepted
container toolchains, unchanged hashes for all **39 manifests/locks**, and the
retained-owner comparison: **25/26 files unchanged** from the input, with only
bounded cause construction changed in the shared maintenance engine. The eight
prior-image identities are unchanged. [cleanup.json](cleanup.json) records that
owned containers/networks/volumes are gone. No push was performed, and no quota/usage limit was encountered.
The worktree is checked clean after this evidence commit.
