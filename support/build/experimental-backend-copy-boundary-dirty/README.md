# Dirty-recipe backend COPY-boundary experiment

This is a separate, default-off experiment. Nothing in the production Dockerfile,
CircleCI, publication, npm scripts or existing rehearsal helpers selects it.
Preparation writes only a new local output directory; it never invokes Docker,
installs application dependencies, exports caches or publishes anything. The tests
install synthetic local packages offline in temporary directories. Do not replace
the production Dockerfile or connect this experiment to CI on this evidence.

It builds on [the committed-baseline experiment](../experimental-backend-deps-6b9d856/README.md)
without editing that experiment or borrowing its reported Docker results. That
generator remains the Git-only historical control. This generator intentionally
captures the **working tree, including dirty and untracked Docker-included files**.
The current recipe contains the web-assets and integration-image changes already
under rehearsal review; they are copied as source, never edited by this helper.

## Audited identity and narrow transformation

The checked-in `audited/` files are byte-for-byte review fixtures for the dirty
source recipe and policy. The helper requires these identities, without a bypass:

| Source | SHA-256 |
| --- | --- |
| `Dockerfile` | `179aff0705261a4d6d00ee3793722528b674c8b8eb8c599973b402ff5d1d063c` |
| `.dockerignore` | `2e14c1fad4ffe98e558fcb9214023db58ffd7494ac2fddee84dbdea155692a6b` |

Any recipe or ignore-byte change, including whitespace, refuses preparation.
Re-audit the boundary and ignore model before creating a different experiment.
There is no automatic fallback to HEAD, the old recipe or an arbitrary ignore
parser. Dockerfile-specific ignore overrides are rejected.

Only the original `backend_builder` opening changes in the generated recipe:

1. Add an empty `backend_dependency_inputs` scratch stage as a fallback for the
   explicitly supplied named context. Omitting that context fails instead of
   resolving an implicit registry image.
2. Add `backend_dependencies FROM base`, copy the input context into the original
   `/opt/redbox-portal/`, and run the **exact original seven-install RUN**.
3. Keep the original `backend_builder` name, inherit `backend_dependencies`, and
   apply `COPY . .` from the source overlay.

The install block remains root `npm ci --no-audit`, then agenda-sqs-backend,
sails-ng-common, raido, rva-registry (`npm ci --no-audit`), redbox-core
(`npm install --no-save --no-audit`), and storage-mongo (`npm ci --no-audit`).
No flags, lifecycle policy, ordering, toolchain or cache mounts change.

Everything before this boundary and after the install block remains byte-for-byte
identical. All existing names/targets survive: backend_builder, web_assets_local,
web-assets, web_assets_shared, builder, test_dependencies, production_dependencies,
runtime_application, runtime, runtime_puppeteer_base, runtime_pdfgen, test,
integration_development_dependencies, integration_payload, integration_mocha and
integration_playwright. The last anonymous `FROM runtime` remains the default.
The existing local/shared web branch selection, named asset context, validation,
`assets`, `.tmp/public` and `.redbox-ci` paths are untouched. The published test
overlay and the separate integration development graph retain their existing
different dependency assembly; this experiment does not assert they are equal.

## Input and overlay contract

The early input partition conservatively contains root `package.json`,
`package-lock.json`, `.npmrc`, `.npmignore`, and **every Docker-included entry under
`packages/`**. This includes package source, nested manifests/locks/config,
packing inputs, executable bins, local tarballs and empty directories. The exact
pinned ignore policy applies first: host node_modules, dist, coverage and secrets
excluded by that policy never enter either partition. Integration test/support
source stays included by the current policy. Root-only glob rules retain their
root-only behavior; the model is not a generic glob implementation.

The overlay is the disjoint remainder, including backend/Angular application
source. It contains no root dependency inputs and no `packages` directory. This
prevents COPY from reverting npm's lock rewrites, local-bin chmods or writes to
existing package files. Stage inheritance retains installed trees, symlinks and
side effects outside the workdir; there is no node_modules artifact transfer.
Modes are actual working-tree permission bits, including directory modes,
preserved explicitly against umask. Ownership, timestamps, ACLs and xattrs are
not captured as source identity. Fingerprints include path/type/mode/content and
directory presence; they do not model BuildKit's complete cache key.

The carried-forward dependency validators retain exact direct version checks,
local path containment, lock v3, reviewed lock/peer inventories and a narrow
npm-config allowlist. The old inventories are read with pinned content hashes.
The only additional admitted lock spec is the dirty root lock's exact
`0.20.1-ts7.1.0-beta` for tsrs and its platform optional packages. Root
`ignore-scripts=true` is required; nested npm invocations retain their original
configuration behavior. Local install/prepare hooks, workspaces/bundles,
shrinkwrap, binding.gyp, unknown configuration and unsupported resolutions fail
closed rather than extending the assumed input closure.

