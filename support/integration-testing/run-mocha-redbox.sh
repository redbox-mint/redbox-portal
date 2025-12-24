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
node_cmd=(node)
if [[ -n "${RBPORTAL_REMOTE_DEBUG:-}" ]]; then
  node_cmd+=(--inspect=0.0.0.0:9876)
fi
export TS_NODE_PROJECT=/opt/redbox-portal/internal/test/tsconfig.json


exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/mocha \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" node_modules/.bin/mocha \
  --config internal/test/.mocharc.js \
  --exit internal/test/bootstrap.test.ts internal/test/unit/**/*.test.ts
