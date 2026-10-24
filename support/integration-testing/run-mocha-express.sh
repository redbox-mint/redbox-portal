#!/usr/bin/env bash
# Run the existing application integration suite against the production Express
# composition. Its explicit test config must select disposable prepared databases.
set -euo pipefail
cd "$(dirname "$0")/../.."
export NODE_ENV=integrationtest TS_NODE_PROJECT=tsconfig.json TS_NODE_TRANSPILE_ONLY=true
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'
if [[ $# == 0 ]]; then set -- 'test/integration/**/*.test.ts'; fi
exec node --no-experimental-strip-types -r ts-node/register -r ./test/helpers/compiledCore.cjs \
  node_modules/mocha/bin/mocha.js --config test/integration/.mocharc.js \
  test/express.bootstrap.test.cjs "$@"
