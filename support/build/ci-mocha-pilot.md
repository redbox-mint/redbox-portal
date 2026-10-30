# Image-backed Mocha host-compilation pilot

The `test-mocha` job omits its seven host compilation commands only when
`pipeline.git.branch` equals **exactly** `chore/circleci-performance`,
`pipeline.git.tag` is empty, and both `npm_publish_mode` and
`docker_publish_mode` are `none`. The existing job and workflow dependencies
remain in place. Similar branch names, Dependabot, other branches, release/RC
tags (even with a chore branch value), npm beta mode and manual Docker mode
retain the original configuration. Manual and beta workflows retain their
existing job selection; this pilot does not add Mocha to either workflow.

Only `compile:sails-ng-common`, `compile:raido`, `compile:rva`,
`compile:agenda-sqs`, `compile:core`, `compile:storage-mongo` and `compile:sails`
are conditional. Host `npm ci --ignore-scripts --strict-peer-deps`, cache
handling, patched Node, refreshed Dependabot checkout, image loading, Codecov
installation, directory setup, timeouts, suite selection, cleanup/exit status,
JUnit storage and coverage preparation/upload remain unchanged. Two guarded
LCOV artifact steps are added as described below. In particular,
coverage still uploads with `when: always`, `--fail-on-error`, the same LCOV
path and `backend-mocha` flag. No publication, approval, branch/tag filter,
image producer, validation gate or coverage threshold changes are part of this
pilot. The new contract checks are run explicitly with the commands below.

## Retained LCOV evidence

Public artifact listings for the completed baseline Mocha/Playwright runs did
not contain LCOV files, so a coverage comparison cannot be made from that
completed pilot. Do not claim coverage equivalence from its green status or
test counts. New runs on the exact pilot branch retain:

| Job | Existing normalized report | CircleCI artifact destination |
| --- | --- | --- |
| `test-mocha` | `coverage/mocha/lcov.info` | `ci-mocha-pilot/mocha/lcov.info` |
| `test-playwright` | `coverage/playwright/lcov.info` | `ci-mocha-pilot/playwright/lcov.info` |

Each `store_artifacts` step has the same compile-time branch/tag/mode guard as
the compilation pilot and follows its job's existing `when: always` coverage
step. `prepare-report.cjs` normalizes the report in place before the unchanged
Codecov upload. CircleCI artifact storage runs after earlier job failures;
adding it does not replace the upload, mask its status, add `|| true`, or change
test/teardown/timeout behavior. If normalization succeeded but upload failed,
the normalized file is still available for artifact storage. If no report was
produced there is no coverage evidence; if normalization itself failed, a file
retained at that path must not be treated as successfully normalized. Existing
JUnit and Playwright diagnostic artifacts stay in place.

Both comparison runs must retain reports. For a new baseline on the pilot
branch, restore only the seven host compilation commands and retain these two
artifact steps. Compare it with the pilot at identical application/test source
and image identity. This adds evidence for future comparisons; it cannot
recover missing reports from completed workflows. No other branch, release,
Dependabot or manual/beta workflow gains artifact storage.

## Why these commands can be piloted separately

`npm run test:mocha:ci` selects the `portal` profile and `redboxportal` service
in `support/integration-testing/docker-compose.mocha.yml`. CircleCI loads the
build job's image archive and sets `RBPORTAL_IMAGE=redbox-portal:test`. This
service runs `support/integration-testing/run-mocha-redbox.sh` **inside that
image**. Its application packages, `node_modules`, compiled `api` and assets
come from the image, with no host mount over those paths or the application
root. The exhaustive mount contract test uses real Compose rendering.

The portal mounts host `test`, `support`, `typescript`, `tsconfig.json`, three
specific config fixtures and development bootstrap data. Output mounts cover
Mocha coverage, backend JUnit and attachments. The `mount` development profile
is different and is not evidence for this pilot. Neither the prebuilt Compose
override nor asset-reuse settings are enabled: current in-container startup,
Webpack, shim generation, bootstrap and test discovery still run as before.
Host dependency installation remains because host report preparation still
uses it. Removing host compiles is not evidence to remove `npm ci`.

## Local config checks

Run from the repository root with Node, installed root dependencies (`js-yaml`),
Docker Compose v2, and the CircleCI CLI available. Compose rendering needs no
daemon or images. No command below starts containers, builds/publishes images,
uploads coverage or writes to an external application.

```bash
node --test support/build/ci-mocha-pilot.test.cjs support/build/circleci-config.test.cjs support/build/ci-performance.test.cjs support/build/ci-arm64-pilot.test.cjs
circleci config validate .circleci/config.yml
node support/build/ci-mocha-pilot.validate.cjs
```

The JSON contract records both original jobs in full, including report,
coverage and failure behavior. The focused tests assert that restoring the
conditional compile step and removing the guarded artifacts reconstructs those
jobs exactly, exercise all 176 branch/tag/mode combinations, render the exact mount ledger, and execute the
actual CI npm command against controlled Compose success/test-failure/cleanup-
failure cases. Artifact contracts assert both exact paths, exact eligibility,
placement after normalization/upload, and unchanged `always`/`--fail-on-error`
behavior. Existing CircleCI tests cover suite and publication gates.

