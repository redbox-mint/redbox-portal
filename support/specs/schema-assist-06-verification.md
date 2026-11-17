# Schema assistance PR 6: compatibility and release verification

Branch: `stack/schema-assist-06-verification`, based on PR 5 commit
`23c03b35a7843d75b90511ed629f9c11cc61a4cb`. Earlier PR handoffs are retained as
implementation context. This document records final-stack verification, not
publication or a production deployment.

## Environment and execution discipline

Node 24.22.1, Chromium 156 for Karma and Playwright Chromium headless shell 1248.
Installs, compilers, tests, builds and Docker stacks ran serially on the shared
2-CPU worker, each under an external `timeout`. No subagents were used.
Dependencies were installed one package at a time with
`timeout 600 npm install --include=dev --no-save --ignore-scripts --strict-peer-deps`
(and `--include=optional` for Angular platform binaries). No dependency versions
or lockfiles changed.

All databases were disposable. Mongo used `mongo:latest`, verified as **9.0.4**;
no Mongo 7 or 8 image was used. Local Compose overrides limited heaps/CPU, used
cached Solr/Keycloak images, and mounted the host Node 24 binary because the
cached portal image's binary was newer. Those machine-specific overrides remain
under ignored `.tmp/schema-assist-06/`.

`tailscale status --json` supplied `Self.DNSName`, without its trailing dot:
`nam-oci-agent-2.tail4a7c3.ts.net`. Docker published port 1536. The dev portal used
`REDBOX_PORTAL_APP_URL`, `APP_URL` and `sails_appUrl` set to
`http://nam-oci-agent-2.tail4a7c3.ts.net:1536`. T3 Browser loaded
`/default/rdmp/user/login`, then authenticated as the development administrator.
The owned browser tab was closed after verification.

Real CSRF was enabled in lifted Mocha with `RBPORTAL_TEST_CSRF=true`. The
Bruno/dev launcher passed actual boolean `security.csrf: true` to `sails.lift`;
`rc` preserves environment CSRF values as strings, which is insufficient for
Sails' strict boolean checks. No production CSRF route configuration changed.
The dev launcher also used boolean `angularDev: false`, disabled external RVA
bootstrap downloads, and set `recordSchema.enabled: false` to exercise the
real authorized partial-form fallback.

## Final results

| Suite | Pass | Fail | Pending |
|---|---:|---:|---:|
| sails-ng-common full suite | 421 | 0 | 0 |
| Focused core Mocha | 780 | 0 | 1 |
| portal-ng-common Angular | 132 | 0 | 0 |
| email-templates Angular | 232 | 0 | 0 |
| named-query-editor Angular | 190 | 0 | 0 |
| report-config Angular | 76 | 0 | 0 |
| Lifted Docker Mocha release contracts | 7 | 0 | 0 |
| Bruno named-query + report-config | 52 | 0 | 0 |
| Playwright schema-assisted release workflows | 3 | 0 | 0 |
| API route validation | 57 | 0 | 0 |
| Documentation tests | 4 | 0 | 0 |

Bruno executed **32 requests**, all successful. Playwright's final run took
24.4 seconds and used one worker. The single pending core case optionally
loads private SCU email templates: neither `SCU_EMAIL_REPO` nor
`SCU_EMAIL_FIXTURE` was supplied. Bundled SCU namespaced-form compatibility
coverage and the browser's namespaced-field workflow passed.

Production builds passed for `portal-ng-common`, `email-templates`,
`named-query-editor` and `report-config`. The saved-report runtime and local-auth
apps were also built for browser verification. Core emitting `tsc`, root Sails
`tsc`, prerequisite package compilation and Webpack passed. Build warnings about
bundle budgets, CommonJS packages and existing Sass deprecations remain warnings.

Logs are `/tmp/schema-assist-06-*.log`; screenshots are listed below. REST
generation passed Swagger Parser validation and wrote `openapi.json`,
`openapi.yaml`, `apidocs.apib` and `index.html` under
`support/docs/generated/api/`. All nine assistance route operations appear in
the generated OpenAPI document. Generated artifacts are ignored by Git, as in
the existing publishing workflow; their source metadata and wiki pages are
committed.

