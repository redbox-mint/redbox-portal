# P7 production composition qualification in progress

These are prerequisites and focused checks for SR-045–SR-050, not completed P7
acceptance. Source starts at `ab08ccb7d` plus the changes in the commits containing
this record. Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, Express
**5.2.1**; no dependency changes. Raw logs remain in ignored
`.tmp/sails-retirement/p7/`.

## Selected lifecycle and Agenda placement

The real production composition exposed two defects. Spreading a class lifecycle
object discarded its prototype methods; explicit delegates now retain both methods
and receiver. The application/extension wrappers also forward the absolute drain
deadline to the resource. Agenda's backend used its configured separate database,
but startup inspection and job history still used the main database. Those three
operations now select the same owned Agenda resource.

Focused commands, with the qualified Node directory prepended to `PATH`, from
`packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 10000 \
  test/services/AgendaQueueService.test.ts test/extensions/*.test.ts \
  test/application/Application.test.ts test/application/PortalDomain.test.ts \
  test/queues/ScheduledWork.test.ts test/http/ExpressHost.test.ts

LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p3_lifecycle \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 30000 test/queues/QueueMongo.test.ts
```

- `portal-composition-existing-second.log`: **100 passing / 0 failing / 0 pending**,
  exit **0**, approximately 8 s. Includes the two new targeted composition cases.
- `portal-queue-mongo-existing.log`: **8 passing / 0 failing / 0 pending**, exit
  **0**, approximately 3 s. Existing real-Mongo bodies and assertions unchanged.
