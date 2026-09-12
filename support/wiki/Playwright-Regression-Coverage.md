# Playwright regression coverage

The browser baseline runs Chromium with one worker, zero retries, locale
`en-AU`, and timezone `Australia/Brisbane`. It covers all embedded Angular
applications and the opt-in `e2e-` form scenario catalogue through the normal
portal loader and bootstrap pipeline.

The implementation corrects one assumption in the design plan, as agreed during
implementation: `fetchMetadata` reads an existing portal record through
`RecordService.getRecordMeta`, `RecordController.getMeta` and the configured
storage service. It has no external-provider URL setting. F06–F10 therefore use
test-owned portal records, record the actual metadata requests, and hold real
portal responses for asynchronous cases. F09 uses a real missing-record response
to exercise `onError`. External-service stubs remain applicable to the actual
external integrations, including vocabulary providers, Figshare and map tiles.

Use `npm run test:playwright` for a disposable mounted run and
`npm run test:playwright:ci` for the tested image path. For manual debugging,
start a persistent stack with `npm run test:playwright:up`, list scenarios with
`npm run test:playwright:scenarios`, and run selected tests with
`npm run test:playwright:run -- <spec-or-options>`. Finish with
`npm run test:playwright:clean`.

The coverage manifest and catalogue are checked before a run:

```bash
npm run test:playwright:check-coverage
npm run test:playwright:scenarios -- --json
```

Scenario registrations require `RBPORTAL_PLAYWRIGHT_SCENARIOS=true` in a
development or integration-test environment. They remain disabled by default
for normal portal starts. Add a scenario in
`packages/redbox-hook-dev/src/playwright/catalogue.ts`, then add its browser
journey and coverage ID under `test/playwright/forms`.

Reports, traces, screenshots, videos, browser diagnostics, and portal/stub
logs are stored below `.tmp/playwright`. No authentication storage state is
written. Disposable cleanup removes only Playwright-owned attachment and mail
data; append-only harvest/audit history and bootstrapped scenario records are
removed when the disposable database is reset.

## Running and debugging

Docker runs all integration and browser checks. Start from the repository root;
the lifecycle wrapper also resolves that root when invoked from another directory.
The portal port is configurable and is the same inside and outside Docker:

```bash
export RBPORTAL_PLAYWRIGHT_PORT=1501 # Optional; defaults to 1500.
npm run test:playwright:up
npm run test:playwright:scenarios -- --json
npm run test:playwright:seed -- behaviour-logical-row
npm run test:playwright:run -- test/playwright/forms/behaviours.spec.ts --grep F10
```

`up` rebuilds the mounted package graph, both Angular libraries, every Angular
application, and webpack assets before starting the portal. It uses committed
lockfiles with `npm ci`, the pinned Angular build Node, and a separate compiler
heap allowance. Mounted startup allows 20 minutes for preparation before counting
failed health checks; the measured image build spent over 10 minutes on Angular
and webpack alone on the development machine. A successful portal response
ends the grace period early. Rerun it after
application/configuration changes. Persistent runs reject a stale source
fingerprint, a different prepared mode/project, an unhealthy portal, or a failed
fixture cleanup. `clean` resets the disposable database and owned bind data.
The default Compose project is `redbox-playwright`; alternate project names must
start with `redbox-playwright-`. Keycloak gets a 120-second initialization
period and up to 20 subsequent readiness checks; a fresh stack must build its
configuration and import the test realm before the portal can start.

Seeding prints concrete edit/view URLs and records each returned OID in
`.tmp/playwright/seed-ledger.json` before checking the remaining response.
Metadata-lookup scenarios also create a source portal record and print its OID.
Paste that value into **Lookup record**. For the logical-row scenario, Beta
receives `Owned manual metadata source / fetched`. The browser spec holds this
same real record response while removing an earlier row or the target row;
it does not introduce a provider API.

For a host Playwright session, install the Chromium revision matching the pinned
Playwright package, and use the host-facing control URL plus browser DNS mapping:

