import { Controllers as controllers } from '../CoreController';
import * as BrandingServiceModule from '../services/BrandingService';
import * as BrandingLogoServiceModule from '../services/BrandingLogoService';
import * as BrandingThemeCssServiceModule from '../services/BrandingThemeCssService';
import * as crypto from 'crypto';
const CleanCSS = require('clean-css');
import { buildMergedApiBlueprint, buildMergedApiOpenApiDocument } from '../api-routes';
import { mapBrandingError } from './BrandingControllerSupport';

const yaml: { dump: (value: unknown, options?: { lineWidth?: number }) => string } = require('js-yaml');

// sails is declared globally via sails.ts; BrandingConfig is declared globally via waterline-models/BrandingConfig.ts
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;
declare const BrandingThemeCssService: BrandingThemeCssServiceModule.Services.BrandingThemeCss;

export namespace Controllers {
  export class Branding extends controllers.Core.Controller {
    private static readonly CSS_CACHE_MAX_SIZE = 100;
    private static readonly CSS_CACHE_TTL_MS = 5 * 60 * 1000;
    /** Verified face bytes are immutable and content-addressed, so no TTL is needed. */
    private static readonly FONT_CACHE_MAX_SIZE = 32;
    private static readonly FONT_CACHE_MAX_BYTES = 16 * 1024 * 1024;
    private readonly cssMinifier = new CleanCSS({
      level: {
        1: { all: true },
        2: { all: false },
      },
    });
    private readonly cssResponseCache = new Map<string, { css: string; etag: string; createdAt: number }>();
    private readonly fontResponseCache = new Map<string, Buffer>();
    private fontResponseCacheBytes = 0;

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

    private getVersionedCssCacheControlHeader(): string {
      // Used only when the request carries the current publication hash (?v=):
      // the URL changes on every publish, so the response is immutable.
      return 'public, max-age=31536000, immutable';
    }

    /**
     * True when the request pins the current publication hash (?v=<hash>).
     * Layouts emit this form so a republish (new hash, new URL) applies
     * immediately instead of waiting out the unversioned browser cache.
     */
    private requestMatchesPublicationHash(req: Sails.Req, brand: { hash?: unknown } | null): boolean {
      const version = req.param('v');
      return (
        typeof version === 'string' &&
        version.length > 0 &&
        brand != null &&
        typeof brand.hash === 'string' &&
        brand.hash.length > 0 &&
        version === brand.hash
      );
    }

