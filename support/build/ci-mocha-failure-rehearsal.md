# Default-off Mocha failure rehearsal and same-image green control

The four-job paired experiment is implemented; **its live behavior remains
unverified**. Local checks use controlled commands and synthetic API responses,
plus the installed Mocha JUnit reporter on small simulated tests. They do not
run the application integration suite or establish coverage equivalence,
CircleCI ingestion, upload processing or publication isolation.

The historical three-job rehearsal is recorded in
[`mocha-failure-rehearsal-13587.json`](../specs/circleci-performance/mocha-failure-rehearsal-13587.json).
Its comparison green job used a different image ID/archive hash. That record
is not evidence for the new same-image comparison. Historical verification
remains available without `--paired`; its sentinel checks still accept terminal
`not_run` entries with populated timestamps, reject duplicate job identities,
and require the exact success-only dependency on the failed job.

This extends the deliberate-failure experiment in
[`ci-mocha-pilot.md`](ci-mocha-pilot.md). Both consumers use the existing
image-backed `portal`/`redboxportal` profile, complete ordinary integration suite,
bootstrap, `npm run test:mocha:ci` command with a 1,800-second process-group
deadline and 35-minute no-output timeout. Both omit the candidate's seven host compiles. Neither enables asset
reuse, prebuilt-image overrides, mounted application packages, selected test
paths or live-service testing. Unrelated Docker/image work is outside this change.

## Isolation and scheduling

`ci_mocha_failure_rehearsal` still defaults to `false`. The same explicit opt-in
now schedules the green control as the fourth job; there is no separately
scheduled control or ordinary-workflow dependency. Only this exact combination
can enable `mocha_failure_rehearsal`, with no tag:

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

All four invocations also require the exact branch filter and reject all tags.
The runtime helper independently checks CircleCI/CI, opt-in, branch/tag, modes,
job/workflow identity, selected image and forbidden test/Compose/debug/live
and reporter overrides before authorization and suite preparation. Each consumer's
`authorize` action records job/workflow-bound authority and an exclusive, read-only snapshot
of the Compose definition in a sibling `-authorization` directory. This happens
before image/input validation; it grants only diagnostic capture and teardown,
never permission to execute an unvalidated suite. It refuses
existing fixture, report or evidence paths without deleting/overwriting them.

The workflow contains exactly:

1. `build-mocha-failure-rehearsal`: the ordinary build-only steps with additional
   authorization and producer identity capture. It saves the ordinary image
   archive and a producer receipt into this workflow's workspace.
2. `test-mocha-failure-rehearsal`: requires that producer's success, loads its
   archive, independently verifies identity, injects the deliberate failure and
   runs the complete suite. It retains the ordinary fatal Codecov upload.
3. `test-mocha-failure-rehearsal-control`: independently requires the **same**
   producer's success, loads its archive, verifies identity and runs the ordinary
   complete suite **without injection**. It normalizes and retains coverage but
   does not install Codecov or upload another report.
4. `validation-complete-mocha-failure-rehearsal`: the existing disposable
   sentinel invocation. Its unchanged success-only dependency is solely on
   `test-mocha-failure-rehearsal`. It must remain blocked/not run even when the
   control succeeds. The control has no edge to the sentinel or publication.

There are no publication jobs, contexts, SSH keys or publication commands in
this workflow. Ordinary workflows, required status names, Mocha/baseline jobs,
validation gates and publication dependencies/filters remain unchanged. Under
the eligible event, existing npm, Docker/manifest, wiki and documentation
publishers are excluded by their existing conditions, filters and dependency
scheduling. Contracts check the complete dependency set of the existing
Dependabot deploy invocations. Publication parameters disable this experiment;
they do not change existing manual/beta publication workflows. An invalid
rehearsal opt-in on another event is not a global publication interlock.

