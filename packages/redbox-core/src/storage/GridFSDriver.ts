/// <reference path="../sails.ts" />
import { createHash } from 'node:crypto';
import { basename, posix } from 'node:path';
import { Readable, Writable } from 'node:stream';
import type { Collection, Db, Document, GridFSBucketWriteStreamOptions, GridFSFile, MongoClientOptions } from 'mongodb';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import type { GridFSDriverOptions, Visibility } from '../config/storage.config';

type GridFSMetadata = {
  visibility?: Visibility;
  contentType?: string;
  contentLanguage?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLength?: number;
} & Record<string, unknown>;

type GridFSWriteOptions = {
  visibility?: Visibility;
  contentType?: string;
  contentLanguage?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLength?: number;
  [key: string]: unknown;
};

type ListedObject = {
  key: string;
  name: string;
  contentLength: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
};

/** Persisted before the first chunk so deletion by key survives a process crash. */
type PendingUpload = {
  _id: ObjectId;
  filename: string;
  startedAt: Date;
  metadata: GridFSMetadata;
};

type GridFSBucketLike = {
  find: (filter?: Document) => { toArray: () => Promise<GridFSFile[]> };
  openUploadStreamWithId: (id: ObjectId, filename: string, options?: GridFSBucketWriteStreamOptions) => Writable;
  openDownloadStreamByName: (filename: string, options?: { revision?: number }) => NodeJS.ReadableStream;
};

type GridFSBucketFactory = (db: Db, options: { bucketName: string }) => GridFSBucketLike;
type MongoDbFactory = (options: Required<GridFSDriverOptions>) => Promise<Db>;
type CachedMongoDb = {
  client: Pick<MongoClient, 'db'> & Partial<Pick<MongoClient, 'close' | 'on'>>;
  db: Db;
};

const UPLOAD_CHUNK_BYTES = 255 * 1024;

export class GridFSDriver {
  private static dbCache: Map<string, Promise<CachedMongoDb>> = new Map();

  public readonly options: Required<GridFSDriverOptions>;

  private readonly bucketFactory: GridFSBucketFactory;
  private readonly dbFactory: MongoDbFactory;
  private cachedBucket: GridFSBucketLike | null = null;
  private cachedDb?: Promise<Db>;

  public constructor(
    options: GridFSDriverOptions = {},
    bucketFactory: GridFSBucketFactory = (db, bucketOptions) => new GridFSBucket(db, bucketOptions),
    dbFactory: MongoDbFactory = resolvedOptions => GridFSDriver.connectDb(resolvedOptions)
  ) {
    this.options = GridFSDriver.resolveOptions(options);
    this.bucketFactory = bucketFactory;
    this.dbFactory = dbFactory;
  }

  public async exists(key: string): Promise<boolean> {
    return (await this.findLatestFile(key)) !== null || (await this.findPendingUploads({ filename: key })).length > 0;
  }

  public async get(key: string): Promise<string> {
    const bytes = await this.getBytes(key);
    return Buffer.from(bytes).toString('utf8');
  }

  public async getStream(key: string): Promise<Readable> {
    await this.requireLatestFile(key);
    return (await this.getBucket()).openDownloadStreamByName(key, { revision: -1 }) as Readable;
  }

  public async getBytes(key: string): Promise<Uint8Array> {
    const stream = await this.getStream(key);
    const buffer = await this.readStreamToBuffer(stream);
    return new Uint8Array(buffer);
  }

  public async getMetaData(
    key: string
  ): Promise<{ contentType?: string; contentLength: number; etag: string; lastModified: Date }> {
    const file = await this.requireLatestFile(key);
    return this.fileToMetaData(file);
  }

  public async getVisibility(key: string): Promise<'public' | 'private'> {
    const file = await this.requireLatestFile(key);
    const metadata = this.readStoredMetadata(file);
    return metadata.visibility ?? this.options.visibility;
  }

  public async getUrl(key: string): Promise<string> {
    await this.requireLatestFile(key);
    return this.syntheticUrl(key);
  }

  public async getSignedUrl(key: string, _options?: Record<string, unknown>): Promise<string> {
    await this.requireLatestFile(key);
    return this.syntheticUrl(key);
  }

