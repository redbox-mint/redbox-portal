# Programme review and fixes — round 3

Reviewed programme range `441d87304^..91cf1cc27` (`79c116fe0..91cf1cc27`),
then fixed the confirmed issues through runtime commit `97e30c252`. Inputs included AGENTS.md,
wiki coding standards, the complete design/implementation plan/tasks, accepted
ADR0003, all per-group validation records and both prior review rounds.
Independent standards and specification reviews supplemented direct loaded-model
comparisons and a review of the shipped query builders/configuration.

## A — overlapping predicates

**The round 2 refusal was too broad; fixed in `3386af419`.** Loaded Waterline
intersects `contains`, `startsWith` and `endsWith` on the same field. The shipped
named-query editor accepts raw JSON, and `NamedQueryService.setParamsInQuery`
merges modifiers for parameters sharing a field. Thus a stored `contains` plus
an `endsWith` parameter is a real producible shape. The former normalizer threw
before either reader executed it. The fix retains each native regex in its own
conjunct; Waterline retains its multi-modifier constraint. Direct loaded
Waterline `find`/`count` comparisons verify matching IDs and counts, including
nested and/or branches. Existing case sensitivity stays intact.

`query-inventory.json` records the 16 bundled definitions (eight definitions in
two bootstrap directories), and the reviewed UI/API/report/dashboard/hook paths.
They use record/user targets and shared-field date ranges; no bundled static
combined-text definition was found. A live producer test exercises the actual
service parameter merge on the supported user target and checks the loaded
Waterline result. Distinct range operators remain supported. Duplicate logical/
comparison aliases and colliding dotted/nested aliases still fail explicitly:
loaded Waterline rejects those raw shapes, while the old bespoke flattener could
discard conditions. No condition is silently dropped.

## B — loaded scalar semantics

**The handwritten codec was incomplete; fixed in `535408ab3`.** Query coercion
now uses exact **rttc 10.0.1**, the same version used by loaded Waterline, without
importing ORM normalization internals. It is pinned directly in core; npm
11.20.0 maintained root/core/storage lock graphs. No new resolved package version
was introduced. Readiness already compares the qualified field descriptors with
the actual loaded attribute types and refuses changed mappings/callbacks.

