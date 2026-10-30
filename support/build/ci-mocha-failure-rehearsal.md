# Default-off Mocha compilation-removal failure rehearsal

Implementation is ready for review; **the live rehearsal is still required**.
Local tests use controlled commands and synthetic reports/API responses. They
are not successful integration runs, CircleCI results, coverage equivalence,
proof of artifact ingestion, or acceptance evidence for widening the pilot.
No CircleCI pipeline, upload, publication, commit or push is needed for the
local checks below. Do not record live results until they actually exist.

This implements the deliberate-failure experiment required by
[`ci-mocha-pilot.md`](ci-mocha-pilot.md), using the existing image-backed
`portal` profile, test-image archive, complete integration suite, bootstrap,
1800-second suite timeout and 30-minute no-output timeout. It omits the same
seven host compiles as the candidate. It does not enable the prebuilt-image
override, asset reuse, mount profile, alternate test paths or live-service
settings. Existing uncommitted Docker/image work is outside this change.

## Isolation and authorization

The new pipeline Boolean `ci_mocha_failure_rehearsal` defaults to `false`.
Only this exact combination enables `mocha_failure_rehearsal`:

```json
{
  "branch": "chore/circleci-performance",
  "parameters": {
    "ci_mocha_failure_rehearsal": true,
    "npm_publish_mode": "none",
    "docker_publish_mode": "none"
  }
}
```

There must be no tag. Suffixes, prefixes, nested branches, trailing newlines,
master/develop/support, Dependabot, release/RC tags and either publication mode
cannot schedule the rehearsal. Every invocation also has an exact branch
filter and rejects tags. The test helper independently checks the opt-in,
CircleCI/CI environment, branch/tag, modes and selected image before injection,
and again before execution and report capture. It rejects test-selection,
Compose and prebuilt/debug overrides. It refuses existing fixture, LCOV,
JUnit or evidence paths without deleting/overwriting them.

The workflow has only these jobs:

1. `build-mocha-failure-rehearsal`: an alias of the existing **build-only** job;
   produces the ordinary test-image archive in this workflow's own workspace.
2. `test-mocha-failure-rehearsal`: loads that archive, runs safeguard tests,
   adds the intentional failure and runs the full suite without host compiles.
3. `validation-complete-mocha-failure-rehearsal`: an invocation of the existing
   validation sentinel, with a success-only requirement on the failing job.
   This sentinel must remain blocked/not run.

There are no publication jobs, contexts, SSH keys or publication commands in
this workflow. Under the eligible event, existing npm, Docker, manifest, wiki
and documentation publishers are also excluded by their unchanged workflow
conditions, branch/tag filters and dependency scheduling. Existing Dependabot
deploy invocations have every dependency filtered out on the chore event, so
CircleCI does not execute them; the new contract checks that entire dependency
set, rather than assuming a single filtered dependency blocks a job. Passing publication parameters disables
this rehearsal; it does **not** alter or disable the existing manual/beta
publication workflows. An invalid rehearsal opt-in on another event is not a
global publication interlock.

Ordinary workflows still run alongside an enabled rehearsal, in their own
workspaces/runners. `test-mocha`, the baseline comparison, `validation-complete`,
their dependencies and required status names remain unchanged. The ordinary
gate can pass; the corresponding **rehearsal** gate must block and the rehearsal
workflow must fail. No branch protection changes are required. This experiment
tests CircleCI's existing success-dependency behavior on a disposable sentinel;
it does not claim a live failure of the production publication gate. The
existing gate's complete Mocha dependency and publication edges remain covered
by the existing contracts. Do not treat the failing rehearsal as a green
baseline/candidate comparison sample.

## Failure and evidence handling

`ci-mocha-failure-rehearsal.fixture.txt` lives outside normal discovery and is
never copied by normal startup. The authorized helper copies it with exclusive
creation to
`test/integration/services/ci-mocha-failure-rehearsal.generated.test.ts` only in the
disposable runner. The default full-suite glob picks it up, alongside all
ordinary tests and the unchanged bootstrap. It first checks that Sails lifted
and the image-backed RecordsService loaded, then fails an assertion containing
`CI_MOCHA_FAILURE_REHEARSAL_2026: intentional integration assertion`.
Bootstrap failure or a matching test name without this assertion is insufficient.

