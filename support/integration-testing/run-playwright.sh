#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if [ ! -x node_modules/.bin/playwright ]; then
  npm ci --ignore-scripts --strict-peer-deps
fi

# The browser PDF tests load the real PDF service and its shared test helpers.
# These packages have no compiled output in a clean CI checkout.
npm run compile:raido
npm run compile:rva
npm run compile:sails-ng-common
npm run compile:agenda-sqs
npm run compile:core
npm run compile:dev-tools
npm run compile:pdfgen-hook

mkdir -p /opt/redbox-portal/.tmp/junit/backend-playwright
mkdir -p /opt/redbox-portal/.tmp/playwright/report
mkdir -p /opt/redbox-portal/.tmp/playwright/test-results
mkdir -p /opt/redbox-portal/.tmp/playwright/storage

rm -f /opt/redbox-portal/.tmp/junit/backend-playwright/backend-playwright.xml || true

node_modules/.bin/playwright test
