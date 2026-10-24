# Final Sails retirement review — round 4

Reviewed feature base `a49366803164429f9d8bdd249dadcdf856c9d13e` through initial HEAD
`62ac54cb8fd703d142c806abc361bb546fb0cfb1` in the shared `stack/sails-retirement`
checkout. Read AGENTS.md, R1/R2/R3 evidence first, the eight requested specification
documents and the relevant tracked architecture, services, core, loader,
configuration, coding, testing, installation, development and compatibility wiki
pages. Applied the code-review and Redbox Testing skills. No branch switch,
worktree, push, publication or tag was made. The unrelated GraphQL specification
was untouched.

## Verified issues and corrections

**Seven verified issues fixed: three P1 and four P2.** Locations refer to the corrected
boundary; `src/` and `test/` below are relative to `packages/redbox-core/`.

| ID | Severity | Location | Verified defect and correction | Origin | Fix commit |
|---|---|---|---|---|---|
| R4-01 | P2 | `src/queues/AgendaQueue.ts:508` | Successful job definition logged the complete configured job, including arbitrary schedule payload credentials. Log only its name; retain scheduling and definition behavior. | Pre-existing Sails/v5 diagnostic defect; released `v5.0.4` `services/AgendaQueueService.ts:223` has the same serialization. | `952363125` |
| R4-02 | P2 | `test/queues/QueueMongo.test.ts:424` | R3 deliberately expired a 25 ms queue deadline, then required a real Mongo cleanup retry to finish within the same 25 ms. Keep the deliberate expiry, allow 5 seconds for retry, and retain the durable completion assertion. | Regression introduced by R3's test, not a demonstrated runtime failure. | `cfa78efbe` |
| R4-03 | P1 | `src/extensions/composition.ts:127`, `src/application/portal/application.ts:461` | Raw registered route/middleware handlers lost returned-Promise ownership at response finish. Both paths now use the existing HTTP lifetime wrapper. Stop fails its deadline while work is blocked; completion writes remain admitted, then retry closes cleanly. | Retirement regression: new extension-host integration omitted returned-work retention. | `e5f56b91a` |
| R4-04 | P2 | `src/storage/StandardDatastream.ts:386` | R3-01 could reject an authorized reader whose earlier absence probe resolved after another reader promoted bytes and consumed tus sidecars. On failed staging authorization, independently recheck durable primary bytes. Never join staging work through this fallback. | Regression introduced by R3-01; the pre-R3 implementation succeeds at the reproduced interleaving. | `7d53a0d93` |
| R4-05 | P2 | `app.express.cjs:64`, `src/queues/indexes.ts:8` | Executable index maintenance unconditionally selected Agenda Mongo even for exclusively SQS jobs. Share effective backend selection with the standalone runner, including omitted options/default Mongo. | Retirement regression in the new executable maintenance path. | `fcee4383e`, `3c3d7e19f` |
| R4-06 | P1 | `src/records/RecordTriggers.ts:508`, `src/queues/migrateRecordHooks.ts:11` | Queued hooks resolved only their parent; an email sent before an unsupported success callback rejected. Recursively validate before direct dispatch/delivery and before selected Mongo migration rewrites any rows. | Pre-existing queued ordering defect; released `v5.0.4` `services/RDMPService.ts:469` invokes the parent directly, and `EmailService.ts:324` resolves callbacks after sending. R1 fixed the ordinary-record sibling but missed this entrance. | `5c43fdca7` |
| R4-07 | P1 | `src/http/express/identityAdministration.ts:223`, `src/identity/Users.ts:1328` | A delayed brand-A role edit replayed foreign memberships from its earlier target snapshot: it restored a concurrently revoked brand-B privilege or deleted a newly granted B role. Pass the requested brand into role updates and write only its membership edges; validate selected IDs against that brand. Preserve existing unscoped internal calls. | Pre-existing released-v5 API defect: base `controllers/webservice/UserManagementController.ts:421` and released `v5.0.4` `:428` merge an earlier target snapshot into global replacement. The new browser adapter `7f49cbe79` copied the same pattern; base browser `AdminController.ts:477` already replaced all roles with current-brand IDs. R3's shared-account restriction did not introduce it. | `f642ddaf8` |

