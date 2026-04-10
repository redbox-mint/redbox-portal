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
  sudo mkdir -p "${HOME}/project/.tmp/junit/${2}"
  sudo chmod -R 777 "${HOME}/project/.tmp/junit/${2}"
  local browser="ChromeHeadless"
  if [ "${CI:-false}" = "true" ] || [ "$(id -u)" -eq 0 ]; then
    browser="ChromeHeadlessNoSandbox"
  fi
  node_modules/.bin/ng t --browsers="${browser}" "@researchdatabox/${1}" --no-watch --no-progress --code-coverage
  /tmp/.codecov-cli/codecov --verbose upload-process --fail-on-error --disable-search \
    --token "${CODECOV_TOKEN}" --name "job-${CIRCLE_BUILD_NUM}-${CIRCLE_TAG:-$CIRCLE_BRANCH}" \
    --flag "${2}" --file "./projects/researchdatabox/${1}/coverage/coverage-final.json" --branch "${CIRCLE_TAG:-$CIRCLE_BRANCH}"
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm install
nvm use
npm install --ignore-scripts --strict-peer-deps

if [ "${1:-}" != "" ]; then
  testAngular "$1" "$(coverageFlagForApp "$1")"
  exit 0
fi

testAngular "portal-ng-common" "$(coverageFlagForApp "portal-ng-common")"
ng2apps=( $(find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -exec basename {} \;) )
for ng2app in "${ng2apps[@]}"; do
  if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
    testAngular "${ng2app}" "$(coverageFlagForApp "$ng2app")"
  fi
done
