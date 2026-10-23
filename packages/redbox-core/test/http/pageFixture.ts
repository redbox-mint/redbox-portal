import path from 'node:path';
import { AddressInfo } from 'node:net';
import { firstValueFrom } from 'rxjs';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { recordWriteFixture } from './recordWriteFixture';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { Services as Templates } from '../../src/pages/Templates';
import { csp } from '../../src/config/csp.config';
import { mountPageRoot, mountPageRoutes, type PagesHttpInput } from '../../src/http/express/pages';
import {
  mountBrandingDeliveryRoutes,
  mountDynamicPageAssets,
  mountStaticPageArtifacts,
} from '../../src/http/express/pageAssets';
import { mountAuthenticationRoutes } from '../../src/http/express/login';
import { mountFormDeliveryRoutes } from '../../src/http/express/formDelivery';
import { ContextVariables } from '../../src/forms/ContextVariables';
import { resolveRecordFormFingerprint } from '../../src/RecordFormFingerprint';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { Services as Translation } from '../../src/translations/Translation';
import { I18nEntries } from '../../src/translations/I18nEntries';
import { httpAction } from '../../src/http/express/middleware';
import { Services as Dashboards } from '../../src/dashboards/DashboardTypes';
import { Services as DashboardConfig } from '../../src/dashboards/DashboardConfig';
import { Services as Reports } from '../../src/queries/Reports';
import { Services as Queries } from '../../src/queries/NamedQueries';
import { namedQueryTarget, executeNamedQuery } from '../../src/persistence/reference/NamedQueryExecution';
import { ensureConfigurationPersistenceIndexes } from '../../src/persistence/configuration/preflight';
import {
  initializeConfigurationPersistence,
  getConfigurationRepositories,
} from '../../src/persistence/configuration/runtime';
import { ConfigModelRegistry } from '../../src/configuration/ConfigModelRegistry';
import type { DashboardViewConfig } from '../../src/config/dashboardview.config';
import { Services as Typeface } from '../../src/branding/BrandingTypeface';
import { Services as Logos } from '../../src/branding/BrandingLogo';
import { Services as Branding } from '../../src/branding/Branding';
import { Services as Sanitizer } from '../../src/forms/DomSanitizer';
import { dompurify } from '../../src/config/dompurify.config';
import { getCacheEntryRepository, initializeCachePersistence } from '../../src/persistence/cache/runtime';
import { ensureCachePersistenceIndex } from '../../src/persistence/cache/preflight';
import { Services as Theme } from '../../src/branding/BrandingThemeCss';
import { hasEditAccess, hasViewAccess } from '../../src/records/access';
import { registerPersistenceResource } from '../../src/persistence/runtime';

