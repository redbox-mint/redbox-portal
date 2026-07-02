import { Readable } from 'node:stream';
import { DataStore, Upload, ERRORS } from '@tus/server';
import type { Services } from '../services/StorageManagerService';

type TusLogger = Pick<typeof sails.log, 'verbose' | 'warn' | 'error'>;

type TusStoredUpload = {
  id: string;
  size?: number;
  offset: number;
  metadata?: Record<string, string | null>;
  creation_date?: string;
  storage?: {
    type: string;
    path: string;
  };
};

type TusOptions = {
  disk: Services.IDisk;
  prefix?: string;
  logger?: TusLogger;
  expirationPeriodInMilliseconds?: number;
};

type ListedDiskObject = {
  key?: string;
  name?: string;
  lastModified?: Date;
};

export class TusStorageManagerDataStore extends DataStore {
  private readonly disk: Services.IDisk;
  private readonly prefix: string;
  private readonly logger?: TusLogger;
  private readonly expirationPeriodInMilliseconds: number;
  private readonly writeLocks = new Map<string, Promise<void>>();

  public constructor(options: TusOptions) {
    super();
    this.disk = options.disk;
    this.prefix = this.normalizePrefix(options.prefix);
    this.logger = options.logger;
    this.expirationPeriodInMilliseconds = options.expirationPeriodInMilliseconds ?? 0;
    this.extensions = [
      'creation',
      'creation-with-upload',
      'creation-defer-length',
      'termination',
      'expiration',
    ];
  }

  public override async create(file: Upload): Promise<Upload> {
    const storedUpload = this.toStoredUpload(file);
    await this.writeUploadInfo(file.id, storedUpload);
    file.storage = { type: 'storage-manager', path: this.finalKey(file.id) };
    this.logger?.verbose(
      `TusStorageManagerDataStore: create id='${file.id}' size=${file.size ?? 'deferred'} offset=${file.offset} infoKey='${this.infoKey(file.id)}' finalKey='${this.finalKey(file.id)}'`
    );
    return file;
  }

  public override async remove(id: string): Promise<void> {
    const exists = await this.disk.exists(this.infoKey(id));
    if (!exists) {
      throw ERRORS.FILE_NOT_FOUND;
    }
    await this.deleteUploadKeys(id);
  }

  public override async write(readable: Readable, id: string, offset: number): Promise<number> {
    const collected = await this.readStream(readable);
    this.validateWriteInputs(offset, collected.length);
    this.logger?.verbose(
      `TusStorageManagerDataStore: write received id='${id}' requestOffset=${offset} bytes=${collected.length}`
    );

    return this.withUploadLock(id, async () => {
      const upload = await this.readStoredUpload(id);
      this.logger?.verbose(
        `TusStorageManagerDataStore: write state id='${id}' storedOffset=${upload.offset} size=${upload.size ?? 'deferred'}`
      );
      if (upload.offset !== offset) {
        throw ERRORS.INVALID_OFFSET;
      }

      const newOffset = offset + collected.length;
      if (!Number.isSafeInteger(newOffset) || newOffset < 0) {
        throw ERRORS.FILE_WRITE_ERROR;
      }
      if (upload.size !== undefined && newOffset > upload.size) {
        throw ERRORS.INVALID_OFFSET;
      }

      const partKey = this.partKey(id, offset);
      try {
        this.logger?.verbose(
          `TusStorageManagerDataStore: writing part id='${id}' partKey='${partKey}' bytes=${collected.length}`
        );
        await this.disk.put(partKey, collected, { contentLength: collected.length });
        upload.offset = newOffset;
        await this.writeUploadInfo(id, upload);
        this.logger?.verbose(
          `TusStorageManagerDataStore: wrote part id='${id}' newOffset=${newOffset} infoKey='${this.infoKey(id)}'`
        );
      } catch (error) {
        this.logger?.error(`TusStorageManagerDataStore: failed writing upload '${id}'`, error);
        throw ERRORS.FILE_WRITE_ERROR;
      }

      if (upload.size !== undefined && newOffset === upload.size) {
        try {
          this.logger?.verbose(
            `TusStorageManagerDataStore: upload complete id='${id}' size=${upload.size}; materializing to '${this.finalKey(id)}'`
          );
          await this.materializeUpload(id, upload, { deleteParts: true });
        } catch (error) {
          upload.offset = offset;
          try {
            await this.writeUploadInfo(id, upload);
          } catch (rollbackError) {
            this.logger?.error(`TusStorageManagerDataStore: failed rolling back upload '${id}' after compose failure`, rollbackError);
          }
          throw error;
        }
      }

      return newOffset;
    });
  }

