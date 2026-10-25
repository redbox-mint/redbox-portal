'use strict';
// Run from the repository root with the qualified Node 26 executable.
// Real loopback Express/Passport/session/CSRF/policies; identity/audit ports are
// controlled. The Angular consumer is extracted, not a browser deployment.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const root = process.cwd();
require(root + '/node_modules/ts-node').register({ project: 'packages/redbox-core/test/tsconfig.json', transpileOnly: true });
const ts = require(root + '/node_modules/typescript');
const express = require(root + '/node_modules/express');
const session = require(root + '/node_modules/express-session');
const { createHttpAuthentication } = require(root + '/packages/redbox-core/src/http/express/authentication.ts');
const { mountAuthenticationRoutes } = require(root + '/packages/redbox-core/src/http/express/login.ts');
const { createHttpCsrf } = require(root + '/packages/redbox-core/src/http/express/csrf.ts');
const { createHttpPolicies } = require(root + '/packages/redbox-core/src/http/express/policies.ts');
const { httpAction, httpErrorHandler } = require(root + '/packages/redbox-core/src/http/express/middleware.ts');
const consumerPath = 'angular/projects/researchdatabox/local-auth/src/app/local-auth.component.ts';
const consumerSource = fs.readFileSync(consumerPath, 'utf8');
const tree = ts.createSourceFile(consumerPath, consumerSource, ts.ScriptTarget.Latest, true);
const methods = [];
(function visit(node) {
  if (ts.isMethodDeclaration(node) && ['onLogin', 'getErrors'].includes(node.name.getText(tree))) methods.push(node.getText(tree));
  ts.forEachChild(node, visit);
})(tree);
const compiled = ts.transpileModule('class Consumer {' + methods.join('\n') + '}', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const Consumer = new Function(compiled + ';return Consumer;')();
const observations = [];
const record = (name, details) => observations.push({ name, ...details });
const actor = { id: 'user-1', username: 'alice', type: 'local', roles: [{ id: 'role-1', name: 'Researcher', brandId: 'brand-1' }] };
const identity = {
  local: async (username, password) => username === 'alice' && password === 'correct-password' ? actor : false,
  session: async id => id === actor.id ? actor : false,
  profile: async id => id === actor.id ? { ...actor, name: 'Alice' } : null,
  bearer: async () => false,
};
async function main() {
  const app = express();
  app.set('query parser', 'extended');
  app.use(express.json());
  const store = new session.MemoryStore();
  const prefix = '/research';
  app.use(session({ name: 'r17.sid', secret: 'synthetic-r17-session-secret-at-least-32-characters', resave: false, saveUninitialized: false, store, cookie: { path: prefix } }));
  const authentication = createHttpAuthentication(identity);
  app.use(authentication.initialize, authentication.session);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const router = express.Router();
  const csrf = createHttpCsrf({ origins: [origin] });
  let failAudit = false;
  const audits = [];
  router.get('/csrfToken', csrf.token);
  const policies = createHttpPolicies({
    branding: { getBrand: async () => ({ id: 'brand-1', name: 'default' }) },
    pathRules: { getRulesFromPath: () => undefined, canRead: () => true },
    portals: ['portal'],
    defaultUnauthenticatedRole: () => undefined,
    emitRequestFailure: async () => {},
    authenticate: req => authentication.authenticate(req),
    rootContext: prefix,
  });
  router.get('/:branding/:portal/record/edit/:oid',
    ...['brandingandportal', 'browseractor', 'browserauthenticated', 'brandactor'].map(name => httpAction(policies[name])),
    (_req, res) => res.send('authorized edit page'));
  mountAuthenticationRoutes(router, {
    passport: authentication.passport, identity, rootContext: prefix,
    defaultBrand: 'default', defaultPortal: 'portal',
    validContext: (brand, portal) => brand === 'default' && portal === 'portal',
    brandId: () => 'brand-1', postLoginPath: () => prefix + '/default/portal/home',
    sessionCookie: { name: 'r17.sid', path: prefix },
    audit: async action => { if (failAudit) throw Error('synthetic-private-audit-failure'); audits.push(action); },
    loginFailure: async () => {}, csrf: csrf.protect,
  });
  app.use(prefix, router);
  app.use(httpErrorHandler({ error() {}, warn() {}, info() {}, debug() {} }));
  let cookie = '';
  async function request(target, options = {}) {
    const result = await fetch(origin + prefix + target, { redirect: 'manual', ...options,
      headers: { Cookie: cookie, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    for (const value of result.headers.getSetCookie()) cookie = value.split(';')[0];
    const text = await result.text();
    return { status: result.status, headers: result.headers,
      body: text && result.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
  }
  async function freshToken() { const result = await request('/csrfToken'); assert.equal(result.status, 200); return result.body._csrf; }
  function login(token, password = 'correct-password', version = '1.0') {
    return request('/user/login_local', { method: 'POST', body: JSON.stringify({ username: 'alice', password, branding: 'default', portal: 'portal' }),
      headers: { 'X-CSRF-Token': token, 'x-source': 'jsclient', 'X-ReDBox-Api-Version': version } });
  }
  async function consume(response) {
    const consumer = new Consumer();
    Object.assign(consumer, { isLoginDisabled: false, form: { status: 'VALID', value: { username: 'alice', password: 'correct-password' } },
      loggerService: { debug() {} }, window: { location: { href: '' } }, userService: { loginLocal: async () => {
        if (response.status >= 400) throw { status: response.status, error: response.body };
        return response.body;
      } } });
    await consumer.onLogin({ preventDefault() {} });
    return consumer;
  }
  try {
    for (const version of ['1.0', '2.0']) {
      cookie = '';
      const originalToken = await freshToken();
      const previousCookie = cookie;
      failAudit = true;
      const failed = await login(originalToken, 'correct-password', version);
      assert.equal(failed.status, 500);
      assert(!JSON.stringify(failed.body).includes('synthetic-private'));
      assert(failed.headers.getSetCookie().some(value => value.startsWith('r17.sid=;') && value.includes('Path=/research')));
      const recovered = await consume(failed);
      assert.equal(recovered.isLoginDisabled, false);
      assert.match(recovered.loginMessage, /Refresh this page before trying again\./);
      assert.equal(recovered.window.location.href, '');
      assert.deepEqual(recovered.form.value, { username: 'alice', password: 'correct-password' });
      record('audit rejection clears the session and recovers the consumer', { version, status: failed.status });
      cookie = previousCookie;
      const refused = await request('/user/info');
      assert.equal(refused.status, 403);
      record('failed login leaves no authenticated session', { version, status: refused.status });
      failAudit = false;
      const stale = await login(originalToken, 'correct-password', version);
      assert.equal(stale.status, 403);
      const staleConsumer = await consume(stale);
      assert.equal(staleConsumer.isLoginDisabled, false);
      assert.match(staleConsumer.loginMessage, /Refresh this page/);
      record('old CSRF cannot retry the destroyed session', { version, status: stale.status });
      const replacementToken = await freshToken();
      assert.notEqual(replacementToken, originalToken);
      const retried = await login(replacementToken, 'correct-password', version);
      assert.equal(retried.status, 200);
      const retriedConsumer = await consume(retried);
      assert.equal(retriedConsumer.window.location.href, prefix + '/default/portal/home');
      record('fresh CSRF and session recover the failed login', { version, status: retried.status });
    }
    cookie = '';
    const target = '/default/portal/record/edit/record-1?tab=metadata';
    const expired = await request(target);
    assert.equal(expired.status, 302);
    assert.equal(expired.headers.get('location'), prefix + '/default/portal/user/login');
    const token = await freshToken();
    const resumed = await login(token);
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.url, prefix + target);
    record('expired browser session preserves its original rooted destination', { redirect: resumed.body.url });
    const beforeLogout = cookie;
    const deniedLogout = await request('/default/portal/user/logout', { method: 'POST', headers: { 'X-CSRF-Token': token } });
    assert.equal(deniedLogout.status, 403);
    assert.equal((await request('/user/info')).status, 200);
    record('stale logout CSRF refuses effects and retains the logged-in session', { status: deniedLogout.status });
    const logoutToken = await freshToken();
    const loggedOut = await request('/default/portal/user/logout', { method: 'POST', headers: { 'X-CSRF-Token': logoutToken } });
    assert.equal(loggedOut.status, 302);
    assert.equal(loggedOut.headers.get('location'), prefix + '/default/portal/home');
    assert(loggedOut.headers.getSetCookie().some(value => value.startsWith('r17.sid=;')));
    cookie = beforeLogout;
    assert.equal((await request('/user/info')).status, 403);
    record('fresh logout CSRF completes redirect and invalidates the session', { status: loggedOut.status });
    const unsafeLogout = await request('/default/portal/user/logout');
    assert.equal(unsafeLogout.status, 405);
    assert.equal(unsafeLogout.headers.get('allow'), 'POST');
    record('GET logout retains its documented rejection', { status: unsafeLogout.status });
    fs.writeFileSync(path.join(__dirname, 'auth-recovery-results.json'), JSON.stringify({
      node: process.version, proof: 'Loopback HTTP with actual Express 5, Passport, sessions, CSRF, policies and extracted production Angular onLogin. Controlled identity/audit ports. No Mongo, historical host, live external provider or deployed-browser claim.',
      sourceSha256: crypto.createHash('sha256').update(consumerSource).digest('hex'), observations, audits,
    }, null, 2) + '\n');
    console.log(observations.length + ' native auth recovery observations passed');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
