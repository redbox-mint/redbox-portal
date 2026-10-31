# Default-off CircleCI shared-asset shadow pilot

This is a measurement workflow, not an image promotion path. It is gated by
`ci_web_assets_pilot: true`, the exact `chore/circleci-performance` branch,
an empty tag, no Mocha failure rehearsal, and `none` for both publication
modes. Existing validation and publication jobs do not depend on it. The
producer builds an AMD64 asset artifact; a native ARM64 control builds the
runtime image with local assets, while a second ARM64 job restores those assets
and builds the same target. Both export local OCI archives, never push tags,
and do not place images in the existing test/PDF workspaces.

The runner authenticates the exact workflow, pipeline, repository origins,
source revision, job identities and successful producer artifact through the
CircleCI API. The consumer obtains the receipt checksum from the producer's
job artifact rather than the workspace. The job needs a `CIRCLE_TOKEN` with
read access to those API endpoints; do not put a token in source, pipeline
parameters, logs or artifacts. Unsupported or ambiguous reruns fail closed.

The source and compiled CircleCI configuration must match
`APPROVED_CONFIG_SHA256` in `circleci-pilot-runner.cjs`. The current digest
comes from configuration inspection run 13596: its source matches the committed
configuration, the compiled shadow workflow contains the three expected jobs,
and its dynamic setup fields are empty.
An environment variable or pipeline parameter cannot approve the configuration
that supplied it. Before a measurement, obtain the exact pilot pipeline's
configuration from CircleCI's pipeline-config API, verify its source and
compiled workflows independently, reject dynamic setup, and record the SHA-256
of `JSON.stringify({ source, compiled }, null, 2) + '\n'` in reviewed source.
The job rechecks that digest at runtime. A changed config, different compiled
parameters or changed orb expansion requires a new review and digest. Local
`circleci config process` output is not assumed byte-identical to the API's
compiled output. The pilot remains experimental until measured runs and
subsequent validation are complete.

As a limited feasibility check, 20 public `develop` pipeline configurations were
retrieved read-only: each group with identical source configuration also had an
identical compiled configuration, and none reported dynamic setup. The command
and full hashes are retained in
`/tmp/redbox-current-overlay-validation-20261031/check-compiled-stability.py`
and `compiled-stability.json`. These were existing workflows, not this pilot;
they do not establish that its digest will remain stable across pilot runs.

Each job clones its exact Git revision into a fresh temporary source directory,
rejects unexpected ignored files, and does not use the checkout as a Docker
context. The shared consumer installs the host TypeScript prerequisite with
scripts disabled, validates and restores the artifact, then removes its own
temporary `node_modules` before building. Docker runs against a local native
ARM64 daemon with an isolated configuration and no inherited source policy.
Only the job's randomly named builder is removed. Commands have bounded
process-group termination; failed output directories remain reserved.
The measurement wrapper allows 75 seconds for cancellation so the runner can
terminate a detached child and finish its bounded builder cleanup; the outer
`timeout` allows 90 seconds before forced termination. CI executor termination
can still be outside the process's control.

The jobs record build and OCI export measurements; CircleCI job and step
timestamps must also include executor setup, producer wait, workspace transfer,
restore and teardown. Compare completion from workflow creation, not only the
Docker build steps. One pair is directional evidence, not proof of the 12-minute
test target or 20-minute publishing target. Native AMD64 consumption, PDF/test
targets, suite and publication behavior, cache invalidation, cold cohorts,
coverage parity and cost remain separate acceptance work.
