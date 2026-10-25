'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require(path.resolve('node_modules/typescript'));
function sourceModule(relative, overrides = {}, raw) {
  const filename = path.resolve(relative), mod = new Module(filename);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const actual = Module.createRequire(filename);
  mod.require = name => Object.hasOwn(overrides, name) ? overrides[name] : actual(name);
  mod._compile(ts.transpileModule(raw ?? reviewed(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText, filename);
  return mod.exports;
}
function reviewed(relative) { return execFileSync('git', ['show', '2bc244c01:' + relative], { encoding: 'utf8' }); }
function baseline(relative) { return execFileSync('git', ['show', 'a49366803:' + relative], { encoding: 'utf8' }); }
function extract(source, name, kind = 'method') {
  const sf = ts.createSourceFile('probe.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  function visit(node) {
    if ((kind === 'method' ? ts.isMethodDeclaration(node) : ts.isPropertyAssignment(node)) && node.name?.getText(sf) === name) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sf); if (found.length !== 1) throw Error('Unexpected source matches: ' + name + ': ' + found.length);
  return kind === 'method' ? found[0].body.getText(sf) : found[0].initializer.getText(sf);
}
module.exports = { sourceModule, baseline, reviewed, extract, ts };
