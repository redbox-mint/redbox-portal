# Programme review and fixes — round 2

Reviewed `441d87304^..21207078a` (`79c116fe0..21207078a`, 95 commits),
then checked five runtime fixes through checkpoint `f291c3260` and the separate
readiness-fixture correction `658e932cd`.
Inputs were AGENTS.md, wiki coding standards, design/implementation plan/tasks,
accepted ADR0003, group validation/operations records and round 1 evidence.
Independent standards/specification checks supplemented the runtime review.

## Confirmed issues

1. **P1 — tenant predicate overwritten by a nested alias.**
   `packages/redbox-core/src/persistence/reference/NamedQueryExecution.ts:271`.
   Assigning mandatory tenant scope before flattening allowed a later nested
   `metaMetadata.brandId` alias to replace it. Both record counts and returned
   rows could use another tenant. Dotted institution scopes had the same risk.
   `f944c0411` normalizes before applying scope. `b6e12e6b0` preserves explicit
   object/array `$eq` through that preliminary pass; the final target still owns
   translation. `f291c3260` also rejects conflicting aliases before execution.
   Regression coverage checks both count/find predicates, institution scope,
   exact JSON equality and actual mixed-backend tenant reads.
2. **P2 — staged audit writes accepted incompatible scalar values.**
   `packages/sails-hook-redbox-storage-mongo/src/persistence/MongoStagedStorage.ts:37`.
   JSON validation accepted string/object/null numeric audit fields and string
   coercion accepted arbitrary objects. For example, HTTP status `"200"` was
   stored as a string rather than Waterline's number. `de33c8f1c` preserves the
   characterized finite scalar/Date coercions and null/object rejection, with
   payload-free failures. Reads refuse incompatible existing scalar rows without
   rewriting them. The live S contract compares loaded Waterline and driver
   responses/raw BSON types, including no insert after invalid input.
3. **P2 — reference extension names could become update paths.**
   `packages/redbox-core/src/persistence/reference/physical.ts:337`.
   A dotted top-level extension could be inserted literally, then interpreted
   as a nested `$set` path on revision. `$` names also lacked the existing Q/J1
   guard. `ceb24d481` refuses those names before dispatch, preserving nested JSON
   literals. Unit and live cases verify invalid creates/revisions leave stored
   rows and timestamps unchanged.
4. **P2 — typed query values silently changed matches.**
   `packages/redbox-core/src/persistence/reference/MongoNamedQueryTargets.ts:34`,
   plus the Q/J1 readers and J1 progress-screen criteria.
   Waterline coerces qualified scalar comparisons; MongoDB received the original
   strings. `searchable: "true"` produced one Waterline match and zero driver
   matches. `b6e12e6b0` preserves string/number/boolean comparison coercion for
   equality, ranges and membership, accepts query nulls independently of write
   rules, and leaves JSON values alone. Live R/Q/J1 cases compare counts and IDs;
   invalid values fail explicitly. No generic query facade or ORM was added.
5. **P2 — overlapping predicates silently discarded conditions.**
   `packages/redbox-core/src/persistence/reference/NamedQueryExecution.ts:126`.
   Multiple text modifiers overwrote the generated regex; logical aliases,
   comparison aliases and nested/dotted aliases could overwrite earlier clauses.
   `f291c3260` rejects these ambiguous expressions with explicit and/or migration
   guidance. Independent branches remain supported. Tests cover both translators,
   refusal before native count/find, and live loaded Waterline/driver execution.
6. **P3 — durable readiness fixtures inherited unrelated storage selection.**
   `packages/redbox-core/test/fixtures/waterline-retirement/durable-siem-readiness.cjs:14`
   and `durable-figshare-readiness.cjs:4` configured only the application datastore
   but inherited promoted S=mongodb. They failed before their own readiness
   assertions when the coordinator inspected storage. The separate fixture fix
   explicitly retains unrelated S on Waterline, preserving every assertion and
   the intended eight/three J3/J4 scopes. Both real standalone runners pass.

All five commits build and pass strict persistence typechecking separately.
The query regression initially reproduced the wrong tenant, the audit regression
reproduced string BSON instead of numeric BSON, the extension test reproduced
missing refusal, and the paired scalar query reproduced a smaller driver count.
During patch review, exact JSON equality was identified and covered before final
qualification. One intermediate optional-type compile failure was corrected;
no committed fix has a failed build or relaxed check.