    private getCachedCssResponse(cacheKey: string): { css: string; etag: string } | undefined {
      const entry = this.cssResponseCache.get(cacheKey);
      if (!entry) {
        return undefined;
      }

      if (Date.now() - entry.createdAt > Branding.CSS_CACHE_TTL_MS) {
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

    private getCachedFontResponse(cacheKey: string): Buffer | undefined {
      const entry = this.fontResponseCache.get(cacheKey);
      if (!entry) {
        return undefined;
      }
      // Mark as most-recently-used.
      this.fontResponseCache.delete(cacheKey);
      this.fontResponseCache.set(cacheKey, entry);
      return entry;
    }

    private setCachedFontResponse(cacheKey: string, buf: Buffer): void {
      if (buf.length > Branding.FONT_CACHE_MAX_BYTES) return;
      const previous = this.fontResponseCache.get(cacheKey);
      this.fontResponseCacheBytes -= previous?.length ?? 0;
      this.fontResponseCache.delete(cacheKey);
      this.fontResponseCache.set(cacheKey, buf);
      this.fontResponseCacheBytes += buf.length;
      while (
        this.fontResponseCache.size > Branding.FONT_CACHE_MAX_SIZE ||
        this.fontResponseCacheBytes > Branding.FONT_CACHE_MAX_BYTES
      ) {
        const oldest = this.fontResponseCache.entries().next().value;
        if (!oldest) break;
        this.fontResponseCacheBytes -= oldest[1].length;
        this.fontResponseCache.delete(oldest[0]);
      }
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'init',
      'renderCss',
      'renderFont',
      'renderImage',
      'renderFavicon',
      'renderApiB',
      'renderSwaggerJSON',
      'renderSwaggerYAML',
      'renderPreviewCss',
      'createPreview',
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
          // The publication hash is authoritative state: a GET must never rewrite
          // it. The response ETag is derived from the exact served bytes instead.
          const etag = this.generateETag(crypto.createHash('sha256').update(minifiedCss).digest('hex'));
          this.setCachedCssResponse(brandCssCacheKey, minifiedCss, etag);
          cachedBrandCss = { css: minifiedCss, etag };
        }

        const { css: minifiedCss } = cachedBrandCss;
        const { etag } = cachedBrandCss;
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }
        const immutable = this.requestMatchesPublicationHash(req, brand);
        res.set(
          'Cache-Control',
          immutable ? this.getVersionedCssCacheControlHeader() : this.getCssCacheControlHeader()
        );
        res.removeHeader('Pragma');
        res.set('Expires', new Date(Date.now() + (immutable ? 31536000 : 300) * 1000).toUTCString());
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

    /** Create a preview token (JSON) for a caller-supplied draft revision (legacy public surface) */
    public async createPreview(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = req.param('branding');
        const portal = req.param('portal');
        const brand = await BrandingConfig.findOne({ name: branding });
        if (!brand) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ code: 'branding-not-found', detail: 'branding-not-found' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        // The caller may bind the preview to its own draft revision; a concurrent
        // draft change surfaces as 409 instead of previewing a torn state. Keep
        // the legacy no-body form working by binding it to the revision read
        // above before the service re-checks the brand.
        const body = (req.body ?? {}) as Record<string, unknown>;
        const expectedDraftRevision =
          body.expectedDraftRevision === undefined
            ? typeof brand.draftRevision === 'number'
              ? brand.draftRevision
              : 0
            : (body.expectedDraftRevision as number | undefined);
        const result = await BrandingService.preview(
          branding,
          portal,
          expectedDraftRevision
        );
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (e: unknown) {
        const mapped = mapBrandingError(e);
        return this.sendResp(req, res, {
          status: mapped.status,
          displayErrors: [{ code: mapped.code, detail: mapped.detail }],
          ...(mapped.current ? { data: { current: mapped.current } } : {}),
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    /**
     * Serves one immutable Brand Typeface face by exact brand name and content hash
     * (GET|HEAD /fonts/branding/:branding/:sha256.woff2).
     *
     * Portal-independent and sessionless so every portal under a brand shares the
     * browser cache. Missing brands/objects and hash mismatches are 404 without
     * substituting another font; corruption is logged server-side.
     */
    public async renderFont(req: Sails.Req, res: Sails.Res) {
      const notFound = () => {
        res.set('Cache-Control', 'no-store');
        res.removeHeader('ETag');
        res.removeHeader('Content-Length');
        res.set('Content-Type', 'text/plain');
        return res.status(404).send('/* font not found */');
      };
      try {
        const branding = req.param('branding');
        // Sails may expose the suffixed route param under a mangled name
        // (e.g. `sha256Woff2` for `:sha256.woff2`); accept any `sha256*` param.
        const routeParams = ((req as unknown as { params?: Record<string, unknown> }).params ?? {}) as Record<
          string,
          unknown
        >;
        const rawParam =
          req.param('sha256') ??
          Object.entries(routeParams).find(([key]) => key.toLowerCase().startsWith('sha256'))?.[1];
        const sha256 = String(rawParam ?? '').replace(/\.woff2$/i, '');
        if (!branding || !/^[0-9a-f]{64}$/.test(sha256)) {
          return notFound();
        }
        // The ETag is the content hash itself, but conditional requests must
        // only short-circuit after the brand and requested face have been
        // validated. Otherwise a valid caller-supplied hash could turn a
        // missing brand or object into a false 304 response.
        const etag = `"${sha256}"`;
        const brand = await BrandingConfig.findOne({ name: branding });
        if (!brand) {
          return notFound();
        }
        // Faces are immutable and keyed by their own hash: serve verified
        // bytes from a small bounded cache instead of re-reading and
        // re-hashing the whole face on every request.
        const cacheKey = `font:${String(brand.id)}:${sha256}`;
        let buf = this.getCachedFontResponse(cacheKey);
        if (!buf) {
          try {
            buf = await BrandingTypefaceService.readFace(String(brand.id), sha256);
          } catch (readError) {
            if ((readError as { code?: string })?.code === 'typeface-corrupt') {
              sails.log.error(`BrandingController corrupt font object for brand ${branding} face ${sha256}`);
            }
            return notFound();
          }
          this.setCachedFontResponse(cacheKey, buf);
        }
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }
        res.set('Content-Type', 'font/woff2');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Length', String(buf.length));
        if (req.method === 'HEAD') {
          return res.status(200).end();
        }
        return res.send(buf);
      } catch (e) {
        sails.log.error('Error serving font:', e);
        return notFound();
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
        const storageId =
          typeof logo?.storageKey === 'string'
            ? logo.storageKey
            : typeof logo?.gridFsId === 'string'
              ? logo.gridFsId
              : null;
        if (!brand || !logo || !storageId) {
          // fallback to static
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(`${sails.config.appPath}/assets/images/${sails.config.static_assets.logoName}`);
        }
        const expectedSha256 = typeof logo.sha256 === 'string' ? logo.sha256 : undefined;
        const buf = await BrandingLogoService.getBinaryAsync(storageId, expectedSha256);

        if (!buf) {
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
        }
        res.contentType((logo.contentType as string) || sails.config.static_assets.imageType);
        const etagSeed = expectedSha256 ? expectedSha256 : crypto.createHash('sha256').update(buf).digest('hex');
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

    /**
     * Serves the per-brand favicon from storage, falling back to the static
     * default favicon when no custom favicon has been configured.
     *
     * @param req
     * @param res
     */
    public async renderFavicon(req: Sails.Req, res: Sails.Res) {
      const sendDefault = () => {
        res.contentType(sails.config.static_assets.faviconType);
        res.set('Cache-Control', 'public, no-cache');
        return res.sendFile(`${sails.config.appPath}/assets/${sails.config.static_assets.faviconName}`);
      };
      try {
        const branding = req.param('branding');
        const resolved = await BrandingLogoService.getCurrentFaviconBinary(branding);
        if (!resolved) {
          return sendDefault();
        }
        const { buffer: buf, favicon } = resolved;
        const expectedSha256 = typeof favicon.sha256 === 'string' ? favicon.sha256 : undefined;
        res.contentType((favicon.contentType as string) || 'image/png');
        const etagSeed = expectedSha256 ? expectedSha256 : crypto.createHash('sha256').update(buf).digest('hex');
        const etag = this.generateETag(etagSeed, 'favicon-');
        res.set('ETag', etag);
        res.set('Cache-Control', 'public, no-cache');
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        return res.send(buf);
      } catch (_e) {
        return sendDefault();
      }
    }
  }
}
