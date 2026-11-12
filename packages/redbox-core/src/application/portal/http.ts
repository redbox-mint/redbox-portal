import { portalMutationHttpInputs } from './mutationHttpPlan';
import { portalReadHttpInputs } from './readHttpPlan';
import { portalIdentityHttpInputs } from './identityHttpPlan';
import { portalReferenceHttpInputs } from './referenceHttpPlan';
import { companionOptions } from '../../http/integrations/companion/uploads';
import path from 'node:path';
import express from 'express';
import type { Router, Request } from 'express';
import type { Server } from 'node:http';
import { firstValueFrom } from 'rxjs';
import type { ApplicationModule } from '../Application';
import type { createPortalApplication } from './application';
import type { PoliciesConfig } from '../../config/policies.config';
import { portalHttpPlan, portalHttpSettings } from './httpPlan';
import * as http from '../../http/express';
import { BrandingModel } from '../../model/storage/BrandingModel';
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
          ...(this.options.assetRoots ?? []),
          // The compiled application tree can contain deployment overrides.
          // Preserve its same-path precedence over package assets, as in v5.
          ...(this.options.assetRoots ? [] : [path.resolve(this.options.appPath, '.tmp/public')]),
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
          options: companionOptions(companion, config.server.rootContext),
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
    const settings = portalHttpSettings(config, this.options);
    const portals = settings.portals;
    // Providers are prepared once, after AppConfig hydration. Request-time
    // settings (such as redirects) continue to read the current brand cache.
    const defaultAuth =
      ref.appConfigs.get().getAppConfigurationForBrand(ref.branding.get().getDefault().name).auth ??
      config.brandingConfigurationDefaults.auth;
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
      session: settings.session,
      log,
      logSettings: this.options.requestLogging,
      // Only streaming paths bypass ordinary body parsing. Non-upload requests
      // retain the existing parser/size/error contract.
      parserExclusions: config.companion.enabled ? [config.companion.route] : [],
      configureAuthentication: async passport => {
        const input = {
          passport,
          accounts: data.accounts.get(),
          config: defaultAuth,
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
      loginPath: settings.loginPath,
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
    const csrf = http.createHttpCsrf({
      origins: settings.origins,
      authenticateBearer: token => identity.bearer(token),
    });
    const { policyConfiguration } = portalHttpPlan(this.portal, this.options);
    const shared = { policies, policyConfiguration, csrf, log };
    const audit = (actor: { id: string; username: string }, action: string, context: { brandId: string }) =>
      this.audit(actor, action, context);
    const loadRecord = (oid: string) => data.records.get().getMeta(oid);
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
      ...settings.login,
      validContext: (brand, portal) => !!ref.branding.get().getBrand(brand) && portals.includes(portal),
      brandId: name => ref.branding.get().getBrand(name).id,
      postLoginPath: (brand, portal) =>
        rootContext +
        '/' +
        brand +
        '/' +
        portal +
        '/' +
        (
          ref.appConfigs.get().getAppConfigurationForBrand(brand).auth?.local?.postLoginRedir ??
          defaultAuth.local?.postLoginRedir ??
          'home'
        ).replace(/^\//, ''),
      audit: async (action, actor, req) => {
        await audit(actor, action, { brandId: brandForRequest(req).id });
      },
      renderAuthenticationFailure: async (req, res, reason) => {
        Object.assign(req.params, {
          branding: req.params.branding ?? req.session.branding ?? config.auth.defaultBrand,
          portal: req.params.portal ?? req.session.portal ?? config.auth.defaultPortal,
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
            defaultAuth.local?.usernameField ?? 'username'
          )
        );
      },
      csrf: csrf.protect,
      credentialFields: [
        defaultAuth.local?.usernameField ?? 'username',
        defaultAuth.local?.passwordField ?? 'password',
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
    const referenceInputs = portalReferenceHttpInputs(this.portal);
    http.mountRecordTypeRoutes(router, { ...shared, ...referenceInputs.recordTypes });
    http.mountMetadataReadRoutes(router, { ...shared, ...referenceInputs.metadata });
    http.mountPageRoutes(router, pages);
    http.mountConfigurationReadRoutes(router, { ...shared, ...referenceInputs.configuration });
    const mutationInputs = portalMutationHttpInputs(this.portal, this.options.actions ?? {});
    http.mountConfigurationWriteRoutes(router, {
      ...shared,
      ...mutationInputs.configuration,
    });
    http.mountFormDeliveryRoutes(router, { ...shared, ...referenceInputs.form });
    const readInputs = portalReadHttpInputs(this.portal);
    http.mountQueryReadRoutes(router, { ...shared, ...readInputs.queries });
    http.mountRecordReadRoutes(router, { ...shared, ...readInputs.records });
    http.mountRecordMutationRoutes(router, {
      ...shared,
      ...mutationInputs.records,
    });
    http.mountHarvestMutationRoutes(router, { ...shared, ...mutationInputs.harvest });
    const identityInputs = portalIdentityHttpInputs(this.portal, () => invalidateAssets());
    http.mountIdentityAdministrationRoutes(router, {
      ...shared,
      ...identityInputs.users,
    });
    http.mountIdentityLinkRoutes(router, { ...shared, ...identityInputs.users });
    http.mountQueryWriteRoutes(router, { ...shared, ...mutationInputs.queries });
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
      ...identityInputs.administration,
    });
    let invalidateAssets: () => void = () => {
      throw new Error('Branding delivery is not mounted.');
    };
    http.mountAdminOperationRoutes(router, {
      ...shared,
      ...identityInputs.administration,
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
    http.mountConfiguredActionRoutes(router, { ...shared, ...mutationInputs.actions });
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
      await this.companion.initialize(server, { borrowedLifecycle: true });
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