```bash
node_modules/.bin/playwright install chromium
PLAYWRIGHT_HOST_BROWSER=true \
PLAYWRIGHT_BASE_URL=http://localhost:1501 \
PLAYWRIGHT_STUB_URL=http://localhost:8787 \
PLAYWRIGHT_BROWSER_STUB_URL=http://playwright-stubs:8787 \
node_modules/.bin/playwright test test/playwright/forms/behaviours.spec.ts --headed
```

Use the selected portal port above. `RBPORTAL_PLAYWRIGHT_STUB_PORT` changes the
stub port (8787 by default); use that value in both stub URLs and set
`PLAYWRIGHT_PORTAL_STUB_URL=http://playwright-stubs:<port>` for a host Figshare
journey. `PLAYWRIGHT_HOST_BROWSER=true` maps the stub hostname to loopback in
Chromium. For a separately launched manual Chromium browser, use
`--host-resolver-rules="MAP playwright-stubs 127.0.0.1"`. The stub port binds only
to host loopback. Do not reuse a normal development database for these runs.

To inspect failures:

```bash
node_modules/.bin/playwright show-report .tmp/playwright/report
node_modules/.bin/playwright show-trace .tmp/playwright/test-results/<failed-test>/trace.zip
```

To extend a scenario, update its typed form factory under
`packages/redbox-hook-dev/src/playwright/scenarios` and its starting metadata in
`seed-data.ts`. Keep browser actions and literal expected values in the spec.
For a new scenario, also add its catalogue entry and update the required-ID
contract in the coverage reporter; the Angular 20 baseline currently requires
exactly F01–F30. Run the selected spec, the coverage check, then the complete
image suite. Rebuild the mounted stack before using its copied edit URL again.

Each test attaches browser diagnostics and the local provider request log.
Tests that own resources attach their exact IDs and cleanup outcomes. The
wrapper saves Compose, portal and stub logs on success, failure, startup failure
and interruption. Expected HTTP/transport failures have scoped routes, methods,
messages/statuses, exact counts and reasons. Unused allowances and extra errors
fail the test. Popups and additional authenticated contexts retain diagnostics.

Four known Google Fonts stylesheet URLs are served by the local HTTP fixture
service; behavioural acceptance uses installed system fonts. Other external
browser origins fail diagnostics. Response gates call `fallback()` for unrelated
requests so those fixture routes remain effective. Configured provider errors
are real HTTP responses from the local service; unknown requests and unfinished
held responses fail teardown.

## Image acceptance and coverage

Build the test target from the candidate sources, then run the complete image
path without filters:

```bash
docker build --target test -t redbox-portal:playwright-baseline .
RBPORTAL_IMAGE=redbox-portal:playwright-baseline npm run test:playwright:ci
```

Image mode verifies the 19 application bundles and shared webpack assets, then
starts the image without rebuilding its application code. Mounted source runs
are useful during implementation, but do not qualify an image. Every unfiltered
run also executes the harness checks for ownership, diagnostic accounting,
registration, response gates, argument forwarding, interrupted/unhealthy
lifecycle cleanup and stale-stack rejection.

The reporter checks Playwright's collected and completed tests against A01–A19
and F01–F30. Each application needs cold startup, delayed configuration startup
and a journey in its declared spec. Each delayed startup checks incomplete
content before release and useful content immediately afterwards. No required
case may skip, expect failure or retry. Partial selections validate the full
collection first and report their own outcomes.

Qualification requires three consecutive unfiltered image runs from fresh data
at the same candidate revision/image, then independent spec runs and the mounted
rebuild/manual-debug checks. An intervening product or test fix resets the
three-run count. Run metadata records the candidate/image, portal and runner
Node versions, Angular, Playwright, actual Chromium version, locale, timezone,
worker count and retries. Final qualification evidence remains **pending**.

## Storage and contract corrections