`npm run docs:generate` composed `.tmp/generated-docs-site/`, including the REST
reference, 42 published extension/form surfaces, schemas and catalogue.
`npm run docs:audit` completed with **820 advisory findings**: 97 unclassified
surfaces, 285 undocumented members, 310 missing parameter descriptions,
94 missing return descriptions, 30 missing examples and 4 invalid form examples.
The latter lack required `serverSyncOnSave` (and, in one case, `debugValue`)
properties. These concern unchanged catalogue sources/examples; no broken-link
findings were reported. The existing FieldDescriptionsService and
NamedQueryEditorService lifecycle classifications remain advisory catalogue
work, independent of the generated public REST route reference.

Final core `tsc`, the new tests' scoped TypeScript check, focused Prettier,
focused oxlint (zero warnings/errors) and `git diff --check` passed. The scoped
test check uses compiled package declarations and the same non-strict test
conventions as the repository, with DOM types for Playwright.

## Repeating the focused checks

After package compilation, run these serially, with an external timeout on every
command. Karma used `CHROME_BIN=/snap/bin/chromium`,
`NG_BUILD_MAX_WORKERS=1` and `NODE_OPTIONS=--max-old-space-size=4096`.

```bash
timeout 240 npm --prefix packages/sails-ng-common run test:full
cd angular
timeout 300 node_modules/.bin/ng build @researchdatabox/portal-ng-common --configuration production
# Repeat once per app: portal-ng-common, email-templates, named-query-editor, report-config.
timeout 360 node_modules/.bin/ng test @researchdatabox/report-config --watch=false --browsers=ChromeHeadlessNoSandbox --progress=false
# Repeat for each affected application after building the shared library.
timeout 360 node_modules/.bin/ng build @researchdatabox/report-config --configuration production --progress=false
```

Core Mocha was invoked from `packages/redbox-core` with
`TS_NODE_PROJECT=test/tsconfig.json`, `--no-config`,
`--node-option no-experimental-strip-types`,
`--require ts-node/register/transpile-only`, `--require ./node_modules/chai/index.js`,
`--require test/setup.ts`, `--timeout 15000`, and the following paths:

```text
test/services/Email*.test.ts
test/services/FieldDescriptionsService.test.ts
test/services/QueryReportContext.test.ts
test/services/NamedQuery*.test.ts
test/services/Report*.test.ts
test/controllers/EmailTemplateAdminController.test.ts
test/controllers/webservice/NamedQueryController.test.ts
test/controllers/webservice/NamedQueryAssistance.test.ts
test/controllers/webservice/ReportAssistance.test.ts
test/controllers/NamedQueryNotificationParams.test.ts
test/controllers/ReportControllerCsv.test.ts
test/services/PathRulesService.test.ts
test/unit/api-routes.test.ts
```

A separate disposable native Mongo instance enabled test failpoints;
`NAMED_QUERY_TEST_MONGO_URL=mongodb://127.0.0.1:27536` and
`NAMED_QUERY_TEST_MONGO_FAILPOINTS=true` exercised actual native execution,
`maxTimeMS`, deadlines and cleanup. The instance was removed afterward.

The new lifted suite is
`test/integration/services/SchemaAssistedEditors.test.ts`. It uses real Sails,
policies, sessions, CSRF, models and Mongo; no service mocks. Select it with
`RBPORTAL_MOCHA_TEST_PATHS=test/integration/services/SchemaAssistedEditors.test.ts`
using `support/integration-testing/docker-compose.mocha.yml`'s `mount` profile.
Set `RBPORTAL_TEST_CSRF=true` **inside the portal container**. The CSRF-negative
case skips under the legacy globally-disabled configuration; other cases remain
available. This release run enabled CSRF and skipped nothing.

Bruno used the `mount` profile of
`support/integration-testing/docker-compose.bruno.general.yml` and the existing
runner with folder arguments `1 - REST API/13 - Named Query` and
`1 - REST API/14 - Report Config`. The new requests use the normal bearer/session
patterns, and CSRF-negative requests carry a session cookie. The host-specific
scripts `run-lifted.sh` and `run-bruno.sh` in `.tmp/schema-assist-06/` preserve the
exact Compose invocations used on this worker.

## Browser fixture and workflows

`test/playwright/schema-assisted-editors.spec.ts` follows the existing email
suite pattern and uses the shared administrator storage state. The shared global
setup now fetches a CSRF token before login. To run it against an already-built,
isolated dev stack using the partial-form fallback:

