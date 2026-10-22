#!/usr/bin/env bash
set -euo pipefail
cd packages/redbox-core
export RBPORTAL_CACHE_BACKEND="$1"
printf 'P5 focused core requested backend=%s (unit repository doubles; real backend covered by test:cache-transition)\n' "$RBPORTAL_CACHE_BACKEND"
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js --no-config -r ts-node/register/transpile-only -r chai -r ./test/setup.ts --timeout 5000 test/services/CacheServiceCharacterization.test.ts test/services/BrandingPreviewCharacterization.test.ts test/services/IntegrationNotificationService.test.ts test/controllers/BrandingManagement.test.ts test/unit/cache-persistence-runtime.test.ts test/unit/cache-entry-repository.test.ts