  public async getSignedUploadUrl(key: string, _options?: Record<string, unknown>): Promise<string> {
    return this.syntheticUrl(key);
  }

  public async setVisibility(key: string, _visibility: Visibility): Promise<void> {
    await this.requireLatestFile(key);
    throw new Error('GridFSDriver: visibility changes are not supported');
  }

  public async put(key: string, contents: string | Uint8Array, options?: GridFSWriteOptions): Promise<void> {
    const stream = typeof contents === 'string' ? Readable.from([contents]) : Readable.from([Buffer.from(contents)]);
    await this.putStream(key, stream, options);
  }

  public async putStream(key: string, contents: Readable, options?: GridFSWriteOptions): Promise<void> {
    // Pending uploads may belong to another writer. Overwrites delete completed
    // files only, leaving those uploads' chunks and markers intact.
    const files = await this.findFilesByFilename(key);
    await Promise.all(files.map(file => this.deleteUpload(file._id)));
    const bucket = await this.getBucket();
    const uploadId = new ObjectId();
    const metadata = this.buildMetadata(options);
    // GridFS writes its files document only after the upload finishes. Without this durable
    // mapping, a process crash can leave chunks whose key cannot be recovered for cleanup.
    await (await this.pendingUploads()).insertOne({ _id: uploadId, filename: key, startedAt: new Date(), metadata });
    try {
      const upload = bucket.openUploadStreamWithId(uploadId, key, { metadata, chunkSizeBytes: UPLOAD_CHUNK_BYTES });
      await this.writeUpload(contents, upload);
      await (await this.pendingUploads()).deleteOne({ _id: uploadId });
    } catch (error) {
      try {
        await this.deleteUpload(uploadId);
      } catch {
        // Retain the mapping if deletion fails so normal disk cleanup can retry by key.
      }
      throw error;
    }
  }

  private async writeUpload(contents: Readable, upload: Writable): Promise<void> {
    // GridFS destroy()/abort() do not wait for outstanding Mongo inserts. Await each
    // write before observing a source error, and bound its size so an insert failure
    // cannot leave sibling inserts running after the write callback has failed.
    upload.on('error', error => contents.destroy(error));
    try {
      for await (const chunk of contents) {
        const buffer = Buffer.from(chunk);
        for (let offset = 0; offset < buffer.length; offset += UPLOAD_CHUNK_BYTES) {
          await new Promise<void>((resolve, reject) => {
            upload.write(buffer.subarray(offset, offset + UPLOAD_CHUNK_BYTES), error =>
              error ? reject(error) : resolve()
            );
          });
        }
      }
      await new Promise<void>((resolve, reject) => {
        upload.end((error?: Error | null) => (error ? reject(error) : resolve()));
      });
    } finally {
      upload.destroy();
    }
  }

  public async copy(source: string, destination: string, options?: GridFSWriteOptions): Promise<void> {
    if (source === destination) {
      return;
    }

    const sourceFile = await this.requireLatestFile(source);
    const sourceStream = await this.getStream(source);
    await this.putStream(destination, sourceStream, {
      ...this.readStoredMetadata(sourceFile),
      ...options,
    });
  }

  public async move(source: string, destination: string, options?: GridFSWriteOptions): Promise<void> {
    if (source === destination) {
      return;
    }

    await this.copy(source, destination, options);
    await this.delete(source);
  }

  public async delete(key: string): Promise<void> {
    await this.deleteMatchingFiles(key);
  }

  public async deleteAll(prefix: string): Promise<void> {
    const files = await this.findFilesByPrefix(prefix);
    const pending = await this.findPendingUploads(this.prefixFilter(prefix));
    await Promise.all([...files, ...pending].map(file => this.deleteUpload(file._id)));
  }

