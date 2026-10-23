# Programme review and fixes — round 4

Reviewed `441d87304^..72e1a2cd3`, then independently validated four small commits
through runtime `080267604`. Read the agent/coding standards router, programme
design/plan/tasks, accepted ADR0003, per-group validation and R1–R3 evidence.
Parallel standards and specification reviews supplemented direct loaded-model
comparisons and the consolidated lifecycle review. No work was pushed.

## A — query normalization

A complete rewrite is not justified. There are three necessary stages: validate
and flatten aliases before mandatory tenant scoping, translate the selected
target's supported dialect, then coerce against its qualified loaded field type.
The initial pass preserves explicit equality; the target chooses structured
literal comparison or actionable refusal. Distinct text predicates become native
conjuncts. Duplicate aliases and unsupported shapes are refused, never dropped.
Native record query semantics remain distinct from loaded Waterline model queries.

A real remaining loss was found in R/Q/J1 and progress-screen readers: their
empty-regex filter discarded an entire field even if it also contained a range,
inequality or membership constraint. Empty startsWith/endsWith additionally
retained anchors, changing matches on JSON scalars. The expanded direct loaded
Waterline find/count baseline reproduced **34 differences**. `2dc6b4e52` validates
modifier legality first, strips only generated empty text predicates in the
shared scalar stage and omits only genuinely empty native field predicates.
This small shared correction replaces the lossy special case in all four
readers; it does not add another normalizer mode or reuse ORM internals.
The final **3,106 bidirectional comparisons** agree, retaining every previous
scalar/association/equality/tenant/producer regression.

## B — checker and lockfiles

Exact **rttc 10.0.1** is justified by the loaded Waterline coercion contract.
Only adapter coercion imports it; its implementation/types do not cross plain
repository contracts. The root export is needed by the first-party storage
adapter. `035622d09` marks that checker `@internal` and records its Sails-stack
ownership and retention after ORM removal in P1 and the P11 plan. Removing it
requires independently qualified replacement semantics. No application dependency, pin or
lockfile changes were made this round.

An isolated npm **11.20.0** replay from `535408ab3^` manifests/locks, adding the
exact checker pin, reproduces both core and storage sub-locks **byte-for-byte**.
This includes removal of peer-only openapi-types/rxjs/tslib entries and field
reordering. Both replayed sub-locks pass strict offline `npm ci --dry-run`.
No resolved version or integrity changed in the committed delta. The committed
root delta only adds linked-core checker metadata. An isolated root regeneration
also pruned unrelated preexisting peer entries; that experimental output was
not applied. `dependencies.json` contains commands, hashes and replay limits.

## C — consolidated shutdown review

The shipped partial order is sound after the session handoff correction below:

1. Sails initializes services before its ready event and HTTP listening. Agenda
   registers its owner/wrapper synchronously when ready initialization starts;
   the lazy session middleware is created on the first HTTP request. Normal HTTP
   draining therefore precedes producer shutdown. Accepted async/callback actions,
   declared callback handoffs, detached work and pending response session work
   finish while repositories still accept their final writes.
2. Agenda stops admission and drains accepted jobs/checkpoints; Workspace, SIEM
   and Figshare stop admission and await complete accepted jobs. Their wrapper
   order can vary, but each completes before foundation cleanup. Returned errors
   retain their identity; original shutdown errors are preserved.
3. The foundation refuses new operations and awaits acquired databases, resource
   drains and tracked operations. Legacy GridFS and Flydrive retain stream and
   every dispatched sibling-deletion ownership, including fail-fast paths.
4. Resource closure precedes app-pool closure. Agenda explicitly disconnects
   tracked backends after stop(false); borrowed Mongo handles are not closed by
   it. SQS owns its client; connect-mongo owns its store; scoped Flydrive disposal
   cannot close another app. Waterline remains ORM-owned until Sails lowers it.
5. Concurrent cleanup joins one promise. Successful resources/pools are removed
   from ownership maps; failures retain only unfinished owners for retry and
   block reinitialization. Failed drains cannot authorize closing live pools.

The missing edge was between an async action settling and express-session's
pending save/touch/destroy callback. After client abort, transport completion
could release the accepted request before that callback, allowing its store to
close. The delayed-save regression failed with shutdown already complete.
`080267604` retains the response handoff before express-session's end wrapper;
the underlying end releases it after the session callback. Three regressions
cover save/touch/destroy, and all **18 focused HTTP tests** pass, including
cancelled downloads settling without an end attempt and the existing errors.

No new lifecycle policy/timeout is introduced. Arbitrary never-settling hook
work still needs explicit cancellation/ownership; manufacturing a timeout cannot
authorize closing beneath accepted writes. Agenda's existing timed-out drain
refusal and its sleeping-watchdog limit remain documented P10 constraints.
The final live owner suite checks combined HTTP/queue/session/GridFS shutdown,
owned/borrowed closures, partial startup, failed cleanup/retry, and observer-only
connection recovery on both storage selectors.

## Numbered issues and fixes

Locations refer to the reviewed `72e1a2cd3` unless stated otherwise.

1. **P2 — empty text predicates discarded sibling filters.**
   `packages/redbox-core/src/persistence/reference/MongoNamedQueryTargets.ts:62`
   and the Q/J1/progress equivalents. Valid loaded Waterline queries returned
   extra or missing driver rows. **Fixed: `2dc6b4e52`.** Failed loaded baseline,
   passing expanded bidirectional baseline and progress pre-dispatch regression.
