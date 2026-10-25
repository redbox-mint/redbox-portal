# Final Sails-retirement review — round 7

Seven class-(A) issues found: one P1 and six P2. All have focused fixes and
regression coverage. One inherited test-isolation defect is recorded as B-04; its implementation
is unchanged. No R6 fix was demonstrated incorrect.

Review base: `a49366803`; incoming revision: `768e1bbfe`. Work was performed in
place on `stack/sails-retirement`, without branch switches, worktrees, publication,
pushes, tags, or new image builds. The unrelated untracked GraphQL specification
was left untouched and excluded from task changes.

## Findings and disposition

| ID | Severity | Final location | Verified defect and fix | Commit |
|---|---|---|---|---|
| R7-01 | P2 | `packages/redbox-core/src/http/express/middleware.ts:92`; `companion.ts:284` | Unsupported charsets/content encodings, corrupt gzip and excessive urlencoded nesting become server errors. Preserve bounded parser statuses 400/413/415 in a private sanitized error, including Companion's separately mounted parsers, without retaining body fragments or nested causes. Real HTTP covers both parsers, decompressed limits, recovery and privacy. | `40ec3ecda`; test typing `7f4185d25`, `e700ea1ad` |
| R7-02 | P1 | `packages/redbox-core/src/http/express/multipart.ts:65` | If authorization finishes after the client disconnects, multipart starts after the abort event and waits forever. Reject an already aborted/destroyed request before creating the parser; actual HTTP waits for the earlier disconnect and verifies receive/drain settle without finalization. Raw tus sibling already settles correctly and has a clean control. | `f2b4141b1` |
| R7-03 | P2 | `packages/redbox-core/src/extensions/resolution.ts:240` | Named wildcards, quoted and Unicode parameter aliases bypass method/path collision checks, allowing an earlier public handler to silently shadow a protected declaration. Use the exact pinned Express 5 matcher grammar and default options offline. Five alias regressions fail against the old implementation. | `32bd4a42a` |
| R7-04 | P2 | `packages/redbox-dev-tools/src/utils/config-helper.ts:97` | Generating GET/POST/alias routes for one action silently omits all but the first because route identity equals handler identity. Give each method/path a stable bounded identity while sharing the handler; compare parsed string literal values when deduplicating. Generate, emit, resolve and request every route, including a quoted parameter. Production-host qualification mounts actual emitted GET/POST/alias output with anonymous, bearer and browser-CSRF checks. | `6b4f1c95d`, `57b5135cd`; wire-test isolation `776892be9` |
| R7-05 | P2 | `packages/redbox-core/src/http/express/pages.ts:431` | The production page fallback consumes API OPTIONS, returning 404 without Allow. Skip its complete route for OPTIONS so Express can return the accumulated methods. Tests mount actual configuration routes plus the fallback; production checks both trailing-slash forms and an unknown path. | `2178c7204` |
| R7-06 | P2 | `packages/redbox-core/src/application/portal/http.ts:152` | The production Companion binding drops validated `tusDeferredUploadLength`, including default true, breaking providers without a known file size. Forward it unchanged; production binding coverage checks default true and explicit false. | `01981f9ac` |
| R7-07 | P2 | `packages/redbox-core/src/application/portal/application.ts:255`; `http/express/ownedRoutes.ts:17` | Core routes are absent from collision resolution, so a public extension at the record-types path silently shadows its protected core handler. Include concrete core identities, implicit HEAD, all-method routes and configured Companion mounts in offline resolution. Require the owned name and `replaces: true`, preserving method/path, while permitting new custom routes. Test production composition before resource acquisition, accidental shadows and deliberate replacements; document the public inventory helper. | `2482548b6` |

All are feature-owned code or behavior introduced by the feature, including this
round's regression correction. These are seven distinct incoming defects; the
quoted-route deduplication follow-up corrects the implementation of R7-04 and is
not counted as an eighth incoming issue. Exact direct dependency
`path-to-regexp: "8.4.2"` matches the already installed Express router dependency;
its lockfile is updated consistently.

