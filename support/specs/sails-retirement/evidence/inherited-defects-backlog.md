# Inherited defects retained for separate follow-up

Through R20 this cumulative backlog records **16 inherited groups**. R18/R19 added
no new inherited group; R20 adds B-15 from the migration differential and B-16
from the installed-process drain diagnosis. The opening
R5 context and later entries retain their original provenance; feature-introduced
findings are fixed and recorded in their respective review reports.

Round 5 applies the feature gate to `a49366803..39ad5813c`. These three P2
items remain unchanged in behavior from the pre-retirement path. None is an
unauthenticated or cross-tenant access/privilege-escalation exception. Already
fixed R1–R4 defects are not duplicated here. Locations refer to round 5's source.

The executable [service-port probes](final-review-r5/inherited-probes.cjs) run
against the rebuilt packages in the Node 26 test container:

```sh
node support/specs/sails-retirement/evidence/final-review-r5/inherited-probes.cjs
```

These are deterministic port interleavings and error observations, not claims
that a real-Mongo or public HTTP exploit was executed. The two extension helpers
below have no selected production caller; R3's enumeration already identified
them. Production authentication uses the awaited Accounts methods instead.

## B-01 — P2: concurrent same-brand role replacements can merge requested sets

**Location:** `packages/redbox-core/src/identity/Users.ts:1352` and
`packages/redbox-core/src/persistence/identity/PrismaIdentityRepositories.ts:194`.

**Reproduction:** pause replacement A after its membership deletion, complete
replacement B with only `member`, then release A's insertion of only `admin`.
The actual Users method leaves both roles. The probe reproduces this for scoped
and unscoped calls. Admin authorization is required by the HTTP entrance; this
is not a normal user's means of acquiring privileges. R4 correctly protects
foreign-brand changes but does not promise serialized edits within one brand.

**Inheritance:** base `PrismaIdentityRepositories.ts:194–222` already implements
replacement as `remove` followed by per-edge `add`; base
`services/UsersService.ts` uses that replacement. Its comment expressly preserves
Waterline's delete-before-insert partial failure. Same-brand concurrency and
partial insertion failures are consequently older behavior, not a fault
introduced by R4's narrower deletion predicate.

**Suggested fix:** design an atomic/versioned membership replacement or durable
per-user serialization that works across processes; return a conflict for a
stale replacement. Preserve foreign-brand edges and qualify real concurrent
writes and injected insert failure. A process-local mutex alone is insufficient
for multiple writers.

## B-02 — P2: legacy email template helper drops completion and errors

**Location:** `packages/redbox-core/src/integrations/Email.ts:254`.

**Reproduction:** call `sendTemplate` with a successful template Observable and
a gated delivery Observable. It returns `undefined` while delivery remains
subscribed. Reject delivery: RxJS reports an unhandled error rather than a
caller-visible failure. The probe observes `config.onUnhandledError` in its
isolated process. An extension calling this helper cannot await completion or
register the returned work with its owner.

**Inheritance:** base `services/EmailService.ts:222–237` has the same nested
subscriptions and void return. R3's async appendix explicitly noted this
unselected exported helper. No selected production invocation was found in R5;
the owned record-notification path is separate and already fixed.

**Suggested fix:** replace the nested subscriptions with a returned, composed
Observable/Promise, propagate errors, and bind accepted work at actual extension
callers. Document any return-contract change; retain delivery drain/error tests.

## B-03 — P2: legacy Users post-save wrapper discards the Accounts Promise

**Location:** `packages/redbox-core/src/identity/Users.ts:788`.

**Reproduction:** supply an Accounts post-save operation whose Promise is still
gated, then call `Users.triggerPostSaveTriggers`. The wrapper immediately returns
`undefined`; its caller has no handle to await/register, and a rejected operation
has no rejection handler at this wrapper. The probe verifies the lost handle
with a resolving gate, avoiding an intentional process-level rejection.

**Inheritance:** base `services/UsersService.ts` has the same void wrapper around
`authenticationAccounts().triggerPostSaveTriggers`. R3's async appendix already
identifies it as unselected. Production Accounts create/update/login paths await
their own post-save operations and do not call this wrapper.

**Suggested fix:** return/await the Accounts Promise and require extension callers
to retain it within their admitted lifetime; add a delayed success/rejection
contract test. Do not replace the already-owned production account path.

## B-04 — P3: translation tests leak their global Fetch stub into later suites

**Location:** `packages/redbox-dev-tools/test/commands/sync-translation.test.ts:88`
and its `afterEach` at line 26.

