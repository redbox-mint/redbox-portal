# Programme review and fixes — round 9

Reviewed `441d87304^..bf5e18e6a` against AGENTS.md, wiki coding standards, design/implementation plan/tasks/ADR0003, group validation records and rounds 1–8. This round treated the R8 coverage table as claims and tested complete operation outcomes, alongside renewed codec/query/mapping and lifecycle contracts. Final runtime: `5493fbe61`.

## Issues and fixes

Locations refer to review HEAD `bf5e18e6a`.

1. **P2 — progress writes discarded criteria clauses.** `packages/redbox-core/src/persistence/progress/MongoProgressRepositories.ts:125` (also updates at 115). `{where: {}, limit: 1}` deleted all rows on MongoDB while Waterline rejected it; sibling predicates were also ignored. **Fixed `7b2c4843e`** with a write-envelope check before extracting predicates. Explicit empty criteria and multi-row behavior remain supported. The generated matrix changes 88 acceptance/stored-row differences to zero across 172 checks.
2. **P3 — no-match shortcuts skipped patch validation.** `packages/redbox-core/src/persistence/progress/MongoProgressRepositories.ts:117`, plus R dashboard and Q configuration/bundle operations. Invalid values returned a successful empty/null outcome when no row matched, while Waterline rejected them. **Fixed `b8205bb50`** by encoding before the lookup/shortcut. Thirteen differences close across 32 comparisons.
3. **P3 — creates returned input instead of fetched DTOs.** `packages/redbox-core/src/persistence/reference/MongoReferenceRepositories.ts:53`, plus Q/J1/J2. Valid JSON containing unpaired surrogate text is encoded to replacement characters in BSON; MongoDB returned the original text while Waterline fetch returned stored text. **Fixed `074bbc706`** by fetching created rows through their physical decoder, as sails-mongo does. Sixteen differences close across 80 DTO comparisons. Six missing-readback controls require a failure rather than a null created DTO. Creates now incur the fetched read; no new performance-budget qualification is claimed.
4. **P3 — readiness ignored model fetch behavior.** `packages/redbox-core/src/persistence/progress/preflight.ts:43` and Q's corresponding guard. A genuine loaded `fetchRecordsOnCreate:false` declaration persisted a row but returned undefined; MongoDB still published a DTO. **Fixed `100a5f9f7`** by qualifying create flags in Q/J1 and update flags in J1, precisely where operations depend on those defaults. Nine refusals/proof controls originally failed; all 19 checks now pass. Bundled configuration retains true defaults.
5. **P3 — createEach batches used multiple automatic clocks.** `packages/redbox-core/src/persistence/configuration/MongoConfigurationRepositories.ts:157` and J2 event append. Waterline assigns one operation timestamp; 2,000 driver rows had 35 distinct Q creation/update clocks and 56 J2 update clocks. **Fixed `5493fbe61`** by passing one batch clock into the existing codecs. Explicit caller timestamps and caller-owned Event.createdAt remain intact. All 14 clock controls pass.

Every accepted fix has a separate commit and passing build/strict persistence typecheck validation. [fix-validation.json](fix-validation.json) links before proofs, commits and final results. No production change was reverted for before proof.

## Falsification coverage

All **645 new checks** pass: 171 missing/null/numeric-BSON read DTOs; 57 rich-BSON refusal controls; 80 complete create DTOs; six missing fetches; 32 no-match patch checks; 172 destructive write-envelope comparisons; 19 fetch readiness controls; 60 cache timestamp/payload reads (including ten documented backend differences); eight near-limit document-size checks; eight duplicate/error/no-write checks; ten literal Unicode/case keys; eight batch-size/prevalidation checks; and 14 batch-clock controls. The batch test includes **100,001 rows**, crossing MongoDB's maximum write-batch size. Document-size cases use **16MiB minus/plus 1024 bytes** of payload.

[coverage.md](coverage.md) maps every group/concern to the renewed harnesses and new attacks. It also corrects R8's overbroad read-validation claim: ordinary R/Q/J1/J2/J3 schemaless decoders preserve finite stored scalar/null/missing values as Waterline does; cache, attachment and staged-audit decoders have separate stricter checks. No new read coercion or data rewrite was added.

The retained generated page/projection, adversarial and loaded-baseline matrices are rerun, as are all R8 scalar/timestamp/ID/mapping/query/page/selection/native patch suites and every promoted group transition/readiness contract. [baseline-preservation.json](baseline-preservation.json) proves 26 Waterline/native/byte/session/cache owner sources unchanged from the review HEAD; live tests exercise both selections and retained prior artifacts.

## Final validation

All **66 final command records** pass on `5493fbe61`, using npm **11.20.0**:

- Core/storage builds; root/core/storage lint; root/persistence/cache typechecks and storage test compilation.
- Core: **4242 passing / 116 pending**. Storage: **288 passing / 38 pending**; enabled live storage: **326 passing**.
- **59 persistence/fixture commands** pass, including all six new fixtures, live cross-writes, selectors, mapping/index readiness, retained-image rollback, owner failure/draining, GridFS and bounded backfill.
- Fresh-volume stock `npm run test:mocha`: **419 passing / 10 pending**.
- Fresh-volume stock `npm run test:bruno:general`: **309/309 requests, 553/553 tests, 3/3 assertions**.
- Fresh dev HTTP/readiness: promoted defaults **49 scopes / 20 collections**; every explicit Waterline selector **zero selected driver scopes**.

Exact commands, exits, counts, durations and raw-log SHA256 are indexed by [verification.json](verification.json). The actual mounted Bruno runtime matches the host artifact hashes and loads this checkout's core/storage packages. Manifests/locks are unchanged; installed pins remain MongoDB 7.7.0, RTTC 10.0.1 and TypeScript 5.9.3. Tests use owned MongoDB 8.0.34 standalone resources. Earlier exploratory/checkpoint runs are separate in [attempts.json](attempts.json); no existing assertion, timeout, healthcheck, skip or budget was relaxed.

## Deliberately unchanged and limits

No qualifying defect remains deliberately unfixed. C2's legacy null-timestamp difference is deliberately retained: driver reads omit null timestamps, and its Waterline adapter rejects them, as the accepted validation and unchanged transition test require. The rejected tightening was removed from the unpublished history before final qualification; no cache production source delta or revert commit remains. G-TX stays CLOSED / OPS-TX-01 undecided. P6, U/P7, V/P8, B/P9, atomic S/P10.4 and P11/P12 remain gated. Record/DeletedRecord, CAS/lifecycle, permanent identity, U/authorization, Counter and attachment OID rebind retain their Waterline/native owners. ADR0003 is retained; no selector, topology, dependency or retirement change was made.

Unsafe Long/Decimal128 and arbitrary Date objects outside the qualified ordinary JSON DTO contract remain explicit refusals. Native schema/lease BSON Dates retain their dedicated codecs and live proof. Private institution hooks/data/query dialects, additional performance budgets and packed official-release/Node qualification remain separate work. Existing optional test cases execute in enabled live storage; historical source-import/Solr and Agenda watchdog limits are not reclassified as fixed.

[cleanup.json](cleanup.json) records task-resource cleanup and retained image checks. No quota or usage limit was encountered. Nothing was pushed; the worktree is clean after the evidence commit.
