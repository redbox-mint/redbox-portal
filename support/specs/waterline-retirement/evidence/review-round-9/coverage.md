# Round 9: falsification of the round 8 coverage claims

Review input: `441d87304^..bf5e18e6a`. The [round 8 table](../review-round-8/coverage.md) is the concern/operation inventory, not proof of universal Waterline equivalence. Round 9 reruns its retained harnesses and adds complete-operation comparisons against actually loaded Waterline. Native operations retain their native contract.

## New counterexamples and retained comparisons

| Area | Final comparisons | Counterexamples before fixes | Retained fixture |
| --- | ---: | ---: | --- |
| Read DTOs: missing, null, strings, booleans, ordinary numbers, Int32, Double, safely promoted Long | 171 | 0 | `reference-operation-outcomes.cjs` |
| Unsupported large Long, Decimal128 and Date in ordinary DTO extension fields; explicit refusal without coercion | 57 | 0 | same |
| Complete fetched create DTOs, including valid Unicode keys/text, unpaired surrogate text, negative zero, large finite numbers and JSON null/falsy values | 80 | 16 | same |
| Insert acknowledged but fetched record missing: reject instead of publishing a null DTO | 6 | added control | same |
| Invalid patches when no row matches: R dashboard, Q configuration/bundle, J1 progress | 32 | 13 | same |
| J1 update/delete envelopes, empty criteria, no-match, multi-row returns and stored rows; direct and wrapped clauses | 172 | 88 | `reference-progress-writes.cjs` |
| Q/J1 fetch readiness: real loaded false declaration, eight mutation refusals and standard controls | 19 | 9 | `reference-fetch-mappings.cjs` |
| Document-size acceptance/failure and stored counts around MongoDB's size limit | 8 | 0 | `reference-operation-boundaries.cjs` |
| Duplicate primary-key error codes and unchanged row counts across R/Q/J1/J2 | 8 | 0 | same |
| Exact literal Unicode/case/normalization-sensitive keys | 10 | 0 | same |
| Empty, ordinary and large batches; 100,001 translations crosses MongoDB's maximum write-batch size; invalid batch fails before any insert | 8 | 0 | same |
| Batch clocks for 2,000 translations/events, caller-owned Event.createdAt and explicit timestamp overrides | 14 | 3 | `reference-batch-clocks.cjs` |
| Cache missing/null/string/non-string timestamp DTOs crossed with absent/null/falsy/array payloads; no read rewrite | 60 | 10 documented differences, 0 defects | `reference-cache-read-values.cjs` |

Total: **645 new final checks**. These counts exclude exploratory runs and repeat validation. Stored-row comparisons accompany the destructive operations; observing only a thrown error would miss the original broader write.

## Group × concern audit

The round 8 F/Q/T/I/P/V helper and operation inventories are retained. The final results rerun every listed group/concern harness, including the scalar/timestamp/mapping/ID/query/page/selection matrices and every promoted group's live transition/readiness contract.

