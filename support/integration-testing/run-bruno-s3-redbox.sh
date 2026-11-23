#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

bash /opt/redbox-portal/support/integration-testing/install-redbox-dependencies-if-writable.sh
# A writable checkout mount uses the normal TypeScript core build. Built images
# (including the CI test image, which keeps the build scripts) already contain
# the compiled package; rebuilding there runs tsc under the 1 GiB portal heap.
if [[ -d .git && -w .git ]]; then
  npm --prefix packages/redbox-core run build
fi

mkdir -p /opt/redbox-portal/coverage/bruno-s3
rm -rf /opt/redbox-portal/coverage/bruno-s3/*

node_cmd=(node)
if [[ -n "${RBPORTAL_REMOTE_DEBUG:-}" ]]; then
  node_cmd+=(--inspect=0.0.0.0:9876)
fi

# Disposable integration configuration only: prepare indexes explicitly before serving.
node app.js --maintenance=indexes:ensure

exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/bruno-s3 \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" app.integrationtest.js
