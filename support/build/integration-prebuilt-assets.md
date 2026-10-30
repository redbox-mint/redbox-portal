# Integration startup asset reuse

`integration-prebuilt-assets.cjs` is a producer/verifier for the
Mocha and Playwright **portal** startup scripts. Reuse is disabled by default.
It is a separate contract from image candidate/promotion metadata.
JavaScript validation uses the root package's existing exact-pinned production
dependency `typescript` (5.9.3). The builder and final test image must retain that
package in root `node_modules`; the current test target copies the builder's
root dependency tree. No Angular workspace, Angular compiler execution, extra
dependency, or install at startup is needed for validation. This helper cannot
run before the root dependencies are installed.

## Image producer integration

After **all** production Angular application builds, webpack, and any final
asset copies have completed in the trusted image build, run:

```bash
node support/build/integration-prebuilt-assets.cjs generate "$SOURCE_REVISION"
```

The working directory must be the application root (normally
`/opt/redbox-portal`); alternatively append that directory as the final argument.
`SOURCE_REVISION` must be the full lowercase Git SHA of the source actually built,
passed explicitly by the build/CI owner. No Git checkout or pre-existing metadata
is assumed inside the image. Do not stamp one revision onto assets restored from
another revision without separately validating their build inputs.

The generator discovers every application builder in `angular/angular.json`,
requires the ten applications used by Playwright, and requires nonempty main
bundles and index pages in both `assets/angular` and `.tmp/public/angular`.
Each index must reference its local main bundle. The validator follows local
script/link/image references, module preloads, literal static/dynamic JavaScript
imports and re-exports, `new URL(..., import.meta.url)` resources, and CSS
`@import`/`url(...)` references recursively. Missing polyfills, styles, imported
chunks, and CSS resources are rejected **before** metadata is written. Empty
Angular CSS is valid (Angular emits it for apps without global styles); required
main/webpack bundles and other referenced resources must be nonempty.
It also requires the webpack client/CSS/vendor bundles and served fonts.
It records size and SHA-256 for **every file** in `assets` and `.tmp/public`,
including fonts, copied static files, lazy chunks, and maps.
It rejects symlinks and incomplete payloads.

Relative URLs resolve beside the importing artifact. An index's local absolute
`base href` is a deployment prefix, not a disk path: `/` and `/portal/` are
supported, and relative output files remain beside that index. Absolute asset
URLs must be under that base; app-local filenames map beside the index and
public-tree paths map under `assets/` or `.tmp/public/` respectively. Query
strings/fragments are stripped, HTML entities and URL escapes are decoded.
Traversal (`..`, including encoded forms), backslashes, controls, double encoding,
unsupported schemes, relative/external base URLs and multiple bases fail closed.
HTTP(S), protocol-relative and data references are external and are not fetched
or covered by the local integrity guarantee. The TypeScript JavaScript parser
distinguishes regex literals from division and import-looking strings/comments,
walks expressions inside nested template substitutions, and recognizes string
and substitution-free template module references. JavaScript escapes are decoded
before the same URL/path safety checks are applied. Parse diagnostics fail closed
before metadata is written; there is no regex-scanner fallback. The validator
handles Angular/esbuild emitted literal dependencies, not arbitrary computed
imports (including templates with substitutions) or runtime HTTP requests;
browser acceptance remains necessary for those and external resources. Literal
imports nested inside computed expressions are still visited.

**API documentation boundary:** `support/build/api-descriptors/generateAPIDescriptors.sh`
calls `npm run doc:api`, delegated to `packages/redbox-core/scripts/generate-openapi.ts`.
Its default output is `support/docs/generated/api/` (overridable with `--out-dir`),
and CircleCI's `generate-api-docs` job archives that directory. Webpack copies
`assets/` into `.tmp/public/`; it does not copy this generated docs directory.
Portal routes such as `/:branding/:portal/admin/api-docs/openapi.json` instead
call `BrandingController.renderSwaggerJSON` to build the document at request time.
The two-root inventory neither requires nor verifies `support/docs/generated/api`.
It must not be described as proof of generated API docs completeness. Any future
static docs copy must define its real served destination and required files,
then explicitly extend the producer/verifier contract and acceptance tests.

