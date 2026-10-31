# CircleCI scheduling pilot

The first scheduling phase starts package/Angular checks and API documentation
without waiting for the test image. Dependabot jobs wait for lock refresh and
check out the exact revision recorded by that job. Their `CIRCLE_SHA1` is updated
for Codecov; `CI_PIPELINE_REVISION` retains the original pipeline revision.
CircleCI's own pipeline/check association still belongs to the original revision.

`validation-complete` has one shared dependency list for automatic branch and
release publication. It includes all 19 Angular jobs, six package jobs, five
image-based integration jobs, and API documentation. Release tags now also run
`test-playwright`, with that exact check name. Existing coverage commands, JUnit
paths, failure handling, and deployment filters are frozen in
`.circleci/validation-contract.json` and checked by the targeted tests.

PDF image preparation starts alongside `build`. On exactly
`chore/circleci-performance`, it also runs without any publication job being
enabled. Normal automatic publication still only runs on master, develop, and
support branches or the existing release tags. Explicit manual Docker and npm
beta workflows retain their existing behavior and bypass automatic validation;
this change does not expand or redesign those publication modes.

The two concurrent image producers persist different directories and explicit
leaf files (`docker-images/test/` and `docker-images/pdfgen/`). Only Dependabot's
refresh job writes `source-revision/revision`. Measurements are job artifacts,
never shared workspace files. Image consumers retain their producer dependency;
PDF promotion additionally waits for PDF preparation.

## Collect timings

Image build/save steps write JSON under `.tmp/ci-performance/`, uploaded as job
artifacts even on failure. Records include actual checkout and pipeline revisions,
job/workflow identity, architecture, resource class, Node version, elapsed time,
exit status, image archive bytes, and peak local process-tree RSS where GNU time
is available. The wrapper preserves command output and exit status.
Cancellation and output-pipe errors normally allow one second before forced
termination. Callers that perform bounded child cleanup can explicitly use
`--grace-ms N` (1,000–120,000 ms) before `--`; the shadow asset pilot uses
75 seconds for its nested worker and builder cleanup. A surrounding timeout
must allow longer than that grace before forcing termination.

BuildKit `CACHED` operations are counted by operation ID. Completed operations
include metadata and exports, so they are **not** a layer cache miss count. npm
cache hit/miss remains in CircleCI restore logs. Local Docker client memory does
not measure the remote Docker daemon. Remote Docker peak memory and actual
billed credits remain unavailable (`null`); collect billing data separately.

Read a completed workflow without changing CircleCI state:

```bash
node support/build/ci-performance.cjs report WORKFLOW_UUID > /tmp/workflow-timing.json
```

Public workflows need no token. For private workflows, supply `CIRCLE_TOKEN`
through the environment. The helper only makes GET requests to CircleCI APIs;
it does not fetch signed console URLs or copy raw API bodies into its output.
Reports include job execution and step durations, dependencies, JUnit result
counts by outcome, and elapsed time from workflow creation. API `pipeline_revision`
is pipeline metadata; use local measurement `revision` for actual build source.
An empty test count means no JUnit records were returned, not zero discovered
tests. Check both the reports and actual suite logs during the pilot.

`ready_to_start_seconds` is the interval from the last prerequisite completion
(or workflow creation) to job start. It includes scheduling/concurrency delay;
executor setup is reported separately in step timings. It is not a billing or
pure queue-time metric. Failed/canceled workflows remain in the report and never
receive a successful `all_checks_seconds` value if a check failed or is incomplete.

## Verify configuration and contracts

```bash
circleci config validate .circleci/config.yml
circleci config process .circleci/config.yml > /tmp/redbox-circleci-default.yml
circleci config process .circleci/config.yml --pipeline-parameters 'npm_publish_mode: beta' > /tmp/redbox-circleci-beta.yml
circleci config process .circleci/config.yml --pipeline-parameters 'docker_publish_mode: manual' > /tmp/redbox-circleci-manual.yml

# The CLI otherwise expands pipeline.git.branch as an empty value. Supply only
# this event value in a temporary fixture to verify conditional source checkout.
python3 - <<'PY'
from pathlib import Path
source = Path('.circleci/config.yml').read_text()
Path('/tmp/redbox-circleci-dependabot-source.yml').write_text(
    source.replace('<< pipeline.git.branch >>', 'dependabot/npm/measurement-fixture'))
PY
circleci config process /tmp/redbox-circleci-dependabot-source.yml > /tmp/redbox-circleci-dependabot.yml
CIRCLECI_EXPANDED_DIR=/tmp node --test support/build/circleci-config.test.cjs support/build/ci-performance.test.cjs
bash support/build/docker-build-vars.test.sh
bash support/build/npm-publish-backend-packages.test.sh
```

The config tests also run during `build`, without requiring the CLI or network.
They exercise refreshed checkout against a temporary local Git repository,
including a newer branch tip and invalid revision input. The optional expanded
test checks the real CircleCI matrix expansion and conditional checkout. Filter
tests cover feature/chore/deploy/Dependabot branches and release/RC tags; they do
not replace real CircleCI event runs.

## Remaining phase 1 work

- Run at least three matched baseline/candidate pairs on CircleCI, measuring
  executor contention, workspace transfer, and scheduling delay. Local config
  processing does not establish a performance improvement.
- Exercise real feature, chore, Dependabot refresh, deploy-branch, release/RC,
  npm beta, and manual events with controlled publication namespaces. Inject a
  failing check and verify automatic publication never starts.
- Compare actual JUnit counts/coverage artifacts across runs. The contract freezes
  suite commands and report paths; it cannot establish runtime test counts.
- Collect npm cache outcomes, remote builder memory where available, and billed
  credits. Compare warm/cold cohorts and keep failed/canceled workflows separate.

Dockerfile restructuring, production image contracts, shared assets, candidate
promotion, and cache redesign belong to later phases.
