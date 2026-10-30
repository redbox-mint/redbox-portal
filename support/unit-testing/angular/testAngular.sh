#! /bin/bash
# Convenience wrapper for automated Angular tests. When an Angular app name is
# provided as the first argument, only that app is tested; otherwise the full CI
# Angular suite is executed. Assumes `codecov` has been installed.
set -euo pipefail

function coverageFlagForApp() {
  if [ "$1" = "portal-ng-common" ]; then
    echo "frontend-core-lib"
  else
    echo "frontend-$1"
  fi
}

function testAngular() {
  echo "-------------------------------------------"
  echo "Testing ${1} (flag ${2})"
  echo "-------------------------------------------"
  sudo mkdir -p "${HOME}/project/.tmp/junit/${2}" || return $?
  sudo chmod -R 777 "${HOME}/project/.tmp/junit/${2}" || return $?
  local browser="ChromeHeadless"
  if [ "${CI:-false}" = "true" ] || [ "$(id -u)" -eq 0 ]; then
    browser="ChromeHeadlessNoSandbox"
  fi
  node_modules/.bin/ng t --browsers="${browser}" "@researchdatabox/${1}" --no-watch --no-progress --code-coverage || return $?
  node ../support/unit-testing/codecov/prepare-report.cjs \
    "./projects/researchdatabox/${1}/coverage/coverage-final.json" "angular" || return $?
  /tmp/.codecov-cli/codecov --verbose upload-process --fail-on-error --disable-search \
    --network-root-folder "$(git rev-parse --show-toplevel)" \
    --token "${CODECOV_TOKEN}" --name "job-${CIRCLE_BUILD_NUM}-${CIRCLE_TAG:-$CIRCLE_BRANCH}" \
    --flag "${2}" --file "./projects/researchdatabox/${1}/coverage/coverage-final.json" --branch "${CIRCLE_TAG:-$CIRCLE_BRANCH}" || return $?
}

function runAngularTests() {
  export NVM_DIR="$HOME/.nvm"
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh" || return $?
  fi
  cd angular || return $?
  nvm install || return $?
  nvm use || return $?
  node ../support/build/angular-dependencies.cjs install || return $?

  if [ "${1:-}" != "" ]; then
    testAngular "$1" "$(coverageFlagForApp "$1")" || return $?
    return 0
  fi

  testAngular "portal-ng-common" "$(coverageFlagForApp "portal-ng-common")" || return $?
  local ng2apps ng2app
  ng2apps=( $(find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -exec basename {} \;) ) || return $?
  for ng2app in "${ng2apps[@]}"; do
    if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
      testAngular "${ng2app}" "$(coverageFlagForApp "$ng2app")" || return $?
    fi
  done
}

runAngularTests "$@"
