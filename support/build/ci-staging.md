# Automatic branch image staging

The `build_test_gendocs_and_deploy` workflow builds four publishable images at
workflow start, independently of `build` and its tests. The normal test image and
test workspace are unchanged. Staging runs on `master`, `develop`, `support/*`,
and the measurement branch `chore/ci-build-speed`.

| Variant | Architecture | Dockerfile target | Final tag |
| --- | --- | --- | --- |
| runtime | amd64 | **test** (existing automatic publishing behavior) | `<branch>-amd64` |
| runtime | arm64 | runtime | `<branch>-arm64` |
| pdfgen | amd64 | runtime_pdfgen | `<branch>-pdfgen-amd64` |
| pdfgen | arm64 | runtime_pdfgen | `<branch>-pdfgen-arm64` |

The final multi-architecture tags remain `<branch>` and `<branch>-pdfgen`, using
the existing branch-name normalization in `docker-build-vars.sh`. In particular,
this change does **not** make the automatic amd64 runtime image pristine: it still
includes the test/development dependencies and demo hook, as it did before.

Staging tags are
`ci-staging-<full SHA>-<runtime|pdfgen>-<amd64|arm64>-<pipeline UUID>` in the same
Docker repository. The SHA prevents cross-commit selection, and the pipeline UUID
isolates concurrent pipelines even when they build the same commit. Workflow
reruns retain the pipeline UUID, so rerunning only failed jobs can reuse the
original staging images. Build jobs reuse an existing staging tag on full reruns,
and build only after a definite missing-manifest response (registry/auth/network
errors fail closed). Do not manually overwrite staging tags. Docker Hub tag
immutability for `ci-staging-*` can additionally enforce write-once tags at the
registry, including against manual overwrites or concurrent reruns of one pipeline.

Each image promotion waits for its staging build and **all** test jobs plus
`generate-api-docs`. Promotion copies manifests with `buildx imagetools create`,
without pulling layers, rebuilding, or attaching the large test workspace.
The multi-architecture publisher reads the two pipeline-specific staging tags,
not the mutable architecture tags; concurrent workflows cannot mix image sources.
An older successful workflow can still finish after a newer one and replace a
branch tag with its own complete image set, as with the existing publisher.

Real automatic promotion (and the existing Nexus package upload) is enabled only
for exact `master`, `develop`, and `support/*` branch names. All other branch
values, including an unset branch, default to dry run. Dry runs authenticate and
inspect the actual staging references, then print the exact image/manifest create
commands without executing them. Tag and manual Docker release workflows keep
their existing scripts, targets, tags, gates, and rebuild-based publishing path.
The wiki and generated-documentation publishing filters/dependencies are unchanged.

## Cleanup

Cleanup is an operational retention task; these jobs do not delete staging tags.
Keep a seven-day rerun/debugging window. In Docker Hub's repository Tags view,
filter on `ci-staging-` and delete only tags older than seven days whose CircleCI
pipelines have finished (including failed/canceled pipelines). Never delete tags
belonging to a running pipeline. This should be run daily by the repository owner,
or configured as a scheduled Docker Hub API retention task:

1. List repository tags through
   `GET https://hub.docker.com/v2/repositories/<namespace>/<repository>/tags/?page_size=100`,
   following every `next` page.
2. Select only `ci-staging-` names with `last_updated` older than seven days.
   The trailing UUID identifies the CircleCI pipeline; check that its workflows
   have finished via `GET https://circleci.com/api/v2/pipeline/<UUID>/workflow`.
   Retain tags if pipeline status cannot be checked.
3. With a Docker Hub token authorized for tag deletion, delete each selected tag
   with `DELETE https://hub.docker.com/v2/repositories/<namespace>/<repository>/tags/<tag>/`.
   Use the Hub **tag deletion** API, not registry digest/manifest deletion: final
   release tags and indexes can still reference the promoted content.

Deleting a staging tag after promotion does not remove its other final tags.
Rerunning old failed deploy jobs after retention expiry requires a new pipeline
to regenerate staging images. Failed tests block all promotion but still leave
staging tags for the retention task. Until retention is configured or performed,
these tags accumulate (four per pipeline); this is an explicit rollout task.

## Executor cost

ARM staging stays on `arm.medium`. Historical 13–14 minute builds fit within the
roughly 25 minute check path, so `arm.large` would not shorten that critical path.
`arm.large` doubles vCPU/RAM and costs more per minute; use it only if measured
staging build completion becomes the bottleneck, comparing credits per build as
well as wall time. This change adds one independent amd64 `test` build rather
than moving/publishing the test-workspace build; it trades that extra compute and
push for independent staging and check paths. All four staging builds now run
even if tests later fail.

## Focused verification

```sh
circleci config validate .circleci/config.yml
bash support/build/docker-build-vars.test.sh
node --test support/build/docker-staging.test.cjs
bash -n support/build/docker-staging.sh
```

The staging tests mock Docker and cover release-branch gating, default dry run,
tag naming/isolation, preserved image targets, final tag names, manifest sources,
missing staging references, and registry retries. Real builds run only in CircleCI.
