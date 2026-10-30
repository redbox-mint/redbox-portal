# Opt-in immutable integration Compose overrides

These files are **not enabled** by package scripts or CircleCI:

- `support/integration-testing/docker-compose.mocha.prebuilt.yml`, used after
  `docker-compose.mocha.yml`, profile `portal`, service `redboxportal`;
- `support/integration-testing/docker-compose.playwright.prebuilt.yml`, used after
  `docker-compose.playwright.yml`, profile `ci`, service `redboxportal`.

Both require Docker Compose **2.24.4 or newer** for `!override`. A normal Compose
volume list merges by container target and would leave inherited source mounts
in place. These overrides replace the entire portal mount list and environment.
They retain its entrypoint, user, dependencies/health conditions, network alias,
ports, healthcheck and shutdown grace period from the corresponding base file.
Do not combine either with the generic `docker-compose.yml` or the other suite.

**Status:** real Compose configuration rendering and contract tests are available;
portal execution is unproven. The currently inspected test image recipe does not
copy the complete payload below: in particular `.dockerignore` excludes `test/`
and `support/integration-testing/`, and the final test stage does not copy the
root support tree, tsconfig, backend source/types or integration entrypoint.
Building its existing `test` target alone does not satisfy this contract. Image,
startup-script and CI owners must integrate the payload and manifest producer
before enabling these files. No full suite run or speed improvement is claimed.

## Removed mounts and their image consumers

All targets below are inside the portal image. Source paths are relative to the
**base Compose file** in `support/integration-testing/`. The ledger is also checked
against real base/override rendering by `ci-prebuilt-compose.test.cjs`; adding or
removing a base mount requires reviewing its disposition.

| Suite | Removed host source | Required baked target | Consumer / reason |
| --- | --- | --- | --- |
| Both | `../../test` | `/opt/redbox-portal/test` | Mocha discovers `test/integration/**/*.test.ts`, loads `test/bootstrap.test.ts` and `test/integration/.mocharc.js`; tests read resources and import fixtures. Bake the entire test tree, including test support and any `test/support/` added later. This checkout currently has no `test/support/` directory. Playwright's portal retains the same test resources as its former overlay; browser tests still execute in the separate runner. |
| Both | `../../support` | `/opt/redbox-portal/support` | Portal entrypoints run `support/integration-testing/run-mocha-redbox.sh` or `run-playwright-redbox.sh`; both invoke `support/build/integration-prebuilt-assets.cjs`. Bake required support scripts and their dependencies; preserve the repository support payload needed by tests, not a host overlay. |
| Mocha | `../../typescript` | `/opt/redbox-portal/typescript` | Root tsconfig includes backend sources/declarations and identifies its rootDir. Retain these and the compiled backend outputs; do not assume transpile-only test execution replaces backend compilation or coverage source maps. |
| Mocha | `../../tsconfig.json` | `/opt/redbox-portal/tsconfig.json` | `run-mocha-redbox.sh` exports `TS_NODE_PROJECT` at this path; it extends `packages/redbox-dev-tools/config/tsconfig.base.json`, which extends installed `@tsconfig/node24`. |
| Mocha | `./recordtype-solr-multi-core-example.js` | `/opt/redbox-portal/config/recordtype.js` | Integration record-type config shim loads core, storage-mongo and dev-hook config. Bake the equivalent suite config before launch; loader regeneration must preserve its effective values. |
| Mocha | `./solr-multi-core-example.js` | `/opt/redbox-portal/config/solr.js` | Integration Solr config shim loads the same package config contributors. Check resolved config after startup regenerates shims. |
| Both | `../../test/resources/config/emailnotification.js` | `/opt/redbox-portal/config/emailnotification.js` | Integration email config shim consumed by Sails; preserve effective core/storage/dev-hook merges across shim generation. |
| Both | `../resources/development/bootstrap-data` | `/opt/redbox-portal/bootstrap-data` | Runtime bootstrap fixtures: `vocabularies/anzsrc-toa.json`, `vocabularies/rva-imports.json`, `namedqueries/`, `reports/`, `records/party.json`. `VocabularyBootstrapData.test.ts` explicitly points bootstrap at this path and expects these vocabularies. Match the mounted development tree, with no extra production fixtures hidden by the old bind. |
| Playwright | `../../app.integrationtest.js` | `/opt/redbox-portal/app.integrationtest.js` | nyc launches this entrypoint; it generates shims, lifts Sails and exposes the integration shutdown listener on 1599 for coverage flush. |
| Playwright | `../../package.json` | `/opt/redbox-portal/package.json` | Root dependencies, local package graph and nyc include/source mapping configuration; bake the tested revision's exact file. |
| Playwright | `../../package-lock.json` | `/opt/redbox-portal/package-lock.json` | Tested revision's dependency lock; dependencies must already be installed in the image. No host-manifest overlay or repair install. |

