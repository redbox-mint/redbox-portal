#!/usr/bin/env bash
set -euo pipefail
cd /opt/redbox-portal
node --version
node -e 'require("@researchdatabox/redbox-core").generateAllShims(process.cwd(),{forceRegenerate:true}).catch(e=>{console.error(e);process.exitCode=1})'
if [[ "${B_PORTAL_MODE:-mocha}" == bruno ]]; then
  exec node app.integrationtest.js
fi
exec node node_modules/.bin/mocha --config test/integration/.mocharc.js --exit test/bootstrap.test.ts test/integration/models/BrandingConfig.test.ts test/integration/services/BrandingService.test.ts test/integration/services/BrandingTypefaceLifecycle.test.ts test/integration/services/BrandingLogoService.test.ts test/integration/services/BrandingFaviconService.test.ts test/integration/services/CachePersistenceTransition.test.ts
