#! /bin/bash
# Convenience wrapper for Angular tests
# Requires setup and compilation of angular apps before running.

set -euo pipefail

function testAngular() {
  echo "-------------------------------------------"
  echo "Testing ${1} (${2})"
  echo "-------------------------------------------"
  # Some test runs happen inside containers (e.g. Codex Web) as root and need the no-sandbox launcher.
  if [ "$(id -u)" -eq 0 ]; then
    node_modules/.bin/ng t --browsers=ChromeHeadlessNoSandbox "@researchdatabox/${1}" --no-watch --no-progress --code-coverage
  else
    node_modules/.bin/ng t --browsers=ChromeHeadless "@researchdatabox/${1}" --no-watch --no-progress --code-coverage
  fi
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm i < .nvmrc && npm install

testAngular "portal-ng-common" "frontend-core-lib"
ng2apps=( $(find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -exec basename {} \;) )
for ng2app in "${ng2apps[@]}"
do
  if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
    testAngular "${ng2app}" "frontend-${ng2app}"
  fi
done
