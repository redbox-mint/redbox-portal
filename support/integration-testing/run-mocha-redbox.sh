#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

# Install dependencies for running
npm install --ignore-scripts --strict-peer-deps

# Remove the output from any previous tests
rm -rf /opt/redbox-portal/coverage/mocha/* || true
rm /opt/redbox-portal/.tmp/junit/backend-mocha/backend-mocha.xml || true

# Start redbox with code coverage
exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/mocha \
  --reporter=lcov --exclude-after-remap=false \
  node_modules/.bin/mocha \
  --config test/unit/.mocharc.js \
  --exit test/bootstrap.test.js test/unit/**/*.test.js
