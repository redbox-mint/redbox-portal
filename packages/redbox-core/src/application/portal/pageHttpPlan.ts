import { BrandingDelivery } from '../../pages/brandingDelivery';
import { Services as Logos } from '../../branding/BrandingLogo';
import { Services as Templates } from '../../pages/Templates';
import { getBrandingRepository } from '../../persistence/branding/runtime';
import { mongoDatabase } from '../../persistence/runtime';
import type { DynamicPageAssetsInput } from '../../pages/dynamicAssets';
import path from 'node:path';
import type { ApplicationModule } from '../Application';
import type { PortalApplicationContext } from './application';
import { PageArtifacts } from '../../pages/Artifacts';
import type { BrowserPageInput } from '../../pages/browser';
import { firstValueFrom } from 'rxjs';
import { BrandingModel } from '../../model/storage/BrandingModel';

export interface PortalPageOptions {
  readonly viewRoots?: readonly string[];
  readonly assetRoots?: readonly string[];
}
/** Shared production operations; getters borrow the initialized reference domain. */
export function portalPageRenderingInput(portal: PortalApplicationContext, artifacts: PageArtifacts): BrowserPageInput {
  const { data, config, log } = portal;
  const ref = data.reference;
  const origin = new URL(config.server.publicUrl).origin;
  return {
    get forms() {
      return ref.forms.get();
    },
    get dashboards() {
      return ref.dashboards.get();
    },
    get reports() {
      return ref.reports.get();
    },
    loadRecord: oid => data.records.get().getMeta(oid),
    canCreate: async (context, name) => {
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
    },
    configModel: async key => {
      const model = portal.models.getModelInfo(key);
      return model ? { title: model.title ?? model.modelName } : undefined;
    },
    artifacts,
    rootContext: config.server.rootContext,
    origin,
    environment: config.environment,
    csp: config.csp,
    log,
    settings: async brand => ({
      ...ref.appConfigs.get().getAppConfigurationForBrand(brand.name ?? config.auth.defaultBrand),
    }),
    languages: brand => ref.entries.get().listLanguages(ref.branding.get().getBrandById(brand.id)!),
    translate: (brand, language, key, values) => ref.translation.get().t(key, values, language, brand),
    typeface: name => ref.branding.get().getActiveTypefaceFontInfo(name),
    templateConfig: { ...config, appUrl: origin, rootContext: config.server.rootContext },
  };
}
/** One application module owns the merged EJS tree; controllers borrow it. */
export class PortalPages implements ApplicationModule {
  csrfToken!: (request: import('fastify').FastifyRequest) => string;
  artifacts!: PageArtifacts;
  delivery!: BrandingDelivery;
  dynamic!: DynamicPageAssetsInput;
  private logos?: Logos.BrandingLogo;
  rendering!: BrowserPageInput;
  authentication!: import('../../http/fastify/authentication').NativeAuthenticationActions;
  constructor(
    private readonly portal: PortalApplicationContext,
    private readonly appPath: string,
    private readonly roots: { readonly views: readonly string[]; readonly assets: readonly string[] },
    private readonly options: PortalPageOptions,
    private readonly assetCache: import('../../http/brandingDeliveryCache').BrandingDeliveryCache
  ) {}
  get noCache() {
    return this.portal.config.page.noCache;
  }
  async initialize() {
    this.artifacts = new PageArtifacts(
      [...(this.options.viewRoots ?? []), ...this.roots.views, path.resolve(this.appPath, 'views')],
      [
        ...(this.options.assetRoots ?? [path.resolve(this.appPath, '.tmp/public')]),
        ...this.roots.assets,
        path.resolve(this.appPath, 'assets'),
      ]
    );
    await this.artifacts.initialize();
    this.rendering = portalPageRenderingInput(this.portal, this.artifacts);
    const { data, config, owner, log } = this.portal;
    const ref = data.reference;
    this.logos = new Logos.BrandingLogo({
      repository: getBrandingRepository(owner),
      disk: () => data.disks.get().primaryDisk(),
      legacyDatabase: () => mongoDatabase(owner, 'mongodb'),
      sanitize: (...args) => ref.sanitizer.get().sanitize(...args),
      config: config.branding,
      log,
    });
    this.delivery = new BrandingDelivery({
      cache: this.assetCache,
      repository: () => getBrandingRepository(owner),
      branding: ref.branding.get(),
      theme: ref.theme,
      typeface: ref.typeface.get(),
      logos: this.logos,
      log,
      staticAssets: config.static_assets,
      apiConfiguration: config,
      sendAsset: async (response, name) => {
        const file = this.artifacts.find(this.artifacts.assets, name);
        if (!file) return response.status(404).end();
        // Native response carries only the declared file operation, never paths to callers.
        return response.file!(file);
      },
    });
    this.dynamic = {
      artifacts: this.artifacts,
      config: { ...config, appUrl: new URL(config.server.publicUrl).origin },
      defaultBrand: config.auth.defaultBrand,
      defaultPortal: config.auth.defaultPortal,
      forms: ref.forms.get(),
      dashboards: ref.dashboards.get(),
      reports: ref.reports.get(),
      templates: new Templates.Template(log),
      loadRecord: this.rendering.loadRecord,
      canCreate: this.rendering.canCreate,
    };
  }
  quiesce() {
    this.logos?.quiesce();
  }
  async close() {
    await this.logos?.close();
    await this.artifacts?.close();
  }
}

/** Preserve lazy domain getters while binding an optional browser surface. */
export function combineBrowserInput<T extends object>(
  input: T,
  browser: import('../../http/controllers/BrowserControllers').BrowserPageBinding
): T & { readonly browser: import('../../http/controllers/BrowserControllers').BrowserPageBinding } {
  return Object.defineProperties({ browser }, Object.getOwnPropertyDescriptors(input)) as T & {
    readonly browser: import('../../http/controllers/BrowserControllers').BrowserPageBinding;
  };
}
