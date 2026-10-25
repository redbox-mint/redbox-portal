import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'ejs';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import { PortalHttp } from '../../src/application/portal/http';
import { clientConfiguration } from '../../src/pages/clientConfiguration';
import { Services as Prehydrate } from '../../src/forms/FormPayloadPrehydrate';
import { Services as Sanitizer } from '../../src/forms/DomSanitizer';
import { Services as Navigation } from '../../src/navigation/Navigation';
import { Services as Email } from '../../src/integrations/Email';
import * as identities from '../../src/persistence/identity/runtime';
import * as branding from '../../src/persistence/branding/runtime';
import * as siem from '../../src/persistence/siem/runtime';
import * as middleware from '../../src/http/express/middleware';
import * as formDelivery from '../../src/http/express/formDelivery';
import * as reads from '../../src/http/express/recordReads';

const env = { REDBOX_SESSION_SECRET: 'configuration-acceptance-synthetic-secret' };
const load = (config: Record<string, unknown> = {}) =>
  loadPortalConfiguration({
    env,
    extensions: { providers: [{ name: 'baseline-data', root: '.', declaration: { apiVersion: 1, config } }] },
  });

// Capture actual production inputs after startup resolution. Route behavior is covered
// separately; these tests guard the composition seam that isolated domain tests miss.
async function productionInputs(config: Awaited<ReturnType<typeof load>>) {
  const sandbox = sinon.createSandbox();
  const stop = new Error('record input captured');
  let delivery!: formDelivery.FormDeliveryHttpInput;
  let record!: reads.RecordReadHttpInput;
  sandbox.stub(identities, 'getIdentityRepositories').returns({} as never);
  sandbox.stub(branding, 'getBrandingRepository').returns({} as never);
  sandbox.stub(siem, 'getSiemRepository').returns({} as never);
  sandbox.stub(middleware, 'prepareHttpMiddleware').resolves({ authenticate: async () => false } as never);
  for (const file of [
    'csrf',
    'login',
    'pages',
    'recordTypes',
    'metadata',
    'configuration',
    'configurationWrites',
    'queryReads',
  ]) {
    const module = require('../../src/http/express/' + file);
    for (const name of Object.keys(module).filter(name => name.startsWith('mount')))
      sandbox.stub(module, name).returns(undefined);
  }
  sandbox.stub(formDelivery, 'mountFormDeliveryRoutes').callsFake((_router, input) => {
    delivery = input;
  });
  sandbox.stub(reads, 'mountRecordReadRoutes').callsFake((_router, input) => {
    record = input;
    throw stop;
  });
  const brand = { id: 'brand', name: 'default' };
  const service = { getDefault: () => brand, getAppConfigurationForBrand: () => ({ auth: {} }) };
  const refs = new Proxy({}, { get: () => ({ get: () => service }) });
  const portal = {
    config,
    owner: {},
    log: nothingLogger,
    data: {
      reference: refs,
      records: { get: () => ({}) },
      storage: () => ({}),
      search: { get: () => ({}) },
      accounts: { get: () => ({}) },
      harvest: { get: () => ({}) },
    },
    providers: { audits: { get: () => ({}) } },
    models: {},
    prepareExtensions: async () => {},
  };
  try {
    const host = new PortalHttp(portal as never, { appPath: '.' });
    await assert.rejects(host.prepare(express.Router(), createServer()), error => error === stop);
    return { delivery, record };
  } finally {
    sandbox.restore();
  }
}

