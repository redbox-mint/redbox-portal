#!/usr/bin/env bash
# Run the existing application integration suite against the production Express
# composition. Its explicit test config must select disposable prepared databases.
set -euo pipefail
cd "$(dirname "$0")/../.."
export NODE_ENV=integrationtest TS_NODE_PROJECT=tsconfig.json TS_NODE_TRANSPILE_ONLY=true
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'
node app.express.cjs --maintenance=indexes:ensure
if [[ $# == 0 ]]; then set -- 'test/integration/**/*.test.ts'; fi
coverage_dir="${RBPORTAL_COVERAGE_DIR:-/tmp/coverage/mocha}"
nyc_output="${NYC_OUTPUT:-/tmp/nyc_output_mocha}"
mkdir -p "$coverage_dir" "$nyc_output"
exec node_modules/.bin/nyc --no-clean \
  --temp-dir "$nyc_output" --cache-dir "$nyc_output/cache" --report-dir "$coverage_dir" \
  --reporter=lcov --exclude-after-remap=false \
  node --no-experimental-strip-types -r ts-node/register -r ./test/helpers/compiledCore.cjs \
  node_modules/mocha/bin/mocha.js --config test/integration/.mocharc.js \
  test/express.bootstrap.test.cjs "$@"
