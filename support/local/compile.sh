#!/usr/bin/env bash

set -euo pipefail

function msg() {
  echo ""
  echo "${1}: ${2}"
  echo "-----------------------------------------"
}

case "${1}" in
        "core")
                msg "info" "Install packages for core"
                cd core
                npm ci --ignore-scripts --no-audit --no-fund

                msg "info" "Compile typescript for core"
                npx --no tsc
                ;;
        "sails-ng-common")
                msg "info" "Install packages for sails-ng-common"
                cd ./packages/sails-ng-common
                npm ci --ignore-scripts --no-audit --no-fund

                msg "info" "Compile typescript for sails-ng-common"
                npx --no tsc
                ;;
        "raido")
                msg "info" "Install packages for raido"
                cd ./support/raido
                npm ci --ignore-scripts --no-audit --no-fund

                msg "info" "Generate source for raido"
                npm run generate

                msg "info" "Compile typescript for raido"
                npx --no tsc
                ;;
        "sails")
                msg "info" "Install packages for sails"
                npm ci --ignore-scripts --no-audit --no-fund

                msg "info" "Compile typescript for sails"
                npx --no tsc
                ;;
        "ng-apps")
                msg "info" "Compile ng-apps"
                ./support/development/compileDevAngular.sh
                ;;
        "ng-legacy")
                msg "info" "Compile ng-legacy"
                ./support/development/compileDevAngularLegacy.sh
                ;;
        "webpack")
                msg "info" "Compile webpack"
                NODE_ENV=docker WEBPACK_CSS_MINI=true node support/build/wrapper-webpack.js
                ;;
        "all")
                msg "info" "Compile all"
                npm run local:compile:core
                npm run local:compile:sails-ng-common
                npm run local:compile:raido
                npm run local:compile:sails
                npm run local:compile:ng-apps
                npm run local:compile:ng-legacy
                npm run local:compile:webpack
                ;;
        *)
                msg "warn" "Unknown operation '${1}'"
                exit 1
                ;;
esac
