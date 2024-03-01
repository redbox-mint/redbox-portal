#! /bin/bash
set -e
function buildAngularApp() {
  NG_BUILD_PREFIX=""
  if [ ! -z "$NG_BUILD_TEMP_OUTPUT" ]  && [ "$2" == "" ]; then
    NG_BUILD_PREFIX="--output-path=${NG_BUILD_TEMP_OUTPUT}/${1}"
  fi
  (node_modules/.bin/ng build $NG_BUILD_PREFIX --app=${1}) 
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular-legacy
nvm i < .nvmrc && npm install --legacy-peer-deps

if [ $# -ne 0 ]
  then
    echo "Bundling ${1}"
    buildAngularApp "$1"
else 
  ng2apps=( `find ./ -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "shared" ]; then
      if [ "$ng2app" != "e2e" ]; then
        if [ "$ng2app" != "node_modules" ] && [ "$ng2app" != "localAuth" ]; then
          echo "Bundling ${ng2app}"
          buildAngularApp "${ng2app}"
        fi
      fi
    fi
  done
fi