**Reproduction:** R7's generated-route HTTP regression passes alone. In the full
dev-tools run, the earlier translation suite assigns a standalone Sinon stub to
`global.fetch`. Its teardown calls `sinon.restore()`, which does not restore that
manual assignment. A subsequent real `fetch` hits the translation stub's fallback
and throws at line 74: the full run has 52 passing / 1 failing. R7's new wire
regression uses Node's HTTP transport independently; the inherited Fetch mutation
remains unchanged.

**Inheritance:** this file has no diff from `a49366803` to the incoming
`768e1bbfe`; the baseline already assigns the callback directly and omits restoring
the original global. This is test-order contamination, with no demonstrated
production impact or access-control exception.

**Suggested fix:** preserve and restore the original Fetch function in teardown,
or install a Sinon-managed stub on the global property so `restore()` owns it.
Qualify the translation tests followed by a real Fetch request in one process.

## B-05 — P2: long unversioned asset names receive immutable year-long caching

**Location:** `packages/redbox-core/src/http/express/pageHeaders.ts:11`.

**Reproduction:** the actual immutable-asset matcher accepts
`/default/rdmp/images/checklist.png` and `/js/redbox-progress.js`, although neither
basename contains a content fingerprint. Static delivery consequently marks them
`public, max-age=31536000, immutable`. A deployment changing bytes at the same URL
can leave a browser using the older artifact for a year. The fingerprinted
`/angular/form/browser/main-ABC12345.js` is a positive control.

**Inheritance:** `a49366803:packages/redbox-core/src/config/http.config.ts:227–234`
uses the same basename expression; its middleware at lines 800–806 applies the
same immutable year-long header before its no-cache path handling. R8 extracts
and evaluates only the baseline matcher functions, comparing them with the
compiled current matcher: all three paths return true in both. This is unchanged
behavior, so no runtime correction is included in Sails retirement. No severe
ordinary-user access-control exception was demonstrated.

**Suggested fix:** distinguish a real generated content fingerprint from an
ordinary basename and retain validation/revalidation for unversioned assets.
Qualify changed bytes across two deployments and preserve immutable caching for
fingerprinted Angular bundles. The executable comparison and its observations
are retained in `final-review-r8/cache-inheritance-probe.cjs` and R8 qualification
hashes; the full baseline configuration is not copied into the evidence.

## B-06 — P2: REST user listing ignores `includeDisabled=true`

**Location:** `packages/redbox-core/src/http/express/identityLinks.ts:171`.

**Reproduction:** validate `?includeDisabled=true` through the actual REST route
contract: its extracted value is boolean `true`. The handler compares it with
string `'true'`, so a fixture containing one active and one effectively disabled
user returns only the active user and understates `summary.numFound`.

**Inheritance:** `a49366803:packages/redbox-core/src/controllers/webservice/UserManagementController.ts:187`
uses the same string comparison on the validated parameter. Executing the actual
baseline method and current handler with the same extracted request selects only
the active user in both. Round 11 independently reruns this probe under Node
26.11.1; local reproduction and output are retained under
`.tmp/sails-retirement/final-review-r11/standards/include-disabled-probe.cjs` and
`inherited-disabled-verified.log`, with hashes in the qualification manifest.
This is unchanged administrator-facing listing behavior; no severe access-control
exception was demonstrated.

**Suggested fix:** consume the validated boolean directly and cover both query
values through real HTTP, including returned users and summary counts. Preserve
requested-brand scoping and the default exclusion of disabled users.

## B-07 — P3: configuration declarations omit five accepted baseline shapes

**Locations and inheritance:** the source-derived R13 table checks each declaration
at `a49366803164429f9d8bdd249dadcdf856c9d13e` and in the current source. Both omit:

| Accepted shape | Inherited declaration location |
| --- | --- |
| AAF `loginUrl` | `packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts:26`, `BrandAuthAafConfig` |
| OIDC `claimMappingOptions` | Same file, line 35, `BrandAuthOidcConfig` |
| Solr transform `jsonString` | `packages/redbox-core/src/config/solr.config.ts:56`, `SolrPreIndexConfig` |
| i18n `defaultNS` | `packages/redbox-core/src/config/i18n.config.ts:16`, `I18nNextInitConfig` |
| Reusable form placeholders | `packages/sails-ng-common/src/config/dictionary.outline.ts:209`, `ReusableFormDefinitions` and its component-frame union |

**Reproduction:** all 195 retained literal configuration fixtures pass the actual
v6 loader and AJV validation. Compiling those same literal values against the
public configuration type produces ten inherited diagnostics across nine fixtures
in these five categories. This is one grouped typing backlog item with five
subcases; these are not runtime input rejections or additional incoming P2 defects.
The generated table retains each value and marks only the exact inherited
diagnostic with `@ts-expect-error`; no cast or runtime exclusion hides the input.

