# Sails retirement final review — round 9

Seven class-(A) P2 defects found and fixed; no P1 confirmed. No inherited defect was changed or added to the backlog. R8-01's asset-priority change was incorrect for compiled application overrides and is corrected here. The other seven R8 fixes remain correct.

Review base `a49366803`, incoming HEAD `1572a5518`, final runtime/test input `511a43538`. Work stayed in the shared `stack/sails-retirement` checkout. No branch/worktree changes, dependency version updates, image builds, push, publication or tags. The unrelated untracked GraphQL specification was excluded. All round commits carry the requested co-author trailer.

## Confirmed issues and fixes

| ID | Severity | Final location | Reproduction and correction | Fix commit |
|---|---|---|---|---|
| R9-01 | P2 | `packages/redbox-core/src/application/portal/http.ts:63` | R8 made packaged hook assets override same-path compiled application overrides and selected their Angular bundle hashes. Restore explicit application roots/default `.tmp/public` before hook roots, then source fallback. Actual artifact/static HTTP and baseline extraction verify the behavior. | `aa900502f` |
| R9-02 | P2 | `packages/redbox-core/src/http/express/login.ts:260` | Accepted `auth.postLogoutRedir: ''` yields an empty Location, then GET logout fails 405. Restore the brand-home fallback for an empty setting while retaining nonempty destinations. Real authenticated sessions under `/research` cover omitted, empty and custom values. | `d25b58d67` |
| R9-03 | P2 | `packages/redbox-core/src/extensions/resolution.ts:169` | Repeated trailing slashes bypass core-route collision detection while Express matches the protected route's normal URL. Normalize every trailing slash before comparing route matchers. Tests reject extension/core GET and HEAD aliases and characterize actual Express routing. | `2f9798089`; test typing `5487852cd`, `14d5487cb` |
| R9-04 | P2 | `support/wiki/Installation-Guide.md:16` | Following installation/development startup without a session secret fails Compose interpolation. Supply the complete build, generated-secret and startup sequence in the linked guides. Actual missing-secret and corrected Compose controls verify it. | `d34f1b1da` |
| R9-05 | P2 | `support/specs/sails-retirement/hook-migration-v6.md:15` | The scaffold's unqualified registry install resolves historical `0.0.1-beta.9022` core without the v6 application/extension exports; its build fails. Document and generate the checkout workflow using the matching built local v6 core. Actual init/install/build/check/migrate/check/pack succeeds. | `5d948d727`, `8e92661ca` |
| R9-06 | P2 | `packages/redbox-core/src/http/express/progressSockets.ts:143` | An older subscribe awaiting authorization rejoins a room after unsubscribe acknowledged success and supersedes a later pending join. Retain per-room intent identity, cancel it on unsubscribe, and admit only the current live intent after authorization. Concurrent subscriptions share that intent until all authorizations acknowledge. Pending rooms count toward the existing 100-room bound. Real Socket.IO interleavings verify cancellation, concurrent acknowledgements, later join, delivered update and final leave. | `7f52bae74`, `511a43538` |
| R9-07 | P2 | `package-lock.json:23003` and four extension consumer lockfiles | The documented root `npm ci` rejects the omitted exact `path-to-regexp@8.4.2` dependency. Propagate the current local core dependency snapshot and resolved root entry without changing versions. Regression catches five stale consumers, then passes all six selected locks; actual clean install is exercised. | `35e71d277` |

The two independent read-only Standards/Spec reviews supplied R9-02/R9-03; duplicate findings are counted once. The code-review and Redbox Testing skills were used. Prior round evidence, the inherited backlog, feature contracts, tracked wiki, AGENTS.md and contribution standards were read before review.

## Focused controls and R8 re-review

Local reproducible drivers/logs are under `.tmp/sails-retirement/final-review-r9/`; the qualification manifest records hashes. Expected red controls and rejected fixtures provide no final qualification gate.

