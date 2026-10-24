# Final-gate review and fixes — round 2

Reviewed the entire feature from `a49366803` through initial HEAD `5c27f066f`, including round 1's corrections, then qualified the resulting source at `97155ef9a2f85fed4ff382b83a7713b0b5b237f3`. Work stayed in the shared `stack/sails-retirement` checkout. The unrelated untracked GraphQL specification was not touched. Nothing was pushed, published or tagged.

Read AGENTS.md, round 1 evidence first, all eight requested retirement specifications, relevant historical qualification evidence, CONTRIBUTING.md and the tracked architecture, services, configuration, development, testing, installation and compatibility wiki pages. Used the code-review and Redbox Testing skills. Independent Standards and Spec reviewers probed committed initial HEAD without editing; their five concrete findings are included below. The direct review also swept sibling instances across the full implementation.

## Findings and fixes

**12 verified review/qualification issues fixed: 3 P1 and 9 P2. No verified code defect was deliberately left unfixed.** The strict annotation finding includes older visitor debt as well as newly migrated visitors; it was corrected to make the requested complete qualification pass. P1 denotes an isolation or accepted-work lifecycle failure; P2 denotes another concrete regression, credential disclosure or verification defect. Locations identify the corrected boundary. `src/` and `test/` paths below are relative to `packages/redbox-core/` unless another package is named.

| ID | Severity | Location | Verified behavior and correction | Fix commit |
|---|---|---|---|---|
| R2-01 | P2 | `src/navigation/Navigation.ts:147`, `src/queries/Solr.ts:446`, `src/storage/TusStorageManagerDataStore.ts` | Domain failure logs received raw provider exceptions, record/query values, templates or configuration. Retain bounded operation diagnostics and safe chronicle serialization while preserving returned business errors. Secret-bearing menu, Solr, record-audit and tus failures reproduce the logging leaks. | `c2e29ae36` |
| R2-02 | P2 | `packages/sails-hook-redbox-storage-mongo/src/persistence/StorageProtocol.ts:1382` | A failed metadata write logged its complete actor, provider response and error; adjacent upload/delete failures logged raw errors. Remove sensitive payloads from these diagnostics. | `95905c1d8` |
| R2-03 | P2 | `packages/sails-hook-redbox-pdfgen/src/api/services/PDF.ts:377` | Browser console/page errors, request/response URLs and retry causes exposed document/provider values and credentials. Bound the actual registered callbacks and retry logs; preserve terminal audit and retry outcomes. | `ad8cc9ba7` |
| R2-04 | P2 | `src/application/portal/data.ts:143` | Production account-hook chronicles passed Axios exceptions directly to Pino, exposing Authorization headers. Route the production account event port through the existing safe service chronicle serializer. | `deb79b9f0` |
| R2-05 | P1 | `src/http/express/policies.ts:29`, `src/http/express/recordMutations.ts:164` | A Publisher role in brand B authorized publication in brand A through name-based workflow checks. Every authenticated branded domain context now receives only that brand's roles; the global identity snapshot remains available to identity services. Covers browser, bearer and lazy authorization entrances. | `bfe1a3765`, `dd6dd6e4b` |
| R2-06 | P1 | `src/records/Records.ts:627`, `:2935`, `:3619` | R1 retained opaque Promises but detached Observable/Effect hooks and the audit grace timer could outlive HTTP completion admission. Shutdown then refused the accepted hook's audit enqueue as draining. Retain the complete fiber/callback lifetime and deferred audit enqueue synchronously in the admitted scope. Actual ExpressHost/ApplicationRuntime/AgendaQueue probes cover Observable, Effect and grace-expired completion. | `aafa24e1f` |
| R2-07 | P1 | `src/storage/StandardDatastream.ts:737`, `src/records/Records.ts:3308` | Metadata saves adopted staged bytes selected by client file IDs, including unbound v5 and foreign actor/brand/record uploads. Pass the authoritative save actor/brand into promotion and verify server-stored tus ownership before reading, copying or deleting staging. Existing primary bytes use an idempotent repair path; same-actor/same-brand pending-record uploads remain supported. | `42e293205` |
| R2-08 | P2 | `src/application/portal/http.ts:292`, `src/configuration/portal.ts:175` | Production composition omitted the IdP logout-origin allowlist, and strict configuration rejected supplying it. OIDC logout therefore left the provider session active. Accept only explicit bare HTTP(S) origins and pass them to the existing logout adapter; document the configuration. | `990ae973c` |
| R2-09 | P2 | `.mocharc.js:10`, `package.json:51` | R1's new real-Mongo notification test entered default core Mocha and failed without its mandatory HTTP fixture URL. Give it a dedicated documented command and exclude it alongside the other isolated real-service suites. It still executes in full real-Mongo qualification. | `a7ca9c9be` |
| R2-10 | P2 | `test/integration/PrismaPersistence.test.ts:103` | The real GridFS cursor fixture supplied a string-returning sanitizer rather than the typed sanitizer result, breaking `typecheck:persistence`. Supply the complete result contract. | `b9b0cc1d7` |
| R2-11 | P2 | `src/forms/ValidatorFormConfigVisitor.ts:252`, `src/visitor/template.visitor.ts:665` and inherited visitor methods | The optional complete strict gate failed with 746 missing-override diagnostics. Add only the compiler-requested modifiers in 11 visitors. These annotations have no runtime effect; the strict gate passes. Baseline-control sources also reproduced the older part of this debt. | `a0a8c3b71` |
| R2-12 | P2 | `test/services/RecordSchemaService.test.ts:65` | Record-schema tests retained partial constructor inputs after production dependencies became mandatory. This caused 69 type errors. Use a complete local fixture factory with explicit unavailable/denial ports, preserve descriptor-based fault injection, and adapt typed role snapshots without changing production requirements. The focused 94-test corpus and its typecheck pass. | `97155ef9a` |