**Evidence:** `final-review-r13/configuration-acceptance.json` retains baseline
declaration text, line provenance, exact diagnostics and fixture indices in
`typingBacklog` and `typingDiagnostics`. Its generator verifies the omissions in
both source versions and rejects unexpected compiler failures.

**Suggested fix:** align the original declarations with the existing runtime
contracts and retain the full literal table as the regression. No runtime change
or access-control exception is warranted in this retirement review.

## B-08 — P2: configured native index TTL and hidden options are dropped

**Location:** `packages/sails-hook-redbox-storage-mongo/src/persistence/preflight.ts:105`,
`storageIndexes`.

**Reproduction:** execute the actual baseline and current descriptor builders with
`{ key: { expires: 1 }, name: 'institution-expiry', expireAfterSeconds: 60,
hidden: true, sparse: true }`. Both emit datastore/collection/name/keys/sparse
without the TTL or hidden options. Configured expiration therefore cannot reach
the index creation descriptor. This is an extracted-method probe, not a claim
that a MongoDB TTL expiry was observed.

**Inheritance:** the baseline builder at
`a49366803:packages/sails-hook-redbox-storage-mongo/src/persistence/preflight.ts:97`
has the same option allowlist. R13 correctly restored acceptance of native
descriptor shapes; it did not introduce this consumer omission. There is no
ordinary-user access-control exception. Reproduction and provenance are in
`final-review-r14/entrypoints-probes.cjs`, `entrypoints-probe-results.json` and
`entrypoints-differential.json`.

**Suggested fix:** preserve supported native options through the common index
descriptor, inspection and ensure comparison; qualify actual creation, TTL and
existing-index conflicts separately.

## B-09 — P2: vocabulary administration listing ignores the requested brand

**Location:** `packages/redbox-core/src/vocabulary/Vocabulary.ts:252`, `list`.

**Reproduction:** request `branding: 'brand-1'` from the actual service method
with repository ports containing one local and one foreign vocabulary. Both
count/list predicates omit branding and both rows are returned. The explicit
comment treats this administration feature as single-tenant. The deterministic
port probe is retained in `final-review-r14/identity-inherited.cjs`; no public HTTP
or real database exploit is claimed.

**Inheritance:** `a49366803:packages/redbox-core/src/services/VocabularyService.ts`
contains the same method/comment/predicate. The native administration entrance
requires a brand Admin; ordinary signed-in users cannot reach this list. No severe
ordinary-user access-control exception applies, so runtime behavior remains
unchanged in this review.

**Suggested fix:** use a normalized requested-brand predicate in count and list,
retain total/pagination consistency, and cover mixed-brand administrator fixtures
through HTTP and persistence.

## B-10 — P2: profile page references an absent legacy Angular application

**Location:** `views/default/default/user/profile.ejs:13`.

**Reproduction:** the profile page emits six `/angular/userProfile/*.bundle.js`
URLs (`inline`, `polyfills`, `scripts`, `styles`, `vendor`, `main`). The actual
current `mountStaticPageArtifacts` handler returns **404 for all six** against
the built public tree plus source assets. Neither current `angular/angular.json`
nor the pre-feature project inventory contains a user-profile application to
produce those files. The profile screen consequently has no shipped component
that can replace its loading indicator or call the self-profile/token endpoints.

**Inheritance:** the template at `a49366803` emits the exact same six filenames;
only the root-context helper changed during retirement. Both project inventories
omit the client. This is an unchanged missing build artifact, not a new failure
of the supported Express profile/token HTTP routes. No access-control exception
applies. The executable source/static-HTTP comparison and results are retained in
`final-review-r15/legacy-profile-probe.cjs` and `legacy-profile-results.json`.

**Suggested fix:** provide and build a maintained profile application, update the
EJS bundle references to its actual output, and exercise visible profile/token
success and failure behavior. Keep this separate from Sails retirement's
coordinated administration-client corrections.

## B-11 — P2: older browser initialization/list loads do not recover rejected requests

**Locations:** under `angular/projects/researchdatabox/`: report
`report.component.ts:78,85`; deleted-records
`deleted-records.component.ts:167,239`; manage-users
`manage-users.component.ts:147,256`; manage-roles `manage-roles.component.ts:51`;
app-config `app-config.component.ts:71`; dashboard `dashboard.component.ts:119,224,258,291,342`;
export `export.component.ts:60`; shared `portal-ng-common/src/lib/config.service.ts:72`
and `base.component.ts:62`. Application component paths are below `src/app/`.

