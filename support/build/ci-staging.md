# Automatic branch image staging and BuildKit cache

The automatic `build_test_gendocs_and_deploy` workflow stages publishable images
at workflow start. `build` uses one `docker buildx bake` invocation to solve the
shared runtime/test graph and load both images. It pushes the pristine **runtime**
as amd64 staging. It saves only **test** to the workspace tar for branch tests;
runtime's layers are already included in test. Each integration job loads the tar
and verifies the image ID against the producer's data-only metadata. No test
image is pushed or pulled. This path also works without credentials on forks.
`v*` builds additionally save the pristine runtime tag for legacy deploy; manual
publishing is unchanged. Release branches still require staging credentials.

| Variant | Architecture | Dockerfile target | Final tag |
| --- | --- | --- | --- |
| runtime | amd64 | runtime | `<branch>-amd64` |
| runtime | arm64 | runtime | `<branch>-arm64` |
| pdfgen | amd64 | runtime_pdfgen | `<branch>-pdfgen-amd64` |
| pdfgen | arm64 | runtime_pdfgen | `<branch>-pdfgen-arm64` |

This intentionally changes automatic amd64 publishing: development dependencies
and the demo hook are now restricted to the test image. The `v*` release `deploy`
job also tags the saved runtime image. Manual publishing already builds runtime
and retains its existing path. Release-tag deploy jobs and their manifests require build, every test (including
Playwright, RVA registry and the dev-tools CLI), and generated API docs. Manual
Docker publication intentionally retains its human-triggered gating: each
manifest waits only for its two architecture publishers, without build/test/docs
gates. Final names are unchanged. Multi-architecture tags remain `<branch>` and `<branch>-pdfgen`.

## Proving the published runtime was tested

`test` remains `FROM runtime`. Before staging, compare local runtime and test
rootfs layer diff_ids. After pushing, resolve the attempt tag once and inspect
that pinned manifest and config. The registry client verifies both content
digests and exposes the config digest as `Id`. Require that digest to equal the
local `redbox-portal:runtime` image ID, then independently verify that the runtime
layers are an exact prefix of the test image. This rejects shorter ancestors and
changes to CMD, ENV, USER or any other image configuration. Release branches fail
closed on registry errors or missing credentials.

Staging tags include both pipeline UUID and producer job number:
`ci-staging-<full SHA>-<runtime|pdfgen>-<amd64|arm64>-<pipeline UUID>-<job number>`.
Each rerun attempt uploads to its own tag, so overlapping reruns cannot overwrite
one another. Each producer publishes its verified manifest digest in its
`ci-staging-status/<variant>-<arch>` artifact, alongside the commit and pipeline
UUID. Promotion and manifest jobs read the successful producer's artifact through
the current workflow's CircleCI API, validate its identity, and use only
`repository@digest`. They never resolve a staging tag again. Workflow and artifact
list requests follow pagination; when the API includes multiple successful
attempts, the newest job number supplies the artifact.

Configure `CIRCLE_TOKEN` as a masked CircleCI project environment variable with
read access to this project's workflow jobs and artifacts. Both
`promote-staging-image` and `publish-staging-manifest` inherit this project secret;
keep secret access restricted to trusted builds and do not enable secret sharing
with fork builds. The evidence helper sends it in the `Circle-Token` header for
every API and artifact-download request, including paginated requests. Missing
tokens and authentication failures stop promotion before evidence is accepted.

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
Dry runs verify producer-pinned digests by HEAD, anonymously if credentials are
missing, and print digest-pinned commands without writes. Missing references fail
unless that exact producer has a `quota-skipped` or `credential-skipped` artifact
matching this SHA and pipeline UUID. Missing credentials skip non-release staging
with a distinct `credential-skipped` marker. This exception is only for non-release dry runs; real publication
never accepts a skipped identity check. Confirmed Docker Hub quota errors skip
optional non-release staging with a clear log. Authentication, network, malformed
metadata, and identity failures still fail. Small status artifacts avoid attaching
the large test workspace to promotion jobs.
As before, an older successful workflow can finish later and replace a branch
tag with its own complete image set. Wiki/documentation publishing is unchanged.

## Cache layout and stage inputs

BuildKit uses a `docker-container` driver on both remote-Docker and ARM machine
executors. All staging builds read registry cache from the current branch and
fall back to develop. Only builds with both Docker credentials export cache;
forks/no-creds builds are read-only. Each build writes its current branch only.

