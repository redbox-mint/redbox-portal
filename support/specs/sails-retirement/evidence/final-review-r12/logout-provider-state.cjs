'use strict';
const assert = require('node:assert/strict');
const { sourceModule, baseline, extract } = require('./probe-utils.cjs');
const express = require('express');
const session = require('express-session');
const { Passport } = require('passport');
const { Strategy } = require('passport-local');
const { mountAuthenticationRoutes } = sourceModule('packages/redbox-core/src/http/express/login.ts', {
  '../../utilities/RequestChronicle': { RequestChronicleHelper: { existing() {} } },
  '../../authentication/Accounts': { AuthenticationRejected: class extends Error {} },
  './responses': { apiNoCacheHeaders: {} },
  './middleware': { httpAction: action => (req, res, next) => Promise.resolve().then(() => action(req, res, next)).catch(next) }
});
const provider = 'https://identity.example.invalid/logout?client_id=fixture';
async function current(nextType) {
  const actor = type => ({ id: type + '-user', username: type + '-fixture', type, roles: [{ id: 'role', brandId: 'brand' }] });
  const app = express(), passport = new Passport();
  app.use(express.json());
  app.use(session({ name: 'test.sid', secret: 'review-only-synthetic-secret', resave: false, saveUninitialized: false }));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => done(null, actor(id.split('-')[0])));
  passport.use('local', new Strategy((_username, _password, done) => done(null, actor('local'))));
  passport.use('aaf-jwt', { authenticate() { this.success(actor('aaf')); } });
  app.use(passport.initialize()); app.use(passport.session());
  // Establish exactly the persisted state of a prior successful OIDC login.
  app.post('/prior-oidc', (req, res, next) => req.logIn(actor('oidc'), error => {
    if (error) return next(error);
    Object.assign(req.session, { branding: 'default', portal: 'rdmp', logoutUrl: provider, authenticationVersion: 6 });
    req.session.save(error => error ? next(error) : res.json({ ok: true }));
  }));
  mountAuthenticationRoutes(app, {
    passport, identity: { session: async id => actor(id.split('-')[0]), profile: async id => actor(id.split('-')[0]) },
    defaultBrand: 'default', defaultPortal: 'rdmp', validContext: () => true,
    brandId: () => 'brand', postLoginPath: () => '/default/rdmp/home', postLogoutPath: '/default/rdmp/home',
    logoutOrigins: ['https://identity.example.invalid'], csrf: (_req, _res, next) => next(),
    sessionCookie: { name: 'test.sid' }, audit: async () => {}, loginFailure: async () => {}
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let cookie;
  async function request(url, body) {
    const response = await fetch(origin + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'x-source': 'jsclient', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body ?? {}) });
    await response.text(); cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    return response;
  }
  try {
    assert.equal((await request('/prior-oidc')).status, 200);
    if (nextType !== 'oidc') {
      const login = await request('/user/login_' + nextType, { username: 'fixture', password: 'synthetic', assertion: 'fixture' });
      assert.equal(login.status, nextType === 'local' ? 200 : 302);
    }
    const logout = await request('/default/rdmp/user/logout');
    assert.equal(logout.status, 302);
    return { nextType, redirect: logout.headers.get('location') };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
function oldLogout(type) {
  const source = baseline('packages/redbox-core/src/controllers/UserController.ts');
  const run = sourceModule('packages/redbox-core/src/controllers/UserController.ts', {},
    `const _ = require('lodash'); const RequestDetails = class {}; const sails = {config:{auth:{postLogoutRedir:'/default/rdmp/home'}}}; const BrandingService = {getBrandAndPortalPath:()=>'/default/rdmp'}; const UsersService = {addUserAuditEvent:()=>Promise.resolve()}; exports.run=function(req,res) ${extract(source, 'logout')}`
  ).run;
  let redirect;
  const user = { id: 'user', username: 'fixture', type };
  run.call({ updateChronicle() {}, extractUserDetailsForChronicle() { return {}; }, recordBackgroundOperation() {} },
    { session: { user, logoutUrl: provider }, user, logout: done => done() }, { redirect(url) { redirect = url; } });
  return { nextType: type, redirect };
}
(async () => {
  const results = [];
  for (const type of ['local', 'aaf', 'oidc']) {
    const old = oldLogout(type), now = await current(type);
    assert.equal(now.redirect, provider);
    assert.equal(old.redirect, type === 'oidc' ? provider : '/default/rdmp/home');
    results.push({ baseline: old, current: now });
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
