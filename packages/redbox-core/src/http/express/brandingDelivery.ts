import type { Response } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { BrandingRepository } from '../../persistence/branding/BrandingRepository';
import type { Services as Branding } from '../../branding/Branding';
import type { Services as Logos } from '../../branding/BrandingLogo';
import type { Services as Typeface } from '../../branding/BrandingTypeface';
import type { Services as Theme } from '../../branding/BrandingThemeCss';
import type { StaticAssetsConfig } from '../../config/static_assets.config';
import * as crypto from 'node:crypto';
import { buildMergedApiBlueprint, buildMergedApiOpenApiDocument } from '../../api-routes';
const CleanCSS = require('clean-css');
const yaml = require('js-yaml');
interface DeliveryRequest {
  method?: string;
  headers: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  param?(name: string): unknown;
}
const parameter = (req: DeliveryRequest, name: string): string | undefined => {
  const value = req.param ? req.param(name) : (req.params?.[name] ?? req.body?.[name] ?? req.query?.[name]);
  return typeof value === 'string' ? value : undefined;
};
export interface BrandingDeliveryInput {
  repository(): Pick<BrandingRepository, 'getBrand'>;
  theme: Pick<Theme.BrandingThemeCss, 'generate'>;
  typeface: Pick<Typeface.BrandingTypeface, 'readFace'>;
  logos: Pick<Logos.BrandingLogo, 'getBinaryAsync' | 'getCurrentFaviconBinary'>;
  branding: Pick<Branding.Branding, 'fetchPreview'>;
  log: ILogger;
  staticAssets: StaticAssetsConfig;
  sendAsset(res: Response, name: string): unknown;
}
export class BrandingDelivery {
  constructor(private readonly input: BrandingDeliveryInput) {}
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