**Reproduction:** report and deleted-record paging leave `resultsReturned` false.
Initial app-config, role and
user-list reads reject without an application error message. Shared config's
subscription lacks an error callback, so RxJS reports the failure while waiting
initializers never receive a completion. Dashboard/export initialization has the
same uncaught propagation; dashboard paging clears its processing flag in
`finally` but does not display the error.

**Inheritance:** R16's [rejected-port probes](final-review-r16/client-error-probes.cjs)
execute five identical baseline/current methods at status 0/403/500, plus the actual
RxJS bootstrap subscription at both revisions: **32 observations**. The
[client ledger](final-review-r16/client-error-sweep.json) retains whole-file
baseline/current equality for unchanged consumers and 14 affected HttpClient
callsites (some have both recovering and nonrecovering callers). R15-edited users
and roles have method-level equality controls for these older reads. Baseline
protected reads already denied authentication/authorization; transport failures
already rejected and missing report definitions already failed. New native
identity mutation rejections were fixed in R15. R16 separately fixes local login:
the newly awaited audit can reject500 where baseline completed successfully, so
that consumer is class A and is not included here. No newly failing realistic normal input
or severe ordinary-user access-control exception was established.

**Suggested fix:** add visible load errors and retry/login actions, clear
pending flags in `finally`, and propagate bootstrap errors to dependents. Preserve
drafts and distinguish an unknown write outcome from confirmed refusal. Exercise
real expired sessions, CSRF rotation, network failures and retry in the browser.

## B-12 — P3: some browser read failures silently use empty/default data

**Locations:** under `angular/projects/researchdatabox/`: form
`src/app/component/record-metadata-retriever.component.ts:127` and
`src/app/component/pdf-list.component.ts:107`; translation
`src/app/translation.component.ts:568,582,614` and its bundle-read callers.

**Reproduction:** metadata retrieval logs failure without publishing a value;
PDF attachments become an empty list; translation reads log failure and return
empty entries/languages or assume bundle defaults. These paths settle, but users
may mistake failed reads for absent data. Five HttpClient callsites have these
quiet-fallback consumers; other callers of the same service can handle errors.

**Inheritance:** the ledger's baseline/current hashes prove these complete
consumer files are byte-identical to `a49366803`. Existing failures already use
the same fallback. No write, lost data or access-control fault was demonstrated;
this is recorded as P3, not promoted merely because the new host sanitizes errors.

**Suggested fix:** retain safe fallback values while displaying a load warning
and an explicit retry action where the distinction affects the user's decision.

## B-13 — P2: deleted-record actions ignore unsuccessful typed mutation results

**Locations:** `angular/projects/researchdatabox/deleted-records/src/app/deleted-records.component.ts:188,222`.

**Reproduction:** return an unsuccessful result from restore/destroy. Both callers
log it and reload the list; destroy also closes its confirmation modal. Neither
displays the refusal/unknown outcome. R16's extracted-method probe observes these
two methods at baseline and current (**four observations**). This does not prove
that a failed action wrote data.

**Inheritance:** the complete component and shared `record.service.ts` are
byte-identical to the feature base. The pre-existing lifecycle service already
normalized failures into `RecordActionResult`; consumers already ignored them.
The ledger marks three shared mutation/preflight callsites, not three separate
UI defects. Form-owned delete/save consumers handle their typed outcomes.

**Suggested fix:** inspect the typed result before closing the modal or declaring
completion, preserve unknown outcomes for reconciliation, and show a retryable
failure without treating a network error as proof of rollback.

## B-14 — P2: raw-audit download link omits a configured deployment root

**Locations:** `packages/redbox-core/src/http/express/queryReads.ts:336`;
`packages/redbox-core/src/queries/RecordAuditViews.ts:347`;
`angular/projects/researchdatabox/record-audit/src/app/record-audit.component.ts:161`
and `record-audit.component.html:72`.

**Reproduction:** mount the native routes under `/research`. The audit tab
returns `/default/portal/api/records/audit/record-1`; the shipped direct link
returns404, while `/research` plus the same path returns200. The response and
Angular consumer do not add the configured root.

**Inheritance:** executing baseline `RecordAuditController.buildRawAuditUrl`
(`a49366803`, line86) produces the identical URL. R16 records five observations
using actual current loopback HTTP, the actual extracted baseline method and
source-backed Angular assignment/href in
[audit-root-results.json](final-review-r16/audit-root-results.json). Record ports
are controlled; this is not a deployed proxy/browser or historical HTTP run.
No authorization bypass or severe access-control exception was demonstrated.

