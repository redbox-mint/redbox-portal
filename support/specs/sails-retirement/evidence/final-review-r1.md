# Final-gate review and fixes — round 1

Reviewed the whole feature from spec commit `a49366803` through initial HEAD
`1301dc59f`, then reviewed and verified the corrections through code/test commit
`1cb1e1919e1b021c0af203b1e18755270a3c56cb`. Work stayed on
`stack/sails-retirement` in the shared checkout. No worktree, branch switch,
push, publication or tag was used. The unrelated untracked GraphQL specification
was left untouched.

The review used AGENTS.md, the eight retirement design/plan/contract documents,
their evidence, CONTRIBUTING.md and the tracked architecture, services,
configuration, extension, development, testing, installation and compatibility
wiki pages. Independent Standards and Spec review reports were completed and
their concrete findings were verified before remediation. The direct review
covered Express internals and the other feature surfaces listed below.

## Disposition and artifact provenance

**17 verified issues fixed: 5 P1, 11 P2 and 1 P3. No verified code defect was
deliberately left unfixed.** P1 denotes a serious isolation, credential,
normal-workflow or lifecycle failure; P2 denotes another concrete regression or
verification defect; P3 denotes contradictory documentation/comments.

SR-005/045/049/055 retain their accepted representative-institution gaps. No
synthetic institution, released-v5 stand-in, local identity provider or test
topology designates that institution, its production source/hooks/configuration,
TLS/authentication topology or reconciliation owner. Their checkboxes are unchanged.

The immutable `5088f4a7a` packs/images and their broad P8 suite results are
**historical qualification of that exact source**. This round changes runtime
code and tests; those images do not contain the corrections. This round reused
the existing `redbox-portal:sr-p8-5088f4a7a-test` toolchain image, mounted current
core source/tests and bundled extension sources, and rebuilt current core dist
inside the disposable builder. Updated dev-tools were built and tested, and the
generated-hook qualifier compiled/packed its fresh extension. No new image was
built and no replacement clean immutable-image/full-suite qualification is
claimed. The current mounted/compiled-tree audit and targeted results below are
separate from the historical P8 clean-artifact proof.

## Verified issues and focused fixes

Locations refer to the corrected source at `1cb1e1919`; each identifies the
affected boundary. Paths beginning `src/` or `test/` below are relative to
`packages/redbox-core/` unless stated otherwise.

