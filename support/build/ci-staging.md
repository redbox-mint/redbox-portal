# Automatic branch image staging and BuildKit cache

The automatic `build_test_gendocs_and_deploy` workflow stages publishable images
at workflow start. `build` uses one `docker buildx bake` invocation to solve the
shared runtime/test graph and load both images. It pushes the pristine **runtime**
as amd64 staging. With Docker credentials, it also pushes test to an immutable
staging tag and persists only the digest and tested image ID. Integration jobs
log in, pull by digest, verify the image ID, and tag it `redbox-portal:test`.
Registry inspection/push/pull or identity failures fail closed; they never select
the workspace fallback. Without either credential, non-release branches instead
save only test to the workspace tar and verify its ID after loading. Release
branches require credentials. `v*` builds additionally save runtime at the legacy
archive path for deploy; manual publishing is unchanged.

| Variant | Architecture | Dockerfile target | Final tag |
| --- | --- | --- | --- |
| runtime | amd64 | runtime | `<branch>-amd64` |
| runtime | arm64 | runtime | `<branch>-arm64` |
| pdfgen | amd64 | runtime_pdfgen | `<branch>-pdfgen-amd64` |
| pdfgen | arm64 | runtime_pdfgen | `<branch>-pdfgen-arm64` |

This intentionally changes automatic amd64 publishing: development dependencies
and the demo hook are now restricted to the test image. The `v*` release `deploy`
job also tags the saved runtime image. Manual publishing already builds runtime
and retains its existing path. Tag/manual filters, gates and final names are
unchanged. Multi-architecture tags remain `<branch>` and `<branch>-pdfgen`.

## Proving the published runtime was tested

`test` remains `FROM runtime`. Before staging a new image, compare local runtime
and test rootfs layer diff_ids. After pushing, or reusing a staging tag on a
workflow rerun, resolve its manifest digest, inspect that pinned image's config,
and require its nonempty rootfs diff_ids to be an exact, strict prefix of the
local tested image's diff_ids. Empty, malformed, reordered, unrelated, equal or
longer layer lists fail closed. Registry errors fail closed. No layer downloads
are needed for this comparison. Logs record the tested image ID, pinned runtime
digest, prefix lengths, and saved workspace image ID.

Staging tags are
`ci-staging-<full SHA>-<runtime|pdfgen|test>-<amd64|arm64>-<pipeline UUID>`.
The SHA and pipeline UUID prevent cross-commit and cross-pipeline selection.
Workflow reruns retain the UUID. Existing tags are never overwritten: only a
definite missing-manifest response permits a build/push. The tested runtime is
verified again on reruns. If its layers no longer match, rerun tests with their
original workspace or start a new pipeline. Docker Hub tag immutability for
`ci-staging-*` can additionally enforce write-once tags.

The three independent staging jobs run on `master`, `develop`, `support/*` and
`chore/ci-build-speed`. Tested-runtime staging is enabled by the automatic branch
workflow only; ordinary branches without credentials skip the staging push and
still build/test. Release branches require both Docker credentials and cannot
skip verification. Each promotion waits for its build and all tests plus
`generate-api-docs`. It pins source manifest digests before copying manifests
with `buildx imagetools create`; multi-architecture publishing uses the same
pipeline's staging sources, never mutable architecture tags.

Only exact `master`, `develop`, and `support/*` names enable real automatic
promotion and Nexus upload. Other branches (including unset names) dry-run.
Dry runs inspect real staging references, anonymously if credentials are missing,
and print commands without writes. Missing references fail even during dry runs.
As before, an older successful workflow can finish later and replace a branch
tag with its own complete image set. Wiki/documentation publishing is unchanged.

## Cache layout and stage inputs

BuildKit uses a `docker-container` driver on both remote-Docker and ARM machine
executors. All staging builds read registry cache from the current branch and
fall back to develop. Only builds with both Docker credentials export cache;
forks/no-creds builds are read-only. Each build writes its current branch only.

Cache tags are `buildcache-v1-<scope>-<amd64|arm64>` (v1 versions the cache layout), where scope is the lowercase,
Docker-safe branch name truncated to 64 characters, followed by `-` and the first
12 hex characters of SHA-256 of the original branch. The hash avoids collisions
between names such as `feature/a` and `feature-a`. Tags fall back to the release
tag or `local` when no branch exists. Runtime/pdfgen share an architecture cache;
concurrent last-writer wins can reduce cache coverage but cannot change build
correctness. Exports use registry `mode=max`, OCI media types and image manifests.
Bake's test target alone exports cache because its graph contains runtime too.

`manifests` copies root and local-package manifests/locks and the exact patched
Agenda tarball before installation. The install steps bind-mount the root
`.npmrc` as a cache input to preserve lifecycle/peer settings without copying
application source. After source is copied, script-free npm
rebuild restores local CLI bin links that npm skips when their targets are absent. `dev-deps` and `prod-deps` are independent.
The latter installs a clean production graph while compilation proceeds, removing
the old node_modules snapshot/reinstall sequence. Runtime copies only production
dependencies; test copies unpruned builder dependencies directly. For
`sails-ng-common`, test takes the final dependency graph from the Angular stage,
matching the old snapshot after Angular npm ci applied its own lockfile.