  public invalidate(): void {
    this.cssResponseCache.clear();
    this.fontResponseCache.clear();
    this.fontResponseCacheBytes = 0;
  }

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
  private requestMatchesPublicationHash(req: DeliveryRequest, brand: { hash?: unknown } | null): boolean {
    const version = parameter(req, 'v');
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

    if (Date.now() - entry.createdAt > BrandingDelivery.CSS_CACHE_TTL_MS) {
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

    while (this.cssResponseCache.size > BrandingDelivery.CSS_CACHE_MAX_SIZE) {
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
    if (buf.length > BrandingDelivery.FONT_CACHE_MAX_BYTES) return;
    const previous = this.fontResponseCache.get(cacheKey);
    this.fontResponseCacheBytes -= previous?.length ?? 0;
    this.fontResponseCache.delete(cacheKey);
    this.fontResponseCache.set(cacheKey, buf);
    this.fontResponseCacheBytes += buf.length;
    while (
      this.fontResponseCache.size > BrandingDelivery.FONT_CACHE_MAX_SIZE ||
      this.fontResponseCacheBytes > BrandingDelivery.FONT_CACHE_MAX_BYTES
    ) {
      const oldest = this.fontResponseCache.entries().next().value;
      if (!oldest) break;
      this.fontResponseCacheBytes -= oldest[1].length;
      this.fontResponseCache.delete(oldest[0]);
    }
  }

  public async renderCss(req: DeliveryRequest, res: Response) {
    try {
      const branding = parameter(req, 'branding');
      const brand = await this.input.repository().getBrand({ name: branding ?? '' });
      res.set('Content-Type', 'text/css');
      // If brand (or css) not present, serve generated default variable CSS
      if (!brand || !brand.css) {
        const { css, hash } = this.input.theme.generate({});
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
      res.set('Cache-Control', immutable ? this.getVersionedCssCacheControlHeader() : this.getCssCacheControlHeader());
      res.removeHeader('Pragma');
      res.set('Expires', new Date(Date.now() + (immutable ? 31536000 : 300) * 1000).toUTCString());
      return res.send(minifiedCss);
    } catch (e) {
      this.input.log.error('Error serving CSS:', e);
      return res.status(500).send('/* error serving theme */');
    }
  }

  public async renderPreviewCss(req: DeliveryRequest, res: Response) {
    try {
      let token = parameter(req, 'token');
      if (!token) {
        const tokenCss = parameter(req, 'tokenCss');
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

      const data = await this.input.branding.fetchPreview(token);
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

  public async renderFont(req: DeliveryRequest, res: Response) {
    const notFound = () => {
      res.set('Cache-Control', 'no-store');
      res.removeHeader('ETag');
      res.removeHeader('Content-Length');
      res.set('Content-Type', 'text/plain');
      return res.status(404).send('/* font not found */');
    };
    try {
      const branding = parameter(req, 'branding');
      // Sails may expose the suffixed route param under a mangled name
      // (e.g. `sha256Woff2` for `:sha256.woff2`); accept any `sha256*` param.
      const routeParams = ((req as unknown as { params?: Record<string, unknown> }).params ?? {}) as Record<
        string,
        unknown
      >;
      const rawParam =
        parameter(req, 'sha256') ??
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
      const brand = await this.input.repository().getBrand({ name: branding ?? '' });
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
          buf = await this.input.typeface.readFace(String(brand.id), sha256);
        } catch (readError) {
          if ((readError as { code?: string })?.code === 'typeface-corrupt') {
            this.input.log.error(`BrandingController corrupt font object for brand ${branding} face ${sha256}`);
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
      this.input.log.error('Error serving font:', e);
      return notFound();
    }
  }

  public renderApiB(req: DeliveryRequest, res: Response) {
    res.contentType('text/plain');
    return res.send(
      buildMergedApiBlueprint({
        branding: parameter(req, 'branding') as string | undefined,
        portal: parameter(req, 'portal') as string | undefined,
      })
    );
  }

  public renderSwaggerJSON(req: DeliveryRequest, res: Response) {
    res.contentType('application/json');
    return res.send(
      JSON.stringify(
        buildMergedApiOpenApiDocument({
          branding: parameter(req, 'branding') as string | undefined,
          portal: parameter(req, 'portal') as string | undefined,
        }),
        null,
        2
      )
    );
  }

  public renderSwaggerYAML(req: DeliveryRequest, res: Response) {
    res.contentType('application/x-yaml');
    return res.send(
      yaml.dump(
        buildMergedApiOpenApiDocument({
          branding: parameter(req, 'branding') as string | undefined,
          portal: parameter(req, 'portal') as string | undefined,
        }),
        { lineWidth: -1 }
      )
    );
  }

  public async renderImage(req: DeliveryRequest, res: Response) {
    try {
      const branding = parameter(req, 'branding');
      const brand = await this.input.repository().getBrand({ name: branding ?? '' });
      const logo = brand?.logo as Record<string, unknown> | undefined;
      const storageId =
        typeof logo?.storageKey === 'string'
          ? logo.storageKey
          : typeof logo?.gridFsId === 'string'
            ? logo.gridFsId
            : null;
      if (!brand || !logo || !storageId) {
        // fallback to static
        res.contentType(this.input.staticAssets.imageType);
        return this.input.sendAsset(res, 'images/' + this.input.staticAssets.logoName);
      }
      const expectedSha256 = typeof logo.sha256 === 'string' ? logo.sha256 : undefined;
      const buf = await this.input.logos.getBinaryAsync(storageId, expectedSha256);

      if (!buf) {
        res.contentType(this.input.staticAssets.imageType);
        return this.input.sendAsset(res, 'images/' + this.input.staticAssets.logoName);
      }
      res.contentType((logo.contentType as string) || this.input.staticAssets.imageType);
      const etagSeed = expectedSha256 ? expectedSha256 : crypto.createHash('sha256').update(buf).digest('hex');
      const etag = this.generateETag(etagSeed, 'logo-');
      res.set('ETag', etag);
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(buf);
    } catch (_e) {
      res.contentType(this.input.staticAssets.imageType);
      return this.input.sendAsset(res, 'images/' + this.input.staticAssets.logoName);
    }
  }

  public async renderFavicon(req: DeliveryRequest, res: Response) {
    const sendDefault = () => {
      res.contentType(this.input.staticAssets.faviconType);
      res.set('Cache-Control', 'public, no-cache');
      return this.input.sendAsset(res, this.input.staticAssets.faviconName);
    };
    try {
      const branding = parameter(req, 'branding');
      const resolved = await this.input.logos.getCurrentFaviconBinary(branding ?? '');
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
