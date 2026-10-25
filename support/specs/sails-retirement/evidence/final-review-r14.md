12 class-(A) P1/P2 issues found

# Sails retirement final review — round 14

Feature base `a49366803`; incoming HEAD `9bb858218`. The shared
`stack/sails-retirement` checkout was reviewed and fixed in place. No worktrees,
branch switches, pushes, publication or tags. The unrelated untracked GraphQL
specification directory was ignored. R1–R13 evidence, the inherited backlog,
AGENTS.md, the tracked wiki and the supplied retirement specifications informed
the review. The Code Review and ReDBox Testing skills were used, including the
skill's delegated Standards and Spec reviews.

## Verified class-A defects

Twelve families were reproduced and fixed: **two P1 and ten P2**. Locations refer
to the corrected files under `packages/redbox-core/`. Related subcases are grouped
at their handler boundary rather than counted as separate findings.

| ID | Severity | Failure / restored behavior | File:line | Fix commit |
| --- | --- | --- | --- | --- |
| R14-01 | P2 | Browser relationship reads used the nested REST envelope; retain flattened v1 and `meta.relationships` in v2. | `src/http/express/recordReads.ts:410` | `8b64e7f69` |
| R14-02 | P1 | Browser `DELETE ?permanent=true` purged instead of preserving recoverability; browser deletion always passes false/delete. | `src/http/express/recordMutations.ts:200` | `8c9fef62f` |
| R14-03 | P2 | Browser post-save reread/projection failure lost committed state/ETag or warnings; retain saved-with-warnings and `response-projection-failed`. | `src/http/express/recordMutations.ts:513` | `8c9fef62f` |
| R14-04 | P2 | Create Location used internal HTTP Host behind a proxy; use configured public URL including deployment root. | `src/http/express/recordMutations.ts:524`; `src/application/portal/http.ts:480` | `8c9fef62f` |
| R14-05 | P2 | POST report previews ignored body filters and let query win; restore path > validated body > query. | `src/http/express/queryReads.ts:153` | `fb08b5447` |
| R14-06 | P1 | REST user update preferred query.id over declared body.id and updated the wrong account; use body.id. | `src/http/express/identityAdministration.ts:171` | `4c3261530` |
| R14-07 | P2 | REST lookups hid disabled accounts and inherited browser-only hiddenUsers filtering; restore REST list/find/get visibility. | `src/http/express/identityLinks.ts:170` | `4c3261530` |
| R14-08 | P2 | Generic browser storage downloads required attachment metadata and changed the default filename; permit authorized generic IDs and default filename=id. | `src/http/express/datastreamReads.ts:76` | `ea2a97c6c` |
| R14-09 | P2 | Streamed API downloads lost Content-Length and empty fileName lost the metadata fallback. | `src/http/express/datastreamReads.ts:123` | `ea2a97c6c` |
| R14-10 | P2 | Empty optional RVA version failed400 instead of selecting latest; normalize it to undefined. | `src/http/express/vocabularyIntegrations.ts:69` | `da600162f` |
| R14-11 | P2 | Upload finalization failure returned200 or lost committed meta/ETag; refused claims also lost typed outcome/current authorized projection and v1 status semantics. | `src/http/express/datastreamWrites.ts:147` | `17504071e` |
| R14-12 | P2 | Original-record URL ignored institution `record/view-orig` override; honor it with core view fallback. | `src/http/express/pages.ts:56` | `c33416372` |

The deletion P1 removes the possibility of restoring a record in realistic use.
The identity P1 changes a different same-brand account from the one submitted by
an administrator. Both are feature-introduced behavior, not inherited exceptions.
Download corrections retain stored-brand and view ACL checks; API downloads
still require attachment membership. Upload refusals cannot expose a stale losing
snapshot after view access is revoked. No shared response helper was changed.

## HTTP behavioral differential

The exact R13 **335-route inventory**, including aliases, was reused. Each row
compares precedence, domain operation/arguments/target identity, status, response
body/envelope/fields, headers, errors, and audit/log/event/queue effects. The
[summary](final-review-r14/differential-summary.json) is generated and checked by
[validate-differentials.cjs](final-review-r14/validate-differentials.cjs); it rejects
missing/duplicate IDs and empty dimensions.

| Scope | Routes | Populated dimensions | Fixed families |
| --- | ---: | ---: | ---: |
| Records, queries, configuration | 142 | 994 | 5 |
| Identity, vocabulary, branding, integrations, downloads | 119 | 833 | 5 |
| Authentication, pages/assets, upload/progress/action adapters | 74 | 518 | 2 |
| Total | **335** | **2,345** | **12** |

The defects affect **19 distinct routes**. The other 316 rows have no additional
verified class-A P1/P2; documented compatibility breaks and recorded P3 differences
remain visible in each ledger. Sources and conclusions are retained in
[records](final-review-r14/records-differential.json),
[identity](final-review-r14/identity-differential.json) and
[parent](final-review-r14/parent-differential.json) ledgers. Their coverage flags
separate static review from executed observations.

