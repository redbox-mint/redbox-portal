'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { sourceModule, reviewed, baseline, ts } = require('./probe-utils.cjs');
const root = process.cwd();
const originalTs = require.extensions['.ts'], originalJson = require.extensions['.json'];
require.extensions['.ts'] = (module, filename) => {
  const relative = path.relative(root, filename);
  if (!relative.startsWith('packages/redbox-core/src/')) return originalTs(module, filename);
  module._compile(ts.transpileModule(reviewed(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, experimentalDecorators: true } }).outputText, filename);
};
require.extensions['.json'] = (module, filename) => {
  if (filename === path.resolve('packages/redbox-core/src/configuration/portal-domains.schema.json')) module.exports = JSON.parse(reviewed(path.relative(root, filename)));
  else originalJson(module, filename);
};
const { loadPortalConfiguration } = require(path.resolve('packages/redbox-core/src/configuration/portal.ts'));
const { Passport } = require('passport');
const metadata = { issuer: 'https://identity.example.invalid', authorization_endpoint: 'https://identity.example.invalid/authorize', token_endpoint: 'https://identity.example.invalid/token', jwks_uri: 'https://identity.example.invalid/jwks', response_types_supported: ['code'] };
function baseInstaller() {
  const source = baseline('packages/redbox-core/src/services/UsersService.ts');
  const sf = ts.createSourceFile('base.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let initializer;
  function visit(node) {
    if (ts.isPropertyDeclaration(node) && node.name?.getText(sf) === 'openIdConnectAuth') initializer = node.initializer.body.getText(sf);
    ts.forEachChild(node, visit);
  }
  visit(sf); assert(initializer);
  return sourceModule('packages/redbox-core/src/services/UsersService.ts', {},
    `const _=require('lodash'); exports.make=(sails,BrandingService)=>function() ${initializer};`).make;
}
async function baselineInstall(providerConfig) {
  const passport = new Passport(), strategies = [];
  const actualUse = passport.use.bind(passport);
  passport.use = (name, strategy) => { strategies.push(name); return actualUse(name, strategy); };
  let pending; const failures = [];
  const fn = baseInstaller()({ config: { passport }, log: { info() {} } }, { getDefault: () => ({ name: 'default' }) });
  fn.call({ registerSailsHook(_event, _name, task) { pending = task(); }, getAuthConfig: () => ({ active: ['oidc'], oidc: providerConfig }),
    updateChronicle(_info, errors) { if (errors) failures.push(errors.map(error => error.message)); }, sleep: async () => {}, openIdConnectAuthVerifyCallback() {} });
  await pending; assert.equal(failures.length, 0);
  return strategies;
}
function declarations(oidc) { return { providers: [{ name: 'fixture', root, declaration: { apiVersion: 1, config: { brandingConfigurationDefaults: { auth: { active: ['oidc'], oidc } } } } }] }; }
(async () => {
  const env = { REDBOX_SESSION_SECRET: 'synthetic-review-session-secret-at-least-32-characters' };
  const config = await loadPortalConfiguration({ env });
  const original = structuredClone(config.brandingConfigurationDefaults.auth.oidc);
  const full = { ...original, identifier: 'first', discoverAttemptsMax: 1, opts: { ...original.opts, issuer: metadata, client: { ...original.opts.client, client_id: 'fixture', redirect_uris: ['https://portal.example.invalid/user/login_oidc'] } } };
  const one = { ...full, opts: { ...full.opts, issuer: metadata.issuer } };
  const rows = [];
  for (const [name, provider] of [['url-control', one], ['metadata-object', full], ['provider-array', [one, { ...one, identifier: 'second' }]], ['public-client-defaults', { ...one, opts: { issuer: metadata.issuer, client: { client_id: 'fixture-public' } } }]]) {
    let output, error;
    try { output = await loadPortalConfiguration({ env, extensions: declarations(provider) }); } catch (e) { error = { name: e.name, path: e.path, message: e.message }; }
    if (name === 'url-control' || name === 'public-client-defaults') assert(output); else assert(error);
    const providersForBase = Array.isArray(provider) ? provider.map(item => ({ ...item, opts: { ...item.opts, issuer: metadata } })) : { ...provider, opts: { ...provider.opts, issuer: metadata } };
    const installed = await baselineInstall(providersForBase);
    assert.equal(installed.length, Array.isArray(provider) ? 2 : 1);
    rows.push({ name, acceptedByCurrentLoader: !!output, error, baselineInstalled: installed,
      ...(name === 'public-client-defaults' ? { normalizedClient: output.brandingConfigurationDefaults.auth.oidc.opts.client, normalizedParams: output.brandingConfigurationDefaults.auth.oidc.opts.params } : {}) });
  }
  const schema = JSON.parse(reviewed('packages/redbox-core/src/configuration/portal-domains.schema.json'));
  const Ajv = require('ajv');
  const validator = new Ajv({ strict: false, validateFormats: false }).compile({ definitions: schema.definitions, $ref: '#/definitions/BrandAuthOidcConfig' });
  const variants = [
    ['optional-client-fields', { ...full, opts: { ...full.opts, issuer: metadata.issuer, client: { client_id: 'public-fixture' } } }],
    ['optional-params', { ...full, opts: { issuer: metadata.issuer, client: full.opts.client } }],
    ['optional-scope', { ...full, opts: { ...full.opts, issuer: metadata.issuer, params: {} } }],
    ['minimal-array-item', { identifier: 'minimal', discoverAttemptsMax: 1, claimMappings: { username: 'sub', email: 'email' }, opts: { issuer: metadata.issuer, client: { client_id: 'minimal-public' } } }]
  ];
  for (const [name, provider] of variants) {
    assert.equal(validator(provider), false);
    const errors = structuredClone(validator.errors);
    const installed = await baselineInstall({ ...provider, opts: { ...provider.opts, issuer: metadata } });
    assert.equal(installed.length, 1);
    rows.push({ name, perProviderSchemaAccepted: false, errors, baselineInstalled: installed });
  }
  console.log(JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
