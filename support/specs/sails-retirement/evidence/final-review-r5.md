# Final Sails retirement review — round 5

Reviewed `a49366803164429f9d8bdd249dadcdf856c9d13e` through initial HEAD
`39ad5813c4d2fb6952a6b2e88cf81dd2b2705b87`, in the shared
`stack/sails-retirement` checkout. Read final-review-r1 through r4 first, the
eight requested specification documents, AGENTS.md and the relevant tracked
wiki pages. Applied the Redbox Testing skill. No branch switch, worktree,
push, publication or tag was made. The unrelated untracked GraphQL specification
was untouched. This round applies the orchestrator's feature/inheritance
boundary before acting on findings.

## Verified feature findings

**Five class-A findings fixed: two P1, two P2 and one P3.** Locations refer to
the corrected boundary in the final runtime/test snapshot.

| ID | Severity | Location | Reproduction and correction | Provenance | Fix commit |
|---|---|---|---|---|---|
| R5-01 | P1 | `packages/redbox-core/src/http/express/multipart.ts:117` | Abort or exceed a multipart size limit while the provider's write/abort cleanup is gated. The parser pipeline rejects immediately; the aggregate Promise rejects before the provider finishes. Cleanup and drain could claim completion early. Retain both actual operations until they settle, then clean staged keys. Real HTTP tests require drain to remain pending and prevent an orphan created after cleanup. | Feature-owned streaming multipart parser. | `26e47a606` |
| R5-02 | P2 | `packages/redbox-core/src/storage/StandardDatastream.ts:766` | Pause a save's ownership validation; an authorized reader promotes the completed tus upload and consumes sidecars; resume the save. It incorrectly rejects. On validation failure, independently confirm primary bytes at the exact record/file key and repair metadata; otherwise preserve the rejection. The fallback neither joins staging work nor copies/deletes staged bytes. | R2's new save authorization entrance; sibling of R4-04's read correction. | `8f3250963` |
| R5-03 | P3 | `support/wiki/ReDBox-Automated-Tests.md:105` | The wiki still required optimistic-concurrency fields before the file, although the owned parser waits for all fields and writes. Correct the documented contract. The existing actual HTTP test covers both field orders. | Stale documentation for the feature-owned parser. | `1b4040f7c` |
| R5-04 | P1 | `packages/redbox-core/src/extensions/composition.ts:137`, `packages/redbox-core/src/application/portal/application.ts:471` | A custom bound async policy ends the response while its audit Promise remains gated. Shutdown could close dependencies and revoke completion admission before that Promise finishes. Apply the existing `httpAction` wrapper in both composition APIs. Tests require a deadline failure while blocked, successful late admitted completion and clean stop retry. | New extension composition APIs; R4-03 retained route/middleware results but omitted caller-bound policies. Production's built-in `bindHttpPolicies` chain already tracked its own callbacks. | `f68721255` |
| R5-05 | P2 | `packages/redbox-core/test/http/IntegrationAdministrationMongo.test.ts:368` | The new real-HTTP fixture reused the login cookie after headers, while session persistence could still be pending. Qualification observed a later 401. A gated actual store write proves the helper starts its CSRF request before that write finishes. Await and validate the full login JSON before cookie reuse; correct six sibling early-reuse call sites in five real-service/Companion files. Fixtures already consuming the body are unchanged. | Feature-owned qualification fixture; production login already explicitly saves before responding (`src/http/express/login.ts:164`). | `c8e9cf2e8`, `ff33ef1f7` |

Every commit has the requested GPT-6.1-sol co-author trailer. No dependency was
added or loosened. The fixes reuse existing ownership/probe boundaries; no new
locking abstraction, retry mechanism or service framework was added.

[Focused negative controls](final-review-r5/regression-sensitivity.json) record
the log hashes. Substituting only the reviewed-head implementation makes both
multipart interleavings fail (0 passing, 2 failing), and the concurrent save/read
case fail (0 passing, 1 failing). Corrected source passes the full multipart file
(9) and datastream service file (68). The policy tests fail in both composition
APIs before the fix (0 passing, 2 failing); the final route/middleware/policy
matrix passes all six cases. The first policy control omitted the generic policy
binding and is rejected; `extension-policy-red-corrected.log` is the valid
control. Focused results establish sensitivity, not full-tree qualification.
The login-helper control fails the held-write ordering assertion before its
two-line correction (0 passing, 1 failing), then passes with the correction
(1 passing). Its first gate was installed after session composition had captured
the store method; its second assertion waited for the entire helper, allowing
the later CSRF request to remain pending. Those preliminary controls are
rejected; the accepted control observes actual CSRF request dispatch while the
login write is held.

