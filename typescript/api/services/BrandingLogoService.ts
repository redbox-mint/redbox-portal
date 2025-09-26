import { PopulateExportedMethods, Services as coreServices } from '@researchdatabox/redbox-core-types';
import crypto from 'crypto';
import { GridFSBucket, Db } from 'mongodb';

/**
 * BrandingLogoService
 * - sanitizeAndValidate(fileBuf, contentType)
 * - putLogo({branding, portal, fileBuf, contentType, actor}) -> GridFS path `${branding}/${portal}/images/logo.(ext)`
 */

declare const sails: any;
declare const _: any;
declare const BrandingConfig: any;
declare const SvgSanitizerService: any;
// Using skipper-gridfs adapter pattern like BrandingController
// We'll lazily require to avoid circular load issues.

export module Services {
  @PopulateExportedMethods
  export class BrandingLogo extends coreServices.Core.Service {
  

  /** In-memory placeholder storage keyed by gridFsId. */
  private _binaryById: Record<string, Buffer> = {};

    /** Lazily create a GridFS bucket using the configured 'mongodb' datastore. */
    private getBucket(): GridFSBucket | null {
      try {
        const ds = (sails as any).getDatastore ? (sails as any).getDatastore('mongodb') : null;
        const db: Db | undefined = ds?.manager; // sails-mongo exposes native Db as manager
        if (!db) return null;
        return new GridFSBucket(db, { bucketName: 'fs' });
      } catch(_e) {
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
      if (!fileBuf || !Buffer.isBuffer(fileBuf) || fileBuf.length === 0) {
        errors.push('empty');
      }
      if (!this.allowedContentTypes.has(contentType)) {
        errors.push('unsupported-type');
      }
      const max = this.getMaxBytes();
      if (fileBuf.length > max) {
        errors.push('too-large');
      }
      let outBuffer = fileBuf;
      let finalCt = contentType;
      if (errors.length === 0 && this.isSvg(fileBuf, contentType)) {
        // Sanitize SVG using existing service
        const svg = fileBuf.toString('utf8');
        const result = await SvgSanitizerService.sanitize(svg);
        if (!result.safe) {
          errors.push(...result.errors.map(e => 'svg-' + e));
        }
        warnings.push(...result.warnings.map(w => 'svg-' + w));
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
    async putLogo(opts: { branding: string; portal: string; fileBuffer: Buffer; contentType: string; actor?: any; }): Promise<{ hash: string; gridFsId: string; contentType: string; updatedAt: string; }> {
      const brand = await BrandingConfig.findOne({ name: opts.branding });
      if (!brand) throw new Error('branding-not-found');
      const { ok, sha256, sanitizedBuffer, errors, finalContentType } = await this.sanitizeAndValidate(opts.fileBuffer, opts.contentType);
      if (!ok) throw new Error('logo-invalid: ' + errors.join(','));
      // Generate a deterministic filename-like id for traceability across storage layers
      const ext = finalContentType === 'image/png' ? 'png' : finalContentType === 'image/jpeg' ? 'jpg' : 'svg';
      const gridFsId = `${opts.branding}/${opts.portal}/images/logo.${ext}`;

      // Persist to GridFS (if available). Keep in-memory cache for immediate serving.
      try {
        const bucket = this.getBucket();
        if (bucket) {
          // Delete any previous versions with same filename
          const existing = await bucket.find({ filename: gridFsId }).toArray();
          for (const f of existing) {
            try { await bucket.delete(f._id); } catch(_e) { /* noop */ }
          }
          await new Promise<void>((resolve, reject) => {
            const up = bucket.openUploadStream(gridFsId, { metadata: { contentType: finalContentType } });
            up.on('error', reject);
            up.on('finish', () => resolve());
            up.end(sanitizedBuffer);
          });
        }
      } catch(e) {
        // Non-fatal: we still update config and serve from memory; log verbose only
        sails.log && sails.log.warn && sails.log.warn('BrandingLogoService.putLogo GridFS write failed:', e);
      }

      // Update in-memory cache and config metadata
      (this as any)._lastLogoBinary = sanitizedBuffer; // legacy single ref
      this._binaryById[gridFsId] = sanitizedBuffer!;
      const meta = { gridFsId, sha256, contentType: finalContentType, updatedAt: new Date().toISOString() };
      await BrandingConfig.update({ id: brand.id }, { logo: meta });
      return { hash: sha256!, gridFsId, contentType: finalContentType, updatedAt: meta.updatedAt };
    }

    /** Retrieve stored binary (interim). */
    getBinary(id: string): Buffer | null {
      return this._binaryById[id] || null;
    }

    /** Retrieve stored binary from persistent storage (GridFS) if available. */
    async getBinaryAsync(id: string): Promise<Buffer | null> {
      // Prefer in-memory cache first
      const mem = this.getBinary(id);
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
        this._binaryById[id] = buf;
        return buf;
      } catch(_e) {
        return null;
      }
    }
  }
}

module.exports = new Services.BrandingLogo().exports();