  public async listAll(
    prefix: string,
    _options?: { recursive?: boolean; paginationToken?: string }
  ): Promise<{
    paginationToken?: string;
    objects: Iterable<ListedObject>;
  }> {
    const files = await this.findFilesByPrefix(prefix);
    const objects = files.map(file => ({
      key: file.filename,
      name: basename(file.filename),
      ...this.fileToMetaData(file),
    }));

    const completedKeys = new Set(files.map(file => file.filename));
    for (const pending of await this.findPendingUploads(this.prefixFilter(prefix))) {
      if (completedKeys.has(pending.filename)) continue;
      objects.push({
        key: pending.filename,
        name: basename(pending.filename),
        contentType: pending.metadata.contentType,
        contentLength: 0,
        lastModified: pending.startedAt,
        etag: pending._id.toHexString(),
      });
    }
    objects.sort((left, right) => left.key.localeCompare(right.key));

    return {
      paginationToken: undefined,
      objects,
    };
  }

  public bucket(bucketName: string): GridFSDriver {
    return new GridFSDriver({ ...this.options, bucketName }, this.bucketFactory, this.dbFactory);
  }

  public static async dispose(): Promise<void> {
    const cachedDbs = Array.from(GridFSDriver.dbCache.values());
    GridFSDriver.dbCache.clear();
    await Promise.all(
      cachedDbs.map(async cachedDb => {
        const { client } = await cachedDb;
        await client.close?.();
      })
    );
  }

  private static resolveOptions(options: GridFSDriverOptions): Required<GridFSDriverOptions> {
    return {
      datastore: GridFSDriver.readNonEmptyString(options.datastore, 'mongodb'),
      url: GridFSDriver.readNonEmptyString(options.url, ''),
      databaseName: GridFSDriver.readNonEmptyString(options.databaseName, ''),
      bucketName: GridFSDriver.readNonEmptyString(options.bucketName, 'fs'),
      visibility: GridFSDriver.normalizeVisibility(options.visibility),
    };
  }

