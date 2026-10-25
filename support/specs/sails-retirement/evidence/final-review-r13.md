18 class-(A) P1/P2 issues found

# Sails retirement final review — round 13

Feature base `a49366803`, incoming HEAD `c8a5064d0`; final runtime/test input
`9cff20d5095387f7df418d4951240198ef47dbbc`, with qualification tooling
`6e022ccb9`. Work used the shared
`stack/sails-retirement` checkout in place. No worktree, branch switch, push,
publication or tag. Unrelated untracked GraphQL specifications were ignored.
R1–R12 evidence and the inherited backlog were read before the review. The
Code Review and ReDBox Testing skills were applied, including delegated
configuration/standards and HTTP/spec acceptance reviews.

## Verified class-A defects

All 18 incoming defects have concrete negative controls and regression coverage.
Locations below identify the corrected boundaries under `packages/redbox-core/`.

| ID | Severity | Boundary / user-visible failure | File:line | Fix commit(s) |
|---|---|---|---|---|
| R13-01 | P2 | Local credential transport/lookup | `src/http/express/login.ts:74` | `5f887304f` |
| R13-02 | P2 | Configured OIDC identifier acceptance | `src/http/express/login.ts:98` | `2f9634213` |
| R13-03 | P2 | API max_requests and production binding | `src/application/portal/http.ts:465` | `03b1d724e`, `2d7516aaa`, `afaf6ef01`, `f1da6196e` |
| R13-04 | P2 | Public additionalClientConfig acceptance | `src/configuration/portal.ts:204` | `03b1d724e` |
| R13-05 | P2 | Form prehydrate configuration/binding | `src/application/portal/http.ts:405` | `03b1d724e` |
| R13-06 | P2 | SVG byte limit acceptance | `src/configuration/portal.ts:156` | `03b1d724e` |
| R13-07 | P2 | Institution appmode feature flags | `src/configuration/portal.ts:220` | `03b1d724e` |
| R13-08 | P2 | Native storage index descriptors | `src/configuration/deployment.ts:23` | `03b1d724e` |
| R13-09 | P2 | Uppercase API methods | `src/configuration/portal.ts:109` | `03b1d724e` |
| R13-10 | P2 | Sparse email templates/native SMTP transport data and URL | `src/config/emailnotification.config.ts:32` | `03b1d724e`, `217c61339` |
| R13-11 | P2 | Native Mongo session stringify option | `src/configuration/deployment.ts:77` | `03b1d724e` |
| R13-12 | P2 | Workspace angularDev option | `src/configuration/portal.ts:203` | `03b1d724e` |
| R13-13 | P1 | Wrong-account browser administration writes | `src/http/express/identityAdministration.ts:168` | `afaf6ef01` |
| R13-14 | P2 | Optional translation list filters | `src/http/express/metadata.ts:253` | `afaf6ef01` |
| R13-15 | P2 | Vocabulary historical boolean coercion | `src/http/express/formVocabulary.ts:101` | `afaf6ef01` |
| R13-16 | P2 | Vocabulary notation splitting/deduplication | `src/http/express/formVocabulary.ts:117` | `afaf6ef01` |
| R13-17 | P2 | Bodyless browser vocabulary sync | `src/http/express/vocabularyIntegrations.ts:54` | `afaf6ef01` |
| R13-18 | P2 | Query OID selection for edit/form delivery | `src/http/express/pages.ts:168;src/http/express/formDelivery.ts:45` | `afaf6ef01` |

The P1 is a real wrong-account write: browser administration selected query.id
over the submitted body.userid and mutated another same-brand account. Four
HTTP cases now mutate two-account fixtures and preserve the unselected account;
twelve omitted-userid controls prevent fallback lookup or writes. It is
administrator-facing, feature-introduced code, so the class-B ordinary-user
exception is not involved.

