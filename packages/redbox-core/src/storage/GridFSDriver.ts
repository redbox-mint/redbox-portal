/// <reference path="../sails.ts" />
import { createHash } from 'node:crypto';
import { basename, posix } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Db, Document, GridFSBucketWriteStreamOptions, GridFSFile, MongoClientOptions, ObjectId } from 'mongodb';
import { GridFSBucket, MongoClient } from 'mongodb';
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

type GridFSBucketLike = {
  find: (filter?: Document) => { toArray: () => Promise<GridFSFile[]> };
  openUploadStream: (filename: string, options?: GridFSBucketWriteStreamOptions) => NodeJS.WritableStream & {
    id?: { toHexString?: () => string; toString: () => string };
  };
  openDownloadStreamByName: (filename: string, options?: { revision?: number }) => NodeJS.ReadableStream;
  delete: (id: ObjectId) => Promise<void>;
};

type GridFSBucketFactory = (db: Db, options: { bucketName: string }) => GridFSBucketLike;
type MongoDbFactory = (options: Required<GridFSDriverOptions>) => Promise<Db>;

export class GridFSDriver {
  private static dbCache: Map<string, Promise<Db>> = new Map();

  public readonly options: Required<GridFSDriverOptions>;

  private readonly bucketFactory: GridFSBucketFactory;
  private readonly dbFactory: MongoDbFactory;
  private cachedBucket: GridFSBucketLike | null = null;

  public constructor(
    options: GridFSDriverOptions = {},
    bucketFactory: GridFSBucketFactory = (db, bucketOptions) => new GridFSBucket(db, bucketOptions),
    dbFactory: MongoDbFactory = (resolvedOptions) => GridFSDriver.connectDb(resolvedOptions)
  ) {
    this.options = GridFSDriver.resolveOptions(options);
    this.bucketFactory = bucketFactory;
    this.dbFactory = dbFactory;
  }

  public async exists(key: string): Promise<boolean> {
    return (await this.findLatestFile(key)) !== null;
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

  public async getMetaData(key: string): Promise<{ contentType?: string; contentLength: number; etag: string; lastModified: Date }> {
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
    const stream = typeof contents === 'string'
      ? Readable.from([contents])
      : Readable.from([Buffer.from(contents)]);
    await this.putStream(key, stream, options);
  }

  public async putStream(key: string, contents: Readable, options?: GridFSWriteOptions): Promise<void> {
    await this.deleteMatchingFiles(key);
    const bucket = await this.getBucket();
    const upload = bucket.openUploadStream(key, {
      metadata: this.buildMetadata(options),
    }) as NodeJS.WritableStream;
    try {
      await pipeline(contents, upload);
    } catch (error) {
      const uploadId = (upload as { id?: ObjectId }).id;
      if (uploadId) {
        try {
          await bucket.delete(uploadId);
        } catch {
          // Best effort cleanup for partial uploads.
        }
      }
      throw error;
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
    const bucket = await this.getBucket();
    await Promise.all(files.map((file) => bucket.delete(file._id)));
  }

  public async listAll(prefix: string, _options?: { recursive?: boolean; paginationToken?: string }): Promise<{
    paginationToken?: string;
    objects: Iterable<ListedObject>;
  }> {
    const files = await this.findFilesByPrefix(prefix);
    const objects = files
      .sort((left, right) => left.filename.localeCompare(right.filename))
      .map((file) => ({
        key: file.filename,
        name: basename(file.filename),
        ...this.fileToMetaData(file),
      }));

    return {
      paginationToken: undefined,
      objects,
    };
  }

  public bucket(bucketName: string): GridFSDriver {
    return new GridFSDriver({ ...this.options, bucketName }, this.bucketFactory, this.dbFactory);
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

    const db = await this.dbFactory(this.options);

    this.cachedBucket = this.bucketFactory(db, { bucketName: this.options.bucketName });
    return this.cachedBucket;
  }

  private static async connectDb(options: Required<GridFSDriverOptions>): Promise<Db> {
    const url = options.url || GridFSDriver.readDatastoreUrl(options.datastore);
    if (!url) {
      throw new Error(`GridFSDriver: datastore '${options.datastore}' does not have a MongoDB URL configured`);
    }

    const cacheKey = `${url}::${options.databaseName}`;
    let dbPromise = GridFSDriver.dbCache.get(cacheKey);
    if (!dbPromise) {
      dbPromise = GridFSDriver.createMongoClientDb(url, options.databaseName).catch((error) => {
        GridFSDriver.dbCache.delete(cacheKey);
        throw error;
      });
      GridFSDriver.dbCache.set(cacheKey, dbPromise);
    }
    return dbPromise;
  }

  private static readDatastoreUrl(datastoreName: string): string {
    const datastores = sails.config?.datastores as Record<string, { url?: string }> | undefined;
    return GridFSDriver.readNonEmptyString(datastores?.[datastoreName]?.url, '');
  }

  private static async createMongoClientDb(url: string, databaseName: string): Promise<Db> {
    const clientOptions: MongoClientOptions = {};
    const client = await MongoClient.connect(url, clientOptions);
    return databaseName ? client.db(databaseName) : client.db();
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
    const normalizedPrefix = this.normalizePrefix(prefix);
    const filter = normalizedPrefix
      ? { filename: { $regex: `^${this.escapeRegExp(normalizedPrefix)}` } }
      : {};
    return (await this.getBucket()).find(filter).toArray();
  }

  private async deleteMatchingFiles(key: string): Promise<void> {
    const files = await this.findFilesByFilename(key);
    const bucket = await this.getBucket();
    await Promise.all(files.map((file) => bucket.delete(file._id)));
  }

  private fileToMetaData(file: GridFSFile): { contentType?: string; contentLength: number; etag: string; lastModified: Date } {
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
      stream.once('error', (error) => reject(error));
    });
  }
}
