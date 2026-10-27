import { nothingLogger } from '@researchdatabox/sails-ng-common';
import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { createQuestionTreeDiagram } from '../../src/visitor/visitor-helpers';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import { FigsharePublishing } from '../../src/configmodels/FigsharePublishing';
import { resolveFigsharePublishingConfigData } from '../../src/queries/FigshareStatus';
import { Services as Navigation } from '../../src/navigation/Navigation';
import { Services as Solr } from '../../src/queries/Solr';
import { Services as Dashboards } from '../../src/dashboards/DashboardTypes';
import { Services as WorkspaceTypes } from '../../src/workspaces/WorkspaceTypes';
import { convertLegacyDashboardConfiguration } from '../../src/dashboards/DashboardLegacyConversion';
import { getTargetSettings } from '../../src/configmodels/DashboardSettings';
import { Services as Storage } from '../../src/storage/StorageManager';
import { pdfgen } from '../../../sails-hook-redbox-pdfgen/src/config/pdfgen';
import { createSinonStubLogger } from '../logger.test';
import * as sinon from 'sinon';

const load = (config: Record<string, unknown>) =>
  loadPortalConfiguration({
    env: { REDBOX_SESSION_SECRET: 'validation-defaults-disposable-session-secret' },
    extensions: { providers: [{ name: 'institution', root: '.', declaration: { apiVersion: 1, config } }] },
  });
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('runtime-supplied startup defaults', () => {
  it('accepts the S3 region provider chain through the actual disk driver', async () => {
    const previous = process.env.AWS_REGION;
    process.env.AWS_REGION = 'ap-southeast-2';
    try {
      for (const region of [undefined, 'us-west-2']) {
        const config = await load({
          storage: {
            primaryDisk: 'objects',
            stagingDisk: 'objects',
            disks: {
              objects: {
                driver: 's3',
                config: { bucket: 'fixture-bucket', ...(region === undefined ? {} : { region }) },
              },
            },
          },
        });
        const service = new Storage.StorageManager({ config: config.storage, log: nothingLogger });
        await service.initialize();
        const disk = service.disk('objects');
        const driver = Reflect.get(disk, 'driver');
        const stop = new Error('stop before network');
        let selected: { config: { region(): Promise<string> }; destroy(): void } | undefined;
        driver.createHeadObjectCommand = (client: NonNullable<typeof selected>) => {
          selected = client;
          throw stop;
        };
        await assert.rejects(driver.exists('probe'), error => error === stop);
        assert(selected);
        assert.equal(await selected.config.region(), region || process.env.AWS_REGION);
        selected.destroy();
      }
      await assert.rejects(
        load({ storage: { disks: { objects: { driver: 's3', config: { bucket: 'fixture', region: '' } } } } }),
        /region/
      );
    } finally {
      if (previous === undefined) delete process.env.AWS_REGION;
      else process.env.AWS_REGION = previous;
    }
  });

  it('accepts Figshare model defaults without filling or mutating the supplied startup object', async () => {
    const disabled = await load({ brandingConfigurationDefaults: { figsharePublishing: { enabled: false } } });
    assert.deepEqual(disabled.brandingConfigurationDefaults.figsharePublishing, { enabled: false });
    assert.equal(
      resolveFigsharePublishingConfigData(disabled.brandingConfigurationDefaults, disabled.figshareDev, 'production'),
      null
    );
  });

  const defaults = json(new FigsharePublishing());
  const paths: string[][] = [];
  const collect = (value: object, prefix: string[] = []) => {
    for (const [key, child] of Object.entries(value)) {
      paths.push([...prefix, key]);
      if (child && typeof child === 'object' && !Array.isArray(child)) collect(child, [...prefix, key]);
    }
  };
  collect(defaults);
  for (const path of paths) {
    it(`accepts omitted Figshare ${path.join('.')} without mutating startup data`, async () => {
      const supplied = json(defaults);
      supplied.enabled = true;
      const parent = path.slice(0, -1).reduce((value, key) => Reflect.get(value, key), supplied);
      const key = path.at(-1);
      assert(key !== undefined);
      Reflect.deleteProperty(parent, key);
      const config = await load({ brandingConfigurationDefaults: { figsharePublishing: supplied } });
      assert.deepEqual(config.brandingConfigurationDefaults.figsharePublishing, supplied);
      const resolved = resolveFigsharePublishingConfigData(
        config.brandingConfigurationDefaults,
        config.figshareDev,
        'production',
        { requireToken: false }
      );
      if (path.join('.') === 'enabled') assert.equal(resolved, null);
      else {
        assert(resolved);
        const { runtime, ...actual } = resolved;
        assert.deepEqual(json(actual), { ...defaults, enabled: true }, path.join('.'));
      }
    });
  }

  it('rejects invalid Figshare model configuration', async () => {
    for (const publishing of [
      { enabled: true, connection: { timeoutMs: 'invalid' } },
      { enabled: true, metadata: { title: { kind: 'invalid' } } },
      { enabled: true, metadata: { title: { kind: 'crosswalk' } } },
      { enabled: true, metadata: { customFields: [{ figshareField: 'custom' }] } },
      { enabled: true, authors: { lookup: [{ matchBy: 'email' }] } },
    ])
      await assert.rejects(
        load({ brandingConfigurationDefaults: { figsharePublishing: publishing } }),
        /invalid domain data/
      );
  });

  it('accepts navigation IDs and display settings that the navigation consumer supplies or omits', async () => {
    const link = { labelKey: 'link', href: '/research' };
    const config = await load({
      brandingConfigurationDefaults: {
        menu: { items: [{ ...link, children: [link] }] },
        homePanels: { panels: [{ titleKey: 'panel', iconClass: 'fa fa-book', items: [link] }] },
        adminSidebar: { sections: [{ id: 'research', titleKey: 'section', items: [link] }], footerLinks: [link] },
      },
    });
    const navigation = new Navigation.Navigation({
      configuration: config.brandingConfigurationDefaults,
      context: { isAuthenticated: true, user: {}, brand: null, brandPortalPath: '/default/rdmp', currentPath: '/' },
      appmode: config.appmode,
      log: createSinonStubLogger(sinon),
      translate: key => key,
      hasRole: () => true,
    });
    const menuItem = (await navigation.resolveMenu()).items[0]?.children?.[0];
    assert(menuItem);
    assert.equal(menuItem.href, '/default/rdmp/research');
    assert.equal((await navigation.resolveHomePanels()).panels[0].columnClass, 'col-md-3 homepanel');
    const sidebar = await navigation.resolveAdminSidebar();
    assert.equal(sidebar.sections[0].defaultExpanded, true);
    assert.equal(sidebar.footerLinks[0].label, 'link');
    for (const settings of [
      { menu: { items: [{ href: '/' }] } },
      { homePanels: { panels: [{ titleKey: 'panel', iconClass: 'book', columnClass: 1, items: [link] }] } },
      { adminSidebar: { sections: [{ titleKey: 'section', items: [link] }] } },
    ])
      await assert.rejects(load({ brandingConfigurationDefaults: settings }), /invalid domain data/);
  });

  it('accepts omitted Solr schema lists and field-type flags in the real reconciliation consumer', async () => {
    for (const schema of [{}, { 'add-field': [{ name: 'institution', type: 'string' }] }]) {
      const config = await load({
        solr: { cores: { institution: { options: { host: 'solr', port: 8983, core: 'institution' }, schema } } },
      });
      const service = new Solr.SolrSearchService({
        config: config.solr,
        log: createSinonStubLogger(sinon),
        retainFollowup: work => work,
      });
      const missing = Reflect.get(service, 'getMissingSchemaDefinitions').call(
        service,
        'institution',
        config.solr.cores.institution,
        {}
      );
      assert.deepEqual(missing, {
        'add-field': schema['add-field'] || [],
        'add-dynamic-field': [],
        'add-copy-field': [],
      });
      assert.equal(
        Reflect.get(service, 'schemaFieldsMatch').call(
          service,
          { name: 'institution', type: 'string' },
          { name: 'institution', type: 'string', indexed: true, stored: true }
        ),
        true
      );
    }
    await assert.rejects(
      load({
        solr: {
          cores: { default: { schema: { 'add-field': [{ name: 'institution', type: 'string', indexed: 'false' }] } } },
        },
      }),
      /invalid domain data/
    );
  });

  it('accepts empty or omitted dashboard profile formatting before its normalizer supplies defaults', async () => {
    for (const declaration of [
      { description: 'Institution profile' },
      { formatRules: {} },
      { tableConfig: {} },
      { tableConfig: { noDataMsg: 'No institution records' } },
      { tableConfig: { rowConfig: [] } },
    ]) {
      const config = await load({ dashboardtype: { institution: declaration } });
      let stored:
        | { formatRules: unknown; tableConfig: { rowConfig: Array<{ variable: string }>; noDataMsg?: unknown } }
        | undefined;
      const service = new Dashboards.DashboardTypes({
        config,
        references: {
          dashboardTypes: {
            findByName: async () => null,
            createDefinition: async (value: NonNullable<typeof stored>) => {
              stored = value;
              return value;
            },
          },
        },
        log: createSinonStubLogger(sinon),
      } as unknown as ConstructorParameters<typeof Dashboards.DashboardTypes>[0]);
      await firstValueFrom(
        service.create(
          { id: 'brand', name: 'default' } as Parameters<Dashboards.DashboardTypes['create']>[0],
          'institution',
          config.dashboardtype.institution as unknown as Parameters<Dashboards.DashboardTypes['create']>[2]
        )
      );
      assert(stored);
      assert.deepEqual(stored.formatRules, {});
      if ('tableConfig' in declaration && declaration.tableConfig && 'rowConfig' in declaration.tableConfig)
        assert.deepEqual(stored.tableConfig.rowConfig, []);
      else assert.equal(stored.tableConfig.rowConfig[0]!.variable, 'metadata.title');
      if ('tableConfig' in declaration && declaration.tableConfig && 'noDataMsg' in declaration.tableConfig)
        assert.equal(stored.tableConfig.noDataMsg, declaration.tableConfig.noDataMsg);
    }
    await assert.rejects(
      load({ dashboardtype: { institution: { formatRules: { filterBy: { filterMode: 'invalid' } } } } }),
      /invalid domain data/
    );
  });

  it('accepts omitted workspace display fields that the service and UI treat as optional', async () => {
    const config = await load({
      workspacetype: { institution: { name: 'institution', label: 'Institution workspace' } },
    });
    let stored: Record<string, unknown> | undefined;
    const service = new WorkspaceTypes.WorkspaceTypes({
      config,
      log: createSinonStubLogger(sinon),
      bootstrapProviders: [],
      references: {
        workspaceTypes: {
          createDefinition: async (values: Record<string, unknown>) => {
            stored = values;
            return values;
          },
        },
      } as unknown as ConstructorParameters<typeof WorkspaceTypes.WorkspaceTypes>[0]['references'],
    });
    await firstValueFrom(service.create({ id: 'brand' }, config.workspacetype.institution));
    assert(stored);
    assert.equal(stored.name, 'institution');
    for (const key of ['subtitle', 'description', 'logo']) assert.equal(stored[key], undefined);
    await assert.rejects(
      load({ workspacetype: { institution: { name: 'institution', label: 'Workspace', logo: false } } }),
      /invalid domain data/
    );
  });

  it('accepts empty dashboard seed tables before the one-time converter supplies columns', async () => {
    const config = await load({
      dashboardtype: { institution: { tableConfig: {} } },
      workflow: {
        institution: {
          draft: {
            config: {
              workflow: { stage: 'draft', stageLabel: 'Draft' },
              form: 'institution',
              authorization: { viewRoles: [], editRoles: [] },
              dashboard: { table: {} },
            },
          },
        },
      },
      dashboardview: {
        institution: {
          name: 'institution',
          titleLabelKey: 'Institution',
          dashboardType: 'institution',
          sourceRecordType: 'institution',
          steps: [
            { name: 'seeded', sourceRecordType: 'institution', fetchMode: 'allForRecordType', dashboardTable: {} },
            { name: 'defaulted', sourceRecordType: 'institution', fetchMode: 'allForRecordType' },
          ],
        },
      },
    });
    const converted = convertLegacyDashboardConfiguration({
      recordTypes: [
        {
          name: 'institution',
          steps: [{ name: 'draft', table: config.workflow.institution.draft.config.dashboard!.table }],
        },
      ],
      dashboardTypes: [{ name: 'institution', ...config.dashboardtype.institution }],
      views: config.dashboardview,
      overrides: null,
    });
    for (const target of [
      { kind: 'workflow', recordType: 'institution', stage: 'draft' },
      { kind: 'view', view: 'institution', step: 'seeded' },
      { kind: 'view', view: 'institution', step: 'defaulted' },
    ] as const) {
      const settings = getTargetSettings(converted.data, target);
      assert(settings);
      assert.equal(settings.tableConfig.rowConfig[0]?.variable, 'metadata.title');
    }
    await assert.rejects(
      load({ dashboardtype: { institution: { tableConfig: { rowConfig: false } } } }),
      /invalid domain data/
    );
  });

  it('accepts the same job names in arrays as in named maps', async () => {
    for (const name of ['institution.sync', 'institution:sync', 'institution sync']) {
      const job = { fnName: 'institution.sync' };
      const mapped = await load({ agendaQueue: { jobs: { [name]: job } } });
      const listed = await load({ agendaQueue: { jobs: [{ name, ...job }] } });
      assert.deepEqual(listed.agendaQueue.jobs[name], mapped.agendaQueue.jobs[name]);
    }
    for (const name of ['', '__proto__', 'constructor', 'prototype'])
      await assert.rejects(
        load({ agendaQueue: { jobs: [{ name, fnName: 'institution.sync' }] } }),
        /job name|unsafe configuration key/
      );
  });

  it('accepts reusable form configuration supplied by component constructors', async () => {
    const components = [
      ['TextAreaComponent', { rows: 2, cols: 20 }],
      ['GroupComponent', { componentDefinitions: [] }],
      ['TabComponent', { tabs: [] }],
      ['TabContentComponent', { componentDefinitions: [] }],
      ['AccordionComponent', { panels: [] }],
      ['AccordionPanelComponent', { componentDefinitions: [] }],
      ['QuestionTreeComponent', { questions: [], availableOutcomes: [] }],
    ] as const;
    for (const [className, expected] of components) {
      const definition = { name: 'institution', component: { class: className, config: {} } };
      const config = await load({ reusableFormDefinitions: { institution: [definition] } });
      const constructed = await new ConstructFormConfigVisitor(createSinonStubLogger(sinon)).start({
        data: { name: 'institution', componentDefinitions: config.reusableFormDefinitions.institution },
        formMode: 'edit',
      });
      const actual = constructed.componentDefinitions[0]?.component.config;
      assert(actual);
      for (const [key, value] of Object.entries(expected))
        assert.deepEqual(Reflect.get(actual, key), value, className + '.' + key);
    }
    assert.match(await createQuestionTreeDiagram({}, createSinonStubLogger(sinon)), /flowchart/);
    const config = await load({
      reusableFormDefinitions: {
        source: [{ name: 'title', component: { class: 'SimpleInputComponent' } }],
        institution: [
          {
            name: 'reuse',
            component: { class: 'ReusableComponent', config: {} },
            overrides: { reusableFormName: 'source' },
          },
        ],
      },
    });
    const expanded = await new ConstructFormConfigVisitor(createSinonStubLogger(sinon)).start({
      data: { name: 'institution', componentDefinitions: config.reusableFormDefinitions.institution },
      reusableFormDefs: config.reusableFormDefinitions,
      formMode: 'edit',
    });
    assert.equal(expanded.componentDefinitions[0].component.class, 'SimpleInputComponent');
    await assert.rejects(
      load({
        reusableFormDefinitions: {
          institution: [{ name: 'notes', component: { class: 'TextAreaComponent', config: { rows: 'bad' } } }],
        },
      }),
      /invalid domain data/
    );
  });

  it('accepts an empty PDF filename prefix without coercion', async () => {
    const config = await load({ pdfgen: { ...pdfgen, pdfPrefix: '' } });
    assert.equal(config.pdfgen.pdfPrefix, '');
    await assert.rejects(load({ pdfgen: { ...pdfgen, pdfPrefix: false } }), /pdfPrefix/);
  });

  it('accepts native Puppeteer paper names and numeric pixel dimensions without coercion', async () => {
    for (const options of [
      { format: 'a4' },
      { format: 'LETTER' },
      { format: 'legal' },
      { width: 960, height: 480, margin: { top: 96, right: 0, bottom: '1cm', left: '1in' } },
    ]) {
      const config = await load({ pdfgen: { ...pdfgen, PDFOptions: options } });
      assert(config.pdfgen);
      assert.deepEqual(config.pdfgen.PDFOptions, options);
    }
    const zeroTimeout = await load({ pdfgen: { ...pdfgen, readinessTimeout: 0 } });
    assert.equal(zeroTimeout.pdfgen.readinessTimeout, 0);
    await assert.rejects(load({ pdfgen: { ...pdfgen, readinessTimeout: -1 } }), /readinessTimeout/);
    for (const PDFOptions of [{ format: 'not-paper' }, { width: {} }, { margin: { top: false } }])
      await assert.rejects(load({ pdfgen: { ...pdfgen, PDFOptions } }), /PDFOptions/);
  });
});
