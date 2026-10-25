3 class-(A) P1/P2 issues found

# Sails retirement final review — round 15

Feature base `a49366803`; incoming HEAD `bda01cb25`. Review and fixes use the
shared `stack/sails-retirement` checkout. No worktrees, branch switches, pushes,
publication or tags. The unrelated untracked GraphQL specification is untouched.
The supplied specification, R1–R14 evidence and differential ledgers, inherited
backlog, AGENTS.md and tracked wiki informed this round. Code Review and ReDBox
Testing skills were used, with delegated Standards/persistence and Spec/Angular
reviews. SR-005/045/049/055 remain unchecked solely because no representative
institution is designated.

## Verified class-A defects

The first two findings are P2 browser/server contract regressions. Native identity
endpoints return non-2xx errors, whereas their former browser actions commonly
returned HTTP200 with `{status:false,message}`. These shipped clients awaited
the Promise without handling rejection. Real Express500 responses leave the
incoming methods displaying “Saving…”, “Generating…” or “Revoking…”; the corrected
methods display the safe error, retain the draft/modal and complete normally.

| ID | Severity | Shipped consumer / correction | File:line | Fix commit |
| --- | --- | --- | --- | --- |
| R15-01 | P2 | User creation, detail updates and key generation/revocation lacked rejection handling. Local catches accept v1/v2 safe details and otherwise ask the operator to refresh to check account state. | `angular/projects/researchdatabox/manage-users/src/app/manage-users.component.ts:367` | `8b091d8dc` |
| R15-02 | P2 | Role update left “Saving…” after HTTP failure. Catch and display the safe failure while preserving selected roles. | `angular/projects/researchdatabox/manage-roles/src/app/manage-roles.component.ts:114` | `e4a198691` |
| R15-03 | P2 | Both form upload widgets supplied CSRF only in the nested Tus payload, so native Companion transfer requests received403. Supply the current token in Companion request headers for all three cloud providers. | `angular/projects/researchdatabox/form/src/app/component/file-upload.component.ts:313`; `data-location.component.ts:426` | `709483c46` |

The third finding is independently proved by the actual installed Uppy
RequestClient, extracted widget initialization, native Companion admission and
real session CSRF. The [24 observations and two delayed-update controls](final-review-r15/angular-companion-results.json)
include incoming requests rejected403 despite a nested Tus token, current
requests accepted200, and header controls. Provider dispatch is controlled; no
OAuth login or live cloud transfer is claimed by that probe. Both focused widget
specifications pass **54/54** in Chrome, including four immediate/delayed cases
that inspect the installed client's private request headers through its API.

No server status/envelope was changed. The fallback acknowledges that a failed
response may follow a committed mutation; it does not falsely promise rollback.
Existing successes and application-level `{status:false}` failures retain their
behavior. Regression cases cover transport0, validation400, permission403 and
backend500. Accepted incoming Chrome controls show **16 expected failures / 23
passing controls** for users and **4 expected failures / 1 passing control** for
roles. Corrected Chrome Headless153 suites pass **39/39 and 5/5**, without pending
tests. [Actual Express-to-consumer observations](final-review-r15/angular-consumer-results.json)
pass **10 checks** (five incoming failures, five corrected completions). These
execute actual extracted consumer methods against controlled native identity
ports; they are not a historical Sails HTTP server or a substitute for the full
browser/persistence qualification below.

## Client/server contract differential

The [Angular contract ledger](final-review-r15/angular-contracts.json) covers
**22 projects (20 apps / two libraries)**, **259 production TypeScript files**
and **80 templates**. All **123 HttpClient callsites** map to **128 distinct
native route IDs**, with **zero unmatched calls**. The source graph retains
**3,129 conservative call edges**; edges are not independent HTTP requests.
Request construction, shared CSRF/credentials/version behavior, returned fields,
status handling and actual consumers are retained per callsite.

The supplement inventories **149 non-HttpClient/source-resource sites**, including
**54 explicit non-HTTP controls**, **26 literal bundled imports**, **two Tus and
six Companion installations**, three dynamic caller sites targeting four native
URLs, variable imports, i18next, maps/tiles, fonts/styles, downloads/navigation
and embedded DOI/template resources. The shared browser package has **141
TypeScript files** and one marked chunk import, with no additional API calls.
These are source/protocol families with overlap, not 149 distinct server APIs.
The installed-client Companion probe found R15-03 through this pass. **59
extracted P3 consumer probes** pass for graph meta and named-query, report and
branding error/finalization handling. The three app-boundary findings arise
from **two underlying contract families**: HTTP rejection handling and Companion
CSRF headers.

