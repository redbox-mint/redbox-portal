#!/usr/bin/env bash
# Mandatory isolated generated-app gate. The database is disposable (migrate: drop).
set -euo pipefail
: "${RECORD_DEFINITION_TEST_MONGO_URL:?B09 gate requires an isolated disposable Mongo URL; see support/integration-testing/B09-native.md}"
export NODE_ENV=development
unset sails_security__csrf
export TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'
node --no-experimental-strip-types - <<'JS'
const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.RECORD_DEFINITION_TEST_MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  try { await client.connect(); await client.db().command({ ping: 1 }); }
  finally { await client.close(); }
})().catch(error => { console.error('B09 native gate: Mongo prerequisite unavailable:', error.name); process.exitCode = 1; });
JS
exec node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --fail-zero --forbid-pending \
  --require ts-node/register/transpile-only --require chai \
  --require ./test/integration/helpers/b09-http-bootstrap.cjs \
  test/integration/services/RecordDefinitionPublicationService.test.ts \
  test/integration/services/RecordDefinitionDraftService.test.ts \
  test/integration/services/RecordDefinitionSeedService.test.ts "$@"
