#! /bin/bash
set -e
function buildAngularApp() {
  echo "-------------------------------------------"
  echo "Building angular legacy app ${1}"
  echo "-------------------------------------------"
  NG_BUILD_PREFIX=""
  if [ ! -z "$NG_BUILD_TEMP_OUTPUT" ]  && [ "$2" == "" ]; then
    NG_BUILD_PREFIX="--output-path=${NG_BUILD_TEMP_OUTPUT}/${1}"
  fi
  (node_modules/.bin/ng build $NG_BUILD_PREFIX --app=${1}) 
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular-legacy
nvm use
# Some packages use postinstall, so can't use --ignore-scripts here.
npm install --legacy-peer-deps

if [ $# -ne 0 ]
  then
    buildAngularApp "$1"
else 
  ng2apps=( `find ./ -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "shared" ]; then
      if [ "$ng2app" != "e2e" ]; then
        if [ "$ng2app" != "node_modules" ] && [ "$ng2app" != "localAuth" ]; then
          buildAngularApp "${ng2app}"
        fi
      fi
    fi
  done
fi



