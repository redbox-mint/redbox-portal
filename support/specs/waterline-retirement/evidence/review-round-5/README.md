# Programme review and fixes — round 5

Reviewed `441d87304^..92183a2fd` against AGENTS.md, wiki coding standards,
the programme design/plan/tasks, accepted ADR0003, per-group validation and
R1–R4 evidence. Independent Standards and Spec reviews supplemented direct
loaded-Waterline comparisons and the session/producer lifetime review.
No work was pushed. The final checkpoint also closes an inherited non-data projection edge found while qualifying the initial fixes.

## Numbered issues and fixes

Locations refer to the reviewed `92183a2fd`.

1. **P2 — action errors released pending response/session writes.**
   `packages/redbox-core/src/middleware/requestLifetime.ts:113` and `:123`.
   After `res.end()` handed work to express-session, rejection or synchronous
   throw cleared the same callback flag. On disconnect, shutdown could finish
   while save/touch/destroy was still pending. Six failing regressions reproduce
   premature completion. **Fixed in `466911549`** by owning response middleware
   separately from controller callback work. The returned/rejected error retains
   its identity and cancelled downloads that never end still finish draining.
2. **P2 — initial session lookup escaped draining after disconnect.**
   `packages/redbox-core/src/middleware/redboxSession.ts:78`.
   An abort before the session `get()` callback had no controller-owned work;
   transport close could release it and close its store. Three failing cases
   cover found/missing/error callbacks. **Fixed in `ebadbf2cf`** by tracking the
   initial middleware callback through next/error/synchronous failure.
   `6fa69abc5` supplies the required secret property and types the test's global
   fixture access, with successful scoped compilation.
3. **P2 — driver queries accepted invalid paths and collapsed invalid ordering.**
   `packages/redbox-core/src/persistence/reference/MongoNamedQueryTargets.ts:35`,
   Q/J1 equivalents, `NamedQueryExecution.ts:276` ordering and progress listing.
   Scalar descendants were treated as JSON, while repeated sort terms overwrote
   earlier ordering; unknown fields and multi-attribute terms could be accepted
   when loaded Waterline refused them. **Fixed in `698b2a106`** with qualified
   path types, JSON-only descendants and explicit ordering refusal. Empty-object
   no-op progress ordering remains supported. Native record reads retain compound
   MongoDB sort objects, covered by the record wire-DTO regression in `e78b77780`. No general query registry is added.
4. **P2 — nested projections changed shape or failed on valid selection.**
   `packages/redbox-core/src/persistence/reference/MongoNamedQueryTargets.ts:75`
   and Q/J1 equivalents. Selecting a JSON parent and its child caused MongoDB
   projection path collision. Dotted array projections also differed from the
   retained reader's plain path selection. **Fixed in `322b5c9f4`**: fetch only
   selected root fields, decode, then use the same plain projection as Waterline.
   Deep selections can read more JSON than the former server projection; the
   retained Waterline reader already reads whole rows. No new performance-budget
   acceptance is claimed.
5. **P2 — projections could export inherited functions.**
   `packages/redbox-core/src/persistence/reference/WaterlineNamedQueryTargets.ts:74`.
   Projecting `configuration.toString` from an ordinary JSON object copied the
   inherited JavaScript function into the result. That violated the plain DTO
   boundary even for valid stored JSON. The read-only reproduction confirms an
   own function in the returned DTO. **Fixed in `e78b77780`** with an
   actionable non-data-member refusal; an actual stored string property with
   that name remains readable. Both selected readers share the corrected stage.
6. **P2 — cache writes bypassed required-name validation.**
   `packages/redbox-core/src/persistence/cache/validation.ts:56`.
   The driver admitted empty-name creates and renames that loaded Waterline
   rejects. Isolated before proof passes Waterline and fails the driver.
   **Fixed in `f0af8edc0`** with separate structural-read and required-name write
   guards. Both adapters still read a legacy empty-name row without rewriting it.
   Literal case, whitespace, wildcard, slash, operator-looking, prototype-looking
   and Unicode names retain exact equality. No cache TTL/falsy/race policy changes.

## Adversarial coverage

