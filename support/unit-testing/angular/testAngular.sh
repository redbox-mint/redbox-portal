#! /bin/bash
# Convenience wrapper for automated Angular tests, not meant to executed manually, assumes `codecov` has been installed
set -e
function testAngular() {
  echo "-------------------------------------------"
  echo "Testing ${1} (flag ${2})"
  echo "-------------------------------------------"
  (node_modules/.bin/ng t --browsers=ChromeHeadless "@researchdatabox/${1}" --no-watch --code-coverage)
  /tmp/codecov -t "${CODECOV_TOKEN}" -c -f "./projects/researchdatabox/${1}/coverage/coverage-final.json" -F "${2}"
}
export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm i < .nvmrc && npm install
curl -o /tmp/codecov -Os https://uploader.codecov.io/latest/linux/codecov 
chmod +x /tmp/codecov

testAngular "portal-ng-common" "frontend-core-lib"
ng2apps=( `find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
for ng2app in "${ng2apps[@]}"
do
  # Disable the form app test for now...
  if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "form" ]; then
    testAngular "${ng2app}" "frontend-${ng2app}"
  fi
done