- Mongo is the actual Docker MongoDB **8.0.34**, port **29511**, raised file limits,
  image `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
  This focused run is not a replica-set or full-portal matrix claim.

### Existing test change justification

The first focused run was **97 passing / 1 failing**, exit **1**
(`portal-composition-existing.log`). Its held audit-storage test awaited the
worker before releasing a held notification enqueue. The extracted audit handler
now correctly awaits that enqueue, making that ordering deadlock. The test now
waits until the original expected enqueue is observed, preserves its assertions
that shutdown is unfinished and persistence remains available, releases the
enqueue, and then awaits both worker and shutdown. No assertion was removed,
status/timeout relaxed, or test skipped. This tests the stronger completion
contract instead of restoring an unawaited production write.

## Production application and HTTP milestones

The composed application binds actual data, reference, identity, provider,
workspace, queue and installed storage/PDF modules. Installed registration is
resolved offline before selected factories acquire resources. The candidate
`app.express.cjs` is separate from the default until qualification gates pass.
HTTP bindings use the existing Express adapters and actual selected instances.

Before the supplemental queued-hook migration, `portal-application-real-sixth.log`
completed **1 passing / 0 failing / 0 skipped**, exit **0**. Its actual application
initialized **46 domains**, **29 types**, **31 forms**, **17 jobs** and **5 ledger
migrations**, persisted a configured SecurityEvent Agenda job, stopped to zero
pools, and restarted with the same persisted brand/forms. Assertion body
**18872.191143 ms**; total **318943.083485 ms**. The pinned Agenda processor keeps
passive watchdog delays after successful job completion (default lock lifetime / 2);
resource cleanup reached zero pools before those timers expired. The executable
owns process exit after successful stop. No private Agenda timer mutation is used.

`portal-host-real-third.log` completed **1 passing / 0 failing / 0 skipped**, exit
**0**, **12585.561026 ms** total, assertion body **9248.660418 ms**. It actually
served home and three authenticated metadata/form APIs, created/read/updated an
RDMP, refused a stale strict-concurrency update with **412**, refused an anonymous
API request with **401**, returned health **200**, readiness **503** before and
**200** after activation, and stopped to **0 pools**. No Sails global or comparison
service barrel was loaded. These seven authenticated API operations are a focused
qualification, not the existing full Bruno or Playwright collections.

Failed new-harness attempts are retained: missing required SecurityEvent
`deliveryState`; missing generated Prisma contract copy after an unsuccessful
build; and incorrectly expecting **200** for an actual successful record-create
**201**. They are not counted as passes. The successful assertions retain the
actual production response contract. Failed harness processes were specifically
terminated; disposable databases were cleaned before subsequent runs.

The production build (`npm --prefix packages/redbox-core run build`,
`portal-production-build.log`) exited **0**, including generated Prisma contracts,
portal configuration schema verification and full TypeScript compilation. The final
application run (`portal-application-final.log`) completed **1 passing / 0 failing /
0 skipped**, exit **0**, **323898.29602 ms** total, **24291.513734 ms** assertion body.
It ran six ledger migrations and verified that a completed job moves to history
in the selected Agenda database, with no main-database history. Full existing-suite,
artifact, topology and recovery evidence must follow before P7 completion/default promotion.

## Supplemental persisted queued-hook repair

The released v5 PDF queue declaration nests an executable name inside
`options.triggerConfiguration`. The original conversion migrated the outer trigger
but left that nested name unresolved. Conversion now visits only that explicit
executable location and maps `sails.services.pdfservice.createPDF` to `pdf.create`;
templates and unrelated JSON remain byte-for-byte values. A separate ledger entry
`20261024T010000-v6-queued-record-hook-operations` repairs databases that already
recorded the original migration.

`queued-pdf-hooks-red.log` exposed the nested legacy string. The corrected pure
qualifier (`queued-pdf-hooks-green.log`) passed **3/3**, and the real-Mongo persisted
qualifier (`queued-pdf-hooks-mongo.log`) passed **1/1**, no failures or skips, exit
**0**. The Mongo run used two brands/four definitions, rejected an invalid plan
without writes, converted three definitions, retried two interrupted writes and
proved idempotency. The production application result above exercised both ledger
entries. No existing test expectation was relaxed.


## Broad-run regressions and client conversion

The first existing full Bruno diagnostic (`bruno-production-first.log/json`)
executed **329 requests**, **143 passing / 173 failing / 13 request errors**,
**279/567 tests**, **3/3 assertions**, exit **1**, **44388 ms**. No bail/skip was
used. OIDC, Companion and S3 profile configuration was absent in that diagnostic;
its failures are retained and do not count as qualification.

The exact existing raw create body contained `authorization: []`. The adapter
misinterpreted that metadata field as an ACL envelope. It now recognizes only
this empty-array raw compatibility case; explicit envelopes and nonempty arrays
remain validated. The real Mongo/Solr regression first failed **400 versus 201**
(`legacy-record-auth-red-second.log`), then the whole suite passed **13/13**,
**0 pending/failing**, exit **0** (`legacy-record-auth-green.log`), including eight
unchanged existing Bruno permission requests with **16/16** assertions. The added
case checks persisted metadata and authenticated-user permissions, and rejects
malformed explicit/nonempty array ACLs. An earlier harness attempt incorrectly
loaded `test/setup.ts`, which installs a Sails global forbidden by this standalone
fixture; it failed setup and is not counted.

Existing SIEM requests exposed a second adapter bug: contract validation returns
numbers, but dispatch accepted pagination strings only. The new real-Mongo/Solr
case failed **400 versus 200** (`query-pagination-red-third.log`); dispatch now
accepts safe integer numbers while preserving all bounds/type checks. The complete
suite passed **16/16**, zero pending/failing, exit **0**
(`query-pagination-green.log`), including its unchanged two-request Bruno fixture.
An attempt while the compiled dependency graph was being rebuilt failed module
loading; this harness ordering error is not counted as a behavior result.

### Recurring queue startup race

The real portal restart logged `AgendaClaimLostError` for existing recurring jobs.
Processing started before the configured schedule upserts settled. A due job could
therefore be claimed while its startup upsert rewrote processor state. Activation
now persists schedules first, then starts processors. A new real-Mongo test holds
an actual recurring schedule save and asserts no due-job handler/lock before it
settles; it does not mock the claim path.

`agenda-schedule-activation-red.log`: **8 passing / 1 failing**, the new case
observed **1 handler versus 0** while its schedule write was held. After the fix,
`agenda-schedule-activation-green.log`: **9 passing / 0 failing / 0 pending**,
exit **0**, approximately **13 s**. Existing Agenda/runtime/schedule unit regression
(`agenda-schedule-existing.log`) passed **78/78**, no failures/pending, exit **0**.
No old assertion or timeout changed. The first production-matrix attempt picked
up the added red test during development and stopped after Mongo8 standalone;
that invocation is not a completed matrix and will be repeated from fixed source.

### Complete selected production root

`app.express.cjs` now binds the selected installed domains, real storage/PDF hooks,
providers, jobs, owned HTTP and packaged views/assets. The production composition
is exported through `@researchdatabox/redbox-core/portal`. It performs offline
registration/configuration/selection, index **inspection** at startup, lexical
ledger migrations, real bootstrap and post-bootstrap checks before activation.
The explicit candidate modes are `--maintenance=indexes:inspect`,
`--maintenance=indexes:ensure` and `--initialize-only`. Executable-owned config-file
environment selectors are removed before strict domain-environment validation.
Normal defaults have not been promoted.

Broad execution exposed two missing bindings: the composition used a nonexistent
`config/locales` directory and omitted trusted core validator definitions. It now
uses installed `language-defaults` and binds the existing shared validator classes
to the selected validation domain. Executable classes are not admitted into
plain deployment data. HTTP uses compiled `.tmp/public` assets along with declared
extension roots, and admin asset refresh invalidates the actual delivery caches.

`portal-regression-build-second.log`: full production build, schema check, generated
Prisma contract copy and TypeScript compilation **exit 0**. Focused source lint
also **exit 0** (`production-focused-lint.log`).
`portal-host-regression-fourth.log`: **1 passing / 0 failing / 0 skipped**, exit
**0**, **21992.946054 ms** total (**18718.546468 ms** body). The updated production
HTTP qualifier exercises home, compiled CSS, a nonempty packaged translation
namespace, real enforce-mode dataPublication creation, strict record CAS, actual
GridFS bytes, a failed drain deadline with retained pools, completion/retry, stale
handle refusal and fresh full-host restart. The log's old `authenticatedApis:7`
summary understated its ten authenticated operations; the counter is corrected
in source. This standalone run is not topology qualification.

The qualifier uses Node's explicit `--test-force-exit` only after its stop/resource
assertions settle, matching the executable's process-exit boundary for Agenda's
passive watchdog delays. It does not replace drain, zero-pool/Prisma assertions or
signal qualification of the production executable.

## Existing recursive general regression, production candidate

At `ee1688d30` the profile-selected recursive existing general Bruno command was:

```sh
cd test/bruno
node_modules/.bin/bru run -r '1 - REST API' '2 - AJAX calls' '3 - OpenID Connect' '4 - General' --disable-cookies --env int-test --sandbox developer --reporter-json ../../.tmp/sails-retirement/p7/bruno-general-production-third.json
```

The actual installed production Express host, with real Mongo, split storage,
Agenda/session databases, Solr 10, Keycloak 26.5.6, Mailpit and Companion, returned
**309 requests: 263 passed / 46 failed; 488/551 tests, 3/3 assertions; exit 1,
51,851 ms**. Two failed requests were transport errors from legacy `http:` plus
the newly root-relative tus Location. No bail or skip was used. A previous
nonrecursive invocation executed only 20 direct requests and is diagnostic only.

This run exposed host regressions addressed in the next change: empty optional
export date filters, missing machine codes for vocabulary/font upload errors,
missing schema problem responses at invalid portal boundaries, loss of the
missing-record/user response details, duplicate browser account creation, and
preview policy resolution without request context. Solr logs identified an
empty `metaMetadata_type:` filter for an absent optional type. The new focused
regression failed specifically on that filter (55 passed / 1 failed); after
fixing it, **56 passed / 0 failed / 0 pending**, including tenant and actor
filter assertions. The first green attempt had an incorrect expectation for
Lucene escaping of `brand-1`; correcting that expectation retained the exact
mandatory tenant assertion. Logs: `solr-optional-type-{red,green-second}.log`.
The error text for email failures retains the existing public generic prefix
while keeping backend failures sanitized and warning clients to read current
state before retrying. No original regression assertion was relaxed for these
production fixes. Full-suite requalification remains required.

### Browser/API client conversions and their justification

These are intentional v6 contract conversions from design section 1.3, not
permission to skip requests or accept successful unauthorized writes:

- The Bruno helper fetches a real session-bound `/csrfToken` before same-origin
  unsafe browser writes, using the request's own cookie, and sends
  `X-CSRF-Token`. Login obtains its anonymous session first. Verified API bearer
  calls keep their independent exemption. No other persona's cookie is attached
  automatically. Existing login/logout tests submit POST logout with CSRF.
- Browser tus follow-ups resolve root-relative Locations against `host`, replacing
  the v5 protocol-relative `http:` construction. Existing upload/download status
  and content checks remain.
- The API researcher creation uses the actual configured `Librarians` role
  instead of unknown `Librarian`; v6 explicitly rejects unknown role names.
- The empty-result audit date test uses ordered 2021–2023 bounds rather than
  reversed 2023–2021 bounds, retaining its zero-result assertion; malformed or
  reversed dates are explicitly rejected by v6.
- Anonymous branding and protected record-form reads assert explicit 401
  authentication denials instead of legacy 403. No denial becomes success.
- General preview creation supplies the existing authorized Admin API credential.
  A valid Companion-secret upload likewise supplies the actor credential; an
  invalid secret without an actor now asserts 401 authentication failure. The
  no-secret unauthenticated case asserts exactly 401 instead of accepting a
  redirect or 403. Shared secrets cannot replace actor authentication in v6.
- The branding publish-conflict request supplies its declared required draft
  revision, so its unchanged 409 assertion reaches version-conflict handling.
- The nested vocabulary admin request uses the existing cookie helper, matching
  the other authenticated admin requests instead of interpolating a stale env
  cookie.

The environment file is restored after runs; runtime IDs/cookies are not committed.
These converted existing requests still require a complete passing run before
SR-046 acceptance.


### Continuing the existing-suite qualification

The fourth recursive general run at `d61741042` executed **309 requests,
302 passed / 7 failed; 544/553 tests; 3/3 assertions; 75,729 ms; exit 1**.
No bail or skips. Remaining failures were the nested vocabulary request running
before the folder's login, attachment save/download, reused account-link fixture
state, and the bodyless preview alias requiring an API-only revision argument.
The alias now resolves the current revision after Admin authorization; explicit
API preview concurrency remains required. Final acceptance requires its rerun.

The nested vocabulary case now supplies the existing Admin bearer, because the
recursive folder order visits it before login. Upload metadata bodies now use
`{{host}}{{attachmentLocation}}` (and the S3 equivalent), matching the already
converted tus follow-up URL. The original save/download assertions are unchanged.
The actual existing S3 collection against the production Express host with real
S3Mock passed **7/7 requests, 12/12 tests, 0 assertions, 17,508 ms**, exit 0;
`bruno-s3-production-first.{log,json}`. This local run does not yet count as the
requested Compose-profile execution.

The full existing Playwright run discovered stale prebuilt Angular assets calling
the retired dashboard `/info` endpoint and using old template keys; current
source calls `/targets` and uses fingerprinted keys. A clean asset rebuild is
required before qualification. The local-auth test's logout locator is converted
from a link to the actual CSRF-protected POST form button required by v6. Login,
invalid-login and post-logout assertions remain unchanged. No browser test is
skipped or allowed to ignore unexpected diagnostics.

## Continuing full-suite diagnosis (2026-10-24)

The eighth complete root integration invocation exercised the selected production
Express domains: **339 passing / 10 pending / 50 failing**, exit **50**
(`mocha-production-eighth.log`). These are diagnostic failures, not qualification.
The test adapter had passed a raw Router to Supertest instead of the server's
actual Express request listener. That causes `argument callback is required` in
several HTTP suites. The adapter is being corrected; unchanged domain/HTTP
assertions must be rerun before acceptance.

The third Playwright diagnostic was interrupted after **53 passed / 15 failed /
1 interrupted / 55 not run**, from the existing **124-test** suite. It is not a
completed or green regression run. Its served Angular artifacts were stale
(dashboard editor called retired `/info` while current source calls `/targets`).
Both libraries and all twenty applications were rebuilt on Node **26.11.1** into
an isolated scratch directory before replacing the generated local assets. The
temporary host config also incorrectly enabled record-schema checking, unlike
the existing Playwright Compose profile. The F06 trace proves that this produced
schema warnings for intentionally null input values, not a failed metadata
write. The next run uses the profile's default disabled schema setting, real RVA
stub URL and 0.1-second Agenda polling; no browser assertion is removed.

Actual host omissions found during this diagnosis:

- The literal vocabulary manager page was shadowed by `/admin/vocabulary/:id`,
  returning **400**. Literal page routes now precede parameterized API aliases,
  retaining their existing authorization policies. The production-host verifier
  includes an authenticated manager-page request.
- The standalone form registry omitted core's `generated-view-only` definition.
  Core definitions now precede the installed hook definitions in the same
  registry; no parallel form generator is added.
- Translation reload receives a branding ID, while its injected resolver accepted
  names only. That cleared the existing instance without recreating it. The
  selected resolver now supports the actual ID and name callers.
- The real denied-email OIDC collection produced **12/13 requests and 16/17 tests
  passing**, with the denied browser callback returning JSON **403**. The host now
  negotiates the existing branded HTML error artifact for browser requests,
  exposes only the allowlisted email-denial reason, and retains JSON for API
  clients. Full rerun is required.
- The selected email resolver omitted core's registered record operations, so a
  successful notification could not call `record.updateNotificationLog`. It now
  uses the explicit installed bindings or the selected named operation registry.

`npm --prefix packages/redbox-core run build` passed (Prisma generation, portal
schema check, TypeScript and generated-contract copy). A subsequent TypeScript
emit with incremental state outside Git passed after the email resolver change.
These build results do not replace the pending real-service reruns.

The clean `4ffe349dc` Docker build was canceled with exit **130** after strict
root installation (**2117 packages**) and during core installation, because this
source predates the above fixes. No completed image or image qualification is
claimed for that attempt. The system containerd snapshot walk had delayed it;
an isolated containerd/Docker pair was started on the scratch disk without
restarting the system daemon. No package or image was published.

### Existing root Mocha adapter and contract conversions (in progress)

The tenth diagnostic root invocation completed with **375 existing tests passing,
10 pending and 19 failures**, exit 19. Its console total of 376 includes one
separate diagnostic-only report probe, which is excluded from existing-suite
counts. The report probe confirmed the real named-query rejection has status 400;
it is not a regression acceptance test. Local log:
`.tmp/sails-retirement/p7/mocha-production-tenth.log`.

`test/express.bootstrap.test.cjs` starts `createPortalHost`, initializes and
activates it, and binds the old test names to its actual selected domain instances.
It never lifts Sails. A test-only `sails` name retains persistence owner identity
and the historical fixture configuration API. Config, branding-logo, cache,
contrast, form-consistency, navigation, template, Sass and attachment-metadata
comparison helper classes remain explicit in this adapter; their existing helper
cases are not claimed as additional production route coverage. The mounted host
and HTTP assertions use the actual listening Express server. No ephemeral
Supertest-owned listener substitutes for it.

`test/helpers/compiledCore.cjs` maps explicit `src/*.ts` imports in the old tests
to the matching emitted modules. Loading a second source copy of persistence
would create a different WeakMap and silently test another owner. Tests still
execute their existing assertions and real disposable Mongo databases. Mutable
fixture collaborator/config changes are injected into the selected instances only
inside this bootstrap; production startup configuration remains immutable.

The following test changes are intentional v6 consumer conversions, not removed
assertions:

- Existing browser login and mutations acquire a real session-bound CSRF token.
  CSRF remains enabled; the helper does not manufacture credentials or tokens.
- Revoked/missing bearer credentials expect 401 under the explicit v6 API contract.
  The tests retain denial, token-clearing and privacy assertions.
- Blank attachment identifiers expect the specific `storage-validation` code,
  rather than the old generic `storage-unknown` classification.
- Email callbacks use the neutral `record.updateNotificationLog` operation name,
  retaining the notification-log and trigger-condition assertions.
- Request-chronicle fixture routes bind through the real Express router instead
  of retired `sails.router`. Its multipart case uses `StreamingMultipart` and the
  selected staging disk with actual streamed bytes. Background service work
  replaces the removed Sails virtual-request API. Concurrency, error deduplication,
  sampling, warnings, upload callbacks and all privacy assertions are retained.
- Malformed JSON expects the explicit client-error status 400 instead of the old
  host's 500, while still requiring one safe error and no request-body leakage.

The existing chronicle assertions exposed missing safe user/translation details
and missing parser-error capture in the new host. The host is corrected rather
than removing these assertions. Default navigation helpers also recursively read
branded configuration when a fixture derives its defaults from those same
helpers; only request-based operations now evaluate branded configuration.
Notification delivery forwards only the allowlisted reply-to override; evaluated
from/subject/format values already have their explicit send arguments.

The new `run-mocha-express.sh` and `docker-compose.express.yml` are candidate
runners for the existing suites/profiles. Their presence alone is not proof of a
passing run. The candidate profile configuration maps the legacy fixture inputs
explicitly, retaining v6 CSRF instead of accepting `sails_security__csrf=false`.
TypeScript `tsc --noEmit -p packages/redbox-core/tsconfig.json` completed with exit
0 on Node 26.11.1 after the runtime corrections. Full compiled-source reruns and
profile counts remain required before SR-046 acceptance.

The eleventh diagnostic (with edited modules transpiled only in its own process,
so that the running browser host's dist was untouched) finished **386 passing /
10 pending / 7 failing**, exit 7. Six remaining browser login hooks exposed
Supertest's eager cookie capture: creating `.post()` before awaiting the first
CSRF session omitted that session's new cookie. The callers now fetch the login
token before constructing the request. The seventh assertion now checks the
explicit v6 unauthenticated 401 body (`Authentication required` and empty details).
A further full diagnostic is running; no passing claim is made here.

Playwright F09 completed its recovery and downstream-event assertions, but its
strict diagnostics expected the legacy missing-record 500. The real v6 response
is 404, confirmed in its trace. The test's two exact expected-failure diagnostics
now require 404 (including Chromium's resource error); their counts and all form
recovery assertions are retained. This is an intentional not-found contract
conversion, not an ignored browser error.

### P7 integration fixture membership correction

The root `RouteRecordAccess` administrator mixed-case credential case created a
local target with **no roles and no active brand link**. The owned v6 identity
route deliberately applies the same `requireUserInBrand` boundary as the REST
administration API; the old browser controller wrote a credential by arbitrary
user ID. The focused real-host run reproduced the rejection (12 passing / 1
failing, including all anonymous/researcher denials). The fixture now gives its
target the default brand's Researcher role before exercising credential issuance.
This records the intended tenant explicitly and keeps every denial, mixed-case
route, credential immutability and success assertion. The production tenant check
is retained; unassigned/foreign user IDs are not made administrable by this test.
The intermediate diagnostic's Buffer/string handling itself failed while printing
the response; that diagnostic is not committed and is not an acceptance result.

The twelfth full diagnostic completed **416 passing / 10 unchanged pending /
6 failing**, exit 6. Five failures were the remaining anonymous 403-to-401
contract conversions; the sixth was the target-membership precondition above.
After that fixture correction the focused real Express access suite completed
**13 passing / 0 failing / 0 pending**, exit 0, with zero owned pools, clients,
resources and operations after stop (`mocha-route-access-second.log`). It used
the diagnostic per-process transpile loader; final compiled-source full-suite
qualification is still required. Changed runtime lint: **7 files, 0 warnings /
0 errors**. No timeout or skip was added.

### Compiled root integration result and browser pagination regression

The thirteenth full root run uses the actual emitted core (ordinary `tsc`, no
per-process transpile override), real selected Express instances/listener, and
fresh disposable `sr_p7_mocha{,_storage,_agenda,_sessions}` databases on the owned
Docker Mongo8 server, port 29511:

```sh
NODE_ENV=integrationtest \
REDBOX_APPLICATION_CONFIG="$PWD/.tmp/sails-retirement/p7/regression-mocha.cjs" \
REDBOX_SESSION_SECRET='<synthetic fixture secret>' \
  bash support/integration-testing/run-mocha-express.sh
```

Result: **422 passing / 10 unchanged pending / 0 failing, 47 seconds, exit 0**.
The host reports **0 pools / 0 Prisma clients / 0 operations / 0 resources** after
stop. Raw log: `mocha-production-thirteenth.log`. The pending cases remain seven
DOI publisher credential/prefix cases, one explicitly skipped legacy embargoed
form, and two opt-in live DataCite/RVA service cases; they do not count as passed
coverage. No skip, timeout extension or replacement domain behavior was added.

Full Playwright run 4 finished **114 passing / 10 failing / 0 skipped, 22.3 min**.
Its A19 trace proves a separate host regression: the page-2 search response has
**2 records / totalItems 12**, but no `page`. The existing Angular consumer assigns
`currentPage = response.page`; pagination then resets to the first page. The old
controller explicitly added that field after Solr returned. `recordReads.ts`
now returns the validated requested page alongside the unchanged search result.
No client assertion or pagination behavior was changed. Core compilation and
changed-route lint pass (zero warnings/errors).

After refreshing `.tmp/public/angular` from the complete current `assets/angular`
build, the first focused rerun passed all six dashboard startup/smoke checks.
Four scenario cases failed because that restarted host omitted the existing
`RBPORTAL_PLAYWRIGHT_SCENARIOS=true` fixture opt-in. This is a runner setup error,
not acceptance evidence. The next host uses that opt-in and the configured local
browser/provider stub addresses, matching the existing Playwright profile.

With the existing scenario opt-in restored, the remaining four focused cases
passed **4/4, 0 failures/skips, 2.2 min** (`playwright-focused-sixth.log`): A10
workflow-dashboard persistence/rendering, A03 filters/sorting/pagination, A19
search/page-2/open/refinement/reset and F09 failure/recovery. Combined with the
six successful refreshed-asset startup/smoke cases, all ten original failures
have now passed their focused reruns. Full 124-case qualification is still required.

### Full general Compose route-order regression

The first general Compose retry reached the real production Express host with
healthy pinned MongoDB/Keycloak/Solr/Mailpit. The existing collection parsed all
309 requests, then bailed: **204 passed / 1 failed / 104 bail-skipped**;
**366/367 tests and 3/3 assertions** passed. This is incomplete coverage, not a
successful collection. Logs/JUnit: `bruno-general-compose-second.{log,xml}` under
`.tmp/sails-retirement/p7/`.

`List Dashboard Types` received status 200 with an HTML dashboard instead of the
required `dashboardTypes` JSON. `/dashboard/:recordType` had been mounted before
the literal `/dashboard/type` metadata route. The production assembly now mounts
metadata before pages, while retaining literal vocabulary pages before
parameterized vocabulary API aliases. No test or policy changes. The complete
collection rerun is required after compilation; the active full browser process
keeps its original compiled tree until it exits.

### Completed full browser and dedicated OIDC regression

Compiled application source **`2aae5ba50`**, Node **26.11.1**, Playwright
**1.64.0**, existing `playwright.config.ts`, actual production `app.express.cjs`:

```sh
NODE_ENV=integrationtest RBPORTAL_PLAYWRIGHT_SCENARIOS=true \
PLAYWRIGHT_BROWSER_STUB_URL=http://playwright-stubs:8787 \
REDBOX_APPLICATION_CONFIG="$PWD/.tmp/sails-retirement/p7/regression-playwright.cjs" \
REDBOX_SESSION_SECRET=<synthetic-fixture-secret> node app.express.cjs
PLAYWRIGHT_BASE_URL=http://redboxportal:1504 PLAYWRIGHT_HOST_BROWSER=true \
PLAYWRIGHT_API_TOKEN=d077835a-696b-4728-85cf-3ffd57152b1e \
PLAYWRIGHT_STUB_URL=http://127.0.0.1:8787 \
PLAYWRIGHT_BROWSER_STUB_URL=http://playwright-stubs:8787 \
  node node_modules/@playwright/test/cli.js test
```

Full run seven exited **0**: **124 passing / 0 failing / 0 skipped**, **20.6
minutes**. Counts: **apps 60 / forms 41 / smoke 23**. Log:
`.tmp/sails-retirement/p7/playwright-production-seventh.log`. The original full
suite remains enabled; no case was excluded. The existing local RVA/tile stubs
and scenario opt-in were retained. Fresh compiled Angular assets resolved the
stale generated-tree failures; the retained search `page` resolved A19; F09's
record-missing diagnostic conversion retains its recovery assertions. All ten
original full-run failures now pass in the complete rerun. SIGTERM of the actual
portal process exited **0** and logged `Express host stopped.`

The dedicated existing OIDC Compose profile also completed its collection:
**13/13 requests, 17/17 tests, 0 failures, 0 skips, 29.410 s**. It used the
unchanged `run-bruno-oidc.sh` and collections 5/6, the Express override and the
same pinned Keycloak **26.5.6**, MongoDB **9.0.4**, Solr and Mailpit definitions.
Both allowed and denied real provider flows executed. Invocation:

```sh
RBPORTAL_EXPRESS_TEST_PROFILE=oidc DOCKER_HOST=unix:///run/sr-p7-engine.sock \
  docker compose -p sr-p7-oidc --profile mount \
    -f support/integration-testing/docker-compose.bruno.oidc.yml \
    -f support/integration-testing/docker-compose.express.yml \
    -f .tmp/sails-retirement/p7/profile-network.yml \
    up --menu=false --abort-on-container-exit --exit-code-from bruno-mount
```

The pinned providers were prestarted until their original health checks passed;
no health/test timeout was relaxed. Logs/JUnit:
`bruno-oidc-compose-first.{log,xml}` under `.tmp/sails-retirement/p7/`. All six
owned profile containers and its Mailpit volume were removed. The local external
network override only supplies connectivity for the owned Docker daemon with
iptables disabled; it does not replace a service. General's full green rerun and
S3 remain open at this point. The subsequent route-order-only correction
`11e6f6277` still needs its full general rerun and affected browser checks.
