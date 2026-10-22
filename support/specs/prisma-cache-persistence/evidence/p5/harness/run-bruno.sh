#!/usr/bin/env bash
set -euo pipefail
cd /opt/bruno-tests
printf 'P5 Bruno requested cache backend=%s\n' "$RBPORTAL_CACHE_BACKEND"
npm ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
rest_status=0
app_status=0
cd /opt/bruno-rest
/opt/bruno-tests/node_modules/.bin/bru run --disable-cookies --env int-test --sandbox developer --format junit --output "/opt/junit/backend-bruno/p5-rest-${RBPORTAL_CACHE_BACKEND}.xml" || rest_status=$?
cd /opt/bruno-tests
node_modules/.bin/bru run --disable-cookies --env int-test --sandbox developer --format junit --output "/opt/junit/backend-bruno/p5-app-${RBPORTAL_CACHE_BACKEND}.xml" || app_status=$?
exit $((rest_status || app_status))
