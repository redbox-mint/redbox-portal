#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

npm install --ignore-scripts --strict-peer-deps

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

exec node app.integrationtest.js
