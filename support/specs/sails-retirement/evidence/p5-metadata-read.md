# SR-032 metadata read continuation

SR-032 remains partial. This slice extracts the existing workflow, workspace,
dashboard, translation runtime and record-schema implementations into owned domain
modules. Sails exports delegate to those implementations and keep their instances
and cleanup on the comparison application. There is no second operation algorithm
or standalone controller fallback. Schema contributor discovery and translation,
dashboard and schema caches are application-owned. The legacy schema logger
acquisition contract remains in the comparison adapter.

## Domain verification

Starting source: `313d0c02a`; subsequent source commits are recorded below.
Executed on the local Linux host with Node **26.11.1**, npm **11.20.0**,
TypeScript **5.9.3**, Mocha **11.7.6**, ts-node **10.9.2**. Dependencies were not
changed; package exports were added for narrow domain imports.

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core test -- --no-config \
  --node-option no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai \
  --require test/setup.ts --timeout 10000 \
  test/services/WorkflowStepsService.test.ts \
  test/services/WorkspaceTypesService.test.ts \
  test/services/DashboardConfigService.test.ts \
  test/services/DashboardTypesService.test.ts \
  test/services/DashboardLegacyConversion.test.ts \
  test/services/TranslationService.test.ts \
  test/services/I18nEntriesService.test.ts \
  test/services/RecordSchemaService.test.ts
npm run lint
git diff --check
```

Results: production build (including Prisma generation/copy), application
typecheck and lint pass; **248 passing, zero failing/pending** existing tests.
Lint: **936 files, zero errors/warnings**. Logs are summarized from
`.tmp/sails-retirement/p5-metadata-resume-{build,typecheck,regression,lint}.log`.

## Standalone HTTP verification

Real Mongo **8.0.34**, image `mongo:8.0.34`, owned disposable container
`22087fb1ca2c22efb5f31077e462f3631120a66b4517b00c8393b552aa75f3e4`,
loopback **34903**. Each fixture creates/drops its own database. Express **5.2.1**,
Passport **0.7.0**, express-session **1.19.0**, connect-mongo **6.0.0**,
Mongo driver **7.7.0**, Bruno **3.5.2**.

```sh
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
  npm --prefix packages/redbox-core run test:http-configuration:mongo
```

Result: **18 passing, zero failing/pending**. This includes actual execution of
four existing form/language/namespace Bruno requests, **8/8 tests**, zero skipped
requests. Log: `p5-metadata-resume-http2.log`.

Covers browser record/workflow/workspace/dashboard type reads, live dashboard
settings, consolidated views, dashboard configuration GET contracts/admin aliases,
retired-operation 410s, schema field discovery, migration preflight, localization
and AppConfig forms. Persists settings and checks runtime visibility, reloads the
application translation runtime, checks secret masking, missing targets, malformed
parameters/traversal, unauthenticated/wrong-brand/wrong-role, v1/v2, HEAD/OPTIONS,
selected hook operation, backend sanitization, isolation and abort/draining.

The initial AppConfig form assertion failed because its fixture inserted a secret
directly into Mongo after cache bootstrap. Using the existing owned
`createOrUpdateConfig` operation corrected the fixture; masking and denial assertions
then passed. Packaged localization fallback retains the raw legacy JSON payload;
persisted bundles/composed entries strip `_meta`. A focused assertion distinguishes
these cases. The stricter protected metadata authentication/brand membership is
listed in design §1.3. Public i18next namespace reads stay public.

This fixture's record loader uses a persisted metadata fixture collection, not a
qualification of record storage/export providers. Forms without HTML/vocabulary
fields are covered; the remaining browser record-form GETs need those collaborators.
Protected writes require SR-039. No SR-033/034, auth-provider, CSRF, mutation,
upload, page or progress completion is claimed by this evidence.

Domain extraction commit: `a2f672922`. The final HTTP build and compiled import
qualification also pass (`p5-metadata-qualified-build.log`,
`p5-metadata-qualified-pilot.log`: **24 passing, zero failing/pending**).
The compiled guard rejects Sails, compatibility, controllers and the core barrel.
Inventory generation/check reports **332 total, 41 standalone, 291 remaining**;
SR-032 has **39/63** declarations verified. This is the prior six API reads plus
32 metadata GETs and the AppConfig form GET. The source inventory is offline.

## Browser record-form GETs

Continuation after `9d7ad06c5`: the two `RecordController.getForm` declarations
share the HTTP-independent `forms/FormDelivery.ts` operation with the comparison
controller. The fingerprint composition moved once to `RecordFormFingerprint.ts`;
the existing authoritative save routine delegates to it. Vocabulary operations,
prehydration and context-variable evaluation now take explicit inputs. The owned
sanitizer lazily creates/closes its own JSDOM window and purifier; only the
comparison adapter supplies the legacy global `DOMPurify` getter. Converted
service facades no longer use the process-wide instance cache. This extracts
vocabulary support; it does not mount vocabulary administration mutations.

Same exact host/tool versions and Mongo container as above. Executed:

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core test -- --no-config \
  --node-option no-experimental-strip-types --require ts-node/register/transpile-only \
  --require chai --require test/setup.ts --timeout 10000 \
  test/services/DomSanitizerService.test.ts test/services/VocabularyService.test.ts \
  test/services/FormPayloadPrehydrateService.test.ts test/utilities/ContextVariableUtils.test.ts
npm --prefix packages/redbox-core test -- --no-config \
  --node-option no-experimental-strip-types --require ts-node/register/transpile-only \
  --require chai --require test/setup.ts --timeout 10000 \
  test/controllers/RecordController.test.ts test/services/RecordsService.test.ts
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
  npm --prefix packages/redbox-core run test:http-configuration:mongo
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
  npm --prefix packages/redbox-core run test:http-pilot:mongo
npm run lint
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
```

Results: build/typecheck pass; collaborator regressions **85 passing**, existing
record controller/service regressions **437 passing**, Mongo HTTP **19 passing**
(including four Bruno requests, **8/8 tests**), compiled pilot **24 passing**.
All these suites have **zero failures/pending/skips**. Lint **946 files**, zero
errors/warnings. Logs: `p5-form-collaborators-tests.log`,
`p5-form-delivery-{build,typecheck4,regression3,qualified-http,qualified-pilot,qualified-lint}.log`.
No dependency versions changed; the vocabulary public export was added.

The HTTP tests use persisted vocabulary entries for inline options and selected
checkbox-tree prehydration, actual HTML sanitization, authoritative saved form
selection, create/edit/view, context variables, operation discovery, matching
create/edit fingerprints, record revision/ETag, v1 raw/v2 metadata envelopes,
missing objects, conflicting form confirmation, malformed parameters and
unauthenticated/wrong-brand/wrong-role denial. The loader remains the named
persisted metadata fixture collection; storage/provider qualification is SR-034.

Intermediate regression runs failed because composition eagerly accessed an
unused legacy collaborator before missing/error results. Making that comparison
lookup lazy restored the error ordering. Two lint imports became obsolete after
extraction and were removed. A storage-error fixture now supplies its real
required brand ID, so the intended storage failure remains reachable after the
explicit form brand check; its error assertions remain intact. The design names
this tenant-isolation tightening and affected record-form clients.

Inventory: **43/332 standalone**, **41/63 SR-032**. All SR-032 reads are now
verified; its **22 protected writes/previews remain unmounted** pending SR-039.
The task checkbox remains unchecked.
