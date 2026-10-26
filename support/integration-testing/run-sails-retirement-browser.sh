#!/usr/bin/env bash
set -euo pipefail
cd /opt/redbox-portal
export NODE_ENV=test
export TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json
export PUPPETEER_EXECUTABLE_PATH
PUPPETEER_EXECUTABLE_PATH=$(find /ms-playwright -path '*/chrome-linux*/chrome' -type f -print -quit)
mkdir -p .tmp/playwright/logs
rm -f .tmp/playwright/sr-pages-host.json .tmp/playwright/logs/run-metadata.json
node packages/redbox-core/scripts/package-pages.cjs views .tmp/public .tmp/playwright/installed-pages
node --no-experimental-strip-types -r ts-node/register/transpile-only packages/redbox-core/test/http/browserPagesHost.ts > .tmp/playwright/logs/sr-pages-host.log 2>&1 &
fixture_pid=$!
cleanup() { kill -TERM "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" || true; }
trap cleanup EXIT
for ((attempt=0;attempt<90;attempt++)); do
  if [[ -f .tmp/playwright/sr-pages-host.json ]]; then break; fi
  if ! kill -0 "$fixture_pid" 2>/dev/null; then cat .tmp/playwright/logs/sr-pages-host.log; exit 1; fi
  sleep 1
done
test -f .tmp/playwright/sr-pages-host.json
bash support/integration-testing/run-playwright.sh --config support/integration-testing/playwright.sails-retirement.config.ts "$@"
