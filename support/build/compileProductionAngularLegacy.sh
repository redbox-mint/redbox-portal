#! /bin/bash
set -e
function buildAngularApp() {
  (node_modules/.bin/ng build --app=${1} --prod --build-optimizer --output-hashing=none --extract-css true)
}

export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
[ -s "$HOME/.nvm/nvm.sh" ] && NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd angular-legacy
nvm i < .nvmrc && npm ci --legacy-peer-deps

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



