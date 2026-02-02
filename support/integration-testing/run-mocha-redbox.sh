#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

# Remove the output from any previous tests
rm -rf /opt/redbox-portal/coverage/mocha/* || true
rm /opt/redbox-portal/.tmp/junit/backend-mocha/backend-mocha.xml || true

# Start redbox with code coverage
node_cmd=(node)

export TS_NODE_PROJECT=/opt/redbox-portal/tsconfig.json
export TS_NODE_TRANSPILE_ONLY=true
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'

# Ensure coverage output is writable in CI containers
export RBPORTAL_COVERAGE_DIR=${RBPORTAL_COVERAGE_DIR:-/tmp/coverage/mocha}
mkdir -p "$RBPORTAL_COVERAGE_DIR"
chmod 777 "$RBPORTAL_COVERAGE_DIR" || true

# Ensure nyc writes to a writable directory in CI containers
export NYC_OUTPUT=${NYC_OUTPUT:-/tmp/nyc_output}
mkdir -p "$NYC_OUTPUT"
chmod 777 "$NYC_OUTPUT" || true

# Run redbox-loader to generate shims before tests start
# This is crucial because test files require services/models at top-level
echo "Generating shims via redbox-loader..."
node -e "
  const redboxLoader = require('./redbox-loader');
  redboxLoader.generateAllShims(process.cwd(), {
    forceRegenerate: true,
    verbose: true
  }).catch(err => {
    console.error('Shim generation failed:', err);
    process.exit(1);
  });
"

bootstrap_test=test/bootstrap.test.ts


test_args=()
if [[ -n "${RBPORTAL_MOCHA_TEST_PATHS:-}" ]]; then
  mapfile -t env_test_args <<< "${RBPORTAL_MOCHA_TEST_PATHS}"
  test_args+=("${env_test_args[@]}")
fi

if [[ ${#@} -gt 0 ]]; then
  test_args+=("$@")
fi

if [[ ${#test_args[@]} -eq 0 ]]; then
  test_args=(test/integration/**/*.test.ts)
fi

# Ensure dependencies are available (install if missing)
if [[ ! -x node_modules/.bin/mocha ]] || [[ ! -x node_modules/.bin/nyc ]]; then
  echo "Test dependencies not found. Running npm install..."
  npm install
fi

mocha_cmd=(node_modules/.bin/mocha)
nyc_cmd=(node_modules/.bin/nyc)
if [[ -n "${RBPORTAL_REMOTE_DEBUG:-}" ]]; then
  nyc_cmd+=(--inspect="${RBPORTAL_REMOTE_DEBUG}")
fi

final_args=("${node_cmd[@]}" "${mocha_cmd[@]}")

mocha_config_args=()
if [[ -f test/integration/.mocharc.ts ]]; then
  mocha_config_args+=(--config test/integration/.mocharc.ts)
else
  mocha_config_args+=(
    --require ts-node/register
    --require chai
    --extension ts,js
    --recursive
    --timeout 30s
    --ui bdd
  )
  if [[ "${CI:-false}" == "true" ]]; then
    mocha_config_args+=(--reporter mocha-junit-reporter --reporter-option mochaFile=./.tmp/junit/backend-mocha/backend-mocha.xml)
  else
    mocha_config_args+=(--reporter spec)
  fi
fi

exec "${nyc_cmd[@]}" --no-clean \
  --temp-dir "$NYC_OUTPUT" \
  --report-dir "$RBPORTAL_COVERAGE_DIR" \
  --reporter=lcov --exclude-after-remap=false \
  "${final_args[@]}" \
  \
  "${mocha_config_args[@]}" \
  --exit "${bootstrap_test}" "${test_args[@]}"
