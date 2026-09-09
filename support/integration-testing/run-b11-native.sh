#!/usr/bin/env bash
set -euo pipefail
: "${RECORD_DEFINITION_TEST_MONGO_URL:?B11 requires an isolated disposable Mongo database}"
export NODE_ENV=development
unset sails_security__csrf
export TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'
exec node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --fail-zero --forbid-pending \
  --require ts-node/register/transpile-only --require chai \
  --require ./test/integration/helpers/b09-http-bootstrap.cjs \
  test/integration/services/RecordDefinitionMigrationService.test.ts "$@"
