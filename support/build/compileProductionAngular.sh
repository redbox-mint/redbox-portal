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
  # Check if the custom form components directory is included in this build. Set `BUILD_PORTAL_NG_FORM_CUSTOM` to true if you want to build the custom form components.
  if [ "$BUILD_PORTAL_NG_FORM_CUSTOM" == "true" ]; then
    # Check if the custom form components placeholder is available one directory up from the parent, clone if not...
    PORTAL_NG_FORM_CUSTOM_DIR="../../portal-ng-form-custom"
    if [[ -d "${PORTAL_NG_FORM_CUSTOM_DIR}" ]]; then 
      echo "Custom form component placeholder already available"
    else
      echo "Cloning custom form component placeholder..."
      git clone "https://github.com/redbox-mint/portal-ng-form-custom.git" "${PORTAL_NG_FORM_CUSTOM_DIR}"
      # Logic to implement support branching for core and custom form components if the custom form directory doesn't exist (CI build or first time running it in dev).
      # The logic handles where the git command fails (uses the default branch for both).
      # 1. Check if the core branch is specified, if not use the default branch
      # 2. Check if the custom form branch is specified, if not use the core branch if it is not empty
      PORTAL_NG_FORM_CUSTOM_BRANCH="$3"
      CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
      if [ $? -ne 0 ]; then
        if [ -n "$PORTAL_NG_FORM_CUSTOM_BRANCH" ]; then 
          echo "Custom form branch specified, using ${PORTAL_NG_FORM_CUSTOM_BRANCH}"
          CURRENT_BRANCH="$PORTAL_NG_FORM_CUSTOM_BRANCH"
        else
          echo "No core branch specified, using default branch for core and custom form repositories"
          CURRENT_BRANCH=""
        fi 
      else 
        if [ -z "$PORTAL_NG_FORM_CUSTOM_BRANCH" ]; then
          echo "No custom branch repo specified, checking current core branch '${CURRENT_BRANCH}'"
          if [ "$CURRENT_BRANCH" != "master" ]; then
          echo "Current core branch is not 'master', using it for custom form branch."
          PORTAL_NG_FORM_CUSTOM_BRANCH="$CURRENT_BRANCH"
          else
          echo "Current core branch is 'master', not setting custom form branch automatically."
          fi
        else
          echo "Custom form branch repo specified, using ${PORTAL_NG_FORM_CUSTOM_BRANCH} which is different from the current core branch ${CURRENT_BRANCH}"
        fi
      fi
      if [[ -n "$CURRENT_BRANCH" && -n "$PORTAL_NG_FORM_CUSTOM_BRANCH" ]]; then
        echo "Checking out branch ${CURRENT_BRANCH} for custom form component placeholder..."
        cd "${PORTAL_NG_FORM_CUSTOM_DIR}"
        git checkout "${PORTAL_NG_FORM_CUSTOM_BRANCH}"
        cd -
      fi
    fi 
  fi
  echo "Building core..."
  buildAngularApp "portal-ng-common" "ignore-ouput"
  # Check if the custom form component lib is included in this build
  if [ "$BUILD_PORTAL_NG_FORM_CUSTOM" == "true" ]; then
    echo "Building form-custom..."
    cd "${PORTAL_NG_FORM_CUSTOM_DIR}/projects/researchdatabox/portal-ng-form-custom"
    npm i
    cd -
    cp angular.json angular-orig.json
    cp angular-custom.json angular.json
    buildAngularApp "portal-ng-form-custom" "ignore-ouput"
    mv angular-orig.json angular.json
  else 
    echo "Building form-custom placeholder..."
    buildAngularApp "portal-ng-form-custom" "ignore-ouput"
  fi
  ng2apps=( `find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
      buildAngularApp "${ng2app}"
    fi
  done
fi



