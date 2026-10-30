# Backend dependency-layer experiment (opt-in only)

This directory is an isolated experiment, with no CI integration or publication.
It generates a separate Dockerfile and contexts from **committed Git objects**.
It never reads the working-tree Dockerfile, manifests, locks, ignore rules or
untracked files, and never installs into the checkout. Do not replace the real
Dockerfile or wire this into CircleCI until full parity and executor measurements
have been reviewed. No speedup is claimed by this implementation.

## Audited source baseline

- Commit: `6b9d8561781cc061579b6324e4a5356459b98df4`.
- `Dockerfile` SHA-256: `f50fb5fea6677539b0b90d15b0810b913bdc4f0d54366e760dccf588fab1a2b6`.
- `.dockerignore` SHA-256: `948be463ca994b00ed64b23ae3ec5a9764e7712af65af6297436d5f5a62ac33f`.
- Baseline root `.npmrc` SHA-256: `8717c1586908bd9cf91f1c3bd8872a1a1e49a8612aff49dff424e41f5651f2ef`.

Another committed ref may be selected explicitly, but must retain the audited
Dockerfile and ignore policy and pass dependency-input validation. The output
`experiment.json` records the **actual** source commit, dependency input inventory
and mode/content fingerprints. A dependency fingerprint is diagnostic, not a
replacement for BuildKit's platform, instruction and parent-layer cache keys.

## Cache boundary and preservation

The original `COPY . .` precedes seven installs: root `npm ci --no-audit`, then
agenda-sqs-backend, sails-ng-common, raido, rva-registry (`npm ci --no-audit`),
redbox-core (`npm install --no-save --no-audit`), and storage-mongo (`npm ci --no-audit`).
Any changed included source file invalidates that original install RUN.

The generated Dockerfile copies a named `backend_dependency_inputs` context and
runs **that exact seven-command block** in `backend_dependencies`. The builder
inherits this stage, then copies a separate source overlay. All instructions
before the original builder, and all instructions after the seven installs, are
preserved byte-for-byte. In particular this preserves Node 26.12.1 Bookworm,
apt/JDK/nvm/Python setup, compile order, later dev-tools/dev-hook/pdfgen installs,
Angular builds, webpack, descriptors, production reinstall, runtime stages and
the original test dependency overlay. There is no `node_modules` artifact copy,
cache mount, npm flag substitution, changed install order or blanket suppression
of lifecycle scripts.

Inputs include root `package.json`, `package-lock.json`, `.npmrc`, `.npmignore`,
and **all included committed files under `packages/`**. This deliberately includes
more than a minimal dependency closure: complete local-package source, locks,
nested `.npmrc`/`.npmignore`, files used in packing, bin targets and Agenda tarballs.
The pinned Docker ignore policy is applied before partitioning, so ignored dist,
coverage and node_modules are not accidentally introduced. File modes come from
Git. The source overlay excludes these inputs, so it cannot overwrite an npm
lockfile rewrite or reset a local bin's executable bit after npm creates a link.
Stage inheritance retains nested node_modules, symlinks and dependency filesystem
side effects, including files outside the project workdir. The source overlay
cannot revert side effects to any declared dependency input.

Root `ignore-scripts=true` is retained as configuration. A separate nested npm
invocation does **not** generally inherit the root project's `.npmrc`; its
original lifecycle behavior is preserved. The synthetic Docker test demonstrates
this with an install script in a local tarball: root skips it, while the nested
install runs it. It also checks real local directory links and executable bin
links. No `--ignore-scripts` flag is added to the seven installs.

Application changes under `api/` or `typescript/` leave these dependency inputs
unchanged. Local package source changes intentionally invalidate dependencies.
Angular files and commands remain in their original downstream build path;
this does not implement or depend on a web-assets cache experiment.

## Fail-closed scope and limitations