R2-01 covers these 28 source boundaries: `branding/BrandingLogo`, `branding/BrandingTypeface`, `configuration/AppConfigs`, `dashboards/DashboardConfig`, `dashboards/DashboardTypes`, `forms/DomSanitizer`, `forms/FormPayloadPrehydrate`, `forms/Forms`, `integrations/Oni`, `integrations/doi/runtime`, `integrations/figshare/assets`, `integrations/figshare/worker`, `navigation/Navigation`, `pages/Templates`, `queries/NamedQueries`, `queries/Reports`, `queries/Solr`, `records/HarvestRuns`, `records/RecordLists`, `records/Records`, `storage/StandardDatastream`, `storage/StorageManager`, `storage/TusStorageManagerDataStore`, `translations/Translation`, `vocabulary/FigshareVocabulary`, `vocabulary/RvaImport`, `vocabulary/Vocabulary`, and `workflows/WorkflowSteps`.

Qualification-driven cleanup commits `3227b7de9`, `c8a99ecff` and `24a364371` remove unused error bindings, preserve the logger method names during that cleanup, and update private attachment-helper fixtures. `b9b0cc1d7` also changes a reference-equality assertion to value equality for the scoped actor copy. The existing relationship failure test now asserts the bounded diagnostic rather than requiring a raw storage exception. No dependency was added or loosened. All review commits end with the requested GPT-6.1-sol co-author trailer.

## Areas reviewed and judged clean after corrections

- HTTP route/policy parity, public versus protected reads, requested-brand membership and current object/create/workflow grants; identity audit queries filter owning-brand events before normalization and limiting. String and populated role branding both work. The shared actor-context correction covers the sibling harvest/dashboard/form/upload paths.
- Synchronizer CSRF acquisition, origin checks, verified API exemptions, Passport session rotation, fresh actor resolution, login denial and OIDC state/PKCE/replay; provider logout now uses the explicit trusted-origin configuration.
- Multipart/tus/Companion staging, ownership and progress reconnect, streaming abort/error completion and headers-sent behavior. Reviewed internal PDF promotion and multipart-generated keys separately from client-selected staging IDs.
- Encoded path and traversal rejection, extension view/asset manifests, symlinks, root/base-path composition and redirect validation. R1's canonical application URLs are consumed once; browser API bases carry the origin without duplicating deployment roots.
- Detached completion ownership, startup rollback, scoped persistence, supervisor/drain retry, accepted queue completions and cleanup. R1's opaque-Promise join was necessary and is retained; R2 extends the ownership to Observable/Effect results and audit grace timers.
- Finite legacy v5 names and configuration conversion, nested notification-success declarations, queued persisted hooks, storage declared entrypoints and extension-workflow precedence. Opaque record/template data are not recursively rewritten.
- Native Companion's bounded logging adapter: pinned-version and digest checks, temporary import hook, `finally` deregistration, and refusal of preloaded/altered providers. The pinned provider has no public logger-injection port; no installed-file or global console mutation is used.
- Logger call inventories plus targeted AST/text sweeps across owned core and bundled extension code. CLI/browser helper matches were inspected; no additional secret-bearing runtime failure was verified. No speculative finding is reported.
- Source/build/installed retirement closure, exact owned dependency pins, six changed lockfiles' manifest consistency, generated route identifiers, documentation and supervisor-grace examples. Remaining historical package names and finite migration literals are classified rather than treated as executable framework dependencies.

