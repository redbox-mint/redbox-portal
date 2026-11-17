import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'ejs';
import sinon from 'sinon';
import { createTransport } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  nothingLogger,
  FormConfig,
  CheckboxTreeFormComponentDefinition,
  CheckboxTreeFieldComponentDefinition,
  CheckboxTreeFieldComponentConfig,
  CheckboxTreeFieldModelDefinition,
  CheckboxTreeFieldModelConfig,
} from '@researchdatabox/sails-ng-common';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import { clientConfiguration } from '../../src/pages/clientConfiguration';
import { Services as Prehydrate } from '../../src/forms/FormPayloadPrehydrate';
import { Services as Sanitizer } from '../../src/forms/DomSanitizer';
import { Services as Navigation } from '../../src/navigation/Navigation';
import { Services as Email } from '../../src/integrations/Email';

import { nativeBindingFixture } from '../application/nativeBindingFixture';
import { sourcePortal } from '../application/sourcePortal';
import * as configuration from '../../src/configuration/portal';

const env = { REDBOX_SESSION_SECRET: 'configuration-acceptance-synthetic-secret' };
const load = (config: Record<string, unknown> = {}) =>
  loadPortalConfiguration({
    env,
    extensions: { providers: [{ name: 'baseline-data', declaration: { config } }] },
  });

// Capture the concrete controller inputs bound by the executable's API2 installation.
async function productionInputs(config: Awaited<ReturnType<typeof load>>) {
  const sandbox = sinon.createSandbox();
  // Configuration resolution is exercised above; bind its exact resolved result.
  sandbox.stub(configuration, 'loadPortalConfiguration').resolves(config);
  let selected: Awaited<ReturnType<typeof nativeBindingFixture>> | undefined;
  let host: Awaited<ReturnType<typeof sourcePortal.createHost>> | undefined;
  try {
    selected = await nativeBindingFixture();
    const portal = selected.portal;
    host = await sourcePortal.createHost(portal);
    assert.equal(host.host.constructor.name, 'FastifyHost');
    sandbox.stub(portal.data.reference.vocabulary, 'get').returns({} as never);
    const input = (name: string) => {
      const binding = portal.installation.bindings.find(item => item.factory.name === name);
      assert(binding, name);
      return Reflect.get(binding(), 'input');
    };
    return {
      delivery: (() => { const value = input('RecordController'); return { delivery: { prehydrate: value.delivery.prehydrate } }; })(),
      record: input('webservice/RecordController'),
      mutation: input('webservice/RecordController'),
    };
  } finally {
    sandbox.restore();
    await host?.host.stop();
    await selected?.close();
  }
}

describe('baseline configuration acceptance and production consumers', function () {
  this.timeout(30000);
  for (const rootContext of ['', '/research'])
    it(`binds the canonical creation Location base (${rootContext || 'root'})`, async () => {
      const publicUrl = 'https://public.example.edu' + rootContext;
      const { mutation } = await productionInputs(await load({ server: { publicUrl, rootContext } }));
      assert.equal(mutation.publicUrl, publicUrl);
    });
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
    const formConfig = Object.assign(new FormConfig(), {
      name: 'test',
      componentDefinitions: [
        Object.assign(new CheckboxTreeFormComponentDefinition(), {
          name: 'tree',
          component: Object.assign(new CheckboxTreeFieldComponentDefinition(), {
            config: Object.assign(new CheckboxTreeFieldComponentConfig(), { vocabRef: 'anzsrc' }),
          }),
          model: Object.assign(new CheckboxTreeFieldModelDefinition(), {
            config: Object.assign(new CheckboxTreeFieldModelConfig(), {
              value: [{ notation: '01' }, { notation: '02' }],
            }),
          }),
        }),
      ],
    });
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
    const serverOptions = config.emailnotification.settings.serverOptions;
    assert(typeof serverOptions !== 'string');
    assert.equal(serverOptions.jsonTransport, true);
  });

  for (const [url, port, secure] of [
    ['smtp://mail.example.invalid:2525?secure=false', 2525, false],
    ['smtps://mail.example.invalid:465', 465, true],
  ] as const) {
    it(`retains native email URL transport ${url.split(':')[0]}`, async () => {
      const config = await load({ emailnotification: { settings: { serverOptions: url } } });
      const serverOptions = config.emailnotification.settings.serverOptions;
      assert.equal(serverOptions, url);
      assert(typeof serverOptions === 'string');
      const transport = createTransport(serverOptions);
      try {
        const nativeTransport = transport.transporter;
        assert(nativeTransport instanceof SMTPTransport);
        const nativeOptions = nativeTransport.options;
        assert.equal(nativeOptions.host, 'mail.example.invalid');
        assert.equal(nativeOptions.port, port);
        assert.equal(nativeOptions.secure, secure);
      } finally {
        transport.close();
      }
    });
  }

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