Preparation rejects changed Dockerfile/ignore semantics, symlinks/gitlinks,
missing locks or local targets, workspaces/bundled layouts, shrinkwrap,
binding.gyp, unsupported dependency specs/resolution URLs, and local install or
prepare lifecycle hooks. Supported local dependency paths must stay within an
immediate `packages/<name>` directory or its local tarball. Registry dependency
versions must be exact; Git specs must identify full commits. Peer dependencies
can affect npm's installation and version selection. Only peer specifications
recorded in `peer-specs.json` from the audited baseline are accepted; local
paths are also validated. New specifications, including valid npm ranges, require
review and an explicit update to that inventory before use.
Lockfile dependency specs are likewise restricted to the baseline inventory in
`lock-specs.json`, and accepted local paths must resolve inside the input tree.
Dockerfile-specific ignore overrides are rejected.

Npm config is copied and hashed, not synthesized. A narrow allowlist supports the
baseline options and the same options in nested `.npmrc` files; unknown options,
duplicate keys, auth/env substitution, alternate registries, `install-links`,
workspace/omit/userconfig overrides and enabling scripts through config are
rejected. Root `ignore-scripts=true` is required. This is intentionally restrictive;
extend the validator and tests before accepting additional configuration. The
unchanged downstream Angular/support configurations are outside this early
dependency layer. User/global npm config and npm environment variables are not
imported from the host; do not modify the generated recipe to inject them.

This is **not a hermetic build or a proof about arbitrary third-party scripts**.
Nested dependency lifecycle scripts still execute, and Git dependencies can run
their own prepare behavior. External scripts that read excluded application
source, modify files supplied by the later source overlay, or depend on unkeyed
network state would invalidate the assumed boundary; investigate any such behavior
before accepting a full-image parity run. New local install
hooks are rejected rather than guessed safe. The existing redbox-core
`npm install --no-save` can re-resolve dependencies, so an old cached graph can
differ from a fresh uncached resolution even with unchanged inputs. This risk is
preserved from the source recipe, not solved by layer caching. Registry contents,
base image tags, apt repositories and the fetched nvm script also remain mutable.
Use short-lived experimental caches and revalidate against uncached builds.

This Git-only control intentionally excludes dirty/untracked local source that
an ordinary working-tree Docker build might include. Compare candidate and control
from the generated snapshots, not against the current dirty checkout. The ignore
implementation supports only the exact audited policy; an opt-in Docker test
checks its root/nested matching behavior against real `COPY`.

## Local checks

From the repository root, with Node 22 or newer and Git, no npm install required:

```bash
node --test support/build/experimental-backend-deps-6b9d856/prepare.test.cjs
```

Optional Docker fixture tests use an **already local**, explicitly selected image
with Node/npm/bash/tar, preferably Node 26.12.1. They perform synthetic offline
installs with networking disabled for containers and build RUN steps, do not
fetch the production Dockerfile frontend, and remove only their own temporary
tags/directories. BuildKit's ordinary local cache records may remain. They use
the Docker `default` builder and `--pull=false`; base metadata resolution still
depends on Docker honoring the existing local tag. An absent image is rejected
before building. No global prune is performed.

```bash
BACKEND_DEPS_FIXTURE_IMAGE=<already-local-node-image-tag> \
  node --test support/build/experimental-backend-deps-6b9d856/docker-fixture.test.cjs
```

The tests cover source-only cache reuse, input invalidation, local links/tarball,
bin execution and modes, root/nested lifecycle behavior, preservation of install
side effects, and equivalence of the complete synthetic installed filesystem
between original ordering and split ordering. Without the variable, the Docker
tests explicitly skip; a skip is not evidence of Docker parity.