Preparation also rejects included symlinks/devices, special permission bits,
unsafe paths, missing required inputs, output inside the source tree (including
parent symlink aliases) and output reuse. Ignored host links are not followed.
Per-read stat checks plus two matching complete scans reject observed source
changes. **This is not an atomic snapshot**: use a quiescent checkout, inspect the
inventory and discard any run taken during concurrent edits. Validation completes
before output creation. An I/O failure during materialization can leave a partial
directory; discard it and select a new output path.

The boundary remains conditional on third-party lifecycle behavior. Root npmrc
does not generally apply to a separate nested npm project. Registry/tarball/Git
scripts may read omitted application source, depend on mutable network state, or
write a path later supplied by the overlay. These cases require investigation
on the real graph. `redbox-core` still uses resolving `npm install --no-save`;
cached and uncached graphs may differ. Base tags, apt and nvm remain mutable.
This experiment provides neither hermeticity nor a new dependency graph policy.

## Local checks and explicit preparation

Use Node 22+ on Unix with host npm, bash, tar and mkfifo. No repository npm install is required.
There are no Docker tests or opt-in Docker execution hooks in this directory.

```bash
node --test support/build/experimental-backend-copy-boundary-dirty/prepare.test.cjs \
  support/build/experimental-backend-copy-boundary-dirty/offline-install.test.cjs
```

Implementation validation passed all 12 tests with no skips on host Node
22.23.2/npm 10.9.8, Linux arm64. The offline parity fixture compared 61 installed
filesystem entries. A temporary snapshot of the real dirty checkout also
round-tripped the source/input/overlay fingerprints and generated recipe hash;
its input partition contained 1,220 files. No Docker commands were run.

The synthetic fixture executes the unchanged seven commands through host bash,
using only file dependencies and npm offline mode, an isolated home/config/cache
and no imported npm environment flags. Its tarball install lifecycle is skipped
by root config and runs in the nested project. It checks real local symlinks,
executable bin invocation/chmod, file/directory modes, empty directories, a lock
rewrite sentinel and the complete synthetic installed filesystem against the
original full-copy ordering. A negative control shows a full source overlay
reverting both the sentinel and bin mode. Other checks cover source-only stable
input fingerprints and changes to manifests/locks/config/source/tarballs/modes,
additions/deletions, ignore fixtures and rejection paths. These are host fixture
results, not BuildKit cache hits or native production startup evidence.

Generate an explicitly selected working-tree snapshot in a new local directory:

```bash
experiment=$(mktemp -d /tmp/redbox-backend-copy.XXXXXX)
node support/build/experimental-backend-copy-boundary-dirty/prepare.cjs \
  --working-tree "$PWD" "$experiment/run"
```

Inspect `experiment.json`: it records source kind, recipe/policy/candidate hashes,
three partition fingerprints, and every included path/type/mode/content digest.
It makes no Git commit provenance claim. The generated `source/` retains the
original Dockerfile and ignore file for the control; these two build metadata
files are excluded from the COPY inventory/fingerprint and identified separately.
`inputs/`, `overlay/` and `BackendDeps.Dockerfile` are the candidate. Do not build
the candidate with `source/` as its main context. Do not edit dependency contexts
between trials or confuse a dirty snapshot with the older committed snapshot.
Review dirty/untracked inputs before moving any generated snapshot or cache.

## Manual BuildKit and fresh-executor runbook (not executed)

These are future, separately authorized local trials. No CI triggers, pushes,
registry exporters or publication steps are provided. Use local tags and cache
directories only. Create dedicated empty builders for control and candidate,
record bootstrap/download overhead separately, and avoid global prune. Select
one native architecture explicitly; `linux/amd64` below is an example, not a
claim that this checkout or host has been verified on amd64.

On executor A, after preparation and inventory review:

```bash
platform=linux/amd64
docker buildx create --name backend-copy-control-a --driver docker-container
docker buildx create --name backend-copy-candidate-a --driver docker-container
docker buildx inspect backend-copy-control-a --bootstrap
docker buildx inspect backend-copy-candidate-a --bootstrap

/usr/bin/time -p -o "$experiment/control-cold.time" \
  docker buildx build --builder backend-copy-control-a --platform "$platform" \
  --progress=plain --target test --build-arg WEB_ASSETS=local --load \
  -t backend-copy-experiment:control \
  --cache-to "type=local,dest=$experiment/cache-control,mode=max" \
  --metadata-file "$experiment/control-cold.metadata.json" \
  -f "$experiment/run/source/Dockerfile" "$experiment/run/source" \
  >"$experiment/control-cold.log" 2>&1

/usr/bin/time -p -o "$experiment/candidate-cold.time" \
  docker buildx build --builder backend-copy-candidate-a --platform "$platform" \
  --progress=plain --target test --build-arg WEB_ASSETS=local --load \
  -t backend-copy-experiment:candidate \
  --build-context "backend_dependency_inputs=$experiment/run/inputs" \
  --cache-to "type=local,dest=$experiment/cache-candidate,mode=max" \
  --metadata-file "$experiment/candidate-cold.metadata.json" \
  -f "$experiment/run/BackendDeps.Dockerfile" "$experiment/run/overlay" \
  >"$experiment/candidate-cold.log" 2>&1
```

Discard pairs with different resolved base/frontend/toolchain identities. Save
the snapshot, `experiment.json`, caches (including index/blob files), logs and
timings. `mode=max` must include intermediate layers. Account for cache export
duration/size, compressed transfer bytes and transfer/restore time. A local image
tag or a warm npm download cache is not an exported dependency-layer cache.

Move these artifacts to a **genuinely fresh executor B** using a separately
approved artifact mechanism. Verify the snapshot/caches after transfer; do not
regenerate from a different dirty checkout. Create/boot fresh
`backend-copy-control-b` and `backend-copy-candidate-b` builders as above. Repeat
the same pair of build commands with builder names ending in `-b`, adding the
matching `--cache-from type=local,src=.../cache-control` or `.../cache-candidate`.
Use new `cache-control-next`/`cache-candidate-next` export paths and fresh output
logs/timing/metadata. Never overwrite a cache directory being imported.

Use separate fresh imported-cache trials for each case:

1. Identical snapshot: confirm dependency COPY and the seven-install RUN cache
   hits and inspect the complete logs, not just total elapsed time.
2. Source-only edit: on a disposable copy of the generated run, append the same
   harmless comment to one backend source file in both `source/` and `overlay/`.
   Leave `inputs/` unchanged; record the exact patch and new fingerprints because
   the original report describes the unmodified snapshot. Control should rerun
   installs; candidate should reuse the input COPY/install and rerun compilation.
3. Dependency-input edit: prepare a separately validated snapshot with a safe
   local package source or bin-mode change and unchanged recipe/policy. Import
   the original caches. Candidate's dependency COPY/install must miss. Repeat
   with a valid manifest/lock change and tarball change before accepting the
   intended invalidation contract. Fingerprint unit tests alone cannot prove it.

Repeat at least three fresh-executor pairs, alternating order, for every native
architecture/resource class in scope. Record Docker/Buildx/BuildKit/npm/Node
versions, platform, resolved digests, stage cache hits/timings, image sizes,
export/import/load/transfer durations and bytes, and total wall time. Report
medians/ranges with all overhead included. Local warm rebuilds, a second local
builder and emulation do not establish fresh-executor native cache performance.
Remove only the builders/tags created for these trials after retaining evidence.

## Required parity gates and present evidence limits

Before adoption, independently build control/candidate for runtime, test, PDF and
integration targets on the intended native architectures. Compare their real
installed package/version/location graphs, nested dependency trees, bin/link
targets, modes, root/nested locks and complete relevant filesystems after build,
production reinstall/prune and test snapshot overlay. Check Companion's nested
Express/session resolution and hook discovery. Never compare the integration
direct development graph to the published test overlay as an equivalence control.

Exercise native module loading, portal startup/health, demo/PDF hooks and the
integration suites with separately named temporary local Compose overrides.
Retain compile order and web output/metadata validation evidence on both branches.
Shared web-assets and integration metadata require a source identity that
truthfully identifies the captured dirty content; do not stamp HEAD or host
bundles as that identity. Resolve this with an immutable reviewed source and
matching verified asset context before testing those paths. This generator does
not bypass or rewrite their existing metadata contracts.

**Still unverified:** real BuildKit COPY/ignore parity and invalidation, actual
cache export/import on a fresh executor, architecture compatibility, real npm
graph equivalence, native module/application startup, full target/web-branch
parity and end-to-end cache performance. No speedup or adoption readiness is
claimed. The synthetic tests and successful local preparation establish only the
generator's reviewed boundary, filesystem preservation mechanics and refusal
behavior within their stated scope.
