import { Controllers as controllers } from '../CoreController';
import * as BrandingServiceModule from '../services/BrandingService';
import * as BrandingLogoServiceModule from '../services/BrandingLogoService';
import * as BrandingThemeCssServiceModule from '../services/BrandingThemeCssService';
import * as crypto from 'crypto';
const CleanCSS = require('clean-css');
import { buildMergedApiBlueprint, buildMergedApiOpenApiDocument } from '../api-routes';

const yaml: { dump: (value: unknown, options?: { lineWidth?: number }) => string } = require('js-yaml');

// sails is declared globally via sails.ts; BrandingConfig is declared globally via waterline-models/BrandingConfig.ts
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;
declare const BrandingThemeCssService: BrandingThemeCssServiceModule.Services.BrandingThemeCss;

export namespace Controllers {

  export class Branding extends controllers.Core.Controller {
    private static readonly CSS_CACHE_MAX_SIZE = 100;
    private static readonly CSS_CACHE_TTL_MS = 5 * 60 * 1000;
    private readonly cssMinifier = new CleanCSS({
      level: {
        1: { all: true },
        2: { all: false }
      }
    });
    private readonly cssResponseCache = new Map<string, { css: string; etag: string; createdAt: number }>();

    /**
     * Generate a weak ETag for the given content hash or string.
     * @param hashOrContent - Either a pre-computed hash string or content to hash
     * @param prefix - Optional prefix for the ETag (e.g., 'logo-', 'preview-')
     * @returns ETag string in format 'W/"[prefix]hash"'
     */
    private generateETag(hashOrContent: string, prefix: string = ''): string {
      let hash: string;
      // If it looks like a hex hash (lowercase hex chars), use it directly
      if (/^[a-f0-9]+$/.test(hashOrContent)) {
        hash = hashOrContent;
      } else {
        // Otherwise compute SHA256 hash of the content
        hash = crypto.createHash('sha256').update(hashOrContent).digest('hex');
      }
      return `W/"${prefix}${hash}"`;
    }

    private minifyCss(css: string): string {
      const result = this.cssMinifier.minify(css);
      if (result.errors && result.errors.length > 0) {
        throw new Error(`CSS minification failed: ${result.errors.join('; ')}`);
      }
      return result.styles;
    }

    private getCssCacheControlHeader(): string {
      // theme.css URL is not content-versioned, so avoid immutable year-long caching.
      return 'public, max-age=300, must-revalidate';
    }

    private getCachedCssResponse(cacheKey: string): { css: string; etag: string } | undefined {
      const entry = this.cssResponseCache.get(cacheKey);
      if (!entry) {
        return undefined;
      }

      if ((Date.now() - entry.createdAt) > Branding.CSS_CACHE_TTL_MS) {
        this.cssResponseCache.delete(cacheKey);
        return undefined;
      }

      // Mark as most-recently-used.
      this.cssResponseCache.delete(cacheKey);
      this.cssResponseCache.set(cacheKey, entry);
      return { css: entry.css, etag: entry.etag };
    }

    private setCachedCssResponse(cacheKey: string, css: string, etag: string): void {
      this.cssResponseCache.set(cacheKey, { css, etag, createdAt: Date.now() });

      while (this.cssResponseCache.size > Branding.CSS_CACHE_MAX_SIZE) {
        const lruKey = this.cssResponseCache.keys().next().value;
        if (!lruKey) {
          break;
        }
        this.cssResponseCache.delete(lruKey);
      }
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'init',
      'renderCss',
      'renderImage',
      'renderApiB',
      'renderSwaggerJSON',
      'renderSwaggerYAML',
      'renderPreviewCss',
      'createPreview'
    ];

    public init() {
      return;
    }

    /**
     * Checks the mongodb for configured CSS for the branding
     * If none is present, it returns the default empty CSS.
     *
     * @param req
     * @param res
     */
    public async renderCss(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = req.param('branding');
        const brand = await BrandingConfig.findOne({ name: branding });
        res.set('Content-Type', 'text/css');
        // If brand (or css) not present, serve generated default variable CSS
        if (!brand || !brand.css) {
          const { css, hash } = BrandingThemeCssService.generate({});
          const defaultCssCacheKey = `default:${hash}`;
          let cachedDefaultCss = this.getCachedCssResponse(defaultCssCacheKey);
          if (!cachedDefaultCss) {
            const minifiedCss = this.minifyCss(css);
            const etag = this.generateETag(hash);
            this.setCachedCssResponse(defaultCssCacheKey, minifiedCss, etag);
            cachedDefaultCss = { css: minifiedCss, etag };
          }
          const { css: minifiedCss, etag } = cachedDefaultCss;
          res.set('ETag', etag);
          if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
          }
          res.set('Cache-Control', this.getCssCacheControlHeader());
          res.removeHeader('Pragma');
          res.set('Expires', new Date(Date.now() + 300 * 1000).toUTCString());
          return res.send(minifiedCss);
        }
        const sourceHash = crypto.createHash('sha256').update(brand.css).digest('hex');
        const brandCssCacheKey = `brand:${brand.id}:${brand.hash || ''}:${sourceHash}`;
        let cachedBrandCss = this.getCachedCssResponse(brandCssCacheKey);
        if (!cachedBrandCss) {
          const minifiedCss = this.minifyCss(brand.css);
          const minifiedHash = crypto.createHash('sha256').update(minifiedCss).digest('hex').substring(0, 32);
          const hasValidStoredHash = Boolean(brand.hash && /^[a-f0-9]+$/.test(brand.hash) && brand.hash === minifiedHash);
          const safeHash = hasValidStoredHash ? brand.hash! : minifiedHash;

          if (!hasValidStoredHash && brand.id) {
            try {
              await BrandingConfig.update({ id: brand.id }, { hash: safeHash });
            } catch (updateError) {
              sails.log.warn('Failed to persist corrected branding hash:', updateError);
            }
          }

          const etag = this.generateETag(safeHash);
          this.setCachedCssResponse(brandCssCacheKey, minifiedCss, etag);
          cachedBrandCss = { css: minifiedCss, etag };
        }