Every fix commit ends with the requested GPT-6.1-sol co-author trailer. No
dependency was added or loosened. Compatibility updates include `155614b73` and
`f642ddaf8`; [V6 client compatibility](../../../wiki/V6-Client-Compatibility.md)
records the observable intentional changes, including the diagnostic clarification
in the closing documentation commit.
Test-only follow-up `268e47f1c` reconciles two existing HTTP/background privacy
cases with R4-06's deliberate invalid-binding rejection. All 22 logging cases
pass; substituting the pre-fix dispatcher produces two missing-rejection failures.
The R4-07 real-Mongo HTTP probe restores a revoked foreign privilege on the
reviewed implementation. Both corrected concurrency cases fail against the
pre-fix HTTP/Users sources, while the full identity-administration file passes
20 tests. Its first new-user fixture omitted required profile fields and is
rejected as a fixture failure; the complete corrected fixture is the valid control.
The initial browser-only comparison overstated R4-07's newness; the old API
counterpart establishes its final inherited classification.

New regression evidence is under ignored `.tmp/sails-retirement/final-review-r4/`:
job logging red/green (full queue service: 60 passing); extension current 7
passing versus four assertion failures with both original mount implementations;
storage race current full suite 67 passing versus the corrected race test failing
with only pre-fix StandardDatastream substituted; queued direct/migration current
passing versus four missing-rejection failures with pre-fix implementations;
executable maintenance initially four SQS assertion failures versus all ten
inspect/ensure/default/override cases passing. An initial storage test fixture
incorrectly hid the tus info file even from the fast reader; its first red result
is rejected. The corrected current/old-source pair is the valid control.

## Critical review of R3

**R3-01's authorized-read behavior and R3-07's regression-test retry timing were
wrong in the specific ways above; both are corrected.** No other R3 runtime fix
was found incorrect. No R3 isolation guard was removed to make a test pass.

Used an in-memory require hook to replace only the relevant implementation with
source from each fix's parent. Shared tracked sources and compiled outputs were
not swapped. The PDF test loads compiled code, so its final control substitutes
the compiled `PDF.js` module rather than an unused source path. The independent
Spec reviewer additionally ran all 15 selected storage negative cases and a real
Mongo destructive-cleanup case against their fix parents. See its
[original report](final-review-r4/spec-review.md) and the
[accepted sensitivity results](final-review-r4/regression-sensitivity.json).

| R3 fix | Current selected tests | Without that fix | Assessment |
|---|---:|---:|---|
| 01 lazy staging authorization | 6 pass | 6 fail | Each caller authorizes before joining; authorized read race corrected separately. |
| 02 completed tus adoption | 3 pass | 3 fail | Incomplete/deferred/overrun inputs retain bytes. |
| 03 Standard cleanup / journal / Mongo cleanup | 4 + 1 + 1 pass | 4 + 1 + 1 fail | Trusted ownership at destructive boundaries; old unowned journals retained. |
| 04 nested journal error logging | 2 pass | 1 pass, 1 fail | Adjacent successful control remains green; secret-bearing error assertion fails. |
| 05 PDF configured URL logging | 3 pass | 2 pass, 1 fail | Actual compiled-module mutation reaches the credential assertion. |
| 06 wrapped opaque hook lifetime | 1 pass | 1 fail | No concurrent timeout retry; original inner work remains owned. |
| 07 queue completion after deadline | 2 pass | 1 pass, 1 fail | Host-only deadline is a positive control; queue's own deadline exposes revoked admission. |
| 08 worker hook / terminal and grace audits | 3 pass | 3 fail | Independent admitted lifetimes survive their caller. |
| 09 notification completion scope | 4 pass | 1 pass, 3 fail | Synchronous throw is a positive control; Promise/Observable/Effect completion fails without scope. |
| 10 configured imports | 3 pass | 3 fail | Timeout and early-row return retain the original import. |
| 11 OCFL Node/Web cleanup | 6 pass | 2 pass, 4 fail | Normal close controls pass; abort/destroy must join upload cleanup. |
| 12 shared global account mutations | 1 pass | 1 fail | Every admin/API sibling denied; scoped role and owner-self paths remain covered. |
| 13 shared primary account linking | 1 pass | 1 fail | Alias cannot inherit another brand's global authority. |
| 14 documentation | Static review | No executable test | Correct backend path; no runtime mutation claim. |

Positive controls are deliberately distinguished from regression assertions; it
would be false to say every selected test fails on every mutation. Preliminary
PDF runs without rebuilt dev-tools, Mongo runs with incorrect required database
basenames, the PDF unused-source override and the original 25 ms retry run are
rejected as sensitivity proof. Their logs are retained alongside the corrected
controls.