## Reproduction and controls

Local artifacts live under `.tmp/sails-retirement/final-review-r7/`. Negative
controls are expected failures and never substitute for accepted qualification.

| Control | Accepted observation |
|---|---|
| `body-parser-red-final.log` | 0 passing / 2 failing with original middleware/Companion injected; client parser statuses and sanitized Companion boundary are missing |
| `parsers-red.log` | 15 passing / 2 failing against incoming parsing behavior, including multipart work remaining pending after an earlier disconnect |
| `routes-red.log` | All five equivalent Express path pairs miss the expected collision rejection |
| `generated-routes-red-corrected.log` | 0 passing / 1 failing: emitted one route instead of three |
| `generated-quoted-route-red.log` | 0 passing / 1 failing: follow-up caught duplicate quoted routes (five instead of four) |
| `options-red-corrected.log` | 0 passing / 1 failing: API OPTIONS returns 404 instead of 200 |
| `companion-binding-red-corrected.log` | 0 passing / 2 failing: production native options contain undefined instead of true/false |
| `bindings-red.log` | Seven owned-route tests fail: five accidental shadows resolve; deliberate replacements have no target. Its two Companion failures are rejected fixture setup, superseded by the corrected control above. |
| `parsers-full-green.log`, `tus-disconnected-probe.log` | 38 passing and 1 passing focused parser/raw-tus controls |
| `aliases-green.log`, `owned-routes-green.log`, `options-green.log`, `companion-binding-green.log`, `generated-quoted-route-green.log` | 9, 16, 12, 2 and 1 passing respectively; overlapping focused counts are not aggregated |

Rejected fixture/harness attempts remain labelled: initial generated-test imports
and types, OPTIONS fixture without a session, Companion fixture with an invalid
artifact root or the wrong re-export stub, and the initial owned inventory's
legacy API-reference path spellings/missing handler binding. The final inventory
uses the actual mounted Express paths. A first full-build attempt stopped at a
new test's inferred optional header value (`rejected-initial-typecheck/`); explicit
header typing corrects it and the complete sequence was restarted.
The next attempt exposed the same test's generic Buffer type, which Fetch's DOM
types also reject (`rejected-payload-typecheck/`). Use an ArrayBuffer-backed
Uint8Array and verify the exact application typecheck before restarting all gates
on `e700ea1ad`.
The full dev-tools run exposed B-04: a preceding unchanged translation test
leaves a manual global Fetch stub installed. R7's new wire regression now uses
Node HTTP independently. The failed qualification prefix is preserved under
`pre-transport-isolation/`; the entire sequence is repeated after verifying the
complete dev-tools suite (53 passing). Final qualification restarts on
`776892be9`. No runtime change or eighth incoming class-A issue
results from this test correction.
An initial lint probe referenced unavailable ESLint; the required repository
oxlint gate supplies final lint qualification. Intermediate lock generation was
superseded by the exact matching 8.4.2 pin.

The first complete browser attempt passed 123/124 but F17's final API metadata
read failed with ECONNRESET. Its screenshot, trace, redacted request timings and
failed XML are preserved under `rejected-playwright-connection-reset/`. The UI
save/reload assertions had passed; a cleanup GET to the same URL returned 200
about 90 ms later and the host continued serving later cases. Ten isolated F17
repetitions then passed, without runtime changes or test retries. No additional
product defect or inherited classification is inferred from that one transport
failure. The complete 124-case browser rerun passes on unchanged `776892be9`,
with no skips or failures; the remaining qualification then continues. Earlier build/static/core/root/storage/
dev-tools gates already ran on that exact tree; no superseded e700 prefix supplies
a final gate. Progress checks are corrected to inspect failure lines as well as
recent output.

## R6 review and fresh audit

