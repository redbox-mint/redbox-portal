#! /bin/bash

set -euo pipefail

function log(){
    echo "INFO: ${1}"
}

log 'Prepare local development'

log 'Remove test output'
sudo find . -name '.nyc_*' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'
sudo find . -name 'coverage' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'

log 'Remove compile output'
sudo find . -name 'dist' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'
sudo rm -rf ./.tmp || true
sudo rm -rf ./angular/.angular || true

# log 'Remove installed packages'
# sudo find . -name 'node_modules' -type d -prune -not -path "*/node_modules/*" -exec rm -r '{}' '+'

log 'Remove local dev data'
sudo rm -rf ./support/development/.dev || true

log 'Finished.'
