import { registerPersistenceResource, mongoDatabase, mongoResourceDatabase } from '../persistence/runtime';
/// <reference path="../sails.ts" />
import { createHash } from 'node:crypto';
import { basename, posix } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { writeGridFSStream } from './writeGridFSStream';
import { ownGridFSDownload } from './ownGridFSDownload';
import type { Db, Document, GridFSBucketWriteStreamOptions, GridFSFile, ObjectId } from 'mongodb';
import { GridFSBucket } from 'mongodb';
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
  openUploadStream: (
    filename: string,
    options?: GridFSBucketWriteStreamOptions
  ) => NodeJS.WritableStream & {
    id?: { toHexString?: () => string; toString: () => string };
  };
  openDownloadStreamByName: (filename: string, options?: { revision?: number }) => NodeJS.ReadableStream;
  delete: (id: ObjectId) => Promise<void>;
};

type GridFSBucketFactory = (db: Db, options: { bucketName: string }) => GridFSBucketLike;
type MongoDbFactory = (options: Required<GridFSDriverOptions>) => Promise<Db>;
const gridfsCacheKey: unique symbol = Symbol.for('@researchdatabox/redbox-core/gridfs/v1');
interface GridFSCache {
  connections: Map<string, Promise<Db>>;
  active: Set<Promise<unknown>>;
  registered: boolean;
  closing: boolean;
  closed: boolean;
}
type GridFSApplication = Sails.Application & { [gridfsCacheKey]?: GridFSCache };

export class GridFSDriver {
  private static offlineState?: GridFSCache;
  private readonly state: GridFSCache;

  private static stateFor(app?: Sails.Application): GridFSCache {
    const create = (registered = false): GridFSCache => ({
      connections: new Map(),
      active: new Set(),
      registered,
      closing: false,
      closed: false,
    });
    if (!app) {
      if (!this.offlineState || this.offlineState.closed) this.offlineState = create();
      return this.offlineState;
    }
    const holder = app as GridFSApplication;
    if (!holder[gridfsCacheKey]) Object.defineProperty(holder, gridfsCacheKey, { value: create(), writable: true });
    if (holder[gridfsCacheKey]!.closed) holder[gridfsCacheKey] = create(holder[gridfsCacheKey]!.registered);
    const state = holder[gridfsCacheKey]!;
    if (!state.registered) {
      registerPersistenceResource(app, 'gridfs', {
        drain: () => GridFSDriver.drain(app),
        close: async () => {
          await GridFSDriver.dispose(app);
          holder[gridfsCacheKey]!.registered = false;
        },
      });
      state.registered = true;
    }
    return state;
  }

  public readonly options: Required<GridFSDriverOptions>;

  private readonly bucketFactory: GridFSBucketFactory;
  private readonly dbFactory: MongoDbFactory;
  private cachedBucket: GridFSBucketLike | null = null;

  public constructor(
    options: GridFSDriverOptions = {},
    bucketFactory: GridFSBucketFactory = (db, bucketOptions) => new GridFSBucket(db, bucketOptions),
    dbFactory: MongoDbFactory = resolvedOptions => GridFSDriver.connectDb(resolvedOptions, this.state, this.app),
    private readonly app = typeof sails === 'undefined' ? undefined : sails
  ) {
    this.options = GridFSDriver.resolveOptions(options);
    this.bucketFactory = bucketFactory;
    this.dbFactory = dbFactory;
    this.state = GridFSDriver.stateFor(app);
  }

  public async exists(key: string): Promise<boolean> {
    return this.operation(async () => {
      return (await this.findLatestFile(key)) !== null;
    });
  }

  public async get(key: string): Promise<string> {
    return this.operation(async () => {
      const bytes = await this.readBytes(key);
      return Buffer.from(bytes).toString('utf8');
    });
  }

  public async getStream(key: string): Promise<Readable> {
    return this.operation(() => this.openStream(key));
  }
  private async openStream(key: string): Promise<Readable> {
    await this.requireLatestFile(key);
    const stream = (await this.getBucket()).openDownloadStreamByName(key, { revision: -1 }) as Readable & {
      abort?: () => Promise<void>;
    };
    // GridFS destroy/close does not close its cursor. Keep cursor cleanup owned
    // after cancellation/errors, and await it before allowing client disposal.
    this.track(ownGridFSDownload(stream));
    return stream;
  }

  public async getBytes(key: string): Promise<Uint8Array> {
    return this.operation(() => this.readBytes(key));
  }
  private async readBytes(key: string): Promise<Uint8Array> {
    const stream = await this.openStream(key);
    const buffer = await this.readStreamToBuffer(stream);
    return new Uint8Array(buffer);
  }

  public async getMetaData(
    key: string
  ): Promise<{ contentType?: string; contentLength: number; etag: string; lastModified: Date }> {
    return this.operation(async () => {
      const file = await this.requireLatestFile(key);
      return this.fileToMetaData(file);
    });
  }

  public async getVisibility(key: string): Promise<'public' | 'private'> {
    return this.operation(async () => {
      const file = await this.requireLatestFile(key);
      const metadata = this.readStoredMetadata(file);
      return metadata.visibility ?? this.options.visibility;
    });
  }

  public async getUrl(key: string): Promise<string> {
    return this.operation(async () => {
      await this.requireLatestFile(key);
      return this.syntheticUrl(key);
    });
  }

  public async getSignedUrl(key: string, _options?: Record<string, unknown>): Promise<string> {
    return this.operation(async () => {
      await this.requireLatestFile(key);
      return this.syntheticUrl(key);
    });
  }

  public async getSignedUploadUrl(key: string, _options?: Record<string, unknown>): Promise<string> {
    return this.operation(async () => {
      return this.syntheticUrl(key);
    });
  }

