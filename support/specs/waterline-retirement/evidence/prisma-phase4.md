# Prisma phase 4 — V and B

2026-10-22; base `b40386f63`, worktree `t3-815a2a6e`, local branch
`t3/waterline-retirement`. Node 24.16.0/npm 11.20.0, Prisma 8.0.0-rc.24 and
orm-mongo 8.0.0-rc.19 unchanged. Heavy commands have external timeouts. Only
disposable `wrpz4-*` Docker resources and MongoDB
`9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`;
no transactions or new constraints.

## Vocabulary V

Inventory: the seven Waterline definitions, VocabularyService,
FigshareVocabularyService, RvaImportService, controllers, bootstrap writers,
normalization/field contracts and P8 physical captures. No real extension fields
were found. Declare **110 fields** including ObjectId `_id` and ISO string audits:
Vocabulary 15, VocabularyEntry 12, FigshareVocabularySource 15,
FigshareVocabularyCategory 15, FigshareVocabularyCrosswalk 13,
FigshareVocabularyCrosswalkMapping 12, FigshareVocabularySyncRun 28. Association
fields remain ObjectId; run source/localVocabulary/crosswalk references remain
strings. Category path, mapping evidence and run snapshot/diff/proposals/summary/
warnings/result are Json. Inverse entries/children are excluded. **No fixture-only
fields were added.** Unknown probe fields are omitted from model reads and
preserved physically by patches; optional missing reads return null (V-09).

Driver CRUD is deleted. Model create/createAll/find/patch/delete, selected-ID
counts and conditional after-images retain the plain operations, validations,
callbacks, supplied-field patches and ordered partial effects. Invalid identity
query strings still miss, allowing slug resolution. Preview expiration rechecks
its predicate per selected ID. V-06 is **improved**: overlapping applying claims
have one Prisma winner versus two loaded Waterline winners. V-01–05/07–08 remain
preserved, including self-parenting, source-key removal, duplicates and partial
clone/reorder/approval/resync/RVA effects. No transaction or recovery inference.

Raw use: only stored named-query translation (V-PG-01) and operator-unique duplicate
audits (V-PG-02). Catalog/DDL uses Prisma control APIs; buildInfo is the sole
retained native V call (V-PG-03, unsupported server-version API).

Validation: initial compilation found no model count method; selected-ID model
reads replace it. Early fixture runs corrected a test import typo, accepted null
comparison and invalid-ID lookup handling; a typed count filter did not encode
ObjectIds, so counts now stay in the model API. Final transition command:
`timeout 420s npm --prefix packages/redbox-core run test:vocabulary-transition`
**28 passed / 0 failed**, including **14 entity directions**. Core compilation
and generated artifact copy pass. No mixed-process campaign or prior image runs.

## Branding B

Inventory: BrandingConfig/BrandingConfigHistory definitions, BrandingService,
logo/typeface/theme services and controllers, default branding bootstrap data,
the two pending migration bodies and P9 loaded/physical captures. Declare **26
real fields**, 13 per model: config name/css, variables/logo/favicon/typeface/
draftTypeface (Json), version/hash/draftRevision; history branding (ObjectId),
version/hash/css, variables/typeface (Json), actorId/actorDisplayName,
restoredFromVersion/dateCreated. Each includes ObjectId `_id` and string
createdAt/updatedAt. Roles are an inverse U-owned relationship, not a stored
config field. A multiline variables decorator was included before the successful
build. The field audit matches all nine V/B models exactly; **no fixture-only
fields were added**.

Config uses the core contract/client (`mongodb`), history the now-populated
storage contract/client (`redboxStorage`). Both borrow runtime-owned pools;
compatible one-server policies can share a pool, while separate servers retain
independent pools/clients. No history relocation, session or transaction.
The common duplicate-audit helper now selects the descriptor's datastore/client:
fixtures install compatible operator uniqueness in history and place duplicate
decoys in the core namespace, verifying the correct audit on both topologies.

Driver adapter deleted. Model conditional updates preserve B-01 for both draft
and publish. Service order remains history insert, conditional publish, then
compensation only for certified not-applied outcomes (or best-effort conflict
compensation); unknown-before/after outcomes retain recovery evidence and the
existing retry behavior. B-02–11 remain preserved, including asset/cache effects,
missing-counter conflicts, restore/pruning, CSS normalization and compensation
failures. B-12 accepts null-for-missing model reads while patches preserve stored
absence and unknown fields. Invalid identity strings still miss.