Ordinary workflows may run alongside the experiment in their own workspaces.
Their gate may pass; the rehearsal workflow must fail and its own sentinel must
block. This tests a disposable success dependency, not a live failure of the
production publication gate. It is not a new baseline/candidate timing sample
or authorization to widen the compilation-removal pilot.

## Independent producer and consumer identity

After saving the image, the producer measures its clean checked-out revision,
Git tree, `sha256sum` of the saved archive, and Docker image ID. It records
schema version 2, workflow ID, job ID/name/number, event, trusted fixture hash,
and actual relevant input hashes. Inputs include Dockerfile/.dockerignore,
Node version file, config, package/lock/TypeScript files, the helper/wrapper,
and tracked tests, TypeScript, config, integration/unit support and bootstrap
data. Git cleanliness rejects tracked modifications and untracked source files.
Ignored generated build outputs are not a complete filesystem attestation.

Producer evidence is stored as
`ci-mocha-failure-rehearsal-producer/identity.json`; identical bytes are persisted
alongside the archive as `docker-images/test/mocha-rehearsal-producer.json`.

Each consumer independently measures its own checkout/tree, input hashes,
archive SHA-256 and **loaded** image ID and compares them with the receipt.
Missing evidence or mismatches stop execution. Consumers must have distinct
job IDs/numbers from the producer; the paired verifier checks uniqueness across
all three identities. Both retain their own Node/npm/Compose versions, a copy
of `producer.json` and its SHA-256. The helper remeasures inputs and image
identity before execution and when recording status/reports. Validation failure
blocks execution, but previously authorized diagnostic capture continues with
`validation.valid: false` and the error retained. Those commands still fail;
retained bytes do not become accepted evidence. The failure consumer verifies
the generated fixture; the control refuses its presence.

## Failure, status, reports and teardown

`ci-mocha-failure-rehearsal.fixture.txt` remains outside normal discovery. Only
the authorized failure consumer copies it, with exclusive creation, to
`test/integration/services/ci-mocha-failure-rehearsal.generated.test.ts`. The
ordinary full-suite glob discovers it. It first requires successful Sails
bootstrap and the image-backed RecordsService, then fails with
`CI_MOCHA_FAILURE_REHEARSAL_2026: intentional integration assertion`.
A matching marker with a bootstrap error is insufficient.

The wrapper invokes a Node supervisor outside the detached npm/tee process
group. On ordinary completion it retains both `PIPESTATUS` entries and records
the actual suite and logging status even when post-suite validation fails. A
preflight rejection records null statuses, meaning the suite and tee never ran.
Both roles return the original nonzero suite status. The control returns zero
only after successful suite/status/log capture and process-group completion.
Unexpected zero still fails the failure consumer. The supervisor bounds the
**complete** npm/output group at 1,800 seconds, sends SIGTERM, then SIGKILL after
five seconds, including workers whose leader already exited. Both rehearsal suite steps use a 35-minute CircleCI inactivity limit, leaving time beyond the supervisor deadline for escalation and status capture. Timeout records
suite exit 124; if killing the pipeline prevented `PIPESTATUS` capture, the
logging exit is null rather than invented. `suite-status.json` retains deadline,
leader exit/signal, surviving descendants, remaining group state, authorized
project/hash and post-run validation. Paired verification requires successful
supervision in addition to the original suite/report checks. Historical report
verification still accepts the original timeout-command evidence.

The existing npm command preserves Compose `up` status across its `down`.
Within the rehearsal only, a PATH adapter routes **both** operations through
the authorized snapshot and pinned `integration-testing` project, with the
original project directory/profile and ordinary up/down arguments. This leaves
the npm script and ordinary jobs unchanged. The adapter rechecks authority on
every call. It strips Compose overrides and disables `.env` loading, so checkout
changes during `up` cannot redirect the built-in `down` or change its project.
Both consumers additionally run an always-run bounded
`docker compose --project-name integration-testing --project-directory
./support/integration-testing --profile portal -f <authorized-snapshot> down -v
--remove-orphans --timeout 180` using the same definition/project/environment
policy. Preparation binds the snapshot hash to the measured Compose input;
paired verification checks that hash and project in suite and teardown evidence.
Identity/input validation runs **after** the cleanup attempt, so its failure
cannot suppress cleanup or its log/status. Missing or changed authorization
permits no Docker cleanup.