## Disposition and artifact provenance

SR-005/045/049/055 remain unchecked **only because the user has not designated the representative institution**. Its production source/hooks/configuration/topology and reconciliation owner are consequently not supplied. Synthetic institutions, the released-v5 stand-in and local providers do not designate it. No additional acceptance gap is invented and none of those four checkboxes changes.

This round reuses the historical P8 toolchain image `redbox-portal:sr-p8-5088f4a7a-test` (`sha256:2e86451c0651b1102d928a82a20e5c9c5460bb819688580ae06bc5c9835d3658`) and native-browser rehearsal image (`sha256:581f7c6d5fe880e3c6daff909079635ee34d7cf75c93adc35b9bad90ef8806a1`). Current source/tests are mounted, current bundled-extension tests are copied, and rebuilt compiled packages overlay those images. Core was rebuilt again after the annotation fixes. No new image was built. The `5088f4a7a` immutable packs/images and historical Mongo 8/9 topology matrix remain qualification of their original source. This report records full current mounted/compiled-tree suites and does not claim replacement immutable-image or newly repeated topology-matrix proof.

## Full qualification on the corrected tree

Code and tests were qualified at `97155ef9a2f85fed4ff382b83a7713b0b5b237f3`; the final report/task-status commit changes documentation only. The successful full runs followed the last fixture correction. Focused reproductions and earlier failed attempts are not added to full-suite totals. All logs below are under `.tmp/sails-retirement/final-review-r2/` in this checkout.

| Gate | Final result | Evidence log/report |
|---|---|---|
| Full ordinary core Mocha | **4545 passing, 7 existing pending, 0 failures** | `core-default-final.log` |
| All separately collected real Mongo/OIDC/Solr core suites | **208 passing, 0 pending/failures** | `core-real-final.log`, `core-real-files.txt` |
| Isolated Companion process lifecycle | **2 passing** | `CompanionLifecycleProbe-final.log` |
| Real Companion transfer/socket suite | **6 passing** | `CompanionUploadsMongo-final.log` |
| Full root Mocha | **422 passing, 10 existing pending, 0 failures**; teardown has 0 resources, operations, Prisma clients and pools | `root-final.log` |
| Full storage extension | **305 passing** | `storage-final-clean.log` |
| Full developer tools | **52 passing** | `dev-tools-final-clean.log` |
| Full PDF unit suite, repeated at the exact code HEAD | **78 passing** | `pdf-unit-exact-final.log` |
| Full Playwright | **124 passed, 0 skipped/failed**, 460 seconds | `playwright-final.log`, preserved `playwright-full-final.xml` |
| Playwright harness regressions | **19 passed, 0 skipped/failed** | `playwright-harness-final.log` |
| Dedicated retirement browser qualification | **4 passed, 0 skipped/failed**, 19.6 seconds; visible Angular create/edit, real uploads/progress, real Keycloak and accepted-work stop/retry | `retirement-browser-final.log`, `retirement-browser-final.xml` |
| General Bruno | **309 requests, 553 tests, 3 assertions**, all passing | `bruno-general-final.log/xml` |
| OIDC Bruno | **13 requests, 17 tests**, all passing | `bruno-oidc-final.log/xml` |
| S3 Bruno | **7 requests, 12 tests**, all passing; fresh XML and executed-request count independently checked | `bruno-s3-final.log/xml`, `verify-s3-result.cjs` |
| Native Chromium PDF Bruno | **4 requests, 10 tests**, all passing; stored PDF retrieval and successful parent/child integration audit | `pdf-final.log/xml` |
| Actual production host with `/research` deployment root | **1 passed**, fresh/restart, authenticated pages/APIs, GridFS, failed drain and successful retry | `production-host-final.log` |
| Generated, compiled and packed workflows-only institution stand-in | **1 passed**, fresh/restart/drain | `generated-institution-final.log` |
| Compiled finite-name and persisted hook migration qualifiers | **5 passed**, including conversion of 66 built-in declarations and nested notification callbacks | `hook-qualification-final.log` |
| Typechecks | Application, Effect, persistence, complete strict source, record contracts, record-schema tests and root all **exit 0** | `typecheck-*-exact-final.log` |
| Prisma/configuration generated-contract checks | Both **exit 0** | `prisma-check.log`, `portal-config-check.log` |
| Lint/import boundary audit | **0 warnings, 0 errors**, 936 files | `lint-final-clean.log` |
| OpenAPI generation, reference generation and audit | **Exit 0**, 43 published surfaces, 524 advisory findings, no hard failure | `docs-api-final.log`, `docs-generation-final.log`, `docs-audit-final.log` |
| Documentation tests | **4 passing** | `docs-test-final.log` |
| Retirement closure regression controls | **8 passed**, 0 skipped/failed | `closure-tests-final.log` |
| Committed source inventory/closure | 4825 tracked files; 1026 text-candidate files; **0 unclassified, executable or forbidden-dependency violations** | `source-inventory-code-final.json`, `source-closure-code-final.json` |
| Baseline inventory reconciliation | **1261/1261 reconciled**: 742 retained/classified, 136 removed, 365 retained without candidates, 18 dependency metadata | `inventory-reconciliation-code-final.json` |
| Installed compiled-tree retirement closure | **6115 files**, **0 executable violations, 0 forbidden dependency entries** | `compiled-tree-closure-final.json` |
| Exact dependency pins and changed lockfile consistency | **25 manifests / 376 dependency entries / 20 allowed local references / 0 violations**; all **6** changed lockfiles match manifest dependency sections | `dependency-pins.json`, `lockfile-consistency.json` |