Neither fixture exception in the asset verifier (`test/`, `bootstrap-data/`) is
used here: both are baked to keep portal test inputs tied to the candidate.
The mount classifier's wider exceptions do not authorize adding a new bind to
these overrides. No development-profile mounts are removed.

The complete test image must additionally contain the following from the **same
source revision** (the overlay ledger alone is not a complete runtime image):

- All of `test/`, including bootstrap, Mocha configuration, integration tests,
  resources, test support, and their transitive imports. In particular
  `test/integration/services/FormRecordConsistencyService.test.ts` imports
  `packages/redbox-core/test/fixtures/metadata-projection.fixtures.ts` directly;
  copying just package `dist/` is insufficient for that consumer.
- Root `tsconfig.json`, `typescript/` (backend test types/declarations),
  `packages/redbox-dev-tools/config/tsconfig.base.json`, installed
  `@tsconfig/node24`, root `typescript`, `ts-node`, Mocha, chai, sinon,
  `mocha-junit-reporter`, nyc, and required `@types` packages. Preserve package
  declarations such as `packages/redbox-core/dist/index.d.ts` and transitive
  declaration files alongside JavaScript and source maps. Current tests run
  transpile-only; keeping the type/config graph still avoids silently dropping
  inputs and preserves the option to type-check them separately.
- Compiled backend/application/config output and every local package dependency
  graph used by the root: sails-ng-common, raido, rva-registry,
  agenda-sqs-backend, redbox-core, storage-mongo, redbox-dev-tools and
  redbox-hook-dev. Keep local links, runtime templates/config, source maps and
  source paths used by nyc. Do not replace a package's dependency tree with the
  root tree. Root/package exact manifests, including root nyc settings, must
  describe this tested graph. No host compile output is mounted by these
  overrides; existing CI host compilation remains unchanged pending full proof.
- `app.integrationtest.js`; both portal startup scripts; the asset verifier and
  its root `typescript` dependency; any support files referenced by those scripts
  (including their normal-mode helpers if that path is supported by the image).
  Keep `.git` out of the image so it is not classified as a source checkout.
- `config/env/integrationtest.js`, other required Sails config, the three
  destination config shims above as applicable, integration dev-hook config and
  the exact development bootstrap fixtures. Do not bake `config/local.js`, `.env`,
  private keys, registry/cloud/publish/coverage credentials or host credentials.
  The committed integration fixture tokens are public test data only.
- Production Angular/webpack outputs in both `assets/` and `.tmp/public/`,
  `.redbox-ci/integration-assets.json` and `.redbox-ci/integration-image.json`,
  produced and verified **after final asset copies** according to
  [integration-prebuilt-assets.md](integration-prebuilt-assets.md). That contract
  covers served assets, not generated static API documentation.
- Writable directories for shim generation, fixture/runtime mutation, attachments,
  reports, nyc temporary files, and coverage under the inherited service user.
  These images use immutable *inputs*, not a read-only root filesystem.

An image-content smoke check must confirm these files are actually present and
resolvable, then run the suite. The Compose tests below verify that mounts cannot
hide these paths; they do not certify an unbuilt image's contents.

