#!/usr/bin/env bash
set -euo pipefail
cd /opt/redbox-portal
node --version
node -e 'require("@researchdatabox/redbox-core").generateAllShims(process.cwd(),{forceRegenerate:true}).catch(e=>{console.error(e);process.exitCode=1})'
if [[ "${V_PORTAL_MODE:-mocha}" == bruno ]]; then
  exec node app.integrationtest.js
fi
exec node node_modules/.bin/mocha --config test/integration/.mocharc.js --exit test/bootstrap.test.ts test/integration/models/Vocabulary.test.ts test/integration/services/VocabularyService.test.ts test/integration/services/VocabularyBootstrapData.test.ts test/integration/services/FigshareVocabularyBootstrapData.test.ts test/integration/services/RvaImportService.test.ts test/integration/services/FormVocabularyService.test.ts test/integration/services/FormVocabularyServiceLookupAjax.test.ts
