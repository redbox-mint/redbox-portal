#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/bruno-tests

# Install dependencies for running bruno
npm install --ignore-scripts --strict-peer-deps

# Validate the bru syntax
find . -name '*.bru' -type f \
  -prune -not -path "*/node_modules/*" \
  -prune -not -path "**/environments/*" \
  -exec node validate-bruno-files.js '{}' '+'

# Remove the output from any previous run
rm /opt/junit/backend-bruno/backend-bruno-general.xml || true

# Run bruno tests
node_modules/.bin/bru run \
  --disable-cookies --env int-test --format junit --bail \
  --output /opt/junit/backend-bruno/backend-bruno-general.xml

status=$?
wget -qO- http://redboxportal:1599 || true
sleep "${BRUNO_POST_SLEEP_SECONDS:-30}"
exit $status
