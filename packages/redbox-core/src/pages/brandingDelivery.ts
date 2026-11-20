import type { FastifyRequest, FastifyReply } from 'fastify';
import { sendAssetBytes, assetMediaType } from '../http/fastify/assets';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { BrandingRepository } from '../persistence/branding/BrandingRepository';
import type { Services as Branding } from '../branding/Branding';
import type { Services as Logos } from '../branding/BrandingLogo';
import type { Services as Typeface } from '../branding/BrandingTypeface';
import type { Services as Theme } from '../branding/BrandingThemeCss';
import type { StaticAssetsConfig } from '../config/static_assets.config';
import * as crypto from 'node:crypto';
import { buildMergedApiBlueprint, buildMergedApiOpenApiDocument } from '../api-routes';
import { BrandingDeliveryCache } from '../http/brandingDeliveryCache';
const CleanCSS = require('clean-css');
const yaml = require('js-yaml');
const parameter = (req: FastifyRequest, name: string): string | undefined => {
  const value =
    (req.params as Record<string, unknown>)?.[name] ??
    (req.body as Record<string, unknown>)?.[name] ??
    (req.query as Record<string, unknown>)?.[name];
  return typeof value === 'string' ? value : undefined;
};
export interface BrandingDeliveryInput {
  cache?: BrandingDeliveryCache;
  apiConfiguration?: import('../api-routes').ApiRouteConfiguration;
  repository(): Pick<BrandingRepository, 'getBrand'>;
  theme: Pick<Theme.BrandingThemeCss, 'generate'>;
  typeface: Pick<Typeface.BrandingTypeface, 'readFace'>;
  logos: Pick<Logos.BrandingLogo, 'getBinaryAsync' | 'getCurrentFaviconBinary'>;
  branding: Pick<Branding.Branding, 'fetchPreview'>;
  log: ILogger;
  staticAssets: StaticAssetsConfig;
  sendAsset(req: FastifyRequest, res: FastifyReply, name: string): unknown;
}
export class BrandingDelivery {
  constructor(private readonly input: BrandingDeliveryInput) {
    this.cache = input.cache ?? new BrandingDeliveryCache();
  }
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
  private readonly cache: BrandingDeliveryCache;
  private get cssResponseCache() {
    return this.cache.cssResponseCache;
  }
  private get fontResponseCache() {
    return this.cache.fontResponseCache;
  }
  private get fontResponseCacheBytes() {
    return this.cache.fontResponseCacheBytes;
  }
  private set fontResponseCacheBytes(value: number) {
    this.cache.fontResponseCacheBytes = value;
  }

  public invalidate(): void {
    this.cache.invalidate();
  }

