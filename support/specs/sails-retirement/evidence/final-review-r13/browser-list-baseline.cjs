'use strict';
// Execute both actual baseline browser list actions with deterministic record ports.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const fromCore = createRequire(path.resolve('packages/redbox-core/package.json'));
const ts = fromCore('typescript');
const file = 'packages/redbox-core/src/controllers/RecordController.ts';
const source = execFileSync('git', ['show', 'a49366803:' + file], { encoding: 'utf8' });
assert.equal(source.includes('max_requests'), false);
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const methods = new Map();
function visit(node) {
  if (ts.isMethodDeclaration(node)) methods.set(node.name.getText(ast), node);
  ts.forEachChild(node, visit);
}
visit(ast);
(async () => {
  const results = [];
  for (const action of ['getRecordList', 'getDeletedRecordList']) {
    const code = ts.transpileModule('(async function(req,res)' + methods.get(action).body.getText(ast) + ')', {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const run = vm.runInNewContext(code, { _: fromCore('lodash') });
    for (const rows of [50, 100]) {
      let received;
      let sent;
      const load = async (...args) => { received = args[3]; return { items: [] }; };
      await run.call({
        getReqBrand: () => ({ id: 'brand' }), getRecords: load, getDeletedRecords: load,
        sendResp: (_req, _res, response) => { sent = response; },
      }, {
        query: {}, isAuthenticated: () => true, user: { username: 'person', roles: [] },
        param: name => name === 'rows' ? String(rows) : undefined,
      }, {});
      assert.equal(received, String(rows));
      assert.ok(sent.data);
      results.push({ action, rows, accepted: true });
    }
  }
  console.log(JSON.stringify({ baseline: 'a49366803', file, apiLimitRead: false, results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
