#!/usr/bin/env bash
set -euo pipefail
npm install --global npm@11.20.0 --ignore-scripts --no-audit --no-fund
npm ci --include=dev --ignore-scripts --strict-peer-deps --no-audit --no-fund
node_modules/.bin/ng build --configuration=development @researchdatabox/portal-ng-common
node_modules/.bin/ng build --configuration=development @researchdatabox/portal-ng-form-custom
node_modules/.bin/ng build --configuration=development @researchdatabox/branding
