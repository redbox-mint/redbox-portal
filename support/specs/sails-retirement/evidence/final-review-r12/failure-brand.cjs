'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { sourceModule, baseline, reviewed, extract } = require('./probe-utils.cjs');
const { Passport } = require('passport');
const { sign } = require('jsonwebtoken');
const fields = sourceModule('packages/redbox-core/src/persistence/identity/fields.ts');
const profile = sourceModule('packages/redbox-core/src/persistence/identity/profile.ts', { './fields': fields });
const accountsModule = sourceModule('packages/redbox-core/src/authentication/Accounts.ts', { '../persistence/identity/profile': profile });
const actions = { httpAction: action => action };
const policiesModule = sourceModule('packages/redbox-core/src/http/express/policies.ts', {
  '../../api-routes/schemaDelivery': {}, './middleware': actions, '../../api-routes/record-schema-response': {}
});
const providers = sourceModule('packages/redbox-core/src/http/express/identityProviders.ts', {
  '../../authentication/Accounts': accountsModule, '../../middleware/requestLifetime': { trackHttpRequestWork() {} }
});
const pagesModule = sourceModule('packages/redbox-core/src/http/express/pages.ts', {
  '../../pages/Artifacts': {}, '../../pages/locals': sourceModule('packages/redbox-core/src/pages/locals.ts'),
  '../../pages/csp': sourceModule('packages/redbox-core/src/pages/csp.ts'),
  '../../navigation/Navigation': { Services: { Navigation: class { async resolveMenu() { return []; } async resolveHomePanels() { return []; } async resolveAdminSidebar() { return []; } } } },
  '../../model/storage/BrandingModel': { BrandingModel: class {} }, '../../records/access': {},
  './policies': policiesModule, './middleware': actions
});
const { mountAuthenticationRoutes } = sourceModule('packages/redbox-core/src/http/express/login.ts', {
  '../../utilities/RequestChronicle': { RequestChronicleHelper: { existing() {} } },
  '../../authentication/Accounts': accountsModule, './responses': { apiNoCacheHeaders: {} }, './middleware': actions
});
const callbackText = extract(reviewed('packages/redbox-core/src/application/portal/http.ts'), 'renderAuthenticationFailure', 'property');
const factory = sourceModule('packages/redbox-core/src/application/portal/http.ts', {}, `exports.make=(config, policies, http, pages)=>(${callbackText});`).make;
const brands = Object.fromEntries(['default', 'other'].map(name => [name, { id: 'brand-' + name, name, roles: [] }]));
const config = { auth: { defaultBrand: 'default', defaultPortal: 'rdmp' } };
const policies = policiesModule.createHttpPolicies({
  branding: { getBrand: async query => brands[query.name] }, portals: ['rdmp', 'catalog'],
  authenticate: async () => false, defaultUnauthenticatedRole: () => undefined,
  pathRules: {}, emitRequestFailure: async () => {}
});
const pageInput = {
  rootContext: '/research', origin: 'https://portal.example.invalid', environment: 'production', templateConfig: {},
  settings: async brand => ({ marker: brand.name }), languages: async () => [], translate: (_brand, _language, key) => key,
  typeface: () => null, csrf: { generateToken: () => 'synthetic-token' }, csp: { enabled: false }, log: { warn() {} },
  artifacts: { bundleHash: () => '', view: (view, brand, portal) => [view, brand, portal].join(':'), layout: (brand, portal) => ['layout', brand, portal].join(':'),
    render: (file, locals) => require('ejs').render('<section data-artifact="<%= file %>" data-brand="<%= page.brand.name %>" data-portal="<%= page.portal %>"><%- typeof body === "string" ? body : "" %></section>', { file, body: '', ...locals }) }
};
const renderFailure = factory(config, policies, pagesModule, pageInput);
const secret = 'review-only-synthetic-aaf-key';
const aafConfig = { active: ['aaf'], aaf: { opts: { secretOrKey: secret } } };
const accounts = new accountsModule.AuthenticationAccounts({
  repository: { one: async () => null }, log: {}, event() {}, authConfig: () => aafConfig,
  defaultBrand: () => brands.default, getBrand: name => brands[name],
  defaultAuthenticatedRole: () => undefined, nestedRoles: () => [],
  authorizedEmails: () => ({ enabled: true, domainsAaf: ['allowed.example.invalid'] }), resolveHook() { throw Error('unused'); }
});
const passport = new Passport();
providers.installAafAuthentication({ passport, accounts, config: aafConfig, brand: req => brands[req.params.branding] });
const routes = new Map();
const router = Object.fromEntries(['post', 'get', 'head'].map(method => [method, (url, ...handlers) => routes.set(method + ' ' + url, handlers)]));
mountAuthenticationRoutes(router, {
  passport, identity: {}, defaultBrand: 'default', defaultPortal: 'rdmp',
  validContext: (brand, portal) => !!brands[brand] && ['rdmp', 'catalog'].includes(portal), brandId: brand => brands[brand].id,
  postLoginPath: (brand, portal) => '/research/' + brand + '/' + portal + '/home', csrf() {}, audit: async () => {}, loginFailure: async () => {}, renderAuthenticationFailure: renderFailure
});
function baseContext(body, query, session) {
  // Execute the actual baseline branding policy: it accepts body/query parameters
  // and retains them for the error page. No current logic is copied into it.
  const source = baseline('packages/redbox-core/src/policies/brandingAndPortal.ts');
  const policy = sourceModule('packages/redbox-core/src/policies/brandingAndPortal.ts', {}, "const _=require('lodash');" + source).brandingAndPortal;
  const req = { params: {}, body, query, session, param: name => body[name] ?? query[name] };
  policy(req, {}, () => {});
  return { locals: req.options.locals, session: req.session };
}
(async () => {
  const rows = [];
  for (const source of ['body', 'query', 'session']) {
    const selected = { branding: 'other', portal: 'catalog' };
    const req = { method: 'POST', path: '/user/login_aaf', url: '/user/login_aaf', originalUrl: '/user/login_aaf', params: {},
      body: { assertion: sign({ sub: 'subject', 'https://aaf.edu.au/attributes': { mail: 'person@denied.example.invalid', cn: 'Denied Subject' } }, secret, { issuer: 'https://rapid.aaf.edu.au', expiresIn: '5m' }), ...(source === 'body' ? selected : {}) },
      query: source === 'query' ? selected : {}, session: source === 'session' ? { ...selected } : {}, accepts: () => 'html' };
    const old = baseContext({ ...req.body }, { ...req.query }, { ...req.session });
    const response = { statusCode: 200, writableEnded: false, headersSent: false, status(code) { this.statusCode = code; return this; }, set() { return this; }, type() { return this; }, send(value) { this.body = value; this.writableEnded = true; return this; } };
    const [validate, action] = routes.get('post /user/login_aaf'); let valid = false;
    validate(req, response, () => { valid = true; }); assert(valid);
    await action(req, response);
    assert.equal(response.statusCode, 403);
    const rendered = policiesModule.requestContext(req);
    assert.equal(rendered.brand.name, source === 'session' ? 'other' : 'default');
    assert.equal(rendered.portal, source === 'session' ? 'catalog' : 'rdmp');
    if (source !== 'session') {
      assert.equal(old.locals.branding, 'other'); assert.equal(old.locals.portal, 'catalog');
      assert.match(response.body, /data-brand="default"/);
      assert.equal(req.session.branding, 'default');
    }
    rows.push({ source, requested: selected, baseline: old, current: { brand: rendered.brand.name, portal: rendered.portal, session: req.session, html: response.body } });
  }
  console.log(JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
