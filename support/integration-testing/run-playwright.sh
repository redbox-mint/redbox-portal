#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

npm ci --ignore-scripts --strict-peer-deps

mkdir -p /opt/redbox-portal/.tmp/junit/backend-playwright
mkdir -p /opt/redbox-portal/.tmp/playwright/report
mkdir -p /opt/redbox-portal/.tmp/playwright/test-results
mkdir -p /opt/redbox-portal/.tmp/playwright/storage

rm -f /opt/redbox-portal/.tmp/junit/backend-playwright/backend-playwright.xml || true

node_modules/.bin/playwright test
