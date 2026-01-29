#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

# Remove the output from any previous tests
rm -rf /opt/redbox-portal/coverage/mocha/* || true
rm /opt/redbox-portal/.tmp/junit/backend-mocha/backend-mocha.xml || true

# Start redbox with code coverage
node_cmd=(node)
if [[ -n "${RBPORTAL_REMOTE_DEBUG:-}" ]]; then
  node_cmd+=(--inspect=0.0.0.0:9876)
fi

export TS_NODE_PROJECT=/opt/redbox-portal/tsconfig.json
export TS_NODE_TRANSPILE_ONLY=true
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'

# Ensure nyc writes to a writable directory in CI containers
export NYC_OUTPUT=${NYC_OUTPUT:-/tmp/nyc_output}
mkdir -p "$NYC_OUTPUT"

# Ensure tests are accessible at test/integration for tools and project references
# If the project already has a `test/integration` folder (e.g. our mocha config),
# create per-file symlinks for `.test.ts` files so they are discoverable by Mocha.
if [[ -d typescript/test/integration ]]; then
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

bootstrap_test=test/bootstrap.test.ts

test_args=()
if [[ -n "${RBPORTAL_MOCHA_TEST_PATHS:-}" ]]; then
  read -r -a env_test_args <<< "${RBPORTAL_MOCHA_TEST_PATHS}"
  test_args+=("${env_test_args[@]}")
fi

if [[ ${#@} -gt 0 ]]; then
  test_args+=("$@")
fi

if [[ ${#test_args[@]} -eq 0 ]]; then
  test_args=(test/integration/**/*.test.ts)
fi

nyc_cmd=()
# Prefer local nyc, fall back to global nyc, then npx nyc
if [[ -x node_modules/.bin/nyc ]]; then
  nyc_cmd=(node_modules/.bin/nyc)
elif command -v nyc >/dev/null 2>&1; then
  nyc_cmd=(nyc)
elif command -v npx >/dev/null 2>&1; then
  nyc_cmd=(npx nyc)
else
  echo "nyc not found: install nyc locally or globally, or ensure npx is available" >&2
  exit 127
fi

exec "${nyc_cmd[@]}" --no-clean \
  --report-dir /opt/redbox-portal/coverage/mocha \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" node_modules/.bin/mocha \
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