Baseline preparation in this workspace produced 2,389 included source files,
1,219 dependency input files and 1,170 overlay files. The dependency fingerprint
was `53a8d2ef0e445cbdc6f05aa3abcf8db9f46d14acd53238cf32892bb959b32c58`.
Local validation used host Node 22.23.2, Docker 29.1.3, Buildx 0.30.1 on Linux
arm64, and a local Node 26.12.1 fixture image with ID
`sha256:0543aa20100e1b0bdf2114998ca04e4d969834e89f61f3ea1901d851a86ba75f`.
The preparation tests and both opt-in Docker tests passed in the initial check. The Docker fixture
compared 35 file/link entries, including contents, modes and link destinations,
and observed the seven-install dependency RUN as `CACHED` after a source edit.
These environment details establish the scope of local checks, not CircleCI
performance or real application image parity.

## Generate the opt-in snapshot

```bash
experiment=$(mktemp -d /tmp/redbox-backend-deps.XXXXXX)
node support/build/experimental-backend-deps-6b9d856/prepare.cjs \
  6b9d8561781cc061579b6324e4a5356459b98df4 "$experiment/run"
cat "$experiment/run/experiment.json"
```

The output directory must be new. `source/` is the original control context with
the committed Dockerfile, `inputs/` is the dependency context, `overlay/` is the
remaining source, and `BackendDeps.Dockerfile` is the candidate recipe. Do not
build the candidate with `source/` instead of `overlay/`: it would overwrite npm
side effects. Do not edit/reuse a generated dependency context between trials.

## Explicit export/import and fresh-executor measurements

These are manual, opt-in commands, **not** a CircleCI configuration change. Use
the same architecture, CircleCI resource class, Docker/Buildx versions and target
for each pair. The example targets `test`; independently repeat for `runtime`
before considering a production adoption. Choose the executor's native platform
explicitly (example `linux/amd64`); do not compare emulation with native execution.
Record the resolved Node base digests and pinned frontend from plain build logs.
If resolved toolchain inputs differ, discard the pair.

On executor A, generate the snapshot above and create two empty isolated builders
(no shared warm builder). Builder creation may download BuildKit; record that
bootstrap separately from build timings. Use unique names if these exist.

```bash
platform=linux/amd64
docker buildx create --name backend-deps-control-a --driver docker-container
docker buildx create --name backend-deps-candidate-a --driver docker-container
docker buildx inspect backend-deps-control-a --bootstrap
docker buildx inspect backend-deps-candidate-a --bootstrap

/usr/bin/time -p -o "$experiment/control-cold.time" \
  docker buildx build --builder backend-deps-control-a --platform "$platform" \
  --progress=plain --target test --load -t backend-deps-experiment:control \
  --cache-to "type=local,dest=$experiment/cache-control,mode=max" \
  --metadata-file "$experiment/control-cold.metadata.json" \
  -f "$experiment/run/source/Dockerfile" "$experiment/run/source" \
  >"$experiment/control-cold.log" 2>&1

/usr/bin/time -p -o "$experiment/candidate-cold.time" \
  docker buildx build --builder backend-deps-candidate-a --platform "$platform" \
  --progress=plain --target test --load -t backend-deps-experiment:candidate \
  --build-context "backend_dependency_inputs=$experiment/run/inputs" \
  --cache-to "type=local,dest=$experiment/cache-candidate,mode=max" \
  --metadata-file "$experiment/candidate-cold.metadata.json" \
  -f "$experiment/run/BackendDeps.Dockerfile" "$experiment/run/overlay" \
  >"$experiment/candidate-cold.log" 2>&1

du -sk "$experiment/cache-control" "$experiment/cache-candidate"
tar -C "$experiment" -czf "$experiment/executor-transfer.tgz" \
  run cache-control cache-candidate
```

`mode=max` is required to export intermediate dependency layers. A Docker daemon
image tag, a warm npm download cache or CircleCI's unrelated layer cache is not
this experiment's export. Use only local cache exporters; there is no registry
cache, push flag or publication step. Treat exported caches as build artifacts
containing dependency/source data. Export duration and compressed transfer bytes
belong in the performance accounting.

