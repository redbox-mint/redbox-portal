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

# Ensure tests are accessible at test/integration for tools and project references
# If the project already has a `test/integration` folder (e.g. our mocha config),
# create per-file symlinks for `.test.ts` files so they are discoverable by Mocha.
if [[ -d typescript/test/integration ]]; then
  if [[ -e test/integration ]] && [[ ! -d test/integration ]]; then
    echo "Error: test/integration exists but is not a directory. Remove or rename it to proceed." >&2
    exit 1
  fi
  if [[ ! -e test/integration ]]; then
    ln -s "${PWD}/typescript/test/integration" test/integration
  else
    # create individual symlinks for test files if they don't exist
    mkdir -p test/integration
    find typescript/test/integration -type f -name "*.test.ts" | while read -r f; do
      dest="test/integration/$(basename "$f")"
      if [[ ! -e "$dest" ]]; then
        ln -s "${PWD}/$f" "$dest" || true
      fi
    done
  fi
fi

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

# Fallback to js bootstrap if ts is missing (e.g. broken symlink)
if [[ ! -f "$bootstrap_test" ]] && [[ -f "test/bootstrap.test.js" ]]; then
  echo "Warning: $bootstrap_test not found, using test/bootstrap.test.js"
  bootstrap_test="test/bootstrap.test.js"
fi

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

exec "${nyc_cmd[@]}" --no-clean \
  --temp-dir "$NYC_OUTPUT" \
  --report-dir "$RBPORTAL_COVERAGE_DIR" \
  --reporter=lcov --exclude-after-remap=false \
  "${final_args[@]}" \
  \
  $(
    # Mocha options: require ts-node/register and chai, support ts/js extensions
    echo --require ts-node/register --require chai --extension ts,js --recursive --timeout 30s --ui bdd
  ) \
  $(
    if [[ "${CI:-false}" == "true" ]]; then
      echo --reporter mocha-junit-reporter --reporter-option mochaFile=./.tmp/junit/backend-mocha/backend-mocha.xml
    else
      echo --reporter spec
    fi
  ) \
  --exit "${bootstrap_test}" "${test_args[@]}"
