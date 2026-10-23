# P7 production prerequisite: offline portal configuration

Source `6dad9b837b53283e4c36c84f3391a808b520b0a7`. Node **26.11.1**, npm
**11.20.0**. No dependency change or existing test/assertion/timeout change.

`configuration/portal.ts`, exported through the narrow configuration entrypoint,
now composes **43 startup sections**, including the existing **16 core job
declarations**. It supports selected extension declarations, awaited explicit
ESM/CommonJS files, named environment inputs and CLI values using the existing
resolution/precedence implementation. It supplies domain defaults without loading
the legacy config barrel/logger or reading legacy environment settings at import.
Opaque stored DSL sections remain plain data and require their domain's existing
awaited readiness/validation; this loader is not a substitute for those checks.

The loader defaults `bootstrapAlways` to **false**. The session section can be
filled across configuration layers but must pass complete validation before the
loader returns. No session secret is supplied by core defaults. This avoids
reintroducing the comparison host's known default secret. Administrator settings,
logging, bootstrap path and selected Solr settings have explicit named environment
inputs; the loader does not read arbitrary nested environment variables.

Regular-expression URI rules use validated plain `{source, flags}` data. The
sanitizer materializes the expression locally without modifying the frozen startup
configuration. Only the three named sanitizer-hook function positions are allowed.
The known ONI model default is deliberately projected to plain configuration data;
arbitrary branded objects still fail. Form validators remain owned implementation
code rather than arbitrary executable startup configuration.

The existing comparison queue and Companion settings now reuse `agendaQueueJobs`
and `companionDefaults`. The former contains pure job data; the latter converts
an explicitly supplied environment and warning callback. Only the comparison
`companion.config` reads process environment/logs. The development extension's v6
entrypoint deliberately converts its root redirect/no-cache data to `page` settings;
the comparison registration retains its existing spelling.

The real bundled extension exposed another producer defect: DOI bindings with no
default emitted `defaultValue: undefined` inside array members. `createDefaultBinding`
now omits that absent optional member, retaining explicit defaults. Configuration
validation was not loosened to accept non-JSON values.

## Commands and results

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/redbox-hook-dev/tsconfig.json
node --test --test-reporter=tap packages/redbox-core/test/qualification/portal-configuration.cjs
```

Both TypeScript emissions **exit 0**. The final compiled qualification completed
**7 passing / 0 failing / 0 skipped**, exit 0, **2104.648313 ms**, without force-exit.
It covers required secrets, immutable defaults, actual ESM top-level await and CJS
files, extension/file/environment/CLI precedence, invalid record pipeline data,
invalid/stateful URI expressions, legacy lifecycle rejection, undeclared functions,
branded values, value-free diagnostics, actual DOMPurify behavior against the
existing configuration, real bundled development declarations/forms, explicit
Companion credential conversion and a fresh-process import graph. The graph
excludes CoreBase/CoreService/Sails/comparison/logger/environment-adapter imports.
No database/listener/worker is required or opened by these offline checks.

Build logs: `.tmp/sails-retirement/p7/portal-configuration-build-qualified.log`
and `portal-configuration-devhook-build.log`. Final qualification log:
`.tmp/sails-retirement/p7/portal-configuration-qualified-final7.log`.

From `packages/redbox-core`, with the absolute Node-26 toolchain bin on PATH:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/DomSanitizerService.test.ts test/services/AgendaQueueService.test.ts \
  test/config/agendaQueue.test.ts test/configuration/resolution.test.ts \
  test/configuration/deployment.test.ts
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/configmodels/DoiPublishing.test.ts
```

Existing focused suites: **104 passing / 0 failed / 0 pending**, exit 0, about
five seconds; unchanged DOI configuration suite **2 passing / 0 failed / 0 pending**,
exit 0. Logs: `.tmp/sails-retirement/p7/portal-configuration-existing.log` and
`portal-configuration-doi-existing.log`. Focused formatting/lint and `git diff
--check` passed; oxlint reported **0 warnings / 0 errors**. The pre-existing
format of the large DOMPurify/DOI configuration files was retained around their
single changed lines to avoid unrelated formatting changes.

The 104 cases comprise **DomSanitizerService 34**, **AgendaQueueService 58**,
**branding-typeface job configuration 3**, **startup resolution 3**, **offline
awaited configuration loading 2**, **deployment conversion 3**, and
**createAgendaForBackend 1**. All have zero failures/pending.