**Suggested fix:** construct the URL with the selected root context on the server
and cover the rendered download link under both empty and nonempty roots.

## B-15 — P2: failed branding history insertion is not recovered on migration retry

**Locations:** WSU `c1c847d`,
`src/migrations/2026.07.21T000000-set-wsu-branding-variables.ts:107–118` and
`2026.07.21T010000-repair-wsu-branding-variables.ts:12` (delegation).

**Reproduction:** persist `updateBrand`, then reject `createBrandHistory` before
its insertion. The saved brand has the intended variables/CSS/hash and advanced
version, but its matching history is missing. All subsequent runs take
`if (!changed) { continue; }` and never retry the missing history. This leaves
the operator without that version's historical snapshot. The
[R20 migration differential](r20-migrations.md) records **12 failure-boundary
observations**, six for each migration, across existing and initially absent
brands. Both failure immediately after update and failure before history insert
produce the gap. The matching brand hash remains, with no repair on rerun.

**Inheritance:** archived WSU `14ab99e`, the same first migration at lines
118–129, already updates before creating history and has the same unchanged-brand
skip. Its repair migration calls the same function. The pinned actual migration
bodies reproduce identical outcomes through synthetic ports in both versions;
this is not a released-v5/Waterline/Mongo integration run. No class-A regression,
missing current brand data or severe access-control exception is claimed.

**Contract and scope:** [hook migration guidance](../hook-migration-v6.md#awaited-bootstrap-and-migrations)
says migrations provide “no transaction, rollback, or exactly-once guarantee.”
That limitation is retained; the defect is specifically that a retry can complete
while permanently omitting its intended history. No product change was made.

**Suggested fix:** reconcile the required history for the persisted brand version
before treating an unchanged brand as complete, with a duplicate-safe identity
and tests for update acknowledgement loss and failed/acknowledgement-lost history
insertion. Keep this separate from the retirement feature gate.

## B-16 — P2: completed Agenda jobs leave watchdog timers delaying natural exit

**Location:** installed Agenda 6.2.6 `dist/JobProcessor.js:5,434–462,484`;
`JobProcessor.stop()` at lines 93–110.

**Reproduction:** R20 installed WSU matrix8 completed its assertions and reported
zero registered pools, clients, operations and cleanup resources, but remained
alive. Inspector observation at uptime 319.469 seconds found only stdio pipes and
one referenced 300,000 ms timer, created at uptime 29.748 seconds; no network
handles or requests remained. Docker records natural exit **0** after **329.869
seconds**, matching the timer's expiry. Agenda races `job.run()` against a
watchdog sleeping for half the lock lifetime (five minutes by default). Job
completion sets `jobIsRunning=false` without cancelling the sleep, and processor
stop does not clear it. This is bounded operator-facing exit latency, not evidence
of lost writes, open persistence pools or an access-control defect.

**Inheritance:** pre-retirement feature base `a49366803` already pins Agenda 6.2.6.
The designated released v5.0.4/WSU image `sha256:2a0ca94182fed139207c0d4da41102f58a7e42638cb747ad57636a2b12160b48`
contains Agenda 6.2.5 with a byte-identical delay line and complete watchdog/race
block. V5's installed queue service starts Agenda and schedules
`MoveCompletedJobsToHistory` without overriding its lock lifetime, so this path
is reachable there. Isolated invocations of the actual installed dependency in
v5, R18 and R20 each completed a job, stopped the processor, retained a referenced
600 ms watchdog under a scaled 1,200 ms lock lifetime, and naturally exited 0.
The harness never cleared/unrefed timers; this does not claim a full v5 shutdown
qualification. R18/current dependency equality alone is not the inheritance basis.

**Contract and evidence scope:** [design.md:406](../design.md) requires “Report
clean stop only when every required owner has completed cleanup.” Zero registered
pools does not establish prompt natural process exit. SR-045/SR-049/SR-055 may
retain their actual successful checks and eventual natural exit 0, with this
inherited latency disclosed; no general prompt-exit guarantee follows. The
[R20 drain report](final-review-r20/drain-review.md) and raw
`.tmp/sails-retirement/final-review-r20/spec-drain-diagnosis/` scripts, inspector
snapshot, Docker events, three reproduction logs and exact v5 sources retain
the proof. No product fix or severe ordinary-user access exception is claimed.

**Suggested follow-up:** arrange cancellation/join of Agenda's completed-job
watchdog in the dependency and qualify natural process exit after real jobs and
stop. Preserve worker/backend-write ownership and failed-drain retry; forcing
exit or indiscriminately unrefing active-work timers is not a substitute.