export async function pageFixture(
  options: {
    artifacts?: PageArtifacts;
    port?: number;
    auth?: import('../../src/authentication/Accounts').AuthBrandConfig;
    prepare?: Parameters<typeof recordWriteFixture>[0];
    pageBindings?(pages: PagesHttpInput): void;
  } = {}
) {
  const root = path.resolve(__dirname, '../../../..');
  const artifacts =
    options.artifacts ??
    new PageArtifacts([path.join(root, 'views')], [path.join(root, '.tmp/public'), path.join(root, 'assets')]);
  let branding!: Branding.Branding, typeface!: Typeface.BrandingTypeface, logos!: Logos.BrandingLogo;
  const fixture = await recordWriteFixture(
    async (router, f, input) => {
      for (const pathname of ['/:branding/:portal/admin', '/:branding/:portal/admin(/*)'])
        await f.identities.create('pathrule', {
          path: pathname,
          role: f.role.id,
          branding: f.brand.id,
          can_update: true,
        });
      registerPersistenceResource(f.owner, 'page-artifacts', artifacts);
      await artifacts.initialize();
      const origin = 'http://127.0.0.1:' + (input.realtime.server.address() as AddressInfo).port;
      const config = {
        appUrl: origin,
        appmode: {},
        auth: { active: ['local'] },
        i18n: { next: { init: { fallbackLng: 'en', supportedLngs: ['en', 'fr'] } } },
        record: { search: { maxRecordsPerPage: 10 }, transfer: { maxRecordsPerPage: 10 } },
      };
      const refs = getReferenceRepositories(f.owner);
      await ensureConfigurationPersistenceIndexes(f.owner);
      await initializeConfigurationPersistence(f.owner);
      const repository = getConfigurationRepositories(f.owner);
      const brands = [f.brand, f.otherBrand].map(value => Object.assign(new BrandingModel(), value));
      const translations = new Translation.Translation({
        repository,
        log: nothingLogger,
        config,
        getBrand: name => brands.find(value => value.name === name || value.id === name)!,
        availableBrands: () => brands.map(value => value.name!),
      });
      registerPersistenceResource(f.owner, 'page-translations', translations);
      const entries = new I18nEntries({
        repository,
        localesDirectory: path.join(artifacts.assets[0], 'locales'),
        log: nothingLogger,
        getBrand: name => brands.find(value => value.name === name) ?? null,
        getBrandById: id => brands.find(value => value.id === id) ?? null,
        supportedLanguages: ['en', 'fr'],
        reloadResources: id => translations.reloadResources(id),
      });
      await entries.setEntry(brands[0], 'en', 'translation', 'default-title', 'Portal');
      await entries.setEntry(brands[0], 'fr', 'translation', 'default-title', 'Portail');
      await translations.bootstrap();
      const dashboardview: DashboardViewConfig = {
        example: {
          name: 'example',
          titleLabelKey: 'Example dashboard',
          dashboardType: 'standard',
          sourceRecordType: 'dataRecord',
          steps: [
            {
              name: 'all',
              sourceRecordType: 'dataRecord',
              fetchMode: 'allForRecordType',
              dashboardTable: { rowConfig: [] },
            },
          ],
        },
      };
      const dashboardConfig = new DashboardConfig.DashboardConfig({
        references: refs,
        configuration: repository,
        brands: f.branding,
        migrations: { isExecuted: async () => true },
        config: { dashboardview },
        log: nothingLogger,
        recordTypes: input.types,
        workflowSteps: input.domains.workflows,
        schema: input.domains.schemas,
        availableBrands: () => brands.map(value => value.name!),
        getBrand: name => brands.find(value => value.name === name)!,
      });
      await dashboardConfig.migrateLegacyConfiguration();
      await dashboardConfig.initialiseAfterBootstrap();
      registerPersistenceResource(f.owner, 'page-dashboard-config', dashboardConfig);
      const dashboards = new Dashboards.DashboardTypes({
        references: refs,
        configuration: repository,
        config: { appmode: {}, dashboardtype: {}, recordtype: {}, workflow: {}, dashboardview },
        log: nothingLogger,
        recordTypes: input.types,
        dashboardConfig,
      });
      registerPersistenceResource(f.owner, 'page-dashboards', dashboards);
      const queries = new Queries.NamedQueryService({
        queries: refs.namedQueries,
        log: nothingLogger,
        config: {},
        target: name => namedQueryTarget(f.owner, name),
        execute: (request, count) => executeNamedQuery(f.owner, request, count),
      });
      const reports = new Reports.Reports({
        reports: refs.reports,
        namedQueries: queries,
        search: input.search,
        config: {},
        log: nothingLogger,
        portalUrl: () => '/portal/default/rdmp',
      });
      registerPersistenceResource(f.owner, 'page-reports', reports);
      const models = new ConfigModelRegistry();
      const pages: PagesHttpInput = {
        artifacts,
        rootContext: '/portal',
        origin,
        environment: 'development',
        csp,
        log: nothingLogger,
        csrf: input.csrf,
        policies: input.policies,
        policyConfiguration: { '*': true },
        forms: input.domains.forms,
        recordTypes: input.types,
        dashboards,
        reports,
        loadRecord: oid => input.storage.getMeta(oid),
        canCreate: async context =>
          context.actor?.roles.some(role => role.brandId === context.brand.id && role.name === 'Admin') === true,
        configModel: async key => {
          const model = models.getModelInfo(key);
          return model ? { title: model.title ?? model.modelName } : undefined;
        },
        settings: async () => ({ auth: options.auth ?? { active: ['local'] } }),
        languages: async () => [
          { code: 'en', displayName: 'English' },
          { code: 'fr', displayName: 'Français' },
        ],
        translate: (brand, language, key, values) => translations.t(key, values, language, brand),
        typeface: () => null,
        templateConfig: config,
      };
      mountPageRoot(router, '/portal', '/default/rdmp/home');
      mountAuthenticationRoutes(router, {
        passport: input.realtime.auth.passport,
        identity: f.identity,
        rootContext: '/portal',
        defaultBrand: 'default',
        defaultPortal: 'rdmp',
        validContext: (brand, portal) => ['default', 'other'].includes(brand) && portal === 'rdmp',
        brandId: brand => (brand === 'default' ? f.brand.id : f.otherBrand.id),
        postLoginPath: () => '/portal/default/rdmp/researcher/home',
        audit: async () => {},
        loginFailure: async () => {},
        csrf: input.csrf.protect,
      });
      options.pageBindings?.(pages);
      mountPageRoutes(router, pages);
      mountDynamicPageAssets(router, {
        ...pages,
        defaultBrand: 'default',
        defaultPortal: 'rdmp',
        config,
        forms: input.domains.forms,
        templates: new Templates.Template(nothingLogger),
        dashboards,
        reports,
      });
      await ensureCachePersistenceIndex(f.owner);
      await initializeCachePersistence(f.owner);
      const theme = new Theme.BrandingThemeCss();
      typeface = new Typeface.BrandingTypeface({
        repository: f.branding,
        disk: () => input.disks.primaryDisk(),
        log: nothingLogger,
        rootContext: 'portal',
        positiveInt: (_key, fallback) => fallback,
      });
      branding = new Branding.Branding({
        repository: f.branding,
        cacheEntries: () => getCacheEntryRepository(f.owner),
        log: nothingLogger,
        theme,
        typeface,
        positiveInt: (_key, fallback) => fallback,
        rootContext: 'portal',
      });
      await firstValueFrom(branding.loadAvailableBrands(null));
      const sanitizer = new Sanitizer.DomSanitizer({ config: { dompurify }, log: nothingLogger });
      logos = new Logos.BrandingLogo({
        repository: f.branding,
        disk: () => input.disks.primaryDisk(),
        legacyDatabase: async () => f.native.db(),
        sanitize: sanitizer.sanitize.bind(sanitizer),
        config: {},
        log: nothingLogger,
      });
      registerPersistenceResource(f.owner, 'page-logos', logos);
      mountBrandingDeliveryRoutes(router, {
        artifacts,
        csrf: input.csrf,
        policies: input.policies,
        policyConfiguration: { '*': true },
        delivery: {
          repository: () => f.branding,
          theme,
          typeface,
          logos,
          branding,
          log: nothingLogger,
          staticAssets: {
            logoName: 'logo.png',
            imageType: 'image/png',
            faviconName: 'favicon-32x32.png',
            faviconType: 'image/png',
          },
        },
      });
      mountFormDeliveryRoutes(router, {
        policies: input.policies,
        policyConfiguration: input.policyConfiguration,
        contextVariables: new ContextVariables({}, nothingLogger),
        delivery: {
          forms: input.domains.forms,
          recordTypes: input.types,
          workflowSteps: input.domains.workflows,
          prehydrate: { build: async () => undefined },
          loadRecord: oid => input.storage.getMeta(oid),
          canView: async (brand, user, record) =>
            !!user &&
            hasViewAccess(
              brand,
              user,
              user.roles.map(role => ({ ...role })),
              record
            ),
          canEdit: async (brand, user, record) =>
            !!user &&
            hasEditAccess(
              brand,
              user,
              user.roles.map(role => ({ ...role })),
              record
            ),
          fingerprint: (record, type, form) =>
            resolveRecordFormFingerprint(
              {
                loadForm: (name, brand) => firstValueFrom(input.domains.forms.getFormByName(name, true, brand)),
                loadWorkflowSteps: type => refs.workflows.listForRecordType(String(type.id), false),
              },
              record,
              type,
              form
            ),
        },
      });
      router.get(
        '/:branding/:portal/locales/:lng/translation.json',
        input.policies.brandingandportal,
        httpAction(async (req, res) => {
          res.json(
            await entries.getNamespace(
              brands.find(value => value.name === req.params.branding)!,
              String(req.params.lng),
              'translation'
            )
          );
        })
      );
      await options.prepare?.(router, f, input);
      mountStaticPageArtifacts(router, artifacts);
    },
    { parserExclusions: ['/companion'], port: options.port, trustProxy: true }
  );
  await fixture.pathRules.loadRules();
  return { ...fixture, pageBranding: branding, typeface, logos };
}
