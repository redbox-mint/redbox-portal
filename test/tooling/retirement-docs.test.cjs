'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const wiki = name => read(`support/wiki/${name}.md`);
const blocks = text => [...text.matchAll(/^[ \t]*```(\w*)\n([\s\S]*?)^[ \t]*```/gm)].map(m => ({language: m[1], code: m[2]}));
const sample = (text, marker) => {
  const selected = blocks(text).find(b => b.code.includes(marker));
  assert.ok(selected, `Missing executable example: ${marker}`);
  return selected.code;
};
function temporary(work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-docs-'));
  try { return work(dir); } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function compileAndRun(code) {
  return temporary(dir => {
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(dir, 'sample.ts'), code);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions: {
      target: 'ES2024', module: 'Node16', moduleResolution: 'Node16', strict: true,
      skipLibCheck: true, types: ['node'],
    }, files: ['sample.ts']}));
    const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', dir], {encoding: 'utf8', timeout: 60000});
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    return require(path.join(dir, 'sample.js'));
  });
}

test('README development commands supply the required session secret', () => {
  const command = blocks(read('README.md')).filter(b => /npm run dev:run/.test(b.code))[0].code;
  temporary(dir => {
    // Execute the actual documented block. npm records its environment instead
    // of starting services; Compose validates it offline without a Docker daemon.
    const npm = path.join(dir, 'npm');
    fs.writeFileSync(npm, '#!/bin/sh\nexec docker compose --profile mount -f "$PORTAL_DOC_ROOT/support/development/docker-compose.yml" config --quiet\n', {mode: 0o755});
    const env = {...process.env, PATH: dir + path.delimiter + process.env.PATH, PORTAL_DOC_ROOT: root};
    delete env.REDBOX_SESSION_SECRET;
    const result = spawnSync('bash', ['-euc', command], {env, cwd: root, encoding: 'utf8', timeout: 30000});
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test('README diagnostics use the current executable and readiness boundary', () => {
  const guide = read('README.md');
  assert.doesNotMatch(guide, /STARTUP_TIMING|SHIM_VERBOSE|node app\.js|completion of the Sails/);
  assert.match(guide, /\/readyz/);
  assert.ok(fs.existsSync(path.join(root, 'app.express.cjs')));
});

test('configuration guides explicitly select data and the secrets example loads offline', async () => {
  const names = ['AppConfig-Secrets', 'Configuring-Record-Forms', 'Configuring-Record-Types-in-ReDBox',
    'Configuring-Lookup-(Mint)-Records', 'Configuring-Email-Notifications', 'Configuring-Record-Workflows',
    'Configuring-the-search-page-for-a-record-type', 'Configuring-Related-Records', 'Server-Side-Form-Validation-Operations',
    'Record-Schema-Contract-Operations', 'Using-a-Repeatable-Contributor-Component-to-Define-Record-Permissions'];
  for (const name of names) {
    assert.match(wiki(name), /REDBOX_APPLICATION_CONFIG|explicit v6 configuration/iu, name);
    assert.doesNotMatch(wiki(name), /config\/(?:form|workflow|recordtype|emailnotification|recordValidation|solr|vocab|dashboardtype|local)\.js/u, name);
  }
  const code = blocks(wiki('AppConfig-Secrets')).find(b => b.language === 'js').code;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-config-doc-'));
  try {
    const file = path.join(dir, 'deployment.cjs');
    fs.writeFileSync(file, code);
    const {loadPortalConfiguration} = require('@researchdatabox/redbox-core/configuration');
    const config = await loadPortalConfiguration({files: {application: file}, env: {REDBOX_SESSION_SECRET: 'disposable-doc-test-session-secret-32'}});
    assert.equal(config.appConfigSecrets.provider, 'aws-secrets-manager');
    assert.equal(config.appConfigSecrets.namePrefix, 'my-production-portal/appconfig');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  assert.doesNotMatch(read('packages/sails-hook-redbox-pdfgen/README.md'), /sails_branding|config\/pdfgen\.js/);
  const forms = compileAndRun(sample(wiki('Configuring-Record-Forms'), 'export function registerRedboxExtension'));
  assert.ok(forms.registerRedboxExtension().forms['institution-1.0-draft']);
  assert.doesNotMatch(wiki('Record-Schema-Contract-Operations'), /string values .*true.*false.*are\s+normalized/);
});

test('chronicle handler example compiles and sends the documented safe error', () => {
  const guide = wiki('Request-Chronicle-Logging');
  assert.doesNotMatch(guide, /Controllers\.Core\.Controller|this\.sendResp|this\.recordBackgroundOperation/);
  const {reportFailure} = compileAndRun(sample(guide, 'export const reportFailure'));
  let response;
  const res = {set() { return this; }, status(n) { this.statusCode = n; return this; }, json(value) { response = value; }};
  reportFailure({headers: {'x-redbox-api-version': '2.0'}, query: {}}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(response, {errors: [{code: 'report-failed', title: 'Report failed'}], meta: {}});
});

test('Companion setup supplies explicit configuration and current authorization', async () => {
  const guide = wiki('TUS-and-Uppy-Companion-Setup');
  assert.doesNotMatch(guide + wiki('Uppy-and-TUS-Architecture'), /companionAttachmentUploadAuth|bypass flag|lazy app|src\/config\/(http|routes)\.config/);
  assert.match(guide, /authenticated actor/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-companion-doc-'));
  try {
    const file = path.join(dir, 'deployment.cjs');
    fs.writeFileSync(file, sample(guide, 'module.exports'));
    const {loadPortalConfiguration} = require('@researchdatabox/redbox-core/configuration');
    const config = await loadPortalConfiguration({files: {application: file}, env: {REDBOX_SESSION_SECRET: 'disposable-doc-test-session-secret-32'}});
    assert.equal(config.companion.enabled, true);
    assert.equal(config.companion.server.path, '/companion');
    assert.equal(config.companion.metrics, false);
    assert.ok(config.companion.filePath);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('all shipped skills teach owned handlers and render the actual page helper sample', () => {
  const directory = path.join(root, 'packages/redbox-dev-tools/skills');
  const files = fs.readdirSync(directory, {recursive: true}).filter(p => p.endsWith('.md'));
  for (const file of files) {
    const guide = fs.readFileSync(path.join(directory, file), 'utf8');
    assert.doesNotMatch(guide, /Controllers\.Core\.Controller|this\.sendResp|Controllers use `init|Sails \+ EJS|Sails lifted|CacheService\.getNgAppFileHash|RenderViewController\.render|`sails` capabilities|via shims|use the global service reference|CSRF globally in Sails config/, file);
  }
  const guide = read('packages/redbox-dev-tools/skills/redbox-angular-apps/SKILL.md');
  const ejs = sample(guide, 'page.bundleHash');
  const {pageLocals} = require('@researchdatabox/redbox-core/dist/pages/locals');
  temporary(dir => {
    const assets = path.join(dir, 'angular/my-app/browser');
    fs.mkdirSync(assets, {recursive: true});
    fs.writeFileSync(path.join(assets, 'main-abc123.js'), '// qualified bundle');
    const {PageArtifacts} = require('@researchdatabox/redbox-core/http/express');
    const artifacts = new PageArtifacts([dir], [dir]);
    const locals = pageLocals({root: '', origin: 'https://example.invalid', brand: {name: 'default'}, portal: 'rdmp',
      bundleHash: artifacts.bundleHash.bind(artifacts), t: key => key, param: () => undefined, hasRole: () => false,
      settings: {}, config: {}, typeface: null, faviconUrl: ''}, {});
    const result = require('ejs').render(ejs, locals);
    assert.match(result, /\/angular\/my-app\/browser\/main-abc123\.js/);
  });
});

test('dashboard upgrade uses offline preflight and explicit resolution data', () => {
  const guide = wiki('Configuring-Dashboard-Tables');
  assert.doesNotMatch(guide, /REDBOX_SKIP_MIGRATIONS|REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS/);
  const {previewDashboardMigration} = compileAndRun(sample(guide, 'export function previewDashboardMigration'));
  const result = previewDashboardMigration({recordTypes: [], dashboardTypes: [], overrides: null, views: {}});
  assert.ok(result.inputFingerprint);
  assert.deepEqual(result.findings, []);
  assert.match(guide, /dashboardMigrationResolutions/);
});

test('cache and bundled provider guides use neutral registration and owned lifecycle', () => {
  const cache = wiki('Cache-Persistence') + wiki('Cache-Persistence-Hook-Migration');
  const storage = read('packages/sails-hook-redbox-storage-mongo/README.md');
  const pdf = read('packages/sails-hook-redbox-pdfgen/README.md');
  assert.doesNotMatch(cache + storage + pdf, /preLiftSetup|through `registerRedboxServices`|consumes `registerRedboxServices|On Sails `lower`|global `IntegrationAuditService`|Node \*\*24\.16/);
  assert.match(storage, /registerRedboxExtension/);
  const storageExtension = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension').registerRedboxExtension();
  assert.equal(storageExtension.apiVersion, 1);
  assert.match(cache, /initialize/);
  assert.match(pdf, /quiesce/);
});

test('Figshare technical guide uses the concrete crosswalk binding input', async () => {
  const guide = wiki('Figshare-Service-Technical-Guide');
  assert.doesNotMatch(guide, /through the sails|_exportedMethods/);
  const {resolveExampleCrosswalk} = compileAndRun(sample(guide, 'export async function resolveExampleCrosswalk'));
  const result = await resolveExampleCrosswalk({resolveCrosswalkValues: async () => ({values: [7], normalizedCodes: ['a'], unresolvedCodes: [], historicalTargets: []})});
  assert.deepEqual(result.values, [7]);
});

test('the configuration conversion guide runs as documented CommonJS', () => {
  const guide = read('support/specs/sails-retirement/configuration-v6.md');
  let code = blocks(guide).find(b => b.code.includes('loadDeploymentConfiguration')).code;
  temporary(dir => {
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    for (const [name, data] of [['application.cjs', null],
      ['institution-production.mjs', {server: {port: 1701}}], ['local.cjs', {server: {port: 1702}}]]) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, data === null ? sample(guide, 'INSTITUTION_CORE_MONGO_URL')
        : `${name.endsWith('.mjs') ? 'export default' : 'module.exports ='} ${JSON.stringify(data)};`);
      code = code.replace(`/etc/redbox/${name}`, file).replace(`/run/redbox/${name}`, file);
    }
    const file = path.join(dir, 'load.cjs');
    fs.writeFileSync(file, code);
    const syntax = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    assert.equal(syntax.status, 0, syntax.stderr);
    const result = spawnSync(process.execPath, ['-e', "require('./load.cjs').loadInstitutionConfiguration().then(config => { if (config.server.port !== 1702) throw new Error('Incorrect selected-file precedence'); }).catch(error => { console.error(error); process.exitCode = 1; });"], {
      cwd: dir, encoding: 'utf8', env: {...process.env,
        INSTITUTION_CORE_MONGO_URL: 'mongodb://127.0.0.1:27017/doc-core',
        INSTITUTION_STORAGE_MONGO_URL: 'mongodb://127.0.0.1:27017/doc-storage',
        INSTITUTION_SESSION_MONGO_URL: 'mongodb://127.0.0.1:27017/doc-session',
        INSTITUTION_SESSION_SECRET: 'disposable-doc-test-session-secret-32'}, timeout: 30000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});
