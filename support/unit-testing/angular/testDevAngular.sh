#! /bin/bash
# Convenience wrapper for Angular tests
# Requires setup and compilation of angular apps before running.

set -euo pipefail

function testAngular() {
  echo "-------------------------------------------"
  echo "Testing ${1} (${2})"
  echo "-------------------------------------------"
  node_modules/.bin/ng t --browsers=ChromeHeadless "@researchdatabox/${1}" --no-watch --no-progress --code-coverage
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm i < .nvmrc
npm ci --ignore-scripts --no-audit --no-fund

testAngular "portal-ng-common" "frontend-core-lib"
ng2apps=( $(find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -printf '%f ') )
for ng2app in "${ng2apps[@]}"
do
  if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
    testAngular "${ng2app}" "frontend-${ng2app}"
  fi
done