Transfer `executor-transfer.tgz` using the existing approved artifact/workspace
mechanism **to a genuinely fresh executor B**, unpack it into a new temporary
directory and set `experiment` to that directory. Confirm `experiment.json` and
cache `index.json` files arrived. Generate no hidden dependency installs on B.
Create fresh `backend-deps-control-b` and `backend-deps-candidate-b` container
builders and bootstrap them as on A. Then run the following imports; export to
**new** paths, never to the cache directories being imported:

```bash
platform=linux/amd64
docker buildx create --name backend-deps-control-b --driver docker-container
docker buildx create --name backend-deps-candidate-b --driver docker-container
docker buildx inspect backend-deps-control-b --bootstrap
docker buildx inspect backend-deps-candidate-b --bootstrap

/usr/bin/time -p -o "$experiment/control-import.time" \
  docker buildx build --builder backend-deps-control-b --platform "$platform" \
  --progress=plain --target test --load -t backend-deps-experiment:control \
  --cache-from "type=local,src=$experiment/cache-control" \
  --cache-to "type=local,dest=$experiment/cache-control-next,mode=max" \
  --metadata-file "$experiment/control-import.metadata.json" \
  -f "$experiment/run/source/Dockerfile" "$experiment/run/source" \
  >"$experiment/control-import.log" 2>&1

/usr/bin/time -p -o "$experiment/candidate-import.time" \
  docker buildx build --builder backend-deps-candidate-b --platform "$platform" \
  --progress=plain --target test --load -t backend-deps-experiment:candidate \
  --build-context "backend_dependency_inputs=$experiment/run/inputs" \
  --cache-from "type=local,src=$experiment/cache-candidate" \
  --cache-to "type=local,dest=$experiment/cache-candidate-next,mode=max" \
  --metadata-file "$experiment/candidate-import.metadata.json" \
  -f "$experiment/run/BackendDeps.Dockerfile" "$experiment/run/overlay" \
  >"$experiment/candidate-import.log" 2>&1
```

Measure two distinct imported-cache cases on separate fresh executors/builders:

1. Identical source: both control and candidate should reuse most work. Check the
   named dependency COPY and seven-install RUN are `CACHED` in candidate logs.
2. Source-only change: on a fresh copy of `run/`, append the same harmless comment
   to an existing backend `.ts` source in **both** `source/` and `overlay/`, leaving
   `inputs/` untouched. Import A's original caches. Control must rerun its seven
   installs; candidate must retain its cached dependency COPY/RUN while rerunning
   compilation and downstream source-dependent work. Use new cache export paths.
   Record the exact edited path/comment as a synthetic source probe; the original
   `experiment.json` source fingerprint describes the unmodified snapshot.

Also change a manifest/lock or local tarball on an appropriately validated
committed ref and verify the dependency COPY/RUN misses. Unit tests already check
these fingerprints, but actual BuildKit invalidation should be measured before
acceptance. The generator never silently falls back to a working-tree ref.

Repeat at least three independent fresh-executor pairs in alternating order.
Keep logs, source/input fingerprints, platform, resource class, Docker/Buildx
versions, base digests, stage timings, image sizes, export bytes/times, restore
transfer time, load time and total wall time. Report medians and range, and
include restore/export overhead in the total. A warm local rebuild is only a
mechanism check, not CircleCI performance evidence. A different local builder
also does not establish fresh-executor performance.

Before adoption, compare the control/candidate runtime and test filesystems,
dependency versions and symlink/bin targets after the real graph installs.
Exercise startup/module loading, demo-hook discovery, the original production
prune and integration suites using each local image through a separately named
temporary Compose override. Do not edit existing integration or CI files. The
synthetic tests cannot establish full application/image parity. Angular and the
remaining compilation stages may still dominate total build time.

Remove only the named experimental builders with `docker buildx rm <name>` after
collecting results. No helper here builds, publishes, creates CI jobs or changes
the checkout's dependency graph automatically.