The [legacy/EJS ledger](final-review-r15/legacy-client-contracts.json) covers
**58 tracked source entry files**, **15 request initiators** and **164 passive
resource/navigation references**. It records methods, URL construction, request
shape, CSRF/credentials/version headers, consumed fields and status handling.
The shipped progress helper uses the native token endpoint and authorized
Socket.IO grant protocol. Logout forms include CSRF, Redoc reads the native
OpenAPI document, and external vocabulary/geometry/analytics/AAF requests are
identified separately. No additional class-A P1/P2 was verified here. Passive
references and vendor transports are not counted as additional application APIs.

R14's added graph meta/ETag does not replace graph fields read by the client;
the omitted redundant named-query `errors[].status` is not consumed. Report
configuration editors catch non-2xx and clear saving/preview flags. Those
observations remain P3. The identity error-response group is partially promoted
to the two concrete defects above. Other recorded cache, audit/chronicle and
wording differences remain visible; this review does not assert byte parity or
live qualification of external providers/arbitrary institution scripts.

## Persistence differential and R14 correctness

The [source-derived inventory](final-review-r15/persistence-inventory.json)
covers **693 runtime files / 4,452 methods**, including **2,807 unchanged-body
controls**. It retains **1,485 conservative mutation-call candidates**, with
**27 explicitly excluded** in-memory/non-document operations; caller and sink
layers overlap, so these are not counts of distinct database writes. The ledger
traces changed/new writes through records, identity/membership, attachment and
GridFS metadata, workflow, vocabulary, configuration, audit/chronicle and
composition. **643 persisted contract fields across 49 models** have **641
unchanged definitions**; the two additions are expected optional attachment
staging-owner fields. Defaults, normalization, physical IDs and timestamp
sources are compared separately.

Actual Mongo **9.0.4** and Node **26.11.1** supply **18 passing observations**
and **five normalized baseline/current raw-document equality assertions** in
[the retained BSON-aware snapshots](final-review-r15/persistence-probe-results.json).
Scenarios include legacy live-record deletion/restoration, legacy tombstone
backfill/restoration, user patch/membership/audit, JSON configuration/CAS,
vocabulary normalization, record-type/form/workflow definitions, legacy
attachment patch/access audit, fresh record creation/workflow transition and
record audit/GridFS bytes. The focused native-Mongo Prisma suite passes **30
cases**. Baseline bodies are executed from the pinned feature-base source with
explicit fixture ports; this is not a baseline application deployment. No new
persistence P1/P2 or P3 is confirmed.

The [target-selection ledger](final-review-r15/target-selection.json) reviews
**95 native routes** involving user identities or record IDs. The supplementary
[native HTTP controls](final-review-r15/target-controls.json) pass **30 checks**
with conflicting path/body/query identities, covering token, link, audit,
permission, transition, delete, restore and destroy siblings. Existing R13/R14
regressions supply the REST body.id and browser body.userid/self-actor controls.
A focused adjacent run passes **173 cases**. These counts overlap the full suite
and are not added to its totals.

Both R14 P1 fixes are correct. Browser deletion continues to pass false/delete
even with `?permanent=true`; REST permanent deletion selects true/purge. The
actual storage lifecycle preserves a recoverable tombstone and restores the
legacy document. REST user update selects body.id; other user routes retain
their own declared path/body/query/actor identity rather than applying that rule
indiscriminately. No R14 correction was reversed or found wrong.

## Inherited backlog and clean areas

One inherited P2 is appended as **B-10** in the
[backlog](inherited-defects-backlog.md): the profile EJS references six absent
`userProfile/*.bundle.js` artifacts. All six return404 through the current actual
static handler. The exact filenames and missing Angular project also occur at
the feature base; this is a current-HTTP/baseline-source proof, not historical
HTTP execution. No severe ordinary-user access-control exception applies, so it
is left unchanged. B-01–B-09 remain unchanged.

No further verified class-A P1/P2 was found in the enumerated request shapes,
CSRF/version/credential construction, response consumers, record/user target
selection, legacy reads or persisted writes. Clean conclusions are bounded by
the source inventories and executable scenarios; they do not claim execution
of arbitrary institutional hooks or external services.

## Final-tree qualification