API `max_requests` applies only to REST lists/deleted lists. Browser lists and
search retain the separate incoming `record.search.maxRecordsPerPage` policy.
The first supporting API-limit change accidentally shared the cap with browser
lists; `f1da6196e` corrects that before qualification. Four actual baseline browser
method probes and fifteen HTTP cases establish the separation (previous native
code: ten pass/five expected failures). This supporting correction does not add
another incoming defect. Sparse email objects and SMTP URL strings likewise
belong to the same native email boundary, not separate inflated findings.

Detailed reproductions and focused commands are retained in
[configuration-review.md](final-review-r13/configuration-review.md) and
[http-acceptance.md](final-review-r13/http-acceptance.md). Parent-owned local/OIDC
input probes execute actual baseline methods with pinned Passport; SMTP executes
the actual baseline EmailService with pinned Nodemailer and no network.

## Configuration acceptance

| Inventory / acceptance | Count and conclusion |
|---|---|
| Source files | 3,511 scanned; 978 excluded with explicit dispositions |
| Configuration paths / provenance sites | 5,796 / 11,152 |
| Path dispositions | 4,134 retained; 870 migrated; 668 inactive; 80 retired; 36 runtime state; 8 excluded fixtures |
| Literal fixtures | 474: 195 retained; 162 migrated; 100 excluded; 12 retired; 5 inactive |
| Symbolic expressions / environment reads | 253 / 295, all assigned provenance, owner and disposition |
| Current scalar/container/shared/function shape rows | 4,054, mapped to both compatibility documents |
| Retained runtime fixtures | All 195 pass actual loader/AJV |
| Typed fixture outcomes | 186 direct; nine preserve ten exact inherited diagnostics in five categories |
| Focused configuration gate | 219 pass: 13 consumer cases + 195 fixtures + ten rejection controls + completeness |
| Incoming native negative control | 12 expected failures / one OIDC control pass |

