# Final-gate review and fixes — round 3

Review base `a49366803`; initial HEAD `46351fc2d`. Work stayed in the shared `stack/sails-retirement` checkout. No worktree/branch switch, push, publication or tag occurred. The unrelated untracked GraphQL specification was untouched. AGENTS.md, R1/R2 evidence first, all eight requested specifications and relevant tracked wiki pages were read. Used the code-review and ReDBox Testing skills.

**14 verified issues fixed: 10 P1, 3 P2 and one P3 documentation correction. No verified defect is intentionally left unfixed.** Locations below identify the corrected boundary on the final source. Core `src/` paths are relative to `packages/redbox-core/` unless qualified otherwise.

| ID | Severity | File:line | Trigger and correction | Fix commit |
| --- | --- | --- | --- | --- |
| R3-01 | P1 | `src/storage/StandardDatastream.ts:371` | Missing primary bytes caused read-side lazy adoption of client-selected foreign/unbound staging. Require trusted actor/brand and exact existing-record binding before reading bytes or joining a promotion guard. HTTP downloads pass authority. | `0fbd7f74a` |
| R3-02 | P2 | `src/storage/StandardDatastream.ts:848` | Metadata save could adopt an incomplete or deferred-length resumable upload. Require a valid declared size and matching final offset; retain incomplete bytes for resumption. The full Bruno run also exposed its obsolete 194397-byte declaration for a 30148-byte fixture; correct that declaration and assert the completed offset. | `4a2c0bf6e`; Bruno fixture `ff7e2314d` |
| R3-03 | P1 | `src/records/Records.ts:6092`, `src/storage/StandardDatastream.ts:976` | A losing/cancelled save journal could expire/delete a foreign actor/brand/record's staging without ever reaching promotion authorization. Persist trusted actor/brand in journal rows/claims and verify provider binding at both Standard and Mongo destructive ports. Historical missing ownership is retained. | `da6231530` |
| R3-04 | P2 | `src/records/Records.ts:3353` | Promotion failure followed by failure marking the journal `unknown` logged the raw provider Error, exposing credentials under real Pino serialization. Keep a bounded diagnostic and preserve the unknown outcome. | `575124620` |
| R3-05 | P2 | `packages/sails-hook-redbox-pdfgen/src/api/services/PDF.ts:269` | PDF success/navigation and duplicate diagnostics exposed credentials in configured URLs. Use bounded oid/attempt messages and omit raw configured URL span/log values. Update stale raw-browser-log README claim. | `06660e685` |
| R3-06 | P1 | `src/action-execution/legacy-result.ts:69` | Promise-backed Observable/Effect hooks were classified cancellable, retried concurrently after timeout and escaped a clean stop. Retain actual result lifetime independently of the timed outer wait; suppress non-cooperative timeout retry. Preserve Observable first-value semantics. | `3057715f7` |
| R3-07 | P1 | `src/queues/AgendaQueue.ts:80` | Queue's own drain timeout revoked completion permission while actual accepted handlers remained owned. Tie permission to live worker/accepted scopes, including another module's accepted callback; retain deadline failure and unscoped/stale denial. | `ea0683685`; legacy assertions reconciled in `f719544d6` |
| R3-08 | P1 | `src/records/Records.ts:635`, `:2938` | Worker/schedule post hooks and terminal/grace audits were retained but inherited an already-settled caller's persistence scope. Give actual hook work and gated audit submission independent admitted lifetimes. | `3057715f7` |
| R3-09 | P1 | `src/application/portal/providers.ts:67`, `src/integrations/Email.ts:363` | Production notification callbacks were globally tracked without completion admission after their request/job returned. Invoke and settle Promise/Observable/Effect callback results in an owned accepted scope; preserve synchronous throw behavior. | `dc8f59181` |
| R3-10 | P1 | `src/vocabulary/FigshareVocabulary.ts:2295`, `src/vocabulary/Vocabulary.ts:1241` | Original configured import Promises survived bootstrap/reconciliation timeouts, including RVA early-row return, without a drain owner. Retain actual imports in module drain/close and independent admitted scopes. Existing per-item failure logging/retry policy remains. | `b76ef23a7` |
| R3-11 | P1 | `src/services/oni-v2/flydriveOcflStore.ts:239`, `:257` | OCFL abort completed while the underlying disk upload cleanup was still pending. Join upload in Node destruction and additionally join Node finished in Web abort, since Node's toWeb abort returns early. | `8fdfc269c` |
| R3-12 | P1 | `src/http/express/identityAdministration.ts:186` | Brand-A Admin could mint a global token for an A/B shared user and exercise B's permissions; password/profile/status/revoke siblings also mutate the global account. Deny another shared account's global mutations; retain owner self routes and scoped role edits. | `04455647e` |
| R3-13 | P1 | `src/identity/Users.ts:1136` | Linking an A-controlled secondary to an A/B primary gave the alias the primary's global B permissions. Reject foreign primary memberships, alongside the existing secondary-membership guard. | `04455647e` |
| R3-14 | P3 | `support/wiki/Coding-Standards-and-Conventions.md:21` | Authoritative standards still located backend source in retired `typescript/`. Point to `packages/redbox-core/src/`. | `454eee512` |

