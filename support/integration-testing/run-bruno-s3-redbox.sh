#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

bash /opt/redbox-portal/support/integration-testing/install-redbox-dependencies-if-writable.sh
# Mounted sources use the normal TypeScript core build.
# Published runtime images already contain the compiled package and have no CLI.
if [[ -f packages/redbox-core/src/index.ts ]]; then
  npm --prefix packages/redbox-core run build
fi

mkdir -p /opt/redbox-portal/coverage/bruno-s3
rm -rf /opt/redbox-portal/coverage/bruno-s3/*

node_cmd=(node)
if [[ -n "${RBPORTAL_REMOTE_DEBUG:-}" ]]; then
  node_cmd+=(--inspect=0.0.0.0:9876)
fi

exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/bruno-s3 \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" app.integrationtest.js
