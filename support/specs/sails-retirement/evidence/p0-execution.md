# SR-002 — Exact Node 26 execution and dependency audit

Baseline source `a49366803164429f9d8bdd249dadcdf856c9d13e`; inventory commit
`9b1538075a5274a49816f62c157e052753130611`. Checks used that source plus the P0
execution/configuration edits recorded in this branch's following commits. Actual
comparison host remains Sails. Package/function checks below do not run a portal.

## Selection and change reasons

- **Node 26.11.1 / npm 11.20.0**: root/PDF `.nvmrc`, CircleCI Node jobs, Node
  Compose runners and Playwright stubs now match the existing production Docker
  patch. Docker build/runtime and Node runners are pinned to observed image
  digests, and the remaining unpinned CircleCI image now has a digest too.
- **Playwright runner**: new `support/integration-testing/Dockerfile.playwright`
  copies that Node binary and npm into the browser image. The original browser
  image ran Node **24.21.0**, even though the application image already used 26.
  Browser image **1.64.0** now matches the exact existing `@playwright/test`
  dependency; the previous Compose image was 1.64.1. No npm dependency was changed.
- **Core Bruno portal image**: replace obsolete `feature-node24` with the same
  `RBPORTAL_IMAGE`/`develop` selection used by other suites. Full-image tests must
  supply the tested artifact explicitly; a mutable default tag is not a qualified
  release identifier.
- **API validation loader**: add Mocha's
  `--node-option no-experimental-strip-types`, already used by core tests. Native
  Node loading failed with `ERR_UNSUPPORTED_DIR_IMPORT`; ts-node handles this
  CommonJS/namespace/decorator code. Update the existing Mocha comment accordingly.
- **Guidance**: root README and the current wiki development/setup/compilation
  pages name the exact Node/npm pair. The coding standards now describe the
  actual shared tsconfig inheritance.

**Dependency changes: zero.** TypeScript **5.9.3**, ts-node **10.9.2**, Mocha
**11.7.6**, `@tsconfig/node24` **24.0.4/24.0.5**, existing Node type declarations
and conservative **ES2024** output remain. A compiler library/output baseline does
not select the executing Node. Updating these solely to rename a base would add
an unrelated compiler migration (`@tsconfig/node26@26.0.1` requests ES2025 and
ESNext.Temporal). Actual build/test execution is Node 26 and is recorded below.

Observed immutable image identifiers:

| Image | Digest |
| --- | --- |
| `node:26.11.1-bookworm` | `sha256:f1233c415b41ffcf237c717b3dea92e9d4ea006e0e4c71edcb790605d74f5404` |
| `node:26.11.1-bookworm-slim` | `sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567` |
| `cimg/node:26.11.1` index | `sha256:ad87b006a0177ed9ba62de0d93203b6466e0b18f3a4828a3a6e12aa5d1fb16f2` |
| `mcr.microsoft.com/playwright:v1.64.0-noble` | `sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f` |
| Built `redbox-portal:playwright-node26` (local amd64) | `sha256:bf21fe175f5d79664f9a68a4069e0b3d876d4aa923ae3be9b669668ab2ab124f` |

These were read with `docker image inspect` and
`docker buildx imagetools inspect cimg/node:26.11.1`. The CImg registry index was
inspected; CircleCI's cloud jobs were not executed here. Docker and direct Node
checks are Linux amd64, not arm64 qualification.

## Reproducible execution and real results

The host shell started on Node **24.18.0**/npm **12.0.2**. All checks reported as
Node 26 used either `docker run node:26.11.1-bookworm` or an isolated official
Node distribution under `.tmp/sails-retirement/toolchain/` with its `bin` prepended
to `PATH`. No global Node installation or branch was changed.

The downloaded `node-v26.11.1-linux-x64.tar.xz` was checked against Node's
`https://nodejs.org/dist/v26.11.1/SHASUMS256.txt`: SHA-256
`3883bfc73f9a680ca4eab04b196068aaaab1373ffa77d8fc1a4408222495b651`.
`versions-node26.json` records actual Node/npm, consumer paths and installed
package versions. `typescript-probe.cjs` writes only a disposable temp directory:
two assertions pass, with erasable native TS exit 0 and an enum's expected native
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` exit 1 (`node26-typescript.json`). This expected
native limitation is separate from passing ts-node/Mocha tests.

Commands actually run (Docker commands bind the checkout at its absolute path):

```sh
docker run --rm --user "$(id -u):$(id -g)" -e npm_config_cache=/tmp/npm-cache -v "$PWD:$PWD" -w "$PWD" node:26.11.1-bookworm npm ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
docker run --rm -v "$PWD:$PWD" -w "$PWD" node:26.11.1-bookworm sh -c 'npm ci --ignore-scripts --strict-peer-deps --no-audit --no-fund; result=$?; chown -R 1000:1000 node_modules; exit "$result"'
docker run --rm -v "$PWD:$PWD" -w "$PWD/packages/redbox-core" node:26.11.1-bookworm sh -c 'npm ci --ignore-scripts --strict-peer-deps --no-audit --no-fund; result=$?; chown -R 1000:1000 node_modules; exit "$result"'
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:$PWD" -w "$PWD/packages/sails-ng-common" node:26.11.1-bookworm sh -c 'npm run compile:clean && npm run compile'
docker build -f support/integration-testing/Dockerfile.playwright -t redbox-portal:playwright-node26 support/integration-testing
docker run --rm --entrypoint sh redbox-portal:playwright-node26 -c 'node --version; npm --version'
```

The first install exited **243**, because pre-existing `.cache/nyc` files were
owned by root (`logs/root-ci-initial.log`). Retry as container root succeeded:
**2,111 root packages**, **1,695 core packages**; permissions were restored to
workspace uid/gid 1000. Existing npm deprecation notices and the git dependency's
integrity-check notice are retained in the logs; install scripts were disabled.

For direct checks, this was the PATH prefix:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node --version
npm --version
npm --prefix packages/redbox-core run build
npm run validate:api-routes
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/loader/loader.test.ts test/loader/bootstrapShimRuntime.test.ts test/loader/MigrationRunner.test.ts test/hooks/hookDiscovery.test.ts test/hooks/hookResources.test.ts test/config/agendaQueue.test.ts test/config/brandingConfigurationDefaults.test.ts test/config/companionAuthorization.test.ts test/services/ConfigService.test.ts test/services/RecordTypesService.test.ts test/unit/persistence-foundation.test.ts test/unit/persistence-shutdown.test.ts
node support/specs/sails-retirement/evidence/typescript-probe.cjs
node support/specs/sails-retirement/evidence/versions.cjs
node support/specs/sails-retirement/evidence/characterize.cjs
npm run lint
```

