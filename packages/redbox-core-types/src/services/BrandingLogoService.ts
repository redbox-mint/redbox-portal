import { Services as coreServices } from '../CoreService';
import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import crypto from 'crypto';
import { GridFSBucket, Db } from 'mongodb';

/**
 * BrandingLogoService
 * - sanitizeAndValidate(fileBuf, contentType)
 * - putLogo({branding, portal, fileBuf, contentType}) -> GridFS path `${branding}/${portal}/images/logo.(ext)`
 */

declare const DomSanitizerService: {
  sanitize: (svg: string) => {
    safe: boolean;
    sanitized: string;
    errors: string[];
    warnings: string[];
    info: { originalBytes: number; sanitizedBytes: number };
  };
};
// Using skipper-gridfs adapter pattern like BrandingController
// We'll lazily require to avoid circular load issues.



export namespace Services {
  @PopulateExportedMethods
  export class BrandingLogo extends coreServices.Core.Service {

    /** Cached GridFS bucket to avoid repeated initialization. */
    private cachedBucket: GridFSBucket | null = null;

    /** In-memory placeholder storage keyed by gridFsId. */
    private _binaryById: Record<string, { buffer: Buffer; storedAt: number }> = {};

    private getCacheTtlMs(): number {
      const DEFAULT_LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
      // defaults to 1 day
      const configured = _.get(sails, 'config.branding.logoCacheTtlMs',  DEFAULT_LOGO_CACHE_TTL_MS);
      if (typeof configured === 'number' && configured > 0) {
        return configured;
      }
      return DEFAULT_LOGO_CACHE_TTL_MS;
    }

    private pruneExpiredEntries(now = Date.now()): void {
      const ttl = this.getCacheTtlMs();
      for (const [id, entry] of Object.entries(this._binaryById)) {
        if (now - entry.storedAt > ttl) {
          delete this._binaryById[id];
        }
      }
    }

    private setCache(id: string, buffer: Buffer): void {
      this._binaryById[id] = { buffer, storedAt: Date.now() };
      this.pruneExpiredEntries();
    }

    private getFromCache(id: string): Buffer | null {
      const entry = this._binaryById[id];
      if (!entry) return null;
      if (Date.now() - entry.storedAt > this.getCacheTtlMs()) {
        delete this._binaryById[id];
        return null;
      }
      return entry.buffer;
    }

    /** Lazily create a GridFS bucket using the configured 'mongodb' datastore. */
    private getBucket(): GridFSBucket | null {
      // Return cached bucket if already initialized
      if (this.cachedBucket) {
        return this.cachedBucket;
      }

      try {
        const ds = (sails as unknown as { getDatastore?: (name: string) => { manager?: Db } | null })
          .getDatastore?.('mongodb') ?? null;
        const db: Db | undefined = ds?.manager; // sails-mongo exposes native Db as manager
        if (!db) return null;
        
        // Create and cache the bucket for subsequent calls
        this.cachedBucket = new GridFSBucket(db, { bucketName: 'fs' });
        return this.cachedBucket;
      } catch (_e) {
        return null;
      }
    }

    getMaxBytes(): number {
      return _.get(sails, 'config.branding.logoMaxBytes', 512 * 1024);
    }

    allowedContentTypes = new Set([
      'image/png',
      'image/jpeg',
      'image/svg+xml'
    ]);

    /** Basic SVG detection */
    isSvg(buf: Buffer, ct: string): boolean {
      if (ct === 'image/svg+xml') return true;
      const str = buf.toString('utf8', 0, 200).toLowerCase();
      return /<svg[\s>]/.test(str);
    }

    async sanitizeAndValidate(fileBuf: Buffer, contentType: string): Promise<{ ok: boolean; sha256?: string; sanitizedBuffer?: Buffer; errors?: string[]; warnings?: string[]; finalContentType?: string; }> {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!fileBuf || !Buffer.isBuffer(fileBuf)) {
        errors.push('empty');
        return { ok: false, errors, warnings };
      }

      if (!fileBuf || !Buffer.isBuffer(fileBuf) || fileBuf.length === 0) {
        errors.push('empty');
        return { ok: false, errors, warnings };
      }
      
