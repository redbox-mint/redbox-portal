# Shared production web assets

This is the PR4 producer/consumer contract with a default-off Docker consumer.
CircleCI, Compose, integration startup and production publication selection are
unchanged. The artifact contains no native dependency trees and adds no dependencies.
Use Git, Bash, npm and the exact Node version in both `.nvmrc`
files, on Linux AMD64 or ARM64. An installed nvm is required by the existing
Angular build script. Select that Node before invoking this helper.

The **only payload manifest** is the existing
[`integration-prebuilt-assets.cjs`](../integration-prebuilt-assets.cjs) contract:
`.redbox-ci/integration-assets.json` and `.redbox-ci/integration-image.json`.
This helper calls its generator and verifier unchanged. To preserve that complete
inventory it transfers **all of `assets/`**, including `assets/angular/`, plus
**all of `.tmp/public/`** and those two metadata files. This includes compiled
client JS, Angular indexes/main/lazy chunks/maps/styles, webpack bundles,
Bootstrap/jQuery/Redoc, images and fonts. Empty directories and filesystem
ownership are not part of the file manifest; extracted files use mode 0644 and
payload directories use 0755 regardless of umask. The staging root remains 0700.

## Commands

All paths below are absolute. `REV` must be the full lowercase SHA actually
checked out, including any lock-refresh commit. `ROOT` is a clean disposable
checkout, **not a developer's mounted workspace**. New artifact/stage directories
must not exist and must be outside `ROOT`; their parents must already exist.
Reserve a unique workspace path per revision and workflow attempt.

```bash
REV="$CIRCLE_SHA1"
ROOT="$PWD"
HELPER="$ROOT/support/build/ci-web-assets/cli.cjs"
ARTIFACT="/tmp/web-assets-$REV-$CIRCLE_WORKFLOW_ID"
STAGE="/tmp/web-assets-stage-$REV-$CIRCLE_WORKFLOW_ID"

# No Angular/root dependency installation needed to calculate the cache key.
node "$HELPER" key "$REV" "$ROOT"

# Builds prerequisites + production Angular + webpack, validates, then packages.
# Build logs go to stderr; stdout is a JSON receipt containing key, directory,
# and descriptorSha256. Save the receipt outside the checkout too.
node "$HELPER" produce "$REV" "$ROOT" "$ARTIFACT" > /tmp/web-assets-receipt.json

# Capture from the trusted producer receipt/workspace, independently of payload.
CHECKSUM=$(node -p 'require("/tmp/web-assets-receipt.json").descriptorSha256')

# On each native architecture: checkout the same REV, select the same Node/npm,
# and install the root dependencies needed by the existing TypeScript validator.
# The native image job can reuse its own existing dependency preparation.
node "$HELPER" verify "$REV" "$ROOT" "$ARTIFACT" "$CHECKSUM"
node "$HELPER" restore "$REV" "$ROOT" "$ARTIFACT" "$CHECKSUM" "$STAGE"
```

`verify` fully extracts into private temporary storage, verifies, then removes it.
`restore` does the same validation and renames into `STAGE` only on success.
Normally use **restore alone** to avoid doing extraction twice. Neither command
changes source files, mounted assets or existing destinations. Both require the
existing root `typescript` dependency for payload validation. They do not need
Angular dependencies or invoke build/install commands.

Successful commands return 0. A `verify`/`restore` miss returns **10** and prints
`WEB_ASSETS_CACHE_MISS` plus the rebuild instruction. Missing/corrupt artifacts,
wrong revisions, input/tool/flag mismatches and unsafe archives are misses.
Malformed CLI usage and failed producer builds return 1. Never ignore these
statuses or stamp new metadata onto old payloads.

## Identity and trust