Copy these outputs together from the same build stage into the final test image:

- `assets/` and `.tmp/public/`, with their directory layout intact;
- `.redbox-ci/integration-assets.json` (revision and complete file inventory);
- `.redbox-ci/integration-image.json` (image source revision and manifest SHA-256);
- `support/build/integration-prebuilt-assets.cjs` and both startup scripts;
- the existing test dependencies (including root `typescript`) and backend compilation outputs.

Generate metadata after the final output-changing operation, or verify after
copying into the final image:

```bash
node support/build/integration-prebuilt-assets.cjs verify "$SOURCE_REVISION"
```

Both metadata files must come from the trusted image build, never startup or
host mounts. Their hashes detect corruption; they are not signatures and do not
establish trust in an arbitrary image. CI must select its immutable image/archive
by the existing trusted candidate identity/digest and pass that build's revision.
The generator does not build assets or establish a cross-revision cache key.

## CI consumer integration

Forward these settings explicitly into each **portal container**, using its
Compose environment/override configuration:

```text
CI=true
RBPORTAL_REUSE_PREBUILT_ASSETS=true
RBPORTAL_EXPECTED_IMAGE_REVISION=<full Git SHA of the tested build>
```

The expected revision comes from CI's tested checkout/candidate identity,
independently of the image metadata; do not read it back out of the image.
Setting variables only on the host does not forward them through Compose.
Neither startup script enables reuse automatically from `CI`, branch, or tag.

Before skipping a build, startup checks Linux `/proc/self/mountinfo`, the image
revision, the manifest revision/mode/checksum, and the complete current file
inventory. Missing, modified, additional, empty required, or corrupt artifacts
abort immutable mode with a nonzero exit; they never trigger npm downloads or a
repair build. Missing Mocha/nyc dependencies also fail. Verified mode skips both
webpack and Angular preparation, does not install Redoc, and sets
`WEBPACK_SKIP=true` for application lift. Shim generation, bootstrap, Mocha
discovery/config/reporter arguments, nyc coverage settings, and test exits remain
in their existing paths.

## Mounts and development

A full checkout mount, any mount at an ancestor of the application root other
than `/`, or a mount anywhere under the application root disables reuse. This
includes read-only mounts and mounts over metadata, packages, assets, Angular,
backend/config files, and support helpers. `.git` files/directories also identify
a source checkout. Test fixtures under `test/`, runtime `bootstrap-data/`, coverage
directories under `coverage/`, and report/attachment mounts under `.tmp/junit/`
and `.tmp/attachments/` are the only descendant mount exceptions. These do not
replace web build inputs. Mounts outside the application root, such as the
existing `/tmp/coverage` output mounts, do not affect the asset check.

Mounted mode deliberately rebuilds webpack even when reuse was requested or
`WEBPACK_SKIP=true` was inherited. Playwright also forces Angular rebuilding if
the Angular workspace is present, even if old bundles already exist. An image
with only backend/test support mounts and no Angular workspace keeps its existing
missing-bundle fallback. Angular finishes before webpack copies it into the
served output. When `$HOME/.nvm/nvm.sh` exists, the original development helper
loads and uses it. Otherwise the launcher scopes an adapter for only `nvm install`
and `nvm use` to that child, using installed Node/npm on PATH. It does not install
nvm or select the workspace's `.nvmrc` version: the installed runtime must support
the workspace's Angular version. The real helper still installs Angular
dependencies and builds common/custom libraries and applications in its existing
order; failures stop startup before webpack or nyc. Normal mode preserves
dependency installation and missing-bundle fallbacks; no manifest is required.
Without usable Linux mount information,
normal mode rebuilds while explicit reuse fails closed.