## Retained mounts and profile scope

| Suite/service | Retained host source → container target | Justification |
| --- | --- | --- |
| Mocha portal | `../../coverage/mocha` → `/tmp/coverage/mocha` | nyc report output and existing Codecov consumer; outside the application root. |
| Mocha portal | `../../.tmp/junit/backend-mocha` → `/opt/redbox-portal/.tmp/junit/backend-mocha` | Mocha JUnit reporter output; explicit verifier output exception. |
| Both portals | `../../.tmp/attachments` → `/attachments` | Existing writable attachment/staging output; outside the application root. |
| Playwright portal | `../../coverage/playwright` → `/tmp/coverage/playwright` | nyc report output after clean shutdown. |
| Playwright browser runner | `../../` → `/opt/redbox-portal` (unchanged) | `run-playwright.sh`, `playwright.config.ts`, test sources, root dependencies; emits `.tmp/junit/backend-playwright`, `.tmp/playwright/report`, test-results and storage into the checkout. This is a separate container; it does not mount the portal's root. |

MongoDB, Solr, Keycloak (including realm-import mount), email (including its
database output mount), `redboxportal-mount`, and `playwright-mount` remain exactly
as rendered by the base files. Only `redboxportal` is changed. Use base files
alone for development: Compose interpolates required variables even for an
inactive service, so an override included with `--profile mount` still requires
the CI inputs. With inputs supplied, its development profile renders identically
to the base. The overrides are not a global Compose default or an additional
profile that might enable reuse elsewhere.

Portal environment is explicitly replaced. Mocha live external tests are disabled
and Datacite settings are blank; remote debug forwarding is disabled for
Playwright. Existing public integration-only Companion/provider fixture values
are kept literally, never forwarded from host credentials. No `secrets`,
`configs`, `env_file`, credential bind, privileged mode or Docker socket is added.
This is not a sandbox against a malicious additional Compose override or an
image with secrets already baked in; use only the two specified files and a
trusted test candidate. Never attach publication credentials to these jobs.

## Exact integration commands (after image prerequisites)

Run from the repository root. Keep these values in the job environment for
configuration, startup and teardown:

- `RBPORTAL_CI_IMAGE_SHA256`: **64 lowercase hex characters without `sha256:`**,
  the local image ID from the verified/loaded test candidate's trusted receipt.
  The override uses `sha256:<ID>` with `pull_policy: never`; it cannot select a
  mutable development tag or silently pull an image. This is the local image ID,
  not an archive checksum or registry manifest digest. Verify archive checksum,
  platform and candidate identity before loading, then check the loaded image's
  ID against that receipt.
- `RBPORTAL_EXPECTED_IMAGE_REVISION`: full lowercase Git SHA from CI's tested
  checkout/candidate source identity, independently supplied, **not read from
  inside the image or its asset metadata**. Use the refreshed revision in a
  lock-refresh workflow. The verifier accepts full SHA-1 or SHA-256 Git IDs.

Both values are required (`:?` rejects unset and empty) at Compose interpolation.
Compose is not a regex validator: validate these inputs at the CI boundary;
startup independently validates revision syntax and its match with image/asset
metadata. A missing local image fails without a registry pull.