| Check | Actual result / retained log |
| --- | --- |
| Shared model clean Node/browser compilation | Exit 0, `logs/common-build.log` |
| Core build (Prisma contracts → tsc → copy) | Exit 0, `logs/core-build.log`; no committed generated-contract delta |
| Focused loader/hook/config/pilot/owner/shutdown suites | **116 passing, 0 failing, 0 pending**, `logs/focused.log` |
| API contracts, corrected existing command | **49 passing, 0 failing, 0 pending**, `logs/api-routes.log` |
| Repository lint | Exit 0, **840 files, 0 warnings, 0 errors**, `logs/lint.log` |
| Built Playwright worker versions | Exit 0, **26.11.1 / 11.20.0**, `logs/playwright-versions.log` |
| YAML parse / Compose resolution | Exit 0 for CircleCI YAML and all six changed Compose files (below) |
| Exact dependency check | **10 root/server package manifests, 0 dependency/devDependency ranges** |

Initial failures remain visible: core build failed on stale shared-model SIEM
exports (`logs/core-build-initial.log`), and the first focused run had **107
passing / 9 failing** (`logs/focused-initial.log`). Rebuilding shared models fixed
those import/type failures. An overlapping cold build/test retry had **115
passing / 1 failing** on the loader's hard-coded 10-second timeout
(`logs/focused-retry.log`). After build completion, the unchanged suite passed
all 116 in 3 seconds. No timeout was raised and no test was skipped to obtain that
result. Initial API validation failed before cases loaded with
`ERR_UNSUPPORTED_DIR_IMPORT` (`logs/api-routes-initial.log`); adding the loader
option fixed the same command. Prisma's informational unsynced-skills notice is
retained; no skill sync or package change was made for it.

YAML/Compose checks actually run:

```sh
node -e 'const fs=require("node:fs"), YAML=require("yaml");for(const p of [".circleci/config.yml","support/integration-testing/docker-compose.playwright.yml"]){YAML.parse(fs.readFileSync(p,"utf8"));console.log(`${p}: parsed`)}'
docker compose --profile mount --profile ci -f support/integration-testing/docker-compose.playwright.yml config --quiet
docker compose --profile mount --profile ci -f support/integration-testing/docker-compose.bruno.general.yml config --quiet
docker compose --profile mount --profile ci -f support/integration-testing/docker-compose.bruno.oidc.yml config --quiet
docker compose --profile mount --profile ci -f support/integration-testing/docker-compose.bruno.s3.yml config --quiet
docker compose -f support/integration-testing/docker-compose.bruno.yml config --quiet
docker compose -f packages/sails-hook-redbox-pdfgen/support/api-integration-testing/docker-compose.bruno.yml config --quiet
git diff --check
```

## Consumer-specific dependency graph and retained risk

`versions-before.json` captures the initial installed tree (including initially
missing Prisma CLI/runtime artifacts); `versions-node26.json` captures resolution
after the locked installs. The probe resolves manifests from the root, core and
each Sails/Companion consumer without importing them. It does not equate a sibling
or hoisted `path-to-regexp` with Express's nested router dependency.

| Consumer | Sails / Companion | Its resolved Express | Its resolved session |
| --- | --- | --- | --- |
| Root Sails | 1.5.17 | 4.22.0 | 1.18.2 |
| Core Sails | 1.5.18 | 4.22.2 | 1.18.2 |
| Root Companion | 7.0.2 | **4.22.2** | **1.18.2** |
| Core Companion | 7.1.1 | 5.2.1 | 1.19.0 |
| Core direct host dependency | — | 5.2.1 | 1.19.0 |

Both Companion versions request Express `^5.2.1`; root Companion also requests
session `1.19.0`. The root override forces incompatible Express/session versions.
The Express pin entered via `09146c0415a59ae3c3ea90b7a8389f5c2d0497dc`
(`git log -1 -S '"express": "4.22.2"' -- package.json`), predating these consumer
upgrades. Existing HTTP Companion setup imports from core, which resolves the
Express 5 copy; its focused authorization tests pass. This does **not** qualify
the root-overridden copy. SR-042 must exercise actual mounts/auth/transfers and
remove or scope those stale overrides with consumer-specific evidence. No global
Express flattening or speculative override removal occurred in P0.

The existing Prisma preview pair is `@prisma/orm-mongo@8.0.0-rc.19` and
`prisma@8.0.0-rc.24`; retain exact versions and qualify replacements separately.

SR-002 conclusion: exact execution selection and focused build/test acceptance
are satisfied. Full Angular compilation, all provider flows, clean production
images, arm64, cloud CI execution and the complete Node/database release matrix
remain SR-045–SR-047; P0 does not claim those results.