`key` is the SHA-256 of a deterministic build identity, containing the exact
revision, a sorted SHA-256 inventory of **every tracked file and executable
mode**, executing helper/validator digests, Node/npm and locked build-tool versions, production settings, explicit
worker/Node flags and commit-derived `SOURCE_DATE_EPOCH`. All lockfiles, Angular
projects, backend/shared-library source, helpers, `.npmrc`, local package
inputs, the Agenda tarball, styles and fonts are therefore covered. Bare relative
and absolute dependency paths, bare tarball names and `file:` references are
checked in dependency declarations and lock resolutions. Local dependency
targets must resolve inside the checkout to tracked files or directories with
tracked manifests; external targets and all symlink aliases are rejected. Home
paths, local Git URLs and ambiguous local path spellings (percent escapes,
backslashes, URL query/fragment punctuation and `file:/../` forms) are unsupported.
Registry URLs, npm registry aliases and remote Git URLs remain supported. This check
includes transitive tracked manifests and local references in lockfiles and
shrinkwrap files. Every referenced local file is also inspected as an npm tarball,
regardless of its filename or the outer lock's `hasShrinkwrap` metadata. Embedded
`npm-shrinkwrap.json` files are unsupported and always rejected: their dependency
locations can introduce mutable inputs outside the tracked archive. Accepted
local tarballs are plain ustar (raw or gzip), with regular files/directories under
`package/`, a regular `package/package.json`, unique paths, a complete zero trailer,
at most 10,000 entries and 64 MiB each of compressed and expanded data. Links,
PAX/GNU extensions, ambiguous paths and malformed/opaque archives fail closed.
The tracked patched Agenda tarballs remain supported. This is
deliberately conservative: backend-only and documentation commits also miss.
There is no cross-revision reuse. Changing the source/toolchain/contract changes
the key. Unsupported source symlinks/submodules, untracked source files, dirty
tracked inputs, differing root/Angular Node selections and external custom-form
repositories fail closed. Metadata from an earlier build may be present, but is
regenerated only after this build completes.

The producer accepts `NG_BUILD_MAX_WORKERS` (default 2, Angular internal workers;
application concurrency remains controlled by the existing production helper)
and `NODE_OPTIONS`; both enter the key. Only `--max-old-space-size=N` and
`--max-semi-space-size=N` with positive integer values are supported in
`NODE_OPTIONS` (separated by whitespace). Preloads, loaders and all other Node
options are rejected because they can introduce unrecorded inputs or behavior.
Set them identically in producer and
consumer jobs. Other inherited build settings are removed. Build commands receive
fixed production/webpack flags, UTC/C locale and a commit timestamp. npm uses only
the committed project `.npmrc` plus an empty user/global configuration; inherited
`npm_config_*` values cannot alter installation. Private registries needing
environment-based credentials require an explicit, fingerprinted contract update.
Pre-existing local/generated webpack configuration and unexpected ignored asset
inputs are rejected. Start from a fresh CI checkout so ignored generated backend
or Angular sources cannot serve as unrecorded inputs.

`artifact.json` records the identity/key, producer OS/architecture, integration
manifest digest and archive size/SHA-256. Its own SHA-256 is returned in the
receipt and saved in `artifact.json.sha256`. Keep that receipt/checksum with the
immutable trusted workspace artifact. These are integrity hashes, not signatures:
the workspace/cache writer must be trusted, and untrusted jobs must not populate
caches used for publication. Never use a broad cache-prefix fallback. A party
able to replace both payload and expected receipt can forge hashes.

Archives use exactly one streamed gzip member with a ten-byte header and no
optional header fields. The compressed stream boundary, CRC32 and uncompressed
size trailer are verified; extra members and all appended bytes are rejected.
The narrow ustar format allows regular files only, safe
relative paths under the two asset roots or the two exact metadata paths, no
symlinks/hardlinks, devices, PAX/GNU overrides or path traversal. Duplicate paths,
bad headers/padding/trailers, truncation and appended payloads are rejected.
Extraction is limited to 4 GiB uncompressed, 1 GiB per file and 100,000 entries;
ustar path fields limit filename/prefix to 100/155 UTF-8 bytes. These bounds cover
the current outputs. Destinations use private empty staging and exclusive file
creation; callers must use distinct destination paths, with one writer each.