| ID | Severity | Location | Verified defect and correction | Fix commit |
|---|---|---|---|---|
| R1-01 | P2 | `src/http/express/recordReads.ts:440`, `queryWrites.ts:103`, `brandingDelivery.ts:318` | Raw read/definition/CSS/font exceptions reached logs. Emit bounded operation diagnostics; regression tests inject secret-bearing errors. | `6350ff239` |
| R1-02 | P1 | `src/identity/Users.ts:721`, `src/http/express/identityLinks.ts:153` | Audit reads for shared accounts disclosed other brands' events. Pass the trusted requested brand and filter direct/admin events before normalization, limiting and summary. Unscoped/malformed historical rows stay withheld. | `3050c55f6` |
| R1-03 | P2 | `src/http/express/identityLinks.ts:119` | Sanitizing an ordinary role with a string branding ID threw. Handle both ID and populated branding representations, retaining only owning-brand roles. | `3050c55f6` |
| R1-04 | P1 | `src/application/portal/http.ts:164`, `src/application/portal/application.ts:267` | Canonical URLs already containing the deployment root were concatenated with that root again, breaking Angular API, PDF and Companion URLs. Browser client base uses the origin; canonical application URLs are consumed once. | `267b73b30` |
| R1-05 | P1 | `src/recordTypes/RecordHookNames.ts:59`, `src/services/record-hooks/coordinator.ts:103` | V5 `onNotifySuccess` callbacks survived conversion and failed after email side effects. Convert/validate explicit nested success declarations, repair already-completed checkpoints, and validate nested operations before invoking their parent. Opaque record/template data are not traversed. | `c1d6f4349` |
| R1-06 | P1 | `src/records/Records.ts:616`, `src/action-execution/executor.ts:345` | Interrupting detached fibers did not join underlying Promises; stop reported completion before hooks finished, including timed-out actions. Track and join actual work before closing dependencies, retaining it across failed drain/retry. | `4e2420c10` |
| R1-07 | P2 | `src/configuration/resolution.ts:140` | Documented extension `workflows` were accepted but ignored. Merge them into `config.workflow` with documented provider/application precedence; bootstrap a freshly packed workflows-only extension. | `1a81e00d5` |
| R1-08 | P2 | `src/application/portal/application.ts:255`, `src/extensions/resolution.ts` | Storage preflight imported hardcoded `/extension`, ignoring a successfully discovered public `.` entry. Retain/reuse the declared entrypoint exports. | `0f31b4fb9` |
| R1-09 | P2 | `src/queues/migrateRecordHooks.ts:17`, `src/application/portal/application.ts:323` | Persisted queued v5 hook payloads reached strict dispatch unchanged. Validate all selected Agenda payloads before migration writes/activation; convert SQS delivery payloads through the same finite mapping where enumeration is unavailable. | `b0accdbe6` |
| R1-10 | P2 | `packages/redbox-dev-tools/src/utils/config-helper.ts:96` | Generated dotted route/handler names failed extension validation. Generate bounded identifiers accepted by the shared resolver and test the route/handler pair together. | `04820f72e` |
| R1-11 | P2 | `support/deployment-examples/docker/docker-compose.yml:8`, `support/ecosystem.template:7` | Default Compose/PM2 termination grace expired before application drain. Set 45 seconds/45000 ms and document its relationship to configured drain deadlines. | `7f72913c8` |
| R1-12 | P2 | `src/queues/AgendaQueue.ts:846` | Agenda backend/worker event handlers logged provider exceptions with sensitive details. Retain bounded backend/job failure messages; exercise actual backend and failed-job events. | `a1d889364` |
| R1-13 | P3 | `support/specs/sails-retirement/hook-migration-v6.md:192`, `src/http/express/policies.ts`, `src/pages/locals.ts` | Guidance/comments described completed lifecycle/HTTP work as future or relied on retired comparison-host terminology. Reconcile with the implemented sole host and explicit ownership. This evidence update also scopes old P8 artifact-equivalence wording to its historical checkpoint. | `13f6a68f4`; containing evidence commit |
| R1-14 | P2 | `test/http/AuthenticationMongo.test.ts:74` | A stale count asserted 3 rejection audits after 7 rejected requests, while the test title claimed a nonlocal-account case that never ran. Assert each request's count/status/body and add a real nonlocal denial with no session. | `3eb85d676` |
| R1-15 | P1 | `src/http/express/companionLogging.ts:1`, `src/http/express/companion.ts` | A real native tus failure logged bearer authorization and transfer grants. Install a version/digest-checked bounded logger through Node 26's temporary module-loader hook before the native import; refuse preloaded/altered providers. No installed-file or console mutation. | `238fcb419` |
| R1-16 | P2 | `test/helpers/httpPolicyFixture.ts:42`, `test/http/recordBrowserMetadata.test.ts:38` and adjacent changed fixtures | Strict application/effect fixture typechecks failed despite transpile-only runtime passes. Repair inferred self-references, mock signatures and pinned Sinon API usage, preserving exact call assertions. | `c6d19299a` |
| R1-17 | P2 | `src/queries/IntegrationAudits.ts:280`, `src/integrations/IntegrationNotifications.ts`, `src/queues/AgendaQueue.ts:1023`, `src/translations/I18nEntries.ts` | Additional owned audit/email/DOI/vocabulary/queue-submission/translation/Solr failure paths logged raw messages, objects or storage response details. Bound diagnostics while preserving business failure propagation and exercise secret-bearing errors/results. | `1cb1e1919` |