## Inherited findings and R4 assessment

Added **three class-B P2 items** to the
[inherited-defects backlog](inherited-defects-backlog.md), with base provenance,
locations, deterministic reproduction and suggested fixes. None meets the
critical-security exception; no inherited defect was fixed in this round.

- B-01: same-brand concurrent role replacements can merge the requested sets.
  The base repository already deletes then inserts membership edges; R4's
  brand predicate correctly protects foreign memberships.
- B-02: the unselected legacy `Email.sendTemplate` helper returns no delivery
  completion and reports delivery errors through RxJS's unhandled-error path.
- B-03: the unselected `Users.triggerPostSaveTriggers` wrapper discards the
  Accounts Promise. Production Accounts paths await the direct method.

B-02/B-03 also preserve R3's earlier observations for follow-up. Already fixed
inherited R1–R4 issues are not duplicated. The checked-in
[service-port probes](final-review-r5/inherited-probes.cjs) verify these behaviors
against rebuilt packages; they do not claim a public or real-Mongo exploit.
The verified output is `inherited-probes-verified.log`; the first probe run's
incorrect relative imports are rejected as evidence.

**No R4 fix was found wrong or reverted.** R4-03 and R4-04 correctly fix their
tested entrances; R5-04 and R5-02 close omitted siblings. In particular, the R4
read fallback still requires independent primary bytes, the queued callback
validation still precedes parent effects, foreign-brand role edits stay scoped,
Agenda logs omit job payloads, effective backend selection covers both
maintenance entrances, and QueueMongo preserves its deliberate deadline expiry
while giving the explicit retry a realistic bounded interval.

## Additional review and limits

Reviewed newly owned request/Promise lifetime, stop/deadline/retry ordering,
queue renew/release and late completion admission, multipart abort/write cleanup,
tus validation/promotion/sidecar consumption, selected extension binding,
configuration and executable maintenance selection. The new gated interleaving
tests exercise actual overlapping operations, rather than infer concurrency
correctness from serial success. Also compared tracked wiki/spec/evidence claims
with code, dev-tools v6 scaffold/manifest contracts, deployment inputs, owned
policies/CSRF, sockets and page composition.

No additional verified class-A defect was found in these areas. This is a
bounded feature gate: unselected unchanged v5 helpers remain backlog work;
arbitrary hidden I/O in trusted extensions cannot be cancelled by the host.
The host owns work that callbacks return or explicitly register. Passing
enumerations and suites do not establish the absence of every possible race.

## Final-tree qualification

**All requested final gates pass, with zero final failures.**
[Machine-readable results and 151 log/driver hashes](final-review-r5/qualification.json)
distinguish accepted qualification from rejected attempts and negative controls.

The final compiled runtime/configuration is
`f68721255c915538f7d66bc0b2638fd461bd108f`. Final test corrections are
`ff33ef1f7927eaad1856aba40f7010045e242895`: its only post-build differences
are the six separately collected real-service/Companion test files. Ordinary
core explicitly excludes those files; the other suites' collected inputs are
unchanged. The exact application typecheck was repeated after the fixture
corrections. Closing changes are documentation/evidence only.