The generated query fixture follows the official [Waterline grammar](https://sailsjs.com/documentation/concepts/models-and-orm/query-language)
and compares actual loaded find/count calls, not the replacement normalizer.
It covers all requested logical/membership/text/comparison modifiers, null,
empty arrays/strings, typed scalar/JSON values, sort/skip/limit and select/omit.
Both writers contribute to one dataset and both selectors read it.

The final generated suite has **5,529 passing cases**: **3,777 parity comparisons**
and **1,752 explicit refusal checks**, with zero differences in the supported
subset. The refusal checks require named-query-compatibility/progress-query
codes. They include documented like/not/empty-logical/progress-option exclusions
and malformed sort/path/pagination cases. Loaded Waterline sometimes skips
validating malformed criteria under a tautology or limit zero; those invalid
shapes are explicitly refused rather than certified as supported grammar.
The established nested dictionary-to-dotted-path DSL and native record dialect
remain distinct from literal structured equality; existing equality/tenant/
association/producer suites remain in the final matrix.

The retained loaded-model baseline supplies another **3,106 checks**. Cache
adds **22 literal-key round trips**, **24 rejected empty-name writes**, and two
legacy empty-name read/no-rewrite checks. Focused HTTP has **27 passing tests**,
including nine added session permutations: three operations × two failure kinds,
and three initial lookup outcomes. Existing normal/aborted async/callback/
detached/Observable/error-response cases remain. The final live owner runs cover
combined queue/HTTP/session/GridFS shutdown, owned/borrowed closure, partial
startup and failed-close retry on both storage selectors.

## Verification and scope

All 42 final command records pass on the final production sources:

- Core/storage builds, root/core/storage lint, root/persistence/cache/changed-test typechecks and storage test compilation pass. The existing mapping-mutation test (`6d9f75d90`) now has a contextual input type and a known-fixture non-null assertion; its checks and runtime are unchanged.
- Core: **4,204 passing / 116 pending**. The two added opt-in cache cases run in the separate **17-case live transition suite**; their core skips are not unexecuted acceptance.
- Storage: **288 passing / 38 pending**; full live storage **326 passing**.
- **33 persistence/storage cases** pass, including both selectors, cross-writes, indexes/readiness, retained-artifact rollback, staged storage, backfill and ownership/failure cleanup.
- Fresh-volume stock Mocha: **419 passing / 10 pending**.
- Fresh-volume stock Bruno general: **309/309 requests, 553/553 tests, 3/3 assertions**.
- Development HTTP/readiness passes with promoted defaults (**49 scopes / 20 collections**) and all explicit Waterline selectors (**zero selected driver scopes**).

The initially completed batch cases were repeated after the final query corrections; `pre-inherited-checks.json` and `pre-native-order-checks.json` distinguish the superseded runs. The final batch's original supervisor retains a stale initial static-failure flag; the independently repeated static check and every accepted per-command result are green. Production source and compiled hashes remain identical after the final matrix and stock runs.

`runtime.json` records the production source checksum, compiled hashes and npm
11.20.0; `stock-runtime.json` verifies the mounted portal loaded the same artifacts.
All manifests/locks remain byte-identical. Tests use owned fresh standalone
MongoDB 8.0.34 databases. The existing npm-11.20.0 verification image is reused;
it is not an official release image. Raw logs remain ignored under
`.tmp/review-round-5/raw`; compact command results and hashes are committed.

`attempts.json` distinguishes exploratory harness/classification corrections,
extra test-type errors and the mistaken concurrent-build cache run from accepted
results. The isolated before reproduction and sequential final verification
supersede the contaminated run. No timeout, healthcheck, budget or assertion was
relaxed. No tracked source was reverted for before proof.

G-TX remains CLOSED, OPS-TX-01 undecided. P6, U/V/B, atomic S/P10.4, P11/P12,
Records/DeletedRecord, CAS/lifecycle, permanent identity, authorization, Counter
and OID rebind remain deliberately untouched. Documented query-subset refusals
remain intentional. Private institution data/hooks/queries, full packed-release
matrix, production support and operations acceptance remain outside this bounded
review. Prior source-import/Solr startup and upstream Agenda sleeping-watchdog
limits retain their documented disposition; no new lifecycle timeout is invented.

Independent review totals are **Standards: 1 P2; Spec: 2 P2** (one overlapping
finding), all fixed. Their reports are retained in `review-axes.json`.
`cleanup.json` confirms that task containers/networks/volumes are gone and the eight retained rollback image IDs are unchanged. No work was pushed; the final worktree is clean after this evidence commit.