  private static readNonEmptyString(value: string | undefined, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private static normalizeVisibility(value: GridFSDriverOptions['visibility'] | undefined): Visibility {
    return value === 'private' ? 'private' : 'public';
  }

  private async getBucket(): Promise<GridFSBucketLike> {
    if (this.cachedBucket) {
      return this.cachedBucket;
    }

    const db = await this.getDb();

    this.cachedBucket = this.bucketFactory(db, { bucketName: this.options.bucketName });
    return this.cachedBucket;
  }

  private getDb(): Promise<Db> {
    this.cachedDb ??= this.dbFactory(this.options).catch(error => {
      this.cachedDb = undefined;
      throw error;
    });
    return this.cachedDb;
  }

  private async pendingUploads(): Promise<Collection<PendingUpload>> {
    return (await this.getDb()).collection<PendingUpload>(`${this.options.bucketName}.uploads`);
  }

  private async findPendingUploads(filter: Document): Promise<PendingUpload[]> {
    return (await this.pendingUploads()).find(filter).toArray();
  }

  private async deleteUpload(uploadId: ObjectId): Promise<void> {
    const db = await this.getDb();
    // GridFSBucket.delete() rejects for a chunk-only upload with no files document. These
    // idempotent deletes deliberately handle that state and keep the marker until both succeed.
    await db.collection(`${this.options.bucketName}.chunks`).deleteMany({ files_id: uploadId });
    await db.collection(`${this.options.bucketName}.files`).deleteOne({ _id: uploadId });
    await (await this.pendingUploads()).deleteOne({ _id: uploadId });
  }

  private static async connectDb(options: Required<GridFSDriverOptions>): Promise<Db> {
    const url = options.url || GridFSDriver.readDatastoreUrl(options.datastore);
    if (!url) {
      throw new Error(`GridFSDriver: datastore '${options.datastore}' does not have a MongoDB URL configured`);
    }

    const cacheKey = `${url}::${options.databaseName}`;
    let cachedPromise = GridFSDriver.dbCache.get(cacheKey);
    if (!cachedPromise) {
      cachedPromise = GridFSDriver.createMongoClientDb(url, options.databaseName, cacheKey).catch(error => {
        GridFSDriver.dbCache.delete(cacheKey);
        throw error;
      });
      GridFSDriver.dbCache.set(cacheKey, cachedPromise);
    }
    return (await cachedPromise).db;
  }

  private static readDatastoreUrl(datastoreName: string): string {
    const datastores = sails.config?.datastores as Record<string, { url?: string }> | undefined;
    return GridFSDriver.readNonEmptyString(datastores?.[datastoreName]?.url, '');
  }

  private static async createMongoClientDb(
    url: string,
    databaseName: string,
    cacheKey: string
  ): Promise<CachedMongoDb> {
    const clientOptions: MongoClientOptions = {};
    const client = await MongoClient.connect(url, clientOptions);
    client.on?.('close', () => {
      GridFSDriver.dbCache.delete(cacheKey);
    });
    client.on?.('error', () => {
      GridFSDriver.dbCache.delete(cacheKey);
    });
    return {
      client,
      db: databaseName ? client.db(databaseName) : client.db(),
    };
  }

  private async findLatestFile(key: string): Promise<GridFSFile | null> {
    const files = await this.findFilesByFilename(key);
    return files[0] ?? null;
  }

  private async requireLatestFile(key: string): Promise<GridFSFile> {
    const file = await this.findLatestFile(key);
    if (!file) {
      throw this.createNotFoundError(key);
    }
    return file;
  }

  private async findFilesByFilename(key: string): Promise<GridFSFile[]> {
    const files = await (await this.getBucket()).find({ filename: key }).toArray();
    return files.sort((left, right) => right.uploadDate.getTime() - left.uploadDate.getTime());
  }

  private async findFilesByPrefix(prefix: string): Promise<GridFSFile[]> {
    return (await this.getBucket()).find(this.prefixFilter(prefix)).toArray();
  }

  private prefixFilter(prefix: string): Document {
    const normalizedPrefix = this.normalizePrefix(prefix);
    const filter = normalizedPrefix ? { filename: { $regex: `^${this.escapeRegExp(normalizedPrefix)}` } } : {};
    return filter;
  }

  private async deleteMatchingFiles(key: string): Promise<void> {
    const files = await this.findFilesByFilename(key);
    const pending = await this.findPendingUploads({ filename: key });
    await Promise.all([...files, ...pending].map(file => this.deleteUpload(file._id)));
  }

  private fileToMetaData(file: GridFSFile): {
    contentType?: string;
    contentLength: number;
    etag: string;
    lastModified: Date;
  } {
    const metadata = this.readStoredMetadata(file);
    return {
      contentType: metadata.contentType,
      contentLength: metadata.contentLength ?? file.length,
      etag: this.fileEtag(file),
      lastModified: file.uploadDate,
    };
  }

  private fileEtag(file: GridFSFile): string {
    const idValue = file._id as { toHexString?: () => string; toString: () => string };
    if (typeof idValue?.toHexString === 'function') {
      return idValue.toHexString();
    }
    return createHash('sha1').update(`${file.filename}:${file.uploadDate.toISOString()}:${file.length}`).digest('hex');
  }

  private buildMetadata(options?: GridFSWriteOptions): GridFSMetadata {
    return {
      visibility: options?.visibility ?? this.options.visibility,
      contentType: options?.contentType,
      contentLanguage: options?.contentLanguage,
      contentEncoding: options?.contentEncoding,
      contentDisposition: options?.contentDisposition,
      cacheControl: options?.cacheControl,
      contentLength: options?.contentLength,
    };
  }

  private readStoredMetadata(file: GridFSFile): GridFSMetadata {
    const metadata = file.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }
    return metadata as GridFSMetadata;
  }

  private normalizePrefix(prefix?: string): string {
    if (!prefix || prefix === '/') {
      return '';
    }
    return posix.normalize(prefix).replace(/^\.\//, '').replace(/^\//, '');
  }

  private syntheticUrl(key: string): string {
    return `gridfs://${this.options.datastore}/${this.options.bucketName}/${encodeURIComponent(key)}`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private createNotFoundError(key: string): Error & { code: string } {
    const error = new Error(`GridFS object not found: ${key}`) as Error & { code: string };
    error.code = 'ENOENT';
    return error;
  }

  private async readStreamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk: Buffer | Uint8Array | string) => {
        if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.once('end', () => resolve(Buffer.concat(chunks)));
      stream.once('error', error => reject(error));
    });
  }
}