The expanded 26-case batch exposed the two stale readiness fixtures above;
their original failures remain recorded and are replaced only by the successful
targeted reruns. A final storage typecheck was mistakenly run concurrently with
a core rebuild and encountered missing generated declarations; the sequential
rerun passes. Rebuilt runtime artifacts remain byte-identical to `f291c3260`.

## Boundaries and deliberately unchanged items

G-TX stays CLOSED, OPS-TX-01 undecided. P6, U/V/B, atomic S/P10.4 and P11/P12
remain gated. Records/DeletedRecord, CAS/lifecycle, permanent identity,
authorization, Counter and OID rebind retain their existing owners. No selectors,
topology, dependencies or lockfiles changed. ADR0003 is retained.

Private institution mappings/data/queries, official-release support and the
existing pending tests remain outside this bounded review qualification.
Same-instance reuse after disposing the legacy byte owner was not expanded:
the delivered owner/recovery qualification uses new owners/processes, and a
broader same-service restart contract was not established. Existing source-import
and Solr startup timing concerns retain their independent disposition.

## Verification record

`verification.json` identifies accepted results, source checkpoints, commands,
counts, durations, log hashes, rollback images and cleanup. Per-command compact
records are in `results/`. `dependencies.json` records unchanged manifest/lock
hashes. Raw logs remain ignored under `.tmp/review-round-2/raw`; no transcript,
source patch, persisted payload or secret is retained here.

The final accepted runs passed:

- Core and storage builds, root/core/storage lint, root TypeScript checking,
  strict persistence checking and storage test compilation. All changed
  TypeScript files pass Prettier; the programme diff passes `git diff --check`.
- `npm run test:core`: **4,171 passing, 113 pending**.
- `npm run test:storage-mongo`: **288 passing, 38 pending**; the controlled live
  storage run: **326 passing**.
- **27 persistence/storage cases** covering foundation, migration, cache, R, Q,
  J1–J4, selected S, indexes/readiness, rollback, backfill and owner failure/drain.
  These include the expanded 63-check S contract, both storage owner selections,
  and controlled Figshare tests on both selections. The corrected standalone
  readiness fixtures pass without weakening their assertions.
- Fresh-volume `npm run test:mocha`: **419 passing, 10 pending**, and
  `npm run test:bruno:general`: **309/309 requests, 553/553 tests, 3/3 assertions**.
  The first Mocha attempt had 418 passing and one failure in the unchanged
  branding WOFF2 decoder test. The decoder reported invalid font data or an
  exceeded resource budget. The complete unchanged fresh-volume retry passed,
  including that check. Its cause is not established; no test limit or assertion
  was relaxed.
- Fresh development HTTP/readiness with promoted defaults: **49 selected index
  scopes over 20 collections**. Explicit all-Waterline rollback also starts and
  reports no selected driver scopes. Existing Solr-before-ready log errors remain
  a separate startup concern; HTTP readiness does not resolve that concern.
- R/S operation budgets: three paired repetitions each, 100 warmups and 1,000
  measured operations per repetition. Driver/Waterline ratios were respectively
  **0.999/0.284 p95**, **1.043/2.485 throughput**, **0.512/0.936 RSS**, and
  **1.000/0.633 database calls**. Maximum readiness was **123.2/190.6 ms**, below
  the existing 250 ms limit. Both returned connections to baseline. Original
  budgets and atomic boundaries were retained; `operations.json` has exact values.

The stock Bruno portal loaded the current mounted core/storage builds; its Node
version and matching artifact hashes are in `stock-runtime.json`. Host fixture
runs used Node 24.18.0; the stock portal used Node 26.10.0. Host npm 12.0.2 only
ran scripts; no install or lock generation occurred. All **39 tracked manifests
and locks are unchanged** from the reviewed head, retaining npm 11.20.0 lock
maintenance and exact driver/compiler pins.

`cleanup.json` confirms no task-owned containers, networks or volumes remain,
and eight retained rollback image digests still match round 1. Unrelated
historical Docker objects and retained images were left untouched. The full
packed-image matrix was not rerun; the accepted bounded rollback probes and
source/build hashes are recorded explicitly. No changes were pushed.
