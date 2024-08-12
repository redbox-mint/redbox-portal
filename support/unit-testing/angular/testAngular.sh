#! /bin/bash
# Convenience wrapper for automated Angular tests, not meant to executed manually, assumes `codecov` has been installed
set -e
function testAngular() {
  echo "-------------------------------------------"
  echo "Testing ${1} (flag ${2})"
  echo "-------------------------------------------"
  sudo mkdir -p "${HOME}/project/.tmp/junit/${2}"
  sudo chmod -R 777 "${HOME}/project/.tmp/junit/${2}"
  node_modules/.bin/ng t --browsers=ChromeHeadless "@researchdatabox/${1}" --no-watch --no-progress --code-coverage
  /tmp/.codecov-cli/codecov --verbose upload-process --fail-on-error --disable-search \
    --token "${CODECOV_TOKEN}" --name "job-${CIRCLE_BUILD_NUM}-${CIRCLE_TAG:-$CIRCLE_BRANCH}" \
    --flag "${2}" --file "./projects/researchdatabox/${1}/coverage/coverage-final.json" --branch "${CIRCLE_TAG:-$CIRCLE_BRANCH}"
}
export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm i < .nvmrc && npm install

testAngular "portal-ng-common" "frontend-core-lib"
ng2apps=( `find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
for ng2app in "${ng2apps[@]}"
do
  # Disable the form app test for now...
  if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "form" ]; then
    testAngular "${ng2app}" "frontend-${ng2app}"
  fi
done
