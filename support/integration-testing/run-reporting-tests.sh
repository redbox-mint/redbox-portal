#!/usr/bin/env bash
set -euo pipefail
: "${REDBOX_REPORTING_MONGO_URL:?Set an isolated Mongo endpoint for reporting conformance tests}"
# Include both test-loaded TypeScript and compiled package imports; nyc remaps
# the latter through source maps before writing the repository-level LCOV file.
node_modules/.bin/nyc --temp-dir /tmp/redbox-reporting-nyc \
  --report-dir coverage/reporting --reporter=lcov --exclude-after-remap=false \
  --include 'packages/redbox-core/src/**/*.ts' --include 'packages/redbox-core/dist/**/*.js' \
  --include 'packages/redbox-mcp/src/**/*.ts' --include 'packages/redbox-mcp/dist/**/*.js' \
  npm run test:reporting:local
