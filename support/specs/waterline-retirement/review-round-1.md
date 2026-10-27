# Programme review and fixes — round 1

Reviewed `79c116fe0..0bfa20b10` (87 programme commits) on
`t3/waterline-retirement`. The review used AGENTS.md, wiki coding standards,
design/plan/tasks, accepted ADR0003 and group validation/operations records.

## Confirmed issues and fixes

1. **P1 — workspace draining:** `WorkspaceAsyncService.ts:101` used fail-fast
   batches and status-write waits. One failed write released the tracked batch
   while accepted jobs/writes still ran, allowing shutdown to close persistence
   beneath them. `0dd163a22` awaits all jobs and writes, owns early rejections,
   and replaces raw error logging with a payload-free diagnostic. Both new
   failure/drain regressions failed before the fix and pass afterward.
2. **P1 — Agenda/HTTP producer ordering:** `AgendaQueueService.ts:151` and
   `middleware/redboxSession.ts:51` registered resource drains after
   persistence started refusing repository operations. Accepted jobs and HTTP
   requests therefore could not publish their final database writes. Agenda and
   session middleware now quiesce their producers before the foundation shutdown
   hook in `e5ff6b554`. Separate failing regressions cover both paths; the live
   owner fixture checks durable queue/request completion writes and return to
   baseline connections (17 checks, observer baseline restored from 14 to 2).
3. **P2 — lossy reference JSON:** `reference/physical.ts:307` and `:335` used
   serialization as validation. Nested NaN became null, undefined disappeared,
   and accessors/toJSON could run. `ba932dbe2` reuses strict shared JSON validation,
   snapshots root data descriptors and clones accepted values. The regression
   covers create/update, extension fields, native values and side effects.
   Companion fix `36413a21e` explicitly snapshots optional form-authoring
   properties, Date defaults and legacy RegExp JSON shapes before the strict
   driver boundary. Explicit Waterline retains institution model serialization.
   All 32 registered forms emit valid JSON; the producer and rollback regressions
   cover omitted fields, unchanged source config and nonfinite defaults.
4. **P2 — reference query parity:** `reference/MongoNamedQueryTargets.ts:34`
   retained generated case-insensitive regex flags, changing filter/count results
   relative to Waterline. `b5c846368` preserves case-sensitive text modifiers.
   The loaded mixed-backend regression reproduced six MongoDB matches versus
   zero Waterline matches; startsWith/endsWith/nested contains now agree.
5. **P2 — staged collation readiness:** core `storage/preflight.ts:60` and storage
   hook `persistence/preflight.ts:67` did
   not inspect collection collation, including unindexed IntegrationAudit.
   A case-insensitive collection passed readiness and changed OID matching.
   `fe1572c7e` refuses unsupported collation on all six staged collections before
   selected DDL. Six live refusal/no-DDL checks extend the readiness suite.
6. **P2 — rollback forwarding:** nine supplied Compose/template files omitted
   migration forwarding; both PDF-hook stacks omitted all eight promoted groups.
   Setting the documented rollback variable could leave MongoDB selected.
   `a5ed4ba26` forwards the overrides and makes the dev readiness fixture honor
   every selected backend. Twenty resolved Compose configurations and four
   rendered template configurations pass for both backend values.
7. **P3 — operational documentation:** architecture still described deleted
   cache contract generation; M instructions retained Prisma and C/M-only index
   preparation; the cache migration page excluded staged S index scopes. Updated
   architecture/configuration/index scope and rollback guidance now describes
   the 49 scopes across 20 collections in both logical databases. The foundation
   guide also corrects stale staged-S/default/gate, driver-pin and internal-export
   claims and specifies producer draining before low-level cleanup.

## Boundaries retained

G-TX remains closed; OPS-TX-01 is undecided. No replica-set conversion, U/V/B,
atomic S, P11/P12 or bridge retirement is implemented. Records/DeletedRecord,
CAS/lifecycle, permanent identity, authorization, Counter and OID rebind retain
their baseline owners. Accepted architecture and operation-specific adapters
are preserved; historical qualification/Prisma comparisons remain historical.
No dependency manifests or lock graphs were changed. No push is performed.

## Validation

The compact command/result/hash ledger is
[`evidence/review-round-1/verification.json`](evidence/review-round-1/verification.json).
Raw logs remain ignored under `.tmp`; no transcript, patch or stored payload is
retained as programme evidence. All accepted commands exit zero on runtime
checkpoint `36413a21e`:

- Core/storage builds, lint, root/persistence typechecking and storage test
  compilation pass. All dependency manifests and locks match the reviewed HEAD.
- `npm run test:core`: **4,167 passing / 113 existing pending**, with the unchanged
  source-import deadline. Storage: **288 passing / 38 pending** without MongoDB;
  **326 passing** with all live storage/concurrency cases enabled.
- **26 persistence/static suites** pass, including loaded mixed instances,
  actual prior-image rollback, 37 staged contract checks, 14 recovery/qualification
  checks, 17 owner checks, five partial-startup failures and 16 backfill checks.
- R and S operation budgets pass three alternating backend pairs with 100
  warmups and 1,000 measured operations. R driver/Waterline p95 ratio is **1.038**;
  S is **0.290**. Throughput, RSS, calls, readiness and connection cleanup pass.
- Fresh stock `npm run test:mocha`: **419 passing / 10 pending**. Fresh stock
  `npm run test:bruno:general`: **309/309 requests, 553/553 tests, 3/3 assertions**.
- Fresh standard development entrypoint starts with the driver defaults
  (**49 ready scopes / 20 collections**) and with every promoted group/cache set
  to Waterline (**zero selected driver scopes**, ready). Runtime pins resolve to
  MongoDB 7.7.0 in root/core/storage and TypeScript 5.9.3 for storage.

Superseded attempts remain visible in the ledger: the strict JSON change exposed
the corrected form producer; one core run overlapped focused producer checks and
hit the unchanged import deadline; a dev attempt failed before ORM load with
`getaddrinfo ENOTFOUND mongodb`; and one S readiness sample was 334 ms against
250 ms. The final isolated core run, fresh dev retry and unchanged three-pair S
rerun pass. All six accepted S readiness samples are 62–156 ms. Limits and
standalone topology remain unchanged.

All owned containers/projects/volumes are removed. Prior rollback images remain
retained; their immutable IDs are in the ledger. Changes remain local.
