#! /bin/bash

set -euo pipefail

function show_step(){
    echo "-------------------------------------------"
    echo "Running step: ${1}"
    echo "-------------------------------------------"
}

show_step 'Prepare local development - remove existing data and create directories'
npm run dev:resetdata

show_step 'Compile core.'
npm run compile:core

show_step 'Compile backend.'
npm run compile:sails

show_step 'Compile frontend apps.'
# portal-ng-form-custom can be partially created, remove it
# it will be created as part of building the angular apps
sudo rm -r ../portal-ng-form-custom || true
npm run compile:ng-apps

show_step 'Compile frontend legacy.'
npm run compile:ng-legacy

show_step 'Compile frontend assets.'
npm run webpack

show_step 'Finished.'