The baseline invokes the real loaded model's `find` and `count` directly, without
our replacement translator. The driver and retained Waterline reader then query
data written by each writer. **2,722 comparisons** cover strings, numbers,
booleans, JSON/deep fields, nulls, numeric strings, booleans as numbers, valid and
invalid Dates, membership, ranges, text modifiers and numeric writes. This
caught JSON Date normalization, array `!=` (Waterline's `nin`), null membership,
boolean ranges, scalar text coercion and empty text predicates. It also caught
Q/J1 numeric writes rejecting booleans but accepting whitespace-padded strings.
All now follow the loaded baseline within the qualified contract.

A further **28 loaded association/primary-key comparisons** caught null
membership bypassing validation after BSON identity encoding. `f3e238216` keeps
operator validation ahead of that bypass. A separate loaded Form JSON regression
caught `$eq` literals being unwrapped into Waterline text modifiers, silently
changing the query. `97e30c252` refuses structured equality before count/find on
the Waterline reader. MongoDB retains exact literal equality; scalar/null
equality and the preliminary normalization still work. Loaded Waterline itself
rejects structured equality. These tests compare actual loaded associations
rather than a fabricated `ref` attribute.

The S contract has **211 checks**, including actual loaded audit writes versus
driver writes, response acceptance, raw BSON scalar values/types, defaults,
JSON sanitization and no insert after invalid input. Audit scalars use the same
checker. These target models declare scalar/JSON types and associations; no
qualified model attribute declares `ref`. Readiness refuses a hook changing that
contract; no fictitious ref model or gated migration was introduced.

An explicit data-safety limit remains: an **invalid Date in an audit scalar**
can become null or BSON NaN inside Waterline's checker. The driver refuses it
before dispatch under the existing finite-scalar contract. Tests record this
exception instead of claiming universal parity. Audit JSON fields retain the
baseline JSON sanitization, including null conversion. Existing incompatible
stored audit scalars still cause an actionable read refusal without rewriting.

## C — tenant/brand scope

**No further bypass found.** Scope is assigned after alias normalization and
remains a mandatory top-level conjunct through target translation. The live
regression performs **428 checks**, including both count and row reads, both
backend selections, record/R/Q/J1 targets and an institution target with a dotted
scope. It covers nested/dotted aliases, and/or nesting, both logical spellings,
operator objects, parent equality, overlapping aliases, prototype names and
`$`-prefixed paths/operators. All returned rows and successful counts stay in the
requested tenant; 168 unsupported cases are explicitly refused. The unit/native
regressions also inspect the final count/find predicates.

## Numbered findings and fixes

Locations below refer to the reviewed head `91cf1cc27`.

1. **P2 — valid intersecting text filters rejected.**
   `packages/redbox-core/src/persistence/reference/NamedQueryExecution.ts:205`.
   Distinct text modifiers were treated as one duplicated regex operator,
   breaking loaded Waterline semantics and producible editor/API queries.
   **Fix: `3386af419`.** The focused regression failed before the fix; direct
   loaded-model and transition tests pass afterward.
2. **P2 — typed criteria and numeric writes changed outcomes.**
   `packages/redbox-core/src/persistence/reference/NamedQueryExecution.ts:135`,
   `packages/redbox-core/src/persistence/configuration/physical.ts:121`,
   `packages/redbox-core/src/persistence/progress/physical.ts:110`, and the R/Q/J1
   native readers. Incomplete coercion/modifier rules changed matches, accepted
   invalid constraints, rejected valid writes and admitted invalid numeric
   strings. **Fix: `535408ab3`.** The initial matrix found 202 differences; a
   separate loaded write probe reproduced both Q/J1 boolean and whitespace
   mismatches. The final bidirectional baseline has zero differences within its
   stated contract. The audit codec shares the exact checker and finite guard.
3. **P2 — GridFS disposal escaped sibling deletions after a failure.**
   `packages/redbox-core/src/storage/GridFSDriver.ts:268` and `:458`.
   Fail-fast Promise.all released the outer tracked operation while sibling
   deletes continued; disposal could close their client. This affects bulk
   delete and replacement/delete/copy/move paths. **Fix: `9c97f8b58`.** Track
   every dispatched deletion individually, retaining the original rejection
   timing/object. Both new disposal regressions fail before and pass after.
4. **P2 — HTTP completion was confused with controller completion.**
   `packages/redbox-core/src/middleware/redboxSession.ts:81` and `:85`.
   An abort, early response or synchronous session error could release accepted
   work before its final repository write. **Fix: `0adca052c`.** Returned action
   promises, callback response completion and registered background work have
   separate ownership. Sails async detection, original returns/errors and
   cancellation completion are preserved. Shipped async/callback hybrids,
   detached login audit events and background workflow reads are accounted for.
   Nine regressions fail against an archived prior source tree; all 11 new
   HTTP regressions, 30 focused request/download checks and 289 affected
   controller checks pass. No tracked source change was reverted to obtain the
   before/after evidence. One uncommitted implicit-this compile error was fixed;
   every committed fix builds and typechecks.

5. **P2 — encoded identities bypassed operator validation.**
   `packages/redbox-core/src/persistence/reference/NamedQueryExecution.ts:135`.
   Non-scalar fields bypassed operator rules, allowing `id: {in: [null]}` and
   equivalent association constraints that loaded Waterline rejects to execute
   silently. **Fix: `f3e238216`.** The original loaded-model regression failed;
   all 28 primary-key/nullable-association comparisons now agree across both
   readers and both writers.
6. **P2 — structured equality was reinterpreted during rollback.**
   `packages/redbox-core/src/persistence/reference/NamedQueryExecution.ts:212`.
   On Waterline, a JSON literal such as `$eq: {contains: "literal"}` lost its
   equality wrapper and became a text predicate, changing matches instead of
   retaining literal meaning or refusing. **Fix: `97e30c252`.** The live
   regression first failed with a missing rejection; it now confirms the loaded
   baseline refusal and zero dispatched count/find calls. Native literal
   comparison is preserved. The combined focused query suite has 22 passing
   tests.

## Deliberately unchanged and limits

G-TX remains CLOSED and OPS-TX-01 undecided. P6, U/V/B, atomic S/P10.4 and P11/P12
remain gated. Record/DeletedRecord persistence, CAS/lifecycle, permanent
identity, authorization, Counter and OID rebind keep their Waterline/native
owners. HTTP wrapper changes do not move those data owners or add transactions.
No selectors, Compose topology, collection names or indexes changed.

Private institution mappings/data/queries and official-release qualification
remain deployment/release work. A raw hook Express handler bypassing the exported
controller seam must explicitly own its asynchronous work. Callback completion
cannot be inferred for an arbitrary detached callback which neither returns a
promise nor attempts a response; the wiki documents the supported handoff and
cancellation contract. Shipped controller paths were inventoried. Existing
pending tests and the source-import deadline remain independent limits; no skips,
assertions or budgets were relaxed. The packed official-release image/version
matrix was not repeated; stock portal runs used the recorded development image
with this checkout’s compiled code mounted.

## Verification

**All required final runs passed on runtime `97e30c252`.**

- Core/storage builds, lints and typechecks passed. Each fix has its own successful
  build/typecheck record in `fix-validation.json`; final root lint/typecheck,
  storage test compilation and fixture syntax/format checks also passed.
- `npm run test:core`: **4,187 passing / 113 pending**.
- Storage unit suite: **288 passing / 38 pending**; live storage: **326 passing**.
- **32 persistence/storage cases, zero failures**: foundation, M, C2, R, Q,
  J1–J4, deployed index maintenance, readiness/refusals, both writer/readers,
  retained prior-image rollback, staged S contract/qualification/live/ownership,
  failure draining, backfill and both storage selections. The direct loaded
  query and tenant regressions are included.
- Fresh-volume stock `npm run test:mocha`: **419 passing / 10 pending**.
- Fresh-volume stock `npm run test:bruno:general`: **309/309 requests,
  553/553 tests, 3/3 assertions**.
- Fresh development HTTP startup and index inspection passed with promoted
  defaults (**49 ready scopes / 20 collections**) and explicit all-Waterline
  selectors (**zero selected driver index scopes**).
- R/S operation budgets passed unchanged: R p95 ratio **0.946**, throughput
  **1.081**, maximum readiness **127.84 ms**; S p95 **0.284**, throughput
  **2.483**, maximum readiness **214.94 ms**. All application connections
  returned to baseline. See `operations.json` for memory/call/byte metrics.

`verification.json` lists **41 accepted commands** with command, runtime head,
exit status, counts and raw-log SHA-256 in `results/`. `runtime.json` records the
runtime source and compiled hashes. `stock-runtime.json` confirms the actual
Bruno portal loaded this checkout’s core/storage builds and matching changed
artifact hashes under **Node 26.10.0**; host checks used **Node 24.18.0**.
`dependencies.json` verifies all **39** tracked manifests/locks after the stock
runners restored their fixtures. MongoDB driver **7.7.0**, storage compiler
**5.9.3** and checker **10.0.1** were checked at runtime. All eight rollback image
IDs remain unchanged. The only manifest/lock changes from the reviewed head are
the intentional exact checker pin in core’s manifest and updates to the root,
core and storage lockfiles.

`attempts.json` retains excluded/superseded attempts. Concurrent early runs hit
the unchanged 12-second source-import deadline, 250-ms readiness budget and a
Keycloak health deadline before portal startup. An archived reviewed-source
control also exceeded that source-import deadline; the final full core run and
fresh services passed unchanged. The first isolated final-head R run had one
25-ms p95 sample and failed the aggregate ratio (**1.284**); its single unchanged
retry passed (**0.946**). No timing assertion, healthcheck, skip or budget was
relaxed. Fixture setup/compile errors were corrected before the corresponding
fix commit or final accepted run. Raw logs stay ignored under
`.tmp/review-round-3/raw`; no tracked source was reverted to obtain before proof.

`cleanup.json` confirms all task-owned containers, networks and volumes were
removed, all eight rollback images retained, unrelated Docker objects left
untouched and no push performed. Runtime source, compiled artifacts and
manifest/lock hashes were unchanged after stock tests. The final evidence commit
adds the producer/tenant regression fixtures and this compact record only.