The source-derived [inventory](final-review-r13/configuration-inventory.json) and
[acceptance ledger](final-review-r13/configuration-acceptance.json) retain all
classifications, fixture values and diagnostics. The permanent table consumes
retained artifacts; generation/baseline probes are separate Git-dependent work.
Intentional plain-data/scalar rejections and migrated/retired inputs map to
[configuration-v6.md](../configuration-v6.md#baseline-input-dispositions) and
[V6-Client-Compatibility.md](../../../wiki/V6-Client-Compatibility.md#configuration-input-dispositions).
The reachable legacy RAiD fallback is explicitly converted to branded
raidPublishing; it was not dismissed as unreachable. Actual native consumer
checks cover public extras precedence/secret exclusion, API limits, prehydrate,
SVG, feature flags, storage descriptors, method casing, email, session stringify
and workspace bundle selection.

## HTTP input acceptance

| Inventory / acceptance | Count and conclusion |
|---|---|
| Native declarations / API subset | 335 / 152 |
| Original route-config patterns | All 331 mapped; zero unresolved |
| Baseline controller actions | 332 resolved; three explicit HEAD/CSRF/root rows |
| Schema fields | 554, with source, requiredness, type and precedence |
| Baseline/current extraction/validation cells | 5,945; zero unexplained differences |
| Current-only alias snapshots | 1,200; clearly distinguished from differential proof |
| Supplemental mount/protocol rows | Ten |
| Bundled extension registrations | Three; zero own route declarations |
| Permanent inventory gate | 336 pass, also with Git stub exiting 128 and no skip |
| New native HTTP regressions / related page/form controls | 59 / 66; combined with inventory: 461 pass |
| Native incoming negative control | 26 pass / 33 expected failures (21 legitimate inputs + 12 missing-userid safeguards) |
| Actual baseline HTTP-owner probes | 30 execution checks + one editor source assertion |
| Parent auth / baseline probes | 118 auth matrix cases; ten actual local and six OIDC selector probes |
| Supporting list bounds | Fifteen HTTP controls + four actual baseline browser action probes |

The [machine table](final-review-r13/http-acceptance.json),
[335-route readable table](final-review-r13/http-acceptance-routes.md) and
[source input ledger](final-review-r13/http-acceptance-inputs.txt) separate manual
source comparisons, schema extraction cells, current-only snapshots and executed
native HTTP. No claim is made that schema cells prove all handler semantics.
Declared read path/query transports and write bodies/aliases remain supported;
arbitrary GET bodies, malformed scalar structures, unsafe/invalid pagination,
generic evaluated actions and virtual socket HTTP have explicit compatibility
scopes/retirements in the wiki. Real supported rejections were fixed rather than
relabelled intentional breaks.

## R12 correctness, general review and backlog

All five R12 fixes remain correct: local/AAF login clears previous OIDC logout
state; provider schemas retain URL/object/array/sparse supported forms; rejected
AAF callbacks retain the selected brand; query-only translation toggles retain
body/query precedence; missing provider logout endpoints clear previous state.
No R12 fix was wrong or reverted. The expanded authentication matrix has 118
cases; the nine R12 toggle controls pass both current and pinned R12 handlers.

The fresh general pass covered host startup/drain/failure cleanup, extension
ownership/dependencies, configuration precedence/redaction, authentication and
membership, route/assets/form/record/attachment access, persisted queues,
progress authorization/reconnect races, standalone maintenance and production
bindings. No additional concrete A/P1/P2 was verified outside the 18 acceptance
boundaries. This is bounded review and qualification, not proof of every possible
input combination.

No new class-A P3 product issue. Lint retains one advisory at
`src/http/express/login.ts:101` for deliberately matching NUL while rejecting
malformed OIDC identifiers; zero lint errors. One inherited grouped **B-07/P3** was appended to
[inherited-defects-backlog.md](inherited-defects-backlog.md): five pre-feature
configuration declaration omissions (AAF loginUrl, OIDC claimMappingOptions,
Solr jsonString, i18n defaultNS and reusable placeholders). All runtime fixtures
pass; exact pre-feature/current declarations and compiler diagnostics establish
inheritance. B-01–B-06 remain unchanged. No severe inherited ordinary-user
access-control exception was invoked. SR-005/045/049/055 remain unchecked solely
because no representative institution is designated.

## Final-tree qualification

Every full qualification gate passed with unchanged application/core-test input
`9cff20d5095387f7df418d4951240198ef47dbbc` and final qualification tooling
`6e022ccb9bbc3933880bbba6891db1ee5da7b7fa`.

| Gate | Accepted result |
|---|---|
| Clean install / full compilation / pages | Literal pinned `npm ci --ignore-scripts --strict-peer-deps`, complete backend / 22 Angular apps / Webpack, and page packaging passed. Nine advisory Webpack warnings. |
| Builds / types / generated configuration | Five package builds; six container and six host core typechecks; root typecheck; Prisma and portal-schema checks passed. |
| Core default | **5,557 passed**, seven existing pending. |
| Core real-service | **224 passed**, then natural process exit, without instrumentation or forced exit. |
| Root integration | **422 passed**, ten existing pending; resources, operations, Prisma clients and pools close at zero. |
| Storage / dev-tools / PDF unit | **306 / 53 / 79 passed**. |
| Full Playwright / harness | **124 passed in 7.2 minutes**, one worker, no retries; **19 harness checks passed**. |
| Dedicated retirement browser | **Four passed in 16.9 seconds**, including real Keycloak, progress reconnect/delivery, actual multipart/tus/Companion bytes, PDF durability and stop retry. Closing pools, Prisma clients and upgrade listeners zero. |
| Production / generated institution | **1 / 1 passed**, including persisted work, restart and drain. |
| Persisted extension qualifiers / Companion | **Five**, plus **2 lifecycle / 6 upload tests**, passed. |
| General Bruno | **309/309 requests, 554/554 tests, 3/3 assertions**. |
| OIDC / S3 / PDF Bruno | **13 requests / 17 tests; 7 / 12; 4 / 10**, all passed. |
| Packed standalone maintenance | **Ten commands across 102 scopes**, three Agenda scopes; online install, offline npm ci, workflow/replacement and Mongo-bound commands. Pending/failures/pools zero; explicit backfill changes one entry, then zero. |
| Lint / documentation | 937 source files; zero lint errors, one intentional-control-regex advisory. API reference/generation/audit and **four documentation tests** passed; 43 published surfaces, 524 existing advisory findings. |
| Retirement closure | **17 tooling controls passed**; **1,127 source / 6,194 installed-tree files** checked; zero executable/dependency violations. **1,261/1,261** baseline files reconciled. |
| Exact pins / locks | **23 manifests, 377 declarations, 20 allowed local references, six lock roots**; zero violations. No dependency changes. |

All accepted JUnit results have zero failures, errors or skips. Mocha's existing
pending cases are reported separately above. Closing builder and clean-source
audits match **1,360 selected authored runtime/test/configuration inputs**; all
**48 changed root assets/views/TypeScript/entrypoints** match. Raw/compiled
progress helper bytes remain identical. Both runtime matcher consumers and the
literal clean installation use the verified pinned `path-to-regexp@8.4.2` bytes.
Toolchain: Node **26.11.1**, npm **11.20.0**, MongoDB **9.0.4**.

The clean compilation ran at `9cff20d50`. Its only later changes are the
retirement auditor and its own tooling tests; all application and core-test
inputs are byte-identical. The retained `clean-build-tooling-only-proof.json`
records the exact two-file diff. Both source audits were rerun after those files
were copied into the clean tree. The final full driver reran all builds,
typechecks, static and test gates at `6e022ccb9`. No host restart occurred: clean
build, qualification and closing boot ID is
`3ba9700e-fa48-43eb-8996-88d76c6255b7`.

Rejected qualification prefixes are explicitly retained: the first closure audit
misclassified 35 retained configuration operation-name strings as executable
legacy paths. Its narrow correction classifies only data strings in the exact
typed fixture; executable identifiers remain rejected. One newly added negative
control initially used a marker outside the auditor's prefilter, so it did not
exercise the intended branch. That assertion failed; the shell continued into a
commit, and the initial success report was corrected. The control now uses an
unrelated legacy configuration path that enters the filter. Both stopped prefixes
supply no accepted final gate. Final tooling controls pass 17/17, including the
new data/identifier/unrelated-path controls. No product defect was inferred from
these harness failures.

Other rejected/expected probes remain distinct from passing qualification:
incoming module negative controls reproduce the fixed inputs; the early auth
fixture omitted a real URL-encoded body and was corrected; a matcher preflight
ran before clean npm installation and correctly lacked the dependency. The
supporting browser cap correction happened before broad qualification. None of
these rejected attempts supplies a final gate. No interrupted run or host-reboot
prefix was accepted.

Existing native/toolchain images were reused with audited current compiled
overlays. No replacement immutable-image or topology-matrix qualification is
claimed. Scratch Keycloak imports include the dedicated browser callback; this
provider fixture adjustment changes no repository runtime/test input.

## Cleanup and committed evidence

All seven main/compiler containers and all Compose profile containers are removed,
as are every captured anonymous/round-labelled volume, the owned profile network,
all three firewall rules, temporary hosts aliases, and local compiled/browser
library overlays. The restored isolated dockerd/containerd and owned `/run` state
were stopped/removed. No artifact/cache relocation was used. No image was built
and no new dangling image was created; pre-existing image `9bf944d09e37` is
preserved. Bruno-generated tracked files were restored byte-for-byte. Unrelated
GraphQL files remain untouched.

[qualification.json](final-review-r13/qualification.json) records exact stages,
results, input revisions/audits, rejected-prefix dispositions, artifact/probe
hashes and cleanup checks. Durable raw logs and drivers remain under
`.tmp/sails-retirement/final-review-r13/`; baseline probes and both acceptance
tables are committed beside the manifest. This review evidence commit changes no
runtime, schema or test input from the qualified tree. Its own SHA is the final
HEAD reported to the parent/user.
