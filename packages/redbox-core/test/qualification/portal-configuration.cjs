const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadPortalConfiguration } = require('../../dist/configuration/portal');
const { dompurify } = require('../../dist/config/dompurify.config');
const { Services } = require('../../dist/forms/DomSanitizer');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { resolveCompanionConfiguration } = require('../../dist/config/companionDefaults');

const env = { REDBOX_SESSION_SECRET: 'synthetic-qualification-session-secret-at-least-32' };

test('explicit Companion environment conversion retains enabled-provider and warning behavior', () => {
  const warnings = [];
  assert.equal(resolveCompanionConfiguration().enabled, false);
  assert.equal(
    resolveCompanionConfiguration({ UPPY_COMPANION_ENABLED: 'true' }, message => warnings.push(message)).enabled,
    false
  );
  assert.equal(warnings.length, 1);
  const source = Object.freeze({
    UPPY_COMPANION_ENABLED: 'true',
    UPPY_GOOGLE_KEY: 'synthetic-key',
    UPPY_GOOGLE_SECRET: 'synthetic-secret',
    UPPY_COMPANION_SECRET: 'synthetic-companion-secret',
    UPPY_COMPANION_UPLOAD_URLS: ' https://example.invalid/upload, ',
  });
  const config = resolveCompanionConfiguration(source, message => warnings.push(message));
  assert.equal(config.enabled, true);
  assert.equal(config.attachmentSecret, source.UPPY_COMPANION_SECRET);
  assert.deepEqual(config.uploadUrls, ['https://example.invalid/upload']);
  assert.equal(warnings.length, 1);
});

test('portal configuration requires a complete explicit session secret before acquisition', async () => {
  assert.equal(global.sails, undefined);
  await assert.rejects(loadPortalConfiguration(), /redboxSession.secret/);
  await assert.rejects(loadPortalConfiguration({ env: { REDBOX_SESSION_SECRET: 'short' } }), /redboxSession.secret/);
  const config = await loadPortalConfiguration({ env });
  assert.equal(config.appmode.bootstrapAlways, false);
  assert.equal(config.redboxSession.secret, env.REDBOX_SESSION_SECRET);
  assert.equal(config.auth.roles.length, 4);
  assert.equal(Object.keys(config.agendaQueue.jobs).length, 16);
  assert(Object.isFrozen(config.record.attachments));
  assert(Object.isFrozen(config.brandingConfigurationDefaults.oniPublishing));
  assert.equal(Object.getPrototypeOf(config.brandingConfigurationDefaults.oniPublishing), Object.prototype);
  assert.equal(typeof config.dompurify.profiles.html.ALLOWED_URI_REGEXP.source, 'string');
});