describe('baseline configuration acceptance and production consumers', () => {
  it('uses the independent API limit, including its baseline default of 20', async () => {
    for (const limit of [undefined, 7]) {
      const config = await load(limit === undefined ? {} : { api: { max_requests: limit } });
      const { record } = await productionInputs(config);
      assert.equal(record.maxRows, limit ?? 20);
      assert.equal(record.maxSearchRows, 1_000_000);
      assert.equal(config.record.search.maxRecordsPerPage, 1_000_000);
    }
  });

  it('passes enabled and selection limits into production form prehydration', async () => {
    const formConfig = {
      name: 'test',
      accept: async () => {},
      componentDefinitions: [
        {
          name: 'tree',
          component: { class: 'CheckboxTreeComponent', config: { vocabRef: 'anzsrc' } },
          model: { config: { value: [{ notation: '01' }, { notation: '02' }] } },
        },
      ],
    };
    for (const enabled of [true, false]) {
      const config = await load({ form: { prehydrate: { enabled, maxVocabSelections: 1 } } });
      const { delivery } = await productionInputs(config);
      const prehydrate = delivery.delivery.prehydrate;
      assert(prehydrate instanceof Prehydrate.FormPayloadPrehydrateService);
      assert.equal(prehydrate.extractTargets(formConfig).at(0)?.selectedValues.length, 1);
      if (!enabled)
        assert.equal(await delivery.delivery.prehydrate.build({ branding: 'default', formConfig }), undefined);
    }
  });

  it('merges explicitly public client overrides last and excludes general server secrets', async () => {
    const config = await load({
      api: {
        additionalClientConfig: {
          maxSearchRowsPerPage: 17,
          institution: { enabled: true },
          i18NextOpts: { debug: false },
        },
      },
      redbox: { apiKey: 'private-record-api-key' },
      brandingConfigurationDefaults: { auth: { local: { default: { adminPw: 'private-admin-password' } } } },
    });
    const publicConfig = clientConfiguration(
      { ...config, appUrl: 'https://example.invalid' },
      'institution',
      'rdmp',
      'en'
    );
    assert.equal(publicConfig.maxSearchRowsPerPage, 17);
    assert.deepEqual(Reflect.get(publicConfig, 'institution'), { enabled: true });
    assert.equal(publicConfig.i18NextOpts.debug, false);
    assert.equal('backend' in publicConfig.i18NextOpts, false);
    assert.equal('redboxSession' in publicConfig, false);
    assert.equal('brandingConfigurationDefaults' in publicConfig, false);
    assert.doesNotMatch(
      JSON.stringify(publicConfig),
      /configuration-acceptance-synthetic-secret|private-record-api-key|private-admin-password/
    );
  });

  it('applies a configured SVG byte limit before sanitization', async () => {
    const config = await load({ record: { form: { svgMaxBytes: 32 } } });
    const sanitizer = new Sanitizer.DomSanitizer({ config, log: nothingLogger });
    try {
      assert(sanitizer.sanitize('<svg>' + ' '.repeat(33) + '</svg>').errors.includes('too-large'));
    } finally {
      await sanitizer.close();
    }
  });

  it('retains institution feature flags used by navigation', async () => {
    for (const workspaces of [true, false]) {
      const config = await load({ appmode: { institution: { workspaces } } });
      const nav = new Navigation.Navigation({
        appmode: config.appmode,
        log: nothingLogger,
        context: {
          isAuthenticated: false,
          user: null,
          brand: null,
          brandPortalPath: '/default/rdmp',
          currentPath: '/',
        },
        configuration: {
          menu: {
            items: [
              {
                labelKey: 'workspaces',
                href: '/workspaces',
                requiresAuth: false,
                featureFlag: 'institution.workspaces',
              },
            ],
            showSearch: false,
          },
        },
        translate: key => key,
        hasRole: () => false,
      });
      assert.equal((await nav.resolveMenu()).items.length, workspaces ? 1 : 0);
    }
  });

  it('accepts native Mongo index declarations', async () => {
    const config = await load({
      storage: {
        mongodb: {
          indices: [{ key: { 'metadata.title': 'text' }, name: 'institution-title', sparse: true }],
          deletedRecordIndices: [],
          recordIdentityIndices: [{ key: { redboxOid: 1 }, unique: true }],
        },
      },
    });
    assert.equal(config.storage.mongodb?.indices?.[0].name, 'institution-title');
  });

  it('accepts uppercase API methods used by baseline fixtures', async () => {
    const config = await load({ record: { api: { search: { method: 'GET' } } } });
    assert.equal(config.record.api.search.method, 'GET');
  });

  it('accepts native Mongo session serialization settings', async () => {
    const config = await load({ redboxSession: { stringify: false } });
    assert.equal(config.redboxSession.stringify, false);
  });

  it('accepts sparse email templates and native transport data without changing fallback behavior', async () => {
    const config = await load({
      emailnotification: {
        templates: { institution: { subject: 'Institution subject' } },
        settings: { serverOptions: { jsonTransport: true } },
        defaults: { cc: 'copy@example.invalid', otherSendOptions: { replyTo: 'reply@example.invalid' } },
      },
    });
    const email = new Email.Email({
      config: config.emailnotification,
      log: nothingLogger,
      templateContext: {},
      resolveHook: () => () => {},
      retainFollowup: () => {},
    });
    const properties = email.evaluateProperties({ template: 'institution' });
    assert.equal(properties.subject, 'Institution subject');
    assert.equal(properties.cc, 'copy@example.invalid');
    assert.equal(config.emailnotification.settings.serverOptions.jsonTransport, true);
  });

  it('retains the Angular development bundle switch used by workspace pages', async () => {
    const source = readFileSync(resolve('../../views/default/default/listWorkspaces.ejs'), 'utf8');
    for (const angularDev of [true, false]) {
      const config = await load({ angularDev });
      const html = render(source, {
        page: { config, typeface: null, root: '', t: (key: string) => key },
        data: { branding: 'default', portal: 'rdmp' },
      });
      assert.equal(html.includes('vendor.bundle.js'), angularDev);
      assert.equal(html.includes('styles.bundle.js'), angularDev);
      assert.equal(html.includes('styles.bundle.css'), !angularDev);
    }
  });

  it('keeps named OIDC identifiers as unrestricted configured strings', async () => {
    for (const identifier of ['research.local', 'urn:institution:oidc', 'Université']) {
      const config = await load({ brandingConfigurationDefaults: { auth: { oidc: { identifier } } } });
      const oidc = config.brandingConfigurationDefaults.auth.oidc;
      assert(oidc && !Array.isArray(oidc));
      assert.equal(oidc.identifier, identifier);
    }
  });
});