Every fix commit ends with `Co-Authored-By: GPT-6.1-sol <noreply@openai.com>`. No dependency was added or loosened. Each P1/P2 has a regression test; new runtime ports remain narrow instance-owned callbacks rather than a global locator or cancellation marker framework.

## Exhaustive audit and independent reviews

The [enumeration appendix](final-review-r3/review.md) contains the complete routes, mounts, domain, storage and async tables, trust boundaries, source/counting rules, R2 critique and final dispositions. Totals: **335 unique manifest routes (152/152 API operations), 16 supplemental dispatch-boundary rows, 2,484 conservative domain/adapter/helper candidates in 935 server-package source files, 183 storage operations/helpers in 18 modules; 360 actual final async sites plus 29 explicit exclusions across 1,221 production files/33 src roots**. Async cross-checks enumerate 35 supplemental registrations, 516 Promise expressions, 62 callback candidates and 914 declarative Angular event/output sites. Sets overlap; these are static source sites, not independent runtime authorization checks or sums of tasks.

Independent [Standards](final-review-r3/standards-review.md) and [Spec/async](final-review-r3/spec-review.md) reports retain their original snapshot findings. Standards verified three findings and inspected all 28 R2 logging boundaries; Spec verified six P1 lifecycle findings. The failed tenant child produced candidate data only; the owning reviewer completed that review. **No completed independent tenant review is claimed.**

After correction, the reviewed Express auth/CSRF/session/upload/socket/page/error/header contracts, brand/object authority chains, staging ownership, logging, finite compatibility conversions, dependency pins and retirement closure have no additional verified defect intentionally left unfixed. Raw internal storage/repository APIs and unselected exported async utilities are explicitly identified in the appendix; they are not misrepresented as independently authorizing public endpoints. Existing documented Companion provider/process and browser-component lifetime limits remain accurately described.

## Focused evidence

Evidence logs and local drivers are under `.tmp/sails-retirement/final-review-r3/`. Independent source probes and regression tests precede final qualification; they are not added to full-suite totals.

- Read recovery: six red failures, 83 focused service/HTTP passes. Incomplete tus adoption: three red failures, 62 service passes.
- Cancelled cleanup: four red failures; 413 focused core passes and two targeted real-Mongo adapter passes. Real journal/generated Prisma contracts carry ownership fields. Unbound/foreign staging stays retained and owned expired staging still cleans.
- Nested journal logging: actual production Pino serializer reproduced disclosure; regression red then green. PDF configured URL: injected plus Effect logger regression red; complete focused audit file 23 passes.
- Independent lifecycle probes reproduced clean stop under hidden Promise work, rejected late worker/email writes, queue completion denial at its own deadline, abandoned imports and premature OCFL abort. Corrected focused lifecycle suite: **361 passing**. Queue unit suite after replacing obsolete revocation expectations: **59 passing**. Real-Mongo queue/HTTP completion deadline cases: **4 passing**.
- Shared identity source probe loads **initial `46351fc2d` from git objects without changing the checkout**: A Admin gets 403 in B, mints shared target token with 200, then reaches B as Admin with 200; creating a local alias link grants foreign Admin as well. Corrected identity Mongo/Users suites: **108 passing**, including all admin/API credential/profile/status aliases, foreign-role-preserving scoped edits and primary-link denial. Earlier incomplete probe fixtures are rejected; only the corrected successful pinned probe is counted.

