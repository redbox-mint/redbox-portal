# P8 V validation

G-V / P8.1–P8.6 **PASS for bounded `next`**. G-V qualification uses **TX-PARITY-01: strict Waterline parity, sequential writes,
no transactions** on standalone MongoDB 9.0.4 / FCV 9.0. The adapter commit
`463f13c66` kept the default Waterline; qualification commit `f9434660a`
records the accepted matrix. The independent P8.6 promotion `38e7082b6` changes the current
default to MongoDB, with [omitted-selector evidence](evidence/p8-v/promotion.json).
Explicit Waterline rollback and all seven model definitions remain.
Pre-V checkpoint: `0ea5e9bc22396f02d184bc341194a3a579477320`.

V covers Vocabulary, VocabularyEntry, FigshareVocabularySource,
FigshareVocabularyCategory, FigshareVocabularyCrosswalk,
FigshareVocabularyCrosswalkMapping and FigshareVocabularySyncRun. The three
services use named operations over plain DTOs; the four V named-query catalogue
targets route by selector. The [consumer inventory](evidence/p8-v/consumers.json)
records 145 replaced direct calls and indirect controller/policy/bootstrap/form
consumers. The B-owned brand-name reader remains an explicit Waterline bridge;
retained V callbacks/models and query readers support rollback/P11. No generic
CRUD facade, session, driver type or per-model pool is exposed.

| Evidence | Result |
| --- | --- |
| [Loaded physical spike](evidence/p8-v/spike.json) | All seven actual Waterline definitions on pinned 9.0.4: ObjectId identities/associations, string sync-run references, ISO string timestamps, missing/null/defaults, JSON snapshots and relationship fields. Safe mode creates only `_id`, regardless of entity index declarations. |
| [Live contract](evidence/p8-v/contract.json) | 31 passing / 0 failing: both raw write/read directions, all-seven entities, loaded validations/errors, real service flows, mixed clients/processes, restart and configuration rollback, controlled overlap, injected failures/recovery, named-query tenancy, model bypass, stale handles and no-DDL readiness. |
| [Installed index command](evidence/p8-v/verification.json) | 16 passing / 0 failing, including explicit V inspect/ensure of 21 scopes without adding uniqueness or rewriting duplicates/default empty keys. Pre-promotion omitted selectors prepare 49 scopes across 20 collections. |
| [Existing selector matrix](evidence/p8-v/verification.json) | Per selector: core **4,317 passing / 117 pending**; portal Mocha **22 passing / 2 pending**; Bruno General **309 requests / 553 tests / 3 assertions**, including 22 vocabulary API requests; no failures. |
| [Operations](evidence/p8-v/operations.json) | Three alternating sample pairs; all-seven-entity read mix and entry/source revisions; every provisional budget passes. |
| [Pre-V artifact](evidence/p8-v/prior-artifact.json) | Locally built ARM64 installed pre-V runtime; original source-machine image unavailable. Nine reported prior-runtime cases (all-seven reads, vocabulary update and entry create); current driver readback passes two checks. [Rehearsal](evidence/p8-v/rollback.json). |

The callback extraction preserves create/update timing, slug stripping and
regeneration, source keys, scalar/default coercion, lowercase fields, actor/enums,
revision/approval and required run validation. Representative required/null/type
errors match loaded Waterline `name`, `code`, message and details; batch errors,
duplicate `findOne` (no invented code) and retained unique-index errors also match.
Historical omitted fields stay omitted without read-time defaults or rewriting.
Unsupported loaded mappings/callback overrides, BSON and collations refuse driver
startup/reads with guidance rather than rewriting or falling back.

The following baseline quirks are deliberately retained and candidates for
separate decisions:

- A partial entry update without submitted `id` can parent itself. Cycle and
  same-vocabulary checks depend on submitted ID/vocabulary. Identifier lookup
  trims whitespace while storage retains the untrimmed identifier.
- Omitted Figshare category `path` becomes null and fails the callback. Removing
  a source-key field from an update patch does not unset the stored key.
- Safe-mode Waterline does not install declared unique indexes. V adds 21
  **nonunique** lookup indexes, including source keys; the default empty Figshare
  source key would violate the declared sparse uniqueness. Compatible existing
  operator-installed uniqueness is retained, never dropped or added silently.
- The `applying` latch selects IDs, writes those IDs without rechecking state,
  and fetches results. Controlled overlap proves **two winners on each backend**;
  a subsequent sequential claim misses. Terminal transition checks remain in
  the service. Restart retains `applying`; it does not infer safe worker expiry.
- Reorder failure at step two keeps step one; approval failure keeps earlier
  approved mappings with a draft crosswalk; failed resync keeps earlier mirror
  changes and the old source cursor; failed RVA metadata keeps imported entries
  and the same wrapper error. Fresh preview/resync and RVA retry recover.
- Fresh apply removes registered new objects and leaves a failed terminal run.
  A clone helper that fails before registration can leave an orphan vocabulary
  with its first entry. Neither backend rolls those earlier writes back.

The operational workload uses 30 warmups and 250 cycles per sample, reading a
vocabulary, searched/paged entries, source, categories, crosswalk, mappings and
run, and revising entry order/source cursor. Ratios are ratios of three backend
means; these synthetic limits qualify bounded `next`, not production capacity.

| Metric | MongoDB / Waterline | Provisional limit |
| --- | ---: | ---: |
| p95 | 0.72744 | <=1.20 |
| Throughput | 1.55990 | >=0.90 |
| RSS | 0.99303 | <=1.10 |
| Database calls | 1.00000 | <=1.25 |