Development attempts: Zod rejects `.partial()` on an object with refinements;
per-layer session validation now uses the explicit structural shape, and final
validation retains the original complete session/connection refinements. The
first compiled six-case aggregate returned **5 passing / 1 failing** because the
real development DOI declaration contained the absent optional binding member
described above. After the producer fix, six cases passed; the final seventh case
also qualifies explicit Companion conversion. No failed attempt is counted as
passing qualification.

This removes the previously missing domain-default resolution prerequisite. It
does **not** instantiate the complete selected module/provider graph, run all
bootstrap/migration stages, provide the full production Express executable, or
complete SR-046/047/048/049/050. Earlier source-58 artifact/recovery evidence remains
scoped to its recorded source.


The full unchanged core suite at source
`6dad9b837b53283e4c36c84f3391a808b520b0a7` passed **4481 passing / 7 unchanged
explicitly pending / 0 failing**, exit **0**, with all four Mongo environment
inputs shown in the P7 qualification record. The owned foundation scratch databases
`wr_p1_core` and `wr_p1_storage` were reset before the run. Log:
`.tmp/sails-retirement/p7/core-6dad9b837.log`. No runtime source changed during
that invocation.

The subsequent bundled-declaration check adds the actual storage and PDF
registrations to the development registration. This exposed an omitted `pdfgen`
section in the portal schema; the optional section now checks the declared
readiness/retry and PDF-option fields. After compiling core, the seven-case
qualification passed **7 / 0 / 0**, exit **0**, 3217.732315 ms. Logs:
`portal-all-bundled-build.log` and `portal-all-bundled-qualified.log` under
`.tmp/sails-retirement/p7/`. The first attempt returned **6 passing / 1 failing**
because this checkout does not install PDF at the root; the compiled-source
qualifier now imports the actual built PDF package from its package directory.
The installed packed consumer continues to resolve its public package export.
No dependency or test assertion was removed.

The existing packed consumer gains two checks (18 → 20): the public installed
record-trigger export and offline portal configuration from all actual bundled
providers. Synthetic test-only providers are excluded from portal configuration
because their deliberately arbitrary `packedESM` section is not a production
portal setting. Their original loader/precedence assertions remain. This test
extension covers newly introduced public surface and the real bundled graph;
it does not weaken existing coverage. A fresh packed run is recorded separately
once it completes.

## Typed domain data before acquisition

The next configuration slice intersects the final startup type with
`PortalDomainConfiguration` and validates it against the shipped generated JSON
Schema. The schema comes from the existing record/workflow/dashboard/workspace,
i18n/vocabulary/Solr/search/query/action/email/branding/CSP/reusable-form interfaces;
it does not introduce a second handwritten domain model. AJV performs no coercion
or default mutation. The existing Luxon dependency validates `date-time` values.
Schema diagnostics retain paths without including private input values. Integration
pins now require their real identifying fields and create/update schema kind.

`generate:portal-config` writes the schema; `check:portal-config` rejects drift and
is part of core build. `resolveJsonModule` copies it to the installed `dist` tree;
installed startup does not need TypeScript or the schema generator. No dependency
or version changed. The source JSON is a generated runtime contract, not a log.

With the absolute Node **26.11.1** toolchain on PATH, these commands exited **0**:

```sh
node packages/redbox-core/scripts/portal-configuration-schema.cjs
node packages/redbox-core/scripts/portal-configuration-schema.cjs --check
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
node --test packages/redbox-core/test/qualification/portal-configuration.cjs
```

The final aggregate reports **7 passing / 0 failing / 0 skipped**. Logs:
`.tmp/sails-retirement/p7/portal-schema-format.log`,
`portal-schema-build-final.log`, and `portal-schema-qualification-final.log`.
Additional malformed domain inputs extend the new qualification; no existing test
was removed or relaxed. Earlier attempts exposed the schema generator API's
compiler-option conversion and unknown date format handling. The script now uses
TypeScript's parsed compiler options directly, and supplies a real date-time
validator. A new negative Solr case initially used a string port, which the existing
interface explicitly permits; its input now uses an invalid object. The earlier
6/1 results are not counted as successful qualification. Generated output is
formatted deterministically with the existing core Prettier dependency.