## Full final-tree qualification

**All completed gates pass, with zero final failures.** Production code is `04455647e`; core/root/browser/static inputs include corrections through `454eee512`; general Bruno includes fixture-only `ff7e2314d`. That last commit changes two Bruno files only, so earlier suites' inputs are unchanged. Later review-evidence/task commits are documentation only. [Machine-readable results and log SHA-256 hashes](final-review-r3/qualification.json) preserve the exact scopes and counts.

| Gate | Final result | Local evidence under `.tmp/sails-retirement/final-review-r3/` |
| --- | --- | --- |
| Full ordinary core Mocha | 4577 passing, 7 unchanged pending | `core-default-final.log` |
| Full separately collected real-service core | 210 passing; natural process exit | `core-real-final.log` |
| Isolated Companion lifecycle/uploads | 2 + 6 passing | `CompanionLifecycleProbe-final.log`, `CompanionUploadsMongo-final.log` |
| Full root Mocha | 422 passing, 10 unchanged pending; zero resources/operations/clients/pools after stop | `root-final.log` |
| Full storage Mongo Mocha | 306 passing | `storage-final-clean.log` |
| Full dev-tools Mocha | 52 passing | `dev-tools-final-clean.log` |
| Full PDF unit Mocha | 79 passing | `pdf-unit-final.log` |
| Full Playwright | 124/124, no skips; harness 19/19 | `playwright-full-final.xml`, `playwright-harness-final.log` |
| Dedicated retirement browser | 4/4; real Keycloak/tus/Companion/PDF and deadline/retry persistence; pools/clients/upgrade listeners zero | `retirement-browser-final.xml`, `retirement-browser-final.log` |
| General Bruno | 309/309 requests, 554/554 tests, 3/3 assertions | `bruno-general-final.xml`, `bruno-general-final.log` |
| Dedicated OIDC Bruno | 13/13 requests, 17/17 tests | `bruno-oidc-final.xml` |
| Dedicated S3 Bruno | 7/7 requests, 12/12 tests; fresh XML/executed-count verifier | `bruno-s3-final.xml` |
| Native PDF integration | 4/4 requests, 10/10 tests; fresh XML/executed-count verifier | `pdf-final.xml` |
| Production host/generated application | 1 + 1 passing; generated fixture is not the undesignated institution | `production-host-final.log`, `generated-institution-final.log` |
| Compiled persisted-hook qualifiers | 5/5 | `hook-qualification-final.log` |
| Builds/typechecks/generated contracts | Five packages compiled; six exact host core configs plus root pass; Prisma contract and portal configuration schema checks pass | `run-build-typechecks.sh`, `typecheck-*-exact-final.log`, `prisma-check.log`, `portal-config-check.log` |
| Lint/import boundaries | 936 files, zero warnings/errors | `lint-final.log` |
| API docs/generation/audit/tests | API generation passes; 43 published surfaces, 524 existing advisories, 4/4 tests | `doc-api-final.log`, `docs-*-final.log` |
| Exact pins/lockfiles | 23 tracked manifests, 376 declarations, 20 permitted local references, zero violations; six feature-changed lock roots consistent | `dependency-pins.json`, `lockfile-consistency.json` |
| Retirement tooling regression | 8/8 | `closure-tests-final.log` |
| Installed compiled-tree closure | 6120 files; zero executable violations/forbidden dependencies | `compiled-tree-closure-final.json` |
| Committed runtime/test source closure/inventory (`ff7e2314d`) | 1059 closure files, 1030 inventory matches, zero violations/forbidden dependencies/unclassified; 1261/1261 baseline entries reconciled | `source-closure-qualified.json`, `source-inventory-qualified.json`, `reconciliation-qualified.json` |