Standalone cleanup has a 240-second deadline, five-second SIGTERM grace period,
process-group SIGKILL and at most one second to observe completion. Output goes
directly to `teardown.log`. Leader exit alone is insufficient: live group members
trigger TERM/KILL and a failed teardown, even after leader exit zero.
`teardown-status.json` retains exit, signal, spawn errors, timeout, surviving
workers, remaining group state and validation. These failures remain fatal
independently of the suite status. The Linux `/proc` check excludes dead zombies
awaiting init reaping; tests require each recorded process to be gone or dead.
The bound covers descendants in the supervised process group; deliberately
escaped sessions and uninterruptible kernel tasks are outside that guarantee.
A still-live group after escalation is explicitly recorded and fails validation.
Identity subprocesses also have 30-second SIGKILL deadlines.
Cancellation/infrastructure failure that kills the supervisor can prevent
capture and is not acceptance evidence.

After execution, always-run steps independently copy raw JUnit/LCOV, run
coverage preparation, and copy prepared JUnit/LCOV. The failure job's ordinary
upload command is unchanged (`--fail-on-error`, `backend-mocha`, same LCOV path)
and still attempts one real upload during a later authorized live run. The
control only normalizes; normalization errors remain fatal. Neither role
repairs missing reports or manufactures empty ones. Each independent copy is
exclusive and checksummed; a missing report is recorded in the manifest and
fails capture while retaining the other report if available. Authorized raw and
prepared copies continue after validation failure, marking each manifest invalid
and returning nonzero. No identity or report is repaired to make evidence pass.

Both jobs retain `.tmp/junit` via `store_test_results` and artifact directories:

- Failure: `ci-mocha-failure-rehearsal`.
- Control: `ci-mocha-failure-rehearsal-control`.

Each directory contains `identity.json`, `producer.json`, `suite-status.json`,
`suite.log`, `teardown-status.json`, `teardown.log`, `raw.json`, `prepared.json`,
`raw-lcov.info`, `prepared-lcov.info`, `raw-backend-mocha.xml` and
`prepared-backend-mocha.xml`. Only the failure directory also contains
`injected-fixture.txt`. The fixture stays in its discarded runner and is never
persisted to another consumer/workflow.

## Local and configuration verification

Use installed dependencies, Node from `.nvmrc`, Bash, Linux `/proc`, Python 3,
Docker Compose v2 (rendering only) and the CircleCI CLI:

```bash
bash -n support/build/ci-mocha-failure-rehearsal.sh
node --test support/build/ci-mocha-failure-rehearsal.test.cjs support/build/ci-mocha-pilot.test.cjs support/build/ci-mocha-baseline.test.cjs support/build/circleci-config.test.cjs support/build/ci-performance.test.cjs support/build/ci-arm64-pilot.test.cjs
node support/build/ci-mocha-failure-rehearsal.validate.cjs
circleci config validate .circleci/config.yml
circleci config process .circleci/config.yml > /tmp/mocha-rehearsal-default.processed.yml
circleci config process .circleci/config.yml --pipeline-parameters 'ci_mocha_failure_rehearsal: true' > /tmp/mocha-rehearsal-enabled.processed.yml
```

Validation/processing can resolve public orbs over the network; they do not
start CircleCI runs. Local tests start no application containers and perform
no uploads, commits, pushes or publication. Controlled Docker commands exercise
the real npm/Compose shell flow, and real Compose rendering checks every
cleanup after project/source/`.env` mutation. Real child processes exercise
SIGTERM resistance, leader exit with surviving workers, and output-worker
timeouts with final status capture. Compose rendering starts no services. Small simulated suites exercise the installed
Mocha reporter, including duplicate emitted identities and omitted pending
tests; they are not successful application integration runs.

