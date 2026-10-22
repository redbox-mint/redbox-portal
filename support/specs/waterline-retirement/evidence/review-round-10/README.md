# Programme review and fixes — Round 10

Review input: `441d87304^..8a449eb7b`, clean `t3/waterline-retirement`.
Inputs include AGENTS.md, wiki coding standards, design/implementation plan/tasks,
ADR0003, group validation and rounds 1–9, especially R9's coverage corrections.
Independent standards/API and specification/selector/index reviews supplement
the direct review and live probes; [review-axes.json](review-axes.json) retains
their reports. Severity is limited to P1/P2 and clearly incorrect P3 behavior.

## Numbered issues and fixes

Locations below refer to the review input, before the fixes.

1. **P2 — native cache failures disclosed driver details through preview APIs.**
   `packages/redbox-core/src/persistence/cache/MongoCacheEntryRepository.ts:77`
   rethrew nonduplicate native writes, while reads/deletes had no translation.
   Branding preview's error mapper copied those messages into HTTP 500 details.
   **Fixed `b9ff434da`**: all four driver operations produce a controlled cache
   failure without a native cause. Existing validation and duplicate behavior
   remain; the API status matches the Waterline-selected path. Eight disclosure
   regressions fail before the fix; all 11 error/status/duplicate/validation
   controls pass afterward.
2. **P2 — equivalent existing partial indexes blocked startup/preparation.**
   `packages/redbox-core/src/persistence/indexes.ts:54` compared partial filters
   with order-sensitive JSON. The existing native Figshare filter declares
   namespace before articleId, while the descriptor declares the reverse.
   The same unique index was incorrectly `conflicting`, including under a
   legacy name. **Fixed `a6a214ce0`**: compare top-level field predicates without
   their declaration order. Compound index-key order and nested BSON literal/
   operator order remain significant. Live controls retain refusals for actual
   key-order and predicate differences.
3. **P3 — compound duplicate audits missed missing/null collisions.**
   `packages/redbox-core/src/persistence/indexes.ts:77` grouped missing fields
   separately from BSON null, although a non-sparse unique index collides them.
   Two legacy chunks with the same run/hash and absent versus null attempt
   reported zero duplicate groups. `--ensure` created earlier scope indexes,
   then failed with native duplicate-key creation failure. This is incorrect
   preflight behavior, not a cosmetic diagnostic. **Fixed `0bea1150b`**: normalize
   missing compound components to null during the audit. All nine live index
   controls pass, including the real native collision and all-scope refusal
   before any index/collection creation. No rows or indexes are repaired/dropped.

[fix-validation.json](fix-validation.json) records the separate build/typecheck
checks and [targeted-proofs.json](targeted-proofs.json) retains compact before/
after proofs. Regression tooling and the strengthened retained cache assertion are committed
in `d73b89047`. Reviewed history is unchanged; no production change was reverted.

## R9 regression and scope review

The no-match validation change retains loaded Waterline's validation outcome;
the shipped AppConfig, dashboard and progress producers submit the qualified
patches/criteria. Q/J1 fetch defaults are true in the bundled model config;
unsupported overrides fail readiness with Waterline migration guidance.
Progress write-envelope guards retain supported direct/wrapped criteria and
refuse discarded options. The retained loaded-operation, fetch-mapping,
progress-write, boundary and shared-clock matrices exercise these changes again.
Fresh stock suites cover the shipped bootstrap/config/service producers.

`074bbc706` adds a read after R/Q/J1/J2 ordinary inserts. The new create benchmark
profiles actual database operations against fetched Waterline creates, with
three alternating backend pairs per group, 100 warmups, 1,000 measured creates,
15KB JSON payloads, separate worker RSS and durable stored counts. The J2
measurement targets chunk-attempt creation, the repeated ingest path. Its results
and fixed OPS-BUDGET-01 assertions are retained with the final command records.
The native counter/CAS/lease paths remain unchanged. Existing readiness,
connection sharing and draining contracts run alongside these measurements.

## Reproduction and evidence

The complete command is documented in [P1 validation](../../p1-validation.md)
and the [fixture README](../../../../../packages/redbox-core/test/fixtures/waterline-retirement/README.md):

```bash
npx --yes --package=npm@11.20.0 -c 'python3 packages/redbox-core/test/fixtures/waterline-retirement/run-review-regressions.py'
```

The explicit inventory contains all 59 retained R5–R9 persistence/fixture
commands, the full core/storage and static checks, fresh Mocha/Bruno, both
development selections, explicit HTTP/session/GridFS regressions and the new
index, selector, create-budget and existing-volume controls. Commands run
sequentially; builds never overlap fixture consumers in the accepted run.
Exact exits, durations, counts and raw-log hashes are retained in the final
verification record. Raw logs and sentinel payloads remain ignored under `.tmp`.