Pending Mocha cases are not counted as passing coverage. Fresh browser/API XML contains no skips. Source-site and suite totals overlap and are not summed into a synthetic coverage count. Main driver: `run-last-qualification.sh`; after the fixture-only correction, `run-remaining-qualification.sh` reruns general/OIDC/S3/PDF and `run-post-qualification.sh` supplies PDF unit, retirement browser and hook qualification. Exact host typechecks and docs run independently before the serialized final core run.

## Provenance, rejected attempts and remaining acceptance

The round reuses R2/P8's exact-pinned historical toolchain/native-browser images on `unix:///run/sr-p7-isolated/docker.sock`, mounts current source/tests and overlays all five rebuilt compiled packages. No new image was built. The original immutable packs/images/topology matrix qualify their original source; current mounted/compiled-tree suites do not replace that historical provenance. The native PDF overlay retains its rehearsal manifest with installed optional PDF/development-form dependencies. Fresh XML is required before counting Bruno/PDF execution.

The first full core attempt (4574 passing/7 pending/4 failures) is rejected as final evidence. Three tests still expected the old queue deadline to revoke accepted completion; their assertions now verify positive live completion and negative unscoped admission. The toolchain container also held an obsolete Mocha collection file; the current file is copied before full core runs, keeping the mandatory notification-Mongo suite in its separate real-service collection. The corrected queue unit suite passes. A subsequent run (4576 passing/7 pending/one source-loader subprocess timeout) overlapped documentation generation and exact host typechecks; it is preserved as `core-default-contention-attempt.log` and is not passing evidence. The final serialized core run passes all 4577 cases; that source-loader check takes 8844 ms with its unchanged 25-second subprocess limit. The real-service collection also exits naturally after its finite five-minute Promise timers expire: debugger inspection found no remaining network sockets, and neither timers nor process were force-cleared. Those inspection logs are retained separately. Earlier focused Chai loader-order/missing fixture-URL attempts are also retained as failed setup evidence, not product regressions or passing coverage.

The first general Bruno run is also rejected: 226 passed requests, one failed attachment download and 82 bailed requests. It declared a 194397-byte tus upload but sent the 30148-byte checked-in PNG. The new R3-02 guard correctly retained this incomplete upload instead of publishing truncated bytes. Commit `ff7e2314d` corrects only that test declaration and adds a final-offset assertion; its two edited Bruno files parse successfully. The failed log/XML are preserved under `bruno-general-incomplete-fixture-attempt.*`. The complete general/OIDC/S3 API profiles are rerun after this correction; application source and all earlier qualified suites' inputs are unchanged.

**SR-005/045/049/055 remain unchecked solely because the user has not designated a representative institution.** No stand-in is represented as that institution, and this accepted gap is not raised as a new issue or closed.


## Cleanup and final checkout

All four round-owned Compose projects were removed with volumes. Removed the six standalone round-owned containers, their three anonymous volumes, the supplemental `sr-final-r3-profiles` network and all three exact `sr-final-r3` firewall rules. Final queries find zero round-owned containers, networks, volumes or firewall rules. No Docker image was built, so no round-created dangling image exists to remove; unrelated historical images/resources were retained. Docker storage has 8.7 GB free after cleanup. See `container-cleanup.log`, `network-cleanup.log`, `firewall-cleanup.log`, `volume-cleanup.log`, `remaining-owned-*.log` and `disk-after-cleanup.log`.

Restored only the Bruno-generated environment/lockfile changes, preserving their patch under `generated-bruno-fixture-changes.patch`. The two intentional upload fixture edits remain committed. The unrelated untracked GraphQL specification remains untouched. The final response records the resulting full HEAD after the documentation-only evidence commit and final committed-tree reconciliation.