- The asset corpus passes 12 tests. `asset-baseline-probe.log` records 21 checks using the extracted pre-feature resolver, covering six asset folders, direct paths, favicon/manifest, same-path compiled precedence and more-specific hook precedence. Reproduce from the repository root with `node support/specs/sails-retirement/evidence/final-review-r9/asset-baseline-probe.cjs`. Explicit old `mergeHookConfig` copies are a separate initialization effect; port those intended replacements into packaged application artifacts. The migration guide explains both rules.
- Logout's valid red control has one failure; its corrected real-session corpus passes 14 tests. Undefined/empty/custom redirect cases include a non-root deployment.
- Route normalization's valid control has four failures; the corrected focused corpus passes 21. An initial fixture incorrectly expected a request ending in two slashes to match Express's optional single request slash. It was corrected before the valid negative control. Two qualification prefixes exposed strict test-typing issues (missing supertest types, then TS7022); native HTTP and explicit response types corrected them. These prefixes are rejected, not accepted suites.
- The socket control has one pass/one failure: an older pending join returns true after a successful unsubscribe. Its initial correction has two focused passes, including R8's disconnect-during-authentication regression. Final browser qualification then exposed a regression in that correction: the shipped helper buffers an initial subscribe and repeats it on connection, so a per-request identity wrongly denies the first acknowledgement. A new deterministic control has two passes/one failure; shared room intent fixes it, and all three focused tests plus all four actual browser cases pass. This completes R9-06 rather than adding an incoming defect. A duplicate focused typecheck was cancelled to avoid concurrent compilers; the full qualification runs the required typechecks.
- The lockfile control catches five stale local-package snapshots (one passing/six total); the correction passes all six. The literal root `npm ci` red control reports missing `path-to-regexp@8.4.2`; the corrected actual clean install reaches `compile:all` successfully. Only local dependency metadata and the already-pinned package resolution change; no dependency version changes.
- The public scaffold CLI still recommended an unqualified registry install after the README correction. Its existing real-CLI test fails the new matching-core guidance assertion, then passes after the output is aligned. This completes R9-05, rather than adding another issue.
- Installation's missing-secret negative and documented-secret positive Compose controls are retained as a portable regression. From the repository root, run `python3 support/specs/sails-retirement/evidence/final-review-r9/installation-secret-regression.py`; it also checks the three literal startup guides and starts no resources.
- The initial clean-source build used global Node without the documented NVM selection and stopped at Angular's NVM prefix check. That fixture is rejected; the accepted setup explicitly runs `nvm install`, `nvm use`, checks Node/npm, and performs `npm ci` before `compile:all`. The latter command exposed R9-07 above. Pre-lock/pre-CLI qualification prefixes are superseded, including their static gates; the subsequent prefix starts at `8e92661ca` and is also superseded below.
- A real-service attempt reported 216 passing tests, then a temporary inspector cleanup used `require` outside its module context and threw. That entire real-service attempt is rejected, archived as `core-real-inspector-rejected.log`, and repeated without instrumentation. The diagnostic observed 37 five-minute native-callback timers and no open network sockets; it supplies no product finding. Already-passed build/static/docs/main gates retain the identical `8e92661ca` inputs. `resume-final-after-diagnostic.sh` verifies their pass records and revision before repeating the affected stage and running every remaining gate. No application change or forced test exit is used to resolve the delayed process exit.
- The uninstrumented `8e92661ca` real-service rerun passed 216 tests and exited normally; its later retirement browser failure is the R9-06 integration regression above. The entire `8e92661ca` qualification prefix is archived under `qualification-8e92661ca-superseded/` and excluded from final gates. All builds, types, documentation, runtime suites and clean-source compilation are restarted on `511a43538` after that correction.
- R8's explicit HEAD-before-GET mounting remains correct in both declaration orders and production composition. It preserves deliberate named replacements and policy execution. Repeated trailing slash canonicalization is a separate original feature gap.
- R8's maintenance handling correctly projects workflows/business declarations out of operational resolution, includes built-in Mongo-bound jobs when SQS is default, accepts legitimate core dependencies/replacements without executing their factories, and rejects unsupported storage ownership. Packed real-Mongo maintenance and the final service suites recheck it.
- R8's weak handshake grant storage, maintenance Compose entrypoint and shipped WebSocket transport changes remain correct. The new subscription race existed in the feature's room admission implementation; it does not invalidate the handshake fix.

## Operator and integrator walkthrough

All guide walkthroughs pass after the documented corrections above. `walkthrough-results.json` records their concrete witnesses; the closing qualification manifest includes it.

