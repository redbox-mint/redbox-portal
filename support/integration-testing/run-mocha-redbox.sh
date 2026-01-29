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

bootstrap_test=test/bootstrap.test.js
if [[ -f test/bootstrap.test.ts ]]; then
  bootstrap_test=test/bootstrap.test.ts
fi

test_args=()
if [[ -n "${RBPORTAL_MOCHA_TEST_PATHS:-}" ]]; then
  read -r -a env_test_args <<< "${RBPORTAL_MOCHA_TEST_PATHS}"
  test_args+=("${env_test_args[@]}")
fi

if [[ ${#@} -gt 0 ]]; then
  test_args+=("$@")
fi

if [[ ${#test_args[@]} -eq 0 ]]; then
  test_args=(test/integration/**/*.test.js)
fi

exec node_modules/.bin/nyc --no-clean \
  --report-dir /opt/redbox-portal/coverage/mocha \
  --reporter=lcov --exclude-after-remap=false \
  "${node_cmd[@]}" node_modules/.bin/mocha \
  --config test/integration/.mocharc.js \
  --exit "${bootstrap_test}" "${test_args[@]}"
