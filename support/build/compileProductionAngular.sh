#! /bin/bash
set -e
function buildAngularApp() {
  (node_modules/.bin/ng b @researchdatabox/${1} --configuration production)
}
export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm i < .nvmrc && npm install

if [ $# -ne 0 ]
  then
    echo "Bundling ${1}"
    buildAngularApp "$1"
else 
  echo "Building core..."
  buildAngularApp "redbox-portal-core"
  ng2apps=( `find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "redbox-portal-core" ]; then
      echo "Building ${ng2app}"
      buildAngularApp "${ng2app}"
    fi
  done
fi