| Gate | Result | Evidence under `.tmp/sails-retirement/final-review-r5/` |
|---|---|---|
| Full ordinary core Mocha | 4601 passing, 7 unchanged pending | `core-default-final.log` |
| Full separately collected real-service core | 213 passing, zero failures; natural process exit | `core-real-final.log` |
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
| Builds/typechecks/generated contracts | Five packages compile; six exact core configurations and root pass; Prisma contracts and portal schema verified | `build-final.log`, `typecheck-*-exact-final.log`, `prisma-check.log`, `portal-config-check.log` |
| Lint/import boundaries | 936 files, zero warnings/errors | `lint-final.log` |
| API docs/generation/audit/tests | Generation/audit pass; 43 published surfaces, 524 unchanged advisories, 4/4 tests | `doc-api-final.log`, `docs-*-final.log` |
| Exact dependencies/locks | 23 manifests, 376 declarations, 20 permitted local references, zero violations; six changed lock roots consistent | `dependency-pins.json`, `lockfile-consistency.json` |
| Retirement tooling regression | 8/8 | `closure-tests-final.log` |
| Installed compiled-tree closure | 6131 files; zero executable/forbidden violations | `compiled-tree-closure-final.json` |
| Committed source closure/inventory (`ff33ef1f7`) | 1075 closure files, 1046 inventory matches; zero executable/forbidden/unclassified violations; 1261/1261 baseline entries reconciled | `source-closure-qualified.json`, `source-inventory-qualified.json`, `reconciliation-qualified.json` |

Pending Mocha cases are not counted as passing coverage. Fresh browser/API XML
has no skips. Overlapping suites are not added into a synthetic coverage count.
`run-last-qualification.sh` completed successfully. `run-serial-tail.sh` waits
for that driver, then runs the entire real-service/Companion collection and
`run-post-qualification.sh` for the dedicated browser and persisted hooks.

Used current mounted source/tests, the final executable and all five rebuilt
compiled-package overlays on the isolated existing Docker daemon
`unix:///run/sr-p7-isolated/docker.sock`. Node is 26.11.1, npm 11.20.0 and MongoDB
9.0.4. Reused P8's exact historical toolchain/rehearsal/native-browser artifacts;
**no image was built, and no replacement immutable-image qualification is
claimed**. The disposable Keycloak fixture uses the browser-callback-corrected
realm; Chromium and its native libraries came from existing local artifacts.

Rejected preliminary attempts are retained explicitly. Initial setup tried to
generate contracts into a read-only source mount (EROFS); the corrected build
uses TypeScript compilation, contract copy/check and schema verification.
Pre-policy build/static drivers were stopped and superseded after R5-04; no
pre-fix result substitutes for a final gate. The first real-service attempt,
while compilers/docs were active, reported 210 passing and two failures: the
R5-05 branding-cookie race and a compiled-child readiness timeout at its unchanged
10-second limit. That failed process was terminated after reporting; it is not
natural-exit evidence. The accepted serial rerun passes all 213 cases, including
the compiled child in 4498 ms. Companion did not run in the failed attempt.
The rejected gate/insensitive policy and login-helper controls described above
are likewise retained without being counted as regression proof.

## Cleanup and checkout

All four round-owned Compose projects were removed with their volumes. Removed
the six standalone containers, all three captured anonymous volumes, the
`sr-final-r5-profiles` network and the three exact round-owned firewall rules.
Final queries find zero owned containers, networks, volumes or firewall rules.
No image was built, so there is no round-created image to remove. Unrelated
resources and historical images remain. Docker storage has 8.6 GB free after
cleanup. See `container-cleanup.log`, `network-cleanup.log`,
`firewall-cleanup.log`, `volume-cleanup.log`, `remaining-owned-*.log` and
`disk-after-cleanup.log`.

Preserved Bruno's generated environment/lock-name patch as
`generated-bruno-fixture-changes.patch`, then restored only
`test/bruno/environments/int-test.bru` and `test/bruno/package-lock.json`.
The lock mutation was the top-level name `bruno` to `bruno-tests`, with no
dependency change. The unrelated untracked GraphQL specification remains
untouched. Committed closing-tree inventory, closure and reconciliation checks
are rerun after the evidence commit, with local outputs
`source-closure-final.json`, `source-inventory-final.json` and
`reconciliation-final.json`. They are separate from the qualified runtime/test
snapshot above. Final `git diff --check` passes and the only untracked path
remaining is the explicitly excluded GraphQL specification.

## Remaining acceptance

**SR-005/045/049/055 remain unchecked solely because no representative
institution is designated.** The generated fixture is not that institution.
This accepted gap is neither a new finding nor an attempted closure.

Final HEAD is reported in the response because this evidence cannot name its
own containing commit. Closing documentation-only changes do not alter the
qualified runtime/test inputs.
