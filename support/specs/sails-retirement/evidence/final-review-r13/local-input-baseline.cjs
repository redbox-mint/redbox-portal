'use strict';
// Execute the actual baseline controller with its pinned native Passport strategy.
// Persistence/audit/page ports are deterministic; this is not a full Sails server.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const fromCore = createRequire(path.resolve('packages/redbox-core/package.json'));
const { Passport } = fromCore('passport');
const { Strategy } = fromCore('passport-local');
const ts = fromCore('typescript');
const file = 'packages/redbox-core/src/controllers/UserController.ts';
const source = execFileSync('git', ['show', 'a49366803:' + file], { encoding: 'utf8' });
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const matches = [];
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'localLogin') matches.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(matches.length, 1);
const code = ts.transpileModule('(function(req,res)' + matches[0].body.getText(ast) + ')', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const rows = [
  { name: 'body', body: { username: 'person', password: 'password' } },
  { name: 'query without body', query: { username: 'person', password: 'password' } },
  { name: 'mixed username body', body: { username: 'person' }, query: { password: 'password' } },
  { name: 'mixed password body', body: { password: 'password' }, query: { username: 'person' } },
  { name: 'empty body fallback', body: { username: '', password: '' }, query: { username: 'person', password: 'password' } },
  { name: 'body precedence', body: { username: 'person', password: 'wrong' }, query: { password: 'password' }, denied: true },
  { name: 'custom query', fields: ['loginName', 'loginSecret'], query: { loginName: 'person', loginSecret: 'password' } },
  { name: 'nested body', fields: ['credentials[name]', 'credentials[secret]'], body: { credentials: { name: 'person', secret: 'password' } } },
  { name: 'nested query', fields: ['credentials[name]', 'credentials[secret]'], query: { credentials: { name: 'person', secret: 'password' } } },
  { name: 'empty configured field defaults', fields: ['', ''], body: { username: 'person', password: 'password' } },
];
(async () => {
  const results = [];
  for (const row of rows) {
    const passport = new Passport();
    passport.use('local', new Strategy({ usernameField: row.fields?.[0], passwordField: row.fields?.[1] },
      (username, password, done) => done(null, username === 'person' && password === 'password' ? { id: 'user' } : false, { message: 'checked' })));
    const controller = vm.runInNewContext(code, {
      sails: { config: { passport }, getActions: () => ({ 'user/getpostloginurl': () => '/home' }) },
      UsersService: { addUserAuditEvent: async () => {} },
      RequestDetails: class { constructor(req) { this.body = { ...req.body }; } },
    });
    const result = await new Promise((resolve, reject) => {
      const receiver = {
        updateChronicle() {}, extractUserDetailsForChronicle() { return {}; }, extractLoginMessage(info) { return info?.message; },
        recordBackgroundOperation(_req, _name, pending) { pending.catch(reject); },
        getNoCacheHeaders() { return {}; }, sendResp(_req, res, value) { res.send(value.data); },
      };
      controller.call(receiver, {
        body: row.body, query: row.query, headers: { 'x-source': 'jsclient' }, session: {},
        logIn(_user, done) { done(); },
      }, { send: resolve, serverError: () => reject(Error('Unexpected baseline server error')) });
    });
    assert.equal(Boolean(result.user), !row.denied, row.name);
    results.push({ name: row.name, accepted: !row.denied });
  }
  console.log(JSON.stringify({ baseline: 'a49366803', controller: file, passportLocalVersion: fromCore('passport-local/package.json').version, rows: results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