Cache tags are `buildcache-v2-<scope>-<amd64|arm64>-<test|runtime|pdfgen>`
(v2 versions the per-target layout), where scope is the lowercase, Docker-safe
branch name truncated to 64 characters, followed by `-` and the first 12 hex
characters of SHA-256 of the original branch. This avoids branch-name collisions.
Tags fall back to the release tag or `local` when no branch exists. The `build`
Bake writes only `test`; standalone staging writes only its runtime/pdfgen ref.
Independent targets never overwrite one another's records. Exports use registry
`mode=max`, OCI media types and image manifests. Imports try the own target first,
then sibling targets, then the same order on develop, stopping at the first
available cache because mode=max includes its ancestors. HEAD preflight logs the
selected manifest digest and imports that immutable digest. This avoids redundant
manifest GETs and makes concurrent writes diagnosable. Missing caches are omitted.
On a
non-release branch, zero allowance/HTTP 429 disables registry cache inputs and
exports with an explicit uncached-build log. A quota race during cache access
retries the solve once without cache inputs/exports; application failures remain
failures. Non-release cache exports use `ignore-error=true` because exporting
cache is optional. Release cache errors may fail; release staging and promotion
identity checks always fail closed.

`buildkitd.toml` configures `mirror.gcr.io` for Docker Hub base/frontend reads;
the BuildKit bootstrap image is pulled from that cache before builder creation,
with an explicit retry at `docker.io/moby/buildkit` using the same digest if the
mirror pull fails. Builder creation uses the successfully pulled reference;
if both pulls fail, the build stops. Both Node bases and
the bootstrap image are pinned by multi-platform index digest, like the frontend.
Mirror and Hub fallback therefore resolve the same content. The existing daily
Docker ecosystem entry for `/` in `.github/dependabot.yml` covers Node digest
updates; bootstrap pins in the shell helper need deliberate updates (Dependabot
does not inspect arbitrary shell image arguments). Missing mirror content
for base/frontend images falls back to Hub inside BuildKit. Cache imports/exports and staging remain in
the configured Docker Hub repository and retain their existing branch scopes.
Tag existence and promotion digest resolution use registry HEAD requests. The
staged runtime identity check fetches its pinned manifest once and its config
blob once, verifies both content hashes, and applies the existing strict-prefix
check. Promotion no longer refetches the same manifest for display/config logs.

`manifests` copies root and local-package manifests/locks and the exact patched
Agenda tarball before installation. The install steps bind-mount the root
`.npmrc` as a cache input to preserve lifecycle/peer settings without copying
application source. After source is copied, script-free npm
rebuild restores local CLI bin links that npm skips when their targets are absent. `dev-deps` and `prod-deps` are independent.
The latter installs a clean production graph while compilation proceeds, removing
the old node_modules snapshot/reinstall sequence. Runtime copies only production
dependencies and rebuilds executable links without lifecycle scripts after the
compiled local packages arrive; its build verifies the three local CLI links are
executable. Test copies unpruned builder dependencies directly. For
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

## Context diagnostics and host setup audit

The build job fingerprints checkout before host setup and again immediately
before Bake. Each staging build fingerprints immediately before its solve.
`docker-context-fingerprint.cjs` applies `.dockerignore` (or Dockerfile-specific
ignore rules), sorts paths, and hashes file contents, modes, directory entries
and symlink targets, ignoring mtimes. The log prints one SHA-256 fingerprint;
`ci-build-context` artifacts retain `inventory.jsonl` and Git status for exact
comparisons. Fingerprints/inventories are diagnostic, not BuildKit cache keys.
Their outputs are under `/tmp/ci-build-context`, never inside the checkout.

Before the build solve: checkout writes source and `.git`; npm ci writes root
and local-package `node_modules`; lint is read-only; npm publication tests build
fixtures/tarballs under mktemp directories; Docker tag/staging/handoff/registry
unit tests also use mktemp fixtures (staging mocks have an isolated cwd).
Cache setup performs login (`~/.docker/config.json`) and uses the committed
`buildkitd.toml` directly without copying it. Registry metadata is returned on
stdout. Quota/retry logs use mktemp; producer markers use `/tmp/ci-staging-status`
after the solve, and image handoff uses `/tmp/docker-images` afterwards.
Standalone staging has checkout, login, mktemp inspection/quota logs, cache
setup and the fingerprint before Docker; no npm installation or host compilation.
`.dockerignore` already excludes `.git`, `.tmp`, `.circleci`, `.github`, all
`node_modules`, `dist`, Angular cache, coverage, and root log files.
No generated quota marker, registry output, config copy or metric belongs in
the source context. Local npm setup reproduced no included path/content/mode
changes. The paired CI inventories establish whether CI differs from that audit.

