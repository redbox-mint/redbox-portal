#!/usr/bin/env bash
set -euo pipefail
: "${REDBOX_REPORTING_MONGO_URL:?Set an isolated Mongo endpoint for reporting conformance tests}"
npm run test:reporting:local