R1-17 also changes `src/queries/RecordAuditReader.ts`,
`src/integrations/Doi.ts`, `src/forms/VocabInlineFormConfigVisitor.ts`,
`src/translations/Translation.ts` and `src/queries/Solr.ts`.
`202201ddd` extends the retirement classifier for the new persisted migration
fixture literals; executable negative controls remain active and pass. No
dependency was added or loosened by this review. Every review commit has the
required final `Co-Authored-By: GPT-6.1-sol <noreply@openai.com>` trailer.

Companion 7.1.1 has no public logger-injection option. The adapter checks that
exact version and logger SHA256
`8afdbec41f6bb264380bb99eae2bbd66fabaf29c3a4c699c58a753da9de70de7`,
replaces only that logger module during import and deregisters the hook in
`finally`. Its refusal of prior imports is now an explicit compatibility/startup
contract. The real failed-transfer regression and isolated preloaded-provider
child both execute; this is not a mock-only logging assertion.

## Tests and actual results

All integration tests ran inside disposable Docker fixtures on the isolated
daemon `unix:///run/sr-p7-isolated/docker.sock`, using Node **26.11.1**, npm
**11.20.0**, MongoDB **9.0.4**, Solr and a real disposable Keycloak provider.
Existing image layers were reused; no unnecessary image builds were performed.
Ignored command output is under `.tmp/sails-retirement/final-review-r1/`.
Counts overlap between targeted runs and must not be summed.

| Check | Result | Log |
|---|---|---|
| HTTP operation logging and adjacent contracts | 34 passing | `logging-verified.log` |
| Identity service/controller | 127 passing | `identity-unit.log` |
| Identity Mongo HTTP, including embedded bearer Bruno | 17 passing; Bruno 2 requests/4 tests | `identity-verified.log` |
| PDF unit | 76 passing | `pdf-unit-verified.log` |
| Notification success, workflow resolution, storage entry | 8 passing | `notifications-workflows-storage.log` |
| Compiled persisted hook conversion/reference repair/restart | 6 passing, 0 skipped | `hook-qualification.log` |
| Expanded action execution/Records/Oni/RAID/DOI runtime | 411 passing; 2 pre-existing pending RAID contributor cases | `final-domain.log` |
| Packed generated workflows-only extension in production composition | 1 passing; fresh, persisted bootstrap, HTTP, restart, drain | `workflow-packed-verified.log` |
| Full dev-tools suite | 52 passing | `devtools-verified.log` |
| Agenda migration/events/submission | 11 passing | `queue-final.log` |
| Affected authentication/configuration/HTTP fixtures | 118 passing; compiled fixture setup failure corrected separately | `final-fixtures.log` |
| Compiled record-type Mongo fixture with required URL | 3 passing | `compiled-fixtures.log` |
| Real Companion transfer and progress sockets | 6 passing | `companion-logging-green.log` |
| Compiled Companion process ownership/preloaded-provider refusal | 2 passing | `companion-process.log` |
| Domain audit/email/DOI/i18n/Solr/failure logging corpus | 255 passing | `domain-final.log` |
| Current rebuilt production host with `/research` | 1 passing; 10 authenticated APIs, pages/assets, GridFS, restart, drain-deadline retry; final pools 0 | `production-current.log` |
| Real Chromium SR-040/044 browser workflows | 4/4 passing, no skips; Angular login/create/edit, multipart/tus/Companion/progress reconnect, real Keycloak, aborted session/PDF/upload deadline/retry | `playwright-final.log` |
| Browser collection structure | 20 apps/30 form scenarios/124 tests valid; collection check only | `browser-coverage.log` |
| Supervisor grace | Compose renders 45s; PM2 template parses 45000ms; actual Docker SIGTERM preserves a 15-second accepted request, drains and exits 0 | `supervisor-config.json`, `supervisor.log`, `supervisor-response.log` |
| Retirement shim/classifier negative controls | 8 passing, 0 skipped | `closure-tests.log` |
| Core build, strict application/effect fixture typechecks | exit 0 on latest code | `final-build-typecheck.log` (silent success) |
| Lint | 694 files; 0 warnings/errors | `final-lint.log` |

