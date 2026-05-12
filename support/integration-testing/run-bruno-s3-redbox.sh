#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

npm install --ignore-scripts --strict-peer-deps

rm -rf /opt/redbox-portal/coverage/bruno-s3/* || true

node_cmd=(node)
if [[ -n "${RBPORTAL_REMOTE_DEBUG:-}" ]]; then
  node_cmd+=(--inspect=0.0.0.0:9876)
fi

exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/bruno-s3 \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" app.integrationtest.js