  public override async getUpload(id: string): Promise<Upload> {
    const upload = await this.readStoredUpload(id);
    return new Upload({
      ...upload,
      storage: {
        type: 'storage-manager',
        path: upload.offset === upload.size ? this.finalKey(id) : this.partsPrefix(id),
      },
    });
  }

  public override async declareUploadLength(id: string, uploadLength: number): Promise<void> {
    const upload = await this.readStoredUpload(id);
    upload.size = uploadLength;
    await this.writeUploadInfo(id, upload);
    this.logger?.verbose(
      `TusStorageManagerDataStore: declareUploadLength id='${id}' uploadLength=${uploadLength} offset=${upload.offset}`
    );

    if (upload.offset === uploadLength) {
      await this.materializeUpload(id, upload, { deleteParts: true });
    }
  }

  public override async deleteExpired(): Promise<number> {
    if (this.getExpiration() <= 0) {
      return 0;
    }

    const uploads = await this.listUploadIds();
    const now = Date.now();
    let deleted = 0;

    for (const id of uploads) {
      try {
        const upload = await this.readStoredUpload(id);
        if (upload.size !== undefined && upload.offset === upload.size) {
          continue;
        }

        const createdAt = this.readExpirationTimestamp(id, upload);
        if (now > createdAt + this.getExpiration()) {
          await this.deleteUploadKeys(id);
          deleted += 1;
        }
      } catch (error) {
        if (!this.isTusNotFound(error)) {
          throw error;
        }
      }
    }

    return deleted;
  }

  public override getExpiration(): number {
    return this.expirationPeriodInMilliseconds;
  }

  private normalizePrefix(prefix?: string): string {
    const raw = typeof prefix === 'string' ? prefix.trim() : '.tus';
    const cleaned = raw.replace(/^\/+|\/+$/g, '');
    return cleaned || '.tus';
  }

  private uploadPrefix(id: string): string {
    return `${this.prefix}/${id}`;
  }

  private finalKey(id: string): string {
    return id;
  }

  private infoKey(id: string): string {
    return `${this.uploadPrefix(id)}/info.json`;
  }

  private partsPrefix(id: string): string {
    return `${this.uploadPrefix(id)}/parts/`;
  }

  private partKey(id: string, offset: number): string {
    return `${this.partsPrefix(id)}${String(offset).padStart(20, '0')}`;
  }

  private toStoredUpload(upload: Upload): TusStoredUpload {
    return {
      id: upload.id,
      size: upload.size,
      offset: upload.offset,
      metadata: upload.metadata,
      creation_date: upload.creation_date,
      storage: upload.storage,
    };
  }

  private async writeUploadInfo(id: string, upload: TusStoredUpload): Promise<void> {
    await this.disk.put(this.infoKey(id), JSON.stringify(upload), { contentType: 'application/json' });
  }

  private async readStoredUpload(id: string): Promise<TusStoredUpload> {
    try {
      const raw = await this.disk.get(this.infoKey(id));
      return JSON.parse(raw) as TusStoredUpload;
    } catch (error) {
      if (this.isDiskNotFound(error)) {
        throw ERRORS.FILE_NOT_FOUND;
      }
      throw error;
    }
  }

  private async materializeUpload(id: string, upload: TusStoredUpload, options: { deleteParts: boolean }): Promise<void> {
    const partKeys = await this.listPartKeys(id);
    this.logger?.verbose(
      `TusStorageManagerDataStore: materialize id='${id}' partCount=${partKeys.length} partsPrefix='${this.partsPrefix(id)}' finalKey='${this.finalKey(id)}' contentLength=${upload.offset}`
    );
    if (!partKeys.length && upload.offset > 0) {
      throw new Error(`No TUS parts found for '${id}' while materializing ${upload.offset} bytes`);
    }
    const composed = Readable.from(this.streamPartsSequential(partKeys));

    try {
      await this.disk.putStream(this.finalKey(id), composed, { contentLength: upload.offset });
      this.logger?.verbose(
        `TusStorageManagerDataStore: materialized id='${id}' finalKey='${this.finalKey(id)}' contentLength=${upload.offset}`
      );
      if (options.deleteParts) {
        await this.disk.deleteAll(this.partsPrefix(id));
        this.logger?.verbose(
          `TusStorageManagerDataStore: deleted parts id='${id}' partsPrefix='${this.partsPrefix(id)}'`
        );
      }
    } catch (error) {
      this.logger?.error(`TusStorageManagerDataStore: failed composing upload '${id}'`, error);
      throw ERRORS.FILE_WRITE_ERROR;
    }
  }