**Current Compose integration limitation (proposal, not wired):** the `redboxportal`
service in `docker-compose.mocha.yml` (`portal` profile) mounts `support/`,
`typescript/`, `tsconfig.json` and integration config. The `redboxportal` service
in `docker-compose.playwright.yml` (`ci` profile) mounts `support/`,
`app.integrationtest.js`, package manifests and integration config. Both files
live in `support/integration-testing/`. Their `mount` profiles additionally bind
the full checkout. All of these portal services classify as `mounted` even if
opt-in is injected. The CI/Compose owner must remove those source
overlays for the opt-in image profile, bake equivalent integration-only payloads
into the test image, or scope overlays to the fixture/report exceptions. Leave
the source-mounted development profiles intact. Do not remove host compilation
or source/type mounts without tracing their test consumers. The Dockerfile,
Compose configuration, CI forwarding, Angular helpers, browser-runner setup, and
Mocha host compilation are outside this change.

The future Docker/Compose integration must satisfy these steps together:

1. Bake the compiled backend/test-hook graph, `app.integrationtest.js`, support
   launchers/helper, exact package manifests and integration-only config now
   supplied by overlays into the test image. Trace each current consumer before
   removing an overlay; retain the separate browser runner's checkout mount.
2. Build all Angular applications and webpack from that same revision. Generate
   both metadata files after the last asset mutation and copy/verify both asset
   roots plus metadata in the final test image. Retain root `typescript` and check
   `node -p 'require("typescript/package.json").version'` there. The image needs no Angular
   workspace for reuse, but source-mounted development still needs build tools.
3. Define a separate immutable portal service/override with only fixture/runtime
   and output mounts from the allowlist above. In particular, the existing
   `support/`, app entry point, package manifest and config mounts must not remain.
   Inject integration config through baked files or a specifically traced runtime
   mechanism that does not replace web build inputs; do not broaden mount
   exceptions just to make existing overlays pass.
4. Inject all three opt-in variables into that portal container, deriving the
   expected revision independently from the tested candidate. Keep opt-in off for
   the existing development/mounted profiles. Verify `startup` returns `reuse`
   inside the final Compose container before collecting timings.

Until these steps and the acceptance runs below are complete, current CI remains
`mounted` and rebuilds; this helper alone provides no CI startup optimization.

## Local verification and remaining acceptance work

```bash
node --test support/build/integration-prebuilt-assets.test.cjs
bash -n support/integration-testing/run-mocha-redbox.sh
bash -n support/integration-testing/run-playwright-redbox.sh
```

Parser regressions cover quotes/slashes inside regex literals, division, nested
template imports, JavaScript-escaped filenames/traversal/schemes, resource URLs,
and malformed JavaScript in both roots. When Angular workspace dependencies are
installed, the tests use the actual pinned Angular 20 application builder with
production optimization and hashed outputs to compile exactly:

```js
console.log(/"/.test(document.title)); document.body.addEventListener('click',()=>import('./lazy').then(m=>console.log(m.lazy)));
```

The complete real output must generate and verify successfully. Removing its
emitted lazy chunk from either root must reject generation without writing either
metadata file. The build uses a disposable workspace and disabled Angular cache;
it neither installs packages nor changes shared outputs. Another test copies the
actual compiled local-auth output from each root into disposable fixtures and
generates/verifies it. These two integration checks explicitly skip when their
local dependencies or outputs are absent; check for zero skips when collecting
evidence for this review finding. The installed CLI major need not match the
builder: the reproduction invokes the Angular 20 builder through Architect.

The tests use disposable directories inside this checkout, real manifest
generation/verification, synthetic Linux mount information, and stubbed npm,
Angular CLI, loader and nyc commands. Additional tests execute the repository's
actual `compileDevAngular.sh` under Bash with and without nvm; only npm/ng and
dependency resolution are isolated from downloads. They exercise existing old
bundles with changed mounted sources, library/application ordering, rebuilt
output reaching webpack, and shell exit propagation. They verify both scripts'
command paths,
coverage/JUnit/bootstrap arguments, download/build avoidance, forced mounted
rebuilds, and failure status propagation. They do not run the portal, browsers,
or real coverage collection/shutdown. The CI owner must still run the full Mocha
and Playwright suites against a generated immutable image, compare test/report
counts and source mappings, verify real coverage after shutdown, and inject a
browser failure before enabling reuse. No CI performance improvement is claimed
until those image-backed runs and timings are collected.