test('portal files and extension data obey precedence without mutating their declarations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sr-p7-portal-config-'));
  try {
    const application = join(directory, 'application.mjs');
    const environment = join(directory, 'environment.cjs');
    const local = join(directory, 'local.mjs');
    await writeFile(
      application,
      'await Promise.resolve(); export default { server: { port: 1521 }, record: { export: { maxRecords: 11 } } };'
    );
    await writeFile(environment, 'module.exports = { server: { port: 1522 } };');
    await writeFile(local, 'export default { server: { port: 1523 } };');
    const contribution = Object.freeze({ record: Object.freeze({ export: Object.freeze({ maxRecords: 10 }) }) });
    const extensions = {
      providers: [
        {
          name: 'configuration-probe',
          root: directory,
          declaration: { apiVersion: 1, config: contribution, jobs: { extra: { fnName: 'extra.run' } } },
        },
      ],
    };
    const config = await loadPortalConfiguration({
      extensions,
      files: { application, environment, local },
      env: { ...env, REDBOX_PORT: '1524' },
      argv: ['--port=1525'],
    });
    assert.equal(config.server.port, 1525);
    assert.equal(config.record.export.maxRecords, 11);
    assert.equal(config.agendaQueue.jobs.extra.fnName, 'extra.run');
    assert.equal(Object.keys(config.agendaQueue.jobs).length, 17);
    assert.equal(contribution.record.export.maxRecords, 10);
    assert(!Object.isFrozen(extensions));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('portal rejects invalid pipeline data, URI rules, legacy lifecycle and undeclared executable values', async () => {
  for (const config of [
    { record: { export: { maxRecords: 'untrusted-secret-value' } } },
    { dompurify: { profiles: { html: { ALLOWED_URI_REGEXP: { source: '[', flags: 'i' } } } } },
    { dompurify: { profiles: { html: { ALLOWED_URI_REGEXP: { source: 'a', flags: 'g' } } } } },
    { routes: { '/': '/default/rdmp/home' } },
    { bootstrap: { bootstrap: () => {} } },
    { recordtype: { example: { execute: () => {} } } },
    { brandingConfigurationDefaults: { arbitrary: new Date() } },
  ]) {
    await assert.rejects(
      loadPortalConfiguration({
        env,
        extensions: { providers: [{ name: 'invalid-probe', root: __dirname, declaration: { apiVersion: 1, config } }] },
      }),
      error => {
        assert.equal(error.name, 'ConfigurationError');
        assert(!error.message.includes('untrusted-secret-value'));
        return true;
      }
    );
  }
  await assert.rejects(
    loadPortalConfiguration({ env: { ...env, REDBOX_UNREGISTERED: 'private-value' } }),
    /unsupported input/
  );
});

test('data URI rules preserve real DOMPurify behavior with immutable startup configuration', async () => {
  const config = await loadPortalConfiguration({ env });
  const current = new Services.DomSanitizer({ config: { dompurify }, log });
  const owned = new Services.DomSanitizer({ config, log });
  try {
    const samples = [
      '<a href="javascript:alert(1)">unsafe</a><a href="https://example.invalid/path" target="_blank">safe</a>',
      '<svg><path d="M0 0 L10 10"/><use href="#local"/><script>alert(1)</script></svg>',
      '<p onclick="alert(1)">text <strong>bold</strong></p>',
    ];
    for (const profile of ['html', 'minimal', 'svg'])
      for (const sample of samples)
        assert.equal(owned.sanitizeWithProfile(sample, profile), current.sanitizeWithProfile(sample, profile));
    assert(!owned.sanitizeWithProfile(samples[0], 'html').includes('javascript:'));
    assert.equal(typeof config.dompurify.profiles.html.ALLOWED_URI_REGEXP.source, 'string');
  } finally {
    await current.close();
    await owned.close();
  }
});

test('all bundled registrations supply neutral page, storage, PDF and real form/type data', async () => {
  const { registerRedboxExtension } = require('redbox-hook-dev/extension');
  const declaration = registerRedboxExtension();
  const storage = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension').registerRedboxExtension();
  const pdf = require('../../../sails-hook-redbox-pdfgen/dist/extension').registerRedboxExtension();
  assert.equal(declaration.config.routes, undefined);
  assert.equal(declaration.config.views, undefined);
  assert.equal(declaration.config.page.landingPath, '/default/rdmp/home');
  assert(declaration.config.page.noCache.includes('/default/rdmp/home'));
  const config = await loadPortalConfiguration({
    env,
    extensions: {
      providers: [
        { name: 'redbox-hook-dev', root: __dirname, declaration },
        { name: 'storage', root: __dirname, declaration: storage },
        { name: 'pdf', root: __dirname, declaration: pdf },
      ],
    },
  });
  assert(config.recordtype.dataRecord);
  assert(config.recordtype.dataPublication);
  assert(Object.keys(declaration.forms).length >= 20);
  assert(Object.keys(config.workflow).length > 0);
  assert.equal(config.storage.serviceName, storage.config.storage.serviceName);
  assert.equal(config.pdfgen.readinessStrategy, pdf.config.pdfgen.readinessStrategy);
  assert.equal(config.agendaQueue.jobs['PDFService-CreatePDF'].fnName, pdf.jobs['PDFService-CreatePDF'].fnName);
  assert(Object.isFrozen(config.pdfgen.PDFOptions));
  await assert.rejects(
    loadPortalConfiguration({
      env,
      extensions: {
        providers: [
          {
            name: 'invalid-pdf',
            root: __dirname,
            declaration: { apiVersion: 1, config: { pdfgen: { ...pdf.config.pdfgen, maxRetries: -1 } } },
          },
        ],
      },
    }),
    /pdfgen.maxRetries/
  );
});

test('offline defaults ignore legacy process settings and exclude legacy logger/host imports', () => {
  const script = `const {loadPortalConfiguration}=require(${JSON.stringify(require.resolve('../../dist/configuration/portal'))}); loadPortalConfiguration({env:${JSON.stringify(env)}}).then(c=>{if(c.agendaQueue.options.backend!=='mongodb'||c.companion.enabled!==false)process.exitCode=1},()=>{process.exitCode=1});`;
  const result = spawnSync(process.execPath, ['--eval', script], {
    env: { ...process.env, sails__agendaQueue_options_backend: 'unsupported-probe', UPPY_COMPANION_ENABLED: 'true' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.deepEqual(
    Object.keys(require.cache).filter(file =>
      /[/\\](compat[/\\]sails|CoreService\.js|CoreBase\.js|log\.config\.js|agendaQueue\.config\.js|companion\.config\.js|node_modules[/\\]sails[/\\])/.test(
        file
      )
    ),
    []
  );
});
