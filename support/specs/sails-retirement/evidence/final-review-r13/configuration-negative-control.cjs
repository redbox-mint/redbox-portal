// Load the reviewed pre-fix modules in memory. Never replaces files in the shared checkout.
const Module = require('node:module');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const files = new Set([
  'packages/redbox-core/src/configuration/portal.ts',
  'packages/redbox-core/src/configuration/deployment.ts',
  'packages/redbox-core/src/configuration/portal-domains.schema.json',
  'packages/redbox-core/src/application/portal/http.ts',
]);
for (const extension of ['.ts', '.json']) {
  const previous = Module._extensions[extension];
  Module._extensions[extension] = (module, filename) => {
    const relative = path.relative(root, filename);
    if (!files.has(relative)) return previous(module, filename);
    const raw = execFileSync('git', ['show', 'c8a5064d0:' + relative], { cwd: root, encoding: 'utf8' });
    if (extension === '.json') module.exports = JSON.parse(raw);
    else module._compile(ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  };
}