## Final validation and upgrade result

All **72 final accepted command records** pass; see
[verification.json](verification.json) and [results](results/). The initial
71-command matrix exposed the obsolete native-message assertion and two new
fixture setup/probe mistakes. Their corrected targeted reruns pass. The final
changed-test typecheck also passes; [attempts.json](attempts.json) distinguishes
every excluded attempt. The runtime sources/artifacts remained identical
through acceptance, and all 39 tracked manifests/locks are unchanged.

- Core/storage builds, root/core/storage lint, root/persistence/cache typechecks
  and storage test compilation: PASS.
- Core: **4,253 passing / 116 pending**. Storage: **288 passing / 38 pending**;
  enabled live storage: **326 passing**. Explicit HTTP/session/GridFS: **70 passing**.
- All **59 retained persistence/fixture commands** pass. The page/projection
  matrix has **12,672 checks**, adversarial **6,129**, loaded baseline **3,106**,
  scalar **7,280**, timestamp **1,520**, and R9 operation controls **645**.
- Fresh stock `npm run test:mocha`: **419 passing / 10 pending**.
- Fresh stock `npm run test:bruno:general`: **309/309 requests, 553/553 tests,
  3/3 assertions**. Both actual containers use npm **11.20.0** and matching host
  core/storage artifacts; see [stock-runtime.json](stock-runtime.json).
- Development HTTP/readiness: defaults **49 scopes / 20 collections**; every
  explicit Waterline override gives **zero selected driver scopes**.
- New controls: **151 selector checks**, **nine index upgrade checks**, and
  **11 cache error/status controls**, all passing.

[Create budgets](create-budgets.json) pass all 16 fixed assertions over 24
separate workers: three backend pairs × four groups, 100 warmups and 1,000
measured creates each. MongoDB/Waterline p95 ratios are R **0.754**, Q **0.792**,
J1 **0.659**, J2 **0.658**; throughput ratios are **1.436–1.811**, RSS
**0.915–0.926**, database calls **1.000–1.0023**. R/Q/J1 each record 2,200 calls
for 1,100 creates on either backend. J2's profile includes readiness and records
2,205 versus 2,200; it remains below its 1.25 limit. The actual create path adds
one fetch after insertion, matching Waterline's fetched-create behavior. All
samples retain p50/p95/p99, errors and durable row counts. Existing pool,
readiness and drain guards pass alongside this bounded workload comparison.

[The existing-volume upgrade](existing-volume-upgrade.json) uses the retained
pre-programme image with immutable ID
`sha256:ba6b99f1c669cff71db60c2e2a7396dc13cf0d99dd7f26e711df157a1c3186b8`
([prior P4 provenance](../../../prisma-cache-persistence/p4-validation.md)).
The old app completes bootstrap and its actual Waterline models write six
sentinels on an owned volume with no fresh-stack init script. Its root HTTP
responder returns 404; the old-image data proof is its completed bootstrap and
model writes. HEAD initially exits in **6,666 ms**, serves no HTTP with missing
indexes, and supplies the documented `persistence:indexes` remedy. With writers
stopped, inspect reports unready, explicit ensure and re-inspect report all
**49 scopes / 20 collections ready**, then HEAD's branded home returns **200**
after the normal root redirect. All six canonical BSON sentinel snapshots are
unchanged. No data repair, index drop or automatic DDL is used.

[runtime.json](runtime.json), [dependencies.json](dependencies.json) and
[test-harness.json](test-harness.json) identify tested content and retained
coverage. [cleanup.json](cleanup.json) records owned resource cleanup and
unchanged retained image identities. No quota or usage limit was encountered.

## Deliberately unchanged

No qualifying defect is deliberately left unfixed. C2's documented null-timestamp
difference remains: driver reads omit legacy null timestamps while Waterline
refuses them. ADR0003 remains accepted. G-TX stays CLOSED / OPS-TX-01 undecided;
P6, P7/U, P8/V, P9/B, atomic S/P10.4 and P11/P12 remain gated. Records/
DeletedRecord, CAS/lifecycle, permanent identity, U/authorization, Counter and
attachment OID rebind retain their Waterline/native owners. No selector,
dependency pin, deployment topology or application Compose file changed.

Private institution hooks/data/query dialects and official-release qualification
remain outside this public fixture review. The source-import deadline and
existing pending cases are preserved; Solr-before-ready and the Agenda watchdog
retain their previous independent disposition. Failed fixture setup/concurrent-build
attempts are excluded explicitly; no assertion, timeout, healthcheck, budget or
skip is relaxed. The retained client-closure test now asserts the controlled
cache error class/code/message and absence of a native cause, replacing its old
native-message regex while keeping both no-fallback assertions. Nothing is pushed; cleanup and final worktree status are checked
after acceptance evidence is committed.
