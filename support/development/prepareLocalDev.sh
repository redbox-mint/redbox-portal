#! /bin/bash

set -euo pipefail

function show_step(){
    echo "-------------------------------------------"
    echo "Running step: ${1}"
    echo "-------------------------------------------"
}

show_step 'Remove existing test output.'
find . -name '.nyc_output' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'
find . -name 'coverage' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'

show_step 'Install npm packages for core.'
cd core
npm install
node_modules/.bin/tsc
cd ..

show_step 'Compile core.'
npm install
node_modules/.bin/tsc

show_step 'Compile frontend.'
sudo rm -rf ../portal-ng-form-custom
npm run compile:ng
npm run webpack

show_step 'Build api descriptors.'
cd support/build/api-descriptors
./generateAPIDescriptors.sh
cd ../../..

show_step 'Compile backend.'
npm run compile:sails

show_step 'Prepare tests.'
node_modules/.bin/tsc -p tsconfig-codecov.json
sudo mkdir -p support/integration-testing/.tmp/attachments/staging

show_step 'Finished.'