  /**
   * Generate a weak ETag for the given content hash or string.
   * @param hashOrContent - Either a pre-computed hash string or content to hash
   * @param prefix - Optional prefix for the ETag (e.g., 'logo-', 'preview-')
   * @returns ETag string in format 'W/"[prefix]hash"'
   */
  private generateETag(hashOrContent: string, prefix: string = ''): string {
    const hash = /^[a-f0-9]+$/.test(hashOrContent)
      ? hashOrContent
      : crypto.createHash('sha256').update(hashOrContent).digest('hex');
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
  private requestMatchesPublicationHash(req: FastifyRequest, brand: { hash?: unknown } | null): boolean {
    const version = parameter(req, 'v');
    return Boolean(version) && version === brand?.hash;
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

  public async renderCss(req: FastifyRequest, res: FastifyReply) {
    try {
      const branding = parameter(req, 'branding');
      const brand = await this.input.repository().getBrand({ name: branding ?? '' });
      assetMediaType(res, 'text/css');
      const defaultCss = !brand || !brand.css ? this.input.theme.generate({}) : undefined;
      const sourceCss = defaultCss ? defaultCss.css : brand!.css!;
      const cacheKey = defaultCss
        ? `default:${defaultCss.hash}`
        : `brand:${brand!.id}:${brand!.hash || ''}:${crypto.createHash('sha256').update(sourceCss).digest('hex')}`;
      let cached = this.getCachedCssResponse(cacheKey);
      if (!cached) {
        const css = this.minifyCss(sourceCss);
        // Publication state is never rewritten; branded ETags describe the served bytes.
        const etag = this.generateETag(
          defaultCss ? defaultCss.hash : crypto.createHash('sha256').update(css).digest('hex')
        );
        this.setCachedCssResponse(cacheKey, css, etag);
        cached = { css, etag };
      }
      const { css: minifiedCss, etag } = cached;
      res.header('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        return res.code(304).send();
      }
      const immutable = !defaultCss && this.requestMatchesPublicationHash(req, brand);
      res.header(
        'Cache-Control',
        immutable ? this.getVersionedCssCacheControlHeader() : this.getCssCacheControlHeader()
      );
      res.removeHeader('Pragma');
      res.header('Expires', new Date(Date.now() + (immutable ? 31536000 : 300) * 1000).toUTCString());
      return sendAssetBytes(req, res, minifiedCss);
    } catch {
      this.input.log.error('Error serving CSS');
      return sendAssetBytes(req, res.code(500), '/* error serving theme */');
    }
  }

  public async renderPreviewCss(req: FastifyRequest, res: FastifyReply) {
    try {
      const token = parameter(req, 'token');
      if (!token) {
        return sendAssetBytes(req, res.code(404), '/* preview token missing */');
      }

      // Validate token format (e.g., alphanumeric, reasonable length)
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(token)) {
        return sendAssetBytes(req, res.code(400), '/* invalid preview token */');
      }

      const data = await this.input.branding.fetchPreview(token);
      assetMediaType(res, 'text/css');
      res.header('Cache-Control', 'no-cache, no-store');
      // Short weak etag for preview hash
      const hash = data.hash || crypto.createHash('sha256').update(data.css).digest('hex');
      const etag = this.generateETag(hash, 'preview-');
      res.header('ETag', etag);
      if (req.headers['if-none-match'] === etag) return res.code(304).send();
      return sendAssetBytes(req, res, data.css);
    } catch (_e) {
      return sendAssetBytes(req, res.code(404), '/* preview not found */');
    }
  }

  public async renderFont(req: FastifyRequest, res: FastifyReply) {
    const notFound = () => {
      res.header('Cache-Control', 'no-store');
      res.removeHeader('ETag');
      res.removeHeader('Content-Length');
      res.header('Content-Type', 'text/plain');
      return sendAssetBytes(req, res.code(404), '/* font not found */');
    };
    try {
      const branding = parameter(req, 'branding');
      const sha256 = (parameter(req, 'sha256') ?? '').replace(/\.woff2$/i, '');
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
      res.header('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        return res.code(304).send();
      }
      res.header('Content-Type', 'font/woff2');
      res.header('Cache-Control', 'public, max-age=31536000, immutable');
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('Content-Length', String(buf.length));
      if (req.method === 'HEAD') {
        return res.code(200).send();
      }
      return sendAssetBytes(req, res, buf);
    } catch {
      this.input.log.error('Error serving font');
      return notFound();
    }
  }

  public renderApiB(req: FastifyRequest, res: FastifyReply) {
    assetMediaType(res, 'text/plain');
    return sendAssetBytes(
      req,
      res,
      buildMergedApiBlueprint(
        {
          branding: parameter(req, 'branding') as string | undefined,
          portal: parameter(req, 'portal') as string | undefined,
        },
        this.input.apiConfiguration
      )
    );
  }

  public renderSwaggerJSON(req: FastifyRequest, res: FastifyReply) {
    assetMediaType(res, 'application/json');
    return sendAssetBytes(
      req,
      res,
      JSON.stringify(
        buildMergedApiOpenApiDocument(
          {
            branding: parameter(req, 'branding') as string | undefined,
            portal: parameter(req, 'portal') as string | undefined,
          },
          this.input.apiConfiguration
        ),
        null,
        2
      )
    );
  }

  public renderSwaggerYAML(req: FastifyRequest, res: FastifyReply) {
    assetMediaType(res, 'application/x-yaml');
    return sendAssetBytes(
      req,
      res,
      yaml.dump(
        buildMergedApiOpenApiDocument(
          {
            branding: parameter(req, 'branding') as string | undefined,
            portal: parameter(req, 'portal') as string | undefined,
          },
          this.input.apiConfiguration
        ),
        { lineWidth: -1 }
      )
    );
  }

  public async renderImage(req: FastifyRequest, res: FastifyReply) {
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
        assetMediaType(res, this.input.staticAssets.imageType);
        return this.input.sendAsset(req, res, 'images/' + this.input.staticAssets.logoName);
      }
      const expectedSha256 = typeof logo.sha256 === 'string' ? logo.sha256 : undefined;
      const buf = await this.input.logos.getBinaryAsync(storageId, expectedSha256);

      if (!buf) {
        assetMediaType(res, this.input.staticAssets.imageType);
        return this.input.sendAsset(req, res, 'images/' + this.input.staticAssets.logoName);
      }
      assetMediaType(res, (logo.contentType as string) || this.input.staticAssets.imageType);
      const etagSeed = expectedSha256 ? expectedSha256 : crypto.createHash('sha256').update(buf).digest('hex');
      const etag = this.generateETag(etagSeed, 'logo-');
      res.header('ETag', etag);
      if (req.headers['if-none-match'] === etag) return res.code(304).send();
      res.header('Cache-Control', 'public, max-age=3600');
      return sendAssetBytes(req, res, buf);
    } catch (_e) {
      assetMediaType(res, this.input.staticAssets.imageType);
      return this.input.sendAsset(req, res, 'images/' + this.input.staticAssets.logoName);
    }
  }

  public async renderFavicon(req: FastifyRequest, res: FastifyReply) {
    const sendDefault = () => {
      assetMediaType(res, this.input.staticAssets.faviconType);
      res.header('Cache-Control', 'public, no-cache');
      return this.input.sendAsset(req, res, this.input.staticAssets.faviconName);
    };
    try {
      const branding = parameter(req, 'branding');
      const resolved = await this.input.logos.getCurrentFaviconBinary(branding ?? '');
      if (!resolved) {
        return sendDefault();
      }
      const { buffer: buf, favicon } = resolved;
      const expectedSha256 = typeof favicon.sha256 === 'string' ? favicon.sha256 : undefined;
      assetMediaType(res, (favicon.contentType as string) || 'image/png');
      const etagSeed = expectedSha256 ? expectedSha256 : crypto.createHash('sha256').update(buf).digest('hex');
      const etag = this.generateETag(etagSeed, 'favicon-');
      res.header('ETag', etag);
      res.header('Cache-Control', 'public, no-cache');
      if (req.headers['if-none-match'] === etag) return res.code(304).send();
      return sendAssetBytes(req, res, buf);
    } catch (_e) {
      return sendDefault();
    }
  }
}
