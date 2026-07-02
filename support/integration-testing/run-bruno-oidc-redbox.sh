#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

# Install dependencies when running against a mounted writable checkout.
bash /opt/redbox-portal/support/integration-testing/install-redbox-dependencies-if-writable.sh

# Remove the output from any previous tests
rm -rf /opt/redbox-portal/coverage/bruno-oidc/* || true

# Start redbox with code coverage
node_cmd=(node)
if [[ -n "${RBPORTAL_REMOTE_DEBUG:-}" ]]; then
  node_cmd+=(--inspect=0.0.0.0:9876)
fi

exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/bruno-oidc \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" app.integrationtest.js
