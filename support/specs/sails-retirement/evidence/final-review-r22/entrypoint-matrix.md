# R22 WSU build, CI and deployment entrypoints

Inputs: portal `55f00268e`, WSU `80b2b80`; commands and raw filenames below
refer to `.tmp/sails-retirement/final-review-r22/`. The command ledger records
exact argv, cwd, environment, exit status, timing and hashes. Successful runs
use the recorded fixed local image tags; registry/native-arm qualification is
not implied. A transitive row means that exact npm script executes within the
named successful parent command. Expected refusals are exercised, not inferred
from source. The accompanying machine inventory includes each current script
body and hashes of the entrypoint sources.

## All 17 npm scripts

| Script | Execution and result | Accepted raw result |
| --- | --- | --- |
| `compile` | Exact shared compiler, transitively through builder `test:unit`, host build/tests and development prepare; 0 | `final-builder-latest`, `latest-host-npm-test`, `replay-indexes-inspect` |
| `build` | `npm run build`, documented sibling layout after `npm ci`; 0 | `final-clone-build` |
| `test` | `npm test`; compile/full unit 555 and installed integration; 0 | `latest-host-npm-test` |
| `test:unit` | Actual npm script in pristine Docker builder; 555 pass, 0 | `final-builder-latest` |
| `test:integration` | Actual npm script through `npm test`; installed smoke, 0; exact body also run in standalone clean clone | `latest-host-npm-test`, `pristine-ci-integration` |
| `test:integration:clean` | Actual script through cleanup alias; 0 | `cleanup-mocha-alias` |
| `test:integration:mocha` | Actual alias delegates to v6 integration; installed smoke, 0 | `latest-integration-alias` |
| `test:integration:mocha:clean` | Actual alias delegates to v6 cleanup; 0 | `cleanup-mocha-alias` |
| `dev:run:prepare` | Actual script compiles hook and creates staging/data paths through inspect/ensure/start; 0 | `replay-indexes-inspect`, `replay-indexes-ensure`, `replay-development-start` |
| `dev:run` | Exact npm start after explicit index preparation; ready/pages 200 and stop/command exit 0 | `replay-development-start`, `replay-development-http.json`, `replay-development-stop` |
| `dev:run:build` | Actual Compose build with both qualified locally loaded inputs; 0 | `final-development-build` |
| `dev:run:clean` | Actual development cleanup; 0 | `cleanup-development` |
| `dev:run:core:prepare` | Nonzero with v5 retirement and `support/v6/README.md` guidance; no Docker | `final-core-prepare`, `wsu-entrypoints-after-fix` |
| `dev:run:core` | Same explicit refusal; no Docker | `final-core-run`, `wsu-entrypoints-after-fix` |
| `dev:run:core:clean` | Same explicit refusal; no Docker | `final-core-clean`, `wsu-entrypoints-after-fix` |
| `dev:run:indexes:inspect` | Fresh independent databases: 2 with required-index report; expected operator action | `replay-indexes-inspect` |
| `dev:run:indexes:ensure` | Explicit preparation: ready report, 0 | `replay-indexes-ensure` |

The final standalone clone has no sibling portal/dependencies/dist. The separate
host-development clone deliberately has the documented sibling portal layout;
host `npm ci` is not advertised as a standalone replacement for the Docker path.
`final-clone-npm-ci` records its real successful dependency installation.

## Build scripts, direct runners, Dockerfile and Compose

