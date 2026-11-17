import { Services as coreServices } from '../CoreService';
import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import crypto from 'crypto';
import type { BrandingConfigHistoryAttributes } from '../waterline-models/BrandingConfigHistory';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';

/**
 * BrandingLogoService
 * - sanitizeAndValidate(fileBuf, contentType)
 * - putLogo / putFavicon stage immutable draft objects for the route brand.
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

    private isStorageNotFoundError(err: unknown): boolean {
      if (!err || typeof err !== 'object') {
        return false;
      }

      const storageError = err as { code?: string; message?: string; status?: number; statusCode?: number };
      const message = storageError.message?.toLowerCase() ?? '';
      return (
        storageError.code === 'ENOENT' ||
        storageError.status === 404 ||
        storageError.statusCode === 404 ||
        message.includes('not found') ||
        message.includes('enoent')
      );
    }

    private isLegacyGridFsObjectId(id: string): boolean {
      return /^[0-9a-fA-F]{24}$/.test(id);
    }

    private extForContentType(contentType: string): string {
      switch (contentType) {
        case 'image/png':
          return 'png';
        case 'image/jpeg':
          return 'jpg';
        case 'image/svg+xml':
          return 'svg';
        case 'image/x-icon':
        case 'image/vnd.microsoft.icon':
          return 'ico';
        default:
          return 'png';
      }
    }

    getMaxBytes(): number {
      return _.get(sails, 'config.branding.logoMaxBytes', 512 * 1024);
    }

    getFaviconMaxBytes(): number {
      return _.get(sails, 'config.branding.faviconMaxBytes', 256 * 1024);
    }

    allowedContentTypes = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);

    faviconAllowedContentTypes = new Set(['image/png', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']);

    /** Basic SVG detection */
    isSvg(buf: Buffer, ct: string): boolean {
      if (ct === 'image/svg+xml') return true;
      const str = buf.toString('utf8', 0, 200).toLowerCase();
      return /<svg[\s>]/.test(str);
    }

    async sanitizeAndValidate(
      fileBuf: Buffer,
      contentType: string,
      opts?: { allowed?: Set<string>; maxBytes?: number }
    ): Promise<{
      ok: boolean;
      sha256?: string;
      sanitizedBuffer?: Buffer;
      errors?: string[];
      warnings?: string[];
      finalContentType?: string;
    }> {
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

    /** All upload callers stage immutable brand-scoped objects; never overwrite live bytes. */
    async putLogo(opts: {
      branding: string;
      portal: string;
      fileBuffer: Buffer;
      contentType: string;
      expectedDraftRevision?: number;
    }) {
      return this.putDraftImage('logo', opts);
    }

    async putFavicon(opts: {
      branding: string;
      portal: string;
      fileBuffer: Buffer;
      contentType: string;
      expectedDraftRevision?: number;
    }) {
      return this.putDraftImage('favicon', opts);
    }

    private async putDraftImage(
      kind: 'logo' | 'favicon',
      opts: {
        branding: string;
        portal: string;
        fileBuffer: Buffer;
        contentType: string;
        expectedDraftRevision?: number;
      }
    ) {
      const state = await BrandingService.uploadImage({ ...opts, kind });
      const image = state.draft.images[kind]!;
      return {
        hash: image.sha256!,
        gridFsId: image.storageKey!,
        storageKey: image.storageKey!,
        contentType: image.contentType!,
        updatedAt: image.updatedAt!,
        state,
      };
    }

    async storeDraftImage(brandId: string, kind: 'logo' | 'favicon', fileBuffer: Buffer, contentType: string) {
      const result = await this.sanitizeAndValidate(
        fileBuffer,
        contentType,
        kind === 'favicon'
          ? { allowed: this.faviconAllowedContentTypes, maxBytes: this.getFaviconMaxBytes() }
          : undefined
      );
      if (!result.ok) throw new Error(kind + '-invalid: ' + (result.errors ?? []).join(','));
      const resolvedContentType = result.finalContentType ?? contentType;
      const storageKey = `branding-images/${brandId}/${kind}/${crypto.randomUUID()}.${this.extForContentType(resolvedContentType)}`;
      await StorageManagerService.primaryDisk().put(storageKey, result.sanitizedBuffer!, {
        contentType: resolvedContentType,
      });
      return {
        storageKey,
        gridFsId: storageKey,
        sha256: result.sha256!,
        contentType: resolvedContentType,
        updatedAt: new Date().toISOString(),
      };
    }

    /** Reclaim abandoned uploads and objects pruned out of history after the same
     * grace period as fonts. A fresh reference read precedes each deletion. */
    async reconcileAssets(options?: {
      now?: number;
      graceMs?: number;
    }): Promise<{ deleted: number; failures: number }> {
      const disk = StorageManagerService.primaryDisk();
      const now = options?.now ?? Date.now();
      const grace = options?.graceMs ?? _.get(sails, 'config.branding.typefaceOrphanGraceMs', 86400000);
      const keys: string[] = [];
      let paginationToken: string | undefined;
      do {
        const page = await disk.listAll('branding-images/', {
          recursive: true,
          ...(paginationToken ? { paginationToken } : {}),
        });
        for (const entry of page.objects)
          keys.push(typeof entry === 'string' ? entry : String((entry as { key?: string }).key ?? ''));
        paginationToken = page.paginationToken;
      } while (paginationToken);
      const result = { deleted: 0, failures: 0 };
      for (const key of keys) {
        const match = /^branding-images\/([^/]+)\/(logo|favicon)\/[a-f0-9-]+\.(png|jpg|svg|ico)$/.exec(key);
        if (!match) continue;
        try {
          const metadata = await disk.getMetaData(key);
          if (now - metadata.lastModified.getTime() < grace) continue;
          const brand = await BrandingConfig.findOne({ id: match[1] });
          const histories = (await BrandingConfigHistory.find({
            branding: match[1],
          })) as BrandingConfigHistoryAttributes[];
          const images = [
            brand?.logo,
            brand?.favicon,
            ...Object.values(brand?.draftImages ?? {}),
            ...histories.flatMap(row => Object.values(row.images ?? {})),
          ];
          if (images.some(image => image?.storageKey === key)) continue;
          await disk.delete(key);
          result.deleted += 1;
        } catch (error) {
          if (this.isStorageNotFoundError(error)) continue;
          result.failures += 1;
          sails.log.warn('Branding image reconciliation failed', error);
        }
      }
      return result;
    }

    getBinary(id: string): Buffer | null {
      return this.getFromCache(id);
    }

    async getBinaryAsync(id: string, expectedSha256?: string, fresh = false): Promise<Buffer | null> {
      const mem = fresh ? null : this.getFromCache(id, expectedSha256);
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
        const storageId =
          typeof favicon?.storageKey === 'string'
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
          bucket
            .openDownloadStream(new ObjectId(id))
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