The shell wrapper runs the actual `timeout 1800s npm run test:mocha:ci` command.
That npm script retains Compose `up` status across `down`. The wrapper captures
both `PIPESTATUS` entries after `tee`, records the original suite status and
returns that same nonzero status, including timeout status. Unexpected zero
also fails the job, while the retained zero makes verification reject the run.
It never translates the deliberate failure into success. Cancellation or
infrastructure failure may prevent evidence capture and is not acceptance.

After a failure, `when: always` steps independently retain raw reports, run
the unchanged coverage normalization/upload command (`--fail-on-error`,
`backend-mocha`, same LCOV path), and retain prepared reports. The rehearsal
therefore attempts a real Codecov upload during its later authorized live run;
the local checks never upload. It does not weaken coverage thresholds, swallow
upload failures or replace normal uploads. A normalization/upload error remains
fatal. Prepared-path retention alone does not prove normalization succeeded;
independent verification also requires that coverage action to succeed.

CircleCI `store_artifacts` follows these always-run steps and
`store_test_results` retains the ordinary `.tmp/junit` ingestion path. Under
artifact destination `ci-mocha-failure-rehearsal`, retain:

- `identity.json`: source revision/tree, workflow/job identity, image ID/archive
  hash, tool versions, fixture hash and relevant input hashes.
- `injected-fixture.txt`, `suite.log` (including Compose output/teardown) and
  `suite-status.json` (actual suite and tee statuses).
- `raw-lcov.info`, `raw-backend-mocha.xml`, `raw.json` before normalization.
- `prepared-lcov.info`, `prepared-backend-mocha.xml`, `prepared.json` afterward.

Missing reports do not prevent the other report from being copied; their
manifest records the error and the capture step fails. No empty report is
manufactured. Reports are copied exclusively and checksummed, never repaired
to make verification pass. The generated fixture is left in the discarded
runner for diagnosis, and is never persisted to another workflow/workspace.

## Local verification (offline, no containers started)

Run with installed root dependencies, Node, Bash, GNU timeout, Python 3 and
Docker Compose v2. Compose is used only to render the existing mount contract;
the wrapper tests replace Docker with controlled commands in temporary trees.

```bash
bash -n support/build/ci-mocha-failure-rehearsal.sh
node --test support/build/ci-mocha-failure-rehearsal.test.cjs support/build/ci-mocha-pilot.test.cjs support/build/ci-mocha-baseline.test.cjs support/build/circleci-config.test.cjs support/build/ci-performance.test.cjs support/build/ci-arm64-pilot.test.cjs
```

The new tests independently remove the two new job declarations, parameter and
workflow and require the **entire parsed original config** to match its pre-edit
SHA-256 contract. The YAML build anchor has no semantic effect. This checks all
ordinary jobs, workflows, parameters, filters, status names, gate edges and
publication behavior without refreshing existing contracts. Other checks cover
all branch/tag/mode/opt-in combinations, runtime refusal, exclusive injection,
test failure with both successful/failed teardown, unexpected suite success,
timeout status, fatal normalization/upload failures, report corruption and
independent verifier rejection of a successful sentinel or any publisher.
Synthetic evidence exists only in temporary test directories.

The contract digest is a pre-edit snapshot, not a generated expected result
from the implementation. For a later intentional unrelated config change,
review the reconstructed config against the original and explicitly update
this rehearsal-specific digest; never update it to silence an unexplained
failure. Existing pilot/baseline contracts must not change for this rehearsal.

## Required later live run and independent verification

These are instructions for a separately authorized run, **not executed results**.

1. Use a fresh disposable CircleCI checkout on the exact chore branch containing
   the reviewed files. First validate/process the configuration with CircleCI,
   retaining the expanded YAML and source revision. CLI processing may resolve
   public orbs over the network; it was intentionally not run as part of this
   offline implementation task. Check that the normal statuses retain their
   names and that the new sentinel requires the failing rehearsal job.
2. Explicitly trigger the parameter combination above on that revision, without
   overrides. Record pipeline/workflow URLs, tested revision, archive hash and
   image ID. Confirm the build-only producer succeeded and the job selected
   `portal`/`redboxportal`, not mounted host code or prebuilt overrides. Inspect
   logs for bootstrap completion, complete discovery and the intentional
   assertion. Compare ordinary test identities/counts/skips with a green full
   suite at the same application/test/image identity (accounting for exactly
   one extra failing test). No widening or suite-equivalence claim follows
   from this failure run alone.