The ordinary core collection and the dedicated real-service collection cover every `.mocharc.js` exclusion, with the two Companion files run in separate processes. The 7 core and 10 root pending cases are unchanged baseline cases (disabled/live-provider and legacy-form coverage); they are not reported as passed. The documentation tool's 524 advisory findings are reported as advisories, not hidden or promoted to newly verified feature defects.

The dedicated shutdown scenario persisted **1 aborted session**, **4771/4771 PDF bytes**, multipart bytes and tus bytes. It confirmed deadline failure retained ownership, then successful retry left **0 pools, 0 Prisma clients and 0 upgrade listeners**. Its host closed cleanly. The final browser run followed both prerequisite corrections and passed all four scenarios; the earlier 2-pass/2-failure attempt is not counted.

The run used Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, Mocha **11.7.6**, Playwright **1.64.0**, Bruno CLI **4.2.1**, Puppeteer **25.0.4**, native PDF Chromium **156.0.8078.47**, dedicated browser Chrome for Testing **156.0.8078.4**, MongoDB **9.0.4** and Keycloak **26.5.6**. Provider image identities are preserved in `fixture-images-final.txt`; Compose and P8 digest pins were reused. The isolated Docker daemon was `unix:///run/sr-p7-isolated/docker.sock`. Current application source/tests were mounted into the toolchain container and the five current compiled packages overlaid into Compose/native-browser fixtures. The PDF rehearsal manifest retains the PDF and development-form dependencies installed by the Dockerfile's rehearsal target.

Reproduction uses the existing P8 fixture/reset approach with isolated disposable database names. The local drivers `run-core.sh`, `run-real-core.sh`, `run-root.sh`, `run-storage.sh`, `run-playwright.sh`, `run-production-qualifiers.sh`, `run-bruno.sh`, `run-s3-final.sh`, `run-pdf.sh`, `run-retirement-browser.sh` and `run-final-static.sh` preserve the exact command/environment combinations. Their underlying committed checks are:

```sh
npm --prefix packages/redbox-core test -- --timeout 30000
bash support/integration-testing/run-mocha-express.sh
npm --prefix packages/redbox-dev-tools test
npm --prefix packages/sails-hook-redbox-pdfgen run test:unit
node node_modules/@playwright/test/cli.js test
node --test test/playwright-harness/*.test.cjs
node node_modules/@playwright/test/cli.js test --config support/integration-testing/playwright.sails-retirement.config.ts
# Bruno: committed general/OIDC/S3 Compose profiles and PDF extension Compose profile,
# with current compiled package mounts and existing pinned toolchain/native-browser images.
node --test packages/redbox-core/test/qualification/portal-host.cjs
node --test packages/redbox-core/test/qualification/generated-institution.cjs
node --test packages/redbox-core/test/qualification/record-hook-names.cjs packages/redbox-core/test/qualification/persisted-record-hooks.cjs
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core run typecheck:effect
npm --prefix packages/redbox-core run typecheck:persistence
npm --prefix packages/redbox-core run typecheck:strict
npm --prefix packages/redbox-core run typecheck:record-contracts
npm --prefix packages/redbox-core run typecheck:record-schema-tests
npx tsc --noEmit
npm run check:prisma
npm --prefix packages/redbox-core run check:portal-config
npm run lint
npm run doc:api
npm run docs:generate
npm run docs:audit
npm run docs:test
node --test test/tooling/retire-v5-shims.test.cjs test/tooling/retirement-closure.test.cjs
node support/specs/sails-retirement/evidence/inventory.cjs HEAD
node support/specs/sails-retirement/evidence/retirement-closure.cjs HEAD
node support/specs/sails-retirement/evidence/reconcile-retirement-inventory.cjs <inventory.json> <closure.json>
node support/specs/sails-retirement/evidence/retirement-closure.cjs --tree <installed-compiled-tree>
```

### Failed attempts and rejected evidence

- Initial broad runs exposed the real notification-collection and fixture-typecheck defects above. A first final core run also caught a changed Sinon argument identity in the record-schema fixture; that fixture was corrected in the final amended `97155ef9a` commit, its 94 focused tests passed, and the complete core collection reran successfully. `core-default-fixture-correction-attempt.log` preserves the failed 4544-pass/1-failure attempt.
- Contended runs hit source-import/compiled-host, developer-tools CLI, CSV storage and upload timing limits. The final complete suites ran serially against reset disposable stores and passed. Failed logs remain available; no failed assertion is counted as coverage.
- The first S3 attempt tried to rebuild a read-only compiled overlay. Compose returned a misleading zero exit while its Bruno runner never executed, and copying the old XML could have falsely reported success. That stale report is explicitly rejected (`bruno-s3-rejected-stale.xml`); the build attempt and container logs are preserved. A second attempt stopped before execution because of root-owned report-directory permissions. After correcting only those fixture conditions, the final S3 runner positively executed all 7 requests/12 tests and independently validated a freshly generated report. No S3 test was skipped.
- The first native PDF overlay mounted the base root manifest over the rehearsal manifest, hiding the optional PDF module installed by the Dockerfile. Record creation succeeded but its PDF hook failed and the suite correctly failed. `pdf-manifest-overlay-attempt-*` preserves that result. The corrected fixture declares the image's installed PDF/development-form graph, removes the previous XML before launch and validates exactly 4 requests/10 tests with no failures or skips. The final native PDF run passed without an application-code change.
- Immutable packs/images and the complete MongoDB 8/9 topology/recovery matrix were not rebuilt or rerun in this round. Their historical P8 provenance remains explicit above. These full current mounted/compiled-tree results do not rewrite that historical artifact identity.

- The first dedicated retirement-browser attempt passed Angular record editing and real upload/progress scenarios, then failed two prerequisites: Keycloak displayed `Invalid parameter: redirect_uri`, and the builder's copied Chromium executable refused startup with missing `libatk-1.0.so.0` (ldd identified nine direct and three transitive missing libraries). The failures are preserved in `retirement-browser-*-prerequisite-attempt.log/xml` and `retirement-browser-ldd-attempt.log`. The disposable Keycloak fixture was recreated with its original image/environment plus the exact `/portal/user/login_oidc` callback, and the existing native-browser image supplied the missing libraries. No source or dependency change was made for these fixture corrections.

## Cleanup and final disposition

All round-owned Compose containers/volumes, the six standalone fixture containers and their anonymous volumes, the temporary browser-library extraction container, the `sr-final-r2-profiles` network and its three exact firewall/NAT rules were removed. `owned-containers-remaining.log` and `owned-networks-remaining.log` are empty; firewall rules have no round-owned entries. No images were built, so no round-created dangling images need pruning. Historical images/daemon and unrelated resources were retained. Task-generated Bruno environment/lockfile mutations were restored to the committed versions. The only unrelated untracked path remains `support/specs/graphql-record-metadata/`, untouched.

All requested full suite and closure gates completed successfully after the verified fixes and fixture corrections. No verified code issue remains deliberately unfixed. SR-005/045/049/055 retain their accepted, accurately stated institution-designation gap. The final documentation commit adds this report and updates those status references; it changes no tested application code.