Maximum readiness is **116.47ms** (<250ms). Each driver sample uses one shared
foundation client; all six samples make 4,200 DB calls and return to the observer
connection baseline of three. The observer is stabilized before measurement.
[Excluded attempts](evidence/p8-v/attempts.json) retain initial startup timeout,
stale integration-fixture access and preliminary observer-sampling failures.

Run from the repository with the phase-zero Node **24.16.0** / npm **11.20.0**
environment (`source .tmp/tx-parity-phase0/env.sh`). Main dependencies/locks are
unchanged; Bruno's exact locked tools are installed only in a disposable copy.
Heavy commands run sequentially under external timeouts. The self-cleaning live
runner is:

```bash
timeout 600 npm --prefix packages/redbox-core run test:vocabulary-transition
# Includes the contract before the operations comparison:
timeout 900 npm --prefix packages/redbox-core run test:vocabulary-operations
```

Core qualification runs in each selector environment:

```bash
for backend in waterline mongodb; do
  sails_persistence__groups__vocabulary__backend=$backend \
    timeout 600 npm --prefix packages/redbox-core test -- \
    --exclude test/unit/startup-module-loading.test.ts
  sails_persistence__groups__vocabulary__backend=$backend \
    timeout 90 npm --prefix packages/redbox-core test -- --no-config \
    --node-option no-experimental-strip-types \
    --require ts-node/register/transpile-only --require chai --require test/setup.ts \
    --timeout 5000 test/unit/startup-module-loading.test.ts
done
```

Each environment passes **4,317 / 117 existing pending / 0 failed**. The isolated
startup test retains its unchanged 12,000ms internal deadline (10.395/10.441s);
the first combined run's timeout is recorded. Unit model doubles use the
Waterline seam; live fixtures exercise the actual two adapters. Build, strict
persistence types, root types and lint pass. The focused existing service/model
selection passes 160 tests. The [verification manifest](evidence/p8-v/verification.json) retains counts and
log hashes. [Exact runner recipes](evidence/p8-v/runners/README.md) reproduce the
portal/API matrix and installed CLI rehearsal:

```bash
timeout 900 bash .tmp/wrp8/run-portal.sh waterline
timeout 900 bash .tmp/wrp8/run-portal.sh mongodb
timeout 2400 bash .tmp/wrp8/run-bruno-matrix.sh
timeout 900 bash .tmp/wrp8/run-index.sh
```

Mocha retains existing config/bootstrap and the seven affected test files; the
overlay omits frontend/nyc/install work. Two optional external cases are pending.
General uses unmodified stock directories 1–4 and pinned General Keycloak26.5.6;
Solr retains the Mocha-base digest. RVA requests tolerate external unavailability,
so they do not certify live upstream uptime. The initial Mocha fixture addressed
a non-exported service field; it now stubs/restores the public configuration
getter. The first Bruno attempt used newer Mocha Keycloak26.8.1 and failed OIDC
login; the stock General image passes both selectors. The long-lived task Mongo
was OOM-killed at 512MiB during mongosh DDL, before index tests; the same volume
passes at 1536MiB with WiredTiger still 0.25GiB. The installed Compose start lacks
--wait; a bounded health poll handles that local tooling difference.

[Operations and rollback](p8-v-operations.md) describe writer draining, index
preparation, partial-write inspection and restart. The retained prior artifact
contains installed ARM64 dependencies and compiled pre-V core/storage/internal
packages, not a clean production-pruned complete private portal/assets image.
It proves local binary/runtime compatibility; institutions must retain/rehearse
their actual deployment image, mappings, hooks, auth and data. No source-machine
artifact or private institution configuration was available here.

MongoDB 9.0.4 ran the actual sails-mongo Waterline baseline and official 7.7.0
driver on this ARM64 kernel without a replica set. No transaction or topology
conversion was performed. This is bounded `next` evidence; official release,
private institution qualification, full S and P11/P12 remain separate.


The separate default promotion passes the self-cleaning packaged runner (**31
parity + 6 omitted-default/rollback cases**), full default core (**4,317 passing /
117 pending**), the installed CLI (**16 cases; 70 scopes / 27 collections**), and
fresh default portal Mocha (**22 passing / 2 optional pending**). V model queries
are made throwing in the default live check: all-seven reads and driver writes
succeed, explicit Waterline rollback reads/writes those objects, and a fresh
omitted-selector driver instance reads the rollback writes. Build, persistence/
root types and lint pass. U/B remain Waterline; all ten supplied Compose/template
V fallbacks now agree with the core selector. See the [promotion manifest](evidence/p8-v/promotion.json)
and `timeout 2400 bash .tmp/wrp8/run-promotion.sh` recipe. The initial default
core attempt had two database-free bootstrap fixtures missing their explicit V
Waterline selection; correcting the fixtures preserves their original ordering
purpose without adding runtime fallback or relaxing readiness. That failed run
is retained in the attempts ledger. Both explicit-selector Bruno runs already
passed; the default promotion uses the live/portal omission checks rather than
repeating the same API requests.


[Cleanup](evidence/p8-v/cleanup.json) verifies zero task containers/networks/named
volumes, both main anonymous volume destruction events, removal of the prior
Docker image, and all 13 exact task-created build-cache records removed. The
three unrelated development containers remain running; no global prune was
used. The ignored local archive `.tmp/wrp8/prior-0ea5e9bc2.tar` is 723,557,888 bytes,
SHA-256 `321e678c626f7883306209e1cbdc257afaf08185b38ce7ee99f5218692a44091`.
The [rollback record](evidence/p8-v/rollback.json) includes its load command and
original image/source identity. No push or PR was created. Repository locks and
dependency versions are unchanged.