      if (!this.allowedContentTypes.has(contentType)) {
        errors.push('unsupported-type');
      }
      const max = this.getMaxBytes();
      if (fileBuf.length > max) {
        errors.push('too-large');
      }

      if (errors.length) {
        return { ok: false, errors, warnings };
      }

      let outBuffer = fileBuf;
      let finalCt = contentType;
      if (this.isSvg(fileBuf, contentType)) {
        // Sanitize SVG using existing service
        const svg = fileBuf.toString('utf8');
        const result = await DomSanitizerService.sanitize(svg);
        if (!result.safe) {
          errors.push(...result.errors.map((e: string) => 'svg-' + e));
        }
        warnings.push(...result.warnings.map((w: string) => 'svg-' + w));
        outBuffer = Buffer.from(result.sanitized, 'utf8');
        finalCt = 'image/svg+xml';
      }
      if (errors.length) {
        return { ok: false, errors, warnings };
      }
      const sha256 = crypto.createHash('sha256').update(outBuffer).digest('hex');
      return { ok: true, sha256, sanitizedBuffer: outBuffer, warnings, finalContentType: finalCt };
    }

    /** Write logo to storage (GridFS) and update BrandingConfig.logo metadata */
    async putLogo(opts: { branding: string; portal: string; fileBuffer: Buffer; contentType: string; }): Promise<{
      hash: string;
      gridFsId: string;
      contentType: string;
      updatedAt: string;
    }> {
      const brand = await BrandingConfig.findOne({ name: opts.branding });
      if (!brand) throw new Error('branding-not-found');
      const { ok, sha256, sanitizedBuffer, errors, finalContentType } = await this.sanitizeAndValidate(opts.fileBuffer, opts.contentType);
      const errorList = errors ?? [];
      if (!ok) throw new Error('logo-invalid: ' + errorList.join(','));
      const resolvedContentType = finalContentType ?? opts.contentType;
      // Generate a deterministic filename-like id for traceability across storage layers
      const ext = resolvedContentType === 'image/png' ? 'png' : resolvedContentType === 'image/jpeg' ? 'jpg' : 'svg';
      const gridFsId = `${opts.branding}/${opts.portal}/images/logo.${ext}`;

      // Persist to GridFS (if available). Keep in-memory cache for immediate serving.
      try {
        const bucket = this.getBucket();
        if (bucket) {
          // Delete any previous versions with same filename
          const existing = await bucket.find({ filename: gridFsId }).toArray();
          for (const f of existing) {
            try { await bucket.delete(f._id); } catch (_e) { /* noop */ }
          }
          await new Promise<void>((resolve, reject) => {
            const up = bucket.openUploadStream(gridFsId, { metadata: { contentType: finalContentType } });
            up.on('error', reject);
            up.on('finish', () => resolve());
            up.end(sanitizedBuffer!);
          });
        }
      } catch (e) {
        sails.log.warn('BrandingLogoService.putLogo GridFS write failed:', e);
      }

      // Update in-memory cache and config metadata
      this.setCache(gridFsId, sanitizedBuffer!);
      const meta = { gridFsId, sha256, contentType: resolvedContentType, updatedAt: new Date().toISOString() };
      await BrandingConfig.update({ id: brand.id }, { logo: meta });
      return { hash: sha256!, gridFsId, contentType: resolvedContentType, updatedAt: meta.updatedAt };
    }

    /** Retrieve stored binary (interim). */
    getBinary(id: string): Buffer | null {
      return this.getFromCache(id);
    }

    /** Retrieve stored binary from persistent storage (GridFS) if available. */
    async getBinaryAsync(id: string): Promise<Buffer | null> {
      // Prefer in-memory cache first
      const mem = this.getFromCache(id);
      if (mem) return mem;
      try {
        const bucket = this.getBucket();
        if (!bucket) return null;
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          const dl = bucket.openDownloadStreamByName(id, { revision: -1 }); // latest
          dl.on('data', (d: Buffer) => chunks.push(d));
          dl.on('error', reject);
          dl.on('end', () => resolve());
        });
        if (chunks.length === 0) return null;
        const buf = Buffer.concat(chunks);
        // Populate cache for subsequent reads
        this.setCache(id, buf);
        return buf;
      } catch (_e) {
        return null;
      }
    }
  }
}

declare global {
  let BrandingLogoService: Services.BrandingLogo;
}