        const { css: minifiedCss } = cachedBrandCss;
        const { etag } = cachedBrandCss;
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }
        res.set('Cache-Control', this.getCssCacheControlHeader());
        res.removeHeader('Pragma');
        res.set('Expires', new Date(Date.now() + 300 * 1000).toUTCString());
        return res.send(minifiedCss);
      } catch (e) {
        sails.log.error('Error serving CSS:', e);
        return res.status(500).send('/* error serving theme */');
      }
    }

    /** Serve temporary preview CSS using BrandingService preview token (/:branding/:portal/preview/:token.css) */
    public async renderPreviewCss(req: Sails.Req, res: Sails.Res) {
      try {
        let token = req.param('token');
        if (!token) {
          const tokenCss = req.param('tokenCss');
          if (tokenCss) {
            token = tokenCss.replace(/\.css$/, '');
          }
        }
        if (!token) {
          return res.status(404).send('/* preview token missing */');
        }

        // Validate token format (e.g., alphanumeric, reasonable length)
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(token)) {
          return res.status(400).send('/* invalid preview token */');
        }

        const data = await BrandingService.fetchPreview(token);
        res.set('Content-Type', 'text/css');
        res.set('Cache-Control', 'no-cache, no-store');
        // Short weak etag for preview hash
        const hash = data.hash || crypto.createHash('sha256').update(data.css).digest('hex');
        const etag = this.generateETag(hash, 'preview-');
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        return res.send(data.css);
      } catch (_e) {
        return res.status(404).send('/* preview not found */');
      }
    }

    /** Create a preview token (JSON) */
    public async createPreview(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = req.param('branding');
        const portal = req.param('portal');
        const result = await BrandingService.preview(branding, portal);
        return res.json(result);
      } catch (e: unknown) {
        return res.status(500).json({ error: 'preview-error', message: (e as Error).message });
      }
    }

    /**
     *
     * Renders the API Blueprint spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderApiB(req: Sails.Req, res: Sails.Res) {
      res.contentType('text/plain');
      return res.send(
        buildMergedApiBlueprint({
          branding: req.param('branding') as string | undefined,
          portal: req.param('portal') as string | undefined,
        })
      );
    }


    /**
     *
     * Renders the Swagger JSON spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderSwaggerJSON(req: Sails.Req, res: Sails.Res) {
      res.contentType('application/json');
      return res.send(
        JSON.stringify(
          buildMergedApiOpenApiDocument({
            branding: req.param('branding') as string | undefined,
            portal: req.param('portal') as string | undefined,
          }),
          null,
          2
        )
      );
    }

    /**
     *
     * Renders the Swagger JSON spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderSwaggerYAML(req: Sails.Req, res: Sails.Res) {
      res.contentType('application/x-yaml');
      return res.send(
        yaml.dump(
          buildMergedApiOpenApiDocument({
            branding: req.param('branding') as string | undefined,
            portal: req.param('portal') as string | undefined,
          }),
          { lineWidth: -1 }
        )
      );
    }

    /**
     * Checks the mongodb for configured CSS for the branding
     * If none is present, it returns the default empty CSS.
     *
     * @param req
     * @param res
     */
    public async renderImage(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = req.param('branding');
        const brand = await BrandingConfig.findOne({ name: branding });
        const logo = brand?.logo as Record<string, unknown> | undefined;
        const storageId = typeof logo?.storageKey === 'string'
          ? logo.storageKey
          : typeof logo?.gridFsId === 'string'
            ? logo.gridFsId
            : null;
        if (!brand || !logo || !storageId) {
          // fallback to static
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(`${sails.config.appPath}/assets/images/${sails.config.static_assets.logoName}`);
        }
        const buf = await BrandingLogoService.getBinaryAsync(storageId);

        if (!buf) {
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
        }
        res.contentType((logo.contentType as string) || sails.config.static_assets.imageType);
        const etagSeed = typeof logo.sha256 === 'string'
          ? logo.sha256
          : crypto.createHash('sha256').update(buf).digest('hex');
        const etag = this.generateETag(etagSeed, 'logo-');
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(buf);
      } catch (_e) {
        res.contentType(sails.config.static_assets.imageType);
        return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
      }
    }
  }
}