New regressions comprise **72 native HTTP cases and two production composition
checks**. Incoming handlers reproduce **40 HTTP failures plus two binding failures**;
32 HTTP controls already pass. Corrected combined coverage passes **138 checks**,
including 64 existing adjacent checks. The records reviewer separately ran 157
focused checks; identity ran 126; these overlap and are not added to 138. Records'
initial local gate used Node 26.7.0; parent qualification uses pinned 26.11.1.

There are **31 actual baseline-method observations** (13 records, 13 identity,
five parent), executed from pinned controller/helper method bodies with explicit
ports. These are not a baseline Sails HTTP server. Incoming-module loaders retain
current shared dependencies and do not pretend to execute a full historical
checkout. Native HTTP uses real Express loopback listeners with controlled domain
ports. The full deployed/provider/persistence suites below supply separate evidence.

Content types, cache/disposition/Location, ordinary route CORS ownership, typed
errors and partial-persistence responses were compared through both handler and
shared policy/response composition. No hypothetical generic CORS defect is
claimed. The ledgers identify documented authentication/session/CSRF changes,
safe error text, GET-body retirement, malformed scalar rejection, named extension
operations, direct Socket.IO grants and native tus/Companion transports.

## Non-HTTP differential

The [entrypoint ledger](final-review-r14/entrypoints-differential.json) has
**189 entries / 1,323 populated dimensions**. It follows job name → selected
handler → attrs/arguments; CLI arguments/output/exit/errors; and callback names,
contexts, returned values, awaiting and side effects.

| Category | Entries |
| --- | ---: |
| Built-in queue jobs plus bundled PDF job | 17 |
| Record operation conversions | 32 |
| Selected core domain factories | 44 |
| Public capabilities / bundled registrations | 13 / 3 |
| Lifecycle / domain / record-phase callbacks | 6 / 7 / 12 |
| Migrations / named bootstrap work | 8 / 15 |
| Maintenance / hook tooling commands | 9 / 13 |
| R13 configuration consumer checks | 10 |

No new class-A P1/P2 or P3 was verified in this scope. **339 focused tests and 64
actual-method/CLI probes passed**, including handler/callback rejection and usage
errors. This is finite built-in/contract-family coverage, not execution of arbitrary
institution hooks. Named dispatch, offline declarations, awaited activation/drain,
explicit maintenance configuration and hook conversions are cited intentional
changes. The real-service, persisted-hook and packed maintenance gates below
qualify the completed tree separately.

## R13 correctness, P3 and inherited backlog

[All 18 R13 corrections were rechecked](final-review-r14/r13-correctness.json).
No R13 fix is wrong or reverted. R13-13 correctly restored browser body.userid.
The REST query-first sibling existed both before and after `afaf6ef01`, including
the original adapter `7f49cbe79`; R14-06 repairs that missed feature regression.
The new controls cover simultaneous path/body/query identities, missing selected
IDs and self-service actor selection. R13's bodyless browser vocabulary sync fix
also remains correct; empty versionId was another missed legacy value. R13's
native-index acceptance fix remains correct; the older consumer omission is B-08.

**Ten P3 groups remain recorded, unfixed.** Six record/query groups cover effective
cache directives, browser report-config error status/envelope, redirect directives,
added graph meta/ETag, omitted redundant named-query errors[].status and added
administration audit. Four identity/integration groups cover DELETE/list cache
headers, index-success wording, omitted custom chronicle markers and residual
safe failure status/envelope/text differences. These source-only differences are
not silently labelled intentional; no realistic lost work, wrong successful
result or access-control failure was demonstrated. They are not claimed as
HTTP-qualified parity. Exact route lists and provenance are retained in the
summary and scope ledgers. The existing lint control-regex advisory is separate.

Two inherited P2 items were appended to
[inherited-defects-backlog.md](inherited-defects-backlog.md): **B-08**, native index
TTL/hidden options dropped by both descriptor builders; **B-09**, brand omitted
from both vocabulary administration list predicates. Actual extracted methods
reproduce both versions. Neither is a severe access-control problem reachable by
an ordinary signed-in user: vocabulary administration requires brand Admin.
B-01–B-07 remain unchanged. SR-005/045/049/055 remain unchecked solely because
no representative institution is designated.

Areas judged clean of additional P1/P2 include authentication/session and selected
brand membership; record/form/workflow and permission targets; query/report
arguments after the preview correction; protected file/asset/template delivery;
progress ownership, socket grants and upload authorization; finite queue/job
bindings; extension callback contexts/awaiting; and maintenance arguments,
completion/error output and exit codes. This is the bounded source/probe coverage
in the ledgers, with the recorded P3 differences retained.

## Final-tree qualification

