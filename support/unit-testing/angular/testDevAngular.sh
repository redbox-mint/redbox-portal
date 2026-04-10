#! /bin/bash
# Convenience wrapper for Angular tests
# Requires setup and compilation of angular apps before running.

set -euo pipefail

function testAngular() {
  echo "-------------------------------------------"
  echo "Testing ${1} (${2})"
  echo "-------------------------------------------"
  # Some CI-style environments need the no-sandbox launcher even when not running as root.
  local browser="ChromeHeadless"
  if [ "$(id -u)" -eq 0 ] || [ "${CI:-}" = "true" ] || [ "${CODEX_CI:-}" = "1" ]; then
    browser="ChromeHeadlessNoSandbox"
  fi
  node_modules/.bin/ng t --browsers="${browser}" "@researchdatabox/${1}" --no-watch --no-progress --code-coverage
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm install
nvm use
npm install --ignore-scripts --strict-peer-deps

testAngular "portal-ng-common" "frontend-core-lib"
ng2apps=( $(find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -exec basename {} \;) )
for ng2app in "${ng2apps[@]}"
do
  if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
    testAngular "${ng2app}" "frontend-${ng2app}"
  fi
done
