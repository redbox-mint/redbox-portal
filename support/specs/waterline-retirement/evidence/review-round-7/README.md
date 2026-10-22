# Programme review and fixes — round 7

Reviewed `441d87304^..1b471907c` against AGENTS.md, wiki standards, the accepted design/plan/tasks/ADR0003, group validation and rounds 1–6. Independent standards/specification reviews supplemented the consolidated GridFS/session lifecycle audit and the fresh programme pass. R6's copy-source and terminal-session-end fixes are retained; no further qualifying session defect was found.

## Numbered issues and fixes

Locations refer to the reviewed initial HEAD.

1. **P2 — destroyed GridFS downloads retained live cursors.** `packages/redbox-core/src/storage/GridFSDriver.ts:143` and the legacy storage byte owner. Node stream close does not close this driver's GridFS cursor. A real 300-chunk download retained its active cursor and issued no killCursors after destruction. **Fixed in `babf38830`, refined in `84f7c6ce6`** by owning abort/cursor cleanup through draining. The final peer review found that abort before an initializing chunks response also ends its session too early, leaving a late server cursor orphaned. The helper now observes the pending native read before abort/close. Three failing unit controls, live cancellation/error/completion checks and held initializing-response controls cover both owners.
2. **P2 — failed uploads released dispatched chunk writes before cleanup.** `packages/redbox-core/src/storage/GridFSDriver.ts:221` and `packages/sails-hook-redbox-storage-mongo/src/persistence/WaterlineNativeStorage.ts:3438`. A held chunk insert outlived pipeline rejection and disposal, then created an orphan after deletion. **Fixed in `27a9be9be`**, with binary qualification refinement `8304b61e0`. The internal writer bounds writes to one physical chunk and awaits dispatched callbacks before cleanup. Source, construction, chunk, final-file and combined failures preserve original errors. Native pre-final cleanup is safe; uncertain finalization bytes remain available for existing staged recovery. The actual applied-file/failed-ack control verifies that limit. Node pipeline comparisons preserve multi-byte views/offsets and refusal of object chunks.
3. **P2 — R/Q readiness admitted unsupported automatic timestamps.** `reference/preflight.ts:69`, `configuration/preflight.ts:75`. Flags were checked only on the two ordinary timestamp fields; loaded hook behavior on other attributes was bypassed. **Fixed in `8918acad2`** by checking both flags on every attribute, including relationships. Fourteen loaded-mapping refusals fail before and pass after; standard mappings still pass.
4. **P2 — native record array equality became membership.** `reference/NamedQueryExecution.ts:259`. Empty arrays matched nothing and nonempty arrays broadened matches in both selections. **Fixed in `7c52cabe6`** with explicit record-native translation, retaining Waterline shorthand for migrated model targets. Ten real native count/row comparisons cover empty/nonempty arrays, nested and logical expressions, explicit membership and tenant isolation on both selectors.
5. **P2 — J2/J3 numeric writes retained incompatible coercion.** `harvest/physical.ts:298`, `siem/physical.ts:208`. Booleans were refused while padded strings were accepted, opposite to loaded Waterline. **Fixed in `88bff6b40`** using the already pinned scalar checker and existing finite guard. The fresh loaded comparison covers all 21 numeric fields and 315 inputs; its 63 initial differences become zero. Patch controls also preserve invalid-value refusal and safe errors.
6. **P3 — progress ordering silently discarded trailing tokens.** `progress/MongoProgressRepositories.ts:67`. Strings such as `name ASC garbage` executed after truncation although Waterline refuses them. **Fixed in `2bda92167`, refined in `ed87ef860`** before execution. Non-object terms such as `42`, `true`, `null` and nested arrays were also incorrectly treated as empty ordering; they now fail before execution. Direct and array-wrapped regressions and the expanded retained adversarial suite cover the malformed terms; supported one/two-token terms remain valid.

No qualifying issue remains deliberately unfixed. G-TX stays CLOSED/OPS-TX-01 undecided. P6, U/V/B, atomic S/P10.4, P11/P12 remain gated. Records/DeletedRecord, CAS/lifecycle, permanent identity, U/authorization, Counter and OID rebind retain Waterline/native ownership. No selector, topology, dependency or lock change, transaction claim or push is included.

## Coverage and verification

All 47 accepted final command records pass:

- Core/storage builds, root/core/storage lint, root/persistence/cache/changed-test types and storage test compilation pass.
- Core: **4,242 passing / 116 pending**.
- Storage: **288 passing / 38 pending**; fully enabled live storage: **326 passing**.
- **40 full core/storage/persistence cases** pass, including raw/cross-writes, selectors, retained-artifact rollback, index/readiness and ownership/failure cleanup on both storage selectors.
- Focused HTTP: **46 passing**; GridFS and binary writer: **24 passing**; real GridFS: **14 stream/failure outcomes plus 2 initializing-query races**, both byte owners.
- Fresh-volume stock Mocha: **419 passing / 10 pending**.
- Fresh-volume stock Bruno general: **309/309 requests, 553/553 tests, 3/3 assertions**.
- Fresh development HTTP/readiness passes with promoted defaults (**49 scopes / 20 collections**) and every explicit Waterline selector (**zero selected driver scopes**).

The existing optional cases execute in the fully enabled live run. Production source/compiled hashes remain identical after stock installs. The retained page/projection matrix has **12,672 checks**, the expanded adversarial suite **6,129 passing / zero failures**, and the preserved baseline **3,106 passing / zero failures**.

The consolidated lifecycle pass covers accepted/aborted/early/error HTTP completion, initial session lookups, save/touch/destroy callbacks, synchronous end failure/retry, async/callback/Observable/detached work, GridFS upload/download/copy/move/delete, sibling deletion failures, cursor cancellation, pending writes, partial initialization, close failure/retry, app isolation and concurrent disposal. The full owner suites run on both storage selectors. R6's page/count/projection matrix remains intact; the new native-record and malformed-order cases address its uncovered dialect/input shapes.

The final runtime/compiled hashes and actual mounted stock runtime are recorded. The pinned GridFS cursor ABI is confined to the concrete byte helper and guarded by real-driver cancellation tests; driver upgrades must retain that qualification. All 39 manifests/locks remain unchanged; host and application runs use npm 11.20.0. Driver 7.7.0, compiler 5.9.3 and core checker 10.0.1 are asserted. Tests use owned MongoDB 8.0.34 standalone resources. Existing optional cases run in the fully enabled live storage suite.

Private institution data/hooks/queries, production operations/support and full official packed-release/Node qualification remain external limits. The full packed-release matrix and additional performance campaign were not repeated. Existing source-import/Solr and upstream Agenda watchdog limits retain their recorded disposition; no deadline, assertion, skip or budget was relaxed.

The final storage run corrected its old PassThrough/manual-finish upload fake to a completing writable with native chunk metadata and a transferred-byte assertion, then reran the complete storage suite. No production source changed for that fixture correction.

`fix-validation.json`, `attempts.json`, command results and log hashes distinguish initial failures, exploratory patch/fixture corrections and accepted final checks. Raw logs stay ignored under `.tmp/review-round-7/raw`. `cleanup.json` confirms no owned containers/networks/volumes remain and all eight rollback images retain their original digests. No work was pushed; the worktree is clean after the evidence commit.