Read R1–R6 evidence and the inherited backlog before the specification/code audit.
The independent Standards review verified R7-03/04/05; the Spec review verified
R7-03/06/07. Their isolated probes used local Node 24.18.0/Express 5.2.1; accepted final
qualification uses Node 26.11.1 below. Both classified these as feature defects, reported no additional
inherited defect, and found no incorrect R6 fix. The Standards axis also ties the
generator loss to CONTRIBUTING's preservation-of-functionality rule. Duplicate
alias findings are counted once. The request-parsing findings came from the
completion review's actual HTTP probes.

R6's Figshare fixture validation/production guard, exact scaffold compiler pin,
effective queue backend selection, generated policy chain, `mergeParams` policy
router, and persistent Busboy error observation remain correct. In particular,
the multipart fix retains errors after native parser failure and joins provider
cleanup; R7-02 covers an earlier entry point that R6 did not test. Generated
production routes continue to carry branding/portal parameters through policies;
new end-to-end generated multi-route coverage retains R6's bearer/session/CSRF
checks.

Beyond the seven fixes, the review found no further demonstrated class-A problem
in malformed/truncated/oversized JSON and urlencoded bodies, gzip expansion,
multipart limits/backpressure/cancellation/cleanup, native raw tus handling,
request-lifetime ownership, streaming errors after headers, encoded path errors,
Express wildcards/parameter propagation/HEAD/OPTIONS, configuration precedence,
selected queue persistence, scaffold/compiler/conversion behavior, extension
lifecycle cleanup, deployment inputs, and evidence closure. This is the reviewed
scope, not a claim of exhaustive proof. B-04 records unchanged inherited Fetch-stub leakage in the translation tests.
No inherited production code was fixed. The accepted institutional gap is unchanged.

## Final-tree qualification

**All final gates pass on `776892be958c440bf9bc45ef84d3c8b77a2ebaf2`, with zero
final failures.** [Machine-readable results and 238 evidence hashes](final-review-r7/qualification.json)
retain expected negative controls, rejected harness attempts and the initial browser
connection reset separately from accepted final results. Every hash was checked
against its local file before the evidence commit.

| Gate | Accepted result | Local evidence |
|---|---|---|
| Full ordinary core Mocha | 4,626 passing; 7 unchanged pending | `core-default-final.log` |
| Full separately collected real-service core | 213 passing; zero pending/failures; natural process exit | `core-real-final.log` |
| Isolated Companion lifecycle/uploads | 2 + 6 passing | `CompanionLifecycleProbe-final.log`, `CompanionUploadsMongo-final.log` |
| Full root Mocha | 422 passing; 10 unchanged pending; zero resources/operations/clients/pools after stop | `root-final.log` |
| Full storage Mongo Mocha | 306 passing | `storage-final-clean.log` |
| Full dev-tools Mocha | 53 passing | `dev-tools-final-clean.log` |
| Full PDF unit Mocha | 79 passing | `pdf-unit-final.log` |
| Full Playwright and harness | 124/124 browser cases, no skips; harness 19/19 | `playwright-full-final.xml`, `playwright-harness-final.log` |
| Dedicated retirement browser | 4/4; real Keycloak/tus/Companion/PDF, durable completion and stop retry; pools/Prisma clients/upgrade listeners zero | `retirement-browser-final.xml`, `retirement-browser-final.log`, `retirement-browser-host.log` |
| General Bruno | 309/309 requests, 554/554 tests, 3/3 assertions | `bruno-general-final.xml`, `bruno-general-final.log` |
| Dedicated OIDC Bruno | 13/13 requests, 17/17 tests | `bruno-oidc-final.xml` |
| Dedicated S3 Bruno | 7/7 requests, 12/12 tests; fresh XML/executed counts verified | `bruno-s3-final.xml`, `bruno-s3-final.log` |
| Native PDF integration | 4/4 requests, 10/10 tests; fresh XML/executed counts verified | `pdf-final.xml`, `pdf-final.log` |
| Production host/generated institution | 1 + 1 passing; restart, persisted work, generated routes and zero pools after stop | `production-host-final.log`, `generated-institution-final.log` |
| Compiled persisted hooks | 5/5 | `hook-qualification-final.log` |
| Builds/typechecks/generated contracts | Five packages compile; six core configurations in container and exact host runs, plus root typecheck pass; Prisma contracts and portal schema verified | `build-final.log`, `typecheck-*.log`, `prisma-check.log`, `portal-config-check.log` |
| Lint/import boundaries | 937 files; zero warnings/errors | `lint-final.log` |
| API docs/generation/audit/tests | Generation/audit pass; 43 published surfaces, 524 unchanged advisories, 4/4 tests | `doc-api-final.log`, `docs-*-final.log` |
| Exact dependencies/locks | 23 manifests, 377 declarations, 20 permitted local references, zero violations; six changed lock roots consistent | `dependency-pins.json`, `lockfile-consistency.json` |
| Retirement tooling regression | 8/8 | `closure-tests-final.log` |
| Installed compiled-tree closure | 6,141 files; zero executable/forbidden violations | `compiled-tree-closure-final.json` |
| Committed source closure/inventory | 1,082 closure files, 1,053 inventory matches; zero executable/forbidden/unclassified violations; 1,261/1,261 baseline entries reconciled | `source-closure-qualified.json`, `source-inventory-qualified.json`, `reconciliation-qualified.json` |