## Docker Hub quota audit

`docker-registry.cjs` logs method, path, status, and Docker Hub allowance headers
without tokens or credentials. Authentication, manifest HEAD, config/blob GET,
and pushes do not spend pull allowance. Successful manifest GETs can spend it;
GET retries and multi-architecture resolution can add requests. Mirror hits do
not spend this account's allowance. Mirror misses can still reach Docker Hub.

For a fresh ordinary branch pipeline, the A/B code at pipeline 13621 made 20
explicit manifest-fetch invocations: two for tested-runtime verification, nine
across four architecture promotions, and nine across two multi-arch dry runs.
The new code makes one: the required pinned runtime identity inspection.
Existence checks and dry-run digest resolution now use HEAD, and repeated config
logging is removed. Real release publication still fetches pinned manifests
inside `imagetools create`; those writes never run on this measurement branch.

A planning budget for the authenticated A/B paths is **40 → 5 pull units**:
20 → 1 explicit inspections; 4 → 4 branch-cache imports (develop caches were
absent in 13621); 16 → 0 public build inputs (two Node bases, Dockerfile frontend,
and BuildKit bootstrap on each of four builders), assuming Google mirror hits.
If both branch and develop caches exist, use 9 instead of 5. At the observed
200 allowance this models **5 → 40 pipelines per quota window**, or 22 with both
cache scopes present, before other users of that account. Real release writes
need an additional eight pinned source fetches on the no-retry path: plan for
13 units / 15 pipelines with only branch caches. These are budgets, not measured
billing totals: 13621 did not log quota counters, BuildKit can deduplicate or
retry, and mirror/cache misses change consumption. Public test dependencies and
CircleCI executor pulls may use separate anonymous/shared-IP quotas; they are
not included in this authenticated-account budget. The final timing report
records observed allowance deltas and any concurrent activity separately.

## Test dependency registry cache

The five image-consuming test machines and the core MongoDB integration job
configure Google's `mirror.gcr.io` Docker Hub cache before pulling images. They
preserve existing daemon options/mirrors and restart Docker before any workload
starts. Pinned auxiliary image digests remain unchanged; cache misses fall back
to Docker Hub. The portal test image comes from the workspace and its image ID is verified after loading. This avoids shared CircleCI IP pull-quota failures for public test
dependencies, observed even after successful Docker login. BuildKit cache writes are isolated by branch, architecture and target.

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
2. Select `ci-staging-*` tags older than seven days. Read the pipeline UUID before the final job number and check it using `GET https://circleci.com/api/v2/pipeline/<UUID>/workflow`.
3. Delete selected **tags** through
   `DELETE https://hub.docker.com/v2/repositories/<namespace>/<repository>/tags/<tag>/`.
   Never delete registry manifests/digests: final tags/indexes may reference them.
4. Separately expire `buildcache-*` tags for deleted/inactive branches after
   30 days without updates (including tag/local scopes, all three target suffixes, and obsolete v1 caches). Retain develop and active release-branch caches and
   caches used by running pipelines. Deleting a cache tag is safe for image
   contents; the next build is cold. Cache tags are mutable and should be excluded
   from any `ci-staging-*` immutability policy.

Deleting staging tags leaves final image tags intact. After retention expiry,
start a new pipeline rather than rerunning old deploy jobs. Each pipeline attempt creates four staging tags (runtime and pdfgen for both
architectures). These and branch/architecture/target cache tags accumulate until
retention is set up.

## Executor cost and focused verification

ARM staging stays on `arm.medium`; measure wall time and credits before increasing
it. The amd64 staging push/prefix check remains on the test critical path.
Independent staging jobs still run if tests later fail.

```sh
circleci config validate .circleci/config.yml
bash support/build/docker-build-vars.test.sh
node --test support/build/*.test.cjs
bash -n support/build/docker-{staging,build-cache,build-ci,test-handoff}.sh support/build/compare-ci-images.sh
```

Mocked Docker tests cover gates, staging isolation/immutability, pinned promotion,
rootfs-prefix failure cases, credentials, Buildx cache scopes/develop fallback,
read-only cache operation, retries, and runtime publishing in all amd64 paths.
Real builds and equivalence checks run in CircleCI only.