Every gate passed with runtime/test inputs frozen at
`c31ac286281dfa3bf8efa1bc2b122cdc430cf07b`, on Node **26.11.1** and npm
**11.20.0**. The two commits after runtime revision `fb08b5447` correct only
regression-fixture typing. The full suite reran those tests after both corrections.
The [qualification manifest](final-review-r14/qualification.json) records actual
suite results, input audits, toolchain/images, cleanup and **283 durable artifact
hashes**. Logs remain on disk under `.tmp/sails-retirement/final-review-r14/`.

| Gate | Accepted result |
| --- | --- |
| Core default | **5,631 passed**, seven existing pending; includes all 74 new checks. |
| Core real-service | **224 passed**, zero pending; natural process exit without instrumentation or forced exit. |
| Companion lifecycle / Mongo uploads | **2 / 6 passed**. |
| Root integration | **422 passed**, ten existing pending. |
| Storage / dev-tools / PDF unit | **306 / 53 / 79 passed**. |
| Full Playwright / harness | **124 / 19 passed**, zero failures or skips. |
| Dedicated retirement browser | **4 passed**: visible Angular save/edit, multipart/tus/Companion/progress, real Keycloak and mounted pages. |
| Production host / generated institution | **1 / 1 passed**; authenticated APIs, root context, pages/assets, readiness, restart and stop. |
| Persisted compiled hooks | **5 passed**, zero skips. |
| Bruno general | **309 requests, 554 tests, three assertions passed**; 557 JUnit cases. |
| Bruno OIDC / S3 / PDF | **13 / 7 / 4 requests**, **17 / 12 / 10 tests passed**; no failures, errors or skips. |
| Packed standalone maintenance | **Ten commands across 102 scopes**, three Agenda scopes; online installation, offline npm ci, workflow/replacement and Mongo-bound commands. Pending/failures/pools zero; explicit backfill changes one entry, then zero. |
| Clean source build | Literal **npm ci --ignore-scripts --strict-peer-deps**, **compile:all** (backend, 22 Angular projects and Webpack), and **package:pages** all exit zero. Nine build advisories. |
| Backend/static gates | All five package builds, declared host/container typechecks, Prisma/schema checks and **17 closure-tooling controls passed**. |
| Lint / documentation | **937 files, zero lint errors**, one existing NUL-control-regex advisory. Documentation generates **43 surfaces**, reports 524 advisories; **four documentation tests passed**. |
| Pins / lock roots | **23 tracked manifests, 377 declarations, 20 allowed local references, six lock roots**; zero violations. No dependency changes. |
| Retirement closure | **1,129 committed source files / 6,226 compiled-tree files**, zero executable violations or forbidden dependencies. **1,261/1,261** baseline files reconciled; current inventory has 1,100 classified matches. |

The closing audits match **1,347 authored inputs byte for byte** in both the
runtime builder and the literal clean-source tree, with no differences. All
**48 changed root assets/views/TypeScript/entrypoints** match; raw and compiled
progress assets are identical. Both matcher consumers resolve the exact
`path-to-regexp@8.4.2` bytes in both environments. Existing native/toolchain images
were reused with current audited compiled overlays; no replacement immutable-image
or topology-matrix qualification is claimed.

[Rejected preliminary attempts](final-review-r14/rejected-attempts.json) remain
separate: a foreign-realm baseline-probe fixture, a root-versus-core matcher
overlay mistake, and two regression-fixture typecheck corrections. They supply
no accepted final gate. Post-run accounting also corrected an initial expectation
of 554 general JUnit cases to 554 tests plus three assertions, and normalized
full versus short Docker image IDs before comparing captures; the raw captures
and accounting notes are retained. No interrupted run or host reboot was accepted.
Both build and qualification retain boot ID
`3ba9700e-fa48-43eb-8996-88d76c6255b7`.

All seven main/compiler containers and all Compose profile containers are removed,
along with captured anonymous/round-labelled volumes, the profile network, all
three firewall rules and temporary hosts aliases. The restored isolated
dockerd/containerd and owned `/run` state are stopped/removed. No artifact/cache
relocation was used. No image was built and no new dangling image was created;
pre-existing image `9bf944d09e37` and durable engine data are preserved. Generated
Bruno environment/lock files match their original snapshots. Durable logs and
compiled scratch inputs remain on disk. The evidence commit changes no qualified
runtime or test input.

[Closing checks](final-review-r14/closing-checks.json) at evidence commit
`1f0ca4aec` pass again: 1,152 source files, zero closure/dependency violations,
1,261/1,261 baseline files reconciled and exact pins/lock roots. All 283 qualified
artifact hashes still match. Raw captured Mocha logs retain terminal whitespace
for byte/hash fidelity; the authored-file whitespace check excludes those four
logs and passes. The subsequent accounting commit adds only this report link and
the closing JSON; runtime/test inputs remain unchanged.
