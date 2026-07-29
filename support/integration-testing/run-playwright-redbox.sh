#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

bash /opt/redbox-portal/support/integration-testing/install-redbox-dependencies-if-writable.sh

npm run webpack

# Redoc is only needed to build the browser bundle. Remove it before Sails boots so
# moduleloader does not scan its transitive `should` package.
rm -rf node_modules/redoc

required_playwright_apps=(
  "local-auth"
  "record-search"
  "manage-users"
  "manage-roles"
  "admin-vocabulary"
  "app-config"
  "branding"
  "translation"
  "deleted-records"
  "harvest-runs"
)

needs_angular_build="false"
for app_name in "${required_playwright_apps[@]}"; do
  if ! find "/opt/redbox-portal/assets/angular/${app_name}/browser" -maxdepth 1 -name 'main*.js' -print -quit 2>/dev/null | grep -q .; then
    needs_angular_build="true"
    break
  fi
done

if [[ "${needs_angular_build}" == "true" ]]; then
  bash /opt/redbox-portal/support/development/compileDevAngular.sh
fi

export RBPORTAL_COVERAGE_DIR=${RBPORTAL_COVERAGE_DIR:-/tmp/coverage/playwright}
export NYC_OUTPUT=${NYC_OUTPUT:-/tmp/nyc_output_playwright}
mkdir -p "$RBPORTAL_COVERAGE_DIR" "$NYC_OUTPUT"
chmod 777 "$RBPORTAL_COVERAGE_DIR" "$NYC_OUTPUT" || true

exec node_modules/.bin/nyc --no-clean \
  --temp-dir "$NYC_OUTPUT" \
  --report-dir "$RBPORTAL_COVERAGE_DIR" \
  --reporter=lcov --exclude-after-remap=false \
  node app.integrationtest.js