```bash
set -euo pipefail
# Inputs must already come from the trusted candidate/checkout identity.
node -e '
const a = require("node:assert/strict");
a.match(process.env.RBPORTAL_CI_IMAGE_SHA256 || "", /^[a-f0-9]{64}$/);
a.match(process.env.RBPORTAL_EXPECTED_IMAGE_REVISION || "", /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
'

mocha_compose() {
  docker compose --env-file /dev/null --project-name rb-prebuilt-mocha --profile portal \
    -f support/integration-testing/docker-compose.mocha.yml \
    -f support/integration-testing/docker-compose.mocha.prebuilt.yml "$@"
}
playwright_compose() {
  docker compose --env-file /dev/null --project-name rb-prebuilt-playwright --profile ci \
    -f support/integration-testing/docker-compose.playwright.yml \
    -f support/integration-testing/docker-compose.playwright.prebuilt.yml "$@"
}

mkdir -p coverage/mocha coverage/playwright .tmp/junit/backend-mocha \
  .tmp/junit/backend-playwright .tmp/attachments/staging .tmp/playwright
chmod -R a+rwX coverage/mocha coverage/playwright .tmp/junit .tmp/attachments .tmp/playwright

mocha_compose config --format json
playwright_compose config --format json

# Each actual Compose portal must report reuse before timing the full suite.
mocha_mode=$(mocha_compose run --rm --no-deps --entrypoint node redboxportal \
  support/build/integration-prebuilt-assets.cjs startup)
test "$mocha_mode" = reuse
playwright_mode=$(playwright_compose run --rm --no-deps --entrypoint node redboxportal \
  support/build/integration-prebuilt-assets.cjs startup)
test "$playwright_mode" = reuse
```

Run the suites in their own jobs/projects. Preserve failure status across
teardown (including under a caller's `set -e`):

```bash
mocha_status=0
mocha_compose up --abort-on-container-exit \
  --exit-code-from redboxportal redboxportal || mocha_status=$?
mocha_compose down -v --remove-orphans --timeout 180 || true
# Collect .tmp/junit/backend-mocha and coverage/mocha even on failure.
exit "$mocha_status"
```

```bash
playwright_status=0
playwright_compose up --abort-on-container-exit \
  --exit-code-from playwright || playwright_status=$?
playwright_compose down -v --remove-orphans --timeout 180 || true
# Collect .tmp/junit/backend-playwright, .tmp/playwright and coverage/playwright
# even on failure, including after the portal's graceful coverage shutdown.
exit "$playwright_status"
```

Runner dependency installation and browser image selection remain as defined by
the base Playwright setup. CI's checkout/dependencies must match the tested
revision. These overrides do not change external service image versions or host
port bindings; run on isolated CI executors. Keep existing npm suite commands and
required status `ci/circleci: test-playwright` until the CI owner explicitly wires
these commands after acceptance. Do not delete existing host compile steps based
only on the mount ledger.

## Verification and remaining gates

```bash
node --test support/build/ci-prebuilt-compose.test.cjs
```

Requires the existing asset helper and its installed root `typescript` dependency.
Tests run `docker compose config --format json` against both real base files and
their overrides; no daemon, container, image build or network is needed. They
assert exhaustive removed/retained mounts, documented bake destinations, explicit
settings, independently forwarded revision, inherited service/dependency/report
contracts, untouched other services/profiles, browser checkout retention, hostile
host credential isolation, and missing/empty revision and image-ID failure.
The actual asset helper classifies synthetic mountinfo made from rendered
targets as unmounted, and rejects invalid revision syntax. None of this proves
that an image contains the required payload or that real coverage completes.

Before enabling in CI, the image/CI owners must:

1. Build a candidate with the complete payload and production asset metadata;
   verify file resolution and `startup` returning exactly `reuse` in both real
   Compose portal containers. Verify effective integration config after shim
   generation, particularly email, recordtype and Solr.
2. Run complete Mocha and Playwright suites and compare discovery counts, JUnit,
   coverage flags/exclusions/source mappings and shutdown-flushed lcov with the
   current paths. Check attachment operations and bootstrap fixture expectations.
   Inject a browser failure and confirm nonzero status plus retained artifacts.
3. Corrupt/remove an asset or metadata, supply a different valid revision, and
   confirm startup fails without repair/build/download. Reintroducing a source
   bind must classify as mounted and rebuild per the existing startup contract;
   these overrides must continue to reject such a bind in their mount ledger.
4. Run existing base-only mounted development flows with changed source; verify
   their builds still occur. Collect image-backed timings before claiming savings.

Rollback is to omit the second `-f` argument and use existing scripts. No original
Compose files, CI configuration, Dockerfile or startup scripts are edited here.