## Build and integration points

`prepare.cjs` runs root `npm ci --include=dev`, then locked native installs for
Agenda SQS, RAiD, RVA, sails-ng-common and redbox-core. It compiles those packages
in dependency order and root TypeScript to emit the webpack client entry. Core
provides the compiled webpack hook/config; Angular and client JS need the compiled
shared models. It then runs **the existing full `compileProductionAngular.sh`
followed by `npm run webpack`**, serially. Both web output trees are cleared before
building; webpack cannot copy partially built Angular outputs. Installed tool
versions must match their locks. Source identity is checked before/after build
and packaging; every archived byte must match the integration inventory.
The helper does not build demo/PDF hooks, install Chromium, prune/snapshot
dependencies, run application services or repeat the Docker image assembly.

CircleCI wiring:

1. Build/restore once in an asset producer job, after any dependency refresh and
   explicit checkout of its resulting revision. An exact-key cached candidate
   must pass `restore`; on exit 10, rebuild with `produce` in this job using a
   new output path and persist the new artifact/receipt. Never overwrite the
   rejected candidate. Missing or bad cache entries never skip compilation.
2. Attach that same artifact/receipt to AMD64 test/runtime and native ARM64 jobs.
   Restore with each job's exact source identity. A miss at this required-workspace
   boundary fails the job; repair/re-run the producer, rather than let the two
   architectures build unrelated replacement assets.
3. Select the Docker consumer as described below. It copies the restored web roots
   and metadata **after native backend compilation**, replacing prior web roots,
   and omits Angular/webpack from that branch. The named context avoids
   `.dockerignore` silently omitting `.tmp` or metadata.
4. The Docker consumer retains the same metadata in final test/runtime/PDF images
   and runs the existing integration verifier after the final web copies. Shared
   integration targets verify it too; they never regenerate a manifest. Keep
   native installs/backend builds per architecture; never transfer `node_modules`
   or native binaries with this artifact.
5. Forward immutable-image opt-in/revision settings following
   [`integration-prebuilt-assets.md`](../integration-prebuilt-assets.md). Its mount
   detection and source-mounted rebuild behavior are unchanged by this helper.

Redoc's browser bundle is included. The separate API generator defaults to
`support/docs/generated/api/`, outside both web roots, and is not packaged here;
keep the dedicated API documentation job. If that site becomes runtime content,
explicitly copy it into a web root **before** manifest generation and update this
versioned build contract. No runtime-generated API site is claimed as present.

## Opt-in Docker builds

Ordinary `docker build .` and all existing targets use `WEB_ASSETS=local`, execute
Angular then webpack as before, and need neither a context, revision nor digest.
Local immutable integration targets still require `SOURCE_REVISION` and generate
their own metadata. This change does not enable immutable startup reuse: its
existing CI/revision settings and mounted-source fallback remain separate.

For the shared path, first run `restore` above with the independent, trusted
**descriptor** checksum. Then obtain the **manifest** checksum from that same
validated descriptor, checking its trust anchor again when reading it:

```bash
MANIFEST_SHA256=$(node - "$ARTIFACT/artifact.json" "$CHECKSUM" <<'NODE'
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const bytes = fs.readFileSync(process.argv[2]);
if (createHash('sha256').update(bytes).digest('hex') !== process.argv[3]) {
  throw new Error('Trusted producer descriptor checksum mismatch');
}
console.log(JSON.parse(bytes).manifestSha256);
NODE
)

docker buildx build --platform linux/arm64 --target runtime \
  --build-arg WEB_ASSETS=shared \
  --build-arg SOURCE_REVISION="$REV" \
  --build-arg WEB_ASSETS_MANIFEST_SHA256="$MANIFEST_SHA256" \
  --build-context web-assets="$STAGE" \
  --load -t redbox-shared-assets:arm64 .
```

