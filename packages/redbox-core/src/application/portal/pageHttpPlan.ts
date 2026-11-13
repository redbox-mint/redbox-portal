import path from 'node:path';
import type { ApplicationModule } from '../Application';
import type { PortalApplicationContext } from './application';
import { PageArtifacts } from '../../pages/Artifacts';
import type { PageRenderingInput } from '../../pages/rendering';

export interface PortalPageOptions {
  readonly viewRoots?: readonly string[];
  readonly assetRoots?: readonly string[];
}
/** Shared production operations; getters borrow the initialized reference domain. */
export function portalPageRenderingInput(
  portal: PortalApplicationContext,
  artifacts: PageArtifacts
): PageRenderingInput {
  const { data, config, log } = portal;
  const ref = data.reference;
  const origin = new URL(config.server.publicUrl).origin;
  return {
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
  rendering!: PageRenderingInput;
  constructor(
    private readonly portal: PortalApplicationContext,
    private readonly appPath: string,
    private readonly roots: { readonly views: readonly string[]; readonly assets: readonly string[] },
    private readonly options: PortalPageOptions
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
  }
  async close() {
    await this.artifacts?.close();
  }
}