Concurrency review checked stop/retry, dependency closure, admission revocation,
first-value Observable semantics, opaque Promise lifetime, audit-timer ordering,
worker/notification completion, import timeouts and OCFL Node/Web abort. There is
no claim to cancel arbitrary hidden I/O. Waiting for actual work can exceed a
stop deadline; the application must report failure and retain dependencies until
work settles. R3 uses existing instance-owned scopes/sets, not a second global
task framework. No additional deadlock, double execution or lost accepted work
was reproduced.

Identity review checked every R3 mutation alias, target-role representations,
owner-self paths and scoped role merging. Brand Admin remains a per-brand role;
there is no designed installation-wide account-takeover override. An Admin can
still change the requested brand's roles on a shared user while preserving other
memberships. Linking a local alias into a globally privileged primary has no
safe brand-local interpretation with the current global identity model; the
restriction is intentional and now explicitly documented.

## Provenance of every prior P1

The requested base `a49366803` is the **pre-retirement Sails-host development
stack**, already containing Prisma and other unreleased work. It is not the
released `v5.0.4` tree. The classification below answers whether this retirement
diff introduced the defect; the last column separately limits claims about the
release. These are source comparisons, not a claim to have rerun every historical
release exploit or full suite.

| Prior P1 | Classification relative to retirement | Evidence and released-v5 distinction |
|---|---|---|
| R1-02 shared-user audit disclosure | Pre-existing | Base `services/UsersService.ts:652` lacks requested-brand filtering; released `v5.0.4` `:609` has the same unscoped audit query/merge. |
| R1-04 repeated canonical roots | Retirement regression | New validated canonical `server.publicUrl` includes the root; new portal composition appended the root again. Legacy origin-style configuration did not establish that new invariant. |
| R1-05 unconverted nested notification callbacks | Retirement regression | Released/base email supported legacy service expressions. New strict named dispatch omitted conversion of supported nested declarations. The separate late-validation ordering defect predates retirement. |
| R1-06 detached Promise escapes drain | Pre-existing | Base Records supervisor/handler at `services/RecordsService.ts:507,3759` interrupted fibers without joining opaque work. Released `v5.0.4` `:1996` detaches post hooks without shutdown ownership. The explicit v6 drain contract makes the defect measurable. |
| R1-15 native Companion credential logs | Pre-existing | Base core uses Companion 7.1.1 and passes native failures to its raw logger. Released `v5.0.4` root pins 6.2.2: its `lib/server/logger.js` inspects errors and `helpers/upload.js:29` forwards uploader failures; per-request credentials are not selected static maskables. The downloaded exact-version source archive SHA-256 is recorded below; no released native failure/container qualification is invented. |
| R2-05 foreign-brand workflow role names | Pre-existing | Base Records `:2220` checks names across global roles; released `v5.0.4` workflow/controller paths also derive names from the global role snapshot. |
| R2-06 detached Observable/Effect/audit admission | Pre-existing in Sails-host base | Base `services/RecordsService.ts:2930` detaches the audit Promise and grace timer; its hook supervisor lacks actual-result ownership. Released v5 already detaches hooks, but the Effect/admission implementation is development-stack work, not a released-v5 claim. |
| R2-07 staged-byte metadata adoption | Pre-existing | Base StandardDatastream `:715` promotes client-selected staging without authority. Released `v5.0.4` `services/StandardDatastreamService.ts:700` has the same unrestricted promotion. |
| R3-01 lazy staging recovery | Pre-existing | Base StandardDatastream `:359` and released `v5.0.4` `:352` coalesce/promote without per-caller ownership. R4-04 separately corrects R3's new authorized-read race. |
| R3-03 cancelled staging deletion | Pre-existing in Sails-host base | Base Records `:3189,6174` journals/deletes without actor/brand; StandardDatastream `:912` deletes by file ID. The journal is already in the Prisma-integrated base and is absent from released v5.0.4. |
| R3-06 wrapped hooks and overlapping timeout retry | Pre-existing in Sails-host base | Base `action-execution/legacy-result.ts:69` treats all Observable/Effect results as cooperative, including hidden Promises. This action executor is absent from released v5.0.4. |
| R3-07 expired queue completion admission | Pre-existing in Sails-host base | Base `services/AgendaQueueService.ts:149` revokes completion on its deadline while accepted handlers remain active. This fencing implementation is development-stack work, not a released-v5 claim. |
| R3-08 worker hook/audit completion scopes | Pre-existing in Sails-host base | Base Records hook supervision and `:2930` audit timer inherit/detach caller work rather than owning completion. Released v5 detaches hooks; the scoped admission manifestation belongs to the base development stack. |
| R3-09 email followup completion scope | Pre-existing | Base `services/EmailService.ts:314` and released `v5.0.4` `:324` detach success callbacks. V6 retains their complete result and late completion authority. |
| R3-10 timed-out configured imports | Pre-existing | Base vocabulary timeout paths and released `v5.0.4` FigshareVocabulary `:2408` / Vocabulary `:1156` abandon the original import wait without a drain owner. |
| R3-11 OCFL abort cleanup | Pre-existing in Sails-host base | Base `services/oni-v2/flydriveOcflStore.ts:226` calls destroy completion before `putStream` settles. This store is absent from released v5.0.4. |
| R3-12 shared-account global mutation | Pre-existing | Base webservice UserManagement `:483` and released `v5.0.4` `:490` set a shared user's global credential after only current-brand membership checks; password/profile/status siblings are global too. |
| R3-13 shared-primary account linking | Pre-existing | Base Users `:2189` and released v5 linking validate foreign memberships only on the secondary. Alias authentication adopts the primary's global permissions. |

