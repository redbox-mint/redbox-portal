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

bootstrap_test=typescript/test/bootstrap.test.ts


test_args=()
if [[ -n "${RBPORTAL_MOCHA_TEST_PATHS:-}" ]]; then
  read -r -a env_test_args <<< "${RBPORTAL_MOCHA_TEST_PATHS}"
  test_args+=("${env_test_args[@]}")
fi

if [[ ${#@} -gt 0 ]]; then
  test_args+=("$@")
fi

if [[ ${#test_args[@]} -eq 0 ]]; then
  test_args=(typescript/test/integration/**/*.test.ts)
fi

exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/mocha \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" node_modules/.bin/mocha \
  --config test/integration/.mocharc.js \
  --exit "${bootstrap_test}" "${test_args[@]}"
