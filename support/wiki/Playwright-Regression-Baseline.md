# Angular 20 Playwright baseline

Qualified candidate: `179cfe11f8656764c141c5d10b19db04c65531f9`. The report and guide are a later documentation-only commit; no application or test changes intervened between the qualifying runs.

The complete Chromium suite passed three consecutive times against fresh disposable image stacks. Every one of the 21 spec files then passed on its own fresh stack. Each full run completed 117 browser tests covering A01–A19 and F01–F30, plus 19 harness checks. Required cases used one worker and zero retries, with no skips or expected failures.

## Runtime and image provenance

| Field | Observed value |
| --- | --- |
| Candidate commit | `179cfe11f8656764c141c5d10b19db04c65531f9` |
| Test image (`docker image inspect .Id`) | `sha256:b0aaadbf1b1485c23a40354ba61aebbaeb23ff0a7512d4d852d25de8eccb0412` |
| Portal image ID in run metadata | `sha256:b0aaadbf1b1485c23a40354ba61aebbaeb23ff0a7512d4d852d25de8eccb0412` |
| Angular | `20.3.27` |
| Playwright | `1.63.0` |
| Chromium | `153.0.8010.12` |
| Portal Node | `v26.8.2` |
| Runner Node | `v24.20.0` |
| Locale | `en-AU` |
| Timezone | `Australia/Brisbane` |
| Workers | `1` |
| Retries | `0` |

The three image targets were built from an immutable Git archive of the candidate. Image inspection checked all 19 application bundles and shared webpack assets, the compiled scenario seed values, and the absence of the temporary manual-verification labels.

| Target | Docker image ID | Scenario result |
| --- | --- | --- |
| `test` | `sha256:b0aaadbf1b1485c23a40354ba61aebbaeb23ff0a7512d4d852d25de8eccb0412` | 30 compiled scenarios; no generated `e2e-` artifacts |
| `runtime` | `sha256:42bf349f4a3744863f1941690ed105660970c996992f3d41fa0de9548fdd768c` | Development hook and scenario code absent; no generated `e2e-` artifacts |
| `runtime_pdfgen` | `sha256:7bc90eee155b8c401870b6ca70cc8d4e4f13b50ec31b4e55cf4de7dc769dce94` | Development hook and scenario code absent; no generated `e2e-` artifacts |

## Consecutive full runs

| Run | Run ID | Setup seconds | Browser seconds | Total seconds | Result |
| --- | --- | ---: | ---: | ---: | --- |
| 01-full | `mtyptd9z-3ec7e4` | 233.00 | 701.72 | 979.76 | 117/117 browser; 19/19 harness |
| 02-full | `mtyqe6dh-da84f3` | 224.00 | 707.61 | 970.63 | 117/117 browser; 19/19 harness |
| 03-full | `mtyqystb-ef9114` | 218.00 | 702.18 | 952.57 | 117/117 browser; 19/19 harness |

Full artifacts are preserved under `.tmp/playwright/evidence/qualification-179cfe11f/`, with separate command logs, JUnit, HTML reports, completed coverage IDs, portal/stub logs and runtime metadata for every run.

## Independent spec runs

| Spec | Tests passed | Setup seconds | Browser seconds | Total seconds |
| --- | ---: | ---: | ---: | ---: |
| [apps/audit-and-harvest.spec.ts](../../test/playwright/apps/audit-and-harvest.spec.ts) | 2 | 224.00 | 17.59 | 257.94 |
| [apps/configuration-editors.spec.ts](../../test/playwright/apps/configuration-editors.spec.ts) | 2 | 198.00 | 30.01 | 245.21 |
| [apps/csrf.spec.ts](../../test/playwright/apps/csrf.spec.ts) | 1 | 207.00 | 5.62 | 228.74 |
| [apps/dashboard-and-search.spec.ts](../../test/playwright/apps/dashboard-and-search.spec.ts) | 2 | 194.00 | 35.70 | 246.64 |
| [apps/deleted-records.spec.ts](../../test/playwright/apps/deleted-records.spec.ts) | 1 | 203.00 | 12.68 | 231.20 |
| [apps/local-auth.spec.ts](../../test/playwright/apps/local-auth.spec.ts) | 1 | 203.00 | 5.81 | 224.10 |
| [apps/portal-settings.spec.ts](../../test/playwright/apps/portal-settings.spec.ts) | 3 | 198.00 | 36.19 | 251.08 |
| [apps/reports-and-export.spec.ts](../../test/playwright/apps/reports-and-export.spec.ts) | 3 | 193.00 | 29.36 | 239.20 |
| [apps/startup.spec.ts](../../test/playwright/apps/startup.spec.ts) | 38 | 193.00 | 129.50 | 340.44 |
| [apps/users-and-roles.spec.ts](../../test/playwright/apps/users-and-roles.spec.ts) | 2 | 213.00 | 25.21 | 254.83 |
| [apps/vocabularies.spec.ts](../../test/playwright/apps/vocabularies.spec.ts) | 2 | 202.00 | 23.94 | 241.20 |
| [forms/behaviours.spec.ts](../../test/playwright/forms/behaviours.spec.ts) | 6 | 202.00 | 36.16 | 253.68 |
| [forms/components-basic.spec.ts](../../test/playwright/forms/components-basic.spec.ts) | 2 | 193.00 | 32.33 | 240.77 |
| [forms/components-integrations.spec.ts](../../test/playwright/forms/components-integrations.spec.ts) | 5 | 211.00 | 56.35 | 283.90 |
| [forms/concurrency.spec.ts](../../test/playwright/forms/concurrency.spec.ts) | 1 | 193.00 | 15.25 | 224.32 |
| [forms/expressions.spec.ts](../../test/playwright/forms/expressions.spec.ts) | 3 | 192.00 | 24.15 | 231.81 |
| [forms/initialisation.spec.ts](../../test/playwright/forms/initialisation.spec.ts) | 6 | 202.00 | 49.81 | 269.29 |
| [forms/lifecycle.spec.ts](../../test/playwright/forms/lifecycle.spec.ts) | 6 | 207.00 | 57.86 | 280.48 |
| [forms/structure.spec.ts](../../test/playwright/forms/structure.spec.ts) | 3 | 193.00 | 28.96 | 239.10 |
| [forms/validation.spec.ts](../../test/playwright/forms/validation.spec.ts) | 5 | 202.00 | 42.84 | 260.07 |
| [smoke.spec.ts](../../test/playwright/smoke.spec.ts) | 23 | 208.00 | 93.18 | 317.24 |