Thus **2/18 prior P1s are retirement regressions; 16/18 predate the retirement
diff**, including unreleased development-stack defects distinguished above.
Round 4 adds one retirement P1 and two pre-existing P1s (queued ordering and role
membership concurrency). Counts of severities
against the v6 contract were previously reported without this causal distinction.
The rise 5 → 3 → 10 reflects a wider search into inherited sibling paths and
asynchronous container/lifetime combinations, not evidence that all ten R3 P1s
were introduced by R1/R2. R3's concrete newly introduced faults found here are P2.

The released Companion 6.2.2 archive was read from the npm registry without
installation or lock changes. SHA-256:
`1604354e76057fd543b087e6329953d0de1703771dbab0ca840ad343fa118277`.

## Independent axes and additional audit

**Standards:** the delegated reviewer failed with the provider message “This
content was flagged for possible cybersecurity risk.” No independent Standards
completion is claimed. The owning reviewer completed standards, identity and
remaining-surface review directly: exact pins, selected instance ownership,
explicit inputs, async/await/error handling, finite conversions, residual Sails,
tracked docs and complexity. No further verified standards issue was left open.

**Spec:** the completed independent reviewer found two P1 and three P2, retained
in its [original report](final-review-r4/spec-review.md). All five were verified
and fixed above. Its report remains a review of the initial snapshot, not a
claim about the final qualification tree.

Additional areas reviewed and judged clean after the listed fixes:

- Agenda's concrete configured handlers and argument provenance: no HTTP
  arbitrary-fnName submission entrance. Durable queue state and configured hook
  operations are trusted deployment inputs, not fresh actor credentials.
  Installation-wide SIEM retry/typeface/history maintenance is intentional.
- Both maintenance entrypoints, backend selection, explicit preflight/ensure,
  no business bootstrap for selection, and connection/cleanup ownership.
- Extension selection, replacement and factory bindings; registered routes and
  both middleware stages; named policies and brand-scoped domain actor context.
  Extensions are trusted code, not a sandbox; deliberately public handlers are
  not automatically authorization defects. Returned work is now host-owned.
- Socket.IO grants are single-use, short-lived and brand-bound. Handshake,
  subscription and every emit reauthenticate and authorize persisted record/task
  relationships. No client-provided global room membership is used.
- Login uses Passport's session regeneration; old v5 sessions are rejected before
  deserialize; logout uses callback completion, destroys the new session and
  clears the configured cookie. Administrative linking does not log the caller
  into another identity. Existing real-Mongo rotation/logout/alias tests cover
  cookie and credential behavior; the browser suites exercise provider callbacks.
- Rules snapshots filter the stored brand; AppConfig caches use brand names/IDs;
  i18next instances/bundles use brand IDs; forms query brand/name. CSS/font caches
  include brand/content identity, while immutable default content and compiled
  template/schema artifacts are safely shared by their content keys.
