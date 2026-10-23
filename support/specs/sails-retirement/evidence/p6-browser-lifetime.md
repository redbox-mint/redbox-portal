# SR-044 — Integrated browser, providers and accepted-work lifetime

Starting source **3ec8e47cfb986802b3eedfae6c78e9fe63d88e72**, shared
`stack/sails-retirement` checkout, **agentvm**, 2026-10-24 Adelaide. Paired
[page evidence](p6-pages.md) records SR-040. No dependencies or lockfiles changed;
no provider quota/usage limit occurred. No P7 or institution designation work is
included.

The integrated browser harness and composition guidance are committed as
**87ba7ae35**; page implementations are **2c75aec74**, **b75b69f9c** and the
themed-error follow-up **706134318**. Focused lifetime fix SHAs are listed below.

## Real environment

The existing `Dockerfile.playwright`, `docker-compose.playwright.yml` and runner
are reused with `docker-compose.sails-retirement-browser.yml`, host networking,
one worker, zero retries, locale **en-AU**, timezone **Australia/Brisbane**.
Node **26.11.1**, npm **11.20.0**, Playwright **1.64.0**, Express **5.2.1**,
Mongo driver **7.7.0**, Prisma Mongo ORM **8.0.0-rc.19** / CLI **8.0.0-rc.24**,
tus **2.4.5**, Companion **7.1.1**, Socket.IO **4.8.4**, express-session
**1.19.0**, csrf-sync **4.2.1**, Puppeteer **25.0.4**, Effect **3.22.1**.
The image's actual browser binary reports **Google Chrome for Testing 156.0.8078.4**.

| Provider | Actual endpoint/container | Version / exact image ID |
| --- | --- | --- |
| Mongo | `127.0.0.1:34903`, `sr-p6-pages-mongo` | 8.0.34 / FCV 8.0; `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907` |
| Solr | `127.0.0.1:34904`, `sr-p6-pages-solr` | 10.0.0, core redbox; `sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b` |
| Keycloak | `127.0.0.1:18080`, `sr-p6-pages-auth-keycloak-1` | 26.5.6; `sha256:8d44614c74798322c4e07fbe0ecb15cfbb5879d69b484628555f58ade06f0d8c` |
| Browser/PDF | `redbox-portal:playwright-node26` | `sha256:bf21fe175f5d79664f9a68a4069e0b3d876d4aa923ae3be9b669668ab2ab124f` |

Keycloak issuer is `http://127.0.0.1:18080/realms/redbox`; the disposable imported
realm retains existing callbacks and adds
`http://127.0.0.1:1500/portal/user/login_oidc`. No production realm was modified.
The standalone host listens on **127.0.0.1:1500/portal**. Each fixture uses uniquely
named disposable databases, and closes the host/application before dropping them.
The independent inspection/control/source listener verifies results after the main
listener stops; its client is not counted as an application-owned pool.

Provider inspection commands executed in this checkout:

```sh
docker inspect sr-p6-pages-mongo sr-p6-pages-solr \
  --format '{{.Name}} {{json .Config.Cmd}} {{json .HostConfig.Ulimits}} {{json .Mounts}}'
docker inspect sr-p6-pages-auth-keycloak-1 --format '{{.Config.Image}} {{.Image}}'
docker exec sr-p6-pages-mongo mongosh --quiet --eval \
  'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion}))'
docker run --rm --entrypoint bash redbox-portal:playwright-node26 -c \
  'for candidate in /ms-playwright/chromium-*/chrome-linux*/chrome; do "$candidate" --version; done'
```

Mongo ran `--bind_ip_all --wiredTigerCacheSizeGB 0.25`, nofile **64000:64000**;
Solr ran `solr-precreate redbox`. The Keycloak service reuses the existing OIDC
compose configuration, with a loopback port and a temporary read-only import
directory containing the existing realm plus the browser callback above. These
are disposable standalone providers, not institution or replica-set qualification.

## Executed browser command and results

```sh
docker compose -p sr-p6-browser \
  -f support/integration-testing/docker-compose.playwright.yml \
  -f support/integration-testing/docker-compose.sails-retirement-browser.yml \
  run --rm --no-deps playwright-mount
```

`run-sails-retirement-browser.sh` assembles installed pages/assets, starts the
standalone fixture, then invokes the existing runner with
`playwright.sails-retirement.config.ts`. Normal application admission, real domain
services/repositories/schema/forms/storage/index, session/auth/CSRF and socket
providers are used. It never lifts Sails or forwards absent routes to it.
The fixture constructs the compiled PDF hook with explicit dependencies; a real
Chromium render produces actual PDF bytes. Local source/inspection endpoints and
deliberate persistence gates are test instrumentation, not provider substitutes.

- `pages-browser9.log`: **4 passed / zero failures/skips**, **43.9 s**, natural
  runner exit **0**. Artifacts archived in
  `.tmp/sails-retirement/browser-passed9/{test-results,logs}`.
