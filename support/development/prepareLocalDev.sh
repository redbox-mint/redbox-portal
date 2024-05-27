#! /bin/bash

set -euo pipefail

function show_step(){
    echo "-------------------------------------------"
    echo "Running step: ${1}"
    echo "-------------------------------------------"
}

show_step 'Prepare local development - remove existing data and create directories'
# remove existing code coverage, temp, and dev data
sudo find . -name '.nyc_*' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'
sudo find . -name 'coverage' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'
sudo find . -name '.tmp' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'
sudo rm -r support/development/.dev || true
sudo rm -r support/development/devdata || true

# ensure folders are created so that local dev can access them
mkdir -p support/integration-testing/.tmp/attachments/staging
sudo chmod -R 777 support/integration-testing

mkdir -p .tmp/junit
mkdir -p .tmp/junit/backend-bruno
mkdir -p .tmp/junit/backend-mocha
sudo chmod -R 777 .tmp

mkdir -p support/development/.dev
mkdir -p support/development/.dev/attachments/staging
sudo chmod -R 777 support/development/.dev

mkdir -p support/development/devdata
sudo chmod -R 777 support/development/devdata

show_step 'Install npm packages for core.'
cd core
npm install
node_modules/.bin/tsc
cd ..

show_step 'Compile core.'
npm install
node_modules/.bin/tsc

show_step 'Compile backend.'
npm run compile:sails

show_step 'Compile frontend apps.'
# portal-ng-form-custom can be partially created, remove it
# it will be created as part of building the angular apps
sudo rm -r ../portal-ng-form-custom
npm run compile:ng-apps

show_step 'Compile frontend legacy.'
npm run compile:ng-legacy

show_step 'Compile frontend assets.'
npm run webpack

show_step 'Finished.'
