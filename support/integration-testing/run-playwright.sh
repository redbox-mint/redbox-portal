#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if [[ "${PLAYWRIGHT_INSTALL_DEPS:-false}" == "true" && ! -x node_modules/.bin/playwright ]]; then
  npm ci --ignore-scripts --strict-peer-deps
fi

mkdir -p /opt/redbox-portal/.tmp/junit/backend-playwright
mkdir -p /opt/redbox-portal/.tmp/playwright/report
mkdir -p /opt/redbox-portal/.tmp/playwright/test-results
mkdir -p /opt/redbox-portal/.tmp/playwright/logs
mkdir -p /opt/redbox-portal/.tmp/playwright/coverage

rm -f /opt/redbox-portal/.tmp/junit/backend-playwright/backend-playwright.xml || true

node support/integration-testing/check-playwright-coverage.cjs
# Selected runs validate the complete collection first, then report their own
# result. The complete acceptance gate applies to an unfiltered invocation.
if (($# == 0)); then
  node --test test/playwright-harness/*.test.cjs
  export PLAYWRIGHT_REQUIRE_COMPLETE=true
fi
exec node_modules/.bin/playwright test "$@"