| Guide/workflow | Executed result |
|---|---|
| Installation Guide | Missing session secret reproduces Compose rejection; documented generated-secret configuration succeeds. Existing-image build profile serves health/readiness/home, permits index inspection and restart, and exits 0 after drain. |
| Development Guide and linked setup/compilation instructions | Clean tracked source with `nvm install`, `nvm use`, Node 26.11.1/npm 11.20.0, actual `npm ci --ignore-scripts --strict-peer-deps`, full `compile:all` (backend, Angular and Webpack) and `package:pages` succeeds. Both development build and mount profiles reach readiness/home and stop with exit 0. |
| Configuration Guide | Exact sample modules exercise CJS application, ESM environment, local, environment-variable and CLI precedence, deployment under `/research` and session cookie path: 8 checks pass, no resources opened during configuration loading. |
| Hook migration and dev-tools scaffold | Final CLI initializes the v6 scaffold, recommends the matching v6 core, installs the built local core, builds, checks, migrates, checks again and packs successfully. Both contract checks pass. Packaged page assembly also succeeds from the fully built clean source. |
| Upgrade/recovery runbook | Both the incoming P7 example and corrected P8 example complete source/candidate/restart/recovery rehearsals. Each stage verifies login, two records/forms/workflows/pages and 20 form requests; all stops exit 0. Restoration verifies 25 collections, 1,895 documents and GridFS/byte data. The complete saved source image has 23 layers and 525,915,136 bytes. |
| Offline archive recovery | A separate initially empty Docker engine loads the verified image archive and executes Node 24.16.0 with `--pull=never --network=none`, as the documented offline check requires; the private engine and containerd are removed afterward. |

Per the request to use existing images, Compose startup reused existing artifacts with current compiled overlays and `--no-build`; no replacement immutable-image build or topology matrix is claimed. Development profile probes used overlays at `14d5487cb`; subsequent socket, lockfile and CLI changes are covered by the complete final-tree qualification at `511a43538`. The clean-source build and final scaffold walkthrough use that final revision, with 1,329 authored inputs checked byte-for-byte. Synthetic institution fixtures do not close the accepted representative-institution gap.

Rejected extra fixtures are retained separately: the populated-image install was replaced by clean-source installation; an initial mount-profile probe selected a production image before selecting the development test image; the hook driver initially mistyped `check-extension`; and additional full-portal probes in the empty recovery engine either timed out under concurrent I/O or supplied incomplete session/Solr configuration. These are fixture errors and provide neither findings nor accepted qualification gates. The documented offline image check and ordinary complete recovery rehearsals passed independently.

## Changed browser/client assets

Reviewed every changed shipped browser JavaScript source, the deleted Sails Socket.IO shim and its replacement, shared Webpack configuration/wrapper, embedded script/page changes, and the changed Angular form spinner and package wiring. Checked endpoint/version headers, root-scoped CSRF, fresh grants, transport/reconnect, application and brand roots, lazy validator public paths, extracted CSS/font paths, Angular bundle selection and logout POST forms. The feature's owned HTTP/browser tests exercise `/research` roots and the actual shipped progress helper. No additional concrete P1/P2 was verified in these areas.

## P3 and inherited disposition

P3: the rehearsal example still named a historical P7 comparison digest while describing the qualified Sails-free P8 artifact. Commit `a057976b0` selects `sha256:581f7c6d5fe880e3c6daff909079635ee34d7cf75c93adc35b9bad90ef8806a1`; both the incoming and corrected commands were rehearsed. Obsolete removed comparison-script claims in the development README were also removed in `d34f1b1da`.

Backlog additions: none. B-01–B-05 remain unchanged, including inherited immutable caching of long unversioned names. No severe inherited ordinary-user access-control exception was invoked. SR-005/045/049/055 remain unchecked solely for the accepted lack of a designated representative institution.

## Final-tree qualification and cleanup

Every final gate passed on `511a435389a4999a68b33f8c91498753cd93af40`, after the concurrent-subscription correction. Earlier qualification prefixes are excluded. Final suite output freshness, stage pass records, compiled/test revisions and authored-file hashes are checked by the collector; expected negative controls and rejected diagnostic/fixture attempts supply no final gate.

