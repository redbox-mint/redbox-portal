#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

find test/bruno -name '*.bru' -type f \
  -prune -not -path "*/node_modules/*" \
  -prune -not -path "**/environments/*" \
  -exec node test/bruno/validate-bruno-files.js '{}' '+'
rm -rf /opt/redbox-portal/coverage/bruno-oidc/* || true
exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/bruno-oidc --reporter=lcov --exclude-after-remap=false \
    node app.integrationtest.js