- `fetchMetadata` uses portal records, as described above. No external-provider
  capability was added to the processor.
- Settings restoration preserves the previous value **and whether a persisted
  override existed**. `GET /api/appconfig/:appConfigId` identifies the source in
  `X-ReDBox-Config-Source`. The ordinary Admin-only
  `DELETE /api/appconfig/:appConfigId` resets that brand's override to configured
  defaults; repeated resets are idempotent. Translation restoration similarly
  deletes an originally absent entry. Dedicated translation keys avoid changing
  labels needed to operate other tests.
- Record cleanup reads the latest opaque ETag before delete/purge. A fixture
  cleanup failure writes `.tmp/playwright/cleanup-failed.json`; further tests
  and persistent runs require a stack reset.
- Audit comparisons use the loaded history: the journey expands the before/after
  values before filtering out their earlier snapshot. Harvest details expose
  summary, chunk and event sections rather than separate detail tabs.
- The record-search app exposes text, record-type and configured field refiners,
  pagination and reset; it has no user-selectable sorting control. A19 exercises
  those supported controls. A03 checks both dashboard sort directions. Dashboard
  editor previews show the resolved configuration; A10 also opens the resulting
  dashboard to verify owned record data. The named-query editor has no execution
  preview, so A11 executes its UI-authored query through the ordinary report API
  and checks the exact results before and after editing.
- Audit and harvest history, disabled test users, unassigned roles, and Figshare
  source/preview/mirror history have no applicable ordinary removal contract.
  Tests track their identifiers; disposable database reset removes that history.
  Editable vocabularies are deleted and approved crosswalks use the supported
  archive operation. No fixture deletes arbitrary records by a broad prefix.
- Scenario registration is a startup choice. Turning the flag off does not
  remove previously bootstrapped forms from a persistent database. Exclusion
  checks require fresh data. Docker excludes host-generated loader shims and
  Angular output so a prior opted-in startup cannot contaminate the image.
  The runtime target removes the development hook;
  the test target adds its compiled forms and catalogue.

## Defects exercised by the regression cases

