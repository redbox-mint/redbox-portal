#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

# Remove the output from any previous tests
rm -rf /opt/redbox-portal/coverage/bruno-oidc/* || true

# Start redbox with code coverage
exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/bruno-oidc \
  --reporter=lcov --exclude-after-remap=false \
    node app.integrationtest.js
