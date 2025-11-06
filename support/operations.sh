#!/usr/bin/env bash

set -euo pipefail

function msg() {
echo "-----------------------------------------"
echo "[${1}] ${2}"
echo "-----------------------------------------"
}

source "${HOME}/.nvm/nvm.sh"

# Specify the compose project name using --project-name - this allows running the same images at the same time with different container names.
# Specify the compose profile using --profile - this will start only the required services.

# remove node_modules with permission errors: sudo find . -name 'node_modules' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'

op_env="${1:-dev}" # dev or test
op_category="${2}" # deps, compile, serve, mocha, bruno, ...
op_group="${3}" # (package name), 'all', (group name)
op_overall=${op_env}-${op_category}-${op_group}""

CI="${CI:-false}"

if [ "${CI}" == "true" ]; then
  export BUILDKIT_PROGRESS='plain'
  export COMPOSE_ANSI='never'
fi

msg "info" "Running operation '${op_env}' - '${op_category}' - '${op_group}'"

case "${op_overall}" in
  "dev-deps-core")
    msg "info" "Install packages for core"
    nvm use
    cd ./core
    npm install --strict-peer-deps --ignore-scripts
    ;;
  "dev-compile-core")
    msg "info" "Compile typescript for core"
    nvm use
    cd ./core
    npx --no tsc
    ;;
  "dev-deps-sails-ng-common")
    msg "info" "Install packages for sails-ng-common"
    nvm use
    cd  ./packages/sails-ng-common
    npm install --strict-peer-deps --ignore-scripts
    ;;
  "dev-compile-sails-ng-common")
    msg "info" "Compile typescript for sails-ng-common"
    nvm use
    cd  ./packages/sails-ng-common
    npx --no tsc
    ;;
  "dev-deps-raido")
    msg "info" "Install packages for raido"
    nvm use
    cd ./support/raido
    npm install --strict-peer-deps --ignore-scripts

    msg "info" "Generate source for raido"
    nvm use
    npm run generate
    ;;
  "dev-compile-raido")
    msg "info" "Compile typescript for raido"
    nvm use
    cd ./support/raido
    npx --no tsc
    ;;
  "dev-deps-sails")
    msg "info" "Install packages for sails"
    nvm use
    npm install --strict-peer-deps --ignore-scripts
    ;;
  "dev-compile-sails")
    msg "info" "Compile typescript for sails"
    nvm use
    npx --no tsc
    ;;
  "dev-deps-ng-apps")
    msg "info" "Install packages for ng-apps"
    cd angular
    nvm use
    npm install --strict-peer-deps --ignore-scripts
    ;;
  "dev-compile-ng-apps")
    msg "info" "Compile ng-apps"
    ./support/development/compileDevAngular.sh
    ;;
  "dev-deps-ng-legacy")
    msg "info" "Install packages for ng-apps"
    cd angular-legacy
    nvm use
    npm install --legacy-peer-deps --ignore-scripts
    ;;
  "dev-compile-ng-legacy")
    msg "info" "Compile ng-legacy"
    ./support/development/compileDevAngularLegacy.sh
    ;;
  "dev-deps-webpack")
    msg "info" "Install packages for webpack"
    nvm use
    npm run deps:sails
    ;;
  "dev-compile-webpack")
    msg "info" "Compile webpack"
    nvm use
    NODE_ENV=docker WEBPACK_CSS_MINI=true node support/build/wrapper-webpack.js
    ;;
  "dev-deps-all")
    msg "info" "Install packages for all"
    npm run deps:core
    npm run deps:sails-ng-common
    npm run deps:raido
    npm run deps:sails
    npm run deps:ng-apps
    npm run deps:webpack
    ;;
  "dev-compile-all")
    msg "info" "Compile all"
    npm run compile:core
    npm run compile:sails-ng-common
    npm run compile:raido
    npm run compile:sails
    npm run compile:ng-apps
    npm run compile:webpack
    ;;
  "dev-serve-build")
    msg "info" "Build docker images for serve"
    docker compose -f ./support/compose.yml --profile serve --project-name redbox-dev build --no-cache
    ;;
  "dev-serve-up")
    msg "info" "Run local web server"
    docker compose -f ./support/compose.yml --profile serve --project-name redbox-dev up --build --menu=false --abort-on-container-exit --exit-code-from redbox
    ;;
  "dev-serve-down")
    msg "info" "Stop local web server"
    docker compose -f ./support/compose.yml --profile serve --project-name redbox-dev down -v
    ;;
  "test-mocha-all")
    msg "info" "Run mocha tests"
    docker compose -f ./support/compose.yml --profile mocha --project-name redbox-mocha up --build --menu=false --abort-on-container-exit --exit-code-from mocha
    ;;
  "test-mocha-build")
    msg "info" "Build docker images for mocha tests"
    docker compose -f ./support/compose.yml --profile mocha --project-name redbox-mocha build --no-cache
    ;;
  "test-bruno-all")
    msg "info" "Run all bruno tests"
    docker compose -f ./support/compose.yml --profile bruno --project-name redbox-bruno up --build --menu=false --abort-on-container-exit --exit-code-from bruno
    ;;
  "test-bruno-oidc")
    msg "info" "Run bruno oidc tests"
    docker compose -f ./support/compose.yml --profile bruno-oidc --project-name redbox-bruno-oidc up --build --menu=false --abort-on-container-exit --exit-code-from bruno-oidc
    ;;
  "test-bruno-general")
    msg "info" "Run bruno general tests"
    docker compose -f ./support/compose.yml --profile bruno-general --project-name redbox-bruno-general up --build --menu=false --abort-on-container-exit --exit-code-from bruno-general
    ;;
  "test-clean-all")
    msg "info" "Clean up tests"
    docker compose -f ./support/compose.yml --profile mocha --project-name redbox-mocha down -v || true
    docker compose -f ./support/compose.yml --profile bruno --project-name redbox-bruno down -v || true
    docker compose -f ./support/compose.yml --profile bruno-oidc --project-name redbox-bruno-oidc down -v || true
    docker compose -f ./support/compose.yml --profile bruno-general --project-name redbox-bruno-general down -v || true
    ;;
  "test-angular-ng-apps")
    msg "info" "Run angular tests"
    ./support/unit-testing/angular/testDevAngular.sh
    ;;
  "test-sails-ng-common-all")
    msg "info" "Run sails-ng-common tests"
    nvm use
    cd ./packages/sails-ng-common
    npm run test
    ;;
  "dev-docker-clean")
    msg "info" "Clean up docker resources"
    docker system prune --force --volumes
    ;;
  *)
    msg "error" "Unknown operation '${op_env}' - '${op_category}' - '${op_group}'"
    exit 1
    ;;
esac