The successful browser drain test persisted **4771/4771 PDF bytes**, the session
and both uploads, then reported **0 persistence pools, 0 Prisma clients and 0
upgrade listeners**. PM2 itself was not installed/run; its configuration was
validated, with actual supervisor shutdown exercised through Docker.

Earlier failures are retained, not counted as passes:

- The broad HTTP run had **107 passing/1 failing**: the stale authentication
  audit assertion was reproduced, corrected as R1-14 and covered by the later
  affected-fixture run. Embedded CSRF Bruno passed **8 requests/11 tests**.
- The affected-fixture run omitted the compiled-record-type suite's required
  database URL. That suite was rerun with its explicit URL and passed all 3 cases.
  An earlier queue attempt likewise lacked its required lifecycle URL; corrected
  queue runs execute against real Mongo.
- The first browser run had **3 passing/1 failing** because the disposable
  Keycloak client lacked the branded `/portal/user/login_oidc` redirect URI.
  Correcting that owned provider's configuration yielded the full 4/4 pass.
  The tracked realm was not changed. Browser system libraries were installed
  only inside the disposable builder.
- The Solr image serves on 8983 despite the initial custom-port assumption;
  corrected invocations explicitly use 8983.
- Secret-bearing regressions were observed failing before the corresponding
  fixes: HTTP logging, audit isolation, native Companion transfer logging,
  domain/email/audit/DOI/queue-submission/translation/Solr and invalid translation
  metadata diagnostics. Initial translation metadata setup lacked a directory;
  after setup correction it reproduced the disclosure before the fix.
- A pin checker initially rejected three permitted relative local package
  paths. Applying AGENTS.md's local-reference exception yields the clean pin
  audit below; no package edit was needed.

Reproducible targeted runner pattern (Mongo HTTP suites omit the service test
setup because they assert absent framework globals):

```sh
docker -H unix:///run/sr-p7-isolated/docker.sock exec \
  -e HTTP_READ_SOLR_PORT=8983 \
  -e LIFECYCLE_TEST_MONGO_URL=mongodb://127.0.0.1:29601/sr_p3_lifecycle \
  -w /opt/redbox-portal/packages/redbox-core sr-final-r1-builder \
  bash -c 'unset NODE_ENV; TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --timeout 45000 test/queues/QueueMongo.test.ts'
```

The production qualifier runs from the repository root inside that container:

```sh
SR_PORTAL_ROOT_CONTEXT=/research \
SR_PORTAL_MONGO_URL=mongodb://127.0.0.1:29601/sr_p7_portal_http \
SR_PORTAL_SOLR_PORT=8983 \
node --test --test-force-exit packages/redbox-core/test/qualification/portal-host.cjs
```

Service/action runs use `--require chai --require test/setup.ts`; action execution
is loaded before Records to avoid the Chai ESM setup race. Strict checks use
`tsc -p test/tsconfig.application.json` and `tsc -p test/tsconfig.effect.json`.
Compiled production qualifiers use `--test-force-exit` because the documented
Companion cleanup cron has process lifetime; their stop/pool assertions still
execute. Browser verification follows the repository's standalone Playwright
workflow using `test/browser/sails-retirement.spec.ts` and its real fixture host.

## Closure and dependency audit

At `1cb1e1919`, reran the original inventory and the complementary AST/manifest
audit, then reconciled every baseline entry:

```sh
node support/specs/sails-retirement/evidence/inventory.cjs HEAD
node support/specs/sails-retirement/evidence/retirement-closure.cjs HEAD
node support/specs/sails-retirement/evidence/reconcile-retirement-inventory.cjs \
  .tmp/sails-retirement/final-review-r1/source-inventory.json \
  .tmp/sails-retirement/final-review-r1/source-closure.json
```