`angular-builder` reads `angular/`, shared `sails-ng-common` source/manifests,
shared TypeScript base config, the manifest-only root/local dependency layer
(required to resolve that config), and `compileProductionAngular.sh`. There is no
angular-legacy workspace. Backend-only edits do not invalidate Angular. Its
assets feed `assets-builder`, which runs the existing webpack wrapper against
only its hook/config sources (using the wrapper's existing ts-node fallback),
the Sails type declarations, shared logger, TypeScript config, vendor dependencies,
static assets and the browser TypeScript entry/style declarations. It compiles
that browser entry before webpack, just as the original root compile did, then
uses the shared dependency graph after Angular npm ci for bundling. Both Angular and webpack can reuse cache on unrelated backend
changes; backend compilation proceeds independently of the asset stages.

## Independent jobs and test scheduling

The 19 Angular matrix jobs, sails-ng-common, redbox-core, agenda-sqs-backend,
rva-registry, redbox-dev-tools-cli, storage-mongo, and generate-api-docs install
and compile from their own checkouts. They consume no build outputs and start
at workflow entry (Dependabot jobs still wait for lock refresh). Explicit branch
filters preserve the separation between ordinary and Dependabot workflows. The unused sails-ng-common and redbox-core workspace mounts
are removed. Bruno general/OIDC/S3, Mocha and Playwright require the tested image
and retain their build dependency. Lint stays in build; all automatic promotions
still require every test plus build (directly or through image-consuming tests)
and generated API docs. Release-tag filters and manual publishing remain intact.

Mocha no longer compiles packages on the host before starting CI compose. That
service mounts test/support/TypeScript source and configuration, but uses the
compiled packages and dependencies already built into the verified test image.
The removed host outputs were never mounted or consumed. Coverage preparation,
Codecov uploads, JUnit results and Playwright artifacts retain their existing
paths and consumers.

## Filesystem equivalence evidence

The opt-in `image_equivalence` workflow (`verify_image_equivalence: true` pipeline
parameter, default false) runs `verify-image-equivalence`. It builds the pre-change
Dockerfile (`support/build/Dockerfile.before-cache`) and current Dockerfile against
the **same source checkout**, one at a time on a CircleCI machine. It inventories
all regular files under `/opt/redbox-portal` (path, size, SHA-256), plus symlink
targets, ignoring mtimes. It also captures `npm ls --all --omit=dev --json`, stderr
and exit status for runtime and test. It stores old/new inventories and unified
diffs as `image-equivalence` artifacts and fails on any inventory, npm tree or
npm status difference. Existing npm errors are preserved rather than hidden.
The rollout comparison runs are retained as CircleCI artifacts. Normal builds
do not run this extra old/new build. No full portal builds run on the small
development host.

## Cleanup

Cleanup is an operational daily retention task; CI never deletes registry tags.
Keep staging tags seven days for reruns/debugging. In Docker Hub's Tags view,
filter `ci-staging-`, select only tags older than seven days, and confirm their
CircleCI pipelines have finished (including failures/cancellations). Retain tags
if pipeline status is unknown; never delete running pipelines' tags.

For API retention:

1. List `GET https://hub.docker.com/v2/repositories/<namespace>/<repository>/tags/?page_size=100`
   and follow every `next` page.
2. Select `ci-staging-*` tags older than seven days. Check the trailing pipeline
   UUID using `GET https://circleci.com/api/v2/pipeline/<UUID>/workflow`.
3. Delete selected **tags** through
   `DELETE https://hub.docker.com/v2/repositories/<namespace>/<repository>/tags/<tag>/`.
   Never delete registry manifests/digests: final tags/indexes may reference them.
4. Separately expire `buildcache-*` tags for deleted/inactive branches after
   30 days without updates (including tag/local scopes and obsolete cache versions). Retain develop and active release-branch caches and
   caches used by running pipelines. Deleting a cache tag is safe for image
   contents; the next build is cold. Cache tags are mutable and should be excluded
   from any `ci-staging-*` immutability policy.

Deleting staging tags leaves final image tags intact. After retention expiry,
start a new pipeline rather than rerunning old deploy jobs. Five staging tags (runtime and pdfgen for both architectures, test for amd64) per
pipeline and branch/architecture cache tags accumulate until retention is set up.

## Executor cost and focused verification

ARM staging stays on `arm.medium`; measure wall time and credits before increasing
it. The amd64 staging push/prefix check remains on the test critical path.
Independent staging jobs still run if tests later fail.

```sh
circleci config validate .circleci/config.yml
bash support/build/docker-build-vars.test.sh
node --test support/build/docker-staging.test.cjs support/build/docker-test-handoff.test.cjs
bash -n support/build/docker-{staging,build-cache,build-ci,test-handoff}.sh support/build/compare-ci-images.sh
```

Mocked Docker tests cover gates, staging isolation/immutability, pinned promotion,
rootfs-prefix failure cases, credentials, Buildx cache scopes/develop fallback,
read-only cache operation, retries, and runtime publishing in all amd64 paths.
Real builds and equivalence checks run in CircleCI only.