2. **P3 — scalar-checker retirement ownership was undocumented.**
   `support/specs/waterline-retirement/p1-foundation.md` (fixed retention note at line 56) and P11 plan;
   `packages/redbox-core/src/persistence/scalars.ts:6`. The retirement plan did not record that the required checker remains after ORM
   removal, and its first-party helper ownership was unstated. **Fixed: `035622d09`.**
3. **P2 — cache readiness ignored loaded columns and callbacks.**
   `packages/redbox-core/src/persistence/cache/configuration.ts:66`.
   Waterline strips physical column names from normalized attributes, so a
   data-to-cache_payload override passed. Callback-only/default/validation/schema/
   timestamp changes also passed and were silently bypassed. **Fixed:
   `aa0a9a1b7`.** Guard effective physical schema and standard behavior. The live
   isolated column/callback regression first failed; all **15 transition tests**
   and **22 focused cache lifecycle/config tests** pass afterward. The old fixture
   unconditionally injected callbacks even for its standard model; callbacks now
   belong only to explicit hook cases. Waterline hook behavior and driver refusal
   are both asserted. Current wiki guidance describes the stronger refusal.
4. **P2 — pending session callbacks escaped async request draining.**
   `packages/redbox-core/src/middleware/requestLifetime.ts:42` and
   `middleware/redboxSession.ts:81`. An abort could close the session owner
   before its accepted response save completed. **Fixed: `080267604`.** Delayed
   save fails before the fix; save/touch/destroy and cancellation checks pass.

Each fix has a successful separate build/typecheck record. One uncommitted
cache guard narrowing error and a focused typed-test setup attempt were corrected
before committing the relevant fixes. No tracked change was reverted for before
proof, and no assertion, timeout, budget or skip was relaxed.

## Boundaries and verification

G-TX remains CLOSED, OPS-TX-01 undecided. P6, U/V/B, atomic S/P10.4 and P11/P12
remain gated. Records/DeletedRecord, CAS/lifecycle, permanent identity,
authorization, Counter and OID rebind retain Waterline/native ownership.
Private institution data/hooks/queries and official-release qualification remain
external limits. Same-instance service restart and arbitrary raw hook handlers
retain the previously documented lifetime/cancellation limits. No selector,
topology, collection, index or application dependency change was introduced.

Final command results, runtime hashes, source checkpoints, log hashes, prior
image identities and cleanup are recorded in verification.json and results/.
Raw logs stay ignored under `.tmp/review-round-4/raw`.

All **40 final commands** passed on runtime `080267604`:

- Core/storage builds, root/core/storage lint, root and strict persistence types,
  storage test compilation, changed-file formatting and fixture syntax passed.
- Core: **4,192 passing / 114 pending**. The additional opt-in cache mapping case
  is exercised by the separate **15-case live transition suite**; no skip was added
  to avoid executing it. The previous pending tests retain their existing scope.
- Storage: **288 passing / 38 pending**; full live storage: **326 passing**, no skips.
- **32 persistence/storage cases** pass, covering foundation, all delivered groups,
  deployed indexes, both writer/readers, tenant/identity/equality/producer checks,
  retained-image rollback, staged storage, backfill, both owner selections and
  partial-startup/failed-close retries. Each owner run passes **17 checks**, closes
  the owned SQS client once and returns **14 active connections to two observers**.
- Fresh-volume stock `npm run test:mocha`: **419 passing / 10 pending**.
- Fresh-volume stock `npm run test:bruno:general`: **309/309 requests,
  553/553 tests, 3/3 assertions**.
- Fresh development HTTP/readiness passes with promoted defaults (**49 ready
  scopes / 20 collections**) and explicit all-Waterline selectors (**zero selected
  driver index scopes**).

The host and final application verification image use **npm 11.20.0**. The
unchanged development image bundled npm 11.19.1; its first fresh Mocha run also
passed 419/10, then was superseded solely to honor the requested npm version.
The network-free verification image adds only the exact cached npm package,
selects it through PATH and preserves the normal node user. Its base/image IDs,
input hashes and recipe are in `npm-verification-image.json` and
`npm-verification.Dockerfile`. It is a local testing artifact, not an official
release image. `stock-runtime.json` confirms **Node 26.10.0**, npm **11.20.0**,
checker **10.0.1**, this checkout's core/storage entries and matching compiled
hashes. Host Node is **24.18.0**. Actual runtime pin checks confirm driver **7.7.0**
and compiler **5.9.3**. All **39 tracked manifests/locks remain byte-identical**.

The additional full packed-release/Node matrix and operational benchmarks were
not rerun; prior qualification remains archived, and no new release or production
budget acceptance is claimed. Existing source-import/Solr and upstream Agenda
watchdog limits retain their independent disposition. A whole-programme whitespace
check reports nine historical captured-log EOF blank lines; those immutable
records are deliberately unchanged under the no-cosmetic-nits instruction. The
round-4 diff check passes; `whole-range-whitespace.json` retains that diagnostic.

`cleanup.json` confirms no task-owned containers/networks/volumes remain and all
eight rollback image IDs are unchanged. The local npm verification image is
retained for reproduction; the original development image and unrelated Docker
objects are untouched. Runtime source/compiled hashes remain unchanged after the
stock tests. Only this compact evidence is added after runtime `080267604`.
No changes were pushed. Independent review totals are **Standards: 0 findings;
Spec: 1 P2 finding (cache overrides)**, with parent A/B/C findings recorded above;
see `review-axes.json`.