Use the same restored payload and trust inputs for the native AMD64 build;
choose an appropriate native builder and platform. Existing `test`,
`runtime_pdfgen`, `integration_mocha` and `integration_playwright` targets accept
the same inputs. The final unnamed/default target remains the pristine runtime.
No published build command or image-selection policy is changed.

`WEB_ASSETS` selects `web_assets_local` or `web_assets_shared` after
`backend_builder`; BuildKit prunes the other branch. The empty `web-assets` stage
is a safe fallback: a supplied named context overrides it, while an omitted
context fails on missing files without pulling an implicit `web-assets` image.
An invalid selector fails stage resolution. Shared mode requires both the exact
40/64-character lowercase revision and a 64-character lowercase manifest SHA-256.
Missing files, wrong revision/digest, self-consistent forged metadata, changed
payloads and unexpected files fail the build. There is no silent rebuild on a
required shared-context miss. Re-run the producer, or deliberately select the
ordinary local path. Never calculate the expected digest from the supplied
context or its image-identity file: those are the bytes being checked.

Docker verifies the trust digest plus the existing complete integration inventory
on import and again after copying assets into `runtime_application`. Read-only
BuildKit mounts provide the native builder's validator and TypeScript for that
final check; they add no dependencies to the final image. Producer metadata is
copied byte for byte and inherited by runtime, test and PDF targets. Subsequent
copies affect packages/config/support only; the PDF install uses `--ignore-scripts`.
Shared integration targets verify again instead of generating metadata. Native
backend compilation, production `npm ci --omit=dev`, the published test image's
production-plus-development-snapshot overlay, and optional hook selection retain
their existing assembly. No native dependencies are imported from the context.

Docker checks the revision against the caller's argument; it cannot independently
identify a Git-free build context. The caller must check out that exact revision
and use the existing `restore` identity checks before invoking Docker. Hashes are
integrity checks backed by the trusted producer receipt, not signatures.

## Verification and remaining measurements

```bash
node --test support/build/ci-web-assets/assets.test.cjs
node --test support/build/docker-web-assets.test.cjs \
  support/build/docker-image-contract.test.cjs \
  support/build/integration-prebuilt-assets.test.cjs
docker buildx build --call=targets -f Dockerfile .
RB_WEB_ASSETS_COMPARE_EXISTING=true node --test \
  --test-name-pattern='optional real existing' support/build/ci-web-assets/assets.test.cjs
```

Tests use disposable miniature Git checkouts under this new directory, with
independent producer/consumer checkouts. They check full file comparisons,
deterministic archives, revision/source/tool/flag invalidation, missing/corrupt
payloads, required applications, path/link attacks, failure cleanup, untouched
source destinations and the explicit miss status. Offline npm regressions replace
an external tarball and use fresh caches to verify that `npm ci` installs changed
bytes through bare declarations and lock resolutions while tracked sources stay
unchanged; identity rejects those inputs. Additional offline `npm ci` regressions
exercise tracked parent tarballs with embedded shrinkwraps using bare `resolved`
paths, legacy `version` paths and symlink aliases to mutable external tarballs.
Boundary tests cover missing/false `hasShrinkwrap`, opaque shrinkwraps, archive
extensions/aliases, framing and size/entry limits. The current repository's local
dependencies and both patched Agenda archives are checked directly. The optional test compares
all existing output bytes through archive extraction and separately reports
whether those existing development outputs pass the production validator; it
does not publish them or treat incomplete outputs as production-ready.

Full cold producer execution, cached-versus-uncached compilation comparison,
native ARM64 startup, application concurrency benchmarks and actual CircleCI
transfer/cost measurements still belong to the integration acceptance run. This
shared working tree is dirty with concurrent changes, so it must not be labeled
as the clean revision by a production build.

Actual clean cross-architecture Docker builds and Node 24/26 output/runtime
equivalence remain unverified. The producer requires the committed Node 24
selection, while the Docker native backend/runtime currently use Node 26; the
shared path preserves those selections and does not establish equivalence. A
lightweight fixture build validates Docker stage/context/mount mechanics only,
not full production compilation, native startup, PDF generation or performance.