The validation script runs CircleCI validation and 17 pairs of full config
expansions: exact chore, suffix, nested, prefix, newline, develop, master,
support, feature, Dependabot, empty branch, release, RC, chore-plus-tag, beta,
manual, and both publication modes. It substitutes only Git branch/tag values
in temporary files, then lets the CircleCI compiler resolve conditions,
parameters, commands, workflows and matrices. Each entire expansion must equal
the original-job expansion, with only the compile step removed and the two
LCOV artifact steps added in the one eligible case. Fixtures and expanded YAML
are retained under the printed
`/tmp/redbox-ci-mocha-expansions-*` directory. CircleCI compilation resolves
public orbs using read-only network requests.

For a full source-config comparison, pass a saved **pre-edit** config as the
optional argument:

```bash
node support/build/ci-mocha-pilot.validate.cjs /tmp/pre-pilot-circleci.yml
```

That comparison rejects any changes outside the compile-step wrapper and two
guarded artifact additions, including publication settings. Do not refresh the
original-job JSON to hide
an unintended contract change.

## Required image-backed comparison before widening the pilot

Config checks establish isolation, not runtime or coverage equivalence. Keep
this branch gate until all of the following evidence has been collected in
fresh, separate checkouts/runners. Do not clean or run these suites in a shared
working tree containing someone else's changes.

1. Use identical application/test sources and the same test-image archive for
   a baseline with the seven host compiles and a pilot without them. Only the
   compile-step wrapper should differ; keep the two guarded LCOV artifact steps
   in both comparison configs. Record source revision/tree, lockfile
   hashes, Node/npm and Compose versions, image archive hash, loaded image ID
   and image provenance. Do not substitute a development image or use the
   `mount` profile. Start with a clean checkout, without ignored compiled
   outputs, host package `dist`, stale coverage, JUnit or attachment output.
2. Run the complete `test-mocha` preparation and `timeout 1800s npm run
   test:mocha:ci` in both runners. Preserve host `npm ci` and the original
   baseline compilation order. Use identical CI, external-service versions,
   secrets and test-selection settings; leave `RBPORTAL_MOCHA_TEST_PATHS` empty
   and live integrations at their ordinary default. The pilot must succeed
   without host compilation artifacts. Record startup logs and actual selected
   image/profile to rule out a fallback to mounted host code.
3. Retain `.tmp/junit/backend-mocha/backend-mocha.xml` and compare the full
   discovered test identity set (suite/class/name), total tests, passes,
   failures/errors and skipped/pending counts. Require equal counts and test
   identities, zero unexpected failures and no new skips. Bootstrap and the
   complete integration suite must remain present. A faster green run with
   fewer tests is not acceptance evidence.
4. Retain raw `coverage/mocha/lcov.info` and the result of the unchanged
   `prepare-report.cjs` step. Compare normalized `SF` source identities and
   per-file/aggregate `LF/LH`, `FNF/FNH` and `BRF/BRH` totals, covered line,
   function and branch identities, plus line/statement/function/branch
   summaries wherever emitted. Require equal instrumentation/file scope and
   no unexplained coverage decrease; investigate any nondeterministic hit
   differences. Missing/empty LCOV or missing package files fails acceptance.
   Check that the ordinary Codecov upload uses the same file, flag, tested
   revision and failure behavior. Config contract tests alone cannot establish
   those runtime results.
5. In a disposable image-backed run, deliberately fail a selected test and
   verify nonzero job status survives Compose teardown, JUnit remains stored,
   the always-run coverage step is attempted, upload failures remain fatal,
   and the validation/publication dependency gate remains blocked. Retain
   timeout and failure logs. Keep the ordinary 1800-second suite timeout and
   30-minute no-output timeout.
6. Record repeated baseline/pilot job durations and separate host compile time
   from image load, suite and coverage upload. Report paired counts, coverage,
   image/source identity and failures alongside timing. A single timing sample
   or historical run with different sources is insufficient to expand scope.

Full clean-checkout/image-backed runs and external uploads are intentionally
separate from local config verification. They are required pilot acceptance
evidence, not results claimed by these contract tests.

## Rollback

In `test-mocha`, replace the commented `unless` wrapper with its enclosed `run`
step at the original indentation/location. Keep the seven-command string
unchanged. This restores unconditional host compilation on every event without
changing any workflow or publication settings. To retire the entire pilot,
also remove the guarded LCOV `when` blocks from both Mocha and Playwright.
Keep them temporarily if needed to collect a fresh baseline comparison. Remove the new
`support/build/ci-mocha-pilot*` files when retiring the pilot, then validate the
config and run the existing CircleCI contract tests. For an immediate check,
the restored jobs must equal their entries in `ci-mocha-pilot.contract.json`
exactly once both artifact additions are also removed.