  private async *streamPartsSequential(partKeys: string[]): AsyncGenerator<Buffer> {
    for (const key of partKeys) {
      const stream = await this.disk.getStream(key);
      for await (const chunk of stream) {
        yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      }
    }
  }

  private validateWriteInputs(offset: number, collectedLength: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw ERRORS.INVALID_OFFSET;
    }
    if (!Number.isSafeInteger(collectedLength) || collectedLength < 0) {
      throw ERRORS.FILE_WRITE_ERROR;
    }
  }

  private async withUploadLock<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.writeLocks.get(id) ?? Promise.resolve();
    let releaseCurrent: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const currentChain = previous.catch(() => undefined).then(() => current);
    this.writeLocks.set(id, currentChain);

    await previous.catch(() => undefined);

    try {
      return await action();
    } finally {
      releaseCurrent?.();
      if (this.writeLocks.get(id) === currentChain) {
        this.writeLocks.delete(id);
      }
    }
  }

  private async readStream(readable: Readable): Promise<Uint8Array> {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return new Uint8Array(Buffer.concat(chunks));
  }

  private async listUploadIds(): Promise<string[]> {
    const listing = await this.disk.listAll(`${this.prefix}/`, { recursive: true });
    const ids = new Set<string>();

    for (const object of Array.from(listing.objects)) {
      const key = this.listedObjectKey(object);
      const match = key.match(new RegExp(`^${this.escapeRegExp(this.prefix)}/([^/]+)/info\\.json$`));
      if (match?.[1]) {
        ids.add(match[1]);
      }
    }

    return Array.from(ids.values()).sort();
  }

  private async listPartKeys(id: string): Promise<string[]> {
    const listing = await this.disk.listAll(this.partsPrefix(id), { recursive: true });
    return Array.from(listing.objects)
      .map((object) => this.listedObjectKey(object))
      .sort();
  }

  private listedObjectKey(object: unknown): string {
    const listed = object as ListedDiskObject;
    return String(listed.key ?? listed.name ?? object);
  }

  private async deleteUploadKeys(id: string): Promise<void> {
    await this.disk.deleteAll(`${this.uploadPrefix(id)}/`);
    if (await this.disk.exists(this.finalKey(id))) {
      await this.disk.delete(this.finalKey(id));
    }
  }

  private readExpirationTimestamp(id: string, upload: TusStoredUpload): number {
    if (!upload.creation_date) {
      this.logger?.warn(`TusStorageManagerDataStore: upload '${id}' missing creation_date; treating it as expired when expiration is enabled`);
      return 0;
    }

    const createdAt = new Date(upload.creation_date).getTime();
    if (Number.isNaN(createdAt)) {
      this.logger?.warn(`TusStorageManagerDataStore: upload '${id}' has invalid creation_date '${upload.creation_date}'; treating it as expired when expiration is enabled`);
      return 0;
    }

    return createdAt;
  }

  private isDiskNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const storageError = error as {
      code?: string;
      name?: string;
      status?: number;
      statusCode?: number;
      message?: string;
    };
    const code = storageError.code?.toLowerCase();
    const name = storageError.name?.toLowerCase();
    const message = storageError.message?.toLowerCase() ?? '';

    return storageError.status === 404
      || storageError.statusCode === 404
      || code === 'enoent'
      || code === 'nosuchkey'
      || code === 'notfound'
      || code === 'notfounderror'
      || name === 'notfound'
      || name === 'notfounderror'
      || message.includes('not found')
      || message.includes('no such')
      || message.includes('does not exist')
      || message.includes('enoent');
  }

  private isTusNotFound(error: unknown): boolean {
    return error === ERRORS.FILE_NOT_FOUND || error === ERRORS.FILE_NO_LONGER_EXISTS;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