| Entrypoint | Observed execution/refusal | Accepted raw result |
| --- | --- | --- |
| `support/build/docker-build-vars.sh` | Sourced by all four build scripts; actual slash-containing branch normalizes to `feature-v6-express`, 0 | `final-build-vars` |
| `support/build/test.sh` | Exact CI command in incoming clean clone: 546 pass; latest clean clone: 555 pass; temporary test image removed | `incoming-builder-current-tags`, `final-builder-latest` |
| `support/build/build_local.sh` | Actual script and exact CI command refuse absent `DOCKER_PASS`; 1 before login; both image omissions separately refuse before Docker | `final-local-credential-refusal`, `ci-local-refusal`, `local-no-images` |
| `support/build/nexus_deploy.sh linux/amd64 -amd64` | Actual script and exact CI command refuse absent credentials; 1 before login; missing images separately refused | `final-deploy-amd64-credential-refusal`, `ci-deploy-refusal`, `deploy-amd64-no-images` |
| `support/build/nexus_deploy.sh linux/arm64 -arm64` | Same refusal before login/privileged architecture setup; no native arm64 execution | `final-deploy-arm64-credential-refusal`, `ci-deploy-arm64-refusal`, `deploy-arm64-no-images` |
| `support/build/nexus_publish_manifest.sh` | Actual script and exact CI command refuse absent credentials; 1 before login; argument-recorder test confirms no build-image prerequisite | `final-manifest-credential-refusal`, `ci-publish-manifest-refusal`, `wsu-entrypoints-after-fix` |
| `support/development/prepare-core-mount.sh` | Executed by each retired npm script; 1 with guide path, no Docker | `final-core-prepare`, `final-core-run`, `final-core-clean` |
| `support/integration-testing/run-mocha-hook.sh` | Actual Bash entrypoint; 1 with retirement/guide message, no Docker | `final-retired-hook-runner`, `wsu-entrypoints-after-fix` |
| `support/integration-testing/run-mocha-redbox.sh` | Actual Bash entrypoint; same explicit refusal | `final-retired-redbox-runner`, `wsu-entrypoints-after-fix` |
| `support/prepare-s3.sh` | No bucket selected: explicit skip, 0. It is not a prerequisite for the current v6 Compose stack, which supplies its own bucket | `final-s3-no-bucket` |
| Dockerfile `builder` | Real clean-context install, shared compile, pack and full unit execution; 0 | `final-builder-latest` |
| Dockerfile `redbox-hook-wsu` | Real packed production install, extension/deployment import validation and installed HTTP/restart/stop; 0 | `documented-image-build`, `pristine-ci-integration` |
| `support/v6/docker-compose.test.yml` | Exact up/build command on pristine final clone, installed smoke, 0; exact CI down/volumes/orphans cleanup, 0 | `pristine-ci-integration`, `pristine-ci-cleanup` |
| `support/development/docker-compose.yml` | Config, build, explicit maintenance, initialize-only, ordinary start, HTTP and stop/cleanup pass | `development-compose-config`, `final-development-build`, `replay-*`, `cleanup-development` |
| `support/development/docker-compose.core-mount.yml` | Actual combined old Compose invocation fails at interpolation with v5 retirement/v6 guide message, 1 | `final-retired-core-compose` |
| `support/integration-testing/docker-compose.mocha.yml` | Actual old Compose up/build refuses at interpolation with same guidance, 1 | `final-retired-integration-compose` |
| Installed `support/v6/app.cjs --maintenance=indexes:inspect` | Same executable used by documented development inspect; fresh 2 with report | `replay-indexes-inspect` |
| Installed `support/v6/app.cjs --maintenance=indexes:ensure` | Same executable/configuration, explicit ensure ready, 0 | `replay-indexes-ensure` |
| Installed `support/v6/app.cjs --initialize-only` | Exact documented executable/flag under development Compose's explicit config; 0, default bootstrap/migrations/schema checks awaited | `replay-initialize-only` |
| Installed `support/v6/app.cjs` | Ordinary default Docker CMD in development; readiness/pages and graceful stop, 0 | `replay-development-start`, `replay-development-http.json` |
| `support/v6/verify.cjs` with `test.cjs` | Exact installed Compose test command; full stated installed smoke, 0 | `pristine-ci-integration` |

The WSU guide's `/etc/redbox/wsu.cjs` is a deployment-supplied input, not a file
claimed to be shipped by the hook. The positive installed executable commands
above use the actual development/test config paths selected by Compose. The
application configuration remains data only; all use the WSU executable so its
custom bindings are present. The complete production infrastructure/secrets are
not supplied or qualified by this repository.

## Every CircleCI job and step

Exact run strings are retained in `ci-steps.json`; none was replaced with a
host `npm ci` step. CircleCI itself was not remotely triggered.

| Job / step | Execution/result |
| --- | --- |
| All five jobs: `checkout` | Real local `git clone --branch feature/v6-express` of tracked branch; final standalone snapshot clean, no dependencies/dist/sibling checkout |
| `test`: `bash support/build/test.sh` | Actual pristine clone builder, 555 passing, 0 |
| `test`: `docker compose -f support/v6/docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from rbportal` | Actual pristine clone production-image build/installed integration, 0 |
| `test`: `docker compose -f support/v6/docker-compose.test.yml down -v --remove-orphans --timeout 180 \|\| true` (`when: always`) | Exact string run after integration, 0; final resource listing independently confirms no containers/volumes |
| `deploy`: chmod then `support/build/nexus_deploy.sh linux/amd64 -amd64` | Exact string, explicit absent-credential refusal before any registry operation |
| `deploy-arm64`: chmod then `support/build/nexus_deploy.sh linux/arm64 -arm64` | Exact string, same refusal; no native arm64 claim |
| `publish-manifest`: chmod then `support/build/nexus_publish_manifest.sh` | Exact string, credential refusal; no publication |
| `local`: chmod then `support/build/build_local.sh` | Exact string, credential refusal; guide's credential-free Docker build separately succeeds |
| Branch/tag workflows and dependencies | Parsed retained YAML has all five jobs; actual 22-case suite checks Docker builder context includes `.circleci/config.yml` and `.dockerignore`. No remote pipeline/filter execution is claimed |

