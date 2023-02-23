#! /bin/bash
# Convenience wrapper for automated Angular tests, not meant to executed manually, assumes `codecov` has been installed
set -e
function testAngular() {
  (node_modules/.bin/ng t --browsers=ChromeHeadless @researchdatabox/${1} --no-watch --code-coverage)
  codecov -t $CODECOV_TOKEN -c -f ./projects/researchdatabox/${1}/coverage/coverage-final.json -F ${2}
}
export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm i < .nvmrc && npm install

testAngular "redbox-portal-core" "frontend-core-lib"
ng2apps=( `find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
for ng2app in "${ng2apps[@]}"
do
  if [ "$ng2app" != "redbox-portal-core" ]; then
    echo "Testing ${ng2app}"
    testAngular "${ng2app}" "frontend-${ng2app}"
  fi
done




