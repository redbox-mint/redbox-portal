#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

mode="${RBPORTAL_PLAYWRIGHT_MODE:-image}"
stamp_file=".tmp/playwright/build-stamp"

workspace_bundle_directories() {
  node - <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync('playwright-application-bundles.json', 'utf8'));
if (!manifest.length || new Set(manifest.map(app => app.name)).size !== manifest.length) {
  throw new Error('Invalid Angular application bundle manifest.');
}
for (const app of manifest) process.stdout.write(`${app.directory}\n`);
NODE
}

verify_bundles() {
  local missing=()
  local bundle_directories
  bundle_directories="$(workspace_bundle_directories)" || return 1
  while IFS= read -r bundle_directory; do
    [[ -z "$bundle_directory" ]] && continue
    if ! find "$bundle_directory" -maxdepth 1 -type f -name 'main*.js' -print -quit 2>/dev/null | grep -q .; then
      missing+=("$bundle_directory")
    fi
  done <<< "$bundle_directories"
  if [[ ! -f assets/js/index.bundle.js && ! -f .tmp/public/js/index.bundle.js && ! -f .tmp/public/default/default/js/index.bundle.js ]]; then
    missing+=("webpack:index.bundle.js")
  fi
  for shared_asset in css js/jquery.min.js js/bootstrap.bundle.min.js; do
    case "$shared_asset" in
      css)
        candidates=(
          assets/styles/theme.css
          .tmp/public/styles/theme.css
          assets/default/default/styles/style.min.css
          .tmp/public/default/default/styles/style.min.css
        )
        label=styles/theme.css
        ;;
      *)
        candidates=("assets/$shared_asset" ".tmp/public/$shared_asset" "assets/default/default/$shared_asset" ".tmp/public/default/default/$shared_asset")
        label=$shared_asset
        ;;
    esac
    found=false
    for candidate in "${candidates[@]}"; do
      if [[ -f "$candidate" ]]; then found=true; break; fi
    done
    if [[ "$found" != true ]]; then missing+=("webpack:$label"); fi
  done
  if ((${#missing[@]})); then
    printf 'Missing required production bundle(s): %s\n' "${missing[*]}" >&2
    return 1
  fi
}

if [[ "$mode" == "mount" ]]; then (
  # Compilers need more heap than the running portal. Keep its runtime limit.
  export NODE_OPTIONS=--max-old-space-size=4096
  npm ci --include=dev --ignore-scripts --strict-peer-deps --no-audit
  # Build the mounted graph in dependency order using its committed locks.
  # Remove generated output so renamed/deleted source files cannot survive.
  prepare_package() (
    cd "packages/$1"
    npm ci --include=dev --ignore-scripts --strict-peer-deps --no-audit
    rm -rf dist
    npm run "$2"
  )
  prepare_package raido build
  prepare_package rva-registry build
  prepare_package agenda-sqs-backend build
  prepare_package sails-ng-common compile
  prepare_package redbox-core build
  prepare_package sails-hook-redbox-storage-mongo build
  prepare_package redbox-hook-dev build
  node_modules/.bin/tsc -p tsconfig.json
  (
      angular_node_version="$(cat .nvmrc)"
      if [[ -x "/opt/redbox-build-node/v${angular_node_version}/bin/node" ]]; then
        export PATH="/opt/redbox-build-node/v${angular_node_version}/bin:$PATH"
      elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        source "$HOME/.nvm/nvm.sh"
        nvm use "$angular_node_version"
      fi
      if [[ "$(node --version)" != "v${angular_node_version}" ]]; then
        echo "Mounted Angular preparation needs Node ${angular_node_version}. Build and use the Docker test target from this checkout." >&2
        exit 1
      fi
      cd angular
      npm ci --include=dev --ignore-scripts --strict-peer-deps --no-audit
      # Applications import these workspace libraries; build them first so
      # Angular resolves the same generated entry points as the release build.
      node_modules/.bin/ng build --configuration=development @researchdatabox/portal-ng-common
      node_modules/.bin/ng build --configuration=development @researchdatabox/portal-ng-form-custom
      while IFS= read -r project; do
        [[ -z "$project" ]] && continue
        node_modules/.bin/ng build --configuration=development "$project"
      done < <(node -e "const w=require('./angular.json'); for (const [name,p] of Object.entries(w.projects||{})) if (p.projectType==='application') console.log(name)")
  )
  rm -rf .tmp/public
  npm run webpack
  mkdir -p "$(dirname "$stamp_file")"
  node support/integration-testing/playwright-build-state.cjs write
  verify_bundles
)
else
  verify_bundles
fi

# Redoc is only needed to build the browser bundle. Remove it before Sails
# boots so moduleloader does not scan its transitive `should` package.
rm -rf node_modules/redoc

export RBPORTAL_COVERAGE_DIR="${RBPORTAL_COVERAGE_DIR:-/tmp/coverage/playwright}"
export NYC_OUTPUT="${NYC_OUTPUT:-/tmp/nyc_output_playwright}"
mkdir -p "$RBPORTAL_COVERAGE_DIR" "$NYC_OUTPUT" .tmp/playwright/logs
chmod 777 "$RBPORTAL_COVERAGE_DIR" "$NYC_OUTPUT" .tmp/playwright/logs || true

exec node_modules/.bin/nyc --no-clean \
  --temp-dir "$NYC_OUTPUT" \
  --report-dir "$RBPORTAL_COVERAGE_DIR" \
  --reporter=lcov --exclude-after-remap=false \
  node app.integrationtest.js
