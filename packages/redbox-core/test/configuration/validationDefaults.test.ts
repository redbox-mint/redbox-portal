import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import { FigsharePublishing } from '../../src/configmodels/FigsharePublishing';
import { resolveFigsharePublishingConfigData } from '../../src/queries/FigshareStatus';
import { Services as Navigation } from '../../src/navigation/Navigation';
import { Services as Solr } from '../../src/queries/Solr';
import { Services as Dashboards } from '../../src/dashboards/DashboardTypes';
import { Services as Storage } from '../../src/storage/StorageManager';
import { pdfgen } from '../../../sails-hook-redbox-pdfgen/src/config/pdfgen';
import { createSinonStubLogger } from '../logger.test';
import * as sinon from 'sinon';

const load = (config: Record<string, unknown>) =>
  loadPortalConfiguration({
    env: { REDBOX_SESSION_SECRET: 'validation-defaults-disposable-session-secret' },
    extensions: { providers: [{ name: 'institution', declaration: { apiVersion: 1, config } }] },
  });
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('runtime-supplied startup defaults', () => {
  it('accepts the S3 region provider chain through the actual disk driver', async () => {
    const previous = process.env.AWS_REGION;
    process.env.AWS_REGION = 'ap-southeast-2';
    try {
      for (const region of [undefined, '', 'us-west-2']) {
        const config = await load({
          storage: {
            primaryDisk: 'objects',
            stagingDisk: 'objects',
            disks: { objects: { driver: 's3', config: { bucket: 'fixture-bucket', ...(region === undefined ? {} : { region }) } } },
          },
        });
        const service = new Storage.StorageManager({ config: config.storage, log: { verbose() {} } });
        await service.initialize();
        const disk = service.disk('objects');
        const driver = Reflect.get(disk, 'driver');
        const stop = new Error('stop before network');
        let selected;
        driver.createHeadObjectCommand = client => { selected = client; throw stop; };
        await assert.rejects(driver.exists('probe'), error => error === stop);
        assert.equal(await selected.config.region(), region || process.env.AWS_REGION);
        selected.destroy();
        await service.close();
      }
      await assert.rejects(load({ storage: { disks: { objects: { driver: 's3', config: { bucket: 'fixture', region: 123 } } } } }), /region/);
    } finally {
      if (previous === undefined) delete process.env.AWS_REGION;
      else process.env.AWS_REGION = previous;
    }
  });

  it('accepts Figshare model defaults without filling or mutating the supplied startup object', async () => {
    const disabled = await load({ brandingConfigurationDefaults: { figsharePublishing: { enabled: false } } });
    assert.deepEqual(disabled.brandingConfigurationDefaults.figsharePublishing, { enabled: false });
    assert.equal(resolveFigsharePublishingConfigData(disabled.brandingConfigurationDefaults, disabled.figshareDev, 'production'), null);
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
      const supplied = json(defaults);
      supplied.enabled = true;
      const parent = path.slice(0, -1).reduce((value, key) => Reflect.get(value, key), supplied);
      Reflect.deleteProperty(parent, path.at(-1));
      const config = await load({ brandingConfigurationDefaults: { figsharePublishing: supplied } });
      assert.deepEqual(config.brandingConfigurationDefaults.figsharePublishing, supplied);
      const resolved = resolveFigsharePublishingConfigData(config.brandingConfigurationDefaults, config.figshareDev, 'production', { requireToken: false });
      if (path.join('.') === 'enabled') assert.equal(resolved, null);
      else {
        const { runtime, ...actual } = resolved;
        assert.deepEqual(json(actual), { ...defaults, enabled: true }, path.join('.'));
      }
    }
    for (const publishing of [
      { enabled: true, connection: { timeoutMs: 'invalid' } },
      { enabled: true, metadata: { title: { kind: 'invalid' } } },
      { enabled: true, metadata: { title: { kind: 'crosswalk' } } },
      { enabled: true, metadata: { customFields: [{ figshareField: 'custom' }] } },
      { enabled: true, authors: { lookup: [{ matchBy: 'email' }] } },
    ]) await assert.rejects(load({ brandingConfigurationDefaults: { figsharePublishing: publishing } }), /invalid domain data/);
  });

  it('accepts navigation IDs and display settings that the navigation consumer supplies or omits', async () => {
    const link = { labelKey: 'link', href: '/research' };
    const config = await load({ brandingConfigurationDefaults: {
      menu: { items: [{ ...link, children: [link] }] },
      homePanels: { panels: [{ titleKey: 'panel', iconClass: 'fa fa-book', items: [link] }] },
      adminSidebar: { sections: [{ id: 'research', titleKey: 'section', items: [link] }], footerLinks: [link] },
    } });
    const navigation = new Navigation.Navigation({
      configuration: config.brandingConfigurationDefaults,
      context: { isAuthenticated: true, user: {}, brand: null, brandPortalPath: '/default/rdmp', currentPath: '/' },
      appmode: config.appmode, log: createSinonStubLogger(sinon), translate: key => key, hasRole: () => true,
    });
    assert.equal((await navigation.resolveMenu()).items[0].children[0].href, '/default/rdmp/research');
    assert.equal((await navigation.resolveHomePanels()).panels[0].columnClass, 'col-md-3 homepanel');
    const sidebar = await navigation.resolveAdminSidebar();
    assert.equal(sidebar.sections[0].defaultExpanded, true);
    assert.equal(sidebar.footerLinks[0].label, 'link');
    for (const settings of [
      { menu: { items: [{ href: '/' }] } },
      { homePanels: { panels: [{ titleKey: 'panel', iconClass: 'book', columnClass: 1, items: [link] }] } },
      { adminSidebar: { sections: [{ titleKey: 'section', items: [link] }] } },
    ]) await assert.rejects(load({ brandingConfigurationDefaults: settings }), /invalid domain data/);
  });

  it('accepts omitted Solr schema lists and field-type flags in the real reconciliation consumer', async () => {
    for (const schema of [{}, { 'add-field': [{ name: 'institution', type: 'string' }] }]) {
      const config = await load({ solr: { cores: { institution: { options: { host: 'solr', port: 8983, core: 'institution' }, schema } } } });
      const service = new Solr.SolrSearchService({ config: config.solr, log: createSinonStubLogger(sinon), retainFollowup: work => work });
      const missing = Reflect.get(service, 'getMissingSchemaDefinitions').call(service, 'institution', config.solr.cores.institution, {});
      assert.deepEqual(missing, { 'add-field': schema['add-field'] || [], 'add-dynamic-field': [], 'add-copy-field': [] });
      assert.equal(Reflect.get(service, 'schemaFieldsMatch').call(service, { name: 'institution', type: 'string' }, { name: 'institution', type: 'string', indexed: true, stored: true }), true);
    }
    await assert.rejects(load({ solr: { cores: { default: { schema: { 'add-field': [{ name: 'institution', type: 'string', indexed: 'false' }] } } } } }), /invalid domain data/);
  });

  it('accepts empty or omitted dashboard profile formatting before its normalizer supplies defaults', async () => {
    for (const declaration of [{ description: 'Institution profile' }, { formatRules: {} }]) {
      const config = await load({ dashboardtype: { institution: declaration } });
      let stored;
      const service = new Dashboards.DashboardTypes({
        config,
        references: { dashboardTypes: { findByName: async () => null, createDefinition: async value => { stored = value; return value; } } },
        log: createSinonStubLogger(sinon),
      } as any);
      await firstValueFrom(service.create({ id: 'brand', name: 'default' } as any, 'institution', config.dashboardtype.institution as any));
      assert.deepEqual(stored.formatRules, {});
      assert.equal(stored.tableConfig.rowConfig[0].variable, 'metadata.title');
    }
    await assert.rejects(load({ dashboardtype: { institution: { formatRules: { filterBy: { filterMode: 'invalid' } } } } }), /invalid domain data/);
  });

  it('accepts native Puppeteer paper names and numeric pixel dimensions without coercion', async () => {
    const { parsePDFOptions } = await import('../../../sails-hook-redbox-pdfgen/node_modules/puppeteer-core/lib/puppeteer/common/util.js');
    for (const options of [
      { format: 'a4' }, { format: 'LETTER' }, { format: 'legal' },
      { width: 960, height: 480, margin: { top: 96, right: 0, bottom: '1cm', left: '1in' } },
    ]) {
      const config = await load({ pdfgen: { ...pdfgen, PDFOptions: options } });
      assert.deepEqual(config.pdfgen.PDFOptions, options);
      const parsed = parsePDFOptions(json(config.pdfgen.PDFOptions) as any);
      if ('width' in options) {
        assert.equal(parsed.width, 10);
        assert.equal(parsed.height, 5);
        assert.equal(parsed.margin.top, 1);
      } else assert(parsed.width > 0 && parsed.height > 0);
    }
    for (const PDFOptions of [{ format: 'not-paper' }, { width: {} }, { margin: { top: false } }])
      await assert.rejects(load({ pdfgen: { ...pdfgen, PDFOptions } }), /PDFOptions/);
  });
});
