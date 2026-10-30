# Native ARM64 timing pilot

This adds one build-only job, `arm64-timing-pilot`, in its own
`arm64_timing_pilot` workflow. Both the workflow condition and the exact job
branch filter restrict it to `chore/circleci-performance`. Tags, Dependabot,
feature/deploy branches, npm beta mode and manual Docker mode do not enable it.
Existing workflows, test dependencies and publication filters stay intact.
No existing check or publication job waits for this pilot, including on failure.
The only intentional addition to the existing check path is the small local
contract test in `build`'s existing CI contract step; it installs nothing extra.

The job uses a native `arm.medium` machine with Docker layer caching disabled.
It verifies ARM64 on the host and local Docker daemon, creates one fresh
`docker-container` Buildx builder, and builds `runtime` followed immediately by
`runtime_pdfgen`. Both builds explicitly use that builder and `linux/arm64`,
with `--load` to local `localhost/ci-arm64-pilot:*` tags. Common layers remain
in that builder for the second target. It neither imports nor exports caches.
This measures a cold builder followed by within-job layer reuse, rather than
cross-workflow warm-cache performance. Base images, npm packages and Chromium
still need network downloads. There is no emulation setup.

The helper pins Docker to the machine's local socket and creates an empty,
private Docker config, without registry authentication or credential helpers.
It does not use publishing helpers, Docker login, push, manifest commands,
registry outputs, build secrets, build arguments, SSH forwarding or CircleCI
contexts. Project-level environment variables can still be injected by
CircleCI; the pilot never forwards them into images or serializes them.
Only a small allowlist of image environment settings is recorded.

## Measurements and correctness

CircleCI uploads only `.tmp/ci-arm64-pilot/report.json` under the
`ci-arm64-pilot` artifact destination, including after an ordinary step failure.
The report contains:

- Actual checked-out commit, pipeline commit, Git tree, checkout-clean status,
  hashes of Dockerfile/dockerignore, manifests/locks, npmrc/nvmrc and pilot
  scripts. A revision mismatch or tracked modification or unexpected untracked source stops the pilot.
  Hashes identify inputs without exposing npmrc contents.
- Job/workflow identity, host Node version, native architectures, Docker/Buildx
  versions, resource class, daemon CPU count and available memory.
- Separate wall times and exit status for builder setup, each build/load,
  inspection, archive serialization and smoke check. BuildKit `CACHED` operation
  counts describe reuse; they are not cache-miss counts or saved-time estimates.
- Local image IDs (not registry digests), uncompressed image sizes, layer counts,
  user, workdir, entrypoint, command, ports, healthcheck and selected environment.
- Actual `docker image save` tar byte counts. Archives are measured one at a time
  and deleted immediately. Neither image archives nor raw inspect/build logs,
  generated PDFs, Docker configuration or application source are uploaded.

After both builds succeed, each image runs offline as its configured `node`
user. The smoke check verifies native Node, production environment, compiled
application/dependencies, core/Companion loading, production static assets,
nonempty Angular main bundle files under each served `angular/<application>/browser/`
directory and demo-hook exclusion. The PDF variant loads its hook
and uses its installed Chromium/Puppeteer to generate a tiny PDF, asserting its
signature and size. The runtime variant must exclude the PDF hook.

These checks do not launch the Sails HTTP application with MongoDB, Solr or
Keycloak. HTTP startup, asset serving and broader integration remain separate
CI integration work; the report explicitly marks HTTP startup unexercised.
The pilot smoke script is self-contained so it does not depend on concurrent
Dockerfile/image-contract/candidate work. The expected production settings and
assets deliberately match the current image contract and must be coordinated
if that contract changes.

Commands have time limits (45 minutes per build, 10 minutes per archive and
3 minutes per smoke check), plus a 100-minute outer job-command limit. Failure
retains completed timing records and fails the pilot. A failed second build
retains the first build's time; image inspection/archive/smoke occur only after
both builds pass. Signal handling and a separate always-run cleanup step remove
only this pilot's named containers, builder and images. The VM teardown remains
the final cleanup if the machine is forcibly canceled. Cleanup never prunes
unrelated resources. Only explicit Docker/Buildx missing-resource diagnostics
count as absence; inspection errors retain the resource ID and Docker/Buildx
metadata for a later cleanup retry. The standalone cleanup command fails when
inspection or removal is uncertain. Timeout and cancellation escalate to a
process-group SIGKILL after five seconds, even if the group leader has exited
and surviving descendants have closed their output streams. Pilot failure
cannot block normal checks or enable a push.

## Local verification

```bash
node --test support/build/ci-arm64-pilot.test.cjs support/build/circleci-config.test.cjs support/build/ci-performance.test.cjs
circleci config validate .circleci/config.yml
circleci config process .circleci/config.yml > /tmp/redbox-circleci-default.yml
circleci config process .circleci/config.yml --pipeline-parameters 'npm_publish_mode: beta' > /tmp/redbox-circleci-beta.yml
circleci config process .circleci/config.yml --pipeline-parameters 'docker_publish_mode: manual' > /tmp/redbox-circleci-manual.yml
```

The CLI may infer the pipeline branch from this checkout. To exercise the actual
chore workflow condition, process a temporary config replacing only
`<< pipeline.git.branch >>` with `chore/circleci-performance`. Save that expansion
as `/tmp/redbox-circleci-chore.yml`. Also expand fixtures for Dependabot, feature,
develop, empty and similarly named branches, and chore with beta/manual modes. Set `CIRCLECI_EXPANDED_DIR=/tmp` to
run expanded tests; the complete expected filenames are in the test file.
Tests use local Git repositories and a rejecting fake Docker executable to
exercise both successful builds and an intentional PDF-build failure, checking
command order, the single builder, local image output, anonymous configuration,
artifacts and cleanup. They never start an actual Docker build or publish.
Additional fixtures exercise the actual nested Angular browser layout,
missing/empty/invalid bundles, confirmed resource absence, Docker inspection
and removal failures, metadata retention and cleanup retries. A Linux process
regression starts a TERM-resistant descendant without inherited output streams
and verifies that timeout escalation kills it after its parent exits.

## Remaining CircleCI work and interpretation

Run a real chore-branch pipeline after integration and confirm ARM executor
availability, startup/download reliability, both smoke checks and artifact
collection, including an intentional build failure. Compare runs at matched
source revisions with the separate existing ARM64 builds; report build/load,
archive and setup costs separately. The pilot does not transfer candidates to
promotion, alter release gates or validate immutable promotion.

Its separate workflow avoids adding a dependency to check gates, but the extra
ARM job can consume account concurrency/credits and indirectly increase queue
delay. Observe queue/setup time from CircleCI alongside these execution times.
A fresh builder is not proof of a completely cold host/base-image cache.
Peak daemon memory, actual billed credits, HTTP startup, matched acceptance
cohorts and any persistent cache design remain unmeasured. No timing improvement
is claimed from local contract tests or config expansion.