```bash
timeout 600 env \
  NODE_OPTIONS=--max-old-space-size=2048 \
  PLAYWRIGHT_BASE_URL=http://nam-oci-agent-2.tail4a7c3.ts.net:1536 \
  SCHEMA_ASSIST_MONGO_URL=mongodb://127.0.0.1:27537 \
  SCHEMA_ASSIST_SCREENSHOT_DIR=/tmp/schema-assist-06-screenshots \
  node_modules/.bin/playwright test test/playwright/schema-assisted-editors.spec.ts --workers=1
```

`SCHEMA_ASSIST_MONGO_URL` explicitly opts into a disposable database; without it,
the workflow suite skips. The fixture temporarily augments and restores
`default-1.0-draft`'s effective form with Title, a custom contributors field and
the 19 bundled SCU namespaced fields. It adapts the delivered model's `value` to
a source-form `defaultValue`; no private hook checkout is needed. Queries,
reports and records created by the workflow are deleted in cleanup hooks.

The three workflows verify:

1. Keyboard field insertion selects Title as predicate `metadata.title` and
   direct mapping `record.metadata.title`; alias `projectTitle` becomes report
   column `metadata.projectTitle`. Preview executes without saving. Query save
   preserves the expressions and omits guidance state. Report creation selects
   that saved query, binds `createdAfter`/`createdBefore` to a date range and adds
   custom multivalue output. Unsaved preview display/CSV cells match actual saved
   report records, rendered DOM cells, parsed CSV endpoint values **and the CSV
   downloaded through the runtime's export link**. Runtime datepickers and the
   Filter button are exercised with the same range.
2. User queries retain manual paths and custom Handlebars mappings. Draft preview
   displays the unsupported-deadline refusal. A rejected Cancel retains edits;
   save/reopen preserves the mapping and a clean Cancel restores edit-button
   focus. Narrow user/query and report layouts have no page-level horizontal
   overflow at 390px.
3. Partial form guidance exposes a colon-namespaced SCU field, supports keyboard
   tree selection and autocomplete, and keeps the existing Mongo predicate
   unchanged when the guidance stage changes.

Workspace initial focus, desktop/narrow screenshots and unsaved-change
protection are also checked. Angular specs cover stale-response protection,
unknown/literal paths, complete schemas, query-change preservation and sanitizing
preview HTML. This is Chromium verification; cross-browser/device testing was
not part of this run.

## Screenshots

- `/tmp/schema-assist-06-screenshots/00-login.png`
- `/tmp/schema-assist-06-screenshots/00-authenticated.png`
- `/tmp/schema-assist-06-screenshots/01-query-desktop.png`
- `/tmp/schema-assist-06-screenshots/02-report-desktop.png`
- `/tmp/schema-assist-06-screenshots/03-report-narrow.png`
- `/tmp/schema-assist-06-screenshots/04-saved-report-runtime.png`
- `/tmp/schema-assist-06-screenshots/05-user-query-narrow.png`
- `/tmp/schema-assist-06-screenshots/06-partial-scu-keyboard.png`

## Defects and documentation

- **Mobile admin overflow:** `.admin-layout` forced a single flex row, doubling
  the page width at 390px. `assets/styles/default-theme.scss` now wraps below
  768px, reduces main padding and resets the mobile sidebar's sticky geometry.
  Browser assertions cover both editors; Webpack compiles the changed theme.
- **Browser harness login:** `test/playwright/global-setup.ts` now obtains CSRF
  before administrator login and supplies brand/portal, so it works with real
  CSRF enabled as well as the legacy test configuration.
- New integration and Bruno coverage checks feature permissions, anonymous
  rejection, report-author independence, CSRF, malformed drafts, request
  size/depth, forced brand scoping, row/byte truncation and
  `deadlineEnforced: true/false` on native versus compatible saved user queries.
- Wiki updates: `Configuring-Named-Queries.md`, new `Configuring-Reports.md`,
  `Record-Schema-Contract-API.md`, `User-Guide.md` and
  `Generated-Reference-Documentation.md`. Route metadata in
  `packages/redbox-core/src/api-routes/groups/{named-query,reports}.ts` describes
  the new public contracts for generated REST references. Guidance is advisory;
  path contexts, preview caps/refusals and `deadlineEnforced` are explicit.

No known editor defects remain from this verification. The optional private SCU
email-template check is the single pending case; repository-wide documentation
catalogue advisories remain as described above. The supplied namespaced fixture
was verified. No push or PR was created. All verification Compose projects,
containers and disposable volumes are removed before handoff; unrelated shared
host containers are left untouched.