- Solr fuzzy queries use separate immutable brand/type/workflow and ACL filters;
  reports append brand `fq`; named queries pass a mandatory tenant to execution.
  Public endpoints do not expose the low-level unrestricted search port.
- Export reads verify stored brand/view ACL, stop paging after abort and retain
  backend work. Report definitions/results, harvest history/events/checkpoints,
  and token endpoints retain brand/actor checks. Shared-account global mutation
  denial does not remove brand-scoped role administration or owner-self routes.
- Express readiness/error/CSRF/session/header composition, dependency and import
  closure, finite legacy conversion, generated entrypoints and tracked wiki
  claims. No broad refactor or new dependency was needed to repair the findings.

## Final-tree qualification

**All final gates pass, with zero final failures.** Runtime, configuration and test
inputs are `f642ddaf884755f42b50d2c535d35accfc0c0ab5`. Closing changes are
documentation/evidence only. Qualification uses current mounted source/tests and
all five rebuilt compiled packages on the isolated existing Docker daemon. It
does not replace P8's historical immutable images, repeat an unrequested topology
matrix, or designate an institution. [Machine-readable counts and 82 log/driver
SHA-256 hashes](final-review-r4/qualification.json) record the exact inputs.

| Gate | Final result | Evidence under `.tmp/sails-retirement/final-review-r4/` |
|---|---|---|
| Full ordinary core Mocha | 4596 passing, 7 unchanged pending | `core-default-final.log` |
| Full separately collected real-service core | 212 passing; natural process exit | `core-real-final.log` |
| Isolated Companion lifecycle/uploads | 2 + 6 passing | `CompanionLifecycleProbe-final.log`, `CompanionUploadsMongo-final.log` |
| Full root Mocha | 422 passing, 10 unchanged pending; resources/operations/clients/pools zero after stop | `root-final.log` |
| Full storage Mongo Mocha | 306 passing | `storage-final-clean.log` |
| Full dev-tools Mocha | 52 passing | `dev-tools-final-clean.log` |
| Full PDF unit Mocha | 79 passing | `pdf-unit-final.log` |
| Full Playwright and harness | 124/124 browser cases, no skips; harness 19/19 | `playwright-full-final.xml`, `playwright-harness-final.log` |
| Dedicated retirement browser | 4/4, no skips; real Keycloak/tus/Companion/PDF, durable completion and stop retry; pools/clients/upgrade listeners zero | `retirement-browser-final.xml`, `retirement-browser-final.log` |
| General Bruno | 309/309 requests, 554/554 tests, 3/3 assertions | `bruno-general-final.xml`, `bruno-general-final.log` |
| Dedicated OIDC Bruno | 13/13 requests, 17/17 tests | `bruno-oidc-final.xml` |
| Dedicated S3 Bruno | 7/7 requests, 12/12 tests; fresh XML/executed counts verified | `bruno-s3-final.xml` |
| Native PDF integration | 4/4 requests, 10/10 tests; fresh XML/executed counts verified | `pdf-final.xml` |
| Production host/generated application | 1 + 1 passing; generated fixture is not the undesignated institution | `production-host-final.log`, `generated-institution-final.log` |
| Compiled persisted-hook qualification | 5/5 | `hook-qualification-final.log` |
| Builds/typechecks/generated contracts | Five packages compile; six exact host core configurations and root pass; Prisma contracts and portal schema verified | `build-final.log`, `typecheck-*-exact-final.log`, `prisma-check.log`, `portal-config-check.log` |
| Lint/import boundaries | 936 files, zero warnings/errors | `lint-final.log` |
| API docs/generation/audit/tests | Generation/audit pass; 43 published surfaces, 524 unchanged advisories, 4/4 tests | `doc-api-final.log`, `docs-*-final.log` |
| Exact dependencies/locks | 23 manifests, 376 declarations, 20 permitted local references, zero violations; six feature-changed lock roots consistent | `dependency-pins.json`, `lockfile-consistency.json` |
| Retirement tooling regression | 8/8 | `closure-tests-final.log` |
| Installed compiled-tree closure | 6128 files; zero executable violations/forbidden dependencies | `compiled-tree-closure-final.json` |
| Committed runtime/test source closure and inventory (`f642ddaf8`) | 1070 closure files, 1041 inventory matches; zero violations/forbidden dependencies/unclassified; 1261/1261 baseline entries reconciled | `source-closure-qualified.json`, `source-inventory-qualified.json`, `reconciliation-qualified.json` |