| Cases and browser regression | Corrected behaviour | Fix and focused diagnostic |
| --- | --- | --- |
| [F04](../../test/playwright/forms/expressions.spec.ts) | Calculated changes publish value events so dependent expressions settle. | [Implementation](../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-change-event-producer.ts), [diagnostic](../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-change-event-consumer.spec.ts) |
| [F05](../../test/playwright/forms/expressions.spec.ts), [F10](../../test/playwright/forms/behaviours.spec.ts), [F14](../../test/playwright/forms/validation.spec.ts), [F17](../../test/playwright/forms/structure.spec.ts) | Repeatable identities survive reindexing; delayed actions resolve the intended logical field. | [Implementation](../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-field-resolver.ts), [diagnostic](../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-field-resolver.spec.ts) |
| [F13](../../test/playwright/forms/validation.spec.ts) | Validation navigation opens ancestor containers and focuses the field. | [Implementation](../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-focus-request-coordinator.service.ts), [diagnostic](../../angular/projects/researchdatabox/form/src/app/component/validation-summary.component.spec.ts) |
| [F16](../../test/playwright/forms/structure.spec.ts) | Collapsing an accordion retains its controls and values. | [Implementation](../../angular/projects/researchdatabox/form/src/app/component/accordion.component.ts), [diagnostic](../../angular/projects/researchdatabox/form/src/app/component/accordion.component.spec.ts) |
| [F20](../../test/playwright/forms/components-basic.spec.ts) | Server date writeback uses the date control’s supported conversion. | [Implementation](../../angular/projects/researchdatabox/form/src/app/component/date-input.component.ts), [diagnostic](../../angular/projects/researchdatabox/form/src/app/form-server-sync.service.spec.ts) |
| [F21, F25 and editor journeys](../../test/playwright/forms/components-integrations.spec.ts) | CSP-compatible markup and required typeahead/upload policies allow real interactions. | [Implementation](../../packages/redbox-core/src/config/csp.config.ts), [diagnostic](../../packages/redbox-core/test/policies/contentSecurityPolicy.test.ts) |
| [F27](../../test/playwright/forms/lifecycle.spec.ts), [F30](../../test/playwright/forms/concurrency.spec.ts) | Failed saves remain retryable; dirty navigation and conflict outcomes retain the correct record identity. | [Implementation](../../angular/projects/researchdatabox/form/src/app/form.component.ts), [diagnostic](../../angular/projects/researchdatabox/form/src/app/form.component.spec.ts) |
| [F15](../../test/playwright/forms/validation.spec.ts), [F26, F29](../../test/playwright/forms/lifecycle.spec.ts) | Every save completion updates the state, including successive successes or failures inside 250 ms; the form does not remain busy after a completed request. | [Adapter](../../angular/projects/researchdatabox/form/src/app/form-state/effects/form-event-bus-adapter.effects.ts), [diagnostic](../../angular/projects/researchdatabox/form/src/app/form-state/effects/form-event-bus-adapter.effects.spec.ts) |
| [A06, A12](../../test/playwright/apps/users-and-roles.spec.ts) | New roles refresh the branding cache before assignment. | [Implementation](../../packages/redbox-core/src/services/RolesService.ts), [diagnostic](../../packages/redbox-core/test/services/RolesService.test.ts) |
| [A10](../../test/playwright/apps/configuration-editors.spec.ts) | Workflow responses resolve saved dashboard table overrides consistently with compiled templates. | [Implementation](../../packages/redbox-core/src/controllers/RecordController.ts), [diagnostic](../../packages/redbox-core/test/controllers/RecordController.test.ts) |
| [A10](../../test/playwright/apps/configuration-editors.spec.ts) | Dashboard CRUD routes use the existing Admin policy and missing types return 404. | [Controller](../../packages/redbox-core/src/controllers/webservice/DashboardConfigController.ts), [diagnostic](../../packages/redbox-core/test/controllers/webservice/DashboardConfigController.test.ts) |
| [A15](../../test/playwright/apps/deleted-records.spec.ts) | Deleted-record title filtering addresses stored metadata; purged records return 404. | [Implementation](../../angular/projects/researchdatabox/deleted-records/src/app/deleted-records.component.ts), [diagnostic](../../angular/projects/researchdatabox/deleted-records/src/app/deleted-records.component.spec.ts) |
| [A18](../../test/playwright/apps/portal-settings.spec.ts) | The translation editor uses the shared HTTP backend and supplies TipTap with the page CSP nonce. | [Implementation](../../angular/projects/researchdatabox/translation/src/main.ts), [diagnostic](../../angular/projects/researchdatabox/translation/src/app/translation.component.spec.ts) |
| [A19](../../test/playwright/apps/dashboard-and-search.spec.ts) | Applying a refiner returns to page one so a narrower result set remains visible. | [Implementation](../../angular/projects/researchdatabox/record-search/src/app/record-search.component.ts), [diagnostic](../../angular/projects/researchdatabox/record-search/src/app/record-search.component.spec.ts) |

Focused backend and Angular tests accompany product fixes. Their passing results
are diagnostic evidence, separate from the required browser qualification.

## Merge-check audit

A read-only GitHub check on 2026-09-12 found that `master` requires existing
CircleCI build/unit jobs but does not require `ci/circleci: test-playwright`.
`develop` has no required-status-check configuration; neither branch has an
additional applicable ruleset. The repository's Playwright job is present in
both ordinary and Dependabot PR workflows.

Remaining maintainer action: add `ci/circleci: test-playwright` to the required
checks on `develop`, the merge target for this implementation, after confirming
the completed PR job. Keep all existing required checks and strictness. No branch-protection settings have
been changed by this implementation. Actual PR-job evidence and merge-enforcement
sign-off remain pending alongside the local three-run qualification.