Contracts remove only the three rehearsal job declarations, parameter and
workflow and require the entire parsed ordinary config to retain its original
SHA-256. The original digest is unchanged. The contract also lists the exact
four paired invocation names and checks original producer build steps,
consumer setup, sentinel dependency, branch/tag/mode combinations, publication
isolation and absence of an extra control upload. Existing pilot/baseline
contracts must not be refreshed for this change. The read-only validator processes
ten explicit event/parameter cohorts, verifies the paired dependencies and
compares each complete ordinary expansion with the reconstructed original
config. Its fixtures and outputs stay in a temporary directory. Any unrelated future digest
change needs separate review; never update it to silence an unexplained failure.

## Required later live run and independent verification

These are instructions, **not executed results**.

1. In a fresh disposable CircleCI checkout of the reviewed revision on the exact
   chore branch, validate/process config and retain expanded YAML. Confirm the
   default is off, ordinary statuses/edges are unchanged, both consumers require
   one producer and the sentinel still requires only the failed suite's success.
2. Separately authorize/trigger the opt-in combination above. Retain pipeline,
   workflow and job URLs and revision. Inspect all three measured identities,
   image/archive hashes and inputs. Confirm the correct image/profile, bootstrap
   and complete discovery in both consumers. Require a green control and exactly
   the intended assertion failure, with ordinary nonzero exit (not timeout,
   cancellation, bootstrap failure or unrelated failing tests).
3. Inspect suite/teardown logs, both raw and prepared captures, successful cleanup
   statuses, the failure job's successful normalization/upload and its receipt,
   the control's successful normalization with no upload, JUnit ingestion and
   artifacts. A queued Codecov receipt does not establish later processing.
4. Inspect the actual workflow graph/UI/API: producer/control succeed, failure
   job/workflow fail, sentinel blocked/not run with the exact success dependency.
   `not_run` may have timestamps. Preserve the processed graph and inspect **all
   other workflows in the pipeline** for publication absence; supplied local
   config and the rehearsal's graph alone are insufficient.
5. Download all three artifact directories without renaming their files. Use
   the reviewed independent Python verifier and matching trusted fixture:

   ```bash
   python3 support/build/ci-mocha-failure-rehearsal.verify.py /evidence/ci-mocha-failure-rehearsal \
     --paired \
     --control-directory /evidence/ci-mocha-failure-rehearsal-control \
     --producer-directory /evidence/ci-mocha-failure-rehearsal-producer
   ```

   Explicit paired mode requires both directories and schema-2 producer and
   consumer evidence; it never falls back to historical checks when data are
   missing. It validates distinct role/job identities, equal workflow/revision/
   tree/image/archive/input hashes, matching producer receipt bytes/hashes,
   matching consumer tools, retained statuses, reports/hashes, application LCOV,
   unchanged raw/prepared JUnit, explicit successful validation of suite/status,
   raw/prepared manifests and teardown, and successful non-timeout teardown.
   The injected fixture
   hash must match the reviewed local template and its recorded input hash.

   It requires the exact deliberate suite/classname/full testcase title and
   exactly one assertion failure. Removing that one authenticated case must
   leave an **exact multiset** of emitted suite name/file, testcase
   classname/name/file and outcomes equal to the green report, including
   duplicate multiplicities. Each suite's declared tests, failures, errors and
   explicit skipped metadata must reconcile with its own emitted cases; totals
   cannot compensate for contradictory suites. When suite skipped metadata is
   absent, the verifier infers omitted pending counts from that suite's declared
   tests. Inferred/declared skipped counts and failures must sum to root totals;
   paired skipped totals must match. Contradictory testcase outcomes also fail.
   The reporter omits skipped
   testcase identities by default: **skipped identities remain unverified**.
   Equal counts are not proof of those identities or complete discovery.
   LCOV presence is checked; numerical coverage equivalence is not established.