Pending Mocha cases do not count as passing coverage. Accepted browser/API XML has
no failures, errors or skips. General Bruno's XML contains 557 cases: 554 tests
plus three assertions. Overlapping suites are not combined into a coverage total.
After all suites, both tracked Bruno-generated files were preserved in
`bruno-tracked-run-mutations.patch` and restored: `test/bruno/environments/int-test.bru`
and `test/bruno/package-lock.json`. The repeated exact-pin/lock checks passed, and
all 1,323 selected source, test, configuration, template and executable files
matched the qualification container (`completion-input-audit.json`).

Used the isolated existing daemon `unix:///run/sr-p7-isolated/docker.sock`, current
mounted source/tests/executables and all five rebuilt compiled-package overlays.
Container witnesses verify Node 26.11.1, npm 11.20.0 and MongoDB 9.0.4, with exact
image IDs recorded. The historical API/PDF image lacks the new direct matcher
dependency, so those profiles additionally mount the verified 8.4.2 package and
current core manifest/lock; `matcher-dependency-overlay.json` records its file
hashes. Existing historical artifacts supply the toolchain/native browser; they
are not evidence of a newly built runtime image. No new image or replacement
immutable-image/topology-matrix qualification is claimed.

The final Mongo witness initially tried default port 27017 and was refused; this
fixture explicitly listens on 29511. The corrected witness supplies that port and
reports 9.0.4. `rejected-final-mongo-witness.log` labels the rejected local command;
it supplies no test result and requires no product change.

## Cleanup and remaining acceptance

All six standalone round-owned containers, all Compose-profile containers,
three captured anonymous volumes and every round-labelled Compose volume are
removed. The external `sr-final-r7-profiles` network and all three round-commented
firewall rules are removed. Explicit post-cleanup queries find no owned
containers/networks/volumes/firewall rules. Before/after dangling-image IDs are
unchanged; the unrelated existing dangling image is retained. No image was built.
The Docker filesystem has 158 GiB available after cleanup; the disk snapshot is
retained locally.

Cleanup witnesses: `container-cleanup.log`, `network-cleanup.log`,
`volume-cleanup.log`, `firewall-cleanup.log`, `remaining-owned-containers.log`,
`remaining-owned-networks.log`, `dangling-images-before-cleanup.log`,
`dangling-images-after-cleanup.log` and `disk-after-cleanup.log`.
The final qualification JSON verifies the completed stage sequences, clean input
audit, absent resources and no newly dangling image. Only the unrelated untracked
GraphQL specification remains outside the closing evidence changes.

SR-005/045/049/055 remain unchecked solely because no representative institution
is designated. Generated fixtures are qualification fixtures, not a designated
institution. Closing changes are documentation/evidence only; the final response
records HEAD after the evidence commit, which this file cannot name itself.