- Fresh-process `pages-browser10.log`: **4 passed / zero failures/skips**,
  **29.3 s**, natural runner exit **0**. Artifacts archived in
  `.tmp/sails-retirement/browser-passed10/{test-results,logs}`. Its durable
  completion observation is reproduced below.
- After the themed-error parity fix **706134318**, `pages-browser11.log`:
  **4 passed / zero failures/skips**, **16.9 s**, including the visible themed
  404 and the same durable PDF/session/upload/stop proof; natural runner exit
  **0**. Artifacts archived in
  `.tmp/sails-retirement/browser-passed11/{test-results,logs}`.

The four cases prove:

1. Visible embedded Angular local login and record create/edit/save/reload, with
   Mongo assertions after each write and no browser page errors.
2. Real browser multipart bytes, tus POST/PATCH/HEAD/resume to `abcdef`, a real
   Companion URL-provider download/tus callback and exact staged bytes, followed
   by a direct Socket.IO disconnect, fresh grant/reconnect and progress event.
3. Actual Keycloak UI login and callback into the branded researcher page.
4. An admitted real PDF write, aborted session save and multipart finalization,
   held tus completion audit, held Companion remote body, application deadline,
   durable completion after release and successful retry of stop.

In case 4 both protocols initially own exactly two HTTP upgrade listeners. A
**250 ms** stop fails observably while accepted work is gated, retaining owned
pools and Prisma clients. The Companion browser transport closes at the deadline.
Releasing the gates persists the session despite browser abort, stores the actual
PDF datastream and finalizes multipart/tus work. Retrying stop reaches `stopped`
with zero owned pools, clients and upgrade listeners:

```json
{"sessionPersisted":1,"pdfBytes":4961,"persistedPdfBytes":4961,"uploadSaved":true,"tusSaved":true,"pools":0,"prismaClients":0,"upgradeListeners":0}
```

The test checks `%PDF` before and after persisted storage, not a fabricated return
value. Per-test durable/lifetime status is attached to the Playwright results.

## Defects found and regression coverage

Focused fix commits: **a9488cf9d** (session callbacks), **884835f10** (PDF work
scope), **75ad1a98f** (owned upgrade listener cleanup).

**Session response overload:** tus calls Node `res.end(callback)`. Deferred
express-session persistence interpreted the function as a response chunk, closing
the socket; Chromium retried a successful PATCH and encountered advanced offsets.
The existing session response wrapper now keeps the callback outside that body
argument and observes actual stream finish/error with `stream.finished`, cleaning
its observation listeners. `MiddlewareMongo` went red with a closed socket before
the fix and passed all **8 cases** afterward, including persisted callback output.

**Detached PDF scope:** the HTTP-triggered fiber inherited a settled/revoked
request scope. PDF dependencies now require `runAcceptedWork`, bound to the
existing same-owner `runAcceptedPersistenceWork`. Initial generation and retries
start inside that scope and retain it until actual fiber completion. There is no
new lifetime registry. The comparison binding uses the same owner. Existing PDF
unit tests: **75 passing, zero failures/pending**, production hook compile passed.
Compiled lifecycle tests: **5 passing, zero failures/skips**, including byte-store
drain, retry interruption, cleanup failure/retry and inactive bootstrap failure.

**Socket listener cleanup:** public Socket.IO close left an inert Engine.IO
upgrade listener behind. The existing adapter records only listeners added by its
own attachment and removes those after close, preserving another owner's sentinel
listener in the real-Mongo regression. The combined browser case proves both
Companion and portal upgrade listeners are removed at final close.

Commands (qualified PATH from the page evidence):

```sh
npm --prefix packages/sails-hook-redbox-pdfgen run compile
(cd packages/sails-hook-redbox-pdfgen && \
  TS_NODE_TRANSPILE_ONLY=true TS_NODE_PROJECT=./test/tsconfig.json \
  node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-mocha.js \
  --config ./test/unit/.mocharc.cjs ./test/unit)
node --test packages/redbox-core/test/extensions/pdf-lifecycle.cjs
```

The default PDF unit wrapper initially failed type discovery (workspace Mocha
types excluded by its test typeRoots). The existing runner was executed with
transpile-only after a separate production typecheck. One test arrangement using
object spread eagerly copied a dynamic audit getter; `Object.assign` onto the
legacy dependency object preserves it. No PDF behavioral assertion was removed.

## Integrated HTTP, Bruno and core regression

The explicit standalone matrix runs from `packages/redbox-core` without legacy
global test setup:

```sh
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
HTTP_READ_SOLR_PORT=34904 \
OIDC_TEST_ISSUER=http://127.0.0.1:18080/realms/redbox \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 45000 \
  test/http/ConfigurationMongo.test.ts test/http/AuthenticationMongo.test.ts \
  test/http/OidcMongo.test.ts test/http/CsrfMongo.test.ts \
  test/http/MiddlewareMongo.test.ts \
  test/http/RecordReadsMongo.test.ts test/http/QueryReadsMongo.test.ts \
  test/http/CompiledPilotMongo.test.ts test/http/RecordCreateAuthorizationMongo.test.ts \
  test/http/IdentityAdministrationMongo.test.ts test/http/BrunoPilotMongo.test.ts \
  test/http/RecordMutationsMongo.test.ts test/http/IntegrationAdministrationMongo.test.ts \
  test/http/ResumableUploadsMongo.test.ts test/http/ProgressSocketsMongo.test.ts \
  test/http/StreamingMultipart.test.ts test/http/ApiGroupClosure.test.ts \
  test/http/CompanionLifecycleProbe.test.ts test/http/CompanionUploadsMongo.test.ts \
  test/http/PagesMongo.test.ts
```

Initial integrated assertions: **169 passing / zero failing/pending**, about two minutes,
`pages-integrated-final.log`. This includes **8 page cases**, **8 session cases**,
the existing real provider/socket suites, import-guarded compiled HTTP, OIDC and
CSRF negatives. Bruno CLI **3.5.2** executed **34/34 requests / 53/53 scripted
checks**, zero failures/skips. Its separate declarative Assertions field is 0/0;
the checks are reported in the Tests field. No missing-environment skip supplies
acceptance. Expected late Companion ECONNREFUSED failures after deliberate
listener closure match the previously accepted residual limit below.
This first matrix exited naturally with status **0** before the final error-page
parity follow-up; its command is retained above and is rerun for the final source.

Final source **87ba7ae35**, same complete command after the themed-error/browser/
full-core reruns: **171 passing / zero failing/pending**, about two minutes
(`pages-integrated-final2.log`). All **10 page cases** and **8 session cases**
actually execute. Bruno again completes **34/34 requests / 53/53 scripted checks**,
zero failures/skips. Final counts above supersede the initial 169-case matrix.
The complete final process exited naturally with status **0**, after the existing
completed-job watchdog. No forced exit, timer/lock change or pending case was
used to obtain that result.

The final full core regression ran sequentially after production compile/types
and before the HTTP matrix, at the repository root:

```sh
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34903/redbox_prisma_p5 \
  npm run test:core
```

**4420 passing / 68 existing pending / zero failing**, exit **0**, about two
minutes (`pages-core-final2.log`). The pending cases are pre-existing and provide
no acceptance evidence. The standalone Mongo suites deliberately execute in the
explicit matrix rather than with the legacy suite's global setup.
After the error-page fix and final browser run, the same command again passed
**4420 / 68 existing pending / zero failing**, exit **0**, about two minutes
(`pages-core-final3.log`). No source-loading timeout or assertion was changed.

The first full run had **4406 passing / 68 pending / 15 failures**. Nine page
resolution fixtures needed the new explicit bindings, one standalone page suite
was incorrectly included in legacy setup, two CSP cases exposed missing logging
and fallback behavior, two form fixtures needed the extracted real operation,
and one source-transpilation child exceeded its existing budget under concurrent
build/browser load. The corrected sequential run passed without changing that
budget. The focused 117-case rerun also verifies the optional head-extra include
with actual EJS rendering.

## Intermediate failures and accepted limits

Browser runs 1–5 failed on setup/artifact paths and the response callback issue;
run 6 had **1 pass / 3 failures** while test assumptions about existing recordmeta
IDs, token envelopes and readonly readiness were corrected. Run 7 had **3 passes /
1 failure** on PDF persistence ownership; run 8 **3 passes / 1 failure** on the
upgrade listener. Runs 9 and 10 passed all cases. Local failed-run archives retain
traces/logs; synthetic authentication logs and credentials are not committed.

The accepted single-instance Companion public-API adapter remains unchanged.
Provider-internal remote I/O may retry/fail after transport termination when the
host listener is closed. Cross-process transfer recovery and cron cancellation
are not promised; see [accepted upload limits](p6-uploads.md#accepted-residual-limits-and-released-v5-comparison).
Expected late remote connection failures are summarized rather than treated as
successful transfers. The gated remote-body case proves observable stop failure
and closed transport, not a successful post-shutdown Companion transfer.

Completed Agenda jobs can leave their existing passive watchdog until about five
minutes after completion. Browser cleanup awaits natural fixture/runner exit;
there is no forced process exit, timer patch or altered queue lock lifetime.
Institution-specific browser/provider inventory and production topology remain
SR-005/P7, not inferred from this standalone core fixture. The core page shells,
configured providers and progress clients have owned replacements without Sails
view/socket helpers or events. Known legacy page artifact gaps are in the paired
page evidence.

After all browser/page/matrix processes exited naturally, only this round's
disposable providers and their volumes/network were removed (exit **0**):

```sh
docker compose -p sr-p6-pages-auth \
  -f support/integration-testing/docker-compose.bruno.oidc.yml \
  -f .tmp/sails-retirement/pages-keycloak.yml \
  down -v --remove-orphans --timeout 30
docker rm -fv sr-p6-pages-mongo sr-p6-pages-solr
```

Logs/traces and the exact images remain locally; unrelated checkout content and
the pre-existing untracked GraphQL specification directory were not changed.