Each row used its own setup and cleanup; artifacts are preserved under `.tmp/playwright/evidence/independent-specs-179cfe11f/`. All 117 tests passed once across these selections.

## Build, isolation and manual checks

- Fresh registration checks passed for development enabled, integration-test enabled, integration-test disabled, development flag absent, and production opt-in rejected. Enabled starts registered 30 scenarios; disabled/production starts registered zero. Ordinary portal form routes remained usable, and image asset hashes were unchanged after startup. The unchanged registration code was checked before the final seed-data correction; final image inspection separately verified the corrected seed data. All 20 inspected application/shared asset hashes also matched after actual startup of the final candidate during the first qualification run.
- Removing a required image bundle or supplying an invalid application manifest failed preflight before compilation or portal startup. Both production targets exclude the development hook and scenario catalogue.
- The documented mounted workflow listed scenarios, seeded real source/target records and printed usable edit/view URLs. A temporary Angular login paragraph and scenario title both appeared after actual preparation. The logical-row form rendered Alpha/Beta/Gamma correctly and fetched metadata from its owned portal source record. Both F10 branches passed.
- Restoring the two source files caused persistent reuse to reject the stale build. A second actual preparation restored the original UI and exposed the early-input defect described below. After that correction, final complete preparation and all six behaviour tests passed. No build fingerprint was manually rewritten.
- A deliberate final assertion failure in the worked logical-row example produced a readable screenshot, an 8.6-second video and a trace opened in the Playwright trace viewer. The trace showed the real metadata GET returning 200, row removal while the response was held, and passive observation after release. The temporary failing spec was removed.
- Assertion/setup failure probes verified owned-record cleanup and restoration of both prior setting values and prior absence. A real invalid-CSRF restoration failure blocked the next test and persistent reuse; owned records were still purged, the original setting was restored, and stack reset cleared the failure marker.
- Real unhealthy-start and interrupted-browser runs returned nonzero, retained logs and cleaned owned services/data. Unrelated development and integration stacks were preserved. Append-only audit/harvest history is scoped by owned identifiers and removed by disposable database reset.

The manual rebuild uncovered and corrected the host/container fingerprint mismatch for the development bootstrap-data mount and incorrect logical-row seed keys. Cold mounted preparation also required a 30-minute health-check grace period; healthy responses end it early. Image startup retains its shorter grace. Detailed local evidence is in `.tmp/playwright/evidence/manual-workflow/`, `registration-matrix/`, `real-lifecycle/` and the final image-inspection directory.

## CI and merge enforcement

[CircleCI job 145128](https://circleci.com/gh/redbox-mint/redbox-portal/145128) passed the same candidate with all 117 browser tests and 19 harness checks. Its setup took 110.00 seconds and browser execution took 290.97 seconds; the complete wrapper step took 435.11 seconds. The 1,800-second CI timeout is 4.1 times that observed wrapper duration. [Form unit job 145144](https://circleci.com/gh/redbox-mint/redbox-portal/145144) passed 873 tests. All PR checks were green for the candidate. Both ordinary and Dependabot workflows invoke the complete Playwright job.

`develop` requires `ci/circleci: test-playwright`; the rule was applied and verified by reading it back on 2026-09-12, preserving the existing protection settings. [PR 4699](https://github.com/redbox-mint/redbox-portal/pull/4699) contains the implementation.

## Early-input defect found during final verification

The restored mounted run exposed F09 retaining typed input without sending its metadata request. Holding the real compiled-expression response made the race deterministic. A behaviour configured with `runOnFormReady: false` had entered the form-ready feedback guard while waiting for compilation, so it discarded an early broadcast user change. The fix rejects that disabled ready event before entering the guard. The browser case and focused unit regression both failed before the fix; afterwards, 13 behaviour unit tests, three controlled F09 runs and the full six-test behaviour spec passed. Final image qualification above includes the correction. Evidence is retained under `.tmp/playwright/evidence/f09-early-input/`.

## Contract correction

As agreed during implementation, `fetchMetadata` reads a test-owned portal record through `RecordController.getMeta` and the configured storage service. F06–F10 exercise that existing path, including delayed real responses and missing-record recovery. No external-provider capability was added. The [contributor guide](Playwright-Regression-Coverage.md) records the other discovered UI/cleanup contracts and links each product defect to its browser regression and focused diagnostics.