3. Confirm the suite action and job are failed with the retained nonzero code
   after successful teardown; reject timeout, cancellation, bootstrap failure
   or unrelated failing tests as acceptance evidence. Inspect the suite log
   and teardown output. Confirm raw capture, always-run normalization/Codecov
   upload, prepared capture, JUnit ingestion and artifact storage all ran.
   An upload failure is still fatal, but investigate it before accepting the
   complete live rehearsal. Preserve its action log and upload receipt.
4. Inspect the actual workflow graph/UI and API: rehearsal workflow failed;
   `validation-complete-mocha-failure-rehearsal` blocked/not run with no start
   time; no publication job. Inspect **every other workflow in the pipeline**
   to confirm no npm, Docker/manifest, wiki or docs publication was scheduled.
   Preserve the processed graph and relevant API responses. Do not infer
   live scheduling/ingestion from local contracts or a report file alone.
5. Download the artifact directory without renaming its files. Run the separate
   Python verifier (stdlib XML parser, independent of the Node writer):

   ```bash
   python3 support/build/ci-mocha-failure-rehearsal.verify.py /path/to/downloaded/ci-mocha-failure-rehearsal
   ```

   This checks recorded status, fixture/report hashes, parseable JUnit, exactly
   one intended assertion failure, unchanged JUnit across preparation and real
   application LCOV records. Reports-only success explicitly leaves live
   scheduling, ingestion, gate blocking and uploads **unverified**.
6. Independently fetch and retain actual CircleCI API responses, using the
   workflow ID and job number in `identity.json`. Store these JSON files in a
   separate evidence directory (substitute the actual project slug/IDs):

   | File | Read-only CircleCI endpoint |
   | --- | --- |
   | `workflow.json` | `GET /api/v2/workflow/{workflow-id}` |
   | `workflow-jobs.json` | `GET /api/v2/workflow/{workflow-id}/job` |
   | `job-details.json` | `GET /api/v1.1/project/{vcs}/{org}/{repo}/{job-number}` |
   | `artifacts.json` | `GET /api/v2/project/{project-slug}/{job-number}/artifacts` |
   | `tests.json` | `GET /api/v2/project/{project-slug}/{job-number}/tests` |

   Fetch every page; combine `items` arrays and clear `next_page_token` only
   once all pages have been retained. Never synthesize a blocked gate entry
   if the API omits it: preserve the UI/graph evidence and investigate the
   actual API representation before extending the verifier. Missing fields or
   unexpected statuses fail closed. Keep authentication secrets outside the
   evidence. Also preserve individual step logs and all pipeline workflows;
   the verifier does not fetch anything or attest that input JSON came from
   CircleCI.

   ```bash
   python3 support/build/ci-mocha-failure-rehearsal.verify.py /path/to/downloaded/ci-mocha-failure-rehearsal --circle-evidence /path/to/circle-api-evidence
   ```

   Require an independent reviewer to check API provenance, source/image
   identity, complete test discovery, coverage upload receipt, processed config,
   original required status names and publication absence across the pipeline.
   The Python check validates the supplied failed job/workflow, original exit
   code, successful always-run coverage action, blocked sentinel, artifact
   listings and CircleCI-ingested intentional JUnit failure. It cannot prove
   provenance, all-pipeline publication isolation or a registry's remote state
   from supplied files. Keep the live checklist open until that review is done.

## Disable and rollback

For immediate disablement, omit `ci_mocha_failure_rehearsal` or pass `false` on
future pipelines. It is already default-off. Cancel any already-enabled run
separately; changing a future parameter does not cancel running jobs.

For complete removal, delete `workflows.mocha_failure_rehearsal`,
`parameters.ci_mocha_failure_rehearsal`, `jobs.build-mocha-failure-rehearsal`
and `jobs.test-mocha-failure-rehearsal`; remove only the
`&ciMochaFailureRehearsalBuild` anchor from the existing `build:` declaration.
Delete the new `support/build/ci-mocha-failure-rehearsal.*` files once evidence
has been archived. Run the existing config/pilot/baseline contracts and validate
the config. This restores the complete parsed pre-edit config; no normal job,
coverage upload, gate, publication filter, Dockerfile, Compose file, image
helper or package file needs editing. This rollback does not undo the original
compilation-removal pilot, whose separate rollback remains in its own runbook.

If manually inspecting a failed disposable runner, retain its evidence first.
Remove only the generated fixture named above after confirming its contents
match the template; discard that runner afterward. Never run the injector,
cleanup or integration suite in a shared working tree with uncommitted changes.
