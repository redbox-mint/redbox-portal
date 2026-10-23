# Programme review and fixes — round 6

Reviewed `441d87304^..1dab20b08` from a clean checkout against AGENTS.md,
wiki coding standards, the programme design/plan/tasks, accepted ADR0003,
per-group validation and evidence from rounds 1–5. Separate standards and
specification reviews supplemented direct code review and generated comparisons.
No shipped query producer was found to require the R5-refused malformed shapes.

## Numbered issues and fixes

Locations refer to the reviewed `1dab20b08`.

1. **P2 — failed GridFS copy leaked its internal source stream.**
   `packages/redbox-core/src/storage/GridFSDriver.ts:240`.
   Destination deletion or upload-stream construction could reject before
   `pipeline()` acquired the source. The tracked, unconsumed download then
   blocked disposal indefinitely; move uses the same copy path. **Fixed in
   `6c1201d98`** by destroying the internally owned source in a finally block.
   Four failing-before tests cover both operations and both preparation failures,
   preserve the original error and source bytes, and verify disposal completes.
2. **P2 — synchronous session end failures permanently retained requests.**
   `packages/redbox-core/src/middleware/redboxSession.ts:90`.
   Serialization or synchronous save/touch/destroy failure left response ownership
   pending after transport close, so beforeShutdown could never drain. **Fixed in
   `a2918d364`** by making the failed end attempt terminal and tracking actual
   dispatched store callbacks independently. The original error/return/receiver
   semantics are preserved. This also covers error-handler end retries and
   response-writing throws after a store operation has already dispatched.
   Eight original regressions and eight retry regressions fail before their
   respective corrections; three pending-write controls prevent premature drain.

The session follow-up reviewer caught the retry edge in the uncommitted first
patch; it was reproduced and corrected before committing. The extra scoped test
compiler found missing chunkSize metadata in the existing fake GridFS result;
that fixture is now complete, without changing production behavior or assertions.
The GridFS commit was amended before final validation to include this fixture
correction. No tracked source was reverted for before proof, and no assertion,
timeout, healthcheck or budget was relaxed.

## Generated parity coverage

The added `query-pages` fixture compares complete pages, including independent
unpaginated totals, against actual loaded Waterline. Both selectors read data
from both writers. It covers R/Q/J1, compound ordering, skip/limit combinations,
empty pages, empty/id-only/deep/duplicate projections, JSON arrays, missing
fields, stored prototype-looking data, and parent/child selections in either
order. Related-filter reads without counts are checked independently.
Progress-screen select/omit remains an explicit unsupported-option contract.

Final new coverage: **12,672 checks** (**11,340 counted pages**, **1,260 reads
without counts**, **72 explicit select/omit refusals**). The retained R5
adversarial suite adds **5,529 checks** (**3,777 parity**, **1,752 refusals**),
for **18,201 generated checks** (**16,377 parity**, **1,824 refusals**), zero
supported-subset differences. The independent loaded baseline supplies **3,106**
additional checks; association/equality/tenant/producer fixtures remain in the
final matrix. No general query registry or new projection API is introduced.

## Verification and boundaries

All 42 accepted final command records pass:

- Core/storage builds, root/core/storage lint, root/persistence/cache/changed-test types and storage test compilation pass.
- Core: **4,227 passing / 116 pending**.
- Storage: **288 passing / 38 pending**; fully enabled live storage: **326 passing**.
- **34 persistence/storage cases** pass, including raw/cross-writes, selectors, retained-artifact rollback, index/readiness and ownership/failure cleanup on both storage selectors.
- Focused HTTP: **46 passing**; GridFS: **12 passing**.
- Fresh-volume stock Mocha: **419 passing / 10 pending**.
- Fresh-volume stock Bruno general: **309/309 requests, 553/553 tests, 3/3 assertions**.
- Fresh development HTTP/readiness passes with promoted defaults (**49 scopes / 20 collections**) and every explicit Waterline selector (**zero selected driver scopes**).

Existing pending counts are unchanged; the optional storage cases execute in the fully enabled live run. Production source/compiled hashes remain identical after stock installs.

Runtime source/compiled hashes and the actual mounted stock runtime are recorded
in runtime.json and stock-runtime.json. All 39 manifests/locks remain unchanged;
root/core/storage load exact driver 7.7.0 and compiler 5.9.3, and core checker
10.0.1. Host and application verification commands use npm 11.20.0. Owned fixtures
use MongoDB 8.0.34 standalone; no deployment topology changes.

No qualifying issue remains deliberately unfixed. G-TX stays CLOSED and
OPS-TX-01 undecided. P6, U/V/B, atomic S/P10.4 and P11/P12 remain gated;
Records/DeletedRecord, CAS/lifecycle, permanent identity, authorization, Counter
and OID rebind keep their retained Waterline/native owners. Private institution
hooks/data/queries, official release artifacts/support and production operations
acceptance remain outside this public-fixture review. Prior source-import/Solr
startup and upstream Agenda sleeping-watchdog limits retain their recorded
independent disposition. The full packed-release/Node matrix and additional
performance campaign were not repeated; no new release/budget approval is claimed.

Command results, log hashes and attempt dispositions are compacted here; raw logs
remain ignored under `.tmp/review-round-6/raw`. `cleanup.json` confirms no owned containers/networks/volumes remain and all eight rollback images retain their original digests. No work was pushed; the worktree is clean after the evidence commit.
