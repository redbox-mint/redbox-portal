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
