'use strict';
// Execute actual baseline method bodies with deterministic domain ports. This is
// a controller-input probe, not a full Sails server or persistence qualification.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const core = createRequire(path.resolve('packages/redbox-core/package.json'));
const ts = core('typescript');
const { of } = core('rxjs');
const baseline = 'a49366803164429f9d8bdd249dadcdf856c9d13e';
const cache = new Map();
function method(file, name, globals = {}) {
  if (!cache.has(file)) cache.set(file, execFileSync('git', ['show', baseline + ':' + file], { encoding: 'utf8' }));
  const ast = ts.createSourceFile(file, cache.get(file), ts.ScriptTarget.Latest, true);
  const matches = [];
  function visit(node) {
    if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(ast) === name)
      matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(matches.length, 1, file + ':' + name);
  const node = matches[0];
  const expression =
    '(' +
    (node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '') +
    'function(' +
    node.parameters.map(p => p.getText(ast)).join(',') +
    ')' +
    node.body.getText(ast) +
    ')';
  // Keep values in the host realm: response sanitizers reject foreign-realm
  // object prototypes, which would otherwise be a probe-only false failure.
  const compiled = ts.transpileModule(expression, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.compileFunction('return ' + compiled, Object.keys(globals))(...Object.values(globals));
}
module.exports = { method, baseline, core };
