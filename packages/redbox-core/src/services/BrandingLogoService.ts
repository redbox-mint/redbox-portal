import { Services as coreServices } from '../CoreService';
import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import crypto from 'crypto';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';

/**
 * BrandingLogoService
 * - sanitizeAndValidate(fileBuf, contentType)
 * - putLogo({branding, portal, fileBuf, contentType}) -> storage key `${branding}/${portal}/images/logo.(ext)`
 */

export namespace Services {
  @PopulateExportedMethods
  export class BrandingLogo extends coreServices.Core.Service {
    /** In-memory placeholder storage keyed by storage identifier. */
    private _binaryById: Record<string, { buffer: Buffer; storedAt: number }> = {};

    private getCacheTtlMs(): number {
      const DEFAULT_LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
      const configured = _.get(sails, 'config.branding.logoCacheTtlMs', DEFAULT_LOGO_CACHE_TTL_MS);
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

    private isStorageNotFoundError(err: unknown): boolean {
      if (!err || typeof err !== 'object') {
        return false;
      }

      const storageError = err as { code?: string; message?: string; status?: number; statusCode?: number };
      const message = storageError.message?.toLowerCase() ?? '';
      return storageError.code === 'ENOENT'
        || storageError.status === 404
        || storageError.statusCode === 404
        || message.includes('not found')
        || message.includes('enoent');
    }

    private isLegacyGridFsObjectId(id: string): boolean {
      return /^[0-9a-fA-F]{24}$/.test(id);
    }

    private logoStorageKey(branding: string, portal: string, contentType: string): string {
      const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'svg';
      return `${branding}/${portal}/images/logo.${ext}`;
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

    async putLogo(opts: { branding: string; portal: string; fileBuffer: Buffer; contentType: string; }): Promise<{
      hash: string;
      gridFsId: string;
      storageKey: string;
      contentType: string;
      updatedAt: string;
    }> {
      const brand = await BrandingConfig.findOne({ name: opts.branding });
      if (!brand) throw new Error('branding-not-found');
      const { ok, sha256, sanitizedBuffer, errors, finalContentType } = await this.sanitizeAndValidate(opts.fileBuffer, opts.contentType);
      const errorList = errors ?? [];
      if (!ok) throw new Error('logo-invalid: ' + errorList.join(','));

      const resolvedContentType = finalContentType ?? opts.contentType;
      const storageKey = this.logoStorageKey(opts.branding, opts.portal, resolvedContentType);

      await StorageManagerService.primaryDisk().put(storageKey, sanitizedBuffer!, { contentType: resolvedContentType });

      this.setCache(storageKey, sanitizedBuffer!);
      const meta = {
        gridFsId: storageKey,
        storageKey,
        sha256,
        contentType: resolvedContentType,
        updatedAt: new Date().toISOString(),
      };
      await BrandingConfig.update({ id: brand.id }, { logo: meta });
      return { hash: sha256!, gridFsId: storageKey, storageKey, contentType: resolvedContentType, updatedAt: meta.updatedAt };
    }

    getBinary(id: string): Buffer | null {
      return this.getFromCache(id);
    }

    async getBinaryAsync(id: string): Promise<Buffer | null> {
      const mem = this.getFromCache(id);
      if (mem) return mem;

      try {
        const bytes = await StorageManagerService.primaryDisk().getBytes(id);
        const buf = Buffer.from(bytes);
        this.setCache(id, buf);
        return buf;
      } catch (error) {
        if (!this.isStorageNotFoundError(error)) {
          sails.log.warn('BrandingLogoService.getBinaryAsync storage read failed:', error);
        }
        if (this.isLegacyGridFsObjectId(id)) {
          return this.getLegacyGridFsBinary(id);
        }
        return null;
      }
    }

    private async getLegacyGridFsBinary(id: string): Promise<Buffer | null> {
      const datastores = sails.config?.datastores as Record<string, { url?: string }> | undefined;
      const url = datastores?.mongodb?.url;
      if (!url) {
        return null;
      }

      const client = await MongoClient.connect(url, {});
      try {
        const bucket = new GridFSBucket(client.db(), { bucketName: 'fs' });
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          bucket.openDownloadStream(new ObjectId(id))
            .on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
            .on('error', reject)
            .on('end', resolve);
        });
        const buf = Buffer.concat(chunks);
        this.setCache(id, buf);
        return buf;
      } catch (error) {
        if (!this.isStorageNotFoundError(error)) {
          sails.log.warn('BrandingLogoService.getLegacyGridFsBinary read failed:', error);
        }
        return null;
      } finally {
        await client.close();
      }
    }
  }
}

declare global {
  let BrandingLogoService: Services.BrandingLogo;
}
