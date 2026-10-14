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
    private _binaryById: Record<string, { buffer: Buffer; sha256: string; storedAt: number }> = {};

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
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      this._binaryById[id] = { buffer, sha256, storedAt: Date.now() };
      this.pruneExpiredEntries();
    }

    private getFromCache(id: string, expectedSha256?: string): Buffer | null {
      const entry = this._binaryById[id];
      if (!entry) return null;
      if (Date.now() - entry.storedAt > this.getCacheTtlMs()) {
        delete this._binaryById[id];
        return null;
      }
      if (expectedSha256 && entry.sha256 !== expectedSha256) {
        delete this._binaryById[id];
        return null;
      }
      return entry.buffer;
    }

    private scheduleSupersededFaviconCleanup(brandId: string, storageKey: string): void {
      const cleanupTimer = setTimeout(async () => {
        try {
          const currentBrand = await BrandingConfig.findOne({ id: brandId });
          if (_.get(currentBrand, 'favicon.storageKey') === storageKey) {
            return;
          }
          const disk = StorageManagerService.primaryDisk();
          const retainedBytes = Buffer.from(await disk.getBytes(storageKey));
          await disk.delete(storageKey);
          // Keep a fresh in-process copy for another full TTL so a request that
          // captured the superseded metadata before cleanup can still complete.
          this.setCache(storageKey, retainedBytes);
        } catch (error) {
          sails.log.warn(`BrandingLogoService failed to remove superseded favicon ${storageKey}:`, error);
        }
      }, this.getCacheTtlMs());
      cleanupTimer.unref?.();
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

    private extForContentType(contentType: string): string {
      switch (contentType) {
        case 'image/png': return 'png';
        case 'image/jpeg': return 'jpg';
        case 'image/svg+xml': return 'svg';
        case 'image/x-icon':
        case 'image/vnd.microsoft.icon': return 'ico';
        default: return 'png';
      }
    }

    private logoStorageKey(branding: string, portal: string, contentType: string): string {
      const ext = this.extForContentType(contentType);
      return `${branding}/${portal}/images/logo.${ext}`;
    }

    private faviconStorageKey(branding: string, portal: string, contentType: string, sha256: string): string {
      const ext = this.extForContentType(contentType);
      return `${branding}/${portal}/images/favicon-${sha256}-${crypto.randomUUID()}.${ext}`;
    }

    getMaxBytes(): number {
      return _.get(sails, 'config.branding.logoMaxBytes', 512 * 1024);
    }

    getFaviconMaxBytes(): number {
      return _.get(sails, 'config.branding.faviconMaxBytes', 256 * 1024);
    }

    allowedContentTypes = new Set([
      'image/png',
      'image/jpeg',
      'image/svg+xml'
    ]);

    faviconAllowedContentTypes = new Set([
      'image/png',
      'image/svg+xml',
      'image/x-icon',
      'image/vnd.microsoft.icon'
    ]);

    /** Basic SVG detection */
    isSvg(buf: Buffer, ct: string): boolean {
      if (ct === 'image/svg+xml') return true;
      const str = buf.toString('utf8', 0, 200).toLowerCase();
      return /<svg[\s>]/.test(str);
    }

    async sanitizeAndValidate(fileBuf: Buffer, contentType: string, opts?: { allowed?: Set<string>; maxBytes?: number }): Promise<{ ok: boolean; sha256?: string; sanitizedBuffer?: Buffer; errors?: string[]; warnings?: string[]; finalContentType?: string; }> {
      const errors: string[] = [];
      const warnings: string[] = [];
      const allowed = opts?.allowed ?? this.allowedContentTypes;
      const max = opts?.maxBytes ?? this.getMaxBytes();

      if (!fileBuf || !Buffer.isBuffer(fileBuf)) {
        errors.push('empty');
        return { ok: false, errors, warnings };
      }

      if (!fileBuf || !Buffer.isBuffer(fileBuf) || fileBuf.length === 0) {
        errors.push('empty');
        return { ok: false, errors, warnings };
      }

      if (!allowed.has(contentType)) {
        errors.push('unsupported-type');
      }
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

    async putFavicon(opts: { branding: string; portal: string; fileBuffer: Buffer; contentType: string; }): Promise<{
      hash: string;
      gridFsId: string;
      storageKey: string;
      contentType: string;
      updatedAt: string;
    }> {
      const brand = await BrandingConfig.findOne({ name: opts.branding });
      if (!brand) throw new Error('branding-not-found');
      const { ok, sha256, sanitizedBuffer, errors, finalContentType } = await this.sanitizeAndValidate(
        opts.fileBuffer,
        opts.contentType,
        { allowed: this.faviconAllowedContentTypes, maxBytes: this.getFaviconMaxBytes() }
      );
      const errorList = errors ?? [];
      if (!ok) throw new Error('favicon-invalid: ' + errorList.join(','));

      const resolvedContentType = finalContentType ?? opts.contentType;
      const storageKey = this.faviconStorageKey(opts.branding, opts.portal, resolvedContentType, sha256!);

      await StorageManagerService.primaryDisk().put(storageKey, sanitizedBuffer!, { contentType: resolvedContentType });

      this.setCache(storageKey, sanitizedBuffer!);
      const meta = {
        gridFsId: storageKey,
        storageKey,
        sha256,
        contentType: resolvedContentType,
        updatedAt: new Date().toISOString(),
      };
      try {
        await BrandingConfig.update({ id: brand.id }, { favicon: meta });
      } catch (error) {
        try {
          await StorageManagerService.primaryDisk().delete(storageKey);
          delete this._binaryById[storageKey];
        } catch (cleanupError) {
          sails.log.warn(`BrandingLogoService failed to remove unreferenced favicon ${storageKey}:`, cleanupError);
        }
        throw error;
      }
      const previousStorageKey = _.get(brand, 'favicon.storageKey') as string | undefined;
      if (previousStorageKey && previousStorageKey !== storageKey) {
        this.scheduleSupersededFaviconCleanup(brand.id, previousStorageKey);
      }
      return { hash: sha256!, gridFsId: storageKey, storageKey, contentType: resolvedContentType, updatedAt: meta.updatedAt };
    }

    getBinary(id: string): Buffer | null {
      return this.getFromCache(id);
    }

    async getBinaryAsync(id: string, expectedSha256?: string): Promise<Buffer | null> {
      const mem = this.getFromCache(id, expectedSha256);
      if (mem) return mem;

      try {
        const bytes = await StorageManagerService.primaryDisk().getBytes(id);
        const buf = Buffer.from(bytes);
        const actualSha256 = crypto.createHash('sha256').update(buf).digest('hex');
        if (expectedSha256 && actualSha256 !== expectedSha256) {
          sails.log.warn(`BrandingLogoService.getBinaryAsync hash mismatch for ${id}`);
          return null;
        }
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

    async getCurrentFaviconBinary(branding: string): Promise<{
      buffer: Buffer;
      favicon: Record<string, unknown>;
    } | null> {
      let failedStorageId: string | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const brand = await BrandingConfig.findOne({ name: branding });
        const favicon = brand?.favicon as Record<string, unknown> | undefined;
        const storageId = typeof favicon?.storageKey === 'string'
          ? favicon.storageKey
          : typeof favicon?.gridFsId === 'string'
            ? favicon.gridFsId
            : null;
        if (!favicon || !storageId || storageId === failedStorageId) {
          return null;
        }
        const expectedSha256 = typeof favicon.sha256 === 'string' ? favicon.sha256 : undefined;
        const buffer = await this.getBinaryAsync(storageId, expectedSha256);
        if (buffer) {
          return { buffer, favicon };
        }
        failedStorageId = storageId;
      }
      return null;
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
