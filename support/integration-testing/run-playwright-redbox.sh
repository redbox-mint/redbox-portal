#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

asset_mode=$(node support/build/integration-prebuilt-assets.cjs startup)

if [[ "$asset_mode" == "reuse" ]]; then
  if [[ ! -x node_modules/.bin/nyc ]]; then
    echo "Prepared CI image is missing nyc test dependencies." >&2
    exit 1
  fi
  export WEBPACK_SKIP=true
else
  bash /opt/redbox-portal/support/integration-testing/install-redbox-dependencies-if-writable.sh

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
  if [[ "$asset_mode" == "mounted" && -d angular ]]; then
    # Full/Angular source mounts may contain newer sources than their bundles.
    # The ordinary image profile only mounts backend/test support and has no
    # Angular workspace; retain its existing missing-bundle fallback below.
    needs_angular_build="true"
  fi
  for app_name in "${required_playwright_apps[@]}"; do
    if ! find "/opt/redbox-portal/assets/angular/${app_name}/browser" -maxdepth 1 -name 'main*.js' -print -quit 2>/dev/null | grep -q .; then
      needs_angular_build="true"
      break
    fi
  done

  if [[ "${needs_angular_build}" == "true" ]]; then
    (
      # The slim test image supplies Node/npm on PATH, but no nvm. Keep the
      # development helper's dependency/library/application build ordering while
      # allowing its two version-selection calls to use that installed runtime.
      # Scope the adapter to this child; a real nvm installation keeps control.
      if [[ ! -s "$HOME/.nvm/nvm.sh" ]]; then
        command -v node
        command -v npm
        nvm() {
          case "${1:-}" in
            install|use) echo "nvm unavailable; using installed Node $(node --version)" >&2 ;;
            *) echo "Unsupported nvm operation without nvm: $*" >&2; return 1 ;;
          esac
        }
        export -f nvm
      fi
      bash /opt/redbox-portal/support/development/compileDevAngular.sh
    )
  fi

  # Angular must finish before webpack copies its output into .tmp/public.
  if [[ "$asset_mode" == "mounted" ]]; then
    WEBPACK_SKIP=false npm run webpack
  else
    npm run webpack
  fi
fi

# Redoc is only needed to build the browser bundle. Remove it before Sails boots so
# moduleloader does not scan its transitive `should` package.
rm -rf node_modules/redoc

export RBPORTAL_COVERAGE_DIR=${RBPORTAL_COVERAGE_DIR:-/tmp/coverage/playwright}
export NYC_OUTPUT=${NYC_OUTPUT:-/tmp/nyc_output_playwright}
mkdir -p "$RBPORTAL_COVERAGE_DIR" "$NYC_OUTPUT"
chmod 777 "$RBPORTAL_COVERAGE_DIR" "$NYC_OUTPUT" || true

exec node_modules/.bin/nyc --no-clean \
  --temp-dir "$NYC_OUTPUT" \
  --report-dir "$RBPORTAL_COVERAGE_DIR" \
  --reporter=lcov --exclude-after-remap=false \
  node app.integrationtest.js
