'use strict';
// Load incoming native handler source without mutating the shared checkout.
const Module = require('node:module');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const owners = ['src/http/express/datastreamWrites.ts', 'src/http/express/pages.ts', 'src/application/portal/http.ts'];
const files = new Map(owners.map(owner => {
 const relative = 'packages/redbox-core/' + owner;
 return [path.join(root, relative), execFileSync('git', ['show', '9bb858218:' + relative], {cwd: root, encoding:'utf8'})];
}));
const original = Module._extensions['.ts'];
Module._extensions['.ts'] = (module, file) => {
  if (!files.has(file)) return original(module, file);
  module._compile(
    require('typescript').transpileModule(files.get(file), {
      fileName: file,
      compilerOptions: { module: 1, target: 9, esModuleInterop: true },
    }).outputText,
    file
  );
};
