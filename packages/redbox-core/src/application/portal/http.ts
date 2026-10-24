import path from 'node:path';
import express from 'express';
import type { Router, Request } from 'express';
import type { Server } from 'node:http';
import { firstValueFrom } from 'rxjs';
import { diffRecordValues } from '@researchdatabox/sails-ng-common';
import type { ApplicationModule } from '../Application';
import type { createPortalApplication } from './application';
import type { PoliciesConfig } from '../../config/policies.config';
import { portalHttpPolicies } from './httpPolicies';
import * as http from '../../http/express';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { RecordAuditViews } from '../../queries/RecordAuditViews';
import { SiemReads } from '../../queries/SiemReads';
import { summarizeFigshareStatus } from '../../queries/FigshareStatus';
import { ContextVariables } from '../../forms/ContextVariables';
import { Services as Prehydrate } from '../../forms/FormPayloadPrehydrate';
import { Services as Logos } from '../../branding/BrandingLogo';
import { Services as Templates } from '../../pages/Templates';
import * as persistence from '../../persistence/runtime';
import type { PersistenceResource } from '../../persistence/types';
import type { ConfiguredAction } from '../../http/express/configuredActions';

type Portal = Awaited<ReturnType<typeof createPortalApplication>>;
export interface PortalHttpOptions {
  readonly appPath: string;
  readonly requestLogging?: http.HttpMiddlewareInput['logSettings'];
  readonly portals?: readonly string[];
  readonly policyConfiguration?: PoliciesConfig;
  readonly actions?: Readonly<Record<string, ConfiguredAction>>;
  readonly viewRoots?: readonly string[];
  readonly assetRoots?: readonly string[];
}