| Group | New attack and result | Other concern cells re-exercised |
| --- | --- | --- |
| M | Review duplicate translation and name/epoch outcomes in unchanged concrete ledger; no new defect | `migration-values`, migration transition/prior image, foundation/indexes; F/Q/T/V mappings |
| R | 72 read DTOs, 24 rich-BSON refusals, 40 create DTOs, one missing-fetch control, eight no-match patches, 14 size/duplicate/key checks; fixed create fetch and skipped validation | Scalar/timestamps, object IDs/relationships, named query counts/matches/order/pages/projections, wildcard selection, mapping/readiness, transition/prior image |
| Q ordinary/I18n | 36 read DTOs, 12 rich-BSON refusals, 20 create DTOs, one missing-fetch control, 16 no-match patches, eight readiness controls, eight size/duplicate/batch checks; fixed fetch, validation and unsupported fetch flags | Scalar/timestamps/UID callbacks/defaults/nulls, IDs, queries, fixed prefix order, readiness, transition/prior image |
| Q CAS/secret leases | Re-read shared native implementation and failure/outcome translation; no model-codec insertion | Dashboard native patches, configuration contract, Date expiry/owner fences, count/CAS and no-match outcomes |
| J1 | 18 read DTOs, six rich-BSON refusals, ten create DTOs, two missing-fetch controls, eight no-match patches, 172 write envelopes, 11 readiness/proof controls, four size/duplicate checks; fixed all four operation-level gaps | Scalar/timestamps, IDs, query coercion, ordering/pages/projections, actual progress/workspace transition and draining |
| J2 | 27 read DTOs, nine rich-BSON refusals, ten create DTOs, two missing-fetch controls, eight size/duplicate/batch checks; fixed create fetch | Scalar/timestamps including caller-owned Event.createdAt, IDs, lineage predicates, counters, all 648 pages, readiness, transition/prior image |
| J3 | 18 read DTOs and six rich-BSON refusals; re-read idempotent capture/duplicate translation | Scalar/timestamps, ID mapping, model/native pages, native patches, live capture/attempt/fenced delivery/cleanup and both-selector native tests |
| J4 | Re-read common native replace/claim/retry/readback/duplicate handling; shared implementation unchanged | Contract, both-selector worker/unit fixtures, readiness, retained prior image; opaque identities, native clocks, replacement and no-match/fence outcomes |
| C2/cache | 60 read timestamp/payload combinations; ten null timestamp differences are the deliberate C2 contract | Name coercion/generated clocks, identity and mapping guards, live MongoDB/transition suites; declared payload/null/falsy/deferred behavior unchanged |
| S attachments | Re-read service normalization, physical write/read validation, internal insert uses and fixed journal identity restrictions; no new public fetched-create DTO | 700 input comparisons, storage contract/live/qualification, IDs, clocks, fixed predicates, readiness, prior image and both owner selections |
| S schema/audit | Shared native schema engine and Date codec unchanged; audit scalar validation remains distinct from ordinary schemaless model reads | Full staged contract/live storage, schema/ref expiry and authorization baseline, audit pages/counts, readiness/qualification and safe failure outcomes |
| S bounded revision maintenance | Shared engine unchanged; no new broad write or identity work | Backfill batch/missing/null/restart/no-progress controls, wrapper mapping and lifecycle proof |

## Corrections to the claims

The F/T codec comparisons alone did not establish complete repository behavior. Readiness must qualify fetch flags when repository methods rely on model fetch defaults. With ordinary valid criteria that match no existing row, submitted model patches must still be validated. Write criteria must be checked before extracting `where`; otherwise unsupported options and sibling predicates disappear. Bulk creates must pass one operation clock into every encoder while preserving explicit caller timestamps. A successful insert must fetch its returned DTO to preserve BSON encoding results; a missing readback is an error.

The round 8 statement that every physical decoder enforces required-field/scalar types is too broad. R/Q/J1/J2/J3 retain physically missing/null/other finite JSON scalar values just as loaded Waterline does; they validate identity, relationship mapping and the finite plain JSON boundary. Cache, attachment and staged-audit decoders have their own field checks. C2 explicitly preserves driver omission of legacy null timestamps while its Waterline adapter rejects them ([C2 validation](../../c2-validation.md)); the round 9 cache matrix asserts both outcomes and unchanged raw rows. This round records that distinction rather than adding read coercion or stricter scalar rejection to ordinary model decoders.

Rich BSON outside the qualified ordinary DTO/JSON contract remains an explicit refusal, including unsafe Long and Decimal128. Native schema/lease BSON Dates retain their dedicated codecs and live tests. The Date-to-ISO coercion supported by unrestricted Waterline scalar writes is not a claim that arbitrary Date objects are admitted by the plain JSON repository boundary. No rounding, automatic data rewrite or new document/batch-size policy is introduced.

The [baseline-preservation record](baseline-preservation.json) compares 26 retained Waterline/native/byte/session source files with the initial review HEAD: all are unchanged. Loaded Waterline adapters remain exercised alongside driver adapters. The gated owners, unsupported private mappings/query dialects and finite JSON limits are not expanded by this round.

Exact final results are indexed in [verification.json](verification.json). Full source/fixture hashes and command/log hashes identify the tested artifacts. This does not requalify private institution hooks, additional performance budgets or the packed official-release matrix.