All deployment argument forwarding is separately checked by executable Bash
tests whose Docker recorder replaces login/build/push/architecture setup. This
proves argument shape and exit propagation without publishing. Refusal is the
settlement outcome for entrypoints needing credentials or forbidden publication.

## Hook-author and installation documentation

| Documented command(s) | Execution/result and qualification |
| --- | --- |
| `hook-migration-v6.md`: `export REDBOX_PORTAL_ROOT="$PWD"`, `mkdir ../redbox-hook-demo-client`, `cd ../redbox-hook-demo-client` | Actual first shell block in an external empty sandbox exposing only built portal packages; 0 (`migration-guide-exact`) |
| Same guide: built `cli.js init demo-client --template v6` | Actual command from that block; generated neutral v6 scaffold, 0 |
| Same guide: `npm install --save-dev --save-exact "$REDBOX_PORTAL_ROOT/packages/redbox-core"` | Actual local-core installation, 0 |
| Same guide: `npm run build`, built CLI `check --v6`, `npm pack --ignore-scripts` | Actual generated external hook compile/check/pack, all 0 |
| `Redbox-Hook-Kit.md`: export/mkdir/cd and built CLI `init` | Actual first shell block in outside-portal regression; 0 in `tooling-full-final` |
| Same wiki: `npm install --save-dev --save-exact --ignore-scripts --strict-peer-deps --legacy-peer-deps=false "$REDBOX_PORTAL_ROOT/packages/redbox-core"` | Actual offline install with both peer flags, 0; no write to portal root |
| Same wiki: `npm run build`, built CLI `check --v6`, `npm pack --ignore-scripts` | Actual shell block, all 0; test additionally imports compiled registration and asserts apiVersion 1 |
| `Services-Architecture.md`: `node "$REDBOX_PORTAL_ROOT/packages/redbox-dev-tools/bin/cli.js" init example --template v6` | Actual command in an empty external directory, 0 (`services-guide-exact`); environment root selected as documented |
| `Using-a-Sails-Hook-to-customise-ReDBox.md` | Historical page now directs v6 authors to the tested guide; it supplies no executable v6 command block |
| `Installation-Guide.md`: `npm run compile:all` | Complete actual package/server/Angular/assets build, 0 (`portal-compile-all-nvm`) |
| Same wiki: `export REDBOX_SESSION_SECRET="$(openssl rand -hex 32)"` | Exact shell command, 0; validates 64 hex characters without printing the secret (`installation-secret-command`) |
| Same wiki: `npm run dev:run:build` | Invoked without the mandatory secret; clear named session-secret prerequisite refusal, 1 (`installation-missing-secret`). A complete fresh portal container-image build is not claimed; WSU's own development image build separately passes |
| Same wiki: `REDBOX_APPLICATION_CONFIG=/etc/redbox/application.cjs node app.express.cjs --maintenance=indexes:inspect` | Exact command in qualified runtime with deliberately absent operator config; clear `ConfigurationError` names the application file/load prerequisite, 1 (`installation-maintenance-indexes-inspect`) |
| Same wiki: same prefix with `--maintenance=indexes:ensure` | Same explicit prerequisite refusal, 1 (`installation-maintenance-indexes-ensure`) |
| Same wiki: same prefix with `--initialize-only` | Same explicit prerequisite refusal, 1 (`installation-initialize-only`) |
| Same wiki Docker example: `docker compose run --rm redboxportal node app.express.cjs --maintenance=indexes:ensure` | Exact command in example directory without required `RBPORTAL_IMAGE`; clear qualified-image prerequisite refusal, 1 (`installation-compose-prerequisite`) |
| WSU guide: two `: "${…:?…}"` assertions and `docker build --build-arg … -t redbox-wsu:local .` | Exact updated first shell block, real both-stage image build, 0 (`documented-image-build`) |
| WSU guide: `npm ci`, `npm run build`, `npm run test:unit` in sibling development layout | Actual ci/build, and exact unit script within full host `npm test`; 555 pass (`final-clone-npm-ci`, `final-clone-build`, `latest-host-npm-test`) |
| WSU guide: installed config export, inspect/review/ensure/initialize/start | Operator-supplied config prerequisite stated; positive same-executable Compose paths listed above. Review/checkpoint is an operator action, not an automatic script |
| WSU guide: `npm run dev:run:indexes:inspect`, review, `npm run dev:run:indexes:ensure`, `npm run dev:run` | Accepted sequential fresh replay; 2 / 0 / ready+HTML+stop 0 |
| WSU guide: `npm test`, `npm run test:integration:clean` and historical `:mocha` aliases | Actual current suite/integration and alias/cleanup executions as listed in npm table |

The matrix intentionally distinguishes positive builds from expected input
refusals. Configuration files and registry credentials are real prerequisites;
their absence is never counted as a successful deployment or installation.