| Gate | Final result |
|---|---|
| Builds/types/configuration | All five package builds, six container typechecks, generated Prisma/configuration checks, six exact host typechecks and root typecheck passed. |
| Clean-source guide build | Actual pinned `npm ci`, complete backend/Angular/Webpack `compile:all` and `package:pages` passed. Webpack reports nine advisory warnings. |
| Core default | 4,644 passed; 7 existing pending. |
| Core real-service | 216 passed; process exited naturally without instrumentation or a forced exit. |
| Root | 422 passed; 10 existing pending. Owner teardown reports zero retained resources, operations, pools and Prisma clients. |
| Storage / dev-tools / PDF unit | 306 / 53 / 79 passed. |
| Full Playwright / harness | 124 passed in 8.4 minutes, including F17; one worker, zero retries. Harness: 19 passed. |
| Dedicated retirement browser | 4 passed, including actual shipped-helper subscription, fresh grants, reconnect, delivered progress, real multipart/tus/Companion bytes, OIDC and durable stop retry. |
| Production / generated institution | 1 / 1 passed, including persisted work, restart and drain. |
| Persisted extension qualifiers | 5 passed. |
| Companion lifecycle / uploads | 2 / 6 passed. |
| General Bruno | 309/309 requests, 554/554 tests, 3/3 assertions. |
| OIDC / S3 / PDF Bruno | 13 requests / 17 tests; 7 / 12; 4 / 10, all passed. |
| Packed standalone maintenance | 10 real-Mongo commands across 102 scopes, including 3 Agenda scopes, workflows, core dependencies/replacements and Mongo-bound built-ins with SQS selected by default. Pending/failures/pools: zero. Explicit backfill changes one entry, then zero. |
| Lint/documentation | 937 linted files, zero warnings/errors; API reference, generation/audit and all 4 documentation tests passed. 43 published surfaces; 524 advisory findings. |
| Retirement closure | 14 tooling regressions passed. 1,091 committed-source and 6,152 installed-tree files checked with zero executable/dependency violations; all 1,261/1,261 original inventory files reconciled. |
| Exact pins / lock roots | 23 manifests, 377 declarations, 20 allowed local references and six selected lock roots checked; zero violations. No dependency version changes. |

No final JUnit suite has a failure, error or skip. Existing Mocha pending tests are reported above. The final builder and clean-source audits each match all 1,329 selected authored runtime/test/configuration inputs; an additional 49 changed root asset/view/TypeScript/entrypoint inputs match. Raw and compiled shipped progress helpers are byte-identical and select WebSocket. The exact route matcher remains 8.4.2 in both runtime consumers and the source installation.

Qualification uses Node v26.11.1, npm 11.20.0 and MongoDB 9.0.4. [qualification.json](final-review-r9/qualification.json) records the exact images, final input revisions, suite totals, guide witnesses, dependency overlay, portable regression hashes and 553 SHA-256 witnesses for local logs/drivers/controls/diagnostics.

All Compose profile containers/volumes were removed. Closing cleanup removed the six main containers, compiler container, three captured anonymous volumes, both owned networks and all six owned firewall rules. Remaining owned containers, networks, volumes and firewall rules are zero. No image was built or new dangling image created; pre-existing dangling image `9bf944d09e37` remains untouched. The separate offline-recovery Docker engine/containerd and their data/runtime paths were already removed.

The original compiled-page cache is restored with all 429 file hashes unchanged. The temporary artifact bind mount/backing directory and synthetic rehearsal scratch/compiled overlays are removed; diagnostic logs remain locally. Bruno-generated environment/lock changes are archived locally and the two original tracked files restored byte-for-byte. Cleanup witnesses are included in the manifest.

Reviewed areas judged clean include lifecycle activation/drain/retry, operational maintenance/storage ownership, core replacement handling, explicit HEAD policy dispatch, authenticated session rotation and logout destinations, owned progress handshake/grants, configuration precedence/redaction, API/CSRF integration, artifact containment and the changed browser/client integration described above. This records concrete review and verification, not an exhaustive correctness proof.

The closing evidence-only commit adds this report, its qualification manifest, the baseline asset probe and the installation regression after the tested runtime commit. No application code or dependency changes follow the accepted final suite run.
