'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const root = require('node:path').resolve(__dirname, '../../../../..');
const wsu = '/home/andrew/src/bitbucket/redbox-hook-wsu-v6';
const {createHttpCsrf} = require(root + '/packages/redbox-core/dist/http/express');
const sources = {
  baseline: execFileSync('git', ['show', '14ab99e:support/development/docker-compose.yml'], {cwd: wsu, encoding: 'utf8'}),
  incoming: execFileSync('git', ['show', '80b2b80:support/development/docker-compose.yml'], {cwd: wsu, encoding: 'utf8'}),
  current: fs.readFileSync(wsu + '/support/development/docker-compose.yml', 'utf8'),
};
const cases = [
  {name: 'default', env: {}, origin: 'http://localhost:1500', port: '1500'},
  {name: 'selected-port', env: {REDBOX_PORTAL_HOST_PORT: '18599'}, origin: 'http://localhost:18599', port: '18599'},
  {name: 'explicit-url', env: {REDBOX_PORTAL_HOST_PORT: '18599', REDBOX_PORTAL_APP_URL: 'https://wsu.example.invalid'}, origin: 'https://wsu.example.invalid', port: '18599'},
  {name: 'empty-selectors', env: {REDBOX_PORTAL_HOST_PORT: '', REDBOX_PORTAL_APP_URL: ''}, origin: 'http://localhost:1500', port: '1500'},
];
function csrfStatus(publicUrl, origin) {
  const csrf = createHttpCsrf({origins: [new URL(publicUrl).origin]});
  const req = {method: 'POST', headers: {origin, 'x-redbox-api-version': '2.0'}, query: {}, session: {}, get: () => 'same-origin'};
  req.headers['x-csrf-token'] = csrf.generateToken(req);
  let passed = false;
  const res = {statusCode: 200, set() {return this;}, status(code) {this.statusCode = code; return this;}, json(body) {this.body = body; return this;}};
  csrf.protect(req, res, error => {assert.ifError(error); passed = true;});
  return {status: res.statusCode, passed, body: res.body};
}
const results = [];
for (const [name, source] of Object.entries(sources)) for (const row of cases) {
  const env = {...process.env, REDBOX_BUILD_IMAGE: 'qualified/test:fixture', REDBOX_PORTAL_IMAGE: 'qualified/runtime:fixture', REDBOX_SESSION_SECRET: 'disposable-r24-session-secret-at-least-32'};
  delete env.REDBOX_PORTAL_HOST_PORT;
  delete env.REDBOX_PORTAL_APP_URL;
  Object.assign(env, row.env);
  const model = JSON.parse(execFileSync('docker', ['compose', '--project-directory', wsu + '/support/development', '--env-file', '/dev/null', '-f', '-', 'config', '--format', 'json'], {input: source, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}));
  const service = model.services.rbportal;
  const publicUrl = service.environment[name === 'baseline' ? 'sails_appUrl' : 'REDBOX_PUBLIC_URL'];
  assert(service.ports.some(port => port.target === 1500 && port.published === row.port));
  const result = csrfStatus(publicUrl, row.origin);
  const wrong = row.name === 'selected-port' && (name === 'incoming' || (name === 'current' && process.argv.includes('--before')));
  assert.equal(result.status, wrong ? 403 : 200, `${name}/${row.name}`);
  results.push({source: name, case: row.name, publishedPort: row.port, publicUrl, browserOrigin: row.origin, ...result});
}
const file = root + '/.tmp/sails-retirement/final-review-r24/compose-origin-' + (process.argv.includes('--before') ? 'before' : 'after') + '.json';
fs.writeFileSync(file, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({cases: results.length, sourceVersions: Object.keys(sources), expectedIncomingFailure: 'selected-port browser POST: 403', currentFixed: !process.argv.includes('--before'), file}));