  public async setVisibility(key: string, _visibility: Visibility): Promise<void> {
    return this.operation(async () => {
      await this.requireLatestFile(key);
      throw new Error('GridFSDriver: visibility changes are not supported');
    });
  }

  public async put(key: string, contents: string | Uint8Array, options?: GridFSWriteOptions): Promise<void> {
    return this.operation(async () => {
      const stream = typeof contents === 'string' ? Readable.from([contents]) : Readable.from([Buffer.from(contents)]);
      await this.writeStream(key, stream, options);
    });
  }

  public async putStream(key: string, contents: Readable, options?: GridFSWriteOptions): Promise<void> {
    return this.operation(() => this.writeStream(key, contents, options));
  }
  private async writeStream(key: string, contents: Readable, options?: GridFSWriteOptions): Promise<void> {
    await this.deleteMatchingFiles(key);
    const bucket = await this.getBucket();
    const upload = bucket.openUploadStream(key, {
      metadata: this.buildMetadata(options),
    }) as Writable & { chunkSizeBytes?: number };
    try {
      await writeGridFSStream(contents, upload, upload.chunkSizeBytes ?? 255 * 1024);
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
    return this.operation(() => this.copyFile(source, destination, options));
  }
  private async copyFile(source: string, destination: string, options?: GridFSWriteOptions): Promise<void> {
    if (source === destination) {
      return;
    }

    const sourceFile = await this.requireLatestFile(source);
    const sourceStream = await this.openStream(source);
    try {
      await this.writeStream(destination, sourceStream, {
        ...this.readStoredMetadata(sourceFile),
        ...options,
      });
    } finally {
      // This stream is internal to the copy. Destination preparation can fail
      // before pipeline takes ownership, so always release it for disposal.
      sourceStream.destroy();
    }
  }

  public async move(source: string, destination: string, options?: GridFSWriteOptions): Promise<void> {
    return this.operation(async () => {
      if (source === destination) {
        return;
      }

      await this.copyFile(source, destination, options);
      await this.deleteMatchingFiles(source);
    });
  }

  public async delete(key: string): Promise<void> {
    return this.operation(async () => {
      await this.deleteMatchingFiles(key);
    });
  }

  public async deleteAll(prefix: string): Promise<void> {
    return this.operation(async () => {
      const files = await this.findFilesByPrefix(prefix);
      const bucket = await this.getBucket();
      await Promise.all(files.map(file => this.track(bucket.delete(file._id))));
    });
  }

  public async listAll(
    prefix: string,
    _options?: { recursive?: boolean; paginationToken?: string }
  ): Promise<{
    paginationToken?: string;
    objects: Iterable<ListedObject>;
  }> {
    return this.operation(async () => {
      const files = await this.findFilesByPrefix(prefix);
      const objects = files
        .sort((left, right) => left.filename.localeCompare(right.filename))
        .map(file => ({
          key: file.filename,
          name: basename(file.filename),
          ...this.fileToMetaData(file),
        }));

      return {
        paginationToken: undefined,
        objects,
      };
    });
  }

  public bucket(bucketName: string): GridFSDriver {
    if (this.state.closing || this.state.closed) throw new Error('GridFSDriver: storage is draining or closed');
    return new GridFSDriver({ ...this.options, bucketName }, this.bucketFactory, this.dbFactory, this.app);
  }

  private static async drain(app?: Sails.Application): Promise<void> {
    const state = app ? (app as GridFSApplication)[gridfsCacheKey] : this.offlineState;
    if (!state) return;
    state.closing = true;
    // An accepted getStream may register its stream while its own promise settles.
    while (state.active.size) await Promise.allSettled(state.active);
  }

  public static async dispose(app?: Sails.Application): Promise<void> {
    const state = app ? (app as GridFSApplication)[gridfsCacheKey] : this.offlineState;
    if (!state) return;
    await this.drain(app);
    await Promise.allSettled(state.connections.values());
    state.connections.clear();
    state.closed = true;
  }

  private operation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.closing || this.state.closed)
      return Promise.reject(new Error('GridFSDriver: storage is draining or closed'));
    return this.track(Promise.resolve().then(operation));
  }

  private track<T>(pending: Promise<T>): Promise<T> {
    this.state.active.add(pending);
    void pending.then(
      () => this.state.active.delete(pending),
      () => this.state.active.delete(pending)
    );
    return pending;
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

  private static async connectDb(
    options: Required<GridFSDriverOptions>,
    state: GridFSCache,
    app?: Sails.Application
  ): Promise<Db> {
    if (!app) throw new Error('GridFSDriver requires an application-owned persistence runtime.');
    const key = createHash('sha256')
      .update(JSON.stringify([options.url, options.datastore, options.databaseName]))
      .digest('hex');
    let pending = state.connections.get(key);
    if (!pending) {
      pending = options.url
        ? mongoResourceDatabase(app, 'gridfs:' + key, {
            mongoUrl: options.url,
            ...(options.databaseName ? { dbName: options.databaseName } : {}),
          })
        : mongoDatabase(app, options.datastore).then(db =>
            options.databaseName ? db.client.db(options.databaseName) : db
          );
      state.connections.set(key, pending);
      void pending.catch(() => state.connections.delete(key));
    }
    return pending;
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
    const filter = normalizedPrefix ? { filename: { $regex: `^${this.escapeRegExp(normalizedPrefix)}` } } : {};
    return (await this.getBucket()).find(filter).toArray();
  }

  private async deleteMatchingFiles(key: string): Promise<void> {
    const files = await this.findFilesByFilename(key);
    const bucket = await this.getBucket();
    await Promise.all(files.map(file => this.track(bucket.delete(file._id))));
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