- Source: **1054 scanned files, 0 executable violations, 0 forbidden entries**;
  inventory **1025 candidate files/5018 matched lines, 0 unclassified**.
- All **1261** original entries reconcile: 742 remaining classified, 136 removed,
  365 retained without candidates, 18 dependency metadata checks; 265 new
  candidate files also classified.
- Current mounted source/compiled/installed builder tree: **5863 scanned files,
  0 executable violations, 0 forbidden dependency entries**, using the current
  canonical auditor copied into `/tmp`, `NODE_PATH=/opt/redbox-portal/node_modules`
  and `--tree /opt/redbox-portal`. This is not a new immutable-image audit.
- **25 tracked manifests/376 dependency entries**, including 20 allowed local
  references: **0 pin violations**. All **6 changed lockfile roots** match their
  corresponding manifest dependency sections. The review adds no dependencies.

SHA256 of the ignored reports, before this documentation-only closing commit:

| Report | SHA256 |
|---|---|
| `source-closure.json` | `663112df6482010578b134f361057f8e6801dbaee15d4cb3134a3f8f32119f21` |
| `source-inventory.json` | `9d70bbc91a05b9ae74039001fac187040570677aae3e4ab12a08807326e470c2` |
| `inventory-reconciliation.json` | `858f1c6937928b9e9411cd244c14614f9d77406a8716dfe89866c1dd4e11c8ad` |
| `current-built-closure.json` | `1f0dbc9d7c7f823127d6c6fb3892d118461cdba30e1dcd5e2b08fb1cff3a960b` |

The source closure is rerun after committing this evidence. The immutable baseline
inventory and historical P8 artifact ledger are preserved rather than rewritten
to imply a fresh artifact build.

## Reviewed areas without additional defects

- Express admission/start/stop/deadlines/retry, parser/middleware ordering,
  Promise/Observable error completion, headers-sent handling and safe responses.
- Session serialization/rotation/old-session denial; local/AAF/OIDC auth and
  redirects; action policies, CSRF origins/token transport/bearer exemptions;
  actor, stored-brand, membership, object ACL and graph endpoint checks.
- Multipart streaming/limits, path and realpath containment, tus owner/brand/
  record reauthorization, Companion callback gates, one-use progress grants,
  sockets/reconnect, accepted work and drain ownership.
- Pages, installed artifacts/assets, CSP/cache/proxy URLs; record CRUD/schema/
  ETag/CAS/partial effects; harvest and datastreams; identity administration and
  linking; query/report/form/configuration/branding/font/vocabulary/notification/
  integration/SIEM boundaries.
- Persistence/resource ownership, queue activation and stop ordering; extension
  discovery/precedence/storage/PDF; tooling/scaffolds; executable-global and
  retired-adapter closure; all changed dependency/lock roots.
- Existing assertions and the intentional changes in
  [V6 client compatibility](../../../wiki/V6-Client-Compatibility.md), including
  401/404/405/410 contracts, brand/ACL filtering, malformed scalar rejection,
  unsafe GET/HEAD behavior, named actions, forced login, POST logout, CSRF,
  staging ownership, tus and separate Socket.IO/Companion protocols. Targeted
  round-1 tests supplement the historical complete P8 collections; the full
  124-test browser and 329-request Bruno collections were not rerun this round.

A suspected cross-brand record mutation was discarded after tracing authoritative
stored-brand normalization. A proposed socket handshake/quiesce race was also
discarded: work admitted before quiesce remains owned and drains, while the
subscription gate closes. Neither is reported as an unfixed issue.

## Cleanup and handoff

The owned fixtures were `sr-final-r1-builder`, `sr-final-r1-mongo`,
`sr-final-r1-solr` and `sr-final-r1-keycloak`, using host networking and no new
Docker network. All four were removed successfully after verification. Existing images, unrelated
stacks, the isolated daemon and earlier checkpoint stores are preserved. The final
handoff records the resulting HEAD, final closure and cleanup result; a fixed-SHA
evidence record cannot include its own containing commit hash.
