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
sudo chmod -R 777 support/integration-testing
mkdir -p .tmp/junit/backend-bruno
mkdir -p .tmp/junit/backend-mocha
mkdir -p .tmp/attachments/staging
sudo chmod -R 777 .tmp

mkdir -p support/development/.dev
mkdir -p support/development/.dev/attachments/staging
sudo chmod -R 777 support/development/.dev

mkdir -p support/development/devdata
sudo chmod -R 777 support/development/devdata

show_step 'Build core.'
npm run compile:core

show_step 'Build sails-ng-common.'
npm run compile:sails-ng-common

show_step 'Build raido.'
npm run compile:raido

show_step 'Build sails.'
npm run compile:sails

show_step 'Build angular apps.'
# portal-ng-form-custom can be partially created, remove it
# it will be created as part of building the angular apps
sudo rm -r ../portal-ng-form-custom || true
npm run compile:ng-apps

show_step 'Compile frontend assets.'
npm run webpack

show_step 'Finished.'
