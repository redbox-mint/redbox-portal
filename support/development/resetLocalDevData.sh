#! /bin/bash

set -euo pipefail

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