/** Complete HTTP bindings to the selected production instance, with owned native resources. */
export class PortalHttp implements ApplicationModule {
  private readonly resources: PersistenceResource[] = [];
  private artifacts!: http.PageArtifacts;
  private logos!: Logos.BrandingLogo;
  private multipart!: http.StreamingMultipart;
  private uploads!: http.ResumableUploads;
  private sockets!: http.ProgressSockets;
  private companion?: http.CompanionUploads;
  private authenticateCredential?: Awaited<ReturnType<typeof http.prepareHttpMiddleware>>['authenticateCredential'];
  private closing = false;
  constructor(
    private readonly portal: Portal,
    private readonly options: PortalHttpOptions
  ) {}
  private own<T extends PersistenceResource>(value: T): T {
    this.resources.push(value);
    return value;
  }
  async initialize(): Promise<void> {
    const { data, config, resolved, owner } = this.portal;
    this.artifacts = this.own(
      new http.PageArtifacts(
        [...(this.options.viewRoots ?? []), ...resolved.views, path.resolve(this.options.appPath, 'views')],
        [
          ...(this.options.assetRoots ?? [path.resolve(this.options.appPath, '.tmp/public')]),
          ...resolved.assets,
          path.resolve(this.options.appPath, 'assets'),
        ]
      )
    );
    this.logos = this.own(
      new Logos.BrandingLogo({
        repository: persistence.getBrandingRepository(owner),
        disk: () => data.disks.get().primaryDisk(),
        legacyDatabase: () => persistence.mongoDatabase(owner, 'mongodb'),
        sanitize: (...args) => data.reference.sanitizer.get().sanitize(...args),
        config: config.branding,
        log: this.log,
      })
    );
    const staging = data.disks.get().stagingDisk();
    this.multipart = this.own(
      new http.StreamingMultipart(staging, {
        files: 100,
        fileSize: config.record.maxUploadSize,
        fields: 100,
        fieldSize: 1024 * 1024,
      })
    );
    const stagingConfiguration = data.disks.get().getStagingDiskConfig();
    this.uploads = this.own(
      new http.ResumableUploads({
        disk: staging,
        ...(stagingConfiguration.driver === 'fs'
          ? {
              stagingFilesystem: {
                root: stagingConfiguration.config.root,
                reserveBytes: config.record.diskSpaceThreshold,
              },
            }
          : {}),
        records: data.records.get(),
        maxSize: config.record.maxUploadSize,
        origins: [this.origin],
        rootContext: config.server.rootContext,
        log: this.log,
        authorizePending: async context => {
          if (!context.actor) return false;
          const brand = Object.assign(new BrandingModel(), context.brand);
          const types = await firstValueFrom(data.reference.types.get().getAll(brand));
          for (const type of types) {
            const step = await firstValueFrom(data.reference.workflows.get().getFirst(type));
            if (
              step &&
              (await data.records.get().hasCreateAccess(
                brand,
                { ...context.actor },
                context.actor.roles.map(role => ({ ...role })),
                type.packageType,
                step.name
              ))
            )
              return true;
          }
          return false;
        },
        audit: (...args) => this.audit(...args),
      })
    );
    this.sockets = this.own(
      new http.ProgressSockets({
        owner,
        path: config.server.rootContext + '/portal-socket.io',
        origins: [this.origin],
        records: data.records.get(),
        progress: data.progress.get(),
        authenticate: credential => {
          if (!this.authenticateCredential) throw new Error('HTTP authentication is not prepared.');
          return this.authenticateCredential(credential);
        },
      })
    );
    if (config.companion.enabled) {
      const companion = config.companion;
      this.companion = this.own(
        new http.CompanionUploads({
          owner,
          path: companion.route,
          origins: [this.origin],
          isReady: () => this.portal.application.status().ready,
          options: {
            secret: companion.secret,
            filePath: companion.filePath,
            server: { ...companion.server, implicitPath: config.server.rootContext },
            providerOptions: { drive: companion.providerOptions.drive, onedrive: companion.providerOptions.onedrive },
            uploadUrls: companion.uploadUrls,
            uploadHeaders: companion.uploadHeaders,
            metrics: companion.metrics ?? false,
          },
        })
      );
    }
    await this.artifacts.initialize();
    if (this.closing) throw new Error('HTTP initialization interrupted by shutdown.');
  }
  private get log() {
    return this.portal.log;
  }
  private get origin(): string {
    return new URL(this.portal.config.server.publicUrl).origin;
  }
  private audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string }
  ): Promise<unknown> {
    return this.portal.data.users.get().addUserAuditEvent({ ...actor }, action, context);
  }
  async prepare(router: Router, server: Server): Promise<void> {
    const { data, providers, config, owner, models } = this.portal;
    const ref = data.reference;
    const log = this.log;
    const rootContext = config.server.rootContext;
    const identity = new http.HttpIdentity(persistence.getIdentityRepositories(owner));
    const portals = this.options.portals ?? [config.auth.defaultPortal];
    const brandForRequest = (req: Request): BrandingModel => {
      const name =
        typeof req.params.branding === 'string'
          ? req.params.branding
          : (req.session.branding ?? config.auth.defaultBrand);
      const brand = ref.branding.get().getBrand(name);
      if (!brand) throw new Error('Authentication brand is unavailable.');
      return brand;
    };
    const pageHeaders = {
      publicUrl: config.server.publicUrl,
      sessionMaxAgeMs: config.redboxSession.cookie?.maxAge,
      noCache: config.page.noCache,
    };
    router.use(http.pageResponseHeaders(pageHeaders));
    const authentication = await http.prepareHttpMiddleware(router, {
      owner,
      identity,
      session: config.redboxSession,
      log,
      logSettings: this.options.requestLogging,
      // Only streaming paths bypass ordinary body parsing. Non-upload requests
      // retain the existing parser/size/error contract.
      parserExclusions: config.companion.enabled ? [config.companion.route] : [],
      configureAuthentication: async passport => {
        const input = {
          passport,
          accounts: data.accounts.get(),
          config: config.brandingConfigurationDefaults.auth,
          brand: brandForRequest,
        };
        http.installLocalAuthentication(input);
        http.installAafAuthentication(input);
        await http.installOidcAuthentication(input);
      },
    });
    this.authenticateCredential = authentication.authenticateCredential;
    const policies = http.createHttpPolicies({
      branding: persistence.getBrandingRepository(owner),
      pathRules: ref.pathRules,
      portals,
      defaultUnauthenticatedRole: brand =>
        ref.roles.get().getDefUnathenticatedRole(Object.assign(new BrandingModel(), brand)),
      authenticate: req => authentication.authenticate(req),
      rootContext,
      loginPath: config.auth.loginPath,
      emitRequestFailure: async (req, eventType, source) => {
        const context = http.requestContext(req);
        await providers.security.get().emitSecurityEvent({
          brandId: context.brand.id,
          portalId: context.portal,
          eventType,
          source,
          category: 'authorization',
          requestContext: { method: req.method, path: req.path },
        });
      },
    });
    const csrf = http.createHttpCsrf({ origins: [this.origin], authenticateBearer: token => identity.bearer(token) });
    const policyConfiguration = this.options.policyConfiguration ?? portalHttpPolicies();
    const shared = { policies, policyConfiguration, csrf, log };
    const audit = (actor: { id: string; username: string }, action: string, context: { brandId: string }) =>
      this.audit(actor, action, context);
    const loadRecord = (oid: string) => data.records.get().getMeta(oid);
    const contextVariables = new ContextVariables(config.record.contextVariables, log);
    const canCreate = async (context: ReturnType<typeof http.requestContext>, name: string) => {
      if (!context.actor) return false;
      const brand = Object.assign(new BrandingModel(), context.brand);
      const type = await firstValueFrom(ref.types.get().get(brand, name));
      if (!type) return false;
      const step = await firstValueFrom(ref.workflows.get().getFirst(type));
      return (
        !!step &&
        data.records.get().hasCreateAccess(
          brand,
          { ...context.actor },
          context.actor.roles.map(role => ({ ...role })),
          name,
          step.name
        )
      );
    };
    const extensionPolicies = (names: readonly string[]) => {
      const chain = express.Router({ mergeParams: true });
      chain.use(
        ...http.bindHttpPolicies(
          names.map(name => name.toLowerCase()),
          { ...policies, csrf: csrf.apiProtect }
        )
      );
      return chain;
    };
    await this.portal.prepareExtensions('beforeRoutes', router, server, extensionPolicies);
    http.mountCsrfTokenRoute(router, csrf);
    http.mountAuthenticationRoutes(router, {
      passport: authentication.passport,
      identity,
      rootContext,
      defaultBrand: config.auth.defaultBrand,
      defaultPortal: config.auth.defaultPortal,
      validContext: (brand, portal) => !!ref.branding.get().getBrand(brand) && portals.includes(portal),
      brandId: name => ref.branding.get().getBrand(name).id,
      postLoginPath: (brand, portal) =>
        rootContext +
        '/' +
        brand +
        '/' +
        portal +
        '/' +
        config.brandingConfigurationDefaults.auth.local.postLoginRedir.replace(/^\//, ''),
      postLogoutPath: config.auth.postLogoutRedir,
      logoutOrigins: config.auth.logoutOrigins,
      audit: async (action, actor, req) => {
        await audit(actor, action, { brandId: brandForRequest(req).id });
      },
      renderAuthenticationFailure: async (req, res, reason) => {
        Object.assign(req.params, {
          branding: req.session.branding ?? config.auth.defaultBrand,
          portal: req.session.portal ?? config.auth.defaultPortal,
        });
        await policies.brandingandportal(req, res, () => {});
        if (res.writableEnded) return;
        await policies.browseractor(req, res, () => {});
        await http.sendPageAuthenticationFailure(req, res, pages, reason);
      },
      loginFailure: async req => {
        await providers.security.get().emitSecurityEvent(
          http.authenticationFailureEvent(
            req,
            {
              brandId: brandForRequest(req).id,
              portalId: String(
                req.params.portal ?? req.body?.portal ?? req.session.portal ?? config.auth.defaultPortal
              ),
            },
            config.brandingConfigurationDefaults.auth.local.usernameField
          )
        );
      },
      csrf: csrf.protect,
      credentialFields: [
        config.brandingConfigurationDefaults.auth.local.usernameField,
        config.brandingConfigurationDefaults.auth.local.passwordField,
      ],
      sessionCookie: { name: config.redboxSession.name, ...config.redboxSession.cookie },
    });
    // Literal metadata reads must precede parameterized pages (dashboard/type
    // before dashboard/:recordType). Literal pages still precede parameterized
    // API aliases such as vocabulary/manager before vocabulary/:id.
    const pages: http.PagesHttpInput = {
      ...shared,
      artifacts: this.artifacts,
      rootContext,
      origin: this.origin,
      environment: config.environment,
      csp: config.csp,
      forms: ref.forms.get(),
      recordTypes: ref.types.get(),
      dashboards: ref.dashboards.get(),
      reports: ref.reports.get(),
      loadRecord,
      canCreate,
      configModel: async key => {
        const model = models.getModelInfo(key);
        return model ? { title: model.title ?? model.modelName } : undefined;
      },
      settings: async brand => ({
        ...ref.appConfigs.get().getAppConfigurationForBrand(brand.name ?? config.auth.defaultBrand),
      }),
      languages: brand => ref.entries.get().listLanguages(ref.branding.get().getBrandById(brand.id)!),
      translate: (brand, language, key, values) => ref.translation.get().t(key, values, language, brand),
      typeface: name => ref.branding.get().getActiveTypefaceFontInfo(name),
      templateConfig: { ...config, appUrl: this.origin, rootContext },
    };
    http.mountPageRoot(router, rootContext, config.page.landingPath);
    http.mountRecordTypeRoutes(router, {
      ...shared,
      recordTypes: ref.types.get(),
      recordSchema: config.recordSchema,
      rootContext,
    });
    http.mountMetadataReadRoutes(router, {
      ...shared,
      recordTypes: ref.types.get(),
      workflowSteps: ref.workflows.get(),
      workspaceTypes: ref.workspaceTypes.get(),
      dashboardTypes: ref.dashboards.get(),
      dashboardConfig: ref.dashboardConfig.get(),
      translations: ref.entries.get(),
    });
    http.mountPageRoutes(router, pages);
    http.mountConfigurationReadRoutes(router, {
      ...shared,
      appConfigs: ref.appConfigs.get(),
      translations: ref.entries.get(),
      forms: ref.forms.get(),
      loadRecord,
    });
    http.mountConfigurationWriteRoutes(router, {
      ...shared,
      appConfigs: ref.appConfigs.get(),
      translations: ref.entries.get(),
      dashboardConfig: ref.dashboardConfig.get(),
      reloadTranslations: id => ref.translation.get().reloadResources(id),
    });
    http.mountFormDeliveryRoutes(router, {
      ...shared,
      contextVariables,
      delivery: {
        forms: ref.forms.get(),
        recordTypes: ref.types.get(),
        workflowSteps: ref.workflows.get(),
        prehydrate: new Prehydrate.FormPayloadPrehydrateService({ config: {}, vocabulary: ref.vocabulary.get(), log }),
        loadRecord,
        canView: async (brand, user, record) =>
          !!user &&
          data.records.get().hasViewAccess(
            brand,
            user,
            user.roles.map(role => ({ ...role })),
            record
          ),
        canEdit: async (brand, user, record) =>
          !!user &&
          data.records.get().hasEditAccess(
            brand,
            user,
            user.roles.map(role => ({ ...role })),
            record
          ),
        fingerprint: (...args) => data.records.get().getRecordFormFingerprint(...args),
        reusableFormDefinitions: config.reusableFormDefinitions,
      },
    });
    const recordAudit = new RecordAuditViews({
      records: data.records.get(),
      forms: ref.forms.get(),
      integrations: providers.audits.get(),
      compareRecords: diffRecordValues,
      canView: async (brand, user, record) =>
        data.records.get().hasViewAccess(brand, user, Array.isArray(user.roles) ? user.roles : [], record),
      configuration: name => ref.appConfigs.get().getAppConfigurationForBrand(name),
      figshareStatus: async (oid, record) =>
        summarizeFigshareStatus(oid, record, await persistence.getFigshareSyncRepository(owner).get(oid)),
    });
    http.mountQueryReadRoutes(router, {
      ...shared,
      queries: ref.queries.get(),
      reports: ref.reports.get(),
      harvest: data.harvest.get(),
      siem: new SiemReads(persistence.getSiemRepository(owner)),
      audit: recordAudit,
      search: data.search.get(),
      recordTypes: ref.types.get(),
      returnFields: config.record.search.returnFields,
      siemConfig: async id => ref.appConfigs.get().getAppConfigByBrandAndKey(id, 'siem'),
    });
    http.mountRecordReadRoutes(router, {
      ...shared,
      schemas: ref.schema.get(),
      rootContext,
      storage: data.storage(),
      audit: data.records.get(),
      forms: ref.forms.get(),
      contextVariables,
      reusableFormDefinitions: config.reusableFormDefinitions,
      recordTypes: ref.types.get(),
      search: data.search.get(),
      returnFields: config.record.search.returnFields,
      maxRows: config.record.search.maxRecordsPerPage,
      translate: (key, brand) => ref.translation.get().t(key, undefined, 'en', brand),
    });
    http.mountRecordMutationRoutes(router, {
      ...shared,
      records: data.records.get(),
      recordTypes: ref.types.get(),
      workflows: ref.workflows.get(),
      forms: ref.forms.get(),
      contextVariables,
      reusableFormDefinitions: config.reusableFormDefinitions,
      returnMetadataOnSave: config.record.form?.returnMetadataOnSave,
      schemaEnabled: config.recordSchema.enabled,
      rootContext,
    });
    http.mountHarvestMutationRoutes(router, { ...shared, harvest: data.harvest.get(), recordTypes: ref.types.get() });
    http.mountIdentityAdministrationRoutes(router, {
      ...shared,
      users: data.users.get(),
      roles: ref.roles.get(),
      hiddenRoles: config.auth.hiddenRoles,
    });
    http.mountIdentityLinkRoutes(router, { ...shared, users: data.users.get(), hiddenUsers: config.auth.hiddenUsers });
    http.mountQueryWriteRoutes(router, { ...shared, audit, queries: ref.queries.get(), reports: ref.reports.get() });
    http.mountVocabularyIntegrationRoutes(router, {
      ...shared,
      audit,
      rva: data.rva.get(),
      vocabulary: ref.vocabulary.get(),
    });
    http.mountVocabularyAdministrationRoutes(router, { ...shared, audit, vocabulary: ref.vocabulary.get() });
    http.mountFormVocabularyRoutes(router, {
      ...shared,
      vocabulary: ref.vocabulary.get(),
      lookups: data.lookups.get(),
      users: data.users.get(),
    });
    http.mountSiemWriteRoutes(router, {
      ...shared,
      audit,
      forwarding: providers.siem.get(),
      settings: ref.appConfigs.get(),
    });
    let invalidateAssets: () => void = () => {
      throw new Error('Branding delivery is not mounted.');
    };
    http.mountAdminOperationRoutes(router, {
      ...shared,
      audit,
      settings: ref.appConfigs.get(),
      reloadTranslations: () => ref.translation.get().bootstrap(),
      invalidateAssets: () => invalidateAssets(),
    });
    http.mountBrandingOperationRoutes(router, { ...shared, audit, branding: ref.branding.get() });
    http.mountFigshareAdministrationRoutes(router, {
      ...shared,
      audit,
      vocabulary: providers.figshareVocabulary.get(),
    });
    http.mountIntegrationOperationRoutes(router, {
      ...shared,
      audit,
      records: data.records.get(),
      search: data.search.get(),
      email: providers.email.get(),
    });
    http.mountConfiguredActionRoutes(router, { ...shared, audit, actions: this.options.actions ?? {} });
    http.mountBrandingUploadRoutes(router, {
      ...shared,
      audit,
      branding: ref.branding.get(),
      faceMaxBytes: config.branding.typefaceFaceMaxBytes,
      logos: this.logos,
      multipart: this.multipart,
      staging: data.disks.get().stagingDisk(),
    });
    http.mountDatastreamWriteRoutes(router, {
      ...shared,
      records: data.records.get(),
      datastream: data.datastream.get(),
      multipart: this.multipart,
    });
    http.mountDatastreamReadRoutes(router, {
      ...shared,
      notFound: async (req, res) => {
        (await http.preparePage(req, res, pages)).error(404);
      },
      records: data.records.get(),
      datastream: data.datastream.get(),
    });
    http.mountResumableUploadRoutes(router, { ...shared, uploads: this.uploads });
    this.sockets.attach(server);
    if (this.companion) {
      await this.companion.initialize(server);
      http.mountCompanionRoutes(router, {
        ...shared,
        uploads: this.companion,
        path: config.companion.route,
        appUrl: config.server.publicUrl,
        context: req => ({
          branding: req.session.branding ?? config.auth.defaultBrand,
          portal: config.auth.defaultPortal,
        }),
        audit,
      });
    }
    http.mountProgressOperationRoutes(router, {
      ...shared,
      audit,
      progress: data.progress.get(),
      records: data.records.get(),
      sockets: this.sockets,
    });
    const brandingDelivery = http.mountBrandingDeliveryRoutes(router, {
      ...shared,
      artifacts: this.artifacts,
      delivery: {
        repository: () => persistence.getBrandingRepository(owner),
        branding: ref.branding.get(),
        theme: ref.theme,
        typeface: ref.typeface.get(),
        logos: this.logos,
        log,
        staticAssets: config.static_assets,
        apiConfiguration: config,
      },
    });
    invalidateAssets = () => brandingDelivery.invalidate();
    http.mountDynamicPageAssets(router, {
      ...pages,
      defaultBrand: config.auth.defaultBrand,
      defaultPortal: config.auth.defaultPortal,
      config: { ...config, appUrl: this.origin },
      forms: ref.forms.get(),
      dashboards: ref.dashboards.get(),
      reports: ref.reports.get(),
      templates: new Templates.Template(log),
    });
    http.mountStaticPageArtifacts(router, this.artifacts, pageHeaders);
    await this.portal.prepareExtensions('afterRoutes', router, server, extensionPolicies);
    http.mountPageNotFound(router, pages);
    router.use(http.httpErrorHandler(log));
  }
  quiesce(): void {
    this.closing = true;
    for (const resource of this.resources) resource.quiesce?.();
  }
  async drain(options?: { deadline?: number }): Promise<void> {
    await Promise.all(this.resources.map(resource => resource.drain?.(options)));
  }
  async close(): Promise<void> {
    for (const resource of this.resources) await resource.close();
  }
}
