'use strict';

// Preload after ts-node/register/transpile-only. Execute the current native HTTP
// regression against only the six pre-fix handler owners from the pinned R12
// HEAD, with current deterministic fixture ports. No checkout mutation occurs.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const revision = 'c8a5064d0f16ad9e10f083c6590ae4bc178085db';
const files = [
  'identityAdministration',
  'metadata',
  'formVocabulary',
  'vocabularyIntegrations',
  'pages',
  'formDelivery',
];
const selected = new Map(
  files.map(name => {
    const relative = 'packages/redbox-core/src/http/express/' + name + '.ts';
    return [path.join(root, relative), relative];
  })
);
const ordinary = Module._extensions['.ts'];
Module._extensions['.ts'] = function (module, filename) {
  const relative = selected.get(filename);
  if (!relative) return ordinary(module, filename);
  const source = execFileSync('git', ['show', revision + ':' + relative], { cwd: root, encoding: 'utf8' });
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText,
    filename
  );
};
// Keep source/provenance visible in the retained machine-readable result.
if (process.env.HTTP_ACCEPTANCE_NEGATIVE_METADATA)
  fs.writeFileSync(
    process.env.HTTP_ACCEPTANCE_NEGATIVE_METADATA,
    JSON.stringify(
      {
        revision,
        sourceOwners: [...selected.values()],
        fixture: 'test/http/httpInputAcceptance.test.ts',
        scope: 'Actual native handlers from pinned R12 HEAD with current deterministic domain ports; no live datastore',
      },
      null,
      2
    ) + '\n'
  );
