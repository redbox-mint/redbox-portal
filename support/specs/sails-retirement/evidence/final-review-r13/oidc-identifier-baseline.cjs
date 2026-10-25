'use strict';
// Execute baseline provider selection rather than an inferred Sails convention.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const fromCore = createRequire(path.resolve('packages/redbox-core/package.json'));
const ts = fromCore('typescript');
const file = 'packages/redbox-core/src/controllers/UserController.ts';
const source = execFileSync('git', ['show', 'a49366803:' + file], { encoding: 'utf8' });
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const methods = new Map();
function visit(node) {
  if (ts.isMethodDeclaration(node) && ['beginOidc', 'openidConnectLogin'].includes(node.name.getText(ast)))
    methods.set(node.name.getText(ast), node.body.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(methods.size, 2);
const rows = [];
for (const [method, body] of methods) {
  for (const identifier of ['institution.example.edu', 'urn:identity:research', 'institution α']) {
    let selected;
    const invoke = vm.runInNewContext(ts.transpileModule('(function(req,res,next)' + body + ')', {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, {
      _: fromCore('lodash'),
      sails: { config: { passport: { authenticate(name) { selected = name; return () => {}; } } } },
    });
    invoke.call({ updateChronicle() {} }, { param: name => name === 'id' ? identifier : undefined }, {}, () => {});
    assert.equal(selected, 'oidc-' + identifier);
    rows.push({ method, identifier, selected });
  }
}
console.log(JSON.stringify({ baseline: 'a49366803', controller: file, rows }, null, 2));
