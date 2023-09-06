#! /bin/bash
set -e
function buildAngularApp() {
  NG_BUILD_PREFIX=""
  if [ ! -z "$NG_BUILD_TEMP_OUTPUT" ]  && [ "$2" == "" ]; then
    NG_BUILD_PREFIX="--output-path=../.tmp/public/angular/${1}"
  fi
  (node_modules/.bin/ng build --configuration=development $NG_BUILD_PREFIX @researchdatabox/${1} )
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
# Check if the custom form components placeholder is available one directory up from the parent, clone if not...
  PORTAL_NG_FORM_CUSTOM_DIR="../../portal-ng-form-custom"
  if [[ -d "${PORTAL_NG_FORM_CUSTOM_DIR}" ]]; then 
    echo "Custom form component placeholder already available"
  else
    echo "Cloning custom form component placeholder..."
    git clone "https://github.com/redbox-mint/portal-ng-form-custom.git" "${PORTAL_NG_FORM_CUSTOM_DIR}"
  fi 
  echo "Building core..."
  buildAngularApp "portal-ng-common" "ignore-ouput"
  echo "Building form-custom..."
  cd "${PORTAL_NG_FORM_CUSTOM_DIR}/projects/researchdatabox/portal-ng-form-custom"
  npm i
  cd -
  buildAngularApp "portal-ng-form-custom" "ignore-ouput"
  ng2apps=( `find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
      echo "Building ${ng2app}"
      buildAngularApp "${ng2app}"
    fi
  done
fi



