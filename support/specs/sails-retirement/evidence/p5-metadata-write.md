# SR-032 — Protected metadata writes

Completed 2026-10-24 on `stack/sails-retirement`, parent `01144a6e4`.
Read/domain/form delivery slices and released-v5 comparison are in
[p5-metadata-read.md](p5-metadata-read.md). Authentication/CSRF prerequisites are
[p6-auth-csrf.md](p6-auth-csrf.md). This closes the remaining **22/63** SR-032
route declarations; all **63/63** now have explicit standalone mounts.

## Implementation and contracts

`http/express/configurationWrites.ts` binds effective policies and the required
CSRF middleware before validation or domain dispatch. REST mounts allow only the
independently verified bearer exemption; browser mounts always require session
CSRF. Uses the existing application-owned AppConfigs, I18nEntries and
DashboardConfig instances, including the selected extension override. No legacy
controller, fallback host, service locator or duplicated persistence algorithm.

API config save returns the submitted configuration; form save returns the saved
masked configuration. Reset returns resolved defaults with the existing source
header. Form `_csrf` is excluded from persisted arbitrary configuration/bundle
payloads. Translation wildcard segments are joined once after Express decoding;
entry HTML sanitization and bundle flag coercion use the existing operations.
Entry deletion and bundle-enabled changes each await the previously controller-owned
best-effort cache reload; setEntry/setBundle already reload in their domain and
are not reloaded twice. Every dashboard API/admin validate/save/copy alias uses the
same revision/fingerprint operations. Shared `dashboardResponses.ts` preserves
structured typed errors and all retired read/write 410 guidance.

The full-core Mocha configuration now excludes the three new standalone auth/CSRF
fixtures from its incompatible legacy-global bootstrap, consistent with the prior
standalone suites. They actually ran separately, not counted as skipped core proof.

## Actual host and commands

Linux x86_64; Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**,
Mocha **11.7.6**, Bruno **3.5.2**, Express **5.2.1**, csrf-sync **4.2.1**,
Prisma ORM **8.0.0-rc.19** / CLI **8.0.0-rc.24**, driver **7.7.0**.
Docker container `sr-p5-mongo8`, **mongo:8.0.34**, id
`22087fb1ca2c22efb5f31077e462f3631120a66b4517b00c8393b552aa75f3e4`,
`127.0.0.1:34903`. Each fixture uses a fresh disposable database.
No dependency changes in this slice.

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core run lint
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
  npm --prefix packages/redbox-core run test:http-configuration:mongo
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
# cwd packages/redbox-core; same qualified Node PATH
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/AppConfigService.test.ts test/services/I18nEntriesService.test.ts \
  test/services/TranslationService.test.ts test/services/DashboardConfigService.test.ts \
  test/controllers/webservice/AppConfigController.test.ts \
  test/controllers/webservice/TranslationController.test.ts \
  test/controllers/webservice/DashboardConfigController.test.ts
```

Complete build (including contract copying), application typecheck, final lint and
inventory check passed. Lint's first run flagged a control-character regex; it was
replaced with the surrounding character-code style. Regression: **207 passing**,
zero failures/pending. Standalone Mongo HTTP: **27 passing**, zero failures/pending;
includes existing Bruno requests (**4/4 requests, 8/8 tests**) plus new persisted
write/read Bruno (**2/2 requests, 2/2 tests**), no skips. Logs are summarized from
`.tmp/sails-retirement/p5-metadata-writes-{build,types2,lint2,http2,regression}.log`.

The first Mongo run was **24 passing / 3 failing**: deletion did not invalidate the
runtime (fixed the missing reload), the helper assumed a JSON body on legacy empty
403 responses (fixed parsing), and the abort persistence assertion used wrong
physical field names (corrected to configKey/configData). The final run retains
all assertions and passes. Actual negatives cover anonymous/other-brand/wrong-role,
forged bearer, cookie API without token, browser bearer without token, missing and
invalid tokens, malformed bodies/entries/flags, stale dashboard revisions and
sanitized backend failure. A real admitted write survives client abort and an
observable failed stop deadline, persists before retry cleanup, and closes its cache.

Inventory: **333 declarations, 75 standalone, 258 remaining**; SR-032 **63/63**.
Full-core regression is deferred until the remaining requested read groups close.
This fixture's form-record loader is deliberately metadata-only; it does not claim
SR-034 storage/export/schema ownership or institution/provider qualification.

## Integrated comparison regression correction

The subsequent full Mongo-backed core invocation exposed translation chronicle
regressions missed by the initial focused suites. Namespace projection remains in
one owned operation; an optional, typed outcome observer now restores the
comparison controller's metadata-removal, packaged-file and missing-namespace
markers without returning translation content to telemetry. Chronicle test doubles
now bind the new getNamespace/listLanguages service boundary; their response,
error-count, original-error-message and no-content-capture assertions remain.

Current-source clean build, subsequent production TypeScript emission/Prisma copy,
application typecheck and core lint passed. In `packages/redbox-core`, qualified
Node 26 with `TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types
-r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js --no-config
--require chai --require test/setup.ts --timeout 5000` and
`test/controllers/RequestChronicleControllers.test.ts`,
`test/services/RequestChronicleServices.test.ts`, `test/http/Policies.test.ts`,
`test/unit/startup-module-loading.test.ts`, `test/services/UsersService.test.ts`,
`test/controllers/UserController.test.ts`: **177 passing, zero failing/pending**.
Logs: `p5-final-regression-fixes2.log`, `p5-final-fixes-build.log`,
`p5-final-source-{compile,types,lint}.log`. Integrated full-core results are in
[p5-record-reads.md](p5-record-reads.md).