Pending migrations and V brand-name lookup use B repositories. The frozen
sidebar method uses variable-only model patches on both clients, bypassing only
today's CSS allowlist and leaving audits/CSS/hash/counters unchanged. Waterline's
native sidebar helper is deleted and fallback borrows the same model operation
with loaded datastore/collection bindings. Typeface backfill has explicit
repository presence checks: missing JSON fields become stored null once, and
reruns do not rewrite timestamps. Historical pruning/order/ledger identities
are unchanged.

The remaining history named target also moves off Waterline and uses the storage
client. It retains tenant scope, dotted JSON paths, projection/page/sort/count,
zero-row and structured-equality refusal. Raw uses are this stored-expression
translator (B-PG-03) and operator-unique duplicate audits (B-PG-01); catalog/DDL
uses Prisma control, and per-datastore buildInfo alone remains native (B-PG-02).
There is **no raw operational CRUD** in either group.

`timeout 800s npm --prefix packages/redbox-core run test:branding-transition`
runs the adapted existing light contract on both layouts: **41 passed / 0 failed
per layout**, including four entity directions each, B-01 intervening writes,
history ordering, conflict/certified/unknown failures, asset/cache/restore effects,
lookup ownership, migration reruns and history query/audit datastore isolation.
Initial compilation found nullable loaded-model reflection and disjoint raw-client
union types; fixed with guarded mapping and explicit datastore branches. An added
query test initially used an unsupported operator alias; corrected to the existing
dialect. No process matrix/checkpoint restore or operations campaign was run.

## Final default verification and cleanup

Implementation commits: `8a0a1b493` (V), `c145584cf` (B). Selectors now accept
`prisma | waterline`, default Prisma; `mongodb` fails with migration guidance.
Both registers, selector/branding wiki pages, supplied Compose defaults and hook
templates are updated. Historical operations runner arguments now fail explicitly
with ADR 0004 guidance rather than silently running the light contract.

Commands use `.tmp/wrpz4/env.sh` (Node/npm above); logs/runners remain in
`.tmp/wrpz4/`. Final results, all **0 failed**:

- `timeout 420s npm --prefix packages/redbox-core run test:vocabulary-transition`:
  **28 passed**, 14 raw entity directions.
- `timeout 800s npm --prefix packages/redbox-core run test:branding-transition`:
  **41 passed per topology**, four raw entity directions per topology.
- `node .tmp/wrpz4/audit-fields.cjs`: **9 inventories passed**, 136 real fields.
- `npm --prefix packages/redbox-core run typecheck:persistence`, `check:prisma`
  and `lint`, each under external timeout: **PASS**. Both generated contracts
  are fresh. `timeout 240s npm --prefix packages/redbox-core run build`: **PASS**.
- `timeout 720s bash .tmp/wrpz4/run-core.sh`: full default core suite once,
  **4,308 passed / 108 pending** (4,307 plus the startup test in a fresh process;
  its unchanged deadline passed at 9,768 ms).
- `timeout 1200s bash .tmp/wrpz4/run-portal.sh`: standard portal Mocha cases,
  **419 passed / 10 pending**. Installed index inspection: **72 ready scopes /
  29 collections**, V/B Prisma.
- `timeout 1300s bash .tmp/wrpz4/run-bruno.sh`: General folders **1–4 only**,
  **309 requests / 553 tests / 3 assertions passed**.

Builds and broad suites ran sequentially. One short final contract-freshness
check inadvertently overlapped the tail of strict typechecking; both passed.
No extra campaign, prior image, mixed-instance matrix or browser run. Temporary
root dependency holds were restored. Final Docker name/label inspection finds
**zero owned containers, networks or volumes**; no images were built. Unrelated
`development-*` containers remain running. `.tmp/wrp8/prior-0ea5e9bc2.tar` is
intact: 723,557,888 bytes, SHA256
`321e678c626f7883306209e1cbdc257afaf08185b38ce7ee99f5218692a44091`.

## Phase 5 handoff

Migrate staged S in `packages/sails-hook-redbox-storage-mongo/src/persistence/`:
attachment metadata/journal/access audit, schema artifacts/references,
record/integration audits and revision maintenance. Inventory real fields first;
extend the shared core/storage contracts according to each existing logical
datastore and reuse runtime clients, preserving B history. Keep BSON Date schema
timestamps distinct from ISO-string model/record timestamps, and retain partial
effects, immutable artifact/digest/reference rules, revision guards and unknown
outcomes. Prefer model conditional/atomic writes; register each raw/native
exception. GridFS, U/full record lifecycle, Counter's approved atomic increment
and final Waterline removal remain later work.