6. Independently fetch actual API evidence into a separate directory. Existing
   failure/workflow filenames remain unchanged:

   | File | Read-only endpoint |
   | --- | --- |
   | `workflow.json` | `GET /api/v2/workflow/{workflow-id}` |
   | `workflow-jobs.json` | `GET /api/v2/workflow/{workflow-id}/job` |
   | `job-details.json` | `GET /api/v1.1/project/{vcs}/{org}/{repo}/{failure-job-number}` |
   | `artifacts.json`, `tests.json` | `GET /api/v2/project/{project-slug}/{failure-job-number}/{artifacts\|tests}` |
   | `control-job-details.json`, `producer-job-details.json` | Same job-details endpoint, corresponding job number |
   | `control-artifacts.json`, `producer-artifacts.json` | Same artifacts endpoint, corresponding job number |
   | `control-tests.json` | Same tests endpoint, control job number |

   Fetch every page, retain originals, combine `items` and clear
   `next_page_token` only after retaining all pages. Never synthesize omitted
   gate/dependency fields. Unexpected/missing data fail closed; investigate the
   API representation before extending verification. Keep secrets out of the
   evidence. Retain individual action logs and all pipeline workflows too.

   ```bash
   python3 support/build/ci-mocha-failure-rehearsal.verify.py /evidence/ci-mocha-failure-rehearsal \
     --paired \
     --control-directory /evidence/ci-mocha-failure-rehearsal-control \
     --producer-directory /evidence/ci-mocha-failure-rehearsal-producer \
     --circle-evidence /evidence/circle-api
   ```

   Paired API checks require exactly four unique jobs/numbers/IDs, both consumers'
   success-only dependencies on the recorded producer, matching source/job API
   identities, successful producer/control, failed suite/original exit,
   successful captures/cleanup/normalization/upload actions, expected artifact
   listings and ingested JUnit. Duplicate job names/IDs are rejected before
   indexing, and the sentinel's complete requires/dependencies maps are checked.

   An independent reviewer must still authenticate supplied API/artifact/log
   provenance, source/image measurements, complete discovery, processed config,
   coverage upload receipt/processing, UI graph and publication absence across
   the whole pipeline. The verifier fetches nothing and cannot authenticate
   arbitrary supplied JSON, attest remote registry state, verify skipped
   identities or prove coverage equivalence. Keep these acceptance items open
   until observed. Reports-only success explicitly leaves live behavior open.

For **historical three-job evidence only**, retain the original command:

```bash
python3 support/build/ci-mocha-failure-rehearsal.verify.py /historical/ci-mocha-failure-rehearsal --circle-evidence /historical/circle-api
```

Omit `--circle-evidence` for historical reports-only checks. Neither historical
mode nor the old live record establishes the new same-image comparison. A
four-job API response cannot pass historical mode, and a three-job response
cannot pass paired mode.

## Disable and rollback

Omit `ci_mocha_failure_rehearsal` or pass `false` on future pipelines to disable
both consumers. Cancel any already-enabled run separately.

To remove only this paired extension, restore the previous rehearsal producer
alias, remove the control declaration/invocation, restore the previous helper,
wrapper, verifier, rehearsal tests/contract/runbook from the pre-extension
revision. Preserve all pre-existing committed verifier fixes and historical
records. Re-run existing contracts and CircleCI validation.

To remove the entire experiment, delete its workflow, parameter, all three job
declarations and only the `&ciMochaFailureRehearsalBuild` anchor on ordinary
`build:`. Archive evidence before removing `ci-mocha-failure-rehearsal.*` files.
This restores the original parsed ordinary config; no ordinary gate, publication
filter, Dockerfile, Compose or package edit is needed. The compilation-removal
pilot has a separate rollback in its own runbook.

Never run the injector/cleanup/integration suite in a shared dirty working tree.
Retain failed runner evidence first; discard the disposable runner afterward.