Pending cases are not counted as passing coverage. Fresh browser/API XML contains
no skips. Site counts and suite totals overlap and are not added into a synthetic
coverage figure. The full driver is `run-last-qualification.sh`; PDF unit ran
separately once on the final code while the real-service process's finite timers
expired. `run-post-qualification.sh` runs the dedicated browser and compiled hook
qualifiers. Exact compiler/closure and Node 26 documentation gates completed
before the final serialized ordinary-core run.

Reused the exact-pinned historical P8 test/rehearsal images with current source,
the final executable and all five rebuilt compiled-package overlays. Node is
26.11.1; the daemon is `unix:///run/sr-p7-isolated/docker.sock`. Prepared the
disposable Keycloak realm with the exact browser callback and copied Chromium
and its twelve native libraries from existing local artifacts into the builder;
the version control and final actual-rendering browser tests pass. Preparation
logs include `oidc-fixture-prepare.log` and `browser-library-control.log`.

The first full core run is rejected as final evidence: 4594 passing, 7 unchanged
pending and two old privacy cases expecting invalid queued bindings to return
successfully. R4-06 correctly rejects them before executing a parent. The
test-only follow-up preserves their record/user/resolver privacy checks and
requires the bounded configuration error. The failed log is retained as
`core-default-obsolete-logging-attempt.log`; the complete core run and subsequent
suites use the corrected tests. No application change was required by that run.

An initial qualification at `268e47f1c` passed core, real-service/Companion,
root, storage, dev-tools and static gates. While Playwright was running, the
additional role-write interleaving probe verified R4-07. That browser run was
interrupted deliberately and is not passing final evidence; completed earlier
results are retained under `pre-role-race-qualification/`, with interrupted
browser log/XML named `playwright-interrupted-for-role-race.*`. All five packages,
static gates and complete suites were rerun after `f642ddaf8`; no earlier suite
result substitutes for the final tree.

## Cleanup and checkout

All four round-owned Compose projects were removed with their volumes. Removed
the six standalone containers, all three captured anonymous volumes, the
`sr-final-r4-profiles` network and all three exact round-owned firewall rules.
Final queries find zero owned containers, networks, volumes or firewall rules.
No image was built, so this round created no dangling image to remove; unrelated
historical images/resources remain. Docker storage has 8.6 GB free after cleanup.
See `container-cleanup.log`, `network-cleanup.log`, `firewall-cleanup.log`,
`volume-cleanup.log`, `remaining-owned-*.log` and `disk-after-cleanup.log`.

Preserved Bruno's generated environment/lock-name patch as
`generated-bruno-fixture-changes.patch`, then restored only those two generated
files. Its lock change was the top-level name `bruno` to `bruno-tests`, with no
dependency changes. The unrelated untracked GraphQL specification remains
untouched. Closing documentation-tree checks scan **1074 closure files and 1045
inventory matches**, with zero executable violations, forbidden dependencies or
unclassified entries; all **1261/1261** baseline entries reconcile. Final local
outputs are `source-closure-final.json`, `source-inventory-final.json` and
`reconciliation-final.json`. These checks are rerun after the closing commit;
the tested runtime/test snapshot above is retained separately from that
documentation-only tree.

## Remaining acceptance and assessment

No verified finding is intentionally left unfixed. The sample Agenda demonstration
method is an unselected exported helper, not a bound production handler; its
existence is not reported as an exercised public job path. Existing documented
Companion provider/process and browser-component limitations remain unchanged.

**SR-005/045/049/055 remain unchecked solely because the user has not designated
a representative institution.** No internal generated fixture substitutes for
that institution, and this round does not try to close the accepted gap.

Further P1s in another broad round remain **plausible**, especially in
unexercised interleavings. Confidence improves because the prior P1s are causally
classified, every R3 fix has a valid negative control, independent review covered
previously omitted execution entrances, and each new defect was swept across its
siblings. Those facts do not demonstrate convergence to zero. The late R4-07
finding during qualification is a concrete counterexample: serial
brand-preservation tests had missed a privilege-revocation interleaving. The
failed independent Standards review is also retained as a review limitation;
direct review and full qualification supply the available evidence. No known
verified P1 remains unfixed, but passing suites and source enumerations cannot
establish that another review will find none.

Final HEAD is reported in the response because an evidence commit cannot name
its own containing hash. Documentation-only closing commits do not alter tested
application behavior.