Every accepted gate uses runtime/test inputs frozen at
`709483c4670583677e8318cb9dadc14fa362b549`, on Node **26.11.1** and npm
**11.20.0**. The [qualification manifest](final-review-r15/qualification.json)
records the actual results, input audits, toolchain/images, cleanup, **288 durable
scratch artifact hashes** and **43 review artifact hashes**. Logs and drivers
remain on disk under `.tmp/sails-retirement/final-review-r15/`. Expected negative
controls and rejected attempts are retained separately and supply no final gate.

| Gate | Accepted result |
| --- | --- |
| Core default | **5,631 passed**, seven existing pending. |
| Core real-service | **224 passed**, zero pending; natural process exit, without instrumentation or forced exit. |
| Companion lifecycle / Mongo uploads | **2 / 6 passed**. |
| Root integration | **422 passed**, ten existing pending. |
| Storage / dev-tools / PDF unit | **306 / 53 / 79 passed**. |
| Full Playwright / harness | **124 / 19 passed**, zero failures or skips. |
| Dedicated retirement browser | **4 passed**: visible Angular edits, real upload/progress bytes, real Keycloak, accepted PDF/session/upload lifetime and retried stop. |
| Production host / generated institution | **1 / 1 passed**. |
| Persisted compiled hooks | **5 passed**, zero skips. |
| Bruno general | **309 requests, 554 tests and three assertions passed**; 557 JUnit cases. |
| Bruno OIDC / S3 / PDF | **13 / 7 / 4 requests**, **17 / 12 / 10 tests passed**, zero failures, errors or skips. |
| Packed standalone maintenance | **Ten commands across 102 scopes**, three Agenda scopes; pending/failures/pools zero, explicit backfill changes one entry then zero. |
| Focused Angular regressions | **98 passed** in actual Chrome: users39, roles5, widgets54; includes 24 new cases. |
| Clean source build | Literal **npm ci --ignore-scripts --strict-peer-deps**, **compile:all** (backend, 22 Angular projects and Webpack), and **package:pages** exit zero. Nine existing build advisories. |
| Backend/static gates | Five fresh package builds, declared host/container typechecks, Prisma/configuration checks and **17 closure-tooling tests passed**. |
| Lint / documentation | **937 files, zero lint errors**, one existing control-regex advisory; **43 documentation surfaces**, 524 existing advisories, **four documentation tests passed**. |
| Pins / lock roots | **23 tracked manifests, 377 declarations, 20 allowed local references, six lock roots**, zero violations; no dependency changes. |
| Retirement closure | **1,153 committed source files / 6,259 compiled-tree files** at the frozen runtime revision, zero executable violations or forbidden dependencies. **1,261/1,261** baseline files reconciled; 1,124 current classified matches. |

Final input audits compare **1,942 clean-source files**, **1,347 builder runtime
files** and **48 root page/asset inputs**, with zero differences. The changed
Angular output is copied byte-for-byte from the clean build: users11, roles11,
form152 files, **174 in total**. Both actual matcher consumers in the builder and
clean compiler resolve the expected exact **path-to-regexp8.4.2** bytes. The
reviewers' source/artifact hashes also reverify, including all 693 persistence
source files and eight changed Angular runtime/spec inputs.

The clean-build prefix at `e4a198691` was stopped after R15-03 was proved and is
wholly rejected; the literal install/build and qualification restarted at
`709483c46`. A later environment-only retirement-browser attempt passed three
checks but timed out before PDF generation. Direct executable preflight proved
the manually assembled provider Chromium environment lacked
`libwayland-server.so.0`. The missing library was copied from the already audited
native rehearsal image, its bytes checked in the builder, and unresolved native
libraries verified zero. All four unchanged tests then passed, including actual
PDF bytes and zero pools/clients/listeners after stop. No application, fixture or
test source changed for this repair; earlier unaffected successful gates were
retained. The failed attempt, trace, video and executable error are preserved in
`retirement-browser-environment-rejected/`. The accepted browser output is the
fresh **4/4** run. No reboot interrupted qualification.

The existing audited images were reused with current compiled overlays; no new
immutable-image or topology-matrix qualification is claimed. All owned
containers, volumes, networks, firewall rules and hosts aliases are removed.
The restored isolated daemon/containerd and temporary `/run` namespace are
stopped/removed. No images were built and no new dangling images remain;
pre-existing images/data are preserved. Generated Bruno environment and lock
files are restored byte-for-byte. The unrelated GraphQL directory is untouched.
